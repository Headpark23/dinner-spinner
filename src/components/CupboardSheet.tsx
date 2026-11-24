import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Dices, Lightbulb, Refrigerator } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Chip, Notice, Sheet, timeLabel, effortLabel } from './ui';
import { CupboardCandidate, cupboardCandidates, pickSurprise } from '../utils/cupboard';

/** Spin for a dinner that needs nothing from the shop: fridge, tins, staples and leftovers. */
export const CupboardSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { meals, pantry, staples, bannedIngredients, diets, sendToVote, addMeal, setActiveView } = useDinner();
  const candidates = useMemo(
    () => (isOpen ? cupboardCandidates({ meals, pantry, staples, banned: bannedIngredients, diets }) : []),
    [isOpen, meals, pantry, staples, bannedIngredients, diets]
  );
  const [pick, setPick] = useState<CupboardCandidate | null>(null);
  const [saved, setSaved] = useState(false);
  const recent = useRef<string[]>([]);

  const spin = () => {
    const next = pickSurprise(candidates, recent.current.slice(-3));
    if (next) recent.current.push(next.meal.id);
    setPick(next);
    setSaved(false);
  };

  // Open straight onto a first idea, so the sheet is never a blank panel waiting for a tap.
  useEffect(() => {
    if (isOpen && !pick && candidates.length > 0) spin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, candidates.length]);

  const fridgeCount = pantry.length;
  const empty = fridgeCount === 0;

  const close = () => {
    setPick(null);
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={close}
      title="Cook from what we have"
      subtitle="Dinner from the fridge, the tins and the staples cupboard. No shopping trip."
      labelledBy="cupboard-title"
      tall
    >
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <Refrigerator className="h-4 w-4 shrink-0" />
          {fridgeCount} in the fridge · {staples.length} staples · {candidates.length}{' '}
          {candidates.length === 1 ? 'dinner' : 'dinners'} possible
        </p>

        {empty && (
          <Notice tone="neutral">
            The fridge list is empty, so only staples count. Add what you have, leftovers included, for better ideas.
            <button
              className="ml-1 font-semibold underline"
              onClick={() => {
                close();
                setActiveView(2);
              }}
            >
              Open the fridge
            </button>
          </Notice>
        )}

        {candidates.length === 0 ? (
          <Notice tone="tomato">
            Nothing fits what’s in the house yet. Add a few things to the fridge or the staples list (pasta, rice, eggs, a
            tin of tomatoes or beans are a great start).
          </Notice>
        ) : (
          <Button variant="primary" size="lg" block onClick={spin}>
            <Dices className="h-5 w-5" /> {pick ? 'Surprise me again' : 'Surprise me'}
          </Button>
        )}

        {pick && (
          <article className="fade-up space-y-3 rounded-2xl border border-line bg-card p-4" aria-live="polite">
            <div>
              <p className="eyebrow flex items-center gap-1.5">
                {pick.kind === 'idea' ? (
                  <>
                    <Lightbulb className="h-3.5 w-3.5" /> Cupboard idea
                  </>
                ) : (
                  'One of your recipes'
                )}
              </p>
              <h3 className="font-display text-[22px] leading-snug font-semibold">{pick.meal.title}</h3>
              <p className="text-[13px] text-ink-2">
                {timeLabel(pick.meal.timeStake)} · {effortLabel(pick.meal.effort)} · {pick.meal.cuisine}
              </p>
              <p className="mt-1.5 text-[14px] leading-snug text-ink-2">{pick.meal.description}</p>
            </div>

            <div>
              <p className="text-[13px] font-semibold text-ink-2">Uses what you have</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pick.uses.map((u) => (
                  <Chip key={u} tone={pick.rescues.includes(u) ? 'tomato' : 'neutral'}>
                    {u}
                  </Chip>
                ))}
              </div>
              {pick.rescues.length > 0 && (
                <p className="mt-1.5 text-[12px] text-tomato">
                  Rescues {pick.rescues.join(', ')} before {pick.rescues.length === 1 ? 'it goes' : 'they go'} off.
                </p>
              )}
            </div>

            <ol className="list-decimal space-y-1 pl-5 text-[14px] leading-snug">
              {pick.meal.prepSteps.map((s, i) => (
                <li key={i}>{s.replace(/\s*\(-\d+m\)/, '')}</li>
              ))}
            </ol>

            <p className="text-[12px] text-ink-3">
              Matched by name, so check labels and quantities. Season to taste and adapt freely.
            </p>

            <div className="flex flex-col gap-2">
              <Button
                variant="primary"
                block
                onClick={() => {
                  sendToVote(pick.meal);
                  close();
                }}
              >
                Put it to the household
              </Button>
              {pick.kind === 'idea' && (
                <Button
                  variant="secondary"
                  block
                  disabled={saved}
                  onClick={() => {
                    const { id: _id, rating: _r, cookCount: _c, lastCookedDate: _l, isFavorite: _f, ...rest } = pick.meal;
                    addMeal({ ...rest, source: 'own', tags: ['Cupboard idea'] });
                    setSaved(true);
                  }}
                >
                  <BookmarkPlus className="h-4 w-4" /> {saved ? 'Saved to your recipes' : 'Save to my recipes'}
                </Button>
              )}
            </div>
          </article>
        )}
      </div>
    </Sheet>
  );
};
