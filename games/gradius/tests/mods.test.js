// THE MODS, and the rule that keeps them safe.
//
// Two kinds of test are in here and they are kept apart on purpose:
//
//   1. THE ONE RULE -- with no loadout attached, `state.mods` is undefined and
//      every hook in src/mods.js is unreachable. That is what makes the 47
//      oracle scenarios, the 732 unit tests and `rendergate` still mean what
//      they meant before this file existed.
//   2. One test per mod, each of which FAILS if that mod's hook stops firing.
//      Seen to fail, one at a time, by mutating src/mods.js -- the mutations
//      and the red test each produced are listed in
//      docs/worklog/gradius/41-impl-mods.md.
//
// NOTHING HERE IS EVIDENCE ABOUT THE CARTRIDGE. Mods are not ported behaviour;
// they are behaviour this repo added. What these tests hold is that each one
// writes the byte it says it writes, on the frame it says it writes it, and
// that none of them can write anything when they are off.

import test from 'node:test';
import assert from 'node:assert/strict';

import { createState, ENEMY_BASE, BTN, MODE_STAGE } from '../src/state.js';
import { bootState, introEntryState, stepLogicFrames } from '../src/main.js';
import { introReset, respawn } from '../src/flow.js';
import { newGame, st8165 } from '../src/modes.js';
import { die, collision } from '../src/collision.js';
import { nmi } from '../src/nmi.js';
import {
  MODS, PRESETS, CATEGORIES, START_KEYS,
  resolveLoadout, attachMods, describeMod, loadoutToHash, hashToLoadout, PLAY_MODE,
  modAfterIntroReset, modRefuseDeath, modHidePlayer,
  modShowPlayer, modFreezeEnemies, modFrameEnd, modInput, modRenderBreaks,
  modPalette, modPostRender, modFlyIn, modAbandonRun, FLY_IN_X,
} from '../src/mods.js';
import { applyCapsule } from '../src/powerup.js';
import { resetInput, setTouchButton } from '../src/input.js';
import { renderFrame, W as PPU_W, H as PPU_H } from '../src/render/ppu.js';
import { headlessResources } from './helpers.js';
import { readFileSync } from 'node:fs';

const res = headlessResources(0);

/** A play state with a loadout attached. */
function modded(ids, opts = {}) {
  const s = bootState(res.manifest);
  s.obj.status[0] = 1;
  attachMods(s, resolveLoadout(ids, opts));
  return s;
}

// ===========================================================================
//  1. THE ONE RULE
// ===========================================================================

test('THE ONE RULE: a fresh state has no mods object at all', () => {
  // Not "an empty loadout" -- ABSENT. Every `if (state.mods)` in src/ is a
  // branch-not-taken, and there is no code path a scenario can reach that
  // makes one true. If this ever becomes `{}` the guards stop guarding.
  assert.equal(createState().mods, undefined);
  assert.equal(bootState(res.manifest).mods, undefined);
  assert.equal(introEntryState(res.manifest).mods, undefined);
});

test('THE ONE RULE: attachMods refuses to attach nothing', () => {
  const s = bootState(res.manifest);
  assert.equal(attachMods(s, resolveLoadout([])), null);
  assert.equal(s.mods, undefined, 'an empty selection must leave the state clean');
  // ...and an unknown id is dropped rather than attached.
  assert.equal(attachMods(s, resolveLoadout(['no-such-mod'])), null);
  assert.equal(s.mods, undefined);
  // ...and so is a picker left entirely at its defaults, which is what
  // start.html hands over when a player presses LAUNCH without touching
  // anything. A zero in the picker means "leave it to the cartridge".
  const vanilla = resolveLoadout([], { stage: 0, speed: 0, missile: 0, meter: 0,
                                       weapon: 0, options: 0, shield: 0 });
  assert.deepEqual(vanilla.zp, {});
  assert.equal(vanilla.anyStart, false);
  assert.equal(attachMods(s, vanilla), null);
  assert.equal(s.mods, undefined);
});

test('THE ONE RULE: every hook is inert on a state with no loadout', () => {
  const s = bootState(res.manifest);
  const before = JSON.stringify([...s.zp.speed ? [] : [], s.zp17, s.obj.anim[0]]);
  modAfterIntroReset(s);
  modFrameEnd(s);
  modPostRender(s, new Uint32Array(4), 2, 2);
  assert.equal(modRefuseDeath(s), false);
  assert.equal(modHidePlayer(s), -1);
  assert.equal(modFreezeEnemies(s), false);
  assert.equal(modInput(s, 0x0F), 0x0F);
  assert.equal(modRenderBreaks(s), undefined);
  assert.equal(modPalette(s), null);
  assert.equal(JSON.stringify([...s.zp.speed ? [] : [], s.zp17, s.obj.anim[0]]), before);
});

test('THE ONE RULE: 120 unmodded frames leave state.mods undefined', () => {
  // The blunt version. If any src/ call site ever CREATES the object instead of
  // testing for it, this goes red.
  const s = introEntryState(res.manifest);
  for (let i = 0; i < 120; i++) nmi(s, 0, res);
  assert.equal(s.mods, undefined);
});

// ===========================================================================
//  2. The catalogue's shape (what the launcher and start.html depend on)
// ===========================================================================

test('every mod has a name, a blurb and a real category', () => {
  for (const [id, m] of Object.entries(MODS)) {
    assert.ok(m.name && m.name.length, `${id} has no name`);
    assert.ok(m.blurb && m.blurb.length > 20, `${id}'s blurb is not a blurb`);
    assert.ok(CATEGORIES.includes(m.category), `${id}: category ${m.category}`);
    assert.ok(m.zp || m.sim || m.render || m.meta, `${id} does nothing`);
    assert.ok(describeMod(id).length, `${id} describes as empty`);
  }
  for (const [id, p] of Object.entries(PRESETS)) {
    for (const m of p.mods) assert.ok(MODS[m], `preset ${id} names ${m}, which does not exist`);
  }
});

test('the owner named two mods and the names are exact', () => {
  assert.equal(MODS['heal-gradius-syndrome'].name, 'Heal Gradius Syndrome');
  assert.equal(MODS['always-on-enemies'].name, 'Always on enemies');
});

test('the start screen and game.json cannot go stale, because neither lists mods', () => {
  // `game.json` carries `"code": { "mods": "src/mods.js", "page": "start.html" }`
  // and NO catalogue of its own, and start.html builds its cards by walking
  // `Object.entries(MODS)`. So a mod added to src/mods.js appears on the start
  // screen, in its category, with its blurb, and there is no second list to
  // update. Pinned here because "remember to update the start screen" is a
  // maintenance instruction and this is the reason there is not one.
  const gj = JSON.parse(readFileSync(new URL('../game.json', import.meta.url), 'utf8'));
  assert.equal(gj.code.mods, 'src/mods.js');
  assert.equal(gj.code.page, 'start.html');
  const raw = readFileSync(new URL('../game.json', import.meta.url), 'utf8');
  for (const id of Object.keys(MODS)) {
    assert.ok(!raw.includes(`"${id}"`), `game.json names the mod ${id}; it must not`);
  }
  const page = readFileSync(new URL('../start.html', import.meta.url), 'utf8');
  assert.ok(page.includes('Object.entries(MODS)'), 'start.html walks the catalogue');
  assert.ok(page.includes('Object.entries(PRESETS)'), '...and the presets');
  for (const id of Object.keys(MODS)) {
    assert.ok(!page.includes(`'${id}'`), `start.html names the mod ${id}; it must not`);
  }
  // ...and the two W45 mods really are in a category the page has a grid for.
  for (const id of ['heal-gradius-syndrome', 'hard-won']) {
    assert.ok(page.includes(`data-cat="${MODS[id].category}"`),
      `${id} is in category ${MODS[id].category}, which start.html has no grid for`);
  }
});

