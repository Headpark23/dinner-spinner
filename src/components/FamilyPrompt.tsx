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
      className="flex w-full items-center gap-2.5 rounded-xl border border-sage bg-sage-soft px-3 py-2 text-left"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sage text-white">
        <UsersRound className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-tight">Start a family group</span>
        <span className="block truncate text-[12px] text-ink-2">Everyone votes from their own phone</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-2" />
    </button>
  );
};
