// W609 Wave 2: browser/start-page formation launch integration and replay policy.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { MACHINE, P, RAM, BIT } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { portWordFromPlayerBits, mirrorsFromPort } from '../src/input.js';
import { TALLY } from '../src/tally.js';
import { applyAuthenticSelection, authenticSelectionQuery } from '../src/authentic.js';
import {
  MODS, MOD_IDS, createModState, hashToLoadout, loadoutToHash, resolveLoadout,
  transformModInput,
} from '../src/mods.js';
import {
  FORMATION_MODE, createFormationState, formationAuthenticOverridesFromParams,
  formationToHash, hashToFormation, initializeFormation,
  resolveFormationAuthenticSelection, transformFormationInput,
} from '../src/formation.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  clearCoin, clearTouch, selectTouchOwner, setTouchButton, setTouchDirections,
} from '../src/web/input.js';

const ID = 'fly-both-ships-side-by-side';
const DEFAULT_PAIR = {
  ship: 0, style: 2, p2: { ship: 2, style: 2 },
};

function launchHash(ids, formation) {
  return [loadoutToHash(ids), formationToHash(formation)].filter(Boolean).join('&');
}

test('W609 combined formation hash is deterministic and preserves old parsers', () => {
  const combined = launchHash(['ghost-trail', 'invincibility'], FORMATION_MODE);
  assert.equal(combined,
    'mods=invincibility+ghost-trail&formation=fly-both-ships-side-by-side');
  assert.deepEqual(hashToLoadout(`#${combined}`).ids, ['invincibility', 'ghost-trail']);
  assert.strictEqual(hashToFormation(`#${combined}`), FORMATION_MODE);

  assert.equal(launchHash([], null), '');
  assert.equal(launchHash(['ghost-trail'], null), 'mods=ghost-trail');
  assert.equal(launchHash([], FORMATION_MODE), `formation=${ID}`);
  assert.deepEqual(hashToLoadout('#formation=unknown').ids, []);
  assert.equal(hashToFormation('#mods=ghost-trail&formation=unknown'), null);
  assert.equal(hashToFormation('#mods=ghost-trail'), null);
});

test('W609 query fields merge by side and serialize the complete genuine pair', () => {
  const p1Only = formationAuthenticOverridesFromParams(
    new URLSearchParams('ship=2&style=6'));
  assert.deepEqual(p1Only, { ship: 2, style: 6 });
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE, p1Only), {
    ship: 2, style: 6, p2: { ship: 2, style: 2 },
  });

  const p2StyleOnly = formationAuthenticOverridesFromParams(
    new URLSearchParams('p2=1&p2style=6'));
  assert.deepEqual(p2StyleOnly, { p2: { style: 6 } });
  const merged = resolveFormationAuthenticSelection(FORMATION_MODE, p2StyleOnly);
  assert.deepEqual(merged, {
    ship: 0, style: 2, p2: { ship: 2, style: 6 },
  });
  assert.equal(authenticSelectionQuery(merged),
    '?ship=0&style=2&p2=1&p2ship=2&p2style=6');

  assert.equal(formationAuthenticOverridesFromParams(new URLSearchParams()), null);
  assert.equal(formationAuthenticOverridesFromParams(
    new URLSearchParams('p2style=6')), null, 'orphaned old-query P2 fields stay invalid');
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE), DEFAULT_PAIR);
});

test('W609 default formation selection arms genuine allocator-backed P2 request 4', () => {
  const ram = new Ram();
  const selected = resolveFormationAuthenticSelection(FORMATION_MODE);
  assert.deepEqual(selected, DEFAULT_PAIR);
  assert.deepEqual(applyAuthenticSelection({ ram, rom: {} }, selected), DEFAULT_PAIR);
  assert.equal(ram.u16(0x813086), 2);
  assert.equal(ram.u16(0x81308a), 2);
  assert.equal(ram.u16(TALLY.side1), 4);
  assert.equal(ram.u16(TALLY.side1 + 0x02), 0);
});

