// WAVE 450 (D69) -- THE DUPLICATE REGISTER, WIDENED UNTIL IT CAN SEE A PRIVATE COPY.
//
// ---------------------------------------------------------------------------
// THE NUMBER WAS 19, W450 FOUND 92, W451 LEFT 91, AND W453 LEAVES 90
// ---------------------------------------------------------------------------
// W444 built the index; W446, W447, W448 and W449 steered by it and merged five
// addresses, each of which turned out to be a live defect. Then W449 found a
// FOURTH transcription of `$246800` that the index could not see at all --
// `animobjects.js` reached its own copy through the module-private name
// `clearChain`, with no `export`, no name suffix and no JSDoc address.
//
// The register said three. The truth was four. **So the register was a FLOOR.**
//
// This wave widened the scan on three axes (see `w450widenedscan.js` for the
// rules and the traps) and re-ran it. W450 measured 92 head rows and 39 body
// pairs. W451 merged `$242684`; W453 merged `$242494`; W454 merged the turret
// step; W455 has now merged the beam-reset tail, so the live registers are:
//
//     shipped `export function` scan     19 addresses claimed twice or more
//     widened head scan                  90          "
//     of the shipped 19                  19 still there, NONE dropped
//     newly visible                      71
//     of those, originally visible because of
//       wider HEAD FORMS (private
//       `function`, `const` arrow,
//       method, object property)         68
//       the wider DOC-SPAN rule           5
//     then merged by W451                -1
//     then merged by W453                -1
//
// ...plus a second register the old scan had no axis for at all: 35 PAIRS OF
// BODIES that transcribe a shared RUN of ROM instructions. 23 of those name a
// body that appears nowhere on the head register.
//
// **A LIST IS NOT THE DELIVERABLE.** W444's rule, and W449 proved it again: the
// stale-notes disease is a document nobody re-derives. Both registers here are
// re-derived from `src/` on every run and asserted EXACTLY, so the next address
// or body pair costs a wave's attention on the day it appears.
//
// Each remaining row is a candidate for its own wave, exactly as W447 handled
// its 24. W451 and W453 removed rows only after cartridge and live-state proof.
//
// ---------------------------------------------------------------------------
// SECTIONS
// ---------------------------------------------------------------------------
//   1   the scan found something -- floors, so a broken regex cannot read clean
//   2   the widening WEAKENS NOTHING: the shipped register is a strict subset
//   3   THE HEAD REGISTER, exact, 90
//   4   THE BODY REGISTER, exact, 35 pairs
//   5   RED PROOFS on synthetic trees -- one per axis, plus two negative controls
//   6   THE HISTORICAL POSITIVE CONTROL: W449's own `clearChain`, verbatim

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  hex, sources, scanFile, headIndex, headRegister, bodyIndex, bodyPairs, narrowIndex,
} from './w450widenedscan.js';

const narrowRegister = () => [...narrowIndex()].filter(([, v]) => v.size > 1)
  .map(([a]) => a).sort((a, b) => a - b);

// ---------------------------------------------------------------- SECTION 1

