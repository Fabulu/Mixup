// ===============================================================================================
// W391 -- ARMS 1 AND 3'S SCREENS, AND THE FRAME THE ATTRACT LOOP STOPPED PARKING.
// ===============================================================================================
//
// UNIT. Slot [8] arm 1's demo screen (`$25BBB4` init, `$25BD7C` body) and arm 3's credit screen
// (`$25BDE0` body), which share the init and the draw `$25BE48`.
//
// **THE BRIEF WAS WRONG IN FOUR PLACES AND EACH ONE WOULD HAVE SHIPPED A DEFECT.** They are
// asserted here from the bytes rather than argued:
//
//   1. "IT IS SHARED WITH ARM 3, so porting it pays twice." Only the INIT and the DRAW are
//      shared. `$25BDE0` is arm 3's own twenty-four-instruction body with no state, no timer
//      and no chain, and `$25A96E` has NO `bcs` in front of it -- arm 3 never reads the carry
//      at all. SECTION 5.
//   2. "arm 1, whose `$25BD7C` body is a counted note that cannot produce a carry." It produces
//      one, and not by an `andi #$FE,CCR`: `$25BE6E` is `3000`, `move.w D0,D0`, which the 68000
//      defines as clearing C. SECTION 2.
//   3. The implied shape. Arms 9 and 12 are `cmpi.w #$0/#$1/#$2` fall-through chains on a state
//      WORD. Arm 1 is a `bset`/`btst` latch machine on a BYTE at `$812E66` plus one `tst.w`,
//      and its clear is SIX words where theirs is four. SECTIONS 1 and 2.
//   4. "objslot8.js holds SCREEN12 and SCREEN9 as templates. Read them, but do not assume arm 1
//      matches them." Correct, and the draw is where it bites hardest: SEVEN sprites a frame
//      through TWO different emitters, and one of the six `bsr`s lands on a bare `rts`.
//      SECTION 3.
//
// The one thing the brief got exactly right is the question it asked a third time. **The exit
// waits on the SECOND chain**, and SECTION 4 measures it on a real cold boot: 607 frames after
// the init chain drained.
//
// SECTION 1  the init `$25BBB4`, the six-word clear and the `$1E0` timer
// SECTION 2  the body `$25BD7C`, the latch machine and BOTH exits' carries
// SECTION 3  the draw `$25BE48`, the dead `bsr`, and the seven sprites COUNTED
// SECTION 4  DRIVEN: a real cold boot past +1,182, arm 1 advancing to state 5
// SECTION 5  arm 3, `$25BDE0`, on the real coin path
// SECTION 6  the six ROM windows, re-derived from the cartridge
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Game } from '../src/main.js';
import {
  ARM1SCREEN, ARM9SCREEN, SCREEN12, SCREEN8,
  screen1Init25BBB4, screen1Body25BD7C, screen1Draw25BE48, screen3Body25BDE0,
} from '../src/objslot8.js';
import { BUCKETS, RECORD_BYTES } from '../src/spritequeue.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false : 'no rip';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const TABLES = here('../rip/port/player.tables.json');
const SKIP_T = existsSync(TABLES) ? SKIP : 'generated ROM tables absent; skip, not pass';
const tablesJson = existsSync(TABLES) ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

/** The raw image as a `rom` face, so these tests drive the real routines rather than a windowed
 *  subset of them. Same helper `w390arm9.test.js` uses. */
const rawRom = () => ({
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a),
  i16: (a) => IMG.readInt16BE(a), u8: (a) => IMG[a],
  bytes: (a, n) => IMG.subarray(a, a + n),
});

const noteCtx = () => {
  const notes = [];
  return { notes,
    ctx: {
      cabinetFrontend: true,
      unported: { note: (a, t) => notes.push(`${a}:${t}`) },
      unportedLog: { note: (a, t) => notes.push(`${a}:${t}`) },
      soundPost: () => {},
    } };
};

/** Bucket 0's records as words. Both `$23DECE` and `$23E2F2` land in bucket 0, which is exactly
 *  why counting matters here: the two families are indistinguishable by destination. */
const EMIT = BUCKETS[0];
function emitted(ram) {
  const n = ram.u16(EMIT.counter) / RECORD_BYTES;
  const out = [];
  for (let i = 0; i < n; i++) {
    const at = EMIT.buffer + i * RECORD_BYTES;
    out.push([0, 2, 4, 6, 8, 10].map((o) => ram.u16(at + o)));
  }
  return out;
}

// ===============================================================================================
// SECTION 1 -- THE INIT, `$25BBB4..$25BBE5`, AND THE SIX-WORD CLEAR.
// ===============================================================================================

test('W391 SECTION 1: the init is $25BBB4..$25BBE5 with the `rts` AT $25BBE4', { skip: SKIP },
  () => {
    assert.equal(l(0x25bbb4), 0x48e7fffe, '$25BBB4 movem.l D0-D7/A0-A6,-(A7)');
    assert.equal(w(0x25bbb8), 0x41f9, '$25BBB8 lea abs.l,A0');
    assert.equal(l(0x25bbba), ARM1SCREEN.flags, '  ...$812E66');

    // TRAP 2, and it is the difference from BOTH templates: `#$5` + `dbra` is SIX iterations.
    assert.equal(w(0x25bbbe), 0x303c, '$25BBBE move.w #imm,D0');
    assert.equal(w(0x25bbc0), 5, '  ...#$5');
    assert.equal(w(0x25bbc2), 0x7200, '$25BBC2 moveq #0,D1');
    assert.equal(w(0x25bbc4), 0x30c1, '$25BBC4 move.w D1,(A0)+');
    assert.equal(w(0x25bbc6), 0x51c8, '$25BBC6 dbra D0');
    assert.equal(ARM1SCREEN.clearWords, 6, 'TRAP 2: `dbra` runs N+1 = SIX times, so SIX words');
    assert.equal(SCREEN12.clearWords, 4, 'arm 12 clears four...');
    assert.equal(ARM9SCREEN.clearWords, 4, '...and so does arm 9. Copying either loses two words');

    // TRAP 3, a third time in this file: the last TWO words of the clear ARE the handle long.
    assert.equal(ARM1SCREEN.handle, ARM1SCREEN.flags + 8, 'the handle long starts at word 5...');
    assert.equal(ARM1SCREEN.flags + ARM1SCREEN.clearWords * 2, ARM1SCREEN.handle + 4,
      '...and the six-word clear ends EXACTLY at its far end. A four-word clear -- the shape '
      + 'both templates have -- would leave a stale handle in $812E6E/$812E70 and, worse, would '
      + 'leave ARM 3\'s latch at $812E6A set from the previous visit');

    assert.equal(w(0x25bbca), 0x33fc, '$25BBCA move.w #imm,abs.l');
    assert.equal(w(0x25bbcc), ARM1SCREEN.timerInit, '  ...#$1E0 = 480');
    assert.equal(l(0x25bbce), ARM1SCREEN.timer, '  ...into $812E6C');
    assert.equal(ARM1SCREEN.timerInit, 0x1e0, 'and $1E0 is NOT the $F0 both templates use');
    assert.notEqual(ARM1SCREEN.timerInit, ARM9SCREEN.timerInit, 'twice as long, plus a third');

    // TRAP 5: the `rts` sits AT $25BBE4, so the routine is 50 bytes.
    assert.equal(l(0x25bbe0), 0x4cdf7fff, '$25BBE0 movem.l (A7)+,D0-D7/A0-A6');
    assert.equal(w(0x25bbe4), 0x4e75, '$25BBE4 rts -- AT the last address, not after it');
    assert.equal(ARM1SCREEN.initEnd - ARM1SCREEN.init, 50, 'so the init is 50 bytes');
  });

