// The enemy pool, the spawn engine and the update loop -- the facts the
// 1465-frame `enemy-waves` comparison cannot isolate.
//
// WHAT THIS FILE IS FOR, given that a per-frame comparison against the
// cartridge already exists. Three kinds of fact:
//
//   1. things the corpus reaches but cannot ATTRIBUTE. `enemy-waves` going red
//      tells you a slot is wrong, not which of the twenty-three bytes $A527
//      clears was missed or which of the four allocator shapes was used.
//   2. things the corpus does not reach at all: an allocation FAILURE with a
//      full pool (measured on the cartridge only by poking all ten type bytes),
//      the DEX/BNE allocator, an unimplemented handler's throw.
//   3. BOUNDARIES. $B251's box is [$04,$F3] x [$08,$C3]; a 1465-frame run
//      exercises the values enemies happen to take, not $03/$04/$F3/$F4.
//
// EVERY TEST HERE HAS BEEN SEEN RED -- the mutation is named in each comment
// and the measured output is in docs/worklog/gradius/03-impl-*.md.

import test from 'node:test';
import assert from 'node:assert';

import { createState, ENEMY_BASE } from '../src/state.js';
import { clearSlot, allocEnemySlot, spawnEngine, updateEnemies, enemyBullets,
         divide83B5 } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;

/** A state parked where the cartridge is at game frame 310: engine running. */
function running(scrollHi = 0, scrollLo = 0) {
  const s = createState();
  s.substate = 0x80;                 // $1B, the play sub-state
  s.spawn.z60 = 2;                   // $60 = 2, measured at game frame 310
  s.spawn.z61 = scrollHi & 0x0E;     // $61 = $3F AND $0E
  s.cam.hi = scrollHi;
  s.cam.lo = scrollLo;
  // $6A:$6B = $A844, measured from frame 310 onward
  s.spawn.z6A = 0x44; s.spawn.z6B = 0xA8;
  s.obj.y[0] = 96;                   // the player, which the fan homes on
  s.obj.x[0] = 80;
  return s;
}

const cursor = (s) => s.spawn.z6A | (s.spawn.z6B << 8);
const occupied = (s) => {
  const out = [];
  for (let j = 0; j < 10; j++) if (s.obj.type[j + ENEMY_BASE] !== 0) out.push(j + ENEMY_BASE);
  return out;
};

// ------------------------------------------------------------------ $A527 ---

test('$A527 clears 21 arrays at slot j+12 AND two bytes at index j', () => {
  // The correction this port makes to 00-recon-enemies.md 8. `STA $0460,Y` with
  // Y = j and `STA $0460,X` with X = j+12 are different BYTES of the SAME
  // 32-entry array, and `STA $0496,Y` is $0480[22+j]. A port that gave the
  // j-indexed writes arrays of their own would put them at addresses the
  // cartridge does not use, and the watch list compares addresses.
  // RED WHEN: `o.s0460[j] = 0` is changed to `o.s0460[j + 12] = 0` (assertion
  // 3), or any one of the twenty-one +$0C stores is dropped (assertion 1).
  const s = createState();
  const j = 4, i = j + ENEMY_BASE;      // slot 16
  const arrays = ['status', 'anim', 'timer', 'animFrame', 'attrMask', 'type',
                  'y', 'yf', 'x', 'xf', 'carrier', 'yvel', 'yvelf', 'style',
                  'xvel', 'xvelf', 's0460', 's0480', 's04A0', 's04C0', 's04E0'];
  assert.strictEqual(arrays.length, 21, '$A527 makes 21 X-indexed stores');
  for (const a of arrays) s.obj[a].fill(0xEE);

  clearSlot(s, j);

  for (const a of arrays) {
    assert.strictEqual(s.obj[a][i], 0, `$A527 did not clear obj.${a}[${i}]`);
  }
  assert.strictEqual(s.obj.s0460[j], 0, '$A52E STA $0460,Y ($0460 + j) was not cleared');
  assert.strictEqual(s.obj.s0480[22 + j], 0, '$A52B STA $0496,Y ($0480 + 22 + j) was not cleared');
  // ...and nothing ELSE moved: slot j's own +$0C entry is index 16, and index 4
  // of the same array is a different byte that must survive.
  assert.strictEqual(s.obj.s0460[i], 0, 'the +$0C $0460 store is index j+12');
  assert.strictEqual(s.obj.status[j], 0xEE, '$A527 wrote outside slot j+12');
  assert.strictEqual(s.obj.s0480[j], 0xEE, '$0496,Y is index 22+j, not j');
});

// ------------------------------------------------ the four free-slot searches -

test('the allocators scan DOWNWARD from index 9, and $A4A6 never tests index 0', () => {
  // Direction first: slot 21 fills before slot 20, which is what fixes the OAM
  // draw order ($8B47 walks slots 0 -> 31, so the LAST allocated enemy is drawn
  // FIRST). MEASURED: firstNonZeroType = 21:378 20:389 19:400 18:411.
  // RED WHEN: the loop is changed to count up from 0 (assertion 1).
  const s = createState();
  assert.strictEqual(allocEnemySlot(s, true), 9, 'the search must start at index 9');
  s.obj.type[9 + ENEMY_BASE] = 5;
  assert.strictEqual(allocEnemySlot(s, true), 8, 'it must walk DOWN, not up');

  // ...and the two shapes differ, which is the thing a port normalises away.
  // $A3B1/$A415/$A46F end `DEX / BPL` and so test index 0; $A4A6 ends
  // `DEX / BNE` and exits with X = 0 unexamined, so slot 12 is unreachable
  // from that spawner. RED WHEN: allocEnemySlot ignores its flag.
  for (let j = 1; j <= 9; j++) s.obj.type[j + ENEMY_BASE] = 5;
  assert.strictEqual(allocEnemySlot(s, true), 0,
    'DEX / BPL must reach index 0 (slot 12)');
  assert.strictEqual(allocEnemySlot(s, false), -1,
    '$A4A6\'s DEX / BNE must NOT test index 0 -- do not normalise it');
});

// ------------------------------------------------------- the wave triggers ---

