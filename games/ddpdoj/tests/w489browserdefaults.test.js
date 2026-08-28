// W489: the browser launch removes the oracle fly-around intervention, and
// sound is enabled by the first browser gesture while remaining user-toggleable.

import test from 'node:test';
import assert from 'node:assert/strict';

import { MACHINE } from '../src/machine.js';
import {
  armSoundOnFirstGesture, boot, launchSeedForBrowser, toggleSound,
} from '../src/web/app.js';
import { MOD_RAM, createModState, resolveLoadout } from '../src/mods.js';

const mods = (...ids) => createModState(resolveLoadout(ids));

class FakeTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(fn);
    this.listeners.set(type, listeners);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  fire(type, target = null) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) fn({ type, target });
  }
}

class FakeControl {
  contains(target) { return target === this; }
}

class FakeSound {
  constructor() {
    this.muted = false;
    this.status = 'locked';
    this.arms = 0;
  }
  arm() {
    this.arms++;
    this.status = 'loading';
  }
  setMuted(value) { this.muted = !!value; }
  stats() { return { status: this.status }; }
}

test('W489 ordinary browser seed removes only the captured fly-around invulnerability', () => {
  const seed = new Uint8Array(MACHINE.ramSize);
  const invuln = MOD_RAM.invulnP1 - MACHINE.ramBase;
  seed[invuln] = 0xff;
  seed[0x1234] = 0x5a;

  const vanilla = launchSeedForBrowser(seed, null, null);
  assert.notEqual(vanilla, seed, 'ordinary browser launch owns a sanitized copy');
  assert.equal(vanilla[invuln], 0, 'the oracle intervention does not enter vanilla play');
  assert.equal(vanilla[0x1234], 0x5a, 'unrelated cartridge state is unchanged');
  assert.equal(seed[invuln], 0xff, 'the generated bundle seed remains immutable');

  const otherMod = launchSeedForBrowser(seed, null, mods('ghost-trail'));
  assert.equal(otherMod[invuln], 0, 'a non-survival mod does not retain invulnerability');

  const invincible = launchSeedForBrowser(seed, null, mods('invincibility'));
  assert.equal(invincible[invuln], 0,
    'Invincibility starts clean and acts through its collision filter');
});

test('W489 labelled progression and replay-compatible seeds retain their intervention', () => {
  const seed = new Uint8Array(MACHINE.ramSize);
  seed[MOD_RAM.invulnP1 - MACHINE.ramBase] = 0xff;
  const rung = { poke: '810424=FF' };

  assert.equal(launchSeedForBrowser(seed, rung, null), seed,
    'a labelled progression rung keeps the exact oracle seed');
});

test('W489 the first pointer, key, touch, or click gesture enables sound once', () => {
  for (const event of ['pointerdown', 'keydown', 'touchstart', 'click']) {
    const target = new FakeTarget();
    const sound = new FakeSound();
    armSoundOnFirstGesture(sound, target);

    target.fire(event);
    assert.equal(sound.arms, 1, `${event} arms the default-on controller`);
    target.fire(event);
    target.fire('keydown');
    assert.equal(sound.arms, 1, 'all unlock listeners are removed together');
  }
});

test('W489 SOUND gesture toggles off before audio can arm, then cleanly enables', () => {
  const target = new FakeTarget();
  const button = new FakeControl();
  const sound = new FakeSound();
  armSoundOnFirstGesture(sound, target, button);

  target.fire('pointerdown', button);
  assert.equal(sound.arms, 0, 'button pointerdown cannot briefly start audio');
  assert.equal(toggleSound(sound), false);       // target click handler
  target.fire('click', button);                 // then the bubbled unlock listener
  assert.equal(sound.arms, 0, 'the first SOUND click is an explicit mute');

  target.fire('keydown', button);
  assert.equal(toggleSound(sound), true);        // generated target click handler
  target.fire('click', button);                  // cleanup after toggleSound armed it
  assert.equal(sound.arms, 1, 'the next SOUND click enables exactly once');
  target.fire('pointerdown', null);
  assert.equal(sound.arms, 1, 'the global unlock listeners retired after enabling');
});

test('W489 unlock cleanup can retire every listener before a gesture', () => {
  const target = new FakeTarget();
  const sound = new FakeSound();
  const detach = armSoundOnFirstGesture(sound, target);
  detach();
  target.fire('pointerdown');
  target.fire('keydown');
  assert.equal(sound.arms, 0);
});

test('W489 boot captures loading-time gestures and cleans up a failed boot', async () => {
  const previousFetch = globalThis.fetch;
  const previousAudioContext = globalThis.AudioContext;
  let resolveFetch;
  let contexts = 0;
  try {
    globalThis.AudioContext = class {
      constructor() { contexts++; }
      resume() {}
    };
    globalThis.fetch = () => new Promise((resolve) => { resolveFetch = resolve; });

    const target = new FakeTarget();
    let sound = null;
    const pending = boot({}, {
      gameJson: 'game.json', target,
      onSoundController: (controller) => { sound = controller; },
    });
    assert.ok(sound, 'the controller is exposed synchronously before fetch settles');
    target.fire('keydown');
    assert.equal(sound.stats().status, 'loading');
    assert.equal(contexts, 1, 'a loading-screen input unlocks the context');
    resolveFetch({ ok: false, status: 503 });
    await assert.rejects(pending, /game\.json: HTTP 503/);

    globalThis.fetch = async () => ({ ok: false, status: 504 });
    const failedTarget = new FakeTarget();
    let failedSound = null;
    let disposed = 0;
    await assert.rejects(boot({}, {
      gameJson: 'game.json', target: failedTarget,
      onSoundController: (controller) => { failedSound = controller; },
      onSoundDispose: () => { disposed++; },
    }), /game\.json: HTTP 504/);
    assert.equal(disposed, 1, 'failed boot disposes page-owned sound controls once');
    assert.equal(failedSound.stats().status, 'locked');
    failedTarget.fire('pointerdown');
    assert.equal(failedSound.stats().status, 'locked',
      'a rejected boot leaves no controller listener behind');
  } finally {
    if (previousFetch === undefined) delete globalThis.fetch;
    else globalThis.fetch = previousFetch;
    if (previousAudioContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousAudioContext;
  }
});

test('W489 SOUND remains an explicit off/on toggle around the default-on policy', () => {
  const sound = new FakeSound();
  sound.arm();
  assert.equal(toggleSound(sound), false);
  assert.equal(sound.muted, true, 'first toggle explicitly mutes');
  assert.equal(toggleSound(sound), true);
  assert.equal(sound.muted, false, 'second toggle restores sound');

  const locked = new FakeSound();
  locked.setMuted(true);
  assert.equal(toggleSound(locked), true);
  assert.equal(locked.arms, 1, 'enabling a still-locked controller arms in the gesture');
});