test('W609 Demo step applies catalogue input before formation packing', () => {
  clearCoin();
  clearTouch();
  assert.equal(selectTouchOwner('P1'), true);
  setTouchDirections(1 << BIT.right);
  setTouchButton('SHOT', true);

  try {
    const ram = new Ram();
    const game = {
      ram,
      tables: {
        angleFor() { throw new Error('no live player should request a movement angle'); },
        vector() { throw new Error('no live player should request a movement vector'); },
      },
      logicFrame: 1,
      coinPort: 0xffff,
      step(word) { this.steppedWith = word; this.logicFrame++; },
    };
    const formation = createFormationState(FORMATION_MODE);
    initializeFormation(formation, game);
    const mods = createModState(resolveLoadout(['precision-ship']));
    const raw = portWordFromPlayerBits([BIT.right, BIT.b1], []);
    const afterMod = transformModInput(mods, raw, 1);
    const expected = transformFormationInput(formation, afterMod);

    const demo = {
      game, formation, mods, progressionPokes: [], playback: null, recorder: null,
      romToPacked: new Map(), listOpts: {}, portList: null, hitboxRam: null,
      prevPos: null, prevTilt: 0, prevShipSel: 0, authenticLaunchPending: false,
      stepsRun: 0, bundle: {}, inPlayback: Demo.prototype.inPlayback,
      step: Demo.prototype.step,
    };
    demo.step();

    assert.equal(game.steppedWith, expected);
    const packed = mirrorsFromPort(game.steppedWith);
    assert.equal(packed.p1 & 0x0f, 0, 'precision removed P1 direction first');
    assert.equal(packed.p2 & 0x0f, 0,
      'formation copied the already-transformed direction state');
    assert.notEqual(packed.p1 & (1 << BIT.b1), 0);
    assert.notEqual(packed.p2 & (1 << BIT.b1), 0);
  } finally {
    clearTouch();
    clearCoin();
  }
});

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const REQUIRED_ASSETS = [
  'manifest.json', 'seed.bin.gz', 'player.tables.json.gz', 'capture.bin.gz',
];
const HAVE_ASSETS = REQUIRED_ASSETS.every((name) => existsSync(path.join(ASSETS, name)));
const SKIP_ASSETS = HAVE_ASSETS ? false
  : 'browser bundle absent; callback integration is skipped, not passed';
let bundlePromise;
function localBundle() {
  bundlePromise ??= loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}
function fakeCanvas() {
  const context = {
    createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData() {},
  };
  return {
    width: 0, height: 0, style: {}, dataset: {},
    getContext() { return context; },
  };
}

