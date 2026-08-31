#!/usr/bin/env node
// W63 (B1) -- **THE SCENARIO IN WHICH THE CHAIN EXPIRES AND THE SCORE DRAINS.**
//
//     node games/ddpdoj/tools/w63hudgate.mjs [--assets DIR] [--break NAME]
//
// ============================================================================
// WHY THIS FILE EXISTS
// ============================================================================
// `src/score.js` has carried this sentence since wave 34:
//
//     "The consequence is stated rather than hidden: with no decrement a chain
//      the port starts never expires."
//
// It was true for twenty-nine waves.  `$240F62[0] = $28D520` is now dispatched
// (`src/hud.js`), so `$284636 subq.w #$1,$81B5C0` and `$2847D4`'s P2 mirror run
// in the cartridge's own slot -- AFTER the rank object and AFTER the player,
// which is what makes W19's measured frame order (`... > drain > drain0 >
// (brkT) > meter-`) a property of the port rather than a coincidence.
//
// This gate drives the SHIPPED BUNDLE from its own seed and asserts, as exact
// counts and exact frames, that:
//
//   * object type 0 is DISPATCHED and walks state 1 (it was a counted miss
//     under `$240F62 + 0` on every frame of every run before this wave);
//   * the RANK object's slot is BEFORE the player's and the player's BEFORE
//     this one, ON EVERY FRAME -- recon 38 7.1's "the one that matters";
//   * `$81B6EE` -- THE HUD SLIDE-IN -- runs for 48 frames and then clears, so
//     the skeleton is live from frame 49 of the port's life onward;
//   * **THE CHAIN METER DECREMENTS, AND REACHES ZERO**;
//   * **THE PENDING SCORE DRAINS** into the total and the high score follows;
//   * the two per-frame HUD cursors move;
//   * `$2853D2`'s guard is reached and RETURNS -- the stage-clear tally is
//     unreachable by construction and this proves the guard is what stops it;
//   * NO RANK WRITE MOVED.
//
// **IT IS PORT-VS-LISTING, NOT A BOARD COMPARISON.**  No MAME run in this repo
// has ever compared a chain meter, a pending score or a HUD word against the
// board, and this file does not pretend otherwise.
//
// THREE CONTROLS, because one control cannot separate three claims.  [M] on
// this tree: 0 / 18 / 4 / 5 failures.
//
// --break no-hud          object type 0 is NOT dispatched, i.e. HEAD.  **18 of
//                         the 27 go RED.**  The nine that stay green are the
//                         five RANK rows (negative claims -- see `rank-poke`),
//                         the object-table ORDER (a property of `$24111E`'s
//                         descending-priority insert, not of this wave), the
//                         seed's own `$81B6EE`, and the meter CAP, which is
//                         `src/score.js`'s refill and not this file's.
// --break frozen-meter    `$81B5C0`/`$81B5EA` are restored to their pre-step
//                         value after every step, so BOTH the decrement and the
//                         refill are undone.  **4 go RED, all four about the
//                         chain**, and the DRAIN, CURSOR and SLIDE-IN rows stay
//                         green -- which is what says they measure different
//                         things and are not one assertion written four times.
// --break rank-poke       one `+1` into each of the four rank words at frame
//                         100.  **All five RANK rows go RED.**  A "nothing
//                         moved" row that cannot be made to move is not a
//                         check, and this project has shipped that mistake.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, defaultHandlers } from '../src/main.js';
import { loadBundle } from '../src/web/assets.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { HUD, HUDRAM, objectOrder } from '../src/hud.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const BREAKS = ['no-hud', 'frozen-meter', 'rank-poke'];
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

const STEPS = 6200;
const bundle = await loadBundle(async (n) =>
  new Uint8Array(fs.readFileSync(path.join(ASSETS, n))));

