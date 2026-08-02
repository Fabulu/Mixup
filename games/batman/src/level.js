// Level loading.  ROM: sub_00_0C34 (map -> $D000), sub_00_2889 (metatiles,
// graphics, spawns), $04BB-$0563 (level init), 1:$7CED (player start).

import { u8 } from './state.js';
import { loadLevel, loadManifest, buildTileCache } from './assets.js';
import { loadActors } from './actors.js';
import { MAX_HP_BIT, MAX_HP_CELL } from './collision.js';
import { setMapCell } from './state.js';
import { loadEnemies } from './enemies.js';
import { applyLevelArt, armEnemyRespawn } from './water.js';
import { clearDrops } from './drops.js';
import { clearEffects } from './doors.js';
import { effects } from './effects.js';
import { createSubsys } from './conveyor.js';

import { createWater } from './water.js';

/** Decode a base64 record blob from the manifest into bytes. */
function b64(s) {
  if (!s) return new Uint8Array(0);
  const bin = typeof atob === 'function'
    ? atob(s)
    : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Load a level.
 *
 * `transition: true` is loc_00_2820, the ordinary WALK-OFF handoff, and it is
 * a genuinely different routine from loc_00_04BB -- not a flag on it. $2820
 * calls only sub_00_333F, sub_00_09DD, sub_00_2889, sub_00_0C34, sub_00_104E,
 * sub_00_0D50, 1:$4DDA and sub_00_0F39, then zeroes $C736 and $C100. The whole
 * $04BE-$053F register block -- velocity, air state, facing, half-extents,
 * i-frames, ammo, the animation triple, the water surface -- is NOT re-run, so
 * the player crosses the boundary still moving, still blinking, still holding
 * whatever the last level left in those bytes.
 *
 * MEASURED (tools/oracle/walkoff.py --from 1 --exit right), reading the last
 * frame of level 1 against the first frame of level 2: $C714 steps 53 -> 52
 * straight through the boundary rather than being cleared, $C759 keeps its 7,
 * $FF8C/$FF8D stay at the animation's 14/16 instead of going back to $0F/$10,
 * $FFC3 keeps its pose 10, $C70A-$C70C keep 31/0/240 and $FFB1 free-runs
 * 121 -> 122 with $FFA7 alternating. The port ran a full initLevel and
 * hand-restored four fields in main.js, so every one of those was reset.
 *
 * The one clear the transition DOES inherit is sub_00_0D50's own: $0D5E tests
 * bit 7 of this level's 0:$1015 byte and, when it is set, zeroes $FF80/$FF86/
 * $FF87/$C714 at $0D66. Levels 1, 4, 5, 8, 9, 11, 12 and 14 carry that bit;
 * levels 2, 3, 6, 7, 10 and 13 do not, which is exactly why the L1 -> L2
 * arrival keeps its velocity.
 */
export async function initLevel(state, n, { transition = false } = {}) {
  const { info, cells, vram } = await loadLevel(n);
  const manifest = await loadManifest();

  // Code-adjacent lookup tables (slope heights, sine, damage tables).
  state.tables = manifest.tables;

  state.level.number = n;                       // $FFB0
  state.level.width = info.width;
  state.level.height = 16;
  state.level.cells = cells.slice();            // mutable: breakables, pickups
  state.level.metatiles = info.metatiles;       // [[TL, BL, TR, BR], ...]
  state.level.vram = vram;
  state.level.tiles = buildTileCache(vram);

  // $C732: camera clamp for this level (0:$103F).
  state.camera.clampRight = info.cameraClamp;
  // 0:$286D -- where each edge leads. $FE = no exit (fall back in from the
  // top), $FF = no walk-off exit at all (boss levels).
  state.level.exitRight = info.exitRight;
  state.level.exitTop = info.exitTop;
  // 0:$1015, whole. Bit 7 is sub_00_0D50's "reset the player's motion" arm
  // ($0D5E-$0D6D), which is the only part of the $04BB register block a
  // walk-off transition still runs; the low nibble is $C73E.
  state.level.subtype = info.subtype;
  // $C73E: low nibble of 0:$1015 -- 1-4 are bosses, 5 the level-6 vehicle.
  // The camera pins itself low whenever this is non-zero.
  state.level.bossId = info.subtype & 0x0F;

  // $0519: level init clears $FFB5.
  //
  // MEASURED (tools/oracle/flow.py --mode boot / --mode death), because the
  // obvious reading of the listing is wrong: the tail of sub_00_0D50
  // ($0EC0/$0EE7/$0F36) sets $FFB5 = 1 at the END of every level load, which
  // looks like "a level has been reached". It is not a latch. $0561's CALL
  // falls straight through into loc_00_0564, which is `XOR A / LDH [$FFB5],A`
  // -- so the flag is cleared before the first main-loop iteration ever
  // finishes, every single time. Its real job there is the $05C0 test: a
  // routine that rebuilt the screen mid-frame sets it, and the loop restarts
  // the iteration instead of running the rest of the frame against a screen
  // that just moved.
  //
  // The ONLY write that survives to be read by round select is the death
  // sequence's, at $2AAF. So $FFB5 means "you got here by dying", which is
  // exactly the condition CONTINUE should appear under -- and a route boss
  // cleared normally reaches the same menu with $FFB5 = 0 (measured: level 4
  // cleared, $035B entered with $FFB5 = 00, $C753 = 01).
  state.flow.continueAvailable = 0;

  // $0D79-$0DB8: on HARD ($C756 == 2) a subtype level buffs its boss, and on
  // level 8 it does considerably more than that. Applied after loadEnemies so
  // it patches the loaded records, which is the ROM's order ($0D73 runs inside
  // the same init that has already block-copied the blob).
  //
  // $C73D is seeded to 1 on hard and 0 otherwise, so the $2643/$3C56 stagger
  // gate is one step from firing before the Joker has even moved.
  state.flow.bossRage = 0;                      // $0DBB: $C73D
  state.flow.bossCrit = 0;                      // $C73F
  state.flow.bossHop = 0;                       // $C741
  state.flow.bossMode = 0;                      // $C750
  // $0DC8-$0DCA: $C740 = $FF, right beside them. On the cartridge that byte
  // is the boss-death countdown AND the melee/batarang damage gate; here it
  // is only the clear request main.js raises and consumes, but it has to be
  // rearmed on the same instruction the ROM rearms it on.
  state.flow.levelCleared = 0;                  // $C740
  // $04EA: level init clears $C716. loc_00_2820 does not, but the game cannot
  // be paused while it runs.
  if (!transition) state.flow.paused = false;

  // ROM: sub_00_2889 block-copies the object blob straight into $C1E8.
  const os = info.objectSpawns;
  loadActors(state, b64(os.records), os.count);
  const es = info.enemySpawns;
  loadEnemies(state, b64(es.records), es.count);
  // $0EC3 (sub_00_0D50): levels 1-2 arm slots 6/7 with the $40 dead latch, so
  // the respawner in water.js fills them with the sewer-enemy templates on the
  // first two frames. Runs AFTER the blob load, exactly the ROM's order.
  armEnemyRespawn(state);

  // $0D73-$0DB8 / $0E01: the two DIFFICULTY arms of level init. Both were
  // missing, and the first one is not a nicety -- it changes what boss 2 IS.
  applyDifficultyInit(state, n);

  if (n === 0x0E) {
    // $0DD9-$0DFA: level 14 boots INSIDE the 1:$77BD entrance -- $C750 = 1
    // reroutes the whole enemy driver there, and $C740 = 1 both hides the HUD
    // (the $0567/$05D9 `CP $FF` gate) and disables melee and batarang damage
    // until 1:$77FF puts $FF back. $C741 = $78 is the phase-1 countdown;
    // $FFBA-$FFBD seed the Joker's balloon at world ($0880, $1E00). MEASURED:
    // C741 119 at the first sampled frame, C750 1 -> 2 at f120 with the
    // player's vy register stamped $10.
    //
    // ORDER MATTERS, and this block used to sit ABOVE applyDifficultyInit
    // where the last two lines could not do their job. The ROM runs the hard
    // arm FIRST ($0D80-$0D8A: $C27E += 5, $C73D = 1) and only then reaches
    // $0DFA, which is `LD [$C73D],A` with A still 0 from the $0DF7 XOR -- so
    // on level 14 the enrage latch ends up CLEARED on hard exactly as it is on
    // normal, while the +5 boss HP survives. MEASURED (diffhunt l14-entrance
    // @ $C756 = 2): bossRage 1 in the port against 0 on the cartridge for all
    // 900 frames, the fight visibly diverging at f732 (far-idle against a
    // phase-2 throw) and the player 10 HP against 8 by f881.
    state.flow.bossMode = 1;                    // $0DE0
    effects(state).entranceHold = 1;            // $0DE3: $C740 = 1
    state.flow.bossHop = 0x78;                  // $0DE8
    state.flow.balloonX = 0x0880;               // $0DEB-$0DF1
    state.flow.balloonY = 0x1E00;               // $0DF3-$0DF8
    state.flow.bossRage = 0;                    // $0DFA: $C73D, after the hard arm
    // $0DFD-$0DFF: `LD A,$FF / LDH [$FFAD],A`. BGP = $FF is every shade mapped
    // to the darkest one -- the entrance plays over a BLACKED-OUT background,
    // and 1:$77D5 writes $E4 back when phase 2 begins. Without the seed there is
    // nothing for that restore to restore FROM, which is why it reads as "the
    // Joker level renders on the wrong background".
    //
    // MEASURED cost while this was missing (pixeldiff l14-walk): f40 and f80
    // were 20299 wrong pixels each, 11.90% match, rows 32-37 solid. The
    // l14init.mjs stage has been asserting it on all three difficulties and
    // failing on all three.
    state.video.bgp = 0xFF;                     // $0DFD: $FFAD
    // (The player-side counterpart lives in resetPlayer: p.air stays 0 on
    // this level because the gated update never runs the landing.)
  }

  // 1:$4DDA: the +2-max-HP pickup is once per GAME, not once per visit. If
  // this level's $C754 bit is already set, its cell is erased before the
  // player can reach it again.
  const bit = MAX_HP_BIT[n];
  const cell = MAX_HP_CELL[n];
  if (bit && cell && (state.flow.maxHpTaken & bit)) {
    setMapCell(state, cell.col, cell.row, 0, 0);
  }

  // $04FD/$0503/$0534-$053F: the water body re-seeds at $1F00 on level entry.
  // loc_00_2820 runs none of those five writes, so a walk-off carries the
  // surface across. (Self-neutralising in normal play -- $2E2D parks the
  // surface at $1F00 for every column past $5A -- but the transition must not
  // invent a reset the cartridge does not perform.)
  if (!transition) state.water = createWater();

  // $050D-$0516 / $0EAB / sub_00_29C3: the per-level sub_00_2CBE subsystem
  // state -- level 7's respawn counter, level 11's freeze timer, level 12's
  // collapse cursor, level 13's one-shot latch and loc_00_3050's rescue drop.
  state.subsys = createSubsys();

  // $0F08-$0F0F, guarded on `CP $06 / JR NZ` at $0EEA: the conveyor track is
  // seeded on LEVEL 6 ONLY. MEASURED 0 on the first gameplay frame of levels
  // 4, 7, 11, 12 and 13, which is why state.js no longer defaults it to $0700.
  state.flow.parallaxTrack = n === 0x06 ? 0x0700 : 0;
  state.flow.conveyorDir = 0;                   // $FFC9
  state.flow.parallaxScx = 0;                   // $FFCC

  // $FFB1/$FFA7 are free-running VBlank counters that NEVER reset -- their
  // phase at gameplay start comes from the boot path, and the game reads them
  // raw: the water-gravity gate is `$FFB1 & 7` ($1AE4), the water parity gate
  // `$FFB1 & 1` ($2D5D), the enemy hit-blink `$FFB1 & 8` ($5DE1), the enemy
  // loop direction `$FFA7` ($4E13). The phase is NOT the same for every
  // level: MEASURED at the first $0567 iteration under the oracle's boot
  // path, levels 1/4/5/8/9/11/12/14 land at $FFB1 = $6D and levels
  // 2/3/6/7/10/13 at $53 -- their loads spend a different number of frames
  // with the counter ticking. $FFA7 is 1 for all fourteen. The old flat $6D
  // stayed hidden on the $53 levels until the hit-blink gate (the first
  // $FFB1 consumer an enemy ever reaches on level 3) drifted the landing
  // animation by exactly the phase difference.
  //
  // A WALK-OFF must not touch either. They are VBlank counters; $2820 is
  // ordinary main-loop code and the ISR keeps ticking straight through it.
  // MEASURED across an L1 -> L2 arrival (tools/oracle/walkoff.py): $FFB1 reads
  // $79 on the last level-1 frame and $7A on the first level-2 one, and $FFA7
  // goes 1 -> 0 -- i.e. both just keep counting, and the value at an arrival
  // is whatever the run happened to reach. There is no arrival phase to adopt;
  // reseeding here would invent one. $FFA7 decides the HUD's OAM index while
  // $FFB1 drives the water gravity gate and the enemy hit-blink.
  if (!transition) {
    state.frame = [2, 3, 6, 7, 10, 13].includes(n) ? 0x53 : 0x6D;
    state.parity = 1;
  }

  // $04C9 + $04D7: the window map, BUILT from ROM data rather than captured.
  //
  // Worth recording why this took so long to land. The task was filed against
  // "$0E24, the window surface" -- but $0E24 sits behind `$0DD9: CP $0E /
  // JP NZ`, so it runs on LEVEL 14 and nowhere else. What paints the window on
  // every other level is a pair of instructions three apart inside level init
  // itself: a 960-cell fill of tile $01 at $9C40, then a 47-byte script at
  // 0:$32A3. Chasing the filed address would never have found it.
  applyLevelArt(state, manifest, n);

  // ROM: sub_00_0F39 picks the level's theme and requests it with mask $03
  // (play + stop-all), so the new song replaces whatever was running. $FF is
  // "keep playing", used where a level continues its predecessor's music.
  if (info.musicFresh !== undefined && info.musicFresh !== 0xFF
      && state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id: info.musicFresh, mask: 0x03 });
  }

  resetPlayer(state, info, { transition });
  return info;
}

