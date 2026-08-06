// W63 (B1) -- OBJECT TYPE 0: THE DRAIN, THE CHAIN-METER DECREMENT AND THE SLOT
// THE HYPER GOES IN.
//
// The defect these tests exist for is written in `src/score.js`'s own header
// and has stood for twenty-nine waves: **"with no decrement a chain the port
// starts never expires"**.  `$240F62[0] = $28D520` was a counted dispatch miss
// on every frame of every run, so `$2842B0` (the pending -> total drain) and
// `$284636`/`$2847D4` (the two chain-meter decrements) never ran.
//
// SHAPE, following W57/W61/W62's.  Every assertion is on a value the CARTRIDGE
// decides -- the priorities out of `$240F62`, the four-per-frame drain out of
// `$284468`'s four unrolled copies, the wrap constant out of `$285F80`, the
// extend terminator out of `$28840E[3]`, the character base out of `$284438`.
// Nothing writes a constant and reads it back through the same constant
// (`docs/knowledge/03`, and the two seeded checks that cost this project most).
//
// Throw assertions pin `e.romAddress`, never the message text.
//
// The tests that need the export SKIP LOUDLY when it is absent.  A skip is not
// a pass.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Unreached, UnportedLog } from '../src/unported.js';
import { RomWindows } from '../src/rom.js';
import { OBJ } from '../src/objdriver.js';
import { ALLOC } from '../src/objalloc.js';
import {
  HUD, HUDRAM, BOSS_TAIL, SUBTICK_IS_A_NO_OP,
  drain2842B0, perFrame28444E, drainItems284468, gates2844A6,
  makeHudObject, objectOrder,
} from '../src/hud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TABLES = path.join(HERE, '..', 'rip', 'port', 'player.tables.json');
const haveTables = fs.existsSync(TABLES);
const tables = haveTables ? JSON.parse(fs.readFileSync(TABLES, 'utf8')) : null;
const rom = haveTables ? new RomWindows(tables.rom) : null;

function fresh() {
  return { ram: new Ram(new Uint8Array(0x20000)), ctx: { unportedLog: new UnportedLog() } };
}
/** A ctx whose `unportedLog` can be counted by address. */
function counted(ctx, addr) {
  let n = 0;
  const p = `$${addr.toString(16).toUpperCase()} `;
  for (const [k, v] of ctx.unportedLog.calls) if (k.startsWith(p)) n += v;
  return n;
}

// ===========================================================================
// 1. THE OBJECT AND ITS THREE STATES
// ===========================================================================

test('W63 $28D520 state 0: INIT sets ($2,A5) := 1 and $81B6F0 := 1', () => {
  const { ram, ctx } = fresh();
  const a5 = OBJ.base;
  ram.setU16(a5, 0x8000);
  ram.setU8(a5 + 2, 0);
  makeHudObject(rom)(ram, a5, 0, ctx);
  assert.equal(ram.u8(a5 + 2), 1);                     // $28D502
  assert.equal(ram.u16(HUDRAM.objFlag), 1);            // $28D508
  // ...and it RETURNS: the drain must not have run on the init frame.
  assert.equal(ram.u32(HUDRAM.totalP1), 0);
});

test('W63 $28D520 state 2: DESTROY clears $81B6F0 and queues the kill by ID', () => {
  const { ram, ctx } = fresh();
  const a5 = OBJ.base;
  ram.setU16(a5, 0x8000);
  ram.setU8(a5 + 2, 2);
  ram.setU32(a5 + 0x4c, 0x1234);
  ram.setU16(HUDRAM.objFlag, 1);
  makeHudObject(rom)(ram, a5, 0, ctx);
  assert.equal(ram.u16(HUDRAM.objFlag), 0);            // $28D512
  // $28D518 jmp $241292 -> $241238, the DEFERRED list.  The ID is the record's
  // ($4C,A5), which is what `$241292 lea $4c(a5),A0` reads.
  assert.equal(ram.u32(ALLOC.killQueue), 0x1234, 'the kill queue holds the ID');
});

test('W63 $28D520 state 1 is the ONLY state that runs $2842B0 and $28444E', () => {
  const { ram, ctx } = fresh();
  const a5 = OBJ.base;
  ram.setU16(a5, 0x8000);
  ram.setU8(a5 + 2, 1);
  ram.setU16(HUDRAM.slideFlag, 0);
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU32(HUDRAM.pendingP1, 0x00001234);
  makeHudObject(rom)(ram, a5, 0, ctx);
  assert.equal(ram.u32(HUDRAM.totalP1), 0x00001234, 'the drain ran');
  assert.equal(ram.u32(HUDRAM.pendingP1), 0, '...and emptied the pending');
  // W113: $285C5E is now PORTED (emits to bucket 25 when rom is available, not
  // a note). The drain's effect on totalP1 is the signal that $28444E ran.
  // When rom is null (no export), the draw falls back to a note at $285C5E.
  if (!rom) assert.ok(counted(ctx, 0x285c5e) > 0, '$28444E reached P1s block');
});

// ===========================================================================
// 2. THE FRAME ORDER -- recon 38 7.1's "the one that matters"
// ===========================================================================