test('$A30C-$A328: a record fires at ($61 << 8) + trigger*2, exactly', () => {
  // The ten stage-0 chunk-0 records, and the SCROLL each one fired at, taken
  // from the cartridge with an exec hook on $A335 (00-recon-enemies.md 1, and
  // re-measured for this wave on script "200:,10:S,190:,1500:RD"):
  //     $0020 $0060 $00A0 $00E0 $0120 $0140 $0160 $0180 $01A0 $01C0
  // and the cursor after each: $A846 $A848 ... $A858.
  // Each is driven here one scroll value BELOW its trigger (must not fire) and
  // then AT it (must fire), so the comparison is on the boundary rather than on
  // "something happened eventually".
  // RED WHEN: the trigger is not doubled ($A312 ASL $98), or $61 is not added
  // into the high byte ($A316 ADC $61).
  const want = [0x0020, 0x0060, 0x00A0, 0x00E0, 0x0120,
                0x0140, 0x0160, 0x0180, 0x01A0, 0x01C0];
  const s = running(0, 0);
  for (let k = 0; k < want.length; k++) {
    const before = cursor(s);
    // one unit short: nothing may fire
    const lo = (want[k] - 1) & 0xFF, hi = (want[k] - 1) >> 8;
    s.cam.hi = hi; s.cam.lo = lo; s.spawn.z61 = hi & 0x0E;
    spawnEngine(s, res);
    assert.strictEqual(cursor(s), before,
      `record ${k} fired one scroll unit early (at $${(want[k] - 1).toString(16)})`);
    // exactly on it: it must fire and step the cursor by 2
    s.cam.hi = want[k] >> 8; s.cam.lo = want[k] & 0xFF;
    s.spawn.z61 = (want[k] >> 8) & 0x0E;
    spawnEngine(s, res);
    assert.strictEqual(cursor(s), before + 2,
      `record ${k} did not fire at scroll $${want[k].toString(16)}`);
    // ...and drain the squadron so the next record is reachable ($A2FE)
    for (let f = 0; f < 200 && s.spawn.z69 !== 0; f++) spawnEngine(s, res);
  }
  assert.strictEqual(cursor(s), 0xA858, 'the cursor did not walk $A846..$A858');
});

test('$A2FE: the $FF terminator stops the list, and $A302 reloads on the 512-px crossing', () => {
  // The chunk switch, MEASURED at scroll $0200 on cartridge frame 1339, cursor
  // $A858 -> $A85B. Note $A85B and not $A859: chunk 1's first record fires on
  // the same frame the chunk is loaded is NOT what happens -- the reload is a
  // separate frame, and the record fires after it.
  // RED WHEN: the `$61 + 2 == $3F` test at $A302 is written as `$61 != $3F`.
  const s = running(1, 0xFF);
  s.spawn.z6A = 0x58; s.spawn.z6B = 0xA8;     // parked on chunk 0's $FF
  spawnEngine(s, res);
  assert.strictEqual(cursor(s), 0xA858, '$A345 RTS: the terminator must not advance');

  s.cam.hi = 2; s.cam.lo = 0x00;              // scroll $0200 -- the crossing
  spawnEngine(s, res);
  assert.strictEqual(s.spawn.z61, 2, '$61 did not follow $3F AND $0E');
  assert.strictEqual(cursor(s), 0xA859, 'the chunk-1 list was not loaded');
  assert.strictEqual(s.spawn.z60, 2, '$A308 must land PAST $A2CF INC $60');
  spawnEngine(s, res);
  assert.strictEqual(cursor(s), 0xA85B, 'chunk 1\'s first record did not fire at $0200');
});

// --------------------------------------------------- the formation machine ---

test('$A3E4/$A411: four members, 11 frames apart, at X $F0 and Y $2A', () => {
  // The measured shape of stage 1's opening squadron (cmd $80, formation 0,
  // pattern 0): four members appearing on game frames 378, 389, 400, 411 --
  // delay+1 apart, all at the same Y because pattern 0's dY is 0 -- filling
  // slots 21, 20, 19, 18 in that order.
  // RED WHEN: $6C is loaded from $A5BC before the allocation instead of after
  // ($A42F), or the members are allocated upward.
  const s = running(0, 0x1F);
  spawnEngine(s, res);                        // scroll $001F: not yet
  assert.deepStrictEqual(occupied(s), []);
  s.cam.lo = 0x20;
  spawnEngine(s, res);                        // scroll $0020: fires
  assert.deepStrictEqual(occupied(s), [21], 'the first member must take slot 21');
  assert.strictEqual(s.obj.x[21], 0xF0, 'spawn X is $A592[0] AND $F0');
  assert.strictEqual(s.obj.y[21], 0x2A, 'first Y is $A592[1]');
  assert.strictEqual(s.obj.type[21], 0x05, '$65 -> $030C');
  assert.strictEqual(s.obj.status[21], 0x01, '$64 -> $010C');
  assert.strictEqual(s.spawn.z6C, 10, '$A42F: $6C = $A5BC[0] = the delay');
  assert.strictEqual(s.spawn.z69, 3, 'three members left');

  const at = [0];
  for (let f = 1; f <= 40; f++) {
    const n = occupied(s).length;
    spawnEngine(s, res);
    if (occupied(s).length !== n) at.push(f);
  }
  assert.deepStrictEqual(at, [0, 11, 22, 33],
    'members must be delay+1 = 11 frames apart (measured 378, 389, 400, 411)');
  assert.deepStrictEqual(occupied(s), [18, 19, 20, 21],
    'the squadron must fill DOWNWARD from slot 21');
  for (const i of [18, 19, 20, 21]) {
    assert.strictEqual(s.obj.y[i], 0x2A, 'pattern 0 has dY = 0: all four share a Y');
  }
  // >= 4 members, so the squadron gets a kill counter at $0048+$49 (wave 6
  // decrements it). $49 alternates 2/3, forced by $A3FB AND #$01 / ORA #$02.
  assert.ok(s.zp49 === 2 || s.zp49 === 3, '$49 must be forced into {2,3}');
  assert.strictEqual(s.squad[s.zp49], 4, '$A400 did not seed the squadron counter');
});

