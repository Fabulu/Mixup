// Death-sequence regression: the port's two death sequences against the ROM's.
//
// tools/oracle/regress.mjs compares a per-frame vector of player/camera/enemy
// fields, and tools/oracle/flowdiff.mjs compares where a run BOOKKEEPS to. This
// is the third shape and it is the one both death sequences need: a long
// scripted animation whose only interesting properties are WHEN each of its
// landmarks happens and WHAT memory it leaves behind on the way.
//
// tools/oracle/deathscen.py drives the real cartridge through one whole
// sequence and dumps its landmarks, its $C693 pool contents at every explosion
// and its $C1C0 records at checkpoints; this replays the same event through the
// real port modules and diffs, memory against memory.
//
// EVENT-CAPPED, like flowscen.py: the recording stops when the ROM's own
// sequencer lands (loc_00_361E for a boss, loc_00_2AAD for the player), never
// on a frame number, and the port side stops on the same two events.
//
// LAG ($C757, out of scope by docs/03-VERIFICATION.md 28) cannot skew this:
//   * the BOSS countdown sits behind 1:$4E39's gate, so each lag frame stalls
//     it exactly one frame. deathscen.py hooks 1:$4E3F -- the gate's own skip
//     target -- and records the stall count at every landmark, so the spans
//     compared below are differences with a MEASURED stall count subtracted,
//     not a frame number that happens to have been lag-free.
//   * the PLAYER burst has no $C757 test anywhere in its path, and the frame
//     counter on both sides counts main-loop ITERATIONS. Its spans are raw.
// Both counts are printed either way, so a run that starts lagging is visible
// rather than silent.
//
// Usage: node tools/oracle/deathdiff.mjs [--only <name>] [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const record = argv.includes('--record');
const verbose = argv.includes('--verbose');

// --- browser-shaped asset loader, on the filesystem (as flowdiff.mjs) -------
globalThis.fetch = async (url) => {
  const rel = String(url).replace(/^.*?assets\//, 'assets/');
  const file = path.join(ROOT, rel);
  if (!fs.existsSync(file)) return { ok: false, status: 404 };
  const buf = fs.readFileSync(file);
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buf.toString('utf8')),
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  };
};
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel, clearLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { effects, updateVictoryHold } = await imp('src/effects.js');
const { ensureDoorState } = await imp('src/doors.js');
const { resolveLoadout } = await imp('src/mods.js');

// ---------------------------------------------------------------------------
// The corpus. Every entry is a permanent test.
//
// The boss scenarios cover all three ARMS of loc_01_7936's per-boss dispatch
// that the shipped levels can reach, because the arm decides which pose table
// is read and which metasprite table it is read through:
//   level 4   state $0A, $C73E 1 -> loc_01_79A2 with 1:$7A1D via sub_00_0BAF
//   level 8   state $07, $C73E 2 -> loc_01_79A2 with 1:$7A2D via sub_00_0BC6
//   level 11  state $08, $C73E 3 -> the DEFAULT arm, 1:$7A3D, and the only arm
//                                   that blinks on $FFB1 bit 3
// and all three route bits, so the fanfare's $35E8 dispatch is covered too.
//
// The player scenarios are three different levels because the burst is a fixed
// script: if any of them differed, the sequence would be reading state it must
// not be reading.
// ---------------------------------------------------------------------------
const SCENARIOS = [
  { name: 'l4-boss1-death-to-route-bit-0', event: 'boss', level: 4, mask: '00' },
  { name: 'l8-boss2-death-to-route-bit-1', event: 'boss', level: 8, mask: '00' },
  { name: 'l11-boss3-death-completes-mask', event: 'boss', level: 11, mask: '03' },

  { name: 'l3-player-death-452-frames', event: 'player', level: 3, mask: '00' },
  { name: 'l1-player-death-452-frames', event: 'player', level: 1, mask: '00' },
  { name: 'l4-player-death-452-frames', event: 'player', level: 4, mask: '00' },
];

const POKE_AT = 40;
const GUARD = 2000;

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const loadout = resolveLoadout([]);

const arrEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const live = (pool) => pool.filter((r) => r[0] !== 0).map((r) => Array.from(r));

/**
 * One port frame, in the main loop's own order. The only thing here that is
 * not already main.js's `tick` is updateVictoryHold, which is the one call
 * site the fanfare needs and which main.js does not carry yet (see REPORT).
 */
function portFrame(state) {
  if (updateVictoryHold(state)) return;   // loc_00_3566 / $35D0 block the loop
  tick(state, manifest, playerTiles);
}

