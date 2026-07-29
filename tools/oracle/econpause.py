#!/usr/bin/env python3
"""Does START pause the cartridge, and does the port model it?

src/state.js declares flow.paused ($C716) and twenty sites across src/ read
it, but nothing in the port ever WRITES it.  This measures the cartridge side:
press START during gameplay and watch $C716, the player's X, and $C750.

  python tools/oracle/econpause.py
"""
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567


def px(m):
    return (m[0xFF81] << 8) | m[0xFF82]


def main():
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory
    started = {'v': False}
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True),
                        None)
    for f in range(3000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('start', 'a', 'b', 'left', 'right', 'up', 'down'):
        pyboy.button_release(n)
    if not started['v']:
        raise SystemExit('FAIL: gameplay never started')
    pyboy.tick(60, False)

    # Walk right so there is motion to freeze.
    pyboy.button_press('right')
    pyboy.tick(40, False)
    print(f'walking : $C716={m[0xC716]}  $C750={m[0xC750]}  playerX={px(m)}')

    pyboy.button_press('start')
    pyboy.tick(2, False)
    pyboy.button_release('start')
    pyboy.tick(10, False)
    x_at_pause = px(m)
    print(f'START   : $C716={m[0xC716]}  playerX={x_at_pause}')

    pyboy.tick(90, False)     # 90 frames still holding RIGHT
    print(f'+90 fr  : $C716={m[0xC716]}  playerX={px(m)}  '
          f'(moved {px(m) - x_at_pause} subpx while RIGHT was held)')

    pyboy.button_press('start')
    pyboy.tick(2, False)
    pyboy.button_release('start')
    pyboy.tick(30, False)
    print(f'START   : $C716={m[0xC716]}  playerX={px(m)}  (unpaused)')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
