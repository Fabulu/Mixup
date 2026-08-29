// Browser-local transcription of tools/gbrom.py, tools/export_assets.py, and
// tools/export_sound.py. It derives the same runtime objects from a raw 128 KiB
// Batman cartridge image without storing or requesting cartridge-derived data.

const ROM_BYTES = 131072;
const ROM_TITLE = 'BATMAN ROJ';
const NUM_LEVELS = 14;

const loc = (bank, addr) => [bank, addr];

const T = Object.freeze({
  resourceTable: loc(0, 0x0B43),
  levelResources: loc(1, 0x7C7D),
  levelMapTable: loc(3, 0x4000),
  levelCollisionTable: loc(3, 0x7A2A),
  metatileTable: loc(5, 0x4000),
  levelSubtype: loc(0, 0x1015),
  musicFresh: loc(0, 0x1023),
  musicReentry: loc(0, 0x1031),
  cameraClamp: loc(0, 0x103F),
  levelExits: loc(0, 0x286D),
  playerStart: loc(1, 0x7CED),
  hitbox: loc(0, 0x27A8),
  sine: loc(0, 0x09A2),
  slopeY: loc(0, 0x221C),
  slopeX: loc(0, 0x23B8),
  playerAnim: loc(2, 0x4D8C),
  playerTiles: loc(2, 0x5074),
  playerTilesEnd: loc(2, 0x6BB2),
  metasprite1: loc(5, 0x5F5C),
  metasprite2: loc(5, 0x736B),
  enemySpawns: loc(5, 0x46EC),
  objectSpawns: loc(5, 0x4716),
  enemyDamage: loc(1, 0x6BC1),
  levelDamageBonus: loc(1, 0x6BCE),
  batarangAnim: loc(1, 0x41B8),
  objectScripts: loc(1, 0x4B43),
  fadeBgp: loc(0, 0x0B09),
  fadeObp1: loc(0, 0x0B11),
  respawnEnemies: [loc(0, 0x32F8), loc(0, 0x32D8)],
  subsystemLevel7: [loc(5, 0x4FB0), loc(5, 0x4FC0), loc(5, 0x4FD0)],
  subsystemLevel13: loc(0, 0x3318),
  collapseCells: loc(1, 0x7BB4),
  rescueEntryY: loc(0, 0x333B),
  objectMetasprites: loc(1, 0x4AB7),
  gapTable: loc(1, 0x7E3F),
  gapLeaps: loc(1, 0x7DBC),
  enemyAnim: loc(1, 0x6891),
  introPath: loc(1, 0x7A41),
  introPoses: loc(1, 0x7A5A),
  projectiles: loc(1, 0x6CEA),
  ropeLinks: loc(1, 0x4224),
  ropeHooks: loc(1, 0x422E),
  continueScript: loc(0, 0x3328),
  attackAnim: loc(0, 0x1C1F),
  attackMsIndex: loc(0, 0x2786),
  optionsCursorY: loc(1, 0x7C5C),
  doorSteps: loc(1, 0x4D00),
  doorDebrisVelocity: loc(1, 0x4D08),
  doorSpritesLevel3: loc(1, 0x4CF4),
  doorSprites: loc(1, 0x4CF8),
  effectSprites: loc(0, 0x2807),
  deathBurstSprites: loc(0, 0x2ACF),
  deathBurstInit: loc(0, 0x2AD7),
  deathBurstPath: loc(0, 0x2AFF),
  bossExplosions: loc(1, 0x7A73),
  bossPose1: loc(1, 0x7A1D),
  bossPose2: loc(1, 0x7A2D),
  bossPoseWalk: loc(1, 0x7A3D),
  bossPoseB4: loc(1, 0x7A3F),
  stageClearPointers: loc(6, 0x611C),
  stageClearScripts: [loc(6, 0x642A), loc(6, 0x6459)],
  fadePalettes: loc(0, 0x0B09),
  scriptPointers: loc(0, 0x27E6),
  scriptBlock: loc(0, 0x27E6),
  scriptSteps: loc(0, 0x2804),
  hudBar2: loc(0, 0x100C),
});

