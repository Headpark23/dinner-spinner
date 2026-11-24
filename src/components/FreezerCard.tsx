import React from 'react';
import { Check, ChevronRight, Snowflake } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Card, Chip } from './ui';
import { frozenAgo, inFreezer, isEatSoon, oldestFirst, totalPortions } from '../utils/freezer';

const SHOWN = 3;

/**
 * Batch-cooked freezer meals ready to reheat tonight. Returns null when empty.
 */
export const FreezerCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { freezer, useFreezerPortion } = useDinner();
  const stocked = oldestFirst(inFreezer(freezer));
  if (stocked.length === 0) return null;

  const shown = stocked.slice(0, SHOWN);
  const more = stocked.length - shown.length;
  const portions = totalPortions(freezer);

  return (
    <Card aria-label="In the freezer" className="p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sunk text-ink-2">
          <Snowflake className="h-5 w-5" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] leading-tight font-semibold">Ready in the freezer</p>
          <p className="mt-0.5 text-[12px] text-ink-2 tabular-nums">
            {portions} {portions === 1 ? 'portion' : 'portions'} batch-cooked, zero prep tonight
          </p>
        </div>
        <button
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-tomato hover:underline"
        >
          All <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-2.5 divide-y divide-line">
        {shown.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14.5px] font-medium">{item.name}</p>
              <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-ink-3">
                <span className="tabular-nums">
                  {item.portions} left · {frozenAgo(item).replace('Frozen ', '')}
                </span>
                {isEatSoon(item) && <Chip tone="saffron">Eat soon</Chip>}
              </p>
            </div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => useFreezerPortion(item.id)}
              aria-label={`Tick off one portion of ${item.name}`}
            >
              <Check className="h-4 w-4 text-sage" strokeWidth={2.5} /> Ate one
            </Button>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button onClick={onOpen} className="mt-1 text-[12.5px] font-semibold text-ink-2 hover:text-ink">
          + {more} more frozen {more === 1 ? 'meal' : 'meals'}
        </button>
      )}
    </Card>
  );
};
