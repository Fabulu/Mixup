// WAVE 433 -- D64: THE STAGE-1 BOSS DEATH'S 42 FRAMES OF SCREEN SHAKE.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG
// ---------------------------------------------------------------------------
// `$80B054`/`$80B056` is the screen shake and `state.js` CLAIMS it, so every
// ladder comparison has been checking it since W11. On `out/w69/stage1-laser-
// hold` the board moves it on lf9903..9944 -- 42 frames -- and the port left it
// at 0 for all 42. That is a divergence on a COMPARED column that sat in the
// corpus from W52 until this wave, because nobody stepped the port through
// those frames: a zero measured over benches that never enter the state
// measures the bench, not the port.
//
// THE CAUSE, and it is one line. `boss.js d6Step293E04` state 5 stands at
// `$293EE6 jsr $28C392 / $293EEC jsr $2440E0`. The sound was real; the
// `$2440E0` was a counted `note()` left by W52. But `$2440E0` HAS been ported
// since W189 -- `boss2.js finalBlast2440E0` -- for the stage-2 (`$298E02`) and
// stage-3 (`$29CC64`) deaths, and its tail is
//
//     $244ABA  jsr $260E36      -- $813186 := 1, $813188 := 0, $80B054/56 := 0
//     $244AC0  jsr $23C4E0
//     $244AC6  jsr $23C4B0
//
// so the stage-1 site was the one caller never wired up. `$260EC8`, run every
// frame from `$2613A6`, then walks the 42-pair table at `$260F4C` into
// `$80B054`/`$80B056`, one pair per frame, until the `$00000000` terminator at
// `$260FF4` clears the mode.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE PROVES, AND IN WHICH ORDER
// ---------------------------------------------------------------------------
//  1. THE 42 VALUES, BOARD BESIDE PORT, on the real ladder. Not a green run:
//     the port is stepped from the lf9800 rung on the board's own input word
//     and every frame of the window is compared, plus the frames either side,
//     so a shake that starts one frame early or runs one frame long reds here.
//  2. THE RED. `screenShake260EC8` with the mode never armed is the defect
//     exactly: 43 calls, still zero. That is what arm 1 measured before the fix.
//  3. THE TABLE. The 42 board values ARE the cartridge's 42 pairs at $260F4C,
//     in order, terminator included -- so the trace column is checked against
//     the ROM and not merely against itself.
//  4. THE DEAD ARMS. Modes 2, 3 and 4 are unreachable in this image, measured
//     three ways, which is why they are counted and not written.
//  5. THE NOTE IS GONE and the death no longer defers `$2440E0`.
//
// All five ladders of the W69 corpus were swept for a moving `b054` this wave,
// and there are FOUR windows in THREE ladders, not the "four ladders" D63
// recorded: fly-around has none, stage1-play and stage1-sweep have one each
// (lf19332..19373), stage1-laser-hold has one (lf9903..9944) and
// stage2-laser-hold has TWO -- lf9903..9944, the same stage-1 death, and
// lf21819..21860, the stage-2 one W432 already matched. So the stage-2 ladder
// carried this defect too and the wave that measured its second window did not
// look at its first. All four windows carry the identical 42 values, as one
// shared table must.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { screenShake260EC8, BGRAM, CAM } from '../src/background.js';
import { BOSS_NOTED } from '../src/boss.js';
import { readTrace } from '../tools/portdiff.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const LADDER = path.join(GAME, 'tools', 'oracle', 'out', 'w69', 'stage1-laser-hold');
const MANIFEST = path.join(LADDER, 'manifest.json');
const TRACE = path.join(LADDER, 'trace.tsv');
const CK = path.join(LADDER, 'ckpt');
const TABLES = path.join(GAME, 'rip', 'port', 'player.tables.json');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');

