#!/usr/bin/env python3
"""The $C6FB sound mailbox, measured: who posts, who consumes, and how late.

sounddiff.mjs proves the DRIVER bit-exact from the tick a request is picked
up.  What nothing measured is the stage in FRONT of it -- the four-slot
mailbox at $C6FB and the timer ISR that drains it.

That stage is not a queue.  sub_00_0AE1 ($0AE5-$0B07) takes the FIRST slot
whose two bytes are both zero, and drops the request outright when there is
none.  The ISR at $096C reads ONE slot per tick, at the cursor in $FFA1, and
advances that cursor by 2 with a wrap at 7 EVERY tick whether the slot held
anything or not -- so the four slots are served strictly round robin.  A cue
therefore waits 1 to 4 driver ticks, depending only on where the cursor
happens to be, and a busy frame can lose one entirely.

This records both halves off the cartridge:

  * every sub_00_0AE1 call -- id, mask, the slot it took (or DROPPED), and how
    many ISR ticks had already run when it was made;
  * every ISR tick -- the cursor, and what it found in the slot it read.

tools/oracle/mailboxdiff.mjs replays the same posting schedule through
src/sound/driver.js and requires the per-request latency and the drops to
agree exactly.

Usage:
  python tools/oracle/mailbox.py --frames 1200 --level 1 --name L01
  python tools/oracle/mailbox.py --frames 900 --level 12 --name L12
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB
POST = 0x0AE1          # sub_00_0AE1, entry: a request was MADE
STORE = 0x0AF8         # `LD [HL+],A` inside the DI: it LANDED, and HL says where
ISR = 0x096C           # past $095F's $FFEA re-entrancy guard: one driver tick
QUEUE = 0xC6FB
CURSOR = 0xFFA1

BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down',
           'A': 'a', 'B': 'b', 'S': 'start'}


def parse_script(script):
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        names = {BUTTONS[k.upper()] for k in keys.strip() if k.upper() in BUTTONS}
        out.extend([names] * int(n))
    return out


def boot_to_gameplay(pyboy, level, started, max_frames=2000):
    """`started` is flipped by the caller's own MAIN_LOOP hook -- there is only
    one hook slot per address, and --spam wants it too."""
    if level != 1:
        pyboy.hook_register(
            0, LEVEL_INIT,
            lambda _: pyboy.memory.__setitem__(0xFFB0, level), None)
    for f in range(max_frames):
        if started['v']:
            return
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    raise RuntimeError('gameplay never started')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=1200)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--name', default=None)
    ap.add_argument('--warp', default=None)
    ap.add_argument('--ammo', type=int, default=None)
    ap.add_argument('--out', default='rip/oracle')
    ap.add_argument('--spam', type=lambda v: int(v, 0), default=None,
                    help='post one synthetic request per main-loop frame, '
                         'using sub_00_0AE1\'s own first-free rule, to measure '
                         'what the ISR does when the producer outruns it. '
                         'Mask 0, so nothing is actually played.')
    args = ap.parse_args()

    # Something has to MAKE noise, or the histogram is empty. Jumping is the
    # cheapest generator: $1A15 asks for cue $10 on every launch.
    script = args.script or '4:,6:A,4:,6:RA,8:R,6:LA,4:,6:B'
    timeline = parse_script(script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    mem = pyboy.memory

    ticks = {'n': 0}
    posts = []            # one per sub_00_0AE1 call
    reads = []            # one per ISR tick
    live = {}             # slot -> index into posts

    # HOOK THE STORE, NOT THE ENTRY. $0AE1's slot scan ($0AE5-$0B01) runs with
    # interrupts ENABLED -- only the two-byte write at $0AF6-$0AFB is inside a
    # DI. So the timer ISR can free a slot in the middle of the scan, and a
    # snapshot taken at the routine's entry says "full" for a request that then
    # lands perfectly well. Measured: exactly one of 666 in the --spam run, and
    # it was the recorder that was wrong, not the port. Take the slot from HL
    # at the store instead, where it cannot be raced.
    def on_post(_):
        r = pyboy.register_file
        posts.append({'tick': ticks['n'], 'id': r.B, 'mask': r.C,
                      'slot': None, 'consumed': None})

    def on_store(_):
        if not posts:
            return
        slot = (pyboy.register_file.HL - QUEUE) >> 1
        if not 0 <= slot < 4:
            return
        posts[-1]['slot'] = slot
        live[slot] = len(posts) - 1

    def on_isr(_):
        cur = mem[CURSOR]
        slot = cur >> 1
        cid, cmask = mem[QUEUE + cur], mem[QUEUE + cur + 1]
        n = ticks['n']
        reads.append({'tick': n, 'cursor': cur,
                      'id': cid, 'mask': cmask})
        if (cid or cmask) and slot in live:
            posts[live.pop(slot)]['consumed'] = n
        ticks['n'] = n + 1

    pyboy.hook_register(0, POST, on_post, None)
    pyboy.hook_register(0, STORE, on_store, None)
    pyboy.hook_register(0, ISR, on_isr, None)

    # --spam: the producer side, driven from the main loop at one request per
    # FRAME, which is what a cue spammed on consecutive frames looks like. It
    # uses $0AE5's rule verbatim (first slot whose two bytes are both zero,
    # otherwise drop) so what is being measured is the ISR's drain rate, not
    # the scan. Mask 0 keeps the driver from acting on any of it.
    spam = {'on': False}
    started = {'v': False}

    def on_frame(_):
        started['v'] = True
        if not spam['on']:
            return
        slot = None
        for s in range(4):
            if mem[QUEUE + s * 2] == 0 and mem[QUEUE + s * 2 + 1] == 0:
                slot = s
                break
        idx = len(posts)
        posts.append({'tick': ticks['n'], 'id': args.spam & 0xFF, 'mask': 0,
                      'slot': slot, 'consumed': None})
        if slot is not None:
            mem[QUEUE + slot * 2] = args.spam & 0xFF
            mem[QUEUE + slot * 2 + 1] = 0
            live[slot] = idx

    pyboy.hook_register(0, MAIN_LOOP, on_frame, None)

    boot_to_gameplay(pyboy, args.level, started)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)

    if args.ammo is not None:
        mem[0xC759] = args.ammo & 0xFF
    if args.warp is not None:
        parts = args.warp.split(',')
        mem[0xFF81] = int(parts[0]) & 0xFF
        mem[0xFF82] = 0x80
        if len(parts) > 1:
            mem[0xFF83] = int(parts[1]) & 0xFF
            mem[0xFF84] = 0x00

    # Everything above this line is boot noise; the recording starts here.
    base_tick = ticks['n']
    base_post = len(posts)
    base_read = len(reads)
    spam['on'] = args.spam is not None

    held = set()
    for f in range(args.frames):
        want = timeline[f % len(timeline)]
        for name in want - held:
            pyboy.button_press(name)
        for name in held - want:
            pyboy.button_release(name)
        held = want
        pyboy.tick(1, False)

    out_posts = [dict(p, tick=p['tick'] - base_tick,
                      consumed=None if p['consumed'] is None
                      else p['consumed'] - base_tick)
                 for p in posts[base_post:]]
    out_reads = [dict(r, tick=r['tick'] - base_tick) for r in reads[base_read:]]

    hist = {}
    lat = []
    for p in out_posts:
        if p['slot'] is None or p['consumed'] is None:
            continue
        d = p['consumed'] - p['tick'] + 1
        lat.append(d)
        hist[d] = hist.get(d, 0) + 1
    drops = sum(1 for p in out_posts if p['slot'] is None)

    nm = args.name or ('L%02d' % args.level)
    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, 'mailbox_%s.json' % nm)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-oracle', 'level': args.level,
                   'script': script, 'frames': args.frames,
                   'ticks': len(out_reads), 'posts': out_posts,
                   'reads': out_reads}, fh)

    mean = sum(lat) / len(lat) if lat else 0
    print('level %d  %d frames  %d driver ticks' % (args.level, args.frames, len(out_reads)))
    print('  %d requests, %d dropped (mailbox full)' % (len(out_posts), drops))
    print('  latency histogram %s  mean %.2f ticks (%.0f ms)'
          % ({k: hist[k] for k in sorted(hist)}, mean, mean * 1000 / 59.36))
    cursors = {}
    for r in out_reads:
        cursors[r['cursor']] = cursors.get(r['cursor'], 0) + 1
    print('  cursor visits %s' % {k: cursors[k] for k in sorted(cursors)})
    print('wrote', path)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
