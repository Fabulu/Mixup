// Drive the WHOLE game -- boot, title, round select, the stage-intro card and
// into level 1 -- through src/main.js's own frame loop, and look at every
// displayed frame.
//
// WHY THIS IS DIFFERENT FROM EVERY OTHER HARNESS HERE.  trace.py's twin
// render-frame.mjs, pixeldiff.mjs, regress.mjs, deathpix.mjs -- all of them
// start at `initLevel(state, N)` and call `tick()` in a loop.  That is the game
// minus its skeleton: the title's own loop, the round-select cursor, the card,
// the level hand-off, the death handoff, the game-over reset and the ending all
// live in boot()'s step(), and no harness has ever driven them frame by frame.
// A screen can be byte-exact in VRAM and still never appear, or appear at the
// wrong time, or leave a register behind that only shows up two screens later;
// this project has been bitten by the first two of those already.
//
// tools/oracle/headless.mjs boots the real thing with a canvas shim, so the
// pixels here are the bytes the browser would have blitted.
//
// WHAT IT CHECKS
//   1. STRUCTURE, every frame: the screen the game thinks it is on, and the
//      shade histogram of what it actually drew.  A screen that never appears,
//      a fade that lands on the wrong shade, or a picture that stops changing
//      is visible here and nowhere else.
//   2. PIXELS at the hand-off: the first gameplay frames after the card are
//      compared against the cartridge's own route entry into level 1
//      (pixelscen.py needs no $FFB0 injection for level 1, so its boot IS the
//      menu walk).  This is the only test in the tree that the menu path leaves
//      the same machine behind as a direct level load.
//
// Usage:
//   node tools/oracle/flowpix.mjs
//   node tools/oracle/flowpix.mjs --trace     (per-frame screen/histogram log)
//   node tools/oracle/flowpix.mjs --dump      (PGMs of every landmark)

import fs from 'node:fs';
import path from 'node:path';
import { bootHeadless, ROOT, BTN, diff, histogram, writePGM, thumb, W, H, TOTAL }
  from './headless.mjs';

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const DIR = path.join(ROOT, 'rip', 'oracle', 'pix');
const OUT = path.join(DIR, 'flow');

let fail = 0;
const note = (ok, msg) => { if (!ok) fail++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); };

const g = await bootHeadless({ level: 1, title: true });

// ---------------------------------------------------------------- 1. walk it

const log = [];          // { f, screen, hist, changed }
const landmarks = {};    // screen -> { first, last, frames }
let prevShades = null;
let frozen = 0, maxFrozen = 0, frozenAt = 0;

async function step(mask) {
  await g.frame(mask);
  const sh = g.shades();
  const s = g.screen();
  const changed = prevShades ? !sh.every((v, i) => v === prevShades[i]) : true;
  if (changed) { if (frozen > maxFrozen) { maxFrozen = frozen; frozenAt = log.length; } frozen = 0; }
  else frozen++;
  prevShades = sh;
  const f = log.length + 1;
  log.push({ f, screen: s, hist: histogram(sh), changed });
  const L = landmarks[s] ?? (landmarks[s] = { first: f, last: f, frames: 0 });
  L.last = f; L.frames++;
  return { f, s, sh };
}

// The title's fade is 33 frames; give it room, then START.  The round select
// fade blocks input for 33 more.  The card is 276 unless START skips it.
console.log('driving boot -> title -> round select -> stage intro -> level 1');
let started = false, chosen = false, inLevel = 0;
const entry = [];                              // the first gameplay frames
for (let i = 0; i < 900 && entry.length < 130; i++) {
  let mask = 0;
  if (!started && g.screen() === 'title' && i >= 80) { mask = BTN.START; started = true; }
  else if (!chosen && g.screen() === 'roundselect' && log.length > (landmarks.roundselect?.first ?? 0) + 40) {
    mask = BTN.START; chosen = true;
  }
  const r = await step(mask);
  if (/^level/.test(r.s)) {
    inLevel++;
    entry.push({ n: inLevel, shades: r.sh, f: r.f });
  }
}

if (has('trace')) {
  let last = '';
  for (const e of log) {
    if (e.screen !== last || e.f % 20 === 0) {
      console.log(`   f${String(e.f).padStart(4)} ${e.screen.padEnd(12)} `
        + `shades ${e.hist.join('/')}${e.changed ? '' : '  (frozen)'}`);
      last = e.screen;
    }
  }
}

console.log('\nscreens reached, in order:');
for (const [k, v] of Object.entries(landmarks)) {
  console.log(`  ${k.padEnd(12)} frames ${String(v.frames).padStart(4)}   `
    + `f${v.first}..${v.last}`);
}

// --------------------------------------------------------- 2. the structure

console.log('\nstructure:');
note(landmarks.title, 'the title screen appears');
note(landmarks.roundselect, 'round select appears');
note(landmarks.stageintro, 'the stage-intro card appears');
note(landmarks.level1, 'level 1 starts');
// $0265-$0278: the Sunsoft copyright screen is 33 + 240 + 33 frames in front of
// the title on the cartridge.  src/copyright.js exists and is pixel-exact
// against menushot.py, but nothing calls it.
note(landmarks.copyright, 'the SUNSOFT copyright screen appears before the title '
  + '($0265, 306 frames)');

// Nothing in this walk is a still image for long: the title flashes, the card
// holds but then fades, the level animates.  A long freeze means a screen
// stopped being driven.
note(maxFrozen <= 200, `no screen freezes for more than 200 frames `
  + `(longest run of identical frames: ${maxFrozen}, ending at f${frozenAt})`);

