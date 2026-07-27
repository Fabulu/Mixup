// The game's RAM, as a plain JS object tree.
//
// Positions are 12.4 fixed point held as a single 16-bit integer:
//   subpixels = (hiByte << 8) | loByte      256 subpx = 1 metatile = 16 px
//   pixels    = value >> 4
//   metatile  = value >> 8
// The original splits these across two HRAM bytes (e.g. $FF81/$FF82); keeping
// them joined is the one representational liberty taken, and it is lossless.
//
// Velocities keep signed-BYTE semantics because the game relies on unsigned
// byte comparisons against wrapped values (see player.js terminal velocity).

import { DEFAULT_TUNABLES } from './tunables.js';
import { createPool } from './batarang.js';
import { createRope } from './rope.js';
import { createActors } from './actors.js';
import { createEnemies } from './enemies.js';
import { createWater } from './water.js';

export const SUBPX_PER_PX = 16;
export const SUBPX_PER_METATILE = 256;

/** signed 8-bit reinterpretation */
export const i8 = (v) => (v << 24) >> 24;
/** unsigned 8-bit wrap */
export const u8 = (v) => v & 0xFF;
/** unsigned 16-bit wrap */
export const u16 = (v) => v & 0xFFFF;

export function createState(tunables = DEFAULT_TUNABLES) {
  return {
    tunables,

    frame: 0,          // $FFB1
    parity: 0,         // $FFA7 - XOR 1 every VBlank, flips enemy loop direction

    input: { held: 0, pressed: 0, prev: 0 },   // $FFE1 / $FFE2

    player: {
      // --- position / motion ---
      x: 0,            // $FF81/$FF82  12.4
      y: 0,            // $FF83/$FF84  12.4
      vx: 0,           // $FF86  signed byte, subpx/frame
      vy: 0,           // $FF87  signed byte, POSITIVE = UP  (y -= vy)
      air: 0,          // $FF80  0 grounded, 1 rising, 2 falling
      facing: 0,       // $FF88  0 right, 1 left

      // --- combat / status ---
      hp: 10,          // $FF8A
      hpMax: 10,       // $FF8E
      iframes: 0,      // $C714  bit7 = knockback direction
      action: 0,       // $C71E  0 free, 1-3 bat-rope

      // --- attacks ---
      attackTimer: 0,  // $FF97  1..15 ring; the hit test fires on frame 8
      attackPose: 0,   // $C71D  0 = punch, 1 = batarang/rope
      ropeLength: 0,   // $C71F
      ropeSegments: 0, // $FFB4

      // --- animation ---
      anim: 0,         // $FFC3
      animFrame: 0,    // $FFC4
      animPrev: 0xFF,  // $FFC5
      animTimer: 0,    // $FF89

      // --- timers / modal flags ---
      turnTimer: 0,    // $FF8F  turn-around stall
      squatTimer: 0,   // $FF90  landing squat
      airThrottle: 0,  // $FF98  air-control: accelerate every other frame
      jumpReleased: 0, // $FFC2  enables wall-jump
      clingLock: 0,    // $FFB2  b0-4 countdown, b5-7 locked dpad direction
      slowMode: 0,     // $FF95  $80 in water: halves speed and gravity
      attrMask: 0,     // $FF96  $80 = draw behind BG
      springArmed: 0,  // $C751  next jump uses springJumpVelocity
      dead: 0,         // $C715  death sequence active

      // --- hitbox (re-read per animation from 0:$27A8) ---
      halfW: 0x0F,     // $FF8C
      halfH: 0x10,     // $FF8D
    },

    camera: { x: 0, y: 0, clampRight: 0 },     // $FFA2-$FFA5, $C732

    // Pending platform-carry displacement, applied next frame ($C72F/$C730).
    carry: { x: 0, y: 0 },

    rope: createRope(),                        // $C5EB chain + $C720-$C728
    batarangs: createPool(),                   // $C4B0, 3 x 9 B
    doors: { active: 0, col: 0, row: 0 },      // $C733-$C735 door sequencer
    // $C67B, 8 x 3 B {timer, col, row} -- breakable-tile restore queue.
    breakables: Array.from({ length: 8 }, () => ({ timer: 0, col: 0, row: 0 })),
    // $C737-$C73A -- scripted door/exit walk-through.
    script: { mode: 0, steps: 0, accX: 0, accY: 0 },
    actors: createActors(),          // $C1E8, 8 x 16 B map objects
    enemies: createEnemies(),        // $C268, 8 x 32 B
    currentActorSlot: 0,             // $C75A
    // $FFC6 -- "the player is resting on a map object". Set by the overlap
    // scan (loc_00_2534/$2566/$25B3) and read back by it on the NEXT slot to
    // decide whether to clear that slot's own riding flag ($248B), so it
    // deliberately carries across slots and frames.
    standingOnActor: 0,              // $FFC6
    enemyCursor: 0,                  // $FFB3
    // $FFBE/$FFBF -- the cell address the enemy probe's empty path stored.
    // A true HRAM global: it persists across probes, slots AND frames, and
    // 1:$640C reads it stale when the probe bailed early. Held as a cell
    // index rather than an address.
    enemyBesideIdx: 0,
    // Sprites loc_01_5CA8 queued this frame; drawEnemies() flushes them.
    enemyDraws: [],
    lagFrame: 0,                     // $C757
    // $C70A-$C70D, $C713, $C755 + the $C6EF splash pool -- the level-1/2
    // rising water body (src/water.js).
    water: createWater(),
    sound: { queue: [] },                      // $C6FB, 4 x 2 B command ring

    level: {
      number: 1,       // $FFB0  1-based
      width: 0,        // metatiles
      height: 16,      // always
      cells: null,     // Uint8Array, the $D000 image: 2 B/cell, column-major
      metatiles: null, // Int16Array, 4 tile ids per metatile (TL, BL, TR, BR)
      // $C73E. Must default to 0, not undefined: camera.js tests it with !== 0,
      // so an undefined value silently takes the boss branch and pins the
      // camera for any state not built by initLevel().
      bossId: 0,
    },

    flow: {
      lives: 5,        // $C767
      difficulty: 1,   // $C756
      ammo: 0,         // $C759
      routeMask: 0,    // $C753
      paused: false,   // $C716
      bossMode: 0,     // $C750 -- level $0E reroutes the enemy loop to 1:$77BD
      rescueCheat: 0,  // $C75C -- set by the title's B+SELECT+LEFT combo
    },

    // Code-adjacent ROM tables (slope heights 0:$221C, sine 0:$09A2, scripted
    // moves 0:$27E6, damage tables). Populated by initLevel from the asset
    // manifest. Defaults to empty ARRAYS, never null: a null here crashes any
    // harness that exercises collision without loading assets.
    tables: {
      slopeY: [], slopeX: [], sine: [], hudBar2: [],
      scriptPtrs: [], scriptData: [], scriptSteps: [],
      enemyContactDamage: [], levelDamageBonus: [],
    },

    // Renderer inputs the ISRs would have written.
    video: {
      scx: 0, scy: 0,  // $FFA9/$FFAA
      bgp: 0xE4, obp0: 0xE4, obp1: 0xC4,
      sprites: [],     // replaces shadow OAM; drawn in push order
      // Window layer. LCDC is $E7 at every write site, so the window is always
      // ENABLED and reads the $9C00 tilemap -- which level init fills entirely
      // with tile $01 ($04C9 and $0E0C). It is only ever used for the water
      // body, so it is off-screen ($90) unless water.js pulls it up.
      windowY: 0x90,      // $FFAC -> rWY, the faithful per-frame register
      windowLatchY: 0x90, // $C755, which survives the odd frames rWY does not
      windowX: 0x07,      // $FFAB -> rWX; 7 means "start at screen x 0"
      windowTile: 0x01,
    },
  };
}

