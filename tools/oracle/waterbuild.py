#!/usr/bin/env python3
"""Record everything the cartridge does to build the WINDOW map and to animate
tiles, so assets/water.json (a capture) can be replaced by a build.

Two separate mechanisms, and the project's own notes had the first one wrong:

  * The window tilemap.  NOT the $0E24 script -- that one sits behind
    `$0DD9: CP $0E / JP NZ, loc_00_0E74` and only ever runs on level 14.  What
    runs on EVERY level is loc_00_04BB's own pair: `$04C9` fills $9C40-$9FFF
    with tile $01 (BC = $03C0), then `$04D7` runs the VRAM script at 0:$32A3
    through sub_00_0A0E, which paints rows 0 and 1 ($9C00-$9C3F).

  * Tile animation, loc_00_3127, reached as the tail of sub_00_2C13 ($05C9).
    Per frame it stages 32 bytes (two tiles) at $C5CB and arms the VBlank
    write queue $FF9B/$FF9C; $074E drains it.  Three cursors:
      $C70F  step,  $C710  half (0/1),  $C711  destination group.
    src   = [ptr(2:$61A4 + (level-1)*2)  + $C70F*4 + $C710*2]
    dest  = [ptr(0:$31EE + (level-1)*2)  + $C710*2 + $C711*4]
    steps =  0:$3295 + (level-1)          -- how many $C70F values there are
    $C711 =  [ptr(0:$3246 + (level-1)*2) + $C70F]
    Level 6 swaps the SOURCE table for 2:$625E when $FFC9 is 1, and animates
    nothing at all when $FFC9 is 0 ($3148).

Everything here is measurement.  Hooks assert arrival: --level 14 is the only
run in which $0E24 may fire, and a run in which $04D7 never fires is an error
rather than an empty recording.

Usage:
  python tools/oracle/waterbuild.py --level 1 --frames 200
"""
import argparse
import json
import os
import sys