class Rom {
  constructor(bytes) {
    if (!(bytes instanceof Uint8Array)) throw new TypeError('Batman ROM bytes must be a Uint8Array.');
    if (bytes.byteLength !== ROM_BYTES) {
      throw new Error(`Batman ROM must be exactly ${ROM_BYTES} bytes.`);
    }
    const title = String.fromCharCode(...bytes.subarray(0x134, 0x144)).replace(/\0.*$/, '');
    if (title !== ROM_TITLE) throw new Error(`Batman ROM header title must be ${ROM_TITLE}.`);
    this.data = bytes;
  }

  off(bank, addr) {
    return bank === 0 ? addr & 0x3FFF : bank * 0x4000 + (addr & 0x3FFF);
  }

  rd(bank, addr, count) {
    const start = this.off(bank, addr);
    return this.data.subarray(start, start + count);
  }

  u8(bank, addr) { return this.data[this.off(bank, addr)]; }
  u16(bank, addr) {
    const at = this.off(bank, addr);
    return this.data[at] | (this.data[at + 1] << 8);
  }
}

const s8 = (value) => value > 127 ? value - 256 : value;
const table = (rom, where, count) => Array.from(rom.rd(where[0], where[1], count));
const b64 = (bytes) => {
  if (typeof btoa === 'function') {
    let text = '';
    for (let i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
    return btoa(text);
  }
  return Buffer.from(bytes).toString('base64');
};

function vramScript(rom, where) {
  const [bank, start] = where;
  let pointer = start;
  while (rom.u8(bank, pointer) !== 0) {
    const control = rom.u8(bank, pointer + 2);
    const count = (control & 0x3F) || 0x100;
    pointer += 3 + ([1, 3].includes(control >> 6) ? 1 : count);
  }
  return table(rom, where, pointer - start + 1);
}

function loadResource(rom, index, vram = null) {
  const entry = rom.rd(0, T.resourceTable[1] + index * 3, 3);
  const bank = entry[0];
  const source = entry[1] | (entry[2] << 8);
  if (source === 0xFFFF) return null;
  const header = rom.rd(bank, source, 4);
  const dest = header[0] | (header[1] << 8);
  const length = header[2] | (header[3] << 8);
  const bytes = rom.rd(bank, source + 4, length);
  if (vram && dest >= 0x8000 && dest < 0xA000) vram.set(bytes, dest - 0x8000);
  return { bank, source, dest, length, bytes };
}

function resourceBlob(rom, index) {
  const resource = loadResource(rom, index);
  if (!resource || resource.dest < 0x8000 || resource.dest >= 0xA000) {
    throw new Error(`Batman resource ${index.toString(16)} is not a VRAM resource.`);
  }
  return { dest: resource.dest, bytes: b64(resource.bytes) };
}

function levelResourceIndices(rom, level) {
  const out = [];
  for (let i = 0; i < 8; i++) {
    const value = rom.u8(1, T.levelResources[1] + (level - 1) * 8 + i);
    if (value === 0xFF) break;
    out.push(value);
  }
  return out;
}

function levelMap(rom, level) {
  const pointer = rom.u16(3, T.levelMapTable[1] + (level - 1) * 2);
  const width = rom.u8(3, pointer);
  return { width, ids: Array.from(rom.rd(3, pointer + 1, width * 16)) };
}

function levelMetatiles(rom, level) {
  const entry = rom.rd(5, T.metatileTable[1] + (level - 1) * 4, 4);
  const length = entry[0] | (entry[1] << 8);
  const source = entry[2] | (entry[3] << 8);
  const raw = rom.rd(5, source, length);
  const out = [];
  for (let i = 0; i + 3 < raw.length; i += 4) out.push(Array.from(raw.subarray(i, i + 4)));
  return out;
}

function buildLevelData(rom, level) {
  const { width, ids } = levelMap(rom, level);
  const collisionPointer = rom.u16(3, T.levelCollisionTable[1] + (level - 1) * 2);
  const collision = rom.rd(3, collisionPointer, 256);
  const cells = new Uint8Array(ids.length * 2);
  for (let i = 0; i < ids.length; i++) {
    cells[i * 2] = ids[i];
    cells[i * 2 + 1] = collision[ids[i]];
  }
  const water = {
    5: [[0xD263, 0x0D], [0xD205, 0x10]],
    13: [[0xD41B, 5], [0xD4FB, 5], [0xD41D, 0x0C]],
  }[level] ?? [];
  for (const [address, count] of water) {
    for (let i = 0; i < count; i++) cells[address - 0xD000 + i * 0x20] = 8;
  }

  const vram = new Uint8Array(0x2000);
  for (const index of [2, 0x1D, 5, ...levelResourceIndices(rom, level)]) {
    loadResource(rom, index, vram);
  }
  return { width, cells, vram };
}

function exportMetasprites(rom, where, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const pointer = rom.u16(where[0], where[1] + i * 2);
    const sprites = [];
    for (let at = pointer, guard = 0; guard < 64; at += 4, guard++) {
      const dy = rom.u8(where[0], at);
      if (dy === 0xFF) break;
      sprites.push([s8(dy), s8(rom.u8(where[0], at + 1)),
        rom.u8(where[0], at + 2), rom.u8(where[0], at + 3)]);
    }
    out.push({ addr: pointer, sprites });
  }
  return out;
}

