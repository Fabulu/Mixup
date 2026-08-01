// compare.mjs -- run the port against the cartridge, field by field, and report
// the FIRST divergence per field with a window around the earliest one.
//
// docs/knowledge/01: "Report the FIRST divergence per field, plus a window
// around the earliest. That frame is the bug; everything after it is
// consequence." This file is that, for Gradius.
//
//   python games/gradius/tools/oracle/scen.py          # record the cartridge
//   node   games/gradius/tools/oracle/compare.mjs      # compare the port
//
// The oracle side is `out/scen/<name>.json`, produced by scen.py from two
// independent Mesen processes (probe.lua + objloop.lua) that were asserted to
// agree. The port side is produced HERE, in-process, by porttrace.mjs. Nothing
// is cached between the two, so a stale port trace cannot be mistaken for a
// fresh one.
//
// ============================== THE TWO TIERS ================================
//
// Tiers are assigned by WHAT THE PORT CLAIMS in src/, not by what turned out to
// be green -- otherwise the tier list becomes a record of the port's failures
// dressed up as design.
//
//   TIER 1  every field the port claims to reproduce. A single divergence here
//           fails the run.
//   INFO    fields that are downstream of a subsystem src/ says outright is not
//           ported. There is exactly ONE left ($36, the OAM write cursor, which
//           $8BAB re-walks using the unmodelled sprite budget $9F); the three
//           sprite-work counters that used to sit here became TIER 1 in wave 3
//           when the port grew enemies. See INFO_FIELDS below.
//
// Five probe.lua fields have no port counterpart at all (scanline, cpuCycle,
// spriteOverflow, oamBudget, splitSpins) plus pad2. They are listed as SKIPPED
// with the reason, every run, where it cannot be missed (docs/knowledge/03,
// "report what was skipped").

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tracePort, loadOracle, SCEN_DEFS, SCEN_OUT, NOT_PRODUCED, DERIVED,
         UNMODELLED } from './porttrace.mjs';
import { headlessResources } from '../../tests/helpers.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Fields that are downstream of a subsystem src/ says outright is not ported.
 * They are measured, printed and NOT failed -- but the divergence is printed,
 * because an INFO field that silently matched would mean the annotation was
 * stale and nobody noticed.
 *
 * THREE OF THESE RETIRED IN WAVE 3, and that is the mechanism working:
 * msExpanded, spriteRecords and spritesStored were INFO for the port's whole
 * life because "the cartridge expands the ENEMIES' metasprites too and we do
 * not have enemies". Wave 3 gave the port enemies, all three went to 0
 * divergent frames on all 18 scenarios (5045 of 5045), and they are TIER 1
 * from this commit -- a real check on the display list, not a footnote. If one
 * of them starts diverging again that is a REGRESSION, not a known gap.
 *
 * `w_0036` stays, WITH A CORRECTED REASON. The old one -- "the cartridge walks
 * it past the enemies' sprites" -- was wrong, and having enemies is what
 * proved it: the three sprite counters match exactly and $36 still differs on
 * every frame of every scenario. What actually moves it is $80AD JSR $8BAB,
 * the BLANK PASS, which walks $36 across the slots it fills with $F4 and
 * stores the walked cursor back at $8BC0. How many slots that is comes from
 * $37, i.e. from $9F, the sprite budget src/oam.js does not model (it clears
 * shadow OAM to $F4 in one go instead). Measured on `idle`: the cartridge's
 * $36 is 240, 52, 120, 188, 4, 72, ... -- exactly $2F's own +$44 rotation, not
 * the display list's end cursor at all.
 */
/**
 * The values of `$1B` src/nmi.js's `$96A5` ladder actually implements.
 *
 *   0-4  the five stage-intro states (jt_96C5 -> $9B3E $9BED $9C12 $9C1E $9C24)
 *   $80  play sub-state 0 (jt_982F entry 0, st_9A4D)
 *   $A0  DYING (the $96EF arm) -- wave 5. $C1D6 sets it (src/collision.js), the
 *        120-frame $4C countdown runs the full mode-5 body underneath it, and
 *        $979D ends it by running the stage intro in the same frame.
 *
 * What is still NOT here: $90 (next stage), $C0 (game over) and the play
 * sub-states $81-$8F. All three are throws in src/nmi.js's ladder, and no
 * scenario in the corpus reaches any of them.
 */