test('an allocation FAILURE drops the member, still DECs $69, and does NOT reload $6C', () => {
  // Measured by poking all ten $030C-$0315 non-zero over frames 370-420:
  //   ev 378 ALLOCFAIL $69=3 $6C=0 / 379 $69=2 / 380 $69=1 / 381 $69=0
  //   total.allocQ_fail = 12, allocQ_ok = 0, slotClear = 0
  // i.e. a four-member squadron burns its whole count in FOUR CONSECUTIVE
  // FRAMES and spawns nothing, instead of taking 44. $6C is loaded at $A42F,
  // which is past the failure return at $A41F.
  // RED WHEN: $6C is reloaded on the failure path (the count then takes 44
  // frames), or $69 is decremented only on success (it never reaches 0).
  const s = running(0, 0x20);
  for (let j = 0; j < 10; j++) s.obj.type[j + ENEMY_BASE] = 0x99;  // pool full
  const types = Array.from(s.obj.type);

  spawnEngine(s, res);
  assert.strictEqual(s.spawn.z69, 3, '$A411 DEC $69 must run before the allocator');
  assert.strictEqual(s.spawn.z6C, 0, '$6C must NOT be reloaded on a failure');
  for (const want of [2, 1, 0]) {
    spawnEngine(s, res);
    assert.strictEqual(s.spawn.z69, want,
      'a dropped member must still count down, one per CONSECUTIVE frame');
    assert.strictEqual(s.spawn.z6C, 0, '$6C must stay 0 for the whole squadron');
  }
  assert.deepStrictEqual(Array.from(s.obj.type), types,
    'a failed member must not touch the pool ($A527 is past the failure return)');
  assert.strictEqual(cursor(s), 0xA846, 'the wave record is consumed either way');
});

// -------------------------------------------------------- the update loop ---

test('$ADAB runs exactly 10 slots per frame, occupied or not', () => {
  // docs/knowledge/06 mechanism (C), answered NO and MEASURED: 15900 entries to
  // $ADE5 over 1590 calls to $ADAB on a 1900-frame stage-1 run = exactly 10.00,
  // and 26630 over 2663 on the recon's 3000-frame run.
  // RED WHEN: the loop is given an `if (type === 0) continue` fast path -- the
  // count drops to the occupied count and `enemySlots` diverges on the very
  // first compared frame of enemy-waves.
  const s = running();
  updateEnemies(s, res);
  assert.strictEqual(s.work.enemySlots, 10, 'an EMPTY pool must still be 10');
  s.obj.type[21] = 0x85; s.obj.type[20] = 0x88;
  updateEnemies(s, res);
  assert.strictEqual(s.work.enemySlots, 10, 'a partly full pool must still be 10');
});

test('$83E4 ASL A is 8-bit: type $85 and type $05 run the SAME handler', () => {
  // Proved on the cartridge by COUNTING rather than by reading the listing:
  // hits on $B0AF = typeHist[$05] + typeHist[$85], exactly, three handlers over.
  // Here the observable is bit 7: type $05 has it clear, so $B0AF's first
  // update only SETS it (one motionless, untouchable frame), while type $85
  // already has it and moves.
  // RED WHEN: the dispatch masks with $7F before the ASL but then indexes with
  // the raw type, or the handler index is taken as `type` rather than `type*2`.
  const s = running();
  s.obj.type[21] = 0x05;               // uninitialised
  s.obj.x[21] = 0xE0; s.obj.y[21] = 0x40;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x85, '$B0B4: the first update sets bit 7');
  assert.strictEqual(s.obj.x[21], 0xE0, 'and moves nothing on that frame');
  updateEnemies(s, res);
  assert.strictEqual(s.obj.x[21], 0xDE, '$B0CD: 2 px/frame left thereafter');
});

test('an unported handler is a LOUD named throw, with the type and the ROM address', () => {
  // docs/knowledge/03: a silent no-op here would leave the slot motionless and
  // the comparison would blame the mover. 29 of the 42 entries are unported as
  // of wave 12 (the 13 that are not: 0, 1, 2, 3, 4, 5, 6, 8, 17, 18, 31, 39,
  // 41 -- ten distinct routines).
  // RED WHEN: the `default:` arm returns instead of throwing.
  const s = running();
  // Entry 7 -> $B6E1. MEASURED REACHABLE on the cartridge: 4995 executions in
  // 27400 frames, first at game frame 2490 (tools/oracle/throwaudit.py). It is
  // the wall `deep-page4`'s expectThrow now pins.
  s.obj.type[21] = 0x87;
  assert.throws(() => updateEnemies(s, res),
    /unimplemented enemy handler \$B6E1 for type \$87 \(entry 7/);
});

test('$ADE5\'s animator: reload 6, four entries per status, 0 = wrap and re-read', () => {
  // Status 6 (the power-up capsule) has the group `10 11 12 00`, so the 0 byte
  // has to send $ADFD round again -- three metasprites out of a four-entry
  // table. MEASURED: a capsule showed metasprites 16, 17, 18 and never 0.
  // RED WHEN: the `if (ms !== 0)` wrap is replaced by "store whatever is there".
  const s = running();
  s.obj.status[21] = 6;
  s.obj.type[21] = 0x81;               // handler 1, which does not move it far
  s.obj.x[21] = 0x80;
  const seen = [];
  for (let f = 0; f < 24; f++) { updateEnemies(s, res); seen.push(s.obj.anim[21]); }
  assert.deepStrictEqual([...new Set(seen)].sort((a, b) => a - b), [0x10, 0x11, 0x12],
    'status 6 must cycle exactly metasprites $10 $11 $12');
  // ...and it steps once every six frames ($ADF1 LDA #$06).
  let steps = 0;
  for (let f = 1; f < seen.length; f++) if (seen[f] !== seen[f - 1]) steps++;
  assert.strictEqual(steps, 3,
    '24 frames at a reload of 6 is a step on frames 1, 7, 13, 19 -- 3 changes');
});

// -------------------------------------------------------------- boundaries ---

test('$B251: the off-screen box is X in [$04,$F3] and Y in [$08,$C3], inclusive', () => {
  // Four CMPs, four boundaries, and a 1465-frame comparison exercises none of
  // them directly -- it only sees the values enemies happen to take.
  // RED WHEN: any of the four constants moves by one, or a BCC becomes a BCS.
  const cases = [
    [0x04, 0x40, true], [0x03, 0x40, false],
    [0xF3, 0x40, true], [0xF4, 0x40, false],
    [0x40, 0x08, true], [0x40, 0x07, false],
    [0x40, 0xC3, true], [0x40, 0xC4, false],
  ];
  for (const [x, y, keep] of cases) {
    const s = running();
    s.obj.type[21] = 0x85;
    s.obj.s0480[21] = 3;               // sub-state 3 tail-calls $B251
    s.obj.x[21] = x; s.obj.y[21] = y;
    s.obj.anim[21] = 0x0C;
    updateEnemies(s, res);
    // sub-state 3 adds 3 to X before the box, so compare against x+3
    const alive = s.obj.type[21] !== 0;
    const inBox = (x + 3) >= 0x04 && (x + 3) <= 0xF3 && y >= 0x08 && y <= 0xC3;
    assert.strictEqual(alive, inBox,
      `X=$${x.toString(16)} Y=$${y.toString(16)}: expected ${inBox ? 'kept' : 'freed'}`);
    if (keep && inBox) assert.strictEqual(s.obj.x[21], (x + 3) & 0xFF);
  }
});

test('$AEE1 drifts 0.5 px/frame LEFT and $AEF8 frees the slot below X = 8', () => {
  // The generic mover every unhandled object gets. Two frames per pixel, which
  // is the half that an integer-only port gets right.
  // RED WHEN: `- 0x80` becomes `- 0x100`, or the free threshold moves.
  const s = running();
  s.obj.type[21] = 0x83;               // handler 3 -- $AEE1 directly
  s.obj.x[21] = 0x0A; s.obj.xf[21] = 0x00;
  // $AEE3 SEC / SBC #$80 borrows on the FIRST frame (0 - $80), so the integer
  // steps down immediately and the fraction lands on $80.
  updateEnemies(s, res);
  assert.deepStrictEqual([s.obj.x[21], s.obj.xf[21]], [0x09, 0x80], 'half a pixel');
  updateEnemies(s, res);
  assert.deepStrictEqual([s.obj.x[21], s.obj.xf[21]], [0x09, 0x00], 'the other half');
  updateEnemies(s, res);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.x[21], 0x08, 'X = 8 is still alive ($AEF4 BCS)');
  assert.strictEqual(s.obj.type[21], 0x83);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0, 'X = 7 must free the slot');
  assert.strictEqual(s.obj.anim[21], 0, '$AEF8 clears the metasprite too');
});