function playerData(rom) {
  const poolStart = rom.off(...T.playerTiles);
  const poolEnd = rom.off(...T.playerTilesEnd);
  const anims = [];
  for (let i = 0; i < 31; i++) {
    const columns = [];
    for (let column = 0; column < 3; column++) {
      const tiles = [];
      for (let tileIndex = 0; tileIndex < 4; tileIndex++) {
        const pointer = rom.u16(2, T.playerAnim[1] + i * 24 + column * 8 + tileIndex * 2);
        tiles.push(rom.off(2, pointer) - poolStart);
      }
      columns.push(tiles);
    }
    anims.push(columns);
  }
  const hitboxes = [];
  const raw = table(rom, T.hitbox, 62);
  for (let i = 0; i < 31; i++) hitboxes.push(raw.slice(i * 2, i * 2 + 2));
  return {
    manifest: { anims, tilePoolBytes: poolEnd - poolStart, hitboxes, objTileBase: 0 },
    tiles: rom.data.slice(poolStart, poolEnd),
  };
}

function readGapLeaps(rom) {
  const out = [];
  let at = rom.off(...T.gapLeaps);
  for (let i = 0; i < 14; i++) {
    if (rom.data[at] !== 0x3E || rom.data[at + 2] !== 0x32 || rom.data[at + 3] !== 0x3E) {
      throw new Error(`Batman gap leap ${i} has an unexpected opcode shape.`);
    }
    out.push([rom.data[at + 1], rom.data[at + 4]]);
    at += 5;
    if (i === 13) continue;
    if (rom.data[at] === 0xC3) at += 3;
    else if (rom.data[at] === 0x18) at += 2;
    else throw new Error(`Batman gap leap ${i} has no terminating jump.`);
  }
  return out;
}

function effectSprites(rom) {
  const out = [];
  for (let i = 0; i < 5; i++) {
    const pointer = rom.u16(0, T.effectSprites[1] + i * 2);
    out.push(table(rom, loc(0, pointer), 4));
  }
  return out;
}

function stageClearTiles(rom) {
  const out = [];
  for (let i = 0; i < 0x17; i++) {
    const pointer = rom.u16(6, T.stageClearPointers[1] + i * 2);
    out.push(...table(rom, loc(6, pointer), 0x20));
  }
  return out;
}

