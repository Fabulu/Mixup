// Progress-flow regression: the port's run bookkeeping against the ROM's.
//
// tools/oracle/regress.mjs compares a per-frame vector of player/camera/enemy
// fields. The two behaviours this covers -- a level clear moving $C753, and a
// death routing back to round select -- are invisible in that vector, and both
// END gameplay, after which the vector is meaningless. So this is the same
// idea in an event shape: tools/oracle/flowscen.py drives the real cartridge
// through one whole progress event and dumps where it landed; this replays the
// same event through the real port modules and diffs, memory against memory.
//
// The port side runs for real -- initLevel, tick(), player.js's own death
// sequence, main.js's afterDeath, level.js's clearLevel, roundselect.js's
// showRoundSelect and continueLevel. Nothing about the decision is
// re-implemented here except the two lines the browser frame loop would run
// around them (the async initLevel, which is a reload, not a rule).
//
// Usage: node tools/oracle/flowdiff.mjs [--only <name>] [--record]

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const only = arg('only', null);
const record = argv.includes('--record');

// --- browser-shaped asset loader, on the filesystem (as render-frame.mjs) ---
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
const { tick, afterDeath } = await imp('src/main.js');
const { showRoundSelect, continueLevel, ROUTE_LEVEL } = await imp('src/roundselect.js');
const { resolveLoadout } = await imp('src/mods.js');

// ---------------------------------------------------------------------------
// The corpus. Every entry is a permanent test.
//
// FRAME CAP: none of these is a per-frame comparison, so a lag frame ($C757)
// cannot skew what is compared -- which is exactly why they are shaped this
// way. flowscen.py counts $065C anyway and the count is printed, so a run that
// starts crossing lag frames is visible rather than silent. The cartridge-side
// cap is the EVENT: each recording stops the moment the ROM's own sequencer
// has landed (loc_00_361E, loc_00_2AAD or loc_00_0150) plus 90 settling
// frames, never on a frame number.
// ---------------------------------------------------------------------------
const SCENARIOS = [
  // --- a level clear updating $C753 ----------------------------------------
  // Boss 1. The route-0 bit goes up and the game returns to the MENU rather
  // than to a level -- and note $FFB5 stays 0 here, so no CONTINUE: clearing
  // a route and dying are different arrivals at the same screen.
  { name: 'l4-clear-sets-route-bit-0', event: 'clear', level: 4, mask: '00' },
  // Boss 2, from a clean mask: bit 1, not bit 0. Pins the bit-to-level map.
  { name: 'l8-clear-sets-route-bit-1', event: 'clear', level: 8, mask: '00' },
  // Boss 2 again with route 0 already cleared: SET is idempotent and the
  // cursor lands past the cleared route.
  { name: 'l8-clear-onto-existing-bit', event: 'clear', level: 8, mask: '01' },
  // Boss 3 completing the set. $361E sees $07 and skips the menu entirely:
  // $FFB0 = $0C, straight into loc_00_04BB. This is the only path that ever
  // reaches level 12.
  { name: 'l11-clear-completes-mask', event: 'clear', level: 11, mask: '03' },

  // --- a death routing back to round select --------------------------------
  // The headline: $FFB5 latches, a life is spent, and the game is at the menu
  // with CONTINUE drawn and preselected. `afterStart` then proves CONTINUE
  // ignores the route cursor and reloads the level you died on.
  { name: 'l3-death-to-round-select', event: 'death', level: 3, mask: '00',
    pressStart: true },
  // Same, with two routes already cleared: the death must not disturb $C753,
  // and the route cursor still has to skip the cleared ones.
  { name: 'l3-death-keeps-route-mask', event: 'death', level: 3, mask: '03',
    pressStart: true },
  // Dying ON a boss level: $0486-$0499 steps CONTINUE back one level, so
  // level 4 continues at level 3.
  { name: 'l4-death-continues-one-level-back', event: 'death', level: 4,
    mask: '00', pressStart: true },
  // The last life. $2ABA is `JP Z, loc_00_0150` -- the boot vector -- so the
  // whole run including cleared routes is wiped.
  { name: 'game-over-wipes-progress', event: 'death', level: 3, mask: '03',
    lives: 1 },
];

