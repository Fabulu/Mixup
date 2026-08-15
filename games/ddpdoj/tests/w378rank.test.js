// W378 -- THE RANK BASE POINTER $81315C WAS NULL ON A COLD BOOT.
//
// Four frames after a P1 START on a cold board the run died:
//
//   Unreached UNPORTED $0: byte at $0 is outside every ROM window
//     at recompute2608D2 (src/rank.js:127)   <- rom.u8(ram.u32($81315C) + stage)
//     at perFrame2607A8  (src/rank.js:268)
//     at rankObject      (src/rank.js:316)
//
// TWO SEPARATE DEFECTS PUT IT THERE, and both are fixed here.
//
//  1. `$81315C` had NO WRITER IN THE PORT. It has exactly one in the cartridge: [M] the
//     longword `0081315C` occurs four times in the 6 MiB image ($15FC20 and $15FC28, the
//     build-A twin; $2608CC and $2608D4), and only `$2608CA move.l (A0),$81315C` -- inside
//     `$26089E` -- is a write. `$26089E` is reached from `$260578 jsr` at the tail of
//     `$26051A`, from `$26059A bsr` inside `$260580`, from `$26077E bsr.w` at the tail of
//     `$26070C`, the one-shot handoff `objslot17.js` ports as `handoff26070C` and whose
//     `$260580` tail it counts instead of running.
//
//  2. **THE CARTRIDGE NEVER LETS THE RECOMPUTE RUN THAT EARLY.** `$260666 move.w
//     #$1,$813082`, in the state-0 INIT, raises the very gate `$2607A8 tst.w $813082 / bne
//     $260808` tests, and the only thing that lowers it is `$26071A clr.w $813082` -- the
//     FIRST instruction of the same handoff that ends at `$26089E`. So on a board the rank
//     body is switched off from the frame slot [9] creates the object until the pointer
//     exists. The port deferred the entire INIT, so the gate stayed 0.
//
// SECTION 1 is the headline and it drives the real path: cold `Game`, `boot()`, the coinage
// dip, a coin on `$C08004`, a P1 START on the port word, and 300 frames past the crash
// frame. Ablate `rankInit2605C8`'s `ram.setU16(RANK.gate813082, 1)` and it fails by
// THROWING the Unreached above.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import {
  RANK, RANKBASE, STAGESTART, RANK_DEVIATION,
  installRankBase26089E, stageStart260580, stageClear2604F4, recompute2608D2,
} from '../src/rank.js';
import { ALLOC } from '../src/objalloc.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));
const IMG = readFileSync(fileURLToPath(new URL('../rip/sound/maincpu.bin', import.meta.url)));

const COINAGE = 0x803957;                       // see w377coin.test.js -- the service dip
const NO_PLAYER = 0xffff;
const P1_START = 0xfffe;                        // render.test.js portWordFromBits([BIT.start])

const coldGame = () => new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });
const coinWord = (...names) => {
  let w = 0xffff;
  for (const n of names) w &= ~(1 << COIN_BITS[n]) & 0xffff;
  return w;
};

/** Cold boot -> credit -> P1 START, exactly the sequence the brief names. Returns the Game
 *  standing on the frame the crash used to be four frames away from. */
function coldToStart() {
  const g = coldGame();
  g.boot();
  g.ram.setU8(COINAGE, 1);
  const run = (word, n, p = NO_PLAYER) => {
    g.coinPort = word;
    for (let i = 0; i < n; i++) g.step(p);
  };
  run(COIN.idle, 305);                          // the warning screen's $12C timeout
  run(coinWord('COIN1'), 12);                   // hold
  run(COIN.idle, 12);                           // release -- the credit lands
  assert.equal(g.ram.u8(COIN.creditA + 2), 1, 'the coin credited');
  g.coinPort = COIN.idle;
  for (let i = 0; i < 8; i++) g.step(P1_START); // P1 joins
  return g;
}

/** The ctx the object driver builds, as far as this chain reads it: the counted log under
 *  BOTH names (`main.js` aliases them) and the PaletteState `$2414BE` installs through. */
const ctxOf = (g) => ({
  unportedLog: g.unportedLog, unported: g.unportedLog, palette: g.palette, rom: g.rom,
});

