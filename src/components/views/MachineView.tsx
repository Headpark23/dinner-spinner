import React, { useEffect, useRef, useState } from 'react';
import { RecipeSheet } from '../RecipeSheet';
import { photoFor } from '../../data/photos';
import { useDinner } from '../../context/DinnerContext';
import { ReelWindow } from '../ReelWindow';
import { TimeFilter, EffortFilter, MachineMode } from '../../types';
import { Heart, Check, ShoppingBasket, Star, Snowflake, BookOpen, SlidersHorizontal, Dices, Bike, ChevronRight, ThumbsUp, Globe2, CalendarDays, ChevronDown, Refrigerator, Trophy } from 'lucide-react';
import { PlannerSheet } from '../PlannerSheet';
import { DinnerSteps } from '../DinnerSteps';
import { FamilyPrompt } from '../FamilyPrompt';
import { CupboardSheet } from '../CupboardSheet';
import { FreezerCard } from '../FreezerCard';
import { costLabel, type CostLimit } from '../../utils/cost';
import { Card, Chip, Notice, DishTile, Segmented, Switch, Button, IconButton, Sheet, cx, timeLabel, effortLabel } from '../ui';

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

/** Ask the Pantry view to open on its recipe tab, in the World Kitchen. */
export const openWorldKitchen = () => {
  openPantryTab('vault');
  try {
    sessionStorage.setItem('ds_pantry_scope', 'world');
  } catch {
    // ignore
  }
};

