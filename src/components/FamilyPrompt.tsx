import React from 'react';
import { ChevronRight, UsersRound } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';

/** Shown on the Dinner tab until the phone is in a family group, so the best feature is never hidden. */
export const FamilyPrompt: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { householdCode, onboarded } = useDinner();
  if (householdCode || !onboarded) return null;
  return (
    <button
      onClick={onOpen}
      className="flex w-full items-center gap-3.5 rounded-2xl border border-sage bg-sage-soft p-3.5 text-left"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage text-white">
        <UsersRound className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold">Start a family group</span>
        <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">
          Everyone votes from their own phone and shares one list and fridge.
        </span>
      </span>
      <ChevronRight className="h-5 w-5 shrink-0 text-ink-2" />
    </button>
  );
};
