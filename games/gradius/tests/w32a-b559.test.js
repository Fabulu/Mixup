// Wave 32a tests -- `$B559`, dispatch entry 29, types `$1D`/`$9D`.
//
// `$B559` is 16 bytes and it SHARES ITS INIT ARM with `$B4FD` (entry 28) by
// branching BACKWARD 87 bytes into the middle of it (`$B55C BPL $B502`). Two
// things follow, and most of this file exists to pin them:
//
//   1. sharing the init must not become sharing the BODY. `$B4FD`'s body is a
//      four-phase lander; `$B559`'s is animate + move + box. A port that routed
//      entry 29 at `h_B4FD` would pass an "it initialises correctly" test.
//   2. the animator ROW is 9, not `$B4FD`'s 3. Row 3 is threshold $08 / base
//      $4A / count $08; row 9 is threshold $08 / base $52 / count $06. The
//      THRESHOLDS ARE EQUAL, so a wrong row keeps the right cadence and shows
//      the wrong sprite -- invisible to any timing check.
//
// EVERY CHECK BELOW WAS WATCHED TO GO RED under the named mutant on its
// `RED WHEN` line, and src/enemies.js was sha256'd before and after every
// restore. The mutation table is in docs/worklog/gradius/32a-impl-b559.md.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createState, ENEMY_BASE, u8 } from '../src/state.js';
import { updateEnemies, spawnEngine } from '../src/enemies.js';
import { headlessResources } from './helpers.js';

const res = headlessResources(0);
const rom = res.enemyTables;
const SLOT = 9;
const I = SLOT + ENEMY_BASE;

/**
 * One type-`$1D` object in slot 9, at a position well inside `$B251`'s box.
 *
 * `status` is 0 ON PURPOSE and that is the cartridge's value, not a convenience:
 * every one of stage 5's ten type-$1D records is a formation whose descriptor
 * byte 0 is `$00` (decoded from `assets/prg.bin`, records `$ABB6` `$ABB8`
 * `$ABC2` `$ABC4` `$ABCE` `$ABD0` `$ABD3` `$ABD5` `$ABDF` `$ABE1`). `$ADE8`
 * `BEQ $AE14` therefore skips the `$ADC1` status animator entirely, so `$012C`
 * is driven by `$B628` alone and nothing else can be mistaken for it.
 */
function drifter(initialised, x = 0x80, y = 0x60) {
  const s = createState();
  s.substate = 0x80;
  s.zp19 = 4;
  const o = s.obj;
  o.type[I] = initialised ? 0x9D : 0x1D;
  o.status[I] = 0x00;
  o.x[I] = x; o.y[I] = y;
  return s;
}

// ======================== 1. THE DISPATCH ENTRY =============================

test('$AE1C[29] is $B559, and both $1D and $9D reach it', () => {
  // $AE19 JSR $83E4 opens with an EIGHT-BIT `ASL A`, so type $9D and type $1D
  // index the same entry 29. The literal $B559 is asserted as well as read, so
  // this cannot agree with itself through a shared constant.
  // RED WHEN: `case 0xB559:` is removed from dispatch().
  assert.strictEqual(rom.word(0xAE1C + 2 * 29), 0xB559,
    'fixture: entry 29 of the 42-entry table at $AE1C must be $B559');
  assert.strictEqual(u8(0x9D << 1), u8(0x1D << 1), 'the ASL is 8-bit');

  for (const t of [0x1D, 0x9D]) {
    const s = drifter(t === 0x9D);
    assert.doesNotThrow(() => updateEnemies(s, res),
      `type $${t.toString(16)} must not throw`);
  }
});

// ======================== 2. THE SHARED INIT ARM ============================