test('SECTION 1: the widened scan found something -- a broken regex must not pass as a clean sweep',
  () => {
    const files = sources();
    assert.ok(files.length > 90, `only ${files.length} sources scanned`);

    let heads = 0;
    const kinds = new Map();
    let declMulti = 0;
    let declTotal = 0;
    let runaway = 0;
    let nested = 0;
    for (const [, text] of files) {
      const { lines, heads: hs } = scanFile(text);
      for (const h of hs) {
        heads += 1;
        kinds.set(h.kind, (kinds.get(h.kind) ?? 0) + 1);
        // Arrows are mostly one-liners (`const hex = (a) => ...`), and a
        // one-line extent is CORRECT for them. Only declarations are expected
        // to span lines, so only they can measure the brace counter.
        if (h.kind === 'fn' || h.kind === 'method') {
          declTotal += 1;
          if (h.endLine > h.line) declMulti += 1;
        }
        if (h.endLine >= lines.length - 1 && h.line < lines.length - 30) runaway += 1;
      }
      for (const a of hs) {
        for (const b of hs) if (b !== a && b.line > a.line && b.line <= a.endLine && b.endLine > a.endLine) nested += 1;
      }
    }
    assert.ok(heads > 2500, `only ${heads} function heads -- the scan is broken`);

    // EVERY FORM MUST ACTUALLY BE FINDING THINGS. A form whose regex rots to
    // never match would silently return the scan to its old blind spot, and the
    // register would go DOWN, which reads as progress. It is not.
    for (const [k, floor] of [['fn', 1500], ['arrow', 400], ['method', 100], ['prop', 20]]) {
      assert.ok((kinds.get(k) ?? 0) >= floor,
        `head form '${k}' matched only ${kinds.get(k) ?? 0} times (floor ${floor}). `
        + 'If a form stops matching, this guard quietly narrows back to W444\'s');
    }

    // ...and the brace tokeniser must be giving REAL extents. Three ways it can
    // rot, each of which silently empties the body register:
    //   collapse  -- every extent one line, so no body owns any marker;
    //   runaway   -- a mis-counted brace swallows the rest of the file, so every
    //                marker below a bad line lands on one giant "body";
    //   nesting   -- an inner function outliving its outer one means the counts
    //                are wrong even where the totals look plausible.
    assert.ok(declMulti / declTotal > 0.9,
      `only ${declMulti} of ${declTotal} function/method declarations got a multi-line body `
      + 'extent -- the brace counter has collapsed');
    assert.equal(runaway, 0,
      `${runaway} head(s) have an extent running to end-of-file from well above it -- a brace `
      + 'was mis-counted and their markers are being pooled');
    assert.equal(nested, 0,
      `${nested} nested head(s) outlive the head that contains them, which is impossible -- `
      + 'the tokeniser is mis-reading a string, regex or comment as code');

    const { idx } = headIndex();
    assert.ok(idx.size > 1200, `only ${idx.size} head-claimed addresses -- the scan is broken`);
    assert.ok(bodyIndex().size > 8000, 'the body-marker index collapsed');
  });

// ---------------------------------------------------------------- SECTION 2

// THE WIDENING MUST BE A WIDENING. If a "wider" scan drops a row the old one
// had, the register moved sideways and some address stopped being watched --
// which is precisely the failure this wave exists to end. Asserted, not assumed.
test('SECTION 2: the shipped register is a STRICT SUBSET of the widened one -- nothing '
  + 'stopped being watched', () => {
  const narrow = narrowRegister();
  const wide = headRegister();
  assert.equal(narrow.length, 19,
    'the shipped `export function` scan no longer reports 19. That number is W449\'s and it is '
    + 'quoted in w446 SECTION 2b, w447 SECTION 6, w448 SECTION 2 and w449 SECTION 2: ' + narrow.map(hex).join(' '));
  const dropped = narrow.filter((a) => !wide.includes(a));
  assert.deepEqual(dropped.map(hex), [],
    'the widened scan LOST an address the narrow one had. The doc rule takes every address in '
    + 'the opening span precisely so that no end of a `$A..$B` / `$A -> $B` / `$T[i] = $B` span '
    + 'can fall out. If this fires, the span rule regressed: ' + dropped.map(hex).join(' '));
  assert.ok(wide.length > narrow.length, 'the widened register is not wider');
});

// ...and the two places the two scans genuinely disagree about a SINGLE claim,
// declared so that a third one has to be looked at rather than absorbed.
// Neither is on either register -- both addresses are claimed once, not twice.
test('SECTION 2b: the individual claims the two scans attribute differently are the two known ones',
  () => {
    const { idx } = headIndex();
    const diverged = [];
    for (const [a, keys] of narrowIndex()) {
      for (const k of keys) if (!idx.has(a) || !idx.get(a).has(k)) diverged.push(`${hex(a)} ${k}`);
    }
    assert.deepEqual(diverged.sort(), [
      // Both are LONG prose JSDocs where the address is buried in the body of the
      // comment, not in its opening. The shipped regex scanned the WHOLE doc for
      // the first backtick-TERMINATED address, so it reached deep into the prose
      // -- which contradicts W444's own stated contract for it ("`Opens with` and
      // not `mentions`"). The span rule takes the first backtick span that holds
      // an address, which is what "opens with" was always meant to mean.
      '$278320 effects.js:231 remapBucket',
      '$283BAF bullets.js:713 behaviourFor',
    ], 'a THIRD claim is attributed differently by the two scans. Read both docs and decide '
      + 'which reading is right before adding a row here');
  });

// ---------------------------------------------------------------- SECTION 3

