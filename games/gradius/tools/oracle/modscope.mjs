// THE MOD SCOPE GATE. Wave 44.
//
//     node games/gradius/tools/oracle/modscope.mjs
//         [--only id,id]   run just these loadouts
//         [--baseline]     skip the neuters (the baseline run only)
//         [--verbose]      print every boundary of every loadout
//
// ============================ WHY THIS EXISTS ================================
//
// **NOTHING IN THIS REPO COULD SEE THE MOD LAYER AT ALL.** THE ONE RULE (see
// the header of src/mods.js) is that `state.mods` is UNDEFINED on every one of
// the 47 oracle scenarios and on every unit test that is not tests/mods.test.js
// -- that is what makes the cartridge comparison mean something, and it is also
// why no cartridge comparison can ever fail on a defect that lives in
// src/mods.js. W43 is the proof: the `$9751` scenario was promoted at 599/599
// frames with 800/800 tier-1 fields exact INCLUDING THE GAME MODE ACROSS A
// RESTART, and the owner's run was being corrupted by the mod layer on the
// frame after the one it compared. A green that is honest about what it
// measured and silent about what it did not is the failure shape that has cost
// this project the most.
//
// So this is not another cartridge comparison and it must never be read as one.
// It compares:
//
//   * THE PORT WITH A LOADOUT against ITS OWN DECLARED CONTRACT, at the four
//     boundaries where a run begins and ends;
//   * THE PORT WITH A LOADOUT against THE PORT WITH NONE, over the attract
//     demo, where the two must be byte-identical because the demo is not the
//     player's run.
//
// It says NOTHING about whether the port agrees with the cartridge. compare.mjs
// is that gate and this tool does not touch it: every state it builds attaches
// a loadout deliberately, and nothing it does can reach a scenario.
//
// ========================= WHAT A "RUN SCOPE LEAK" IS ========================
//
// Any state a mod captures during one run that survives a game over, a
// continue or a stage change and is then applied to a LATER run. W43 found one
// (`rt.death`, the Heal Gradius Syndrome death position, replayed into the
// first `$9B3E` of the next game after `$970D` CONTINUE). W44 audited the rest
// and found the class has a second half nobody had looked for: state that is
// SPENT BY A RUN THE PLAYER IS NOT FLYING (the attract demo), and state that
// the cartridge's own new-game wipe ERASES so that a mod silently never
// applies. All three shapes are checked here.
//
// The session this tool drives is the one a player actually has:
//
//   mode 0  the title scroll-in
//   mode 1  the menu
//   mode 2  THE ATTRACT DEMO, in full            <- boundary D
//   mode 1  back to the menu, START
//   mode 5  RUN 1's first play frame             <- boundary B1
//           three deaths
//   $97F1   GAME OVER                            <- boundary B2
//   $970D   CONTINUE
//   mode 5  RUN 2's first play frame             <- boundary B3
//
// ======================== SEEN TO FAIL, EVERY RUN ============================
//
// Checks in this repo have sat green through the very bug they were written for
// in four separate ways, so this one proves itself on every run: four NEUTERS
// undo W43's and W44's fixes, one at a time and then two together, in a
// THROWAWAY COPY of src/ under the OS temp dir (the same mechanism
// tools/oracle/stagesweep.mjs uses to lift the $A2F0 guard). The tool FAILS if
// a neuter does not turn it red, AND if it goes red WITHOUT tripping the
// assertion that neuter is supposed to trip -- test-all.mjs's own self-check
// stage was once wrong in exactly that second way. Each patched needle must
// appear exactly once, no neuter may touch assets.js, and src/ is hashed before
// and after every copy.
//
// The fourth neuter exists because the first three could not produce the
// owner's actual symptom: W44's `modNewRun()` clears `rt.death` too, so
// removing only W43's fix leaves the replay unreachable. With both removed the
// tool reports `$3F = 1 / $55 = 2 on the first play frame of a NEW GAME`, which
// is the volcano over black space, in two numbers.

