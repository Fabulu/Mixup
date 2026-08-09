import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { b64, decodePortinWords, parsePoke, validateReplay } from '../src/web/replay.js';
import { verifyReplay } from '../tools/replay.mjs';

const ROOT = new URL('../', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, ROOT), 'utf8');

function validReplay(overrides = {}) {
  const oneWord = b64(new Uint8Array([0, 0]));
  return {
    format: 'ddpdoj.replay/v1', build: 'B',
    seed: { lf: 10, vf: 20, ramB64: b64(new Uint8Array(0x20000)),
      bgB64: b64(new Uint8Array(0x1000)), tablesB64: b64(new TextEncoder().encode('{}')) },
    poke: '810500=7f',
    portin: { encoding: 'u16be', count: 1, b64: oneWord },
    digest: { columns: ['lf'], periodFrames: 250,
      periods: [{ lf: 11, sha256: '0'.repeat(64) }], cumulative: '1'.repeat(64) },
    ...overrides,
  };
}

test('W165 replay poke parity accepts arbitrary RAM writes and rejects malformed writes', () => {
  assert.deepEqual(parsePoke('810424=FF,810500=7f'), [[0x810424, 0xff], [0x810500, 0x7f]]);
  assert.throws(() => parsePoke('810500=100'), /invalid replay poke/);
  assert.throws(() => parsePoke('700000=01'), /outside main RAM/);
  assert.throws(() => parsePoke('810500'), /invalid replay poke/);
});

test('W165 replay initialization validates input count and full seed/digest shape', () => {
  const o = validReplay();
  const parsed = validateReplay(o);
  assert.deepEqual(Array.from(parsed.words), [0]);
  assert.deepEqual(parsed.pokes, [[0x810500, 0x7f]]);
  assert.throws(() => decodePortinWords({ ...o,
    portin: { ...o.portin, count: 2 } }), /does not match/);
  assert.throws(() => validateReplay({ ...o, poke: '810500=GG' }), /invalid replay poke/);
  assert.throws(() => validateReplay({ ...o,
    digest: { ...o.digest, periods: [] } }), /periods/);
  assert.throws(() => verifyReplay({ ...o, build: 'A' }), /unsupported replay build/);
  assert.throws(() => verifyReplay({ ...o, poke: '810500=GG' }), /invalid replay poke/);
});

test('W165 control help is shared, accessible, pointer-transparent, and below the bar', () => {
  const html = read('index.html');
  const app = read('src/web/app.js');
  assert.doesNotMatch(html, /\btitle=/, 'native browser tooltips must be absent');
  for (const id of ['rot', 'ctrl', 'rec', 'play', 'infobtn']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*(?:aria-label|data-help)`));
  }
  assert.match(html, /#replay-banner[\s\S]{0,500}pointer-events: none/);
  assert.match(html, /#control-help[\s\S]{0,500}pointer-events: none/);
  assert.match(html, /#control-help[\s\S]{0,500}top: 36px/);
  assert.match(html, /playLabel\.addEventListener\('keydown'/);
  assert.match(html, /e\.key === 'Escape'/);
  assert.match(app, /this\.playback\.pokes/, 'browser playback must apply the file poke list');
  assert.match(app, /for \(const \[a, val\] of pokes\)/);
});