test('W63 $240F62 priorities: rank(10) > player(2) > ledger(0), OUT OF THE ROM',
  { skip: haveTables ? false : 'no export' }, () => {
    // The priority is the dispatch table's own SECOND longword.  Reading it out
    // of the cartridge rather than asserting a literal is the whole point:
    // recon 38 7.1 held this table and read it as "not an order".
    const pri = (i) => rom.u32(0x240f62 + i * 8 + 4) >>> 16;
    assert.equal(pri(0), 0x09, 'object type 0 -- $28D520');
    assert.equal(pri(2), 0x1c, 'object type 2 -- $2491C0, P1');
    assert.equal(pri(3), 0x1b, 'object type 3 -- $249246, P2');
    assert.equal(pri(10), 0x1f, 'object type 10 -- $260794, THE RANK OBJECT');
    assert.ok(pri(10) > pri(2), 'the RANK object outranks the player');
    assert.ok(pri(2) > pri(0), 'the player outranks this object');
    // ...and the handler addresses, so a table that moved is caught here too.
    assert.equal(rom.u32(0x240f62 + 0 * 8), 0x28d520);
    assert.equal(rom.u32(0x240f62 + 2 * 8), 0x2491c0);
    assert.equal(rom.u32(0x240f62 + 10 * 8), 0x260794);
  });

test('W63 objectOrder reads the LIVE table, first slot per type', () => {
  const { ram } = fresh();
  const put = (slot, type) => ram.setU16(OBJ.base + slot * OBJ.stride, 0x8000 | type);
  put(0, 10); put(1, 2); put(2, 1); put(7, 0);
  const o = objectOrder(ram);
  assert.deepEqual(o, { rank: 0, player: 1, ledger: 7, background: 2 });
  assert.ok(o.rank < o.player && o.player < o.ledger);
});

// ===========================================================================
// 3. THE DRAIN, $2842B0
// ===========================================================================

test('W63 $28431E: FOUR `abcd` -- the BCD add carries in DECIMAL, not binary', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU32(HUDRAM.totalP1, 0x00000009);
  ram.setU32(HUDRAM.pendingP1, 0x00000001);
  drain2842B0(ram, rom, ctx);
  // 9 + 1 = $10 in BCD, NOT $0A.  A port that wrote `(a+b) & 0xff` gets $0A
  // and is right for every score below ten.
  assert.equal(ram.u32(HUDRAM.totalP1), 0x00000010);
});

test('W63 $284328/$284330: the BCD carry-out bumps $81B44C and PINS at $99999999', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU32(HUDRAM.totalP1, 0x99999999);
  ram.setU32(HUDRAM.pendingP1, 0x00000001);
  ram.setU16(HUDRAM.ovfP1, 0);
  drain2842B0(ram, rom, ctx);
  assert.equal(ram.u16(HUDRAM.ovfP1), 1, '$284328 addq.w #$1,(A6)');
  assert.equal(ram.u32(HUDRAM.totalP1), 0x00000000, 'and the total wrapped');
  // ...and at overflow digit 9 -> $A the whole thing pins.
  ram.setU16(HUDRAM.ovfP1, 9);
  ram.setU32(HUDRAM.totalP1, 0x99999999);
  ram.setU32(HUDRAM.pendingP1, 0x00000001);
  drain2842B0(ram, rom, ctx);
  assert.equal(ram.u16(HUDRAM.ovfP1), 9, '$284336 move.w #$9');
  assert.equal(ram.u32(HUDRAM.totalP1), 0x99999999, '$284330 move.l #$99999999');
});

test('W63 $284302: a player whose LIVES word is NEGATIVE loses the pending', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0xffff);                  // not playing
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU32(HUDRAM.pendingP1, 0x00001234);
  ram.setU32(HUDRAM.totalP1, 0);
  drain2842B0(ram, rom, ctx);
  assert.equal(ram.u32(HUDRAM.pendingP1), 0, '$284308 discards it');
  assert.equal(ram.u32(HUDRAM.totalP1), 0, '...and nothing reaches the total');
});

test('W63 $2842FE is BOTH a subroutine and a fall-through: BOTH players drain', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0);
  ram.setU32(HUDRAM.pendingP1, 0x00000011);
  ram.setU32(HUDRAM.pendingP2, 0x00000022);
  drain2842B0(ram, rom, ctx);
  assert.equal(ram.u32(HUDRAM.totalP1), 0x00000011);
  assert.equal(ram.u32(HUDRAM.totalP2), 0x00000022);
  assert.equal(ram.u32(HUDRAM.pendingP1), 0);
  assert.equal(ram.u32(HUDRAM.pendingP2), 0);
});