test('$5B freezes handler 1 (the capsule) but NOT handler 3', () => {
  // $AEDD is two instructions and a fall-through: type 1 tests $5B, type 3 does
  // not. Nothing in the corpus can tell them apart -- $5B is 0 on every
  // measured frame -- which is exactly why it is here.
  // RED WHEN: the $5B test is moved into $AEE1, or dropped.
  //
  // THE SECOND HALF OF THIS TEST WAS MISSING and a reader caught it: as
  // originally written it only ever set $5B = 1, so it exercised the FREEZE arm
  // and never asserted that a capsule MOVES when $5B is clear. Deleting
  // `h_AEE1(state)` from the end of $AEDD -- i.e. removing the fall-through the
  // file headlines as its own trap-1 case -- left this test, the rest of the
  // unit suite AND all 18 oracle scenarios green. That is docs/knowledge/03
  // shape 4: the check takes the answer in as its argument. The `$5B = 0` rows
  // below are the fix.
  const cases = [
    // $5B, type, must the object move this frame?
    [1, 0x81, false],   // the capsule, frozen
    [1, 0x83, true],    // the generic drift, which does not read $5B
    [0, 0x81, true],    // <- THE FALL-THROUGH ITSELF: $AEDD runs on into $AEE1
    [0, 0x83, true],
  ];
  for (const [zp5B, type, moves] of cases) {
    const s = running();
    s.zp5B = zp5B;
    s.obj.type[21] = type;
    s.obj.x[21] = 0x80; s.obj.xf[21] = 0;
    updateEnemies(s, res);
    assert.strictEqual(s.obj.xf[21] !== 0, moves,
      `type $${type.toString(16)} with $5B = ${zp5B}: expected `
      + `${moves ? 'movement' : 'a freeze'}`);
    if (moves) {
      // and it is the SAME movement, byte for byte, that handler 3 makes: the
      // fall-through shares $AEE1's body rather than reimplementing it.
      assert.deepStrictEqual([s.obj.x[21], s.obj.xf[21]], [0x7F, 0x80],
        `type $${type.toString(16)} with $5B = ${zp5B}: $AEE3 SEC / SBC #$80`);
    }
  }
});

// --------------------------------------------------------- the ROM tables ----

test('a read outside the exported enemy ranges is a loud throw, not a number', () => {
  // The animator indexes $ADC1 with status*4, so a status of 9 walks off the
  // end of the nine groups into $ADE5, which is CODE. On the cartridge that
  // returns an instruction byte and draws it as a metasprite.
  // RED WHEN: enemyTables' read() falls back to 0 for an unmapped address.
  assert.throws(() => rom.read(0xADE5), /not in any exported range/);
  assert.throws(() => rom.read(0x8000), /not in any exported range/);
  assert.strictEqual(rom.read(0xADC1), 0x0C, 'status 0\'s first metasprite');
  assert.strictEqual(rom.word(0xA5FE), 0xA662, '$A5FE -> table A');
  assert.strictEqual(rom.word(0xA600), 0xA602, '$A600 -> table B');
});

// ============ WAVE 11: THE ENEMY BULLETS, $BC59 / $BCB5 / $83B5 / $BDD5 ======
//
// The four `enemy-bullet*` scenarios compare this path per frame against the
// cartridge and they are the primary evidence. This file holds what a scenario
// cannot isolate or cannot reach: the divide's arithmetic on the exact operand
// pairs the cartridge was seen handing it, the allocator's failure arm, the two
// speed bumps' DIFFERENT carries, and the mover's four box boundaries.
//
// Everything asserted here was measured with tools/oracle/bulletprobe.py before
// it was written; the numbers are quoted at each test.

/** A play state with the engine running and one enemy about to shoot. */
function aboutToFire(j = 9, { ex = 0x60, ey = 0x2A, px = 0x50, py = 0x60 } = {}) {
  const s = running();
  const i = j + ENEMY_BASE;
  s.obj.type[i] = 0x83;              // $030C,X -- AND $7F >= 3, so it counts down
  s.obj.style[i] = 0;                // $040C,X -- one frame from the borrow
  s.obj.s04E0[i] = 0xC8;             // $04EC,X -- every stage-1 squadron's reload
  s.obj.x[i] = ex; s.obj.y[i] = ey;
  s.obj.x[0] = px; s.obj.y[0] = py;  // the ship, LEFT of it -> $BC56 BCC
  return s;
}

