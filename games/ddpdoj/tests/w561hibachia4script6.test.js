// W561: HIBACHI A4 SCRIPT 6, `$2A67C2..$2A67E7`.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { defaultHandlers } from '../src/main.js';
import { RAM, P } from '../src/machine.js';
import {
  SCHED, installScripts, a4Start25980C, runScheduler25962E, scriptAddresses,
} from '../src/scheduler.js';
import {
  HIBACHI_A4, HIBACHI_END_SCRIPTS,
  s6Init2A67C2, s6Step2A67D2,
} from '../src/hibachiend.js';
import { HIBACHI_A1 } from '../src/hibachiguns.js';
import { restoreCheckpoint } from '../tools/progression-checkpoint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMAGE = path.resolve(HERE, '../tools/oracle/out/maincpu.bin');
const TABLES = path.resolve(HERE, '../rip/port/player.tables.json');
const ASSETS = path.resolve(HERE, '../assets');
const SEED = path.join(ASSETS, 'seed.bin.gz');
const CHECKPOINT = path.resolve(HERE, '../probes/checkpoints/ship0-style4-lf00071111.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : 'decrypted image or generated tables absent. This is a skip, not a pass.';
const SKIP_CHECKPOINT = existsSync(CHECKPOINT) && existsSync(SEED) && !SKIP ? false
  : 'checkpoint, seed, or generated cartridge table absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const ROM = SKIP ? null : new RomWindows(TABLE_JSON.rom);

const beU16 = (address) => IMG.readUInt16BE(address);
const caught = (fn) => {
  try { fn(); return null; } catch (error) { return error; }
};

const W562_WINDOW_BASES = new Set(['$2A9318', '$2A934E', '$2A967A', '$2A96B6']);
function checkpointBundlesWithW562Ablated() {
  const exact = { seed: new Uint8Array(gunzipSync(readFileSync(SEED))), tables: TABLE_JSON };
  const ablatedTables = JSON.parse(JSON.stringify(TABLE_JSON));
  ablatedTables.rom.windows = ablatedTables.rom.windows.filter(
    (w) => !W562_WINDOW_BASES.has(w.base));
  return { exact, ablatedTables };
}

test('W561 pins A4 table pair 6 and its exact code boundaries', { skip: SKIP }, () => {
  const pair = HIBACHI_A4.table + 6 * 8;
  const nextInit = ROM.u32(HIBACHI_A4.table + 7 * 8);
  assert.equal(ROM.u32(pair), HIBACHI_A4.s6Init);
  assert.equal(ROM.u32(pair + 4), HIBACHI_A4.s6Step);
  assert.equal(HIBACHI_A4.s6Init, 0x2a67c2);
  assert.equal(HIBACHI_A4.s6Step, 0x2a67d2);
  assert.equal(nextInit, 0x2a67e8);
  assert.equal(HIBACHI_A4.s6Step - HIBACHI_A4.s6Init, 0x10,
    'the init is exactly four instructions with no rts before the step');
  assert.equal(nextInit - HIBACHI_A4.s6Init, 0x26,
    'the pair ends at its rts immediately before script 7');
  assert.equal(HIBACHI_A4.s0Anim + 2
    + HIBACHI_A4.s0AnimCount * HIBACHI_A4.animStride, HIBACHI_A4.s6Init,
  'script 0 animation data supplies the exact lower boundary');
  assert.equal(beU16(HIBACHI_A4.s0Anim), HIBACHI_A4.s0AnimCount);
  assert.equal(beU16(nextInit), 0x397c, 'script 7 begins with move.w #$60,($2,A4)');
  assert.equal(IMG.subarray(HIBACHI_A4.s6Init, nextInit).toString('hex'),
    '70024eb90025996270004eb900259a1870004eb900259a4a650a70074eb90025980c42544e75');
  assert.equal(beU16(0x2a67da), 0x650a, 'the wait branch is bcs.s to the pair rts');
  assert.equal(beU16(0x2a67e4), 0x4254, 'the handoff clears the current A4 slot');
  assert.equal(beU16(0x2a67e6), 0x4e75, 'the pair ends at the exact rts');
  assert.ok(scriptAddresses().includes(HIBACHI_A4.s6Init));
  assert.ok(scriptAddresses().includes(HIBACHI_A4.s6Step));
  assert.ok(HIBACHI_END_SCRIPTS.includes(6));
});

test('W561 starts A3 2 and A1 0, preserves private timer state, and waits for gun retirement',
  { skip: SKIP }, () => {
    const ram = new Ram();
    installScripts(ram, ROM, { a4: HIBACHI_A4.table });
    const current = SCHED.a4Base;
    const next = current + SCHED.a4Stride;
    ram.setU16(current, 0x8106);
    ram.setU32(current + 0x02, 0x11223344);

    s6Init2A67C2(ram);
    assert.equal(ram.u16(SCHED.a3Base), 0x8002, '$259962 claims A3 script 2');
    assert.equal(ram.u16(SCHED.a1Base), 0x8000, '$259A18 claims A1 gun 0');
    assert.equal(ram.u32(current + 0x02), 0x11223344,
      'this pair has no private timer or parameter writes');

    s6Step2A67D2(ram, current);
    assert.equal(ram.u16(current), 0x8106, 'the A4 slot remains while gun 0 is present');
    assert.equal(ram.u16(next), 0, 'script 7 is not started early');
    assert.equal(ram.u32(current + 0x02), 0x11223344);

    ram.setU16(SCHED.a1Base, 0);
    s6Step2A67D2(ram, current);
    assert.equal(ram.u16(current), 0, 'the current slot is freed after gun 0 retires');
    assert.equal(ram.u32(current + 0x02), 0x11223344,
      'clr.w (A4) does not erase the slot parameters');
    assert.equal(ram.u16(next), 0x8007,
      '$25980C claims the next empty slot before the current slot is cleared');
  });

test('W561 init falls through to the step in one scheduler dispatch', { skip: SKIP }, () => {
  const ram = new Ram();
  installScripts(ram, ROM, { a4: HIBACHI_A4.table });
  for (let i = 0; i < SCHED.a1Slots; i++) {
    ram.setU16(SCHED.a1Base + i * SCHED.a1Stride, 0x8001 + i);
  }
  a4Start25980C(ram, 6);

  const error = caught(() => runScheduler25962E(ram, ROM, {}));
  assert.equal(error, null,
    'a full A1 table drops gun 0, so fallthrough starts and dispatches the now-ported script 7');
  assert.equal(ram.u16(SCHED.a4Base), 0, 'script 6 cleared itself during its init dispatch');
  assert.equal(ram.u16(SCHED.a4Base + SCHED.a4Stride), 0x8107,
    'the same A4 walk reached the newly claimed script-7 slot');
  assert.equal(ram.u16(SCHED.a4Base + SCHED.a4Stride + 2), 0x005f,
    'script 7 seeded 96 and its init fallthrough decremented once');
  assert.equal(ram.u16(SCHED.a3Base), 0x8002, 'the init still started A3 script 2 first');
  assert.deepEqual(Array.from({ length: SCHED.a1Slots }, (_, i) =>
    ram.u16(SCHED.a1Base + i * SCHED.a1Stride)),
  Array.from({ length: SCHED.a1Slots }, (_, i) => 0x8001 + i),
  '$259A18 reproduces the cartridge silent drop when all ten slots are occupied');
});

test('W561 checkpoint with explicit W562-window ablation stops at gun 0 template',
  { skip: SKIP_CHECKPOINT }, async () => {
    const { exact, ablatedTables } = checkpointBundlesWithW562Ablated();
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    const { game, probe } = restoreCheckpoint(checkpoint, exact, checkpoint.selection);
    assert.deepEqual(probe, {
      ship: 0, style: 4, inputWord: checkpoint.inputWord, invulnerable: true,
    });
    const ablatedRom = new RomWindows(ablatedTables.rom);
    game.rom = ablatedRom;
    game.tables = new MoveTables(ablatedTables, ablatedRom);
    game.handlers = defaultHandlers(ablatedRom, game.vram, { mutate: game.bgMutate });

    let error = null;
    let attempted = 0;
    for (attempted = 1; attempted <= 107; attempted++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(checkpoint.inputWord);
      } catch (caughtError) {
        error = caughtError;
        break;
      }
    }

    assert.equal(attempted, 107, 'the checkpoint reaches A4 script 6 on the same exact frame');
    assert.equal(game.logicFrame, 71217);
    assert.equal(game.ram.u16(HIBACHI_A4.forkLoopWord), 0, 'this checkpoint installs the alt A1 table');
    assert.equal(game.ram.u32(SCHED.ptrA1), HIBACHI_A1.alt);
    assert.equal(error?.romAddress, HIBACHI_A1.altGun0Template);
    const generated = new RomWindows(ablatedTables.rom);
    assert.equal(generated.u32(HIBACHI_A1.alt), HIBACHI_A1.altGun0Init,
      'the generated table still supplies the exact alt-table gun-0 init pointer');
    assert.equal(caught(() => generated.u16(HIBACHI_A1.altGun0Template))?.romAddress,
      HIBACHI_A1.altGun0Template,
      'the explicit W562 ablation keeps this historical checkpoint independent of web export state');
    assert.equal(game.ram.u16(SCHED.a1Base), 0x8100,
      'gun 0 was claimed and selected for its init before the throw');
    assert.equal(game.ram.u16(SCHED.a3Base + 2 * SCHED.a3Stride), 0x8002,
      'A3 script 2 was claimed but the earlier A1 walk blocked before dispatching it');
    assert.equal(game.ram.u16(SCHED.a4Base + SCHED.a4Stride), 0x8106,
      'A4 script 6 remains alive while gun 0 is running');
    assert.equal(scriptAddresses().includes(HIBACHI_A1.altGun0Init), true);
  });
