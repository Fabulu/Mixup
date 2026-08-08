#!/usr/bin/env node
// W150 executable recon gate. This reads the independently captured decrypted
// 68k image and uploaded Z80 RAM image. It does not use oracle event history.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseScore } from '../src/bgmscore.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const z80Path = path.join(root, 'rip', 'sound', 'z80ram.bin');
const m68kPath = path.join(here, 'oracle', 'out', 'maincpu.bin');
const z80 = new Uint8Array(fs.readFileSync(z80Path));
const m68k = new Uint8Array(fs.readFileSync(m68kPath));
let checks = 0;

function fail(name, got, want) {
  throw new Error(`${name}: got ${got}, want ${want}`);
}
function eq(name, got, want) {
  checks++;
  if (got !== want) fail(name, got, want);
}
function ok(name, value) {
  checks++;
  if (!value) fail(name, value, true);
}
function le16(bytes, addr) { return bytes[addr] | (bytes[addr + 1] << 8); }
function hexAt(bytes, addr, hex) {
  const got = Buffer.from(bytes.subarray(addr, addr + hex.length / 2)).toString('hex');
  eq(`bytes at $${addr.toString(16)}`, got, hex.toLowerCase());
}

if (process.argv.includes('--mutate-queue-size')) {
  // Deliberate in-memory mutation for the RED demonstration. No source or
  // captured evidence file is changed.
  z80[0x6001 + 8] = 6;
}

// $6001 is a generic queue header. DE=$0006 is the source offset, not length.
const qStart = le16(z80, 0x6001);
const qEnd = le16(z80, 0x6001 + 6);
const qElem = le16(z80, 0x6001 + 8);
const qCap = le16(z80, 0x6001 + 10);
eq('queue data start', qStart, 0x600F);
eq('queue data end', qEnd, 0x614F);
eq('queue element size', qElem, 4);
eq('queue capacity', qCap, 80);
eq('queue span equals capacity times element size', qEnd - qStart, qCap * qElem);
hexAt(z80, 0x080B, '110600210160cdea3b');
hexAt(z80, 0x3C11, 'dd5efcdd56fd21080019');

// $28BB04 packer anchors and an exhaustive encode/decode bijection.
hexAt(m68k, 0x28BB04, '024300ffe54b3802e14ce04a0242000386428644');
for (let selector = 0; selector < 0x400; selector++) {
  for (let channel = 0; channel < 0x40; channel++) {
    const byte2 = selector & 0xFF;
    const byte3 = ((channel << 2) | (selector >> 8)) & 0xFF;
    const decodedSelector = byte2 | ((byte3 & 3) << 8);
    const decodedChannel = byte3 >> 2;
    if (decodedSelector !== selector || decodedChannel !== channel) {
      fail('selector/channel bijection', `${decodedSelector}/${decodedChannel}`,
        `${selector}/${channel}`);
    }
  }
}
checks++;

// Runtime table bases, counts, extents, and descriptor-grid consumers.
eq('BGM descriptor base', le16(z80, 0x62E6), 0x6840);
eq('SFX descriptor count', le16(z80, le16(z80, 0x62E8)), 69);
eq('SFX descriptor base', le16(z80, 0x62EA), 0x7600);
eq('BGM descriptor count by adjacent boundary', (0x7600 - 0x6840) / 22, 160);
eq('SFX descriptor end', 0x7600 + 69 * 12, 0x793C);
eq('pitch table end', 0x5203 + 16 * 0x78, 0x5983);
eq('pitch words per bank', 0x78 / 2, 60);
eq('bank 0 note 41 pitch', le16(z80, 0x5203 + 41 * 2), 0x00A0);
for (let t = 0; t < 8; t++) {
  const p = le16(z80, 0x6184 + t * 0x29 + 9);
  if (p !== 0) ok(`track ${t} descriptor pointer is on the 22-byte grid`,
    p >= 0x6840 && p < 0x7600 && (p - 0x6840) % 22 === 0);
}

// Exact four-family event dispatch, C0 secondary dispatch, and handler table.
hexAt(z80, 0x2BC6, '0000d4284000082980003b29c000e229');
hexAt(z80, 0x2BBA, '1000fe292000512a');
const stateHandlers = [
  0x1D2E, 0x1DF6, 0x1E3B, 0x1E7E, 0x1E9B, 0x1EE4, 0x1EEB, 0x1EF2,
  0x1F3B, 0x1F3C, 0x1F84, 0x1F88, 0x1FE5, 0x2037, 0x245A, 0x247A,
];
for (let i = 0; i < stateHandlers.length; i++) {
  eq(`state handler ${i}`, le16(z80, 0x4316 + i * 2), stateHandlers[i]);
}

function eventLength(event) {
  switch (event & 0xC0) {
    case 0x00: return 1;
    case 0x40: return 2;
    case 0x80: return 2;
    default: return (event & 0x30) === 0x10 || (event & 0x30) === 0x20 ? 3 : 4;
  }
}
const score = parseScore(z80);
const cue8 = score.cues[8];
eq('cue 8 track 0 prefix', Buffer.from(cue8.noteStreams[0].slice(0, 8)).toString('hex'),
  'cf782a0704aa0704');
let cue8Events = 0;
for (let t = 0; t < cue8.noteStreams.length; t++) {
  const stream = cue8.noteStreams[t];
  let pos = 0;
  while (pos < stream.length) {
    const len = eventLength(stream[pos]);
    ok(`cue 8 track ${t} event ${cue8Events} is complete`, pos + len <= stream.length);
    pos += len;
    cue8Events++;
  }
  eq(`cue 8 track ${t} framing consumes its stream`, pos, stream.length);
}
eq('cue 8 event count', cue8Events, 141);

// $34FB operation callers: cmd 0F supplies mode 2; cmd 0D mode 1; cmd 0E mode 0.
hexAt(z80, 0x050F, '010200110000dd6efedd66ffcdfb34');
hexAt(z80, 0x057E, '010100dd5efd1600');
hexAt(z80, 0x05E1, '010000dd6efedd66ffcdfb34');

// Real score resolver tails, plus the service-input direct type-$12 call.
hexAt(m68k, 0x28CB14, '4efaf606');
hexAt(m68k, 0x28CB32, '4efaf612');
hexAt(m68k, 0x28BEE4, '4eba0236');

console.log(`W150 sound recon: ${checks} checks green; cue8 events=${cue8Events}`);
