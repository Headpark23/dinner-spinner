import React from 'react';
import { useDinner } from '../context/DinnerContext';
import { UtensilsCrossed, BookOpen, ShoppingBasket, Refrigerator, Menu } from 'lucide-react';
import { cx } from './ui';

/** Which tab owns each internal view id. Takeaway (1) and Stats (4) live under More. */
const TAB_OF_VIEW: Record<number, string> = { 0: 'dinner', 3: 'dinner', 5: 'recipes', 6: 'shopping', 2: 'fridge', 1: 'more', 4: 'more', 7: 'more' };

export const ArcadeNavBar: React.FC = () => {
  const { activeView, setActiveView, takeawayOverrideActive, pantry, agreedMeal, proposedMeal, shoppingList } =
    useDinner();

  const redPantryCount = pantry.filter((p) => p.freshness === 'red').length;
  const toBuy = shoppingList.filter((i) => !i.checked).length;
  const activeTab = TAB_OF_VIEW[activeView] ?? 'dinner';

  const items = [
    {
      key: 'dinner',
      label: 'Dinner',
      icon: UtensilsCrossed,
      go: () => setActiveView(agreedMeal || proposedMeal ? 3 : 0),
      dot: agreedMeal ? 'sage' : proposedMeal ? 'saffron' : undefined,
      hint: agreedMeal ? 'dinner agreed' : proposedMeal ? 'waiting for a vote' : undefined,
    },
    { key: 'recipes', label: 'Recipes', icon: BookOpen, go: () => setActiveView(5) },
    {
      key: 'shopping',
      label: 'Shopping',
      icon: ShoppingBasket,
      go: () => setActiveView(6),
      count: toBuy > 0 ? toBuy : undefined,
      hint: toBuy > 0 ? `${toBuy} to buy` : undefined,
    },
    {
      key: 'fridge',
      label: 'Fridge',
      icon: Refrigerator,
      go: () => setActiveView(2),
      dot: redPantryCount > 0 ? 'tomato' : undefined,
      hint: redPantryCount > 0 ? `${redPantryCount} to use up` : undefined,
    },
    {
      key: 'more',
      label: 'More',
      icon: Menu,
      go: () => setActiveView(7),
      dot: takeawayOverrideActive ? 'tomato' : undefined,
      hint: takeawayOverrideActive ? 'kitchen closed, takeaway tonight' : undefined,
    },
  ];

  return (
    <div className="pb-safe pointer-events-none sticky bottom-0 z-30 px-3 pt-2">
      <nav
        aria-label="Main"
        className="pointer-events-auto rounded-[24px] border border-line/90 bg-card/92 p-1.5 shadow-[0_12px_32px_-8px_rgba(28,22,17,0.22),inset_0_1px_0_var(--card-edge)] backdrop-blur-md"
      >
        <ul className="grid grid-cols-5 gap-1">
          {items.map((item) => {
            const isActive = activeTab === item.key;
            const Icon = item.icon;
            return (
              <li key={item.key}>
                <button
                  onClick={item.go}
                  aria-current={isActive ? 'page' : undefined}
                  className={cx(
                    'relative flex min-h-[54px] w-full flex-col items-center justify-center gap-1 rounded-[18px] transition-[background-color,color,transform] duration-150 active:scale-[0.98]',
                    isActive
                      ? 'bg-tomato-soft text-tomato ring-1 ring-tomato/15'
                      : 'text-ink-2 hover:bg-sunk/60 hover:text-ink'
                  )}
                >
                  <span className="relative">
                    <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.15 : 1.75} />
                    {'count' in item && item.count !== undefined && (
                      <span className="absolute -top-1.5 -right-3 min-w-[18px] rounded-full bg-tomato px-1 text-center text-[10.5px] font-bold leading-[18px] text-white shadow-sm tabular-nums">
                        {item.count}
                      </span>
                    )}
                    {'dot' in item && item.dot && (
                      <span
                        className={cx(
                          'absolute -top-0.5 -right-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-card',
                          item.dot === 'sage' ? 'bg-sage' : item.dot === 'tomato' ? 'bg-tomato' : 'bg-saffron'
                        )}
                      />
                    )}
                  </span>
                  <span className={cx('text-[11.5px] leading-none tracking-[-0.01em]', isActive ? 'font-bold' : 'font-medium')}>
                    {item.label}
                  </span>
                  {item.hint && <span className="sr-only">, {item.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};
