#!/usr/bin/env node
// Exact six-pair progression probe with local, probe-only checkpoints.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { applyAuthenticSelection, AUTHENTIC_SHIPS, AUTHENTIC_STYLES } from '../src/authentic.js';
import { portWordFromBits } from '../src/input.js';
import { RAM, P } from '../src/machine.js';
import { Game } from '../src/main.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { CONTROLS } from '../src/web/input.js';
import {
  checkpointFileName,
  readCheckpoint,
  writeCheckpoint,
} from './progression-checkpoint.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ASSETS = path.resolve(HERE, '../assets');
const DEFAULT_CHECKPOINTS = path.resolve(HERE, '../probes/checkpoints');
const CLOSURE = path.resolve(HERE, 'round2closure.py');
const MENU = Object.freeze({ work: 0x81e0dc, innerAt: 0x08, substateAt: 0x06,
  selection: 0x81e112 });
const RAW = Object.freeze({ stage: 0x813092, loop: 0x813098 });

const word = (...names) => portWordFromBits(names.map((name) => CONTROLS[name]));
const RELEASE = word();
const DOWN_SHOT = word('DOWN', 'SHOT');
const LEFT = word('LEFT');
const SHOT = word('SHOT');

function usage() {
  return `Usage: node games/ddpdoj/tools/progression-probe.mjs [options]

Runs the exact local bundle. A single pair defaults to ship 0/style 2; --all
runs ship {0,2} x style {2,4,6} serially.

Options:
  --all                    run all six authentic pairs serially
  --ship N                 ship 0 or 2 (default 0)
  --style N                style 2, 4, or 6 (default 2)
  --frames N               step N frames from the loaded frontier (default 1000)
  --assets DIR             exact local web bundle (default games/ddpdoj/assets)
  --checkpoint-dir DIR     local artifact directory
  --checkpoint-every N     write after each N stepped frames (default 500; 0 means final only)
  --resume FILE            restore this exact checkpoint; valid for one pair only
  --fresh                  ignore automatic pair checkpoints and start at bundle lf2000
  --closure-only           run the all-five-stage static closure check, then stop
  --skip-closure           explicitly bypass the default static preflight
  --help                    show this help

Resume behavior:
  Unless --fresh or --resume is given, each pair loads its highest-lf checkpoint
  from --checkpoint-dir. Periodic and final checkpoint JSON files contain RAM,
  exact non-RAM Game state, pair, seed hash, last input word, raw stage/loop, and
  explicit probe-only invulnerability. They are local probe artifacts and the
  default directory is gitignored. Loading never changes ordinary Game or browser
  construction. Checkpoints restore into the current code so a bounded handler fix
  can resume at its frontier; a serialized Game-state shape change requires --fresh.
  A failed step is never checkpointed.

Round-2 input:
  The probe sends release through the real menu intro, toggles the default decline
  choice with a fresh LEFT edge, sends release again, then confirms with a fresh
  SHOT edge. It does not poke the choice word. P1 invulnerability is written only
  by this probe before each step; ordinary browser games remain mortal.`;
}

