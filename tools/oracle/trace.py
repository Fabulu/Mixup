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
         bat0=0xC4B0, bat0x=0xC4B1, bat0y=0xC4B3, bat0spd=0xC4B5,
         bat0arc=0xC4B6,
         bat1=0xC4B9, bat2=0xC4C2,
         # bat-rope: state, swing phase, segment counter, and the anchor +
         # hand ends of the $C5EB chain.
         ropeseg=0xFFB4, ropeph=0xC71F, ropeflip=0xC720, ropedly=0xC721,
         rope0x=0xC5EB, rope0y=0xC5ED, rope5x=0xC5FF, rope5y=0xC601,
         carryy=0xC730,
         bk0t=0xC67B, bk0c=0xC67C, bk0r=0xC67D, bk1t=0xC67E, bk2t=0xC681,
         # map objects: slot 0 and 1 type/phase/row/wait ($C1E8, 16 B stride)
         ob0t=0xC1E8, ob0y=0xC1EB, ob0st=0xC1F3, ob0w=0xC1F4,
         ob1t=0xC1F8, ob1st=0xC203, ob1w=0xC204,
         en0f=0xC268, en0s=0xC26A, en0x=0xC276, en0hp=0xC27E,
         # slot 0 in depth, for the boss scenarios: sub-flags, facing,
         # metasprite, Y, velocities, attack timer -- same layout as slot 3.
         en0f1=0xC269, en0d=0xC26D, en0ms=0xC26E, en0y=0xC278,
         en0vx=0xC27A, en0vy=0xC27B, en0at=0xC27C,
         # the cached screen bytes every distance band reads (+7/+8).
         en0sx=0xC26F, en0sy=0xC270,
         # boss-fight globals: enrage / attack-crit / high-hop flags.
         bossRage=0xC73D, bossCrit=0xC73F, bossHop=0xC741,
         en1f=0xC288, en2f=0xC2A8,
         # slots 1/2 in depth: the boss-2 parts, and the second/third records
         # on ordinary levels.
         en1f1=0xC289, en1s=0xC28A, en1d=0xC28D, en1ms=0xC28E,
         en1x=0xC296, en1y=0xC298, en1vx=0xC29A, en1vy=0xC29B,
         en1at=0xC29C, en1hp=0xC29E,
         en2s=0xC2AA, en2x=0xC2B6, en2y=0xC2B8, en2hp=0xC2BE,
         # slot 4 ($C268 + 4*$20): the level-12 col-73 shooter is the one
         # state-6 enemy clear of every unported subsystem (the col 3-14
         # collapse, the type-5/6 objects), so it carries the verification.
         en4f=0xC2E8, en4f1=0xC2E9, en4s=0xC2EA, en4d=0xC2ED, en4ms=0xC2EE,
         en4x=0xC2F6, en4y=0xC2F8, en4vx=0xC2FA, en4vy=0xC2FB,
         en4at=0xC2FC, en4hp=0xC2FE,
         # slot 5 ($C308): the level-12 col-92 shooter -- the one that FIRES
         # on a warp-90 idle run, so it carries the projectile coverage.
         en5f=0xC308, en5f1=0xC309, en5s=0xC30A, en5d=0xC30D, en5ms=0xC30E,
         en5x=0xC316, en5y=0xC318, en5vx=0xC31A, en5vy=0xC31B,
         en5at=0xC31C, en5hp=0xC31E,
         # enemy slot 3 in depth ($C268 + 3*$20): flags/sub-flags/state/facing,
         # world position, velocities and the attack timer.
         en3f=0xC2C8, en3f1=0xC2C9, en3s=0xC2CA, en3d=0xC2CD,
         en3ms=0xC2CE,
         en3x=0xC2D6, en3y=0xC2D8, en3vx=0xC2DA, en3vy=0xC2DB,
         en3at=0xC2DC, en3hp=0xC2DE,
         # enemy slots 6/7: on levels 1-2 these are the RESPAWNING sewer
         # enemies loc_00_2D3D refills from 0:$32F8/0:$32D8 -- never part of
         # the 5:$46EC blob. Elsewhere they are the projectile slots.
         en6f=0xC328, en6s=0xC32A, en6d=0xC32D, en6ms=0xC32E,
         en6x=0xC336, en6y=0xC338, en6at=0xC33C, en6hp=0xC33E,
         en7f=0xC348, en7s=0xC34A, en7ms=0xC34E, en7x=0xC356, en7y=0xC358,
         en7at=0xC35C, en7hp=0xC35E,
         # levels 1-2 water body: surface level, phase, waterfall stamp
         # cursor and the $C755 window-line latch (src/water.js).
         wathi=0xC70A, watlo=0xC70B, watph=0xC70D, watst=0xC713,
         watwy=0xC755)

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
        'bat0y': (m[A['bat0y']] << 8) | m[A['bat0y'] + 1],
        'bat0spd': m[A['bat0spd']],
        'bat0arc': s8(m[A['bat0arc']]),
        'bat1': m[A['bat1']],
        'bat2': m[A['bat2']],
        'carryY': s8(m[A['carryy']]),
        'ropeSeg': m[A['ropeseg']],
        'ropePh': m[A['ropeph']],
        'ropeFlip': m[A['ropeflip']],
        'ropeDly': m[A['ropedly']],
        'rope0x': (m[A['rope0x']] << 8) | m[A['rope0x'] + 1],
        'rope0y': (m[A['rope0y']] << 8) | m[A['rope0y'] + 1],
        'rope5x': (m[A['rope5x']] << 8) | m[A['rope5x'] + 1],
        'rope5y': (m[A['rope5y']] << 8) | m[A['rope5y'] + 1],
        'bk0t': m[A['bk0t']], 'bk0c': m[A['bk0c']], 'bk0r': m[A['bk0r']],
        'bk1t': m[A['bk1t']], 'bk2t': m[A['bk2t']],
        'ob0t': m[A['ob0t']], 'ob0y': m[A['ob0y']],
        'ob0st': m[A['ob0st']], 'ob0w': m[A['ob0w']],
        'ob1t': m[A['ob1t']], 'ob1st': m[A['ob1st']], 'ob1w': m[A['ob1w']],
        'en0f': m[A['en0f']], 'en0s': m[A['en0s']],
        'en0x': (m[A['en0x']] << 8) | m[A['en0x'] + 1],
        'en0hp': m[A['en0hp']],
        'en0f1': m[A['en0f1']], 'en0d': m[A['en0d']],
        'en0ms': m[A['en0ms']],
        'en0sx': m[A['en0sx']], 'en0sy': m[A['en0sy']],
        'en0y': (m[A['en0y']] << 8) | m[A['en0y'] + 1],
        'en0vx': m[A['en0vx']], 'en0vy': m[A['en0vy']],
        'en0at': m[A['en0at']],
        'bossRage': m[A['bossRage']], 'bossCrit': m[A['bossCrit']],
        'bossHop': m[A['bossHop']],
        'en1f': m[A['en1f']], 'en2f': m[A['en2f']],
        'en1f1': m[A['en1f1']], 'en1s': m[A['en1s']], 'en1d': m[A['en1d']],
        'en1ms': m[A['en1ms']],
        'en1x': (m[A['en1x']] << 8) | m[A['en1x'] + 1],
        'en1y': (m[A['en1y']] << 8) | m[A['en1y'] + 1],
        'en1vx': m[A['en1vx']], 'en1vy': m[A['en1vy']],
        'en1at': m[A['en1at']], 'en1hp': m[A['en1hp']],
        'en2s': m[A['en2s']],
        'en2x': (m[A['en2x']] << 8) | m[A['en2x'] + 1],
        'en2y': (m[A['en2y']] << 8) | m[A['en2y'] + 1],
        'en2hp': m[A['en2hp']],
        'en4f': m[A['en4f']], 'en4f1': m[A['en4f1']], 'en4s': m[A['en4s']],
        'en4d': m[A['en4d']], 'en4ms': m[A['en4ms']],
        'en4x': (m[A['en4x']] << 8) | m[A['en4x'] + 1],
        'en4y': (m[A['en4y']] << 8) | m[A['en4y'] + 1],
        'en4vx': m[A['en4vx']], 'en4vy': m[A['en4vy']],
        'en4at': m[A['en4at']], 'en4hp': m[A['en4hp']],
        'en5f': m[A['en5f']], 'en5f1': m[A['en5f1']], 'en5s': m[A['en5s']],
        'en5d': m[A['en5d']], 'en5ms': m[A['en5ms']],
        'en5x': (m[A['en5x']] << 8) | m[A['en5x'] + 1],
        'en5y': (m[A['en5y']] << 8) | m[A['en5y'] + 1],
        'en5vx': m[A['en5vx']], 'en5vy': m[A['en5vy']],
        'en5at': m[A['en5at']], 'en5hp': m[A['en5hp']],
        'en3f': m[A['en3f']], 'en3f1': m[A['en3f1']], 'en3s': m[A['en3s']],
        'en3d': m[A['en3d']],
        'en3x': (m[A['en3x']] << 8) | m[A['en3x'] + 1],
        'en3y': (m[A['en3y']] << 8) | m[A['en3y'] + 1],
        'en3vx': m[A['en3vx']], 'en3vy': m[A['en3vy']],
        'en3at': m[A['en3at']], 'en3ms': m[A['en3ms']],
        'en3hp': m[A['en3hp']],
        'en6f': m[A['en6f']], 'en6s': m[A['en6s']], 'en6d': m[A['en6d']],
        'en6ms': m[A['en6ms']],
        'en6x': (m[A['en6x']] << 8) | m[A['en6x'] + 1],
        'en6y': (m[A['en6y']] << 8) | m[A['en6y'] + 1],
        'en6at': m[A['en6at']], 'en6hp': m[A['en6hp']],
        'en7f': m[A['en7f']], 'en7s': m[A['en7s']],
        'en7ms': m[A['en7ms']], 'en7at': m[A['en7at']],
        'en7x': (m[A['en7x']] << 8) | m[A['en7x'] + 1],
        'en7y': (m[A['en7y']] << 8) | m[A['en7y'] + 1],
        'en7hp': m[A['en7hp']],
        'watLv': (m[A['wathi']] << 8) | m[A['watlo']],
        'watPh': m[A['watph']], 'watSt': m[A['watst']],
        'watWy': m[A['watwy']],
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
    ap.add_argument('--warp', default=None, metavar='COL[,ROW]',
                    help='place the player at a metatile column (and optional '
                         'row) once gameplay starts. Late-level content is '
                         'otherwise unreachable from a scripted input alone.')
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

    if args.warp is not None:
        parts = args.warp.split(',')
        pyboy.memory[0xFF81] = int(parts[0]) & 0xFF          # X hi
        pyboy.memory[0xFF82] = 0x80                          # X lo, as level init does
        if len(parts) > 1:
            pyboy.memory[0xFF83] = int(parts[1]) & 0xFF      # Y hi
            pyboy.memory[0xFF84] = 0x00

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
