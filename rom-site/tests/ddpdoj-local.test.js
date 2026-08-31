import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertReplayCompatible, bindModGame, createModState, exportModReplaySeed,
  resolveLoadout,
} from '../../games/ddpdoj/src/mods.js';
import { Game, MACHINE, RAM } from '../../games/ddpdoj/src/main.js';
import { Ram } from '../../games/ddpdoj/src/ram.js';
import { adoptCurrentWindows } from '../../games/ddpdoj/src/rom.js';
import {
  clearCoin, clearTouch, currentCoinWord, currentPortWord, setCoinKey,
  setTouchButton,
} from '../../games/ddpdoj/src/web/input.js';
import { b64, FORMAT_V2, unb64 } from '../../games/ddpdoj/src/web/replay.js';
import { SCREEN_H, SCREEN_W } from '../../games/ddpdoj/src/render/igs023.js';
import {
  assertFormationReplayCompatible, createFormationState, FORMATION_MODE,
} from '../../games/ddpdoj/src/formation.js';
import {
  authenticP2Joined, latchAuthenticP2Joined, localReplaySeedArm,
  localReplayTables, localReplayTablesMatch,
} from '../src/ddpdoj-local-state.js';
import { LocalDdpdojRuntime } from '../src/ddpdoj-local.js';

test('local touch ownership opens only for the cartridge two-player count', () => {
  assert.equal(authenticP2Joined(0xffff), false,
    'no active player is not an authentic P2 join');
  assert.equal(authenticP2Joined(0), false,
    'one-player play keeps the touch panel on P1');
  assert.equal(authenticP2Joined(1), true,
    'the cartridge two-player count enables authentic P2 touch ownership');
});

test('formation companions never count as authentic P2', () => {
  assert.equal(authenticP2Joined(1, { mode: 'formation' }), false,
    'a private P1-owned formation cannot unlock the P2 touch panel');
});

test('an authentic P2 join stays latched for the runtime', () => {
  assert.equal(latchAuthenticP2Joined(false, 1), true,
    'the cartridge two-player state opens P2 ownership');
  assert.equal(latchAuthenticP2Joined(true, 0), true,
    'P2 death or continue does not revoke an established join');
  assert.equal(latchAuthenticP2Joined(false, 1, { mode: 'formation' }), false,
    'formation state never creates an authentic P2 join');
});

test('local replay tables omit packaged cartridge windows without mutating runtime tables', () => {
  const tables = { code: [1, 2, 3], rom: { program: 'packaged-window' } };
  const replayTables = localReplayTables(tables);

  assert.deepEqual(replayTables, { code: [1, 2, 3] });
  assert.equal(Object.hasOwn(replayTables, 'rom'), false,
    'a Mixup-local replay must not serialize cartridge ROM windows');
  assert.equal(tables.rom.program, 'packaged-window',
    'sanitizing a replay seed must not alter the active runtime tables');
});

test('local replay tables accept the valid legacy asset-backed schema safely', async () => {
  const path = new URL(
    '../../games/ddpdoj/tools/oracle/out/w69/fly-around/fly-around.lf2000-2250.replay',
    import.meta.url,
  );
  const replay = JSON.parse(await readFile(path, 'utf8'));
  const legacy = JSON.parse(Buffer.from(replay.seed.tablesB64, 'base64').toString('utf8'));
  const trusted = structuredClone(localReplayTables(legacy));

  for (const key of ['_note', 'knockback', 'shot', 'option']) delete trusted[key];
  delete trusted.speed.quadBase;
  delete trusted.speed.quadStride;
  trusted.speed.exported.push(69);
  trusted.speed.quads['69'] = structuredClone(trusted.speed.quads['68']);
  trusted.anim.a.shipSel2 = structuredClone(trusted.anim.a.shipSel0);
  trusted.anim.hitX.reads = '$249E68/$249E72/$2459E4/$2459E8';

  assert.equal(localReplayTablesMatch(legacy, trusted), true,
    'legacy metadata, sparse speeds, and an absent Type-B row remain compatible');

  const malformed = structuredClone(legacy);
  delete malformed.dirTable.bytes;
  assert.equal(localReplayTablesMatch(malformed, trusted), false,
    'a malformed replay table cannot replace trusted local simulation data');

  const altered = structuredClone(legacy);
  altered.speed.quads['0'][0][0]++;
  assert.equal(localReplayTablesMatch(altered, trusted), false,
    'altered supplied simulation data cannot claim the selected ROM identity');

  const invalidTypeB = structuredClone(trusted);
  invalidTypeB.anim.a.shipSel2 = null;
  assert.equal(localReplayTablesMatch(invalidTypeB, trusted), false,
    'a supplied Type-B row cannot bypass validation with null');
});

