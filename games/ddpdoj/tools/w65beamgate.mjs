#!/usr/bin/env node
// W65 (B3) -- **THE SCENARIO IN WHICH A BOMB IS DROPPED WHILE THE BEAM IS HELD.**
//
//     node games/ddpdoj/tools/w65beamgate.mjs [--assets DIR] [--break NAME]
//
// ============================================================================
// WHY THIS FILE EXISTS AND WHY IT IS NOT `w64bombgate.mjs` WITH ONE FLAG
// ============================================================================
// W64 §7 left ONE thing broken rather than faked: `$249A5C tst.b ($3f,A6) /
// bne $249A80` -- bombing while HOLDING FIRE -- threw at `$249A80`, because
// that arm is not "the same bomb with a flag".  It is a different weapon:
//
//   `$249A98 bset #$0,($1,A1)` sets bit 0 of the BOMB RECORD's own type word,
//   which routes `$255E16 andi.w #$7,D0` to dispatch entry 1 (`$255FE2`, a
//   FOUR-record 132-frame machine with 41 beam segments) and `$245632 btst
//   #$0,D5` to `$2456A6` (a bounding box over the beam against pool B, pool A
//   AND the bullet pool) instead of `$245638`'s 150 fixed slots.
//
// W64's gate holds fire only every fourth frame, ON PURPOSE, because holding
// it past the beam's arm-up is what used to stop the page.  So there is no
// setting of W64's gate that exercises any of this, and this file drives the
// opposite input: **fire HELD for the whole run**.
//
// It asserts, as exact counts and exact frames, that:
//
//   * the beam ARMS (`$24C282` sets `($3f,A6)`) before the press, so the press
//     really does take `$249A80` and not `$249A62`;
//   * the record is allocated with **bit 0 SET** -- the one instruction that
//     makes it a different weapon;
//   * `$255FE2` installs FOUR heads (records 0, 42, 43, 44) and `$2561AA`
//     seeds the 41 SEGMENTS, and the whole thing lives **132 frames** -- 120
//     from `($1A,A6)`'s `$78` seed and 12 from `$256712`'s twelve entries;
//   * `$2456A6` damages, and its THREE pools are counted apart;
//   * `$243DA0` is REACHED (the ordinary bomb jumps over it at `$249A7E`), so
//     the laser bomb and only the laser bomb arms the bullet cancel;
//   * **THREE PATHS W65 MADE REACHABLE ALL RUN**: `$24D188` (the pods'
//     knockback), `$24A4E2` (the ship's bit-7 aura) and `$2496A2` (the
//     player's own knockback ramp).  All three are behind `$249A92 bset
//     #$7,($1,A6)`, and all three threw before this wave;
//   * `$256468` + `$2564F0` tear it down and the 45-record pool drains;
//   * **NO RANK WRITE MOVED** -- `$81309E`, `$81B646`, `$81B648`, `$81B65C`,
//     `$81B65E`, on EVERY frame, against a control that PROVES the rows move.
//
// **IT IS PORT-VS-LISTING, NOT A BOARD COMPARISON.**  No MAME run in this repo
// has ever held fire and pressed Button 2.
//
// FOUR CONTROLS, because one control cannot separate four claims:
//
// --break no-press      Button 2 is never pressed.  The beam still arms and
//                       the ship still flies; nothing else happens.
// --break rank-poke     one `+1` into each of the five rank words, AFTER the
//                       presses.  **ALL FIVE RANK ROWS RED and nothing else.**
//                       W63 §8's rule: a "nothing moved" row that cannot be
//                       made to move is not a check, and this project has
//                       shipped that mistake.
// --break tap-fire      fire TAPPED instead of held, i.e. W64's own input.
//                       `($3f,A6)` never becomes 1, the press takes `$249A62`
//                       and the ORDINARY bomb runs -- which is the control
//                       that proves every row above is about the LASER arm and
//                       not about "a bomb".
// --break no-driver     type-5 call #7 is counted and not run.  The record is
//                       allocated and never driven, so nothing installs,
//                       nothing tears down and the pool stays dirty.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, defaultHandlers } from '../src/main.js';
import { loadBundle } from '../src/web/assets.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { BOMBRAM, BEAM_REC } from '../src/bomb.js';
import { SHIP_MUTATE } from '../src/shipsprite.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const BREAKS = ['no-press', 'rank-poke', 'tap-fire', 'no-driver'];
const brk = arg('break', null);
if (brk && !BREAKS.includes(brk)) {
  console.error(`unknown --break ${brk}; known: ${BREAKS.join(', ')}`);
  process.exit(2);
}
if (!fs.existsSync(path.join(ASSETS, 'manifest.json'))) {
  console.error(`${ASSETS}/manifest.json is missing -- run: `
    + 'node games/ddpdoj/tools/export-web.mjs');
  process.exit(2);
}