/**
 * ROM: $0D73-$0DB8 and $0E01. Level init's difficulty arms, applied after the
 * enemy blob has been copied in because they PATCH the loaded records.
 *
 * HARD ($C756 == 2) on any subtype level: the boss gains 5 HP and $C73D is
 * seeded to 1. On level 8 specifically it then conscripts slots 1 and 2 as
 * live state-13 boss PARTS with $FF HP, and retunes the boss's own jump
 * velocity and speed cap. Hard-mode boss 2 is a different fight, not a
 * tougher one.
 *
 * EASY ($C756 == 0) on level 14: the chaser is switched off outright.
 */
function applyDifficultyInit(state, n) {
  const boss = state.level.bossId;              // $C73E
  const diff = state.flow.difficulty;           // $C756

  if (n === 0x0E && diff === 0) {
    state.enemies[1][0] = 0x40;                 // $0E07: $C288 -- chaser off
    return;
  }
  if (boss === 0 || diff !== 2) return;         // $0D77 / $0D7E

  state.enemies[0][0x16] = u8(state.enemies[0][0x16]
    + state.tunables.bossHPBonusHard);          // $0D83: $C27E += 5
  state.flow.bossRage = 1;                      // $0D8A: $C73D = 1

  if (boss !== 2) return;                       // $0D92
  state.enemies[0][0x1C] = 0x38;                // $0D96: $C284 jump velocity
  state.enemies[0][0x1D] = 0x14;                // $0D9B: $C285 speed cap
  state.enemies[1][0] = 0x80;                   // $0DA0: $C288
  state.enemies[2][0] = 0x81;                   // $0DA5: $C2A8
  state.enemies[1][2] = 0x0D;                   // $0DAA: $C28A -- state 13
  state.enemies[2][2] = 0x0D;                   // $0DAD: $C2AA
  state.enemies[1][0x16] = 0xFF;                // $0DB2: $C29E
  state.enemies[2][0x16] = 0xFF;                // $0DB5: $C2BE
}