test('W391 SECTION 1: the init loads NO chain -- its four `bsr`s are all presentation',
  { skip: SKIP }, () => {
    // `6198` is bsr.s with an 8-bit displacement: PC after the OPCODE WORD, plus the sign
    // extension. $25BBD4 - 104 = $25BB6C.
    assert.equal(w(0x25bbd2), 0x6198, '$25BBD2 bsr.s -104');
    assert.equal(0x25bbd4 - 104, ARM1SCREEN.txBlock, '  ...= $25BB6C, the TX plane block');
    assert.equal(ARM1SCREEN.txBlock, ARM9SCREEN.txBlock, 'literally the routine arm 9 runs');

    // TRAP 4 on three `bsr.w`s: the target is the EXTENSION WORD's address plus the disp.
    for (const [at, want] of [[0x25bbd4, 0x25c22a], [0x25bbd8, 0x25c252], [0x25bbdc, 0x25c286]]) {
      assert.equal(w(at), 0x6100, `$${at.toString(16).toUpperCase()} bsr.w`);
      assert.equal(at + 2 + w(at + 2), want,
        `  ...$${(at + 2).toString(16).toUpperCase()} + $${w(at + 2).toString(16).toUpperCase()
        } = $${want.toString(16).toUpperCase()}. From the OPCODE it would be two low`);
    }
    assert.deepEqual([...ARM1SCREEN.txLines], [0x25c22a, 0x25c252, 0x25c286]);

    // Each of the three is a live TX string draw through $25A14C, not a loader.
    for (const [head, dip, d1, tail] of [[0x25c22a, 0x80380c, 0x0d, 0x25c24a],
      [0x25c252, 0x80380d, 0x10, 0x25c272], [0x25c286, 0x80380f, 0x0b, 0x25c2a6]]) {
      assert.equal(w(head), 0x41fa, `$${head.toString(16).toUpperCase()} lea (d16,PC),A0`);
      assert.equal(w(head + 6), 0x1039, '  ...move.b abs.l,D0');
      assert.equal(l(head + 8), dip, `  ...the DIP byte $${dip.toString(16).toUpperCase()}`);
      assert.equal(w(head + 12), 0xd040, '  ...add.w D0,D0');
      assert.equal(w(head + 14), 0xd040, '  ...twice -- a LONGWORD pointer table');
      assert.equal(w(head + 20), 0x303c, '  ...move.w #$0,D0');
      assert.equal(w(head + 24), 0x323c, '  ...move.w #imm,D1');
      assert.equal(w(head + 26), d1, `  ...D1 = $${d1.toString(16).toUpperCase()}`);
      assert.equal(l(tail + 2), 0x25a14c, '  ...and the tail goes to $25A14C, the string blit');
    }
    // $80380C is the only one of the three this port models at all -- `machine.js` names it
    // `rank`. $80380D and $80380F have no model, which is the stated reason for the hold.
    assert.deepEqual([...ARM1SCREEN.dipBytes], [0x80380c, 0x80380d, 0x80380f]);

    // There is no `4EB9` in the whole init, so nothing here can load a chain or post a cue.
    for (let a = ARM1SCREEN.init; a < ARM1SCREEN.initEnd; a += 2) {
      assert.notEqual(w(a), 0x4eb9, `$${a.toString(16).toUpperCase()} is not a jsr abs.l`);
    }
  });

test('W391 SECTION 1: running the init clears all six words and arms the $1E0 timer',
  { skip: SKIP }, () => {
    const ram = new Ram(new Uint8Array(0x20000));
    // Dirty every word the clear must reach, including arm 3's latch and both halves of the
    // handle. A four-word clear leaves the last three of these standing.
    for (let i = 0; i < 6; i++) ram.setU16(ARM1SCREEN.flags + i * 2, 0xbeef);
    const { notes, ctx } = noteCtx();
    screen1Init25BBB4(ram, rawRom(), ctx);

    assert.equal(ram.u16(ARM1SCREEN.flags), 0, '$812E66 the flag byte, cleared');
    assert.equal(ram.u16(ARM1SCREEN.phase), 0, '$812E68 the phase, cleared');
    assert.equal(ram.u16(ARM1SCREEN.arm3Latch), 0, '$812E6A ARM 3\'s latch, cleared -- word 3');
    assert.equal(ram.u16(ARM1SCREEN.timer), ARM1SCREEN.timerInit, '$812E6C = $1E0');
    assert.equal(ram.u32(ARM1SCREEN.handle), 0, '$812E6E the handle LONG, both halves -- words 5-6');

    const at = notes.map((n) => Number(n.split(':')[0]));
    assert.deepEqual(at, [0x23c608, 0x23c638, ...ARM1SCREEN.txLines],
      '$25BB6C ran; the bare context counts two absent video owners and three absent TX owners');
  });

// ===============================================================================================
// SECTION 2 -- THE BODY, `$25BD7C..$25BE71`: A LATCH MACHINE, AND BOTH EXITS' CARRIES.
// ===============================================================================================

