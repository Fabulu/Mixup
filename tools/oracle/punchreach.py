#!/usr/bin/env python3
"""Measure the punch and enemy-melee reach ENVELOPES on the real cartridge.

The owner's question: "is Batman's punch really that shit?" The previous
attempt was inconclusive because the enemy was left free to walk, so it closed
the distance inside the sample window and "hit" at every range. This tool
removes the enemy from the equation entirely:

  Punch envelope (phases A/B/C). All real enemies are disabled (bit 6). A hook
  on loc_00_2653 -- the first instruction of the punch's enemy scan, after the
  $2643 boss-phase guard -- writes a FAKE record into slot 0 at the instant
  the scan starts: active, state 1, the level-3 walker's box (7/15), cached
  screen bytes at a chosen offset from the probe point. Hooks on the two
  return sites ($271F hit, $272A miss) record the outcome. One punch = one
  sample; the enemy cannot move because it does not exist.

  Enemy-melee envelope (phases D/E). The player is pinned (position, HP 10,
  iframes 0) every frame, and slot 0 is forced into the attack state
  (flags $88, state 1, timer, the level-3 +$1E/+$1F probe bytes) at a chosen
  world offset from the player. jt_01_6107 then runs sub_01_6616's mode-5
  probe every frame; a post-tick HP drop is a hit.

Output: rip/oracle/punchreach.json, replayed against the port by
tools/oracle/punchreach.mjs.

Usage:  python tools/oracle/punchreach.py
"""
import json
import os
import sys

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

MAIN_LOOP = 0x0567
LEVEL_INIT = 0x04BB
SCAN_ENTRY = 0x2653   # loc_00_2653: slot loop head of the punch's enemy scan
SCAN_HIT = 0x271F     # LD A,$FF / RET
SCAN_MISS = 0x272A    # XOR A / RET (all 8 slots rejected)
ENEMY0 = 0xC268

LEVEL = 3
WARP_COL, WARP_ROW = 46, 23


def boot(pyboy, level):
    started = {'frame': None}
    if level != 1:
        pyboy.hook_register(0, LEVEL_INIT,
                            lambda _: pyboy.memory.__setitem__(0xFFB0, level),
                            None)
    pyboy.hook_register(0, MAIN_LOOP,
                        lambda c: started.__setitem__('frame', True), None)
    for f in range(2000):
        if started['frame'] is not None:
            return f
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    raise RuntimeError('gameplay never started')


def screen_xy(mem):
    """sub_00_1172: world -> screen, from live player/camera bytes."""
    px = (mem[0xFF81] << 8) | mem[0xFF82]
    py = (mem[0xFF83] << 8) | mem[0xFF84]
    cx = (mem[0xFFA2] << 8) | mem[0xFFA3]
    cy = (mem[0xFFA4] << 8) | mem[0xFFA5]
    sx = ((((px - cx) & 0xFFFF) >> 4) + 8) & 0xFF
    sy = ((((py & 0x0FFF) - cy) & 0xFFFF) >> 4) + 0x10 & 0xFF
    return sx, sy


