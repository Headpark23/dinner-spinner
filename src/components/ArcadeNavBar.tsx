import React from 'react';
import { useDinner } from '../context/DinnerContext';
import { Dices, ChefHat, Refrigerator, Bike, BarChart3 } from 'lucide-react';
import { cx } from './ui';

export const ArcadeNavBar: React.FC = () => {
  const { activeView, setActiveView, takeawayOverrideActive, pantry, agreedMeal, proposedMeal } =
    useDinner();

  const redPantryCount = pantry.filter((p) => p.freshness === 'red').length;

  // Ordered by the evening's flow: decide, agree & cook, stock, fall back, reflect.
  const navItems = [
    { id: 0, label: 'Spin', icon: Dices },
    {
      id: 3,
      label: 'Tonight',
      icon: ChefHat,
      dot: agreedMeal ? 'sage' : proposedMeal ? 'ink' : undefined,
      srHint: agreedMeal ? 'dinner agreed' : undefined,
    },
    {
      id: 2,
      label: 'Pantry',
      icon: Refrigerator,
      count: redPantryCount > 0 ? redPantryCount : undefined,
      srHint: redPantryCount > 0 ? `${redPantryCount} items to use next` : undefined,
    },
    {
      id: 1,
      label: 'Takeaway',
      icon: Bike,
      dot: takeawayOverrideActive ? 'tomato' : undefined,
      srHint: takeawayOverrideActive ? 'kitchen closed' : undefined,
    },
    { id: 4, label: 'Stats', icon: BarChart3 },
  ] as const;

  return (
    <nav
      aria-label="Main"
      className="pb-safe sticky bottom-0 z-30 border-t border-line bg-paper/95 px-2 pt-1.5 backdrop-blur-sm"
    >
      <ul className="grid grid-cols-5">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          const count = 'count' in item ? item.count : undefined;
          const dot = 'dot' in item ? item.dot : undefined;
          return (
            <li key={item.id}>
              <button
                onClick={() => setActiveView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={cx(
                  'relative flex min-h-[52px] w-full flex-col items-center justify-center gap-1 rounded-xl transition-colors',
                  isActive ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
                )}
              >
                <span className="relative">
                  <Icon className="h-[22px] w-[22px]" strokeWidth={isActive ? 2.1 : 1.75} />
                  {count !== undefined && (
                    <span className="absolute -top-1.5 -right-2.5 min-w-[18px] rounded-full bg-tomato px-1 text-center text-[11px] font-semibold leading-[18px] text-white tabular-nums">
                      {count}
                    </span>
                  )}
                  {dot && (
                    <span
                      className={cx(
                        'absolute -top-0.5 -right-1 h-2.5 w-2.5 rounded-full ring-2 ring-paper',
                        dot === 'sage' ? 'bg-sage' : dot === 'tomato' ? 'bg-tomato' : 'bg-ink'
                      )}
                    />
                  )}
                </span>
                <span className={cx('text-[11px] leading-none', isActive ? 'font-semibold' : 'font-medium')}>
                  {item.label}
                </span>
                {'srHint' in item && item.srHint && <span className="sr-only">, {item.srHint}</span>}
                {isActive && <span className="absolute top-0 h-0.5 w-6 rounded-full bg-tomato" />}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
