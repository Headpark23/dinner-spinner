import React from 'react';
import { Button, Sheet } from './ui';

interface RulesModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const steps = [
  {
    title: 'Set the evening',
    body: 'Pick how much time you have and how much washing-up you can face. Spin your own recipes, build a plate from three reels, or build a Sunday roast from four.',
  },
  {
    title: 'Use up the fridge',
    body: 'Mark anything that needs eating as “use next” in the Pantry. Turn on “use up first” and dishes that need those items become 4.5× likelier. Anything cooked in the last four days rests, so the week stays varied.',
  },
  {
    title: 'Hold, nudge, spin',
    body: 'Hold the reels you like and spin the rest. You get three nudges to step a reel along when it’s nearly right.',
  },
  {
    title: 'Put it to the household',
    body: 'Everyone votes on one phone. A majority yes agrees dinner and builds a timeline back from when you want to eat. Each person gets three vetoes a week.',
  },
  {
    title: 'Three vetoes, then takeaway',
    body: 'Three vetoes in a row closes the kitchen. The takeaway spinner picks where to order from and who answers the door.',
  },
];

export const RulesModal: React.FC<RulesModalProps> = ({ isOpen, onClose }) => (
  <Sheet
    isOpen={isOpen}
    onClose={onClose}
    title="How it works"
    subtitle="Dinner decided in under a minute."
    labelledBy="rules-title"
  >
    <ol className="space-y-4">
      {steps.map((s, i) => (
        <li key={s.title} className="flex gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink font-display text-[14px] font-semibold text-paper">
            {i + 1}
          </span>
          <div>
            <p className="text-[15px] font-semibold">{s.title}</p>
            <p className="mt-0.5 text-[14px] leading-relaxed text-ink-2">{s.body}</p>
          </div>
        </li>
      ))}
    </ol>

    <div className="mt-5 rounded-xl bg-sunk p-3 text-[13px] text-ink-2">
      <p className="mb-1.5 font-semibold text-ink">Keyboard</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        {[
          ['Space', 'Spin'],
          ['N', 'Nudge'],
          ['1–4', 'Hold a reel'],
          ['M', 'Sound on/off'],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center justify-between">
            <dt>{v}</dt>
            <dd>
              <kbd className="rounded-md border border-line-strong bg-card px-1.5 py-0.5 text-[12px] font-semibold text-ink">{k}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </div>

    <Button variant="primary" block className="mt-5" onClick={onClose}>
      Got it
    </Button>
  </Sheet>
);
