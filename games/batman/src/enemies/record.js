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

export const F_ACTIVE = 0x80, F_DISABLED = 0x40;
