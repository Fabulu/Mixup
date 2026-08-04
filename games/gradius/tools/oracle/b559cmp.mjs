// b559cmp.mjs -- the port's `$B559` against the cartridge, frame by frame.
//
// WAVE 32a. Reads `out/b559poke/steps.json` (written by `b559poke.py`, which
// forces `$19 = 4` across ONE 512-px crossing so the cartridge loads stage 5's
// chunk 1 and spawns its own type-`$1D` drifters), and for every frame of every
// drifter's life:
//
//   * builds a port state holding ONLY that slot, from the BOARD's own bytes at
//     frame i-1 -- type, status, anim, timer, animFrame, x, y, xf, $048C, $04AC;
//   * runs one `updateEnemies` (so `$ADE5`'s status animator and the `$AE1C`
//     dispatch both run, in the cartridge's order);
//   * compares all ten fields against the BOARD's bytes at frame i.
//
// This is a SINGLE-STEP differential, so a divergence is a divergence in that
// one frame and not the consequence of an earlier one -- `docs/knowledge/10`
// point 3's reason for preferring many short comparisons to one long one.
//
// PROVENANCE: an INTERVENTION run (`docs/knowledge/09`). Valid evidence that our
// transcription of `$B559` is right; NOT evidence about stage 5's pacing, spawn
// density or appearance. The terrain under these drifters is stage 1's.
//
//   node games/gradius/tools/oracle/b559cmp.mjs
//
// The mutation table that shows this comparison CAN go red is in
// docs/worklog/gradius/32a-impl-b559.md.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { createState, ENEMY_BASE } from '../../src/state.js';
import { updateEnemies } from '../../src/enemies.js';
import { headlessResources } from '../../tests/helpers.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEPS = path.join(HERE, 'out', 'b559poke', 'steps.json');

// board field name -> the port's state.obj array name.
const MAP = {
  anim: 'anim', timer: 'timer', animFrame: 'animFrame', status: 'status',
  type: 'type', y: 'y', x: 'x', xf: 'xf', accel: 's0480', hit: 's04A0',
};

