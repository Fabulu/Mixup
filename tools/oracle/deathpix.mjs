// PIXELS through a player death and a game over.  Port twin of
// tools/oracle/deathpix.py.
//
// WHY.  deathdiff.mjs (6/6) and gameoverdiff.mjs (13504/13504 shadow-OAM bytes)
// both pass, and neither has ever looked at the screen.  The GAME OVER
// lettering is drawn ACROSS the HUD and the dying player, so what it looks like
// depends on OAM ORDER -- which on a DMG is both sprite priority and which
// sprite the ten-per-line scan drops -- and a shadow-OAM diff is blind to it:
// the same records in a different order are the same bytes and a different
// picture.  gameoverdiff.mjs says so itself ("deliberately does not compare
// order").
//
// WHAT IT FOUND on its first run, and what the `alt` column is for:
//   $0567 runs the pair sub_00_0F7B (HUD) + sub_00_29E7 (the $C1C0 burst) at
//   $0573/$057A when $FFA7 == 0, and the SAME pair at $05E5/$05EC when it does
//   not -- so the cartridge queues the letters BEFORE the player on one parity
//   and AFTER the player, enemies and doors on the other.  On level 1 the burst
//   crosses the dying Batman and scanlines 64-79 carry ELEVEN sprites, one over
//   the DMG limit, so a different sprite is dropped on each parity.  MEASURED
//   over 26 consecutive frames: the cartridge alternates by exactly 68 px every
//   frame and the port's screen does not change at all.  The `alt` column
//   re-renders the same frame with the burst moved to the END of the sprite
//   list -- the $05EC arm -- and it is 0 px on every parity-1 frame.
//
// ALIGNMENT, measured rather than assumed (two things bit here):
//   * LAG 1.  The panel shows iteration N's work during N+1.  Proved with the
//     recorder's own no-kill control: `deathpix.py --kill-at 9999 --level 3`
//     against an idle port run is 0 wrong pixels on all five frames at lag 1
//     and 0/31/18/32/0 at lag 0.
//   * The kill goes in BEFORE tick `killAt`, not after.  PyBoy advances by
//     hardware frames, so the recorder's poke of $FF8A lands inside iteration
//     killAt and the cartridge's own iteration killAt already sees hp = 0.
//     Poking the port after its tick killAt puts the whole burst one frame
//     late, which reads as a clean lag-0 alignment and is a trap: it makes four
//     of the five captured frames match and hides the parity difference on the
//     fifth.  MEASURED both ways -- see the table in this file's git history --
//     killShift -1 with lag 1 gives 0 0 0 0 0 on death-l1, killShift 0 with
//     lag 0 gives 0 0 1 0 68.
//
// CAPTURES ARE CONSECUTIVE PAIRS on purpose.  A capture list of even frames
// only sits on ONE parity forever and the alternation is invisible.
//
// Usage:
//   node tools/oracle/deathpix.mjs                 all scenarios, record if absent
//   node tools/oracle/deathpix.mjs --only death-l1 --record
//   node tools/oracle/deathpix.mjs --only death-l1 --dump    (writes PGMs)
//   node tools/oracle/deathpix.mjs --lag 0                   (force the lag)

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const DIR = path.join(ROOT, 'rip', 'oracle', 'pix');

