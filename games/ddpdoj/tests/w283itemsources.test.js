// W283 (DOCKET D16): WHERE items come from, counted out of the cartridge's own
// spawn script -- which is what finally explains an empty hyper bar.
//
// The chain was eliminated from the bottom up:
//
//   the DISPLAY    W281  complete, one icon per unit of $81B6E0
//   the ALLOCATOR  W282  complete, all six kinds, zero notes
//   the WINDOW     W282  900 frames is too short to see an item at all
//   the SOURCES    here  and this is the answer
//
// **Stage 1's script holds TWO type-$85 records out of 339, and `deathSeq85` drops
// kind $0 or $8 -- never $C.** So stage 1's popcorn cannot put one unit of hyper on
// the bar no matter how long the run. Kind $C comes from `$294C40 partDeathDrop`, a
// BOSS PART death. An empty hyper row through stage 1's popcorn phase is CORRECT.

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.join(HERE, '..');
const IMAGE = path.join(GAME, 'rip', 'sound', 'maincpu.bin');
const HAVE = existsSync(IMAGE);
const IMG = HAVE ? readFileSync(IMAGE) : null;
const SKIP = HAVE ? false : 'the decrypted image is absent; skip, not pass';

// `$263396 lea ($263336,PC),A0`, entry stride $10, `script` at +$0.
const STAGE_TAB = 0x263336;
const STAGE_STRIDE = 0x10;
const u16 = (a) => (IMG[a] << 8) | IMG[a + 1];
const u32 = (a) => ((u16(a) << 16) | u16(a + 2)) >>> 0;

/**
 * Walk one stage's 8-byte spawn records. `src/spawn.js` documents the layout:
 * trigger word, param word, type byte, flags byte, data index word.
 */
function walkScript(stage) {
  const script = u32(STAGE_TAB + stage * STAGE_STRIDE);
  const types = new Map();
  let a = script;
  let n = 0;
  let prev = -1;
  for (; n < 4096; n++) {
    const trig = u16(a);
    if (trig === 0xffff) break;              // the terminator
    // The triggers are an ASCENDING odometer match ($8130CE), so a decrease means
    // the walk has left the script and is reading whatever follows it.
    if (trig < prev) break;
    prev = trig;
    const t = IMG[a + 4];
    types.set(t, (types.get(t) ?? 0) + 1);
    a += 8;
  }
  return { script, records: n, types };
}

// ============================================ 1. THE SCRIPT IS WHAT IT CLAIMS

test('W283 stage 1 walks to exactly 339 records and a $FFFF terminator',
  { skip: SKIP }, () => {
    // 339 is the number the handoff and the coverage tool both carry, so this is the
    // walk agreeing with them rather than a new claim -- and it is what makes the
    // per-type counts below trustworthy.
    const s1 = walkScript(0);
    assert.equal(s1.script, 0x230c6c, 'stage 1 script at $230C6C');
    assert.equal(s1.records, 339);
    assert.equal(u16(s1.script + 339 * 8), 0xffff, 'and the record after it is $FFFF');
  });

test('W283 all five stage scripts walk and none is empty', { skip: SKIP }, () => {
  const want = [0x230c6c, 0x2325d0, 0x2342ba, 0x2358b0, 0x237978];
  for (let i = 0; i < 5; i++) {
    const s = walkScript(i);
    assert.equal(s.script, want[i], `stage ${i + 1} script address`);
    assert.ok(s.records > 100, `stage ${i + 1} has ${s.records} records`);
  }
});

// ================================ 2. WHY STAGE 1 CANNOT PRODUCE ANY HYPER

test('W283 stage 1 holds only TWO type-$85 records, and no $86 at all',
  { skip: SKIP }, () => {
    // `deathSeq85` is the ONLY popcorn drop site, and it runs for types $85/$86.
    // Two records in the whole stage is why W282's census saw ONE item in 5400
    // frames: that is not a low drop rate, it is the correct one.
    const { types } = walkScript(0);
    assert.equal(types.get(0x85) ?? 0, 2, 'two type-$85 spawns in all of stage 1');
    assert.equal(types.get(0x86) ?? 0, 0, 'and no type-$86');
  });

test('W283 deathSeq85 can only ever drop kind $0 or $8 -- NEVER the hyper kind',
  { skip: SKIP }, () => {
    // `$275AFA moveq #$0,D0 / cmpi.b #$86,($C,A5) / $275B04 moveq #$8,D0`. So the
    // popcorn drop is kind $0, or kind $8 for a type-$86. Read out of the port,
    // because the port is what runs.
    const src = readFileSync(path.join(GAME, 'src', 'handlers.js'), 'utf8');
    const fn = src.slice(src.indexOf('function deathSeq85'));
    const body = fn.slice(0, fn.indexOf('\n  // $275B20'));
    assert.match(body, /ram\.u8\(a5 \+ 0x0c\) === 0x86 \? 8 : 0/,
      'the kind is 8 for a $86 and 0 otherwise');
    assert.ok(!/0x0c\s*[,)]/.test(body.replace(/a5 \+ 0x0c/g, '')),
      'and kind $C appears nowhere in it');
  });

test('W283 stage 1 is dominated by types that drop NOTHING', { skip: SKIP }, () => {
  // The top of the census, so the shape is on the record: 104 of the 339 records are
  // type $11 alone. Whatever is wrong with the game, "stage 1 is full of enemies that
  // should be dropping items" is not it.
  const { types } = walkScript(0);
  const top = [...types.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.equal(top[0], 0x11, 'the commonest type is $11');
  assert.equal(top[1], 104);
  assert.ok((types.get(0x85) ?? 0) * 50 < top[1],
    'and the dropping type is two orders of magnitude rarer');
});

// ================================ 3. WHERE THE HYPER ITEM ACTUALLY COMES FROM

test('W283 $294C40 is the hyper item\'s source, and its comment is CORRECTED', () => {
  // `moveq #$C,D0 / btst #4,D1 / bne / moveq #$14,D0` -- P1's hyper when P1 landed
  // the killing hit, P2's otherwise. The comment there used to say both kinds were
  // REFUSED at the allocator; W163 emptied `REFUSED_KINDS` and made that false, and a
  // stale sentence at the one site that answers D16 is worth a test.
  const src = readFileSync(path.join(GAME, 'src', 'boss.js'), 'utf8');
  const fn = src.slice(src.indexOf('function partDeathDrop'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /\(d1 & 0x10\) !== 0 \? 0x0c : 0x14/, 'the two hyper kinds');
  assert.match(body, /spawnItem\(ram, rom, ctx, d0, a6 \+ mine/, 'and it really spawns');
  assert.ok(!/REFUSES AT THE ALLOCATOR/.test(body),
    'the stale refusal claim is gone');
  assert.match(body, /W283 CORRECTION/, 'and the correction is recorded at the line');
});

test('W283 the answer to D16 is written where the next reader will be', () => {
  // Not decoration. Two waves were spent looking for a missing draw, and the thing
  // that would have stopped the second one is a sentence at the site that produces
  // the item -- so it is asserted rather than trusted.
  const src = readFileSync(path.join(GAME, 'src', 'boss.js'), 'utf8');
  const fn = src.slice(src.indexOf('function partDeathDrop'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.match(body, /TWO type-\$85 records out of 339/);
  assert.match(body, /CORRECT rather than a missing draw/);
});
