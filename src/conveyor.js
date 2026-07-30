// The per-level subsystems of sub_00_2CBE, for every level except 1/2.
//
// sub_00_2CBE ($05C6, between the player update and the OBJ tile stream) is a
// dispatcher, not a routine. It reads $FFB0 and hands the frame to a different
// piece of machinery per level:
//
//   levels 1 / 2   loc_00_2D3D   the rising water body      -> src/water.js
//   level  6       loc_00_2EF4   the conveyor / parallax track
//   level  7       loc_00_2F5F   the map-object RESPAWNER (slots 4/5/6)
//   level  $0B     loc_00_2CED   the entrance freeze, and then $3050
//   level  $0C     loc_00_2FB7   the collapsing floor (table 1:$7BB4)
//   level  $0D     loc_00_301E   the one-shot spawn into slots 0/1/2
//   anything else  loc_00_3050   the rescue drop, iff the subtype $C73E != 0
//
// Read each of those from its ENTRY label, never from where the interesting
// code starts: that is the lesson the levels-1/2 branch taught (its entry is
// an enemy respawner that falls through into the water), and it repeats here.
// loc_00_2CED looks like a 20-instruction cutscene freeze with seven `RET`s;
// it has none. All seven exits are `JP loc_00_3050`, so the level-$0B branch
// is the freeze AND the rescue drop, and stopping at the freeze would have
// deleted the second half exactly the way the sewer enemies were deleted.
//
// MEASURED, all of it, with tools/oracle/subsystrace.py -- see the citations
// on each routine. Two findings worth carrying out of this file:
//
//  * loc_00_3050 is CHEAT-GATED. $C75C is written in exactly one place in the
//    whole ROM ($02CF), the title screen's B+SELECT+LEFT combo, so on a normal
//    boot the rescue drop is dead code. Measured 0 on every frame of every
//    level traced here. It is ported because it is the fall-through, not
//    because anything reaches it.
//  * levels 7 and $0D SPAWN MAP OBJECTS OF TYPE $0A. SAVEPOINT calls type $0A
//    "the last unported handler, and it is never placed in any level's spawn
//    data" -- true of the spawn blobs, and beside the point: these two
//    branches stamp it in at runtime. Measured: level 7 fills slots 4/5/6 on
//    frame 1, level $0D fills slots 0/1/2 the frame the player passes column
//    $50. jt_01_4765 is ported below as actorTypeA(), but src/actors.js's
//    dispatch has to route type $0A to it -- see the note on that function.

import { u8, u16, setMapCell } from './state.js';
import { spawnDrop } from './drops.js';
import { spawnEffect } from './doors.js';

/**
 * $FFC8, $C717, $C736, $C73B and the $C75B-$C762 rescue-drop block.
 *
 * Every one of these is cleared by level init ($050D-$0516 for $C736/$C73B,
 * $0EAB for $C717, sub_00_29C3 for $C75B) EXCEPT $FFC8, which no init path
 * writes at all -- loc_00_2EF4 is its only writer in the entire ROM, so its
 * value survives from level to level and only a boot clears it. Kept in the
 * same object anyway; nothing but level 6 ever reads it, and level 6 always
 * re-derives it from the player's column on the frame it matters.
 */
export function createSubsys() {
  return {
    park: 0,        // $FFC8  0 chase the player, 1 parked low, 2 parked high
    seqTimer: 0,    // $C717  level $0B's 240-frame freeze; $FF = spent
    cursor: 0,      // $C736  level $0C's cell cursor / level $0D's one-shot
    respawns: 0,    // $C73B  level 7's ten-shot counter
    rescue: {       // loc_00_3050
      state: 0,     // $C75B  0 idle, 1 flying, $FF spent
      prevCol: 0,   // $C75D
      x: 0,         // $C75E/$C75F
      y: 0,         // $C760/$C761
      vy: 0,        // $C762  a countdown, NOT a velocity -- see rescueDrop()
    },
  };
}

/** Lazily attach the block, so a state built before level.js wires it works. */
function subsys(state) {
  if (!state.subsys) state.subsys = createSubsys();
  return state.subsys;
}

