import { useCallback, useEffect, useRef, useState } from 'react';
import {
  TakeawayHub,
  buildLeague,
  cleanHub,
  emptyHub,
  mergeHub,
  type LeagueRow,
  type PlaceDetails,
  type SharedSpot,
  type SpotRating,
} from '../utils/takeaways';

type Household = { id: string; key: string } | null;

export type SharedTakeaways = {
  hub: TakeawayHub;
  league: LeagueRow[];
  /** null until we know; false when the server can't be reached. */
  online: boolean | null;
  busy: boolean;
  findTown: (query: string) => Promise<{ ok: boolean; message: string }>;
  discover: (radiusM?: number) => Promise<{ ok: boolean; message: string }>;
  rate: (spotId: string, who: string, stars: number, likes: string, dislikes: string) => void;
  hideSpot: (id: string, hidden: boolean) => void;
  addSpot: (name: string, cuisine: string, who: string, extra?: Partial<Pick<SharedSpot, 'website' | 'address' | 'phone' | 'lat' | 'lon'>>) => string | null;
  /** Reads a restaurant's own web page for its name, cuisine, address and phone. Nothing is added until the person confirms. */
  lookupLink: (url: string) => Promise<{ ok: boolean; message: string; website?: string; details?: PlaceDetails }>;
};

const KEY = 'takeaway_hub';

/**
 * The family's local takeaways. Kept in a hook of its own because it only exists inside a family group:
 * without one there is nothing shared, so nothing is stored or sent. Edits apply here at once, are marked
 * unsent, and go to the server on the next round; the server merges by id so no phone's votes are lost.
 */
