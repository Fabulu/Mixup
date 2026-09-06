import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BLACK_LABEL_PROFILE,
  DEFAULT_PROFILE_ID,
  PROFILE_IDS,
  SHARED_RAM_LAYOUT,
  WHITE_LABEL_PROFILE,
  deriveProfileContext,
  resolveGameProfile,
  validateGameProfile,
} from '../src/profiles.js';
import { MACHINE, RAM, ROM, P, OPT, CLAMP, BIT } from '../src/machine.js';
import { Game } from '../src/main.js';
import { Ram } from '../src/ram.js';
import { BLACK_RUNTIME_BINDING } from '../src/runtime-profile.js';
import { OBJ } from '../src/objdriver.js';
import { tableBeforeWhiteLabel } from './romwindowset.js';

const SEED = fileURLToPath(new URL('../rip/web/seed.bin', import.meta.url));
const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const HAS_RUNTIME_FIXTURES = existsSync(SEED) && existsSync(TABLES);
const runtimeTest = (name, fn) => test(name, { skip: !HAS_RUNTIME_FIXTURES }, fn);
let runtimeFixtures = null;

function fixtures() {
  runtimeFixtures ??= {
    seedBytes: new Uint8Array(readFileSync(SEED)),
    tables: JSON.parse(readFileSync(TABLES, 'utf8')),
  };
  return runtimeFixtures;
}

function game(profile) {
  const { seedBytes, tables } = fixtures();
  return new Game(seedBytes.slice(), tables, {
    ...(profile === undefined ? {} : { profile }),
    palCatchUp: false,
  });
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) assertDeepFrozen(child, seen);
}

function firstEmptySlot(g) {
  for (let i = 0; i < OBJ.slots; i++) {
    const slot = OBJ.base + i * OBJ.stride;
    if (g.ram.u16(slot + OBJ.typeOff) === 0) return slot;
  }
  throw new Error('profile context test requires one empty object slot');
}

test('Black edition profile is trusted, data-only, and recursively frozen', () => {
  assert.equal(DEFAULT_PROFILE_ID, PROFILE_IDS.BLACK_LABEL);
  assert.equal(resolveGameProfile(), BLACK_LABEL_PROFILE);
  assert.equal(resolveGameProfile(PROFILE_IDS.BLACK_LABEL), BLACK_LABEL_PROFILE);
  assert.equal(resolveGameProfile(BLACK_LABEL_PROFILE), BLACK_LABEL_PROFILE);
  assert.equal(validateGameProfile(BLACK_LABEL_PROFILE), BLACK_LABEL_PROFILE);
  assertDeepFrozen(BLACK_LABEL_PROFILE);

  const visit = (value) => {
    if (value == null || typeof value !== 'object') {
      assert.notEqual(typeof value, 'function');
      assert.notEqual(typeof value, 'symbol');
      return;
    }
    assert.ok(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype);
    for (const child of Object.values(value)) visit(child);
  };
  visit(BLACK_LABEL_PROFILE);

  const invalid = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  invalid.progressionProfile.callback = () => {};
  assert.throws(() => validateGameProfile(invalid), /unsupported function data/);
});

test('embedded Version A profile is trusted, measured, frozen, and privately capability-bound', () => {
  assert.equal(resolveGameProfile(PROFILE_IDS.WHITE_LABEL), WHITE_LABEL_PROFILE);
  assert.equal(resolveGameProfile(WHITE_LABEL_PROFILE), WHITE_LABEL_PROFILE);
  assert.equal(validateGameProfile(WHITE_LABEL_PROFILE), WHITE_LABEL_PROFILE);
  assertDeepFrozen(WHITE_LABEL_PROFILE);

  assert.equal(WHITE_LABEL_PROFILE.revisionIdentity.build, 'A');
  assert.equal(WHITE_LABEL_PROFILE.programIdentity, BLACK_LABEL_PROFILE.programIdentity,
    'both embedded editions belong to one exact decrypted cartridge image');
  assert.equal(WHITE_LABEL_PROFILE.ramLayout, SHARED_RAM_LAYOUT,
    'independent A and B evidence identifies one exact shared RAM layout');
  assert.equal(WHITE_LABEL_PROFILE.bootProfile.resetEntry, 0x13c24e);
  assert.equal(WHITE_LABEL_PROFILE.codeLandmarks.loopHead, 0x13c356);
  assert.equal(WHITE_LABEL_PROFILE.codeLandmarks.objDriver, 0x1413f6);
  assert.deepEqual([
    WHITE_LABEL_PROFILE.codeLandmarks.playerHandlerP1,
    WHITE_LABEL_PROFILE.codeLandmarks.playerHandlerP2,
    WHITE_LABEL_PROFILE.codeLandmarks.playerUpdate,
    WHITE_LABEL_PROFILE.codeLandmarks.playerMove,
    WHITE_LABEL_PROFILE.codeLandmarks.playerTail,
  ], [0x14889e, 0x14891e, 0x148bae, 0x141b18, 0x1494f2]);
  assert.equal(WHITE_LABEL_PROFILE.objectDispatchProfile.tableAddress, 0x141294);
  assert.equal(WHITE_LABEL_PROFILE.objectDispatchProfile.entries, 21);
  assert.equal(WHITE_LABEL_PROFILE.objectDispatchProfile.slots, 20,
    'the A-only chooser adds a dispatch type, not an object slot');
  assert.equal(WHITE_LABEL_PROFILE.selectorProfile.horizontalHitbox, 0xc0);
  assert.deepEqual(WHITE_LABEL_PROFILE.selectorProfile.clamp, {
    yMax: 0x6500, yMin: 0x0800, xMin: 0x0300, xMax: 0x3500,
  });
  assert.equal(WHITE_LABEL_PROFILE.progressionProfile.loopOffer, false);
  assert.notEqual(WHITE_LABEL_PROFILE.checkpointNamespace,
    BLACK_LABEL_PROFILE.checkpointNamespace);
});