/**
 * ROM: sub_00_2CBE ($05C6) minus the levels-1/2 arm, which src/water.js owns
 * and calls this from. The $C716 pause test and the level dispatch itself are
 * up there; this is everything from $2CC5 onwards.
 */
export function updateSubsystem(state) {
  const n = state.level.number;
  if (n === 6) return level6Track(state);           // $2CCD
  if (n === 7) return level7Respawn(state);         // $2CD2
  if (n === 0x0B) return level11Entrance(state);    // $2CD7
  if (n === 0x0C) return level12Floor(state);       // $2CDB
  if (n === 0x0D) return level13Spawn(state);       // $2CE0
  // $2CE5: every other level runs the rescue drop, and only if it has a boss.
  // $C73E is the level subtype's low nibble, which is non-zero on exactly the
  // four boss levels (4, 8, $0B, $0E) -- and $333B, the entry-height table
  // loc_00_3050 indexes with $C73E-1, is exactly four bytes long. That is the
  // check that the "default" arm is really the boss arm.
  if (state.level.bossId !== 0) rescueDrop(state);  // $2CE9
}

// ---------------------------------------------------------------------------
// Level 6 -- loc_00_2EF4: the conveyor track.
// ---------------------------------------------------------------------------

/**
 * A 16-bit "track" position in $FFCA/$FFCB whose HIGH byte is a world column,
 * plus a direction byte in $FFC9. Three consumers, and they are why this is
 * the branch worth doing first:
 *
 *   1:$483F  the type-$0B conveyor DECK copies the track into its own X, so
 *            the whole platform physically rides it (src/actors.js).
 *   1:$4877  the same handler reads $FFC9 and shoves a standing player 8
 *            subpixels a frame in that direction -- the conveyor's carry.
 *   1:$577A  enemy state 5 slaves its X to the track as well.
 *   0:$3148  the animated-tile streamer picks a DIFFERENT tile table on
 *            level 6 depending on $FFC9 (2:$625E when the track runs right).
 *   0:$088A  $FFCC, computed at the tail, is pushed to rSCX by the STAT
 *            handler at LYC $22 -- the track's parallax band.
 *
 * The motion is a chase, not an oscillation, and that took measuring to see.
 * With $FFC8 == 0 the branch compares the track's high byte against the
 * PLAYER'S COLUMN ($FF81) and walks 8 subpixels a frame toward it, then stops
 * dead when they are equal. MEASURED (level 6, idle, 240 frames): $FFCA starts
 * at $07 (level init, $0F08), the player stands at column $01, and the track
 * counts $06F8, $06F0 ... $01F8 at 8 per frame and then holds $01F8 forever
 * with $FFC9 still 2 and $FFC8 still 0. It never reaches the $2F40 limit arm
 * at all in that run.
 *
 * The limit arms exist for when it does: running up past column $07 parks it
 * with $FFC8 = 2 and running down onto column $01 parks it with $FFC8 = 1,
 * and a parked track ignores the player and ping-pongs between the two.
 * $FFC9 is zeroed on the parking frame ONLY -- the "equal to the player"
 * stop at $2F48 leaves the last direction standing, which is why the measured
 * run sits at rest reporting direction 2.
 */
