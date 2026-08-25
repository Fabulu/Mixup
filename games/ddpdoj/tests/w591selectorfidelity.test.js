// W591: integrated authentic fighter/style selector plumbing.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTHENTIC_SHIPS, AUTHENTIC_STYLES, applyAuthenticSelection,
  authenticSelectionIndices,
} from '../src/authentic.js';
import { BOMBRAM, fireBomb2498E2 } from '../src/bomb.js';
import { RAM_STRIDE } from '../src/render/index.js';
import { RAM, P, OPT } from '../src/machine.js';
import { Game } from '../src/main.js';
import {
  FADE_OFFSET_BYTES, PALSTAGE, mergePalette,
} from '../src/palette.js';
import { DEATH, playerDead24A130 } from '../src/player.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo, PORT_LIST_WORDS, portSpriteList } from '../src/web/app.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, '../assets');
const HAVE = existsSync(path.join(ASSETS, 'seed.bin.gz'))
  && existsSync(path.join(ASSETS, 'player.tables.json.gz'))
  && existsSync(path.join(ASSETS, 'capture.bin.gz'));
const SKIP = HAVE ? false : 'exact local selector bundle absent; this is a skip, not a pass';
const PAIRS = AUTHENTIC_SHIPS.flatMap((ship) =>
  AUTHENTIC_STYLES.map((style) => Object.freeze({ ship, style })));
const STYLE_VALUE = new Map([[2, 3], [4, 2], [6, 1]]);
const POD_ART = new Map([
  [2, { offset: 0x3b08, count: 2 }],
  [4, { offset: 0x41bc, count: 1 }],
  [6, { offset: 0x4648, count: 2 }],
]);

let bundlePromise;
function bundle() {
  bundlePromise ??= loadBundle(async (name) => {
    const file = path.join(ASSETS, name);
    if (!existsSync(file)) throw new AssetError(`${file} is missing`);
    return new Uint8Array(readFileSync(file));
  });
  return bundlePromise;
}

function fresh(exact, pair) {
  const game = new Game(exact.seed, exact.tables, {
    logicFrame: exact.cap.frames[0].lf,
    videoFrame: exact.cap.frames[0].vf,
    bgSeed: exact.cap.part(0, 'bg'),
  });
  applyAuthenticSelection(game, pair);
  return game;
}

function bytes(ram, start, length) {
  return Uint8Array.from({ length }, (_, i) => ram.u8(start + i));
}

function rawListWords(ram) {
  return Uint16Array.from({ length: PORT_LIST_WORDS },
    (_, i) => ram.u16(RAM.spriteList + i * 2));
}

function rawOffsets(words) {
  const offsets = [];
  for (let r = 0; r < 256; r++) {
    const b = r * RAM_STRIDE;
    const w4 = words[b + 4];
    if ((w4 & 0x7fff) === 0) break;
    offsets.push(((words[b + 2] & 0x007f) << 16) | words[b + 3]);
  }
  return offsets;
}

function fakeCanvas() {
  const ctx = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    putImageData() {},
  };
  return { getContext: () => ctx };
}

function assertRomWords(actual, at, rom, source, count, label) {
  for (let i = 0; i < count; i++) {
    assert.equal(actual[at + i], rom.u16(source + i * 2), `${label} word ${i}`);
  }
}

function forceDeathReset(game) {
  const { ram, rom } = game;
  const slot = 0x810000;
  ram.bset8(RAM.player1, 2);
  ram.setU16(RAM.player1 + 0x26, 0);
  ram.setU16(DEATH.p1.activeSave, 0);
  ram.setU8(slot + 0x07, 3);
  ram.setU32(slot + 0x48, 0x12345678);
  return playerDead24A130(ram, slot, RAM.player1, { rom });
}

