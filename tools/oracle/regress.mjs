// Run the whole input-script corpus through both the oracle and the port and
// report a fidelity table. This is the regression suite -- every playtest
// scenario worth keeping should become an entry in SCRIPTS.
//
// Usage: node tools/oracle/regress.mjs [--level 1] [--only <name>]

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 ? argv[i + 1] : d; };
const level = arg('level', '1');
const only = arg('only', null);

const ENEMY_FIELDS = ['en0f', 'en0s', 'en0x', 'en0hp', 'en1f', 'en2f'];
// Slots 6/7 -- on levels 1-2 the respawning sewer enemies (water.js's
// loc_00_2D3D refill), elsewhere the projectile slots.
const RESPAWN_FIELDS = ['en6f', 'en6s', 'en6d', 'en6ms', 'en6x', 'en6y',
                        'en6at', 'en6hp', 'en7f', 'en7s', 'en7ms', 'en7x',
                        'en7y', 'en7at', 'en7hp'];
const ROPE_FIELDS = ['action', 'ropeSeg', 'ropePh', 'ropeFlip', 'ropeDly',
                     'rope0x', 'rope0y', 'rope5x', 'rope5y', 'carryY'];
// Slot 0 in depth plus the boss-fight globals ($C73D/$C73F/$C741) -- what the
// boss scenarios compare.
const BOSS_FIELDS = ['hp', 'en0f', 'en0f1', 'en0s', 'en0d', 'en0ms', 'en0x',
                     'en0y', 'en0vx', 'en0vy', 'en0at', 'en0hp',
                     'bossRage', 'bossCrit', 'bossHop'];

