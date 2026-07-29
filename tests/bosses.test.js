// The boss states -- 6, 7, 8, 9, 10 and 13 of 1:$50D3 -- plus the two globals
// they share with the rest of the game: $C741/$C73D/$C73F, and the $1438
// player gate that the level-14 entrance rides on.
//
// Everything here is oracle-covered end to end; what is NOT covered is the
// arithmetic inside each arm, which is where a "tidy-up" does its damage.
// These pin the constants, the sign conventions and the two off-by-ones the
// port went out of its way to reproduce. No assets, no ROM.
// Run: node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';

import { grid, floorFrom, makeState, placePlayer, setInput, step } from './helpers.js';
import { updateEnemies, _internals } from '../src/enemies.js';
import { updateBatarangs, FLAG_RETURNING } from '../src/batarang.js';
import { BTN } from '../src/player.js';

const { primaryDispatch, screenTail } = _internals;

/**
 * An arena: solid from map row 5 down, camera parked so the enemy at world row
 * $14 sits inside loc_01_5CA8's 7-row draw window ($5CCA) -- without that the
 * animation machine never ticks and the hop never launches.
 */
/**
 * The three prefab fields any test here asserts. Synthetic on purpose -- this
 * suite never reads assets/ -- and set to values no default could produce, so
 * a missing table fails loudly instead of quietly spawning an inert record.
 * Whether the shipped bytes are the right ROM bytes is settled by check_tables
 * in tools/verify_assets.py.
 */
const PROJECTILE_FIXTURE = Array.from({ length: 5 }, () => {
  const r = new Array(32).fill(0);
  r[0] = 0x80;                                 // +0    active
  r[2] = 0x0B;                                 // +2    state 11
  r[0x16] = 0xFF;                              // +$16  HP
  return r;
});

function arena(opts = {}) {
  const state = makeState(floorFrom(grid(32), 5, '#'), {
    ...opts,
    tables: { projectileTemplates: PROJECTILE_FIXTURE, ...(opts.tables || {}) },
  });
  state.camera.x = 0;
  state.camera.y = 0x1000;
  state.player.x = 0x0880;                     // screen X $90
  state.player.y = 0x1400;                     // screen Y $50
  return state;
}

/** A boss record on the floor at world column `col`, row $14. */
function boss(state, st, { col = 0x0A, xlo = 0x00, hp = 0x20 } = {}) {
  const r = state.enemies[0];
  r.fill(0);
  r[0] = 0x80;
  r[2] = st;
  r[0x0A] = 0x08; r[0x0B] = 0x09;              // hitbox halfW right / left
  r[0x0C] = 0x0F; r[0x0D] = 0x10;              // halfH up / down
  r[0x0E] = col; r[0x0F] = xlo;
  r[0x10] = 0x14; r[0x11] = 0x00;
  r[7] = 0x90; r[8] = 0x50;                    // cached screen pair
  r[0x16] = hp;
  r[0x1C] = 0x20;                              // jump velocity
  r[0x1D] = 0x10;                              // walk speed cap
  return r;
}

// ---------------------------------------------------------------------------
// State 10 -- Boss 1 (level 4).  ROM: jt_01_7591, launcher loc_01_76C5.
// ---------------------------------------------------------------------------

