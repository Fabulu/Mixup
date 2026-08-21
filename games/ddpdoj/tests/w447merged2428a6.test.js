// ===============================================================================================
// WAVE 447 -- `$2428A6` WAS TRANSCRIBED TWICE AND THE SECOND COPY READ THE WRONG BYTE,
//             AND `$242B3C` WAS TRANSCRIBED TWICE BYTE FOR BYTE.
// ===============================================================================================
//
// W446 merged `$25FFA8` and left a register of TWENTY-FOUR other ROM addresses claimed by two
// or more `export function`s. This wave read all twenty-four and merged the two whose merge it
// could prove. The audit is in the docket; what is asserted here is the two merges.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG -- `$2428A6`
// ---------------------------------------------------------------------------
// W62 ported `$2428A6` into `boss.js` as `livePlayers2428A6`. W403 ported THE SAME 44 BYTES
// into the same file, 1,275 lines lower, as `bossDecide2428A6`, for Hibachi's second form.
// Both readings are true -- `$294F44` asks "is anybody alive" and `$2A6CFC`/`$2A6EEE`/`$2A7090`
// ask "may the boss die" -- but the cartridge has ONE routine, nothing compared the two copies,
// and they had drifted on the one instruction that decides:
//
//     $2428B0  0839 0000 0081 03e6   btst #$0,$8103E6
//
// `btst` with a MEMORY operand is BYTE-sized, so the bit is bit 0 of the byte AT `$8103E6` --
// the record word's HIGH half. `livePlayers2428A6` reads `ram.u8(0x8103e6)`. `bossDecide2428A6`
// read `ram.u8(0x8103e6 + 1)`: the LOW half, a different bit of a different byte.
//
// **WHAT IT COST.** `hyper.js requestHyper249868` does `bset` #0 of `($1,A6)` on the player
// record when Button 2 is pressed with hyper stock, so a player IN HYPER holds `$8103E7` bit 0
// SET while the record word is still negative. Under the wrong byte that player stopped
// counting; `$2A715E`/`$2A6FDA`/`$2A6D02`/`$2A7090` then read ZERO, and the arm they take on
// zero is `move.l #$200,($16,A5)` -- **Hibachi's second form REFILLS its HP pool instead of
// dying.** SECTION 3 traces exactly that, with the setter and every witness outside the two
// changed files.
//
// It is invisible on the board dumps: [M] across all 644 RAM dumps in
// `tools/oracle/out/w69/*/ckpt/*.ram.bin`, `$8103E6` holds only `$8000` (568), `$8020` (44),
// `$9000` (19), `$A004` (11) and `$8810` (2), and `$810448` holds `$0000` 644/644 -- every one
// of those six agrees under either byte. **Only the image settles it**, which is SECTION 1.
//
// ---------------------------------------------------------------------------
// WHAT WAS WRONG -- `$242B3C`
// ---------------------------------------------------------------------------
// `items.js` and `rng.js` each carried a `drawByte242B3C` and an `RNG_242B3C`. The two
// functions were identical to the character and advanced the SAME `$803917` counter over the
// SAME `$242BAC` table. No drift yet -- which is the point: eighty-odd call sites split across
// two bodies is the W446 defect one edit away from happening. SECTION 5.
//
// ---------------------------------------------------------------------------
// HOW THESE TESTS FAIL IF A MERGE IS FAKED -- read this before trusting them
// ---------------------------------------------------------------------------
//   * Deleting a copy without unifying behaviour: SECTION 2 requires exactly ONE export to
//     claim each address, and SECTION 3 requires the behaviour only the SURVIVING byte gives.
//   * Keeping the wrong byte under the surviving name: SECTION 3's fixture sets the low-byte
//     bit through `hyper.js`, never by hand, and SECTION 3b runs the DELETED body verbatim
//     against the same RAM and requires it to DISAGREE. If someone re-lands `+ 1`, SECTION 3b's
//     "the two copies disagree here" goes red at the same time as SECTION 3's death arm.
//   * Making the witnesses insensitive: SECTION 4 is the CONTROL. The identical frame with the
//     hyper bit CLEAR must reach the death arm too (both bytes say live there), and the frame
//     with the record word POSITIVE must reach the REFILL arm. A `livePlayers2428A6` that
//     ignored the record entirely would satisfy SECTION 3 and fail SECTION 4b.
//   * Typing the numbers instead of reading them: SECTION 1 decodes all 44 bytes of `$2428A6`
//     out of `maincpu.bin`, including the absolute-long EA of both `btst`s, and sweeps the
//     range for WIDE branches (`60 00`/`64 00`/`65 00`/`66 00`/`6b 00`) so no arm can vanish.
//   * Merging the RNG draw into something that does not draw: SECTION 5 replays 512 draws
//     against a from-ROM recomputation, so a body that returns a constant or skips the counter
//     bump reddens.
//
// THE WITNESSES ARE OUTSIDE THE CHANGED FILES (`boss.js`, `hibachi2.js`, `items.js`):
// `$812D3C` is scheduler.js's A4 slot table, `$8130F8` is the stage-end handshake byte,
// `$81B61A` is hud.js's `tallyMedalAcc`, and `$8103E7`'s bit is written by hyper.js.
// ===============================================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { UnportedLog } from '../src/unported.js';
import { RAM, P } from '../src/machine.js';
import { SCHED } from '../src/scheduler.js';
import { HYPER, requestHyper249868 } from '../src/hyper.js';
import { HIBACHI2, hibachiSecondForm2A6F12 } from '../src/hibachi2.js';
import { livePlayers2428A6 } from '../src/boss.js';
import { RNG, RNG_242B3C, drawByte242B3C } from '../src/rng.js';

