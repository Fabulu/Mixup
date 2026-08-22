// WAVE 47 -- THE SHARDED SPRITE SHEET, and the fourth failure it has to tell
// apart from the three `web-shards.test.js` already covers for the background.
//
// THE REPORT THIS CAME OUT OF: "Daioujou has lots of turrets running around
// targetting you... without tank bodies."  Enemy type $11 draws its HULL from
// `$268B9E` (64 images, by HEADING) and its TURRET from `$268C9E` (32, by
// FACING), and the 161-frame recording the sheet was harvested from swept every
// facing while driving every tank one way -- so 32 of 32 turret images shipped
// and 2 of 64 hull images did (`46-diag-orphan-turrets.md`).  The art is 27.1
// KiB and boot must not get slower, so it is DEFERRED, and this file is about
// the state that creates.
//
// THE FOURTH FAILURE, and it is the one that matters:
//
//   a shard that FAILED    -> throw from the frame that needed it, naming it
//   a shard that is LATE   -> do NOT throw; skip the record and NAME THE SHARD
//   a stream in NO shard   -> an EXPORT gap, and a different sentence
//   *** a record DRAWN out of a shard that has not landed ***
//
// The last one has no symptom worth the name: those words are still zero, and a
// stream of zeroed mask words is a solid rectangle of pen 0.  It is present, it
// is plausible, and it is wrong -- which is the exact failure the whole miss
// guard exists to prevent.  `--break draw-pending-shard` is that mutation and it
// is asserted here as a value.
//
// EVERYTHING HERE IS SYNTHETIC -- synthetic manifests, synthetic bodies, the
// repo's own source text.  No cartridge, no `games/ddpdoj/assets/`, no network:
// the suite has to pass on a tree where nobody has extracted a ROM.  What it
// therefore does NOT test is that the harvested art is the RIGHT pixels; that is
// `tools/webgate.mjs`'s W47 stage (4,194 records, measured) and
// `tools/bundlegate.mjs` (15955968/15955968 px), and both need the cartridge.

import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SprShards, AssetError, verifyCoverage } from '../src/web/assets.js';
import { portSpriteList, romToPackedMap } from '../src/web/app.js';
import { Ram } from '../src/ram.js';
import { RAM } from '../src/machine.js';
import { RAM_STRIDE, parseSpriteList } from '../src/render/spritelist.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => fs.readFileSync(path.join(HERE, '..', rel), 'utf8');

// ---------------------------------------------------------------- fixtures

/** `runs` is [maskLen, colLen] per shard; the runs tile both spaces in order. */
function fakeManifest(runs, boot = [0]) {
  let m = 0, c = 0;
  const shards = runs.map(([maskLen, colLen], i) => {
    const s = { i, kind: `k${i}`, why: `shard ${i}`, streams: 1,
      maskFrom: m, maskLen, colFrom: c, colLen };
    m += maskLen; c += colLen;
    return s;
  });
  const pow2 = (n) => { let p = 1; while (p < n) p *= 2; return p; };
  return {
    encoding: 'gzip',
    spr: { maskWords: pow2(m), colWords: pow2(c), shards, boot,
      streamCount: shards.length, streams: [] },
  };
}

/** A `bin` reader: shard i's mask body is all `i+1`, its colour all `i+101`. */
function fakeBin(manifest, opts = {}) {
  return async (name) => {
    const mm = /^spr\/(mask|col)\.shard(\d+)\.u16\.gz$/.exec(name);
    if (!mm) throw new AssetError(`assets/${name}: HTTP 404.`);
    const [, which, si] = mm;
    const i = +si;
    if (opts.fail?.includes(i)) throw new AssetError(`assets/${name}: HTTP 404.`);
    if (opts.hang?.includes(i)) return new Promise(() => {});
    const s = manifest.spr.shards[i];
    const words = which === 'mask' ? s.maskLen : s.colLen;
    const short = opts.short?.includes(i) ? 1 : 0;
    const a = new Uint16Array(words - short).fill(which === 'mask' ? i + 1 : i + 101);
    return new Uint8Array(a.buffer);
  };
}

