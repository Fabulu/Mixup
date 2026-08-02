// The gates around the mode-5 body, the camera, the split and the streamer --
// and the one byte at the end of the frame.
//
// WHY THIS FILE EXISTS. Every fact checked here was, until wave 1, either
// modelled backwards in src/ or not modelled at all, and NOT ONE of them cost
// the 16-scenario corpus a single frame: $15, $5B and $0D were 0 on all 3341
// compared frames and $1E/$1F were 1/2 on all of them. That is
// docs/knowledge/03's third shape exactly -- a field that never varies inside
// the corpus can carry a wrong model forever. So these are unit tests with
// hand-set gate bytes, deliberately, because the corpus could not reach them.
//
// WAVE 4 REACHED THREE OF THEM WITH REAL SCENARIOS -- $15 (`pause`), $0D and
// $1F (`intro-boot`, where the blank runs for 27 frames and $1F steps 0 -> 1 ->
// 2) -- and the tests below stay, because a unit test that drives a gate byte
// directly is still the only thing that separates the cases the CARTRIDGE never
// produces (a $5B raised inside the frame, $1E without $1F).
//
//   $80B0 JSR $8641      one $00 appended per non-lag frame       (was absent)
//   $9D89 CMP #$04       the gate counts BYTES, not packets       (was packets)
//   $9DA1 BMI            build on a NEGATIVE 16-bit lead          (was refused)
//   $9D90 / $9DAF        $57 is written by the streamer           (was frozen)
//   $9A88-$9A94          what suppresses the SPLIT                (was $15/$5B)
//   $9A98/$9A9C          what $15/$5B suppress: the CAMERA        (was the split)
//   $9ABA AND #$FC       band B is band A's $10, nametable masked
//   $8B1A-$8B2B          $1E/$1F are bytes, and $1F == 1 is a handover frame
//   $9656-$965A          mode 5 CLEARS $5D/$5B/$5C at entry  (was a knownFail;
//                        wave 3 ported the three stores because $BBB7 reads
//                        $5D, the wrapper reported SURPRISE PASS, and the
//                        assertions were kept -- see the test)
//   $9A9C / $9ACA        a $5B raised INSIDE the frame stops the camera and
//                        the streamer, and is gone by the next one (wave 3;
//                        this closes wave 1's written-down coverage debt)
//   $965C-$9660          pause jumps the WHOLE body to $9A8C  (was a knownFail
//                        for three waves; wave 4 ported it and the wrapper came
//                        off on the first run -- see the test)
//   $864A INX            $0E is an 8-bit byte and wraps    (was a knownFail;
//                        wave 2's byte-image $0700 fixed it and the wrapper
//                        was removed the same commit -- a surprise PASS is a
//                        FAILURE, and this one surprised)
//
// EVERY TEST HERE HAS BEEN SEEN RED. The mutation that turns each one red is
// named in its own comment, and the whole table is in
// docs/worklog/gradius/01-test-hardening.md with the measured output.
//
// A NOTE ON THE knownFail ENTRIES, because they are the point of this
// file rather than an apology for it: wave 1 shipped a test asserting that a
// $5B freeze is PERMANENT. The cartridge clears $5B at $9658 on every mode-5
// frame, so that test blessed a defect and blocked the faithful fix. Wave 1's
// hardening replaced it with a knownFail stating what the ROM does; wave 3
// ported the clear and the knownFail retired itself. That is TWO waves of a
// defect surviving inside a green suite, and the only thing that ended it was
// writing the cartridge's behaviour down as a failing assertion.

import test from 'node:test';
import assert from 'node:assert';

import { bootState } from '../src/main.js';
import { nmi, mode5Tail } from '../src/nmi.js';
import { BTN } from '../src/state.js';
import { streamBlock } from '../src/terrain.js';
import { drainQueue, queuePacket, queueTerminator, scanQueue,
         QUEUE_GATE_BYTES } from '../src/vram.js';
import { buildDisplayList, SPRITE0, SPRITE0_OFF } from '../src/oam.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** The packets $8A51 would find in $0700 right now. */
const packets = (s) => scanQueue(s.vram.q);
/** Packet bytes as they sit in $0700: [mode][hi][lo][data...][$FF]. */
const packetBytes = (s) => packets(s).reduce((n, p) => n + 4 + p.bytes.length, 0);
/** The camera's three bytes, $3D/$3E/$3F, as one comparable value. */
const cam24 = (s) => [s.cam.sub, s.cam.lo, s.cam.hi];

