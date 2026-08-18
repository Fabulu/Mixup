// ===============================================================================================
// W425 -- DOCKET D58. THE BOSS EXPLOSION'S OWN SOUND, WHICH IS NOT THE CUE D58 WAS DIAGNOSED AS.
// ===============================================================================================
//
// THE OWNER: "boss explosion doesn't have a sound on level one. None of the other levels likely
// do either."
//
// **D58 WAS DIAGNOSED AS `$28C170` AND THAT DIAGNOSIS WAS INCOMPLETE, NOT WRONG.** `$28C170` is
// the boss-CLEAR cue -- one shot, fired from `$242922`, which `$294DD4` calls at `$294DF0` on
// every one of the three boss deaths. It was silent, it is ported in this same wave, and it is
// real. But it is ONE cue at the moment the fight ends, and the owner said "explosion".
//
// **THE EXPLOSION'S REPEATED BANGS COME FROM A SECOND PLACE, `$294134`, AND IT WAS SILENT TOO.**
// `$294DD4` ends with `a3Start259962(ram, 6)` -- it ARMS D-script 6, the death animation. That
// script's states 2 and 3 tick a timer (`$12(a4)`, "timer D") and on each expiry dispatch one
// entry of an EIGHT-ENTRY TABLE OF CUE-WRAPPER ADDRESSES:
//
//     293F5A  41FA 01D8       lea ($1D8,PC),A0       -> $293F5C + $1D8 = $294134
//     293F60  D0EC 0014       adda.w ($14,A4),A0     the cursor
//     293F64  2050            movea.l (A0),A0        the entry IS an address
//     293F66  4E90            jsr (A0)               ...and it is CALLED
//     293F68  586C 0014       addq.w #4,($14,A4)
//     293F6C  026C 001F 0014  andi.w #$1F,($14,A4)   $20 bytes = EIGHT entries, wrapped
//
// `src/boss.js` counted that whole dispatch as ONE note (`BOSS_NOTED[0x294134]`), so the death
// animation played its entire explosion in silence and the census reported a single deferral for
// it. It is ported here as `d6TimerDSound`.
//
// SECTION 1  the table, byte for byte out of the image
// SECTION 2  the walk: eight entries, in the ROM's order, wrapping
// SECTION 3  the ORDER trap -- post THEN advance, not advance then post
// SECTION 4  both call sites share one cursor
// SECTION 5  the census: $294134 has left it, and what has not
// SECTION 6  and the OTHER half of D58, the boss-clear cue, on the same death
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { W425, BOSS_NOTED, bossDeath294DD4 } from '../src/boss.js';
import { SOUND_WRAPPERS } from '../src/sound.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const TABLES = here('../rip/port/player.tables.json');
const SKIP = existsSync(IMAGE) && existsSync(TABLES) ? false
  : path.basename(IMAGE) + ' or player.tables.json absent -- run tools/export-tables.py. '
    + 'THIS IS A SKIP, NOT A PASS.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const ROM = SKIP ? null : new RomWindows(JSON.parse(readFileSync(TABLES, 'utf8')).rom);

const { d6TimerDSound, d6Step293E04, D6, D6_TIMER_D_TABLE, D6_TIMER_D_MASK } = W425;

/** The eight longwords the cartridge holds, read from the image rather than typed in. */
const tableFromImage = () =>
  Array.from({ length: 8 }, (_, i) => IMG.readUInt32BE(0x294134 + i * 4));

const A4 = 0x81E200;          // any A4-shaped scratch record in main RAM
const A6 = 0x814000;

function bench() {
  const ram = new Ram();
  const log = new UnportedLog();
  const cues = [];
  const ctx = {
    unportedLog: log, unported: log, bossSubRec: A6, bossRec: 0x812000,
    soundPost: (a) => { cues.push(a); return true; },
  };
  return { ram, ctx, cues, log };
}

// =============================================================== 1. THE TABLE, OUT OF THE IMAGE

test('SECTION 1: $294134 holds EIGHT cue-wrapper addresses, and every one has a WRAPPERS row',
  { skip: SKIP }, () => {
    assert.deepEqual(tableFromImage(),
      [0x28c25a, 0x28c274, 0x28c25a, 0x28c274, 0x28c2a8, 0x28c25a, 0x28c2c2, 0x28c2a8],
      'the eight longwords at $294134, in the cartridge\'s order');
    // THE REASON THIS NEEDED NO NEW PACKER, unlike $28C170 in the same wave: every entry is an
    // ordinary five-immediate wrapper. Nothing here is invented, which is why it was a plain
    // deferral rather than a genuinely unpackable shape.
    for (const w of tableFromImage()) {
      assert.ok(SOUND_WRAPPERS[w],
        `$${w.toString(16).toUpperCase()} is a real WRAPPERS row, so posting it invents nothing`);
    }
  });