test('W609 Demo creates isolated state and a Game callback only for active mode',
  { skip: SKIP_ASSETS }, async () => {
    const bundle = await localBundle();
    const off = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz);
    const unknown = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, null, 'unknown-formation');
    const activeA = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, null, FORMATION_MODE);
    const activeB = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, null, FORMATION_MODE);

    assert.equal(off.formation, null);
    assert.equal(unknown.formation, null);
    assert.equal(Object.hasOwn(off.game, 'playerPositionTransform'), false);
    assert.equal(Object.hasOwn(unknown.game, 'playerPositionTransform'), false);
    assert.notStrictEqual(activeA.formation, activeB.formation);
    assert.equal(typeof activeA.game.playerPositionTransform, 'function');
    assert.equal(typeof activeB.game.playerPositionTransform, 'function');
    assert.equal(activeA.formation.runtime.initialized, true);
    assert.equal(activeA.game.ram.u16(TALLY.side1), 4);
    assert.deepEqual(activeA.authentic, DEFAULT_PAIR);
    assert.equal(activeA.stats().formationId, ID);
    assert.match(activeA.stats().formationControl, /P1 steers both.*manual Button 2/);

    clearCoin();
    clearTouch();
    assert.equal(selectTouchOwner('P1'), true);
    setTouchDirections(1 << BIT.right);
    setTouchButton('SHOT', true);
    setTouchButton('BOMB', true);
    let steppedWith = null;
    const realStep = activeA.game.step.bind(activeA.game);
    activeA.game.step = (word) => {
      steppedWith = word;
      return realStep(word);
    };
    try {
      activeA.step();
      activeA.step();
      assert.equal(activeA.game.ram.u16(RAM.player2 + P.state), 0x8000,
        'request 4 built the live P2 record');
      assert.equal(activeA.game.ram.u16(RAM.player2 + P.shipSel), 2);
      assert.equal(activeA.game.ram.u16(RAM.player2 + P.optFormation), 2);
      const p2Actor = Array.from({ length: ALLOC.slots }, (_, i) =>
        ALLOC.table + i * ALLOC.stride).find((slot) =>
        activeA.game.ram.u16(slot) === 0x8003 && activeA.game.ram.u8(slot + 0x07) === 1);
      assert.notEqual(p2Actor, undefined, 'P2 exists as the allocator-backed type-3 actor');

      const packed = mirrorsFromPort(steppedWith);
      assert.notEqual(packed.p1 & (1 << BIT.right), 0);
      assert.notEqual(packed.p2 & (1 << BIT.right), 0,
        'active Demo copies P1 steering into genuine P2 input');
      assert.notEqual(packed.p1 & (1 << BIT.b1), 0);
      assert.notEqual(packed.p2 & (1 << BIT.b1), 0);
      assert.notEqual(packed.p1 & (1 << BIT.b2), 0, 'P1 keeps manual Button 2');
      assert.equal(packed.p2 & (1 << BIT.b2), 0, 'formation does not duplicate Button 2');
    } finally {
      clearTouch();
      clearCoin();
    }
  });

test('W609 replay v1 refuses active formation without changing ordinary policy', async () => {
  const formation = createFormationState(FORMATION_MODE);
  const oldRecording = { keep: 'recording' };
  const recordingHost = {
    formation,
    recorder: oldRecording,
    playback: { keep: 'playing' },
    get game() { throw new Error('REC touched the game before refusing formation'); },
  };
  await assert.rejects(() => Demo.prototype.armRecording.call(recordingHost),
    /REC is unavailable while formation mode is active.*Replay v1 cannot encode formation state/);
  assert.strictEqual(recordingHost.recorder, oldRecording);
  assert.deepEqual(recordingHost.playback, { keep: 'playing' },
    'REC refusal leaves playback and recorder state untouched');

  const oldGame = { keep: 'game' };
  const oldPlayback = { keep: 'playback' };
  const oldRecorder = { keep: 'recorder' };
  const playbackHost = {
    formation, game: oldGame, playback: oldPlayback, recorder: oldRecorder,
  };
  assert.throws(() => Demo.prototype.playFrom.call(playbackHost, {}),
    /PLAY is unavailable while formation mode is active.*Replay v1 cannot encode formation state/);
  assert.strictEqual(playbackHost.game, oldGame);
  assert.strictEqual(playbackHost.playback, oldPlayback);
  assert.strictEqual(playbackHost.recorder, oldRecorder,
    'PLAY refusal occurs before any replay state is replaced');

  assert.throws(() => Demo.prototype.playFrom.call({
    formation: null,
    mods: createModState(resolveLoadout(['precision-ship'])),
  }, {}), /PLAY is unavailable.*Precision Ship/,
  'ordinary mod replay compatibility remains unchanged');
});