test('$83B5: the divide reproduces all ten (min, max) pairs off the cartridge', () => {
  // bulletprobe.py hooks $BD1C (inputs) and $BD1F (outputs) and recorded these
  // ten, in order, on the `enemy-bullets-full` configuration:
  //   |dy| |dx| max -> $98:$99:$9A
  //    53   16  53     0:0:77      45   18  45     0:0:102
  //    35   23  35     0:0:168     25   28  28     0:0:228
  //    15   33  33     0:0:116      5   38  38     0:0:33
  //     2   45  45     0:0:11       2   60  60     0:0:8
  //     2   75  75     0:0:6        2   90  90     0:0:5
  // i.e. floor(min * 256 / max) in $9A with $99 = 0 whenever min < max.
  // RED WHEN: the loop runs 16 times instead of 17, the `ROL A` carry is fed
  // into the CMP, or the >= $80 pre-scale is dropped (which only shows on the
  // divisor below, not on these ten -- every one of them is 28..90).
  const s = running();
  const pairs = [[16, 53, 77], [18, 45, 102], [23, 35, 168], [25, 28, 228],
                 [15, 33, 116], [5, 38, 33], [2, 45, 11], [2, 60, 8],
                 [2, 75, 6], [2, 90, 5]];
  for (const [min, max, lo] of pairs) {
    const q = divide83B5(s, min, 0, max);
    assert.deepStrictEqual([q.hi, q.mid, q.lo], [0, 0, lo],
      `${min}/${max} must give $99:$9A = 0:${lo}`);
  }
  // min == max is 1.00, not 0: $99 carries it. Not in the ten above because a
  // 45-degree shot is the one case where $BD0D's BCS keeps the same byte as
  // both operands.
  const eq = divide83B5(s, 10, 0, 10);
  assert.deepStrictEqual([eq.hi, eq.mid, eq.lo], [0, 1, 0]);
  // The $83BF pre-scale arm, which no measured pair reaches:
  assert.strictEqual(divide83B5(s, 100, 0, 200).lo, 128, '$83C3 halves both');
  assert.strictEqual(s.spawn.z5D, 12, '$83B5 INC $5D, once per call, all 12');
});

test('$BC59: the allocator scans DOWN, and a full pool drops the shot', () => {
  // MEASURED: ten fires five frames apart took bullet slots 9,8,7,6,5,4,3,2,1,0
  // -- object slots 31 down to 22 -- and the four fires after that reached
  // $BC63, the bare RTS, at f501/507/511/516.
  // RED WHEN: the scan runs upward (sprite priority changes and page $02 with
  // it), or a failure recycles a slot / leaves $040C at 0 so the enemy retries.
  const s = aboutToFire();
  enemyBullets(s, res);
  assert.strictEqual(s.obj.anim[31], 0x25, 'slot 31 first, not 22');
  assert.strictEqual(s.obj.anim[22], 0, 'and only one bullet');
  assert.strictEqual(s.obj.style[9 + ENEMY_BASE], 0xC8, '$BC09 reloaded $040C,X');

  const full = aboutToFire();
  for (let k = 0; k < 10; k++) {
    full.obj.anim[22 + k] = 0x25;     // every $0136 busy
    full.obj.x[22 + k] = 100; full.obj.y[22 + k] = 100;
    full.obj.s0460[22 + k] = 0;       // dir 0: X and Y both negative, and with
    full.obj.xvel[22 + k] = 0;        //   zero velocity they stay inside the box
    full.obj.yvel[22 + k] = 0;
  }
  const before = [...full.obj.type.slice(22, 32)];
  enemyBullets(full, res);
  assert.strictEqual(full.work.bulletAllocFail, 1, '$BC63 ran once');
  assert.deepStrictEqual([...full.obj.type.slice(22, 32)], before,
    'a failure disturbs NOTHING -- no slot is recycled');
  assert.strictEqual(full.obj.style[9 + ENEMY_BASE], 0xC8,
    '$BC09 reloaded $040C,X BEFORE the JSR, so the enemy waits 200 frames; it '
    + 'does not retry on the next one');
});

test('$BC8E: the muzzle index is $0496 (the j-indexed array), not $0480+j+12', () => {
  // `LDY $A8 / LDX $0496,Y` -- s0480[22 + j], the SAME byte $A52B clears. The
  // two are different addresses and state.js says so; here the difference is
  // WHERE THE BULLET APPEARS.
  // RED WHEN: the port reads s0480[j + 12]. That byte is 0 in the corpus, so
  // no scenario can tell the two apart -- only this can.
  const s = aboutToFire();
  s.obj.s0480[22 + 9] = 4;            // $0496,Y = entry 4 -> ($08, $08)
  s.obj.s0480[9 + ENEMY_BASE] = 1;    // $0480+j+12 = entry 1 -> ($F8, $F8)
  enemyBullets(s, res);
  assert.strictEqual(s.obj.x[31], 0x60 + 8 - 1,
    'muzzle +8 on X, then one frame of the mover');
  assert.strictEqual(s.obj.y[31], 0x2A + 8 + 1, 'muzzle +8 on Y, then +1');
});

test('$BD5F vs $BD42: the two speed bumps carry in DIFFERENT bits', () => {
  // The $1A bump is entered through `LDA $1A / BEQ`, which leaves the carry the
  // ROR just produced; the $17 bump is entered through `CMP #$02`, which
  // REPLACES it -- and the arm only runs when that compare set it, so it always
  // carries in ONE. MEASURED as reachability: $BD65 and $BDB9 each ran 5 times
  // on `enemy-bullet-rank` ($17 = 3) and 0 times in every other run made here.
  // RED WHEN: one helper is used for both, or the $17 arm carries in the ROR's
  // bit (which is 0 here, so the velocity fraction comes out one low).
  const plain = aboutToFire();
  enemyBullets(plain, res);
  const s = aboutToFire();
  s.zp17 = 2;                         // rank 2: the bump, but NOT the lead arm
  enemyBullets(s, res);
  // |dy| = ($2A - $60) & $FF -> 53, |dx| = $60 - $50 = 16, steep, q = 0:77.
  //   base      xvelf = 77
  //   $17 >= 2  xvelf += (77 >> 2) + 1, and $03EC takes $40 + that carry
  assert.strictEqual(plain.obj.xvelf[31], 77, 'rank 0: no bump at all');
  assert.strictEqual(plain.obj.yvelf[31], 0, '...and no $40 either');
  assert.strictEqual(s.obj.xvelf[31], 77 + 19 + 1,
    '$BDB9 LDA $9A / ADC $044C,X with the CMP #$02 carry SET');
  assert.strictEqual(s.obj.yvelf[31], 0x40, '$BDC9 LDA $03EC,X / ADC #$40');
});

