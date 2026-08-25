// W590: pin the Black Label ship-0/style-4 end of round 2 through attract handoff.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { NAME_REC, NAME_SCREEN } from '../src/hiscorename.js';
import { RAM, P } from '../src/machine.js';
import { ALLOC } from '../src/objalloc.js';
import { SCREEN8 } from '../src/objslot8.js';
import { SLOT12 } from '../src/objslot12.js';
import { SLOT14 } from '../src/objslot14.js';
import { SLOT15 } from '../src/objslot15.js';
import { SLOT7 } from '../src/objslot7pool.js';
import { loadBundle } from '../src/web/assets.js';
import { checkpointDocument, restoreCheckpoint } from '../tools/progression-checkpoint.mjs';
import { tableBeforeW588, tableBeforeW589 } from './romwindowset.js';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const TABLES = here('../rip/port/player.tables.json');
const IMAGE = here('../rip/sound/maincpu.bin');
const CHECKPOINT = here('../probes/checkpoints/ship0-style4-lf00153631.json');
const ASSETS = here('../assets');
const required = [
  TABLES, IMAGE, CHECKPOINT, path.join(ASSETS, 'manifest.json'),
  path.join(ASSETS, 'seed.bin.gz'), path.join(ASSETS, 'player.tables.json.gz'),
];
const SKIP = required.every(existsSync) ? false
  : 'exact W590 image, checkpoint, tables, or web bundle absent. This is a skip, not a pass.';
const IMG = SKIP ? null : readFileSync(IMAGE);
const TABLE_JSON = SKIP ? null : JSON.parse(readFileSync(TABLES, 'utf8'));
const W588_TABLE = SKIP ? null : tableBeforeW589(TABLE_JSON);
const CHECKPOINT_TABLE = SKIP ? null : tableBeforeW588(TABLE_JSON);

const LIVE_TABLE_HASH = 'b062e45b4c4ca0488a0c4660a83a9d868feaf8b6d00b670d1de9948481f3f7c3';
const W588_TABLE_HASH = 'e6375da211814c6ff3bbbb3bfcaddb88fbd5f2dd93894008191e68aa0cdc19b2';
const CHECKPOINT_TABLE_HASH = 'e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1';

const PROVENANCE = Object.freeze([
  Object.freeze(['type $0F dispatcher', 0x291f66, '4a2d000267b80c2d']),
  Object.freeze(['type $0F state 0', 0x291f24, '1b7c000100024eba']),
  Object.freeze(['type $0F state 2', 0x291f0a, '303c000e4eb90024']),
  Object.freeze(['type $0F sequence arm', 0x291dc6, '4df90081585c7e31']),
  Object.freeze(['type $0F per-frame step', 0x291df4, '49fa01ec4e71d8f9']),
  Object.freeze(['type $0F spawn', 0x291e20, '33fc00000081e11e']),
  Object.freeze(['type $0F string draw', 0x291eaa, '2640222e0002363c']),
  Object.freeze(['type $0F resource descriptor', 0x291fd8, '000100000080001f0006']),
  Object.freeze(['type $0F schedule table', 0x291fe2, '00500e000000002921ba']),
  Object.freeze(['type $0C dispatcher', 0x28f3ac, '4a2d00026700ff08']),
  Object.freeze(['type $0C init', 0x28f2ba, '4eb90023c6221b7c']),
  Object.freeze(['type $0C teardown', 0x28f368, '4eb90024a8104eb9']),
  Object.freeze(['type $0C P1 arm', 0x28f3f8, '49f90081e0564eb9']),
  Object.freeze(['type $0C P2 arm', 0x28f450, '49f90081e0964eb9']),
  Object.freeze(['type $0C frame bands', 0x28f542, '526c00023e2c0002']),
  Object.freeze(['type $0C timeout compare', 0x28f556, '0c470738640000aa']),
  Object.freeze(['type $0C finish', 0x28f606, '302c0018d040d040']),
  Object.freeze(['type $0C work-list exit', 0x28f6c8, '302c002c01ad0005']),
  Object.freeze(['type $0C state 2', 0x28f6da, '1b7c000200024e75']),
]);

