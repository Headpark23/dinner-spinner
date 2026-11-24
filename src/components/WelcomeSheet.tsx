import React, { useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { Button, Sheet, TextInput } from './ui';
import { DietPicker } from './DietPicker';
import { DIETS, DietId } from '../utils/diets';
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
  const [loves, setLoves] = useState('');
  const [diets, setDiets] = useState<DietId[]>([]);
  const [own, setOwn] = useState<DietId[][]>([]);
  const toggleOwn = (i: number, id: DietId) =>
    setOwn((prev) => {
      const next = [...prev];
      const cur = next[i] ?? [];
      next[i] = cur.includes(id) ? cur.filter((d) => d !== id) : [...cur, id];
      return next;
    });

  const finish = () =>
    completeOnboarding(
      names,
      avoid.split(',').map((a) => a.trim()),
      diets,
      loves.split(',').map((a) => a.trim()),
      own
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
              <div key={i} className="space-y-1.5">
              <TextInput
                aria-label={`Person ${i + 1}`}
                value={i === 0 && !n && firstName ? firstName : n}
                maxLength={30}
                placeholder={i === 0 ? 'Your name' : 'Another person'}
                onChange={(e) => setNames((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
              />
              {(n || (i === 0 && firstName)) && (
                <details className="text-[13px]">
                  <summary className="cursor-pointer py-1 text-ink-2">Their own diet?{(own[i]?.length ?? 0) > 0 ? ` (${own[i]!.length})` : ''}</summary>
                  <div className="flex flex-wrap gap-1.5 pt-1" role="group" aria-label={`Diets for person ${i + 1}`}>
                    {DIETS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        aria-pressed={own[i]?.includes(d.id) ?? false}
                        onClick={() => toggleOwn(i, d.id)}
                        className={`min-h-9 rounded-lg border px-2.5 font-semibold ${own[i]?.includes(d.id) ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink'}`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </details>
              )}
              </div>
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
            <label htmlFor="loves" className="text-[15px] font-semibold">
              Anything you love?
            </label>
            <TextInput id="loves" value={loves} onChange={(e) => setLoves(e.target.value)} placeholder="e.g. chilli, salmon, cheese" />
            <p className="text-[13px] text-ink-2">We’ll fill your recipes with more dishes built on these.</p>
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