test('$BE2A/$BE62: the X test RETURNS, so an off-side bullet never moves in Y', () => {
  // `CMP #$02 / BCC $BE6B / CMP #$FC / BCS $BE6B`, and $BE6B is JMP $AEF8 --
  // the routine ends there. A bullet that leaves the sides keeps the Y it had
  // one frame ago, because $AEF8 clears five bytes and none of them is $032C.
  // RED WHEN: the free is written as a flag and the Y update runs anyway, or a
  // boundary is `<=` where the ROM has `<`.
  const at = (x, y, dir = 0) => {
    const s = running();
    s.obj.anim[22 + 3] = 0x25;
    s.obj.s0460[22 + 3] = dir;        // 0: X negative and Y negative
    s.obj.x[22 + 3] = x; s.obj.y[22 + 3] = y;
    s.obj.xvel[22 + 3] = 1; s.obj.yvel[22 + 3] = 1;
    enemyBullets(s, res);
    return s.obj;
  };
  // X: the test is on the value AFTER the step, so a bullet at 2 steps to 1
  // and dies, and one at 3 steps to 2 and lives.
  assert.strictEqual(at(2, 100).anim[22 + 3], 0, 'X 2 -> 1, and 1 IS < 2');
  assert.strictEqual(at(3, 100).anim[22 + 3], 0x25, '...but 3 -> 2 lives');
  assert.strictEqual(at(2, 100).y[22 + 3], 100, 'and the Y update never ran');
  assert.strictEqual(at(9, 100).x[22 + 3], 8, 'a live one does move');
  // Y, the same way, on both edges. dir 0 is Y negative, dir 1 is Y positive.
  assert.strictEqual(at(100, 8).anim[22 + 3], 0, 'Y 8 -> 7, and 7 IS < 8');
  assert.strictEqual(at(100, 9).anim[22 + 3], 0x25, '...but 9 -> 8 lives');
  assert.strictEqual(at(100, 0xC3, 1).anim[22 + 3], 0, 'Y $C3 -> $C4 >= $C4');
  assert.strictEqual(at(100, 0xC2, 1).anim[22 + 3], 0x25, '...and $C3 is not');
});

test('$BC6E: the KIND comes from the FIRING enemy\'s status, $80-$8F only', () => {
  // `LDA $010C,X / BPL $BC78 / CMP #$90 / BCS $BC78 / INY`. Y is 1 for a status
  // in [$80, $8F] and 0 for everything else, including $90 and above.
  // MEASURED n=0 on the cartridge: no stage-1 squadron sets bit 7 of $010C, so
  // this is the listing read carefully and it is labelled as such -- the point
  // of the test is that the WINDOW is closed at both ends.
  const kind = (status) => {
    const s = aboutToFire();
    s.obj.status[9 + ENEMY_BASE] = status;
    enemyBullets(s, res);
    return [s.obj.anim[31], s.obj.type[31], s.obj.animFrame[31]];
  };
  assert.deepStrictEqual(kind(0x01), [0x25, 0, 0], 'bit 7 clear -> $BC64[0]');
  assert.deepStrictEqual(kind(0x80), [0x59, 1, 1], '$80 is inside');
  assert.deepStrictEqual(kind(0x8F), [0x59, 1, 1], '$8F is the last one');
  assert.deepStrictEqual(kind(0x90), [0x25, 0, 0], '$90 is NOT ($BC75 BCS)');
  assert.deepStrictEqual(kind(0xFF), [0x25, 0, 0], 'and neither is $FF');
});

test('$BD0D: |dx| == |dy| takes the X-MAJOR arm, and only rank >= 2 shows it', () => {
  // `LDX $9C / STA $9D / CMP $9C / BCS $BD16` -- BCS is taken on EQUAL, so a
  // 45-degree shot is X-major. WRITTEN BECAUSE A DELIBERATE BREAK SURVIVED THE
  // CORPUS: `dx < dy` -> `dx <= dy` is GREEN on all four enemy-bullet
  // scenarios, because none of their ten fires has |dx| == |dy| (the measured
  // pairs are 53/16, 45/18, 35/23, 25/28, 15/33, 5/38, 2/45, 2/60, 2/75, 2/90).
  //
  // AND IT IS UNOBSERVABLE AT RANK 0 ANYWAY, which is worth writing down rather
  // than discovering twice: min == max makes the divide return $99:$9A = 1:0,
  // and both arms then write xvel = yvel = 1 with both fractions 0. The arms
  // only separate once a speed bump runs, because $BD75 adds $40 to the MAJOR
  // axis's fraction and $BD65 adds the halved quotient to the MINOR one.
  // RED WHEN: the CMP is made strict.
  const s = aboutToFire(9, { ex: 0x60, ey: 0x2A, px: 0x50, py: 0x3B });
  s.zp17 = 2;                          // |dx| = $60-$50 = 16, |dy| = $3B-$2A-1 = 16
  enemyBullets(s, res);
  assert.strictEqual(s.obj.xvel[31], 1, 'X is the major axis: $BD2F LDA #$01');
  assert.strictEqual(s.obj.yvel[31], 1, '...and 1.0 in Y as well, at 45 degrees');
  assert.strictEqual(s.obj.xvelf[31], 0x40, '$BD75 LDA $044C,X / ADC #$40');
  assert.strictEqual(s.obj.yvelf[31], 0x41, '$BD65 ADC with the CMP carry SET');
});


// =========================== WAVE 12 =========================================
// $A3B1, the single-enemy spawn, and the two handlers it reaches on stage 1:
// $B026/$B098 (the aiming turret) and $B198 (the arc).
//
// These are here rather than in the -unwitnessed file because `deep-page3` DOES
// reach them -- it compares 579 frames from 1900 to 2479, the first window in
// this project's history that crosses scroll $0380. What is in the -unwitnessed
// file instead is the deliberate breaks that SURVIVED that comparison.

/** The wave cursor parked on ONE record of a chunk list, ready to fire. */
function atRecord(camHi, camLo, cur) {
  const s = createState();
  s.substate = 0x80;
  s.spawn.z60 = 2;
  s.spawn.z61 = camHi & 0x0E;
  s.cam.hi = camHi; s.cam.lo = camLo;
  s.spawn.z6A = cur & 0xFF; s.spawn.z6B = cur >> 8;
  s.obj.y[0] = 96; s.obj.x[0] = 80;
  return s;
}