function level6Track(state) {
  const s = subsys(state);
  // $2EF4: the whole walk is gated on $C740 == $FF. On the cartridge that is
  // the value level init writes ($0DC8) and the boss-death latch clears to
  // $FE; the port carries the same byte as flow.levelCleared, inverted (0 =
  // the ROM's $FF), because main.js consumes it as a clear REQUEST.
  // (Truthiness, not `=== 0`: createState() does not define the field -- only
  // initLevel does -- and an undefined one must read as "live", the way
  // level.bossId defaults to 0 for exactly the same reason.)
  if (!state.flow.levelCleared) {
    if (s.park === 1) trackUp(state, s);            // $2EFF
    else if (s.park === 2) trackDown(state, s);     // $2F03
    else {
      const trackHi = (state.flow.parallaxTrack >> 8) & 0xFF;   // $2F05
      const col = (state.player.x >> 8) & 0xFF;                 // $2F08
      if (col === trackHi) {
        s.park = 0;                                 // $2F48: arrived, dir kept
      } else if (col < trackHi) {
        s.park = 0;                                 // $2F23
        trackDown(state, s);                        // falls into $2F26
      } else {
        s.park = 0;                                 // $2F0F
        trackUp(state, s);                          // falls into $2F12
      }
    }
  }

  // $2F4B: the parallax output, computed EVERY frame -- the $2EF9 skip jumps
  // straight here, so a cleared level still scrolls its band.
  const d = u16(state.flow.parallaxTrack - state.camera.x);    // sub_00_1172
  const hi = ((d << 4) >> 8) & 0xFF;               // 4x SLA C / RLA
  const sx = u8(hi + 8);                           // $118B: ADD A,$08
  state.flow.parallaxScx = u8(-u8(sx - 8));        // $2F57: SUB $08 / CPL / INC
}

/** $2F12: toward higher columns. B = 2, so the far limit parks with $FFC8 = 2. */
function trackUp(state, s) {
  state.flow.conveyorDir = 1;                       // $2F14
  if (((state.flow.parallaxTrack >> 8) & 0xFF) >= 0x07) {      // $2F1A
    s.park = 2;                                     // $2F41
    state.flow.conveyorDir = 0;                     // $2F44
    return;
  }
  state.flow.parallaxTrack = u16(state.flow.parallaxTrack + 8);   // $2F1E/$2F35
}

/** $2F26: toward lower columns. B = 1, so the near limit parks with $FFC8 = 1. */
function trackDown(state, s) {
  state.flow.conveyorDir = 2;                       // $2F28
  if (((state.flow.parallaxTrack >> 8) & 0xFF) === 0x01) {      // $2F2E
    s.park = 1;                                     // $2F41
    state.flow.conveyorDir = 0;                     // $2F44
    return;
  }
  state.flow.parallaxTrack = u16(state.flow.parallaxTrack - 8);   // $2F32/$2F35
}

// ---------------------------------------------------------------------------
// Level 7 -- loc_00_2F5F: the map-object respawner.
// ---------------------------------------------------------------------------

/**
 * The same shape as the levels-1/2 sewer-enemy respawner, one array over:
 * three 16-byte $C1E8 records that are refilled the moment all three are
 * free, up to ten times ($C73B).
 *
 * The gate is ALL THREE, not each: $2F68/$2F6E/$2F74 return on the first
 * occupied slot, so the trio refills as a set. Level 7's own object blob is
 * two records long (slots 0 and 1), which leaves 4/5/6 zero-filled by
 * loc_00_28DD -- so the very first gameplay frame already qualifies.
 * MEASURED: at frame 1, $C73B is 1 and slots 4/5/6 hold 5:$4FB0/$4FC0/$4FD0
 * verbatim, three type-$0A records at columns $17/$1A/$1D row $12.
 *
 * The bank switch either side ($2F77 to bank 5, $2F9C back to bank 1) is a
 * cartridge concern; the templates travel through the manifest instead.
 */
function level7Respawn(state) {
  const s = subsys(state);
  if (s.respawns >= 0x0A) return;                   // $2F62: RET NC
  for (const slot of [4, 5, 6]) {
    if (state.actors[slot][0] !== 0) return;        // $2F68 / $2F6E / $2F74
  }
  const t = state.tables?.subsysObjects?.level7;
  if (!t || t.length !== 3) {
    // Loud, for the same reason the sewer templates are: silently skipping
    // leaves level 7 permanently missing three objects, which is exactly the
    // bug this routine exists to fix and indistinguishable from it.
    throw new Error('tables.subsysObjects.level7 is missing - re-run '
      + 'tools/export_assets.py');
  }
  for (let i = 0; i < 3; i++) state.actors[4 + i].set(t[i]);   // sub_00_2FAE
  s.respawns = u8(s.respawns + 1);                  // $2FA9
}

