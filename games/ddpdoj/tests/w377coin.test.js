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
// **THE FIX IS AT THE CALL SITE AND NOWHERE ELSE.** `$28C170` MUST NOT be added to `WRAPPERS`:
// `src/sound.js`'s own header (lines 76-106) decodes it and shows it calls `$28BBAC`, a
// different packer from the `$28BB04` that every `WRAPPERS` row describes -- no id, no pan, no
// channel nibble. A row for it would be three invented fields. `background.js:1047` and
// `hiscorescreen.js:544` have always counted this exact address with `note()` at their own call
// sites; arm 3 was the one place that posted it instead. It now counts it too.
//
// THE FIRST TWO TESTS FAIL WITHOUT THAT ONE-LINE CHANGE, and the first fails by THROWING, which
// is the whole point: it drives the real `Game`, the real ISR, the real debounce and the real
// object driver, not a fixture that stands in for them. (Proved by ablation: restoring
// `ctx?.soundPost?.(SCREEN8.cueBgm)` reds tests 1 and 2 with
// `sound.postWrapper: no wrapper at $28C170`.)
//
// SECTION 4 IS A SECOND INSTANCE OF THE SAME DEFECT, found while fixing the first: `$28C0FC`,
// posted at three more sites in `objslot8.js`, two of them inside the coin teardown itself.
// SECTION 5 (below) is unit B's half: `$25AFD8`, ported for real.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { Game } from '../src/main.js';
import { COIN } from '../src/isr.js';
import { COIN_BITS } from '../src/web/input.js';
import { SOUND_WRAPPERS, STREAMING_LEAVES, postWrapper, SoundState } from '../src/sound.js';
import { SCREEN8 } from '../src/objslot8.js';
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
// This is the test the wave exists for. Ablate the fix in `objslot8.js` arm 3 -- put back
// `ctx?.soundPost?.(SCREEN8.cueBgm)` -- and it fails like this:
//
//   Error: sound.postWrapper: no wrapper at $28C170 -- add it to WRAPPERS or fix the call site
//
// thrown out of `g.step()` on the frame after the coin credits. Nothing is stubbed: the coin
// arrives on `$C08004`, `$13CEC8` debounces it across IRQ4 phases, `$13CFBA`/`$13CF86` consume
// the pending word, `coinage13CE22` credits `$80395A`, `$25A7C0` tears the screen down and
// restages, and arm 3's init is reached by the object driver.
// ---------------------------------------------------------------------------------------------

test('W377 a cold boot SURVIVES a coin: arm 3 counts $28C170 instead of throwing on it', () => {
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
// 2 -- THE CUE IS COUNTED, NOT SWALLOWED.
//
// A crash fixed by deleting the line would pass test 1 just as well, and would be exactly the
// silent no-op `src/unported.js` exists to prevent. So: the log must NAME `$28C170`, and it must
// name it against arm 3's own call site `$25A962` rather than one of the two pre-existing
// counters in `background.js` / `hiscorescreen.js`, neither of which runs on this path.
// ---------------------------------------------------------------------------------------------

test('W377 the surviving run COUNTS $28C170 against $25A962, loudly and by address', () => {
  const g = coldGame();
  g.boot();
  g.ram.setU8(COINAGE, 1);
  run(g, COIN.idle, 305);

  assert.deepEqual(noted(g, 0x28c170), [],
    'POSITIVE CONTROL: before the coin, nothing on this path has cued $28C170');

  run(g, coinWord('COIN1'), 12);
  run(g, COIN.idle, 12);

  const keys = noted(g, 0x28c170);
  assert.equal(keys.length, 1, 'exactly one distinct $28C170 deferral is counted');
  assert.match(keys[0], /\$25A962 jsr \$28C170/, 'and it names ARM 3\'s call site');
  assert.match(keys[0], /\$28BBAC/, 'and says which packer it goes through');
  assert.equal(g.unportedLog.calls.get(keys[0]), 1,
    'arm 3\'s init runs ONCE -- ($3,A5) latches it, so the note is not a per-frame spam');

  // The report is what the runner prints; if the deferral is not in there it is invisible.
  assert.ok(g.unportedLog.report().some((s) => s.includes('$28C170')),
    'and it appears in the printed unported report');
});

// ---------------------------------------------------------------------------------------------
// 3 -- THE FIX IS NOT "ADD IT TO WRAPPERS". This asserts the thing the brief forbids stays
// forbidden: `$28C170` has no row, is not a streaming leaf, and `postWrapper` still throws on
// it. If a later wave adds a row it will have to delete this test on purpose, having read
// sound.js:76-106 first.
// ---------------------------------------------------------------------------------------------

test('W377 $28C170 still has no WRAPPERS row and postWrapper still throws on it', () => {
  assert.equal(SOUND_WRAPPERS[0x28c170], undefined, '$28C170 has no wrapper row');
  assert.equal(STREAMING_LEAVES.has(0x28c170), false, 'and it is not a streaming leaf either');

  const ram = new Ram();
  const sound = new SoundState();
  assert.throws(() => postWrapper(ram, sound, 0x28c170),
    /no wrapper at \$28C170/, 'posting it is still a loud gap');

  // POSITIVE CONTROL: an address that IS a WRAPPERS row posts without throwing, so the
  // assertion above is about $28C170 and not about `postWrapper` being broken. $28C5B0 is
  // arm 3's neighbour in the coin teardown's two pairs and it stays a real `soundPost`.
  assert.ok(SOUND_WRAPPERS[SCREEN8.cueWrapper], '$28C5B0 IS a WRAPPERS row');
  assert.doesNotThrow(() => postWrapper(ram, sound, SCREEN8.cueWrapper));
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
// machine in a condition the cartridge reaches on its own but that a cold boot cannot reach
// today, because the hiscore screen holds at state 2 (its chain content, `$24676A`, is unported)
// and so state 12 is not currently on the cold path.
// ---------------------------------------------------------------------------------------------

for (const [name, seed, site] of [
  ['the dual-play gate $803926 ($25A7E2)', (g) => g.ram.setU16(0x803926, 1), '$25A7E2'],
  ['state 12 ($25A7FA)', (g) => g.ram.setU16(SCREEN8.state, 0x000c), '$25A7FA'],
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