test('local replay seeds preserve the armed slowdown semaphore', () => {
  const ram = new Uint8Array(8);
  ram[3] = 2;
  assert.equal(localReplaySeedArm({ arm: 2 }, ram, 3), 2,
    'a Mixup-local replay carries its explicit next-frame slowdown');
  assert.equal(localReplaySeedArm({}, ram, 3), 2,
    'an older replay recovers slowdown from its RAM semaphore');
  ram[3] = 0;
  assert.equal(localReplaySeedArm({}, ram, 3), 1,
    'an older pre-arm seed keeps the historical one-vblank default');
  assert.equal(localReplaySeedArm({ arm: 0 }, ram, 3), 0,
    'a modern cold-fallthrough seed preserves its explicit zero arm');
  assert.throws(() => localReplaySeedArm({ arm: 2 }, ram, 3),
    /does not match its RAM semaphore/,
    'an explicit seed arm cannot contradict the replay RAM');
});

test('Mixup REC records matched player and coin words with Playable state', async () => {
  const mods = createModState(resolveLoadout(['playable-hibachi']));
  const game = {
    ram: new Ram(),
    rom: {
      bytes(address, length) {
        return Uint8Array.from({ length }, (_, index) => (address + index) & 0xff);
      },
    },
    tables: {},
    vram: { w: new Uint16Array(0x800) },
    logicFrame: 40,
    videoFrame: 61,
    armedVblanks: 1,
    displayList: null,
    step(word) { this.lastStep = [word, this.coinPort]; },
  };
  bindModGame(mods, game);
  const runtime = Object.assign(Object.create(LocalDdpdojRuntime.prototype), {
    game,
    modState: mods,
    formationState: null,
    tables: { replayMarker: true },
    recorder: null,
    playback: null,
    replayGeneration: 0,
    audio: null,
    runaheadFrames: 0,
    runaheadView: null,
    spritebuffer: new Uint16Array(0),
    spritePrivatePaletteBanks: new Int8Array(0),
    hitboxRam: null,
    p2Joined: false,
    onP2Joined: null,
  });

  const armed = await runtime.armRecording();
  assert.deepEqual(armed.seed.mods.ids, ['playable-hibachi']);
  assert.equal(armed.seed.mods.playableHibachi.kind, 'ddpdoj.playable-hibachi/v1');

  const captured = [];
  let feeds = 0;
  runtime.recorder = {
    input(playerWord, coinWord) { captured.push([playerWord, coinWord]); },
    feed() { feeds++; },
  };
  clearTouch();
  clearCoin();
  setTouchButton('SHOT', true);
  setCoinKey('COIN1', true);
  const expected = [currentPortWord(), currentCoinWord()];
  try {
    runtime.step({ project: false });
  } finally {
    clearTouch();
    clearCoin();
  }

  assert.deepEqual(captured, [expected]);
  assert.deepEqual(game.lastStep, expected,
    'the coin word recorded beside the player word is authoritative at Game.step');
  assert.equal(feeds, 1);
});

const LOCAL_FIXTURE = new URL(
  '../../games/ddpdoj/tools/oracle/out/w69/fly-around/fly-around.lf2000-2250.replay',
  import.meta.url,
);
const LOCAL_TABLES = new URL(
  '../../games/ddpdoj/rip/port/player.tables.json', import.meta.url,
);

async function localPlayableReplay(t) {
  let obj;
  let tables;
  try {
    [obj, tables] = await Promise.all([
      readFile(LOCAL_FIXTURE, 'utf8').then(JSON.parse),
      readFile(LOCAL_TABLES, 'utf8').then(JSON.parse),
    ]);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      t.skip('local replay fixture or extracted tables absent');
      return null;
    }
    throw error;
  }
  const replayTables = JSON.parse(new TextDecoder().decode(unb64(obj.seed.tablesB64)));
  replayTables.rom = adoptCurrentWindows(replayTables.rom, tables.rom);
  obj.seed.tablesB64 = b64(new TextEncoder().encode(JSON.stringify(replayTables)));
  const ram = unb64(obj.seed.ramB64);
  ram[RAM.semaphore - MACHINE.ramBase] = 1;
  obj.seed.ramB64 = b64(ram);
  obj.seed.arm = 1;
  obj.format = FORMAT_V2;
  const coinBytes = new Uint8Array(obj.portin.count * 2).fill(0xff);
  coinBytes[1] = 0xfe;
  obj.coinin = {
    encoding: 'u16be', count: obj.portin.count, b64: b64(coinBytes),
  };

  const recorded = createModState(resolveLoadout(['playable-hibachi']));
  bindModGame(recorded, {
    ram: new Ram(),
    rom: { bytes: (_address, length) => new Uint8Array(length).fill(0x5a) },
    tables: {},
  });
  recorded.playableHibachi.ownedBullets[13] = 2;
  recorded.playableHibachi.selectedGuns.set([3, 8]);
  obj.seed.mods = exportModReplaySeed(recorded);
  return { obj, tables, recorded };
}

