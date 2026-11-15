import React, { useRef, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { RefreshCw, Download, FileUp, CloudDownload, RotateCcw, CircleCheck, CircleAlert, Copy, Link2, LogOut } from 'lucide-react';
import { Button, Notice, Sheet, TextInput } from './ui';
import { checkBackup, BackupSummary } from '../utils/backup';

interface ProfileSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/** A copy waiting for the user to confirm before it replaces what is on this device. */
interface PendingReplace {
  source: 'server' | 'file';
  raw: unknown;
  summary: BackupSummary;
}

export const ProfileSyncModal: React.FC<ProfileSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    userProfile,
    updateUserProfile,
    syncWithCloud,
    fetchCloudSnapshot,
    importBackupData,
    resetToFactoryDefaults,
    householdCode,
    createHousehold,
    joinHousehold,
    leaveHousehold,
    isSyncing,
    meals,
    pantry,
    staples,
    takeaways,
    householdMembers,
    bannedIngredients,
    voteLogs,
    rescuedItemsCount,
    cookLog,
    takeawayLog,
  } = useDinner();

  const [status, setStatus] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [householdName, setHouseholdName] = useState(userProfile.name);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pending, setPending] = useState<PendingReplace | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lastSaved = userProfile.lastSyncedAt ? new Date(userProfile.lastSyncedAt) : null;
  const report = (res: { success: boolean; message: string }) =>
    setStatus({ type: res.success ? 'success' : 'error', text: res.message });

  const handleCreate = async () => {
    setStatus(null);
    setBusy(true);
    report(await createHousehold());
    setBusy(false);
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    setBusy(true);
    const res = await joinHousehold(joinCode);
    setBusy(false);
    report(res);
    if (res.success) setJoinCode('');
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(householdCode || '');
      setStatus({ type: 'success', text: 'Code copied. Paste it into the other phone.' });
    } catch {
      setStatus({ type: 'error', text: 'Couldn’t copy. Select the code and copy it by hand.' });
    }
  };

  const handleCopyInvite = async () => {
    const link = `${window.location.origin}/?join=${encodeURIComponent(householdCode || '')}`;
    try {
      await navigator.clipboard.writeText(link);
      setStatus({ type: 'success', text: 'Invite link copied. Send it to someone in your household.' });
    } catch {
      setStatus({ type: 'error', text: 'Couldn’t copy. Give them the code instead.' });
    }
  };

  const handleSync = async () => {
    setStatus(null);
    const ok = await syncWithCloud();
    setStatus(
      ok
        ? { type: 'success', text: 'Saved a copy for your household.' }
        : { type: 'error', text: 'Couldn’t save. Your data is still safe on this device.' }
    );
  };

  // Restore and Import never replace anything until the person has seen what will change.
  const handleRestore = async () => {
    setStatus(null);
    const res = await fetchCloudSnapshot();
    if (!res.success || !res.check || !res.check.ok) {
      setStatus({ type: 'error', text: res.message });
      return;
    }
    setPending({ source: 'server', raw: res.check.payload, summary: res.check.summary });
  };

  const handleExport = () => {
    const backup = {
      userProfile,
      meals,
      pantry,
      staples,
      takeaways,
      members: householdMembers,
      banned: bannedIngredients,
      voteLogs,
      rescuedItemsCount,
      cookLog,
      takeawayLog,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dinner-spinner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ type: 'success', text: 'Backup file downloaded.' });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5_000_000) {
      setStatus({ type: 'error', text: 'That file is too big to be a Dinner Spinner backup.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const check = checkBackup(JSON.parse(reader.result as string));
        if (!check.ok) {
          setStatus({ type: 'error', text: check.error });
          return;
        }
        setStatus(null);
        setPending({ source: 'file', raw: check.payload, summary: check.summary });
      } catch {
        setStatus({ type: 'error', text: 'That file isn’t a Dinner Spinner backup.' });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const applyPending = () => {
    if (!pending) return;
    report(importBackupData(pending.raw));
    setPending(null);
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title="Household & backup"
      subtitle="Everything is saved on this device as you go."
      labelledBy="backup-title"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImport}
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />

      <form
        className="space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          updateUserProfile({ name: householdName.trim() || 'Our kitchen' });
          setStatus({ type: 'success', text: 'Name saved.' });
        }}
      >
        <label htmlFor="household-name" className="text-[13px] font-semibold text-ink-2">
          Household name
        </label>
        <div className="flex gap-2">
          <TextInput id="household-name" value={householdName} onChange={(e) => setHouseholdName(e.target.value)} />
          <Button type="submit" variant="secondary" disabled={householdName.trim() === userProfile.name}>
            Save
          </Button>
        </div>
      </form>

      <dl className="mt-4 grid grid-cols-3 gap-2 rounded-xl bg-sunk p-3 text-center">
        <div>
          <dd className="font-display text-[20px] font-semibold tabular-nums">{meals.length}</dd>
          <dt className="text-[12px] text-ink-2">recipes</dt>
        </div>
        <div>
          <dd className="font-display text-[20px] font-semibold tabular-nums">{pantry.length}</dd>
          <dt className="text-[12px] text-ink-2">in the fridge</dt>
        </div>
        <div>
          <dd className="font-display text-[20px] font-semibold tabular-nums">{householdMembers.length}</dd>
          <dt className="text-[12px] text-ink-2">people</dt>
        </div>
      </dl>

      {status && (
        <Notice
          tone={status.type === 'success' ? 'sage' : 'tomato'}
          icon={status.type === 'success' ? <CircleCheck className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
          className="mt-4"
        >
          {status.text}
        </Notice>
      )}

      {pending && (
        <div className="mt-4 space-y-2 rounded-xl border border-line-strong p-3" role="alertdialog" aria-label="Confirm replace">
          <p className="text-[14px]">
            Replace what’s on this device with {pending.source === 'server' ? 'your household’s saved copy' : 'this backup file'}?
          </p>
          <p className="text-[13px] text-ink-2">
            Now: {meals.length} recipes, {pantry.length} fridge items, {householdMembers.length} people.
            <br />
            Incoming: {pending.summary.recipes} recipes, {pending.summary.fridge} fridge items,{' '}
            {pending.summary.people} people. This can’t be undone, so download a backup first if you’re unsure.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => setPending(null)}>
              Keep what I have
            </Button>
            <Button variant="danger" onClick={applyPending}>
              Replace
            </Button>
          </div>
        </div>
      )}

      <h3 className="mt-5 text-[15px] font-semibold">Share with other phones</h3>
      {householdCode ? (
        <div className="mt-1 space-y-2">
          <p className="text-[13px] text-ink-2">
            Sharing is on. Anyone with this code can see and change your shopping list and saved copy, so only give it to
            people in your household.
          </p>
          <p className="break-all rounded-xl bg-sunk p-3 font-mono text-[13px]" data-testid="household-code">
            {householdCode}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={handleCopyCode}>
              <Copy className="h-4 w-4" /> Copy code
            </Button>
            <Button variant="secondary" onClick={handleCopyInvite}>
              <Link2 className="h-4 w-4" /> Copy invite link
            </Button>
            {confirmLeave ? (
              <Button
                variant="danger"
                onClick={() => {
                  leaveHousehold();
                  setConfirmLeave(false);
                  setStatus({ type: 'success', text: 'Sharing is off on this phone. Your recipes are untouched.' });
                }}
              >
                Yes, stop sharing
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmLeave(true)}>
                <LogOut className="h-4 w-4" /> Stop sharing
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="mt-1 space-y-3">
          <p className="text-[13px] text-ink-2">
            Dinner Spinner works fine on one phone without this. Turn it on to share a shopping list and move your
            recipes between phones.
          </p>
          <Button variant="primary" block onClick={handleCreate} disabled={busy}>
            Start a shared household
          </Button>
          <form onSubmit={handleJoin} className="space-y-1.5">
            <label htmlFor="join-code" className="text-[13px] font-semibold text-ink-2">
              Or join one with its code
            </label>
            <div className="flex gap-2">
              <TextInput
                id="join-code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="h_…"
                autoComplete="off"
                autoCapitalize="none"
              />
              <Button type="submit" variant="secondary" disabled={busy || !joinCode.trim()}>
                Join
              </Button>
            </div>
          </form>
        </div>
      )}

      {householdCode && (
        <>
          <h3 className="mt-5 text-[15px] font-semibold">Saved copy</h3>
          <p className="text-[13px] text-ink-2">
            {lastSaved ? `Last saved ${lastSaved.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Not saved yet.'}{' '}
            Stored for your household, for moving between phones.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={handleSync} disabled={isSyncing}>
              <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Saving…' : 'Save copy'}
            </Button>
            <Button variant="secondary" onClick={handleRestore} disabled={isSyncing}>
              <CloudDownload className="h-4 w-4" /> Restore
            </Button>
          </div>
        </>
      )}

      <h3 className="mt-5 text-[15px] font-semibold">Backup file</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={handleExport}>
          <Download className="h-4 w-4" /> Download
        </Button>
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
          <FileUp className="h-4 w-4" /> Import
        </Button>
      </div>

      <div className="mt-6 border-t border-line pt-4">
        {confirmReset ? (
          <div className="space-y-2">
            <p className="text-[14px]">
              Replace everything with the starter recipes and an empty fridge? Your history on this device will be cleared.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setConfirmReset(false)}>
                Keep my data
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  resetToFactoryDefaults();
                  setConfirmReset(false);
                  setStatus({ type: 'success', text: 'Back to the starter kitchen.' });
                }}
              >
                Reset
              </Button>
            </div>
          </div>
        ) : (
          <Button variant="quiet" size="sm" onClick={() => setConfirmReset(true)}>
            <RotateCcw className="h-3.5 w-3.5" /> Start over with starter data
          </Button>
        )}
      </div>
    </Sheet>
  );
};