/**
 * Hold the terrain streamer off for a whole NMI, WITHOUT using $3A.
 *
 * $3A used to be the lever here and it cannot be any more: wave 3 ported
 * $A2C0, whose FIRST instruction is `LDA $3A / BEQ $A2C7 / JMP $C413`. So on
 * the cartridge a frame with $3A up does not merely stand the streamer down --
 * it diverts the whole enemy spawn path into $C413, which every fourth frame
 * clears an enemy slot and jumps to the stage-end spawner at $C686. Setting
 * $3A and running a full frame was therefore always a broader intervention
 * than the tests that used it intended; src/enemies.js now says so out loud.
 *
 * This uses the streamer's OTHER measured refusal instead: $9D96-$9DAD, the
 * 16-bit lead of the build cursor over the camera. A lead of $0200 lands in
 * the "high byte is 2, neither negative nor below 1" arm at $9DA7, which
 * refuses and INCs $57. It survives several frames because the camera only
 * closes the gap by half a pixel each one.
 *
 * $3A's own effect on the streamer is still covered, directly and without an
 * NMI, by the `$3A / $57` test further down this file.
 */
function holdStreamerOff(s) {
  const lead = (((s.cam.hi << 8) | s.cam.lo) + 0x0200) & 0xFFFF;
  s.build.hi = lead >> 8;                 // $55
  s.build.lo = lead & 0xFF;               // $54
  s.build.prog = 0;                       // $58 -- the lead is only tested at 0
}

// ---------------------------------------------------------------- the queue --

test('$80B0 JSR $8641 appends exactly one $00 to the queue every non-lag frame', () => {
  // $8641: LDA #$00 / BEQ $8645 / LDX $0E / STA $0700,X / INX / STX $0E / RTS.
  // MEASURED on the cartridge at the $80B5 sample point: $0E reads 1 on a frame
  // whose only producer is this one (game frame 401 of every scenario), 38 on a
  // frame that also streamed a terrain block (37 packet bytes + this one), and
  // 9 / 15 / 40 on the frames the HUD tick also ran (8/14/39 + this one).
  // RED WHEN: queueTerminator's body is deleted -- assertion 1.
  // $02 is set ODD before each call so that $80BE's INC leaves it EVEN when
  // $889F reads it, and $88A2's BCC keeps the HUD out of a test about $8641.
  // The HUD's own contribution to $0E is tests/hud.test.js's business.
  const s = bootState(res.manifest);
  holdStreamerOff(s);                     // NOT $3A any more -- see the helper
  s.frame = 1;
  nmi(s, 0, res);
  assert.strictEqual(packets(s).length, 0, 'nothing else should have produced');
  assert.strictEqual(s.vram.cursor, 1, '$0E should be exactly the $8641 byte');

  // and on a frame that streams, the byte sits on top of the packets
  s.build.lo = s.cam.lo; s.build.hi = s.cam.hi;   // lead 0 -> $9DA5 BCC, build
  s.frame = 1;
  nmi(s, 0, res);
  assert.ok(packets(s).length > 0, 'the streamer emitted nothing to check against');
  assert.strictEqual(s.vram.cursor, packetBytes(s) + 1,
    '$0E is not the packet bytes plus the $8641 terminator');
  assert.strictEqual(s.vram.cursor, 38, 'one terrain block is 4*8 + 5 + 1 = 38 bytes');

  // A lag frame bails at $80B7, long before $80B0.
  const before = s.vram.cursor;
  s.frame = 1;
  nmi(s, 0, res, true);
  assert.strictEqual(s.frame, 1, 'a lag frame ran $80BE INC $02');
  assert.strictEqual(s.vram.cursor, before, 'a lag frame appended the terminator');
});

test('$8A7B zeroes $0E: the terminator never reaches the next frame\'s gate', () => {
  // Worth asserting rather than assuming: $80B0 runs AFTER $9ACE, so if the
  // drain did not clear the cursor the terminator alone would be 1 byte short
  // of the 4-byte gate after four idle frames and the streamer would stall.
  const s = bootState(res.manifest);
  for (let i = 0; i < 6; i++) nmi(s, 0, res);
  assert.ok(s.vram.cursor < 40, `$0E ran away to ${s.vram.cursor}`);
  drainQueue(s);
  assert.strictEqual(s.vram.cursor, 0);
});

