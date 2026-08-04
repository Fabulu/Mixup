// THE STAGE SWEEP. Wave 34; coverage self-report and the forced mode, Wave 37.
//
//     node games/gradius/tools/oracle/stagesweep.mjs
//         [--frames N]        frames per chunk run          (default 1400)
//         [--force-frames N]  frames per FORCED chunk run   (default 600)
//         [--loop N]          seed the LOOP counter $1A (default 0)
//         [--no-force]        do not look behind the $A2F0 guard at all
//         [--stages 0-4,6]    restrict the sweep (see --allow-partial)
//         [--allow-partial]   ... and accept the coverage hole it makes
//         [--verbose]
//
// For every stage the `$A2F0` scope guard admits, and for every one of that
// stage's chunk streams -- eight of them, except the last stage, which has
// seven; see `chunkGeometry` -- seed the engine on that chunk's stream
// pointer, step the camera and run `nmi()`. **Require zero throws.**
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
// ================ W37: THE INSTRUMENT HAD THE SAME DEFECT =====================
//
// It reads the `$A2F0` admission guard's bound LIVE, so "sweep clean" meant
// **"clean on the stages that are already admitted"** -- the same sentence
// shape as "green means guarded, not played", one level up. Before W35 this
// tool swept stages 0..4, printed `OK -- 0 undecided throws`, and said NOTHING
// WHATSOEVER about stage 6. W35 copied the tree by hand, lifted the guard, and
// measured **16 of 16 stage-6 runs throwing at `$B480`, earliest at frame 9**.
// A tool that is silent about what it did not look at is how both of those
// failures happened, so three things are true of every run now:
//
//   1. IT CAN LOOK BEHIND THE GUARD, and it does so by default. The guard is
//      lifted DELIBERATELY and VISIBLY, in a throwaway COPY of `src/` under the
//      OS temp dir -- this tool never writes inside the repo, and it hashes
//      `src/enemies.js` either side of the forced section to prove it. Throws
//      found behind the guard are REPORTED AND COUNTED, never failed on: they
//      are the port's declared debt, and the guard is the port's honest
//      statement of scope (see the verdict rules below).
//   2. IT PRINTS ITS OWN COVERAGE -- every stage the ROM has, whether this run
//      swept it, and if not, why not. The denominator is the export's own
//      `stagePtrTable.stages`, never a number typed here.
//   2b. ... AND IT FOUND A BUG IN THE HARNESS THE MOMENT IT DID. `$A7D0` is
//      not a rectangular 7 x 8 table: the subtables overlap and the LAST stage
//      has seven slots, so the old chunk loop read `$A844` -- stream data --
//      as stage 7's eighth pointer and threw at frame 0. Nothing could see
//      that until a run went behind the guard. `chunkGeometry`.
//   3. ADMITTED-BUT-UNSWEPT IS A FAILURE. "Admitted" is read from a SECOND,
//      INDEPENDENT artifact -- `stageledger.py`'s frozen BASELINE dict -- and
//      not from the guard this tool already parses, because a coverage claim
//      checked against its own input is the tautology that produced both of
//      today's failures.
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

import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync,
         existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = dirname(dirname(HERE));
const SRC_DIR = join(GAME, 'src');
const SRC = (p) => join(SRC_DIR, p);
const ASSETS = join(GAME, 'assets');

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const j = (rel) => JSON.parse(readFileSync(join(ASSETS, rel), 'utf8'));

/**
 * Import the port out of `srcDir`, which is the repo's own `src/` for an
 * ordinary run and a patched COPY for the forced one. Nothing here reaches for
 * a path that is not under `srcDir`, so the two engines are independent.
 */
async function loadEngine(srcDir) {
  const u = (p) => pathToFileURL(join(srcDir, p)).href;
  const [main, nmiMod, state, A] = await Promise.all([
    import(u('main.js')), import(u('nmi.js')),
    import(u('state.js')), import(u('assets.js')),
  ]);
  return { bootState: main.bootState, nmi: nmiMod.nmi, u8: state.u8, A, srcDir };
}

/**
 * The `$A2F0` scope guard's bound, read LIVE out of a copy of src/enemies.js.
 *
 * The same parse `stageledger.py::_engine_scope_limit` does, and for the same
 * reason: a hand-maintained stage list here would go stale the first time the
 * guard moves, and this stage would then sweep fewer stages than ship. It is a
 * hard error rather than a default if the guard is present and unparseable.
 *
 * W37: `found` is returned as well. A guard that has been RENAMED or removed
 * used to make this function quietly answer "every stage is admitted", which
 * is a coverage claim invented by a failed string search; it is printed now.
 */
