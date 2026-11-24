/**
 * Plain text out of a Word (.docx) or OpenDocument (.odt) file, without a library. Both are zip files holding an XML
 * document, so we read the zip's file list, inflate the one entry we need with the browser's built-in decompressor,
 * and turn paragraphs into lines.
 */

const decoder = new TextDecoder('utf-8');

async function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Find one entry in a zip by name and return its (uncompressed) bytes, or null when it isn't there. */
export async function readZipEntry(buf: Uint8Array, wanted: string): Promise<Uint8Array | null> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // The end-of-central-directory record sits at the very end (up to 64KB of comment after it).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let n = 0; n < count && p + 46 <= buf.length; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });

/** Turn the XML of a document body into lines of text. */
export function xmlToLines(xml: string): string {
  return unescapeXml(
    xml
      .replace(/[\r\n]+/g, '')
      .replace(/<w:tab\s*\/>|<text:tab\s*\/>/g, '\t')
      .replace(/<w:br\s*\/>|<w:cr\s*\/>|<text:line-break\s*\/>/g, '\n')
      .replace(/<\/w:p>|<\/text:p>|<\/text:h>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The text of a .docx or .odt file, or null if it isn't one of those. */
export async function textFromDocument(buf: Uint8Array): Promise<string | null> {
  for (const entry of ['word/document.xml', 'content.xml']) {
    const data = await readZipEntry(buf, entry);
    if (data) return xmlToLines(decoder.decode(data));
  }
  return null;
}

const JUNK = /times new roman|microsoft (office )?word|normal\.dot|msword|calibri|arial|symbol|wingdings|document summary|root entry|comp obj|worddocument|macrosoft|default paragraph|table normal|header|footer|heading \d|body text|\bbjbj\b|_pid_|\bFIB\b/i;

/**
 * Best-effort text from an old binary Word (.doc) file. We don't parse the format: Word keeps the body as plain 8-bit
 * or UTF-16 text, so we pull out the long readable runs and drop the font and style names around them. It is rougher
 * than .docx, so the caller should treat the result as a draft.
 */
export function textFromLegacyDoc(buf: Uint8Array): string | null {
  if (!(buf[0] === 0xd0 && buf[1] === 0xcf && buf[2] === 0x11 && buf[3] === 0xe0)) return null;
  const runs: { at: number; text: string }[] = [];
  const ok = (c: number) => (c >= 32 && c < 127) || c === 13 || c === 10 || c === 9 || c === 0xa3 || c === 0xbd || c === 0xb0 || c === 0x2019;
  // 8-bit runs
  let start = -1;
  for (let i = 0; i <= buf.length; i++) {
    const good = i < buf.length && ok(buf[i]);
    if (good && start < 0) start = i;
    if (!good && start >= 0) {
      if (i - start >= 24) runs.push({ at: start, text: String.fromCharCode(...buf.subarray(start, i)) });
      start = -1;
    }
  }
  // UTF-16LE runs
  start = -1;
  for (let i = 0; i + 1 <= buf.length; i += 1) {
    const lo = buf[i], hi = i + 1 < buf.length ? buf[i + 1] : 1;
    const good = hi === 0 && ok(lo);
    if (good && start < 0) start = i;
    if (!good && start >= 0) {
      if ((i - start) / 2 >= 24) {
        let t = '';
        for (let j = start; j < i; j += 2) t += String.fromCharCode(buf[j]);
        runs.push({ at: start, text: t });
      }
      start = -1;
      if (!(hi === 0 && ok(lo))) continue;
    }
    if (good) i += 1;
  }
  runs.sort((a, b) => a.at - b.at);
  const text = runs
    .map((r) => r.text)
    .filter((t) => !JUNK.test(t) || t.length > 200)
    .join('\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text.length >= 20 ? text : null;
}

/** The preview a Pages file carries (a PDF or picture of its first page), for the scanner to read. */
export async function previewFromPages(buf: Uint8Array): Promise<{ bytes: Uint8Array; type: string; name: string } | null> {
  const tries: [string, string][] = [
    ['QuickLook/Preview.pdf', 'application/pdf'],
    ['QuickLook/Thumbnail.jpg', 'image/jpeg'],
    ['preview.jpg', 'image/jpeg'],
    ['Thumbnails/PageCapThumbnail.jpg', 'image/jpeg'],
  ];
  for (const [entry, type] of tries) {
    const bytes = await readZipEntry(buf, entry);
    if (bytes && bytes.length > 500) return { bytes, type, name: entry.split('/').pop()! };
  }
  return null;
}