import { readFileSync, cpSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import { headlessResources } from '../../tests/helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = dirname(dirname(HERE));
const SRC_DIR = join(GAME, 'src');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d = null) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const VERBOSE = flag('--verbose');

// ---------------------------------------------------------------------------
//  The loadouts. ALL of them, and the count is asserted against the catalogue
//  so a mod added tomorrow cannot be silently uncovered.
// ---------------------------------------------------------------------------

/**
 * A loadout gets a PICKER SELECTION as well as its ids, because the picker's
 * six bytes are run-scoped state in their own right (they are what
 * `rt.firstIntro` gates) and a mod list alone would never exercise them.
 *
 * `stage: 2` is on every one of them deliberately. The level select is the
 * clearest possible witness for "did this survive the continue": `$8307` wipes
 * `$26,X`, so a run 2 that comes back on stage 1 has lost it.
 */
const PICKER = { stage: 2, shield: 5, options: 2, weapon: 1 };

// ---------------------------------------------------------------------------
//  Hashing a simulation
// ---------------------------------------------------------------------------

/**
 * EVERY FIELD OF THE SIMULATION, walked generically rather than listed.
 *
 * A hand-written field list is how a comparison quietly stops covering the
 * thing that broke -- so this walks the state object itself and skips only what
 * is provably NOT the simulation:
 *
 *   mods      the layer under test; including it would make every comparison
 *             trivially unequal and prove nothing
 *   apuLog    the frame's $4000-$400F writes, drained by the HOST every frame
 *             (src/main.js), not read by any logic
 *   sfx       an object the sound layer uses as a set of pending requests; it
 *             is keyed by request byte and its iteration order is not state
 *
 * Anything else that exists on the state is hashed, including fields added
 * after this tool was written -- which is the point.
 */
const HASH_SKIP = new Set(['mods', 'apuLog', 'sfx', 'lock', 'lagFrames', 'frameDrops']);

function hashInto(h, v, key) {
  if (HASH_SKIP.has(key)) return;
  if (v === null || v === undefined) { h.update('~'); return; }
  if (typeof v === 'number') { h.update(String(v)); h.update(','); return; }
  if (typeof v === 'boolean') { h.update(v ? '1' : '0'); return; }
  if (ArrayBuffer.isView(v)) { h.update(Buffer.from(v.buffer, v.byteOffset, v.byteLength)); return; }
  if (typeof v === 'object') {
    for (const k of Object.keys(v).sort()) { h.update(k); hashInto(h, v[k], k); }
    return;
  }
  h.update(String(v));
}

function simHash(state) {
  const h = createHash('sha256');
  // THE SKIPPED KEYS ARE SKIPPED NAME AND ALL. `state.mods` does not exist at
  // all until attachMods() creates it, so hashing the NAME of a skipped key
  // made every loadout differ from vanilla by the mere presence of the object
  // -- a comparison that goes red for the one reason it must not.
  for (const k of Object.keys(state).sort()) {
    if (HASH_SKIP.has(k)) continue;
    h.update(k);
    hashInto(h, state[k], k);
  }
  return h.digest('hex');
}

// ---------------------------------------------------------------------------
//  Loading the port, from src/ or from a patched copy of it
// ---------------------------------------------------------------------------

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

async function loadEngine(srcDir) {
  const u = (p) => pathToFileURL(join(srcDir, p)).href;
  const [main, nmiMod, state, mods, coll, flow] = await Promise.all([
    import(u('main.js')), import(u('nmi.js')), import(u('state.js')),
    import(u('mods.js')), import(u('collision.js')), import(u('flow.js')),
  ]);
  return {
    resetState: main.resetState,
    nmi: nmiMod.nmi,
    BTN: state.BTN, MODE_STAGE: state.MODE_STAGE,
    resolveLoadout: mods.resolveLoadout, attachMods: mods.attachMods,
    MODS: mods.MODS, PRESETS: mods.PRESETS,
    die: coll.die, respawn: flow.respawn,
    srcDir,
  };
}

