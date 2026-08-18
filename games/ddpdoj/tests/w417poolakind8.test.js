// W417 -- THE FRAME-6480 THROW. Pool-A kinds 8..15 (the hyper-bank cancel stars,
// dispatch entries $280252 $28036A $280486 $2805A2 $2806BE $2807D6 $2808F2 $280A0E),
// kind index 3 ($27FED2), and the fill hook the eight actually run.
//
// WHAT THIS FILE IS FOR. `$280252` was the first unported path a full boot reached, so
// NO bench in this repo could get past frame 6480 and stage 2 was unreachable. Every
// assertion here reads a RECORD or a ROM BYTE back rather than counting a call, because
// W411/W416 both found tests that passed under two readings at once.
//
// THE ONE THING TO NOT REPEAT: `sharedSpeedBody` has been a field on the finish-hook
// spec since W312 and NOTHING READ IT. Hooks 8..15 were given the shared speed/angle
// body they do not have, which made three RNG draws per allocation that the cartridge
// does not make. Section 4 pins the arm byte for byte and counts the draws.
//
// THE ABLATION AUDIT. 44 mutations of `src/bee.js`, 44 red on the second pass. Three
// were GREEN on the first and each was a value a test WROTE and never read back:
//   * the collect score -- the arm's `moveq #$50`/`move.l #imm,D0` was asserted from
//     the IMAGE and never out of the pending accumulator. Now read from $81B4C0.
//   * `$280D9C clr.b ($1E,A0)` -- W416's exact trap. A fresh `Ram()` leaves +$1E at 0,
//     so the assertion passed with or without the clear. The test now DIRTIES the slot
//     first, which is what a recycled pool slot really carries.
//   * `$280DB2 add.l D0,($A,A0)` -- "the sprite is inside the ring" is true of the bare
//     base too, because entry 0 of every hook block is $0000. The test now predicts the
//     draw and only uses the seeds whose hook word is NON-ZERO.
//
// TWO MUTATIONS ARE PROVABLY UNTESTABLE AND ARE NAMED RATHER THAN FAKED:
//   * `and.b` -> `and.w` on `$2802BE`. ($1A,A6) is `D7 & $F`, four bits, so the two
//     agree for every possible value of $803912. The SIZE is asserted from the
//     encoding; no behaviour can separate them.
//   * dropping `$2802E6 beq $2802FA`. The skipped instructions re-store the SAME
//     heading and recompute the SAME `$241D34` pair, so running them changes nothing
//     a record can show. It is transcribed because the cartridge has it.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { AimTables, aim256 } from '../src/aim.js';
import { drawWord242EC2 } from '../src/rng.js';
import { allocPoolA27F8F0, runPoolADriver, POOL_A, DISPATCH } from '../src/bee.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const MT = HAVE ? new MoveTables(json, ROM) : null;
const AIMS = HAVE ? new AimTables(ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';
const u16img = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32img = (a) => (u16img(a) * 0x10000) + u16img(a + 2);
const bytes = (a, n) => IMG.slice(a, a + n).toString('hex');

const CARRIER = 0x814600;
const P1REC = 0x8103e6, P2REC = 0x810448;
const STARP1 = 0x817f86, STARP2 = 0x817f8a;
const MEDALP1 = 0x817f84;
const RNGCTR = 0x803917;
const RNGSTATE = 0x803916;
// $286328/$2864D8's accumulators -- where `scoreByMask` puts a collect's value.
const P1PEND = 0x81b4c0, P2PEND = 0x81b4c4;

/** The eight sites and their constants, in the order kind index 8..15 dispatches. */
const EIGHT = [
  { k: 8, site: 0x280252, bit: 12, ctr: STARP1, add: 1, sel: 0x00050000, score: 0x50,
    step: 0x24, wrap: 0x1bcd0c, base: 0x1bcacc, tpl: 0x280e9a, owner: P1REC },
  { k: 9, site: 0x28036a, bit: 12, ctr: STARP1, add: 2, sel: 0x00010004, score: 0x100,
    step: 0x34, wrap: 0x1bd04c, base: 0x1bcd0c, tpl: 0x280ef2, owner: P1REC },
  { k: 10, site: 0x280486, bit: 12, ctr: STARP1, add: 4, sel: 0x00050004, score: 0x500,
    step: 0x64, wrap: 0x1bd68c, base: 0x1bd04c, tpl: 0x280f08, owner: P1REC },
  { k: 11, site: 0x2805a2, bit: 12, ctr: STARP1, add: 8, sel: 0x00010008, score: 0x1000,
    step: 0xc4, wrap: 0x1be2cc, base: 0x1bd68c, tpl: 0x280f1e, owner: P1REC },
  { k: 12, site: 0x2806be, bit: 11, ctr: STARP2, add: 1, sel: 0x00050000, score: 0x50,
    step: 0x24, wrap: 0x1bcd0c, base: 0x1bcacc, tpl: 0x280e9a, owner: P2REC },
  { k: 13, site: 0x2807d6, bit: 11, ctr: STARP2, add: 2, sel: 0x00010004, score: 0x100,
    step: 0x34, wrap: 0x1bd04c, base: 0x1bcd0c, tpl: 0x280ef2, owner: P2REC },
  { k: 14, site: 0x2808f2, bit: 11, ctr: STARP2, add: 4, sel: 0x00050004, score: 0x500,
    step: 0x64, wrap: 0x1bd68c, base: 0x1bd04c, tpl: 0x280f08, owner: P2REC },
  { k: 15, site: 0x280a0e, bit: 11, ctr: STARP2, add: 8, sel: 0x00010008, score: 0x1000,
    step: 0xc4, wrap: 0x1be2cc, base: 0x1bd68c, tpl: 0x280f1e, owner: P2REC },
];

function world() {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(CARRIER + 0x02, 0x30001c00);            // long axis $3000, short $1C00
  // The owner's alive bit: `$2802C8 tst.w (A0) / bmi` -- bit 15 of word 0.
  ram.setU16(P1REC, 0x8000);
  ram.setU16(P2REC, 0x8000);
  ram.setU16(P1REC + 0x02, 0x1000);                  // the ship, well away from $3000
  ram.setU16(P1REC + 0x04, 0x0c00);
  ram.setU16(P2REC + 0x02, 0x1000);
  ram.setU16(P2REC + 0x04, 0x0c00);
  const sounds = [];
  const ctx = { ram, rom: ROM, tables: MT, unported: log, unportedLog: log,
    notes: log, soundPost: (a) => sounds.push(a) };
  return { ram, log, ctx, sounds };
}
const alloc = (f, kind, layer = 0) => {
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, kind, 0, layer, CARRIER);
  assert.ok(slot !== null, 'the allocator delivered a slot');
  return slot;
};
const drive = (f) => runPoolADriver(f.ram, ROM, f.ctx);

