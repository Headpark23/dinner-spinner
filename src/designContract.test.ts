import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

const css = read('./index.css');
const app = read('./App.tsx');
const ui = read('./components/ui.tsx');
const reel = read('./components/ReelWindow.tsx');
const nav = read('./components/ArcadeNavBar.tsx');
const machine = read('./components/views/MachineView.tsx');

test('preserves the complete spinner and navigation feature inventory', () => {
  for (const anchor of [
    'setMode',
    'setTimeStake',
    'setEffort',
    'setClearoutActive',
    '<ReelWindow onSpin={spin}',
    'toggleFavoriteMeal',
    'openPantryTab',
    'sendToVote',
    'setSheetOpen(true)',
  ]) {
    assert.match(machine, new RegExp(anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  for (const anchor of [
    'handleLeverPull',
    'nudgeReel',
    'toggleHold',
    "e.code === 'Space'",
    "e.key.toLowerCase() === 'm'",
    'onSpin();',
  ]) {
    assert.ok(reel.includes(anchor), `missing reel mechanic: ${anchor}`);
  }

  for (const label of ['Spin', 'Tonight', 'Pantry', 'Takeaway', 'Stats']) {
    assert.ok(nav.includes(`label: '${label}'`), `missing navigation destination: ${label}`);
  }
});

test('defines the modern British kitchen heirloom design contract', () => {
  for (const token of [
    '--paper: #f5f2eb',
    '--enamel: #10241d',
    '--brass: #c3a15d',
    '--tomato: #8f2f3b',
  ]) {
    assert.ok(css.includes(token), `missing premium token: ${token}`);
  }

  const hooks: Array<[string, string]> = [
    [app, 'app-shell'],
    [app, 'cabinet-shell'],
    [app, 'view-stage'],
    [app, 'tonight-rail'],
    [machine, 'machine-intro'],
    [machine, 'control-deck'],
    [machine, 'spin-result'],
    [reel, 'reel-housing'],
    [nav, 'app-nav'],
  ];

  for (const [source, hook] of hooks) {
    assert.ok(source.includes(hook), `missing presentation hook: ${hook}`);
    assert.ok(css.includes(`.${hook}`), `missing presentation rule: .${hook}`);
  }

  assert.ok(ui.includes('focus-visible'), 'shared controls must retain visible focus treatment');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'reduced motion support must remain');
});