runtimeTest('generated tables retain the independent embedded Version A manifest', () => {
  const { tables } = fixtures();
  const white = tables.editions?.whiteLabel;
  assert.ok(white);
  assert.equal(white.profileId, WHITE_LABEL_PROFILE.id);
  assert.equal(white.set, WHITE_LABEL_PROFILE.revisionIdentity.set);
  assert.equal(white.build, WHITE_LABEL_PROFILE.revisionIdentity.build);
  assert.equal(white.image_sha256, WHITE_LABEL_PROFILE.programIdentity.imageSha256);
  assert.equal(white.dispatch.rom, '$141294');
  assert.equal(white.dispatch.stride, 8);
  assert.equal(white.dispatch.entries.length,
    WHITE_LABEL_PROFILE.objectDispatchProfile.entries);
  assert.deepEqual(white.dispatch.entries.at(-1), {
    handler: '$13BEEA',
    priority: 0x1e,
  });

  const exported = new Set(tables.rom.windows.map((window) => `${window.base}:${window.len}`));
  const declared = white.frontendWindows.map((window) => `${window.base}:${window.len}`);
  assert.equal(new Set(declared).size, declared.length);
  assert.ok(declared.includes('$141294:168'), 'the complete 21-entry dispatch is exported');
  assert.ok(declared.includes('$15F2C0:40'), 'the complete player request table is exported');
  assert.ok(declared.includes('$152AEE:24'), 'the SET-item tile table is exported');
  assert.ok(declared.includes('$14194A:62'), 'the Stage 1 palette list is exported');
  assert.ok(declared.includes('$125078:64'), 'the Stage 1 bank-9 palette is exported');
  assert.ok(declared.includes('$125138:64'), 'the Stage 1 bank-7/8 palette is exported');
  assert.ok(declared.includes('$15FBC2:48'), 'the rank configuration family is exported');
  assert.ok(declared.includes('$15F43C:10'), 'the starting-lives table is exported');
  assert.ok(declared.includes('$186F3C:16'), 'the first-extend threshold table is exported');
  assert.ok(declared.includes('$125B78:8928'), 'the Stage 1 column stream is exported');
  assert.ok(declared.includes('$127E58:2048'), 'the Stage 1 background palette is exported');
  for (const window of declared) assert.ok(exported.has(window), `${window} is cartridge-backed`);

  assert.deepEqual(white.hyperHudRuntimeWindows, [
    { base: '$18601E', len: 0x004c },
    { base: '$1869CC', len: 0x013c },
    { base: '$186D10', len: 0x0040 },
    { base: '$186DE4', len: 0x0020 },
    { base: '$186E64', len: 0x0020 },
    { base: '$186F0C', len: 0x0030 },
    { base: '$186F4C', len: 0x0010 },
  ]);
  for (const window of white.hyperHudRuntimeWindows) {
    assert.ok(exported.has(`${window.base}:${window.len}`));
    assert.ok(Number.parseInt(window.base.slice(1), 16) + window.len <= 0x200000);
  }
  assert.deepEqual(white.worldRuntimeWindows, [
    { base: '$121528', len: 0x0008 },
    { base: '$121530', len: 0x0018 },
    { base: '$121548', len: 0x0008 },
    { base: '$121558', len: 0x0008 },
    { base: '$121568', len: 0x0008 },
    { base: '$121580', len: 0x0008 },
    { base: '$121588', len: 0x0008 },
    { base: '$121650', len: 0x0008 },
    { base: '$121658', len: 0x0008 },
    { base: '$12180E', len: 0x0052 },
    { base: '$1218DC', len: 0x0052 },
    { base: '$1219AA', len: 0x00a2 },
    { base: '$121B10', len: 0x00ba },
    { base: '$121BCA', len: 0x009c },
    { base: '$121C66', len: 0x0040 },
    { base: '$121CA6', len: 0x0090 },
    { base: '$121D36', len: 0x0042 },
    { base: '$121D78', len: 0x00e4 },
    { base: '$121EFE', len: 0x00d2 },
    { base: '$12208A', len: 0x00d8 },
    { base: '$1222D2', len: 0x009c },
    { base: '$12236E', len: 0x0040 },
    { base: '$1223AE', len: 0x00ea },
    { base: '$122AF8', len: 0x0040 },
    { base: '$122B38', len: 0x0040 },
    { base: '$122B78', len: 0x0040 },
    { base: '$122BB8', len: 0x0040 },
    { base: '$122BF8', len: 0x0040 },
    { base: '$122C38', len: 0x0040 },
    { base: '$123338', len: 0x00c0 },
    { base: '$1250B8', len: 0x0040 },
    { base: '$1251B8', len: 0x0040 },
    { base: '$129FE0', len: 0x0004 },
    { base: '$12A044', len: 0x0004 },
    { base: '$12A0A8', len: 0x0004 },
    { base: '$12A170', len: 0x0004 },
    { base: '$12A1D4', len: 0x0004 },
    { base: '$12A238', len: 0x0004 },
    { base: '$130C6C', len: 0x1964 },
    { base: '$13DAB0', len: 0x003c },
    { base: '$13DAEC', len: 0x003c },
    { base: '$13DB28', len: 0x003c },
    { base: '$13DB64', len: 0x003c },
    { base: '$13DBA0', len: 0x000e },
    { base: '$13DF18', len: 0x007a },
    { base: '$13E21C', len: 0x003c },
    { base: '$13E2A6', len: 0x000e },
    { base: '$13E2D4', len: 0x000e },
    { base: '$13E3A4', len: 0x0012 },
    { base: '$13EADA', len: 0x0100 },
    { base: '$13EE54', len: 0x0016 },
    { base: '$13FBE4', len: 0x0016 },
    { base: '$141094', len: 0x0014 },
    { base: '$1423E8', len: 0x00f9 },
    { base: '$14289C', len: 0x0050 },
    { base: '$142EFC', len: 0x0100 },
    { base: '$143074', len: 0x0100 },
    { base: '$143192', len: 0x0080 },
    { base: '$14322E', len: 0x0100 },
    { base: '$14336A', len: 0x0100 },
    { base: '$1434C4', len: 0x0080 },
    { base: '$14359E', len: 0x0040 },
    { base: '$1435FE', len: 0x0100 },
    { base: '$1548D8', len: 0x000a },
    { base: '$16067C', len: 0x02d8 },
    { base: '$1612F4', len: 0x0004 },
    { base: '$16137C', len: 0x0014 },
    { base: '$1623B0', len: 0x0010 },
    { base: '$1668C4', len: 0x0008 },
    { base: '$1668D4', len: 0x0008 },
    { base: '$1668DC', len: 0x0008 },
    { base: '$1668E4', len: 0x0008 },
    { base: '$1668F4', len: 0x0008 },
    { base: '$166904', len: 0x0008 },
    { base: '$16690C', len: 0x0008 },
    { base: '$16691C', len: 0x0008 },
    { base: '$166924', len: 0x0008 },
    { base: '$16697C', len: 0x0008 },
    { base: '$16698C', len: 0x0008 },
    { base: '$16699C', len: 0x0020 },
    { base: '$1669BC', len: 0x0008 },
    { base: '$1669D4', len: 0x0008 },
    { base: '$166A24', len: 0x0008 },
    { base: '$166FE8', len: 0x0008 },
    { base: '$167018', len: 0x0024 },
    { base: '$16711A', len: 0x000e },
    { base: '$167128', len: 0x0008 },
    { base: '$167200', len: 0x000a },
    { base: '$16720A', len: 0x0020 },
    { base: '$16722A', len: 0x001c },
    { base: '$16750C', len: 0x0080 },
    { base: '$16760C', len: 0x0100 },
    { base: '$16770C', len: 0x0080 },
    { base: '$167876', len: 0x000a },
    { base: '$16778C', len: 0x0008 },
    { base: '$167880', len: 0x0020 },
    { base: '$1678A0', len: 0x001c },
    { base: '$167B96', len: 0x0080 },
    { base: '$167C16', len: 0x0100 },
    { base: '$167D16', len: 0x0080 },
    { base: '$1687C4', len: 0x0008 },
    { base: '$168828', len: 0x0014 },
    { base: '$168846', len: 0x0028 },
    { base: '$168986', len: 0x0230 },
    { base: '$168C2E', len: 0x0010 },
    { base: '$168C3E', len: 0x0008 },
    { base: '$168D2C', len: 0x001a },
    { base: '$168D46', len: 0x001c },
    { base: '$168EC0', len: 0x0080 },
    { base: '$168F40', len: 0x0080 },
    { base: '$168FC0', len: 0x0080 },
    { base: '$16925A', len: 0x0008 },
    { base: '$169328', len: 0x0016 },
    { base: '$16933E', len: 0x001c },
    { base: '$16952C', len: 0x0008 },
    { base: '$16962A', len: 0x0016 },
    { base: '$169640', len: 0x001c },
    { base: '$169804', len: 0x0008 },
    { base: '$1698A6', len: 0x0016 },
    { base: '$1698BC', len: 0x001c },
    { base: '$169C10', len: 0x0008 },
    { base: '$169D6E', len: 0x0016 },
    { base: '$169D84', len: 0x001c },
    { base: '$16A28C', len: 0x0072 },
    { base: '$16A4F4', len: 0x0008 },
    { base: '$16A572', len: 0x0200 },
    { base: '$16AED2', len: 0x018c },
    { base: '$16B15E', len: 0x00c6 },
    { base: '$16B224', len: 0x004a },
    { base: '$171A96', len: 0x0008 },
    { base: '$171AE4', len: 0x001c },
    { base: '$171DCE', len: 0x0080 },
    { base: '$171E4E', len: 0x0080 },
    { base: '$171ECE', len: 0x0080 },
    { base: '$171FCE', len: 0x0080 },
    { base: '$17224E', len: 0x0080 },
    { base: '$1722CE', len: 0x0080 },
    { base: '$17234E', len: 0x0100 },
    { base: '$1724CE', len: 0x0080 },
    { base: '$17254E', len: 0x0100 },
    { base: '$17264E', len: 0x0100 },
    { base: '$17274E', len: 0x0100 },
    { base: '$17284E', len: 0x0008 },
    { base: '$172976', len: 0x009e },
    { base: '$173676', len: 0x0008 },
    { base: '$173794', len: 0x0070 },
    { base: '$1737FC', len: 0x001e },
    { base: '$174866', len: 0x0008 },
    { base: '$1748E4', len: 0x0084 },
    { base: '$174E3A', len: 0x0008 },
    { base: '$174F44', len: 0x008e },
    { base: '$17547A', len: 0x002c },
    { base: '$175748', len: 0x0008 },
    { base: '$175782', len: 0x0006 },
    { base: '$175788', len: 0x001c },
    { base: '$1758BE', len: 0x0008 },
    { base: '$175900', len: 0x0004 },
    { base: '$175904', len: 0x001c },
    { base: '$176312', len: 0x0008 },
    { base: '$1763AE', len: 0x0032 },
    { base: '$17733A', len: 0x0048 },
    { base: '$177382', len: 0x0030 },
    { base: '$1773BE', len: 0x000c },
    { base: '$17D4C4', len: 0x0008 },
    { base: '$17D4D4', len: 0x0008 },
    { base: '$17D4EC', len: 0x0008 },
    { base: '$17D504', len: 0x0008 },
    { base: '$17D50C', len: 0x0008 },
    { base: '$17D514', len: 0x0008 },
    { base: '$17D51C', len: 0x0008 },
    { base: '$17DAAA', len: 0x0004 },
    { base: '$17DACC', len: 0x0010 },
    { base: '$17E532', len: 0x00cc },
    { base: '$17E7F8', len: 0x0004 },
    { base: '$17E804', len: 0x0004 },
    { base: '$17E80C', len: 0x0004 },
    { base: '$17E818', len: 0x001a },
    { base: '$17EDA6', len: 0x0028 },
    { base: '$17EDCE', len: 0x0028 },
    { base: '$17EDF6', len: 0x009c },
    { base: '$17FED2', len: 0x0004 },
    { base: '$17FED6', len: 0x0004 },
    { base: '$17FF0E', len: 0x0004 },
    { base: '$17FF34', len: 0x0016 },
    { base: '$17FF4A', len: 0x0016 },
    { base: '$17FFB8', len: 0x00a8 },
    { base: '$180358', len: 0x0014 },
    { base: '$18061E', len: 0x0004 },
    { base: '$180622', len: 0x0008 },
    { base: '$18062A', len: 0x0004 },
    { base: '$18062E', len: 0x0004 },
    { base: '$18065E', len: 0x0004 },
    { base: '$180A0C', len: 0x0010 },
    { base: '$180A20', len: 0x0010 },
    { base: '$180A34', len: 0x0010 },
    { base: '$180A48', len: 0x0012 },
    { base: '$180A5C', len: 0x0010 },
    { base: '$180AC0', len: 0x0010 },
    { base: '$180B24', len: 0x0010 },
    { base: '$18692E', len: 0x0008 },
    { base: '$187B2C', len: 0x0014 },
    { base: '$187D86', len: 0x0004 },
    { base: '$18830C', len: 0x0010 },
    { base: '$188338', len: 0x0008 },
    { base: '$18834C', len: 0x0010 },
    { base: '$18835C', len: 0x0080 },
    { base: '$1883DC', len: 0x0010 },
    { base: '$1883EC', len: 0x0080 },
    { base: '$18847C', len: 0x0080 },
    { base: '$18850C', len: 0x0080 },
    { base: '$18859C', len: 0x0080 },
    { base: '$188762', len: 0x0014 },
    { base: '$18892A', len: 0x0004 },
    { base: '$188932', len: 0x0004 },
    { base: '$188962', len: 0x001c },
    { base: '$18899A', len: 0x001c },
    { base: '$1889E6', len: 0x0030 },
    { base: '$188A46', len: 0x0030 },
    { base: '$1897AE', len: 0x041c },
    { base: '$189BCA', len: 0x006a },
    { base: '$1910C6', len: 0x0008 },
    { base: '$1911EA', len: 0x0010 },
    { base: '$1911FA', len: 0x00fc },
    { base: '$191326', len: 0x0020 },
    { base: '$1913DC', len: 0x0020 },
    { base: '$1913FC', len: 0x0080 },
    { base: '$19147C', len: 0x0080 },
    { base: '$19156E', len: 0x0080 },
    { base: '$19161E', len: 0x01e0 },
    { base: '$191826', len: 0x000c },
    { base: '$1918BE', len: 0x0080 },
    { base: '$191978', len: 0x0180 },
    { base: '$191AF8', len: 0x0048 },
    { base: '$191E6E', len: 0x0020 },
    { base: '$191F44', len: 0x0020 },
    { base: '$192080', len: 0x0020 },
    { base: '$1920F6', len: 0x00a8 },
    { base: '$1924DA', len: 0x0062 },
    { base: '$19253C', len: 0x0032 },
    { base: '$19271E', len: 0x0062 },
    { base: '$192780', len: 0x0032 },
    { base: '$192B8C', len: 0x0020 },
    { base: '$192BAC', len: 0x0062 },
    { base: '$192C0E', len: 0x0032 },
    { base: '$192C40', len: 0x0100 },
    { base: '$192D40', len: 0x0062 },
    { base: '$192F9E', len: 0x0008 },
    { base: '$192FA6', len: 0x0008 },
    { base: '$192FAE', len: 0x0010 },
    { base: '$1939C0', len: 0x0038 },
    { base: '$193A22', len: 0x0038 },
    { base: '$193D1E', len: 0x0006 },
    { base: '$1940B0', len: 0x0020 },
    { base: '$1942A2', len: 0x0078 },
    { base: '$19431E', len: 0x0020 },
    { base: '$194410', len: 0x0020 },
    { base: '$1944BA', len: 0x0010 },
    { base: '$19481E', len: 0x003c },
    { base: '$194AC6', len: 0x0008 },
    { base: '$194D8E', len: 0x0020 },
    { base: '$195034', len: 0x0010 },
    { base: '$1950BC', len: 0x0010 },
    { base: '$1950CC', len: 0x0010 },
    { base: '$1957B8', len: 0x0008 },
    { base: '$1957F2', len: 0x001c },
    { base: '$19599E', len: 0x0040 },
    { base: '$1959DE', len: 0x0008 },
    { base: '$195A28', len: 0x001c },
    { base: '$195B0E', len: 0x0040 },
  ]);
  for (const window of white.worldRuntimeWindows) {
    assert.ok(exported.has(`${window.base}:${window.len}`));
    assert.ok(Number.parseInt(window.base.slice(1), 16) + window.len <= 0x200000);
  }
  assert.deepEqual(white.stage1Type0D, {
    helpers: {
      start: '$16A1FC', end: '$16A4F4',
      sha256: 'ba2987fd694cb37d4744bc6443417c54e354fc8f49954b818981aa4af3309510',
    },
    init: {
      start: '$16A4F4', end: '$16A772',
      sha256: '1707ab8741cdfa53a8a7024e9b59fa10c77b65c2fa2241e9334ae70fdfa61c50',
    },
    handler: {
      start: '$16A772', end: '$16B05E',
      sha256: '6d7f753fed5d621e96a8ba7b83121201dba62c114683a55025a6f9efac04e882',
    },
    animationList: {
      start: '$16B15E', end: '$16B224',
      sha256: '786e2d5bb3c62d497996e6ab2477d839ab184e927f2c78d2995e1d96cabf7102',
    },
    type1CInit: {
      start: '$16B224', end: '$16B26E',
      sha256: 'afad6a3cb03d91b2766bec3978c767ff06af1a11c1afa4da8b6eee029a764e00',
    },
    type1CHandler: {
      start: '$16B26E', end: '$16B2C8',
      sha256: 'a842eba7976b281f1ffcd8dfb7abd52f8f38ec602b6377804ab071e21bbd7d21',
    },
  });
  assert.deepEqual(white.stage1Type08, {
    init: {
      start: '$16952C', end: '$16965C',
      sha256: '1c722f8e7a4b1a187bcd2d61cf70628aaaa12762ab5df2d4c25e216e82064ac7',
    },
    handler: {
      start: '$16965C', end: '$169804',
      sha256: '74c6e466a777e1bde99b104bf3273df03cdc9ad1761efb73675fa7ec8e4a93b3',
    },
  });
  assert.deepEqual(white.stage1Type09, {
    init: {
      start: '$169804', end: '$1698D8',
      sha256: 'fd0daf32b411dac85eb2581b6bb45f13ea969a800fb7ce9404397be837ea7f92',
    },
    handler: {
      start: '$1698D8', end: '$169A40',
      sha256: '1a3ebad7c89aacd72fed85ecaf740add68358e04016e4092b51776cb034659d2',
    },
  });
  assert.deepEqual(white.stage1Type0B, {
    init: {
      start: '$169C10', end: '$169DA0',
      sha256: '09a0806425dbfadaa971aa1fd4cbb7041e1845fd9b85e44081c2da008a5af0df',
    },
    handler: {
      start: '$169DA0', end: '$169F9E',
      sha256: '469b8995d477c8dda9c1078290c761781a7daa0474ed46e045b290c9c847e4b4',
    },
  });
  assert.deepEqual(white.stage1Type24, {
    init: {
      start: '$1959DE', end: '$195A42',
      sha256: 'fb397f6e7ae41fadb713880902857925b8209f910900840060383e04abbc0b41',
    },
    handler: {
      start: '$195A42', end: '$195B0E',
      sha256: '9b0c498bdb4ac423f98908975732d06775dead684f4bcc7597a307da3814679b',
    },
  });
  assert.deepEqual(white.stage1Type31, {
    init: {
      start: '$1687C4', end: '$16886E',
      sha256: '91a2098c93051d8e0a93ba8cd6eea80653bafb7d2c0d4f10b5c0acd436965563',
    },
    handler: {
      start: '$16886E', end: '$168986',
      sha256: '9f55845d8135fff1a5265254d3c5bf311bbc5f7da8ed91d209ffa4cedc9e7a54',
    },
  });
  assert.deepEqual(white.stage1Type82, {
    init: {
      start: '$173676', end: '$17381A',
      sha256: '32a2859d0e0c79a09c0e8e5569b516cea97470865a271800ff0a0f974d4b9f9b',
    },
    handler: {
      start: '$17381A', end: '$173BC0',
      sha256: 'c871a325f02618695ad45556fb92121229d0220176cd9b0546495f14f6725b65',
    },
  });
  assert.deepEqual(white.stage1Type88, {
    init: {
      start: '$174E3A', end: '$174FD2',
      sha256: '5e7ff6ebd4ecb64e5f8800791412767443431855a2a27244129b2a1e12de85fd',
    },
    handler: {
      start: '$174FD2', end: '$17547A',
      sha256: '11be73a632a6fdb1d2bbed7f93741a2b21cf4ee19cffb817f2fa236518502efb',
    },
  });
  assert.deepEqual(white.stage1Type89, {
    init: {
      start: '$176312', end: '$1763E0',
      sha256: 'c173ffefab1a57da8b6a1007f42565a636a4a5bce0e1e9621202b586ca4bfae1',
    },
    handler: {
      start: '$1763E0', end: '$1765B4',
      sha256: '447b057b4dd401052b5c0b178370968f9116836c59bdb71f71dea012c29cec97',
    },
  });
  assert.deepEqual(white.stage1Type8B, {
    init: {
      start: '$1758BE', end: '$175920',
      sha256: '2153ba01d77c266125445cb4f4206763e7a1f54ee5c7a5e44e2dec5bc4169eb3',
    },
    handler: {
      start: '$175920', end: '$1759E0',
      sha256: '9b78e8e623df459e8ff7a3ab4d0948d59dd199c37b60a4f70219bba6c189bc6b',
    },
  });
  assert.deepEqual(white.hyperHud.object, {
    entry: '$18C046', init: '$18C028', destroy: '$18C038',
    priority: 0x09, killTarget: '$1415CC', aliveFlag: '$81B6F0',
    stateOffset: 0x02, idOffset: 0x4c,
  });
  assert.deepEqual(white.hyperHud.frame, {
    entry: '$1830AC', cursorA: '$184BE4', cursorB: '$184BAC',
    slide: '$183950', step: ['$18466C', '$184796'], postTail: '$1830C6',
  });
  assert.deepEqual(white.hyperHud.hyper, {
    end: ['$18474C', '$184876'],
    conversion: ['$15286C', '$152886'],
    endReset: ['$1528A8', '$1528B6'],
    pendingFlush: ['$1860F2', '$186154'],
    powerCap: 0x0f,
    endFlashActiveTest: ['$81B63E', '$81B63E'],
  });
  assert.deepEqual(white.hyperHud.flash, {
    frameTable: '$18601E', emitter: '$140DA8',
    init: ['$185E62', '$185F40'], live: ['$185E7E', '$185F5C'],
    end: ['$185EEA', '$185FC8'],
  });
  assert.equal(white.hyperHud.soundPost, '$18B19E');
});

