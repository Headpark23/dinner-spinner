import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import {
  calendarDealsForDate,
  cleanDealPin,
  pinToDeal,
  pruneDealPins,
  rankDealsForChannel,
  type DealChannel,
  type DeliveryDeal,
  type DeliveryProviderId,
  type HouseholdDealPin,
} from './deliveryDeals';

const LOCAL_PINS_KEY = 'ds_deal_pins_v1';

let cachedServerDeals: { deals: DeliveryDeal[]; liveConfigured: boolean; fetchedAt: number } | null = null;

function readLocalPins(): HouseholdDealPin[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LOCAL_PINS_KEY) || '[]');
    if (!Array.isArray(raw)) return [];
    return pruneDealPins(raw.map((r) => cleanDealPin(r)).filter(Boolean) as HouseholdDealPin[]);
  } catch {
    return [];
  }
}

function writeLocalPins(pins: HouseholdDealPin[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_PINS_KEY, JSON.stringify(pruneDealPins(pins)));
  } catch {
    // ignore storage quota errors
  }
}

export function useDeliveryDeals(channel: DealChannel) {
  const { householdCode, authHeaders, whoAmI } = useDinner();
  const [serverDeals, setServerDeals] = useState<DeliveryDeal[]>(
    () => cachedServerDeals?.deals ?? calendarDealsForDate()
  );
  const [liveConfigured, setLiveConfigured] = useState<boolean>(() => cachedServerDeals?.liveConfigured ?? false);
  const [pins, setPins] = useState<HouseholdDealPin[]>(() => readLocalPins());
  const [savingPin, setSavingPin] = useState(false);

  // Fetch today's server deals once per session (re-fetched after 30 mins).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (cachedServerDeals && Date.now() - cachedServerDeals.fetchedAt < 30 * 60 * 1000) return;
    let cancelled = false;
    fetch('/api/deals/today')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json || !Array.isArray(json.deals)) return;
        cachedServerDeals = {
          deals: json.deals,
          liveConfigured: Boolean(json.liveConfigured),
          fetchedAt: Date.now(),
        };
        setServerDeals(json.deals);
        setLiveConfigured(Boolean(json.liveConfigured));
      })
      .catch(() => {
        // offline: local UK calendar deals are already loaded
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Sync household-pinned codes when in a family group.
  useEffect(() => {
    if (typeof window === 'undefined' || !householdCode) return;
    let cancelled = false;
    fetch('/api/deals/pins', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json || !Array.isArray(json.pins)) return;
        const next = pruneDealPins(json.pins);
        setPins(next);
        writeLocalPins(next);
      })
      .catch(() => {
        // offline: keep local pins
      });
    return () => {
      cancelled = true;
    };
  }, [householdCode, authHeaders]);

  const pinDeal = useCallback(
    async (input: { providerId: DeliveryProviderId; headline: string; code?: string }) => {
      const now = new Date();
      // Auto-expire at 23:59 tonight (or +12h if pinned late at night) so stale codes never linger.
      const endOfToday = new Date(now);
      endOfToday.setHours(23, 59, 59, 999);
      const expiresAt =
        endOfToday.getTime() - now.getTime() < 3 * 3600 * 1000
          ? new Date(now.getTime() + 12 * 3600 * 1000).toISOString()
          : endOfToday.toISOString();

      const localPin = cleanDealPin(
        {
          id: `pin_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          providerId: input.providerId,
          channel,
          headline: input.headline,
          code: input.code,
          postedBy: whoAmI || 'Someone',
          createdAt: now.toISOString(),
          expiresAt,
        },
        now
      );
      if (!localPin) return;

      const optimistic = pruneDealPins([localPin, ...pins]);
      setPins(optimistic);
      writeLocalPins(optimistic);

      if (!householdCode) return;
      setSavingPin(true);
      try {
        const res = await fetch('/api/deals/pins', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(localPin),
        });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json.pins)) {
            const synced = pruneDealPins(json.pins);
            setPins(synced);
            writeLocalPins(synced);
          }
        }
      } catch {
        // kept locally
      } finally {
        setSavingPin(false);
      }
    },
    [channel, householdCode, authHeaders, pins, whoAmI]
  );

  const removePin = useCallback(
    async (dealOrPinId: string) => {
      const pinId = dealOrPinId.replace(/^pin_/, '');
      const optimistic = pins.filter((p) => p.id !== pinId);
      setPins(optimistic);
      writeLocalPins(optimistic);
      if (!householdCode) return;
      try {
        await fetch(`/api/deals/pins/${encodeURIComponent(pinId)}`, {
          method: 'DELETE',
          headers: authHeaders(),
        });
      } catch {
        // ignore
      }
    },
    [householdCode, authHeaders, pins]
  );

  const combined = useMemo(() => {
    const pinDeals = pruneDealPins(pins).map(pinToDeal);
    return rankDealsForChannel([...pinDeals, ...serverDeals], channel);
  }, [pins, serverDeals, channel]);

  return {
    topPick: combined.topPick,
    ranked: combined.ranked,
    byProvider: combined.byProvider,
    liveConfigured,
    savingPin,
    pinDeal,
    removePin,
  };
}
