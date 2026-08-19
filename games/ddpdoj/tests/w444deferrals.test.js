// WAVE 444 (D66) -- THE DEFERRAL AUDIT, AND THE GUARD THAT KEEPS IT HONEST.
//
// ---------------------------------------------------------------------------
// THE SHAPE, SEVEN TIMES IN TWENTY WAVES
// ---------------------------------------------------------------------------
// W425, W428, W433, W435, W436, W439, W443. Every one was the same defect and
// it is NOT "the port is missing something":
//
//     THE ASSERTION IS TRUE, THE STATED REASON IS FALSE, AND NOTHING EVER
//     READS THE BOOKKEEPING BACK.
//
// W443's was the purest: an exporter comment promised "a LOUD NAMED THROW" if
// the hyper's beam art were ever reached, and that promise stopped being true
// in W226 when the window moved without it. From W226 to W443 the art was a
// QUIET BLANK -- exactly what the comment existed to prevent -- and the owner
// had been looking at it on screen for 217 waves.
//
// A LIST WOULD GO STALE THE SAME WAY. So this file is a scanner, not a list.
//
// ---------------------------------------------------------------------------
// WHAT W444 FOUND AND FIXED: $2599EC
// ---------------------------------------------------------------------------
// `boss.js part1Death294E3E` / `part2Death294E94` have run the A3 stops since
// W62 -- `for (const id of [...]) a3Stop2599EC(ram, id)` -- and then counted
// `$2599EC` as DEFERRED on the very next line, with `BOSS_NOTED` calling it
// one of the four things "genuinely deferred". [M] The cartridge at
// $294E60..$294E87 and $294EB6..$294EDD is five `moveq #id / jsr $2599EC`
// pairs and NOTHING else. The port was already whole. The census reported a
// gap that had been closed for 382 waves -- W425's defect, exactly.
//
// SECTION 4 re-derives the five ids FROM THE ROM (the W428 lesson: never
// hard-code a seed you can compute) and proves the source carries those ids.
//
// ---------------------------------------------------------------------------
// WHAT THIS GUARD CAN AND CANNOT CATCH -- READ THIS BEFORE TRUSTING IT
// ---------------------------------------------------------------------------
// CAN:
//   1. A bookkeeping-table key that no `note()` call can reach any more (the
//      W425 / W444-$2599EC shape). SECTION 1, across ALL FIVE tables plus
//      `rank.js INIT_UNREAD` -- not just the one table W425 wired.
//   2. A routine that gets PORTED AND EXPORTED while some other file still
//      defers that same ROM address (the W433 / W443 shape). SECTION 2 fails
//      on any overlap not explicitly declared, so the next one costs a wave's
//      attention instead of 358 waves of silence.
//   3. Silent drift in the deferrals W444 confirmed STALE. SECTION 3 asserted
//      that debt EXACTLY, and it did its job: W445 wired all four and SECTION 2,
//      2b, 3 and the old 3b all went red on the first run, which is how the
//      register got updated instead of quietly diverging -- exactly as the
//      W444 note above promised. SECTION 3 now asserts the register is EMPTY, 3b that
//      the PORTED index still finds the three ports (an empty register is
//      worthless if the index is what emptied), and 3c that each wiring is
//      still a CALL at every site.
//
// WHAT W444 ITSELF MISSED, AND WHY SECTION 3c EXISTS.
// W444 named `$2603DA @ rank.js $260678`. `rank.js` deferred the SAME address a
// SECOND time at `$260788` (the state-2 teardown), with a DIFFERENT false reason
// -- "(presentation/sound)" for a routine that is 102 words of RAM clear. The
// scanner saw the address; the report named one site. So SECTION 3c counts CALL
// SITES, not addresses: `clearRankRam2603DA` twice, `livesRow2878CC` five times.
//
// CANNOT -- these are real holes, stated plainly so nobody over-trusts this:
//   a. A port that is MODULE-PRIVATE. SECTION 2 only sees `export function`,
//      because only an exported symbol is one another file could actually have
//      called. `$28D552` (stageend.js `clear28D552`) is genuinely private and
//      genuinely invisible here -- and `rank.js`'s reason for it is still TRUE.
//   b. A port whose name carries no address AND whose JSDoc does not open with
//      one. `$27F87C` was found only because `bee.js clearPoolA` opens its doc
//      with the address; a port that follows neither convention is invisible.
//   c. WHETHER A REASON IS TRUE. No scanner can read English. SECTION 2 proves
//      only that somebody LOOKED at each overlap once and wrote down why.
//   d. A deferral that is correct today and whose *subject* changes -- the
//      W443 window-moved-away case. Nothing here reads ROM window coverage.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { BOSS_NOTED } from '../src/boss.js';
import { HIBACHI2_NOTED } from '../src/hibachi2.js';
import { HIBACHI_END_NOTED } from '../src/hibachiend.js';
import { RANK_DEVIATION, INIT_UNREAD } from '../src/rank.js';
import { PRESENTATION_DEVIATION } from '../src/stageend.js';

