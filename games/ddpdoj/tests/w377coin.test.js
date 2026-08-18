// W377 -- THE COIN CRASH.
//
// Before this wave, the shortest path a player has into this port ended in a thrown Error.
// On a COLD boot (`new Game(new Uint8Array(0x20000), tables)` -- no seed image, zeroed main
// RAM) the sequence is:
//
//   frame   0..300  slot [8] arm 13, the warning screen, running its $12C timeout
//   frame     301   $25ABE8's timeout expires -> $25A764 writes $812E56 = 2
//   frame     303+  the dispatch tail draws the credit line ($23CFDE, fronttext.js)
//   frame     319   the coin chain finalises: $80395A 0 -> 1
//   frame     320   $25A770's coin gate ($25A7C0) tears the screen down and RESTAGES at state 3
//   frame     321   arm 3's init runs -- and threw.
//
// What it threw was `sound.postWrapper: no wrapper at $28C170`, from `objslot8.js` arm 3's
// `ctx?.soundPost?.(SCREEN8.cueBgm)` at `$25A962`.
//
// W377's fix was at the call site: arm 3 stopped posting the address and counted it instead.
// `$28C170` MUST NOT be added to `WRAPPERS` -- `src/sound.js`'s own header decodes it and shows
// it calls `$28BBAC`, a different packer from the `$28BB04` that every `WRAPPERS` row describes,
// with no id, no pan and no channel nibble. A row for it would be three invented fields.
//
// **W425 (DOCKET D58) UPDATED SECTIONS 1, 2 AND 3, AND THE REASON IS NOT THAT W377 WAS WRONG.**
// W377 could only choose between a crash and a silence, because `sound.js` had one packer.
// W423 built the `$28BBAC` tier its own posting path (`postBgmCommand`) and W425 made
// `postWrapper` DISPATCH to it, exactly as it already dispatches to `postStreamingLeaf`. So the
// third option exists now: arm 3 posts the cue, nothing throws, and `$28C170` still has no
// `WRAPPERS` row. **"NO ROW" AND "NO POST" WERE TREATED AS ONE CLAIM FOR EIGHT WAVES AND THEY
// ARE TWO.** Section 3 below now pins both halves separately so they cannot merge again.
//
// This mattered to a player, not just to a census: the owner reported the boss explosion having
// no sound, and one missing posting path had silenced NINE call sites at once -- this credit
// screen, the boss clear, the ending, the game over, HIBACHI's phase-A death, the scroll VM's
// cue op, slot [7]'s state 0, the tally screen and the high-score screen.
//
// SECTION 4 IS A DIFFERENT DEFECT THAT LOOKED LIKE THE SAME ONE: `$28C0FC`, posted at three more
// sites in `objslot8.js`. It is `$28BB76`, a THIRD packer, and W425 did not close it -- which is
// why `postBgmCommand` refuses anything outside its two-member tier.
// SECTION 5 (below) is unit B's half: `$25AFD8`, ported for real.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { SOUND, SOUND_WRAPPERS, STREAMING_LEAVES, postWrapper, SoundState } from '../src/sound.js';
import { SCREEN8, setState25A764 } from '../src/objslot8.js';
import { ALLOC } from '../src/objalloc.js';
import { FRONTTEXT } from '../src/fronttext.js';
import { Ram } from '../src/ram.js';

const TABLES = fileURLToPath(new URL('../rip/port/player.tables.json', import.meta.url));
const tablesJson = JSON.parse(readFileSync(TABLES, 'utf8'));

/** A COLD board: no seed image at all, so main RAM is zeroed and every value the run depends on
 *  has to be produced by `boot()` and the frames after it. This is the scenario the brief names
 *  and it is strictly harsher than `rip/web/seed.bin`, which arrives with credits and dips
 *  already set. */
const coldGame = () => new Game(new Uint8Array(0x20000), tablesJson, { palCatchUp: false });

/** ACTIVE LOW `$C08004`: idle is $FFFF and a held switch CLEARS its bit. Built from `COIN_BITS`
 *  so a bit renumbering in `web/input.js` is caught here rather than credited to the wrong slot. */