// ---------------------------------------------------------------------------
// Level $0B -- loc_00_2CED: the entrance freeze.
// ---------------------------------------------------------------------------

/**
 * Stand on exactly (column $0B, row $17) and the game takes the controls away
 * for 240 frames. It is not a cutscene routine with its own loop -- it plants
 * one flag and lets the player update do the rest.
 *
 * The flag is $C751, which the port already carries as player.springArmed
 * because the SAME byte makes the next jump use the $32 velocity instead of
 * $22 ($1A43). That double duty is not a coincidence to paper over: while it
 * is set, $1820 sends the whole directional-input path into the friction arm,
 * so the player cannot walk -- and $1A54 clears it on the jump that spends it,
 * which is the only way out of the freeze early.
 *
 * MEASURED (level 11, "20:,480:R"): the player walks right and lands on
 * ($0B, $17) at frame 197 -- the row test is the HIGH byte only, and the
 * measured Y was $1741. $C717 latches $F0 and counts down one per frame to 1
 * at f436; at f437 it becomes $FF and $C751 clears, and the player walks off.
 * Position, velocity and facing hold for all 240 frames.
 *
 * $C717 = $FF is a permanent "spent" mark, but it is not exclusive to this
 * routine: $17E4 also writes it when the player dies, so a death re-arms
 * nothing and the entrance is a once-per-life event. And $C717 is zero at
 * gameplay start because level init clears it ($0EAB) after using it as the
 * column streamer's own loop counter ($10D3).
 */
function level11Entrance(state) {
  const s = subsys(state);
  const p = state.player;
  if (s.seqTimer === 0xFF) return rescueDrop(state);          // $2CF0
  if (p.springArmed !== 0) {                                  // $2CF5
    s.seqTimer = u8(s.seqTimer - 1);                          // $2D2B
    if (s.seqTimer === 0) {                                   // $2D2F
      p.springArmed = 0;                                      // $2D32: A is 0
      s.seqTimer = 0xFF;                                      // $2D37
    }
    return rescueDrop(state);                                 // $2D3A
  }
  if (((p.x >> 8) & 0xFF) !== 0x0B) return rescueDrop(state); // $2CFD
  if (((p.y >> 8) & 0xFF) !== 0x17) return rescueDrop(state); // $2D04
  p.springArmed = 1;                                          // $2D0B
  p.facing = 1;                                               // $2D0E: $FF88
  p.air = 0;                                                  // $2D11
  p.vy = 0;                                                   // $2D13
  p.vx = 0;                                                   // $2D15
  p.clingLock = 0;                                            // $2D17: $FFB2
  p.attackTimer = 0;                                          // $2D19: $FF97
  p.action = 0;                                               // $2D1B: $C71E
  p.squatTimer = 0;                                           // $2D1E: $FF90
  s.seqTimer = 0xF0;                                          // $2D22
  return rescueDrop(state);                                   // $2D25
}

// ---------------------------------------------------------------------------
// Level $0C -- loc_00_2FB7: the collapsing floor.
// ---------------------------------------------------------------------------

/**
 * 72 map cells erased one per frame, in a scrambled order that is a table
 * (1:$7BB4), not a sweep: {$0B,$15}, {$04,$15}, {$09,$15}, {$06,$15} ... The
 * columns are 3-$0E and the rows $15-$1F, i.e. the twelve-column floor the
 * player is standing on, dissolving under him in a deliberately random-looking
 * pattern.
 *
 * Two gates, and the first one is the interesting one:
 *
 *   $2FB7  |camX_hi + 5 - playerCol| >= 6 stops the whole thing. That is the
 *          screen CENTRE against the player, so the floor only crumbles while
 *          the player is roughly in the middle of the view. Walk backwards
 *          into the left of the screen and it pauses.
 *   $2FCC  before it ever starts, the player must have reached column $06.
 *
 * MEASURED ("40:,260:R"): the cursor arms at frame 99 (column $06), then runs
 * 1..72 on consecutive frames 99-170 with no stall at all, and latches $FF at
 * f171. The player's Y leaves $1400 at f104 and he is at $1B00 by f166 -- he
 * falls through the floor he was standing on, which is the point.
 *
 * The burst at $2FF9 is the $C693 effect pool, and it is not decoration: with
 * one spawn per erased cell the pool RUNS FULL. MEASURED (tools/oracle/
 * oamwho.py, level 12 frame 121): ten pool draw calls fill shadow OAM entries
 * 0-19 ahead of the player, the cartridge's OAM hits 40/40, and the cap drops
 * the HUD's fifth sprite. The port drew none of it -- 550 px wrong across rows
 * 80-94 -- and cuediff l12-shooter-approach counted 33 $17 cues on the
 * cartridge against 0 here.
 */
