import { ReverseTimerStep } from '../types';

/** Milliseconds from `now` until each unfinished step is due today. Steps already past are left out. */
export function stepDelays(
  steps: Pick<ReverseTimerStep, 'id' | 'timeString' | 'done'>[],
  now: Date = new Date()
): { id: string; ms: number }[] {
  const out: { id: string; ms: number }[] = [];
  for (const step of steps) {
    if (step.done) continue;
    const [h, m] = step.timeString.split(':').map(Number);
    const at = new Date(now);
    at.setHours(h, m, 0, 0);
    const ms = at.getTime() - now.getTime();
    if (Number.isFinite(ms) && ms > 0) out.push({ id: step.id, ms });
  }
  return out;
}

export const notificationsSupported = () => typeof Notification !== 'undefined';

/**
 * Shows a system notification for a step that is due. It goes through the service worker where there is
 * one, because Android Chrome refuses `new Notification()` on a page and only allows it from a worker.
 * Returns false when nothing could be shown (no permission, or no support).
 */
export async function showStepNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (!notificationsSupported() || Notification.permission !== 'granted') return false;
  const options = {
    body,
    tag,
    icon: '/icons/icon-192.png',
    vibrate: [200, 100, 200],
    data: { url: '/tonight' },
  } as NotificationOptions;
  try {
    const reg = typeof navigator !== 'undefined' ? await navigator.serviceWorker?.getRegistration() : undefined;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
  } catch {
    // fall through to the page notification
  }
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}
