import React, { useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { SHELVES } from '../utils/storeCupboard';
import { Button, Card, IconButton, Select, TextInput, cx } from './ui';

/** Tins, jars, sauces, spices and dry goods. Shared by the family group, like the shopping list. */
export const CupboardPanel: React.FC<{ onScan: () => void }> = ({ onScan }) => {
  const { cupboard, addCupboardItems, setCupboardLow, removeCupboardItem, householdCode, listsOnline } = useDinner();
  const [name, setName] = useState('');
  const [shelf, setShelf] = useState('auto');
  const low = cupboard.filter((c) => c.low).length;

  const groups = Array.from(new Set([...SHELVES, ...cupboard.map((c) => c.shelf)]))
    .map((s) => ({
      shelf: s,
      items: cupboard
        .filter((c) => c.shelf === s)
        .sort((a, b) => Number(!!b.low) - Number(!!a.low) || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 px-1 text-[13px] text-ink-2">
        <span
          className={cx(
            'h-2 w-2 shrink-0 rounded-full',
            !householdCode ? 'bg-line-strong' : listsOnline === false ? 'bg-saffron' : 'bg-sage'
          )}
        />
        {!householdCode
          ? 'On this phone only. Start a family group to share it.'
          : listsOnline === false
            ? 'Offline. Changes reach the family when you’re back.'
            : 'Shared with your family group. Cupboard items count as “have it” in recipes.'}
      </p>

      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          addCupboardItems([{ name: name.trim(), shelf: shelf === 'auto' ? undefined : shelf }]);
          setName('');
        }}
      >
        <div className="flex gap-2">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Coconut milk" aria-label="Add to the cupboard" />
          <Button type="submit" variant="primary" disabled={!name.trim()} aria-label="Add to the cupboard" className="!px-3">
            <Plus className="h-5 w-5" />
          </Button>
        </div>
        <Select value={shelf} onChange={(e) => setShelf(e.target.value)} aria-label="Shelf" className="w-full">
          <option value="auto">Shelf: work it out for me</option>
          {SHELVES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </form>

      {cupboard.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-display text-[19px] font-semibold">The cupboard is empty</p>
          <p className="mt-1 text-[14px] text-ink-2">Add your tins, jars and sauces, or photograph the shelf and let the scanner list them.</p>
          <Button variant="secondary" className="mt-4" onClick={onScan}>
            <Camera className="h-4 w-4" /> Photo of the cupboard
          </Button>
        </Card>
      ) : (
        <>
          {low > 0 && (
            <p className="px-1 text-[13px] font-semibold text-saffron">
              {low} running low {low === 1 ? 'is' : 'are'} on the shopping list.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.shelf} aria-label={g.shelf}>
              <h3 className="mb-1.5 px-1 text-[13px] font-semibold text-ink-2">
                {g.shelf} <span className="font-normal text-ink-3 tabular-nums">{g.items.length}</span>
              </h3>
              <ul className="divide-y divide-line rounded-2xl border border-line bg-card">
                {g.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 py-1 pr-1 pl-3">
                    <div className="min-w-0 flex-1 py-1.5">
                      <p className="truncate text-[15px]">{item.name}</p>
                      {(item.quantity || item.addedBy) && (
                        <p className="truncate text-[12px] text-ink-3">{[item.quantity, item.addedBy && `added by ${item.addedBy}`].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <button
                      onClick={() => setCupboardLow(item.id, !item.low)}
                      aria-pressed={!!item.low}
                      title={item.low ? 'Restocked' : 'Running low: put it on the shopping list'}
                      className={cx(
                        'h-10 shrink-0 rounded-lg px-2.5 text-[12px] font-semibold',
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
          <p className="text-center text-[12px] text-ink-3">Tap “In stock” when something runs low and it goes on the shopping list.</p>
        </>
      )}
    </div>
  );
};