test('$9D89 CMP #$04: THREE bare bytes in $0E build, FOUR refuse', () => {
  // The gate is `LDA $0E / CMP #$04 / BCC`. Four BYTES is less than one packet's
  // three-byte header, so a packet count can never be the same test. It gave the
  // same answer only because the drainer zeroes $0E at $8099 and the streamer is
  // the port's only producer -- i.e. the gate always read 0.
  //
  // THE NUMBERS BELOW ARE SPELLED OUT, NOT TAKEN FROM QUEUE_GATE_BYTES, and that
  // is the whole difference between this version and wave 1's. The old test
  // looped `i < QUEUE_GATE_BYTES` and then `i < QUEUE_GATE_BYTES - 1`, so it
  // passed for ANY value >= 1: QA set the constant to 1, 3 and 64 in turn and
  // every unit test and all 3341 compared frames stayed green. A check that
  // takes the answer in as an argument is docs/knowledge/03's first shape.
  //
  // RED WHEN: QUEUE_GATE_BYTES is 1 or 3 (the three-byte case refuses) or 64
  // (the four-byte case builds). Measured: all three.
  const s = bootState(res.manifest);
  assert.strictEqual(streamBlock(s, res.stage), true, 'an empty queue must build');

  drainQueue(s);
  queueTerminator(s); queueTerminator(s); queueTerminator(s);        // $8641 x3
  assert.strictEqual(s.vram.cursor, 3);
  assert.strictEqual(packets(s).length, 0, 'zero packets, three bytes -- the point');
  assert.strictEqual(streamBlock(s, res.stage), true,
    '3 bytes is BELOW CMP #$04 and must build');
  assert.strictEqual(s.vram.cursor, 3 + 37,
    'the block it built is 4*8 + 5 wire bytes on top of the three');

  drainQueue(s);
  queueTerminator(s); queueTerminator(s); queueTerminator(s); queueTerminator(s);
  assert.strictEqual(s.vram.cursor, 4);
  assert.strictEqual(packets(s).length, 0, 'zero packets, four bytes -- the point');
  assert.strictEqual(streamBlock(s, res.stage), false,
    'the streamer built with 4 bytes in $0E');

  // ... and, separately and independently, that the named constant is the ROM's
  // own operand. docs/knowledge/03: a test that spells out the raw byte is a
  // check on the constant; a test that uses it is a readability improvement.
  assert.strictEqual(QUEUE_GATE_BYTES, 4, '$9D8A holds C9 04, i.e. CMP #$04');
});

test('$864A INX / $864B STX $0E: $0E is an 8-bit byte and wraps at 256', () => {
  // WAS A knownFail. ROM $8641 = A9 00 F0 00 A6 0E 9D 00 07 E8 86 0E 60,
  // re-dumped from "Gradius (USA).nes" at file offset 16 + $0641. X is an
  // 8-bit register and $0700 is a 256-byte page, so the cursor wraps -- and
  // src/vram.js used to keep state.vram.cursor as an unmasked JS number, which
  // porttrace.mjs handed straight to the comparison as w_000E. Wave 2 turned
  // $0700 into a real Uint8Array(256) with an 8-bit cursor, so this is now an
  // ordinary test and the annotation is gone (helpers.js knownFail(): a
  // surprise PASS is a FAILURE, and this one surprised on the first run).
  //
  // Still unreachable from the corpus: the port's largest frame is 40 bytes and
  // $8A7B zeroes the cursor every frame. The cartridge's own $0E reaches 149 in
  // the recorded stage-load window, which is why it is worth pinning.
  // RED WHEN: the `& 0xFF` comes off queueByte's INX.
  const s = bootState(res.manifest);
  drainQueue(s);
  queuePacket(s, 1, 0x2000, new Uint8Array(252));   // 4 + 252 = 256 wire bytes
  assert.strictEqual(s.vram.cursor, 0,
    '$0E must wrap to 0 after 256 wire bytes');
  queueTerminator(s);
  assert.strictEqual(s.vram.cursor, 1, 'and keep counting from 0');
  assert.strictEqual(s.vram.q[0], 0x00,
    '$8647 STA $0700,X wrote past the end of the page instead of onto its start');
});

// ------------------------------------------------------------ the streamer --

