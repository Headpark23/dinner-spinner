import test from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import { textFromDocument, xmlToLines } from './docText';

/** A minimal zip with one entry, stored or deflated. */
function makeZip(name: string, content: string, deflate: boolean): Uint8Array {
  const raw = Buffer.from(content, 'utf8');
  const data = deflate ? zlib.deflateRawSync(raw) : raw;
  const nameBuf = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(deflate ? 8 : 0, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(deflate ? 8 : 0, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(0, 42);
  const centralDir = Buffer.concat([central, nameBuf]);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(30 + nameBuf.length + data.length, 16);
  return new Uint8Array(Buffer.concat([local, nameBuf, data, centralDir, eocd]));
}

const DOC = `<w:document><w:body>
<w:p><w:r><w:t>Chicken &amp; Leek Pie</w:t></w:r></w:p>
<w:p><w:r><w:t>Ingredients</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">2 </w:t></w:r><w:r><w:t>chicken breasts</w:t></w:r></w:p>
<w:p><w:r><w:t>Method</w:t></w:r></w:p>
<w:p><w:r><w:t>Bake it.</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>Serve.</w:t></w:r></w:p>
</w:body></w:document>`;

test('reads the text of a deflated .docx', async () => {
  const text = await textFromDocument(makeZip('word/document.xml', DOC, true));
  assert.equal(text, 'Chicken & Leek Pie\nIngredients\n2 chicken breasts\nMethod\nBake it.\nServe.');
});

test('reads a stored (uncompressed) entry and an .odt body', async () => {
  const odt = `<office:text><text:h>Soup</text:h><text:p>Boil<text:line-break/>water</text:p></office:text>`;
  assert.equal(await textFromDocument(makeZip('content.xml', odt, false)), 'Soup\nBoil\nwater');
});

test('returns null for something that is not a document zip', async () => {
  assert.equal(await textFromDocument(new Uint8Array([1, 2, 3, 4, 5])), null);
  assert.equal(await textFromDocument(makeZip('other.txt', 'hi', true)), null);
});

test('decodes numeric entities and collapses blank runs', () => {
  assert.equal(xmlToLines('<w:p>a&#8217;b</w:p><w:p></w:p><w:p></w:p><w:p></w:p><w:p>c</w:p>'), 'a’b\n\nc');
});
