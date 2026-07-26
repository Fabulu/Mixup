// Level loading.  ROM: sub_00_0C34 (map -> $D000), sub_00_2889 (metatiles,
// graphics, spawns), $04BB-$0563 (level init), 1:$7CED (player start).

import { loadLevel, loadManifest, buildTileCache } from './assets.js';
import { loadActors } from './actors.js';
import { loadEnemies } from './enemies.js';

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