// The run state, compared wherever the event lands.
const RUN_FIELDS = ['screen', 'level', 'routeMask', 'continueAvailable',
                    'lives', 'hp'];
// Plus, ONLY when it lands on the menu, the menu's own state and the three
// BG cells the menu paints: $99CD (route marker), $9A04 (CONTINUE) and
// $9A0E (life count).
//
// These are deliberately NOT compared anywhere else. $C712 and $C713 are the
// round-select cursor and mode on that screen and something else entirely off
// it -- the clear sequencer's phase, a per-level scratch -- and the BG map is
// the level's or the title's, which the port does not model cell for cell.
// Comparing them off-menu reports five differences that are all just "this is
// not the round-select screen".
const MENU_FIELDS = ['cursor', 'mode', 'cursorTile', 'continueRow',
                     'livesDigit'];
// `hp` is bookkeeping on the death arm -- $0482 restores it from $FF8E when
// CONTINUE is taken -- but on the CLEAR arm loc_00_35E8 never touches it, and
// the cartridge spends ~630 frames finishing the fight and the fanfare with a
// live boss still swinging. Measured on l4-clear: the ROM arrives at the menu
// on 8 HP where the port, which raises the clear the frame the boss dies, is
// still on 10. That is the unmodelled fanfare (see checkLevelClear in
// src/main.js), not a bookkeeping difference, so it is not compared here.
const fieldsFor = (screen, s) => {
  const run = s.event === 'clear' ? RUN_FIELDS.filter((f) => f !== 'hp') : RUN_FIELDS;
  return screen === 'roundselect' ? [...run, ...MENU_FIELDS] : run;
};

const manifest = await loadManifest();
const playerTiles = await loadPlayerTiles();
const loadout = resolveLoadout([]);

/** A blank 32x32 BG map, so showRoundSelect's paints are observable. */
const stubArt = () => ({ bgMap: new Uint8Array(0x400), tiles: null,
                         vram: new Uint8Array(0x2000) });

/**
 * Read back the same bytes flowscen.py samples from the cartridge.
 * $99CD is the route marker, $9A04 the CONTINUE line, $9A0E the life count.
 */
function sampleMenu(state, screen) {
  const map = state.video.bgMap;
  const cell = (a) => (map ? map[a - 0x9800] : 0);
  return {
    screen,
    level: state.level.number,
    routeMask: state.flow.routeMask,
    continueAvailable: state.flow.continueAvailable,
    lives: state.flow.lives,
    cursor: state.roundSelect ? state.roundSelect.cursor : 0,
    mode: state.roundSelect ? state.roundSelect.mode : 0,
    hp: state.player.hp,
    cursorTile: cell(0x99CD),
    continueRow: Array.from({ length: 8 }, (_, i) => cell(0x9A04 + i)),
    livesDigit: cell(0x9A0E),
  };
}

/** The frame loop's own reload, minus the canvas. */
async function loadLevelInto(state, n) {
  await initLevel(state, n);
}