// THE HEAD REGISTER. 90 ROM addresses claimed by two or more function-like
// heads in `src/`, by name suffix or by JSDoc opening span.
//
// **DECLARE, NEVER WIDEN** -- W444's rule, and W446/W447/W448/W449 all kept it.
// A row LEAVING because a wave merged it is progress; a row ARRIVING is a wave's
// work, not a one-line edit here.
//
// **THIS SET IS NOT AN AUDIT.** W447 read its 24 and found 17 legitimately
// distinct, 5 real second transcriptions and 2 to merge on the spot. Nothing
// below has had that treatment yet; the classes visible from the scan alone are:
//
//   * a WRAPPER/ENTRY pair in one file -- one body, two faces, cannot drift.
//     `$29321C main0Target/main0Step29321C`, `$293642`, `$29F8F0`, `$2A00C0`,
//     `$2A0D16`, `$2851D2`, `$2847FE` and most of the boss4/bossarrival rows.
//   * a RANGE END counted beside its opening address -- `$23BFDB` beside
//     `$23BF74`, `$2A3E15` beside `$2A3AF6`. Two rows, one finding.
//   * a DOC MISLABEL -- W447 found `$246710` on a body that is `$246704`, and a
//     wider doc scan finds MORE of these, not fewer. `$2415A2` (palette.js
//     `install2415A2` against player.js `deathPalette2531DE`) has that smell.
//   * a REAL SECOND TRANSCRIPTION in two different files. `$242684` had SIX
//     private copies of the on/off-screen test across handlers, items,
//     stage3carrier, stage3type16, stage4type41 and stage4type42. W451 READ ALL
//     SIX AND MERGED THEM into `movement.js offScreen242684`, taking the count
//     from 92 to 91. Five agreed with the image. The sixth,
//     `stage4type42.js onScreen`, invented a scroll add, swapped the axes, made
//     up both bands, and inverted the call-site polarity, so a type $42 child
//     was freed the frame it came on screen.
//
//     W453 then read `$242494` in `bossscripts.js dist242494` and private
//     `items.js dist242494`. Both heads and six shared body markers named the
//     pair. Exact `$24248E..$2424B9` bytes and the real `$27EE88` dirty-item
//     witness proved them equivalent, so the private body merged into the
//     exported helper and the count fell from 91 to 90. Next sharpest are
//     `$24631C` (`clear24631C` in objslot8.js AND stageend.js), `$2414BE` and
//     `$28C0FC` (`installTxBank` and `cueStreamNote`, each written twice under
//     the SAME name in objslot8.js and objslot12.js), `$28E7A2`, `$28C6C6`,
//     `$28F4C4`, `$285A12` and `$2A6EDC`.
//
// Each of those is its own wave. W446/W447/W448/W449 say what they cost when
// they are not: a frozen background, a boss that refills its HP, a death effect
// that can never run, and an invented condition in the only copy with a caller.
const HEAD_REGISTER = Object.freeze([
  0x23bf74, 0x23bfdb, 0x23c622, 0x23e3e2, 0x23ff06, 0x240dc2,
  0x240f62, 0x24133c, 0x2414be, 0x24150a, 0x2415a2, 0x241688,
  0x24179e, 0x2417de, 0x242e24, 0x242ec2,
  0x24560a, 0x2456a6, 0x24631c, 0x246710, 0x24676a, 0x2497aa,
  0x249e4e, 0x249ea0, 0x249ee2, 0x24c096, 0x24c338, 0x24caae,
  0x24d480, 0x253b94, 0x253e96, 0x2562fc, 0x2564f0, 0x259962,
  0x25a14c, 0x25cb92, 0x25d9e6, 0x25da60, 0x25e4d0, 0x25ef30,
  0x25f074, 0x25ff38, 0x26070c, 0x26134e, 0x26233a, 0x263386,
  0x2633be, 0x2638a6, 0x268018, 0x269cea, 0x26a5e4, 0x27ea9a,
  0x27f6e4, 0x280b3e, 0x280fdc, 0x2820cc, 0x284190, 0x2847fe,
  0x284b6a, 0x2851d2, 0x285a12, 0x286096, 0x286128, 0x286a80,
  0x286ae8, 0x286b9a, 0x2875b4, 0x289004, 0x289f96, 0x28ad54,
  0x28c0fc, 0x28c6c6, 0x28cb38, 0x28d520, 0x28e7a2, 0x28ecb2,
  0x28f4c4, 0x28f588, 0x28f666, 0x292902, 0x29321c, 0x293642,
  0x29f8f0, 0x29f9b4, 0x2a00c0, 0x2a0d16, 0x2a11d4, 0x2a3af6,
  0x2a3e15, 0x2a6edc,
]);