/**
 * ROM: level init at $04BB - player start from 1:$7CED, X low forced to $80.
 *
 * `transition` is loc_00_2820, which reaches sub_00_2889 and sub_00_0D50 and
 * nothing else -- see the note on initLevel. Everything below the early return
 * is $04BE-$053F and belongs to the FULL init alone.
 */
export function resetPlayer(state, info, { transition = false } = {}) {
  const p = state.player;
  const t = state.tunables;

  // $2973-$298F, run by both paths: Xhi from 1:$7CED and $FF82 = $80. Level
  // $0A is the exception -- $2985 skips the Y write outright, so a walk-off
  // into it arrives at whatever height the player left level 9 at.
  p.x = (info.startX << 8) | 0x80;
  if (state.level.number !== 0x0A) p.y = (info.startY << 8);

  // $29C3's tail, both paths: $FF95 = 0.
  p.slowMode = 0;

  // $2991-$29B7, both paths: $C6CF, $C67B, $C693 and $C4B0 are wiped.
  for (const b of state.batarangs) { b.active = false; b.flags = 0; }
  for (const s of state.breakables) s.timer = 0;
  clearDrops(state);            // $C6CF: a heart must not survive the level
  clearEffects(state);          // $29A5: 60 bytes of $C693

  // $0F1F-$0F25, inside sub_00_0D50 and therefore on BOTH paths: rWX = 7 and
  // rWY = $90. Only the levels-1/2 water code ever pulls the window back on,
  // so every other level must start here or the window's flat tile-$01 fill
  // covers the whole screen.
  state.video.windowY = 0x90;
  state.video.windowLatchY = 0x90;
  state.video.windowX = 0x07;

  if (transition) {
    // $0D5E-$0D6D: the ONE motion reset a walk-off still performs, and only
    // for the levels whose 0:$1015 byte has bit 7 set.
    if (state.level.subtype & 0x80) {
      p.air = 0;                       // $0D67: $FF80
      p.vx = 0;                        // $0D69: $FF86
      p.vy = 0;                        // $0D6B: $FF87
      p.iframes = 0;                   // $0D6D: $C714
    }
    return;
  }

  // $0543: level $0A ignores its 1:$7CED table entry and hard-codes the start.
  // FULL init only -- it sits at $0543, twelve instructions past the point
  // loc_00_2820 rejoins, which is why a walk-off from level 9 lands on the
  // table's own column instead.
  if (state.level.number === 0x0A) {
    p.x = (0x02 << 8) | 0x80;
    p.y = (0x12 << 8);
  }
  p.vx = 0;
  p.vy = 0;
  // $04F3: the cartridge writes $FF80 = 0, in the same XOR A run that clears
  // $FFC3/$FFC4/$FFC5. This used to spawn the player already FALLING on every
  // level but 14, as a "shortcut" so the first update's floor probe would land
  // him before the first trace sample. It was not needed -- with 0 the first
  // update still applies gravity ($1ABB only skips it while RISING) and still
  // runs the floor probe -- and it was wrong in a way nothing could see until
  // `anim` entered the compared set: $1B34 stamps the 16-frame landing squat
  // only when $FF80 was 2 on arrival, so anywhere the player spawns on solid
  // ground the port landed on frame 1 and played a squat the cartridge never
  // plays. That was the sole cause of 8 of 47 scenarios failing on anim.
  p.air = 0;
  p.facing = 0;
  // NOT hp, and NOT hpMax. $04BB writes NEITHER $FF8A nor $FF8E -- $FF8E has
  // exactly two writers in the cartridge ($0202, the boot vector, and 1:$4D70,
  // the +2 pickup) and $FF8A is refilled by sub_00_333F at $3367 on the four
  // route starts and by $0482 on CONTINUE. Resetting them here is what made
  // the +2 upgrade evaporate on every screen handoff except the one walk-off
  // main.js hand-patched. src/state.js seeds both from the tunables at boot,
  // which is the ROM's own single initialiser.
  p.halfW = t.hitboxHalfWidth;
  p.halfH = t.hitboxHalfHeight;
  p.anim = 0;
  p.animPrev = 0xFF;
  p.animFrame = 0;
  p.turnTimer = 0;
  p.squatTimer = 0;
  p.airThrottle = 0;
  p.jumpReleased = 0;
  p.clingLock = 0;
  p.slowMode = 0;
  p.attrMask = 0;
  p.action = 0;
  p.springArmed = 0;
  p.iframes = 0;
  p.msIndex = 1;
  p.dead = 0;
  state.deathTimer = 0;
  state.flow.respawnPending = false;
  p.attackTimer = 0;
  p.attackPose = 0;
  p.ropeLength = 0;
  p.ropeSegments = 0;

  state.rope.flip = 0;
  state.rope.delay = 0;
  state.rope.dx = 0;
  state.rope.dy = 0;
  for (const s of state.rope.slots) { s.x = 0; s.y = 0; }

  // $0506: $C759 starts empty each level -- but $2820 does not run $0506, so
  // ammo walks across an edge (the four pools above are cleared by $2889 on
  // both paths and stay at the top of this routine).
  state.flow.ammo = 0;
  // NOT state.doors.active, and NOT the debris pool. The cartridge clears
  // neither on a level load -- sub_00_2889 wipes $C6CF/$C67B/$C693/$C4B0 and
  // nothing else, and $C733 has no clearing writer anywhere in the ROM.
}

