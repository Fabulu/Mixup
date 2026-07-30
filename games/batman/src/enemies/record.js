// The enemy record: slot count, record size and the flag bits.
//
// ROM: the $C268 array is 8 records of 32 bytes, preloaded whole at level init
// (see the header of src/enemies.js, which owns the array and the driver).
//
// This file exists so that leaf modules -- enemies/melee.js today -- can read
// SLOTS and the flag bits without importing the driver back and creating a
// cycle. src/enemies.js re-exports SLOTS and RECORD, so its export surface is
// unchanged.
//
// Record layout (master reference §5.2, refined against the handlers):
//   +0        flags: b7 active, b6 permanently disabled, b5 idle (player far),
//             b4 ranged attack, b3 melee attack, b2 hit-flash/stun,
//             b1 falling, b0 rising
//   +1        sub-flags: b7 wall-jump latch, b6 turn animation, b5 landing
//             animation, b4 committed walk, b1 slow-fall (terminal -8)
//   +2        STATE = the enemy type, 1-13 -> dispatch 1:$50D3
//   +3        walk anim: period<<4 | subtimer (flyer reuses it as flap speed)
//   +4        walk anim: (frames-1)<<4 | frame
//   +5        facing (b0; also knockback direction)
//   +6        current metasprite id (projectiles: template variant 1-5)
//   +7/+8     screen X / Y, recomputed by loc_01_5CA8 each frame
//   +9        OAM attr ($80 = behind BG; water). Cleared by the driver.
//   +$0A-$0D  hitbox: halfW right / halfW left / halfH up / halfH down
//   +$0E/+$0F X world 12.4        +$10/+$11  Y world 12.4
//   +$12      X velocity (signed) +$13       Y velocity (positive = up)
//   +$14      attack timer        +$15       committed-walk timer
//   +$16      HP                  +$17       hit-flash / stun timer ($3C)
//   +$18/+$19 turn / landing animation timers
//   +$1A      ceiling-snap Y-lo   +$1B       conveyor-snap Y-lo
//   +$1C      jump velocity       +$1D       walk speed cap
//   +$1E/+$1F attack-probe offset X (facing-signed) / Y (signed), in px

export const SLOTS = 8;
export const RECORD = 32;

// ---------------------------------------------------------------------------
// Flag bits.  +$00 is the flags byte the driver, the hit ladder, the animation
// machine and batarang.js all read; +$01 is NOT named here (see below).
// ---------------------------------------------------------------------------

export const F_ACTIVE = 0x80, F_DISABLED = 0x40;
export const F_IDLE    = 0x20;   // b5: player far -- the idle sway
export const F_RANGED  = 0x10;   // b4: ranged attack ($5F39 pose arm)
export const F_MELEE   = 0x08;   // b3: melee attack ($5F85 pose arm)
export const F_FLASH   = 0x04;   // b2: hit flash / stun ($5DE1 blink gate)
export const F_FALLING = 0x02;   // b1
export const F_RISING  = 0x01;   // b0

// ---------------------------------------------------------------------------
// Byte offsets -- THE TWENTY-FOUR THAT HAVE EXACTLY ONE MEANING.
//
// Every constant below is the offset the layout table above documents, and it
// means that same thing in every one of the thirteen states. The values are
// asserted as literals in games/batman/tests/enemies.test.js so a constant
// cannot drift away from the byte it names; the ~278 raw indices in tests/ are
// left raw on purpose, because a test that spells the number is an INDEPENDENT
// check on the constant and converting it would make the two agree by
// construction.
// ---------------------------------------------------------------------------