const here = (p) => join(dirname(fileURLToPath(import.meta.url)), p);
const SRC = here('../src');
const IMAGE = here('../tools/oracle/out/maincpu.bin');
const SKIP = !existsSync(IMAGE);
const IMG = SKIP ? null : readFileSync(IMAGE);

const hex = (a) => '$' + a.toString(16).toUpperCase();
const inRom = (a) => a >= 0x230000 && a < 0x2b0000;

// ---------------------------------------------------------------------------
// THE SCAN.  One pass over src/, two indexes out of it.
// ---------------------------------------------------------------------------

/** Every `.js` under `src/`, recursively, as `[relative path, text]`. */
function sources() {
  const out = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(join(dir, e.name), rel + e.name + '/');
      else if (e.name.endsWith('.js')) out.push([rel + e.name, readFileSync(join(dir, e.name), 'utf8')]);
    }
  })(SRC, '');
  return out;
}

const SOURCES = sources();

/**
 * DEFERRED: address -> ["file:line", ...] for every live `note(` / `unreached(`
 * call carrying that address. Comment lines are excluded, so prose ABOUT a
 * deferral never counts as one -- otherwise this file's own header would.
 */
const DEFERRED = new Map();
/**
 * PORTED: address -> ["file:line name", ...] for every `export function` that
 * claims the address, by either repo convention:
 *   - the name ENDS in the six hex digits (`a3Stop2599EC`), or
 *   - its JSDoc block OPENS with the address (`/** `$27F87C` -- clear ...`).
 * "Opens with" and not "mentions": `a1Stop259B08`'s doc mentions `$2599EC` as
 * a cross-reference, and counting that would make this index lie.
 */
const PORTED = new Map();

