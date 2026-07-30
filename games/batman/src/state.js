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
import { createRaster } from './raster.js';
import { createWater } from './water.js';
import { createDrops } from './drops.js';
import { createDoorState } from './doors.js';
import { createEffects } from './effects.js';

export const SUBPX_PER_PX = 16;
export const SUBPX_PER_METATILE = 256;

/** signed 8-bit reinterpretation */
export const i8 = (v) => (v << 24) >> 24;
/** unsigned 8-bit wrap */
export const u8 = (v) => v & 0xFF;
/** unsigned 16-bit wrap */
export const u16 = (v) => v & 0xFFFF;

/**
 * The palettes gameplay runs with: $FF47/$FF48/$FF49 via the $FFAB/$FFAD/$FFAE
 * shadows. Exported because the menu screens overwrite them -- round select
 * zeroes BOTH object palettes at $0365 -- and whatever leaves a menu has to put
 * them back. A zeroed OBP maps every shade to colour 0, so sprites are still
 * drawn, still in shadow OAM, and completely invisible.
 */
export const GAMEPLAY_PALETTES = { bgp: 0xE4, obp0: 0xE4, obp1: 0xC4 };

export function createState(tunables = DEFAULT_TUNABLES) {
  const state = {
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
      //
      // $0200-$0204: the BOOT VECTOR is where these come from, and $FF8E has
      // exactly two writers in the whole cartridge -- that one and the +2
      // pickup at 1:$4D70. Level init writes NEITHER, so max HP is a RUN-long
      // value seeded here and nowhere else; see the note on resetPlayer in
      // src/level.js. MEASURED (tools/oracle/econmaxhp.py): upgrade to $10 on
      // level 3, die, and both CONTINUE and "START a route instead" come back
      // with $FF8E = 16.
      hp: tunables.startingMaxHP ?? 10,     // $FF8A
      hpMax: tunables.startingMaxHP ?? 10,  // $FF8E
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
      // $FF91/$FF92 -- loc_00_1B4A's private scratch: last frame's VelX, and
      // the crouch latch. Nothing outside the animation selector reads either,
      // and the ROM does NOT clear them at level init, so resetPlayer leaves
      // them alone on purpose.
      prevVx: 0,       // $FF91
      crouching: 0,    // $FF92
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
    // $C733-$C735 plus the debris and $C693 effect pools. See src/doors.js.
    doors: createDoorState(),
    // $C67B, 8 x 3 B {timer, col, row} -- breakable-tile restore queue.
    breakables: Array.from({ length: 8 }, () => ({ timer: 0, col: 0, row: 0 })),
    // $C737-$C73A -- scripted door/exit walk-through.
    script: { mode: 0, steps: 0, accX: 0, accY: 0 },
    actors: createActors(),          // $C1E8, 8 x 16 B map objects
    // $FFC7 + $C763-$C766: the STAT program's mode and its scanline
    // accumulator. See src/raster.js.
    raster: createRaster(),
    enemies: createEnemies(),        // $C268, 8 x 32 B
    // $C6CF, 4 x 8 B -- the ballistic pool a dying enemy drops its heart into.
    drops: createDrops(),
    // $C1C0 death burst + the $C740 boss countdown + loc_00_34D0's stages.
    effects: createEffects(),
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
    // $C757. READ by the actor and enemy drivers ($424D, $4E39) and NEVER
    // WRITTEN -- lag frames are instruction-level timing and out of scope by
    // definition (docs/03-VERIFICATION.md §28). Kept, rather than deleted, so
    // both skip sites still carry their ROM citation; but do not mistake the
    // field's existence for the behaviour being modelled. Scenarios that cross
    // a real lag frame diverge, which is why several are capped just short of
    // one (l3-object-floor, l3-platform-ride, l1-sewer-respawner-emerge).
    //
    // Every cap in the corpus is MEASURED, never assumed, and the measurement
    // is worth re-taking rather than inheriting: an earlier note here was going
    // to record "level 4 lags at f110 of a punch-heavy run" and it does not.
    // Hooked on this exact shape ($C757 read out of trace.py, level 4,
    // --ammo 0, presses every 12 frames) the byte is clear for all 200 frames,
    // for all 640, and for all 600 of regress.mjs's l4-boss1-melee-sweep at a
    // 16-frame cadence. Level 4 has no lag frame in any punch run measured so
    // far. The levels that DO are named on their own scenarios.
    lagFrame: 0,
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
      // $0206-$0208 is the ONLY initialiser of $C767 in the cartridge, so the
      // starting count belongs to the boot vector and to nothing else. It used
      // to be a literal 5 here, which meant the One Life mod handed out five
      // lives on the first run and only took effect from the first game over
      // (player.js's deathTick already reads the tunable).
      lives: tunables.startingLives ?? 5,   // $C767
      difficulty: 1,   // $C756
      ammo: 0,         // $C759
      routeMask: 0,    // $C753
      // $C754 -- which levels' +2-max-HP pickup has been taken, bits 0/1/2 for
      // levels 3/5/$0D. A run-long latch: level init does NOT clear it (only
      // the boot vector does), and 1:$4DDA zeroes the pickup's map cell on
      // re-entry, so each of the three is once per GAME rather than once per
      // visit. Max HP is capped at $10 either way, so the port was bounded
      // without it -- just wrong.
      maxHpTaken: 0,
      // $FFB5 -- set once a level has been reached, which is what makes
      // CONTINUE appear on the round-select screen and start selected.
      continueAvailable: 0,
      paused: false,   // $C716
      bossMode: 0,     // $C750 -- level $0E reroutes the enemy loop to 1:$77BD
      // Boss-fight globals, all zeroed by level init ($0DBA-$0DC5):
      bossRage: 0,     // $C73D -- boss 1/4 enrage latch (HP < $10 on non-easy)
      bossCrit: 0,     // $C73F -- attack-crit flag (rLY roll at 1:$7662)
      bossHop: 0,      // $C741 -- boss-1 high-hop / boss-2 special-draw flag
      // $FFCA/$FFCB as one word, plus its direction and derived scroll.
      //
      // $0EEA guards the seed on `CP $06 / JR NZ`, so ONLY level 6 gets
      // $0700 -- MEASURED 0 on the first gameplay frame of levels 4, 7, 11,
      // 12 and 13. Seeding it unconditionally here (which this used to do)
      // gave every other level a phantom track. initLevel sets the level-6
      // value; the default is what the other thirteen actually have.
      //
      // The track is a CHASE, not an oscillator: with $FFC8 == 0 it walks 8
      // subpixels a frame toward the player's column and stops dead on it,
      // and the arrival stop at $2F48 writes only $FFC8 -- so $FFC9 keeps
      // whatever direction it arrived with. See src/conveyor.js.
      parallaxTrack: 0,
      conveyorDir: 0,   // $FFC9 -- 1 right, 2 left; read by map-object type $0B
      parallaxScx: 0,   // $FFCC -- the derived scroll, recomputed every frame
      // $FFBA-$FFBD during the level-14 entrance (1:$77BD): the Joker's
      // balloon position. The same HRAM bytes are the enemy probe's scratch,
      // but the driver is rerouted while the entrance runs, so they never
      // collide. Seeded by initLevel on level $0E.
      balloonX: 0, balloonY: 0,
      // NOTE: the entrance reuses $C741 (bossHop) as its wait counter and
      // $C73F (bossCrit) as its path cursor -- the SAME flow fields the
      // boss fights use, exactly as the ROM multiplexes those bytes. Both
      // are zeroed when the entrance ends ($77FF).
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
      bgp: GAMEPLAY_PALETTES.bgp,
      obp0: GAMEPLAY_PALETTES.obp0,
      obp1: GAMEPLAY_PALETTES.obp1,
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

  // `video.frameParity` is $FFA7 seen from the DRAW side, and it is an ALIAS,
  // not a copy: the byte already lives at `state.parity` (the enemy loop reads
  // it there) and one byte must not have two homes. $FFA7 decides which of the
  // two identical main-loop arms queues the HUD -- $0573 when it is 0, $05E5
  // when it is not -- so it is OAM ORDER, i.e. DMG sprite priority and the
  // 10-per-line cut, which is why the renderer side wants a name for it.
  //
  // MEASURED (tools/oracle/oamorder.py --level 1 / --level 9): the energy bar
  // sits at OAM index 0 on every $FFA7 == 0 frame and at index 6 of 11 (level
  // 1) or 8 of 12 (level 9) on every $FFA7 == 1 frame, alternating frame by
  // frame with nothing else about the scene changing.
  Object.defineProperty(state.video, 'frameParity', {
    enumerable: true,
    get: () => state.parity & 1,
    set: (v) => { state.parity = v & 1; },
  });

  return state;
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