test('W63 $28434A/$284350: an EXTEND is capped at $14 lives and advances $81B4AC',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.aliveP1, 3);
    ram.setU16(HUDRAM.aliveP2, 0xffff);
    ram.setU32(HUDRAM.extendNextP1, 0x02000000);       // the seed's own DIP 0
    ram.setU16(HUDRAM.extendIdxP1, 0);
    ram.setU32(HUDRAM.totalP1, 0x01999999);
    ram.setU32(HUDRAM.pendingP1, 0x00000001);
    drain2842B0(ram, rom, ctx);
    assert.equal(ram.u32(HUDRAM.totalP1), 0x02000000, 'exactly at the threshold');
    assert.equal(ram.u16(HUDRAM.aliveP1), 4, '$284350 addq.w #$1,(A3)');
    // $286FDA: $28840E[0] is $03000000 and its bit 31 is CLEAR, so the cursor
    // goes to $C -- the $FFFFFFFF terminator -- and the next threshold is 5M.
    assert.equal(ram.u32(HUDRAM.extendNextP1), 0x05000000);
    assert.equal(ram.u16(HUDRAM.extendIdxP1), 0x0c, '$286FFE move.w #$C,(A4)');
    // ...and the SECOND extend reads the terminator and closes the door.
    ram.setU32(HUDRAM.pendingP1, 0x03000000);
    drain2842B0(ram, rom, ctx);
    assert.equal(ram.u16(HUDRAM.aliveP1), 5);
    assert.equal(ram.u32(HUDRAM.extendNextP1), 0xffffffff, '$286FF0');
  });

test('W63 $28434A: the LIVES CAP is $14 and it REFUSES rather than clamps',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.aliveP1, 0x14);
    ram.setU16(HUDRAM.aliveP2, 0xffff);
    ram.setU32(HUDRAM.extendNextP1, 0x00000001);
    ram.setU32(HUDRAM.totalP1, 0);
    ram.setU32(HUDRAM.pendingP1, 0x00000002);
    drain2842B0(ram, rom, ctx);
    assert.equal(ram.u16(HUDRAM.aliveP1), 0x14, 'still 20');
    // AND THE THRESHOLD DOES NOT MOVE EITHER -- `$28434E beq $28436E` jumps
    // past `$284352 bsr $286FDA`, so a capped player keeps the same threshold
    // and re-tests it every frame.  That is the cartridge, not an oversight.
    assert.equal(ram.u32(HUDRAM.extendNextP1), 0x00000001);
  });

test('W63 $2843A8: the digit machine, tail-entered, with leading zeros BLANK', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU32(HUDRAM.totalP1, 0);
  ram.setU32(HUDRAM.pendingP1, 0x00012345);
  drain2842B0(ram, rom, ctx);
  const rec = (k) => ({ dirty: ram.u16(0x81b4c8 + k * 0x0a),
    ch: ram.u16(0x81b4c8 + k * 0x0a + 6) });
  // Record 0 is the OVERFLOW digit and did not change, so the tail-entered loop
  // must never have touched it.  A port that started the loop at `$284404`
  // writes digit 1 here.
  assert.equal(rec(0).dirty, 0, 'record 0 (the overflow digit) untouched');
  assert.equal(rec(0).ch, 0);
  assert.equal(rec(1).dirty, 0, 'a leading zero is BLANK, not "0"');
  assert.equal(rec(2).dirty, 0);
  assert.equal(rec(3).dirty, 0);
  // ...and 1,2,3,4,5 land in records 4..8, `$C030 + digit` ($284438).
  for (const [k, d] of [[4, 1], [5, 2], [6, 3], [7, 4], [8, 5]]) {
    assert.equal(rec(k).dirty, 1, `record ${k} dirty`);
    assert.equal(rec(k).ch, 0xc030 + d, `record ${k} char`);
  }
});

test('W63 $28440E: an INTERIOR zero PRINTS -- only LEADING zeros are blanked', () => {
  // The fixture in the test above has no interior zero, so `d2 === 0 && d7 === 0`
  // and `d2 === 0` agree on every one of its digits: the leading-zero flag D7
  // was UNTESTABLE until this case existed.  Found by the mutant that survived.
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU32(HUDRAM.totalP1, 0);
  ram.setU32(HUDRAM.pendingP1, 0x00010305);   // 1, 0, 3, 0, 5 -- two interior 0s
  drain2842B0(ram, rom, ctx);
  const rec = (k) => ({ dirty: ram.u16(0x81b4c8 + k * 0x0a),
    ch: ram.u16(0x81b4c8 + k * 0x0a + 6) });
  assert.equal(rec(3).dirty, 0, 'the LEADING zero at record 3 is blank');
  assert.equal(rec(4).ch, 0xc031, 'the 1');
  assert.equal(rec(5).dirty, 1, 'the INTERIOR zero at record 5 is PRINTED');
  assert.equal(rec(5).ch, 0xc030, '...as the character "0"');
  assert.equal(rec(6).ch, 0xc033, 'the 3');
  assert.equal(rec(7).dirty, 1, 'the second interior zero is PRINTED too');
  assert.equal(rec(7).ch, 0xc030);
  assert.equal(rec(8).ch, 0xc035, 'the 5');
});

test('W63 $284412: a digit that becomes a LEADING ZERO is BLANKED, not left', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  // Pre-dirty record 1 as if a bigger score had been shown.
  ram.setU16(0x81b4c8 + 1 * 0x0a, 1);
  ram.setU16(0x81b4c8 + 1 * 0x0a + 6, 0xc039);
  ram.setU32(HUDRAM.totalP1, 0);
  ram.setU32(HUDRAM.pendingP1, 0x00000001);
  drain2842B0(ram, rom, ctx);
  assert.equal(ram.u16(0x81b4c8 + 1 * 0x0a + 6), 0, '$28441C clr.w $6(A0)');
  assert.equal(ram.u16(0x81b4c8 + 1 * 0x0a), 1, '...and $284418 marks it DIRTY');
});