/**
 * Which `$C753` bit each route's LAST level owns. ROM: loc_00_35E8's dispatch
 * -- `CP $04 -> SET 0`, `CP $08 -> SET 1`, `CP $0B -> SET 2` ($360F, $3616,
 * $3608). Route 0 is levels 1-4, route 1 is 5-8, route 2 is 9-11, so the bit
 * goes up when that route's boss dies and never at any other time.
 *
 * MEASURED end to end on the cartridge for all three, by zeroing the boss's
 * own HP byte (enemy record +$16 -- the state the last punch leaves) and
 * letting the ROM run its own death and clear sequence:
 *   level 4  with $C753 = $00 -> $01, then loc_00_035B
 *   level 8  with $C753 = $00 -> $02, then loc_00_035B
 *   level 11 with $C753 = $03 -> $07, then $FFB0 = $0C and loc_00_04BB
 */
const ROUTE_BIT = { 0x04: 0x01, 0x08: 0x02, 0x0B: 0x04 };

/**
 * ROM: loc_00_35E8-$363A. What finishing a level does to the run.
 *
 * `$C753` has exactly ONE writer in the whole cartridge -- $361B -- and it is
 * only ever OR-ed, never cleared; the only thing that resets it is the boot
 * vector at $0150, which wipes WRAM (measured: a game over comes back with
 * $C753 = 0 and five lives).
 *
 * @returns where the game goes next. `transition` means the ordinary walk-off
 *          handoff at loc_00_2820, which every non-route-ending level takes.
 */
