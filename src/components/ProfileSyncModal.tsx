import React, { useRef, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { RefreshCw, Download, FileUp, CloudDownload, RotateCcw, CircleCheck, CircleAlert } from 'lucide-react';
import { Button, Notice, Sheet, TextInput } from './ui';

interface ProfileSyncModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileSyncModal: React.FC<ProfileSyncModalProps> = ({ isOpen, onClose }) => {
  const {
    userProfile,
    updateUserProfile,
    syncWithCloud,
    restoreFromCloud,
    importBackupData,
    resetToFactoryDefaults,
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const lastSaved = userProfile.lastSyncedAt ? new Date(userProfile.lastSyncedAt) : null;

  const handleSync = async () => {
    setStatus(null);
    const ok = await syncWithCloud();
    setStatus(
      ok
        ? { type: 'success', text: 'Saved a copy to this app’s server.' }
        : { type: 'error', text: 'Couldn’t reach the server. Your data is still safe on this device.' }
    );
  };

  const handleRestore = async () => {
    setStatus(null);
    const res = await restoreFromCloud();
    setStatus({ type: res.success ? 'success' : 'error', text: res.message });
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
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const res = importBackupData(JSON.parse(reader.result as string));
        setStatus({ type: res.success ? 'success' : 'error', text: res.message });
      } catch {
        setStatus({ type: 'error', text: 'That file isn’t a Dinner Spinner backup.' });
      }
    };
    reader.readAsText(file);
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

      <h3 className="mt-5 text-[15px] font-semibold">Server copy</h3>
      <p className="text-[13px] text-ink-2">
        {lastSaved ? `Last saved ${lastSaved.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.` : 'Not saved yet.'}{' '}
        Stored by the server this app runs on, for moving between devices.
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
              Replace everything with the starter recipes and fridge? Your history on this device will be cleared.
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
