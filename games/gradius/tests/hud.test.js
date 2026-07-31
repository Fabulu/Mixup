// $8898, its four canned-packet producers, and the $85F3 copier under them.
//
// THE CHECK THAT MATTERS is byte-for-byte against the CARTRIDGE'S OWN $0700
// IMAGES. queue.lua dumps the queue page at the terrain streamer's gate $9D83,
// i.e. after $9AC7 JSR $8898 has filled it, and those four dumps are quoted
// verbatim below. Re-measure them with:
//
//   python games/gradius/tools/oracle/queue.py --frames 700 \
//       --script "200:,10:S,490:" --from 566 --to 578 --packets
//
// A LENGTH CHECK IS NOT ENOUGH AND THAT IS MEASURED, NOT ASSUMED:
// 00-recon-terrain.md 4 shifted the $864E pointer table by one entry and its
// length-only check went red on only 4 of the 10 stage-1 packets, because six
// of them are 4 or 5 bytes long and so are their neighbours in the table. Every
// assertion here is on bytes.
//
// The producers' six inputs ($20,X, $07E0-$07EA, $42, $46, $41/$44/$45, $0100)
// are seeded, not computed -- see the SEEDED INPUTS note in src/state.js. So
// this file is where they get their teeth: it drives lives values the oracle
// corpus never has (0, 1, 9, 10, 99, 100, 255) and meter values it never has
// (1..6), because on the cartridge those need a death and a capsule.

import test from 'node:test';
import assert from 'node:assert';

import { bootState } from '../src/main.js';
import { nmi } from '../src/nmi.js';
import { hudTick } from '../src/hud.js';
import { cannedPacket, copyPacket } from '../src/hudpackets.js';
import { drainQueue, queueTerminator, scanQueue } from '../src/vram.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const P = res.hudPackets;

const hex = (a) => [...a].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
/** The bytes $8898 left in $0700 this tick, as the cartridge dump prints them. */
const image = (s) => hex(s.vram.q.subarray(0, s.vram.cursor));

/**
 * One HUD tick, from a queue the frame has just drained. `$8A7B` zeroes $0E at
 * $8099 and `$80BE` steps $02 at $80AA, both before $9AC7 reads them.
 */
function tick(s) {
  s.vram.cursor = 0;                      // $8A7B STA $0E
  s.frame |= 1;                           // $02 odd -- $88A1 LSR / $88A2 BCC
  hudTick(s, P);                          // $9AC7 JSR $8898
  return image(s);
}

/** A state seeded exactly as the cartridge's RAM reads at align frame 400. */
function seeded() {
  const s = bootState(res.manifest);      // lives 3/3, $48 = $2E, TOP = 00 50 00
  s.zp48 = 3;                             // so the next tick is phase 0
  return s;
}

// ============================ the four images ==============================
//
// MEASURED, tools/oracle/out/queue-base.json, frames 572 / 574 / 576 / 578,
// with $20 = 3, $18 = 0, $42 = $46 = 0, $41 = $44 = $45 = 0, $0100 = 1,
// $07E0-$07E2 = 00 50 00 and $07E4-$07E6 = 00 00 00.
const IMAGES = [
  ['$88B6 lives',      '01 23 A2 00 61 00 33 FF'],
  ['$88F6 top score',  '01 23 B4 64 65 00 30 30 35 30 30 30 30 FF'],
  ['$89E3 power bar',  '01 23 84 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 '
                     + '19 1A 1B 1C 1D 62 63 1F FF 01 23 F8 00 00 00 00 00 00 00 FF'],
  ['$892C score',      '01 23 A8 31 66 00 30 30 30 30 30 30 30 FF'],
];

test('the four $8898 phases reproduce the cartridge\'s $0700 images, byte for byte', (t) => {
  // RED WHEN: any producer's packet index, order, digit encoding or terminator
  // changes. Seen red by shifting res.hudPackets by one entry (all four),
  // by dropping $863D's closing $FF (phase 2), and by swapping the digit loop's
  // direction (phases 1 and 3).
  const s = seeded();
  for (const [name, want] of IMAGES) {
    const got = tick(s);
    t.diagnostic(`${name}: ${got}`);
    assert.strictEqual(got, want, `${name} does not match the cartridge`);
  }
  // ...and the rotation is a rotation: the next four repeat.
  for (const [name, want] of IMAGES) {
    assert.strictEqual(tick(s), want, `${name} differs on the second pass`);
  }
});

