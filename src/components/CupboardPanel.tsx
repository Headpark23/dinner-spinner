import React, { useState } from 'react';
import { Plus, Trash2, Camera } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { CUPBOARD_CATEGORIES } from '../utils/household';
import { Button, Card, IconButton, Select, TextInput, cx } from './ui';

/** Tins, jars, sauces and dry goods, shared by the household like the shopping list. */
export const CupboardPanel: React.FC<{ onScan: () => void }> = ({ onScan }) => {
  const { cupboard, cupboardOnline, addCupboardItems, setCupboardLow, removeCupboardItem } = useDinner();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>('auto');
  const lowCount = cupboard.filter((c) => c.low).length;

  const groups = [...CUPBOARD_CATEGORIES, ...new Set(cupboard.map((c) => c.category))]
    .filter((cat, i, all) => all.indexOf(cat) === i)
    .map((cat) => ({
      cat,
      items: cupboard.filter((c) => c.category === cat).sort((a, b) => Number(b.low) - Number(a.low) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl bg-sunk px-3 py-2.5 text-[13px] text-ink-2">
        <span
          className={cx(
            'h-2 w-2 shrink-0 rounded-full',
            cupboardOnline ? 'bg-sage' : cupboardOnline === false ? 'bg-saffron' : 'bg-line-strong'
          )}
        />
        {cupboardOnline
          ? 'Shared with everyone in the household. Cupboard items count as in stock for recipes.'
          : cupboardOnline === false
          ? 'Offline. Changes sync when you’re back.'
          : 'Connecting…'}
      </div>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          addCupboardItems([{ name: name.trim(), category: category === 'auto' ? undefined : category }]);
          setName('');
        }}
      >
        <div className="flex gap-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coconut milk" aria-label="Add to the cupboard" />
          <Button type="submit" variant="primary" disabled={!name.trim()} aria-label="Add to the cupboard" className="!px-3">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Shelf" className="w-full">
          <option value="auto">Shelf: work it out for me</option>
          {CUPBOARD_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Select>
      </form>

      {cupboard.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-display text-[19px] font-semibold">The cupboard is empty</p>
          <p className="mt-1 text-[14px] text-ink-2">
            Add your tins, jars and sauces, or take a photo of the shelf and let the scanner list them.
          </p>
          <Button variant="secondary" className="mt-4" onClick={onScan}>
            <Camera className="h-4 w-4" /> Photo of the cupboard
          </Button>
        </Card>
      ) : (
        <>
          {lowCount > 0 && (
            <p className="px-1 text-[13px] text-saffron">
              {lowCount} running low {lowCount === 1 ? 'item is' : 'items are'} on the shopping list.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.cat} aria-label={g.cat}>
              <h3 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">
                {g.cat} <span className="font-normal text-ink-3 tabular-nums">{g.items.length}</span>
              </h3>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                {g.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
                    <div className="min-w-0 flex-1 py-1.5">
                      <p className="truncate text-[15px]">{item.name}</p>
                      <p className="truncate text-[12px] text-ink-3">
                        {[item.quantity, item.low ? `running low${item.lowBy ? ` · ${item.lowBy}` : ''}` : null]
                          .filter(Boolean)
                          .join(' · ') || 'In stock'}
                      </p>
                    </div>
                    <button
                      onClick={() => setCupboardLow(item.id, !item.low)}
                      aria-pressed={item.low}
                      title={item.low ? 'Restocked' : 'Running low: add to the shopping list'}
                      className={cx(
                        'h-9 shrink-0 rounded-lg px-2.5 text-[12px] font-semibold',
                        item.low ? 'bg-saffron-soft text-saffron' : 'bg-sage-soft text-sage'
                      )}
                    >
                      {item.low ? 'Running low' : 'In stock'}
                    </button>
                    <IconButton label={`Remove ${item.name}`} onClick={() => removeCupboardItem(item.id)}>
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <p className="text-center text-[12px] text-ink-3">Tap “In stock” when something’s running low and it goes on the shopping list.</p>
        </>
      )}
    </div>
  );
};
