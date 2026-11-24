import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPersonPrefs, describeClashes, dishClashes, effectiveRestrictions, PersonPrefs } from './memberDiets';

const sam: PersonPrefs = { id: 'a', name: 'Sam', diets: ['vegetarian'] };
const jo: PersonPrefs = { id: 'b', name: 'Jo', avoid: ['mushrooms'] };
const nobody: PersonPrefs = { id: 'c', name: 'Pat' };

test('effectiveRestrictions: "skip" adds everyone\'s needs to the baseline', () => {
  const r = effectiveRestrictions(['gluten-free'], ['coriander'], [sam, jo, nobody], 'skip');
  assert.deepEqual(r.diets.sort(), ['gluten-free', 'vegetarian']);
  assert.deepEqual(r.avoid.sort(), ['coriander', 'mushrooms']);
});

test('effectiveRestrictions: "warn" leaves the baseline alone', () => {
  const r = effectiveRestrictions(['gluten-free'], ['coriander'], [sam, jo], 'warn');
  assert.deepEqual(r, { diets: ['gluten-free'], avoid: ['coriander'] });
});

test('effectiveRestrictions: duplicates collapse, case-insensitively', () => {
  const r = effectiveRestrictions([], ['Mushrooms'], [jo, { id: 'd', name: 'Al', avoid: ['mushrooms'] }], 'skip');
  assert.equal(r.avoid.length, 1);
});

test('dishClashes: names who a dish does not suit, and why', () => {
  const dish = { title: 'Beef and mushroom pie', ingredients: ['beef mince', 'mushrooms', 'pastry'] };
  const clashes = dishClashes(dish, [sam, jo, nobody]);
  assert.deepEqual(clashes, [
    { name: 'Sam', reasons: ['vegetarian'] },
    { name: 'Jo', reasons: ['avoids mushrooms'] },
  ]);
});

test('dishClashes: a dish that suits everyone has none', () => {
  assert.deepEqual(dishClashes({ title: 'Tomato pasta', ingredients: ['tomato', 'basil'] }, [sam, jo]), []);
});

test('dishClashes: avoid list matches plurals typed by the person', () => {
  const clashes = dishClashes({ title: 'Prawn curry', ingredients: ['king prawn'] }, [{ id: 'x', name: 'Lee', avoid: ['prawns'] }]);
  assert.equal(clashes.length, 1);
});

test('describeClashes reads as a sentence', () => {
  assert.equal(describeClashes([]), '');
  assert.equal(describeClashes([{ name: 'Sam', reasons: ['vegetarian'] }]), 'Sam (vegetarian)');
  assert.equal(
    describeClashes([
      { name: 'Sam', reasons: ['vegetarian'] },
      { name: 'Jo', reasons: ['avoids mushrooms', 'nut-free'] },
    ]),
    'Sam (vegetarian) and Jo (avoids mushrooms, nut-free)'
  );
});

test('cleanPersonPrefs drops junk, trims and caps', () => {
  const r = cleanPersonPrefs({ diets: ['vegan', 'vegan', 'martian', 4], avoid: [' kale ', '', 'kale', 7] });
  assert.deepEqual(r, { diets: ['vegan'], avoid: ['kale'] });
  assert.deepEqual(cleanPersonPrefs({}), { diets: [], avoid: [] });
});