test('the hash round-trips a selection', () => {
  const ids = ['full-power', 'heal-gradius-syndrome', 'hard-won'];
  const back = hashToLoadout('#' + loadoutToHash(ids, 4));
  assert.deepEqual(back.ids, ids);
  assert.equal(back.level, 4);
  assert.deepEqual(hashToLoadout('').ids, []);
  assert.equal(hashToLoadout('#level=99').level, 7, 'the level is clamped to the seven stages');
  // A '+' IN A QUERY STRING IS AN ENCODED SPACE. URLSearchParams decodes it, so
  // a hash written `mods=a+b` comes back as the single string "a b" -- and
  // splitting on '+' alone turned a two-mod link into one unknown id and
  // launched vanilla. Found in a real browser; pinned here.
  assert.deepEqual(hashToLoadout('#mods=rank-max loop-three').ids,
                   ['rank-max', 'loop-three']);
});

// ===========================================================================
//  3. FULL POWER-UPS  ($40 $41 $42 $44 $45 $46, re-granted at every $9B3E)
// ===========================================================================

test('Full Kit writes all six power-up bytes at the tail of $9B3E', () => {
  const s = modded(['full-power']);
  introReset(s, res);
  assert.equal(s.zp.speed, 1, '$40 -- ONE, not five');
  assert.equal(s.zp.missile, 1, '$41');
  assert.equal(s.zp.meter, 6, '$42 -- the bar cursor parked on ?/SHIELD');
  assert.equal(s.zp.weapon, 2, '$44 -- 2 is DOUBLE ($89BB), not laser');
  assert.equal(s.zp.options, 2, '$45 -- the $89D5 cap');
  assert.equal(s.zp.shield, 5, '$46 -- what $8997 grants');
});

test('Full Kit survives the death that strips a normal run', () => {
  // The whole point of the mod. $9B3E's `LDX #$5A / STA $3D,X` wipes $3D-$97,
  // which is every one of these bytes; a stock respawn comes back with nothing.
  const s = modded(['full-power']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 4;
  respawn(s, res);                     // $979D -> $97DD -> $9B3E, all one frame
  assert.equal(s.zp.shield, 5, 'the shield came back');
  assert.equal(s.zp.options, 2, 'both Options came back');
  assert.equal(s.zp.speed, 1, '...and speed is still 1');
  assert.equal(s.lives[0], 2, 'and it is still a real death: $979F DEC $20,X');
});

test('the meter cursor Full Kit leaves is one $8974 refuses to spend', () => {
  // $42 = 6 with $46 non-zero takes `$8999 BNE $8983`, which KEEPS $42. So the
  // bar stays parked on the shield cell instead of being eaten on the first
  // frame the player holds B. Measured behaviour of the ROM's own arm; this is
  // a second witness for src/powerup.js's, from the mod's starting state.
  const s = modded(['full-power']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.input.held = BTN.B;
  applyCapsule(s, res);
  assert.equal(s.zp.meter, 6);
  assert.equal(s.zp.shield, 5);
});

test('Full Kit beats the picker; the picker alone lands once', () => {
  const withMod = modded(['full-power'], { shield: 0, options: 0, speed: 4 });
  introReset(withMod, res);
  assert.equal(withMod.zp.shield, 5, 'the mod wins the bytes it names');
  assert.equal(withMod.zp.speed, 1);

  const pickerOnly = modded([], { shield: 5, weapon: 1 });
  introReset(pickerOnly, res);
  assert.equal(pickerOnly.zp.shield, 5);
  assert.equal(pickerOnly.zp.weapon, 1);
  // ...and it is a STARTING kit: the second intro does not re-grant it.
  pickerOnly.zp.shield = 0;
  introReset(pickerOnly, res);
  assert.equal(pickerOnly.zp.shield, 0);
});

test('Muscle Memory makes the picker sticky across respawns', () => {
  const s = modded(['muscle-memory'], { shield: 5, weapon: 1, options: 2 });
  introReset(s, res);
  s.zp.shield = 0; s.zp.weapon = 0; s.zp.options = 0;
  introReset(s, res);
  assert.equal(s.zp.shield, 5);
  assert.equal(s.zp.weapon, 1);
  assert.equal(s.zp.options, 2);
});

test('$45 is clamped to 2, because slot 3 is a SHOT slot', () => {
  // Not timidity: `$A108 LDX $45 ... DEX / BPL` walks object slots 0..$45 and
  // 3-5 are shot A. src/weapons.js already throws on the range; the mod layer
  // must not be the thing that hands it a 3.
  const s = modded([], { options: 7 });
  introReset(s, res);
  assert.equal(s.zp.options, 2);
});

// ===========================================================================
//  4. HEAL GRADIUS SYNDROME
// ===========================================================================

// W45 REPLACED THE MECHANISM. The mod used to capture the death position at
// `$C1D6` and replay it into the tail of the NEXT `$9B3E` -- a position replay
// bolted onto a stage intro, which is why the owner said it "still put you back
// at some scene". It now does not run `$9B3E` at all: `$97DB` hands the respawn
// to modRespawnInPlace, which wipes the six power-up bytes, seeds the ship at
// the left edge and returns to `$80` on the same frame.

test('Heal Gradius Syndrome does not roll the camera back to the checkpoint', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  // Fly out to camera high byte 7 and die there.
  s.cam.hi = 7; s.cam.lo = 0x80; s.cam.sub = 0x40;
  s.build.hi = 7; s.build.lo = 0x90; s.build.ahead = 3; s.build.prog = 5;
  s.obj.x[0] = 200; s.obj.y[0] = 40;
  s.substate = 0x80;
  // $9B3E's tail armed the blink; burn it off, or the death is refused and
  // there is no respawn to look at. (That refusal is its own test, below.)
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  assert.equal(s.obj.status[0], 2, 'the death itself is not refused');
  assert.equal(respawn(s, res), false,
    'the frame carries on into $9A5E: this is a play frame, not a stage intro');
  assert.equal(s.lives[0], 2, 'it still cost a life -- $979F DEC $20,X');
  // THE ONE THING THE MOD IS FOR.
  assert.equal(s.cam.hi, 7, '$3F is untouched: $9B68 never ran to read $24,X');
  assert.equal(s.cam.lo, 0x80, '...and so is $3E, so the camera did not even snap');
  assert.equal(s.cam.sub, 0x40);
  assert.equal(s.build.hi, 7, 'the terrain build cursor is where the streamer left it');
  assert.equal(s.build.lo, 0x90);
  assert.equal(s.build.ahead, 3, '$57 is not re-seeded: $9C09 never ran');
  assert.equal(s.build.prog, 5);
  assert.equal(s.save24[0], 6,
    '$97BB still WROTE min(7 AND $0E, 8) -- the cartridge is unchanged, it is '
    + 'just never read');
  assert.equal(s.substate, 0x80, '$1B := $80, which is $9C3C');
  assert.equal(s.spawn.z60, 1, '...and $60 := 1 with it');
});

test('...and the new ship comes in from the left of the screen, blinking', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 7; s.obj.x[0] = 200; s.obj.y[0] = 40;
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  respawn(s, res);
  assert.equal(s.obj.status[0], 1, '$0100 := 1 -- a new ship, alive');
  assert.equal(s.obj.anim[0], 1, '$0120 := 1, the level-ship metasprite ($9B83)');
  // THE ENTRY X IS `$A03A`'s OWN LEFT CLAMP. It was 0 for one draft and
  // modscope.mjs threw on seven loadouts: `$C3AD` uses a non-zero `$0360` as
  // its "this is the PLAYER" test, so X = 0 is not a position this game has.
  assert.equal(FLY_IN_X, 0x10, 'the leftmost pixel $A03A lets the Viper occupy');
  assert.equal(s.obj.x[0], FLY_IN_X, 'INVENTED: it enters at the left wall');
  assert.equal(s.ring.x[0], FLY_IN_X, 'and both 24-entry rings $A08C walks agree');
  assert.equal(s.ring.y[0], s.obj.y[0]);
  // The Y is the CARTRIDGE's: $9BD4[$9BCC[$19] + ($24,X >> 1)] AND $F0, i.e.
  // exactly what $9B92 would have produced for this stage and checkpoint.
  const y = res.flowTables.read(0x9BCC + s.zp19) + (s.save24[0] >> 1);
  assert.equal(s.obj.y[0], res.flowTables.read(0x9BD4 + y) & 0xF0,
    'the Y is $9B92\'s own table byte, not an invented one');
  assert.equal(s.mods.rt.flyInTo, (res.flowTables.read(0x9BD4 + y) << 4) & 0xFF,
    '...and the fly-in aims at $9BAB\'s own X for the same byte');
  assert.equal(s.mods.rt.invuln, 180, 'blinking and invulnerable');
  assert.ok(s.mods.rt.flyIn > 0, 'and the autopilot is holding RIGHT');
});

