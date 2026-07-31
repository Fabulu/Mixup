// The four gates around the camera, the split and the streamer -- and the one
// byte at the end of the frame.
//
// WHY THIS FILE EXISTS. Every fact checked here was, until wave 1, either
// modelled backwards in src/ or not modelled at all, and NOT ONE of them cost
// the 16-scenario corpus a single frame: $15, $5B and $0D are 0 on all 3341
// compared frames and $1E/$1F are 1/2 on all of them. That is
// docs/knowledge/03's third shape exactly -- a field that never varies inside
// the corpus can carry a wrong model forever. So these are unit tests with
// hand-set gate bytes, deliberately, because the corpus cannot reach them; and
// each one was seen RED against the pre-wave-1 code before being kept.
//
//   $80B0 JSR $8641      one $00 appended per non-lag frame       (was absent)
//   $9D87 CMP #$04       the gate counts BYTES, not packets       (was packets)
//   $9DA1 BMI            build on a NEGATIVE 16-bit lead          (was refused)
//   $9D90 / $9DAF        $57 is written by the streamer           (was frozen)
//   $9A88-$9A94          what suppresses the SPLIT                (was $15/$5B)
//   $9A98/$9A9C          what $15/$5B suppress: the CAMERA        (was the split)
//   $9ACA                $5B gates the streamer too               (was absent)
//   $8B1A-$8B2B          $1E/$1F are bytes, and $1F == 1 is a handover frame

import test from 'node:test';
import assert from 'node:assert';

import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { streamBlock } from '../src/terrain.js';
import { drainQueue, queueTerminator, QUEUE_GATE_BYTES } from '../src/vram.js';
import { buildDisplayList, SPRITE0, SPRITE0_OFF } from '../src/oam.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);

/** Packet bytes as they would sit in $0700: [mode][hi][lo][data...][$FF]. */
const packetBytes = (s) => s.vram.queue.reduce((n, p) => n + 4 + p.bytes.length, 0);