const noteKeys = (g, addr) =>
  [...g.unportedLog.calls.keys()].filter((k) => k.startsWith(`$${addr.toString(16).toUpperCase()} `));

// =================================================================================================
// 1 -- THE HEADLINE. THE REAL PATH, AND IT NO LONGER THROWS.
//
// ABLATION, run before this was written: comment out `ram.setU16(RANK.gate813082, 1)` in
// `rankInit2605C8` (src/rank.js, the `$260666` line) and this test fails with
//
//   Unreached: UNPORTED $0: byte at $0 is outside every ROM window ...
//       at recompute2608D2 (src/rank.js:127)  at perFrame2607A8  at rankObject
//
// on the fourth `g.step()` after START. That is the exact stack the brief quoted.
// =================================================================================================

test('W378 a cold boot + coin + P1 START runs on past the rank recompute instead of throwing',
  () => {
    const g = coldToStart();
    for (let i = 0; i < 300; i++) g.step(NO_PLAYER);   // the crash was at +4

    assert.equal(g.ram.u16(RANK.gate813082), 1,
      '$260666 raised $813082, so $2607A8 takes `bne $260808` and the body is OFF');
    assert.equal(g.ram.u32(RANK.basePtr), 0,
      'and $81315C is STILL 0, which is faithful: only $26070C installs it and slot [9] '
      + 'has not reached $25D662 yet. The gate is what makes that safe, not a default');
    assert.equal(g.ram.u32(RANK.clock), 0,
      'the gated body never reached $2607E4, so the rank clock did not advance either');
  });

test('W378 the gate the INIT raises is the SAME word the per-frame body tests', () => {
  // A guard that happened to sit somewhere else would pass the test above and be a lie.
  assert.equal(RANK.gate813082, 0x813082, '$2607A8 tst.w $813082');
  // TRAP 1: the IMMEDIATE comes BEFORE the displacement, so `33FC 0001 00813082` puts the
  // address at $26066A and not at $260668.
  assert.equal(IMG.readUInt16BE(0x260666), 0x33fc, '$260666 move.w #imm,abs.l');
  assert.equal(IMG.readUInt16BE(0x260668), 0x0001, '  ...the immediate $1');
  assert.equal(IMG.readUInt32BE(0x26066a), 0x00813082, '  ...and THEN $813082');
  assert.equal(IMG.readUInt16BE(0x2607a8), 0x4a79, '$2607A8 tst.w');
  assert.equal(IMG.readUInt32BE(0x2607aa), 0x00813082, '  ...of $813082');
  assert.equal(IMG.readUInt16BE(0x26071a), 0x4279, '$26071A clr.w -- the one lowering');
  assert.equal(IMG.readUInt32BE(0x26071c), 0x00813082, '  ...of the same word');
});

// =================================================================================================
// 2 -- THE INIT IS NOW A PORT, NOT A BLANKET SKIP, AND EVERY CALL IT STILL CANNOT MAKE IS
//      COUNTED AT ITS OWN SITE.
// =================================================================================================

test('W378 the state-0 INIT does its own writes and counts its ten unread callees by address',
  () => {
    const g = coldToStart();
    for (let i = 0; i < 30; i++) g.step(NO_PLAYER);

    assert.equal(g.ram.u16(RANK.gate813082), 1, '$260666 clr/set: the gate');
    assert.equal(g.ram.u16(STAGESTART.wordD6), 0, '$260660 clr.w $813080');

    // $2606CE bsr $25FD0C -- the stage counter, from ($4,A5). A cold slot has 0 = stage 1.
    assert.equal(g.ram.u16(RANK.stageIdx), 0, '$25FD0C wrote $813092');
    assert.equal(g.ram.u16(0x813094), 0, '  ...and $813094');
    assert.equal(g.ram.u16(0x813096), 0, '  ...and $813096');

    // The ten calls that are still deferred on the loop-1 arm ($2606E8..$2606FA run because
    // $813098 is 0 on a cold board, so all ten are reached).
    for (const [site, target] of [
      [0x2605ce, 0x259c4a], [0x260678, 0x2603da], [0x2606d2, 0x28d552],
      [0x2606d8, 0x28ebfe], [0x2606e8, 0x27f87c], [0x2606ee, 0x2884e2],
      [0x2606f4, 0x287024], [0x2606fa, 0x24a810], [0x260700, 0x25fe42],
      [0x260704, 0x288574],
    ]) {
      const keys = noteKeys(g, target);
      assert.equal(keys.length, 1,
        `exactly one deferral for $${target.toString(16).toUpperCase()}`);
      assert.ok(keys[0].includes(`$${site.toString(16).toUpperCase()}`),
        `and it names the call site $${site.toString(16).toUpperCase()}`);
      assert.equal(g.unportedLog.calls.get(keys[0]), 1,
        'the INIT runs ONCE -- the state byte latches it, so this is not per-frame spam');
    }
    assert.match(RANK_DEVIATION[0x2605c8], /PARTIAL/, 'the summary says what is left');
  });

