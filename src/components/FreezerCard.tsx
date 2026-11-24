import React from 'react';
import { Check, ChevronRight, Snowflake } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Card, Chip } from './ui';
import { frozenAgo, inFreezer, isEatSoon, oldestFirst, totalPortions } from '../utils/freezer';

/** How many batches the home card lists before pointing to the full freezer. */
const SHOWN = 3;

/**
 * A dinner that needs no shopping and no cooking: what is already in the freezer.
 * Only shown when something is in there, oldest batch first, so it never takes space for nothing.
 */
export const FreezerCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { freezer, useFreezerPortion } = useDinner();
  const stocked = oldestFirst(inFreezer(freezer));
  if (stocked.length === 0) return null;

  const shown = stocked.slice(0, SHOWN);
  const more = stocked.length - shown.length;
  const portions = totalPortions(freezer);

  return (
    <Card aria-label="In the freezer" className="p-3">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sunk text-ink-2">
          <Snowflake className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-tight font-semibold">In the freezer</p>
          <p className="mt-0.5 text-[11.5px] text-ink-2 tabular-nums">
            {portions} {portions === 1 ? 'portion' : 'portions'} ready, nothing to cook from scratch
          </p>
        </div>
        <button
          onClick={onOpen}
          className="inline-flex shrink-0 items-center gap-0.5 text-[13px] font-semibold text-ink-2 hover:text-ink"
        >
          Open <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <ul className="mt-2 divide-y divide-line">
        {shown.map((item) => (
          <li key={item.id} className="flex items-center gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[14px]">{item.name}</p>
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
              <Check className="h-4 w-4" strokeWidth={3} /> Ate one
            </Button>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button onClick={onOpen} className="mt-1 text-[12px] font-semibold text-ink-3 hover:text-ink">
          and {more} more {more === 1 ? 'meal' : 'meals'}
        </button>
      )}
    </Card>
  );
};