function level12Floor(state) {
  const s = subsys(state);
  const col = (state.player.x >> 8) & 0xFF;                   // $2FB7
  const centre = u8(((state.camera.x >> 8) & 0xFF) + 5);      // $2FBC
  // $2FBE-$2FC2: SUB then CPL/INC on borrow -- a byte absolute difference.
  const away = centre >= col ? centre - col : u8(u8(~u8(centre - col)) + 1);
  if (away >= 0x06) return;                                   // $2FC3: RET NC

  if (s.cursor === 0) {                                       // $2FC9
    if (col < 0x06) return;                                   // $2FD0: RET C
    s.cursor = 1;                                             // $2FD3
    return;                                                   // $2FD6: and the
  }                                                           // first cell is
  if (s.cursor === 0xFF) return;                              // $2FD9: spent

  const t = state.tables?.collapseCells;
  if (!t || t.length < 0x48 * 2) {
    throw new Error('tables.collapseCells is missing - re-run '
      + 'tools/export_assets.py');
  }
  const i = (s.cursor - 1) * 2;                               // $2FDA: DEC/ADD
  const c = t[i];                                             // $2FE3: $C744
  const r = t[i + 1];                                         // $2FE8: $C746
  // $2FED-$2FFA: both low bytes are $80, so the debris sits in the middle of
  // the cell that is about to vanish -- and it spawns BEFORE the cell is
  // erased. $97/$00, the same animated shape the door puff uses.
  spawnEffect(state, (c << 8) | 0x80, (r << 8) | 0x80, 0x97, 0x00);
  // $2FFF-$300D: graphic AND collision to zero, then the VRAM queue. The port
  // renderer reads the map directly, so setMapCell is both writes.
  setMapCell(state, c, r, 0, 0);
  const next = u8(s.cursor + 1);                              // $3013
  s.cursor = next < 0x49 ? next : 0xFF;                       // $3014-$3018
}

// ---------------------------------------------------------------------------
// Level $0D -- loc_00_301E: the one-shot spawn.
// ---------------------------------------------------------------------------

/**
 * Cross column $50 and three map objects appear in slots 0/1/2 -- overwriting
 * whatever the level's own blob put there, which on level 13 is a type-8
 * platform and two type-6 blocks.
 *
 * All three come from ONE 16-byte template (0:$3318) and are then given
 * separate columns by three literal stores ($58, $5B, $5C). Their +$0E
 * "origin X" byte therefore stays $16 on all three -- the template's own --
 * and jt_01_4765 does not read it, so the discrepancy is real and harmless.
 *
 * MEASURED (level 13, warped to column $54): $C736 goes 0 -> 1 on the frame
 * after the warp, the three records appear as
 *     0A 58 80 18 80 00 00 08 0F 00 00 00 00 00 16 18
 * and the activation scan sets bit 7 on all three the frame after that. They
 * then sit dormant: jt_01_4765's level-$0D arm only arms an object once the
 * player is within 2 columns of it, and at $54 he is 4 away.
 */