test('W63 $28437C: the HIGH SCORE follows, and the OVERFLOW digit decides first', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU32(HUDRAM.hiScore, 0x99999999);
  ram.setU16(HUDRAM.ovfHi, 0);
  ram.setU32(HUDRAM.totalP1, 0x99999999);
  ram.setU16(HUDRAM.ovfP1, 0);
  ram.setU32(HUDRAM.pendingP1, 0x00000001);
  drain2842B0(ram, rom, ctx);
  // P1's overflow is now 1 and the high score's is 0, so the LONGWORD compare
  // at $284390 is never reached: $284388 copies the overflow across.
  assert.equal(ram.u16(HUDRAM.ovfHi), 1, '$284388 move.w (A6),$81B450');
  assert.equal(ram.u32(HUDRAM.hiScore), 0x00000000, '$28439A move.l D4,$81B448');
});

test('W63 $284384 is `bhi`, NOT `bcc`: an EQUAL overflow falls to the longwords', () => {
  // With the two overflow digits EQUAL, `bhi` falls through to $284390's
  // longword compare and `bcc` would return.  The test above has them
  // DIFFERENT, so it agrees with both readings -- found by the mutant that
  // survived it.  `docs/knowledge/03`: a fixture sitting where two readings
  // agree is not a check.
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU16(HUDRAM.ovfHi, 3);
  ram.setU16(HUDRAM.ovfP1, 3);                         // EQUAL
  ram.setU32(HUDRAM.hiScore, 0x00001000);
  ram.setU32(HUDRAM.totalP1, 0x00001000);
  ram.setU32(HUDRAM.pendingP1, 0x00000001);
  drain2842B0(ram, rom, ctx);
  assert.equal(ram.u32(HUDRAM.totalP1), 0x00001001);
  assert.equal(ram.u32(HUDRAM.hiScore), 0x00001001,
    'the high score followed -- $284384 fell THROUGH on equality');
  assert.equal(ram.u16(HUDRAM.ovfHi), 3, '...and $284388 was NOT taken');
  // ...and the other side of $284396's `bcc`: an equal LONGWORD does not write.
  ram.setU32(HUDRAM.pendingP1, 0);
  ram.setU32(HUDRAM.hiScore, 0x00009999);
  ram.setU32(HUDRAM.pendingP1, 0x00000001);
  drain2842B0(ram, rom, ctx);
  assert.equal(ram.u32(HUDRAM.hiScore), 0x00009999,
    '$284396 cmp.l D4,D0 / bcc -- the higher high score survives');
});

// ===========================================================================
// 4. THE PER-FRAME ROUTINE
// ===========================================================================

test('W63 $284468: the item drain is FOUR per frame and the fourth has no `beq`', () => {
  const { ram } = fresh();
  ram.setU16(HUDRAM.itemPending, 10);
  ram.setU16(HUDRAM.itemCount, 0);
  drainItems284468(ram);
  assert.equal(ram.u16(HUDRAM.itemCount), 4, 'at most four per frame');
  assert.equal(ram.u16(HUDRAM.itemPending), 6);
  // ...and exactly FOUR pending is drained in one frame, through the
  // fall-through rather than through a `beq`.
  ram.setU16(HUDRAM.itemPending, 4);
  ram.setU16(HUDRAM.itemCount, 0);
  drainItems284468(ram);
  assert.equal(ram.u16(HUDRAM.itemCount), 4);
  assert.equal(ram.u16(HUDRAM.itemPending), 0);
  // ...and ONE pending gives ONE, through the first `beq`.
  ram.setU16(HUDRAM.itemPending, 1);
  ram.setU16(HUDRAM.itemCount, 0);
  drainItems284468(ram);
  assert.equal(ram.u16(HUDRAM.itemCount), 1);
  assert.equal(ram.u16(HUDRAM.itemPending), 0);
  // ...and ZERO is the `$284468 tst.w / beq` at the top.
  ram.setU16(HUDRAM.itemPending, 0);
  ram.setU16(HUDRAM.itemCount, 7);
  drainItems284468(ram);
  assert.equal(ram.u16(HUDRAM.itemCount), 7, 'nothing pending, nothing added');
});

/** The minimum RAM `gates2844A6` needs to reach P1's chain meter. */
function playing(ram, meter) {
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.dfFlags, 0);
  ram.setU16(HUDRAM.p1.meter, meter);
}

test('W63 **$284636** -- THE CHAIN METER DECREMENT, and its zero arm', () => {
  const { ram, ctx } = fresh();
  playing(ram, 5);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.p1.meter), 4, '$284636 subq.w #$1,$81B5C0');
  // ...and at ONE it reaches zero and wipes the two accumulators.
  playing(ram, 1);
  ram.setU32(HUDRAM.p1.accA, 0xdeadbeef);
  ram.setU32(HUDRAM.p1.accB, 0xcafebabe);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.p1.meter), 0);
  assert.equal(ram.u32(HUDRAM.p1.accA), 0, '$284640 move.l D0,$81B5B8');
  assert.equal(ram.u32(HUDRAM.p1.accB), 0, '$284646 move.l D0,$81B5CE');
  // ...and at ZERO the block returns BEFORE the decrement, so it cannot wrap.
  playing(ram, 0);
  ram.setU32(HUDRAM.p1.accA, 0x1111);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.p1.meter), 0, '$284614 beq -- no wrap to $FFFF');
  assert.equal(ram.u32(HUDRAM.p1.accA), 0x1111, '...and no wipe either');
});

