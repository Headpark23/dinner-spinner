import React, { useState } from 'react';
import { RefreshCw, ShoppingBasket, Wand2, X } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Notice, Select, Sheet, IconButton } from './ui';
import { THEMES, ThemeId, nextDays, suggestWeek, tidyPlan, weekShopping } from '../utils/planner';

/** Plan the next seven dinners, give nights a theme, and shop for all of it in one tap. */
export const PlannerSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const {
    meals,
    restrictions,
    costRule,
    weekPlan,
    weekThemes,
    setWeekTheme,
    setPlanDay,
    planWeek,
    clearWeekPlan,
    shopForWeek,
    pantry,
    staples,
    shoppingList,
    sendToVote,
  } = useDinner();
  const [note, setNote] = useState<string | null>(null);

  const today = new Date();
  const days = nextDays(today, 7);
  const plan = tidyPlan(weekPlan, today, meals);
  const planned = Object.keys(plan).length;
  const toBuy = weekShopping(plan, meals, pantry, staples, shoppingList.map((i) => i.name)).length;

  const fillDay = (day: string, avoidId?: string) => {
    const wd = new Date(day + 'T12:00:00').getDay();
    const themes = weekThemes[wd] ? { [day]: weekThemes[wd] as ThemeId } : {};
    for (let i = 0; i < 6; i++) {
      const next = suggestWeek(meals, { days: [day], plan, themes, diets: restrictions.diets, banned: restrictions.avoid, cost: costRule });
      const pick = next[day];
      if (!pick) return;
      if (pick.mealId === avoidId && i < 5 && meals.length > 1) continue;
      const meal = meals.find((m) => m.id === pick.mealId);
      if (meal) setPlanDay(day, meal);
      return;
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Plan the week"
      subtitle="Seven dinners and one shopping trip."
      labelledBy="planner-title"
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={planWeek}>
            <Wand2 className="h-4 w-4" /> Fill empty nights
          </Button>
          <Button variant="secondary" onClick={clearWeekPlan} disabled={planned === 0}>
            Clear plan
          </Button>
        </div>

        <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
          {days.map((day, i) => {
            const d = new Date(day + 'T12:00:00');
            const wd = d.getDay();
            const entry = plan[day];
            const meal = entry ? meals.find((m) => m.id === entry.mealId) : undefined;
            return (
              <li key={day} className="space-y-2 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-semibold">
                    {i === 0 ? 'Today' : d.toLocaleDateString('en-GB', { weekday: 'long' })}{' '}
                    <span className="font-normal text-ink-3">
                      {d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </span>
                  </span>
                  <Select
                    aria-label={`Theme for ${d.toLocaleDateString('en-GB', { weekday: 'long' })}s`}
                    value={weekThemes[wd] || 'any'}
                    onChange={(e) => setWeekTheme(wd, e.target.value as ThemeId)}
                    className="!h-11 max-w-[140px] !text-[14px]"
                  >
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </Select>
                </div>
                {entry ? (
                  <div className="flex items-center gap-1">
                    <span className="min-w-0 flex-1 truncate text-[15px]">{entry.title}</span>
                    {i === 0 && meal && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          sendToVote(meal);
                          onClose();
                        }}
                      >
                        Vote
                      </Button>
                    )}
                    <IconButton label={`Swap ${entry.title}`} onClick={() => fillDay(day, entry.mealId)}>
                      <RefreshCw className="h-4 w-4" />
                    </IconButton>
                    <IconButton label={`Remove ${entry.title} from ${d.toLocaleDateString('en-GB', { weekday: 'long' })}`} onClick={() => setPlanDay(day, null)}>
                      <X className="h-4 w-4" />
                    </IconButton>
                  </div>
                ) : (
                  <Button variant="quiet" size="sm" onClick={() => fillDay(day)}>
                    Suggest a dinner
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {note && <Notice tone="sage">{note}</Notice>}

        <Button
          variant="primary"
          block
          disabled={planned === 0}
          onClick={() => {
            const n = shopForWeek();
            setNote(n > 0 ? `Added ${n} item${n === 1 ? '' : 's'} to the shopping list.` : 'Nothing to add. You have it all, or it’s already on the list.');
          }}
        >
          <ShoppingBasket className="h-4 w-4" />
          {planned === 0 ? 'Add the week’s shopping' : `Add the week’s shopping (${toBuy} to buy)`}
        </Button>
        <p className="text-[12px] text-ink-3">
          Skips what’s in your fridge, vault or staples, and anything already on the list. Diets and dislikes are
          respected.
        </p>
      </div>
    </Sheet>
  );
};
