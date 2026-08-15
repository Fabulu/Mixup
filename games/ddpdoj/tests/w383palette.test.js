// W383 UNIT B -- THE TWO `$24150A` SITES THAT WERE ACTUALLY BLOCKED, AND THE THIRTEEN THAT
// WERE NOT.
//
// ===============================================================================================
// THE BRIEF FOR THIS WAVE WAS WRONG, AND THIS FILE IS THE MEASUREMENT THAT SHOWS IT
// ===============================================================================================
//
// The brief said: `$24150A`/`$24157A`/`$2415E8`/`$2414BE`/`$241688` are counted notes at fifteen
// sites, "every one saying `no PaletteState on this ctx/chain`", and "ONE `ctx.palette` WIRING
// CLOSES FIFTEEN DEFERRALS".
//
// **`Game#ctx()` HAS CARRIED `palette` SINCE W91.** It is a plain key in `main.js`'s context
// literal, beside `vram` and `txvram`, with its own comment. There was no wiring to do.
//
// THIRTEEN of the fifteen sites are already shaped
//
//     if (ctx.palette) { install24150A(...) } else { ctx.unported?.note(...) }
//
// so on the driver path they take the INSTALL branch and the note never fires. The note is a
// FALLBACK FOR A BARE-CTX UNIT-TEST CALLER, not a deferral. `tools/claimed.py` classifies those
// `else` bodies as NOTE lines because it reads source text, and that -- not a missing palette --
// is what produced the figure fifteen. SECTION 1 measures this directly: it drives a real cold
// boot AND a seeded mid-stage run and asserts that ZERO notes at those five addresses are
// recorded, while the palette really is being installed.
//
// TWO of the fifteen were genuinely open, both UNCONDITIONAL `note()` calls with no install
// branch at all, and both blocked BY THE TEXT OF THEIR OWN NOTE rather than by a missing
// palette:
//
//   * `$294FC0` (bossarrival.js) -- the note called `$13` an "entry [$13] of $222AF8", i.e. an
//     INDEX INTO A TABLE. `41 f9` is `lea (xxx).L,An`: there is no table and no index. `$13` is
//     the destination BANK and `$222AF8` is the 64-byte SOURCE -- `install24150A`'s exact
//     signature. Described as an index it looked like it needed a descriptor nobody had
//     measured. SECTION 2.
//
//   * `$26D7DA` (handlers.js) -- the note said "the port's `installBank` lives in `initbody.js`
//     and is not exported". True and irrelevant: `installBank` is a LOCAL WRAPPER around
//     `install24150A`, which `palette.js` EXPORTS and which twelve other files already import
//     directly. SECTION 3.
//
// Both are trap 13 from the wave's own list: a counted note can be stale AND its text can be
// wrong about why.
//
// **EVERY ASSERTION BELOW IS ABOUT PALETTE STATE, NEVER ABOUT A FUNCTION HAVING BEEN CALLED.**
// `install24150A` writes 32 words into the sprite STAGING AREA at `$80E886 + bank * 64`, marks
// them in `pal.stageSourced.spr`, and raises the dirty flag `$80FA66`. Each test reads those
// bytes back and compares them to the CARTRIDGE, against a positive control that shows the same
// bytes absent beforehand.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { PaletteState, PALSTAGE, SPR_BANKS } from '../src/palette.js';
import { UnportedLog } from '../src/unported.js';
import { RomWindows } from '../src/rom.js';
import { Ram } from '../src/ram.js';
import { f0Init294FA0, f0Step294FA6 } from '../src/bossarrival.js';
import { runHandler, HANDLER_ADDRESSES } from '../src/handlers.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));
const IMGPATH = fileURLToPath(new URL('../rip/sound/maincpu.bin', import.meta.url));
const IMG = readFileSync(IMGPATH);
const SEEDPATH = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));

/** The five addresses the brief listed, plus the sixth it added in passing. */
const PALETTE_ADDRS = [0x24150a, 0x24157a, 0x2415e8, 0x2414be, 0x241688, 0x26d7d0];

/** A real `RomWindows` over the exported table -- the same object `Game` builds. */
const rom = () => new RomWindows(tablesJson.rom);

/** The 32 words `$24150A` stages for `bank`, read back out of MAIN RAM where it put them. */
const stagedBank = (ram, bank) => {
  const base = PALSTAGE.spr.stage + bank * 64;
  const out = [];
  for (let i = 0; i < 32; i++) out.push(ram.u16(base + i * 2));
  return out;
};

