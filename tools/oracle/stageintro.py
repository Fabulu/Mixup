#!/usr/bin/env python3
"""Record the stage-intro screen (sub_00_333F) off the cartridge.

sub_00_333F is CALLed twice -- from loc_00_04BB (a level entered from a menu)
and from $2836 (a level entered from the one before it) -- and it is the FIRST
thing level init does, before sub_00_2889 / sub_00_0C34 have touched anything.
So the screen is built on top of whatever VRAM the previous screen left.

It RETs at $3364 unless $FFB0 is a route start (1/5/9/$0C -> loc_00_3365, which
also refills HP from $FF8E) or a boss (4/8/$0B/$0E -> loc_00_3369 directly).

What the screen is, measured rather than inferred:

  $3369  sound $01 mask $04; sub_00_34A4 fills the BG map with $DC (LCD off);
         resources $02/$1D/$05 through sub_00_0B15; rIE = $05; rLCDC = $E7.
  $3391  B = $3C -- a blank hold of up to 60 frames with nothing but the fill
         on screen.  START ($FFE2 bit 3) RETs out of it.
  $33A6  3:$7C15 -> $C61B, one frame, then 3:$7C4C -> $C61B, one frame: the
         two halves of the decorative frame, run by the VBlank ISR at $0714.
  $3404  3:$7BF9[level-1] -> a {len, script} record -> $C61B; len also to $FFA0.
  $343A  BOSS LEVELS ONLY (4/8/$0B/$0E): 31 bytes at 0:$3485 appended at
         $C61B + $FFA0, i.e. over the level script's missing terminator.
  $344E  $C712 = $B4, then $3462 counts it down -- 180 frames, START-cancellable
  $347F  sub_00_0A7F with C = 0, the 33-frame fade out.

Every frame of it draws metasprite $F2 at BC = $5858 and clears the OAM tail.

Usage:
  python tools/oracle/stageintro.py --level 1 --out rip/oracle/intro-l1.json
  python tools/oracle/stageintro.py --level 4 --start-at 30 --out ...

Landmarks are counted per sub_00_0A4F, never per pyboy.tick: the screen has no
main loop at all, and $0A4F is the only thing in it that waits for VBlank.
"""
import argparse
import json
import os

from pyboy import PyBoy

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ROM = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')

MAIN_LOOP = 0x0567
FRAME_END = 0x0A4F         # sub_00_0A4F, the VBlank wait -- one call = one frame
LEVEL_INIT = 0x04BB
RESET = 0x0150
COPY = 0x09FB              # sub_00_09FB: HL=src, DE=dest, BC=count
SCRIPT = 0x0A0E            # sub_00_0A0E: DE=script
FILL = 0x34A4              # sub_00_34A4: D=fill byte
RESOURCE = 0x0B15          # sub_00_0B15: A=resource id
SPRITE = 0x0BC6            # sub_00_0BC6: E=metasprite id, BC=origin, A=attr
LAG = 0x065C               # the ISR's "$FFE7 still 0" arm -> $C757

INTRO = 0x333F
INTRO_RET = 0x3364         # the early RET: not a route start, not a boss
HP_REFILL = 0x3365         # route starts only
BUILD = 0x3369
BLANK_LOOP = 0x3391
AFTER_S1 = 0x33CB          # the frame that applied 3:$7C15 has completed
AFTER_S2 = 0x33FA          # ... and 3:$7C4C
LEVEL_SCRIPT = 0x3404
APPEND = 0x343A            # boss levels only
ARM_HOLD = 0x344E
HOLD_LOOP = 0x3462
FADE = 0x347F
RETURN_SITE = 0x04BE       # the instruction after loc_00_04BB's CALL