const PERIODIC_IDENTITIES = Object.freeze([
  Object.freeze([0, 153631, 164292,
    '74e3fd892f5397d81034cc153e1014f4c3af85e61ffce82b693fd7ef19ccf742',
    '66981316f01a795ca76cbae08ce3a8a5b6876a18a4ff1251dff7a0adc75d658a']),
  Object.freeze([500, 154131, 164792,
    '343b7305f2c498d13c8cde860ca2a896f9b62ccdedade10541c2dab76d821d8f',
    '1d3580db3c31337fc61ffa2b359dee7919ba8034a09fed5b0cefd46d4d3a084a']),
  Object.freeze([1000, 154631, 165292,
    'a45d3e76064ed3f0a442cb302aa58363b87d7e8e0bc125ff4fc739ddfa3c6dab',
    'c9d7f75716152b4106fc76b40c5a80e90cc155770fbad16f71956e2384b0c603']),
  Object.freeze([1500, 155131, 165792,
    '8aa0f55fdd73b445d2786f780aef05bdec5e821a0b798740e689d622cb8e4a8b',
    '3c907b89a640cc2e24488688f7cea7f53daba8348d79c4022637b9ec51022aab']),
  Object.freeze([2000, 155631, 166292,
    '2b993480dc739a7efb061442a423c4c29d0639a421bda058ea0547a4d4d3c452',
    'fcfe26bc94b7a7985531a60c5eb36d39a416cf15a6f76a37aa48cba1b18e6b28']),
  Object.freeze([2500, 156131, 166792,
    '9e8aa69167d8c1e363d1e2bc6daf03376283fca0241d82e675e017a64cef1f4a',
    '9103a3f33996deff86418e3a49be3efa198d0f83662f046a4bdeea69466944ef']),
  Object.freeze([3000, 156631, 167292,
    'f5c3c1017e376456db3543f116618385fd76f16165051c6e1317243ab955cbbc',
    '9131d6f14fd43b83e9ad125fbbf6dbfe802dee5892dfb2a349e407a9b3000341']),
  Object.freeze([3500, 157131, 167792,
    '383e74549f829e82a89ea7b3d2959c2a4786418dd8c5b1dce46eecd80ece3a0b',
    '8fe12e52ad7808c57e1ee161444ac0f763267cd69e57a3b426cae7e040dae48b']),
  Object.freeze([4000, 157631, 168292,
    '7d2be786cd794fd5f0d7fb22298b746f8f842d8cc0fe12ae385bac271c7a925d',
    '83fe46142d0ba656131b1d75276cf085d18095f212cd200dfefdcfdae1a829ab']),
  Object.freeze([4500, 158131, 168792,
    '3415e30174c15bff6c2ff116185148290027d27272c18736dc9053feb7c91389',
    '8305a5f4557ca301ed3b9bb17c4e7cb847307c5e072d26dbf22e512e265571e9']),
  Object.freeze([5000, 158631, 169292,
    '08ce527b21d6c793a239e09f0afbcb2c7b9c2af609b79db14a789e27350b9455',
    'c9fff857ca77e814187bd7c0604e4805d736113e33b247dbdd470410a5461c17']),
  Object.freeze([5500, 159131, 169792,
    '7ab343e003a1aaf8e5007a62af6bff9901ee433ed4dff1518442c99519575ebc',
    '831e1c17366c6715d69e122fdabf3954eee7feaa00a7f0305469c924ebbf1b34']),
  Object.freeze([6000, 159631, 170292,
    '292f544f7671259122f7a536feae74ecb14b1028da44f165f751593042df999d',
    '36df3a7b0448800e7b780b28c44ff37ba54f88c9e7081d4392ca631c56dd4211']),
  Object.freeze([6500, 160131, 170792,
    '9667977ae86113a19278e2e14455d3676b8a390881124e69a25554999022c679',
    '7dbd904c50d77c61bf7cdf64073dba0de22b20bdd474182d5059a78a374590b3']),
  Object.freeze([7000, 160631, 171292,
    '43154eb4bde98a5853495a6f9352a9cc94886d45ac953701a9dcc2b424e0bfb0',
    '53b5df4afa32af4258d5a3b40f0259a40d01c14e56deaab902bf1358857cf527']),
  Object.freeze([7500, 161131, 171792,
    '3fa4529ff961f1aae79612baeb979d4eb364684c3880697ff1f7422415b73770',
    'a7a966c682b2662cbc276699412465b05ddf6968bc03542e09eb2ed0cdea829b']),
  Object.freeze([8000, 161631, 172292,
    '2e8831ac0fa0d23e4c291d2343717942d7e8f307314622a820fa6ac81dd60af4',
    '7a582a5c904e434ef6b2d7a3efb6e67f6bb4d66984d7ae2390aa24fb53a612a7']),
  Object.freeze([8500, 162131, 172792,
    '55170c7c9f83a3dd18bed030e3ebbc1a2f48926fcafdbd7ef8fb738eb88d68c4',
    '906073a564644ba3fc8f461c1232ea1a37782ca779aaef463809cef9f47f0f3c']),
  Object.freeze([9000, 162631, 173292,
    '575827cc599799571a5363fffb3c485c085acb2f4b9a5ae1ae2256aa4e51c22a',
    '01f6075c244be11549604eb0a4dd665abf04aebdf94dea8eaeebc857c2632f79']),
  Object.freeze([9500, 163131, 173792,
    '4f40d3e54ece31ea395b26aa5b0643e351c60d2293f3d92246092861feae3f00',
    'acd801b2851c73b713646e281fbc7bda202beb5241d71e9cac60a4ceb79f6979']),
  Object.freeze([10000, 163631, 174292,
    'c162ab05dffebdb0a58b12d09477a55d2931b7025d055221d02bf04561ce245b',
    '8bbb29c476cd748c02c2e78d7c40d9e04200f72d28ca12ddbc07fb126d96f762']),
  Object.freeze([10500, 164131, 174792,
    'dd74bf119ae458d569ec4174bc8d1275b35b5a7246cb83e9c0e9e0dbc9715ace',
    'af754f9fc717511ddf44daecb5a5fde84a35b30d93efed66cfec39e85bf90964']),
  Object.freeze([11000, 164631, 175292,
    '239025020896bc90e48eb1e525aa50d3bafb7cb06a54526d5a634010d4021a63',
    '85be3d728a2a9789d1495e908246f80bf21c8a5df3df9322f4881e9afc0ce2b5']),
  Object.freeze([11500, 165131, 175792,
    '23c0154b87077ca62b275f01c15545c0c042a0a87653760f5525a919a748ea97',
    'f9af11876e23efb07e22dbfb5b51f4beeb645bfa924e0bb0857ce34aebca8f3b']),
  Object.freeze([12000, 165631, 176292,
    'cc3387b547029908ce93fc79a6c8d1733cf203becb7106fa18b9554592c834c1',
    '1014cd8691eb7b5b627eb118aa7f713e10de6a7e9a6774fa420be5647efb9cd5']),
  Object.freeze([12500, 166131, 176792,
    '5c372a609761bf7227f4c94452bf372ef4a03f0659ffcbaf6c3ed0610a2149a6',
    '3c80fcc698684950bfb1204437ddf31e788a2402b7c970915278cbdd06d9cfe1']),
  Object.freeze([13000, 166631, 177292,
    '86f240ced6e22c11399b0ae8d5efd172fc11c3dcd0c8213d21f25ab96ee1cbc0',
    '34bb40ca97a6fff591ea808b574b048e6a7f40599ae5ad1f709cf754a9621c26']),
  Object.freeze([13500, 167131, 177792,
    'eb9ef084bae3afaa0be45db8ba4f60d2670a75c669b52a148229c56d16c84589',
    '05cf4d3de9091a5d25c2957b4245bc65ea9f3f26aca0e7a3db0bb6b58232c0a5']),
  Object.freeze([14000, 167631, 178292,
    '36290a21d8dae67d568e42c797d1a4f57da5dd1418c33cc02e72764da828ea1b',
    '1d6c4d94ba06e3999aa909bd788e7f59bceebeb8ebbdd23ad1c8b4804d63d909']),
]);

