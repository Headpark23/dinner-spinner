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
    <nav
      aria-label="Main"
      className="pb-safe sticky bottom-0 z-30 border-t border-line bg-card/95 px-1.5 pt-1.5 backdrop-blur-sm"
    >
      <ul className="grid grid-cols-5 gap-0.5">
        {items.map((item) => {
          const isActive = activeTab === item.key;
          const Icon = item.icon;
          return (
            <li key={item.key}>
              <button
                onClick={item.go}
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                  'relative flex min-h-[56px] w-full flex-col items-center justify-center gap-1 rounded-2xl transition-colors',
                  isActive ? 'bg-tomato-soft text-tomato' : 'text-ink-2 hover:text-ink'
                )}
              >
                <span className="relative">
                  <Icon className="h-[24px] w-[24px]" strokeWidth={isActive ? 2.1 : 1.75} />
                  {'count' in item && item.count !== undefined && (
                    <span className="absolute -top-1.5 -right-3 min-w-[18px] rounded-full bg-tomato px-1 text-center text-[11px] font-semibold leading-[18px] text-white tabular-nums">
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
                <span className={cx('text-[12px] leading-none', isActive ? 'font-bold' : 'font-medium')}>{item.label}</span>
                {item.hint && <span className="sr-only">, {item.hint}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