test('$A3B1: the FIRST cmd < $80 in stage 1 fires at scroll $0380, type $12', () => {
  // The path the owner CRASHED INTO in ordinary play
  // (06-FINDING-scroll-coverage.md). The numbers come out of the exported
  // tables, not out of a guess: chunk $61 = 2's list is $A859 and its
  // thirteenth record is at $A86F -- trigger $C0, i.e. scroll
  // ($61 + 1) * 256 + ($C0 * 2 AND $FF) = $0380 -- carrying cmd $00. Table A's
  // cmd-$00 entry ($A662, THREE bytes per command) is $B2 $80 $12, and
  // $B2 - $A0 = $12.
  // RED WHEN: the trigger is not doubled, the descriptor is indexed *4 instead
  // of *3, or $A3C8's SBC #$A0 is any other constant.
  const s = atRecord(3, 0x80, 0xA86F);
  spawnEngine(s, res);
  assert.strictEqual(cursor(s), 0xA871, '$A34F must advance the cursor by 2');
  assert.deepStrictEqual(occupied(s), [21], '$A3B1 allocates DOWNWARD from 9');
  assert.strictEqual(s.obj.type[21], 0x12, 'type := $64 - $A0');
  assert.strictEqual(s.obj.x[21], 0xF0, '$A3C3 LDY #$F0 -- the right edge');
  assert.strictEqual(s.obj.y[21], 0x12, '$A3DE LDA $66 / STA $032C,X');
  assert.strictEqual(s.obj.status[21], 0,
    '$A3B1 writes NO $010C: a single-spawn enemy has status 0, so $ADEA skips '
    + 'the animator and the handler owns the metasprite');
  assert.strictEqual(s.obj.s04E0[21], 0x80, '$A579 with $65 = $80');
  assert.strictEqual(s.obj.style[21], 0x80, '...into $040C as well');
  assert.strictEqual(s.obj.carrier[21], 0, '$80 is even: no capsule');
});

test('$A3CC: a descriptor byte >= $D0 spawns on the LEFT edge, type -= $D0', () => {
  // The other arm of the same three instructions, and it is NOT hypothetical:
  // stage 1's chunk $61 = 4 (the list at $A87A) carries the record `20 03` at
  // $A87E, firing at scroll $0440 with cmd $03, and table A's cmd-$03 entry
  // ($A66B) is $D7 $80 $B7. $D7 - $A0 = $37, which is >= $30, so Y becomes $10
  // and the type is $37 - $30 = $07.
  // RED WHEN: $A3D0's SBC #$30 is dropped (type $37 then indexes past the
  // 42-entry table) or the CMP #$30 boundary moves.
  const s = atRecord(4, 0x40, 0xA87E);
  spawnEngine(s, res);
  assert.strictEqual(s.obj.type[21], 0x07, '$A3D0 SBC #$30');
  assert.strictEqual(s.obj.x[21], 0x10, '$A3CE LDY #$10 -- the LEFT edge');
  assert.strictEqual(s.obj.y[21], 0xB7);
  // ...and this is where the port runs out NEXT. Written as an assertion so
  // that whoever ports $B6E1 is told to come here and delete it.
  assert.throws(() => updateEnemies(s, res),
    /unimplemented enemy handler \$B6E1 for type \$07 \(entry 7/,
    'scroll $0440 is the next wall after $0380');
});

test('$A3BB: a single spawn with the pool full is DROPPED, cursor still moves', () => {
  // The bare RTS at $A3BB, the same shape as $A41F for a squadron member: no
  // retry, no queue, and $A34F has already advanced the cursor -- so the record
  // is simply lost. Unreachable from the corpus (it needs ten live enemies at
  // exactly the frame a single spawn fires), which is why it is a unit test.
  // RED WHEN: the allocator returns 0 instead of -1 on a full pool.
  const s = atRecord(3, 0x80, 0xA86F);
  for (let j = 0; j < 10; j++) s.obj.type[j + ENEMY_BASE] = 0x85;
  spawnEngine(s, res);
  assert.strictEqual(cursor(s), 0xA871, 'the cursor advances either way');
  for (let j = 0; j < 10; j++) {
    assert.strictEqual(s.obj.type[j + ENEMY_BASE], 0x85, 'no type may change');
  }
});

// ------------------------------------------------ $B026 / $B098, the turret ---

/** One turret in slot 21 at (ex, ey), with the ship at (px, py). */
function turret(type, ex, ey, px, py) {
  const s = createState();
  s.substate = 0x80;
  s.obj.type[21] = type;
  s.obj.x[21] = ex; s.obj.y[21] = ey;
  s.obj.x[0] = px; s.obj.y[0] = py;
  return s;
}

test('$B098: the ceiling turret rewrites its own type, sets the flip, drifts', () => {
  // Type $12 and type $92 are the SAME entry (18) of the $AE1C table -- $83E4's
  // ASL is 8-bit -- so this handler runs on the spawn frame too, and there is
  // no $B0B4 init-once branch: $B09A writes $92 every frame, which is also how
  // bit 7 (the collision gate at $C011) gets set the first time.
  // MEASURED: the turret enters `deep-page3`'s window at frame 2106.
  // RED WHEN: the type write is dropped (the enemy stays $12 and is
  // permanently invulnerable) or the ORA #$80 goes.
  const s = turret(0x12, 0xF0, 0x12, 80, 96);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[21], 0x92, '$B098 LDA #$92 / STA $030C,X');
  assert.strictEqual(s.obj.attrMask[21], 0x80, '$B09D ORA #$80 -- the flip');
  assert.strictEqual(s.obj.anim[21], 0x73, '$B086[1]: dx = $A0, no Y refinement');
  assert.strictEqual(s.obj.s0480[22 + 9], 0x03,
    '$B080 STA $0496,X is the j-INDEXED array -- the byte $BC90 LDX $0496,Y '
    + 'reads to pick this enemy\'s muzzle offset');
  assert.strictEqual(s.obj.x[21], 0xEF,
    '$B083 JMP $AEDD: 0.5 px/frame left, i.e. the camera\'s own scroll rate');
});