function level13Spawn(state) {
  const s = subsys(state);
  if (s.cursor !== 0) return;                                 // $3022: RET NZ
  if (((state.player.x >> 8) & 0xFF) < 0x50) return;          // $3027: RET C
  s.cursor = 1;                                               // $302A
  const t = state.tables?.subsysObjects?.level13;
  if (!t || t.length !== 16) {
    throw new Error('tables.subsysObjects.level13 is missing - re-run '
      + 'tools/export_assets.py');
  }
  for (let i = 0; i < 3; i++) state.actors[i].set(t);         // $3032-$303E
  state.actors[0][1] = 0x58;                                  // $3042
  state.actors[1][1] = 0x5B;                                  // $3047
  state.actors[2][1] = 0x5C;                                  // $304C
}

// ---------------------------------------------------------------------------
// loc_00_3050 -- the rescue drop. Every level-$0B arm falls into this, and so
// does every boss level's default arm.
// ---------------------------------------------------------------------------

/**
 * A carrier that flies across the screen on a parabola and drops items at
 * four fixed columns. It is the game's mercy mechanic: it arms only when the
 * player is below 3 HP and the boss still has $10 or more ($C27E is enemy
 * slot 0's HP byte, the one $0D80 tops up when a boss enrages).
 *
 * IT IS CHEAT-GATED, and this is the part no listing reading would give you.
 * $C75C has exactly one writer in the ROM: $02CF, reached when the title loop
 * sees $FFE2 == $26 -- B + SELECT + LEFT held together. MEASURED 0 on every
 * frame of every level traced for this port, so on a normal boot none of the
 * code below ever executes. src/title.js already implements the combo, so the
 * behaviour is reachable; it is simply not reachable by accident.
 *
 * Two transcription traps in the flight itself:
 *
 *  * $C762 is a COUNTDOWN, not a velocity. $30A4 subtracts 1 from it and then
 *    NEGATES the result into the Y delta, so the carrier rises fast, slows,
 *    and falls -- and the byte wraps past zero into $FF, $FE ... which is what
 *    turns the rise into an accelerating descent. Storing it as a signed
 *    velocity and adding it gives a straight line.
 *  * the drop columns are edge-triggered against $C75D, the PREVIOUS frame's
 *    column ($30C2 reads the old value into B before overwriting it), so each
 *    of $09/$07/$04/$02 fires exactly once even though the carrier spends
 *    several frames inside each. $09/$07 drop item type 1 and $04/$02 type 0.
 */
