import React, { useEffect, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { milestones, statsFrom, unseenMilestones } from '../utils/milestones';
import { Notice } from './ui';

const KEY = 'ds_milestones_seen';

const readSeen = (): string[] | null => {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : null;
  } catch {
    return null;
  }
};

/** A small "you reached a milestone" note the first time a step is earned. Never for what was already earned. */
export const MilestoneToast: React.FC = () => {
  const { cookLog, takeawayLog, freezer, rescuedItemsCount } = useDinner();
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    const { earned } = milestones(statsFrom({ cookLog, takeawayLog, freezer, rescued: rescuedItemsCount }));
    const { fresh, seenNow } = unseenMilestones(earned, readSeen());
    try {
      localStorage.setItem(KEY, JSON.stringify(seenNow));
    } catch {
      // private browsing: it may be shown again next visit
    }
    if (fresh.length > 0) setLabels((prev) => [...prev, ...fresh.map((f) => f.label)]);
  }, [cookLog, takeawayLog, freezer, rescuedItemsCount]);

  if (labels.length === 0) return null;
  return (
    <Notice tone="sage" icon={<PartyPopper className="h-4 w-4" />} onDismiss={() => setLabels([])} className="mb-3">
      Milestone: {labels.join(' and ')}. Nicely done.
    </Notice>
  );
};