test('$0E after a whole frame is 1 / 9 / 15 / 40 -- the HUD\'s four sizes plus $8641', () => {
  // The port driven through real NMIs, not through tick(). Here the streamer is
  // held off ($3A) so only the HUD contributes, and the four phases show up as
  // 8/14/39 bytes plus $80B0's one terminator: 9, 15, 15, 40.
  //
  // RE-MEASURED FOR THIS FILE, and the comment that used to be here was wrong
  // in a way worth recording. It quoted the cartridge's whole-run $0E histogram
  // and glossed "45 = a block plus the 8-byte lives packet" and "13" as if both
  // were mode-5 numbers. Split by the recorded `mode` field, over all 1000
  // frames of tools/oracle/out/scen/long-idle.json:
  //
  //   $0E=1   {mode1:71, mode3:2, mode4:1, mode5:265}
  //   $0E=9   {mode5:86}          the lives phase
  //   $0E=13  {mode3:79}          MODE 3 ONLY -- never during play
  //   $0E=15  {mode5:173}         the two score phases
  //   $0E=37  {mode5:1}    $0E=38 {mode5:84}    a terrain block (37) +/- $8641
  //   $0E=40  {mode5:87}          the power bar
  //   $0E=45  {mode0:127, mode1:1}   NEVER mode 5   $0E=49 {mode5:1}
  //   $0E=90  {mode0:1}
  //   $0E=149 {mode5:21}    frames 287-307: $9C2C-$9C35 calls $9D8E FOUR times
  //                         with no $0E gate between them, 4*37 + 1
  //
  // so the mode-5 bucket set is {1, 9, 15, 37, 38, 40, 49, 149} and neither 13
  // nor 45 is in it. This fixture can only produce {1, 9, 15, 40}, which is a
  // subset of it -- said out loud rather than implied, because the previous
  // wording read as though the fixture reproduced the cartridge's histogram.
  // RED WHEN: the $889F/$88A2 parity gate is dropped (every frame produces),
  // or the four-phase order changes.
  const s = bootState(res.manifest);
  s.build.gate = 1;                       // $3A up: $9D85 BNE, no streamer
  s.frame = 0x91;                         // the cartridge's $02 at align 400
  const seen = [];
  for (let i = 0; i < 8; i++) { nmi(s, 0, res); seen.push(s.vram.cursor); }
  assert.deepStrictEqual(seen, [1, 15, 1, 9, 1, 15, 1, 40],
    'the per-frame $0E sequence is not the cartridge\'s');
});

test('600 frames: the HUD takes exactly half of them, 75 per phase, as the cartridge does', (t) => {
  // The counts, not the sequence -- and they are the CARTRIDGE'S counts. Its
  // compared window (long-idle, frames 400-999, all game mode 5, 600 rows) has
  //
  //   $0E histogram {1:244, 9:75, 15:150, 38:56, 40:75}
  //
  // and 9 / 15 / 40 are the HUD's three sizes. 600 frames, 300 of them odd, a
  // four-phase rotation: 75 lives + 75 top + 75 score + 75 bar, and the two
  // score phases share the size 15, so {9:75, 15:150, 40:75} is forced. The
  // port reproduces those three numbers EXACTLY on its own 600 frames.
  //
  // The other 300 are the streamer's and they are NOT compared here: the port
  // builds a block on 168 of them against the cartridge's 56, because the
  // cartridge's 384 px lead ($57/$9DAF) throttles builds this fixture does not
  // reproduce. Saying so rather than asserting the whole histogram, because
  // 38:168 vs 38:56 is a real difference and hiding it inside a green test is
  // how a number stops meaning anything.
  // RED WHEN: the parity gate goes, the rotation stops rotating, or any phase
  // changes size by a byte.
  const s = bootState(res.manifest);
  s.frame = 0x91;
  const h = new Map();
  const hudSizes = [];
  for (let i = 0; i < 600; i++) {
    nmi(s, 0, res);
    h.set(s.vram.cursor, (h.get(s.vram.cursor) || 0) + 1);
    if ([9, 15, 40].includes(s.vram.cursor)) hudSizes.push(s.frame);
  }
  t.diagnostic(`port $0E histogram over 600 NMIs: ${JSON.stringify([...h].sort((a, b) => a[0] - b[0]))}`);
  assert.strictEqual(h.get(9), 75, '$88B6 lives did not run on 75 frames');
  assert.strictEqual(h.get(15), 150, '$88F6 + $892C did not run on 150 frames');
  assert.strictEqual(h.get(40), 75, '$89E3 power bar did not run on 75 frames');
  assert.strictEqual(hudSizes.length, 300, 'the HUD did not take exactly half the frames');
  // and every frame it took was odd -- the scarce resource is the frame, and
  // $02 bit 0 is the whole of the rule that decides who gets it.
  assert.deepStrictEqual(hudSizes.filter((f) => (f & 1) === 0), [],
    'the HUD produced on an EVEN $02 frame');
  // the complement: nothing else may produce a HUD-sized queue.
  assert.deepStrictEqual([...h.keys()].sort((a, b) => a - b), [1, 9, 15, 38, 40],
    'a frame produced a queue size that is neither the HUD\'s nor a block\'s');
});