test('SECTION 3: the widened head register is exactly these 90 addresses', () => {
  const { idx } = headIndex();
  const wide = headRegister();
  assert.deepEqual(wide.map(hex), [...HEAD_REGISTER].map(hex),
    'the set of ROM addresses claimed by two or more function-like heads MOVED.\n'
    + 'A NEW one is the W446/W447/W448/W449 defect happening again: two bodies for one\n'
    + 'routine, free to drift, usually with only one of them live. MERGE them -- do not\n'
    + 'add the address here. A row LEAVING is fine if a wave merged it; say so where you\n'
    + 'delete it, the way w446 SECTION 2b records W447\'s, W448\'s and W449\'s merges.\n'
    + 'Claimants of anything unexpected:\n  '
    + wide.filter((a) => !HEAD_REGISTER.includes(a))
      .map((a) => `${hex(a)} <- ${[...idx.get(a).keys()].join(' | ')}`).join('\n  '));

  // ASSERTED AS A NUMBER TOO -- W447's lesson. An empty list satisfies a
  // `deepEqual` against a shrunken array and reads as five merges' progress.
  assert.equal(wide.length, 90,
    'the widened register is not 90. W449 left the NARROW one at 19; widening the head '
    + 'forms and the doc-span rule took it to 92, of which 19 were the old rows and 73 '
    + 'newly visible. W451 merged $242684 (92 - 1 = 91), then W453 merged $242494 '
    + '(91 - 1 = 90)');

  // ...and every address the four merged waves removed must STAY off it, now
  // measured by a scan that can see private copies rather than only exports.
  for (const [a, wave] of [[0x25ffa8, 'W446'], [0x2428a6, 'W447'], [0x242b3c, 'W447'],
    [0x246520, 'W448'], [0x24652a, 'W448'], [0x246800, 'W449'], [0x242684, 'W451'],
    [0x242494, 'W453']]) {
    assert.ok(!wide.includes(a),
      `${hex(a)} is claimed twice AGAIN under the widened scan (${wave} merged it). `
      + 'The narrow scan could not have told you: a private re-transcription is exactly '
      + 'what it could not see, and $246800 is the address it got wrong');
  }
});

// ---------------------------------------------------------------- SECTION 4

