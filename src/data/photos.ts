import credits from './photoCredits.json';

export interface PhotoCredit {
  file: string;
  author: string;
  license: string;
  licenseUrl: string;
  source: string;
}

export const PHOTO_CREDITS = credits as Record<string, PhotoCredit>;

/** Locally stored photo for a dish, if a freely licensed one was found. */
export const photoFor = (mealId: string): string | undefined =>
  PHOTO_CREDITS[mealId] ? `/photos/${mealId}.webp` : undefined;