// Every entry is a permanent test. Scripts are tuned against the level-1
// geometry (see the ASCII map in docs/03-VERIFICATION.md "Test suite"):
// the spawn platform is cols 0-3 with its top at row 8, the main floor is row
// 13 spanning cols 4-13, and a 3-cell wall at cols 13-14 rows 10-12 caps it.
const SCRIPTS = [
  // --- original corpus ---
  { name: 'fall-and-walk',   frames: 150, script: '20:,130:R' },
  { name: 'walk-jump-walk',  frames: 120, script: '20:,40:R,10:RA,50:R' },
  { name: 'walljump-reverse', frames: 200,
    script: '15:,25:R,8:RA,20:R,10:A,30:L,12:LA,40:R,40:' },
  { name: 'idle-then-left',  frames: 140, script: '30:,90:L,20:' },
  { name: 'jump-spam',       frames: 180,
    script: '10:,20:RA,10:R,20:RA,10:R,20:RA,90:R' },

  // --- collision against vertical surfaces ---
  // Run the full length of the floor into the col-14 wall, then keep holding
  // RIGHT into it for ~80 more frames. Covers the wall push at loc_00_1F61
  // (1 px shove + the xlo=$80 snap) and proves standing pressed against a wall
  // is a fixed point rather than a slow drift.
  { name: 'wall-run-into-right', frames: 260, script: '20:,240:R' },
  // Same contact from the other side: walk LEFT into the level's left boundary
  // (loc_00_1F87 is the mirrored push) and hold.
  { name: 'wall-into-left-boundary', frames: 160, script: '20:,140:L' },

  // --- leaving the ground ---
  // Walk off the right edge of the spawn platform, release everything mid-air,
  // fall and land: ground -> air transition with no jump involved.
  { name: 'ledge-walk-off', frames: 140, script: '40:,40:R,60:' },

  // --- variable jump height: same jump, A held for 2 vs 45 frames ---
  // gravityRisingHeld ($01) vs gravityRisingReleased ($02) diverge from the
  // frame A comes up, so the two apexes differ by 16 px.
  { name: 'jump-tap-min-height', frames: 140, script: '40:,2:A,98:' },
  { name: 'jump-hold-max-height', frames: 140, script: '40:,45:A,55:' },
  // Short hop with nothing else happening: the landing frame itself is the
  // assertion (air, vy, anim and the landing squat must all flip together).
  { name: 'jump-land-exact-frame', frames: 110, script: '40:,3:A,67:' },

  // --- wall jumps ---
  // Jump into the shaft's right-hand wall, cling ($FFB2 = $50), sit through
  // the 16-frame total freeze, and launch. Stops before the divergence the
  // chain scenario below documents, so the cling itself stays protected.
  { name: 'walljump-launch-off-right-wall', frames: 115,
    script: '40:,50:R,10:RA,15:L' },
  // Cling + launch off a wall on the right, then off a wall on the left,
  // without touching the ground in between: two 16-frame freezes ($FFB2),
  // both launch directions, and the direction bits surviving the countdown.
  // This one was the project's first xfail. Closing it needed three separate
  // fixes: the horizontal probe must pass THROUGH slope graphics rather than
  // treat them as walls, it must apply the X-snap tables at 0:$23B8-$2417
  // (indexed by the VERTICAL position within the metatile), and -- the actual
  // culprit -- the floor probe must run while RISING ($1AD4) yet have its
  // result IGNORED while rising ($1B38), so a slope rewrites Y mid-ascent
  // without landing the player.
  { name: 'walljump-chain-both-walls', frames: 260,
    script: '40:,50:R,10:RA,50:L,10:LA,50:R,10:RA,40:R' },

  // --- gravity ---
  // Max-height jump from the spawn platform, drifting right off its edge, so
  // the fall runs ~116 px and sits pinned at terminalVelocity ($BE = -66) for
  // 17 consecutive frames.
  { name: 'long-fall-terminal', frames: 200, script: '40:,30:R,45:RA,85:R' },

  // --- horizontal acceleration ---
  // Full speed right, reverse to full speed left, reverse again. Exercises
  // $1881: pressing against your own momentum brakes 1 subpx/frame and does
  // not accelerate, so each reversal is a 48-frame bleed through zero.
  { name: 'reverse-at-full-speed', frames: 220, script: '40:,80:R,60:L,40:R' },

  // --- attacks (both harnesses take --ammo, so the throw path is reachable
  //     without walking to a pickup; `extra` adds fields to the comparison) ---
  // No ammo: every B press is a punch. Checks the attack timer's own cadence
  // and that a second press during the first swing does not restart it ($1A1B).
  { name: 'punch-standing-no-ammo', frames: 160, ammo: 0,
    script: '40:,4:B,26:,4:B,6:,4:B,76:',
    extra: ['action', 'atkTimer', 'atkPose', 'ammo'] },
  // Three throws in quick succession fill all three batarang slots, then a
  // fourth press with the pool full spends ammo AND punches -- the deliberate
  // $1990-$19AD ordering quirk. Tracks the flight of slot 0 too.
  { name: 'batarang-fill-all-slots', frames: 200, ammo: 5, skipFrames: 1,
    script: '40:,4:B,10:,4:B,10:,4:B,10:,4:B,118:',
    extra: ['atkTimer', 'atkPose', 'ammo', 'bat0', 'bat0x', 'bat0y', 'bat0spd',
            'bat0arc', 'bat1', 'bat2'] },
  // Throw one batarang and stand still for the whole out-and-back. The catch is
  // the assertion: the return leg is where the homing lives, and X alone looked
  // fine while the vertical axis was wrong.
  { name: 'batarang-full-return', frames: 220, ammo: 5, skipFrames: 1,
    script: '40:,4:B,176:',
    extra: ['bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc'] },
  // The way it is actually played: throw on the run and keep running. The
  // return leg homes on a player who has moved, which is where the vertical
  // hysteresis in slot+0 earns its keep.
  { name: 'batarang-throw-on-the-run', frames: 240, ammo: 5, skipFrames: 1,
    script: '20:,30:R,4:RB,186:R',
    extra: ['bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc'] },
  // Thrown while airborne and holding Up (the arc flag at $1A08), landing
  // mid-flight so the return target moves vertically as well as horizontally.
  { name: 'batarang-arc-throw-in-air', frames: 240, ammo: 5, skipFrames: 1,
    script: '20:,20:R,10:RA,4:RUB,186:R',
    extra: ['bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc'] },

  // --- bat-rope -------------------------------------------------------------
  // Walk right along the main floor, then fire the rope with UP. Covers the
  // extension steps ($FFB4 counting 5 down to 0), whichever of "bites" or "runs
  // out and retracts" the level-1 ceiling actually produces, and -- if it bites
  // -- the pendulum, the facing flip at the extreme, and the carry that moves
  // Batman. Ropes NOT firing at all would also show here as a flat ropeSeg.
  { name: 'rope-fire-and-swing', level: 1, frames: 320,
    script: '20:,60:R,1:U,239:',
    extra: ROPE_FIELDS },
  // Fire the rope and press A partway through the swing: the tangent launch at
  // $3FD6, including the rule that there is no upward kick before the bottom of
  // the arc.
  { name: 'rope-release-launch', level: 1, frames: 320,
    script: '20:,60:R,1:U,60:,1:A,178:',
    extra: ROPE_FIELDS },

  // --- map objects + the water body -----------------------------------------
  // Level 1's four type-7 water spouts, at columns 99-112 over the pit. Warped
  // in because nothing can walk there yet. The spouts are TERRAIN: they stamp a
  // column of $FD one cell at a time, erase it, pause, repeat -- so what is
  // being checked here is the phase machine and the row cursor.
  //
  // The 400-frame window also covers the level-1/2 WATER BODY (src/water.js):
  // the waterfall trigger + 7-cell stamp, the surface rising through the
  // player's row, and -- at f264/f265 -- the $2E8D water hit (1 dmg, $5A) and
  // its $1776 knockback launch, which an earlier note misattributed to the
  // walker at column 95. That walker melees at f174 (bit-exact) and then runs
  // ONE frame behind the ROM from f226 on: f226 is a real lag frame ($C757 --
  // the VBlank fired before the main loop finished, so the cartridge's enemy
  // driver skipped one update). Instruction-level timing is out of scope for
  // the port, so the en3 slot is traced by the harnesses but deliberately NOT
  // compared here; nothing the walker does after f226 touches a compared
  // field within 400 frames.
  { name: 'l1-water-spouts', level: 1, frames: 400, warp: '95,27',
    script: '400:',
    extra: ['ob0t', 'ob0y', 'ob0st', 'ob0w', 'ob1t', 'ob1st', 'ob1w',
            ...ENEMY_FIELDS,
            'hp', 'slow', 'watLv', 'watPh', 'watSt', 'watWy'] },
  // The water body alone: column 74 is the one deep shaft outside EVERY
  // enemy activation window (the col-67 walker misses by exactly one column)
  // and far from the spouts. Six full hit cycles -- surface reaches the
  // player, $2E8D hit, $1776 knockback, 90-frame invulnerability, repeat
  // (hp 10 -> 4) -- plus walking both ways in slow mode ($FF95 speed caps)
  // and the 1-in-8 $FFB1-phased water fall gravity, which is what pinned the
  // port's frame counter to the cartridge's $6D boot phase.
  { name: 'l1-water-rising-hits', level: 1, frames: 620, warp: '74,28',
    script: '300:,40:R,40:L,240:',
    extra: ['hp', 'slow', 'watLv', 'watPh', 'watSt', 'watWy',
            ...ENEMY_FIELDS] },

  // --- enemy AI (a scenario may carry its own `level:`) ---------------------
  // The enemy fields ride along on every one of these: slot-0 flags/state/
  // world-X/HP plus the slot-1/2 flag bytes.

  // Level 1: holding RIGHT stops at the col-13/14 wall, which keeps the camera
  // short of every walker's activation window -- NO level-1 enemy activates
  // here (an earlier comment claimed otherwise; verified false). What this
  // protects is 620 frames of dormant records staying dormant while the
  // player grinds a wall. Real level-1 walker coverage -- activation, the
  // distance bands, a gap leap, the f174 melee -- lives in l1-water-spouts.
  { name: 'l1-walker-approach', level: 1, frames: 620, script: '20:,600:R',
    extra: ENEMY_FIELDS },
  // Levels 1-2 sewer-enemy RESPAWNER (loc_00_2D3D + the loc_00_0EC3 init arm):
  // slots 6/7 are NOT in the 5:$46EC blob -- level init stamps $40 into their
  // flag bytes and the head of the water branch refills them from the ROM
  // templates at 0:$32F8/0:$32D8, one slot per frame, slot 6 first. These are
  // the enemies that emerge from the wall holes at columns $2B/$27 in the
  // sewer: state $0C, flags $0A, so activation runs the $1F-frame emerge
  // animation (jt_01_637F), then a fall, the landing, and the wake-up into a
  // state-1 walker. The record does NOT move during the emerge -- x/y are
  // pinned until the fall starts at f34; it is a pose change, not a crawl.
  // Warp 43,27 puts the camera window on both holes at once: f1/f2 are the two
  // refills, f2 activates both, the emerge pose runs to ~f33, slot 6 lands at
  // ~f56, wakes at f69, walks from f70.
  //
  // Capped at 72 because frame 73 is a LAG FRAME -- $C757 measured set there,
  // firing the 1:$4E3F skip. Extending to 100 frames and diffing all 27 fields
  // shows exactly two divergences, en6x and en7x at f73, the one-step stall
  // signature: the cartridge holds f72's value and the port advances. So the
  // cap bounds a real lag divergence at its first frame rather than masking an
  // earlier porting bug.
  //
  // TWO lag frames actually fire in this run, at f2 and f73. f2 is warp-induced
  // (the camera jump), which is why an unwarped level-1 run has none and
  // l1-water-spouts lags at f2 as well. It is harmless HERE only because both
  // slots are being activated then, and tryActivate ($4E27) sits ahead of the
  // lag test ($4E39), so the driver would have skipped them anyway. Note the
  // port never sets state.lagFrame at all -- see the comment on it in state.js.
  //
  // The death->refill loop is the same bit-6 test + copy as the init refill
  // covered here; melee/batarang damage is now verified (the l3-punch-* and
  // l3-batarang-kill scenarios below), so a kill-and-respawn script is
  // unblocked if anyone wants the refill arm pinned too.
  { name: 'l1-sewer-respawner-emerge', level: 1, frames: 72, warp: '43,27',
    script: '72:', extra: [...ENEMY_FIELDS, ...RESPAWN_FIELDS] },

  // Level 5, state 2 (walker+jump, 1:$5399): idle -> chase across two ledges
  // (falls, landings, the ledge scan at $5288), melee lunge at f216 (the
  // attack probe hits the player: knockback + iframes), post-attack committed
  // walk, and the turn-anim-expiry wall jumps at f257/f388.
  { name: 'l5-walkerjump-approach', level: 5, frames: 620, script: '20:,600:R',
    extra: ENEMY_FIELDS },
  // Level 9, state 3 (flyer, 1:$55AA): slow-sink gravity, committed flight,
  // wall hops via the turn-anim jump, and the dive attack.
  { name: 'l9-flyer-dive', level: 9, frames: 620, script: '20:,600:R',
    extra: ENEMY_FIELDS },
  // Level 5 gauntlet: four jumps deep into the level, under the descending
  // type-9 spike traps. Covers the trap's extend/retract map stamping, the
  // ceiling probe pushing a falling player down a row ($1AA7 via the level-5
  // spike-ceiling rule at $1EE9), grounded spike damage, two enemy melees and
  // enemy knockback. Capped at 578: the player dies there, and the port's
  // post-death respawn deliberately deviates from the ROM's round-select.
  { name: 'l5-spike-trap-gauntlet', level: 5, frames: 578,
    script: '20:,140:R,20:RA,120:R,20:RA,120:R,20:RA,120:R,20:RA,320:R',
    extra: ENEMY_FIELDS },
  // Level 3 exists to pin the map-object overlap scan (loc_00_2426). The
  // level's start column has no floor in the map at all: what the player lands
  // on is $C1E8 slot 0, a type $08, and the scan is the only thing that finds
  // it. Before the scan was ported he fell straight to the death row, which is
  // what the "level 2 -> 3 arrival kills you" bug actually was.
  //
  // Capped at 317 because frame 318 is a LAG FRAME -- $C757 is set there, the
  // only one in the run, measured. The enemy driver skips that iteration, so
  // the cartridge's enemy 0 stalls one step and every later enemy X sits 21
  // world units behind the port's. That is instruction-level timing and out of
  // scope by definition (see docs/03-VERIFICATION.md §28), not a porting bug.
  //
  // Downstream, it is also the whole explanation for the "port takes a
  // knockback at 358 that the cartridge does not": 21 units is enough to put
  // the enemy in contact range one frame early. Nothing to fix.
  //
  // 317 is deliberately chosen so ENEMY_FIELDS can be compared too -- the
  // alternative was a longer run that only passes because enemy fields are
  // excluded, which would hide the divergence rather than bound it.
  // The $FE "no exit this way" arm, which is the TOP exit on 12 of the 14
  // levels (table 0:$286D) -- ordinary "walk off the top and fall back in from
  // the top", not an edge case. $285B parks Y at $1100 and then $286A is
  // `JP loc_00_1776`: the update RE-ENTERS at knockback and the whole rest of
  // the frame still runs. Returning out of the player update there instead
  // froze X and lost the fall: this scenario went 39/40 frames wrong on Y and
  // 22/40 on VelY before it was fixed. skipFrames 1 is the documented warp
  // skew -- --warp lands after the oracle's first sample.
  { name: 'l1-top-exit-teleport', level: 1, frames: 60, warp: '5,16',
    skipFrames: 1, script: '60:R' },

  // Level 11 is BOTH a parallax level and Boss 3 ($C73E = $03, measured), and
  // the camera dispatch at $124D checks 9/10/11 BEFORE $C73E. Testing the boss
  // flag at level 6's priority pinned camY to $17 instead of $10, putting the
  // player 7 rows above the view -- "a broken level where I start off screen
  // at the top". Only camY was ever wrong; x, y and camX all matched, which is
  // why no existing scenario caught it.
  { name: 'l11-boss-parallax-camera', level: 11, frames: 90, script: '90:' },

  { name: 'l3-object-floor', level: 3, frames: 317,
    script: '20:,120:R,20:RA,120:R,20:RA,180:R', extra: ENEMY_FIELDS },
  // Level 3 slot 7 is the type-8 platform that actually MOVES -- slot 0, the
  // arrival ledge, ships with +$0B = $FE and is retired before it ever runs.
  // Warping onto slot 7 rides it down, across and back up (player Y 5888 ->
  // 7168 -> 5728, X 12928 -> 13696), which exercises the script cursor, the
  // travel limit and the $C72F/$C730 carry inbox that keeps the player glued
  // to it.
  //
  // Also capped at 317: frame 318 is the same lag frame as above, and it is
  // phase-locked rather than input-dependent -- $C757 is set there with
  // $FFB1 = 144 under both this script and the walking one. Past it the
  // platform sits exactly one $10 step ahead of the cartridge's.
  { name: 'l3-platform-ride', level: 3, frames: 317, warp: '50,21',
    script: '317:', extra: ['carryY', 'ob0t', 'ob1t'] },

  // --- melee and batarang damage TO enemies (loc_00_2643 / loc_00_3C17) ----
  // The slot-3 walker at level-3 col ~48 is the target in all three. These
  // pinned the SCREEN-SPACE hit tests: probe/batarang cached +7/+8 bytes
  // against the enemy's cached +7/+8, enemy-owned half-extents, and -- for
  // the $53 boot levels -- the per-level $FFB1 phase that gates the hit-blink.

  // The user-reported bug, verbatim: walk at the walker and punch three
  // times. Every punch MISSES on the cartridge -- by swing frame 8 the enemy
  // has already walked ~8 px behind the fist, and the melee window
  // (halfW-left - 1, strict, forward-shifted) does not reach backward. The
  // old derived box hit here, took hp 4 -> 2 and knocked the enemy back.
  { name: 'l3-punch-miss-behind', level: 3, frames: 170, warp: '46,23', ammo: 0,
    script: '20:,40:R,6:B,20:,6:B,20:,6:B,40:',
    extra: ['hp', 'atkTimer', 'atkPose', 'ammo', 'en3hp', 'en3f', 'en3f1',
            'en3s', 'en3x', 'en3y', 'en3vx', 'en3vy', 'en3at', 'en3d',
            'en3ms'] },
  // A punch that CONNECTS (swing timed so the walker is still 2 px in front
  // at frame 8): sound path aside, this pins the 2-damage arm, the $3C stun,
  // the knockback ($4F4B rising + landing), the player recoil vx = -4
  // ($20A7), and the hit-blink's $FFB1 & 8 cadence through the landing
  // animation -- which is what exposed the flat $6D frame-counter seed.
  { name: 'l3-punch-connect', level: 3, frames: 172, warp: '46,23', ammo: 0,
    script: '20:,32:R,6:RB,2:R,20:,6:B,20:,6:B,60:',
    extra: ['hp', 'atkTimer', 'atkPose', 'ammo', 'action', 'en3hp', 'en3f',
            'en3f1', 'en3s', 'en3x', 'en3y', 'en3vx', 'en3vy', 'en3at',
            'en3d', 'en3ms'] },
  // Same walk with ammo: three thrown batarangs. Covers the $1216 inclusive
  // box on cached screen bytes, 1 damage with the BIT-2 re-hit lockout, a
  // hit landing on the RETURN leg, the enemy dying of it (hp 4 -> 0, the
  // $40 disable latch), and the catch-before-hit-test ordering at $3BE9.
  { name: 'l3-batarang-kill', level: 3, frames: 170, warp: '46,23', ammo: 5,
    skipFrames: 1,
    script: '20:,40:R,6:B,20:,6:B,20:,6:B,40:',
    extra: ['hp', 'atkTimer', 'atkPose', 'ammo', 'bat0', 'bat0x', 'bat0y',
            'bat0spd', 'bat0arc', 'bat1', 'bat2', 'en3hp', 'en3f', 'en3f1',
            'en3s', 'en3x', 'en3y', 'en3vx', 'en3vy', 'en3at', 'en3d',
            'en3ms'] },

  // --- Boss 1 (level 4, state 10, jt_01_7591) -------------------------------
  // Idle for 400 frames: the boss crosses the arena in full hop-chase cycles
  // (grounded wind-up ~16f -> rising -> falling, hop launches measured at
  // f0/f96/f181/f277), takes both the crit high hop ($C741, $FFB1 < $80 at
  // the $5ED8 roll -- rLY measured mid-frame every time, so the roll is
  // deterministic) and the plain hop, runs the DEAD-ZONE band only: hooking 1:$7627 gives 6 hits but $75F7 (chase) and $7604 (far-idle) get ZERO here. Adding the punch scenario buys one chase hit at f165; far-idle is still never reached, and neither is $636B, the crit +$12 probe reach, and
  // attacks at f362 (the $7662 attack-crit roll + the late-armed $634F probe
  // reaching the player: contact damage + iframes). No lag frame in the run --
  // every field is bit-exact over all 400.
  { name: 'l4-boss1-hop-chase', level: 4, frames: 400, script: '400:',
    extra: BOSS_FIELDS },
  // The same fight with punches: the first burst lands at ~f100 as the boss
  // comes down from its first hop (hp 32 -> 30), covering meleeHitTest on a
  // boss record, the $3C stun + blink, and the boss knockback arm at $4F84
  // (arena-wall X-hi checks). Melee CRITS are impossible here -- $26D7 gates
  // the crit on $C73E == 0 and level 4 is boss 1 -- so damage is
  // deterministic.
  { name: 'l4-boss1-punch-knockback', level: 4, frames: 400, ammo: 0,
    script: '97:,6:B,24:,6:B,24:,6:B,24:,6:B,219:',
    extra: BOSS_FIELDS },

  // --- Level 14: the entrance reroute + Boss 4 / the chaser -----------------
  // Level 14 boots INSIDE 1:$77BD ($C750 = 1 from init): the whole enemy
  // driver and the whole player logic chain ($1438 -> $1B4A) are bypassed
  // while the Joker's balloon flies its scripted path (tables 1:$7A41/$7A5A,
  // position in $FFBA-$FFBD, the player's OWN vy register reused as the
  // vertical step counter -- vy jumps to 16 at f120 with the player
  // grounded). The path completes at ~f729, $C740 flips back to $FF, and the
  // fight opens: the Joker (state 9) runs its close band off the stale blob
  // screen bytes at f731, goes far-band idle from f732, and the chaser
  // (state 4) slides 4/frame toward the player. Bit-exact over
  // 900 frames, entrance timing included -- but that is the SCENARIO, not the
  // states. Hooked across the 171 post-entrance frames: state 9 only ever
  // reaches $7354 (far-idle); its phase-2 stagger, both throws, the walk,
  // mirror, hop and attack tick NEVER execute. State 4 only runs its slide --
  // $778D (the grab latch) and $77AE (the hoist), the half that writes
  // player.slowMode/air/vy, are untested.
  //
  // KNOWN NIT, not covered here: walking immediately after the entrance ends
  // diverges the player's walk-ANIMATION phase by ~8 frames (physics stay
  // exact) -- the anim counters seed differently across the 730 gated
  // frames. Fix that before adding a post-entrance input scenario.
  { name: 'l14-entrance-and-fight-open', level: 14, frames: 900, script: '900:',
    extra: [...BOSS_FIELDS, 'en0sx', 'en0sy', 'en1f', 'en1s', 'en1x', 'en1y'] },

  // --- Boss 2 (level 8, state 7, jt_01_6D8A) --------------------------------
  // Walk into the arena and stand there. Covers activation, the distance
  // bands, the mirror-pause dead zone, walk acceleration, the wall-hop
  // launcher (8-frame wind-up via the turn-anim machinery), the swing at
  // ~f86 whose first probe CONNECTS (hp 10 -> 9 with enemy-facing iframes),
  // and the missed-probe re-arm ($61FB: r[1] bit 4 + the +$15 committed
  // timer -- NOT the attack timer; that mistake diverged this scenario at
  // f88 before the store target was measured).
  //
  // Capped at 558: f559 is a LAG FRAME -- 1:$4E3F measured skipping slot 0
  // there, the only skip in 600 frames -- after which the cartridge's boss
  // runs one $FA step behind the port forever.
  { name: 'l8-boss2-engage', level: 8, frames: 558,
    script: '20:,110:R,438:', extra: BOSS_FIELDS },
  // One batarang at the grounded boss: the armored bounce ($3C8A), the $C741
  // spin-freeze ($3CA2, counted down by the handler head and drawn by the
  // $5D20 special), the throw's own punch probe connecting mid-spin at f137
  // (2 damage + stun), and the knockback's $4FCA write zeroing the spin --
  // which is what pinned that store as live rather than "not modelled". The
  // skipFrames-1 is the usual --ammo harness skew.
  { name: 'l8-boss2-batarang-spin', level: 8, frames: 300, ammo: 5,
    skipFrames: 1, script: '20:,110:R,4:B,166:',
    extra: [...BOSS_FIELDS, 'bat0', 'bat0x', 'bat0y', 'bat0spd', 'bat0arc',
            'ammo'] },

  // --- Boss 3 (level 11, state 8, jt_01_7061) -------------------------------
  // Idle for 700 frames: the immediate first dash (attack timer 11 at f2),
  // the far-band idle with the $C741 patience counter climbing on odd $FFB1
  // frames, the counter tripping $B4 at ~f400 (crit lunge, decaying velocity,
  // arena-edge ricochet), the chained $30-speed dashes and player contact
  // damage (hp 10 -> 8 by f601). No lag frame in the run.
  { name: 'l11-boss3-patience-lunge', level: 11, frames: 700, script: '700:',
    extra: BOSS_FIELDS },
  // Walk in and punch three times: meleeHitTest on the boss, the boss-3
  // knockback variant ($4FF5, X-hi >= 9 wall test), and the bid-3 stun expiry
  // at $5080 -- whose $50B0 write IS the crit-lunge trigger ($C73F): before
  // that write was modelled this scenario diverged at f188 on exactly
  // bossCrit, and the retaliation vx read $CD = $CC + one $6280 step.
  { name: 'l11-boss3-punch', level: 11, frames: 500, ammo: 0,
    script: '20:,100:R,6:B,20:,6:B,20:,6:B,328:',
    extra: BOSS_FIELDS },

  // --- State 6 (level 12, the pacing shooter, jt_01_57D6) -------------------
  // Level 12 is dense with unported NON-enemy machinery, so each scenario is
  // placed to stay clear of it. Measured hazards, for whoever comes next:
  //  - the collapsing floor (loc_00_2FB7, table 1:$7BB4) erases cols 3-14
  //    once the player passes col 6 -- slot 0 lives inside it;
  //  - type-5/6 map objects (cols 28/30/44/46/56/61/86) hold enemies and the
  //    player up on the cartridge but are handler-less in the port -- slot 3
  //    at col 56 stands on the type-6 at $C1E8 slot 4;
  //  - the shooter's own shot BREAKS class-$06 cells through the EFFECT POOL
  //    (measured: fire at f5, $C67B queue entry {12,91,28} at f7, cell zeroed
  //    at f19), which the port does not model;
  //  - chronic lag frames near multi-enemy warps (slot skips measured at
  //    1:$4E3F on the warp-38 run: f9-f59, hitting slot 1 at f32/f36).
  //
  // Slot 4 (col 73) is the one record clear of ALL of that: 400 frames of
  // activation, mid-band chase, committed pauses and the bit-7 walk-away
  // inversion, bit-exact on every field.
  { name: 'l12-shooter-approach', level: 12, frames: 400, warp: '71,26',
    skipFrames: 1, script: '400:',
    extra: ['hp', 'en4f', 'en4f1', 'en4s', 'en4d', 'en4ms', 'en4x', 'en4y',
            'en4vx', 'en4vy', 'en4at', 'en4hp'] },
  // Slot 5 (col 92): walks left into the wall at f4 (snap $B0 + the pacing
  // latch flip), fires on the pacing column test at f5, holds the $0F attack
  // tick, and launches the mode-2 projectile. CAPPED AT 21: at f5 the shot's
  // muzzle effect breaks the breakable at (91,12) on the cartridge -- the
  // effect pool is not modelled -- so from f22 the cartridge's enemy walks
  // through a wall the port still sees. First divergent frame measured: f22
  // (en5f1/en5x/en5vx).
  { name: 'l12-shooter-fire', level: 12, frames: 21, warp: '90,27',
    skipFrames: 1, script: '21:',
    extra: ['hp', 'en5f', 'en5f1', 'en5s', 'en5d', 'en5ms', 'en5x', 'en5y',
            'en5vx', 'en5vy', 'en5at', 'en5hp', 'en6f', 'en6s', 'en6d',
            'en6ms', 'en6x', 'en6y', 'en6at', 'en6hp'] },
  // The same run followed to f29 for the PROJECTILE alone: full flight, the
  // wall hit at f28 and the variant-2 explode/disable ($5B12 -> $5B89) --
  // en5's own fields are deliberately NOT compared here because of the
  // breakable divergence the previous scenario documents; the projectile
  // slot stays exact through f29 (its first divergence is the SECOND shot at
  // f63, which the broken wall reschedules).
  { name: 'l12-projectile-explode', level: 12, frames: 29, warp: '90,27',
    skipFrames: 1, script: '29:',
    extra: ['en6f', 'en6s', 'en6d', 'en6ms', 'en6x', 'en6y', 'en6at',
            'en6hp'] },

  // Walk LEFT off the start ledge into the pit. The player crosses row $21
  // during f117's movement; the cartridge's pit test at loc_00_1755 runs at
  // the TOP of the NEXT update, so hp hits 0 at f118 with the fall's
  // vx = -2 / vy = -66 left frozen in place -- sub_00_29E7 never touches
  // them. The port used to test after vertical() (death one frame early)
  // AND zero both velocities. Runs 12 frames into the death sequence; the
  // full sequence/respawn is deliberately not compared (the port's
  // restart-in-place stopgap).
  { name: 'l3-pit-death-exact-frame', level: 3, frames: 130, warp: '46,23',
    ammo: 0, script: '20:,110:L', extra: ['hp', 'action', 'en3f', 'en3hp'] },
];

