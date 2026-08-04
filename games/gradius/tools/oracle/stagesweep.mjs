// THE STAGE SWEEP. Wave 34.
//
//     node games/gradius/tools/oracle/stagesweep.mjs [--frames N] [--verbose]
//
// For every stage the `$A2F0` scope guard admits, and for every one of that
// stage's eight chunk streams, seed the engine on that chunk's stream pointer,
// step the camera and run `nmi()`. **Require zero throws.**
//
// ================== WHY THIS EXISTS, WHICH IS THE WHOLE POINT ================
//
// Six crashes shipped to the public site behind a GREEN gate. Not one of them
// was invisible: every one of them is the FIRST throw of a 1400-frame run from
// a chunk pointer the game itself uses, and W33 found all six in 1.53 seconds
// of wall clock the first time anybody drove `nmi()` this way.
//
// What the gate had instead was `stageledger.py`'s RUNNABLE column, which
// **parses two `if`s in one file and never runs a frame** (W33 sec 7): it
// answers "is this throw statically guarded out of this stage", and five wave
// briefs read it as "this stage plays". Four of the six crashes live in
// `collision.js`, which that column does not open at all. The column is now
// spelled ADMITTED, and this stage is what answers the other question.
//
// THREE PROPERTIES MAKE IT THE RIGHT CHECK RATHER THAN MERELY A CHECK (W33):
//
//   * it is NOT a frame count dressed as coverage. The assertion is "no
//     throw", and a throw in this port is a first divergence with a ROM
//     address on it (HANDOVER sec 4: every unported path is a loud named
//     throw). Frames are the BUDGET here, never the result;
//   * it needs no denominator, so it cannot invent one
//     (docs/knowledge/10 rule 5);
//   * and it fails for the right reason: a stage that cannot survive its own
//     wave stream is not runnable, whatever two `if`s say.
//
// WHAT IT DOES NOT PROVE, stated here so the next reader does not have to
// re-derive it: NOTHING about correctness. A stage can sweep clean and be
// wrong on every pixel. This is a liveness check against the port's own loud
// throws and nothing else. The correctness gate is `compare.mjs`.
//
// ============================ THE TWO MODES ================================
//
// PASSIVE   no buttons, no forced state, nothing touched but the camera. This
//           is a run a real player produces by putting the pad down, and three
//           of W33's six crashes are reachable in it.
// PLAYING   INTERVENTIONS, LABELLED (docs/knowledge/09): `$0100` forced alive,
//           `$46` held at $FF, `$41` re-supplied, A held one frame in three
//           and the stick alternating. It is OFF-DISTRIBUTION BY CONSTRUCTION
//           -- an immortal ship reaches states a real one cannot -- so it is
//           evidence for "does this code path survive", never for how a stage
//           plays. It is here because two of the six ($C2DC needs a shot to
//           live long enough to reach a wall, $CC7C needs the ship to survive
//           past f1100 on stage 5) are not reachable without it.
//
// Both modes are run for every chunk and both must be clean.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = dirname(dirname(HERE));
const SRC = (p) => join(GAME, 'src', p);
const ASSETS = join(GAME, 'assets');

const { bootState } = await import(`file:///${SRC('main.js').replace(/\\/g, '/')}`);
const { nmi } = await import(`file:///${SRC('nmi.js').replace(/\\/g, '/')}`);
const { u8 } = await import(`file:///${SRC('state.js').replace(/\\/g, '/')}`);
const A = await import(`file:///${SRC('assets.js').replace(/\\/g, '/')}`);

const j = (rel) => JSON.parse(readFileSync(join(ASSETS, rel), 'utf8'));

/**
 * The `$A2F0` scope guard's bound, read LIVE out of src/enemies.js.
 *
 * The same parse `stageledger.py::_engine_scope_limit` does, and for the same
 * reason: a hand-maintained stage list here would go stale the first time the
 * guard moves, and this stage would then sweep fewer stages than ship. It is a
 * hard error rather than a default if the guard is present and unparseable.
 */