// ---- map access ------------------------------------------------------------
// Cell address in the original: $D000 + (Xhi << 5) + (Yhi & $0F) * 2
// (sub_00_11B9). 32 bytes per column = 16 cells x 2 bytes.

/** metatile graphic id at a metatile coordinate */
export function mapTile(state, col, row) {
  const { cells, width } = state.level;
  if (col < 0 || col >= width) return 0;
  return cells[((col * 16) + (row & 0x0F)) * 2];
}

/** collision byte at a metatile coordinate */
export function mapCollision(state, col, row) {
  const { cells, width } = state.level;
  if (col < 0 || col >= width) return 0x01;   // off-map reads as solid
  return cells[((col * 16) + (row & 0x0F)) * 2 + 1];
}

/**
 * Collision byte by raw cell INDEX (col * 16 + row).
 *
 * The original steps between vertically adjacent cells with `DEC HL / DEC HL`
 * on the $D000 pointer, so index 0 of a column steps into the PREVIOUS
 * column's row 15 rather than clamping. Index arithmetic reproduces that
 * wrap exactly; (col,row) arithmetic would not.
 */
export function mapCollisionByIndex(state, idx) {
  const { cells } = state.level;
  if (idx < 0 || idx * 2 + 1 >= cells.length) return 0x01;
  return cells[idx * 2 + 1];
}

export const cellIndex = (col, row) => col * 16 + (row & 0x0F);

/** Write BOTH bytes of a cell -- graphic and collision. */
export function setMapCell(state, col, row, graphic, collision) {
  const { cells, width } = state.level;
  if (!cells || col < 0 || col >= width) return;
  const i = ((col * 16) + (row & 0x0F)) * 2;
  if (i + 1 >= cells.length) return;
  cells[i] = graphic;
  cells[i + 1] = collision;
}

export function setMapCollision(state, col, row, value) {
  const { cells, width } = state.level;
  if (col < 0 || col >= width) return;
  cells[((col * 16) + (row & 0x0F)) * 2 + 1] = value;
}