test('$8898 is the STREAMER\'S THROTTLE: no terrain block on an ODD $02 frame', (t) => {
  // The whole reason wave 2 exists. $8898 and $9D83 share `LDA $0E / CMP #$04 /
  // BCC` and $8898 runs seven bytes above the streamer's JSR ($9AC7 vs $9ACE),
  // so on every frame the HUD produces anything the streamer is refused --
  // and the HUD produces on exactly the odd frames. MEASURED on the cartridge:
  // builds per played frame {0: 196, 1: 195}, and starving its own $0E gate
  // turns that into {0:1, 1:390}, which is what the port used to do.
  // RED WHEN: hudTick's call is removed from src/nmi.js. That is precisely the
  // state the port was in before this wave, and it is what put w_000E/w_0054/
  // w_0055/w_0057/w_0058 in scenarios.json's knownFail list.
  const s = bootState(res.manifest);
  s.frame = 0x91;
  const builtOn = [];
  let prev = `${s.build.lo},${s.build.hi},${s.build.prog}`;
  for (let i = 0; i < 200; i++) {
    nmi(s, 0, res);
    const now = `${s.build.lo},${s.build.hi},${s.build.prog}`;
    if (now !== prev) builtOn.push(s.frame);
    prev = now;
  }
  t.diagnostic(`built on ${builtOn.length} of 200 frames`);
  assert.ok(builtOn.length > 40, `only ${builtOn.length} builds -- nothing to check`);
  const odd = builtOn.filter((f) => (f & 1) === 1);
  assert.deepStrictEqual(odd, [],
    `the streamer built on ${odd.length} ODD $02 frames; the HUD should have `
    + `taken the queue gate on every one of them`);
});

// ================================ the gates =================================

test('$889A CMP #$04: four bytes already in $0E and the HUD produces NOTHING', () => {
  // The same byte gate the streamer uses, and $8898 gets it first.
  // RED WHEN: the gate is dropped or compares packets instead of bytes.
  const s = seeded();
  s.frame |= 1;
  s.vram.cursor = 0;
  for (let i = 0; i < 3; i++) queueTerminator(s);
  const at3 = s.zp48;
  hudTick(s, P);
  assert.notStrictEqual(s.zp48, at3, '3 bytes is below CMP #$04 and must produce');

  s.vram.cursor = 0;
  for (let i = 0; i < 4; i++) queueTerminator(s);
  const at4 = s.zp48;
  hudTick(s, P);
  assert.strictEqual(s.vram.cursor, 4, 'the HUD produced with 4 bytes in $0E');
  assert.strictEqual(s.zp48, at4, '$88A4 INC $48 ran past the queue gate');
});

test('$889F LSR / $88A2 BCC: ODD $02 frames only, and $48 does not move on even ones', () => {
  // MEASURED with exec hooks on $8898 and $88A4: entered 390, past both gates
  // 195, on $02 even 0 and odd 195, 0 exceptions. That is not an emergent
  // property of queue occupancy -- it is bit 0 of the frame counter.
  // RED WHEN: the parity is inverted, or the test is `$02 & 1` on the
  // PRE-increment value (which is what a port that ticks $02 too late does).
  const s = seeded();
  let ran = 0, even = 0;
  for (let f = 0; f < 390; f++) {
    s.frame = f & 0xFF;
    s.vram.cursor = 0;
    const before = s.zp48;
    hudTick(s, P);
    if (s.zp48 !== before) { ran++; if ((f & 1) === 0) even++; }
  }
  assert.strictEqual(ran, 195, 'the HUD did not run on exactly half the frames');
  assert.strictEqual(even, 0, 'the HUD ran on an EVEN $02 frame');
});

test('$88A4 INC $48 is a byte; $88A8 AND #$03 is only the dispatch', () => {
  // $48 is stored whole and masked only for the jump table, which matters
  // because it is a WATCHED field (w_0048) and the cartridge's own $48 was $2E
  // at align frame 400 -- not 2.
  // RED WHEN: `state.zp48 = (state.zp48 + 1) & 3`.
  const s = seeded();
  s.zp48 = 0xFD;
  const got = [];
  for (let i = 0; i < 4; i++) { tick(s); got.push(s.zp48); }
  assert.deepStrictEqual(got, [0xFE, 0xFF, 0x00, 0x01], '$48 is not a free byte');
});

