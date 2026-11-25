import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Refrigerator, RefreshCw, Send, ShoppingBasket, Snowflake } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import type { Meal } from '../types';
import { kitchenRecipeMatches } from '../utils/cupboard';
import { resolveMealPhoto } from '../data/photos';
import { RecipeSheet } from './RecipeSheet';
import { Button, Chip, Notice, Sheet, effortLabel, timeLabel } from './ui';

const PAGE = 4;

/** "Cook from our recipes": 3–4 saved recipes that use the most of what's already in the kitchen. */
export const KitchenRecipesSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { meals, pantry, inStock, freezer, restrictions, sendToVote, addShoppingItems, setActiveView } = useDinner();
  const [page, setPage] = useState(0);
  const [recipe, setRecipe] = useState<Meal | null>(null);
  const [listed, setListed] = useState<Record<string, boolean>>({});

  const matches = useMemo(
    () =>
      isOpen
        ? kitchenRecipeMatches({ meals, pantry, staples: inStock, freezer, banned: restrictions.avoid, diets: restrictions.diets })
        : [],
    [isOpen, meals, pantry, inStock, freezer, restrictions]
  );

  useEffect(() => {
    if (isOpen) {
      setPage(0);
      setListed({});
    }
  }, [isOpen]);

  const pages = Math.max(1, Math.ceil(matches.length / PAGE));
  const shown = matches.slice(page * PAGE, page * PAGE + PAGE);
  const kitchenEmpty = pantry.length === 0 && inStock.length === 0 && !freezer.some((f) => !f.usedDate && f.portions > 0);

  const goTo = (view: number) => {
    onClose();
    setActiveView(view);
  };

  return (
    <>
      <Sheet
        isOpen={isOpen && !recipe}
        onClose={onClose}
        title="Cook from our recipes"
        subtitle="Your saved recipes that use the most of what’s already in the kitchen."
        labelledBy="kitchen-recipes-title"
        tall
      >
        {meals.length === 0 ? (
          <div className="space-y-3">
            <Notice tone="neutral">You haven’t saved any recipes yet. Add a few and they’ll show up here.</Notice>
            <Button variant="primary" block onClick={() => goTo(5)}>
              <BookOpen className="h-4 w-4" /> Go to our recipes
            </Button>
          </div>
        ) : kitchenEmpty ? (
          <div className="space-y-3">
            <Notice tone="neutral">The kitchen is empty. Add what’s in the fridge and cupboard to see matching recipes.</Notice>
            <Button variant="primary" block onClick={() => goTo(2)}>
              <Refrigerator className="h-4 w-4" /> Go to the kitchen
            </Button>
          </div>
        ) : matches.length === 0 ? (
          <Notice tone="tomato">
            None of your saved recipes use what’s in the kitchen right now. Try AI Chef for ideas built from your stock.
          </Notice>
        ) : (
          <div className="space-y-3.5">
            {shown.map((m) => {
              const photo = resolveMealPhoto(m.meal);
              const total = m.uses.length + m.missing.length;
              return (
                <article key={m.meal.id} className="editorial-card fade-up overflow-hidden rounded-[22px] border border-line bg-card">
                  <button type="button" onClick={() => setRecipe(m.meal)} className="relative block aspect-[16/8] w-full overflow-hidden bg-sunk text-left">
                    <img
                      src={photo.url}
                      alt=""
                      onError={(e) => {
                        if (!e.currentTarget.src.endsWith(photo.fallbackUrl)) e.currentTarget.src = photo.fallbackUrl;
                      }}
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/15 to-transparent" />
                    {m.frozenPortions ? (
                      <span className="absolute top-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-sky-600 px-2.5 py-0.5 text-[11.5px] font-bold text-white shadow-xs">
                        <Snowflake className="h-3 w-3" /> Ready in the freezer · {m.frozenPortions}{' '}
                        {m.frozenPortions === 1 ? 'portion' : 'portions'}
                      </span>
                    ) : (
                      <span className="absolute top-2.5 left-3 rounded-full bg-sage px-2.5 py-0.5 text-[11.5px] font-bold text-white shadow-xs">
                        {m.missing.length === 0 ? 'Everything’s in' : `Uses ${m.uses.length} of ${total} from the kitchen`}
                      </span>
                    )}
                    <div className="absolute right-3 bottom-3 left-3 text-white">
                      <h3 className="font-display text-[20px] leading-[1.15] font-semibold drop-shadow-xs">{m.meal.title}</h3>
                      <p className="mt-0.5 text-[12px] text-white/85">
                        {timeLabel(m.meal.timeStake)} · {effortLabel(m.meal.effort)} · {m.meal.cuisine}
                        {m.coolingOff ? ' · had it lately' : ''}
                      </p>
                    </div>
                  </button>

                  <div className="space-y-2.5 p-3.5">
                    {m.frozenPortions ? (
                      <p className="text-[13px] text-ink-2">Already cooked and frozen. Just defrost and heat it through.</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {m.uses.slice(0, 8).map((u) =>
                          m.fromFreezer.includes(u) ? (
                            <span
                              key={u}
                              className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2.5 py-0.5 text-[12.5px] font-medium text-sky-700 ring-1 ring-sky-500/25 dark:text-sky-300"
                            >
                              <Snowflake className="h-3 w-3" /> {u}
                            </span>
                          ) : (
                            <Chip key={u} tone={m.rescues.some((r) => r.toLowerCase().includes(u.toLowerCase()) || u.toLowerCase().includes(r.toLowerCase())) ? 'tomato' : 'sage'}>
                              {u}
                            </Chip>
                          )
                        )}
                        {m.uses.length > 8 && <Chip tone="neutral">+{m.uses.length - 8} more</Chip>}
                      </div>
                    )}
                    {m.rescues.length > 0 && (
                      <p className="text-[12px] text-tomato">Uses up {m.rescues.join(', ')} before it goes off.</p>
                    )}
                    {m.missing.length > 0 && (
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 text-[13px] text-ink-2">
                          <span className="font-semibold text-ink">Need: </span>
                          {m.missing.join(', ')}
                        </p>
                        <button
                          type="button"
                          disabled={!!listed[m.meal.id]}
                          onClick={() => {
                            addShoppingItems(m.missing, m.meal.title);
                            setListed((p) => ({ ...p, [m.meal.id]: true }));
                          }}
                          className="inline-flex shrink-0 items-center gap-1 text-[13px] font-semibold text-tomato hover:underline disabled:text-sage disabled:no-underline"
                        >
                          {listed[m.meal.id] ? (
                            <>
                              <Check className="h-4 w-4" /> On the list
                            </>
                          ) : (
                            <>
                              <ShoppingBasket className="h-4 w-4" /> Add to list
                            </>
                          )}
                        </button>
                      </div>
                    )}
                    <div className="grid grid-cols-[auto_1fr] gap-2 pt-0.5">
                      <Button variant="secondary" size="sm" onClick={() => setRecipe(m.meal)}>
                        <BookOpen className="h-4 w-4" /> Method
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          sendToVote(m.meal);
                          onClose();
                        }}
                      >
                        <Send className="h-4 w-4" /> Put to the vote
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}

            {pages > 1 && (
              <Button variant="secondary" block onClick={() => setPage((p) => (p + 1) % pages)}>
                <RefreshCw className="h-4 w-4" /> {page + 1 < pages ? 'Show other recipes' : 'Back to the best matches'}
              </Button>
            )}
          </div>
        )}
      </Sheet>
      {recipe && <RecipeSheet meal={recipe} onClose={() => setRecipe(null)} />}
    </>
  );
};