const HAVE_TABLES = fs.existsSync(TABLES);
const HAVE_IMAGE = fs.existsSync(IMAGE);
const HAVE_LADDER = fs.existsSync(MANIFEST) && fs.existsSync(TRACE)
  && fs.existsSync(path.join(CK, 'c009800.ram.bin'));

const SKIP_LADDER = (HAVE_TABLES && HAVE_LADDER) ? false
  : 'the W69 stage1-laser-hold ladder or rip/port/player.tables.json is absent '
    + '-- rebuild with pgm.py ckpt and `python tools/export-tables.py`. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_IMAGE = HAVE_IMAGE ? false
  : 'rip/sound/maincpu.bin (the decrypted 68k image) is absent. '
    + 'THIS IS A SKIP, NOT A PASS.';
const SKIP_TABLES = HAVE_TABLES ? false
  : 'rip/port/player.tables.json is absent -- `python tools/export-tables.py`. '
    + 'THIS IS A SKIP, NOT A PASS.';

// ---------------------------------------------------------------------------
// THE BOARD'S OWN 42 VALUES, copied out of the ladder's `b054` column (the
// claimed LONGWORD $80B054:$80B056) so this file STATES them rather than
// deriving them from the same file it is checking. Identical in all four
// windows of the corpus.
// ---------------------------------------------------------------------------
const BOARD_42 = Object.freeze([
  0xFFE80000, 0xFFE80000, 0xFFE80000, 0xFFF80010, 0xFFF8000C, 0xFFF80008,
  0x00100008, 0x00100008, 0x000C0008, 0x00060004, 0x00060004, 0x00060004,
  0x0006FFF8, 0x0006FFF8, 0x0006FFF8, 0x0006FFFC, 0x0006FFFC, 0x0006FFFC,
  0xFFF70000, 0xFFF70000, 0xFFFD000C, 0xFFFD000C, 0x00060006, 0x00060006,
  0x00030003, 0x00030003, 0x0003FFFA, 0x0003FFFA, 0x0003FFFD, 0x0003FFFD,
  0xFFFA0000, 0xFFFE0008, 0x00040004, 0x00020002, 0x0002FFFC, 0x0002FFFE,
  0xFFFD0000, 0xFFFF0004, 0x00020002, 0x00010001, 0x0001FFFE, 0x0001FFFF,
]);

const FIRST_LF = 9903;                 // the board's first non-zero frame
const LAST_LF = 9944;                  // ...and its last. 42 frames inclusive.
const SEED_LF = 9800;                  // the rung this run starts from
const RUN_TO = 9960;                   // 16 frames past the end, so a long shake reds

