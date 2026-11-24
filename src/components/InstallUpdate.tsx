import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Download, RefreshCw, Share, X } from 'lucide-react';
import { captureInstallPrompt, installMode, isDismissed, rememberDismissal, InstallEnv, InstallMode } from '../utils/installPrompt';
import { updateSignal } from '../utils/swUpdate';

const readEnv = (): InstallEnv => ({
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints ?? 0,
  navigatorStandalone: (navigator as unknown as { standalone?: boolean }).standalone,
  displayModeStandalone: typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches,
});

/** "A new version is ready" strip, shown when a waiting service worker can be swapped in. */
export const UpdateNotice: React.FC = () => {
  const apply = useSyncExternalStore(updateSignal.subscribe, updateSignal.get);
  if (!apply) return null;
  return (
    <div role="status" className="mb-3 flex items-center gap-3 rounded-2xl border border-line-strong bg-card p-3 text-[14px]">
      <RefreshCw className="h-5 w-5 shrink-0 text-ink-2" />
      <span className="min-w-0 flex-1 font-medium">A new version is ready.</span>
      <button onClick={apply} className="rounded-xl bg-ink px-3.5 py-2 text-[14px] font-semibold text-paper">
        Refresh
      </button>
    </div>
  );
};

function useInstall() {
  const [mode, setMode] = useState<InstallMode>('none');
  const [dismissed, setDismissed] = useState(() => isDismissed(typeof localStorage === 'undefined' ? undefined : localStorage, Date.now()));
  const ctl = useRef<ReturnType<typeof captureInstallPrompt> | null>(null);

  useEffect(() => {
    const c = captureInstallPrompt(window, () => setMode(installMode(readEnv(), c.hasEvent())));
    ctl.current = c;
    setMode(installMode(readEnv(), c.hasEvent()));
    return c.stop;
  }, []);

  return {
    mode,
    dismissed,
    install: () => ctl.current?.install(),
    dismiss: () => {
      rememberDismissal(typeof localStorage === 'undefined' ? undefined : localStorage, Date.now());
      setDismissed(true);
    },
  };
}

/** Install offer: Chrome gets a button, iPhone Safari gets the Share-sheet steps. Hidden once installed or dismissed. */
export const InstallCard: React.FC = () => {
  const { mode, dismissed, install, dismiss } = useInstall();
  if (mode === 'none' || dismissed) return null;
  return (
    <div className="relative rounded-2xl border border-line bg-card p-3.5">
      <div className="flex items-center gap-3.5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sunk text-ink">
          {mode === 'ios' ? <Share className="h-5 w-5" /> : <Download className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1 pr-6">
          <p className="text-[16px] font-semibold">Install Dinner Spinner</p>
          <p className="mt-0.5 text-[13px] leading-snug text-ink-2">
            {mode === 'ios'
              ? 'Tap Share, then Add to Home Screen. Step reminders only work once it is installed.'
              : 'Open it like an app, and use it offline.'}
          </p>
        </div>
        {mode === 'prompt' && (
          <button onClick={() => void install()} className="shrink-0 rounded-xl bg-ink px-3.5 py-2 text-[14px] font-semibold text-paper">
            Install
          </button>
        )}
      </div>
      <button onClick={dismiss} aria-label="Not now" className="absolute top-2 right-2 rounded-full p-1.5 text-ink-3 hover:text-ink">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};