test('the boss-1 hop is only ARMED by the launcher; the turn animation fires it', () => {
  // ROM: $76D6 sets r[1] bit 6 and $76E4 loads the turn timer with $0F -- and
  // that is all. Nothing in loc_01_76C5 sets the rising bit or loads a jump
  // velocity; $5ECF (animTick's turn-anim expiry) does both, 16 driver frames
  // later. riseTail is suspended for the whole wind-up ($5BB6 tests r[1] bit 6),
  // which is exactly why the cartridge measures ~16 grounded frames per hop.
  // Launching from the handler instead would halve the fight's rhythm.
  const state = arena({ level: 4, bossId: 1 });
  state.frame = 0x80;                          // above the level-4 crit roll
  const r = boss(state, 0x0A);
  r[7] = 0x68;                                 // ad = $90 - $68 = $28: the chase band

  primaryDispatch(state, r);
  assert.equal(r[1] & 0x40, 0x40, 'turn animation armed');
  assert.equal(r[0x18], 0x0E, '$0F, already ticked once by this frame\'s animTick');
  assert.equal(r[0] & 0x01, 0, 'still on the ground');
  assert.equal(r[0x13], 0, 'and with no jump velocity yet');

  for (let i = 0; i < 14; i++) primaryDispatch(state, r);
  assert.equal(r[0x18], 0, 'wind-up exhausted');
  assert.equal(r[0] & 0x01, 0, 'but the jump has still not happened');

  primaryDispatch(state, r);                   // the 16th frame
  assert.equal(r[1] & 0x40, 0, 'turn animation cleared');
  assert.equal(r[0] & 0x01, 0x01, 'rising');
  assert.equal(r[0x13], 0x20, 'the +$1C jump velocity, unmodified');
});

test('the level-4 hop crit reduces to `$FFB1 < $80`, and reads $FFB0 not $C73E', () => {
  // ROM: $5ED8-$5EF2. The roll is `(rLY ^ $FFB1) < $80`, i.e. "do rLY and
  // $FFB1 agree in bit 7". rLY was MEASURED mid-frame on all four hops of the
  // 400-frame level-4 idle run (43/45/43/59) -- always < $80 -- so the port
  // implements the REDUCED form `$FFB1 < $80` and drops rLY entirely.
  //
  // That reduction is only sound while the seed stays rLY. Anything that
  // re-seeds this roll with a value that can reach $80 silently turns a coin
  // flip into a constant, so the boundary is pinned here: $7F crits, $80 does
  // not, and the +$10 is a byte add on top of the record's own +$1C.
  const armed = (opts) => {
    const state = arena(opts);
    const r = boss(state, 0x0A);
    r[1] = 0x40;                               // mid turn animation...
    r[0x18] = 0;                               // ...with the timer expired
    state.frame = opts.frame;
    screenTail(state, r);
    return { state, r };
  };

  const crit = armed({ level: 4, bossId: 1, frame: 0x7F });
  assert.equal(crit.state.flow.bossHop, 1, '$C741 -- the high spinning hop');
  assert.equal(crit.r[0x13], 0x30, '+$1C ($20) plus $10');

  const plain = armed({ level: 4, bossId: 1, frame: 0x80 });
  assert.equal(plain.state.flow.bossHop, 0);
  assert.equal(plain.r[0x13], 0x20);

  // $5ED8 loads $FFB0 -- the LEVEL number. $C73E (bossId) is 1 here too, and
  // reading that instead would give boss 1 his high hop on every level he is
  // dispatched from.
  const elsewhere = armed({ level: 5, bossId: 1, frame: 0x00 });
  assert.equal(elsewhere.state.flow.bossHop, 0, 'not level 4: no roll at all');
  assert.equal(elsewhere.r[0x13], 0x20);
});

test('the hop aim divides the WORLD gap by $4A and takes its sign from the player side', () => {
  // ROM: sub_01_79DB. HL = the record's own +$0E/+$0F, BC = -($FF81/$FF82):
  // world coordinates, NOT the cached screen X every band test above it uses.
  // The magnitude is a repeated `ADD HL,$FFB6` loop, so floor(gap / $4A), and
  // the sign comes from the ADD's CARRY -- set when the enemy is at or right of
  // the player, which then CPL/INCs the count. Boss 1 therefore steps toward
  // the player at one unit per $4A of gap: a quantised chase that goes to zero
  // inside 74 subpixels, which is why he stomps in place at close range.
  const aim = (playerX) => {
    const state = arena({ level: 4, bossId: 1 });
    state.frame = 0x80;
    const r = boss(state, 0x0A, { col: 0x0A, xlo: 0x00 });
    // Dead zone: cached screen X == the player's, so $75EB routes straight to
    // loc_01_767D -> the launcher, and the aim is the only thing that moves.
    state.player.x = playerX;
    r[7] = ((playerX >> 4) + 8) & 0xFF;
    primaryDispatch(state, r);
    return r[0x12];
  };

  const E = 0x0A00;
  assert.equal(aim(E - 0x4A), 0xFF, 'player one $4A to the LEFT -> -1');
  assert.equal(aim(E + 0x4A), 0x01, 'player one $4A to the RIGHT -> +1');
  assert.equal(aim(E - 0x49), 0x00, 'one subpixel short of a step');
  assert.equal(aim(E - 0x4A * 5), 0xFB, 'five steps out, negated');
});