test('W63 $2847D4: P2 has its OWN meter and its own accumulators', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0xffff);
  ram.setU16(HUDRAM.aliveP2, 0);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.dfFlags, 0);
  ram.setU16(HUDRAM.p1.meter, 9);
  ram.setU16(HUDRAM.p2.meter, 9);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.p1.meter), 9, 'P1 is not playing -- $2844BE bmi');
  assert.equal(ram.u16(HUDRAM.p2.meter), 8, '$2847D4');
});

test('W63 $28461C/$284624: the hyper sub-tick, and it is a NO-OP at reload 0', () => {
  const { ram, ctx } = fresh();
  playing(ram, 20);
  ram.setU16(HUDRAM.p1.hyper, 1);                      // pretend a hyper is up
  ram.setU8(HUDRAM.p1.subReload, 0);                   // ...as every write does
  ram.setU8(HUDRAM.p1.subTick, 0);
  gates2844A6(ram, ctx);
  // recon 38 4.4: reload 0 => `subq.b #$1` always borrows => `bcc` never taken
  // => the decrement runs anyway.  The port transcribes the instructions.
  assert.equal(ram.u16(HUDRAM.p1.meter), 19, 'the drain is NOT throttled');
  assert.equal(counted(ctx, SUBTICK_IS_A_NO_OP), 0, 'and nothing is flagged');
  // ...and a NON-ZERO reload really does throttle it, AND is flagged loudly.
  playing(ram, 20);
  ram.setU16(HUDRAM.p1.hyper, 1);
  ram.setU8(HUDRAM.p1.subReload, 3);
  ram.setU8(HUDRAM.p1.subTick, 2);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.p1.meter), 20, 'held: $284624 bcc');
  assert.equal(ram.u8(HUDRAM.p1.subTick), 1);
  assert.equal(counted(ctx, SUBTICK_IS_A_NO_OP), 1,
    'the tap recon 38 4.4 asked for and nobody had run');
});

test('W63 $2845C4: the chain-BREAK popup countdown, its index and its speed', () => {
  const { ram, ctx } = fresh();
  playing(ram, 0);
  ram.setU16(HUDRAM.p1.popup, 3);
  ram.setU16(HUDRAM.p1.popupIdx, 7);
  ram.setU16(HUDRAM.p1.popupSpeed, 2);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.p1.popup), 2, '$2845CC subq.w #$1');
  assert.equal(ram.u16(HUDRAM.p1.popupIdx), 8, '$2845E0 addq.w #$1');
  assert.equal(ram.u16(HUDRAM.p1.popupSpeed), 1, '$284606 subq.w #$1');
  // ...and a ZERO speed is NOT decremented ($2845FE tst.w / beq).
  ram.setU16(HUDRAM.p1.popup, 3);
  ram.setU16(HUDRAM.p1.popupSpeed, 0);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.p1.popupSpeed), 0, 'not wrapped to $FFFF');
});

test('W63 $2844E8/$28453E: the HYPER label latch is set and cleared', () => {
  const { ram, ctx } = fresh();
  playing(ram, 0);
  ram.setU16(HUDRAM.p1.hyper, 1);
  ram.setU8(HUDRAM.p1.hyperShown, 0);
  gates2844A6(ram, ctx);
  assert.equal(ram.u8(HUDRAM.p1.hyperShown) & 1, 1, '$2844E8 bset.b #$0');
  assert.equal(counted(ctx, 0x240dc2), 2, 'the two labels print ONCE');
  gates2844A6(ram, ctx);
  assert.equal(counted(ctx, 0x240dc2), 2, '...and not again while it holds');
  ram.setU16(HUDRAM.p1.hyper, 0);
  gates2844A6(ram, ctx);
  assert.equal(ram.u8(HUDRAM.p1.hyperShown) & 1, 0, '$28453E bclr.b #$0');
});

// ===========================================================================
// 5. THE SLIDE-IN
// ===========================================================================

test('W63 $284CF2: the HUD slide-in counts $81B620 down and then clears $81B6EE',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.slideFlag, 1);
    ram.setU16(HUDRAM.bannerTimer, 0x30);              // the shipped seed's own
    ram.setU16(HUDRAM.aliveP1, 0);
    ram.setU16(HUDRAM.aliveP2, 0xffff);
    ram.setU8(HUDRAM.flags9, 0);
    ram.setU8(HUDRAM.dfFlags, 0);
    ram.setU8(HUDRAM.cursorTickB, 0x01);
    ram.setU8(HUDRAM.cursorReloadB, 0x01);
    let n = 0;
    while (ram.u16(HUDRAM.slideFlag) !== 0) {
      perFrame28444E(ram, rom, ctx);
      // BOUNDED, and the bound is ASSERTED below -- W62 11.1's own lesson: a
      // check that can hang is a check that cannot fail.
      if (++n > 200) break;
    }
    assert.equal(n, 49, '48 countdown frames and one settling frame');
    assert.equal(ram.u16(HUDRAM.bannerTimer), 0, '$81B620 is spent');
    assert.equal(ram.u16(HUDRAM.slideFlag), 0, '$284F6A clr.w $81B6EE');
  });

