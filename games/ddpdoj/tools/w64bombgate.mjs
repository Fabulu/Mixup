#!/usr/bin/env node
// W64 (B2) -- **THE SCENARIO IN WHICH A BOMB IS DROPPED.**
//
//     node games/ddpdoj/tools/w64bombgate.mjs [--assets DIR] [--break NAME]
//
// ============================================================================
// WHY THIS FILE EXISTS
// ============================================================================
// `39-OWNER-visible-play-before-sound.md`'s test of done is "load the page,
// fly, shoot, laser, BOMB, and kill a visible enemy".  Every gate this project
// owns proves fidelity in a harness; none of them had ever pressed Button 2,
// because `src/player.js` threw on it from wave 4 to wave 63.
//
// This gate drives the SHIPPED BUNDLE from its own seed, presses Button 2
// three times, and asserts as exact counts and exact frames that:
//
//   * the press is not refused -- `$2498E2`'s three vetoes are all clear;
//   * **THE STOCK DECREMENTS**, 3 -> 2 -> 1 -> 0, and the FOURTH press is
//     refused by `$2498E6` with the shot cadence machine still running;
//   * the `$811F72` RECORD goes live and NEGATIVE on the press frame;
//   * type-5 call #7 `$255DD8` drives it through all THREE script phases;
//   * **`$24560A` DAMAGES ENEMIES** -- the ninth block of `$244D62`, which
//     `src/damage.js` threw on until this wave;
//   * `$2564F0` TEARS IT DOWN: all 45 records are 0 again, both players'
//     `($1,A6)` bit 6 is clear, and **THE CHAIN IS RESET** when `$81B5AE` was
//     latched;
//   * `$2564BA` clears the invulnerability 40 frames later;
//   * **NO RANK WRITE MOVED** -- `$81309E`, `$81B646`, `$81B648`, `$81B65C`,
//     `$81B65E`, on every frame, against a control that PROVES the rows can
//     move.
//
// **IT IS PORT-VS-LISTING, NOT A BOARD COMPARISON.**  No MAME run in this repo
// has ever pressed Button 2 and no gate here compares a bomb against the
// board.  What is proved is that the port runs the cartridge's own
// instructions in the cartridge's own slots.
//
// FOUR CONTROLS, because one control cannot separate four claims.
// [M] on this tree: 0 / 11 / 12 / 5 / 9 failures.
//
// --break no-driver     type-5 call #7 is COUNTED and not run -- HEAD, from
//                       wave 8 to wave 63.  **11 RED.**  The record is
//                       allocated and NEVER FREED: 1 of 45 slots dirty at the
//                       end, `($1,A6)` bit 6 set on all 2,500 frames, zero
//                       teardowns, zero phases, zero cooldown expiries -- and
//                       `$24560A` keeps damaging for ever.  The two rows that
//                       STAY green are the ones about the ALLOCATION
//                       (`$811F72` live, `$24560A` hits), which is exactly the
//                       half the driver is not.
// --break no-press      Button 2 is never pressed.  **12 RED**, and the run
//                       does not stop at all -- which is the other half of the
//                       `$249F8A` row: with no bomb the ship stays `$FF`
//                       invulnerable and the hit path cannot be reached.
// --break rank-poke     one `+1` into each of the five rank words at step
//                       1,000 (AFTER the four presses -- see the code).
//                       **ALL FIVE RANK ROWS RED and nothing else.**  A
//                       "nothing moved" row that cannot be made to move is not
//                       a check (W63 §8, and this project has shipped that
//                       mistake).
// --break frozen-stock  `($24,A6)` is restored to 3 after every step.  **9
//                       RED**: FOUR bombs fire instead of three and the
//                       zero-stock refusal never happens.  The POOL-DRAIN and
//                       BIT-6 rows stay green, which says the teardown is not
//                       the same claim as the stock.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game, defaultHandlers } from '../src/main.js';
import { loadBundle } from '../src/web/assets.js';
import { portWordFromBits } from '../src/input.js';
import { BIT } from '../src/machine.js';
import { BOMBRAM } from '../src/bomb.js';
import { TYPE5, TYPE5_PORTED } from '../src/type5.js';
import { SHIP_MUTATE } from '../src/shipsprite.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const ASSETS = path.resolve(arg('assets', path.join(HERE, '..', 'assets')));
const BREAKS = ['no-driver', 'no-press', 'rank-poke', 'frozen-stock'];
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