test('SECTION 1: the dispatch really is `movea.l (A0),A0 / jsr (A0)`, off a PC-relative lea',
  { skip: SKIP }, () => {
    // TRAP: `lea (d16,PC),A0` resolves against the EXTENSION WORD's address, not the opcode's.
    // Reading it off the opcode gives $294132 and the whole table shifts by two.
    assert.equal(IMG.readUInt16BE(0x293f5a), 0x41fa, '$293F5A lea (d16,PC),A0');
    assert.equal(0x293f5c + IMG.readUInt16BE(0x293f5c), 0x294134, '  ...and it resolves to $294134');
    assert.equal(IMG.readUInt16BE(0x293f60), 0xd0ec, '$293F60 adda.w (d16,A4),A0');
    assert.equal(IMG.readUInt16BE(0x293f62), 0x0014, '  ...($14,A4), the cursor');
    assert.equal(IMG.readUInt16BE(0x293f64), 0x2050, '$293F64 movea.l (A0),A0 -- INDIRECT');
    assert.equal(IMG.readUInt16BE(0x293f66), 0x4e90, '$293F66 jsr (A0) -- and it CALLS it');
    assert.equal(IMG.readUInt16BE(0x293f68), 0x586c, '$293F68 addq.w #4,(d16,A4)');
    assert.equal(IMG.readUInt16BE(0x293f6c), 0x026c, '$293F6C andi.w #imm,(d16,A4)');
    assert.equal(IMG.readUInt16BE(0x293f6e), D6_TIMER_D_MASK, '  ...#$1F -- EIGHT entries');
    assert.equal(D6_TIMER_D_TABLE, 0x294134, 'and src/boss.js names the same address');
  });

// ======================================================================= 2. THE WALK

test('SECTION 2: eight ticks post the eight entries in the ROM\'s order, then WRAP',
  { skip: SKIP }, () => {
    const b = bench();
    for (let i = 0; i < 8; i++) d6TimerDSound(b.ram, ROM, b.ctx, A4);
    assert.deepEqual(b.cues, tableFromImage(),
      'the first lap is the table, entry for entry');
    assert.equal(b.ram.u16(A4 + D6.cursor14), 0, 'and the cursor wrapped back to 0');

    // The ninth tick must repeat entry 0, not run off the end of the window.
    d6TimerDSound(b.ram, ROM, b.ctx, A4);
    assert.equal(b.cues[8], b.cues[0], 'tick 9 repeats entry 0 -- `andi.w #$1F` is a RING');
  });

test('SECTION 2: the mask is applied to the cursor it READS, not only the one it writes',
  { skip: SKIP }, () => {
    // DIRTY THE FIELD. A recycled A4 slot can carry the previous tenant's word, and `$293F60`
    // does `adda.w` with NO mask before the read -- the mask happens after the addq. Modelling
    // it as read-then-mask matches the ROM for every value the ROM can produce, and refusing to
    // mask on read would index outside the 32-byte window from a dirty slot. This pins the
    // choice rather than leaving it to a zeroed fixture.
    const b = bench();
    b.ram.setU16(A4 + D6.cursor14, 0x7ffc);
    d6TimerDSound(b.ram, ROM, b.ctx, A4);
    assert.deepEqual(b.cues, [tableFromImage()[7]],
      '$7FFC & $1F = $1C = entry 7 -- it stays inside the table');
    assert.equal(b.ram.u16(A4 + D6.cursor14), 0, 'and the write-back is masked too');
  });

// ======================================================================= 3. THE ORDER

test('SECTION 3: it POSTS then ADVANCES -- reversing it would never play entry 0',
  { skip: SKIP }, () => {
    // `$293F66 jsr (A0)` comes BEFORE `$293F68 addq.w #4`. A port that advanced first would
    // start the rattle on entry 1 and skip entry 0 on every lap: eight bangs, in the wrong
    // order, for ever. A single-tick test would pass under both readings, so this checks the
    // FIRST tick specifically, which is the only one where the two readings differ visibly.
    const b = bench();
    assert.equal(b.ram.u16(A4 + D6.cursor14), 0, 'a fresh slot starts at cursor 0');
    d6TimerDSound(b.ram, ROM, b.ctx, A4);
    assert.deepEqual(b.cues, [0x28c25a],
      'the FIRST bang is entry 0, $28C25A -- not entry 1');
    assert.equal(b.ram.u16(A4 + D6.cursor14), 4, 'and only THEN did the cursor move to 4');
  });

// ======================================================================= 4. BOTH CALL SITES

