import React, { useState } from 'react';
import { RecipeSheet } from '../RecipeSheet';
import { photoFor } from '../../data/photos';
import { useDinner } from '../../context/DinnerContext';
import { ReelWindow } from '../ReelWindow';
import { TimeStake, EffortLevel, MachineMode } from '../../types';
import { Send, Heart, Check, ShoppingBasket, Star, Snowflake, BookOpen } from 'lucide-react';
import { Card, Chip, DishTile, Segmented, Switch, Button, IconButton, cx } from '../ui';

const dayPart = () => {
  const now = new Date();
  const h = now.getHours();
  const day = now.toLocaleDateString('en-GB', { weekday: 'long' });
  return `${day} ${h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'}`;
};

/** Ask the Pantry view to open on a given tab next time it mounts. */
export const openPantryTab = (tab: string) => {
  try {
    sessionStorage.setItem('ds_pantry_tab', tab);
  } catch {
    // Storage may be blocked; the pantry simply opens on its default tab.
  }
};

export const MachineView: React.FC = () => {
  const {
    mode,
    setMode,
    timeStake,
    setTimeStake,
    effort,
    setEffort,
    clearoutActive,
    setClearoutActive,
    isSpinning,
    spin,
    activeMealResult,
    sendToVote,
    pantry,
    toggleFavoriteMeal,
    getMealPantryMatch,
    eligiblePoolCount,
    exactEffortMatchCount,
    setActiveView,
    isCoolingOff,
    getCoolingOffDays,
  } = useDinner();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const redItems = pantry.filter((p) => p.freshness === 'red');
  const pantryMatch = activeMealResult ? getMealPantryMatch(activeMealResult) : null;
  const coolingDays = activeMealResult ? getCoolingOffDays(activeMealResult) : null;

  const poolNote =
    mode !== 'single'
      ? null
      : exactEffortMatchCount > 0
      ? null
      : `Nothing fits exactly, so the reel holds ${eligiblePoolCount} near matches`;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[13px] text-ink-2">{dayPart()}</p>
        <h1 className="font-display text-[30px] leading-[1.1] font-semibold tracking-tight">
          What’s for dinner?
        </h1>
      </div>

      <Segmented<MachineMode>
        label="Spin mode"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'single', label: 'Our recipes', hint: 'Spin your saved dishes' },
          { value: '3-reel', label: 'Build a plate', hint: 'Base + main + sauce' },
          { value: 'sunday', label: 'Sunday roast', hint: 'Four-reel roast builder' },
        ]}
      />

      {mode === 'sunday' ? (
        <p className="text-[13px] text-ink-2">
          A roast takes the afternoon. Hold the reels you like and spin the rest.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Segmented<TimeStake>
            label="Time available"
            size="sm"
            value={timeStake}
            onChange={setTimeStake}
            options={[
              { value: '20m', label: '20 min' },
              { value: '30m', label: '30 min' },
              { value: '60m', label: '1 hour' },
              { value: 'all-day', label: 'All day' },
            ]}
          />
          <Segmented<EffortLevel>
            label="Effort and washing-up"
            size="sm"
            value={effort}
            onChange={setEffort}
            options={[
              { value: 'one-pot', label: 'One pot' },
              { value: 'standard', label: 'Standard' },
              { value: 'chef-mode', label: 'Chef mode' },
            ]}
          />
          {poolNote && <p className="px-1 text-[12px] text-ink-3">{poolNote}</p>}
        </div>
      )}

      {redItems.length > 0 && mode === 'single' && (
        <div className="rounded-xl border border-line bg-card px-3.5 py-2.5">
          <Switch
            id="clearout-switch"
            checked={clearoutActive}
            onChange={setClearoutActive}
            label={`Use up ${redItems.length} ${redItems.length === 1 ? 'item' : 'items'} first`}
            description={<span className="line-clamp-1">{redItems.map((r) => r.name).join(', ')}</span>}
          />
        </div>
      )}

      <ReelWindow onSpin={spin} />

      {activeMealResult && !isSpinning && pantryMatch && (
        <Card className="fade-up overflow-hidden" aria-label="Spin result">
          {photoFor(activeMealResult.id) && (
            <button onClick={() => setSheetOpen(true)} className="block w-full" aria-label="Open the full recipe">
              <img
                src={photoFor(activeMealResult.id)}
                alt=""
                className="aspect-[16/9] w-full object-cover"
                width={480}
                height={270}
              />
            </button>
          )}
          <div className="p-4">
          <div className="flex items-start gap-3">
            {!photoFor(activeMealResult.id) && (
              <DishTile cuisine={activeMealResult.cuisine} imageUrl={activeMealResult.imageUrl} size={52} />
            )}
            <div className="min-w-0 flex-1">
              <p className="eyebrow">Tonight’s spin</p>
              <h2 className="font-display text-[21px] leading-snug font-semibold">{activeMealResult.title}</h2>
            </div>
            <IconButton
              label={activeMealResult.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
              active={activeMealResult.isFavorite}
              onClick={() => toggleFavoriteMeal(activeMealResult.id)}
              className="-mr-1.5 -mt-1"
            >
              <Heart className={cx('h-5 w-5', activeMealResult.isFavorite && 'fill-current')} strokeWidth={1.75} />
            </IconButton>
          </div>

          {(activeMealResult.rating === 5 || coolingDays !== null || pantryMatch.redMatchedItems.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {pantryMatch.redMatchedItems.length > 0 && (
                <Chip tone="tomato">Uses up {pantryMatch.redMatchedItems.join(', ')}</Chip>
              )}
              {activeMealResult.rating === 5 && (
                <Chip tone="saffron">
                  <Star className="h-3 w-3 fill-current" /> Five-star dish
                </Chip>
              )}
              {coolingDays !== null && isCoolingOff(activeMealResult) && (
                <Chip>
                  <Snowflake className="h-3 w-3" />
                  Had it {coolingDays === 0 ? 'today' : coolingDays === 1 ? 'yesterday' : `${coolingDays} days ago`}
                </Chip>
              )}
            </div>
          )}

          <p className="mt-3 text-[14px] leading-relaxed text-ink-2">{activeMealResult.description}</p>

          {/* Kitchen check */}
          <div className="mt-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[14px] font-semibold">
                You have {pantryMatch.matchedCount} of {pantryMatch.totalCount}
              </p>
              {pantryMatch.missingItems.length > 0 && (
                <button
                  onClick={() => {
                    openPantryTab('missing');
                    setActiveView(2);
                  }}
                  className="inline-flex items-center gap-1 text-[13px] font-semibold text-tomato hover:underline"
                >
                  <ShoppingBasket className="h-4 w-4" />
                  {pantryMatch.missingItems.length} to buy
                </button>
              )}
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunk">
              <div
                className="h-full rounded-full bg-sage transition-[width] duration-500"
                style={{ width: `${pantryMatch.matchPercentage}%` }}
              />
            </div>
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Ingredients">
              {activeMealResult.ingredients.map((ing, i) => {
                const isMissing = pantryMatch.missingItems.includes(ing);
                const isRed = pantryMatch.redMatchedItems.some(
                  (r) =>
                    r.toLowerCase().includes(ing.toLowerCase()) ||
                    ing.toLowerCase().includes(r.toLowerCase())
                );
                return (
                  <li key={i}>
                    <Chip tone={isRed ? 'tomato' : isMissing ? 'outline' : 'sage'}>
                      {!isMissing && <Check className="h-3 w-3" />}
                      {ing}
                      <span className="sr-only">
                        {isRed ? ' (in the fridge, use next)' : isMissing ? ' (need to buy)' : ' (in stock)'}
                      </span>
                    </Chip>
                  </li>
                );
              })}
            </ul>
          </div>

          {activeMealResult.prepSteps.length > 0 && (
            <p className="mt-4 border-t border-line pt-3 text-[13px] text-ink-2">
              <span className="font-semibold text-ink">First step: </span>
              {activeMealResult.prepSteps[0].replace(/\s*\(-(\d+)m\)/, (_m, mins) => ` (${mins} min before eating)`)}
            </p>
          )}

          <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" onClick={() => setSheetOpen(true)}>
              <BookOpen className="h-4 w-4" /> Recipe
            </Button>
            <Button variant="primary" onClick={() => sendToVote(activeMealResult)}>
              <Send className="h-4 w-4" />
              Put it to the household
            </Button>
          </div>
          </div>
        </Card>
      )}

      {swapNote && (
        <p role="status" className="fade-up rounded-xl bg-sunk px-3.5 py-3 text-[14px] text-ink-2">
          {swapNote}
        </p>
      )}

      {sheetOpen && activeMealResult && (
        <RecipeSheet
          meal={activeMealResult}
          onClose={() => setSheetOpen(false)}
          onReplaced={(gone, replacement) =>
            setSwapNote(
              replacement
                ? `“${gone.title}” won’t come up again. “${replacement.title}” is on the reel instead.`
                : `“${gone.title}” won’t come up again.`
            )
          }
        />
      )}
    </div>
  );
};