test('boss 1s swing crit is a $70 window on a CONSTANT rLY, not the $80 reduction', () => {
  // ROM: $7662-$7671. Same XOR shape as the hop roll but a DIFFERENT
  // threshold, and $70 sits well inside rLY's range -- so this one does NOT
  // reduce to a test on $FFB1 alone. rLY read EXACTLY 42 on both measured
  // rolls (the enemy driver sits at a stable point in the frame), so the port
  // models it as the constant $2A. Both halves matter: change $2A and the
  // outcome flips for a third of all frames; change $70 to $80 and it collapses
  // into the hop roll's coin flip.
  const swing = (frame) => {
    const state = arena({ level: 4, bossId: 1 });
    state.frame = frame;
    const r = boss(state, 0x0A);
    r[7] = 0x80;                               // ad = $10: the close band
    primaryDispatch(state, r);
    return { state, r };
  };

  const a = swing(0x45);                       // $2A ^ $45 = $6F
  assert.equal(a.r[0] & 0x08, 0x08, 'melee attack armed');
  assert.equal(a.r[0x14], 0x1F);
  assert.deepEqual(a.state.sound.queue, [{ id: 0x2B, mask: 1 }]);
  assert.equal(a.state.flow.bossCrit, 1);

  const b = swing(0x5A);                       // $2A ^ $5A = $70 -- excluded
  assert.equal(b.r[0] & 0x08, 0x08);
  assert.equal(b.state.flow.bossCrit, 0);
});

// ---------------------------------------------------------------------------
// State 8 -- Boss 3 (level 11).  ROM: jt_01_7061, edge check loc_01_7235.
// ---------------------------------------------------------------------------

test('boss 3s patience counter ticks on ODD $FFB1 frames only, and fires at $B4', () => {
  // ROM: $70D4 `AND $01 / JR Z` -- the far-band counter advances every OTHER
  // frame, so the 180 ticks at $70DE are 360 game frames, not 180. Ticking it
  // every frame halves the stand-off. The threshold is tested on the
  // INCREMENTED value (`INC A / CP $B4 / JR C`), so $B3 is the last value ever
  // stored and the 180th tick is the one that attacks.
  const far = (frame, bossHop) => {
    const state = arena({ level: 11, bossId: 3 });
    state.frame = frame;
    state.flow.bossHop = bossHop;
    const r = boss(state, 8);
    r[7] = 0x20;                               // ad = $70: the far band
    primaryDispatch(state, r);
    return { state, r };
  };

  const even = far(0x10, 0);
  assert.equal(even.state.flow.bossHop, 0, 'even frame: no tick');
  assert.equal(even.r[0] & 0x20, 0x20, 'but the idle bit is set regardless');

  assert.equal(far(0x11, 0).state.flow.bossHop, 1, 'odd frame: one tick');
  assert.equal(far(0x11, 0xB2).state.flow.bossHop, 0xB3, 'still just counting');

  const fires = far(0x11, 0xB3);
  assert.equal(fires.state.flow.bossCrit, 1, '$C73F -- the lunge, not the dash');
  assert.equal(fires.state.flow.bossHop, 0, '$7125 zeroes the counter');
  assert.equal(fires.r[0x14], 0x1F, 'the crit timer, not the $0B dash timer');
  assert.equal(fires.r[0x12], 0x2C, 'lunging right at +$2C');
  assert.equal(fires.r[0], 0x88, 'melee bit set, idle bit cleared by $7162');
  assert.deepEqual(fires.state.sound.queue, [{ id: 0x2D, mask: 1 }]);
});