// W451 merged six `$242684` private screen tests, taking 92 to 91. W453 merged
// the exported/private `$242494` octagonal-distance pair, taking 91 to 90.
const W453_NOTE = 'W451 merged $242684 (92 - 1 = 91); W453 merged $242494 '
  + '(survivor bossscripts.js dist242494), so 91 - 1 = 90. ';

const here = (p) => join(dirname(fileURLToPath(import.meta.url)), p);
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const SKIP_IMG = existsSync(IMAGE) ? false : 'maincpu.bin absent; skip, not pass';
const IMG = SKIP_IMG ? null : readFileSync(IMAGE);

const tablesPath = new URL('../rip/port/player.tables.json', import.meta.url);
const HAVE = existsSync(tablesPath);
const tables = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(tables.rom) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const P1REC = 0x8103e6;               // RAM.player1
const P2REC = 0x810448;               // RAM.player2
const A4SLOT0 = SCHED.a4Base;         // $812D3C -- scheduler.js's, in neither changed file
const HANDSHAKE = 0x8130f8;           // phase B's two bsets
const MEDALACC = 0x81b61a;            // hud.js HUDRAM.tallyMedalAcc

// ======================================================= SECTION 1: THE CARTRIDGE

test('SECTION 1: [M] $2428A6 is 44 bytes and BOTH `btst`s address $8103E6 / $810448 -- the '
  + 'HIGH half of each record word', { skip: SKIP_IMG }, () => {
  assert.equal(IMG.readUInt16BE(0x2428a6), 0x7000, '$2428A6 moveq #$0,D0');

  // tst.w $8103E6 -- $4A79 is TST with size %01 (word) and EA mode 111 / reg 001 (abs.L).
  assert.equal(IMG.readUInt16BE(0x2428a8), 0x4a79, '$2428A8 tst.w, abs.L');
  assert.equal((IMG.readUInt16BE(0x2428a8) >> 6) & 0x3, 0x1, '  ...size %01 = WORD, so bit 15');
  assert.equal(IMG.readUInt32BE(0x2428aa), P1REC, '  ...$8103E6');
  assert.equal(IMG.readUInt16BE(0x2428ae), 0x6a0c, '$2428AE bpl.s +$0C -> $2428BC');
  assert.equal(0x2428b0 + 0x0c, 0x2428bc, '  ...which is the P2 half, so PLUS skips P1');

  // **THE INSTRUCTION THIS WAVE IS ABOUT.** $0839 is BTST #imm,<ea> with EA mode 111 / reg 001
  // -- absolute LONG. A memory BTST is BYTE-sized: the operand is the byte AT the effective
  // address. That address is $8103E6, NOT $8103E7, and there is no displacement word between
  // the bit number and the address that could make it one.
  assert.equal(IMG.readUInt16BE(0x2428b0), 0x0839, '$2428B0 btst #imm,<abs.L>');
  assert.equal((IMG.readUInt16BE(0x2428b0) >> 3) & 0x7, 0x7, '  ...EA mode %111');
  assert.equal(IMG.readUInt16BE(0x2428b0) & 0x7, 0x1, '  ...EA reg %001 = absolute LONG');
  assert.equal(IMG.readUInt16BE(0x2428b2), 0x0000, '  ...bit number 0');
  assert.equal(IMG.readUInt32BE(0x2428b4), P1REC,
    'THE WHOLE WAVE: the byte tested is the one AT $8103E6 -- the record word\'s HIGH half, '
    + 'i.e. bit 8 of the word. `bossDecide2428A6` read $8103E7 and nothing compared them');
  assert.equal(IMG.readUInt16BE(0x2428b8), 0x6602, '$2428B8 bne.s +2 -- bit 0 SET skips the $10');
  assert.equal(IMG.readUInt16BE(0x2428ba), 0x7010,
    '$2428BA moveq #$10,D0 -- moveq SETS D0, it does not OR into it');

  assert.equal(IMG.readUInt16BE(0x2428bc), 0x4a79, '$2428BC tst.w, abs.L');
  assert.equal(IMG.readUInt32BE(0x2428be), P2REC, '  ...$810448');
  assert.equal(IMG.readUInt16BE(0x2428c2), 0x6a0c, '$2428C2 bpl.s -> $2428D0, the rts');
  assert.equal(IMG.readUInt16BE(0x2428c4), 0x0839, '$2428C4 btst #imm,<abs.L>');
  assert.equal(IMG.readUInt16BE(0x2428c6), 0x0000, '  ...bit 0');
  assert.equal(IMG.readUInt32BE(0x2428c8), P2REC, '  ...of the byte AT $810448, again the HIGH half');
  assert.equal(IMG.readUInt16BE(0x2428cc), 0x6602, '$2428CC bne.s -> $2428D0');
  assert.equal(IMG.readUInt16BE(0x2428ce), 0x5040,
    '$2428CE addq.w #$8,D0 -- ADDS, so both players live gives $18 and not $8');
  assert.equal(IMG.readUInt16BE(0x2428d0), 0x4e75, '$2428D0 rts');
  assert.equal(0x2428d2 - 0x2428a6, 44, 'forty-four bytes, entry to rts inclusive');
});

