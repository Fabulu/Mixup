#!/usr/bin/env python3
"""What survives loc_00_2820, the ordinary WALK-OFF between levels?

Finishing a level is not the same handoff as walking off its edge.  $2820
calls sub_00_333F, sub_00_09DD, sub_00_2889, sub_00_0C34, sub_00_104E,
sub_00_0D50, 1:$4DDA and sub_00_0F39 -- and nothing else.  The whole
$04BE-$053F register block that loc_00_04BB runs (velocity, air state, facing,
half-extents, i-frames, ammo, the animation triple, the water surface) is never
re-run, so those bytes cross the boundary intact.

The one exception is inside sub_00_0D50 itself: $0D5E tests bit 7 of this
level's 0:$1015 byte and $0D66-$0D6D zeroes $FF80/$FF86/$FF87/$C714 when it is
set.  Levels 1, 4, 5, 8, 9, $0B, $0C and $0E carry that bit; 2, 3, 6, 7, $0A
and $0D do not -- which is why an L1 -> L2 arrival keeps its velocity and an
L4 -> L5 one does not.

The exit is ARMED rather than walked to, using the game's own trigger:
$173C compares $FF81 against the camera clamp $C732 for the RIGHT exit (C = 0)
and $174A compares $FF83 against $11 for the TOP one (C = 1).  Writing the
byte the ROM tests keeps the whole transition on its own code path.

CAVEAT, so nobody reads too much into one column: arming the RIGHT exit
teleports the player to the clamp column, and on some levels that lands him
inside terrain, so $FF86/$FF87 on the arrival frame are whatever the collision
resolver made of that, not what he was carrying.  The bytes that ARE clean
evidence here are the ones nothing on the arrival frame writes -- $C714,
$C759, $FF8C/$FF8D, $FFC3, $C70A-$C70C, $FFB1 and $FFA7.  L1 -> L2 is the
cleanest run of the set; L3 -> L4 arrives with a corrupted position.

  python tools/oracle/walkoff.py --from 1 --exit right
  python tools/oracle/walkoff.py --from 2 --exit top
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                     # noqa: E402
from trace import ROM, FRAME_END, boot_to_gameplay          # noqa: E402

# Everything $04BE-$053F clears and $2820 does not, plus the two counters.
WATCH = [
    ('level', 0xFFB0), ('air', 0xFF80), ('vx', 0xFF86), ('vy', 0xFF87),
    ('facing', 0xFF88), ('halfW', 0xFF8C), ('halfH', 0xFF8D),
    ('iframes', 0xC714), ('ammo', 0xC759), ('hp', 0xFF8A), ('hpMax', 0xFF8E),
    ('anim', 0xFFC3), ('animFrame', 0xFFC4), ('cling', 0xFFB2),
    ('waterHi', 0xC70A), ('waterLo', 0xC70B), ('waterPk', 0xC70C),
    ('FFB1', 0xFFB1), ('FFA7', 0xFFA7),
]


def snap(m):
    row = {k: m[a] for k, a in WATCH}
    row['x'] = (m[0xFF81] << 8) | m[0xFF82]
    row['y'] = (m[0xFF83] << 8) | m[0xFF84]
    return row


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='src', type=int, default=1)
    ap.add_argument('--exit', choices=('right', 'top'), default='right')
    ap.add_argument('--settle', type=int, default=12,
                    help='frames of RIGHT held before the exit is armed')
    ap.add_argument('--after', type=int, default=6)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    fc = {'n': 0}
    marks = []
    rows = []
    pyboy.hook_register(0, 0x2820,
                        lambda _: marks.append((fc['n'], 'loc_00_2820')), None)
    pyboy.hook_register(0, 0x0D66,
                        lambda _: marks.append((fc['n'], '$0D66 bit-7 motion clear')),
                        None)

    def take(_):
        fc['n'] += 1
        rows.append(snap(m))

    pyboy.hook_register(0, FRAME_END, take, None)

    boot_to_gameplay(pyboy, level=args.src)
    for n in ('start', 'a', 'b', 'left', 'right', 'up', 'down'):
        pyboy.button_release(n)
    if m[0xFFB0] != args.src:
        raise SystemExit(f'FAIL: wanted level {args.src}, got ${m[0xFFB0]:02X}')

    # Give the player some real motion to carry, and some i-frames.
    pyboy.button_press('right')
    pyboy.tick(args.settle, False)
    m[0xC714] = 53                       # $C714, as a hit would leave it
    m[0xC759] = 7                        # $C759 ammo
    base = len(rows)
    marks.clear()
    print(f'--- level {args.src}, arming the {args.exit} exit ---')

    # Arm ONCE. Re-poking $FF81 every frame would re-trigger the exit test on
    # the level we just arrived in -- and level 2's own right exit is $FF.
    for _ in range(args.after + 8):
        if m[0xFFB0] == args.src:
            if args.exit == 'right':
                m[0xFF81] = m[0xC732]    # $173C: $FF81 >= $C732
            else:
                m[0xFF83] = 0x10         # $174A: $FF83 < $11
                m[0xFF84] = 0x00
        pyboy.tick(1, False)
    pyboy.button_release('right')

    keys = [k for k, _ in WATCH] + ['x', 'y']
    print('  ' + ' '.join(f'{k:>9}' for k in keys))
    for i, r in enumerate(rows[base - 2:]):
        print(f'{i - 2:3d} ' + ' '.join(f'{r[k]:9d}' for k in keys))
    print()
    for f, label in marks:
        print(f'  hit {label} at recorded frame {f - base}')
    if m[0xFFB0] == args.src:
        raise SystemExit('FAIL: the cartridge never left the level')
    print(f'  arrived in level ${m[0xFFB0]:02X}; 0:$1015 byte = '
          f'${m[0x1015 + m[0xFFB0] - 1]:02X} '
          f'(bit 7 {"SET" if m[0x1015 + m[0xFFB0] - 1] & 0x80 else "clear"})')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