function scopeLimit() {
  const src = readFileSync(SRC('enemies.js'), 'utf8');
  const key = 'if (stageIndex >= ';
  const at = src.indexOf(key);
  if (at < 0) return 7;
  const tail = src.slice(at + key.length);
  const n = Number(tail.slice(0, tail.indexOf(')')).trim());
  if (!Number.isInteger(n) || n < 0 || n > 7) {
    throw new Error('stagesweep: runEngine\'s scope guard is present but its '
      + `bound ${JSON.stringify(tail.slice(0, 20))} did not parse. Fix the `
      + 'parser rather than letting this stage sweep fewer stages than ship.');
  }
  return n;
}

function resources() {
  const stages = j('terrain/stages.json').stages;
  const ms = j('metasprites.json');
  const metasprites = {};
  for (const [k, v] of Object.entries(ms.records)) metasprites[Number(k)] = v;
  return {
    manifest: j('manifest.json'),
    tiles: new Uint8Array(readFileSync(join(ASSETS, 'chr', 'tiles.u8'))),
    metasprites,
    stage: stages[0],
    stages,
    hudPackets: A.hudPacketTable(j('hud/packets.json')),
    enemyTables: A.enemyTables(j('enemies/tables.json')),
    flowTables: A.flowTables(j('flow/tables.json')),
    collisionTables: A.collisionTables(j('collision/tables.json')),
    weaponTables: A.weaponTables(j('weapons/tables.json')),
    soundTables: A.soundTables(j('sound/tables.json')),
  };
}

/**
 * Seed on stage `st`'s chunk `c`, out of `$A7D0`'s own pointer table.
 *
 * `$A7D0` holds 7 stage pointers, each to a table of `chunksPerStage` = 8
 * chunk-stream pointers (enemies/tables.json stagePtrTable), and `$61` is the
 * byte offset into that table. Chunks that repeat a pointer are swept anyway:
 * they cost nothing and the duplication is the ROM's, not this tool's.
 */
export function seedChunk(res, st, c) {
  const rom = res.enemyTables;
  const tbl = rom.word(0xA7D0 + 2 * st);
  const ptr = rom.read(tbl + 2 * c) | (rom.read(tbl + 2 * c + 1) << 8);
  const s = bootState(res.manifest);
  s.zp19 = st;                                   // $19, the stage
  s.substate = 0x80;                             // $1B, mode-5 play
  s.spawn.z60 = 2;
  s.spawn.z61 = 0;              // $61 is recomputed from $3F at each boundary
  s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
  s.cam.hi = 0; s.cam.lo = 0;
  return { state: s, ptr };
}

/** One chunk run. Returns {frames, throwAt, message}. */
export function sweepChunk(res, st, c, frames, playing) {
  const { state: s } = seedChunk(res, st, c);
  for (let f = 0; f < frames; f++) {
    s.cam.lo = u8(s.cam.lo + 2);                 // the camera, 2 px a frame
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    let btn = 0x00;
    if (playing) {
      s.obj.status[0] = 1;                       // $0100 -- INTERVENTION
      s.zp.shield = 0xFF;                        // $46   -- INTERVENTION
      s.zp41 = 1;                                // $41   -- INTERVENTION
      btn = (f % 3 === 0 ? 0x80 : 0x00)          // A, one frame in three
          | (f % 60 < 30 ? 0x01 : 0x02);         // and the stick, left/right
    }
    try {
      nmi(s, btn, res);
    } catch (e) {
      return { frames: f, throwAt: f, message: e.message };
    }
  }
  return { frames, throwAt: -1, message: null };
}

/**
 * THROWS THE OWNER HAS ALREADY DECIDED ARE OUT OF SCOPE.
 *
 * These are NOT tolerated failures and they are NOT skips: they are the
 * documented edge of what this port claims (HANDOVER sec 2 -- Gradius has no
 * title screen and no attract mode, and `$80D4` is 1 of 7 game modes). A run
 * that ends on one has proved everything up to that frame and then walked off
 * the port's stated edge. They are COUNTED and PRINTED, never silently passed
 * over, and anything not on this list is a failure.
 *
 * Keyed by the ROM address every throw in this port leads its message with.
 * A message that does not lead with `$XXXX` cannot match and therefore fails,
 * which is the right default: `assets.js`'s "not in any exported range" reads
 * like an asset problem and was two of W33's six crashes.
 */
