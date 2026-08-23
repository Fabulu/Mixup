// W497: focused Type-B playable-path witnesses across all cartridge style selectors.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

import { Ram } from '../src/ram.js';
import { RAM, P, OPT } from '../src/machine.js';
import { RomWindows } from '../src/rom.js';
import { MoveTables } from '../src/vectors.js';
import { ProtLatch } from '../src/protsim.js';
import { UnportedLog } from '../src/unported.js';
import { SHOT, runShotDriver } from '../src/weapons.js';
import {
  spawnShotTypeB, shotHandlers, handler253BDA, SPAWN, PS, S,
} from '../src/shots.js';
import {
  OPTION_BLOCKS, POD_SPAWNS, fireHandshake, OPT_ROT_ANGLE,
} from '../src/options.js';
import { drawShip, SHIP_TABLES } from '../src/shipsprite.js';
import { snapshotBucket } from '../src/spritequeue.js';
import { LASER, seedSegmentFamily1 } from '../src/laser.js';
import { SoundState, postWrapper, drainFrame } from '../src/sound.js';

const TABLES = new URL('../rip/port/player.tables.json', import.meta.url);
const MANIFEST = new URL('../assets/manifest.json', import.meta.url);
const STREAM_MAP = new URL('../assets/spr/streams.u32.gz', import.meta.url);
const haveTables = existsSync(TABLES);
const havePacked = existsSync(MANIFEST) && existsSync(STREAM_MAP);
const tables = haveTables ? JSON.parse(readFileSync(TABLES, 'utf8')) : null;
const SKIP = haveTables ? false : 'rip/port/player.tables.json is not built';
const SKIP_PACKED = haveTables && havePacked ? false
  : 'generated tables/assets are absent; run export-tables.py then export-web.mjs';
const PL1 = RAM.player1;
const OPT1 = RAM.p1Options;

function bench() {
  const ram = new Ram(null);
  const rom = haveTables ? new RomWindows(tables.rom) : null;
  return {
    ram,
    rom,
    ctx: {
      rom,
      prot: new ProtLatch(),
      tables: haveTables ? new MoveTables(tables, rom) : null,
      unportedLog: new UnportedLog(),
    },
  };
}

function liveShotSlots(ram) {
  const out = [];
  for (let slot = 0; slot < SHOT.slots; slot++) {
    const rec = SHOT.p1Table + slot * SHOT.stride;
    if (ram.u16(rec) & 0x8000) out.push(slot);
  }
  return out;
}

function seedPlayerShot(ram, style, hyper = false) {
  ram.setU16(PL1 + P.state, hyper ? 0x0001 : 0x0000);
  ram.setU16(PL1 + P.posY, 0x1179);
  ram.setU16(PL1 + P.posX, 0x14c0);
  ram.setU16(PL1 + PS.power, 0);
  ram.setU16(PL1 + PS.animPhase, 8);
  ram.setU16(PL1 + PS.animIdx, 4);
  ram.setU8(PL1 + PS.powerByte, 2);
  ram.setU16(PL1 + PS.formation, style);
  ram.setU32(SPAWN.countPtrP1, 0x255278);
  ram.setU16(SPAWN.gate308c, 1);
}