// =================================================================================================
// 3 -- $26089E, THE ONLY WRITER, AGAINST THE RAW BYTES.
// =================================================================================================

test('W378 $26089E is the ONLY write of $81315C in the 6 MiB image', () => {
  const hits = [];
  for (let a = 0; a + 4 <= IMG.length; a++) {
    if (IMG.readUInt32BE(a) === 0x0081315c) hits.push(a);
  }
  assert.deepEqual(hits, [0x15fc20, 0x15fc28, 0x2608cc, 0x2608d4],
    'four occurrences of the operand, and no more');
  // $2608CC is the operand of $2608CA `move.l (A0),$81315C` -- the write.
  assert.equal(IMG.readUInt16BE(0x2608ca), 0x23d0, '$2608CA move.l (A0),$81315C.l');
  // $2608D4 is the operand of the recompute's own read.
  assert.equal(IMG.readUInt16BE(0x2608d2), 0x2079, '$2608D2 movea.l $81315C.l,A0');
  // $15FC1E / $15FC26 are the same two instructions in the build-A half of the image.
  assert.equal(IMG.readUInt16BE(0x15fc1e), 0x23d0, '$15FC1E -- the build-A twin write');
  assert.equal(IMG.readUInt16BE(0x15fc26), 0x2079, '$15FC26 -- the build-A twin read');
});

test('W378 $26089E disassembles exactly as installRankBase26089E is written', () => {
  const words = [
    [0x26089e, 0x7000],                                       // moveq #$0,D0
    [0x2608a0, 0x1039], [0x2608a2, 0x0080], [0x2608a4, 0x380c],  // move.b $80380C,D0
    [0x2608a6, 0x4a79], [0x2608a8, 0x0080], [0x2608aa, 0x3926],  // tst.w $803926
    [0x2608ac, 0x6700], [0x2608ae, 0x0006],                   // beq.w $2608B4
    [0x2608b0, 0x103c], [0x2608b2, 0x0001],                   // move.b #$1,D0
    [0x2608b4, 0xd040],                                       // add.w D0,D0
    [0x2608b6, 0x41fa], [0x2608b8, 0xffde],                   // lea (-$22,PC),A0
    [0x2608ba, 0xd0c0],                                       // adda.w D0,A0
    [0x2608bc, 0x33d0], [0x2608be, 0x0081], [0x2608c0, 0x3160],  // move.w (A0),$813160
    [0x2608c2, 0xd040],                                       // add.w D0,D0
    [0x2608c4, 0x41fa], [0x2608c6, 0xffc0],                   // lea (-$40,PC),A0
    [0x2608c8, 0xd0c0],                                       // adda.w D0,A0
    [0x2608ca, 0x23d0], [0x2608cc, 0x0081], [0x2608ce, 0x315c],  // move.l (A0),$81315C
    [0x2608d0, 0x4e75],                                       // rts -- TWO bytes, and the end
  ];
  for (const [a, w] of words) {
    assert.equal(IMG.readUInt16BE(a), w, `$${a.toString(16).toUpperCase()}`);
  }
  // TRAP 4: `lea (d16,PC),An` is the EXTENSION WORD's address plus the displacement.
  assert.equal(0x2608b8 + ((0xffde << 16) >> 16), RANKBASE.wordTable, '$2608B6 -> $260896');
  assert.equal(0x2608c6 + ((0xffc0 << 16) >> 16), RANKBASE.ptrTable, '$2608C4 -> $260886');
  // TRAP 5: the routine ENDS at the two-byte rts, so it is 52 bytes.
  assert.equal(RANKBASE.rts - RANKBASE.addr + 2, RANKBASE.bytes, '$26089E..$2608D0 = $34 B');
});

