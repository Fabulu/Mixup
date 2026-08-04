// stagecmp.mjs -- ONE parameterised comparator for stagepoke.py's dumps.
//
// WAVE 40. The comparison half of the generalised harness. `stage4cmp.mjs` (W31)
// and `b559cmp.mjs` (W32a) each did this for one stage and one routine; this
// does it for whatever `stagepoke.py` was pointed at, driven entirely by the
// MANIFEST inside the dump -- stage, poke windows, field list, type filter. No
// stage, address or field is written down in this file.
//
// PROVENANCE, and it is in the dump too so it cannot be separated from the
// numbers: every dump this reads comes from an INTERVENTION RUN
// (`docs/knowledge/09`). `$19` was forced on the cartridge to reach code no
// scripted run in this corpus can reach. That makes these numbers evidence
// about the PORT'S CODE under a forced state, and NOT evidence about any
// stage's pacing, spawn density, difficulty or appearance.
//
//   node games/gradius/tools/oracle/stagecmp.mjs --tag s6-chunk2
//   node games/gradius/tools/oracle/stagecmp.mjs --tag w31repro --limit 20
//   node <mutant copy>/tools/oracle/stagecmp.mjs --tag s6 --dir <real out dir>
//
// STEP MODE, the single-step differential (W32a's design, generalised):
//   for each indexed slot-frame i,
//     * seed a WHOLE port machine from the cartridge's own 2 KB at frame i-1
//       (porttrace.mjs seedFromCartridge -- the same seeder every scenario
//       comparison uses), with the run's own pokes applied at that boundary;
//     * run the frame's object chain;
//     * compare the manifest's fields for that slot against the cartridge's
//       bytes at frame i.
//   A divergence is therefore a divergence in ONE frame, not the accumulated
//   consequence of an earlier one (docs/knowledge/10 point 3).
//
//   WHAT THE PORT IS ALLOWED TO RUN is `--pipeline`, and the choice is a real
//   trade between attribution and completeness:
//     enemies (default)  just `$ADAB updateEnemies`. W32a's. A divergence is
//                        attributable to one handler. But `$ADAB` is not the
//                        only writer of these bytes in a cartridge frame --
//                        `$9A70`'s collision sweep runs AFTER it and can free
//                        or explode the slot before the sample -- so frames the
//                        player shot on will show up as divergent.
//     tail               `$9A64`-`$9A73`: spawnEngine, enemyBullets,
//                        updatePlayer, updateEnemies, shotSweep, applyCapsule,
//                        in the cartridge's order. Every writer of an object
//                        byte in a mode-5 frame. Complete, and a divergence is
//                        attributable to the chain rather than to one routine.
//
// SPAWN MODE reproduces W31's reconstruction exactly: the pre-INC `$69`, the
// frame counter `$02` and the slot `$C41E`'s scan landed on are rebuilt, the
// port's own `spawnEngine` runs, and all the manifest's fields plus the post-INC
// `$69` are compared against the cartridge's bytes. Nothing is re-derived from
// the port's formula; the expected values are the cartridge's.
//
// Exits non-zero on any divergence. Not wired into test-all.mjs: it needs an
// emulator run, like everything else under tools/oracle/ that does.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createState, ENEMY_BASE, u8 } from '../../src/state.js';
import {
  spawnEngine, enemyBullets, updateEnemies, armCensus, armDriverGated,
} from '../../src/enemies.js';
import { updatePlayer } from '../../src/player.js';
import { shotSweep } from '../../src/collision.js';
import { applyCapsule } from '../../src/powerup.js';
import { headlessResources } from '../../tests/helpers.js';
import { nmi } from '../../src/nmi.js';
import { seedFromCartridge, parseScript } from './porttrace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAM_FRAME = 0x800;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { tag: null, limit: 12, pipeline: 'enemies', dir: null, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') o.tag = argv[++i];
    // --dir points at a dump directory OUTSIDE this checkout. It exists for
    // MUTATION TESTING: src/ is copied to a scratch tree, mutated there, and
    // the copy's comparator is pointed back at the real run's dump, so a
    // mutant is proved to go red without a single byte of src/ being touched.
    else if (a === '--dir') o.dir = argv[++i];
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--chain-frames') o.chainFrames = Number(argv[++i]);
    else if (a === '--pipeline') o.pipeline = argv[++i];
    // --only narrows the comparison to one or more type bytes (bit 7 masked).
    // The dump indexes every live object, which is what makes the run reusable;
    // this is how a stage's OWN types are separated from the stage-1 traffic
    // that happened to be on screen at the same time.
    else if (a === '--only') {
      o.only = new Set(argv[++i].split(',').map((v) => parseInt(v, 16) & 0x7F));
    }
    else if (a === '--quiet') o.quiet = true;
    else throw new Error(`unknown argument ${a}`);
  }
  if (!o.tag) throw new Error('--tag <name> is required (the stagepoke.py tag)');
  if (!['enemies', 'tail'].includes(o.pipeline)) {
    throw new Error(`--pipeline wants 'enemies' or 'tail', got ${o.pipeline}`);
  }
  return o;
}