// ============ 1. THE DISPATCH, AND THAT THE EIGHT ARE ONE ROUTINE ============

test('W417 $27F99E indices 3 and 8..15 are the addresses this wave ports',
  { skip: SKIP_IMG }, () => {
  assert.equal(u32img(0x27f99e + 3 * 4), 0x0027fed2);
  assert.equal(DISPATCH[3], 0x27fed2);
  for (const e of EIGHT) {
    assert.equal(u32img(0x27f99e + e.k * 4), e.site, `index ${e.k}`);
    assert.equal(DISPATCH[e.k], e.site);
  }
  // ...and the eight are eight DISTINCT addresses, which is what makes the
  // "one routine, eight constant sets" claim below a measurement and not a guess.
  assert.equal(new Set(EIGHT.map((e) => e.site)).size, 8);
});

test('W417 kinds 8 and 12 differ in exactly TWO bytes, and 9/13, 10/14, 11/15 too',
  { skip: SKIP_IMG }, () => {
  // [M] the P1/P2 pairs: the `btst` bit operand and one byte of the counter address.
  for (const [a, b] of [[0, 4], [1, 5], [2, 6], [3, 7]]) {
    const A = EIGHT[a].site, B = EIGHT[b].site;
    const n = Math.min(EIGHT[a].k === 8 ? 0x118 : 0x11c,
      EIGHT[b].k === 12 ? 0x118 : 0x11c);
    const diff = [];
    for (let i = 0; i < n; i++) if (IMG[A + i] !== IMG[B + i]) diff.push(i);
    assert.deepEqual(diff, [0x03, 0x0d],
      `kind ${EIGHT[a].k} against kind ${EIGHT[b].k}`);
    assert.equal(IMG[A + 3], 0x0c, 'P1 tests bit 12');
    assert.equal(IMG[B + 3], 0x0b, 'P2 tests bit 11');
    assert.equal(u32img(A + 0x0a), EIGHT[a].ctr);
    assert.equal(u32img(B + 0x0a), EIGHT[b].ctr);
  }
});

test('W417 kind 8 tail and kind 9 tail are the same 244 bytes but three constants',
  { skip: SKIP_IMG }, () => {
  // `moveq #$50,D0` is FOUR bytes shorter than `move.l #$100,D0`, which is why kind 8
  // is $118 long and kind 9 is $11C.  Line the tails up past that one instruction and
  // [M] only the animation stride, the wrap and the base differ.
  const A = 0x280252 + 36, B = 0x28036a + 40, N = 0x118 - 36;
  const diff = [];
  for (let i = 0; i < N; i++) if (IMG[A + i] !== IMG[B + i]) diff.push(i + 36);
  assert.deepEqual(diff, [0xcb, 0xd0, 0xd1, 0xd8, 0xd9]);
  assert.equal(IMG[0x280252 + 0x22], 0x70, 'kind 8: moveq');
  assert.equal(IMG[0x280252 + 0x23], 0x50, '...of $50');
  assert.equal(u16img(0x28036a + 0x22), 0x203c, 'kind 9: move.l #imm,D0');
  assert.equal(u32img(0x28036a + 0x24), 0x00000100, '...of $100');
});

test('W417 each site carries its own seven constants, read from the image',
  { skip: SKIP_IMG }, () => {
  for (const e of EIGHT) {
    const off = e.k === 8 || e.k === 12 ? 0 : 4;    // the moveq/move.l shift
    assert.equal(IMG[e.site + 0x06], 0x70, `${e.k}: moveq for the counter add`);
    assert.equal(IMG[e.site + 0x07], e.add, `${e.k}: add`);
    assert.equal(u32img(e.site + 0x0a), e.ctr, `${e.k}: counter`);
    assert.equal(u16img(e.site + 0x1a), 0x2d7c, `${e.k}: move.l #imm,(d16,A6)`);
    assert.equal(u32img(e.site + 0x1c), e.sel, `${e.k}: selector`);
    assert.equal(u16img(e.site + 0x20), 0x0010, `${e.k}: ...into ($10,A6)`);
    // the score: `moveq #$50` for 8/12, `move.l #imm,D0` for the other six
    if (off === 0) assert.equal(IMG[e.site + 0x23], e.score, `${e.k}: score`);
    else assert.equal(u32img(e.site + 0x24), e.score, `${e.k}: score`);
    // and the sound is $28C5E4 for ALL EIGHT -- the star's, not the medal's $28C610
    assert.equal(u16img(e.site + 0x2c + off), 0x4eb9, `${e.k}: jsr`);
    assert.equal(u32img(e.site + 0x2e + off), 0x0028c5e4, `${e.k}: sound`);
    // the animation ring, at the fixed tail offsets
    assert.equal(u16img(e.site + 0xc6 + off), 0x0690, `${e.k}: addi.l #imm,(A0)`);
    assert.equal(u32img(e.site + 0xc8 + off), e.step, `${e.k}: stride`);
    assert.equal(u16img(e.site + 0xcc + off), 0x0c90, `${e.k}: cmpi.l #imm,(A0)`);
    assert.equal(u32img(e.site + 0xce + off), e.wrap, `${e.k}: wrap`);
    assert.equal(u16img(e.site + 0xd4 + off), 0x20bc, `${e.k}: move.l #imm,(A0)`);
    assert.equal(u32img(e.site + 0xd6 + off), e.base, `${e.k}: base`);
  }
});