test('$9DA1 BMI: the streamer builds on a NEGATIVE 16-bit lead', (t) => {
  // $9D96-$9DAD compares the build cursor $54/$55 against the camera $3E/$3F
  // with a 16-bit SBC and branches on the flags of the HIGH byte:
  //   BMI  -> negative, i.e. the camera has overtaken the cursor -> BUILD
  //   < $0100                                                    -> build
  //   $0100..$017F                                               -> build
  //   >= $0180                                                   -> INC $57
  // The port compared an UNSIGNED lead against $0180, so the negative case read
  // as >= $8000 and was refused: the ROM's "catch up" arm became "stop".
  // RED WHEN: the `hi & 0x80` arm is deleted -- rows 1 and 7 (lead 0 is the
  // boundary case that a plain `< $0180` unsigned test still gets right, so the
  // negative row is the load-bearing one).
  const table = [
    [0x0000, true, 'lead 0'],
    [0x00FF, true, 'lead $00FF -- high byte 0'],
    [0x0100, true, 'lead $0100 -- high byte 1, low < $80'],
    [0x017F, true, 'lead $017F -- the last building lead'],
    [0x0180, false, 'lead $0180 -- the throttle'],
    [0x0200, false, 'lead $0200 -- high byte 2'],
    [-0x0100, true, 'lead -$0100 -- THE BMI ARM'],
  ];
  for (const [lead, expect, why] of table) {
    const s = bootState(res.manifest);
    // Put the camera somewhere with pages either side of it so a negative lead
    // is expressible: cam = $0400, cursor = cam + lead.
    const cam = 0x0400, cur = (cam + lead) & 0xFFFF;
    s.cam.hi = cam >> 8; s.cam.lo = cam & 0xFF;
    s.build.hi = cur >> 8; s.build.lo = cur & 0xFF;
    s.build.prog = 0;
    s.build.ahead = 0xEE;                       // must be overwritten either way
    const built = streamBlock(s, res.stage);
    t.diagnostic(`${why}: built=${built} $57=${s.build.ahead}`);
    assert.strictEqual(built, expect, why);
    // $9D90 STA $57 runs on every gate pass; $9DAF INC $57 only when throttled.
    assert.strictEqual(s.build.ahead, expect ? 0 : 1, `$57 wrong for ${why}`);
  }
});

test('$57 is written by the streamer, and NOT written when the queue gate refuses', () => {
  // $9D8E's `LDA #$00 / STA $57` sits AFTER the $3A and $0E gates, so a frame
  // that never gets past them leaves $57 alone. That asymmetry is the whole
  // reason the cartridge's $57 and the port's disagree while the HUD is
  // missing: the cartridge's gate refuses on odd frames, the port's never does.
  // RED WHEN: `b.ahead = 0` is hoisted above either gate.
  const s = bootState(res.manifest);
  s.build.ahead = 9;
  for (let i = 0; i < 4; i++) queueTerminator(s);      // four bare bytes, $9D89
  assert.strictEqual(streamBlock(s, res.stage), false);
  assert.strictEqual(s.build.ahead, 9, '$57 was written despite the $0E gate refusing');

  drainQueue(s);
  s.build.gate = 1;                                   // $3A
  assert.strictEqual(streamBlock(s, res.stage), false);
  assert.strictEqual(s.build.ahead, 9, '$57 was written despite the $3A gate refusing');

  s.build.gate = 0;
  assert.strictEqual(streamBlock(s, res.stage), true);
  assert.strictEqual(s.build.ahead, 0, '$9D90 STA $57 did not run on a build');
});

// ------------------------------------------------- $15, $5B: the mode-5 top --