test('W391 SECTION 2: the body is `bset`/`btst` on a BYTE, not a `cmpi.w` chain', { skip: SKIP },
  () => {
    assert.equal(l(0x25bd7c), 0x48e7fffe, '$25BD7C movem.l');
    // $08F9 is BSET #imm,abs.l -- and with a MEMORY destination the 68000 operates on a BYTE.
    assert.equal(w(0x25bd80), 0x08f9, '$25BD80 bset #imm,abs.l -- a BYTE operation');
    assert.equal(w(0x25bd82), 0, '  ...bit 0');
    assert.equal(l(0x25bd84), ARM1SCREEN.flags, '  ...of $812E66');
    assert.equal(w(0x25bd88), 0x6612, '$25BD88 bne.s +$12 -- Z carries the OLD bit');
    assert.equal(0x25bd8a + 0x12, 0x25bd9c, '  ...to $25BD9C, skipping the load');

    assert.equal(w(0x25bd9c), 0x0839, '$25BD9C btst #imm,abs.l');
    assert.equal(w(0x25bd9e), 1, '  ...bit 1');
    assert.equal(l(0x25bda0), ARM1SCREEN.flags, '  ...of the same byte');

    // Arms 9 and 12 open their states with `0C79` (cmpi.w abs.l). Arm 1 has NOT ONE.
    let cmpi = 0;
    for (let a = ARM1SCREEN.body; a < ARM1SCREEN.bodyEnd; a += 2) if (w(a) === 0x0c79) cmpi++;
    assert.equal(cmpi, 0, 'there is no `cmpi.w #imm,abs.l` anywhere in arm 1\'s body...');
    assert.equal(w(0x25c428), 0x0c79, '...where arm 9\'s very first test is one');
    assert.equal(w(0x25c2ee), 0x0c79, '...and arm 12\'s too');
    // The only word test in the whole body is the phase.
    assert.equal(w(0x25bdd2), 0x4a79, '$25BDD2 tst.w abs.l');
    assert.equal(l(0x25bdd4), ARM1SCREEN.phase, '  ...$812E68, the one word it does test');
  });

test('W391 SECTION 2: the exit waits on the SECOND chain, and the bytes say so before any run',
  { skip: SKIP }, () => {
    // The INIT chain, behind the bit-0 latch.
    assert.equal(w(0x25bd8a), 0x41fa, '$25BD8A lea (d16,PC),A0');
    assert.equal(0x25bd8c + w(0x25bd8c), ARM1SCREEN.initScript,
      '  ...TRAP 4: $25BD8C + $22E = $25BFBA. From the opcode it would be $25BFB8, a `nop`');
    assert.equal(w(0x25bd8e), 0x4e71, '$25BD8E nop -- both templates have this too');
    assert.equal(l(0x25bd92), 0x0024641a, '$25BD90 jsr $24641A');
    assert.equal(l(0x25bd98), ARM1SCREEN.handle, '$25BD96 move.l D0,$812E6E');

    // The SECOND chain, and it OVERWRITES the handle before anything reads it again.
    assert.equal(w(0x25be1a), 0x41fa, '$25BE1A lea (d16,PC),A0');
    assert.equal(0x25be1c + w(0x25be1c), ARM1SCREEN.loadScript, '  ...$25BE1C + $1F4 = $25C010');
    assert.equal(l(0x25be22), 0x00246710, '$25BE20 jsr $246710 -- the OTHER loader');
    assert.equal(l(0x25be28), ARM1SCREEN.handle, '$25BE26 move.l D0,$812E6E -- THE OVERWRITE');

    // ...and the wait at $25BE2E reads that same word.
    assert.equal(w(0x25be2e), 0x2039, '$25BE2E move.l abs.l,D0');
    assert.equal(l(0x25be30), ARM1SCREEN.handle, '  ...$812E6E, the handle $25BE26 just replaced');
    assert.equal(l(0x25be36), 0x0024681a, '$25BE34 jsr $24681A');
    assert.equal(l(0x25be40), 0x00246800, '$25BE3E jsr $246800');
    assert.equal(w(0x25be44), 0x6000, '$25BE44 bra.w');
    assert.equal(0x25be46 + w(0x25be46), 0x25be6a, '  ...to $25BE6A -- PAST the carry-SET exit');

    // The latch makes it stronger than arm 9's compare: once bit 1 is set the init wait is
    // unreachable forever, so no later handle can be mistaken for it.
    assert.equal(w(0x25bdc2), 0x08f9, '$25BDC2 bset #imm,abs.l');
    assert.equal(w(0x25bdc4), 1, '  ...bit 1, set once the INIT chain has been freed');
  });

test('W391 SECTION 2: `ori.w #$1,SR` sets the carry and `move.w D0,D0` clears it', { skip: SKIP },
  () => {
    // The RUNNING exit.
    assert.equal(l(0x25be60), 0x4cdf7fff, '$25BE60 movem.l (A7)+');
    assert.equal(w(0x25be64), 0x007c, '$25BE64 is $007C -- ORI #imm,SR, NOT $003C (ORI to CCR)');
    assert.equal(w(0x25be66), 1, '  ...#$1, and bit 0 of SR is the CARRY. It SETS it');
    assert.equal(w(0x25be68), 0x4e75, '$25BE68 rts');

    // The FINISHED exit, four bytes later, and it is not an `andi`.
    assert.equal(l(0x25be6a), 0x4cdf7fff, '$25BE6A movem.l (A7)+ -- the second one');
    assert.equal(w(0x25be6e), 0x3000, '$25BE6E is $3000 -- `move.w D0,D0`');
    assert.equal(w(0x25be70), 0x4e75, '$25BE70 rts');
    // MOVE clears C and V by definition, so the idiom is a carry clear with no ANDI in sight.
    // A reader looking for `023C FFFE` would conclude the routine cannot finish -- which is
    // exactly what the brief concluded.
    assert.equal(ARM1SCREEN.bodyEnd, 0x25be72, 'so the body ends at $25BE71');

    // And the caller acts on it.
    assert.equal(w(0x25a904), 0x6500, '$25A904 bcs.w');
    assert.equal(0x25a906 + w(0x25a906), 0x25a910, '  ...to $25A910, the `rts` -- the HOLD');
    assert.equal(w(0x25a910), 0x4e75, '  ...and $25A910 really is that `rts`');
    assert.equal(w(0x25a908), 0x303c, '$25A908 move.w #imm,D0');
    assert.equal(w(0x25a90a), 5, '  ...#$5 -- ARM 1 GOES TO STATE 5');
    assert.equal(w(0x25a90c), 0x6100, '$25A90C bsr.w');
    assert.equal(0x25a90e + ((w(0x25a90e) << 16) >> 16), 0x25a764, '  ...$25A764, the state setter');
  });