const MODELLED_1B = new Set([0, 1, 2, 3, 4, 0x80, 0xA0]);

const INFO_FIELDS = new Map([
  ['w_0036', '$36 is re-walked by the BLANK PASS $8BAB at $80AD and stored back '
           + 'at $8BC0; how far depends on $9F, the sprite budget src/oam.js '
           + 'does not model. NOT about enemies -- see the note in compare.mjs'],
]);

// ============================ THE DISPLAY LIST ==============================
//
// $0200-$02FF, the shadow OAM. Added to the watch list by the FINAL
// VERIFICATION pass (wave 99). Until then page $02 had ZERO watched addresses
// and every wave from 5 to 8 declared that as its largest blind spot in the
// same words: "a shot, missile or explosion sprite drawn at the wrong OAM
// slot, tile, attribute or Y while the counts all match -- green everywhere".
// The port has modelled the page all along (`state.shadowOam`, and
// porttrace.mjs's `peek` has mapped $0200-$02FF from the start); nothing ever
// asked the cartridge for it.
//
// WHY THE PAGE IS NOT PLAIN TIER 1. src/oam.js does `oam.fill(0xF4)` and says
// so: the cartridge's blank pass $8BAB writes $F4 into the Y BYTE ONLY of the
// slots past the display-list cursor, leaving their tile/attribute/X bytes
// stale from whichever frame last used that slot. The port clears all four.
// So on a HIDDEN slot, bytes 1..3 differ by construction and always will --
// 36,244 slot-frames of it on `idle` alone. Failing the run on that would be
// failing it for a divergence src/ declares in a comment.
//
// WHAT IS COMPARED INSTEAD IS EXACT, AND IT IS NOT WEAKER:
//
//   (A) the Y byte of every one of the 64 slots, on every frame, always. That
//       is the byte $8BAB actually writes, so nothing about the blank pass
//       excuses it -- and Y is what decides whether a sprite is on screen at
//       all and on which scanline.
//   (B) all four bytes of every LIVE slot -- a slot whose Y byte on the
//       CARTRIDGE is not $F4. Tile, attribute (palette, flips, priority) and X.
//
// So every sprite the cartridge actually draws is compared byte for byte, and
// the only thing excused is the contents of slots the PPU is not showing.
// The liveness test is taken from the ORACLE side on purpose: a port that drew
// nothing at all would have zero live slots and could not satisfy (B) by
// agreeing with itself -- which is why `live` is printed and why the corpus
// total is asserted non-zero in main().
//
// SEEN RED. Measured with the breaks in docs/worklog/gradius/99-final-verification.md.
const DLIST_BASE = 0x0200;
const DLIST_SLOTS = 64;
const DLIST_HIDDEN_Y = 0xF4;
const dlistKey = (a) => `w_${a.toString(16).toUpperCase().padStart(4, '0')}`;

/**
 * Compare the shadow OAM over one scenario's live window. Returns null when
 * page $02 is not in the watch list at all, which main() turns into a failure
 * on a full run rather than a silent skip: an artifact recorded before the page
 * was watched would otherwise make this whole block quietly stop running --
 * exactly the regression shape wave 5 wrote down about $0A.
 */
function compareDisplayList(frames, byFrameO, byFrameP) {
  const probe = byFrameO.get(frames[0]);
  if (probe[dlistKey(DLIST_BASE)] === undefined) return null;
  let live = 0, slotFrames = 0, yBad = 0, liveBad = 0, hiddenDiff = 0;
  const ex = [];
  for (const f of frames) {
    const o = byFrameO.get(f), p = byFrameP.get(f);
    for (let e = 0; e < DLIST_SLOTS; e++) {
      const b = DLIST_BASE + e * 4;
      slotFrames++;
      const ry = o[dlistKey(b)], py = p[dlistKey(b)];
      if (ry !== py) {
        yBad++;
        if (ex.length < 8) ex.push(`Y     f${f} slot ${e}: rom ${ry} port ${py}`);
        continue;
      }
      const isLive = ry !== DLIST_HIDDEN_Y;
      if (isLive) live++;
      for (let i = 1; i < 4; i++) {
        if (o[dlistKey(b + i)] === p[dlistKey(b + i)]) continue;
        if (isLive) {
          liveBad++;
          if (ex.length < 8) {
            ex.push(`${['', 'TILE', 'ATTR', 'X'][i].padEnd(5)} f${f} slot ${e}: `
                  + `rom ${o[dlistKey(b + i)]} port ${p[dlistKey(b + i)]}`);
          }
        } else hiddenDiff++;
      }
    }
  }
  return { live, slotFrames, yBad, liveBad, hiddenDiff, examples: ex };
}