/**
 * `probe.lua` writes a poke AFTER the frame's sample and before the next NMI, so
 * the machine that runs frame `f+1` is `RAM at sample f` PLUS every poke whose
 * range contains `f`. Reproducing that here is what makes the seed exact at a
 * window edge instead of one frame stale.
 */
function parsePokes(s) {
  return (s || '').split(',').filter(Boolean).map((seg) => {
    const m = /^\s*\$?([0-9A-Fa-f]+)\s*=\s*(\d+)\s*@\s*(\d+)-(\d+)\s*$/.exec(seg);
    if (!m) throw new Error(`bad poke in the manifest: ${seg}`);
    return { addr: parseInt(m[1], 16), val: Number(m[2]),
      from: Number(m[3]), to: Number(m[4]) };
  });
}

/**
 * THE THREE BYTES THE NMI PROLOGUE WRITES BEFORE THE OBJECT CHAIN RUNS, and the
 * reason they are taken from the LATER frame.
 *
 * This harness seeds from the sample at frame i-1 and then runs the object
 * chain, which on the cartridge is `$9A64`-`$9A73` -- a long way into NMI i.
 * Three zero-page bytes are already the NEW frame's by the time it gets there:
 *
 *   $02  `$80BE INC $02`, the free-running frame counter. Handlers fork on its
 *        low bits ($C415's AND #$03, and every "every other frame" gate), so a
 *        seed one behind puts the whole chain a frame out of phase.
 *   $05  the edge-detected buttons and
 *   $07  the held buttons, both filled by `$81BF`'s controller strobe.
 *        `updatePlayer` reads them, the player moves, and every aiming routine
 *        ($BCB5, $BDFA) reads the player's NEW position -- so a stale pair
 *        produces velocities that are right for the wrong frame.
 *
 * Taking them from sample i is not an approximation: `$80B5` samples at the END
 * of NMI i and nothing between `$81BF` and `$80B5` writes any of the three
 * again, so sample i's copies ARE the values the object chain read.
 *
 * MEASURED, on the stage-6 run: seeding all three from i-1 gave 1,200 field
 * divergences over 503,307 comparisons, 1,034 of them the `$040C,X` shot
 * countdown alternating +-1 -- the signature of a one-frame phase error, not of
 * a wrong constant.
 */
const PROLOGUE_BYTES = [0x02, 0x05, 0x07];

/**
 * `$9650-$965A`, THE FOUR STORES EVERY MODE-5 FRAME MAKES BEFORE THE BODY:
 *
 *   9650 LDA #$0C / STA $13      9656 STA $5D / 9658 STA $5B / 965A STA $5C
 *
 * A sample taken at `$80B5` is taken AFTER the frame filled `$5D` and `$5B`
 * again, so seeding them from it hands the object chain last frame's leftovers.
 * `$5D` in particular is load-bearing: `$BBB7 LDA $5D / BNE $BC19` skips the
 * whole enemy-shot countdown, so a stale non-zero `$5D` makes the port miss a
 * decrement the board made.
 *
 * MEASURED. Before this line, the stage-6 run had 405 `$040C,X` divergences and
 * every one of them was the port failing to decrement on a frame the board did.
 * After it, zero. That is a defect in this HARNESS, found and fixed here; it is
 * not a statement about `src/`, which was never touched.
 *
 * `$5C` is zeroed for the same reason and with one caveat, which the comparator
 * counts rather than hides: `$9663` writes `$5C` again, later in the same
 * prologue, but ONLY when `$19 == 4`. A run that compares frames on which the
 * board held `$19 == 4` therefore needs `$9663`'s census replayed, and this
 * harness does not replay it -- so those frames are counted and reported.
 */