test('SECTION 1b: [M] every branch in $2428A6 is an 8-bit Bcc -- no WIDE branch hides an arm',
  { skip: SKIP_IMG }, () => {
  // Five waves running, this project has read `60 00`/`64 00`/`65 00`/`66 00`/`6b 00` as 8-bit
  // branches with a zero displacement and lost the arm behind the extension word. If $2428A6
  // held one, SECTION 1's straight decode would be off by two from that point on.
  const wide = [];
  const eight = [];
  for (let a = 0x2428a6; a < 0x2428d2; a += 2) {
    const w = IMG.readUInt16BE(a);
    if ((w & 0xf000) !== 0x6000) continue;
    if ((w & 0x00ff) === 0x00) wide.push(a.toString(16));
    else eight.push(a.toString(16));
  }
  assert.deepEqual(wide, [], 'a WIDE branch here would carry a 16-bit displacement word');
  assert.deepEqual(eight, ['2428ae', '2428b8', '2428c2', '2428cc'],
    'exactly four branches, and they are the four SECTION 1 names: two `bpl` sign tests and '
    + 'two `bne` bit tests, one pair per player');
});

// ======================================================= SECTION 2: ONE TRANSCRIPTION

// Built the same way `w444deferrals` and `w446mergedbonusline1` build theirs, so "claimed"
// means the same thing in all three files.
function portedIndex() {
  const SRC = here('../src');
  const files = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(join(dir, e.name), rel + e.name + '/');
      else if (e.name.endsWith('.js')) files.push([rel + e.name, readFileSync(join(dir, e.name), 'utf8')]);
    }
  })(SRC, '');
  const inRom = (a) => a >= 0x230000 && a < 0x2b0000;
  const ported = new Map();
  for (const [file, text] of files) {
    const lines = text.split(/\r?\n/);
    lines.forEach((L, i) => {
      const fn = L.match(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (!fn) return;
      const claim = (a) => {
        if (!inRom(a)) return;
        if (!ported.has(a)) ported.set(a, new Set());
        ported.get(a).add(`${file}:${i + 1} ${fn[1]}`);
      };
      const suffix = fn[1].match(/([0-9a-fA-F]{6})$/);
      if (suffix) claim(parseInt(suffix[1], 16));
      let j = i - 1;
      const doc = [];
      while (j >= 0 && /^\s*(\*|\/\*\*)/.test(lines[j])) {
        doc.unshift(lines[j]);
        if (/^\s*\/\*\*/.test(lines[j])) break;
        j -= 1;
      }
      const first = doc.join('\n').match(/`?\$([0-9A-Fa-f]{6})`/);
      if (first) claim(parseInt(first[1], 16));
    });
  }
  return ported;
}

