import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applySharedOp, diffShared, emptyShared, SHARED } from './sharedSync';
import { guessShelf, splitReceiptItems, stockedCupboardNames } from './storeCupboard';
import { preparePhotoForUpload } from './shrinkImage';
import { checkBackup } from './backup';
import { createRedisStore, mutate, type Household } from '../server/store';
import { voteMessage, notActor, vapidKeys, cleanSub, type PushSub } from '../server/push';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';

const L = SHARED.recipes;
const S = SHARED.liked;
const run = (kind: 'list' | 'set', max: number, ops: any[], start = emptyShared()) => ops.reduce((s, op) => applySharedOp(kind, max, s, op), start);

test('Shared lists: diffs round-trip edits, keep order, and big changes become one replacement', () => {
  const a = { id: 'a', title: 'Fish pie' };
  const b = { id: 'b', title: 'Lasagne' };
  const c = { id: 'c', title: 'Dal' };
  const seeded = run('list', L.max, [{ type: 'seed', data: [a, b] }]);
  const next = [c, { ...a, title: 'Fish pie (ours)' }];
  const after = run('list', L.max, diffShared('list', seeded.data, next), seeded);
  assert.deepEqual(after.data, next);
  assert.equal(run('list', L.max, [{ type: 'seed', data: [] }], after).data.length, 2, 'a second seed is ignored');
  assert.ok(SHARED.shelved.max >= 100, 'shelved dishes sync across phones');

  const big = Array.from({ length: 80 }, (_, i) => ({ id: `m${i}`, title: `Dish ${i}` }));
  const ops = diffShared('list', [], big);
  assert.equal(ops.length, 1);
  assert.equal(ops[0].type, 'replaceAll');
});

test('Shared lists: sets ignore case, repeats of an operation are applied once', () => {
  let st = run('set', S.max, [{ type: 'seed', data: ['Garlic'] }]);
  st = run('set', S.max, diffShared('set', st.data, ['garlic', 'Halloumi']), st);
  assert.deepEqual(st.data, ['Garlic', 'Halloumi']);
  const once = { type: 'drop', value: 'halloumi', opId: 'op_1' };
  st = run('set', S.max, [once, once], st);
  assert.deepEqual(st.data, ['Garlic']);
  assert.equal(run('list', L.max, [{ type: 'upsert', item: { title: 'no id' } }]).data.length, 0, 'items without an id are refused');
});

test('Cupboard: running-low items do not count as stocked, shelves and receipts classify cleanly', () => {
  assert.equal(guessShelf('Chopped tomatoes tin'), 'Tins & jars');
  assert.equal(guessShelf('Fresh green beans'), 'Other', 'fresh green beans are produce, not tinned');
  assert.equal(guessShelf('Dark soy sauce'), 'Sauces & condiments');
  assert.equal(guessShelf('Basmati rice'), 'Pasta, rice & grains');
  assert.equal(guessShelf('Smoked paprika'), 'Herbs & spices');
  assert.equal(guessShelf('Cider vinegar'), 'Oils & vinegars');

  assert.deepEqual(
    stockedCupboardNames([
      { name: 'Coconut Milk', low: false },
      { name: 'Chopped Tomatoes', low: true },
      { name: 'Soy Sauce' },
    ]),
    ['Coconut Milk', 'Soy Sauce']
  );

  const split = splitReceiptItems([
    { name: 'British Chicken Thighs', category: 'Meat & Fish' },
    { name: 'Fine Green Beans', category: 'Produce' },
    { name: 'Tinned Chickpeas', category: 'Cupboard & Grains' },
    { name: 'Dark Soy Sauce', category: 'Sauces & Condiments' },
    { name: 'Smoked Paprika', category: 'Other' },
  ]);
  assert.deepEqual(split.fridge.map((i) => i.name), ['British Chicken Thighs', 'Fine Green Beans']);
  assert.deepEqual(split.cupboard.map((i) => i.name), ['Tinned Chickpeas', 'Dark Soy Sauce', 'Smoked Paprika']);
});