// `anim`/`animFrame` are NOT here, and that is a known hole rather than an
// oversight -- see the task filed against loc_00_1B4A. MEASURED across this
// whole corpus: anim diverges in 26 of 28 scenarios and animFrame in all 28.
// src/player.js's selectAnim is a reimplementation, not a translation: it
// invents fallTicks/walkTicks/walkStep and carries an admittedly "empirical"
// cling switch point. Adding these two fields before that is fixed would turn
// the gate red for a reason the gate cannot act on. Add them the day it is.
const FIELDS = ['x', 'y', 'vx', 'vy', 'air', 'facing', 'camX', 'camY'];
const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });

const rows = [];
for (const s of SCRIPTS) {
  if (only && s.name !== only) continue;
  process.stderr.write('running ' + s.name + ' ... ');
  const ammo = s.ammo === undefined ? [] : ['--ammo', String(s.ammo)];
  // Late-level content is unreachable from a scripted input, so a scenario may
  // ask both harnesses to place the player directly.
  const warp = s.warp === undefined ? [] : ['--warp', String(s.warp)];
  const lvl = String(s.level ?? level);       // per-scenario level wins
  run('python', ['tools/oracle/trace.py', '--frames', String(s.frames),
                 '--script', s.script, '--level', lvl, ...ammo, ...warp]);
  run('node', ['tools/render-frame.mjs', '--frames', String(s.frames),
               '--script', s.script, '--level', lvl, ...ammo, ...warp]);

  const o = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'rip/oracle/trace_L' + lvl.padStart(2, '0') + '.json'),
    'utf8')).frames;
  const p = JSON.parse(fs.readFileSync(path.join(ROOT, 'rip/port/trace.json'), 'utf8'));
  const n = Math.min(o.length, p.length);

  // `skipFrames` drops leading frames from the comparison. Only legitimate use:
  // trace.py injects --ammo AFTER frame 1 has already been sampled (frame 1's
  // $0A4F sample is collected during boot_to_gameplay), while render-frame.mjs
  // sets it before its first tick. That is a one-frame harness skew, not a port
  // divergence. Never use it to hide a real diff.
  const start = s.skipFrames || 0;
  const pct = {};
  const firstBad = {};
  for (const f of [...FIELDS, ...(s.extra || [])]) {
    let bad = 0;
    for (let i = start; i < n; i++) {
      if (o[i][f] === p[i][f]) continue;
      if (bad === 0) firstBad[f] = { frame: i + 1, oracle: o[i][f], port: p[i][f] };
      bad++;
    }
    pct[f] = (1 - bad / (n - start)) * 100;
  }
  rows.push({ name: s.name, frames: n, pct, firstBad,
              knownFail: s.knownFail, extra: s.extra || [] });
  process.stderr.write('done\n');
}