test('SECTION 2: exactly ONE export claims $2428A6, and it is the one boss2/boss3/boss4 '
  + 'already called', () => {
  const claims = [...(portedIndex().get(0x2428a6) ?? [])].sort();
  assert.equal(claims.length, 1,
    'W447 exists because there were TWO, and they disagreed on which byte $2428B0 tests. If '
    + 'this is 2 again, MERGE -- do not sync: ' + claims.join(' / '));
  assert.match(claims[0], /^boss\.js:\d+ livePlayers2428A6$/,
    'the survivor is boss.js livePlayers2428A6: it has the byte the image has (SECTION 1) and '
    + 'seven production call sites in boss.js/boss2.js/boss3.js/boss4.js against the deleted '
    + 'copy\'s four. hibachi2.js already imported from boss.js, so no edge inverted: ' + claims[0]);
});

test('SECTION 2b: exactly ONE export claims $242B3C, and it is in rng.js with the family', () => {
  const claims = [...(portedIndex().get(0x242b3c) ?? [])].sort();
  assert.equal(claims.length, 1,
    'items.js and rng.js each carried a byte-identical `drawByte242B3C`. One body now: '
    + claims.join(' / '));
  assert.match(claims[0], /^rng\.js:\d+ drawByte242B3C$/,
    'the survivor is rng.js: the `$803916` family lives there, `bossf23.js` and `bossphase.js` '
    + 'already imported `./rng.js` on the line above the one that reached into items.js, and '
    + 'items.js itself is a CONSUMER of the draw (two sites). Merging the other way would have '
    + 'made rng.js depend on items.js: ' + claims[0]);
});

// ======================================================= SECTION 3: THE STATE TRACE

