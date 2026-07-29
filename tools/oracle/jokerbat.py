#!/usr/bin/env python3
"""LEVEL-14 BATARANG: what the cartridge's Joker-fight throw actually does.

The port regressed to "no batarang ever appears on level 14": $19C0-$19CC sets
the RETURNING bit at throw time, and a returning batarang runs the $3C0B catch
test first -- so a batarang that spawns AT the player is inside the catch box
on its very first frame and the slot is freed before anything is drawn.

The obvious hypotheses were about ORDER (homing moves it out of the box first,
or the catch runs later in the frame). This measures instead. It hooks $3C0B --
the catch call itself -- and records the target coordinate pair the ROM loads
into B/C, alongside the player's ($FF93/$FF94) and enemy slot 1's cached screen
pair ($C28F/$C290), plus the whole batarang slot every frame.

  python tools/oracle/jokerbat.py                     # normal, throw at f740
  python tools/oracle/jokerbat.py --difficulty 0      # easy: the ordinary path
  python tools/oracle/jokerbat.py --throw 760 --frames 90
"""
import argparse
import importlib.util
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
spec = importlib.util.spec_from_file_location('tracemod', os.path.join(HERE, 'trace.py'))
tracemod = importlib.util.module_from_spec(spec)
sys.modules['tracemod'] = tracemod
spec.loader.exec_module(tracemod)

from pyboy import PyBoy                                    # noqa: E402

ROM = tracemod.ROM
FRAME_END = tracemod.FRAME_END                             # $0A4F

