#!/usr/bin/env python3
"""Reference trace: run the REAL ROM under PyBoy and dump per-frame state.

Boots through the logo/title/round-select automatically, waits for gameplay to
start, then applies a scripted input sequence and records the same state vector
that tools/render-frame.mjs records for the JS port -- so the two can be
diffed frame by frame.

The emulator never ships; this is a test oracle only.

Usage:
  python tools/oracle/trace.py --frames 120 --script "20:,40:R,10:RA,50:R"
  python tools/oracle/trace.py --level 1 --out rip/oracle
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F   # sub_00_0A4F: the main loop's VBlank wait
LEVEL_INIT = 0x04BB  # one instruction after the route dispatcher writes $FFB0

# docs/00-MASTER-REFERENCE.md §3, §4
A = dict(air=0xFF80, xhi=0xFF81, xlo=0xFF82, yhi=0xFF83, ylo=0xFF84,
         vx=0xFF86, vy=0xFF87, facing=0xFF88, hp=0xFF8A,
         turn=0xFF8F, throttle=0xFF98,
         camxhi=0xFFA2, camxlo=0xFFA3, camyhi=0xFFA4, camylo=0xFFA5,
         level=0xFFB0, frame=0xFFB1, anim=0xFFC3, animframe=0xFFC4,
         cling=0xFFB2, jumprel=0xFFC2, slow=0xFF95,
         action=0xC71E, carryx=0xC72F, iframes=0xC714, probemode=0xC72B,
         atktimer=0xFF97, atkpose=0xC71D, ammo=0xC759, msindex=0xFF8B,
         bat0=0xC4B0, bat0x=0xC4B1, bat0spd=0xC4B5,
         bat1=0xC4B9, bat2=0xC4C2,
         bk0t=0xC67B, bk0c=0xC67C, bk0r=0xC67D, bk1t=0xC67E, bk2t=0xC681,
         en0f=0xC268, en0s=0xC26A, en0x=0xC276, en0hp=0xC27E,
         en1f=0xC288, en2f=0xC2A8)

BUTTONS = {'R': 'right', 'L': 'left', 'U': 'up', 'D': 'down',
           'A': 'a', 'B': 'b'}


def s8(v):
    return v - 256 if v > 127 else v


def parse_script(script):
    """'20:,40:R,10:RA' -> list of per-frame button-name sets."""
    out = []
    for seg in script.split(','):
        n, _, keys = seg.partition(':')
        names = {BUTTONS[k.upper()] for k in keys.strip() if k.upper() in BUTTONS}
        out.extend([names] * int(n))
    return out


def boot_to_gameplay(pyboy, max_frames=2000, level=1):
    """Tap START through the menus until the main loop starts running.

    For any level other than 1, $FFB0 is injected the instant execution reaches
    loc_00_04BB -- one instruction after the route dispatcher at $04B9 writes
    exactly that byte, so the level then loads through the game's own code
    path. tools/verify_assets.py cross-checked injection against real route
    entry for levels 1/5/9: $D000, VRAM, $C368, $C268, $C1E8 and the player
    position all come out byte-identical.
    """
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
    raise RuntimeError('gameplay never started - menu navigation failed')


def sample(mem):
    m = mem
    return {
        'x': (m[A['xhi']] << 8) | m[A['xlo']],
        'y': (m[A['yhi']] << 8) | m[A['ylo']],
        'vx': s8(m[A['vx']]),
        'vy': s8(m[A['vy']]),
        'air': m[A['air']],
        'facing': m[A['facing']],
        'hp': m[A['hp']],
        'anim': m[A['anim']],
        'animFrame': m[A['animframe']],
        'turn': m[A['turn']],
        'throttle': m[A['throttle']],
        'camX': (m[A['camxhi']] << 8) | m[A['camxlo']],
        'camY': (m[A['camyhi']] << 8) | m[A['camylo']],
        'level': m[A['level']],
        'cling': m[A['cling']],
        'jumpRel': m[A['jumprel']],
        'slow': m[A['slow']],
        'action': m[A['action']],
        'carryX': s8(m[A['carryx']]),
        'iframes': m[A['iframes']],
        'msIndex': m[A['msindex']],
        'atkTimer': m[A['atktimer']],
        'atkPose': m[A['atkpose']],
        'ammo': m[A['ammo']],
        'bat0': m[A['bat0']],
        'bat0x': (m[A['bat0x']] << 8) | m[A['bat0x'] + 1],
        'bat0spd': m[A['bat0spd']],
        'bat1': m[A['bat1']],
        'bat2': m[A['bat2']],
        'bk0t': m[A['bk0t']], 'bk0c': m[A['bk0c']], 'bk0r': m[A['bk0r']],
        'bk1t': m[A['bk1t']], 'bk2t': m[A['bk2t']],
        'en0f': m[A['en0f']], 'en0s': m[A['en0s']],
        'en0x': (m[A['en0x']] << 8) | m[A['en0x'] + 1],
        'en0hp': m[A['en0hp']],
        'en1f': m[A['en1f']], 'en2f': m[A['en2f']],
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--frames', type=int, default=120)
    ap.add_argument('--script', default=None)
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--out', default='rip/oracle')
    ap.add_argument('--settle', type=int, default=0,
                    help='extra frames to run after gameplay starts, before recording')
    ap.add_argument('--ammo', type=int, default=None,
                    help='inject batarang ammo ($C759) once gameplay starts, so '
                         'the throw path can be tested without walking to a pickup')
    args = ap.parse_args()

    script = args.script or f'{args.frames}:R'
    timeline = parse_script(script)

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)

    # Sample at the main loop's VBlank wait, NOT at the PyBoy tick boundary.
    # The tick boundary slices the loop mid-head: some ticks contain two
    # executions of the camera routine and some contain none, purely from
    # where the slice falls. That is a sampling artifact, and it made the
    # camera look impure when the port was in fact correct. At $0A4F the
    # player fields are post-update and the camera holds this iteration's
    # output -- exactly the pair one JS tick() produces.
    samples = []
    pyboy.hook_register(0, FRAME_END,
                        lambda _: samples.append(sample(pyboy.memory)), None)

    boot_frame = boot_to_gameplay(pyboy, level=args.level)

    # Release everything the menu navigation left held.
    for name in set(BUTTONS.values()):
        pyboy.button_release(name)
    for _ in range(args.settle):
        pyboy.tick(1, False)

    # boot_to_gameplay returns having already run the first gameplay iteration,
    # whose $0A4F sample is the last one collected. Treat that as frame 1.
    base = max(0, len(samples) - 1)

    if args.ammo is not None:
        pyboy.memory[0xC759] = args.ammo & 0xFF

    # Input lead. The game reads the joypad in its VBlank ISR, and the main
    # loop that consumes it runs immediately after -- i.e. during PyBoy's NEXT
    # tick. So buttons must be held one tick EARLY for the real game to act on
    # them on the same numbered frame as the port. Without this every input
    # response is reported as a one-frame divergence and drowns out real bugs.
    #
    # The loop is driven by COMPLETED MAIN-LOOP ITERATIONS, not by ticks, so a
    # tick that happens to contain zero or two iterations cannot skew it.
    held = set()
    guard = 0
    while len(samples) - base < args.frames and guard < args.frames * 8 + 500:
        guard += 1
        idx = len(samples) - base            # iterations completed so far
        want = timeline[min(idx + 1, len(timeline) - 1)] if timeline else set()
        for name in want - held:
            pyboy.button_press(name)
        for name in held - want:
            pyboy.button_release(name)
        held = want
        pyboy.tick(1, False)

    trace = []
    for i, row in enumerate(samples[base:base + args.frames]):
        row['f'] = i + 1
        trace.append(row)

    outdir = os.path.join(ROOT, args.out)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, f'trace_L{args.level:02d}.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'source': 'pyboy-oracle', 'script': script,
                   'bootFrame': boot_frame, 'frames': trace}, fh, indent=1)

    print(f'gameplay started at emulator frame {boot_frame}')
    print(f'level {trace[0]["level"]}, {args.frames} frames, script "{script}"')
    print(f'{"frame":>6} {"x":>7} {"y":>7} {"vx":>5} {"vy":>5} {"air":>4} '
          f'{"anim":>5} {"camX":>7}')
    for t in trace:
        if t['f'] in (1, 2, 5, 10, 30, 60, 90, args.frames):
            print(f'{t["f"]:6d} {t["x"]:7d} {t["y"]:7d} {t["vx"]:5d} '
                  f'{t["vy"]:5d} {t["air"]:4d} {t["anim"]:5d} {t["camX"]:7d}')
    print(f'\nwrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