test('Photo upload guard and backup validation cover cupboard, likes, shelved and oversized files', async () => {
  const smallOk = await preparePhotoForUpload('data:image/jpeg;base64,abc123', 'image/jpeg');
  assert.equal(smallOk.ok, true);
  const hugeHeic = await preparePhotoForUpload('data:image/heic;base64,' + 'A'.repeat(4_100_000), 'image/heic');
  assert.equal(hugeHeic.ok, false);

  assert.equal(
    checkBackup({
      cupboard: [{ id: 'cb_1', name: 'Passata', shelf: 'Tins & jars' }],
      liked: ['Chilli'],
      shelved: [],
    }).ok,
    true
  );
  assert.equal(checkBackup({ cupboard: [{ name: 'missing id' }] }).ok, false);
});

test('Vote notifications: who is told what, and never the person who acted', () => {
  const base = { meal: { title: 'Lasagne' }, needed: 2, proposedBy: 'Dad', vetoedBy: '' };
  assert.match(voteMessage('propose', {}, { ...base, status: 'open', ballot: {} })!.payload.title, /Dad suggests Lasagne/);
  const yes = voteMessage('vote', { voter: 'mum' }, { ...base, status: 'open', ballot: { Mum: 'yes' } })!;
  assert.equal(yes.actor, 'Mum');
  assert.match(yes.payload.body, /1 of 2/);
  assert.match(voteMessage('vote', { voter: 'Mum' }, { ...base, status: 'agreed', ballot: { Mum: 'yes', Dad: 'yes' } })!.payload.title, /agreed/);
  assert.match(voteMessage('vote', { voter: 'Alex' }, { ...base, status: 'vetoed', vetoedBy: 'Alex', ballot: { Alex: 'no' } })!.payload.title, /Alex vetoed/);
  const subs = [{ name: 'Mum' }, { name: 'Dad' }] as PushSub[];
  assert.deepEqual(notActor(subs, 'mum').map((s) => s.name), ['Dad']);
  assert.equal(cleanSub({ endpoint: 'http://x', keys: { p256dh: 'a', auth: 'b' } }, 'Mum'), null, 'only https push services');
});

test('Push keys stay the same across restarts when derived from a secret', () => {
  const env = { GEMINI_API_KEY: 'secret-123' } as any;
  assert.deepEqual(vapidKeys(env), vapidKeys(env));
  assert.notEqual(vapidKeys(env).publicKey, vapidKeys({ GEMINI_API_KEY: 'other' } as any).publicKey);
  assert.equal(Buffer.from(vapidKeys(env).publicKey, 'base64url').length, 65);
});

test('Redis store: 8 simultaneous writes converge via backoff, and recipes live in hh:{id}:meals', async () => {
  const kv = new Map<string, string>();
  const fakeFetch: any = async (_url: string, init: any) => {
    const cmd = JSON.parse(init.body);
    if (cmd[0] === 'GET') return new Response(JSON.stringify({ result: kv.get(cmd[1]) ?? null }));
    if (cmd[0] === 'SET') {
      kv.set(cmd[1], cmd[2]);
      return new Response(JSON.stringify({ result: 'OK' }));
    }
    if (cmd[0] === 'EVAL') {
      const key = cmd[3];
      const expected = Number(cmd[4]);
      const cur = kv.get(key);
      const rev = cur ? JSON.parse(cur)._rev || 0 : 0;
      if ((cur && rev !== expected) || (!cur && expected !== 0)) return new Response(JSON.stringify({ result: 0 }));
      kv.set(key, cmd[5]);
      return new Response(JSON.stringify({ result: 1 }));
    }
    return new Response(JSON.stringify({ result: null }));
  };

  const store = createRedisStore('https://redis.test', 'tok', fakeFetch);
  const id = 'h_112233445566';
  await store.put(id, { keyHash: 'x', createdAt: 'now', snapshotAt: null, shopping: { version: 0, items: [] } });

  // 8 concurrent writers hit CAS at the exact same moment and all succeed without 503.
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      mutate(store, id, (h: Household) => {
        h.joined = [...(h.joined || []), { name: `P${i}`, at: 'now' }];
      })
    )
  );
  const finalH = await store.get(id);
  assert.equal(finalH?.joined?.length, 8);
});

