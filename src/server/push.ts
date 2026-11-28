import crypto from 'crypto';
import webpush from 'web-push';

/** One phone that asked to be told about votes. Kept in its family group's record. */
export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** The household member this phone belongs to, so they aren't told about their own votes. */
  name: string;
  at: string;
};

export type PushPayload = { title: string; body: string; tag?: string; url?: string };

/**
 * VAPID keys identify this server to the phones' push services. They must stay the same between
 * restarts, or every phone's subscription stops working. On a serverless host there is no disk, so:
 *  1. VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY if set (recommended),
 *  2. otherwise keys derived from a secret the server already has (VAPID_SEED, else GEMINI_API_KEY),
 *  3. otherwise random keys (fine for local testing; phones re-subscribe when they next open the app).
 */
export function vapidKeys(env: NodeJS.ProcessEnv = process.env): { publicKey: string; privateKey: string } {
  if (env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim()) {
    return { publicKey: env.VAPID_PUBLIC_KEY.trim(), privateKey: env.VAPID_PRIVATE_KEY.trim() };
  }
  const seed = (env.VAPID_SEED || env.GEMINI_API_KEY || '').trim();
  if (seed && seed !== 'MY_GEMINI_API_KEY') {
    try {
      const priv = crypto.createHmac('sha256', seed).update('dinner-spinner-vapid-v1').digest();
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(priv);
      return { publicKey: ecdh.getPublicKey().toString('base64url'), privateKey: priv.toString('base64url') };
    } catch {
      // astronomically unlikely invalid key: fall through
    }
  }
  return webpush.generateVAPIDKeys();
}

let configured: { publicKey: string; privateKey: string } | null = null;
export function pushPublicKey(): string {
  if (!configured) {
    configured = vapidKeys();
    // Apple's push service insists on a real https: or mailto: contact here.
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT?.trim() || 'https://github.com/Headpark23/dinner-spinner',
      configured.publicKey,
      configured.privateKey
    );
  }
  return configured.publicKey;
}

export function cleanSub(raw: any, name: unknown): PushSub | null {
  const endpoint = String(raw?.endpoint || '');
  const p256dh = String(raw?.keys?.p256dh || '');
  const auth = String(raw?.keys?.auth || '');
  const who = String(name || '').trim().slice(0, 30);
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || !p256dh || p256dh.length > 200 || !auth || auth.length > 100 || !who) {
    return null;
  }
  return { endpoint, keys: { p256dh, auth }, name: who, at: new Date().toISOString() };
}

/** Sends to each phone; returns the endpoints that are gone for good (to forget). Never throws. */
export async function sendToAll(
  subs: PushSub[],
  payload: PushPayload,
  timeoutMs = 6000
): Promise<{ sent: number; gone: string[]; sentTo: string[] }> {
  pushPublicKey();
  const gone: string[] = [];
  const sentTo: string[] = [];
  let sent = 0;
  const body = JSON.stringify({ url: '/tonight', ...payload });
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, { TTL: 6 * 3600, urgency: 'high', timeout: timeoutMs });
        sent += 1;
        if (!sentTo.includes(s.name)) sentTo.push(s.name);
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.statusCode === 410) gone.push(s.endpoint);
        else console.warn('Push failed:', err?.statusCode || '', String(err?.body || err?.message || '').slice(0, 120));
      }
    })
  );
  return { sent, gone, sentTo };
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What to tell the household after a change to tonight's vote, and who acted (they aren't told). */
export function voteMessage(
  op: string,
  body: any,
  t: {
    status: string;
    meal: { title: string } | null;
    ballot: Record<string, string>;
    needed: number;
    proposedBy: string;
    vetoedBy: string;
    cancelledBy?: string;
  }
): { actor: string; payload: PushPayload } | null {
  const title = t.meal?.title || 'dinner';
  const tag = 'tonight-vote';
  if (op === 'propose') {
    const by = t.proposedBy || 'Someone';
    if (t.status === 'agreed') return { actor: t.proposedBy, payload: { title: `Dinner’s agreed: ${title}`, body: 'Tap for the timeline.', tag } };
    return { actor: t.proposedBy, payload: { title: `${by} wants your vote: ${title}`, body: 'Tap to say yes or veto it.', tag } };
  }
  if (op === 'cancel' && t.status === 'cancelled') {
    const by = t.cancelledBy || 'Someone';
    return { actor: t.cancelledBy || '', payload: { title: `${by} cancelled the vote on ${title}`, body: 'Nothing to vote on for now.', tag } };
  }
  if (op === 'vote') {
    const voter = Object.keys(t.ballot).find((p) => same(p, String(body?.voter || ''))) || String(body?.voter || 'Someone');
    if (t.status === 'vetoed') return { actor: voter, payload: { title: `${voter} vetoed ${title}`, body: 'Spin again for something else.', tag } };
    if (t.status === 'agreed') return { actor: voter, payload: { title: `Dinner’s agreed: ${title}`, body: `${voter} said yes. Tap for the timeline.`, tag } };
    const yes = Object.values(t.ballot).filter((v) => v === 'yes').length;
    return { actor: voter, payload: { title: `${voter} said yes to ${title}`, body: `${yes} of ${t.needed} yes so far.`, tag } };
  }
  if (op === 'decide' && t.status === 'agreed') {
    return { actor: String(body?.by || ''), payload: { title: `Dinner’s agreed: ${title}`, body: 'Tap for the timeline.', tag } };
  }
  return null;
}

export const notActor = (subs: PushSub[], actor: string) => subs.filter((s) => !actor || !same(s.name, actor));
