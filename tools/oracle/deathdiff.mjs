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
// THE PICTURE, for the boss scenarios. Timing alone would let a STAGE CLEAR
// screen that is 632 frames of nothing pass, so tools/oracle/stageclear.py
// records the cartridge's whole $8000-$9FFF either side of the fanfare and this
// rebuilds the difference from assets/manifest.json -- the same "find the
// ingredients, replay them, diff" shape titlediff.mjs uses. Three checks, and
// they fail independently on purpose:
//   vram.replay   the cartridge's PRE-fanfare image + the ported mechanisms
//                 must equal its POST-fanfare image, all 8192 bytes
//   vram.spans    the manifest alone, on a blank image, over the 836 bytes the
//                 fanfare writes -- so a wrong table cannot hide under a seed
//   picture.*     the RUNTIME path: the decoded tile cache and the $9C00 map
//                 the renderer is actually handed, plus the $35B2 registers and
//                 the whole phase-3 register stream, transition by transition
//
// Usage: node tools/oracle/deathdiff.mjs [--only <name>] [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, imp, installFetchShim } from './_env.mjs';

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const record = argv.includes('--record');
const verbose = argv.includes('--verbose');

// --- browser-shaped asset loader, on the filesystem (as flowdiff.mjs) -------
installFetchShim();

const { createState } = await imp('src/state.js');
const { makeTunables } = await imp('src/tunables.js');
const { initLevel, clearLevel } = await imp('src/level.js');
const { loadManifest, loadPlayerTiles } = await imp('src/assets.js');
const { tick } = await imp('src/main.js');
const { effects, updateVictoryHold, applyStageClearVram } = await imp('src/effects.js');
const { decodeTile } = await imp('src/assets.js');
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
  { name: 'l4-boss1-death-to-route-bit-0', event: 'boss', level: 4, mask: '00', vram: true },
  { name: 'l8-boss2-death-to-route-bit-1', event: 'boss', level: 8, mask: '00', vram: true },
  { name: 'l11-boss3-death-completes-mask', event: 'boss', level: 11, mask: '03', vram: true },

  { name: 'l3-player-death-452-frames', event: 'player', level: 3, mask: '00' },
  { name: 'l1-player-death-452-frames', event: 'player', level: 1, mask: '00' },
  { name: 'l4-player-death-452-frames', event: 'player', level: 4, mask: '00' },
];

const POKE_AT = 40;
const GUARD = 2000;

// The port driver's kill lands one iteration LATER than deathscen.py's.
//
// Both harnesses count "frames" from their own start line and both poke at 40,
// but they do not agree on which cartridge iteration frame 1 is: deathscen.py
// takes base = ctr['n'] at the start line, after boot_to_gameplay, and the port
// counts from its first tick() after initLevel. The two are one iteration out of
// phase -- the same lag-1 relationship tools/oracle/deathpix.mjs measures and
// documents at length ("the panel shows iteration N's work during N+1").
//
// It never mattered until the GAME OVER burst was moved to its real call sites.
// sub_00_29E7 is TWO routines behind one address: with $C715 == 0 it SEEDS and
// RETs without ticking, and only with $C715 != 0 does it fall to loc_00_2A0D and
// tick. So whether the burst advances on the frame the player dies depends on
// which side of the player update the call sits, i.e. on $FFA7:
//
//   MEASURED on the cartridge, level 3, by running deathscen.py itself at four
//   consecutive pokes and reading burstSeeded / seedParity / armFrames[0]:
//     poke 39 -> seed f40, $FFA7 = 1, slot 0 armed f40 (seed+0)
//     poke 40 -> seed f41, $FFA7 = 0, slot 0 armed f42 (seed+1)
//     poke 41 -> seed f42, $FFA7 = 1, slot 0 armed f42 (seed+0)
//     poke 42 -> seed f43, $FFA7 = 0, slot 0 armed f44 (seed+1)
//   i.e. $FFA7 = 1 on the seed frame means $05EC runs AFTER $05BD, the burst
//   gets its 8 ticks that same frame and slot 0 arms immediately; $FFA7 = 0
//   means $057A already ran BEFORE $05BD, so the seed frame does not tick and
//   slot 0 arms on the next one.
//
// The recording on disk is POKE_AT = 40, and it carries seedParity 0 with
// armFrames starting at seed+1 -- the second line of that table. The port must
// therefore seed on a parity-0 frame too, or the two runs are comparing
// different cartridge behaviours. The old port drove the burst from the head of
// updatePlayer, which is parity-blind, and the skew was invisible.
//
// (An earlier version of this block had the parity of each poke the wrong way
// round and called the recording "the second of those" while quoting the first
// line's poke. The constant it justifies was right; the evidence was not.)
//
// seedParity is compared as a field below, so this stays honest: if the phase
// ever moves again the run says so instead of quietly re-aligning.
const POKE_PHASE = 1;

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const loadout = resolveLoadout([]);

const arrEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const live = (pool) => pool.filter((r) => r[0] !== 0).map((r) => Array.from(r));

/**
 * The RUNTIME picture, as the renderer would read it: the 46 decoded BG tiles
 * loc_00_350F streamed and the $9C00 window map loc_00_3566's scripts painted,
 * plus the window registers the $35B2 program set. Deliberately not a replay of
 * the manifest -- that is what applyStageClearVram is checked for separately.
 */
function snapPicture(state, e) {
  const bg = state.level.tiles && state.level.tiles.bg;
  return {
    map: e.art ? Array.from(e.art.map) : null,
    scripted: e.art ? e.art.scripted : 0,
    bg: bg ? Array.from({ length: 46 },
                        (_, k) => Array.from(bg[0x80 + k])) : null,
    mapIsLive: !!(e.art && state.video.windowMap === e.art.map),
    windowEndY: state.video.windowEndY,
    windowY: state.video.windowY,
    windowX: state.video.windowX,
  };
}

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
  const out = { timeline: {}, explosions: [], end: {}, samples: [] };
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
    if (e.windowRamp === 0x32 && !('windowRampEnd' in out.timeline)) {
      mark('windowRampEnd', n);
      // The cartridge's own snapshot point: loc_00_35D8, the frame the ramp
      // finishes on. Everything the fanfare draws is on screen and nothing
      // moves again until $35E8 (MEASURED: 8192/8192 identical between them).
      out.picture = snapPicture(state, e);
    }

    // The picture's register stream, from loc_00_34D0's first frame on. Same
    // fields tools/oracle/stageclear.py samples at $0A4F, same order.
    if (e.phase !== 0 || e.stage >= 0) {
      out.samples.push({ frame: n, FFAC: e.windowRamp, rLYC: e.windowLyc,
                         FFC7: state.raster.mode, C712: e.phase,
                         FFAD: state.video.bgp, FFAE: state.video.obp0,
                         FFAF: state.video.obp1 });
    }

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
    // POKE_PHASE, and it is not a fudge factor -- see the note beside its
    // definition. The kill has to land on the same $FFA7 PARITY as the ROM
    // recording's, because the cartridge's own burst behaviour depends on it.
    if (!poked && n > POKE_AT + POKE_PHASE) { poked = true; state.player.hp = 0; }
    // $FFA7 as $056E/$05D9 read it for THIS iteration. main.js flips
    // state.parity at the END of tick(), so it has to be sampled before the
    // call, not after.
    const parityIn = state.parity & 1;
    portFrame(state);

    if (!seeded && state.player.dead) {
      seeded = true;
      mark('burstSeeded', n);
      out.seedParity = parityIn;
      out.checkpoints[String(n)] = snap();
    }
    if (seeded) {
      const b = e.burst;
      for (let i = 0; i < 8; i++) {
        if (b[i][0] !== 0 && flags[i] === 0) out.armFrames[i] = n;
        if ((b[i][0] & 1) && !(flags[i] & 1)) out.parkFrames[i] = n;
        flags[i] = b[i][0];
      }
      // EVERY frame, not `n % 64 === 0`. The ROM records at ITS OWN
      // `idx % 64 === 0`, and the comparison below maps a rom key to a port key
      // by re-basing on each side's seed frame. The two seeds do not have to
      // coincide -- POKE_PHASE deliberately makes them differ by one -- so an
      // absolute `n % 64` port key landed one short of every mapped key and the
      // lookup missed 7 of the 8 checkpoints, silently. Snapshotting every
      // frame makes the mapped key exist whatever the phase is; 452 frames of
      // an 8 x 5 record is nothing, and these checkpoints are the only thing
      // here that checks the burst's mid-flight trajectory at all.
      out.checkpoints[String(n)] = snap();
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

// ---------------------------------------------------------------------------
// The PICTURE. tools/oracle/stageclear.py records the cartridge's whole VRAM
// either side of the fanfare; this rebuilds the fanfare's contribution from
// assets/manifest.json and diffs it, the same shape titlediff.mjs uses.
//
// MEASURED (level 4): between loc_00_34D0's first frame and loc_00_35D8 the
// cartridge changes 802 bytes, every one inside $8800-$8ADF or $9C00-$9C93,
// and nothing at all changes between $35D8 and $35E8. So the fanfare's own
// footprint is exactly the spans below, and seeding a replay with the BEFORE
// image has to reproduce the AFTER image in all 8192 bytes.
const TILE_SPAN = [0x0800, 0x0ADF];          // $8800-$8ADF, the 23 blocks
const MAP_ROWS = [0, 1, 2, 3, 4];            // $9C00/$20/$40/$60/$80
const MAP_COLS = 20;                         // each script record is $14 long
const MAP_BASE = 0x1C00;

function stageClearRef(level) {
  const out = path.join('rip/oracle', `stageclear-l${level}.json`);
  const abs = path.join(ROOT, out);
  if (record || !fs.existsSync(abs)) {
    process.stderr.write(`recording stage-clear VRAM, level ${level} ... `);
    execFileSync('python', ['tools/oracle/stageclear.py', '--level', String(level),
                            '--poke-at', String(POKE_AT), '--out', out],
                 { cwd: ROOT, encoding: 'utf8' });
    process.stderr.write('done\n');
  }
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

/** Only the bytes the fanfare itself writes, as flat indices into $8000. */
function footprint() {
  const idx = [];
  for (let i = TILE_SPAN[0]; i <= TILE_SPAN[1]; i++) idx.push(i);
  for (const r of MAP_ROWS) for (let c = 0; c < MAP_COLS; c++) idx.push(MAP_BASE + r * 32 + c);
  return idx;
}

function vramCheck(s, port, cmp, bytes) {
  const ref = stageClearRef(s.level);
  const want = Uint8Array.from(ref.snaps.hold.vram);
  const before = Uint8Array.from(ref.snaps.before.vram);

  // 1. REPLAY. Seed with the cartridge's own pre-fanfare VRAM (the level's
  //    streamed tilemap is not modelled by the port at all) and let the ported
  //    mechanisms write over it. Every one of the 8192 bytes must agree.
  const replay = applyStageClearVram(before.slice(), manifest.tables);
  let bad = 0, first = -1;
  for (let i = 0; i < 0x2000; i++) {
    if (replay[i] !== want[i]) { bad++; if (first < 0) first = i; }
  }
  bytes.replay = [0x2000 - bad, 0x2000];
  if (bad) {
    cmp('vram.replay', `8192/8192`, `${0x2000 - bad}/8192, first at `
        + `$${(0x8000 + first).toString(16)}`);
  }

  // 2. The manifest ALONE, with no capture underneath it: build onto a blank
  //    image and check the spans the fanfare writes. This is the part that
  //    would still fail if the exported tables were wrong but the seed hid it.
  const blank = applyStageClearVram(new Uint8Array(0x2000), manifest.tables);
  const idx = footprint();
  let sbad = 0, sfirst = -1;
  for (const i of idx) {
    if (blank[i] !== want[i]) { sbad++; if (sfirst < 0) sfirst = i; }
  }
  bytes.spans = [idx.length - sbad, idx.length];
  if (sbad) {
    cmp('vram.spans', `${idx.length}/${idx.length}`,
        `${idx.length - sbad}/${idx.length}, first at $${(0x8000 + sfirst).toString(16)}`);
  }

  // 3. The RUNTIME path -- what the renderer is actually handed. The tile cache
  //    is decoded, so it is compared against the cartridge's VRAM decoded the
  //    same way; the window map is compared raw.
  const pic = port.picture;
  if (!pic) { cmp('picture', 'present', 'the port never reached the hold'); return; }
  cmp('picture.scriptsRun', 2, pic.scripted);
  cmp('picture.mapIsLive', true, pic.mapIsLive);
  let tbad = 0;
  for (let k = 0; k < 46; k++) {
    const romTile = Array.from(decodeTile(want, 0x8800 + k * 16));
    if (!arrEq(romTile, pic.bg[k])) { tbad++; if (tbad === 1) cmp(`picture.tile[$${(0x80 + k).toString(16)}]`, romTile, pic.bg[k]); }
  }
  if (tbad > 1) cmp('picture.tilesWrong', 0, tbad);
  let mbad = 0;
  for (const r of MAP_ROWS) {
    for (let c = 0; c < MAP_COLS; c++) {
      const a = want[MAP_BASE + r * 32 + c], b = pic.map[r * 32 + c];
      if (a !== b) { mbad++; if (mbad === 1) cmp(`picture.map[${r}][${c}]`, a, b); }
    }
  }
  if (mbad > 1) cmp('picture.mapCellsWrong', 0, mbad);

  // 4. The $35B2 program's registers, at the cartridge's own $35D8 snapshot.
  const hr = ref.snaps.hold.regs;
  cmp('picture.rWY', hr.FFAC, pic.windowY);
  cmp('picture.rWX', hr.FFAB, pic.windowX);
  cmp('picture.windowEndY', hr.rLYC, pic.windowEndY);

  // 5. The whole register stream of phase 3, transition by transition, aligned
  //    on the frame $C712 becomes 3 so neither side has to know the other's
  //    absolute frame numbering. loc_00_3566 and loc_00_35D0 never return to
  //    the main loop, so no driver stall can grow inside this window -- the
  //    recording's own `stalls` column is asserted flat below.
  const romPhase3 = ref.samples.filter((x) => x.C712 === 3);
  const portPhase3 = port.samples.filter((x) => x.C712 === 3);
  if (!romPhase3.length || !portPhase3.length) {
    cmp('picture.phase3Samples', romPhase3.length, portPhase3.length);
    return;
  }
  cmp('picture.stallsFlat', true,
      romPhase3[0].stalls === romPhase3[romPhase3.length - 1].stalls);
  const trans = (list, keys) => {
    const o = []; let prev = null;
    for (const x of list) {
      const k = keys.map((f) => x[f]);
      if (!prev || !arrEq(prev, k)) { o.push([x.frame - list[0].frame, ...k]); prev = k; }
    }
    return o;
  };
  const KEYS = ['FFAC', 'rLYC', 'FFC7', 'FFAD', 'FFAE', 'FFAF'];
  cmp('picture.registerStream', trans(romPhase3, KEYS), trans(portPhase3, KEYS));
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
  const bytes = {};
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
    if (s.vram) vramCheck(s, port, cmp, bytes);
  } else {
    // FIRST, because everything below it is meaningless if it fails: the two
    // runs must have killed the player on the same $FFA7 parity. sub_00_29E7
    // seeds without ticking and only ticks once $C715 is set, so the seed frame
    // itself advances the burst on one parity and not the other -- see
    // POKE_PHASE. A recording made on one parity compared against a run on the
    // other is off by a frame everywhere and nothing else here would say why.
    cmp('seedParity', rom.seedParity, port.seedParity);
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
      // A missing key is a FAILURE, not a skip. It used to `continue`, which is
      // how the phase change above went unnoticed: 7 of the 8 checkpoints
      // stopped being compared and the stage still reported ok.
      if (!(pk in port.checkpoints)) {
        cmp(`burst@+${rk}`, rom.checkpoints[k],
            `MISSING port checkpoint at frame ${pk} (rom frame ${k}) -- the `
            + 'port never recorded it, so this burst frame went unchecked');
        continue;
      }
      cmp(`burst@+${rk}`, rom.checkpoints[k], port.checkpoints[pk]);
    }
    cmp('end.burst', rom.end.burst, port.end.burst);
    cmp('end.lives', rom.end.lives, port.end.lives);
  }
  rows.push({ name: s.name, bad, bytes, lag: rom.lagFrames, stalls: rom.driverStalls });
  if (verbose) {
    console.log(s.name, JSON.stringify(s.event === 'boss'
      ? { rom: bossSpans(rom.timeline, rom.stalls), port: bossSpans(port.timeline, null) }
      : { rom: rom.timeline, port: port.timeline }));
  }
}

const NAMEW = Math.max(24, ...rows.map((r) => r.name.length + 1));
console.log('\n' + 'scenario'.padEnd(NAMEW) + 'lag stall  VRAM replay      spans  verdict');
for (const r of rows) {
  const f = (p) => (p ? `${p[0]}/${p[1]}`.padStart(11) : ''.padStart(11));
  console.log(r.name.padEnd(NAMEW) + String(r.lag).padStart(3)
              + String(r.stalls).padStart(6) + f(r.bytes.replay) + f(r.bytes.spans)
              + '  ' + (r.bad.length ? 'FAIL' : 'ok'));
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