test('Server: batched shared lists, separate Redis recipe book, and push subscribe/unsubscribe work', async () => {
  const kv = new Map<string, string>();
  let mealsReads = 0;
  const fakeFetch: any = async (_url: string, init: any) => {
    const cmd = JSON.parse(init.body);
    if (cmd[0] === 'GET') {
      if (String(cmd[1]).endsWith(':meals')) mealsReads += 1;
      return new Response(JSON.stringify({ result: kv.get(cmd[1]) ?? null }));
    }
    if (cmd[0] === 'SET') {
      kv.set(cmd[1], cmd[2]);
      return new Response(JSON.stringify({ result: 'OK' }));
    }
    if (cmd[0] === 'EVAL') {
      const key = cmd[3];
      const expected = Number(cmd[4]);
      const cur = kv.get(key);
      const rev = cur ? JSON.parse(cur)._rev || 0 : 0;
      if ((cur && rev !== expected) || (!cur && expected !== 0)) return new Response(JSON.stringify({ result: 0 }));
      kv.set(key, cmd[5]);
      return new Response(JSON.stringify({ result: 1 }));
    }
    return new Response(JSON.stringify({ result: null }));
  };

  const { app, useStore } = await import('../../server');
  useStore(createRedisStore('https://redis.test', 'tok', fakeFetch));
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const h = await (await fetch(base + '/api/households', { method: 'POST' })).json();
    const auth = { 'x-household-id': h.householdId, 'x-household-key': h.key, 'Content-Type': 'application/json' };
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: auth, body: JSON.stringify(body) });

    // Seed recipes, shelved and cupboard in a single batch call.
    const batchRes = await (
      await post('/api/shared/batch', {
        opsByList: {
          recipes: [{ type: 'seed', data: [{ id: 'm1', title: 'Fish pie' }] }],
          shelved: [{ type: 'seed', data: [{ id: 'm2', title: 'Mushroom risotto' }] }],
          cupboard: [{ type: 'upsert', item: { id: 'c1', name: 'Passata', shelf: 'Tins & jars' } }],
        },
      })
    ).json();
    assert.equal(batchRes.lists.recipes.seeded, true);
    assert.equal(batchRes.lists.shelved.data[0].title, 'Mushroom risotto');
    assert.equal(batchRes.lists.cupboard.data[0].name, 'Passata');

    // Heavy recipes live in hh:{id}:meals, keeping hh:{id} lean.
    assert.ok(kv.has(`hh:${h.householdId}:meals`));
    assert.ok(!kv.get(`hh:${h.householdId}`)!.includes('Fish pie'));

    // Idle batched poll with current versions does NOT touch hh:{id}:meals at all.
    const beforeReads = mealsReads;
    const pollUrl = `${base}/api/shared?v=${encodeURIComponent(
      `recipes:${batchRes.lists.recipes.version},shelved:${batchRes.lists.shelved.version},cupboard:${batchRes.lists.cupboard.version}`
    )}`;
    const polled = await (await fetch(pollUrl, { headers: auth })).json();
    assert.equal(polled.lists.recipes.unchanged, true);
    assert.equal(polled.lists.shelved.unchanged, true);
    assert.equal(polled.lists.cupboard.unchanged, true);
    assert.equal(mealsReads, beforeReads, 'unchanged poll skips reading hh:{id}:meals');

    // Legacy single-list routes continue to work seamlessly.
    const other = await (await fetch(base + '/api/shared/recipes', { headers: auth })).json();
    assert.equal(other.data[0].title, 'Fish pie');
    const same = await (await fetch(`${base}/api/shared/recipes?v=${other.version}`, { headers: auth })).json();
    assert.equal(same.unchanged, true, 'nothing re-sent when nothing changed');
    assert.equal((await fetch(base + '/api/shared/secrets', { headers: auth })).status, 404);
    assert.equal((await fetch(base + '/api/shared/recipes')).status, 401, 'needs the family code');

    assert.ok((await (await fetch(base + '/api/push/key')).json()).publicKey.length > 40);
    assert.equal((await post('/api/push/subscribe', { name: 'Mum' })).status, 400);
    const sub = { endpoint: 'https://push.example/sub1', keys: { p256dh: 'key1', auth: 'auth1' } };
    assert.equal((await post('/api/push/subscribe', { subscription: sub, name: 'Mum' })).status, 200);
    assert.equal((await post('/api/push/unsubscribe', { endpoint: sub.endpoint })).status, 200);

    const proposed = await (
      await post('/api/tonight', {
        op: 'propose',
        meal: { id: 'm1', title: 'Fish pie', timeStake: '30m', effort: 'standard', ingredients: ['Cod'], prepSteps: ['Bake (-30m)'] },
        people: ['Dad', 'Mum'],
        by: 'Dad',
      })
    ).json();
    assert.equal(proposed.status, 'open');
    assert.equal(proposed.notified, 0, 'unsubscribed phone is not notified');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
