#!/usr/bin/env python3
"""Prove the camera's data dependency: camX/camY of loop iteration N are a
pure function of the PREVIOUS iteration's end-of-frame player position.

Samples player pos + camera at the $0A4F wait-VBlank hook (a stable point in
the main loop, unlike the wandering PyBoy tick boundary) and checks

    cam_N == sub_00_121F(pos_{N-1})

with sub_00_121F re-implemented here.  Also logs the execution order of the
player state machine's internal landmarks for the first frames, to fix the
horizontal-vs-vertical sub-order.

Usage:
  python tools/oracle/camverify.py --frames 150 --script "20:,130:R"
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down', 'A': 'a', 'B': 'b'}

ORDER_HOOKS = {          # player-machine internals, for sub-order evidence
    'cam121F':  (0, 0x121F),
    'player1640': (0, 0x1640),
    'norm170A': (0, 0x170A),
    'grav1A57': (0, 0x1A57),   # air-state / gravity region
    'vert1B1B': (0, 0x1B1B),
    'walk1D3D': (0, 0x1D3D),   # sub_00_1D3D
    'floor1DB9': (0, 0x1DB9),  # floor probe dispatcher
    'ceil1EA6': (0, 0x1EA6),
    'horiz1EF9': (0, 0x1EF9),  # horizontal probe dispatcher
    'draw1D0C': (0, 0x1D0C),
    'vwait0A4F': (0, 0x0A4F),
}


def parse_script(s):
    out = []
    for seg in s.split(','):
        n, _, keys = seg.partition(':')
        out.extend([{BUTTONS[k.upper()] for k in keys.strip()
                     if k.upper() in BUTTONS}] * int(n))
    return out


def cam_model(xhi, xlo, yhi, ylo, clamp, level, boss):
    """sub_00_121F re-implemented (X: $121F-$1249, Y: $124A-$1286)."""
    b = (clamp - 5) & 0xFF
    if xhi < 6:
        cx = 0x0100
    elif xhi >= b:
        cx = ((b - 5) & 0xFF) << 8
    else:
        cx = (((xhi - 5) & 0xFF) << 8) | xlo
    if level == 6 or boss != 0:
        cy = 0x1700
    elif level in (9, 0x0A, 0x0B):
        cy = 0x1000
    elif yhi < 0x15:
        cy = 0x1000
    elif yhi < 0x1C:
        cy = (((yhi - 5) & 0xFF) << 8) | ylo
    else:
        cy = 0x1700
    return cx, cy


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--script', default='20:,130:R')
    ap.add_argument('--frames', type=int, default=150)
    ap.add_argument('--show-order', type=int, default=3,
                    help='print player-internal hook order for this many frames')
    args = ap.parse_args()

    timeline = parse_script(args.script)
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    mem = pyboy.memory

    samples = []      # at each vwait: (x, y, camX, camY, clamp, level, boss)
    order = []

    def on_vwait(_):
        if not started['v']:
            return
        samples.append((
            (mem[0xFF81] << 8) | mem[0xFF82],
            (mem[0xFF83] << 8) | mem[0xFF84],
            (mem[0xFFA2] << 8) | mem[0xFFA3],
            (mem[0xFFA4] << 8) | mem[0xFFA5],
            mem[0xC732], mem[0xFFB0], mem[0xC73E]))
        order.append('vwait0A4F')

    started = {'v': False}
    pyboy.hook_register(0, 0x0567, lambda _: started.__setitem__('v', True), None)
    for label, (bank, addr) in ORDER_HOOKS.items():
        if label == 'vwait0A4F':
            pyboy.hook_register(bank, addr, on_vwait, None)
        else:
            def make(n):
                return lambda _: order.append(n)
            pyboy.hook_register(bank, addr, make(label), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in set(BUTTONS.values()):
        pyboy.button_release(n)

    held = set()
    shown = 0
    for f in range(2, args.frames + 1):
        want = timeline[min(f, len(timeline) - 1)] if timeline else set()
        for n in want - held:
            pyboy.button_press(n)
        for n in held - want:
            pyboy.button_release(n)
        held = want
        order.clear()
        pyboy.tick(1, False)
        if shown < args.show_order and 'norm170A' in order:
            print(f'f{f}: {" -> ".join(order)}')
            shown += 1
    pyboy.stop(save=False)

    ok = bad = 0
    for i in range(1, len(samples)):
        px, py, cx, cy, clamp, level, boss = samples[i]
        prev = samples[i - 1]
        want = cam_model(prev[0] >> 8, prev[0] & 0xFF,
                         prev[1] >> 8, prev[1] & 0xFF, clamp, level, boss)
        if (cx, cy) == want:
            ok += 1
        else:
            bad += 1
            if bad <= 10:
                print(f'  MISMATCH iter {i}: cam=({cx:04X},{cy:04X}) '
                      f'model(prevPos)=({want[0]:04X},{want[1]:04X}) '
                      f'prevPos=({prev[0]:04X},{prev[1]:04X}) pos=({px:04X},{py:04X})')

    n = ok + bad
    print(f'\ncam_N == 121F(pos_N-1): {ok}/{n} '
          f'({100.0 * ok / n:.1f}%) over {n} loop iterations')


if __name__ == '__main__':
    main()
