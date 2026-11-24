/**
 * Checks a backup file or server snapshot before it is allowed to replace what is on
 * this device. Anything malformed is rejected, so a bad file can never wipe the kitchen.
 */
export interface BackupSummary {
  recipes: number;
  fridge: number;
  people: number;
}

export type BackupCheck =
  | { ok: true; payload: Record<string, any>; summary: BackupSummary }
  | { ok: false; error: string };

const TIMES = ['20m', '30m', '60m', 'all-day'];
const EFFORTS = ['one-pot', 'standard', 'chef-mode'];
const FRESH = ['green', 'amber', 'red'];

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => typeof v === 'string' && v.trim().length > 0;
const strArr = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');

export function checkBackup(raw: unknown): BackupCheck {
  const payload = isObj(raw) && isObj(raw.data) ? raw.data : raw;
  if (!isObj(payload)) return { ok: false, error: 'That isn’t a Dinner Spinner backup.' };

  const members = payload.members ?? payload.householdMembers;
  const banned = payload.banned ?? payload.bannedIngredients;
  const liked = payload.liked ?? payload.likedIngredients;
  const shelved = payload.shelved ?? payload.shelvedMeals;
  const known = ['meals', 'pantry', 'staples', 'cupboard', 'takeaways', 'voteLogs', 'cookLog', 'takeawayLog', 'rejectedMealIds', 'freezer'];
  if (!known.some((k) => payload[k] !== undefined) && members === undefined && liked === undefined) {
    return { ok: false, error: 'That isn’t a Dinner Spinner backup.' };
  }

  if (payload.meals !== undefined) {
    if (!Array.isArray(payload.meals) || payload.meals.length > 1000) {
      return { ok: false, error: 'The recipes in this backup look damaged.' };
    }
    for (const m of payload.meals) {
      if (
        !isObj(m) ||
        !str(m.id) ||
        !str(m.title) ||
        !strArr(m.ingredients) ||
        !strArr(m.prepSteps) ||
        !TIMES.includes(m.timeStake) ||
        !EFFORTS.includes(m.effort)
      ) {
        return { ok: false, error: 'One of the recipes in this backup looks damaged, so nothing was changed.' };
      }
    }
  }

  if (payload.pantry !== undefined) {
    if (
      !Array.isArray(payload.pantry) ||
      payload.pantry.length > 1000 ||
      !payload.pantry.every((p: any) => isObj(p) && str(p.id) && str(p.name) && FRESH.includes(p.freshness))
    ) {
      return { ok: false, error: 'The fridge in this backup looks damaged, so nothing was changed.' };
    }
  }

  if (payload.freezer !== undefined) {
    if (
      !Array.isArray(payload.freezer) ||
      payload.freezer.length > 300 ||
      !payload.freezer.every(
        (f: any) => isObj(f) && str(f.name) && Number.isFinite(f.portions) && f.portions >= 0 && f.portions <= 999
      )
    ) {
      return { ok: false, error: 'The freezer in this backup looks damaged, so nothing was changed.' };
    }
  }

  if (members !== undefined) {
    if (
      !Array.isArray(members) ||
      members.length === 0 ||
      members.length > 20 ||
      !members.every((m: any) => isObj(m) && str(m.id) && str(m.name) && typeof m.vetoTokensRemaining === 'number')
    ) {
      return { ok: false, error: 'The household in this backup looks damaged, so nothing was changed.' };
    }
  }

  for (const k of ['staples', 'rejectedMealIds']) {
    if (payload[k] !== undefined && !strArr(payload[k])) {
      return { ok: false, error: 'This backup looks damaged, so nothing was changed.' };
    }
  }
  if (banned !== undefined && !strArr(banned)) {
    return { ok: false, error: 'This backup looks damaged, so nothing was changed.' };
  }
  if (liked !== undefined && !strArr(liked)) {
    return { ok: false, error: 'This backup looks damaged, so nothing was changed.' };
  }
  if (payload.cupboard !== undefined) {
    if (
      !Array.isArray(payload.cupboard) ||
      payload.cupboard.length > 1000 ||
      !payload.cupboard.every((c: any) => isObj(c) && str(c.id) && str(c.name))
    ) {
      return { ok: false, error: 'The cupboard in this backup looks damaged, so nothing was changed.' };
    }
  }
  if (shelved !== undefined && !Array.isArray(shelved)) {
    return { ok: false, error: 'This backup looks damaged, so nothing was changed.' };
  }
  for (const k of ['takeaways', 'voteLogs', 'cookLog', 'takeawayLog']) {
    if (payload[k] !== undefined && !Array.isArray(payload[k])) {
      return { ok: false, error: 'This backup looks damaged, so nothing was changed.' };
    }
  }

  return {
    ok: true,
    payload,
    summary: {
      recipes: Array.isArray(payload.meals) ? payload.meals.length : 0,
      fridge: Array.isArray(payload.pantry) ? payload.pantry.length : 0,
      people: Array.isArray(members) ? members.length : 0,
    },
  };
}
