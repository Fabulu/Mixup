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
//           ported. There are exactly three, all of them sprite-work counts
//           that the cartridge's ENEMIES contribute to (src/nmi.js: "$9A6D JSR
//           $ADAB -- the enemies. Not ported."). They are measured, printed and
//           NOT failed -- but the divergence is printed, because an INFO field
//           that silently matched would mean the enemies had stopped existing.
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
 * The fields the cartridge's ENEMIES contribute to. src/nmi.js does not run
 * $ADAB and src/oam.js does not model the $9F sprite budget, so the
 * cartridge's display list has records in it that the port's cannot.
 *
 * These are printed with their divergence counts and do not fail the run. The
 * printing is the point: an INFO field that suddenly MATCHED would mean the
 * enemies had stopped existing in the oracle run, which is a broken corpus, not
 * a fixed port.
 */
const INFO_FIELDS = new Map([
  ['msExpanded', 'the cartridge expands the enemies\' metasprites too ($ADAB not ported)'],
  ['spriteRecords', 'ditto -- enemy metasprite records'],
  ['spritesStored', 'ditto, and the $9F sprite budget is not modelled (src/oam.js)'],
  ['w_0036', '$36 is the OAM write cursor AFTER the whole display list; the '
           + 'cartridge walks it past the enemies\' sprites too ($8B95 STX $36)'],
]);

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
  // claims to model, and stops the instant it leaves it. Two exits, both of
  // them subsystems src/ says outright are absent:
  //
  //   $0100 != 1   the ship is dying. src/player.js: "$9FFC: AD 00 01 / C9 02 /
  //                90 03 / 4C 6F A1 -- the dead gate ... ($A16F onward is not
  //                ported)". Nothing in src/nmi.js can ever make it happen: no
  //                enemy loop, and probeCollision() is never called.
  //   $1B & $80    the mode-5 sub-state left the played state -- measured
  //                $80 -> $A0 on the same frame the ship dies.
  //
  // Truncating is not hiding: the stop frame and the reason are printed for
  // every scenario, and a corpus whose ships all die in the first 40 frames
  // would be obvious rather than quietly green (docs/knowledge/03, "report what
  // was skipped").
  let stoppedAt = null, stopReason = null;
  const frames = [];
  for (const f of all) {
    const o = byFrameO.get(f);
    if (o.w_0100 !== undefined && o.w_0100 !== 1) {
      stoppedAt = f;
      stopReason = `the cartridge's ship DIED ($0100 = ${o.w_0100}, `
                 + `$1B = $${o.w_001B.toString(16).toUpperCase()}); `
                 + `src/player.js does not port the $A16F death path and `
                 + `src/nmi.js runs no collision, so the port flies on`;
      break;
    }
    if (o.w_001B !== undefined && !(o.w_001B & 0x80)) {
      stoppedAt = f;
      stopReason = `the cartridge left the mode-5 PLAY sub-state `
                 + `($1B = $${o.w_001B.toString(16).toUpperCase()}, bit 7 clear); `
                 + `src/nmi.js's stagePlay() gate returns early there`;
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
  const portLagInWindow = port.frames
    .filter((r) => r.frame <= lastLive && r.lagged).length;
  const xs = frames.map((f) => byFrameO.get(f).playerX);
  const ys = frames.map((f) => byFrameO.get(f).playerY);
  return {
    name, why: oracle.why, script: oracle.inputScript, align: oracle.align,
    frames: frames.length, nominal: all.length, stoppedAt, stopReason, neuter,
    reach: { xMin: Math.min(...xs), xMax: Math.max(...xs),
             yMin: Math.min(...ys), yMax: Math.max(...ys) },
    results, skipped,
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
            + `Y ${r.reach.yMin}..${r.reach.yMax}`);
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
  console.log(`    lag: cartridge ${r.romLagTotal} total, `
            + `${r.romLagInWindow} inside the compared window; port ${r.portLag}`
            + `  [${r.romLagInWindow === r.portLag ? 'PASS' : 'FAIL'}]`);
  console.log(`    ${r.skipped.length} fields SKIPPED, each with a reason:`);
  for (const s of r.skipped) console.log(`      ${s.field}: ${s.why}`);
  console.log(`    ${r.constantFields.length}/${r.results.length} compared fields `
            + `never changed value in this scenario`);
  return { fail: bad.length + (r.romLagInWindow === r.portLag ? 0 : 1),
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

  console.log('\n=== SUMMARY ===');
  for (const r of rows) {
    const bad = r.results.filter((x) => x.tier === 'TIER1' && x.first !== null);
    const lagOk = r.romLagInWindow === r.portLag;
    const ok = bad.length === 0 && lagOk;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(13)} `
              + `${String(r.frames).padStart(4)} frames  `
              + (bad.length === 0 ? 'all TIER 1 fields exact'
                 : bad.map((x) => `${x.field}@${x.first}`).join(' '))
              + (lagOk ? '' : `  LAG rom ${r.romLagInWindow} port ${r.portLag}`));
  }
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

  if (missing) {
    console.log(`\n  ${missing} scenario(s) had NO ORACLE ARTIFACT. That is an `
              + `environmental skip (Mesen + the ROM), not a pass.`);
  }
  const truncated = rows.filter((r) => r.stoppedAt !== null);
  const compared = rows.reduce((n, r) => n + r.frames, 0);
  const nominal = rows.reduce((n, r) => n + r.nominal, 0);
  console.log(`\n  ${rows.length} scenarios, ${compared} of ${nominal} frames `
            + `compared (${truncated.length} truncated: `
            + (truncated.map((r) => `${r.name}@${r.stoppedAt}`).join(', ') || 'none')
            + `), ${fails} failures, ${uncovered} clamps uncovered, `
            + `${stale} stale annotations.`);
  return (fails || uncovered || stale) ? 1 : (rows.length === 0 ? 2 : 0);
}

if (process.argv[1]?.endsWith('compare.mjs')) process.exit(main(process.argv.slice(2)));
