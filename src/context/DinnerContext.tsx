import React, { createContext, useContext, useState, useEffect } from 'react';
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
} from '../types';
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
  restoreFromCloud: () => Promise<{ success: boolean; message: string }>;
  importBackupData: (rawJson: any) => { success: boolean; message: string };
  resetToFactoryDefaults: () => void;
  isSyncing: boolean;

  // Cooling-off helper
  isCoolingOff: (meal: Meal) => boolean;
  getCoolingOffDays: (meal: Meal) => number | null;
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
  const [meals, setMeals] = useState<Meal[]>(() => loadStored('meals', INITIAL_MEALS));
  const [pantry, setPantry] = useState<PantryItem[]>(() => loadStored('pantry', INITIAL_PANTRY));
  const [takeaways, setTakeaways] = useState<TakeawayOption[]>(() =>
    loadStored('takeaways', INITIAL_TAKEAWAYS)
  );
  const [householdMembers, setHouseholdMembers] = useState<HouseholdMember[]>(() =>
    loadStored('members', INITIAL_MEMBERS)
  );
  const [staples, setStaples] = useState<string[]>(() => loadStored('staples', INITIAL_STAPLES));
  const [bannedIngredients, setBannedIngredients] = useState<string[]>(() =>
    loadStored('banned', INITIAL_BANNED_INGREDIENTS)
  );
  const [likedIngredients] = useState<string[]>(INITIAL_LIKED_INGREDIENTS);
  const [userProfile, setUserProfile] = useState<UserProfile>(() =>
    loadStored('profile', INITIAL_USER_PROFILE)
  );
  const [rescuedItemsCount, setRescuedItemsCount] = useState<number>(() =>
    loadStored('rescued_count', 7)
  );
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
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
        const chosen = selectWeightedMeal(pool, pantry, clearoutActive, effort);
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
            voteLogs,
            rescuedItemsCount,
            cookLog,
            takeawayLog,
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
        setBannedIngredients(payload.banned || payload.bannedIngredients);
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
    setBannedIngredients(INITIAL_BANNED_INGREDIENTS);
    setVoteLogs([]);
    setCookLog([]);
    setTakeawayLog([]);
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
        restoreFromCloud,
        importBackupData,
        resetToFactoryDefaults,
        isSyncing,

        isCoolingOff,
        getCoolingOffDays,
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