const DECIDED = new Map([
  ['$9751', 'game over -> restart to title. Mode 0 (attract/title) is not '
          + 'ported; a player who runs out of lives gets this on every stage.'],
  ['$970D', 'START on the game-over screen -> mode 0. Same boundary.'],
  ['$9721', 'the continue cheat ($33 == $0A) -> mode 0. Same boundary.'],
  ['$9B10', 'the pause-screen button code ($33 == $0A). Same boundary.'],
]);

const decidedFor = (msg) => {
  const m = /^\$([0-9A-F]{4})\b/.exec(String(msg));
  return m && DECIDED.has(`$${m[1]}`) ? `$${m[1]}` : null;
};

const argv = process.argv.slice(2);
const FRAMES = Number(argv[argv.indexOf('--frames') + 1]) || 1400;
const VERBOSE = argv.includes('--verbose');
const CHUNKS = 8;                                // stagePtrTable.chunksPerStage

const res = resources();
const limit = scopeLimit();
const t0 = Date.now();
const bad = [];
const decided = [];
let runs = 0, frames = 0;

console.log(`STAGE SWEEP -- ${FRAMES} frames per chunk, ${CHUNKS} chunks per `
          + `stage, stages 0..${limit - 1} (the $A2F0 guard's own bound)`);
console.log('  PASSIVE = no buttons and no forced state.  PLAYING = $0100 alive,');
console.log('  $46 = $FF, $41 = 1, A one frame in three -- INTERVENTIONS, and a');
console.log('  PLAYING run is evidence about the code, never about how a stage plays.');
console.log('');
for (const playing of [false, true]) {
  for (let st = 0; st < limit; st++) {
    const row = [];
    for (let c = 0; c < CHUNKS; c++) {
      const r = sweepChunk(res, st, c, FRAMES, playing);
      runs += 1; frames += r.frames;
      const edge = r.throwAt >= 0 ? decidedFor(r.message) : null;
      if (r.throwAt >= 0 && edge) {
        decided.push({ st, c, playing, edge, ...r });
        row.push(`${edge.slice(1)}`);
      } else if (r.throwAt >= 0) {
        bad.push({ st, c, playing, ...r });
        row.push(`f${r.throwAt}!`);
      } else {
        row.push('.');
      }
    }
    console.log(`  ${playing ? 'PLAYING' : 'PASSIVE'}  stage $19=${st}  `
              + row.map((x) => x.padStart(6)).join(''));
  }
}
const ms = Date.now() - t0;
console.log('');
console.log(`  ${runs} chunk runs, ${frames} nmi() frames, ${(ms / 1000).toFixed(2)} s`);

// The decided edge is REPORTED, on its own line, whatever the verdict. It is
// not a skip and it is not a pass: it is how far each of those runs got before
// leaving the part of the game this port claims.
if (decided.length) {
  const byAddr = new Map();
  for (const d of decided) byAddr.set(d.edge, (byAddr.get(d.edge) || 0) + 1);
  console.log(`  ${decided.length} of ${runs} runs ended at a DECIDED `
            + 'out-of-scope boundary (not a failure, not a skip):');
  for (const [a, n] of byAddr) console.log(`    ${a} x${n} -- ${DECIDED.get(a)}`);
  const earliest = decided.reduce((m, d) => Math.min(m, d.throwAt), 1e9);
  console.log(`    earliest at frame ${earliest}; every frame before it is `
            + 'swept evidence.');
}

if (bad.length === 0) {
  console.log(`  OK -- 0 undecided throws`);
  process.exit(0);
}
console.log(`  ${bad.length} of ${runs} chunk runs THREW:`);
for (const b of bad) {
  console.log(`\n    stage $19=${b.st} chunk ${b.c} `
            + `(${b.playing ? 'PLAYING' : 'PASSIVE'}) at frame ${b.throwAt}:`);
  for (const line of String(b.message).split('\n').slice(0, VERBOSE ? 99 : 4)) {
    console.log(`      ${line}`);
  }
}
console.log('\n  A throw here is a ROM path the port does not have, reached by '
          + 'the game\'s\n  OWN wave stream. Read the address in the message; it '
          + 'is the diagnosis.');
process.exit(1);
