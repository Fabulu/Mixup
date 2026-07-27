#!/usr/bin/env python3
"""Watch a level-to-level arrival on the real cartridge.

The 2 -> 3 transition drops the player out of the world in the port, while
booting level 3 directly is fine -- so the transition path and the direct-load
path are believed to disagree.  This settles it by watching the cartridge do
both, reading $FF81-$FF84 at every point in the chain that could write them.

The top exit ($1740: y >> 8 < $11) is armed by writing $FF83 directly rather
than by climbing there.  That is the same trigger the game tests, so the whole
transition still runs through loc_00_2820 -- we only skip the platforming.

Usage:
  python tools/oracle/arrival.py --from 2 --to 3      # walk the transition
  python tools/oracle/arrival.py --direct 3           # boot straight in
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB   # route dispatcher has just written $FFB0

# Every point in the two chains that can move the player, plus the routines
# the transition calls between them.
WATCH = [
    (0x2820, 'exit test   loc_00_2820 entry'),
    (0x2834, 'dest chosen $2834 LDH [$FFB0],A'),
    (0x283F, 'call        sub_00_2889'),
    (0x2973, '  2889 tail $2973 read 1:$7CED'),
    (0x298D, '  2889      $298D after Y write'),
    (0x2842, 'call        sub_00_0C34 (map)'),
    (0x2845, 'call        sub_00_104E'),
    (0x2848, 'call        sub_00_0D50'),
    (0x285A, 'transition  RET'),
    (0x0540, 'init        $0540 call sub_00_2889'),
    (0x0543, 'init        $0543 level-$0A start hack'),
    (0x0554, 'init        $0554 after start hack'),
]


def snap(m):
    return (m[0xFFB0],
            (m[0xFF81] << 8) | m[0xFF82],
            (m[0xFF83] << 8) | m[0xFF84],
            m[0xFF80], m[0xFF87])


def fmt(s):
    lvl, x, y, air, vy = s
    return (f'level {lvl:2d}  x={x:5d} (col {x >> 8:3d})  '
            f'y={y:5d} (row {y >> 8:3d})  air={air}  vy={vy:3d}')


def boot(pyboy, level, once):
    """Tap START to gameplay, injecting $FFB0 at the dispatcher.

    `once` matters: trace.py's injection hook is permanent, which is harmless
    for a single-level trace but would slam $FFB0 back to the source level the
    moment a transition re-entered $04BB.  Here it must fire exactly once.
    """
    state = {'started': False, 'injected': False}

    def inject(_):
        if not state['injected']:
            state['injected'] = True
            pyboy.memory[0xFFB0] = level
        elif not once:
            pyboy.memory[0xFFB0] = level

    if level != 1:
        pyboy.hook_register(0, LEVEL_INIT, inject, None)
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda _: state.__setitem__('started', True), None)

    for f in range(3000):
        if state['started']:
            return f
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    raise RuntimeError('gameplay never started')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--from', dest='src', type=int, default=2)
    ap.add_argument('--to', dest='dst', type=int, default=3)
    ap.add_argument('--direct', type=int, default=None,
                    help='skip the transition; boot this level directly')
    ap.add_argument('--after', type=int, default=90,
                    help='frames to run after arrival')
    args = ap.parse_args()

    level = args.direct if args.direct is not None else args.src
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    log = []
    for addr, label in WATCH:
        pyboy.hook_register(
            0, addr,
            lambda _, l=label: log.append((l, snap(pyboy.memory))), None)

    boot(pyboy, level, once=True)
    for name in ('right', 'left', 'up', 'down', 'a', 'b'):
        pyboy.button_release(name)
    pyboy.tick(4, False)

    print(f'=== booted into level {pyboy.memory[0xFFB0]} ===')
    for label, s in log:
        print(f'  {label:34s} {fmt(s)}')
    print(f'  {"settled":34s} {fmt(snap(pyboy.memory))}')

    if args.direct is None:
        log.clear()
        print(f'\n=== arming the top exit (y row $10 < $11) ===')
        pyboy.memory[0xFF83] = 0x10
        pyboy.memory[0xFF84] = 0x00
        pyboy.tick(2, False)
        for label, s in log:
            print(f'  {label:34s} {fmt(s)}')
        print(f'\n=== arrived in level {pyboy.memory[0xFFB0]} ===')

    # The gravity guards at $1ABB-$1AD2: spring ($C751), cling ($FFB2) and
    # action ($C71E) each skip the fall while still running the floor probe at
    # $1B1B. If the player hangs in mid-air, one of these is why.
    print(f'\n{"frame":>5}  {"row":>4} {"y":>6} {"vy":>4} {"air":>4} '
          f'{"hp":>3} {"lvl":>4} | {"spring":>6} {"cling":>5} {"action":>6} '
          f'{"C740":>5} {"C736":>5}')
    m = pyboy.memory
    for f in range(1, args.after + 1):
        pyboy.tick(1, False)
        y = (m[0xFF83] << 8) | m[0xFF84]
        if f <= 6 or f % 10 == 0:
            print(f'{f:5d}  {y >> 8:4d} {y:6d} {m[0xFF87]:4d} {m[0xFF80]:4d} '
                  f'{m[0xFF8A]:3d} {m[0xFFB0]:4d} | {m[0xC751]:6d} '
                  f'{m[0xFFB2]:5d} {m[0xC71E]:6d} {m[0xC740]:5d} '
                  f'{m[0xC736]:5d}')

    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