test('$B55C BPL $B502: an uninitialised $1D takes entry 28\'s init and STOPS', () => {
  // loc_B502 = JSR $B0B4 (type |= $80) / $048C := $80 / $04AC := $14 / RTS.
  // The RTS is the point: the init frame does NOT animate, does NOT move and
  // does NOT run the off-screen box.
  // RED WHEN: the BPL is inverted, or h_B559 falls through into its own body
  // after initialising.
  const s = drifter(false, 0x80, 0x60);
  updateEnemies(s, res);
  const o = s.obj;
  assert.strictEqual(o.type[I], 0x9D, '$B0B4 sets bit 7');
  assert.strictEqual(o.s0480[I], 0x80, '$B505 $048C := $80');
  assert.strictEqual(o.s04A0[I], 0x14, '$B50A $04AC := $14');
  assert.strictEqual(o.x[I], 0x80, 'the init frame does NOT DEC $036C');
  assert.strictEqual(o.anim[I], 0x00, 'and it does NOT touch $012C');
  assert.strictEqual(o.timer[I], 0x00, 'and it does NOT INC $014C');
});

test('$048C and $04AC are written by the init and then never read by $B559', () => {
  // They exist for $B4FD's four-phase machine. $B559's body is animate + move +
  // box, so a poked $04AC must survive every subsequent frame untouched --
  // which is exactly what a delegation to h_B4FD would break ($B52A DECs it).
  // RED WHEN: h_B559 calls h_B4FD, or grows $B4FD's phase ladder.
  const s = drifter(true);
  s.obj.s04A0[I] = 0x14;
  s.obj.s0460[I] = 0x00;               // $046C -- $B4FD's phase, 0 = countdown
  for (let f = 0; f < 20; f++) updateEnemies(s, res);
  assert.strictEqual(s.obj.s04A0[I], 0x14,
    '$04AC must be untouched -- $B4FD would have counted it down to 0');
  assert.strictEqual(s.obj.s0460[I], 0x00,
    '$046C must stay 0 -- $B4FD would have advanced the phase');
});

// ======================== 3. THE ANIMATOR ROW, Y = 9 ========================

test('$B650 row 9 is threshold $08 / base $52 / count $06', () => {
  // The three bytes $B559 consumes, asserted BOTH as literals read off the
  // listing AND against assets/prg.bin. $B650 is TWELVE bytes ($B650-$B65B) and
  // $B65C is code, so Y = 9 is the last row that fits -- there is no overrun,
  // and that is the fact this fixture pins.
  // RED WHEN: the table base or the row index moves.
  assert.deepStrictEqual(
    [rom.read(0xB650 + 9), rom.read(0xB651 + 9), rom.read(0xB652 + 9)],
    [0x08, 0x52, 0x06],
    'fixture: $B659/$B65A/$B65B');
  // And row 3, $B4FD's, is DIFFERENT in two of three -- the copy-paste trap.
  assert.deepStrictEqual(
    [rom.read(0xB650 + 3), rom.read(0xB651 + 3), rom.read(0xB652 + 3)],
    [0x08, 0x4A, 0x08],
    'fixture: row 3 shares the THRESHOLD and differs in base and count');
});

test('$B560 JSR $B628 with Y=9: the cycle is $53..$57 then $52, every 8 frames', () => {
  // THE FIRST METASPRITE A FRESH $1D SHOWS IS $53, NOT THE BASE $52, and that
  // is the ROM's arithmetic rather than an off-by-one: `$B633 LDA $016C,X / CLC
  // / ADC #$01` increments the frame FIRST, stores it at `$B640`, and only then
  // `$B644 ADC $B651,Y` adds the base. So frame 0 (= base $52) is reached only
  // after the count-$06 wrap. Asserted as a SEQUENCE so a wrong base shows on
  // step 1 and a wrong count shows on step 6.
  // RED WHEN: sub_B628 is called with y = 3 (entry 28's row) or y = 0; or the
  // frame increment is moved after the base add.
  const s = drifter(true, 0xF0, 0x60);
  const seen = [];
  let prev = s.obj.anim[I];
  // $B628 INC $014C,X then CMP $B650,Y / BCC RTS: with threshold $08 the frame
  // advances on every 8th call. 56 frames = exactly 7 advances.
  for (let f = 0; f < 8 * 7; f++) {
    updateEnemies(s, res);
    if (s.obj.anim[I] !== prev) { prev = s.obj.anim[I]; seen.push(prev); }
  }
  assert.deepStrictEqual(seen, [0x53, 0x54, 0x55, 0x56, 0x57, 0x52, 0x53],
    'five frames up from base+1, the wrap to the base, then round again');

  // and the cadence: nothing moves on frames 1-7 of a step.
  const t = drifter(true, 0xF0, 0x60);
  for (let f = 0; f < 7; f++) updateEnemies(t, res);
  assert.strictEqual(t.obj.anim[I], 0x00, 'seven frames: still no step');
  updateEnemies(t, res);
  assert.strictEqual(t.obj.anim[I], 0x53, 'the eighth frame steps');
});

