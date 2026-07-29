#!/usr/bin/env python3
"""After a boss dies, does the punch still hurt anything?

$C740 is the boss-death countdown AND the melee/batarang damage gate
(0:$26B7, 0:$3C4E, 1:$4867). 1:$4EF1 stamps it $FE and 1:$78CC/$7936 walk it
back to 0, so for a couple of hundred frames the player is fully controllable
and completely toothless. The port modelled the gate on $C750 instead, which
never leaves 0 outside level 14's entrance, so its punch kept landing.

Zeroing the boss's HP byte is the ROM's own trigger ($4E82), same as
deathscen.py. But a dead boss level has nothing left to punch, and "no damage
arm ran" would then prove nothing -- so a FAKE enemy is planted in slot 0 at
the instant the scan starts, exactly as punchreach.py does, sitting on the
probe point where a hit is certain. What is measured is the PAIR:

  $26B6 / $3C4E   a candidate passed both window tests -- the gate's input
  $26BE / $3CFB   the damage arm past the gate -- the gate's output

Candidates without damage is the gate working. Candidates WITH damage is the
bug this tool was written for.

  python tools/oracle/dmggate.py --level 4 --poke-at 40 --frames 400
"""
import argparse
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB
ENEMY0 = 0xC268
COUNTDOWN = 0xC740
AMMO = 0xC759
PLAYER_X = 0xFF81


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=4)
    ap.add_argument('--frames', type=int, default=400)
    ap.add_argument('--poke-at', type=int, default=40)
    ap.add_argument('--ammo', type=int, default=9)
    args = ap.parse_args()

    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    if args.level != 1:
        pb.hook_register(0, LEVEL_INIT,
                         lambda _: pb.memory.__setitem__(0xFFB0, args.level), None)
    started = {'v': False}
    pb.hook_register(0, MAIN_LOOP, lambda _: started.__setitem__('v', True), None)

    ctx = {'f': 0}
    hits = {'melee': [], 'batarang': [], 'meleeCand': [], 'batCand': []}
    m0 = pb.memory

    def plant(_):
        """loc_00_2653, the scan head: a guaranteed-in-range slot-0 enemy."""
        if not ctx.get('armed'):
            return
        b = ENEMY0
        m0[b + 0] = 0x80                 # active, not disabled
        m0[b + 2] = 0x01                 # state 1 walker (not an immune state)
        m0[b + 7] = m0[0xFFB6]           # exactly on the probe point
        m0[b + 8] = m0[0xFFB8]
        m0[b + 0x0B] = 7                 # the level-3 walker's box
        m0[b + 0x0C] = 15
        m0[b + 0x16] = 40
        m0[b + 0x17] = 0

    pb.hook_register(0, 0x2653, plant, None)
    pb.hook_register(0, 0x26B6, lambda _: hits['meleeCand'].append(ctx['f']), None)
    pb.hook_register(0, 0x26BE, lambda _: hits['melee'].append(ctx['f']), None)
    pb.hook_register(0, 0x3C4E, lambda _: hits['batCand'].append(ctx['f']), None)
    pb.hook_register(0, 0x3CFB, lambda _: hits['batarang'].append(ctx['f']), None)

    for f in range(2000):
        if started['v']:
            break
        if f % 30 == 0:
            pb.button('start', delay=3)
        pb.tick(1, False)
    for n in ('start', 'a', 'b', 'up', 'down', 'left', 'right'):
        pb.button_release(n)

    m = pb.memory
    poked = {'v': False, 'at': None}
    held = False
    xs = set()
    countdowns = []
    for f in range(2, args.frames + 1):
        ctx['f'] = f
        if not poked['v'] and f >= args.poke_at:
            poked['v'] = True
            poked['at'] = f
            m[ENEMY0 + 0x16] = 0                    # 1:$4E82's own trigger
        # Arm the fake enemy only once the countdown is actually running, so
        # the "before" and "after" halves of the run are not confused.
        ctx['armed'] = m[COUNTDOWN] != 0xFF
        # Alternate B every 6 frames so both a punch and (with ammo) a throw
        # get their chance; $1A1B refuses to restart a swing mid-animation.
        want = poked['v'] and ((f // 6) % 2 == 0)
        if want and not held:
            pb.button_press('b')
        elif held and not want:
            pb.button_release('b')
        held = want
        # ...and walk, so "controllable" is a measurement rather than a claim.
        if poked['v'] and (f // 24) % 2 == 0:
            pb.button_press('right')
            pb.button_release('left')
        elif poked['v']:
            pb.button_press('left')
            pb.button_release('right')
        if m[AMMO] < 2:
            m[AMMO] = args.ammo
        pb.tick(1, False)
        countdowns.append((f, m[COUNTDOWN]))
        xs.add(m[PLAYER_X])

    after = [f for f in hits['melee'] + hits['batarang'] if f > poked['at']]
    seq = [c for _, c in countdowns]
    print(f'level {args.level}, boss HP zeroed at f{poked["at"]}, '
          f'{args.frames} frames')
    print(f'  $C740 after the kill: {seq[poked["at"]]:02X} .. '
          f'{seq[-1]:02X}  (non-$FF on '
          f'{sum(1 for c in seq[poked["at"]:] if c != 0xFF)} frames)')
    print(f'  melee    candidates $26B6 {len(hits["meleeCand"]):4d}'
          f'   damage $26BE {len(hits["melee"]):4d}')
    print(f'  batarang candidates $3C4E {len(hits["batCand"]):4d}'
          f'   damage $3CFB {len(hits["batarang"]):4d}')
    print(f'  player $FF81 values seen : {sorted(xs)}')
    print('  VERDICT: ' + ('no damage arm ran after the kill'
                           if not after else f'DAMAGE at frames {after[:10]}'))
    pb.stop(save=False)


if __name__ == '__main__':
    main()