test('$B038: the six direction codes, one interior placement each', () => {
  // Three coarse X bands either side of the ship, and the two OUTER ones are
  // refined by Y. Every row here is a boundary-free interior point; the
  // boundaries themselves are in enemies-unwitnessed.test.js, because two
  // deliberate breaks on those constants SURVIVED the 579-frame comparison.
  // RED WHEN: any of $B043/$B048/$B050/$B055/$B062/$B068's constants move, or
  // the $B04E LDY #$03 base changes.
  const MS = [0x74, 0x73, 0x72, 0x75, 0x76, 0x77];   // $B086
  const rows = [
    [100, 100, 90, 90, 0, 'dx = 10, inside $30 -- no Y refinement'],
    [150, 100, 90, 90, 1, 'dx = $3C, the middle band'],
    [200, 100, 90, 90, 2, 'dx = $6E, refined by dy = 10 (< $30)'],
    [200, 200, 90, 90, 1, 'dx = $6E, dy = $6E -- no refinement'],
    [90, 100, 100, 90, 3, 'dx = -10 -> $F6, at or above $D0'],
    [90, 100, 150, 90, 4, 'dx = -60 -> $C4, between $A0 and $D0'],
    [90, 100, 200, 90, 5, 'dx = -110 -> $92, refined by dy = 10'],
    [90, 200, 200, 90, 4, 'dx = -110, dy = $6E -- no refinement'],
  ];
  for (const [ex, ey, px, py, want, why] of rows) {
    const s = turret(0x12, ex, ey, px, py);
    updateEnemies(s, res);
    assert.strictEqual(s.obj.anim[21], MS[want],
      `(${ex},${ey}) vs (${px},${py}) should be direction ${want}: ${why}`);
  }
});

test('$B033: the shot countdown is armed to TEN, and only from one side', () => {
  // $040C,X is the byte $BBFD walks down by 1 a frame; every stage-1 SQUADRON
  // reloads it from $04EC = $C8 = 200 (wave 11). A turret writes TEN, i.e. it
  // shoots within a sixth of a second and re-arms every frame the ship stays
  // on its firing side.
  //
  // WRITTEN BECAUSE A DELIBERATE BREAK SURVIVED THE CORPUS: #$0A -> #$0B is
  // GREEN on `deep-page3`, while flipping the $B0AB test that GUARDS it is RED
  // (10 divergent fields, first w_040C@2138). The two facts together say the
  // guard IS exercised and always answers NO -- the compared window never has
  // the ship above the ceiling turret -- so the constant has no cartridge
  // witness at all and this is the only thing holding it.
  // RED WHEN: the constant moves, or either CMP's sense flips.
  const armed = turret(0x12, 0xF0, 0x40, 80, 0x20);     // enemy Y >= player Y
  updateEnemies(armed, res);
  assert.strictEqual(armed.obj.style[21], 0x0A, '$B033 LDA #$0A / STA $040C,X');
  const notArmed = turret(0x12, 0xF0, 0x40, 80, 0x41);
  notArmed.obj.style[21] = 0x77;
  updateEnemies(notArmed, res);
  assert.strictEqual(notArmed.obj.style[21], 0x77,
    '$B0AB BCS: enemy Y < player Y skips $B033 entirely');
  const equal = turret(0x12, 0xF0, 0x40, 80, 0x40);
  updateEnemies(equal, res);
  assert.strictEqual(equal.obj.style[21], 0x0A, 'CMP/BCS arms on equality');
});

// --------------------------------------------------------- $B198, the arc ---

test('$B198: the init frame sets status 2, wraps bit 7 on, and seeds the arc', () => {
  // Reached from the single spawn: table A's cmd $01 and cmd $02 are $A6 $81
  // $B7 and $A6 $80 $B7, and $A6 - $A0 = $06. Those records fire at scroll
  // $03C0 and $03E0 -- 64 and 96 px past the $A3B1 boundary the owner hit.
  // RED WHEN: $B19F's status, $B1AA's acceleration or $B1AF's velocity move.
  const s = turret(0x06, 0xF0, 0xB7, 80, 96);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.status[21], 2, '$B19D LDA #$02 / STA $010C,X');
  assert.strictEqual(s.obj.type[21], 0x86, '$B0B4 is an ADD: $80 + $06');
  assert.strictEqual(s.obj.s04A0[21], 0, '$B1A7 STA $04AC,X -- the arc counter');
  assert.strictEqual(s.obj.s0480[21], 0x20, '$B1AA LDA #$20 -- the acceleration');
  assert.strictEqual(s.obj.yvel[21], 3, '$B1AF LDA #$03 -- NOT type 4\'s #$02');
  assert.strictEqual(s.obj.xvel[21], 0xFE, '$B1BC LDA #$FE');
  assert.strictEqual(s.obj.x[21], 0xF0, 'and it does not move on the init frame');
  assert.strictEqual(s.obj.y[21], 0xB7);
});

test('$B1DF: arc 0 flies LEFT 2 px/frame, Y velocity decaying by $20/256', () => {
  // $B200[0] is 0, so $B1DD's BNE is not taken and the mover is $B154 (X +=
  // xvel, and xvel is $FE). One frame, every byte.
  // RED WHEN: $B1C5 reads the wrong table, or $B1E8/$B1EB are reordered.
  const s = turret(0x86, 0xF0, 0xB7, 80, 96);
  s.obj.s0480[21] = 0x20; s.obj.yvel[21] = 3; s.obj.xvel[21] = 0xFE;
  updateEnemies(s, res);
  assert.strictEqual(s.obj.x[21], 0xEE, '$B154: X += $FE');
  assert.strictEqual(s.obj.y[21], 0xB4, '$B140: Y -= 3');
  assert.strictEqual(s.obj.yvel[21], 2, '$B120: the fraction borrowed');
  assert.strictEqual(s.obj.yvelf[21], 0xE0, '0 - $20');
});

test('$B1D4: the arc advances only when Y velocity is negative AND past -3', () => {
  // $B1CE BPL / $B1D0 CMP #$FD / $B1D2 BCS -- so $FD does NOT advance and $FC
  // does. The values either side, since a 579-frame comparison only sees
  // whatever the arc happens to pass through.
  // RED WHEN: CMP #$FD becomes #$FE or #$FC.
  for (const [yv, want] of [[0xFE, 0], [0xFD, 0], [0xFC, 1], [0x80, 1]]) {
    const s = turret(0x86, 0x80, 0x60, 80, 96);
    s.obj.s0480[21] = 0x20; s.obj.yvel[21] = yv; s.obj.xvel[21] = 0xFE;
    updateEnemies(s, res);
    assert.strictEqual(s.obj.s04A0[21], want,
      `$03BC = $${yv.toString(16)} should ${want ? '' : 'not '}advance $04AC`);
    if (want) {
      assert.strictEqual(s.obj.yvel[21], 3, '$B1D7 JMP $B1AA re-seeds');
      assert.strictEqual(s.obj.x[21], 0x80, 'and the enemy does not move');
    }
  }
});