/** The same 32 words as the CARTRIDGE has them -- what a correct install must produce. */
const romBank = (src) => {
  const out = [];
  for (let i = 0; i < 32; i++) out.push(IMG.readUInt16BE(src + i * 2));
  return out;
};

/** Every note key at one of the palette addresses, as raw strings. */
const paletteNotes = (log) =>
  [...log.calls.keys()].filter((k) =>
    PALETTE_ADDRS.some((a) => k.startsWith(`$${a.toString(16).toUpperCase()} `)));

// =============================================================================================
// 1 -- THE MEASUREMENT. **ZERO** OF THOSE NOTES FIRE FROM THE REAL DRIVER, ON EITHER BOARD.
//
// This is the test that contradicts the brief, and it is deliberately driven rather than
// reasoned: it runs `Game` from a COLD boot all the way into gameplay and, separately, from the
// mid-stage-1 seed, and asserts the count of palette-address notes is 0 both times.
//
// A `0` on its own would also be what you got if the palette subsystem were switched off
// entirely, so each half ALSO asserts that installs really happened -- `pal.installCount` moved
// and staged banks carry cartridge bytes. Absence of the note plus presence of the colour is the
// pair that means "already wired".
// =============================================================================================

test('W383B a COLD BOOT into gameplay records ZERO palette-address notes, and DOES install', () => {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  g.ram.setU8(0x803957, 1);                                  // the coinage dip -- see w383coldboot
  for (let i = 0; i < 400; i++) g.step(0xffff);              // warning screen, 13 -> 2
  for (let i = 0; i < 20; i++) { g.coinPort = 0xfffe; g.step(0xffff); }
  g.coinPort = COIN.idle;
  for (let i = 0; i < 10; i++) g.step(0xffff);               // -> state 3, one credit
  for (let i = 0; i < 20; i++) g.step(0xfffe);               // P1 START -> state $E
  for (let i = 0; i < 3000; i++) g.step(0xffff);

  assert.equal(g.ram.u16(0x812e56), 0x000e, 'the run really reached gameplay');
  assert.deepEqual(paletteNotes(g.unportedLog), [],
    'NOT ONE of the five brief addresses is a live deferral on the cold path');

  // ...and the colour is really arriving, so the zero above is "wired", not "switched off".
  assert.ok(g.palette.installCount > 0,
    `$24150A and friends really ran; installCount = ${g.palette.installCount}`);
  // NOT the dirty flag `$80FA66`: `flush24133C` runs once per main-loop iteration and CLEARS it,
  // so after a completed frame it reads 0 and asserting 1 here would be asserting a transient.
  // What survives is the flush's own tally and the sourced map.
  assert.ok(g.palette.copies.spr > 0,
    `the sprite third was really flushed to $A00000; copies.spr = ${g.palette.copies.spr}`);
  const sourced = g.palette.stageSourced.spr.reduce((a, b) => a + b, 0);
  assert.ok(sourced >= 32, `at least one whole bank came from the cartridge; ${sourced} words`);
});

test('W383B the SEEDED mid-stage board records ZERO palette-address notes either', () => {
  assert.ok(existsSync(SEEDPATH), 'the seed image is part of the rip');
  const g = new Game(new Uint8Array(readFileSync(SEEDPATH)), tablesJson, {});
  for (let i = 0; i < 3000; i++) g.step(0xffff);
  assert.deepEqual(paletteNotes(g.unportedLog), [],
    'the seeded board agrees with the cold one -- these sites are not blocked');
  assert.ok(g.palette.installCount > 0, 'and it installs too');
});

test('W383B Game#ctx() carries `palette`, and it IS the Game\'s own PaletteState', () => {
  // The brief said "no PaletteState on this ctx". `#ctx()` is private, so this reads it the way
  // the port does: through a handler that stores what it was handed.
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot();
  assert.ok(g.palette instanceof PaletteState, 'the Game owns one');

  // `catchUpObjectStream`/`catchUpBgPalette` run off THIS object at construction on a seeded
  // board, so a second Game built with catch-up must have moved it -- proof the wiring is not
  // merely present but load-bearing.
  const seeded = new Game(new Uint8Array(readFileSync(SEEDPATH)), tablesJson, {});
  assert.ok(seeded.palette.installCount > 0,
    'the catch-up chain drove the very same PaletteState the ctx hands out');
});

