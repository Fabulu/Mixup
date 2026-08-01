// The on-screen pad's WIRING, executed.
//
// tests/input.test.js proves the touch API produces the same $0007/$0005 bits
// as the keyboard. This file proves index.html actually CALLS it: the button a
// finger lands on resolves to a bit, the d-pad's hit test is fed the pointer's
// position inside its own bounding box, the capture/slide/release path behaves,
// and the backstop clears everything. That is the half a name-matching check
// cannot see -- a page can name every button correctly and still wire
// pointerdown to nothing.
//
// THIS IS NOT A BROWSER, and it is not evidence that the pad works on a phone.
// It is the page's REAL script text (extracted from the real file; only the two
// import specifiers are rewritten, main.js to a stub so nothing tries to fetch
// assets) run against the smallest DOM those handlers touch. What it catches is
// the wiring going stale -- a renamed id, a handler bound to the wrong event, a
// backstop that stops clearing.
//
// SEEN TO FAIL: binding the d-pad's pointermove to 'pointermoveXX' leaves the
// slide test at $8A instead of $81 (red); a typo in data-btn leaves the A press
// at $00 (red).

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const GAME = new URL('../', import.meta.url);
const PAD_BOX = { left: 0, top: 0, width: 144, height: 144 };   // 3x3 of 48px

// ---- the smallest DOM the page's handlers touch ---------------------------
function mkEl(tag, attrs = {}) {
  return {
    tag, dataset: { ...attrs.dataset }, hidden: false, style: {}, _h: {},
    cls: attrs.cls, textContent: '', attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    blur() { this.blurred = (this.blurred || 0) + 1; },
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener(t, fn) { (this._h[t] ||= []).push(fn); },
    removeAttribute() {},
    setPointerCapture(id) { this.captured = id; },
    getBoundingClientRect: () => ({ ...PAD_BOX }),
    getContext: () => null,
    querySelectorAll: () => [],
    fire(t, ev) { for (const fn of this._h[t] || []) fn({ preventDefault() {}, ...ev }); },
  };
}

let loads = 0;

/** The smallest AudioContext src/audio/output.js touches. See loadPage(). */
class FakeAudioContext {
  constructor() {
    globalThis.__lastFakeCtx = this;
    this.sampleRate = 44100;
    this.currentTime = 0;
    this.destination = { _in: [] };
    this.resumes = 0;
    this.gains = [];
  }
  createGain() {
    const g = { gain: { value: 1 }, connect() {}, disconnect() {} };
    this.gains.push(g);
    return g;
  }
  createBuffer(ch, len) {
    const d = new Float32Array(len);
    return { length: len, getChannelData: () => d };
  }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  resume() { this.resumes++; }
  close() { return Promise.resolve(); }
}

