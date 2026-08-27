// W621: exact-production Black Label cabinet front end from zeroed RAM.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ram } from '../src/ram.js';
import { Game, MACHINE } from '../src/main.js';
import { ALLOC } from '../src/objalloc.js';
import {
  BOOT, COIN_DIP_RESET, OPERATOR_FACTORY, RESET_PROLOGUE, coinDipInit23C6FA,
} from '../src/frontend.js';
import {
  BgVram, CAM, TxVram, VideoRegs,
} from '../src/background.js';
import {
  ARM1SCREEN, ARM5SCREEN, FRONT_BG_PLANE, SCREEN8, frontBgPlane25BB6C,
} from '../src/objslot8.js';
import {
  FRONTTEXT, blinkOn25AD02, operatorSettings25C22A,
} from '../src/fronttext.js';
import { COIN } from '../src/isr.js';
import { SCREEN9 } from '../src/objslot9.js';
import { AssetError, loadBundle } from '../src/web/assets.js';
import { Demo } from '../src/web/app.js';
import {
  clearCoin, clearTouch, setCoinKey, setTouchButton,
} from '../src/web/input.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const ASSETS = path.join(ROOT, 'assets');
const TABLES = path.join(ROOT, 'rip/port/player.tables.json');
const IMAGE = path.join(ROOT, 'rip/sound/maincpu.bin');
const REQUIRED_FILES = [
  IMAGE, TABLES,
  path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'capture.bin.gz'),
  path.join(ASSETS, 'seed.bin.gz'),
];
const HAVE = REQUIRED_FILES.every(existsSync);
const SKIP = HAVE ? false : 'exact local Black Label production bundle absent; this is a skip, not a pass';
const IMG = HAVE ? readFileSync(IMAGE) : null;
const TABLE_JSON = HAVE ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;

const rawRom = () => ({
  u8: (a) => IMG[a],
  u16: (a) => IMG.readUInt16BE(a),
  u32: (a) => IMG.readUInt32BE(a),
  i16: (a) => IMG.readInt16BE(a),
  bytes: (a, n) => IMG.subarray(a, a + n),
});

function txColumn(tx, col) {
  let out = '';
  for (let row = 0; row < 32; row++) {
    const v = tx.long(0x904000 + (row * 64 + col) * 4);
    out += v === 0 ? '.' : String.fromCharCode((v >>> 16) & 0x3fff);
  }
  return out;
}

function romString(rom, at) {
  let out = '';
  for (let a = at; rom.u8(a) !== 0; a++) out += String.fromCharCode(rom.u8(a));
  return out;
}

let bundlePromise;
function exactBundle(opts) {
  if (opts) return loadBundle(readAsset, opts);
  bundlePromise ??= loadBundle(readAsset);
  return bundlePromise;
}

async function readAsset(name) {
  const file = path.join(ASSETS, name);
  if (!existsSync(file)) throw new AssetError(`${file} is missing`);
  return new Uint8Array(readFileSync(file));
}

function activeTypes(game) {
  const types = [];
  for (let i = 0; i < ALLOC.slots; i++) {
    const word = game.ram.u16(ALLOC.table + i * ALLOC.stride);
    if (word !== 0) types.push(word & 0xff);
  }
  return types;
}

