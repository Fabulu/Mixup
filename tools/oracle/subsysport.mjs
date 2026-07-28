// Port-side twin of tools/oracle/subsystrace.py: runs the REAL port modules for
// N frames with scripted input and dumps every byte sub_00_2CBE's per-level
// branches own -- the level-6 track, the level-$0B freeze, the level-$0C floor
// cursor, the level-7/$0D spawn counters, the rescue-drop block, the whole
// $C1E8 array and any $D000 cells a scenario names.
//
// Setup mirrors objport.mjs / render-frame.mjs exactly (same asset shim, same
// warp-after-frame-1 rule) so the harnesses stay comparable; only the sampled
// vector differs.
//
// Usage: node tools/oracle/subsysport.mjs --level 6 --frames 240 --script "240:"

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));

globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) {
    return { ok: false, status: 404, json: async () => ({}),
             arrayBuffer: async () => new ArrayBuffer(0) };
  }
  const buf = fs.readFileSync(file);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () =>
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};

const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const { createState, cellIndex } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { resolveLoadout } = await imp('src/mods.js');
const { createSubsys } = await imp('src/conveyor.js');

const BTN = { A: 0x01, B: 0x02, R: 0x10, L: 0x20, U: 0x40, D: 0x80 };
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };

const frames = parseInt(arg('frames', '200'), 10);
const level = parseInt(arg('level', '6'), 10);
const outDir = path.join(ROOT, arg('out', 'rip/port'));
const tag = arg('tag', `L${String(level).padStart(2, '0')}`);
const script = arg('script', `${frames}:`);
const cells = (arg('cells', '') || '').split(';').filter(Boolean)
  .map((p) => p.split(',').map((v) => parseInt(v, 10)));

const timeline = [];
for (const seg of script.split(',')) {
  const [n, keys = ''] = seg.split(':');
  let mask = 0;
  for (const k of keys.trim()) mask |= BTN[k.toUpperCase()] || 0;
  for (let i = 0; i < parseInt(n, 10); i++) timeline.push(mask);
}

const state = createState(makeTunables(resolveLoadout([]).tunables));
state.loadout = resolveLoadout([]);
const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
await initLevel(state, level);

// The one piece of wiring src/level.js still owes this subsystem. initLevel
// clears $C736/$C73B/$C717/$C75B on the cartridge ($050D-$0516, $0EAB,
// sub_00_29C3), and until it does the same here the harness has to. Doing it
// HERE rather than lazily inside conveyor.js keeps the request visible: delete
// these three lines the day initLevel carries them.
state.subsys = createSubsys();
// $0EEA: `CP $06 / JR NZ` -- the track seed is a LEVEL-6 arm, not a general
// one. MEASURED: $FFCA/$FFCB/$FFC9 read 0 on the first gameplay frame of
// levels 4, 7, $0B, $0C and $0D, and $0700/0 on level 6. src/state.js seeds
// flow.parallaxTrack to $0700 unconditionally, which is wrong everywhere but
// level 6 -- see the wiring note in the report.
state.flow.parallaxTrack = level === 6 ? 0x0700 : 0x0000;   // $0F08-$0F0D
state.flow.conveyorDir = 0;               // $0F0F

const ammo = arg('ammo', null);
if (ammo !== null) state.flow.ammo = parseInt(ammo, 10) & 0xFF;

const warp = arg('warp', null);
function applyWarp() {
  if (warp === null) return;
  const [c, r] = warp.split(',').map((v) => parseInt(v, 10));
  state.player.x = ((c & 0xFF) << 8) | 0x80;
  if (!Number.isNaN(r)) state.player.y = (r & 0xFF) << 8;
}

const trace = [];
for (let f = 1; f <= frames; f++) {
  const held = timeline[Math.min(f - 1, timeline.length - 1)] ?? 0;
  state.input.pressed = held & ~state.input.prev;
  state.input.held = held;
  state.input.prev = held;
  tick(state, manifest, playerTiles);

  const p = state.player;
  const s = state.subsys;
  const r = s.rescue;
  const obj = [];
  for (let i = 0; i < 8; i++) for (let k = 0; k < 16; k++) obj.push(state.actors[i][k]);
  const cellBytes = [];
  for (const [c, row] of cells) {
    const i = cellIndex(c, row) * 2;
    cellBytes.push(state.level.cells[i] ?? 0, state.level.cells[i + 1] ?? 0);
  }
  trace.push({
    f,
    x: p.x, y: p.y, vx: p.vx & 0xFF, vy: p.vy & 0xFF, air: p.air,
    camX: state.camera.x, camY: state.camera.y, hp: p.hp,
    facing: p.facing, action: p.action, squat: p.squatTimer,
    atk: p.attackTimer, cling: p.clingLock,
    carryX: state.carry.x & 0xFF, carryY: state.carry.y & 0xFF,
    park: s.park, dir: state.flow.conveyorDir ?? 0,
    track: state.flow.parallaxTrack, plx: state.flow.parallaxScx ?? 0,
    seqTimer: s.seqTimer, spring: p.springArmed,
    cursor: s.cursor, respawns: s.respawns,
    cheat: state.flow.rescueCheat,
    // $C75B-$C762, in address order, so a diff names the real byte.
    drop: [r.state, state.flow.rescueCheat, r.prevCol,
           (r.x >> 8) & 0xFF, r.x & 0xFF, (r.y >> 8) & 0xFF, r.y & 0xFF, r.vy],
    obj, cells: cellBytes,
  });
  if (f === 1) applyWarp();
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `subsys_${tag}.json`),
                 JSON.stringify({ level, script, frames: trace }));
console.log(`level ${level}, ${frames} frames, script "${script}" -> ` +
            path.join(outDir, `subsys_${tag}.json`));