const PROLOGUE_ZEROED = [0x5D, 0x5B, 0x5C];

function seedAt(ram, frame, pokes) {
  const slice = ram.slice(frame * RAM_FRAME, (frame + 1) * RAM_FRAME);
  for (const p of pokes) if (frame >= p.from && frame <= p.to) slice[p.addr] = p.val;
  for (const a of PROLOGUE_BYTES) slice[a] = ram[(frame + 1) * RAM_FRAME + a];
  for (const a of PROLOGUE_ZEROED) slice[a] = 0;
  const state = createState();
  // The video seed is IRRELEVANT here and is passed as zeros rather than
  // omitted, because seedFromCartridge() builds a complete machine or none.
  // Nothing in the object chain reads the nametable, the palette or hardware
  // OAM -- the shadow OAM at $0200-$02FF, which $8B10 does read, comes out of
  // `ram` above like every other byte.
  seedFromCartridge(state, {
    ram: slice,
    vram: new Uint8Array(0x800),
    palette: new Uint8Array(32),
    oam: new Uint8Array(256),
  });
  return state;
}

const hex = (v) => '$' + v.toString(16).toUpperCase().padStart(2, '0');

/** `$AE1C`'s 42-entry dispatch table, read out of the exported ROM tables so
 *  the coverage lines name HANDLERS and not just type bytes. `$83E4`'s ASL is
 *  eight-bit, so the index is `type AND $7F` and >= 42 is off the end. */
function handlerOf(rom, t) {
  if (t >= 42) return 'off the end of $AE1C (42 entries)';
  try { return '$' + rom.word(0xAE1C + 2 * t).toString(16).toUpperCase(); }
  catch { return '(not in the exported table window)'; }
}