from pyboy import PyBoy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from trace import boot_to_gameplay          # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F
# A PyBoy hook fires BEFORE the instruction at that address runs, so every one
# of these sits one instruction PAST the load whose operands it wants to read.
WIN_FILL = 0x04CF        # $04C9 LD HL,$9C40 / $04CC LD BC,$03C0 have run
WIN_SCRIPT = 0x04DA      # $04D7 LD DE,$32A3 has run; this is the CALL
L14_SCRIPT = 0x0E27      # $0E24 LD DE,$5276 -- level 14 ONLY, per $0DD9
ANIM_ARM = 0x31B5        # both $FF9B and $FF9C are written by now
ANIM_ENTRY = 0x3127
ANIM_BUSY = 0x312E       # the RET NZ arm: the queue had not been drained
DRAIN_DONE = 0x07B9      # $FF9B queue flushed to VRAM
WRAM_SCRIPT = 0x071B     # the $C61B script pre-empts the drain this frame
C130_QUEUE = 0x072E      # so does the $C130 tilemap queue


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--frames', type=int, default=200,
                    help='gameplay frames to record after the first $0567')
    ap.add_argument('--warp', default=None, help='COL[,ROW] applied after f1')
    ap.add_argument('--out', default=None)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    m = pyboy.memory
    reg = pyboy.register_file

    ev = {'fill': [], 'script': [], 'l14': [], 'anim': [],
          'busy': [], 'stall': []}
    fc = {'n': 0, 'started': False}

    def frame():
        return fc['n']

    def on_fill(_):
        if ev['fill'] and ev['fill'][-1]['f'] == frame():
            return                              # the loop jumps back to $04CF
        ev['fill'].append({'f': frame(), 'hl': reg.HL,
                           'bc': (reg.B << 8) | reg.C, 'value': 0x01})

    def script_bytes(at):
        p = at
        while m[p] != 0x00:
            ctrl = m[p + 2]
            p += 3 + (1 if (ctrl >> 6) in (1, 3) else ((ctrl & 0x3F) or 0x100))
        return [m[i] for i in range(at, p + 1)]

    def on_script(_):
        de = (reg.D << 8) | reg.E
        ev['script'].append({'f': frame(), 'addr': de, 'bank': m[0xC703],
                             'bytes': script_bytes(de)})

    def on_l14(_):
        de = (reg.D << 8) | reg.E
        ev['l14'].append({'f': frame(), 'addr': de, 'bank': m[0xC703]})

    def on_anim(_):
        # No `started` gate: the first gameplay frame runs INSIDE
        # boot_to_gameplay, so gating on its return drops the streamer's very
        # first write and leaves the whole replay one step out of phase.
        # $04BB (below) clears the list at level init instead, which is where
        # $0523-$0529 zero $C70F/$C710/$C711.
        ev['anim'].append({
            'f': frame(),
            'c70f': m[0xC70F], 'c710': m[0xC710], 'c711': m[0xC711],
            'ffc9': m[0xFFC9],
            'dest': (m[0xFF9B] << 8) | m[0xFF9C],
            'bytes': list(m[0xC5CB:0xC5CB + 32]),
        })

    def on_busy(_):
        # $312C read $FF9B; the RET NZ at $312E is only taken when it is set.
        if fc['started'] and m[0xFF9B] != 0:
            ev['busy'].append(frame())

    def on_stall(kind):
        def cb(_):
            if fc['started'] and m[0xFF9B] != 0:
                ev['stall'].append({'f': frame(), 'kind': kind})
        return cb

    # $052C is the instruction after $0523-$0529 zero $C70F/$C710/$C711 -- the
    # exact point the replay starts from. (Not $04BB: trace.boot_to_gameplay
    # already owns a hook there for the $FFB0 injection.)
    pyboy.hook_register(0, 0x052C, lambda _: ev['anim'].clear(), None)
    pyboy.hook_register(0, WIN_FILL, on_fill, None)
    pyboy.hook_register(0, WIN_SCRIPT, on_script, None)
    pyboy.hook_register(0, L14_SCRIPT, on_l14, None)
    pyboy.hook_register(0, ANIM_ARM, on_anim, None)
    pyboy.hook_register(0, ANIM_BUSY, on_busy, None)
    pyboy.hook_register(0, WRAM_SCRIPT, on_stall('C61B'), None)
    pyboy.hook_register(0, C130_QUEUE, on_stall('C130'), None)
    pyboy.hook_register(0, FRAME_END,
                        lambda _: fc.__setitem__('n', fc['n'] + 1), None)

    boot_to_gameplay(pyboy, level=args.level)
    fc['started'] = True
    base = fc['n']
    # The first $0567 has already run; VRAM here is the level as loaded, before
    # a single animation write.
    vram0 = list(m[0x8000:0xA000])

    if args.warp:
        parts = args.warp.split(',')
        m[0xFF81] = int(parts[0])
        m[0xFF82] = 0x80
        if len(parts) > 1:
            m[0xFF83] = int(parts[1])
            m[0xFF84] = 0x00

    lag = []
    while fc['n'] - base < args.frames:
        pyboy.tick(1, False)
        if m[0xC757]:
            lag.append(fc['n'] - base)
    vram1 = list(m[0x8000:0xA000])

    for e in ev['anim']:
        e['f'] -= base
    for e in ev['busy']:
        pass
    ev['busy'] = [f - base for f in ev['busy']]
    for e in ev['stall']:
        e['f'] -= base

    if not ev['script']:
        raise SystemExit('$04D7 never executed - the probe never arrived')
    if args.level != 14 and ev['l14']:
        raise SystemExit('$0E24 fired on level %d, which contradicts $0DD9'
                         % args.level)

    out = args.out or os.path.join('rip', 'waterbuild-%02d.json' % args.level)
    path = os.path.join(ROOT, out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump({'level': args.level, 'frames': args.frames,
                   'firstFrame': base, 'lag': lag,
                   'events': ev, 'vram0': vram0, 'vram1': vram1,
                   'ffc9': m[0xFFC9], 'ffb1': m[0xFFB1]}, fh)

    print('level %d: %d frames recorded' % (args.level, args.frames))
    for e in ev['fill']:
        print('  $04C9 fill  HL=$%04X  BC=$%04X' % (e['hl'], e['bc']))
    for e in ev['script']:
        print('  $04D7 script bank %d:$%04X, %d B'
              % (e['bank'], e['addr'], len(e['bytes'])))
    for e in ev['l14']:
        print('  $0E24 script bank %d:$%04X' % (e['bank'], e['addr']))
    print('  animation writes: %d' % len(ev['anim']))
    if ev['anim']:
        dests = sorted({e['dest'] for e in ev['anim']})
        print('  destinations: %s' % ' '.join('$%04X' % d for d in dests))
        gaps = [b['f'] - a['f'] for a, b in zip(ev['anim'], ev['anim'][1:])]
        print('  frame gaps: %s' % sorted(set(gaps)))
    print('  busy frames (queue not drained): %d' % len(ev['busy']))
    print('  drain pre-empted: %d' % len(ev['stall']))
    print('  lag frames: %s' % (lag[:10] if lag else 'none'))
    print('->', path)
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