const coinWord = (...names) => {
  let w = 0xffff;
  for (const n of names) w &= ~(1 << COIN_BITS[n]) & 0xffff;
  return w;
};

const NO_PLAYER = 0xffff;
const CREDITS = COIN.creditA + 2;                 // $80395A

/**
 * `$803957` -- THE COINAGE BYTE, AND WHY IT IS SEEDED RATHER THAN "FIXED".
 *
 * On zeroed RAM it is 0, `coinage13CE22` divides by it, and a coin is worth NOTHING. That is
 * FAITHFUL: a real board's `$803957` comes out of the settings block, and a cold cartridge with
 * no settings really does eat coins. `rip/web/seed.bin` carries 1 because the board it was
 * ripped from had been configured. So the test seeds the dip -- one coin, one credit -- exactly
 * as a service menu would, and does not touch `coinage13CE22`.
 */
const COINAGE = 0x803957;

/** Run `n` logic frames with `word` on the coin port and nothing on the player port. */
function run(g, word, n) {
  g.coinPort = word;
  for (let i = 0; i < n; i++) g.step(NO_PLAYER);
}

/** The `UnportedLog` keys carrying `addr`, as raw strings, so a test can assert on the reason
 *  text as well as the address. */
const noted = (g, addr) =>
  [...g.unportedLog.calls.keys()].filter((k) => k.startsWith(`$${addr.toString(16).toUpperCase()} `));

// ---------------------------------------------------------------------------------------------
// 1 -- THE REGRESSION. THE REAL PATH, END TO END.
//
// This is the test the wave exists for. Before W377, `g.step()` on the frame after the coin
// credits threw:
//
//   Error: sound.postWrapper: no wrapper at $28C170 -- add it to WRAPPERS or fix the call site
//
// Nothing is stubbed: the coin arrives on `$C08004`, `$13CEC8` debounces it across IRQ4 phases,
// `$13CFBA`/`$13CF86` consume the pending word, `coinage13CE22` credits `$80395A`, `$25A7C0`
// tears the screen down and restages, and arm 3's init is reached by the object driver.
//
// W425: the survival is unchanged, but the REASON is now that the address resolves rather than
// that the line was demoted to a note. Ablate `postWrapper`'s `$28C170` dispatch and this reds
// again with the same message.
// ---------------------------------------------------------------------------------------------

test('W425 a cold boot SURVIVES a coin, and arm 3 POSTS $28C170 rather than throwing', () => {
  const g = coldGame();
  g.boot();
  g.ram.setU8(COINAGE, 1);                        // the service-menu dip; see COINAGE above

  assert.equal(g.ram.u8(CREDITS), 0, 'a cold board starts with no credits');

  // Let the warning screen run its $12C timeout out. State 13 -> 2 at frame 301.
  run(g, COIN.idle, 305);
  assert.equal(g.ram.u16(SCREEN8.state), 0x0002, 'the warning screen handed over to state 2');

  // A tap: 12 video frames held is ~6 debounce calls, inside the ROM's [3, $26] window.
  run(g, coinWord('COIN1'), 12);
  assert.equal(g.ram.u8(CREDITS), 0, 'a HELD coin credits nothing -- the credit is on RELEASE');

  // Release. The credit lands, and THE VERY NEXT FRAMES ARE THE ONES THAT USED TO THROW.
  run(g, COIN.idle, 12);
  assert.equal(g.ram.u8(CREDITS), 1, 'the release credited exactly one coin');
  assert.equal(g.ram.u16(SCREEN8.state), 0x0003, '$25A7C0 restaged slot [8] at state 3');

  // And it keeps running. Twenty more frames of arm 3 with no input at all.
  run(g, COIN.idle, 20);
  assert.equal(g.ram.u16(SCREEN8.state), 0x0003, 'arm 3 holds -- the credit screen is up');
  assert.equal(g.ram.u8(CREDITS), 1, 'and the credit is still there, spent by nothing');
});