// ============================== st_88B6, lives ==============================

test('$88C9-$88F2: the lives digits, including both suppression arms', (t) => {
  // Three of these are CARTRIDGE MEASUREMENTS, from the video captures:
  //   f400 $20 = 3 -> row 29 = .. 61 00 33 ..
  //   f1200 $20 = 1 -> .. 61 00 31 ..
  //   f3500 $20 = 0 -> .. 61 00 00 ..
  // the rest exercise the tens digit and the >= 100 cap, which no capture has.
  // RED WHEN: $88E1's `CMP #$30 / BEQ` is dropped (0 lives draws a '0'), or
  // $88E9's `TXA / BEQ` is dropped (3 lives draws a leading '0'), or the
  // $88D2/$88D6 cap is dropped (100 lives draws garbage).
  const cases = [
    [0,   '01 23 A2 00 61 00 00 FF', 'zero lives writes NO digit at all'],
    [1,   '01 23 A2 00 61 00 31 FF', 'f1200'],
    [3,   '01 23 A2 00 61 00 33 FF', 'f400'],
    [9,   '01 23 A2 00 61 00 39 FF', 'the last single digit'],
    [10,  '01 23 A2 00 61 31 30 FF', 'the tens digit appears'],
    [12,  '01 23 A2 00 61 31 32 FF', ''],
    [99,  '01 23 A2 00 61 39 39 FF', 'the largest honest value'],
    [100, '01 23 A2 00 61 39 39 FF', '$88D6 LDX #$09 / TXA caps at 99'],
    [255, '01 23 A2 00 61 00 00 FF', '$88C3 BPL: bit 7 set reads as ZERO lives'],
  ];
  for (const [lives, want, why] of cases) {
    const s = seeded();
    s.lives[0] = lives;
    const got = tick(s);
    t.diagnostic(`$20 = ${lives}: ${got}  ${why}`);
    assert.strictEqual(got, want, `$20 = ${lives} (${why})`);
  }
});

test('$88BF LDX $18: the lives byte comes from $20,X, not from $20', () => {
  // RED WHEN: `state.lives[0]` is hard-coded. $18 is 0 on every frame of the
  // corpus, so nothing else in the gate can see this.
  const s = seeded();
  s.zp.player = 1;
  s.lives[0] = 3; s.lives[1] = 7;
  assert.strictEqual(tick(s), '01 23 A2 00 61 00 37 FF', '$20,X read the wrong byte');
});

test('$88D9 LDY $0E: the digit patch is CURSOR-RELATIVE, not at a fixed index', (t) => {
  // $88E5 STA $06FE,Y, $88ED STA $06FD,Y and $88F2 STA $06FC,Y all index off
  // Y = $0E as it stood AFTER $85E8 appended the packet, i.e. $0700 + $0E - 2,
  // -3 and -4. Every other test in this file starts the tick on an EMPTY queue,
  // where $0E - 2 is the constant 6 -- so replacing each of the three stores
  // with its constant leaves the WHOLE SUITE GREEN. Measured, one at a time:
  //   q[y-2] -> q[6]   80 pass 0 fail
  //   q[y-4] -> q[4]   80 pass 0 fail
  //
  // A non-empty queue is not an invented state: $8898's own gate ADMITS one --
  // `LDA $0E / CMP #$04 / BCC` lets 1, 2 and 3 bytes through and only refuses
  // at 4 -- and elsewhere in the ROM the same four producers are called in
  // sequence with no gate at all ($9C12/$9C15/$9C18/$9C1E), which is where the
  // cartridge's game-mode-0 readings of $0E = 45 and 90 come from. This test
  // stays inside what $889A permits: leads of 1, 2 and 3 bytes.
  // BOTH LIVES VALUES ARE NEEDED and the first draft had only the first: with
  // $20 = 3 the tens digit is suppressed, so `q[y-3] -> q[5]` stayed GREEN
  // (measured, 95 pass 0 fail) until $20 = 12 was added. Three patch sites,
  // three constants, three arms -- the suppressed one has to be un-suppressed
  // before the check exists.
  // RED WHEN: any of the three patch offsets is written as a constant.
  const cases = [[3, '01 23 A2 00 61 00 33 FF'], [12, '01 23 A2 00 61 31 32 FF']];
  for (const [lives, want] of cases) {
    for (let lead = 1; lead <= 3; lead++) {
      const s = seeded();
      s.lives[0] = lives;
      s.vram.cursor = 0;
      s.frame |= 1;
      for (let i = 0; i < lead; i++) queueTerminator(s);   // 1..3 bytes already there
      hudTick(s, P);
      const got = image(s);
      t.diagnostic(`$20 = ${lives}, lead ${lead}: ${got}`);
      assert.strictEqual(got, '00 '.repeat(lead) + want,
        `$20 = ${lives} with ${lead} byte(s) already in $0E: the lives packet `
        + `must still be patched at $0E-2 / $0E-3 / $0E-4, not at a fixed 6/5/4`);
    }
  }
});

