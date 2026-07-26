#!/usr/bin/env python3
"""Read the real game's player metasprite selection out of shadow OAM.

Settles which metasprite table entry the game actually uses for each facing:
$1BA3 computes $FF8B = facing XOR 1, but the drawn OAM attribute is the ground
truth for what that index resolves to.

Usage:  python tools/oracle/checksprite.py
"""
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
SHADOW_OAM = 0xC000


def main():
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    started = {'v': False}
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('start', 'a', 'b', 'left', 'right', 'up', 'down'):
        pyboy.button_release(n)

    def report(label, frames, button):
        if button:
            pyboy.button_press(button)
        for _ in range(frames):
            pyboy.tick(1, False)
        if button:
            pyboy.button_release(button)
        m = pyboy.memory
        facing = m[0xFF88]
        ms = m[0xFF8B]
        # The player is drawn after the HUD, so scan for the first OAM entry
        # using an OBJ tile in the player's $00-$0B range.
        entries = []
        for i in range(40):
            b = SHADOW_OAM + i * 4
            y, x, tile, attr = m[b], m[b + 1], m[b + 2], m[b + 3]
            if y == 0 and x == 0:
                continue
            entries.append((i, y, x, tile, attr))
        player = [e for e in entries if e[3] <= 0x0B]
        print(f'{label:>18}: $FF88 facing={facing}  $FF8B msIndex={ms}')
        for i, y, x, tile, attr in player[:6]:
            print(f'{"":>18}  OAM[{i:2d}] y={y:3d} x={x:3d} tile=${tile:02X} '
                  f'attr=${attr:02X}  {"XFLIP" if attr & 0x20 else "     "}')
        if not player:
            print(f'{"":>18}  (no player tiles found; all OAM: {entries[:4]})')

    report('walking RIGHT', 60, 'right')
    report('walking LEFT', 60, 'left')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
