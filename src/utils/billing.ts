/**
 * Household Pro billing model, pricing catalog, owner allowlist bypass,
 * and monthly AI scan quota helpers.
 */

export type BillingPlan = 'free' | 'pro' | 'lifetime';
export type BillingInterval = 'monthly' | 'annual' | 'lifetime';
export type BillingStatus = 'free' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'lifetime';

export interface HouseholdBilling {
  plan: BillingPlan;
  status: BillingStatus;
  interval?: BillingInterval;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  currentPeriodEnd?: string;
  trialEndsAt?: string;
  cancelAtPeriodEnd?: boolean;
  aiUsage?: {
    /** YYYY-MM in UTC */
    month: string;
    scans: number;
  };
}

export interface BillingEntitlement {
  isPro: boolean;
  isOwner: boolean;
  /** True when Stripe billing is active on the server; local dev without keys stays unlocked. */
  billingConfigured: boolean;
  plan: BillingPlan | 'owner';
  status: BillingStatus | 'owner';
  interval?: BillingInterval;
  currentPeriodEnd?: string;
  trialEndsAt?: string;
  cancelAtPeriodEnd?: boolean;
  hasPortal: boolean;
  aiScansUsed: number;
  /** Null means unlimited. */
  aiScansLimit: number | null;
  canUseAiScan: boolean;
  canUseAiChef: boolean;
  canUseWeekPlanner: boolean;
  canUseFamilySync: boolean;
}

export interface PlanOffer {
  id: BillingInterval;
  name: string;
  priceGbp: string;
  cadence: string;
  badge?: string;
  summary: string;
  trialDays?: number;
}

export const FREE_MONTHLY_AI_SCANS = 3;
export const LIFETIME_MONTHLY_AI_SCANS = 60;
export const PRO_TRIAL_DAYS = 7;

export const PRO_PLANS: PlanOffer[] = [
  {
    id: 'annual',
    name: 'Household Pro · Yearly',
    priceGbp: '£24.99',
    cadence: '/ year',
    badge: 'Best value · Save 30%',
    summary: '7-day free trial. Covers every phone in your family group.',
    trialDays: PRO_TRIAL_DAYS,
  },
  {
    id: 'monthly',
    name: 'Household Pro · Monthly',
    priceGbp: '£2.99',
    cadence: '/ month',
    summary: '7-day free trial. Cancel anytime in two taps.',
    trialDays: PRO_TRIAL_DAYS,
  },
  {
    id: 'lifetime',
    name: 'Lifetime Founder Pass',
    priceGbp: '£39.99',
    cadence: 'one-off',
    badge: 'No subscription',
    summary: `Pay once for your household. Includes ${LIFETIME_MONTHLY_AI_SCANS} AI scans/month.`,
  },
];

export function currentUsageMonth(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function parseCsvSet(raw?: string): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\n]/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

/**
 * Owner bypass: grants permanent free Pro access if either the household ID or any
 * signed-in Google email in the household matches PRO_OWNER_HOUSEHOLDS / PRO_OWNER_EMAILS.
 */
export function isOwnerHousehold(input: {
  householdId?: string | null;
  googleEmails?: string[];
  ownerEmailsEnv?: string;
  ownerHouseholdsEnv?: string;
}): boolean {
  const ownerHouseholds = parseCsvSet(input.ownerHouseholdsEnv);
  if (input.householdId && ownerHouseholds.has(input.householdId.trim().toLowerCase())) {
    return true;
  }
  const ownerEmails = parseCsvSet(input.ownerEmailsEnv);
  if (ownerEmails.size > 0 && Array.isArray(input.googleEmails)) {
    for (const email of input.googleEmails) {
      if (email && ownerEmails.has(email.trim().toLowerCase())) return true;
    }
  }
  return false;
}

