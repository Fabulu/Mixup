import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  assertReplayCompatible, createModState, resolveLoadout,
} from '../../games/ddpdoj/src/mods.js';
import {
  assertFormationReplayCompatible, createFormationState, FORMATION_MODE,
} from '../../games/ddpdoj/src/formation.js';
import {
  authenticP2Joined, latchAuthenticP2Joined, localReplaySeedArm,
  localReplayTables, localReplayTablesMatch,
} from '../src/ddpdoj-local-state.js';

test('local touch ownership opens only for the cartridge two-player count', () => {
  assert.equal(authenticP2Joined(0xffff), false,
    'no active player is not an authentic P2 join');
  assert.equal(authenticP2Joined(0), false,
    'one-player play keeps the touch panel on P1');
  assert.equal(authenticP2Joined(1), true,
    'the cartridge two-player count enables authentic P2 touch ownership');
});

test('formation companions never count as authentic P2', () => {
  assert.equal(authenticP2Joined(1, { mode: 'formation' }), false,
    'a private P1-owned formation cannot unlock the P2 touch panel');
});

test('an authentic P2 join stays latched for the runtime', () => {
  assert.equal(latchAuthenticP2Joined(false, 1), true,
    'the cartridge two-player state opens P2 ownership');
  assert.equal(latchAuthenticP2Joined(true, 0), true,
    'P2 death or continue does not revoke an established join');
  assert.equal(latchAuthenticP2Joined(false, 1, { mode: 'formation' }), false,
    'formation state never creates an authentic P2 join');
});

test('local replay tables omit packaged cartridge windows without mutating runtime tables', () => {
  const tables = { code: [1, 2, 3], rom: { program: 'packaged-window' } };
  const replayTables = localReplayTables(tables);

  assert.deepEqual(replayTables, { code: [1, 2, 3] });
  assert.equal(Object.hasOwn(replayTables, 'rom'), false,
    'a Mixup-local replay must not serialize cartridge ROM windows');
  assert.equal(tables.rom.program, 'packaged-window',
    'sanitizing a replay seed must not alter the active runtime tables');
});

test('local replay tables accept the valid legacy asset-backed schema safely', async () => {
  const path = new URL(
    '../../games/ddpdoj/tools/oracle/out/w69/fly-around/fly-around.lf2000-2250.replay',
    import.meta.url,
  );
  const replay = JSON.parse(await readFile(path, 'utf8'));
  const legacy = JSON.parse(Buffer.from(replay.seed.tablesB64, 'base64').toString('utf8'));
  const trusted = structuredClone(localReplayTables(legacy));

  for (const key of ['_note', 'knockback', 'shot', 'option']) delete trusted[key];
  delete trusted.speed.quadBase;
  delete trusted.speed.quadStride;
  trusted.speed.exported.push(69);
  trusted.speed.quads['69'] = structuredClone(trusted.speed.quads['68']);
  trusted.anim.a.shipSel2 = structuredClone(trusted.anim.a.shipSel0);
  trusted.anim.hitX.reads = '$249E68/$249E72/$2459E4/$2459E8';

  assert.equal(localReplayTablesMatch(legacy, trusted), true,
    'legacy metadata, sparse speeds, and an absent Type-B row remain compatible');

  const malformed = structuredClone(legacy);
  delete malformed.dirTable.bytes;
  assert.equal(localReplayTablesMatch(malformed, trusted), false,
    'a malformed replay table cannot replace trusted local simulation data');

  const altered = structuredClone(legacy);
  altered.speed.quads['0'][0][0]++;
  assert.equal(localReplayTablesMatch(altered, trusted), false,
    'altered supplied simulation data cannot claim the selected ROM identity');

  const invalidTypeB = structuredClone(trusted);
  invalidTypeB.anim.a.shipSel2 = null;
  assert.equal(localReplayTablesMatch(invalidTypeB, trusted), false,
    'a supplied Type-B row cannot bypass validation with null');
});