test('$15 (pause) freezes the CAMERA, and takes neither the split nor the streamer', () => {
  // The correction this whole file exists for. $9A9A/$9A9E branch to $9AA3 --
  // PAST the JSR $98EE, ON to the split -- so a paused frame still has two
  // bands, and $9AC4 onward (rank, HUD, and the streamer at $9ACE) still runs.
  // Measured from the cartridge: START at f450 set $15 = 1 and $3E stuck at 68
  // for 50 frames while the picture kept its split (00-recon-flow.md 8).
  //
  // THIS TEST IS DELIBERATELY INCOMPLETE and the missing half is the knownFail
  // immediately below it: on the cartridge a paused frame also skips the PLAYER
  // and the scroll latch, which this port still runs. Asserting only what is
  // true of both models here keeps the faithful fix unblocked -- the mistake
  // wave 1 made with $5B.
  // RED WHEN: the $15 term is dropped from the camera gate (assertion 2), or
  // when `bandB.ran` is made to depend on $15 again (assertion 3).
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  assert.strictEqual(s.bandB.ran, true, 'baseline: the split should run');

  s.zp15 = 1;
  const cam = cam24(s);
  const prog = s.build.prog;
  for (let i = 0; i < 8; i++) nmi(s, 0, res);
  assert.deepStrictEqual(cam24(s), cam, '$15 did not freeze $3D/$3E/$3F');
  assert.strictEqual(s.bandB.ran, true, '$15 wrongly suppressed the sprite-0 split');
  assert.notStrictEqual(s.build.prog, prog,
    '$15 wrongly stopped the streamer: $9ACA/$9ACE are past the pause jump too');

  s.zp15 = 0;
  nmi(s, 0, res);
  assert.notDeepStrictEqual(cam24(s), cam, 'the camera did not resume');
});

// WAS A knownFail FROM WAVE 1 AND RETIRED ITSELF IN WAVE 4, on the first run
// after $965C-$9660 was ported: helpers.js reported SURPRISE PASS, and per its
// own instructions the wrapper came off and the assertions stayed verbatim.
//
// The record of what the defect was, because it stood for three waves: ROM at
// $9650 is A9 0C 85 13 A9 00 85 5D 85 5B 85 5C A5 15 F0 03 4C 8C 9A, i.e.
// $965C LDA $15 / $965E BEQ $9663 / $9660 JMP $9A8C. The jump lands PAST
// $9663-$9A87 -- past $9A64 JSR $A2C0, $9A67 JSR $BBB7, $9A6A JSR $9FFC (THE
// PLAYER), $9A6D JSR $ADAB, $9A70 JSR $BFE2, $9A73 JSR $8974, $9A76 JSR $C772
// and $9A79-$9A86 (the $3E -> $12 and $3F bit 0 -> $10 latch) -- and past
// $9A88's own test of $1B bit 7. src/nmi.js gated only advanceCamera() on $15,
// so the port moved the ship and re-latched the scroll while paused.
// RED WHEN: the `if (state.zp15 !== 0) { mode5Tail(...); return; }` arm at the
// top of stagePlay() is removed and only the camera gate is left.
test('$965C-$9660: a paused frame runs NO player and NO scroll latch', () => {
  const s = bootState(res.manifest);
  // Settle, then stop on a frame where the latched $12 and the live $3E
  // DISAGREE -- the camera carries into $3E every other frame, so one of the
  // next two frames always leaves them one apart. Without that the latch is a
  // no-op and re-running it would be unobservable.
  nmi(s, 0, res);
  for (let i = 0; i < 2 && s.ppu.scrollX === s.cam.lo; i++) nmi(s, 0, res);
  assert.notStrictEqual(s.ppu.scrollX, s.cam.lo,
    'test setup: $12 and $3E never disagreed, so the latch is unobservable');

  s.zp15 = 1;
  const x = s.obj.x[0], y = s.obj.y[0], xf = s.obj.xf[0];
  const scrollX = s.ppu.scrollX, ring = s.ring.cursor;
  for (let i = 0; i < 10; i++) nmi(s, BTN.RIGHT | BTN.DOWN, res);

  assert.strictEqual(s.obj.x[0], x, '$9A6A JSR $9FFC ran on a paused frame: X moved');
  assert.strictEqual(s.obj.y[0], y, '$9A6A JSR $9FFC ran on a paused frame: Y moved');
  assert.strictEqual(s.obj.xf[0], xf, 'the sub-pixel accumulator moved while paused');
  assert.strictEqual(s.ring.cursor, ring, 'the Option position ring advanced while paused');
  assert.strictEqual(s.ppu.scrollX, scrollX,
    '$9A79 STA $12 ran on a paused frame: the scroll shadow was re-latched');
});