// ---------------------------------------------------------------------------------------------
// 2 -- THE CUE REACHES THE RING, AND IS NOT COUNTED ANY MORE.
//
// **THIS SECTION IS THE INVERSE OF WHAT IT WAS, AND THE INVERSION IS THE BEHAVIOUR CHANGE.**
// W377 asserted the log must NAME `$28C170` against arm 3's own call site, because a crash fixed
// by deleting the line would pass test 1 just as well -- exactly the silent no-op
// `src/unported.js` exists to prevent. That guard is still needed and it has simply moved: a
// deleted line now shows up as a MISSING POST rather than a missing note. So this asserts the
// ring, and asserts the note is gone, because a note that survives its own port is the stale
// note `w382stalenotes` exists to catch.
//
// $28C170 posts $15000000: `((D0<<8|D1)&$FFFF)<<16` with D0=$15, D1=0, and a ZERO low word.
// ---------------------------------------------------------------------------------------------

test('W425 the surviving run POSTS $15000000 for $25A962 and counts nothing', () => {
  const g = coldGame();
  g.boot();
  g.ram.setU8(COINAGE, 1);
  run(g, COIN.idle, 305);

  assert.deepEqual(noted(g, 0x28c170), [],
    'POSITIVE CONTROL: before the coin, nothing on this path has cued $28C170');
  const before = g.sound.doorLog.filter((d) => d.word === 0x15000000).length;
  assert.equal(before, 0, 'POSITIVE CONTROL: and no $15000000 has been drained either');

  run(g, coinWord('COIN1'), 12);
  run(g, COIN.idle, 12);

  // The drain moves one longword per frame, so twelve idle frames are plenty for one cue.
  const drained = g.sound.doorLog.filter((d) => d.word === 0x15000000);
  assert.equal(drained.length, 1,
    'arm 3 posted $15000000 exactly once -- ($3,A5) latches the init, so it is not per-frame');
  assert.equal(drained[0].type, 0x15, 'the command byte is $15, out of `move.w #$15,D0`');
  assert.equal(drained[0].word & 0xffff, 0,
    'and the low word is ZERO -- no id, no channel nibble, which is what $28BBAC packs');

  assert.deepEqual(noted(g, 0x28c170), [],
    'and $28C170 is NOT counted as unported: it is posted, so a note would be a lie');
});

// ---------------------------------------------------------------------------------------------
// 3 -- THE FIX IS STILL NOT "ADD IT TO WRAPPERS", AND THAT IS NOW A SEPARATE CLAIM FROM
// "IT THROWS". W377 wrote them as one test and they are two facts:
//
//   (a) `$28C170` has no `WRAPPERS` row and is not a streaming leaf. STILL TRUE, permanently:
//       it has none of that table's three immediates and a row would invent all three.
//   (b) `postWrapper` throws on it. NO LONGER TRUE, and it never followed from (a). W425 made
//       `postWrapper` DISPATCH to `postBgmCommand` for this one address, the same way it
//       already dispatches to `postStreamingLeaf` for the `$28CB38` family.
//
// Conflating (a) with (b) is what kept nine call sites silent for eight waves, so both are
// pinned here, separately, with the pack asserted so a future row cannot slip in unnoticed.
// ---------------------------------------------------------------------------------------------