SLOT0 = 0xC4B0                              # $C4A7 + 9*(0+1)
ENEMY1 = 0xC288                             # $C268 + $20; +$0E/$10 are $C296/$C298
DIFFICULTY = 0xC756
LEVEL_INIT = 0x0D50
CATCH_CALL = 0x3C0F                         # the CALL sub_00_0C88 itself
AMMO = 0xC759


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--difficulty', type=int, default=1)
    ap.add_argument('--throw', type=int, default=740,
                    help='gameplay frame to press B on (the gate opens at 728)')
    ap.add_argument('--frames', type=int, default=60,
                    help='frames to record AFTER the throw')
    ap.add_argument('--ammo', type=int, default=10)
    ap.add_argument('--out', default='rip/oracle/jokerbat.json')
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    mem = pyboy.memory
    iters = {'n': 0}
    rows = []
    catches = []

    def on_frame_end(_):
        iters['n'] += 1

    pyboy.hook_register(0, FRAME_END, on_frame_end, None)

    # $3C0F is the CALL: B/C already hold the TARGET pair the ROM chose, D/E
    # the batarang's own screen pair. Register reads are the point -- this is
    # the one place the level-14 swap at $3BF5 is observable.
    def on_catch(_):
        r = pyboy.register_file
        catches.append({
            'f': iters['n'],
            'targetX': r.B, 'targetY': r.C,
            'batX': r.D, 'batY': r.E,
            'ff93': mem[0xFF93], 'ff94': mem[0xFF94],
            'c28f': mem[0xC28F], 'c290': mem[0xC290],
        })

    pyboy.hook_register(0, CATCH_CALL, on_catch, None)
    pyboy.hook_register(
        0, LEVEL_INIT,
        lambda _: mem.__setitem__(DIFFICULTY, args.difficulty), None)

    tracemod.boot_to_gameplay(pyboy, level=14)
    for name in set(tracemod.BUTTONS.values()):
        pyboy.button_release(name)
    base = max(0, iters['n'] - 1)

    def gframe():
        return iters['n'] - base

    mem[AMMO] = args.ammo

    held = False
    end = args.throw + args.frames
    guard = 0
    while gframe() < end and guard < end * 8 + 500:
        guard += 1
        g = gframe()
        # Input lead of one frame, as trace.py documents.
        want = (g + 1) in (args.throw, args.throw + 1)
        if want and not held:
            pyboy.button_press('b')
            held = True
        elif held and not want:
            pyboy.button_release('b')
            held = False
        pyboy.tick(1, False)
        if g >= args.throw - 2:
            rows.append({
                'f': g,
                'flags': mem[SLOT0], 'xhi': mem[SLOT0 + 1], 'xlo': mem[SLOT0 + 2],
                'yhi': mem[SLOT0 + 3], 'ylo': mem[SLOT0 + 4],
                'spd': mem[SLOT0 + 5], 'arc': mem[SLOT0 + 6],
                'sx': mem[SLOT0 + 7], 'sy': mem[SLOT0 + 8],
                'ammo': mem[AMMO],
                'ff93': mem[0xFF93], 'ff94': mem[0xFF94],
                'px': (mem[0xFF81] << 8) | mem[0xFF82],
                'py': (mem[0xFF83] << 8) | mem[0xFF84],
                'camX': (mem[0xFFA2] << 8) | mem[0xFFA3],
                'camY': (mem[0xFFA4] << 8) | mem[0xFFA5],
                'e1flags': mem[ENEMY1], 'e1sx': mem[ENEMY1 + 7], 'e1sy': mem[ENEMY1 + 8],
                'e1xhi': mem[ENEMY1 + 0x0E], 'e1yhi': mem[ENEMY1 + 0x10],
            })

    pyboy.stop(save=False)

    out = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, 'w') as fh:
        json.dump({'rows': rows, 'catches': catches}, fh, indent=1)

    live = [r for r in rows if r['flags'] != 0]
    print(f"difficulty {args.difficulty}, throw at f{args.throw}")
    print(f"slot 0 live on {len(live)} of {len(rows)} recorded frames")
    hdr = 'f     flags xhi.lo   yhi.lo   spd arc  sx sy | ammo  e1 sx sy xhi yhi'
    print(hdr)
    for r in rows[:28]:
        print(f"{r['f']:<5} {r['flags']:02X}    {r['xhi']:02X}.{r['xlo']:02X}    "
              f"{r['yhi']:02X}.{r['ylo']:02X}    {r['spd']:02X}  {r['arc']:02X}   "
              f"{r['sx']:02X} {r['sy']:02X} | {r['ammo']:<4}  {r['e1flags']:02X} "
              f"{r['e1sx']:02X} {r['e1sy']:02X}  {r['e1xhi']:02X}  {r['e1yhi']:02X}")
    print()
    print('CONVENTION: does the ROM\'s +7/+8 pair carry the +8/+16 OAM offsets?')
    print('f     bat world   cam        sx,sy | drawing  oam(+8,+16)')
    for r in rows[2:8]:
        bx = (r['xhi'] << 8) | r['xlo']
        by = (r['yhi'] << 8) | r['ylo']
        dx = ((bx >> 4) - (r['camX'] >> 4)) & 0xFF
        dy = (((by >> 4) - 0x100) - (r['camY'] >> 4)) & 0xFF
        print(f"{r['f']:<5} {bx:04X},{by:04X}  {r['camX']:04X},{r['camY']:04X}  "
              f"{r['sx']:02X},{r['sy']:02X} | {dx:02X},{dy:02X}    "
              f"{(dx + 8) & 0xFF:02X},{(dy + 0x10) & 0xFF:02X}")
    print()
    print('$3C0B catch tests (B/C = the target the ROM chose):')
    print('f     target   bat      $FF93/94  $C28F/90')
    for c in catches[:20]:
        print(f"{c['f'] - base:<5} {c['targetX']:02X},{c['targetY']:02X}    "
              f"{c['batX']:02X},{c['batY']:02X}    {c['ff93']:02X},{c['ff94']:02X}     "
              f"{c['c28f']:02X},{c['c290']:02X}")
    if not catches:
        print('  (none -- the catch test was never reached)')


if __name__ == '__main__':
    main()
