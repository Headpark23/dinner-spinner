/**
 * Streaks and milestones for the History page, as plain functions of the logs. Everything here celebrates
 * and nothing scolds: a takeaway night is a normal night off, it only ends a run, and the page never says
 * a streak was "lost".
 */
import type { CookLogEntry, FreezerItem, TakeawayLogEntry } from '../types';

const DAY = 86_400_000;

/** A local calendar day as a stable key. */
export const dayKey = (d: Date): string => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Whole local days from `a` to `b` (positive when b is later). */
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY);

const valid = (iso: string) => !Number.isNaN(new Date(iso).getTime());

/** Nights in a row cooked at home, up to today. A night not cooked yet today does not break it. */
export function cookingStreak(cookLog: Pick<CookLogEntry, 'date'>[], now: Date = new Date()): number {
  const cooked = new Set(cookLog.filter((c) => valid(c.date)).map((c) => dayKey(new Date(c.date))));
  let streak = 0;
  for (let i = 0; i < 400; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    if (cooked.has(dayKey(d))) streak++;
    else if (i > 0) break;
  }
  return streak;
}

/** Home-cooked nights in the last seven days, today included. */
export function homeCookedThisWeek(cookLog: Pick<CookLogEntry, 'date'>[], now: Date = new Date()): number {
  const cooked = new Set(cookLog.filter((c) => valid(c.date)).map((c) => dayKey(new Date(c.date))));
  let n = 0;
  for (let i = 0; i < 7; i++) {
    if (cooked.has(dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)))) n++;
  }
  return n;
}

/**
 * Days since the last takeaway night. With none logged it counts from the first home dinner, so a brand new
 * household starts at zero rather than with a free long run. Zero when nothing is logged at all.
 */
export function takeawayFreeDays(
  cookLog: Pick<CookLogEntry, 'date'>[],
  takeawayLog: Pick<TakeawayLogEntry, 'date'>[],
  now: Date = new Date()
): number {
  const takeaways = takeawayLog.filter((t) => valid(t.date)).map((t) => new Date(t.date));
  if (takeaways.length > 0) {
    const last = takeaways.reduce((a, b) => (a.getTime() > b.getTime() ? a : b));
    return Math.max(0, daysBetween(last, now));
  }
  const cooks = cookLog.filter((c) => valid(c.date)).map((c) => new Date(c.date));
  if (cooks.length === 0) return 0;
  const first = cooks.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
  return Math.max(0, daysBetween(first, now));
}

/** Portions taken out of the freezer and eaten, across every batch. */
export function freezerPortionsEaten(freezer: Pick<FreezerItem, 'portions' | 'totalPortions'>[]): number {
  return freezer.reduce((sum, f) => sum + Math.max(0, f.totalPortions - f.portions), 0);
}

export interface MilestoneStats {
  streak: number;
  homeDinners: number;
  takeawayFree: number;
  rescued: number;
  freezerEaten: number;
}

export function statsFrom(input: {
  cookLog: Pick<CookLogEntry, 'date'>[];
  takeawayLog: Pick<TakeawayLogEntry, 'date'>[];
  freezer: Pick<FreezerItem, 'portions' | 'totalPortions'>[];
  rescued: number;
  now?: Date;
}): MilestoneStats {
  const now = input.now ?? new Date();
  return {
    streak: cookingStreak(input.cookLog, now),
    homeDinners: input.cookLog.length,
    takeawayFree: takeawayFreeDays(input.cookLog, input.takeawayLog, now),
    rescued: Math.max(0, Math.round(input.rescued) || 0),
    freezerEaten: freezerPortionsEaten(input.freezer),
  };
}

interface Ladder {
  key: keyof MilestoneStats;
  steps: number[];
  /** What reaching `n` is called. */
  earned: (n: number) => string;
  /** What is left to reach `n`, said kindly. */
  next: (left: number, n: number) => string;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const LADDERS: Ladder[] = [
  {
    key: 'streak',
    steps: [3, 7, 14, 30],
    earned: (n) => `${n} nights cooked in a row`,
    next: (left, n) => `${plural(left, 'more night', 'more nights')} at home for a ${n}-night run`,
  },
  {
    key: 'homeDinners',
    steps: [10, 25, 50, 100],
    earned: (n) => `${n} home dinners`,
    next: (left, n) => `${plural(left, 'more dinner', 'more dinners')} to ${n} at home`,
  },
  {
    key: 'takeawayFree',
    steps: [7, 14, 30],
    earned: (n) => `${n} days since the last takeaway`,
    next: (left, n) => `${plural(left, 'more day', 'more days')} to ${n} since the last takeaway`,
  },
  {
    key: 'rescued',
    steps: [5, 10, 25, 50],
    earned: (n) => `${n} items rescued from the bin`,
    next: (left, n) => `${plural(left, 'more item', 'more items')} used up to reach ${n} rescued`,
  },
  {
    key: 'freezerEaten',
    steps: [3, 10, 25],
    earned: (n) => `${n} freezer portions eaten`,
    next: (left, n) => `${plural(left, 'more freezer portion', 'more freezer portions')} to reach ${n}`,
  },
];

export interface MilestoneResult {
  /** The highest step reached in each ladder that has been reached at all. */
  earned: { key: keyof MilestoneStats; step: number; label: string }[];
  /** The closest step still to reach, across the ladders (smallest share left first), or null. */
  next: { key: keyof MilestoneStats; step: number; left: number; label: string } | null;
}

export function milestones(stats: MilestoneStats): MilestoneResult {
  const earned: MilestoneResult['earned'] = [];
  let next: MilestoneResult['next'] = null;
  let nextShare = Infinity;
  for (const ladder of LADDERS) {
    const value = stats[ladder.key];
    const reached = ladder.steps.filter((s) => value >= s);
    if (reached.length > 0) {
      const step = reached[reached.length - 1];
      earned.push({ key: ladder.key, step, label: ladder.earned(step) });
    }
    const upcoming = ladder.steps.find((s) => value < s);
    // A ladder with nothing yet (value 0) is not nudged: no "0 of 3" counters for things not started.
    if (upcoming !== undefined && value > 0) {
      const left = upcoming - value;
      const share = left / upcoming;
      if (share < nextShare) {
        nextShare = share;
        next = { key: ladder.key, step: upcoming, left, label: ladder.next(left, upcoming) };
      }
    }
  }
  return { earned, next };
}
