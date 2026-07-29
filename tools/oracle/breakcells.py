#!/usr/bin/env python3
"""Which CELL does the cartridge break, and what goes in the restore slot?

breakwall.py answers "did something break" but its cell address is
`$D000 + (col*32 + row)*2`, which double-counts the column stride --
sub_00_11B9 is `$D000 + (col << 5) + (row & $0F)*2`.  Every cell it printed
for row >= 16 was therefore some other column's byte.  This tool re-does the
measurement at the right address AND hooks loc_00_1E65 to read $FFC0/$FFC1 at
the instant the break happens, which is the only way to see the neighbour
retarget ($2129/$2147 for the floor probe, $229D/$22B6 for the horizontal one)
rather than infer it.

  python tools/oracle/breakcells.py --level 5 --warp 36,27 --hold right \
         --cell 37,29 --cell 37,30 --cell 37,31 --frames 40

Scope note: --hold presses on iteration 3 and never releases, which is enough
for terrain but is NOT the corpus's input timing. On level 5 warp 70,26 an
enemy melee lands at f65 here and one frame later in the port, while the
trusted trace.py / render-frame.mjs / compare.mjs triple on the same warp and
script reports EXACT MATCH on all ten fields for 120 frames. Cap terrain
scenarios below the first enemy contact, or use the corpus harness for
anything that is not a map cell.
"""
import argparse
import os
import sys

from pyboy import PyBoy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import ROM, FRAME_END, boot_to_gameplay, parse_script, BUTTONS  # noqa: E402

MAP = 0xD000


def cell_addr(col, row):
    """sub_00_11B9: $D000 + (col << 5) + (row & $0F) * 2."""
    return MAP + ((col & 0xFF) << 5) + ((row & 0x0F) * 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=5)
    ap.add_argument('--warp', default='36,27')
    ap.add_argument('--hold', default=None, help='pyboy button name, held from frame 3')
    ap.add_argument('--script', default=None, help='trace.py script, overrides --hold')
    ap.add_argument('--frames', type=int, default=40)
    ap.add_argument('--cell', action='append', default=[])
    args = ap.parse_args()

    watch = [tuple(int(v) for v in c.split(',')) for c in args.cell]

    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    iters = {'n': 0}
    per = {'break': [], 'pick': []}
    rows = []

    def on_frame(_):
        m = pb.memory
        cells = [(m[cell_addr(c, r)], m[cell_addr(c, r) + 1]) for c, r in watch]
        slots = []
        for i in range(8):
            a = 0xC67B + i * 3
            slots.append((m[a], m[a + 1], m[a + 2]))
        rows.append(dict(f=iters['n'], x=(m[0xFF81] << 8) | m[0xFF82],
                         y=(m[0xFF83] << 8) | m[0xFF84], vx=m[0xFF86],
                         air=m[0xFF80], hp=m[0xFF8A],
                         brk=list(per['break']), pick=list(per['pick']),
                         cells=cells, slots=slots))
        per['break'].clear()
        per['pick'].clear()
        iters['n'] += 1

    def on_break(_):
        m = pb.memory
        per['break'].append((m[0xFFC0], m[0xFFC1], m[0xC72B]))

    def on_pick(_):
        m = pb.memory
        r = pb.register_file
        per['pick'].append((m[0xFFC0], m[0xFFC1], r.A))

    pb.hook_register(0, FRAME_END, on_frame, None)
    pb.hook_register(0, 0x1E65, on_break, None)
    pb.hook_register(1, 0x4D4E, on_pick, None)

    boot_to_gameplay(pb, level=args.level)
    for name in set(BUTTONS.values()):
        pb.button_release(name)
    base = iters['n']
    rows.clear()
    col, row = (int(v) for v in args.warp.split(','))
    pb.memory[0xFF81] = col
    pb.memory[0xFF82] = 0x80
    pb.memory[0xFF83] = row
    pb.memory[0xFF84] = 0

    tl = parse_script(args.script) if args.script else None
    held = set()
    pressed = False
    guard = 0
    while iters['n'] - base < args.frames and guard < args.frames * 8 + 800:
        guard += 1
        if tl is not None:
            idx = iters['n'] - base
            want = tl[min(idx + 1, len(tl) - 1)] if tl else set()
            for name in want - held:
                pb.button_press(name)
            for name in held - want:
                pb.button_release(name)
            held = want
        elif args.hold and not pressed and iters['n'] - base >= 3:
            pb.button_press(args.hold)
            pressed = True
        pb.tick(1, False)

    hdr = ' f    x      y     vx air hp  ' + '  '.join(f'{c},{r}' for c, r in watch)
    print(hdr + '   | slots(timer,col,row)      | breaks(col,row,mode) picks')
    for r in rows:
        cs = ' '.join(f'{g:02X}/{c:02X}' for g, c in r['cells'])
        sl = ' '.join(f'{t},{c},{rr}' for t, c, rr in r['slots'] if t)
        bk = ' '.join(f'BRK({c},{rr})m{md}' for c, rr, md in r['brk'])
        pk = ' '.join(f'PICK({c},{rr})=${a:02X}' for c, rr, a in r['pick'])
        print(f"{r['f'] - base:3d} ${r['x']:04X} ${r['y']:04X} {r['vx']:4d} {r['air']:2d} "
              f"{r['hp']:2d}  {cs}   | {sl:24s} | {bk} {pk}")
    pb.stop(save=False)


if __name__ == '__main__':
    main()