test('the boss-3 arena edges ricochet: X hi < 2 or >= $0A turns and re-arms', () => {
  // ROM: loc_01_7235. The bounds are on the WORLD column high byte and they
  // are asymmetric in form -- `CP $02 / JR C` then `CP $0A / JR C` -- so the
  // right-hand wall is >= $0A while the left is < 2. The turn happens BEFORE
  // $7143 reads the facing, so the re-armed velocity points back into the
  // arena; doing it the other way round walks the boss out through the wall.
  const stepTo = (col, xlo, flags = 0x81) => {
    const state = arena({ level: 11, bossId: 3 });
    const r = boss(state, 8, { col, xlo });
    r[0] = flags;                              // airborne (or airborne + stun)
    r[0x12] = 0x10;                            // an unobstructed step right
    r[5] = 0;
    primaryDispatch(state, r);
    return { state, r };
  };

  const bounce = stepTo(0x09, 0xF0, 0xA1);     // steps to X hi $0A
  assert.equal(bounce.r[5], 1, 'turned around');
  assert.equal(bounce.state.flow.bossCrit, 1);
  assert.equal(bounce.r[0x12], 0xD4, 're-armed at -$2C by the NEW facing');
  assert.equal(bounce.r[0x14], 0x1F);
  // $7248 masks with $C7, so the idle bit goes; this fixture's floor then
  // takes the airborne bits back off in the same frame's fallTail.
  assert.equal(bounce.r[0], 0x88);

  const open = stepTo(0x05, 0xF0);             // mid-arena: nothing happens
  assert.equal(open.r[5], 0);
  assert.equal(open.state.flow.bossCrit, 0);
  assert.equal(open.r[0x12], 0x10, 'still coasting');

  // $7242: a STUNNED boss does not ricochet -- it stops dead at the wall.
  const stunned = stepTo(0x09, 0xF0, 0x85);
  assert.equal(stunned.r[0x12], 0, '$7263');
  assert.equal(stunned.r[5], 0, 'no turn');
  assert.equal(stunned.state.flow.bossCrit, 0, 'and no lunge');
});

// ---------------------------------------------------------------------------
// The attack ticks' re-arm target.  ROM: jt_01_61DD $61FB / jt_01_6300 $632A.
// ---------------------------------------------------------------------------

test('a MISSED boss swing re-arms +$15, not the attack timer -- HL sits at +1', () => {
  // ROM: $61FB `LD H,D / LD L,E / INC HL` puts HL at +1 (where the OR $10
  // lands), and only THEN does $6202 add $14. The store at $6206 therefore
  // reaches +$15, the committed-walk timer -- one byte past the attack timer
  // the `LD BC,$0014` makes it look like. $632A is the same instruction
  // sequence in boss 4's tick.
  //
  // MEASURED on the cartridge: the re-arm hook fires on every missed frame
  // while +$14 keeps counting down 30, 29, 28... If the $28 went to +$14 the
  // swing would never expire at all, and the two bosses would hold their pose
  // forever.
  for (const [st, opts] of [[7, { level: 8, bossId: 2 }], [9, { level: 14, bossId: 4 }]]) {
    const state = arena(opts);
    const r = boss(state, st);
    r[0] = 0x88;                               // active + melee attack
    r[0x14] = 0x1E;
    r[0x15] = 0;
    updateEnemies(state);                      // $4F19 -> loc_01_60DD

    assert.equal(r[0x15], 0x28, `state ${st}: the committed-walk timer took it`);
    assert.equal(r[0x14], 0x1D, `state ${st}: the attack timer just counted down`);
    assert.equal(r[1] & 0x10, 0x10, `state ${st}: $61FF committed the walk`);
  }
});

// ---------------------------------------------------------------------------
// State 7 -- Boss 2 (level 8) and its state-13 afterimages.  ROM: jt_01_6D8A.
// ---------------------------------------------------------------------------