test('W417 NONE of the eight branches to $280FDC, so the selector is DEAD',
  { skip: SKIP_IMG }, () => {
  // The four collect arms that DO reach the collected transform end `bra.w $280FDC`
  // ($27FA2E, $27FE5C, and the two stage-4 ones).  [M] the byte pair `60 00` does not
  // appear at all in any of the eight, and the free shape `7000 3C80 3D40 0002` does.
  for (const e of EIGHT) {
    const len = e.k === 8 || e.k === 12 ? 0x118 : 0x11c;
    const hex = bytes(e.site, len);
    assert.ok(hex.includes('70003c803d4000025379'), `kind ${e.k} frees the record`);
    for (let i = 0; i < len - 1; i += 1) {
      assert.ok(!(IMG[e.site + i] === 0x60 && IMG[e.site + i + 1] === 0x00
        && (u16img(e.site + i + 2) + e.site + i + 2) === 0x280fdc),
      `kind ${e.k} has no bra.w $280FDC`);
    }
  }
  // ...which is why W414's missing selector art ($00010004 -> $1E24DC) is not needed
  // by kinds 9 and 13 even though they WRITE that selector into ($10,A6).
  assert.equal(u32img(0x28036a + 0x1c), 0x00010004);
});

// ================ 2. THE EXTENT, BOUNDED THREE WAYS ==========================

test('W417 kind 8 is $118 bytes and the length is the CARTRIDGE\'s, not entry-to-entry',
  { skip: SKIP_IMG }, () => {
  // Entry-to-entry has overshot five waves running, so it is used as an upper bound
  // and then closed from inside.  THREE positive witnesses:
  //  1. $280360 is the last INSTRUCTION, `jmp $23EBA0`, six bytes ending $280365.
  assert.equal(u16img(0x280360), 0x4ef9);
  assert.equal(u32img(0x280362), 0x0023eba0);
  //  2. $280366 is `4E71` NOP alignment and $280368 is `4E75` RTS -- and the rts is
  //     the target of $28035C's `beq.w`, so it is REACHED and not filler.
  assert.equal(u16img(0x280366), 0x4e71);
  assert.equal(u16img(0x280368), 0x4e75);
  assert.equal(u16img(0x28035c), 0x6700);
  assert.equal(0x28035e + u16img(0x28035e), 0x280368);
  //  3. $28036A is kind 9's own first instruction and the dispatch says so.
  assert.equal(u16img(0x28036a), 0x0801);
  assert.equal(u32img(0x27f99e + 9 * 4), 0x28036a);
  // and the arithmetic closes: $280252 + $118 = $28036A.
  assert.equal(0x280252 + 0x118, 0x28036a);
});

test('W417 every branch inside kind 8 lands inside kind 8', { skip: SKIP_IMG }, () => {
  // A branch out of the range would mean the extent is wrong.  The seven forks,
  // each target computed from the bytes rather than copied from the port.
  const short = (at) => at + 2 + ((IMG[at + 1] << 24) >> 24);
  const long = (at) => at + 2 + ((u16img(at + 2) << 16) >> 16);
  assert.equal(short(0x280256), 0x280294, '$280256 beq -> the ordinary step');
  assert.equal(short(0x280266), 0x28026c, '$280266 bcs -> past the clamp');
  assert.equal(short(0x280298), 0x2802b8, '$280298 bne -> past the one-shot init');
  assert.equal(short(0x2802c2), 0x2802fa, '$2802C2 bne -> paused, coast');
  assert.equal(short(0x2802ca), 0x2802dc, '$2802CA bmi -> the owner is alive');
  assert.equal(short(0x2802e6), 0x2802fa, '$2802E6 beq -> heading unchanged');
  assert.equal(short(0x28030c), 0x28032c, '$28030C bcc -> no animation step');
  assert.equal(short(0x280324), 0x28032c, '$280324 bne -> no wrap');
  assert.equal(long(0x280334), 0x280360, '$280334 bcs -> always draw, quiet pool');
  assert.equal(short(0x280346), 0x28034a, '$280346 bpl -> already positive');
  assert.equal(long(0x28034e), 0x280360, '$28034E bcs -> always draw, near the owner');
  assert.equal(long(0x28035c), 0x280368, '$28035C beq -> thinned out');
  for (const t of [0x280294, 0x28026c, 0x2802b8, 0x2802fa, 0x2802dc, 0x28032c,
    0x280360, 0x28034a, 0x280368]) {
    assert.ok(t >= 0x280252 && t < 0x28036a, `$${t.toString(16)} is inside kind 8`);
  }
});

// ============ 3. WHAT THE BODY ACTUALLY IS: $242296 AND ($24,A6) =============

test('W417 $242296 is $242290 PAST its target select, so A0 is the CALLER\'s',
  { skip: SKIP_IMG }, () => {
  // `$242290 bsr $24270A / bcs` is the target SELECT; `$242296` is the instruction
  // after the `bcs`, so a `jsr $242296` supplies A0 itself and never picks a player.
  assert.equal(u16img(0x242290), 0x6100, 'bsr.w');
  assert.equal(0x242292 + u16img(0x242292), 0x24270a);
  assert.equal(IMG[0x242294], 0x65, 'bcs -- both players dead');
  assert.equal(u16img(0x242296), 0x4ca8, 'movem.w (d16,A0),<list>');
  assert.equal(u16img(0x242298), 0x000c, '...D2/D3');
  assert.equal(u16img(0x24229a), 0x0002, '...from ($2,A0)');
  assert.equal(u16img(0x24229c), 0x4cae, 'movem.w (d16,A6),<list>');
  assert.equal(u16img(0x24229e), 0x0003, '...D0/D1');
});

test('W417 the FIRST $242296 reads the dispatch pointer itself, and that is the ROM',
  { skip: SKIP_IMG }, () => {
  // `$27F988 lea ($27F99E,PC),A0` -> `adda.w D0,A0` -> `movea.l (A0),A0` -> `jsr (A0)`
  // leaves A0 = the BODY ADDRESS, and $28029A calls $242296 before anything reloads it.
  assert.equal(u16img(0x27f988), 0x41fa, 'lea (d16,PC),A0');
  assert.equal(0x27f98a + u16img(0x27f98a), 0x27f99e);
  assert.equal(u16img(0x27f98e), 0xd0c0, 'adda.w D0,A0');
  assert.equal(u16img(0x27f990), 0x2050, 'movea.l (A0),A0');
  assert.equal(u16img(0x27f992), 0x4e90, 'jsr (A0)');
  // so the "target" is the body's own +$2/+$4 -- its btst operand and its beq.
  for (const e of EIGHT) {
    assert.equal(u16img(e.site + 2), e.bit === 12 ? 0x000c : 0x000b);
    assert.equal(u16img(e.site + 4), e.k === 8 || e.k === 12 ? 0x673c : 0x6740);
  }
});

