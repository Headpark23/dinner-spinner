import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { applySharedOp, diffShared, emptyShared, SHARED } from './sharedSync';
import { guessShelf } from './storeCupboard';
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

test('Cupboard shelves are guessed from the name', () => {
  assert.equal(guessShelf('Chopped tomatoes tin'), 'Tins & jars');
  assert.equal(guessShelf('Dark soy sauce'), 'Sauces & condiments');
  assert.equal(guessShelf('Basmati rice'), 'Pasta, rice & grains');
  assert.equal(guessShelf('Smoked paprika'), 'Herbs & spices');
  assert.equal(guessShelf('Cider vinegar'), 'Oils & vinegars');
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

test('Server: shared recipes and cupboard reach the other phone; push routes check their input', async () => {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const h = await (await fetch(base + '/api/households', { method: 'POST' })).json();
    const auth = { 'x-household-id': h.householdId, 'x-household-key': h.key, 'Content-Type': 'application/json' };
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: auth, body: JSON.stringify(body) });

    const seeded = await (await post('/api/shared/recipes/ops', { ops: [{ type: 'seed', data: [{ id: 'm1', title: 'Fish pie' }] }] })).json();
    assert.equal(seeded.seeded, true);
    await post('/api/shared/cupboard/ops', { ops: [{ type: 'upsert', item: { id: 'c1', name: 'Passata', shelf: 'Tins & jars' } }] });
    const other = await (await fetch(base + '/api/shared/recipes', { headers: auth })).json();
    assert.equal(other.data[0].title, 'Fish pie');
    const same = await (await fetch(`${base}/api/shared/recipes?v=${other.version}`, { headers: auth })).json();
    assert.equal(same.unchanged, true, 'nothing re-sent when nothing changed');
    assert.equal((await (await fetch(base + '/api/shared/cupboard', { headers: auth })).json()).data[0].name, 'Passata');
    assert.equal((await fetch(base + '/api/shared/secrets', { headers: auth })).status, 404);
    assert.equal((await fetch(base + '/api/shared/recipes')).status, 401, 'needs the family code');

    assert.ok((await (await fetch(base + '/api/push/key')).json()).publicKey.length > 40);
    assert.equal((await post('/api/push/subscribe', { name: 'Mum' })).status, 400);

    const proposed = await (await post('/api/tonight', { op: 'propose', meal: { id: 'm1', title: 'Fish pie', timeStake: '30m', effort: 'standard', ingredients: ['Cod'], prepSteps: ['Bake (-30m)'] }, people: ['Dad', 'Mum'], by: 'Dad' })).json();
    assert.equal(proposed.status, 'open');
    assert.equal(proposed.notified, 0, 'no phones signed up yet');
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
});
