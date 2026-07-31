// The $96A5 ladder, the five stage-intro states, and pause.
//
// WHAT THE ORACLE ALREADY COVERS, so that this file does not duplicate it: the
// three wave-4 scenarios (`intro-boot`, `intro-respawn`, `pause`) compare every
// watched byte of both intro windows and of a 50-frame pause, per frame,
// against the cartridge. What they CANNOT reach is anything the cartridge does
// not do inside those windows -- and three of this wave's decisions are exactly
// that shape:
//
//   * the intro's exit is a $57 LOOP, not a 23-frame counter. Both measured
//     intros are 23 state-4 frames because $9B3E starts every one of them from
//     a zero streamer lead ($3F and $55 come from the SAME byte, $3E/$54/$58
//     are cleared), so a counter passes BOTH scenarios. The only way to tell
//     them apart is to start the phase with a lead the cartridge does not
//     happen to produce.
//   * the unported ladder arms. A throw cannot be exercised by a comparison
//     that truncates the moment the cartridge enters the state.
//   * $9765, the button-code matcher, whose two non-obvious rules (a frame with
//     nothing pressed does NOT reset the match; the compare is against the
//     whole pressed byte) never fire in a scenario that only taps START.
//
// EVERY TEST HERE HAS BEEN SEEN RED -- the mutation is named in its comment.

import test from 'node:test';
import assert from 'node:assert';

