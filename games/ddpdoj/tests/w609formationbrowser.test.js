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
  FORMATION_MODE, FORMATION_THREE_MODE, createFormationState,
  formationAuthenticOverridesFromParams, formationToHash, hashToFormation,
  initializeFormation, resolveFormationAuthenticSelection, transformFormationInput,
} from '../src/formation.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  clearCoin, clearTouch, selectTouchOwner, setTouchButton, setTouchDirections,
} from '../src/web/input.js';

const ID = 'fly-both-ships-side-by-side';
const DEFAULT_SELECTION = { ship: 0, style: 2 };

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

test('W609 formation query accepts P1 fields and rejects every native-P2 field', () => {
  const p1Only = formationAuthenticOverridesFromParams(
    new URLSearchParams('ship=2&style=6'));
  assert.deepEqual(p1Only, { ship: 2, style: 6 });
  const selected = resolveFormationAuthenticSelection(FORMATION_MODE, p1Only);
  assert.deepEqual(selected, { ship: 2, style: 6 });
  assert.equal(authenticSelectionQuery(selected), '?ship=2&style=6');

  for (const query of ['p2=1', 'p2ship=2', 'p2style=6',
    'ship=2&style=6&p2=1&p2ship=0&p2style=4']) {
    assert.equal(formationAuthenticOverridesFromParams(new URLSearchParams(query)), null);
  }
  assert.equal(formationAuthenticOverridesFromParams(new URLSearchParams()), null);
  assert.deepEqual(resolveFormationAuthenticSelection(FORMATION_MODE), DEFAULT_SELECTION);
  assert.equal(resolveFormationAuthenticSelection(FORMATION_MODE, {
    ship: 0, style: 2, p2: { ship: 2, style: 6 },
  }), null);
});

test('W609 default formation selection never arms genuine allocator-backed P2 request 4', () => {
  const ram = new Ram();
  const selected = resolveFormationAuthenticSelection(FORMATION_MODE);
  assert.deepEqual(selected, DEFAULT_SELECTION);
  assert.equal(applyAuthenticSelection({ ram, rom: {} }, selected), null,
    'the default P1 pair needs no selector patch');
  assert.equal(ram.u16(0x813086), 0);
  assert.equal(ram.u16(0x81308a), 0);
  assert.equal(ram.u16(TALLY.side1), 0);
  assert.equal(ram.u16(TALLY.side1 + 0x02), 0);
});