async function runBoss(s) {
  const state = createState(makeTunables());
  state.loadout = loadout;
  await initLevel(state, s.level);
  state.flow.routeMask = parseInt(s.mask, 16);

  const e = effects(state);
  const pool = ensureDoorState(state).effects;
  const out = { timeline: {}, explosions: [], end: {} };
  const mark = (k, n) => { if (!(k in out.timeline)) out.timeline[k] = n; };

  let seenC740 = 0xFF, seenC713 = 0, seenPhase = 0, poked = false;
  let bossHpWas = null;
  for (let n = 1; n <= GUARD; n++) {
    if (!poked && n > POKE_AT) {
      poked = true;
      bossHpWas = state.enemies[0][0x16];
      state.enemies[0][0x16] = 0;         // the same 1:$4E82 trigger
    }
    portFrame(state);

    if (e.countdown !== 0xFF && seenC740 === 0xFF) mark('countdownArmed', n);
    if (e.countdown === 0 && seenC740 !== 0) mark('countdownZero', n);
    seenC740 = e.countdown;

    if (e.explosion > seenC713) {          // $C713 only ever counts UP here
      const l = live(pool);
      out.explosions.push({ index: seenC713, frame: n, countdown: e.countdown,
                            pool: l, spawned: l.find((r) => r[0] === 0x10) ?? null });
      seenC713 = e.explosion;
    }
    if (e.phase !== seenPhase) {
      if (e.phase === 1) mark('fanfarePhase1', n);
      if (e.phase === 2) mark('fanfarePhase2', n);
      if (e.phase === 3) mark('fanfarePhase3', n);
      seenPhase = e.phase;
    }
    if (e.windowRamp !== 0x90) mark('windowRampStart', n);
    if (e.windowRamp === 0x32) mark('windowRampEnd', n);

    if (state.flow.levelCleared === 1) { mark('routeWrite', n); break; }
  }
  if (!('routeWrite' in out.timeline)) throw new Error('port never cleared the level');

  // main.js's step() consumes the latch and lets level.js route it -- the same
  // two lines flowdiff.mjs runs, and the ROM's own loc_00_35E8.
  state.flow.levelCleared = 2;
  const next = clearLevel(state);
  out.end = {
    routeMask: state.flow.routeMask, countdown: e.countdown,
    bossId: state.level.bossId, lives: state.flow.lives,
    continueAvailable: state.flow.continueAvailable,
    pool: live(pool), to: next.to,
  };
  out.bossHpWas = bossHpWas;
  return out;
}

async function runPlayer(s) {
  const state = createState(makeTunables());
  state.loadout = loadout;
  await initLevel(state, s.level);
  state.flow.routeMask = parseInt(s.mask, 16);

  const e = effects(state);
  const out = { timeline: {}, checkpoints: {}, armFrames: new Array(8).fill(null),
                parkFrames: new Array(8).fill(null), end: {} };
  const mark = (k, n) => { if (!(k in out.timeline)) out.timeline[k] = n; };
  const snap = () => e.burst.map((r) => Array.from(r));

  let poked = false, seeded = false;
  const flags = new Array(8).fill(0);
  for (let n = 1; n <= GUARD; n++) {
    if (!poked && n > POKE_AT) { poked = true; state.player.hp = 0; }
    portFrame(state);

    if (!seeded && state.player.dead) {
      seeded = true;
      mark('burstSeeded', n);
      out.checkpoints[String(n)] = snap();
    }
    if (seeded) {
      const b = e.burst;
      for (let i = 0; i < 8; i++) {
        if (b[i][0] !== 0 && flags[i] === 0) out.armFrames[i] = n;
        if ((b[i][0] & 1) && !(flags[i] & 1)) out.parkFrames[i] = n;
        flags[i] = b[i][0];
      }
      if (n % 64 === 0) out.checkpoints[String(n)] = snap();
    }
    if (state.flow.respawnPending) { mark('handoff', n); break; }
  }
  if (!('handoff' in out.timeline)) throw new Error('port never reached the handoff');

  out.end = { lives: state.flow.lives, burst: snap(),
              gameOver: state.flow.gameOver || 0 };
  return out;
}

// ---------------------------------------------------------------------------
/** Boss spans, with the ROM's MEASURED driver stalls subtracted. */
function bossSpans(tl, stalls) {
  const span = (a, b) => (a in tl && b in tl
    ? (tl[b] - tl[a]) - ((stalls ? stalls[b] - stalls[a] : 0))
    : null);
  return {
    countdown: span('countdownArmed', 'countdownZero'),
    phase1: span('countdownZero', 'fanfarePhase2'),
    toPhase3Byte: span('fanfarePhase2', 'fanfarePhase3'),
    toRamp: span('fanfarePhase3', 'windowRampStart'),
    ramp: span('windowRampStart', 'windowRampEnd'),
    toClear: span('windowRampEnd', 'routeWrite'),
    total: span('countdownArmed', 'routeWrite'),
  };
}