async function runPort(s) {
  const state = createState(makeTunables());
  state.loadout = loadout;
  await initLevel(state, s.level);
  state.flow.routeMask = parseInt(s.mask, 16);
  if (s.lives !== undefined) state.flow.lives = s.lives;

  let landed = null;
  if (s.event === 'clear') {
    // The port has no boss fight to win headlessly, and the enemy driver does
    // not carry 1:$4EE0's arm anyway -- so raise the same request main.js's
    // checkLevelClear raises when it sees a dead boss, and let the real
    // clearLevel decide. The cartridge side kills the boss for real.
    const next = clearLevel(state);
    if (next.to === 'level') {
      await loadLevelInto(state, next.level);
      landed = sampleMenu(state, 'level');
    } else if (next.to === 'roundselect') {
      showRoundSelect(state, stubArt());
      landed = sampleMenu(state, 'roundselect');
    } else {
      landed = sampleMenu(state, next.to);
    }
  } else {
    // A real death: drop HP and let player.js run its own sequence until the
    // frame loop's respawn request comes back.
    let gameOversBefore = state.flow.gameOver || 0;
    state.player.hp = 0;
    let guard = 0;
    while (!state.flow.respawnPending && guard++ < 4000) {
      tick(state, manifest, playerTiles);
    }
    if (!state.flow.respawnPending) throw new Error('port never died');
    state.flow.respawnPending = false;
    const wasGameOver = (state.flow.gameOver || 0) !== gameOversBefore;
    if (afterDeath(state, wasGameOver) === 'gameover') {
      // main.js reloads level 1 and shows the title.
      await loadLevelInto(state, 1);
      landed = sampleMenu(state, 'title');
    } else {
      showRoundSelect(state, stubArt());
      landed = sampleMenu(state, 'roundselect');
    }
  }

  let pressed = null;
  if (s.pressStart) {
    const chosen = state.roundSelect && state.roundSelect.mode === 1
      ? continueLevel(state)
      : (ROUTE_LEVEL[state.roundSelect ? state.roundSelect.cursor : 0] ?? 12);
    state.roundSelect = null;
    state.video.bgMap = null;
    await loadLevelInto(state, chosen);
    pressed = sampleMenu(state, 'level');
  }
  return { end: landed, afterStart: pressed };
}

// ---------------------------------------------------------------------------
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const rows = [];
for (const s of SCENARIOS) {
  if (only && s.name !== only) continue;
  const out = path.join('rip/oracle/flow', s.name + '.json');
  const abs = path.join(ROOT, out);
  if (record || !fs.existsSync(abs)) {
    process.stderr.write('recording ' + s.name + ' ... ');
    execFileSync('python', ['tools/oracle/flowscen.py',
                            '--event', s.event, '--level', String(s.level),
                            '--mask', s.mask, '--out', out,
                            ...(s.lives !== undefined ? ['--lives', String(s.lives)] : []),
                            ...(s.pressStart ? ['--press-start'] : [])],
                 { cwd: ROOT, encoding: 'utf8' });
    process.stderr.write('done\n');
  }
  const oracle = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const port = await runPort(s);

  const bad = [];
  for (const f of fieldsFor(oracle.end.screen, s)) {
    if (!eq(oracle.end[f], port.end[f])) {
      bad.push(`end.${f}: rom ${JSON.stringify(oracle.end[f])}, ` +
               `port ${JSON.stringify(port.end[f])}`);
    }
  }
  if (oracle.afterStart) {
    for (const f of fieldsFor(oracle.afterStart.screen, s)) {
      if (!eq(oracle.afterStart[f], port.afterStart[f])) {
        bad.push(`afterStart.${f}: rom ${JSON.stringify(oracle.afterStart[f])}, ` +
                 `port ${JSON.stringify(port.afterStart[f])}`);
      }
    }
  }
  rows.push({ name: s.name, bad, lag: oracle.lagFrames });
}

const NAMEW = Math.max(20, ...rows.map((r) => r.name.length + 1));
console.log('\n' + 'scenario'.padEnd(NAMEW) + 'lag  verdict');
for (const r of rows) {
  console.log(r.name.padEnd(NAMEW) + String(r.lag).padStart(3) + '  ' +
              (r.bad.length ? 'FAIL' : 'ok'));
}
const failed = rows.filter((r) => r.bad.length);
for (const r of failed) {
  console.log('\n' + r.name + ':');
  for (const b of r.bad) console.log('  ' + b);
}
console.log('\n' + (failed.length
  ? 'REGRESSION: the port disagrees with the ROM on run bookkeeping'
  : `PASS - ${rows.length}/${rows.length} progress-flow scenarios match the ROM`));
process.exit(failed.length ? 1 : 0);
