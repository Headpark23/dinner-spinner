/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { DinnerProvider, useDinner } from './context/DinnerContext';
import { CabinetHeader } from './components/CabinetHeader';
import { ArcadeNavBar } from './components/ArcadeNavBar';
import { MachineView } from './components/views/MachineView';
import { TakeawayView } from './components/views/TakeawayView';
import { PantryView } from './components/views/PantryView';
import { VotingView } from './components/views/VotingView';
import { ScorecardView } from './components/views/ScorecardView';
import { ProfileSyncModal } from './components/ProfileSyncModal';
import { RulesModal } from './components/RulesModal';
import { Card, FreshDot, Switch, cx } from './components/ui';
import { ArrowRight, Check } from 'lucide-react';

/** Desktop-only companion column: what matters for tonight at a glance. */
const TonightPanel: React.FC = () => {
  const {
    setActiveView,
    pantry,
    agreedMeal,
    reverseTimers,
    targetEatingTime,
    householdMembers,
    clearoutActive,
    setClearoutActive,
  } = useDinner();

  const redItems = pantry.filter((p) => p.freshness === 'red');
  const nextStep = reverseTimers.find((s) => !s.done);

  return (
    <aside aria-label="Tonight at a glance" className="hidden lg:block w-[320px] shrink-0">
      <div className="sticky top-0 space-y-4 py-6">
        <p className="eyebrow px-1">Tonight at a glance</p>

        <Card className="p-4">
          <p className="text-[13px] text-ink-2">Dinner at {targetEatingTime}</p>
          {agreedMeal ? (
            <>
              <p className="mt-1 font-display text-[19px] font-semibold leading-snug">{agreedMeal.title}</p>
              <div className="mt-3 rounded-xl bg-sunk p-3">
                {nextStep ? (
                  <>
                    <p className="text-[12px] font-semibold text-ink-3">Next, at {nextStep.timeString}</p>
                    <p className="text-[14px] text-ink">{nextStep.label}</p>
                  </>
                ) : (
                  <p className="flex items-center gap-1.5 text-[14px] text-sage">
                    <Check className="h-4 w-4" /> Every step done. Time to eat.
                  </p>
                )}
              </div>
              <button
                onClick={() => setActiveView(3)}
                className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-tomato hover:underline"
              >
                Open the timeline <ArrowRight className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <p className="mt-1 font-display text-[19px] font-semibold leading-snug">Nothing decided yet</p>
              <p className="mt-1 text-[14px] text-ink-2">Spin, then put the result to the household.</p>
            </>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] font-semibold">Use these up</p>
            <span className="text-[13px] text-ink-2 tabular-nums">{redItems.length} items</span>
          </div>
          {redItems.length > 0 ? (
            <>
              <ul className="mt-2 divide-y divide-line">
                {redItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <FreshDot level="red" />
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="shrink-0 text-[13px] text-ink-3">{item.quantity}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-line pt-3">
                <Switch
                  id="aside-clearout"
                  checked={clearoutActive}
                  onChange={(v) => {
                    setClearoutActive(v);
                    setActiveView(0);
                  }}
                  label="Favour these when spinning"
                  description="Dishes that use them become 4.5× likelier"
                />
              </div>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-ink-2">Nothing in the fridge needs using up.</p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[15px] font-semibold">Vetoes left this week</p>
          <ul className="mt-2 space-y-2">
            {householdMembers.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-[14px]">
                <span>{m.name}</span>
                <span className="flex gap-1" aria-label={`${m.vetoTokensRemaining} of 3 vetoes left`}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={cx(
                        'h-2.5 w-2.5 rounded-full',
                        i < m.vetoTokensRemaining ? 'bg-ink' : 'border border-line-strong'
                      )}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="px-1 text-[13px] text-ink-3">
          <span className="font-semibold text-ink-2">Shortcuts</span> · <kbd>Space</kbd> spin · <kbd>N</kbd> nudge ·{' '}
          <kbd>1–4</kbd> hold · <kbd>M</kbd> sound
        </div>
      </div>
    </aside>
  );
};

const MainCabinet: React.FC = () => {
  const { activeView } = useDinner();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);

  return (
    <div className="min-h-screen bg-paper text-ink lg:flex lg:justify-center lg:gap-8 lg:px-6">
      <div className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col lg:mx-0 lg:border-x lg:border-line">
        <CabinetHeader
          onOpenProfile={() => setIsProfileOpen(true)}
          onOpenRules={() => setIsRulesOpen(true)}
        />

        <main id="main" className="flex-1 px-4 pt-4 pb-8">
          <div key={activeView} className="fade-up">
            {activeView === 0 && <MachineView />}
            {activeView === 1 && <TakeawayView />}
            {activeView === 2 && <PantryView />}
            {activeView === 3 && <VotingView />}
            {activeView === 4 && <ScorecardView />}
          </div>
        </main>

        <ArcadeNavBar />
      </div>

      <TonightPanel />

      <ProfileSyncModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <DinnerProvider>
      <MainCabinet />
    </DinnerProvider>
  );
}
