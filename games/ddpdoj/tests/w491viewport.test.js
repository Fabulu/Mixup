// W491: every layout can hide chrome, fill the viewport, and show touch-stick motion.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { attachStick, clearTouch } from '../src/web/input.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const HTML = readFileSync(ROOT + '/index.html', 'utf8');
const MODULE = HTML.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1] ?? '';
const CSS = HTML.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';

class FakeZone {
  constructor() {
    this.listeners = new Map();
    this.captures = [];
  }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  setPointerCapture(id) { this.captures.push(id); }
  fire(type, fields) {
    let prevented = false;
    this.listeners.get(type)?.({
      pointerId: 1, pointerType: 'touch', clientX: 100, clientY: 120,
      preventDefault() { prevented = true; }, ...fields,
    });
    return prevented;
  }
}

test('W491 desktop and mobile can hide chrome without losing the reveal control', () => {
  assert.match(HTML, /id="hide-ui"[^>]*>HIDE UI<\/button>/);
  assert.match(HTML, /id="show-ui"[^>]*>SHOW UI<\/button>/);
  assert.match(CSS, /body\.chrome-hidden\s*\{[^}]*grid-template-rows:\s*minmax\(0,\s*1fr\)/);
  assert.match(CSS, /body\.chrome-hidden\s+#bar\s*\{[^}]*display:\s*none/);
  assert.match(CSS, /body\.chrome-hidden\s+#show-ui\s*\{[^}]*display:\s*block/);
  assert.match(MODULE, /hideUiBtn\.addEventListener\('click',[\s\S]*setChromeHidden\(true\)/);
  assert.match(MODULE, /showUiBtn\.addEventListener\('click',[\s\S]*setChromeHidden\(false\)/);
  assert.match(MODULE, /function setChromeHidden\(hidden\)[\s\S]*fit\(\)/);
});

test('W491 the picture fills every viewport and anchors at the top', () => {
  assert.match(MODULE, /fitCanvas\(canvas, stage, mode, \{ fill: true \}\)/);
  assert.match(CSS, /#stage\s*\{[^}]*align-items:\s*flex-start/);
  assert.doesNotMatch(MODULE, /fill:\s*isFull\(\)/);
});

test('W491 touch controls overlay the game with transparent, bounded hit surfaces', () => {
  assert.match(CSS, /#pad\.on\s*\{[^}]*position:\s*fixed/);
  assert.match(CSS, /#pad\.on\s*\{[^}]*pointer-events:\s*none/);
  assert.match(CSS, /#pad\.on\s+\.dpad,\s*#pad\.on\s+\.cluster\s*\{[^}]*pointer-events:\s*auto/);
  assert.match(CSS, /\.dpad\s*\{[^}]*rgba\(/);
  assert.match(CSS, /\.dpad i\[data-on\]\s*\{[^}]*rgba\(/);
  assert.match(CSS, /\.tbtn\s*\{[^}]*rgba\(/);
  assert.match(CSS, /\.tbtn\[data-on\]\s*\{[^}]*rgba\(/);
});

test('W491 the DDPDOJ stick adapter paints origin, displacement, and release', () => {
  clearTouch();
  const zone = new FakeZone();
  const visuals = [];
  const backstop = attachStick(zone, {
    onVisual: (origin, current) => visuals.push([origin, current]),
  });

  assert.equal(zone.fire('pointerdown', {}), true);
  assert.deepEqual(visuals.at(-1), [{ x: 100, y: 120 }, { x: 100, y: 120 }]);
  assert.equal(zone.fire('pointermove', { clientX: 132, clientY: 144 }), true);
  assert.deepEqual(visuals.at(-1), [{ x: 100, y: 120 }, { x: 132, y: 144 }]);
  assert.equal(zone.fire('pointercancel', { clientX: 132, clientY: 144 }), true);
  assert.deepEqual(visuals.at(-1), [null, null]);

  zone.fire('pointerdown', { pointerId: 2, clientX: 40, clientY: 50 });
  backstop();
  assert.deepEqual(visuals.at(-1), [null, null]);
  clearTouch();
});

test('W491 the page owns visible stick origin and bounded displacement markers', () => {
  assert.match(HTML, /id="stick-origin"[^>]*aria-hidden="true"/);
  assert.match(HTML, /id="stick-knob"[^>]*aria-hidden="true"/);
  assert.match(CSS, /#stick-origin,\s*#stick-knob\s*\{[^}]*position:\s*fixed/);
  assert.match(CSS, /#stick-origin\s*\{[^}]*border-radius:\s*50%/);
  assert.match(MODULE, /const paintStick = \(origin, current\) =>/);
  assert.match(MODULE, /Math\.min\(1,\s*44\s*\/\s*distance\)/);
  assert.match(MODULE, /attachStick\(stickzone,\s*\{ onVisual: paintStick \}\)/);
});