// ================================== 1. THE PACKED SPACE MUST TILE, IN ORDER

test('SprShards REJECTS shard runs that do not tile the packed space', () => {
  // The honest case first, or the rejections below prove nothing.
  const good = fakeManifest([[8, 16], [8, 16], [8, 16]]);
  const spr = new SprShards(good, fakeBin(good));
  assert.equal(spr.usedMask, 24);
  assert.equal(spr.usedCol, 48);

  // A GAP in the MASK space. Without this check those words are never filled by
  // anybody: a stream living there draws a rectangle of pen 0 forever, with
  // nothing `waiting` and nothing `failed`. That is the black screen again,
  // wearing a green tick.
  const gap = fakeManifest([[8, 16], [8, 16], [8, 16]]);
  gap.spr.shards[2].maskFrom = 17;
  assert.throws(() => new SprShards(gap, fakeBin(gap)),
    (e) => e instanceof AssetError && /tile the packed space/.test(e.message)
      && /shard 2/.test(e.message));

  // An OVERLAP, the other way a run can fail to tile.
  const over = fakeManifest([[8, 16], [8, 16], [8, 16]]);
  over.spr.shards[2].maskFrom = 15;
  assert.throws(() => new SprShards(over, fakeBin(over)),
    (e) => e instanceof AssetError && /tile the packed space/.test(e.message));

  // And the COLOUR space independently -- a check that only watched the mask
  // would pass a bundle whose colour shards overwrite each other.
  const cgap = fakeManifest([[8, 16], [8, 16], [8, 16]]);
  cgap.spr.shards[1].colFrom = 17;
  assert.throws(() => new SprShards(cgap, fakeBin(cgap)),
    (e) => e instanceof AssetError && /tile the packed space/.test(e.message));

  // The runs summing to MORE than the arrays hold.
  const big = fakeManifest([[8, 16], [8, 16], [8, 16]]);
  big.spr.maskWords = 16;
  assert.throws(() => new SprShards(big, fakeBin(big)),
    (e) => e instanceof AssetError && /more than the/.test(e.message));
});

test('a non-power-of-two array length is refused: SpriteDrawer wraps with & (len-1)',
  () => {
    const m = fakeManifest([[8, 16]]);
    m.spr.maskWords = 12;
    assert.throws(() => new SprShards(m, fakeBin(m)),
      (e) => e instanceof AssetError && /not a power of two/.test(e.message));
  });

test('a bundle with no spr.shards says WHICH wave it predates', () => {
  const m = fakeManifest([[8, 16]]);
  delete m.spr.shards;
  assert.throws(() => new SprShards(m, fakeBin(m)),
    (e) => e instanceof AssetError && /wave 47/.test(e.message));
  const n = fakeManifest([[8, 16]]);
  delete n.spr.streamCount;
  assert.throws(() => new SprShards(n, fakeBin(n)),
    (e) => e instanceof AssetError && /wave 47/.test(e.message));
});

// ============================ 2. WHICH SHARD IS THIS? -- A RANGE TEST

test('shardOfBase is a RANGE test on the packed base, not a per-stream field',
  () => {
    // This is why `spr.streams` needed no fourth field, and why the page can
    // name the shard of a stream whose shard has not arrived.
    const m = fakeManifest([[8, 16], [8, 16], [8, 16]]);
    const spr = new SprShards(m, fakeBin(m));
    assert.equal(spr.shardOfBase(0), 0);
    assert.equal(spr.shardOfBase(7), 0);
    assert.equal(spr.shardOfBase(8), 1, 'the boundary belongs to the NEXT shard');
    assert.equal(spr.shardOfBase(23), 2);
    assert.equal(spr.shardOfBase(24), -1, 'past the last shard is NO shard');
    assert.equal(spr.shardOfBase(9999), -1);
  });

// ==================================== 3. INSTALL, AND THE THREE STATES

