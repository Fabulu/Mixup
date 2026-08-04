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
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createState, ENEMY_BASE, u8 } from '../../src/state.js';
import {
  spawnEngine, enemyBullets, updateEnemies,
} from '../../src/enemies.js';
import { updatePlayer } from '../../src/player.js';
import { shotSweep } from '../../src/collision.js';
import { applyCapsule } from '../../src/powerup.js';
import { headlessResources } from '../../tests/helpers.js';
import { seedFromCartridge } from './porttrace.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const RAM_FRAME = 0x800;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const o = { tag: null, limit: 12, pipeline: 'enemies', dir: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tag') o.tag = argv[++i];
    // --dir points at a dump directory OUTSIDE this checkout. It exists for
    // MUTATION TESTING: src/ is copied to a scratch tree, mutated there, and
    // the copy's comparator is pointed back at the real run's dump, so a
    // mutant is proved to go red without a single byte of src/ being touched.
    else if (a === '--dir') o.dir = argv[++i];
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--pipeline') o.pipeline = argv[++i];
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

function seedAt(ram, frame, pokes) {
  const slice = ram.slice(frame * RAM_FRAME, (frame + 1) * RAM_FRAME);
  for (const p of pokes) if (frame >= p.from && frame <= p.to) slice[p.addr] = p.val;
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
  const animsSeen = new Set();
  const freed = new Set();
  const note = (m) => { if (first.length < opt.limit) first.push(m); };

  for (const r of rows) {
    const i = r.frame;
    const prev = r.prevType, now = r.type;
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

    const st = seedAt(ram, i - 1, pokes);
    // `$9A5E BCS $9A70`: with two or more arm groups censused the cartridge
    // runs the `$968E` fork instead, in a DIFFERENT order. Those frames are not
    // this comparison's frames; they are counted and skipped rather than
    // compared against the wrong sequence.
    if (st.zp5C >= 2) { fork += 1; continue; }

    try {
      if (opt.pipeline === 'tail') {
        spawnEngine(st, res);                    // $9A64
        enemyBullets(st, res);                   // $9A67
        updatePlayer(st, res);                   // $9A6A
        updateEnemies(st, res);                  // $9A6D
        shotSweep(st, res);                      // $9A70 -> $C0C7
        applyCapsule(st, res);                   // $9A73
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
    typesSeen.set(prev & 0x7F, (typesSeen.get(prev & 0x7F) || 0) + 1);
    const k = r.slot + ENEMY_BASE;
    for (const [name, addr] of fields) {
      const got = st.obj[name][k];
      const want = ram[i * RAM_FRAME + addr + r.slot];
      if (got !== want) {
        perField[name] = (perField[name] || 0) + 1;
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
  console.log(`  $968E fork frames ($5C>=2): ${fork} (a different frame order)`);
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
    console.log(`  type ${hex(t)} -> ${h}  : ${n} frames compared`
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
function main(argv) {
  const opt = parseArgs(argv);
  const dir = opt.dir || join(HERE, 'out', 'stagepoke', opt.tag);
  let dump;
  try {
    dump = JSON.parse(readFileSync(join(dir, 'dump.json'), 'utf8'));
  } catch {
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