/** Hibachi's second form, phase B, one damage frame. The record layout is W403's bench. */
function phaseBFrame({ hyper }) {
  const ram = new Ram();
  const log = new UnportedLog();
  const cues = [];
  const ctx = {
    rom: ROM,
    unportedLog: log,
    unported: log,
    soundPost: (a) => { cues.push(a); return true; },
    hyperEvent: () => {},
  };
  const REC = 0x810c00;                 // A5, the boss slot
  const SUB = 0x814800;                 // A6, the boss sub-record
  ram.setU32(REC + 0x06, SUB);

  // P1 IS ALIVE. `$2428A8 tst.w / bpl` needs bit 15, and nothing here touches bit 8.
  ram.setU16(P1REC, 0x8000);
  ram.setU16(P2REC, 0x0000);            // P2 absent, exactly as 644/644 board dumps hold it

  if (hyper) {
    // **THE BIT IS SET BY hyper.js, NOT BY THIS FILE.** The `bset #$0,($1,A6)` lives inside
    // `requestHyper249868`, which is what Button 2 runs when the player has stock. Typing
    // `setU8(0x8103e7, 1)` here would prove nothing about the game.
    ram.setU32(P1REC + P.posY, 0x20001800);
    ram.setU16(HYPER.p1.stock, 1);
    ram.setU16(HYPER.p1.power, 1);
    assert.equal(requestHyper249868(ram, ROM, ctx, RAM.player1, false), true,
      'the hyper request must actually fire, or the bit under test was never written');
  }

  // Phase B's arm: selector != 1, one part, no invulnerability, a full $7FFF of damage into a
  // pool small enough to go negative in one hit.
  ram.setU8(SUB + HIBACHI2.selector, 2);        // $2A6F12 cmpi.b #$1 / bne.w $2A70B4
  ram.setU8(SUB + 0x180, 0xa4);                 // $2A70B4 -- bit $04 is inside the $5C mask
  ram.setU16(SUB + 0x198, 0);                   // $2A7142 -- so $7FFF - 0 = the whole word
  ram.setU16(SUB + 0x108, 0);                   // $2A7152 -- NOT invulnerable
  ram.setU16(SUB + 0x13a, 0);                   // $2A7120
  ram.setU32(REC + 0x16, 0x0100);               // $2A7158 -- one hit takes this negative
  ram.setU16(REC + 0x1a, 0x6270);

  hibachiSecondForm2A6F12(ram, ROM, ctx, REC, SUB);
  return { ram, ctx, REC, SUB, cues };
}

test('SECTION 3: a player IN HYPER still counts, so Hibachi form 2 phase B DIES',
  { skip: SKIP }, () => {
    const f = phaseBFrame({ hyper: true });
    const { ram, REC, SUB } = f;

    // The premise, measured rather than assumed: the record is negative AND its LOW byte's
    // bit 0 is set, which is the exact state the two copies answered differently for.
    assert.equal(ram.u16(P1REC) & 0x8000, 0x8000, '$2428A8 tst.w -- P1 is still NEGATIVE');
    assert.equal(ram.u8(P1REC) & 0x01, 0,
      'the byte $2428B0 actually tests -- $8103E6 -- has bit 0 CLEAR, so the ROM counts P1');
    assert.equal(ram.u8(P1REC + 1) & 0x01, 1,
      'and the byte the DELETED copy tested -- $8103E7 -- has bit 0 SET, written by '
      + 'hyper.js requestHyper249868 and by nothing in this file');
    assert.equal(livePlayers2428A6(ram), 0x10, '$2428BA moveq #$10 -- P1 alone, so $10');

    // ---- THE ARM TAKEN, in three witnesses none of which is in boss.js or hibachi2.js.
    assert.equal(ram.u32(MEDALACC), HIBACHI2.phaseBBombFlash,
      '$2A7172 move.l #$100000,$81B61A -- hud.js\'s word, and phase B\'s ENTIRE kill ledger. '
      + 'Before the merge this frame took $2A7168 instead and never wrote it');
    assert.equal(ram.u16(A4SLOT0), 0x8000 | HIBACHI2.phaseBNext,
      '$2A728A/$2A728C jmp $25980C with D0 = 5 -- scheduler.js\'s A4 slot table now carries '
      + 'the ending script. On the refill arm nothing starts and this stays 0');
    assert.equal(ram.u8(HANDSHAKE) & 0xc0, 0xc0,
      '$2A722E/$2A7236 bset #6 and #7 of $8130F8 -- the stage-end handshake byte, and the '
      + 'death block\'s first two instructions');

    // ...and the pool itself, so "died" is not only bookkeeping.
    assert.equal(ram.u32(REC + 0x16) >>> 0, 0xffffffff,
      '$2A7268 -- the death block floors the HP pool. $200 here would be the REFILL arm');
    assert.equal(ram.u8(SUB + 0x15f), 1, '$2A7270 -- phase B\'s own dead flag, not phase A\'s $15E');
  });

