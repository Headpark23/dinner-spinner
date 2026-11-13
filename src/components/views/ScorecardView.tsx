import React, { useState } from 'react';
import { useDinner } from '../../context/DinnerContext';
import { Star, Snowflake } from 'lucide-react';
import { Button, Card, FreshDot, Select, cx, cuisineColor } from '../ui';

const TAKEAWAY_COST_GBP = 24; // assumed average household takeaway, used only for the savings estimate

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const ScorecardView: React.FC = () => {
  const {
    meals,
    rateMeal,
    isCoolingOff,
    getCoolingOffDays,
    pantry,
    householdMembers,
    voteLogs,
    rescuedItemsCount,
    setClearoutActive,
    setActiveView,
    setActiveMealResult,
    cookLog,
    takeawayLog,
  } = useDinner();

  // --- This week, from the real logs ---
  const cookedDays = new Set(cookLog.map((c) => dayKey(new Date(c.date))));
  const takeawayDays = new Set(takeawayLog.map((t) => dayKey(new Date(t.date))));
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const key = dayKey(d);
    return {
      key,
      label: d.toLocaleDateString('en-GB', { weekday: 'short' }),
      isToday: i === 6,
      cooked: cookedDays.has(key),
      takeaway: takeawayDays.has(key),
    };
  });
  let streak = 0;
  for (let i = 0; i < 60; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    if (cookedDays.has(dayKey(d))) streak++;
    else if (i > 0) break; // today not cooked yet doesn't break the streak
  }
  const homeThisWeek = week.filter((d) => d.cooked).length;

  // --- Rating ---
  const recentCookedIds = Array.from(new Set(cookLog.map((c) => c.mealId))).filter((id) =>
    meals.some((m) => m.id === id)
  );
  const [ratingMealId, setRatingMealId] = useState<string>(recentCookedIds[0] || meals[0]?.id || '');
  const [hoverStar, setHoverStar] = useState<number | null>(null);
  const ratingMeal = meals.find((m) => m.id === ratingMealId) || meals[0];

  // --- All-time from the recipe book ---
  const topMeals = [...meals].sort((a, b) => b.cookCount - a.cookCount).slice(0, 5);
  const maxCooks = Math.max(1, ...topMeals.map((m) => m.cookCount));

  const cuisineCounts: Record<string, number> = {};
  meals.forEach((m) => {
    cuisineCounts[m.cuisine] = (cuisineCounts[m.cuisine] || 0) + m.cookCount;
  });
  const cuisines = Object.entries(cuisineCounts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const cuisineTotal = cuisines.reduce((s, [, n]) => s + n, 0) || 1;

  const green = pantry.filter((p) => p.freshness === 'green').length;
  const amber = pantry.filter((p) => p.freshness === 'amber').length;
  const red = pantry.filter((p) => p.freshness === 'red').length;
  const pantryTotal = Math.max(1, pantry.length);

  const memberStats = householdMembers.map((m) => ({
    ...m,
    yes: voteLogs.filter((l) => l.memberId === m.id && l.decision === 'yes').length,
    no: voteLogs.filter((l) => l.memberId === m.id && l.decision === 'no').length,
  }));

  const coolingMeals = meals.filter((m) => isCoolingOff(m));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold">Your kitchen</h1>
        <p className="mt-1 text-[14px] text-ink-2">
          {cookLog.length === 0
            ? 'Log dinners from Tonight and this page fills in with your real week.'
            : `Built from ${cookLog.length} logged ${cookLog.length === 1 ? 'dinner' : 'dinners'}.`}
        </p>
      </div>

      {/* This week */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">The last seven days</h2>
          <span className="text-[13px] text-ink-2">
            {homeThisWeek} home-cooked{streak > 1 ? ` · ${streak}-night streak` : ''}
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-7 gap-1 text-center">
          {week.map((d) => (
            <li key={d.key} className="flex flex-col items-center gap-1.5">
              <span
                className={cx(
                  'flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-semibold',
                  d.cooked && 'bg-sage text-white',
                  !d.cooked && d.takeaway && 'border-2 border-tomato text-tomato',
                  !d.cooked && !d.takeaway && 'border border-dashed border-line-strong'
                )}
                aria-label={`${d.label}: ${d.cooked ? 'cooked at home' : d.takeaway ? 'takeaway' : 'nothing logged'}`}
              >
                {d.cooked ? '✓' : d.takeaway ? 'T' : ''}
              </span>
              <span className={cx('text-[12px]', d.isToday ? 'font-semibold text-ink' : 'text-ink-3')}>
                {d.isToday ? 'Today' : d.label}
              </span>
            </li>
          ))}
        </ol>
        <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4">
          <div>
            <dt className="text-[12px] text-ink-2">Home dinners</dt>
            <dd className="font-display text-[24px] font-semibold tabular-nums">{cookLog.length}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-2">Takeaways</dt>
            <dd className="font-display text-[24px] font-semibold tabular-nums">{takeawayLog.length}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-ink-2">Items used up</dt>
            <dd className="font-display text-[24px] font-semibold tabular-nums">{rescuedItemsCount}</dd>
          </div>
        </dl>
        {cookLog.length > 0 && (
          <p className="mt-2 text-[12px] text-ink-3">
            Roughly £{(cookLog.length * TAKEAWAY_COST_GBP).toLocaleString('en-GB')} kept in your pocket, if each
            home dinner replaced a £{TAKEAWAY_COST_GBP} takeaway.
          </p>
        )}
      </Card>

      {/* Rate */}
      {ratingMeal && (
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold">How was it?</h2>
          <p className="text-[13px] text-ink-2">Five-star dishes get a little celebration when they land.</p>
          <Select
            aria-label="Dish to rate"
            value={ratingMeal.id}
            onChange={(e) => setRatingMealId(e.target.value)}
            className="mt-3 w-full"
          >
            {recentCookedIds.length > 0 && (
              <optgroup label="Recently cooked">
                {recentCookedIds.map((id) => {
                  const m = meals.find((x) => x.id === id)!;
                  return (
                    <option key={id} value={id}>
                      {m.title}
                    </option>
                  );
                })}
              </optgroup>
            )}
            <optgroup label="All recipes">
              {meals.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.title}
                </option>
              ))}
            </optgroup>
          </Select>
          <div className="mt-3 flex items-center gap-1" role="radiogroup" aria-label={`Rate ${ratingMeal.title}`}>
            {[1, 2, 3, 4, 5].map((s) => {
              const filled = hoverStar !== null ? s <= hoverStar : s <= ratingMeal.rating;
              return (
                <button
                  key={s}
                  role="radio"
                  aria-checked={ratingMeal.rating === s}
                  aria-label={`${s} star${s > 1 ? 's' : ''}`}
                  onMouseEnter={() => setHoverStar(s)}
                  onMouseLeave={() => setHoverStar(null)}
                  onClick={() => rateMeal(ratingMeal.id, s)}
                  className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-sunk"
                >
                  <Star
                    className={cx('h-7 w-7 transition-colors', filled ? 'fill-saffron text-saffron' : 'text-line-strong')}
                    strokeWidth={1.5}
                  />
                </button>
              );
            })}
            <span className="ml-2 text-[13px] text-ink-2 tabular-nums">cooked {ratingMeal.cookCount}×</span>
          </div>
        </Card>
      )}

      {/* Most cooked */}
      <section aria-labelledby="most-cooked">
        <h2 id="most-cooked" className="mb-2 px-1 text-[15px] font-semibold">
          Most cooked, all time
        </h2>
        <Card as="div" className="p-1">
          <ol className="divide-y divide-line">
            {topMeals.map((meal, idx) => (
              <li key={meal.id}>
                <button
                  onClick={() => {
                    setActiveMealResult(meal);
                    setActiveView(0);
                  }}
                  className="group w-full rounded-xl px-3 py-2.5 text-left hover:bg-sunk"
                  title="Put it on the reel"
                >
                  <div className="flex items-baseline gap-2 text-[14px]">
                    <span className="w-4 shrink-0 text-ink-3 tabular-nums">{idx + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium group-hover:underline">{meal.title}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{meal.cookCount}</span>
                  </div>
                  <div className="mt-1.5 ml-6 h-1.5 overflow-hidden rounded-full bg-sunk">
                    <div className="h-full rounded-full bg-ink/70" style={{ width: `${(meal.cookCount / maxCooks) * 100}%` }} />
                  </div>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </section>

      {/* Cuisine mix */}
      {cuisines.length > 0 && (
        <section aria-labelledby="cuisine-mix">
          <h2 id="cuisine-mix" className="mb-2 px-1 text-[15px] font-semibold">
            Cuisine mix
          </h2>
          <Card className="p-4">
            <div className="flex h-3 overflow-hidden rounded-full" aria-hidden="true">
              {cuisines.map(([c, n]) => (
                <span key={c} style={{ width: `${(n / cuisineTotal) * 100}%`, background: cuisineColor(c) }} />
              ))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
              {cuisines.map(([c, n]) => (
                <li key={c} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cuisineColor(c) }} />
                    {c}
                  </span>
                  <span className="text-ink-2 tabular-nums">{Math.round((n / cuisineTotal) * 100)}%</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {/* Fridge */}
      <section aria-labelledby="fridge-health">
        <h2 id="fridge-health" className="mb-2 px-1 text-[15px] font-semibold">
          Fridge right now
        </h2>
        <Card className="p-4">
          <div className="flex h-3 overflow-hidden rounded-full bg-sunk" aria-hidden="true">
            <span className="bg-tomato" style={{ width: `${(red / pantryTotal) * 100}%` }} />
            <span className="bg-saffron" style={{ width: `${(amber / pantryTotal) * 100}%` }} />
            <span className="bg-sage" style={{ width: `${(green / pantryTotal) * 100}%` }} />
          </div>
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px]">
            <li className="flex items-center gap-1.5">
              <FreshDot level="red" /> {red} use next
            </li>
            <li className="flex items-center gap-1.5">
              <FreshDot level="amber" /> {amber} eat soon
            </li>
            <li className="flex items-center gap-1.5">
              <FreshDot level="green" /> {green} fresh
            </li>
          </ul>
          {red > 0 && (
            <Button
              variant="secondary"
              block
              className="mt-4"
              onClick={() => {
                setClearoutActive(true);
                setActiveView(0);
              }}
            >
              Spin for something that uses them up
            </Button>
          )}
        </Card>
      </section>

      {/* Household */}
      <section aria-labelledby="household-votes">
        <h2 id="household-votes" className="mb-2 px-1 text-[15px] font-semibold">
          Household votes
        </h2>
        <Card className="p-1">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-[12px] text-ink-3">
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 text-right font-medium">Yes</th>
                <th className="px-3 py-2 text-right font-medium">Vetoes</th>
                <th className="px-3 py-2 text-right font-medium">Left</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {memberStats.map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-2">{m.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.yes}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.no}</td>
                  <td className={cx('px-3 py-2 text-right tabular-nums', m.vetoTokensRemaining === 0 && 'text-tomato')}>
                    {m.vetoTokensRemaining}/3
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      {/* Cooling off */}
      <section aria-labelledby="resting">
        <h2 id="resting" className="mb-1 px-1 text-[15px] font-semibold">
          Resting for a few days
        </h2>
        <p className="mb-2 px-1 text-[13px] text-ink-2">
          Anything cooked in the last four days is much less likely to land, so the week stays varied. A nudge
          can still bring it back.
        </p>
        {coolingMeals.length === 0 ? (
          <p className="px-1 text-[13px] text-ink-3">Nothing is resting right now.</p>
        ) : (
          <ul className="space-y-1.5">
            {coolingMeals.map((meal) => {
              const d = getCoolingOffDays(meal);
              return (
                <li key={meal.id} className="flex items-center justify-between gap-2 rounded-xl bg-sunk px-3 py-2 text-[14px]">
                  <span className="truncate">{meal.title}</span>
                  <span className="flex shrink-0 items-center gap-1 text-[12px] text-ink-2">
                    <Snowflake className="h-3.5 w-3.5" />
                    {d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