const SHAKE_TABLE = 0x260f4c;          // $260F38[1] -- mode 1's pair table
const TERMINATOR = 0x260ff4;           // SHAKE_TABLE + 42*4
const hx8 = (v) => `$${(v >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;

// ===========================================================================
// 1. THE 42 VALUES, BOARD BESIDE PORT, ON THE LADDER
// ===========================================================================
test('D64: the port shakes exactly when and exactly as the board does -- '
  + 'lf9903..9944 of stage1-laser-hold, all 42 frames', { skip: SKIP_LADDER },
async () => {
  const { Game } = await import('../src/main.js');
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find((r) => r.lf === SEED_LF);
  assert.ok(rung, `lf${SEED_LF} must be a rung of ${man.scenario}`);

  const seed = new Uint8Array(fs.readFileSync(path.join(CK, rung.ram)));
  const bgBytes = new Uint8Array(fs.readFileSync(path.join(CK, rung.bg)));
  const bgSeed = new Uint16Array(bgBytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) {
    bgSeed[i] = (bgBytes[i * 2] << 8) | bgBytes[i * 2 + 1];
  }
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const trace = readTrace(TRACE);
  // The ladder's own intervention, carried out of the manifest rather than
  // reinvented: $810424 (the player's invulnerability timer) held at $FF.
  const pokes = (man.poke || '').split(',').filter(Boolean)
    .map((kv) => kv.split('=').map((x) => parseInt(x, 16)));

  const game = new Game(seed, tables, {
    logicFrame: SEED_LF, videoFrame: rung.vf, bgSeed,
  });

  const board = [], port = [], frames = [];
  for (let lf = SEED_LF + 1; lf <= RUN_TO; lf++) {
    const r = trace.byLf.get(lf);
    assert.ok(r, `the trace must carry lf${lf}`);
    for (const [a, v] of pokes) game.ram.setU8(a, v);
    game.step(Number(r.portin));       // THE BOARD'S OWN INPUT WORD, not a bench
    frames.push(lf);
    board.push(Number(r.b054) >>> 0);
    port.push((((game.ram.u16(CAM.shakeX) << 16) >>> 0) + game.ram.u16(CAM.shakeY)) >>> 0);
  }

  // POSITIVE CONTROL FIRST: the comparison has content. If the board column
  // were flat this test would pass on two zeroes and prove nothing.
  const boardNz = frames.filter((_, i) => board[i] !== 0);
  assert.equal(boardNz.length, 42,
    'the board must move $80B054 on exactly 42 frames of this window');
  assert.equal(boardNz[0], FIRST_LF);
  assert.equal(boardNz[boardNz.length - 1], LAST_LF);
  assert.deepEqual(board.filter((v) => v !== 0), [...BOARD_42],
    'and they are the 42 values this file states');

  // THE DELIVERABLE: frame for frame, every frame of the run, zeroes included.
  const differ = frames
    .map((lf, i) => (board[i] === port[i] ? null
      : `lf${lf} board ${hx8(board[i])} port ${hx8(port[i])}`))
    .filter(Boolean);
  assert.deepEqual(differ, [],
    `$80B054:$80B056 must equal the board on every frame of `
    + `lf${SEED_LF + 1}..${RUN_TO}`);

  // ...and stated as a window too, so "all zero on both sides" could never be
  // what made the line above pass.
  const portNz = frames.filter((_, i) => port[i] !== 0);
  assert.equal(portNz.length, 42);
  assert.equal(portNz[0], FIRST_LF);
  assert.equal(portNz[portNz.length - 1], LAST_LF);

  // The mode disarms itself on the terminator rather than being left latched.
  assert.equal(game.ram.u16(BGRAM.shakeMode), 0,
    '$260EF0 clears $813186 when the first word of the pair is 0');
  assert.equal(game.ram.u16(0x803936), 1, '$260F08 jsr $23C4D0 ran');
});

// ===========================================================================
// 2. THE RED -- WHAT ARM 1 MEASURED BEFORE THIS WAVE
// ===========================================================================
test('D64 RED: with $813186 never armed the driver writes nothing, 43 calls '
  + 'running -- which is the defect verbatim', { skip: SKIP_TABLES }, () => {
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  const rom = new RomWindows(tables.rom);
  const ram = new Ram();
  const ctx = { unportedLog: new UnportedLog() };
  // DIRTY, not fresh: a stale cursor is exactly what a boss death that ran
  // earlier in the session leaves behind, and it must not resurrect the shake.
  ram.setU16(BGRAM.shakeCursor, 0x0058);
  ram.setU16(CAM.shakeX, 0);
  ram.setU16(CAM.shakeY, 0);
  for (let i = 0; i < 43; i++) screenShake260EC8(ram, rom, ctx);
  assert.equal(ram.u16(CAM.shakeX), 0);
  assert.equal(ram.u16(CAM.shakeY), 0);
  assert.equal(ram.u16(BGRAM.shakeCursor), 0x0058, 'and the cursor did not move');

  // GREEN: the same bench with the arm $2440E0's tail performs ($260E36).
  ram.setU16(BGRAM.shakeMode, 1);
  ram.setU16(BGRAM.shakeCursor, 0);
  const got = [];
  for (let i = 0; i < 43; i++) {
    screenShake260EC8(ram, rom, ctx);
    if (ram.u16(BGRAM.shakeMode) === 0) break;
    got.push((((ram.u16(CAM.shakeX) << 16) >>> 0) + ram.u16(CAM.shakeY)) >>> 0);
  }
  assert.deepEqual(got, [...BOARD_42],
    '43 calls from cursor 0 give the board\'s 42 values then stop');
  assert.equal(ctx.unportedLog.report().length, 0, 'and mode 1 defers nothing');

  // The unreachable-mode guard still counts rather than throwing, and says so.
  ram.setU16(BGRAM.shakeMode, 3);
  screenShake260EC8(ram, rom, ctx);
  const r = ctx.unportedLog.report().join('\n');
  assert.ok(/\$260EC8 screen-shake mode 3/.test(r));
  assert.ok(/UNREACHABLE/.test(r),
    'the note must say what is true: this is dead code, not a deferral');
});

// ===========================================================================
// 3. THE TABLE -- THE BOARD'S 42 VALUES ARE THE CARTRIDGE'S 42 PAIRS
// ===========================================================================
test('D64: the 42 board values are $260F4C\'s 42 pairs in order, and $260FF4 '
  + 'is the terminator', { skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);
  const rom42 = [];
  for (let i = 0; i < 42; i++) rom42.push(img.readUInt32BE(SHAKE_TABLE + i * 4));
  assert.deepEqual(rom42, [...BOARD_42]);
  assert.equal(img.readUInt32BE(TERMINATOR), 0,
    '$260F4C + 42*4 is the $00000000 the driver stops on');

  // THE PREDICATE. `$260EE6 move.w (A0)+,D0 / $260EE8 cmpi.w #$0,D0` tests the
  // X term ALONE. The body used to require both words to be zero; that is the
  // same predicate here and only here, because no pair of the 42 has X = 0.
  // Measured rather than asserted in prose, so a re-derived table reds.
  assert.equal(rom42.filter((v) => (v >>> 16) === 0).length, 0,
    'no live pair has a zero X term, so the old both-words test never differed');
  assert.equal(rom42.filter((v) => (v & 0xffff) === 0).length, 7,
    'SEVEN do have a zero Y term -- so a both-words terminator over a table '
    + 'with a pure-Y pair would have run past its end, and this table is one '
    + 'transposition away from being that table');

  // The five-entry jump table $260EC8 dispatches through ($260ED6 lea ($60,PC)
  // -- the displacement is from the EXTENSION WORD $260ED8). Mode 2 SHARES mode
  // 1's table and differs only by $260F20's asr.w #1: half amplitude, not a
  // table nobody has read.
  const jump = [0, 1, 2, 3, 4].map((i) => img.readUInt32BE(0x260f38 + i * 4));
  assert.deepEqual(jump, [0x000000, 0x260f4c, 0x260f4c, 0x260ff8, 0x261064]);
});

