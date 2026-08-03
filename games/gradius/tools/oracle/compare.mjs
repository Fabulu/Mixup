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
 * W24 MADE THE PLAY SUB-STATES REAL: $81-$85 (countdown setup, the 768-frame
 *   countdown, the 1-frame transition, the boss-page despawn/advance, the boss
 *   fight) and $C0 (game over, the $96FB arm -- the $B0 jingle hold + the $4C
 *   continue-timeout countdown) are all ported now. $81-$85 run mode5Body so the
 *   1022 fields are produced; $C0 runs mode5Body during the $B0 hold. No scenario
 *   in the corpus REACHES any of them yet (no boss-page-reaching script -- see
 *   docs/worklog/gradius/24-qa-adversarial.md), but they are modelled, so the
 *   gate no longer truncates the instant $1B leaves $80.
 *
 * What is still NOT here: the play sub-states $87-$8D (intro-shared routines
 * reached through $982A rather than $96C5, and the ending chain $8B-$8D).
 * W27 ported $86/$9904 (stage-end), $90 (next stage) and $8E/$8F (the warp).
 */
const MODELLED_1B = new Set([0, 1, 2, 3, 4, 0x80, 0x81, 0x82, 0x83, 0x84, 0x85,
                             0x86, 0x8E, 0x90, 0xA0, 0xC0]);

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

/**
 * PPU $2000-$27FF, $3F00-$3F1F and hardware OAM at the last frame of the window.
 *
 * Returns { compared:false, why } when the window was truncated, so a scenario
 * that stopped early cannot report a silent pass -- main()'s VIDEO COVERAGE
 * block counts how many scenarios actually compared.
 *
 * `ntChanged` comes off the ORACLE artifact: it is how many of the 2048 bytes
 * the CARTRIDGE rewrote between the align frame and this one, i.e. how much of
 * the agreement is the port's own work and how much is the seed surviving
 * untouched. On a deep scenario that number is the whole answer to "is the seed
 * doing the work", so it is printed rather than left to be inferred.
 */
