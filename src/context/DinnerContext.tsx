import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Meal,
  TimeStake,
  EffortLevel,
  MachineMode,
  ReelComboItem,
  PantryItem,
  PantryMatchInfo,
  HouseholdMember,
  TakeawayOption,
  VoteLog,
  ReverseTimerStep,
  UserProfile,
  CookLogEntry,
  TakeawayLogEntry,
  MealTweaks,
  MealReview,
  ShoppingItem,
  TimeFilter,
  EffortFilter,
  LiveVote,
  FreezerItem,
  DailyLogEntry,
  MealSlot,
  UsedStockItem,
} from '../types';
import { computeRestockSuggestions, newDailyLogId, todayDayKey, type RestockSuggestion } from '../utils/dailyLog';
import { createFreezerItem, applyFreezerOp, sanitizeFreezer, FreezerOp } from '../utils/freezer';
import { withOpIds } from '../utils/opIds';
import { WORLD_RECIPES } from '../data/worldRecipes';
import { adaptRecipes, describeTasteChange, lovedCount, TasteResult } from '../utils/taste';
import { applyShoppingOp, applyShoppingOpToState, newShoppingId, ShoppingOp } from '../utils/shopping';
import { applyFridgeOp, FridgeOp } from '../utils/fridge';
import {
  STARTER_MEALS,
  STARTER_TAKEAWAYS,
  STARTER_MEMBERS,
  INITIAL_MEALS,
  INITIAL_STAPLES,
  INITIAL_USER_PROFILE,
  REEL_CARBS,
  REEL_PROTEINS,
  REEL_SAUCES,
  SUNDAY_MEATS,
  SUNDAY_POTATOES,
  SUNDAY_STAR_SIDES,
  SUNDAY_VEG_GRAVY,
} from '../data/initialData';
import { sound } from '../utils/audio';
import { pickWeighted, spinWeight } from '../utils/takeaways';
import { useSharedTakeaways, type SharedTakeaways } from './useSharedTakeaways';
import { checkBackup, BackupCheck } from '../utils/backup';
import { DietId, isDietId, mealFitsDiets } from '../utils/diets';
import { WeekPlan, ThemeId, THEMES, StoreId, STORES, nextDays, suggestWeek, tidyPlan, weekShopping } from '../utils/planner';
import {
  isMealCoolingOff,
  getMealCoolingOffDays,
  calculateMealPantryMatch,
  filterEligibleMeals,
  selectWeightedMeal,
  buildComboMeal,
  buildReverseTimerSteps,
} from '../utils/dinnerEngine';
import { mentionsAny } from '../utils/avoid';
import { leftoverFridgeItem, MAX_LEFTOVER_PORTIONS, withDueFreshness, toDateOnly } from '../utils/leftovers';
import { DietMode, isDietMode, effectiveRestrictions, cleanPersonPrefs } from '../utils/memberDiets';
import { showStepNotification } from '../utils/stepAlerts';
import { pushIsOn, syncPush } from '../utils/push';
import { votesNeeded } from '../utils/votes';
import { useSharedListsSync } from './useMirrorSync';
import { guessShelf, newCupboardId, stockedCupboardNames } from '../utils/storeCupboard';
import type { CupboardItem } from '../types';
import { missingCost, costPerHead, costLimitValue, type CostLimit } from '../utils/cost';
import { repairImportedMeal } from '../utils/recipeImport';
import { buildReels, reelExtras, type ComboMode } from '../utils/reelParts';

interface DinnerContextType {
  // Machine State
  mode: MachineMode;
  setMode: (m: MachineMode) => void;
  timeStake: TimeFilter;
  setTimeStake: (t: TimeFilter) => void;
  /** How much the household is happy to spend on ingredients tonight ("free" = only what is already in the house). */
  costLimit: CostLimit;
  setCostLimit: (c: CostLimit) => void;
  /** Roughly what a dish would cost to buy, given what is in the fridge and cupboards. */
  costToBuy: (meal: Meal) => number;
  /** Rough cost per person from the price table, ignoring what is in the house. */
  costEach: (meal: Meal) => number;
  /** "Surprise me from the fridge" in one go: take the fridge photo first ("scan"), then open the cupboard spin ("spin"). */
  surpriseStep: 'scan' | 'spin' | null;
  setSurpriseStep: (s: 'scan' | 'spin' | null) => void;
  /** What spins, the planner and swaps leave out: the household lists plus, in "skip" mode, each person's own. */
  restrictions: { diets: DietId[]; avoid: string[] };
  costRule: { limit: number; of: (m: Meal) => number };
  costRelaxed: boolean;
  effort: EffortFilter;
  setEffort: (e: EffortFilter) => void;
  clearoutActive: boolean;
  setClearoutActive: (c: boolean) => void;
  nudgesRemaining: number;
  useNudge: (reelIndex: number) => void;
  resetNudges: () => void;
  heldReels: boolean[];
  toggleHold: (index: number) => void;
  isSpinning: boolean;
  spin: () => void;
  activeMealResult: Meal | null;
  setActiveMealResult: (meal: Meal | null) => void;
  customReelResult: string[];
  soundMuted: boolean;
  /** Nudge in-season dishes up and out-of-season ones down when spinning. On by default. */
  seasonal: boolean;
  setSeasonal: (on: boolean) => void;
  /** Which half of the world's seasons to follow. */
  hemisphere: 'north' | 'south';
  setHemisphere: (h: 'north' | 'south') => void;
  toggleSound: () => void;
  eligiblePoolCount: number;
  eligiblePool: Meal[];
  /** The reels for each mode, including parts and whole dishes from our own saved recipes. */
  comboReels: Record<ComboMode, ReelComboItem[][]>;
  exactEffortMatchCount: number;

  // Takeaway Override State
  consecutiveRejections: number;
  takeawayOverrideActive: boolean;
  setTakeawayOverrideActive: (active: boolean) => void;
  takeaways: TakeawayOption[];
  winningTakeaway: TakeawayOption | null;
  doorDutyPerson: HouseholdMember | null;
  isTakeawaySpinning: boolean;
  spinTakeaway: () => void;
  updateUsualOrder: (takeawayId: string, memberName: string, orderText: string) => void;
  addTakeawayOption: (name: string, category: string, badge: string) => void;
  recordTakeawayOrdered: (takeawayId: string) => void;
  /** The family's shared local takeaways, scores and notes (empty and idle outside a family group). */
  shared: SharedTakeaways;
  /** True when the reel is drawing from the family's shared takeaways instead of the on-phone list. */
  usingSharedTakeaways: boolean;
  /** The name scores and notes are filed under on this phone. */
  whoAmI: string;

  // Pantry & Recipes
  pantry: PantryItem[];
  togglePantryFreshness: (id: string) => void;
  addPantryItem: (item: Omit<PantryItem, 'id' | 'addedDate'>) => void;
  removePantryItem: (id: string) => void;
  staples: string[];
  /** Everything stocked in the house beyond the fridge: "always have" staples plus non-low cupboard items. */
  inStock: string[];
  addStaple: (name: string) => void;
  removeStaple: (name: string) => void;
  likedIngredients: string[];
  /** Dishes taken out of the rotation because they contain something on the never list. */
  shelvedMeals: Meal[];
  addLikedIngredient: (name: string) => string | null;
  removeLikedIngredient: (name: string) => void;
  bannedIngredients: string[];
  /** Adds or removes an ingredient from the never list; returns a sentence about what changed in the recipes. */
  toggleBannedIngredient: (name: string) => string | null;
  diets: DietId[];
  toggleDiet: (id: DietId) => void;
  /** "skip": leave out dishes someone cannot eat. "warn": keep them and name who they do not suit. */
  dietMode: DietMode;
  setDietMode: (m: DietMode) => void;
  setMemberPrefs: (id: string, prefs: { diets?: DietId[]; avoid?: string[] }) => void;
  servings: number;
  setServings: (n: number) => void;

  // Week planner
  weekPlan: WeekPlan;
  weekThemes: Record<number, ThemeId>;
  setWeekTheme: (weekday: number, theme: ThemeId) => void;
  setPlanDay: (day: string, meal: Meal | null) => void;
  planWeek: () => void;
  clearWeekPlan: () => void;
  shopForWeek: () => number;
  store: StoreId;
  setStore: (id: StoreId) => void;
  meals: Meal[];
  addMeal: (meal: Omit<Meal, 'id' | 'rating' | 'cookCount' | 'lastCookedDate' | 'isFavorite'>) => Meal;
  deleteMeal: (id: string) => void;
  toggleFavoriteMeal: (id: string) => void;
  rateMeal: (id: string, stars: number) => void;
  recordMealCooked: (id: string) => { rescuedRedItems: string[] };
  getMealPantryMatch: (meal: Meal) => PantryMatchInfo;
  rescuedItemsCount: number;
  cookLog: CookLogEntry[];
  takeawayLog: TakeawayLogEntry[];

  // Voting Booth & Household Members
  proposedMeal: Meal | null;
  /**
   * Puts a dish to the vote. In a family group this sends it to everyone's phones straight away
   * (see `voteSend` for how that went); without one, the household votes on this phone.
   */
  sendToVote: (meal: Meal) => void;
  /** What the "send to vote" buttons say: "Send to family vote" in a family group, else "Vote on this phone". */
  voteLabel: string;
  /** How the last "Send to family vote" went, for the dish on the vote screen. */
  voteSend: { mealId: string; state: 'sending' | 'sent' | 'failed'; message?: string } | null;
  /** Tries sending the dish on the vote screen to the family again after a failure. */
  retrySendToVote: () => void;
  /** Cancels the vote for everyone (the other phones are told) and goes back to the home screen. */
  cancelVote: () => Promise<{ ok: boolean; message?: string }>;
  householdMembers: HouseholdMember[];
  addHouseholdMember: (name: string, avatar: string) => void;
  removeHouseholdMember: (id: string) => void;
  resetVetoTokens: () => void;
  activeVoterIndex: number;
  setActiveVoterIndex: (idx: number) => void;
  currentBallot: Record<string, 'yes' | 'no'>;
  voteYes: (memberId: string, instantLock?: boolean) => void;
  voteNo: (memberId: string, reason?: string) => { allowed: boolean; message?: string };
  voteLogs: VoteLog[];
  agreedMeal: Meal | null;
  setAgreedMeal: (meal: Meal | null) => void;
  resetEvening: () => void;

  // Reverse Timers
  targetEatingTime: string;
  setTargetEatingTime: (time: string) => void;
  reverseTimers: ReverseTimerStep[];
  toggleTimerStep: (stepId: string) => void;
  generateReverseTimers: (targetTime: string, meal: Meal) => void;

  // Navigation & View
  activeView: number;
  setActiveView: (view: number) => void;

  // User Profile & OAuth Sync
  userProfile: UserProfile;
  updateUserProfile: (updates: Partial<UserProfile>) => void;
  syncWithCloud: () => Promise<boolean>;
  fetchCloudSnapshot: () => Promise<{ success: boolean; message: string; check?: BackupCheck }>;
  importBackupData: (rawJson: any) => { success: boolean; message: string };

  // Household sharing (guest-first: nothing is shared until a household is created or joined)
  householdCode: string | null;
  createHousehold: () => Promise<{ success: boolean; message: string }>;
  joinHousehold: (code: string) => Promise<{ success: boolean; message: string }>;
  leaveHousehold: () => void;
  /** Google sign-in for family groups. googleClientId is null when the server has none set up. */
  googleClientId: string | null;
  /** True when the server can read photos and PDFs of recipes. Links and pasted text always work. */
  aiEnabled: boolean;
  /** Headers that prove this phone belongs to its family group (empty for a guest). */
  authHeaders: () => Record<string, string>;
  googleProfile: { name: string; email: string; picture: string } | null;
  familyNames: string[];
  /** Names of people who joined through an invite since this phone last looked. */
  newJoiners: string[];
  dismissJoiners: () => void;
  signInWithGoogle: (
    credential: string,
    joinCode?: string
  ) => Promise<{ success: boolean; message: string; created?: boolean }>;

  // Live vote across phones
  tonight: LiveVote | null;
  startLiveVote: (meal: Meal) => Promise<{ ok: boolean; message?: string }>;
  castLiveVote: (voter: string, vote: 'yes' | 'no') => Promise<{ ok: boolean; message?: string }>;
  decideLive: () => Promise<{ ok: boolean; message?: string }>;
  clearLive: () => Promise<{ ok: boolean; message?: string }>;
  /** Who this phone votes as (the name chosen on the vote card, else "this phone is"). */
  myVoteName: () => string;
  /** Sets who this phone belongs to / votes as, updating both live voting and push notification identity. */
  setVoteIdentity: (name: string) => void;
  /** What someone on another phone just did in tonight's vote. */
  voteNews: { id: string; text: string; tone: 'sage' | 'tomato' | 'neutral'; proposal?: boolean } | null;
  dismissVoteNews: () => void;

  // First-run setup
  onboarded: boolean;
  completeOnboarding: (names: string[], avoid: string[], diets?: DietId[], loves?: string[], personDiets?: DietId[][]) => void;
  resetToFactoryDefaults: () => void;
  isSyncing: boolean;

  // World Kitchen library, tweaks and "not for us"
  worldRecipes: Meal[];
  addFromLibrary: (id: string) => Meal | null;
  rejectMeal: (id: string) => Meal | null;
  /** Hide a World Kitchen dish that isn't in our recipes yet. */
  hideLibraryRecipe: (id: string) => void;
  rejectedMealIds: string[];
  restoreRejected: (id: string) => void;
  updateMealTweaks: (id: string, tweaks: MealTweaks) => void;
  setMealPhoto: (id: string, imageUrl: string, credit: Meal['photoCredit']) => void;