// ===========================================================================
// 4. MODES 2, 3 AND 4 ARE UNREACHABLE -- MEASURED, NOT INHERITED
// ===========================================================================
test('D64: nothing in the image can arm shake mode 2, 3 or 4, so the note '
  + 'stands over dead code', { skip: SKIP_IMAGE }, () => {
  const img = fs.readFileSync(IMAGE);

  // (a) EVERY reference to $813186 in the whole image, at ANY alignment.
  const refs = [];
  const needle = Buffer.from([0x00, 0x81, 0x31, 0x86]);
  for (let i = img.indexOf(needle); i >= 0; i = img.indexOf(needle, i + 1)) refs.push(i);
  assert.deepEqual(refs,
    [0x260e3a, 0x260e5c, 0x260e7e, 0x260ea0, 0x260ec2, 0x260eca, 0x260ef4, 0x260f18],
    'the shake mode word is touched at eight places and all eight are inside '
    + 'the driver: five arms, the terminator clear, one read and one cmpi');

  // (b) THE ARMS THEMSELVES, as an operand, as a branch target and as data.
  //     Bcc.b/Bcc.w (which covers bsr, $61xx), jsr/jmp (d16,PC), lea (d16,PC)
  //     and pea (d16,PC), evaluated at EVERY EVEN ADDRESS -- and the target is
  //     the EXTENSION WORD's address plus the displacement, which is the trap
  //     this wave was warned about.
  const referencesTo = (target) => {
    const out = [];
    const t = Buffer.alloc(4); t.writeUInt32BE(target >>> 0);
    for (let i = img.indexOf(t); i >= 0; i = img.indexOf(t, i + 1)) out.push(i);
    for (let a = 0; a + 4 <= img.length; a += 2) {
      const op = img.readUInt16BE(a);
      const ext = a + 2;
      let tgt = null;
      const hi = op >>> 8;
      if (hi >= 0x60 && hi <= 0x6f) {
        const low = op & 0xff;
        if (low === 0x00) tgt = ext + img.readInt16BE(ext);
        else if (low !== 0xff) tgt = ext + ((low ^ 0x80) - 0x80);
      } else if (op === 0x4eba || op === 0x4efa || op === 0x487a
                 || (op & 0xf1ff) === 0x41fa) {
        tgt = ext + img.readInt16BE(ext);
      }
      if (tgt === target) out.push(a);
    }
    return out.sort((x, y) => x - y);
  };

  for (const dead of [0x260e58, 0x260e7a, 0x260e9c]) {
    assert.deepEqual(referencesTo(dead), [],
      `$${dead.toString(16).toUpperCase()} has no caller and is not data -- it `
      + 'cannot be reached, so porting it would be code for the look of it');
  }
  // POSITIVE CONTROL: the identical scan finds the live ones. Without this the
  // three empty results above would also be what a broken scanner returns.
  assert.deepEqual(referencesTo(0x260e36), [0x244abc, 0x2a5c5e, 0x2a5fc6],
    '$260E36 is reached from $244ABA ($2440E0\'s tail), $2A5C5C and $2A5FC4');
  assert.deepEqual(referencesTo(0x260ebe), [0x28d5cc],
    '$260EBE, the stop, from $28D5CA alone');
  assert.deepEqual(referencesTo(0x260ec8), [0x2613a6],
    '$260EC8 itself from $2613A6 alone -- a PC-relative jsr, which is why a '
    + 'longword scan on its own would have called the driver dead too');

  // (c) And the arm that IS live really does write mode 1 -- $260E36's two
  //     move.w #imm, read out of the image rather than trusted.
  assert.equal(img.readUInt16BE(0x260e38), 1, '$260E36 move.w #$1,$813186');
  assert.equal(img.readUInt16BE(0x260e40), 0, '$260E3E move.w #$0,$813188');
  assert.equal(img.readUInt32BE(0x244abc), 0x260e36,
    '$244ABA jsr $260E36 -- the tail of $2440E0, which is the whole fix');
});

// ===========================================================================
// 5. THE NOTE IS GONE
// ===========================================================================
test('D64: $2440E0 has left BOSS_NOTED, and the stage-1 death defers it no '
  + 'more', () => {
  assert.equal(BOSS_NOTED[0x2440e0], undefined,
    '$293EEC calls $2440E0 now, so counting it would report a gap that is closed');
  // The table is only as good as the file: no `note(ctx, 0x2440e0)` survives in
  // src/boss.js either, which is the half W425 found could rot on its own.
  const src = fs.readFileSync(path.join(GAME, 'src', 'boss.js'), 'utf8');
  assert.equal(/note\(ctx, 0x2440e0\)/.test(src), false);
  assert.ok(/finalBlast2440E0\(ram, rom, ctx, a6\)/.test(src),
    'and the call that replaced it is there');
});
