// W188: the owner's boss-start hyper crash and missing activation aura.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const LADDER = path.join(ROOT, 'tools/oracle/out/w69/stage1-sweep');
const TABLES = path.join(ROOT, 'rip/port/player.tables.json');
const MANIFEST = path.join(LADDER, 'manifest.json');
const ASSETS = path.join(ROOT, 'assets');

function seededGame() {
  const man = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const rung = man.rungs.find(r => r.lf === 8000);
  assert.ok(rung, 'stage1-sweep must contain lf8000');
  const seed = new Uint8Array(fs.readFileSync(path.join(LADDER, 'ckpt', rung.ram)));
  const bytes = new Uint8Array(fs.readFileSync(path.join(LADDER, 'ckpt', rung.bg)));
  const bgSeed = new Uint16Array(bytes.length >> 1);
  for (let i = 0; i < bgSeed.length; i++) bgSeed[i] = (bytes[i * 2] << 8) | bytes[i * 2 + 1];
  const tables = JSON.parse(fs.readFileSync(TABLES, 'utf8'));
  return new Game(seed, tables, { logicFrame: 8000, videoFrame: rung.vf, bgSeed });
}

const HAVE_SMOKE = fs.existsSync(MANIFEST) && fs.existsSync(TABLES)
  && fs.existsSync(path.join(LADDER, 'ckpt', 'c008000.ram.bin'));

test('lf8000 hyper activation plus held fire runs ship and option projectiles',
  { skip: !HAVE_SMOKE && 'stage1-sweep lf8000 or exported ROM tables absent' }, () => {
  const game = seededGame();
  game.ram.setU16(0x81b65c, 1);
  game.ram.setU16(0x81b642, 0x095f);
  game.step(0xffff);                 // neutral edge baseline
  game.step(0xffbf);                 // Button 2: request hyper
  for (let i = 0; i < 30; i++) game.step(0xff7f); // Button 3: auto-fire

  assert.equal(game.ram.u16(0x81b63e), 1, 'hyper remains active');
  assert.equal(game.ram.u16(0x81b654), 1, 'level one stock became level one hyper');
  assert.ok(game.ram.u16(0x81b642) < 0x095f, 'the authentic gauge timer drains');
  const nibbles = new Set();
  for (let i = 0; i < 36; i++) {
    const type = game.ram.u16(0x810572 + i * 0x30);
    if (type) nibbles.add(type & 0x0f);
  }
  for (const nibble of [4, 6, 12, 14]) {
    assert.ok(nibbles.has(nibble), `live hyper-shot dispatch nibble ${nibble}`);
  }
});

test('the generated sprite index contains all 34 hyper aura frames',
  { skip: !fs.existsSync(path.join(ASSETS, 'manifest.json')) && 'generated assets absent' }, () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, 'manifest.json'), 'utf8'));
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(ASSETS, manifest.spr.streamsFile)));
  const flat = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const present = new Set();
  let address = 0;
  for (let i = 0; i < manifest.spr.streamCount; i++) {
    address = (address + flat[i]) >>> 0;
    present.add(address);
  }
  for (let i = 0; i < 34; i++) {
    const address = 0x0530fc + i * 0x234;
    assert.ok(present.has(address), `hyper aura stream $${address.toString(16)}`);
  }
});