test('W378 the three table bounds come from addresses the CODE computes, not from run length',
  () => {
    // The longword table's four entries ARE the four base tables, six apart...
    for (let i = 0; i < RANKBASE.ptrEntries; i++) {
      assert.equal(IMG.readUInt32BE(RANKBASE.ptrTable + i * 4), RANKBASE.baseTables[i],
        `pointer entry ${i}`);
    }
    // ...and the last of them ends AT the longword table's own base.
    const last = RANKBASE.baseTables[RANKBASE.ptrEntries - 1];
    assert.equal(last + RANKBASE.baseStride, RANKBASE.ptrTable,
      '$260880 + 6 == $260886, which is what fixes the base tables at six bytes and four');
    assert.equal(RANKBASE.baseTables[0] + RANKBASE.baseBytes, RANKBASE.ptrTable,
      'so the four tables fill $26086E..$260885 exactly');
    // The longword table ends where the word table begins: $10 = four longwords.
    assert.equal(RANKBASE.ptrTable + RANKBASE.ptrBytes, RANKBASE.wordTable);
    assert.equal(RANKBASE.ptrBytes / 4, RANKBASE.ptrEntries);
    // The word table ends at the routine's own first instruction: $8 = four words.
    assert.equal(RANKBASE.wordTable + RANKBASE.wordBytes, RANKBASE.addr);
    assert.equal(RANKBASE.wordBytes / 2, RANKBASE.wordEntries);
    assert.deepEqual([0, 1, 2, 3].map((i) => IMG.readUInt16BE(RANKBASE.wordTable + i * 2)),
      [0xffff, 0x0000, 0x0001, 0x0002], 'the four difficulty words');
    assert.deepEqual([...IMG.subarray(0x260874, 0x26087a)], [0x34, 0x44, 0x54, 0x64, 0x64, 0],
      'W127 measured table 1 and it is unchanged -- the W127 window is not touched');
    assert.deepEqual([...IMG.subarray(0x26086e, 0x260874)], [0x10, 0x10, 0x18, 0x20, 0x20, 0],
      'and table 0, which W127 called "the rank object\'s own code". It is not code');
  });

test('W378 installRankBase26089E picks the table the config byte names, and $803926 pins index 1',
  () => {
    const g = coldToStart();
    const cases = [
      [0, 0, 0x26086e, 0xffff, 'a COLD board: $80380C = 0, so table 0'],
      [1, 0, 0x260874, 0x0000, 'index 1 is the table rip/web/seed.bin carries'],
      [2, 0, 0x26087a, 0x0001, 'index 2'],
      [3, 0, 0x260880, 0x0002, 'index 3'],
      [3, 1, 0x260874, 0x0000, '$2608B0 move.b #$1,D0 OVERRIDES a config byte of 3'],
      [0, 0x8000, 0x260874, 0x0000, '  ...and it is tst.w, so any non-zero bit counts'],
    ];
    for (const [cfg, force, want, wantWord, why] of cases) {
      g.ram.setU8(RANKBASE.cfg, cfg);
      g.ram.setU16(RANKBASE.force, force);
      g.ram.setU32(RANKBASE.ptrOut, 0);
      g.ram.setU16(RANKBASE.wordOut, 0xdead);
      installRankBase26089E(g.ram, g.rom);
      assert.equal(g.ram.u32(RANKBASE.ptrOut), want, why);
      assert.equal(g.ram.u16(RANKBASE.wordOut), wantWord, `${why} -- and $813160`);
    }
  });

test('W378 the installed pointer makes the recompute produce the base byte, not a throw', () => {
  const g = coldToStart();
  g.ram.setU8(RANKBASE.cfg, 1);                 // the configured board rip/web/seed.bin was
  g.ram.setU16(RANKBASE.force, 0);
  installRankBase26089E(g.ram, g.rom);
  g.ram.setU32(RANK.clock, 0x0000017f);         // the seed's own clock: >>8 = 1
  g.ram.setU16(RANK.stageIdx, 0);
  recompute2608D2(g.ram, g.rom);
  assert.equal(g.ram.u16(RANK.rankOut), 0x35,
    '$34 (base[0] of $260874) + 1 = $35, which is the value the seed carries at $81309E');
  // POSITIVE CONTROL for the ablation below: with the pointer back at 0 it throws again.
  g.ram.setU32(RANK.basePtr, 0);
  assert.throws(() => recompute2608D2(g.ram, g.rom), /outside every\s+ROM window/,
    'a null pointer is still a loud throw -- nothing here defaults or guards it');
});

