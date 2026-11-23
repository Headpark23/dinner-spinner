import React from 'react';
import { Bike, BarChart3, Users, CircleHelp, Volume2, VolumeX, ChevronRight } from 'lucide-react';
import { useDinner } from '../../context/DinnerContext';
import { Card, PageHeader, cx } from '../ui';

interface Row {
  key: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
  flag?: string;
}

/** Everything that isn't part of tonight's dinner, each with a plain-English description. */
export const MoreView: React.FC<{ onOpenProfile: () => void; onOpenRules: () => void }> = ({
  onOpenProfile,
  onOpenRules,
}) => {
  const { setActiveView, takeawayOverrideActive, soundMuted, toggleSound, householdMembers, cookLog } = useDinner();

  const rows: Row[] = [
    {
      key: 'takeaway',
      icon: <Bike className="h-5 w-5" />,
      title: 'Order takeaway',
      body: 'Can’t face cooking? Spin for where to order from.',
      onClick: () => setActiveView(1),
      flag: takeawayOverrideActive ? 'Kitchen closed' : undefined,
    },
    {
      key: 'stats',
      icon: <BarChart3 className="h-5 w-5" />,
      title: 'History and ratings',
      body: cookLog.length > 0 ? `${cookLog.length} dinners logged. See what you cook and love.` : 'What you cook, rate and rescue from the fridge.',
      onClick: () => setActiveView(4),
    },
    {
      key: 'household',
      icon: <Users className="h-5 w-5" />,
      title: 'Household and backup',
      body: `${householdMembers.length} ${householdMembers.length === 1 ? 'person' : 'people'} voting. Back up or restore your data.`,
      onClick: onOpenProfile,
    },
    {
      key: 'how',
      icon: <CircleHelp className="h-5 w-5" />,
      title: 'How it works',
      body: 'The rules in under a minute.',
      onClick: onOpenRules,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="More" />

      <ul className="space-y-2.5">
        {rows.map((row) => (
          <li key={row.key}>
            <button
              onClick={row.onClick}
              className="flex w-full items-center gap-3.5 rounded-2xl border border-line bg-card p-3.5 text-left transition-colors hover:border-line-strong"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunk text-ink">{row.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2 text-[16px] font-semibold">
                  {row.title}
                  {row.flag && <span className="rounded-full bg-tomato px-2 py-0.5 text-[11px] font-semibold text-white">{row.flag}</span>}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug text-ink-2">{row.body}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-3" />
            </button>
          </li>
        ))}
      </ul>

      <Card as="div" className="p-3.5">
        <button onClick={toggleSound} className="flex w-full items-center gap-3.5 text-left" role="switch" aria-checked={!soundMuted}>
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunk text-ink">
            {soundMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-semibold">Sound effects</span>
            <span className="mt-0.5 block text-[13px] text-ink-2">Reel clicks and the win chime.</span>
          </span>
          <span className={cx('relative h-7 w-12 shrink-0 rounded-full transition-colors', soundMuted ? 'bg-line-strong' : 'bg-sage')}>
            <span className={cx('absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform', !soundMuted && 'translate-x-5')} />
          </span>
        </button>
      </Card>
    </div>
  );
};