function canvasHarness() {
  let image = null;
  let puts = 0;
  const ctx = {
    createImageData(w, h) {
      return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
    },
    putImageData(next) {
      image = next;
      puts++;
    },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  const oracle = () => {
    assert.ok(image, 'Demo.draw() must reach canvas putImageData');
    let colored = 0;
    let signature = 0x811c9dc5;
    for (let i = 0; i < image.data.length; i++) {
      const value = image.data[i];
      if ((i & 3) !== 3 && value !== 0) colored++;
      signature = Math.imul(signature ^ value, 0x01000193) >>> 0;
    }
    return { colored, signature, puts, width: image.width, height: image.height };
  };
  return { canvas, oracle };
}

function mark(demo, harness) {
  const before = harness.oracle().puts;
  demo.draw();
  const canvas = harness.oracle();
  assert.equal(canvas.puts, before + 1, 'each landmark must present one final canvas image');
  return {
    canvas,
    tx: demo.game.txvram.w.reduce((n, word) => n + Number(word !== 0), 0),
    records: demo.portList.records,
    drawn: demo.portList.drawn,
    skipped: demo.portList.skipped,
    palette: demo.paletteSourced,
  };
}

function advanceTo(demo, frame) {
  assert.ok(frame >= demo.game.logicFrame, 'cannot advance the cabinet backwards');
  while (demo.game.logicFrame < frame) demo.step();
}

async function waitForQueue(queue, label) {
  queue.prefetchAll();
  const deadline = Date.now() + 30_000;
  while (queue.status().ready !== queue.status().total) {
    const status = queue.status();
    assert.deepEqual(status.failed, [], `${label} deferred assets failed`);
    if (Date.now() >= deadline) assert.fail(`${label} deferred assets did not become ready`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
}

test('W621 $23BEEA preserves all 23 reset calls in cartridge order and counts seven gaps',
  { skip: SKIP }, () => {
    const fromImage = [];
    for (let at = BOOT.reset; at < BOOT.site; at += 6) {
      assert.equal(IMG.readUInt16BE(at), 0x4eb9, `$${at.toString(16)} is jsr abs.l`);
      fromImage.push(IMG.readUInt32BE(at + 2));
    }
    assert.deepEqual(fromImage, [...RESET_PROLOGUE]);
    assert.equal(RESET_PROLOGUE.length, 23);

    const game = new Game(new Uint8Array(MACHINE.ramSize), TABLE_JSON, { palCatchUp: false });
    const boot = game.boot();
    assert.deepEqual(boot.reset.calls.map((call) => call.site), fromImage);
    assert.equal(boot.reset.calls.length, 23);
    assert.equal(boot.reset.modeled, 16);
    assert.equal(boot.reset.unported, 7);

    const gaps = boot.reset.calls.filter((call) => !call.modeled).map((call) => call.site);
    const report = game.unportedLog.report().filter((line) => line.includes('reset call'));
    assert.equal(report.length, gaps.length, 'one explicit report row per unported reset call');
    for (const site of gaps) {
      const tag = `$${site.toString(16).toUpperCase()}`;
      assert.equal(report.filter((line) => line.includes(tag)).length, 1, `${tag} counted once`);
    }
    assert.equal(game.ram.u8(COIN_DIP_RESET.creditsPerCoin), IMG[0x23c6e6],
      '$23C6FA ran before the front-end entry');
  });

test('W621 $23C6FA reads both cartridge coinage tables and clears exact-width state',
  { skip: SKIP }, () => {
    const ram = new Ram(new Uint8Array(MACHINE.ramSize).fill(0xa5));
    const rom = rawRom();
    const dip = 9;
    ram.setU8(COIN_DIP_RESET.dip, dip);
    ram.setU8(0x803963, 0x6d);

    coinDipInit23C6FA(ram, rom);

    assert.equal(ram.u8(COIN_DIP_RESET.coinsPerCredit),
      rom.u8(COIN_DIP_RESET.coinsPerCreditTable + dip));
    assert.equal(ram.u8(COIN_DIP_RESET.creditsPerCoin),
      rom.u8(COIN_DIP_RESET.creditsPerCoinTable + dip));
    assert.equal(ram.u8(0x803959), 2);
    assert.equal(ram.u8(0x80395f), 2);
    assert.equal(ram.u8(0x803963), 0x6d, 'the byte between owned fields is untouched');
    for (let i = 0; i < COIN_DIP_RESET.debounceRecords * COIN_DIP_RESET.debounceStride; i++) {
      assert.equal(ram.u8(COIN_DIP_RESET.debounce + i), 0, `debounce byte ${i}`);
    }
  });

test('W621 $25BB6C resets BG ownership and copies the 14 by 7 cartridge plane',
  { skip: SKIP }, () => {
    const ram = new Ram(new Uint8Array(MACHINE.ramSize).fill(0x5a));
    const rom = rawRom();
    const bgVram = new BgVram(new Uint16Array(64 * 16 * 2).fill(0xdead));
    const videoRegs = new VideoRegs();
    videoRegs.bg_xscroll = 0x1234;
    videoRegs.bg_yscroll = 0x5678;
    videoRegs.tx_xscroll = 0x4321;

    frontBgPlane25BB6C(ram, rom, { bgVram, videoRegs });

    assert.equal(videoRegs.bg_xscroll, 0);
    assert.equal(videoRegs.bg_yscroll, 0);
    assert.equal(videoRegs.tx_xscroll, 0x4321, '$23C608 does not reset TX scroll');
    let source = FRONT_BG_PLANE.source;
    for (let col = 0; col < FRONT_BG_PLANE.columns; col++) {
      for (let row = 0; row < FRONT_BG_PLANE.rows; row++) {
        assert.equal(bgVram.long(row, col),
          (rom.u32(source) + FRONT_BG_PLANE.tileAdd) >>> 0,
          `cartridge BG cell ${row},${col}`);
        source += 4;
      }
    }
    assert.equal(source, FRONT_BG_PLANE.source + 14 * 7 * 4);
    assert.equal(bgVram.long(15, 63), 0, '$23C638 cleared the rest of the modeled ring');
    assert.equal(ram.u16(CAM.bgId), 0);
    assert.equal(ram.u16(CAM.txId), 1);
  });

test('W621 arm-1 operator text follows all three DIP-selected pointer tables',
  { skip: SKIP }, () => {
    const ram = new Ram();
    const rom = rawRom();
    const tx = new TxVram();
    const indices = [3, 2, 1];
    for (let i = 0; i < indices.length; i++) ram.setU8(FRONTTEXT.operatorDips[i], indices[i]);

    operatorSettings25C22A(ram, rom, tx);

    const pointers = FRONTTEXT.operatorTables.map((table, i) => rom.u32(table + indices[i] * 4));
    assert.equal(txColumn(tx, FRONTTEXT.operatorCols[0]).slice(0, 32),
      romString(rom, pointers[0]).padEnd(32, '.'));
    assert.equal(txColumn(tx, FRONTTEXT.operatorCols[1]).slice(0, 32),
      romString(rom, pointers[1]).padEnd(32, '.'));
    assert.equal(txColumn(tx, FRONTTEXT.operatorCols[1] - 1).slice(0, 32),
      romString(rom, pointers[1] + 0x20).padEnd(32, '.'));
    assert.equal(txColumn(tx, FRONTTEXT.operatorCols[2]).slice(0, 32),
      romString(rom, pointers[2]).padEnd(32, '.'));
  });

test('W621 $25AD02 dispatches shared and separate cartridge blink messages',
  { skip: SKIP }, () => {
    const rom = rawRom();
    const ram = new Ram();
    const shared = new TxVram();
    ram.setU8(FRONTTEXT.dip, 0);
    ram.setU8(FRONTTEXT.dipSlot2, 0);
    blinkOn25AD02(ram, rom, shared);
    assert.equal(txColumn(shared, FRONTTEXT.blinkCol0),
      '         INSERT COIN        ....');

    ram.setU8(FRONTTEXT.creditA, 1);
    blinkOn25AD02(ram, rom, shared);
    assert.equal(txColumn(shared, FRONTTEXT.blinkCol0),
      '    PRESS 1P OR 2P START    ....');

    const separate = new TxVram();
    ram.setU8(FRONTTEXT.creditA, 0);
    ram.setU8(FRONTTEXT.dipSlot2, FRONTTEXT.separate);
    blinkOn25AD02(ram, rom, separate);
    assert.equal(txColumn(separate, 0x000a), '  INSERT COIN   INSERT COIN ....');
    assert.equal(txColumn(separate, 0x0009), ' '.repeat(28) + '....');
  });

test('W621 required cabinet TX, exact arm-1 streams and complete sprite ranges fail closed',
  { skip: SKIP, timeout: 120_000 }, async () => {
    const exact = await exactBundle();
    const required = [0x3344f8, 0x334f60, 0x334494, 0x334efc, 0x000b20, 0x000b34, 0x000fbc];
    assert.deepEqual([...exact.requiredColdBootStreams], required);
    assert.deepEqual([...exact.manifest.spr.requiredColdBootStreams], required);
    for (const stream of required) {
      const row = exact.manifest.spr.streams.find(([rom]) => rom === stream);
      assert.ok(row, `$${stream.toString(16)} has a packed mapping`);
      assert.ok(exact.spr.boot.includes(exact.spr.shardOfBase(row[1])),
        `$${stream.toString(16)} is in a boot shard`);
      await assert.rejects(() => exactBundle({ dropRequiredSprite: stream }),
        new RegExp(`required cold-front-end sprite stream \\$${stream.toString(16).toUpperCase()}`));
    }

    const ranges = [
      [0x19485c, 0x1b8318, 193],
      [0x1c3c5c, 0x1c4410, 17],
      [0x3216c0, 0x322f44, 1],
      [0x3316f0, 0x334224, 151],
      [0x336164, 0x336990, 3],
    ];
    assert.deepEqual(exact.requiredCabinetRanges, ranges);
    assert.deepEqual(exact.manifest.spr.requiredCabinetRanges, ranges);
    for (const [base, endsAt, count] of ranges) {
      const rows = exact.manifest.spr.streams.filter(([rom]) => rom >= base && rom < endsAt);
      assert.equal(rows.length, count,
        `$${base.toString(16)}..$${endsAt.toString(16)} has its complete cartridge chain`);
      assert.ok(rows.every(([, packed]) =>
        exact.spr.boot.includes(exact.spr.shardOfBase(packed))));
      await assert.rejects(() => exactBundle({ dropRequiredSprite: base }),
        /required cabinet sprite range/);
    }

    assert.ok(exact.requiredColdBootTx.length > 0);
    assert.deepEqual([...exact.requiredColdBootTx],
      [...exact.manifest.gfx.tx.requiredColdBoot]);
    const requiredTx = new Set(exact.requiredColdBootTx);
    for (const tile of [0xc043, 0xc044, 0xc047, 0xc049, 0xc04b, 0xc04e, 0xc04f, 0xc059]) {
      assert.ok(requiredTx.has(tile), `$${tile.toString(16)} high-score/title glyph is required`);
    }
    for (let tile = 0xc62f; tile <= 0xca66; tile++) {
      assert.ok(requiredTx.has(tile), `$${tile.toString(16)} announcement/attract tile is required`);
    }
    for (const tile of [0xc043, 0xc917]) {
      await assert.rejects(() => exactBundle({ dropTxTile: tile }),
        /missing required cold-front-end tile/);
    }

    const requiredBg = Array.from({ length: 98 }, (_, i) => 0x36aa + i);
    assert.deepEqual([...exact.requiredColdBootBg], requiredBg);
    assert.deepEqual([...exact.manifest.gfx.bg.requiredColdBoot], requiredBg);
    await assert.rejects(() => exactBundle({ dropTile: requiredBg[0] }),
      /required cold-front-end BG tile \$36AA/);
  });

test('W621 one real production Demo visibly runs cold cabinet boot, attract, selection and play',
  { skip: SKIP, timeout: 180_000 }, async (t) => {
    const exact = await exactBundle();
    await Promise.all([
      waitForQueue(exact.bg, 'BG'),
      waitForQueue(exact.spr, 'sprite'),
    ]);

    clearCoin();
    clearTouch();
    t.after(() => { clearCoin(); clearTouch(); });
    const harness = canvasHarness();
    const demo = new Demo(harness.canvas, exact, MACHINE.refreshHz);

    assert.equal(demo.coldBoot, true);
    assert.equal(demo.seedLf, 0);
    assert.equal(demo.game.logicFrame, 0);
    assert.equal(demo.game.armedVblanks, 0,
      'the zero-RAM cold launch does not inject the seeded replay semaphore arm');
    assert.equal(demo.game.bootResult.reset.calls.length, 23);
    for (let i = 0; i < OPERATOR_FACTORY.bytes; i++) {
      assert.equal(demo.game.ram.u8(OPERATOR_FACTORY.target + i),
        IMG[OPERATOR_FACTORY.source + i], `factory operator byte ${i}`);
    }
    assert.equal(demo.game.ram.u8(0x803809), 1,
      'the cartridge factory policy enables the real continue countdown');
    assert.equal(demo.authentic, undefined, 'no host authentic-selection shortcut was applied');
    assert.equal(demo.rung, null, 'no ladder or LF2000 jump was used');
    assert.equal(harness.canvas.width, 224);
    assert.equal(harness.canvas.height, 448, 'the production TATE canvas owns the rotation');

    demo.draw();
    const boot = harness.oracle();
    assert.equal(boot.colored, 0, 'frame zero is the cartridge reset handoff, not a host overlay');

    advanceTo(demo, 20);
    const warning = mark(demo, harness);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 13);
    assert.equal(warning.tx, 784, 'deferred warning TX reached the real TxVram');
    assert.ok(warning.canvas.colored > 10_000);
    assert.ok(warning.palette > 0, 'Demo.draw resolved cartridge palette banks');

    advanceTo(demo, 305);
    const scores = mark(demo, harness);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 2);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);
    assert.ok(scores.tx >= 87, 'the credit prompt and high-score presentation reached TX');
    assert.ok(scores.records >= 90, 'the high-score screen built the real display list');
    assert.equal(scores.skipped, 0, 'prefetched cartridge art resolved every score-screen record');
    assert.ok(scores.canvas.colored > 500);

    setTouchButton('START', true);
    demo.step();
    setTouchButton('START', false);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 2,
      'START without a credit was refused by the cartridge gate');
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0);

    advanceTo(demo, 1190);
    const title = mark(demo, harness);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 1);
    assert.equal(title.records, 7, 'arm 1 emitted its exact four plain and three zoom records');
    assert.equal(title.drawn, 7);
    assert.equal(title.skipped, 0);
    assert.ok(title.tx >= 200, 'operator-setting and title TX are present');
    assert.notEqual(title.canvas.signature, scores.canvas.signature,
      'the title and high-score canvases are visibly distinct');

    advanceTo(demo, 1940);
    const attract = mark(demo, harness);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 5);
    assert.equal(demo.game.ram.u16(ARM5SCREEN.demoFlag), 1);
    assert.equal(demo.game.ram.u16(ARM5SCREEN.state), 1);
    assert.ok(activeTypes(demo.game).includes(2), 'attract gameplay owns a real player object');
    assert.ok(attract.records >= 10);
    assert.ok(attract.drawn >= 6);
    assert.ok(attract.canvas.colored > 100_000);
    assert.notEqual(attract.canvas.signature, title.canvas.signature);

    advanceTo(demo, 4340);
    const returned = mark(demo, harness);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 2);
    assert.equal(demo.game.ram.u16(ARM5SCREEN.demoFlag), 0);
    assert.deepEqual(activeTypes(demo.game), [8], 'attract gameplay retired back to the front end');
    assert.ok(returned.canvas.colored > 500);

    setCoinKey('COIN1', true);
    for (let i = 0; i < 30; i++) demo.step();
    setCoinKey('COIN1', false);
    const credited = mark(demo, harness);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 1,
      'the real browser coin pulse credited on cartridge debounce release');
    assert.equal(demo.game.ram.u16(SCREEN8.state), 3);
    assert.ok(credited.tx > returned.tx, 'credit input visibly changed the cartridge TX state');
    assert.notEqual(credited.canvas.signature, returned.canvas.signature);

    setTouchButton('START', true);
    for (let i = 0; i < 12; i++) demo.step();
    setTouchButton('START', false);
    const selection = mark(demo, harness);
    assert.equal(demo.game.ram.u16(SCREEN8.state), 14);
    assert.equal(demo.game.ram.u8(COIN.creditA + 2), 0, 'START spent exactly one credit');
    assert.ok(activeTypes(demo.game).includes(9), 'the credited path created the cartridge selector');
    assert.ok(selection.records >= 20);
    assert.equal(selection.skipped, 0);
    assert.ok(selection.canvas.colored > 10_000, 'fighter selection is visible on the final canvas');

    const selectFrame = demo.game.logicFrame;
    advanceTo(demo, selectFrame + 2500);
    const gameplay = mark(demo, harness);
    const types = activeTypes(demo.game);
    assert.ok(types.includes(2), 'selection handed off to a real P1 gameplay object');
    assert.ok(types.includes(11), 'selection handed off to the stage object topology');
    assert.equal(types.includes(9), false, 'the fighter selector retired without a reload');
    assert.ok(demo.game.vram.columnsWritten > 0, 'gameplay advanced the cartridge BG writer');
    assert.ok(gameplay.records >= 30);
    assert.equal(gameplay.skipped, 0);
    assert.ok(gameplay.canvas.colored > 100_000);
    assert.notEqual(gameplay.canvas.signature, selection.canvas.signature,
      'selection and gameplay are visibly distinct final canvas frames');
    assert.deepEqual([...exact.missingTxTiles], [],
      'every TX tile used by all nine cabinet landmarks was cartridge-derived and shipped');
    assert.deepEqual([...exact.missingBgTiles], [],
      'every BG tile used by all nine cabinet landmarks was cartridge-derived and shipped');

    assert.equal(harness.oracle().puts, 9,
      'all nine landmarks traversed Demo.draw and final putImageData in one unreloaded Demo');
  });