// =========================== st_88F6 / st_892C ==============================

test('$8915: BCD bytes become tile digits, high nibble first, $07E0 read BACKWARDS', () => {
  // $88FB LDY #$02 / $88FD LDA $07E0,Y / $8904 BPL -- Y counts DOWN, so $07E2
  // is emitted FIRST and $07E0 last: the three bytes are stored least
  // significant first. The corpus cannot see this ($07E0-$07E2 = 00 50 00 and
  // both orders put the 5 in the middle pair), so the value here is chosen to
  // be asymmetric in every position.
  // RED WHEN: the loop counts up, or $8917's four LSRs and $8923's AND #$0F
  // are swapped (the nibbles come out reversed within each byte).
  const s = seeded();
  s.zp48 = 0;                                     // next tick is phase 1
  s.score[0] = 0x12; s.score[1] = 0x34; s.score[2] = 0x56;   // $07E0-$07E2
  assert.strictEqual(tick(s), '01 23 B4 64 65 00 35 36 33 34 31 32 30 FF',
    'TOP = 123456 must render as 5 6 3 4 1 2 then $8906\'s trailing 0');
});

test('$892C: the score packet index and the score bytes both follow $18', () => {
  // $892E CLC / $892F ADC $18 -- player 2 gets packet $14 ("2UP" at the same
  // address, `23 A8 32 66 00`) and reads $07E8 instead of $07E4.
  // RED WHEN: either half of that pair is hard-coded to player 1.
  const s = seeded();
  s.zp48 = 2;                                     // next tick is phase 3
  s.score[0x04] = 0x11; s.score[0x05] = 0x22; s.score[0x06] = 0x33;
  s.score[0x08] = 0x44; s.score[0x09] = 0x55; s.score[0x0A] = 0x66;
  assert.strictEqual(tick(s), '01 23 A8 31 66 00 33 33 32 32 31 31 30 FF',
    'player 1: packet $13 and $07E4-$07E6');

  const t2 = seeded();
  t2.zp48 = 2;
  t2.zp.player = 1;
  t2.score[0x04] = 0x11; t2.score[0x05] = 0x22; t2.score[0x06] = 0x33;
  t2.score[0x08] = 0x44; t2.score[0x09] = 0x55; t2.score[0x0A] = 0x66;
  assert.strictEqual(tick(t2), '01 23 A8 32 66 00 36 36 35 35 34 34 30 FF',
    'player 2: packet $14 and $07E8-$07EA');
});

// ========================= st_89E3 + the fall-through =======================

test('$89E3 is ONE open run, and $8A2D falls through into $8A30', () => {
  // The six copies ($0F then $15 $16 $17 $18 $1B) are a single 24-byte packet
  // at $2384 on the wire: packet $0F ends in $FF ("end, append nothing"), the
  // five cells are appended through $85F3 DIRECTLY -- no prologue, no mode
  // byte, no address -- and $863D's bare $FF closes the run. Then $8A30's own
  // packet $1A follows, BY FALL-THROUGH: $8A2D JSR $863D is the last
  // instruction of $89E3 and $8A30 is the next byte.
  // RED WHEN: the five cells go through $85E8 instead of $85F3 (six packets
  // instead of two), or the $8A30 fall-through is dropped (one packet).
  const s = seeded();
  s.zp48 = 1;                                     // next tick is phase 2
  tick(s);
  const q = scanQueue(s.vram.q);
  assert.strictEqual(q.length, 2, 'the power bar is not two packets on the wire');
  assert.strictEqual(q[0].addr, 0x2384, 'row 28 column 4');
  assert.strictEqual(q[0].bytes.length, 24, 'the run is not 24 data bytes');
  assert.strictEqual(q[1].addr, 0x23F8, '$8A30\'s attribute row');
  assert.strictEqual(q[1].bytes.length, 7);
  assert.strictEqual(s.vram.cursor, 39, 'the cartridge measured 39 bytes');
});

