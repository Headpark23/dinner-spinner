import React, { useMemo, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { Meal, MealTweaks } from '../types';
import { withTweaks } from '../utils/dinnerEngine';
import { repairImportedMeal, splitIngredientDisplay } from '../utils/recipeImport';
import { quantityFor, hasQuantities } from '../utils/quantities';
import { photoFor, PHOTO_CREDITS } from '../data/photos';
import { Check, Plus, X, Send, Dices, Star, ThumbsDown, Heart, ShoppingBasket, ImageDown, Clock } from 'lucide-react';
import { shareRecipeCard } from '../utils/shareRecipeCard';
import { costPerHeadText } from '../utils/cost';
import { Button, Chip, IconButton, Segmented, Sheet, TextInput, cx, timeLabel, effortLabel } from './ui';

const stripTiming = (step: string) => step.replace(/\s*\(-\d+m\)/, '');
const stepMinutes = (step: string) => Number(step.match(/\(-(\d+)m\)/)?.[1] ?? 0);

export const RecipeSheet: React.FC<{
  meal: Meal | null;
  onClose: () => void;
  onReplaced?: (gone: Meal, replacement: Meal | null) => void;
}> = ({ meal, onClose, onReplaced }) => {
  const {
    meals,
    getMealPantryMatch,
    shoppingList,
    addShoppingItems,
    removeShoppingByName,
    updateMealTweaks,
    rejectMeal,
    addFromLibrary,
    sendToVote,
    setActiveMealResult,
    setActiveView,
    toggleFavoriteMeal,
    cookLog,
    servings,
    setServings,
    costEach,
  } = useDinner();

  const rawCurrent = meal ? meals.find((m) => m.id === meal.id) || meal : null;
  const current = useMemo(() => (rawCurrent ? repairImportedMeal(rawCurrent) : null), [rawCurrent]);
  const inRotation = !!current && meals.some((m) => m.id === current.id);

  const [haveOverrides, setHaveOverrides] = useState<Record<string, boolean>>({});
  const [cardNote, setCardNote] = useState<string | null>(null);
  const [listStarted, setListStarted] = useState(false);
  const [newIng, setNewIng] = useState('');
  const [newStep, setNewStep] = useState('');
  const [newStepMins, setNewStepMins] = useState('10');
  const [confirmReject, setConfirmReject] = useState(false);

  const effective = useMemo(() => (current ? withTweaks(current) : null), [current]);
  if (!current || !effective) return null;

  const tweaks: MealTweaks = current.tweaks || { extraIngredients: [], extraSteps: [] };
  const match = getMealPantryMatch(current);
  const onList = (name: string) =>
    shoppingList.some((s) => !s.checked && s.name.toLowerCase() === name.toLowerCase());
  const has = (name: string) =>
    name in haveOverrides ? haveOverrides[name] : !match.missingItems.includes(name) && !onList(name);
  const missing = effective.ingredients.filter((i) => !has(i));
  const haveCount = effective.ingredients.length - missing.length;

  const toggleHave = (name: string) => {
    const nowHave = !has(name);
    setHaveOverrides((prev) => ({ ...prev, [name]: nowHave }));
    if (!listStarted) {
      setListStarted(true);
      const toAdd = effective.ingredients.filter((i) => (i === name ? !nowHave : !has(i)));
      addShoppingItems(toAdd, current.title);
      if (nowHave) removeShoppingByName(name);
      return;
    }
    if (nowHave) removeShoppingByName(name);
    else addShoppingItems([name], current.title);
  };

  const saveTweaks = (next: MealTweaks) => updateMealTweaks(current.id, next);

  const photo = current.imageUrl || photoFor(current.id);
  const credit = PHOTO_CREDITS[current.id] || (current.imageUrl ? current.photoCredit : undefined);
  const reviews = cookLog
    .filter((c) => c.mealId === current.id)
    .flatMap((c) => (c.reviews || []).map((r) => ({ ...r, date: c.date })))
    .slice(0, 6);
  const steps = [...effective.prepSteps].sort((a, b) => stepMinutes(b) - stepMinutes(a));
  const ownSteps = new Set(tweaks.extraSteps.map((s) => s.text));

  return (
    <Sheet isOpen onClose={onClose} title={current.title} labelledBy="recipe-title" tall>
      {photo && (
        <figure className="-mx-5 -mt-1 mb-4 overflow-hidden">
          <div className="relative aspect-[16/10] w-full overflow-hidden">
            <img src={photo} alt={current.title} className="h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/15" />
            <div className="absolute bottom-3 left-4 flex flex-wrap gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                <Clock className="h-3 w-3" /> {timeLabel(current.timeStake)}
              </span>
              <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                {effortLabel(current.effort)}
              </span>
              <span className="inline-flex items-center rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                {costPerHeadText(costEach(current))}
              </span>
            </div>
            {inRotation && (
              <IconButton
                label={current.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                active={current.isFavorite}
                onClick={() => toggleFavoriteMeal(current.id)}
                className="absolute right-3 bottom-3 h-10 w-10 rounded-full bg-card/92 shadow-md backdrop-blur-xs"
              >
                <Heart className={cx('h-5 w-5', current.isFavorite && 'fill-current')} />
              </IconButton>
            )}
          </div>
          {credit && (
            <figcaption className="px-5 pt-1.5 text-[11px] text-ink-3">
              Photo:{' '}
              <a href={credit.source} target="_blank" rel="noreferrer" className="underline">
                {credit.author.slice(0, 60)}
              </a>
              , {credit.license}
            </figcaption>
          )}
        </figure>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[13px] font-medium text-ink-2">
        <span>{[current.origin, current.cuisine].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</span>
        {!photo && (
          <span>
            · {timeLabel(current.timeStake)} · {effortLabel(current.effort)} · {costPerHeadText(costEach(current))}
          </span>
        )}
      </div>

      {current.rating > 0 && (
        <p className="mt-1.5 flex items-center gap-1 text-[13px] text-saffron">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className={cx('h-3.5 w-3.5', s <= current.rating ? 'fill-current' : 'opacity-30')} />
          ))}
          <span className="ml-1 text-ink-2">
            {reviews.length > 0 ? `from ${reviews.length} household ${reviews.length === 1 ? 'verdict' : 'verdicts'}` : ''}
          </span>
        </p>
      )}
      <p className="mt-2 text-[14.5px] leading-relaxed text-ink-2">{current.description}</p>

      {/* Ingredients checklist */}
      <section className="mt-6" aria-labelledby="have-h">
        <div className="flex items-baseline justify-between">
          <h3 id="have-h" className="font-display text-[19px] font-semibold">
            Ingredients
          </h3>
          <span className="text-[12.5px] font-semibold text-ink-2 tabular-nums">
            {missing.length === 0 ? 'All in stock' : `${haveCount}/${effective.ingredients.length} here · ${missing.length} to buy`}
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] text-ink-3">Tick what’s in the kitchen. Everything else goes on the shared shopping list.</p>
        {hasQuantities(current.id) && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl bg-sunk/70 px-3 py-2">
            <span className="text-[13px] font-semibold">Servings</span>
            <Segmented<'2' | '4' | '6' | '8'>
              label="Servings"
              size="sm"
              value={String(servings) as '2' | '4' | '6' | '8'}
              onChange={(n) => setServings(Number(n))}
              options={['2', '4', '6', '8'].map((n) => ({ value: n as '2' | '4' | '6' | '8', label: n }))}
              className="w-48"
            />
          </div>
        )}
        <ul className="editorial-card mt-2 divide-y divide-line/80 overflow-hidden rounded-[18px] border border-line/90 bg-card">
          {effective.ingredients.map((ing) => {
            const have = has(ing);
            const mine = tweaks.extraIngredients.includes(ing);
            const tableQty = quantityFor(current.id, ing, servings);
            const parsed = tableQty ? { qty: tableQty, item: ing, prep: '' } : splitIngredientDisplay(ing);
            return (
              <li key={ing}>
                <button
                  role="checkbox"
                  aria-checked={have}
                  onClick={() => toggleHave(ing)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[14px] leading-snug transition-colors hover:bg-sunk/60"
                >
                  <span
                    className={cx(
                      'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors',
                      have ? 'border-sage bg-sage text-white' : 'border-line-strong bg-paper'
                    )}
                  >
                    {have && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className={cx('min-w-0 flex-1', have && 'text-ink-2')}>
                    {parsed.qty && <span className="mr-1.5 font-semibold text-ink tabular-nums">{parsed.qty}</span>}
                    <span className="font-medium">{parsed.item}</span>
                    {parsed.prep && <span className="text-[12.5px] text-ink-3">, {parsed.prep}</span>}
                  </span>
                  {mine && <Chip tone="neutral">yours</Chip>}
                  {!have && onList(ing) && (
                    <span className="flex shrink-0 items-center gap-1 rounded-full bg-tomato-soft px-2 py-0.5 text-[11px] font-semibold text-tomato">
                      <ShoppingBasket className="h-3 w-3" /> on list
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {missing.some((m) => !onList(m)) && (
          <Button
            variant="secondary"
            size="sm"
            className="mt-2.5"
            onClick={() => {
              setListStarted(true);
              addShoppingItems(missing, current.title);
            }}
          >
            <ShoppingBasket className="h-4 w-4 text-tomato" /> Add {missing.length} missing to shopping list
          </Button>
        )}
      </section>

      {/* Method */}
      <section className="mt-5" aria-labelledby="method-h">
        <div className="flex items-baseline justify-between">
          <h3 id="method-h" className="font-display text-[19px] font-semibold">
            Method
          </h3>
          <span className="text-[12px] text-ink-3">{steps.length} {steps.length === 1 ? 'step' : 'steps'} · before eating</span>
        </div>
        <ol className="editorial-card mt-2 divide-y divide-line/80 overflow-hidden rounded-[18px] border border-line/90 bg-card">
          {steps.map((step, i) => {
            const mins = stepMinutes(step);
            return (
              <li key={i} className="flex items-start gap-2.5 px-3.5 py-2.5 text-[14px]">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sunk text-[11px] font-bold text-ink-2 tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 leading-snug text-ink">
                  {stripTiming(step)}
                  {ownSteps.has(stripTiming(step)) && <span className="ml-1.5 text-[12px] font-medium text-tomato">(your step)</span>}
                </span>
                <span className="mt-0.5 shrink-0 rounded-md bg-sunk/85 px-1.5 py-0.5 text-[11px] font-semibold text-ink-3 tabular-nums">
                  {mins === 0 ? 'Serve' : `-${mins}m`}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Tweaks */}
      {inRotation && (
        <section className="mt-6 rounded-2xl border border-line/80 bg-sunk/75 p-4" aria-labelledby="tweak-h">
          <h3 id="tweak-h" className="font-display text-[17px] font-semibold">
            House notes &amp; tweaks
          </h3>
          <p className="mt-0.5 text-[12.5px] text-ink-2">Your additions sit on top of the recipe and slot into the cooking timeline.</p>

          {(tweaks.extraIngredients.length > 0 || tweaks.extraSteps.length > 0) && (
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
              {tweaks.extraIngredients.map((ing) => (
                <li key={`i-${ing}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-card py-1 pr-1 pl-3 text-[13px]">
                  + {ing}
                  <button
                    aria-label={`Remove ${ing}`}
                    onClick={() => saveTweaks({ ...tweaks, extraIngredients: tweaks.extraIngredients.filter((x) => x !== ing) })}
                    className="rounded-full p-1 text-ink-3 hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {tweaks.extraSteps.map((st, idx) => (
                <li key={`s-${idx}`} className="inline-flex items-center gap-1 rounded-full border border-line bg-card py-1 pr-1 pl-3 text-[13px]">
                  {st.text} · {st.minutesBefore} min
                  <button
                    aria-label={`Remove step ${st.text}`}
                    onClick={() => saveTweaks({ ...tweaks, extraSteps: tweaks.extraSteps.filter((_, i) => i !== idx) })}
                    className="rounded-full p-1 text-ink-3 hover:text-ink"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newIng.trim();
              if (!v || tweaks.extraIngredients.includes(v)) return;
              saveTweaks({ ...tweaks, extraIngredients: [...tweaks.extraIngredients, v] });
              setNewIng('');
            }}
          >
            <TextInput value={newIng} onChange={(e) => setNewIng(e.target.value)} placeholder="Extra ingredient" aria-label="Extra ingredient" />
            <Button type="submit" variant="secondary" disabled={!newIng.trim()} aria-label="Add ingredient" className="!px-3">
              <Plus className="h-5 w-5" />
            </Button>
          </form>
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newStep.trim();
              if (!v) return;
              saveTweaks({ ...tweaks, extraSteps: [...tweaks.extraSteps, { text: v, minutesBefore: Number(newStepMins) || 0 }] });
              setNewStep('');
            }}
          >
            <TextInput value={newStep} onChange={(e) => setNewStep(e.target.value)} placeholder="Extra step" aria-label="Extra step" />
            <label className="sr-only" htmlFor="step-mins">
              Minutes before eating
            </label>
            <TextInput
              id="step-mins"
              type="number"
              min={0}
              max={600}
              inputMode="numeric"
              value={newStepMins}
              onChange={(e) => setNewStepMins(e.target.value)}
              className="!w-20 shrink-0 text-center"
              title="Minutes before eating"
            />
            <Button type="submit" variant="secondary" disabled={!newStep.trim()} aria-label="Add step" className="!px-3">
              <Plus className="h-5 w-5" />
            </Button>
          </form>
          <textarea
            defaultValue={tweaks.note || ''}
            onBlur={(e) => {
              if ((tweaks.note || '') !== e.target.value) saveTweaks({ ...tweaks, note: e.target.value.trim() });
            }}
            rows={2}
            placeholder="A note for next time, e.g. double the garlic"
            aria-label="Note for next time"
            className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-[14px] placeholder:text-ink-3 focus:border-tomato/60 focus:outline-none"
          />
        </section>
      )}

      {/* Household verdicts */}
      {reviews.length > 0 && (
        <section className="mt-6" aria-labelledby="verdicts-h">
          <h3 id="verdicts-h" className="font-display text-[17px] font-semibold">
            What the household said
          </h3>
          <ul className="mt-2 space-y-2">
            {reviews.map((r, i) => (
              <li key={i} className="rounded-xl border border-line/70 bg-card px-3 py-2 text-[14px]">
                <span className="font-semibold">{r.memberName}</span>{' '}
                <span className="text-saffron" aria-label={`${r.stars} stars`}>
                  {'★'.repeat(r.stars)}
                </span>
                {r.comment && <span className="mt-0.5 block text-ink-2">“{r.comment}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions */}
      <div className="mt-6 space-y-2.5 border-t border-line pt-4">
        {inRotation ? (
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              sendToVote(current);
              onClose();
            }}
          >
            <Send className="h-4 w-4" /> Propose for tonight
          </Button>
        ) : current.source === 'world' ? (
          <Button variant="primary" size="lg" block onClick={() => addFromLibrary(current.id)}>
            <Plus className="h-4 w-4" /> Add to our recipes
          </Button>
        ) : (
          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => {
              sendToVote(current);
              onClose();
            }}
          >
            <Send className="h-4 w-4" /> Propose for tonight
          </Button>
        )}

        <Button
          variant="secondary"
          block
          onClick={async () => {
            setCardNote('Making the picture…');
            try {
              const r = await shareRecipeCard(effective, { photo: photo || undefined, credit });
              setCardNote(r === 'copied' ? 'Picture copied. Paste it into a message.' : r === 'downloaded' ? 'Picture saved to your downloads.' : null);
            } catch {
              setCardNote('Couldn’t make the picture. Try again.');
            }
          }}
        >
          <ImageDown className="h-4 w-4" /> Share recipe card
        </Button>
        {cardNote && (
          <p role="status" className="text-center text-[13px] text-ink-2">
            {cardNote}
          </p>
        )}

        {inRotation && (
          <>
            <div className="flex items-center gap-1 pt-1">
              <Button
                variant="quiet"
                size="sm"
                onClick={() => {
                  setActiveMealResult(current);
                  setActiveView(0);
                  onClose();
                }}
              >
                <Dices className="h-4 w-4" /> Put on the reel
              </Button>
              {!photo && (
                <IconButton
                  label={current.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                  active={current.isFavorite}
                  onClick={() => toggleFavoriteMeal(current.id)}
                >
                  <Heart className={cx('h-4 w-4', current.isFavorite && 'fill-current')} />
                </IconButton>
              )}
              {!confirmReject ? (
                <Button variant="quiet" size="sm" className="ml-auto text-ink-3 hover:text-tomato" onClick={() => setConfirmReject(true)}>
                  <ThumbsDown className="h-4 w-4" /> Not for us
                </Button>
              ) : null}
            </div>
            {confirmReject && (
              <div className="fade-up rounded-2xl border border-tomato/25 bg-tomato-soft p-3.5 text-[14px] text-tomato">
                <p>
                  {current.source === 'own'
                    ? 'Remove your recipe? We’ll swap in a similar dish from the World Kitchen.'
                    : 'Never suggest this again? We’ll swap in a similar dish from the World Kitchen.'}
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setConfirmReject(false)}>
                    Keep it
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const replacement = rejectMeal(current.id);
                      onReplaced?.(current, replacement);
                      onClose();
                    }}
                  >
                    Remove and replace
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
};