// =============================================================================================
// 2 -- `$294FC0`, bossarrival.js. THE FIRST OF THE TWO THAT WERE REALLY OPEN.
//
// The bytes first, because the old note's claim about them is the entire reason this sat open.
// =============================================================================================

test('W383B $294FB6 is `move.w #$13,D0 / lea $222AF8,A0` -- an ABSOLUTE long, not a table index',
  () => {
    // move.w #$13,D0 -- the IMMEDIATE comes before any displacement (trap 1).
    assert.equal(IMG.readUInt16BE(0x294fb6), 0x303c, '$294FB6 is move.w #imm,D0');
    assert.equal(IMG.readUInt16BE(0x294fb8), 0x0013, 'and the immediate is $13');

    // **$41F9, NOT $41FA.** `41 f9` is `lea (xxx).L,An`; `41 fa` would be `lea (d16,PC),An` and
    // would need the extension word's own address plus a displacement (trap 4). It is the
    // absolute form, so $222AF8 is the address, full stop -- there is no table to index into.
    assert.equal(IMG.readUInt16BE(0x294fba), 0x41f9, '$294FBA is lea (xxx).L,A0 -- ABSOLUTE');
    assert.notEqual(IMG.readUInt16BE(0x294fba), 0x41fa, 'and NOT the PC-relative form');
    assert.equal(IMG.readUInt32BE(0x294fbc), 0x00222af8, 'the operand is the address $222AF8');

    assert.equal(IMG.readUInt16BE(0x294fc0), 0x4eb9, '$294FC0 is jsr (xxx).L');
    assert.equal(IMG.readUInt32BE(0x294fc2), 0x0024150a, 'and its target is $24150A');

    // The `lea` is SIX bytes and the `jsr` is SIX, so `clr.w (a4)` lands at $294FC6 and the
    // `rts` at $294FC8. If the lea had been read as the 4-byte PC-relative form every address
    // after it would be two low, which is how a mis-read turns into an invented table.
    assert.equal(IMG.readUInt16BE(0x294fc6), 0x4254, '$294FC6 clr.w (a4)');
    assert.equal(IMG.readUInt16BE(0x294fc8), 0x4e75, '$294FC8 rts');
  });

test('W383B $294FC0 now INSTALLS: bank $13 of the staging area becomes $222AF8\'s bytes', () => {
  const ram = new Ram();
  const pal = new PaletteState();
  const log = new UnportedLog();
  const ctx = { rom: rom(), palette: pal, unportedLog: log, unported: log };
  const A4 = 0x812c00;

  // POSITIVE CONTROL: bank $13 is untouched before, and NOT equal to what the cartridge holds.
  assert.deepEqual(stagedBank(ram, 0x13), new Array(32).fill(0), 'bank $13 starts empty');
  assert.notDeepEqual(romBank(0x222af8), new Array(32).fill(0),
    'and $222AF8 is not itself 32 zero words, so the comparison below can fail');

  f0Init294FA0(ram, A4);
  for (let i = 0; i < 0xc0; i++) f0Step294FA6(ram, ctx, A4);   // $C0 frames -- the last one fires

  // THE CLAIM: THE PALETTE STATE CHANGED, and it changed to the CARTRIDGE'S bytes.
  assert.deepEqual(stagedBank(ram, 0x13), romBank(0x222af8),
    'all 32 words of bank $13 are $222AF8 verbatim');
  assert.equal(ram.u16(PALSTAGE.spr.dirty), 1, '$241520 raised $80FA66');
  for (let i = 0; i < 32; i++) {
    assert.equal(pal.stageSourced.spr[0x13 * 32 + i], 1, `word ${i} is marked CARTRIDGE-SOURCED`);
  }
  // NOT A NEIGHBOUR. `lsl.w #$6` on the wrong D0 would land one bank over and still "install".
  assert.deepEqual(stagedBank(ram, 0x12), new Array(32).fill(0), 'bank $12 untouched');
  assert.deepEqual(stagedBank(ram, 0x14), new Array(32).fill(0), 'bank $14 untouched');

  // ONCE, not $C0 times: $294FC6 clears (a4) and $294FAA's bne guards the other 191 frames.
  assert.equal(pal.installCount, 1, 'the install fired exactly once in $C0 frames');
  assert.deepEqual(paletteNotes(log), [], 'and the note is GONE, not merely quieter');
});