function scopeLimit(srcDir = SRC_DIR) {
  const src = readFileSync(join(srcDir, 'enemies.js'), 'utf8');
  const key = 'if (stageIndex >= ';
  const at = src.indexOf(key);
  if (at < 0) return { limit: STAGES, found: false, text: null };
  const tail = src.slice(at + key.length);
  const n = Number(tail.slice(0, tail.indexOf(')')).trim());
  if (!Number.isInteger(n) || n < 0 || n > 7) {
    throw new Error('stagesweep: runEngine\'s scope guard is present but its '
      + `bound ${JSON.stringify(tail.slice(0, 20))} did not parse. Fix the `
      + 'parser rather than letting this stage sweep fewer stages than ship.');
  }
  if (src.indexOf(key, at + 1) >= 0) {
    throw new Error('stagesweep: src/enemies.js has MORE THAN ONE '
      + `\`${key}N)\` guard. This tool patches exactly one to look behind it; `
      + 'decide which is the admission guard and teach the parser, rather '
      + 'than letting a second guard silently bound the forced sweep.');
  }
  return { limit: n, found: true, key: `${key}${n})` };
}

/**
 * ADMISSION, READ FROM AN ARTIFACT THIS TOOL DOES NOT ALSO PARSE FOR COVERAGE.
 *
 * `stageledger.py`'s BASELINE dict -- the frozen, hand-updated, per-stage floor
 * that its own regression gate watches. It is the document five wave briefs
 * misread as "this stage plays", so it is exactly the right second opinion:
 * if it says a stage is ADMITTED and this run did not sweep that stage, the
 * two artifacts disagree about what ships and somebody must look.
 *
 * Deriving "admitted" from the `$A2F0` bound instead would make the coverage
 * report agree with itself no matter what either file said -- the tautology
 * that produced both of today's failures.
 */
function ledgerAdmission() {
  const file = join(HERE, 'stageledger.py');
  const txt = readFileSync(file, 'utf8');
  const re = /^\s*(\d+):\s*dict\(([^)]*)\),/gm;
  const out = new Map();
  let m;
  while ((m = re.exec(txt)) !== null) {
    const a = /admitted\s*=\s*(True|False)/.exec(m[2]);
    if (a) out.set(Number(m[1]), a[1] === 'True');
  }
  if (out.size !== STAGES) {
    throw new Error(`stagesweep: parsed ${out.size} admitted= rows out of `
      + `stageledger.py's BASELINE, expected ${STAGES} (the export's own `
      + 'stagePtrTable.stages). Fix the parser: a coverage report that cannot '
      + 'read its second opinion must not fall back on its first.');
  }
  return out;
}

/**
 * A COPY of `src/` with the `$A2F0` guard lifted, under the OS temp dir.
 *
 * W35 did this by hand and it is why stage 6's `$B480` wall was found at all.
 * Making it the tool's own capability is the point of W37: the guard comes off
 * DELIBERATELY (an explicit mode, printed, on a copy) instead of silently (a
 * sweep that quietly stops where the guard does).
 *
 * The copy is asserted to be outside the repo, `src/enemies.js` is hashed
 * before and after, and exactly ONE guard site is rewritten -- if the needle
 * does not appear exactly once the tool refuses rather than sweeping a stage
 * the guard still blocks and calling it covered.
 */
function shadowWithGuardLifted(guard) {
  const before = sha(SRC('enemies.js'));
  const dir = mkdtempSync(join(tmpdir(), 'gradius-stagesweep-'));
  if (resolve(dir).startsWith(resolve(GAME))) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`stagesweep: refusing to patch a copy inside the repo (${dir}).`);
  }
  const srcDir = join(dir, 'src');
  cpSync(SRC_DIR, srcDir, { recursive: true });
  for (const f of ['game.json', 'index.html']) {              // assets.js reads ../game.json
    if (existsSync(join(GAME, f))) cpSync(join(GAME, f), join(dir, f));
  }
  // `src/*.js` are ES modules and the repo's own package.json is what says so.
  // Without this the copy loads as CommonJS and dies on its first `import`.
  writeOutsideRepo(join(dir, 'package.json'), '{ "type": "module" }\n');
  const file = join(srcDir, 'enemies.js');
  const txt = readFileSync(file, 'utf8');
  const hits = txt.split(guard.key).length - 1;
  if (hits !== 1) {
    rmSync(dir, { recursive: true, force: true });
    throw new Error(`stagesweep: the guard needle ${JSON.stringify(guard.key)} `
      + `appears ${hits} times in the copy, expected exactly 1.`);
  }
  const lifted = `if (stageIndex >= ${STAGES})`;
  writeOutsideRepo(file, txt.replace(guard.key, lifted));
  const after = sha(SRC('enemies.js'));
  if (before !== after) {
    throw new Error('stagesweep: src/enemies.js changed while the forced copy '
      + `was being made (${before.slice(0, 12)} -> ${after.slice(0, 12)}).`);
  }
  return { dir, srcDir, from: guard.key, to: lifted, hash: before };
}

