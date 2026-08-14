// W374: `$280B56 add.l ($2,A6),D1` is a LONG add, and the port was masking its addend.
//
// PART 1 -- an ACTIVE defect, not a tidy-up. `fillGeneralImpact280B3E` computed
//
//     pos = carrier_pos + (offset & 0xffff)
//
// and type $1B's death arm feeds it FULL LONGS: `$2696F8 move.l (A4)+,D1` walks the four
// longwords at $26970C, every one of which has a non-zero high word. The mask threw the high
// halves away, so the four corners of the death burst collapsed onto TWO points that differ
// only on the low axis. That is on screen today.
//
// PART 2 -- `$27F8F0` is `allocPoolA27F8F0` and has been since W312, but type $92's and type
// $93's death tails still raised `unported.note(0x27f8f0, ...)` instead of calling it. This is
// the sixth routine in this project found already ported under another name. Part 2 needs part
// 1: type $92's D1 is `$FF00FE00` and type $93's is `$FAC0FA40`, so under the mask both would
// have spawned on the wrong side of the carrier.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { UnportedLog } from '../src/unported.js';
import { allocPoolA27F8F0, POOL_A, B } from '../src/bee.js';
import { runInitBodyAddr } from '../src/initbody.js';
import { handlerMap, runHandler } from '../src/handlers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.join(HERE, '..');
const tablesPath = path.join(R, 'rip', 'port', 'player.tables.json');
const HAVE = existsSync(tablesPath);
const json = HAVE ? JSON.parse(readFileSync(tablesPath, 'utf8')) : null;
const ROM = HAVE ? new RomWindows(json.rom) : null;
const TABLES = HAVE ? new MoveTables(json, ROM) : null;
const SKIP = HAVE ? false : 'generated ROM tables absent; skip, not pass';

const IMAGE = path.join(R, 'rip', 'sound', 'maincpu.bin');
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const SKIP_IMG = IMG ? SKIP : 'the ROM image is absent; skip, not pass';

const DEATH_ROWS = 0x26970c;      // T1B.deathRows -- four longs, `lea ($26970C,PC),A4`
const CARRIER = 0x814600;         // a scratch record, clear of every live table
const CORNERS = [0x04000280, 0x0400fd80, 0xfc00fd80, 0xfc000280];

function world(carrierPos = 0x20000000) {
  const ram = new Ram();
  const log = new UnportedLog();
  ram.setU32(CARRIER + B.pos, carrierPos >>> 0);
  return { ram, log, ctx: { tables: TABLES, rom: ROM, unported: log, unportedLog: log,
    notes: log } };
}

// ============================================================================
// PART 1.4 -- THE TABLE ITSELF, so this file fails loudly if it ever moves
// ============================================================================

test('W374 $26970C still holds the four-corner pattern', { skip: SKIP }, () => {
  // `$2696EC moveq #$8,D0 / $2696EE lea ($1C,PC),A4 / $2696F6 moveq #$3,D6` and then
  // `$2696F8 move.l (A4)+,D1 / $2696FA moveq #$3,D2 / $2696FC jsr $27F8F0` with a `dbra`
  // back to $2696F8: FOUR rows, each a FULL LONG, layer 3, kind $8.
  const rows = Array.from({ length: 4 }, (_, n) => ROM.u32(DEATH_ROWS + n * 4));
  assert.deepEqual(rows, CORNERS,
    'the $26970C rows moved; every position claim in this file is about these four longs');
  // And they really are corners: the high halves are +/-$0400 and the low ones +/-$0280.
  assert.deepEqual([...new Set(rows.map((r) => r >>> 16))].sort(), [0x0400, 0xfc00]);
  assert.deepEqual([...new Set(rows.map((r) => r & 0xffff))].sort(), [0x0280, 0xfd80]);
  assert.equal((0x0400 + 0xfc00) & 0xffff, 0, '$FC00 is exactly -$0400');
  assert.equal((0x0280 + 0xfd80) & 0xffff, 0, '$FD80 is exactly -$0280');
});

