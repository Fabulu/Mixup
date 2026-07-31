// WAVE 4'S UNWITNESSED PARAMETERS.
//
// tests/flow.test.js covers the wave's SHAPES -- the ladder, the $57 loop, the
// $0D sequence, pause. This file covers the wave's NUMBERS: the arithmetic
// terms, the indices and the individual stores that the wave shipped green over
// a value the corpus holds at zero.
//
// Every test here exists because a deliberate break of the line it names PASSED
// the whole gate -- 157 unit tests and all 21 oracle scenarios -- when wave 4's
// reviewer and QA ran it. The reason is the same one every time and it is worth
// stating once: the recorded corpus enters mode 5 with $22 = $24 = $26 = $28 =
// $33 = $3B = 0 and stays there for all 5726 compared frames, so half of
// $9B3E's body is proved only in the sense that 0 equals 0, and the $0700 queue
// is compared by its LENGTH ($0E) and not by its image. A parameter that only
// ever takes one value is not tested by any number of frames of it.
//
// So each test below drives the port to a state the cartridge did not happen to
// be in during these three windows, using values the ROM's own code produces
// ($97BB's checkpoint, $B981's cheat count, $9B70's stage index), and pins the
// result. THE MUTATION EACH ONE WAS SEEN RED AGAINST IS NAMED IN ITS COMMENT.

import test from 'node:test';
import assert from 'node:assert';

