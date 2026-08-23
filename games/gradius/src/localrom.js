// Build the runtime resource bundle directly from the exact player-supplied
// Gradius iNES image. Nothing here persists or uploads cartridge bytes.

import { bindSoundRom } from './sound.js';

const INES_HEADER = 16;
const PRG_BYTES = 0x8000;
const CHR_BYTES = 0x8000;
const SCREEN_STRIDE = 0x38;
const FILL_TABLE = 0x9D73;
const PACKET_TABLE = 0x864E;
const PACKET_COUNT = 39;

class Rom {
  constructor(input) {
    const raw = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (raw.length !== INES_HEADER + PRG_BYTES + CHR_BYTES) {
      throw new Error(`Gradius image is ${raw.length} bytes, expected 65552.`);
    }
    if (raw[0] !== 0x4E || raw[1] !== 0x45 || raw[2] !== 0x53 || raw[3] !== 0x1A) {
      throw new Error('Gradius input is not an iNES image.');
    }
    if (raw[4] !== 2 || raw[5] !== 4 || (raw[6] & 0x04)) {
      throw new Error('Gradius input must contain 32 KiB PRG and 32 KiB CHR with no trainer.');
    }
    const mapper = (raw[6] >> 4) | (raw[7] & 0xF0);
    if (mapper !== 3 || !(raw[6] & 1)) {
      throw new Error('Gradius input must be mapper 3 CNROM with vertical mirroring.');
    }
    this.raw = raw;
    this.header = raw.subarray(0, INES_HEADER);
    this.prg = raw.subarray(INES_HEADER, INES_HEADER + PRG_BYTES);
    this.chr = raw.subarray(INES_HEADER + PRG_BYTES);
  }

  byte(addr) {
    if (addr < 0x8000 || addr > 0xFFFF) {
      throw new RangeError(`Gradius PRG address $${addr.toString(16).toUpperCase()} is outside $8000-$FFFF.`);
    }
    return this.prg[addr - 0x8000];
  }

  word(addr) { return this.byte(addr) | (this.byte(addr + 1) << 8); }
  slice(addr, length) { return this.prg.subarray(addr - 0x8000, addr - 0x8000 + length); }

  stageTables(stage) {
    return {
      threshold: this.byte(0x9FB4 + stage),
      screenOrder: this.word(0x9FBC + stage * 2),
      layoutBase: this.word(0x9FCC + stage * 2),
      patternTbl: this.word(0x9FDC + stage * 2),
      attrTbl: this.word(0x9FEC + stage * 2),
    };
  }
}

function decodeChr(chr) {
  const out = new Uint8Array(2048 * 64);
  for (let tile = 0; tile < 2048; tile++) {
    const src = tile * 16;
    const dst = tile * 64;
    for (let y = 0; y < 8; y++) {
      const plane0 = chr[src + y];
      const plane1 = chr[src + y + 8];
      for (let x = 0; x < 8; x++) {
        const shift = 7 - x;
        out[dst + y * 8 + x] = ((plane0 >> shift) & 1) | (((plane1 >> shift) & 1) << 1);
      }
    }
  }
  return out;
}

function decodeBlock(rom, start) {
  const out = [];
  let offset = 0;
  for (let row = 0; row < 4; row++) {
    let left = 4;
    while (left) {
      const value = rom.byte((start + offset) & 0xFFFF);
      if (value === 0 || (value & 0xF0) !== 0) {
        out.push(value);
        offset++;
        left--;
        continue;
      }
      offset++;
      const savedOffset = offset;
      if (value === 9 || value === 0x0A) {
        let tile = (value & 1) | 0x40;
        while (left) {
          out.push(tile);
          tile ^= 1;
          left--;
        }
        offset = savedOffset;
        continue;
      }
      if (value === 7 || value === 8) {
        const tile = value === 7 ? 0xED : 0;
        out.push(tile, tile);
        left -= 2;
        if (left <= 0) throw new Error(`Gradius terrain code ${value} overfilled a row.`);
        continue;
      }
      const tile = rom.byte(FILL_TABLE + value);
      while (left) {
        out.push(tile);
        left--;
      }
      offset = savedOffset;
    }
  }
  return out;
}

function collisionBytes(tiles, threshold) {
  const out = [];
  for (let col = 0; col < 4; col++) {
    let acc = 0;
    for (let row = 0; row < 4; row++) {
      let value = tiles[row * 4 + col];
      if (value >= threshold) value = 0x80;
      for (let bit = 0; bit < 2; bit++) {
        const carry = value >> 7;
        value = (value << 1) & 0xFF;
        acc = (acc >> 1) | (carry << 7);
      }
    }
    out.push(acc);
  }
  return out;
}

