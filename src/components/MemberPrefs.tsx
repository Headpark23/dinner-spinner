import React, { useState } from 'react';
import { Check, X } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { DIETS, DietId } from '../utils/diets';
import { DietMode } from '../utils/memberDiets';
import { Button, Segmented, TextInput, cx } from './ui';

const PersonRow: React.FC<{ id: string; name: string; diets: DietId[]; avoid: string[] }> = ({ id, name, diets, avoid }) => {
  const { setMemberPrefs } = useDinner();
  const [word, setWord] = useState('');
  const toggle = (d: DietId) => setMemberPrefs(id, { diets: diets.includes(d) ? diets.filter((x) => x !== d) : [...diets, d], avoid });
  const add = () => {
    const w = word.trim();
    if (!w) return;
    setMemberPrefs(id, { diets, avoid: [...avoid, w] });
    setWord('');
  };
  return (
    <li className="space-y-2 rounded-xl border border-line p-3">
      <p className="text-[15px] font-semibold">{name}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${name}'s diets`}>
        {DIETS.map((d) => {
          const on = diets.includes(d.id);
          return (
            <button
              key={d.id}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(d.id)}
              className={cx(
                'inline-flex min-h-9 items-center gap-1 rounded-lg border px-2.5 text-[13px] font-semibold transition-colors',
                on ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink hover:border-line-strong'
              )}
            >
              {on && <Check className="h-3 w-3" strokeWidth={3} />}
              {d.label}
            </button>
          );
        })}
      </div>
      {diets.includes('nut-free') && (
        <p className="text-[13px] text-tomato">For a nut allergy, read every label and recipe yourself. This only reads ingredient names.</p>
      )}
      {avoid.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {avoid.map((a) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => setMemberPrefs(id, { diets, avoid: avoid.filter((x) => x !== a) })}
                aria-label={`Stop avoiding ${a} for ${name}`}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-sunk px-2.5 text-[13px] font-medium text-ink"
              >
                {a}
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <TextInput value={word} onChange={(e) => setWord(e.target.value)} placeholder={`Ingredient ${name} avoids`} aria-label={`Ingredient ${name} avoids`} />
        <Button type="submit" variant="secondary" disabled={!word.trim()}>
          Add
        </Button>
      </form>
    </li>
  );
};

/** Each person's own diets and avoid list, plus whether those leave dishes out or only warn. */
export const MemberPrefs: React.FC = () => {
  const { householdMembers, dietMode, setDietMode } = useDinner();
  return (
    <div className="space-y-3">
      <p className="pt-2 text-[15px] font-semibold">Per person</p>
      <p className="text-[14px] text-ink-2">On top of the household diets above. Set what each person can’t or won’t eat.</p>
      <Segmented<DietMode>
        label="When someone can’t eat a dish"
        value={dietMode}
        onChange={setDietMode}
        options={[
          { value: 'skip', label: 'Skip it', hint: 'Leave it out of spins' },
          { value: 'warn', label: 'Just warn', hint: 'Keep it, name who it clashes with' },
        ]}
      />
      <ul className="space-y-2">
        {householdMembers.map((m) => (
          <PersonRow key={m.id} id={m.id} name={m.name} diets={m.diets ?? []} avoid={m.avoid ?? []} />
        ))}
      </ul>
      <p className="text-[13px] text-ink-2">
        This is a preference, not an allergy check. It reads ingredient names and can’t see hidden ingredients, so always
        check labels.
      </p>
    </div>
  );
};
