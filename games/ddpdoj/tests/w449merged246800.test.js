// W449 -- `$246800`, THE CHAIN FREE. THREE TRANSCRIPTIONS, MERGED, AND THE INVENTED CONDITION
// TAKEN OUT.
//
// W447's audit listed `$246800` as the worst of the five remaining second transcriptions: THREE
// copies of a six-instruction routine.
//
//     animobjects.js  clearChain (private) wrapped by freeAnimObjects246800   4 + 1 call sites
//     spawn.js        freeChain246800                                         0 call sites
//     stageend.js     chainFree246800                                        11 call sites
//
// **MY BRIEF SAID "1 / 1 / 10". THE MEASURED SPLIT IS 5 / 0 / 11, AND THE TOTAL IS 16, NOT 12.**
// The brief counted only call sites that went through an EXPORTED `246800`-suffixed name. It
// missed four, because `animobjects.js` reached its own body through the private name
// `clearChain` -- which is why the register scan only ever saw three claimants and not the four
// bodies that were really there. All four `clearChain` sites are genuine `$246800` calls,
// verified against the image: `$246502`, `$2465F2` and `$24686C` (`$2466E6`/`$2467E0` are the
// same `buildChain246532` body under its other heads). And `spawn.js`'s copy had NO production
// caller at all -- it was reachable only from `w341chainfree.test.js`.
//
// **THE ONE DEFECT WAS THE INVENTED CONDITION, AND FOR THE FIRST TIME IN FOUR WAVES THE LIVE
// COPY WAS NOT THE BROKEN ONE.** W446/W447/W448 each found the shipping copy wrong. Here the
// copy carrying the defect was `animobjects.js`'s -- one production caller, `stage4type9f.js`
// -- and the copy that was RIGHT in every respect was `spawn.js`'s, which nothing called.
//
//     axis                                  animobjects   spawn    stageend
//     $246804 loop top: DO-WHILE, no entry test   INVENTED   ok        ok
//     $246806 clr.w (A0)                             ok      ok        ok
//     $246808 move.w #$0,($4,A0)                     ok      ok        ok
//     $24680E/$246812 follow ($2C) and loop          ok      ok        ok
//     a corrupt ($2C) cycle names itself          ABSENT     ok      ABSENT
//     $FFFFFFFF, the loaders' failure return    RangeError RangeError RangeError
//
// **THE `$FFFFFFFF` FREE IS THE CARTRIDGE'S OWN BEHAVIOUR, NOT A PORT DEFECT.** SECTION 4
// settles it from the image: there is no guard at `$246800` and none at the caller either, and
// on the 68000 `movea.l D0,A0` + `clr.w (A0)` with D0 = `$FFFFFFFF` is a WORD access at the ODD
// address `$FFFFFF` -- an ADDRESS ERROR, vector 3. The board faults. So the port must stop too;
// what W449 changes is only that it now stops BY ADDRESS instead of raising an anonymous
// `RangeError` from `ram.js`. Adding a quiet guard would have been DEFECT 1 all over again.
//
// SURVIVOR: `animobjects.js freeAnimObjects246800`. Same rule and same file as W448 --
// `animobjects.js` imports only `ram.js` and `unported.js`, and `stageend.js` already imports
// it, so merging the other way would have turned that edge into a cycle. SECTION 2 pins the
// leafness so a later wave cannot quietly invert it.
//
// SECTION 1   the bytes: ten instruction words, the loop top, and the caller with no test
// SECTION 2   the merge: one claimant, the register at 19, the deleted names gone, still a leaf
// SECTION 2b  ALL SIXTEEN call sites reaching the survivor -- shown, not asserted
// SECTION 3   THE STATE TRACE, with palette.js as the witness outside every changed file, and
//             a decoy chain that separates "freed correctly" from "freed too much"
// SECTION 3b  the DELETED bodies, verbatim: two required to DISAGREE, one required to AGREE
// SECTION 4   THE $FFFFFFFF FREE, settled from the image
// SECTION 4b  THE RED ARM -- the same handle with the ($2C) LINKS in the OPPOSITE state. A body
//             that ignores the links passes SECTION 3 outright.
// SECTION 5   the pool did not move
//
// REPORTED, NOT FIXED -- TWO OF THE TWENTY-ONE CALLERS DO NOT REACH ANY PORT AT ALL.
// `$290846` and `$2908C2` (`objslot7pool.js` states 2 and 4) go through the OPTIONAL
// `ctx.commit246800` hook, and no production ctx supplies that key -- only
// `tests/w372pool7.test.js` does. So those two frees never run and their chains leak out of the
// twenty-slot `$80FA86` pool, while `$2912D8` in the same file calls the routine directly.
// `w375ctxkeys.test.js` still calls the key "$246800. Not ported.", untrue since W341. Wiring
// them changes live behaviour and wants its own trace; the note is in `objslot7pool.js` too.
//
// REPORTED, NOT FIXED (W448's, still open) -- `loadAnimObjects246410` returns 0 where
// `$2464F6`/`$246518` are both `70 ff`. SECTION 2b reads those two bytes, so the evidence is
// here even though the fix is not.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { Ram } from '../src/ram.js';
import { Unreached } from '../src/unported.js';
import {
  ANIM_OBJECT, freeAnimObjects246800, loadAnimObjects24652A, runAnimObjects24683E,
} from '../src/animobjects.js';
import { chainCheck24681A } from '../src/stageend.js';
import { PaletteState, PALSTAGE, flush24133C } from '../src/palette.js';

// W451 merged six `$242684` private screen tests, taking 92 to 91. W453 merged
// the exported/private `$242494` octagonal-distance pair, taking 91 to 90.
const W453_NOTE = 'W451 merged $242684 (92 - 1 = 91); W453 merged $242494 '
  + '(survivor bossscripts.js dist242494), so 91 - 1 = 90. ';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const IMAGE = here('../rip/sound/maincpu.bin');
const SKIP = existsSync(IMAGE) ? false : 'the ROM image is absent; skip, not pass';
const IMG = existsSync(IMAGE) ? readFileSync(IMAGE) : null;
const w = (a) => IMG.readUInt16BE(a);
const l = (a) => IMG.readUInt32BE(a);

const rawRom = () => ({
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a),
  i16: (a) => IMG.readInt16BE(a), u8: (a) => IMG[a],
  bytes: (a, n) => IMG.subarray(a, a + n),
});

const RESULT_SCRIPT = 0x28d862;      // 8 nodes -- the result screen's fly-away, `$28DE66`
const SPR_BASE = 0x80e886;           // $24627A[0].current -- PALETTE RAM
const SPR_DIRTY = 0x80fa66;          // $24627A[0].writer -- palette.js PALSTAGE.spr.dirty