test('the metasprites $B559 names, $52-$57, are all in the export', () => {
  // A structural check, not a behavioural one (docs/knowledge/10 point 5): the
  // handler indexes six ids and every one must exist as an exported record.
  // RED WHEN: the export loses any of the six.
  const ms = res.metasprites || res.metaSprites;
  assert.ok(ms, 'fixture: headlessResources must expose the metasprite export');
  for (let id = 0x52; id <= 0x57; id++) {
    assert.ok(ms[id] || ms[String(id)],
      `metasprite $${id.toString(16).toUpperCase()} must be exported`);
  }
});

// ======================== 4. THE BODY: MOVE AND BOX =========================

test('$B563 DEC $036C,X: exactly one pixel left per frame, no fraction', () => {
  // $B559 has NO $038C sub-pixel term -- unlike almost every other drifter in
  // this game, which go through $B164/$BDFA. Ten frames must be ten pixels.
  // RED WHEN: the DEC becomes a -2, or grows a fractional accumulator.
  const s = drifter(true, 0x80);
  for (let f = 0; f < 10; f++) updateEnemies(s, res);
  assert.strictEqual(s.obj.x[I], 0x80 - 10);
  assert.strictEqual(s.obj.xf[I], 0, 'no sub-pixel term is touched');
});

test('$B566 JMP $B251: the box frees the slot at x < 4, on the frame it crosses', () => {
  // $B253 LDA $036C,X / CMP #$04 / BCC $B269 -> $AEF8. x = 4 survives; the DEC
  // that takes it to 3 frees it IN THE SAME FRAME, because the DEC runs first.
  // RED WHEN: the JMP $B251 is dropped, or the box is checked before the move.
  const s = drifter(true, 0x05);
  updateEnemies(s, res);
  assert.strictEqual(s.obj.x[I], 0x04, 'x $05 -> $04: still inside the box');
  assert.strictEqual(s.obj.type[I], 0x9D, 'and still alive');
  updateEnemies(s, res);
  assert.strictEqual(s.obj.type[I], 0x00, 'x $04 -> $03: $AEF8 freed it');
  assert.strictEqual(s.obj.anim[I], 0x00, '$AF00 cleared $012C');
  assert.strictEqual(s.obj.animFrame[I], 0x00, '$AF06 cleared $016C');
});

test('$B566 is a JMP, so nothing runs after the free -- unlike $B4FD\'s JSR', () => {
  // THE ONE PLACE $B559 IS SIMPLER THAN THE BODY IT SHARES. $B518 is a JSR and
  // $B4FD keeps executing on a freed slot ($B52A DECs $04AC on it, and $AEF8
  // does not clear $04AC). $B566 is a JMP: after the free, $04AC must be
  // exactly what it was.
  // RED WHEN: the tail is turned into a call-then-continue.
  const s = drifter(true, 0x05);
  s.obj.s04A0[I] = 0x14;
  updateEnemies(s, res);
  updateEnemies(s, res);                       // the freeing frame
  assert.strictEqual(s.obj.type[I], 0x00, 'freed');
  assert.strictEqual(s.obj.s04A0[I], 0x14,
    '$04AC survives the free untouched -- nothing followed the JMP');
});