test('$89E3 $0100 >= 2: while the player is dying this phase emits ZERO bytes', () => {
  // `LDA $0100 / CMP #$02 / BCS` returns BEFORE the prologue, so $0E stays 0
  // and the terrain streamer gets the frame. Unreachable from this corpus (no
  // scenario dies inside its compared window) and load-bearing from wave 5.
  // RED WHEN: the early exit is moved after cannedPacket().
  const s = seeded();
  s.zp48 = 1;
  s.obj.status[0] = 2;                            // $0100 -- dying
  assert.strictEqual(tick(s), '', 'a dying player still produced HUD bytes');
  assert.strictEqual(s.zp48, 2, 'but $48 still rotated: $88A4 ran first');
});

test('$89F0-$8A2A: each owned power-up swaps its cell for packet $19', (t) => {
  // $19 = `1D 1E 1E 1F`, substituted for whichever of the five cells the player
  // already owns. All five conditions are DIFFERENT shapes and a port that
  // gets one wrong stays green on the corpus, where $41/$44/$45/$46 are 0.
  // RED WHEN: $44 == 2 and $44 == 1 are swapped (DOUBLE vs LASER -- wave 1
  // found NOTES-player.md had that pair inverted), or $45 >= 2 becomes != 0.
  const base = '01 23 84 09 0A 0B 0C ';
  const OWN = '1D 1E 1E 1F';
  const cells = ['0D 0E 0F 10', '11 12 13 14', '15 16 17 18', '19 1A 1B 1C',
                 '1D 62 63 1F'];
  const cases = [
    ['$41 = 1 MISSILE', (s) => { s.zp.missile = 1; }, 0],
    ['$44 = 2 DOUBLE',  (s) => { s.zp.weapon = 2; }, 1],
    ['$44 = 1 LASER',   (s) => { s.zp.weapon = 1; }, 2],
    ['$45 = 2 OPTION',  (s) => { s.zp.options = 2; }, 3],
    ['$46 = 5 SHIELD',  (s) => { s.zp.shield = 5; }, 4],
  ];
  for (const [name, set, cell] of cases) {
    const s = seeded();
    s.zp48 = 1;
    set(s);
    const want = base + cells.map((c, i) => (i === cell ? OWN : c)).join(' ')
               + ' FF 01 23 F8 00 00 00 00 00 00 00 FF';
    const got = tick(s);
    t.diagnostic(`${name}: cell ${cell} -> ${got.slice(0, 60)}...`);
    assert.strictEqual(got, want, name);
  }
  // and the ones that must NOT swap
  for (const [name, set] of [['$45 = 1 is not owned', (s) => { s.zp.options = 1; }],
                             ['$44 = 0 owns neither', () => {}]]) {
    const s = seeded();
    s.zp48 = 1;
    set(s);
    assert.strictEqual(tick(s), IMAGES[2][1], name);
  }
});

test('$8A30: the meter cursor is one attribute byte at $0E - (8 - $42)', (t) => {
  // $42 = 0 patches NOTHING; 1..6 walk the six meter cells. $55 = %01010101 --
  // palette 1 in all four quadrants of an attribute byte, i.e. the whole 32x32
  // cell lights up. $42 is 0 on every frame of the corpus.
  // The packet is `01 23 F8` + 7 data + `FF` = indices 28..38 of a 39-byte
  // queue, so `X = $0E - (8 - $42) = 31 + $42` lands on DATA BYTE $42 -- data
  // byte 0 ($23F8, tile columns 0-3) is never patched, and data bytes 1..6 are
  // the attribute quads over row 28 columns 4-7, 8-11, ... 24-27, which is
  // exactly where st_89E3 drew the six cells. Checked against the emitted
  // packet rather than reasoned about: $42 = 1 puts $55 at data index 1.
  // RED WHEN: the `8 - $42` is off by one, or the `$42 == 0` arm is dropped
  // (which patches index $0E - 8 = 31, data byte 0, lighting up a cell that
  // has no power-up under it).
  for (let meter = 0; meter <= 6; meter++) {
    const s = seeded();
    s.zp48 = 1;
    s.zp.meter = meter;
    tick(s);
    const q = scanQueue(s.vram.q);
    const want = [0, 0, 0, 0, 0, 0, 0];
    if (meter !== 0) want[meter] = 0x55;
    t.diagnostic(`$42 = ${meter}: attr ${hex(q[1].bytes)}`);
    assert.strictEqual(q[1].addr, 0x23F8, `$42 = ${meter} moved the packet address`);
    assert.deepStrictEqual([...q[1].bytes], want, `$42 = ${meter}`);
  }
});

