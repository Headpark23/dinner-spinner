import React, { useEffect, useState } from 'react';
import { useDinner } from '../../context/DinnerContext';
import { Copy, Check, Plus, Pencil, Dices, DoorOpen } from 'lucide-react';
import { Button, Card, Notice, Select, TextInput, cx, cuisineColor } from '../ui';

export const TakeawayView: React.FC = () => {
  const {
    takeaways,
    winningTakeaway,
    doorDutyPerson,
    householdMembers,
    isTakeawaySpinning,
    spinTakeaway,
    takeawayOverrideActive,
    setTakeawayOverrideActive,
    updateUsualOrder,
    addTakeawayOption,
    recordTakeawayOrdered,
    takeawayLog,
  } = useDinner();

  const [copied, setCopied] = useState(false);
  const [editingMember, setEditingMember] = useState<string | null>(null);
  const [tempOrderText, setTempOrderText] = useState('');
  const [showAddSpot, setShowAddSpot] = useState(false);
  const [newSpotName, setNewSpotName] = useState('');
  const [newSpotCategory, setNewSpotCategory] = useState('Indian');
  const [newSpotBadge, setNewSpotBadge] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!isTakeawaySpinning) return;
    const interval = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(interval);
  }, [isTakeawaySpinning]);

  const orderedToday =
    winningTakeaway &&
    takeawayLog.some(
      (l) => l.takeawayId === winningTakeaway.id && Date.now() - new Date(l.date).getTime() < 12 * 3600 * 1000
    );

  const handleCopyOrders = async () => {
    if (!winningTakeaway) return;
    const lines = [
      `Takeaway: ${winningTakeaway.name}`,
      `Door duty: ${doorDutyPerson?.name || 'whoever is nearest'}`,
      '',
      ...winningTakeaway.usualOrders.map((uo) => `${uo.memberName}: ${uo.order}`),
    ];
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable; nothing else to do.
    }
  };

  const saveOrder = (memberName: string) => {
    if (!winningTakeaway) return;
    updateUsualOrder(winningTakeaway.id, memberName, tempOrderText.trim() || 'Surprise me');
    setEditingMember(null);
  };

  const shownSpot = isTakeawaySpinning ? takeaways[tick % takeaways.length] : winningTakeaway;
  const shownPerson = isTakeawaySpinning
    ? householdMembers[(tick * 3) % householdMembers.length]
    : doorDutyPerson;

  return (
    <div className="space-y-4">
      {takeawayOverrideActive && (
        <Notice tone="tomato">
          <strong className="font-semibold">The kitchen’s closed.</strong> Three vetoes in a row, so it’s takeaway
          tonight.{' '}
          <button onClick={() => setTakeawayOverrideActive(false)} className="font-semibold underline">
            Reopen the kitchen
          </button>
        </Notice>
      )}

      <div>
        <h1 className="font-display text-[28px] leading-tight font-semibold">Takeaway</h1>
        <p className="mt-1 text-[14px] text-ink-2">Spin for where to order from, and who answers the door.</p>
      </div>

      <div className="rounded-[22px] bg-enamel p-3 text-on-enamel ring-1 ring-line">
        <div className="grid grid-cols-[2fr_1fr] gap-2">
          <div className="reel-window relative flex h-[120px] flex-col items-center justify-center overflow-hidden rounded-2xl px-3 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-on-enamel-2">Order from</span>
            <span
              key={isTakeawaySpinning ? undefined : shownSpot?.id}
              className={cx(
                'mt-1.5 font-display text-[20px] leading-tight font-semibold line-clamp-2',
                isTakeawaySpinning ? 'text-on-enamel/70 blur-[0.6px]' : 'reel-settle'
              )}
            >
              {shownSpot?.name ?? 'Ready'}
            </span>
            {!isTakeawaySpinning && shownSpot && (
              <span className="mt-1 text-[12px] text-on-enamel-2">{shownSpot.category}</span>
            )}
          </div>
          <div className="reel-window relative flex h-[120px] flex-col items-center justify-center overflow-hidden rounded-2xl px-2 text-center">
            <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-on-enamel-2">Door duty</span>
            <span
              className={cx(
                'mt-1.5 font-display text-[20px] font-semibold',
                isTakeawaySpinning ? 'text-on-enamel/70 blur-[0.6px]' : 'reel-settle text-brass'
              )}
            >
              {shownPerson?.name ?? '—'}
            </span>
          </div>
        </div>
      </div>

      <Button variant="primary" size="lg" block onClick={spinTakeaway} disabled={isTakeawaySpinning}>
        <Dices className={cx('h-5 w-5', isTakeawaySpinning && 'animate-spin')} />
        {isTakeawaySpinning ? 'Spinning…' : 'Spin for takeaway'}
      </Button>

      {winningTakeaway && !isTakeawaySpinning && (
        <Card className="fade-up p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span
                aria-hidden="true"
                className="h-10 w-1.5 shrink-0 rounded-full"
                style={{ background: cuisineColor(winningTakeaway.category) }}
              />
              <div className="min-w-0">
                <h2 className="font-display text-[21px] leading-tight font-semibold">{winningTakeaway.name}</h2>
                <p className="text-[13px] text-ink-2">
                  {winningTakeaway.category}
                  {winningTakeaway.badge ? ` · ${winningTakeaway.badge}` : ''}
                  {winningTakeaway.orderCount ? ` · ordered ${winningTakeaway.orderCount}×` : ''}
                </p>
              </div>
            </div>
          </div>

          {doorDutyPerson && (
            <p className="mt-3 flex items-center gap-2 rounded-xl bg-sunk px-3 py-2 text-[14px]">
              <DoorOpen className="h-4 w-4 text-ink-2" />
              <span>
                <strong className="font-semibold">{doorDutyPerson.name}</strong> answers the door
              </span>
            </p>
          )}

          <h3 className="mt-4 text-[15px] font-semibold">The usual orders</h3>
          <ul className="mt-1 divide-y divide-line">
            {winningTakeaway.usualOrders.map((uo) => {
              const isEditing = editingMember === uo.memberName;
              return (
                <li key={uo.memberName} className="py-2.5">
                  {isEditing ? (
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        saveOrder(uo.memberName);
                      }}
                    >
                      <TextInput
                        autoFocus
                        value={tempOrderText}
                        onChange={(e) => setTempOrderText(e.target.value)}
                        aria-label={`${uo.memberName}'s usual order`}
                      />
                      <Button type="submit" variant="secondary">
                        Save
                      </Button>
                    </form>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 text-[14px]">
                        <span className="font-semibold">{uo.memberName}</span>
                        <span className="block text-ink-2">{uo.order}</span>
                      </div>
                      <button
                        onClick={() => {
                          setEditingMember(uo.memberName);
                          setTempOrderText(uo.order);
                        }}
                        aria-label={`Edit ${uo.memberName}'s order`}
                        className="rounded-lg p-2 text-ink-3 hover:bg-sunk hover:text-ink"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={handleCopyOrders}>
              {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy order'}
            </Button>
            <Button
              variant={orderedToday ? 'secondary' : 'success'}
              disabled={!!orderedToday}
              onClick={() => recordTakeawayOrdered(winningTakeaway.id)}
            >
              <Check className="h-4 w-4" />
              {orderedToday ? 'Logged' : 'We ordered'}
            </Button>
          </div>
        </Card>
      )}

      <div className="border-t border-line pt-3">
        <button
          onClick={() => setShowAddSpot((v) => !v)}
          aria-expanded={showAddSpot}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink"
        >
          <Plus className="h-4 w-4" /> {showAddSpot ? 'Cancel' : `Add a local spot (${takeaways.length} on the reel)`}
        </button>
        {showAddSpot && (
          <form
            className="fade-up mt-3 space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newSpotName.trim()) return;
              addTakeawayOption(newSpotName, newSpotCategory, newSpotBadge);
              setNewSpotName('');
              setNewSpotBadge('');
              setShowAddSpot(false);
            }}
          >
            <TextInput
              value={newSpotName}
              onChange={(e) => setNewSpotName(e.target.value)}
              placeholder="Name, e.g. The Golden Wok"
              aria-label="Takeaway name"
            />
            <div className="grid grid-cols-2 gap-2">
              <Select value={newSpotCategory} onChange={(e) => setNewSpotCategory(e.target.value)} aria-label="Cuisine">
                {['Indian', 'Chinese', 'Italian', 'Fish & Chips', 'Burgers', 'Fried Chicken', 'Thai'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
              <TextInput
                value={newSpotBadge}
                onChange={(e) => setNewSpotBadge(e.target.value)}
                placeholder="Known for…"
                aria-label="Known for"
              />
            </div>
            <Button type="submit" variant="primary" block disabled={!newSpotName.trim()}>
              Add to the reel
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