const NAMEW = Math.max(19, ...SCRIPTS.map((s) => s.name.length + 1));
const cell = (v) => (v === 100 ? '  100%' : v.toFixed(1).padStart(6) + '');
console.log('\n' + 'scenario'.padEnd(NAMEW) + 'frames' +
            FIELDS.map((f) => f.padStart(8)).join('') + '   extra  verdict');
// A scenario carrying `knownFail` is a diagnosed, un-fixed port bug: it is
// allowed to diverge (XFAIL) but NOT allowed to start passing silently (XPASS
// is a failure -- delete the annotation instead).
const regressions = [];
const xpasses = [];
const xfails = [];
for (const r of rows) {
  // Every field the scenario asked for, core plus `extra`.
  const clean = Object.values(r.pct).every((v) => v === 100);
  let verdict;
  if (r.knownFail) {
    verdict = clean ? 'XPASS' : 'xfail';
    (clean ? xpasses : xfails).push(r);
  } else {
    verdict = clean ? 'ok' : 'FAIL';
    if (!clean) regressions.push(r);
  }
  const extraWorst = r.extra.length
    ? cell(Math.min(...r.extra.map((f) => r.pct[f])))
    : '     -';
  console.log(r.name.padEnd(NAMEW) + String(r.frames).padStart(6) +
              // Camera included: since the $0A4F sampling fix it is exact too,
              // so any drift is a real regression, not a measurement artifact.
              FIELDS.map((f) => cell(r.pct[f]).padStart(8)).join('') +
              '  ' + extraWorst + '  ' + verdict);
}

