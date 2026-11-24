import React, { useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { Button, Sheet, TextInput } from './ui';
import { DietPicker } from './DietPicker';
import { DietId } from '../utils/diets';
import { FamilyStart } from './FamilyStart';

/**
 * Shown once, on a brand-new device. First the big idea (a family group, so everyone shares one list,
 * fridge and vote), then two quick questions so the vote, the door-duty spinner and the recipe pool
 * are about this household and nobody else's.
 */
export const WelcomeSheet: React.FC = () => {
  const { onboarded, completeOnboarding, householdCode, googleProfile } = useDinner();
  const [stage, setStage] = useState<'family' | 'details'>('family');
  const [names, setNames] = useState<string[]>(['', '']);
  const [avoid, setAvoid] = useState('');
  const [diets, setDiets] = useState<DietId[]>([]);

  const finish = () =>
    completeOnboarding(
      names,
      avoid.split(',').map((a) => a.trim()),
      diets
    );

  // Someone arriving from an invite link is already in a group; skip straight to the questions.
  const showFamily = stage === 'family' && !householdCode;
  const firstName = googleProfile?.name.split(' ')[0] || '';

  return (
    <Sheet
      isOpen={!onboarded}
      onClose={finish}
      title={showFamily ? 'Dinner, decided together' : 'Welcome to Dinner Spinner'}
      subtitle={
        showFamily
          ? 'Start a family group so everyone shares the list, the fridge and the vote.'
          : 'Spin for tonight’s dinner. Two quick questions first.'
      }
      labelledBy="welcome-title"
    >
      {showFamily ? (
        <div className="space-y-3">
          <FamilyStart
            onDone={() => {
              setStage('details');
            }}
          />
          <Button variant="quiet" block onClick={() => setStage('details')}>
            Just try it on this phone
          </Button>
          <p className="text-center text-[12px] text-ink-3">You can start or join a family group any time from More.</p>
        </div>
      ) : (
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
                value={i === 0 && !n && firstName ? firstName : n}
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

          <div className="space-y-1.5">
            <p className="text-[15px] font-semibold">Any diets in the house?</p>
            <DietPicker value={diets} onToggle={(id) => setDiets((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]))} />
          </div>

          <Button type="submit" variant="primary" block>
            Start spinning
          </Button>
        </form>
      )}
    </Sheet>
  );
};