// =================================================================================================
// 4 -- THE CHAIN. $260580 -> $26051A -> $26089E, DRIVEN OFF THE REAL COLD-BOOT MACHINE.
//
// `handoff26070C` (objslot17.js) still NOTES `$260580` rather than calling it -- objslot17.js is
// not this unit's file. This drives `stageStart260580` with exactly the two registers `$26077E`
// hands it (`$260778 move.w $813080,D6` and the `$38`/0 D7 from `$260764`..`$260774`) and shows
// the chain lands the pointer.
// =================================================================================================

test('W378 stageStart260580 runs the four bsr\'s and ends with $81315C installed', () => {
  const g = coldToStart();
  assert.equal(g.ram.u32(RANK.basePtr), 0, 'POSITIVE CONTROL: nothing has installed it yet');
  const idsBefore = g.ram.u16(ALLOC.createSp);

  stageStart260580(g.ram, g.rom, ctxOf(g), 0x0000, 0x0038);

  assert.equal(g.ram.u16(STAGESTART.zeroWord), 0, '$260580 clr.w $81296E');
  assert.equal(g.ram.u16(STAGESTART.wordD7), 0x0038, '$260586 move.w D7,$81307E');
  assert.equal(g.ram.u16(STAGESTART.wordD6), 0x0000, '$26058C move.w D6,$813080');
  // $260596 bsr $25FD24 -- 22 words from $8130CE. Proved by writing over one of them first
  // would need a second run; the pointer is what this test is for.
  assert.equal(g.ram.u32(RANK.basePtr), 0x26086e,
    '$26059A -> $260578 -> $2608CA installed the base table for config byte 0');
  assert.equal(g.ram.u16(RANKBASE.wordOut), 0xffff, '  ...and $2608BC wrote $813160');
  // $26051A staged TWO creates ($241182 x2) and kept their IDs.
  assert.equal(g.ram.u16(ALLOC.createSp), idsBefore + 2 * ALLOC.stride,
    'two records staged: dispatch types 5 and 1');
  assert.notEqual(g.ram.u32(STAGESTART.id5), 0, '$260524 move.l D0,$813148 -- a real handle');
  assert.notEqual(g.ram.u32(STAGESTART.id1), 0, '$260534 move.l D0,$813144');
  assert.notEqual(g.ram.u32(STAGESTART.id5), g.ram.u32(STAGESTART.id1),
    'and $2411BE increments before it stores, so the two differ');

  // $26053A move.w $81307E,($6,A0) -- through the record the SECOND $241182 staged, which is
  // the one whose handle went to $813144. Trap 11: A0 is $241182's, not the caller's.
  const rec1 = ALLOC.createStage + idsBefore + ALLOC.stride;
  assert.equal(g.ram.u16(rec1 + ALLOC.idOff + 2), g.ram.u16(STAGESTART.id1 + 2),
    'that record IS the type-1 one');
  assert.equal(g.ram.u16(rec1 + STAGESTART.childField), 0x0038,
    'and $81307E landed on it, not on the caller\'s A5');

  // And now the recompute the whole unit is about runs clean instead of throwing.
  assert.doesNotThrow(() => recompute2608D2(g.ram, g.rom),
    'the recompute has a pointer to follow now');
  assert.equal(g.ram.u16(RANK.rankOut), 0x10,
    'base[0] of $26086E is $10 and the clock is still 0');

  // NOT a whole `g.step()`, and the reason is worth writing down: `$26051A`'s two `$241182`
  // creates are REAL, so the next frame's object driver reaches DISPATCH TYPE 5's state 0
  // and throws `UNPORTED $28B5A8: object type 5's "not started" branch`. That is the wall
  // immediately behind this chain, and it is why `handoff26070C` calling `stageStart260580`
  // is a separate decision from porting the chain -- see the report for this wave.
  const before = g.ram.u16(ALLOC.createSp);
  assert.ok(before > 0, 'the two staged creates are still pending in the queue');
});