// ============ 4. THE FILL HOOK: $280D94 IS THE WHOLE ARM =====================

test('W417 hooks 8..15 are $280D8C/$280D94 and contain NO shared speed body',
  { skip: SKIP_IMG }, () => {
  // W287 read the heads and stopped; this reads to the `rts`.  [M] the whole arm:
  assert.equal(bytes(0x280d8c, 8), '217c008103e60024');   // move.l #$8103E6,($24,A0)
  assert.equal(bytes(0x280d42, 8), '217c008104480024');   // ...and P2's, at $280D42
  assert.equal(bytes(0x280d94, 0x26),
    '0247000f1147001a4228001e2e004eb900242ec202800000000e30330000d1a8000a20074e75');
  // $280DB8 is `4E75` -- the arm ENDS there, which is what W287 never checked.
  assert.equal(u16img(0x280db8), 0x4e75);
  // and NONE of the shared speed body's calls appears anywhere in $280D3E..$280DB9.
  const arm = bytes(0x280d3e, 0x280dba - 0x280d3e);
  for (const [what, hex] of [['$2431F4', '002431f4'], ['$242FDE', '00242fde'],
    ['$241812', '00241812'], ['$280C84', '00280c84']]) {
    assert.ok(!arm.includes(hex), `the arm never calls ${what}`);
  }
  // ...nor the `move.w #$420,($1A,A0)` every shared-body hook opens with.
  assert.ok(!arm.includes('317c0420001a'));
  // The one draw it DOES make is $242EC2, exactly once (both entries share it).
  assert.equal((arm.match(/00242ec2/g) ?? []).length, 1);
});

test('W417 an allocated kind-8 record carries $280E9A and the hook\'s four writes',
  { skip: SKIP }, () => {
  const f = world();
  const slot = alloc(f, 0x20, 2);
  assert.equal(f.ram.u16(slot) & 0x7c, 0x20, 'kind index 8 in bits 6..2');
  assert.ok((f.ram.u16(slot) & 0x8000) !== 0, 'allocated');
  // template $280E9A -- kind 0's OWN template, which is why the art is already shipped
  assert.equal(f.ram.u32(slot + 0x06), 0xfc00fe00, 'the sprite offset pair');
  assert.equal(f.ram.u16(slot + 0x0e), 0x0410, 'the size');
  assert.equal(f.ram.u32(slot + 0x10), 0x05800580);
  assert.equal(f.ram.u32(slot + 0x14), 0x04800480);
  assert.equal(f.ram.u16(slot + 0x1c), 0x001c);
  // the sprite is the ring base PLUS one of the hook block's eight words
  const sprite = f.ram.u32(slot + 0x0a);
  assert.ok(sprite >= 0x1bcacc && sprite < 0x1bcd0c,
    `$${sprite.toString(16)} is inside the $1BCACC ring`);
  assert.equal((sprite - 0x1bcacc) % 0x24, 0, 'and on a frame boundary');
  // $280D8C: the OWNER. $280D94/98: D7 & $F. $280D9C: ($1E,A0) CLEARED.
  assert.equal(f.ram.u32(slot + 0x24), P1REC, 'kinds 8..11 belong to P1');
  assert.equal(f.ram.u8(slot + 0x1a), (POOL_A.generalSlots - 1) & 0x0f,
    'slot 0 is found with D7 = 69, and $45 & $F = 5');
  assert.equal(f.ram.u8(slot + 0x1e), 0, '$280D9C clr.b ($1E,A0)');
});

test('W417 the fill CLEARS ($1E,A0) over a dirty slot, and the one-shot needs it',
  { skip: SKIP }, () => {
  // W416's trap, avoided by construction: a fresh `Ram()` leaves +$1E at 0, so the
  // assertion above passes whether or not the clear exists.  A pool-A slot is
  // recycled, not zeroed -- `$27FC7C` clears only (A6) and ($2,A6) -- so the previous
  // tenant's +$1E is exactly what a real slot carries when the fill reaches it.
  const f = world();
  const slot0 = POOL_A.base;
  f.ram.setU8(slot0 + 0x1e, 0xff);                 // the previous tenant's byte
  f.ram.setU8(slot0 + 0x1b, 0x5a);                 // ...and its heading
  const slot = alloc(f, 0x20, 0);
  assert.equal(slot, slot0, 'the scan reused slot 0');
  assert.equal(f.ram.u8(slot + 0x1e), 0, '$280D9C cleared it');
  // ...and the BEHAVIOUR that depends on it: with +$1E still $FF the body would take
  // `$280298 bne` and never run the one-shot, so the stale heading would survive the
  // frame the record is created on.
  drive(f);
  assert.notEqual(f.ram.u8(slot + 0x1b), 0x5a, 'the one-shot ran and re-aimed');
  assert.equal(f.ram.u8(slot + 0x1e), 1, '...and marked itself spent');
});

/** `$280C4E`, hook block 0 -- [M] the eight words kinds 8 and 12 index. */
const BLOCK_280C4E = [0x000, 0x048, 0x090, 0x0d8, 0x120, 0x168, 0x1b0, 0x1f8];

test('W417 $280DB2 add.l ADDS the hook word to the sprite, and it is not always 0',
  { skip: SKIP }, () => {
  // "the sprite is inside the ring" survives a port that never adds the offset,
  // because entry 0 of every block IS zero.  Predict the draw and read the record.
  let found = 0;
  for (let seed = 0; seed < 256 && found < 3; seed++) {
    const probe = new Ram();
    probe.setU16(RNGSTATE, seed);
    const phase = (drawWord242EC2(probe, ROM) & 0x0e) >> 1;
    if (BLOCK_280C4E[phase] === 0) continue;      // only the NON-zero entries can tell
    const f = world();
    f.ram.setU16(RNGSTATE, seed);
    const slot = alloc(f, 0x20, 0);
    assert.equal(f.ram.u32(slot + 0x0a), 0x1bcacc + BLOCK_280C4E[phase],
      `state $${seed.toString(16)} -> phase ${phase} -> +$${
        BLOCK_280C4E[phase].toString(16)}`);
    assert.notEqual(f.ram.u32(slot + 0x0a), 0x1bcacc, 'and it is NOT the bare base');
    found++;
  }
  assert.equal(found, 3, 'three distinct non-zero phases were reachable and checked');
  // the block itself, out of the cartridge
  for (let i = 0; i < 8; i++) {
    assert.equal(u16img(0x280c4e + i * 2), BLOCK_280C4E[i]);
    assert.equal(BLOCK_280C4E[i] % 0x24, 0, 'every entry is a whole number of frames');
  }
});