  // After-dinner reviews
  saveDinnerReviews: (cookLogId: string, reviews: MealReview[]) => void;
  /** "Made extra?": sends the rest to the fridge (use next, with an eat-by date) or the freezer, once per dinner. */
  saveLeftovers: (cookLogId: string, route: 'fridge' | 'freezer', portions: number) => void;

  // Freezer: batch-cooked meals, ticked off a portion at a time
  freezer: FreezerItem[];
  addFreezerItem: (input: { name: string; portions: number; mealId?: string; note?: string }) => void;
  useFreezerPortion: (id: string) => void;
  putBackFreezerPortion: (id: string) => void;
  removeFreezerItem: (id: string) => void;
  /** Undo helpers: put back exactly the item that was removed. */
  restorePantryItem: (item: PantryItem) => void;
  restoreCupboardItem: (item: CupboardItem) => void;
  restoreFreezerItem: (item: FreezerItem) => void;
  clearUsedFreezer: () => void;

  // Shared shopping list
  shoppingList: ShoppingItem[];
  shoppingOnline: boolean | null;
  meId: string;
  setMeId: (id: string) => void;
  roomCode: string;
  roomError: string | null;
  createRoom: () => Promise<boolean>;
  joinRoom: (code: string) => Promise<boolean>;
  leaveRoom: () => void;
  addShoppingItems: (names: string[], forMeal?: string) => void;

  // Store cupboard (tins, jars, sauces...), shared by the family group
  cupboard: CupboardItem[];
  addCupboardItems: (items: { name: string; shelf?: string; quantity?: string }[]) => void;
  setCupboardLow: (id: string, low: boolean) => void;
  removeCupboardItem: (id: string) => void;
  // Daily food & ingredient usage log (breakfast/lunch/dinner/snack + stock deduction + restock)
  dailyLog: DailyLogEntry[];
  logDailyEntry: (input: {
    slot: MealSlot;
    kind: 'meal' | 'ingredients';
    title: string;
    mealId?: string;
    cuisine?: string;
    usedItems: UsedStockItem[];
    note?: string;
    date?: string;
  }) => DailyLogEntry;
  deleteDailyEntry: (id: string) => void;
  restockSuggestions: RestockSuggestion[];
  /** Whether recipes, the cupboard and likes/dislikes are reaching the family group (null: not shared, or not yet known). */
  listsOnline: boolean | null;
  removeShoppingByName: (name: string) => void;
  toggleShoppingItem: (id: string) => void;
  removeShoppingItem: (id: string) => void;
  clearCheckedShopping: () => void;

  // Cooling-off helper
  isCoolingOff: (meal: Meal) => boolean;
  getCoolingOffDays: (meal: Meal) => number | null;
}

const DinnerContext = createContext<DinnerContextType | null>(null);

const STORAGE_KEY = 'dinner_spinner_state_v1';

// Indexed by view id: Dinner, Takeaway, Fridge, Cook, History, Recipes, Shopping, More.
const VIEW_PATHS = ['/', '/takeaway', '/fridge', '/tonight', '/stats', '/recipes', '/shopping', '/more'];
const viewFromPath = (pathname: string): number | null => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/kitchen') return 2; // the old name for the fridge
  const i = VIEW_PATHS.indexOf(clean);
  return i === -1 ? null : i;
};

// A built plate needs a concrete time and effort even when the filters say "any".
const comboTime = (t: TimeFilter): TimeStake => (t === 'any' ? '30m' : t);
const comboEffort = (e: EffortFilter): EffortLevel => (e === 'any' ? 'standard' : e);