test('W609 Demo step applies catalogue input before private companion input', () => {
  clearCoin();
  clearTouch();
  assert.equal(selectTouchOwner('P1'), true);
  setTouchDirections(1 << BIT.right);
  setTouchButton('SHOT', true);

  try {
    const ram = new Ram();
    ram.setU16(RAM.player1 + P.state, 0x8000);
    ram.setU16(RAM.player1 + P.posY, 0x2000);
    ram.setU16(RAM.player1 + P.posX, 0x1000);
    ram.setU8(RAM.player1 + P.speedIdx, 7);
    let angleNibble = null;
    const game = {
      ram,
      rom: {
        u16(address) {
          if (address >= ALLOC.dispatch && address < ALLOC.dispatch + 0x40) return 0x10;
          return 0;
        },
      },
      tables: {
        angleFor(nibble) { angleNibble = nibble; return 0xff; },
        vector() { throw new Error('the precision mod removed movement first'); },
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
    assert.equal(angleNibble, 0, 'formation sees the direction after precision filtering');
    const packed = mirrorsFromPort(game.steppedWith);
    assert.equal(packed.p1 & 0x0f, 0, 'precision removed P1 direction first');
    assert.equal(packed.p2 & 0x7f, 0, 'formation left the native P2 byte unchanged');
    assert.notEqual(packed.p1 & (1 << BIT.b1), 0);
    const companion = formation.foundation.companions[0];
    assert.equal(companion.memory.u16(companion.binding.input.raw),
      mirrorsFromPort(afterMod).p1 & 0x005f);
    assert.notEqual(companion.memory.u16(companion.binding.input.raw) & (1 << BIT.b1), 0);
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

test('W609 Demo constructs both P1-owned formations and keeps native P2 separate',
  { skip: SKIP_ASSETS }, async () => {
    const bundle = await localBundle();
    const off = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz);
    const unknown = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, null, 'unknown-formation');
    const activeTwo = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, null, FORMATION_MODE);
    const activeThree = new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null, null, FORMATION_THREE_MODE);

    assert.equal(off.formation, null);
    assert.equal(unknown.formation, null);
    assert.equal(Object.hasOwn(off.game, 'playerPositionTransform'), false);
    assert.equal(Object.hasOwn(unknown.game, 'playerPositionTransform'), false);
    assert.equal(activeTwo.formation.foundation.companions.length, 1);
    assert.equal(activeThree.formation.foundation.companions.length, 2);
    assert.equal(typeof activeTwo.game.playerPositionTransform, 'function');
    assert.equal(typeof activeThree.game.playerPositionTransform, 'function');
    assert.deepEqual(activeTwo.authentic, DEFAULT_SELECTION);
    assert.equal(activeTwo.stats().formationId, ID);
    assert.equal(activeTwo.stats().formationControl,
      'P1 steers 2 ships and owns all score, chain, and progression.');
    assert.equal(activeThree.stats().formationControl,
      'P1 steers 3 ships and owns all score, chain, and progression.');
    assert.throws(() => new Demo(fakeCanvas(), bundle, MACHINE.refreshHz,
      undefined, null, null, null,
      { ship: 0, style: 2, p2: { ship: 2, style: 2 } }, FORMATION_MODE),
    /formation mode cannot be combined with a native P2 selection/);

    clearCoin();
    clearTouch();
    assert.equal(selectTouchOwner('P1'), true);
    setTouchDirections(1 << BIT.right);
    setTouchButton('SHOT', true);
    setTouchButton('BOMB', true);
    let steppedWith = null;
    const p2Before = activeTwo.game.ram.b.slice(
      RAM.player2 - MACHINE.ramBase,
      RAM.player2 - MACHINE.ramBase + P.stride,
    );
    const realStep = activeTwo.game.step.bind(activeTwo.game);
    activeTwo.game.step = (word) => {
      steppedWith = word;
      return realStep(word);
    };
    try {
      activeTwo.step();
      activeTwo.step();
      assert.deepEqual(activeTwo.game.ram.b.slice(
        RAM.player2 - MACHINE.ramBase,
        RAM.player2 - MACHINE.ramBase + P.stride,
      ), p2Before);
      const companionActor = Array.from({ length: ALLOC.slots }, (_, i) =>
        ALLOC.table + i * ALLOC.stride).find((slot) =>
        activeTwo.game.ram.u16(slot) === 0x8003
          && activeTwo.game.ram.u8(slot + 0x07) === 2);
      assert.notEqual(companionActor, undefined);
      const nativeP2Actor = Array.from({ length: ALLOC.slots }, (_, i) =>
        ALLOC.table + i * ALLOC.stride).find((slot) =>
        activeTwo.game.ram.u16(slot) === 0x8003
          && activeTwo.game.ram.u8(slot + 0x07) === 1);
      assert.equal(nativeP2Actor, undefined);

      const packed = mirrorsFromPort(steppedWith);
      assert.notEqual(packed.p1 & (1 << BIT.right), 0);
      assert.notEqual(packed.p1 & (1 << BIT.b1), 0);
      assert.notEqual(packed.p1 & (1 << BIT.b2), 0);
      assert.equal(packed.p2 & 0x7f, 0, 'formation does not synthesize native P2 input');
      const companion = activeTwo.formation.foundation.companions[0];
      assert.notEqual(companion.memory.u16(companion.binding.input.raw)
        & (1 << BIT.right), 0);
      assert.notEqual(companion.memory.u16(companion.binding.input.raw)
        & (1 << BIT.b1), 0);
      assert.equal(companion.memory.u16(companion.binding.input.raw)
        & (1 << BIT.b2), 0);
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

test('W609 start keeps explicit native P2 separate and blocks every formation conflict', () => {
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  const formationStart = start.indexOf(
    "document.getElementById('formation-side-by-side').addEventListener");
  const formationHandlers = start.slice(formationStart,
    start.indexOf("for (const button of document.querySelectorAll('[data-auth-ship]'))",
      formationStart));
  const launchHandler = start.slice(
    start.indexOf("document.getElementById('launch').addEventListener"),
    start.indexOf('function restoreNavigationState()'));

  assert.match(start, /let explicitP2Joined = false/);
  assert.match(start,
    /function effectiveP2Selection\(\)[\s\S]*return explicitP2Joined[\s\S]*authenticP2Ship[\s\S]*: null/);
  assert.doesNotMatch(formationHandlers, /explicitP2Joined\s*=/,
    'formation toggles never manufacture or erase a genuine P2 join');
  assert.match(start, /const formationP2Conflict = !!formationActive && explicitP2Joined/);
  assert.match(start, /document\.getElementById\('launch'\)\.disabled = formationP2Conflict/);
  assert.match(start,
    /Formation cannot be combined with an explicit native P2 selection/);
  assert.match(launchHandler, /if \(formationActive && explicitP2Joined\) return/);
  assert.match(start,
    /formationActive[\s\S]*P1-owned companion[\s\S]*Native P2 not joined/);
  assert.doesNotMatch(start, /FORMATION_MODE\.authenticSelection\.p2/,
    'formation does not derive a native P2 pair');
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

test('W609 menu and runtime expose both P1-owned formations and disabled White Label', () => {
  const start = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  const browser = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../src/web/app.js', import.meta.url), 'utf8');

  assert.equal(MOD_IDS.length, 32);
  assert.equal(Object.hasOwn(MODS, ID), false);
  assert.equal([...start.matchAll(/id="formation-side-by-side"/g)].length, 1);
  assert.equal([...start.matchAll(/id="formation-three"/g)].length, 1);
  assert.match(start, /<span>Fly Both Ships Side by Side<\/span>/);
  assert.match(start, /<span>All Three Ships<\/span>/);
  assert.match(start,
    /id="edition-white-label"[^>]*aria-pressed="false"[\s\S]*aria-disabled="true" disabled/);
  assert.match(start, /White Label remains non-selectable/);
  assert.match(start, /loadoutToHash\(resolved\.ids\)[\s\S]*formationToHash/,
    'start-page hash keeps deterministic mods-first formation ordering');
  assert.match(start,
    /function launchAuthenticQuery\(\)[\s\S]*if \(formationActive\) return formationAuthenticQuery\(\)/);

  assert.match(browser, /id="formation-active" role="status"/);
  assert.match(browser,
    /id="formation-pad-note"[\s\S]*P1 steers every formation ship \/ all companion rewards belong to P1/);
  assert.match(browser,
    /const formationP2Conflict = !!selectedFormation[\s\S]*\['p2', 'p2ship', 'p2style'\]/);
  assert.match(browser,
    /if \(formationP2Conflict\)[\s\S]*formation mode cannot be combined with a native P2 selection/);
  assert.match(browser, /selectedFormation[\s\S]*selectTouchOwner\(owner, \{ p2Joined: false \}\)/,
    'formation touch input stays routed through P1');
  assert.match(app,
    /P1 steers \$\{this\.formation\.mode\.companions\.length \+ 1\} ships and owns all score, chain, and progression/);
  assert.match(app,
    /const modPw = transformModInput[\s\S]*this\.formation[\s\S]*prepareFormationFrame\(this\.formation, g, modPw\)[\s\S]*g\.step\(pw\)/);
  assert.match(app, /assertFormationReplayCompatible\(this\.formation, 'REC'\)/);
  assert.match(app, /assertFormationReplayCompatible\(this\.formation, 'PLAY'\)/);
});