test('SECTION 4: states 2 and 3 share ONE table and ONE cursor', { skip: SKIP }, () => {
  // `$29400A lea ($128,PC)` off `$29400C` is the same $294134, and both walks read and write
  // `($14,A4)`. So the rattle does not restart when the animation changes state -- it carries
  // on where it left off, which is what makes it a rattle rather than a repeated first bang.
  assert.equal(IMG.readUInt16BE(0x29400a), 0x41fa, '$29400A lea (d16,PC),A0');
  assert.equal(0x29400c + IMG.readUInt16BE(0x29400c), 0x294134, '  ...the SAME $294134');
  assert.equal(IMG.readUInt16BE(0x294010), 0xd0ec, '$294010 adda.w (d16,A4),A0');
  assert.equal(IMG.readUInt16BE(0x294012), 0x0014, '  ...($14,A4), THE SAME cursor field');
  assert.equal(IMG.readUInt16BE(0x294014), 0x2050, '$294014 movea.l (A0),A0');
  assert.equal(IMG.readUInt16BE(0x294016), 0x4e90, '$294016 jsr (A0)');

  // Driven through the real step: state 3 with timer D expiring on the first frame.
  const b = bench();
  b.ram.setU8(A4 + D6.state, 3);
  b.ram.setU8(A4 + D6.tD, 0);            // `subq.b #1` borrows -> the tick fires
  b.ram.setU8(A4 + D6.tDr, 0xff);        // and reloads long, so it fires once
  b.ram.setU8(A4 + D6.tC, 0xff); b.ram.setU8(A4 + D6.tCr, 0xff);
  d6Step293E04(b.ram, ROM, b.ctx, A4);
  assert.deepEqual(b.cues, [0x28c25a], 'state 3 rang entry 0');
  assert.equal(b.ram.u16(A4 + D6.cursor14), 4, 'and advanced the shared cursor');

  // Now state 2, on the SAME record, and it must continue from 4 rather than restart.
  b.cues.length = 0;
  b.ram.setU8(A4 + D6.state, 2);
  b.ram.setU16(A4 + D6.wait, 0);         // the `tst.w/beq` arm that reaches the timers
  b.ram.setU8(A4 + D6.tD, 0);
  d6Step293E04(b.ram, ROM, b.ctx, A4);
  assert.deepEqual(b.cues, [0x28c274],
    'state 2 rang entry 1 -- the cursor CARRIED, it did not restart');
});

// ======================================================================= 5. THE CENSUS

test('SECTION 5: $294134 has LEFT BOSS_NOTED, and what remains is genuinely deferred',
  { skip: SKIP }, () => {
    assert.equal(BOSS_NOTED[0x294134], undefined,
      '$294134 is ported, so counting it would report a gap that is closed');
    // And it is not counted at run time either, which is the assertion that would catch a
    // `note()` left behind next to the new post.
    const b = bench();
    for (let i = 0; i < 8; i++) d6TimerDSound(b.ram, ROM, b.ctx, A4);
    assert.equal(b.log.report().some((s) => s.includes('$294134')), false,
      'eight bangs and not one deferral');
    assert.equal(b.log.report().length, 0, 'in fact nothing at all was deferred by the walk');
  });

// ======================================================================= 6. THE OTHER HALF

test('SECTION 6: the same boss death ALSO posts $28C170, and the two are different cues',
  { skip: SKIP }, () => {
    // This is the honest bit. D58 was opened on "the boss explosion has no sound" and diagnosed
    // as `$28C170`. Both were silent and both are ported now, but they are not the same event:
    //
    //   $242922 -> $28C170   ONE cue, at the instant the boss is declared clear
    //   $294134              EIGHT cues, ticked through the whole death ANIMATION
    //
    // A wave that shipped only the first would have closed D58 on a cue the owner was probably
    // not describing. Both are asserted on the same routine so the pair cannot drift apart.
    const b = bench();
    bossDeath294DD4(b.ram, ROM, b.ctx, 0x812000, A6);
    assert.deepEqual(b.cues, [0x28c170],
      '$294DF0 jsr $242922 -> $28C170, and the death block itself posts nothing else');
    assert.equal(b.ram.u16(0x81296e), 1, 'POSITIVE CONTROL: $242928 really ran');

    // And the death ARMS the animation that carries the rattle: `$294E34 moveq #$6 / $259962`.
    // It is a `jmp` (4EF9) and not a `jsr` -- `$294DD4` TAIL-CALLS the arm, which is why the
    // rattle belongs to D-script 6's own frames and not to the death block's.
    assert.equal(IMG.readUInt16BE(0x294e34), 0x7006, '$294E34 moveq #$6,D0 -- A3 script 6');
    assert.equal(IMG.readUInt16BE(0x294e36), 0x4ef9, '$294E36 jmp (xxx).L -- a TAIL call');
    assert.equal(IMG.readUInt32BE(0x294e38), 0x00259962, '  ...$259962, a3Start');
  });
