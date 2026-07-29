#!/usr/bin/env python3
"""Does 0:$14AD ADD the drift byte to X, or subtract it?

The Y half of loc_00_1444 negates ($147D / $1484 are both CPL/INC) and the X
half does not ($1499-$14A4 only sign-extends), so the two 16-bit ADDs three
instructions apart mean opposite things. Reading that off the listing is
exactly the kind of call this project has got wrong before, so this measures
it instead: plant a drop in $C6CF with a chosen drift byte and watch X.

vy is seeded $7F so the drop RISES for the whole window -- $14B9 only reaches
the terrain test once the velocity has gone negative, so nothing can bounce,
shatter or land and confuse the reading.

  python tools/oracle/driftsign.py            # both signs, 32 frames each
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
POOL = 0xC6CF

SEED_X = 0x0500
SEED_Y = 0x1000
SEED_VY = 0x7F          # rising for ~42 frames at 3 a frame
SEED_SUB = 0x01


def run(pb_rom, drift, frames):
    pb = PyBoy(pb_rom, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    started = {'v': False}
    pb.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pb.button('start', delay=3)
        pb.tick(1, False)
    for n in ('start', 'a', 'b', 'up', 'down', 'left', 'right'):
        pb.button_release(n)

    m = pb.memory
    m[POOL + 0] = 0x01
    m[POOL + 1] = SEED_X >> 8
    m[POOL + 2] = SEED_X & 0xFF
    m[POOL + 3] = SEED_Y >> 8
    m[POOL + 4] = SEED_Y & 0xFF
    m[POOL + 5] = drift
    m[POOL + 6] = SEED_VY
    m[POOL + 7] = SEED_SUB

    xs = []
    for _ in range(frames):
        pb.tick(1, False)
        if m[POOL] == 0:
            break
        xs.append((m[POOL + 1] << 8) | m[POOL + 2])
    pb.stop(save=False)
    return xs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=32)
    args = ap.parse_args()

    for drift in (0xF8, 0x08, 0x00):
        xs = run(ROM, drift, args.frames)
        if not xs:
            print(f'drift ${drift:02X}: the slot was freed immediately')
            continue
        delta = xs[-1] - SEED_X
        print(f'drift ${drift:02X}: x ${SEED_X:04X} -> ${xs[-1]:04X} '
              f'over {len(xs)} frames  (delta {delta:+d} = {delta:+#06x})')
        print('   ' + ' '.join(f'{x:04X}' for x in xs[:8]) + ' ...')


if __name__ == '__main__':
    main()
