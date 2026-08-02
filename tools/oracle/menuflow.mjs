// The menu FLOW: the copyright screen, the round-select fade, and the exact
// list of sound cues the walk title -> OPTIONS -> title -> round select makes.
//
// menuscreen.mjs compares four settled landmarks. Three things it cannot see,
// and all three were wrong:
//
//   1. flow state 1 -- the SUNSOFT copyright screen -- was not ported at all.
//      src/vram.js built its output only so fillTilemap could erase it again.
//   2. round select had no fade. $03D7's `LD C,$80 -> sub_00_0A7F` is 33
//      frames long and the port's BGP was $E4 from frame 1, so the menu popped
//      in from black.
//   3. showTitle asked for song $00 on the OPTIONS return, cutting the $25
//      that $3915 had just sent and restarting the title theme.
//
// Everything here is held against tools/oracle/menushot.py's recording -- the
// same rip/oracle/menus.json menuscreen.mjs uses. No new capture is needed:
// the recorder already snapped the copyright screen's pixels, counted its
// hold loop, traced the palette shadows through the round-select fade and
// stamped every sub_00_0AE1 hit with the loop counters.
//
//   node tools/oracle/menuflow.mjs [--record] [--dump copyright]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

const REF = path.join(ROOT, 'rip', 'oracle', 'menus.json');

installFetchShim();

if (process.argv.includes('--record') || !fs.existsSync(REF)) {
  execFileSync('python', ['tools/oracle/menushot.py', '--out',
                          path.relative(ROOT, REF)],
               { cwd: ROOT, stdio: 'inherit' });
}
const ref = JSON.parse(fs.readFileSync(REF, 'utf8'));

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { loadManifest } = await imp('src/assets.js');
const { resolveLoadout } = await imp('src/mods.js');
const R = await imp('src/render/renderer.js');
const C = await imp('src/copyright.js');
const T = await imp('src/title.js');
const RS = await imp('src/roundselect.js');
const O = await imp('src/options.js');
const RA = await imp('src/raster.js');

const manifest = await loadManifest();
const copyArt = await C.loadCopyright(manifest);
const titleArt = await T.loadTitle();
const rsArt = await RS.loadRoundSelect(manifest, titleArt.vram);

const BTN = { A: 0x01, B: 0x02, SELECT: 0x04, START: 0x08,
              R: 0x10, L: 0x20, U: 0x40, D: 0x80 };

function fresh() {
  const state = createState(makeTunables(resolveLoadout([]).tunables));
  state.loadout = resolveLoadout([]);
  state.tables = manifest.tables;
  state.titleManifest = manifest;
  state.sound = { queue: [] };
  return state;
}
const press = (s, mask = 0) => { s.input.pressed = mask; s.input.held = mask; };

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  if (!ok) console.log(`FAIL  ${name}\n      ${detail}`);
};

