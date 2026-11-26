import React, { useState } from 'react';
import { AlertTriangle, Check, Shield, Trash2 } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Sheet } from './ui';

export const PrivacyModal: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { householdCode, authHeaders, leaveHousehold } = useDinner();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletedMsg, setDeletedMsg] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  const handleDeleteAll = async () => {
    setDeleting(true);
    setDeleteErr(null);
    try {
      if (householdCode) {
        const res = await fetch('/api/households/me', {
          method: 'DELETE',
          headers: authHeaders(),
        });
        if (!res.ok) {
          setDeleteErr('Could not erase synced household data right now. Try again in a moment.');
          setDeleting(false);
          return;
        }
        leaveHousehold();
      }
      if (typeof window !== 'undefined') {
        localStorage.clear();
      }
      setDeletedMsg('Your synced household data and local browser storage have been cleared.');
      setConfirmDelete(false);
    } catch {
      setDeleteErr('Network error while clearing data. Try again.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Privacy, terms & data"
      subtitle="UK GDPR notice, subscription terms & food safety"
      labelledBy="privacy-terms-title"
      tall
    >
      <div className="space-y-4 text-[13.5px] leading-relaxed text-ink-2">
        <section className="rounded-2xl border border-line bg-sunk/55 p-4">
          <h3 className="flex items-center gap-1.5 font-display text-[16px] font-semibold text-ink">
            <Shield className="h-4 w-4 text-sage" /> UK GDPR Privacy Notice
          </h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-ink">On-device first:</strong> Recipes, fridge, cupboard, shopping list and preferences live in your browser’s local storage.
            </li>
            <li>
              <strong className="text-ink">Family sync (optional):</strong> Joining a family group syncs your kitchen lists via encrypted HTTPS to our Upstash Redis store so phones stay in step.
            </li>
            <li>
              <strong className="text-ink">Google Sign-In (optional):</strong> We store only your name, email address, and a one-way hash of your Google ID to reconnect your family group.
            </li>
            <li>
              <strong className="text-ink">AI scanning & chef ideas:</strong> Photos and ingredient lists are sent to Google Gemini only when you tap Scan or Ask AI Chef; photos are not kept on our servers.
            </li>
            <li>
              <strong className="text-ink">No ad or tracking cookies:</strong> Dinner Spinner sets zero third-party advertising or cross-site tracking cookies.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-card p-4">
          <h3 className="font-display text-[16px] font-semibold text-ink">Terms &amp; UK Subscription Rules</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li>
              <strong className="text-ink">Household Pro:</strong> Monthly (£2.99) and annual (£24.99) plans include a 7-day free trial and auto-renew until cancelled. Cancel anytime in two taps under <em>More → Household Pro → Manage subscription</em>.
            </li>
            <li>
              <strong className="text-ink">Lifetime Founder Pass:</strong> One-off £39.99 payment for your household, including a fair-use allowance of 60 AI scans per month.
            </li>
            <li>
              <strong className="text-ink">Payments:</strong> Processed securely by Stripe. We never see or store your card details.
            </li>
            <li>
              <strong className="text-ink">UK cooling-off rights:</strong> You may cancel within 14 days under UK consumer law; starting immediate Pro digital access during the 7-day trial carries no charge if cancelled before the trial ends.
            </li>
          </ul>
        </section>

        <section className="rounded-2xl border border-tomato/35 bg-tomato-soft/35 p-4">
          <h3 className="flex items-center gap-1.5 font-display text-[16px] font-semibold text-ink">
            <AlertTriangle className="h-4 w-4 text-tomato" /> Allergy &amp; Food Safety Disclaimer
          </h3>
          <p className="mt-1.5">
            Diet filters, avoid lists, cost estimates, and AI Chef suggestions are convenience guides based on ingredient names only — <strong className="text-ink">never a medical or allergen guarantee</strong>. Always check food packaging labels for allergens and cook all meat, poultry, fish, and reheated leftovers thoroughly to safe UK Food Standards Agency temperatures.
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-card p-4">
          <h3 className="font-display text-[16px] font-semibold text-ink">UK ASA Affiliate Disclosure</h3>
          <p className="mt-1.5">
            Links to UK delivery platforms, supermarkets, and recipe boxes (including Just Eat, Deliveroo, Uber Eats, Gousto, HelloFresh, Mindful Chef, and supermarkets) marked <strong className="text-ink">Ad</strong> or <strong className="text-ink">Partner links</strong> may earn Dinner Spinner a small referral commission at no extra cost to you.
          </p>
        </section>

        <section className="rounded-2xl border border-line bg-sunk/55 p-4">
          <h3 className="font-display text-[16px] font-semibold text-ink">Your Data Rights &amp; Contact</h3>
          <p className="mt-1">
            Questions, data requests, or billing help: <strong className="text-ink">hello@dinnerspinner.uk</strong>. You can export a full JSON copy anytime under <em>More → Backup and restore</em>, or erase your data below.
          </p>

          {deletedMsg && (
            <p className="mt-3 flex items-center gap-1.5 rounded-xl bg-sage-soft/70 px-3 py-2 text-[13px] font-medium text-sage">
              <Check className="h-4 w-4 shrink-0" /> {deletedMsg}
            </p>
          )}
          {deleteErr && (
            <p role="alert" className="mt-3 rounded-xl bg-tomato-soft/70 px-3 py-2 text-[13px] text-tomato">
              {deleteErr}
            </p>
          )}

          {!confirmDelete ? (
            <Button
              variant="secondary"
              size="sm"
              className="mt-3 border-tomato/35 text-tomato hover:bg-tomato-soft/60"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="h-4 w-4" /> Erase my household &amp; local data
            </Button>
          ) : (
            <div className="mt-3 rounded-xl border border-tomato/40 bg-tomato-soft/45 p-3">
              <p className="text-[12.5px] font-semibold text-ink">
                Are you sure? This permanently erases synced family lists on our server and clears this device.
              </p>
              <div className="mt-2.5 flex gap-2">
                <Button variant="primary" size="sm" disabled={deleting} onClick={handleDeleteAll}>
                  {deleting ? 'Erasing…' : 'Yes, erase everything'}
                </Button>
                <Button variant="secondary" size="sm" disabled={deleting} onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Sheet>
  );
};