test('W417 the hook draws ONCE, not four times', { skip: SKIP }, () => {
  // THE REGRESSION THIS FILE EXISTS TO STOP.  The port used to run the shared speed
  // body for these eight: $242EC2 + $2431F4 + $242FDE + $2431F4 = FOUR bumps of the
  // shared counter $803917 per allocation, on a bullet cancel that allocates ~45
  // records at once.  The cartridge's arm makes ONE.
  const f = world();
  const before = f.ram.u8(RNGCTR);
  alloc(f, 0x20, 0);
  assert.equal((f.ram.u8(RNGCTR) - before) & 0xff, 1);
  // ...and kind 2's jitter hook still makes its own one, and kind $48's still makes
  // four, so the gate is on THIS family and not on the fill as a whole.
  const g = world();
  const b2 = g.ram.u8(RNGCTR);
  alloc(g, 0x08, 0);
  assert.equal((g.ram.u8(RNGCTR) - b2) & 0xff, 1, 'kind 2: $242E24 alone');
  const h = world();
  const b3 = h.ram.u8(RNGCTR);
  alloc(h, 0x48, 0);
  assert.equal((h.ram.u8(RNGCTR) - b3) & 0xff, 4, 'kind 18: the shared speed body');
});

test('W417 kinds 12..15 belong to P2 and 8..11 to P1', { skip: SKIP }, () => {
  for (const e of EIGHT) {
    const f = world();
    const slot = alloc(f, e.k * 4, 0);
    assert.equal(f.ram.u32(slot + 0x24), e.owner, `kind ${e.k}`);
    const sprite = f.ram.u32(slot + 0x0a);
    assert.ok(sprite >= e.base && sprite < e.wrap,
      `kind ${e.k} sprite $${sprite.toString(16)} is in its own ring`);
  }
});

// ============ 5. THE BODY, DRIVEN, WITH THE RECORD READ BACK ================

test('W417 the driver runs a kind-8 record instead of throwing', { skip: SKIP }, () => {
  const f = world();
  const slot = alloc(f, 0x20, 0);
  const t = drive(f);
  assert.equal(t.live, 1);
  assert.equal(t.emitted, 1, '$280360 jmp $23EBA0');
  assert.deepEqual(f.log.report(), [], 'and reached no unported path');
  assert.notEqual(f.ram.u16(slot), 0, 'still live');
  assert.equal(f.ram.u8(slot + 0x1e), 1, '$2802B2 marked the one-shot spent');
});

test('W417 the record HOMES ON ITS OWNER: the heading is aim256 at the player',
  { skip: SKIP }, () => {
  const f = world();
  const slot = alloc(f, 0x20, 0);
  const selfY = f.ram.u16(slot + 0x02), selfX = f.ram.u16(slot + 0x04);
  drive(f);
  // The heading stored at +$1B is the aim from the RECORD to the PLAYER RECORD's
  // ($2,A0)/($4,A0) -- not to the dispatch pointer the one-shot init read first.
  const want = aim256(AIMS, selfY, selfX,
    f.ram.u16(P1REC + 0x02), f.ram.u16(P1REC + 0x04));
  assert.equal(f.ram.u8(slot + 0x1b), want & 0xff);
  // and the cached pair is $241D34 at the FIXED speed index $40, not $241812
  const v = MT.shotVector(0x40, want & 0xff);
  assert.equal(f.ram.u16(slot + 0x20), v.dy & 0xffff, 'D2 -> ($20,A6)');
  assert.equal(f.ram.u16(slot + 0x22), v.dx & 0xffff, 'D3 -> ($22,A6)');
  // ...and the record MOVED by exactly that pair, long axis then short axis.
  assert.equal(f.ram.u16(slot + 0x02), (selfY + v.dy) & 0xffff);
  assert.equal(f.ram.u16(slot + 0x04), (selfX + v.dx) & 0xffff);
});

test('W417 moving the player moves the heading -- it re-aims EVERY frame',
  { skip: SKIP }, () => {
  // `$2802DC jsr $242296 / cmp.b ($1B,A6),D1 / beq` re-aims on every unpaused frame.
  // A port that only ran the one-shot would keep the first heading forever, and a
  // test that read only "the record moved" could not tell the two apart.
  const f = world();
  const slot = alloc(f, 0x20, 0);
  drive(f);
  const first = f.ram.u8(slot + 0x1b);
  f.ram.setU16(P1REC + 0x04, 0x3800);            // yank the ship across the screen
  drive(f);
  const second = f.ram.u8(slot + 0x1b);
  assert.notEqual(second, first, 'the heading followed the ship');
  // and it is the aim from where the record NOW is, not a stale one: the second
  // drive moved the record by the FIRST frame's pair before re-aiming, so recover
  // that position and aim from it.
  const v1 = MT.shotVector(0x40, first);
  const wasY = (f.ram.u16(slot + 0x02) - MT.shotVector(0x40, second).dy) & 0xffff;
  const wasX = (f.ram.u16(slot + 0x04) - MT.shotVector(0x40, second).dx) & 0xffff;
  assert.equal(second, aim256(AIMS, wasY, wasX,
    f.ram.u16(P1REC + 0x02), f.ram.u16(P1REC + 0x04)) & 0xff);
  assert.ok(v1.dy !== 0 || v1.dx !== 0, 'the first frame really did move it');
  // and the cached pair went with it
  const v = MT.shotVector(0x40, second);
  assert.equal(f.ram.u16(slot + 0x20), v.dy & 0xffff);
});

