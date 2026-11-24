import test from 'node:test';
import assert from 'node:assert/strict';
import { DELIVERY_SHOPS } from './delivery';
import { STORES } from './planner';

const TRICKY = 'chilli flakes & oil / 100% "hot"?#';

test('every shop with a search builds a valid, escaped https address', () => {
  for (const shop of DELIVERY_SHOPS) {
    assert.doesNotThrow(() => new URL(shop.home), `${shop.name} home`);
    assert.ok(shop.home.startsWith('https://'), `${shop.name} home is https`);
    if (!shop.search) continue;
    const url = new URL(shop.search(TRICKY)); // throws if it is not a valid address
    assert.equal(url.protocol, 'https:', shop.name);
    assert.ok(!shop.search(TRICKY).includes(' '), `${shop.name} escapes spaces`);
    // The raw term must not be able to start a second query parameter or fragment.
    assert.equal(url.hash, '', `${shop.name} keeps # out of the fragment`);
    assert.ok(!/[&?]oil/.test(shop.search(TRICKY).split('?')[1] ?? ''), `${shop.name} keeps & inside the term`);
  }
});

test('the store picker is the delivery supermarkets, so the two lists cannot drift apart', () => {
  const supers = DELIVERY_SHOPS.filter((s) => s.kind === 'supermarket');
  assert.deepEqual(
    STORES.map((s) => s.id),
    supers.map((s) => s.id)
  );
  for (const store of STORES) {
    const shop = supers.find((s) => s.id === store.id)!;
    assert.equal(store.url('milk'), shop.search!('milk'));
    assert.equal(store.label, shop.name);
  }
});