test('$8A40 LDA $0E / SBC $98: the cursor counts back from the END of the queue', (t) => {
  // The companion to the $88D9 test above, on the other producer that patches
  // bytes it has already written. `X := $0E - (8 - $42)` is relative to
  // WHEREVER the 11-byte packet $1A ended, so a port that hard-codes the
  // cursor's empty-queue value (39) puts the lit attribute byte three cells to
  // the left the moment anything else is in the queue -- and the whole suite
  // stays green, measured: `u8(state.vram.cursor - back)` -> `u8(39 - back)`,
  // 80 pass 0 fail.
  //
  // Asserted on the last 11 bytes of the page (the packet $8A30 just appended)
  // rather than through scanQueue(), because a queue that starts with the
  // three-byte lead below has a $00 at index 0 and $8A56 BEQ stops there --
  // which is itself the ROM's behaviour and not something to route around.
  // RED WHEN: the cursor is replaced by a constant, or `8 - $42` shifts.
  for (let lead = 0; lead <= 3; lead++) {
    for (const meter of [1, 3, 6]) {
      const s = seeded();
      s.zp48 = 1;                                   // next tick is phase 2
      s.zp.meter = meter;
      s.vram.cursor = 0;
      s.frame |= 1;
      for (let i = 0; i < lead; i++) queueTerminator(s);
      hudTick(s, P);
      assert.strictEqual(s.vram.cursor, lead + 39, 'the phase did not emit 39 bytes');
      const attr = s.vram.q.subarray(s.vram.cursor - 11, s.vram.cursor);
      const want = [0x01, 0x23, 0xF8, 0, 0, 0, 0, 0, 0, 0, 0xFF];
      want[3 + meter] = 0x55;                       // data byte $42, 1-based
      t.diagnostic(`lead ${lead} $42 = ${meter}: ${hex(attr)}`);
      assert.deepStrictEqual([...attr], want,
        `lead ${lead}, $42 = ${meter}: the cursor landed on the wrong byte`);
    }
  }
});

// ============================== $85F3 itself ================================

test('$860A vs $8629: $FF leaves the run OPEN, $FE closes it', () => {
  // The difference between the two terminators is the whole reason st_89E3 can
  // chain six copies into one packet. Packet $15 ends in $FF and packet $11
  // ends in $FE, straight out of the ROM.
  // RED WHEN: the two control codes are treated alike.
  const a = bootState(res.manifest);
  copyPacket(a, P, 0x15);
  assert.strictEqual(image(a), '0D 0E 0F 10', '$FF must append nothing');

  const b = bootState(res.manifest);
  copyPacket(b, P, 0x11);
  assert.strictEqual(image(b), '23 A2 00 00 00 00 FF', '$FE must append $FF');
});

test('$85E8 is a PROLOGUE that falls through: it adds the mode byte $01', () => {
  // $85F1 is the third byte of `JSR $8645`, not a routine. Entering at $85E8
  // and entering at $85F3 differ by exactly one byte, and that byte is what
  // makes the difference between a new packet and a continuation.
  const a = bootState(res.manifest);
  cannedPacket(a, P, 0x15);
  const b = bootState(res.manifest);
  copyPacket(b, P, 0x15);
  assert.strictEqual(image(a), '01 ' + image(b));
});

test('$862D: control code $FD emits TWO more packets from ONE index', () => {
  // Packet $1F = `27 D6 AF FD 27 DE AA FD 27 E6 FA FE` -- three packets in one
  // stream. NOTHING IN STAGE 1 USES IT (00-recon-terrain.md's own "Not
  // resolved" list says so), so this is the only place the arm runs at all.
  // RED WHEN: $FD is treated as data, or forgets its `LDA #$01` mode byte.
  const s = bootState(res.manifest);
  cannedPacket(s, P, 0x1F);
  assert.strictEqual(image(s), '01 27 D6 AF FF 01 27 DE AA FF 01 27 E6 FA FF');
  const q = scanQueue(s.vram.q);
  assert.strictEqual(q.length, 3, '$FD did not start a new packet');
  assert.deepStrictEqual(q.map((p) => p.addr), [0x27D6, 0x27DE, 0x27E6]);
});