/** Boss 2 parked in the dead zone, so only the handler head does anything. */
function boss2(opts = {}) {
  const state = arena({ level: 8, bossId: 2 });
  state.flow.difficulty = opts.difficulty ?? 1;
  state.flow.bossRage = opts.rage ?? 0;
  state.frame = opts.frame ?? 0;
  const r = boss(state, 7, { hp: opts.hp ?? 0x20 });
  r[7] = 0x90;                                 // == the player's screen X
  return { state, r };
}

test('boss 2 enrages below $0E HP and conscripts slots 1 and 2 as afterimages', () => {
  // ROM: $6D97-$6DC9. The threshold is `CP $0E / JR NC`, and $6D9B gates the
  // whole thing on $C756 -- on EASY the boss never enrages at all. The two
  // slots are written by absolute address ($C288/$C2A8 = records 1 and 2), and
  // their flag bytes differ by exactly bit 0: that bit is the draw PARITY the
  // state-13 handler tests, so the pair flickers on alternate frames instead of
  // both appearing at once. HP $FF keeps the driver's $4E75 zero-HP kill off
  // them; they are not enemies, they are ghosts.
  const { state, r } = boss2({ hp: 0x0D });
  primaryDispatch(state, r);
  assert.equal(state.flow.bossRage, 1, '$C73D');
  assert.equal(r[0x1C], 0x38, 'jump velocity boosted');
  assert.equal(r[0x1D], 0x14, 'walk cap boosted');
  assert.equal(state.enemies[1][0], 0x80);
  assert.equal(state.enemies[2][0], 0x81, 'the parity bit is the whole difference');
  assert.equal(state.enemies[1][2], 0x0D);
  assert.equal(state.enemies[2][2], 0x0D);
  assert.equal(state.enemies[1][0x16], 0xFF);
  assert.equal(state.enemies[2][0x16], 0xFF);

  const easy = boss2({ hp: 0x0D, difficulty: 0 });
  primaryDispatch(easy.state, easy.r);
  assert.equal(easy.state.flow.bossRage, 0, 'easy never enrages');
  assert.equal(easy.state.enemies[1][0], 0, 'and never wakes the ghosts');

  const healthy = boss2({ hp: 0x0E });
  primaryDispatch(healthy.state, healthy.r);
  assert.equal(healthy.state.flow.bossRage, 0, '$0E is not below $0E');
});

test('the afterimage chain is a two-stage shift taken every 8th frame', () => {
  // ROM: $6DCC-$6DF1, and it is an ELSE arm -- the frame that enrages does not
  // also shift, because $6D90 jumped past the whole block. Slot 2 takes slot
  // 1's bytes BEFORE slot 1 takes the boss's, so the pair trails the boss by 8
  // and 16 frames. The bytes are the boss's DRAW state (+6 metasprite, +7/+8
  // screen pair) as loc_01_5CA8 left them LAST frame, so an afterimage is a
  // literal replay of an earlier frame's sprite, not a re-projected position.
  const { state, r } = boss2({ rage: 1, frame: 0x08 });
  r[6] = 0x11; r[7] = 0x22; r[8] = 0x33;
  state.enemies[1].set([0x44, 0x55, 0x66], 6);
  primaryDispatch(state, r);
  assert.deepEqual([...state.enemies[2].slice(6, 9)], [0x44, 0x55, 0x66], 'slot 2 <- slot 1');
  assert.deepEqual([...state.enemies[1].slice(6, 9)], [0x11, 0x22, 0x33], 'slot 1 <- the boss');

  const off = boss2({ rage: 1, frame: 0x09 });
  off.r[6] = 0x11; off.r[7] = 0x22; off.r[8] = 0x33;
  primaryDispatch(off.state, off.r);
  assert.deepEqual([...off.state.enemies[1].slice(6, 9)], [0, 0, 0], '$FFB1 & 7 != 0');
});

