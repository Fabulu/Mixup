#!/usr/bin/env python3
"""Who queued each shadow-OAM entry?

Hooks sub_00_0BC6 (the metasprite append) and records, per call, the OAM cursor
$FF9D before and after plus the RETURN ADDRESS off the stack -- so every entry
in the frame's OAM can be attributed to the routine that drew it.  This is what
turns "the port is missing 19 sprites" into "the port is missing THIS routine".

Usage:
  python tools/oracle/oamwho.py --level 12 --frames 120 --script "20:,180:R"
"""
import argparse
import importlib.util
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
FRAME_END = 0x0A4F
DRAW = 0x0BC6
DRAW_ALT = 0x0BAF


def _load():
    p = os.path.join(ROOT, 'tools', 'oracle', 'trace.py')
    s = importlib.util.spec_from_file_location('_roj_who_trace', p)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


OT = _load()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=12)
    ap.add_argument('--frames', type=int, default=120)
    ap.add_argument('--script', default='20:,180:R')
    args = ap.parse_args()

    timeline = OT.parse_script(args.script)
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file
    mem = pyboy.memory
    count = {'n': 0}
    pyboy.hook_register(0, FRAME_END,
                        lambda _: count.__setitem__('n', count['n'] + 1), None)

    calls = []
    armed = {'v': False}

    def on_draw(entry):
        if not armed['v']:
            return
        sp = reg.SP
        ret = mem[sp] | (mem[sp + 1] << 8)
        calls.append((entry, ret, mem[0xFF9D], reg.A, reg.B, reg.C, reg.E))

    pyboy.hook_register(0, DRAW, lambda _: on_draw('0BC6'), None)
    pyboy.hook_register(0, DRAW_ALT, lambda _: on_draw('0BAF'), None)

    OT.boot_to_gameplay(pyboy, level=args.level)
    for n in set(OT.BUTTONS.values()):
        pyboy.button_release(n)
    base = max(0, count['n'] - 1)
    held = set()
    guard = 0
    while count['n'] - base < args.frames and guard < args.frames * 8 + 500:
        guard += 1
        idx = count['n'] - base
        nxt = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for n in nxt - held:
            pyboy.button_press(n)
        for n in held - nxt:
            pyboy.button_release(n)
        held = nxt
        if count['n'] - base == args.frames - 1:
            armed['v'] = True
            calls.clear()
        pyboy.tick(1, False)

    print(f'level {args.level}, frame {args.frames}: {len(calls)} draw calls')
    print('entry  cursorBefore  caller     A(msIndex) BC(x,y) E')
    for e, ret, cur, a, b, c, ee in calls:
        print(f'{e}   ${cur:02X}          ${ret - 3:04X}      ${a:02X}       '
              f'${b:02X},${c:02X}   ${ee:02X}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
