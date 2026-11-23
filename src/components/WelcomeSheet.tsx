import React, { useState } from 'react';
import { Dices, ThumbsUp, ChefHat, Star, Trash2, UserPlus, UtensilsCrossed, BookOpen, ShoppingBasket, Refrigerator } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Sheet, TextInput } from './ui';
import { MemberAvatar } from './views/VotingView';

export const WELCOME_KEY = 'ds_welcomed_v1';

export const hasSeenWelcome = (): boolean => {
  try {
    return localStorage.getItem(WELCOME_KEY) === '1';
  } catch {
    return true; // storage blocked: never nag
  }
};

const markSeen = () => {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    // nothing to do
  }
};

const FLOW = [
  { icon: Dices, title: 'Pick', body: 'Spin for a dish that fits your time, or build a plate.' },
  { icon: ThumbsUp, title: 'Vote', body: 'Everyone votes on one phone. Vetoes send it back.' },
  { icon: ChefHat, title: 'Cook', body: 'A timeline counts back from when you want to eat.' },
  { icon: Star, title: 'Rate', body: 'Rate it so the spinner learns what you like.' },
];

const TABS = [
  { icon: UtensilsCrossed, title: 'Dinner', body: 'Tonight, step by step' },
  { icon: BookOpen, title: 'Recipes', body: 'Yours and 119 world classics' },
  { icon: ShoppingBasket, title: 'Shopping', body: 'One shared list' },
  { icon: Refrigerator, title: 'Fridge', body: 'Use up what you have' },
];

/** Two quick steps for a first launch: what this is, then who's eating. Shown once. */
export const WelcomeSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { householdMembers, addHouseholdMember, removeHouseholdMember } = useDinner();
  const [step, setStep] = useState<0 | 1>(0);
  const [name, setName] = useState('');

  const finish = () => {
    markSeen();
    setStep(0);
    onClose();
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={finish}
      title={step === 0 ? 'Dinner decided in a minute' : 'Who’s eating?'}
      subtitle={step === 0 ? 'Here’s how it works.' : 'These are the people who vote. Change them any time in More.'}
      labelledBy="welcome-title"
    >
      {step === 0 ? (
        <div className="space-y-5">
          <ol className="space-y-3">
            {FLOW.map((f, i) => (
              <li key={f.title} className="flex items-center gap-3.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-tomato-soft text-tomato">
                  <f.icon className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold">
                    {i + 1}. {f.title}
                  </span>
                  <span className="block text-[13px] leading-snug text-ink-2">{f.body}</span>
                </span>
              </li>
            ))}
          </ol>

          <div className="rounded-2xl bg-sunk p-3.5">
            <p className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-ink-3">Along the bottom</p>
            <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {TABS.map((t) => (
                <li key={t.title} className="flex items-start gap-2">
                  <t.icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" />
                  <span className="text-[13px] leading-tight">
                    <span className="block font-semibold">{t.title}</span>
                    <span className="text-ink-2">{t.body}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <Button variant="primary" size="lg" block onClick={() => setStep(1)}>
            Next
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
            {householdMembers.map((m) => (
              <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                <MemberAvatar member={m} size={32} />
                <span className="flex-1 text-[15px] font-medium">{m.name}</span>
                {householdMembers.length > 1 && (
                  <button
                    onClick={() => removeHouseholdMember(m.id)}
                    aria-label={`Remove ${m.name}`}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-ink-3 hover:bg-sunk hover:text-tomato"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              addHouseholdMember(name, '');
              setName('');
            }}
          >
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Add someone" aria-label="New household member name" />
            <Button type="submit" variant="secondary" disabled={!name.trim()}>
              <UserPlus className="h-4 w-4" /> Add
            </Button>
          </form>

          <div className="grid grid-cols-[auto_1fr] gap-2 pt-1">
            <Button variant="quiet" onClick={() => setStep(0)}>
              Back
            </Button>
            <Button variant="primary" size="lg" onClick={finish}>
              <Dices className="h-5 w-5" /> Spin my first dinner
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
};