// node/root field offsets, spelled out rather than imported so this file does not inherit a
// rename from the file it is auditing.
const F = { status: 0x00, mode: 0x04, writer: 0x06, active: 0x18, progress: 0x20, next: 0x2c };
const node = (i) => ANIM_OBJECT.nodes + i * ANIM_OBJECT.nodeStride;
const root = (i) => ANIM_OBJECT.roots + i * ANIM_OBJECT.rootStride;

// ===============================================================================================
// SECTION 1 -- THE BYTES
// ===============================================================================================

test('SECTION 1: `$246800` is TEN instruction words, and `$246804` is the LOOP TOP',
  { skip: SKIP }, () => {
    assert.equal(w(0x246800), 0x2f00, '$246800 move.l D0,-(A7)');
    assert.equal(w(0x246802), 0x2f08, '$246802 move.l A0,-(A7) -- a SECOND push, not a movem.l');
    assert.notEqual(w(0x246800), 0x48e7, '...and it is NOT movem.l, which W341 guessed in prose');
    assert.equal(w(0x246804), 0x2040, '$246804 movea.l D0,A0 -- THE LOOP TOP');
    assert.equal(w(0x246806), 0x4250, '$246806 clr.w (A0)');
    assert.equal(l(0x246808), 0x317c0000, '$246808 move.w #$0,($4,A0) (first half)');
    assert.equal(w(0x24680c), 0x0004, '  ...displacement $4');
    assert.equal(l(0x24680e), 0x2028002c, '$24680E move.l ($2C,A0),D0 -- THE LINK');
    assert.equal(w(0x246812), 0x66f0, '$246812 bne.s');
    assert.equal(w(0x246814), 0x205f, '$246814 movea.l (A7)+,A0');
    assert.equal(w(0x246816), 0x201f, '$246816 move.l (A7)+,D0 -- D0 comes back UNCHANGED');
    assert.equal(w(0x246818), 0x4e75, '$246818 rts');
  });

test('SECTION 1: `$246812 66f0` is an EIGHT-BIT displacement, and it lands on `$246804`',
  { skip: SKIP }, () => {
    // FIVE WAVES RUNNING have been bitten by `66 00`/`60 00`/`6b 00` -- a zero low byte means the
    // displacement is the NEXT WORD, and reading it as 8-bit lands inside the extension word.
    const low = w(0x246812) & 0xff;
    assert.notEqual(low, 0x00, '$246812 is NOT the wide form: a $00 low byte would make the '
      + 'displacement the following word');
    assert.notEqual(low, 0xff, '...nor the 32-bit form');
    const disp = low >= 0x80 ? low - 0x100 : low;
    assert.equal(disp, -16, '$F0 as a signed byte is -16');
    assert.equal(0x246814 + disp, 0x246804,
      'the branch is taken relative to the word AFTER the opcode, so it lands on $246804 -- '
      + 'movea.l D0,A0, which is INSIDE the loop. A0 is reloaded from D0 every iteration');
  });

test('SECTION 1: IT IS A DO-WHILE. The `if (root !== 0)` was INVENTED, at BOTH levels',
  { skip: SKIP }, () => {
    // -- level one: inside `$246800`. Nothing between the prologue and the first `clr.w` tests D0.
    assert.equal(0x246804 + 2, 0x246806, 'movea.l is two bytes wide');
    assert.equal(w(0x246806), 0x4250,
      'and the very next word IS the clr.w -- no `tst.l D0`, no `beq`, no `bra` past the first '
      + 'release. The head is freed unconditionally');
    for (const a of [0x246800, 0x246802, 0x246804]) {
      assert.notEqual(w(a) & 0xff00, 0x6700, `$${a.toString(16)} is not a beq`);
      assert.notEqual(w(a), 0x4a80, `$${a.toString(16)} is not tst.l D0`);
      assert.notEqual(w(a), 0x4a40, `$${a.toString(16)} is not tst.w D0`);
    }

    // -- level two: THE CALLER. `stage4type9f.js` is `$246800`'s only `animobjects.js`-vocabulary
    // caller, and it is `$27C724`. The guard was not moved there either; it never existed.
    assert.equal(l(0x27c716), 0x0c6d0001, '$27C716 cmpi.w #$1,($2C,A5) -- the death timer');
    assert.equal(w(0x27c71a), 0x002c, '  ...($2C,A5)');
    assert.equal(w(0x27c71c), 0x6600, '$27C71C bne.w -- and this tests the TIMER, not the handle');
    assert.equal(l(0x27c720), 0x202d0034, '$27C720 move.l ($34,A5),D0 -- the handle, loaded');
    assert.equal(w(0x27c724), 0x4eb9, '$27C724 jsr ...');
    assert.equal(l(0x27c726), 0x00246800, '  ...$246800, the VERY NEXT instruction after the load');
    assert.equal(0x27c720 + 4, 0x27c724,
      'the `move.l` is four bytes, so there is NOTHING between loading the handle and freeing it');

    // ...and the same shape at the two `stageend.js`-vocabulary sites the brief named.
    assert.equal(l(0x28d704), 0x202d0008, '$28D704 move.l ($8,A5),D0');
    assert.equal(w(0x28d708), 0x4eb9, '$28D708 jsr $246800, immediately after');
    assert.equal(l(0x291fbc), 0x202d0008, '$291FBC move.l ($8,A5),D0');
    assert.equal(w(0x291fc0), 0x4eb9, '$291FC0 jsr $24681A -- the CHECK, which is also unguarded');
    assert.equal(w(0x291fca), 0x4eb9, '$291FCA jsr $246800');
  });

test('SECTION 1: `$246800` has TWENTY-ONE callers in the image, scanned not assumed',
  { skip: SKIP }, () => {
    const hits = [];
    for (let a = 0x230000; a < 0x2b0000; a += 2) {
      const op = w(a);
      if (op === 0x4eb9 && l(a + 2) === 0x246800) hits.push(a);
      else if (op === 0x6100) {
        const d = w(a + 2) >= 0x8000 ? w(a + 2) - 0x10000 : w(a + 2);
        if (a + 2 + d === 0x246800) hits.push(a);
      } else if ((op >> 8) === 0x61 && (op & 0xff) !== 0x00 && (op & 0xff) !== 0xff) {
        const b = op & 0xff;
        if (a + 2 + (b >= 0x80 ? b - 0x100 : b) === 0x246800) hits.push(a);
      }
    }
    assert.equal(hits.length, 21,
      'W341 said twenty-one from prose; this counts them. Got: '
      + hits.map((a) => '$' + a.toString(16).toUpperCase()).join(', '));
    // The five INTERNAL ones are the sites `animobjects.js` reached through the private name.
    for (const a of [0x246502, 0x2465f2, 0x2466e6, 0x2467e0, 0x24686c]) {
      assert.ok(hits.includes(a), `$${a.toString(16).toUpperCase()} is one of the bsr callers`);
    }
    assert.equal(hits.filter((a) => w(a) === 0x4eb9).length, 16, 'and sixteen are `jsr.l`');
  });