test('W63 $284CF2 gates the SKELETON: no decrement while $81B6EE is up',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.slideFlag, 1);
    ram.setU16(HUDRAM.bannerTimer, 0x30);
    playing(ram, 20);
    ram.setU8(HUDRAM.cursorTickB, 0x01);
    ram.setU8(HUDRAM.cursorReloadB, 0x01);
    perFrame28444E(ram, rom, ctx);
    assert.equal(ram.u16(HUDRAM.p1.meter), 20, '$28445C bra.w $284CF2');
  });

// ===========================================================================
// 6. THE TWO CURSORS, and the ROM extents they pin
// ===========================================================================

test('W63 $285F8A walks 64 entries of $287ECA, indexed by the FRAME COUNTER',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    ram.setU16(HUDRAM.slideFlag, 1);
    ram.setU16(HUDRAM.bannerTimer, 1);
    ram.setU16(HUDRAM.aliveP1, 0xffff);
    ram.setU16(HUDRAM.aliveP2, 0xffff);
    ram.setU8(HUDRAM.cursorTickB, 0x02);
    ram.setU8(HUDRAM.cursorReloadB, 0x02);
    const seen = new Set();
    for (let f = 0; f < 64; f++) {
      ram.setU16(HUDRAM.frameCounter, f);
      ram.setU16(HUDRAM.slideFlag, 1);
      ram.setU16(HUDRAM.bannerTimer, 1);
      perFrame28444E(ram, rom, ctx);
      seen.add(ram.u32(HUDRAM.cursorValA));
      // ...and the value is the CARTRIDGE's, at the address the ROM forms.
      assert.equal(ram.u32(HUDRAM.cursorValA), rom.u32(HUD.cursorTableA + f * 4));
    }
    assert.equal(seen.size, 64, 'all 64 distinct');
    // The mask is $3F, so frame 64 aliases frame 0 -- which is what makes the
    // table exactly 64 entries and not "however many a run reached".
    ram.setU16(HUDRAM.frameCounter, 64);
    ram.setU16(HUDRAM.slideFlag, 1);
    ram.setU16(HUDRAM.bannerTimer, 1);
    perFrame28444E(ram, rom, ctx);
    assert.equal(ram.u32(HUDRAM.cursorValA), rom.u32(HUD.cursorTableA));
  });

test('W63 $285F52 steps $81B59A DOWN by 4 and WRAPS TO $38 -- 15 entries',
  { skip: haveTables ? false : 'no export' }, () => {
    const { ram, ctx } = fresh();
    // reload 0 -- `subq.b #$1` borrows EVERY frame, so the cursor advances
    // every frame and fifteen calls walk the whole table exactly once.
    ram.setU8(HUDRAM.cursorTickB, 0x00);
    ram.setU8(HUDRAM.cursorReloadB, 0x00);
    ram.setU16(HUDRAM.cursorIdxB, 0x38);
    ram.setU16(HUDRAM.aliveP1, 0xffff);
    ram.setU16(HUDRAM.aliveP2, 0xffff);
    ram.setU8(HUDRAM.flags9, 0);
    ram.setU8(HUDRAM.dfFlags, 0);
    const seen = [];
    for (let i = 0; i < 15; i++) {
      perFrame28444E(ram, rom, ctx);
      seen.push(ram.u32(HUDRAM.cursorValB));
    }
    assert.equal(new Set(seen).size, 15, 'fifteen distinct longwords');
    assert.equal(seen[0], rom.u32(HUD.cursorTableB + 0x38), 'entry [14] first');
    assert.equal(seen[14], rom.u32(HUD.cursorTableB + 0), '...down to entry [0]');
    assert.equal(ram.u16(HUDRAM.cursorIdxB), 0x38, '$285F80 wraps back to $38');
  });

test('W63 the two cursor tables ABUT, which is what pins the first one',
  { skip: haveTables ? false : 'no export' }, () => {
    assert.equal(HUD.cursorTableB + 15 * 4, HUD.cursorTableA);
    // ...and both ends are inside the exported window, so a short window is a
    // LOUD NAMED THROW here rather than a silent zero on a player's machine.
    assert.doesNotThrow(() => rom.u32(HUD.cursorTableB));
    assert.doesNotThrow(() => rom.u32(HUD.cursorTableA + 63 * 4));
  });

test('W63 $28840E has FOUR entries and [3] is the $FFFFFFFF terminator',
  { skip: haveTables ? false : 'no export' }, () => {
    assert.equal(rom.u32(HUD.extendTable + 0x00), 0x03000000);
    assert.equal(rom.u32(HUD.extendTable + 0x04), 0x06000000);
    assert.equal(rom.u32(HUD.extendTable + 0x08), 0x01100000);
    assert.equal(rom.u32(HUD.extendTable + 0x0c), 0xffffffff);
    // $286FFE move.w #$C,(A4) names the LAST index, and entry [4] is CODE
    // (`lea $803824,A0`), which is why the window stops there.
    assert.throws(() => rom.u32(HUD.extendTable + 0x10), Unreached,
      'reading past the table is a LOUD NAMED THROW, not a fifth threshold');
  });

// ===========================================================================
// 7. THE THROWS -- every one carries its ROM address
// ===========================================================================