// A percentage says a scenario broke; the first divergent frame says where.
// Re-run that one script through tools/oracle/compare.mjs for the full window.
const showFirst = (list, heading) => {
  if (!list.length) return;
  console.log('\n' + heading);
  for (const r of list) {
    for (const f of [...FIELDS, ...r.extra]) {
      const d = r.firstBad[f];
      if (!d) continue;
      console.log(`  ${r.name} ${f} @ frame ${d.frame}: ` +
                  `oracle ${d.oracle}, port ${d.port}`);
    }
  }
};
showFirst(regressions, 'REGRESSION - first divergence per broken field:');
showFirst(xfails, 'known failures (xfail) - first divergence per field:');
for (const r of xfails) console.log(`\n  ${r.name}: ${r.knownFail}`);
for (const r of xpasses) {
  console.log(`\n  ${r.name} is marked knownFail but is now bit-exact. ` +
              'Remove the annotation from tools/oracle/regress.mjs.');
}

const ok = regressions.length === 0 && xpasses.length === 0;
console.log('\n' + (ok
  ? `PASS - ${rows.length - xfails.length}/${rows.length} scenarios bit-exact ` +
    `against the ROM` + (xfails.length ? `, ${xfails.length} known xfail` : '')
  : (regressions.length
      ? 'REGRESSION: a field diverged from the ROM'
      : 'XPASS: a known-failing scenario now passes')));
process.exit(ok ? 0 : 1);