test('SECTION 3b: the DELETED transcription disagrees on this exact RAM -- so the merge is a '
  + 'behaviour change and not a rename', { skip: SKIP }, () => {
  const { ram } = phaseBFrame({ hyper: true });

  /** `bossDecide2428A6` exactly as boss.js carried it until this wave. NOT a port -- a RECORD
   *  of the defect, kept here so the disagreement is asserted rather than argued. */
  const deleted = (r) => {
    let d0 = 0;
    if ((r.u16(P1REC) & 0x8000) !== 0 && (r.u8(P1REC + 1) & 0x01) === 0) d0 = 0x10;
    if ((r.u16(P2REC) & 0x8000) !== 0 && (r.u8(P2REC + 1) & 0x01) === 0) d0 += 8;
    return d0;
  };

  assert.equal(deleted(ram), 0,
    'the deleted copy saw NO live player on this RAM -- which is the arm that refills the pool');
  assert.equal(livePlayers2428A6(ram), 0x10, 'and the survivor sees P1');
  assert.notEqual(deleted(ram), livePlayers2428A6(ram),
    'IF THIS GOES GREEN-BY-AGREEMENT the wrong byte has been re-landed under the surviving '
    + 'name. The two copies MUST differ here; that difference is the whole wave');
});

// ======================================================= SECTION 4: THE CONTROL
//
// SECTION 3 would pass on a `livePlayers2428A6` that ignored the player records and returned a
// constant $10. These two frames make that impossible: one flips only the hyper bit and must
// reach the SAME arm (both bytes agree when no bit is set), and one flips only the sign and
// must reach the OTHER arm.

test('SECTION 4: no hyper -- the same frame still dies, so the merge did not simply invert a '
  + 'test', { skip: SKIP }, () => {
    const { ram, REC } = phaseBFrame({ hyper: false });
    assert.equal(ram.u8(P1REC + 1) & 0x01, 0, 'the low byte is CLEAR on this frame');
    assert.equal(livePlayers2428A6(ram), 0x10, 'both bytes agree here: P1 counts');
    assert.equal(ram.u32(MEDALACC), HIBACHI2.phaseBBombFlash, '  ...and the kill ledger is paid');
    assert.equal(ram.u32(REC + 0x16) >>> 0, 0xffffffff, '  ...and the pool is floored');
  });

test('SECTION 4b: with NO live player the same frame REFILLS instead -- the witnesses do move',
  { skip: SKIP }, () => {
    // Hand-built rather than run through `phaseBFrame`, because the point is the other arm.
    const ram = new Ram();
    const log = new UnportedLog();
    const ctx = { rom: ROM, unportedLog: log, unported: log, soundPost: () => true };
    const REC = 0x810c00;
    const SUB = 0x814800;
    ram.setU32(REC + 0x06, SUB);
    ram.setU16(P1REC, 0x0100);            // POSITIVE: `$2428AE bpl` skips P1 outright
    ram.setU16(P2REC, 0x0000);
    ram.setU8(SUB + HIBACHI2.selector, 2);
    ram.setU8(SUB + 0x180, 0xa4);
    ram.setU16(SUB + 0x198, 0);
    ram.setU16(SUB + 0x108, 0);
    ram.setU16(SUB + 0x13a, 0);
    ram.setU32(REC + 0x16, 0x0100);
    ram.setU16(REC + 0x1a, 0x6270);

    assert.equal(livePlayers2428A6(ram), 0, 'nobody is playable');
    hibachiSecondForm2A6F12(ram, ROM, ctx, REC, SUB);

    assert.equal(ram.u32(REC + 0x16), 0x200, '$2A7168 move.l #$200,($16,A5) -- the REFILL');
    assert.equal(ram.u32(MEDALACC), 0, 'no kill ledger: $2A7172 was not reached');
    assert.equal(ram.u8(HANDSHAKE) & 0xc0, 0, 'and $8130F8 was never bset -- no death block');

    // The A4 slot moves on BOTH arms and it does NOT move to the same place, which is a
    // sharper witness than "unchanged": the refill falls into `$2A7180`'s phase check, whose
    // `$2A71EC` starts script $13, while the death block's `$2A728C` starts script 5.
    assert.equal(ram.u16(A4SLOT0), 0x8000 | HIBACHI2.phaseBPhaseA4,
      '$2A71EC/$2A71EE -- the REFILL arm falls through to phase B\'s own $23000 check (the '
      + 'refilled $200 is below it) and starts A4 script $13');
    assert.notEqual(ram.u16(A4SLOT0), 0x8000 | HIBACHI2.phaseBNext,
      'and it is NOT the ending script SECTION 3 measured. The same cell, two different '
      + 'values, one per arm -- so neither section can pass on a witness that never moves');
  });