function coreTables(rom) {
  return {
    sine: table(rom, T.sine, 32).map(s8),
    slopeY: table(rom, T.slopeY, 0x60),
    slopeX: table(rom, T.slopeX, 0x60),
    hudBar2: table(rom, T.hudBar2, 10),
    batarangAnim: table(rom, T.batarangAnim, 8),
    scriptPtrs: Array.from({ length: 3 }, (_, i) =>
      rom.u16(0, T.scriptPointers[1] + i * 2) - 0x27E6),
    scriptData: table(rom, T.scriptBlock, 0x1E),
    scriptSteps: table(rom, T.scriptSteps, 3),
    objectScripts: table(rom, T.objectScripts, 0x4BA5 - 0x4B43),
    respawnEnemies: T.respawnEnemies.map((where) => table(rom, where, 32)),
    subsysObjects: {
      level7: T.subsystemLevel7.map((where) => table(rom, where, 16)),
      level13: table(rom, T.subsystemLevel13, 16),
    },
    collapseCells: table(rom, T.collapseCells, 0x90),
    rescueEntryY: table(rom, T.rescueEntryY, 4),
    objectMetasprites: table(rom, T.objectMetasprites, 140),
    optionsCursorY: table(rom, T.optionsCursorY, 3),
    optionsDifficulty: [0x7C69, 0x7C5F, 0x7C73].map((address) =>
      table(rom, loc(1, address), 10)),
    attackAnim: table(rom, T.attackAnim, 24),
    attackMsIndex: table(rom, T.attackMsIndex, 32),
    ropeLinks: table(rom, T.ropeLinks, 10),
    ropeHooks: table(rom, T.ropeHooks, 2),
    continueScript: vramScript(rom, T.continueScript),
    enemyAnim: table(rom, T.enemyAnim, 0x6BC1 - 0x6891),
    enemyAnimBase: 0x6891,
    introPath: table(rom, T.introPath, 25),
    introPoses: table(rom, T.introPoses, 25),
    projectileTemplates: Array.from({ length: 5 }, (_, i) =>
      table(rom, loc(1, T.projectiles[1] + i * 32), 32)),
    gapTable: table(rom, T.gapTable, 0x7F29 - 0x7E3F),
    gapLeaps: readGapLeaps(rom),
    enemyContactDamage: table(rom, T.enemyDamage, 13),
    levelDamageBonus: table(rom, T.levelDamageBonus, 14),
    doorSteps: table(rom, T.doorSteps, 8),
    doorDebrisVel: table(rom, T.doorDebrisVelocity, 70),
    doorSpritesL3: table(rom, T.doorSpritesLevel3, 4),
    doorSprites: table(rom, T.doorSprites, 8),
    effectSprites: effectSprites(rom),
    deathBurstSprites: table(rom, T.deathBurstSprites, 8),
    deathBurstInit: table(rom, T.deathBurstInit, 40),
    deathBurstPath: table(rom, T.deathBurstPath, 0x2C13 - 0x2AFF),
    bossExplosionOffsets: table(rom, T.bossExplosions, 16),
    bossDeathPose1: table(rom, T.bossPose1, 16),
    bossDeathPose2: table(rom, T.bossPose2, 16),
    bossDeathPoseWalk: table(rom, T.bossPoseWalk, 2),
    bossDeathPoseB4: table(rom, T.bossPoseB4, 2),
    stageClearTiles: stageClearTiles(rom),
    stageClearScriptA: vramScript(rom, T.stageClearScripts[0]),
    stageClearScriptB: vramScript(rom, T.stageClearScripts[1]),
    fadePalettes: table(rom, T.fadePalettes, 16),
  };
}

