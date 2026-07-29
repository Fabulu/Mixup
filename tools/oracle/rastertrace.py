#!/usr/bin/env python3
"""Per-SCANLINE reference trace of the $0857 STAT program.

A raster effect is not a frame-level quantity, so no frame-level oracle can
settle it and no screenshot can either -- 160x144 has twice said "identical"
while the register stream was wrong.  This records the stream itself.

WHAT IT HOOKS, and why those addresses

  $0A4F  sub_00_0A4F, the main loop's VBlank wait.  Same frame marker trace.py
         uses, so a frame number here means the same iteration it does.
  $0852  the tail of the VBlank half ($081E-$0851) -- AFTER rSCX/rSCY/rBGP/
         rOBP0/rOBP1/rWX/rWY have been pushed from $FFA9-$FFAF and after the
         mode-7 delta ramp.  This is the base every scanline starts from.
  the eight STAT arm exits.  Each arm is hooked at its own last instruction
  before the RETI, so the sample is taken with that arm's writes already
  landed and with rLYC already reprogrammed for the NEXT arm:

         $0896 mode 0 ($FFCC parallax + $FFAA-2)   -> next mode 1, rLYC $70
         $08A7 mode 1 (back to $FFA9/$FFAA)        -> next mode 0, rLYC $22
         $08BA mode 2 ($C742 far)                  -> next mode 3, rLYC $30
         $08DB mode 3 ($C743 mid, +3 SCY)          -> next mode 4, rLYC $40
         $08E8 mode 4 (back to $FFA9)              -> next mode 2, rLYC $00
         $08EE mode 5 (rWX = $A8)                  -> no rearm
         $0931 mode 6 (the $09A2 wobble + OBPs)    -> rLYC += 4, or $C755
         $095B mode 7 (the OPTIONS squash)         -> rLYC += 1

  rLY is read at every one of those, so the line a band STARTS on is MEASURED.
  Nothing here is inferred from the listing.

FRAME GROUPING.  The main loop body runs during the VISIBLE part of the frame
it just produced, so grouping on $0A4F alone would slice a display frame in
half.  The grouping used is: sample($0A4F) N -> the next $0852 -> every STAT
event until the following $0852.  That block is display frame N, and the
registers in it came from iteration N's $FFA9/$FFAA -- which is exactly the
pair one port tick() + rasterBands() produces.

Usage:
  python tools/oracle/rastertrace.py --level 9 --frames 200
  python tools/oracle/rastertrace.py --level 1 --frames 400 --warp 74
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from pyboy import PyBoy                                   # noqa: E402
from trace import (ROM, ROOT, FRAME_END, BUTTONS,         # noqa: E402
                   boot_to_gameplay, parse_script)

VBLANK_TAIL = 0x0852
STAT_ISR = 0x0857          # the $0048 vector's target, before the dispatch
LAG = 0xC757

# The main loop body runs during the VISIBLE part of the frame it is scrolling,
# so "did the feeder run before the band that reads it?" is a RACE, and it has
# to be measured rather than assumed. These are the three feeders:
#
#   $058B  the levels 9/10/11 layer advance ($C742 / $C743)
#   $2F5C  loc_00_2EF4's store to $FFCC, the level-6 track scroll
#   $2E65  the water's store to $C755, the mode-6 chain's start line
#
# Measured on level 9: $058B beats the line-$30 band on 299 frames out of 299,
# and beats the LINE-0 band on 67 of the 75 frames where it changes anything --
# but loses it on two contiguous stretches (f111-f123, f275-f287) where the
# VBlank ISR evidently overran into LY 0. That is instruction-level timing, out
# of scope by docs/03-VERIFICATION.md section 28, so scenarios are capped below
# the first flip exactly as they are capped below the first lag frame.
FEEDERS = {0x058B: 'layers', 0x2F5C: 'track', 0x2E65: 'water'}

# arm-exit address -> the mode whose writes are now in the registers
ARMS = {0x0896: 0, 0x08A7: 1, 0x08BA: 2, 0x08DB: 3, 0x08E8: 4,
        0x08EE: 5, 0x0931: 6, 0x095B: 7}

rLY, rLYC, rSCX, rSCY, rBGP, rOBP0, rOBP1, rWX, rWY = (
    0xFF44, 0xFF45, 0xFF43, 0xFF42, 0xFF47, 0xFF48, 0xFF49, 0xFF4B, 0xFF4A)


def regs(m):
    return {'ly': m[rLY], 'lyc': m[rLYC], 'scx': m[rSCX], 'scy': m[rSCY],
            'bgp': m[rBGP], 'obp0': m[rOBP0], 'obp1': m[rOBP1],
            'wx': m[rWX], 'wy': m[rWY]}


def inputs(m):
    """The RAM the STAT program reads, so a divergence can be attributed."""
    return {
        'ffa9': m[0xFFA9], 'ffaa': m[0xFFAA],       # base SCX / SCY
        'ffad': m[0xFFAD], 'ffae': m[0xFFAE], 'ffaf': m[0xFFAF],  # BGP/OBPs
        'ffab': m[0xFFAB], 'ffac': m[0xFFAC],       # WX / WY shadows
        'ffb1': m[0xFFB1], 'ffc7': m[0xFFC7], 'ffcc': m[0xFFCC],
        'c716': m[0xC716], 'c742': m[0xC742], 'c743': m[0xC743],
        'c755': m[0xC755], 'c763': m[0xC763], 'c766': m[0xC766],
        'ie': m[0xFFFF], 'stat': m[0xFF41],
        'camX': (m[0xFFA2] << 8) | m[0xFFA3],
        'camY': (m[0xFFA4] << 8) | m[0xFFA5],
        'lag': m[LAG],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=200)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=9)
    ap.add_argument('--warp', default=None, metavar='COL[,ROW]')
    ap.add_argument('--out', default='rip/oracle')
    args = ap.parse_args()

    script = args.script or f'{args.frames}:'
    timeline = parse_script(script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory

    ev = []          # flat, chronological: ('s'|'v'|arm mode, payload)

    def on_sample(_):
        ev.append(('s', inputs(m)))

    def on_vblank(_):
        ev.append(('v', regs(m)))

    # rLY at the arm's EXIT is not the line the band starts on -- the mode-6
    # handler is 28 instructions and the LYC=0 dispatch is late enough that the
    # exit reads 1 for a band the machine began servicing on line 0. So the
    # start line comes from the ISR's FIRST instruction and the registers from
    # its last, and the two are paired here.
    entry = {'ly': 0}
    pyboy.hook_register(0, STAT_ISR,
                        lambda _: entry.__setitem__('ly', m[rLY]), None)
    pyboy.hook_register(0, FRAME_END, on_sample, None)
    pyboy.hook_register(0, VBLANK_TAIL, on_vblank, None)
    for addr, tag in FEEDERS.items():
        pyboy.hook_register(0, addr,
                            (lambda t: lambda _: ev.append(('f', t)))(tag), None)
    for addr, mode in ARMS.items():
        def mk(mode):
            def cb(_):
                r = regs(m)
                r['mode'] = mode
                r['lyExit'] = r['ly']
                r['ly'] = entry['ly']
                # $FFB1 and $C755 as the ARM saw them -- both are read inside
                # the handler, and both are moved by code that runs during the
                # visible frame, so neither can be taken from the frame sample.
                r['ffb1'] = m[0xFFB1]
                r['c755'] = m[0xC755]
                # $FFA9/$FFAA LIVE. Every arm that adds to the camera reads
                # them at the scanline, and the camera routine ($05B7 ->
                # $131C/$1324) has already run by then -- so an arm below line
                # ~30 is scrolling by the NEXT iteration's camera while the
                # VBlank base below it holds THIS one's. The cartridge's own
                # picture is inconsistent; see rasterdiff.mjs.
                r['ffa9'] = m[0xFFA9]
                r['ffaa'] = m[0xFFAA]
                ev.append(('a', r))
            return cb
        pyboy.hook_register(0, addr, mk(mode), None)

    boot_frame = boot_to_gameplay(pyboy, level=args.level)
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)

    # ASSERT ARRIVAL: a probe that never got there once produced two entirely
    # fictitious dumps (docs/03-VERIFICATION.md, the method section).
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, got {m[0xFFB0]}')

    base = max(0, sum(1 for e in ev if e[0] == 's') - 1)

    if args.warp is not None:
        parts = args.warp.split(',')
        m[0xFF81] = int(parts[0]) & 0xFF
        m[0xFF82] = 0x80
        if len(parts) > 1:
            m[0xFF83] = int(parts[1]) & 0xFF
            m[0xFF84] = 0x00

    held = set()
    guard = 0
    def nsamples():
        return sum(1 for e in ev if e[0] == 's')
    while nsamples() - base < args.frames + 1 and guard < args.frames * 8 + 800:
        guard += 1
        idx = nsamples() - base
        # The +1 is trace.py's INPUT LEAD and it is load-bearing: the game
        # reads the joypad in its VBlank ISR and the loop that consumes it runs
        # during PyBoy's next tick, so buttons have to be held one tick early
        # for the cartridge to act on them on the same numbered frame as the
        # port. Dropping it made every scripted scenario one frame late, which
        # showed up here as a phantom $FFCC bug in src/conveyor.js -- caught
        # only because subsystrace.py, which has the lead, disagreed.
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for name in want - held:
            pyboy.button_press(name)
        for name in held - want:
            pyboy.button_release(name)
        held = want
        pyboy.tick(1, False)

    # --- group: sample N -> next 'v' -> every 'a' until the following 'v' ---
    frames = []
    seen = 0
    i = 0
    while i < len(ev) and len(frames) < args.frames:
        if ev[i][0] != 's':
            i += 1
            continue
        seen += 1
        if seen <= base:
            i += 1
            continue
        j = i + 1
        while j < len(ev) and ev[j][0] != 'v':
            j += 1
        if j >= len(ev):
            break
        rec = {'f': len(frames) + 1, 'in': ev[i][1], 'base': ev[j][1],
               'bands': [], 'feedFirst': {}}
        k = j + 1
        while k < len(ev) and ev[k][0] != 'v':
            if ev[k][0] == 'a':
                rec['bands'].append(ev[k][1])
            elif ev[k][0] == 'f' and ev[k][1] not in rec['feedFirst']:
                # the band index this feeder beat: 0 = it ran before every
                # band of the frame, n = it ran after the first n of them.
                rec['feedFirst'][ev[k][1]] = len(rec['bands'])
            k += 1
        frames.append(rec)
        i = j

    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, f'raster_L{args.level:02d}.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-oracle', 'level': args.level,
                   'script': script, 'warp': args.warp,
                   'bootFrame': boot_frame, 'frames': frames}, fh)

    lags = [f['f'] for f in frames if f['in']['lag']]
    print(f'level {args.level}, {len(frames)} frames, script "{script}"')
    print(f'$FFC7 = {frames[0]["in"]["ffc7"]}, rIE = ${frames[0]["in"]["ie"]:02X}, '
          f'rSTAT = ${frames[0]["in"]["stat"]:02X}')
    counts = sorted({len(f['bands']) for f in frames})
    print(f'STAT fires per frame: {counts}')
    for tag in sorted({t for f in frames for t in f['feedFirst']}):
        hist = {}
        for f in frames:
            hist[f['feedFirst'].get(tag, -1)] = hist.get(tag, 0) + 1
        pos = sorted(f['feedFirst'].get(tag, -1) for f in frames)
        print(f'feeder {tag}: ran before band index '
              f'{sorted(set(pos))} (-1 = not at all this frame)')
        flips = [f['f'] for f in frames if f['feedFirst'].get(tag, -1) != pos[0]]
        if flips:
            print(f'  ORDERING FLIP on frames {flips[:12]}'
                  f'{" ..." if len(flips) > 12 else ""} -- cap below f{flips[0]}')
    for f in frames[:3]:
        print(f'  f{f["f"]}: base scx={f["base"]["scx"]} scy={f["base"]["scy"]} '
              f'| ' + ', '.join(f'ly{b["ly"]}:m{b["mode"]} scx={b["scx"]} '
                                f'scy={b["scy"]}' for b in f['bands'][:6]))
    print(f'lag frames ($C757): {lags if lags else "none"}')
    print(f'wrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
