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

export async function initLevel(state, n) {
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
  if (n === 0x0E) {
    // $0DD9-$0DF8: level 14 boots INSIDE the 1:$77BD entrance -- $C750 = 1
    // reroutes the whole enemy driver there ($C740 = 1 also disables melee
    // and batarang damage until the entrance ends and $77FF restores $FF).
    // $C741 = $78 is the phase-1 countdown; $FFBA-$FFBD seed the Joker's
    // balloon at world ($0880, $1E00). MEASURED: C741 119 at the first
    // sampled frame, C750 1 -> 2 at f120 with the player's vy register
    // stamped $10.
    state.flow.bossMode = 1;                    // $0DE0
    state.flow.bossHop = 0x78;                  // $0DE8
    state.flow.balloonX = 0x0880;               // $0DEB-$0DF1
    state.flow.balloonY = 0x1E00;               // $0DF3-$0DF8
    // (The player-side counterpart lives in resetPlayer: p.air stays 0 on
    // this level because the gated update never runs the landing.)
  }

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

  // 1:$4DDA: the +2-max-HP pickup is once per GAME, not once per visit. If
  // this level's $C754 bit is already set, its cell is erased before the
  // player can reach it again.
  const bit = MAX_HP_BIT[n];
  const cell = MAX_HP_CELL[n];
  if (bit && cell && (state.flow.maxHpTaken & bit)) {
    setMapCell(state, cell.col, cell.row, 0, 0);
  }

  // $04FD/$0503/$0534-$053F: the water body re-seeds at $1F00 on level entry.
  state.water = createWater();

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
  state.frame = [2, 3, 6, 7, 10, 13].includes(n) ? 0x53 : 0x6D;
  state.parity = 1;

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

  resetPlayer(state, info);
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

/** ROM: level init at $04BB - player start from 1:$7CED, X low forced to $80. */
export function resetPlayer(state, info) {
  const p = state.player;
  const t = state.tunables;

  p.x = (info.startX << 8) | 0x80;
  p.y = (info.startY << 8);

  // $0543: level $0A ignores its 1:$7CED table entry and hard-codes the start.
  // sub_00_2889 also skips its own Y write for this level ($2985).
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
  p.hp = t.startingMaxHP;
  p.hpMax = t.startingMaxHP;
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

  // $021B/$0F25/$02A9: level init parks rWY off-screen. Only the levels-1/2
  // water code ever pulls the window back on, so every other level must start
  // here or the window's flat tile-$01 fill covers the whole screen.
  state.video.windowY = 0x90;
  state.video.windowLatchY = 0x90;
  state.video.windowX = 0x07;

  state.rope.flip = 0;
  state.rope.delay = 0;
  state.rope.dx = 0;
  state.rope.dy = 0;
  for (const s of state.rope.slots) { s.x = 0; s.y = 0; }

  state.flow.ammo = 0;                 // $C759 starts empty each level
  for (const b of state.batarangs) { b.active = false; b.flags = 0; }
  for (const s of state.breakables) s.timer = 0;
  clearDrops(state);            // $C6CF: a heart must not survive the level
  clearEffects(state);          // $29A5: 60 bytes of $C693
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
    return { to: 'transition' };                 // $3605: JP loc_00_2820
  }

  flow.routeMask = (flow.routeMask | bit) & 0xFF;   // $361B

  // $361E: the third bit completing the set skips the menu entirely and drops
  // straight into level $0C -- which is also the only way route 3 ever becomes
  // selectable, since $038E pins the cursor there when the mask reads $07.
  if (flow.routeMask === 0x07) return { to: 'level', level: 0x0C };

  state.level.bossId = 0;                        // $362C: $C73E
  // $3634 asks for song $01 mask $03 on the way; showRoundSelect already
  // sends exactly that, so requesting it here would double the command.
  return { to: 'roundselect' };                  // $363A: JP loc_00_035B
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