test('W591 all six pairs coherently patch immediate P1 state and palette only',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    for (const pair of PAIRS) {
      const game = new Game(exact.seed, exact.tables, {
        logicFrame: exact.cap.frames[0].lf,
        videoFrame: exact.cap.frames[0].vf,
        bgSeed: exact.cap.part(0, 'bg'),
      });
      const { ram, rom, palette } = game;
      const row = authenticSelectionIndices(pair.ship, pair.style);
      const p2Before = bytes(ram, RAM.player2, P.stride);
      const p2OptionsBefore = bytes(ram, RAM.p2Options, OPT.stride);
      const fadeBefore = [
        ram.u16(0x80fa6c), ram.u16(0x80fa6e),
        ram.u8(0x80fa70), ram.u8(0x80fa71),
      ];
      const fadeWordsBefore = palette.words.slice(
        PALSTAGE.bg.dst + FADE_OFFSET_BYTES / 2,
        PALSTAGE.bg.dst + FADE_OFFSET_BYTES / 2 + 4);
      const flushesBefore = palette.flushes;
      const bgCopiesBefore = palette.copies.bg;
      const bgDirtyBefore = ram.u16(PALSTAGE.bg.dirty);

      applyAuthenticSelection(game, pair);

      assert.equal(ram.u16(0x813084), pair.ship, `${pair.ship}/${pair.style} ship mailbox`);
      assert.equal(ram.u16(0x813088), pair.style, `${pair.ship}/${pair.style} style mailbox`);
      assert.equal(ram.u8(0x813008), pair.ship / 2, `${pair.ship}/${pair.style} saved ship`);
      assert.equal(ram.u8(0x813009), (pair.style - 2) / 2,
        `${pair.ship}/${pair.style} saved style`);
      assert.equal(ram.u16(RAM.player1 + P.shipSel), pair.ship);
      assert.equal(ram.u16(RAM.player1 + P.optFormation), pair.style);
      assert.equal(ram.u8(RAM.player1 + 0x24), STYLE_VALUE.get(pair.style),
        `${pair.ship}/${pair.style} bomb stock`);
      assert.equal(ram.u8(RAM.player1 + 0x25), STYLE_VALUE.get(pair.style),
        `${pair.ship}/${pair.style} respawn seed`);
      const bodyImage = pair.ship === 0 && pair.style === 2
        ? 0x1520
        : rom.u32(row.initial);
      assert.equal(ram.u32(RAM.player1 + P.animA), bodyImage,
        `${pair.ship}/${pair.style} body image`);
      assert.equal(ram.u32(RAM.player1 + P.hitYPlus), rom.u32(row.initial + 4),
        `${pair.ship}/${pair.style} hitbox`);
      assert.equal(ram.u32(0x8127e4), rom.u32(0x25520c + row.powerOffset),
        `${pair.ship}/${pair.style} power cursor A`);
      assert.equal(ram.u32(0x8127e8), rom.u32(0x255210 + row.powerOffset),
        `${pair.ship}/${pair.style} power cursor B`);
      assert.equal(ram.u8(RAM.player1 + P.speedIdx), rom.u8(0x255200 + row.speedIndex),
        `${pair.ship}/${pair.style} speed`);
      assert.equal(ram.u8(RAM.player1 + P.baseSpeed), rom.u8(0x255200 + row.speedIndex),
        `${pair.ship}/${pair.style} base speed`);
      assert.equal(ram.u8(RAM.player1 + P.laserFloor), rom.u8(0x255201 + row.speedIndex),
        `${pair.ship}/${pair.style} laser floor`);
      assert.equal(ram.u16(RAM.player1 + 0x2c), rom.u16(0x2552c4 + row.rampIndex),
        `${pair.ship}/${pair.style} cadence A`);
      assert.equal(ram.u16(RAM.player1 + 0x36), rom.u16(0x2552c6 + row.rampIndex),
        `${pair.ship}/${pair.style} cadence B`);

      if (pair.ship !== 0 || pair.style !== 2) {
        assert.equal(ram.u16(RAM.p1Options + OPT.state), 0x8003,
          `${pair.ship}/${pair.style} warmed P1 option state`);
        assert.ok(bytes(ram, RAM.p1Options + 2, OPT.stride - 2).some(Boolean),
          `${pair.ship}/${pair.style} missing pre-seed option history`);
      }
      assert.deepEqual(bytes(ram, RAM.player2, P.stride), p2Before,
        `${pair.ship}/${pair.style} P2 player record changed`);
      assert.deepEqual(bytes(ram, RAM.p2Options, OPT.stride), p2OptionsBefore,
        `${pair.ship}/${pair.style} P2 option record changed`);

      const paletteWords = mergePalette(palette, exact.cap.part(1, 'palette'));
      const arm = pair.ship === 0
        ? { spr: [0x222878, 0x222978, 0x2229f8], tx: 0x2226f8 }
        : { spr: [0x2228b8, 0x2229b8, 0x222a38], tx: 0x222738 };
      for (const [i, bank] of [0, 2, 4].entries()) {
        assertRomWords(paletteWords, bank * 32, rom, arm.spr[i], 32,
          `${pair.ship}/${pair.style} sprite palette bank ${bank}`);
      }
      const styleRow = 0x25f868 + (pair.style - 2) * 4;
      assertRomWords(paletteWords, 23 * 32, rom, rom.u32(styleRow + 4), 32,
        `${pair.ship}/${pair.style} sprite palette bank 23`);
      assertRomWords(paletteWords, PALSTAGE.tx.dst + 9 * 16, rom, arm.tx, 16,
        `${pair.ship}/${pair.style} text palette bank 9`);

      assert.deepEqual([
        ram.u16(0x80fa6c), ram.u16(0x80fa6e),
        ram.u8(0x80fa70), ram.u8(0x80fa71),
      ], fadeBefore, `${pair.ship}/${pair.style} advanced the background fade`);
      assert.deepEqual(palette.words.slice(
        PALSTAGE.bg.dst + FADE_OFFSET_BYTES / 2,
        PALSTAGE.bg.dst + FADE_OFFSET_BYTES / 2 + 4), fadeWordsBefore,
      `${pair.ship}/${pair.style} rewrote background fade colors`);
      assert.equal(palette.flushes, flushesBefore,
        `${pair.ship}/${pair.style} entered the complete palette flush`);
      assert.equal(palette.copies.bg, bgCopiesBefore,
        `${pair.ship}/${pair.style} copied the background palette`);
      assert.equal(ram.u16(PALSTAGE.bg.dirty), bgDirtyBefore,
        `${pair.ship}/${pair.style} changed background dirty state`);
      assert.equal(ram.u16(PALSTAGE.spr.dirty), 0);
      assert.equal(ram.u16(PALSTAGE.tx.dirty), 0);
    }
  });