// ---------------------------------------------------------------------------
function runStep(man, rows, ram, opt, res) {
  const pokes = parsePokes(man.poke);
  const fields = Object.entries(man.fields);          // [name, boardAddr]
  const st0 = createState();
  for (const [name] of fields) {
    if (!(name in st0.obj)) {
      throw new Error(`the dump names a field '${name}' that state.obj does `
                    + 'not have. stagepoke.py FIELDS_FULL and src/state.js have '
                    + 'drifted apart.');
    }
  }

  let compared = 0, spawnRows = 0, reuse = 0, fork = 0, threw = 0, bad = 0;
  const perField = {};
  const first = [];
  const typesSeen = new Map();      // type -> frames compared
  const typesBad = new Map();       // type -> field divergences
  const animsSeen = new Set();
  const freed = new Set();
  const note = (m) => { if (first.length < opt.limit) first.push(m); };

  for (const r of rows) {
    const i = r.frame;
    const prev = r.prevType, now = r.type;
    if (opt.only && !opt.only.has(prev & 0x7F) && !opt.only.has(now & 0x7F)) continue;
    // A row whose BEFORE has no object is a SPAWN frame: `$A2C0` created it
    // earlier in the same frame. The `enemies` pipeline does not replay the
    // spawn engine, so it has nothing to compare; `tail` does.
    if (prev === 0) { spawnRows += 1; if (opt.pipeline !== 'tail') continue; }
    // The handler can leave the type as-is, OR in $80 (its init arm), or zero
    // it (freed). ANY OTHER VALUE means `$A2C0` re-allocated the slot to a new
    // enemy in the same frame, so the sampled `after` is a different object and
    // there is nothing here to compare. Ruled out by the type byte, not by the
    // frame number.
    if (prev !== 0 && ![0, prev, prev | 0x80, prev & 0x7F].includes(now)) {
      reuse += 1; continue;
    }

    // `$9663`'s census is NOT replayed here (see PROLOGUE_ZEROED). It only runs
    // when the board held `$19 == 4` DURING the frame -- which is the seed
    // frame's byte with the run's own pokes applied on top, not the seed byte
    // alone. Reading the seed byte alone left the first frame of every poke
    // window in the comparison, and those six frames were the only non-$CA5E
    // divergences the stage-5 run had: f2321 and f4371, the two window edges.
    let z19 = ram[(i - 1) * RAM_FRAME + 0x19];
    for (const p of pokes) {
      if (p.addr === 0x19 && i - 1 >= p.from && i - 1 <= p.to) z19 = p.val;
    }
    // WAVE 42. `$19 == 4` ALONE IS NOT THE FORK. $9663 is three conditions and
    // the harness was skipping on the first:
    //
    //   9665  CMP #$04 / BNE $96A5          $19 == 4
    //   9683  STX $5C / CPX #$02 / BCC      the census found TWO live groups
    //   9689  LDA $02 / LSR A / BCC $96A5   and the frame counter is ODD
    //
    // All three are readable out of the board's own film at sample i. `$5C` is
    // what the board WROTE at `$9683` on that very frame, so it needs no
    // re-derivation -- and it is only meaningful when `$19` was 4, which is
    // exactly when it is consulted. `$02` at sample i is the post-`$80BE`-INC
    // value the frame ran on (the same sample the NMI prologue fix takes).
    // Measured: this turns 142 skipped frames on `s5-chunks` into 4, and every
    // one of the newly compared frames agrees with the board.
    const z5C = ram[i * RAM_FRAME + 0x5C];
    const z02 = ram[i * RAM_FRAME + 0x02];
    if (z19 === 4 && z5C >= 2 && (z02 & 1) !== 0) { fork += 1; continue; }
    const st = seedAt(ram, i - 1, pokes);
    // WAVE 42. `$9663`'s census IS replayed now, not skipped: it is four RAM
    // reads over the pool `seedAt` already loaded, and `$5C` is what `$CB8A`
    // gates on. The board wrote its own `$5C` at `$9683` on this frame, so the
    // two are compared below -- the census is CHECKED, not assumed.
    if (z19 === 4) st.zp5C = armCensus(st);      // $9663-$9683 STX $5C

    try {
      if (opt.pipeline === 'tail') {
        // WAVE 42. `$9A5E LDA $5C / CMP #$02 / BCS $9A70` is a FOURTH `$5C >= 2`
        // gate and the tail was running straight through it. When two arm groups
        // are live the frame does NOT spawn, does NOT run the enemy bullets,
        // does NOT move the player and does NOT dispatch `$ADAB` -- `$968E`'s
        // fork does all four on the ODD frames instead. `src/nmi.js`
        // mode5Body() has had this branch since W32b; only this harness lacked
        // it, and the blanket `$19 == 4` skip hid that. It is what f2321 and
        // f4371 -- W40's two unexplained "window edge" frames -- actually are:
        // the board's whole object chain was skipped and nothing moved, which
        // is measurable in the film (0 bytes of every live slot changed).
        if (st.zp5C < 2) {                       // $9A5E-$9A62 BCS $9A70
          spawnEngine(st, res);                  // $9A64
          enemyBullets(st, res);                 // $9A67
          updatePlayer(st, res);                 // $9A6A
          updateEnemies(st, res);                // $9A6D
        }
        shotSweep(st, res);                      // $9A70 -> $C0C7
        applyCapsule(st, res);                   // $9A73
        // `$9A73` IS NOT THE END OF THE OBJECT CHAIN ON A STAGE-5 FRAME.
        // `$9A76 JSR $C772` is `LDA $19 / CMP #$04 / JMP $CB8A`, and `$CB8A`
        // runs the arm driver whenever `$5C < 2`. It writes object bytes --
        // the owner's `$016C,X` among them -- so leaving it out made 16 fields
        // on `s5-chunks` divergent the moment the fork skip was narrowed.
        if (z19 === 4) armDriverGated(st, res.enemyTables);   // $9A76
      } else {
        updateEnemies(st, res);                  // $9A6D alone
      }
    } catch (e) {
      // An unported path throws by ROM address. That is a MISMATCH, not a crash.
      threw += 1; bad += 1;
      note(`f${i} slot ${r.slot} type ${hex(prev)} PORT THREW: `
         + e.message.slice(0, 100));
      continue;
    }

    compared += 1;
    // `$5C` -- the census the harness used to skip past. The board's byte at
    // sample i is `$9683 STX $5C` from this very frame.
    if (z19 === 4 && st.zp5C !== z5C) {
      perField.z5C = (perField.z5C || 0) + 1;
      bad += 1;
      note(`f${i} $5C: port ${hex(st.zp5C)} board ${hex(z5C)} ($9663's census)`);
    }
    typesSeen.set(prev & 0x7F, (typesSeen.get(prev & 0x7F) || 0) + 1);
    const k = r.slot + ENEMY_BASE;
    for (const [name, addr] of fields) {
      const got = st.obj[name][k];
      const want = ram[i * RAM_FRAME + addr + r.slot];
      if (got !== want) {
        perField[name] = (perField[name] || 0) + 1;
        typesBad.set(prev & 0x7F, (typesBad.get(prev & 0x7F) || 0) + 1);
        bad += 1;
        note(`f${i} slot ${r.slot} type ${hex(prev)} ${name}: `
           + `port ${hex(got)} board ${hex(want)}`);
      }
    }
    animsSeen.add(ram[i * RAM_FRAME + 0x012C + r.slot]);
    if (now === 0) freed.add(prev & 0x7F);
  }

  console.log(`indexed slot-frames        : ${rows.length}`);
  console.log(`  spawn frames (no BEFORE) : ${spawnRows}`
    + (opt.pipeline === 'tail' ? ' (compared: the tail replays $A2C0)'
      : ' (skipped: --pipeline enemies does not replay $A2C0)'));
  console.log(`  slot re-used same frame  : ${reuse} (nothing to compare)`);
  console.log(`  $9663 FORK frames skipped: ${fork} (all three of $19==4, `
    + '$5C>=2 and $02 odd -- $968E is not replayed here)');
  console.log(`frames compared            : ${compared}`);
  console.log(`fields per frame           : ${fields.length}`
    + `  -> ${compared * fields.length} field comparisons`);
  console.log(`  port THREW on            : ${threw}`);
  console.log(`FIELD DIVERGENCES          : ${bad}`);
  for (const [f, n] of Object.entries(perField)) console.log(`    ${f}: ${n}`);
  if (first.length) {
    console.log('  first divergences (frame-ordered):');
    for (const l of first) console.log('    ' + l);
  }
  console.log('');
  console.log('COVERAGE -- types and handlers, never frames');
  const rom = res.enemyTables;
  for (const [t, n] of [...typesSeen].sort((a, b) => a[0] - b[0])) {
    const h = handlerOf(rom, t);
    const nb = typesBad.get(t) || 0;
    console.log(`  type ${hex(t)} -> ${h}  : ${n} frames compared, `
      + `${nb} field divergences`
      + (freed.has(t) ? ', freed the slot at least once' : ''));
  }
  console.log('  metasprites the board showed: '
    + [...animsSeen].sort((a, b) => a - b).map(hex).join(' '));
  return bad;
}

