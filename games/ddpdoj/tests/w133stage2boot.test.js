// W133 -- STAGE-2 BOOT VERIFICATION.
//
// The defect these exist for is the one the W124 worklog (6.3) named and left
// open: "THE SEEDED GATE CANNOT REACH THE BANNER DRAIN (next-stage BG data)".
// W124 exported the stage-2 BG PALETTE block `$229DF8` and explicitly deferred
// the stage-2 BG COLUMN STREAM behind it to "a future data-export wave ...
// [which] is NOT result-screen logic". This wave (W133) is that future wave:
// it exports the column stream (`tools/export-tables.py` window `$228658`) and
// this test proves the seeded page now drives PAST the stage clear, boots stage
// 2, scrolls its background, and stops at the honest constructor throw rather
// than at a data-export gap.
//
// WHAT IS PINNED HERE, and every value comes from the cartridge or the listing:
//   * the boot from the LAST `stage1-sweep` rung (lf19500, past the boss
//     timeout lf19218) reaches stage 2 (stage index 1, `$813096` goes 0 -> 4);
//   * the stage-2 BACKGROUND scrolls: `camBgAccumulate` (`$80B012`) advances
//     for frames between the stage-2 boot and the throw, i.e. window 2
//     (`$228658`) really feeds the column ring;
//   * the CLEAN THROW: at scroll clock `$24` the first stage-2 op-$10 BGELEM
//     fires, `elemSpawn` reads the stage-2 handler table `[0]` = `$2627AC`,
//     which is NOT one of the port's 13 stage-1 constructors, and `unreached`
//     THROWS naming `$2627AC` (the stage-2 constructor this port has not
//     translated). Stage-2 CONTENT is a future port;
//   * the NO-GARBAGE-SPAWN invariant: the port never calls `installStage` for
//     stage 2, so the spawn walker breaks at stage-1's `$FFFF` terminator every
//     frame and `LIVE_CURSOR $8132CC` keeps its stage-1-end value for the whole
//     boot. Stage 2's spawn script is never read.
//
// THE MUST-FAIL. WITH the windows (the committed state): the BG scrolls and the
// boot throws `Unreached($2627AC)`. WITHOUT window 1 (`$229DF8`): the throw is
// EARLIER and at a different address, the `rom.bytes($229DF8, 2048)` read inside
// `backgroundInit`'s `install2415E8`. This test asserts the WITH-windows path;
// the without-windows path is the honest earlier throw the window exists to
// prevent. (The W124 window-1 declaration is pinned by `check_stage2_boot_data`
// in the export, so the "without" case cannot arrive by accident.)
//
// Skips LOUDLY when the ladder or the export is absent (CI), like w85bucket2.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { Unreached } from '../src/unported.js';
import { BGELEM_HANDLERS } from '../src/background.js';
import { RomWindows } from '../src/rom.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const LADDER = path.join(ROOT, 'tools/oracle/out/w69/stage1-sweep');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TABLES = path.join(ROOT, 'rip/port/player.tables.json');
const CK = path.join(LADDER, 'ckpt');

const HAVE = fs.existsSync(MANIFEST) && fs.existsSync(TABLES)
  && fs.existsSync(path.join(CK, 'c019500.ram.bin'));
const SKIP = HAVE ? false
  : 'stage1-sweep ladder (or rip/port/player.tables.json) absent -- rebuild with '
    + 'pgm.py ckpt and `python tools/export-tables.py`. THIS IS A SKIP, NOT A PASS.';

// The addresses the boot reads, named once each (src/spawn.js / src/background.js).
const STAGE_X4 = 0x813096;             // $2611B2 adda.w; holds stage*4 (stage 2 -> 4)
const DIST_CLOCK = 0x8130ce;           // $2633d0 cmp.w; the scroll distance clock
const LIVE_CURSOR = 0x8132cc;          // $2633be lea; the live spawn-script pointer
const CAM_BG_ACC = 0x80b012;           // $80B012 the 1/64-px BG scroll accumulator

// The stage-1 spawn script's `$FFFF` terminator. The script starts at `$230C6C`
// (W22 window: 339 records x 8 B), so the terminator longword is at
// `$230C6C + 339*8 == $231704`. The seed parks LIVE_CURSOR here and the port
// never calls `installStage` for stage 2, so `walkScriptLoop`'s
// `if (trig === 0xffff) break;` fires every frame of the boot and stage 2's own
// script (which starts at `$2325D0+`, well past this terminator) is never read.
const STAGE1_FFFF = 0x230c6c + 339 * 8;

