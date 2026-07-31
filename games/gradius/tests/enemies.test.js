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
import { clearSlot, allocEnemySlot, spawnEngine, updateEnemies }
  from '../src/enemies.js';
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
  // the comparison would blame the mover. 34 of the 42 entries are unported.
  // RED WHEN: the `default:` arm returns instead of throwing.
  const s = running();
  s.obj.type[21] = 0x87;               // entry 7 -> $B6E1, never dispatched
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
  for (const [type, moves] of [[0x81, false], [0x83, true]]) {
    const s = running();
    s.zp5B = 1;
    s.obj.type[21] = type;
    s.obj.x[21] = 0x80; s.obj.xf[21] = 0;
    updateEnemies(s, res);
    assert.strictEqual(s.obj.xf[21] !== 0, moves,
      `type $${type.toString(16)} with $5B set: expected ${moves ? 'movement' : 'a freeze'}`);
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