test('local replay seeds preserve the armed slowdown semaphore', () => {
  const ram = new Uint8Array(8);
  ram[3] = 2;
  assert.equal(localReplaySeedArm({ arm: 2 }, ram, 3), 2,
    'a Mixup-local replay carries its explicit next-frame slowdown');
  assert.equal(localReplaySeedArm({}, ram, 3), 2,
    'an older replay recovers slowdown from its RAM semaphore');
  ram[3] = 0;
  assert.equal(localReplaySeedArm({}, ram, 3), 1,
    'an older pre-arm seed keeps the historical one-vblank default');
  assert.equal(localReplaySeedArm({ arm: 0 }, ram, 3), 0,
    'a modern cold-fallthrough seed preserves its explicit zero arm');
  assert.throws(() => localReplaySeedArm({ arm: 2 }, ram, 3),
    /does not match its RAM semaphore/,
    'an explicit seed arm cannot contradict the replay RAM');
});

test('local runtime uses the measured PGM period and shared dual-clock cadence', async () => {
  const source = await readFile(new URL('../src/ddpdoj-local.js', import.meta.url), 'utf8');
  assert.match(source, /const BASE_FRAME_MS = 1000 \/ MACHINE\.refreshHz;/,
    'Mixup must use the same exact display clock as the packaged runtime');
  assert.doesNotMatch(source, /const BASE_FRAME_MS = 1000 \/ 60;/,
    'the rounded 60 Hz clock runs DaiOuJou at the wrong rate');
  assert.match(source, /import \{ DdpdojCadence \} from '\/games\/ddpdoj\/src\/cadence\.js';/);
  assert.match(source, /this\.cadence = new DdpdojCadence\(BASE_FRAME_MS\);/);
  assert.match(source,
    /BASE_FRAME_MS \* transformCartridgeSlowdown\(\s*this\.modState, this\.game\.armedVblanks,/,
    'Mixup applies the shared No Slowdown arm policy before timing modifiers');
  assert.match(source, /stepSound: \(\) => this\.audio\?\.tick\(\)/,
    'sound hardware must advance independently of canonical logic');
  assert.doesNotMatch(source, /Math\.max\(1, this\.game\.armedVblanks/,
    'cold arm zero must remain an immediate logic fall-through');
});

test('local PLAY restores replay sound state without arbitrary pre-roll', async () => {
  const source = await readFile(new URL('../src/ddpdoj-local.js', import.meta.url), 'utf8');
  assert.match(source,
    /obj\.seed\.sound[\s\S]*?soundRuntimeFromSnapshot\([\s\S]*?this\.soundAssets,[\s\S]*?obj\.seed\.sound\)[\s\S]*?: soundRuntimeFromAssets\(this\.soundAssets,[\s\S]*?this\.audio\.resetGameAudio\(soundRuntime\);/,
    'a replay checkpoint replaces Z80, sequencer, ICS voice, and queued host state');
  assert.doesNotMatch(source,
    /soundRuntimeFromStage1Seed\(\s*this\.soundAssets/,
    'arbitrary replay clocks must not trigger synchronous Stage 1 reconstruction');
});

test('local visibility resync resets DaiOuJou host chronology', async () => {
  const source = await readFile(new URL('../src/local-shell.js', import.meta.url), 'utf8');
  assert.match(source,
    /if \(this\.gameId === 'ddpdoj'\) this\.runtime\?\.resyncTiming\?\.\(\);/);
});

test('local replay refuses formations and simulation-changing mods', () => {
  const formation = createFormationState(FORMATION_MODE.id);
  assert.throws(() => assertFormationReplayCompatible(formation, 'REC'),
    /REC is unavailable while formation mode is active/);

  const simulationMod = createModState(resolveLoadout(['invincibility']));
  assert.throws(() => assertReplayCompatible(simulationMod, 'PLAY'),
    /PLAY is unavailable while simulation-changing mods are active: Invincibility/);

  const presentationMod = createModState(resolveLoadout(['invert-colors']));
  assert.doesNotThrow(() => assertReplayCompatible(presentationMod, 'PLAY'),
    'presentation-only mods do not change the replay digest simulation');
});
