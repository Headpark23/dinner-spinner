import React, { useMemo, useState } from 'react';
import { useDinner } from '../../context/DinnerContext';
import { Snowflake, Search, Utensils, Plus, ShoppingBasket } from 'lucide-react';
import { Button, Card, FreshDot, Sheet, TextInput, cx, cuisineColor } from '../ui';
import { DishRow, RateStars } from '../DishRows';
import { UsedTodaySheet } from '../UsedTodaySheet';
import { groupDailyLogByDay, slotLabel, topConsumedIngredients } from '../../utils/dailyLog';
import { cookingStreak, homeCookedThisWeek, milestones, statsFrom, dayKey } from '../../utils/milestones';

const TAKEAWAY_COST_GBP = 24; // assumed average household takeaway, used only for the savings estimate

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
    freezer,
    setClearoutActive,
    setActiveView,
    setActiveMealResult,
    cookLog,
    takeawayLog,
    sendToVote,
    dailyLog,
    restockSuggestions,
    addShoppingItems,
  } = useDinner();
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [openRow, setOpenRow] = useState<string | null>(null);
  const [rateAnotherOpen, setRateAnotherOpen] = useState(false);
  const [rateSearch, setRateSearch] = useState('');
  const [usedTodayOpen, setUsedTodayOpen] = useState(false);
  const dailyGroups = useMemo(() => groupDailyLogByDay(dailyLog, 10), [dailyLog]);
  const topUsed = useMemo(() => topConsumedIngredients(dailyLog, 8), [dailyLog]);
  const history = [
    ...cookLog.map((c) => ({ id: c.id, date: c.date, title: c.title, kind: 'cooked' as const, mealId: c.mealId })),
    ...takeawayLog.map((t) => ({ id: t.id, date: t.date, title: t.name, kind: 'takeaway' as const, mealId: '' })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const shownHistory = history.slice(0, 5);
  const monthOf = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

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
  const streak = cookingStreak(cookLog, today);
  const homeThisWeek = homeCookedThisWeek(cookLog, today);
  const { earned: earnedMilestones, next: nextMilestone } = milestones(
    statsFrom({ cookLog, takeawayLog, freezer, rescued: rescuedItemsCount, now: today })
  );

  // --- Rating ---
  const recentCookedIds = Array.from(new Set(cookLog.map((c) => c.mealId))).filter((id) =>
    meals.some((m) => m.id === id)
  );
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

  type HistoryItem = (typeof history)[number];
  const renderHistoryRow = (h: HistoryItem) => {
    const meal = h.kind === 'cooked' ? meals.find((m) => m.id === h.mealId) : undefined;
    const when = new Date(h.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return (
      <DishRow
        key={h.id}
        meal={meal}
        title={h.title}
        detail={h.kind === 'takeaway' ? `${when} · Takeaway` : `${when}${meal ? ' · ' + meal.cuisine : ''}`}
        rating={h.kind === 'takeaway' ? undefined : meal?.rating || 0}
        cuisine={h.kind === 'takeaway' ? 'Takeaway' : undefined}
        open={openRow === h.id}
        onToggle={() => setOpenRow(openRow === h.id ? null : h.id)}
      >
        {meal ? (
          <div className="space-y-2">
            <RateStars value={meal.rating} label={`Rate ${meal.title}`} onRate={(n) => rateMeal(meal.id, n)} />
            <Button variant="secondary" size="sm" onClick={() => sendToVote(meal)}>
              Cook again
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-ink-2">
            {h.kind === 'takeaway' ? 'A night off the cooking.' : 'This dish is no longer in your recipes.'}
          </p>
        )}
      </DishRow>
    );
  };

  const searchQ = rateSearch.trim().toLowerCase();
  const rateList = meals
    .filter((m) => !searchQ || m.title.toLowerCase().includes(searchQ) || m.cuisine.toLowerCase().includes(searchQ))
    .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Kitchen journal</p>
          <h1 className="mt-0.5 font-display text-[30px] leading-[1.08] font-semibold">History</h1>
          <p className="mt-1 text-[14px] text-ink-2">
            {cookLog.length === 0 && dailyLog.length === 0
              ? 'Log meals or ingredients used today and this page builds your real food journal.'
              : `${cookLog.length} ${cookLog.length === 1 ? 'dinner' : 'dinners'} cooked · ${dailyLog.length} daily ${dailyLog.length === 1 ? 'log' : 'logs'}.`}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setUsedTodayOpen(true)}>
          <Utensils className="h-3.5 w-3.5 text-tomato" /> Log today
        </Button>
      </div>

      {/* This week */}
      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-[18px] font-semibold">The last seven days</h2>
          <span className="text-[13px] font-medium text-sage">
            {homeThisWeek} home-cooked{streak > 1 ? ` · ${streak}-night streak` : ''}
          </span>
        </div>
        <ol className="mt-4 grid grid-cols-7 gap-1.5 text-center">
          {week.map((d) => (
            <li key={d.key} className="flex flex-col items-center gap-1.5">
              <span
                className={cx(
                  'flex h-10 w-10 items-center justify-center rounded-2xl text-[12px] font-bold transition-colors',
                  d.cooked && 'bg-sage text-white shadow-[0_3px_10px_-2px_rgba(51,98,68,0.45)]',
                  !d.cooked && d.takeaway && 'border-2 border-saffron bg-saffron-soft/60 text-saffron',
                  !d.cooked && !d.takeaway && 'border border-dashed border-line-strong bg-sunk/50 text-ink-3'
                )}
                aria-label={`${d.label}: ${d.cooked ? 'cooked at home' : d.takeaway ? 'takeaway' : 'nothing logged'}`}
              >
                {d.cooked ? '✓' : d.takeaway ? 'T' : '·'}
              </span>
              <span className={cx('text-[11.5px]', d.isToday ? 'font-bold text-tomato' : 'text-ink-3')}>
                {d.isToday ? 'Today' : d.label}
              </span>
            </li>
          ))}
        </ol>
        <dl className="mt-5 grid grid-cols-3 gap-2.5 border-t border-line pt-4">
          <div className="rounded-2xl bg-sunk/70 p-3">
            <dt className="text-[11.5px] font-medium text-ink-2">Home dinners</dt>
            <dd className="mt-0.5 font-display text-[25px] leading-tight font-semibold tabular-nums">{cookLog.length}</dd>
          </div>
          <div className="rounded-2xl bg-sunk/70 p-3">
            <dt className="text-[11.5px] font-medium text-ink-2">Takeaways</dt>
            <dd className="mt-0.5 font-display text-[25px] leading-tight font-semibold tabular-nums">{takeawayLog.length}</dd>
          </div>
          <div className="rounded-2xl bg-sunk/70 p-3">
            <dt className="text-[11.5px] font-medium text-ink-2">Rescued</dt>
            <dd className="mt-0.5 font-display text-[25px] leading-tight font-semibold text-sage tabular-nums">{rescuedItemsCount}</dd>
          </div>
        </dl>
        {cookLog.length > 0 && (
          <p className="mt-3 rounded-xl bg-sage-soft/75 px-3 py-2 text-[12.5px] font-medium text-sage">
            Roughly £{(cookLog.length * TAKEAWAY_COST_GBP).toLocaleString('en-GB')} kept in your pocket vs ordering a £{TAKEAWAY_COST_GBP} takeaway.
          </p>
        )}
      </Card>

      {(earnedMilestones.length > 0 || nextMilestone) && (
        <Card className="p-4">
          <h2 className="text-[15px] font-semibold">Milestones</h2>
          {earnedMilestones.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2">
              {earnedMilestones.map((m) => (
                <li key={m.key} className="rounded-full bg-sage-soft px-3 py-1.5 text-[13px] font-semibold text-sage">
                  {m.label}
                </li>
              ))}
            </ul>
          )}
          {nextMilestone && <p className="mt-3 text-[13px] text-ink-2">Next: {nextMilestone.label}.</p>}
        </Card>
      )}

      {/* Rate */}
      {recentCookedIds.length > 0 && (
        <section aria-labelledby="rate-h">
          <h2 id="rate-h" className="px-1 text-[15px] font-semibold">
            How was it?
          </h2>
          <p className="mb-2 px-1 text-[13px] text-ink-2">Tap a dish to rate it. Five-star dishes get a little celebration when they land.</p>
          <Card as="div" className="p-1">
            <ul className="divide-y divide-line">
              {recentCookedIds.slice(0, 4).map((id) => {
                const m = meals.find((x) => x.id === id)!;
                return (
                  <DishRow
                    key={id}
                    meal={m}
                    title={m.title}
                    detail={`${m.cuisine} · cooked ${m.cookCount}×`}
                    rating={m.rating}
                    open={openRow === 'rate:' + id}
                    onToggle={() => setOpenRow(openRow === 'rate:' + id ? null : 'rate:' + id)}
                  >
                    <RateStars value={m.rating} label={`Rate ${m.title}`} onRate={(n) => rateMeal(m.id, n)} />
                  </DishRow>
                );
              })}
            </ul>
          </Card>
          <button onClick={() => setRateAnotherOpen(true)} className="mt-1 min-h-11 px-1 text-[14px] font-semibold text-ink-2 hover:text-ink">
            Rate a different dish
          </button>
        </section>
      )}

      {/* Daily food log over time (Breakfast / Lunch / Dinner / Snack) */}
      <section aria-labelledby="daily-journal-h">
        <div className="mb-2 flex items-baseline justify-between px-1">
          <h2 id="daily-journal-h" className="text-[15px] font-semibold">
            What you’ve been eating
          </h2>
          <button
            type="button"
            onClick={() => setUsedTodayOpen(true)}
            className="text-[12.5px] font-semibold text-tomato hover:underline"
          >
            + Log meal or ingredients
          </button>
        </div>
        {dailyGroups.length === 0 ? (
          <Card className="p-4 text-[14px] text-ink-2">
            Log breakfast, lunch, dinner or ingredients used today to track your eating habits over time and see what needs restocking.
          </Card>
        ) : (
          <div className="space-y-2.5">
            {dailyGroups.slice(0, 7).map((group) => {
              const label = new Date(group.day + 'T12:00:00').toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
              });
              return (
                <Card key={group.day} as="div" className="overflow-hidden">
                  <p className="border-b border-line bg-sunk/60 px-3.5 py-1.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-ink-3">
                    {label}
                  </p>
                  <ul className="divide-y divide-line">
                    {group.entries.map((entry) => (
                      <li key={entry.id} className="px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="shrink-0 rounded-full bg-sunk px-2 py-0.5 text-[11px] font-semibold text-ink-2">
                            {slotLabel(entry.slot)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-ink">{entry.title}</span>
                          {entry.loggedBy && <span className="shrink-0 text-[11.5px] text-ink-3">{entry.loggedBy}</span>}
                        </div>
                        {entry.usedItems.length > 0 && (
                          <p className="mt-1 text-[12px] text-ink-2">
                            Used: {entry.usedItems.map((u) => u.name).join(', ')}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Most-used ingredients & Restock radar */}
      {(restockSuggestions.length > 0 || topUsed.length > 0) && (
        <section aria-labelledby="restock-history-h" className="space-y-3">
          {restockSuggestions.length > 0 && (
            <Card className="space-y-2.5 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 id="restock-history-h" className="text-[15px] font-semibold">
                  Needs restocking
                </h2>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => addShoppingItems(restockSuggestions.map((r) => r.name), 'Restock')}
                >
                  <ShoppingBasket className="h-3.5 w-3.5 text-tomato" /> Restock all
                </Button>
              </div>
              <ul className="divide-y divide-line">
                {restockSuggestions.slice(0, 6).map((item) => (
                  <li key={item.name} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate text-[14px] font-medium">{item.name}</p>
                      <p className="text-[12px] text-ink-3">{item.reason}</p>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => addShoppingItems([item.name], 'Restock')}>
                      <Plus className="h-3.5 w-3.5" /> Shop
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {topUsed.length > 0 && (
            <Card className="p-4">
              <h3 className="text-[14px] font-semibold">Most-used ingredients</h3>
              <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {topUsed.map((t) => (
                  <li
                    key={t.name}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunk/60 px-3 py-1 text-[12.5px] font-medium"
                  >
                    <span>{t.name}</span>
                    <span className="text-[11px] font-semibold text-ink-3 tabular-nums">{t.count}×</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>
      )}

      {/* Recent dinners */}
      <section aria-labelledby="recent-dinners">
        <h2 id="recent-dinners" className="mb-2 px-1 text-[15px] font-semibold">
          Recent dinners
        </h2>
        {history.length === 0 ? (
          <Card className="p-4 text-[14px] text-ink-2">Nothing logged yet. Dinners you finish show up here.</Card>
        ) : (
          <Card as="div" className="p-1">
            <ul className="divide-y divide-line">
              {shownHistory.map((h) => renderHistoryRow(h))}
            </ul>
          </Card>
        )}
        {history.length > 5 && (
          <button
            onClick={() => setShowAllHistory(true)}
            className="mt-2 inline-flex min-h-11 items-center px-1 text-[14px] font-semibold text-ink-2 hover:text-ink"
          >
            See all {Math.min(history.length, 60)} dinners
          </button>
        )}
      </section>

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

      <Sheet isOpen={showAllHistory} onClose={() => setShowAllHistory(false)} title="All dinners" subtitle="Newest first. Tap one to rate it or cook it again." labelledBy="all-dinners-title">
        <div className="space-y-4">
          {Array.from(new Set(history.slice(0, 60).map((h) => monthOf(h.date)))).map((month) => (
            <section key={month} aria-label={month}>
              <h3 className="mb-1 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-3">{month}</h3>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card p-1">
                {history
                  .slice(0, 60)
                  .filter((h) => monthOf(h.date) === month)
                  .map((h) => renderHistoryRow(h))}
              </ul>
            </section>
          ))}
          <Button variant="secondary" block onClick={() => setShowAllHistory(false)}>
            Back to History
          </Button>
        </div>
      </Sheet>

      <Sheet isOpen={rateAnotherOpen} onClose={() => setRateAnotherOpen(false)} title="Rate a dish" subtitle="Find it, tap it, give it stars." labelledBy="rate-another-title">
        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <TextInput
              type="search"
              value={rateSearch}
              onChange={(e) => setRateSearch(e.target.value)}
              placeholder="Search your recipes"
              aria-label="Search your recipes"
              className="pl-10"
            />
          </div>
          {rateList.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-ink-2">Nothing matches.</p>
          ) : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-card p-1">
              {rateList.slice(0, 60).map((m) => (
                <DishRow
                  key={m.id}
                  meal={m}
                  title={m.title}
                  detail={`${m.cuisine} · cooked ${m.cookCount}×`}
                  rating={m.rating}
                  open={openRow === 'all:' + m.id}
                  onToggle={() => setOpenRow(openRow === 'all:' + m.id ? null : 'all:' + m.id)}
                >
                  <RateStars value={m.rating} label={`Rate ${m.title}`} onRate={(n) => rateMeal(m.id, n)} />
                </DishRow>
              ))}
            </ul>
          )}
          <Button variant="secondary" block onClick={() => setRateAnotherOpen(false)}>
            Back to History
          </Button>
        </div>
      </Sheet>

      {usedTodayOpen && (
        <UsedTodaySheet isOpen={usedTodayOpen} onClose={() => setUsedTodayOpen(false)} />
      )}
    </div>
  );
};