function localPlaybackHost(tables, mods, game = { marker: 'visible' }) {
  return Object.assign(Object.create(LocalDdpdojRuntime.prototype), {
    game,
    modState: mods,
    formationState: null,
    recorder: null,
    playback: null,
    preparedTables: tables,
    tables,
    rom: undefined,
    audio: null,
    soundAssets: null,
    spritebuffer: new Uint16Array(0),
    spritePrivatePaletteBanks: new Int8Array(0),
    privateSpritePaletteWords: null,
    renderPaletteWords: null,
    paletteRgb: new Uint8Array(0),
    hitboxRam: null,
    runaheadView: null,
    p2Joined: false,
    onP2Joined: null,
    onReplayUpdate: null,
    resyncTiming() {},
  });
}

test('Mixup PLAY validates Playable state before swapping and feeds recorded coins', async (t) => {
  const fixture = await localPlayableReplay(t);
  if (!fixture) return;
  const selected = createModState(resolveLoadout(['playable-hibachi']));
  const malformed = structuredClone(fixture.obj);
  malformed.seed.mods.playableHibachi.fingerprints.sidecarBytes = 1;
  const visible = { marker: 'visible' };
  const rejected = localPlaybackHost(fixture.tables, selected, visible);

  assert.throws(() => rejected.playFrom(malformed),
    /fingerprint sidecarBytes does not match/);
  assert.strictEqual(rejected.game, visible);
  assert.strictEqual(rejected.modState, selected);
  assert.equal(rejected.playback, null);

  const runtime = localPlaybackHost(fixture.tables, selected);
  runtime.playFrom(fixture.obj);
  assert.notEqual(runtime.game.marker, 'visible');
  assert.notStrictEqual(runtime.modState, selected,
    'a valid replay swaps in a detached mod candidate');
  assert.equal(runtime.modState.playableHibachi.ownedBullets[13], 2);
  assert.deepEqual([...runtime.modState.playableHibachi.selectedGuns], [3, 8]);
  assert.deepEqual([...runtime.playback.coinWords.slice(0, 2)], [0xfffe, 0xffff]);

  let seen = null;
  const step = runtime.game.step.bind(runtime.game);
  runtime.game.step = (playerWord) => {
    seen = [playerWord, runtime.game.coinPort];
    return step(playerWord);
  };
  runtime.step({ project: false });
  assert.equal(seen[1], 0xfffe,
    'PLAY assigns the recorded coin word before advancing the replacement Game');
});

test('Mixup renderer forwards private palette metadata and namespace', () => {
  let request = null;
  let presented = 0;
  const privateBanks = new Int8Array(256).fill(-1);
  privateBanks[4] = 2;
  const privateWords = new Uint16Array(9 * 32).fill(0x1234);
  const runtime = Object.assign(Object.create(LocalDdpdojRuntime.prototype), {
    renderer: {
      renderIndexed(next) {
        request = next;
        return new Uint16Array(SCREEN_W * SCREEN_H);
      },
    },
    game: {
      vram: { w: new Uint16Array(0) },
      txvram: { w: new Uint16Array(0) },
      video: {},
      palette: { words: new Uint16Array(0x1000) },
      ram: new Ram(),
    },
    rowscroll: new Uint16Array(SCREEN_H),
    zoomram: new Uint16Array(0),
    spritebuffer: new Uint16Array(0),
    spritePrivatePaletteBanks: privateBanks,
    privateSpritePaletteWords: privateWords,
    renderPaletteWords: new Uint16Array(0x1000 + privateWords.length),
    paletteRgb: new Uint8Array((0x1000 + privateWords.length) * 3),
    rgb: new Uint8Array(SCREEN_W * SCREEN_H * 3),
    rgba: new Uint8ClampedArray(SCREEN_W * SCREEN_H * 4),
    modState: null,
    hitboxRam: null,
    mode: 'yoko',
    image: {},
    context: { putImageData() { presented++; } },
  });

  runtime.draw(null);
  assert.strictEqual(request.spritePrivatePaletteBanks, privateBanks);
  assert.equal(request.spritePrivatePaletteBase, 0x1000);
  assert.equal(runtime.renderPaletteWords[0x1000], 0x1234);
  assert.equal(presented, 1);
});

