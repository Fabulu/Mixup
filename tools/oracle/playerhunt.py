#!/usr/bin/env python3
"""Player-area hunting probes.  Read-only measurements against the cartridge.

Each sub-command answers ONE question with numbers.

  sound   -- every sub_00_0AE1 call (B = id, C = mask) per main-loop iteration,
             so "does a plain jump make a noise" is a measurement, not a read.
  arms    -- execution counts for a list of ROM addresses over a scripted run.
  cling   -- per-frame $FF80/$FF87/$FFB2/$FF83/$FF84 plus hook counts on the
             ceiling ($1EA6) and floor ($1DB9) probes, to settle whether the
             cling freeze runs them.
  kb4     -- level-4 knockback: force $C73F and a fresh $C714 stamp, read the
             $FF87 the ROM picks ($17AC = $40 vs $17B2 = $18).
"""
import argparse
import os
import sys

from pyboy import PyBoy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import ROM, FRAME_END, boot_to_gameplay, parse_script, BUTTONS  # noqa: E402


def make(level=1):
    pb = PyBoy(ROM, window='null', sound_emulated=False)
    pb.set_emulation_speed(0)
    return pb


def drive(pb, timeline, iters, on_iter=None):
    """Run `iters` completed main-loop iterations with the one-frame input lead."""
    marks = {'n': 0}
    held = set()
    guard = 0
    while marks['n'] < iters and guard < iters * 8 + 800:
        guard += 1
        idx = marks['n']
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for name in want - held:
            pb.button_press(name)
        for name in held - want:
            pb.button_release(name)
        held = want
        pb.tick(1, False)
    return marks


# --------------------------------------------------------------------------
def cmd_sound(args):
    pb = make()
    log = []
    iters = {'n': 0}
    pb.hook_register(0, FRAME_END, lambda _: iters.__setitem__('n', iters['n'] + 1), None)

    def on_cue(_):
        r = pb.register_file
        log.append((iters['n'], r.B, r.C))

    pb.hook_register(0, 0x0AE1, on_cue, None)
    boot_to_gameplay(pb, level=args.level)
    for name in set(BUTTONS.values()):
        pb.button_release(name)
    base = iters['n']
    log.clear()
    if args.warp:
        parts = args.warp.split(',')
        pb.memory[0xFF81] = int(parts[0]) & 0xFF
        pb.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pb.memory[0xFF83] = int(parts[1]) & 0xFF
            pb.memory[0xFF84] = 0
    tl = parse_script(args.script)
    marks = {'n': 0}

    held = set()
    guard = 0
    while iters['n'] - base < args.frames and guard < args.frames * 8 + 800:
        guard += 1
        idx = iters['n'] - base
        want = tl[min(idx + 1, len(tl) - 1)] if tl else set()
        for name in want - held:
            pb.button_press(name)
        for name in held - want:
            pb.button_release(name)
        held = want
        pb.tick(1, False)

    print('frame  id  mask')
    for f, b, c in log:
        print(f'{f - base:5d}  ${b:02X}  ${c:02X}')
    pb.stop(save=False)


# --------------------------------------------------------------------------
def cmd_arms(args):
    pb = make()
    iters = {'n': 0}
    pb.hook_register(0, FRAME_END, lambda _: iters.__setitem__('n', iters['n'] + 1), None)
    counts = {}
    firsts = {}
    for a in args.addr:
        addr = int(a, 0)
        counts[addr] = 0

        def mk(ad):
            def cb(_):
                counts[ad] += 1
                firsts.setdefault(ad, iters['n'])
            return cb
        pb.hook_register(0, addr, mk(addr), None)

    boot_to_gameplay(pb, level=args.level)
    for name in set(BUTTONS.values()):
        pb.button_release(name)
    base = iters['n']
    for k in counts:
        counts[k] = 0
    firsts.clear()
    if args.warp:
        parts = args.warp.split(',')
        pb.memory[0xFF81] = int(parts[0]) & 0xFF
        pb.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pb.memory[0xFF83] = int(parts[1]) & 0xFF
            pb.memory[0xFF84] = 0
    tl = parse_script(args.script)
    held = set()
    guard = 0
    while iters['n'] - base < args.frames and guard < args.frames * 8 + 800:
        guard += 1
        idx = iters['n'] - base
        want = tl[min(idx + 1, len(tl) - 1)] if tl else set()
        for name in want - held:
            pb.button_press(name)
        for name in held - want:
            pb.button_release(name)
        held = want
        pb.tick(1, False)
    for a in counts:
        print(f'${a:04X}  hits={counts[a]:6d}  first_iter={firsts.get(a, "-")}')
    pb.stop(save=False)


