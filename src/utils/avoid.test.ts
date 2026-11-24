import test from 'node:test';
import assert from 'node:assert/strict';
import { mentions, mentionsAny, termForms } from './avoid';

test('plural avoid terms also catch the singular ingredient', () => {
  assert.ok(mentions('Chestnut mushroom, sliced', 'mushrooms'));
  assert.ok(mentions('King prawn', 'prawns'));
  assert.ok(mentions('Plum tomato', 'tomatoes'));
  assert.ok(mentions('Cherry', 'cherries'));
  assert.ok(mentions('Wild mushrooms', 'mushroom'));
});

test('unrelated ingredients are left alone, and blanks never match', () => {
  assert.ok(!mentions('Mustard', 'mushrooms'));
  assert.ok(!mentions('Glass noodles', 'ss'));
  assert.deepEqual(termForms(' '), []);
  assert.ok(!mentionsAny(['Rice'], ['', ' ']));
});

test('any of several texts and terms', () => {
  assert.ok(mentionsAny(['Pad Thai', 'noodles', 'King Prawns'], ['mushrooms', 'prawns']));
  assert.ok(!mentionsAny(['Pad Thai', 'noodles'], ['mushrooms', 'prawns']));
});