function main() {
  const res = headlessResources(0);
  const steps = JSON.parse(readFileSync(STEPS, 'utf8'));

  let compared = 0, spawnFrames = 0, reuse = 0, mismatches = 0;
  let initOK = 0, initBad = 0, threwCount = 0;
  const perField = {};
  const branches = { init: 0, body: 0, freed: 0, animStep: 0, wrap: 0 };
  const seenAnim = new Set();
  const firstBad = [];

  for (const s of steps) {
    const b = s.before;
    // A frame whose BEFORE has no drifter is a SPAWN frame: the wave engine
    // created the object during $A2C0 (which runs at $9A64, BEFORE $ADAB), so
    // the sampled `after` already carries $B559's INIT ARM -- `$B55C BPL $B502`
    // -> `$B0B4` (type |= $80) / `$B505` ($048C := $80) / `$B50A` ($04AC := $14).
    // This harness does not replay the spawn engine, but it CAN replay the init
    // arm alone and put its three outputs next to the board's.
    if (b.type !== 0x1D && b.type !== 0x9D) {
      spawnFrames += 1;
      const a = s.after;
      // RUN THE PORT'S OWN INIT and compare it to the board -- do NOT compare
      // the board against literals written here. The first version of this
      // check did exactly that ($9D/$80/$14 hard-coded), and mutating
      // `loc_B502`'s $048C and $04AC constants then left the cartridge
      // comparison GREEN: the check agreed with itself through the constants it
      // was testing, which is `docs/knowledge/03`'s named failure mode.
      const ist = createState();
      ist.substate = 0x80; ist.zp19 = 0;
      const k = s.slot + ENEMY_BASE;
      ist.obj.type[k] = 0x1D;                 // uninitialised: $B55C BPL taken
      ist.obj.x[k] = a.x; ist.obj.y[k] = a.y;
      let threw = null;
      try { updateEnemies(ist, res); } catch (e) { threw = e.message; }
      const got = threw ? null
        : [ist.obj.type[k], ist.obj.s0480[k], ist.obj.s04A0[k]];
      const want = [a.type, a.accel, a.hit];
      branches.init += 1;
      if (got && got.every((v, n) => v === want[n])) initOK += 1;
      else {
        initBad += 1;
        if (firstBad.length < 8) {
          firstBad.push(`f${s.frame} slot ${s.slot} SPAWN/loc_B502: port `
            + (threw ? `THREW ${threw.slice(0, 60)}`
              : got.map((v) => '$' + v.toString(16)).join('/'))
            + `, board ${want.map((v) => '$' + v.toString(16)).join('/')}`);
        }
      }
      continue;
    }
    // $B559 can leave the type as $1D, $9D or (via $AEF8) $00 and NOTHING ELSE.
    // Any other value means $A2C0 re-allocated the slot to a new enemy in the
    // same frame -- the sampled `after` is a different object, so there is
    // nothing here to compare. Ruled out by the listing, not by the frame
    // number: $B559 reads $030C and never writes it; loc_B502's $B0B4 ORs $80;
    // $AEF8 zeroes it.
    if (![0x00, 0x1D, 0x9D].includes(s.after.type)) { reuse += 1; continue; }

    const st = createState();
    st.substate = 0x80;
    st.zp19 = 0;                       // the poke is closed by now, as on the board
    const i = s.slot + ENEMY_BASE;
    for (const [bf, pf] of Object.entries(MAP)) st.obj[pf][i] = b[bf];

    // An unported path throws by ROM address; that is a MISMATCH, not a crash.
    try {
      updateEnemies(st, res);
    } catch (e) {
      threwCount += 1;
      if (firstBad.length < 8) {
        firstBad.push(`f${s.frame} slot ${s.slot} PORT THREW: `
          + e.message.slice(0, 90));
      }
      continue;
    }

    branches.body += 1;
    if (s.after.type === 0) branches.freed += 1;
    if (s.after.anim !== b.anim) {
      branches.animStep += 1;
      seenAnim.add(s.after.anim);
      if (s.after.anim === 0x52) branches.wrap += 1;
    }

    compared += 1;
    for (const [bf, pf] of Object.entries(MAP)) {
      const got = st.obj[pf][i], want = s.after[bf];
      if (got !== want) {
        perField[bf] = (perField[bf] || 0) + 1;
        mismatches += 1;
        if (firstBad.length < 8) {
          firstBad.push(`f${s.frame} slot ${s.slot} ${bf}: port $${got
            .toString(16)} board $${want.toString(16)}`);
        }
      }
    }
  }

  console.log(`drifter frames in the dump : ${steps.length}`);
  console.log(`  spawn frames             : ${spawnFrames}`
    + ` (loc_B502 init agrees on ${initOK}, disagrees on ${initBad})`);
  console.log(`  slot re-used same frame  : ${reuse} (nothing to compare)`);
  console.log(`handler frames compared    : ${compared}`);
  console.log(`  port THREW on              : ${threwCount} (an unported path is a mismatch)`);
  console.log(`field mismatches           : ${mismatches + initBad + threwCount}`);
  for (const l of firstBad) console.log('  ' + l);
  console.log('');
  console.log('BRANCHES OF $B559 EXERCISED AGAINST THE BOARD');
  console.log(`  $B55C init arm  ($1D, -> loc_B502) : ${branches.init}`);
  console.log(`  $B55E body arm  ($9D)              : ${branches.body}`);
  console.log(`  $B566 box FREED the slot           : ${branches.freed}`);
  console.log(`  $B628 stepped the frame            : ${branches.animStep}`);
  console.log(`  $B639 wrapped to the base ($52)    : ${branches.wrap}`);
  console.log(`  metasprites seen                   : `
    + [...seenAnim].sort((a, c) => a - c)
      .map((v) => '$' + v.toString(16).toUpperCase()).join(' '));
  return (mismatches + initBad + threwCount) === 0 ? 0 : 1;
}

process.exit(main());
