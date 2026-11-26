import crypto from 'crypto';
import {
  PRO_TRIAL_DAYS,
  type BillingInterval,
  type BillingStatus,
  type HouseholdBilling,
} from '../utils/billing';
import { HttpError, mutate, type Store } from './store';

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  priceMonthly: string;
  priceAnnual: string;
  priceLifetime: string;
  appUrl: string;
}

export function readStripeConfig(env: NodeJS.ProcessEnv = process.env): StripeConfig {
  return {
    secretKey: (env.STRIPE_SECRET_KEY || '').trim(),
    webhookSecret: (env.STRIPE_WEBHOOK_SECRET || '').trim(),
    priceMonthly: (env.STRIPE_PRICE_MONTHLY || '').trim(),
    priceAnnual: (env.STRIPE_PRICE_ANNUAL || '').trim(),
    priceLifetime: (env.STRIPE_PRICE_LIFETIME || '').trim(),
    appUrl: (env.APP_URL || '').trim().replace(/\/+$/, ''),
  };
}

export function isStripeConfigured(cfg: StripeConfig): boolean {
  return Boolean(cfg.secretKey && (cfg.priceMonthly || cfg.priceAnnual || cfg.priceLifetime));
}

export function priceIdForInterval(cfg: StripeConfig, interval: BillingInterval): string {
  if (interval === 'monthly') return cfg.priceMonthly;
  if (interval === 'annual') return cfg.priceAnnual;
  return cfg.priceLifetime;
}

/**
 * Verifies Stripe's `Stripe-Signature` header (`t=timestamp,v1=hmac_hex`) using HMAC-SHA256
 * with constant-time comparison and a 5-minute replay tolerance.
 */
export function verifyStripeWebhookSignature(
  rawBody: string,
  sigHeader: string | undefined,
  secret: string,
  nowSec = Math.floor(Date.now() / 1000)
): boolean {
  if (!sigHeader || !secret) return false;
  let timestamp = '';
  const signatures: string[] = [];
  for (const part of sigHeader.split(',')) {
    const [k, v] = part.split('=');
    if (!k || !v) continue;
    if (k.trim() === 't') timestamp = v.trim();
    if (k.trim() === 'v1') signatures.push(v.trim());
  }
  const tsNum = Number(timestamp);
  if (!timestamp || !Number.isFinite(tsNum) || signatures.length === 0) return false;
  if (Math.abs(nowSec - tsNum) > 300) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'hex');

  for (const sig of signatures) {
    if (!/^[0-9a-f]+$/i.test(sig) || sig.length !== expected.length) continue;
    const sigBuf = Buffer.from(sig, 'hex');
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}