/**
 * The ONLY write in this tool, so "it never writes inside the repo" is a claim
 * a reader checks by reading one function.
 */
function writeOutsideRepo(file, text) {
  if (resolve(file).startsWith(resolve(GAME))) {
    throw new Error(`stagesweep: refusing to write inside the repo: ${file}`);
  }
  writeFileSync(file, text);
}

function resources(A) {
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
 * HOW MANY CHUNK SLOTS EACH STAGE ACTUALLY HAS. Wave 37, and it is a defect
 * this tool had from W34 that only the FORCED sweep could expose.
 *
 * `$A7D0`'s seven stage pointers do NOT address a rectangular 7 x 8 table.
 * Measured out of `assets/prg.bin` this session:
 *
 *   bases  $A7DE $A7EE $A7FE $A80C $A81A $A828 $A836   (spacing 16,16,14,14,14,14)
 *   the whole chunk-pointer region is $A7DE..$A843 -- 102 bytes, 51 words --
 *   and the first chunk STREAM begins at $A844.
 *
 * So the subtables OVERLAP: from stage 2 on, a stage's 8th word IS the next
 * stage's 1st, which is why W33 saw stage $19=2 chunk 7 die on `$AAEC`, stage
 * $19=3 chunk 0's pointer, at the same frame 314. That overlap is the ROM's
 * and those slots are swept.
 *
 * THE LAST STAGE IS THE ONE THAT BITES. `$A836 + 14` = `$A844`, which is not a
 * pointer at all -- it is the first two bytes of stage 1 chunk 0's stream.
 * Seeding it made this tool's own forced sweep throw `enemy tables: $8010 is
 * not in any exported range` at frame 0 on both modes, and I very nearly wrote
 * that up as stage 7 debt. **It is the harness reading past the end of the
 * ROM's table.** No stage before the last has the problem, so nothing found it
 * until the guard came off.
 *
 * Two derivations, and they must agree (docs/knowledge/03):
 *   (a) a slot ADDRESS at or after the first stream is not a table entry;
 *   (b) every slot VALUE that is a real pointer points INTO stream space,
 *       i.e. is >= that same address. `$8010` is not.
 * `(b)` is asserted for every slot this tool sweeps.
 */
export function chunkGeometry(rom) {
  const bases = Array.from({ length: STAGES }, (_, st) => rom.word(0xA7D0 + 2 * st));
  // Slots 0..CHUNKS-2 are inside every subtable at any spacing >= 14 bytes, so
  // they bound the table without assuming its length.
  let firstStream = Infinity;
  for (const b of bases) {
    for (let c = 0; c < CHUNKS - 1; c++) firstStream = Math.min(firstStream, rom.word(b + 2 * c));
  }
  const counts = bases.map((b) => Math.max(0, Math.min(CHUNKS, (firstStream - b) >> 1)));
  for (let st = 0; st < STAGES; st++) {
    for (let c = 0; c < counts[st]; c++) {
      const p = rom.word(bases[st] + 2 * c);
      if (p < firstStream) {
        throw new Error(`stagesweep: stage $19=${st} chunk ${c} at `
          + `$${(bases[st] + 2 * c).toString(16).toUpperCase()} holds `
          + `$${p.toString(16).toUpperCase()}, which is BELOW the first chunk `
          + `stream $${firstStream.toString(16).toUpperCase()} -- so it is not `
          + 'a stream pointer and the two derivations of the table\'s extent '
          + 'disagree. Read the listing before touching this.');
      }
    }
  }
  return { bases, firstStream, counts };
}

/**
 * Seed on stage `st`'s chunk `c`, out of `$A7D0`'s own pointer table.
 *
 * `$A7D0` holds 7 stage pointers, each to a table of `chunksPerStage` = 8
 * chunk-stream pointers (enemies/tables.json stagePtrTable), and `$61` is the
 * byte offset into that table. Chunks that repeat a pointer are swept anyway:
 * they cost nothing and the duplication is the ROM's, not this tool's.
 */
export function seedChunk(eng, res, st, c, loop = 0) {
  const rom = res.enemyTables;
  const tbl = rom.word(0xA7D0 + 2 * st);
  const ptr = rom.read(tbl + 2 * c) | (rom.read(tbl + 2 * c + 1) << 8);
  const s = eng.bootState(res.manifest);
  // W38: `$1A`, THE LOOP COUNTER, and it is 0 unless `--loop` says otherwise.
  // It stopped being structurally pinned when W38 ported `$9889 INC $28,X`, so
  // eight `$1A` readers ($B003's fire-rate row, $B951, $BBBF/$BBC9, $BC44,
  // $BD42, $BD96, $CEAC) went from dead-but-faithful to live -- and NOTHING in
  // the corpus reaches a second lap, so a sweep is the only instrument that
  // can drive them at all. `$28,X` is set too, because `$9B3E` restores `$1A`
  // from it and an intro inside the run would otherwise put it back to 0.
  s.zp1A = loop;                                 // $1A
  s.save28[0] = loop;                            // $28,X -- $9B72's source
  s.zp19 = st;                                   // $19, the stage
  s.substate = 0x80;                             // $1B, mode-5 play
  s.spawn.z60 = 2;
  s.spawn.z61 = 0;              // $61 is recomputed from $3F at each boundary
  s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
  s.cam.hi = 0; s.cam.lo = 0;
  return { state: s, ptr };
}

/**
 * Steer toward the nearest live enemy: the D-pad bits, or 0 if there is none.
 *
 * An AUTOPILOT IS AN INTERVENTION and it is off-distribution: a real player
 * does not fly into every enemy. It is here for COVERAGE only
 * (docs/knowledge/09) -- what it buys is that the contact half of
 * `$C16E`'s dispatch is exercised on every chunk that spawns anything, instead
 * of on the chunks where the fixture's own trajectory happened to intersect.
 *
 * Enemy slots are objects $0C..$15; `$030C,Y` = 0 is an empty slot.
 */
function chase(s) {
  const o = s.obj;
  let best = -1, bestD = 1e9;
  for (let k = 0; k < 10; k++) {
    const i = k + 0x0C;
    if (o.type[i] === 0) continue;
    const d = Math.abs(o.x[i] - o.x[0]) + Math.abs(o.y[i] - o.y[0]);
    if (d < bestD) { bestD = d; best = i; }
  }
  if (best < 0) return 0x00;
  return (o.x[best] > o.x[0] ? 0x01 : o.x[best] < o.x[0] ? 0x02 : 0x00)
       | (o.y[best] > o.y[0] ? 0x04 : o.y[best] < o.y[0] ? 0x08 : 0x00);
}

/** One chunk run. Returns {frames, throwAt, message}. */
export function sweepChunk(eng, res, st, c, frames, playing, loop = 0) {
  const { state: s } = seedChunk(eng, res, st, c, loop);
  const u8 = eng.u8;
  for (let f = 0; f < frames; f++) {
    s.cam.lo = u8(s.cam.lo + 2);                 // the camera, 2 px a frame
    if (s.cam.lo < 2) s.cam.hi = u8(s.cam.hi + 1);
    let btn = 0x00;
    if (playing) {
      s.obj.status[0] = 1;                       // $0100 -- INTERVENTION
      s.zp.shield = 0xFF;                        // $46   -- INTERVENTION
      s.zp41 = 1;                                // $41   -- INTERVENTION
      // A one frame in three, and the stick CHASING the nearest live enemy.
      //
      // THE STICK PATTERN IS NOT DECORATION AND IT WAS MEASURED, TWICE. A
      // left/right-only fixture leaves the ship at the boot y of $60 and never
      // meets the type-$29 pickup, which spawns at y $24/$A4/$BA/$BD -- that
      // is exactly why W33 could not witness $C159's spawn. A lissajous sweep
      // reaches those rows and then misses the type-$27 at y $60, because
      // contact needs x AND y inside a 16x16 box on the same frame. Both
      // patterns were run against the reverted fixes on a copy: each caught
      // one of the two and neither caught both. A CHASE catches both, because
      // it stops depending on where the fixture happens to put the ship.
      btn = (f % 3 === 0 ? 0x80 : 0x00) | chase(s);
    }
    try {
      eng.nmi(s, btn, res);
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
 * documented edge of what this port claims. A run that ends on one has proved
 * everything up to that frame and then walked off the port's stated edge. They
 * are COUNTED and PRINTED, never silently passed over, and anything not on this
 * list is a failure.
 *
 * Keyed by the ROM address every throw in this port leads its message with.
 * A message that does not lead with `$XXXX` cannot match and therefore fails,
 * which is the right default: `assets.js`'s "not in any exported range" reads
 * like an asset problem and was two of W33's six crashes.
 *
 * W39 DELETED THREE OF THE FOUR. `$9751`, `$970D` and `$9721` were all "mode 0
 * / mode 4 is not ported", and all three now run (src/modes.js). The excuse for
 * `$9751` in particular said "a player who runs out of lives gets this on every
 * stage" -- and that is exactly why it could not stay: an excuse nothing can
 * reach is indistinguishable from an excuse that is quietly hiding something.
 * They are deleted rather than kept "just in case", which is the same rule
 * compare.mjs applies to knownFail from the other direction.
 */
const DECIDED = new Map([
  ['$9B10', 'the pause-screen button code ($33 == $0A). $9C5E`s body is ported '
          + '(src/modes.js, the attract demo needs it); what is not is this '
          + 'caller`s surroundings -- $9B13`s DEC $3B,X and what a live cheat '
          + 'does to a compared run.'],
  ['$97C5', 'the two-player continue-timeout switch. It ends `STX $18` with '
          + 'X = 1, the one value src/flow.js playerIndex() refuses; the port '
          + 'has one controller.'],
]);