export const E_FLAGS      = 0x00;
export const E_STATE      = 0x02;
export const E_ANIM_TIMER = 0x03;   // period<<4 | subtimer, read by walkCycle
export const E_ANIM_FRAME = 0x04;   // (frames-1)<<4 | frame
export const E_FACING     = 0x05;
export const E_SCREEN_X   = 0x07;   // written by loc_01_5CA8, one frame stale
export const E_SCREEN_Y   = 0x08;
export const E_ATTR       = 0x09;   // OAM attr; $80 = behind BG
export const E_BOX_R      = 0x0A;   // hitbox halfW right
export const E_BOX_L      = 0x0B;   // hitbox halfW left
export const E_BOX_U      = 0x0C;   // hitbox halfH up
export const E_BOX_D      = 0x0D;   // hitbox halfH down
export const E_X_HI       = 0x0E;   // X world 12.4
export const E_X_LO       = 0x0F;
export const E_Y_HI       = 0x10;   // Y world 12.4
export const E_Y_LO       = 0x11;
export const E_VX         = 0x12;   // X velocity, signed
export const E_HP         = 0x16;
export const E_CEIL_SNAP  = 0x1A;   // Y-lo to snap to on a ceiling hit
export const E_FLOOR_SNAP = 0x1B;   // Y-lo to snap to on a conveyor landing
export const E_JUMP_VEL   = 0x1C;
export const E_SPEED_CAP  = 0x1D;   // walk speed cap
export const E_PROBE_DX   = 0x1E;   // attack-probe offset X, facing-signed, px
export const E_PROBE_DY   = 0x1F;   // attack-probe offset Y, signed, px

// E_ANIM_TIMER is here and not below because the flyer does NOT re-purpose it.
// $5613 and $569D write $30 and $50 into +$03 and the header calls that "flap
// speed", but walkCycle decodes both exactly as `period<<4 | subtimer`
// (enemies/anim.js: `r[3] >> 4` and `r[3] & 0x0F`). It is the same field with
// a different period, not a second meaning.

// ---------------------------------------------------------------------------
// THE EIGHT THAT ARE NOT NAMED, AND WHY NAMING THEM WOULD BE A LIE.
//
// A name is a claim that the byte means the same thing everywhere. These eight
// do not. Naming +$17 `E_STUN` and then substituting it inside projHitPlayer
// produces code that reads as a lie while behaving identically -- which is
// strictly WORSE than the raw index, because the next reader trusts it.
//
//   +$01  sub-flags for most states; state 6 (the level-12 shooter) latches a
//         fixed pacing direction in bits 2/3; and tryActivate reads the WHOLE
//         byte as a SPAWN SUBTYPE (`r[1] === 0x01` at $60B5) on records that
//         are NOT YET ACTIVE -- a third meaning, read before any handler has
//         run on the record at all.
//   +$06  the current metasprite id everywhere -- except on state $0B (the
//         projectile), where it is the TEMPLATE VARIANT 1-5 that picks the
//         pose table at $5CDD and decides whether a bounce explodes.
//   +$13  Y velocity, POSITIVE = UP, everywhere -- except on state $0B, where
//         projHoming and projDrop use it as a DOWNWARD sink rate and add it
//         unsigned ($59F6). Same byte, opposite sign convention.
//   +$14  the attack timer -- except on state $0B, where it is a PHASE
//         SELECTOR: 0 homing, 1 re-homing, 2 dropping ($59E8-$59EF).
//   +$15  the committed-walk timer -- except on state $0B, where it is the
//         re-home countdown ($5A20).
//   +$17  the hit-flash / stun timer ($3C) -- except on state $0B, where it is
//         the HIGH byte of the player-relative Y delta ($5B4B / $5A6F).
//   +$18  the turn-animation timer -- except on state $0B, where it is the LOW
//         byte of that same delta.
//   +$19  the landing-animation timer -- except on state $0B, where it is a
//         facing-XOR flag ($5B58, consumed at $5A3A and $5A87).
//
// Phase 9 gives these per-state aliases in the module that owns the meaning
// (`const P_PHASE = 0x14, P_SINK = 0x13, ...`), each with a comment naming
// what the byte means everywhere else. That is the only honest way to name
// them: locally, where the claim is true.
// ---------------------------------------------------------------------------