test('W425 $28C170 still has NO WRAPPERS row, and posting it no longer throws', () => {
  assert.equal(SOUND_WRAPPERS[0x28c170], undefined, '(a) $28C170 has no wrapper row');
  assert.equal(STREAMING_LEAVES.has(0x28c170), false, 'and it is not a streaming leaf either');

  const ram = new Ram();
  const sound = new SoundState();
  // (b) it posts, and it posts the $28BBAC shape -- NOT a packLongword with invented fields.
  assert.equal(postWrapper(ram, sound, 0x28c170), true, '(b) posting it succeeds');
  assert.equal(ram.u32(SOUND.ring), 0x15000000,
    'and what landed is $15000000: packed word high, low word ZERO');

  // ITS SIBLING IS STILL REFUSED BY ADDRESS, and that refusal is deliberate. `$28C186` takes D1
  // FROM THE CALLER (`background.js`'s cue sub-op 2 reads a real D1 out of the stage script), so
  // an address-only post would send command $1600 for every one of them. Loud, not silent.
  assert.throws(() => postWrapper(ram, sound, 0x28c186),
    /takes D1 FROM THE CALLER/, '$28C186 must be posted with an explicit D1');

  // POSITIVE CONTROL: an address that IS a WRAPPERS row posts too, so the assertions above are
  // about these two addresses and not about `postWrapper` being broken. $28C5B0 is arm 3's
  // neighbour in the coin teardown's two pairs and it stays an ordinary `soundPost`.
  assert.ok(SOUND_WRAPPERS[SCREEN8.cueWrapper], '$28C5B0 IS a WRAPPERS row');
  assert.doesNotThrow(() => postWrapper(ram, sound, SCREEN8.cueWrapper));

  // NEGATIVE CONTROL: an address in neither table is still a loud gap.
  assert.throws(() => postWrapper(ram, sound, 0x28c0fc),
    /no wrapper at \$28C0FC/, '$28C0FC is $28BB76, a third packer, and is NOT closed by this');
});

// ---------------------------------------------------------------------------------------------
// 4 -- THE SECOND ONE, FOUND WHILE FIXING THE FIRST. `$28C0FC`.
//
// `objslot8.js` posted `$28C0FC` at THREE more sites, and `$28C0FC` is unpostable for exactly
// the same reason as `$28C170`: it is `movem / jsr $28BB76 / movem / rts`, and `$28BB76` builds
// the bare longword `$10000000` (moveq #$10 / lsl.w #8 / swap) and enqueues it. No id, no pan,
// no channel. `sound.js` carries it in `ENTRY` but `postWrapper` reads `WRAPPERS` and
// `STREAMING_LEAVES`, so `ctx.soundPost(0x28C0FC)` threw.
//
// TWO of the three are in the COIN TEARDOWN `$25A7C0` itself, which makes this the same bug as
// unit A wearing a different address. Before the fix, BOTH of the branches below threw
// `no wrapper at $28C0FC` on the frame the coin credited. `$25A7FA`'s branch in particular is
// one a player reaches without any help: attract goes to state 12 and a coin lands there.
//
// The state / dual-gate writes below are SCAFFOLDING and are labelled as such: they put the
// machine in a condition the cartridge reaches on its own but that this run does not reach at
// +305, which is still inside arm 13's warning screen.
//
// **W389 HAD TO REPAIR THE STATE-12 SCAFFOLDING, and the reason is worth keeping.** It used to
// be a bare `move.w #$C,$812E56`. That was harmless while arm 12's screen was a pair of counted
// notes; now that `$25C2AE`/`$25C2EA` are ported it is not, because `($3,A5)`, the per-arm INIT
// flag, is still 1 from arm 13. Writing the state word raw skips `$25A764`'s `clr.b ($3,A5)`, so
// arm 12's init never runs, `$812E76` is zero, and `$25C300 jsr $24681A` walks `($2C)` off a null
// handle -- `$2C is outside main RAM`. That is exactly the honest crash `objslot8.js`'s arm-2
// comment describes for `$25B412`, and it is a property of the SCAFFOLDING, not of the port: on
// every real path into arm 12 the transition goes through `$25A764` and the init runs first. The
// fix is to make the scaffolding take the cartridge's own transition.
// ---------------------------------------------------------------------------------------------

/** The live slot [8] record in the allocator table -- the A5 `$25A764` expects. */
function slot8Record(g) {
  for (let i = 0; i < ALLOC.slots; i++) {
    const a = ALLOC.table + i * ALLOC.stride;
    if ((g.ram.u16(a) & 0xff) === 8) return a;
  }
  throw new Error('slot [8] is not in the object table');
}

