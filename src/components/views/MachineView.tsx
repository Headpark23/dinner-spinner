import React, { useEffect, useRef, useState } from 'react';
import { RecipeSheet } from '../RecipeSheet';
import { resolveMealPhoto } from '../../data/photos';
import { useDinner } from '../../context/DinnerContext';
import { ReelWindow } from '../ReelWindow';
import { TimeFilter, EffortFilter, MachineMode } from '../../types';
import {
  Heart,
  Check,
  ShoppingBasket,
  Star,
  Snowflake,
  BookOpen,
  SlidersHorizontal,
  Dices,
  ChevronRight,
  ThumbsUp,
  Globe2,
  CalendarDays,
  ChevronDown,
  Refrigerator,
  Trophy,
  Package,
  Clock,
  ChefHat,
  Utensils,
} from 'lucide-react';
import { PlannerSheet } from '../PlannerSheet';
import { DinnerSteps } from '../DinnerSteps';
import { FamilyPrompt } from '../FamilyPrompt';
import { CupboardSheet } from '../CupboardSheet';
import { UsedTodaySheet, type UsedTodayInitialMeal } from '../UsedTodaySheet';
import { FreezerCard } from '../FreezerCard';
import { MEAL_SLOTS, todayDayKey } from '../../utils/dailyLog';
import { costLabel, type CostLimit } from '../../utils/cost';
import { Card, Chip, Notice, Segmented, Switch, Button, IconButton, Sheet, cx, timeLabel, effortLabel } from '../ui';

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
    cupboard,
    weekPlan,
    meals,
    likedIngredients: likesForRow,
    bannedIngredients: dislikesForRow,
    dailyLog,
    restockSuggestions,
  } = useDinner();
  const leagueTop = householdCode ? shared.league.find((r) => r.votes > 0) : undefined;

  const resultRef = useRef<HTMLDivElement | null>(null);
  const showResult = () => {
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    resultRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const [sheetOpen, setSheetOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [plannerOpen, setPlannerOpen] = useState(false);
  const [cupboardOpen, setCupboardOpen] = useState(false);
  const [usedTodayOpen, setUsedTodayOpen] = useState(false);
  const [usedTodayInitial, setUsedTodayInitial] = useState<UsedTodayInitialMeal | null>(null);
  const todayKey = todayDayKey();
  const todayLogged = dailyLog.filter((e) => e.day === todayKey);
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
  const resolvedResultPhoto = activeMealResult ? resolveMealPhoto(activeMealResult) : undefined;
  const plannedCount = Object.keys(weekPlan).length;

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
    <div className="space-y-3.5">
      {/* Editorial masthead */}
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{dayPart()}</p>
          <h1 className="mt-0.5 font-display text-[28px] leading-[1.08] font-semibold tracking-tight">What’s for dinner?</h1>
        </div>
        {showFilters && (
          <button
            onClick={() => setFiltersOpen(true)}
            className="editorial-card inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-line bg-card px-3.5 text-[13px] font-semibold text-ink transition-colors hover:border-line-strong"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-tomato" strokeWidth={2} />
            <span>
              {timeStake === 'any' || timeStake === 'all-day' ? 'Any time' : timeLabel(timeStake)}
              {mode === 'single' && costLimit !== 'any' ? ` · ${costLimit === 'free' ? 'Free' : '£' + costLimit}` : ''}
            </span>
          </button>
        )}
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
        <p className="-mt-1 px-1 text-[12.5px] text-ink-2">
          {mode === '3-reel'
            ? 'Base, main and sauce. Hold a reel to keep it; the arrow nudges it on.'
            : mode === '4-reel'
            ? 'Base, main, sauce and veg. Hold a reel to keep it; the arrow nudges it on.'
            : 'A Sunday roast takes the afternoon. Hold the reels you like and spin the rest.'}
        </p>
      )}

      {mode === 'single' && eligiblePoolCount === 0 && diets.length > 0 && (
        <Notice tone="tomato">
          None of your saved dishes suit the household’s diets. Try “World Kitchen” below, or adjust diets in Kitchen → Likes &amp; dislikes.
        </Notice>
      )}

      <ReelWindow onSpin={spin} />

      {useUpOn && (
        <p className="-mt-1 flex items-center justify-center gap-1.5 text-center text-[12.5px] font-medium text-sage">
          <Check className="h-3.5 w-3.5" /> Favouring {redItems.length} fridge {redItems.length === 1 ? 'item' : 'items'} to use up
        </p>
      )}
      {poolNote && showFilters && <p className="-mt-1 px-1 text-center text-[12px] text-ink-3">{poolNote}</p>}

      {activeMealResult && !isSpinning && (
        <button
          type="button"
          onClick={showResult}
          className="fade-up flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-line bg-card/80 px-3.5 text-[13.5px] font-semibold text-ink-2 hover:bg-sunk hover:text-ink"
        >
          See tonight’s dish &amp; ingredients <ChevronDown className="h-4 w-4 text-tomato" />
        </button>
      )}

      {/* Editorial Hero Result Card */}
      {activeMealResult && !isSpinning && pantryMatch && resolvedResultPhoto && (
        <div ref={resultRef} className="scroll-mt-[72px]">
          <Card className="fade-up overflow-hidden" aria-label="Spin result" aria-live="polite">
            <div className="relative">
              <button onClick={() => setSheetOpen(true)} className="group block w-full text-left" aria-label="Open the full recipe">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-sunk">
                  <img
                    src={resolvedResultPhoto.url}
                    alt=""
                    onError={(e) => {
                      if (!e.currentTarget.src.endsWith(resolvedResultPhoto.fallbackUrl)) {
                        e.currentTarget.src = resolvedResultPhoto.fallbackUrl;
                      }
                    }}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                    width={540}
                    height={338}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/18 to-black/10" />
                  <div className="absolute top-3 left-3 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                      <Clock className="h-3 w-3" /> {timeLabel(activeMealResult.timeStake)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                      {activeMealResult.cuisine}
                    </span>
                    {activeMealResult.rating === 5 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brass px-2.5 py-1 text-[11.5px] font-bold text-enamel">
                        <Star className="h-3 w-3 fill-current" /> 5★
                      </span>
                    )}
                  </div>
                  <div className="absolute right-14 bottom-3 left-4 text-white">
                    <p className="text-[10.5px] font-semibold tracking-[0.1em] uppercase text-white/80">Tonight’s pick</p>
                    <h2 className="mt-0.5 font-display text-[24px] leading-[1.12] font-semibold drop-shadow-xs">
                      {activeMealResult.title}
                    </h2>
                  </div>
                </div>
              </button>
              <IconButton
                label={activeMealResult.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                active={activeMealResult.isFavorite}
                onClick={() => toggleFavoriteMeal(activeMealResult.id)}
                className="absolute right-3 bottom-3 h-10 w-10 rounded-full bg-card/92 shadow-md backdrop-blur-xs"
              >
                <Heart className={cx('h-5 w-5', activeMealResult.isFavorite && 'fill-current')} strokeWidth={1.85} />
              </IconButton>
            </div>

            <div className="p-4">
              <p className="line-clamp-2 text-[14px] leading-relaxed text-ink-2">{activeMealResult.description}</p>

              {(coolingDays !== null || pantryMatch.redMatchedItems.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {pantryMatch.redMatchedItems.length > 0 && (
                    <Chip tone="tomato">Uses up {pantryMatch.redMatchedItems.join(', ')}</Chip>
                  )}
                  {coolingDays !== null && isCoolingOff(activeMealResult) && (
                    <Chip>
                      <Snowflake className="h-3 w-3" />
                      Had it {coolingDays === 0 ? 'today' : coolingDays === 1 ? 'yesterday' : `${coolingDays} days ago`}
                    </Chip>
                  )}
                </div>
              )}

              {/* Kitchen stock check */}
              <div className="mt-3.5 rounded-2xl border border-line/70 bg-sunk/75 p-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13.5px] font-semibold">
                    You have {pantryMatch.matchedCount} of {pantryMatch.totalCount} ingredients
                  </p>
                  {pantryMatch.missingItems.length === 0 ? (
                    <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-sage">
                      <Check className="h-4 w-4" /> All in the house
                    </span>
                  ) : (
                    <span className="text-[12px] font-medium text-ink-3 tabular-nums">{pantryMatch.matchPercentage}% stocked</span>
                  )}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
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
                      <ShoppingBasket className="h-4 w-4" /> Shop list
                    </button>
                  </div>
                )}
              </div>

              <div className="mt-4 grid grid-cols-[auto_1fr] gap-2.5">
                <Button variant="secondary" onClick={() => setSheetOpen(true)}>
                  <BookOpen className="h-4 w-4" /> Method
                </Button>
                <Button variant="primary" onClick={() => sendToVote(activeMealResult)}>
                  <ThumbsUp className="h-4 w-4" />
                  Put to the vote
                </Button>
              </div>
              <button
                onClick={() => {
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                  spin();
                }}
                className="mx-auto mt-2.5 flex h-9 items-center gap-1.5 text-[13.5px] font-semibold text-ink-2 hover:text-ink"
              >
                <Dices className="h-4 w-4" /> Not feeling this one? Spin again
              </button>
            </div>
          </Card>
        </div>
      )}

      {/* 2x2 Warm Editorial Bento Grid — replaces the long stack of beige shortcut bars */}
      <section aria-label="Quick kitchen ways in" className="pt-1">
        <p className="eyebrow mb-2 px-1">Other ways to decide</p>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            onClick={() => setCupboardOpen(true)}
            className="editorial-card group flex flex-col justify-between rounded-[20px] border border-saffron/30 bg-gradient-to-br from-card via-card to-saffron-soft/65 p-3.5 text-left transition-all hover:border-saffron/55"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-saffron-soft text-saffron ring-1 ring-saffron/25">
                <ChefHat className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <span className="rounded-full bg-brass/25 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-saffron">
                AI Chef
              </span>
            </div>
            <div className="mt-3">
              <span className="block font-display text-[16.5px] leading-tight font-semibold text-ink">Cook what we have</span>
              <span className="mt-1 block text-[12px] leading-snug text-ink-2">
                {redItems.length > 0
                  ? `Top chef dishes · rescues ${redItems.length} use-next`
                  : 'Top chef recipes & step photos'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setActiveView(5)}
            className="editorial-card group flex flex-col justify-between rounded-[20px] border border-sage/25 bg-gradient-to-br from-card via-card to-sage-soft/55 p-3.5 text-left transition-all hover:border-sage/45"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-soft text-sage ring-1 ring-sage/20">
              <BookOpen className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="mt-3">
              <span className="block font-display text-[16.5px] leading-tight font-semibold text-ink">Your saved recipes</span>
              <span className="mt-1 block text-[12px] leading-snug text-ink-2">
                {meals.length > 0 ? `${meals.length} ${meals.length === 1 ? 'dish' : 'dishes'} in your book` : 'Browse your recipe book'}
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              openWorldKitchen();
              setActiveView(5);
            }}
            className="editorial-card group flex flex-col justify-between rounded-[20px] border border-tomato/20 bg-gradient-to-br from-card via-card to-tomato-soft/45 p-3.5 text-left transition-all hover:border-tomato/40"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-tomato-soft text-tomato ring-1 ring-tomato/20">
              <Globe2 className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="mt-3">
              <span className="block font-display text-[16.5px] leading-tight font-semibold text-ink">World Kitchen</span>
              <span className="mt-1 block text-[12px] leading-snug text-ink-2">119 classics · 46 cuisines</span>
            </div>
          </button>

          <button
            onClick={() => setActiveView(1)}
            className="editorial-card group flex flex-col justify-between rounded-[20px] border border-brass/35 bg-gradient-to-br from-card via-card to-brass/14 p-3.5 text-left transition-all hover:border-brass/60"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brass/18 text-saffron ring-1 ring-brass/30">
              <Trophy className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div className="mt-3">
              <span className="block font-display text-[16.5px] leading-tight font-semibold text-ink">Takeaway night</span>
              <span className="mt-1 block truncate text-[12px] leading-snug text-ink-2">
                {leagueTop ? `No. 1: ${leagueTop.spot.name}` : 'Spin local spots & league'}
              </span>
            </div>
          </button>
        </div>
      </section>

      {/* What was used today: daily food & stock tracker */}
      <Card as="div" className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="font-display text-[16.5px] leading-tight font-semibold text-ink">What was used today?</p>
            <p className="mt-0.5 text-[12px] text-ink-2">
              {todayLogged.length > 0
                ? `${todayLogged.length} logged today${restockSuggestions.length > 0 ? ` · ${restockSuggestions.length} to restock` : ''}`
                : 'Log breakfast, lunch, dinner or ingredients to update stock'}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setUsedTodayInitial(null);
              setUsedTodayOpen(true);
            }}
          >
            <Utensils className="h-3.5 w-3.5 text-tomato" /> Log
          </Button>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5">
          {MEAL_SLOTS.map((s) => {
            const count = todayLogged.filter((e) => e.slot === s.id).length;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setUsedTodayInitial({ title: '', ingredients: [], slot: s.id });
                  setUsedTodayOpen(true);
                }}
                className={cx(
                  'rounded-xl border px-2 py-1.5 text-center text-[11.5px] font-semibold transition-colors',
                  count > 0
                    ? 'border-sage/35 bg-sage-soft/75 text-sage'
                    : 'border-line bg-sunk/60 text-ink-2 hover:border-line-strong hover:text-ink'
                )}
              >
                {s.short}
                {count > 0 ? ` ✓` : ''}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Plan the week */}
      <button
        type="button"
        onClick={() => setPlannerOpen(true)}
        className="editorial-card flex w-full items-center gap-3 rounded-[20px] border border-sage/25 bg-gradient-to-r from-card via-card to-sage-soft/55 px-3.5 py-3 text-left transition-all hover:border-sage/45"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sage-soft text-sage ring-1 ring-sage/20">
          <CalendarDays className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[16.5px] leading-tight font-semibold text-ink">Plan the week</span>
          <span className="mt-0.5 block text-[12px] leading-snug text-ink-2">
            {plannedCount > 0 ? `${plannedCount} of 7 nights planned` : '7 dinners, one shop'}
          </span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
      </button>

      <FreezerCard
        onOpen={() => {
          openPantryTab('freezer');
          setActiveView(2);
        }}
      />

      {/* Compact Kitchen Shelf Strip: Cupboard, Tastes & Browse Recipes */}
      <Card as="div" className="divide-y divide-line overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-line">
          <button
            onClick={() => {
              openPantryTab('cupboard');
              setActiveView(2);
            }}
            className="flex items-center gap-2.5 p-3 text-left transition-colors hover:bg-sunk/55"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunk text-ink-2">
              <Package className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] leading-tight font-semibold">Cupboard</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-ink-2">
                {cupboard.length === 0
                  ? 'Tins, jars & spices'
                  : `${cupboard.length} stocked${cupboard.some((c) => c.low) ? ` · ${cupboard.filter((c) => c.low).length} low` : ''}`}
              </span>
            </span>
          </button>

          <button
            onClick={() => {
              openPantryTab('banned');
              setActiveView(2);
            }}
            className="flex items-center gap-2.5 p-3 text-left transition-colors hover:bg-sunk/55"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-soft text-sage">
              <Heart className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] leading-tight font-semibold">Likes &amp; dislikes</span>
              <span className="mt-0.5 block truncate text-[11.5px] text-ink-2">
                {likesForRow.length + dislikesForRow.length === 0
                  ? 'Set household tastes'
                  : `${likesForRow.length} liked · ${dislikesForRow.length} never`}
              </span>
            </span>
          </button>
        </div>
      </Card>

      <CupboardSheet
        isOpen={cupboardOpen}
        onClose={() => setCupboardOpen(false)}
        onLogMeal={(meal) => {
          setUsedTodayInitial(meal);
          setUsedTodayOpen(true);
        }}
      />
      {usedTodayOpen && (
        <UsedTodaySheet
          isOpen={usedTodayOpen}
          onClose={() => {
            setUsedTodayOpen(false);
            setUsedTodayInitial(null);
          }}
          initialMeal={usedTodayInitial}
        />
      )}
      <PlannerSheet isOpen={plannerOpen} onClose={() => setPlannerOpen(false)} />
      {onOpenFamily && <FamilyPrompt onOpen={onOpenFamily} />}

      {swapNote && (
        <p role="status" className="fade-up rounded-2xl border border-line bg-sunk px-3.5 py-3 text-[14px] text-ink-2">
          {swapNote}
        </p>
      )}

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
            <div className="rounded-2xl border border-line bg-card px-3.5 py-3">
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
