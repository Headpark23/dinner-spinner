import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from './store';

/**
 * Fetches a web page on behalf of the recipe importer. The address comes from a user, so it must never be able to
 * reach anything inside our own network: only http(s), only public addresses (checked again on every redirect),
 * a small size limit and a short timeout.
 */
export const isPublicAddress = (ip: string): boolean => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    if (a === 169 && b === 254) return false; // link-local, cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 168 || (b === 0 && ip.startsWith('192.0.0.')))) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    return true;
  }
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v === '::' || v === '::1') return false;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return false;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    if (mapped) return isPublicAddress(mapped[1]);
    return true;
  }
  return false;
};

export type Resolver = (host: string) => Promise<string[]>;
const defaultResolver: Resolver = async (host) => (await lookup(host, { all: true })).map((r) => r.address);

const MAX_BYTES = 2_000_000;
const MAX_REDIRECTS = 3;

export async function fetchPublicPage(
  rawUrl: string,
  doFetch: typeof fetch = fetch,
  resolve: Resolver = defaultResolver
): Promise<{ html: string; url: string }> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    throw new HttpError(400, { error: 'That doesn’t look like a web address.' });
  }
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) {
      throw new HttpError(400, { error: 'Only ordinary web addresses (http or https) work.' });
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    let addresses: string[];
    try {
      addresses = net.isIP(host) ? [host] : await resolve(host);
    } catch {
      throw new HttpError(400, { error: 'Couldn’t find that website.' });
    }
    if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
      throw new HttpError(400, { error: 'That address can’t be read.' });
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        redirect: 'manual',
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DinnerSpinner/1.0; recipe importer)',
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
      });
    } catch {
      throw new HttpError(502, { error: 'Couldn’t reach that page. Check the link, or paste the recipe text instead.' });
    } finally {
      clearTimeout(timer);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      url = new URL(res.headers.get('location')!, url);
      continue;
    }
    if (!res.ok) {
      throw new HttpError(502, { error: `That site said no (${res.status}). Paste the recipe text instead.`, upstream: res.status });
    }
    const type = res.headers.get('content-type') || '';
    if (type && !/html|xml|text/i.test(type)) throw new HttpError(400, { error: 'That link isn’t a web page.' });
    const html = (await res.text()).slice(0, MAX_BYTES);
    return { html, url: url.toString() };
  }
  throw new HttpError(502, { error: 'That link redirects too many times.' });
}
