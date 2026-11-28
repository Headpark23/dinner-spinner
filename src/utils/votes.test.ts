import test from 'node:test';
import assert from 'node:assert/strict';
import { applyTonightOp, votesNeeded } from '../server/tonight';
import { voteMessage } from '../server/push';

const meal = { id: 'm1', title: 'Fajitas', timeStake: '30m', effort: 'standard', ingredients: ['Peppers'], prepSteps: ['Fry (-20m)'] };
const propose = (people: string[], by: string) => {
  const h: { tonight?: unknown } = {};
  const t = applyTonightOp(h, { op: 'propose', meal, people, by });
  return { h, t };
};

test('Votes needed: a strict majority, so one person never agrees dinner for two', () => {
  assert.equal(votesNeeded(1), 1);
  assert.equal(votesNeeded(2), 2);
  assert.equal(votesNeeded(3), 2);
  assert.equal(votesNeeded(4), 3);
});

test('Family vote: the sender counts as yes, and the other person must still agree', () => {
  const { h, t } = propose(['Sam', 'Alex'], 'sam');
  assert.equal(t.status, 'open', 'sending it does not agree dinner on its own');
  assert.deepEqual(t.ballot, { Sam: 'yes' });
  assert.equal(t.needed, 2);
  assert.equal(t.proposedBy, 'Sam');
  // The sender has already voted; a second yes from them changes nothing.
  assert.equal(applyTonightOp(h, { op: 'vote', voter: 'Sam', vote: 'yes' }).status, 'open');
  assert.equal(applyTonightOp(h, { op: 'vote', voter: 'Alex', vote: 'yes' }).status, 'agreed');
});

test('Family vote: the sender always takes part, even if their phone lists other names', () => {
  const { t } = propose(['Alex'], 'Sam');
  assert.deepEqual(t.people, ['Sam', 'Alex']);
  assert.equal(t.status, 'open');
});

test('Family vote: a veto ends it, and cancelling is its own step that everyone hears about', () => {
  const vetoed = propose(['Sam', 'Alex'], 'Sam');
  assert.equal(applyTonightOp(vetoed.h, { op: 'vote', voter: 'Alex', vote: 'no' }).vetoedBy, 'Alex');

  const { h } = propose(['Sam', 'Alex'], 'Sam');
  const t = applyTonightOp(h, { op: 'cancel', by: 'Sam' });
  assert.equal(t.status, 'cancelled');
  assert.equal(t.cancelledBy, 'Sam');
  assert.throws(() => applyTonightOp(h, { op: 'vote', voter: 'Alex', vote: 'yes' }), /finished/);
  assert.throws(() => applyTonightOp(h, { op: 'cancel', by: 'Sam' }), /finished/, 'nothing left to cancel');

  const msg = voteMessage('cancel', { by: 'Sam' }, t as any)!;
  assert.equal(msg.actor, 'Sam', 'the person who cancelled is not told');
  assert.match(msg.payload.title, /Sam cancelled the vote on Fajitas/);
});

test('Family vote: the notification asks for a vote by name', () => {
  const { t } = propose(['Sam', 'Alex'], 'Sam');
  const msg = voteMessage('propose', {}, t as any)!;
  assert.equal(msg.actor, 'Sam');
  assert.match(msg.payload.title, /Sam wants your vote: Fajitas/);
  // A household of one agrees straight away, and says so.
  const solo = propose(['Sam'], 'Sam').t;
  assert.equal(solo.status, 'agreed');
  assert.match(voteMessage('propose', {}, solo as any)!.payload.title, /agreed/);
});
