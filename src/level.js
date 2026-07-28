// Level loading.  ROM: sub_00_0C34 (map -> $D000), sub_00_2889 (metatiles,
// graphics, spawns), $04BB-$0563 (level init), 1:$7CED (player start).

import { loadLevel, loadManifest, buildTileCache } from './assets.js';
import { loadActors } from './actors.js';
import { loadEnemies } from './enemies.js';
import { loadWaterArt, applyWaterArt, armEnemyRespawn } from './water.js';

// The window art is the same for both water levels, so load it once.
let waterArt;
let waterArtTried = false;
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

  // ROM: sub_00_2889 block-copies the object blob straight into $C1E8.
  const os = info.objectSpawns;
  loadActors(state, b64(os.records), os.count);
  const es = info.enemySpawns;
  loadEnemies(state, b64(es.records), es.count);
  // $0EC3 (sub_00_0D50): levels 1-2 arm slots 6/7 with the $40 dead latch, so
  // the respawner in water.js fills them with the sewer-enemy templates on the
  // first two frames. Runs AFTER the blob load, exactly the ROM's order.
  armEnemyRespawn(state);

  // $04FD/$0503/$0534-$053F: the water body re-seeds at $1F00 on level entry.
  state.water = createWater();

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

  // Captured window tilemap + tile animation, per level. Best-effort: a
  // missing capture must not stop the level loading.
  if (!waterArtTried) {
    waterArtTried = true;
    try { waterArt = await loadWaterArt(); } catch { waterArt = null; }
  }
  applyWaterArt(state, waterArt && waterArt[String(n)]);

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
  p.air = 2;              // start falling onto the ground
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
  state.doors.active = 0;
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