test('W63 THE HYPER throws by address, and its TWO GUARDS are the cartridge\'s', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.slideFlag, 0);
  ram.setU16(HUDRAM.aliveP1, 0xffff);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.dfFlags, 0);
  ram.setU8(HUDRAM.cursorTickB, 0x02);
  ram.setU8(HUDRAM.cursorReloadB, 0x02);
  // Guard 1: $81B63E non-zero -> $285A96, the per-frame TAIL.
  ram.setU16(HUDRAM.hyperActiveP1, 1);
  assert.throws(() => perFrame28444E(ram, rom, ctx),
    (e) => e instanceof Unreached && e.romAddress === HUD.hyperTailP1);
  ram.setU16(HUDRAM.hyperActiveP1, 0);
  // Guard 2: $81B658 non-zero -> the ACTIVATION, and with it $285A62's RANK GAIN.
  ram.setU16(HUDRAM.hyperReqP1, 1);
  assert.throws(() => perFrame28444E(ram, rom, ctx),
    (e) => e instanceof Unreached && e.romAddress === HUD.hyperActP1);
  ram.setU16(HUDRAM.hyperReqP1, 0);
  // Guard 3: the hyper-END FLASH, whose one producer is $285AFC.
  ram.setU16(HUDRAM.flashTimerP1, 0x48);
  assert.throws(() => perFrame28444E(ram, rom, ctx),
    (e) => e instanceof Unreached && e.romAddress === HUD.flashBodyP1);
  ram.setU16(HUDRAM.flashTimerP1, 0);
  // ...and P2's three are DIFFERENT addresses, not the same routine twice.
  ram.setU16(HUDRAM.hyperActiveP2, 1);
  assert.throws(() => perFrame28444E(ram, rom, ctx),
    (e) => e instanceof Unreached && e.romAddress === HUD.hyperTailP2);
  assert.notEqual(HUD.hyperTailP1, HUD.hyperTailP2);
  ram.setU16(HUDRAM.hyperActiveP2, 0);
  // ...and with all three guards clear, NOTHING throws.
  assert.doesNotThrow(() => perFrame28444E(ram, rom, ctx));
});

test('W63 THE STAGE-CLEAR TALLY: the guard returns, and past it is a throw', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0xffff);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.dfFlags, 0);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.flags8, 0x08);              // $284B5E btst #$3 -- W62's bit
  assert.doesNotThrow(() => gates2844A6(ram, ctx),
    '$2853D2 btst #$3,$8130F9 / beq.b $2853D0 -- the bare rts two bytes before');
  ram.setU8(HUDRAM.flags9, 0x08);              // ...only $28DB52 can do this
  assert.throws(() => gates2844A6(ram, ctx),
    (e) => e instanceof Unreached && e.romAddress === HUD.tallyBody);
});

test('W63 THE BOSS HP BAR refuses a NULL $81B62A by address, not by reading 0', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0xffff);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.flags8, 0);
  ram.setU8(HUDRAM.flags9, 0x01);              // a boss is up -> $2847FE
  ram.setU8(HUDRAM.bannerFlagsBoss, 0x80);     // ...and the banner is finished
  ram.setU32(HUDRAM.bossHpPtr, 0);
  assert.throws(() => gates2844A6(ram, ctx),
    (e) => e instanceof Unreached && e.romAddress === HUD.bossBar);
  // ...and with the pointer $2927BA WOULD have written, it does not throw.
  ram.setU32(HUDRAM.bossHpPtr, 0x810000);
  ram.setU32(0x810000, 0x80000000);            // $284A46 bmi -> $284AB6
  assert.doesNotThrow(() => gates2844A6(ram, ctx));
  assert.equal(BOSS_TAIL, 0x292794, 'the address a later wave has to port');
});

// ===========================================================================
// 8. THE STAGE-CLEAR BANNER -- the arm W62 opened
// ===========================================================================

test('W63 $2847FE forks on $8130F8 bit 3: $242958\'s bit picks the CLEAR banner', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0xffff);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.dfFlags, 0x08);             // $28D58E -- W62's own bset
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.flags8, 0x08);              // $242958 bset #$3
  ram.setU8(HUDRAM.bannerFlagsClear, 0);
  ram.setU8(HUDRAM.bannerFlagsBoss, 0);
  // THREE FRAMES, because the three `bset`s at $284B82/$284BA4/$284BAE take one
  // frame EACH: each one's `beq` reads the OLD bit, and while it is clear the
  // arm falls to $284BCC bclr #$0 -- which RE-SEEDS the three timers on the
  // next frame.  A one-frame fixture cannot see that (W61 M20/M21/M22).
  gates2844A6(ram, ctx);
  assert.equal(ram.u8(HUDRAM.bannerFlagsClear), 0x02,
    'frame 1: bit 1 only -- $284BAC beq takes $284BCC before $284BAE runs');
  assert.equal(ram.u16(HUDRAM.bannerTimer), 0x38 - 1, '$284B8C then $284C2A');
  // $2851D2's gate is `btst #$3,$81B61F` and bit 3 is NOT set, so $2851F8 does
  // NOT run and only the TAIL $2853C0 does.  The two sub-counters are NOT
  // interchangeable and this is where that shows.
  assert.equal(ram.u16(HUDRAM.bannerSubB), 0x10, '$284B94, and $2851F8 SKIPPED');
  assert.equal(ram.u16(HUDRAM.bannerSubA), 0x08 - 1, '$284B9C then $2853C0');

  gates2844A6(ram, ctx);
  assert.equal(ram.u8(HUDRAM.bannerFlagsClear), 0x06,
    'frame 2: bit 2 joins it, and bit 0 is cleared again');
  assert.equal(ram.u16(HUDRAM.bannerTimer), 0x38 - 1,
    '...and $284B8C RE-SEEDS the timer, so frame 2 is not frame 1 + 1');

  gates2844A6(ram, ctx);
  assert.equal(ram.u8(HUDRAM.bannerFlagsClear), 0x07,
    'frame 3: bit 0 STICKS at last, and the label prints');
  assert.equal(counted(ctx, 0x240ebc), 1, '$284BC4 jsr $240EBC, ONCE');
  assert.equal(ram.u16(HUDRAM.bannerTimer), 0x38 - 1,
    '...and only now does $284C2A start counting from a timer nothing re-seeds');
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.bannerTimer), 0x38 - 2, 'frame 4: it MOVES');
  assert.equal(counted(ctx, 0x240ebc), 1, '...and the label does not reprint');
  assert.equal(ram.u8(HUDRAM.bannerFlagsBoss), 0, 'the BOSS banner is untouched');
});

