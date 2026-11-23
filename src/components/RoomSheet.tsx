import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Sheet } from './ui';

/** Start, join or leave a shared voting room so everyone can vote from their own phone. */
export const RoomSheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { roomCode, roomError, createRoom, joinRoom, leaveRoom, householdMembers, meId, setMeId } = useDinner();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const run = async (fn: () => Promise<boolean>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Join our Dinner Spinner vote: ${window.location.origin} then More, Vote on your own phone, code ${roomCode}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Vote on your own phones"
      subtitle="Everyone joins one room and votes from their own phone."
      labelledBy="room-sheet-title"
    >
      {roomCode ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-sunk p-4 text-center">
            <p className="text-[13px] text-ink-2">Room code</p>
            <p className="font-display text-[40px] font-bold tracking-[0.2em]" aria-label={`Room code ${roomCode.split('').join(' ')}`}>
              {roomCode}
            </p>
            <button onClick={copy} className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink">
              {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy invite'}
            </button>
          </div>

          <label className="block text-[14px]">
            <span className="mb-1 block font-semibold">Who are you on this phone?</span>
            <select
              value={meId}
              onChange={(e) => setMeId(e.target.value)}
              className="w-full rounded-xl border border-line bg-card px-3 py-3 text-[15px]"
            >
              <option value="">Choose…</option>
              {householdMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[13px] leading-snug text-ink-2">
            Tonight’s dinner, votes and vetoes now stay in step on every phone in the room. Keep the app open while you vote.
          </p>
          <Button block variant="quiet" onClick={leaveRoom}>
            Leave room
          </Button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="space-y-2">
            <Button block variant="primary" size="lg" disabled={busy} onClick={() => run(createRoom)}>
              Start a room
            </Button>
            <p className="text-[13px] leading-snug text-ink-2">You get a 4-letter code. Others type it in to join, and their phone takes on your household.</p>
          </div>

          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => joinRoom(code));
            }}
          >
            <label className="block text-[14px] font-semibold" htmlFor="room-code-input">
              Or join with a code
            </label>
            <div className="flex gap-2">
              <input
                id="room-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4))}
                placeholder="ABCD"
                autoCapitalize="characters"
                autoComplete="off"
                inputMode="text"
                className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-3 text-center font-display text-[22px] font-bold tracking-[0.3em]"
              />
              <Button type="submit" variant="secondary" disabled={busy || code.length !== 4}>
                Join
              </Button>
            </div>
          </form>
        </div>
      )}
      {roomError && (
        <p role="alert" className="mt-3 text-[13px] text-tomato">
          {roomError}
        </p>
      )}
    </Sheet>
  );
};