/**
 * THE NEUTERS. Each one undoes exactly one of W44's three fixes, by a single
 * string substitution in a single file of a THROWAWAY COPY of src/.
 *
 * The `find` strings are asserted to appear EXACTLY ONCE. If a fix is edited so
 * its needle moves, this tool refuses to run rather than reporting "the neuter
 * did not go red", which would read as "the check is broken" when it means
 * "the check no longer knows what it is breaking".
 */
const E_ABANDON = { file: 'flow.js',
  find: 'if (state.mods) modAbandonRun(state);',
  with: 'if (false && state.mods) modAbandonRun(state);' };
const E_NEWRUN = { file: 'modes.js',
  find: 'if (state.mods) modNewRun(state);',
  with: 'if (false && state.mods) modNewRun(state);' };

const NEUTERS = {
  'no-abandon': {
    edits: [E_ABANDON],
    undoes: 'W43: $97F1 drops the captured death position',
    wants: 'rt.death survived',
  },
  'no-newrun': {
    edits: [E_NEWRUN],
    undoes: 'W44: $82D5 re-seeds the level, the loop and the starting kit',
    wants: 'B1 run 1: $19',
  },
  'mods-outside-play': {
    edits: [{ file: 'mods.js',
      find: 'return state.mode !== PLAY_MODE || state.zp09 !== 0;',
      with: 'return false;' }],
    undoes: 'W44: the mod simulation runs only in mode 5 with $09 == 0',
    wants: 'attract demo\'s simulation diverged',
  },
  // BOTH AT ONCE, AND IT IS NOT PADDING. W44's `modNewRun()` ALSO clears
  // `rt.death` at `$82D5`, so with only `no-abandon` applied the stale position
  // is still dropped on the way into the continue and the B3 camera assertion
  // -- the one shaped like what the owner actually saw -- never fires. MEASURED
  // (a labelled injection: `rt.death = {camHi: 1}` on the game-over screen came
  // back as `$3F = 0` on run 2's first play frame). Defence in depth is good and
  // a check that cannot fail is not, so this removes both and the assertion is
  // seen to fail.
  'stale-death-replayed': {
    edits: [E_ABANDON, E_NEWRUN],
    undoes: 'W43 + W44 together: nothing drops the death position, so the next '
          + 'game\'s $9B3E replays it (the owner\'s volcano)',
    wants: 'on the first play frame of a NEW GAME',
  },
};

function shadowWithNeuter(name) {
  const n = NEUTERS[name];
  for (const e of n.edits) {
    if (e.file === 'assets.js') throw new Error('modscope: a neuter may not patch assets.js');
  }
  const before = n.edits.map((e) => sha(join(SRC_DIR, e.file)));
  const dir = mkdtempSync(join(tmpdir(), 'gradius-modscope-'));
  if (resolve(dir).startsWith(resolve(GAME))) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`modscope: refusing to patch a copy inside the repo (${dir}).`);
  }
  const srcDir = join(dir, 'src');
  cpSync(SRC_DIR, srcDir, { recursive: true });
  for (const f of ['game.json', 'index.html']) {
    if (existsSync(join(GAME, f))) cpSync(join(GAME, f), join(dir, f));
  }
  writeFileSync(join(dir, 'package.json'), '{ "type": "module" }\n');
  n.edits.forEach((e, i) => {
    const file = join(srcDir, e.file);
    const txt = readFileSync(file, 'utf8');
    const hits = txt.split(e.find).length - 1;
    if (hits !== 1) {
      rmSync(dir, { recursive: true, force: true });
      throw new Error(`modscope: neuter ${name}'s needle ${JSON.stringify(e.find)} `
        + `appears ${hits} times in src/${e.file}, expected exactly 1. The fix it `
        + 'breaks has moved: teach this tool the new spelling rather than letting '
        + 'a neuter that patches nothing report "not red".');
    }
    writeFileSync(file, txt.replace(e.find, e.with));
    if (sha(join(SRC_DIR, e.file)) !== before[i]) {
      throw new Error(`modscope: src/${e.file} changed while the copy was made.`);
    }
  });
  return { dir, srcDir };
}