test('W378 $260542\'s gate is D6, and it decides both $2603FE and the six extra kills', () => {
  // D6 non-zero: $26051A takes the $2603FE arm (counted) and CLEARS $813080 itself, and
  // $2604F4 takes its `bsr.b $2604AA` arm -- eight queued kills instead of two.
  for (const [d6, wantNotes, wantKills] of [[0x0000, 0, 2], [0x0001, 1, 8]]) {
    const g = coldToStart();
    g.ram.setU16(ALLOC.killSp, 0);
    stageStart260580(g.ram, g.rom, ctxOf(g), d6, 0);
    assert.equal(noteKeys(g, STAGESTART.pairSite).length, wantNotes,
      `D6 = ${d6}: $2603FE counted ${wantNotes} time(s)`);
    assert.equal(g.ram.u16(ALLOC.killSp) / ALLOC.stride, wantKills,
      `D6 = ${d6}: $2604F4 queued ${wantKills} kills`);
    assert.equal(g.ram.u16(STAGESTART.wordD6), 0,
      '$26055C clears it on the taken arm, and it was already 0 on the other');
  }
});

test('W378 stageClear2604F4 walks $2604AA in the ROM\'s A2/A3/A2/A3/A2/A3 order', () => {
  const g = coldToStart();
  g.ram.setU16(ALLOC.killSp, 0);
  g.ram.setU16(STAGESTART.wordD6, 1);           // open the $260516 bsr.b arm
  const seen = [];
  for (const [i, a] of [STAGESTART.id5, STAGESTART.id1].entries()) g.ram.setU32(a, 0x100 + i);
  for (const [i, off] of STAGESTART.killOffs.entries()) {
    g.ram.setU32(STAGESTART.killIdA + off, 0x200 + i);
    g.ram.setU32(STAGESTART.killIdB + off, 0x300 + i);
  }
  stageClear2604F4(g.ram);
  for (let s = 0; s < g.ram.u16(ALLOC.killSp); s += ALLOC.stride) {
    seen.push(g.ram.u32(ALLOC.killQueue + s));
  }
  assert.deepEqual(seen, [0x100, 0x101, 0x200, 0x300, 0x201, 0x301, 0x202, 0x302],
    '$813148, $813144, then ($18,A2) ($18,A3) ($1C,A2) ($1C,A3) ($20,A2) ($20,A3)');
  // `61 92` at $260516 is an EIGHT-BIT bsr, so its target is $260518 - $6E and not
  // $260516 - $6E. If it were the latter the six kills above would not be $2604AA's.
  assert.equal(IMG.readUInt16BE(0x260516), 0x6192, '$260516 bsr.b -$6E');
  assert.equal(0x260518 - 0x6e, STAGESTART.clearMore, '  ...which is $2604AA');
});

// =================================================================================================
// 5 -- THE WINDOWS, PROVED BY ABLATION. Each claim is the exact `Unreached` address its
//      absence produces, with a positive control that the read succeeds when it is present.
// =================================================================================================

/** `RomWindows` from the exported table with `drop` (window bases) REMOVED. */
async function windowedRom(drop = []) {
  const { RomWindows } = await import('../src/rom.js');
  const spec = tablesJson.rom;
  const kept = spec.windows.filter(
    (w) => !drop.includes(parseInt(String(w.base).replace('$', ''), 16)));
  assert.equal(kept.length, spec.windows.length - drop.length,
    'the ablation must actually remove the named window -- a no-op filter proves nothing');
  return new RomWindows({ ...spec, windows: kept });
}