test('install() drops a shard\'s words at ITS OWN offset and nowhere else',
  async () => {
    const m = fakeManifest([[8, 16], [8, 16]]);
    const spr = new SprShards(m, fakeBin(m));
    await spr.fetch(1);
    assert.equal(spr.state[1], 'ready');
    // Shard 1's mask body is all 2s and it must land at words 8..15, leaving
    // shard 0's range ZERO. A shard installed at the wrong offset would draw
    // one enemy's art for another, which is worse than drawing nothing.
    assert.deepEqual([...spr.mask.subarray(0, 8)], new Array(8).fill(0));
    assert.deepEqual([...spr.mask.subarray(8, 16)], new Array(8).fill(2));
    assert.deepEqual([...spr.col.subarray(0, 16)], new Array(16).fill(0));
    assert.deepEqual([...spr.col.subarray(16, 32)], new Array(16).fill(102));
  });

test('a SHORT shard body is refused by length, not installed and padded',
  async () => {
    const m = fakeManifest([[8, 16], [8, 16]]);
    const spr = new SprShards(m, fakeBin(m, { short: [1] }));
    await spr.fetch(1);
    assert.equal(spr.state[1], 'failed', 'a short body must FAIL, not truncate');
    assert.match(spr.error[1].message, /the manifest says/);
  });

test('a FAILED sprite shard throws from demand(), naming the shard and BOTH files',
  async () => {
    const m = fakeManifest([[8, 16], [8, 16]]);
    const spr = new SprShards(m, fakeBin(m, { fail: [1] }));
    // The fetch itself must RESOLVE: a shard nobody has reached yet cannot be
    // allowed to take a running page down from a background fetch.
    await spr.fetch(1);
    assert.equal(spr.state[1], 'failed');
    assert.throws(() => spr.demand(1), (e) => e instanceof AssetError
      && /SPRITE SHARD 1 DID NOT LOAD/.test(e.message)
      && /mask\.shard1\.u16\.gz/.test(e.message)
      && /col\.shard1\.u16\.gz/.test(e.message));
  });

test('a LOADING sprite shard does NOT throw and lands in status().waiting',
  async () => {
    const m = fakeManifest([[8, 16], [8, 16]]);
    const spr = new SprShards(m, fakeBin(m, { hang: [1] }));
    spr.fetch(1);
    assert.doesNotThrow(() => spr.demand(1));
    const st = spr.status();
    assert.deepEqual(st.waiting, [1]);
    assert.deepEqual(st.loading, [1]);
    assert.equal(st.ready, 0);
    assert.equal(st.total, 2);
  });

// ============ 4. THE RECORD WHOSE ART IS IN A SHARD THAT HAS NOT LANDED

/** A `Ram` with a hand-written display list at $800000.
 *  Each entry is [x, y, colour, romOffs, wide, high]. */
function ramWithList(entries) {
  const ram = new Ram();
  entries.forEach(([x, y, color, offs, wide, high], r) => {
    const b = RAM.spriteList + r * RAM_STRIDE * 2;
    ram.setU16(b + 0, x & 0x07ff);
    ram.setU16(b + 2, y & 0x03ff);
    ram.setU16(b + 4, ((color & 0x1f) << 8) | ((offs >>> 16) & 0x7f));
    ram.setU16(b + 6, offs & 0xffff);
    ram.setU16(b + 8, ((wide & 0x3f) << 9) | (high & 0x1ff));
  });
  return ram;
}
/** [rom, base, maskWords, shard] */
const mapOf = (...rows) => new Map(rows.map(([rom, base, n, sh]) => [rom, [base, n, sh]]));