test('W391 SECTION 2: the body machine, driven on a bare RAM, one transition at a time',
  { skip: SKIP }, () => {
    const ram = new Ram(new Uint8Array(0x20000));
    const rom = rawRom();
    const { ctx } = noteCtx();
    screen1Init25BBB4(ram, rom, ctx);

    // Frame 1 -- the bit-0 latch fires and the init chain is built.
    assert.equal(screen1Body25BD7C(ram, rom, ctx), true, 'frame 1 is still running');
    assert.equal(ram.u8(ARM1SCREEN.flags) & 1, 1, '  ...bit 0 latched');
    const initHandle = ram.u32(ARM1SCREEN.handle);
    assert.notEqual(initHandle, 0, '  ...and $24641A returned a real handle');
    assert.equal(ram.u16(ARM1SCREEN.phase), 0, '  ...phase still 0');
    assert.equal(ram.u16(ARM1SCREEN.timer), ARM1SCREEN.timerInit,
      '  ...and the timer has NOT started: phase 0 never reaches $25BE0A');

    // Frame 2 -- the latch holds, so no second chain is built over the first.
    screen1Body25BD7C(ram, rom, ctx);
    assert.equal(ram.u32(ARM1SCREEN.handle), initHandle,
      'the `bset` latch is what stops frame 2 building a SECOND init chain over the first');
  });

// ===============================================================================================
// SECTION 3 -- THE DRAW: SEVEN SPRITES, TWO EMITTERS, AND ONE `bsr` INTO A BARE `rts`.
// ===============================================================================================

test('W391 SECTION 3: $25BE54\'s bsr lands on a bare `rts`, and $25BF82 is unreferenced',
  { skip: SKIP }, () => {
    assert.equal(w(0x25be54), 0x6100, '$25BE54 bsr.w');
    assert.equal(0x25be56 + w(0x25be56), ARM1SCREEN.deadStub, '  ...to $25BF80');
    assert.equal(w(ARM1SCREEN.deadStub), 0x4e75, '$25BF80 is `4E75` -- a BARE `rts`, and that '
      + 'is the whole subroutine');

    // The fully-formed enqueue two bytes later is real code and it is NEVER CALLED.
    assert.equal(w(ARM1SCREEN.deadDraw), 0x223c, '$25BF82 move.l #imm,D1');
    assert.equal(l(ARM1SCREEN.deadDraw + 2), 0x64003000, '  ...#$64003000');
    assert.equal(l(ARM1SCREEN.deadDraw + 8), 0x00334470, '$25BF88 move.l #$334470,D2');
    assert.equal(l(0x25bf96 + 2), 0x0023dece, '$25BF96 jmp $23DECE -- a complete draw');

    // TRAP 8: the bound is proven by a SCAN, not by an assertion of absence. Every 16-bit
    // PC-relative branch and every absolute-long jsr/jmp in $250000..$270000.
    const refs = [];
    for (let a = 0x250000; a < 0x270000; a += 2) {
      const op = w(a);
      if (op === 0x6100 || op === 0x6000) {
        if (a + 2 + ((w(a + 2) << 16) >> 16) === ARM1SCREEN.deadDraw) refs.push(a);
      }
      if ((op === 0x4eb9 || op === 0x4ef9) && l(a + 2) === ARM1SCREEN.deadDraw) refs.push(a);
    }
    assert.deepEqual(refs, [], '$25BF82 has ZERO references in $250000..$270000. It is a '
      + 'shipping-disabled draw, the same family as $25E29E\'s three dead arms, and the '
      + 'disablement was done by branching one instruction short of it');
    assert.equal(ARM1SCREEN.draws[3], null, 'so the port\'s fourth draw slot is `null`');
    assert.equal(ARM1SCREEN.draws.length, 5, '...and the slot is KEPT, so the count is five '
      + 'with one dead rather than a silent four');
  });

test('W391 SECTION 3: the six `bsr`s of $25BE48 resolve where the port says, and the last is '
  + 'a ZOOM table walk', { skip: SKIP }, () => {
    const want = [0x25bf48, 0x25bf2c, 0x25bf64, 0x25bf80, 0x25bf9e, 0x25bd26];
    for (let i = 0; i < 6; i++) {
      const at = ARM1SCREEN.draw + i * 4;
      assert.equal(w(at), 0x6100, `$${at.toString(16).toUpperCase()} bsr.w`);
      assert.equal(at + 2 + ((w(at + 2) << 16) >> 16), want[i],
        `  ...to $${want[i].toString(16).toUpperCase()}`);
    }
    // The five register stubs, literal for literal.
    for (const d of ARM1SCREEN.draws) {
      if (d === null) continue;
      assert.equal(w(d.at), 0x223c, `$${d.at.toString(16).toUpperCase()} move.l #imm,D1`);
      assert.equal(l(d.at + 2), d.d1, '  ...D1');
      assert.equal(l(d.at + 8), d.d2, '  ...D2');
      assert.equal(w(d.at + 14), d.d3, '  ...D3');
      assert.equal(w(d.at + 18), d.d4, '  ...D4');
      // NO `addi.l` anywhere -- arm 9's two enqueues each have one and arm 1's have none.
      assert.notEqual(w(d.at + 6), 0x0681, 'and there is NO `addi.l #imm,D1`, unlike arm 9');
    }
    assert.equal(w(0x25c4d6), 0x0681, '...where arm 9\'s first enqueue really does have one');

    // The sixth is a different emitter entirely, which neither template uses.
    assert.equal(w(0x25bd26), 0x49fa, '$25BD26 lea (d16,PC),A4');
    assert.equal(0x25bd28 + ((w(0x25bd28) << 16) >> 16), ARM1SCREEN.zoomTable,
      '  ...TRAP 4 with a NEGATIVE displacement: $25BD28 - $102 = $25BC26');
    assert.equal(w(0x25bd2a), 0x0c94, '$25BD2A cmpi.l #imm,(A4)');
    assert.equal(l(0x25bd2c), 0xffffffff, '  ...#$FFFFFFFF -- THE TERMINATOR, and the bound');
    assert.equal(w(0x25bd3a), 0x363c, '$25BD3A move.w #imm,D3');
    assert.equal(w(0x25bd3c), ARM1SCREEN.zoomD3, '  ...#$210, rebuilt INSIDE the loop');
    assert.equal(w(0x25bd3e), 0x383c, '$25BD3E move.w #imm,D4');
    assert.equal(w(0x25bd40), ARM1SCREEN.zoomD4, '  ...#$2');
    assert.equal(w(0x25bd42), 0x2c2c, '$25BD42 move.l (d16,A4),D6 -- the ZOOM longword');
    assert.equal(w(0x25bd44), 0x000c, '  ...at ($C,A4)');
    assert.equal(l(0x25bd48), 0x0023e2f2, '$25BD46 jsr $23E2F2 -- the ZOOMING enqueue');
    assert.equal(ARM1SCREEN.zoomEmit, 0x23e2f2, 'and NEITHER template touches this emitter');
    assert.equal(SCREEN12.emit, 0x23dece, 'arm 12 uses $23DECE only...');
    assert.equal(ARM9SCREEN.emit, 0x23dece, '...and so does arm 9');
    assert.equal(w(0x25bd4c), 0x49ec, '$25BD4C lea (d16,A4),A4');
    assert.equal(w(0x25bd4e), 0x0010, '  ...+$10, the entry stride');
    assert.equal(w(0x25bd50), 0x60d8, '$25BD50 bra.s -40');
    assert.equal(0x25bd52 - 40, 0x25bd2a, '  ...back to the cmpi, NOT to the lea');

    // Three entries, and the terminator really is the fourth longword.
    let n = 0;
    while (l(ARM1SCREEN.zoomTable + n * 0x10) !== 0xffffffff) n++;
    assert.equal(n, ARM1SCREEN.zoomEntries, 'the walk runs THREE entries');
    assert.equal(l(0x25bc56), 0xffffffff, 'and $25BC56 is the $FFFFFFFF that stops it');
  });