/** Build the page's DOM, run its script, hand back the handles. */
async function loadPage({ coarse = true, audioCtor } = {}) {
  const cellNames = [
    'UP LEFT', 'UP', 'UP RIGHT',
    'LEFT', '', 'RIGHT',
    'DOWN LEFT', 'DOWN', 'DOWN RIGHT',
  ];
  const cells = cellNames.map((c) => mkEl('i', { dataset: { cell: c } }));
  const buttons = {};
  for (const id of ['SELECT', 'START', 'B', 'A']) {
    buttons[id] = mkEl('button', { cls: 'tbtn', dataset: { btn: id } });
  }
  const dpad = mkEl('div');
  dpad.querySelectorAll = (sel) => (sel === 'i' ? cells : []);
  const pad = mkEl('div');
  const btnList = Object.values(buttons);
  pad.querySelectorAll = (sel) => (sel === '.tbtn' ? btnList : []);
  const note = mkEl('span', { cls: 'touchnote' });
  note.hidden = true;
  const sound = mkEl('button', { dataset: { on: 'on' } });
  sound.textContent = '♫ sound on';
  const audionote = mkEl('span');
  const byId = {
    screen: mkEl('canvas'), stage: mkEl('div'), stats: mkEl('span'),
    err: mkEl('div'), pad, dpad, sound, audionote,
  };

  const win = {
    _h: {},
    addEventListener(t, fn) { (this._h[t] ||= []).push(fn); },
    removeEventListener(t, fn) {
      const a = this._h[t]; if (a) this._h[t] = a.filter((f) => f !== fn);
    },
    fire(t, ev) { for (const fn of this._h[t] || []) fn({ preventDefault() {}, ...ev }); },
    devicePixelRatio: 3,
    visualViewport: { addEventListener() {} },
    matchMedia: (q) => ({ matches: coarse && q.includes('coarse') }),
    requestAnimationFrame() {}, setInterval() {},
    performance: { now: () => 0 },
  };
  const doc = {
    _h: {}, hidden: false,
    body: {
      classList: {
        _s: new Set(), add(c) { this._s.add(c); }, contains(c) { return this._s.has(c); },
      },
    },
    getElementById: (id) => byId[id],
    querySelectorAll: (sel) => (sel === '.touchnote' ? [note] : []),
    addEventListener(t, fn) { (this._h[t] ||= []).push(fn); },
    fire(t, ev) { for (const fn of this._h[t] || []) fn({ preventDefault() {}, ...ev }); },
  };
  globalThis.window = win;
  globalThis.document = doc;
  globalThis.addEventListener = win.addEventListener.bind(win);
  globalThis.removeEventListener = win.removeEventListener.bind(win);
  globalThis.matchMedia = win.matchMedia;
  globalThis.visualViewport = win.visualViewport;
  globalThis.requestAnimationFrame = () => {};
  // WAVE 14. CAPTURED, not discarded: the stats line is the only place the
  // k readout and the input-queue depth exist, and it is built inside this
  // callback. A page that stopped calling app.loopStats() would otherwise be
  // indistinguishable from one that still did.
  let statsTick = null;
  globalThis.setInterval = (fn) => { statsTick = fn; return 0; };
  // WAVE 13. The smallest AudioContext src/audio/output.js touches. It is a
  // FAKE and it proves nothing about how the browser sounds; what it proves is
  // that the page's gesture handler reaches arm(), that the mute button reaches
  // the gain node, and that a second gesture does not build a second context --
  // which is exactly the class of wiring this file exists for. `audio: null`
  // takes the no-Web-Audio branch instead.
  globalThis.__lastFakeCtx = undefined;
  if (audioCtor === null) delete globalThis.AudioContext;
  else globalThis.AudioContext = audioCtor || FakeAudioContext;

  const html = readFileSync(new URL('index.html', GAME), 'utf8');
  const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m, 'index.html has a module script');
  const inputUrl = pathToFileURL(new URL('src/input.js', GAME).pathname.slice(1)).href;
  // A `data:` module cannot resolve a relative specifier, so every one of the
  // page's imports has to be rewritten to an absolute URL or a stub. That is
  // also a check: a NEW import added to index.html and not listed here fails
  // this file loudly instead of being quietly ignored.
  const audioUrl = pathToFileURL(new URL('src/audio/output.js', GAME).pathname.slice(1)).href;
  // boot() is stubbed: this test is about the pad, and the real one fetches.
  // WAVE 14: the stub now also answers loopStats()/inputStats(), because the
  // page asks for them UNCONDITIONALLY. That is deliberate on both sides -- an
  // optional-chained `app.loopStats?.()` on the page would silently print
  // nothing the day boot() stopped returning it, and a stub that quietly
  // supplied a default would hide the same thing here.
  const stub = 'data:text/javascript,'
    + encodeURIComponent('export const fitCanvas = () => 4;\n'
      + 'export const boot = async () => ({ state: { obj: { x: [80], y: [96], anim: [1] },'
      + ' cam: { hi: 0, lo: 0 }, lagFrames: 0 },'
      + ' loopStats: () => ({ callbacks: 200, logicFrames: 210, maxK: 3,'
      + ' clamped: 1, k: [0,192,7,1,0,0,0,0,0] }),'
      + ' inputStats: () => ({ depth: 2, live: 0, repeats: 7, coalesced: 5,'
      + ' carried: 3, lostEdges: 1, cap: 2 }) });\n');
  // The trailing counter makes each load a DISTINCT data: URL. Without it the
  // ES module cache hands back the first instance and the script never runs
  // again -- every test after the first would then be asserting against a page
  // whose handlers are bound to a previous test's elements, and would report a
  // mask of 0 for everything. (Found exactly that way.)
  const patched = m[1]
    .replace("'./src/main.js'", JSON.stringify(stub))
    .replace("'./src/input.js'", JSON.stringify(inputUrl))
    .replace("'./src/audio/output.js'", JSON.stringify(audioUrl))
    + `\n// instance ${loads++}\n`;
  assert.ok(!/from '\.\//.test(patched),
    'index.html imports a relative module this test does not rewrite: '
    + (/from '(\.\/[^']+)'/.exec(patched) || [])[1]);
  assert.ok(patched.includes(inputUrl),
    'the page imports ./src/input.js -- if this fails the page stopped using '
    + 'the port\'s own input module, which is the whole point');
  await import('data:text/javascript,' + encodeURIComponent(patched));

  const input = await import(inputUrl);
  return { pad, dpad, cells, buttons, note, win, doc, input, sound, audionote,
           stats: byId.stats, runStatsTick: () => statsTick && statsTick(),
           mask: () => input.currentButtons(),
           litCells: () => cells.map((c, i) => ('on' in c.dataset ? i : -1)).filter((i) => i >= 0) };
}

