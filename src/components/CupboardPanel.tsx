import React, { useState } from 'react';
import { Camera, Plus, Trash2 } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { itemIcon } from '../utils/itemIcon';
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
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-line/80 bg-sunk/70 px-3.5 py-2.5 text-[13px] text-ink-2">
        <span className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              'h-2 w-2 shrink-0 rounded-full',
              !householdCode ? 'bg-line-strong' : listsOnline === false ? 'bg-saffron' : 'bg-sage'
            )}
          />
          <span className="truncate">
            {!householdCode
              ? 'On this phone only. Start a family group to share.'
              : listsOnline === false
                ? 'Offline. Changes sync when you’re back.'
                : 'Shared with your family · Stocked items count in recipes'}
          </span>
        </span>
        <button
          type="button"
          onClick={onScan}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2.5 py-1 text-[12px] font-semibold text-tomato ring-1 ring-line hover:border-line-strong"
        >
          <Camera className="h-3.5 w-3.5" /> Scan shelf
        </button>
      </div>

      <Card as="div" className="p-3.5">
        <form
          className="space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            addCupboardItems([{ name: name.trim(), shelf: shelf === 'auto' ? undefined : shelf }]);
            setName('');
          }}
        >
          <div className="flex gap-2">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Add e.g. Coconut milk, Passata, Cumin…" aria-label="Add to the cupboard" />
            <Button type="submit" variant="primary" disabled={!name.trim()} aria-label="Add to the cupboard" className="!px-3.5">
              <Plus className="h-5 w-5" />
            </Button>
          </div>
          <Select value={shelf} onChange={(e) => setShelf(e.target.value)} aria-label="Shelf" className="w-full !h-10 !text-[13.5px]">
            <option value="auto">Shelf: work it out automatically</option>
            {SHELVES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </form>
      </Card>

      {cupboard.length === 0 ? (
        <Card className="p-7 text-center">
          <p className="font-display text-[21px] font-semibold">The store cupboard is empty</p>
          <p className="mx-auto mt-1.5 max-w-[300px] text-[14px] leading-relaxed text-ink-2">
            Add your tins, jars, pasta and spices, or photograph an open shelf and let the scanner list them.
          </p>
          <Button variant="secondary" className="mt-4" onClick={onScan}>
            <Camera className="h-4 w-4 text-tomato" /> Photograph a shelf
          </Button>
        </Card>
      ) : (
        <>
          {low > 0 && (
            <p className="rounded-xl border border-saffron/20 bg-saffron-soft px-3.5 py-2 text-[13px] font-semibold text-saffron">
              {low} running low {low === 1 ? 'item is' : 'items are'} on the shopping list.
            </p>
          )}
          {groups.map((g) => (
            <section key={g.shelf} aria-label={g.shelf}>
              <h3 className="mb-1.5 flex items-baseline justify-between px-1 text-[13px] font-semibold text-ink-2">
                <span>{g.shelf}</span>
                <span className="font-normal text-ink-3 tabular-nums">{g.items.length}</span>
              </h3>
              <ul className="editorial-card divide-y divide-line overflow-hidden rounded-[20px] border border-line/90 bg-card">
                {g.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2.5 py-1.5 pr-1.5 pl-3">
                    <span
                      aria-hidden="true"
                      className={cx(
                        'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sunk text-[18px] leading-none',
                        item.low && 'opacity-65'
                      )}
                    >
                      {itemIcon(item.name)}
                    </span>
                    <div className="min-w-0 flex-1 py-1">
                      <p className="truncate text-[15px] font-medium">{item.name}</p>
                      {(item.quantity || item.addedBy) && (
                        <p className="truncate text-[12px] text-ink-3">
                          {[item.quantity, item.addedBy && `added by ${item.addedBy}`].filter(Boolean).join(' · ')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => setCupboardLow(item.id, !item.low)}
                      aria-pressed={!!item.low}
                      title={item.low ? 'Restocked' : 'Running low: put it on the shopping list'}
                      className={cx(
                        'h-9 shrink-0 rounded-full px-3 text-[12px] font-semibold transition-colors',
                        item.low
                          ? 'bg-saffron-soft text-saffron ring-1 ring-saffron/20'
                          : 'bg-sage-soft text-sage ring-1 ring-sage/15'
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
          <p className="text-center text-[12px] text-ink-3">Tap “In stock” when something runs low and it goes straight on the shopping list.</p>
        </>
      )}
    </div>
  );
};