// ---------------------------------------------------------------------------
//  The session driver
// ---------------------------------------------------------------------------

const DEMO_CAP = 8000;      // frames: the measured demo ends ~3624
const PLAY_CAP = 20000;     // frames: four deaths plus the game-over screen

/**
 * **THE DEATHS MUST HAPPEN AWAY FROM PAGE 0, AND THIS NUMBER IS THE WHOLE
 * REASON THE `no-abandon` NEUTER CAN FAIL AT ALL.**
 *
 * The first version of this driver killed the ship on its first play frame, so
 * every death was captured at `$3F = 0` -- and replaying `camHi = 0` into the
 * next run's `$9B3E` writes the value that was already there. It reported
 * GREEN with W43's fix removed. That is precisely the shape this tool exists to
 * catch, found in the tool itself on its first run.
 *
 * 4 is chosen because `$97BB` stores min(`$3F` AND $0E, 8), so page 4 is also a
 * real checkpoint: the unmodded respawn comes back AT page 4 and the remaining
 * deaths are already past the gate. It costs one camera crossing per session.
 */
const MIN_DEATH_PAGE = 4;

/**
 * Drive ONE SESSION and return what was observed at each boundary.
 *
 * NO INPUT IS SENT DURING PLAY. The ship sits where `$9B3E` put it and the
 * stage runs at it, which is both deterministic and the harshest version of
 * the test: any position the harness flew to would be the harness's, and the
 * camera page a death happens on is exactly the value W43's defect replayed.
 *
 * Deaths are forced by calling `$C1D6` directly at the end of a frame -- the
 * same labelled intervention W43's reproduction used, and the same call the
 * cartridge's own `$C0C7` sweep makes. It is refused while a loadout's
 * invulnerability window is open, which is why the driver keeps asking rather
 * than assuming: `immortal` refuses forever and that is recorded, not skipped.
 */
