// W477: shipped mod catalogue, isolated host hooks, replay policy, and the
// existing cartridge death/respawn chain with invulnerability disabled.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { RAM, P, BIT } from '../src/machine.js';
import { portWordFromBits } from '../src/input.js';
import { UnportedLog } from '../src/unported.js';
import { PaletteState } from '../src/palette.js';
import { ALLOC } from '../src/objalloc.js';
import { DEATH, playerDead24A130, updatePlayer } from '../src/player.js';
import { bonusLine125FFA8 } from '../src/tally.js';
import { Demo, progressionPokesForRung } from '../src/web/app.js';
import {
  MODS, MOD_IDS, MOD_RAM, resolveLoadout, createModState,
  loadoutToHash, hashToLoadout, applyPreFrameMods, applyPostFrameMods,
  transformModInput, transformModTiming, applyPresentationMods,
  replayPolicy,
} from '../src/mods.js';

const TABLES = JSON.parse(readFileSync(
  new URL('../rip/port/player.tables.json', import.meta.url), 'utf8'));
const ROM = new RomWindows(TABLES.rom);

const stateOf = (...ids) => createModState(resolveLoadout(ids));

function policyRam(id) {
  const ram = new Ram();
  const state = stateOf(id);
  applyPreFrameMods(state, ram);
  return { ram, state };
}

test('W477 catalogue ships nineteen functional mods after W492 additions', () => {
  assert.equal(MOD_IDS.length, 19);
  assert.deepEqual(new Set(Object.values(MODS).map((m) => m.category)),
    new Set(['survival', 'arsenal', 'challenge', 'presentation']));
  for (const [id, entry] of Object.entries(MODS)) {
    assert.ok(entry.name && entry.blurb, `${id} has player-facing metadata`);
    assert.ok(entry.effects.length > 0, `${id} names its concrete behavior`);
  }
  assert.ok(MODS.invincibility, 'Invincibility is shipped');
});

test('W477 resolver drops unknown ids, deduplicates, and orders by catalogue', () => {
  const lo = resolveLoadout(['ghost-trail', 'unknown', 'invincibility', 'ghost-trail']);
  assert.deepEqual(lo.ids, ['invincibility', 'ghost-trail']);
  assert.equal(lo.sim.invincibility, true);
  assert.equal(lo.presentation.ghost, true);
  assert.deepEqual(lo.replayBlocking, ['invincibility']);
});

test('W477 conflicts have fixed winners independent of selection order', () => {
  const a = resolveLoadout([
    'low-rank', 'maximum-rank', 'turbo', 'bullet-time',
    'bottomless-bombs', 'infinite-hyper-stock',
  ]);
  const b = resolveLoadout([
    'infinite-hyper-stock', 'bottomless-bombs', 'bullet-time', 'turbo',
    'maximum-rank', 'low-rank',
  ]);
  assert.deepEqual(a.ids, b.ids);
  assert.deepEqual(a.conflicts, b.conflicts);
  assert.deepEqual(a.ids, ['infinite-hyper-stock', 'maximum-rank', 'bullet-time']);
  assert.equal(a.sim.rank, 'maximum');
  assert.equal(a.timing.scale, 2);
  assert.equal(a.sim.infiniteHyperStock, true);
  assert.equal(a.conflicts.length, 3);
});

test('W477 hash is deterministic, round-trips, and unknown-only is empty', () => {
  const hash = loadoutToHash(['ghost-trail', 'invincibility']);
  assert.equal(hash, 'mods=invincibility+ghost-trail');
  assert.deepEqual(hashToLoadout(`#${hash}`).ids, ['invincibility', 'ghost-trail']);
  assert.deepEqual(hashToLoadout('#mods=not-a-mod+also-not').ids, []);
  assert.equal(loadoutToHash([]), '');
});

test('W477 empty and unknown-only loadouts create no mod state', () => {
  assert.equal(createModState(resolveLoadout([])), null);
  assert.equal(createModState(hashToLoadout('#mods=unknown')), null);
});