function levelInfo(rom, level) {
  const { width } = levelMap(rom, level);
  const enemySource = rom.u16(5, T.enemySpawns[1] + (level - 1) * 3);
  const enemyCount = rom.u8(5, T.enemySpawns[1] + (level - 1) * 3 + 2);
  const objectSource = rom.u16(5, T.objectSpawns[1] + (level - 1) * 3);
  const objectCount = rom.u8(5, T.objectSpawns[1] + (level - 1) * 3 + 2);
  return {
    level,
    width,
    height: 16,
    metatiles: levelMetatiles(rom, level),
    startX: rom.u8(1, T.playerStart[1] + (level - 1) * 2),
    startY: rom.u8(1, T.playerStart[1] + (level - 1) * 2 + 1),
    cameraClamp: rom.u8(0, T.cameraClamp[1] + level - 1),
    subtype: rom.u8(0, T.levelSubtype[1] + level - 1),
    musicFresh: rom.u8(0, T.musicFresh[1] + level - 1),
    musicReentry: rom.u8(0, T.musicReentry[1] + level - 1),
    exitRight: rom.u8(0, T.levelExits[1] + (level - 1) * 2),
    exitTop: rom.u8(0, T.levelExits[1] + (level - 1) * 2 + 1),
    resources: levelResourceIndices(rom, level),
    enemySpawns: {
      src: enemySource,
      count: enemyCount,
      records: b64(rom.rd(5, enemySource, enemyCount * 32)),
    },
    objectSpawns: {
      src: objectSource,
      count: objectCount,
      records: b64(rom.rd(5, objectSource, objectCount * 16)),
    },
  };
}

function resolveTileAnim(rom, level, sourceBase = null) {
  const destPointer = rom.u16(0, 0x31EE + (level - 1) * 2);
  if ((destPointer >> 8) === 0xFF) return null;
  const sourcePointer = sourceBase ?? rom.u16(2, 0x61A4 + (level - 1) * 2);
  if ((sourcePointer >> 8) === 0xFF) return null;
  const stepPointer = rom.u16(0, 0x3246 + (level - 1) * 2);
  const count = rom.u8(0, 0x3295 + level - 1);
  const steps = table(rom, loc(0, stepPointer), count);
  const groups = Math.max(...steps) + 1;
  const dests = Array.from({ length: groups * 2 }, (_, i) =>
    rom.u16(0, destPointer + i * 2));
  const blocks = Array.from({ length: count * 2 }, (_, i) => {
    const pointer = rom.u16(2, sourcePointer + i * 2);
    return b64(rom.rd(2, pointer, 32));
  });
  return { dests, steps, blocks };
}

function tileAnimations(rom) {
  const out = {};
  for (let level = 1; level <= NUM_LEVELS; level++) {
    const entry = resolveTileAnim(rom, level);
    if (entry) out[String(level)] = entry;
  }
  const alternate = resolveTileAnim(rom, 6, 0x625E);
  if (alternate) out['6alt'] = alternate;
  return out;
}

function titleManifest(rom) {
  return {
    tiles: [
      { dest: 0x8800, bytes: b64(rom.rd(6, 0x54B4, 1136)) },
      { dest: 0x8C70, bytes: b64(rom.rd(6, 0x5928, 1680)) },
    ],
    scripts: [loc(5, 0x52F5), loc(5, 0x5170), loc(1, 0x7C44)]
      .map((where) => b64(vramScript(rom, where))),
    fill: 0x2F,
    lcd: {
      lcdc: rom.u8(0, 0x02BC), scx: 0, scy: 0,
      wx: rom.u8(0, 0x0216), wy: rom.u8(0, 0x02A8),
      bgp: rom.u8(0, 0x0B09), obp0: rom.u8(0, 0x0B09), obp1: rom.u8(0, 0x0B11),
    },
    fadeBgp: table(rom, T.fadeBgp, 8),
    fadeObp1: table(rom, T.fadeObp1, 4),
    flashOff: b64(vramScript(rom, loc(1, 0x7C57))),
  };
}