test('W391 SECTION 3: the draw emits SEVEN sprites -- COUNTED, not assumed', { skip: SKIP },
  () => {
    const ram = new Ram(new Uint8Array(0x20000));
    const rom = rawRom();
    ram.setU16(EMIT.counter, 0);
    screen1Draw25BE48(ram, rom, noteCtx().ctx);
    const recs = emitted(ram);

    assert.equal(recs.length, 7, 'FOUR through $23DECE plus THREE through $23E2F2. Arm 12 emits '
      + 'ONE and arm 9 emits TWO; copying either template\'s draw would have put a fraction of '
      + 'the screen on the display and every other test in this file would still have passed');
    assert.equal(ARM1SCREEN.emitsPerFrame, 7);

    // Words 2 and 3 are D2 straight through, on BOTH emitters, so the art longwords identify
    // which record came from which call and in what order.
    const art = recs.map((r) => ((r[2] << 16) | r[3]) >>> 0);
    assert.deepEqual(art, [
      0x003344f8, 0x00334f60, 0x00334494, 0x00334efc,     // $25BF48 $25BF2C $25BF64 $25BF9E
      0x00000b20, 0x00000b34, 0x00000fbc,                 // the three $25BC26 entries, in order
    ], 'and $334470 -- the dead $25BF82 draw -- is NOT among them');
    assert.equal(art.includes(0x00334470), false,
      'a port that "helpfully" called $25BF82 would put an eighth sprite the board never draws');

    // Word 4 is D3 straight through on both emitters, which separates the two families: the
    // four register stubs carry their own size words, the three zoom entries all carry $210.
    assert.deepEqual(recs.map((r) => r[4]),
      [0x20a0, 0x30c0, 0x0260, 0x0620, 0x0210, 0x0210, 0x0210]);

    // **AND THE COORDS, WHICH ARE THE ONLY THING THAT SEPARATES THE TWO EMITTERS.** This wave
    // ablated the zoom walk by pointing it at `$23DECE` instead of `$23E2F2` -- the exact
    // "structurally the same" mistake the brief warns about -- and every assertion above still
    // passed, because D2 and D3 go through both emitters untouched. Words 0 and 1 do not:
    // `$23E2F2` recentres by `($80 - flagbyte) * scale` on each axis and `or.l`s the WHOLE D6
    // into the packed coords, where `$23DECE` unconditionally ors `NO_ZOOM_OR` = $80008000.
    assert.deepEqual(recs.map((r) => (r[0] << 16 | r[1]) >>> 0), [
      0x80688020, 0x80388008, 0x81288070, 0x80108010,   // the four $23DECE stubs
      0x80388018, 0x80388020,                            // zoom entries [0] and [1], D6 $80008000
      0x403c401e,                                        // entry [2], D6 $40004000 -- **$4**, not $8
    ], 'record 6 is the load-bearing one: its D6 is $40004000, so its coord long opens $4, and '
      + '$23DECE could not produce that value under any argument because it ORs $80008000 into '
      + 'every record it writes. Two of the three would look plausible; this one cannot');
    assert.equal(l(ARM1SCREEN.zoomTable + 2 * 0x10 + 0x0c), 0x40004000,
      'and the $40004000 really is entry [2]\'s ($C,A4) longword in the cartridge');
    assert.equal(l(ARM1SCREEN.zoomTable + 0x0c), 0x80008000, 'entries [0] and [1] carry $80008000');
    assert.equal(l(ARM1SCREEN.zoomTable + 0x10 + 0x0c), 0x80008000);
  });

// ===============================================================================================
// SECTION 4 -- DRIVEN. THE REAL COLD BOOT, PAST +1,182, WITH ARM 1 ADVANCING.
// ===============================================================================================
//
// TRAP 16: run LONG. Arm 1's own waits are a chain, then $1E0 = 480 timer frames, then another
// chain -- 736 frames end to end from the frame it is entered. The runs below go to 8,000.

async function coldBootTrace(frames) {
  const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
  g.boot({ cabinetFrontend: true });
  assert.equal(g.ram.u8(0x803957), 1, '$23C6FA initialized the coinage byte');
  const arms = [];
  const screen = [];
  let prevArm = -1, prevSt = -1;
  for (let f = 1; f <= frames; f++) {
    g.step(0xffff);
    const a = g.ram.u16(SCREEN8.state);
    if (a !== prevArm) { arms.push([f, a]); prevArm = a; }
    // The flag BYTE and the phase word together are arm 1's whole state.
    const s = (g.ram.u8(ARM1SCREEN.flags) << 16) | g.ram.u16(ARM1SCREEN.phase);
    if (s !== prevSt) { screen.push([f, s]); prevSt = s; }
  }
  return { g, arms, screen };
}