test('a record whose SHARD is in flight is skipped by WIDTH and names the SHARD, '
  + 'not the address', () => {
  // Three records: shard 0 (here), shard 1 (in flight), shard 0 again. The
  // THIRD is the point -- a skip must not cost the records behind it, exactly
  // as W44's no-art skip does not.
  const ram = ramWithList([
    [10, 20, 3, 0x1520, 3, 32],       // shard 0, ready
    [30, 40, 3, 0x166840, 3, 32],     // shard 1, in flight -- a TANK HULL
    [50, 60, 3, 0x1584, 3, 32],       // shard 0, ready
  ]);
  const map = mapOf([0x1520, 0, 98, 0], [0x166840, 4096, 98, 1], [0x1584, 200, 98, 0]);
  const asked = [];
  const r = portSpriteList(ram, map, {
    shardReady: (i) => i === 0,
    demand: (i) => asked.push(i),
  });
  assert.equal(r.records, 3);
  assert.equal(r.drawn, 2);
  assert.equal(r.skipped, 1);
  // THE DISTINCTION. `missing` is "the bundle does not have this picture";
  // `pending` is "it does, and that shard is in flight". Two different bugs.
  assert.equal(r.missing.size, 0, 'a shard in flight is NOT a missing picture');
  assert.deepEqual([...r.pending.entries()], [[1, 1]]);
  // ...and the SIMULATION asked for it, which is what makes the delivery
  // schedule a function of the game rather than of a timer.
  assert.deepEqual(asked, [1]);

  const drawn = parseSpriteList(r.words, RAM_STRIDE);
  assert.equal(drawn.length, 3, 'the list must NOT terminate at the skip');
  assert.equal(drawn[0].offs, 0);
  assert.equal(drawn[1].width, 0, 'the pending record is skipped by WIDTH');
  assert.equal(drawn[1].height, 32, '...and keeps its height, or word 4 is the '
    + 'hardware TERMINATOR and everything behind it is lost');
  assert.equal(drawn[2].offs, 200, 'the record BEHIND the skip still draws');
});

test('THE MUTATION: drawing a record whose shard has not landed reads ZEROED '
  + 'words', () => {
  // The words of an unloaded shard are zero, and a stream of zeroed mask words
  // is a solid rectangle of pen 0 -- present, plausible and wrong. This is the
  // one outcome the whole guard exists to prevent, so it is a named break.
  const ram = ramWithList([[30, 40, 3, 0x166840, 3, 32]]);
  const map = mapOf([0x166840, 4096, 98, 1]);
  const opts = { shardReady: () => false, demand: () => {} };
  const honest = portSpriteList(ram, map, opts);
  const cheat = portSpriteList(ram, map, { ...opts, mutate: 'draw-pending-shard' });
  assert.equal(honest.drawn, 0);
  assert.equal(honest.skipped, 1);
  assert.equal(cheat.drawn, 1, 'the mutation must actually draw it');
  assert.equal(cheat.skipped, 0);
  assert.equal(cheat.pending.size, 0);
});

test('with NO shardReady at all every stream reads as shard 0 and draws -- a '
  + 'pre-W47 bundle', () => {
  const ram = ramWithList([[30, 40, 3, 0x166840, 3, 32]]);
  const r = portSpriteList(ram, mapOf([0x166840, 4096, 98, 1]));
  assert.equal(r.drawn, 1);
  assert.equal(r.pending.size, 0);
});

test('NO ART still beats a shard: a stream in no map at all is named by ADDRESS',
  () => {
    const ram = ramWithList([[30, 40, 3, 0x12d430, 3, 32]]);
    const r = portSpriteList(ram, mapOf([0x1520, 0, 98, 0]), {
      shardReady: () => false, demand: () => {},
    });
    assert.equal(r.skipped, 1);
    assert.deepEqual([...r.missing.entries()], [[0x12d430, 1]]);
    assert.equal(r.pending.size, 0);
  });

test('romToPackedMap derives the shard from the packed base', () => {
  const m = fakeManifest([[8, 16], [8, 16]]);
  m.spr.streams = [[0x1520, 0, 98], [0x166840, 8, 98]];
  const spr = new SprShards(m, fakeBin(m));
  const map = romToPackedMap(m, (b) => spr.shardOfBase(b));
  assert.deepEqual(map.get(0x1520), [0, 98, 0]);
  assert.deepEqual(map.get(0x166840), [8, 98, 1]);
});