test('W417 an owner whose alive bit is CLEAR frees the record', { skip: SKIP }, () => {
  // `$2802C8 tst.w (A0) / bmi $2802DC` -- the branch is on the SIGN, so a player
  // record whose word 0 is $0000 or $7FFF frees the star instead of homing at it.
  for (const [word, freed] of [[0x8000, false], [0x0000, true], [0x7fff, true],
    [0xffff, false]]) {
    const f = world();
    const slot = alloc(f, 0x20, 0);
    f.ram.setU16(P1REC, word);
    const live = f.ram.u16(POOL_A.liveCount);
    const t = drive(f);
    assert.equal(f.ram.u16(slot) === 0, freed,
      `owner word $${word.toString(16)} -> freed=${freed}`);
    if (freed) {
      assert.equal(t.freed, 1);
      assert.equal(f.ram.u16(slot + 0x02), 0, '$2802D0 cleared the position');
      assert.equal(f.ram.u16(POOL_A.liveCount), live - 1);
    }
  }
});

test('W417 the pause gate is an AND with ($1A,A6), not `pause !== 0`',
  { skip: SKIP }, () => {
  // `move.w $803912,D0 / and.b ($1A,A6),D0 / bne`.  A port that wrote
  // `if (pause !== 0)` would coast on a frame the cartridge re-aims on, and one that
  // omitted the gate would re-aim on a frame the cartridge coasts through.
  //
  // HONEST LIMIT, stated rather than implied: the `.b` on the `and` is NOT decidable
  // here.  ($1A,A6) is `D7 & $F`, four bits, so a word AND and a byte AND give the
  // same answer for every possible pause word.  The size is asserted from the
  // encoding above and the BEHAVIOUR below is what this test can see.
  const slotNibble = (POOL_A.generalSlots - 1) & 0x0f;   // = 5
  for (const [pause, coasts] of [[0x0000, false], [0x0100, false],
    [slotNibble, true], [0x0100 | slotNibble, true], [~slotNibble & 0xff, false]]) {
    const f = world();
    const slot = alloc(f, 0x20, 0);
    assert.equal(f.ram.u8(slot + 0x1a), slotNibble);
    f.ram.setU16(POOL_A.pause, pause);
    f.ram.setU16(P1REC + 0x04, 0x3800);
    drive(f);
    // when it coasts, the one-shot's own heading survives; otherwise it re-aims.
    const aimed = aim256(AIMS, 0x3000, 0x1c00,
      f.ram.u16(P1REC + 0x02), f.ram.u16(P1REC + 0x04)) & 0xff;
    assert.equal(f.ram.u8(slot + 0x1b) === aimed, !coasts,
      `pause $${pause.toString(16)} -> coasts=${coasts}`);
  }
});

test('W417 the ring wraps at the CARTRIDGE\'s value, per kind', { skip: SKIP }, () => {
  for (const e of EIGHT) {
    const f = world();
    const slot = alloc(f, e.k * 4, 0);
    // park the record on the last frame of its ring and make the timer due
    f.ram.setU32(slot + 0x0a, e.wrap - e.step);
    f.ram.setU8(slot + 0x18, 0);
    f.ram.setU8(slot + 0x19, 4);
    drive(f);
    assert.equal(f.ram.u32(slot + 0x0a), e.base, `kind ${e.k} wrapped to its base`);
    assert.equal(f.ram.u8(slot + 0x18), 4, 'and reloaded from ($19,A6)');
  }
});

// ============ 6. THE COLLECT ARM =============================================

test('W417 bit 12 collects a kind-8 record for P1 and FREES it', { skip: SKIP }, () => {
  const f = world();
  const slot = alloc(f, 0x20, 0);
  f.ram.setU16(slot, f.ram.u16(slot) | 0x1000);          // the P1 touch bit
  const live = f.ram.u16(POOL_A.liveCount);
  const t = drive(f);
  assert.equal(t.collected, 1);
  assert.equal(f.ram.u16(STARP1), 1, '$817F86 += 1');
  assert.equal(f.ram.u16(STARP2), 0, 'and NOT the P2 counter');
  assert.equal(f.ram.u32(slot + 0x10), 0x00050000, '$28026C wrote the selector');
  assert.deepEqual(f.sounds, [0x28c5e4], '$28027E jsr $28C5E4');
  // $280274 moveq #$50,D0 / $280276 move.b (A6),D1 / $280278 jsr $286128 -- READ THE
  // PENDING SCORE BACK.  Counting the call cannot tell $50 from $0, and the status
  // HIGH byte is what routes it: bit 4 (= word bit 12) is P1, bit 3 (= 11) is P2.
  assert.equal(f.ram.u32(P1PEND), 0x00000050, 'P1 pending = $50, in packed BCD');
  assert.equal(f.ram.u32(P2PEND), 0, 'and P2 got nothing');
  assert.equal(f.ram.u16(slot), 0, '...and the record is FREED, not transformed');
  assert.equal(f.ram.u16(POOL_A.liveCount), live - 1);
});

test('W417 bit 11 does NOT collect a kind-8 record -- it keeps stepping',
  { skip: SKIP }, () => {
  // `btst #$C` is ONE bit, where kinds 0/2/6/7 use `andi.w #$1800` and take either.
  // A port that reused the `& 0x1800` shape would collect P2's touch for P1's score.
  const f = world();
  const slot = alloc(f, 0x20, 0);
  f.ram.setU16(slot, f.ram.u16(slot) | 0x0800);
  const t = drive(f);
  assert.equal(t.collected ?? 0, 0);
  assert.equal(f.ram.u16(STARP1), 0);
  assert.equal(f.ram.u16(STARP2), 0);
  assert.notEqual(f.ram.u16(slot), 0, 'still live');
  assert.equal(t.emitted, 1, 'and it drew');
  // ...and the P2 kind takes bit 11 and not bit 12, which is the same fact mirrored.
  const g = world();
  const s2 = alloc(g, 0x30, 0);
  g.ram.setU16(s2, g.ram.u16(s2) | 0x0800);
  drive(g);
  assert.equal(g.ram.u16(STARP2), 1);
  assert.equal(g.ram.u16(STARP1), 0);
});