function compareVideo(name, oracle, port, stoppedAt, introInWindow) {
  if (stoppedAt !== null) {
    return { compared: false, why: `the window was truncated at f${stoppedAt}; `
           + `the cartridge left the state the port models, so its screen is `
           + `not something the port was asked to reproduce` };
  }
  const last = port.frames[port.frames.length - 1];
  if (!last || last.frame !== oracle.final.frame) {
    return { compared: false, why: `the port's last traced frame is `
           + `${last ? last.frame : 'none'} but the cartridge's video dump is `
           + `from f${oracle.final.frame}` };
  }
  const diff = (a, b) => {
    let n = 0, at = null;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) { n++; if (at === null) at = i; }
    }
    return { n, at };
  };
  const nt = diff(oracle.final.nt, port.finalVideo.nt);
  const pal = diff(oracle.final.pal, port.finalVideo.pal);
  // THE HARDWARE OAM IS GRADED BY THE DISPLAY LIST'S RULE, not byte for byte,
  // and this is measured rather than assumed: a straight comparison reported
  // 129 of 256 bytes differing on `deep-page3` and 146 on `idle` while the
  // nametable and palette were exact. The reason is the one src/oam.js already
  // declares -- it fills hidden slots with $F4 in all four bytes, and $8BAB
  // writes only the Y byte, leaving tile/attribute/X stale from whichever frame
  // last used the slot. Failing on that would be failing on a divergence the
  // port states in a comment (see the long DISPLAY LIST note above).
  //
  // So: the Y byte of all 64 slots, always; all four bytes of every slot the
  // CARTRIDGE is showing. What this adds over the display-list block -- which
  // already compares the SHADOW every frame -- is the DMA itself: $8087 copies
  // the shadow into hardware OAM and byte 2 loses bits 2-4, which do not exist
  // in OAM (src/oam.js oamDma `& $E3`). Nothing else tests that mask.
  const oam = { n: 0, at: null };
  for (let s = 0; s < 64; s++) {
    const b = s * 4;
    const live = oracle.final.oam[b] !== 0xF4;
    for (let i = 0; i < 4; i++) {
      if (i !== 0 && !live) continue;
      if (oracle.final.oam[b + i] !== port.finalVideo.oam[b + i]) {
        oam.n++;
        if (oam.at === null) oam.at = b + i;
      }
    }
  }
  const coll = diff(oracle.final.coll, port.finalVideo.coll);
  return {
    compared: true, frame: oracle.final.frame,
    ntChanged: oracle.final.ntChanged,
    ntHalvesDiffer: oracle.final.ntHalvesDiffer,
    collChanged: oracle.final.collChanged,
    nt, pal, oam, coll,
    // THE ONE EXCUSED DIVERGENCE, and it is knownFail's rule, not a new one.
    // src/flow.js fullScreenLoad() says it in a comment at the code:
    // "$8849-$886B: PPUADDR = $2000 and six JSR $8871 chunks. NOT PORTED."
    // $882C rewrites 2304 bytes from $2000 on every stage load, so a window
    // that contains one contains a screen the port never draws. MEASURED: the
    // differing bytes are cells the CARTRIDGE blanked (rom 0) and the PORT left
    // at the seed's star tiles (58..63) -- port == seed on 84/84, 69/69,
    // 356/356, 179/179 of them, i.e. the port wrote nothing there at all.
    //
    // The excuse is DERIVED, not a list of scenario names: it applies exactly
    // when the cartridge's $1B re-enters the intro set {1,2,3,4} inside the
    // window. That is 10 of 37 scenarios, and three of those ten (intro-boot,
    // intro-respawn, capsule-shield) are byte-exact anyway. The other 27 --
    // including both deep scenarios and every long one -- are graded strictly.
    ntKnown: introInWindow,
    bad: ((nt.n && !introInWindow) ? 1 : 0) + (pal.n ? 1 : 0) + (oam.n ? 1 : 0)
       + (coll.n ? 1 : 0),
  };
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
  // `compareUntilThrow` (W25b): a scenario whose window runs INTO a named
  // unported ROM path -- the endchain reaches the boss spawn ($84->$85), whose
  // per-frame handler $B914 is W26. Unlike `expectThrow` (which is NOT field-
  // compared at all), this runs the port with stopOnThrow and field-compares
  // every frame BEFORE the throw, then verifies the throw itself. The pre-throw
  // frames are the W24 sub-state timeline ($81/$82/$83/$84); the throw is the
  // measured boundary where the boss handler begins (W26). A scenario that does
  // NOT throw, or throws at a different address, is a FAILURE -- same surprise-
  // success discipline as expectThrow and knownFail.
  const scnDef = defs.scenarios.find((s) => s.name === name) || {};
  const untilThrow = scnDef.compareUntilThrow || null;     // e.g. "B914"
  const port = tracePort({
    name, script: oracle.inputScript, frames: oracle.gameFrames,
    align: oracle.align, seed: oracle.seed, watch: defs.watch,
    poke: oracle.poke, neuter, res,
    stopOnThrow: !!untilThrow,
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
  // compareUntilThrow: the port ran into its declared unported path and
  // tracePort (stopOnThrow) stopped there. `all` already lacks the throw frame
  // and everything after it (port.frames stops one short), so `frames` already
  // holds only the pre-throw window -- this just records WHY for the report and
  // tells compareVideo the window did not run to its end.
  if (port.threw && stoppedAt === null) {
    stoppedAt = port.threw.atFrame;
    stopReason = `the port threw at f${port.threw.atFrame}: `
               + `${port.threw.message} (a declared compareUntilThrow path)`;
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
  // The cartridge's 16-bit camera $3F:$3E AT THE ALIGN FRAME. Read off the
  // ORACLE row, never the port's, because DEEP REACH uses it to assert how far
  // into the stage this corpus starts and a port could otherwise satisfy that
  // by agreeing with itself.
  const alignRow = byFrameO.get(oracle.align);
  const alignScroll = alignRow ? alignRow.scrollHi * 256 + alignRow.scrollLo : null;

  return {
    name, why: oracle.why, script: oracle.inputScript, align: oracle.align,
    alignScroll,
    frames: frames.length, nominal: all.length, stoppedAt, stopReason, neuter,
    // null unless compareUntilThrow is set: { atFrame, message } when the port
    // threw, plus the declared ROM address the throw must name.
    threw: port.threw || null, throwExpected: untilThrow,
    reach: { xMin: Math.min(...xs), xMax: Math.max(...xs),
             yMin: Math.min(...ys), yMax: Math.max(...ys),
             dying: dyingAt.length, deaths, diedAt: dyingAt[0] ?? null },
    results, skipped,
    dlist: compareDisplayList(frames, byFrameO, byFrameP),
    // ---- THE SCREEN, wave 10 -----------------------------------------------
    // The port's nametable and palette at the END of the window against the
    // cartridge's. Until wave 10 NOTHING compared them: src/vram.js's drainQueue
    // is the only nametable writer in the game and the only check on its output
    // was `$0E`, a byte cursor, plus the queue page's own bytes. The terrain
    // streamer could have written every block to the wrong address and every
    // recorded field would have agreed (rendergate.py rebuilds pictures from
    // MESEN's video state and imports no src/, so it cannot see this either).
    //
    // ONLY WHEN THE WINDOW RAN TO THE END. If the cartridge left the modelled
    // $1B set the port was never asked to follow it, so the screens are allowed
    // to differ and comparing them would be inventing a failure.
    // `introInWindow`: did the cartridge run a STAGE LOAD inside this window?
    // Read off the ORACLE's own $1B -- states 1-4 are the five-step stage intro
    // ($9B3E $9BED $9C12 $9C1E $9C24) and $9B78's `JSR $882C` is inside the
    // first of them. See compareVideo() for what it excuses and what it does not.
    video: compareVideo(name, oracle, port, stoppedAt,
                        frames.some((f) => [1, 2, 3, 4]
                          .includes(byFrameO.get(f).w_001B))),
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
  if (!r.video.compared) {
    console.log(`    [VIDEO] not compared: ${r.video.why}`);
  } else {
    const v = r.video;
    const ok = v.bad === 0;
    console.log(`    [${ok ? (v.ntKnown && v.nt.n ? 'KNOWN' : 'PASS') : 'FAIL'}] `
              + `VIDEO at f${v.frame}: `
              + `nametable ${v.nt.n}/2048 bytes differ`
              + (v.nt.at === null ? '' : ` (first PPU $${(0x2000 + v.nt.at).toString(16).toUpperCase()})`)
              + `, palette ${v.pal.n}/32, hardware OAM ${v.oam.n}/256`
              + (v.ntKnown ? '  -- a STAGE LOAD ran in this window, so the '
                           + 'nametable is knownFail $8871' : ''));
    console.log(`      the cartridge itself rewrote ${v.ntChanged}/2048 `
              + `nametable bytes over this window -- that is how much of the `
              + `agreement is the port's own $8A51 output rather than the seed`);
    console.log(`    [${v.coll.n === 0 ? 'PASS' : 'FAIL'}] TERRAIN MAP `
              + `($0500-$06FF) at f${v.frame}: ${v.coll.n}/512 bytes differ`
              + (v.coll.at === null ? '' : ` (first $${(0x0500 + v.coll.at).toString(16).toUpperCase()})`)
              + `; the cartridge rewrote ${v.collChanged}/512 over this window`);
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
  // compareUntilThrow verification: the declared unported path must fire, at the
  // declared ROM address. Not throwing (the path was ported) or throwing at a
  // different address are both failures, exactly like a stale expectThrow.
  let throwFail = 0;
  if (r.throwExpected) {
    const hit = r.threw && r.threw.message.includes(r.throwExpected);
    throwFail = hit ? 0 : 1;
    console.log(`    [${hit ? 'PASS' : 'FAIL'}] THREW at ${r.throwExpected}: `
              + (r.threw
                 ? `frame ${r.threw.atFrame} -- `
                   + `${r.threw.message.split('.')[0]}.`
                 : `did NOT throw over ${r.frames} compared frames -- `
                   + `${r.throwExpected} may have been ported; re-measure`));
  }
  // The VIDEO block counts into `fail` like the display list does: a wrong
  // screen is a wrong port, not a footnote.
  return { fail: bad.length + (r.romLagInWindow === r.portLag ? 0 : 1)
                 + dlistFail + throwFail
                 + (r.video.compared ? r.video.bad : 0),
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

  // WAVE 10. A scenario carrying `expectThrow` is NOT field-compared: the port
  // runs into a named unported path inside its window and there is nothing to
  // compare after that. It is graded by the DEEP REACH block below instead, and
  // taking it out of `names` here is what keeps the normal loop honest -- a
  // throw in any OTHER scenario still crashes this file, which is the point.
  const throwers = new Map(defs.scenarios
    .filter((s) => s.expectThrow)
    .map((s) => [s.name, s]));
  const deepNames = names.filter((n) => throwers.has(n));
  const requested = names.length;      // BEFORE the split -- `fullRun` below
  names = names.filter((n) => !throwers.has(n));

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
  // `requested` and not `names.length`: wave 10's expectThrow scenarios are
  // split out of `names` above, and comparing the post-split count against the
  // corpus size would make `fullRun` permanently false -- which would silently
  // disable the DEATH and DEEP REACH corpus checks.
  const fullRun = requested === defs.scenarios.length;

  console.log('\n=== SUMMARY ===');
  for (const r of rows) {
    const bad = r.results.filter((x) => x.tier === 'TIER1' && x.first !== null);
    const lagOk = r.romLagInWindow === r.portLag;
    const dlOk = r.dlist === null || (!r.dlist.yBad && !r.dlist.liveBad);
    const throwOk = !r.throwExpected
      || (r.threw && r.threw.message.includes(r.throwExpected));
    const ok = bad.length === 0 && lagOk && dlOk && throwOk;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${r.name.padEnd(13)} `
              + `${String(r.frames).padStart(4)} frames  `
              + (bad.length === 0 ? 'all TIER 1 fields exact'
                 : bad.map((x) => `${x.field}@${x.first}`).join(' '))
              + (lagOk ? '' : `  LAG rom ${r.romLagInWindow} port ${r.portLag}`)
              + (dlOk ? '' : `  OAM Y${r.dlist.yBad}/live${r.dlist.liveBad}`)
              + (throwOk ? '' : `  THROW ${r.throwExpected} missing`)
              + (r.throwExpected && r.threw
                 ? `  threw ${r.throwExpected}@f${r.threw.atFrame}` : ''));
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

  // ---- VIDEO COVERAGE (wave 10) ---------------------------------------------
  // Same family as CLAMP, DEATH and DISPLAY LIST coverage, and the same reason
  // it is a failure rather than a note: this block can stop running without
  // anything going red. Every scenario truncating, or every artifact predating
  // the second video dump, would silently stop comparing 2 KB of screen while
  // the summary still read `0 failures`.
  console.log('\n=== VIDEO COVERAGE (PPU $2000-$27FF, $3F00-$3F1F, OAM) ===');
  const vidRows = rows.filter((r) => r.video.compared);
  let videoBad = 0;
  const ntChangedTotal = vidRows.reduce((n, r) => n + r.video.ntChanged, 0);
  const collChangedTotal = vidRows.reduce((n, r) => n + r.video.collChanged, 0);
  const collBad = vidRows.reduce((n, r) => n + r.video.coll.n, 0);
  const ntBad = vidRows.reduce((n, r) => n + r.video.nt.n, 0);
  const palBad = vidRows.reduce((n, r) => n + r.video.pal.n, 0);
  const oamBad = vidRows.reduce((n, r) => n + r.video.oam.n, 0);
  if (rows.length && vidRows.length === 0) {
    videoBad++;
    console.log('  [FAIL] NO scenario compared its screen -- every window was '
              + 'truncated, or every artifact predates the second video dump. '
              + 'Re-record: python games/gradius/tools/oracle/scen.py');
  }
  // A corpus in which the cartridge never rewrites a nametable byte would make
  // this check a comparison of two copies of the same seed (trap 4.3). Per
  // scenario 0 is ordinary -- stage 1's screen 0 repeats every 256 px and the
  // nametable is 512 px wide, so a short window rewrites the same tiles it
  // already had. Corpus-wide 0 is not.
  if (vidRows.length && ntChangedTotal === 0) {
    videoBad++;
    console.log('  [FAIL] the cartridge rewrote ZERO nametable bytes across the '
              + 'whole corpus -- the screen comparison is comparing the seed to '
              + 'itself');
  }
  // Is `seedVram` really PPU $2000-$27FF, or is it $2000-$23FF twice? Vertical
  // mirroring makes $2800 an alias of $2000, so a dump that read the mirror
  // would look plausible and be half a screen. A scenario whose two nametable
  // halves are identical is NOT evidence of that -- `intro-respawn` is exactly
  // that and it is real, because $8871 pushes 2304 bytes from $2000 and fills
  // both halves with one image. Every scenario identical is what a mirrored
  // read looks like, so the check is here and not in scen.py (where it was
  // first written, and where it fired on a legitimate frame).
  const halves = vidRows.reduce((n, r) => n + (r.video.ntHalvesDiffer > 0 ? 1 : 0), 0);
  if (vidRows.length && halves === 0) {
    videoBad++;
    console.log('  [FAIL] every scenario\'s PPU $2000-$23FF equals its '
              + '$2400-$27FF -- seedVram is a MIRRORED read, i.e. half a screen '
              + 'recorded twice');
  }
  console.log(`  ${vidRows.length}/${rows.length} scenarios compared their screen; `
            + `the cartridge rewrote ${ntChangedTotal} nametable bytes over `
            + `those windows; ${halves} have two DIFFERENT nametables at their `
            + `align frame`);
  // $0500-$06FF is SEEDED from wave 10 on and is in no watch list, so if the
  // cartridge never rewrote a cell over any window this check is the seed
  // compared to itself -- and the two $9F55 breaks that motivated it would be
  // green again with nothing saying so.
  if (vidRows.length && collChangedTotal === 0) {
    videoBad++;
    console.log('  [FAIL] the cartridge rewrote ZERO collision-map bytes across '
              + 'the whole corpus -- $9F55\'s derivation is not being compared '
              + 'at all, only the seed is');
  }
  console.log(`  [${collBad === 0 ? 'PASS' : 'FAIL'}] TERRAIN MAP: ${collBad} of `
            + `512 bytes differ; the cartridge rewrote ${collChangedTotal} over `
            + `those windows`);
  const strict = vidRows.filter((r) => !r.video.ntKnown);
  const excused = vidRows.filter((r) => r.video.ntKnown);
  const ntStrictBad = strict.reduce((n, r) => n + r.video.nt.n, 0);
  console.log(`  [${ntStrictBad + palBad + oamBad === 0 ? 'PASS' : 'FAIL'}] `
            + `${ntStrictBad} nametable (over ${strict.length} strictly graded `
            + `scenarios), ${palBad} palette, ${oamBad} hardware-OAM bytes differ`);
  // knownFail $8871, held to account at CORPUS level exactly like the field
  // annotations above: an annotation that nothing diverges under is STALE and
  // must be deleted, or the port has quietly grown the full-screen loader and
  // 10 scenarios are being excused for nothing.
  if (excused.length) {
    const live = excused.filter((r) => r.video.nt.n > 0);
    const ntKnownBad = excused.reduce((n, r) => n + r.video.nt.n, 0);
    console.log(`  [${live.length ? 'STILL BROKEN' : 'FAIL -- STALE'}] `
              + `knownFail $8871 (src/flow.js fullScreenLoad, "$8849-$886B ... `
              + `six JSR $8871 chunks. NOT PORTED"): ${live.length} of `
              + `${excused.length} windows with a stage load diverge, `
              + `${ntKnownBad} bytes total`);
    console.log(`      ${live.map((r) => `${r.name}:${r.video.nt.n}`).join(' ') || '(none)'}`);
    if (!live.length) {
      videoBad++;
      console.log('      Nothing diverges any more. $8871 is drawn, or no '
                + 'window contains a stage load -- DELETE the excuse in '
                + 'compareVideo() and grade every scenario strictly.');
    }
  }
  for (const r of rows.filter((x) => !x.video.compared)) {
    console.log(`    (not compared) ${r.name}: ${r.video.why}`);
  }

  // ---- DEEP REACH (wave 10) -------------------------------------------------
  // The corpus's real coverage limit was SCROLL DISTANCE, measured and written
  // down in 06-FINDING-scroll-coverage.md: scenarios run ~240 frames at
  // ~0.5 px/frame, so nothing past ~120 px of scroll had ever been compared,
  // and everything gated behind further scroll LOOKED covered because the
  // scenarios that did run were green. Wave 10 made align-anywhere work; this
  // block is what stops the deliverable from rotting.
  //
  // TWO CHECKS, and the second one is the annotation discipline knownFail
  // already uses -- a SURPRISE SUCCESS is a failure:
  //
  //   COVERAGE  at least one scenario's ALIGN-FRAME camera, read off the
  //             ORACLE artifact ($3F:$3E, not the port's), is past scroll
  //             $0380. Delete the deep scenarios and this goes red.
  //   expectThrow  the port must still hit the declared ROM address at the
  //             declared frame. If it stops throwing, the path has been ported
  //             and the annotation must be retired and the scenario promoted to
  //             a real comparison -- so that is a FAILURE, not a quiet pass.
  //
  // $0380 is not a round number chosen for effect. It is where stage 1's wave
  // list first carries a command < $80 ($A859 + $18, trigger $C0 -> scroll
  // $0380, cmd $00), i.e. the first record the port cannot execute, and it is
  // the number wave 3 measured and put inside the throw at src/enemies.js.
  const DEEP_SCROLL = 0x0380;
  console.log('\n=== DEEP REACH (align-frame scroll, past $0380) ===');
  let deepBad = 0;
  const deepReached = [];
  const hex4 = (v) => `$${v.toString(16).toUpperCase().padStart(4, '0')}`;
  for (const r of rows) {
    if (r.alignScroll !== null && r.alignScroll > DEEP_SCROLL) {
      deepReached.push(`${r.name}@${hex4(r.alignScroll)}`);
    }
  }
  for (const n of deepNames) {
    const s = throwers.get(n);
    const o = loadOracle(n);
    if (!o) {
      console.log(`  [SKIP] ${n}: no oracle artifact (Mesen + the ROM)`);
      missing++;
      continue;
    }
    const a = o.frames.find((x) => x.frame === o.align);
    const scroll = a.scrollHi * 256 + a.scrollLo;
    if (scroll > DEEP_SCROLL) deepReached.push(`${n}@${hex4(scroll)}`);
    const doc = tracePort({
      name: n, script: o.inputScript, frames: o.gameFrames, align: o.align,
      seed: o.seed, watch: defs.watch, poke: o.poke, neuter, res,
      stopOnThrow: true,
    });
    const want = s.expectThrow;
    let ok = true, why = '';
    if (!doc.threw) {
      ok = false;
      why = `the port did NOT throw over ${doc.gameFrames} frames. `
          + `${want.rom} has been ported -- DELETE the expectThrow annotation `
          + `and let this scenario be field-compared like every other one.`;
    } else if (!doc.threw.message.includes(want.rom)) {
      ok = false;
      why = `threw at frame ${doc.threw.atFrame} but the message does not name `
          + `${want.rom}: ${doc.threw.message}`;
    } else if (doc.threw.atFrame !== want.atFrame) {
      ok = false;
      why = `threw at frame ${doc.threw.atFrame}, annotated ${want.atFrame} -- `
          + `the reachability moved; re-measure before changing the number`;
    }
    if (!ok) deepBad++;
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${n}: align ${o.align}, `
              + `scroll ${hex4(scroll)}, `
              + `port reaches ${want.rom} at frame `
              + `${doc.threw ? doc.threw.atFrame : 'NEVER'}`);
    if (doc.threw) console.log(`         ${doc.threw.message.split('.')[0]}.`);
    if (!ok) console.log(`         ${why}`);
  }
  // Gated on fullRun: a `--only idle` subset is not evidence that the corpus
  // has stopped reaching deep, and the self-check stage runs exactly such a
  // subset. The DISPLAY LIST block is ungated for the opposite reason -- a
  // stale artifact is stale whatever else is being run.
  if (fullRun && deepReached.length === 0) {
    deepBad++;
    console.log(`  [FAIL] NO scenario aligns past scroll $${DEEP_SCROLL.toString(16)}. `
              + `06-FINDING-scroll-coverage.md is back: everything past ~120 px `
              + `of scroll is unexercised and looks covered.`);
  } else {
    console.log(`  [${deepReached.length ? 'PASS' : 'skip'}] `
              + `${deepReached.length} scenario(s) align past $0380: `
              + (deepReached.join(', ') || '(subset run)'));
  }

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
            + `${videoBad} video-coverage failures, `
            + `${deepBad} deep-reach failures, `
            + `${skippedFields.length} fields SKIPPED (${skippedFields.join(' ')}).`);
  return (fails || uncovered || stale || deathBad || dlistBad || videoBad || deepBad)
    ? 1 : (rows.length === 0 ? 2 : 0);
}

if (process.argv[1]?.endsWith('compare.mjs')) process.exit(main(process.argv.slice(2)));