function loadStored<T>(suffix: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}_${suffix}`);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export const DinnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [meals, setMeals] = useState<Meal[]>(() => loadStored('meals', STARTER_MEALS));
  const [storedPantry, setPantry] = useState<PantryItem[]>(() => loadStored<PantryItem[]>('pantry', []));
  // What the app reads: an item due within two days counts as "use next". The stored list is left as typed.
  const today = toDateOnly(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pantry = useMemo(() => withDueFreshness(storedPantry), [storedPantry, today]);
  const [takeaways, setTakeaways] = useState<TakeawayOption[]>(() =>
    loadStored('takeaways', STARTER_TAKEAWAYS)
  );
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>(() =>
    loadStored('members', STARTER_MEMBERS)
  );
  const [staples, setStaples] = useState<string[]>(() => loadStored('staples', INITIAL_STAPLES));
  const [cupboard, setCupboard] = useState<CupboardItem[]>(() => loadStored<CupboardItem[]>('cupboard', []));
  // What counts as "in the house" besides the fridge: things we always have, plus stocked (non-low) cupboard items.
  const inStock = useMemo(() => [...staples, ...stockedCupboardNames(cupboard)], [staples, cupboard]);
  const [servings, setServingsState] = useState<number>(() => {
    const n = Number(loadStored<number>('servings', 4));
    return [2, 4, 6, 8].includes(n) ? n : 4;
  });
  const [weekPlan, setWeekPlan] = useState<WeekPlan>(() => {
    const stored = loadStored<WeekPlan>('week_plan', {});
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  });
  const [weekThemes, setWeekThemes] = useState<Record<number, ThemeId>>(() => {
    const stored = loadStored<Record<number, ThemeId>>('week_themes', {});
    return stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  });
  const [store, setStoreState] = useState<StoreId>(() => {
    const v = loadStored<string>('store', 'tesco');
    return (STORES.some((x) => x.id === v) ? v : 'tesco') as StoreId;
  });
  const [diets, setDiets] = useState<DietId[]>(() =>
    loadStored<unknown[]>('diets', []).filter(isDietId) as DietId[]
  );
  const [bannedIngredients, setBannedIngredients] = useState<string[]>(() =>
    loadStored<string[]>('banned', [])
  );
  const [surpriseStep, setSurpriseStep] = useState<'scan' | 'spin' | null>(null);
  const [dietMode, setDietModeState] = useState<DietMode>(() => {
    const v = loadStored<string>('diet_mode', 'skip');
    return isDietMode(v) ? v : 'skip';
  });
  // What spins, reels, the planner and swaps leave out: the household list, plus each person's own when set to skip.
  const restrictions = effectiveRestrictions(diets, bannedIngredients, householdMembers, dietMode);
  const effDiets = restrictions.diets;
  const effBanned = restrictions.avoid;
  const [likedIngredients, setLikedIngredients] = useState<string[]>(() => loadStored<string[]>('liked', []));
  const [shelvedMeals, setShelvedMeals] = useState<Meal[]>(() => loadStored<Meal[]>('shelved', []));
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadStored('profile', INITIAL_USER_PROFILE)
  );
  const [rescuedItemsCount, setRescuedItemsCount] = useState<number>(() =>
    loadStored('rescued_count', 0)
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [rejectedMealIds, setRejectedMealIds] = useState<string[]>(() => loadStored('rejected', []));
  const [freezer, setFreezer] = useState<FreezerItem[]>(() => sanitizeFreezer(loadStored('freezer', [])));
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => loadStored('shopping', []));
  const [shoppingOnline, setShoppingOnline] = useState<boolean | null>(null);
  const pendingFridgeOps = useRef<FridgeOp[]>(loadStored('fridge_queue', []));
  const fridgeBusy = useRef(false);
  const fridgeDirty = useRef(false);
  const pendingFreezerOps = useRef<FreezerOp[]>(loadStored('freezer_queue', []));
  const freezerBusy = useRef(false);
  const freezerDirty = useRef(false);
  const pantryRef = useRef<PantryItem[]>([]);
  pantryRef.current = storedPantry;
  const freezerRef = useRef<FreezerItem[]>([]);
  freezerRef.current = freezer;
  const pendingShoppingOps = useRef<ShoppingOp[]>(loadStored('shopping_queue', []));
  const [meId, setMeIdState] = useState<string>(() => loadStored('me', ''));
  const [household, setHousehold] = useState<{ id: string; key: string } | null>(() =>
    loadStored<{ id: string; key: string } | null>('household', null)
  );
  const householdRef = useRef(household);
  householdRef.current = household;
  const [googleClientId, setGoogleClientId] = useState<string | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [googleProfile, setGoogleProfile] = useState<{ name: string; email: string; picture: string } | null>(() =>
    loadStored('google_profile', null)
  );
  const [familyNames, setFamilyNames] = useState<string[]>([]);
  // People who already have saved data skip the welcome screen.
  const [onboarded, setOnboarded] = useState<boolean>(() => {
    const saved = loadStored<boolean | null>('onboarded', null);
    if (saved !== null) return saved;
    try {
      return localStorage.getItem(`${STORAGE_KEY}_meals`) !== null;
    } catch {
      return true;
    }
  });
  const [cookLog, setCookLog] = useState<CookLogEntry[]>(() => loadStored('cook_log', []));
  const [takeawayLog, setTakeawayLog] = useState<TakeawayLogEntry[]>(() =>
    loadStored('takeaway_log', [])
  );

  // Machine controls
  const [mode, setModeState] = useState<MachineMode>(() => {
    if (typeof window !== 'undefined') {
      const m = new URLSearchParams(window.location.search).get('mode');
      if (m === 'single' || m === '3-reel' || m === '4-reel' || m === 'sunday') return m;
    }
    return 'single';
  });
  const [timeStake, setTimeStake] = useState<TimeFilter>('any');
  const [effort, setEffort] = useState<EffortFilter>('any');
  const [costLimit, setCostLimitState] = useState<CostLimit>(() => {
    const saved = loadStored<string>('cost', 'any');
    return saved === 'free' || saved === '5' || saved === '10' ? saved : 'any';
  });
  const setCostLimit = (c: CostLimit) => {
    setCostLimitState(c);
    localStorage.setItem(`${STORAGE_KEY}_cost`, JSON.stringify(c));
  };
  const [clearoutActive, setClearoutActive] = useState<boolean>(false);
  const [nudgesRemaining, setNudgesRemaining] = useState<number>(3);
  const [heldReels, setHeldReels] = useState<boolean[]>([false, false, false, false]);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [activeMealResult, setActiveMealResult] = useState<Meal | null>(null);
  const [photoTick, setPhotoTick] = useState(0);
  const [customReelResult, setCustomReelResult] = useState<string[]>([
    'Rigatoni Pasta',
    'Free-Range Chicken',
    'Spicy Arrabbiata',
    'Garlic Green Beans',
  ]);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [seasonal, setSeasonal] = useState<boolean>(() => loadStored<boolean>('seasonal', true) !== false);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_seasonal`, JSON.stringify(seasonal));
  }, [seasonal]);
  const [hemisphere, setHemisphere] = useState<'north' | 'south'>(() => (loadStored<string>('hemisphere', 'north') === 'south' ? 'south' : 'north'));
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_hemisphere`, JSON.stringify(hemisphere));
  }, [hemisphere]);

  // Takeaway override
  const [consecutiveRejections, setConsecutiveRejections] = useState<number>(() =>
    loadStored('veto_streak', 0)
  );
  const [takeawayOverrideActive, setTakeawayOverrideActive] = useState<boolean>(() =>
    loadStored('takeaway_override', false)
  );
  const [winningTakeaway, setWinningTakeaway] = useState<TakeawayOption | null>(STARTER_TAKEAWAYS[0]);
  const [doorDutyPerson, setDoorDutyPerson] = useState<HouseholdMember | null>(STARTER_MEMBERS[0]);
  const [isTakeawaySpinning, setIsTakeawaySpinning] = useState<boolean>(false);

  // Voting Booth
  const [proposedMeal, setProposedMeal] = useState<Meal | null>(null);
  const [activeVoterIndex, setActiveVoterIndex] = useState<number>(0);
  const [currentBallot, setCurrentBallot] = useState<Record<string, 'yes' | 'no'>>({});
  const [voteLogs, setVoteLogs] = useState<VoteLog[]>(() => loadStored('vote_logs', []));
  const [agreedMeal, setAgreedMeal] = useState<Meal | null>(() => loadStored('agreed_meal', null));

  // Reverse Timers
  const [targetEatingTime, setTargetEatingTime] = useState<string>(() =>
    loadStored('target_time', '18:30')
  );
  const [reverseTimers, setReverseTimers] = useState<ReverseTimerStep[]>(() =>
    loadStored('reverse_timers', [])
  );

  // Navigation View (0: Dinner, 1: Takeaway, 2: Fridge, 3: Vote/Cook, 4: History, 5: Recipes, 6: Shopping, 7: More).
  // Each view has a real URL, so the browser Back button and shared links work.
  const [activeView, setActiveViewState] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const fromPath = viewFromPath(window.location.pathname);
      if (fromPath !== null) return fromPath;
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === '0' || v === 'spinner' || v === 'machine') return 0;
      if (v === '1' || v === 'takeaway') return 1;
      if (v === '2' || v === 'pantry' || v === 'kitchen') return 2;
      if (v === '3' || v === 'vote' || v === 'voting' || v === 'tonight') return 3;
      if (v === '4' || v === 'stats' || v === 'scorecard') return 4;
      if (v === '5' || v === 'recipes') return 5;
      if (v === '6' || v === 'shopping') return 6;
      if (v === '7' || v === 'more') return 7;
    }
    return 0;
  });

  const setActiveView = useCallback((view: number) => {
    setActiveViewState(view);
    if (typeof window === 'undefined') return;
    const path = VIEW_PATHS[view] ?? '/';
    if (window.location.pathname !== path) {
      try {
        window.history.pushState({ view }, '', path);
      } catch {
        // history may be unavailable (e.g. sandboxed frames); the view still changes
      }
    }
    window.scrollTo?.(0, 0);
  }, []);

  useEffect(() => {
    const onPop = () => {
      const v = viewFromPath(window.location.pathname);
      setActiveViewState(v ?? 0);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Sync to localStorage
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_meals`, JSON.stringify(meals));
  }, [meals]);

  // Self-heal any previously imported recipes whose comma clauses or method sentences landed in ingredient checkboxes.
  useEffect(() => {
    let changed = false;
    const healed = meals.map((m) => {
      const next = repairImportedMeal(m);
      if (next !== m) changed = true;
      return next;
    });
    if (changed) {
      setMeals(healed);
      setActiveMealResult((prev) => (prev ? repairImportedMeal(prev) : prev));
      setProposedMeal((prev) => (prev ? repairImportedMeal(prev) : prev));
      setAgreedMeal((prev) => {
        if (!prev) return prev;
        const fixed = repairImportedMeal(prev);
        if (fixed !== prev) setReverseTimers(buildReverseTimerSteps(targetEatingTime, fixed));
        return fixed;
      });
    }
  }, [meals]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_pantry`, JSON.stringify(storedPantry));
  }, [storedPantry]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_takeaways`, JSON.stringify(takeaways));
  }, [takeaways]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_members`, JSON.stringify(householdMembers));
  }, [householdMembers]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_staples`, JSON.stringify(staples));
  }, [staples]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_banned`, JSON.stringify(bannedIngredients));
  }, [bannedIngredients]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_liked`, JSON.stringify(likedIngredients));
  }, [likedIngredients]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_shelved`, JSON.stringify(shelvedMeals));
  }, [shelvedMeals]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_diets`, JSON.stringify(diets));
  }, [diets]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_diet_mode`, JSON.stringify(dietMode));
  }, [dietMode]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_servings`, JSON.stringify(servings));
  }, [servings]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_week_plan`, JSON.stringify(weekPlan));
  }, [weekPlan]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_week_themes`, JSON.stringify(weekThemes));
  }, [weekThemes]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_store`, JSON.stringify(store));
  }, [store]);
  const setStore = (id: StoreId) => setStoreState(id);
  const setWeekTheme = (weekday: number, theme: ThemeId) =>
    setWeekThemes((prev) => ({ ...prev, [weekday]: theme }));
  const setPlanDay = (day: string, meal: Meal | null) =>
    setWeekPlan((prev) => {
      const next = { ...prev };
      if (meal) next[day] = { mealId: meal.id, title: meal.title };
      else delete next[day];
      return next;
    });
  const planWeek = () => {
    const today = new Date();
    const days = nextDays(today, 7);
    const themes: Record<string, ThemeId> = {};
    days.forEach((d) => {
      const wd = new Date(d + 'T12:00:00').getDay();
      if (weekThemes[wd] && THEMES.some((t) => t.id === weekThemes[wd])) themes[d] = weekThemes[wd];
    });
    setWeekPlan((prev) =>
      suggestWeek(meals, { days, plan: tidyPlan(prev, today, meals), themes, diets: effDiets, banned: effBanned, cost: costRule, seasonal: seasonal ? hemisphere : false })
    );
  };
  const clearWeekPlan = () => setWeekPlan({});
  const setServings = (n: number) => setServingsState([2, 4, 6, 8].includes(n) ? n : 4);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_profile`, JSON.stringify(userProfile));
  }, [userProfile]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_vote_logs`, JSON.stringify(voteLogs));
  }, [voteLogs]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_agreed_meal`, JSON.stringify(agreedMeal));
  }, [agreedMeal]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_target_time`, JSON.stringify(targetEatingTime));
  }, [targetEatingTime]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_reverse_timers`, JSON.stringify(reverseTimers));
  }, [reverseTimers]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_rescued_count`, JSON.stringify(rescuedItemsCount));
  }, [rescuedItemsCount]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_cook_log`, JSON.stringify(cookLog));
  }, [cookLog]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_rejected`, JSON.stringify(rejectedMealIds));
  }, [rejectedMealIds]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_freezer`, JSON.stringify(freezer));
  }, [freezer]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_shopping`, JSON.stringify(shoppingList));
  }, [shoppingList]);

  // ---------- Shared shopping list sync ----------
  // Changes apply locally at once, queue, and are sent to the server. The list is
  // polled so ticks made on another phone appear within a few seconds.
  const persistQueue = () => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_shopping_queue`, JSON.stringify(pendingShoppingOps.current));
    } catch {
      // storage full or blocked; the queue still lives in memory
    }
  };

  const authHeaders = (): Record<string, string> => {
    const h = householdRef.current;
    return h ? { 'x-household-id': h.id, 'x-household-key': h.key } : {};
  };

  const shared = useSharedTakeaways(household, STORAGE_KEY, authHeaders);

  // ---------- Recipes, shelved, hidden dishes, cupboard, likes, dislikes, staples and dailyLog: one calm batched sync ----------
  const [dailyLog, setDailyLog] = useState<DailyLogEntry[]>(() => loadStored<DailyLogEntry[]>('dailyLog', []));
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_dailyLog`, JSON.stringify(dailyLog));
  }, [dailyLog]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_cupboard`, JSON.stringify(cupboard));
  }, [cupboard]);
  const unionJoin = (server: string[], local: string[]) =>
    local.filter((v) => !server.some((x) => x.toLowerCase() === v.toLowerCase())).map((value) => ({ type: 'add' as const, value }));
  const sharedListsSync = useSharedListsSync({
    storageKey: STORAGE_KEY,
    household,
    authHeaders,
    lists: {
      recipes: {
        value: meals,
        setValue: setMeals,
        // Joining a group that already has recipes: keep theirs, and add this phone's own recipes, scans and cooked dishes.
        joinOps: (server: Meal[], local: Meal[]) => {
          const have = new Set(server.map((m) => m.id));
          return local
            .filter((m) => !have.has(m.id) && (m.source === 'own' || m.source === 'scanned' || m.source === 'idea' || m.cookCount > 0))
            .map((item) => ({ type: 'upsert' as const, item }));
        },
      },
      shelved: {
        value: shelvedMeals,
        setValue: setShelvedMeals,
        joinOps: (server: Meal[], local: Meal[]) => {
          const have = new Set(server.map((m) => m.id));
          return local.filter((m) => !have.has(m.id)).map((item) => ({ type: 'upsert' as const, item }));
        },
      },
      hidden: { value: rejectedMealIds, setValue: setRejectedMealIds, joinOps: unionJoin },
      cupboard: {
        value: cupboard,
        setValue: setCupboard,
        joinOps: (server: CupboardItem[], local: CupboardItem[]) => {
          const names = new Set(server.map((c) => c.name.toLowerCase()));
          return local.filter((c) => !names.has(c.name.toLowerCase())).map((item) => ({ type: 'upsert' as const, item }));
        },
      },
      liked: { value: likedIngredients, setValue: setLikedIngredients, joinOps: unionJoin },
      avoid: { value: bannedIngredients, setValue: setBannedIngredients, joinOps: unionJoin },
      staples: { value: staples, setValue: setStaples, joinOps: unionJoin },
      dailyLog: {
        value: dailyLog,
        setValue: setDailyLog,
        joinOps: (server: DailyLogEntry[], local: DailyLogEntry[]) => {
          const ids = new Set(server.map((d) => d.id));
          return local.filter((d) => !ids.has(d.id)).map((item) => ({ type: 'upsert' as const, item }));
        },
      },
    },
  });
  const listsOnline = !household ? null : sharedListsSync.online;
  const whoAmI =
    householdMembers.find((m) => m.id === meId)?.name || googleProfile?.name?.split(' ')[0] || householdMembers[0]?.name || 'Someone';
  // Inside a family group the reel and the spinner draw from the shared list, favourites more often.
  const usingShared = !!household && shared.league.length > 0;
  const sharedPool: TakeawayOption[] = shared.league.map((row) => {
    const local = takeaways.find((t) => t.id === row.spot.id);
    return {
      id: row.spot.id,
      name: row.spot.name,
      category: row.spot.cuisine,
      badge: row.votes ? `${row.average.toFixed(1)}★ from ${row.votes}` : row.spot.address || '',
      color: '#f59e0b',
      usualOrders: local?.usualOrders ?? [],
      orderCount: local?.orderCount,
      lastOrderedDate: local?.lastOrderedDate ?? null,
      phone: row.spot.phone,
      website: row.spot.website,
      address: row.spot.address,
      lat: row.spot.lat,
      lon: row.spot.lon,
    };
  });
  const takeawayPool = usingShared ? sharedPool : takeaways;
  const shownWinner = usingShared ? sharedPool.find((t) => t.id === winningTakeaway?.id) ?? null : winningTakeaway;

  const syncShopping = useCallback(async () => {
    // Without a household the list stays on this phone; changes queue until one is set up.
    if (!householdRef.current) {
      setShoppingOnline(null);
      return;
    }
    try {
      const queued = pendingShoppingOps.current;
      const res = queued.length
        ? await fetch('/api/shopping/ops', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ ops: queued }),
          })
        : await fetch('/api/shopping', { headers: authHeaders() });
      if (!res.ok) throw new Error('shopping sync failed');
      const json = await res.json();
      if (queued.length) {
        pendingShoppingOps.current = pendingShoppingOps.current.slice(queued.length);
        persistQueue();
      }
      // Re-apply anything queued meanwhile so local edits never flicker away.
      setShoppingList(
        pendingShoppingOps.current.reduce(applyShoppingOpToState, { version: json.version, items: json.items as ShoppingItem[], applied: json.applied }).items
      );
      setShoppingOnline(true);
    } catch {
      setShoppingOnline(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    syncShopping();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') syncShopping();
    }, 12_000);
    const onVisible = () => document.visibilityState === 'visible' && syncShopping();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncShopping, household]);

  // ---------- Shared fridge (once the household is set up) ----------
  // Same pattern as the shopping list: edits apply here at once, queue, and go to the server.
  const saveFridgeQueue = () => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_fridge_queue`, JSON.stringify(pendingFridgeOps.current));
    } catch {
      // storage full or blocked; the queue still lives in memory
    }
  };

  const postFridgeOps = (ops: FridgeOp[]) =>
    fetch('/api/fridge/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ops }),
    });

  const syncFridge = useCallback(async () => {
    if (!householdRef.current) return; // without a household the fridge stays on this phone
    if (fridgeBusy.current) {
      fridgeDirty.current = true;
      return;
    }
    fridgeBusy.current = true;
    try {
      do {
        fridgeDirty.current = false;
        const queued = pendingFridgeOps.current;
        let res = queued.length ? await postFridgeOps(queued) : await fetch('/api/fridge', { headers: authHeaders() });
        if (!res.ok) throw new Error('fridge sync failed');
        let json = await res.json();
        if (queued.length) {
          pendingFridgeOps.current = pendingFridgeOps.current.slice(queued.length);
          saveFridgeQueue();
        }
        if (!json.seeded) {
          // First phone in the household shares what it has; the server ignores this if someone beat us to it.
          res = await postFridgeOps([{ type: 'seed', items: pantryRef.current }]);
          if (!res.ok) throw new Error('fridge seed failed');
          json = await res.json();
        }
        // Re-apply anything queued meanwhile so local edits never flicker away.
        const merged = pendingFridgeOps.current.reduce(applyFridgeOp, { version: json.version, seeded: true, items: json.items, applied: json.applied });
        setPantry(merged.items);
      } while (fridgeDirty.current);
    } catch {
      // offline: changes stay queued and go out next time
    } finally {
      fridgeBusy.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    syncFridge();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') syncFridge();
    }, 12_000);
    const onVisible = () => document.visibilityState === 'visible' && syncFridge();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncFridge, household]);

  const queueFridge = (rawOps: FridgeOp[]) => {
    if (rawOps.length === 0) return;
    const ops = withOpIds(rawOps); // an id per operation, so a resend after a lost reply is not counted twice
    setPantry((prev) => ops.reduce(applyFridgeOp, { version: 0, seeded: true, items: prev }).items);
    if (!householdRef.current) return;
    pendingFridgeOps.current = [...pendingFridgeOps.current, ...ops];
    saveFridgeQueue();
    syncFridge();
  };

  // ---------- Shared freezer (once the household is set up) ----------
  // Same pattern as the fridge: edits apply here at once, queue, and go to the server.
  const saveFreezerQueue = () => {
    try {
      localStorage.setItem(`${STORAGE_KEY}_freezer_queue`, JSON.stringify(pendingFreezerOps.current));
    } catch {
      // storage full or blocked; the queue still lives in memory
    }
  };

  const postFreezerOps = (ops: FreezerOp[]) =>
    fetch('/api/freezer/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ ops }),
    });

  const syncFreezer = useCallback(async () => {
    if (!householdRef.current) return; // without a household the freezer stays on this phone
    if (freezerBusy.current) {
      freezerDirty.current = true;
      return;
    }
    freezerBusy.current = true;
    try {
      do {
        freezerDirty.current = false;
        const queued = pendingFreezerOps.current;
        let res = queued.length ? await postFreezerOps(queued) : await fetch('/api/freezer', { headers: authHeaders() });
        if (!res.ok) throw new Error('freezer sync failed');
        let json = await res.json();
        if (queued.length) {
          pendingFreezerOps.current = pendingFreezerOps.current.slice(queued.length);
          saveFreezerQueue();
        }
        if (!json.seeded) {
          // First phone in the household shares what it has; the server ignores this if someone beat us to it.
          res = await postFreezerOps([{ type: 'seed', items: freezerRef.current }]);
          if (!res.ok) throw new Error('freezer seed failed');
          json = await res.json();
        }
        // Re-apply anything queued meanwhile so local edits never flicker away.
        const merged = pendingFreezerOps.current.reduce(applyFreezerOp, { version: json.version, seeded: true, items: sanitizeFreezer(json.items), applied: json.applied });
        setFreezer(merged.items);
      } while (freezerDirty.current);
    } catch {
      // offline: changes stay queued and go out next time
    } finally {
      freezerBusy.current = false;
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    syncFreezer();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') syncFreezer();
    }, 12_000);
    const onVisible = () => document.visibilityState === 'visible' && syncFreezer();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [syncFreezer, household]);

  const queueFreezer = (rawOps: FreezerOp[]) => {
    if (rawOps.length === 0) return;
    const ops = withOpIds(rawOps); // an id per operation, so a resend after a lost reply is not counted twice
    setFreezer((prev) => ops.reduce(applyFreezerOp, { version: 0, seeded: true, items: prev }).items);
    if (!householdRef.current) return;
    pendingFreezerOps.current = [...pendingFreezerOps.current, ...ops];
    saveFreezerQueue();
    syncFreezer();
  };

  // ---------- Shared cooking history ----------
  const historyBusy = useRef(false);
  const historyReplace = useRef(false);
  const cookLogRef = useRef<CookLogEntry[]>([]);
  cookLogRef.current = cookLog;

  const syncHistory = useCallback(async () => {
    if (!householdRef.current || historyBusy.current) return;
    historyBusy.current = true;
    try {
      const sent = cookLogRef.current;
      const replace = historyReplace.current;
      const res = await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ entries: sent, replace }),
      });
      if (!res.ok) throw new Error('history sync failed');
      const { entries } = (await res.json()) as { entries: CookLogEntry[] };
      historyReplace.current = false;
      // Only adopt the merged history if nothing changed while we were talking to the server.
      if (cookLogRef.current === sent && JSON.stringify(entries) !== JSON.stringify(sent)) setCookLog(entries);
    } catch {
      // offline: local entries are sent on a later round
    } finally {
      historyBusy.current = false;
    }
  }, []);

  useEffect(() => {
    syncHistory();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') syncHistory();
    }, 5000);
    return () => clearInterval(timer);
  }, [syncHistory, household]);

  // Send a new dinner or review a moment after it happens instead of waiting for the next poll.
  useEffect(() => {
    const t = setTimeout(syncHistory, 800);
    return () => clearTimeout(t);
  }, [cookLog, syncHistory]);

  const queueShopping = (rawOps: ShoppingOp[]) => {
    if (rawOps.length === 0) return;
    const ops = withOpIds(rawOps); // an id per operation, so a resend after a lost reply is not counted twice
    setShoppingList((prev) => ops.reduce(applyShoppingOp, prev));
    pendingShoppingOps.current = [...pendingShoppingOps.current, ...ops];
    persistQueue();
    syncShopping();
  };

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_takeaway_log`, JSON.stringify(takeawayLog));
  }, [takeawayLog]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_veto_streak`, JSON.stringify(consecutiveRejections));
    localStorage.setItem(`${STORAGE_KEY}_takeaway_override`, JSON.stringify(takeawayOverrideActive));
  }, [consecutiveRejections, takeawayOverrideActive]);

  // Sunday roast is always an all-day, chef-mode job; plates follow the time/effort filters.
  const comboLimits = (m: MachineMode): [TimeStake, EffortLevel] =>
    m === 'sunday' ? ['all-day', 'chef-mode'] : [comboTime(timeStake), comboEffort(effort)];

  // Mode switcher that also initializes sensible default reels & meal preview
  const setMode = (nextMode: MachineMode) => {
    sound.playHold();
    setModeState(nextMode);
    setHeldReels([false, false, false, false]);
    if (nextMode !== 'single') {
      const initial = comboReels[nextMode].map((list) => list[0].label);
      setCustomReelResult(initial);
      setActiveMealResult(buildComboMeal(nextMode, initial, ...comboLimits(nextMode)));
    } else {
      const { pool } = filterEligibleMeals(meals, timeStake, effort, effBanned, effDiets, costRule);
      if (pool.length > 0) {
        setActiveMealResult(pool[0]);
      }
    }
  };

  const isCoolingOff = (meal: Meal): boolean => isMealCoolingOff(meal);
  const getCoolingOffDays = (meal: Meal): number | null => getMealCoolingOffDays(meal);
  const getMealPantryMatch = (meal: Meal): PantryMatchInfo =>
    calculateMealPantryMatch(meal, pantry, inStock);

  const toggleSound = () => {
    const isNowMuted = sound.toggleMute();
    setSoundMuted(isNowMuted);
  };

  const toggleHold = (index: number) => {
    if (isSpinning) return;
    sound.playHold();
    setHeldReels((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  // Eligible pool computation for current filters
  const costToBuy = (m: Meal) => missingCost(m, pantry, inStock);
  const costEach = (m: Meal) => costPerHead(m, staples);
  const costRule = { limit: costLimitValue(costLimit), of: costToBuy };
  const eligibleInfo = filterEligibleMeals(meals, timeStake, effort, effBanned, effDiets, costRule);
  const eligiblePoolCount = eligibleInfo.pool.length;

  // Saved recipes feed their Base, Main, Sauce and Veg parts into the 3 and 4 reel plate builders.
  const reelAllowed = (label: string) =>
    mealFitsDiets([label], effDiets) &&
    !mentionsAny([label], effBanned);
  const extras = reelExtras(meals, reelAllowed);
  // Nothing on the avoid list (or against the diets) stays on a reel, whether built-in or from a saved recipe.
  const allowedOnly = (lists: ReelComboItem[][]) =>
    lists.map((list) => {
      const ok = list.filter((i) => reelAllowed(i.label));
      return ok.length > 0 ? ok : list;
    });
  const comboReels: Record<ComboMode, ReelComboItem[][]> = {
    '3-reel': allowedOnly(buildReels('3-reel', extras)),
    '4-reel': allowedOnly(buildReels('4-reel', extras)),
    sunday: allowedOnly(buildReels('sunday', extras)),
  };
  /** Builds a plate from the settled reel labels (every reel always shows a real ingredient part). */
  const settleReels = (m: MachineMode, labels: string[]): { labels: string[]; meal: Meal } => ({
    labels,
    meal: buildComboMeal(m, labels, ...comboLimits(m)),
  });
  const exactEffortMatchCount = eligibleInfo.exactMatchCount;
  const costRelaxed = !!eligibleInfo.costRelaxed;

  // Nudge logic: steps a reel to adjacent item AND updates activeMealResult immediately
  const useNudge = (reelIndex: number) => {
    if (nudgesRemaining <= 0 || isSpinning) return;
    sound.playNudge();
    setNudgesRemaining((prev) => Math.max(0, prev - 1));

    if (mode === 'single') {
      const pool = eligibleInfo.pool;
      if (pool.length > 1) {
        const currentIndex = pool.findIndex((m) => m.id === activeMealResult?.id);
        const nextIndex = (currentIndex + 1) % pool.length;
        setActiveMealResult(pool[nextIndex]);
      } else if (meals.length > 1) {
        const currentIndex = meals.findIndex((m) => m.id === activeMealResult?.id);
        const nextIndex = (currentIndex + 1) % meals.length;
        setActiveMealResult(meals[nextIndex]);
      }
    } else {
      const list = comboReels[mode][reelIndex] || comboReels[mode][0];
      const currentVal = customReelResult[reelIndex];
      const currentIndex = list.findIndex((i) => i.label === currentVal);
      const nextReels = [...customReelResult];
      nextReels[reelIndex] = list[(currentIndex + 1) % list.length].label;
      const settled = settleReels(mode, nextReels);
      setCustomReelResult(settled.labels);
      setActiveMealResult(settled.meal);
    }
  };

  const resetNudges = () => {
    sound.playHold();
    setNudgesRemaining(3);
  };

  // Main Fruit Machine Spin Trigger
  const spin = () => {
    if (isSpinning) return;
    setIsSpinning(true);
    sound.playLeverPull();

    const tickInterval = setInterval(() => {
      sound.playReelTick();
    }, 130);

    setTimeout(() => {
      clearInterval(tickInterval);

      if (mode === 'single') {
        const { pool } = filterEligibleMeals(meals, timeStake, effort, effBanned, effDiets, costRule);
        if (pool.length === 0) {
          // Every dish clashes with the household's diets: show nothing rather than a wrong dish.
          setActiveMealResult(null);
        } else {
          const chosen = selectWeightedMeal(pool, pantry, clearoutActive, effort, Date.now(), Math.random, seasonal ? hemisphere : false);
          sound.playReelLock();
          setActiveMealResult(chosen);
          sound.playWin();
        }
      } else {
        const newRes = [...customReelResult];
        comboReels[mode].forEach((list, i) => {
          if (!heldReels[i]) newRes[i] = list[Math.floor(Math.random() * list.length)].label;
        });
        const settled = settleReels(mode, newRes);
        setCustomReelResult(settled.labels);
        setActiveMealResult(settled.meal);
        sound.playReelLock();
        sound.playWin();
      }

      setIsSpinning(false);
      setHeldReels([false, false, false, false]);
    }, 1250);
  };

  // Takeaway Spinner Trigger
  const spinTakeaway = () => {
    if (isTakeawaySpinning) return;
    setIsTakeawaySpinning(true);
    sound.playLeverPull();

    const interval = setInterval(() => {
      sound.playReelTick();
    }, 90);

    setTimeout(() => {
      clearInterval(interval);
      sound.playReelLock();
      const randomTakeaway = usingShared
        ? pickWeighted(sharedPool, (o) => spinWeight(shared.league.find((r) => r.spot.id === o.id) || { average: 0, votes: 0 }), Math.random())!
        : takeaways[Math.floor(Math.random() * takeaways.length)];
      const randomDoorPerson =
        householdMembers[Math.floor(Math.random() * householdMembers.length)];

      setWinningTakeaway(randomTakeaway);
      setDoorDutyPerson(randomDoorPerson);
      setIsTakeawaySpinning(false);
      sound.playWin();
    }, 1300);
  };

  const addTakeawayOption = (name: string, category: string, badge: string) => {
    if (!name.trim()) return;
    if (household) {
      // Family groups share the list, so a new spot goes to everyone.
      const id = shared.addSpot(name, category || 'Takeaway', whoAmI);
      if (id) setWinningTakeaway({ id, name: name.trim(), category: category || 'Takeaway', badge: '', color: '#f59e0b', usualOrders: [], orderCount: 0, lastOrderedDate: null });
      return;
    }
    const newOption: TakeawayOption = {
      id: 'takeaway_' + Date.now(),
      name: name.trim(),
      category: category || 'Local Favourite',
      badge: badge.trim() || 'Fast Delivery',
      color: '#f59e0b',
      usualOrders: householdMembers.map((m) => ({
        memberName: m.name,
        order: 'Chef’s Special Choice',
      })),
      orderCount: 0,
      lastOrderedDate: null,
    };
    setTakeaways((prev) => [newOption, ...prev]);
    setWinningTakeaway(newOption);
  };

  const recordTakeawayOrdered = (takeawayId: string) => {
    sound.playWin();
    const spot = takeawayPool.find((t) => t.id === takeawayId);
    setTakeawayLog((prev) => [
      {
        id: 'tlog_' + Date.now(),
        takeawayId,
        name: spot?.name || 'Takeaway',
        date: new Date().toISOString(),
      },
      ...prev,
    ]);
    setTakeaways((prevRaw) => {
      const prev = !prevRaw.some((t) => t.id === takeawayId) && spot ? [spot, ...prevRaw] : prevRaw;
      return prev.map((t) =>
        t.id === takeawayId
          ? {
              ...t,
              orderCount: (t.orderCount || 0) + 1,
              lastOrderedDate: new Date().toISOString(),
            }
          : t
      );
    });
  };

  // Voting Actions
  const [voteSend, setVoteSend] = useState<{ mealId: string; state: 'sending' | 'sent' | 'failed'; message?: string } | null>(null);
  const sendToVote = (meal: Meal) => {
    setProposedMeal(meal);
    setAgreedMeal(null);
    setCurrentBallot({});
    setActiveVoterIndex(0);
    setActiveView(3);
    // In a family group the dish goes to everyone's phones at once. Opening a vote that only this
    // phone knew about looked like "sent" while nobody else was ever asked.
    if (householdRef.current) void sendToFamily(meal);
  };

  const generateReverseTimers = (targetTime: string, meal: Meal) => {
    const steps = buildReverseTimerSteps(targetTime, meal);
    setReverseTimers(steps);
  };

  const voteYes = (memberId: string, instantLock: boolean = false) => {
    const voter = householdMembers.find((m) => m.id === memberId) || householdMembers[0];
    if (!proposedMeal || !voter) return;

    const updatedBallot: Record<string, 'yes' | 'no'> = {
      ...currentBallot,
      [voter.id]: 'yes',
    };
    setCurrentBallot(updatedBallot);

    setVoteLogs((prev) => [
      {
        id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        mealId: proposedMeal.id,
        mealTitle: proposedMeal.title,
        memberId: voter.id,
        memberName: voter.name,
        decision: 'yes',
        timestamp: new Date().toISOString(),
      },
      ...prev,
    ]);

    const yesCount = Object.values(updatedBallot).filter((v) => v === 'yes').length;
    const majorityThreshold = votesNeeded(householdMembers.length);

    if (instantLock || yesCount >= majorityThreshold) {
      sound.playWin();
      setAgreedMeal(proposedMeal);
      setConsecutiveRejections(0);
      setTakeawayOverrideActive(false);
      generateReverseTimers(targetEatingTime, proposedMeal);
    } else {
      sound.playHold();
      // Auto-advance to next unvoted member
      const nextUnvotedIdx = householdMembers.findIndex((m) => !updatedBallot[m.id]);
      if (nextUnvotedIdx !== -1) {
        setActiveVoterIndex(nextUnvotedIdx);
      }
    }
  };

  const voteNo = (
    memberId: string,
    reason?: string
  ): { allowed: boolean; message?: string } => {
    const voter = householdMembers.find((m) => m.id === memberId) || householdMembers[0];
    if (!voter) return { allowed: false, message: 'No active voter selected' };

    if (voter.vetoTokensRemaining <= 0) {
      sound.playBuzzer();
      return {
        allowed: false,
        message: `${voter.name} is out of Veto Tokens for the week! Choose another voter or reset tokens.`,
      };
    }

    sound.playBuzzer();

    setHouseholdMembers((prev) =>
      prev.map((m) =>
        m.id === memberId
          ? { ...m, vetoTokensRemaining: Math.max(0, m.vetoTokensRemaining - 1) }
          : m
      )
    );

    const nextRejections = consecutiveRejections + 1;
    setConsecutiveRejections(nextRejections);
    setCurrentBallot({});

    if (proposedMeal) {
      setVoteLogs((prev) => [
        {
          id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          mealId: proposedMeal.id,
          mealTitle: proposedMeal.title,
          memberId: voter.id,
          memberName: voter.name,
          decision: 'no',
          timestamp: new Date().toISOString(),
          reason: reason || 'Vetoed on payline',
        },
        ...prev,
      ]);
    }

    if (nextRejections >= 3) {
      sound.playTakeawayAlarm();
      setTakeawayOverrideActive(true);
      setActiveView(1);
    } else {
      setActiveView(0);
      setTimeout(() => {
        spin();
      }, 300);
    }

    return { allowed: true };
  };

  // Shared voting room: phones with the same code see one proposed dinner and one ballot.
  const [roomCode, setRoomCode] = useState<string>(() => loadStored('room', ''));
  const [roomError, setRoomError] = useState<string | null>(null);
  const roomVersion = useRef(0);
  const roomSynced = useRef('');

  const roomPayload = () => ({ members: householdMembers, proposedMeal, agreedMeal, ballot: currentBallot, targetTime: targetEatingTime });

  const rememberRoom = (code: string) => {
    setRoomCode(code);
    try {
      localStorage.setItem(`${STORAGE_KEY}_room`, JSON.stringify(code));
    } catch {
      // ignore
    }
  };

  const createRoom = async (): Promise<boolean> => {
    setRoomError(null);
    try {
      const payload = roomPayload();
      const res = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: payload }) });
      if (!res.ok) throw new Error('create failed');
      const data = await res.json();
      roomVersion.current = data.version;
      roomSynced.current = JSON.stringify(payload);
      rememberRoom(data.code);
      return true;
    } catch {
      setRoomError('Could not start a room. Check your connection and try again.');
      return false;
    }
  };

  const joinRoom = async (rawCode: string): Promise<boolean> => {
    setRoomError(null);
    const code = rawCode.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (code.length !== 4) {
      setRoomError('Room codes are 4 characters.');
      return false;
    }
    try {
      const res = await fetch(`/api/rooms/${code}`);
      if (res.status === 404) {
        setRoomError('No room with that code. It may have expired.');
        return false;
      }
      if (!res.ok) throw new Error('join failed');
      const data = await res.json();
      roomVersion.current = 0; // force the poll below to apply this state
      applyRoom(data);
      rememberRoom(data.code);
      return true;
    } catch {
      setRoomError('Could not reach the room. Check your connection and try again.');
      return false;
    }
  };

  const leaveRoom = () => {
    roomVersion.current = 0;
    roomSynced.current = '';
    setRoomError(null);
    rememberRoom('');
  };

  const applyRoom = (data: { version: number; state: any }) => {
    const st = data.state || {};
    roomVersion.current = data.version;
    roomSynced.current = JSON.stringify({
      members: st.members ?? [],
      proposedMeal: st.proposedMeal ?? null,
      agreedMeal: st.agreedMeal ?? null,
      ballot: st.ballot ?? {},
      targetTime: st.targetTime,
    });
    if (Array.isArray(st.members) && st.members.length > 0) setHouseholdMembers(st.members);
    const newProposal = st.proposedMeal?.id && st.proposedMeal.id !== proposedMeal?.id;
    setProposedMeal(st.proposedMeal ?? null);
    setCurrentBallot(st.ballot ?? {});
    if (st.targetTime) setTargetEatingTime(st.targetTime);
    if (st.agreedMeal) {
      if (agreedMeal?.id !== st.agreedMeal.id) generateReverseTimers(st.targetTime || targetEatingTime, st.agreedMeal);
      setAgreedMeal(st.agreedMeal);
    } else {
      setAgreedMeal(null);
    }
    if (newProposal && !st.agreedMeal) setActiveView(3);
  };

  // Push local changes to the room.
  useEffect(() => {
    if (!roomCode) return;
    const payload = roomPayload();
    const json = JSON.stringify(payload);
    if (json === roomSynced.current) return;
    roomSynced.current = json;
    fetch(`/api/rooms/${roomCode}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: payload }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) roomVersion.current = data.version;
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, householdMembers, proposedMeal, agreedMeal, currentBallot, targetEatingTime]);

  // Pull other phones' changes every couple of seconds.
  useEffect(() => {
    if (!roomCode) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/rooms/${roomCode}`);
        if (stopped) return;
        if (res.status === 404) {
          setRoomError('That room has expired. You are voting on this phone only again.');
          leaveRoom();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        // Don't overwrite a change of ours that hasn't been sent yet.
        if (data.version > roomVersion.current && JSON.stringify(roomPayload()) === roomSynced.current) applyRoom(data);
      } catch {
        // offline: try again next tick
      }
    };
    const id = window.setInterval(poll, 2000);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, householdMembers, proposedMeal, agreedMeal, currentBallot, targetEatingTime]);

  // In a room everyone votes as themselves on their own phone.
  useEffect(() => {
    if (!roomCode || !meId) return;
    const idx = householdMembers.findIndex((m) => m.id === meId);
    if (idx !== -1) setActiveVoterIndex(idx);
  }, [roomCode, meId, householdMembers, currentBallot]);

  const meName = () => householdMembers.find((m) => m.id === meId)?.name;

  const setMeId = (id: string) => {
    setMeIdState(id);
    try {
      localStorage.setItem(`${STORAGE_KEY}_me`, JSON.stringify(id));
    } catch {
      // ignore
    }
  };

  const addCupboardItems = (items: { name: string; shelf?: string; quantity?: string }[]) =>
    setCupboard((prev) => {
      let next = [...prev];
      for (const raw of items) {
        const name = raw.name?.trim().slice(0, 80);
        if (!name) continue;
        const at = next.findIndex((c) => c.name.toLowerCase() === name.toLowerCase());
        // Adding something already there means it has been restocked.
        if (at >= 0) next[at] = { ...next[at], low: false, quantity: raw.quantity || next[at].quantity };
        else next = [{ id: newCupboardId(), name, shelf: raw.shelf || guessShelf(name), quantity: raw.quantity || undefined, addedBy: meName() }, ...next];
      }
      return next.slice(0, 400);
    });
  const setCupboardLow = (id: string, low: boolean) => {
    const item = cupboard.find((c) => c.id === id);
    setCupboard((prev) => prev.map((c) => (c.id === id ? { ...c, low } : c)));
    // Running low puts it straight on the shared shopping list.
    if (low && item) addShoppingItems([item.name], 'the cupboard');
  };
  const removeCupboardItem = (id: string) => setCupboard((prev) => prev.filter((c) => c.id !== id));

  const addShoppingItems = (names: string[], forMeal?: string) =>
    queueShopping(
      names
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => ({ type: 'add' as const, item: { id: newShoppingId(), name, forMeal, addedBy: meName() } }))
    );
  const shopForWeek = (): number => {
    const names = weekShopping(
      tidyPlan(weekPlan, new Date(), meals),
      meals,
      pantry,
      inStock,
      shoppingList.map((i) => i.name)
    );
    if (names.length) addShoppingItems(names, 'this week’s plan');
    return names.length;
  };
  const removeShoppingByName = (name: string) => queueShopping([{ type: 'removeByName', name }]);
  const toggleShoppingItem = (id: string) => queueShopping([{ type: 'toggle', id, by: meName() }]);
  const removeShoppingItem = (id: string) => queueShopping([{ type: 'remove', id }]);
  const clearCheckedShopping = () => queueShopping([{ type: 'clearChecked' }]);

  // ---------- World Kitchen, tweaks, "not for us" ----------
  const addFromLibrary = (id: string): Meal | null => {
    const dish = WORLD_RECIPES.find((r) => r.id === id);
    if (!dish) return null;
    setRejectedMealIds((prev) => prev.filter((r) => r !== id));
    setMeals((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, dish]));
    sound.playHold();
    return dish;
  };

  /** Hide a dish for good and bring in a similar one from the World Kitchen in its place. */
  const rejectMeal = (id: string): Meal | null => {
    const gone = meals.find((m) => m.id === id);
    if (!gone) return null;
    // Only dishes that can come back (World Kitchen, starters) go on the hidden list; our own recipes are simply removed.
    const restorable = WORLD_RECIPES.some((r) => r.id === id) || INITIAL_MEALS.some((m) => m.id === id);
    const hidden = new Set(restorable ? [...rejectedMealIds, id] : rejectedMealIds);
    const inRotation = new Set(meals.map((m) => m.id));
    const candidates = WORLD_RECIPES.filter(
      (r) =>
        !hidden.has(r.id) &&
        !inRotation.has(r.id) &&
        mealFitsDiets(r.ingredients, effDiets) &&
        !mentionsAny([r.title, ...r.ingredients], effBanned)
    );
    const score = (r: Meal) =>
      lovedCount(r, likedIngredients) * 3 +
      (r.cuisine === gone.cuisine ? 4 : 0) +
      (r.timeStake === gone.timeStake ? 2 : 0) +
      (r.effort === gone.effort ? 1 : 0) +
      Math.random();
    const replacement = candidates.sort((a, b) => score(b) - score(a))[0] || null;

    setRejectedMealIds([...hidden]);
    setMeals((prev) => {
      const next = prev.filter((m) => m.id !== id);
      return replacement ? [...next, replacement] : next;
    });
    if (activeMealResult?.id === id) setActiveMealResult(replacement);
    if (proposedMeal?.id === id) setProposedMeal(null);
    sound.playBuzzer();
    return replacement;
  };

  const hideLibraryRecipe = (id: string) => {
    setRejectedMealIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
    sound.playBuzzer();
  };

  const restoreRejected = (id: string) => {
    setRejectedMealIds((prev) => prev.filter((r) => r !== id));
    const dish = WORLD_RECIPES.find((r) => r.id === id) || INITIAL_MEALS.find((m) => m.id === id);
    if (dish) setMeals((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, dish]));
  };

  const setMealPhoto = (id: string, imageUrl: string, credit: Meal['photoCredit']) => {
    const apply = (m: Meal) => (m.id === id ? { ...m, imageUrl, photoCredit: credit } : m);
    setMeals((prev) => prev.map(apply));
    setActiveMealResult((prev) => (prev ? apply(prev) : prev));
  };

  // Recipes the family added get a stock photo from Wikimedia Commons, one at a time, and each is only tried once.
  useEffect(() => {
    const TRIED_KEY = `${STORAGE_KEY}_photo_tried`;
    let tried: string[] = [];
    try {
      tried = JSON.parse(localStorage.getItem(TRIED_KEY) || '[]');
    } catch {
      tried = [];
    }
    const next = meals.find((m) => (m.source === 'own' || m.source === 'scanned' || m.source === 'idea') && !m.imageUrl && !tried.includes(m.id));
    if (!next) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/photos/find?title=${encodeURIComponent(next.title)}`);
        const json = res.ok ? await res.json() : null;
        if (cancelled) return;
        localStorage.setItem(TRIED_KEY, JSON.stringify([...tried, next.id].slice(-300)));
        if (json?.photo?.url) setMealPhoto(next.id, json.photo.url, json.photo.credit);
        else setPhotoTick((t) => t + 1);
      } catch {
        // offline: try again next time the app opens
      }
    }, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meals, photoTick]);

  const updateMealTweaks = (id: string, tweaks: MealTweaks) => {
    const apply = (m: Meal) => (m.id === id ? { ...m, tweaks } : m);
    setMeals((prev) => prev.map(apply));
    setActiveMealResult((prev) => (prev ? apply(prev) : prev));
    setProposedMeal((prev) => (prev ? apply(prev) : prev));
    if (agreedMeal?.id === id) {
      const updated = apply(agreedMeal);
      setAgreedMeal(updated);
      generateReverseTimers(targetEatingTime, updated);
    }
  };

  // ---------- Freezer ----------
  const addFreezerItem = (input: { name: string; portions: number; mealId?: string; note?: string }) => {
    const item = createFreezerItem(input);
    if (!item) return;
    sound.playHold();
    queueFreezer([{ type: 'add', item }]);
  };
  const useFreezerPortionById = (id: string) => {
    sound.playHold();
    queueFreezer([{ type: 'tick', id, at: new Date().toISOString() }]);
  };
  const putBackFreezerPortionById = (id: string) => queueFreezer([{ type: 'putBack', id }]);
  const removeFreezerItem = (id: string) => queueFreezer([{ type: 'remove', id }]);
  const restoreFreezerItem = (item: FreezerItem) => queueFreezer([{ type: 'add', item }]);
  const restorePantryItem = (item: PantryItem) => queueFridge([{ type: 'add', item }]);
  const restoreCupboardItem = (item: CupboardItem) =>
    setCupboard((prev) => (prev.some((c) => c.id === item.id) ? prev : [item, ...prev]));
  const clearUsedFreezer = () => queueFreezer([{ type: 'clearUsed' }]);

  // ---------- After-dinner reviews ----------
  const saveLeftovers = (cookLogId: string, route: 'fridge' | 'freezer', portions: number) => {
    const entry = cookLog.find((c) => c.id === cookLogId);
    if (!entry || entry.leftovers) return;
    const n = Math.min(MAX_LEFTOVER_PORTIONS, Math.max(1, Math.round(portions) || 1));
    const meal = meals.find((m) => m.id === entry.mealId);
    if (route === 'freezer') {
      addFreezerItem({ name: entry.title, portions: n, mealId: entry.mealId, note: 'Leftovers' });
    } else {
      addPantryItem(leftoverFridgeItem({ title: entry.title, ingredients: meal?.ingredients, tags: meal?.tags, makesLeftovers: meal?.makesLeftovers }, n));
    }
    setCookLog((prev) => prev.map((c) => (c.id === cookLogId ? { ...c, leftovers: { route, portions: n } } : c)));
  };

  const saveDinnerReviews = (cookLogId: string, reviews: MealReview[]) => {
    const entry = cookLog.find((c) => c.id === cookLogId);
    if (!entry) return;
    const nextLog = cookLog.map((c) => (c.id === cookLogId ? { ...c, reviews } : c));
    setCookLog(nextLog);
    const allStars = nextLog
      .filter((c) => c.mealId === entry.mealId)
      .flatMap((c) => c.reviews || [])
      .map((r) => r.stars)
      .filter((n) => n >= 1);
    if (allStars.length) {
      const avg = Math.round(allStars.reduce((a, b) => a + b, 0) / allStars.length);
      setMeals((prev) => prev.map((m) => (m.id === entry.mealId ? { ...m, rating: avg } : m)));
    }
    sound.playWin();
  };

  // Clears tonight's decision so the household can start a fresh evening.
  const resetEvening = () => {
    setAgreedMeal(null);
    setReverseTimers([]);
    setCurrentBallot({});
    setActiveVoterIndex(0);
    setConsecutiveRejections(0);
    setTakeawayOverrideActive(false);
    setActiveView(0);
  };

  const resetVetoTokens = () => {
    sound.playWin();
    setHouseholdMembers((prev) => prev.map((m) => ({ ...m, vetoTokensRemaining: 3 })));
    setConsecutiveRejections(0);
    setTakeawayOverrideActive(false);
  };

  const addHouseholdMember = (name: string, avatar: string) => {
    if (!name.trim()) return;
    const newMember: HouseholdMember = {
      id: 'm_' + Date.now(),
      name: name.trim(),
      avatar: avatar || '🧑',
      vetoTokensRemaining: 3,
    };
    setHouseholdMembers((prev) => [...prev, newMember]);
  };

  const removeHouseholdMember = (id: string) => {
    if (householdMembers.length <= 1) return;
    setHouseholdMembers((prev) => prev.filter((m) => m.id !== id));
    setActiveVoterIndex(0);
  };

  const toggleTimerStep = (stepId: string) => {
    sound.playHold();
    setReverseTimers((prev) =>
      prev.map((s) => (s.id === stepId ? { ...s, done: !s.done } : s))
    );
  };

  // Pantry freshness toggle
  const togglePantryFreshness = (id: string) => {
    sound.playHold();
    queueFridge([{ type: 'cycle', id }]);
  };

  const addPantryItem = (item: Omit<PantryItem, 'id' | 'addedDate'>) => {
    const newItem: PantryItem = {
      ...item,
      id: 'pantry_' + Date.now() + Math.random().toString(36).substring(2, 6),
      addedDate: new Date().toISOString().slice(0, 10),
    };
    queueFridge([{ type: 'add', item: newItem }]);
  };

  const removePantryItem = (id: string) => {
    queueFridge([{ type: 'remove', id }]);
  };

  const logDailyEntry: DinnerContextType['logDailyEntry'] = (input) => {
    const iso = input.date || new Date().toISOString();
    const entry: DailyLogEntry = {
      id: newDailyLogId(),
      date: iso,
      day: todayDayKey(new Date(iso)),
      slot: input.slot,
      kind: input.kind,
      title: input.title.trim() || (input.kind === 'ingredients' ? 'Used ingredients' : 'Meal'),
      ...(input.mealId ? { mealId: input.mealId } : {}),
      ...(input.cuisine ? { cuisine: input.cuisine } : {}),
      usedItems: input.usedItems,
      loggedBy: meName(),
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    };

    setDailyLog((prev) => [entry, ...prev].slice(0, 300));

    // Apply stock deductions across Fridge, Cupboard, and Freezer.
    const toRestock: string[] = [];
    for (const item of input.usedItems) {
      if (item.source === 'fridge' && item.sourceId) {
        removePantryItem(item.sourceId);
      } else if (item.source === 'cupboard' && item.sourceId) {
        if (item.action === 'removed') {
          removeCupboardItem(item.sourceId);
        } else {
          setCupboard((prev) => prev.map((c) => (c.id === item.sourceId ? { ...c, low: true } : c)));
        }
      } else if (item.source === 'freezer' && item.sourceId) {
        useFreezerPortionById(item.sourceId);
      }
      if (item.addedToShop && item.name.trim()) {
        toRestock.push(item.name.trim());
      }
    }
    if (toRestock.length > 0) {
      addShoppingItems(toRestock, 'Restock');
    }
    return entry;
  };

  const deleteDailyEntry = (id: string) => {
    setDailyLog((prev) => prev.filter((e) => e.id !== id));
  };

  const restockSuggestions = useMemo(
    () =>
      computeRestockSuggestions({
        dailyLog,
        pantry,
        cupboard,
        freezer,
        shoppingList,
      }),
    [dailyLog, pantry, cupboard, freezer, shoppingList]
  );

  const addStaple = (name: string) => {
    if (!name.trim()) return;
    setStaples((prev) => Array.from(new Set([...prev, name.trim()])));
  };

  const removeStaple = (name: string) => {
    setStaples((prev) => prev.filter((s) => s !== name));
  };

  /** Applies a taste change to the recipe book and tidies anything that was on screen. */
  const applyTaste = (result: TasteResult) => {
    setMeals(result.meals);
    setShelvedMeals(result.shelved);
    const gone = new Set(result.removed.map((m) => m.id));
    if (activeMealResult && gone.has(activeMealResult.id)) setActiveMealResult(null);
  };

  const toggleBannedIngredient = (name: string): string | null => {
    const clean = name.trim().slice(0, 40);
    if (!clean) return null;
    sound.playHold();
    const exists = bannedIngredients.some((b) => b.toLowerCase() === clean.toLowerCase());
    const nextBanned = exists
      ? bannedIngredients.filter((b) => b.toLowerCase() !== clean.toLowerCase())
      : [...bannedIngredients, clean];
    setBannedIngredients(nextBanned);
    const result = adaptRecipes({
      meals,
      shelved: shelvedMeals,
      rejectedIds: rejectedMealIds,
      banned: nextBanned,
      loved: likedIngredients,
      diets: effDiets,
      library: WORLD_RECIPES,
    });
    applyTaste(result);
    return describeTasteChange(result, { never: clean });
  };

  const addLikedIngredient = (name: string): string | null => {
    const clean = name.trim().slice(0, 40);
    if (!clean || likedIngredients.some((l) => l.toLowerCase() === clean.toLowerCase())) return null;
    sound.playHold();
    const nextLiked = [...likedIngredients, clean].slice(0, 30);
    setLikedIngredients(nextLiked);
    const result = adaptRecipes({
      meals,
      shelved: shelvedMeals,
      rejectedIds: rejectedMealIds,
      banned: bannedIngredients,
      loved: nextLiked,
      diets: effDiets,
      library: WORLD_RECIPES,
      extraSlots: 3,
      mustContain: clean,
    });
    applyTaste(result);
    return (
      describeTasteChange(result, { love: clean }) ||
      `No new dishes with ${clean} in the World Kitchen that suit your household, but ${clean} now counts when picking replacements.`
    );
  };

  const removeLikedIngredient = (name: string) => {
    setLikedIngredients((prev) => prev.filter((l) => l.toLowerCase() !== name.toLowerCase()));
  };

  const addMeal = (
    newMealData: Omit<Meal, 'id' | 'rating' | 'cookCount' | 'lastCookedDate' | 'isFavorite'>
  ): Meal => {
    const newMeal: Meal = {
      ...newMealData,
      id: 'meal_' + Date.now(),
      rating: 0,
      cookCount: 0,
      lastCookedDate: null,
      isFavorite: false,
    };
    setMeals((prev) => [newMeal, ...prev]);
    return newMeal;
  };

  const deleteMeal = (id: string) => {
    setMeals((prev) => prev.filter((m) => m.id !== id));
  };

  const toggleFavoriteMeal = (id: string) => {
    sound.playHold();
    setMeals((prev) =>
      prev.map((m) => (m.id === id ? { ...m, isFavorite: !m.isFavorite } : m))
    );
    if (activeMealResult?.id === id) {
      setActiveMealResult((prev) => (prev ? { ...prev, isFavorite: !prev.isFavorite } : null));
    }
  };

  const rateMeal = (id: string, stars: number) => {
    sound.playWin();
    setMeals((prev) => prev.map((m) => (m.id === id ? { ...m, rating: stars } : m)));
    if (activeMealResult?.id === id) {
      setActiveMealResult((prev) => (prev ? { ...prev, rating: stars } : null));
    }
  };

  const recordMealCooked = (id: string): { rescuedRedItems: string[] } => {
    sound.playWin();
    const targetMeal =
      meals.find((m) => m.id === id) ||
      (agreedMeal?.id === id ? agreedMeal : null) ||
      activeMealResult;

    const rescuedRedItems: string[] = [];

    if (targetMeal) {
      const matchInfo = calculateMealPantryMatch(targetMeal, pantry, inStock);
      rescuedRedItems.push(...matchInfo.redMatchedItems);

      if (rescuedRedItems.length > 0) {
        setRescuedItemsCount((prev) => prev + rescuedRedItems.length);
        // Remove rescued Red items from fridge since they were cooked!
        queueFridge([{ type: 'removeUseNextByNames', names: rescuedRedItems }]);
      }
    }

    if (targetMeal) {
      setCookLog((prev) => [
        {
          id: 'clog_' + Date.now(),
          mealId: targetMeal.id,
          title: targetMeal.title,
          cuisine: targetMeal.cuisine,
          date: new Date().toISOString(),
          rescued: rescuedRedItems,
        },
        ...prev,
      ]);
    }

    setMeals((prev) => {
      const exists = prev.some((m) => m.id === id);
      if (exists) {
        return prev.map((m) =>
          m.id === id
            ? {
                ...m,
                cookCount: m.cookCount + 1,
                lastCookedDate: new Date().toISOString(),
              }
            : m
        );
      } else if (targetMeal) {
        // If it was a custom 3-reel or Sunday combo meal, save it into the Meal Vault!
        return [
          {
            ...targetMeal,
            cookCount: 1,
            lastCookedDate: new Date().toISOString(),
          },
          ...prev,
        ];
      }
      return prev;
    });

    return { rescuedRedItems };
  };

  const updateUsualOrder = (takeawayId: string, memberName: string, orderText: string) => {
    const known = takeawayPool.find((t) => t.id === takeawayId);
    setTakeaways((prevRaw) => {
      const prev = !prevRaw.some((t) => t.id === takeawayId) && known ? [known, ...prevRaw] : prevRaw;
      return prev.map((t) => {
        if (t.id === takeawayId) {
          const updatedOrders = t.usualOrders.map((uo) =>
            uo.memberName === memberName ? { ...uo, order: orderText } : uo
          );
          if (!updatedOrders.some((uo) => uo.memberName === memberName)) {
            updatedOrders.push({ memberName, order: orderText });
          }
          const updated = { ...t, usualOrders: updatedOrders };
          if (winningTakeaway?.id === takeawayId) {
            setWinningTakeaway(updated);
          }
          return updated;
        }
        return t;
      });
    });
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => ({ ...prev, ...updates }));
  };

  // OAuth2 and Cloud Sync
  const syncWithCloud = async (): Promise<boolean> => {
    setIsSyncing(true);
    try {
      if (!householdRef.current) return false;
      const res = await fetch('/api/sync/cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          data: {
            userProfile,
            meals,
            pantry: storedPantry,
            staples,
            cupboard,
            takeaways,
            members: householdMembers,
            banned: bannedIngredients,
            liked: likedIngredients,
            shelved: shelvedMeals,
            diets,
            dietMode,
            weekPlan,
            weekThemes,
            voteLogs,
            rescuedItemsCount,
            cookLog,
            takeawayLog,
            rejectedMealIds,
            freezer,
          },
        }),
      });
      if (res.ok) {
        setUserProfile((prev) => ({
          ...prev,
          lastSyncedAt: new Date().toISOString(),
        }));
        sound.playWin();
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const importBackupData = (rawData: any): { success: boolean; message: string } => {
    const check = checkBackup(rawData);
    if (!check.ok) return { success: false, message: check.error };
    const payload = check.payload;
    let restoredCount = 0;
    if (Array.isArray(payload.meals) && payload.meals.length > 0) {
      setMeals(payload.meals);
      restoredCount += payload.meals.length;
    }
    if (Array.isArray(payload.pantry)) queueFridge([{ type: 'replaceAll', items: payload.pantry }]);
    if (Array.isArray(payload.staples)) setStaples(payload.staples);
    if (Array.isArray(payload.cupboard)) {
      setCupboard(payload.cupboard.filter((c: any) => c && typeof c.name === 'string' && typeof c.id === 'string'));
    }
    if (Array.isArray(payload.takeaways)) setTakeaways(payload.takeaways);
    if (Array.isArray(payload.members || payload.householdMembers)) {
      setHouseholdMembers(payload.members || payload.householdMembers);
    }
    if (Array.isArray(payload.banned || payload.bannedIngredients)) {
      setBannedIngredients(payload.banned || payload.bannedIngredients);
    }
    if (Array.isArray(payload.liked) && payload.liked.every((x: unknown) => typeof x === 'string')) {
      setLikedIngredients(payload.liked.slice(0, 30));
    }
    if (Array.isArray(payload.shelved)) setShelvedMeals(payload.shelved);
    if (Array.isArray(payload.diets)) setDiets(payload.diets.filter(isDietId));
    if (isDietMode(payload.dietMode)) setDietModeState(payload.dietMode);
    if (payload.weekPlan && typeof payload.weekPlan === 'object' && !Array.isArray(payload.weekPlan)) {
      setWeekPlan(
        Object.fromEntries(
          Object.entries(payload.weekPlan as Record<string, any>).filter(
            ([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && v && typeof v.mealId === 'string' && typeof v.title === 'string'
          )
        ) as WeekPlan
      );
    }
    if (payload.weekThemes && typeof payload.weekThemes === 'object' && !Array.isArray(payload.weekThemes)) {
      setWeekThemes(
        Object.fromEntries(
          Object.entries(payload.weekThemes as Record<string, any>).filter(
            ([k, v]) => /^[0-6]$/.test(k) && THEMES.some((t) => t.id === v)
          )
        ) as Record<number, ThemeId>
      );
    }
    if (Array.isArray(payload.voteLogs)) setVoteLogs(payload.voteLogs);
    if (typeof payload.rescuedItemsCount === 'number') setRescuedItemsCount(payload.rescuedItemsCount);
    if (Array.isArray(payload.cookLog)) {
      historyReplace.current = true; // a restore replaces the shared history instead of merging into it
      setCookLog(payload.cookLog);
    }
    if (Array.isArray(payload.takeawayLog)) setTakeawayLog(payload.takeawayLog);
    if (Array.isArray(payload.rejectedMealIds)) setRejectedMealIds(payload.rejectedMealIds);
    if (Array.isArray(payload.freezer)) queueFreezer([{ type: 'replaceAll', items: sanitizeFreezer(payload.freezer) }]);
    // Keep this device's own identity; only the display name and last-saved time carry over.
    setUserProfile((prev) => ({
      ...prev,
      name: typeof payload.userProfile?.name === 'string' ? payload.userProfile.name.slice(0, 60) : prev.name,
      lastSyncedAt: new Date().toISOString(),
    }));
    // Voting state refers to the old household, so start tonight afresh.
    setActiveVoterIndex(0);
    setCurrentBallot({});
    sound.playWin();
    return {
      success: true,
      message: `Restored ${restoredCount || meals.length} recipes and your kitchen inventory.`,
    };
  };

  /** Fetches the household's saved copy and checks it. Nothing on this device changes until the caller applies it. */
  const fetchCloudSnapshot = async (): Promise<{ success: boolean; message: string; check?: BackupCheck }> => {
    if (!householdRef.current) {
      return { success: false, message: 'Turn on household sharing first, then save a copy.' };
    }
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/cloud', { headers: authHeaders() });
      if (res.status === 401) return { success: false, message: 'This household code is no longer valid.' };
      if (!res.ok) return { success: false, message: 'Couldn’t reach the server.' };
      const json = await res.json();
      if (!json?.data) {
        return { success: false, message: 'No saved copy yet. Press “Save copy” on the phone that has your recipes.' };
      }
      const check = checkBackup(json.data);
      if (!check.ok) return { success: false, message: check.error };
      return { success: true, message: 'ok', check };
    } catch {
      return { success: false, message: 'Network error while contacting the server.' };
    } finally {
      setIsSyncing(false);
    }
  };

  const saveHousehold = (h: { id: string; key: string } | null) => {
    setHousehold(h);
    householdRef.current = h;
    try {
      if (h) localStorage.setItem(`${STORAGE_KEY}_household`, JSON.stringify(h));
      else localStorage.removeItem(`${STORAGE_KEY}_household`);
    } catch {
      // storage blocked; the code still works for this session
    }
  };

  const createHousehold = async (): Promise<{ success: boolean; message: string }> => {
    try {
      const res = await fetch('/api/households', { method: 'POST' });
      if (res.status === 429) return { success: false, message: 'Too many attempts. Try again in a while.' };
      if (!res.ok) return { success: false, message: 'Couldn’t reach the server.' };
      const json = await res.json();
      saveHousehold({ id: json.householdId, key: json.key });
      return { success: true, message: 'Sharing is on.' };
    } catch {
      return { success: false, message: 'Couldn’t reach the server.' };
    }
  };

  const joinHousehold = async (code: string): Promise<{ success: boolean; message: string }> => {
    const [id, key] = code.trim().split('.');
    if (!id || !key) return { success: false, message: 'That code doesn’t look right.' };
    try {
      const res = await fetch('/api/households/me', { headers: { 'x-household-id': id, 'x-household-key': key } });
      if (res.status === 401) return { success: false, message: 'That code wasn’t recognised.' };
      if (!res.ok) return { success: false, message: 'Couldn’t reach the server.' };
      saveHousehold({ id, key });
      // Tell the group, so whoever sent the invite sees that it was used.
      fetch('/api/households/joined', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-household-id': id, 'x-household-key': key },
        body: JSON.stringify({ name: householdMembers.find((m) => m.id === meId)?.name || 'Someone new' }),
      }).catch(() => {});
      return { success: true, message: 'Joined. The shopping list is now shared.' };
    } catch {
      return { success: false, message: 'Couldn’t reach the server.' };
    }
  };

  const leaveHousehold = () => {
    saveHousehold(null);
    setShoppingOnline(null);
    setGoogleProfile(null);
    setFamilyNames([]);
    try {
      localStorage.removeItem(`${STORAGE_KEY}_google_profile`);
    } catch {
      // ignore
    }
  };

  // Is Google sign-in set up on this server? (Decides whether the button is shown at all.)
  useEffect(() => {
    let live = true;
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j && typeof j.googleClientId === 'string' && j.googleClientId) setGoogleClientId(j.googleClientId);
        if (live && j && j.aiEnabled === true) setAiEnabled(true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  // Who else is in the family group, for the "Mum and Dad are in" line, and who has just joined.
  // Polled while the app is open, so the person who sent an invite finds out when it is used.
  const [newJoiners, setNewJoiners] = useState<string[]>([]);
  const seenJoinsKey = household ? `${STORAGE_KEY}_seen_joins_${household.id}` : '';
  const [joinedTotal, setJoinedTotal] = useState(0);
  useEffect(() => {
    if (!household) {
      setNewJoiners([]);
      return;
    }
    let live = true;
    const check = () => {
      fetch('/api/households/me', { headers: { 'x-household-id': household.id, 'x-household-key': household.key } })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          if (!live || !j) return;
          if (Array.isArray(j.familyNames)) setFamilyNames(j.familyNames.map(String));
          const joined: { name: string; at: string }[] = Array.isArray(j.joined) ? j.joined : [];
          setJoinedTotal(joined.length);
          let seen: number | null = null;
          try {
            const raw = localStorage.getItem(seenJoinsKey);
            seen = raw === null ? null : Number(raw);
          } catch {
            // storage blocked: fall back to what this session has seen
          }
          if (seen === null || Number.isNaN(seen)) {
            // First look at this group on this phone: whoever is already in is not news.
            try {
              localStorage.setItem(seenJoinsKey, String(joined.length));
            } catch {
              // ignore
            }
            return;
          }
          const fresh = joined.slice(seen).map((x) => String(x.name || 'Someone new'));
          setNewJoiners(fresh);
        })
        .catch(() => {});
    };
    check();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check();
    }, 15000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      live = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [household, seenJoinsKey]);

  const dismissJoiners = () => {
    try {
      if (seenJoinsKey) localStorage.setItem(seenJoinsKey, String(joinedTotal));
    } catch {
      // ignore
    }
    setNewJoiners([]);
  };

  // A system notification too, when allowed, for people who have the app open in another tab or app.
  const notifiedJoins = useRef('');
  useEffect(() => {
    if (newJoiners.length === 0) return;
    const text = `${newJoiners.join(' and ')} joined your family group`;
    if (notifiedJoins.current === text) return;
    notifiedJoins.current = text;
    if (document.visibilityState !== 'visible') void showStepNotification('Dinner Spinner', text, 'family-join');
  }, [newJoiners]);

  const signInWithGoogle = async (
    credential: string,
    joinCode?: string
  ): Promise<{ success: boolean; message: string; created?: boolean }> => {
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credential, joinCode }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return { success: false, message: j.error || 'Google sign-in didn’t work. Try again.' };
      saveHousehold({ id: j.householdId, key: j.key });
      const profile = {
        name: String(j.profile?.name || ''),
        email: String(j.profile?.email || ''),
        picture: String(j.profile?.picture || ''),
      };
      setGoogleProfile(profile);
      setFamilyNames(Array.isArray(j.familyNames) ? j.familyNames.map(String) : []);
      try {
        localStorage.setItem(`${STORAGE_KEY}_google_profile`, JSON.stringify(profile));
      } catch {
        // ignore
      }
      return {
        success: true,
        created: Boolean(j.created),
        message: j.created ? 'Your family group is ready.' : 'Signed in. You’re in your family group.',
      };
    } catch {
      return { success: false, message: 'Couldn’t reach the server.' };
    }
  };

  // ---- Live vote: every phone in the household votes on one proposal -------
  const [tonight, setTonight] = useState<LiveVote | null>(null);
  const appliedRound = useRef<number>(loadStored('live_round', 0));

  const refreshTonight = useCallback(async () => {
    if (!householdRef.current) {
      setTonight(null);
      return;
    }
    try {
      const res = await fetch('/api/tonight', { headers: authHeaders() });
      if (res.ok) setTonight((await res.json()) as LiveVote);
    } catch {
      // offline: keep what we last saw
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    refreshTonight();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refreshTonight();
    }, 3000);
    // Coming back to the app (from a notification, or just switching apps) shows the vote at once.
    const onShow = () => {
      if (document.visibilityState === 'visible') refreshTonight();
    };
    document.addEventListener('visibilitychange', onShow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onShow);
    };
  }, [refreshTonight, household]);

  const sendLive = async (body: Record<string, unknown>): Promise<{ ok: boolean; message?: string }> => {
    if (!householdRef.current) return { ok: false, message: 'Turn on sharing first.' };
    try {
      const res = await fetch('/api/tonight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (json?.status) setTonight(json as LiveVote);
      else if (json?.tonight?.status) setTonight(json.tonight as LiveVote);
      if (!res.ok) return { ok: false, message: json?.error || 'That didn’t go through.' };
      return { ok: true };
    } catch {
      return { ok: false, message: 'Couldn’t reach the server.' };
    }
  };

  const startLiveVote = async (meal: Meal) => {
    const people = householdMembers.map((m) => m.name);
    // The server counts the sender as a yes and needs a strict majority, so someone else always has a say.
    const r = await sendLive({ op: 'propose', meal, people, by: myVoteName() });
    if (r.ok) {
      setProposedMeal(meal);
      setAgreedMeal(null);
      setCurrentBallot({});
      setActiveView(3);
    }
    return r;
  };
  const sendToFamily = async (meal: Meal) => {
    setVoteSend({ mealId: meal.id, state: 'sending' });
    const r = await startLiveVote(meal);
    setVoteSend(r.ok ? { mealId: meal.id, state: 'sent' } : { mealId: meal.id, state: 'failed', message: r.message || 'Couldn’t send the vote.' });
    return r;
  };
  const retrySendToVote = () => {
    if (proposedMeal) void sendToFamily(proposedMeal);
  };
  const castLiveVote = (voter: string, vote: 'yes' | 'no') => sendLive({ op: 'vote', voter, vote });
  const decideLive = () => sendLive({ op: 'decide', by: myVoteName() });
  const clearLive = () => sendLive({ op: 'clear' });
  const cancelVote = async (): Promise<{ ok: boolean; message?: string }> => {
    if (tonight?.status === 'open' && proposedMeal && tonight.meal?.id === proposedMeal.id) {
      const r = await sendLive({ op: 'cancel', by: myVoteName() });
      // Someone else finished it first: the vote card now shows what happened instead.
      if (!r.ok) return r;
    } else if (tonight?.status === 'vetoed' || tonight?.status === 'cancelled') {
      await clearLive();
    }
    setVoteSend(null);
    setProposedMeal(null);
    setCurrentBallot({});
    setActiveVoterIndex(0);
    setActiveView(0);
    return { ok: true };
  };

  // ---- Telling this phone what the others did ------------------------------
  const [liveAs, setLiveAs] = useState<string>(() => {
    try {
      return localStorage.getItem('ds_live_as') || '';
    } catch {
      return '';
    }
  });
  const myVoteName = (): string => liveAs || meName() || '';
  const setVoteIdentity = (name: string) => {
    const clean = name.trim().slice(0, 30);
    setLiveAs(clean);
    try {
      if (clean) localStorage.setItem('ds_live_as', clean);
      else localStorage.removeItem('ds_live_as');
    } catch {
      // ignore
    }
    const m = householdMembers.find((x) => x.name.toLowerCase() === clean.toLowerCase());
    if (m) setMeId(m.id);
  };
  const [voteNews, setVoteNews] = useState<{ id: string; text: string; tone: 'sage' | 'tomato' | 'neutral'; proposal?: boolean } | null>(null);
  const prevTonight = useRef<LiveVote | null>(null);
  useEffect(() => {
    const prev = prevTonight.current;
    prevTonight.current = tonight;
    if (!tonight || !prev || !tonight.meal) return; // first look after opening: the banner shows any open vote
    const me = myVoteName().toLowerCase();
    const isMe = (name: string) => !!name && name.toLowerCase() === me;
    const dish = tonight.meal.title;
    let news: { text: string; tone: 'sage' | 'tomato' | 'neutral'; proposal?: boolean } | null = null;
    if (tonight.round !== prev.round) {
      if (tonight.status === 'open' && !isMe(tonight.proposedBy)) {
        news = { text: `${tonight.proposedBy || 'Someone'} wants your vote: ${dish}.`, tone: 'neutral', proposal: true };
      }
    } else {
      const newYes = Object.keys(tonight.ballot).filter((p) => tonight.ballot[p] === 'yes' && prev.ballot[p] !== 'yes' && !isMe(p));
      if (tonight.status === 'agreed' && prev.status !== 'agreed') {
        news = { text: `Dinner’s agreed: ${dish}.${newYes.length ? ` ${newYes.join(' and ')} said yes.` : ''}`, tone: 'sage' };
      } else if (tonight.status === 'cancelled' && prev.status !== 'cancelled' && !isMe(tonight.cancelledBy || '')) {
        news = { text: `${tonight.cancelledBy || 'Someone'} cancelled the vote on ${dish}.`, tone: 'neutral' };
      } else if (tonight.status === 'vetoed' && prev.status !== 'vetoed' && !isMe(tonight.vetoedBy)) {
        news = { text: `${tonight.vetoedBy} vetoed ${dish}. Spin again for something else.`, tone: 'tomato' };
      } else if (newYes.length) {
        const yes = Object.values(tonight.ballot).filter((v) => v === 'yes').length;
        news = { text: `${newYes.join(' and ')} said yes to ${dish}. ${yes} of ${tonight.needed} so far.`, tone: 'sage' };
      }
    }
    if (!news) return;
    setVoteNews({ ...news, id: `${tonight.round}_${tonight.version}` });
    sound.playHold();
    try {
      if ((navigator as any).userActivation?.hasBeenActive) navigator.vibrate?.([150, 80, 150]);
    } catch {
      // not supported
    }
    // In another tab or app: show a system notification, unless the server's push already did.
    if (document.visibilityState !== 'visible' && !pushIsOn()) void showStepNotification('Dinner Spinner', news.text, 'tonight-vote');
  }, [tonight]);

  // Keep this phone's push subscription current (keys can change; the owner's name can change).
  useEffect(() => {
    if (!household || !pushIsOn()) return;
    const name = myVoteName();
    if (name) void syncPush(name, authHeaders(), false);
  }, [household, meId, liveAs]);

  // Tapping a vote notification while the app is open goes to Tonight (or the notification's target view).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-tonight') {
        const nextView = typeof e.data.url === 'string' ? viewFromPath(e.data.url) : null;
        setActiveView(nextView ?? 3);
        refreshTonight();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [refreshTonight, setActiveView]);

  // A vote opened on another phone shows up here too, ready to vote on.
  const seenOpenRound = useRef(0);
  useEffect(() => {
    if (!tonight || tonight.status !== 'open' || !tonight.meal) return;
    if (seenOpenRound.current === tonight.round) return;
    seenOpenRound.current = tonight.round;
    const local = meals.find((m) => m.id === tonight.meal!.id);
    setProposedMeal(
      local || ({ ...tonight.meal, rating: 0, isFavorite: false, cookCount: 0, lastCookedDate: null } as Meal)
    );
    setAgreedMeal(null);
    setCurrentBallot({});
  }, [tonight]);

  // Cancelled on another phone: nothing left to vote on here either.
  useEffect(() => {
    if (!tonight || tonight.status !== 'cancelled' || !tonight.meal || agreedMeal) return;
    const id = tonight.meal.id;
    setProposedMeal((prev) => (prev && prev.id === id ? null : prev));
    setVoteSend((prev) => (prev && prev.mealId === id ? null : prev));
  }, [tonight]);

  // When the household agrees, every phone lands on the same dinner and timeline.
  useEffect(() => {
    if (!tonight || tonight.status !== 'agreed' || !tonight.meal) return;
    if (appliedRound.current === tonight.round) return;
    appliedRound.current = tonight.round;
    try {
      localStorage.setItem(`${STORAGE_KEY}_live_round`, JSON.stringify(tonight.round));
    } catch {
      // ignore
    }
    const local = meals.find((m) => m.id === tonight.meal!.id);
    const meal: Meal =
      local || ({ ...tonight.meal, rating: 0, isFavorite: false, cookCount: 0, lastCookedDate: null } as Meal);
    setProposedMeal(meal);
    setAgreedMeal(meal);
    setCurrentBallot({});
    setConsecutiveRejections(0);
    setTakeawayOverrideActive(false);
    generateReverseTimers(targetEatingTime, meal);
  }, [tonight]);

  const setDietMode = (m: DietMode) => setDietModeState(isDietMode(m) ? m : 'skip');

  const setMemberPrefs = (id: string, prefs: { diets?: DietId[]; avoid?: string[] }) => {
    const clean = cleanPersonPrefs(prefs);
    setHouseholdMembers((prev) => prev.map((m) => (m.id === id ? { ...m, diets: clean.diets, avoid: clean.avoid } : m)));
  };

  const toggleDiet = (id: DietId) =>
    setDiets((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));

  const completeOnboarding = (names: string[], avoid: string[], chosenDiets: DietId[] = [], loves: string[] = [], personDiets: DietId[][] = []) => {
    const dietList = chosenDiets.filter(isDietId);
    setDiets(dietList);
    // Keep each person's own diets with their name, whichever blank rows are dropped.
    const kept = names.map((n, i) => ({ name: n.trim().slice(0, 30), own: cleanPersonPrefs({ diets: personDiets[i] }).diets })).filter((p) => p.name).slice(0, 8);
    const cleanNames = kept.map((p) => p.name);
    const avatars = ['🙂', '😋', '🧑‍🍳', '😎', '🤓', '🥳', '🙃', '😊'];
    if (cleanNames.length > 0) {
      const members = cleanNames.map((name, i) => ({
        id: 'm_' + Date.now() + '_' + i,
        name,
        avatar: avatars[i % avatars.length],
        vetoTokensRemaining: 3,
        ...(kept[i].own.length > 0 ? { diets: kept[i].own } : {}),
      }));
      setHouseholdMembers(members);
      setDoorDutyPerson(members[0]);
    }
    const cleanAvoid = Array.from(new Set(avoid.map((a) => a.trim().slice(0, 40)).filter(Boolean))).slice(0, 20);
    const cleanLoves = Array.from(new Set(loves.map((a) => a.trim().slice(0, 40)).filter(Boolean))).slice(0, 20);
    if (cleanAvoid.length > 0) setBannedIngredients(cleanAvoid);
    if (cleanLoves.length > 0) setLikedIngredients(cleanLoves);
    if (cleanAvoid.length > 0 || cleanLoves.length > 0 || dietList.length > 0) {
      // Start the recipe book out already shaped to this household's tastes.
      const result = adaptRecipes({
        meals,
        shelved: shelvedMeals,
        rejectedIds: rejectedMealIds,
        banned: cleanAvoid,
        loved: cleanLoves,
        diets: dietList,
        library: WORLD_RECIPES,
        extraSlots: cleanLoves.length > 0 ? 4 : 0,
      });
      applyTaste(result);
    }
    setOnboarded(true);
    try {
      localStorage.setItem(`${STORAGE_KEY}_onboarded`, 'true');
    } catch {
      // ignore
    }
  };

  const resetToFactoryDefaults = () => {
    setMeals(STARTER_MEALS);
    queueFridge([{ type: 'replaceAll', items: [] }]);
    setTakeaways(STARTER_TAKEAWAYS);
    setHouseholdMembers(STARTER_MEMBERS);
    setStaples(INITIAL_STAPLES);
    setBannedIngredients([]);
    setLikedIngredients([]);
    setShelvedMeals([]);
    setVoteLogs([]);
    historyReplace.current = true;
    setCookLog([]);
    setTakeawayLog([]);
    setRejectedMealIds([]);
    queueFreezer([{ type: 'replaceAll', items: [] }]);
    setReverseTimers([]);
    setAgreedMeal(null);
    setConsecutiveRejections(0);
    setTakeawayOverrideActive(false);
    setRescuedItemsCount(0);
    sound.playHold();
  };

  return (
    <DinnerContext.Provider
      value={{
        mode,
        setMode,
        timeStake,
        setTimeStake,
        effort,
        setEffort,
        clearoutActive,
        setClearoutActive,
        nudgesRemaining,
        useNudge,
        resetNudges,
        heldReels,
        toggleHold,
        isSpinning,
        spin,
        activeMealResult,
        setActiveMealResult,
        customReelResult,
        soundMuted,
        seasonal,
        setSeasonal,
        hemisphere,
        setHemisphere,
        toggleSound,
        eligiblePoolCount,
        eligiblePool: eligibleInfo.pool,
        comboReels,
        exactEffortMatchCount,
        costLimit,
        setCostLimit,
        costToBuy,
        costEach,
        surpriseStep,
        setSurpriseStep,
        restrictions,
        costRule,
        costRelaxed,

        consecutiveRejections,
        takeawayOverrideActive,
        setTakeawayOverrideActive,
        takeaways: takeawayPool,
        winningTakeaway: shownWinner,
        shared,
        usingSharedTakeaways: usingShared,
        whoAmI,
        doorDutyPerson,
        isTakeawaySpinning,
        spinTakeaway,
        updateUsualOrder,
        addTakeawayOption,
        recordTakeawayOrdered,

        pantry,
        togglePantryFreshness,
        addPantryItem,
        removePantryItem,
        staples,
        inStock,
        addStaple,
        cupboard,
        addCupboardItems,
        setCupboardLow,
        removeCupboardItem,
        restorePantryItem,
        restoreCupboardItem,
        restoreFreezerItem,
        dailyLog,
        logDailyEntry,
        deleteDailyEntry,
        restockSuggestions,
        listsOnline,
        removeStaple,
        likedIngredients,
        shelvedMeals,
        addLikedIngredient,
        removeLikedIngredient,
        bannedIngredients,
        diets,
        toggleDiet,
        dietMode,
        setDietMode,
        setMemberPrefs,
        servings,
        setServings,
        weekPlan,
        weekThemes,
        setWeekTheme,
        setPlanDay,
        planWeek,
        clearWeekPlan,
        shopForWeek,
        store,
        setStore,
        toggleBannedIngredient,
        meals,
        addMeal,
        deleteMeal,
        toggleFavoriteMeal,
        rateMeal,
        recordMealCooked,
        getMealPantryMatch,
        rescuedItemsCount,
        cookLog,
        takeawayLog,

        proposedMeal,
        sendToVote,
        cancelVote,
        voteLabel: household ? 'Send to family vote' : 'Vote on this phone',
        voteSend,
        retrySendToVote,
        householdMembers,
        addHouseholdMember,
        removeHouseholdMember,
        resetVetoTokens,
        activeVoterIndex,
        setActiveVoterIndex,
        currentBallot,
        voteYes,
        voteNo,
        voteLogs,
        agreedMeal,
        setAgreedMeal,
        resetEvening,

        targetEatingTime,
        setTargetEatingTime,
        reverseTimers,
        toggleTimerStep,
        generateReverseTimers,

        activeView,
        setActiveView,

        userProfile,
        updateUserProfile,
        syncWithCloud,
        fetchCloudSnapshot,
        importBackupData,
        householdCode: household ? `${household.id}.${household.key}` : null,
        createHousehold,
        joinHousehold,
        leaveHousehold,
        googleClientId,
        aiEnabled,
        authHeaders,
        googleProfile,
        familyNames,
        newJoiners,
        dismissJoiners,
        signInWithGoogle,
        tonight,
        startLiveVote,
        castLiveVote,
        decideLive,
        myVoteName,
        setVoteIdentity,
        voteNews,
        dismissVoteNews: () => setVoteNews(null),
        clearLive,
        onboarded,
        completeOnboarding,
        resetToFactoryDefaults,
        isSyncing,

        isCoolingOff,
        getCoolingOffDays,

        worldRecipes: WORLD_RECIPES,
        addFromLibrary,
        rejectMeal,
        hideLibraryRecipe,
        rejectedMealIds,
        restoreRejected,
        updateMealTweaks,
        setMealPhoto,
        saveDinnerReviews,
        saveLeftovers,
        freezer,
        addFreezerItem,
        useFreezerPortion: useFreezerPortionById,
        putBackFreezerPortion: putBackFreezerPortionById,
        removeFreezerItem,
        clearUsedFreezer,
        shoppingList,
        shoppingOnline,
        meId,
        setMeId,
        roomCode,
        roomError,
        createRoom,
        joinRoom,
        leaveRoom,
        addShoppingItems,
        removeShoppingByName,
        toggleShoppingItem,
        removeShoppingItem,
        clearCheckedShopping,
      }}
    >
      {children}
    </DinnerContext.Provider>
  );
};

export const useDinner = () => {
  const context = useContext(DinnerContext);
  if (!context) {
    throw new Error('useDinner must be used within a DinnerProvider');
  }
  return context;
};