// ======================================================= SECTION 5: THE $242B3C MERGE
//
// The two bodies were identical, so no state trace can show a behaviour CHANGE -- what has to
// be shown instead is that the surviving body is still the routine, computed from ROM, and
// that it still advances the one shared counter once per call. A merge that quietly dropped
// the `addq.b` would leave every draw in the game returning the same byte for ever.

test('SECTION 5: $242B3C replays 512 draws against a from-ROM recomputation, counter and all',
  { skip: SKIP }, () => {
    assert.equal(RNG_242B3C.table, 0x242bac, '$242B48 lea ($242BAC,PC),A0');
    assert.equal(RNG_242B3C.entries, 256, '$242BAC..$242CAB, pinned by $242CAC');

    const ram = new Ram();
    ram.setU16(RNG.state, 0);
    const got = [];
    for (let n = 0; n < 512; n++) got.push(drawByte242B3C(ram, ROM));

    // The recomputation: `$242B3C addq.b #1,$803917` walks the LOW byte of $803916 through
    // 0..255 and wraps; `$242B42 move.w $803916,D0` then indexes with the WHOLE word, which is
    // 0..255 because `$23BE36 clr.w $803916` zeroed the high half and `addq.b` never carries.
    // So draw n is table[(n + 1) & $FF].
    const want = [];
    for (let n = 0; n < 512; n++) want.push(ROM.u8(0x242bac + ((n + 1) & 0xff)));
    assert.deepEqual(got, want,
      'the surviving body must still be $242B3C: bump the shared counter, then read '
      + '$242BAC[state]. A constant, a mask, or a missing bump all redden here');

    assert.equal(ram.u16(RNG.state), 0,
      '512 draws is exactly two wraps of the low byte, so the state word comes back to 0 -- '
      + 'which is only true if the counter advanced EXACTLY once per call');
    assert.notEqual(want[0], want[2],
      'POSITIVE CONTROL: the table is not flat, so the comparison above can fail');
  });

test('SECTION 5b: items.js no longer exports a second body, and the stream does not depend on '
  + 'which module a caller imported from', { skip: SKIP }, async () => {
  const items = await import('../src/items.js');
  assert.equal(items.drawByte242B3C, undefined,
    'items.js must not re-export the draw. It CONSUMES it (two sites) and importing it back '
    + 'out of items.js is how bossf23.js and bossphase.js came to reference the duplicate');
  assert.equal(items.RNG_242B3C, undefined,
    'and the duplicate table descriptor is gone with it -- rng.js\'s is the same $242BAC/256');

  const a = new Ram(); a.setU16(RNG.state, 0);
  const b = new Ram(); b.setU16(RNG.state, 0);
  const seq = [];
  for (let n = 0; n < 64; n++) seq.push(drawByte242B3C(a, ROM));
  for (let n = 0; n < 64; n++) {
    assert.equal(drawByte242B3C(b, ROM), seq[n], `draw ${n} must be the same body`);
  }
});

// ======================================================= SECTION 6: THE REGISTER
//
// `w446mergedbonusline1.test.js` SECTION 2b holds the exact set of doubly-claimed addresses.
// This wave removed TWO rows by merging them, so the register is 22. The arithmetic:
//
//     W446 left            24
//     $2428A6 merged       -1     (bossDecide2428A6 deleted; the wrong byte went with it)
//     $242B3C merged       -1     (items.js's byte-identical clone deleted)
//     ------------------------
//     W447 leaves          22
//     $246520 merged       -1     (W448: spawn.js buildParts246520 deleted)
//     $24652A merged       -1     (W448: stageend.js chainLoader24652A + chainLoaderBody deleted)
//     ------------------------
//     W448 leaves          20
//
// The other twenty-two were READ this wave and are in the docket with a classification each.
// Seventeen of them are the doc-opening convention or a wrapper/entry pair and cannot drift
// (one body, two faces). THREE were real second transcriptions, and each received its own wave:
// `$25D9E6` merged in W457, `$25DA60` merged in W458, and `$25FF38` merged in W459. Two more rows --
// `$246520` and `$24652A` -- are the visible edge of the biggest one: `animobjects.js`, `spawn.js` and `stageend.js` each carry
// an INDEPENDENT transcription of the `$246520`/`$24652A`/`$246710` constructor, all three
// allocating out of the same `$810346` (3 x $30) and `$80FA86` (20 x $70) pools.
//
// The count is asserted here as well as there so that deleting the register does not silently
// delete the debt.