function runSession(E, ids, pickerOpts, { demoHashOnly = false } = {}) {
  const res = RES;
  const lo = E.resolveLoadout(ids, pickerOpts);
  const s = E.resetState(res.manifest);
  if (ids.length || Object.keys(pickerOpts).length) E.attachMods(s, lo);

  const out = { lo, notes: [], demoChain: null, B1: null, B2: null, B3: null,
                deaths: 0, deathPages: [], forced979D: false };

  const rt = () => (s.mods ? s.mods.rt : null);
  const snap = () => ({
    stage: s.zp19, loop: s.zp1A, cam: s.cam.hi, build: s.build.hi,
    lives: s.lives[0], sub: s.substate,
    kit: [s.zp.speed, s.zp.missile, s.zp.meter, s.zp.weapon, s.zp.options, s.zp.shield],
    death: rt() ? rt().death : null,
    invuln: rt() ? rt().invuln : 0,
    firstIntro: rt() ? rt().firstIntro : null,
  });

  // ---- phase D: the attract demo, in full --------------------------------
  const chain = createHash('sha256');
  let sawDemo = false, demoOver = false, f = 0;
  for (; f < DEMO_CAP && !demoOver; f++) {
    E.nmi(s, 0, res);
    if (s.mode === 2) { sawDemo = true; chain.update(simHash(s)); }
    else if (sawDemo) demoOver = true;
  }
  if (!sawDemo) throw new Error('modscope: the attract demo never started');
  out.demoChain = chain.digest('hex');
  out.afterDemo = snap();
  if (demoHashOnly) return out;

  // ---- START, and RUN 1 ---------------------------------------------------
  let pressed = false;
  for (let g = 0; g < 2000; g++, f++) {
    const word = (s.mode === 1 && !pressed && (g & 1) === 0) ? E.BTN.START : 0;
    E.nmi(s, word, res);
    if (s.mode === 3) pressed = true;
    if (s.mode === E.MODE_STAGE && s.substate >= 0x80) break;
  }
  if (!(s.mode === E.MODE_STAGE && s.substate >= 0x80)) {
    throw new Error('modscope: START never produced a play frame');
  }
  out.B1 = snap();

  // ---- three deaths, then the game over -----------------------------------
  let gameOverAt = -1;
  let prevSub = s.substate;
  for (let g = 0; g < PLAY_CAP; g++, f++) {
    const pageBefore = s.cam.hi;
    E.nmi(s, 0, res);
    // A DEATH IS `$1B := $A0`, whoever caused it. The port's own sweeps kill
    // this ship without any help ($C101 contact, $C2C1 terrain), so most of
    // these are the game's, not the driver's -- and the camera page they happen
    // on is the byte W43's defect replayed into the next run.
    if (prevSub < 0xA0 && s.substate === 0xA0) { out.deaths++; out.deathPages.push(pageBefore); }
    prevSub = s.substate;
    if (s.substate === 0xC0) { gameOverAt = g; break; }
    // A play substate with the ship alive, past the page gate: ask $C1D6 for a
    // death. `cam.hi` is the byte W43's defect replayed, so a death at page 0
    // would make this whole tool unable to see it (see MIN_DEATH_PAGE).
    if (s.substate >= 0x80 && s.substate < 0xA0 && s.obj.status[0] === 1
        && s.cam.hi >= MIN_DEATH_PAGE) {
      const before = s.lives[0];
      E.die(s);
      if (s.obj.status[0] === 2) { /* counted by the $1B := $A0 watch above */ }
      else if (before === s.lives[0] && g > 6000) {
        // Refused for 3000 frames: this loadout cannot die. Force `$979D` with
        // no lives left, which is the routine `$96EF`'s countdown calls, so the
        // game-over boundary still gets real coverage instead of a silent skip.
        out.forced979D = true;
        s.lives[0] = 0;
        E.respawn(s, res);
      }
    }
  }
  if (gameOverAt < 0 && s.substate !== 0xC0) {
    out.notes.push('NEVER REACHED GAME OVER');
    return out;
  }
  out.B2 = snap();

  // ---- CONTINUE, and RUN 2 ------------------------------------------------
  let cont = false;
  for (let g = 0; g < 2000; g++, f++) {
    const word = (!cont && (g & 1) === 0) ? E.BTN.START : 0;
    E.nmi(s, word, res);
    if (s.mode === 4) cont = true;
    if (cont && s.mode === E.MODE_STAGE && s.substate >= 0x80) break;
  }
  if (!cont) { out.notes.push('CONTINUE NEVER TAKEN'); return out; }
  if (!(s.mode === E.MODE_STAGE && s.substate >= 0x80)) {
    out.notes.push('CONTINUE TAKEN BUT RUN 2 NEVER REACHED A PLAY FRAME');
    return out;
  }
  out.B3 = snap();
  return out;
}

// ---------------------------------------------------------------------------
//  The contract each boundary is held to
// ---------------------------------------------------------------------------

/**
 * What the loadout PROMISED, as the bytes it promised them in.
 *
 * Derived from the resolved loadout rather than written per mod, so a mod added
 * to src/mods.js tomorrow is covered by this tool the day it is added.
 */
function expected(lo) {
  const clamp = { 0x42: 6, 0x44: 2, 0x45: 2 };
  const kit = [0x40, 0x41, 0x42, 0x44, 0x45, 0x46].map((a) => (
    a in lo.zp ? Math.min(lo.zp[a], clamp[a] ?? 255) : null
  ));
  return { stage: lo.stage, loop: lo.sim.loop === null ? 0 : lo.sim.loop, kit };
}