globalThis.fetch = async (u) => {
  const file = path.join(ROOT, String(u).replace(/^.*?(assets)/, '$1'));
  if (!fs.existsSync(file)) return { ok: false, status: 404, json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) };
  const buf = fs.readFileSync(file);
  return { ok: true, status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const R = await imp('src/render/renderer.js');

const W = R.SCREEN_W, H = R.SCREEN_H, TOTAL = W * H;

// The eight $C1C0 records each draw ONE 8x16 metasprite from 0:$2ACF, and
// tools/oracle/gameoverprobe.py reads the seven distinct OBJ tiles out of live
// VRAM: $1C $1E $20 $22 $24 $26 $28 -- the bevelled letters G A M E O V E R.
// Identifying the burst by its tile set is what lets this tool re-render a
// frame in the other parity's order without touching src/.
const BURST_TILES = new Set([0x1C, 0x1E, 0x20, 0x22, 0x24, 0x26, 0x28]);

const PAIRS = [60, 61, 100, 101, 200, 201, 320, 321, 440, 441];

const SCEN = [
  // Static background: the lag is unambiguous and the comparison is about the
  // burst and nothing else.
  { name: 'death-l1', level: 1, killAt: 40, frames: 470, capture: PAIRS },
  { name: 'death-l3', level: 3, killAt: 40, frames: 470, capture: PAIRS },
  // Parallax sky: the background scrolls on its own every frame even with the
  // camera parked, so this is also a raster test.  Kept because it is the only
  // death scenario where the burst crosses a MOVING background.
  { name: 'death-l9', level: 9, killAt: 40, frames: 470, capture: PAIRS },
  // The same death with one life left: $2ABA takes `JP Z, loc_00_0150` instead
  // of round select.  The 452 frames before that are identical work on a screen
  // that is about to be wiped -- exactly where an order bug hides.
  { name: 'gameover-l1', level: 1, killAt: 40, frames: 470, lives: 1, capture: PAIRS },
  { name: 'gameover-l9', level: 9, killAt: 40, frames: 470, lives: 1, capture: PAIRS },
  // BOSS death, i.e. the other half of "a boss fight": 1:$4E82's trigger, the
  // $C740 countdown, the explosions, and loc_00_34D0's STAGE CLEAR fanfare.
  // The fanfare's 8192 VRAM bytes are already proved byte-exact on levels
  // 4/8/11; its PICTURE has never been compared to the cartridge's.
  { name: 'bossclear-l4', level: 4, killAt: 40, frames: 700, boss: true,
    capture: [60, 61, 200, 201, 400, 401, 560, 561, 640, 641] },
  { name: 'bossclear-l8', level: 8, killAt: 40, frames: 700, boss: true,
    capture: [60, 61, 200, 201, 400, 401, 560, 561, 640, 641] },
];

const argv = process.argv.slice(2);
const has = (n) => argv.includes(`--${n}`);
const arg = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const record = has('record');
const dump = has('dump');
const LAG = arg('lag', null) === null ? 1 : parseInt(arg('lag'), 10);

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();

async function runPort(sc) {
  const state = createState(makeTunables());
  await initLevel(state, sc.level);
  const fb = R.createFramebuffer();
  const want = new Set(sc.capture);
  const out = new Map();
  for (let f = 1; f <= sc.frames; f++) {
    state.input.pressed = 0; state.input.held = 0; state.input.prev = 0;
    // BEFORE the tick -- see the alignment note at the top.
    if (f === sc.killAt) {
      if (sc.lives != null) state.flow.lives = sc.lives;
      if (sc.boss) state.enemies[0][0x16] = 0;    // 1:$4E82, the last punch
      else state.player.hp = 0;
    }
    tick(state, manifest, playerTiles);
    if (want.has(f)) {
      const sprites = state.video.sprites.map((s) => ({ ...s }));
      R.renderFrame(state, fb);
      const shades = Uint8Array.from(fb.shades);
      const burst = sprites.filter((s) => BURST_TILES.has(s.tile & 0xFF));
      const rest = sprites.filter((s) => !BURST_TILES.has(s.tile & 0xFF));
      state.video.sprites = [...rest, ...burst];
      R.renderFrame(state, fb);
      const altShades = Uint8Array.from(fb.shades);
      state.video.sprites = sprites;
      out.set(f, { shades, altShades, sprites, nBurst: burst.length,
                   dead: state.player.dead, lives: state.flow.lives });
    }
  }
  return out;
}

function count(a, b) { let n = 0; for (let i = 0; i < TOTAL; i++) if (a[i] !== b[i]) n++; return n; }

function writePGM(file, sh) {
  const lum = [0xE0, 0xA0, 0x50, 0x08];
  const px = Buffer.alloc(TOTAL);
  for (let i = 0; i < TOTAL; i++) px[i] = lum[sh[i]];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.concat(
    [Buffer.from(`P5\n${W} ${H}\n255\n`, 'ascii'), px]));
}