test('W374 the ROM really says `add.l`, not `add.w`', { skip: SKIP_IMG }, () => {
  // $280B56 `D2AE 0002` -- opmode 6 is <ea> + Dn -> Dn on a LONG. `add.w ($2,A6),D1`
  // would encode `D26E 0002`, and THAT is the instruction the old mask modelled.
  assert.equal(IMG.readUInt16BE(0x280b56), 0xd2ae, '$280B56 add.l (d16,A6),D1');
  assert.equal(IMG.readUInt16BE(0x280b58), 0x0002, 'from ($2,A6), the packed position long');
  assert.notEqual(IMG.readUInt16BE(0x280b56), 0xd26e, 'and it is NOT the word form');
  // The very next add IS a word add, which is why the port's second step still masks.
  assert.equal(IMG.readUInt16BE(0x280b5a), 0xd279, '$280B5A add.w (xxx).L,D1 -- WORD');
  assert.equal(IMG.readUInt32BE(0x280b5c), 0x00813176, 'the scroll short, POOL_A.scrollShort');
  assert.equal(IMG.readUInt16BE(0x280b60), 0x20c1, '$280B60 move.l D1,(A0)+ -- stored as a LONG');
  // And the caller is the long-walking loop, not a word read.
  assert.equal(IMG.readUInt16BE(0x2696f6), 0x221c, '$2696F6 move.l (A4)+,D1 -- a FULL LONG');
  assert.equal(IMG.readUInt16BE(0x2696f8), 0x7403, '$2696F8 moveq #$3,D2 -- layer 3');
  assert.equal(IMG.readUInt16BE(0x2696ec), 0x7008, '$2696EC moveq #$8,D0 -- kind $8');
  assert.equal(IMG.readUInt32BE(0x269700), 0x51cefff4, '$269700 dbra D6,$2696F6 -- FOUR passes');
});

// ============================================================================
// PART 1.1 -- THE FOUR CORNERS SURVIVE
// ============================================================================

const spawnCorners = (f) => CORNERS.map((offset) => {
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, 8, offset, 3, CARRIER);
  assert.ok(slot, `offset $${offset.toString(16)} allocated`);
  return f.ram.u32(slot + B.pos);
});

test('W374 the four $26970C rows land on FOUR DISTINCT positions', { skip: SKIP }, () => {
  // The carrier's low half is $0000 here on purpose: it makes the old masked code produce
  // ONE high word for all four rows, so the regression is unambiguous.
  const f = world(0x20000000);
  const got = spawnCorners(f);

  assert.deepEqual(got, [0x24000280, 0x2400fd80, 0x1c00fd80, 0x1c000280],
    'carrier $20000000 plus each FULL long');
  assert.equal(new Set(got).size, 4,
    'REGRESSION PIN: with `offset & 0xffff` restored the four corners collapse to TWO '
    + 'points ($20000280 and $2000FD80), a segment on the low axis instead of a box');

  const highs = got.map((p) => p >>> 16);
  assert.deepEqual(highs, [0x2400, 0x2400, 0x1c00, 0x1c00]);
  assert.equal(new Set(highs).size, 2,
    'REGRESSION PIN: under `offset & 0xffff` ALL FOUR share the carrier\'s own high word '
    + '($2000) and the burst has no extent at all on the long axis');
  // The box is centred on the carrier: +$0400 and -$0400 about $2000.
  assert.deepEqual([...new Set(highs)].sort(), [0x1c00, 0x2400]);
  const lows = got.map((p) => p & 0xffff);
  assert.deepEqual([...new Set(lows)].sort(), [0x0280, 0xfd80]);
});

test('W374 and the live type $1B death arm produces the same box', { skip: SKIP }, () => {
  // The direct calls above pin `bee.js`. This one pins the WIRE: `handlers.js` really passes
  // `rom.u32(...)` and really passes the sub-record as the carrier, so a caller that started
  // masking again, or that passed A5, would fail here and not there.
  const A5 = 0x8137c0, A6 = 0x8139c0;
  const ram = new Ram();
  const log = new UnportedLog();
  const notes = [];
  const ctx = { tables: TABLES, rom: ROM, unported: log, unportedLog: log, notes: log,
    bulletSpawn: () => {}, soundPost: (cue) => notes.push(cue) };
  ram.setU32(A5 + 0x06, A6);
  ram.setU16(A5 + 0x18, 0);              // state 0, so the handler falls straight through
  ram.setU8(A5 + 0x16, 1);
  ram.setU16(0x813092, 0);
  ram.setU16(0x813094, 0);
  runInitBodyAddr(0x26925e, ram, ROM, A5, log, TABLES);
  // The position AFTER the init body, so nothing the init writes can move it back.
  ram.setU16(A6 + 0x02, 0x2000);         // the packed HIGH half
  ram.setU16(A6 + 0x04, 0x0000);         // the packed LOW half -- see the note above
  ram.setU16(A6 + 0x18, 0x8001);         // $2693BA tst.w ($18,A6) / bmi -- a NEGATIVE HP
  ram.setU8(A6, 0x5c);                   // the hit bits, or the damage arm never reaches the bmi
  ram.setU16(0x8130ca, 0);

  const before = ram.u16(POOL_A.liveCount);
  handlerMap().get(0x269350)(ram, ROM, A5, ctx);
  assert.equal(ram.u16(POOL_A.liveCount), before + 4, 'four rows, four pool-A slots');

  const got = Array.from({ length: 4 },
    (_, i) => ram.u32(POOL_A.base + i * POOL_A.stride + B.pos));
  assert.deepEqual(got, [0x24000280, 0x2400fd80, 0x1c00fd80, 0x1c000280],
    'the death burst is a BOX around the carrier, through the real handler');
  assert.equal(new Set(got).size, 4, 'REGRESSION PIN: the mask made this 2');
  assert.deepEqual(notes, [0x28c28e], 'and it really was the death arm: $26963A jsr $28C28E');
});