async function stripePost(
  cfg: StripeConfig,
  endpoint: string,
  params: Record<string, string>,
  fetchImpl: typeof fetch = fetch
): Promise<any> {
  const body = new URLSearchParams(params);
  const res = await fetchImpl(`https://api.stripe.com/v1${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || `Stripe request failed (${res.status})`;
    throw new HttpError(502, { error: msg });
  }
  return json;
}

export async function createStripeCheckoutSession(input: {
  cfg: StripeConfig;
  householdId: string;
  interval: BillingInterval;
  customerEmail?: string;
  customerId?: string;
  originUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<{ id: string; url: string }> {
  const priceId = priceIdForInterval(input.cfg, input.interval);
  if (!input.cfg.secretKey || !priceId) {
    throw new HttpError(503, {
      billingUnavailable: true,
      error: 'Stripe checkout is not configured on this server yet.',
    });
  }

  const base = input.cfg.appUrl || input.originUrl;
  const isLifetime = input.interval === 'lifetime';
  const params: Record<string, string> = {
    mode: isLifetime ? 'payment' : 'subscription',
    'line_items[0][price]': priceId,
    'line_items[0][quantity]': '1',
    success_url: `${base}/?billing=success&plan=${input.interval}`,
    cancel_url: `${base}/?billing=canceled`,
    client_reference_id: input.householdId,
    'metadata[householdId]': input.householdId,
    'metadata[interval]': input.interval,
    allow_promotion_codes: 'true',
  };

  if (input.customerId) {
    params.customer = input.customerId;
  } else if (input.customerEmail) {
    params.customer_email = input.customerEmail;
  }

  if (!isLifetime) {
    params['subscription_data[trial_period_days]'] = String(PRO_TRIAL_DAYS);
    params['subscription_data[metadata][householdId]'] = input.householdId;
    params['subscription_data[metadata][interval]'] = input.interval;
  }

  const session = await stripePost(input.cfg, '/checkout/sessions', params, input.fetchImpl);
  if (!session?.url) throw new HttpError(502, { error: 'Stripe did not return a checkout URL.' });
  return { id: String(session.id || ''), url: String(session.url) };
}

export async function createStripePortalSession(input: {
  cfg: StripeConfig;
  customerId: string;
  originUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<{ url: string }> {
  if (!input.cfg.secretKey) {
    throw new HttpError(503, { error: 'Stripe billing portal is not configured on this server yet.' });
  }
  const base = input.cfg.appUrl || input.originUrl;
  const portal = await stripePost(
    input.cfg,
    '/billing_portal/sessions',
    {
      customer: input.customerId,
      return_url: `${base}/?billing=portal`,
    },
    input.fetchImpl
  );
  if (!portal?.url) throw new HttpError(502, { error: 'Stripe did not return a portal URL.' });
  return { url: String(portal.url) };
}

function unixToIso(ts: unknown): string | undefined {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000).toISOString();
}

function mapStripeStatus(raw: unknown): BillingStatus {
  const s = String(raw || '').toLowerCase();
  if (s === 'trialing') return 'trialing';
  if (s === 'active') return 'active';
  if (s === 'past_due' || s === 'unpaid') return 'past_due';
  if (s === 'canceled' || s === 'incomplete_expired') return 'canceled';
  return 'free';
}

/**
 * Applies a verified Stripe webhook event to the target Household's billing state.
 */
export async function applyStripeWebhookEvent(event: any, store: Store): Promise<{ handled: boolean; householdId?: string }> {
  const type = String(event?.type || '');
  const obj = event?.data?.object;
  if (!obj || typeof obj !== 'object') return { handled: false };

  const householdId = String(obj.metadata?.householdId || obj.client_reference_id || '').trim();
  if (!householdId) return { handled: false };

  const existing = await store.get(householdId);
  if (!existing) return { handled: false, householdId };

  if (type === 'checkout.session.completed') {
    const interval = (obj.metadata?.interval as BillingInterval) || (obj.mode === 'payment' ? 'lifetime' : 'monthly');
    const customerId = typeof obj.customer === 'string' ? obj.customer : undefined;
    const subscriptionId = typeof obj.subscription === 'string' ? obj.subscription : undefined;

    await mutate(store, householdId, (h) => {
      const prev: HouseholdBilling | undefined = h.billing;
      if (interval === 'lifetime' || obj.mode === 'payment') {
        h.billing = {
          ...prev,
          plan: 'lifetime',
          status: 'lifetime',
          interval: 'lifetime',
          ...(customerId ? { stripeCustomerId: customerId } : {}),
        };
      } else {
        h.billing = {
          ...prev,
          plan: 'pro',
          status: 'active',
          interval,
          ...(customerId ? { stripeCustomerId: customerId } : {}),
          ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        };
      }
    });
    return { handled: true, householdId };
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.created') {
    const status = mapStripeStatus(obj.status);
    const interval = (obj.metadata?.interval as BillingInterval) || undefined;
    const customerId = typeof obj.customer === 'string' ? obj.customer : undefined;
    const subscriptionId = typeof obj.id === 'string' ? obj.id : undefined;
    const currentPeriodEnd = unixToIso(obj.current_period_end);
    const trialEndsAt = unixToIso(obj.trial_end);
    const cancelAtPeriodEnd = Boolean(obj.cancel_at_period_end);

    await mutate(store, householdId, (h) => {
      const prev = h.billing;
      if (prev?.plan === 'lifetime') return;
      h.billing = {
        ...prev,
        plan: status === 'active' || status === 'trialing' ? 'pro' : 'free',
        status,
        ...(interval ? { interval } : {}),
        ...(customerId ? { stripeCustomerId: customerId } : {}),
        ...(subscriptionId ? { stripeSubscriptionId: subscriptionId } : {}),
        ...(currentPeriodEnd ? { currentPeriodEnd } : {}),
        ...(trialEndsAt ? { trialEndsAt } : {}),
        cancelAtPeriodEnd,
      };
    });
    return { handled: true, householdId };
  }

  if (type === 'customer.subscription.deleted') {
    await mutate(store, householdId, (h) => {
      const prev = h.billing;
      if (prev?.plan === 'lifetime') return;
      h.billing = {
        ...prev,
        plan: 'free',
        status: 'canceled',
        cancelAtPeriodEnd: false,
      };
    });
    return { handled: true, householdId };
  }

  if (type === 'invoice.payment_failed') {
    await mutate(store, householdId, (h) => {
      const prev = h.billing;
      if (prev?.plan === 'lifetime') return;
      h.billing = {
        ...prev,
        plan: prev?.plan ?? 'free',
        status: 'past_due',
      };
    });
    return { handled: true, householdId };
  }

  return { handled: false, householdId };
}
