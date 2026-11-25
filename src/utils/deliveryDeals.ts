/**
 * Daily UK delivery deals engine: combines reliable day-of-week platform deals,
 * optional live affiliate voucher feeds (e.g. Awin Promotions API), and household-pinned
 * targeted codes so families can see at a glance which delivery firm wins tonight.
 */

export type DeliveryProviderId =
  | 'justeat'
  | 'deliveroo'
  | 'ubereats'
  | 'tesco'
  | 'sainsburys'
  | 'asda'
  | 'morrisons'
  | 'ocado'
  | 'waitrose';

export type DealChannel = 'takeaway' | 'grocery';

export type DealEligibility = 'everyone' | 'first-order' | 'perk' | 'household';

export interface DeliveryDeal {
  id: string;
  providerId: DeliveryProviderId;
  providerName: string;
  channel: DealChannel;
  headline: string;
  detail: string;
  code?: string;
  minSpend?: string;
  eligibility: DealEligibility;
  source: 'calendar' | 'live' | 'household';
  activeToday: boolean;
  score: number;
  url?: string;
  /** True when the link carries affiliate tracking (requires clear UK ASA "Ad" disclosure). */
  isAffiliate?: boolean;
  expiresAt?: string;
  postedBy?: string;
}

export interface HouseholdDealPin {
  id: string;
  providerId: DeliveryProviderId;
  channel: DealChannel;
  headline: string;
  code?: string;
  postedBy: string;
  createdAt: string;
  expiresAt: string;
}

export const PROVIDER_NAMES: Record<DeliveryProviderId, string> = {
  justeat: 'Just Eat',
  deliveroo: 'Deliveroo',
  ubereats: 'Uber Eats',
  tesco: 'Tesco',
  sainsburys: 'Sainsbury’s',
  asda: 'Asda',
  morrisons: 'Morrisons',
  ocado: 'Ocado',
  waitrose: 'Waitrose',
};

export const TAKEAWAY_PROVIDERS: DeliveryProviderId[] = ['justeat', 'deliveroo', 'ubereats'];
export const GROCERY_PROVIDERS: DeliveryProviderId[] = [
  'tesco',
  'sainsburys',
  'asda',
  'morrisons',
  'ocado',
  'waitrose',
  'ubereats',
  'justeat',
];

const VALID_PROVIDERS = new Set<string>(Object.keys(PROVIDER_NAMES));

export function isProviderId(v: unknown): v is DeliveryProviderId {
  return typeof v === 'string' && VALID_PROVIDERS.has(v);
}

/** Sanitises an incoming household deal pin from client or server storage. */
export function cleanDealPin(raw: unknown, now = new Date()): HouseholdDealPin | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isProviderId(r.providerId)) return null;
  const channel: DealChannel = r.channel === 'grocery' ? 'grocery' : 'takeaway';
  const headline = String(r.headline || '').trim().slice(0, 90);
  if (!headline) return null;
  const code = String(r.code || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .slice(0, 32);
  const postedBy = String(r.postedBy || 'Someone').trim().slice(0, 40) || 'Someone';
  const id = String(r.id || '').trim().slice(0, 60);
  if (!id) return null;
  const createdAt =
    typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt))
      ? r.createdAt
      : now.toISOString();
  const defaultExpiry = new Date(now.getTime() + 24 * 3600 * 1000).toISOString();
  const expiresAt =
    typeof r.expiresAt === 'string' && !Number.isNaN(Date.parse(r.expiresAt))
      ? r.expiresAt
      : defaultExpiry;
  return {
    id,
    providerId: r.providerId,
    channel,
    headline,
    ...(code ? { code } : {}),
    postedBy,
    createdAt,
    expiresAt,
  };
}