// ============================================================================
// PART 1.2 / 1.3 -- THE CARRY, AND THE NARROWNESS OF THE CHANGE
// ============================================================================

test('W374 a low-half overflow carries into the high half by exactly 1', { skip: SKIP }, () => {
  // $FF00 + $0200 = $1_0100. `add.l` propagates that carry; `add.w` would not, and neither did
  // the masked port when the caller's own high word happened to be zero.
  const f = world(0x1000ff00);
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, 8, 0x00000200, 3, CARRIER);
  assert.ok(slot);
  const pos = f.ram.u32(slot + B.pos);
  assert.equal(pos, 0x10010100, '$1000FF00 + $00000200');
  assert.equal(pos >>> 16, 0x1000 + 1, 'the high half incremented by exactly 1');
  assert.equal(pos & 0xffff, 0x0100, 'and the low half wrapped');
});

test('W374 a `u16(...)` caller with no carry is bit-for-bit unchanged', { skip: SKIP }, () => {
  // `stage4typea3.js` passes `u16(boundary +/- $0200)` and `bulletdriver.js` passes 0. Those are
  // the callers the mask was invisible to, and they must STAY invisible: the change is a carry
  // and a high word, not a new arithmetic.
  for (const [carrier, offset, want] of [
    [0x10001000, 0x0200, 0x10001200],   // an ordinary stage-4 boundary offset
    [0x10001000, 0x0000, 0x10001000],   // $27F8F8's `moveq #0,D1`, via bulletdriver.js
    [0x10000100, 0xfe00, 0x1000ff00],   // a NEGATIVE word offset whose low half does NOT wrap
  ]) {
    const f = world(carrier);
    const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, 8, offset, 3, CARRIER);
    assert.ok(slot);
    assert.equal(f.ram.u32(slot + B.pos), want,
      `carrier $${carrier.toString(16)} + $${offset.toString(16)}`);
    assert.equal(f.ram.u32(slot + B.pos) >>> 16, carrier >>> 16,
      'the high half is untouched when nothing carries');
  }
});

test('W374 the word-sized scroll add still does NOT carry', { skip: SKIP }, () => {
  // $280B5A is `add.w`, so the port must keep masking THAT one. A carrier low half of $FF00
  // plus a scroll of $0200 must stay inside the low word.
  const f = world(0x1000ff00);
  f.ram.setU16(POOL_A.scrollShort, 0x0200);
  const slot = allocPoolA27F8F0(f.ram, ROM, f.ctx, 8, 0, 3, CARRIER);
  assert.ok(slot);
  assert.equal(f.ram.u32(slot + B.pos), 0x10000100,
    'the scroll wrapped inside the low word and did NOT reach $1001');
});

// ============================================================================
// PART 2 -- `$27F8F0`'S TWO UNPORTED NOTES, WHICH WERE NEVER UNPORTED
// ============================================================================

const T92 = { init: 0x279cd0, handler: 0x279d72, a5: 0x81332c, a6: 0x81459c };
const T93 = { init: 0x279ec2, handler: 0x279f4a, a5: 0x81332c, a6: 0x81459c };

