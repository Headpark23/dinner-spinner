import {
  calendarDealsForDate,
  PROVIDER_NAMES,
  type DealChannel,
  type DeliveryDeal,
  type DeliveryProviderId,
} from '../utils/deliveryDeals';

export interface DealsSnapshot {
  deals: DeliveryDeal[];
  liveConfigured: boolean;
  liveCount: number;
  updatedAt: string;
}

const MERCHANT_MATCHERS: [RegExp, DeliveryProviderId, DealChannel][] = [
  [/\bjust\s*eat\b/i, 'justeat', 'takeaway'],
  [/\bdeliveroo\b/i, 'deliveroo', 'takeaway'],
  [/\buber\s*eats?\b/i, 'ubereats', 'takeaway'],
  [/\bocado\b/i, 'ocado', 'grocery'],
  [/\bsainsbury/i, 'sainsburys', 'grocery'],
  [/\btesco\b/i, 'tesco', 'grocery'],
  [/\basda\b/i, 'asda', 'grocery'],
  [/\bmorrisons?\b/i, 'morrisons', 'grocery'],
  [/\bwaitrose\b/i, 'waitrose', 'grocery'],
];

const FIRST_ORDER_RE = /\b(new\s+customer|first\s+order|1st\s+order|first\s+shop|1st\s+shop|new\s+users?)\b/i;
const GROCERY_HINT_RE = /\b(grocer(?:y|ies)|supermarket|convenience)\b/i;
const MIN_SPEND_RE = /£\s*(\d+(?:\.\d{2})?)\s*\+?|min(?:imum)?\s+spend\s+£\s*(\d+)/i;

function matchMerchant(name: string, title: string): { providerId: DeliveryProviderId; channel: DealChannel } | null {
  for (const [re, providerId, defaultChannel] of MERCHANT_MATCHERS) {
    if (re.test(name)) {
      const channel: DealChannel =
        (providerId === 'justeat' || providerId === 'ubereats') && GROCERY_HINT_RE.test(title)
          ? 'grocery'
          : defaultChannel;
      return { providerId, channel };
    }
  }
  return null;
}

/**
 * Normalises promotions returned by the Awin Publisher Promotions API
 * (`POST https://api.awin.com/publisher/{publisherId}/promotions`).
 */
export function parseAwinPromotions(payload: unknown, now = Date.now()): DeliveryDeal[] {
  const rows: any[] = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : [];

  const out: DeliveryDeal[] = [];
  for (const item of rows) {
    if (!item || typeof item !== 'object') continue;
    const status = String(item.status || 'active').toLowerCase();
    if (status !== 'active') continue;

    const endDate = typeof item.endDate === 'string' ? item.endDate : undefined;
    if (endDate && !Number.isNaN(Date.parse(endDate)) && Date.parse(endDate) <= now) continue;

    const advertiserName = String(item.advertiser?.name || item.advertiserName || '');
    const title = String(item.title || item.description || '').replace(/\s+/g, ' ').trim();
    if (!advertiserName || !title) continue;

    const matched = matchMerchant(advertiserName, title);
    if (!matched) continue;

    const code = String(item.voucher?.code || item.code || '')
      .trim()
      .toUpperCase()
      .slice(0, 32);
    const terms = String(item.terms || item.description || '').replace(/\s+/g, ' ').trim();
    const firstOrder = FIRST_ORDER_RE.test(`${title} ${terms}`);
    const minMatch = MIN_SPEND_RE.exec(`${title} ${terms}`);
    const minSpend = minMatch ? `£${minMatch[1] || minMatch[2]}+` : undefined;
    const url = typeof item.urlTracking === 'string' && /^https:\/\//i.test(item.urlTracking)
      ? item.urlTracking
      : typeof item.url === 'string' && /^https:\/\//i.test(item.url)
        ? item.url
        : undefined;

    out.push({
      id: `awin_${item.promotionId || item.id || `${matched.providerId}_${code || out.length}`}`,
      providerId: matched.providerId,
      providerName: PROVIDER_NAMES[matched.providerId],
      channel: matched.channel,
      headline: title.slice(0, 90),
      detail: (terms && terms !== title ? terms : 'Verified partner offer. Check basket terms at checkout.').slice(0, 160),
      ...(code ? { code } : {}),
      ...(minSpend ? { minSpend } : {}),
      eligibility: firstOrder ? 'first-order' : 'everyone',
      source: 'live',
      activeToday: true,
      score: firstOrder ? 72 : code ? 94 : 89,
      ...(url ? { url } : {}),
      isAffiliate: Boolean(url),
      ...(endDate ? { expiresAt: endDate } : {}),
    });
  }
  return out;
}

export interface DealsServiceOptions {
  awinToken?: string;
  awinPublisherId?: string;
  fetchImpl?: typeof fetch;
  cacheTtlMs?: number;
}

/**
 * Creates a cached daily deals loader.
 * - Always includes reliable UK day-of-week offers (works with zero config).
 * - Automatically merges live verified vouchers from Awin when AWIN_API_TOKEN + AWIN_PUBLISHER_ID are set.
 */
export function createDealsService(opts: DealsServiceOptions = {}) {
  const ttl = opts.cacheTtlMs ?? 6 * 3600 * 1000; // 6 hours
  let cached: { snapshot: DealsSnapshot; expiresAt: number } | null = null;

  const getTodayDeals = async (now = new Date()): Promise<DealsSnapshot> => {
    const token = (opts.awinToken ?? process.env.AWIN_API_TOKEN ?? '').trim();
    const publisherId = (opts.awinPublisherId ?? process.env.AWIN_PUBLISHER_ID ?? '').trim();
    const liveConfigured = Boolean(token && publisherId);

    const nowMs = now.getTime();
    if (cached && cached.expiresAt > nowMs) {
      return cached.snapshot;
    }

    const calendarDeals = calendarDealsForDate(now);
    let liveDeals: DeliveryDeal[] = [];

    if (liveConfigured) {
      const fetchFn = opts.fetchImpl ?? fetch;
      try {
        const res = await fetchFn(
          `https://api.awin.com/publisher/${encodeURIComponent(publisherId)}/promotions`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              filters: {
                membership: 'joined',
                regionCodes: ['GB'],
                status: 'active',
              },
              pagination: { page: 1, pageSize: 100 },
            }),
          }
        );
        if (res.ok) {
          const json = await res.json();
          liveDeals = parseAwinPromotions(json, nowMs);
        }
      } catch {
        // Network/upstream failure: fall back calmly to the UK day-of-week calendar.
      }
    }

    const snapshot: DealsSnapshot = {
      deals: [...liveDeals, ...calendarDeals],
      liveConfigured,
      liveCount: liveDeals.length,
      updatedAt: now.toISOString(),
    };
    cached = { snapshot, expiresAt: nowMs + ttl };
    return snapshot;
  };

  return {
    getTodayDeals,
    clearCache: () => {
      cached = null;
    },
  };
}