function roundSelectManifest(rom) {
  return {
    fill: 0,
    tiles: [
      { dest: 0x8800, bytes: b64(rom.rd(6, 0x54B4, 1136)) },
      { dest: 0x9000, bytes: b64(rom.rd(6, 0x6E74, 2048)) },
    ],
    scripts: [b64(vramScript(rom, loc(6, 0x7674)))],
  };
}

function introLevelScript(rom, level) {
  const pointer = rom.u16(3, 0x7BF9 + (level - 1) * 2);
  return table(rom, loc(3, pointer + 1), rom.u8(3, pointer));
}

function stageIntroManifest(rom) {
  const resourceIds = [0x3375, 0x337A, 0x337F].map((address) => rom.u8(0, address));
  return {
    fill: rom.u8(0, 0x3370),
    tiles: resourceIds.map((index) => resourceBlob(rom, index)),
    resources: resourceIds,
    scripts: [loc(3, 0x7C15), loc(3, 0x7C4C)]
      .map((where) => b64(rom.rd(where[0], where[1], 0x37))),
    levelScripts: Object.fromEntries(Array.from({ length: NUM_LEVELS }, (_, i) =>
      [String(i + 1), b64(introLevelScript(rom, i + 1))])),
    bossScript: b64(rom.rd(0, 0x3485, 0x1F)),
    blankFrames: rom.u8(0, 0x3390),
    holdFrames: rom.u8(0, 0x345E),
    lcdc: rom.u8(0, 0x338C),
    sprite: { id: rom.u8(0, 0x3466), x: rom.u8(0, 0x3463), y: rom.u8(0, 0x3464) },
    sound: { id: rom.u8(0, 0x336B), mask: rom.u8(0, 0x336A) },
  };
}

function endingCredits(rom) {
  const pointerTable = rom.u16(0, 0x37CF);
  const count = rom.u8(0, 0x3841);
  return Array.from({ length: count }, (_, i) => {
    const pointer = rom.u16(7, pointerTable + i * 2);
    return b64(rom.rd(7, pointer + 1, rom.u8(7, pointer)));
  });
}

function endingManifest(rom) {
  const picturePointers = [0x3676, 0x36DE, 0x371E, 0x3759]
    .map((address) => rom.u16(0, address));
  const boxLength = rom.u8(0, 0x378E);
  const pointed = (address) => rom.u16(0, address);
  return {
    fill: rom.u8(0, 0x3653),
    fill4: rom.u8(0, 0x374A),
    lcdc: rom.u8(0, 0x3695),
    resources: [0x3658, 0x365D, 0x3662, 0x3667].map((address) => rom.u8(0, address)),
    tiles: [0x3658, 0x365D, 0x3662, 0x3667]
      .map((address) => resourceBlob(rom, rom.u8(0, address))),
    pictures: picturePointers.map((pointer) => b64(vramScript(rom, loc(7, pointer)))),
    theEnd: b64(vramScript(rom, loc(1, pointed(0x3866)))),
    boxOn: [0x3788, 0x37A3].map((address) =>
      b64(rom.rd(1, pointed(address), boxLength))),
    boxOff: [0x3816, 0x3828].map((address) =>
      b64(rom.rd(1, pointed(address), boxLength))),
    credits: endingCredits(rom),
    blackBgp: rom.u8(0, 0x3686),
    ramp: table(rom, loc(0, 0x3A31), 4),
    rampFrames: rom.u8(0, 0x36A7),
    blankFrames: rom.u8(0, 0x3699),
    holdFrames: rom.u8(0, 0x36BF) | (rom.u8(0, 0x36C0) << 8),
    crawlFirstWait: rom.u8(0, 0x3780),
    crawlWait: rom.u8(0, 0x3845),
    textHold: rom.u8(0, 0x37F9),
    crawlCount: rom.u8(0, 0x3841),
    tailFrames: rom.u8(0, 0x384A),
    endFrames: rom.u8(0, 0x3878),
    fades: [0x36CA, 0x36FA, 0x370A, 0x373A, 0x377B, 0x3852, 0x3880]
      .map((address) => rom.u8(0, address)),
    sprite: { id: rom.u8(0, 0x3797), x: rom.u8(0, 0x3794), y: rom.u8(0, 0x3795) },
    sound: { id: rom.u8(0, 0x36A2), mask: rom.u8(0, 0x36A1) },
  };
}