function checkRunStart(exp, got, where, fails) {
  const say = (m) => fails.push(`${where}: ${m}`);
  if (got.stage !== exp.stage) say(`$19 = ${got.stage}, the loadout chose stage ${exp.stage}`);
  if (got.loop !== exp.loop) say(`$1A = ${got.loop}, the loadout chose loop ${exp.loop}`);
  const names = ['$40 speed', '$41 missile', '$42 meter', '$44 weapon', '$45 options', '$46 shield'];
  for (let i = 0; i < 6; i++) {
    if (exp.kit[i] !== null && got.kit[i] !== exp.kit[i]) {
      say(`${names[i]} = ${got.kit[i]}, the loadout chose ${exp.kit[i]}`);
    }
  }
  if (got.lives !== 3) say(`$20,X = ${got.lives} on the first play frame, expected 3`);
}

/**
 * `rt.death` must be gone at BOTH the game over and the start of the next run;
 * `rt.invuln` only at the game over, because a run START is exactly where Heal
 * Gradius Syndrome legitimately arms its window (`checkInvuln` is false there).
 */
function checkRunScopeClean(got, where, fails, checkInvuln) {
  if (got.death !== null) {
    fails.push(`${where}: rt.death survived (${JSON.stringify(got.death)}) -- `
      + 'the next $9B3E would replay it (W43)');
  }
  if (checkInvuln && got.invuln !== 0) {
    fails.push(`${where}: rt.invuln = ${got.invuln}, the run is over`);
  }
}

// ---------------------------------------------------------------------------
//  main
// ---------------------------------------------------------------------------

const RES = headlessResources(0);

const BASE = await loadEngine(SRC_DIR);
const ALL_MODS = Object.keys(BASE.MODS);
const ALL_PRESETS = Object.keys(BASE.PRESETS);

const only = opt('--only');
const onlySet = only ? new Set(only.split(',')) : null;

/** Every loadout this tool covers: one per mod, one per preset, plus vanilla. */
const LOADOUTS = [
  { name: 'picker-only', ids: [] },
  ...ALL_MODS.map((id) => ({ name: id, ids: [id] })),
  ...ALL_PRESETS.map((id) => ({ name: `preset:${id}`, ids: BASE.PRESETS[id].mods })),
].filter((l) => !onlySet || onlySet.has(l.name));

/**
 * THE VANILLA DEMO, hashed once. Every loadout's demo must chain to this.
 *
 * It is driven with NO mods object at all -- `state.mods` undefined, THE ONE
 * RULE's own state -- so it is the port the oracle corpus compares, and
 * "identical to it" is a claim about the program the gate has evidence for.
 */
const VAN = runSession(BASE, [], {});
const vanilla = VAN;
if (!VAN.B1 || !VAN.B2 || !VAN.B3) {
  throw new Error('modscope: the UNMODDED session did not reach all four '
    + 'boundaries, so there is no control to compare against. '
    + `B1=${!!VAN.B1} B2=${!!VAN.B2} B3=${!!VAN.B3} ${VAN.notes}`);
}

