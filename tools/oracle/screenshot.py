#!/usr/bin/env python3
"""Screenshot a cartridge screen, and log the songs it asks for on the way.

Two questions this answers directly rather than by reading the listing: what a
screen is actually SUPPOSED to look like, and which song id reaches
sub_00_0AE1 while getting there.

Usage:
  python tools/oracle/screenshot.py --shot rip/rom-title.png
  python tools/oracle/screenshot.py --press-start --settle 200 \
      --shot rip/rom-roundselect.png
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

TITLE_LOOP = 0x02C4
SOUND_REQ = 0x0AE1        # sub_00_0AE1(B = song id, C = mask)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shot', default='rip/rom-screen.png')
    ap.add_argument('--press-start', action='store_true',
                    help='tap START at the title to walk on to round select')
    ap.add_argument('--title-keys', default=None,
                    help='buttons to tap at the title before START, comma '
                         'separated -- "down" moves the cursor to OPTION')
    ap.add_argument('--settle', type=int, default=60,
                    help='frames to run after arriving, before the shot')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file

    songs = []
    pyboy.hook_register(0, SOUND_REQ,
                        lambda _: songs.append((reg.B, reg.C)), None)

    hit = {'n': 0}
    pyboy.hook_register(0, TITLE_LOOP,
                        lambda _: hit.__setitem__('n', hit['n'] + 1), None)

    for _ in range(3000):
        pyboy.tick(1, False)
        if hit['n'] > 40:
            break
    at_title = len(songs)

    if args.press_start:
        if args.title_keys:
            for k in args.title_keys.split(','):
                pyboy.button(k.strip(), delay=4)
                for _ in range(12):
                    pyboy.tick(1, False)
        pyboy.button('start', delay=4)
        # State 4, loc_00_031B, is a 120-frame flash before round select.
        for _ in range(300):
            pyboy.tick(1, False)
    # render=True, or the screen buffer is never filled and the shot is blank.
    for _ in range(args.settle):
        pyboy.tick(1, True)

    out = os.path.join(ROOT, args.shot)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pyboy.screen.image.save(out)

    print(f'wrote {out}')
    print('songs requested up to the title:',
          [f'${b:02X} mask ${c:02X}' for b, c in songs[:at_title]])
    if args.press_start:
        print('songs requested after START :',
              [f'${b:02X} mask ${c:02X}' for b, c in songs[at_title:]])
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