export function getAiScansUsed(billing: HouseholdBilling | undefined, now = new Date()): number {
  const month = currentUsageMonth(now);
  if (!billing?.aiUsage || billing.aiUsage.month !== month) return 0;
  return Math.max(0, Math.floor(billing.aiUsage.scans || 0));
}

export function incrementAiUsage(billing: HouseholdBilling | undefined, now = new Date()): HouseholdBilling {
  const month = currentUsageMonth(now);
  const current = getAiScansUsed(billing, now);
  return {
    plan: billing?.plan ?? 'free',
    status: billing?.status ?? 'free',
    ...billing,
    aiUsage: { month, scans: current + 1 },
  };
}

/**
 * Resolves a household's live entitlements.
 * - Owners always get unlimited Pro access free forever.
 * - When Stripe is not configured (e.g. local dev), features stay unlocked so development works smoothly.
 */
export function resolveEntitlement(input: {
  billing?: HouseholdBilling;
  isOwner: boolean;
  billingConfigured: boolean;
  now?: Date;
}): BillingEntitlement {
  const now = input.now ?? new Date();
  const b = input.billing;
  const used = getAiScansUsed(b, now);
  const hasPortal = Boolean(b?.stripeCustomerId);

  if (input.isOwner) {
    return {
      isPro: true,
      isOwner: true,
      billingConfigured: input.billingConfigured,
      plan: 'owner',
      status: 'owner',
      hasPortal,
      aiScansUsed: used,
      aiScansLimit: null,
      canUseAiScan: true,
      canUseAiChef: true,
      canUseWeekPlanner: true,
      canUseFamilySync: true,
    };
  }

  const isLifetime = b?.plan === 'lifetime' || b?.status === 'lifetime';
  const periodEndMs = b?.currentPeriodEnd ? Date.parse(b.currentPeriodEnd) : NaN;
  const notExpired = Number.isNaN(periodEndMs) || periodEndMs > now.getTime();
  const isActiveSub =
    (b?.status === 'active' || b?.status === 'trialing') && b?.plan === 'pro' && notExpired;

  if (isLifetime) {
    return {
      isPro: true,
      isOwner: false,
      billingConfigured: input.billingConfigured,
      plan: 'lifetime',
      status: 'lifetime',
      interval: 'lifetime',
      hasPortal,
      aiScansUsed: used,
      aiScansLimit: LIFETIME_MONTHLY_AI_SCANS,
      canUseAiScan: !input.billingConfigured || used < LIFETIME_MONTHLY_AI_SCANS,
      canUseAiChef: true,
      canUseWeekPlanner: true,
      canUseFamilySync: true,
    };
  }

  if (isActiveSub) {
    return {
      isPro: true,
      isOwner: false,
      billingConfigured: input.billingConfigured,
      plan: 'pro',
      status: b!.status,
      interval: b!.interval,
      currentPeriodEnd: b!.currentPeriodEnd,
      trialEndsAt: b!.trialEndsAt,
      cancelAtPeriodEnd: b!.cancelAtPeriodEnd,
      hasPortal,
      aiScansUsed: used,
      aiScansLimit: null,
      canUseAiScan: true,
      canUseAiChef: true,
      canUseWeekPlanner: true,
      canUseFamilySync: true,
    };
  }

  // Free tier (or unconfigured local dev)
  const unlockedByLocalDev = !input.billingConfigured;
  return {
    isPro: unlockedByLocalDev,
    isOwner: false,
    billingConfigured: input.billingConfigured,
    plan: 'free',
    status: b?.status === 'past_due' ? 'past_due' : 'free',
    currentPeriodEnd: b?.currentPeriodEnd,
    hasPortal,
    aiScansUsed: used,
    aiScansLimit: FREE_MONTHLY_AI_SCANS,
    canUseAiScan: unlockedByLocalDev || used < FREE_MONTHLY_AI_SCANS,
    canUseAiChef: unlockedByLocalDev,
    canUseWeekPlanner: unlockedByLocalDev,
    canUseFamilySync: unlockedByLocalDev,
  };
}
