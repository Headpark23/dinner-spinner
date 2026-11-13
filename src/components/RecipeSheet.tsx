import React, { useMemo, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { Meal, MealTweaks } from '../types';
import { withTweaks } from '../utils/dinnerEngine';
import { photoFor, PHOTO_CREDITS } from '../data/photos';
import { Check, Plus, X, Send, Dices, Star, ThumbsDown, Heart, ShoppingBasket } from 'lucide-react';
import { Button, Chip, IconButton, Sheet, TextInput, cx, timeLabel, effortLabel } from './ui';

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
  } = useDinner();

  // Always show the freshest copy of the dish (tweaks/favourites update live).
  const current = meal ? meals.find((m) => m.id === meal.id) || meal : null;
  const inRotation = !!current && meals.some((m) => m.id === current.id);

  const [haveOverrides, setHaveOverrides] = useState<Record<string, boolean>>({});
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

  const toggleHave = (name: string) => {
    const nowHave = !has(name);
    setHaveOverrides((prev) => ({ ...prev, [name]: nowHave }));
    // The first tick starts the list: everything not ticked goes on it automatically.
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
  const credit = PHOTO_CREDITS[current.id];
  const reviews = cookLog
    .filter((c) => c.mealId === current.id)
    .flatMap((c) => (c.reviews || []).map((r) => ({ ...r, date: c.date })))
    .slice(0, 6);
  const steps = [...effective.prepSteps].sort((a, b) => stepMinutes(b) - stepMinutes(a));
  const ownSteps = new Set(tweaks.extraSteps.map((s) => s.text));

  return (
    <Sheet isOpen onClose={onClose} title={current.title} labelledBy="recipe-title">
      {photo && (
        <figure className="-mx-5 -mt-1 mb-4">
          <img src={photo} alt={current.title} className="aspect-[4/3] w-full object-cover" />
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

      <p className="text-[13px] text-ink-2">
        {[current.origin, current.cuisine].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ')} ·{' '}
        {timeLabel(current.timeStake)} · {effortLabel(current.effort)}
      </p>
      {current.rating > 0 && (
        <p className="mt-1 flex items-center gap-1 text-[13px] text-saffron">
          {[1, 2, 3, 4, 5].map((s) => (
            <Star key={s} className={cx('h-3.5 w-3.5', s <= current.rating ? 'fill-current' : 'opacity-30')} />
          ))}
          <span className="ml-1 text-ink-2">
            {reviews.length > 0 ? `from ${reviews.length} household ${reviews.length === 1 ? 'verdict' : 'verdicts'}` : ''}
          </span>
        </p>
      )}
      <p className="mt-2 text-[14px] leading-relaxed text-ink-2">{current.description}</p>

      {/* Ingredients you have / need */}
      <section className="mt-5" aria-labelledby="have-h">
        <div className="flex items-baseline justify-between">
          <h3 id="have-h" className="text-[15px] font-semibold">
            What do you have?
          </h3>
          <span className="text-[12px] text-ink-2">{missing.length} to buy</span>
        </div>
        <p className="text-[12px] text-ink-3">Tick what’s in the kitchen. Everything else goes on the shared shopping list.</p>
        <ul className="mt-2 divide-y divide-line rounded-xl border border-line bg-card">
          {effective.ingredients.map((ing) => {
            const have = has(ing);
            const mine = tweaks.extraIngredients.includes(ing);
            return (
              <li key={ing}>
                <button
                  role="checkbox"
                  aria-checked={have}
                  onClick={() => toggleHave(ing)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-[14px] hover:bg-sunk"
                >
                  <span
                    className={cx(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border',
                      have ? 'border-sage bg-sage text-white' : 'border-line-strong'
                    )}
                  >
                    {have && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <span className={cx('flex-1', have && 'text-ink-2')}>{ing}</span>
                  {mine && <Chip tone="neutral">yours</Chip>}
                  {!have && onList(ing) && (
                    <span className="flex items-center gap-1 text-[12px] font-semibold text-tomato">
                      <ShoppingBasket className="h-3.5 w-3.5" /> on list
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
            className="mt-2"
            onClick={() => {
              setListStarted(true);
              addShoppingItems(missing, current.title);
            }}
          >
            <ShoppingBasket className="h-4 w-4" /> Add {missing.length} to the shopping list
          </Button>
        )}
      </section>

      {/* Method */}
      <section className="mt-5" aria-labelledby="method-h">
        <h3 id="method-h" className="text-[15px] font-semibold">
          Method
        </h3>
        <ol className="mt-2 space-y-2">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3 text-[14px]">
              <span className="w-14 shrink-0 text-[12px] font-semibold text-ink-3 tabular-nums">
                {stepMinutes(step) === 0 ? 'serve' : `${stepMinutes(step)} min`}
              </span>
              <span className="flex-1">
                {stripTiming(step)}
                {ownSteps.has(stripTiming(step)) && <span className="ml-1.5 text-[12px] text-ink-3">(your step)</span>}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-1 text-[12px] text-ink-3">Times are minutes before you eat.</p>
      </section>

      {/* Tweaks */}
      {inRotation && (
        <section className="mt-5 rounded-xl bg-sunk p-3" aria-labelledby="tweak-h">
          <h3 id="tweak-h" className="text-[15px] font-semibold">
            Make it yours
          </h3>
          <p className="text-[12px] text-ink-2">Your additions sit on top of the recipe and show up in the timeline.</p>

          {(tweaks.extraIngredients.length > 0 || tweaks.extraSteps.length > 0) && (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tweaks.extraIngredients.map((ing) => (
                <li key={`i-${ing}`} className="inline-flex items-center gap-1 rounded-full bg-card py-1 pr-1 pl-3 text-[13px]">
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
                <li key={`s-${idx}`} className="inline-flex items-center gap-1 rounded-full bg-card py-1 pr-1 pl-3 text-[13px]">
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
            className="mt-2 w-full rounded-xl border border-line bg-card px-3 py-2 text-[14px] placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
          />
        </section>
      )}

      {/* Household verdicts */}
      {reviews.length > 0 && (
        <section className="mt-5" aria-labelledby="verdicts-h">
          <h3 id="verdicts-h" className="text-[15px] font-semibold">
            What the household said
          </h3>
          <ul className="mt-2 space-y-2">
            {reviews.map((r, i) => (
              <li key={i} className="text-[14px]">
                <span className="font-semibold">{r.memberName}</span>{' '}
                <span className="text-saffron" aria-label={`${r.stars} stars`}>
                  {'★'.repeat(r.stars)}
                </span>
                {r.comment && <span className="block text-ink-2">“{r.comment}”</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Actions */}
      <div className="mt-6 space-y-2 border-t border-line pt-4">
        {inRotation ? (
          <>
            <Button
              variant="primary"
              block
              onClick={() => {
                sendToVote(current);
                onClose();
              }}
            >
              <Send className="h-4 w-4" /> Propose for tonight
            </Button>
            <div className="flex items-center gap-1">
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
              <IconButton
                label={current.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
                active={current.isFavorite}
                onClick={() => toggleFavoriteMeal(current.id)}
              >
                <Heart className={cx('h-4 w-4', current.isFavorite && 'fill-current')} />
              </IconButton>
              {!confirmReject ? (
                <Button variant="quiet" size="sm" className="ml-auto" onClick={() => setConfirmReject(true)}>
                  <ThumbsDown className="h-4 w-4" /> Not for us
                </Button>
              ) : null}
            </div>
            {confirmReject && (
              <div className="fade-up rounded-xl bg-tomato-soft p-3 text-[14px] text-tomato">
                <p>
                  {current.source === 'own'
                    ? 'Remove your recipe? We’ll swap in a similar dish from the World Kitchen.'
                    : 'Never suggest this again? We’ll swap in a similar dish from the World Kitchen.'}
                </p>
                <div className="mt-2 flex gap-2">
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
        ) : current.source === 'world' ? (
          <Button variant="primary" block onClick={() => addFromLibrary(current.id)}>
            <Plus className="h-4 w-4" /> Add to our recipes
          </Button>
        ) : (
          <Button
            variant="primary"
            block
            onClick={() => {
              sendToVote(current);
              onClose();
            }}
          >
            <Send className="h-4 w-4" /> Propose for tonight
          </Button>
        )}
      </div>
    </Sheet>
  );
};
