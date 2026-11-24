import React, { useState } from 'react';
import { Check, Copy, LogOut } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Notice, Sheet } from './ui';
import { FamilyStart } from './FamilyStart';

/** Family group: start or join one, or see who's in it and invite more people. Opened from More or the Dinner prompt. */
export const FamilySheet: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { householdCode, googleProfile, familyNames, leaveHousehold } = useDinner();
  const [copied, setCopied] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);

  const inviteLink = householdCode ? `${window.location.origin}/?join=${encodeURIComponent(householdCode)}` : '';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the link is still shown for selecting.
    }
  };
  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Join our Dinner Spinner family', url: inviteLink });
      else await copy();
    } catch {
      // The person closed the share sheet.
    }
  };

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={householdCode ? 'Your family group' : 'Start a family group'}
      subtitle={householdCode ? 'Everyone in it shares the list, the fridge and the vote.' : 'Dinner is easier when everyone is in it.'}
      labelledBy="family-title"
    >
      {!householdCode ? (
        <FamilyStart onDone={onClose} />
      ) : (
        <div className="space-y-4">
          {googleProfile && (
            <p className="text-[14px] text-ink-2">
              Signed in with Google as <span className="font-semibold text-ink">{googleProfile.email}</span>.
            </p>
          )}
          {familyNames.length > 0 && (
            <div>
              <p className="text-[13px] font-semibold text-ink-2">Signed in so far</p>
              <p className="text-[16px] font-semibold">{familyNames.join(', ')}</p>
            </div>
          )}
          <div className="space-y-2">
            <p className="text-[15px] font-semibold">Invite someone</p>
            <p className="text-[13px] text-ink-2">
              Send them this link. They open it, sign in with Google and they’re in. Anyone with the link can join, so only send it to family.
            </p>
            <Button variant="primary" block onClick={share}>
              Share invite link
            </Button>
            <Button variant="secondary" block onClick={copy}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>

          {!googleProfile && (
            <Notice tone="neutral">
              This phone joined without Google, so it only works here. To use the group on another phone, send that phone the invite link.
            </Notice>
          )}

          {confirmLeave ? (
            <div className="space-y-2 rounded-xl bg-sunk p-3">
              <p className="text-[14px]">Leave the family group on this phone? Your recipes stay here. The shared list and fridge stop syncing.</p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  onClick={() => {
                    leaveHousehold();
                    setConfirmLeave(false);
                    onClose();
                  }}
                >
                  Leave
                </Button>
                <Button variant="quiet" onClick={() => setConfirmLeave(false)}>
                  Stay
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" block onClick={() => setConfirmLeave(true)}>
              <LogOut className="h-4 w-4" /> {googleProfile ? 'Sign out on this phone' : 'Leave the family group'}
            </Button>
          )}
        </div>
      )}
    </Sheet>
  );
};
