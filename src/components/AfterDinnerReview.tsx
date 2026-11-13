import React, { useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { CookLogEntry, MealReview } from '../types';
import { Star, Check } from 'lucide-react';
import { Button, Card, TextInput, cx } from './ui';

const QUICK_COMMENTS = ['Make it again', 'Loved it', 'Too spicy', 'Bit bland', 'Too much effort', 'Kids ate it all'];

/** End-of-dinner verdicts: each person scores the dish and can leave a short comment. */
export const AfterDinnerReview: React.FC<{ entry: CookLogEntry }> = ({ entry }) => {
  const { householdMembers, saveDinnerReviews } = useDinner();
  const [draft, setDraft] = useState<Record<string, { stars: number; comment: string }>>(() =>
    Object.fromEntries((entry.reviews || []).map((r) => [r.memberId, { stars: r.stars, comment: r.comment || '' }]))
  );
  const [editing, setEditing] = useState(!entry.reviews?.length);

  const set = (memberId: string, patch: Partial<{ stars: number; comment: string }>) =>
    setDraft((prev) => ({ ...prev, [memberId]: { ...(prev[memberId] ?? { stars: 0, comment: '' }), ...patch } }));

  const reviews: MealReview[] = householdMembers
    .filter((m) => (draft[m.id]?.stars || 0) > 0)
    .map((m) => ({
      memberId: m.id,
      memberName: m.name,
      stars: draft[m.id].stars,
      comment: draft[m.id].comment.trim() || undefined,
    }));
  const avg = reviews.length ? reviews.reduce((a, r) => a + r.stars, 0) / reviews.length : 0;

  if (!editing && entry.reviews?.length) {
    const saved = entry.reviews;
    const savedAvg = saved.reduce((a, r) => a + r.stars, 0) / saved.length;
    return (
      <Card className="fade-up p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">The verdict</h2>
          <span className="font-display text-[22px] font-semibold tabular-nums">{savedAvg.toFixed(1)} ★</span>
        </div>
        <ul className="mt-2 space-y-1.5 text-[14px]">
          {saved.map((r) => (
            <li key={r.memberId}>
              <span className="font-semibold">{r.memberName}</span>{' '}
              <span className="text-saffron">{'★'.repeat(r.stars)}</span>
              {r.comment && <span className="text-ink-2"> · {r.comment}</span>}
            </li>
          ))}
        </ul>
        <button onClick={() => setEditing(true)} className="mt-3 text-[13px] font-semibold text-ink-2 hover:text-ink">
          Change scores
        </button>
      </Card>
    );
  }

  return (
    <Card className="fade-up p-4">
      <h2 className="text-[15px] font-semibold">How was it?</h2>
      <p className="text-[13px] text-ink-2">Everyone scores it. The average becomes the dish’s rating.</p>
      <ul className="mt-3 space-y-4">
        {householdMembers.map((m) => {
          const d = draft[m.id] || { stars: 0, comment: '' };
          return (
            <li key={m.id}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-semibold">{m.name}</span>
                <div className="flex" role="radiogroup" aria-label={`${m.name}'s score`}>
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      role="radio"
                      aria-checked={d.stars === s}
                      aria-label={`${s} star${s > 1 ? 's' : ''}`}
                      onClick={() => set(m.id, { stars: d.stars === s ? 0 : s })}
                      className="flex h-10 w-9 items-center justify-center"
                    >
                      <Star
                        className={cx('h-6 w-6', s <= d.stars ? 'fill-saffron text-saffron' : 'text-line-strong')}
                        strokeWidth={1.5}
                      />
                    </button>
                  ))}
                </div>
              </div>
              {d.stars > 0 && (
                <div className="fade-up mt-1.5 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_COMMENTS.map((c) => (
                      <button
                        key={c}
                        onClick={() => set(m.id, { comment: d.comment === c ? '' : c })}
                        aria-pressed={d.comment === c}
                        className={cx(
                          'h-8 rounded-full border px-3 text-[12px] font-medium',
                          d.comment === c ? 'border-ink bg-ink text-paper' : 'border-line text-ink-2'
                        )}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <TextInput
                    value={QUICK_COMMENTS.includes(d.comment) ? '' : d.comment}
                    onChange={(e) => set(m.id, { comment: e.target.value })}
                    placeholder="Or say it in your own words"
                    aria-label={`${m.name}'s comment`}
                    maxLength={140}
                    className="h-10 text-[14px]"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <Button
        variant="primary"
        block
        className="mt-4"
        disabled={reviews.length === 0}
        onClick={() => {
          saveDinnerReviews(entry.id, reviews);
          setEditing(false);
        }}
      >
        <Check className="h-4 w-4" />
        {reviews.length === 0 ? 'Score it to save' : `Save the verdict · ${avg.toFixed(1)} ★`}
      </Button>
    </Card>
  );
};