function evaluate(engine, label) {
  const rows = [];
  let fail = 0;
  for (const L of LOADOUTS) {
    const fails = [];
    let r = null;
    try {
      r = runSession(engine, L.ids, PICKER);
    } catch (e) {
      fails.push(`threw: ${e.message}`);
    }
    if (r) {
      const exp = expected(r.lo);
      // D -- the attract demo is not the player's run.
      if (r.demoChain !== vanilla.demoChain) {
        fails.push('D: the attract demo\'s simulation diverged from vanilla -- '
          + 'the mod layer ran inside $09 != 0');
      }
      if (r.afterDemo.firstIntro === false) {
        fails.push('D: rt.firstIntro was spent by the attract demo -- the '
          + 'starting kit went to a ship the player was not flying');
      }
      // B1 -- run 1 begins.
      if (r.B1) checkRunStart(exp, r.B1, 'B1 run 1', fails);
      else fails.push('B1: run 1 never reached a play frame');
      // B2 -- the game over.
      if (r.B2) checkRunScopeClean(r.B2, 'B2 game over', fails, true);
      else fails.push('B2: no game over was reached -- ' + (r.notes[0] || '?'));
      // B3 -- the continue.
      if (r.B3) {
        checkRunStart(exp, r.B3, 'B3 run 2', fails);
        checkRunScopeClean(r.B3, 'B3 run 2', fails, false);
        // THE CONTROL IS THE VANILLA SESSION'S OWN RUN 2, not a hard-coded 0.
        // `$55` legitimately leads `$3F` by a page (the streamer builds ahead),
        // so a literal would either be wrong or would have to encode the lead;
        // the port with no mods at all is the thing that defines both.
        if (r.B3.cam !== VAN.B3.cam || r.B3.build !== VAN.B3.build) {
          fails.push(`B3 run 2: $3F = ${r.B3.cam} / $55 = ${r.B3.build} on the first `
            + `play frame of a NEW GAME; the unmodded port has ${VAN.B3.cam}/${VAN.B3.build} `
            + 'there. A continue starts a fresh stage; this is where the previous '
            + 'run died (W43, the owner\'s volcano)');
        }
      } else fails.push('B3: the continue never produced a play frame -- ' + (r.notes[0] || '?'));
    }
    rows.push({ name: L.name, fails, r });
    if (fails.length) fail++;
  }
  return { rows, fail };
}

console.log('==== modscope: the mod layer, across a demo, a run, a game over and a continue');
console.log(`  ${LOADOUTS.length} loadouts (${ALL_MODS.length} mods + ${ALL_PRESETS.length} presets + picker-only)`);
console.log(`  picker: ${JSON.stringify(PICKER)}`);
console.log(`  vanilla attract-demo chain: ${vanilla.demoChain.slice(0, 16)}`);

const base = evaluate(BASE, 'baseline');
console.log('\n---- BASELINE (src/ as it ships) ----');
for (const row of base.rows) {
  if (row.fails.length) {
    console.log(`  FAIL  ${row.name}`);
    for (const m of row.fails) console.log(`          ${m}`);
  } else if (VERBOSE) {
    const r = row.r;
    console.log(`  ok    ${row.name.padEnd(24)} deaths=${r.deaths} pages=[${r.deathPages}]`
      + `${r.forced979D ? ' (forced $979D: this loadout refuses $C1D6)' : ''}`);
  }
}
if (!VERBOSE) console.log(`  ${base.rows.length - base.fail} clean, ${base.fail} failing`);

// Coverage, printed whether or not anything failed. A run that quietly reached
// fewer boundaries than it claims is the failure this repo keeps finding.
const cov = { B1: 0, B2: 0, B3: 0, forced: 0 };
for (const row of base.rows) {
  if (!row.r) continue;
  if (row.r.B1) cov.B1++;
  if (row.r.B2) cov.B2++;
  if (row.r.B3) cov.B3++;
  if (row.r.forced979D) cov.forced++;
}
console.log(`\n  COVERAGE: B1 ${cov.B1}/${base.rows.length}  B2 ${cov.B2}/${base.rows.length}  `
  + `B3 ${cov.B3}/${base.rows.length}   (${cov.forced} loadouts refuse $C1D6 and had `
  + '$979D forced with no lives left, which is what $96EF\'s countdown calls)');

/**
 * THE WITNESS MARGIN. Without this the `no-abandon` neuter can pass silently.
 *
 * `rt.death` is only captured by loadouts with `respawnInPlace`, and replaying
 * it is only VISIBLE if the page it captured differs from the page a fresh run
 * starts on. The first version of this driver killed the ship on its first play
 * frame, so every death was captured at `$3F = 0`, and W43's own defect was
 * invisible to the tool written to find it. If the run ever stops producing a
 * non-zero death page, that is a broken instrument and it says so here rather
 * than printing GREEN.
 */