// The stage-2 BGELEM handler table: `$262302[1]` (stage index 1) = `$26227E`, and
// its entry [0] (the first op-$10 constructor stage 2 fires) is `$2627AC`. Read
// by `elemSpawn` as `rom.u32(tab + id*4)` with id 0. Pinned in the export by
// `check_stage2_boot_data`; pinned here out of the table the port loads.
const ELEM_TABLE = 0x262302;
const STAGE2_ELEM_HANDLER_TABLE = 0x26227e;
const STAGE2_ELEM0_CTOR = 0x2627ac;

const SEED_LF = 19500;
const MAX_FRAMES = 1000;               // the throw lands ~730 frames past the seed

/** Boot the port from the lf19500 rung and step neutral frames until it throws
 *  or MAX_FRAMES elapses. Returns the walked game, the throw (or null), and how
 *  many frames the BG accumulator advanced at all / within stage 2. */
function bootStage2(ROM) {
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === SEED_LF);
  assert.ok(rung, `lf${SEED_LF} rung must be in stage1-sweep`);
  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  // Rebuild bgSeed the way loadRung / seedcmp do: BE words out of the dump.
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const game = new Game(seed, tables, {
    logicFrame: SEED_LF, videoFrame: rung.vf, bgSeed,
  });

  const seedLiveCursor = game.ram.u32(LIVE_CURSOR);
  const result = {
    game, seedLiveCursor, threw: null,
    scrolledTotal: 0, scrolledInStage2: 0,
    stage2BootLf: null, throwLf: null, throwClock: null,
  };
  let prevAcc = game.ram.u32(CAM_BG_ACC);
  let prevStage = game.ram.u16(STAGE_X4);
  for (let i = 0; i < MAX_FRAMES; i++) {
    let accAfter, stage, clk;
    try {
      game.step(0xffff);               // neutral input; the ladder is invulnerable from lf1890
    } catch (e) {
      if (!(e instanceof Unreached)) throw e;
      result.threw = e;
      result.throwLf = game.logicFrame;
      result.throwClock = game.ram.u16(DIST_CLOCK);
      break;
    }
    accAfter = game.ram.u32(CAM_BG_ACC);
    stage = game.ram.u16(STAGE_X4);
    clk = game.ram.u16(DIST_CLOCK);
    if (accAfter !== prevAcc) {
      result.scrolledTotal++;
      if (stage >= 4) result.scrolledInStage2++;
    }
    if (stage !== prevStage && stage >= 4 && result.stage2BootLf === null) {
      result.stage2BootLf = game.logicFrame;
    }
    prevAcc = accAfter;
    prevStage = stage;
  }
  return result;
}

// ===========================================================================
// 1. STATIC INVARIANTS -- the table geometry the boot depends on. These need
// only the export (ROM-gated), not the ladder.
// ===========================================================================

test('W133/1 the stage-2 elemTable [0] is $2627AC and the port refuses it',
  { skip: SKIP }, () => {
  const ROM = new RomWindows(JSON.parse(fs.readFileSync(TABLES, 'utf8')).rom);
  // $262302[1] is the stage-2 handler table pointer, and its entry [0] is the
  // first constructor stage 2 spawns. Both reads go through ROM windows
  // ($262240 covers $262302; $26227E is inside the same window).
  assert.strictEqual(ROM.u32(ELEM_TABLE + 1 * 4), STAGE2_ELEM_HANDLER_TABLE,
    `$262302[1] must be $26227E (stage 2's handler table) -- elemSpawn reads `
    + 'tab = rom.u32(BGTAB.elemTable + stage*4)');
  assert.strictEqual(ROM.u32(STAGE2_ELEM_HANDLER_TABLE + 0 * 4), STAGE2_ELEM0_CTOR,
    `$26227E[0] must be $2627AC -- the first stage-2 op-$10 BGELEM's constructor`);
  // ...and $2627AC is deliberately NOT one of the port's 13 stage-1 constructors
  // (the w86bgelem.test.js W86/1 assertion, restated here next to the boot that
  // reaches it). So elemSpawn's BGELEM_BY_CTOR.get(0x2627AC) is undefined ->
  // unreached throws, which is the clean stop this test catches.
  assert.ok(!BGELEM_HANDLERS.some((h) => h.ctor === STAGE2_ELEM0_CTOR),
    '$2627AC must not be one of the ported stage-1 constructors, or the boot '
    + 'would not throw and stage 2 would run with no element handler ported');
});

