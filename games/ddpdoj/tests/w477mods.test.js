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
  MODS, MOD_IDS, MOD_RAM, resolveLoadout, createModState, prepareModCabinetBoot,
  loadoutToHash, hashToLoadout, applyPreFrameMods, applyPostFrameMods,
  transformModInput, transformModTiming, applyPresentationMods,
  replayPolicy, modGameOptions,
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

test('W477 catalogue ships thirty-two functional mods after W600 additions', () => {
  assert.equal(MOD_IDS.length, 32);
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

test('W629 cabinet loadouts stay pending through attract and activate at credited handoff', () => {
  const state = stateOf(
    'invincibility', 'infinite-lives', 'unbreakable-chain', 'infinite-hyper-stock',
    'native-auto-fire', 'bullet-canceller', 'hyper-overdrive', 'low-rank',
    'precision-ship', 'turbo', 'loop-2-from-stage-1', 'stage-remix',
  );
  const direct = modGameOptions(state);
  assert.equal(Object.hasOwn(direct, 'cabinetRunStartHook'), false,
    'seeded and direct mod states retain their immediate-run contract');
  assert.equal(Object.hasOwn(direct, 'cabinetRunEndHook'), false,
    'seeded and direct mod states do not own a cabinet lifecycle');

  prepareModCabinetBoot(state);
  const options = modGameOptions(state);
  assert.equal(typeof options.cabinetRunStartHook, 'function');
  assert.equal(typeof options.cabinetRunEndHook, 'function');
  const ram = new Ram();
  ram.setU16(MOD_RAM.livesP1, 0x2222);
  ram.setU16(MOD_RAM.chainHitsP1, 1);
  ram.setU16(MOD_RAM.chainMeterP1, 0x2345);
  ram.setU16(MOD_RAM.hyperStockP1, 0x1234);
  ram.setU8(MOD_RAM.autoFireDip, 0);
  ram.setU16(MOD_RAM.cancelArm, 0x3456);
  ram.setU16(MOD_RAM.cancelMode, 0x4567);
  ram.setU16(MOD_RAM.hyperGaugeP1, 0x5678);
  ram.setU16(MOD_RAM.hyperGaugeP2, 0x6789);
  ram.setU16(MOD_RAM.rankPowerP1, 0x789a);
  ram.setU16(MOD_RAM.rankPowerP2, 0x89ab);
  const held = portWordFromBits([BIT.up, BIT.b1]);

  applyPreFrameMods(state, ram);
  applyPostFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.livesP1), 0x2222,
    'warning, title, credit, and selector frames retain cartridge RAM');
  assert.equal(ram.u16(MOD_RAM.rankPowerP1), 0x789a);
  assert.equal(ram.u16(MOD_RAM.rankPowerP2), 0x89ab);
  assert.equal(transformModInput(state, held, 3), held,
    'the pending precision policy does not transform selector input');
  assert.equal(transformModTiming(state, 16.896), 16.896,
    'the pending timing policy leaves cabinet presentation at cabinet rate');
  assert.equal(options.enemyBulletCollisionFilter(ram,
    { player: MOD_RAM.player1, bank: 'A' }), true,
  'attract gameplay retains ordinary P1 collision behavior');
  assert.equal(options.stageAdvanceTransform(1), 1,
    'attract progression is not remixed');

  options.cabinetRunStartHook(ram, { demo: true });
  assert.equal(state.runtime.cabinetRunActive, false);
  assert.equal(ram.u16(MOD_RAM.loopCounter), 0,
    'an attract handoff cannot enter loop 2');

  options.cabinetRunStartHook(ram, { demo: false });
  assert.equal(state.runtime.cabinetRunActive, true);
  assert.equal(ram.u16(MOD_RAM.loopCounter), 1,
    'loop 2 is armed only after authentic fighter selection');
  applyPreFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.livesP1), 3);
  assert.equal(ram.u16(MOD_RAM.chainMeterP1), 0x7fff);
  assert.equal(ram.u16(MOD_RAM.hyperStockP1), 5);
  assert.equal(ram.u8(MOD_RAM.autoFireDip), 1);
  assert.equal(ram.u16(MOD_RAM.cancelArm), 1);
  assert.equal(ram.u16(MOD_RAM.cancelMode), 0xffff);
  assert.equal(ram.u16(MOD_RAM.rankPowerP1), 0);
  assert.equal(ram.u16(MOD_RAM.rankPowerP2), 0);
  assert.equal(transformModInput(state, held, 3), portWordFromBits([BIT.b1]));
  assert.equal(transformModTiming(state, 16.896), 8.448);
  assert.equal(options.enemyBulletCollisionFilter(ram,
    { player: MOD_RAM.player1, bank: 'A' }), false);
  assert.equal(options.stageAdvanceTransform(1), 2);

  state.runtime.grazeCount[0] = 7;
  state.runtime.resurrectionPositions[0] = { y: 0x1200, x: 0x3400 };
  ram.setU16(MOD_RAM.hyperGaugeP1, 0);
  ram.setU16(MOD_RAM.hyperGaugeP2, 0);
  options.cabinetRunEndHook(ram);
  assert.equal(state.runtime.cabinetRunActive, false,
    'the cartridge cabinet-return seam retires the completed run policy');
  assert.deepEqual(state.runtime.grazeCount, [0, 0]);
  assert.deepEqual(state.runtime.resurrectionPositions, [null, null]);
  assert.equal(ram.u16(MOD_RAM.chainMeterP1), 0,
    'run-owned chain policy cannot leak into the returned cabinet');
  assert.equal(ram.u16(MOD_RAM.hyperStockP1), 0,
    'authentic terminal hyper-stock clear is not rolled back');
  assert.equal(ram.u8(MOD_RAM.autoFireDip), 0,
    'Native Auto-Fire cannot leak into the returned cabinet');
  assert.equal(ram.u16(MOD_RAM.cancelArm), 0);
  assert.equal(ram.u16(MOD_RAM.cancelMode), 0);
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP1), 0,
    'authentic terminal hyper-gauge clear is not rolled back');
  assert.equal(ram.u16(MOD_RAM.hyperGaugeP2), 0);
  assert.equal(ram.u16(MOD_RAM.rankPowerP1), 0x789a,
    'Low Rank restores persistent cabinet-owned P1 rank power');
  assert.equal(ram.u16(MOD_RAM.rankPowerP2), 0x89ab,
    'Low Rank restores persistent cabinet-owned P2 rank power');
  ram.setU16(MOD_RAM.livesP1, 0x3333);
  applyPreFrameMods(state, ram);
  assert.equal(ram.u16(MOD_RAM.livesP1), 0x3333,
    'an immediate second cabinet and selector remain pending');
  assert.equal(transformModInput(state, held, 3), held);
  assert.equal(transformModTiming(state, 16.896), 16.896);
  assert.equal(options.enemyBulletCollisionFilter(ram,
    { player: MOD_RAM.player1, bank: 'A' }), true);
  assert.equal(options.stageAdvanceTransform(1), 1);

  options.cabinetRunStartHook(ram, { demo: false });
  assert.equal(state.runtime.cabinetRunActive, true,
    'the second credited selector handoff reactivates the same loadout');
  assert.equal(transformModTiming(state, 16.896), 8.448);
  assert.equal(options.stageAdvanceTransform(1), 2);
});

test('W477 post-RGB transforms are deterministic and state-local', () => {
  const invertState = stateOf('invert-colors');
  prepareModCabinetBoot(invertState);
  const invert = new Uint8Array([10, 20, 30]);
  applyPresentationMods(invertState, invert);
  assert.deepEqual([...invert], [245, 235, 225],
    'presentation-only policy may render from cabinet frame zero');
  assert.equal(invertState.runtime.cabinetRunActive, false,
    'presentation does not activate cartridge policy');

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

test('W477 selected invincibility filters collisions without owning $810424', () => {
  const mods = stateOf('invincibility');
  assert.equal(typeof modGameOptions(mods).enemyBulletCollisionFilter, 'function');
  const demo = stubDemo({ mods });
  demo.game.ram.setU8(MOD_RAM.invulnP1, 0x37);
  demo.step();
  assert.equal(demo.game.ram.u8(MOD_RAM.invulnP1), 0x37,
    'a cartridge-owned protection value survives both frame policies');
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