const canonicalHash = (value) => createHash('sha256')
  .update(JSON.stringify(value)).digest('hex');

async function bundle() {
  return loadBundle(async (name) => new Uint8Array(readFileSync(path.join(ASSETS, name))));
}

function objectByType(ram, type) {
  for (let index = 0; index < ALLOC.slots; index++) {
    const at = ALLOC.table + index * ALLOC.stride;
    if (ram.u16(at) === type) return at;
  }
  return null;
}

function liveObjects(ram) {
  return Array.from({ length: ALLOC.slots }, (_, index) => {
    const at = ALLOC.table + index * ALLOC.stride;
    return [ram.u16(at), ram.u8(at + 2), ram.u32(at + ALLOC.idOff)];
  }).filter(([type]) => type !== 0);
}

function expectFrame(game, attempt, logic, video) {
  assert.deepEqual([game.logicFrame, game.videoFrame], [logic, video],
    `attempt ${attempt} has its exact logic/video identity`);
}

function identity(game, assets, probe, attempt) {
  const state = checkpointDocument(game, assets, probe);
  return [attempt, game.logicFrame, game.videoFrame, state.ramSha256, state.gameSha256];
}

test('W590 exact checkpoint reaches P1 name entry, resets round 2, and hands to attract',
  { skip: SKIP }, async () => {
    assert.deepEqual([
      canonicalHash(TABLE_JSON), TABLE_JSON.rom.windows.length,
      TABLE_JSON.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(W588_TABLE), W588_TABLE.rom.windows.length,
      W588_TABLE.rom.windows.reduce((total, window) => total + window.len, 0),
      canonicalHash(CHECKPOINT_TABLE), CHECKPOINT_TABLE.rom.windows.length,
      CHECKPOINT_TABLE.rom.windows.reduce((total, window) => total + window.len, 0),
    ], [
      LIVE_TABLE_HASH, 906, 453741,
      W588_TABLE_HASH, 854, 452789,
      CHECKPOINT_TABLE_HASH, 851, 452689,
    ]);
    assert.deepEqual(tableBeforeW589(W588_TABLE), W588_TABLE,
      'W589 removal is idempotent on the exact W588 table');
    assert.deepEqual(tableBeforeW588(CHECKPOINT_TABLE), CHECKPOINT_TABLE,
      'W588/W589 removal is idempotent on the exact checkpoint table');
    assert.equal(TABLE_JSON.rom.windows.some(({ why }) => why.startsWith('W590:')), false,
      'W590 adopts the ending with no production ROM window');

    assert.deepEqual([
      SLOT15.entry, SLOT15.start, SLOT15.resource, SLOT15.seqTable,
      SLOT12.entry, SLOT12.init, SLOT12.teardown, ...SLOT12.arms, ...SLOT12.records,
      NAME_SCREEN.p1, NAME_SCREEN.p2, NAME_SCREEN.giveUp,
    ], [
      0x291f66, 0x291f24, 0x291fd8, 0x291fe2,
      0x28f3ac, 0x28f2ba, 0x28f368, 0x28f3f8, 0x28f450, 0x81e056, 0x81e096,
      0x28f428, 0x28f482, 0x28f6c8,
    ]);
    for (const [label, address, hex] of PROVENANCE) {
      assert.equal(IMG.subarray(address, address + hex.length / 2).toString('hex'), hex, label);
    }
    assert.equal(IMG.readUInt16BE(SLOT15.seqTable + 47 * SLOT15.seqStride), SLOT15.seqEnd,
      'the 47-record type-$0F schedule ends at its exact $FFFF');

    const liveBundle = await bundle();
    assert.deepEqual(liveBundle.tables, TABLE_JSON,
      'the existing web table payload is already W589-current');
    const currentAssets = { ...liveBundle, tables: TABLE_JSON };
    const checkpointAssets = { ...liveBundle, tables: CHECKPOINT_TABLE };
    const checkpoint = JSON.parse(readFileSync(CHECKPOINT, 'utf8'));
    assert.deepEqual([
      checkpoint.tablesSha256, checkpoint.frame.logic, checkpoint.frame.video,
      checkpoint.raw.stage, checkpoint.raw.stageX2, checkpoint.raw.stageX4, checkpoint.raw.loop,
      checkpoint.ramSha256, checkpoint.gameSha256,
      checkpoint.selection.ship, checkpoint.selection.style,
      checkpoint.inputWord, checkpoint.probeOnly.invulnerable,
    ], [
      CHECKPOINT_TABLE_HASH, 153631, 164292, 4, 8, 16, 1,
      '74e3fd892f5397d81034cc153e1014f4c3af85e61ffce82b693fd7ef19ccf742',
      '66981316f01a795ca76cbae08ce3a8a5b6876a18a4ff1251dff7a0adc75d658a',
      0, 4, 65499, true,
    ]);
    restoreCheckpoint(checkpoint, checkpointAssets, checkpoint.selection);

    const migrated = { ...checkpoint, tablesSha256: LIVE_TABLE_HASH };
    assert.deepEqual({ ...migrated, tablesSha256: checkpoint.tablesSha256 }, checkpoint,
      'in-memory additive adoption changes only the cartridge-table identity');
    const resumed = restoreCheckpoint(migrated, currentAssets, migrated.selection);
    const probe = {
      ...migrated.selection, inputWord: resumed.probe.inputWord, invulnerable: true,
    };
    assert.deepEqual(checkpointDocument(resumed.game, currentAssets, probe), migrated,
      'restoration preserves every non-ROM byte and Game-state property exactly');

    const { game } = resumed;
    const periodic = [identity(game, currentAssets, probe, 0)];
    assert.deepEqual(liveObjects(game.ram), [[0x8007, 1, 1]]);
    assert.deepEqual([
      game.ram.u16(0x813092), game.ram.u16(0x813094),
      game.ram.u16(0x813096), game.ram.u16(0x813098),
      game.ram.u16(SLOT7.work + 0x0c),
    ], [4, 8, 16, 1, 4]);

    let fault = null;
    for (let attempt = 1; attempt <= 14000; attempt++) {
      try {
        game.ram.setU8(RAM.player1 + P.invuln, 0xff);
        game.step(resumed.probe.inputWord);
      } catch (error) {
        fault = { attempt, error };
        break;
      }

      if (attempt % 500 === 0) periodic.push(identity(game, currentAssets, probe, attempt));

      if (attempt === 3242) {
        expectFrame(game, attempt, 156873, 167534);
        assert.deepEqual(liveObjects(game.ram), [[0x8007, 2, 1]]);
        assert.equal(game.ram.u16(SLOT7.work + 0x0c), 28,
          'W589 list B is complete at its terminator');
        assert.deepEqual(identity(game, currentAssets, probe, attempt).slice(3), [
          '39fec6bd684f28cb9d226707e954455bccb63830753eb1b09bcc9ab2b73b4db1',
          'd1ea9dfe0b67f877b3c1237042fb376f66a4818df45e37aaccb71c04438f2b57',
        ]);
      }
      if (attempt === 3244) {
        expectFrame(game, attempt, 156875, 167536);
        assert.deepEqual(liveObjects(game.ram), [[0x800f, 1, 2]]);
        assert.deepEqual(identity(game, currentAssets, probe, attempt).slice(3), [
          '01fef155caf28fcdf4bc47b9f92814865d46c09ca65002f24168c3915260b662',
          '17a02c5da3eacd8876e28e91088b0f018daede54ad167c78479a494430d8fd5b',
        ]);
      }
      if (attempt === 11034) {
        const slot15 = objectByType(game.ram, 0x800f);
        assert.notEqual(slot15, null);
        assert.deepEqual([
          game.ram.u16(SLOT15.cursor), game.ram.u16(SLOT15.drift),
          game.ram.u16(slot15 + SLOT15.timer), game.ram.u16(slot15 + SLOT15.phase),
        ], [460, 32, 128, 0], 'the timer is held while the final drift-stop record is pending');
      }
      if (attempt === 11035) {
        expectFrame(game, attempt, 164666, 175327);
        const slot15 = objectByType(game.ram, 0x800f);
        assert.notEqual(slot15, null);
        assert.deepEqual([
          game.ram.u8(slot15 + SLOT15.state), game.ram.u32(slot15 + SLOT15.idAt),
          game.ram.u16(SLOT15.cursor), game.ram.u16(SLOT15.frames),
          game.ram.u16(SLOT15.drift), game.ram.u16(slot15 + SLOT15.timer),
          game.ram.u16(slot15 + SLOT15.phase),
        ], [1, 2, 470, 0, 0, 127, 0],
        'the last schedule record stops drift and permits the timer to count');
      }
      if (attempt === 11162) {
        expectFrame(game, attempt, 164793, 175454);
        const slot15 = objectByType(game.ram, 0x800f);
        assert.notEqual(slot15, null);
        assert.deepEqual([
          game.ram.u8(slot15 + SLOT15.state), game.ram.u16(SLOT15.cursor),
          game.ram.u16(SLOT15.drift), game.ram.u16(slot15 + SLOT15.timer),
          game.ram.u16(slot15 + SLOT15.phase),
        ], [1, 470, 0, 0, 1]);
        assert.notEqual(game.ram.u32(slot15 + SLOT15.handle), 0,
          'timer zero loads the exact type-$0F resource');
      }
      if (attempt === 11290) {
        expectFrame(game, attempt, 164921, 175582);
        assert.deepEqual(liveObjects(game.ram), [[0x800f, 2, 2]]);
      }
      if (attempt === 11291) {
        expectFrame(game, attempt, 164922, 175583);
        assert.deepEqual(liveObjects(game.ram), [[0x800f, 2, 2]]);
        assert.deepEqual([
          game.ram.u16(ALLOC.createSp), game.ram.u16(ALLOC.createStage),
          game.ram.u8(ALLOC.createStage + 2),
          game.ram.u32(ALLOC.createStage + ALLOC.idOff), game.ram.u16(ALLOC.killSp),
        ], [ALLOC.stride, 0x800e, 0, 3, ALLOC.stride],
        'type $0E is staged while type $0F queues its own retirement');
      }
      if (attempt === 11292) {
        expectFrame(game, attempt, 164923, 175584);
        assert.deepEqual(liveObjects(game.ram), [[0x800e, 1, 3]]);
      }
      if (attempt === 11593) {
        expectFrame(game, attempt, 165224, 175885);
        assert.deepEqual(liveObjects(game.ram), [[0x800e, 2, 3]]);
      }
      if (attempt === 11626) {
        expectFrame(game, attempt, 165257, 175918);
        assert.deepEqual(liveObjects(game.ram), [[0x800c, 1, 4]]);
        const slot12 = objectByType(game.ram, 0x800c);
        assert.notEqual(slot12, null);
        assert.deepEqual([
          game.ram.u8(slot12 + SLOT12.owedAt), game.ram.u8(SLOT12.flags),
          game.ram.u16(SLOT12.records[0] + NAME_REC.state),
        ], [1, 1, 0], 'P1 made the table and is owed a real name-entry arm');
      }
      if (attempt === 12000) {
        expectFrame(game, attempt, 165631, 176292);
        const slot12 = objectByType(game.ram, 0x800c);
        const p1 = SLOT12.records[0];
        assert.notEqual(slot12, null);
        assert.deepEqual([
          game.ram.u8(slot12 + SLOT12.stateAt), game.ram.u32(slot12 + SLOT12.idAt),
          game.ram.u8(slot12 + SLOT12.owedAt), game.ram.u8(SLOT12.flags),
          game.ram.u16(p1 + NAME_REC.state), game.ram.u16(p1 + NAME_REC.setupBit),
          game.ram.u16(p1 + NAME_REC.side), game.ram.u16(p1 + NAME_REC.cursor),
          game.ram.u32(p1 + NAME_REC.entry), game.ram.u32(p1 + NAME_REC.score),
          game.ram.u16(p1 + NAME_REC.ship), game.ram.u16(p1 + NAME_REC.style),
          game.ram.u16(SLOT12.active), game.ram.u8(NAME_SCREEN.setupFlag),
        ], [1, 4, 1, 1, 374, 1, 0, 1, 0x803838, 0x98484857, 0, 4, 1, 2],
        'P1 is in the cached input path, not the short zero-score exit');
        assert.deepEqual([
          game.ram.u16(0x813092), game.ram.u16(0x813094),
          game.ram.u16(0x813096), game.ram.u16(0x813098),
        ], [4, 8, 16, 1], 'name entry has not reset the raw round-2 position');
      }
      if (attempt === 13586) {
        expectFrame(game, attempt, 167217, 177878);
        const slot12 = objectByType(game.ram, 0x800c);
        assert.notEqual(slot12, null);
        assert.deepEqual([
          game.ram.u8(slot12 + SLOT12.stateAt), game.ram.u32(slot12 + SLOT12.idAt),
          game.ram.u16(SLOT12.records[0] + NAME_REC.state),
        ], [2, 4, 0x738], 'the cartridge timeout naturally advances slot [12] to state 2');
      }
      if (attempt === 13587) {
        expectFrame(game, attempt, 167218, 177879);
        assert.deepEqual(liveObjects(game.ram), [[0x800c, 2, 4]]);
        assert.deepEqual([
          game.ram.u16(0x813092), game.ram.u16(0x813094),
          game.ram.u16(0x813096), game.ram.u16(0x813098),
          game.ram.u16(ALLOC.createSp), game.ram.u16(ALLOC.createStage),
          game.ram.u32(ALLOC.createStage + ALLOC.idOff),
        ], [0, 0, 0, 0, ALLOC.stride, 0x8008, 5],
        'slot [12] teardown resets stage/loop and stages attract type $08');
      }
      if (attempt === 13588) {
        expectFrame(game, attempt, 167219, 177880);
        const slot8 = objectByType(game.ram, 0x8008);
        assert.notEqual(slot8, null);
        assert.deepEqual([
          game.ram.u8(slot8 + SCREEN8.constructed), game.ram.u16(slot8 + SCREEN8.param),
          game.ram.u32(slot8 + ALLOC.idOff), game.ram.u16(SCREEN8.state),
        ], [1, 2, 5, 2], 'attract type $8008 is committed in the inherited arm-2 state');
      }
      if (attempt === 13590) {
        expectFrame(game, attempt, 167221, 177882);
        const slot8 = objectByType(game.ram, 0x8008);
        assert.notEqual(slot8, null);
        assert.deepEqual([
          game.ram.u8(slot8 + SCREEN8.constructed), game.ram.u8(slot8 + SCREEN8.inited),
          game.ram.u16(slot8 + SCREEN8.param), game.ram.u32(slot8 + ALLOC.idOff),
          game.ram.u16(SCREEN8.state), game.ram.u16(ALLOC.createSp), game.ram.u16(ALLOC.killSp),
        ], [1, 0, 3, 1, 3, 0, 0], 'the attract sequencer has reset and restaged itself actively');
      }
      if (attempt === 14000) {
        expectFrame(game, attempt, 167631, 178292);
        assert.deepEqual(liveObjects(game.ram), [[0x8008, 1, 1]]);
        assert.deepEqual([
          game.ram.u16(SCREEN8.state), game.ram.u16(0x813092), game.ram.u16(0x813098),
        ], [3, 0, 0]);
      }
    }

    assert.equal(fault, null,
      `no ROM fault through attempt 14000${fault ? `; attempt ${fault.attempt}: ${fault.error}` : ''}`);
    assert.deepEqual(periodic, PERIODIC_IDENTITIES,
      'every exact 500-frame RAM/Game identity retains its expected LF/VF cadence');
  });