test('W477 RAM mods drive their concrete cartridge seams', () => {
  assert.equal(policyRam('invincibility').ram.u8(MOD_RAM.invulnP1), 0xff);
  assert.equal(policyRam('infinite-lives').ram.u16(MOD_RAM.livesP1), 3);

  {
    const { ram, state } = policyRam('bottomless-bombs');
    assert.equal(ram.u8(MOD_RAM.bombStockP1), 3);
    assert.equal(ram.u16(MOD_RAM.hyperStockP1), 0);
    ram.setU8(MOD_RAM.bombStockP1, 0);
    applyPostFrameMods(state, ram);
    assert.equal(ram.u8(MOD_RAM.bombStockP1), 3, 'post-frame policy restores spent stock');
  }
  assert.equal(policyRam('infinite-hyper-stock').ram.u16(MOD_RAM.hyperStockP1), 5);

  {
    const ram = new Ram();
    ram.setU16(MOD_RAM.chainHitsP1, 12);
    applyPreFrameMods(stateOf('unbreakable-chain'), ram);
    assert.equal(ram.u16(MOD_RAM.chainMeterP1), 0x7fff);
  }
  {
    const ram = new Ram();
    ram.setU32(MOD_RAM.rankClock, 0x12345678);
    ram.setU16(MOD_RAM.rankPowerP1, 8);
    ram.setU16(MOD_RAM.rankPowerP2, 9);
    applyPreFrameMods(stateOf('low-rank'), ram);
    assert.equal(ram.u32(MOD_RAM.rankClock), 0);
    assert.equal(ram.u16(MOD_RAM.rankPowerP1), 0);
    assert.equal(ram.u16(MOD_RAM.rankPowerP2), 0);
  }
  assert.equal(policyRam('maximum-rank').ram.u32(MOD_RAM.rankClock), 0xefff);
  assert.equal(policyRam('native-auto-fire').ram.u8(MOD_RAM.autoFireDip), 1);
  {
    const ram = policyRam('bullet-canceller').ram;
    assert.equal(ram.u16(MOD_RAM.cancelArm), 1);
    assert.equal(ram.u16(MOD_RAM.cancelMode), 0xffff);
  }
});

test('W477 precision input halves direction cadence without touching fire', () => {
  const state = stateOf('precision-ship');
  const held = portWordFromBits([BIT.up, BIT.b1]);
  assert.equal(transformModInput(state, held, 2), held, 'even frame keeps direction');
  assert.equal(transformModInput(state, held, 3), portWordFromBits([BIT.b1]),
    'odd frame releases only direction');
});

test('W477 timing transforms use mutually exclusive host periods', () => {
  assert.equal(transformModTiming(stateOf('turbo'), 16.896), 8.448);
  assert.equal(transformModTiming(stateOf('bullet-time'), 16.896), 33.792);
  assert.equal(transformModTiming(null, 16.896), 16.896);
});

test('W477 post-RGB transforms are deterministic and state-local', () => {
  const invert = new Uint8Array([10, 20, 30]);
  applyPresentationMods(stateOf('invert-colors'), invert);
  assert.deepEqual([...invert], [245, 235, 225]);

  const mono = new Uint8Array([255, 0, 0]);
  applyPresentationMods(stateOf('monochrome'), mono);
  assert.deepEqual([...mono], [76, 76, 76]);

  const ghostState = stateOf('ghost-trail');
  const first = new Uint8Array([100, 100, 100]);
  applyPresentationMods(ghostState, first);
  assert.deepEqual([...first], [100, 100, 100]);
  const second = new Uint8Array([0, 0, 0]);
  applyPresentationMods(ghostState, second);
  assert.deepEqual([...second], [50, 50, 50]);
});

test('W477 replay v1 permits only presentation-only loadouts', () => {
  assert.deepEqual(replayPolicy(stateOf('invert-colors')), { compatible: true, blocking: [] });
  const sim = replayPolicy(stateOf('invincibility', 'turbo'));
  assert.equal(sim.compatible, false);
  assert.deepEqual(sim.blocking, ['invincibility', 'turbo']);
  assert.throws(() => Demo.prototype.playFrom.call({ mods: stateOf('precision-ship') }, {}),
    /PLAY is unavailable.*Precision Ship/);
  assert.rejects(() => Demo.prototype.armRecording.call({
    mods: stateOf('invincibility'), recorder: null,
  }), /REC is unavailable.*Invincibility/);
});

function stubDemo({ mods = null, progressionPokes = [] } = {}) {
  const ram = new Ram();
  const game = {
    ram, logicFrame: 0, coinPort: 0xffff,
    step() { this.logicFrame++; },
  };
  return {
    game, mods, progressionPokes, playback: null, recorder: null,
    romToPacked: new Map(), listOpts: {}, portList: null,
    prevPos: null, prevTilt: 0, stepsRun: 0, bundle: {},
    inPlayback: Demo.prototype.inPlayback,
    step: Demo.prototype.step,
  };
}