for (const [name, seed, site] of [
  ['the dual-play gate $803926 ($25A7E2)', (g) => g.ram.setU16(0x803926, 1), '$25A7E2'],
  // W389 -- through `$25A764`, so `($3,A5)` is cleared and arm 12's init runs. See above.
  ['state 12 ($25A7FA)', (g) => setState25A764(g.ram, slot8Record(g), 0x000c), '$25A7FA'],
]) {
  test(`W377 a coin taken through ${name} survives and counts $28C0FC`, () => {
    const g = coldGame();
    g.boot();
    g.ram.setU8(COINAGE, 1);
    run(g, COIN.idle, 305);
    seed(g);                                    // SCAFFOLDING -- see the block comment above

    run(g, coinWord('COIN1'), 12);
    run(g, COIN.idle, 12);

    assert.equal(g.ram.u8(CREDITS), 1, 'the coin credited');
    assert.equal(g.ram.u16(SCREEN8.state), 0x0003, 'and the teardown restaged at state 3');
    const keys = noted(g, 0x28c0fc);
    assert.equal(keys.length, 1, 'exactly one $28C0FC deferral, from this branch');
    assert.ok(keys[0].includes(site), `and it names ${site}`);
    assert.match(keys[0], /\$28BB76/, 'and which packer it goes through');
  });
}

test('W377 $28C0FC is in neither sound table, so posting it would still throw', () => {
  assert.equal(SOUND_WRAPPERS[SCREEN8.cueStream], undefined, '$28C0FC has no wrapper row');
  assert.equal(STREAMING_LEAVES.has(SCREEN8.cueStream), false, 'and is not a streaming leaf');
  assert.throws(() => postWrapper(new Ram(), new SoundState(), SCREEN8.cueStream),
    /no wrapper at \$28C0FC/);
});

// ===============================================================================================
// UNIT B (HALF) -- `$25AFD8`, THE BLINK MESSAGE'S **OFF** SIDE.
//
// The brief called `$25AD02`/`$25AFD8` "a prompt that blinks. Port both." They are not a pair of
// comparable routines. `$25AFD8` is ELEVEN instructions ending in a tail `jmp`; `$25AD02` runs
// from `$25AD02` to `$25B3DB` -- 1,754 bytes, two embedded data blocks, two coordinate
// conventions and a whole second copy for separate credit pools. So this wave ports `$25AFD8`
// whole and leaves `$25AD02` a counted deferral with its map written down in `fronttext.js`.
// ===============================================================================================

const IMGPATH = fileURLToPath(new URL('../rip/sound/maincpu.bin', import.meta.url));
const IMG = readFileSync(IMGPATH);

/** A ROM face over the raw image -- no windows, for the tests whose subject is the DISASSEMBLY. */
const rawRom = () => ({
  u32: (a) => IMG.readUInt32BE(a), u16: (a) => IMG.readUInt16BE(a), u8: (a) => IMG[a],
  i16: (a) => IMG.readInt16BE(a), bytes: (a, n) => IMG.subarray(a, a + n),
});

/** `RomWindows` from the exported table with `drop` (window bases) REMOVED -- the ablation
 *  harness. A window claim is proved by the exact `Unreached` address its absence produces. */
async function windowedRom(drop = []) {
  const { RomWindows } = await import('../src/rom.js');
  const spec = tablesJson.rom;
  const kept = spec.windows.filter(
    (w) => !drop.includes(parseInt(String(w.base).replace('$', ''), 16)));
  assert.equal(kept.length, spec.windows.length - drop.length,
    'the ablation must actually remove the named window -- a no-op filter proves nothing');
  return new RomWindows({ ...spec, windows: kept });
}

/** The tilemap read back along one `$25A14C` string, i.e. one value of its D1. `$240CF0` puts the
 *  character BYTE straight in the tile's high word, so this reads back as ASCII with no table. */
function txColumn(tx, col) {
  let s = '';
  for (let r = 0; r < 32; r++) {
    const v = tx.long(0x904000 + (r * 64 + col) * 4);
    s += v === 0 ? '.' : String.fromCharCode((v >>> 16) & 0x3fff);
  }
  return s;
}

function caught(fn) {
  try { fn(); } catch (e) { return e; }
  return assert.fail('expected a throw and got a clean return');
}