// ---------------------------------------------------------------------------
function runSpawn(man, rows, ram, opt, res) {
  const fields = Object.keys(man.fields).filter((f) => f !== 'type');
  let compared = 0, bad = 0;
  const perField = {};
  const first = [];
  const note = (m) => { bad++; if (first.length < opt.limit) first.push(m); };
  const typesSeen = new Map();

  for (const r of rows) {
    const s = createState();
    s.substate = 0x82;              // $A2F7 -> $A2FB JMP $C413, the late spawner
    s.spawn.z60 = 2;                // the engine's running state
    s.zp19 = r.z19;                 // the poked stage, or the control row's
    s.frame = u8(r.z02);            // $02 as the board had it on the spawn frame
    s.spawn.z69 = r.z69_m1;         // the PRE-INC cursor sub_$C44F reads
    // WAVE 42. `$69` IS NOT THE ONLY ZP THE ELEVEN LATE SPAWNERS READ, and
    // seeding only `$69` silently restricted this mode to the `sub_$C44F`
    // family ($C486, $C546, $C5AD, $C6DE -- W31's stage-4 entry among them).
    // `$C653` (stage 5) and `$C686` (the warp rain) gate on `$68` instead:
    // `$C653 INC $68 / CMP #$28 / BCC RTS` fires one frame in $28, so a `$68`
    // of 0 makes the port do NOTHING and every field reads as divergent. That
    // was measured, not guessed: seven $C653 spawns compared 78 divergent with
    // `$69: port 1 vs cart 2`, i.e. the cursor never even advanced.
    // Taken from the board's own film at frame i-1, which is exact -- nothing
    // writes $68 between $80B5 and $A2F7.
    s.spawn.z68 = ram[(r.frame - 1) * RAM_FRAME + 0x68];
    // $C41E scans slots 9..0 for an empty one. Occupy the ones above the slot
    // the board used so the port's scan lands on the same index.
    for (let j = 9; j > r.slot; j--) s.obj.type[j + ENEMY_BASE] = 0x27;

    spawnEngine(s, res);
    const i = r.slot + ENEMY_BASE;
    compared++;
    typesSeen.set(r.type & 0x7F, (typesSeen.get(r.type & 0x7F) || 0) + 1);

    // The board's row is sampled after $ADAB dispatched and the handler's init
    // arm has already OR'd in $80; the port's row is pre-dispatch. Compare the
    // low seven bits -- which is where the arm's own constant is.
    if ((s.obj.type[i] & 0x7F) !== (r.type & 0x7F)) {
      note(`f${r.frame} type ${hex(s.obj.type[i] & 0x7F)} vs ${hex(r.type & 0x7F)}`);
      perField.type = (perField.type || 0) + 1;
    }
    for (const f of fields) {
      const p = s.obj[f][i];
      if (p !== r[f]) {
        perField[f] = (perField[f] || 0) + 1;
        note(`f${r.frame} ${f}: port ${hex(p)} vs cart ${hex(r[f])}`);
      }
    }
    if (s.spawn.z69 !== r.z69) {
      perField.z69 = (perField.z69 || 0) + 1;
      note(`f${r.frame} $69: port ${s.spawn.z69} vs cart ${r.z69}`);
    }
  }

  console.log(`spawns compared : ${compared}`);
  console.log(`fields per spawn: ${fields.length + 2} (${fields.length} object `
    + 'fields + the type\'s low seven bits + the post-INC $69)');
  console.log(`DIVERGENCES     : ${bad}`);
  for (const [f, n] of Object.entries(perField)) console.log(`    ${f}: ${n}`);
  if (first.length) console.log('  first:\n    ' + first.join('\n    '));
  console.log('');
  console.log('COVERAGE -- types and handlers, never frames');
  const rom = res.enemyTables;
  for (const [t, n] of [...typesSeen].sort((a, b) => a[0] - b[0])) {
    console.log(`  type ${hex(t)} -> ${handlerOf(rom, t)}  : ${n} spawns`);
  }
  return bad;
}