function run() {
  const rom = { windows: null };            // placeholder; Game builds its own
  void rom;
  const game = new Game(bundle.seed, bundle.tables, {
    profile: bundle.profile,
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  if (brk === 'no-hud') {
    // HEAD: build the default map and DELETE entry 0.  Nothing else changes,
    // so every red below is about object type 0 and not about the harness.
    const h = defaultHandlers(game.rom, game.vram, {});
    h.delete(0);
    game.handlers = h;
  }
  // fire TAPPED every fourth frame -- `docs/knowledge/09`: a scenario must
  // PLAY.  A passive run has no chain to expire and no score to drain.
  const held = portWordFromBits([BIT.b1]);
  const none = portWordFromBits([]);
  const r = {
    frames: 0, stop: null,
    orderSeen: 0, orderBad: 0, ledgerDispatched: 0, ledgerMissed: 0,
    slideStart: null, slideClearedAt: null, slideFrames: 0, bannerTimerAt0: null,
    meterMax: 0, meterZeroFrames: 0, meterFirstNonZero: null,
    totalFirstNonZero: null, pendingMax: 0,
    cursorAValues: new Set(), cursorBValues: new Set(),
    ledgerAtStart: null, ledgerAtEnd: null,
    seedLf: bundle.cap.frames[0].lf,
  };
  const ledger = (ram) => ({
    rank: ram.u16(0x81309e), rankPower: ram.u16(HUDRAM.hyperActiveP1 + 8),
    rankPow: ram.u16(0x81b646),
    hyperP1: ram.u16(0x81b65c), hyperP2: ram.u16(0x81b65e),
    earn: ram.u16(0x81b64a),
  });
  let prevSlide = null;
  for (let i = 0; i < STEPS; i++) {
    const ram = game.ram;
    if (r.ledgerAtStart === null) r.ledgerAtStart = ledger(ram);
    const o = objectOrder(ram);
    if (o.rank !== undefined && o.player !== undefined && o.ledger !== undefined) {
      r.orderSeen++;
      if (!(o.rank < o.player && o.player < o.ledger)) r.orderBad++;
    }
    const s = ram.u16(HUDRAM.slideFlag);
    if (r.slideStart === null) r.slideStart = s;
    if (s !== 0) r.slideFrames++;
    if (prevSlide !== null && prevSlide !== 0 && s === 0 && r.slideClearedAt === null) {
      r.slideClearedAt = game.logicFrame;
      r.bannerTimerAt0 = ram.u16(HUDRAM.bannerTimer);
    }
    prevSlide = s;
    const m = ram.u16(HUDRAM.p1.meter);
    if (m > r.meterMax) r.meterMax = m;
    if (m === 0) r.meterZeroFrames++;
    else if (r.meterFirstNonZero === null) r.meterFirstNonZero = game.logicFrame;
    const tot = ram.u32(HUDRAM.totalP1);
    if (tot !== 0 && r.totalFirstNonZero === null) r.totalFirstNonZero = game.logicFrame;
    const pend = ram.u32(HUDRAM.pendingP1);
    if (pend > r.pendingMax) r.pendingMax = pend;
    r.cursorAValues.add(ram.u32(HUDRAM.cursorValA));
    r.cursorBValues.add(ram.u32(HUDRAM.cursorValB));
    const w = (i % 4 === 0) ? held : none;
    try {
      game.step(w);
    } catch (e) {
      r.stop = e.message.split('\n')[0];
      r.frames = i;
      break;
    }
    if (brk === 'frozen-meter') {
      ram.setU16(HUDRAM.p1.meter, m);
      ram.setU16(HUDRAM.p2.meter, 0);
    }
    // The RANK rows are NEGATIVE claims -- "nothing moved" -- and a negative
    // claim that cannot be made to fail is not a check.  This poke moves ONE
    // rank word by ONE, once, and every one of the five must notice.
    if (brk === 'rank-poke' && i === 100) {
      ram.setU16(0x81309e, ram.u16(0x81309e) + 1);
      ram.setU16(0x81b646, ram.u16(0x81b646) + 1);
      ram.setU16(0x81b65c, ram.u16(0x81b65c) + 1);
      ram.setU16(0x81b65e, ram.u16(0x81b65e) + 1);
    }
    r.frames = i + 1;
  }
  r.ledgerAtEnd = ledger(game.ram);
  r.game = game;
  return r;
}

const r = run();
const g = r.game;
const R = g.ram;
const ev = (k) => g.hudEvents.get(k) ?? 0;
const notes = g.unportedLog.calls;
const noteCount = (addr) => {
  let n = 0;
  const p = `$${addr.toString(16).toUpperCase()} `;
  for (const [k, v] of notes) if (k.startsWith(p)) n += v;
  return n;
};

console.log(`W63 HUD SCENARIO -- ${STEPS} steps from the shipped bundle's own seed, `
  + `fire TAPPED every 4th frame${brk ? `   [--break ${brk}]` : ''}`);
console.log(`  frames ${r.frames}   stop: ${r.stop ?? '(ran to the end)'}`);
console.log(`  object order rank<player<ledger : ${r.orderSeen - r.orderBad}/`
  + `${r.orderSeen} frames OK, ${r.orderBad} BAD`);
console.log(`  $81B6EE  ${r.slideStart} at the seed (lf ${r.seedLf}), cleared at `
  + `lf ${r.slideClearedAt}, non-zero on ${r.slideFrames} frames`);
console.log(`  chain meter P1: max ${r.meterMax}, cap $81B5B2 ${R.u16(0x81b5b2)}, `
  + `zero on ${r.meterZeroFrames} of ${r.frames} frames`);
console.log(`  $284636/$2847D4 decrements: ${ev('meter-/p1')} (P1) `
  + `${ev('meter-/p2')} (P2);  reached ZERO ${ev('meter0/p1')} times`);
console.log(`  $2842B0: pending max 0x${r.pendingMax.toString(16)}, `
  + `pending now 0x${R.u32(HUDRAM.pendingP1).toString(16)}, `
  + `total 0x${R.u32(HUDRAM.totalP1).toString(16)}, `
  + `hi 0x${R.u32(HUDRAM.hiScore).toString(16)}, `
  + `first non-zero total at lf ${r.totalFirstNonZero}`);
console.log(`  cursors: $81B5A4 took ${r.cursorAValues.size} distinct values, `
  + `$81B59C ${r.cursorBValues.size}`);
console.log(`  extends ($284350 addq.w #$1): ${ev('extend/p1')}   lives now `
  + `${R.u16(HUDRAM.aliveP1)}`);
console.log(`  RANK at the start: ${JSON.stringify(r.ledgerAtStart)}`);
console.log(`  RANK at the end  : ${JSON.stringify(r.ledgerAtEnd)}`);
console.log(`  DRAW notes: $240DC2 x${noteCount(0x240dc2)}  `
  + `$23FA96 x${noteCount(0x23fa96)}  $23FAC4 x${noteCount(0x23fac4)}  `
  + `$285C5E x${noteCount(0x285c5e)}  $286040 x${noteCount(0x286040)}  `
  + `$2859DC x${noteCount(0x2859dc)}`);
console.log(`  dispatch miss $240F62[0]: x${noteCount(0x240f62)}`);
console.log('');

let fail = 0;
function ck(cond, what, got) {
  if (cond) console.log(`  ok   ${what}${got !== undefined ? ` (got ${got})` : ''}`);
  else { console.log(`  FAIL ${what}  -- got ${got}`); fail++; }
}

// ---- 1. THE OBJECT IS DISPATCHED AT ALL.
ck(noteCount(0x240f62) === 0,
  'object type 0 is DISPATCHED -- `$240F62 + 0` is no longer a counted miss on '
  + 'every frame', noteCount(0x240f62));

// ---- 2. THE FRAME ORDER.  recon 38 7.1 item 1, settled by measurement.
ck(r.orderSeen === r.frames && r.orderBad === 0,
  'THE RANK OBJECT ($240F62[10], pri $1F) runs BEFORE THE PLAYER (pri $1C) and '
  + 'the player BEFORE THIS ONE (pri $09), on EVERY frame -- so the bomb\'s '
  + '$249976 debit lands after the frame\'s rank recompute, exactly like the '
  + 'hyper\'s gain', `${r.orderSeen - r.orderBad}/${r.frames} ok, ${r.orderBad} bad`);

// ---- 3. THE SLIDE-IN.  $81B620 = $30 in the seed, one decrement per frame,
//         then one settling frame -- 49 in all.
ck(r.slideStart === 1,
  '$81B6EE is 1 IN THE SHIPPED SEED, so the port\'s first frame of $28444E '
  + 'takes $284CF2 and NOT the skeleton -- which recon 38 2.1 did not say',
  r.slideStart);
ck(r.slideClearedAt === r.seedLf + 49,
  `$284F6A clr.w $81B6EE fires at seed+49 (lf ${r.seedLf + 49}): $81B620 is $30 `
  + 'in the seed, $284D38 spends one per frame, and $284E7A is the 49th',
  r.slideClearedAt);
ck(r.slideFrames === 49,
  '...and $81B6EE is non-zero on exactly 49 frames', r.slideFrames);
ck(r.bannerTimerAt0 === 0,
  '$81B620 is ZERO on the frame $81B6EE clears -- the countdown is what ends '
  + 'the slide-in, not a separate timer', r.bannerTimerAt0);

// ---- 4. **THE CHAIN EXPIRES.**  The headline.
ck(ev('meter-/p1') > 3000,
  'THE CHAIN METER DECREMENTS -- $284636 subq.w #$1,$81B5C0 runs on (almost) '
  + 'every frame the meter is non-zero, which it has NEVER done in this port',
  ev('meter-/p1'));
ck(ev('meter0/p1') > 20,
  '...and it REACHES ZERO, repeatedly: $284640/$284646 wipe $81B5B8 and '
  + '$81B5CE and the chain BREAKS. `src/score.js`\'s "a chain the port starts '
  + 'never expires" is retired', ev('meter0/p1'));
ck(r.meterZeroFrames > 1500,
  '...and the meter spends a large part of the run AT zero, instead of being '
  + 'pinned at the cap for ever', r.meterZeroFrames);
ck(r.meterMax === R.u16(0x81b5b2) && r.meterMax === 56,
  'the meter still reaches its own cap $81B5B2 = 56 ($28616C, $287DF0[loop]) '
  + '-- the decrement did not break the refill', r.meterMax);
// THE ASYMMETRY, not "P2 is zero" on its own: a bare `=== 0` is green when
// NOTHING runs, which is exactly what `--break no-hud` proves.
ck(ev('meter-/p2') === 0 && ev('meter-/p1') > 3000,
  'P1\'s decrement $284636 runs and P2\'s $2847D4 runs ZERO times -- $8130C0 is '
  + '$FFFF in the seed and $28465C bmi skips the whole P2 block. Transcribed, '
  + 'unexercised, counted', `P1 ${ev('meter-/p1')}, P2 ${ev('meter-/p2')}`);

// ---- 5. **THE SCORE DRAINS.**
ck(R.u32(HUDRAM.pendingP1) === 0,
  'THE PENDING SCORE IS ZERO at the end -- $28436E move.l D6,(A1)+ empties '
  + '$81B4C0 every frame it drains it. Before this wave it only ever grew',
  `0x${R.u32(HUDRAM.pendingP1).toString(16)}`);
ck(R.u32(HUDRAM.totalP1) !== 0,
  '...and the TOTAL $81B440 is non-zero: the four `abcd -(A1),-(A0)` at '
  + '$28431E moved it there', `0x${R.u32(HUDRAM.totalP1).toString(16)}`);
ck(R.u32(HUDRAM.hiScore) === R.u32(HUDRAM.totalP1) && R.u32(HUDRAM.totalP1) !== 0,
  '$28439A move.l D4,$81B448 -- the HIGH SCORE follows a NON-ZERO total, '
  + 'because the seed\'s own high score is 0 and P1 passes it on the first '
  + 'drain. The `!== 0` is not decoration: `0 === 0` is what a run with no '
  + 'drain at all reports', `hi 0x${R.u32(HUDRAM.hiScore).toString(16)} `
  + `total 0x${R.u32(HUDRAM.totalP1).toString(16)}`);
ck(R.u16(HUDRAM.ovfP1) === 0 && R.u32(HUDRAM.totalP1) !== 0,
  '$81B44C, the overflow digit, is still 0 WHILE THE TOTAL IS NOT -- the '
  + 'four-byte BCD total has not carried out in this window, so $284328 addq.w '
  + '#$1,(A6) never ran and $284330\'s $99999999 pin was never armed',
  `ovf ${R.u16(HUDRAM.ovfP1)}, total 0x${R.u32(HUDRAM.totalP1).toString(16)}`);
// THE DIGIT MACHINE, read back as CHARACTERS.  Nine records of stride $A at
// $81B4C8: record 0 is the OVERFLOW digit and 1..8 the longword's eight BCD
// digits, each `$C030 + digit` ($284438 addi.w #$C030,D2).  Leading zeros are
// SUPPRESSED -- D7's low word is the "a non-zero digit has been seen" flag --
// so the blank records are the proof the `$28440C bne` arm ran, not a hole.
const digits = [];
for (let k = 0; k < 9; k++) {
  const a = 0x81b4c8 + k * 0x0a;
  digits.push(R.u16(a) === 0 ? '_' : String((R.u16(a + 6) - 0xc030) & 0xf));
}
// Record 0 is the overflow digit (blank while $81B44C is 0); records 1..8 are
// the eight nibbles of the packed-BCD longword with the leading zeros BLANK.
const want = '_' + R.u32(HUDRAM.totalP1).toString(16).padStart(8, '0')
  .replace(/^0+/, (z) => '_'.repeat(z.length));
ck(digits.join('') === want,
  'THE DIGIT MACHINE ran and its NINE records spell the packed-BCD total, with '
  + 'the leading zeros BLANK -- $2843A8\'s tail-entered loop wrote records 1..8 '
  + `and never touched record 0 (the overflow digit, which did not change)`,
  `"${digits.join('')}" vs "${want}"`);
ck(ev('extend/p1') === 0 && R.u16(HUDRAM.aliveP1) === 2
  && R.u32(HUDRAM.totalP1) !== 0 && R.u32(HUDRAM.totalP1) < 0x02000000,
  'NO EXTEND, and the SCORE SAYS WHY: $81B4AC is $02000000 in the seed (DIP 0 '
  + '= 2,000,000) and the total ends BELOW it, so $28433E\'s compare fails, '
  + '$284350 addq.w #$1,(A3) never fires and the lives word is untouched. '
  + 'Without the score bound this reads green on a run that scored nothing',
  `${ev('extend/p1')} extends, lives ${R.u16(HUDRAM.aliveP1)}, total `
  + `0x${R.u32(HUDRAM.totalP1).toString(16)} vs threshold `
  + `0x${R.u32(HUDRAM.extendNextP1).toString(16)}`);

// ---- 6. THE TWO CURSORS.
ck(r.cursorAValues.size === 64,
  '$285F8A walks ALL SIXTY-FOUR of $287ECA\'s longwords -- `moveq #$3F,D0 / '
  + 'and.w $80390A,D0` doubled twice is the whole index space',
  r.cursorAValues.size);
ck(r.cursorBValues.size === 15,
  '$285F52 walks ALL FIFTEEN of $287E8E\'s -- the `subq.w #$4` / wrap-to-$38 '
  + 'pair, which is what pins that table\'s extent', r.cursorBValues.size);

// ---- 7. THE TALLY'S GUARD.
ck((R.u8(HUDRAM.flags9) & 0x08) === 0 && noteCount(0x285c5e) > 0,
  '$8130F9 bit 3 is CLEAR, so $2853D2\'s `beq.b $2853D0` (a BARE rts two bytes '
  + 'before the entry) is taken and THE STAGE-CLEAR TALLY cannot run. Its one '
  + 'producer is $28DB52, inside the unported result screen $28D9AA',
  `$${R.u8(HUDRAM.flags9).toString(16)}`);

// ---- 8. RANK -- to I2's standard.
for (const k of ['rank', 'rankPow', 'hyperP1', 'hyperP2']) {
  ck(r.ledgerAtStart[k] === r.ledgerAtEnd[k],
    `RANK: ${k} is digit-identical across the run`,
    `${r.ledgerAtStart[k]} -> ${r.ledgerAtEnd[k]}`);
}
ck(r.ledgerAtEnd.rank === 53 && r.ledgerAtEnd.rankPow === 0,
  'RANK: $81309E is still its seeded 53 and $81B646 still 0. $2608D2 and '
  + '$260794 -- object type 10\'s rank recompute -- are ABSENT from src/, so '
  + 'rank cannot move in this port whatever this wave did',
  `${r.ledgerAtEnd.rank} / ${r.ledgerAtEnd.rankPow}`);

// ---- 9. THE DRAWS ARE COUNTED, NOT SILENT.
ck(noteCount(0x240dc2) > 0 && noteCount(0x285c5e) > 0,
  'EVERY DRAW IS COUNTED: the TX printer $240DC2 and P1\'s HUD panel $285C5E '
  + 'are named in unportedLog on the frames they would have drawn -- the HUD\'s '
  + 'STATE is this port\'s and its PICTURE is not',
  `$240DC2 x${noteCount(0x240dc2)}, $285C5E x${noteCount(0x285c5e)}`);
ck(noteCount(0x285c5e) === r.frames - 49,
  '...and $285C5E is noted on every frame past the slide-in, i.e. exactly once '
  + 'per $2844C8', noteCount(0x285c5e));

console.log('');
console.log(fail === 0 ? 'W63 HUD: ok' : `W63 HUD: ${fail} FAILED`);
process.exit(fail === 0 ? 0 : 1);