test('W133/2 the stage-1 $FFFF terminator is at $231704, where the seed parks '
  + 'LIVE_CURSOR', { skip: SKIP }, () => {
  const ROM = new RomWindows(JSON.parse(fs.readFileSync(TABLES, 'utf8')).rom);
  // 339 records x 8 B from $230C6C (the W22 window), then the $FFFF longword.
  // The walker reads this word first (`if (trig === 0xffff) break;`) and exits
  // before any stage-2 read, which is the structural reason garbage spawn is
  // impossible once stage 2 boots without installStage.
  assert.strictEqual(STAGE1_FFFF, 0x231704,
    'the $FFFF terminator address arithmetic must stay $230C6C + 339*8');
  assert.strictEqual(ROM.u16(STAGE1_FFFF), 0xffff,
    `the word at $${STAGE1_FFFF.toString(16)} must be $FFFF -- the stage-1 `
    + 'spawn-script terminator the walker breaks on');
});

// ===========================================================================
// 2. THE BOOT -- reaches stage 2, scrolls the BG, throws cleanly at $2627AC.
// ROM- and ladder-gated; skips when the ladder is absent.
// ===========================================================================

test('W133/3 booting from lf19500 reaches stage 2 and the BG scrolls before the '
  + 'clean constructor throw', { skip: SKIP }, () => {
  const r = bootStage2();

  // (a) stage 2 really booted: $813096 went 0 -> 4 (stage index 1, x4).
  assert.ok(r.stage2BootLf !== null,
    'the boot must reach stage 2 (stage index 1, $813096 -> 4)');
  assert.ok(r.stage2BootLf > SEED_LF,
    `stage 2 must boot AFTER the seed (lf${SEED_LF}), not be carried into it`);

  // (b) the BG scrolled in stage 2: window 2 ($228658) fed the column ring and
  // the accumulator advanced for some frames between boot and throw. This is
  // the proof the column-stream export is actually read, not just present.
  assert.ok(r.scrolledInStage2 > 0,
    `camBgAccumulate must advance in stage 2 (advanced ${r.scrolledInStage2} `
    + 'times); without window 2 the column-stream read would throw earlier');

  // (c) the CLEAN THROW: it is an Unreached carrying $2627AC, the stage-2
  // BGELEM constructor the port has not translated. NOT a ROM-window throw
  // (which is what the without-window-1 path would produce, earlier and at
  // $229DF8) -- the throw's romAddress names the CONSTRUCTOR, proving the
  // windows let the boot get all the way to the element dispatch.
  assert.ok(r.threw instanceof Unreached,
    'the boot must throw Unreached, not a ROM-window error');
  assert.strictEqual(r.threw.romAddress, STAGE2_ELEM0_CTOR,
    `the throw must carry $2627AC (the stage-2 BGELEM constructor); got `
    + `$${r.threw.romAddress.toString(16).toUpperCase()} -- a different address `
    + 'means a window is missing and the boot stopped at the data gap instead '
    + 'of the honest constructor stop');
  assert.ok(r.threw.message.includes('$2627AC'),
    'the throw message must name the stage-2 constructor $2627AC');
  // The throw lands at scroll clock $24 (= 36), the brief's landmark: the first
  // stage-2 BGELEM fires once the stage-2 scroll distance reaches 36.
  assert.ok(r.throwClock !== null && r.throwClock >= 0x24,
    `the throw must land at scroll clock >= $24 (got $${(r.throwClock ?? -1).toString(16)}), `
    + 'where the first stage-2 BGELEM fires');
});

// ===========================================================================
// 3. NO GARBAGE SPAWN -- the walker no-ops at stage-1's $FFFF terminator for
// the whole boot; LIVE_CURSOR keeps its stage-1-end value.
// ===========================================================================

test('W133/4 no garbage spawn: LIVE_CURSOR keeps its stage-1 $FFFF-terminator '
  + 'value for the whole stage-2 boot', { skip: SKIP }, () => {
  const r = bootStage2();

  // The seed parks LIVE_CURSOR at stage-1's $FFFF terminator ($231704), and the
  // port never calls installStage for stage 2, so walkScriptLoop breaks at that
  // terminator every frame and never advances into stage 2's script. This is
  // the W133 recon's correction (2): the garbage-spawn risk is structurally
  // impossible, not merely avoided.
  assert.strictEqual(r.seedLiveCursor, STAGE1_FFFF,
    `the seed must park LIVE_CURSOR at stage-1's $FFFF terminator $${STAGE1_FFFF.toString(16)} `
    + `(got $${r.seedLiveCursor.toString(16)}) -- if it does not, the boot's `
    + 'no-garbage-spawn argument has no foundation');
  assert.strictEqual(r.game.ram.u32(LIVE_CURSOR), r.seedLiveCursor,
    `LIVE_CURSOR must be unchanged across the whole boot (seed $${r.seedLiveCursor.toString(16)} `
    + `-> final $${r.game.ram.u32(LIVE_CURSOR).toString(16)}). The port never `
    + 'calls installStage, so the walker breaks at stage-1\'s $FFFF terminator '
    + 'and stage 2\'s script is never read');
});