for (const [drop, cfg, addr, what] of [
  [[0x260896], 0, 0x260896, 'the DIFFICULTY WORD table $2608B6 reads'],
  [[0x260886], 0, 0x260886, 'the POINTER table $2608C4 reads'],
  // Table 0 is covered ONLY by the new $26086E window; W127's row starts at $260874.
  [[0x26086e], 0, 0x26086e, 'base table 0, which only the W378 window covers'],
  // ...and index 3 needs the far end of the same window, past where W127's row stops.
  [[0x26086e], 3, 0x260880, 'base table 3, at the far end of the same window'],
]) {
  test(`W378 without the window at $${drop[0].toString(16).toUpperCase()} the run throws at `
    + `$${addr.toString(16).toUpperCase()} (${what})`, async () => {
    const g = coldToStart();
    g.ram.setU8(RANKBASE.cfg, cfg);
    g.ram.setU16(RANKBASE.force, 0);

    // POSITIVE CONTROL first: with every window present, this read succeeds.
    installRankBase26089E(g.ram, g.rom);
    assert.equal(g.ram.u32(RANKBASE.ptrOut), RANKBASE.baseTables[cfg]);
    if (drop[0] === 0x26086e) {
      assert.equal(recompute2608D2(g.ram, g.rom), undefined, 'and the base byte reads');
    }

    const ablated = await windowedRom(drop);
    const run = () => {
      installRankBase26089E(g.ram, ablated);
      recompute2608D2(g.ram, ablated);
    };
    assert.throws(run, (e) => {
      assert.match(String(e.message), /outside every\s+ROM window/);
      assert.equal(e.romAddress ?? -1, addr,
        `the Unreached must name $${addr.toString(16).toUpperCase()}`);
      return true;
    });
  });
}

test('W378 $2605A4 is $260580 again, same four targets, and nothing calls it', () => {
  // TRAP 6/10: two near-twins can have opposite contracts, and a `bsr` tail is a shared
  // subroutine. Both are checked here rather than assumed. The two are NOT byte-identical --
  // every branch is PC-relative -- so the targets are what must agree.
  const bsrTarget = (a) => a + 2 + ((IMG.readUInt16BE(a + 2) << 16) >> 16);
  const arms = (base) => [0x12, 0x16, 0x1a, 0x1e].map((o) => {
    assert.equal(IMG.readUInt16BE(base + o), 0x6100, `$${(base + o).toString(16)} bsr.w`);
    return bsrTarget(base + o);
  });
  assert.deepEqual(arms(STAGESTART.start), [0x2604f4, 0x25fd24, 0x26051a, 0x25ff7a],
    '$260580 bsr\'s $2604F4, $25FD24, $26051A, $25FF7A in that order');
  assert.deepEqual(arms(STAGESTART.twin), arms(STAGESTART.start),
    'and $2605A4 reaches exactly the same four');
  assert.notDeepEqual([...IMG.subarray(STAGESTART.twin, STAGESTART.twin + 0x24)],
    [...IMG.subarray(STAGESTART.start, STAGESTART.start + 0x24)],
    'but they are NOT the same bytes -- the displacements differ, which is the point');

  // [M] no branch and no absolute reference anywhere in the image reaches the twin.
  let refs = 0;
  for (let a = 0; a + 4 <= IMG.length; a += 2) {
    if (IMG.readUInt32BE(a) === STAGESTART.twin) refs++;
    const op = IMG.readUInt16BE(a);
    if (op === 0x6100 || op === 0x6000 || op === 0x4eba || op === 0x4efa) {
      if (bsrTarget(a) === STAGESTART.twin) refs++;
    }
  }
  assert.equal(refs, 0, 'nothing calls or names $2605A4');
  // ...while $260580 has exactly one caller, and it is $26070C's tail.
  let callers = [];
  for (let a = 0; a + 4 <= IMG.length; a += 2) {
    const op = IMG.readUInt16BE(a);
    if ((op === 0x6100 || op === 0x4eba) && bsrTarget(a) === STAGESTART.start) callers.push(a);
  }
  assert.deepEqual(callers, [0x26077e], '$26077E bsr.w $260580, inside $26070C');
});

test('W378 the W127 window at $260874 is untouched and the new $26086E one is a superset', () => {
  const win = (base) => tablesJson.rom.windows.find(
    (w) => parseInt(String(w.base).replace('$', ''), 16) === base);
  const w127 = win(0x260874);
  assert.ok(w127, 'W127\'s row is still there');
  assert.equal(w127.len, 6, 'and it is still six bytes -- NOT widened');
  const w378 = win(0x26086e);
  assert.ok(w378, 'and the new one exists');
  assert.equal(w378.len, RANKBASE.baseBytes, 'covering all four tables');
  // Byte-identical over the overlap, so which window serves a read cannot matter.
  for (let i = 0; i < 6; i++) {
    assert.equal(w378.hex.substr((0x260874 - 0x26086e + i) * 2, 2), w127.hex.substr(i * 2, 2),
      `overlap byte ${i}`);
  }
});
