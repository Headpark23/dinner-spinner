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
  TimeFilter,
  EffortFilter,
  LiveVote,
} from '../types';
import { WORLD_RECIPES } from '../data/worldRecipes';
import { applyShoppingOp, newShoppingId, ShoppingOp } from '../utils/shopping';
import {
  STARTER_MEALS,
  STARTER_TAKEAWAYS,
  STARTER_MEMBERS,
  INITIAL_MEALS,
  INITIAL_STAPLES,
  INITIAL_LIKED_INGREDIENTS,
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
import { checkBackup, BackupCheck } from '../utils/backup';
import { DietId, isDietId, mealFitsDiets } from '../utils/diets';
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
  timeStake: TimeFilter;
  setTimeStake: (t: TimeFilter) => void;
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
  diets: DietId[];
  toggleDiet: (id: DietId) => void;
  servings: number;
  setServings: (n: number) => void;
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

  // Live vote across phones
  tonight: LiveVote | null;
  startLiveVote: (meal: Meal) => Promise<{ ok: boolean; message?: string }>;
  castLiveVote: (voter: string, vote: 'yes' | 'no') => Promise<{ ok: boolean; message?: string }>;
  decideLive: () => Promise<{ ok: boolean; message?: string }>;
  clearLive: () => Promise<{ ok: boolean; message?: string }>;

  // First-run setup
  onboarded: boolean;
  completeOnboarding: (names: string[], avoid: string[], diets?: DietId[]) => void;
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

const DinnerContext = createContext<DinnerContextType | null>(null);

const STORAGE_KEY = 'dinner_spinner_state_v1';

const VIEW_PATHS = ['/', '/takeaway', '/kitchen', '/tonight', '/stats'];
const viewFromPath = (pathname: string): number | null => {
  const clean = pathname.replace(/\/+$/, '') || '/';
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
  const [pantry, setPantry] = useState<PantryItem[]>(() => loadStored<PantryItem[]>('pantry', []));
  const [takeaways, setTakeaways] = useState<TakeawayOption[]>(() =>
    loadStored('takeaways', STARTER_TAKEAWAYS)
  );
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>(() =>
    loadStored('members', STARTER_MEMBERS)
  );
  const [staples, setStaples] = useState<string[]>(() => loadStored('staples', INITIAL_STAPLES));
  const [servings, setServingsState] = useState<number>(() => {
    const n = Number(loadStored<number>('servings', 4));
    return [2, 4, 6, 8].includes(n) ? n : 4;
  });
  const [diets, setDiets] = useState<DietId[]>(() =>
    loadStored<unknown[]>('diets', []).filter(isDietId) as DietId[]
  );
  const [bannedIngredients, setBannedIngredients] = useState<string[]>(() =>
    loadStored<string[]>('banned', [])
  );
  const [likedIngredients] = useState<string[]>(INITIAL_LIKED_INGREDIENTS);
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadStored('profile', INITIAL_USER_PROFILE)
  );
  const [rescuedItemsCount, setRescuedItemsCount] = useState<number>(() =>
    loadStored('rescued_count', 0)
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [rejectedMealIds, setRejectedMealIds] = useState<string[]>(() => loadStored('rejected', []));
  const [shoppingList, setShoppingList] = useState<ShoppingItem[]>(() => loadStored('shopping', []));
  const [shoppingOnline, setShoppingOnline] = useState<boolean | null>(null);
  const pendingShoppingOps = useRef<ShoppingOp[]>(loadStored('shopping_queue', []));
  const [meId, setMeIdState] = useState<string>(() => loadStored('me', ''));
  const [household, setHousehold] = useState<{ id: string; key: string } | null>(() =>
    loadStored<{ id: string; key: string } | null>('household', null)
  );
  const householdRef = useRef(household);
  householdRef.current = household;
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
      if (m === 'single' || m === '3-reel' || m === 'sunday') return m;
    }
    return 'single';
  });
  const [timeStake, setTimeStake] = useState<TimeFilter>('any');
  const [effort, setEffort] = useState<EffortFilter>('any');
  const [clearoutActive, setClearoutActive] = useState<boolean>(false);
  const [nudgesRemaining, setNudgesRemaining] = useState<number>(3);
  const [heldReels, setHeldReels] = useState<boolean[]>([false, false, false, false]);
  const [isSpinning, setIsSpinning] = useState<boolean>(false);
  const [activeMealResult, setActiveMealResult] = useState<Meal | null>(null);
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

  // Navigation View (0: Machine, 1: Takeaway, 2: Kitchen, 3: Tonight, 4: Stats).
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

  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_banned`, JSON.stringify(bannedIngredients));
  }, [bannedIngredients]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_diets`, JSON.stringify(diets));
  }, [diets]);
  useEffect(() => {
    localStorage.setItem(`${STORAGE_KEY}_servings`, JSON.stringify(servings));
  }, [servings]);
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
  }, [syncShopping, household]);

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
      setActiveMealResult(buildComboMeal('3-reel', initial3, comboTime(timeStake), comboEffort(effort)));
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
      const { pool } = filterEligibleMeals(meals, timeStake, effort, bannedIngredients, diets);
      if (pool.length > 0) {
        setActiveMealResult(pool[0]);
      }
    }
  };

  const isCoolingOff = (meal: Meal): boolean => isMealCoolingOff(meal);
  const getCoolingOffDays = (meal: Meal): number | null => getMealCoolingOffDays(meal);
  const getMealPantryMatch = (meal: Meal): PantryMatchInfo =>
    calculateMealPantryMatch(meal, pantry, staples);

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
  const eligibleInfo = filterEligibleMeals(meals, timeStake, effort, bannedIngredients, diets);
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
      setActiveMealResult(buildComboMeal('3-reel', nextReels, comboTime(timeStake), comboEffort(effort)));
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
        const { pool } = filterEligibleMeals(meals, timeStake, effort, bannedIngredients, diets);
        if (pool.length === 0) {
          // Every dish clashes with the household's diets: show nothing rather than a wrong dish.
          setActiveMealResult(null);
        } else {
          const chosen = selectWeightedMeal(pool, pantry, clearoutActive, effort);
          sound.playReelLock();
          setActiveMealResult(chosen);
          sound.playWin();
        }
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
        const comboMeal = buildComboMeal('3-reel', newRes, comboTime(timeStake), comboEffort(effort));
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
  const sendToVote = (meal: Meal) => {
    setProposedMeal(meal);
    setAgreedMeal(null);
    setCurrentBallot({});
    setActiveVoterIndex(0);
    setActiveView(3);
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
    const majorityThreshold = Math.max(1, Math.ceil(householdMembers.length / 2));

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

  const meName = () => householdMembers.find((m) => m.id === meId)?.name;

  const setMeId = (id: string) => {
    setMeIdState(id);
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
        mealFitsDiets(r.ingredients, diets) &&
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

  const toggleBannedIngredient = (name: string) => {
    sound.playHold();
    setBannedIngredients((prev) =>
      prev.includes(name) ? prev.filter((i) => i !== name) : [...prev, name]
    );
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
      const matchInfo = calculateMealPantryMatch(targetMeal, pantry, staples);
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
      if (!householdRef.current) return false;
      const res = await fetch('/api/sync/cloud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          data: {
            userProfile,
            meals,
            pantry,
            staples,
            takeaways,
            members: householdMembers,
            banned: bannedIngredients,
            diets,
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
    const check = checkBackup(rawData);
    if (!check.ok) return { success: false, message: check.error };
    const payload = check.payload;
    let restoredCount = 0;
    if (Array.isArray(payload.meals) && payload.meals.length > 0) {
      setMeals(payload.meals);
      restoredCount += payload.meals.length;
    }
    if (Array.isArray(payload.pantry)) setPantry(payload.pantry);
    if (Array.isArray(payload.staples)) setStaples(payload.staples);
    if (Array.isArray(payload.takeaways)) setTakeaways(payload.takeaways);
    if (Array.isArray(payload.members || payload.householdMembers)) {
      setHouseholdMembers(payload.members || payload.householdMembers);
    }
    if (Array.isArray(payload.banned || payload.bannedIngredients)) {
      setBannedIngredients(payload.banned || payload.bannedIngredients);
    }
    if (Array.isArray(payload.diets)) setDiets(payload.diets.filter(isDietId));
    if (Array.isArray(payload.voteLogs)) setVoteLogs(payload.voteLogs);
    if (typeof payload.rescuedItemsCount === 'number') setRescuedItemsCount(payload.rescuedItemsCount);
    if (Array.isArray(payload.cookLog)) setCookLog(payload.cookLog);
    if (Array.isArray(payload.takeawayLog)) setTakeawayLog(payload.takeawayLog);
    if (Array.isArray(payload.rejectedMealIds)) setRejectedMealIds(payload.rejectedMealIds);
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
      return { success: true, message: 'Joined. The shopping list is now shared.' };
    } catch {
      return { success: false, message: 'Couldn’t reach the server.' };
    }
  };

  const leaveHousehold = () => {
    saveHousehold(null);
    setShoppingOnline(null);
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
    return () => clearInterval(timer);
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
    const r = await sendLive({
      op: 'propose',
      meal,
      people,
      needed: Math.max(1, Math.ceil(people.length / 2)),
      by: meName() || '',
    });
    if (r.ok) {
      setProposedMeal(meal);
      setAgreedMeal(null);
      setCurrentBallot({});
      setActiveView(3);
    }
    return r;
  };
  const castLiveVote = (voter: string, vote: 'yes' | 'no') => sendLive({ op: 'vote', voter, vote });
  const decideLive = () => sendLive({ op: 'decide' });
  const clearLive = () => sendLive({ op: 'clear' });

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

  const toggleDiet = (id: DietId) =>
    setDiets((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));

  const completeOnboarding = (names: string[], avoid: string[], chosenDiets: DietId[] = []) => {
    setDiets(chosenDiets.filter(isDietId));
    const cleanNames = names.map((n) => n.trim().slice(0, 30)).filter(Boolean).slice(0, 8);
    const avatars = ['🙂', '😋', '🧑‍🍳', '😎', '🤓', '🥳', '🙃', '😊'];
    if (cleanNames.length > 0) {
      const members = cleanNames.map((name, i) => ({
        id: 'm_' + Date.now() + '_' + i,
        name,
        avatar: avatars[i % avatars.length],
        vetoTokensRemaining: 3,
      }));
      setHouseholdMembers(members);
      setDoorDutyPerson(members[0]);
    }
    const cleanAvoid = Array.from(new Set(avoid.map((a) => a.trim().slice(0, 40)).filter(Boolean))).slice(0, 20);
    if (cleanAvoid.length > 0) setBannedIngredients(cleanAvoid);
    setOnboarded(true);
    try {
      localStorage.setItem(`${STORAGE_KEY}_onboarded`, 'true');
    } catch {
      // ignore
    }
  };

  const resetToFactoryDefaults = () => {
    setMeals(STARTER_MEALS);
    setPantry([]);
    setTakeaways(STARTER_TAKEAWAYS);
    setHouseholdMembers(STARTER_MEMBERS);
    setStaples(INITIAL_STAPLES);
    setBannedIngredients([]);
    setVoteLogs([]);
    setCookLog([]);
    setTakeawayLog([]);
    setRejectedMealIds([]);
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
        diets,
        toggleDiet,
        servings,
        setServings,
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
        tonight,
        startLiveVote,
        castLiveVote,
        decideLive,
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