let witness = 0;
for (const row of base.rows) {
  if (!row.r || !row.r.lo.sim.respawnInPlace) continue;
  if (row.r.deathPages.some((p) => p !== VAN.B3.cam)) witness++;
}
const RESPAWN_LOADOUTS = base.rows.filter((r) => r.r && r.r.lo.sim.respawnInPlace).length;
console.log(`  WITNESS: ${witness}/${RESPAWN_LOADOUTS} respawnInPlace loadouts died on a page `
  + `other than ${VAN.B3.cam} (a fresh run's own $3F), so a replayed death position is visible`);
if (RESPAWN_LOADOUTS > 0 && witness === 0) {
  console.log('  BROKEN INSTRUMENT: every captured death was on the page a new run '
    + 'starts on, so the no-abandon neuter cannot be seen. Move MIN_DEATH_PAGE or '
    + 'the driver, do not read the GREEN below.');
}

let neuterFail = [];
if (!flag('--baseline')) {
  console.log('\n---- SEEN TO FAIL: each neuter undoes one fix, in a copy of src/ ----');
  for (const name of Object.keys(NEUTERS)) {
    let shadow = null;
    try {
      shadow = shadowWithNeuter(name);
      const E = await loadEngine(shadow.srcDir);
      const r = evaluate(E, name);
      const detectors = r.rows.filter((x) => x.fails.length).map((x) => x.name);
      // RED FOR THE RIGHT REASON. test-all.mjs's own self-check stage was once
      // wrong in exactly this way -- it read a failure signal the comparison
      // produces for another reason entirely and reported "RED (good)" for a
      // break that changed nothing. Each neuter therefore declares WHICH
      // assertion it must trip, and a neuter that goes red without it is a
      // failure, not a pass.
      const want = NEUTERS[name].wants;
      const hitWanted = r.rows.some((x) => x.fails.some((m) => m.includes(want)));
      const ok = r.fail > 0 && hitWanted;
      console.log(`  ${ok ? 'RED (good)' : 'NOT RED'}  ${name.padEnd(16)} `
        + `${r.fail}/${r.rows.length} loadouts caught it -- undoes ${NEUTERS[name].undoes}`);
      if (r.fail > 0 && !hitWanted) {
        console.log(`              WRONG REASON: nothing said ${JSON.stringify(want)}, `
          + 'so this neuter is red for something other than the fix it removes');
      }
      if (hitWanted) {
        const w = r.rows.find((x) => x.fails.some((m) => m.includes(want)));
        console.log(`              signature: ${w.name}: `
          + `${w.fails.find((m) => m.includes(want))}`);
      }
      if (detectors.length) {
        console.log(`              caught by: ${detectors.slice(0, 6).join(', ')}`
          + (detectors.length > 6 ? ` (+${detectors.length - 6} more)` : ''));
        // EVERY message of the first detector, not just its first. A neuter
        // that trips one assertion and a neuter that trips the one the defect
        // actually looked like are not the same evidence.
        const first = r.rows.find((x) => x.fails.length);
        for (const m of first.fails) console.log(`              ${first.name}: ${m}`);
      }
      if (!ok) neuterFail.push(name);
    } finally {
      if (shadow) rmSync(shadow.dir, { recursive: true, force: true });
    }
  }
}

console.log('\n================================================================');
const bad = base.fail > 0 || neuterFail.length > 0
         || (RESPAWN_LOADOUTS > 0 && witness === 0);
if (base.fail) console.log(`  ${base.fail} loadouts fail the run-scope contract`);
if (neuterFail.length) console.log(`  these neuters did NOT turn it red: ${neuterFail}`);
console.log(`  ${bad ? 'RED' : 'GREEN'} -- ${base.rows.length} loadouts, `
  + `${Object.keys(NEUTERS).length} neuters`);
console.log('\n  WHAT THIS DOES NOT PROVE: nothing here is evidence about the');
console.log('  cartridge. Mods are behaviour this repo ADDED; compare.mjs is the');
console.log('  gate that holds the port to the ROM, and it runs with no mods at all.');
process.exit(bad ? 1 : 0);