test('W391 SECTION 4: on a real cold boot the sequencer runs 13 -> 2 -> 12 -> 9 -> 1 -> 5',
  { skip: SKIP_T }, async () => {
    const { g, arms } = await coldBootTrace(8000);
    // **W392 RE-BASE, AND IT IS THE ONE THIS TEST ASKED FOR.** The list ended at `[1918, 5]`
    // and the line below it said arm 5's `$25C592`/`$25C6D4` "is the next wave". It was: they
    // are ported, arm 5's $10 and $960 counters run down in 2,415 frames, the carry comes out
    // CLEAR and `teardown25A9B2` restages slot [8] at state 2. So the trace continues, and
    // asserting the six-entry list would now be asserting that the loop does not close.
    // EVERYTHING THIS TEST IS NAMED FOR IS UNCHANGED: the first six transitions are identical,
    // frame for frame, and they are still compared as a prefix.
    assert.deepEqual(arms.slice(0, 6), [[1, 13], [302, 2], [574, 12], [878, 9], [1182, 1],
      [1918, 5]],
    'W390 measured 13 -> 2 -> 12 -> 9 -> 1 and arm 1 PARKING at +1,182. It parks no more: '
      + 'arm 1 runs 736 frames and hands the machine to state 5 at +1,918');
    assert.deepEqual(arms.slice(6), [[4334, 2], [4606, 12], [4910, 9], [5214, 1], [5950, 5]],
      '...and W392 ports arm 5, so at +4,334 the machine comes BACK to arm 2 and walks the '
      + 'same four arms again. The attract loop cycles; it no longer rests anywhere');
    assert.equal(g.ram.u16(SCREEN8.state), 5,
      'and at +8,000 it is mid-demo on the second lap -- arm 5 again, 2,050 frames in');
  });

test('W391 SECTION 4: the exit is 607 frames AFTER the init chain drained, which is what proves '
  + 'it waits on the second chain', { skip: SKIP_T }, async () => {
    const { arms, screen } = await coldBootTrace(2200);
    // $0 -> $10000 is the bit-0 latch on arm 1's first body frame; $10000 -> $30001 is bit 1
    // (the init chain freed) AND the phase going to 1, both on the same frame at $25BDC2/$25BDCA.
    assert.deepEqual(screen, [[1, 0x00000], [1183, 0x10000], [1311, 0x30001]],
      'the init chain is BUILT at +1,183 and DRAINED at +1,311');
    const drainedInit = 1311;
    const left = arms.find(([, a]) => a === 5)[0];
    assert.equal(left, 1918, 'the screen finished at +1,918');
    assert.equal(left - drainedInit, 607,
      'A PORT THAT WAITED ON THE INIT CHAIN WOULD HAVE EXITED AT +1,311, 607 frames early. It '
      + 'did not: $25BE26 replaced the handle and $25BE2E waits on the SECOND chain');
    assert.equal(ARM1SCREEN.timerInit, 480, 'of those 607, 480 are the $1E0 timer...');
    assert.equal(607 - 480, 127, '...and 127 are the $246710 chain draining on its own');
    // The chain is really gone by then, not merely ignored.
    assert.equal(1183 - 1182, 1,
      'and the init chain is built on arm 1\'s FIRST body frame, not in $25BBB4 -- the init '
      + 'loads no chain at all, which is why the latch exists');
  });

test('W391 SECTION 4: $25BE26 is a VALUE-IDENTICAL store, which is why the ablation above '
  + 'deletes the WAIT and not the store', { skip: SKIP_T }, async () => {
    // A finding, recorded because the obvious ablation for "which chain does the exit wait on"
    // is to delete `$25BE26` -- and that ablation PROVES NOTHING here.
    //
    // `$24641A` and `$246710` allocate from the SAME three-slot player list, and by the frame
    // `$25BE20` runs, `$25BDB4`'s `$246800` has already freed the init chain's slot. So the
    // second loader hands back the SAME ROOT ADDRESS the first one did, and `$25BE26` writes a
    // value that is already there. The two chains differ in CONTENT, not in handle.
    const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
    g.boot({ cabinetFrontend: true });
    assert.equal(g.ram.u8(0x803957), 1, '$23C6FA initialized the coinage byte');
    let initRoot = 0, secondRoot = 0;
    for (let f = 1; f <= 2000; f++) {
      g.step(0xffff);
      if (f === 1183) initRoot = g.ram.u32(ARM1SCREEN.handle);   // just after $24641A
      if (f === 1792) secondRoot = g.ram.u32(ARM1SCREEN.handle);  // just after $246710
    }
    assert.notEqual(initRoot, 0, 'the init chain built a real root at +1,183');
    assert.notEqual(secondRoot, 0, 'the second chain built one at +1,792');
    assert.equal(secondRoot, initRoot,
      'AND THEY ARE THE SAME ADDRESS. This is trap 18\'s shape -- a store that silently agrees '
      + 'with what is already there -- so deleting $25BE26 alone changes nothing observable. '
      + 'The proof that the exit waits on the SECOND chain is the 607-frame gap above, and the '
      + 'ablation that moves it deletes the WAIT');
    assert.equal(1792 - 1311, ARM1SCREEN.timerInit + 1,
      'and +1,792 is 481 frames after the init chain drained -- the $1E0 countdown plus the '
      + 'frame the phase was set on, which is the frame the second loader runs');
  });

test('W621 SECTION 4: arm 1 and all four production presentation calls are live',
  { skip: SKIP_T }, async () => {
    const { g } = await coldBootTrace(2200);
    const report = g.unportedLog.report().join('\n');
    for (const a of ['$25BBB4', '$25BD7C', '$25BDE0',
      '$25BB6C', '$25C22A', '$25C252', '$25C286']) {
      assert.equal(report.includes(a), false,
        `${a} is live in the production context and must not be counted`);
    }
  });

test('W391 SECTION 4: 8,000 frames of the real machine and the sprite queue never overflows',
  { skip: SKIP_T }, async () => {
    // Seven records a frame for 736 frames is 5,152 records through one bucket. TRAP 16 again:
    // a short run would never reach the wrap.
    const { g } = await coldBootTrace(8000);
    assert.ok(g.ram.u16(EMIT.counter) >= 0, 'the run completed without a throw');
    // W392 -- still 5 at +8,000, but for a different reason: the SECOND lap's arm 5, not a
    // parked one. The claim here is that 8,000 frames of the real machine do not overflow the
    // queue, and a cycling sequencer exercises it harder than a parked one did.
    assert.equal(g.ram.u16(SCREEN8.state), 5, 'and ended where it should');
  });

// ===============================================================================================
// SECTION 5 -- ARM 3, `$25BDE0`, WHICH IS **NOT** ARM 1'S BODY.
// ===============================================================================================