# --------------------------------------------------------------------------
def cmd_cling(args):
    """Per-frame cling trace + which probes ran inside each iteration."""
    pb = make()
    iters = {'n': 0}
    rows = []
    per = {'ceil': 0, 'floor': 0, 'ceilhit': 0, 'land': 0}

    def on_frame(_):
        m = pb.memory
        rows.append(dict(f=iters['n'], air=m[0xFF80], vy=m[0xFF87],
                         cling=m[0xFFB2], yhi=m[0xFF83], ylo=m[0xFF84],
                         xhi=m[0xFF81], xlo=m[0xFF82], vx=m[0xFF86],
                         ceil=per['ceil'], floor=per['floor']))
        per['ceil'] = 0
        per['floor'] = 0
        iters['n'] += 1

    pb.hook_register(0, FRAME_END, on_frame, None)
    pb.hook_register(0, 0x1EA6, lambda _: per.__setitem__('ceil', per['ceil'] + 1), None)
    pb.hook_register(0, 0x1DB9, lambda _: per.__setitem__('floor', per['floor'] + 1), None)

    boot_to_gameplay(pb, level=args.level)
    for name in set(BUTTONS.values()):
        pb.button_release(name)
    base = iters['n']
    rows.clear()
    if args.warp:
        parts = args.warp.split(',')
        pb.memory[0xFF81] = int(parts[0]) & 0xFF
        pb.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pb.memory[0xFF83] = int(parts[1]) & 0xFF
            pb.memory[0xFF84] = 0
    tl = parse_script(args.script)
    held = set()
    guard = 0
    while iters['n'] - base < args.frames and guard < args.frames * 8 + 800:
        guard += 1
        idx = iters['n'] - base
        want = tl[min(idx + 1, len(tl) - 1)] if tl else set()
        for name in want - held:
            pb.button_press(name)
        for name in held - want:
            pb.button_release(name)
        held = want
        pb.tick(1, False)

    print(' f  air  vy  cling  x        y       vx  ceilProbes floorProbes')
    for r in rows:
        print(f"{r['f'] - base:3d} {r['air']:3d} {r['vy']:4d} "
              f" ${r['cling']:02X}   ${r['xhi']:02X}{r['xlo']:02X}   ${r['yhi']:02X}{r['ylo']:02X}  "
              f"{r['vx']:4d}   {r['ceil']:5d}      {r['floor']:5d}")
    pb.stop(save=False)


# --------------------------------------------------------------------------
def cmd_kb4(args):
    """Force a fresh knockback stamp on level 4 and read the vy the ROM picks."""
    pb = make()
    iters = {'n': 0}
    pb.hook_register(0, FRAME_END, lambda _: iters.__setitem__('n', iters['n'] + 1), None)
    seen = []
    # $1796 is where A (the vx) is stored; sample $FF87 right after $17B4/$17AE
    pb.hook_register(0, 0x17AC, lambda _: seen.append('17AC:$40'), None)
    pb.hook_register(0, 0x17B2, lambda _: seen.append('17B2:$18'), None)

    boot_to_gameplay(pb, level=args.level)
    for name in set(BUTTONS.values()):
        pb.button_release(name)
    # settle a few frames
    for _ in range(20):
        pb.tick(1, False)
    seen.clear()
    m = pb.memory
    m[0xC73F] = args.crit
    m[0xC714] = args.stamp
    before = (m[0xFF87], m[0xFF86], m[0xFF80])
    n0 = iters['n']
    while iters['n'] - n0 < 2:
        pb.tick(1, False)
    after = (m[0xFF87], m[0xFF86], m[0xFF80])
    print(f'level={args.level} $C73F={args.crit} $C714=${args.stamp:02X}')
    print(f'  before: vy={before[0]:3d} vx={before[1]:3d} air={before[2]}')
    print(f'  after : vy={after[0]:3d} vx={after[1]:3d} air={after[2]}')
    print(f'  arms  : {seen}')
    pb.stop(save=False)


def main():
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest='cmd', required=True)

    def common(p):
        p.add_argument('--level', type=int, default=1)
        p.add_argument('--frames', type=int, default=120)
        p.add_argument('--script', default='120:')
        p.add_argument('--warp', default=None)

    p = sub.add_parser('sound'); common(p); p.set_defaults(fn=cmd_sound)
    p = sub.add_parser('arms'); common(p)
    p.add_argument('--addr', nargs='+', required=True)
    p.set_defaults(fn=cmd_arms)
    p = sub.add_parser('cling'); common(p); p.set_defaults(fn=cmd_cling)
    p = sub.add_parser('kb4')
    p.add_argument('--level', type=int, default=4)
    p.add_argument('--crit', type=int, default=1)
    p.add_argument('--stamp', type=lambda s: int(s, 0), default=0x5A)
    p.set_defaults(fn=cmd_kb4)

    args = ap.parse_args()
    args.fn(args)


if __name__ == '__main__':
    main()