test('the fly-in is $9C88: RIGHT written into $05/$07, and it lets go on arrival', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 7;
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  respawn(s, res);
  const target = s.mods.rt.flyInTo;
  assert.ok(target > 0);

  // A player mashing LEFT cannot fight it: $9C88 overwrites the latched byte.
  s.input.held = BTN.LEFT; s.input.pressed = BTN.LEFT;
  modFlyIn(s);
  assert.equal(s.input.held, BTN.RIGHT, '$9C8D STA $07');
  assert.equal(s.input.pressed, BTN.RIGHT, '$9C8B STA $05');
  assert.equal(s.input.held & (BTN.A | BTN.B), 0,
    'no fire and no power meter while the autopilot has it');

  // Fly it in for real, through $9FFC's own X code.
  for (let i = 0; i < 300 && s.mods.rt.flyIn > 0; i++) nmi(s, 0, res);
  assert.equal(s.mods.rt.flyIn, 0, 'the autopilot let go');
  assert.ok(s.obj.x[0] >= target, `the ship arrived (${s.obj.x[0]} >= ${target})`);
  assert.ok(s.obj.x[0] < target + 16, '...and did not overshoot the screen');
  // ...and the player has the stick back.
  s.input.held = BTN.LEFT; s.input.pressed = BTN.LEFT;
  modFlyIn(s);
  assert.equal(s.input.held, BTN.LEFT, 'the pad is the player\'s again');
});

test('the fly-in reads $9BD4 through $9BCC[$19], per stage AND per checkpoint', () => {
  // The one stage-dependent thing in the new code, pinned against the ROM's own
  // bytes rather than against itself. `$9BCC` is [0, 5, 10, 0, 0, 15, 20, 0] and
  // `$9BD4` is five entries per stage, so a respawn deep in stage 3 or stage 6
  // is a DIFFERENT row from the one every early death produces:
  //
  //   stage 3, $3F = 5 -> $24,X = 4 -> $9BD4[10 + 2] = $75 -> (80, 112)
  //   stage 6, $3F = 7 -> $24,X = 6 -> $9BD4[15 + 3] = $A3 -> (48, 160)
  //
  // modscope.mjs's stage sweep drives all seven stages but its deaths are all
  // early, so it only ever reaches checkpoint 0. These are the other rows.
  for (const [stage, cam, wantY, wantX] of [[2, 5, 112, 80], [5, 7, 160, 48]]) {
    const s = modded(['heal-gradius-syndrome']);
    introReset(s, res);
    s.zp19 = stage;                      // $9B6E has already run; $96CF INC $19
    s.obj.status[0] = 1;
    s.cam.hi = cam;
    for (let i = 0; i < 180; i++) modFrameEnd(s);
    die(s);
    respawn(s, res);
    assert.equal(s.save24[0], Math.min(cam & 0x0E, 8), `stage ${stage + 1}: $97BB`);
    assert.equal(s.obj.y[0], wantY, `stage ${stage + 1}: $9B92's own table Y`);
    assert.equal(s.mods.rt.flyInTo, wantX, `stage ${stage + 1}: $9BAB's own table X`);
    assert.equal(s.obj.x[0], FLY_IN_X, '...and it still enters at the left wall');
  }
});

test('the in-place respawn takes $9B47 over the PLAYER\'S twelve slots, and no more', () => {
  // FOUND BY MEASUREMENT, NOT BY READING. The first draft seeded the ship and
  // left every other object alone, so a respawn came back with `$45 = 0` but
  // `$0121 = 4` and `$0122 = 5` still set -- and `$8B10` draws object i whenever
  // `$0120+i` is non-zero, while `$A0C8`'s loop (`LDX $45 / DEX / BPL`) writes
  // nothing at all at `$45 = 0`. Two ghost Options, welded to the new ship.
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 5;
  s.zp.options = 2;
  s.obj.anim[1] = 4; s.obj.anim[2] = 5;            // the Options, mid-animation
  s.obj.status[1] = 1; s.obj.status[2] = 1;
  s.obj.anim[3] = 0x20; s.obj.type[3] = 1; s.obj.x[3] = 120;   // a shot in flight
  s.obj.anim[9] = 0x30; s.obj.x[9] = 130;                      // and a missile
  // An enemy, which must be left exactly where it is -- that is the whole mod.
  const e = ENEMY_BASE;
  s.obj.type[e] = 0x83; s.obj.status[e] = 1; s.obj.anim[e] = 0x10;
  s.obj.x[e] = 200; s.obj.y[e] = 60;
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  respawn(s, res);
  assert.equal(s.zp.options, 0, '$45 was wiped');
  assert.deepEqual([...s.obj.anim.slice(1, 12)], new Array(11).fill(0),
    'slots 1-11 are clear: no ghost Options, no orphan shots, no orphan missile');
  assert.deepEqual([...s.obj.status.slice(1, 12)], new Array(11).fill(0));
  assert.deepEqual([...s.obj.type.slice(1, 12)], new Array(11).fill(0));
  // ...and the enemy is untouched, unlike $9B47's own LDX #$7F.
  assert.equal(s.obj.type[e], 0x83, 'the enemy is still there');
  assert.equal(s.obj.x[e], 200, '...at the same pixel');
  assert.equal(s.obj.anim[e], 0x10);
});