/* --------------------------------------------------------------------------
 * 1. The copyright screen
 * ------------------------------------------------------------------------ */
{
  const state = fresh();
  C.showCopyright(state, copyArt);

  // renderer.js's "this is a screen, not a level" guard must list
  // state.copyright. Without it rasterBands falls through to
  // rasterModeForLevel() and the fresh state's level 1 hands the copyright
  // screen the levels-1/2 WATER raster arm -- a per-scanline SCX wobble that
  // slid the whole screen 6 px. Checked WITHOUT forcing level 0, so the guard
  // itself is what is being measured.
  const bands = (await imp('src/render/renderer.js')).rasterBands;
  const b = bands(state);
  check('copyright takes the flat raster arm (level 1 still loaded)',
        b.length === 1 && b[0].scx === 0 && b[0].scy === 0,
        `rasterBands returned ${b.length} band(s), scx=${b[0] && b[0].scx} `
        + '-- a LEVEL arm ran over a menu screen');

  // The recorder snapped at $026C iteration 101, i.e. after $0265's fade. The
  // port's fade is 33 ticks; run the same 101 hold iterations on top so the
  // comparison is at the recorder's landmark rather than "somewhere settled".
  for (let i = 0; i < 33 + 101; i++) {
    press(state);
    if (C.tickCopyright(state) !== 'copyright') break;
  }
  const fb = R.createFramebuffer();
  R.renderFrame(state, fb);

  const snap = ref.snaps.copyright;
  let bad = 0; let first = null;
  for (let i = 0; i < snap.screen.length; i++) {
    if (snap.screen[i] === fb.shades[i]) continue;
    bad++;
    if (!first) {
      first = `(${i % 160},${(i / 160) | 0}) rom=${snap.screen[i]} port=${fb.shades[i]}`;
    }
  }
  check('copyright pixels', bad === 0,
        `${snap.screen.length - bad}/${snap.screen.length}, first ${first}`);
  console.log(`copyright         ${`${snap.screen.length - bad}/${snap.screen.length}`.padStart(12)} `
    + `${(bad ? 'FAIL' : 'ok').padStart(6)}  `
    + `rom bgp/obp0/obp1/wy=${[snap.regs.bgp, snap.regs.obp0, snap.regs.obp1, snap.regs.wy]
        .map((v) => v.toString(16)).join('/')} `
    + `port=${[state.video.bgp, state.video.obp0, state.video.obp1,
               state.video.windowLatchY].map((v) => v.toString(16)).join('/')} `
    + `oam rom=${snap.oam.length} port=${state.video.sprites.length}`);

  const regsOk = state.video.bgp === snap.regs.bgp
    && state.video.obp0 === snap.regs.obp0
    && state.video.obp1 === snap.regs.obp1
    && state.video.windowLatchY === snap.regs.wy
    && state.video.scx === snap.regs.scx && state.video.scy === snap.regs.scy;
  check('copyright LCD shadows', regsOk, JSON.stringify(snap.regs));
  check('copyright draws no sprites', state.video.sprites.length === snap.oam.length,
        `rom ${snap.oam.length} port ${state.video.sprites.length}`);
}

// $026A's B = $F0. The recorder counted $026C directly.
{
  const state = fresh();
  C.showCopyright(state, copyArt);
  let n = 0; let hold = 0; let prev = C.HOLD_FRAMES;
  for (;;) {
    press(state);
    const r = C.tickCopyright(state);
    n++;
    // Count ticks on which the $026C body actually ran, i.e. `DEC B` moved.
    if (state.copyright && state.copyright.hold !== prev) {
      hold++;
      prev = state.copyright.hold;
    }
    if (r === 'done') break;
    if (n > 1000) break;
  }
  check('copyright hold is 240 iterations', hold === ref.copyright_loop_total,
        `port ${hold}, cartridge ${ref.copyright_loop_total}`);
  // 33 fade in + 240 hold + 33 fade out.
  check('copyright is 306 frames end to end', n === 33 + 240 + 33, `port ${n}`);
  console.log(`copyright timing  ${String(n).padStart(12)} ${'ok'.padStart(6)}  `
    + `33 fade in + ${hold} hold + 33 fade out (cartridge $026C hits: `
    + `${ref.copyright_loop_total})`);
}

// $0271: BIT 3 -- START skips the hold, but not the fade out.
{
  const state = fresh();
  C.showCopyright(state, copyArt);
  let n = 0; let done = null;
  for (;;) {
    press(state, n === 33 + 10 - 1 ? BTN.START : 0);   // 10th hold iteration
    const r = C.tickCopyright(state);
    n++;
    if (r === 'done') { done = n; break; }
    if (n > 1000) break;
  }
  check('START skips the copyright hold', done === 33 + 10 + 33,
        `finished at ${done}, expected ${33 + 10 + 33}`);
}