// WAS A knownFail FROM WAVE 1, UNWRAPPED IN WAVE 3 -- and that is the
// mechanism working exactly as it was designed to. Wave 3 ported the three
// stores because `$9656 STA $5D` became load-bearing ($BBB7 at $9A67 reads $5D
// seven instructions after $A2C0 has INC'd it, and reading a stale non-zero
// $5D sends the enemy-bullet engine down the wrong arm on every frame after
// the first wave). helpers.js's wrapper then reported SURPRISE PASS, and per
// its own instructions the assertions below are kept verbatim.
//
// The record of what the defect was, preserved because it stood for two waves:
// ROM at $9650 is `A9 0C 85 13 A9 00 85 5D 85 5B 85 5C`, i.e. $9656 STA $5D /
// $9658 STA $5B / $965A STA $5C, at the TOP of the mode-5 handler and BEFORE
// the $15 test, and $80D4+10 = `50 96` puts $9650 in the mode table at index 5,
// so it runs on every mode-5 frame. $5B is therefore a WITHIN-FRAME flag: it is
// raised only by arms that then jump into the middle of the body ($96A0 INC $5B
// / $96A2 JMP $9A8C, the stage-5 half-rate arm; $98DD INC $5B / $98E0 JSR $ADAB
// / $98E2 JMP $9A8C; $96FB INC $5B whose tail $9762 is JMP $9A5E) -- exactly
// "this frame's update already ran, do not scroll and do not stream". Wave 1
// shipped a test asserting the port's PERMANENT freeze instead, which blessed
// the defect and blocked the faithful fix.
// RED WHEN: any of the three stores in src/nmi.js stagePlay() is deleted.
test('$9656-$965A: mode 5 clears $5D/$5B/$5C at entry, every single frame', () => {
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  s.zp5B = 1;
  s.zp5C = 0;                      // $5C >= 2 throws; the clear covers it too
  s.spawn.z5D = 7;                 // $5D too, which is what forced the fix
  const cam = cam24(s);
  const prog = s.build.prog;
  nmi(s, 0, res);
  assert.strictEqual(s.zp5B, 0, '$9658 STA $5B did not run: $5B survived the frame');
  assert.strictEqual(s.spawn.z5D, 0, '$9656 STA $5D did not run');
  assert.notDeepStrictEqual(cam24(s), cam,
    'the camera stayed frozen: $5B was still set when $9A9C read it');
  assert.notStrictEqual(s.build.prog, prog,
    'the streamer stayed suppressed: $5B was still set when $9ACA read it');
});

// The COVERAGE DEBT wave 1 wrote down here is CLOSED, by its own option 2.
//
// Its point was that once mode-5 entry clears $5B, nothing in the suite can
// reach the two $5B readers at $9A9C and $9ACA through nmi() any more -- the
// only arms that raise $5B ($96A0/$98DD/$96FB) jump into the MIDDLE of the
// body, and none of them is ported. So QA's `no-9aca` mutation (delete the $5B
// gate around streamBlock) would have been unguarded.
//
// src/nmi.js now exports mode5Tail(), the $9A88-$9ACE block. $9A8C is a real
// jump target -- $96A2 (`INC $5B / JMP $9A8C`), $98E2 and $9660 all land there
// -- so calling it with $5B raised is the state three ROM arms actually create,
// not invented state.
test('$9A9C / $9ACA: a $5B raised INSIDE the frame takes the camera and the streamer', () => {
  // RED WHEN: either `state.zp5B === 0` term is deleted from src/nmi.js -- the
  // camera gate at $9A98/$9A9C or the streamer gate at $9ACA.
  const arm = (st) => {
    st.frame = 2;                       // EVEN: $88A2's BCC keeps the HUD out,
    st.vram.cursor = 0;                 // so $0E stays under $9D87's CMP #$04
    st.build.prog = 0;                  // $58 = 0, so the lead gate is evaluated
    st.build.lo = st.cam.lo;            // ...with a lead of 0, which builds
    st.build.hi = st.cam.hi;
  };
  const s = bootState(res.manifest);
  nmi(s, 0, res);

  arm(s);
  const cam = cam24(s);
  mode5Tail(s, res);                    // baseline: $5B is 0, both should run
  assert.notDeepStrictEqual(cam24(s), cam, 'baseline: the camera should advance');
  assert.ok(s.vram.cursor > 0, 'baseline: the streamer should have queued a block');

  arm(s);
  const cam2 = cam24(s);
  s.zp5B = 1;                           // $96A0 INC $5B, then JMP $9A8C
  mode5Tail(s, res);
  assert.deepStrictEqual(cam24(s), cam2, '$9A9C did not stop the camera');
  assert.strictEqual(s.vram.cursor, 0, '$9ACA did not stop the streamer');
});