function expandStage(rom, stage) {
  const initial = rom.stageTables(stage);
  const endPage = rom.byte(0x98FD + stage);
  const pageOrder = Array.from({ length: endPage }, (_, page) => rom.byte(initial.screenOrder + page));
  const screens = {};
  const blocks = {};

  for (const orderedScreen of pageOrder) {
    let screen = orderedScreen;
    let effectiveStage = stage;
    if (stage !== 0) {
      if (screen === 0) {
        effectiveStage = 0;
        screen = 1;
      }
      screen--;
    }
    const screenKey = `${effectiveStage}:${screen}`;
    if (screens[screenKey]) continue;
    const tables = rom.stageTables(effectiveStage);
    const base = tables.layoutBase + SCREEN_STRIDE * screen;
    const blockIds = Array.from(rom.slice(base, SCREEN_STRIDE));
    screens[screenKey] = { rom: hex(base), blockIds };
    for (const blockId of new Set(blockIds)) {
      const blockKey = `${effectiveStage}:${blockId}`;
      if (blocks[blockKey]) continue;
      const ptr = rom.word(tables.patternTbl + blockId * 2);
      const tiles = decodeBlock(rom, ptr);
      blocks[blockKey] = {
        rom: hex(ptr),
        tiles,
        attr: rom.byte(tables.attrTbl + blockId),
        collision: collisionBytes(tiles, tables.threshold),
      };
    }
  }

  return {
    stage,
    endPage,
    bossPage: rom.byte(0x9A3D + stage),
    rankCountdown: Array.from({ length: 8 }, (_, rank) => rom.byte(0x9A35 + rank)),
    threshold: initial.threshold,
    tables: {
      screenOrder: hex(initial.screenOrder),
      layoutBase: hex(initial.layoutBase),
      patternTbl: hex(initial.patternTbl),
      attrTbl: hex(initial.attrTbl),
    },
    pageOrder,
    collisionWritten: stage !== 4,
    screens,
    blocks,
  };
}

function metasprites(rom) {
  const records = {};
  for (let id = 0; id < 0xA4; id++) {
    const doubled = (id * 2) & 0xFF;
    const table = id >= 0x80 ? 0x8E9E : 0x8D9E;
    const ptr = rom.word(table + doubled);
    if (ptr < 0x8000 || ptr > 0xFFFE) continue;
    const count = rom.byte(ptr);
    if (!count || ptr + 1 + count * 4 > 0x10000) continue;
    records[id] = Array.from({ length: count }, (_, index) => {
      const addr = ptr + 1 + index * 4;
      return [rom.byte(addr), rom.byte(addr + 1), rom.byte(addr + 2), rom.byte(addr + 3)];
    });
  }
  return records;
}

function hudPackets(rom) {
  return Array.from({ length: PACKET_COUNT }, (_, index) => {
    const out = [];
    let addr = rom.word(PACKET_TABLE + index * 2);
    while (out.length < 128) {
      const value = rom.byte(addr++);
      out.push(value);
      if (value === 0xFF || value === 0xFE) return Uint8Array.from(out);
    }
    throw new Error(`Gradius HUD packet ${index} has no terminator.`);
  });
}

function decodeScreen(rom, table, expected) {
  const out = [];
  for (let chunk = 0; chunk < 6; chunk++) {
    let addr = rom.word(table + chunk * 2);
    for (;;) {
      const value = rom.byte(addr++);
      if (value === 0x39) break;
      if (value === 0x34) {
        const count = rom.byte(addr++);
        const repeated = rom.byte(addr++);
        for (let i = 0; i < count; i++) out.push(repeated);
      } else {
        out.push(value);
      }
    }
  }
  if (out.length !== expected) {
    throw new Error(`Gradius screen at ${hex(table)} decoded to ${out.length} bytes, expected ${expected}.`);
  }
  return Uint8Array.from(out);
}

function cpuReader(rom, name) {
  const block = { name, base: 0x8000, bytes: rom.prg };
  return {
    blocks: [block],
    read: (addr) => rom.byte(addr),
    word: (addr) => rom.word(addr),
  };
}

function paletteManifest(rom) {
  const palette = (addr, length) => ({ colours: Array.from(rom.slice(addr, length)) });
  const high = rom.word(PACKET_TABLE + 8 * 2);
  return {
    palettes: {
      'gameplay.bg01': palette(0x877C, 8),
      'bgHigh.entry8': palette(high, 8),
      'gameplay.sprites': palette(0x879A, 16),
    },
  };
}

function hex(value) { return `$${value.toString(16).toUpperCase().padStart(4, '0')}`; }

export function createGradiusLocalResources(input, stageIndex = 0) {
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= 7) {
    throw new RangeError('Gradius stage index must be 0-6.');
  }
  const rom = new Rom(input);
  const stages = Array.from({ length: 7 }, (_, stage) => expandStage(rom, stage));
  const soundTables = cpuReader(rom, 'localPrg');
  bindSoundRom(soundTables);
  return Object.freeze({
    manifest: paletteManifest(rom),
    tiles: decodeChr(rom.chr),
    metasprites: metasprites(rom),
    screenImages: {
      playfield: decodeScreen(rom, 0x8C78, 2304),
      title: decodeScreen(rom, 0x8C8C, 1024),
    },
    stage: stages[stageIndex],
    stages,
    hudPackets: hudPackets(rom),
    enemyTables: cpuReader(rom, 'localPrg'),
    flowTables: cpuReader(rom, 'localPrg'),
    collisionTables: cpuReader(rom, 'localPrg'),
    weaponTables: cpuReader(rom, 'localPrg'),
    soundTables,
  });
}

export const GRADIUS_LOCAL_GAME = Object.freeze({
  display: Object.freeze({ frameHz: 60.098814 }),
});
