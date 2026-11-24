import React, { useState } from 'react';
import { Heart, Ban, X, Plus } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Card, Segmented, TextInput, cx } from './ui';

/** Household likes (favoured when spinning) and dislikes (never spun), shared by every phone. */
export const TastesPanel: React.FC = () => {
  const { likedIngredients, bannedIngredients, likeIngredient, avoidIngredient, clearTaste, tastesOnline } = useDinner();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'like' | 'avoid'>('like');

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (kind === 'like') likeIngredient(name);
    else avoidIngredient(name);
    setName('');
  };

  const list = (
    items: string[],
    tone: 'sage' | 'tomato',
    empty: string,
    moveLabel: string,
    move: (n: string) => void
  ) =>
    items.length === 0 ? (
      <p className="text-[14px] text-ink-3">{empty}</p>
    ) : (
      <ul className="flex flex-wrap gap-1.5">
        {items.map((ing) => (
          <li
            key={ing}
            className={cx(
              'inline-flex items-center gap-0.5 rounded-full py-1 pr-1 pl-3 text-[14px]',
              tone === 'sage' ? 'bg-sage-soft text-sage' : 'bg-tomato-soft text-tomato'
            )}
          >
            <button onClick={() => move(ing)} title={moveLabel} aria-label={`${ing}: ${moveLabel}`} className="font-medium">
              {ing}
            </button>
            <button onClick={() => clearTaste(ing)} aria-label={`Remove ${ing}`} className="rounded-full p-1 opacity-70 hover:opacity-100">
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="space-y-3">
      <form onSubmit={add} className="space-y-2">
        <Segmented<'like' | 'avoid'>
          label="Like or dislike"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'like', label: 'We like it' },
            { value: 'avoid', label: 'Never again' },
          ]}
        />
        <div className="flex gap-2">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === 'like' ? 'e.g. Halloumi' : 'e.g. Olives'}
            aria-label={kind === 'like' ? 'Ingredient you like' : 'Ingredient to avoid'}
          />
          <Button type="submit" variant={kind === 'like' ? 'success' : 'danger'} disabled={!name.trim()}>
            <Plus className="h-4 w-4" /> Add
          </Button>
        </div>
      </form>

      <Card className="space-y-2 p-4">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Heart className="h-4 w-4 fill-sage text-sage" /> Likes
          <span className="font-normal text-ink-3 tabular-nums">{likedIngredients.length}</span>
        </h3>
        <p className="text-[13px] text-ink-2">Dishes with these come up more often when you spin.</p>
        {list(likedIngredients, 'sage', 'Nothing yet. Add a favourite ingredient above.', 'Move to never again', avoidIngredient)}
      </Card>

      <Card className="space-y-2 p-4">
        <h3 className="flex items-center gap-2 text-[15px] font-semibold">
          <Ban className="h-4 w-4 text-tomato" /> Dislikes
          <span className="font-normal text-ink-3 tabular-nums">{bannedIngredients.length}</span>
        </h3>
        <p className="text-[13px] text-ink-2">The spinner will never land on a dish containing these.</p>
        {list(bannedIngredients, 'tomato', 'Nothing on the list.', 'Move to likes', likeIngredient)}
      </Card>

      <p className="text-center text-[12px] text-ink-3">
        {tastesOnline === false
          ? 'Offline. Changes reach the rest of the household when you’re back.'
          : 'Shared with everyone in the household. Tap a name to move it to the other list.'}
      </p>
    </div>
  );
};