// ===============================================================================================
// SECTION 2 -- THE MERGE
// ===============================================================================================

/** The W446/W447/W448 scan: which `export function` claims which ROM address. */
function portedIndex() {
  const SRC = here('../src');
  const files = [];
  (function walk(dir, rel) {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory()) walk(join(dir, e.name), rel + e.name + '/');
      else if (e.name.endsWith('.js')) files.push([rel + e.name, readFileSync(join(dir, e.name), 'utf8')]);
    }
  })(SRC, '');
  const inRom = (a) => a >= 0x230000 && a < 0x2b0000;
  const ported = new Map();
  for (const [file, text] of files) {
    const lines = text.split(/\r?\n/);
    lines.forEach((L, i) => {
      const fn = L.match(/^\s*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/);
      if (!fn) return;
      const claim = (a) => {
        if (!inRom(a)) return;
        if (!ported.has(a)) ported.set(a, new Set());
        ported.get(a).add(`${file}:${i + 1} ${fn[1]}`);
      };
      const suffix = fn[1].match(/([0-9a-fA-F]{6})$/);
      if (suffix) claim(parseInt(suffix[1], 16));
      let j = i - 1;
      const doc = [];
      while (j >= 0 && /^\s*(\*|\/\*\*)/.test(lines[j])) {
        doc.unshift(lines[j]);
        if (/^\s*\/\*\*/.test(lines[j])) break;
        j -= 1;
      }
      const first = doc.join('\n').match(/`?\$([0-9A-Fa-f]{6})`/);
      if (first) claim(parseInt(first[1], 16));
    });
  }
  return ported;
}

const srcText = () => {
  const SRC = here('../src');
  const out = new Map();
  for (const e of readdirSync(SRC, { withFileTypes: true })) {
    if (e.isFile() && e.name.endsWith('.js')) out.set(e.name, readFileSync(join(SRC, e.name), 'utf8'));
  }
  return out;
};

/** Comment lines are the RECORD of a merge, so every code check runs on code only. */
const codeOf = (text) => text.split('\n').filter((L) => !/^\s*(\/\/|\*|\/\*)/.test(L)).join('\n');

test('SECTION 2: `$246800` is claimed EXACTLY ONCE, and the live register is at 16', () => {
  const idx = portedIndex();
  const claims = [...(idx.get(0x246800) ?? [])].sort();
  assert.equal(claims.length, 1,
    `$246800 is claimed ${claims.length} times: ${claims.join(' / ')}. W447 measured THREE; the `
    + 'merge makes it one');
  assert.ok(claims[0].startsWith('animobjects.js'),
    'the survivor must be animobjects.js -- it is the LEAF everyone already depends on, and '
    + 'merging into stageend.js would invert the existing stageend -> animobjects edge into a '
    + `cycle. Got ${claims[0]}`);

  // THE REGISTER, held here as well as in w446/w447/w448 so deleting one guard cannot hide it.
  const dup = [...idx].filter(([, v]) => v.size > 1).map(([a]) => a).sort((x, y) => x - y);
  assert.equal(dup.length, 16,
    'W458 left 17 and W459 merged the complete $25FF38 request-poster duplicate, leaving 16. '
    + 'A new duplicate is a wave, not a row: '
    + dup.map((a) => '$' + a.toString(16).toUpperCase()).join(', '));
  assert.ok(!dup.includes(0x246800), '$246800 is off the register');
});

// W450: AND THIS WAVE IS THE PROOF THAT 19 WAS NEVER THE COUNT.
//
// `portedIndex()` above found THREE claimants of `$246800`. There were FOUR --
// `animobjects.js clearChain`, private, no name suffix, no doc, reached at four
// genuine ROM `bsr $246800` sites. The scan has no axis that could reach it.
//
// W450 widened it on three axes and re-ran: 19 -> 92 head-claimed duplicates. W451
// merged `$242684` to leave 91, W453 merged `$242494` to leave 90, W457
// merged `$25D9E6` to leave 89, W458 merged `$25DA60` to leave 88, W459
// merged `$25FF38` to leave 87, W460 removed the optional `$24631C` shim to leave 86,
// W461 merged the private `$242E24` rank-byte body to leave 85, W462 removed both
// private `$2414BE` adapter heads to leave 84, and W463 removed both private `$28C0FC`
// counted-note adapter heads to leave 83, and W464 removed the duplicate $28E7A2 clear to leave 82, and W465 removed the private $28C6C6 adapter to leave 81, and W466 removed the two name-frame range claims to leave 79, and W467 removed the private $285A12 HUD caller claim to leave 78, and W468 removed the private $2A6EDC form-1 adapter claim to leave 77, W469 removed the private $23C622 slot-12 adapter claim to leave 76, W470 removed the two Game#boot endpoint claims to leave 74, and W471 removed the parameterized emitter claim to leave 73. The body
// register started at 39 pairs, fell to 38 at W451, 37 at W453, and 36 after
// W454 merged the shared type $11/type $10 turret body. It records a shared RUN
// of ROM instructions -- the
// axis that names `clearChain`, and the ONLY one that does. W450's SECTION 6
// replays these three bodies verbatim and requires all three pairings.
test('SECTION 2e [W450/W471]: the widened register is 73, and $246800 is claimed once under IT too',
  async () => {
    const { headRegister, bodyPairs } = await import('./w450widenedscan.js');
    const wide = headRegister();
    assert.equal(wide.length, 73,
      'the widened duplicate register is not 73. ' + W453_NOTE
      + 'W457 merged $25D9E6; W458 merged $25DA60; W459 merged $25FF38; '
      + 'W460 removed the optional $24631C forwarding shim; W461 merged the private '
      + '$242E24 rank-byte body into rng.js drawByte242E24; W462 removed both private '
      + '$2414BE installTxBank heads; W463 removed both private $28C0FC counted-note heads; '
      + 'w450widenedregister.test.js SECTION 3 owns the set');
    assert.ok(!wide.includes(0x246800),
      '$246800 is claimed twice AGAIN, and this time by a scan that can see a private copy. '
      + 'That is this wave\'s merge coming undone');

    // ...and no two bodies transcribe the chain free any more. `clearChain` and
    // `chainFree246800` shared `$246806` and `$246808`; one body owns them now.
    const chain = bodyPairs().filter(([, addrs]) => addrs.some((a) => a >= 0x246800 && a <= 0x246820));
    assert.deepEqual(chain, [],
      'two bodies are transcribing $246800..$246820 again. This is the axis that would have '
      + 'caught the fourth copy in W447 instead of W449: ' + chain.map(([p]) => p).join(', '));
  });