const BTN = { RIGHT: 0x01, LEFT: 0x02, DOWN: 0x04, UP: 0x08, START: 0x10,
              SELECT: 0x20, B: 0x40, A: 0x80 };

test('the pad appears on a coarse pointer and the key legend steps aside', async () => {
  const p = await loadPage({ coarse: true });
  assert.ok(p.pad.classList.contains('on'), '#pad is shown');
  assert.ok(p.doc.body.classList.contains('touch'), 'body carries .touch');
  assert.equal(p.note.hidden, false, 'the touch-only note is revealed');
  assert.equal(p.mask(), 0, 'and nothing is pressed yet');
  p.win.fire('blur', {});
});

test('a face button press sets its bit, captures the pointer, and releases', async () => {
  const p = await loadPage();
  for (const [id, bit] of Object.entries({ A: BTN.A, B: BTN.B, START: BTN.START, SELECT: BTN.SELECT })) {
    const b = p.buttons[id];
    b.fire('pointerdown', { pointerId: 7 });
    assert.equal(p.mask(), bit, `${id} sets $${bit.toString(16)}`);
    assert.equal(b.captured, 7, `${id} captured the pointer -- a finger that `
      + 'slides off it must still deliver its release here');
    assert.equal(b.dataset.on, '1', `${id} lights up`);
    b.fire('pointerup', { pointerId: 7 });
    assert.equal(p.mask(), 0, `${id} released`);
    assert.ok(!('on' in b.dataset), `${id} unlit`);
  }
  // pointercancel -- the browser taking the gesture -- must release too.
  p.buttons.A.fire('pointerdown', { pointerId: 8 });
  p.buttons.A.fire('pointercancel', { pointerId: 8 });
  assert.equal(p.mask(), 0, 'pointercancel is a release, not a stuck button');
  p.win.fire('blur', {});
});