// THE BODY REGISTER -- the axis the old scan did not have.
//
// `clearChain` carried NO name suffix and NO doc. Widening the head forms alone
// would still have missed it; the only thing that named it was its two trailing
// markers, `// $246806` and `// $246808`. SECTION 6 proves that on the real
// deleted body.
//
// A pair here is two DISTINCT bodies citing two or more of the same ROM
// instruction addresses. One shared address is a coincidence (both call it);
// a RUN is a transcription. Keyed by `file name` and never by line number, so
// an edit anywhere above a function cannot redden this.
//
// 23 of these 35 name a body that is on NO head register row, so they are
// findings the address axis cannot make on its own. W455 removed the previous
// strongest body-only row, `items.js beamReset25270C <> laser.js
// wipeSegmentPool`: the full reset keeps its unique `andi.w #$DFFB` head and
// delegates the cartridge's one `$25279A..$2527BC` tail to `wipeSegmentPool`.
//
// W454 REMOVED `handlers.js fire11 <> turret.js turretStep`: the cartridge's
// `$268A0E` and `$268376` blocks differ only in their type-local draw branches
// and sprite-table address, so both production handlers now call one body.
//
// W453 REMOVED `bossscripts.js dist242494 <> items.js dist242494`, which shared
// six markers and also occupied a head row. Exact cartridge bytes and the real
// dirty-item `$27EE88` caller proved both bodies equivalent.
const BODY_REGISTER = Object.freeze([
  ['aim.js targetSelectBy <> midboss.js bigFan', [0x24270a, 0x242726]],
  ['background.js elemScrollComp <> effects.js runEffectDriver', [0x2417a8, 0x2417b0]],
  ['background.js elemScrollComp <> movement.js scrollCompensate', [0x2417a8, 0x2417b0]],
  ['background.js resetScrolls23C61E <> web/app.js draw', [0x23c5f2, 0x23c5fc]],
  ['bee.js collectTransform280FDC <> bee.js collectedTransform280FDC', [0x280ffc, 0x280ffe, 0x281002, 0x281010]],
  ['bomb.js fireBomb2498E2 <> player.js bombAndShotGuards', [0x2498e2, 0x249b28]],
  ['continuescreen.js continuePrompt28864C <> continuescreen.js continueWipe28871C', [0x28872a, 0x288758]],
  ['effects.js runEffectDriver <> movement.js scrollCompensate', [0x24179e, 0x2417a8, 0x2417b0]],
  ['handlers.js damageFirstHead <> handlers.js damageFirstHead269CEA', [0x242684, 0x263762]],
  ['handlers.js damageFirstHead <> handlers.js handler82', [0x242684, 0x263762]],
  ['handlers.js damageFirstHead269CEA <> handlers.js handler82', [0x242684, 0x263762]],
  // W451 REMOVED `handlers.js onScreen242684 <> items.js offScreen242684`
  // ($242688, $24268C): both bodies are gone, merged into the one exported
  // `movement.js offScreen242684`. The three `damageFirstHead` rows below KEEP
  // $242684 and that is correct -- they cite it as `// jsr $242684` beside
  // `// jmp $263762`, which is a shared CALL, not a shared transcription. W450's
  // own negative control says a call target must not count as one; these three
  // are the residue of two calls landing in the same two handlers, and reading
  // them is how this wave knew there were six copies and not nine.
  ['hud.js drainItems284468 <> hud.js perFrame28444E', [0x284468, 0x2844a6]],
  ['hud.js gates2844A6 <> hud.js playerBlock', [0x2844c8, 0x28465c]],
  ['initbody.js damageFirstFamily <> initbody.js init85Or86', [0x2637a2, 0x263808]],
  ['initbody.js rankByte242E24 <> rng.js drawByte242E24', [0x242e24, 0x242e3a]],
  ['items.js applyItemVelocity <> movement.js applyVelocityA6', [0x2417e0, 0x2417e4, 0x2417ea, 0x2417f2, 0x2417f4, 0x2417f8]],
  ['items.js applyItemVelocity <> options.js podKnockback24D188', [0x2417f2, 0x2417f4, 0x2417f8]],
  ['items.js applyItemVelocity <> player.js applyPlayerVector2417DE', [0x2417ea, 0x2417f4, 0x2417f8]],
  ['items.js applyItemVelocity <> player.js updatePlayer', [0x2417f4, 0x2417f8]],
  ['laser.js runLaserGate <> options.js runOneBlock', [0x24c16e, 0x24c178]],
  ['movement.js applyVelocityA6 <> options.js podKnockback24D188', [0x2417f2, 0x2417f4, 0x2417f8]],
  ['movement.js applyVelocityA6 <> player.js applyPlayerVector2417DE', [0x2417ea, 0x2417f4, 0x2417f8]],
  ['movement.js applyVelocityA6 <> player.js updatePlayer', [0x2417f4, 0x2417f8]],
  ['objslot13.js exitArm <> objslot13.js objSlot13', [0x288a22, 0x288a28, 0x288a2a]],
  ['options.js podKnockback24D188 <> player.js applyPlayerVector2417DE', [0x2417f4, 0x2417f8]],
  ['options.js podKnockback24D188 <> player.js updatePlayer', [0x2417f4, 0x2417f8]],
  ['player.js applyPlayerVector2417DE <> player.js updatePlayer', [0x2417f4, 0x2417f8]],
  ['player.js armRequest25FF38 <> tallyscreen.js tallyRequest25FF38', [0x25ff4a, 0x25ff4c]],
  ['rank.js playerRecords25FE42 <> rank.js stagePair2603FE', [0x24119c, 0x2411c4]],
  ['score.js laserAltHit <> score.js laserScoreHit', [0x286abc, 0x286aea]],
  ['spawn.js dispatchScriptRecord <> spawn.js walkScriptLoop', [0x2633e0, 0x263428]],
  ['stageend.js artByte28ECB2 <> stageend.js loadBannerArt', [0x28ecc2, 0x28eda2]],
  ['stageend.js f4BonusPool28DB5E <> stageend.js result28D9AA', [0x28db5e, 0x28dc18, 0x28dc1c]],
  ['tallyscreen.js cursorsFromPosted25D9E6 <> tallyscreen.js mapSavedCursor25D9E6', [0x25d9ea, 0x25d9f8, 0x25da04, 0x25da10, 0x25da2e, 0x25da50]],
  ['tallyscreen.js loadSavedCursor25DA60 <> tallyscreen.js restoreCursors25DA60', [0x25da6c, 0x25da86, 0x25da8a, 0x25da8e]],
]);

