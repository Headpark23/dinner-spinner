/**
 * Install prompt logic. Chrome on Android and desktop fires `beforeinstallprompt`, which is held until the
 * person taps "Install". Safari on iPhone and iPad has no such event, so it gets "Share, then Add to Home
 * Screen" guidance instead. Nothing shows once the app is installed or after it has been dismissed.
 */
export type InstallMode = 'none' | 'prompt' | 'ios';

export interface InstallEnv {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `navigator.standalone`, which only iOS Safari sets. */
  navigatorStandalone?: boolean;
  /** `matchMedia('(display-mode: standalone)').matches`. */
  displayModeStandalone: boolean;
}

export const INSTALL_DISMISS_KEY = 'ds-install-dismissed';
/** How long "not now" is remembered before the offer comes back. */
export const INSTALL_DISMISS_DAYS = 30;

export const isStandalone = (env: InstallEnv): boolean => env.displayModeStandalone || env.navigatorStandalone === true;

/** iPhone, iPad (including iPadOS, which calls itself a Mac) in Safari. Other iOS browsers cannot add to the home screen. */
export function isIosSafari(env: InstallEnv): boolean {
  const ios = /iPad|iPhone|iPod/.test(env.userAgent) || (env.platform === 'MacIntel' && env.maxTouchPoints > 1);
  if (!ios) return false;
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(env.userAgent);
}

export function installMode(env: InstallEnv, hasPromptEvent: boolean): InstallMode {
  if (isStandalone(env)) return 'none';
  if (hasPromptEvent) return 'prompt';
  if (isIosSafari(env)) return 'ios';
  return 'none';
}

interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function isDismissed(store: KeyValueStore | undefined, now: number): boolean {
  try {
    const raw = store?.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now - at < INSTALL_DISMISS_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export function rememberDismissal(store: KeyValueStore | undefined, now: number): void {
  try {
    store?.setItem(INSTALL_DISMISS_KEY, String(now));
  } catch {
    // Private browsing: the banner may come back next visit, which is fine.
  }
}

/** The shape of Chrome's install event. */
export interface InstallPromptEvent {
  preventDefault(): void;
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface InstallTarget {
  addEventListener(type: string, fn: (e: Event) => void): void;
  removeEventListener(type: string, fn: (e: Event) => void): void;
}

/** Captures the browser's install event so a button of ours can trigger it later. */
export function captureInstallPrompt(target: InstallTarget, onChange: () => void) {
  let event: InstallPromptEvent | null = null;
  const onBefore = (e: Event) => {
    e.preventDefault();
    event = e as unknown as InstallPromptEvent;
    onChange();
  };
  const onInstalled = () => {
    event = null;
    onChange();
  };
  target.addEventListener('beforeinstallprompt', onBefore);
  target.addEventListener('appinstalled', onInstalled);
  return {
    hasEvent: () => event !== null,
    /** Shows the browser's own install dialog. Resolves to whether the person accepted. */
    async install(): Promise<boolean> {
      const e = event;
      if (!e) return false;
      event = null; // the event can be used once
      try {
        await e.prompt();
        const { outcome } = await e.userChoice;
        return outcome === 'accepted';
      } catch {
        return false;
      } finally {
        onChange();
      }
    },
    stop() {
      target.removeEventListener('beforeinstallprompt', onBefore);
      target.removeEventListener('appinstalled', onInstalled);
    },
  };
}
