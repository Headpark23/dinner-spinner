import React from 'react';
import { useDinner } from '../context/DinnerContext';
import { Volume2, VolumeX, CircleHelp, ArrowRight, Moon, Sun } from 'lucide-react';
import { useTheme } from '../utils/theme';

interface CabinetHeaderProps {
  onOpenRules: () => void;
}

/** Crafted brass-and-enamel brand emblem: three cream reels crossed by a terracotta & brass payline. */
const Mark: React.FC = () => (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true" className="shrink-0 drop-shadow-[0_2px_4px_rgba(28,22,17,0.18)]">
    <rect x="1" y="1" width="30" height="30" rx="9.5" fill="var(--enamel)" stroke="var(--brass)" strokeOpacity="0.55" strokeWidth="1.2" />
    <rect x="6.5" y="7" width="5" height="18" rx="1.75" fill="var(--on-enamel)" opacity="0.92" />
    <rect x="13.5" y="7" width="5" height="18" rx="1.75" fill="var(--on-enamel)" opacity="0.96" />
    <rect x="20.5" y="7" width="5" height="18" rx="1.75" fill="var(--on-enamel)" opacity="0.92" />
    <rect x="4" y="15.1" width="24" height="1.8" rx="0.9" fill="var(--tomato)" />
    <circle cx="4.5" cy="16" r="1.4" fill="var(--brass)" />
    <circle cx="27.5" cy="16" r="1.4" fill="var(--brass)" />
  </svg>
);

/** Slim editorial top bar: brand mark + serif wordmark on the left, compact pill controls on the right. */
export const CabinetHeader: React.FC<CabinetHeaderProps> = ({ onOpenRules }) => {
  const { theme, toggleTheme } = useTheme();
  const { takeawayOverrideActive, soundMuted, toggleSound, setActiveView, activeView } = useDinner();

  return (
    <header className="sticky top-0 z-30 border-b border-line/80 bg-paper/88 backdrop-blur-md">
      <div className="flex h-15 items-center justify-between px-4">
        <button
          onClick={() => setActiveView(0)}
          className="group flex min-h-11 items-center gap-2.5 rounded-xl px-1 text-left"
          aria-label="Dinner Spinner, go to the spinner"
        >
          <Mark />
          <span className="font-display text-[21px] font-semibold leading-none tracking-tight text-ink">
            Dinner <em className="font-normal text-tomato">Spinner</em>
          </span>
        </button>

        <div className="flex items-center gap-0.5 rounded-full border border-line/90 bg-card/85 p-1 shadow-[0_1px_2px_rgba(28,22,17,0.05)]">
          <button
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Moon className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          </button>
          <button
            type="button"
            aria-label={soundMuted ? 'Turn sound on' : 'Turn sound off'}
            title={soundMuted ? 'Turn sound on' : 'Turn sound off'}
            onClick={toggleSound}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
          >
            {soundMuted ? <VolumeX className="h-[18px] w-[18px]" strokeWidth={1.8} /> : <Volume2 className="h-[18px] w-[18px]" strokeWidth={1.8} />}
          </button>
          <button
            type="button"
            aria-label="How it works"
            title="How it works"
            onClick={onOpenRules}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-sunk hover:text-ink"
          >
            <CircleHelp className="h-[18px] w-[18px]" strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {takeawayOverrideActive && activeView !== 1 && (
        <button
          onClick={() => setActiveView(1)}
          className="flex w-full items-center justify-between gap-2 bg-tomato px-4 py-2.5 text-left text-[14px] text-white"
        >
          <span>
            <strong className="font-semibold">Three vetoes in a row.</strong> The kitchen’s closed tonight.
          </span>
          <span className="flex shrink-0 items-center gap-1 font-semibold">
            Order in <ArrowRight className="h-4 w-4" />
          </span>
        </button>
      )}
    </header>
  );
};