def main():
    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    mem = pyboy.memory

    events = []            # punch-scan events
    current = {'dx': None, 'dy': None, 'phase': None}

    def on_scan(_):
        if current['dx'] is None:
            return                       # a punch outside a sweep cycle
        probe_sx = mem[0xFFB6]
        probe_sy = mem[0xFFB8]
        psx, psy = screen_xy(mem)
        b = ENEMY0
        mem[b + 0] = 0x80                # active
        mem[b + 2] = 0x01                # state 1 walker
        mem[b + 7] = (probe_sx + current['dx']) & 0xFF
        mem[b + 8] = (probe_sy + current['dy']) & 0xFF
        mem[b + 0x0B] = 7                # the level-3 walker box
        mem[b + 0x0C] = 15
        mem[b + 0x16] = 40               # HP, so a crit is survivable
        mem[b + 0x17] = 0
        events.append({'phase': current['phase'],
                       'dx': current['dx'], 'dy': current['dy'],
                       'probeSX': probe_sx, 'probeSY': probe_sy,
                       'playerSX': psx, 'playerSY': psy,
                       'facing': mem[0xFF88], 'result': None})

    def on_hit(_):
        if events and events[-1]['result'] is None:
            events[-1]['result'] = 'hit'

    def on_miss(_):
        if events and events[-1]['result'] is None:
            events[-1]['result'] = 'miss'

    pyboy.hook_register(0, SCAN_ENTRY, on_scan, None)
    pyboy.hook_register(0, SCAN_HIT, on_hit, None)
    pyboy.hook_register(0, SCAN_MISS, on_miss, None)

    boot(pyboy, LEVEL)
    for name in ('a', 'b', 'up', 'down', 'left', 'right', 'start', 'select'):
        pyboy.button_release(name)

    # Warp exactly as trace.py does (after the first gameplay frame).
    mem[0xFF81] = WARP_COL
    mem[0xFF82] = 0x80
    mem[0xFF83] = WARP_ROW
    mem[0xFF84] = 0x00

    def quiesce_enemies():
        for s in range(8):
            mem[ENEMY0 + s * 32] = 0x40      # bit 6: permanently disabled

    def run(frames, buttons=()):
        for name in buttons:
            pyboy.button_press(name)
        for _ in range(frames):
            quiesce_enemies()
            pyboy.tick(1, False)
        for name in buttons:
            pyboy.button_release(name)

    run(40)                    # settle the warp fall
    run(40, ('right',))        # same walk as l3-punch-connect
    run(20)

    # ---- phases A/B/C: the punch envelope --------------------------------
    def punch_sweep(phase, points):
        for dx, dy in points:
            current.update(dx=dx, dy=dy, phase=phase)
            n_before = len(events)
            run(4, ('b',))
            run(16)
            if len(events) - n_before != 1:
                print(f'WARNING {phase} dx={dx} dy={dy}: '
                      f'{len(events) - n_before} scan events (expected 1)')
        current.update(dx=None, dy=None, phase=None)

    punch_sweep('A-x-right', [(dx, 0) for dx in range(-20, 13)])
    punch_sweep('B-y-right', [(0, dy) for dy in range(-18, 19)])

    run(24, ('left',))         # turn around; walk a little back left
    run(20)
    punch_sweep('C-x-left', [(dx, 0) for dx in range(-12, 21)])

    # ---- phases D/E: the enemy melee envelope ----------------------------
    px = (mem[0xFF81] << 8) | mem[0xFF82]
    py = (mem[0xFF83] << 8) | mem[0xFF84]
    melee = []

    def melee_probe(phase, dx_px, dy_px, frames=4):
        ex = (px + dx_px * 16) & 0xFFFF
        ey = (py + dy_px * 16) & 0xFFFF
        hit = False
        for _ in range(frames):
            # pin the player
            mem[0xFF81] = px >> 8
            mem[0xFF82] = px & 0xFF
            mem[0xFF83] = py >> 8
            mem[0xFF84] = py & 0xFF
            mem[0xFF86] = 0
            mem[0xFF8A] = 10             # HP
            mem[0xC714] = 0              # iframes
            quiesce_enemies()
            b = ENEMY0
            mem[b + 0] = 0x88            # active + attacking (bit 3)
            mem[b + 1] = 0
            mem[b + 2] = 0x01
            mem[b + 5] = 1 if dx_px > 0 else 0   # face the player
            mem[b + 0x0E] = ex >> 8
            mem[b + 0x0F] = ex & 0xFF
            mem[b + 0x10] = ey >> 8
            mem[b + 0x11] = ey & 0xFF
            mem[b + 0x14] = 5            # attack timer stays > 0
            mem[b + 0x16] = 40
            mem[b + 0x17] = 0
            mem[b + 0x1E] = 0x0E         # the level-3 probe bytes
            mem[b + 0x1F] = 0xF7
            pyboy.tick(1, False)
            if mem[0xFF8A] < 10:
                hit = True
        melee.append({'phase': phase, 'dx': dx_px, 'dy': dy_px,
                      'hit': hit})

    for dx in range(2, 31):
        melee_probe('D-x-enemy-right', dx, 0)
    for dx in range(-30, -1):
        melee_probe('D2-x-enemy-left', dx, 0)
    for dy in range(-28, 29):
        melee_probe('E-y-enemy-right', 14, dy)

    # ---- report ----------------------------------------------------------
    out = {'level': LEVEL, 'warp': [WARP_COL, WARP_ROW],
           'box': {'halfW': 7, 'halfH': 15},
           'punch': events, 'melee': melee}
    outdir = os.path.join(ROOT, 'rip', 'oracle')
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, 'punchreach.json')
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh, indent=1)

    def show(phase, key):
        rows = [e for e in events if e['phase'] == phase]
        hits = sorted(e[key] for e in rows if e['result'] == 'hit')
        misses = [e[key] for e in rows if e['result'] is None]
        print(f'{phase}: {len(rows)} punches, hit at {key} = {hits}'
              + (f'  (no-scan: {misses})' if misses else ''))
        if rows:
            e = rows[0]
            print(f'   probe - player: dx={ (e["probeSX"] - e["playerSX"] + 128) % 256 - 128 }'
                  f' dy={ (e["probeSY"] - e["playerSY"] + 128) % 256 - 128 }'
                  f' facing={e["facing"]}')

    show('A-x-right', 'dx')
    show('B-y-right', 'dy')
    show('C-x-left', 'dx')
    for ph in ('D-x-enemy-right', 'D2-x-enemy-left', 'E-y-enemy-right'):
        rows = [m for m in melee if m['phase'] == ph]
        key = 'dy' if ph.startswith('E') else 'dx'
        print(f'{ph}: hits at {key} = {sorted(m[key] for m in rows if m["hit"])}')
    print(f'\nwrote {path}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