import { bootState, introEntryState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { BTN, u8 } from '../src/state.js';
import { introStep, codeMatch, startPlay } from '../src/flow.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** Run the intro to its exit and return a per-frame trace. */
function runIntro(s, limit = 60) {
  const trace = [];
  for (let i = 0; i < limit; i++) {
    nmi(s, 0, res);
    trace.push({ sub: s.substate, blank: s.ppu.blank, cursor: s.vram.cursor,
                 ahead: s.build.ahead, prog: s.build.prog });
    if (s.substate === 0x80) break;
  }
  return trace;
}

// ------------------------------------------------------- $9B3E, state 0 -----

test('$9B3E puts the ship where the cartridge put it, from the TABLE', () => {
  // $9B88-$9BB8: ONE byte of $9BD4 carries both coordinates -- high nibble Y,
  // low nibble X/16. Stage 0, checkpoint 0 -> $9BCC[0] = 0 -> $9BD4[0] = $65 ->
  // (80, 96), which is where the cartridge's own $0360/$0320 read at f283 of a
  // boot and again at f614 of a respawn ($0360 stepped 174 -> 80 on that single
  // frame). bootState()'s hand-written 80/96 is checked against it below.
  // RED WHEN: the `AND #$F0` / `ASL x4` pair is swapped, or the index drops the
  // ($3F >> 1) term (checkpoint 4 then reads $9BD4[0] and gives 80/96 again).
  const s = introEntryState(res.manifest);
  nmi(s, 0, res);                                   // frame 1 = $9B3E
  assert.strictEqual(s.obj.x[0], 80, '$0360');
  assert.strictEqual(s.obj.y[0], 96, '$0320');
  assert.strictEqual(s.obj.x[1], 80); assert.strictEqual(s.obj.x[2], 80);
  assert.strictEqual(s.obj.y[1], 96); assert.strictEqual(s.obj.y[2], 96);
  assert.ok([...s.ring.x].every((v) => v === 80), '$07A0-$07B7 all seeded');
  assert.ok([...s.ring.y].every((v) => v === 96), '$07C0-$07D7 all seeded');
  assert.strictEqual(s.obj.status[0], 1, '$9BC2 STA $0100');
  assert.strictEqual(s.obj.anim[0], 1, '$9B85 STA $0120');
  assert.strictEqual(s.zp.autofire, 0x14, '$9B5E LDA #$14 / STA $35');
  assert.strictEqual(s.ppu.blank, 6, '$9BC7 STA $0D');
  assert.strictEqual(s.substate, 1, '$9B76 INC $1B');

  // The checkpoint drives BOTH the index and the streamer's page. $24 = 4 is a
  // value $97BB produces (min($3F AND $0E, 8)), so this is not invented state.
  const t = introEntryState(res.manifest);
  t.save24[0] = 4;                                  // $24,X
  nmi(t, 0, res);
  assert.strictEqual(t.cam.hi, 4, '$9B6A STA $3F -- the checkpoint page');
  assert.strictEqual(t.build.hi, 4, '$9B6C STA $55 -- and the build cursor');
  assert.strictEqual(t.obj.x[0], 80, 'stage 1 checkpoint 4 X');
  assert.strictEqual(t.obj.y[0], 96, 'stage 1 checkpoint 4 Y');
  // ...AND IT LOOKS VACUOUS, so here is why it is not, written down because the
  // first version of this test asserted the opposite and was wrong: $9BD4's
  // first ten bytes read 65 65 65 65 65 65 65 66 66 66, and stage 1's base
  // index ($9BCC[0]) is 0, so ALL FIVE of stage 1's checkpoints -- $24 in
  // {0,2,4,6,8}, i.e. indices 0..4 -- start the ship at exactly (80, 96). The
  // arithmetic only shows itself on a later stage. $19 = 1 with checkpoint 4
  // is index $9BCC[1] + 2 = 7 -> $66 -> (96, 96): the same Y, a different X.
  const u = introEntryState(res.manifest);
  u.save26[0] = 1;                                  // $26,X -> $19 at $9B70
  u.save24[0] = 4;
  nmi(u, 0, res);
  assert.strictEqual(u.zp19, 1, '$9B70 STA $19');
  const packed = res.flowTables.read(0x9BD4 + 5 + 2);
  assert.strictEqual(packed, 0x66, 'the table moved under this test');
  assert.strictEqual(u.obj.y[0], packed & 0xF0, 'stage 2 checkpoint 4 Y');
  assert.strictEqual(u.obj.x[0], u8(packed << 4), 'stage 2 checkpoint 4 X');
  assert.notStrictEqual(u.obj.x[0], 80,
    'the index arithmetic is unexercised: stage 2 gave stage 1\'s X');
});

test('$9B3E wipes the power-ups and $48, and does NOT wipe $0180 or $0380', () => {
  // `LDX #$5A / STA $3D,X` is $3D-$97, so $40/$41/$44/$45/$46 and the HUD's
  // rotation phase $48 all go. `LDX #$7F` is 128 bytes per page, so $0100-$017F
  // and $0300-$037F only -- the attribute-mask array at $0180 and the X
  // sub-pixel accumulator at $0380 SURVIVE a respawn. That asymmetry is the
  // ROM's and a port that clears "the object arrays" gets it wrong.
  // RED WHEN: the clear is widened to obj.xf/obj.attrMask, or $48 is left out
  // of clearZeroPage().
  const s = introEntryState(res.manifest);
  s.zp.speed = 6; s.zp.missile = 1; s.zp.weapon = 2; s.zp.options = 2;
  s.zp.shield = 5; s.zp48 = 0x2E; s.zp47 = 9; s.squad[2] = 4;
  s.obj.xf[0] = 0x77; s.obj.attrMask[3] = 0x33;
  s.obj.yf[0] = 0x88; s.coll[5] = 0xFF;
  s.obj.type[12] = 0x85; s.obj.status[12] = 1; s.obj.timer[12] = 6;
  s.obj.animFrame[13] = 3; s.obj.anim[14] = 0x21;
  s.spawn.z6A = 0x44; s.spawn.z60 = 2;
  nmi(s, 0, res);
  for (const [name, got] of [['$40', s.zp.speed], ['$41', s.zp.missile],
    ['$44', s.zp.weapon], ['$45', s.zp.options], ['$46', s.zp.shield],
    ['$47', s.zp47], ['$48', s.zp48], ['$4A', s.squad[2]],
    ['$6A', s.spawn.z6A], ['$60', s.spawn.z60],
    ['$030C', s.obj.type[12]], ['$010C', s.obj.status[12]],
    ['$014C', s.obj.timer[12]], ['$016D', s.obj.animFrame[13]],
    ['$012E', s.obj.anim[14]],
    ['$0340', s.obj.yf[0]], ['$0505', s.coll[5]]]) {
    assert.strictEqual(got, 0, `${name} survived $9B3E's clear`);
  }
  assert.strictEqual(s.obj.xf[0], 0x77,
    '$0380 is PAST $9B47\'s `LDX #$7F` and must survive');
  assert.strictEqual(s.obj.attrMask[3], 0x33,
    '$0180 is PAST $9B47\'s `LDX #$7F` and must survive');
});

test('$882C leaves $0E/$1F/$12/$13 zeroed and costs the next NMI', () => {
  // The 2304 $2007 writes are not ported; these four stores and the frame
  // overrun are. MEASURED: probe.lua and objloop.lua both report
  // lag.dropAtGameFrame = 283 on "200:,10:S,190:" and 283 AND 614 on the same
  // script with a death -- the two frames that run $9B3E, and no others in
  // either run.
  // RED WHEN: `state.frameDrops = 1` is dropped from fullScreenLoad() -- the
  // intro-boot scenario's lag line goes rom 1 / port 0.
  const s = introEntryState(res.manifest);
  s.zp1F = 2; s.ppu.scrollX = 99; s.ppu.scrollY = 0x0C;
  nmi(s, 0, res);
  assert.strictEqual(s.zp1F, 0, '$883F STA $1F');
  assert.strictEqual(s.ppu.scrollX, 0, '$8843 STA $12');
  assert.strictEqual(s.ppu.scrollY, 0, '$8841 STA $13 -- AFTER $9650 set it to 12');
  assert.strictEqual(s.vram.cursor, 1, '$883B STA $0E, then $8641 adds one byte');
  assert.strictEqual(s.frameDrops, 1, 'the $882C frame did not cost an NMI');
  nmi(s, 0, res);
  assert.strictEqual(s.frameDrops, 0, 'the overrun was charged to a second frame');
});

// ------------------------------------------------- the intro as a sequence ---

test('the intro is $9C24 looping on $57, not a 23-frame counter', () => {
  // THE TEST THE ORACLE CANNOT BE. Both measured intros are 23 state-4 frames,
  // so a counter passes intro-boot AND intro-respawn. The reason they agree is
  // structural: $9B3E sets $3F and $55 from the SAME byte and clears $3E, $54
  // and $58, so the 16-bit lead at $9D96 is exactly 0 at every intro. From a
  // zero lead the throttle at $9DA7 first refuses on block 85 ($0180 = 384 px =
  // three 128-px half-pages of 28 blocks) and $9C24 emits four a frame: 84
  // blocks over 21 frames, all four calls of frame 22 throttled, frame 23 reads
  // $57 and leaves.
  //
  // Start the phase with the cursor already 256 px ahead and the same loop must
  // end sooner. $54/$55 = camera + $0100 is a state $9F94's own advance
  // produces on every second half-page of ordinary play.
  // RED WHEN: introTerrain() is given a frame counter instead of the $57 test.
  const s = introEntryState(res.manifest);
  const base = runIntro(s);
  const state4 = base.filter((r) => r.sub === 4).length;
  assert.strictEqual(state4, 23,
    'the measured intro is 23 frames of $1B = 4 (f287-f309, f618-f640)');
  assert.strictEqual(base.length, 27, 'and 27 mode-5 frames in total');

  const t = introEntryState(res.manifest);
  nmi(t, 0, res);                                   // $9B3E, lead now 0
  assert.strictEqual(t.substate, 1);
  t.build.hi = u8(t.cam.hi + 1);                    // $55 -- a lead of $0100
  const rest = runIntro(t);
  const shorter = rest.filter((r) => r.sub === 4).length;
  assert.ok(shorter < 23,
    `a $0100 head start must shorten the phase; got ${shorter} frames of $1B = 4`);
  assert.strictEqual(shorter, 9,
    'from a $0100 lead the throttle is ONE half-page (28 blocks = 7 frames) '
    + 'away, so 7 building frames + 1 throttled + 1 exit');
});

test('the intro re-arms $0D every frame: 6, 3, 3, 3, then 5 until it exits', () => {
  // $96C0 stores 3 BEFORE the dispatch and the handler then stores 6 (state 0)
  // or 5 (state 4) over it, which is why the sequence is not a countdown.
  // MEASURED at the $80B5 sample of the boot: 6,3,3,3,5x23 then 4,3,2,1,0.
  // RED WHEN: `state.ppu.blank = 3` is moved after the dispatch in introStep().
  const s = introEntryState(res.manifest);
  const trace = runIntro(s);
  assert.deepStrictEqual(trace.slice(0, 4).map((r) => r.blank), [6, 3, 3, 3]);
  assert.ok(trace.slice(4).every((r) => r.blank === 5), '$9C26 STA $0D');
  // and the four frames after: the split is refused until $0D reaches 0.
  const after = [];
  for (let i = 0; i < 5; i++) { nmi(s, 0, res); after.push([s.ppu.blank, s.bandB.ran]); }
  assert.deepStrictEqual(after, [[4, false], [3, false], [2, false], [1, false],
                                 [0, true]],
    'the split must first fire on the frame $0D reaches 0 (cartridge f314)');
});

test('the intro queues 1, 49, 37, 40 then 149 bytes -- the measured $0E', () => {
  // Each number is a whole frame's $0E at the $80B5 sample, MEASURED on the
  // cartridge at f283-f287 (boot) and f614-f618 (respawn), and each is a
  // different producer: $882C's zero plus $8641's terminator; $9BF0's four
  // canned packets; $9C12's three HUD producers; $9C1E's meter; and $9C24's
  // four UNGATED $9D8E blocks (4 x 37 + 1).
  // RED WHEN: $9BFA is given the $85E8 prologue instead of $85F3 (50, not 49),
  // or introTerrain() calls streamBlock() instead of buildBlock() (38, not 149
  // -- the $0E < 4 gate refuses after the first block).
  const s = introEntryState(res.manifest);
  const trace = runIntro(s);
  assert.deepStrictEqual(trace.slice(0, 4).map((r) => r.cursor), [1, 49, 37, 40]);
  assert.deepStrictEqual(trace.slice(4, 25).map((r) => r.cursor),
    new Array(21).fill(149));
  assert.strictEqual(trace[25].cursor, 1, 'the throttled frame queues nothing');
});

test('the intro ends at $9C3C: $60 = 1, $1B = $80, $1F = 1 (the handover)', () => {
  // $9C38 sets $1F = 1 and FALLS THROUGH into $9C3C. $1F = 1 is the sprite-0
  // handover the corpus otherwise has to inject by poke (scenarios.json
  // s0-handover) -- here the port produces it itself, which is what that
  // scenario's own note said was missing.
  // RED WHEN: `state.zp1F = 1` is dropped from introTerrain(), or startPlay()
  // is called on the $57 == 0 path as well.
  const s = introEntryState(res.manifest);
  runIntro(s);
  assert.strictEqual(s.substate, 0x80, '$9C42 STA $1B');
  assert.strictEqual(s.spawn.z60, 1, '$9C3E STA $60');
  assert.strictEqual(s.zp1F, 1, '$9C3A STA $1F');
  nmi(s, 0, res);
  assert.strictEqual(s.zp1F, 2, '$8B25 promotes the handover on the next build');
  assert.strictEqual(s.zp1E, 0, 'and $1E is still 0 for that one frame');
  assert.strictEqual(s.bandB.ran, false, 'so the split is still refused');
});

test('the intro reproduces bootState()\'s hand-written play state', () => {
  // src/main.js bootState() carries eleven constants "the oracle READ at a
  // stage-1 gameplay frame". The intro now COMPUTES most of them, so they stop
  // being assertions and become a check.
  // RED WHEN: either function is edited without the other -- which is the
  // failure this exists to catch.
  const s = introEntryState(res.manifest);
  runIntro(s);
  const b = bootState(res.manifest);
  for (const [name, got, want] of [
    ['$0360', s.obj.x[0], b.obj.x[0]], ['$0320', s.obj.y[0], b.obj.y[0]],
    ['$0361', s.obj.x[1], b.obj.x[1]], ['$0321', s.obj.y[1], b.obj.y[1]],
    ['$0100', s.obj.status[0], b.obj.status[0]],
    ['$0120', s.obj.anim[0], b.obj.anim[0]],
    ['$35', s.zp.autofire, b.zp.autofire],
    ['$10', s.ppu.ctrl, b.ppu.ctrl], ['$11', s.ppu.mask, b.ppu.mask],
    ['$13', s.ppu.scrollY, b.ppu.scrollY],
    ['$3F', s.cam.hi, b.cam.hi], ['$3E', s.cam.lo, b.cam.lo],
    ['$07A0', s.ring.x[0], b.ring.x[0]], ['$07C0', s.ring.y[0], b.ring.y[0]],
  ]) {
    assert.strictEqual(got, want, `${name}: the intro produces ${got}, `
                                + `bootState() claims ${want}`);
  }
  // $48 is deliberately NOT in that list: bootState() seeds $2E because align
  // 400 is 90 frames of play after the intro, and $9B3E leaves it at 0.
  assert.strictEqual(s.zp48, 0, '$9B3E clears $48; align 400 has $2E');
});

// ------------------------------------------------------- the ladder's arms ---

test('$96A5: every unported arm throws with the ROM address it would reach', () => {
  // A ladder, not a switch: the arms are tested in bit order, so $1B = $30
  // takes the bit-4 arm and never sees bit 5. Each throw names the address so
  // that a crash report identifies the arm without a re-derivation.
  // RED WHEN: any arm is turned into an early return -- the corpus cannot catch
  // that, because compare.mjs truncates the moment the cartridge enters the
  // state (MODELLED_1B).
  for (const [sub, addr] of [[0x10, '$96CF'], [0x90, '$96CF'],
                             [0x40, '$96FB'], [0x30, '$96CF'],
                             [0x81, '$982A'], [0x8F, '$982A']]) {
    const s = bootState(res.manifest);
    s.substate = sub;
    assert.throws(() => nmi(s, 0, res), new RegExp(`\\${addr}`),
      `$1B = $${sub.toString(16)} should have thrown at ${addr}`);
  }
  // $19 == 4 is the stage-5 census arm at $9663, tested BEFORE the ladder.
  const s5 = bootState(res.manifest);
  s5.zp19 = 4;
  assert.throws(() => nmi(s5, 0, res), /\$9663/);
  // and a $1B past jt_96C5's five entries is a bad table index, not an arm.
  const s6 = bootState(res.manifest);
  s6.substate = 5;
  assert.throws(() => nmi(s6, 0, res), /\$96C2/);
});

test('$96EF: the dying arm DECs $4C and reaches $979D at zero', () => {
  // Structure only -- $C1D6, which is what sets $1B = $A0, is wave 5. MEASURED
  // on "200:,10:S,190:,300:R": $C1D6 fired once at f493, $4C stepped 120 -> 0
  // over f494-f613, and $979D ran at f614. 120 frames exactly.
  // RED WHEN: dyingArm() tests $4C AFTER decrementing it (the countdown then
  // runs 121 frames and the respawn lands a frame late).
  const s = bootState(res.manifest);
  s.substate = 0xA0;                                // $C1F1 STA $1B
  s.zp4C = 0x78;                                    // $C1E0 STA $4C
  s.obj.status[0] = 2;                              // $C1E4 -- $9FFC's dead gate
  for (let i = 0; i < 120; i++) nmi(s, 0, res);
  assert.strictEqual(s.zp4C, 0, '120 frames of $96F6 DEC $4C');
  assert.throws(() => nmi(s, 0, res), /\$979D/);
});

test('$96EF: a dying frame still runs the enemies and still streams', () => {
  // `$96F8 JMP $9A5E` is the FULL body, not the tail: the spawn engine, the
  // enemy-bullet engine, the player (which bails at its own $0100 >= 2 gate)
  // and the enemy update all run while the ship is exploding. The measured
  // consequence is that $8898 was called on all 120 death frames of the
  // right-wall run (h_8898 = 363 over 700 frames).
  // RED WHEN: dyingArm() calls mode5Tail() instead of mode5Body().
  const s = bootState(res.manifest);
  s.substate = 0xA0; s.zp4C = 0x78; s.obj.status[0] = 2;
  const x = s.obj.x[0];
  const prog = s.build.prog;
  for (let i = 0; i < 8; i++) nmi(s, 0, res);
  assert.strictEqual(s.obj.x[0], x, 'the player moved while dying');
  assert.strictEqual(s.work.enemySlots, 10, '$ADAB ran 10 slots on a dying frame');
  assert.notStrictEqual(s.build.prog, prog, 'the streamer stood down while dying');
});

// ------------------------------------------------------------------ pause ---

test('$9ADA: START toggles $15 on the EDGE, and only when the gates are clear', () => {
  // $9AE2 reads $05 (pressed), not $07 (held), so holding START pauses once.
  // $9ADA's three gates are $09 (demo), $16 and $0D (blanking).
  // RED WHEN: pauseCheck() reads state.input.held, or any of the three gates is
  // dropped -- none of which the corpus can see, because $09/$16 are 0 on every
  // frame and $0D is 0 on every PLAYED frame.
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  // ASSERTED AFTER EVERY FRAME, not once at the end, and that is the whole
  // test: an edge-vs-held mistake TOGGLES, so a held-START run of an odd
  // length ends on $15 = 1 and looks right. The first version of this test held
  // START for five frames and checked the end state -- the `held` mutation was
  // green on it AND on the pause scenario (which presses for one frame, where
  // $05 and $07 are the same byte). Two green checks, one live defect.
  for (let i = 0; i < 6; i++) {
    nmi(s, BTN.START, res);
    assert.strictEqual(s.zp15, 1,
      `frame ${i} of a HELD START: $9AE2 reads $05, so it pauses once and stays`);
  }

  // ...and the case that actually separates $05 from $07, because the one
  // above does not: with the resume arm also reading $05, a held-START model
  // latches $15 at 1 and looks identical. START pressed WHILE $0D blocks
  // consumes its edge; when the blank ends there is no edge left, so the
  // cartridge does not pause. A `held` model pauses on the frame $0D reaches 0.
  // RED WHEN: $9AE8's test reads state.input.held.
  const b = bootState(res.manifest);
  nmi(b, 0, res);
  b.ppu.blank = 4;                                     // $0D, mid-countdown
  for (let i = 0; i < 6; i++) nmi(b, BTN.START, res);  // pressed once, held on
  assert.strictEqual(b.ppu.blank, 0, 'test setup: the blank never expired');
  assert.strictEqual(b.zp15, 0,
    '$9AE2 LDA $05: the edge was spent while $0D blocked and does not come back');

  for (const [name, set] of [['$09 (demo)', (t) => { t.zp09 = 1; }],
                             ['$16', (t) => { t.zp16 = 1; }],
                             ['$0D (blanking)', (t) => { t.ppu.blank = 3; }]]) {
    const t = bootState(res.manifest);
    nmi(t, 0, res);
    set(t);
    nmi(t, BTN.START, res);
    assert.strictEqual(t.zp15, 0, `${name} should have blocked the pause`);
  }
  // $9AD5 AND #$70: not while dying or in game over either.
  const d = bootState(res.manifest);
  d.substate = 0xA0; d.zp4C = 8; d.obj.status[0] = 2;
  nmi(d, BTN.START, res);
  assert.strictEqual(d.zp15, 0, '$9AD5 must refuse to pause a dying frame');
});

test('a paused frame freezes the camera and the ship but NOT the streamer', () => {
  // $9660 jumps to $9A8C, which is past the player and the scroll latch and
  // BEFORE $9AC4/$9AC7/$9ACE -- so the HUD tick and the terrain streamer keep
  // running while paused, and so does the split ($15 skips only $9AA0).
  // MEASURED: START at f450 froze $3E at 68 for 50 frames while the picture
  // kept its two bands (00-recon-flow.md 8).
  // RED WHEN: the pause arm returns instead of calling mode5Tail().
  const s = bootState(res.manifest);
  for (let i = 0; i < 4; i++) nmi(s, 0, res);
  nmi(s, BTN.START, res);
  assert.strictEqual(s.zp15, 1);
  const cam = [s.cam.sub, s.cam.lo, s.cam.hi];
  const x = s.obj.x[0], ring = s.ring.cursor, prog = s.build.prog;
  for (let i = 0; i < 50; i++) nmi(s, BTN.RIGHT, res);
  assert.deepStrictEqual([s.cam.sub, s.cam.lo, s.cam.hi], cam, 'the camera moved');
  assert.strictEqual(s.obj.x[0], x, 'the ship moved while paused');
  assert.strictEqual(s.ring.cursor, ring, 'the position ring advanced');
  assert.strictEqual(s.bandB.ran, true, '$15 must not take the split');
  assert.notStrictEqual(s.build.prog, prog,
    '$9ACE is past the pause jump and the streamer must still run');

  nmi(s, BTN.START | BTN.RIGHT, res);
  assert.strictEqual(s.zp15, 0, '$9B23 STA $15 -- the second press resumes');
  // $9B25 INC $5B is the last thing the frame does and $9658 is the fourth
  // instruction of the next one, so the value exists for exactly the gap
  // between two frames and no reader of $5B ever sees it. Both halves asserted,
  // because "nothing reads it" is why a port would leave the store out.
  assert.strictEqual(s.zp5B, 1, '$9B25 INC $5B was not ported');
  nmi(s, BTN.RIGHT, res);
  assert.strictEqual(s.zp5B, 0, '$9658 must clear it on the very next frame');
  assert.notDeepStrictEqual([s.cam.sub, s.cam.lo, s.cam.hi], cam,
    'the camera did not resume');
});

test('$9765: no button pressed does not reset the match, and $33 walks', () => {
  // Two rules a re-implementation drops by default. $9777 `BEQ $9784` returns
  // BEFORE the compare when $05 is 0, so gaps between presses are free; and
  // $9779 compares the whole pressed byte, so UP+DOWN never matches UP.
  // Ported because $9AFF runs it on EVERY paused frame -- $33 is live state
  // whenever anything is paused, and the corpus's own pause scenario only ever
  // presses START, which is a mismatch on button 1 and proves neither rule.
  // RED WHEN: the `pressed === 0` early return is removed (the sequence below
  // resets to 0 on the idle frame), or the compare is masked.
  const s = bootState(res.manifest);
  const code = [BTN.UP, BTN.UP, BTN.DOWN, BTN.DOWN, BTN.LEFT, BTN.RIGHT,
                BTN.LEFT, BTN.RIGHT, BTN.B, BTN.A];
  for (let i = 0; i < code.length; i++) {
    s.input.pressed = code[i];
    codeMatch(s, res, 2);
    assert.strictEqual(s.zp33, i + 1, `button ${i} of the pause code`);
    s.input.pressed = 0;                            // an idle frame in between
    codeMatch(s, res, 2);
    assert.strictEqual(s.zp33, i + 1, 'an idle frame reset the match');
  }
  // a wrong button restarts, and two at once is wrong
  s.zp33 = 0; s.input.pressed = BTN.UP | BTN.DOWN;
  codeMatch(s, res, 2);
  assert.strictEqual(s.zp33, 0, 'UP+DOWN matched UP');
  // $33 with bit 7 set means the code is spent: $9773 BMI returns at once.
  s.zp33 = 0x80; s.input.pressed = BTN.UP;
  codeMatch(s, res, 2);
  assert.strictEqual(s.zp33, 0x80, '$9773 BMI $9784');
});

test('$9B10: entering the pause code is a loud throw, not a silent cheat', () => {
  // $9C5E ($46 = 5, $41 = 1, $40 = 1, $45 = 2) is listing-only -- no measured
  // run has reached it -- so it is a named throw rather than four plausible
  // stores. The matcher that leads to it IS ported, which is the difference
  // between an honest gap and a missing subsystem.
  // RED WHEN: the throw is replaced by the four stores.
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  nmi(s, BTN.START, res);
  assert.strictEqual(s.zp15, 1);
  s.zp33 = 9;                                       // one button from the code
  assert.throws(() => nmi(s, BTN.A, res), /\$9B10/);
  // ...unless the player has already spent it: $9B01 BMI skips the matcher.
  const t = bootState(res.manifest);
  nmi(t, 0, res);
  nmi(t, BTN.START, res);
  t.zp33 = 9; t.cheat[0] = 0xFF;                    // $3B,X after one $9B15 DEC
  nmi(t, BTN.A, res);
  assert.strictEqual(t.zp33, 9, '$9B03 BMI $9B1B skipped the matcher');
});

// ------------------------------------------------------------- housekeeping --

test('$9C3C is reachable as a subroutine, because $96E9 calls it', () => {
  // Not a refactor: `$96E9 JSR $9C3C` is the next-stage arm calling the same
  // two stores $9C24 falls through into. Kept separate so that arm has
  // something to call when it lands.
  const s = bootState(res.manifest);
  s.substate = 0; s.spawn.z60 = 0;
  startPlay(s);
  assert.strictEqual(s.substate, 0x80);
  assert.strictEqual(s.spawn.z60, 1);
});

test('introStep() sets $0D before dispatching, on every one of the five states', () => {
  // $96BE `LDX #$03 / STX $0D` runs BEFORE $96C2's JSR, so even the states that
  // do not touch $0D leave it at 3.
  for (const sub of [1, 2, 3]) {
    const s = introEntryState(res.manifest);
    s.substate = sub;
    s.ppu.blank = 0;
    introStep(s, res);
    assert.strictEqual(s.ppu.blank, 3, `state ${sub} did not re-arm $0D`);
    assert.strictEqual(s.substate, sub + 1, `state ${sub} did not INC $1B`);
  }
});