test('Heal Gradius Syndrome still wipes the loadout: that is the OTHER mod', () => {
  // The owner's split, as an assertion. `heal-gradius-syndrome` does not touch
  // weapons; `$9B3E`'s five capsule stores happen anyway.
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.zp.speed = 3; s.zp.missile = 1; s.zp.weapon = 2;
  s.zp.options = 2; s.zp.shield = 5; s.zp.meter = 4;
  s.cam.hi = 7;
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  respawn(s, res);
  assert.deepEqual(
    [s.zp.speed, s.zp.missile, s.zp.weapon, s.zp.options, s.zp.shield],
    [0, 0, 0, 0, 0], 'stock rules: the bar is gone');
  assert.equal(s.zp.meter, s.save22[0],
    '$42 comes back from $22,X, which is $9B64/$9B66 -- 1, never the real cursor');
});

test('...and a stock run does exactly what the cartridge does', () => {
  // The control. Same death, no mod: $97BB stores min($3F AND $0E, 8), $9B68
  // reads it back into $3F and $55, and the ship comes back at $9BD4's table
  // position with the whole stage intro in front of it.
  const s = bootState(res.manifest);
  s.obj.status[0] = 1;
  s.cam.hi = 7; s.cam.lo = 0x80; s.obj.x[0] = 200; s.obj.y[0] = 40;
  assert.equal(respawn(s, res), true, 'the stage intro owns the frame');
  assert.equal(s.save24[0], 6, 'min(7 AND $0E, 8) = 6');
  assert.equal(s.cam.hi, 6, 'THE ROLLBACK: $3F is the checkpoint');
  assert.equal(s.cam.lo, 0, '...and $3E was wiped with the other 90 bytes');
  assert.notEqual(s.obj.x[0], 200);
  assert.notEqual(s.obj.x[0], FLY_IN_X, 'and the cartridge teleports; it does not fly in');
});

// ---------------------------------------------------------------------------
//  HARD WON -- the other half of Gradius syndrome
// ---------------------------------------------------------------------------

test('Hard Won carries the six power-up bytes across the death, on $979D\'s own wire', () => {
  const s = modded(['hard-won']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 7;
  s.zp.speed = 3; s.zp.missile = 1; s.zp.weapon = 1;
  s.zp.options = 2; s.zp.shield = 4; s.zp.meter = 5;
  die(s);
  respawn(s, res);                                // $979D -> $97DD -> $9B3E
  assert.equal(s.zp.speed, 3, '$40');
  assert.equal(s.zp.missile, 1, '$41');
  assert.equal(s.zp.meter, 5, '$42 IN FULL -- $97A5 degrades it to 1 and this does not');
  assert.equal(s.zp.weapon, 1, '$44');
  assert.equal(s.zp.options, 2, '$45');
  assert.equal(s.zp.shield, 4, '$46');
  assert.equal(s.lives[0], 2, 'and it still cost a life');
  assert.equal(s.mods.rt.savedKit, null, 'the capture is consumed, not kept');
});

test('Hard Won does NOT stop the checkpoint rollback: that is the OTHER mod', () => {
  const s = modded(['hard-won']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 7; s.zp.shield = 4;
  assert.equal(respawn(s, res), true, 'the stage intro still runs, in full');
  assert.equal(s.save24[0], 6, '$97BB');
  assert.equal(s.cam.hi, 6, '$9B68 -- you are dragged back down the stage');
  assert.equal(s.build.hi, 6);
  assert.equal(s.zp.shield, 4, '...you just arrive there with your shield');
});

test('a stock run loses all six, which is what Hard Won is for', () => {
  const s = bootState(res.manifest);
  s.obj.status[0] = 1;
  s.zp.speed = 3; s.zp.missile = 1; s.zp.weapon = 1;
  s.zp.options = 2; s.zp.shield = 4; s.zp.meter = 5;
  respawn(s, res);
  assert.deepEqual(
    [s.zp.speed, s.zp.missile, s.zp.weapon, s.zp.options, s.zp.shield],
    [0, 0, 0, 0, 0]);
  assert.equal(s.zp.meter, 1, '$42 comes back as $97A5\'s 0-or-1, not as 5');
});

test('the invulnerability window refuses every death route', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  assert.equal(s.mods.rt.invuln, 180, 'armed by $9B3E\'s tail');
  s.obj.status[0] = 1;
  const sub = s.substate;                        // $9B76's INC has already run
  die(s);                                        // $C1D6 -- all four routes
  assert.equal(s.obj.status[0], 1, 'still alive');
  assert.equal(s.substate, sub, '$1B was not moved to $A0');
  assert.equal(s.zp4C, 0, 'and no 120-frame death countdown was seeded');
});

test('the window closes, and then the ship can die again', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  assert.equal(s.mods.rt.invuln, 0);
  die(s);
  assert.equal(s.obj.status[0], 2, 'the window is over; $C1D6 runs');
});

test('the ship flickers while invulnerable, by the game\'s own $0120 = 0', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.anim[0] = 1;
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    const saved = modHidePlayer(s);
    seen.add(s.obj.anim[0]);
    modShowPlayer(s, saved);
    // ...and the restore is total: nothing downstream of $80A7 may see the 0.
    assert.equal(s.obj.anim[0], 1, 'the metasprite id was put straight back');
    modFrameEnd(s);
  }
  assert.deepEqual([...seen].sort(), [0, 1], 'both drawn and not-drawn frames happened');
});

test('the flicker stops when the window does', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.anim[0] = 1;
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  for (let i = 0; i < 8; i++) assert.equal(modHidePlayer(s), -1);
});

// ---------------------------------------------------------------------------
//  W43 -- THE OWNER-REPORTED DEFECT: a death position that outlived its run
// ---------------------------------------------------------------------------
//
// "I went to boss 2, got shot down... suddenly the volcano from level 1 shot at
// me. Except the volcano wasn't there, it was all black space like level 2
// boss... when I beat it, level 2 started."
//
// The DEFECT was a capture consumed by "the next `$9B3E`", written as if the
// next `$9B3E` were always this death's respawn. On the LAST life it is not:
// `$97F1` never runs `$9B3E`, so the capture survives the whole game-over
// screen and lands on the FIRST `$9B3E` of the next game -- which, after
// `$970D` CONTINUE, is a brand-new stage-1 run. See
// docs/worklog/gradius/43-diag-stage-state-race.md for the frame trace.
//
// W45 REPLACED THE FIELD AND KEPT THE WIRE. `rt.death` is gone with the
// mechanism that needed it; `hard-won`'s `rt.savedKit` has the identical
// lifetime, is captured at `$979D` (before `$97C1`'s game-over branch, on
// purpose) and is dropped by the same two lines. So the two tests below are the
// same two tests, against the capture that exists now.