test('SECTION 4: exactly these 35 pairs of bodies transcribe a shared run of ROM instructions',
  () => {
    const got = bodyPairs().map(([p, v]) => [p, v]);
    assert.deepEqual(got.map(([p]) => p), BODY_REGISTER.map(([p]) => p),
      'the set of body pairs sharing two or more transcription markers MOVED.\n'
      + 'This is the axis that would have named `animobjects.js clearChain` -- the copy\n'
      + 'W449 found with no export, no name suffix and no doc. A NEW pair is two bodies\n'
      + 'writing down the same ROM instructions, which is a duplicate until somebody\n'
      + 'reads both and says why not. Unexpected:\n  '
      + got.filter(([p]) => !BODY_REGISTER.some(([q]) => q === p))
        .map(([p, v]) => `${p}   ${v.map(hex).join(' ')}`).join('\n  '));

    for (const [p, addrs] of got) {
      const want = BODY_REGISTER.find(([q]) => q === p)[1];
      assert.deepEqual(addrs.map(hex), [...want].map(hex),
        `the markers shared by ${p} changed. A pair losing markers can mean a merge -- `
        + 'or it can mean somebody deleted the comments that made the duplicate visible');
    }

    assert.equal(got.length, 35,
      'the body register is not 35 pairs (39 at W450, minus $242684 at W451, '
      + '$242494 at W453, the turret block at W454 and the beam reset at W455). '
      + 'As a NUMBER as well as a set, because an empty list satisfies a deepEqual '
      + 'against a shrunken array and reads as progress');
  });

// ---------------------------------------------------------------- SECTION 5

/** Build a throwaway `src/` tree and hand back its absolute path. */
function plant(files) {
  const dir = mkdtempSync(join(tmpdir(), 'w450-'));
  for (const [name, text] of Object.entries(files)) {
    const p = join(dir, name);
    mkdirSync(join(p, '..'), { recursive: true });
    writeFileSync(p, text);
  }
  return dir;
}

