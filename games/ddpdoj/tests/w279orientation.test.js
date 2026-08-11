// W279 (DOCKET D13, D15): the safe-area insets in BOTH axes, and the orientation
// LOCK as a persisted user setting rather than a side effect of fullscreen.
//
// These are page-layout claims, so they are checked against `index.html` itself.
// That is the same shape `w268fullscreen.test.js` uses for D10 and the same reason:
// the alternative is a screenshot, and a screenshot cannot say WHY a rule is there.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');

/** The page's one inline module, so a syntax error in it fails a test not a boot. */
const MODULE_SRC = (() => {
  const m = PAGE.match(/<script type="module">([\s\S]*?)<\/script>/);
  assert.ok(m, 'the page has exactly one inline module');
  return m[1];
})();

/** Comments make every "does the page mention X" check unreliable; strip them. */
function stripComments(js) {
  return js.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const CODE = stripComments(MODULE_SRC);

// The one assertion here that is not a string match: does the page's only module
// actually PARSE? `vm.SourceTextModule` would need `--experimental-vm-modules`, which
// the suite does not pass, so this shells `node --check` over the extracted source
// written as `.mjs` -- which gives ESM parsing with no flag and no skip.
test('W279 the inline module parses as ESM', () => {
  const tmp = path.join(os.tmpdir(), `ddpdoj-page-${process.pid}.mjs`);
  writeFileSync(tmp, MODULE_SRC);
  try {
    const r = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
    assert.equal(r.status, 0, `node --check rejected the page's module:\n${r.stderr}`);
  } finally {
    try { unlinkSync(tmp); } catch { /* best effort */ }
  }
});

// ==================================================== D13: THE INSETS

test('W279 D13 the body pads BOTH horizontal safe-area insets, not just the bottom',
  () => {
    // A notched phone puts its cutout on a SHORT edge, so LANDSCAPE -- the
    // orientation D10 was about -- is exactly where the left/right pair bites, and
    // only `safe-area-inset-bottom` was present before this wave.
    const body = PAGE.slice(PAGE.indexOf('  body {'));
    const rule = body.slice(0, body.indexOf('}'));
    for (const side of ['right', 'bottom', 'left']) {
      assert.match(rule, new RegExp(`env\\(safe-area-inset-${side}\\)`),
        `the body pads safe-area-inset-${side}`);
    }
  });

test('W279 D13 `viewport-fit=cover` is what makes the insets necessary', () => {
  // The insets are not optional once this is set: it is opt-IN to painting under
  // the system chrome. If a later wave drops it, the padding becomes dead weight;
  // if a later wave drops the padding, the page paints under the cutout.
  assert.match(PAGE, /<meta name="viewport"[^>]*viewport-fit=cover/);
});

test('W279 D13 the top inset is deliberately NOT padded, and the page says why', () => {
  // #bar is a solid strip with its own border and reads correctly under a status
  // bar. Padding the top would leave a transparent gap above a dark bar, which
  // looks like a defect. Asserted so nobody "completes the set" by accident.
  const body = PAGE.slice(PAGE.indexOf('  body {'));
  const rule = body.slice(0, body.indexOf('}'));
  assert.ok(!/safe-area-inset-top/.test(rule), 'no top inset on the body');
  assert.match(PAGE, /top inset is deliberately NOT padded/i,
    'and the reason is written down');
});

test('W279 D13 #bar does NOT double-count the horizontal insets', () => {
  // #bar is INSIDE the padded body, so adding the insets again would inset twice.
  // This is the mistake this wave made and caught, so it is pinned.
  const bar = PAGE.slice(PAGE.indexOf('  #bar { display: flex'));
  const rule = bar.slice(0, bar.indexOf('}'));
  assert.ok(!/safe-area-inset-(left|right)/.test(rule),
    '#bar leaves the horizontal insets to body');
  assert.match(rule, /flex-wrap: wrap/,
    'and it wraps, so a fourth control cannot push the name off a narrow strip');
});

// ================================================ D15: THE LOCK SETTING

test('W279 D15 there is a LOCK button and it is a persisted setting', () => {
  assert.match(PAGE, /<button id="lock"/, 'the control exists');
  assert.match(CODE, /localStorage\.setItem\(LOCKSTORE/, 'the choice is written');
  assert.match(CODE, /localStorage\.getItem\(LOCKSTORE\)/, 'and read back on load');
  // Every localStorage touch on this page is wrapped, because private mode throws
  // and a boot that dies on a preference is worse than a lost preference.
  const gets = [...CODE.matchAll(/localStorage\.(get|set)Item/g)];
  assert.ok(gets.length >= 4, `found ${gets.length} storage calls`);
  for (const m of gets) {
    const before = CODE.slice(Math.max(0, m.index - 260), m.index);
    assert.match(before, /try\s*\{/, 'each storage call sits inside a try');
  }
});

test('W279 D15 the button hides itself where the API does not exist', () => {
  // iOS has no `screen.orientation.lock` at all. Feature-detected on the METHOD,
  // never sniffed from a UA string -- the same rule D10 established.
  assert.match(CODE, /const canLock = !!\(screen\.orientation && typeof screen\.orientation\.lock === 'function'\)/);
  assert.match(CODE, /if \(!canLock\) \{\s*lockBtn\.style\.display = 'none';/);
  assert.ok(!/userAgent|navigator\.platform|iPhone|Android/i.test(CODE),
    'no UA sniffing anywhere in the module');
});

test('W279 D15 the WANT and the STATE are separate, and the want is re-applied',
  () => {
    // A persisted lock cannot be applied on a fresh load, because every engine
    // requires fullscreen. So the button paints from the WANT and the want is
    // re-asserted whenever fullscreen changes -- otherwise the setting is silently
    // lost on load and again on every exit.
    assert.match(CODE, /lockBtn\.textContent = lockWanted \? 'LOCKED' : 'LOCK'/);
    const hook = CODE.slice(CODE.indexOf("'fullscreenchange', 'webkitfullscreenchange'"));
    assert.match(hook.slice(0, 260), /applyLock\(\)/,
      'fullscreenchange re-applies it');
  });

test('W279 D15 turning the lock ON asks for fullscreen from inside the same click',
  () => {
    // The gesture is what grants fullscreen, so a later attempt would be refused.
    const h = CODE.slice(CODE.indexOf("lockBtn.addEventListener('click'"));
    const body = h.slice(0, h.indexOf('\n  });'));
    assert.match(body, /requestFullscreen/, 'it asks inside the handler');
    assert.match(body, /lockWanted && !fullEl\(\)/, 'only when it needs to');
    assert.match(body, /applyLock\(\)/, 'and then applies the lock');
  });

test('W279 D15 the lock follows the PICTURE, and the mode toggle re-locks', () => {
  // TATE is the native presentation, but a player who chose WIDE wants landscape.
  assert.match(CODE, /mode === 'tate' \? 'portrait' : 'landscape'/);
  const rot = CODE.slice(CODE.indexOf("rotBtn.addEventListener('click'"));
  assert.match(rot.slice(0, 400), /applyLock\(\)/,
    'switching TATE/WIDE re-locks to the other orientation');
});

test('W279 D15 every lock call can fail without breaking anything', () => {
  // `screen.orientation.lock` REJECTS when not fullscreen. An unguarded call is an
  // unhandled rejection; W268 already learned this on the FULL path.
  const fn = CODE.slice(CODE.indexOf('async function applyLock'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /try \{/, 'the lock is attempted in a try');
  assert.match(body, /catch/, 'and its failure is swallowed');
  assert.match(body, /if \(!canLock\) return false/, 'and it no-ops without the API');
});

// ================================== FULL and LOCK are now DIFFERENT things

test('W279 FULL no longer silently locks -- that is LOCK\'s job now', () => {
  // W268's FULL called `screen.orientation.lock` unconditionally. It was not the
  // player's choice and there was no way to turn it off. FULL now applies the
  // player's setting instead of imposing one.
  const h = CODE.slice(CODE.indexOf("fullBtn.addEventListener('click'"));
  const body = h.slice(0, h.indexOf('\n  });'));
  assert.ok(!/screen\.orientation\?\.lock/.test(body),
    'FULL does not call lock directly any more');
  assert.match(body, /if \(lockWanted\) await applyLock\(\)/,
    'it applies the SETTING');
});
