import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  Meal,
  TimeStake,
  EffortLevel,
  MachineMode,
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
  CupboardItem,
  HouseholdTastes,
  SharedVote,
} from '../types';
import {
  applyCupboardOp,
  applyTastesOp,
  CupboardOp,
  TastesOp,
  applyRecipesOp,
  diffRecipes,
  HouseholdRecipes,
  RecipesOp,
  guessCupboardCategory,
  majorityFor,
} from '../utils/household';
import { useSharedStore } from '../utils/useSharedStore';
import { registerServiceWorker, refreshPushOwner } from '../utils/push';
import { WORLD_RECIPES } from '../data/worldRecipes';
import { applyShoppingOp, newShoppingId, ShoppingOp } from '../utils/shopping';
import {
  INITIAL_MEALS,
  INITIAL_PANTRY,
  INITIAL_TAKEAWAYS,
  INITIAL_MEMBERS,
  INITIAL_STAPLES,
  INITIAL_LIKED_INGREDIENTS,
  INITIAL_BANNED_INGREDIENTS,
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
import {
  isMealCoolingOff,
  getMealCoolingOffDays,
  calculateMealPantryMatch,
  filterEligibleMeals,
  selectWeightedMeal,
  buildComboMeal,
  buildReverseTimerSteps,
} from '../utils/dinnerEngine';

interface DinnerContextType {
  // Machine State
  mode: MachineMode;
  setMode: (m: MachineMode) => void;
  timeStake: TimeStake;
  setTimeStake: (t: TimeStake) => void;
  effort: EffortLevel;
  setEffort: (e: EffortLevel) => void;
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
  toggleSound: () => void;
  eligiblePoolCount: number;
  eligiblePool: Meal[];
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

  // Pantry & Recipes
  pantry: PantryItem[];
  togglePantryFreshness: (id: string) => void;
  addPantryItem: (item: Omit<PantryItem, 'id' | 'addedDate'>) => void;
  removePantryItem: (id: string) => void;
  staples: string[];
  addStaple: (name: string) => void;
  removeStaple: (name: string) => void;
  likedIngredients: string[];
  bannedIngredients: string[];
  toggleBannedIngredient: (name: string) => void;
  likeIngredient: (name: string) => void;
  avoidIngredient: (name: string) => void;
  clearTaste: (name: string) => void;
  tastesOnline: boolean | null;
  recipesOnline: boolean | null;

  // Store cupboard (shared between phones)
  cupboard: CupboardItem[];
  cupboardOnline: boolean | null;
  addCupboardItems: (items: { name: string; category?: string; quantity?: string }[]) => void;
  setCupboardLow: (id: string, low: boolean) => void;
  removeCupboardItem: (id: string) => void;
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
  sendToVote: (meal: Meal) => void;
  /** Tonight's vote as the server sees it (shared by every phone). */
  sharedVote: SharedVote | null;
  voteOnline: boolean | null;
  /** How many other phones were notified when the dish was put to the vote (null until known). */
  lastNotified: number | null;
  /** The people voting tonight: the proposer's household when a shared vote is open. */
  voters: HouseholdMember[];
  householdAlert: HouseholdAlert | null;
  dismissHouseholdAlert: () => void;
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
  restoreFromCloud: () => Promise<{ success: boolean; message: string }>;
  importBackupData: (rawJson: any) => { success: boolean; message: string };
  resetToFactoryDefaults: () => void;
  isSyncing: boolean;

  // World Kitchen library, tweaks and "not for us"
  worldRecipes: Meal[];
  addFromLibrary: (id: string) => Meal | null;
  rejectMeal: (id: string) => Meal | null;
  rejectedMealIds: string[];
  restoreRejected: (id: string) => void;
  updateMealTweaks: (id: string, tweaks: MealTweaks) => void;

  // After-dinner reviews
  saveDinnerReviews: (cookLogId: string, reviews: MealReview[]) => void;

  // Shared shopping list
  shoppingList: ShoppingItem[];
  shoppingOnline: boolean | null;
  meId: string;
  setMeId: (id: string) => void;
  addShoppingItems: (names: string[], forMeal?: string) => void;
  removeShoppingByName: (name: string) => void;
  toggleShoppingItem: (id: string) => void;
  removeShoppingItem: (id: string) => void;
  clearCheckedShopping: () => void;

  // Cooling-off helper
  isCoolingOff: (meal: Meal) => boolean;
  getCoolingOffDays: (meal: Meal) => number | null;
}

export interface HouseholdAlert {
  id: string;
  text: string;
  tone: 'neutral' | 'sage' | 'tomato';
  action?: 'vote' | 'spin' | 'takeaway';
}

const DinnerContext = createContext<DinnerContextType | null>(null);

const STORAGE_KEY = 'dinner_spinner_state_v1';

function loadStored<T>(suffix: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(`${STORAGE_KEY}_${suffix}`);
    return saved ? JSON.parse(saved) : fallback;
  } catch {
    return fallback;
  }
}