function rescueDrop(state) {
  const s = subsys(state);
  const r = s.rescue;
  if (!state.flow.rescueCheat) return;              // $3050: $C75C
  if (r.state === 0xFF) return;                     // $3058
  if (r.state !== 1) {                              // $305B
    if (state.player.hp >= 3) return;               // $3061: RET NC
    if ((state.enemies[0][0x16] & 0xFF) < 0x10) return;   // $3067: RET C
    const t = state.tables?.rescueEntryY;
    if (!t || t.length < 4) {
      throw new Error('tables.rescueEntryY is missing - re-run '
        + 'tools/export_assets.py');
    }
    // $306F: indexed by $C73E - 1. The four bosses are subtypes 1-4 and the
    // table is four bytes; nothing else can reach this line, because $2CE9
    // gates the default arm on $C73E and level $0B's own subtype is 3.
    const entry = t[(state.level.bossId - 1) & 0xFF];
    if (entry === undefined) {
      throw new Error('rescueEntryY has no row for subtype '
        + state.level.bossId);
    }
    r.x = 0x0B80;                                   // $306A / $307E
    r.y = (entry << 8) | 0x80;                      // $307B / $3083
    r.vy = 0x38;                                    // $3086
    r.state = 1;                                    // $308D
    return;
  }

  // $3091: paused freezes the flight but still draws it.
  if (!state.flow.paused) {
    r.x = u16(r.x - 0x0018);                        // $3098: BC = $FFE8
    r.vy = u8(r.vy - 1);                            // $30A7
    const c = u8(-r.vy);                            // $30AC: CPL / INC A
    const dy = (c & 0x80) ? c - 0x100 : c;          // $30AF-$30B7: sign extend
    r.y = u16(r.y + dy);                            // $30B9

    const col = (r.x >> 8) & 0xFF;
    const prev = r.prevCol;                         // $30C8: B = old $C75D
    r.prevCol = col;                                // $30C9
    let kind = -1;
    if (col === 0x02 || col === 0x04) kind = 0;     // $30CA/$30CE -> $30E4
    else if (col === 0x07 || col === 0x09) kind = 1;   // $30D2/$30D6 -> $30EB
    else if (col < 0x01) {                          // $30DA: JR NC $3113
      r.state = 0xFF;                               // $30DE
      return;                                       // and NOT drawn
    }
    if (kind >= 0 && col !== prev) {                // $30E4 / $30EB: edge only
      // $30F0-$310A: $C749-$C74D are the staging bytes sub_00_0CF3 reads.
      spawnDrop(state, r.x, r.y, kind, 0x00, 0x01);
      requestSound(state, 0x22);                    // $310D
    }
  }

  // $3113: sub_00_1172 then sub_00_0BAF with metasprite $68, attribute 0.
  //
  // FIXED. This push used to be DISCARDED: rescueDrop runs from updateWater
  // ($05C6) and updateEnemies ($05CF) opens by clearing state.enemyDraws, so
  // the entry was wiped one call later and the carrier was never drawn. An
  // even earlier comment claimed the opposite -- that it takes the OAM slots
  // ahead of every enemy -- which is what the ROM does and what the port did
  // not.
  //
  // src/main.js now flushes the queue immediately after updateWater, which is
  // exactly where $3113 calls sub_00_0BAF, so the carrier lands ahead of the
  // batarangs and the enemies as it does on the cartridge.
  //
  // The path is behind the $C75C rescue cheat (flow.rescueCheat), measures 0 in
  // normal play, and NO oracle scenario can reach a cheat frame -- so the
  // corpus cannot see this in either direction. tests/conveyor.test.js is the
  // check that can: it asserts metasprite $68 reaches state.video.sprites.
  const sx = u8((u16(r.x - state.camera.x) >> 4) + 8);
  const sy = u8((u16((r.y & 0x0FFF) - state.camera.y) >> 4) + 0x10);
  state.enemyDraws.push({ id: 0x68, x: sx, y: sy, attr: 0, alt: true });
}

// ---------------------------------------------------------------------------
// Map-object type $0A -- jt_01_4765. Lives here because the only two things
// that ever create one are the level-7 and level-$0D branches above.
// ---------------------------------------------------------------------------

/**
 * A falling block that lands and BECOMES TERRAIN, like type 6, but with a
 * fifteen-frame wind-up and a level-dependent trigger.
 *
 * NOT WIRED YET. src/actors.js's dispatch() still sends type $0A to
 * `default: return false`, which runs the generic screen tail -- and the ROM's
 * dormant arm ($4784 -> loc_01_4521 -> loc_01_4A53) SKIPS the tail, so a
 * dormant $0A on the cartridge keeps +9/+$0A at zero while the port writes a
 * cache into them. That is the one measured difference between the two. To
 * close it, actors.js needs:
 *
 *     case 0x0A: return actorTypeA(state, r);   // $4765 -- src/conveyor.js
 *
 * and 10 removed from UNIMPLEMENTED_TYPES. The `true` return is what suppresses
 * the tail; the arming paths return false so the tail runs, matching $4443.
 *
 * The state byte (+$0B) is a three-phase machine:
 *   0        dormant. On level $0D it arms when the player is within 2 columns
 *            ($4778, against the record's own Xhi); on every other level it
 *            arms on its first dispatched frame ($4791).
 *   1..$0F   the shake: on level $0D only, the block jitters +$0C / -$0C in X
 *            on alternating groups of four frames (bit 2 of the counter).
 *   $FF      the fall: velocity accelerates by 5 (level $0D) or 3 to a $50
 *            cap, and the block probes the cell $80 below its own Y. When that
 *            cell reads solid it stamps collision 1 and graphic $30 (level
 *            $0D) or $50 into the row ABOVE, frees the slot and plays $21.
 */
