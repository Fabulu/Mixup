#!/usr/bin/env python3
"""Cue-stream oracle: every sub_00_0AE1 request the cartridge makes, per frame.

The sound DRIVER is already bit-exact.  What is not measured anywhere is the
EDGE: which cue id / mask each game routine asks for, and when.  This hooks
every `CALL sub_00_0AE1` site in banks 0 and 1 (they are the only banks that
call it) so each request is attributed to its caller, and stamps it with the
main-loop iteration it happened on -- the same frame numbering trace.py uses.

Also snapshots the $C6FB mailbox at frame end so queue overflow (a request the
cartridge itself DROPS) is visible.

Usage:
  python tools/oracle/cuetrace.py --frames 400 --script "20:,380:R" --level 1
  python tools/oracle/cuetrace.py --frames 400 --level 5 --warp 40 --ammo 9
"""
import argparse
import json
import os
import re

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
DIS = os.path.join(ROOT, 'disasm')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
LEVEL_INIT = 0x04BB

BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down',
           'A': 'a', 'B': 'b'}


def parse_script(script):
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        names = {BUTTONS[k.upper()] for k in keys.strip() if k.upper() in BUTTONS}
        out.extend([names] * int(n))
    return out


def call_sites():
    """Every `CALL sub_00_0AE1` address, per bank, from the disassembly."""
    sites = []
    for bank in (0, 1):
        path = os.path.join(DIS, 'bank_%02d.asm' % bank)
        for line in open(path, encoding='utf-8', errors='replace'):
            if 'CALL sub_00_0AE1' in line:
                m = re.match(r'\s*([0-9A-F]{4}):', line)
                if m:
                    sites.append((bank, int(m.group(1), 16)))
    return sites


def boot_to_gameplay(pyboy, max_frames=2000, level=1):
    started = {'frame': None}
    ctx = {'f': 0}
    if level != 1:
        pyboy.hook_register(
            0, LEVEL_INIT,
            lambda _: pyboy.memory.__setitem__(0xFFB0, level), None)
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda c: started.__setitem__('frame', c['f'])
                        if started['frame'] is None else None, ctx)
    for f in range(max_frames):
        ctx['f'] = f
        if started['frame'] is not None:
            return f
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    raise RuntimeError('gameplay never started')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=300)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--out', default='rip/cue')
    ap.add_argument('--name', default=None)
    ap.add_argument('--ammo', type=int, default=None)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--hp', type=int, default=None)
    args = ap.parse_args()

    script = args.script or f'{args.frames}:R'
    timeline = parse_script(script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    frames = []          # one entry per completed main-loop iteration
    cues = []            # (frame, bank, site, id, mask, dropped)
    cur = {'n': 0}

    def on_frame_end(_):
        cur['n'] += 1
        m = pyboy.memory
        frames.append([m[0xC6FB + i] for i in range(8)])

    pyboy.hook_register(0, FRAME_END, on_frame_end, None)

    # ONE hook, at sub_00_0AE1 itself.  PyBoy silently drops hooks past a
    # fixed table size -- registering all 66 call sites made $062E and every
    # in-game site stop firing while $0AE1 still worked, which is exactly the
    # "a test can silently stop testing" failure mode.  The caller is
    # recovered from the stack instead: CALL has just pushed the return
    # address, so [SP] is site+3, and $C703 is the game's own bank mirror.
    known = {'%02X:%04X' % (b, a): True for b, a in call_sites()}

    def on_request(_):
        r = pyboy.register_file
        mem = pyboy.memory
        sp = r.SP
        ret = mem[sp] | (mem[sp + 1] << 8)
        site = ret - 3
        bank = 0 if site < 0x4000 else mem[0xC703]
        tag = '%02X:%04X' % (bank, site)
        free = any(mem[0xC6FB + 2 * i] == 0 and mem[0xC6FC + 2 * i] == 0
                   for i in range(4))
        cues.append({'f': cur['n'], 'site': tag, 'known': tag in known,
                     'id': r.B, 'mask': r.C, 'dropped': not free})

    pyboy.hook_register(0, 0x0AE1, on_request, None)

    boot_frame = boot_to_gameplay(pyboy, level=args.level)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)

    base = max(0, cur['n'] - 1)

    if args.ammo is not None:
        pyboy.memory[0xC759] = args.ammo & 0xFF
    if args.hp is not None:
        pyboy.memory[0xFF8A] = args.hp & 0xFF
    if args.warp is not None:
        parts = args.warp.split(',')
        pyboy.memory[0xFF81] = int(parts[0]) & 0xFF
        pyboy.memory[0xFF82] = 0x80
        if len(parts) > 1:
            pyboy.memory[0xFF83] = int(parts[1]) & 0xFF
            pyboy.memory[0xFF84] = 0x00

    held = set()
    guard = 0
    while cur['n'] - base < args.frames and guard < args.frames * 8 + 500:
        guard += 1
        idx = cur['n'] - base
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for name in want - held:
            pyboy.button_press(name)
        for name in held - want:
            pyboy.button_release(name)
        held = want
        pyboy.tick(1, False)

    # Frame 0 is the level-init iteration: $0F52's music request lands there,
    # BEFORE the recording window, and the port emits it on its frame 1.
    # Keeping it makes the two comparable instead of showing a phantom extra.
    out = [dict(c, f=max(1, c['f'] - base))
           for c in cues if 0 <= c['f'] - base <= args.frames]

    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    nm = args.name or ('L%02d' % args.level)
    path = os.path.join(outdir, 'cue_%s.json' % nm)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-oracle', 'script': script, 'level': args.level,
                   'ammo': args.ammo, 'warp': args.warp, 'hp': args.hp,
                   'frames': args.frames, 'cues': out}, fh, indent=1)

    print('level %d  script "%s"  %d frames -> %d cues'
          % (args.level, script, args.frames, len(out)))
    for c in out:
        print('  f%-5d %s%s  id=$%02X mask=$%02X%s'
              % (c['f'], c['site'], '' if c['known'] else '?', c['id'], c['mask'],
                 '   *** DROPPED (mailbox full)' if c['dropped'] else ''))
    print('wrote', path)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