test('SECTION 2: the two deleted bodies are GONE from src, by name', () => {
  const src = srcText();
  assert.ok(!/export function freeChain246800/.test(src.get('spawn.js')),
    'spawn.js freeChain246800 is deleted');
  assert.ok(!/export function chainFree246800/.test(src.get('stageend.js')),
    'stageend.js chainFree246800 is deleted');
  assert.ok(!/function clearChain/.test(src.get('animobjects.js')),
    'animobjects.js clearChain -- the PRIVATE fourth name that hid four call sites from the '
    + 'register scan -- is folded into freeAnimObjects246800');
  // ...and exactly one file still cites the release as its own instruction.
  const cites = [...src].filter(([, t]) => /\$246806 clr\.w \(A0\)/i.test(codeOf(t))).map(([f]) => f);
  assert.deepEqual(cites, ['animobjects.js'],
    'exactly one file may cite `$246806 clr.w (A0)` beside a store of its own');
});

test('SECTION 2: animobjects.js is STILL A LEAF, which is the whole reason it is the survivor',
  () => {
    const ao = srcText().get('animobjects.js');
    const imports = [...ao.matchAll(/from '\.\/([\w.]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(imports, ['ram.js', 'unported.js'],
      'if the merge had pulled spawn.js or stageend.js in, the existing stageend -> animobjects '
      + 'edge would be a cycle');
    // ...and the direction really is that way round.
    assert.ok(/from '\.\/animobjects\.js'/.test(srcText().get('stageend.js')),
      'stageend.js imports animobjects.js, not the other way about');
  });

// ===============================================================================================
// SECTION 2b -- EVERY CALL SITE REACHING THE SURVIVOR, SHOWN.
// ===============================================================================================
//
// SIXTEEN, not the twelve the brief named. The four extra are the `clearChain` sites: the brief
// counted only calls that went through an exported `246800`-suffixed name.

/** file -> the ROM addresses whose `jsr`/`bsr $246800` that file's calls stand for. */
const CALL_SITES = Object.freeze({
  'animobjects.js': ['$246502', '$246502', '$2465F2', '$24686C'],
  'stageend.js': ['$28D704/$28D708'],
  'hiscorescreen.js': ['$25B432', '$25B488'],
  'objslot15.js': ['$291FCA'],
  'objslot7pool.js': ['$2912D8'],
  'objslot8.js': ['$25C30A', '$25C36A', '$25C444', '$25C49E', '$25BDB4', '$25BE3E'],
  'stage4type9f.js': ['$27C724'],
});

test('SECTION 2b: all SIXTEEN call sites call the survivor, and each still names its ROM address',
  () => {
    const src = srcText();
    let total = 0;
    for (const [file, addrs] of Object.entries(CALL_SITES)) {
      const text = src.get(file);
      assert.ok(text, `${file} exists`);
      const code = codeOf(text);
      const calls = (code.match(/(?<!function )\bfreeAnimObjects246800\(/g) ?? []).length;
      assert.equal(calls, addrs.length,
        `${file} should call the survivor ${addrs.length} times, once per ROM site `
        + `(${addrs.join(', ')}); found ${calls}`);
      for (const a of new Set(addrs)) {
        assert.ok(text.includes(a),
          `${file} must still name ${a}, the ROM call this line stands for`);
      }
      total += calls;
    }
    assert.equal(total, 16,
      'sixteen production call sites. The brief said twelve because four of them went through '
      + 'the private name `clearChain`');
  });

test('SECTION 2b: the four ex-`clearChain` sites are the ROM `bsr`s, not invented cleanups',
  { skip: SKIP }, () => {
    // Each of these four lines is a real `bsr $246800` in the cartridge -- SECTION 1's scan found
    // all of them. If `clearChain` had been a port convenience, none would be here.
    assert.equal(w(0x246502), 0x6100, '$246502 bsr.w ...');
    assert.equal(0x246504 + w(0x246504), 0x246800, '  ...to $246800 ($246410 unwinds its chain)');
    assert.equal(w(0x2465f2), 0x6100, '$2465F2 bsr.w ...');
    assert.equal(0x2465f4 + w(0x2465f4), 0x246800, '  ...to $246800 ($246532 unwinds its chain)');
    assert.equal(w(0x24686c) >> 8, 0x61, '$24686C bsr.s ...');
    const d = w(0x24686c) & 0xff;
    assert.equal(0x24686e + (d - 0x100), 0x246800, '  ...to $246800 ($24683E retires a mode-1 root)');
    // and $246502's arm is reached with A1 -- the ROOT -- not with the -1 it is about to return.
    assert.equal(w(0x2464f6), 0x70ff, '$2464F6 moveq #-$1,D0');
    assert.equal(w(0x2464fc), 0x4a40, '$2464FC tst.w D0');
    assert.equal(w(0x2464fe), 0x6a08, '$2464FE bpl.s $246508 -- negative, so UNWIND');
    assert.equal(w(0x246500), 0x2009, '$246500 move.l A1,D0 -- the ROOT replaces the -1 first');
  });

test('SECTION 2b: nothing in src still NAMES the deleted symbols in code', () => {
  for (const [file, text] of srcText()) {
    const code = codeOf(text);
    assert.ok(!/\bfreeChain246800\b/.test(code), `${file} still names freeChain246800`);
    assert.ok(!/\bchainFree246800\b/.test(code), `${file} still names chainFree246800`);
    assert.ok(!/\bclearChain\b/.test(code), `${file} still names clearChain`);
  }
});

// ===============================================================================================
// SECTION 3 -- THE STATE TRACE.
//
// Witnesses OUTSIDE every file this wave touched (animobjects.js, spawn.js, stageend.js,
// hiscorescreen.js, objslot15.js, objslot7pool.js, objslot8.js, stage4type9f.js): `palette.js`
// owns `$80FA66`, `PALSTAGE`, `PaletteState` and `flush24133C`, and it is the file that turns a
// running animation node into a visible palette. Not a line of it changed.
//
// A FREE'S OBSERVABLE IS THE POOL AFTERWARDS, so the fixture is built to separate all three
// failure modes at once:
//   * FREED CORRECTLY -- the nine linked slots release, the palette they were fading FREEZES.
//   * DID NOTHING     -- the chain keeps fading for the next sixteen frames, so palette.js keeps
//                        copying and the words keep moving.
//   * FREED TOO MUCH  -- the DECOY chain planted at root 2 / nodes 16..19 comes back changed.
// ===============================================================================================

function seedPalette(ram) {
  for (let i = 0; i < 0x400; i++) ram.setU16(SPR_BASE + i * 2, (0x1000 + i) & 0x7fff);
}

/** Four claimed nodes and a root that `$24683E` will never touch: writer 0 keeps `stepNode` off
 *  them and mode 0 keeps the auto-retire off the root. Every other byte is a recognisable fill,
 *  so "freed too much" cannot hide as a zero. */
function plantDecoy(ram) {
  const slots = [16, 17, 18, 19];
  ram.setU16(root(2) + F.status, 0x8000);
  ram.setU16(root(2) + F.mode, 0);
  ram.setU32(root(2) + F.next, node(slots[0]));
  slots.forEach((s, i) => {
    for (let off = 0; off < ANIM_OBJECT.nodeStride; off += 2) {
      ram.setU16(node(s) + off, (0xc000 + s * 0x100 + off) & 0xffff);
    }
    ram.setU16(node(s) + F.status, 0x8000);
    ram.setU16(node(s) + F.mode, 0x5a00 + s);
    ram.setU32(node(s) + F.writer, 0);
    ram.setU16(node(s) + F.active, 0);
    ram.setU32(node(s) + F.next, i + 1 < slots.length ? node(slots[i + 1]) : 0);
  });
  return slots;
}

const decoyBytes = (ram, slots) => [
  ...[root(2)].flatMap((a) => Array.from({ length: 0x30 }, (_, i) => ram.u8(a + i))),
  ...slots.flatMap((s) => Array.from({ length: ANIM_OBJECT.nodeStride }, (_, i) => ram.u8(node(s) + i))),
];

const claimedNodes = (ram) => {
  const out = [];
  for (let i = 0; i < ANIM_OBJECT.nodeSlots; i++) if ((ram.u16(node(i)) & 0x8000) !== 0) out.push(i);
  return out;
};

test('SECTION 3: the eight-node result chain, freed mid-fade, with palette.js as the witness',
  { skip: SKIP }, () => {
    const rom = rawRom();
    const ram = new Ram();
    const pal = new PaletteState();
    seedPalette(ram);
    const decoy = plantDecoy(ram);
    const decoyBefore = decoyBytes(ram, decoy);

    // ---- THE LOAD.  `$28DE66 jsr $24652A` with `$28D862`: eight nodes, family 0, timing 3.
    const handle = loadAnimObjects24652A(ram, rom, RESULT_SCRIPT) >>> 0;
    assert.equal(handle, root(0), '$2465F8 move.l A1,D0 -- root slot 0, the first free one');
    assert.deepEqual(claimedNodes(ram), [0, 1, 2, 3, 4, 5, 6, 7, 16, 17, 18, 19],
      'the loader took the first eight free slots and left the decoy alone');

    // ---- SIXTEEN FRAMES OF FADE, half the chain's 32-frame life.
    for (let i = 0; i < 16; i++) runAnimObjects24683E(ram, rom);
    assert.notEqual(chainCheck24681A(ram, handle), 0, '$24681A -- the chain is still LIVE');
    assert.equal(ram.u16(SPR_DIRTY), 1, '$246B20 raised $80FA66, which is palette.js PALSTAGE');
    assert.equal(PALSTAGE.spr.dirty, SPR_DIRTY, '...palette.js agrees on the address');
    assert.equal(flush24133C(ram, pal).spr, true, 'palette.js copied the sprite region');
    assert.equal(pal.copies.spr, 1, 'exactly once so far');

    // BEFORE: the state the free is about to change, and the palette words the chain owns.
    const before = {
      rootStatus: ram.u16(root(0) + F.status),
      rootMode: ram.u16(root(0) + F.mode),
      chainHead: ram.u32(root(0) + F.next),
      claimed: claimedNodes(ram).length,
      node0Status: ram.u16(node(0) + F.status),
      node0Sub: ram.u16(node(0) + F.mode),
      node0Progress: ram.u16(node(0) + F.progress),
      node0Writer: ram.u32(node(0) + F.writer),
      chainSum: chainCheck24681A(ram, handle),
      sprDirty: ram.u16(SPR_DIRTY),
      palCopiesSpr: pal.copies.spr,
    };
    assert.deepEqual(before, {
      rootStatus: 0x8000, rootMode: 0, chainHead: node(0), claimed: 12,
      node0Status: 0x8000, node0Sub: 31, node0Progress: 16, node0Writer: 0x80fa66,
      chainSum: 0xfff8, sprDirty: 0, palCopiesSpr: 1,
    }, 'BEFORE -- root and eight nodes claimed, sixteen frames into a 32-frame fade, palette '
      + 'copied once. node0Sub is $246786\'s words-minus-one ($1F) and node0Writer is '
      + '$24676E\'s ($6,node) = $80FA66, which is the cell palette.js watches');

    const palWordsAtFree = pal.words.slice(0, 0x400);

    // ---- THE CALL.  `$27C724 jsr $246800` -- the whole routine, on a live chain.
    const released = freeAnimObjects246800(ram, handle);
    assert.equal(released, 9,
      'the ROOT plus its eight nodes -- nine `clr.w (A0)`s, because $246804 is reached with the '
      + 'ROOT in D0 and the walk follows ($2C) from there');

    const after = {
      rootStatus: ram.u16(root(0) + F.status),
      rootMode: ram.u16(root(0) + F.mode),
      chainHead: ram.u32(root(0) + F.next),
      claimed: claimedNodes(ram).length,
      node0Status: ram.u16(node(0) + F.status),
      node0Sub: ram.u16(node(0) + F.mode),
      node0Progress: ram.u16(node(0) + F.progress),
      node0Writer: ram.u32(node(0) + F.writer),
      chainSum: chainCheck24681A(ram, handle),
      sprDirty: ram.u16(SPR_DIRTY),
      palCopiesSpr: pal.copies.spr,
    };
    assert.deepEqual(after, {
      // $246806 clr.w (A0) and $246808 move.w #$0,($4,A0) -- TWO WORDS PER LINK, and no more.
      rootStatus: 0, rootMode: 0, chainHead: node(0), claimed: 4,
      node0Status: 0, node0Sub: 0,
      // ...everything else in the node SURVIVES. A free that wiped the pool would zero these.
      node0Progress: 16, node0Writer: 0x80fa66,
      chainSum: 0xfff8, sprDirty: 0, palCopiesSpr: 1,
    }, 'AFTER -- the nine links are released, the decoy\'s four are not, and the ROM clears only '
      + 'the two words it names. `($2C)` itself is NOT cleared, which is why $24681A still sums');

    // ---- THE WITNESS, OUTSIDE EVERY CHANGED FILE: palette.js goes quiet, and stays quiet.
    for (let i = 0; i < 16; i++) runAnimObjects24683E(ram, rom);
    assert.equal(ram.u16(SPR_DIRTY), 0,
      'sixteen more frames and $80FA66 was never raised again -- `$24683E` skips a root whose '
      + 'status word is no longer negative, so nothing writes palette RAM. THIS is the cell that '
      + 'separates "freed" from "did nothing": unfreed, the chain had sixteen frames left');
    assert.equal(flush24133C(ram, pal).spr, false, 'palette.js has nothing to copy');
    assert.equal(pal.copies.spr, 1, 'still one copy, sixteen frames later');
    assert.deepEqual(pal.words.slice(0, 0x400), palWordsAtFree,
      'and palette.js\'s own $A00000 is byte-identical to the moment of the free');

    // ---- THE POSITIVE CONTROL. The same fixture, the same sixteen extra frames, WITHOUT the
    // free: palette.js keeps copying and the words keep moving. Without this arm, "$80FA66 was
    // never raised again" would be satisfied by a chain that had simply run out.
    const ctlRam = new Ram();
    const ctlPal = new PaletteState();
    seedPalette(ctlRam);
    plantDecoy(ctlRam);
    const ctlHandle = loadAnimObjects24652A(ctlRam, rom, RESULT_SCRIPT) >>> 0;
    for (let i = 0; i < 16; i++) runAnimObjects24683E(ctlRam, rom);
    flush24133C(ctlRam, ctlPal);
    const ctlWordsAtFree = ctlPal.words.slice(0, 0x400);
    for (let i = 0; i < 16; i++) runAnimObjects24683E(ctlRam, rom);      // ...and NO free
    assert.equal(ctlRam.u16(SPR_DIRTY), 1,
      'CONTROL: unfreed, the chain raised $80FA66 again over the very same sixteen frames');
    assert.equal(flush24133C(ctlRam, ctlPal).spr, true, 'CONTROL: palette.js copied again');
    assert.equal(ctlPal.copies.spr, 2, 'CONTROL: twice, where the freed arm stayed at one');
    assert.notDeepEqual(ctlPal.words.slice(0, 0x400), ctlWordsAtFree,
      'CONTROL: and the palette words MOVED. This is what the free stopped');
    assert.equal(chainCheck24681A(ctlRam, ctlHandle), 0,
      'CONTROL: 32 frames is the chain\'s whole life, so it finished -- which is exactly why the '
      + 'control is needed: "nothing happened" and "the free worked" look alike at frame 32');

    // ---- FREED TOO MUCH: the decoy is untouched, to the byte.
    assert.deepEqual(decoyBytes(ram, decoy), decoyBefore,
      'root 2 and nodes 16..19 come back byte-identical. A free that walked the POOL instead of '
      + 'the ($2C) chain would have taken these too');
  });

// ===============================================================================================
// SECTION 3b -- THE DELETED BODIES, VERBATIM.
//
// TWO must DISAGREE with the survivor and ONE must AGREE. The third is the point: this is the
// first wave in four where the live copy was not the broken one, and `spawn.js`'s -- which had
// no production caller at all -- was right on every axis. Proving the agreement is how that
// stays on the record instead of being asserted in prose.
// ===============================================================================================

/** `animobjects.js`'s DELETED entry, verbatim: the invented `if`, over the old private walk. */
function deletedAnimObjectsFree(ram, root_) {
  if (root_ !== 0) {
    let at = root_;
    while (at !== 0) {
      const next = ram.u32(at + 0x2c);
      ram.setU16(at + 0x00, 0);
      ram.setU16(at + 0x04, 0);
      at = next;
    }
  }
}

/** `stageend.js`'s DELETED body, verbatim: the right shape, with no bound. `budget` is this
 *  test's own instrument -- the deleted body had none, which is the whole finding. */
function deletedStageendFree(ram, handle, budget = 100000) {
  let cur = handle >>> 0;
  let steps = 0;
  for (;;) {
    if (++steps > budget) return steps;
    ram.setU16(cur, 0);
    ram.setU16(cur + 0x04, 0);
    const next = ram.u32(cur + 0x2c);
    if (next === 0) break;
    cur = next >>> 0;
  }
  return steps;
}

/** `spawn.js`'s DELETED body, verbatim. */
function deletedSpawnFree(ram, head) {
  if (head === 0) throw new Unreached('$246800 NULL head', 0x246800);
  let at = head;
  let n = 0;
  for (;;) {
    ram.setU16(at, 0);
    ram.setU16(at + 0x04, 0);
    n += 1;
    const next = ram.u32(at + 0x2c);
    if (next === 0) return n;
    if (n > 20) throw new Unreached('$246800 cycle', 0x246812);
    at = next;
  }
}

test('SECTION 3b: the DELETED animobjects.js entry SWALLOWS a null head; the survivor refuses',
  () => {
    const a = new Ram();
    // The deleted body: silent no-op, and the caller never learns its bookkeeping is wrong.
    assert.doesNotThrow(() => deletedAnimObjectsFree(a, 0),
      'the deleted `if (root !== 0)` returns quietly -- and there is no branch behind it in the '
      + 'ROM (SECTION 1), so this arm is pure port invention');
    // The survivor: located, by address.
    const b = new Ram();
    assert.throws(() => freeAnimObjects246800(b, 0),
      (e) => e instanceof Unreached && e.romAddress === 0x246800,
      'the survivor names $246800. The ROM would `clr.w ($0)` -- a write into the 68000 vector '
      + 'table -- and W341 refused it by address rather than hide the caller\'s defect');
  });

test('SECTION 3b: the DELETED stageend.js body has NO BOUND, so a corrupt link hangs the suite',
  () => {
    const a = new Ram();
    a.setU16(node(0), 0x8000);
    a.setU32(node(0) + F.next, node(0));                 // a node linked to itself
    assert.equal(deletedStageendFree(a, node(0), 5000), 5001,
      'the deleted body ran out this test\'s instrument instead of terminating. In src it had no '
      + 'instrument at all: it would spin forever, and a hanging suite is a worse way to learn '
      + 'about a corrupt ($2C) than a failing one');
    const b = new Ram();
    b.setU16(node(0), 0x8000);
    b.setU32(node(0) + F.next, node(0));
    assert.throws(() => freeAnimObjects246800(b, node(0)),
      (e) => e instanceof Unreached && e.romAddress === 0x246812,
      'the survivor names $246812, the `bne` that would have looped');
  });

test('SECTION 3b: the DELETED spawn.js body AGREES with the survivor, cell for cell -- it was '
  + 'the copy that was RIGHT', { skip: SKIP }, () => {
    const rom = rawRom();
    const build = () => {
      const ram = new Ram();
      seedPalette(ram);
      plantDecoy(ram);
      const h = loadAnimObjects24652A(ram, rom, RESULT_SCRIPT) >>> 0;
      for (let i = 0; i < 16; i++) runAnimObjects24683E(ram, rom);
      return { ram, h };
    };
    const survivor = build();
    const deleted = build();
    assert.deepEqual([...deleted.ram.b], [...survivor.ram.b], 'the two fixtures start identical');

    const nSurvivor = freeAnimObjects246800(survivor.ram, survivor.h);
    const nDeleted = deletedSpawnFree(deleted.ram, deleted.h);
    assert.equal(nSurvivor, nDeleted, 'both release nine links');
    assert.deepEqual([...deleted.ram.b], [...survivor.ram.b],
      'ALL 128 KiB of RAM identical. Three waves running the live copy was the broken one; here '
      + 'the copy with ZERO production callers was the correct one, and the live one carried the '
      + 'invented condition. Whichever body survived, the merge had to keep THIS behaviour');
  });

// ===============================================================================================
// SECTION 4 -- THE $FFFFFFFF FREE, SETTLED FROM THE IMAGE.
//
// The brief asked whether the ROM guards it or whether the cartridge genuinely frees a -1 handle.
// IT GENUINELY DOES, AND IT FAULTS. That makes the port's refusal faithful, not defensive.
// ===============================================================================================

test('SECTION 4: every failure arm in this family returns $FFFFFFFF, and the callers store it',
  { skip: SKIP }, () => {
    for (const a of [0x246608, 0x2465e6, 0x2464f6, 0x246518]) {
      assert.equal(w(a), 0x70ff,
        `$${a.toString(16).toUpperCase()} moveq #-$1,D0 -- $FFFFFFFF, not 0`);
    }
    // `stage4type9f.js`'s handle: ONE writer in the whole $27C000..$27D000 page, and it is the
    // `jsr $24652A` in `kill9F`. So `($34,A5)` holds exactly what the loader returned.
    const writers = [];
    for (let a = 0x27c000; a < 0x27d000; a += 2) {
      if (w(a) === 0x2b40 && w(a + 2) === 0x0034) writers.push(a);
    }
    assert.deepEqual(writers.map((a) => '$' + a.toString(16).toUpperCase()), ['$27CB6E'],
      '($34,A5) has exactly one writer, `$27CB6E move.l D0,($34,A5)` in the fatal-hit arm');
    assert.equal(w(0x27cb68), 0x4eb9, '$27CB68 jsr ...');
    assert.equal(l(0x27cb6a), 0x0024652a, '  ...$24652A, whose failure arm is $246608');
  });

test('SECTION 4: the board FAULTS on it -- `$FFFFFF` is odd, and `clr.w` there is an ADDRESS '
  + 'ERROR', { skip: SKIP }, () => {
    // There is nothing to port. $246804 is reached with D0 = $FFFFFFFF and there is no test.
    assert.equal(w(0x246804), 0x2040, '$246804 movea.l D0,A0 -- A0 := $FFFFFFFF');
    assert.equal(w(0x246806), 0x4250, '$246806 clr.w (A0) -- a WORD access');
    const bus = 0xffffffff & 0xffffff;
    assert.equal(bus, 0xffffff, 'the 68000 puts 24 bits on the bus');
    assert.equal(bus & 1, 1,
      'and $FFFFFF is ODD. A word or long access at an odd address is a 68000 ADDRESS ERROR '
      + '(vector 3), so the cartridge does not survive this either -- a crash the board also has '
      + 'is not a defect the port should smooth over');
    // `$24681A`, which most callers run FIRST, faults on the same handle for the same reason.
    assert.equal(l(0x246822), 0x2028002c, '$246822 move.l ($2C,A0),D0');
    assert.equal((0xffffffff + 0x2c) & 0xffffff, 0x2b, '$FFFFFFFF + $2C wraps to $00002B');
    assert.equal(0x2b & 1, 1, '...also odd, so the CHECK faults before the FREE is ever reached');
  });

test('SECTION 4: the survivor refuses BY ADDRESS, and does NOT quietly swallow it', () => {
  const ram = new Ram();
  assert.throws(() => freeAnimObjects246800(ram, 0xffffffff),
    (e) => e instanceof Unreached && e.romAddress === 0x246804,
    'W448 left this to W449 as a live RangeError out of ram.js. It is still a stop -- because '
    + 'the board stops too -- but it now names $246804, the instruction that faults');
  assert.throws(() => freeAnimObjects246800(ram, -1 >>> 0),
    (e) => e instanceof Unreached, 'and a signed -1 is the same handle');

  // THE ANTI-INVENTION CHECK. A guard that RETURNED here would be DEFECT 1 all over again: a
  // branch the ROM does not have, hiding a caller that freed a load which failed.
  const src = readFileSync(here('../src/animobjects.js'), 'utf8');
  assert.ok(!/if\s*\(\s*(root|head|first)\s*!==?\s*0\s*\)\s*(return|\{?\s*$)/m.test(
    src.slice(src.indexOf('export function freeAnimObjects246800'))),
  'freeAnimObjects246800 must not regrow an entry test -- $246804 is the loop top and the head '
    + 'is freed unconditionally');
  assert.ok(!/return;\s*\/\/ \$246804/.test(src), 'and it must not return quietly at the loop top');
});

// ===============================================================================================
// SECTION 4b -- THE RED ARM: THE SAME HANDLE WITH THE `($2C)` LINKS IN THE OPPOSITE STATE.
//
// W448's lesson was that a state trace built from script-derived cells is satisfied by a body
// that ignores its inputs. SECTION 3 has the same hole: a free that cleared THE WHOLE POOL, or a
// fixed nine slots from the pool base, or only the head, would put the pool in a state SECTION 3
// would largely accept -- the chain stops fading either way.
//
// `($2C)` is the only input this routine has that lives in RAM. So the arm runs the SAME handle
// over the SAME number of links with the links pointing at the OTHER HALF OF THE POOL, and
// requires the two released sets to be DISJOINT. A body that does not follow `($2C)` releases
// the same set both times and cannot pass.
// ===============================================================================================

/** Claim every one of the twenty node slots, then link `order` into a chain under root 0. */
function poolWithChain(order) {
  const ram = new Ram();
  for (let i = 0; i < ANIM_OBJECT.nodeSlots; i++) {
    ram.setU16(node(i) + F.status, 0x8000);
    ram.setU16(node(i) + F.mode, 0x1000 + i);
    ram.setU32(node(i) + F.next, 0);
  }
  ram.setU16(root(0) + F.status, 0x8000);
  ram.setU16(root(0) + F.mode, 0x0777);
  ram.setU32(root(0) + F.next, node(order[0]));
  order.forEach((s, i) => ram.setU32(node(s) + F.next, i + 1 < order.length ? node(order[i + 1]) : 0));
  return ram;
}

const releasedSet = (ram) => {
  const out = [];
  for (let i = 0; i < ANIM_OBJECT.nodeSlots; i++) if (ram.u16(node(i) + F.status) === 0) out.push(i);
  return out;
};

test('SECTION 4b: the same handle, the ($2C) links in the OPPOSITE state, DISJOINT results', () => {
  const ARM_A = [0, 1, 2, 3, 4, 5, 6, 7];
  const ARM_B = [12, 13, 14, 15, 16, 17, 18, 19];

  const a = poolWithChain(ARM_A);
  const b = poolWithChain(ARM_B);
  assert.equal(a.u32(root(0) + F.next), node(0), 'arm A: the head link points into the low half');
  assert.equal(b.u32(root(0) + F.next), node(12), 'arm B: ...and into the high half');

  const nA = freeAnimObjects246800(a, root(0));
  const nB = freeAnimObjects246800(b, root(0));
  assert.equal(nA, 9, 'arm A released nine links');
  assert.equal(nB, 9, 'arm B released nine links -- the SAME COUNT, which is the point');

  const setA = releasedSet(a);
  const setB = releasedSet(b);
  assert.deepEqual(setA, ARM_A, 'arm A released exactly the slots its links named');
  assert.deepEqual(setB, ARM_B, 'arm B released exactly the slots ITS links named');
  assert.deepEqual(setA.filter((s) => setB.includes(s)), [],
    'the two sets are DISJOINT. A body that cleared the pool, or a fixed run of slots from '
    + '$80FA86, or only the head, would release the SAME set in both arms and would satisfy '
    + 'SECTION 3 outright -- the chain stops fading whichever slots you clear. `($2C)` is the '
    + 'only input living in RAM, so this is the only arm that separates a walk from a wipe');

  // ...and each arm left the OTHER arm's slots claimed, in the same pool, in the same call.
  for (const s of ARM_B) assert.equal(a.u16(node(s) + F.status), 0x8000, `arm A left node ${s}`);
  for (const s of ARM_A) assert.equal(b.u16(node(s) + F.status), 0x8000, `arm B left node ${s}`);
  for (const s of [8, 9, 10, 11]) {
    assert.equal(a.u16(node(s) + F.status), 0x8000, `arm A left the unlinked node ${s}`);
    assert.equal(b.u16(node(s) + F.status), 0x8000, `arm B left the unlinked node ${s}`);
  }
});

test('SECTION 4b: the walk follows ($2C) even when it runs BACKWARD through the pool', () => {
  // `$246804 movea.l D0,A0` reloads A0 from the link every iteration -- it does not step by
  // `$70`. A body that advanced by the stride would pass a forward-ordered fixture.
  const order = [19, 3, 11, 7, 15, 1];
  const ram = poolWithChain(order);
  assert.equal(freeAnimObjects246800(ram, root(0)), order.length + 1, 'root plus six nodes');
  assert.deepEqual(releasedSet(ram), [...order].sort((x, y) => x - y),
    'exactly the six the links named, in whatever order they sit in the pool');
  assert.equal(ram.u16(node(0) + F.status), 0x8000,
    'node 0 -- the pool BASE, and the slot a stride-walker would have taken first -- survives');
  assert.equal(ram.u16(node(2) + F.status), 0x8000, 'and so does node 2');
});

// ===============================================================================================
// SECTION 5 -- THE POOL DID NOT MOVE.
// ===============================================================================================

test('SECTION 5: the pool geometry is one set of constants, and the pools still ABUT',
  { skip: SKIP }, () => {
    assert.equal(w(0x2465de), 0x45ea, '$2465DE lea (d16,A2),A2 -- the node stride');
    assert.equal(w(0x2465e0), 0x0070, '  ...and it is $70');
    assert.equal(w(0x246600), 0x43e9, '$246600 lea (d16,A1),A1 -- the root stride');
    assert.equal(w(0x246602), 0x0030, '  ...and it is $30');
    assert.equal(ANIM_OBJECT.nodes + ANIM_OBJECT.nodeSlots * ANIM_OBJECT.nodeStride,
      ANIM_OBJECT.roots, '$80FA86 + 20 * $70 == $810346 -- the node pool ends EXACTLY at the '
      + 'root pool base, which is what proves both strides');
    assert.equal(ANIM_OBJECT.roots + ANIM_OBJECT.rootSlots * ANIM_OBJECT.rootStride, 0x8103d6,
      'and the root pool is three $30 slots');
    // the release is the exact inverse of `$246520`'s claim, which is what makes NEGATIVE mean
    // occupied at both ends.
    assert.equal(l(0x246540), 0x32bc8000, '$246540 move.w #$8000,(A1) -- THE CLAIM');
    assert.equal(l(0x246544), 0x33460004, '$246544 move.w D6,($4,A1)');
    assert.equal(w(0x24653a), 0x4a51, '$24653A tst.w (A1)');
    assert.equal(w(0x24653c), 0x6b00, '$24653C bmi -- so NEGATIVE means occupied');
  });

test('SECTION 5: the cycle bound is the pool size, and it moved WITH the body', () => {
  const src = readFileSync(here('../src/animobjects.js'), 'utf8');
  assert.ok(/const CHAIN_CAP = 20;/.test(src), 'CHAIN_CAP lives with the survivor now');
  assert.ok(!/CHAIN_CAP/.test(codeOf(readFileSync(here('../src/spawn.js'), 'utf8'))),
    'and no longer DECLARED in spawn.js, where it sat beside the body W449 deleted (the comment '
    + 'block there is the record of the move, and is meant to stay)');
  assert.equal(ANIM_OBJECT.nodeSlots, 20, 'and 20 is the pool, not a number someone liked');

  // a chain of the FULL pool -- root plus twenty -- is legal and must not trip the bound.
  const ram = poolWithChain(Array.from({ length: 20 }, (_, i) => i));
  assert.equal(freeAnimObjects246800(ram, root(0)), 21, 'root plus all twenty nodes');
  assert.deepEqual(releasedSet(ram), Array.from({ length: 20 }, (_, i) => i), 'all released');
});