function windowRows(oracle, port, field, at, radius = 4) {
  const out = [];
  for (let f = at - radius; f <= at + radius; f++) {
    const o = oracle.get(f); const p = port.get(f);
    if (!o || !p) continue;
    out.push({ f, rom: o[field], port: p[field], hit: f === at });
  }
  return out;
}

export function compareScenario(name, { neuter = null, res = null, quiet = false } = {}) {
  const defs = JSON.parse(readFileSync(SCEN_DEFS, 'utf8'));
  const oracle = loadOracle(name);
  if (!oracle) {
    return { name, missing: true,
             how: `python games/gradius/tools/oracle/scen.py --only ${name}` };
  }
  const port = tracePort({
    name, script: oracle.inputScript, frames: oracle.gameFrames,
    align: oracle.align, seed: oracle.seed, watch: defs.watch,
    poke: oracle.poke, neuter, res,
  });

  const byFrameO = new Map(oracle.frames.map((r) => [r.frame, r]));
  const byFrameP = new Map(port.frames.map((r) => [r.frame, r]));

  // The compared window is align+1 .. end. Assert it is not empty and that the
  // two sides cover exactly the same frames -- a comparison over an empty
  // intersection is the most dangerous green there is.
  const all = port.frames.map((r) => r.frame).filter((f) => byFrameO.has(f));
  if (all.length === 0 || all.length !== port.frames.length) {
    throw new Error(`${name}: port traced ${port.frames.length} frames but only `
                  + `${all.length} of them exist in the oracle artifact`);
  }

  // ---- THE LIVE WINDOW ------------------------------------------------------
  // The comparison runs for as long as the cartridge is in the state the port
  // claims to model, and stops the instant it leaves it. ONE exit is left:
  //
  //   $1B         the sub-state left the set the $96A5 ladder ports. This USED
  //                to be `!($1B & 0x80)`, i.e. "anything but play", which threw
  //                the whole stage intro away -- wave 4 ported states 0-4, so
  //                the rule is now a set and the intro scenarios compare.
  //
  // THE `$0100 != 1` EXIT IS GONE, and that is what wave 5 was for. It read
  // "the cartridge's ship DIED ... src/player.js does not port the $A16F death
  // path and src/nmi.js runs no collision, so the port flies on", and it cost
  // the corpus 843 of 6569 frames across six scenarios. src/collision.js now
  // runs $C0C7 from $9A70 on every mode-5 frame, $C1D6 sets $0100 = 2 and
  // $1B = $A0, the explosion walks $C0FA, $96EF counts $4C out and $979D
  // respawns -- so a dying cartridge is a state the port follows rather than one
  // it has to be excused from. Do not re-add this exit to make a red run green:
  // a death the port cannot follow is a FAILURE now, which is the point.
  //
  // Truncating is not hiding: the stop frame and the reason are printed for
  // every scenario, and a corpus whose ships all die in the first 40 frames
  // would be obvious rather than quietly green (docs/knowledge/03, "report what
  // was skipped").
  let stoppedAt = null, stopReason = null;
  const frames = [];
  for (const f of all) {
    const o = byFrameO.get(f);
    if (o.w_001B !== undefined && !MODELLED_1B.has(o.w_001B)) {
      stoppedAt = f;
      stopReason = `the cartridge's $1B reached `
                 + `$${o.w_001B.toString(16).toUpperCase()}, which src/nmi.js's `
                 + `$96A5 ladder does not port (it throws with the ROM address `
                 + `the arm would have reached)`;
      break;
    }
    frames.push(f);
  }
  if (frames.length === 0) {
    throw new Error(`${name}: the live window is EMPTY (${stopReason}) -- `
                  + `nothing was compared, which is not a pass`);
  }

  // knownFail: a diagnosed but unfixed divergence. Allowed to be red; a
  // SURPRISE PASS fails the run so the annotation cannot outlive the bug
  // (docs/knowledge/01).
  const known = new Map();
  for (const kf of defs.knownFail || []) {
    for (const f of kf.fields) known.set(f, kf);
  }

  const skipped = [];
  const results = [];
  for (const k of port.fields) {
    if (k === 'frame') continue;
    if (NOT_PRODUCED.includes(k)) {
      skipped.push({ field: k, why: 'no port counterpart (see porttrace.mjs)' });
      continue;
    }
    // Page $02 is graded by the DISPLAY LIST block, not field by field -- see
    // the long note above compareDisplayList(). It is NOT skipped: every byte
    // of it is compared there, under a rule the blank pass cannot excuse.
    if (k.startsWith('w_02')) continue;
    // A watched address the port does not model at all: every sample is null.
    // It is SKIPPED rather than counted as 239 divergences -- but only with a
    // written reason, and an unexplained null is itself a failure.
    if (byFrameP.get(frames[0])[k] === null) {
      const addr = k.startsWith('w_') ? k.slice(2) : null;
      const why = addr && UNMODELLED[addr];
      if (!why) {
        throw new Error(`${name}: field ${k} is null on the port side and has `
                      + `no entry in porttrace.mjs UNMODELLED -- either the `
                      + `port should model it or the reason must be written down`);
      }
      skipped.push({ field: k, why });
      continue;
    }
    let first = null, n = 0;
    for (const f of frames) {
      const o = byFrameO.get(f)[k];
      const p = byFrameP.get(f)[k];
      if (o === undefined) continue;             // oracle never watched it
      if (o !== p) { n++; if (first === null) first = f; }
    }
    results.push({
      field: k, first, count: n, total: frames.length,
      tier: known.has(k) ? 'KNOWN' : (INFO_FIELDS.has(k) ? 'INFO' : 'TIER1'),
      why: known.get(k)?.why || INFO_FIELDS.get(k) || null,
      knownName: known.get(k)?.name || null,
      derived: DERIVED.includes(k),
      window: first === null ? null : windowRows(byFrameO, byFrameP, k, first),
    });
  }

  // Lag is compared over the SAME live window, not over the whole run: a drop
  // that happens after the ship is already dead is not something the port was
  // ever asked to reproduce.
  const lastLive = frames[frames.length - 1];
  const romLagInWindow = oracle.lagDrops
    .filter((f) => f > oracle.align && f <= lastLive).length;
  // The port's side is a SUM, not a count of rows, for the same reason the
  // oracle's is: a frame can cost more than one NMI, and objloop.lua's own
  // `lagged` is a per-frame count (scen.py expands it back into a drop list).
  const portLagInWindow = port.frames
    .filter((r) => r.frame <= lastLive).reduce((n, r) => n + r.lagged, 0);
  const xs = frames.map((f) => byFrameO.get(f).playerX);
  const ys = frames.map((f) => byFrameO.get(f).playerY);
  // THE CARTRIDGE'S OWN DEATHS, counted over the live window. $0100 >= 2 is a
  // dying ship ($C1D6 STA $0100), and `deaths` counts the ENTRIES into that
  // state, not the frames. Both come from the ORACLE side on purpose: this is a
  // measurement of what the corpus contains, and a port that never dies must not
  // be able to satisfy it. Consumed by DEATH COVERAGE in main().
  const dyingAt = frames.filter((f) => (byFrameO.get(f).w_0100 ?? 0) >= 2);
  let deaths = 0;
  for (let i = 0; i < frames.length; i++) {
    const now = byFrameO.get(frames[i]).w_0100 ?? 0;
    const prev = i === 0 ? (byFrameO.get(frames[0]).w_0100 ?? 0)
                         : (byFrameO.get(frames[i - 1]).w_0100 ?? 0);
    if (now >= 2 && prev < 2) deaths++;
  }
  return {
    name, why: oracle.why, script: oracle.inputScript, align: oracle.align,
    frames: frames.length, nominal: all.length, stoppedAt, stopReason, neuter,
    reach: { xMin: Math.min(...xs), xMax: Math.max(...xs),
             yMin: Math.min(...ys), yMax: Math.max(...ys),
             dying: dyingAt.length, deaths, diedAt: dyingAt[0] ?? null },
    results, skipped,
    dlist: compareDisplayList(frames, byFrameO, byFrameP),
    romLagTotal: oracle.lagFrames, romLagInWindow, portLag: portLagInWindow,
    // A field that never varies across the whole run tells you nothing when it
    // matches. Counted and printed, per docs/knowledge/03 trap 4.3.
    constantFields: results.map((x) => x.field).filter((k) => new Set(
      frames.map((f) => byFrameO.get(f)[k])).size === 1
      && byFrameO.get(frames[0])[k] !== undefined),
  };
}

