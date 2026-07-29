#!/usr/bin/env python3
"""What a PAUSED cartridge frame actually contains.

tools/oracle/econpause.py already proves that START freezes the player.  This
is the other half, and it is the half the port could get wrong while still
"pausing": $05B4 is `JP NZ, loc_00_05D9`, a JUMP, not a return -- so a paused
frame still runs the second HUD arm, the $05A6 moon, sub_00_7AD3 and, at
$064A, sub_00_0C1F's shadow-OAM clear.  The screen is rebuilt every frame out
of almost nothing rather than frozen.

Records, per frame: $C716, $FFA7, the player's X, the shadow-OAM entry count
(the cursor $FF9D divided by four) and the head of shadow OAM.  Also hooks
$062E and $063D so the music cue and the two 7:$405D/$4083 arms are counted.

  python tools/oracle/pauseoam.py --level 9 --hold 20
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pyboy import PyBoy                                     # noqa: E402
from trace import ROM, FRAME_END, boot_to_gameplay          # noqa: E402

SHADOW_OAM = 0xC000
CUE = 0x062E            # LD BC,$0B01 / CALL sub_00_0AE1 -- the PAUSE arm only
DUCK = 0x061E           # CALL 7:$405D
RESTORE = 0x063D        # CALL 7:$4083
# $064A CALL sub_00_0C1F. The write cursor has to be read HERE: $0C1F blanks
# everything above it and resets it to 0, so $FF9D at the frame-end wait is
# always 0 and says nothing at all about what was drawn.
OAM_CLEAR = 0x064A


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=9)
    ap.add_argument('--settle', type=int, default=60)
    ap.add_argument('--hold', type=int, default=20,
                    help='frames to stay paused before the second START')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    hits = {'cue': 0, 'duck': 0, 'restore': 0}
    for name, addr in (('cue', CUE), ('duck', DUCK), ('restore', RESTORE)):
        pyboy.hook_register(0, addr,
                            lambda _, n=name: hits.__setitem__(n, hits[n] + 1),
                            None)

    rows = []
    drawn = {'n': 0}

    def at_clear(_):
        drawn['n'] = pyboy.memory[0xFF9D] // 4

    def take(_):
        m = pyboy.memory
        n = drawn['n']
        head = [(m[SHADOW_OAM + i * 4 + 1], m[SHADOW_OAM + i * 4],
                 m[SHADOW_OAM + i * 4 + 2]) for i in range(min(n, 8))]
        rows.append((m[0xC716], m[0xFFA7], (m[0xFF81] << 8) | m[0xFF82],
                     n, head, dict(hits)))

    pyboy.hook_register(0, OAM_CLEAR, at_clear, None)
    pyboy.hook_register(0, FRAME_END, take, None)
    boot_to_gameplay(pyboy, level=args.level)
    for n in ('start', 'a', 'b', 'left', 'right', 'up', 'down'):
        pyboy.button_release(n)
    pyboy.tick(args.settle, False)

    pyboy.button_press('right')
    pyboy.tick(30, False)
    base = len(rows)

    def tap_start():
        pyboy.button_press('start')
        pyboy.tick(2, False)
        pyboy.button_release('start')

    tap_start()
    pyboy.tick(args.hold, False)
    tap_start()
    pyboy.tick(20, False)
    pyboy.button_release('right')

    print(f'{"f":>4} {"C716":>4} {"FFA7":>4} {"playerX":>7} {"nOAM":>4}  '
          f'{"cue":>3} {"dk":>2} {"rs":>2}  head (x,y,tile)')
    prev = None
    for i, (c716, par, px, n, head, h) in enumerate(rows[base:]):
        key = (c716, n, tuple(head), tuple(sorted(h.items())))
        if key == prev:
            continue
        prev = key
        h_s = ' '.join(f'{x},{y}#{t:02X}' for x, y, t in head)
        print(f'{i:4d} {c716:4d} {par:4d} {px:7d} {n:4d}  '
              f'{h["cue"]:3d} {h["duck"]:2d} {h["restore"]:2d}  {h_s}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