/* --------------------------------------------------------------------------
 * 2. The round-select fade in -- $03D7, LD C,$80 -> sub_00_0A7F
 *
 * The cartridge's own trace is the tail of traces.flash: it runs from the
 * title flash's fade OUT, through the $035B build (which holds the shadows at
 * zero), into the fade IN, and stops on the frame $03DC first executes.
 * ------------------------------------------------------------------------ */
{
  // The cartridge's trace cannot be aligned by absolute frame: the $035B build
  // ($0362 sub_00_34A4, $036C/$0371 sub_00_0B15, $0381 sub_00_0A0E) costs
  // hardware frames the port spends none on, so the fade's first nine
  // iterations -- all of which write the $00 that is already there -- are lost
  // inside a run of black frames. Align on the first frame the shadows come
  // OFF black instead, and compare from there to the frame $03DC first runs.
  const tr = ref.traces.flash;
  const rsAt = tr.findIndex((r) => r.rs >= 1);
  let idx0 = rsAt;
  while (idx0 > 0 && tr[idx0 - 1].bgp !== 0) idx0--;
  const want = tr.slice(idx0, rsAt + 1).map((r) => [r.bgp, r.obp0, r.obp1]);

  // Drive the real path in: the title, its press-start flash, and the flash's
  // own fade OUT -- which is what leaves all three shadows at $00 for
  // showRoundSelect to inherit.
  const state = fresh();
  T.showTitle(state, titleArt);
  for (let i = 0; i < 40; i++) { press(state); T.tickTitle(state); }
  press(state, BTN.START);
  T.tickTitle(state);
  for (let i = 0; i < 400; i++) {
    press(state);
    if (T.tickTitle(state) === 'start') break;
  }
  check('the title flash leaves every shadow black',
        state.video.bgp === 0 && state.video.obp0 === 0 && state.video.obp1 === 0,
        `${state.video.bgp}/${state.video.obp0}/${state.video.obp1}`);

  T.hideTitle(state);
  RS.showRoundSelect(state, rsArt);
  const rows = [[state.video.bgp, state.video.obp0, state.video.obp1, false]];
  for (let i = 0; i < 60; i++) {
    press(state);
    // "Did the $03DC loop body run on this tick?" -- which is decided BEFORE
    // the tick. The tick that finishes the fade still spends its frame inside
    // sub_00_0A7F; the loop starts on the one after it.
    const wasFading = !!state.roundSelect.fade;
    RS.tickRoundSelect(state);
    rows.push([state.video.bgp, state.video.obp0, state.video.obp1, !wasFading]);
  }
  const p0 = rows.findIndex((r) => r[0] !== 0);
  const got = rows.slice(p0, p0 + want.length).map((r) => r.slice(0, 3));
  const fmt = (v) => v.map(([b, o0, o1], i) =>
    `+${i}:${b.toString(16)}/${o0.toString(16)}/${o1.toString(16)}`).join(' ');
  const same = JSON.stringify(want) === JSON.stringify(got);
  check('round-select fade cadence', same,
        `\n      rom  ${fmt(want)}\n      port ${fmt(got)}`);

  // The cartridge's last trace row IS the frame $03DC first executes; the
  // port's equivalent is the first tick the fade is gone.
  const firstLoop = rows.findIndex((r) => r[3]);
  check('first $03DC iteration lands with the cartridge',
        firstLoop - p0 === want.length - 1,
        `port +${firstLoop - p0}, cartridge +${want.length - 1}`);
  if (same) {
    const steps = [];
    want.forEach(([b], i) => { if (i && b !== want[i - 1][0]) steps.push(i); });
    console.log(`roundselect fade  ${String(want.length).padStart(12)} `
      + `${'ok'.padStart(6)}  bgp `
      + `${['$00', ...want.map(([b]) => '$' + b.toString(16).padStart(2, '0'))]
          .filter((v, i, a) => v !== a[i - 1]).join(' -> ')}`
      + ` at +0, +${steps.join(', +')}; first $03DC iteration at +${want.length - 1}`);
  }

  // And it must BLOCK: no cursor and no input while it runs.
  const s2 = fresh();
  RS.showRoundSelect(s2, rsArt);
  let leak = 0;
  for (let i = 0; i < 33; i++) {
    press(s2, BTN.START);
    if (RS.tickRoundSelect(s2) !== 'roundselect') leak += 100;
    leak += s2.video.sprites.length;
  }
  check('the fade blocks input and the cursor', leak === 0,
        `START/sprite leakage indicator ${leak}`);
}

