// The level-1/2 water-surface subsystem.  ROM: sub_00_2CBE -> loc_00_2D3D.
//
// sub_00_2CBE ($05C6, between the player update and the OBJ tile stream) is
// the per-level "special subsystem" dispatcher. Levels 1 and 2 share the water
// body: a 16-bit surface level in $C70A/$C70B that rises and falls between
// rows $16 and $1F, drawn by the WINDOW layer (whose Y it computes per frame
// into $C755/$FFAC). It is the only thing in the game that arms the player's
// water slow mode $FF95 -- touching a water CELL never does (collision.js).
//
// The SAME branch also owns the levels-1/2 ENEMY RESPAWNER ($2D3D-$2D5C): the
// two sewer enemies that emerge from the wall holes at columns $27/$2B live in
// slots 6/7, OUTSIDE the level's spawn blob -- 5:$46EC gives level 1 six
// records and level 2 three, and loc_00_28DD zero-fills the remainder of the
// eight -- and are refilled from ROM templates every time they die. See
// enemyRespawnTick below: $2D3D is the branch's ENTRY, and the water code at
// $2D5D is its fall-through.
//
// This is what the l1-water-spouts regression called "an enemy hit the port
// does not reproduce": at the frame the surface reaches the player's row while
// $C714 is zero, the player takes 1 damage and a $5A knockback stamp from
// $2E8D -- no enemy involved.
//
// The window layer IS the water, and renderer.js draws it. What it draws comes
// from buildWindowMap() below -- built from ROM data, not captured.
//
// Not modelled here, deliberately:
//  - the burst effect at the waterfall trigger ($2D82-$2D98, $C744 pool) --
//    the effect pool is not modelled (same stance as the enemy-death burst).

import { u8, u16, setMapCell } from './state.js';
import { decodeTileBuf } from './assets.js';
import { runVramScript } from './vramscript.js';
import { updateSubsystem } from './conveyor.js';
import { spawnEffect } from './doors.js';