test('a state-13 afterimage draws on ONE parity and never recomputes its position', () => {
  // ROM: jt_01_78A7. Flag bit 0 selects which $FFA7 half the image is drawn on;
  // the other half is a bare `JP loc_01_60C7`, the driver's exit. There is no
  // path to loc_01_5CA8 anywhere in this handler, so +7/+8 keep whatever the
  // history chain last put there -- which is the point. Routing state 13
  // through screenTail "for consistency" would re-project the ghost onto the
  // BOSS's current world position and collapse the trail.
  const draw = (flags, parity) => {
    const state = arena({ level: 8, bossId: 2 });
    state.parity = parity;
    const r = boss(state, 0x0D);
    r[0] = flags;
    r[6] = 0x77; r[7] = 0x12; r[8] = 0x34;
    r[0x0E] = 0x1F;                            // world position deliberately elsewhere
    primaryDispatch(state, r);
    return { state, r };
  };

  const even = draw(0x80, 0);
  assert.deepEqual(even.state.enemyDraws,
                   [{ id: 0x77, x: 0x12, y: 0x34, attr: 0, alt: false }]);
  assert.equal(even.r[7], 0x12, '+7 untouched');
  assert.equal(even.r[8], 0x34, '+8 untouched');

  assert.equal(draw(0x80, 1).state.enemyDraws.length, 0, 'bit 0 clear: even frames only');
  assert.equal(draw(0x81, 1).state.enemyDraws.length, 1, 'bit 0 set: odd frames');
  assert.equal(draw(0x81, 0).state.enemyDraws.length, 0);
});

test('a batarang on a GROUNDED boss 2 is armour; airborne it is an ordinary hit', () => {
  // ROM: loc_00_3C8A -> $3C94. The armoured states (2/7/$0A) normally bounce
  // the batarang and take zero damage, but on $C73E == 2 the arm splits again:
  // $3C9B tests the RECORD's rising/falling bits and, if either is set, jumps
  // to $3CF4 -- the ordinary 1-damage arm, hit-flash and all -- with no bounce.
  // Grounded, it takes the $1E spin instead ($C741, which is what drives the
  // $5D20 special draw) and still no damage.
  //
  // Both halves emit sound $1D first; the airborne one then adds $19 on the way
  // through the damage arm, which is the audible tell.
  const scene = (flags) => {
    const s = makeState(grid(24), { level: 8, bossId: 2 });
    s.player.x = 0x0100;
    s.player.y = 0x1500;
    const b = s.batarangs[0];
    Object.assign(b, { active: true, flags: 0x01, speed: 4, arc: 0, x: 0x0600, y: 0x1500 });
    const r = s.enemies[0];
    r[0] = flags;
    r[2] = 0x07;
    r[7] = 0x68; r[8] = 0x60;                  // exactly on the batarang
    r[0x16] = 6;
    updateBatarangs(s);
    return { s, r, b };
  };

  const grounded = scene(0x80);
  assert.equal(grounded.r[0x16], 6, 'armoured: no damage');
  assert.equal(grounded.s.flow.bossHop, 0x1E, '$3CA2: the $C741 spin');
  assert.equal(grounded.r[0] & 0x08, 0, '$3C94 skips the SET 3 at $3CA7 entirely');
  assert.equal(grounded.b.flags & FLAG_RETURNING, FLAG_RETURNING, 'and it bounces');
  assert.deepEqual(grounded.s.sound.queue, [{ id: 0x1D, mask: 1 }]);

  const airborne = scene(0x82);                // falling
  assert.equal(airborne.r[0x16], 5, '$3C9E falls through to $3CF4');
  assert.equal(airborne.s.flow.bossHop, 0, 'no spin');
  assert.equal(airborne.r[0] & 0x04, 0x04, 'hit-flash');
  assert.equal(airborne.r[0x17], 0x3C);
  assert.equal(airborne.b.flags & FLAG_RETURNING, 0, 'and NO bounce -- it flies on');
  assert.deepEqual(airborne.s.sound.queue, [{ id: 0x1D, mask: 1 }, { id: 0x19, mask: 1 }]);
});

// ---------------------------------------------------------------------------
// State 6 -- the level-12 pacing shooter.  ROM: jt_01_57D6.
// ---------------------------------------------------------------------------