function fmt(v) { return v === null || v === undefined ? '--' : String(v); }

export function printScenario(r) {
  if (r.missing) {
    console.log(`  ${r.name.padEnd(13)} NO ORACLE ARTIFACT -- run: ${r.how}`);
    return { fail: 0, info: 0 };
  }
  const t1 = r.results.filter((x) => x.tier === 'TIER1');
  const bad = t1.filter((x) => x.first !== null);
  const info = r.results.filter((x) => x.tier === 'INFO');
  const infoBad = info.filter((x) => x.first !== null);
  const kn = r.results.filter((x) => x.tier === 'KNOWN');
  const knSurprise = kn.filter((x) => x.first === null);

  console.log(`\n=== ${r.name} === ${r.frames} of ${r.nominal} compared frames `
            + `(align ${r.align}${r.neuter ? `, NEUTER ${r.neuter}` : ''})`);
  console.log(`    script: ${r.script}`);
  console.log(`    ${r.why}`);
  console.log(`    reach: X ${r.reach.xMin}..${r.reach.xMax}  `
            + `Y ${r.reach.yMin}..${r.reach.yMax}  `
            + `dying ${r.reach.dying} frames in ${r.reach.deaths} death(s)`
            + (r.reach.diedAt === null ? '' : `, first at f${r.reach.diedAt}`));
  if (r.stoppedAt !== null) {
    console.log(`    TRUNCATED at frame ${r.stoppedAt} `
              + `(${r.nominal - r.frames} frames dropped): ${r.stopReason}`);
    if (r.frames * 4 < r.nominal) {
      console.log(`    WARNING: less than a quarter of this scenario was `
                + `comparable. Its stated purpose is only partly exercised.`);
    }
  }
  console.log(`    [${bad.length === 0 ? 'PASS' : 'FAIL'}] TIER 1: `
            + `${t1.length} fields, ${bad.length} divergent`);
  for (const x of bad) {
    console.log(`      ${x.field}: FIRST divergence at frame ${x.first} `
              + `(${x.count}/${x.total} frames differ)${x.derived ? '  [derived]' : ''}`);
    for (const w of x.window) {
      console.log(`          ${w.hit ? '>>' : '  '} f${String(w.f).padStart(4)}  `
                + `rom ${String(fmt(w.rom)).padStart(5)}   port ${String(fmt(w.port)).padStart(5)}`);
    }
  }
  if (kn.length) {
    // A knownFail field that MATCHES in one scenario is not a surprise: the
    // mechanism may simply not have fired inside that window. The annotation is
    // held to account at CORPUS level instead -- if no scenario at all shows
    // the divergence, the bug is gone and the annotation must be deleted.
    console.log(`    [KNOWN] ${kn.length} knownFail fields, `
              + `${kn.length - knSurprise.length} divergent here:`);
    for (const x of kn) {
      console.log(`      ${x.field}: ${x.count}/${x.total} differ`
                + (x.first === null
                   ? '  (mechanism did not fire in this window)'
                   : `, first at ${x.first}  [${x.knownName}]`));
    }
  }
  console.log(`    [INFO] ${info.length} fields downstream of unported subsystems:`);
  for (const x of info) {
    console.log(`      ${x.field}: ${x.count}/${x.total} frames differ`
              + `${x.first === null ? '  (NONE -- suspicious, see below)' : `, first at ${x.first}`}`
              + `  -- ${x.why}`);
  }
  if (r.dlist === null) {
    console.log('    [DISPLAY LIST] page $02 is NOT in the watch list -- '
              + 'not compared. Re-record: python games/gradius/tools/oracle/scen.py');
  } else {
    const d = r.dlist;
    const ok = d.yBad === 0 && d.liveBad === 0;
    console.log(`    [${ok ? 'PASS' : 'FAIL'}] DISPLAY LIST ($0200-$02FF): `
              + `${d.slotFrames} slot-frames, ${d.live} live; `
              + `${d.yBad} Y mismatches, ${d.liveBad} live-slot content `
              + `mismatches (tile/attr/X)`);
    for (const e of d.examples) console.log(`      ${e}`);
    console.log(`      ${d.hiddenDiff} hidden-slot byte1..3 differences -- `
              + `EXPECTED: src/oam.js fills $F4, $8BAB writes only the Y byte`);
  }
  console.log(`    lag: cartridge ${r.romLagTotal} total, `
            + `${r.romLagInWindow} inside the compared window; port ${r.portLag}`
            + `  [${r.romLagInWindow === r.portLag ? 'PASS' : 'FAIL'}]`);
  console.log(`    ${r.skipped.length} fields SKIPPED, each with a reason:`);
  for (const s of r.skipped) console.log(`      ${s.field}: ${s.why}`);
  console.log(`    ${r.constantFields.length}/${r.results.length} compared fields `
            + `never changed value in this scenario`);
  const dlistFail = r.dlist === null ? 0
    : (r.dlist.yBad ? 1 : 0) + (r.dlist.liveBad ? 1 : 0);
  return { fail: bad.length + (r.romLagInWindow === r.portLag ? 0 : 1) + dlistFail,
           info: infoBad.length };
}