test('W477 ordinary Demo step has no hidden invulnerability poke', () => {
  const demo = stubDemo();
  demo.game.ram.setU8(MOD_RAM.invulnP1, 0);
  demo.step();
  assert.equal(demo.game.ram.u8(MOD_RAM.invulnP1), 0);
});

test('W477 selected invincibility explicitly performs the $810424 write', () => {
  const demo = stubDemo({ mods: stateOf('invincibility') });
  demo.step();
  assert.equal(demo.game.ram.u8(MOD_RAM.invulnP1), 0xff);
});

test('W477 labelled progression rung keeps its explicit intervention', () => {
  const pokes = progressionPokesForRung({ poke: '810424=FF' });
  assert.deepEqual(pokes, [[0x810424, 0xff]]);
  const demo = stubDemo({ progressionPokes: pokes });
  demo.step();
  assert.equal(demo.game.ram.u8(MOD_RAM.invulnP1), 0xff);
  assert.deepEqual(progressionPokesForRung(null), []);
});

test('W477 playback applies only the replay file intervention', () => {
  const demo = stubDemo({ progressionPokes: [[MOD_RAM.invulnP1, 0x33]] });
  demo.playback = {
    ended: false, pokes: [[MOD_RAM.invulnP1, 0xff]], words: [0xffff, 0xffff],
    i: 0, count: 2, needCheck: false,
    verifier: { periodBounds: [], feed() {} },
  };
  demo.step();
  assert.equal(demo.game.ram.u8(MOD_RAM.invulnP1), 0xff);
});

const ENTRY = 0x8130fa;
const COUNT = DEATH.p1.lives;

function armRespawnEntry(ram, count) {
  ram.setU16(ENTRY, 1);
  ram.setU16(ENTRY + 0x02, 0x1234);
  ram.setU32(ENTRY + 0x08, COUNT);
  ram.setU16(ENTRY + 0x0c, 0x1000);
  ram.setU16(ENTRY + 0x0e, 0x0e00);
  ram.setU16(ENTRY + 0x14, 2);
  ram.setU8(ENTRY + 0x17, 0);
  ram.setU16(COUNT, count);
}

test('W477 death path works with invulnerability off through respawn and game over', () => {
  const ram = new Ram();
  const rec = RAM.player1;
  const slot = 0x80e240;
  const events = [];
  ram.setU16(rec, 0x9000);
  ram.setU32(rec + P.posY, 0x30001800);
  ram.setU16(rec + P.optFormation, 2);
  ram.setU8(rec + P.invuln, 0);
  ram.setU8(slot + 0x07, 0);
  ram.setU32(slot + ALLOC.idOff, 0x1234);
  armRespawnEntry(ram, 2);

  const log = new UnportedLog();
  const ctx = {
    rom: ROM, palette: new PaletteState(), unported: log, unportedLog: log,
    soundPost() {}, hyperEvent() {}, deathEvent: (...args) => events.push(args),
  };
  const noMods = createModState(resolveLoadout([]));
  applyPreFrameMods(noMods, ram);
  assert.equal(ram.u8(rec + P.invuln), 0, 'the hit starts with invulnerability disabled');

  updatePlayer(ram, slot, 0, ctx);
  assert.equal(events[0][0], 'hit');
  assert.equal(ram.u16(rec), 0x0100, 'hit processing initialized cartridge death state');

  let result = null;
  for (let n = 0; n < 100 && result !== 'reset'; n++) {
    result = playerDead24A130(ram, slot, rec, ctx, false);
  }
  assert.equal(result, 'reset');
  assert.equal(ram.u16(ENTRY), 1, 'death reset armed the existing tally dispatcher');

  bonusLine125FFA8(ram, ROM, ctx, ENTRY);
  assert.equal(ram.u16(COUNT), 1, 'respawn spent one reserve life');
  assert.equal(ram.u16(ENTRY), 0, 'respawn returned the dispatcher to idle');
  assert.equal(ram.u16(ALLOC.createStage) & 0x8000, 0x8000,
    'respawn staged the existing player object');

  ram.setU16(ALLOC.createStage, 0);
  armRespawnEntry(ram, 0);
  bonusLine125FFA8(ram, ROM, ctx, ENTRY);
  assert.equal(ram.u16(COUNT), 0xffff, 'last life decremented below zero');
  assert.equal(ram.u16(ENTRY), 2, 'supported game-over handoff armed request 2');
  assert.equal(ram.u16(ALLOC.createStage), 0, 'game over did not create another player');
  assert.deepEqual(events.map((e) => e[0]), ['hit', 'reset', 'respawn', 'game-over']);
});
