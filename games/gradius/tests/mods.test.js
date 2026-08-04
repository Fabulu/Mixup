// THE MODS, and the rule that keeps them safe.
//
// Two kinds of test are in here and they are kept apart on purpose:
//
//   1. THE ONE RULE -- with no loadout attached, `state.mods` is undefined and
//      every hook in src/mods.js is unreachable. That is what makes the 47
//      oracle scenarios, the 682 unit tests and `rendergate` still mean what
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
import { die, collision } from '../src/collision.js';
import { nmi } from '../src/nmi.js';
import {
  MODS, PRESETS, CATEGORIES, START_KEYS,
  resolveLoadout, attachMods, describeMod, loadoutToHash, hashToLoadout,
  modAfterIntroReset, modRefuseDeath, modHidePlayer,
  modShowPlayer, modFreezeEnemies, modFrameEnd, modInput, modRenderBreaks,
  modPalette, modPostRender,
} from '../src/mods.js';
import { applyCapsule } from '../src/powerup.js';
import { resetInput, setTouchButton } from '../src/input.js';
import { renderFrame, W as PPU_W, H as PPU_H } from '../src/render/ppu.js';
import { headlessResources } from './helpers.js';

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

test('the hash round-trips a selection', () => {
  const ids = ['full-power', 'heal-gradius-syndrome'];
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

test('Heal Gradius Syndrome respawns where you died, not at the checkpoint', () => {
  const s = modded(['heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  // Fly out to camera high byte 7 and die at (200, 40).
  s.cam.hi = 7; s.cam.lo = 0x80;
  s.obj.x[0] = 200; s.obj.y[0] = 40;
  s.substate = 0x80;
  // $9B3E's tail armed the blink; burn it off, or the death is refused and
  // there is no respawn to look at. (That refusal is its own test, below.)
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  assert.equal(s.obj.status[0], 2, 'the death itself is not refused');
  respawn(s, res);
  assert.equal(s.obj.x[0], 200, 'the ship came back where it fell');
  assert.equal(s.obj.y[0], 40);
  assert.equal(s.ring.x[0], 200, 'and so did the Option ring $A08C walks');
  assert.equal(s.cam.hi, 7, '$3F is the death camera, not min($3F AND $0E, 8)');
  assert.equal(s.build.hi, 7, '...and $55 agrees, so the streamer lead is still 0');
  assert.equal(s.cam.lo, 0, '$3E/$54 stay 0 -- the same shape a checkpoint has');
});

test('...and a stock run does exactly what the cartridge does', () => {
  // The control. Same death, no mod: $97BB stores min($3F AND $0E, 8) and the
  // ship comes back at $9BD4's table position.
  const s = bootState(res.manifest);
  s.obj.status[0] = 1;
  s.cam.hi = 7; s.obj.x[0] = 200; s.obj.y[0] = 40;
  respawn(s, res);
  assert.equal(s.save24[0], 6, 'min(7 AND $0E, 8) = 6');
  assert.notEqual(s.obj.x[0], 200);
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

// ===========================================================================
//  5. THE COMPOSITION THE OWNER ASKED ABOUT
// ===========================================================================

test('Full Kit + Heal Gradius Syndrome compose: back where you fell, fully armed, blinking', () => {
  const s = modded(['full-power', 'heal-gradius-syndrome']);
  introReset(s, res);
  s.obj.status[0] = 1;
  s.cam.hi = 5;
  s.obj.x[0] = 176; s.obj.y[0] = 120;
  s.substate = 0x80;
  // Burn the window off first, or the death is refused and there is nothing to
  // compose. That is itself the interaction: while blinking you cannot die.
  for (let i = 0; i < 180; i++) modFrameEnd(s);
  die(s);
  respawn(s, res);
  assert.equal(s.obj.x[0], 176, 'position: Heal Gradius Syndrome');
  assert.equal(s.obj.y[0], 120);
  assert.equal(s.cam.hi, 5);
  assert.equal(s.zp.shield, 5, 'kit: Full Kit');
  assert.equal(s.zp.options, 2);
  assert.equal(s.zp.speed, 1);
  assert.equal(s.mods.rt.invuln, 180, 'and the new window is armed');
  assert.equal(s.lives[0], 2, 'it still cost a life');
  assert.equal(s.mods.lo.conflicts.size, 0, 'the two touch disjoint state');
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