test('$80B0 JSR $8641 appends exactly one $00 to the queue every non-lag frame', () => {
  // $8641: LDA #$00 / BEQ $8645 / LDX $0E / STA $0700,X / INX / STX $0E / RTS.
  // MEASURED on the cartridge at the $80B5 sample point: $0E reads 1 on a frame
  // whose only producer is this one (game frame 401 of every scenario), 38 on a
  // frame that also streamed a terrain block (37 packet bytes + this one), and
  // 9 / 15 / 40 on the frames the HUD tick also ran (8/14/39 + this one).
  const s = bootState(res.manifest);
  s.build.gate = 1;                       // $3A up: the streamer stands down
  nmi(s, 0, res);
  assert.strictEqual(s.vram.queue.length, 0, 'nothing else should have produced');
  assert.strictEqual(s.vram.cursor, 1, '$0E should be exactly the $8641 byte');

  // and on a frame that streams, the byte sits on top of the packets
  s.build.gate = 0;
  nmi(s, 0, res);
  assert.ok(s.vram.queue.length > 0, 'the streamer emitted nothing to check against');
  assert.strictEqual(s.vram.cursor, packetBytes(s) + 1,
    '$0E is not the packet bytes plus the $8641 terminator');
  assert.strictEqual(s.vram.cursor, 38, 'one terrain block is 4*8 + 5 + 1 = 38 bytes');

  // A lag frame bails at $80B7, long before $80B0.
  const before = s.vram.cursor;
  nmi(s, 0, res, true);
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

test('$9D87 counts BYTES, not packets: four bare bytes close the gate', () => {
  // The gate is `LDA $0E / CMP #$04 / BCC`. Four BYTES is less than one packet's
  // three-byte header, so a packet count can never be the same test. It gave the
  // same answer only because the drainer zeroes $0E at $8099 and the streamer is
  // the port's only producer -- i.e. the gate always read 0.
  const s = bootState(res.manifest);
  assert.strictEqual(streamBlock(s, res.stage), true, 'an empty queue must build');
  drainQueue(s);
  for (let i = 0; i < QUEUE_GATE_BYTES; i++) queueTerminator(s);   // $8641 x4
  assert.strictEqual(s.vram.queue.length, 0, 'zero packets, four bytes -- the point');
  assert.strictEqual(streamBlock(s, res.stage), false,
    'the streamer built with 4 bytes in $0E');
  // three bytes is still below the gate
  drainQueue(s);
  for (let i = 0; i < QUEUE_GATE_BYTES - 1; i++) queueTerminator(s);
  assert.strictEqual(streamBlock(s, res.stage), true, '3 bytes should be under CMP #$04');
});

test('$9DA1 BMI: the streamer builds on a NEGATIVE 16-bit lead', (t) => {
  // $9D96-$9DAD compares the build cursor $54/$55 against the camera $3E/$3F
  // with a 16-bit SBC and branches on the flags of the HIGH byte:
  //   BMI  -> negative, i.e. the camera has overtaken the cursor -> BUILD
  //   < $0100                                                    -> build
  //   $0100..$017F                                               -> build
  //   >= $0180                                                   -> INC $57
  // The port compared an UNSIGNED lead against $0180, so the negative case read
  // as >= $8000 and was refused: the ROM's "catch up" arm became "stop".
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
  const s = bootState(res.manifest);
  s.build.ahead = 9;
  for (let i = 0; i < QUEUE_GATE_BYTES; i++) queueTerminator(s);
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

test('$15 (pause) freezes the CAMERA and leaves the split alone', () => {
  // The correction this whole file exists for. $9A9A/$9A9E branch to $9AA3 --
  // PAST the JSR $98EE, ON to the split -- so a paused frame still has two
  // bands. Measured from the cartridge: START at f450 set $15 = 1 and $3E stuck
  // at 68 for 50 frames while the picture kept its split (00-recon-flow.md 8).
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  assert.strictEqual(s.bandB.ran, true, 'baseline: the split should run');

  s.zp15 = 1;
  const cam = [s.cam.sub, s.cam.lo, s.cam.hi];
  for (let i = 0; i < 8; i++) nmi(s, 0, res);
  assert.deepStrictEqual([s.cam.sub, s.cam.lo, s.cam.hi], cam, '$15 did not freeze $3D/$3E/$3F');
  assert.strictEqual(s.bandB.ran, true, '$15 wrongly suppressed the sprite-0 split');

  s.zp15 = 0;
  nmi(s, 0, res);
  assert.notDeepStrictEqual([s.cam.sub, s.cam.lo, s.cam.hi], cam, 'the camera did not resume');
});

test('$5B freezes the camera AND the streamer, and leaves the split alone', () => {
  // Two separate readers, seven bytes apart: $9A9C (camera) and $9ACA
  // (streamer). $5B is 0 on every measured frame, so this is the only place
  // either gate can be exercised at all.
  const s = bootState(res.manifest);
  nmi(s, 0, res);
  s.zp5B = 1;
  const cam = [s.cam.sub, s.cam.lo, s.cam.hi];
  const prog = s.build.prog;
  nmi(s, 0, res);
  assert.deepStrictEqual([s.cam.sub, s.cam.lo, s.cam.hi], cam, '$5B did not freeze the camera');
  assert.strictEqual(s.build.prog, prog, '$5B did not gate the streamer ($9ACA)');
  assert.strictEqual(s.vram.cursor, 1, 'a $5B frame should hold only the $8641 byte');
  assert.strictEqual(s.bandB.ran, true, '$5B wrongly suppressed the sprite-0 split');
});

test('$0D, $1E and $1F suppress the split AND the camera with it', () => {
  // $9A88-$9A96 branch to $9AC4, which is past BOTH the JSR $98EE and the split.
  // So these three are not the same gate as $15/$5B and must not be modelled as
  // if they were. Measured from the other side: the split first fires at game
  // frame 314, the frame $0D reaches 0, with $15 and $5B 0 throughout.
  //
  // $9A88's own test of $1B bit 7 is NOT exercised here, and that is a gap with
  // a reason: on the cartridge this block is reached from the stage-intro path
  // too (which is how $0D can be non-zero here at all), so bit 7 clear means
  // "no camera, no split, but $9AC4 onward still runs -- including the streamer
  // at $9ACE". The port's stagePlay() returns at $96B7 instead and runs none of
  // it. Reproducing that difference is wave 4's intro machine; until then the
  // `state.substate & 0x80` term in src/nmi.js is redundant with the early
  // return, and it is written out anyway so wave 4 does not have to find it.
  for (const [name, set] of [
    ['$0D blanking', (s) => { s.ppu.blank = 6; }],
    ['$1F = 0 (sprite 0 parked)', (s) => { s.zp1F = 0; }],
    ['$1E = 0 (no record selected)', (s) => { s.zp1E = 0; s.zp1F = 0; }],
  ]) {
    const s = bootState(res.manifest);
    nmi(s, 0, res);
    set(s);
    const cam = [s.cam.sub, s.cam.lo, s.cam.hi];
    nmi(s, 0, res);
    assert.strictEqual(s.bandB.ran, false, `${name} should suppress the split`);
    assert.deepStrictEqual([s.cam.sub, s.cam.lo, s.cam.hi], cam,
      `${name} should stop the camera too ($9A8x branches past $9AA0)`);
  }
});

test('$8B1A-$8B2B: $1F == 1 is a handover frame -- live sprite 0, split still off', () => {
  // LDA #$00 / LDX #$03 / LDY $1F / BEQ / LDX #$07 / DEY / BNE (A := 1) /
  // LDY #$02 / STY $1F / BNE / STA $1E. The $1F == 1 arm sets $1F to 2 and
  // leaves A at 0, so the LIVE record is copied while $1E stays 0 for exactly
  // one frame. Not reachable in this corpus ($1F = 2 on all 3341 compared
  // frames); it is the intro's handover and wave 4 will walk through it.
  const s = bootState(res.manifest);
  s.zp1F = 1;
  buildDisplayList(s, res.metasprites);
  assert.strictEqual(s.zp1F, 2, '$8B25 STY $1F did not promote 1 to 2');
  assert.strictEqual(s.zp1E, 0, '$1E must stay 0 on the handover frame');
  assert.deepStrictEqual([...s.shadowOam.slice(0, 4)], SPRITE0,
    'the LIVE record should already be in OAM on the handover frame');

  buildDisplayList(s, res.metasprites);
  assert.strictEqual(s.zp1E, 1, 'the frame after the handover must enable the split');

  s.zp1F = 0;
  buildDisplayList(s, res.metasprites);
  assert.strictEqual(s.zp1E, 0);
  assert.deepStrictEqual([...s.shadowOam.slice(0, 4)], SPRITE0_OFF,
    '$1F == 0 must park sprite 0 off-screen');
});
