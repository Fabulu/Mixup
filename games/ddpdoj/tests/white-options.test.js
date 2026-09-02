import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { RAM, P } from '../src/machine.js';
import { BLACK_LABEL_PROFILE, WHITE_LABEL_PROFILE } from '../src/profiles.js';
import { Ram } from '../src/ram.js';
import { RomWindows } from '../src/rom.js';
import { WHITE_RUNTIME_BINDING } from '../src/runtime-profile.js';
import { WHITE_OPTION_OVERLAP_PAIRS } from './romwindowset.js';
import {
  WHITE_BEAMS,
  WHITE_LASER_EDITION_RESOURCES,
  WHITE_OPTION_BLOCKS,
  WHITE_OPTION_EDITION_RESOURCES,
  createWhiteStage1CombatHandlers,
  runWhiteType5AfterBombCall18A146Through144A02,
  runWhiteType5BeforeBombCall18A146,
} from '../src/white-options.js';
import { validateOptionEditionResources } from '../src/options.js';
import {
  BEAM, NATIVE_LASER_EDITION_RESOURCES, runBeamDrawWithResources,
  validateLaserEditionResources,
} from '../src/laser.js';
import {
  S as SHOT_RECORD,
  shotAndOptionHandlersWithResources,
} from '../src/shots.js';
import {
  E, NATIVE_SPARK_RESOURCES,
  runSparkDriverWithResources,
  spawnBeamBodyWithResources,
  spawnBeamImpactWithResources,
} from '../src/spark.js';
import { runShotPool } from '../src/weapons.js';
import {
  WHITE_SHOT,
  WHITE_SHOT_DRIVER_RESOURCES,
  WHITE_SHOT_LIFECYCLE_RESOURCES,
  WHITE_SPARK_RESOURCES,
  createWhiteShotTables,
} from '../src/white-shots.js';

const TABLES_PATH = fileURLToPath(new URL(
  '../rip/port/player.tables.json', import.meta.url,
));
const TABLES = JSON.parse(readFileSync(TABLES_PATH, 'utf8'));
const WHITE_MANIFEST = TABLES.editions.whiteLabel;

function cartridge() {
  return new RomWindows(TABLES.rom);
}