const rows = [];
let fail = 0, parityFail = 0;
for (const sc of SCEN) {
  if (only && sc.name !== only) continue;
  const file = path.join(DIR, `${sc.name}.json`);
  if (record || !fs.existsSync(file)) {
    const a = ['tools/oracle/deathpix.py', '--level', String(sc.level),
      '--kill-at', String(sc.killAt), '--frames', String(sc.frames),
      '--capture', sc.capture.join(','), '--out', path.relative(ROOT, file)];
    if (sc.lives != null) a.push('--lives', String(sc.lives));
    if (sc.boss) a.push('--boss');
    execFileSync('python', a, { cwd: ROOT, stdio: 'inherit' });
  }
  const ref = JSON.parse(fs.readFileSync(file, 'utf8'));
  const ours = await runPort(sc);

  for (const f of sc.capture) {
    const m = ref.frames[String(f + LAG)];
    const o = ours.get(f);
    if (!m || !o) { console.log(`  ${sc.name} f${f}: MISSING sample`); fail++; continue; }
    let bad = 0;
    const perRow = new Int32Array(H);
    for (let i = 0; i < TOTAL; i++) {
      if (m.screen[i] !== o.shades[i]) { bad++; perRow[(i / W) | 0]++; }
    }
    const alt = count(m.screen, o.altShades);
    const worst = [...perRow].map((v, y) => [y, v]).filter((r) => r[1])
      .sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (bad) fail++;
    if (bad > 0 && alt === 0) parityFail++;
    if (dump) {
      writePGM(path.join(DIR, 'dump', `${sc.name}-f${f}-rom.pgm`), m.screen);
      writePGM(path.join(DIR, 'dump', `${sc.name}-f${f}-port.pgm`), o.shades);
      writePGM(path.join(DIR, 'dump', `${sc.name}-f${f}-alt.pgm`), o.altShades);
    }
    rows.push({ sc: sc.name, f, bad, alt, pct: (TOTAL - bad) / TOTAL, worst,
                par: m.regs.parity, portSpr: o.sprites.length, nBurst: o.nBurst,
                romLives: m.regs.lives, portLives: o.lives });
  }
}

console.log('\nscenario        frame  $FFA7   match      bad px   burst-last  sprites');
for (const r of rows) {
  const note = r.bad > 0 && r.alt === 0
    ? '   <- EXACT in the $05EC order: the port is on the wrong OAM parity'
    : (r.bad > 0 && r.alt < r.bad ? '   <- the other OAM parity is closer' : '');
  console.log(`${r.sc.padEnd(14)}${String(r.f).padStart(6)}${String(r.par).padStart(7)}  `
    + `${(r.pct * 100).toFixed(2).padStart(7)}%${String(r.bad).padStart(9)}`
    + `${String(r.alt).padStart(13)}${String(r.portSpr).padStart(9)}`
    + (note || (r.worst.length ? `   rows ${r.worst.map((w) => `${w[0]}:${w[1]}`).join(' ')}` : '')));
}
const tot = rows.reduce((a, r) => a + r.bad, 0);
console.log(`\n${rows.length} frames, ${tot} wrong pixels, `
  + `${(rows.reduce((a, r) => a + r.pct, 0) / Math.max(1, rows.length) * 100).toFixed(3)}% mean match`);
if (parityFail) {
  console.log(`${parityFail} of them are EXACT once the burst is drawn last -- `
    + 'that is $0567\'s $05E5/$05EC arm, which the port never takes.');
}
console.log(fail ? `FAIL (${fail}/${rows.length} frames)` : 'PASS');
process.exit(fail ? 1 : 0);
