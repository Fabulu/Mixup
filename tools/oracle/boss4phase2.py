#!/usr/bin/env python3
"""Force the Joker into phase 2 and see which band arm the FAR range takes.

$728D returns early while $C73D >= 2, and $C73D == 1 is "phase 2 running", so
writing 1 straight into it reproduces the post-stagger state without having to
grind 48 HP off the boss. The question this answers is whether $7372's `CP $40`
is comparing the DISTANCE or the $C73D the arm above it just loaded into A.

  python tools/oracle/boss4phase2.py
"""
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB
RAGE = 0xC73D

ARMS = [(1, 0x7354, 'CP $60'), (1, 0x735C, 'rage!=0 -> $7372'),
        (1, 0x736D, 'far idle SET 5'), (1, 0x7372, 'CP $40'),
        (1, 0x737D, 'rage -> hop $7506'), (1, 0x7385, 'CP $50'),
        (1, 0x73AB, 'lt50 rage test'), (1, 0x738D, 'ge50 rage test'),
        (1, 0x73B1, 'THROW'), (1, 0x7506, 'HOP')]


def main():
    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    pb.hook_register(0, LEVEL_INIT,
                     lambda _: pb.memory.__setitem__(0xFFB0, 0x0E), None)
    started = {'v': False}
    pb.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    counts = {name: 0 for _, _, name in ARMS}
    ctx = {'f': 0}
    seq = []

    for bank, addr, name in ARMS:
        def make(n):
            def cb(_):
                counts[n] += 1
                if 700 <= ctx['f'] <= 706:
                    seq.append((ctx['f'], n))
            return cb
        pb.hook_register(bank, addr, make(name), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pb.button('start', delay=3)
        pb.tick(1, False)
    for n in ('start', 'a', 'b', 'up', 'down', 'left', 'right'):
        pb.button_release(n)

    m = pb.memory
    for f in range(2, 900):
        ctx['f'] = f
        if f >= 690:
            m[RAGE] = 1                 # phase 2, held
        pb.tick(1, False)
        if f in (700, 705, 750, 800, 899):
            r = 0xC268
            print(f'f{f:4d} rage={m[RAGE]} flags={m[r]:02X} sub={m[r+1]:02X} '
                  f'esx={m[r+7]:3d} psx={m[0xFF93]:3d} '
                  f'ad={abs(m[0xFF93]-m[r+7]):3d} at={m[r+0x14]:02X} '
                  f'vx={m[r+0x12]:02X} hp={m[r+0x16]}')
    print()
    for _, _, name in ARMS:
        print(f'{name:22s} {counts[name]:6d}')
    if seq:
        print('-- f700-706 order:')
        for f, n in seq:
            print(f'   f{f}  {n}')
    pb.stop(save=False)


if __name__ == '__main__':
    main()