/** W178's and W181's own fixture, reduced to the death TAIL both files exercise. */
function tailWorld(T, { pos = 0x20004000, f1c = 0, f1f = 3 } = {}) {
  const ram = new Ram();
  const unported = new UnportedLog();
  const sounds = [], kills = [], effects = [];
  ram.setU16(T.a5, 0x8000);
  ram.setU16(T.a5 + 0x04, 0);
  ram.setU32(T.a5 + 0x06, T.a6);
  ram.setU32(T.a5 + 0x12, 0);                 // no movement script, so the position stays put
  ram.setU16(0x813092, 1);
  ram.setU16(0x813094, 2);
  runInitBodyAddr(T.init, ram, ROM, T.a5, new UnportedLog(), TABLES);
  ram.setU32(T.a6 + 0x02, pos >>> 0);         // the packed position long, ($2,A6)
  ram.setU16(T.a6, 0x8080);                   // bit 7 of ($1,A6) -- the handler takes the TAIL
  ram.setU8(T.a6 + 0x1c, f1c);                // ($1C,A6) -- type $92's mirror bit 6
  ram.setU8(T.a6 + 0x1f, f1f);                // ($1F,A6) -- D2, the layer byte
  ram.setU8(T.a5 + 0x17, 0);                  // the linger counter borrows on this frame
  const ctx = { ram, rom: ROM, tables: TABLES, unported, unportedLog: unported, notes: unported,
    soundPost: (a) => sounds.push(a),
    killEvent: (s, h) => kills.push([s, h]),
    effectSpawn: (k, site, slot) => effects.push([k, site, slot]) };
  return { ram, unported, ctx, sounds, kills, effects };
}

const poolNotes = (f) => f.unported.report().filter((x) => x.includes('$27F8F0'));

test('W374 type $92 death tail ALLOCATES instead of noting', { skip: SKIP }, () => {
  // `$279D4E moveq #$C,D0 / $279D50 move.l #$FF00FE00,D1 / $279D60 move.b ($1F,A6),D2 /
  // $279D64 jsr $27F8F0`. Everything about D1 and D2 was already modelled; only the call
  // was missing.
  const f = tailWorld(T92);
  const before = f.ram.u16(POOL_A.liveCount);
  runHandler(T92.handler, f.ram, ROM, T92.a5, f.ctx);

  assert.equal(f.ram.u16(T92.a5), 0, '$279D6A jmp $263762 still frees the enemy');
  assert.equal(f.ram.u16(POOL_A.liveCount), before + 1, 'one pool-A slot went live');
  const slot = POOL_A.base;
  assert.equal(f.ram.u16(slot + B.status), 0x800c,
    'D0 = $C, and $280B4E/$280B50 write `kind | $8000`');
  assert.equal(f.ram.u32(slot + B.pos), 0x1f013e00,
    '$20004000 + $FF00FE00 -- the HIGH word survives, which is W374 part 1');
  assert.equal(f.ram.u32(slot + B.pos) >>> 16, 0x1f01,
    'and it is NOT $2001, which is what the old `offset & 0xffff` produced');
  assert.deepEqual(poolNotes(f), [], 'and NO $27F8F0 note is raised any more');
});

test('W374 type $92 mirror bit still negates only D1 LOW word', { skip: SKIP }, () => {
  // `$279D56 btst #$6,($1C,A6) / beq $279D60 / $279D5E neg.w D1` -- W178 pinned this against
  // the note text. Now that the note is gone the same fact has to be pinned against the
  // POSITION, which is a stronger statement: it is what the player sees.
  const plain = tailWorld(T92, { f1c: 0x00 });
  const mirrored = tailWorld(T92, { f1c: 0x40 });
  runHandler(T92.handler, plain.ram, ROM, T92.a5, plain.ctx);
  runHandler(T92.handler, mirrored.ram, ROM, T92.a5, mirrored.ctx);
  assert.equal(plain.ram.u32(POOL_A.base + B.pos), 0x1f013e00,   // D1 = $FF00FE00
    'unmirrored');
  assert.equal(mirrored.ram.u32(POOL_A.base + B.pos), 0x1f004200, // D1 = $FF000200
    'mirrored: `neg.w` changed the LOW word only');
  assert.equal(plain.ram.u32(POOL_A.base + B.pos) >>> 16, 0x1f01);
  assert.equal(mirrored.ram.u32(POOL_A.base + B.pos) >>> 16, 0x1f00,
    'the two high halves differ only by the low half carry -- $FF00 stayed $FF00 in both');
  assert.deepEqual(poolNotes(mirrored), []);
});