// A screen that renders as one flat shade outside a fade is a blank screen.
const flat = log.filter((e) => e.hist.filter((v) => v > 0).length === 1);
const flatRuns = [];
for (const e of flat) {
  const last = flatRuns[flatRuns.length - 1];
  if (last && last.to === e.f - 1) { last.to = e.f; last.n++; }
  else flatRuns.push({ from: e.f, to: e.f, n: 1, screen: e.screen });
}
for (const r of flatRuns) {
  console.log(`  note  flat single-shade screen f${r.from}..${r.to} (${r.n} frames, ${r.screen})`);
}

// --------------------------------------------------------------- 3. pixels

console.log('\npixels at the hand-off, against the cartridge\'s own route entry:');
const refFile = path.join(DIR, 'l1-entry.json');
if (!fs.existsSync(refFile)) {
  console.log('  (no recording; run:  python tools/oracle/pixelscen.py --level 1 '
    + '--frames 120 --script "120:" --capture 2,3,20,21,60,61,120 '
    + '--out rip/oracle/pix/l1-entry.json)');
  fail++;
} else {
  const ref = JSON.parse(fs.readFileSync(refFile, 'utf8'));
  // The cartridge's own boot lands on gameplay iteration 1 at loc_00_0567;
  // ours lands on the first frame the card is no longer up.  MEASURED by
  // sweeping the offset over the whole capture list: rom iteration k lines up
  // with the port's k'th post-card frame, and everything from k = 20 on is 0
  // wrong pixels at that offset and nonzero at every other.  (The recorder
  // cannot capture k = 1; its loop samples after the first tick.)
  for (const n of ref.capture) {
    const m = ref.frames[String(n)];
    const o = entry.find((e) => e.n === n);
    if (!m || !o) continue;
    const d = diff(m.screen, o.shades);
    console.log(`  gameplay frame ${String(n).padStart(3)}: `
      + `${(d.pct * 100).toFixed(2).padStart(7)}%  ${String(d.bad).padStart(6)} wrong px`
      + (d.worst.length ? `   rows ${d.worst.map((x) => `${x[0]}:${x[1]}`).join(' ')}` : ''));
    if (has('dump')) {
      writePGM(path.join(OUT, `entry-f${n}-rom.pgm`), m.screen);
      writePGM(path.join(OUT, `entry-f${n}-port.pgm`), o.shades);
    }
    if (d.bad) fail++;
  }
}

// ------------------------------------------- 4. death and game-over handoffs
//
// loc_00_2AAD and $2ABA are the two exits from a death, and NOTHING has ever
// driven either through the frame loop with a picture attached.  flowdiff.mjs
// drives afterDeath() as a pure state change, on purpose, so it never sees a
// screen at all.  Zeroing the player's HP is what the last point of damage
// leaves behind, so this is the game's own path.

console.log('\ndeath handoff (loc_00_2AAD -> round select):');
{
  const before = g.state.flow.lives;
  g.state.player.hp = 0;
  let reached = 0, blank = 0;
  for (let i = 0; i < 700 && !reached; i++) {
    await g.frame(0);
    const sh = g.shades();
    if (histogram(sh).filter((v) => v > 0).length === 1) blank++;
    if (g.screen() === 'roundselect') reached = i + 1;
  }
  note(reached > 0, `round select is reached, ${reached} frames after the kill `
    + `(the burst is 452 + the menu's own fade)`);
  note(g.state.flow.lives === before - 1,
    `a life is spent: ${before} -> ${g.state.flow.lives} ($2AB6)`);
  console.log(`  note  ${blank} of those frames were a single flat shade`);
}

console.log('\nCONTINUE back into a level:');
{
  let back = 0;
  for (let i = 0; i < 500 && !back; i++) {
    await g.frame(i === 60 ? BTN.START : 0);
    if (/^level/.test(g.screen())) back = i + 1;
  }
  note(back > 0, `a level is running again ${back} frames later `
    + `(now level ${g.state.level.number}, hp ${g.state.player.hp}/${g.state.player.hpMax})`);
  note(g.state.player.hp === g.state.player.hpMax,
    '$0482 refills HP on CONTINUE');
}

console.log('\ngame over ($2ABA -> loc_00_0150 -> the title):');
{
  g.state.flow.lives = 1;
  g.state.player.hp = 0;
  let title = 0;
  for (let i = 0; i < 900 && !title; i++) {
    await g.frame(0);
    if (g.screen() === 'title') title = i + 1;
  }
  note(title > 0, `the title is reached, ${title} frames after the last life`);
  note(g.state.flow.lives === g.state.tunables.startingLives,
    `lives are re-seeded to ${g.state.tunables.startingLives} ($0208): `
    + `got ${g.state.flow.lives}`);
  note(g.state.flow.routeMask === 0, `$C753 is wiped: got ${g.state.flow.routeMask}`);
  note(g.state.player.hpMax === g.state.tunables.startingMaxHP,
    `$FF8E is re-seeded to ${g.state.tunables.startingMaxHP} ($0202): `
    + `got ${g.state.player.hpMax}`);
  const h = histogram(g.shades());
  note(h.filter((v) => v > 0).length > 1,
    `the title actually draws something (shades ${h.join('/')})`);
}

if (has('dump')) {
  for (const [k, v] of Object.entries(landmarks)) {
    const mid = log[Math.floor((v.first + v.last) / 2) - 1];
    if (mid) console.log(`  (dumped ${k} at f${mid.f})`);
  }
}

console.log(`\n${g.displayed} frames driven through the real boot loop.`);
console.log(fail ? `FAIL (${fail} checks)` : 'PASS');
process.exit(fail ? 1 : 0);