const rows = [];
for (const s of SCENARIOS) {
  if (only && s.name !== only) continue;
  const out = path.join('rip/oracle/death', s.name + '.json');
  const abs = path.join(ROOT, out);
  if (record || !fs.existsSync(abs)) {
    process.stderr.write('recording ' + s.name + ' ... ');
    execFileSync('python', ['tools/oracle/deathscen.py',
                            '--event', s.event, '--level', String(s.level),
                            '--mask', s.mask, '--poke-at', String(POKE_AT),
                            '--out', out],
                 { cwd: ROOT, encoding: 'utf8' });
    process.stderr.write('done\n');
  }
  const rom = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const port = s.event === 'boss' ? await runBoss(s) : await runPlayer(s);
  const bad = [];
  const cmp = (label, a, b) => { if (!arrEq(a, b)) bad.push(
    `${label}: rom ${JSON.stringify(a)}, port ${JSON.stringify(b)}`); };

  if (s.event === 'boss') {
    // The boss HP the recorder found is what the port must have too -- if they
    // disagree the two runs are not the same fight and nothing below means
    // anything.
    cmp('bossHp', rom.bossHpWas, port.bossHpWas);
    const rs = bossSpans(rom.timeline, rom.stalls);
    const ps = bossSpans(port.timeline, null);
    for (const k of Object.keys(rs)) cmp('span.' + k, rs[k], ps[k]);
    // The 16 scripted explosions, as the $C693 records the ROM actually wrote.
    cmp('explosionCount', rom.explosions.length, port.explosions.length);
    const nE = Math.min(rom.explosions.length, port.explosions.length);
    for (let i = 0; i < nE; i++) {
      cmp(`explosion[${i}].countdown`, rom.explosions[i].countdown,
          port.explosions[i].countdown);
      // The record the countdown itself wrote -- see deathscen.py's note on
      // why the rest of the live pool is not compared.
      cmp(`explosion[${i}].spawned`, rom.explosions[i].spawned,
          port.explosions[i].spawned);
      // Frames, stall-corrected against the first explosion.
      const rf = (rom.explosions[i].frame - rom.explosions[0].frame)
               - (rom.explosions[i].stalls - rom.explosions[0].stalls);
      const pf = port.explosions[i].frame - port.explosions[0].frame;
      cmp(`explosion[${i}].frameOffset`, rf, pf);
    }
    for (const k of ['routeMask', 'countdown', 'bossId']) {
      cmp('end.' + k, rom.end[k], port.end[k]);
    }
    cmp('end.pool', rom.end.pool, port.end.pool);
  } else {
    cmp('span.seedToHandoff', rom.spans.seedToHandoff,
        port.timeline.handoff - port.timeline.burstSeeded);
    // The staggered warm-up, relative to the seed so the two sides do not have
    // to have died on the same absolute frame.
    const rel = (tl, a) => (a === null ? null : a - tl.burstSeeded);
    cmp('armFrames', rom.armFrames.map((f) => rel(rom.timeline, f)),
        port.armFrames.map((f) => rel(port.timeline, f)));
    cmp('parkFrames', rom.parkFrames.map((f) => rel(rom.timeline, f)),
        port.parkFrames.map((f) => rel(port.timeline, f)));
    // Full 8 x 5 records at every 64th frame, plus the seed.
    for (const k of Object.keys(rom.checkpoints)) {
      const rk = Number(k) - rom.timeline.burstSeeded;
      const pk = String(rk + port.timeline.burstSeeded);
      if (!(pk in port.checkpoints)) continue;
      cmp(`burst@+${rk}`, rom.checkpoints[k], port.checkpoints[pk]);
    }
    cmp('end.burst', rom.end.burst, port.end.burst);
    cmp('end.lives', rom.end.lives, port.end.lives);
  }
  rows.push({ name: s.name, bad, lag: rom.lagFrames, stalls: rom.driverStalls });
  if (verbose) {
    console.log(s.name, JSON.stringify(s.event === 'boss'
      ? { rom: bossSpans(rom.timeline, rom.stalls), port: bossSpans(port.timeline, null) }
      : { rom: rom.timeline, port: port.timeline }));
  }
}

const NAMEW = Math.max(24, ...rows.map((r) => r.name.length + 1));
console.log('\n' + 'scenario'.padEnd(NAMEW) + 'lag stall  verdict');
for (const r of rows) {
  console.log(r.name.padEnd(NAMEW) + String(r.lag).padStart(3)
              + String(r.stalls).padStart(6) + '  ' + (r.bad.length ? 'FAIL' : 'ok'));
}
const failed = rows.filter((r) => r.bad.length);
for (const r of failed) {
  console.log('\n' + r.name + ':');
  for (const b of r.bad.slice(0, 24)) console.log('  ' + b);
  if (r.bad.length > 24) console.log(`  ... and ${r.bad.length - 24} more`);
}
console.log('\n' + (failed.length
  ? 'REGRESSION: the port disagrees with the ROM on a death sequence'
  : `PASS - ${rows.length}/${rows.length} death scenarios match the ROM`));
process.exit(failed.length ? 1 : 0);