test('the box also frees on Y, which $B559 never changes -- so only a spawn can', () => {
  // $B559 writes no Y at all. A type-$1D object placed outside the Y box is
  // freed on its first body frame and never moves. Stated as a branch of $B251
  // this handler can reach, not as a behaviour of the enemy.
  // RED WHEN: offScreenCheck loses its Y arms.
  for (const y of [0x07, 0xC4]) {
    const s = drifter(true, 0x80, y);
    updateEnemies(s, res);
    assert.strictEqual(s.obj.type[I], 0x00, `y $${y.toString(16)} is outside the box`);
  }
});

// ==================== 5. THE SCOPE GUARD, AND ITS MESSAGE ==================

test('$A2F0 has moved to stage 6, and its message names what is ACTUALLY left', () => {
  // W32a deliberately did NOT lower this guard, because $9663, $8BD9, $C267 and
  // $C772/$CB8A all fired unconditionally before a wave record was read. W32b
  // ported all four and STILL did not lower it, because $BEF3 and $CBD1 fire in
  // ordinary play. W32c ported those, found and ported a SIXTH `$19 == 4` site
  // nobody had listed ($A17C, the missile's terrain-probe bypass) plus $BC44's
  // skip arm, and moved the guard to `>= 5`.
  //
  // THE POINT OF THE MESSAGE ASSERTIONS BELOW is unchanged and is why this
  // check survives the move: the guard has to keep naming the CURRENT debt. It
  // has been wrong twice already (it named $B559 after W32a shipped it, and
  // $CA5E/$A4A6 after W32b shipped them).
  // RED WHEN: the guard moves off 5, or its message goes stale again.
  const seed = (stage) => {
    const tbl = rom.word(0xA7D0 + 2 * stage);
    const ptr = rom.read(tbl) | (rom.read(tbl + 1) << 8);
    const s = createState();
    s.substate = 0x80; s.spawn.z60 = 2; s.zp19 = stage; s.spawn.z61 = 0;
    s.spawn.z6A = ptr & 0xFF; s.spawn.z6B = ptr >>> 8;
    s.cam.hi = 0; s.cam.lo = 0;
    return s;
  };
  assert.doesNotThrow(() => spawnEngine(seed(4), res),
    'stage 5 ($19=4) must reach the wave engine now');
  // W35 moved the guard to `>= 6`. The MESSAGE assertions are the point of this
  // check and they follow the guard: it went stale after W32a and again after
  // W32b, so what it must never do is name a routine this repo has shipped.
  assert.doesNotThrow(() => spawnEngine(seed(5), res),
    'stage 6 ($19=5) must reach the wave engine now (W35)');
  assert.throws(() => spawnEngine(seed(6), res), /\$A2F0 runEngine/,
    'stage 7 ($19=6) must throw loudly, naming $A2F0');
  let msg = '';
  try { spawnEngine(seed(6), res); } catch (e) { msg = e.message; }
  for (const shipped of ['$B559', '$C653', '$BEF3', '$CBD1', '$A17C',
                         '$B480', '$C6DE', '$CDA5']) {
    assert.ok(!new RegExp(`\\${shipped} [^)]*not ported`).test(msg),
      `${shipped} is ported -- the guard must not name it as missing`);
  }
  assert.ok(/\$9872/.test(msg),
    'the guard must name what is ACTUALLY left: stage 7\'s end-of-game chain');
  assert.ok(!/walkers/.test(msg),
    'the four $0600 walkers are ported -- the guard must not still cite them');
  assert.ok(!/W32c\./.test(msg),
    'and it must stop deferring to W32c, which is shipped');
  // Naming a wave as SHIPPED is fine and is what the message is for; what it
  // must never do is DEFER to one, which is how it went stale twice. So: no
  // wave number above the highest shipped one may appear in it.
  const SHIPPED_THROUGH = 35;
  for (const m of msg.matchAll(/\bW(\d\d)\b/g)) {
    assert.ok(Number(m[1]) <= SHIPPED_THROUGH,
      `the guard defers to ${m[0]}, which is not shipped -- that is exactly `
      + 'how this message went stale after W32a and again after W32b');
  }
});

