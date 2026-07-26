#!/usr/bin/env python3
"""Where does the PyBoy tick boundary slice the main loop, and what player
position does the camera routine ($121F) actually read?

Hooks the main-loop landmarks and, at each, snapshots the player position
($FF81-84) and camera ($FFA2-A5).  After every tick it prints the event
sequence for that tick plus the end-of-tick sample, so we can see:
  1. the real intra-frame order  (loopTop -> cam -> 1336 -> playerEntry -> draw)
  2. WHERE the tick boundary falls relative to those events
  3. whether $121F's input position equals this tick's or last tick's
     end-of-tick player x  (the "sometimes previous, sometimes current" bug)

Usage:
  python tools/oracle/camorder.py --frames 150 --script "20:,130:R" --from 2 --to 150
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down', 'A': 'a', 'B': 'b'}

# label -> (bank, addr)
HOOKS = {
    'loopTop':   (0, 0x0567),   # main loop top
    'cam':       (0, 0x121F),   # sub_00_121F entry (camera not yet written)
    'camDone':   (0, 0x1332),   # end of $121F (SCX/SCY shadows written)
    'mapObj':    (1, 0x4230),   # 1:4230 map-object driver
    'fx1336':    (0, 0x1336),   # sub_00_1336 entry (fx/ballistics head)
    'plEntry':   (0, 0x1640),   # fall-through into player machine
    'plNorm':    (0, 0x170A),   # normal (non-scripted) player path
    'plDraw':    (0, 0x1D0C),   # player draw = player update finished
    'lvl2CBE':   (0, 0x2CBE),   # per-level logic
    'tiles2C13': (0, 0x2C13),
    'bat3A35':   (0, 0x3A35),
    'enemy':     (1, 0x4E0C),   # 1:4E0C enemy loop
    'vwait':     (0, 0x0A4F),   # wait-VBlank entry
    'visr':      (0, 0x0653),   # VBlank ISR entry
}


def parse_script(s):
    out = []
    for seg in s.split(','):
        n, _, keys = seg.partition(':')
        out.extend([{BUTTONS[k.upper()] for k in keys.strip()
                     if k.upper() in BUTTONS}] * int(n))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--script', default='20:,130:R')
    ap.add_argument('--frames', type=int, default=150)
    ap.add_argument('--from', dest='lo', type=int, default=2)
    ap.add_argument('--to', dest='hi', type=int, default=150)
    args = ap.parse_args()

    timeline = parse_script(args.script)
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    mem = pyboy.memory

    events = []          # [(label, x1616, cam1616), ...] within current tick

    def snap(label):
        x = (mem[0xFF81] << 8) | mem[0xFF82]
        y = (mem[0xFF83] << 8) | mem[0xFF84]
        cx = (mem[0xFFA2] << 8) | mem[0xFFA3]
        cy = (mem[0xFFA4] << 8) | mem[0xFFA5]
        events.append((label, x, y, cx, cy))

    started = {'v': False}

    def make(n):
        if n == 'loopTop':
            def cb(_):
                started['v'] = True
                snap(n)
            return cb
        return lambda _: snap(n)

    for label, (bank, addr) in HOOKS.items():
        pyboy.hook_register(bank, addr, make(label), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in set(BUTTONS.values()):
        pyboy.button_release(n)

    prev_end_x = None
    held = set()
    mism = {'cur': 0, 'prev': 0, 'other': 0}
    for f in range(2, args.frames + 1):
        want = timeline[min(f, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want

        events.clear()
        pyboy.tick(1, False)

        end_x = (mem[0xFF81] << 8) | mem[0xFF82]
        end_cx = (mem[0xFFA2] << 8) | mem[0xFFA3]

        cam_in = [e for e in events if e[0] == 'cam']
        verdict = '-'
        if cam_in:
            cx_in = cam_in[-1][1]        # player x that the LAST cam call read
            if cx_in == end_x and cx_in == prev_end_x:
                verdict = 'same'
            elif cx_in == end_x:
                verdict = 'CURRENT'
                mism['cur'] += 1
            elif cx_in == prev_end_x:
                verdict = 'PREVIOUS'
                mism['prev'] += 1
            else:
                verdict = 'OTHER(%d)' % cx_in
                mism['other'] += 1

        if args.lo <= f <= args.hi:
            seq = ' '.join(e[0] for e in events)
            print(f'f{f:3d} endX={end_x:5d} endCamX={end_cx:5d} '
                  f'camSaw={verdict:>9}  | {seq}')
        prev_end_x = end_x

    print('\nsummary: camera read CURRENT tick-end x on %(cur)d frames, '
          'PREVIOUS on %(prev)d, other %(other)d' % mism)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