test('W377 $25AFD8 is eleven instructions and the disassembly says what the port says', () => {
  // The exact bytes, in order. `aligned.py sweep 0x25AFD8 0x25B008` reports NINE because it
  // mis-sizes `adda.w #imm,An` (see fronttext.js); these are the eleven real instructions.
  const words = [
    [0x25afd8, 0x41fa], [0x25afda, 0xfd64],   // lea (-$29C,pc),a0
    [0x25afdc, 0x303c], [0x25afde, 0x0000],   // move.w #$0,d0
    [0x25afe0, 0x323c], [0x25afe2, 0x0013],   // move.w #$13,d1
    [0x25afe4, 0x343c], [0x25afe6, 0x0000],   // move.w #$0,d2
    [0x25afe8, 0x4eb9],                       // jsr $25A14C
    [0x25afee, 0xd0fc], [0x25aff0, 0x0020],   // adda.w #$20,a0   -- FOUR bytes
    [0x25aff2, 0x5341],                       // subq.w #1,d1     -- and $25AFF2 IS a boundary
    [0x25aff4, 0x4eb9],                       // jsr $25A14C
    [0x25affa, 0xd0fc], [0x25affc, 0x0020],
    [0x25affe, 0x5341],
    [0x25b000, 0x4ef9],                       // jmp $25A14C -- the TAIL JUMP, so no rts
  ];
  for (const [a, w] of words) {
    assert.equal(IMG.readUInt16BE(a), w, `$${a.toString(16).toUpperCase()}`);
  }
  assert.equal(IMG.readUInt32BE(0x25afea), 0x0025a14c, '$25AFE8 jsr $25A14C');
  assert.equal(IMG.readUInt32BE(0x25aff6), 0x0025a14c, '$25AFF4 jsr $25A14C');
  assert.equal(IMG.readUInt32BE(0x25b002), 0x0025a14c, '$25B000 jmp $25A14C');

  // THE lea's EA: the EXTENSION WORD's own address plus the displacement, not the opcode's.
  const disp = IMG.readInt16BE(0x25afda);
  assert.equal(disp, -0x29c, 'the displacement is SIGNED');
  assert.equal(0x25afda + disp, FRONTTEXT.blinkBlank, 'EA = $25AFDA + $FD64 = $25AD3E');

  // It has NO rts. `4E75` appears nowhere in $25AFD8..$25B005, which is what makes the tail jmp
  // the routine's only exit and $25B006 the end.
  for (let a = 0x25afd8; a < FRONTTEXT.blinkOffEnd; a += 2) {
    assert.notEqual(IMG.readUInt16BE(a), 0x4e75, `no rts at $${a.toString(16).toUpperCase()}`);
  }
});

test('W377 the three blank lines are 28 / 26 / 24 characters, and the run ends at the next lea', () => {
  const lens = [];
  for (let i = 0; i < FRONTTEXT.blinkLines; i++) {
    const base = FRONTTEXT.blinkBlank + i * FRONTTEXT.blinkStride;
    let n = 0;
    while (IMG[base + n] !== 0) {
      assert.equal(IMG[base + n], 0x20, 'every character in the OFF block is a SPACE');
      n++;
    }
    lens.push(n);
  }
  // NOT 28/28/28. The ON messages are 28 each, so an OFF frame leaves the tail of columns $12
  // and $11 alone. Pinned so nobody "fixes" the asymmetry.
  assert.deepEqual(lens, [28, 26, 24], 'the three lines are DIFFERENT lengths');

  // The window's far end comes from CODE, not from eyeballing the pad: $25B008 is the next
  // message group's lea and its EA is exactly $25AD3E + $5A.
  assert.equal(IMG.readUInt16BE(0x25b008), 0x41fa, '$25B008 is lea (d16,pc),a0');
  const next = 0x25b00a + IMG.readInt16BE(0x25b00a);
  assert.equal(next, 0x25ad98, '$25B00A + $FD8E = $25AD98');
  assert.equal(FRONTTEXT.blinkBlank + 0x5a, next, 'the run ends at the next group base');
});