const STEPS = 2600;
// The four presses.  The first three spend the seed's three bombs; the FOURTH
// is the point of the exercise -- `$2498E6 beq $249B2C` with the stock at 0.
const PRESS = [100, 300, 500, 700];
const bundle = await loadBundle(async (n) =>
  new Uint8Array(fs.readFileSync(path.join(ASSETS, n))));

const RANK = [
  [0x81309e, '$81309E rank'], [0x81b646, '$81B646 power P1'],
  [0x81b648, '$81B648 power P2'], [0x81b65c, '$81B65C stock P1'],
  [0x81b65e, '$81B65E stock P2'],
];

function run() {
  const game = new Game(bundle.seed, bundle.tables, {
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  // HEAD's type-5 behaviour: the bomb's DRIVER is counted and not run, which
  // is what it was from wave 8 to wave 63.  Nothing else changes, so every red
  // is about `$255DD8` and not about the harness.
  SHIP_MUTATE.value = brk === 'no-driver' ? 'no-bomb-driver' : null;
  void defaultHandlers; void TYPE5_PORTED; void TYPE5;
  const held = portWordFromBits([BIT.b1]);
  const bomb = portWordFromBits([BIT.b1, BIT.b2]);
  const none = portWordFromBits([]);
  const r = {
    frames: 0, stop: null, stopFrame: null, stopAddr: null,
    stockSeen: [], recLiveFrames: 0, recFirstLive: null,
    bit6Frames: 0, invulnClearedAt: null, invulnFF: 0,
    rankMoved: [], rankStart: null, rankEnd: null,
    poolDirtyAtEnd: 0, chainLatchAtTeardown: [],
    meterBeforeTeardown: [], meterAfterTeardown: [],
    shotsAfterRefusal: 0, cadenceAfterRefusal: 0,
  };
  const snap = () => RANK.map(([a]) => game.ram.u16(a));
  r.rankStart = snap();
  let prevInv = null;
  let stock0 = null;
  for (let i = 0; i < STEPS; i++) {
    const ram = game.ram;
    let w = (i % 4 === 0) ? held : none;
    if (PRESS.includes(i) && brk !== 'no-press') w = bomb;
    if (PRESS.includes(i)) r.stockSeen.push(ram.u8(BOMBRAM.rec === 0 ? 0x81040a : 0x81040a));
    if (i === PRESS[3]) stock0 = ram.u8(0x81040a);
    const teardownBefore = game.bombMarks.filter((m) => m[0] === 'teardown').length;
    const meterPre = ram.u16(0x81b5c0);
    try {
      game.step(w);
    } catch (e) {
      r.stop = e.message.split('\n')[0].slice(0, 200);
      r.stopAddr = e.romAddress ?? null;
      r.stopFrame = game.logicFrame;
      r.frames = i;
      break;
    }
    if (game.bombMarks.filter((m) => m[0] === 'teardown').length > teardownBefore) {
      r.chainLatchAtTeardown.push(ram.u16(0x81b5ae));
      r.meterBeforeTeardown.push(meterPre);
      r.meterAfterTeardown.push(ram.u16(0x81b5c0));
    }
    const rec = ram.u16(BOMBRAM.rec);
    if ((rec & 0x8000) !== 0) {
      r.recLiveFrames++;
      if (r.recFirstLive === null) r.recFirstLive = game.logicFrame;
    }
    if (ram.btst8(0x8103e6 + 1, 6)) r.bit6Frames++;
    const inv = ram.u8(0x8103e6 + 0x3e);
    if (inv === 0xff) r.invulnFF++;
    if (prevInv === 0xff && inv === 0 && r.invulnClearedAt === null) {
      r.invulnClearedAt = game.logicFrame;
    }
    prevInv = inv;
    const now = snap();
    for (let k = 0; k < RANK.length; k++) {
      if (now[k] !== r.rankStart[k] && !r.rankMoved.some((m) => m[0] === k)) {
        r.rankMoved.push([k, game.logicFrame, r.rankStart[k], now[k]]);
      }
    }
    if (brk === 'frozen-stock') ram.setU8(0x81040a, 3);
    // The poke lands AFTER the last press on purpose.  `$81B65C` is the
    // FORK (`$249864 move.w (A1),D1 / beq $2498E2`), so a +1 into it before a
    // press turns the bomb into the hyper and the run stops at `$249868` --
    // which is a real demonstration that the fork is live, and a useless
    // control.  At step 1000 all four presses are behind us.
    if (brk === 'rank-poke' && i === 1000) {
      for (const [a] of RANK) ram.setU16(a, ram.u16(a) + 1);
    }
    r.frames = i + 1;
  }
  r.rankEnd = snap();
  r.stock0 = stock0;
  for (let k = 0; k < BOMBRAM.slots; k++) {
    if (game.ram.u16(BOMBRAM.rec + k * BOMBRAM.stride) !== 0) r.poolDirtyAtEnd++;
  }
  r.game = game;
  SHIP_MUTATE.value = null;
  return r;
}

// `rank-poke` moves the five words at step 1000 and the run's own baseline is
// the SEED, so all five rows must see the move.  A "nothing moved" row that
// cannot be made to move is not a check.
const r = run();
const g = r.game;
const R = g.ram;
const ev = (k) => g.bombEvents.get(k) ?? 0;
const marks = (k) => g.bombMarks.filter((m) => m[0] === k);

console.log(`W64 BOMB SCENARIO -- ${STEPS} steps from the shipped bundle's own `
  + `seed, fire tapped every 4th frame, Button 2 at steps `
  + `${PRESS.join('/')}${brk ? `   [--break ${brk}]` : ''}`);
console.log(`  frames ${r.frames}   stop: ${r.stop ?? '(ran to the end)'}`
  + `${r.stopFrame ? ` @lf${r.stopFrame}` : ''}`);
console.log(`  $2498E2 presses: ${JSON.stringify([...g.bombEvents]
  .filter(([k]) => k.startsWith('press:')))}`);
console.log(`  ($24,A6) $81040A stock now ${R.u8(0x81040a)}; at the FOURTH `
  + `press it was ${r.stock0}`);
console.log(`  $811F72 record: first live lf ${r.recFirstLive}, live on `
  + `${r.recLiveFrames} frames, now $${R.u16(0x811f72).toString(16)}`);
console.log(`  $255E3E phases: ->1 x${ev('phase:1')}  ->2 x${ev('phase:2')}`);
console.log(`  $24560A: ${g.bombHits} slot-hits over `
  + `${[...g.bombEvents].filter(([k]) => k.startsWith('damage:'))
    .reduce((a, [, v]) => a + v, 0)} frames`);
console.log(`  $2564F0 teardowns: ${marks('teardown').length} at lf `
  + `${marks('teardown').map((m) => m[1]).join(',')}; $81B5AE at each `
  + `${JSON.stringify(r.chainLatchAtTeardown)}; meter `
  + `${JSON.stringify(r.meterBeforeTeardown)} -> `
  + `${JSON.stringify(r.meterAfterTeardown)}`);
console.log(`  $2564BA: ${marks('cooldown-expired').length} expiries; `
  + `($3e,A6) was $FF on ${r.invulnFF} frames, first cleared at lf `
  + `${r.invulnClearedAt}`);
console.log(`  ($1,A6) bit 6 set on ${r.bit6Frames} frames; 45-record pool `
  + `dirty slots at the end: ${r.poolDirtyAtEnd}`);
console.log(`  RANK start ${JSON.stringify(r.rankStart)}  end `
  + `${JSON.stringify(r.rankEnd)}  moved ${JSON.stringify(r.rankMoved)}`);

const rows = [];
const ck = (name, ok, detail) => { rows.push([name, ok, detail]); };

// **THE ROW THAT SAYS WHAT THIS WAVE BROKE.**  `$2564BA clr.b ($3e,A0)` is the
// only instruction in this port that has ever cleared the seed's `($3e,A6) =
// $FF`, so a bomb makes the ship MORTAL and the first hit after that reaches
// `$249F8A` -- the 212-instruction hit/death path, unported since wave 4 and
// rank-critical (`$24A00C lsr.w #$2,$81B646`).  The gate does NOT narrow
// around it: it runs the full ${STEPS} steps and asserts that if the run stops
// at all it stops THERE, by romAddress.  `--break no-press` is the other half
// of the claim -- with no bomb the same run does not stop at all.
ck('the ONLY stop is $249F8A, the hit path a BOMB makes reachable',
  r.stop === null || r.stopAddr === 0x249f8a,
  `${r.stopAddr === null ? '(no romAddress) ' : `$${(r.stopAddr ?? 0)
    .toString(16).toUpperCase()} `}${r.stop ?? ''}`);
ck('...and the three bombs all COMPLETE before it',
  marks('teardown').length === 3,
  `${marks('teardown').length} teardowns before lf ${r.stopFrame ?? 'end'}`);
ck('BUTTON 2 FIRES A BOMB: three presses accepted',
  ev('press:fired') + ev('press:fired+partner') === 3,
  `fired ${ev('press:fired')} + ${ev('press:fired+partner')}`);
ck('THE STOCK DECREMENTS: $81040A is 0 by the fourth press',
  r.stock0 === 0, `stock at press 4 = ${r.stock0}`);
ck('ZERO STOCK REFUSES: $2498E6 drops the fourth press',
  ev('press:no-stock') === 1, `no-stock x${ev('press:no-stock')}`);
ck('THE RECORD GOES LIVE: $811F72 negative for 3 bombs',
  r.recLiveFrames > 250 && r.recFirstLive !== null,
  `${r.recLiveFrames} frames live, first lf ${r.recFirstLive}`);
ck('$255DD8 WALKS ALL THREE PHASES, three times',
  ev('phase:1') === 3 && ev('phase:2') === 3,
  `->1 x${ev('phase:1')}, ->2 x${ev('phase:2')}`);
ck('$24560A DAMAGES ENEMIES (it was a throw until this wave)',
  g.bombHits > 0, `${g.bombHits} slot-hits`);
ck('$2564F0 TEARS DOWN: three teardowns',
  marks('teardown').length === 3, `${marks('teardown').length}`);
ck('$2564F0 DRAINS THE POOL: 0 of 45 records dirty at the end',
  r.poolDirtyAtEnd === 0, `${r.poolDirtyAtEnd} dirty`);
ck('$2564F0 CLEARS ($1,A6) bit 6, so $24560A stops',
  !R.btst8(0x8103e6 + 1, 6) && r.bit6Frames > 250,
  `bit 6 now ${R.btst8(0x8103e6 + 1, 6)}, set on ${r.bit6Frames} frames`);
ck('THE CHAIN IS RESET: $81B5AE was latched at every teardown',
  r.chainLatchAtTeardown.length === 3
  && r.chainLatchAtTeardown.every((v) => v !== 0),
  JSON.stringify(r.chainLatchAtTeardown));
ck('...and $2877D0 zeroed the meter on the teardown frame',
  r.meterAfterTeardown.length === 3
  && r.meterAfterTeardown.every((v) => v === 0),
  `${JSON.stringify(r.meterBeforeTeardown)} -> `
  + `${JSON.stringify(r.meterAfterTeardown)}`);
ck('$2564BA CLEARS THE INVULNERABILITY 40 frames later',
  marks('cooldown-expired').length === 3 && r.invulnClearedAt !== null,
  `${marks('cooldown-expired').length} expiries, first clear lf `
  + `${r.invulnClearedAt}`);
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
console.log(`W64 BOMB GATE: ${rows.length - bad} passed, ${bad} failed`
  + `${brk ? `   [--break ${brk}]` : ''}`);
process.exit(bad === 0 ? 0 : 1);