test('W591 first production list is selected for all pairs and then returns to lag one',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    const bodyFamilies = new Set();
    const freshPodFamilies = new Map();

    for (const pair of PAIRS) {
      const selected = pair.ship !== 0 || pair.style !== 2;
      const demo = new Demo(fakeCanvas(), exact, 60, 'tate', null, null, null, pair);
      demo.listOpts.shardReady = () => true;
      demo.listOpts.demand = undefined;
      const seedRaw = rawListWords(demo.game.ram);

      if (selected) {
        assert.equal(demo.authenticLaunchPending, true);
        assert.equal(demo.portList.records, 0);
        assert.ok(demo.portList.words.every((word) => word === 0),
          `${pair.ship}/${pair.style} exposed the captured seed list before step 1`);
        assert.equal(demo.setSpriteSource('capture'), 'capture',
          'capture remains the explicitly selected diagnostic source');
        assert.equal(demo.authenticLaunchPending, true,
          'selecting the capture diagnostic must not consume the port launch seam');
        demo.setSpriteSource('port');
      } else {
        assert.equal(demo.authenticLaunchPending, false);
        assert.ok(demo.portList.records > 0, 'the exact default keeps its authentic seed list');
      }

      const beforeLogic = demo.game.logicFrame;
      demo.step();
      assert.equal(demo.game.logicFrame, beforeLogic + 1,
        `${pair.ship}/${pair.style} launch seam ran an extra simulation step`);
      assert.equal(demo.authenticLaunchPending, false);

      const firstBuiltRaw = rawListWords(demo.game.ram);
      const firstBuiltPacked = portSpriteList(demo.game.ram, demo.romToPacked, {
        out: new Uint16Array(PORT_LIST_WORDS), shardReady: () => true,
      }).words.slice();
      const visibleRaw = selected ? firstBuiltRaw : seedRaw;
      const offsets = rawOffsets(visibleRaw);
      const body = pair.ship === 0 ? 0x1520 : 0x1bc4;
      bodyFamilies.add(body);
      assert.ok(offsets.includes(body), `${pair.ship}/${pair.style} missing selected body $${body.toString(16)}`);
      if (pair.ship === 2) {
        assert.ok(!offsets.includes(0x1520), `${pair.ship}/${pair.style} flashed fighter 0 body`);
      }

      if (selected) {
        const pod = POD_ART.get(pair.style);
        freshPodFamilies.set(pair.style, pod.offset);
        assert.equal(offsets.filter((offset) => offset === pod.offset).length, pod.count,
          `${pair.ship}/${pair.style} did not draw the measured selected pods`);
        assert.ok(offsets.includes(pair.ship === 0 ? 0x650bc : 0x65210),
          `${pair.ship}/${pair.style} missing selected fighter attached art`);
        assert.ok(!offsets.includes(0x22cc),
          `${pair.ship}/${pair.style} flashed the captured fighter-0 glow`);
      } else {
        assert.equal(offsets.filter((offset) => offset === 0x3b08).length, 2,
          'the exact default retains the recorded style-2 pod frame');
        assert.ok(offsets.includes(0x22cc), 'the exact default retains its recorded glow frame');
      }
      if (pair.style === 4 || pair.style === 6) {
        assert.ok(!offsets.includes(0x3b08),
          `${pair.ship}/${pair.style} flashed the captured style-2 pod art`);
      }

      if (selected) assert.deepEqual(demo.portList.words, firstBuiltPacked,
        `${pair.ship}/${pair.style} first visible port list was not the list step 1 built`);

      demo.step();
      assert.deepEqual(demo.portList.words, firstBuiltPacked,
        `${pair.ship}/${pair.style} did not resume one-frame-old buffering`);
      assert.notDeepEqual(rawListWords(demo.game.ram), firstBuiltRaw,
        `${pair.ship}/${pair.style} buffering assertion did not cross a changing frame`);
    }

    assert.deepEqual([...bodyFamilies], [0x1520, 0x1bc4],
      'the selector has exactly two body families');
    assert.deepEqual([...freshPodFamilies.entries()].sort((a, b) => a[0] - b[0]),
      [[2, 0x3b08], [4, 0x41bc], [6, 0x4648]],
      'warmed option history has exactly three style families');
  });