function buildManifest(rom, player) {
  /** @type {any} */
  const manifest = {
    title: 'BATMAN ROJ',
    note: 'Generated by tools/export_assets.py - do not edit by hand.',
    levelCount: NUM_LEVELS,
    levels: Array.from({ length: NUM_LEVELS }, (_, i) => levelInfo(rom, i + 1)),
  };
  manifest.player = player.manifest;
  manifest.metasprites = {
    table1: exportMetasprites(rom, T.metasprite1, 243),
    table2: exportMetasprites(rom, T.metasprite2, 105),
  };
  manifest.tables = coreTables(rom);
  manifest.roundSelect = roundSelectManifest(rom);
  manifest.stageIntro = stageIntroManifest(rom);
  manifest.ending = endingManifest(rom);
  manifest.window = {
    boot: 0x2F,
    fill: 1,
    fillDest: 0x9C40,
    fillLen: 0x03C0,
    script: b64(vramScript(rom, loc(0, 0x32A3))),
    level14: {
      fill: 1, fillDest: 0x9C00, fillLen: 0x40,
      script: b64(vramScript(rom, loc(5, 0x5276))),
    },
  };
  manifest.bgArt = [
    { levels: [9, 10, 11], rom: '7:$7A5E', script: b64(vramScript(rom, loc(7, 0x7A5E))) },
    { levels: [6], rom: '7:$7B77', script: b64(vramScript(rom, loc(7, 0x7B77))) },
  ];
  manifest.tileAnim = tileAnimations(rom);
  manifest.title = titleManifest(rom);
  return manifest;
}

export function extractBatmanSound(bytes) {
  const rom = bytes instanceof Rom ? bytes : new Rom(bytes);
  const bankBase = 0x4000;
  const pitch = Array.from({ length: 84 }, (_, i) => rom.u16(7, 0x46D5 + i * 2));
  const songs = Array.from({ length: 47 }, (_, id) => {
    const pointer = rom.u16(7, 0x477D + id * 2);
    const tracks = [];
    let at = pointer;
    while (at >= 0x4000 && at < 0x7FFC && rom.u8(7, at) !== 0xFF && tracks.length < 8) {
      tracks.push({ slot: rom.u8(7, at), chan: rom.u8(7, at + 1), ptr: rom.u16(7, at + 2) });
      at += 4;
    }
    return { id, ptr: pointer, tracks };
  });
  return {
    tickHz: 4096 / 69,
    pitch: Uint16Array.from(pitch),
    songs,
    wave: Uint8Array.from(rom.rd(7, 0x47FA, 16)),
    bank: rom.rd(7, 0x4000, 0x4000).slice(),
    bankBase,
  };
}

export function createBatmanRomProvider(bytes) {
  const rom = new Rom(bytes);
  const player = playerData(rom);
  const manifest = buildManifest(rom, player);
  const levels = new Map();
  return Object.freeze({
    soundData: extractBatmanSound(rom),
    async loadManifest() { return manifest; },
    async loadPlayerTiles() { return player.tiles; },
    async loadLevel(level) {
      if (!Number.isInteger(level) || level < 1 || level > NUM_LEVELS) {
        throw new RangeError(`Batman level must be 1-${NUM_LEVELS}.`);
      }
      if (!levels.has(level)) {
        const data = buildLevelData(rom, level);
        levels.set(level, { info: manifest.levels[level - 1], cells: data.cells, vram: data.vram });
      }
      const cached = levels.get(level);
      return { info: cached.info, cells: cached.cells.slice(), vram: cached.vram.slice() };
    },
  });
}