function main(argv) {
  const args = new Map();
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) args.set(argv[i].slice(2), argv[i + 1] ?? '1');
    else if (i === 0 || !argv[i - 1].startsWith('--')) pos.push(argv[i]);
  }
  const defs = JSON.parse(readFileSync(SCEN_DEFS, 'utf8'));
  let names = defs.scenarios.map((s) => s.name);
  if (args.has('only')) names = String(args.get('only')).split(',');
  const neuter = args.get('neuter') || null;

  // One resource load for the whole run: the assets are ROM-derived and
  // identical for every scenario, and re-reading them 12 times only adds noise.
  const res = headlessResources(0);

  console.log('=== PORT vs CARTRIDGE ===');
  console.log(`    oracle artifacts: ${SCEN_OUT}`);
  if (neuter) console.log(`    NEUTER: ${neuter} -- this run is EXPECTED to be red`);

  let fails = 0, missing = 0;
  const rows = [];
  for (const n of names) {
    const r = compareScenario(n, { neuter, res });
    if (r.missing) { missing++; printScenario(r); continue; }
    const s = printScenario(r);
    fails += s.fail;
    rows.push(r);
  }

  // Whether this run covers the WHOLE corpus. Several coverage blocks below
  // only mean anything on a full run, and say so rather than failing a subset.
  const fullRun = names.length === defs.scenarios.length;

  console.log('\n=== SUMMARY ===');
  for (const r of rows) {
    const bad = r.results.filter((x) => x.tier === 'TIER1' && x.first !== null);
    const lagOk = r.romLagInWindow === r.portLag;
    const dlOk = r.dlist === null || (!r.dlist.yBad && !r.dlist.liveBad);
    const ok = bad.length === 0 && lagOk && dlOk;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(13)} `
              + `${String(r.frames).padStart(4)} frames  `
              + (bad.length === 0 ? 'all TIER 1 fields exact'
                 : bad.map((x) => `${x.field}@${x.first}`).join(' '))
              + (lagOk ? '' : `  LAG rom ${r.romLagInWindow} port ${r.portLag}`)
              + (dlOk ? '' : `  OAM Y${r.dlist.yBad}/live${r.dlist.liveBad}`));
  }

  // ---- DISPLAY LIST COVERAGE ------------------------------------------------
  // Same shape as CLAMP and DEATH coverage, and the same reason it is a
  // failure rather than a note: this block can stop running without anything
  // going red. If page $02 falls out of the watch list, or every artifact in
  // out/scen predates it being added, `dlist` is null on every scenario and
  // 12,294 frames of sprite content silently stop being compared. That is the
  // precise failure wave 5 recorded about $0A and it is worth a check of its
  // own. `live` being zero corpus-wide would mean the same thing one level
  // down: the page is watched, and the cartridge is drawing nothing.
  console.log('\n=== DISPLAY LIST COVERAGE ($0200-$02FF) ===');
  const dlRows = rows.filter((r) => r.dlist !== null);
  const dlLive = dlRows.reduce((n, r) => n + r.dlist.live, 0);
  const dlSlots = dlRows.reduce((n, r) => n + r.dlist.slotFrames, 0);
  const dlYBad = dlRows.reduce((n, r) => n + r.dlist.yBad, 0);
  const dlLiveBad = dlRows.reduce((n, r) => n + r.dlist.liveBad, 0);
  let dlistBad = 0;
  // NOT gated on fullRun, deliberately. A stale artifact is a stale artifact
  // whether one scenario is being run or all 36, and the subset run is exactly
  // where somebody re-records one scenario and compares it against 35 others
  // that still predate the watch-list change.
  if (dlRows.length !== rows.length) {
    dlistBad++;
    console.log(`  [FAIL] ${rows.length - dlRows.length} of ${rows.length} `
              + `scenarios have no watched page $02 -- their sprite content is `
              + `NOT being compared. Re-record: `
              + `python games/gradius/tools/oracle/scen.py`);
  }
  if (dlRows.length && dlLive === 0) {
    dlistBad++;
    console.log('  [FAIL] page $02 is watched but the cartridge has ZERO live '
              + 'sprite slots in the entire corpus -- the check is vacuous');
  }
  console.log(`  ${dlRows.length}/${rows.length} scenarios compared, `
            + `${dlSlots} slot-frames, ${dlLive} live (every byte of these `
            + `compared: Y, tile, attribute, X)`);
  console.log(`  [${dlYBad + dlLiveBad === 0 ? 'PASS' : 'FAIL'}] `
            + `${dlYBad} Y mismatches, ${dlLiveBad} live-slot content mismatches`);
  // ---- knownFail, held to account at corpus level ---------------------------
  // docs/knowledge/01: an unexpected PASS must fail the run so nobody forgets
  // to delete the annotation. Scoped to the whole corpus, because a scenario
  // whose window ends before the mechanism can fire proves nothing either way.
  console.log('\n=== knownFail ANNOTATIONS ===');
  let stale = 0;
  for (const kf of defs.knownFail || []) {
    const live = [];
    for (const r of rows) {
      for (const x of r.results) {
        if (kf.fields.includes(x.field) && x.first !== null) {
          live.push(`${r.name}:${x.field}@${x.first}`);
        }
      }
    }
    if (!live.length) stale++;
    console.log(`  [${live.length ? 'STILL BROKEN' : 'FAIL -- STALE'}] `
              + `${kf.name}: ${live.length} field/scenario pairs diverge`);
    console.log(`      ${live.slice(0, 6).join('  ')}`
              + (live.length > 6 ? `  (+${live.length - 6} more)` : ''));
    if (!live.length) {
      console.log('      Nothing diverges any more. The bug is fixed or the '
                + 'corpus no longer reaches it -- DELETE the annotation.');
    }
  }

  // ---- coverage, proportional to the content (docs/knowledge/03) ------------
  // "Ask of every scenario: which mutation would this catch?" The four clamp
  // constants in src/player.js are $F0/$10/$C0/$10. If no scenario in the
  // COMPARED window ever reaches one of them, the corresponding CMP is never
  // exercised and a wrong constant would sail through. This is a check on the
  // corpus, not on the port, and it can fail: deleting corner-br takes X_MAX
  // and Y_MAX with it.
  const clamps = [
    ['X_MAX 240 ($A028 CMP #$F0)', (r) => r.reach.xMax >= 240],
    ['X_MIN  16 ($A03A CMP #$10)', (r) => r.reach.xMin <= 16],
    ['Y_MAX 192 ($A052 CMP #$C0)', (r) => r.reach.yMax >= 192],
    ['Y_MIN  16 ($A06C CMP #$10)', (r) => r.reach.yMin <= 16],
  ];
  console.log('\n=== CLAMP COVERAGE (of the compared windows, not the scripts) ===');
  let uncovered = 0;
  for (const [label, test] of clamps) {
    const hit = rows.filter(test).map((r) => r.name);
    if (!hit.length) uncovered++;
    console.log(`  [${hit.length ? 'PASS' : 'FAIL'}] ${label}: `
              + (hit.length ? hit.join(', ') : 'REACHED BY NO SCENARIO'));
  }

  // ---- DEATH COVERAGE ------------------------------------------------------
  // A SCENARIO CAN STOP TESTING WHAT IT WAS BUILT FOR WITHOUT FAILING. The two
  // wave-5 terrain scenarios kill the ship by POKING one collision-map cell
  // ($05B3 for terrain-death), and that cell's address is a function of the
  // camera at the poke frame. Move the script, the align frame or the scroll
  // rate and the poke lands where the ship is not: NEITHER side dies, both sides
  // still agree, and the run prints `0 failures` while `terrain-death` has
  // silently become a second copy of `terrain-death-miss`. Same shape as the
  // CLAMP COVERAGE block above, and same reason it is a FAILURE and not a note.
  //
  // `expectDying` is measured from the ORACLE artifact -- the cartridge's own
  // $0100 -- so the port cannot satisfy it by agreeing with itself, and the
  // control (`terrain-death-miss`, expectDying 0) is as load-bearing as the
  // kills: it is what proves the poke is what does the killing.
  const expects = new Map(defs.scenarios
    .filter((s) => s.expectDying !== undefined)
    .map((s) => [s.name, s.expectDying]));
  console.log('\n=== DEATH COVERAGE (the cartridge\'s $0100 >= 2, in-window) ===');
  let deathBad = 0, deathTotal = 0, checked = 0, withDeaths = 0;
  for (const r of rows) {
    deathTotal += r.reach.dying;
    if (r.reach.dying) withDeaths++;
    const want = expects.get(r.name);
    if (want === undefined) continue;
    checked++;
    const ok = r.reach.dying === want;
    if (!ok) deathBad++;
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${r.name.padEnd(19)} `
              + `${String(r.reach.dying).padStart(3)} dying frames, expected `
              + `${want}${ok ? '' : '  <-- this scenario is no longer testing '
              + 'the death it was built for'}`);
  }
  if (fullRun && !expects.size) {
    console.log('  [FAIL] no scenario carries an expectDying at all');
    deathBad++;
  }
  console.log(`  ${deathTotal} dying frames across ${withDeaths} scenario(s); `
            + `${checked} of ${rows.length} carry an expectDying`);

  if (missing) {
    console.log(`\n  ${missing} scenario(s) had NO ORACLE ARTIFACT. That is an `
              + `environmental skip (Mesen + the ROM), not a pass.`);
  }
  const truncated = rows.filter((r) => r.stoppedAt !== null);
  const compared = rows.reduce((n, r) => n + r.frames, 0);
  const nominal = rows.reduce((n, r) => n + r.nominal, 0);
  // THE SKIPPED FIELD COUNT BELONGS ON THE VERDICT LINE. The gate's "0 SKIPPED"
  // counts STAGES; a commit that adds four UNMODELLED entries takes four fields
  // out of the comparison and every headline number stays identical. That
  // happened in wave 1 (8 skipped fields per scenario -> 10) and was invisible
  // until somebody diffed the per-scenario output by hand. docs/knowledge/03:
  // "if a check bounds its own coverage it must say so in its output".
  const skippedFields = [...new Set(rows.flatMap((r) => r.skipped.map((s) => s.field)))];
  console.log(`\n  ${rows.length} scenarios, ${compared} of ${nominal} frames `
            + `compared (${truncated.length} truncated: `
            + (truncated.map((r) => `${r.name}@${r.stoppedAt}`).join(', ') || 'none')
            + `), ${fails} failures, ${uncovered} clamps uncovered, `
            + `${deathBad} death-coverage failures, `
            + `${stale} stale annotations, `
            + `${dlistBad} display-list coverage failures, `
            + `${skippedFields.length} fields SKIPPED (${skippedFields.join(' ')}).`);
  return (fails || uncovered || stale || deathBad || dlistBad)
    ? 1 : (rows.length === 0 ? 2 : 0);
}

if (process.argv[1]?.endsWith('compare.mjs')) process.exit(main(process.argv.slice(2)));