// ---------------------------------------------------------------------------
/**
 * CHAIN MODE -- the whole FRAME, not the object chain, for a run that poked
 * `$1B` as well as `$19`.
 *
 * `stagepoke.py --mode chain` warps the board into a mode-5 sub-state ladder it
 * would otherwise need a seven-stage clear to enter. Nothing in that ladder is
 * an enemy handler, so the single-step object comparison above says nothing
 * about it. This instead seeds ONE port machine from the cartridge's 2 KB at the
 * poke frame, applies the same two pokes at the same instant, and then runs the
 * port's whole `nmi()` forward on the SAME buttons the board was driven with --
 * comparing the flow bytes every frame.
 *
 * WHY THE POKED ENTRY IS NOT A FABRICATION, which is the thing to check before
 * trusting any of it: `$9872` WRITES the checkpoint triple rather than reading
 * it -- `$26,X := 0`, `$24,X := 0`, `$22,X := ($42 ? 1 : 0)` -- and only then
 * `INC $28,X`. So the sole pieces of accumulated run state the chain consumes
 * are `$28,X` (the loop counter) and `$42` (the meter), and both are plain RAM
 * bytes with the same values ordinary stage-1 play leaves. A poked first wrap
 * is state the cartridge really does reach; a poked SECOND wrap would need
 * `$28,X` seeded too, and is a different claim.
 */