test('W391 SECTION 5: arm 3 shares the INIT and the DRAW and nothing else', { skip: SKIP }, () => {
  // Both arms call $25BBB4.
  assert.equal(l(0x25a8fa), 0x0025bbb4, '$25A8F8 jsr $25BBB4 -- arm 1');
  assert.equal(l(0x25a95e), 0x0025bbb4, '$25A95C jsr $25BBB4 -- arm 3, the SAME init');
  // And two DIFFERENT bodies.
  assert.equal(l(0x25a900), 0x0025bd7c, '$25A8FE jsr $25BD7C -- arm 1\'s body');
  assert.equal(l(0x25a96a), 0x0025bde0, '$25A968 jsr $25BDE0 -- arm 3\'s, a different routine');
  assert.notEqual(ARM1SCREEN.body, ARM1SCREEN.arm3Body);

  // **ARM 3 NEVER READS THE CARRY.** $25A96E is a `bsr.w`, not a `bcs`.
  assert.equal(w(0x25a96e), 0x6100, '$25A96E is `6100` -- bsr.w, NOT a `6500` bcs');
  assert.equal(0x25a970 + w(0x25a970), 0x25acac, '  ...$25ACAC, the join poll, unconditionally');
  assert.equal(w(0x25a972), 0x4e75, '$25A972 rts -- and there is nothing else in the arm');
  assert.equal(w(0x25a904), 0x6500, 'where arm 1\'s $25A904 IS a bcs. That is the difference');

  // The body itself: a one-shot latch on the third word of the shared clear, then the draw.
  assert.equal(l(0x25bde0), 0x48e7fffe, '$25BDE0 movem.l');
  assert.equal(w(0x25bde4), 0x4a79, '$25BDE4 tst.w abs.l');
  assert.equal(l(0x25bde6), ARM1SCREEN.arm3Latch, '  ...$812E6A -- word 3 of $25BBB4\'s clear');
  assert.equal(w(0x25bdea), 0x665c, '$25BDEA bne.s +$5C');
  assert.equal(0x25bdec + 0x5c, ARM1SCREEN.draw, '  ...straight to $25BE48, the shared draw');
  assert.equal(w(0x25be08), 0x603e, '$25BE08 bra.s +$3E');
  assert.equal(0x25be0a + 0x3e, ARM1SCREEN.draw, '  ...and so does the other path');
  // So EVERY path through $25BDE0 reaches $25BE64 `ori.w #$1,SR`. It always returns carry set.
  assert.equal(w(0x25bdfe), 0x4eb9, '$25BDFE jsr abs.l...');
  assert.equal(l(0x25be00), 0x002415c4, '  ...$2415C4 -- the BACKGROUND bank, $80F086 + D0*64');
  assert.equal(l(0x25bdf6), 0x0023046c, '$25BDF4 lea $23046C,A0 -- entry [5]\'s fade target');
  assert.equal(ARM1SCREEN.arm3Bg.src, 0x23046c);
  assert.equal(w(0x25be04), 0x6100, '$25BE04 bsr.w');
  assert.equal(0x25be06 + w(0x25be06), ARM1SCREEN.arm3Palettes, '  ...$25BE72');
});

test('W391 SECTION 5: $25BE72 installs the SAME five blocks the init script fades to',
  { skip: SKIP }, () => {
    // The five `lea`s: THREE absolute ($41F9, six bytes) and TWO PC-relative ($41FA, four).
    // Reading them all as one shape is how a sweep loses the last two sources.
    const leas = [0x25be72, 0x25be82, 0x25be92, 0x25bea2, 0x25beb0];
    for (let i = 0; i < 5; i++) {
      const lea = leas[i];
      const src = ARM1SCREEN.arm3Spr[i].src;
      if (i < 3) {
        assert.equal(w(lea), 0x41f9, `$${lea.toString(16).toUpperCase()} lea abs.l,A0`);
        assert.equal(l(lea + 2), src, `  ...$${src.toString(16).toUpperCase()}`);
      } else {
        assert.equal(w(lea), 0x41fa, `$${lea.toString(16).toUpperCase()} lea (d16,PC),A0`);
        // TRAP 4 again, and both displacements are NEGATIVE.
        assert.equal(lea + 2 + ((w(lea + 2) << 16) >> 16), src,
          `  ...$${(lea + 2).toString(16).toUpperCase()} - $${
            (0x10000 - w(lea + 2)).toString(16).toUpperCase()} = $${src.toString(16).toUpperCase()}`);
      }
      const at = ARM1SCREEN.arm3Spr[i].at;
      assert.equal(w(at - 4), 0x303c, `$${(at - 4).toString(16).toUpperCase()} move.w #imm,D0`);
      assert.equal(w(at - 2), ARM1SCREEN.arm3Spr[i].bank, `  ...bank ${i}`);
      assert.equal(w(at), 0x4eb9, '  ...and jsr abs.l');
      assert.equal(l(at + 2), 0x0024150a, '  ...$24150A');
      // ...and the source is entry [i] of the INIT SCRIPT's fade targets.
      assert.equal(l(ARM1SCREEN.initScript + 2 + i * 14 + 6), src,
        `entry [${i}] of $25BFBA fades TO the block arm 3 installs INSTANTLY. Same colours, `
        + 'two routes -- which is why the credit screen and the demo screen agree');
    }
    assert.equal(w(0x25bebe), 0x4e75, '$25BEBE rts -- AT the last address (trap 5)');
  });

test('W391 SECTION 5: arm 3 really runs on the real coin path, and installs six banks',
  { skip: SKIP_T }, async () => {
    const g = new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
    g.boot({ cabinetFrontend: true });
    assert.equal(g.ram.u8(0x803957), 1, '$23C6FA initialized the coinage byte');
    for (let f = 1; f <= 400; f++) g.step(0xffff);
    assert.equal(g.ram.u16(SCREEN8.state), 2, 'at +400 the machine is on arm 2');
    const before = g.palette.installCount;
    const beforeKeys = new Set(g.palette.installs.keys());

    g.ram.setU8(0x80395a, 1);                             // the coin
    const arms = [];
    let prev = 2;
    for (let f = 401; f <= 2000; f++) {
      g.step(0xffff);
      const a = g.ram.u16(SCREEN8.state);
      if (a !== prev) { arms.push([f, a]); prev = a; }
    }
    assert.deepEqual(arms, [[402, 3]],
      'the coin gate restages at state 3 and arm 3 then runs 1,598 frames without throwing');
    assert.equal(g.ram.u16(ARM1SCREEN.arm3Latch), 1, 'its one-shot latch fired exactly once');

    // SEVEN installs happened, and one of them is NOT arm 3's: `$25A80E` is the coin
    // teardown's TX bank, which this port already had. Naming it is the difference between a
    // measurement and a number that happens to match.
    assert.equal(g.palette.installCount - before, 7);
    const added = [...g.palette.installs.keys()].filter((k) => !beforeKeys.has(k));
    assert.deepEqual(added.sort(), [
      "$25A80E TX bank 0 <- slot [8] coin-teardown TX palette",
      "$25BDFE BG banks 0..0 <- slot [8] arm 3's credit-screen background bank",
      "$25BE7C bank 0 <- slot [8] arm 3's credit-screen palette",
      "$25BE8C bank 1 <- slot [8] arm 3's credit-screen palette",
      "$25BE9C bank 2 <- slot [8] arm 3's credit-screen palette",
      "$25BEAA bank 3 <- slot [8] arm 3's credit-screen palette",
      "$25BEB8 bank 4 <- slot [8] arm 3's credit-screen palette",
    ], 'SIX of the seven are arm 3\'s: five sprite banks through $24150A and one BACKGROUND '
      + 'bank through $2415C4, each attributed to its own jsr. A port that noted either half '
      + 'would be missing five rows or one');
    const report = g.unportedLog.report().join('\n');
    assert.equal(/\$2415C4/.test(report), false, 'and neither is counted as a deferral');
  });