test('a game over abandons the death capture ($97F1, W43)', () => {
  const s = modded(['hard-won']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.zp19 = 1;                                     // stage 2
  s.substate = 0x86;                              // its boss is down
  s.cam.hi = 0x0D; s.cam.lo = 0x0C;               // ...and the camera is high
  s.zp.shield = 4; s.zp.options = 2;
  s.lives[0] = 0;                                 // $979F's DEC takes it negative
  die(s);
  respawn(s, res);                                // $979D -> $97C1 BMI -> $97F1
  assert.equal(s.substate, 0xC0, 'GAME OVER ($97FD), not a respawn');
  assert.equal(s.mods.rt.savedKit, null,
    '$97F1 is the end of the run: there is nothing to come back to');
});

test('...so CONTINUE starts a bare stage 1, not the dead run\'s bar', () => {
  const s = modded(['hard-won']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.zp19 = 1; s.substate = 0x86;
  s.cam.hi = 0x0D; s.cam.lo = 0x0C;
  s.zp.speed = 3; s.zp.shield = 4; s.zp.options = 2; s.zp.weapon = 2;
  s.lives[0] = 0;
  die(s);
  respawn(s, res);
  assert.equal(s.substate, 0xC0);

  // `$970D` CONTINUE, spelled as the ROM spells it: `JSR $82D5` then `$00 := 4`.
  // Then mode 4's three instructions and mode 5's `$1B = 0` intro dispatch.
  newGame(s);                                     // $970D JSR $82D5
  s.mode = 4;                                     // $9710/$9712 STA $00
  st8165(s);                                      // $8165 -- $1B := 0, mode 5
  assert.equal(s.mode, MODE_STAGE);
  assert.equal(s.substate, 0);
  introReset(s, res);                             // the NEW game's $9B3E

  assert.equal(s.zp19, 0, 'a continue is a new game, and new games start on stage 1');
  assert.equal(s.cam.hi, 0, '$3F is $9B68\'s checkpoint (0)');
  assert.equal(s.build.hi, 0, '...and $55 agrees, so the terrain streams from page 0');
  assert.deepEqual(
    [s.zp.speed, s.zp.missile, s.zp.weapon, s.zp.options, s.zp.shield],
    [0, 0, 0, 0, 0],
    'a new game flies a bare Viper, not the bar the LAST run died holding');
  // The W43 consequence in its own terms: page $0D is past stage 1's boss page,
  // so a camera left there sends `$9A4D` straight into `$81`/`$82`.
  assert.ok(s.cam.hi < res.stages[0].bossPage,
    'the camera is BEFORE stage 1\'s boss page, so $9A4D does not fire at once');
});

test('a game over abandons the run even with the WHOLE cure on', () => {
  // Both new mods at once, on the last life. Heal Gradius Syndrome must not
  // rescue a run that is over: `$97C1 BMI $97F1` is upstream of `$97DB` and
  // stays that way.
  const s = modded(['heal-gradius-syndrome', 'hard-won']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 0x0D;
  s.zp.shield = 4;
  s.lives[0] = 0;
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  assert.equal(respawn(s, res), false, '$97F1 ends IN the mode-5 body');
  assert.equal(s.substate, 0xC0, 'GAME OVER, not an in-place respawn');
  assert.equal(s.mods.rt.savedKit, null);
  assert.equal(s.mods.rt.invuln, 0);
  assert.equal(s.mods.rt.flyIn, 0, 'and no autopilot outlives the run');
});

// ---------------------------------------------------------------------------
//  W44 -- THE REST OF THE CLASS: run scope, audited
// ---------------------------------------------------------------------------
//
// W43 fixed `rt.death` at `$97F1` and named `rt.firstIntro` as carrying the same
// shape without fixing it. W44 audited all 19 mods and found the leak class has
// a second half that had never been looked for: state SPENT BY A RUN THE PLAYER
// IS NOT FLYING, and state the cartridge's own wipes ERASE so that a mod
// silently never applies at all. Both were measured, both are fixed, and
// tools/oracle/modscope.mjs drives every mod and every preset through a whole
// session to hold it. These are the unit-level witnesses.

test('the mod simulation does not run outside a real run ($00 == 5, $09 == 0)', () => {
  // `$09 != 0` is the attract demo and `$00 != 5` is the front end. Every
  // simulation hook returns early on both, so nothing the player chose can be
  // spent by a ship they are not flying. The render layer is NOT gated: it runs
  // after nmi() has returned and cannot reach the simulation.
  const s = modded(['heal-gradius-syndrome', 'rank-max', 'stay-calm'], { shield: 5 });
  s.zp09 = 1;                                     // $82D2 INC $09 -- the demo
  s.obj.status[0] = 1;
  introReset(s, res);
  assert.equal(s.zp.shield, 0, 'the demo ship gets no kit');
  assert.equal(s.mods.rt.firstIntro, true, '...and the run\'s first intro is unspent');
  assert.equal(s.mods.rt.invuln, 0, '...and no window was armed');
  s.zp17 = 3;
  modFrameEnd(s);
  assert.equal(s.zp17, 3, 'no rank lock during the demo');
  assert.equal(modFreezeEnemies(s), false, '$ADAB still runs during the demo');
  die(s);
  assert.equal(s.obj.status[0], 2, 'and the demo ship can still die');

  // The other half of the gate: mode 5 is play, and the title screen is not.
  const t = modded(['rank-max']);
  t.mode = 0;                                     // $80E2, the title scroll-in
  t.zp17 = 3;
  modFrameEnd(t);
  assert.equal(t.zp17, 3, 'no rank lock on the title screen either');
});

test('a new game re-seeds the level, the loop and the starting kit ($82D5, W44)', () => {
  // `$8307`'s wipe covers `$0012-$00EF`, which is `$26,X` AND `$28,X` -- so the
  // two bytes attachMods() seeds do not survive the cartridge's own new-game
  // setup. MEASURED: `#mods=loop-three` on the default launch had `$28,X` = 0
  // by frame 128 and `$1A` = 0 on the first play frame. The mod never applied.
  const s = modded(['loop-three'], { stage: 3, shield: 5 });
  assert.equal(s.save26[0], 3);
  assert.equal(s.save28[0], 2);
  newGame(s);                                     // $82D5 -> $8307's wipe
  assert.equal(s.save26[0], 3, '$26,X came back');
  assert.equal(s.save28[0], 2, '$28,X came back');
  assert.equal(s.mods.rt.firstIntro, true, 'a new game owes the starting kit again');
  s.mode = 4;                                     // $9710/$8163 -- the handover
  st8165(s);                                      // $8165 INC $00 -> mode 5
  introReset(s, res);
  assert.equal(s.zp19, 3, '$19 after $9B6E');
  assert.equal(s.zp1A, 2, '$1A after $9B72');
  assert.equal(s.zp.shield, 5, 'and the kit landed');
});

test('...so a CONTINUE gives back what the player chose, not a bare stage 1', () => {
  const s = modded(['loop-three'], { stage: 3, shield: 5, options: 2 });
  introReset(s, res);
  assert.equal(s.zp.shield, 5);
  // Lose the run: $979D with no lives left -> $97F1.
  s.obj.status[0] = 1;
  s.lives[0] = 0;
  respawn(s, res);
  assert.equal(s.substate, 0xC0, 'GAME OVER');
  assert.equal(s.mods.rt.savedKit, null);
  assert.equal(s.mods.rt.invuln, 0, 'W44: the window is a run-scoped byte too');
  // $970D CONTINUE.
  newGame(s);
  s.mode = 4;
  st8165(s);
  introReset(s, res);
  assert.equal(s.zp19, 3, 'the continue starts on the stage the player picked');
  assert.equal(s.zp1A, 2, '...on the loop they picked');
  assert.equal(s.zp.shield, 5, '...with the kit they picked');
  assert.equal(s.zp.options, 2);
  assert.equal(s.cam.hi, 0, '...at page 0, which is W43\'s assertion still holding');
});

test('mods.js\'s PLAY_MODE is state.js\'s MODE_STAGE, and mods.js still imports nothing', () => {
  // src/mods.js duplicates the 5 rather than importing it, because start.html
  // imports this module and says "It carries NO game code". The duplication is
  // pinned here so it cannot drift, and the no-imports claim is checked against
  // the file's own text rather than trusted.
  assert.equal(PLAY_MODE, MODE_STAGE);
  const src = readFileSync(new URL('../src/mods.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(src), false,
    'src/mods.js has grown an import; start.html loads it as a standalone catalogue');
});

test('every mutable byte the mod layer owns is one of the seven in rt', () => {
  // THE INVENTORY IS THE CHECK. W43's defect was a field whose lifetime nobody
  // had written down, so this pins the field set itself: an eighth one added
  // without a lifetime in the table (docs/worklog/gradius/45) fails here.
  const s = modded(['heal-gradius-syndrome', 'hard-won', 'afterimage', 'disco']);
  assert.deepEqual(Object.keys(s.mods.rt).sort(),
    ['discoPal', 'firstIntro', 'flyIn', 'flyInTo', 'ghost', 'invuln', 'savedKit']);
  assert.deepEqual(Object.keys(s.mods).sort(), ['lo', 'rt']);
});

test('every RUN-scoped byte is dropped at $97F1 and re-armed at $82D5', () => {
  // The table in the worklog, as an assertion over the object rather than over
  // a list somebody has to keep current. `ghost`/`discoPal` are SESSION-scoped
  // render scratch and are deliberately not in either set.
  const RUN = ['firstIntro', 'flyIn', 'flyInTo', 'invuln', 'savedKit'];
  const s = modded(['heal-gradius-syndrome', 'hard-won'], { stage: 2 });
  // Dirty every one of them, then end the run.
  s.mods.rt.invuln = 99; s.mods.rt.flyIn = 99; s.mods.rt.flyInTo = 99;
  s.mods.rt.savedKit = { 0x46: 5 }; s.mods.rt.firstIntro = false;
  modAbandonRun(s);
  for (const k of RUN) {
    if (k === 'firstIntro') continue;              // re-armed at $82D5, not here
    assert.ok(!s.mods.rt[k], `$97F1 left rt.${k} = ${JSON.stringify(s.mods.rt[k])}`);
  }
  s.save26[0] = 0; s.save28[0] = 0;                // $8307's wipe
  newGame(s);                                      // $82D5
  assert.equal(s.mods.rt.firstIntro, true, 'a new game owes the starting kit again');
  assert.equal(s.save26[0], 2, '...and the level select is back');
  for (const k of RUN) {
    if (k === 'firstIntro') continue;
    assert.ok(!s.mods.rt[k], `$82D5 left rt.${k} = ${JSON.stringify(s.mods.rt[k])}`);
  }
});

// ===========================================================================
//  5. THE COMPOSITION THE OWNER ASKED ABOUT
// ===========================================================================

/**
 * ONE DEATH, ONE LOADOUT, ONE ANSWER. Drives the real routines and reports the
 * camera page and the six bytes a respawn came back with.
 */
function dieAndRespawn(ids, opts = {}, before = {}) {
  const s = modded(ids, opts);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 5; s.cam.lo = 0x40;
  s.zp.speed = 3; s.zp.missile = 1; s.zp.weapon = 1;
  s.zp.options = 2; s.zp.shield = 4; s.zp.meter = 5;
  Object.assign(s.zp, before);
  s.substate = 0x80;
  // Burn any window off first, or the death is refused and there is nothing to
  // compose. That is itself the interaction: while blinking you cannot die.
  for (let i = 0; i < 200; i++) modFrameEnd(s);
  die(s);
  const died = s.obj.status[0] === 2;
  const rc = respawn(s, res);
  return {
    s, died, ranIntro: rc,
    cam: s.cam.hi, x: s.obj.x[0], lives: s.lives[0],
    kit: [s.zp.speed, s.zp.missile, s.zp.meter, s.zp.weapon, s.zp.options, s.zp.shield],
  };
}

test('THE MATRIX: every combination of the four respawn mods has one answer', () => {
  // `respawnKit()` is a LADDER, not a merge -- full-power > hard-won >
  // muscle-memory > the picker's one grant. The picker is on every row so that
  // "what muscle-memory restores" and "what hard-won restores" are different
  // numbers and a row cannot pass by coincidence.
  // Every one of the six is non-zero in the picker on purpose: a zero means
  // "leave it to the cartridge" (resolveLoadout drops it), and a byte nobody
  // writes would come back from `$9B3E`/`$9B66` and make a row pass by luck.
  const P = { speed: 2, missile: 1, meter: 3, weapon: 2, options: 1, shield: 5 };
  const START = [2, 1, 3, 2, 1, 5];              // what the picker grants
  const DIED = [3, 1, 5, 1, 2, 4];               // what dieAndRespawn was holding
  const FULL = [1, 1, 6, 2, 2, 5];               // full-power's own six
  const BARE = [0, 0, 1, 0, 0, 0];               // stock: $9B3E, $42 from $22,X
  const ROLLED = 4, KEPT = 5;                    // min(5 AND $0E, 8) vs no rollback

  const rows = [
    // ids                                              kit      camera
    [[],                                                BARE,    ROLLED],
    [['heal-gradius-syndrome'],                         BARE,    KEPT],
    [['hard-won'],                                      DIED,    ROLLED],
    [['muscle-memory'],                                 START,   ROLLED],
    [['full-power'],                                    FULL,    ROLLED],
    [['heal-gradius-syndrome', 'hard-won'],             DIED,    KEPT],
    [['heal-gradius-syndrome', 'full-power'],           FULL,    KEPT],
    [['heal-gradius-syndrome', 'muscle-memory'],        START,   KEPT],
    [['hard-won', 'full-power'],                        FULL,    ROLLED],
    [['hard-won', 'muscle-memory'],                     DIED,    ROLLED],
    [['full-power', 'muscle-memory'],                   FULL,    ROLLED],
    [['heal-gradius-syndrome', 'hard-won', 'full-power'], FULL,  KEPT],
    [['heal-gradius-syndrome', 'hard-won', 'muscle-memory'], DIED, KEPT],
  ];
  for (const [ids, kit, cam] of rows) {
    const label = ids.length ? ids.join('+') : 'stock';
    const r = dieAndRespawn(ids, ids.length ? P : {});
    assert.ok(r.died, `${label}: the death itself must not be refused`);
    assert.equal(r.lives, 2, `${label}: a life, at full price`);
    // The BARE row's $42 comes from $22,X, which is 1 because $42 was 5.
    assert.deepEqual(r.kit, kit, `${label}: the kit`);
    assert.equal(r.cam, cam, `${label}: $3F`);
    assert.equal(r.x === FLY_IN_X, ids.includes('heal-gradius-syndrome'),
      `${label}: only Heal Gradius Syndrome flies in from the left wall`);
    assert.equal(r.ranIntro, !ids.includes('heal-gradius-syndrome'),
      `${label}: only Heal Gradius Syndrome skips $9B3E`);
  }
});

test('...and immortal beats both of them, by never reaching $C1D6 at all', () => {
  const r = dieAndRespawn(['immortal', 'heal-gradius-syndrome', 'hard-won'], { shield: 5 });
  assert.equal(r.died, false, '$C1D6 is refused, so there is no respawn to have');
  assert.equal(r.s.mods.lo.conflicts.size, 0, 'the three touch disjoint sim keys');
});

test('the two new mods report no conflict, because they are two mechanisms', () => {
  const lo = resolveLoadout(['heal-gradius-syndrome', 'hard-won']);
  assert.equal(lo.sim.respawnInPlace, true);
  assert.equal(lo.sim.keepLoadout, true);
  assert.equal(lo.conflicts.size, 0,
    'the rollback lives in $979D/$9B68 and the wipe in $9B3E: no shared byte');
  assert.deepEqual(PRESETS['the-full-cure'].mods,
    ['heal-gradius-syndrome', 'hard-won']);
});

// ===========================================================================
//  6. LEVEL SELECT and LOOP SELECT
// ===========================================================================

test('level select goes through $26,X, which $9B6E reads into $19', () => {
  for (const stage of [0, 1, 3, 6]) {
    const s = modded([], { stage });
    assert.equal(s.save26[0], stage || 0, '$26,X seeded before the first NMI');
    introReset(s, res);
    assert.equal(s.zp19, stage, '$19 after $9B6E');
  }
});

test('level select does NOT drag you back after a respawn or a stage change', () => {
  // The trap this design avoids: re-applying $26,X at every $9B3E would undo
  // both $96CF's INC $19 and the respawn's own restore.
  const s = modded([], { stage: 2 });
  introReset(s, res);
  assert.equal(s.zp19, 2);
  s.zp19 = 3;                          // $96CF INC $19 -- the next stage
  s.obj.status[0] = 1;
  respawn(s, res);
  assert.equal(s.zp19, 3, 'the respawn kept the stage the player is actually on');
});

test('loop select goes through $28,X, which $9B72 reads into $1A', () => {
  const s = modded(['loop-three']);
  assert.equal(s.save28[0], 2);
  introReset(s, res);
  assert.equal(s.zp1A, 2, 'loop 3 -- W38: 2, 3 and 6 sweep frame-identically');
  // ...and it survives a death, because $97BF saves it back.
  s.obj.status[0] = 1;
  respawn(s, res);
  assert.equal(s.zp1A, 2);
});

// ===========================================================================
//  7. RANK, OVERTIME, FREEZE, IMMORTAL
// ===========================================================================

test('rank lock pins $17 after $9C45 has recomputed it', () => {
  for (const [id, want] of [['rank-zero', 0], ['rank-max', 6]]) {
    const s = modded([id]);
    s.zp17 = 3;
    modFrameEnd(s);
    assert.equal(s.zp17, want);
  }
});

test('rank lock actually survives a whole frame', () => {
  // $9AC4's `JSR $9C45` runs inside nmi(); the lock has to be after it.
  const s = modded(['rank-max'], { });
  s.mode = MODE_STAGE;
  for (let i = 0; i < 3; i++) nmi(s, 0, res);
  assert.equal(s.zp17, 6);
});

test('Overtime Pay zeroes one enemy fire countdown per frame, rotating', () => {
  const s = modded(['overtime']);
  const hit = new Set();
  for (let f = 0; f < 10; f++) {
    for (let j = 0; j < 10; j++) {
      s.obj.type[j + ENEMY_BASE] = 0x83;    // >= 3: a real enemy, $BBF4's gate
      s.obj.style[j + ENEMY_BASE] = 0x40;   // $040C,X, a fat countdown
    }
    s.frame = f;
    modFrameEnd(s);
    for (let j = 0; j < 10; j++) if (s.obj.style[j + ENEMY_BASE] === 0) hit.add(j);
  }
  assert.equal(hit.size, 10, 'every one of $BBEE\'s ten slots got a turn');
});

test('Overtime Pay leaves free slots, capsules and explosions alone', () => {
  // `$BBF4 AND #$7F / CMP #$03 / BCC $BC15` -- types 0, 1 and 2 never count down.
  const s = modded(['overtime']);
  for (let j = 0; j < 10; j++) {
    s.obj.type[j + ENEMY_BASE] = j % 3;     // 0 free, 1 capsule, 2 explosion
    s.obj.style[j + ENEMY_BASE] = 0x40;
  }
  for (let f = 0; f < 10; f++) { s.frame = f; modFrameEnd(s); }
  for (let j = 0; j < 10; j++) assert.equal(s.obj.style[j + ENEMY_BASE], 0x40);
});

test('Everyone Stay Calm reports the $ADAB skip, and only with the mod on', () => {
  assert.equal(modFreezeEnemies(modded(['stay-calm'])), true);
  assert.equal(modFreezeEnemies(modded(['full-power'])), false);
});

test('Everyone Stay Calm actually stops enemies moving in a live frame', () => {
  const s = modded(['stay-calm']);
  s.mode = MODE_STAGE;
  const j = ENEMY_BASE;
  s.obj.type[j] = 0x83; s.obj.status[j] = 1; s.obj.anim[j] = 0x10;
  s.obj.x[j] = 200; s.obj.y[j] = 100;
  s.obj.xvel[j] = 0xFE;                       // $0420,X -- moving left
  for (let i = 0; i < 20; i++) nmi(s, 0, res);
  assert.equal(s.obj.x[j], 200, 'the enemy has not moved a pixel');
});

test('Cannot Be Killed refuses $C1D6 forever', () => {
  const s = modded(['immortal']);
  s.obj.status[0] = 1;
  for (let i = 0; i < 1000; i++) modFrameEnd(s);
  die(s);
  assert.equal(s.obj.status[0], 1);
  assert.equal(s.lives[0], 3);
});

// ===========================================================================
//  8. THE HOST LAYER: input, pacing
// ===========================================================================

test('Mirror and Down Under swap exactly two bits of $0007', () => {
  const lr = modded(['mirror']);
  assert.equal(modInput(lr, BTN.RIGHT), BTN.LEFT);
  assert.equal(modInput(lr, BTN.LEFT), BTN.RIGHT);
  assert.equal(modInput(lr, BTN.UP | BTN.A), BTN.UP | BTN.A, 'nothing else moves');
  assert.equal(modInput(lr, BTN.LEFT | BTN.RIGHT), 0, 'both held is both swapped');

  const ud = modded(['upside-down']);
  assert.equal(modInput(ud, BTN.UP), BTN.DOWN);
  assert.equal(modInput(ud, BTN.DOWN), BTN.UP);
  assert.equal(modInput(ud, BTN.RIGHT | BTN.B), BTN.RIGHT | BTN.B);
});

test('a swapped word reaches the frame through stepLogicFrames', () => {
  // The wiring, not the function: src/main.js is what calls modInput, and a
  // hook nobody calls is the failure this repo keeps finding.
  const s = modded(['mirror']);
  s.mode = MODE_STAGE;
  s.obj.status[0] = 1;
  const x0 = s.obj.x[0];
  resetInput();
  setTouchButton(BTN.LEFT, true);          // the queue's producer, src/input.js
  stepLogicFrames(8, s, res);
  setTouchButton(BTN.LEFT, false);
  assert.ok(s.obj.x[0] > x0, 'holding LEFT flew the ship RIGHT');
});

test('Turbo and Bullet Time are host pacing and touch no state', () => {
  assert.equal(resolveLoadout(['turbo']).meta.ticksPerFrame, 2);
  assert.equal(resolveLoadout(['bullet-time']).meta.frameSkip, 3);
  assert.equal(resolveLoadout([]).meta.ticksPerFrame, 1);
  assert.equal(resolveLoadout([]).meta.frameSkip, 1);
});

// ===========================================================================
//  9. THE RENDER LAYER.  Nothing below here may touch the simulation.
// ===========================================================================

test('Always on enemies is the renderer\'s own sprlimit break, and nothing else', () => {
  const on = modded(['always-on-enemies']);
  const brk = modRenderBreaks(on);
  assert.ok(brk instanceof Set);
  assert.deepEqual([...brk], ['sprlimit']);
  // OFF is `undefined`, not an empty Set: src/main.js passes it straight to
  // renderFrame, whose default parameter is what rendergate runs against.
  assert.equal(modRenderBreaks(modded(['full-power'])), undefined);
});

test('Always on enemies really does draw the 9th sprite on a scanline', () => {
  // Executed against the real renderer rather than asserted about the flag.
  // Ten 8x8 sprites on the same row: with the cap the PPU keeps eight.
  const W = PPU_W, H = PPU_H;
  const tiles = new Uint8Array(2048 * 64).fill(1);     // every pixel colour 1
  const oam = new Uint8Array(256).fill(0xF4);
  for (let i = 0; i < 10; i++) {
    oam[i * 4 + 0] = 100 - 1;      // OAM Y is one less than the first scanline
    oam[i * 4 + 1] = 0;
    oam[i * 4 + 2] = 0;
    oam[i * 4 + 3] = 16 + i * 12;  // ten of them, spread across the row
  }
  const pal = new Uint8Array(32);
  pal[0x11] = 0x16;                                    // sprite palette 0, colour 1
  const band = { ctrl: 0x08, mask: 0x1E, scrollX: 0, scrollY: 0, chrBank: 0, ran: false };
  const f = { bandA: band, bandB: band, nt: new Uint8Array(2048), pal, oam };
  const count = (breaks) => {
    const px = new Uint32Array(W * H);
    renderFrame(f, tiles, px, breaks);
    let n = 0;
    for (let x = 0; x < W; x++) if (px[100 * W + x] !== px[0]) n++;
    return n;
  };
  const capped = count(new Set());
  const lifted = count(new Set(['sprlimit']));
  assert.equal(capped, 8 * 8, 'the PPU keeps eight sprites per scanline');
  assert.equal(lifted, 10 * 8, '...and Always on enemies keeps all ten');
});

test('Disco writes a scratch palette and never touches $3F00 RAM', () => {
  const s = modded(['disco']);
  s.vram.pal.fill(0x21);
  s.frame = 8;
  const p = modPalette(s);
  assert.ok(p && p !== s.vram.pal);
  assert.notDeepEqual([...p], [...s.vram.pal]);
  assert.ok([...s.vram.pal].every((v) => v === 0x21), 'palette RAM is untouched');
  // Brightness is preserved: only the low nibble (the hue) rotates.
  assert.ok([...p].every((v) => (v & 0x30) === 0x20));
});

test('the framebuffer transforms are pure functions of the framebuffer', () => {
  const w = 4, h = 2;
  const base = () => Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8]);

  let px = base();
  modPostRender(modded(['mirror']), px, w, h);
  assert.deepEqual([...px], [4, 3, 2, 1, 8, 7, 6, 5]);

  px = base();
  modPostRender(modded(['upside-down']), px, w, h);
  assert.deepEqual([...px], [5, 6, 7, 8, 1, 2, 3, 4]);

  px = Uint32Array.from([0xFF000000, 0xFFFFFFFF]);
  modPostRender(modded(['negative']), px, 2, 1);
  assert.deepEqual([...px], [0xFFFFFFFF, 0xFF000000]);

  px = Uint32Array.from([0xFFFFFFFF, 0xFF000000]);
  modPostRender(modded(['gameboy']), px, 2, 1);
  assert.equal(new Set(px).size, 2);
  assert.ok([...px].every((v) => (v >>> 24) === 0xFF), 'opaque');

  // Afterimage blends with the PREVIOUS frame, so the first frame is itself.
  const g = modded(['afterimage']);
  px = Uint32Array.from([0xFF000000, 0xFF000000]);
  modPostRender(g, px, 2, 1);
  px = Uint32Array.from([0xFFFFFFFF, 0xFFFFFFFF]);
  modPostRender(g, px, 2, 1);
  assert.equal(px[0], 0xFF7F7F7F, 'half way between black and white');
});

test('the hitbox overlay marks the pixel $C2BC hands the terrain probe', () => {
  const s = modded(['hitboxes']);
  s.obj.status[0] = 1;
  s.obj.x[0] = 10; s.obj.y[0] = 10;
  s.obj.type[ENEMY_BASE] = 0x83; s.obj.x[ENEMY_BASE] = 30; s.obj.y[ENEMY_BASE] = 10;
  const w = 64, h = 32;
  const px = new Uint32Array(w * h);
  modPostRender(s, px, w, h);
  assert.notEqual(px[10 * w + 10], 0, 'the ship');
  assert.notEqual(px[10 * w + 30], 0, 'the enemy');
  assert.equal(px[0], 0, 'and nothing anywhere else');
});

test('render mods cannot reach the simulation', () => {
  // Run a hundred frames with every render mod on and compare the whole object
  // page against a hundred frames with none. Any pixel effect that wrote a game
  // byte would show up here.
  const ids = ['always-on-enemies', 'gameboy', 'negative', 'disco', 'afterimage', 'hitboxes'];
  const a = introEntryState(res.manifest);
  attachMods(a, resolveLoadout(ids));
  const b = introEntryState(res.manifest);
  for (let i = 0; i < 100; i++) { nmi(a, 0, res); nmi(b, 0, res); }
  for (const k of ['type', 'x', 'y', 'status', 'anim', 'style']) {
    assert.deepEqual([...a.obj[k]], [...b.obj[k]], `$0300 array ${k} diverged`);
  }
  assert.deepEqual([...a.vram.pal], [...b.vram.pal]);
  assert.equal(a.zp17, b.zp17);
  assert.equal(a.cam.hi, b.cam.hi);
});

// ===========================================================================
//  10. Conflicts, which the launcher renders as a badge
// ===========================================================================

test('two mods writing the same key are reported as a conflict', () => {
  const lo = resolveLoadout(['rank-zero', 'rank-max']);
  assert.equal(lo.sim.rankLock, 6, 'last wins');
  assert.ok(lo.conflicts.has('rankLock'));
  assert.deepEqual(lo.conflicts.get('rankLock'), ['rank-zero', 'rank-max']);
});

test('START_KEYS names the six bytes game.json\'s options[] write', () => {
  assert.deepEqual(START_KEYS,
    { speed: 0x40, missile: 0x41, meter: 0x42, weapon: 0x44, options: 0x45, shield: 0x46 });
});