function runChain(dir, ram, opt, res) {
  const chain = JSON.parse(readFileSync(join(dir, 'chain.json'), 'utf8'));
  const probeRun = JSON.parse(readFileSync(join(dir, 'run.json'), 'utf8'));
  const at = chain.at;
  const buttons = parseScript(probeRun.inputScript);
  const frames = Math.min(opt.chainFrames || 1400, probeRun.gameFrames - at - 1);

  // The eight bytes the ladder is MADE of, board address -> port accessor.
  const WATCH = [
    ['$1B substate', 0x1B, (s) => s.substate],
    ['$19 stage', 0x19, (s) => s.zp19],
    ['$1A loop', 0x1A, (s) => s.zp1A],
    ['$28 loopCount', 0x28, (s) => s.save28[0]],
    ['$57 streamer', 0x57, (s) => s.build.ahead],
    ['$5B ranThisFrame', 0x5B, (s) => s.zp5B],
    ['$4F typewriter', 0x4F, (s) => s.zp4F],
    ['$D4 sound', 0xD4, (s) => s.snd[0xD4 - 0xB0]],
  ];
  // AND THE TWO OBJECT SLOTS THE BRAIN SCENE USES. Without them the flow bytes
  // alone are blind to the brain's 26-record path: mutant END-3 ($BB2F's
  // six-frame cadence) came back GREEN on the eight bytes above, because the
  // path moves the OBJECT and not the ladder. `$988C` writes slot 9 (the brain,
  // type $28) and slot 8 (its metasprite $9E companion), and nothing else in
  // the chain touches either -- so these are the scene itself.
  for (const slot of [8, 9]) {
    for (const [nm, base, arr] of [['type', 0x030C, 'type'], ['x', 0x036C, 'x'],
      ['y', 0x032C, 'y'], ['anim', 0x012C, 'anim'], ['timer', 0x014C, 'timer'],
      ['animFrame', 0x016C, 'animFrame'], ['status', 0x010C, 'status'],
      ['s0460', 0x046C, 's0460'], ['s0480', 0x048C, 's0480']]) {
      WATCH.push([`slot${slot}.${nm}`, base + slot,
        (s) => s.obj[arr][slot + ENEMY_BASE]]);
    }
  }

  const state = createState();
  seedFromCartridge(state, {
    ram: ram.slice(at * RAM_FRAME, (at + 1) * RAM_FRAME),
    vram: new Uint8Array(0x800), palette: new Uint8Array(32),
    oam: new Uint8Array(256),
  });
  // EVERY poke the run made, applied to the port at the same instant probe.lua
  // applied it to the board: AFTER sample `g`, so it first bites on `g + 1` on
  // both sides. `--mode chain` can carry more than the two ($0028, the loop
  // counter, is the one that makes a LATER wrap reachable), so this walks the
  // manifest's own string rather than re-stating the two by hand -- the first
  // draft applied only $19 and $1B and the loop-6 run then diverged on $28 and
  // $1A for 1,400 frames, which is a harness that did not do what the board did.
  const SET = {
    0x19: (s, v) => { s.zp19 = v; }, 0x1B: (s, v) => { s.substate = v; },
    0x28: (s, v) => { s.save28[0] = v; }, 0x29: (s, v) => { s.save28[1] = v; },
    0x40: (s, v) => { s.zp.speed = v; }, 0x41: (s, v) => { s.zp.missile = v; },
    0x42: (s, v) => { s.zp.meter = v; }, 0x44: (s, v) => { s.zp.weapon = v; },
    0x45: (s, v) => { s.zp.options = v; }, 0x46: (s, v) => { s.zp.shield = v; },
  };
  const chainPokes = parsePokes(chain.poke);
  for (const p of chainPokes) {
    if (!SET[p.addr]) {
      throw new Error(`chain mode has no port-side model for the poke at `
                    + `$${p.addr.toString(16)}; add one to SET rather than `
                    + 'letting the two sides run different experiments.');
    }
  }
  const applyPokes = (g) => {
    for (const p of chainPokes) {
      if (g >= p.from && g <= p.to) SET[p.addr](state, p.val);
    }
  };
  applyPokes(at);

  let compared = 0, bad = 0, threw = null;
  const perField = {};
  const first = [];
  const ladderPort = [], ladderBoard = [];
  let prevP = null, prevB = null;
  for (let g = at + 1; g <= at + frames; g++) {
    try {
      nmi(state, buttons[g] ?? 0, res, false);
    } catch (e) {
      threw = { g, m: String(e && e.message || e) };
      break;
    }
    compared += 1;
    const p = WATCH.map(([, , get]) => get(state));
    const b = WATCH.map(([, a]) => ram[g * RAM_FRAME + a]);
    const p8 = p.slice(0, 8), b8 = b.slice(0, 8);
    if (prevP === null || String(p8) !== String(prevP)) {
      ladderPort.push([g - at, ...p8]); prevP = p8;
    }
    if (prevB === null || String(b8) !== String(prevB)) {
      ladderBoard.push([g - at, ...b8]); prevB = b8;
    }
    applyPokes(g);                       // the same instant as probe.lua
    for (let k = 0; k < WATCH.length; k++) {
      if (p[k] !== b[k]) {
        perField[WATCH[k][0]] = (perField[WATCH[k][0]] || 0) + 1;
        bad += 1;
        if (first.length < opt.limit) {
          first.push(`f${g} (+${g - at}) ${WATCH[k][0]}: port ${hex(p[k])} `
                   + `board ${hex(b[k])}`);
        }
      }
    }
  }

  console.log(`poked at f${at}: $19 := ${chain.stage}, $1B := ${hex(chain.sub)}`);
  console.log(`frames run through the PORT'S OWN nmi(): ${compared}`);
  if (threw) console.log(`  PORT THREW at f${threw.g}: ${threw.m.slice(0, 110)}`);
  console.log(`fields per frame          : ${WATCH.length}`
    + `  -> ${compared * WATCH.length} field comparisons`);
  console.log(`FIELD DIVERGENCES         : ${bad}`);
  for (const [f, n] of Object.entries(perField)) console.log(`    ${f}: ${n}`);
  for (const l of first) console.log('    ' + l);
  console.log('');
  console.log('THE LADDER, BOARD (offset from the poke frame; the eight flow '
    + 'bytes only):');
  for (const r of ladderBoard) {
    console.log('  +' + String(r[0]).padStart(5) + '  '
      + WATCH.slice(0, 8).map(([n], k) => `${n.split(' ')[0]}=${hex(r[k + 1])}`)
        .join(' '));
  }
  if (threw) bad += 1;
  return bad;
}