test('W374 type $93 death tail ALLOCATES instead of noting', { skip: SKIP }, () => {
  // `$279F30 moveq #$C,D0 / $279F32 move.l #$FAC0FA40,D1 / $279F38 move.b ($1F,A6),D2 /
  // $279F3C jsr $27F8F0` -- the same shape with no mirror test at all.
  const f = tailWorld(T93, { f1f: 0 });
  const before = f.ram.u16(POOL_A.liveCount);
  runHandler(T93.handler, f.ram, ROM, T93.a5, f.ctx);

  assert.equal(f.ram.u16(T93.a5), 0, '$279F42 jmp $263762');
  assert.equal(f.ram.u16(POOL_A.liveCount), before + 1);
  const slot = POOL_A.base;
  assert.equal(f.ram.u16(slot + B.status), 0x800c, 'D0 = $C here too');
  assert.equal(f.ram.u32(slot + B.pos), 0x1ac13a40,
    '$20004000 + $FAC0FA40 -- BOTH halves of the long, plus the low-to-high carry');
  assert.equal(f.ram.u32(slot + B.pos) >>> 16, 0x1ac1,
    'the $FAC0 high word survived; the old mask would have left $2001');
  assert.deepEqual(poolNotes(f), [], 'and NO $27F8F0 note');
});

test('W374 neither tail leaves ANY $27F8F0 deferral in the whole log', { skip: SKIP }, () => {
  // The brief asked for the notes array to be captured and grepped, so grep the whole thing
  // and not just the filtered view: a note raised under a different spelling would still be
  // a deferral of a routine that exists.
  for (const [T, opts] of [[T92, {}], [T92, { f1c: 0x40 }], [T93, { f1f: 0 }]]) {
    const f = tailWorld(T, opts);
    runHandler(T.handler, f.ram, ROM, T.a5, f.ctx);
    const all = f.unported.report().join('\n');
    assert.doesNotMatch(all, /27F8F0/i, `still deferring: ${all}`);
    assert.doesNotMatch(all, /27F8F8/i, 'and not the sibling entry either');
  }
});

test('W374 the two sites really use the MASKING entry $27F8F0', { skip: SKIP_IMG }, () => {
  // $27F8F0 does `andi.w #$FF,D2 / lsl.w #2,D2` and falls into the shared body; $27F8F8 is a
  // SECOND entry that does `moveq #0,D1 / moveq #0,D2` first. `allocPoolA27F8F0` models the
  // $27F8F0 entry, so routing a $27F8F8 caller through it applies the mask and the shift to a
  // layer byte the cartridge meant to be zero. Both of W374's sites are $27F8F0 sites, and
  // this pins that.
  for (const site of [0x279d64, 0x279f3c]) {
    assert.equal(IMG.readUInt16BE(site), 0x4eb9, `$${site.toString(16)} jsr (xxx).L`);
    assert.equal(IMG.readUInt32BE(site + 2), 0x0027f8f0, 'the MASKING entry, not $27F8F8');
  }
  assert.equal(IMG.readUInt16BE(0x279d4e), 0x700c, '$279D4E moveq #$C,D0');
  assert.equal(IMG.readUInt16BE(0x279f30), 0x700c, '$279F30 moveq #$C,D0');
  assert.equal(IMG.readUInt32BE(0x279d52), 0xff00fe00, 'type $92 D1');
  assert.equal(IMG.readUInt32BE(0x279f34), 0xfac0fa40, 'type $93 D1');
  // The entry itself, so a later reader does not have to take the two facts on trust.
  assert.equal(IMG.readUInt32BE(0x27f8f0), 0x024200ff, '$27F8F0 andi.w #$FF,D2');
  assert.equal(IMG.readUInt16BE(0x27f8f4), 0xe54a, '$27F8F4 lsl.w #2,D2');
  assert.equal(IMG.readUInt16BE(0x27f8f6), 0x6004, '$27F8F6 bra.s $27F8FC -- PAST the 2nd entry');
  assert.equal(IMG.readUInt32BE(0x27f8f8), 0x72007400, '$27F8F8 moveq #0,D1 / moveq #0,D2');
  // And the free-slot exit really is the fill this port calls: `beq.w $280B3E`, not a local
  // branch. The brief called this target $27F920; $27F920 is where the FAILURE exit lands.
  assert.equal(IMG.readUInt16BE(0x27f90c), 0x6700, '$27F90C beq.w');
  assert.equal(0x27f90e + IMG.readInt16BE(0x27f90e), 0x280b3e, 'to $280B3E, the fill');
  assert.equal(IMG.readUInt16BE(0x27f906), 0x3e3c, '$27F906 move.w #imm,D7');
  assert.equal(IMG.readUInt16BE(0x27f908), 0x0045, '#$45 -- 69 for the dbra, so SEVENTY slots');
  assert.equal(POOL_A.generalSlots, 70);
  assert.equal(IMG.readUInt32BE(0x27f91c), 0x007c0001, '$27F91C ori.w #$1,SR -- carry = FAILURE');
});
