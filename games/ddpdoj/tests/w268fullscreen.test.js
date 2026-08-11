// W268 (DOCKET D10): the page's FULLSCREEN escape from the mobile browser bar.
//
// Synthetic and source-text only, the same rule `web-page.test.js` states for itself: the
// suite must run without a cartridge and without a browser. What these assert is the
// CONTRACT the page's fullscreen code has to keep -- that it is gesture-driven, that it
// hides itself where the API does not exist, that it repaints from the platform event and
// not from the click, and that the orientation lock can never reject unhandled.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = fs.readFileSync(path.join(HERE, '..', 'index.html'), 'utf8');
const MODULE = PAGE.match(/<script type="module">([\s\S]*?)<\/script>/)[1];

test('W268 the page offers a FULL button, in the bar with the others', () => {
  assert.match(PAGE, /<button id="full"/, 'the button exists');
  // It must be a real button, not a label or a div: only a button gets the keyboard
  // activation that the Fullscreen API's gesture requirement accepts everywhere.
  assert.match(PAGE, /<button id="full" type="button"/);
  assert.match(PAGE, /aria-label="Enter or leave fullscreen"/);
  // ...and it sits inside #bar, before #rot, so it is reachable without opening INFO.
  const bar = PAGE.slice(PAGE.indexOf('<div id="bar">'), PAGE.indexOf('</div>',
    PAGE.indexOf('<div id="bar">')));
  assert.ok(bar.includes('id="full"'), 'inside the bar');
  assert.ok(bar.indexOf('id="full"') < bar.indexOf('id="rot"'), 'before TATE/WIDE');
  // Every other bar button carries a data-help; this one must too, or INFO's generated
  // help list silently loses a row.
  assert.match(PAGE, /<button id="full"[^>]*data-help="[^"]{20,}"/);
});

test('W268 it is GESTURE-driven and never automatic', () => {
  // Every engine gates fullscreen on a user gesture. A call outside a listener would
  // throw on load and, worse, would look like it should work.
  assert.match(MODULE, /fullBtn\.addEventListener\('click'/,
    'the request lives in a click handler');
  // W279 (D15) added a SECOND gesture that may request fullscreen: turning the
  // orientation LOCK on needs it, and needs it from inside the same click. The claim
  // is unchanged -- never automatic -- so BOTH handlers are stripped and the
  // remainder must still hold no request at all.
  assert.match(MODULE, /lockBtn\.addEventListener\('click'/,
    'the lock request also lives in a click handler');
  const auto = MODULE
    .replace(/fullBtn\.addEventListener\('click'[\s\S]*?\n  \}\);/, '')
    .replace(/lockBtn\.addEventListener\('click'[\s\S]*?\n  \}\);/, '');
  assert.ok(!/requestFullscreen\?\.\(|webkitRequestFullscreen\?\.\(/.test(auto),
    'and there is no request anywhere outside the two handlers');
});

test('W268 where the API does not exist the button HIDES rather than lying', () => {
  // iPhone Safari has no Element.requestFullscreen at all. There is no polyfill for
  // that, so the honest move is to take no space.
  assert.match(MODULE, /const canFull = !!\(document\.documentElement\.requestFullscreen/);
  assert.match(MODULE, /if \(!canFull\) \{[\s\S]{0,200}?fullBtn\.style\.display = 'none'/,
    'no API -> the button is removed, not left dead');
  // And the feature test looks at the ELEMENT prototype, not at a UA string. Checked
  // against the CODE with comments stripped, because the prose above it names iPhone
  // Safari on purpose and a naive grep would read that as sniffing.
  const code = MODULE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/navigator\.userAgent|navigator\.platform|iPhone|iPad/.test(code),
    'feature-detected, never sniffed');
});

test('W268 the label repaints from the PLATFORM event, not from the click', () => {
  // The user can leave fullscreen with the system gesture or Escape, which does not
  // click our button. A label painted only in the handler would then be wrong.
  assert.match(MODULE, /for \(const ev of \['fullscreenchange', 'webkitfullscreenchange'\]/);
  // W279 (D15): the same handler now also re-asserts the orientation lock, because
  // leaving fullscreen drops it on the engine's side. paintFull and fit still come
  // first, and in that order.
  assert.match(MODULE,
    /document\.addEventListener\(ev, \(\) => \{ paintFull\(\); fit\(\); applyLock\(\); \}\)/);
  // paintFull reads the CURRENT element rather than a local flag, for the same reason.
  assert.match(MODULE, /const paintFull = \(\) => \{\s*const on = !!fullEl\(\);/);
  assert.ok(!/let\s+isFull|var\s+isFull/.test(MODULE),
    'no shadow copy of the state to drift');
});

test('W268 the orientation lock can never reject unhandled', () => {
  // `screen.orientation.lock` throws on engines that have it but are not in fullscreen,
  // and an unguarded await surfaces as an unhandled rejection in the console -- which on
  // this page is where the port reports real defects.
  // W279 (D15) moved the call out of FULL and into `applyLock`, which is now the ONE
  // place that touches the API. The claim is unchanged and easier to check for it:
  // every call site is inside that function, and that function catches.
  const fn = MODULE.slice(MODULE.indexOf('async function applyLock'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /try \{/, 'the lock is inside a try');
  assert.match(body, /\} catch \{/, 'and it is caught');
  assert.match(body, /await screen\.orientation\.lock\(/, 'and that is the call');
  // No OTHER site may touch it, or a future edit could reintroduce the bare await.
  const elsewhere = MODULE.replace(/async function applyLock[\s\S]*?\n\}/, '');
  assert.ok(!/screen\.orientation\.lock\(|screen\.orientation\?\.lock/.test(elsewhere),
    'applyLock is the only caller');
  // It also must not be the thing a button reports success by: locking is a bonus.
  assert.match(body, /return false;/, 'a refused lock is reported, not thrown');
});

test('W268 entering or leaving fullscreen re-fits the canvas', () => {
  // The viewport changes size on both transitions, and pickScale chooses an INTEGER
  // scale -- so a page that did not re-fit would keep a scale chosen for the old box.
  const handler = MODULE.slice(MODULE.indexOf("fullBtn.addEventListener('click'"));
  assert.match(handler.slice(0, 1200), /paintFull\(\);\s*fit\(\);/,
    'the click path re-fits');
  assert.match(MODULE,
    /document\.addEventListener\(ev, \(\) => \{ paintFull\(\); fit\(\); applyLock\(\); \}\)/,
    'and so does the platform-event path');
});

test('W268 the dvh layout that D10 already had is still there', () => {
  // The fullscreen button is the escape hatch, NOT a replacement: on iPhone, and before
  // any tap, `100dvh` following the URL bar is what keeps the pad above the fold.
  assert.match(PAGE, /height: 100vh; height: 100dvh;/,
    'the vh fallback then the dvh, in that order');
  assert.match(PAGE, /@media \(orientation: landscape\) and \(max-height: 560px\)/,
    'and the landscape letterbox rule');
});
