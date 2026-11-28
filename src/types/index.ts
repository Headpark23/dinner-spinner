export type TimeStake = '20m' | '30m' | '60m' | 'all-day';
export type EffortLevel = 'one-pot' | 'standard' | 'chef-mode';
export type FreshnessLevel = 'green' | 'amber' | 'red'; // Red = "Use Next" (priority for clearout)
export type MachineMode = 'single' | '3-reel' | '4-reel' | 'sunday';

export interface Meal {
  /** A dish that usually makes extra: how many portions, and how many days they keep in the fridge. */
  makesLeftovers?: { portions: number; keepDays: number };
  id: string;
  title: string;
  description: string;
  cuisine: string;
  timeStake: TimeStake;
  effort: EffortLevel;
  ingredients: string[];
  prepSteps: string[];
  rating: number; // 1-5 stars, 5 stars gets Gold Frame badge
  isFavorite: boolean;
  lastCookedDate: string | null; // ISO string or null
  cookCount: number;
  imageUrl?: string;
  tags: string[];
  servings?: number;
  origin?: string; // country or region, for World Kitchen dishes
  source?: 'starter' | 'world' | 'own' | 'scanned' | 'idea';
  /** Who to credit for `imageUrl` when it is a Wikimedia Commons photo. */
  photoCredit?: { author: string; license: string; licenseUrl: string; source: string };
  tweaks?: MealTweaks;
}

/** A household's own changes layered on top of a recipe (the original stays intact). */
export interface MealTweaks {
  extraIngredients: string[];
  extraSteps: { text: string; minutesBefore: number }[];
  note?: string;
}

export interface MealReview {
  memberId: string;
  memberName: string;
  stars: number; // 1-5
  comment?: string;
}

export interface ShoppingItem {
  id: string;
  name: string;
  forMeal?: string; // dish title it was added for
  addedBy?: string;
  checked: boolean;
  checkedBy?: string;
  updatedAt: string;
}

export interface PantryMatchInfo {
  matchedCount: number;
  totalCount: number;
  matchPercentage: number;
  redMatchedItems: string[];
  missingItems: string[];
}

export interface ReelComboItem {
  id: string;
  label: string;
  category: string;
  icon?: string;
  pantryMatch?: boolean;
}

export interface TakeawayOption {
  id: string;
  name: string;
  category: string;
  badge: string;
  color: string;
  usualOrders: { memberName: string; order: string }[];
  orderCount?: number;
  lastOrderedDate?: string | null;
  /** Contact details, when the place came from a map search or its own web page. */
  phone?: string;
  website?: string;
  address?: string;
  lat?: number;
  lon?: number;
}

export interface PantryItem {
  id: string;
  name: string;
  category: string;
  freshness: FreshnessLevel;
  quantity?: string;
  addedDate: string;
  /** Eat-by date, YYYY-MM-DD. Set for leftovers; shown amber then red as it nears. */
  useBy?: string;
}

/** A batch-cooked meal in the freezer, split into portions that get ticked off as they are eaten. */
export interface FreezerItem {
  id: string;
  name: string;
  mealId?: string; // set when it came from one of our recipes
  portions: number; // portions still in the freezer
  totalPortions: number; // portions it was frozen as
  frozenDate: string; // ISO date it went in
  note?: string;
  usedDate?: string; // set once the last portion is eaten
}

export interface HouseholdMember {
  id: string;
  name: string;
  avatar: string;
  vetoTokensRemaining: number;
  /** This person's own dietary needs, on top of the household's. Best guess from ingredient names. */
  diets?: import('../utils/diets').DietId[];
  avoid?: string[];
}

export interface VoteLog {
  id: string;
  mealId: string;
  mealTitle: string;
  memberId: string;
  memberName: string;
  decision: 'yes' | 'no';
  timestamp: string;
  reason?: string;
}

export interface ReverseTimerStep {
  id: string;
  timeString: string;
  minuteOffset: number; // minutes before target eating time
  label: string;
  done: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  provider: 'google' | 'guest';
  cloudSyncEnabled: boolean;
  lastSyncedAt: string;
}

export interface CookLogEntry {
  id: string;
  mealId: string;
  title: string;
  cuisine: string;
  date: string; // ISO timestamp the household finished cooking
  rescued: string[]; // Use-next pantry items cleared by this cook
  reviews?: MealReview[]; // after-dinner household verdicts
  leftovers?: { route: 'fridge' | 'freezer'; portions: number }; // where the rest went
}

export interface TakeawayLogEntry {
  id: string;
  takeawayId: string;
  name: string;
  date: string;
}

/** The spinner's filters also allow "no preference". */
export type TimeFilter = TimeStake | 'any';
export type EffortFilter = EffortLevel | 'any';

/** One household-wide dinner vote, decided by the server so every phone agrees. */
export interface LiveVote {
  version: number;
  round: number;
  status: 'idle' | 'open' | 'agreed' | 'vetoed' | 'cancelled';
  meal: Pick<Meal, 'id' | 'title' | 'description' | 'cuisine' | 'timeStake' | 'effort' | 'ingredients' | 'prepSteps' | 'tags'> | null;
  people: string[];
  needed: number;
  ballot: Record<string, 'yes' | 'no'>;
  proposedBy: string;
  vetoedBy: string;
  /** Who cancelled the vote (status 'cancelled'). */
  cancelledBy?: string;
  /** Who skipped the vote and picked the dish. */
  decidedBy?: string;
  openedAt: string;
  /** Names in the family with vote notifications turned on. */
  phones?: string[];
  /** Only on the reply to the phone that acted: who a notification was delivered to. */
  buzzed?: string[];
}

/** A tin, jar, sauce, spice or dry good in the store cupboard. Shared by the family group. */
export interface CupboardItem {
  id: string;
  name: string;
  shelf: string;
  quantity?: string;
  /** Running low: it has gone on the shopping list. */
  low?: boolean;
  addedBy?: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface UsedStockItem {
  name: string;
  source: 'fridge' | 'cupboard' | 'freezer' | 'other';
  sourceId?: string;
  action: 'removed' | 'marked-low' | 'portion-used';
  addedToShop?: boolean;
}

/** One entry in the household's daily food & ingredient usage log. */
export interface DailyLogEntry {
  id: string;
  date: string; // ISO timestamp
  day: string; // YYYY-MM-DD local date key
  slot: MealSlot;
  kind: 'meal' | 'ingredients';
  title: string;
  mealId?: string;
  cuisine?: string;
  usedItems: UsedStockItem[];
  loggedBy?: string;
  note?: string;
}

export interface ChefStep {
  title: string;
  instruction: string;
  minutesBefore: number;
  visualCue?: string;
  photoQuery?: string;
  imageUrl?: string;
  photoCredit?: { author: string; license: string; licenseUrl: string; source: string };
}

export interface ChefRecommendation {
  id: string;
  title: string;
  description: string;
  cuisine: string;
  chefInspiration: string;
  whyItWorks: string;
  chefTip: string;
  timeStake: TimeStake;
  effort: EffortLevel;
  servings: number;
  ingredients: string[];
  usesFromKitchen: string[];
  rescues: string[];
  optionalExtras: string[];
  steps: ChefStep[];
  tags: string[];
  imageUrl?: string;
  photoCredit?: { author: string; license: string; licenseUrl: string; source: string };
}
