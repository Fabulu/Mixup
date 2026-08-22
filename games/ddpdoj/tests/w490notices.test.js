// W490: replay and recording notices dismiss without stale-timer races.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createAutoDismissNotice } from '../src/web/app.js';

class FakeElement {
  constructor() {
    this.className = '';
    this.innerHTML = '';
    this.style = { display: 'none' };
    this.attrs = new Map();
  }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name); }
}

class FakeTimers {
  constructor() {
    this.next = 1;
    this.jobs = new Map();
    this.callbacks = new Map();
  }
  setTimeout(fn, delay) {
    const id = this.next++;
    this.jobs.set(id, { fn, delay });
    this.callbacks.set(id, fn);
    return id;
  }
  clearTimeout(id) { this.jobs.delete(id); }
  fire(id) {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    job?.fn();
  }
  fireStale(id) { this.callbacks.get(id)?.(); }
}

test('W490 a notice clears its content and overlay state after the visible interval', () => {
  const element = new FakeElement();
  const timers = new FakeTimers();
  const notice = createAutoDismissNotice(element, 4000, timers);

  notice.show('green', '<b>REC saved</b>');
  assert.equal(element.style.display, 'block');
  assert.equal(element.className, 'green');
  assert.equal(element.innerHTML, '<b>REC saved</b>');
  assert.equal(element.getAttribute('aria-hidden'), 'false');
  assert.equal(timers.jobs.get(1).delay, 4000);

  timers.fire(1);
  assert.equal(element.style.display, 'none');
  assert.equal(element.className, '');
  assert.equal(element.innerHTML, '');
  assert.equal(element.getAttribute('aria-hidden'), 'true');
});

test('W490 a replaced timer cannot hide a newer notice', () => {
  const element = new FakeElement();
  const timers = new FakeTimers();
  const notice = createAutoDismissNotice(element, 4000, timers);

  notice.show('', 'REC armed');
  notice.show('red', 'REPLAY ERROR');
  assert.equal(timers.jobs.has(1), false, 'replacement cancels the prior timer');
  assert.equal(timers.jobs.has(2), true);

  timers.fireStale(1);
  assert.equal(element.style.display, 'block');
  assert.equal(element.className, 'red');
  assert.equal(element.innerHTML, 'REPLAY ERROR');

  notice.show('green', 'REPLAY GREEN');
  assert.equal(timers.jobs.has(2), false,
    'a stale callback cannot discard the current timer handle');
  assert.equal(timers.jobs.has(3), true);
  timers.fireStale(2);
  assert.equal(element.innerHTML, 'REPLAY GREEN');

  timers.fire(3);
  assert.equal(element.style.display, 'none');
});

test('W490 manual dismissal invalidates and clears its pending timer', () => {
  const element = new FakeElement();
  const timers = new FakeTimers();
  const notice = createAutoDismissNotice(element, 4000, timers);

  notice.show('', 'PLAY');
  assert.equal(notice.hide(), true);
  assert.equal(timers.jobs.size, 0);
  timers.fireStale(1);
  assert.equal(element.style.display, 'none');
  assert.equal(element.innerHTML, '');
});

test('W490 the page routes every replay operation notice through auto-dismissal', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const html = readFileSync(root + '/index.html', 'utf8');
  const banner = html.match(/<div id="replay-banner"[^>]*>/)?.[0] ?? '';

  assert.match(banner, /role="status"/);
  assert.match(banner, /aria-live="polite"/);
  assert.match(banner, /aria-hidden="true"/);
  assert.match(html, /createAutoDismissNotice\(replayBannerEl,\s*4000\)/);
  assert.match(html, /paintReplayBanner\('',[\s\S]*REC armed/);
  assert.match(html, /paintReplayBanner\('',[\s\S]*REC saved/);
  assert.match(html, /showReplayError\(e, 'arming REC failed\.'\)/);
  assert.match(html, /showReplayError\(e, 'stopping REC failed\.'\)/);
  assert.match(html, /showReplayError\(e, 'loading the \.replay failed\.'\)/);
  assert.doesNotMatch(html, /replayBannerEl\.style\.display\s*=\s*'block'/);
  assert.match(html, /#replay-banner[^}]*pointer-events:\s*none/);
});