// ---------------------------------------------------------------------------
function main(argv) {
  const opt = parseArgs(argv);
  const dir = opt.dir || join(HERE, 'out', 'stagepoke', opt.tag);
  let dump;
  try {
    dump = JSON.parse(readFileSync(join(dir, 'dump.json'), 'utf8'));
  } catch {
    if (existsSync(join(dir, 'chain.json'))) {
      const ramC = readFileSync(join(dir, 'run.ram'));
      console.log('=========================================================');
      console.log('INTERVENTION RUN (chain mode) -- $19 AND $1B both forced.');
      console.log('=========================================================');
      const badC = runChain(dir, ramC, opt, headlessResources(0));
      console.log('');
      console.log(badC === 0 ? 'RESULT: 0 divergent.' : `RESULT: ${badC} DIVERGENT.`);
      return badC === 0 ? 0 : 1;
    }
    console.error(`no ${join(dir, 'dump.json')}. Run stagepoke.py --tag `
                + `${opt.tag} first (it needs Mesen + the ROM).`);
    return 2;
  }
  const man = dump.manifest;
  const ram = readFileSync(join(dir, 'run.ram'));
  if (ram.length !== man.ramFrames * RAM_FRAME) {
    console.error(`run.ram is ${ram.length} bytes, the manifest says `
                + `${man.ramFrames} frames x ${RAM_FRAME}. Mismatched run.`);
    return 2;
  }

  console.log('=========================================================');
  console.log(`INTERVENTION RUN -- ${man.provenance}`);
  console.log(`mode ${man.mode}   $19 forced to ${man.stage} across `
    + man.windows.map(([a, b]) => `f${a}-f${b}`).join(', ')
    + `   restore ${man.restore}`);
  console.log(`script ${man.script}`);
  console.log(`$19 on the board: `
    + JSON.stringify(man.verify.z19) + `   $5C: ` + JSON.stringify(man.verify.z5C));
  console.log('=========================================================');

  const res = headlessResources(0);
  const bad = man.mode === 'spawn'
    ? runSpawn(man, dump.rows, ram, opt, res)
    : runStep(man, dump.rows, ram, opt, res);
  console.log('');
  console.log(bad === 0 ? 'RESULT: 0 divergent.' : `RESULT: ${bad} DIVERGENT.`);
  console.log('This is an INTERVENTION run. It says the port\'s code agrees with '
    + 'the cartridge\nunder a forced state. It says NOTHING about how this stage '
    + 'plays.');
  return bad === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