// ---------------------------------------------------- $0D, $1E, $1F, band B --

test('$0D and $1F suppress the split AND the camera with it', () => {
  // $9A88-$9A96 branch to $9AC4, which is past BOTH the JSR $98EE and the split.
  // So these are not the same gate as $15/$5B and must not be modelled as if
  // they were. Measured from the other side: the split first fires at game
  // frame 314, the frame $0D reaches 0, with $15 and $5B 0 throughout.
  // RED WHEN: `bandB.ran = split` is replaced by the pre-wave-1 model.
  //
  // The $1E term has its own test below, because the wave-1 version of this one
  // set $1E and $1F to 0 TOGETHER and so tested nothing: buildDisplayList
  // re-derives $1E from $1F at the top of every frame, and QA deleted the $1E
  // term from the gate with all 54 tests and all 3341 frames still green.
  for (const [name, set] of [
    ['$0D blanking', (s) => { s.ppu.blank = 6; }],
    ['$1F = 0 (sprite 0 parked)', (s) => { s.zp1F = 0; }],
  ]) {
    const s = bootState(res.manifest);
    nmi(s, 0, res);
    set(s);
    const cam = cam24(s);
    nmi(s, 0, res);
    assert.strictEqual(s.bandB.ran, false, `${name} should suppress the split`);
    assert.deepStrictEqual(cam24(s), cam,
      `${name} should stop the camera too ($9A8x branches past $9AA0)`);
  }
});

test('$9A8C LDA $1E: the handover frame has a LIVE sprite 0 and NO split', () => {
  // THE ONLY STATE THAT SEPARATES $9A8C FROM $9A90, driven through a whole
  // frame. $1F == 1 entering the frame means $8B1A-$8B2B promotes $1F to 2 and
  // leaves $1E at 0, so the live sprite-0 record is already in OAM while the
  // split is still refused -- for exactly one frame.
  //
  // RED WHEN: `&& state.zp1E !== 0` is deleted from the split expression in
  // src/nmi.js. That mutation was QA's, and before this test it left all 54
  // unit tests and all 3341 compared frames byte-identically green.
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  assert.strictEqual(s.bandB.ran, true, 'baseline: the split should run');

  s.zp1F = 1;                                   // the handover, $9C38 A9 01 85 1F
  const cam = cam24(s);
  nmi(s, 0, res);
  assert.strictEqual(s.zp1F, 2, '$8B25 STY $1F did not promote 1 to 2');
  assert.strictEqual(s.zp1E, 0, '$1E must still be 0 on the handover frame');
  assert.strictEqual(s.ppu.spriteZeroOn, true,
    '$8B1E LDX #$07: the LIVE record is copied on the handover frame');
  assert.strictEqual(s.bandB.ran, false,
    '$9A8E BEQ $9AC4: $1E == 0 suppresses the split even with $1F non-zero');
  assert.deepStrictEqual(cam24(s), cam,
    'the handover frame branches past $9AA0 as well, so the camera holds');

  nmi(s, 0, res);                               // the frame after the handover
  assert.strictEqual(s.zp1E, 1);
  assert.strictEqual(s.bandB.ran, true, 'the split must resume the very next frame');
  assert.notDeepStrictEqual(cam24(s), cam, 'and so must the camera');
});

test('$0D is DECREMENTED before $9A94 reads it: the split fires ON the zero frame', () => {
  // $808A-$8096 runs at the top of the NMI: LDA $11 / LDX $0D / BEQ $8096 /
  // DEC $0D / BEQ $8096 / LDA #$00. So the LAST frame of the countdown already
  // shows the picture -- and $9A94, thousands of cycles later in the same
  // frame, reads the DECREMENTED value. A port that samples $0D before the
  // decrement is one frame late on both the picture and the split.
  //
  // RED WHEN: the split reads the pre-decrement value of state.ppu.blank. Wave
  // 1's version set blank = 6 and ran ONE frame (6 -> 5), so both models agreed
  // and QA's mutation M8 passed. This one steps 2 -> 1 -> 0 and asserts the
  // transition, which is the only frame where the two models differ.
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  s.ppu.blank = 2;                              // $0D

  nmi(s, 0, res);
  assert.strictEqual(s.ppu.blank, 1, '$8090 DEC $0D did not run');
  assert.strictEqual(s.bandA.mask, 0, '$8094 LDA #$00: the screen must be blank at $0D = 1');
  assert.strictEqual(s.bandB.ran, false, '$9A96 BNE $9AC4: no split while $0D is non-zero');

  const cam = cam24(s);
  nmi(s, 0, res);
  assert.strictEqual(s.ppu.blank, 0, 'the countdown did not reach 0');
  assert.strictEqual(s.bandA.mask, s.ppu.mask,
    '$8092 BEQ $8096: the LAST frame of the countdown already shows the picture');
  assert.strictEqual(s.bandB.ran, true,
    '$9A94 read $0D BEFORE the decrement: the split is a frame late');
  assert.notDeepStrictEqual(cam24(s), cam, 'and the camera with it');
});

