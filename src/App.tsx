/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { DinnerProvider, useDinner } from './context/DinnerContext';
import { CabinetHeader } from './components/CabinetHeader';
import { ArcadeNavBar } from './components/ArcadeNavBar';
import { MachineView } from './components/views/MachineView';
import { TakeawayView } from './components/views/TakeawayView';
import { PantryView } from './components/views/PantryView';
import { VotingView } from './components/views/VotingView';
import { ScorecardView } from './components/views/ScorecardView';
import { MoreView } from './components/views/MoreView';
import { UpdateNotice } from './components/InstallUpdate';
import { MilestoneToast } from './components/MilestoneToast';
import { DinnerSteps, InProgressBanner, useDinnerStage } from './components/DinnerSteps';
import { ProfileSyncModal } from './components/ProfileSyncModal';
import { RulesModal } from './components/RulesModal';
import { WelcomeSheet } from './components/WelcomeSheet';
import { JoinSheet, JoinedBanner, LiveVoteBanner } from './components/LiveVote';
import { VoteNewsBanner } from './components/VoteNotifications';
import { FamilySheet } from './components/FamilySheet';
import { photoFor } from './data/photos';
import { Card, FreshDot, Switch, cx } from './components/ui';
import { ArrowRight, Check, ChevronLeft, Clock, Flame } from 'lucide-react';

