#!/usr/bin/env node
// WAVE 79 -- THE PLAYABILITY GATE.  Load the page's own bundle, hold a button,
// and FAIL ON ANY NAMED THROW.
//
//   node games/ddpdoj/tools/playgate.mjs [--assets DIR] [--frames N]
//        [--hold NAME[,NAME...]] [--all] [--break NAME]
//
// **WHY THIS EXISTS, and it is the owner's own complaint twice over.**
// `39-OWNER-visible-play-before-sound.md`:
//
//   > Every gate we have proves the port matches the board in a HEADLESS
//   > harness. **Nothing checks that the browser page is playable.** ...
//   > A playability check belongs in the gate: load the page headless, run
//   > frames, press fire, fail on any throw. Until that exists, "all gates
//   > green" says nothing about whether the game works.
//
// It was written after the owner loaded the live site, pressed fire and got the
// `$24C180` laser throw; the same thing happened again with `$2497AA` and the
// auto-shot button, and `78-diag-oracle-blindness.md` measured what it was
// costing the whole-stage oracle at the same time.  Both times the throw was
// found BY THE OWNER, on the deployed page, with every gate green.
//
// WHAT IT IS AND IS NOT.  This is NOT an oracle: it compares nothing against
// the board and a green here says only "no unported path was reached".  That is
// a much weaker claim than `seedcmp.mjs`'s, and it is deliberately the claim
// nothing else in this tree makes.  A port can be perfectly faithful on every
// compared column and still be unplayable, because the columns are compared on
// a corpus that never pressed the button.
//
// THE SEED IS THE PAGE'S SEED.  It loads `assets/` through `web/assets.js`'s
// own `loadBundle` -- the same module the browser runs, over the filesystem
// instead of HTTP, the same device `bundlegate.mjs` uses -- so "the page would
// throw" and "this tool throws" are the same statement rather than two
// harnesses that might disagree.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadBundle, AssetError } from '../src/web/assets.js';
import { Game } from '../src/main.js';
import { portWordFromBits } from '../src/input.js';
import { CONTROLS } from '../src/web/input.js';
import { Unreached } from '../src/unported.js';
import { breakage } from './breakage.mjs';

const DEFAULT_ASSETS = fileURLToPath(new URL('../assets', import.meta.url));

/** The button combinations a person actually holds, by the page's own control
 *  names.  `AUTO` is Button 3 -- the auto-shot, and the one the owner pressed
 *  when they got the `$2497AA` throw. */
const HOLDS = {
  none: [],
  auto: ['AUTO'],
  shot: ['SHOT'],
  'auto+left': ['AUTO', 'LEFT'],
  'auto+right': ['AUTO', 'RIGHT'],
  'auto+down': ['AUTO', 'DOWN'],
};

function args(argv) {
  const a = { assets: DEFAULT_ASSETS, frames: 600, hold: null, all: false,
    break: null };
  for (let i = 0; i < argv.length; i++) {
    const v = () => argv[++i];
    switch (argv[i]) {
      case '--assets': a.assets = v(); break;
      case '--frames': a.frames = +v(); break;
      case '--hold': a.hold = v(); break;
      case '--all': a.all = true; break;
      case '--break': a.break = v(); break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  return a;
}

/** Run `frames` logic frames with `controls` held for every one of them.
 *  Returns the throw, or null.  The controls are held from frame 1, not tapped:
 *  `$2497B2` and `$24C164` are both HELD-bit gates and fire on the first held
 *  frame, so a tap short enough to avoid them does not exist. */
export function hold(bundle, controls, frames, breakName = null) {
  const game = new Game(bundle.seed, bundle.tables, {
    profile: bundle.profile,
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  if (breakName) breakage(breakName, game);
  const word = portWordFromBits(controls.map((c) => CONTROLS[c]));
  for (let f = 0; f < frames; f++) {
    try {
      game.step(word);
    } catch (e) {
      if (e instanceof Unreached) {
        return { frame: f, lf: game.logicFrame, addr: e.romAddress,
          message: e.message };
      }
      throw e;
    }
  }
  return null;
}

async function main() {
  const a = args(process.argv.slice(2));
  const read = async (name) => {
    const p = path.join(a.assets, name);
    if (!fs.existsSync(p)) throw new AssetError(`assets/${name} is missing`);
    return new Uint8Array(fs.readFileSync(p));
  };
  let bundle;
  try {
    bundle = await loadBundle(read);
  } catch (e) {
    console.log(`ASSETS  ${e.name}: ${String(e.message).split('\n')[0]}`);
    console.log('The bundle is ROM-derived and gitignored. Build it with '
      + '`node games/ddpdoj/tools/export-web.mjs` from your own cartridge.');
    return 2;
  }
  const names = a.all ? Object.keys(HOLDS)
    : (a.hold ? a.hold.split(',') : ['none', 'auto', 'shot']);
  console.log(`PLAYGATE  assets=${a.assets}  ${a.frames} logic frames per hold`);
  console.log('          seeded at the page\'s own seed; NOT an oracle -- '
    + 'a green here means "no unported path was reached", nothing more');
  let bad = 0;
  for (const n of names) {
    const controls = HOLDS[n];
    if (!controls) throw new Error(`unknown hold "${n}"; have: `
      + Object.keys(HOLDS).join(', '));
    const t = hold(bundle, controls, a.frames, a.break);
    if (t) {
      bad++;
      console.log(`  [THROW] hold=${n.padEnd(11)} lf${t.lf} (frame ${t.frame}) `
        + `$${t.addr.toString(16).toUpperCase()}`);
      console.log(`          ${String(t.message).split('. ')[0]}`);
    } else {
      console.log(`  [OK   ] hold=${n.padEnd(11)} ${a.frames} frames, no throw`);
    }
  }
  console.log(bad
    ? `VERDICT: NOT PLAYABLE -- ${bad} of ${names.length} holds throw`
    : `VERDICT: PLAYABLE -- ${names.length} holds, ${a.frames} frames each, `
      + 'no unported path reached');
  return bad ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`
  || fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().then((c) => process.exit(c));
}