runtimeTest('embedded Version A projection reconstructs the exact legacy Black ledger', () => {
  const { tables } = fixtures();
  const legacy = tableBeforeWhiteLabel(tables);
  assert.deepEqual([
    legacy.rom.windows.length,
    legacy.rom.windows.reduce((sum, window) => sum + window.len, 0),
    Object.hasOwn(legacy, 'profileId'),
    Object.hasOwn(legacy, 'editions'),
  ], [950, 457529, false, false]);
  assert.deepEqual(tableBeforeWhiteLabel(legacy), legacy,
    'the exact legacy projection is idempotent');

  const missingBlackAnimation = JSON.parse(JSON.stringify(tables));
  missingBlackAnimation.rom.windows = missingBlackAnimation.rom.windows.filter((window) =>
    window.base !== '$26C0FC');
  assert.throws(() => tableBeforeWhiteLabel(missingBlackAnimation),
    /Task #277 Black animation window is missing/);

  const partial = JSON.parse(JSON.stringify(tables));
  const omitted = partial.editions.whiteLabel.playerWindows[0];
  partial.rom.windows = partial.rom.windows.filter((window) =>
    window.base !== omitted.base || window.len !== omitted.len);
  assert.throws(() => tableBeforeWhiteLabel(partial), /partially present or duplicated/);

  const duplicate = JSON.parse(JSON.stringify(tables));
  duplicate.rom.windows.push(JSON.parse(JSON.stringify(duplicate.rom.windows.find((window) =>
    window.base === omitted.base && window.len === omitted.len))));
  assert.throws(() => tableBeforeWhiteLabel(duplicate), /partially present or duplicated/);

  const mislabeled = JSON.parse(JSON.stringify(tables));
  const first = mislabeled.editions.whiteLabel.frontendWindows[0];
  mislabeled.rom.windows.find((window) =>
    window.base === first.base && window.len === first.len).why = 'not Version A evidence';
  assert.throws(() => tableBeforeWhiteLabel(mislabeled), /not the exact embedded Version A window/);
});

runtimeTest('Black runtime excludes every embedded Version A-only ROM window', () => {
  const { seedBytes, tables } = fixtures();
  const descriptors = [
    ...tables.editions.whiteLabel.frontendWindows,
    ...tables.editions.whiteLabel.worldRuntimeWindows,
    ...tables.editions.whiteLabel.hyperHudRuntimeWindows,
    ...tables.editions.whiteLabel.playerWindows,
    ...tables.editions.whiteLabel.shotProducerWindows,
    ...tables.editions.whiteLabel.shotRuntimeWindows,
    ...tables.editions.whiteLabel.shotSpeedWindows,
    ...tables.editions.whiteLabel.optionRuntimeWindows,
    ...tables.editions.whiteLabel.bulletRuntimeWindows,
    ...tables.editions.whiteLabel.bulletSpeedWindows,
    ...tables.editions.whiteLabel.button2RuntimeWindows,
  ];
  const excluded = new Set(descriptors.map(({ base, len }) =>
    `${Number.parseInt(base.slice(1), 16)}:${len}`));
  const g = game();
  const live = new Set(g.rom.windows.map(({ base, len }) => `${base}:${len}`));

  assert.equal(excluded.size, 973);
  assert.equal(tables.rom.windows.length, 1927,
    'runtime projection does not mutate the complete exported table');
  assert.deepEqual([g.rom.windows.length, g.rom.byteCount], [954, 457797]);
  for (const key of excluded) assert.equal(live.has(key), false, `${key} stays edition-private`);

  for (const privateWindow of [
    tables.editions.whiteLabel.playerWindows[0],
    tables.editions.whiteLabel.shotProducerWindows[0],
    tables.editions.whiteLabel.optionRuntimeWindows[2],
    tables.editions.whiteLabel.button2RuntimeWindows[0],
  ]) {
    const address = Number.parseInt(privateWindow.base.slice(1), 16);
    assert.throws(() => g.rom.u8(address), (error) => error?.romAddress === address,
      'a Black route cannot read private Version A player, shot, option, or Button 2 data');
  }

  const playerOnly = tables.editions.whiteLabel.playerWindows[0];
  const address = Number.parseInt(playerOnly.base.slice(1), 16);

  const partial = JSON.parse(JSON.stringify(tables));
  partial.rom.windows = partial.rom.windows.filter((window) =>
    window.base !== playerOnly.base || window.len !== playerOnly.len);
  assert.throws(
    () => new Game(seedBytes.slice(), partial, { palCatchUp: false }),
    /resolves to 0 embedded ROM windows instead of one/,
    'a malformed edition manifest cannot silently alter the runtime projection',
  );
});

test('profile validation is order-independent but rejects incomplete or hidden data', () => {
  const clone = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  const reordered = Object.fromEntries(Object.entries(clone).reverse());
  assert.equal(validateGameProfile(reordered), reordered);

  const incomplete = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  incomplete.bootProfile = null;
  assert.throws(() => validateGameProfile(incomplete), /profile\.bootProfile/);

  const hidden = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  Object.defineProperty(hidden, 'hidden', { value: 1 });
  assert.throws(() => validateGameProfile(hidden), /enumerable profile data/);

  let subclassCalls = 0;
  class ExecutableArray extends Array {
    some() {
      subclassCalls++;
      return false;
    }
  }
  const subclassed = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  subclassed.programIdentity.buildARegion = ExecutableArray.from(
    subclassed.programIdentity.buildARegion,
  );
  assert.throws(() => validateGameProfile(subclassed), /non-plain object/);
  assert.equal(subclassCalls, 0);
});

test('forged profile accessors are rejected without executing their getter', () => {
  let calls = 0;
  const forged = {};
  Object.defineProperty(forged, 'id', {
    enumerable: true,
    get() {
      calls++;
      return PROFILE_IDS.BLACK_LABEL;
    },
  });
  assert.throws(() => resolveGameProfile(forged), /must not be an accessor/);
  assert.equal(calls, 0);
});

test('derived handler contexts preserve immutable hidden edition identity', () => {
  const source = { tables: {}, unportedLog: {} };
  Object.defineProperty(source, 'profile', { value: BLACK_LABEL_PROFILE });
  Object.defineProperty(source, 'runtime', { value: BLACK_RUNTIME_BINDING });
  const derived = deriveProfileContext(source, { unported: source.unportedLog });
  assert.equal(derived.profile, BLACK_LABEL_PROFILE);
  assert.equal(derived.runtime, BLACK_RUNTIME_BINDING);
  assert.equal(Object.keys(derived).includes('profile'), false);
  assert.equal(Object.keys(derived).includes('runtime'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(derived, 'profile'), {
    value: BLACK_LABEL_PROFILE,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  assert.deepEqual(Object.getOwnPropertyDescriptor(derived, 'runtime'), {
    value: BLACK_RUNTIME_BINDING,
    writable: false,
    enumerable: false,
    configurable: false,
  });
});

test('legacy machine exports preserve exact Black values, order, descriptors, and mutability', () => {
  const expected = [
    [MACHINE, {
      set: BLACK_LABEL_PROFILE.revisionIdentity.set,
      build: BLACK_LABEL_PROFILE.revisionIdentity.build,
      ...SHARED_RAM_LAYOUT.machine,
    }],
    [RAM, SHARED_RAM_LAYOUT.addresses],
    [P, SHARED_RAM_LAYOUT.playerFields],
    [OPT, SHARED_RAM_LAYOUT.optionFields],
    [ROM, BLACK_LABEL_PROFILE.codeLandmarks],
    [CLAMP, BLACK_LABEL_PROFILE.selectorProfile.clamp],
    [BIT, BLACK_LABEL_PROFILE.bootProfile.inputBits],
  ];
  for (const [legacy, profileValue] of expected) {
    assert.deepEqual(legacy, profileValue);
    assert.notEqual(legacy, profileValue);
    assert.equal(Object.isFrozen(legacy), false);
    for (const key of Object.keys(legacy)) {
      const descriptor = Object.getOwnPropertyDescriptor(legacy, key);
      assert.equal(descriptor.writable, true);
      assert.equal(descriptor.enumerable, true);
      assert.equal(descriptor.configurable, true);
    }
  }
  assert.notEqual(ROM.isr6Gated, BLACK_LABEL_PROFILE.codeLandmarks.isr6Gated);
  assert.equal(Object.isFrozen(ROM.isr6Gated), false);
  assert.deepEqual(Object.keys(MACHINE), [
    'set', 'build', 'refreshHz', 'frameNs', 'cyclesPerFrame', 'ramBase', 'ramSize',
  ]);

  const fingerprints = {
    MACHINE: '8b194adb4d75447ac7822b6b463b563abaf8cb7230607570e1ad826f320c24a4',
    RAM: '1a32b8bd1fa2af37f73aaaa9472380c44d0a17a6ba0cf711304dcd1b04b5686a',
    ROM: '7ea3b9e9c77fee9075cd01e97238071d1bdcdc6228673ac6a2bbc1b88b105432',
    P: 'de4ea3b184799a8846d111fcef86a999f2f174fdc2af5fa2b3b214659cfe132c',
    OPT: 'ff7c739886201b26b3f4e75a9f48092bcc21b83459114d008b793031c1d616c6',
    CLAMP: '6e5f426ce5df52842ae6a68098967c6e60f1db025fc34577dedb3d516ac6d681',
    BIT: '5e4d51a88ad5732ea5b089739510eb7807780013bfab57ab1bdb2a7354c002da',
  };
  for (const [name, value] of Object.entries({ MACHINE, RAM, ROM, P, OPT, CLAMP, BIT })) {
    const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex');
    assert.equal(digest, fingerprints[name], `${name} compatibility fingerprint`);
  }

  const oldRank = RAM.rank;
  const oldGate = ROM.isr6Gated[0];
  try {
    RAM.rank = 0;
    ROM.isr6Gated[0] = 0;
    assert.equal(SHARED_RAM_LAYOUT.addresses.rank, oldRank);
    assert.equal(BLACK_LABEL_PROFILE.codeLandmarks.isr6Gated[0], oldGate);
  } finally {
    RAM.rank = oldRank;
    ROM.isr6Gated[0] = oldGate;
  }
});

test('Game rejects unknown and forged profiles before reading seed or tables', () => {
  let reads = 0;
  const untouched = new Proxy({}, {
    get() {
      reads++;
      throw new Error('constructor touched protected input');
    },
  });
  assert.throws(
    () => new Game(untouched, untouched, { profile: 'ddpdoj/white-label/a' }),
    /Game construction is unavailable for this DaiOuJou edition runtime/,
  );
  assert.equal(reads, 0);

  const forged = JSON.parse(JSON.stringify(BLACK_LABEL_PROFILE));
  assert.throws(
    () => new Game(untouched, untouched, { profile: forged }),
    /unregistered DaiOuJou edition profile ddpdoj\/black-label\/b/,
  );
  assert.equal(reads, 0);

  assert.throws(
    () => new Game(untouched, {
      set: 'ddpdojblk',
      build: 'A',
      image_sha256: BLACK_LABEL_PROFILE.programIdentity.imageSha256,
    }, { profile: BLACK_LABEL_PROFILE }),
    /tables do not match edition profile ddpdoj\/black-label\/b/,
  );
  assert.equal(reads, 0);
});

runtimeTest('Game binds one immutable non-enumerable edition identity before RAM construction', () => {
  const g = game();
  assert.equal(g.profile, BLACK_LABEL_PROFILE);
  assert.equal(g.runtime, BLACK_RUNTIME_BINDING);
  assert.equal(g.ram.ramLayout, BLACK_LABEL_PROFILE.ramLayout);
  assert.equal(Object.keys(g).includes('profile'), false);
  assert.equal(Object.keys(g).includes('runtime'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(g, 'profile'), {
    value: BLACK_LABEL_PROFILE,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  assert.deepEqual(Object.getOwnPropertyDescriptor(g, 'runtime'), {
    value: BLACK_RUNTIME_BINDING,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  assert.throws(() => { g.profile = null; }, TypeError);
  assert.throws(() => { g.runtime = null; }, TypeError);
});

test('Ram clone preserves bytes and the exact immutable layout identity', () => {
  const bytes = new Uint8Array(MACHINE.ramSize);
  bytes[0] = 0x12;
  bytes[bytes.length - 1] = 0x34;
  const ram = new Ram(bytes);
  const clone = ram.clone();

  assert.equal(ram.ramLayout, BLACK_LABEL_PROFILE.ramLayout);
  assert.equal(clone.ramLayout, ram.ramLayout);
  assert.deepEqual(clone.b, ram.b);
  assert.notEqual(clone.b, ram.b);
  assert.equal(Object.keys(ram).includes('ramLayout'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(ram, 'ramLayout'), {
    value: BLACK_LABEL_PROFILE.ramLayout,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  assert.throws(() => { clone.ramLayout = null; }, TypeError);
});

runtimeTest('ported handler context carries the same edition identity without changing keys', () => {
  const g = game();
  const type = 0x33;
  assert.equal(g.handlers.has(type), false);
  let captured = null;
  g.handlers.set(type, (_ram, _slot, _index, ctx) => { captured = ctx; });
  const slot = firstEmptySlot(g);
  for (let i = 0; i < OBJ.stride; i++) g.ram.setU8(slot + i, 0);
  g.ram.setU16(slot + OBJ.typeOff, type);

  g.step(0);

  assert.ok(captured);
  assert.equal(captured.profile, g.profile);
  assert.equal(captured.runtime, g.runtime);
  assert.equal(Object.hasOwn(captured, 'profile'), true);
  assert.equal(Object.hasOwn(captured, 'runtime'), true);
  assert.equal(Object.keys(captured).includes('profile'), false);
  assert.equal(Object.keys(captured).includes('runtime'), false);
  assert.deepEqual(Object.getOwnPropertyDescriptor(captured, 'profile'), {
    value: BLACK_LABEL_PROFILE,
    writable: false,
    enumerable: false,
    configurable: false,
  });
  assert.deepEqual(Object.getOwnPropertyDescriptor(captured, 'runtime'), {
    value: BLACK_RUNTIME_BINDING,
    writable: false,
    enumerable: false,
    configurable: false,
  });
});

runtimeTest('default and explicit Black construction remain deterministic', () => {
  const implicit = game();
  const explicit = game(BLACK_LABEL_PROFILE);
  assert.deepEqual(explicit.ram.b, implicit.ram.b);
  assert.deepEqual([...explicit.handlers.keys()], [...implicit.handlers.keys()]);

  implicit.step(0);
  explicit.step(0);

  assert.deepEqual(explicit.ram.b, implicit.ram.b);
  assert.equal(explicit.logicFrame, implicit.logicFrame);
  assert.equal(explicit.videoFrame, implicit.videoFrame);
  assert.deepEqual(explicit.frameRequests, implicit.frameRequests);
  assert.deepEqual(explicit.unportedLog.report(), implicit.unportedLog.report());
});