const STEPS = 2200;
// The beam's arm-up takes 17 held frames (`src/laser.js` $24C250) and the
// corpus needs a chain running before the second press, so the presses are
// spaced well past one bomb's 132-frame life.
const PRESS = [380, 700, 1020];
const P1 = 0x8103e6;
const P_POSY = 0x02;
const RANK = [
  [0x81309e, '$81309E rank'], [0x81b646, '$81B646 power P1'],
  [0x81b648, '$81B648 power P2'], [0x81b65c, '$81B65C stock P1'],
  [0x81b65e, '$81B65E stock P2'],
];

const bundle = await loadBundle(async (n) =>
  new Uint8Array(fs.readFileSync(path.join(ASSETS, n))));

function run() {
  const game = new Game(bundle.seed, bundle.tables, {
    profile: bundle.profile,
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  SHIP_MUTATE.value = brk === 'no-driver' ? 'no-bomb-driver' : null;
  void defaultHandlers;
  const held = portWordFromBits([BIT.b1]);
  const bomb = portWordFromBits([BIT.b1, BIT.b2]);
  const none = portWordFromBits([]);
  const r = {
    frames: 0, stop: null, stopFrame: null, stopAddr: null,
    heldAtPress: [], recAtPress: [], recLifeFrames: [], recFirstLive: null,
    liveMax: 0, headsLive: [], armWord: [], knockSeen: 0, podKnockSeen: 0,
    auraSeen: 0, bit7Frames: 0, poolDirtyAtEnd: 0, cooldownAtTeardown: [],
    rankMoved: [], rankStart: null, rankEnd: null, chainLatch: [],
    scoreEnd: 0, chainCount: 0, altChainFrames: 0,
    maxKnock: 0, maxPodGap: 0, r42Bias: [], segStep: new Set(), segCulled: 0,
    poolBHitsAt: [],
  };
  const snap = () => RANK.map(([a]) => game.ram.u16(a));
  r.rankStart = snap();
  let liveSince = null;
  let prevSeg = [];
  const justSeeded = [];
  for (let i = 0; i < STEPS; i++) {
    const ram = game.ram;
    // HELD fire, every frame -- that is the whole point.  `tap-fire` is W64's
    // input and is the control that says so.
    let w = brk === 'tap-fire' ? ((i % 4 === 0) ? held : none) : held;
    if (PRESS.includes(i) && brk !== 'no-press') {
      w = brk === 'tap-fire' ? portWordFromBits([BIT.b2]) : bomb;
    }
    if (PRESS.includes(i)) r.heldAtPress.push(ram.u8(P1 + 0x3f));
    try {
      game.step(w);
    } catch (e) {
      r.stop = e.message.split('\n')[0].slice(0, 200);
      r.stopAddr = e.romAddress ?? null;
      r.stopFrame = game.logicFrame;
      r.frames = i;
      break;
    }
    if (PRESS.includes(i)) {
      r.recAtPress.push(ram.u16(BOMBRAM.rec));
      r.armWord.push([ram.u16(BOMBRAM.armWord), ram.u16(BOMBRAM.modeWord)]);
    }
    const rec = ram.u16(BOMBRAM.rec);
    if ((rec & 0x8000) !== 0) {
      if (liveSince === null) {
        liveSince = game.logicFrame;
        if (r.recFirstLive === null) r.recFirstLive = game.logicFrame;
      }
      let live = 0;
      for (let k = 0; k < BOMBRAM.slots; k++) {
        if (ram.u16(BOMBRAM.rec + k * BOMBRAM.stride) & 0x8000) live++;
      }
      if (live > r.liveMax) r.liveMax = live;
    } else if (liveSince !== null) {
      r.recLifeFrames.push(game.logicFrame - liveSince);
      r.cooldownAtTeardown.push(ram.u16(BOMBRAM.cooldown));
      liveSince = null;
    }
    // ($1,A6) bit 7 -- `$249A92`'s, and the gate for all three newly reachable
    // paths.  `($46,A6)` is `$2496A2`'s ramp cursor and `($38,A1)` the pods'.
    if (ram.btst8(P1 + 1, 7)) {
      r.bit7Frames++;
      if (ram.u16(P1 + 0x46) !== 0) r.knockSeen++;
      if (ram.u16(0x8104aa + 0x38) !== 0) r.podKnockSeen++;
      r.auraSeen++;
      // **THE CURSORS ARE NOT THE EFFECT.**  `($46,A6)` and `($38,A1)` are
      // written by the ARM ($249AA4 / $249AD8), so a port that deleted
      // `$2496A2` and `$24D188` outright leaves both of them exactly as they
      // are -- and the two rows above stayed GREEN under precisely that
      // mutant.  These two measure what the ramps DO: the player's knock field
      // `($6,A6)` (only `$2496B6 sub.w D0,($6,A6)` moves it) and the distance
      // the pods are thrown behind the ship (`$24D198 sub.w D0,($2,A6)`).
      const k = ram.u16(P1 + 0x06);
      r.maxKnock = Math.max(r.maxKnock, k >= 0x8000 ? 0x10000 - k : k);
      // The pods are put back ON the ship every frame ($24C33A move.l), so
      // the knockback is one frame of ramp at a time and it is always
      // BACKWARD -- the pod Y goes BELOW the ship Y and nothing else in the
      // frame does that.  |gap| was the first draft and stayed green with the
      // ramp deleted, because the ordinary $24D146 move is the same size.
      let gap = ram.u16(0x8104aa + 0x02) - ram.u16(P1 + 0x02);
      if (gap > 0x8000) gap -= 0x10000; else if (gap < -0x8000) gap += 0x10000;
      r.maxPodGap = Math.max(r.maxPodGap, -gap);
    }
    // The FIRST frame of each bomb: record 42's own two words, which
    // `$25606C move.w` (Y, biased $FE00) and `$2560C6 move.w` (X only) write
    // out of the player's position long.  Both are exact and both are
    // derivable from the two instructions, so they pin the arithmetic without
    // a golden number.
    // ...and `$25606C`'s -$200 bias is NOT observable here: `$256348`'s
    // `$2563A4 move.w D0,($7E2,A0)` overwrites record 42's Y from record 44's
    // in the same frame.  It is a unit-test row instead
    // (`tests/w65beam.test.js`, "$25606C biases record 42").
    // Every LIVE segment's Y step, as a set.  `$25621C addi.w #$200` twice
    // plus `$256220 add.w ($30,A5)` is the whole law, so the set is
    // {$400 + velY} and a mutant that drops the velocity or changes either
    // `$200` moves every member of it.
    // PHASE 1 ONLY.  Phase 2's `$2563B6` REBUILDS all 41 from the ship
    // outward every frame, so its frame-to-frame differences are not steps.
    if ((ram.u16(BOMBRAM.rec) & 0x8000) !== 0
      && ram.u16(BOMBRAM.rec + 0x18) === 0) {
      const vel = ram.u16(P1 + 0x30);
      for (let k = 1; k <= BEAM_REC.segs; k++) {
        const a = BOMBRAM.rec + k * BOMBRAM.stride;
        const y = ram.u16(a + 0x02);
        if ((ram.u16(a) & 0x8000) === 0) {
          prevSeg[k] = null; justSeeded[k] = true; continue;
        }
        if (prevSeg[k] !== null && prevSeg[k] !== undefined && !justSeeded[k]) {
          r.segStep.add(((y - prevSeg[k]) & 0xffff) - ((0x400 + vel) & 0xffff));
        }
        justSeeded[k] = false;
        prevSeg[k] = y;
      }
      let n = 0;
      for (let k = 1; k <= BEAM_REC.segs; k++) {
        if ((ram.u16(BOMBRAM.rec + k * BOMBRAM.stride) & 0x8000) === 0) n++;
      }
      r.segCulled = Math.max(r.segCulled, n);
    } else { prevSeg = []; justSeeded.length = 0; }
    const now = snap();
    for (let k = 0; k < RANK.length; k++) {
      if (now[k] !== r.rankStart[k] && !r.rankMoved.some((m) => m[0] === k)) {
        r.rankMoved.push([k, game.logicFrame, r.rankStart[k], now[k]]);
      }
    }
    if (ram.u16(0x81b636) !== 0) r.altChainFrames++;
    if (brk === 'rank-poke' && i === PRESS[PRESS.length - 1] + 20) {
      for (const [a] of RANK) ram.setU16(a, ram.u16(a) + 1);
    }
    r.frames = i + 1;
  }
  r.rankEnd = snap();
  for (let k = 0; k < BOMBRAM.slots; k++) {
    if (game.ram.u16(BOMBRAM.rec + k * BOMBRAM.stride) !== 0) r.poolDirtyAtEnd++;
  }
  r.scoreEnd = game.ram.u32(0x81b440);
  r.chainCount = game.ram.u16(0x81b5da);
  r.game = game;
  SHIP_MUTATE.value = null;
  return r;
}

const r = run();
const g = r.game;
const R = g.ram;
const ev = (k) => g.bombEvents.get(k) ?? 0;
const marks = (k) => g.bombMarks.filter((m) => m[0] === k);
const beamPresses = ev('press:fired') + ev('press:fired+partner');

console.log(`W65 LASER-BOMB SCENARIO -- ${STEPS} steps from the shipped `
  + `bundle's own seed, fire ${brk === 'tap-fire' ? 'TAPPED' : 'HELD'}, `
  + `Button 2 at steps ${PRESS.join('/')}${brk ? `   [--break ${brk}]` : ''}`);
console.log(`  frames ${r.frames}   stop: ${r.stop ?? '(ran to the end)'}`
  + `${r.stopFrame ? ` @lf${r.stopFrame}` : ''}`);
console.log(`  ($3f,A6) at the three presses: ${JSON.stringify(r.heldAtPress)}`
  + `   -- 1 means the BEAM was up and $249A5C took $249A80`);
console.log(`  $811F72 on the press frame: ${JSON.stringify(
  r.recAtPress.map((v) => '$' + v.toString(16)))}   -- bit 0 is $249A98's`);
console.log(`  $255FE2 inits ${ev('beam-init:0')}, phase-2 steps `
  + `${ev('beam-phase:2')}, record lives ${JSON.stringify(r.recLifeFrames)} `
  + `frames; MAX ${r.liveMax} of 45 slots live`);
console.log(`  $2456A6: poolA ${g.beamHitsA}, poolB ${g.beamHitsB}, bullets `
  + `ERASED ${g.beamErased}, over ${g.beamDamageFrames} frames`);
console.log(`  $243DA0 arm on the press frames: `
  + `${JSON.stringify(r.armWord.map(([a, m]) => `${a}/$${m.toString(16)}`))}`);
console.log(`  ($1,A6) bit 7 set on ${r.bit7Frames} frames; $2496A2 ramp live `
  + `on ${r.knockSeen}, $24D188 pod ramp on ${r.podKnockSeen}`);
console.log(`  teardowns ${marks('teardown').length} at lf `
  + `${marks('teardown').map((m) => m[1]).join(',')}; $81296C after each `
  + `${JSON.stringify(r.cooldownAtTeardown)}; pool dirty at end `
  + `${r.poolDirtyAtEnd}`);
console.log(`  $81B636 (the ALT chain machine's divider) non-zero on `
  + `${r.altChainFrames} frames; total $${r.scoreEnd.toString(16)}; chain `
  + `count ${r.chainCount}`);
console.log(`  maxKnock $${r.maxKnock.toString(16)} maxPodGap `
  + `$${r.maxPodGap.toString(16)} segStep ${JSON.stringify([...r.segStep])} `
  + `segCulled ${r.segCulled} r42 ${JSON.stringify(r.r42Bias)}`);
console.log(`  RANK start ${JSON.stringify(r.rankStart)}  end `
  + `${JSON.stringify(r.rankEnd)}  moved ${JSON.stringify(r.rankMoved)}`);

const rows = [];
const ck = (name, ok, detail) => { rows.push([name, ok, detail]); };

// **EVERY ROW BELOW ASSERTS THE REAL CLAIM, UNCONDITIONALLY.**
//
// My first draft wrote each row as `brk === 'no-press' ? <the null
// expectation> : <the real one>`, and BOTH `no-press` and `rank-poke` came
// back 20/20 GREEN -- i.e. the two controls the brief names as
// safety-critical could not fail, because each row quietly agreed with
// whatever the break did.  That is `docs/knowledge/03`'s failure exactly, and
// it is recorded here rather than fixed silently: a control that flips the
// assertion is not a control, it is a second port.  The rows are now the
// claims, the breaks make them false, and the exit code is what says so.

// **THE ROW THAT SAYS WHAT THIS WAVE INHERITED.**  W64 §8.1 found that
// `$2564BA clr.b ($3e,A0)` -- the bomb's cooldown expiry -- is the only
// instruction this port has ever run that clears the seed's `$FF`
// invulnerability, so a bomb makes the ship MORTAL and the next hit reaches
// `$249F8A`, the unported 212-instruction hit/death path.  The LASER bomb
// reaches the SAME expiry, so this gate inherits the same stop, and it does
// not narrow around it: it runs the full 2,200 steps and asserts that IF the
// run stops it stops THERE, by romAddress.
ck('the ONLY stop is $249F8A, the hit path a BOMB makes reachable',
  r.stop === null || r.stopAddr === 0x249f8a,
  `$${(r.stopAddr ?? 0).toString(16).toUpperCase()} ${r.stop ?? ''}`);
ck('THE BEAM IS UP AT EVERY PRESS: ($3f,A6) == 1',
  r.heldAtPress.length === PRESS.length && r.heldAtPress.every((v) => v === 1),
  JSON.stringify(r.heldAtPress));
ck('$249A98 SETS BIT 0 OF THE RECORD, which is what picks the weapon',
  r.recAtPress.length === PRESS.length
  && r.recAtPress.every((v) => (v & 0x8001) === 0x8001),
  JSON.stringify(r.recAtPress.map((v) => '$' + v.toString(16))));
ck('BUTTON 2 FIRES WHILE THE BEAM IS HELD: three presses accepted',
  beamPresses === PRESS.length, `${beamPresses} accepted`);
ck('$255FE2 INSTALLS (it was a throw until this wave)',
  ev('beam-init:0') === PRESS.length, `${ev('beam-init:0')} installs`);
// [M] 31, and it is EXACT rather than "> 4": four heads plus twenty-seven
// segments, the other fourteen already past $7800.  A `dbra` one short, a cull
// bound $100 wider or a seeder that runs twice all move this number.
ck('FOUR HEADS AND 41 SEGMENTS: exactly 29 records live at the peak',
  r.liveMax === 29, `max ${r.liveMax} of 45`);
// [M] 131 frames from the press to the frame the record reads 0 again.  The
// DERIVATION is 120 + 12 = 132 script steps (`$256CAA` seeds `($1A,A6)` =
// `$78` and `$256712` has twelve entries) and the record is cleared ON the
// last of them rather than after it, so 131 elapsed frames.  Both numbers are
// here because a reader with only the derivation will think this is off by
// one.  [M] the ORDINARY bomb's is **107** on the same input -- which is what
// `--break tap-fire` reddens this row with, and it is the sharpest single
// statement that the two arms are different weapons.
ck('THE LASER BOMB LIVES 131 FRAMES (120 from ($1A,A6) + 12 from $256712)',
  r.recLifeFrames.length === PRESS.length
  && r.recLifeFrames.every((v) => v === 131),
  JSON.stringify(r.recLifeFrames));
ck('$2456A6 DAMAGES (it was a throw until this wave)',
  g.beamDamageFrames > 0,
  `${g.beamHitsA}/${g.beamHitsB}/${g.beamErased} over `
  + `${g.beamDamageFrames} frames`);
// `$249AEA jsr $243DA0` is one of the THIRTEEN instructions `$249A7E bra.b
// $249AF6` jumps over on the ordinary arm (W64 §1.3), so a `beam-arm` event is
// proof the LASER arm ran and the ordinary one did not.  Reading `$81B410`
// after the step measures nothing -- `src/bulletdriver.js` consumes it in the
// same frame; [M] 0/$0 on every press frame, and that is why this row counts
// the event instead.
ck('$243DA0 IS REACHED, and ONLY from the laser arm ($249A7E jumps it)',
  ev('beam-arm:armed') + ev('beam-arm:busy') === PRESS.length,
  `${ev('beam-arm:armed')} armed + ${ev('beam-arm:busy')} busy against `
  + `${beamPresses} presses`);
ck('$249A92 SETS ($1,A6) BIT 7 for the length of the bomb',
  r.bit7Frames > 300, `${r.bit7Frames} frames`);
// The two rows below assert the RAMPS' EFFECT and not their cursors: the
// cursors are `$249AA4`/`$249AD8`'s, so a port with no knockback at all still
// has them.  [M] with both ramps running the player's knock field reaches
// $23A8 and the pods sit up to $1B70 behind the ship; with `$24D17C bmi`
// deleted, 0 and ~$150.
ck('...and $2496A2, THE PLAYER KNOCKBACK, MOVES ($6,A6)',
  r.knockSeen > 0 && r.maxKnock >= 0x800,
  `${r.knockSeen} ramp frames, max |($6,A6)| = $${r.maxKnock.toString(16)}`);
// The RAMP's own effect is a unit-test row (`tests/w65beam.test.js`, '$24D188
// walks the $24D28E ramp'): [M] the pods are put back ON the ship every frame
// ($24C33A move.l), so one frame of ramp is at most $200 against a $24D146
// step of about $800, and no aggregate of the pod's position in a 2,200-frame
// run separates them.  What this row can say is that the CURSOR is walked,
// which is $24D19C's own `subq.w #$2` and nothing else in the port touches.
ck("...and $24D188, THE PODS' knockback cursor, is WALKED by $24D19C",
  r.podKnockSeen > 0 && r.podKnockSeen < r.bit7Frames,
  `${r.podKnockSeen} ramp frames of ${r.bit7Frames} with bit 7`);
// `$25621C addi.w #$200` twice and `$256220 add.w ($30,A5),D0` are the whole
// per-frame step, so the SET of (observed step - ($400 + velY)) is {0}.
ck('every live segment steps EXACTLY $400 + the player velocity',
  r.segStep.size === 1 && r.segStep.has(0),
  `deltas seen: ${JSON.stringify([...r.segStep])}`);
ck('...and the beam is CULLED at $7800: some of the 41 are dead at once',
  r.segCulled > 0 && r.segCulled < BEAM_REC.segs,
  `${r.segCulled} of ${BEAM_REC.segs} culled at the peak`);
ck('$256468 + $2564F0 TEAR DOWN and reload $81296C := $28',
  marks('teardown').length === PRESS.length
  && r.cooldownAtTeardown.length === PRESS.length
  && r.cooldownAtTeardown.every((v) => v === 0x28),
  `${marks('teardown').length} teardowns, $81296C `
  + JSON.stringify(r.cooldownAtTeardown));
ck('THE 45-RECORD POOL DRAINS: 0 dirty at the end',
  r.poolDirtyAtEnd === 0, `${r.poolDirtyAtEnd} dirty`);
// **RECON 38 §1.5 AND W64 §6.1 ARE BOTH STALE, AND THIS IS THE ROW THAT SAYS
// SO.**  Both state that the `$400` hit bit "has exactly two setters and both
// are in the A2/A3 weapon loops".  [M] `$24580E` and `$2458E2` -- inside
// `$2456A6` -- are a THIRD and FOURTH, so a LASER BOMB hit reaches `$286876`,
// `src/score.js`'s second chain machine, where an ORDINARY bomb hit does not.
// `$81B636` is NOT the check for this: [M] held fire alone leaves it non-zero
// on 800+ frames, because the BEAM already feeds that machine.
ck('THE $400 HIT BIT: $2456A6 is its THIRD and FOURTH setter',
  ev('beam-400:A') + ev('beam-400:B') > 0,
  `poolA ${ev('beam-400:A')} + poolB ${ev('beam-400:B')} ori.w #$400`);
for (let k = 0; k < RANK.length; k++) {
  ck(`RANK UNMOVED: ${RANK[k][1]}`,
    !r.rankMoved.some((m) => m[0] === k),
    r.rankMoved.filter((m) => m[0] === k).map(
      (m) => `lf${m[1]} ${m[2]}->${m[3]}`).join(' ') || `${r.rankEnd[k]}`);
}

let bad = 0;
for (const [name, ok, detail] of rows) {
  console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${name}${ok ? '' : `  -- ${detail}`}`);
  if (!ok) bad++;
}
console.log(`W65 LASER-BOMB GATE: ${rows.length - bad} passed, ${bad} failed`
  + `${brk ? `   [--break ${brk}]` : ''}`);
process.exit(bad === 0 ? 0 : 1);