test('W591 style values drive ordinary bomb stock and capped death respawns',
  { skip: SKIP }, async () => {
    const exact = await bundle();
    for (const pair of PAIRS) {
      const bombGame = fresh(exact, pair);
      const value = STYLE_VALUE.get(pair.style);
      bombGame.ram.setU16(BOMBRAM.flashP1, 0);
      bombGame.ram.setU16(BOMBRAM.rec, 0);
      bombGame.ram.setU16(BOMBRAM.hyperActiveP1, 0);
      assert.equal(fireBomb2498E2(bombGame.ram, {
        rom: bombGame.rom,
        palette: bombGame.palette,
        unportedLog: bombGame.unportedLog,
      }, RAM.player1, 0),
        'fired', `${pair.ship}/${pair.style} ordinary bomb did not fire`);
      assert.equal(bombGame.ram.u8(RAM.player1 + BOMBRAM.stockOffset), value - 1,
        `${pair.ship}/${pair.style} ordinary bomb consumed the wrong stock`);

      const deathGame = fresh(exact, pair);
      const cap = deathGame.rom.u8(DEATH.formationCaps + pair.style - 2) * 2;
      assert.equal(cap, value * 2, `${pair.ship}/${pair.style} formation cap source`);
      assert.equal(forceDeathReset(deathGame), 'reset');
      assert.equal(deathGame.ram.u8(RAM.player1 + 0x25), value + 1,
        `${pair.ship}/${pair.style} first death did not advance toward its cap`);
      deathGame.ram.setU8(RAM.player1 + 0x25, cap);
      assert.equal(forceDeathReset(deathGame), 'reset');
      assert.equal(deathGame.ram.u8(RAM.player1 + 0x25), cap,
        `${pair.ship}/${pair.style} death exceeded its style cap`);
    }
  });