test('$8617-$8624: index bit 7 blanks everything after the first TWO bytes', (t) => {
  // The "erase this text" variant. $85F5 ASL A is 8-bit, so bit 7 never reaches
  // the table -- index $80|n and index n share a pointer -- and the two bytes
  // that survive are exactly the packet's own ADDRESS. UNEXERCISED on the
  // cartridge; transcribed from the listing and said so in src/hudpackets.js.
  //
  // A CHECK THAT COULD NOT SEE ITS OWN SUBJECT, and how it was found. This test
  // used to drive index $80|$11, and packet $11 is `23 A2 00 00 00 00 FE` --
  // every byte after the address is ALREADY $00, so the blanked and un-blanked
  // images are IDENTICAL. Deleting the blanker outright, or starting the $9B
  // countdown at 3, 4 or 9, left all 80 tests green. Measured over every packet
  // the port can emit:
  //
  //   $0F $12 $13 $14 $15 $16 $17 $18 $19 $1B   blanked != plain   (10)
  //   $11 $1A                                   blanked == plain   ( 2)
  //
  // and the old test had picked one of the two blind ones. So this one drives
  // $0F, and the FIRST assertion is that the two images differ at all --
  // without it the rest is 0 == 0 (docs/knowledge/03, "coverage must be
  // proportional to the content").
  // RED WHEN: the blanker is removed; the $9B countdown starts at 1, 3 or
  // anything but 2; or the lookup masks bit 7 out of $9A as well as out of X.
  const plain = (idx) => { const s = bootState(res.manifest); cannedPacket(s, P, idx); return image(s); };

  const p0F = plain(0x0F), b0F = plain(0x80 | 0x0F);
  t.diagnostic(`$0F plain "${p0F}" blanked "${b0F}"`);
  assert.notStrictEqual(b0F, p0F,
    'packet $0F cannot tell blanked from plain -- this test would be vacuous');
  assert.strictEqual(p0F, '01 23 84 09 0A 0B 0C', 'packet $0F, un-blanked');
  assert.strictEqual(b0F, '01 23 84 00 00 00 00',
    'the blanked power-bar packet must keep $23 $84 and zero the four cells');

  // Two more, so that "the first TWO bytes" is pinned by three packets whose
  // surviving pair differs, not by one.
  assert.strictEqual(plain(0x80 | 0x12), '01 23 B4 00 00 00', 'blanked TOP-score label');
  assert.strictEqual(plain(0x80 | 0x13), '01 23 A8 00 00 00', 'blanked score label');
  assert.strictEqual(plain(0x80 | 0x15), '01 0D 0E 00 00',
    'a cell packet has no address: the two survivors are its first two TILES');

  // ...and the countdown is a countdown, not a flag: the two survivors are the
  // first two bytes COPIED, and everything from the third on is $00 however
  // long the stream is.
  assert.strictEqual(plain(0x80 | 0x1C).slice(0, 8), '01 23 84',
    'the 25-byte packet $1C keeps its address');
  assert.match(plain(0x80 | 0x1C), /^01 23 84( 00){24} FF$/,
    'every byte after the first two must be $00');
});

test('$85F7 LDA $864E,X: an index with no packet throws by ROM address', () => {
  // A silent no-op here would be a HUD that draws nothing and a gate that
  // stays green (docs/knowledge/02 trap 2).
  const s = bootState(res.manifest);
  assert.throws(() => copyPacket(s, P, 0x40), /\$85F7/);
});

// ============================ the drain, end to end =========================

test('$8A76 clears only $0700[0]: the stop byte is what ends the queue', () => {
  // The page is NOT wiped between frames. A 14-byte frame after a 39-byte one
  // leaves 25 stale bytes behind, and the only thing that stops $8A51 walking
  // into them is $80B0's $8641 terminator. Found the hard way: without it,
  // tests/terrain.test.js reported 37 wrong nametable bytes including the
  // PLAYFIELD's attribute table.
  // RED WHEN: drainQueue() zeroes the whole page (this test then passes for the
  // wrong reason -- so it asserts the STALE BYTES ARE STILL THERE as well).
  const s = seeded();
  s.zp48 = 1;
  tick(s); queueTerminator(s);                    // the 39-byte phase
  drainQueue(s);
  assert.strictEqual(s.vram.q[0], 0, '$8A78 STA $0700 did not run');
  assert.strictEqual(s.vram.q[20], 0x1A, 'the page was wiped; the ROM keeps it');
  s.zp48 = 3;
  tick(s); queueTerminator(s);                    // the 8-byte lives phase on top
  const q = scanQueue(s.vram.q);
  assert.strictEqual(q.length, 1, 'the drain walked into the previous frame');
  assert.strictEqual(q[0].addr, 0x23A2);
});
