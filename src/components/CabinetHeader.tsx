import React from 'react';
import { useDinner } from '../context/DinnerContext';
import { Volume2, VolumeX, CircleHelp, ArrowRight, Moon, Sun } from 'lucide-react';
import { useTheme } from '../utils/theme';
import { IconButton } from './ui';

interface CabinetHeaderProps {
  onOpenRules: () => void;
}

/** The brand mark: a reel window with a payline, drawn rather than an emoji. */
const Mark: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true" className="shrink-0">
    <rect x="1" y="1" width="26" height="26" rx="8" fill="var(--enamel)" />
    <rect x="6" y="6" width="4.5" height="16" rx="1.5" fill="var(--on-enamel)" opacity="0.9" />
    <rect x="11.75" y="6" width="4.5" height="16" rx="1.5" fill="var(--on-enamel)" opacity="0.9" />
    <rect x="17.5" y="6" width="4.5" height="16" rx="1.5" fill="var(--on-enamel)" opacity="0.9" />
    <rect x="4" y="13.25" width="20" height="1.5" rx="0.75" fill="var(--tomato)" />
  </svg>
);

/** Slim top bar: brand on the left, the two things you reach for mid-dinner on the right. */
export const CabinetHeader: React.FC<CabinetHeaderProps> = ({ onOpenRules }) => {
  const { theme, toggleTheme } = useTheme();
  const { takeawayOverrideActive, soundMuted, toggleSound, setActiveView, activeView } = useDinner();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur-sm">
      <div className="flex h-14 items-center justify-between px-4">
        <button
          onClick={() => setActiveView(0)}
          className="flex min-h-11 items-center gap-2.5 rounded-lg px-1"
          aria-label="Dinner Spinner, go to the spinner"
        >
          <Mark />
          <span className="font-display text-[20px] font-semibold leading-none tracking-tight">
            Dinner <em className="font-medium">Spinner</em>
          </span>
        </button>

        <div className="-mr-2 flex items-center">
          <IconButton label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>
            {theme === 'dark' ? <Sun className="h-5 w-5" strokeWidth={1.75} /> : <Moon className="h-5 w-5" strokeWidth={1.75} />}
          </IconButton>
          <IconButton label={soundMuted ? 'Turn sound on' : 'Turn sound off'} onClick={toggleSound}>
            {soundMuted ? <VolumeX className="h-5 w-5" strokeWidth={1.75} /> : <Volume2 className="h-5 w-5" strokeWidth={1.75} />}
          </IconButton>
          <IconButton label="How it works" onClick={onOpenRules}>
            <CircleHelp className="h-5 w-5" strokeWidth={1.75} />
          </IconButton>
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
