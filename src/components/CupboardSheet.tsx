import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Camera,
  Check,
  ChefHat,
  Clock,
  Dices,
  Eye,
  Lightbulb,
  LoaderCircle,
  Refrigerator,
  RefreshCw,
  Send,
  ShoppingBasket,
  Snowflake,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import type { ChefRecommendation, MealSlot } from '../types';
import {
  CHEF_STYLES,
  TOP_CHEFS,
  buildOfflineChefFallback,
  chefRecipeToMeal,
  type ChefStyle,
} from '../utils/chefMaker';
import { CupboardCandidate, cupboardCandidates, freezerCandidates, pickSurprise } from '../utils/cupboard';
import { resolveMealPhoto } from '../data/photos';
import { Button, Card, Chip, FreshDot, Notice, Segmented, Sheet, cx, effortLabel, timeLabel } from './ui';
import type { UsedTodayInitialMeal } from './UsedTodaySheet';

type StudioTab = 'ai' | 'quick';

/** AI Chef Kitchen Studio + quick cupboard/freezer spinner. */
export const CupboardSheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onLogMeal?: (meal: UsedTodayInitialMeal) => void;
}> = ({ isOpen, onClose, onLogMeal }) => {
  const {
    meals,
    pantry,
    staples,
    inStock,
    cupboard,
    restrictions,
    freezer,
    servings,
    authHeaders,
    useFreezerPortion,
    setSurpriseStep,
    sendToVote,
    addMeal,
    addShoppingItems,
    setActiveView,
  } = useDinner();

  const [tab, setTab] = useState<StudioTab>('ai');
  const [mealSlot, setMealSlot] = useState<'dinner' | 'lunch' | 'breakfast'>('dinner');
  const [style, setStyle] = useState<ChefStyle>('any');
  const [chefFocus, setChefFocus] = useState<string>('all');
  const [focusIngredients, setFocusIngredients] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offlineNote, setOfflineNote] = useState<string | null>(null);
  const [recs, setRecs] = useState<ChefRecommendation[]>([]);
  const [selectedRec, setSelectedRec] = useState<ChefRecommendation | null>(null);
  const [savedIds, setSavedIds] = useState<Record<string, boolean>>({});
  const [addedExtrasIds, setAddedExtrasIds] = useState<Record<string, boolean>>({});
  const seenTitles = useRef<string[]>([]);

  // Quick offline spin state
  const candidates = useMemo(
    () =>
      isOpen
        ? [
            ...freezerCandidates(freezer, meals, restrictions.avoid, restrictions.diets),
            ...cupboardCandidates({ meals, pantry, staples: inStock, banned: restrictions.avoid, diets: restrictions.diets }),
          ]
        : [],
    [isOpen, meals, pantry, inStock, restrictions, freezer]
  );
  const [pick, setPick] = useState<CupboardCandidate | null>(null);
  const [savedQuick, setSavedQuick] = useState(false);
  const recentQuick = useRef<string[]>([]);

  const spinQuick = () => {
    const next = pickSurprise(candidates, recentQuick.current.slice(-3));
    if (next) recentQuick.current.push(next.meal.id);
    setPick(next);
    setSavedQuick(false);
  };

  useEffect(() => {
    if (isOpen && tab === 'quick' && !pick && candidates.length > 0) spinQuick();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, tab, candidates.length]);

  const fridgeCount = pantry.length;
  const redItems = useMemo(() => pantry.filter((p) => p.freshness === 'red'), [pantry]);
  const stockedCupboard = useMemo(() => cupboard.filter((c) => !c.low), [cupboard]);
  const stockedFreezer = useMemo(() => freezer.filter((f) => f.portions > 0), [freezer]);
  const empty = fridgeCount === 0 && stockedCupboard.length === 0 && stockedFreezer.length === 0;

  // Spotlight candidates: Use-Next fridge items first, then other fridge items, then cupboard
  const spotlightChoices = useMemo(() => {
    const sortedFridge = [...pantry].sort((a, b) => {
      const rank = (f: string) => (f === 'red' ? 0 : f === 'amber' ? 1 : 2);
      return rank(a.freshness) - rank(b.freshness);
    });
    return sortedFridge.slice(0, 10);
  }, [pantry]);

  const toggleFocus = (name: string) => {
    setFocusIngredients((prev) =>
      prev.includes(name) ? prev.filter((x) => x !== name) : prev.length < 4 ? [...prev, name] : prev
    );
  };

  const askAiChef = async (freshBatch = false) => {
    setLoading(true);
    setError(null);
    setOfflineNote(null);
    setSelectedRec(null);

    const excludeTitles = freshBatch ? seenTitles.current.slice(-12) : [];
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 35000);

    try {
      const res = await fetch('/api/chef/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        signal: controller.signal,
        body: JSON.stringify({
          fridge: pantry.map((p) => ({ name: p.name, freshness: p.freshness, quantity: p.quantity })),
          cupboard: stockedCupboard.map((c) => c.name),
          freezer: stockedFreezer.map((f) => `${f.name} (${f.portions} portions)`),
          staples,
          focusIngredients,
          mealSlot,
          style,
          chefFocus,
          diets: restrictions.diets,
          avoid: restrictions.avoid,
          servings,
          excludeTitles,
        }),
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (data.aiUnavailable || res.status === 503) {
          const fallback = buildOfflineChefFallback({
            meals,
            pantry,
            inStock,
            avoid: restrictions.avoid,
            diets: restrictions.diets,
            servings,
            focusIngredients,
          });
          if (fallback.length > 0) {
            setRecs(fallback);
            setOfflineNote(
              data.aiUnavailable
                ? 'Live AI Chef needs a Gemini API key on the server — showing top kitchen matches from your stock instead.'
                : 'AI Chef is busy right now — showing instant matches from your stock while you wait.'
            );
            return;
          }
        }
        throw new Error(data.error || 'AI Chef couldn’t craft a menu just now.');
      }

      const list: ChefRecommendation[] = Array.isArray(data.recommendations) ? data.recommendations : [];
      if (list.length === 0) throw new Error('No dishes came back. Try adding a couple more ingredients.');
      seenTitles.current = [...seenTitles.current, ...list.map((r) => r.title)].slice(-18);
      setRecs(list);
    } catch (err: any) {
      clearTimeout(timer);
      const fallback = buildOfflineChefFallback({
        meals,
        pantry,
        inStock,
        avoid: restrictions.avoid,
        diets: restrictions.diets,
        servings,
        focusIngredients,
      });
      if (fallback.length > 0) {
        setRecs(fallback);
        setOfflineNote(
          err?.name === 'AbortError'
            ? 'AI Chef took too long — showing instant stock matches instead.'
            : 'Couldn’t reach AI Chef just now — showing instant matches from your kitchen stock.'
        );
      } else {
        setError(err?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setSelectedRec(null);
    setPick(null);
    onClose();
  };

  const photoForRec = (rec: ChefRecommendation) => {
    const resolved = resolveMealPhoto({
      id: rec.id,
      title: rec.title,
      cuisine: rec.cuisine,
      ingredients: rec.ingredients,
      imageUrl: rec.imageUrl,
      photoCredit: rec.photoCredit,
    });
    return resolved;
  };

  const handleSaveChefMeal = (rec: ChefRecommendation) => {
    if (savedIds[rec.id]) return;
    addMeal(chefRecipeToMeal(rec));
    setSavedIds((prev) => ({ ...prev, [rec.id]: true }));
  };

  const handleVoteChefMeal = (rec: ChefRecommendation) => {
    const saved = addMeal(chefRecipeToMeal(rec));
    setSavedIds((prev) => ({ ...prev, [rec.id]: true }));
    sendToVote(saved);
    close();
  };

  const handleCookAndLog = (rec: ChefRecommendation) => {
    if (!onLogMeal) return;
    const slot: MealSlot = mealSlot;
    close();
    onLogMeal({
      title: rec.title,
      cuisine: rec.cuisine,
      ingredients: [...rec.usesFromKitchen, ...rec.ingredients],
      slot,
    });
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={close}
      title={selectedRec ? selectedRec.title : 'AI Chef Kitchen'}
      subtitle={
        selectedRec
          ? `${selectedRec.chefInspiration} · Serves ${selectedRec.servings}`
          : 'Dishes inspired by Jamie Oliver, Gordon Ramsay, Nigella Lawson, Tom Kerridge & Nadiya Hussain.'
      }
      labelledBy="cupboard-title"
      tall
    >
      {selectedRec ? (
        /* ================= ILLUSTRATED STEP-BY-STEP CHEF GUIDE ================= */
        (() => {
          const hero = photoForRec(selectedRec);
          return (
            <div className="fade-up space-y-5">
              <button
                type="button"
                onClick={() => setSelectedRec(null)}
                className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink-2 hover:text-ink"
              >
                <ArrowLeft className="h-4 w-4" /> Back to all {recs.length} chef picks
              </button>

              {/* Full-bleed dish hero */}
              <figure className="-mx-5 overflow-hidden">
                <div className="relative aspect-[16/10] w-full overflow-hidden bg-sunk">
                  <img
                    src={hero.url}
                    alt={selectedRec.title}
                    onError={(e) => {
                      if (!e.currentTarget.src.endsWith(hero.fallbackUrl)) {
                        e.currentTarget.src = hero.fallbackUrl;
                      }
                    }}
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                  <div className="absolute top-3 left-4 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brass px-2.5 py-1 text-[11px] font-bold text-enamel shadow-xs">
                      <ChefHat className="h-3.5 w-3.5" /> {selectedRec.chefInspiration}
                    </span>
                  </div>
                  <div className="absolute bottom-3 left-4 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/60 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                      <Clock className="h-3 w-3" /> {timeLabel(selectedRec.timeStake)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                      {effortLabel(selectedRec.effort)}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-black/60 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                      {selectedRec.cuisine}
                    </span>
                  </div>
                </div>
                {hero.credit && (
                  <figcaption className="px-5 pt-1.5 text-[11px] text-ink-3">
                    Photo:{' '}
                    <a href={hero.credit.source} target="_blank" rel="noreferrer" className="underline">
                      {hero.credit.author.slice(0, 60)}
                    </a>
                    , {hero.credit.license}
                  </figcaption>
                )}
              </figure>

              <p className="text-[14.5px] leading-relaxed text-ink-2">{selectedRec.description}</p>

              {/* Chef's Secret Tip */}
              <div className="rounded-2xl border border-brass/35 bg-gradient-to-br from-card to-saffron-soft/45 p-3.5">
                <p className="flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.08em] text-saffron">
                  <Sparkles className="h-3.5 w-3.5" /> Chef’s note
                </p>
                <p className="mt-1 text-[13.5px] leading-snug text-ink">{selectedRec.chefTip}</p>
                <p className="mt-1.5 text-[12.5px] text-ink-2">{selectedRec.whyItWorks}</p>
              </div>

              {/* Ingredients */}
              <section className="space-y-2.5" aria-labelledby="chef-ing-h">
                <div className="flex items-baseline justify-between">
                  <h3 id="chef-ing-h" className="font-display text-[19px] font-semibold">
                    Ingredients
                  </h3>
                  <span className="text-[12px] font-semibold text-sage">
                    Uses {selectedRec.usesFromKitchen.length} from your kitchen
                  </span>
                </div>
                {selectedRec.rescues.length > 0 && (
                  <p className="text-[12.5px] font-medium text-tomato">
                    Rescues use-next items: {selectedRec.rescues.join(', ')}
                  </p>
                )}
                <ul className="editorial-card divide-y divide-line/80 overflow-hidden rounded-[18px] border border-line/90 bg-card">
                  {selectedRec.ingredients.map((ing, idx) => (
                    <li key={`${ing}-${idx}`} className="flex items-center gap-2.5 px-3.5 py-2 text-[14px]">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sage-soft text-sage">
                        <Check className="h-3 w-3" strokeWidth={2.8} />
                      </span>
                      <span className="min-w-0 flex-1 leading-snug">{ing}</span>
                    </li>
                  ))}
                </ul>

                {selectedRec.optionalExtras.length > 0 && (
                  <div className="rounded-2xl border border-line bg-sunk/60 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[12.5px] font-semibold text-ink-2">
                        Optional extras: <span className="font-normal text-ink">{selectedRec.optionalExtras.join(', ')}</span>
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!!addedExtrasIds[selectedRec.id]}
                        onClick={() => {
                          addShoppingItems(selectedRec.optionalExtras, selectedRec.title);
                          setAddedExtrasIds((prev) => ({ ...prev, [selectedRec.id]: true }));
                        }}
                      >
                        <ShoppingBasket className="h-3.5 w-3.5 text-tomato" />
                        {addedExtrasIds[selectedRec.id] ? 'Added' : 'Add to list'}
                      </Button>
                    </div>
                  </div>
                )}
              </section>

              {/* Step-by-Step Instructions */}
              <section className="space-y-3" aria-labelledby="chef-steps-h">
                <div className="flex items-baseline justify-between">
                  <h3 id="chef-steps-h" className="font-display text-[19px] font-semibold">
                    Step-by-step method
                  </h3>
                  <span className="text-[12px] text-ink-3">{selectedRec.steps.length} steps</span>
                </div>
                <ol className="space-y-2.5">
                  {selectedRec.steps.map((step, i) => (
                    <li
                      key={i}
                      className="editorial-card rounded-[18px] border border-line/90 bg-card p-3.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-enamel text-[11.5px] font-bold text-white tabular-nums">
                            {i + 1}
                          </span>
                          <p className="font-display text-[16px] leading-snug font-semibold text-ink">
                            {step.title}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-sunk px-2.5 py-0.5 text-[11px] font-semibold text-ink-2 tabular-nums">
                          {step.minutesBefore === 0 ? 'Serve' : `-${step.minutesBefore}m`}
                        </span>
                      </div>
                      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{step.instruction}</p>
                      {step.visualCue && (
                        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-sage-soft/65 px-2.5 py-1.5 text-[12.5px] font-medium text-sage">
                          <Eye className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>
                            <strong>Look for:</strong> {step.visualCue}
                          </span>
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              </section>

              {/* Actions */}
              <div className="space-y-2 border-t border-line pt-4">
                {onLogMeal && (
                  <Button variant="primary" size="lg" block onClick={() => handleCookAndLog(selectedRec)}>
                    <Utensils className="h-4 w-4" /> Cooked this — log &amp; update stock
                  </Button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant="secondary"
                    block
                    disabled={!!savedIds[selectedRec.id]}
                    onClick={() => handleSaveChefMeal(selectedRec)}
                  >
                    <BookmarkPlus className="h-4 w-4" />
                    {savedIds[selectedRec.id] ? 'Saved' : 'Save recipe'}
                  </Button>
                  <Button variant="secondary" block onClick={() => handleVoteChefMeal(selectedRec)}>
                    <Send className="h-4 w-4" /> Put to vote
                  </Button>
                </div>
              </div>
            </div>
          );
        })()
      ) : (
        /* ================= MAIN STUDIO / QUICK SPIN VIEW ================= */
        <div className="space-y-4">
          <Segmented<StudioTab>
            label="Recipe maker mode"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'ai', label: 'AI Chef (top chef recipes)' },
              { value: 'quick', label: 'Quick cupboard spin' },
            ]}
          />

          {/* Live inventory pulse */}
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-2xl border border-line/80 bg-sunk/70 px-3.5 py-2.5 text-[12.5px] text-ink-2">
            <Refrigerator className="h-4 w-4 shrink-0 text-tomato" />
            <span>
              <strong className="text-ink tabular-nums">{fridgeCount}</strong> fridge
              {redItems.length > 0 && (
                <span className="ml-1 font-semibold text-tomato">({redItems.length} use next)</span>
              )}
            </span>
            <span>·</span>
            <span>
              <strong className="text-ink tabular-nums">{stockedCupboard.length}</strong> cupboard
            </span>
            {stockedFreezer.length > 0 && (
              <>
                <span>·</span>
                <span>
                  <strong className="text-ink tabular-nums">{stockedFreezer.length}</strong> freezer
                </span>
              </>
            )}
            <span>·</span>
            <span>
              <strong className="text-ink tabular-nums">{staples.length}</strong> staples
            </span>
          </div>

          {empty && (
            <Notice tone="neutral">
              Your fridge and cupboard lists are empty, so only staples count. Add what you have or snap a photo for standout chef recipes.
              <button
                className="ml-1 font-semibold underline"
                onClick={() => {
                  close();
                  setActiveView(2);
                }}
              >
                Open Kitchen
              </button>
            </Notice>
          )}

          {tab === 'ai' ? (
            <div className="space-y-4">
              {/* Spotlight ingredients */}
              {spotlightChoices.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between px-0.5">
                    <p className="text-[12.5px] font-semibold text-ink-2">Spotlight ingredients (optional)</p>
                    {focusIngredients.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFocusIngredients([])}
                        className="text-[12px] font-semibold text-tomato hover:underline"
                      >
                        Clear ({focusIngredients.length})
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {spotlightChoices.map((item) => {
                      const active = focusIngredients.includes(item.name);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleFocus(item.name)}
                          className={cx(
                            'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors',
                            active
                              ? 'border-tomato bg-tomato text-white font-semibold'
                              : item.freshness === 'red'
                                ? 'border-tomato/30 bg-tomato-soft/70 text-tomato hover:border-tomato/60'
                                : 'border-line bg-card text-ink-2 hover:border-line-strong hover:text-ink'
                          )}
                        >
                          {item.freshness === 'red' && !active && <FreshDot level="red" />}
                          {active && <Check className="h-3 w-3" strokeWidth={2.8} />}
                          {item.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Meal & Style filters */}
              <div className="space-y-2.5">
                <Segmented<'breakfast' | 'lunch' | 'dinner'>
                  label="Meal"
                  size="sm"
                  value={mealSlot}
                  onChange={setMealSlot}
                  options={[
                    { value: 'breakfast', label: 'Breakfast' },
                    { value: 'lunch', label: 'Lunch' },
                    { value: 'dinner', label: 'Dinner' },
                  ]}
                />
                <div className="flex flex-wrap gap-1.5">
                  {CHEF_STYLES.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStyle(s.id)}
                      className={cx(
                        'h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors',
                        style === s.id
                          ? 'border-ink bg-ink text-paper'
                          : 'border-line bg-card text-ink-2 hover:border-line-strong hover:text-ink'
                      )}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div className="space-y-1">
                  <p className="px-0.5 text-[12px] font-semibold text-ink-2">Chef inspiration</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(['all', ...TOP_CHEFS] as const).map((chef) => (
                      <button
                        key={chef}
                        type="button"
                        onClick={() => setChefFocus(chef)}
                        className={cx(
                          'h-8 rounded-full border px-3 text-[12px] font-semibold transition-colors',
                          chefFocus === chef
                            ? 'border-saffron bg-saffron-soft text-saffron'
                            : 'border-line bg-card text-ink-2 hover:border-line-strong hover:text-ink'
                        )}
                      >
                        {chef === 'all' ? 'All 5 chefs' : chef}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  block
                  disabled={loading}
                  onClick={() => askAiChef(recs.length > 0)}
                >
                  {loading ? (
                    <>
                      <LoaderCircle className="h-5 w-5 animate-spin" /> Consulting top chefs…
                    </>
                  ) : recs.length > 0 ? (
                    <>
                      <RefreshCw className="h-4 w-4" /> Fresh 3 chef dishes
                    </>
                  ) : (
                    <>
                      <ChefHat className="h-5 w-5" /> Ask AI Chef for 3 dishes
                    </>
                  )}
                </Button>
                <Button
                  variant="secondary"
                  size="lg"
                  aria-label="Scan fridge photo"
                  title="Snap a photo of your fridge"
                  onClick={() => {
                    setSurpriseStep('scan');
                    close();
                    setActiveView(2);
                  }}
                >
                  <Camera className="h-5 w-5" />
                </Button>
              </div>

              {loading && (
                <Card className="fade-up space-y-2 border-brass/35 bg-gradient-to-br from-card to-saffron-soft/35 p-4">
                  <p className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    <Sparkles className="h-4 w-4 text-saffron" /> Crafting your menu…
                  </p>
                  <p className="text-[13px] text-ink-2">
                    Matching your ingredients with {chefFocus === 'all' ? 'Jamie Oliver, Gordon Ramsay, Nigella Lawson, Tom Kerridge & Nadiya Hussain' : chefFocus} techniques for {servings}.
                  </p>
                </Card>
              )}

              {offlineNote && <Notice tone="neutral">{offlineNote}</Notice>}
              {error && <Notice tone="tomato">{error}</Notice>}

              {/* 3 Editorial Chef Cards */}
              {!loading && recs.length > 0 && (
                <div className="space-y-3.5" aria-live="polite">
                  {recs.map((rec) => {
                    const photo = photoForRec(rec);
                    return (
                      <article
                        key={rec.id}
                        className="editorial-card fade-up overflow-hidden rounded-[22px] border border-line/90 bg-card"
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedRec(rec)}
                          className="group block w-full text-left"
                        >
                          <div className="relative aspect-[16/10] w-full overflow-hidden bg-sunk">
                            <img
                              src={photo.url}
                              alt={rec.title}
                              onError={(e) => {
                                if (!e.currentTarget.src.endsWith(photo.fallbackUrl)) {
                                  e.currentTarget.src = photo.fallbackUrl;
                                }
                              }}
                              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />
                            <div className="absolute top-2.5 left-3 flex flex-wrap gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-brass px-2.5 py-0.5 text-[11px] font-bold text-enamel shadow-xs">
                                <ChefHat className="h-3 w-3" /> {rec.chefInspiration}
                              </span>
                            </div>
                            <div className="absolute right-3 bottom-3 left-3 text-white">
                              <div className="mb-1 flex flex-wrap gap-1.5">
                                <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-xs">
                                  <Clock className="h-3 w-3" /> {timeLabel(rec.timeStake)}
                                </span>
                                <span className="rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold backdrop-blur-xs">
                                  {effortLabel(rec.effort)}
                                </span>
                                {rec.rescues.length > 0 && (
                                  <span className="rounded-full bg-tomato px-2 py-0.5 text-[11px] font-bold">
                                    Rescues {rec.rescues.length}
                                  </span>
                                )}
                              </div>
                              <h3 className="font-display text-[21px] leading-[1.12] font-semibold drop-shadow-xs">
                                {rec.title}
                              </h3>
                            </div>
                          </div>
                        </button>

                        <div className="space-y-3 p-3.5">
                          <p className="text-[13.5px] leading-snug text-ink-2">{rec.description}</p>
                          <div className="flex flex-wrap gap-1.5">
                            {rec.usesFromKitchen.slice(0, 6).map((u) => (
                              <Chip key={u} tone={rec.rescues.includes(u) ? 'tomato' : 'sage'}>
                                {u}
                              </Chip>
                            ))}
                            {rec.optionalExtras.slice(0, 2).map((e) => (
                              <Chip key={`opt-${e}`} tone="neutral">
                                + {e}
                              </Chip>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 pt-0.5">
                            <Button variant="primary" size="sm" className="flex-1" onClick={() => setSelectedRec(rec)}>
                              Open full method ({rec.steps.length} steps)
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={!!savedIds[rec.id]}
                              onClick={() => handleSaveChefMeal(rec)}
                            >
                              <BookmarkPlus className="h-4 w-4" />
                              {savedIds[rec.id] ? 'Saved' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ================= QUICK OFFLINE SPIN ================= */
            <div className="space-y-4">
              {candidates.length === 0 ? (
                <Notice tone="tomato">
                  Nothing fits what’s in the house yet. Add a few things to the fridge or staples, or switch to AI Chef above.
                </Notice>
              ) : (
                <Button variant="primary" size="lg" block onClick={spinQuick}>
                  <Dices className="h-5 w-5" /> {pick ? 'Surprise me again' : 'Surprise me'}
                </Button>
              )}

              {pick && (() => {
                const photo = resolveMealPhoto(pick.meal);
                return (
                  <article className="editorial-card fade-up overflow-hidden rounded-[22px] border border-line bg-card" aria-live="polite">
                    <div className="relative aspect-[16/9] w-full overflow-hidden bg-sunk">
                      <img
                        src={photo.url}
                        alt={pick.meal.title}
                        onError={(e) => {
                          if (!e.currentTarget.src.endsWith(photo.fallbackUrl)) {
                            e.currentTarget.src = photo.fallbackUrl;
                          }
                        }}
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                      <div className="absolute right-3 bottom-3 left-3 text-white">
                        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/85">
                          {pick.kind === 'freezer' ? (
                            <>
                              <Snowflake className="h-3.5 w-3.5" /> From the freezer · {pick.portionsLeft}{' '}
                              {pick.portionsLeft === 1 ? 'portion' : 'portions'} left
                            </>
                          ) : pick.kind === 'idea' ? (
                            <>
                              <Lightbulb className="h-3.5 w-3.5" /> Cupboard idea
                            </>
                          ) : (
                            'One of your recipes'
                          )}
                        </p>
                        <h3 className="mt-0.5 font-display text-[22px] leading-snug font-semibold">{pick.meal.title}</h3>
                      </div>
                    </div>

                    <div className="space-y-3 p-4">
                      <p className="text-[13px] text-ink-2">
                        {timeLabel(pick.meal.timeStake)} · {effortLabel(pick.meal.effort)} · {pick.meal.cuisine}
                      </p>
                      <p className="text-[14px] leading-snug text-ink-2">{pick.meal.description}</p>

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

                      <div className="flex flex-col gap-2 pt-1">
                        {pick.kind === 'freezer' && (
                          <Button
                            variant="primary"
                            block
                            onClick={() => {
                              useFreezerPortion(pick.freezerId!);
                              close();
                            }}
                          >
                            Eat a portion tonight
                          </Button>
                        )}
                        {!(pick.kind === 'freezer' && pick.meal.id.startsWith('freezer:')) && (
                          <Button
                            variant={pick.kind === 'freezer' ? 'secondary' : 'primary'}
                            block
                            onClick={() => {
                              sendToVote(pick.meal);
                              close();
                            }}
                          >
                            Put it to the household
                          </Button>
                        )}
                        {pick.kind === 'idea' && (
                          <Button
                            variant="secondary"
                            block
                            disabled={savedQuick}
                            onClick={() => {
                              const { id: _id, rating: _r, cookCount: _c, lastCookedDate: _l, isFavorite: _f, ...rest } = pick.meal;
                              addMeal({ ...rest, source: 'own', tags: ['Cupboard idea'] });
                              setSavedQuick(true);
                            }}
                          >
                            <BookmarkPlus className="h-4 w-4" /> {savedQuick ? 'Saved to your recipes' : 'Save to my recipes'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
};