const decidedFor = (msg) => {
  const m = /^\$([0-9A-F]{4})\b/.exec(String(msg));
  return m && DECIDED.has(`$${m[1]}`) ? `$${m[1]}` : null;
};

const argv = process.argv.slice(2);
const arg = (k, d) => {
  const i = argv.indexOf(k);
  return i < 0 ? d : Number(argv[i + 1]);
};
const FRAMES = arg('--frames', 0) || 1400;
const FORCE_FRAMES = arg('--force-frames', 0) || 600;
const VERBOSE = argv.includes('--verbose');
const FORCE = !argv.includes('--no-force');
const ALLOW_PARTIAL = argv.includes('--allow-partial');
// W38: `--loop N` seeds `$1A` (and `$28,X`, its restore source). 0 is the
// default and the gate never passes anything else, so this run is unchanged
// unless somebody types it. `$CEAC` clamps at 6, so 0..6 is the whole range
// the ROM's own tables distinguish; anything above reads the clamped entry.
const LOOP = arg('--loop', 0) || 0;

// THE DENOMINATOR IS THE EXPORT'S, NOT THIS FILE'S (docs/knowledge/10 rule 5:
// never invent a denominator). `$A7D0` holds `stages` pointers, each to a table
// of `chunksPerStage`.
const PTRTBL = j('enemies/tables.json').stagePtrTable;
const STAGES = PTRTBL.stages;
const CHUNKS = PTRTBL.chunksPerStage;

