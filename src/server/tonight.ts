import { HttpError } from './store';
import { votesNeeded } from '../utils/votes';

export { votesNeeded };

/**
 * Tonight's family vote. One proposal at a time per household. Phones poll it (and get a push), so
 * everyone can vote from their own handset. The server decides the outcome:
 *  - whoever sends the dish counts as a yes (they suggested it),
 *  - a strict majority agrees dinner, so with two people the other person must say yes too,
 *  - any veto ends the round,
 *  - cancelling is its own step, separate from voting, and everyone is told.
 */

const TIMES = ['20m', '30m', '60m', 'all-day'];
const EFFORTS = ['one-pot', 'standard', 'chef-mode'];
export const clipText = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const clipList = (v: unknown, items: number, n: number) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, items).map((x: string) => x.trim().slice(0, n)).filter(Boolean) : [];

export function cleanMeal(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clipText(raw.title, 120);
  const id = clipText(raw.id, 60);
  if (!title || !id || !TIMES.includes(raw.timeStake) || !EFFORTS.includes(raw.effort)) return null;
  const ingredients = clipList(raw.ingredients, 40, 80);
  const prepSteps = clipList(raw.prepSteps, 30, 200);
  if (ingredients.length === 0 || prepSteps.length === 0) return null;
  return {
    id,
    title,
    description: clipText(raw.description, 400),
    cuisine: clipText(raw.cuisine, 40) || 'Other',
    timeStake: raw.timeStake,
    effort: raw.effort,
    ingredients,
    prepSteps,
    tags: clipList(raw.tags, 10, 30),
  };
}

export type Tonight = {
  version: number;
  round: number;
  status: 'idle' | 'open' | 'agreed' | 'vetoed' | 'cancelled';
  meal: ReturnType<typeof cleanMeal>;
  people: string[];
  needed: number;
  ballot: Record<string, 'yes' | 'no'>;
  proposedBy: string;
  vetoedBy: string;
  /** Who cancelled the vote (status 'cancelled'). */
  cancelledBy: string;
  /** Who skipped the vote and picked the dish (status 'agreed' without enough yeses). */
  decidedBy: string;
  openedAt: string;
};

const STALE_MS = 12 * 3600 * 1000;

export const emptyTonight = (): Tonight => ({
  version: 0,
  round: 0,
  status: 'idle',
  meal: null,
  people: [],
  needed: 1,
  ballot: {},
  proposedBy: '',
  vetoedBy: '',
  cancelledBy: '',
  decidedBy: '',
  openedAt: '',
});

/** Tonight's vote for a household record, reset once it's more than 12 hours old. */
export function tonightOf(h: { tonight?: unknown }): Tonight {
  const t = ((h as any).tonight ||= emptyTonight()) as Tonight;
  // Older records predate these fields.
  t.cancelledBy ||= '';
  t.decidedBy ||= '';
  if (t.status !== 'idle' && t.openedAt && Date.now() - new Date(t.openedAt).getTime() > STALE_MS) {
    Object.assign(t, emptyTonight(), { version: t.version + 1, round: t.round });
  }
  return t;
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function applyTonightOp(h: { tonight?: unknown }, body: any): Tonight {
  const t = tonightOf(h);
  switch (body?.op) {
    case 'propose': {
      const meal = cleanMeal(body.meal);
      const by = clipText(body.by, 30);
      const people = clipList(body.people, 12, 30);
      // The sender always takes part, even if their phone's list of names is out of date.
      if (by && !people.some((p) => sameName(p, by))) people.unshift(by);
      const unique = people.filter((p, i) => people.findIndex((q) => sameName(p, q)) === i);
      if (!meal || unique.length === 0) throw new HttpError(400, { error: 'Invalid proposal' });
      const sender = unique.find((p) => by && sameName(p, by));
      const ballot: Tonight['ballot'] = sender ? { [sender]: 'yes' } : {};
      // A phone may ask for more yeses (e.g. everyone), never fewer than a strict majority.
      const asked = Math.floor(Number(body.needed)) || 0;
      const needed = Math.min(unique.length, Math.max(votesNeeded(unique.length), asked));
      Object.assign(t, {
        version: t.version + 1,
        round: t.round + 1,
        status: Object.keys(ballot).length >= needed ? 'agreed' : 'open',
        meal,
        people: unique,
        needed,
        ballot,
        proposedBy: sender || by,
        vetoedBy: '',
        cancelledBy: '',
        decidedBy: '',
        openedAt: new Date().toISOString(),
      });
      break;
    }
    case 'vote': {
      if (t.status !== 'open') throw new HttpError(409, { error: 'This vote has already finished.', tonight: t });
      const voter = t.people.find((p) => sameName(p, clipText(body.voter, 30)));
      if (!voter || !['yes', 'no'].includes(body.vote)) throw new HttpError(400, { error: 'Invalid vote' });
      t.ballot[voter] = body.vote;
      if (body.vote === 'no') {
        t.status = 'vetoed';
        t.vetoedBy = voter;
      } else if (Object.values(t.ballot).filter((v) => v === 'yes').length >= t.needed) {
        t.status = 'agreed';
      }
      t.version += 1;
      break;
    }
    case 'decide': {
      if (t.status !== 'open') throw new HttpError(409, { error: 'This vote has already finished.', tonight: t });
      t.status = 'agreed';
      t.decidedBy = clipText(body.by, 30);
      t.version += 1;
      break;
    }
    case 'cancel': {
      // Only an open vote can be cancelled; anything else is already over.
      if (t.status !== 'open') throw new HttpError(409, { error: 'This vote has already finished.', tonight: t });
      t.status = 'cancelled';
      t.cancelledBy = clipText(body.by, 30);
      t.version += 1;
      break;
    }
    case 'clear': {
      Object.assign(t, emptyTonight(), { version: t.version + 1, round: t.round });
      break;
    }
    default:
      throw new HttpError(400, { error: 'Unknown operation' });
  }
  return t;
}