export function clearLevel(state, n = state.level.number) {
  const flow = state.flow;

  if (n === 0x0E) return { to: 'ending' };       // $35F8 -> loc_00_3652

  const bit = ROUTE_BIT[n];
  if (bit === undefined) {
    state.level.bossId = 0;                      // $35FB: $C73E
    // $3603 is `LD C,$01` and $3605 is `JP loc_00_2820`. C is the COLUMN of
    // the 0:$286D exit pair, and column 1 is the TOP exit -- NOT the right-hand
    // one, which is what $1745 loads (C = 0) when the player walks off the edge.
    //
    // This arm has exactly one reachable level: it needs a non-zero $C73E to
    // have raised the clear at all, and 4/8/$0B/$0E are dispatched above, which
    // leaves level 6 and its vehicle ($C73E = 5). Level 6's row in 0:$286D is
    // right = $FF, top = $07 -- so clearing the vehicle stage hands over to
    // level 7 through the TOP column, and reading the right column finds $FF,
    // which is not a level at all.
    //
    // MEASURED (tools/oracle/l6clear.py, vehicle killed by zeroing $C27E at
    // f20): the cartridge runs $34D0 -> $34E7 -> $35E8 -> $35FA -> $2820 and
    // has $FFB0 = 7 by f183. The port raised levelCleared at f182 and then
    // looped forever in an empty level 6, which made the game uncompletable
    // past level 6 by any route.
    return { to: 'transition', exit: state.level.exitTop };   // $3605
  }

  flow.routeMask = (flow.routeMask | bit) & 0xFF;   // $361B

  // $361E: the third bit completing the set skips the menu entirely and drops
  // straight into level $0C -- which is also the only way route 3 ever becomes
  // selectable, since $038E pins the cursor there when the mask reads $07.
  if (flow.routeMask === 0x07) return { to: 'level', level: 0x0C };

  state.level.bossId = 0;                        // $362C: $C73E
  // $3634: LD BC,$0103 / CALL sub_00_0AE1, three instructions before the JP.
  // loc_00_035B itself asks for NOTHING -- each of the three ways in sends its
  // own cue, and this is the route-clear one. (An earlier comment here claimed
  // showRoundSelect sent it and that requesting it here would double the
  // command; showRoundSelect does not, and the clear reached the menu silent.
  // No memory comparison can see this -- docs/03-VERIFICATION.md lesson 32.)
  requestSound(state, 0x01, 0x03);
  return { to: 'roundselect' };                  // $363A: JP loc_00_035B
}

function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}

/**
 * Metatile -> the four 8x8 tile ids. The ROM stores them COLUMN-major
 * (TL, BL, TR, BR), so the index for a sub-cell is subCol*2 + subRow
 * (master reference §6.2).
 */
export function metatileTile(state, metatileId, subCol, subRow) {
  const mt = state.level.metatiles[metatileId];
  if (!mt) return 0x2F;              // $2F is the blank fill tile
  return mt[subCol * 2 + subRow];
}