/** Drops expired pins and keeps the newest 12. */
export function pruneDealPins(pins: HouseholdDealPin[], now = Date.now()): HouseholdDealPin[] {
  return pins
    .filter((p) => {
      const exp = Date.parse(p.expiresAt);
      return Number.isNaN(exp) || exp > now;
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 12);
}

/** Converts a household-pinned targeted code into a top-priority DeliveryDeal. */
export function pinToDeal(pin: HouseholdDealPin): DeliveryDeal {
  return {
    id: `pin_${pin.id}`,
    providerId: pin.providerId,
    providerName: PROVIDER_NAMES[pin.providerId],
    channel: pin.channel,
    headline: pin.headline,
    detail: `Pinned by ${pin.postedBy} — use their account or code before it expires.`,
    code: pin.code,
    eligibility: 'household',
    source: 'household',
    activeToday: true,
    score: 100,
    expiresAt: pin.expiresAt,
    postedBy: pin.postedBy,
  };
}

/**
 * Reliable UK day-of-week platform offers & ongoing perks (zero fake/dead voucher codes).
 * Uses local day of week (0 = Sunday .. 6 = Saturday).
 */
export function calendarDealsForDate(date = new Date()): DeliveryDeal[] {
  const day = date.getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
  const deals: DeliveryDeal[] = [];

  // --- Takeaway channel ---
  if (day === 2) {
    deals.push({
      id: 'cal_je_cheeky_tuesday',
      providerId: 'justeat',
      providerName: 'Just Eat',
      channel: 'takeaway',
      headline: '20% off £15+ (Cheeky Tuesday)',
      detail: 'Applied automatically at participating local spots — no code needed.',
      minSpend: '£15+',
      eligibility: 'everyone',
      source: 'calendar',
      activeToday: true,
      score: 90,
      url: 'https://www.just-eat.co.uk/',
    });
  }

  if (day === 3) {
    deals.push({
      id: 'cal_roo_midweek_wed',
      providerId: 'deliveroo',
      providerName: 'Deliveroo',
      channel: 'takeaway',
      headline: 'Up to 30% off Midweek Special',
      detail: 'Participating restaurants discount early-evening orders (usually 4:30–6:30pm).',
      eligibility: 'everyone',
      source: 'calendar',
      activeToday: true,
      score: 88,
      url: 'https://deliveroo.co.uk/',
    });
  }

  if (day >= 1 && day <= 4) {
    deals.push({
      id: 'cal_roo_family_bundles',
      providerId: 'deliveroo',
      providerName: 'Deliveroo',
      channel: 'takeaway',
      headline: 'Weeknight Family Meal Deals',
      detail: 'Fixed-price family bundles on Mon–Thu early evenings (4:30–6:30pm).',
      eligibility: 'everyone',
      source: 'calendar',
      activeToday: true,
      score: day === 3 ? 74 : 82,
      url: 'https://deliveroo.co.uk/',
    });
  }

  if (day === 5 || day === 6 || day === 0) {
    deals.push({
      id: 'cal_ue_weekend_bogo',
      providerId: 'ubereats',
      providerName: 'Uber Eats',
      channel: 'takeaway',
      headline: '2-for-1 & Offers tab deals',
      detail: 'Check the Offers tab for local Buy One Get One Free mains and free sides.',
      eligibility: 'everyone',
      source: 'calendar',
      activeToday: true,
      score: 76,
      url: 'https://www.ubereats.com/gb',
    });
  } else {
    deals.push({
      id: 'cal_ue_offers_tab',
      providerId: 'ubereats',
      providerName: 'Uber Eats',
      channel: 'takeaway',
      headline: 'In-app BOGO & local offers',
      detail: 'Open the Offers tab before ordering — local spots run daily 2-for-1s.',
      eligibility: 'perk',
      source: 'calendar',
      activeToday: false,
      score: 60,
      url: 'https://www.ubereats.com/gb',
    });
  }

  deals.push({
    id: 'cal_roo_prime_plus',
    providerId: 'deliveroo',
    providerName: 'Deliveroo',
    channel: 'takeaway',
    headline: 'Free delivery with Amazon Prime',
    detail: 'Link Amazon Prime for free Deliveroo Plus Silver on eligible £15+ orders.',
    minSpend: '£15+',
    eligibility: 'perk',
    source: 'calendar',
    activeToday: false,
    score: 58,
    url: 'https://deliveroo.co.uk/',
  });

  deals.push({
    id: 'cal_je_stampcards',
    providerId: 'justeat',
    providerName: 'Just Eat',
    channel: 'takeaway',
    headline: 'StampCards: 10% back on 6th order',
    detail: 'Order 5 times from the same takeaway to unlock a voucher worth 10% of spend.',
    eligibility: 'perk',
    source: 'calendar',
    activeToday: false,
    score: 55,
    url: 'https://www.just-eat.co.uk/',
  });

  // --- Grocery channel ---
  if (day === 3) {
    deals.push({
      id: 'cal_je_grocery_wed',
      providerId: 'justeat',
      providerName: 'Just Eat',
      channel: 'grocery',
      headline: 'Half-Price Grocery Wednesdays',
      detail: 'Selected essentials half price at partnered convenience stores today.',
      eligibility: 'everyone',
      source: 'calendar',
      activeToday: true,
      score: 84,
      url: 'https://www.just-eat.co.uk/',
    });
  }

  deals.push(
    {
      id: 'cal_ocado_first',
      providerId: 'ocado',
      providerName: 'Ocado',
      channel: 'grocery',
      headline: 'First-order discount on £60+ shop',
      detail: 'Ocado regularly offers 25% off + free delivery on your first shop at checkout.',
      minSpend: '£60+',
      eligibility: 'first-order',
      source: 'calendar',
      activeToday: false,
      score: 64,
      url: 'https://www.ocado.com/',
    },
    {
      id: 'cal_tesco_clubcard',
      providerId: 'tesco',
      providerName: 'Tesco',
      channel: 'grocery',
      headline: 'Clubcard Prices applied automatically',
      detail: 'Sign in with a free Clubcard to unlock member prices on most staples.',
      eligibility: 'perk',
      source: 'calendar',
      activeToday: false,
      score: 60,
      url: 'https://www.tesco.com/groceries/',
    },
    {
      id: 'cal_sainsburys_nectar',
      providerId: 'sainsburys',
      providerName: 'Sainsbury’s',
      channel: 'grocery',
      headline: 'Nectar Prices applied automatically',
      detail: 'Link a Nectar card for instant discounts across weekly groceries.',
      eligibility: 'perk',
      source: 'calendar',
      activeToday: false,
      score: 58,
      url: 'https://www.sainsburys.co.uk/shop/gb/groceries',
    },
    {
      id: 'cal_ue_grocery_offers',
      providerId: 'ubereats',
      providerName: 'Uber Eats',
      channel: 'grocery',
      headline: 'Check Grocery tab for targeted promos',
      detail: 'Uber Eats often drops 30–50% account-specific grocery vouchers in-app.',
      eligibility: 'perk',
      source: 'calendar',
      activeToday: false,
      score: 56,
      url: 'https://www.ubereats.com/gb',
    }
  );

  return deals;
}

/**
 * Combines calendar deals, live affiliate vouchers, and household pins for a channel,
 * dropping expired offers and keeping the single strongest deal per delivery provider.
 */
export function rankDealsForChannel(
  allDeals: DeliveryDeal[],
  channel: DealChannel,
  now = Date.now()
): { topPick: DeliveryDeal | null; ranked: DeliveryDeal[]; byProvider: Partial<Record<DeliveryProviderId, DeliveryDeal>> } {
  const active = allDeals.filter((d) => {
    if (d.channel !== channel) return false;
    if (d.expiresAt) {
      const exp = Date.parse(d.expiresAt);
      if (!Number.isNaN(exp) && exp <= now) return false;
    }
    return true;
  });

  // Sort by score descending, then activeToday, then live/household over calendar.
  const sorted = [...active].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (Number(b.activeToday) !== Number(a.activeToday)) return Number(b.activeToday) - Number(a.activeToday);
    return a.providerName.localeCompare(b.providerName);
  });

  const byProvider: Partial<Record<DeliveryProviderId, DeliveryDeal>> = {};
  const ranked: DeliveryDeal[] = [];
  for (const deal of sorted) {
    if (!byProvider[deal.providerId]) {
      byProvider[deal.providerId] = deal;
      ranked.push(deal);
    }
  }

  return {
    topPick: ranked[0] || null,
    ranked,
    byProvider,
  };
}

export const eligibilityLabel = (e: DealEligibility): string =>
  e === 'household'
    ? 'Household code'
    : e === 'everyone'
      ? 'Everyone'
      : e === 'first-order'
        ? 'First order'
        : 'Ongoing perk';