test('the d-pad reports a diagonal, slides without lifting, and lets go', async () => {
  const p = await loadPage();
  p.buttons.A.fire('pointerdown', { pointerId: 1 });          // fire held throughout

  p.dpad.fire('pointerdown', { pointerId: 2, clientX: 10, clientY: 10 });
  assert.equal(p.mask(), BTN.A | BTN.UP | BTN.LEFT, 'the top-left third is a DIAGONAL');
  assert.deepEqual(p.litCells(), [0, 1, 3], 'the corner cell and both edges light');

  p.dpad.fire('pointermove', { pointerId: 2, clientX: 130, clientY: 72 });
  assert.equal(p.mask(), BTN.A | BTN.RIGHT, 'slid to the right third without lifting');
  assert.deepEqual(p.litCells(), [5], 'only RIGHT is lit now');

  // A stray second finger must not be able to steal the pad or clear the first
  // finger's grip. THIS PAIR WAS ADDED AFTER A MUTATION SURVIVED: deleting the
  // `if (padPointer !== null) return;` guard in index.html left the suite
  // green, because the only stray event tested was a pointerup, which the
  // pointerId check rejects anyway. A second pointerdown is what the guard is
  // actually for -- without it the pad changes owner and the first finger's
  // release is then ignored, which is a stuck direction.
  p.dpad.fire('pointerdown', { pointerId: 9, clientX: 72, clientY: 130 });
  assert.equal(p.mask(), BTN.A | BTN.RIGHT, 'a second finger cannot steal the pad');
  p.dpad.fire('pointerup', { pointerId: 9, clientX: 0, clientY: 0 });
  assert.equal(p.mask(), BTN.A | BTN.RIGHT, 'a stray pointerup changes nothing');

  // Dragged clean off the pad: the direction holds (the capture keeps the up).
  p.dpad.fire('pointermove', { pointerId: 2, clientX: 400, clientY: 72 });
  assert.equal(p.mask(), BTN.A | BTN.RIGHT, 'off the edge, still RIGHT');
  p.dpad.fire('pointerup', { pointerId: 2, clientX: 400, clientY: 72 });
  assert.equal(p.mask(), BTN.A, 'released -- directions cleared, fire still held');
  assert.deepEqual(p.litCells(), [], 'and nothing on the pad is lit');
  p.win.fire('blur', {});
});

test('the backstops clear the WHOLE mask, buttons and lights included', async () => {
  for (const how of ['blur', 'pagehide', 'visibilitychange']) {
    const p = await loadPage();
    p.buttons.A.fire('pointerdown', { pointerId: 1 });
    p.buttons.B.fire('pointerdown', { pointerId: 2 });
    p.dpad.fire('pointerdown', { pointerId: 3, clientX: 10, clientY: 130 });
    assert.equal(p.mask(), BTN.A | BTN.B | BTN.DOWN | BTN.LEFT, `${how}: set up`);
    if (how === 'visibilitychange') { p.doc.hidden = true; p.doc.fire('visibilitychange', {}); }
    else p.win.fire(how, {});
    assert.equal(p.mask(), 0, `${how} clears every bit`);
    assert.deepEqual(p.litCells(), [], `${how} unlights the d-pad`);
    for (const [id, b] of Object.entries(p.buttons)) {
      assert.ok(!('on' in b.dataset), `${how} unlights ${id}`);
    }
    // And the pad still works afterwards -- a backstop that leaves the page
    // dead is its own bug.
    p.buttons.A.fire('pointerdown', { pointerId: 4 });
    assert.equal(p.mask(), BTN.A, `${how}: the pad still works after the clear`);
    p.win.fire('blur', {});
  }
});

// ---- WAVE 13: the sound control and the autoplay gesture -------------------

test('audio is NOT started before a gesture, and the page says what it waits for',
  async () => {
    const p = await loadPage({ coarse: false });
    // The AudioContext is not constructed at all until arm() runs -- a
    // suspended context created at load is the shape that ends in permanent
    // silence with nothing on screen explaining it.
    assert.equal(globalThis.__lastFakeCtx, undefined,
      'the page built an AudioContext before any user gesture');
    assert.equal(p.audionote.hidden, false, 'the "sound starts on..." note is up');
    p.win.fire('blur', {});
  });

test('the first keydown arms the audio, hides the note, and unbinds itself', async () => {
  const p = await loadPage({ coarse: false });
  p.win.fire('keydown', { code: 'KeyX' });
  assert.equal(p.audionote.hidden, true, 'the note goes away once sound is on');
  const before = p.win._h.keydown.length;
  p.win.fire('keydown', { code: 'KeyX' });
  assert.equal(p.win._h.keydown.length, before,
    'the arming listener removed itself; a second gesture must not re-arm');
  p.win.fire('blur', {});
});