for (const [file, text] of SOURCES) {
  const lines = text.split(/\r?\n/);
  lines.forEach((L, i) => {
    const at = `${file}:${i + 1}`;
    if (/\b(note|unreached)\s*\(/.test(L) && !/^\s*(\/\/|\*)/.test(L)) {
      for (const m of L.matchAll(/0x([0-9a-f]{5,6})\b/gi)) {
        const a = parseInt(m[1], 16);
        if (inRom(a)) (DEFERRED.get(a) ?? DEFERRED.set(a, []).get(a)).push(at);
      }
    }
    const fn = L.match(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
    if (!fn) return;
    const claim = (a) => { if (inRom(a)) (PORTED.get(a) ?? PORTED.set(a, []).get(a)).push(`${at} ${fn[1]}`); };
    const suffix = fn[1].match(/([0-9a-fA-F]{6})$/);
    if (suffix) claim(parseInt(suffix[1], 16));
    let j = i - 1;
    const doc = [];
    while (j >= 0 && /^\s*(\*|\/\*\*)/.test(lines[j])) {
      doc.unshift(lines[j]);
      if (/^\s*\/\*\*/.test(lines[j])) break;
      j -= 1;
    }
    const first = doc.join('\n').match(/`?\$([0-9A-Fa-f]{6})`/);
    if (first) claim(parseInt(first[1], 16));
  });
}

test('W444 the scan itself found something -- a broken regex must not pass as a clean sweep', () => {
  assert.ok(SOURCES.length > 90, `only ${SOURCES.length} sources scanned`);
  assert.ok(DEFERRED.size > 150, `only ${DEFERRED.size} deferred addresses -- the scan is broken`);
  assert.ok(PORTED.size > 500, `only ${PORTED.size} ported addresses -- the scan is broken`);
});

// ----------------------------------------------------------------- SECTION 1

// W425 made ONE table fail on a dead key. Four other tables were never wired,
// and `$2599EC` sat dead in `BOSS_NOTED` regardless. Every table, every key.
const TABLES = Object.freeze([
  ['BOSS_NOTED (src/boss.js)', BOSS_NOTED],
  ['HIBACHI2_NOTED (src/hibachi2.js)', HIBACHI2_NOTED],
  ['HIBACHI_END_NOTED (src/hibachiend.js)', HIBACHI_END_NOTED],
  ['RANK_DEVIATION (src/rank.js)', RANK_DEVIATION],
  ['PRESENTATION_DEVIATION (src/stageend.js)', PRESENTATION_DEVIATION],
]);

// `RANK_DEVIATION[0x2605C8]` is a SUMMARY row, not a `note()` key: `rank.js`
// passes it as the `what` of a `note(ctx, RANK.initState, ...)` call rather
// than looking it up by address. Declared, so the rule below stays strict.
const SUMMARY_ROWS = new Set([0x2605c8]);

test('SECTION 1: no bookkeeping table carries a key nothing can note any more', () => {
  const dead = [];
  for (const [name, table] of TABLES) {
    for (const k of Object.keys(table)) {
      const a = Number(k);
      assert.ok(inRom(a), `${name} key ${k} is not a ROM address`);
      if (SUMMARY_ROWS.has(a)) {
        assert.ok(readFileSync(join(SRC, 'rank.js'), 'utf8').includes('RANK_DEVIATION[RANK.initState]'),
          'the $2605C8 summary row lost its one reader');
        continue;
      }
      if (!DEFERRED.has(a)) dead.push(`${name} -> ${hex(a)}`);
    }
  }
  assert.deepEqual(dead, [],
    'a table declares a deferral that NO `note()` call in src/ can reach any more. That is '
    + 'W425\'s defect and W444\'s $2599EC: the census reports a gap that is closed. Delete the '
    + 'key (and say so where the table is defined), do not add a note to feed it: ' + dead.join(', '));
});

test('SECTION 1b: $2599EC is gone from BOSS_NOTED and from every note() in src/', () => {
  assert.equal(BOSS_NOTED[0x2599ec], undefined, 'the dead key came back');
  const offenders = [...(DEFERRED.get(0x2599ec) ?? [])];
  assert.deepEqual(offenders, [],
    '$2599EC is being COUNTED again while `a3Stop2599EC` runs at that very site: ' + offenders.join(', '));
});

// ----------------------------------------------------------------- SECTION 2

// THE W433 / W443 SHAPE: a routine is ported and EXPORTED, and some file goes
// on deferring the same ROM address. Sometimes that is right (a port with a
// `if (!rom)` census fallback); sometimes it is a routine that has been
// callable for 358 waves. The scanner cannot tell -- so it demands a written
// reason for each, and fails on any it has never been shown.
//
// DECLARE, NEVER WIDEN. A new address here is a wave's work, not a one-line
// allowlist edit: read the note, decide which of the three it is, then write it
// down. `same-file` means the note lives in the porting file itself.
const OVERLAP_DECLARED = Object.freeze({
  // -- the port runs; the note is its own no-resource fallback (same file) --
  0x240dc2: 'hud.js txPrint240DC2: counts when called without `rom`',
  0x2415a2: 'palette.js install2415A2: counts when the chain carries no PaletteState',
  0x2530e6: 'items.js: the port runs; the note is the REFUSED-kind arm, a different concern',
  0x25db7c: 'tallyscreen.js screenState2_25DB7C: the port runs; the note is its OUT-OF-RANGE '
    + 'cursor arm, which only $25DD0C (not ported) can reach -- a different concern',
  0x25dc2c: 'tallyscreen.js: the $25DC2C..$25DD80 arm is genuinely still out, header row is in',
  0x260ec8: 'background.js screenShake260EC8: the port runs; the note is the unmodelled mode arm',
  0x27f8f0: 'bee.js allocPoolA27F8F0: the port runs; the notes are pool-FULL and layer-overflow',
  0x284f72: 'hud.js bannerPanel284F72: counts when called without `rom`',
  0x284fa2: 'hud.js bannerPanel284FA2: counts when called without `rom`',
  0x2859dc: 'hud.js chainBar2859DC: counts when called without `rom`',
  0x285fa6: 'hud.js hyperFlash285FA6: counts when called without `rom`',
  0x285fb6: 'hud.js creditRow285FB6: counts when called without `rom`',
  0x286040: 'hud.js chainHiWater286040: counts when called without `rom`',
  0x246800: 'spawn.js freeChain246800: the port runs; the note is its own NULL-head `unreached`',
  // -- the port runs, but this CHAIN has no such resource; counted, not silent --
  0x23c622: 'clearTx23C622 runs when ctx.tx exists; objslot12 counts the bare-ctx miss',
  0x23c668: 'clearSlotTable23C668 runs when ctx.slotTable exists; four files count the miss',
  0x2414be: 'palette.js install2414BE: the ctx.palette-absent arm, at five sites',
  0x24150a: 'palette.js install24150A: the ctx.palette-absent arm, at fifteen sites',
  0x24157a: 'palette.js install24157A: the ctx.palette-absent arm',
  0x2415e8: 'palette.js install2415E8: the ctx.palette-absent arm',
  0x241688: 'palette.js paletteSet241688: the ctx.palette-absent arm',
  // -- the ROUTINE is ported; what the site defers is genuinely something else --
  0x246410: 'animobjects.js loadAnimObjects246410 has 19 call sites. The three boss/arrival/midboss '
    + 'sites defer the animation TABLE each passes, NOT the loader. W444 rewrote BOSS_NOTED, '
    + 'which had called the loader itself "the presentation tier, genuinely deferred"',
  0x28ac72: 'cues.js spawnCues28AC72 is ported; the midboss record selects descriptor $28B08E, '
    + 'outside the kind-0/4/8 closure cues.js implements',
  0x24200a: 'aim.js is ported; initbody defers because the SPAWN POSITION is W24-derived, so the '
    + 'aim input is what is missing, not the aim',
  0x24202c: 'aim.js is ported; same W24 spawn-position reason as $24200A',
  0x242748: 'mover.js kind 28 SPLIT arm: an `unreached` naming the whole unported spawn chain '
    + '($242296 + $2817C2), not just the re-aim',
  0x244074: 'bullets.js `fire` merely NAMES $244074 in its doc; midboss.js counts the bullet-'
    + 'cancel SCORE walk. Doc-convention false positive, kept declared so it stays looked at',
  // W445 DELETED THE $2878CC ROW, per this file's own rule two tests down: the two
  // stale deferrals were WIRED, so the address is no longer both ported and deferred
  // and leaving the row would be the same rot one level up. What replaced it is
  // SECTION 3c, which asserts the wiring is still THERE -- an allowlist row says
  // "somebody looked once", and that is the wrong shape for a fix.
});

test('SECTION 2: every ported-and-still-deferred ROM address has a written reason', () => {
  const undeclared = [];
  for (const [a, sites] of [...DEFERRED].sort((x, y) => x[0] - y[0])) {
    if (!PORTED.has(a)) continue;
    if (OVERLAP_DECLARED[a]) continue;
    undeclared.push(`${hex(a)} PORTED AT ${[...new Set(PORTED.get(a))].join(' / ')} `
      + `BUT DEFERRED AT ${[...new Set(sites)].join(' / ')}`);
  }
  assert.deepEqual(undeclared, [],
    'a ROM address is EXPORTED as a port and STILL DEFERRED somewhere. This is the W433 shape '
    + '(a note() from W52 for a routine ported in W189, every other caller wired) and the W443 '
    + 'shape. Decide which it is, then declare it in OVERLAP_DECLARED with the reason:\n  '
    + undeclared.join('\n  '));
});

test('SECTION 2b: OVERLAP_DECLARED carries no dead entry either', () => {
  // The allowlist is bookkeeping too, and unread bookkeeping is what this file is about.
  const dead = Object.keys(OVERLAP_DECLARED)
    .map(Number)
    .filter((a) => !(DEFERRED.has(a) && PORTED.has(a)))
    .map(hex);
  assert.deepEqual(dead, [],
    'these addresses are declared as ported-and-deferred but are no longer both. If the deferral '
    + 'was wired, DELETE the row -- leaving it is the same rot one level up: ' + dead.join(', '));
});

// ----------------------------------------------------------------- SECTION 3

// THE STALE REGISTER. W444 confirmed four stale and did NOT rewire them; W445 wired
// all four (and a fifth W444 missed -- see SECTION 3c). Asserted EXACTLY so that any
// drift turns this red and forces the register to be updated -- the alternative is a
// comment nobody reads, which is the whole disease.
//
// **THE REGISTER IS NOW EMPTY, AND AN EMPTY REGISTER IS THE WEAK CASE**: `deepEqual`
// against `[]` also passes if the scan breaks, if `INIT_UNREAD` is emptied, or if the
// `PORTED` index stops finding anything. So this test now carries its own floor: the
// table must still hold the six targets that are GENUINELY out, by address, and the
// three W445 wired must be ABSENT from it AND present in `PORTED`.
test('SECTION 3: rank.js INIT_UNREAD -- no target is ported any more, and the six that '
  + 'remain are the six with no port', () => {
  const targets = INIT_UNREAD.map(([, target]) => target).sort((a, b) => a - b);
  assert.deepEqual(targets.map(hex),
    [0x259c4a, 0x287024, 0x2884e2, 0x288574, 0x28d552, 0x28ebfe].map(hex),
    'INIT_UNREAD\'s membership changed. It is the $2605C8 state-0 INIT\'s remaining '
    + 'deferred sub-calls and nothing else. W445 removed $2603DA, $27F87C and $24A810 '
    + 'from it by WIRING them; anything else leaving or joining is a wave\'s work.');

  const portedTargets = targets.filter((t) => PORTED.has(t)).sort((a, b) => a - b);
  assert.deepEqual(portedTargets.map(hex), [],
    'a $2605C8 sub-call is BOTH still in INIT_UNREAD and exported as a port. That is the\n'
    + 'exact shape W444 found three times and W445 fixed:\n'
    + '  $2603DA -- "the presentation/teardown body this file already counts". It is\n'
    + '             objslot12.js clearRankRam2603DA, and rank.js CALLS it now, twice.\n'
    + '  $24A810 -- "a reset-prologue routine (frontend.js RESET_PROLOGUE)". That list is\n'
    + '             an INVENTORY OF ADDRESSES, not a port; objslot12.js exports the body.\n'
    + '  $27F87C -- "bee.js NAMES it and DOES NOT IMPLEMENT IT". bee.js clearPoolA IS the\n'
    + '             implementation, exported since W111, with its own test.\n'
    + 'Drop the row from INIT_UNREAD and wire the call, or say here why not.');

  // ...and the one whose reason is STILL TRUE must stay out of that set.
  assert.equal(PORTED.has(0x28d552), false,
    '$28D552 became exported -- rank.js INIT_UNREAD says "stageend.js has it as the '
    + 'module-private clear28D552 and does not export it", which was TRUE at W444. Wire it.');
});

test('SECTION 3b: the three W445 wired are still exported, so an empty register cannot '
  + 'be an empty INDEX', () => {
  for (const [a, where] of [[0x27f87c, 'bee.js clearPoolA'],
    [0x2603da, 'objslot12.js clearRankRam2603DA'],
    [0x24a810, 'objslot12.js clearPlayerRam24A810']]) {
    assert.ok(PORTED.has(a), `${hex(a)} is no longer indexed as ported (${where}). Either the `
      + 'port was removed -- in which case rank.js is now calling nothing -- or the scan broke, '
      + 'in which case SECTION 3\'s empty register means nothing');
  }
});

// ---------------------------------------------------------------- SECTION 3c

// W444 REPORTED FOUR STALE DEFERRALS AND MISSED A FIFTH ON THE SAME ADDRESS.
// `rank.js` deferred `$2603DA` at BOTH `$260678` (the state-0 init, which W444 named)
// and `$260788` (the state-2 teardown, which it did not) -- and the second one's reason,
// "(presentation/sound)", was false in a different way from the first's. Wiring only the
// named one would have left a lone survivor behind: the W433 shape exactly.
//
// An allowlist row would only record that somebody looked. These assert the CALLS.
test('SECTION 3c: every W445 wiring is still a CALL, at every site, and nothing counts '
  + 'those addresses any more', () => {
  const src = (f) => readFileSync(join(SRC, f), 'utf8');

  // 1. $2878CC / $28795C -- the LIVES row, EIGHT call sites in src/ now. hud.js's own
  //    two ($284D10/$284D20) are the W271 pair its comment calls "the SAME defect ...
  //    Both are wired now"; items.js ($25311E/$253126) and tally.js ($260014/$26001E,
  //    $260190/$2601CA) are four more; stageend.js and player.js are W445's. Counted
  //    per file rather than in total so that moving one from one file to another --
  //    which is how a live path silently loses its draw -- cannot net out to eight.
  for (const [f, n] of [['hud.js', 2], ['items.js', 2], ['tally.js', 2],
    ['stageend.js', 1], ['player.js', 1]]) {
    assert.equal((src(f).match(/^\s*livesRow2878CC\(/gm) ?? []).length, n,
      `${f} should call livesRow2878CC ${n} time(s) -- W445 wired the last two of eight`);
  }
  for (const a of [0x2878cc, 0x28795c]) {
    assert.deepEqual([...new Set(DEFERRED.get(a) ?? [])], [],
      `${hex(a)} is being COUNTED again while hud.js EXPORTS livesRow2878CC. That is the `
      + 'defect W445 fixed: the stageend.js site is on a live path (resetPower25313E -> '
      + 'loop extend), so a counted draw is a lives row that never gets redrawn');
  }

  // 2. rank.js -- the three clears, at all FOUR sites ($2603DA has two).
  const rank = src('rank.js');
  for (const [re, n, what] of [
    [/^\s*clearRankRam2603DA\(ram\);/gm, 2, '$260678 (state-0 init) AND $260788 (state-2 teardown)'],
    [/^\s*clearPoolA\(ram\);/gm, 1, '$2606E8'],
    [/^\s*clearPlayerRam24A810\(ram\);/gm, 1, '$2606FA'],
  ]) {
    assert.equal((rank.match(re) ?? []).length, n, `rank.js should carry ${n} call(s): ${what}`);
  }
  for (const a of [0x2603da, 0x27f87c, 0x24a810]) {
    assert.deepEqual([...new Set(DEFERRED.get(a) ?? [])], [],
      `${hex(a)} is counted again somewhere in src/ while its port is exported`);
  }
});

// ----------------------------------------------------------------- SECTION 4

// [M] THE SEED IS DERIVED, NOT TYPED. W428's lesson: a test that hard-codes the
// number it is checking cannot notice the number was wrong. Read the five ids
// out of the cartridge, then require the source to carry those five.
function a3StopIds(base) {
  const ids = [];
  for (let a = base; ; a += 8) {
    const moveq = IMG.readUInt16BE(a);
    if ((moveq & 0xff00) !== 0x7000) break;                  // moveq #imm,D0
    if (IMG.readUInt16BE(a + 2) !== 0x4eb9) break;           // jsr
    if (IMG.readUInt32BE(a + 4) !== 0x2599ec) break;         // ...$2599EC
    ids.push(moveq & 0xff);
  }
  return ids;
}

test('SECTION 4 [M]: the two death bodies are five moveq/jsr $2599EC pairs, and src carries them',
  { skip: SKIP }, () => {
    const part1 = a3StopIds(0x294e60);
    const part2 = a3StopIds(0x294eb6);
    assert.deepEqual(part1, [0x0, 0x2, 0x8, 0xa, 0xc], '$294E60 run');
    assert.deepEqual(part2, [0x1, 0x3, 0x9, 0xb, 0xd], '$294EB6 run');

    // The instruction AFTER each run is `moveq #n,D0 / jmp $259962` -- the A3
    // START. That is what makes the run a complete, closed sequence: there is
    // no sixth stop hiding past the end, so "the port ran all of them" is the
    // whole of $2599EC's business here and the note had nothing left to mean.
    for (const [end, script] of [[0x294e88, 4], [0x294ede, 5]]) {
      assert.equal(IMG.readUInt16BE(end), 0x7000 | script, `${hex(end)} moveq #${script},D0`);
      assert.equal(IMG.readUInt16BE(end + 2), 0x4ef9, `${hex(end + 2)} jmp`);
      assert.equal(IMG.readUInt32BE(end + 4), 0x259962, '...$259962, the A3 START');
    }

    const boss = readFileSync(join(SRC, 'boss.js'), 'utf8');
    const runs = [...boss.matchAll(/for \(const id of \[([^\]]+)\]\) a3Stop2599EC\(ram, id\);/g)]
      .map((m) => m[1].split(',').map((s) => Number(s.trim())));
    assert.equal(runs.length, 2, 'boss.js no longer carries exactly two a3Stop2599EC runs');
    assert.deepEqual(runs[0], part1, 'part1Death294E3E does not stop the ids the ROM stops');
    assert.deepEqual(runs[1], part2, 'part2Death294E94 does not stop the ids the ROM stops');
  });

// ----------------------------------------------------------------- SECTION 5

// THE MECHANISM ITSELF CAN ROT. W444 found `handlers.js` writing the loud throw as
// `ctx.unported?.unreached(0x27120A, ...)` -- a METHOD on the log. `UnportedLog` has
// `note()` and `report()` and nothing else, so [M]:
//   with a log   -> bare `TypeError`, not an `Unreached`, no `romAddress`
//   on a bare ctx -> `?.` short-circuits to a SILENT NO-OP and the arm returns
// which is the exact quiet blank the comment above it promised to prevent -- W443's
// shape, in the safety net rather than in the port. `unreached` is a FREE FUNCTION.
test('SECTION 5: nothing calls `unreached` as a method -- UnportedLog does not implement one',
  async () => {
    const { UnportedLog } = await import('../src/unported.js');
    assert.equal(typeof new UnportedLog().unreached, 'undefined',
      'UnportedLog grew an `unreached` method. If that is deliberate it must throw an `Unreached` '
      + 'carrying the address; until then this test is what keeps callers off it');

    const offenders = [];
    for (const [file, text] of SOURCES) {
      text.split(/\r?\n/).forEach((L, i) => {
        if (/^\s*(\/\/|\*)/.test(L)) return;                 // prose about it is fine
        if (/\.unreached\s*\(/.test(L)) offenders.push(`${file}:${i + 1}`);
      });
    }
    assert.deepEqual(offenders, [],
      '`X.unreached(...)` is not a throw -- it is a TypeError at best and a SILENT NO-OP through '
      + '`?.` at worst. Import `unreached` from src/unported.js and call it directly: '
      + offenders.join(', '));
  });

test('SECTION 5b: the free `unreached` really does throw a named, address-carrying error',
  async () => {
    const { unreached, Unreached } = await import('../src/unported.js');
    assert.throws(() => unreached(0x27120a, 'probe'), (e) => {
      assert.ok(e instanceof Unreached, 'not an Unreached');
      assert.equal(e.romAddress, 0x27120a, 'the ROM address is not carried');
      assert.match(e.message, /\$27120A/, 'the address is not in the message');
      return true;
    });
  });

test('SECTION 4b: the A3 stop is a real body, not a stub that could be re-deferred', { skip: SKIP },
  async () => {
    const { Ram } = await import('../src/ram.js');
    const { a3Stop2599EC, a3Start259962, SCHED } = await import('../src/scheduler.js');
    const ram = new Ram();
    for (const id of [0, 2, 8, 0xa, 0xc]) a3Start259962(ram, id);
    const live = () => {
      let n = 0;
      for (let i = 0; i < SCHED.a3Slots; i++) if (ram.u16(SCHED.a3Base + i * SCHED.a3Stride) !== 0) n += 1;
      return n;
    };
    assert.equal(live(), 5, 'five A3 slots armed');
    for (const id of [0, 2, 8, 0xa, 0xc]) a3Stop2599EC(ram, id);
    assert.equal(live(), 0, 'a3Stop2599EC cleared every slot -- the work the note claimed was undone');
  });
