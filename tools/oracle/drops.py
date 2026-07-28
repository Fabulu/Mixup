#!/usr/bin/env python3
"""Watch the $C6CF ballistic pool from the moment an enemy dies.

The port spawns nothing when an enemy dies -- no explosion, and no dropped
pickup. This settles what the cartridge actually does: it kills a live enemy by
zeroing its HP byte (the same state a punch leaves it in, reached in one frame
instead of thirty) and then dumps all four pool slots, the player's HP and the
knockback timers, every frame.

Two things it exists to answer, neither of which the listing settles:

  * WHICH enemies drop. $4E7A tests $C73E and sends boss levels straight to the
    kill with no spawn at all, but "non-boss enemy on a boss level" and "enemy
    that fell out of the world" ($4E69) take different routes to the same
    loc_01_4EB8, and only one of them passes through the spawner.
  * WHETHER a slot is ever freed once the drop falls past row $21. $15AC-$15B3
    stops drawing and stops testing contact, but the code it jumps to does not
    clear +0 -- if that is really a leak, four kills permanently exhaust the
    pool, which is exactly what "sometimes you get a heart" would look like.

Usage:
  python tools/oracle/drops.py --level 1 --slot 0 --frames 90
  python tools/oracle/drops.py --level 4 --slot 0     # boss level: expect none
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB

ENEMIES = 0xC268        # 8 x 32 B
POOL = 0xC6CF           # 4 x 8 B
HP, HP_MAX = 0xFF8A, 0xFF8E
BOSS_ID = 0xC73E
KNOCKBACK, INVULN = 0xC714, 0xC715


def slots(m):
    return [bytes(m[POOL + i * 8:POOL + i * 8 + 8]) for i in range(4)]


def show(f, m, tag=''):
    live = [(i, s) for i, s in enumerate(slots(m)) if s[0]]
    body = '  '.join(
        f'#{i} k={s[0]:02X} x={s[1]:02X}{s[2]:02X} y={s[3]:02X}{s[4]:02X} '
        f'vx={s[5]:02X} vy={s[6]:02X} sub={s[7]:02X}'
        for i, s in live) or '(pool empty)'
    print(f'{f:4d}  hp={m[HP]:2d}/{m[HP_MAX]:2d}  kb={m[KNOCKBACK]:02X} '
          f'iv={m[INVULN]:02X}  {body}{tag}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--slot', type=int, default=0, help='enemy slot to kill')
    ap.add_argument('--frames', type=int, default=90)
    ap.add_argument('--settle', type=int, default=60,
                    help='frames to let the level run before the kill')
    ap.add_argument('--hp', type=int, default=0,
                    help='force player HP before the kill -- at full HP the '
                         'pickup is consumed but $FF8A never moves ($1608 CP '
                         'B / JR NC), so the effect is invisible')
    ap.add_argument('--hold', default='',
                    help='button to hold after the kill, e.g. right -- walks '
                         'the player onto the drop so the pickup can be seen')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    started = {'v': False}
    if args.level != 1:
        pyboy.hook_register(
            0, LEVEL_INIT,
            lambda _: pyboy.memory.__setitem__(0xFFB0, args.level), None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)
    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)

    for _ in range(args.settle):
        pyboy.tick(1, False)

    m = pyboy.memory
    base = ENEMIES + args.slot * 32
    rec = bytes(m[base:base + 32])
    print(f'level {args.level}, $C73E (boss id) = {m[BOSS_ID]:02X}')
    print(f'enemy slot {args.slot}: flags={rec[0]:02X} state={rec[2]:02X} '
          f'hp={rec[0x16]:02X} x={rec[0x0E]:02X}{rec[0x0F]:02X} '
          f'y={rec[0x10]:02X}{rec[0x11]:02X}')
    # ASSERT ARRIVAL. A slot with bit 7 clear is not on screen yet, and killing
    # it proves nothing -- the driver takes the tryActivate arm at $4E27 and
    # never reaches the death path. Two earlier probes in this project reported
    # confident numbers for a screen they never got to.
    if not rec[0] & 0x80:
        print('  NOT ACTIVE -- raise --settle or pick another slot')
        pyboy.stop(save=False)
        return 2
    if rec[0x16] == 0:
        print('  already dead -- pick another slot')
        pyboy.stop(save=False)
        return 2

    if args.hp:
        m[HP] = args.hp

    print()
    show(-1, m, '   <- before the kill')
    m[base + 0x16] = 0
    print('    (poked enemy HP to 0)')

    if args.hold:
        pyboy.button_press(args.hold)

    prev = None
    for f in range(args.frames):
        pyboy.tick(1, False)
        m = pyboy.memory
        cur = (bytes(m[POOL:POOL + 32]), m[HP])
        if cur != prev:
            show(f, m)
            prev = cur
    print()
    show(args.frames, m, '   <- final')
    pyboy.stop(save=False)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