test('with no Web Audio the page says so and the game still runs', async () => {
  const p = await loadPage({ coarse: false, audioCtor: null });
  p.win.fire('keydown', { code: 'KeyX' });
  assert.match(p.audionote.textContent, /no Web Audio/);
  // ...and the joypad path is completely unaffected.
  p.buttons.A.fire('pointerdown', { pointerId: 1 });
  assert.equal(p.mask(), BTN.A);
  p.win.fire('blur', {});
});

test('the mute button reaches the gain node and gives the keyboard back', async () => {
  const p = await loadPage({ coarse: false });
  p.win.fire('pointerdown', { pointerId: 1 });        // arm
  const ctx = globalThis.__lastFakeCtx;
  assert.ok(ctx, 'the page constructed an AudioContext on the gesture');
  assert.equal(ctx.gains.length, 1, 'exactly one gain node');
  const gain = ctx.gains[0];
  assert.ok(gain.gain.value > 0, 'it starts audible');

  p.sound.fire('click', {});
  assert.equal(gain.gain.value, 0, 'muted means gain 0');
  assert.equal(p.sound.dataset.on, 'off');
  assert.equal(p.sound.attrs['aria-pressed'], 'true');
  // Enter is START ($9ADA). A button that keeps focus eats it.
  assert.ok(p.sound.blurred >= 1, 'the button blurs itself after a click');

  p.sound.fire('click', {});
  assert.ok(gain.gain.value > 0, 'unmuting restores the volume');
  assert.equal(p.sound.dataset.on, 'on');
  p.win.fire('blur', {});
});

test('on a fine pointer the pad stays hidden and nothing is bound to the game', async () => {
  const p = await loadPage({ coarse: false });
  assert.ok(!p.pad.classList.contains('on'), 'no pad on a mouse');
  assert.equal(p.note.hidden, true, 'the touch-only note stays hidden');
  // The handlers are still attached (they are harmless with the pad hidden),
  // but nothing has touched the joypad mask.
  assert.equal(p.mask(), 0, 'the keyboard path is untouched: mask is 0');
  p.win.fire('blur', {});
});

// ---------------------------------------------------------------------------
// WAVE 14. The stats line is not decoration: it is the ONLY place k -- how many
// logic frames one animation-frame callback ran -- can be read, because there
// is no browser anywhere in this repo's test suite and k cannot be measured
// without one. `13-FINDING-input-granularity-under-load.md` asked for the
// number and it was unobtainable; if this readout silently stops working, the
// question goes back to being unanswerable.
//
// SEEN TO FAIL: dropping `app.loopStats()` from index.html leaves the line
// without the k figure (red); returning the histogram but not `maxK` leaves it
// reading `NaNmax` (red).
test('the stats line carries k, the clamp count and the input queue depth', async () => {
  const p = await loadPage({ coarse: false });
  p.runStatsTick();
  const line = p.stats.innerHTML;
  assert.ok(line, 'the page wrote a stats line at all');
  // 210 logic frames over 200 callbacks = 1.05 average, maxK 3, 1 clamped.
  assert.match(line, /<b>k<\/b> 1\.05avg\/3max\/1clamped/,
    `k is missing from the stats line: ${line}`);
  // WAVE 15: three counters, not one, and `lost` no longer means `coalesced`.
  // A merge at the cap keeps every undelivered press (src/input.js), so calling
  // it "lost" told a phone player their steering was destroying their input
  // when it was not -- and left the number that DOES mean a destroyed input
  // with nowhere to appear.
  assert.match(line, /<b>inq<\/b> 2\/5merged\/3carried\/1LOST/,
    `the input queue counters are missing from the stats line: ${line}`);
  // And the numbers that were already there are still there.
  assert.match(line, /<b>lag<\/b> 0/);
  assert.match(line, /<b>snd<\/b>/);
  p.win.fire('blur', {});
});
