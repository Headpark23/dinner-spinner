import test from 'node:test';
import assert from 'node:assert/strict';
import { createPhotoSearch, photoQueries } from '../server/photoSearch';

const page = (title: string, mime: string, width: number, license: string, index = 1) => ({
  title,
  index,
  imageinfo: [
    {
      mime,
      width,
      thumburl: 'https://upload.wikimedia.org/thumb/x.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/' + title,
      extmetadata: { LicenseShortName: { value: license }, Artist: { value: '<a href="x">Jo &amp; Co</a>' }, LicenseUrl: { value: 'https://cc/by' } },
    },
  ],
});
const reply = (pages: any[]) =>
  (async () => new Response(JSON.stringify({ query: { pages: Object.fromEntries(pages.map((p, i) => [i, p])) } }))) as unknown as typeof fetch;

test('search words: full name first, then the last two words', () => {
  assert.deepEqual(photoQueries('Nan’s Jerk Chicken with Rice'), ['Nan Jerk Chicken Rice', 'Chicken Rice']);
  assert.deepEqual(photoQueries('Lamb Kofta'), ['Lamb Kofta']);
});

test('takes the first big, freely licensed picture whose name mentions the dish, with its credit', async () => {
  const s = createPhotoSearch(
    reply([
      page('File:Small kofta.jpg', 'image/jpeg', 200, 'CC BY 4.0', 1),
      page('File:Kofta logo.svg', 'image/svg+xml', 900, 'CC BY 4.0', 2),
      page('File:Kofta restricted.jpg', 'image/jpeg', 900, 'All rights reserved', 3),
      page('File:Unrelated.jpg', 'image/jpeg', 900, 'CC BY 4.0', 4),
      page('File:Lamb kofta plate.jpg', 'image/jpeg', 900, 'CC BY-SA 4.0', 5),
    ])
  );
  const found = await s.findPhoto('Lamb Kofta');
  assert.equal(found?.credit.license, 'CC BY-SA 4.0');
  assert.equal(found?.credit.author, 'Jo & Co');
  assert.match(found!.credit.source, /Lamb kofta plate/);
});

test('no match, or the service failing, gives null rather than an error', async () => {
  assert.equal(await createPhotoSearch(reply([])).findPhoto('Lamb Kofta'), null);
  const down = (async () => new Response('no', { status: 500 })) as unknown as typeof fetch;
  assert.equal(await createPhotoSearch(down).findPhoto('Lamb Kofta'), null);
  const boom = (async () => {
    throw new Error('offline');
  }) as unknown as typeof fetch;
  assert.equal(await createPhotoSearch(boom).findPhoto('Lamb Kofta'), null);
});