// ================= 5. THE RECORDING MUST BE DRAWABLE FROM THE BOOT SHARD

test('verifyCoverage REFUSES a capture stream that drifted into a DEFERRED shard',
  () => {
    // `bundlegate` renders the capture off the boot payload alone and requires
    // 100.0000 % pixel identity to MAME. A capture stream in a deferred shard
    // would make the strongest gate in this port depend on the network.
    const m = fakeManifest([[8, 16], [8, 16]]);
    m.spr.streams = [[0x1520, 8, 98]];        // packed base 8 -> shard 1
    const spr = new SprShards(m, fakeBin(m));
    const cap = {
      length: 1,
      frames: [{ lf: 2000 }],
      state: () => ({
        bg: new Uint16Array(64 * 16 * 2),
        tx: new Uint16Array(64 * 32 * 2),
        spritebuffer: (() => {
          const w = new Uint16Array(64);
          w[4] = (3 << 9) | 32;                // 3x32 at slot 0
          w[3] = 8;                            // packed base 8
          return w;
        })(),
      }),
    };
    const sheet = { slot: new Int32Array(0x10000).fill(0), count: 1 };
    const bundle = { cap, manifest: m, spr, bg: null,
      sheets: { bg: sheet, tx: sheet } };
    assert.throws(() => verifyCoverage(bundle),
      (e) => e instanceof AssetError && /SPRITE SHARD 1/.test(e.message)
        && /boot set/.test(e.message));

    // And the honest case: the same stream in shard 0 passes.
    m.spr.streams = [[0x1520, 0, 98]];
    const ok = { ...bundle, spr: new SprShards(m, fakeBin(m)) };
    ok.cap.state = () => ({
      bg: new Uint16Array(64 * 16 * 2),
      tx: new Uint16Array(64 * 32 * 2),
      spritebuffer: (() => {
        const w = new Uint16Array(64);
        w[4] = (3 << 9) | 32;
        w[3] = 0;
        return w;
      })(),
    });
    assert.doesNotThrow(() => verifyCoverage(ok));
  });

// ============================== 6. THE HARVEST, IN THE EXPORTER'S SOURCE
//
// The bundle these produce is gitignored, so the unit suite can only see the
// SOURCE.  That is the cheap early warning, not the proof -- `webgate.mjs`'s
// W47 stage is the measurement (4,194 records drawn where 0 were) and it needs
// the cartridge.