test('W383B a chain with no PaletteState still COUNTS $294FC0 -- the miss stays visible', () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { rom: rom(), unportedLog: log, unported: log };       // NO palette
  const A4 = 0x812c00;

  f0Init294FA0(ram, A4);
  for (let i = 0; i < 0xc0; i++) f0Step294FA6(ram, ctx, A4);

  const keys = paletteNotes(log);
  assert.equal(keys.length, 1, 'exactly one deferral is counted');
  assert.match(keys[0], /\$294FC0 jsr \$24150A/, 'and it names the call site');
  assert.match(keys[0], /bank \$13/, 'and the bank...');
  assert.match(keys[0], /\$222AF8/, '...and the block');
  // AND THE OLD, WRONG WORDING IS NOT BACK.
  assert.doesNotMatch(keys[0], /entry \[\$13\]/,
    '$13 is a destination BANK, never an entry index into $222AF8');
  assert.deepEqual(stagedBank(ram, 0x13), new Array(32).fill(0),
    'and nothing was staged, which is what the note is telling you');
});

// =============================================================================================
// 3 -- `$26D7DA`, handlers.js. THE SECOND ONE, AND IT IS A **PER-FRAME** REPAINT.
//
// Type $47's handler reinstalls bank $10 on EVERY frame, byte for byte the same three
// instructions as its own init at `$26D728`. That is not redundancy: something else in stage 5
// overwrites bank $10 and this is what keeps it correct. So the test asserts BOTH that the bytes
// land AND that they land again after the bank is scribbled on -- a once-only install would pass
// the first check and fail the second.
//
// `installPaletteBank47` is module-private, so this drives it through `handler47`'s public entry
// the way the object driver does.
// =============================================================================================

test('W383B $26D728 and $26D7D0 are the SAME three instructions, bank $10 <- $224F38', () => {
  for (const at of [0x26d728, 0x26d7d0]) {
    const tag = `$${at.toString(16).toUpperCase()}`;
    assert.equal(IMG.readUInt16BE(at), 0x303c, `${tag} move.w #imm,D0`);
    assert.equal(IMG.readUInt16BE(at + 2), 0x0010, `${tag} the bank is $10`);
    assert.equal(IMG.readUInt16BE(at + 4), 0x41f9, `${tag} lea (xxx).L,A0 -- ABSOLUTE again`);
    assert.equal(IMG.readUInt32BE(at + 6), 0x00224f38, `${tag} the source is $224F38`);
    assert.equal(IMG.readUInt16BE(at + 10), 0x4eb9, `${tag} jsr (xxx).L`);
    assert.equal(IMG.readUInt32BE(at + 12), 0x0024150a, `${tag} $24150A`);
  }
  // BYTE FOR BYTE, which is the claim the comment makes and the reason one port serves both.
  assert.deepEqual(IMG.subarray(0x26d728, 0x26d738), IMG.subarray(0x26d7d0, 0x26d7e0),
    'sixteen bytes, identical');

  // The init's copy is followed by `jsr $23C4A0` then `rts`; the handler's by `tst.w $8130D2`.
  // Same three instructions, DIFFERENT continuations -- so they are two call sites, not one
  // routine reached twice, and closing one would have left the other open.
  assert.equal(IMG.readUInt16BE(0x26d738), 0x4eb9, '$26D738 jsr -- the INIT continues');
  assert.equal(IMG.readUInt16BE(0x26d7e0), 0x4a79, '$26D7E0 tst.w -- the HANDLER continues');
});

test('W383B $224F38 + $40 is inside an exported ROM window, so the source read was never the '
  + 'blocker', () => {
  // Proved through the real `RomWindows` rather than by eyeballing the table: a read that
  // returns the cartridge's bytes is served; one that is not would throw `Unreached`.
  const r = rom();
  assert.doesNotThrow(() => r.bytes(0x224f38, 64));
  assert.deepEqual([...r.bytes(0x224f38, 64)], [...IMG.subarray(0x224f38, 0x224f78)]);
  // ...and the same for $294FC0's block.
  assert.doesNotThrow(() => r.bytes(0x222af8, 64));
  assert.deepEqual([...r.bytes(0x222af8, 64)], [...IMG.subarray(0x222af8, 0x222b38)]);
});

