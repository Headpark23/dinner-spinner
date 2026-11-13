export type TimeStake = '20m' | '30m' | '60m' | 'all-day';
export type EffortLevel = 'one-pot' | 'standard' | 'chef-mode';
export type FreshnessLevel = 'green' | 'amber' | 'red'; // Red = "Use Next" (priority for clearout)
export type MachineMode = 'single' | '3-reel' | 'sunday';

export interface Meal {
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
  estimatedCostPerHead?: number;
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
}

export interface PantryItem {
  id: string;
  name: string;
  category: string;
  freshness: FreshnessLevel;
  quantity?: string;
  addedDate: string;
}

export interface HouseholdMember {
  id: string;
  name: string;
  avatar: string;
  vetoTokensRemaining: number;
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
}

export interface TakeawayLogEntry {
  id: string;
  takeawayId: string;
  name: string;
  date: string;
}