export function actorTypeA(state, r) {
  const level = state.level.number;
  const st = r[0x0B];                               // $476C

  if (st === 0) {                                   // $476D
    if (level === 0x0D) {                           // $4772
      const col = (state.player.x >> 8) & 0xFF;     // $477D
      const own = r[1];                             // $477C
      const away = col >= own ? col - own : u8(u8(~u8(col - own)) + 1);
      if (away >= 0x02) return true;                // $4786: no tail
      r[0x0B] = 1;                                  // $478D
      return true;                                  // $478E: still no tail
    }
    r[0x0B] = 1;                                    // $4793
    return false;                                   // $4794: -> the tail
  }

  if (st !== 0xFF) {                                // $4797
    const next = u8(st + 1);                        // $479B
    if (next < 0x10) {                              // $479C
      r[0x0B] = next;                               // $47A0
      if (level !== 0x0D) return false;             // $47A6
      // $47AD: bit 2 of the counter alternates the shake direction.
      moveActorX(state, r, (next & 0x04) ? -0x0C : 0x0C);
      return false;                                 // $47BD
    }
    r[0x0B] = 0xFF;                                 // $47C2
    r[2] = 0x80;                                    // $47C9: Xlo snapped
  }

  // $47CE: the fall. Level $0D accelerates harder; both cap at $50.
  const accel = level === 0x0D ? 0x05 : 0x03;       // $47D4 / $47DA
  const v = u8(r[6] + accel);                       // $47E2
  r[6] = v < 0x50 ? v : 0x50;                       // $47E4-$47E8
  moveActorY(state, r, r[6]);                       // $47F1: sub_01_4A79

  // $47F5-$4806: probe the cell the block's own Y + $80 lands in.
  const col = r[1];                                 // $47F9
  const y = u16(((r[3] << 8) | r[4]) + 0x80);       // $4801
  const row = (y >> 8) & 0xFF;                      // $4805
  const cells = state.level.cells;
  const idx = ((col * 16) + (row & 0x0F)) * 2;
  const solid = cells && (cells[idx + 1] & 0x01);   // $480B: BIT 0
  if (!solid) return false;                         // $480D: keep falling

  // $4810: one row UP from the probe -- where the block comes to rest.
  const gfx = level === 0x0D ? 0x30 : 0x50;         // $4824 / $481B
  setMapCell(state, col, u8(row - 1), gfx, 0x01);   // $4818-$4826
  r[0] = 0;                                         // $4832: free the slot
  requestSound(state, 0x21);                        // $4833
  return true;                                      // $4839: no tail
}

/** ROM: sub_01_4A5C -- move X and, if the player is riding, carry him. */
function moveActorX(state, r, delta) {
  const x = u16(((r[1] << 8) | r[2]) + delta);      // $4A5E
  r[1] = (x >> 8) & 0xFF;
  r[2] = x & 0xFF;
  if (r[0x0D] === 0) return;                        // $4A68: nobody riding
  if (state.player.action === 2) return;            // $4A6E: on the rope
  state.carry.x = u8(state.carry.x + (delta & 0xFF));   // $4A71: $C72F
}

/** ROM: sub_01_4A79 -- move Y, with the rope-release quirk at $4A91. */
function moveActorY(state, r, delta) {
  const y = u16(((r[3] << 8) | r[4]) + delta);      // $4A7D
  r[3] = (y >> 8) & 0xFF;
  r[4] = y & 0xFF;
  if (r[0x0D] === 0) return;                        // $4A87
  if (state.player.action === 2) {                  // $4A8D
    if ((delta & 0x80) === 0) return;               // $4A91: BIT 7,C
    state.player.action = 0;                        // $4A95: the rope lets go
  }
  state.carry.y = u8(state.carry.y + (delta & 0xFF));   // $4A98: $C730
}

/** ROM: sub_00_0AE1 mailbox (same shape as water.js / enemies.js). */
function requestSound(state, id, mask = 0x01) {
  if (state.sound && state.sound.queue.length < 4) {
    state.sound.queue.push({ id, mask });
  }
}