test('W417 the counter clamps at $3E7 and the add is the kind\'s own',
  { skip: SKIP }, () => {
  for (const e of EIGHT) {
    const f = world();
    const slot = alloc(f, e.k * 4, 0);
    f.ram.setU16(slot, f.ram.u16(slot) | (1 << e.bit));
    f.ram.setU16(e.ctr, 0x0100);
    drive(f);
    assert.equal(f.ram.u16(e.ctr), 0x0100 + e.add, `kind ${e.k} add`);
    // and the SCORE, read out of the pending accumulator the mask routed it to.
    assert.equal(f.ram.u32(e.bit === 12 ? P1PEND : P2PEND), e.score,
      `kind ${e.k} score $${e.score.toString(16)} (packed BCD, so $1000 reads $1000)`);
    assert.equal(f.ram.u32(e.bit === 12 ? P2PEND : P1PEND), 0, 'the other side: 0');
    // and the clamp: $3E8 or more becomes $3E7
    const g = world();
    const s = alloc(g, e.k * 4, 0);
    g.ram.setU16(s, g.ram.u16(s) | (1 << e.bit));
    g.ram.setU16(e.ctr, 0x03e7);
    drive(g);
    assert.equal(g.ram.u16(e.ctr), 0x03e7, `kind ${e.k} clamp`);
  }
});

// ============ 7. THE DRAW GATE AND ITS EXEMPTION ============================

// THE POOL HAS TO BE GENUINELY BUSY.  `$817F7E` is the driver's own dbra count and
// `runPoolADriver` throws if it disagrees with the slots, so these build a real
// population rather than forging the counter.  With N live records the FIRST one is
// walked with `remaining` = N - 1, so its parity is fixed and known.
function busyPool(n, farX, nearIndex = -1, nearDelta = 0x100) {
  const f = world();
  const slots = [];
  for (let i = 0; i < n; i++) slots.push(alloc(f, 0x20, 0));
  assert.equal(f.ram.u16(POOL_A.liveCount), n, 'the counter matches the population');
  f.ram.setU16(POOL_A.collisionPhase, (n - 1) & 1);   // thin the FIRST record
  f.ram.setU16(P1REC + 0x04, farX);
  for (const s of slots) f.ram.setU16(s + 0x04, u16far(farX));
  if (nearIndex >= 0) {
    f.ram.setU16(slots[nearIndex] + 0x04, (farX + nearDelta) & 0xffff);
  }
  return { f, slots };
}
const u16far = (ownerX) => (ownerX + 0x4000) & 0xffff;

test('W417 a busy pool thins by parity -- EXCEPT within $600 of the owner',
  { skip: SKIP }, () => {
  // `cmpi.w #$28,$817F7E / bcs` (kind 0 uses $3C) and then an exemption kind 0 does
  // not have.  Read the EMITS back, and isolate ONE record by changing only its X:
  // a counter alone cannot tell "the gate fired" from "the gate is not there".
  const N = 0x28;                                        // exactly the threshold
  const far = busyPool(N, 0x0000);
  const baseline = drive(far.f).emitted;
  // half the pool is thinned: `1 & D7` alternates down the walk.
  assert.equal(baseline, N / 2, 'half the busy pool drew');
  // the SAME population with record 0 moved next to the owner draws one MORE.
  const near = busyPool(N, 0x0000, 0, 0x100);
  assert.equal(drive(near.f).emitted, baseline + 1, 'the $600 exemption fired');
  // ...and moving it a long way out does NOT.  The threshold itself is the image's
  // (`$28034A cmpi.w #$600,D0`); the record has already stepped by its own velocity
  // by the time the gate reads it, so the boundary is asserted from the BYTES and
  // the behaviour from a distance no one frame of motion can cross.
  assert.equal(u16img(0x28034a), 0x0c40, 'cmpi.w #imm,D0');
  assert.equal(u16img(0x28034c), 0x0600);
  const outside = busyPool(N, 0x0000, 0, 0x1000);
  assert.equal(drive(outside.f).emitted, baseline, '$1000 away is outside');
  // and a pool ONE under the threshold draws every record regardless.
  const quiet = busyPool(N - 1, 0x0000);
  assert.equal(drive(quiet.f).emitted, N - 1, 'under $28 live it always draws');
  // nothing was freed in any of the four -- the thinning is a SKIP, not a drop.
  assert.equal(far.f.ram.u16(POOL_A.liveCount), N);
  for (const s of far.slots) assert.notEqual(far.f.ram.u16(s), 0);
});

test('W417 the $600 distance is an ABSOLUTE value, both ways round',
  { skip: SKIP }, () => {
  // `sub.w D2,D0 / bpl / neg.w D0` -- and `44 40` is neg.**w**, size bits `01`.
  // W416 nearly "fixed" a correct neg.w into a neg.b; here a byte negate would
  // leave $FF00 as $FF00 and the exemption would fire on only one side.
  assert.equal(u16img(0x280348), 0x4440, 'neg.w D0, not neg.b ($442C-style)');
  const N = 0x28;
  const baseline = drive(busyPool(N, 0x4000).f).emitted;
  for (const delta of [+0x100, -0x100]) {
    const b = busyPool(N, 0x4000, 0, delta);
    assert.equal(drive(b.f).emitted, baseline + 1,
      `record ${delta > 0 ? 'above' : 'below'} the owner`);
  }
});

// ============ 8. KIND INDEX 3 ===============================================

