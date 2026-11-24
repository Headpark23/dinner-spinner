/** Web Push on this phone: ask permission, subscribe, and tell the server who the phone belongs to. */

export type PushStatus =
  | 'insecure' // opened over plain http: browsers block notifications
  | 'needs-install' // iPhone/iPad: only works from the Home Screen app
  | 'unsupported'
  | 'default' // not turned on yet
  | 'denied'
  | 'on';

const PUSH_ON_KEY = 'ds_push_on';

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

/** True once this phone has push turned on (so the app doesn't also show its own copy of the same alert). */
export const pushIsOn = () => {
  try {
    return localStorage.getItem(PUSH_ON_KEY) === '1' && typeof Notification !== 'undefined' && Notification.permission === 'granted';
  } catch {
    return false;
  }
};
const setPushOn = (on: boolean) => {
  try {
    if (on) localStorage.setItem(PUSH_ON_KEY, '1');
    else localStorage.removeItem(PUSH_ON_KEY);
  } catch {
    // ignore
  }
};

function urlB64ToBytes(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const registration = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || (await navigator.serviceWorker.register('/sw.js').catch(() => null));
};

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'default';
  if (!pushIsOn()) return 'default';
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'default';
}

/**
 * Subscribe (or re-subscribe if the server's keys changed) and register under `name`.
 * `ask` requests permission, which browsers only allow from a tap.
 */
export async function syncPush(
  name: string,
  headers: Record<string, string>,
  ask: boolean
): Promise<{ ok: boolean; message?: string }> {
  try {
    if (typeof Notification === 'undefined') return { ok: false, message: 'This browser can’t show notifications.' };
    const permission = ask && Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
    if (permission !== 'granted') {
      setPushOn(false);
      return { ok: false, message: 'Notifications weren’t allowed. You can change that in your phone’s settings for this site.' };
    }
    const reg = await registration();
    if (!reg) return { ok: false, message: 'This browser can’t run notifications.' };
    await navigator.serviceWorker.ready;
    const { publicKey } = await (await fetch('/api/push/key')).json();
    const wanted = urlB64ToBytes(publicKey);
    let sub = await reg.pushManager.getSubscription();
    const have = sub?.options?.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null;
    if (sub && (!have || have.length !== wanted.length || have.some((b, i) => b !== wanted[i]))) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted });
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ subscription: sub.toJSON(), name }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, message: j.error || 'Couldn’t register this phone.' };
    }
    setPushOn(true);
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Couldn’t turn on notifications.' };
  }
}

export async function unsubscribePush(headers: Record<string, string>): Promise<boolean> {
  setPushOn(false);
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch('/api/push/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      }).catch(() => {});
      await sub.unsubscribe().catch(() => {});
    }
    return true;
  } catch {
    return false;
  }
}

export async function sendTestPush(headers: Record<string, string>): Promise<boolean> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return false;
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