import { introEntryState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { BTN, u8 } from '../src/state.js';
import { introReset, introPackets, introHud } from '../src/flow.js';
import { cannedPacket, copyPacket } from '../src/hudpackets.js';
import { stLives, stTopScore, stScore } from '../src/hud.js';
import { scanQueue } from '../src/vram.js';
import { headlessResources, knownFail } from './helpers.js';

const res = headlessResources(0);

/** The bytes this frame's producers left in $0700, without $8641's stop byte. */
function queueImage(s) {
  return [...s.vram.q.slice(0, s.vram.cursor)];
}

/** Run a producer sequence into a scratch page and return the bytes. */
function produce(fn) {
  const s = introEntryState(res.manifest);
  s.vram.cursor = 0;
  fn(s, res.hudPackets);
  return queueImage(s);
}

// ============================ $9B8E, the index ==============================

test('$9B8E: the checkpoint enters the index SHIFTED, and $9BCC[2] shows it', () => {
  //   9B88  A4 19     LDY $19          the stage
  //   9B8A  A5 3F     LDA $3F          the checkpoint page, just set from $24,X
  //   9B8C  4A        LSR A            <- THE TERM NOTHING IN THE REPO HELD
  //   9B8D  18        CLC
  //   9B8E  79 CC 9B  ADC $9BCC,Y
  //   9B91  A8        TAY
  //
  // WHY THIS TEST EXISTS. Deleting the LSR is green on all 157 unit tests and
  // all 21 scenarios -- INCLUDING tests/flow.test.js's own '$9B3E puts the ship
  // where the cartridge put it', which was written for this term. That test
  // uses $19 = 1, $24 = 4, where the shifted index is 7 and the unshifted is 9,
  // and $9BD4[7] == $9BD4[9], so the two are indistinguishable by their result.
  // The corpus is blind for a different reason: $24 reads 0 on 100% of the 5726
  // compared frames, and 0 >> 1 == 0.
  //
  // $9BCC[2] = 10 is the base index that separates them, and it takes THREE
  // checkpoints to do it -- no single one does, which is the trap the previous
  // test fell into. MEASURED from assets/flow/tables.json (exported from
  // prg.bin at file offset 7132): $9BCC = 0 5 10 0 0 15 20 0 and
  // $9BD4[10..18] = 65 65 75 75 75 65 65 65 A3. Checkpoint 4 alone cannot see a
  // dropped LSR ($9BD4[12] == $9BD4[14] == $75); checkpoint 8 can. Checkpoint 8
  // alone cannot see a `>> 2` ($9BD4[12] again); checkpoint 4 can. So the test
  // is a VECTOR over three checkpoints and its non-vacuity is asserted below by
  // running each wrong model over the same three.
  //
  // RED WHEN: introReset()'s `(state.cam.hi >> 1)` becomes `state.cam.hi`
  //           (M31), or `>> 2` (M31b), or the `+ ...` term is dropped, or the
  //           `$9BCC,Y` base is dropped.
  const base = res.flowTables.read(0x9BCC + 2);
  assert.strictEqual(base, 10, '$9BCC[2] moved under this test');

  // $24 in {0,2,4,6,8} is what $97BB stores: min($3F AND $0E, 8).
  const checkpoints = [2, 4, 8];
  const got = checkpoints.map((cp) => {
    const s = introEntryState(res.manifest);
    s.save26[0] = 2;                              // $26,X -> $19 = 2, stage 3
    s.save24[0] = cp;                             // $24,X -> $3F and $55
    nmi(s, 0, res);
    assert.strictEqual(s.cam.hi, cp, `$9B6A STA $3F for checkpoint ${cp}`);
    assert.strictEqual(s.build.hi, cp, `$9B6C STA $55 for checkpoint ${cp}`);
    return [s.obj.y[0], s.obj.x[0]];
  });
  assert.deepStrictEqual(got, [[0x60, 0x50], [0x70, 0x50], [0x70, 0x50]],
    'stage 3, checkpoints 2/4/8 -> $9BD4[11]/[12]/[14] = $65/$75/$75');

  // NON-VACUITY, asserted rather than believed: every wrong index model must
  // produce a DIFFERENT vector. If one of these ever stops differing, this test
  // has quietly stopped holding that term and says so instead of passing.
  const model = (idx) => checkpoints.map((cp) => {
    const p = res.flowTables.read(0x9BD4 + u8(idx(cp)));
    return [p & 0xF0, u8(p << 4)];
  });
  assert.deepStrictEqual(model((cp) => base + (cp >> 1)), got,
    'the port is not computing $9BCC[$19] + ($3F >> 1) at all');
  for (const [name, idx] of [
    ['the LSR dropped', (cp) => base + cp],
    ['LSR twice', (cp) => base + (cp >> 2)],
    ['$9BCC,Y dropped', (cp) => cp >> 1],
    ['the checkpoint dropped', () => base],
  ]) {
    assert.notDeepStrictEqual(model(idx), got,
      `${name} produces the same three positions: this test is decoration`);
  }
});

test('$9B95 AND #$F0: four bits, on a byte the real $9BD4 cannot supply', () => {
  //   9B92  B9 D4 9B  LDA $9BD4,Y
  //   9B95  29 F0     AND #$F0        <- Y, the high nibble << 4
  //   9BA8  B9 D4 9B  LDA $9BD4,Y
  //   9BAB  0A 0A 0A 0A  ASL x4       <- X, the low nibble << 4
  //
  // MEASURED, and it is why this test is shaped the way it is: NOT ONE of the
  // 25 bytes of $9BD4 has bit 3 set (65 65 65 65 65 65 65 66 66 66 65 65 75 75
  // 75 65 65 65 A3 A5 65 65 65 65 73). So `AND #$F8` -- a mask one bit too wide
  // -- returns the same Y as `AND #$F0` for every start position in the game,
  // on every stage, at every checkpoint. There is no port state, and no
  // cartridge state, that can tell the two apart. Widening the mask is green on
  // the entire gate (M33) and will stay green forever.
  //
  // A parameter no reachable input can witness is pinned against a SYNTHETIC
  // table byte instead -- introReset() reads $9BD4 through res.flowTables, so a
  // stub reader is enough -- and the census above is asserted so that this test
  // starts failing the day a stage with an odd-nibble start position is added.
  //
  // RED WHEN: `packed & 0xF0` becomes `& 0xF8` or `& 0xE0` (M33), or the
  //           `AND #$F0` / `ASL x4` pair is swapped.
  const witnesses = [];
  for (let i = 0; i < 25; i++) {
    if (res.flowTables.read(0x9BD4 + i) & 0x08) witnesses.push(i);
  }
  assert.deepStrictEqual(witnesses, [],
    'a $9BD4 byte now has bit 3 set: drive this from the real table instead');

  // $7D and not $6D: bit 4 must be SET or `AND #$E0` -- the other wrong mask,
  // one bit too NARROW -- gives the same answer as `AND #$F0` and this test
  // would only hold half of what its RED WHEN line claims. $7D & $F0 = $70,
  // $7D & $F8 = $78, $7D & $E0 = $60: three masks, three answers.
  const stub = {
    ...res,
    flowTables: {
      read: (a) => (a === 0x9BD4 ? 0x7D : res.flowTables.read(a)),
      word: (a) => res.flowTables.word(a),
    },
  };
  const s = introEntryState(res.manifest);
  introReset(s, stub);                            // $19 = 0, $3F = 0 -> Y = 0
  assert.strictEqual(s.obj.y[0], 0x70, '$9B95 AND #$F0 on $7D');
  assert.strictEqual(s.obj.x[0], 0xD0, '$9BAB ASL x4 on $7D');
  assert.ok([...s.ring.y].every((v) => v === 0x70), '$9BA0-$9BA6 all 24');
  assert.ok([...s.ring.x].every((v) => v === 0xD0), '$9BB8-$9BBE all 24');
});

// ====================== $9B62-$9B74, the four restores ======================

test('$9B62-$9B74: four restores, indexed by $18, from values the corpus lacks', () => {
  //   9B62  A6 18     LDX $18
  //   9B64  B5 22 / 85 42      $42 := $22,X    the power-up meter cursor
  //   9B68  B5 24 / 85 3F / 85 55   $3F := $55 := $24,X   the checkpoint
  //   9B6E  B5 26 / 85 19      $19 := $26,X    the stage
  //   9B72  B5 28 / 85 1A      $1A := $28,X
  //
  // $22-$29 have been watched addresses since wave 4 and read 0 on all 5726
  // compared frames, so dropping $9B66 or $9B74 is green on the whole corpus
  // (M14, M15) -- the clear at $9B3E has already put a 0 there and the restore
  // puts the same 0 back. All four are given DISTINCT non-zero values here, and
  // player 2's are different again so that an implementation which ignores $18
  // and always reads index 0 fails. ($97A5-$97AB is what writes $22,X; $18 = 1
  // is the two-player game the port's own playerIndex() accepts.)
  //
  // RED WHEN: any of the four stores is dropped, or `state.save2X[p]` becomes
  //           `state.save2X[0]`.
  for (const p of [0, 1]) {
    const s = introEntryState(res.manifest);
    s.zp.player = p;                              // $18
    s.save22[0] = 3;  s.save22[1] = 6;            // $22 / $23
    s.save24[0] = 2;  s.save24[1] = 8;            // $24 / $25
    s.save26[0] = 1;  s.save26[1] = 2;            // $26 / $27
    s.save28[0] = 0x33; s.save28[1] = 0x77;       // $28 / $29
    // Values the clear would otherwise be credited with producing.
    s.zp.meter = 0xEE; s.cam.hi = 0xEE; s.build.hi = 0xEE;
    s.zp19 = 0xEE; s.zp1A = 0xEE;
    introReset(s, res);
    assert.strictEqual(s.zp.meter, [3, 6][p], `$9B66 STA $42 for $18 = ${p}`);
    assert.strictEqual(s.cam.hi, [2, 8][p], `$9B6A STA $3F for $18 = ${p}`);
    assert.strictEqual(s.build.hi, [2, 8][p], `$9B6C STA $55 for $18 = ${p}`);
    assert.strictEqual(s.zp19, [1, 2][p], `$9B70 STA $19 for $18 = ${p}`);
    assert.strictEqual(s.zp1A, [0x33, 0x77][p], `$9B74 STA $1A for $18 = ${p}`);
  }
  // $42 is the ONE byte of the $3D-$97 range that comes back, and the order
  // matters: the clear runs first and the restore second. A restore that ran
  // before the clear would leave $42 at 0 and look identical on the corpus.
  const t = introEntryState(res.manifest);
  t.save22[0] = 5;
  t.zp.weapon = 2; t.zp.options = 2;              // $44/$45, also in the range
  introReset(t, res);
  assert.strictEqual(t.zp.meter, 5, '$9B66 must run AFTER $9B3E\'s clear');
  assert.strictEqual(t.zp.weapon, 0, 'and nothing else in $3D-$97 comes back');
  assert.strictEqual(t.zp.options, 0);
});

test('$9B47: the ring cursor at $0160 is cleared, and it aliases $0160', () => {
  // `$9B4C STA $0100,X` with X = $7F..0 covers $0160-$017F, which is the
  // animation-frame array AND the position ring's cursor -- the port keeps them
  // as two fields (state.obj.animFrame[0] and state.ring.cursor) for one
  // address. Dropping either half is green on the corpus (M48): nothing in
  // these three windows has a non-zero ring cursor at the moment $9B3E runs,
  // because the boot intro starts from a zeroed page and the respawn's align is
  // past $9B3E. It stops being green in wave 5, when a respawn is driven from a
  // play frame that has walked the ring 24 times a second for ten seconds.
  //
  // RED WHEN: `state.ring.cursor = 0` is dropped from introReset(), or the
  //           `state.obj.animFrame.fill(0)` above it is.
  const s = introEntryState(res.manifest);
  s.ring.cursor = 9;                              // $0160, mid-lap
  s.obj.animFrame[0] = 9;                         // the same address
  s.obj.animFrame[31] = 4;                        // $017F, the last byte cleared
  introReset(s, res);
  assert.strictEqual(s.ring.cursor, 0, '$0160 -- the ring cursor');
  assert.strictEqual(s.obj.animFrame[0], 0, '$0160 -- the same byte, other field');
  assert.strictEqual(s.obj.animFrame[31], 0, '$017F is inside `LDX #$7F`');
});

test('$883B STA $0E: $882C zeroes the cursor itself, not the drainer', () => {
  // tests/flow.test.js asserts `s.vram.cursor === 1` after a whole intro frame
  // and names this store -- but the 1 is $8641's terminator on a page whose
  // cursor drainQueue() zeroed at $8099, three calls earlier in the same frame.
  // The assertion holds whether or not $883B exists (M52, docs/knowledge/03
  // shape (c): the check is satisfied by something other than what it names).
  //
  // Calling introReset() directly is the isolation: nothing has drained, so a
  // cursor left over from a producer is still there when $882C runs.
  //
  // RED WHEN: `state.vram.cursor = 0` is dropped from fullScreenLoad().
  const s = introEntryState(res.manifest);
  s.vram.cursor = 40;                             // what $9C1E leaves behind
  introReset(s, res);
  assert.strictEqual(s.vram.cursor, 0, '$883B STA $0E');
  // and the other three stores of the same instruction group, isolated too.
  const t = introEntryState(res.manifest);
  t.zp1F = 2; t.ppu.scrollY = 0x0C; t.ppu.scrollX = 0x77;
  introReset(t, res);
  assert.strictEqual(t.zp1F, 0, '$883F STA $1F');
  assert.strictEqual(t.ppu.scrollY, 0, '$8841 STA $13');
  assert.strictEqual(t.ppu.scrollX, 0, '$8843 STA $12');
});

test('$9B7B/$9B7F: $11 = $1E and $10 = $A8, as the ROM\'s own literals', () => {
  // $11 is not a compared field in scenarios.json at all -- porttrace.mjs peeks
  // it, but no scenario watches $0011 -- so `$11 = $1E` -> `$18` is green on
  // the corpus (M42) and is caught only by flow.test.js's bootState()
  // cross-check, which compares the port against the port: editing both
  // functions the same way passes. These are the ROM bytes, spelled out.
  //
  //   9B7B  A9 1E / 85 11     PPUMASK shadow: BG + sprites + both left columns
  //   9B7F  A9 A8 / 85 10     PPUCTRL shadow: NMI on, sprites from $1000,
  //                           8x16 sprites, nametable 0
  // and $10 is written TWICE on this path -- $886E's $81B5 puts $88 there first
  // and $9B7F overwrites it four instructions later, so the ORDER is the whole
  // content of the assertion.
  //
  // RED WHEN: either literal is changed, or $9B7B/$9B7F are moved before the
  //           `fullScreenLoad()` call that writes $10 = $88.
  const s = introEntryState(res.manifest);
  introReset(s, res);
  assert.strictEqual(s.ppu.mask, 0x1E, '$9B7B LDA #$1E / STA $11');
  assert.strictEqual(s.ppu.ctrl, 0xA8, '$9B7F LDA #$A8 / STA $10, AFTER $81B5');
});

// ======================= $9B01, a sign test on a COUNT =======================

test('$9B01 BMI: $3B,X is a COUNT and only bit 7 spends the button code', () => {
  //   9AFF  A6 18     LDX $18
  //   9B01  B5 3B     LDA $3B,X
  //   9B03  30 16     BMI $9B1B      <- SIGN, not zero
  //
  // $3B,X is incremented by $B981 and decremented by $9B15, so 1..127 are
  // ordinary live values in which the cartridge RUNS the matcher. Modelling the
  // branch as `=== 0` skips it for all 127 of them and is green on the whole
  // corpus (M37): $3B and $3C read 0 on all 5726 compared frames, and
  // flow.test.js only ever uses 0 and $FF -- the two values the two models
  // agree on.
  //
  // RED WHEN: `!(state.cheat[p] & 0x80)` becomes `state.cheat[p] === 0`.
  for (const [count, matcherRuns] of [[0, true], [1, true], [0x7F, true],
                                      [0x80, false], [0xFF, false]]) {
    const s = introEntryState(res.manifest);
    // Reach a paused play frame: the intro cannot pause ($9AD1), and neither
    // can the five frames after it -- $9ADA's third gate is $0D, which is still
    // counting 5,4,3,2,1 down from $9C26.
    while (s.substate !== 0x80) nmi(s, 0, res);
    while (s.ppu.blank !== 0) nmi(s, 0, res);
    nmi(s, BTN.START, res);
    assert.strictEqual(s.zp15, 1, 'test setup: the frame did not pause');
    s.cheat[0] = count;                           // $3B,X
    s.zp33 = 3;                                   // three buttons matched
    nmi(s, BTN.DOWN, res);                        // button 4 of the pause code
    assert.strictEqual(s.zp33, matcherRuns ? 4 : 3,
      `$3B = $${count.toString(16)}: the matcher ${matcherRuns ? 'must' : 'must not'} run`);
  }
});

// ===================== $0700 as an IMAGE, not as a length ====================

test('$9C12: lives, TOP, score -- the queue IMAGE, in the ROM\'s order', () => {
  //   9C12  20 B6 88  JSR $88B6    lives      -> packet $11, $23A2
  //   9C15  20 F6 88  JSR $88F6    TOP score  -> packet $12, $23B4
  //   9C18  20 2C 89  JSR $892C    score      -> packet $13 + $18, $23A8
  //
  // NOTHING IN THE REPO COMPARES THE QUEUE'S CONTENT. scenarios.json watches 57
  // addresses in page 7 and not one of them is in $0700-$079F, where all 149
  // bytes live; the only compared byte is $0E, the LENGTH. Emitting these three
  // producers in the wrong order leaves $0E at 37 either way and is green on
  // all 21 scenarios (M1).
  //
  // The three target addresses are three different rows of the status bar, so
  // the order is visible on screen and is worth a byte-level assertion.
  // MEASURED: $0E = 37 at f285 of the boot and f616 of the respawn (8 + 14 + 14
  // + $8641's one), which the length assertion below re-derives.
  //
  // RED WHEN: the three JSRs in introHud() are reordered (M1), or one is
  //           dropped.
  const s = introEntryState(res.manifest);
  nmi(s, 0, res); nmi(s, 0, res); nmi(s, 0, res);  // states 0, 1, 2
  assert.strictEqual(s.vram.cursor, 37, 'the measured $0E of the state-2 frame');
  const packets = scanQueue(s.vram.q);
  assert.deepStrictEqual(packets.map((p) => p.addr), [0x23A2, 0x23B4, 0x23A8],
    '$88B6 (lives, $23A2), $88F6 (TOP, $23B4), $892C (score, $23A8)');
  assert.deepStrictEqual(packets.map((p) => p.bytes.length), [4, 10, 10]);
  // and the whole image, against the same three producers run in the same order
  // into a scratch page -- so a reorder inside introHud() cannot pass by
  // accident of equal lengths.
  const want = produce((t, P) => { stLives(t, P); stTopScore(t, P); stScore(t, P); });
  assert.deepStrictEqual(queueImage(s).slice(0, want.length), want);
});

test('$9BF0: packet $10, then $19 + 8 mid-run, then 7, then 5', () => {
  //   9BF0  A9 10 / 20 E8 85    packet $10, WITH the prologue
  //   9BF5  A5 19 / 18 / 69 08  A := $19 + 8      <- the ONE thing here that
  //   9BFA  20 F3 85            $85F3, no prologue    depends on the stage
  //   9BFD  A9 07 / 20 E8 85    packet 7
  //   9C02  A9 05 / 20 E8 85    packet 5
  //
  // Three separate mutations of this routine are green on all 21 scenarios,
  // for the same reason as the test above -- only $0E is compared, and packets
  // 5, 7, 8 and 9 are all the same length: swapping $9BFD and $9C02 (M2),
  // and `$19 + 8` -> `$19 + 9` (M23), which is a DIFFERENT stage's background
  // packet at the same address.
  //
  // MEASURED: $0E = 49 at f284 of the boot and f615 of the respawn, i.e. 48
  // packet bytes plus $8641's terminator. I re-read f615 out of
  // tools/oracle/out/scen/intro-respawn.json myself for this test.
  //
  // RED WHEN: $9BFD/$9C02 are swapped (M2), `$19 + 8` becomes `+ 9` (M23), or
  //           $9BF0's canned index changes.
  const s = introEntryState(res.manifest);
  nmi(s, 0, res); nmi(s, 0, res);                 // states 0 then 1
  assert.strictEqual(s.vram.cursor, 49, 'the measured $0E of the state-1 frame');
  const got = queueImage(s).slice(0, 48);

  const want = produce((t, P) => {
    cannedPacket(t, P, 0x10); copyPacket(t, P, 8);
    cannedPacket(t, P, 0x07); cannedPacket(t, P, 0x05);
  });
  assert.strictEqual(want.length, 48, 'the four packets are 48 bytes');
  assert.deepStrictEqual(got, want, '$9BF0-$9C04 in order');

  // ...and the two wrong versions must be DIFFERENT byte strings, or the
  // assertion above is decoration -- which is exactly what happened to $0E.
  const swapped = produce((t, P) => {
    cannedPacket(t, P, 0x10); copyPacket(t, P, 8);
    cannedPacket(t, P, 0x05); cannedPacket(t, P, 0x07);
  });
  const nine = produce((t, P) => {
    cannedPacket(t, P, 0x10); copyPacket(t, P, 9);
    cannedPacket(t, P, 0x07); cannedPacket(t, P, 0x05);
  });
  assert.notDeepStrictEqual(swapped, want, 'packets 5 and 7 are interchangeable');
  assert.notDeepStrictEqual(nine, want, 'packets 8 and 9 are interchangeable');

  // $19 is the only input, so state 1 on another stage must emit another image.
  const t2 = introEntryState(res.manifest);
  t2.save26[0] = 1;                               // $26,X -> $19 = 1
  nmi(t2, 0, res); nmi(t2, 0, res);
  assert.notDeepStrictEqual(queueImage(t2).slice(0, 48), want,
    '$9BF5 ADC #$08: the stage byte did not reach the packet index');
});

// ==================== the phase LENGTH, as a function, not a number ==========

test('$9C28: the intro\'s length is a STAIRCASE in the starting lead', () => {
  // tests/flow.test.js holds the loop shape with ONE non-zero lead ($0100 -> 9
  // frames). That is the only thing in the repo that separates $9C24's `LDA $57
  // / BNE` from a 23-frame counter: wave 4's own reviewer and QA independently
  // built a FAITHFUL counter -- four $9D8E per frame, exit on the 23rd, which
  // reproduces the measured $0E and $57 traces exactly -- and it is GREEN on
  // all 21 oracle scenarios and on 16 of the 17 flow unit tests. One assertion
  // in the whole repo stands between the port and a coincidence dressed as a
  // model, and one assertion is a single point on a curve.
  //
  // So pin the CURVE. MEASURED, by driving the port itself over nine leads
  // (which is legitimate here because the SHAPE is what is asserted -- a
  // staircase of a fixed width, at a fixed granularity, with a floor -- and no
  // counter of any value can produce a staircase at all):
  //
  //   lead   $0000 $0040 $0080 $00C0 $0100 $0140 $0180 $01C0 $0200
  //   frames    23    23    16    16     9     9     2     2     2
  //
  // Three separate facts are in that row and each is a different mutation:
  //   * the STEP is 7 frames per $80 of lead. 128 px / 16 px per block = 28
  //     blocks, at 4 blocks a frame ($9C2C-$9C35) = 7 frames.
  //   * the granularity is $80, not 1: $0040 buys NOTHING, because $9DA7
  //     compares half-pages. A model that subtracted the lead in pixels would
  //     give 22 there.
  //   * the floor is 2 and not 1 -- one frame in which all four calls are
  //     throttled and $57 comes back 1, and then the frame that reads it. The
  //     ROM cannot leave on the frame it throttles: $9C28 tests $57 at the TOP.
  //
  // RED WHEN: introTerrain()'s `$57` test becomes a frame counter of any fixed
  //           value (M57), or the four buildBlock() calls become three or five,
  //           or the exit is taken on the throttled frame itself.
  const lengths = [];
  for (const lead of [0, 0x40, 0x80, 0xC0, 0x100, 0x140, 0x180, 0x1C0, 0x200]) {
    const s = introEntryState(res.manifest);
    nmi(s, 0, res);                               // $9B3E: lead is now exactly 0
    assert.strictEqual(u8(s.build.hi - s.cam.hi), 0, '$9B3E left a lead');
    s.build.lo = u8(s.cam.lo + (lead & 0xFF));    // $54
    s.build.hi = u8(s.cam.hi + (lead >> 8));      // $55
    let n = 0;
    for (let i = 0; i < 80 && s.substate !== 0x80; i++) {
      nmi(s, 0, res);
      if (s.substate === 4) n++;
    }
    assert.strictEqual(s.substate, 0x80, `lead $${lead.toString(16)} never left`);
    lengths.push(n);
  }
  assert.deepStrictEqual(lengths, [23, 23, 16, 16, 9, 9, 2, 2, 2]);
  // and the non-vacuity: a constant is not a staircase. Asserted rather than
  // believed, so that a future edit which flattens the curve says so.
  assert.ok(new Set(lengths).size === 4,
    'the nine leads must produce FOUR distinct lengths or this is decoration');
});

test('introPackets() is $9BF0 alone: $9BED\'s JSR $83AB emits no queue bytes', () => {
  // $9BED is a one-instruction prologue in front of sub_9BF0 -- `JSR $83AB`,
  // the sound stop, which wave 8 owns. It is named in src/flow.js as not
  // ported; this pins the OBSERVABLE consequence of that gap being a gap and
  // not a silent extra: the state-1 frame's image is exactly $9BF0's four
  // packets, with nothing in front of them.
  // RED WHEN: anything is appended to $0700 before $9BF0's first packet.
  const s = introEntryState(res.manifest);
  s.vram.cursor = 0;
  introPackets(s, res);
  const first = scanQueue(s.vram.q)[0];
  assert.strictEqual(s.vram.q[0], 1, 'the first byte is a mode byte, not data');
  assert.strictEqual(first.addr, 0x3F00,
    'the intro\'s first packet is the background palette at $3F00');
  assert.strictEqual(first.bytes.length, 16, 'sixteen palette bytes');
  assert.strictEqual(s.substate, 1, '$9C07 INC $1B');
});

// =========================== the fall-through nobody has ====================

knownFail(
  '$9BF0 falls through into sub_9C09: the routine ENDS with $57 := 0',
  'docs/knowledge/02 trap 1, and the port has it. $9BF0 does not end at $9C07 '
  + 'INC $1B -- it runs straight on into sub_9C09. I dumped the cartridge '
  + 'myself (Gradius (USA).nes, file offset 16 + $9BED - $8000) and the 36 '
  + 'bytes from $9BED are: 20 AB 83 | A9 10 20 E8 85 | A5 19 18 69 08 | 20 F3 '
  + '85 | A9 07 20 E8 85 | A9 05 20 E8 85 | E6 1B | A9 00 85 57 | A9 3F 85 5E '
  + '| 60. So the RTS is at $9C11, not $9C08, and TWO stores are between: '
  + '$9C0B STA $57 (the terrain streamer\'s throttle flag) and $9C0F STA $5E '
  + '(#$3F). src/flow.js introPackets() stops at INC $1B and its instruction '
  + 'listing stops at $9C07, so the gap is not even named. '
  + 'INERT TODAY, and I checked rather than assumed: $9B3E\'s $3D-$97 wipe has '
  + 'already zeroed $57 one frame earlier and intro states 1-3 never call '
  + '$9D8E, so $57 is provably 0 whenever the port reaches state 1; $5E has '
  + 'two writers ($99B5, $9C0F) and ZERO readers in the whole PRG and the port '
  + 'has no field for it. IT GOES LIVE IN WAVE 5: sub_9C09 has two more xrefs, '
  + '$97EB `20 09 9C` JSR $9C09 inside $979D (the respawn, immediately before '
  + '`4C 3E 9B` JMP $9B3E) and $980B `4C 09 9C` JMP $9C09 on the arm that sets '
  + '$1B = $C0 and $0D = 5 WITHOUT going through $9B3E -- and on that path the '
  + 'store is the only thing that clears $57. Owner: wave 5, in '
  + 'src/flow.js introPackets(), which should end `state.build.ahead = 0;` and '
  + 'be reachable as its own export for $979D/$980B to call.',
  () => {
    const s = introEntryState(res.manifest);
    nmi(s, 0, res);                               // $9B3E -> state 1
    s.build.ahead = 1;                            // $57, as $9D8E's throttle
    introPackets(s, res);                         // $9BED/$9BF0 ... and $9C09
    assert.strictEqual(s.build.ahead, 0, '$9C09/$9C0B LDA #$00 / STA $57');
  },
);

// ============================ the split, on an intro =========================

knownFail(
  'an intro frame does not inherit the previous play frame\'s split',
  'MEASURED on the cartridge, tools/oracle/out/scen/intro-respawn.json, which I '
  + 're-read for this test: frames 610-613 are played frames with chrOffset = '
  + '8192 and sprite0Hit = 1, and frame 614 -- the first intro frame, $1B = 1, '
  + '$0D = 6 -- reads chrOffset = 0 and sprite0Hit = 0, as do all 31 frames '
  + '614-644. The port never clears state.bandB.ran on an intro frame: '
  + 'mode5Tail() is its only writer and introStep() correctly never calls it '
  + '($96C2\'s handlers RTS to $80AD), so the last played frame\'s record '
  + 'stands. Both intro scenarios pass only because they enter the intro from '
  + 'createState()\'s default false -- intro-boot from a cold state and '
  + 'intro-respawn from an align of 614, PAST $9B3E. The moment wave 5\'s '
  + '$979D lets the port reach the intro from a play frame, porttrace.mjs '
  + 'sampleRow() reports chrOffset = 8192 and sprite0Hit = 1 for 27 frames on '
  + 'two TIER 1 fields. Owner: wave 5, in src/flow.js introStep().',
  () => {
    const s = introEntryState(res.manifest);
    while (s.substate !== 0x80) nmi(s, 0, res);   // through the intro into play
    for (let i = 0; i < 8; i++) nmi(s, 0, res);   // let $0D expire and the split run
    assert.strictEqual(s.bandB.ran, true, 'test setup: no split to inherit');
    // $8165 and $979D both do exactly this: $1B := 0, and the next mode-5
    // frame is $96BE's intro state 0.
    s.substate = 0;
    nmi(s, 0, res);
    assert.strictEqual(s.substate, 1, 'test setup: that was not an intro frame');
    assert.strictEqual(s.bandB.ran, false,
      'the cartridge reads chrOffset 0 / sprite0Hit 0 on every intro frame');
  },
);