function readU32(bytes, at) {
  return ((bytes[at] << 24) | (bytes[at + 1] << 16)
    | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function readU16(bytes, at) {
  return (bytes[at] << 8) | bytes[at + 1];
}

function packedStreamMap() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  assert.equal(manifest.spr.streamsFormat, 'planes-delta-1');
  const raw = gunzipSync(readFileSync(STREAM_MAP));
  const words = new Uint32Array(raw.buffer, raw.byteOffset, raw.byteLength >>> 2);
  const n = manifest.spr.streamCount;
  assert.equal(words.length, n * 3);
  const byRom = new Map();
  let romOffset = 0, packedBase = 0;
  for (let i = 0; i < n; i++) {
    romOffset = (romOffset + words[i]) >>> 0;
    packedBase = (packedBase + words[n + i]) >>> 0;
    byRom.set(romOffset, { base: packedBase, maskWords: words[2 * n + i] });
  }
  return { manifest, byRom };
}

function assertPacked(byRom, descriptors, label) {
  const offsets = [...descriptors].map((v) => v & 0x7fffff);
  const absent = offsets.filter((v) => !byRom.has(v));
  assert.deepEqual(absent, [], `${label}: every cartridge-selected descriptor is packed`);
  assert.ok(offsets.every((v) => byRom.get(v).maskWords > 2),
    `${label}: every packed row has mask data beyond its rewritten header`);
}

test('W497 Type-A and Type-B each have 17 image states and deliberately share hitboxes',
  { skip: SKIP }, () => {
    const { ctx } = bench();
    assert.equal(ctx.tables.animByShip[0].length, 17);
    assert.equal(ctx.tables.animByShip[2].length, 17);
    assert.deepEqual(ctx.tables.anim(0xffe0, 2).a, [0, 0x18a4]);
    assert.deepEqual(ctx.tables.anim(0x0000, 2).a, [0, 0x1bc4]);
    assert.deepEqual(ctx.tables.anim(0x0020, 2).a, [0, 0x1ee4]);
    for (const tilt of [0xffe0, 0xfff0, 0, 0x10, 0x20]) {
      assert.deepEqual(ctx.tables.anim(tilt, 2).hitX, ctx.tables.anim(tilt, 0).hitX,
        `tilt $${tilt.toString(16)} selected a second horizontal hitbox row`);
    }
    assert.throws(() => ctx.tables.anim(0, 4), /ship selector 4/);
  });

test('W497 Type-B hit zoom flags come from the bounded exported $253A58 table',
  { skip: SKIP }, () => {
    const { rom, ctx } = bench();
    const win = tables.rom.windows.find((w) => String(w.base).toUpperCase() === '$253A58');
    assert.ok(win, '$253A58 must be a named RomWindows row');
    assert.equal(win.len, 6 * 4, 'exactly six cartridge longwords, no adjacent code');
    for (let power = 0; power <= 0x0a; power += 2) {
      assert.equal(ctx.tables.typeBHitFlags(power), rom.u32(0x253a58 + power * 2),
        `power ${power} is read from its exported cartridge longword`);
    }
    assert.throws(() => ctx.tables.typeBHitFlags(1), /power 1/);
    assert.throws(() => ctx.tables.typeBHitFlags(0x0c), /power 12/);
  });

test('W497 Type-B player shots spawn for styles 2, 4, and 6 in normal and hyper arms',
  { skip: SKIP }, () => {
    for (const style of [2, 4, 6]) {
      for (const hyper of [false, true]) {
        const { ram, rom } = bench();
        const sounds = [], spawns = [];
        const sound = new SoundState();
        seedPlayerShot(ram, style, hyper);
        spawnShotTypeB(ram, rom, PL1, {
          soundPost: (addr) => {
            sounds.push(addr);
            postWrapper(ram, sound, addr);
          },
          shotSpawn: (...args) => spawns.push(args),
        });

        const slots = liveShotSlots(ram);
        assert.equal(slots.length, style === 4 ? 1 : 2,
          `style ${style} ${hyper ? 'hyper' : 'normal'} allocation count`);
        assert.equal(ram.u16(SHOT.p1Table + slots[0] * SHOT.stride + S.type) & 0x0f,
          hyper ? 5 : 1, 'the record must dispatch to the Type-B player handler');
        assert.deepEqual(sounds, [hyper ? 0x28c3ee : 0x28c3d4]);
        assert.equal(drainFrame(ram, sound, 0)?.word,
          hyper ? 0x00491528 : 0x00491128,
          'the cartridge wrapper posts its exact type, pan, id, and channel door');
        assert.match(spawns[0][0], /^type-b-(single|pair)$/);

        const tableOffset = ((style - 2) << 2) + (hyper ? 4 : 0);
        const template = rom.u32(rom.u32(SPAWN.ptrTypeB + tableOffset));
        assert.equal(ram.u16(SHOT.p1Table + slots[0] * SHOT.stride), rom.u16(template),
          'the spawned type word comes from the selected $25551A template arm');
      }
    }
  });

test('W526 Type-A style 6 first hit reads its exported $24DFA2 descriptor',
  { skip: SKIP }, () => {
    const { ram, rom, ctx } = bench();
    const rec = SHOT.p1Table;
    const win = tables.rom.windows.find(
      (w) => String(w.base).toUpperCase() === '$24DDD0');
    assert.equal(win?.len, 0x0210, 'the hit family ends at the adjacent $24DFE0 window');

    ram.setU16(rec, 0x80c8);
    ram.setU16(rec + S.posY, 0x2000);
    ram.setU16(rec + S.posX, 0x1800);
    ram.setU16(rec + S.tableIdx, 0x003c);
    const descriptor = rom.u32(0x24deb2 + ram.u16(rec + S.tableIdx));
    assert.equal(descriptor, 0x24dfa2, 'style 6 selects the cartridge descriptor');

    handler253BDA(ram, rom, rec, ctx, PL1, 0xc8);
    assert.equal(ram.u32(rec + S.drawOff), rom.u32(descriptor));
    assert.equal(ram.u16(rec + S.dlWord4), rom.u16(descriptor + 4));
    assert.equal(ram.u32(rec + S.animPtr), rom.u32(descriptor + 6));
    assert.equal(ram.u16(rec + S.animIdx), 0x000c,
      'the descriptor installs $10 and the shared hit tail advances it once');
  });

test('W525 Type-B normal shots cross entry 1 for every authentic style',
  { skip: SKIP }, () => {
    const firstTableIndexes = new Map([[2, 0x00], [4, 0x28], [6, 0x3c]]);
    for (const style of [2, 4, 6]) {
      const { ram, rom, ctx } = bench();
      seedPlayerShot(ram, style, false);
      spawnShotTypeB(ram, rom, PL1, { soundPost() {} });

      const slots = liveShotSlots(ram);
      const records = slots.map((slot) => SHOT.p1Table + slot * SHOT.stride);
      assert.equal(ram.u16(records[0] + S.tableIdx), firstTableIndexes.get(style),
        `style ${style} selects its cartridge table arm`);
      const expected = records.map((rec) => {
        const descriptor = rom.u32(0x24e512 + ram.u16(rec + S.tableIdx));
        return { drawOff: rom.u32(descriptor), dlWord4: rom.u16(descriptor + 4) };
      });

      assert.equal(runShotDriver(ram, rom, shotHandlers(), ctx), records.length,
        `style ${style} arms its normal shots`);
      assert.equal(runShotDriver(ram, rom, shotHandlers(), ctx), records.length,
        `style ${style} carries its one-frame-old shots`);
      assert.equal(runShotDriver(ram, rom, shotHandlers(), ctx), records.length,
        `style ${style} crosses the entry-1 cartridge lookup`);
      for (let i = 0; i < records.length; i++) {
        assert.equal(ram.u16(records[i]) & 0x0f, 9,
          `style ${style}, record ${i} advances to entry 9`);
        assert.equal(ram.u32(records[i] + S.drawOff), expected[i].drawOff,
          `style ${style}, record ${i} installs the selected draw offset`);
        assert.equal(ram.u16(records[i] + S.dlWord4), expected[i].dlWord4,
          `style ${style}, record ${i} installs the selected display word`);
      }
    }
  });

test('W497 Type-B allocation uses the cartridge caps and retains cadence feedback',
  { skip: SKIP }, () => {
    const capped = (style, occupied) => {
      const { ram, rom } = bench();
      seedPlayerShot(ram, style, true);
      ram.setU16(SPAWN.gate308c, 0);
      for (const slot of occupied) ram.setU16(SHOT.p1Table + slot * SHOT.stride, 0x8000);
      spawnShotTypeB(ram, rom, PL1, { soundPost() {} });
      return liveShotSlots(ram);
    };
    assert.deepEqual(capped(4, [9, 10, 11, 12]), [9, 10, 11, 12, 13],
      'style 4 caps D7 at 4, so the fifth checked record is slot 13');
    assert.deepEqual(capped(2, [14, 15, 16, 17, 18, 19, 20]),
      [14, 15, 16, 17, 18, 19, 20, 21, 22],
      'styles 2 and 6 cap D7 at 7, then continue the same scan for record two');

    const { ram, rom } = bench();
    seedPlayerShot(ram, 6, false);
    for (let slot = 0; slot < SHOT.slots; slot++) {
      ram.setU16(SHOT.p1Table + slot * SHOT.stride, 0x8000);
    }
    ram.setU8(PL1 + 0x2b, 0x55);
    ram.bset8(PL1 + P.state, 3);
    spawnShotTypeB(ram, rom, PL1, {});
    assert.equal(ram.u8(PL1 + 0x2b), 0);
    assert.equal(ram.btst8(PL1 + P.state, 3), 0);
  });

test('W497 Type-B down-stick glow selects the alternate sprite and geometry families',
  { skip: SKIP }, () => {
    const render = (dirByte) => {
      const { ram, rom, ctx } = bench();
      ram.setU16(PL1 + P.state, 0x8000);
      ram.setU16(PL1 + P.posY, 0x1179);
      ram.setU16(PL1 + P.posX, 0x14c0);
      ram.setU16(PL1 + P.shipSel, 2);
      ram.setU16(PL1 + P.tilt, 0);
      ram.setU16(PL1 + P.glowPhase, 4);
      ram.setU8(PL1 + P.dirByte, dirByte);
      ram.setU32(PL1 + P.animA, 0x00001bc4);
      ram.setU16(PL1 + P.size, 0x0620);
      ram.setU16(0x80390c, 1);
      drawShip(ram, PL1, ctx);
      return { bytes: snapshotBucket(ram, 19).bytes, rom };
    };

    const ordinary = render(0);
    const down = render(0x02);
    assert.equal(ordinary.bytes.length, 24, 'ship plus ordinary glow');
    assert.equal(down.bytes.length, 24, 'ship plus down-stick glow');

    const expected = (rom, spriteTable, geomTable) => {
      const perShip = rom.u32(spriteTable + 4);
      const perTilt = rom.u32(perShip);
      const descriptor = rom.u32(perTilt + 4);
      const geom = rom.u32(geomTable + 4);
      return { descriptor, size: rom.u16(geom + 4) };
    };
    const normalExpected = expected(ordinary.rom, SHIP_TABLES.glowSprite, SHIP_TABLES.glowGeom);
    const downExpected = expected(down.rom, SHIP_TABLES.glowSpriteAlt, SHIP_TABLES.glowGeomAlt);
    assert.equal(readU32(ordinary.bytes, 16), normalExpected.descriptor);
    assert.equal(readU16(ordinary.bytes, 20), normalExpected.size);
    assert.equal(readU32(down.bytes, 16), downExpected.descriptor);
    assert.equal(readU16(down.bytes, 20), downExpected.size);
    assert.notDeepEqual(downExpected, normalExpected,
      'the alternate arm must not alias the ordinary Type-B glow family');
  });

function seedOptionFire(ram, ship, style) {
  ram.setU16(PL1 + P.optFormation, style);
  ram.setU16(PL1 + P.shipSel, ship);
  ram.setU16(PL1 + P.posY, 0x1179);
  ram.setU16(PL1 + P.posX, 0x14c0);
  ram.setU8(PL1 + 0x21, 0);
  ram.setU8(PL1 + 0x37, 2);
  ram.setU16(PL1 + 0x20, 0);
  ram.setU8(PL1 + 0x56, 2);
  ram.setU32(0x8127e8, 0x24bfde);
  ram.setU16(OPT1 + OPT.state, 0x8003);
  ram.setU8(OPT1 + OPT.edge, 0x10);
  ram.setU16(OPT1 + OPT.posY, 0x1179);
  ram.setU16(OPT1 + OPT.posX, 0x14c0);
  ram.setU16(OPT1 + OPT.posY2, 0x1179);
  ram.setU16(OPT1 + OPT.pod + OPT.posX, 0x14c0);
  ram.setU8(OPT1 + OPT_ROT_ANGLE, 0);
  ram.setU8(OPT1 + OPT.pod + OPT_ROT_ANGLE, 0x20);
}

test('W497 option-shot spawns cover both ship selectors across all three formations',
  { skip: SKIP }, () => {
    for (const ship of [0, 2]) {
      for (const style of [2, 4, 6]) {
        const { ram, ctx } = bench();
        seedOptionFire(ram, ship, style);
        fireHandshake(ram, ctx, OPTION_BLOCKS[0], POD_SPAWNS[style]);
        const slots = liveShotSlots(ram);
        assert.ok(slots.length >= 1, `ship ${ship}, style ${style} spawned no option shot`);
        for (const slot of slots) {
          const rec = SHOT.p1Table + slot * SHOT.stride;
          assert.equal(ram.u16(rec + S.type) & 0x0f, ship === 0 ? 2 : 3,
            `ship ${ship}, style ${style}, slot ${slot} used the wrong option handler`);
          assert.equal(ram.u16(rec + S.formation), style);
        }
      }
    }
  });

test('W497 regular laser seed family selects Type-A and Type-B rows for every style slot',
  { skip: SKIP }, () => {
    const sources = new Set();
    for (const ship of [0, 2]) {
      for (const style of [2, 4, 6]) {
        const { ram, rom, ctx } = bench();
        ram.setU16(PL1 + P.shipSel, ship);
        ram.setU16(PL1 + P.optFormation, style);
        ram.setU16(PL1 + 0x22, 0);
        ram.setU8(PL1 + 0x56, 2);
        const source = rom.u32(LASER.ptrFamily1 + (ship === 0 ? 0 : 0x14));
        sources.add(source);
        seedSegmentFamily1(ram, ctx, OPTION_BLOCKS[0]);
        const target = 0x811832;
        assert.equal(ram.u16(target), rom.u16(source));
        assert.equal(ram.u32(target + 6), rom.u32(source + 2));
        assert.equal(ram.u16(target + 0x1a), 1, 'the P1 ownership word comes from D7');
      }
    }
    assert.equal(sources.size, 2, 'Type-A and Type-B must not share the regular laser seed row');
  });

test('W497 packed map contains every Type-B attached shadow and glow descriptor',
  { skip: SKIP_PACKED }, () => {
    const { rom } = bench();
    const { manifest, byRom } = packedStreamMap();
    const families = [
      [SHIP_TABLES.shadowSprite, [null], 'shadow'],
      [SHIP_TABLES.glowSprite, [0, 4], 'ordinary glow'],
      [SHIP_TABLES.glowSpriteAlt, [0, 4], 'down-stick glow'],
    ];
    for (const [table, phases, label] of families) {
      const perShip = rom.u32(table + 4);
      const descriptors = new Set();
      for (let tilt = -0x20; tilt <= 0x20; tilt += 4) {
        const cell = rom.u32(perShip + tilt);
        for (const phase of phases) {
          descriptors.add(phase === null ? cell : rom.u32(cell + phase));
        }
      }
      assert.equal(descriptors.size, 17 * phases.length,
        `${label} has the complete 17-tilt x ${phases.length}-phase domain`);
      assertPacked(byRom, descriptors, `Type-B ${label}`);
      for (const descriptor of descriptors) {
        const row = byRom.get(descriptor & 0x7fffff);
        const shard = manifest.spr.shards.find((s) => row.base >= s.maskFrom
          && row.base < s.maskFrom + s.maskLen);
        assert.equal(shard?.i, 0, `${label} is boot-resident attached player art`);
      }
    }
  });

test('W497 packed map contains the reachable +$28 and +$50 regular-laser groups',
  { skip: SKIP_PACKED }, () => {
    const { rom } = bench();
    const { manifest, byRom } = packedStreamMap();
    const descriptors = new Set();
    for (const groupBytes of [0x28, 0x50]) {
      for (let power = 0; power < 5; power++) {
        const block = rom.u32(0x24bb0a + groupBytes + power * 8 + 4);
        for (let off = 0x1e; off >= 0; off -= 0x0a) {
          descriptors.add(rom.u32(block + off + 4));
        }
      }
    }
    assert.equal(descriptors.size, 10 * 4,
      'two five-power groups retain four distinct cartridge frames per entry');
    assertPacked(byRom, descriptors, 'Type-B/style regular laser');
    for (const descriptor of descriptors) {
      const row = byRom.get(descriptor & 0x7fffff);
      const shard = manifest.spr.shards.find((s) => row.base >= s.maskFrom
        && row.base < s.maskFrom + s.maskLen);
      assert.equal(shard?.kind, 'laser');
    }
  });

test('W497 packed map contains runtime-selected Type-B ordinary and laser-bomb art',
  { skip: SKIP_PACKED }, () => {
    const { rom } = bench();
    const { byRom } = packedStreamMap();

    const ordinary = new Set();
    let a = 0x25658a;
    while (rom.u16(a) !== 0xffff) {
      ordinary.add(rom.u32(a + 4));
      a += 12;
    }
    for (let off = 0x1c; off >= 0; off -= 4) ordinary.add(rom.u32(0x2565fe + off));
    a = 0x25664e;
    while (rom.u32(a) !== 0xffffffff) {
      ordinary.add(rom.u32(a));
      a += 4;
    }
    assert.equal(ordinary.size, 4 + 8 + 4,
      'Type-B ordinary phases retain the cartridge 4/8/4 shape');
    assertPacked(byRom, ordinary, 'Type-B ordinary bomb');

    const beam = new Set();
    for (const head of [0x256986, 0x256992, 0x25699e, 0x2569aa]) {
      for (let frame = 0; frame < 3; frame++) beam.add(rom.u32(head + frame * 4));
    }
    for (let phase = 0; phase < 8; phase++) {
      const frames = rom.u32(0x2569b6 + phase * 4);
      for (let frame = 0; frame < 3; frame++) beam.add(rom.u32(frames + frame * 4));
    }
    let rows = 0;
    a = 0x256a36;
    while (rom.u32(a) !== 0xffffffff) {
      for (let head = 0; head < 4; head++) beam.add(rom.u32(a + head * 4));
      const segments = rom.u32(a + 16);
      for (let phase = 0; phase < 8; phase++) beam.add(rom.u32(segments + phase * 4));
      a += 20;
      rows++;
    }
    assert.equal(rows, 12, 'Type-B laser-bomb phase 2 retains twelve runtime rows');
    assertPacked(byRom, beam, 'Type-B laser bomb');
  });