export function useSharedTakeaways(
  household: Household,
  storagePrefix: string,
  authHeaders: () => Record<string, string>
): SharedTakeaways {
  const storeKey = `${storagePrefix}_${KEY}`;
  const [hub, setHub] = useState<TakeawayHub>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) || 'null');
      // Saved data belongs to one family group; never carry it into another.
      if (saved && household && saved.householdId === household.id) return cleanHub(saved.hub);
    } catch {
      // unreadable: start empty
    }
    return emptyHub();
  });
  const [online, setOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const authRef = useRef(authHeaders);
  authRef.current = authHeaders;
  const hubRef = useRef(hub);
  hubRef.current = hub;
  const dirty = useRef(false);
  const syncing = useRef(false);
  const hid = household?.id || null;

  // When the family group changes (or is left), forget the other group's takeaways.
  const lastHid = useRef(hid);
  useEffect(() => {
    if (lastHid.current !== hid) {
      lastHid.current = hid;
      dirty.current = false;
      setHub(emptyHub());
    }
  }, [hid]);

  useEffect(() => {
    try {
      if (hid) localStorage.setItem(storeKey, JSON.stringify({ householdId: hid, hub }));
      else localStorage.removeItem(storeKey);
    } catch {
      // storage full or blocked
    }
  }, [hub, hid, storeKey]);

  const post = useCallback(
    async (path: string, body: unknown) => {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authRef.current() },
        body: JSON.stringify(body),
      });
      const json: any = await res.json().catch(() => ({}));
      return { res, json };
    },
    []
  );

  const sync = useCallback(async () => {
    if (!hid || syncing.current) return;
    syncing.current = true;
    try {
      const sent = hubRef.current;
      const wasDirty = dirty.current;
      dirty.current = false;
      const res = wasDirty
        ? await fetch('/api/takeaways', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authRef.current() },
            body: JSON.stringify({ place: sent.place, spots: sent.spots, ratings: sent.ratings }),
          })
        : await fetch('/api/takeaways', { headers: authRef.current() });
      if (!res.ok) {
        dirty.current = dirty.current || wasDirty;
        throw new Error('takeaway sync failed');
      }
      const server = cleanHub(await res.json());
      // Union with whatever changed here meanwhile, so nothing typed during the round trip is lost.
      setHub((prev) => ({ ...mergeHub(server, prev), version: server.version }));
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      syncing.current = false;
    }
  }, [hid]);

  useEffect(() => {
    if (!hid) return;
    sync();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, 6000);
    return () => clearInterval(timer);
  }, [hid, sync]);

  const edit = useCallback(
    (patch: { spots?: SharedSpot[]; ratings?: SpotRating[] }) => {
      setHub((prev) => mergeHub(prev, patch));
      dirty.current = true;
      setTimeout(sync, 400);
    },
    [sync]
  );

  const adopt = (server: unknown) => setHub((prev) => ({ ...mergeHub(cleanHub(server), prev), version: cleanHub(server).version }));

  const findTown: SharedTakeaways['findTown'] = async (query) => {
    if (!hid) return { ok: false, message: 'Start a family group first.' };
    setBusy(true);
    try {
      const { res, json } = await post('/api/takeaways/place', { query });
      if (!res.ok) return { ok: false, message: String(json?.error || 'Couldn’t find that place.') };
      // The newly chosen town replaces the old one outright.
      setHub((prev) => ({ ...mergeHub(cleanHub(json), prev), place: cleanHub(json).place, version: cleanHub(json).version }));
      return { ok: true, message: `Looking around ${cleanHub(json).place?.label || 'there'}…` };
    } catch {
      return { ok: false, message: 'Couldn’t reach the server.' };
    } finally {
      setBusy(false);
    }
  };

  const discover: SharedTakeaways['discover'] = async (radiusM) => {
    if (!hid) return { ok: false, message: 'Start a family group first.' };
    setBusy(true);
    try {
      const { res, json } = await post('/api/takeaways/discover', { radiusM });
      if (!res.ok) return { ok: false, message: String(json?.error || 'Couldn’t search just now.') };
      adopt(json.hub);
      const added = Number(json.added) || 0;
      const found = Number(json.found) || 0;
      const gone = Number(json.gone) || 0;
      const parts: string[] = [];
      if (found === 0) parts.push('No takeaways found on the map there. Add your favourites by hand.');
      else {
        parts.push(added ? `Found ${added} new ${added === 1 ? 'place' : 'places'}.` : 'Nothing new. You have them all.');
        if (gone) parts.push(`${gone} ${gone === 1 ? 'place has' : 'places have'} dropped off the map and may have closed.`);
        if (json.complete === false) parts.push('The map service was busy, so a few places may be missing. Refresh later to catch them.');
      }
      return { ok: true, message: parts.join(' ') };
    } catch {
      return { ok: false, message: 'Couldn’t reach the server.' };
    } finally {
      setBusy(false);
    }
  };

  const rate: SharedTakeaways['rate'] = (spotId, who, stars, likes, dislikes) =>
    edit({
      ratings: [
        { id: '', spotId, who, stars, likes: likes.trim() || undefined, dislikes: dislikes.trim() || undefined, updatedAt: new Date().toISOString() },
      ],
    });

  const hideSpot: SharedTakeaways['hideSpot'] = (id, hidden) => {
    const spot = hubRef.current.spots.find((s) => s.id === id);
    if (spot) edit({ spots: [{ ...spot, hidden: hidden || undefined, updatedAt: new Date().toISOString() }] });
  };

  const addSpot: SharedTakeaways['addSpot'] = (name, cuisine, who, extra = {}) => {
    const id = 'man_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    if (!name.trim()) return null;
    edit({ spots: [{ id, name, cuisine, source: 'manual', addedBy: who, ...extra, updatedAt: new Date().toISOString() }] });
    return id;
  };

  const lookupLink: SharedTakeaways['lookupLink'] = async (url) => {
    if (!hid) return { ok: false, message: 'Start a family group first.' };
    setBusy(true);
    try {
      const { res, json } = await post('/api/takeaways/lookup', { url });
      if (res.ok && json?.details) return { ok: true, message: 'Found it. Check the details, then add it.', website: json.website, details: json.details };
      return { ok: false, message: String(json?.error || 'Couldn’t read that page.'), website: typeof json?.website === 'string' ? json.website : undefined };
    } catch {
      return { ok: false, message: 'Couldn’t reach the server.' };
    } finally {
      setBusy(false);
    }
  };

  return { hub, league: buildLeague(hub, hub.place), online, busy, findTown, discover, rate, hideSpot, addSpot, lookupLink };
}