// ===============================================================================================
// SECTION 6 -- THE SIX ROM WINDOWS, RE-DERIVED FROM THE CARTRIDGE.
// ===============================================================================================

test('W391 SECTION 6: every bound is stated by CODE, never by an absence (trap 8)', { skip: SKIP },
  () => {
    // The INIT script: count 6, fourteen bytes an entry, ending AT the load script.
    assert.equal(w(ARM1SCREEN.initScript), ARM1SCREEN.scriptNodes, '$25BFBA count word is 6');
    assert.equal(ARM1SCREEN.initScript + 2 + 6 * 14, ARM1SCREEN.loadScript,
      '2 + 6*14 = $56 lands EXACTLY on $25C010, which is the address $25BE1A\'s own lea names');
    assert.equal(ARM1SCREEN.initScriptBytes, 0x56);

    // The LOAD script: count 6, eight bytes an entry, ending AT the rank-string pointer table.
    assert.equal(w(ARM1SCREEN.loadScript), ARM1SCREEN.scriptNodes, '$25C010 count word is 6');
    assert.equal(ARM1SCREEN.loadScript + 2 + 6 * 8, 0x25c042,
      '2 + 6*8 = $32 lands EXACTLY on $25C042, which is what $25C22A\'s lea resolves to');
    assert.equal(0x25c22c + ((w(0x25c22c) << 16) >> 16), 0x25c042, '  ...and it does resolve there');
    assert.equal(ARM1SCREEN.loadScriptBytes, 0x32);
    // SIX nodes each, where both templates have TWO. Six is what makes the pool pressure real.
    assert.equal(SCREEN12.scriptNodes, 2);
    assert.equal(ARM9SCREEN.scriptNodes, 2);

    // The ZOOM table: bounded by the terminator its own walk compares against.
    assert.equal(ARM1SCREEN.zoomTable + ARM1SCREEN.zoomEntries * 0x10 + 4,
      ARM1SCREEN.zoomTable + ARM1SCREEN.zoomTableBytes, '3 x $10 + the $FFFFFFFF long = $34');

    // The five fade targets, from the six 14-byte entries.
    const want = [0x2259f8, 0x2259b8, 0x222838, 0x25baec, 0x25bb2c, 0x23046c];
    for (let i = 0; i < 6; i++) {
      const e = ARM1SCREEN.initScript + 2 + i * 14;
      assert.equal(l(e + 6), want[i], `$25BFBA entry [${i}] targets $${want[i].toString(16)}`);
      assert.equal(w(e + 10), 0x001f, '  ...words-minus-one $1F, so $246B2A\'s dbra covers 32 '
        + 'words = $40 bytes (trap 2)');
    }
    // ABUTTING IS NOT OVERLAPPING, and both of these are pinned by something real.
    assert.equal(0x2259b8 + 0x80, 0x225a38, 'the $2259B8 pair ends where W389\'s target begins');
    assert.equal(0x25baec + 0x80, ARM1SCREEN.txBlock,
      'and the $25BAEC pair ends at $25BB6C -- pinned by the CODE that follows it');
    assert.equal(w(0x25bb6c), 0x4eb9, '  ...which opens `jsr`, not the `48E7` a screen would');
    assert.equal(w(0x25bb6a), 0x7fff, '  ...and the word before it is palette, not code');
  });

test('W391 SECTION 6: the exported tables really carry all six windows', { skip: SKIP_T }, () => {
  const win = tablesJson.rom.windows.map((x) => [parseInt(String(x.base).replace('$', ''), 16),
    x.len]);
  const covers = (a, n) => win.some(([b, ln]) => b <= a && a + n <= b + ln);
  for (const [a, n, why] of [
    [ARM1SCREEN.initScript, 0x56, 'the init script'],
    [ARM1SCREEN.loadScript, 0x32, 'the load script'],
    [ARM1SCREEN.zoomTable, 0x34, 'the zoom draw table'],
    [0x2259b8, 0x80, 'fade targets [1] and [0]'],
    [0x25baec, 0x80, 'fade targets [3] and [4]'],
    [0x23046c, 0x40, 'fade target [5], and arm 3\'s BG bank'],
  ]) {
    assert.ok(covers(a, n), `$${a.toString(16).toUpperCase()}+$${n.toString(16).toUpperCase()
    } (${why}) is not fully inside a declared window`);
  }
  // Entry [2] is NOT re-declared -- W373 already covers it, and re-declaring would be a widen.
  assert.ok(covers(0x222838, 0x40), 'entry [2] $222838 is already inside W373\'s window');
  // The state-1 chain hardcodes N.target to $246BB8, so it needs no fade-target window at all.
  assert.ok(covers(0x246bb8, 0x80), 'and $246BB8 -- $246710\'s constant target -- is in W91\'s');

  // NO OVERLAPS ADDED. Counted across the WHOLE set, with and without the six.
  const mine = new Set(['25bfba,86', '25c010,50', '25bc26,52', '2259b8,128', '25baec,128',
    '23046c,64']);
  const key = ([a, n]) => `${a.toString(16)},${n}`;
  const pairs = (ws) => {
    let n = 0;
    for (let i = 0; i < ws.length; i++) {
      for (let j = i + 1; j < ws.length; j++) {
        if (ws[i][0] < ws[j][0] + ws[j][1] && ws[j][0] < ws[i][0] + ws[i][1]) n++;
      }
    }
    return n;
  };
  const without = win.filter((x) => !mine.has(key(x)));
  assert.equal(win.length - without.length, 6, 'all six are in the exported list');
  assert.equal(pairs(win), pairs(without),
    'and the overlapping-pair count across the whole 564-window set is IDENTICAL with and '
    + 'without them. Six new windows, zero new overlaps -- never widen, always declare');
});