test('W383B type $47\'s handler REPAINTS bank $10 every frame, and repairs a scribble', () => {
  // Driven through the SAME public entry the object driver uses, keyed by the handler's own ROM
  // address, so this exercises the registration too rather than reaching past it.
  assert.ok(HANDLER_ADDRESSES.includes(0x26d7d0), 'type $47 is registered at $26D7D0');

  const ram = new Ram();
  const pal = new PaletteState();
  const log = new UnportedLog();
  const ctx = { rom: rom(), palette: pal, unportedLog: log, unported: log };
  const A5 = 0x811000;
  const A6 = 0x811400;
  ram.setU32(A5 + 0x06, A6);                    // $26D7D0's `movea.l ($6,A5),A6`
  ram.setU32(0x8130d2, 1);                      // the FREEZE, so the handler takes the draw exit
                                                // immediately after the repaint and nothing else
                                                // in type $47 runs -- the palette is isolated.

  assert.deepEqual(stagedBank(ram, 0x10), new Array(32).fill(0), 'bank $10 starts empty');

  runHandler(0x26d7d0, ram, ctx.rom, A5, ctx);
  assert.deepEqual(stagedBank(ram, 0x10), romBank(0x224f38),
    'frame 1: bank $10 is $224F38 verbatim');
  assert.equal(pal.installCount, 1);

  // **THE REPAINT IS THE POINT.** Scribble the bank, exactly as stage 5 does, and run one more
  // frame. A once-only install leaves the scribble; the cartridge's per-frame `jsr` removes it.
  for (let i = 0; i < 32; i++) ram.setU16(PALSTAGE.spr.stage + 0x10 * 64 + i * 2, 0xdead);
  assert.notDeepEqual(stagedBank(ram, 0x10), romBank(0x224f38), 'the scribble really landed');

  runHandler(0x26d7d0, ram, ctx.rom, A5, ctx);
  assert.deepEqual(stagedBank(ram, 0x10), romBank(0x224f38),
    'frame 2: the per-frame repaint PUT IT BACK -- this is what $26D7D0 is for');
  assert.equal(pal.installCount, 2, 'and it counted as a second install, not a no-op');

  assert.deepEqual(paletteNotes(log), [], 'the $26D7D0 note is gone');
});

test('W383B type $47 with no PaletteState still counts $26D7D0 once per frame', () => {
  const ram = new Ram();
  const log = new UnportedLog();
  const ctx = { rom: rom(), unportedLog: log, unported: log };        // NO palette
  ram.setU32(0x811000 + 0x06, 0x811400);
  ram.setU32(0x8130d2, 1);

  runHandler(0x26d7d0, ram, ctx.rom, 0x811000, ctx);
  runHandler(0x26d7d0, ram, ctx.rom, 0x811000, ctx);

  const keys = paletteNotes(log);
  assert.equal(keys.length, 1, 'one distinct key');
  assert.match(keys[0], /\$26D7D0/, 'naming the site');
  assert.equal(log.calls.get(keys[0]), 2, 'counted TWICE -- it is a per-frame call, not an init');
  assert.deepEqual(stagedBank(ram, 0x10), new Array(32).fill(0), 'and nothing was staged');
});

// =============================================================================================
// 4 -- THE BANK NUMBERS ARE IN RANGE, SO NEITHER NEW INSTALL CAN SCRIBBLE THE BACKGROUND.
//
// `install24150A` does not clamp D0: `lsl.w #$6` on a bank of 32 or more lands in the BACKGROUND
// staging area at `$80F086`, and the port throws by address rather than hiding it. $13 and $10
// are both well inside, and that is asserted rather than assumed because a wrong bank is exactly
// the failure a freshly-closed note can introduce.
// =============================================================================================

test('W383B banks $13 and $10 are inside the 32-bank sprite region', () => {
  for (const b of [0x13, 0x10]) {
    assert.ok(b >= 0 && b < SPR_BANKS, `bank $${b.toString(16)} is in 0..${SPR_BANKS - 1}`);
    assert.ok(PALSTAGE.spr.stage + b * 64 + 64 <= PALSTAGE.bg.stage,
      `and its 64 bytes end at or before the BACKGROUND staging area $80F086`);
  }
});