export const MachineView: React.FC<{ onOpenFamily?: () => void }> = ({ onOpenFamily }) => {
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
    diets,
    setActiveView,
    isCoolingOff,
    getCoolingOffDays,
    householdCode,
    shared,
    costLimit,
    setCostLimit,
    costRelaxed,
  } = useDinner();
  const leagueTop = householdCode ? shared.league.find((r) => r.votes > 0) : undefined;

  // The reels stay where they are when they stop, so the person sees what landed. A cue under the reels
  // says the recipe and method are below, and scrolls there only when asked.
  const resultRef = useRef<HTMLDivElement | null>(null);
  const showResult = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    resultRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [cupboardOpen, setCupboardOpen] = useState(false);
  const { surpriseStep, setSurpriseStep } = useDinner();
  useEffect(() => {
    if (surpriseStep === 'spin') {
      setCupboardOpen(true);
      setSurpriseStep(null);
    }
  }, [surpriseStep, setSurpriseStep]);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const redItems = pantry.filter((p) => p.freshness === 'red');
  const pantryMatch = activeMealResult ? getMealPantryMatch(activeMealResult) : null;
  const coolingDays = activeMealResult ? getCoolingOffDays(activeMealResult) : null;

  const poolNote =
    mode !== 'single'
      ? null
      : eligiblePoolCount === 0
      ? null
      : costRelaxed
      ? `Nothing fits ${costLabel(costLimit).toLowerCase()} right now, so the reel holds everything else`
      : exactEffortMatchCount > 0
      ? null
      : `Nothing fits those limits, so the reel holds ${eligiblePoolCount} closest matches`;

  const showFilters = mode !== 'sunday';
  const useUpOn = clearoutActive && redItems.length > 0 && mode === 'single';

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-[23px] leading-tight font-semibold">What’s for dinner?</h1>
        <span className="shrink-0 text-[12px] text-ink-3">{dayPart()}</span>
      </div>
      <DinnerSteps />

      <Segmented<MachineMode>
        label="What to spin"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'single', label: 'A dish', hint: 'Spin your saved dishes' },
          { value: '3-reel', label: '3 reels', hint: 'Base + main + sauce' },
          { value: '4-reel', label: '4 reels', hint: 'Base + main + sauce + veg' },
          { value: 'sunday', label: 'Roast', hint: 'Sunday roast builder' },
        ]}
      />
      {mode !== 'single' && (
        <p className="-mt-1 px-1 text-[12px] text-ink-3">
          {mode === '3-reel'
            ? 'Base, main and sauce. Hold a reel to keep it; the arrow nudges it on.'
            : mode === '4-reel'
            ? 'Base, main, sauce and veg. Hold a reel to keep it; the arrow nudges it on.'
            : 'A Sunday roast takes the afternoon. Hold the reels you like and spin the rest.'}
        </p>
      )}

      {mode === 'single' && eligiblePoolCount === 0 && diets.length > 0 && (
        <Notice tone="tomato">
          None of your saved dishes suit the household’s diets. Try “Fancy something new?” below, or change the diets in
          Kitchen, then Avoid.
        </Notice>
      )}

      <ReelWindow onSpin={spin} />

      {showFilters ? (
        <button
          onClick={() => setFiltersOpen(true)}
          className="flex w-full items-center gap-3 rounded-2xl border border-line bg-card px-3 py-2 text-left transition-colors hover:border-line-strong"
        >
          <SlidersHorizontal className="h-4 w-4 shrink-0 text-ink-2" strokeWidth={1.75} />
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">
              {timeStake === 'any' || timeStake === 'all-day' ? 'Any time' : `Up to ${timeLabel(timeStake)}`} ·{' '}
              {effort === 'any' || effort === 'chef-mode' ? 'Any effort' : effort === 'one-pot' ? 'One pot' : 'Standard or easier'}
              {mode === 'single' && costLimit !== 'any' ? ` · ${costLimit === 'free' ? 'Free' : '£' + costLimit}` : ''}
            </span>
            {useUpOn && (
              <span className="block truncate text-[12px] text-ink-2">
                Favouring {redItems.length} fridge {redItems.length === 1 ? 'item' : 'items'} to use up
              </span>
            )}
          </span>
          <span className="shrink-0 text-[13px] font-semibold text-tomato">Change</span>
        </button>
      ) : null}
      {poolNote && showFilters && <p className="-mt-2 px-1 text-[12px] text-ink-3">{poolNote}</p>}


      {activeMealResult && !isSpinning && (
        <button
          type="button"
          onClick={showResult}
          className="fade-up -mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-3.5 text-[14px] font-semibold text-ink hover:bg-sunk"
        >
          Recipe and method below <ChevronDown className="h-4 w-4 animate-bounce" />
        </button>
      )}

      {activeMealResult && !isSpinning && pantryMatch && (
        <div ref={resultRef} className="scroll-mt-[68px]">
        <Card className="fade-up overflow-hidden" aria-label="Spin result" aria-live="polite">
          {photoFor(activeMealResult.id) && (
            <button onClick={() => setSheetOpen(true)} className="block w-full" aria-label="Open the full recipe">
              <img
                src={photoFor(activeMealResult.id)}
                alt=""
                className="aspect-[2/1] w-full object-cover"
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
                <p className="eyebrow">Tonight’s pick</p>
                <h2 className="font-display text-[21px] leading-snug font-semibold">{activeMealResult.title}</h2>
                <p className="mt-0.5 text-[13px] text-ink-2">
                  {timeLabel(activeMealResult.timeStake)} · {effortLabel(activeMealResult.effort)} · {activeMealResult.cuisine}
                </p>
                <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{activeMealResult.description}</p>
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

            {/* Kitchen check: one line, one bar, and only the things you still need */}
            <div className="mt-4 rounded-xl bg-sunk p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[14px] font-semibold">
                  You have {pantryMatch.matchedCount} of {pantryMatch.totalCount} ingredients
                </p>
                {pantryMatch.missingItems.length === 0 && (
                  <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-sage">
                    <Check className="h-4 w-4" /> All here
                  </span>
                )}
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full bg-sage transition-[width] duration-500"
                  style={{ width: `${pantryMatch.matchPercentage}%` }}
                />
              </div>
              {pantryMatch.missingItems.length > 0 && (
                <div className="mt-2.5 flex items-start justify-between gap-3">
                  <p className="min-w-0 text-[13px] text-ink-2">
                    <span className="font-semibold text-ink">Need: </span>
                    {pantryMatch.missingItems.join(', ')}
                  </p>
                  <button
                    onClick={() => setSheetOpen(true)}
                    className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-tomato hover:underline"
                  >
                    <ShoppingBasket className="h-4 w-4" /> Add to list
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 grid grid-cols-[auto_1fr] gap-2">
              <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                <BookOpen className="h-4 w-4" /> Recipe
              </Button>
              <Button variant="primary" onClick={() => sendToVote(activeMealResult)}>
                <ThumbsUp className="h-4 w-4" />
                Start the vote
              </Button>
            </div>
            <button
              onClick={() => {
                window.scrollTo({ top: 0, behavior: 'smooth' });
                spin();
              }}
              className="mx-auto mt-3 flex h-9 items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink"
            >
              <Dices className="h-4 w-4" /> Not this one? Spin again
            </button>
          </div>
        </Card>
        </div>
      )}

      {/* Two shortcuts, small and side by side, under the spinner */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => setCupboardOpen(true)}
          className="flex items-center gap-2 rounded-xl border border-line bg-card p-2.5 text-left transition-colors hover:border-line-strong"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-saffron-soft text-saffron">
            <Refrigerator className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] leading-tight font-semibold">Cook from what we have</span>
            <span className="mt-0.5 block truncate text-[11.5px] text-ink-2">
              {redItems.length > 0 ? `Rescues ${redItems.length} ${redItems.length === 1 ? 'item' : 'items'}` : 'No shopping trip'}
            </span>
          </span>
        </button>
        <button
          onClick={() => setActiveView(1)}
          className="flex items-center gap-2 rounded-xl border border-line bg-card p-2.5 text-left transition-colors hover:border-line-strong"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brass/15 text-brass">
            <Trophy className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] leading-tight font-semibold">Family takeaway league</span>
            <span className="mt-0.5 block truncate text-[11.5px] text-ink-2">
              {leagueTop ? `Top: ${leagueTop.spot.name}` : 'Rank the places'}
            </span>
          </span>
        </button>
      </div>
      <FreezerCard
        onOpen={() => {
          openPantryTab('freezer');
          setActiveView(2);
        }}
      />
      <CupboardSheet isOpen={cupboardOpen} onClose={() => setCupboardOpen(false)} />
      {onOpenFamily && <FamilyPrompt onOpen={onOpenFamily} />}

      <button
        type="button"
        onClick={() => {
          openWorldKitchen();
          setActiveView(5);
        }}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-left hover:border-line-strong"
      >
        <Globe2 className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Fancy something new?</span>
          <span className="block text-[13px] text-ink-2">Browse 119 dishes from 46 cuisines</span>
        </span>
        <ChevronDown className="h-4 w-4 -rotate-90 text-ink-3" />
      </button>

      <button
        type="button"
        onClick={() => setPlannerOpen(true)}
        className="flex min-h-11 w-full items-center gap-2.5 rounded-xl border border-line bg-card px-3.5 py-2.5 text-left hover:border-line-strong"
      >
        <CalendarDays className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.75} />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-semibold">Plan the week</span>
          <span className="block text-[13px] text-ink-2">Seven dinners, themed nights, one shopping trip</span>
        </span>
        <ChevronDown className="h-4 w-4 -rotate-90 text-ink-3" />
      </button>
      <PlannerSheet isOpen={plannerOpen} onClose={() => setPlannerOpen(false)} />

      {swapNote && (
        <p role="status" className="fade-up rounded-xl bg-sunk px-3.5 py-3 text-[14px] text-ink-2">
          {swapNote}
        </p>
      )}

      {/* Always-visible escape routes, so nobody gets stuck on a spin they don't want */}
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
        <li>
          <button
            onClick={() => setActiveView(5)}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-sunk"
          >
            <BookOpen className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="font-semibold">Rather choose yourself?</span>{' '}
              <span className="text-ink-2">Browse your recipes</span>
            </span>
            <ChevronRight className="h-4 w-4 text-ink-3" />
          </button>
        </li>
        <li>
          <button
            onClick={() => setActiveView(1)}
            className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-sunk"
          >
            <Bike className="h-5 w-5 shrink-0 text-ink-2" strokeWidth={1.75} />
            <span className="min-w-0 flex-1 text-[14px]">
              <span className="font-semibold">Not cooking tonight?</span>{' '}
              <span className="text-ink-2">Spin for a takeaway</span>
            </span>
            <ChevronRight className="h-4 w-4 text-ink-3" />
          </button>
        </li>
      </ul>

      <Sheet
        isOpen={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Narrow it down"
        subtitle="The reel only holds dishes that fit."
        labelledBy="filters-title"
      >
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[14px] font-semibold">How long have you got?</p>
            <p className="-mt-1 text-[12px] text-ink-2">Dishes up to this long. “Any time” means no limit.</p>
            <Segmented<TimeFilter>
              label="Time available"
              value={timeStake}
              onChange={setTimeStake}
              options={[
                { value: '20m', label: '20 min' },
                { value: '30m', label: '30 min' },
                { value: '60m', label: '1 hour' },
                { value: 'any', label: 'Any time' },
              ]}
            />
          </div>
          <div className="space-y-2">
            <p className="text-[14px] font-semibold">How much effort?</p>
            <p className="-mt-1 text-[12px] text-ink-2">One pot is the least washing-up. “Any effort” means anything goes.</p>
            <Segmented<EffortFilter>
              label="Effort and washing-up"
              value={effort}
              onChange={setEffort}
              options={[
                { value: 'one-pot', label: 'One pot' },
                { value: 'standard', label: 'Standard' },
                { value: 'any', label: 'Any effort' },
              ]}
            />
          </div>
          {mode === 'single' && (
            <div className="space-y-2">
              <p className="text-[14px] font-semibold">How much to spend?</p>
              <p className="-mt-1 text-[12px] text-ink-2">
                What you would have to buy, a rough guess. “Free” is what is already in the fridge, tins and staples, give or take £2.
              </p>
              <Segmented<CostLimit>
                label="Budget for ingredients"
                value={costLimit}
                onChange={setCostLimit}
                options={[
                  {
                    value: 'free',
                    label: (
                      <span className="flex flex-col leading-tight">
                        Free<span className="text-[10px] font-normal opacity-80">what we have</span>
                      </span>
                    ),
                  },
                  { value: '5', label: '£5' },
                  { value: '10', label: '£10' },
                  { value: 'any', label: 'No limit' },
                ]}
              />
              {costLimit === 'free' && <p className="text-[12px] text-ink-3">Free means cooking from what we have, with at most about £2 of small top-ups.</p>}
            </div>
          )}
          {redItems.length > 0 && mode === 'single' && (
            <div className="rounded-xl border border-line bg-card px-3.5 py-3">
              <Switch
                id="clearout-switch"
                checked={clearoutActive}
                onChange={setClearoutActive}
                label={`Use up ${redItems.length} fridge ${redItems.length === 1 ? 'item' : 'items'} first`}
                description={<span className="line-clamp-2">{redItems.map((r) => r.name).join(', ')}</span>}
              />
            </div>
          )}
          {poolNote && <p className="text-[13px] text-ink-2">{poolNote}</p>}
          <Button variant="primary" size="lg" block onClick={() => setFiltersOpen(false)}>
            Done
          </Button>
        </div>
      </Sheet>

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