export const DinnerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Our recipes (and dishes hidden with "not for us") are shared with every phone in the household.
  const localRecipesSeed = useRef<HouseholdRecipes>({
    meals: loadStored('meals', INITIAL_MEALS),
    hidden: loadStored('rejected', []),
  });
  const recipesStore = useSharedStore<HouseholdRecipes, RecipesOp>({
    endpoint: '/api/recipes',
    storageKey: `${STORAGE_KEY}_recipes`,
    initial: localRecipesSeed.current,
    apply: applyRecipesOp,
  });
  const meals = recipesStore.state.meals;
  const rejectedMealIds = recipesStore.state.hidden;
  /** Works like a state setter, but every change is sent to the household as ops. */
  const setMeals = (update: Meal[] | ((prev: Meal[]) => Meal[])) => {
    const prev = recipesStore.getLatest().meals;
    const next = typeof update === 'function' ? update(prev) : update;
    recipesStore.send(diffRecipes(prev, next));
  };
  const setRejectedMealIds = (update: string[] | ((prev: string[]) => string[])) => {
    const prev = recipesStore.getLatest().hidden;
    const next = typeof update === 'function' ? update(prev) : update;
    recipesStore.send([
      ...prev.filter((id) => !next.includes(id)).map((id) => ({ type: 'unhide' as const, id })),
      ...next.filter((id) => !prev.includes(id)).map((id) => ({ type: 'hide' as const, id })),
    ]);
  };
  const [pantry, setPantry] = useState<PantryItem[]>(() => loadStored('pantry', INITIAL_PANTRY));
  const [takeaways, setTakeaways] = useState<TakeawayOption[]>(() =>
    loadStored('takeaways', INITIAL_TAKEAWAYS)
  );
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>(() =>
    loadStored('members', INITIAL_MEMBERS)
  );
  const [staples, setStaples] = useState<string[]>(() => loadStored('staples', INITIAL_STAPLES));
  // Likes & dislikes and the store cupboard are shared with every phone in the household.
  const localTastesSeed = useRef<HouseholdTastes>({
    likes: INITIAL_LIKED_INGREDIENTS,
    avoid: loadStored('banned', INITIAL_BANNED_INGREDIENTS),
  });
  const tastesStore = useSharedStore<HouseholdTastes, TastesOp>({
    endpoint: '/api/tastes',
    storageKey: `${STORAGE_KEY}_tastes`,
    initial: localTastesSeed.current,
    apply: applyTastesOp,
  });
  const likedIngredients = tastesStore.state.likes;
  const bannedIngredients = tastesStore.state.avoid;
  const cupboardStore = useSharedStore<CupboardItem[], CupboardOp>({
    endpoint: '/api/cupboard',
    storageKey: `${STORAGE_KEY}_cupboard`,
    initial: [],
    apply: applyCupboardOp,
  });
  const cupboard = cupboardStore.state;
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadStored('profile', INITIAL_USER_PROFILE)
  );
  const [rescuedItemsCount, setRescuedItemsCount] = useState<number>(() =>
    loadStored('rescued_count', 7)
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => loadStored('shopping', []));
  const [shoppingOnline, setShoppingOnline] = useState<boolean | null>(null);
  const pendingShoppingOps = useRef<ShoppingOp[]>(loadStored('shopping_queue', []));
  const [meId, setMeIdState] = useState<string>(() => loadStored('me', ''));
  const [cookLog, setCookLog] = useState<CookLogEntry[]>(() => loadStored('cook_log', []));
  const [takeawayLog, setTakeawayLog] = useState<TakeawayLogEntry[]>(() =>
    loadStored('takeaway_log', [])
  );

  // Machine controls
  const [mode, setModeState] = useState<MachineMode>(() => {
    if (typeof window !== 'undefined') {
      const m = new URLSearchParams(window.location.search).get('mode');
      if (m === 'single' || m === '3-reel' || m === 'sunday') return m;
    }
    return 'single';
  });
  const [timeStake, setTimeStake] = useState<TimeStake>('20m');
  const [effort, setEffort] = useState<EffortLevel>('one-pot');
  const [clearoutActive, setClearoutActive] = useState<boolean>(false);
  const [nudgesRemaining, setNudgesRemaining] = useState<number>(3);
  const [heldReels, setHeldReels] = useState<boolean[]>([false, false, false, false]);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [activeMealResult, setActiveMealResult] = useState<Meal | null>(INITIAL_MEALS[0]);
  const [customReelResult, setCustomReelResult] = useState<string[]>([
    'Rigatoni Pasta',
    'Free-Range Chicken',
    'Spicy Arrabbiata',
    'Charred Cabbage & Rich Beef Gravy',
  ]);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);

  // Takeaway override
  const [consecutiveRejections, setConsecutiveRejections] = useState<number>(() =>
    loadStored('veto_streak', 0)
  );
  const [takeawayOverrideActive, setTakeawayOverrideActive] = useState<boolean>(() =>
    loadStored('takeaway_override', false)
  );
  const [winningTakeaway, setWinningTakeaway] = useState<TakeawayOption | null>(INITIAL_TAKEAWAYS[0]);
  const [doorDutyPerson, setDoorDutyPerson] = useState<HouseholdMember | null>(INITIAL_MEMBERS[0]);
  const [isTakeawaySpinning, setIsTakeawaySpinning] = useState<boolean>(false);

  // Voting Booth
  const [proposedMeal, setProposedMeal] = useState<Meal | null>(INITIAL_MEALS[0]);
  const [activeVoterIndex, setActiveVoterIndex] = useState<number>(0);
  const [currentBallot, setCurrentBallot] = useState<Record<string, 'yes' | 'no'>>({});
  const [voteLogs, setVoteLogs] = useState<VoteLog[]>(() => loadStored('vote_logs', []));
  const [agreedMeal, setAgreedMeal] = useState<Meal | null>(() => loadStored('agreed_meal', null));
  const [sharedVote, setSharedVote] = useState<SharedVote | null>(null);
  const [voteOnline, setVoteOnline] = useState<boolean | null>(null);
  const [lastNotified, setLastNotified] = useState<number | null>(null);
  const [householdAlert, setHouseholdAlert] = useState<HouseholdAlert | null>(null);
  // Which events of the shared vote this phone has already acted on (kept across reloads).
  const seenVote = useRef<{ voteId: string; events: string[] }>(loadStored('vote_seen', { voteId: '', events: [] }));
  const proposing = useRef(false);

  // Reverse Timers
  const [targetEatingTime, setTargetEatingTime] = useState<string>(() =>
    loadStored('target_time', '18:30')
  );
  const [reverseTimers, setReverseTimers] = useState<ReverseTimerStep[]>(() =>
    loadStored('reverse_timers', [])
  );

  // Navigation View (0: Machine, 1: Takeaway, 2: Pantry, 3: Voting, 4: Scorecard)
  const [activeView, setActiveView] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      const v = new URLSearchParams(window.location.search).get('view');
      if (v === '0' || v === 'spinner' || v === 'machine') return 0;
      if (v === '1' || v === 'takeaway') return 1;
      if (v === '2' || v === 'pantry') return 2;
      if (v === '3' || v === 'vote' || v === 'voting') return 3;
      if (v === '4' || v === 'stats' || v === 'scorecard') return 4;
    }
    return 0;
  });

  // Sync to localStorage

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_pantry`, JSON.stringify(pantry));
  }, [pantry]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_takeaways`, JSON.stringify(takeaways));
  }, [takeaways]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_members`, JSON.stringify(householdMembers));
  }, [householdMembers]);

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_staples`, JSON.stringify(staples));
  }, [staples]);

  // The first phone to reach a fresh server brings its own likes & dislikes.
  useEffect(() => {
    if (tastesStore.version !== null && !tastesStore.state.seeded) {
      tastesStore.send([{ type: 'seed', ...localTastesSeed.current }]);
    }
  }, [tastesStore.version, tastesStore.state.seeded]);

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

  // Joining the household's recipes. The first phone to reach a fresh server brings its own;
  // a phone joining later keeps the household list but adds the dishes only it had (its own
  // recipes, scans and anything it has cooked) and its hidden dishes.
  useEffect(() => {
    if (recipesStore.version === null || loadStored('recipes_joined', false)) return;
    const local = localRecipesSeed.current;
    const server = recipesStore.getLatest();
    if (!server.seeded) {
      recipesStore.send([{ type: 'seed', meals: local.meals, hidden: local.hidden }]);
    } else {
      const have = new Set(server.meals.map((m) => m.id));
      const onlyMine = local.meals.filter(
        (m) =>
          !have.has(m.id) &&
          !server.hidden.includes(m.id) &&
          (m.source === 'own' || m.source === 'scanned' || m.id.startsWith('meal_') || m.cookCount > 0)
      );
      recipesStore.send([
        ...onlyMine.map((meal) => ({ type: 'upsert' as const, meal })),
        ...local.hidden.filter((id) => !server.hidden.includes(id)).map((id) => ({ type: 'hide' as const, id })),
      ]);
    }
    try {
      localStorage.setItem(`${STORAGE_KEY}_recipes_joined`, 'true');
    } catch {
      // ignore
    }
  }, [recipesStore.version]);

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

  const syncShopping = useCallback(async () => {
    try {
      const queued = pendingShoppingOps.current;
      const res = queued.length
        ? await fetch('/api/shopping/ops', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ops: queued }),
          })
        : await fetch('/api/shopping');
      if (!res.ok) throw new Error('shopping sync failed');
      const json = await res.json();
      if (queued.length) {
        pendingShoppingOps.current = pendingShoppingOps.current.slice(queued.length);
        persistQueue();
      }
      // Re-apply anything queued meanwhile so local edits never flicker away.
      setShoppingList(pendingShoppingOps.current.reduce(applyShoppingOp, json.items as ShoppingItem[]));
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
    }, 5000);
    return () => clearInterval(timer);
  }, [syncShopping]);

  const queueShopping = (ops: ShoppingOp[]) => {
    if (ops.length === 0) return;
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

  // Mode switcher that also initializes sensible default reels & meal preview
  const setMode = (nextMode: MachineMode) => {
    sound.playHold();
    setModeState(nextMode);
    setHeldReels([false, false, false, false]);
    if (nextMode === '3-reel') {
      const initial3 = [REEL_CARBS[0].label, REEL_PROTEINS[0].label, REEL_SAUCES[0].label];
      setCustomReelResult(initial3);
      setActiveMealResult(buildComboMeal('3-reel', initial3, timeStake, effort));
    } else if (nextMode === 'sunday') {
      const initial4 = [
        SUNDAY_MEATS[0].label,
        SUNDAY_POTATOES[0].label,
        SUNDAY_STAR_SIDES[0].label,
        SUNDAY_VEG_GRAVY[0].label,
      ];
      setCustomReelResult(initial4);
      setActiveMealResult(buildComboMeal('sunday', initial4, 'all-day', 'chef-mode'));
    } else {
      const { pool } = filterEligibleMeals(meals, timeStake, effort, bannedIngredients);
      if (pool.length > 0) {
        setActiveMealResult(pool[0]);
      }
    }
  };

  const isCoolingOff = (meal: Meal): boolean => isMealCoolingOff(meal);
  const getCoolingOffDays = (meal: Meal): number | null => getMealCoolingOffDays(meal);
  // Cupboard items count as in stock, just like staples.
  const stockedStaples = [...staples, ...cupboard.map((c) => c.name)];
  const getMealPantryMatch = (meal: Meal): PantryMatchInfo =>
    calculateMealPantryMatch(meal, pantry, stockedStaples);

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
  const eligibleInfo = filterEligibleMeals(meals, timeStake, effort, bannedIngredients);
  const eligiblePoolCount = eligibleInfo.pool.length;
  const exactEffortMatchCount = eligibleInfo.exactMatchCount;

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
    } else if (mode === '3-reel') {
      const lists = [REEL_CARBS, REEL_PROTEINS, REEL_SAUCES];
      const list = lists[reelIndex] || REEL_CARBS;
      const currentVal = customReelResult[reelIndex];
      const currentIndex = list.findIndex((i) => i.label === currentVal);
      const nextIndex = (currentIndex + 1) % list.length;
      const nextReels = [...customReelResult];
      nextReels[reelIndex] = list[nextIndex].label;
      setCustomReelResult(nextReels);
      setActiveMealResult(buildComboMeal('3-reel', nextReels, timeStake, effort));
    } else if (mode === 'sunday') {
      const lists = [SUNDAY_MEATS, SUNDAY_POTATOES, SUNDAY_STAR_SIDES, SUNDAY_VEG_GRAVY];
      const list = lists[reelIndex] || SUNDAY_MEATS;
      const currentVal = customReelResult[reelIndex];
      const currentIndex = list.findIndex((i) => i.label === currentVal);
      const nextIndex = (currentIndex + 1) % list.length;
      const nextReels = [...customReelResult];
      nextReels[reelIndex] = list[nextIndex].label;
      setCustomReelResult(nextReels);
      setActiveMealResult(buildComboMeal('sunday', nextReels, 'all-day', 'chef-mode'));
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
    }, 90);

    setTimeout(() => {
      clearInterval(tickInterval);

      if (mode === 'single') {
        const { pool } = filterEligibleMeals(meals, timeStake, effort, bannedIngredients);
        const chosen = selectWeightedMeal(pool, pantry, clearoutActive, effort, Date.now(), Math.random, likedIngredients);
        sound.playReelLock();
        setActiveMealResult(chosen);
        sound.playWin();
      } else if (mode === '3-reel') {
        const newRes = [...customReelResult];
        if (!heldReels[0]) {
          newRes[0] = REEL_CARBS[Math.floor(Math.random() * REEL_CARBS.length)].label;
        }
        if (!heldReels[1]) {
          newRes[1] = REEL_PROTEINS[Math.floor(Math.random() * REEL_PROTEINS.length)].label;
        }
        if (!heldReels[2]) {
          newRes[2] = REEL_SAUCES[Math.floor(Math.random() * REEL_SAUCES.length)].label;
        }
        setCustomReelResult(newRes);
        const comboMeal = buildComboMeal('3-reel', newRes, timeStake, effort);
        setActiveMealResult(comboMeal);
        sound.playReelLock();
        sound.playWin();
      } else if (mode === 'sunday') {
        const newRes = [...customReelResult];
        if (!heldReels[0])
          newRes[0] = SUNDAY_MEATS[Math.floor(Math.random() * SUNDAY_MEATS.length)].label;
        if (!heldReels[1])
          newRes[1] = SUNDAY_POTATOES[Math.floor(Math.random() * SUNDAY_POTATOES.length)].label;
        if (!heldReels[2])
          newRes[2] = SUNDAY_STAR_SIDES[Math.floor(Math.random() * SUNDAY_STAR_SIDES.length)].label;
        if (!heldReels[3])
          newRes[3] = SUNDAY_VEG_GRAVY[Math.floor(Math.random() * SUNDAY_VEG_GRAVY.length)].label;
        setCustomReelResult(newRes);
        const sundayMeal = buildComboMeal('sunday', newRes, 'all-day', 'chef-mode');
        setActiveMealResult(sundayMeal);
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
      const randomTakeaway = takeaways[Math.floor(Math.random() * takeaways.length)];
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
    const spot = takeaways.find((t) => t.id === takeawayId);
    setTakeawayLog((prev) => [
      {
        id: 'tlog_' + Date.now(),
        takeawayId,
        name: spot?.name || 'Takeaway',
        date: new Date().toISOString(),
      },
      ...prev,
    ]);
    setTakeaways((prev) =>
      prev.map((t) =>
        t.id === takeawayId
          ? {
              ...t,
              orderCount: (t.orderCount || 0) + 1,
              lastOrderedDate: new Date().toISOString(),
            }
          : t
      )
    );
  };

  // Voting Actions
  const markVoteSeen = (voteId: string, ...keys: string[]) => {
    if (seenVote.current.voteId !== voteId) seenVote.current = { voteId, events: [] };
    seenVote.current = { voteId, events: Array.from(new Set([...seenVote.current.events, ...keys])) };
    try {
      localStorage.setItem(`${STORAGE_KEY}_vote_seen`, JSON.stringify(seenVote.current));
    } catch {
      // ignore
    }
  };

  const sendToVote = (meal: Meal) => {
    setProposedMeal(meal);
    setAgreedMeal(null);
    setCurrentBallot({});
    const meIdx = householdMembers.findIndex((m) => m.id === meId);
    setActiveVoterIndex(meIdx >= 0 ? meIdx : 0);
    setActiveView(3);
    setLastNotified(null);

    // Put it to every phone in the household; the server sends the notifications.
    const me = householdMembers.find((m) => m.id === meId);
    proposing.current = true;
    fetch('/api/vote/propose', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meal,
        proposedBy: me ? { id: me.id, name: me.name } : { id: meId || 'someone', name: 'Someone' },
        members: householdMembers.map(({ id, name }) => ({ id, name })),
      }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('propose failed'))))
      .then((json) => {
        if (json?.vote) {
          markVoteSeen(json.vote.id, 'proposed');
          setSharedVote(json.vote);
        }
        setLastNotified(typeof json?.notified === 'number' ? json.notified : 0);
        setVoteOnline(true);
      })
      .catch(() => setVoteOnline(false))
      .finally(() => {
        proposing.current = false;
      });
  };

  // The people voting tonight. When another phone put the dish to the vote, its household list wins.
  const sharedVoteLive =
    !!sharedVote && sharedVote.status === 'open' && !!proposedMeal && sharedVote.meal.id === proposedMeal.id;
  const voters: HouseholdMember[] = sharedVoteLive
    ? sharedVote!.members.map((m) => {
        const local = householdMembers.find((h) => h.id === m.id);
        return local ? { ...local, name: m.name } : { id: m.id, name: m.name, avatar: '🧑', vetoTokensRemaining: 3 };
      })
    : householdMembers;

  /** Send this phone's vote to the shared vote (if there is one for this dish). */
  const castShared = (memberId: string, decision: 'yes' | 'no', instant: boolean, localEvents: string[]) => {
    const v = sharedVote;
    if (!v || v.status !== 'open' || !proposedMeal || v.meal.id !== proposedMeal.id) return;
    markVoteSeen(v.id, `${decision}:${memberId}`, ...localEvents);
    fetch('/api/vote/cast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        voteId: v.id,
        memberId,
        memberName: voters.find((m) => m.id === memberId)?.name,
        decision,
        instant,
      }),
    })
      .then((res) => res.json())
      .then((json) => {
        if (json && 'vote' in json) handleRemoteVoteRef.current(json.vote);
      })
      .catch(() => setVoteOnline(false));
  };

  const generateReverseTimers = (targetTime: string, meal: Meal) => {
    const steps = buildReverseTimerSteps(targetTime, meal);
    setReverseTimers(steps);
  };

  const voteYes = (memberId: string, instantLock: boolean = false) => {
    const voter = voters.find((m) => m.id === memberId) || voters[0];
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
    const majorityThreshold = majorityFor(voters.length);
    const agreesNow = instantLock || yesCount >= majorityThreshold;
    castShared(voter.id, 'yes', instantLock, agreesNow ? ['agreed'] : []);

    if (agreesNow) {
      sound.playWin();
      setAgreedMeal(proposedMeal);
      setConsecutiveRejections(0);
      setTakeawayOverrideActive(false);
      generateReverseTimers(targetEatingTime, proposedMeal);
    } else {
      sound.playHold();
      // Auto-advance to next unvoted member
      const nextUnvotedIdx = voters.findIndex((m) => !updatedBallot[m.id]);
      if (nextUnvotedIdx !== -1) {
        setActiveVoterIndex(nextUnvotedIdx);
      }
    }
  };

  const voteNo = (
    memberId: string,
    reason?: string
  ): { allowed: boolean; message?: string } => {
    const voter = voters.find((m) => m.id === memberId) || voters[0];
    if (!voter) return { allowed: false, message: 'No active voter selected' };

    if (voter.vetoTokensRemaining <= 0) {
      sound.playBuzzer();
      return {
        allowed: false,
        message: `${voter.name} is out of Veto Tokens for the week! Choose another voter or reset tokens.`,
      };
    }

    sound.playBuzzer();
    castShared(voter.id, 'no', false, ['vetoed']);

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

  // ---------- Shared vote: react to what other phones did ----------
  const handleRemoteVote = (v: SharedVote | null) => {
    setSharedVote(v);
    if (!v) return;
    const firstLook = seenVote.current.voteId !== v.id;
    const already = new Set(firstLook ? [] : seenVote.current.events);
    // Anything older than 12 hours is history: record it quietly.
    const quiet = Date.now() - new Date(v.createdAt).getTime() > 12 * 3600 * 1000;
    const who = (id?: string) => v.members.find((m) => m.id === id)?.name || 'Someone';
    const fresh: string[] = [];
    let alert: Omit<HouseholdAlert, 'id'> | null = null;
    let adopted = proposedMeal?.id === v.meal.id;

    if (!already.has('proposed')) {
      fresh.push('proposed');
      if (!quiet && v.status === 'open' && v.proposedBy.id !== meId) {
        setProposedMeal(v.meal);
        setAgreedMeal(null);
        adopted = true;
        const meIdx = v.members.findIndex((m) => m.id === meId);
        setActiveVoterIndex(meIdx >= 0 ? meIdx : 0);
        alert = { text: `${v.proposedBy.name} suggests ${v.meal.title} for dinner. Yes, or veto?`, tone: 'neutral', action: 'vote' };
      }
    }

    for (const [memberId, decision] of Object.entries(v.ballot)) {
      const key = `${decision}:${memberId}`;
      if (already.has(key)) continue;
      fresh.push(key);
      if (!quiet && decision === 'yes' && v.status === 'open' && memberId !== meId) {
        alert = { text: `${who(memberId)} said yes to ${v.meal.title}.`, tone: 'sage', action: 'vote' };
      }
    }
    if (v.status === 'open' && adopted) setCurrentBallot(v.ballot);

    if (v.status === 'agreed' && !already.has('agreed')) {
      fresh.push('agreed');
      if (!quiet) {
        setProposedMeal(v.meal);
        setAgreedMeal(v.meal);
        setCurrentBallot(v.ballot);
        setConsecutiveRejections(0);
        setTakeawayOverrideActive(false);
        generateReverseTimers(targetEatingTime, v.meal);
        sound.playWin();
        alert = { text: `Dinner’s agreed: ${v.meal.title}. ${who(v.decidedBy?.id)} said yes.`, tone: 'sage', action: 'vote' };
      }
    }

    if (v.status === 'vetoed' && !already.has('vetoed')) {
      fresh.push('vetoed');
      if (!quiet) {
        const by = v.decidedBy;
        if (by) {
          setHouseholdMembers((prev) =>
            prev.map((m) => (m.id === by.id ? { ...m, vetoTokensRemaining: Math.max(0, m.vetoTokensRemaining - 1) } : m))
          );
        }
        const next = consecutiveRejections + 1;
        setConsecutiveRejections(next);
        setCurrentBallot({});
        setProposedMeal(null);
        sound.playBuzzer();
        if (next >= 3) {
          setTakeawayOverrideActive(true);
          alert = { text: `${who(by?.id)} vetoed ${v.meal.title}. That’s three in a row: takeaway night.`, tone: 'tomato', action: 'takeaway' };
        } else {
          alert = { text: `${who(by?.id)} vetoed ${v.meal.title}. Spin again for something else.`, tone: 'tomato', action: 'spin' };
        }
      }
    }

    if (fresh.length) markVoteSeen(v.id, ...fresh);
    if (alert) {
      setHouseholdAlert({ ...alert, id: `${v.id}_${fresh.join('_')}` });
      try {
        // Browsers only allow a buzz once the person has tapped the page.
        if ((navigator as any).userActivation?.hasBeenActive) navigator.vibrate?.(180);
      } catch {
        // not supported
      }
    }
  };
  const handleRemoteVoteRef = useRef(handleRemoteVote);
  handleRemoteVoteRef.current = handleRemoteVote;

  const pollVote = useCallback(async () => {
    if (proposing.current) return;
    try {
      const res = await fetch('/api/vote');
      if (!res.ok) throw new Error('vote poll failed');
      const json = await res.json();
      setVoteOnline(true);
      if (!proposing.current) handleRemoteVoteRef.current(json.vote ?? null);
    } catch {
      setVoteOnline(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    pollVote();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') pollVote();
    }, 4000);
    const onVisible = () => document.visibilityState === 'visible' && pollVote();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [pollVote]);

  // Service worker for push notifications; tapping a notification opens the vote.
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    registerServiceWorker();
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-vote') {
        setActiveView(3);
        pollVote();
      }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [pollVote]);

  const meName = () => householdMembers.find((m) => m.id === meId)?.name;

  const setMeId = (id: string) => {
    setMeIdState(id);
    if (id) refreshPushOwner(id, householdMembers.find((m) => m.id === id)?.name);
    try {
      localStorage.setItem(`${STORAGE_KEY}_me`, JSON.stringify(id));
    } catch {
      // ignore
    }
  };

  const addShoppingItems = (names: string[], forMeal?: string) =>
    queueShopping(
      names
        .map((n) => n.trim())
        .filter(Boolean)
        .map((name) => ({ type: 'add' as const, item: { id: newShoppingId(), name, forMeal, addedBy: meName() } }))
    );
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
    const hidden = new Set([...rejectedMealIds, id]);
    const inRotation = new Set(meals.map((m) => m.id));
    const candidates = WORLD_RECIPES.filter(
      (r) =>
        !hidden.has(r.id) &&
        !inRotation.has(r.id) &&
        !r.ingredients.some((ing) =>
          bannedIngredients.some((b) => b.trim() && ing.toLowerCase().includes(b.toLowerCase()))
        )
    );
    const score = (r: Meal) =>
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

  const restoreRejected = (id: string) => {
    setRejectedMealIds((prev) => prev.filter((r) => r !== id));
    const dish = WORLD_RECIPES.find((r) => r.id === id) || INITIAL_MEALS.find((m) => m.id === id);
    if (dish) setMeals((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, dish]));
  };

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

  // ---------- After-dinner reviews ----------
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
    fetch('/api/vote/clear', { method: 'POST' }).catch(() => undefined);
    setSharedVote(null);
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
    setPantry((prev) =>
      prev.map((item) => {
        if (item.id === id) {
          const nextFreshness =
            item.freshness === 'green'
              ? 'amber'
              : item.freshness === 'amber'
              ? 'red'
              : 'green';
          return { ...item, freshness: nextFreshness };
        }
        return item;
      })
    );
  };

  const addPantryItem = (item: Omit<PantryItem, 'id' | 'addedDate'>) => {
    const newItem: PantryItem = {
      ...item,
      id: 'pantry_' + Date.now() + Math.random().toString(36).substring(2, 6),
      addedDate: new Date().toISOString().slice(0, 10),
    };
    setPantry((prev) => [newItem, ...prev]);
  };

  const removePantryItem = (id: string) => {
    setPantry((prev) => prev.filter((p) => p.id !== id));
  };

  const addStaple = (name: string) => {
    if (!name.trim()) return;
    setStaples((prev) => Array.from(new Set([...prev, name.trim()])));
  };

  const removeStaple = (name: string) => {
    setStaples((prev) => prev.filter((s) => s !== name));
  };

  const hasTaste = (list: string[], name: string) =>
    list.some((x) => x.toLowerCase() === name.trim().toLowerCase());
  const toggleBannedIngredient = (name: string) => {
    sound.playHold();
    tastesStore.send([{ type: hasTaste(bannedIngredients, name) ? 'clear' : 'avoid', name }]);
  };
  const likeIngredient = (name: string) => {
    if (!name.trim()) return;
    sound.playHold();
    tastesStore.send([{ type: 'like', name: name.trim() }]);
  };
  const avoidIngredient = (name: string) => {
    if (!name.trim()) return;
    sound.playHold();
    tastesStore.send([{ type: 'avoid', name: name.trim() }]);
  };
  const clearTaste = (name: string) => tastesStore.send([{ type: 'clear', name }]);
  const replaceTastes = (likes: string[], avoid: string[]) =>
    tastesStore.send([
      ...[...likedIngredients, ...bannedIngredients].map((name) => ({ type: 'clear' as const, name })),
      ...likes.map((name) => ({ type: 'like' as const, name })),
      ...avoid.map((name) => ({ type: 'avoid' as const, name })),
    ]);

  // ---------- Store cupboard ----------
  const addCupboardItems = (items: { name: string; category?: string; quantity?: string }[]) =>
    cupboardStore.send(
      items
        .filter((i) => i.name?.trim())
        .map((i) => ({
          type: 'add' as const,
          item: {
            name: i.name.trim(),
            category: i.category || guessCupboardCategory(i.name),
            quantity: i.quantity,
            addedBy: meName(),
          },
        }))
    );
  const setCupboardLow = (id: string, low: boolean) => {
    const item = cupboard.find((c) => c.id === id);
    cupboardStore.send([{ type: 'setLow', id, low, by: meName() }]);
    // Running low puts it straight on the shared shopping list.
    if (low && item) addShoppingItems([item.name], 'the cupboard');
  };
  const removeCupboardItem = (id: string) => cupboardStore.send([{ type: 'remove', id }]);

  const addMeal = (
    newMealData: Omit<Meal, 'id' | 'rating' | 'cookCount' | 'lastCookedDate' | 'isFavorite'>
  ): Meal => {
    const newMeal: Meal = {
      ...newMealData,
      id: 'meal_' + Date.now(),
      rating: 5,
      cookCount: 0,
      lastCookedDate: null,
      isFavorite: true,
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
      const matchInfo = calculateMealPantryMatch(targetMeal, pantry, stockedStaples);
      rescuedRedItems.push(...matchInfo.redMatchedItems);

      if (rescuedRedItems.length > 0) {
        setRescuedItemsCount((prev) => prev + rescuedRedItems.length);
        // Remove rescued Red items from fridge since they were cooked!
        setPantry((prev) =>
          prev.filter(
            (p) =>
              !(
                p.freshness === 'red' &&
                rescuedRedItems.some((r) => r.toLowerCase() === p.name.toLowerCase())
              )
          )
        );
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
    setTakeaways((prev) =>
      prev.map((t) => {
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
      })
    );
  };

  const updateUserProfile = (updates: Partial<UserProfile>) => {
    setUserProfile((prev) => ({ ...prev, ...updates }));
  };

  // OAuth2 and Cloud Sync
  const syncWithCloud = async (): Promise<boolean> => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            userProfile,
            meals,
            pantry,
            staples,
            takeaways,
            members: householdMembers,
            banned: bannedIngredients,
            liked: likedIngredients,
            cupboard,
            voteLogs,
            rescuedItemsCount,
            cookLog,
            takeawayLog,
            rejectedMealIds,
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
    try {
      const payload = rawData?.data || rawData;
      if (!payload || typeof payload !== 'object') {
        return { success: false, message: 'Invalid backup format.' };
      }
      let restoredCount = 0;
      if (Array.isArray(payload.meals) && payload.meals.length > 0) {
        setMeals(payload.meals);
        restoredCount += payload.meals.length;
      }
      if (Array.isArray(payload.pantry)) {
        setPantry(payload.pantry);
      }
      if (Array.isArray(payload.staples)) {
        setStaples(payload.staples);
      }
      if (Array.isArray(payload.takeaways)) {
        setTakeaways(payload.takeaways);
      }
      if (Array.isArray(payload.members || payload.householdMembers)) {
        setHouseholdMembers(payload.members || payload.householdMembers);
      }
      if (Array.isArray(payload.banned || payload.bannedIngredients)) {
        replaceTastes(
          Array.isArray(payload.liked) ? payload.liked : likedIngredients,
          payload.banned || payload.bannedIngredients
        );
      }
      if (Array.isArray(payload.voteLogs)) {
        setVoteLogs(payload.voteLogs);
      }
      if (typeof payload.rescuedItemsCount === 'number') {
        setRescuedItemsCount(payload.rescuedItemsCount);
      }
      if (Array.isArray(payload.cookLog)) {
        setCookLog(payload.cookLog);
      }
      if (Array.isArray(payload.takeawayLog)) {
        setTakeawayLog(payload.takeawayLog);
      }
      if (Array.isArray(payload.rejectedMealIds)) {
        setRejectedMealIds(payload.rejectedMealIds);
      }
      setUserProfile((prev) => ({
        ...prev,
        ...(payload.userProfile || {}),
        lastSyncedAt: new Date().toISOString(),
      }));
      sound.playWin();
      return {
        success: true,
        message: `Restored ${restoredCount || meals.length} meals and your kitchen inventory.`,
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Failed to parse backup data.' };
    }
  };

  const restoreFromCloud = async (): Promise<{ success: boolean; message: string }> => {
    setIsSyncing(true);
    try {
      const res = await fetch('/api/sync/cloud');
      if (!res.ok) {
        return { success: false, message: 'Could not reach Cloud Sync endpoint.' };
      }
      const json = await res.json();
      if (!json?.data) {
        return {
          success: false,
          message: 'No cloud snapshot found yet. Click "Sync Now to Cloud" first or upload a JSON backup file.',
        };
      }
      return importBackupData(json.data);
    } catch {
      return { success: false, message: 'Network error while restoring from cloud.' };
    } finally {
      setIsSyncing(false);
    }
  };

  const resetToFactoryDefaults = () => {
    setMeals(INITIAL_MEALS);
    setPantry(INITIAL_PANTRY);
    setTakeaways(INITIAL_TAKEAWAYS);
    setHouseholdMembers(INITIAL_MEMBERS);
    setStaples(INITIAL_STAPLES);
    replaceTastes(INITIAL_LIKED_INGREDIENTS, INITIAL_BANNED_INGREDIENTS);
    setVoteLogs([]);
    setCookLog([]);
    setTakeawayLog([]);
    setRejectedMealIds([]);
    setReverseTimers([]);
    setAgreedMeal(null);
    setConsecutiveRejections(0);
    setTakeawayOverrideActive(false);
    setRescuedItemsCount(7);
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
        toggleSound,
        eligiblePoolCount,
        eligiblePool: eligibleInfo.pool,
        exactEffortMatchCount,

        consecutiveRejections,
        takeawayOverrideActive,
        setTakeawayOverrideActive,
        takeaways,
        winningTakeaway,
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
        addStaple,
        removeStaple,
        likedIngredients,
        bannedIngredients,
        toggleBannedIngredient,
        likeIngredient,
        avoidIngredient,
        clearTaste,
        tastesOnline: tastesStore.online,
        recipesOnline: recipesStore.online,
        cupboard,
        cupboardOnline: cupboardStore.online,
        addCupboardItems,
        setCupboardLow,
        removeCupboardItem,
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
        sharedVote,
        voteOnline,
        lastNotified,
        voters,
        householdAlert,
        dismissHouseholdAlert: () => setHouseholdAlert(null),
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
        restoreFromCloud,
        importBackupData,
        resetToFactoryDefaults,
        isSyncing,

        isCoolingOff,
        getCoolingOffDays,

        worldRecipes: WORLD_RECIPES,
        addFromLibrary,
        rejectMeal,
        rejectedMealIds,
        restoreRejected,
        updateMealTweaks,
        saveDinnerReviews,
        shoppingList,
        shoppingOnline,
        meId,
        setMeId,
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