test('THE HARVEST TAKES 64 HULL ENTRIES, NOT 16 -- the trap the diagnosis named',
  () => {
    const src = read('tools/export-web.mjs');
    // `handlers.js` called both type-$11 tables "16-direction"; they are 64 and
    // 32 longwords. A harvest sized off that comment would ship a quarter of
    // the hull art and leave the owner's bug exactly where it is.
    assert.match(src, /\[1, 0x268b9e, 64, 4, 96, 0x268d1e,/,
      'the $268B9E HULL harvest must be 64 entries at stride 4, with the '
      + 'cartridge\'s own 96-longword run and its $268D1E end recorded beside '
      + 'it. Both numbers are asserted against the ROM on every export.');
    assert.match(src, /\[1, 0x268c9e, 32, 4, 32, 0x268d1e,/,
      'the $268C9E TURRET table must be harvested by name too -- it is what '
      + 'pins $268B9E\'s end from below');
    assert.match(src, /\[5, 0x26990e, 70, 8, 70, 0x269b3e,/,
      'type $31\'s table is 70 entries of 8 bytes ($26990E + $230 == $269B3E, '
      + 'the shared draw block), not the 24 the diagnosis estimated');
  });

test('the table EXTENTS are checked against the cartridge, not trusted', () => {
  const src = read('tools/export-web.mjs');
  assert.match(src, /function checkTableExtent/);
  assert.match(src, /run of consecutive stream starts is/,
    'the export must compare the stated run against the ROM and say both '
    + 'numbers when they disagree');
  // Seen to fire, during this wave: the first version of the check asserted
  // that entry `n` is not a stream start, and $268B9E entry 64 IS one -- it is
  // $268C9E. The rule is now the RUN LENGTH and where it ends.
  assert.match(src, /checkTableExtent\(base, n, stride, runsTo, endsAt, why\)/);
});

// W81 INVERTED THIS TEST, and the inversion is the finding.  It used to read
// "$268594 is NAMED as not harvested, not silently omitted" and asserted that
// `0x268594` appears in NO executable line, on the reasoning that it was "96
// entries, 51.8 KiB, for a handler that does not exist".
//
// [M] W81: it is not 96 entries.  `$268300..$268324` indexes it with
// `(($1A,A6) & $3E) * 4` plus a mirror +4, which reaches $FC -- SIXTY-FOUR
// entries -- and `$2683AE` indexes a SECOND table at $268594+$100 with
// `((($33,A5)+1) & $3E) * 2` -- THIRTY-TWO.  The 96 was their sum.  Both are
// reachable, the handler exists now, and both ship in shard 14.
test('$268594 is TWO tables, 64 + 32, and both are harvested', () => {
  const src = read('tools/export-web.mjs');
  const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\[14, 0x268594, 64, 4, 96, 0x268714,/.test(code),
    'the HULL table is 64 entries, and its run of 96 is itself PLUS the turret '
    + 'table at +$100 -- the same adjacency that pins type $11\'s $268B9E');
  assert.ok(/\[14, 0x268694, 32, 4, 32, 0x268714,/.test(code),
    'the TURRET table is 32 entries and its run stops at $268714, which is code');
  assert.match(src, /notHarvested/);
  assert.ok(/NONE\. W81 closed \$268594/.test(src),
    'the manifest must SAY the deferral closed, in the same field that named '
    + 'it -- a field that silently goes empty is how the next wave re-derives '
    + 'the whole thing from scratch');
});

test('W81: type $82 and type $88 harvest what their INDEX reaches, not what a run saw', () => {
  const src = read('tools/export-web.mjs');
  const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  // The two IMMEDIATES. Neither is a table entry and neither can be found by
  // walking a run: they are prototype words and a `move.l #imm,D2`.
  assert.ok(/\[15, 0x1735fc,/.test(code) && /\[15, 0x173810,/.test(code),
    'type $82 is TWO streams -- the $274770 prototype body and $274A70\'s '
    + 'bucket-3 immediate -- not the 57 slot-frames W80 counted');
  assert.ok(/\[16, 0x17d480,/.test(code),
    'type $88\'s body is the $275ECC prototype word, the stream the live page '
    + 'named as NO ART in W68 §6');
  assert.ok(/\[16, 0x272d7a, 32, 4, 160, 0x272ffa,/.test(code),
    'type $88\'s twin turret table is 32 by INDEX; its run of 160 walks '
    + 'straight through $272DFA and $272E7A, so the run cannot size it');
  assert.ok(/\[16, 0x2763d8, 4, 4, 4, 0x2763e8,/.test(code),
    'type $88\'s four-frame sub table, both ends pinned by the cartridge');
  // AND WHAT IS NOT HERE: $272DFA. Type $82's heading table is the $151E10
  // family shard 11 has shipped since W58, so harvesting it again would be a
  // second copy of art already in the bundle.
  assert.ok(!/0x272dfa/.test(code),
    'type $82\'s heading table $272DFA is the $151E10 family already in shard '
    + '11 (STRUCTURE_RANGES); re-harvesting it would duplicate 32 streams');
});

// W84 INVERTS A SECOND ONE, and this one had been written down as a REASON.
// `export-web.mjs`'s extent block used $269E48 as its worked example: "its run
// is 64, but the second 32 are FAM.bucket ($269EC8), which are BUCKET longs
// that merely happen to look like stream starts, and the index (d1 & $3E) * 2
// cannot reach them".  Every clause of that is true except the conclusion.
//
// [M] $269B8C -- ARM B of the family's shared draw block -- is
// `move.l ($2C,A5),D2 / move.w #$410,D3 / jmp $23DF58`, and D2 is the
// DESCRIPTOR the emitter writes into hardware words 2 and 3.  ($2C,A5) is
// loaded out of $269EC8 by $269E32 and by $269DB6, at the same heading index as
// the body.  A SECOND lea, a SECOND emitter, and art.
//
// [M] THE BOARD DRAWS THEM: 54 display-list entries over the 210 checkpoints of
// the `stage1-laser-hold` ladder carry a descriptor out of this table.  W80
// wired the family's machines, arm B started running, and all 186 of
// `webgate`'s "NO ART ANYWHERE" records were this one table.
test('$269EC8 is the family\'s SECOND DRAW ARM, and it is ART, not buckets', () => {
  const src = read('tools/export-web.mjs');
  const code = src.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, '');
  assert.ok(/\[3, 0x269ec8, 32, 4, 32, 0x269f48,/.test(code),
    'the second draw arm\'s table is 32 entries at stride 4, and its run of 32 '
    + 'ends exactly at FAM.muzzle $269F48 -- which is $269E48\'s run of 64 '
    + 'minus this table, so the two extents pin each other');
  assert.ok(/\[3, 0x269e48, 32, 4, 64, 0x269f48,/.test(code),
    'and the body table is unchanged at 32 of its own 64-long run');
  assert.ok(!/BUCKET longs that merely happen to look like stream starts/.test(src),
    'the claim that made this table unexportable must be GONE from the file, '
    + 'not merely contradicted somewhere else in it');
  assert.match(src, /SECOND DRAW ARM/,
    'and the file must say what the table is, so the next reader does not '
    + 'have to re-derive it from $269B8C');
});

test('SHARD 0 IS THE BOOT SHARD and holds both ships plus Game Over art', () => {
  const src = read('tools/export-web.mjs');
  assert.match(src, /const SPR_BOOT = \[0\];/);
  assert.match(src, /the recording, both ships.*17 main tilts/,
    'W497 keeps both authentic ship families available in the boot shard');
  assert.match(src, /nine Game Over streams, all in the boot/,
    'W498 keeps the front-end Game Over family available before deferred art settles');
  assert.match(src, /const LASER_SHARD = 1;/,
    'the laser remains in the first deferred shard rather than the expanded boot shard');
});

test('the stream table is a TYPED ARRAY, because manifest.json is boot bytes',
  () => {
    const src = read('tools/export-web.mjs');
    assert.match(src, /put\('spr\/streams\.u32', sprStreamU32\)/);
    assert.match(src, /streamsFile: 'spr\/streams\.u32\.gz'/);
    const loader = read('src/web/assets.js');
    assert.match(loader, /manifest\.spr\.streams = list;/,
      'the loader must materialise the triples back onto manifest.spr.streams, '
      + 'or verifyCoverage / romToPackedMap / bundlegate all stop working');
  });

test('the page says WHICH of the two skips it is, in two different sentences',
  () => {
    const html = read('index.html');
    assert.match(html, /SPR SHARD \$\{s\.dlPending\}/);
    assert.match(html, /NO ART \$\{s\.dlNoArt\}/);
    assert.match(html, /spr \$\{s\.sprShards\.ready\}\/\$\{s\.sprShards\.total\}/);
  });

test('an AssetError does NOT get the "IS NOT PORTED YET" headline', () => {
  // Seen in Chrome with the shard withheld: `showError` scrapes the first
  // $xxxxxx out of any message, and a sprite shard is named by the ROM TABLE it
  // was harvested from. So a missing FILE read as an unported ROUTINE, which
  // blames the port for the network.
  const html = read('index.html');
  assert.match(html, /const isAsset = \(e && e\.name\) === 'AssetError';/);
  assert.match(html, /const addr = isAsset \? null : msg\.match/);
  assert.match(html, /AN ASSET IS MISSING OR BROKEN/);
});