test('W417 $27FED2 is $27FE0E with four constants moved', { skip: SKIP_IMG }, () => {
  // the head: the boss-flag free and the `andi.w #$1800` fork, byte-identical
  assert.equal(bytes(0x27fed2, 6), '4a79008130f8');
  assert.equal(bytes(0x27feda, 4), '02411800');
  // the collect arm against kind 2's: the two differ in the add, the selector,
  // the score, the sound and the two bra.w displacements. NOTHING ELSE.
  // The HEAD, through the selector: one byte differs, the `moveq` add.
  const A = 0x27fee0, Bb = 0x27fe1c;
  const head = [];
  for (let i = 0; i < 0x22; i++) if (IMG[A + i] !== IMG[Bb + i]) head.push(i);
  assert.deepEqual(head, [0x01], 'only the add; the selector run is asserted below');
  // Then the two go out of alignment by FOUR, because kind 2's score is `moveq #$50`
  // and kind 3's is `move.l #$1000,D0`.  Realign and the rest is one constant:
  assert.equal(u32img(0x27fe1c + 0x22), 0x00050000, 'kind 2 selector');
  assert.equal(u32img(0x27fee0 + 0x22), 0x00010008, 'kind 3 selector');
  assert.equal(u16img(0x27fe1c + 0x28), 0x7050, 'kind 2 score: moveq #$50');
  assert.equal(u16img(0x27fee0 + 0x28), 0x203c, 'kind 3 score: move.l #imm,D0');
  const tail = [];
  for (let i = 0; i < 24; i++) {
    if (IMG[0x27fee0 + 46 + i] !== IMG[0x27fe1c + 42 + i]) tail.push(i);
  }
  // the sound's low word, and the two `bra.w` displacement bytes -- which MUST
  // differ, because the two arms start four bytes apart and land on the same
  // $280FDC (asserted below).  Nothing else in twenty-four bytes.
  assert.deepEqual(tail, [12, 13, 22, 23]);
  assert.equal(IMG[0x27fee1], 0x02, 'moveq #$2 where kind 2 has #$1');
  assert.equal(u32img(0x27ff02), 0x00010008, 'selector, where kind 2 has $00050000');
  assert.equal(u32img(0x27ff0a), 0x00001000, 'score, where kind 2 has $50');
  assert.equal(u32img(0x27ff18) & 0xffffff, 0x28c610, 'sound, where kind 2 has $28C5E4');
  assert.equal(u32img(0x27fee4), 0x00817f84, 'the MEDAL P1 counter');
  assert.equal(u32img(0x27fef0), 0x00817f88, 'the MEDAL P2 counter');
  // and it DOES reach the collected transform, unlike the eight above.
  assert.equal(0x27ff24 + u16img(0x27ff24), 0x280fdc);
  // the step's ring, and the wrap forces the timer to TWO where kind 2 forces ONE.
  assert.equal(u32img(0x27ff7a), 0x000000c4);
  assert.equal(u32img(0x27ff80) & 0xffffff, 0x1bf58c);
  assert.equal(u32img(0x27ff88) & 0xffffff, 0x1be94c);
  assert.equal(bytes(0x27ff8c, 6), '1d7c00020018');
  assert.equal(bytes(0x27fec4, 6), '1d7c00010018', 'kind 2 forces $1');
});

test('W417 a kind-3 record allocates, steps its own ring and emits',
  { skip: SKIP }, () => {
  const f = world();
  const slot = alloc(f, 0x0c, 2);
  assert.equal(f.ram.u16(slot) & 0x7c, 0x0c, 'kind index 3');
  assert.equal(f.ram.u32(slot + 0x0a), 0x001be94c, 'template 3\'s sprite $280EDC');
  assert.equal(f.ram.u16(slot + 0x0e), 0x0830, 'the size');
  const t = drive(f);
  assert.equal(t.emitted, 1, '$27FF96 jmp (A0) -- the record\'s OWN layer emitter');
  assert.deepEqual(f.log.report(), []);
  // the ring, driven to its wrap
  f.ram.setU32(slot + 0x0a, 0x1bf58c - 0xc4);
  f.ram.setU8(slot + 0x18, 0);
  f.ram.setU8(slot + 0x19, 9);
  drive(f);
  assert.equal(f.ram.u32(slot + 0x0a), 0x001be94c);
  assert.equal(f.ram.u8(slot + 0x18), 2, 'the wrap forces $2, NOT the reload byte');
});

test('W417 collecting a kind-3 record scores $1000 on the MEDAL counters',
  { skip: SKIP }, () => {
  const f = world();
  const slot = alloc(f, 0x0c, 0);
  f.ram.setU16(slot, f.ram.u16(slot) | 0x1000);
  const t = drive(f);
  assert.equal(t.collected, 1);
  assert.equal(f.ram.u16(MEDALP1), 2, '$817F84 += 2, where kind 2 adds 1');
  assert.equal(f.ram.u16(STARP1), 0, 'and NOT the star pair');
  assert.deepEqual(f.sounds, [0x28c610], '$27FF16 jsr $28C610');
  assert.equal(f.ram.u8(slot + 1), 0x84, '$27FF1C move.b #$84,($1,A6)');
  // it reaches $280FDC, so the record is TRANSFORMED and stays live.
  assert.notEqual(f.ram.u16(slot), 0);
});

test('W417 $8130F8 bit 15 frees a kind-3 record outright', { skip: SKIP }, () => {
  for (const [flags, freed] of [[0x8000, true], [0x4000, false], [0x0080, false]]) {
    const f = world();
    const slot = alloc(f, 0x0c, 0);
    f.ram.setU16(POOL_A.twoPlayer, flags);
    drive(f);
    assert.equal(f.ram.u16(slot) === 0, freed, `$8130F8 = $${flags.toString(16)}`);
  }
});

// ============ 9. ART, MEASURED OUT OF THE SHIPPED BUNDLE =====================

const STREAMS = path.join(R, 'assets', 'spr', 'streams.u32.gz');
const MANIFEST = path.join(R, 'assets', 'manifest.json');
const HAVE_BUNDLE = existsSync(STREAMS) && existsSync(MANIFEST);
const SKIP_BUNDLE = HAVE_BUNDLE ? false
  : 'the exported bundle is absent (it is ROM-derived and gitignored); skip, not pass';

function shippedStreams() {
  const raw = gunzipSync(readFileSync(STREAMS));
  const flat = new Uint32Array(raw.buffer, raw.byteOffset,
    Math.floor(raw.byteLength / 4));
  const n = flat.length / 3;
  const set = new Set();
  let rom = 0;
  for (let i = 0; i < n; i++) { rom = (rom + flat[i]) >>> 0; set.add(rom); }
  return set;
}

test('W417 every ring this wave gives a body IS in the shipped bundle',
  { skip: SKIP_BUNDLE }, () => {
  // W414's lesson, applied before shipping rather than after: a body without its art
  // allocates, animates and silently fails to draw.  MEASURED, not assumed.
  const have = shippedStreams();
  const rings = [
    ['kinds 8/12', 0x1bcacc, 0x24], ['kinds 9/13', 0x1bcd0c, 0x34],
    ['kinds 10/14', 0x1bd04c, 0x64], ['kinds 11/15', 0x1bd68c, 0xc4],
    ['kind 3', 0x1be94c, 0xc4],
  ];
  for (const [what, base, stride] of rings) {
    for (let i = 0; i < 16; i++) {
      assert.ok(have.has(base + i * stride),
        `${what}: $${(base + i * stride).toString(16).toUpperCase()} is missing`);
    }
  }
  // and kind 3's sixteen are the ONLY ones this wave had to add: the other four rings
  // were already there (W266 shipped two, W216's stage-4 kinds 18/19 are the others).
  assert.equal(0x1bf58c - 0x1be94c, 16 * 0xc4, 'the extent is 16 x $C4 exactly');
});
