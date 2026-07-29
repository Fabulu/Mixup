#!/usr/bin/env python3
"""What survives a GAME OVER on the cartridge?

The port (src/main.js afterDeath) zeroes $C753 (cleared routes) and leaves
$C754 (the +2-max-HP latch) alone, on the stated grounds that "$0150 clears
HRAM and all of $C000-$DFFE".  The listing does not agree: $0150's bulk clear
is a PUSH loop with SP = $DFFF, which only covers $D001-$DFFE, plus one
explicit `LD [$C000],A`.  $C001-$CFFF is never touched.

So measure it.  Poke a run's worth of progress into the economy bytes, force a
game over, and read them back after $0150 has run.

  python tools/oracle/econgameover.py
"""
import os
import sys

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
RESET = 0x0150
ROUNDSEL = 0x035B

WATCH = [
    (0xC753, 'C753 routeMask   (cleared routes)'),
    (0xC754, 'C754 maxHpTaken  (+2 HP latch)'),
    (0xC756, 'C756 difficulty'),
    (0xC767, 'C767 lives'),
    (0xFF8E, 'FF8E hpMax'),
    (0xFF8A, 'FF8A hp'),
    (0xFFB5, 'FFB5 continueAvail'),
    (0xFFB0, 'FFB0 level'),
    (0xC759, 'C759 ammo'),
]


def snap(m):
    return {a: m[a] for a, _ in WATCH}


def show(tag, s):
    print(f'  {tag:26s} ' + '  '.join(
        f'{lbl.split()[0]}={s[a]:02X}' for a, lbl in WATCH))


def run(lives, poke):
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    started = {'v': False}
    resets = {'n': 0, 'at': None, 'after': None}
    rs = {'n': 0}
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda _: started.__setitem__('v', True), None)

    def on_reset(_):
        resets['n'] += 1
        if resets['at'] is None:
            resets['at'] = snap(m)

    pyboy.hook_register(0, RESET, on_reset, None)
    pyboy.hook_register(0, ROUNDSEL, lambda _: rs.__setitem__('n', rs['n'] + 1),
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
    pyboy.tick(30, False)

    # $0101 is `JP $0150`, so power-on itself trips the hook. Discard that.
    resets['n'] = 0
    resets['at'] = None

    print(f'--- lives forced to {lives} ---')
    show('at gameplay', snap(m))
    for a, v in poke.items():
        m[a] = v
    m[0xC767] = lives
    show('after poke', snap(m))

    # $1773 death: HP 0.  Re-assert every frame until $C715 latches, since the
    # pickup/heal paths could otherwise put it back.
    m[0xFF8A] = 0
    for _ in range(1200):
        pyboy.tick(1, False)
        if resets['n']:
            break
    if lives == 1 and resets['n'] == 0:
        raise SystemExit('FAIL: expected the boot vector to run')
    if lives > 1 and resets['n']:
        raise SystemExit('FAIL: boot vector ran but should not have')

    if resets['at']:
        show('AT $0150 (entry)', resets['at'])
    # let the reset finish and the title/round-select settle
    pyboy.tick(400, False)
    show('after reset settles', snap(m))
    print(f'  ($0150 ran {resets["n"]}x, $035B ran {rs["n"]}x)')
    pyboy.stop(save=False)
    return snap(m)


def main():
    poke = {0xC753: 0x05, 0xC754: 0x07, 0xC756: 0x02,
            0xFF8E: 0x10, 0xC759: 0x2A}
    print('=== GAME OVER (lives 1 -> 0) ===')
    after = run(1, poke)
    print()
    print('=== ORDINARY DEATH (lives 3) ===')
    run(3, poke)
    print()
    print('VERDICT after game over:')
    for a, lbl in WATCH:
        print(f'  {lbl:34s} = ${after[a]:02X}')


if __name__ == '__main__':
    main()
