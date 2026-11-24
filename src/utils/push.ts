/** Web Push helpers: register the service worker and subscribe this phone. */

export type PushStatus =
  | 'insecure' // opened over plain http on another device: browsers block notifications
  | 'needs-install' // iPhone/iPad: only works once added to the Home Screen
  | 'unsupported'
  | 'default' // not asked yet
  | 'denied'
  | 'on';

export const isIOS = () =>
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1));

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true);

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js');
  } catch {
    return null;
  }
}

async function getRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker());
}

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === 'undefined') return 'unsupported';
  if (!window.isSecureContext) return 'insecure';
  if (isIOS() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'default') return 'default';
  const reg = await getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'default';
}

/** Ask permission (must run from a tap), subscribe, and tell the server who this phone belongs to. */
export async function enablePush(memberId: string, memberName?: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, message: 'Notifications were not allowed. You can change this in your phone’s settings.' };
    }
    const reg = await getRegistration();
    if (!reg) return { ok: false, message: 'This browser can’t run notifications.' };
    await navigator.serviceWorker.ready;
    const { publicKey } = await (await fetch('/api/push/key')).json();
    let sub = await reg.pushManager.getSubscription();
    // Keys change if the server was reset: start a fresh subscription in that case.
    const currentKey = sub?.options?.applicationServerKey;
    if (sub && currentKey) {
      const wanted = urlBase64ToUint8Array(publicKey);
      const have = new Uint8Array(currentKey);
      if (have.length !== wanted.length || have.some((b, i) => b !== wanted[i])) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), memberId, memberName }),
    });
    if (!res.ok) return { ok: false, message: 'Couldn’t register this phone with the server.' };
    return { ok: true };
  } catch (err: any) {
    return { ok: false, message: err?.message || 'Couldn’t turn on notifications.' };
  }
}

/** Re-send the subscription (e.g. after changing who this phone belongs to). */
export async function refreshPushOwner(memberId: string, memberName?: string) {
  try {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const reg = await getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), memberId, memberName }),
    });
  } catch {
    // best effort
  }
}

export async function sendTestPush(): Promise<boolean> {
  try {
    const reg = await getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return false;
    const res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