test('W609 start transitions keep explicit P2 separate from formation-derived P2', () => {
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  const formationStart = start.indexOf(
    "document.getElementById('formation-side-by-side').addEventListener");
  const formationHandler = start.slice(formationStart,
    start.indexOf("for (const button of document.querySelectorAll('[data-auth-ship]'))",
      formationStart));
  const originalHandler = start.slice(
    start.indexOf("document.getElementById('vanilla').addEventListener"),
    start.indexOf("document.getElementById('clear').addEventListener"));
  const clearHandler = start.slice(
    start.indexOf("document.getElementById('clear').addEventListener"),
    start.indexOf("document.getElementById('games').addEventListener"));

  assert.match(start, /let explicitP2Joined = false/);
  assert.match(start,
    /function effectiveP2Selection\(\)[\s\S]*if \(!formationActive\)[\s\S]*explicitP2Joined[\s\S]*FORMATION_MODE\.authenticSelection\.p2/,
    'formation defaults are derived only while formation is active');
  assert.doesNotMatch(formationHandler, /explicitP2Joined\s*=/,
    'formation on and off never manufacture an explicit P2 join');
  assert.match(formationHandler,
    /!formationActive && explicitP2Joined[\s\S]*authenticP2ShipExplicit = true[\s\S]*authenticP2StyleExplicit = true/,
    'a P2 pair chosen before formation remains an explicit pair');
  assert.doesNotMatch(originalHandler, /explicitP2Joined\s*=/,
    'Original removes derived formation P2 without erasing a pre-existing P2');
  assert.doesNotMatch(clearHandler, /explicitP2Joined\s*=/,
    'CLEAR removes derived formation P2 without converting or erasing explicit P2');
  assert.doesNotMatch(start, /\bp2Joined\b/,
    'the old shared explicit-and-derived P2 state cannot leak across transitions');
});

test('W609 start navigation restores URL state without writing a history loop', () => {
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  const restore = start.slice(start.indexOf('function restoreStateFromLocation()'),
    start.indexOf('function effectiveP2Selection()'));
  const navigation = start.slice(start.indexOf('function restoreNavigationState()'));

  assert.match(restore, /hashToLoadout\(location\.hash\)/);
  assert.match(restore, /hashToFormation\(location\.hash\)/);
  assert.match(restore, /new URLSearchParams\(location\.search\)/);
  assert.match(restore, /formationAuthenticOverridesFromParams\(params\)/);
  assert.match(start, /history\.pushState\(null, '', target\)/,
    'control changes make one shareable URL history entry');
  assert.match(navigation, /addEventListener\('hashchange', restoreNavigationState\)/);
  assert.match(navigation, /addEventListener\('popstate', restoreNavigationState\)/);
  assert.match(navigation, /sync\(\{ writeHistory: false \}\)/,
    'Back and Forward restoration cannot push another entry');
  assert.doesNotMatch(start, /location\.hash\s*=/,
    'state synchronization does not trigger a recursive hashchange write');
});

test('W609 start and runtime UI keep formation separate and label control ownership', () => {
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  const browser = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');

  assert.equal(MOD_IDS.length, 32);
  assert.equal(Object.hasOwn(MODS, ID), false);
  assert.equal([...start.matchAll(/id="formation-side-by-side"/g)].length, 1);
  assert.match(start, /<span>Fly Both Ships Side by Side<\/span>/);
  assert.match(start, /loadoutToHash\(resolved\.ids\)[\s\S]*formationToHash/,
    'start-page hash keeps deterministic mods-first formation ordering');
  assert.match(start, /authenticSelectionQuery\(\{[\s\S]*authenticP2Ship/);

  assert.match(browser, /id="formation-active" role="status"/);
  assert.match(browser,
    /id="formation-pad-note"[^>]*>P1 steers both ships \/ P1 owns manual Button 2/);
  assert.match(browser, /selectedFormation[\s\S]*selectTouchOwner\(owner, \{ p2Joined: false \}\)/,
    'formation touch input stays honestly routed through P1');
  assert.match(app,
    /const gameFormation = this\.formation \? formationGameOptions\(this\.formation\) : null/);
  assert.match(app, /\.\.\.\(gameFormation \?\? \{\}\)/);
  assert.match(app,
    /const modPw = transformModInput[\s\S]*this\.formation[\s\S]*prepareFormationFrame\(this\.formation, g, modPw\)[\s\S]*g\.step\(pw\)/);
  assert.match(app, /assertFormationReplayCompatible\(this\.formation, 'REC'\)/);
  assert.match(app, /assertFormationReplayCompatible\(this\.formation, 'PLAY'\)/);
});