ROUTE_LEVELS = {1, 5, 9, 0x0C}
BOSS_LEVELS = {4, 8, 0x0B, 0x0E}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=1)
    ap.add_argument('--start-at', type=int, default=None,
                    help='press START this many sub_00_0A4F calls after $333F '
                         'is entered, to prove the screen is cancellable')
    ap.add_argument('--frames', type=int, default=900)
    ap.add_argument('--out', required=True)
    args = ap.parse_args()

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file
    m = pyboy.memory

    ctr = {'n': 0, 'started': False, 'lag': 0, 'inside': False}
    hits = {k: 0 for k in ('intro', 'ret', 'hp', 'build', 'blank', 'append',
                           'hold', 'fade', 'returned', 'reset')}
    marks = {}
    injected = {'v': False}
    events = []
    snaps = {}

    def on_level_init(_):
        if not injected['v']:
            injected['v'] = True
            if args.level != 1:
                m[0xFFB0] = args.level

    # sub_00_09FB's loop jumps back to its own head, so the hook fires once per
    # BYTE (titlebuild.py's note). A hit is a fresh call only when it does not
    # continue the previous one.
    last = {'hl': None, 'bc': None}

    def on_copy(_):
        hl, bc = reg.HL, (reg.B << 8) | reg.C
        de = (reg.D << 8) | reg.E
        if last['hl'] is not None and hl == last['hl'] + 1 and bc == last['bc'] - 1:
            last['hl'], last['bc'] = hl, bc
            return
        last['hl'], last['bc'] = hl, bc
        if not ctr['inside']:
            return
        events.append({'kind': 'copy', 'frame': ctr['n'], 'src': hl, 'dest': de,
                       'len': bc, 'bank': m[0xC703],
                       'bytes': [m[hl + i] for i in range(bc)]})

    def record_len(at):
        ctrl = m[at + 2]
        return 3 + (1 if (ctrl >> 6) in (1, 3) else ((ctrl & 0x3F) or 0x100))

    script_state = {'expect': None}

    def on_script(_):
        de = (reg.D << 8) | reg.E
        if de != script_state['expect'] and ctr['inside']:
            p = de
            n = 0
            while m[p] != 0x00 and n < 64:
                p += record_len(p)
                n += 1
            events.append({'kind': 'script', 'frame': ctr['n'], 'addr': de,
                           'bytes': [m[i] for i in range(de, p + 1)]})
        script_state['expect'] = None if m[de] == 0x00 else de + record_len(de)

    def on_fill(_):
        if ctr['inside']:
            events.append({'kind': 'fill', 'frame': ctr['n'], 'value': reg.D})

    def on_resource(_):
        if ctr['inside']:
            events.append({'kind': 'resource', 'frame': ctr['n'], 'id': reg.A})

    def on_sprite(_):
        if ctr['inside'] and len([e for e in events if e['kind'] == 'sprite']) < 6:
            events.append({'kind': 'sprite', 'frame': ctr['n'], 'id': reg.E,
                           'b': reg.B, 'c': reg.C, 'a': reg.A})

    def regs():
        return {
            'FFA9': m[0xFFA9], 'FFAA': m[0xFFAA], 'FFAB': m[0xFFAB],
            'FFAC': m[0xFFAC], 'FFAD': m[0xFFAD], 'FFAE': m[0xFFAE],
            'FFAF': m[0xFFAF], 'FFA0': m[0xFFA0], 'FFB0': m[0xFFB0],
            'FF8A': m[0xFF8A], 'FF8E': m[0xFF8E],
            'rLCDC': m[0xFF40], 'rSTAT': m[0xFF41] & 0x78, 'rLYC': m[0xFF45],
            'rWX': m[0xFF4B], 'rWY': m[0xFF4A], 'rIE': m[0xFFFF],
            'C712': m[0xC712], 'C70E': m[0xC70E], 'C757': m[0xC757],
        }

    def snap(tag):
        if tag in snaps:
            return
        # The SCREEN, not just the data behind it. Byte-exact VRAM proved the
        # tiles and the map; it did NOT catch the card losing all 40 of its
        # ring sprites, because that lives in OAM and in whether anything
        # draws it. 160x144 shade indices, 0 = lightest.
        px = pyboy.screen.ndarray[:, :, 0]
        shades = [3 - min(3, int(v) * 4 // 256) for row in px for v in row]
        snaps[tag] = {'frame': ctr['n'], 'vram': list(m[0x8000:0xA000]),
                      'oam': list(m[0xC000:0xC0A0]), 'regs': regs(),
                      'screen': shades}

    def mark(name):
        def cb(_):
            hits[name] += 1
            marks.setdefault(name, ctr['n'])
        return cb

    def on_intro(_):
        hits['intro'] += 1
        if hits['intro'] == 1:
            ctr['inside'] = True
            marks['intro'] = ctr['n']
            snap('before')

    def on_blank(_):
        hits['blank'] += 1
        if hits['blank'] == 1:
            marks['blank'] = ctr['n']
            snap('blank')

    def on_after_s1(_):
        marks.setdefault('afterS1', ctr['n'])
        snap('afterS1')

    def on_after_s2(_):
        marks.setdefault('afterS2', ctr['n'])
        snap('afterS2')

    def on_hold(_):
        hits['hold'] += 1
        if hits['hold'] == 1:
            marks['hold'] = ctr['n']
            snap('built')

    def on_fade(_):
        hits['fade'] += 1
        marks.setdefault('fade', ctr['n'])
        snap('held')

    def on_return(_):
        hits['returned'] += 1
        if hits['returned'] == 1:
            marks['returned'] = ctr['n']
            snap('return')
            ctr['inside'] = False

    pyboy.hook_register(0, LEVEL_INIT, on_level_init, None)
    pyboy.hook_register(0, RESET, mark('reset'), None)
    pyboy.hook_register(0, COPY, on_copy, None)
    pyboy.hook_register(0, SCRIPT, on_script, None)
    pyboy.hook_register(0, FILL, on_fill, None)
    pyboy.hook_register(0, RESOURCE, on_resource, None)
    pyboy.hook_register(0, SPRITE, on_sprite, None)
    pyboy.hook_register(0, LAG, lambda _: ctr.__setitem__('lag', ctr['lag'] + 1), None)
    pyboy.hook_register(0, INTRO, on_intro, None)
    pyboy.hook_register(0, INTRO_RET, mark('ret'), None)
    pyboy.hook_register(0, HP_REFILL, mark('hp'), None)
    pyboy.hook_register(0, BUILD, mark('build'), None)
    pyboy.hook_register(0, BLANK_LOOP, on_blank, None)
    pyboy.hook_register(0, AFTER_S1, on_after_s1, None)
    pyboy.hook_register(0, AFTER_S2, on_after_s2, None)
    pyboy.hook_register(0, APPEND, mark('append'), None)
    pyboy.hook_register(0, HOLD_LOOP, on_hold, None)
    pyboy.hook_register(0, FADE, on_fade, None)
    pyboy.hook_register(0, RETURN_SITE, on_return, None)

    samples = []

    def frame_end(_):
        ctr['n'] += 1
        if ctr['inside']:
            samples.append({'frame': ctr['n'], 'C712': m[0xC712],
                            'FFAD': m[0xFFAD], 'FFAE': m[0xFFAE],
                            'FFAF': m[0xFFAF], 'C70E': m[0xC70E],
                            'rLCDC': m[0xFF40], 'lag': ctr['lag']})

    pyboy.hook_register(0, FRAME_END, frame_end, None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: ctr.__setitem__('started', True), None)

    # ---- boot to the round select, then let it enter a level ---------------
    for f in range(3000):
        if hits['intro']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, True)   # render=True: snap() reads pyboy.screen
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start'):
        pyboy.button_release(n)

    # ASSERT ARRIVAL before reading a single byte.
    if not hits['intro']:
        raise SystemExit('FAIL: sub_00_333F never ran')
    if m[0xFFB0] != args.level:
        raise SystemExit(f'FAIL: wanted level {args.level}, got ${m[0xFFB0]:02X}')

    # The boot path already tripped $0150 once; leaving that counter alone makes
    # the "has it happened yet?" break true on the first tick (deathscen.py).
    hits['reset'] = 0
    ctr['lag'] = 0

    base = marks['intro']
    pressed = {'v': False}
    while ctr['n'] - base < args.frames:
        if (args.start_at is not None and not pressed['v']
                and ctr['n'] - base >= args.start_at):
            pressed['v'] = True
            events.append({'kind': 'mark', 'frame': ctr['n'], 'note': 'START'})
            pyboy.button_press('start')
        pyboy.tick(1, True)   # render=True: snap() reads pyboy.screen
        if pressed['v'] and ctr['n'] - base >= args.start_at + 4:
            pyboy.button_release('start')
        if hits['returned'] or hits['reset'] or ctr['started']:
            break

    if not hits['returned']:
        raise SystemExit('FAIL: sub_00_333F never returned to $04BE')
    if args.level in ROUTE_LEVELS and not hits['hp']:
        raise SystemExit('FAIL: a route start did not take loc_00_3365')
    if args.level in BOSS_LEVELS and hits['hp']:
        raise SystemExit('FAIL: a boss level took loc_00_3365')
    if args.level in BOSS_LEVELS and not hits['append']:
        raise SystemExit('FAIL: a boss level did not append 0:$3485')
    if args.level not in BOSS_LEVELS and hits['append']:
        raise SystemExit('FAIL: a non-boss level appended 0:$3485')
    if args.level not in ROUTE_LEVELS | BOSS_LEVELS:
        if not hits['ret']:
            raise SystemExit('FAIL: a mid-route level did not RET at $3364')
        if hits['build']:
            raise SystemExit('FAIL: a mid-route level built the intro screen')
    elif args.start_at is None:
        for tag in ('before', 'blank', 'afterS1', 'afterS2', 'built', 'held'):
            if tag not in snaps:
                raise SystemExit(f'FAIL: never reached the "{tag}" landmark')

    for s in snaps.values():
        s['frame'] -= base
    for e in events:
        e['frame'] -= base
    for s in samples:
        s['frame'] -= base
    rel = {k: v - base for k, v in marks.items()}

    out = {'level': args.level, 'startAt': args.start_at,
           'lagFrames': ctr['lag'], 'hits': hits, 'marks': rel,
           'events': events, 'snaps': snaps, 'samples': samples,
           'totalFrames': ctr['n'] - base}
    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh)

    print(f"level {args.level}: hits {hits}")
    print(f"marks (sub_00_0A4F calls since $333F): {rel}")
    print(f"total frames inside sub_00_333F: {ctr['n'] - base}, "
          f"lag frames: {ctr['lag']}")
    kinds = {}
    for e in events:
        kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
    print('events:', kinds)
    for e in events:
        if e['kind'] == 'copy':
            print(f"  f{e['frame']:3d} copy {e['bank']:02X}:${e['src']:04X} -> "
                  f"${e['dest']:04X}  {e['len']} B")
        elif e['kind'] == 'script':
            print(f"  f{e['frame']:3d} script ${e['addr']:04X}  "
                  f"{len(e['bytes'])} B")
        elif e['kind'] in ('fill', 'resource'):
            v = e.get('value', e.get('id'))
            print(f"  f{e['frame']:3d} {e['kind']} ${v:02X}")
        elif e['kind'] == 'sprite':
            print(f"  f{e['frame']:3d} sprite ${e['id']:02X} at "
                  f"BC=${e['b']:02X}{e['c']:02X} attr ${e['a']:02X}")
        elif e['kind'] == 'mark':
            print(f"  f{e['frame']:3d} {e['note']}")

    if 'before' in snaps and 'held' in snaps:
        before, held = snaps['before']['vram'], snaps['held']['vram']
        runs, run = [], None
        for i in range(0x2000):
            if before[i] != held[i]:
                run = [i, i] if run is None else [run[0], i]
            elif run is not None:
                runs.append(run)
                run = None
        if run is not None:
            runs.append(run)
        changed = sum(r[1] - r[0] + 1 for r in runs)
        print(f'\nVRAM changed by the intro: {changed} B in {len(runs)} run(s)')
        for a, b in runs[:24]:
            print(f'  ${0x8000 + a:04X}-${0x8000 + b:04X}  {b - a + 1} B')
        if len(runs) > 24:
            print(f'  ... and {len(runs) - 24} more')
        print('regs at held:', json.dumps(snaps['held']['regs']))
    print(f'wrote {args.out}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