test('W377 blinkOff25AFD8 blanks columns $13/$12/$11 and NOTHING else', async () => {
  const { TxVram } = await import('../src/background.js');
  const { blinkOff25AFD8 } = await import('../src/fronttext.js');
  const tx = new TxVram();
  blinkOff25AFD8(tx, rawRom());

  assert.equal(txColumn(tx, 0x13), ' '.repeat(28) + '....', 'line 1: 28 blanks at D1 = $13');
  assert.equal(txColumn(tx, 0x12), ' '.repeat(26) + '......', 'line 2: 26 at $12');
  assert.equal(txColumn(tx, 0x11), ' '.repeat(24) + '........', 'line 3: 24 at $11');
  assert.equal(txColumn(tx, 0x14), '.'.repeat(32), 'and $14 is untouched -- D1 only DECREMENTS');
  assert.equal(txColumn(tx, 0x10), '.'.repeat(32), 'and so is $10 -- THREE lines, not four');

  // The attribute is the caller's D2, and $25AFE4 sets it to zero, so the low word is 0 and the
  // tile carries $C0000000 from $240CFA. Getting this wrong draws tile 0 everywhere.
  assert.equal(tx.long(0x904000 + ((0 * 64 + 0x13) << 2)) >>> 0, 0xc0200000,
    'the tile is $C0000000 | (space << 16) | attr 0');
});

test('W377 the $25AD3E window: ablation names the byte, and the control shows it read', async () => {
  const { TxVram } = await import('../src/background.js');
  const { blinkOff25AFD8 } = await import('../src/fronttext.js');

  const without = await windowedRom([0x25ad3e]);
  const e = caught(() => blinkOff25AFD8(new TxVram(), without));
  assert.equal(e.name, 'Unreached', 'a missing window is a LOUD gap');
  assert.equal(e.romAddress, 0x25ad3e, 'and it names the exact byte: $25AD3E');

  // POSITIVE CONTROL -- the same call against the full window list reads it and draws.
  const withIt = await windowedRom([]);
  const tx = new TxVram();
  assert.doesNotThrow(() => blinkOff25AFD8(tx, withIt));
  assert.equal(txColumn(tx, 0x13), ' '.repeat(28) + '....', 'and the window really serves it');
});

test('W377 the DRIVER runs $25AFD8: a cold boot blanks on the OFF phase and not on the ON', () => {
  const g = coldGame();
  g.boot();
  run(g, COIN.idle, 305);                     // past the warning screen -- state 13 skips the tail
  assert.equal(g.ram.u16(SCREEN8.state), 0x0002, 'the tail is running');

  const CELL = 0x904000 + ((0 * 64 + 0x13) << 2);
  const POISON = 0x11223344;
  let blanked = 0;
  let left = 0;
  for (let i = 0; i < 48; i++) {
    g.txvram.setLong(CELL, POISON);           // re-poisoned every frame
    g.step(NO_PLAYER);
    const cell = g.txvram.long(CELL) >>> 0;
    // The EXPECTED phase comes from the counter the cartridge itself keeps, not from the loop
    // index: $812E58 only advances on frames the tail runs, and state 13 skipped 301 of them,
    // so this run does NOT start on a phase boundary. $25A838 addq.w #1 happens BEFORE
    // $25A844 andi.w #$10, so the value read back here is the one that chose this frame's half.
    const off = (g.ram.u16(SCREEN8.blink) & 0x10) === 0;
    if (off) { assert.equal(cell, 0xc0200000, `frame ${i} is OFF and must be blanked`); blanked++; }
    else { assert.equal(cell, POISON, `frame ${i} is ON and must be left alone`); left++; }
  }
  // $25A844 andi.w #$10 -- 16 on, 16 off. BOTH halves must be non-empty: a port that blanked
  // every frame, or none, would pass a one-sided check.
  assert.equal(blanked + left, 48);
  assert.ok(blanked >= 16 && left >= 16,
    `48 frames must cross the $10 boundary both ways (blanked ${blanked}, left ${left})`);
  assert.ok(g.unportedLog.report().some((s) => s.includes('$25AD02')),
    'the ON half is still a COUNTED deferral, not a silent skip');
  assert.ok(!g.unportedLog.report().some((s) => s.includes('$25AFD8')),
    'and the OFF half is NOT -- a note beside a live call would claim a gap that is closed');
});