/** Desktop companion column: editorial "Tonight at a Glance" kitchen board. */
const TonightPanel: React.FC = () => {
  const {
    setActiveView,
    pantry,
    agreedMeal,
    proposedMeal,
    reverseTimers,
    targetEatingTime,
    householdMembers,
    clearoutActive,
    setClearoutActive,
  } = useDinner();

  const redItems = pantry.filter((p) => p.freshness === 'red');
  const nextStep = reverseTimers.find((s) => !s.done);
  const featured = agreedMeal || proposedMeal;
  const featuredPhoto = featured ? featured.imageUrl || photoFor(featured.id) : undefined;

  return (
    <aside aria-label="Tonight at a glance" className="hidden lg:block w-[340px] shrink-0">
      <div className="sticky top-0 space-y-4 py-6">
        <p className="eyebrow px-1">Tonight in the kitchen</p>

        <Card className="overflow-hidden">
          {featuredPhoto && (
            <div className="relative aspect-[16/9] w-full overflow-hidden">
              <img src={featuredPhoto} alt="" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent" />
              <span className="absolute bottom-2.5 left-3 inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                <Clock className="h-3 w-3" /> Dinner at {targetEatingTime}
              </span>
            </div>
          )}
          <div className="p-4">
            {!featuredPhoto && <p className="text-[13px] font-medium text-ink-2">Dinner at {targetEatingTime}</p>}
            {agreedMeal ? (
              <>
                <p className="mt-0.5 font-display text-[20px] font-semibold leading-snug">{agreedMeal.title}</p>
                <div className="mt-3 rounded-xl border border-line/70 bg-sunk/80 p-3">
                  {nextStep ? (
                    <>
                      <p className="eyebrow text-tomato">Next · {nextStep.timeString}</p>
                      <p className="mt-0.5 text-[14px] font-medium text-ink">{nextStep.label}</p>
                    </>
                  ) : (
                    <p className="flex items-center gap-1.5 text-[14px] font-medium text-sage">
                      <Check className="h-4 w-4" /> Every step done. Time to eat.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => setActiveView(3)}
                  className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-tomato hover:underline"
                >
                  Open cooking timeline <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : proposedMeal ? (
              <>
                <p className="eyebrow text-saffron">Vote in progress</p>
                <p className="mt-0.5 font-display text-[20px] font-semibold leading-snug">{proposedMeal.title}</p>
                <button
                  onClick={() => setActiveView(3)}
                  className="mt-3 inline-flex items-center gap-1 text-[14px] font-semibold text-tomato hover:underline"
                >
                  Open the vote <ArrowRight className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <p className="mt-1 font-display text-[20px] font-semibold leading-snug">Nothing decided yet</p>
                <p className="mt-1 text-[14px] text-ink-2">Spin the reel, then put tonight’s contender to the household.</p>
              </>
            )}
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-[15px] font-semibold">
              <Flame className="h-4 w-4 text-tomato" /> Use these up
            </p>
            <span className="rounded-full bg-sunk px-2.5 py-0.5 text-[12px] font-semibold text-ink-2 tabular-nums">
              {redItems.length}
            </span>
          </div>
          {redItems.length > 0 ? (
            <>
              <ul className="mt-2.5 divide-y divide-line">
                {redItems.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2 py-2 text-[14px]">
                    <span className="flex min-w-0 items-center gap-2">
                      <FreshDot level="red" />
                      <span className="truncate font-medium">{item.name}</span>
                    </span>
                    <span className="shrink-0 text-[12.5px] text-ink-3">{item.quantity}</span>
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
                  description="Dishes that rescue them become 4.5× likelier"
                />
              </div>
            </>
          ) : (
            <p className="mt-2 text-[14px] text-ink-2">Nothing in the fridge urgently needs rescuing tonight.</p>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[15px] font-semibold">Vetoes left this week</p>
          <ul className="mt-2.5 space-y-2">
            {householdMembers.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-[14px]">
                <span className="flex items-center gap-2 font-medium">
                  <span aria-hidden="true" className="text-[16px] leading-none">{m.avatar || '🍽️'}</span>
                  {m.name}
                </span>
                <span className="flex gap-1.5" aria-label={`${m.vetoTokensRemaining} of 3 vetoes left`}>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={i}
                      className={cx(
                        'h-2.5 w-2.5 rounded-full transition-colors',
                        i < m.vetoTokensRemaining ? 'bg-brass ring-1 ring-brass/40' : 'border border-line-strong'
                      )}
                    />
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        <div className="px-1 text-[12.5px] text-ink-3">
          <span className="font-semibold text-ink-2">Shortcuts</span> · <kbd className="rounded bg-sunk px-1.5 py-0.5 text-[11px]">Space</kbd> spin ·{' '}
          <kbd className="rounded bg-sunk px-1.5 py-0.5 text-[11px]">N</kbd> nudge ·{' '}
          <kbd className="rounded bg-sunk px-1.5 py-0.5 text-[11px]">1–4</kbd> hold ·{' '}
          <kbd className="rounded bg-sunk px-1.5 py-0.5 text-[11px]">M</kbd> sound
        </div>
      </div>
    </aside>
  );
};

/** Takeaway and History are reached from More, so they say so and offer the way back. */
const BackToMore: React.FC = () => {
  const { setActiveView } = useDinner();
  return (
    <button
      onClick={() => setActiveView(7)}
      className="editorial-card mb-3 inline-flex h-10 items-center gap-1 rounded-full border border-line bg-card pr-4 pl-2 text-[14px] font-semibold text-ink hover:border-line-strong"
    >
      <ChevronLeft className="h-5 w-5" /> Back to More
    </button>
  );
};

const MainCabinet: React.FC = () => {
  const { activeView } = useDinner();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isRulesOpen, setIsRulesOpen] = useState(false);
  const [isFamilyOpen, setIsFamilyOpen] = useState(false);

  const stage = useDinnerStage();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [activeView, stage]);

  return (
    <div className="min-h-screen text-ink lg:flex lg:justify-center lg:gap-10 lg:px-8">
      <div className="mx-auto flex min-h-screen w-full max-w-[540px] flex-col lg:mx-0 lg:border-x lg:border-line/70 lg:bg-paper/40">
        <CabinetHeader onOpenRules={() => setIsRulesOpen(true)} />

        <main id="main" className="flex-1 px-4 pt-5 pb-8">
          <UpdateNotice />
          <MilestoneToast />
          <JoinedBanner />
          <LiveVoteBanner />
          <VoteNewsBanner />
          <div key={activeView} className="fade-up">
            {(activeView === 0 || activeView === 3) && (
              <div className="space-y-4">
                {activeView === 3 && <DinnerSteps />}
                <InProgressBanner />
                {activeView === 0 ? <MachineView onOpenFamily={() => setIsFamilyOpen(true)} /> : <VotingView />}
              </div>
            )}
            {activeView === 1 && (
              <>
                <BackToMore />
                <TakeawayView onOpenFamily={() => setIsFamilyOpen(true)} />
              </>
            )}
            {activeView === 2 && <PantryView scope="fridge" />}
            {activeView === 4 && (
              <>
                <BackToMore />
                <ScorecardView />
              </>
            )}
            {activeView === 5 && <PantryView scope="recipes" />}
            {activeView === 6 && <PantryView scope="shop" />}
            {activeView === 7 && (
              <MoreView
                onOpenProfile={() => setIsProfileOpen(true)}
                onOpenRules={() => setIsRulesOpen(true)}
                onOpenFamily={() => setIsFamilyOpen(true)}
              />
            )}
          </div>
        </main>

        <ArcadeNavBar />
      </div>

      <TonightPanel />

      <ProfileSyncModal isOpen={isProfileOpen} onClose={() => setIsProfileOpen(false)} />
      <FamilySheet isOpen={isFamilyOpen} onClose={() => setIsFamilyOpen(false)} />
      <RulesModal isOpen={isRulesOpen} onClose={() => setIsRulesOpen(false)} />
      <WelcomeSheet />
      <JoinSheet />
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