test('$9ABA AND #$FC: band B keeps band A\'s $10 with the nametable bits cleared', () => {
  // $9AB8: LDA $10 / AND #$FC / STA $2000. The two low bits are the nametable
  // select that $9A80-$9A86 has already written from bit 0 of the camera page,
  // so band B is drawn from nametable 0 whichever page band A is on. The mask
  // is not decoration: it is what makes the split's second band restart at
  // $2000 while the top of the screen is still showing $2400.
  //
  // RED WHEN: the `& 0xFC` is dropped -- assertion 3. Reachable only with an
  // ODD camera page, which no scenario in the corpus reaches inside its
  // compared window; QA's mutation M23 was green across all 3341 frames.
  const s = bootState(res.manifest);
  s.cam.hi = 1;                                  // $3F -- page 1, the odd page
  nmi(s, 0, res);                                // $9A80 puts bit 0 into $10
  nmi(s, 0, res);                                // $809C latches it into band A
  assert.strictEqual(s.bandA.ctrl & 1, 1,
    'setup: bit 0 of the camera page never reached $10/band A');
  assert.strictEqual(s.bandB.ran, true, 'setup: this frame has no band B to check');
  assert.strictEqual(s.bandB.ctrl & 3, 0, '$9ABC AND #$FC: band B must select nametable 0');
  assert.strictEqual(s.bandB.ctrl, s.bandA.ctrl & 0xFC,
    'band B is band A\'s PPUCTRL, masked -- not an independent value');
});

test('$8B1A-$8B2B: the $1E/$1F ladder, and which sprite-0 record it copies', () => {
  // LDA #$00 / LDX #$03 / LDY $1F / BEQ / LDX #$07 / DEY / BNE (A := 1) /
  // LDY #$02 / STY $1F / BNE / STA $1E. Three arms, all three driven here:
  //   $1F == 0  -> $1E = 0, X = 3, the PARKED record at $8B08+0
  //   $1F == 1  -> $1F := 2, $1E = 0, X = 7, the LIVE record   (the handover)
  //   $1F >= 2  -> $1E = 1, X = 7, the LIVE record
  // RED WHEN: state.ppu.spriteZeroOn is pinned to a constant (the $1F == 0
  // assertion) -- QA's mutation M7, which was green everywhere before this.
  const s = bootState(res.manifest);
  s.zp1F = 1;
  buildDisplayList(s, res.metasprites);
  assert.strictEqual(s.zp1F, 2, '$8B25 STY $1F did not promote 1 to 2');
  assert.strictEqual(s.zp1E, 0, '$1E must stay 0 on the handover frame');
  assert.strictEqual(s.ppu.spriteZeroOn, true, 'X = 7 on the handover frame');
  assert.deepStrictEqual([...s.shadowOam.slice(0, 4)], SPRITE0,
    'the LIVE record should already be in OAM on the handover frame');

  buildDisplayList(s, res.metasprites);
  assert.strictEqual(s.zp1E, 1, 'the frame after the handover must enable the split');
  assert.strictEqual(s.ppu.spriteZeroOn, true);

  s.zp1F = 0;
  buildDisplayList(s, res.metasprites);
  assert.strictEqual(s.zp1E, 0);
  assert.strictEqual(s.ppu.spriteZeroOn, false,
    '$8B16 LDX #$03 parks sprite 0, and the flag must say so');
  assert.deepStrictEqual([...s.shadowOam.slice(0, 4)], SPRITE0_OFF,
    '$1F == 0 must park sprite 0 off-screen');
});