test('local runtime uses the measured PGM period and shared dual-clock cadence', async () => {
  const source = await readFile(new URL('../src/ddpdoj-local.js', import.meta.url), 'utf8');
  assert.match(source, /const BASE_FRAME_MS = 1000 \/ MACHINE\.refreshHz;/,
    'Mixup must use the same exact display clock as the packaged runtime');
  assert.doesNotMatch(source, /const BASE_FRAME_MS = 1000 \/ 60;/,
    'the rounded 60 Hz clock runs DaiOuJou at the wrong rate');
  assert.match(source, /import \{ DdpdojCadence \} from '\.\.\/\.\.\/games\/ddpdoj\/src\/cadence\.js';/);
  assert.match(source, /this\.cadence = new DdpdojCadence\(BASE_FRAME_MS\);/);
  assert.match(source,
    /BASE_FRAME_MS \* transformCartridgeSlowdown\(\s*this\.modState, this\.game\.armedVblanks,/,
    'Mixup applies the shared No Slowdown arm policy before timing modifiers');
  assert.match(source, /stepSound: \(\) => this\.audio\?\.tick\(\)/,
    'sound hardware must advance independently of canonical logic');
  assert.doesNotMatch(source, /Math\.max\(1, this\.game\.armedVblanks/,
    'cold arm zero must remain an immediate logic fall-through');
});

test('local PLAY restores replay sound state without arbitrary pre-roll', async () => {
  const source = await readFile(new URL('../src/ddpdoj-local.js', import.meta.url), 'utf8');
  assert.match(source,
    /obj\.seed\.sound[\s\S]*?soundRuntimeFromSnapshot\([\s\S]*?this\.soundAssets,[\s\S]*?obj\.seed\.sound\)[\s\S]*?: soundRuntimeFromAssets\(this\.soundAssets,[\s\S]*?this\.audio\.resetGameAudio\(soundRuntime\);/,
    'a replay checkpoint replaces Z80, sequencer, ICS voice, and queued host state');
  assert.doesNotMatch(source,
    /soundRuntimeFromStage1Seed\(\s*this\.soundAssets/,
    'arbitrary replay clocks must not trigger synchronous Stage 1 reconstruction');
});

test('local visibility resync resets DaiOuJou host chronology', async () => {
  const source = await readFile(new URL('../src/local-shell.js', import.meta.url), 'utf8');
  assert.match(source,
    /if \(this\.gameId === 'ddpdoj'\) this\.runtime\?\.resyncTiming\?\.\(\);/);
});

test('Mixup exposes and routes every selectable formation member', async () => {
  const shell = await readFile(new URL('../src/local-shell.js', import.meta.url), 'utf8');
  const runtime = await readFile(new URL('../src/ddpdoj-local.js', import.meta.url), 'utf8');

  assert.match(shell, /formationRoster: null/);
  assert.match(shell,
    /state\.formationRoster = value \? Formation\.defaultFormationRoster\(value\) : null/);
  assert.match(shell,
    /state\.formationRoster\.forEach\(\(selection, member\)[\s\S]*local-formation-member-\$\{member \+ 1\}-ship[\s\S]*local-formation-member-\$\{member \+ 1\}-style/);
  assert.match(shell,
    /formationRoster: state\.formation \? state\.formationRoster : null/);
  assert.match(shell,
    /attachGamepadMenu\(this\.picker,[\s\S]*primary: \(\) => this\.startButton/);
  assert.match(runtime,
    /createFormationState\(\s*config\.formation, config\.formationRoster \?\? null\)/);
  assert.match(runtime,
    /beginFormationCreditedRun\(formationState, game, formationSelection\)/,
    'the selected roster remains pending until the credited cabinet handoff');
});

test('local replay refuses formations and simulation-changing mods', () => {
  const formation = createFormationState(FORMATION_MODE.id);
  assert.throws(() => assertFormationReplayCompatible(formation, 'REC'),
    /REC is unavailable while formation mode is active/);

  const simulationMod = createModState(resolveLoadout(['invincibility']));
  assert.throws(() => assertReplayCompatible(simulationMod, 'PLAY'),
    /PLAY is unavailable while simulation-changing mods are active: Invincibility/);

  const presentationMod = createModState(resolveLoadout(['invert-colors']));
  assert.doesNotThrow(() => assertReplayCompatible(presentationMod, 'PLAY'),
    'presentation-only mods do not change the replay digest simulation');
});