/* --------------------------------------------------------------------------
 * 3. The cue list for the whole walk
 * ------------------------------------------------------------------------ */
{
  const state = fresh();
  const got = [];
  const drain = () => {
    for (const r of state.sound.queue) got.push([r.id, r.mask]);
    state.sound.queue.length = 0;
  };

  const step = (mask = 0, fn) => { press(state, mask); fn(); drain(); };

  C.showCopyright(state, copyArt); drain();
  for (let i = 0; i < 400; i++) {
    press(state, i === 33 ? BTN.START : 0);
    const r = C.tickCopyright(state);
    drain();
    if (r === 'done') break;
  }
  C.hideCopyright(state);
  T.showTitle(state, titleArt); drain();                 // $02A1: $00/$03
  for (let i = 0; i < 40; i++) step(0, () => T.tickTitle(state));
  step(BTN.D, () => T.tickTitle(state));                 // $02F0: $0E/$01
  for (let i = 0; i < 4; i++) step(0, () => T.tickTitle(state));

  // START with the cursor on OPTION -> $3893.
  press(state, BTN.START);
  const r = T.tickTitle(state);
  drain();
  if (r !== 'options') throw new Error(`title did not open OPTIONS (${r})`);
  state.title = null;
  state.raster.mode = 7; state.raster.closing = 0; state.raster.delta = 0;
  O.showOptions(state, titleArt.windowMap); drain();     // $3893: $25/$03

  // Slide in, then DOWN twice to reach EXIT, then START.
  for (let i = 0; i < 80; i++) step(0, () => { RA.tickRaster(state); O.tickOptions(state); });
  step(BTN.D, () => { RA.tickRaster(state); O.tickOptions(state); });   // $0E
  step(0, () => { RA.tickRaster(state); O.tickOptions(state); });
  step(BTN.D, () => { RA.tickRaster(state); O.tickOptions(state); });   // $0E
  step(0, () => { RA.tickRaster(state); O.tickOptions(state); });
  press(state, BTN.START);
  RA.tickRaster(state); O.tickOptions(state); drain();   // $3915: $25/$03
  for (let i = 0; i < 300; i++) {
    press(state);
    RA.tickRaster(state);
    const q = O.tickOptions(state);
    drain();
    if (q === 'title') break;
  }
  O.hideOptions(state);
  T.showTitle(state, titleArt, false); drain();          // $3934: NOTHING

  for (let i = 0; i < 10; i++) step(0, () => T.tickTitle(state));
  step(BTN.START, () => T.tickTitle(state));             // $0315: $0D/$01
  for (let i = 0; i < 400; i++) {
    press(state);
    const q = T.tickTitle(state);
    drain();
    if (q === 'start') break;                            // $0355: $01/$03
  }
  T.hideTitle(state);
  RS.showRoundSelect(state, rsArt); drain();             // $035B: NOTHING

  const want = ref.songs.map((s) => [s.id, s.mask]);
  const hex = (l) => l.map(([i, m]) => `$${i.toString(16).padStart(2, '0')}/$${m.toString(16).padStart(2, '0')}`).join(' ');
  const same = JSON.stringify(want) === JSON.stringify(got);
  check('cue list for the menu walk', same,
        `\n      rom  ${hex(want)}\n      port ${hex(got)}`);
  if (same) console.log(`menu cues         ${String(got.length).padStart(12)} ${'ok'.padStart(6)}  ${hex(got)}`);
}

const bad = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - bad}/${results.length} checks pass`);
process.exit(bad ? 1 : 0);