/** Decode one base64 blob from the manifest. */
function b64(s) {
  const bin = typeof atob === 'function'
    ? atob(s) : Buffer.from(s, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * Build the WINDOW tilemap, $9C00-$9FFF.  ROM: loc_00_04BB, every level.
 *
 * This replaces the `map` half of assets/water.json, and the project's own
 * notes had the ingredient wrong. The `$0E24` script is NOT it: `$0DD9` reads
 * `CP $0E / JP NZ, loc_00_0E74`, so that arm runs on level 14 and nowhere
 * else -- measured, tools/oracle/waterbuild.py aborts if $0E24 fires on any
 * other level. The universal pair is three instructions apart inside level
 * init itself:
 *
 *   $04C9  LD HL,$9C40 / LD BC,$03C0   960 cells of tile $01
 *   $04D7  LD DE,$32A3 -> sub_00_0A0E  rows 0 and 1, 20 cells each
 *
 * So the surface is `$E0 $E2` repeated across row 0 and `$E1 $E3` across row 1,
 * and everything below is the flat fill -- which is why the export snapshot,
 * taken at level init, shows only tile $01 for the body and nothing for the
 * two rows the script writes after it.
 *
 * $9C14-$9C1F and $9C34-$9C3F are written by NEITHER the fill nor the script.
 * They keep the $2F that the boot clear at $0223 left, which `spec.boot`
 * carries; they sit off the right edge of the 20-tile-wide window and are
 * never drawn, but they are part of the byte-exact image.
 */
export function buildWindowMap(spec, level) {
  const map = new Uint8Array(0x400);
  map.fill(spec.boot);                                     // $0223
  const at = spec.fillDest - 0x9C00;
  map.fill(spec.fill, at, at + spec.fillLen);              // $04C9
  runVramScript(map, b64(spec.script), { base: 0x9C00 });  // $04D7
  // $0E0C/$0E24: level 14 refills the top two rows and repaints them.
  if (level === 14 && spec.level14) {
    const l = spec.level14;
    const a = l.fillDest - 0x9C00;
    map.fill(l.fill, a, a + l.fillLen);
    runVramScript(map, b64(l.script), { base: 0x9C00 });
  }
  return map;
}

/**
 * loc_00_3127's three cursors, or null where the level has no animation.
 * ROM: $0523-$0529 zero $C70F/$C710/$C711 at level init.
 *
 * `table` is manifest.tileAnim whole -- the per-level tables resolved out of
 * the ROM by tools/oracle/animtables.py, keyed by level number:
 *
 *   dests[]   0:$31EE -> a destination table; index is $C710 + $C711*2
 *   blocks[]  2:$61A4 -> 32-byte tile pairs; index is $C70F*2 + $C710
 *   steps[]   0:$3246 -> the $C711 to adopt at each $C70F, and its LENGTH is
 *                        0:$3295, the value $C70F wraps at
 *
 * Level 6 is the one special case ($3142-$3154): $FFC9 == 1 swaps the SOURCE
 * table for 2:$625E (manifest key '6alt'), and $FFC9 == 0 disables the
 * streamer entirely.
 */
export function createTileAnim(table, level) {
  if (!table) return null;
  // Every level's entry is resolved up front, but which one is USED is decided
  // per frame -- see tileAnimSpec.
  const has = table[String(level)] || (level === 6 && table['6alt']);
  return has ? { table, level, step: 0, half: 0, group: 0 } : null;
}

/**
 * Which table this FRAME uses.  ROM: $3142-$3167.
 *
 * Level 6 alone consults $FFC9, and it does so every frame, not at level init:
 * `$0F0F` zeroes it during the level-6 load and loc_00_2F00's conveyor rewrites
 * it at $05C6, one call before the streamer at $05C9. So caching the choice at
 * init picks the level's zero and animates nothing -- measured, $FFC9 is 2 on
 * every one of level 6's first 121 gameplay frames.
 *
 *   0 -> no animation at all this frame, and the cursors do NOT advance ($3169
 *        returns before $3174)
 *   1 -> the alternate source table 2:$625E ($3151)
 *   2 -> the ordinary 2:$61A4 row, same as every other level
 */
export function tileAnimSpec(a, conveyorDir) {
  if (a.level === 6) {
    if (conveyorDir === 0) return null;                    // $314B
    if (conveyorDir === 1) return a.table['6alt'] || null;  // $3151
  }
  return a.table[String(a.level)] || null;
}

/**
 * Point a level at its window map and its animated tiles.
 * Replaces applyWaterArt(); one call, from initLevel.
 */
export function applyLevelArt(state, manifest, level) {
  state.video.windowMap = manifest.window
    ? buildWindowMap(manifest.window, level) : null;
  // The window's transparency dither belongs to the WATER, not to the window:
  // it is the levels-1/2 water body, not "this level has a window map".
  // Other window users (the options panel) need it opaque.
  state.video.windowDither = level === 1 || level === 2;
  state.tileAnim = createTileAnim(manifest.tileAnim, level);
}

/* ---------------------------------------------------------------------------
 * COMPATIBILITY SHIMS. src/level.js and src/main.js still call the three names
 * the capture used, and they belong to another agent. They now do the built
 * thing; the three call sites simplify to
 *
 *   level.js  applyLevelArt(state, manifest, n);   // drops loadWaterArt and
 *                                                  // its two module globals
 *   main.js   tickTileAnim(state);                 // and MOVE it to just after
 *                                                  // streamPlayerTiles, since
 *                                                  // loc_00_3127 is the TAIL
 *                                                  // of sub_00_2C13, not a
 *                                                  // separate call
 * ------------------------------------------------------------------------- */

/** @deprecated call applyLevelArt(state, manifest, level) instead. */
export async function loadWaterArt() {
  const { loadManifest } = await import('./assets.js');
  const manifest = await loadManifest();
  const out = {};
  for (let n = 1; n <= 14; n++) out[String(n)] = { manifest, level: n };
  return out;
}

/** @deprecated call applyLevelArt(state, manifest, level) instead. */
export function applyWaterArt(state, entry) {
  if (!entry) {
    state.video.windowMap = null;
    state.video.windowDither = false;
    state.tileAnim = null;
    return;
  }
  applyLevelArt(state, entry.manifest, entry.level);
}

/** @deprecated call tickTileAnim(state) instead. */
export function tickWaterArt(state) {
  tickTileAnim(state);
}

/** $9740 -> BG tile $74, $8E00 -> $E0. The inverse of assets.js bgTileAddr. */
function bgTileId(addr) {
  return addr >= 0x9000 ? (addr - 0x9000) >> 4 : 0x80 + ((addr - 0x8800) >> 4);
}

/**
 * One frame of the animated-tile streamer.  ROM: loc_00_3127, reached as the
 * TAIL of sub_00_2C13 ($05C9) -- both of that routine's exits `JP loc_00_3127`,
 * so it runs after the player's own tile stream, every frame.
 *
 * The cartridge stages 32 bytes (two consecutive tiles) at $C5CB and arms the
 * VBlank write queue $FF9B/$FF9C, which $074E drains into VRAM. The port has
 * no VBlank, so the block is applied here -- and that is not a shortcut being
 * waved through: $312C's `LDH A,[$FF9B] / RET NZ` would stall the streamer on
 * any frame the queue had not been drained, and the drain is itself pre-empted
 * by the $C61B WRAM script and the $C130 tilemap queue ($0714/$0727 both jump
 * past it). MEASURED over 1400 gameplay frames across all ten levels that
 * animate: zero stalls, zero pre-emptions, one block per frame with no gaps.
 *
 * The 32 bytes go straight into the level's decoded tile cache, which is
 * exactly where the streamer puts them on hardware. Background and window both
 * pick them up with no per-pixel work and no special case in the renderer --
 * the falling water animates because its metatiles point at tiles $74-$7B.
 * The cache is rebuilt by initLevel for every level, so the patch cannot leak.
 */
export function tickTileAnim(state) {
  const a = state.tileAnim;
  if (!a) return;
  if (state.flow.paused) return;                    // $3127: $C716
  const spec = tileAnimSpec(a, state.flow.conveyorDir);
  if (!spec) return;                                // $3169, cursors untouched
  const bg = state.level.tiles && state.level.tiles.bg;
  if (!bg) return;

  const { dest, block } = tileAnimWrite(a, spec);
  const id = bgTileId(dest);
  bg[id & 0xFF] = decodeTileBuf(block, 0);
  bg[(id + 1) & 0xFF] = decodeTileBuf(block, 16);
  advanceTileAnim(a, spec);
}

/**
 * What this frame's cursors name.  ROM: $3174-$3180 for the source and
 * $31A5-$31AE for the destination.
 *
 * Note the cursors swap roles between the two -- the source strides by STEP
 * ($C70F*4 + $C710*2 over words) and the destination by GROUP ($C710*2 +
 * $C711*4). Reading either index off the other produces a plausible animation
 * on the wrong tiles.
 */
export function tileAnimWrite(a, spec) {
  if (!spec.decoded) spec.decoded = spec.blocks.map(b64);
  return { dest: spec.dests[a.half + a.group * 2],
           block: spec.decoded[a.step * 2 + a.half] };
}

/**
 * ROM: $31B5-$31EA. $C710 counts 0,1; on its wrap $C70F advances (wrapping at
 * steps.length, which is the 0:$3295 byte) and $C711 is reloaded from
 * steps[$C70F] -- the NEW $C70F, not the old one.
 */
export function advanceTileAnim(a, spec) {
  if (a.half + 1 < 2) {                             // $31B9: CP 2 / JR C
    a.half += 1;
    return;
  }
  a.half = 0;
  a.step = a.step + 1 < spec.steps.length ? a.step + 1 : 0;   // $31CC
  a.group = spec.steps[a.step];                     // $31E5
}

/**
 * Replay `frames` frames of the streamer straight into a raw $8000-$9FFF
 * image, for tools/oracle/waterdiff.mjs. Uses the same two helpers the shipped
 * path does, so the two cannot drift apart.
 */
export function replayTileAnim(vram, spec, frames) {
  const a = { step: 0, half: 0, group: 0 };
  for (let f = 0; f < frames; f++) {
    const { dest, block } = tileAnimWrite(a, spec);
    vram.set(block, dest - 0x8000);
    advanceTileAnim(a, spec);
  }
  return vram;
}

/**
 * $C70A-$C70D, $C713, $C755 and the $C6EF splash pool (4 x {timer, x}).
 * Everything level-init clears lives here; level.js resets it via
 * createWater() (ROM: $04FD/$0503 clear $C70D/$C713, $0534-$053F seed
 * $C70A=$1F, $C70B=$C70C=0).
 */
export function createWater() {
  return {
    level: 0x1F00,   // $C70A/$C70B  surface Y, 12.4-ish (hi = world row)
    packed: 0,       // $C70C  surface Y in 16-subpx units (enemy compare)
    phase: 0,        // $C70D  0 idle/stamping, 1 rising, 2 falling, $FF parked
    stampStep: 0,    // $C713  waterfall column stamp cursor (0 = untriggered)
    windowY: 0,      // $C755  window-line latch (boot RAM clear leaves it 0)
    splashes: Array.from({ length: 4 }, () => ({ timer: 0, x: 0 })),  // $C6EF
  };
}

/**
 * The two respawning sewer enemies' 32-byte records, bank-0 fixed data at
 * 0:$32F8 (slot 6, column $2B) and 0:$32D8 (slot 7, column $27).
 *
 * Read from the manifest, NOT inlined here: these are verbatim cartridge bytes,
 * and nothing ROM-derived is committed (see .gitignore's header). Every other
 * ROM table in the port travels the same way -- slopeY, objectScripts, the
 * title tile blobs.
 *
 * Both records are state $0C (dormant shell) with flags $0A -- attack bit 3
 * plus falling bit 1 -- and a $1F attack timer, so activation runs the state-12
 * hit-dispatch arm (jt_01_637F): $1F frames of the emerge pose, then a fall to
 * the sewer floor, the landing animation, and the wake to a state-1 walker.
 *
 * The pose is metasprites $94 then $95, from the row at 1:$69E3 -- 1:$691B is
 * the POINTER table those arrive through (1:$5F85 computes $691B + (state-1)*2,
 * so state $0C lands on $6931 -> $69E3), not the row itself. And the record does
 * not move during the emerge: x/y are pinned until the fall begins, so it is a
 * pose change rather than a crawl.
 *
 * All of that machinery was already ported in enemies.js; what was missing was
 * these records ever existing.
 */
const respawnTemplate = (state, i) => state.tables?.respawnEnemies?.[i];

/**
 * ROM: loc_00_0EC3 (inside sub_00_0D50, level init, levels 1-2 arm only).
 * Slots 6/7 are zero-filled by the blob load (loc_00_28DD), then this stamps
 * $40 -- the dead latch -- into both flag bytes, which is what makes the
 * frame-1 respawn check below fill them for the first time. Measured with a
 * PC-bracket probe: flags are 00 after sub_00_2889 and 40/40 by $055D.
 */
export function armEnemyRespawn(state) {
  const n = state.level.number;
  if (n !== 1 && n !== 2) return;                   // $0E76/$0E7A
  state.enemies[6][0] = 0x40;                       // $0EC5
  state.enemies[7][0] = 0x40;                       // $0EC8
}

/**
 * ROM: loc_00_2D3D-$2D5C, the head of the levels-1/2 branch, EVERY frame
 * (both parities -- the $FFB1 test comes after). One slot per frame, slot 6
 * first: only if slot 6 does NOT need a refill is slot 7 even looked at. Bit
 * 6 is the dead latch (kill, fell out of the world, or the init arm above),
 * so a killed sewer enemy is whole again on the very next frame -- dormant in
 * its hole, waiting for the camera window. Infinite respawns, by design.
 */
export function enemyRespawnTick(state) {
  const slot = (state.enemies[6][0] & 0x40) ? 6      // $2D40
    : (state.enemies[7][0] & 0x40) ? 7               // $2D4E
    : -1;                                            // $2D50: JR Z, neither
  if (slot < 0) return;

  // Fail loudly. Skipping the refill when the templates are missing would
  // leave the latch armed forever and the two sewer enemies simply never
  // appearing -- which is exactly the bug this routine exists to fix, and
  // indistinguishable from it never having been ported.
  const t = respawnTemplate(state, slot - 6);
  if (!t) {
    throw new Error('tables.respawnEnemies is missing - re-run '
      + 'tools/export_assets.py');
  }
  state.enemies[slot].set(t);        // $2D44 / $2D52: DE = $32F8 / $32D8
}

/**
 * The waterfall column stamped into the map when the player first passes
 * column $36: {col, worldRow, graphic, collision}, one cell per (even) frame.
 * ROM: table 0:$2DDC. Row $19 col $38 and rows $1D/$1E are stamped SOLID;
 * only the middle of the column is water.
 */
const STAMPS = [
  [0x38, 0x19, 0x48, 0x01],
  [0x37, 0x19, 0x49, 0x08],
  [0x37, 0x1A, 0x47, 0x08],
  [0x37, 0x1B, 0x47, 0x08],
  [0x37, 0x1C, 0x47, 0x08],
  [0x37, 0x1D, 0x47, 0x01],
  [0x37, 0x1E, 0x47, 0x01],
];

/**
 * ROM: loc_00_2D3D (via sub_00_2CBE). Call order matters: after the player
 * update, before the batarangs and enemies, exactly the $05C6 slot.
 */
export function updateWater(state) {
  if (state.flow.paused) return;                    // $2CBE: $C716
  const lvl = state.level.number;
  // $2CC3-$2CE9: the dispatch. Levels 1/2 fall through into the water body
  // below; every other level has its own subsystem in src/conveyor.js, and
  // the "no branch" case is itself a branch (the boss levels' rescue drop).
  if (lvl !== 1 && lvl !== 2) return updateSubsystem(state);
  const w = state.water;

  // $2D3D: the enemy respawner runs BEFORE the parity test -- every frame.
  enemyRespawnTick(state);

  // $2D5D: the logic runs on EVEN $FFB1 frames only; odd frames just park the
  // window register off-screen ($FFAC=$90, NOT the $C755 latch) -- the water
  // body is drawn at 30 Hz, which is its transparency dither. The port keeps
  // only the $C755 latch (windowY); the odd-frame $FFAC write becomes real
  // when the renderer grows a window layer. state.frame carries the $FFB1
  // boot phase (level.js seeds $6D), so the raw parity test is faithful.
  if ((state.frame & 1) !== 0) {                    // $2D63
    state.video.windowY = 0x90;                     // $2D65: window OFF
    return;
  }
  state.video.windowOn = true;

  if (w.phase === 0) {                              // $2D68
    if (w.stampStep === 0) {                        // $2D6F: $C713
      if ((state.player.x >> 8) < 0x36) return tail(state, w);   // $2D77
      requestSound(state, 0x17);                    // $2D7C
      // $2D82-$2D98: the crash at the waterfall's base, at the fixed world
      // point ($3880, $1980) the three literal stores build -- $C744/$C745 the
      // X pair and $C746/$C747 the Y pair, both low bytes taken from the one
      // $80 at $2D8C. $97/$01, so it asks for cue $17 a SECOND time on its
      // first tick. MEASURED (cuediff l1-water-spouts): the cartridge fires
      // $17 twice, at f1 from $2D7F and f2 from $13E9; the port fired once.
      spawnEffect(state, 0x3880, 0x1980, 0x97, 0x01);   // $2D94-$2D98
      w.stampStep = 1;                              // $2D9B
      return stampTick(state, w);                   // falls into loc_00_2DA0
    }
    return stampTick(state, w);                     // $2DA0
  }
  if (w.phase === 1) {                              // $2DF8 != 2, != $FF
    w.level = u16(w.level - 8);                     // $2E00: BC = $FFF8
    if (w.level >> 8 < 0x16) w.phase = 2;           // $2E0C
    return tail(state, w);
  }
  if (w.phase === 2) {                              // $2E17
    w.level = u16(w.level + 8);
    if (w.level >> 8 >= 0x1F) {                     // $2E23
      // $2E27: whether the cycle repeats is decided at the BOTTOM of each
      // fall, from where the player is standing right then: past column $5A
      // the water parks at $1F00 forever.
      w.phase = (state.player.x >> 8) < 0x5A ? 1 : 0xFF;   // $2E31 / $2E2D
    }
    return tail(state, w);
  }
  return tail(state, w);                            // $2DFC: phase $FF
}

/**
 * ROM: loc_00_2DA0-$2DDB. One waterfall cell per even frame, graphic AND
 * collision, plus the VRAM queue (the port renderer reads the map directly).
 * Quirk kept: these frames RETURN without running the tail -- no window-Y
 * update, no player check, no enemy sweep -- so the surface state freezes for
 * the 14 frames the column takes to build.
 */
function stampTick(state, w) {
  const [col, row, graphic, coll] = STAMPS[w.stampStep - 1];
  setMapCell(state, col, row, graphic, coll);       // sub_00_11B9 + $11D9/$11F1
  if (w.stampStep + 1 >= 8) {                       // $2DC9-$2DCF
    // $2DD1: the LAST stamp frame flips to phase 1 -- $C713 keeps 7, is never
    // stored as 8 -- and falls into the tail, unlike frames 1-6 which RET at
    // $2DDB without window-Y, the player check or the enemy sweep.
    w.phase = 1;
    return tail(state, w);
  }
  w.stampStep++;                                    // $2DD8
  // $2DDB: RET -- deliberately NOT tail(state, w).
}

/** ROM: loc_00_2E36-$2EF3 -- window Y, the player check, the enemy sweep. */
function tail(state, w) {
  const p = state.player;

  // $2E36-$2E68: window Y = (surface - camY) px, clamped to the screen. The
  // overflow arm distinguishes "surface far below the view" ($90, window off)
  // from "camera fully below the surface" (0, window covers everything).
  const d = u16(w.level - state.camera.y);
  const a = (d << 4 >> 8) & 0xFF;                   // 4x SLA E / RLA
  if (a < 0x90) w.windowY = a;                      // $2E53
  else w.windowY = (state.camera.y >> 8) < (w.level >> 8) ? 0x90 : 0;  // $2E57
  // $2E65/$2E68 store to BOTH $C755 (the latch other code reads) and $FFAC
  // (the shadow the VBlank handler pushes to rWY at $080D). Only even frames
  // reach here, and odd frames park $FFAC at $90 -- so the water body is drawn
  // every OTHER frame. That 30 Hz strobe is not a bug: on a DMG's slow LCD it
  // reads as a translucent wash over the level behind it, and it is the only
  // transparency the hardware can do.
  state.video.windowY = w.windowY;                  // $2E68
  // The renderer draws from the LATCH, not the register, so the surface holds
  // its position through the odd frames when the register is parked at $90.
  state.video.windowLatchY = w.windowY;

  // $2E6A: player row vs surface row, HIGH BYTES only.
  const prow = p.y >> 8;
  const wrow = w.level >> 8;
  if (prow < wrow) {                                // $2E71: above -- dry
    p.slowMode = 0;                                 // $2E99
  } else {
    // $2E73: on the EXACT surface row, and only while airborne, the entry
    // splash. Deeper rows never splash -- and never stop being "in water".
    if (prow === wrow && p.air !== 0) playerSplash(state, w);   // $2E75-$2E7A
    p.slowMode = 0x80;                              // $2E7D: $FF95
    // $2E81: the water only HURTS on difficulty 1+, and only once the
    // previous hit's invulnerability has fully expired.
    if (state.flow.difficulty !== 0 && p.iframes === 0) {   // $2E85 / $2E8B
      p.hp = Math.max(0, p.hp - 1);                 // $2E8D: sub_00_2777, B=1
      requestSound(state, 0x12);                    // $277F: the hurt sound
      p.iframes = 0x5A;                             // $2E92: knockback RIGHT,
    }                                               // always -- no facing test
  }

  // $2E9C: surface Y packed into one byte of 16-subpx units. Bit 4 of the row
  // is dropped by the AND $0F, which is what folds world rows $10-$1F onto
  // 0-$FF -- the whole playfield is the low half of the row space.
  w.packed = ((w.level >> 8) & 0x0F) << 4 | ((w.level & 0xFF) >> 4);

  // $2EB0: all 8 enemy slots, ascending (this sweep does NOT parity-alternate
  // like the driver). Below the surface = slow-fall (r[1] bit 1, the $F8
  // terminal in fallTail); crossing into the top row of water while moving
  // vertically splashes ONCE -- the bit doubles as the edge detector.
  for (let slot = 0; slot < 8; slot++) {
    const r = state.enemies[slot];
    if ((r[0] & 0x80) === 0) continue;              // $2EBB
    const ep = (r[0x10] & 0x0F) << 4 | (r[0x11] >> 4);      // $2EC7-$2ED2
    const diff = u8(ep - w.packed);                 // $2ED3
    if (ep < w.packed) {                            // $2ED4: carry -- above
      r[1] &= ~0x02;                                // $2EDA: RES 1
      continue;
    }
    if (diff < 0x10) enemySplash(state, w, r);      // $2EDE-$2EE3
    r[1] |= 0x02;                                   // $2EEB: SET 1
  }
}

/**
 * ROM: sub_01_7A83 -- the player's entry splash. Slot 0 of the $C6EF pool is
 * the player's alone; a still-running splash suppresses the new one AND its
 * sound.
 */
function playerSplash(state, w) {
  const s = w.splashes[0];
  if (s.timer !== 0) return;                        // $7A86
  requestSound(state, 0x25);                        // $7A89
  s.timer = 0x17;                                   // $7A8F
  s.x = state.player.x;                             // $FF81/$FF82
}

/**
 * ROM: sub_01_7A99 -- an enemy breaking the surface. Only while rising or
 * falling ($7A9E), and only on the frame the slow-fall bit is still clear
 * ($7AA1) -- the SET 1 that follows in the sweep makes this a one-shot.
 * Slots 1-3 only; slot 0 is reserved for the player.
 */
function enemySplash(state, w, r) {
  if ((r[0] & 0x03) === 0) return;                  // $7A9E
  if (r[1] & 0x02) return;                          // $7AA1
  for (let i = 1; i < 4; i++) {                     // $7AAA-$7ACF
    const s = w.splashes[i];
    if (s.timer !== 0) continue;
    s.timer = 0x17;                                 // $7ABB
    s.x = (r[0x0E] << 8) | r[0x0F];                 // $7ABE: world X
    requestSound(state, 0x25);                      // $7AC4
    return;
  }
}

/**
 * ROM: sub_01_7AD3 ($05EF, after the enemy driver) -- tick and draw the
 * splash pool. Metasprite $65/$66/$67 on (timer & $18) >> 3 (table 1:$7B31),
 * drawn at the water line ($C755 + $0C) through sub_00_0BAF -- the ALTERNATE
 * metasprite table, even on level 1. Slot order alternates with $FFA7 parity
 * like the enemy driver, which decides OAM order between two live splashes.
 * Draws are queued onto the enemy queue so drawEnemies() flushes them in ROM
 * OAM order.
 */
export function updateSplashes(state) {
  const lvl = state.level.number;
  if (lvl !== 1 && lvl !== 2) return;               // $7AD3
  const w = state.water;
  const descending = state.parity !== 0;            // $7ADC
  for (let n = 0; n < 4; n++) {
    const slot = descending ? 3 - n : n;
    const s = w.splashes[slot];
    if (s.timer === 0) continue;                    // $7AEE
    const sx = u8((u16(s.x - state.camera.x) >> 4) + 8);    // sub_00_1172
    s.timer = u8(s.timer - 1);                      // $7B01
    const id = [0x65, 0x66, 0x67][(s.timer & 0x18) >> 3] ?? 0x65;  // $7B31
    state.enemyDraws.push({ id, x: sx, y: u8(w.windowY + 0x0C),   // $7B13
                            attr: 0, alt: true });  // sub_00_0BAF = table2
  }
}

/** ROM: sub_00_0AE1 mailbox (same shape as enemies.js). */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
