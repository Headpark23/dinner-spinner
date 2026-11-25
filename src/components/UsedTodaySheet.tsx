import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Package,
  Plus,
  Refrigerator,
  Search,
  ShoppingBasket,
  Snowflake,
  Trash2,
  Utensils,
} from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import type { Meal, MealSlot, UsedStockItem } from '../types';
import {
  MEAL_SLOTS,
  defaultSlotForHour,
  matchKitchenStockForItems,
  slotLabel,
  todayDayKey,
} from '../utils/dailyLog';
import { itemIcon } from '../utils/itemIcon';
import { Button, Card, Chip, FreshDot, IconButton, Notice, Segmented, Sheet, TextInput, cx } from './ui';

type LogMode = 'meal' | 'ingredients';

export interface UsedTodayInitialMeal {
  title: string;
  mealId?: string;
  cuisine?: string;
  ingredients: string[];
  slot?: MealSlot;
}

export const UsedTodaySheet: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  initialMeal?: UsedTodayInitialMeal | null;
}> = ({ isOpen, onClose, initialMeal }) => {
  const {
    pantry,
    cupboard,
    freezer,
    meals,
    dailyLog,
    logDailyEntry,
    deleteDailyEntry,
    restockSuggestions,
    addShoppingItems,
  } = useDinner();

  const [slot, setSlot] = useState<MealSlot>(() => initialMeal?.slot || defaultSlotForHour(new Date().getHours()));
  const [mode, setMode] = useState<LogMode>('meal');
  const [mealQuery, setMealQuery] = useState(() => initialMeal?.title || '');
  const [pickedMeal, setPickedMeal] = useState<Meal | null>(null);
  const [stockSearch, setStockSearch] = useState('');
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [cupboardRemove, setCupboardRemove] = useState<Record<string, boolean>>({});
  const [addUsedToShop, setAddUsedToShop] = useState(true);
  const [note, setNote] = useState('');
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const activeIngredients = useMemo(() => {
    if (initialMeal && mealQuery === initialMeal.title) return initialMeal.ingredients;
    if (pickedMeal) return pickedMeal.ingredients;
    const words = mealQuery
      .split(/[,&+/]|\band\b|\bwith\b/i)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3);
    return words;
  }, [initialMeal, pickedMeal, mealQuery]);

  const autoMatches = useMemo(
    () =>
      mode === 'meal'
        ? matchKitchenStockForItems({
            ingredients: activeIngredients,
            pantry,
            cupboard,
            freezer,
          })
        : [],
    [mode, activeIngredients, pantry, cupboard, freezer]
  );

  // Build unified selectable stock list
  const allStock = useMemo(() => {
    const q = stockSearch.trim().toLowerCase();
    const fridgeList = pantry
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .map((p) => ({
        key: `fridge:${p.id}`,
        id: p.id,
        name: p.name,
        source: 'fridge' as const,
        detail: p.quantity || p.category,
        freshness: p.freshness,
      }));
    const cupboardList = cupboard
      .filter((c) => !c.low && (!q || c.name.toLowerCase().includes(q) || c.shelf.toLowerCase().includes(q)))
      .map((c) => ({
        key: `cupboard:${c.id}`,
        id: c.id,
        name: c.name,
        source: 'cupboard' as const,
        detail: c.quantity || c.shelf,
        freshness: undefined,
      }));
    const freezerList = freezer
      .filter((f) => f.portions > 0 && (!q || f.name.toLowerCase().includes(q)))
      .map((f) => ({
        key: `freezer:${f.id}`,
        id: f.id,
        name: f.name,
        source: 'freezer' as const,
        detail: `${f.portions} ${f.portions === 1 ? 'portion' : 'portions'} left`,
        freshness: undefined,
      }));
    return { fridgeList, cupboardList, freezerList };
  }, [pantry, cupboard, freezer, stockSearch]);

  const isSelected = (key: string): boolean => {
    if (key in selectedKeys) return selectedKeys[key];
    return mode === 'meal' && autoMatches.some((m) => `${m.source}:${m.id}` === key);
  };

  const toggleKey = (key: string) => {
    setSelectedKeys((prev) => ({ ...prev, [key]: !isSelected(key) }));
  };

  const chosenItems: UsedStockItem[] = useMemo(() => {
    const out: UsedStockItem[] = [];
    for (const item of allStock.fridgeList) {
      if (isSelected(item.key)) {
        out.push({
          name: item.name,
          source: 'fridge',
          sourceId: item.id,
          action: 'removed',
          addedToShop: addUsedToShop,
        });
      }
    }
    for (const item of allStock.cupboardList) {
      if (isSelected(item.key)) {
        out.push({
          name: item.name,
          source: 'cupboard',
          sourceId: item.id,
          action: cupboardRemove[item.key] ? 'removed' : 'marked-low',
          addedToShop: addUsedToShop,
        });
      }
    }
    for (const item of allStock.freezerList) {
      if (isSelected(item.key)) {
        out.push({
          name: item.name,
          source: 'freezer',
          sourceId: item.id,
          action: 'portion-used',
          addedToShop: addUsedToShop,
        });
      }
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allStock, selectedKeys, autoMatches, mode, cupboardRemove, addUsedToShop]);

  const matchingRecipes = useMemo(() => {
    const q = mealQuery.trim().toLowerCase();
    if (!q || (pickedMeal && pickedMeal.title.toLowerCase() === q)) return [];
    return meals
      .filter((m) => m.title.toLowerCase().includes(q) || m.cuisine.toLowerCase().includes(q))
      .slice(0, 5);
  }, [meals, mealQuery, pickedMeal]);

  const today = todayDayKey();
  const todayEntries = useMemo(
    () => dailyLog.filter((e) => e.day === today),
    [dailyLog, today]
  );

  const canSubmit = mode === 'meal' ? mealQuery.trim().length > 0 : chosenItems.length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const title =
      mode === 'meal'
        ? mealQuery.trim()
        : chosenItems.length === 1
          ? `Used ${chosenItems[0].name}`
          : `Used ${chosenItems.length} ingredients`;

    logDailyEntry({
      slot,
      kind: mode,
      title,
      mealId: pickedMeal?.id || initialMeal?.mealId,
      cuisine: pickedMeal?.cuisine || initialMeal?.cuisine,
      usedItems: chosenItems,
      note,
    });

    const deducted = chosenItems.length;
    setSavedMsg(
      deducted > 0
        ? `Logged ${slotLabel(slot).toLowerCase()} and updated ${deducted} ${deducted === 1 ? 'item' : 'items'}${addUsedToShop ? ' (queued to restock)' : ''}.`
        : `Logged ${slotLabel(slot).toLowerCase()}: “${title}”.`
    );
    setMealQuery('');
    setPickedMeal(null);
    setSelectedKeys({});
    setNote('');
  };

  const renderStockGroup = (
    title: string,
    icon: React.ReactNode,
    items: { key: string; id: string; name: string; source: 'fridge' | 'cupboard' | 'freezer'; detail?: string; freshness?: 'green' | 'amber' | 'red' }[],
    actionHint: string
  ) => {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between px-1">
          <p className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-3">
            {icon} {title}
          </p>
          <span className="text-[11.5px] text-ink-3">{actionHint}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => {
            const checked = isSelected(item.key);
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => toggleKey(item.key)}
                className={cx(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors',
                  checked
                    ? 'border-tomato bg-tomato-soft text-tomato font-semibold'
                    : 'border-line bg-card text-ink hover:border-line-strong'
                )}
              >
                <span aria-hidden="true" className="text-[14px] leading-none">
                  {checked ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : itemIcon(item.name)}
                </span>
                <span>{item.name}</span>
                {item.freshness === 'red' && !checked && <FreshDot level="red" />}
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="What was used today?"
      subtitle="Log breakfast, lunch, dinner or individual ingredients. Deducts stock and tracks what to restock."
      labelledBy="used-today-title"
      tall
    >
      <div className="space-y-5">
        {savedMsg && (
          <Notice tone="sage" icon={<CheckCircle2 className="h-4 w-4" />} onDismiss={() => setSavedMsg(null)}>
            {savedMsg}
          </Notice>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Slot selector */}
          <div className="space-y-1.5">
            <p className="px-1 text-[12.5px] font-semibold text-ink-2">When</p>
            <Segmented<MealSlot>
              label="Meal slot"
              size="sm"
              value={slot}
              onChange={setSlot}
              options={MEAL_SLOTS.map((s) => ({ value: s.id, label: s.short }))}
            />
          </div>

          {/* Mode toggle: Meal vs Just Ingredients */}
          <Segmented<LogMode>
            label="What to log"
            size="sm"
            value={mode}
            onChange={(m) => {
              setMode(m);
              setSelectedKeys({});
            }}
            options={[
              { value: 'meal', label: 'Log a meal' },
              { value: 'ingredients', label: 'Just ingredients' },
            ]}
          />

          {mode === 'meal' && (
            <div className="space-y-2">
              <TextInput
                value={mealQuery}
                onChange={(e) => {
                  setMealQuery(e.target.value);
                  if (pickedMeal && e.target.value !== pickedMeal.title) setPickedMeal(null);
                }}
                placeholder={
                  slot === 'breakfast'
                    ? 'e.g. Scrambled eggs on toast, porridge…'
                    : slot === 'lunch'
                      ? 'e.g. Chicken wrap, tomato soup…'
                      : 'Search your recipes or type what you had'
                }
                aria-label="Meal name"
              />
              {matchingRecipes.length > 0 && (
                <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
                  {matchingRecipes.map((m) => (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setPickedMeal(m);
                          setMealQuery(m.title);
                          setSelectedKeys({});
                        }}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[13.5px] hover:bg-sunk"
                      >
                        <span className="truncate font-medium">{m.title}</span>
                        <span className="shrink-0 text-[12px] text-ink-3">{m.cuisine}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {autoMatches.length > 0 && (
                <p className="px-1 text-[12px] text-sage">
                  Matched {autoMatches.length} {autoMatches.length === 1 ? 'item' : 'items'} in your kitchen — untick any you still have plenty of.
                </p>
              )}
            </div>
          )}

          {/* Kitchen stock picker */}
          <Card className="space-y-3.5 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13.5px] font-semibold">
                {mode === 'meal' ? 'Remove from stock (optional)' : 'Tap what was used up'}
              </p>
              {chosenItems.length > 0 && (
                <Chip tone="tomato">{chosenItems.length} selected</Chip>
              )}
            </div>

            {(pantry.length + cupboard.length + freezer.length) > 8 && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-3" />
                <TextInput
                  type="search"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                  placeholder="Filter fridge, cupboard & freezer…"
                  aria-label="Filter kitchen stock"
                  className="pl-9"
                />
              </div>
            )}

            {pantry.length === 0 && cupboard.filter((c) => !c.low).length === 0 && freezer.filter((f) => f.portions > 0).length === 0 ? (
              <p className="text-[13px] text-ink-2">
                Nothing logged in your fridge, cupboard or freezer yet. You can still log the meal to track what you eat.
              </p>
            ) : (
              <div className="space-y-3.5">
                {renderStockGroup('Fridge', <Refrigerator className="h-3.5 w-3.5" />, allStock.fridgeList, 'Removes item')}
                {renderStockGroup('Cupboard', <Package className="h-3.5 w-3.5" />, allStock.cupboardList, 'Marks running low')}
                {renderStockGroup('Freezer', <Snowflake className="h-3.5 w-3.5" />, allStock.freezerList, '-1 portion')}
              </div>
            )}

            {chosenItems.some((c) => c.source === 'cupboard') && (
              <div className="space-y-1 border-t border-line pt-2.5">
                <p className="text-[11.5px] font-medium text-ink-3">Cupboard items selected:</p>
                <div className="flex flex-wrap gap-1.5">
                  {chosenItems
                    .filter((c) => c.source === 'cupboard' && c.sourceId)
                    .map((c) => {
                      const key = `cupboard:${c.sourceId}`;
                      const rem = !!cupboardRemove[key];
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setCupboardRemove((prev) => ({ ...prev, [key]: !rem }))}
                          className="rounded-lg border border-line bg-sunk/70 px-2.5 py-1 text-[11.5px] font-medium text-ink-2 hover:text-ink"
                        >
                          {c.name}: <strong className="text-ink">{rem ? 'Remove completely' : 'Mark running low'}</strong>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}

            {chosenItems.length > 0 && (
              <label className="flex cursor-pointer items-center gap-2.5 border-t border-line pt-2.5 text-[13px] font-medium text-ink">
                <input
                  type="checkbox"
                  checked={addUsedToShop}
                  onChange={(e) => setAddUsedToShop(e.target.checked)}
                  className="h-4 w-4 accent-tomato"
                />
                <span>Add used-up items to shopping list to restock</span>
              </label>
            )}
          </Card>

          <TextInput
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note (e.g. packed lunch, finished the last tin)"
            aria-label="Optional note"
          />

          <Button type="submit" variant="primary" size="lg" block disabled={!canSubmit}>
            <Utensils className="h-4 w-4" />
            {chosenItems.length > 0
              ? `Log ${slotLabel(slot).toLowerCase()} & update ${chosenItems.length} ${chosenItems.length === 1 ? 'item' : 'items'}`
              : `Log ${slotLabel(slot).toLowerCase()}`}
          </Button>
        </form>

        {/* Today's log */}
        <section className="space-y-2 border-t border-line pt-4" aria-labelledby="today-log-h">
          <div className="flex items-baseline justify-between px-1">
            <h3 id="today-log-h" className="font-display text-[17px] font-semibold">
              Logged today
            </h3>
            <span className="text-[12px] text-ink-3 tabular-nums">
              {todayEntries.length} {todayEntries.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          {todayEntries.length === 0 ? (
            <p className="px-1 text-[13px] text-ink-2">Nothing logged yet today.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {todayEntries.map((entry) => (
                <li key={entry.id} className="flex items-start gap-2.5 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded-full bg-sunk px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                        {slotLabel(entry.slot)}
                      </span>
                      <span className="truncate text-[14px] font-semibold">{entry.title}</span>
                    </div>
                    {entry.usedItems.length > 0 && (
                      <p className="mt-1 text-[12px] text-ink-2">
                        Used: {entry.usedItems.map((u) => u.name).join(', ')}
                      </p>
                    )}
                    {entry.note && <p className="mt-0.5 text-[12px] text-ink-3">“{entry.note}”</p>}
                  </div>
                  <IconButton label={`Remove ${entry.title}`} onClick={() => deleteDailyEntry(entry.id)}>
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Restock radar */}
        {restockSuggestions.length > 0 && (
          <section className="space-y-2 border-t border-line pt-4" aria-labelledby="restock-radar-h">
            <div className="flex items-center justify-between px-1">
              <h3 id="restock-radar-h" className="font-display text-[17px] font-semibold">
                Needs restocking
              </h3>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => addShoppingItems(restockSuggestions.map((r) => r.name), 'Restock')}
              >
                <ShoppingBasket className="h-3.5 w-3.5 text-tomato" /> Restock all ({restockSuggestions.length})
              </Button>
            </div>
            <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-card">
              {restockSuggestions.slice(0, 6).map((item) => (
                <li key={item.name} className="flex items-center justify-between gap-2 px-3.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-medium">{item.name}</p>
                    <p className="text-[11.5px] text-ink-3">
                      {item.reason}
                      {item.usedCount > 1 ? ` · used ${item.usedCount}× recently` : ''}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => addShoppingItems([item.name], 'Restock')}
                  >
                    <Plus className="h-3.5 w-3.5" /> Shop
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Sheet>
  );
};
