#!/usr/bin/env python3
"""Does MAX HP ($FF8E) survive a level load on the cartridge?

$FF8E has exactly two writers in the whole ROM -- $0202 (the boot vector) and
1:$4D70 (the +2 pickup) -- so the listing says it survives everything short of
a game over.  $FF8A (HP) is not written by level init either.  The port's
resetPlayer sets BOTH to startingMaxHP on every initLevel, and only the
walk-off transition path in main.js patches them back.

This drives the cartridge through the paths that reload a level and reports
what $FF8E and $FF8A are on the other side.

  python tools/oracle/econmaxhp.py
"""
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB


def st(m):
    return (f'lvl=${m[0xFFB0]:02X} FF8E(max)={m[0xFF8E]:2d} FF8A(hp)={m[0xFF8A]:2d} '
            f'C754={m[0xC754]:02X} C767(lives)={m[0xC767]}')


def boot(level):
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory
    started = {'v': False}
    injected = {'v': False}

    def on_init(_):
        if not injected['v']:
            injected['v'] = True
            if level != 1:
                m[0xFFB0] = level

    pyboy.hook_register(0, LEVEL_INIT, on_init, None)
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
    if m[0xFFB0] != level:
        raise SystemExit(f'FAIL: wanted level {level}, got ${m[0xFFB0]:02X}')
    return pyboy, m


def tap(pyboy, name, hold=3, then=0):
    pyboy.button_press(name)
    pyboy.tick(hold, False)
    pyboy.button_release(name)
    if then:
        pyboy.tick(then, False)


def main():
    # ---- path 1: die, then CONTINUE from round select -----------------------
    print('=== die on level 3, then CONTINUE ===')
    pyboy, m = boot(3)
    pyboy.tick(40, False)
    # Exactly what the +2 pickup writes ($4D70/$4D72/$4D91).
    m[0xFF8E] = 0x10
    m[0xFF8A] = 0x10
    m[0xC754] = 0x01
    m[0xC767] = 3
    print(f'  upgraded : {st(m)}')

    m[0xFF8A] = 0                    # $1773 death
    pyboy.tick(700, False)           # death sequence -> round select
    print(f'  at menu  : {st(m)}')
    tap(pyboy, 'start', 4, 400)      # CONTINUE is preselected ($03C6)
    print(f'  continued: {st(m)}')
    pyboy.stop(save=False)

    # ---- path 2: die, go UP to START, pick a route ---------------------------
    print('\n=== die on level 3, then START a route instead ===')
    pyboy, m = boot(3)
    pyboy.tick(40, False)
    m[0xFF8E] = 0x10
    m[0xFF8A] = 0x10
    m[0xC754] = 0x01
    m[0xC767] = 3
    print(f'  upgraded : {st(m)}')
    m[0xFF8A] = 0
    pyboy.tick(700, False)
    print(f'  at menu  : {st(m)}')
    tap(pyboy, 'up', 4, 20)          # $03F6: selection -> START
    tap(pyboy, 'start', 4, 400)
    print(f'  started  : {st(m)}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