test('SECTION 6: the doubly-claimed register is 16, and all later proved merges are ABSENT '
  + 'from it', () => {
  const dup = [...portedIndex()].filter(([, v]) => v.size > 1).map(([a]) => a).sort((x, y) => x - y);
  assert.equal(dup.length, 16,
    'W458 left the export-only floor at 17; W459 merged the complete $25FF38 request poster, '
    + 'so the live floor is 16. A different number means either a merge was undone or a new '
    + 'duplicate landed, and a new one is a wave, not a row: '
    + dup.map((a) => '$' + a.toString(16).toUpperCase()).join(', '));
  assert.equal(dup.includes(0x2428a6), false, '$2428A6 is merged');
  assert.equal(dup.includes(0x242b3c), false, '$242B3C is merged');
  assert.equal(dup.includes(0x246520), false, '$246520 is merged -- W448');
  assert.equal(dup.includes(0x24652a), false, '$24652A is merged -- W448');
  assert.equal(dup.includes(0x25ffa8), false, '$25FFA8 stayed merged -- W446\'s row, still gone');
  assert.equal(dup.includes(0x25d9e6), false, '$25D9E6 is merged -- W457');
  assert.equal(dup.includes(0x25da60), false, '$25DA60 is merged -- W458');
  assert.equal(dup.includes(0x25ff38), false,
    '$25FF38 is merged -- W459 corrected D0.W ownership and preserved the tally alias');
});

// W450: THE 19 ABOVE COUNTS ONLY WHAT AN `export function` DECLARES.
// W449's fourth copy of `$246800` was the module-private `clearChain`, invisible
// to `portedIndex()` on every axis it has. The widened scan is 84 (92 at W450,
// minus $242684 at W451, $242494 at W453, $25D9E6 at W457, $25DA60 at W458,
// $25FF38 at W459, the optional $24631C shim at W460, the private $242E24
// rank-byte body at W461, the private $2414BE adapter row at W462, and the
// private $28C0FC counted-note adapter row at W463). See
// tests/w450widenedregister.test.js; the number is cross-checked in all four
// register holders so none of them can be read as the whole count.
test('SECTION 6b [W450/W469]: the widened register is 76, and this wave\'s two merges hold under it too',
  async () => {
    const { headRegister } = await import('./w450widenedscan.js');
    const wide = headRegister();
    assert.equal(wide.length, 76,
      'the widened duplicate register is not 76. ' + W453_NOTE
      + 'W457 merged $25D9E6; W458 merged $25DA60; W459 merged $25FF38; '
      + 'W460 removed the optional $24631C forwarding shim; W461 merged the private '
      + '$242E24 rank-byte body into rng.js drawByte242E24; W462 removed both private '
      + '$2414BE installTxBank heads; W463 removed both private $28C0FC counted-note heads; '
      + 'w450widenedregister.test.js SECTION 3 owns the set');
    // The two W447 merged must stay merged under a scan that can ALSO see a
    // private re-transcription, which is the only way to know they really went.
    assert.equal(wide.includes(0x2428a6), false,
      '$2428A6 is claimed twice again under the widened scan. W447 merged it because one copy '
      + 'read $8103E7 where the ROM btsts the byte at $8103E6, and Hibachi refilled its HP');
    assert.equal(wide.includes(0x242b3c), false, '$242B3C is claimed twice again under the widened scan');
  });