test('a PACING level-12 shooter fires on the world COLUMN, ignoring screen X', () => {
  // ROM: loc_01_590E / loc_01_5921. Every other band in this handler compares
  // $FF93 against the cached +7 -- these two arms read $FF81, the player's
  // world X HIGH byte, against the record's own +$0E. The enemy therefore fires
  // when it is within three METATILES of the player's column, whatever the
  // camera is doing, and the fixture below proves it by parking the cached
  // screen X $90 px away where a screen-space test could never fire.
  const pace = (col) => {
    const state = arena({ level: 12 });
    state.player.x = 0x0A00;                   // world column $0A
    const r = boss(state, 6, { col });
    r[1] = 0x04;                               // $5803: pacing rightward
    r[7] = 0x00;                               // absurd, and never consulted
    primaryDispatch(state, r);
    return { state, r };
  };

  const fires = pace(0x0C);                    // |$0A - $0C| = 2
  assert.equal(fires.r[0] & 0x08, 0x08, '$5856 SET 3 -- the MELEE bit, not ranged');
  assert.equal(fires.r[0x14], 0x0F, '$585C');
  assert.equal(fires.r[0] & 0x20, 0, '$5854 RES 5');

  // $584B: mode 2 -- template 1:$6D0A into the first free slot, X +$180 toward
  // the facing, Y -$60. The spawn result is IGNORED here, unlike state 2's.
  const p = fires.state.enemies[6];
  assert.equal(p[0], 0x80);
  assert.equal(p[2], 0x0B, 'state 11, the projectile');
  assert.equal(p[0x16], 0xFF);
  assert.equal((p[0x0E] << 8) | p[0x0F], 0x0D80, '$0C00 + $180');
  assert.equal((p[0x10] << 8) | p[0x11], 0x13A0, '$1400 - $60');
  assert.deepEqual(fires.state.sound.queue, [{ id: 0x1F, mask: 1 }], 'level 12s shot');

  const walks = pace(0x0D);                    // |$0A - $0D| = 3: `CP $03 / JR NC`
  assert.equal(walks.r[0] & 0x08, 0, 'three columns is already out of range');
  assert.equal(walks.r[0x12], 1, 'it paces on, accelerating by 1');
  assert.equal(walks.state.enemies[6][0], 0, 'nothing spawned');
});

// ---------------------------------------------------------------------------
// The $1438 player gate.  ROM: loc_00_1438.
// ---------------------------------------------------------------------------

test('the $C750 gate clears the held input and skips the WHOLE player update', () => {
  // ROM: $1438-$1441. `LD A,[$C750] / AND A / JR Z` -- while it holds, $FFE1 is
  // zeroed and the code jumps to $1B4A, the draw tail. No exits, no pit test,
  // no knockback, no physics: MEASURED as zero hits on hooks at $1755 and
  // $1B42 across the whole 200-frame level-14 entrance, which is also why the
  // entrance's $FF87 = $10 stamp survives -- the landing arm never runs to
  // zero it.
  //
  // The gate is a plain zero test, so the interesting half is the other one:
  // it must be inert the rest of the game, where $C750 is 0 on every level but
  // 14. A gate that leaked would freeze the player mid-level with no symptom
  // other than "the controls stopped".
  const airborne = (bossMode) => {
    const state = makeState(floorFrom(grid(32), 14, '#'));
    state.flow.bossMode = bossMode;
    placePlayer(state, 5, 6, 0x80, 0x00);      // well above the floor
    state.player.air = 2;
    state.player.vy = 0;
    setInput(state, BTN.RIGHT);
    step(state, 1);
    return state;
  };

  const gated = airborne(1);
  assert.equal(gated.input.held, 0, '$143F: $FFE1 = 0');
  assert.equal(gated.player.y, (0x16 << 8) | 0x00, 'no gravity');
  assert.equal(gated.player.x, (5 << 8) | 0x80, 'no movement');
  assert.equal(gated.player.vy, 0, 'and $FF87 is left exactly as it was found');

  const free = airborne(0);
  assert.equal(free.input.held, BTN.RIGHT, 'untouched with $C750 clear');
  assert.ok(free.player.y > ((0x16 << 8) | 0x00), 'gravity ran');
  assert.ok(free.player.x > ((5 << 8) | 0x80), 'and so did the input');
});
