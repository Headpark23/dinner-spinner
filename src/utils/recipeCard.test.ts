import test from 'node:test';
import assert from 'node:assert/strict';
import { cardContent, cardFilename, deliverCard, drawRecipeCard, wrapLines, CardCanvas, ShareDeps, MAX_CARD_INGREDIENTS } from './recipeCard';
import { Meal } from '../types';

const meal = (over: Partial<Meal> = {}): Meal => ({
  id: 'm1',
  title: 'Thai Green Curry',
  description: '',
  cuisine: 'Thai',
  timeStake: '30m',
  effort: 'one-pot',
  ingredients: ['chicken', 'coconut milk', 'green curry paste'],
  prepSteps: [],
  rating: 0,
  isFavorite: false,
  lastCookedDate: null,
  cookCount: 0,
  tags: [],
  ...over,
});
const CREDIT = { author: 'Jo Bloggs', license: 'CC BY-SA 4.0', licenseUrl: 'https://x', source: 'Wikimedia Commons' };

test('cardContent: title, place and time, ingredients, and a credit only with a photo', () => {
  const withPhoto = cardContent(meal({ origin: 'Thailand' }), { photo: '/p.jpg', credit: CREDIT });
  assert.equal(withPhoto.title, 'Thai Green Curry');
  assert.equal(withPhoto.meta, 'Thailand · Thai · 30 min');
  assert.deepEqual(withPhoto.ingredients, ['chicken', 'coconut milk', 'green curry paste']);
  assert.equal(withPhoto.more, null);
  assert.equal(withPhoto.credit, 'Photo: Jo Bloggs, CC BY-SA 4.0, via Wikimedia Commons');
  assert.equal(cardContent(meal(), { credit: CREDIT }).credit, null, 'no photo, no credit line');
  assert.equal(cardContent(meal(), { photo: '/p.jpg' }).credit, null);
});

test('cardContent: a long ingredient list is cut and says how many more', () => {
  const many = Array.from({ length: 14 }, (_, i) => `item ${i}`);
  const c = cardContent(meal({ ingredients: many }));
  assert.equal(c.ingredients.length, MAX_CARD_INGREDIENTS);
  assert.equal(c.more, '+4 more');
});

test('cardContent: time words match the app', () => {
  assert.match(cardContent(meal({ timeStake: '60m' })).meta, /1 hour$/);
  assert.match(cardContent(meal({ timeStake: 'all-day' })).meta, /All day$/);
});

test('wrapLines breaks on width and can cap the lines', () => {
  const measure = (s: string) => s.length * 10;
  assert.deepEqual(wrapLines('one two three four', 100, measure), ['one two', 'three four']);
  assert.deepEqual(wrapLines('', 100, measure), []);
  const capped = wrapLines('aa bb cc dd ee ff', 30, measure, 2);
  assert.equal(capped.length, 2);
  assert.ok(capped[1].endsWith('…'));
});

test('cardFilename is safe and recognisable', () => {
  assert.equal(cardFilename('Thai Green Curry!'), 'thai-green-curry-dinner-spinner.png');
  assert.equal(cardFilename('???'), 'recipe-dinner-spinner.png');
});

test('drawRecipeCard paints the title, ingredients and credit, and copes without a photo', () => {
  const drawn: string[] = [];
  const ctx = {
    fillStyle: '',
    font: '',
    textBaseline: '',
    fillRect() {},
    fillText: (t: string) => void drawn.push(t),
    measureText: (s: string) => ({ width: s.length * 12 }) as TextMetrics,
    drawImage() {},
    save() {},
    restore() {},
    beginPath() {},
    rect() {},
    clip() {},
  };
  const canvas: CardCanvas = { width: 0, height: 0, getContext: () => ctx as never, toBlob() {} };
  const content = cardContent(meal(), { photo: '/p.jpg', credit: CREDIT });
  drawRecipeCard(canvas, content, null);
  assert.equal(canvas.width, 1080);
  assert.ok(drawn.includes('Thai Green Curry') && drawn.includes('chicken') && drawn.includes('Dinner Spinner'));
  assert.ok(drawn.some((t) => t.startsWith('Photo: Jo Bloggs')));
  assert.throws(() => drawRecipeCard({ ...canvas, getContext: () => null }, content, null));
});

function deps(over: Partial<ShareDeps> = {}) {
  const log: string[] = [];
  const d: ShareDeps = {
    makeFile: (_b, name) => ({ name }) as File,
    download: (_b, name) => void log.push('download ' + name),
    ...over,
  };
  return { d, log };
}
const blob = {} as Blob;

test('deliverCard: uses the share sheet when it can send the picture', async () => {
  const { d } = deps({ canShare: () => true, share: async () => {} });
  assert.equal(await deliverCard(blob, 'Curry', d), 'shared');
});

test('deliverCard: a cancelled share sheet is not an error and does not download', async () => {
  const { d, log } = deps({
    canShare: () => true,
    share: async () => {
      throw Object.assign(new Error('x'), { name: 'AbortError' });
    },
  });
  assert.equal(await deliverCard(blob, 'Curry', d), 'cancelled');
  assert.deepEqual(log, []);
});

test('deliverCard: falls back to copying, then to downloading', async () => {
  const copy = deps({ canShare: () => false, copyImage: async () => {} });
  assert.equal(await deliverCard(blob, 'Curry', copy.d), 'copied');
  const dl = deps({
    copyImage: async () => {
      throw new Error('denied');
    },
  });
  assert.equal(await deliverCard(blob, 'Curry', dl.d), 'downloaded');
  assert.deepEqual(dl.log, ['download curry-dinner-spinner.png']);
});

test('deliverCard: a share that fails for another reason still ends with the picture copied', async () => {
  const { d } = deps({
    canShare: () => true,
    share: async () => {
      throw new Error('boom');
    },
    copyImage: async () => {},
  });
  assert.equal(await deliverCard(blob, 'Curry', d), 'copied');
});