// ============ 6. THE FOUR PER-FRAME STAGE-5 WALLS ARE ALL LOUD ==============

test('every unconditional $19==4 entry point is WIRED -- all SIX of them', () => {
  // W32a WROTE THIS AS "all four throw". W32b PORTED all four, so the check is
  // turned round rather than deleted: each of the four unconditional stage-5
  // gates must still sit under a live `state.zp19 === 4` guard AND must now
  // CALL the ported routine by name. That is the same property W32a was really
  // guarding -- "no stage-5 gate is a silent no-op" -- expressed against a
  // ported subsystem instead of an unported one.
  //
  //   $9663            src/nmi.js       the $5C census + the frame fork
  //   $8B8D -> $8BD9   src/oam.js       the arm sprite pass
  //   $C25D -> $C267   src/collision.js the player-vs-segment sweep
  //   $9A76 -> $C772   src/nmi.js       the arm driver ($CB8A/$CB91)
  //
  // RED WHEN: any of the four loses its guard or its call, i.e. becomes the
  // quiet return W32a found at $9A76.
  const src = {
    nmi: readFileSync(new URL('../src/nmi.js', import.meta.url), 'utf8'),
    oam: readFileSync(new URL('../src/oam.js', import.meta.url), 'utf8'),
    coll: readFileSync(new URL('../src/collision.js', import.meta.url), 'utf8'),
  };
  const walls = [
    ['nmi', 'armCensus(state)'],            // $9663
    ['nmi', 'armDriverGated(state, res.enemyTables)'],   // $9A76 -> $C772
    ['oam', 'armSpritePass(state, oam, rom, cursor, work)'],  // $8B8D -> $8BD9
    ['coll', 'playerVsArms(state)'],        // $C25D -> $C267
  ];
  for (const [file, needle] of walls) {
    const at = src[file].indexOf(needle);
    assert.ok(at >= 0, `${file}.js must CALL the ported stage-5 entry: ${needle}`);
    assert.match(src[file].slice(Math.max(0, at - 1600), at), /state\.zp19 === 4/,
      `${needle} must sit under a live \`state.zp19 === 4\` guard`);
  }
  // W32c ADDS THE OTHER TWO. $C037 -> $BEF3 was wall 5; $A17C is the SIXTH
  // `$19 == 4` site in the PRG and was in nobody's list -- W32a's had five, and
  // it is not gated on the arm pool at all, it is the MISSILE's terrain probe.
  const weap = readFileSync(new URL('../src/weapons.js', import.meta.url), 'utf8');
  const more = [
    [src.coll, 'shotVsArms(state, res, x, a0, a1, a3)'],   // $C037 -> $BEF3
    [weap, 'const stage5 = state.zp19 === 4;'],            // $A17C
  ];
  for (const [text, needle] of more) {
    const at = text.indexOf(needle);
    assert.ok(at >= 0, `the port must carry: ${needle}`);
  }
  // ...and $CBD1, the one gap that ever sat INSIDE ported code, must be a CALL
  // and not a throw. This is the assertion W32a and W32b both carried as
  // `must stay a loud named throw`; it is inverted rather than deleted.
  const enem = readFileSync(new URL('../src/enemies.js', import.meta.url), 'utf8');
  assert.ok(!enem.includes("throw new Error('$CBD1:"),
    '$CBD1 is ported (W32c) -- the throw must be gone');
  assert.ok(enem.includes('sub_CBD1(state);'),
    'and $CBBD JSR $CBD1 must be a real call from the driver');
});