/** `--stages 0-4,6` -> Set{0,1,2,3,4,6}. Absent -> every stage the ROM has. */
function selection() {
  const i = argv.indexOf('--stages');
  if (i < 0) return { set: new Set(Array.from({ length: STAGES }, (_, k) => k)), restricted: false };
  const set = new Set();
  for (const part of String(argv[i + 1]).split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`stagesweep: --stages ${part} did not parse.`);
    for (let k = Number(m[1]); k <= Number(m[2] ?? m[1]); k++) set.add(k);
  }
  return { set, restricted: true };
}

const guard = scopeLimit();
const admitted = ledgerAdmission();
const sel = selection();
const t0 = Date.now();
const bad = [];
const decided = [];
const behind = [];                 // throws found BEHIND the guard
const decidedForced = [];          // ... that are the decided out-of-scope edge
const swept = new Map();           // stage -> 'guard' | 'forced'
let runs = 0, frames = 0, forcedRuns = 0, forcedFrames = 0;

const engine = await loadEngine(SRC_DIR);
const res = resources(engine.A);
const geo = chunkGeometry(res.enemyTables);
const SLOTS = geo.counts.reduce((a, b) => a + b, 0);

console.log(`STAGE SWEEP -- ${FRAMES} frames per chunk, ${STAGES} stages / `
          + `${SLOTS} chunk slots (assets/enemies/tables.json stagePtrTable, `
          + `clipped to the ROM's own table -- see chunkGeometry)`);
console.log(`  the $A2F0 guard admits stages 0..${guard.limit - 1}`
          + (guard.found ? '' : '  <-- GUARD NOT FOUND, see COVERAGE below'));
