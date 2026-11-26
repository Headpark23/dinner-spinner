import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  FREE_MONTHLY_AI_SCANS,
  LIFETIME_MONTHLY_AI_SCANS,
  incrementAiUsage,
  isOwnerHousehold,
  resolveEntitlement,
} from './billing';
import {
  applyStripeWebhookEvent,
  verifyStripeWebhookSignature,
} from '../server/billing';
import { createFileStore } from '../server/store';
import {
  buildAffiliateClickUrl,
  calendarDealsForDate,
  isAllowedAffiliateUrl,
  rankDealsForChannel,
} from './deliveryDeals';
import { parseAwinPromotions } from '../server/dealsFeed';

test('owner allowlist unlocks Pro free forever by email or household id', () => {
  assert.equal(
    isOwnerHousehold({
      householdId: 'h_abc123',
      googleEmails: ['partner@example.com'],
      ownerEmailsEnv: 'owner@example.com, PARTNER@example.com ',
    }),
    true
  );
  assert.equal(
    isOwnerHousehold({
      householdId: 'h_owner99',
      googleEmails: ['someone@else.com'],
      ownerHouseholdsEnv: 'h_owner99',
    }),
    true
  );
  assert.equal(
    isOwnerHousehold({
      householdId: 'h_regular',
      googleEmails: ['customer@example.com'],
      ownerEmailsEnv: 'owner@example.com,partner@example.com',
    }),
    false
  );

  const ent = resolveEntitlement({
    billing: undefined,
    isOwner: true,
    billingConfigured: true,
  });
  assert.equal(ent.isPro, true);
  assert.equal(ent.isOwner, true);
  assert.equal(ent.plan, 'owner');
  assert.equal(ent.aiScansLimit, null);
  assert.equal(ent.canUseAiChef, true);
  assert.equal(ent.canUseAiScan, true);
});

test('free tier enforces 3 monthly AI scans when Stripe is configured, stays unlocked in local dev', () => {
  const localDev = resolveEntitlement({
    billing: undefined,
    isOwner: false,
    billingConfigured: false,
  });
  assert.equal(localDev.canUseAiChef, true);
  assert.equal(localDev.canUseAiScan, true);

  let billing = undefined;
  const now = new Date('2026-11-26T12:00:00Z');
  for (let i = 0; i < FREE_MONTHLY_AI_SCANS; i++) {
    const before = resolveEntitlement({ billing, isOwner: false, billingConfigured: true, now });
    assert.equal(before.canUseAiScan, true);
    assert.equal(before.canUseAiChef, false);
    billing = incrementAiUsage(billing, now);
  }
  const exhausted = resolveEntitlement({ billing, isOwner: false, billingConfigured: true, now });
  assert.equal(exhausted.aiScansUsed, FREE_MONTHLY_AI_SCANS);
  assert.equal(exhausted.canUseAiScan, false);

  // Next month resets quota automatically
  const nextMonth = new Date('2026-12-01T00:05:00Z');
  const reset = resolveEntitlement({ billing, isOwner: false, billingConfigured: true, now: nextMonth });
  assert.equal(reset.aiScansUsed, 0);
  assert.equal(reset.canUseAiScan, true);
});

test('Stripe webhook signature verification validates HMAC and rejects tampered or stale payloads', () => {
  const secret = 'whsec_test_secret_123';
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed' });
  const nowSec = 1_760_000_000;
  const sig = crypto.createHmac('sha256', secret).update(`${nowSec}.${payload}`, 'utf8').digest('hex');

  assert.equal(verifyStripeWebhookSignature(payload, `t=${nowSec},v1=${sig}`, secret, nowSec + 30), true);
  assert.equal(verifyStripeWebhookSignature(payload + ' ', `t=${nowSec},v1=${sig}`, secret, nowSec + 30), false);
  assert.equal(verifyStripeWebhookSignature(payload, `t=${nowSec},v1=${sig}`, secret, nowSec + 600), false);
});

test('Stripe webhook events activate subscription, lifetime pass, and protect lifetime from subscription delete', async () => {
  const store = createFileStore(null);
  await store.put('h_sub', {
    keyHash: 'abc',
    createdAt: new Date().toISOString(),
    snapshotAt: null,
    shopping: { version: 0, items: [] },
  });

  // 1. Annual checkout completed
  const r1 = await applyStripeWebhookEvent(
    {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          customer: 'cus_123',
          subscription: 'sub_123',
          metadata: { householdId: 'h_sub', interval: 'annual' },
        },
      },
    },
    store
  );
  assert.equal(r1.handled, true);
  let h = await store.get('h_sub');
  assert.equal(h?.billing?.plan, 'pro');
  assert.equal(h?.billing?.interval, 'annual');

  // 2. Lifetime one-off checkout completed
  const r2 = await applyStripeWebhookEvent(
    {
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'payment',
          customer: 'cus_123',
          metadata: { householdId: 'h_sub', interval: 'lifetime' },
        },
      },
    },
    store
  );
  assert.equal(r2.handled, true);
  h = await store.get('h_sub');
  assert.equal(h?.billing?.plan, 'lifetime');
  const lifeEnt = resolveEntitlement({ billing: h?.billing, isOwner: false, billingConfigured: true });
  assert.equal(lifeEnt.isPro, true);
  assert.equal(lifeEnt.aiScansLimit, LIFETIME_MONTHLY_AI_SCANS);

  // 3. Old subscription deleted must NOT downgrade a Lifetime pass
  await applyStripeWebhookEvent(
    {
      type: 'customer.subscription.deleted',
      data: { object: { metadata: { householdId: 'h_sub' } } },
    },
    store
  );
  h = await store.get('h_sub');
  assert.equal(h?.billing?.plan, 'lifetime');
});

test('meal-kit affiliate deals parse from Awin and click URLs enforce strict host allowlist', () => {
  const cal = calendarDealsForDate(new Date('2026-11-26T12:00:00Z'));
  const mealkits = rankDealsForChannel(cal, 'mealkit');
  assert.ok(mealkits.ranked.some((d) => d.providerId === 'gousto'));
  assert.ok(mealkits.ranked.some((d) => d.providerId === 'hellofresh'));
  assert.ok(mealkits.ranked.some((d) => d.providerId === 'mindfulchef'));

  const awin = parseAwinPromotions([
    {
      promotionId: 'mk1',
      status: 'active',
      advertiser: { name: 'Gousto UK' },
      title: '60% off your first Gousto box + 25% off for 2 months',
      voucher: { code: 'GOUSTO60' },
      urlTracking: 'https://www.awin1.com/cread.php?awinmid=1234&awinaffid=5678',
    },
  ]);
  assert.equal(awin.length, 1);
  assert.equal(awin[0].channel, 'mealkit');
  assert.equal(awin[0].isAffiliate, true);

  const clickUrl = buildAffiliateClickUrl(awin[0]);
  assert.ok(clickUrl && clickUrl.startsWith('/api/deals/click?'));
  assert.equal(isAllowedAffiliateUrl('https://www.awin1.com/cread.php?x=1'), true);
  assert.equal(isAllowedAffiliateUrl('https://www.gousto.co.uk/'), true);
  assert.equal(isAllowedAffiliateUrl('https://evil.example.com/phish'), false);
  assert.equal(isAllowedAffiliateUrl('javascript:alert(1)'), false);
});
