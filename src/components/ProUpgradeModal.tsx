import React, { useState } from 'react';
import { Check, Crown, ExternalLink, ShieldCheck, Sparkles, UsersRound } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { useBilling } from '../utils/useBilling';
import type { BillingInterval } from '../utils/billing';
import { Button, Chip, Sheet, cx } from './ui';

const PRO_PERKS = [
  'Unlimited AI fridge, cupboard & receipt photo scanning',
  'AI Chef Kitchen Studio — bespoke recipes from what is in your kitchen',
  'Multi-phone household sync & instant live dinner vote alerts',
  'Full 7-night Week Planner with 1-tap shopping list',
  'One household plan covers every phone in your family group',
];

export const ProUpgradeModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onOpenFamily?: () => void;
}> = ({ isOpen, onClose, onOpenFamily }) => {
  const { householdCode } = useDinner();
  const { entitlement, plans, busyAction, error, startCheckout, openPortal } = useBilling();
  const [selected, setSelected] = useState<BillingInterval>('annual');

  const activePlan = plans.find((p) => p.id === selected) || plans[0];

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Household Pro"
      subtitle="One plan for the whole family"
      labelledBy="pro-upgrade-title"
      tall
    >
      <div className="space-y-4">
        {entitlement.isOwner ? (
          <div className="rounded-2xl border border-sage/40 bg-sage-soft/55 p-4">
            <p className="flex items-center gap-2 font-display text-[17px] font-semibold text-ink">
              <ShieldCheck className="h-5 w-5 text-sage" /> Creator & Partner Access · Free Forever
            </p>
            <p className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
              Your household is on the owner allowlist. Every Pro feature and unlimited AI scans stay unlocked permanently with no charge.
            </p>
          </div>
        ) : entitlement.plan === 'lifetime' ? (
          <div className="rounded-2xl border border-sage/40 bg-sage-soft/55 p-4">
            <p className="flex items-center gap-2 font-display text-[17px] font-semibold text-ink">
              <Crown className="h-5 w-5 text-saffron" /> Lifetime Founder Pass Active
            </p>
            <p className="mt-1 text-[13.5px] text-ink-2">
              Your household has permanent Pro access ({entitlement.aiScansUsed} / {entitlement.aiScansLimit} AI scans used this month).
            </p>
          </div>
        ) : entitlement.plan === 'pro' ? (
          <div className="rounded-2xl border border-sage/40 bg-sage-soft/55 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-display text-[17px] font-semibold text-ink">
                <Crown className="h-5 w-5 text-saffron" /> Household Pro Active
              </p>
              <Chip tone="sage">{entitlement.status === 'trialing' ? 'Free trial' : 'Active'}</Chip>
            </div>
            {entitlement.currentPeriodEnd && (
              <p className="mt-1 text-[13px] text-ink-2">
                {entitlement.cancelAtPeriodEnd ? 'Ends' : 'Renews'} on{' '}
                {new Date(entitlement.currentPeriodEnd).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
                .
              </p>
            )}
            {entitlement.hasPortal && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={busyAction === 'portal'}
                onClick={openPortal}
              >
                <ExternalLink className="h-4 w-4" />
                {busyAction === 'portal' ? 'Opening…' : 'Manage subscription'}
              </Button>
            )}
          </div>
        ) : null}

        <div className="rounded-2xl border border-line bg-sunk/55 p-4">
          <p className="eyebrow flex items-center gap-1.5 text-tomato">
            <Sparkles className="h-3.5 w-3.5" /> Everything included in Pro
          </p>
          <ul className="mt-2.5 space-y-2 text-[13.5px] text-ink">
            {PRO_PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-sage" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>
        </div>

        {!entitlement.isOwner && entitlement.plan !== 'lifetime' && entitlement.plan !== 'pro' && (
          <>
            <div className="space-y-2.5" role="radiogroup" aria-label="Choose a Household Pro plan">
              {plans.map((plan) => {
                const isSelected = selected === plan.id;
                return (
                  <button
                    key={plan.id}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => setSelected(plan.id)}
                    className={cx(
                      'w-full rounded-2xl border p-3.5 text-left transition-all',
                      isSelected
                        ? 'border-tomato bg-tomato-soft/45 ring-2 ring-tomato/25'
                        : 'border-line bg-card hover:border-line-strong'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-display text-[16px] font-semibold text-ink">{plan.name}</p>
                        {plan.badge && (
                          <span className="mt-1 inline-block rounded-full bg-tomato px-2 py-0.5 text-[11px] font-bold text-white">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-display text-[20px] font-bold text-ink tabular-nums">{plan.priceGbp}</p>
                        <p className="text-[11.5px] text-ink-3">{plan.cadence}</p>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-ink-2">{plan.summary}</p>
                  </button>
                );
              })}
            </div>

            {!entitlement.billingConfigured && (
              <p className="rounded-xl border border-line bg-sunk/70 px-3 py-2 text-[12.5px] text-ink-2">
                Preview mode: Stripe keys are not set on this server yet, so all Pro features are currently unlocked for testing.
              </p>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-tomato/40 bg-tomato-soft/60 px-3 py-2 text-[13px] text-tomato">
                {error}
              </p>
            )}

            {!householdCode ? (
              <Button
                variant="primary"
                className="w-full"
                onClick={() => {
                  onClose();
                  onOpenFamily?.();
                }}
              >
                <UsersRound className="h-4 w-4" /> Start a family group to upgrade
              </Button>
            ) : (
              <Button
                variant="primary"
                className="w-full"
                disabled={Boolean(busyAction)}
                onClick={() => startCheckout(selected)}
              >
                <Crown className="h-4 w-4" />
                {busyAction === selected
                  ? 'Opening Stripe…'
                  : selected === 'lifetime'
                    ? `Unlock Lifetime Pass (${activePlan.priceGbp})`
                    : `Start 7-day free trial (${activePlan.priceGbp} ${activePlan.cadence})`}
              </Button>
            )}

            <p className="text-center text-[11.5px] text-ink-3">
              Secure checkout via Stripe. Core spinner, World Kitchen, shopping list & 3 AI scans/month stay free.
            </p>
          </>
        )}
      </div>
    </Sheet>
  );
};