function overrideRom(base, method, replacement) {
  return new Proxy(base, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property === method) return (address, ...args) => replacement(target, address, ...args);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function unchanged(ram) {
  const before = Uint8Array.from(ram.b);
  return () => assert.deepEqual(ram.b, before);
}

function recurringRam() {
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const slot = 0x80e240;
  ram.setU8(slot + 2, 1);
  return { ram, slot };
}

test('White option capability, profile, and regenerated ROM ledgers agree exactly', () => {
  assert.equal(
    WHITE_RUNTIME_BINDING.capabilities.stage1Options,
    'ddpdoj.runtime.white-label-a.stage1-options.v1',
  );
  assert.deepEqual(
    {
      optionObject: WHITE_LABEL_PROFILE.codeLandmarks.optionObject,
      optionHandler: WHITE_LABEL_PROFILE.codeLandmarks.optionHandler,
      optionCombatEntry: WHITE_LABEL_PROFILE.codeLandmarks.optionCombatEntry,
      optionButton2Call: WHITE_LABEL_PROFILE.codeLandmarks.optionButton2Call,
      optionShotDriverCall: WHITE_LABEL_PROFILE.codeLandmarks.optionShotDriverCall,
      optionSegmentDriverCall: WHITE_LABEL_PROFILE.codeLandmarks.optionSegmentDriverCall,
      optionBeamDrawCall: WHITE_LABEL_PROFILE.codeLandmarks.optionBeamDrawCall,
      optionSparkDriverCall: WHITE_LABEL_PROFILE.codeLandmarks.optionSparkDriverCall,
      optionCollisionEntry: WHITE_LABEL_PROFILE.codeLandmarks.optionCollisionEntry,
    },
    {
      optionObject: 0x14b74a, optionHandler: 0x18a11c,
      optionCombatEntry: 0x18a0e4, optionButton2Call: 0x18a146,
      optionShotDriverCall: 0x18a14c, optionSegmentDriverCall: 0x18a158,
      optionBeamDrawCall: 0x18a15e, optionSparkDriverCall: 0x18a164,
      optionCollisionEntry: 0x18a1ac,
    },
  );
  assert.equal(WHITE_MANIFEST.profileId, WHITE_LABEL_PROFILE.id);
  assert.equal(WHITE_MANIFEST.options.templateTable, '$14B25E');
  assert.deepEqual(WHITE_MANIFEST.options.ordinaryCombat, {
    entry: '$18A0E4', recurring: '$18A11C', collisionEntry: '$18A1AC',
    calls: [
      ['$18A134', '$17E9DE'], ['$18A146', '$155394'],
      ['$18A14C', '$15302C'], ['$18A152', '$14B74A'],
      ['$18A158', '$153C3C'], ['$18A15E', '$1545FE'],
      ['$18A164', '$188BD4'], ['$18A194', '$180D3A'],
      ['$18A19A', '$152B5A'], ['$18A1A0', '$151FDE'],
      ['$18A1A6', '$152106'],
    ].map(([site, target]) => ({ site, target })),
  });
  assert.deepEqual(WHITE_MANIFEST.options.resetEntries, {
    hyper: ['$151DC0', '$151E08'],
    laserBomb: ['$151DC8', '$151E10'],
  });
  assert.deepEqual(
    WHITE_MANIFEST.options.laserDispatch,
    WHITE_LASER_EDITION_RESOURCES.expectedDispatch.map(
      (row) => row.map((address) => `$${address.toString(16).toUpperCase().padStart(6, '0')}`),
    ),
  );

  const windows = TABLES.rom.windows.map((window) => ({
    ...window,
    address: parseInt(window.base.slice(1), 16),
  }));
  const exported = new Set(windows.map(
    (window) => `${window.base}:${window.len}`,
  ));
  assert.equal(WHITE_MANIFEST.optionRuntimeWindows.length, 26);
  const optionKeys = new Set(WHITE_MANIFEST.optionRuntimeWindows.map(
    (window) => `${window.base}:${window.len}`,
  ));
  assert.equal(optionKeys.size, 26);
  for (const window of WHITE_MANIFEST.optionRuntimeWindows) {
    assert.ok(exported.has(`${window.base}:${window.len}`),
      `missing exact exported White option window ${window.base}:${window.len}`);
  }

  const optionOverlaps = [];
  for (let i = 0; i < windows.length; i++) {
    for (let k = i + 1; k < windows.length; k++) {
      const a = windows[i];
      const b = windows[k];
      if (a.address >= b.address + b.len || b.address >= a.address + a.len) continue;
      const aIsOption = optionKeys.has(`${a.base}:${a.len}`);
      const bIsOption = optionKeys.has(`${b.base}:${b.len}`);
      if (!aIsOption && !bIsOption) continue;
      if (aIsOption && !bIsOption) optionOverlaps.push([b.address, a.address]);
      else if (bIsOption && !aIsOption) optionOverlaps.push([a.address, b.address]);
      else optionOverlaps.push([a.address, b.address].sort((x, y) => x - y));
    }
  }
  assert.deepEqual(optionOverlaps, WHITE_OPTION_OVERLAP_PAIRS);
});

test('White option capability rejects Black before cartridge access', () => {
  let reads = 0;
  const protectedRom = new Proxy({}, {
    get() {
      reads++;
      throw new Error('protected cartridge was touched');
    },
  });
  assert.throws(
    () => createWhiteStage1CombatHandlers(protectedRom, BLACK_LABEL_PROFILE),
    /White Label Stage 1 option and laser island is unavailable/,
  );
  assert.equal(reads, 0);
});

test('White strict preflights fail before beam, spark, or shot mutation', () => {
  const rom = cartridge();

  {
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    ram.setU16(WHITE_SPARK_RESOURCES.gateWidth, 1);
    ram.setU16(WHITE_SPARK_RESOURCES.p1Power, 1);
    const check = unchanged(ram);
    assert.throws(
      () => spawnBeamImpactWithResources(
        ram, rom, { tables: createWhiteShotTables(rom) },
        WHITE_BEAMS[0].blk, WHITE_BEAMS[0].impact, WHITE_SPARK_RESOURCES,
      ),
      /beam impact power is outside its five-word speed table/,
    );
    check();
  }

  {
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    ram.setU16(WHITE_SPARK_RESOURCES.p1Base + E.status, 0x8000);
    ram.setU16(WHITE_SPARK_RESOURCES.p1Base + E.selector, 2);
    ram.setU16(WHITE_SPARK_RESOURCES.count, 1);
    ram.setU16(WHITE_SPARK_RESOURCES.budget, 0x55aa);
    const check = unchanged(ram);
    assert.throws(
      () => runSparkDriverWithResources(ram, rom, {}, WHITE_SPARK_RESOURCES),
      /malformed animation identity/,
    );
    check();
  }

  {
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    const rec = WHITE_SHOT_DRIVER_RESOURCES[0].pool;
    ram.setU16(rec, 0x8000);
    ram.setU16(rec + 0x04, 0x4567);
    ram.setU16(rec + 0x26, 0);
    ram.setU16(rec + 0x28, 3);
    ram.setU16(rec + 0x2a, 0);
    ram.setU16(WHITE_SHOT.liveCount, 0x1234);
    ram.setU16(WHITE_SHOT.scrollDelta, 0x0040);
    const handlers = shotAndOptionHandlersWithResources(
      WHITE_SHOT.dispatchEntries, WHITE_SHOT_LIFECYCLE_RESOURCES,
    );
    const check = unchanged(ram);
    assert.throws(
      () => runShotPool(
        ram, rom, handlers, { tables: createWhiteShotTables(rom) },
        WHITE_SHOT_DRIVER_RESOURCES[0],
      ),
      /invalid power or formation/,
    );
    check();
  }
});

test('White shot pool preflights every live record before dispatching the first', () => {
  const rom = cartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const resources = WHITE_SHOT_DRIVER_RESOURCES[0];
  const first = resources.pool;
  const second = first + resources.stride;
  const normal = rom.u32(WHITE_SHOT_LIFECYCLE_RESOURCES.families[0].normal);
  for (const rec of [first, second]) {
    ram.setU16(rec + SHOT_RECORD.type, 0x8000);
    ram.setU16(rec + SHOT_RECORD.posX, 0x4567);
    ram.setU32(rec + SHOT_RECORD.animPtr, normal);
    ram.setU16(rec + SHOT_RECORD.animIdx, 0);
    ram.setU16(rec + SHOT_RECORD.tableIdx, 0);
    ram.setU16(rec + SHOT_RECORD.formation, 2);
    ram.setU16(rec + SHOT_RECORD.power, 0);
  }
  ram.setU16(second + SHOT_RECORD.formation, 3);
  ram.setU16(WHITE_SHOT.liveCount, 0x1234);
  ram.setU16(WHITE_SHOT.scrollDelta, 0x0040);
  const handlers = shotAndOptionHandlersWithResources(
    WHITE_SHOT.dispatchEntries, WHITE_SHOT_LIFECYCLE_RESOURCES,
  );
  const check = unchanged(ram);

  assert.throws(
    () => runShotPool(
      ram, rom, handlers, { tables: createWhiteShotTables(rom) }, resources,
    ),
    /invalid power or formation/,
  );
  check();
});

test('White spark payload preflight covers allocation heads and the beam body', () => {
  const base = cartridge();
  const payloadTail = WHITE_SPARK_RESOURCES.beamImpactTpl + 0x14;
  const corrupted = overrideRom(base, 'u16', (target, address) => {
    if (address === payloadTail) throw new RangeError('malformed spark payload tail');
    return target.u16(address);
  });
  const tables = createWhiteShotTables(base);

  for (const body of [false, true]) {
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    const beam = WHITE_BEAMS[0];
    ram.setU16(WHITE_SPARK_RESOURCES.gateWidth, 1);
    ram.setU16(WHITE_SPARK_RESOURCES.p1Power, 0);
    ram.setU16(beam.blk + 0x1a, 1);
    const check = unchanged(ram);
    assert.throws(
      () => body
        ? spawnBeamBodyWithResources(ram, corrupted, { tables }, beam.blk, WHITE_SPARK_RESOURCES)
        : spawnBeamImpactWithResources(
          ram, corrupted, { tables }, beam.blk, beam.impact, WHITE_SPARK_RESOURCES,
        ),
      /malformed spark payload tail/,
    );
    check();
  }
});

test('White spark driver accepts the largest cursor shared by its live list', () => {
  const rom = cartridge();
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const rec = WHITE_SPARK_RESOURCES.p1Base;
  ram.setU16(rec + E.status, 0x8000);
  ram.setU16(rec + E.selector, 0x000c);
  ram.setU16(rec + E.cursor, 0x008c);
  ram.setU32(rec + E.list, 0x1890fe);
  ram.setU16(WHITE_SPARK_RESOURCES.count, 1);

  const frame = runSparkDriverWithResources(ram, rom, {}, WHITE_SPARK_RESOURCES);
  assert.deepEqual(frame, { records: 1, live: 1, freed: 0 });
  assert.equal(ram.u16(rec + E.status), 0x8000);
  assert.equal(ram.u16(rec + E.cursor), 0x0088);
  assert.equal(ram.u32(rec + E.descriptor), rom.u32(0x1890fe + 0x8c));
});

test('White spark driver validates complete template payload before RAM writes', () => {
  const base = cartridge();
  const selected = base.u32(WHITE_SPARK_RESOURCES.ptrTable);
  const corrupted = overrideRom(base, 'u16', (target, address) => {
    if (address === selected + 0x06) throw new RangeError('malformed spark size payload');
    return target.u16(address);
  });
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  ram.setU16(WHITE_SPARK_RESOURCES.budget, 0x55aa);
  const check = unchanged(ram);

  assert.throws(
    () => runSparkDriverWithResources(ram, corrupted, {}, WHITE_SPARK_RESOURCES),
    /malformed spark size payload/,
  );
  check();
});

test('White Button 2 boundary is an exact guarded one-use seam', () => {
  const rom = cartridge();
  const { ram, slot } = recurringRam();
  const calls = [];
  const ctx = {
    whiteType5SubsystemHook({ call, target }) {
      calls.push([call, target]);
    },
  };

  const seam = runWhiteType5BeforeBombCall18A146(ram, rom, slot, ctx);
  assert.equal(seam.phase, 'before-bomb-call-18a146');
  assert.deepEqual(calls, [[0x18a134, 0x17e9de]]);

  let button2Calls = 0;
  button2Calls++;
  const frame = runWhiteType5AfterBombCall18A146Through144A02(
    ram, rom, slot, ctx, seam,
  );
  assert.equal(frame.phase, 'recurring');
  assert.equal(button2Calls, 1);
  assert.ok(calls.some(([call, target]) => call === 0x18a14c && target === 0x15302c));
  assert.ok(!calls.some(([call]) => call === 0x18a146),
    'the external Button 2 call remains outside the ordinary-combat composition');

  const check = unchanged(ram);
  assert.throws(
    () => runWhiteType5AfterBombCall18A146Through144A02(
      ram, rom, slot, ctx, seam,
    ),
    /exact guarded pre-bomb seam/,
  );
  check();
});

test('White RAM-backed Button 2 and inactive-owner Start reach the external seam', () => {
  const rom = cartridge();
  const cases = [
    { owner: RAM.player1, input: 0x20 },
    { owner: RAM.player2, input: 0x80 },
  ];
  for (const { owner, input } of cases) {
    const { ram, slot } = recurringRam();
    ram.setU8(owner + P.btnByte, input);
    const seam = runWhiteType5BeforeBombCall18A146(ram, rom, slot, {});
    assert.equal(seam.phase, 'before-bomb-call-18a146');
    assert.equal(ram.u8(owner + P.btnByte), input);
    if (owner === RAM.player2) assert.equal(ram.u16(RAM.player2), 0);
  }
});

test('White beam descriptor tail fails before impact or beam mutation', () => {
  const base = cartridge();
  const beam = WHITE_BEAMS[0];
  const source = 0x14ae9e;
  const corrupted = overrideRom(base, 'u16', (target, address) => {
    if (address === source + 8) throw new RangeError('malformed beam descriptor tail');
    return target.u16(address);
  });
  const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  ram.setU16(beam.blk, 0x8000);
  ram.setU16(beam.blk + 0x10, 0);
  ram.setU32(beam.blk + 0x12, source);
  ram.setU16(beam.blk + 0x18, 30);
  ram.setU16(0x80390c, 1);
  ram.setU16(0x81308c, 1);
  ram.setU16(WHITE_SPARK_RESOURCES.gateWidth, 1);
  ram.setU16(WHITE_SPARK_RESOURCES.p1Power, 0);
  const check = unchanged(ram);

  assert.throws(
    () => runBeamDrawWithResources(
      ram, { rom: corrupted, tables: createWhiteShotTables(base) },
      WHITE_BEAMS, WHITE_LASER_EDITION_RESOURCES,
    ),
    /malformed beam descriptor tail/,
  );
  check();
});

test('White beam impact preserves P1 and P2 geometry and inverted polarity', () => {
  assert.deepEqual(
    WHITE_BEAMS.map((beam) => ({
      ownerIndex: beam.ownerIndex,
      d7: beam.d7,
      segmentOwnerWord: beam.segmentOwnerWord,
      block: beam.blk,
      impact: beam.impact,
      drawBias: beam.drawBias,
    })),
    [
      {
        ownerIndex: 0, d7: 1, segmentOwnerWord: 1,
        block: 0x811f32, impact: 0x188afc, drawBias: 0x180,
      },
      {
        ownerIndex: 1, d7: 0, segmentOwnerWord: 0,
        block: 0x811f52, impact: 0x188b16, drawBias: 0,
      },
    ],
  );
  assert.deepEqual(
    WHITE_SPARK_RESOURCES.beamImpactHeads.map(
      ({ at, base, d7, power }) => ({ at, base, d7, power }),
    ),
    [
      { at: 0x188afc, base: 0x81d394, d7: 0, power: 0x810408 },
      { at: 0x188b16, base: 0x81d790, d7: 1, power: 0x81046a },
    ],
  );

  const rom = cartridge();
  for (const ownerIndex of [0, 1]) {
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    const beam = WHITE_BEAMS[ownerIndex];
    const head = WHITE_SPARK_RESOURCES.beamImpactHeads[ownerIndex];
    ram.setU16(WHITE_SPARK_RESOURCES.gateWidth, 1);
    ram.setU16(WHITE_SPARK_RESOURCES.p1Power, 0);
    ram.setU16(WHITE_SPARK_RESOURCES.p2Power, 8);
    ram.setU16(beam.blk + 2, 0x4000 + ownerIndex * 0x100);
    ram.setU16(beam.blk + 4, 0x2000 + ownerIndex * 0x100);
    ram.setU8(beam.blk + 0x1d, 0x30 + ownerIndex);
    const vectors = [];
    const exactTables = createWhiteShotTables(rom);
    const ctx = {
      tables: {
        ...exactTables,
        vector(speed, angle) {
          vectors.push([speed, angle]);
          return exactTables.vector(speed, angle);
        },
      },
    };

    assert.equal(spawnBeamImpactWithResources(
      ram, rom, ctx, beam.blk, beam.impact, WHITE_SPARK_RESOURCES,
    ), true);
    assert.equal(ram.u16(head.base + E.status) & 0x8000, 0x8000);
    const other = WHITE_SPARK_RESOURCES.beamImpactHeads[1 - ownerIndex].base;
    assert.equal(ram.u16(other + E.status), 0);
    const power = ownerIndex === 0 ? 0 : 8;
    assert.equal(vectors.length, 4, 'preflight and allocation each validate both vectors');
    assert.equal(vectors[1][0], rom.u16(WHITE_SPARK_RESOURCES.speedByPower + power));
    assert.equal(vectors[3][0], vectors[1][0]);
  }
});

test('White ordinary combat rejects every explicit or active hyper state before mutation', () => {
  const rom = cartridge();
  const cases = [
    (ram, ctx) => { ctx.whiteHyperEnabled = true; },
    (ram) => { ram.setU8(RAM.player1 + P.flags1, 1); },
    (ram) => { ram.setU8(RAM.player2 + P.flags1, 1); },
    (ram) => { ram.setU16(0x81b63e, 1); },
    (ram) => { ram.setU16(0x81b640, 1); },
    (ram) => { ram.setU16(0x81b658, 1); },
    (ram) => { ram.setU16(0x81b65a, 1); },
  ];

  for (const arm of cases) {
    const ram = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
    const slot = 0x80e240;
    const ctx = {};
    arm(ram, ctx);
    const check = unchanged(ram);
    assert.throws(
      () => runWhiteType5BeforeBombCall18A146(ram, rom, slot, ctx),
      /ordinary laser does not enable hyper/,
    );
    check();
  }
});

test('White option graph and live owner pointers require exact identities', () => {
  const mixedP1 = Object.freeze({
    ...WHITE_OPTION_BLOCKS[0], player: RAM.player2,
  });
  assert.throws(
    () => validateOptionEditionResources(
      WHITE_OPTION_EDITION_RESOURCES,
      Object.freeze([mixedP1, WHITE_OPTION_BLOCKS[1]]),
    ),
    /option owner 0 has mixed or mutable resources/,
  );

  const rom = cartridge();
  const { ram, slot } = recurringRam();
  ram.setU16(WHITE_OPTION_BLOCKS[0].opt, 0x8000);
  ram.setU16(WHITE_OPTION_BLOCKS[0].player + P.optFormation, 2);
  ram.setU16(WHITE_OPTION_BLOCKS[0].player + P.shipSel, 0);
  ram.setU16(WHITE_OPTION_BLOCKS[0].player + 0x20, 0);
  ram.setU16(WHITE_OPTION_BLOCKS[0].player + 0x22, 0);
  ram.setU32(WHITE_OPTION_BLOCKS[0].shotResources.countPointer, 0x15483e);
  const check = unchanged(ram);
  assert.throws(
    () => runWhiteType5BeforeBombCall18A146(ram, rom, slot, {}),
    /owner 0 has an invalid shot-count pointer/,
  );
  check();

  const ownerRam = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  ownerRam.setU16(WHITE_SPARK_RESOURCES.p1Power, 0);
  const ownerCheck = unchanged(ownerRam);
  assert.throws(
    () => spawnBeamImpactWithResources(
      ownerRam, rom, { tables: createWhiteShotTables(rom) },
      WHITE_BEAMS[1].blk, WHITE_BEAMS[0].impact, WHITE_SPARK_RESOURCES,
    ),
    /owner head does not match its spawner/,
  );
  ownerCheck();
});

test('White option preflight validates every declared shot-count pointer and row', () => {
  const base = cartridge();
  const roots = [0x154834, 0x15483e, 0x154848, 0x154852, 0x15485c, 0x154866];
  const reads = new Set();
  const observed = overrideRom(base, 'u16', (target, address) => {
    if (roots.some((root) => address >= root && address < root + 10)) reads.add(address);
    return target.u16(address);
  });
  {
    const { ram, slot } = recurringRam();
    const seam = runWhiteType5BeforeBombCall18A146(ram, observed, slot, {});
    assert.equal(seam.phase, 'before-bomb-call-18a146');
    for (const root of roots) {
      for (let index = 0; index < 5; index++) assert.ok(reads.has(root + index * 2));
    }
  }

  const corrupted = overrideRom(base, 'u16', (target, address) =>
    address === roots.at(-1) + 8 ? target.u16(address) ^ 1 : target.u16(address));
  const { ram, slot } = recurringRam();
  const check = unchanged(ram);
  assert.throws(
    () => runWhiteType5BeforeBombCall18A146(ram, corrupted, slot, {}),
    /White option-shot count row changed/,
  );
  check();

  const resetRam = new Ram(undefined, WHITE_LABEL_PROFILE.ramLayout);
  const resetSlot = 0x80e240;
  resetRam.setU16(WHITE_SPARK_RESOURCES.p1Base, 0x8000);
  resetRam.setU16(WHITE_SPARK_RESOURCES.count, 1);
  const resetCheck = unchanged(resetRam);
  assert.throws(
    () => runWhiteType5BeforeBombCall18A146(
      resetRam, corrupted, resetSlot, {},
    ),
    /White option-shot count row changed/,
  );
  resetCheck();
});

test('White option, beam, laser, and spark editions reject mixed resource graphs', () => {
  const mixedLaserOption = Object.freeze({
    ...WHITE_OPTION_EDITION_RESOURCES,
    laser: NATIVE_LASER_EDITION_RESOURCES,
    beams: BEAM,
  });
  const mixedLaserBlocks = Object.freeze(WHITE_OPTION_BLOCKS.map((block, ownerIndex) =>
    Object.freeze({ ...block, edition: mixedLaserOption, beam: BEAM[ownerIndex] })));
  assert.throws(
    () => validateOptionEditionResources(mixedLaserOption, mixedLaserBlocks),
    /mixed laser identity/,
  );

  const mixedBeamsOption = Object.freeze({
    ...WHITE_OPTION_EDITION_RESOURCES,
    beams: BEAM,
  });
  const mixedBeamBlocks = Object.freeze(WHITE_OPTION_BLOCKS.map((block, ownerIndex) =>
    Object.freeze({ ...block, edition: mixedBeamsOption, beam: BEAM[ownerIndex] })));
  assert.throws(
    () => validateOptionEditionResources(mixedBeamsOption, mixedBeamBlocks),
    /laser owner 0 has mixed or mutable geometry/,
  );

  const mixedSparkLaser = Object.freeze({
    ...WHITE_LASER_EDITION_RESOURCES,
    sparkResources: NATIVE_SPARK_RESOURCES,
  });
  const mixedSparkBeams = Object.freeze(WHITE_BEAMS.map((beam) =>
    Object.freeze({ ...beam, edition: mixedSparkLaser })));
  assert.throws(
    () => validateLaserEditionResources(mixedSparkLaser, mixedSparkBeams),
    /mixed shot-spark identity/,
  );
});

test('White cartridge identity mismatch is rejected before recurring combat mutation', () => {
  const base = cartridge();
  const corrupted = new Proxy(base, {
    get(target, property) {
      const value = Reflect.get(target, property, target);
      if (property !== 'u32') return typeof value === 'function' ? value.bind(target) : value;
      return (address) => address === WHITE_OPTION_EDITION_RESOURCES.templates
        ? 0 : target.u32(address);
    },
  });
  const { ram, slot } = recurringRam();
  const check = unchanged(ram);
  assert.throws(
    () => runWhiteType5BeforeBombCall18A146(ram, corrupted, slot, {}),
    /White formation-2 option template changed/,
  );
  check();
});