function parseArgs(argv) {
  const out = { all: false, ship: 0, style: 2, frames: 1000,
    assets: DEFAULT_ASSETS, checkpointDir: DEFAULT_CHECKPOINTS,
    checkpointEvery: 500, resume: null, fresh: false,
    closureOnly: false, skipClosure: false, help: false };
  const take = (i, name) => {
    if (i + 1 >= argv.length) throw new Error(`${name} needs a value`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--all': out.all = true; break;
      case '--ship': out.ship = Number(take(i, argv[i])); i++; break;
      case '--style': out.style = Number(take(i, argv[i])); i++; break;
      case '--frames': out.frames = Number(take(i, argv[i])); i++; break;
      case '--assets': out.assets = path.resolve(take(i, argv[i])); i++; break;
      case '--checkpoint-dir': out.checkpointDir = path.resolve(take(i, argv[i])); i++; break;
      case '--checkpoint-every': out.checkpointEvery = Number(take(i, argv[i])); i++; break;
      case '--resume': out.resume = path.resolve(take(i, argv[i])); i++; break;
      case '--fresh': out.fresh = true; break;
      case '--closure-only': out.closureOnly = true; break;
      case '--skip-closure': out.skipClosure = true; break;
      case '--help': case '-h': out.help = true; break;
      default: throw new Error(`unknown argument ${argv[i]}`);
    }
  }
  if (!AUTHENTIC_SHIPS.includes(out.ship)) throw new Error('--ship must be 0 or 2');
  if (!AUTHENTIC_STYLES.includes(out.style)) throw new Error('--style must be 2, 4, or 6');
  for (const [name, value] of [['--frames', out.frames],
    ['--checkpoint-every', out.checkpointEvery]]) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a nonnegative integer`);
  }
  if (out.resume && (out.all || out.fresh)) {
    throw new Error('--resume cannot be combined with --all or --fresh');
  }
  return out;
}

function runClosure() {
  const result = spawnSync(process.env.PYTHON || 'python', [CLOSURE], {
    cwd: path.resolve(HERE, '../../..'), stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 2;
}

async function exactBundle(assetDir) {
  const read = async (name) => {
    const file = path.join(assetDir, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  };
  return loadBundle(read);
}

function latestCheckpoint(dir, ship, style) {
  if (!existsSync(dir)) return null;
  const prefix = `ship${ship}-style${style}-lf`;
  const matches = readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && /^ship\d+-style\d+-lf\d{8,}\.json$/.test(name))
    .sort();
  return matches.length ? path.join(dir, matches[matches.length - 1]) : null;
}

function round2Input(game, previous) {
  const ram = game.ram;
  if (ram.u16(MENU.work + MENU.innerAt) !== 4) return DOWN_SHOT;
  const state = ram.u16(MENU.work + MENU.substateAt);
  if (state < 2) return RELEASE;
  if (state === 2 && ram.u16(MENU.selection) === 1) return LEFT;
  if (state === 2 && previous === LEFT) return RELEASE;
  if (state === 2 && previous === RELEASE) return SHOT;
  if (state === 2) return RELEASE;
  return DOWN_SHOT;
}

function rawPosition(game) {
  return { stage: game.ram.u16(RAW.stage), loop: game.ram.u16(RAW.loop) };
}

async function startPair(bundle, options, pair) {
  const automatic = options.fresh ? null
    : latestCheckpoint(options.checkpointDir, pair.ship, pair.style);
  const resumeFile = options.resume ?? automatic;
  if (resumeFile) {
    const restored = await readCheckpoint(resumeFile, bundle, pair);
    if (restored.probe.invulnerable !== true) {
      throw new Error(`${resumeFile} is not an invulnerable progression-probe checkpoint`);
    }
    return { game: restored.game, inputWord: restored.probe.inputWord,
      source: resumeFile };
  }
  const game = new Game(bundle.seed, bundle.tables, {
    logicFrame: bundle.cap.frames[0].lf,
    videoFrame: bundle.cap.frames[0].vf,
    bgSeed: bundle.cap.part(0, 'bg'),
  });
  applyAuthenticSelection(game, pair);
  return { game, inputWord: DOWN_SHOT, source: 'exact bundle seed' };
}

async function runPair(bundle, options, pair) {
  const started = await startPair(bundle, options, pair);
  const { game } = started;
  let inputWord = started.inputWord;
  let last = rawPosition(game);
  console.log(`PAIR ship=${pair.ship} style=${pair.style} resume=${started.source}`);
  console.log(`  start lf=${game.logicFrame} stageRaw=${last.stage} loopRaw=${last.loop} invulnerable=probe-only`);

  for (let stepped = 1; stepped <= options.frames; stepped++) {
    game.ram.setU8(RAM.player1 + P.invuln, 0xff);
    inputWord = round2Input(game, inputWord);
    game.step(inputWord);
    const now = rawPosition(game);
    if (now.stage !== last.stage || now.loop !== last.loop) {
      console.log(`  frontier lf=${game.logicFrame} stageRaw=${now.stage} loopRaw=${now.loop}`);
      last = now;
    }
    if (options.checkpointEvery && stepped % options.checkpointEvery === 0) {
      const file = path.join(options.checkpointDir,
        checkpointFileName(pair.ship, pair.style, game.logicFrame));
      await writeCheckpoint(file, game, bundle, {
        ...pair, inputWord, invulnerable: true,
      });
      console.log(`  checkpoint ${file}`);
    }
  }

  const finalFile = path.join(options.checkpointDir,
    checkpointFileName(pair.ship, pair.style, game.logicFrame));
  await writeCheckpoint(finalFile, game, bundle, {
    ...pair, inputWord, invulnerable: true,
  });
  const final = rawPosition(game);
  console.log(`  final lf=${game.logicFrame} stageRaw=${final.stage} loopRaw=${final.loop}`);
  console.log(`  checkpoint ${finalFile}`);
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`ERROR ${error.message}\n\n${usage()}`);
    return 2;
  }
  if (options.help) {
    console.log(usage());
    return 0;
  }
  if (!options.skipClosure) {
    const status = runClosure();
    if (status !== 0 || options.closureOnly) return status;
  } else if (options.closureOnly) {
    console.error('--closure-only cannot be combined with --skip-closure');
    return 2;
  }

  let bundle;
  try {
    bundle = await exactBundle(options.assets);
  } catch (error) {
    console.error(`ASSETS ${error.name}: ${String(error.message).split('\n')[0]}`);
    console.error('Build local ROM-derived assets with: node games/ddpdoj/tools/export-web.mjs');
    return 2;
  }
  const pairs = options.all
    ? AUTHENTIC_SHIPS.flatMap((ship) => AUTHENTIC_STYLES.map((style) => ({ ship, style })))
    : [{ ship: options.ship, style: options.style }];
  for (const pair of pairs) await runPair(bundle, options, pair);
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await main();
}