console.log('  PASSIVE = no buttons and no forced state.  PLAYING = $0100 alive,');
console.log('  $46 = $FF, $41 = 1, A one frame in three -- INTERVENTIONS, and a');
console.log('  PLAYING run is evidence about the code, never about how a stage plays.');
console.log('');

for (const playing of [false, true]) {
  for (let st = 0; st < guard.limit; st++) {
    if (!sel.set.has(st)) continue;
    const row = [];
    for (let c = 0; c < geo.counts[st]; c++) {
      const r = sweepChunk(engine, res, st, c, FRAMES, playing, LOOP);
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
    swept.set(st, 'guard');
    console.log(`  ${playing ? 'PLAYING' : 'PASSIVE'}  stage $19=${st}  `
              + row.map((x) => x.padStart(6)).join(''));
  }
}

// ------------------------------------------------------------------- FORCED --
// EVERYTHING THE GUARD HIDES, LOOKED AT ON PURPOSE.
//
// Before W35 this section did not exist and the tool printed `OK` while saying
// nothing at all about stage 6, where 16 of 16 forced runs threw by frame 9.
// The results here NEVER fail the run -- see the verdict rules at the bottom --
// but they are always printed, with the ROM address, which is the whole point.
const unadmitted = [];
for (let st = guard.limit; st < STAGES; st++) if (sel.set.has(st)) unadmitted.push(st);

let shadow = null;
if (FORCE && unadmitted.length && guard.found) {
  shadow = shadowWithGuardLifted(guard);
  try {
  const fEngine = await loadEngine(shadow.srcDir);
  const fRes = resources(fEngine.A);
  console.log('');
  console.log(`  FORCED -- ${FORCE_FRAMES} frames per chunk, the $A2F0 guard `
            + `lifted (${shadow.from} -> ${shadow.to})`);
  console.log(`  in a COPY at ${shadow.dir} (src/enemies.js sha256 `
            + `${shadow.hash.slice(0, 12)}, unchanged). A throw here is DEBT `
            + 'behind a deliberate');
  console.log('  guard, printed and counted, never failed on.');
  for (const playing of [false, true]) {
    for (const st of unadmitted) {
      const row = [];
      for (let c = 0; c < geo.counts[st]; c++) {
        const r = sweepChunk(fEngine, fRes, st, c, FORCE_FRAMES, playing);
        forcedRuns += 1; forcedFrames += r.frames;
        const edge = r.throwAt >= 0 ? decidedFor(r.message) : null;
        if (edge) {                      // the decided edge is decided here too
          decidedForced.push({ st, c, playing, edge, ...r });
          row.push(edge.slice(1));
        } else if (r.throwAt >= 0) {
          behind.push({ st, c, playing, ...r });
          row.push(`f${r.throwAt}*`);
        } else row.push('.');
      }
      swept.set(st, 'forced');
      console.log(`  ${playing ? 'PLAYING' : 'PASSIVE'}  stage $19=${st}  `
                + row.map((x) => x.padStart(6)).join(''));
    }
  }
  } finally {
    // The copy is a throwaway and it goes whatever happened, so a crash in the
    // forced sweep cannot leave a patched tree lying around under %TEMP%.
    rmSync(shadow.dir, { recursive: true, force: true });
  }
  const after = sha(SRC('enemies.js'));
  if (after !== shadow.hash) {
    console.log(`  *** src/enemies.js changed during the forced sweep `
              + `(${shadow.hash.slice(0, 12)} -> ${after.slice(0, 12)}).`);
    process.exit(1);
  }
}

const ms = Date.now() - t0;
console.log('');
console.log(`  ${runs} chunk runs, ${frames} nmi() frames`
          + (forcedRuns ? ` (+ ${forcedRuns} forced runs, ${forcedFrames} frames)` : '')
          + `, ${(ms / 1000).toFixed(2)} s`);

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

// ----------------------------------------------------------------- COVERAGE --
// WHICH STAGES THIS RUN SWEPT, AND WHICH IT DID NOT, AND WHY.
//
// Printed on EVERY run, green or red. A tool that reports only its findings
// lets the reader supply the denominator out of their own head, and the two
// failures this file exists because of were both exactly that: "the ledger is
// green" (on two `if`s that ran no frames) and "the sweep is clean" (on the
// stages already admitted). Coverage here is STAGES SWEPT vs STAGES SHIPPED --
// never frames (docs/knowledge/10 rule 5).
console.log('');
console.log('  COVERAGE -- STAGES SWEPT vs STAGES THE ROM HAS');
console.log('  stage   ledger BASELINE   $A2F0 guard   this run                runs');
const unswept = [];
const aheadOfLedger = [];
for (let st = 0; st < STAGES; st++) {
  const adm = admitted.get(st);
  const g = st < guard.limit ? 'admits' : 'THROWS';
  const how = swept.get(st);
  let note;
  if (how === 'guard') note = 'SWEPT';
  else if (how === 'forced') note = 'SWEPT (forced)';
  else if (!sel.set.has(st)) note = 'NOT SWEPT: --stages';
  else if (st >= guard.limit && !FORCE) note = 'NOT SWEPT: --no-force';
  else if (st >= guard.limit && !guard.found) note = 'NOT SWEPT: no guard found';
  else note = 'NOT SWEPT';
  if (!how) unswept.push({ st, adm, note });
  if (how && adm === false && st < guard.limit) aheadOfLedger.push(st);
  const n = how ? 2 * geo.counts[st] : 0;
  console.log(`  $19=${st}   ${(adm ? 'ADMITTED' : 'debt').padEnd(16)} `
            + `${g.padEnd(13)} ${note.padEnd(23)} ${n}`);
}
for (let st = 0; st < STAGES; st++) {
  if (geo.counts[st] < CHUNKS) {
    const past = geo.bases[st] + 2 * geo.counts[st];
    console.log(`  ... stage $19=${st} has ${geo.counts[st]} of the ${CHUNKS} `
      + `slots stagePtrTable.chunksPerStage suggests: `
      + `$${past.toString(16).toUpperCase()} is at or past the first chunk `
      + `STREAM ($${geo.firstStream.toString(16).toUpperCase()}), so it is not `
      + 'a pointer. Sweeping it read $8010 and threw at frame 0 -- the '
      + 'harness\'s own bug, not the port\'s (chunkGeometry).');
  }
}
const nGuard = [...swept.values()].filter((v) => v === 'guard').length;
const nForced = [...swept.values()].filter((v) => v === 'forced').length;
console.log(`  ${nGuard + nForced} of ${STAGES} stages swept `
          + `(${nGuard} admitted, ${nForced} forced behind the guard); `
          + `${STAGES - nGuard - nForced} NOT SWEPT.`);
if (!guard.found) {
  console.log('  *** the `if (stageIndex >= N)` guard was NOT FOUND in '
            + 'src/enemies.js. Every stage was treated as admitted -- that is '
            + 'a coverage claim made by a FAILED STRING SEARCH, not by reading '
            + 'the port. Fix the parser.');
}
for (const st of aheadOfLedger) {
  console.log(`  ... stage $19=${st} was swept and stageledger.py's BASELINE `
            + 'still calls it debt. Not a failure (the sweep covers MORE than '
            + 'the ledger claims); update BASELINE[' + st + '] when the wave that '
            + 'lifted the guard lands.');
}

// A stage the LEDGER calls ADMITTED that the GUARD blocks. The two artifacts
// disagree about what ships; `stageledger.py`'s own gate is the one that fails
// on it ("regressed: was ADMITTED, now blocked"), so this prints rather than
// double-gates -- but a run that swept such a stage only by FORCING it must
// not be able to call itself covered, so `behindAdmitted` below is fatal.
for (let st = 0; st < STAGES; st++) {
  if (admitted.get(st) && st >= guard.limit) {
    console.log(`  *** stage $19=${st}: stageledger.py's BASELINE says ADMITTED `
              + 'and the $A2F0 guard THROWS. The two artifacts disagree about '
              + 'what\n      ships; this run could reach it only by FORCING '
              + 'the guard. stageledger.py\'s own gate fails on this.');
  }
}

// Throws found behind the guard: reported in full. Fatal only for a stage the
// LEDGER calls ADMITTED -- see the verdict rules at the bottom.
const behindAdmitted = behind.filter((b) => admitted.get(b.st));
if (behind.length) {
  // Grouped by the FIRST ROM address anywhere in the message -- not by the
  // leading one `decidedFor` requires, because these are not decided edges and
  // the shape that matters to the reader is "which ROM path, how many runs".
  const byAddr = new Map();
  for (const b of behind) {
    const m = /\$([0-9A-F]{4})\b/.exec(String(b.message));
    const k = m ? `$${m[1]}` : String(b.message).slice(0, 40);
    byAddr.set(k, (byAddr.get(k) || 0) + 1);
  }
  const earliest = behind.reduce((m, b) => Math.min(m, b.throwAt), 1e9);
  console.log('');
  console.log(`  BEHIND THE GUARD: ${behind.length} of ${forcedRuns} forced `
            + `runs threw, earliest at frame ${earliest}`
            + (decidedForced.length
               ? `; ${decidedForced.length} more ended at a DECIDED boundary` : '')
            + '.');
  console.log('  On a stage the ledger calls DEBT this is not a failure -- it '
            + 'is the port\'s declared\n  scope, and the wave-brief number for '
            + 'whoever ships that stage:');
  for (const [a, n] of byAddr) console.log(`    ${a} x${n}`);
  for (const b of behind.slice(0, VERBOSE ? 999 : 2)) {
    console.log(`    stage $19=${b.st} chunk ${b.c} `
              + `(${b.playing ? 'PLAYING' : 'PASSIVE'}) at frame ${b.throwAt}:`);
    for (const line of String(b.message).split('\n').slice(0, VERBOSE ? 99 : 3)) {
      console.log(`      ${line}`);
    }
  }
}

// ------------------------------------------------------------------ VERDICT --
// THREE FAILING CONDITIONS. The reasoning is in
// docs/worklog/gradius/37-tool-sweep-coverage.md sec 3:
//
//   1. an UNDECIDED THROW on a stage the guard admits -- W34's assertion;
//   2. a stage the ledger BASELINE calls ADMITTED that this run did NOT SWEEP.
//      Shipped-and-unswept is the exact combination that put six crashes on
//      the public site, and on a consistent tree it cannot arise: coverage
//      follows the same guard that admits. It fires only when somebody
//      restricted the run, the parse degraded, or the two artifacts disagree
//      -- all three defects. `--allow-partial` is the labelled way to say "I
//      restricted it on purpose", and it is never passed by the gate;
//   3. an undecided throw on a stage the ledger calls ADMITTED that this run
//      could only reach by FORCING the guard. W37's own demonstration is why
//      this rule exists: the first cut of rule 2 counted "swept (forced)" as
//      covered, so a copy in the pre-W35 state -- ledger ADMITTED, guard
//      blocking, 16 of 16 forced runs dying on `$B480` at frame 9 -- exited 0.
//      A stage another artifact says ships does not get to be "declared debt"
//      because this tool had to lift a guard to see it.
//
// Throws behind the guard on a stage the ledger calls DEBT are none of the
// three. Failing on those would block publishing on work nobody has claimed is
// done, which has a real cost and no safety benefit; the guard is the port's
// honest statement of scope, and the job here is to make the debt VISIBLE, not
// to forbid it.
const shipped = unswept.filter((u) => u.adm);
if (shipped.length) {
  console.log('');
  console.log(`  *** ${shipped.length} stage(s) ADMITTED BY stageledger.py's `
            + 'BASELINE AND NOT SWEPT BY THIS RUN:');
  for (const u of shipped) {
    console.log(`      stage $19=${u.st}  (${u.note})  -- a stage a player `
              + 'reaches, that nothing here ran a frame of.');
  }
  console.log('  That combination is how six crashes reached the public site '
            + '(W33/W34) and how\n  stage 6\'s $B480 wall survived a green '
            + 'sweep (W35). Sweep them, or say\n  --allow-partial and own it.');
  if (!ALLOW_PARTIAL) process.exit(1);
  console.log('  --allow-partial: accepted, and this run does NOT cover those '
            + 'stages.');
}

if (behindAdmitted.length) {
  const st = [...new Set(behindAdmitted.map((b) => b.st))];
  console.log('');
  console.log(`  *** ${behindAdmitted.length} FORCED run(s) THREW on stage(s) `
            + `${st.map((s) => `$19=${s}`).join(', ')}, which stageledger.py's `
            + 'BASELINE calls ADMITTED.');
  console.log('  This run reached them only by lifting the $A2F0 guard, so '
            + 'they are NOT covered by\n  the ordinary sweep and they are NOT '
            + 'declared debt: one artifact says the stage\n  ships and the '
            + 'other says it does not, and the frames say it dies. Read the '
            + 'ROM\n  addresses above.');
}

if (bad.length === 0 && behindAdmitted.length === 0) {
  console.log(`  OK -- 0 undecided throws on ${nGuard} admitted stage(s)`
            + (behind.length ? `; ${behind.length} throws behind the guard, above` : ''));
  process.exit(0);
}
if (bad.length) console.log(`  ${bad.length} of ${runs} chunk runs THREW:`);
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