// THE PROOF THAT THIS IS NOT A CLAIM.
//
// W449's lesson was that the old scan passed for 108 waves while a test one file
// away proved the opposite from the cartridge image. "The scan found nothing new"
// is worth nothing without a planted positive that makes it go red.
//
// Each arm plants a copy the SHIPPED scan cannot see, and requires:
//   the widened scan to NAME it, and the narrow scan to MISS it.
// The second half is what makes each arm a statement about the widening rather
// than about scanning in general.
test('SECTION 5 RED: a PRIVATE `function` copy is caught by the widened scan and MISSED by '
  + 'the shipped one', () => {
  const dir = plant({
    'live.js': '/** `$246800`, the chain free. */\nexport function freeChain246800(ram, h) { return h; }\n',
    'hidden.js': 'function freeChain246800(ram, h) { return h; }\nexport const use = (r, h) => freeChain246800(r, h);\n',
  });
  try {
    assert.deepEqual(headRegister(dir).map(hex), ['$246800'],
      'the widened scan must see the PRIVATE second copy -- this is exactly W449\'s '
      + '`clearChain` shape and the whole reason this wave exists');
    const narrow = [...narrowIndex(dir)].filter(([, v]) => v.size > 1).map(([a]) => a);
    assert.deepEqual(narrow.map(hex), [],
      'the SHIPPED scan is supposed to be blind to this. If it sees it, the premise of '
      + 'this wave is wrong and the report must say so');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('SECTION 5 RED: an arrow, a method and an object property each count as a copy', () => {
  for (const [what, text] of [
    ['const arrow', 'const helper246800 = (ram, h) => h;\nexport const use = () => helper246800;\n'],
    ['one-arg arrow', 'const helper246800 = ram => ram;\nexport const use = () => helper246800;\n'],
    ['const function-expression', 'const helper246800 = function (ram) { return ram; };\nexport const use = () => helper246800;\n'],
    ['class method', 'export class C {\n  helper246800(ram) {\n    return ram;\n  }\n}\n'],
    ['object property', 'export const T = {\n  helper246800: (ram) => ram,\n};\n'],
  ]) {
    const dir = plant({
      'live.js': '/** `$246800`, the chain free. */\nexport function freeChain246800(ram, h) { return h; }\n',
      'hidden.js': text,
    });
    try {
      assert.deepEqual(headRegister(dir).map(hex), ['$246800'],
        `a copy written as a ${what} is invisible to the widened scan -- that form's regex is dead`);
      assert.deepEqual([...narrowIndex(dir)].filter(([, v]) => v.size > 1).map(([a]) => hex(a)), [],
        `the shipped scan is supposed to be blind to a ${what}`);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('SECTION 5 RED: a copy with NO name suffix and NO doc is caught by its BODY MARKERS alone',
  () => {
    // THE `clearChain` SHAPE EXACTLY. Nothing about this function names $246800:
    // not the name, not a doc, not an export. Only the two trailing comments.
    const dir = plant({
      'live.js': '/** `$246800`, the chain free. */\n'
        + 'export function freeChain246800(ram, at) {\n'
        + '  ram.setU16(at, 0);            // $246806 clr.w (A0)\n'
        + '  ram.setU16(at + 4, 0);        // $246808 move.w #$0,($4,A0)\n'
        + '  return at;\n}\n',
      'hidden.js': 'function tidy(ram, at) {\n'
        + '  ram.setU16(at, 0);            // $246806\n'
        + '  ram.setU16(at + 4, 0);        // $246808\n'
        + '}\n'
        + 'export const use = (r, a) => tidy(r, a);\n',
    });
    try {
      assert.deepEqual(bodyPairs(dir).map(([p]) => p), ['hidden.js tidy <> live.js freeChain246800'],
        'the BODY axis must name a copy that announces itself nowhere else. Widening the head '
        + 'forms alone does NOT catch this shape -- `clearChain` had no suffix and no doc');
      assert.deepEqual(headRegister(dir).map(hex), [],
        'and the HEAD axis must be blind to it, which is why the body axis had to exist');
      assert.deepEqual([...narrowIndex(dir)].filter(([, v]) => v.size > 1).map(([a]) => hex(a)), [],
        'the shipped scan sees nothing here at all');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

test('SECTION 5 RED: a `$A..$B` opening span claims BOTH ends, so neither can hide', () => {
  const dir = plant({
    'a.js': '/** `$249EA0..$249EE2` -- the ground plane. */\nexport function groundPlane(r) { return r; }\n',
    'b.js': '/** `$249EA0..$249EE2` -- the same, drawn. */\nexport function drawShadow(r) { return r; }\n',
    'c.js': '/** `$249EA0`, the entry alone. */\nexport function entryOnly(r) { return r; }\n',
  });
  try {
    assert.deepEqual(headRegister(dir).map(hex), ['$249EA0', '$249EE2'],
      'the shipped regex required a TRAILING backtick and so took $249EE2 only, missing that '
      + 'three heads claim $249EA0. Picking the other end would just move the blind spot');
    assert.deepEqual([...narrowIndex(dir)].filter(([, v]) => v.size > 1).map(([a]) => hex(a)),
      ['$249EE2'], 'the shipped scan sees one end of the span and not the other');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// TWO NEGATIVE CONTROLS. A guard that fires on everything gets weakened until it
// fires on nothing, so these pin the two ways the body axis could go useless.
test('SECTION 5 NEGATIVE: two bodies that CALL the same routine are not a pair', () => {
  const dir = plant({
    'a.js': 'export function one(r) {\n  emit(r);      // $28566C jsr $23FAC4\n  emit(r);      // $285670 jsr $23FA96\n}\n',
    'b.js': 'export function two(r) {\n  emit(r);      // $2857B4 jsr $23FAC4\n  emit(r);      // $2857B8 jsr $23FA96\n}\n',
  });
  try {
    assert.deepEqual(bodyPairs(dir), [],
      'a marker transcribes its OWN address; the second address on the line is the call '
      + 'TARGET. Counting targets makes every pair of callers look like a duplicate -- '
      + 'measured on src/, that alone took this register from 39 pairs to 112');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('SECTION 5 NEGATIVE: ONE shared marker is a coincidence, not a transcription', () => {
  const dir = plant({
    'a.js': 'export function one(r) {\n  go(r);        // $268A1A move.w D0,D1\n  go(r);        // $111111 nope\n}\n',
    'b.js': 'export function two(r) {\n  go(r);        // $268A1A move.w D0,D1\n  go(r);        // $268B44 rts\n}\n',
  });
  try {
    assert.deepEqual(bodyPairs(dir), [],
      'a single shared address must not make a pair -- two bodies transcribing one routine '
      + 'share a RUN of its instructions');
    assert.equal(bodyPairs(dir, 1).length, 1, '...but at a threshold of one it IS found, so '
      + 'the negative above is the THRESHOLD working and not the scan being broken');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---------------------------------------------------------------- SECTION 6

// THE HISTORICAL POSITIVE CONTROL.
//
// The three bodies below are the `$246800` transcriptions as they stood at the
// commit BEFORE W449's merge (`819ea42~1`), reproduced with their marker
// comments intact: `animobjects.js clearChain` (private, no suffix, no doc),
// `spawn.js freeChain246800` and `stageend.js chainFree246800`.
//
// **THE SHIPPED SCAN NAMED TWO OF THE THREE.** W447 measured "three claimants"
// for `$246800` only because a third file also carried a doc-claiming export.
// On these three bodies the narrow scan reaches `clearChain` not at all -- which
// is the whole of W449's finding, reproduced here as an executable check rather
// than a sentence in the docket.
const W449_BODIES = Object.freeze({
  'animobjects.js': 'function clearChain(ram, root) {\n'
    + '  let at = root;\n'
    + '  while (at !== 0) {\n'
    + '    const next = ram.u32(at + N.next);\n'
    + '    ram.setU16(at + N.status, 0);                     // $246806\n'
    + '    ram.setU16(at + N.mode, 0);                       // $246808\n'
    + '    at = next;\n'
    + '  }\n'
    + '}\n'
    + 'export const use = (r, a) => clearChain(r, a);\n',
  'spawn.js': 'export function freeChain246800(ram, head) {\n'
    + '  let at = head;\n'
    + '  for (;;) {\n'
    + '    ram.setU16(at, 0);                                   // $246806 clr.w (A0)\n'
    + '    ram.setU16(at + 0x04, 0);                            // $246808 move.w #$0,($4,A0)\n'
    + '    const next = ram.u32(at + 0x2c);                     // $24680E move.l ($2C,A0),D0\n'
    + '    if (next === 0) return 1;                            // $246812 bne $246804\n'
    + '    at = next;\n'
    + '  }\n'
    + '}\n',
  'stageend.js': 'export function chainFree246800(ram, handle) {\n'
    + '  let cur = handle >>> 0;                                   // $246804 movea.l d0,a0\n'
    + '  while (true) {\n'
    + '    ram.setU16(cur, 0);                                     // $246806 clr.w (a0)\n'
    + '    ram.setU16(cur + CHAIN.subOff, 0);                      // $246808 $4 := 0\n'
    + '    const next = ram.u32(cur + CHAIN.linkOff);              // $24680E $2c(a0)\n'
    + '    if (next === 0) break;                                  // $246812 bne loop\n'
    + '    cur = next >>> 0;\n'
    + '  }\n'
    + '}\n',
});

test('SECTION 6: on W449\'s own three bodies, the widened scan names the PRIVATE one and the '
  + 'shipped scan does not', () => {
  const dir = plant(W449_BODIES);
  try {
    const cited = bodyIndex(dir);
    assert.deepEqual([...(cited.get(0x246806) ?? [])].sort(),
      ['animobjects.js clearChain', 'spawn.js freeChain246800', 'stageend.js chainFree246800'],
      '$246806 is transcribed by all THREE of W449\'s bodies. If `clearChain` is missing here, '
      + 'the body axis has stopped working and this guard is back to W444\'s blind spot');

    const pairs = bodyPairs(dir).map(([p]) => p);
    assert.deepEqual(pairs, [
      'animobjects.js clearChain <> spawn.js freeChain246800',
      'animobjects.js clearChain <> stageend.js chainFree246800',
      'spawn.js freeChain246800 <> stageend.js chainFree246800',
    ], 'all three pairings must be reported -- the register said THREE copies and the truth '
      + 'was four, so the pair the old scan could not make is the one that matters');

    // ...and the shipped scan reaches exactly the two EXPORTS, never the private one.
    const narrow = narrowIndex(dir);
    assert.deepEqual([...(narrow.get(0x246800) ?? [])].sort(),
      ['spawn.js:1 freeChain246800', 'stageend.js:1 chainFree246800'],
      'the shipped scan indexes the two exported copies by name suffix and CANNOT reach '
      + '`clearChain`. That is W449\'s finding, and it is why 19 was a floor');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
