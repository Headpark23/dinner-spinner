import React, { useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { Button, Sheet, TextInput } from './ui';

/**
 * Shown once, on a brand-new device. Two quick questions so the vote, the door-duty
 * spinner and the recipe pool are about this household and nobody else's.
 */
export const WelcomeSheet: React.FC = () => {
  const { onboarded, completeOnboarding } = useDinner();
  const [names, setNames] = useState<string[]>(['', '']);
  const [avoid, setAvoid] = useState('');

  const finish = () =>
    completeOnboarding(
      names,
      avoid.split(',').map((a) => a.trim())
    );

  return (
    <Sheet
      isOpen={!onboarded}
      onClose={finish}
      title="Welcome to Dinner Spinner"
      subtitle="Spin for tonight’s dinner. Two quick questions first."
      labelledBy="welcome-title"
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          finish();
        }}
      >
        <fieldset className="space-y-2">
          <legend className="text-[15px] font-semibold">Who’s eating?</legend>
          <p className="text-[13px] text-ink-2">They’ll vote on dinner and take turns answering the door. You can change this later.</p>
          {names.map((n, i) => (
            <TextInput
              key={i}
              aria-label={`Person ${i + 1}`}
              value={n}
              maxLength={30}
              placeholder={i === 0 ? 'Your name' : 'Another person'}
              onChange={(e) => setNames((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
            />
          ))}
          {names.length < 6 && (
            <Button variant="quiet" size="sm" onClick={() => setNames((prev) => [...prev, ''])}>
              + Add another person
            </Button>
          )}
        </fieldset>

        <div className="space-y-1.5">
          <label htmlFor="avoid" className="text-[15px] font-semibold">
            Anything nobody will eat?
          </label>
          <TextInput
            id="avoid"
            value={avoid}
            onChange={(e) => setAvoid(e.target.value)}
            placeholder="e.g. peanuts, mushrooms, coriander"
          />
          <p className="text-[13px] text-ink-2">
            Separate with commas. Dishes containing these never come up. For serious allergies, always check the recipe
            yourself too.
          </p>
        </div>

        <Button type="submit" variant="primary" block>
          Start spinning
        </Button>
      </form>
    </Sheet>
  );
};