test('W63 $284B72: the finished CLEAR banner REJOINS the skeleton, same frame', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.dfFlags, 0x08);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.flags8, 0x08);
  ram.setU8(HUDRAM.bannerFlagsClear, 0x80);    // $284B6C tst.b / bmi $2844BE
  ram.setU16(HUDRAM.p1.meter, 9);
  gates2844A6(ram, ctx);
  // THIS IS THE ONE THAT MATTERS: a port that returned here instead of
  // rejoining would stop both chain meters for the rest of the stage.
  assert.equal(ram.u16(HUDRAM.p1.meter), 8, '$284636 still ran');
});

test('W63 $284C7A: the finished banner clears THREE popup words, asymmetrically', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0xffff);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.dfFlags, 0x08);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.flags8, 0x08);
  ram.setU8(HUDRAM.bannerFlagsClear, 0x08);    // bit 3 -> $284C48
  ram.setU16(HUDRAM.itemCount, 0);             // ...and no items -> $284C7A
  ram.setU16(HUDRAM.popupTimerP1, 0x11);
  ram.setU16(HUDRAM.popupTimerP2, 0x22);
  ram.setU16(HUDRAM.p1.popup, 0x33);
  ram.setU16(HUDRAM.p2.popup, 0x44);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.popupTimerP1), 0, '$284C82 clr.w $81B5C2');
  assert.equal(ram.u16(HUDRAM.popupTimerP2), 0, '$284C88 clr.w $81B5EC');
  assert.equal(ram.u16(HUDRAM.p1.popup), 0, '$284C8E clr.w $81B5C8');
  // ...and P2's own $81B5F2 is NOT cleared.  The asymmetry is the cartridge's;
  // a port that "tidied" it into a loop over both players would invent a write.
  assert.equal(ram.u16(HUDRAM.p2.popup), 0x44, '$81B5F2 is NOT in the list');
  assert.equal(ram.u8(HUDRAM.bannerFlagsClear) & 0x80, 0x80, '$284C7A bset #$7');
});

test('W63 $2877B8: three writes, and $284B28 reaches it only at itemCount 0', () => {
  const { ram, ctx } = fresh();
  ram.setU16(HUDRAM.aliveP1, 0xffff);
  ram.setU16(HUDRAM.aliveP2, 0xffff);
  ram.setU8(HUDRAM.dfFlags, 0);
  ram.setU8(HUDRAM.flags9, 0);
  ram.setU8(HUDRAM.flags8, 0x04);              // $284AB6 btst #$2 -- $29279C's
  ram.setU16(HUDRAM.itemCount, 1);
  ram.setU16(HUDRAM.itemTimer, 1);
  ram.setU16(HUDRAM.attract, 1);
  ram.setU16(HUDRAM.attract2, 0);
  gates2844A6(ram, ctx);
  assert.equal(ram.u16(HUDRAM.itemCount), 0xffff, '$2877B8');
  assert.equal(ram.u16(HUDRAM.itemDir), 0x17, '$2877C2');
  assert.equal(ram.u16(HUDRAM.itemTimer), 0x17, '$2877C8');
});

// ===========================================================================
// 9. THE DRAWS ARE COUNTED, NEVER SILENT
// ===========================================================================

test('W63 every DRAW is a NOTE with its own address, not a silent skip', () => {
  const { ram, ctx } = fresh();
  playing(ram, 3);
  gates2844A6(ram, ctx);
  assert.ok(counted(ctx, 0x285c5e) > 0, 'P1s HUD panel $285C5E');
  assert.ok(counted(ctx, 0x286040) > 0, 'the high-water row $286040');
  assert.ok(counted(ctx, 0x2859dc) > 0, 'the chain-meter bar $2859DC');
  // ...and each note carries what it would have drawn, so a reader of the log
  // learns the subsystem and not just the address.
  const k = [...ctx.unportedLog.calls.keys()].find((s) => s.startsWith('$285C5E '));
  assert.match(k, /ZERO RAM writes/);
});
