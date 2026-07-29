#!/usr/bin/env python3
"""Where does clearing LEVEL 6 send the cartridge?

loc_00_35E8 dispatches levels 4, 8, $0B and $0E and falls through for
everything else into $35FA: `XOR A -> $C73E`, `$C740 = $FF`, `LD C,$01`,
`JP loc_00_2820`.  C is the COLUMN of the 0:$286D exit pair, and 1 is the TOP
exit -- not the right-hand one $1745 loads when the player walks off an edge.

Level 6 is the only level that can reach that arm: it needs a non-zero $C73E
(only levels 4, 6, 8, $0B and $0E have one) and the other four are dispatched
above it.  Its 0:$286D row is right = $FF, top = $07.  So the port's guard on
exitRight found $FF, never wrote a next level, and the cleared vehicle stage
ran forever -- the game could not be finished past level 6 by any route.

Kills the vehicle the way the last hit does, by zeroing its own HP byte
(enemy record 0 at $C268 + $16), and then just watches $FFB0.

  python tools/oracle/l6clear.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                     # noqa: E402
from trace import ROM, FRAME_END, boot_to_gameplay          # noqa: E402

SITES = [
    (0x34D0, 'loc_00_34D0  victory fanfare'),
    (0x34E7, 'loc_00_34E7  level 6 skips the fanfare'),
    (0x35E8, 'loc_00_35E8  the clear dispatch'),
    (0x35FA, '  $35FA      the DEFAULT arm (C = 1, top exit)'),
    (0x360F, '  $360F      route bit 0'),
    (0x2820, 'loc_00_2820  the exit table'),
    (0x2834, '  $2834      $FFB0 <- the chosen exit'),
    (0x285B, '  $285B      $FE: fall back in from the top'),
    # NOT $04BB -- trace.py's boot_to_gameplay already owns a hook there and
    # PyBoy allows only one per (bank, address).
]


def main():
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    fc = {'n': 0}
    log = []
    for addr, label in SITES:
        pyboy.hook_register(
            0, addr,
            lambda _, l=label: log.append((fc['n'], l, m[0xFFB0], m[0xC740])),
            None)
    pyboy.hook_register(0, FRAME_END, lambda _: fc.__setitem__('n', fc['n'] + 1),
                        None)

    boot_to_gameplay(pyboy, level=6)
    for n in ('start', 'a', 'b', 'left', 'right', 'up', 'down'):
        pyboy.button_release(n)
    if m[0xFFB0] != 6:
        raise SystemExit(f'FAIL: wanted level 6, got ${m[0xFFB0]:02X}')

    base = fc['n']
    log.clear()
    print(f'level ${m[0xFFB0]:02X}  $C73E={m[0xC73E]:02X}  '
          f'vehicle HP=${m[0xC268 + 0x16]:02X}')

    killed = False
    arrived = None
    for _ in range(1400):
        f = fc['n'] - base
        if not killed and f >= 20:
            killed = True
            m[0xC268 + 0x16] = 0            # 1:$4E82's own trigger
        pyboy.tick(1, False)
        if m[0xFFB0] != 6 and arrived is None:
            arrived = fc['n'] - base
            for _ in range(60):
                pyboy.tick(1, False)
            break

    for f, label, lvl, c740 in log:
        print(f'  f{f - base:4d}  {label:44s} $FFB0=${lvl:02X} $C740=${c740:02X}')
    if arrived is None:
        raise SystemExit('FAIL: the cartridge never left level 6')
    print(f'\n$FFB0 left 6 at frame {arrived}; settled at ${m[0xFFB0]:02X}')
    print(f'0:$286D row for level 6: right=${m[0x286D + 10]:02X} '
          f'top=${m[0x286D + 11]:02X}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
