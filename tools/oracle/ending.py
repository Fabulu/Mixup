#!/usr/bin/env python3
"""Record the ENDING (loc_00_3652) off the cartridge.

Reached one way only: clear level $0E.  loc_00_35E8 dispatches the cleared
level -- $04 / $08 / $0B set a bit in $C753 and go back to round select, and
`$35F6: CP $0E / JR Z` sends level 14 to loc_00_3652 instead.  So this boots
to gameplay with $FFB0 injected as $0E at loc_00_04BB (the same instant the
game's own route dispatcher writes it) and then zeroes the boss's HP byte,
which is 1:$4E82's own death trigger -- exactly what stageclear.py does.

What the ending IS, measured rather than inferred:

  $3652  LD D,$7E -> sub_00_34A4 (LCD off, BG map filled), then FOUR resources
         through sub_00_0B15: $02 $1D $21 $23.  These are the only tile loads
         in the whole sequence -- every screen after this one re-fills the map
         and repaints it with a script, and nothing ever touches $8000-$97FF
         again.
  $3675  bank 7, sub_00_0A0E on 7:$7E09 -- called DIRECTLY, not queued through
         $C61B, because the LCD is off.  $FFAD = $FF (all black), $C712 = 0,
         rIE = $05 (bit 1 clear -> the $0048 STAT vector is masked off),
         rLCDC = $E7.
  $3698  B = $B4: 180 frames of a black screen.
  $36A0  sound $0A mask $03, then a 33-frame ramp that walks 0:$3A31
         (FF AB 5B 1B) into $FFAD on every 8th frame -- the same B & 7 cadence
         sub_00_0A7F uses, hand-rolled because the ramp is not $0B09's.
  $36BE  BC = $01B0: 432 frames held.
  $36C9  sub_00_0A7F C = $03.
  $36CE  picture 2: fill $7E, 7:$7EAF, fade in C = $83, 432 held, out C = $03.
  $370E  picture 3: fill $7E, 7:$7F70, fade in C = $83, 432 held, NO fade out.
  $3749  picture 4: fill $6E (a DIFFERENT tile), 7:$7960, palettes zeroed,
         fade in C = $80.
  $3781  the text crawl, 13 iterations ($C712 counts 0 -> $0D at $3840):
           B frames of nothing ($3C the first time, $20 after)
           1:$7B34 then 1:$7B49 -- 21 B each, the text box painted in $7E
           7:$7BFC[$C712] -> {len, script} -- the credit line itself
           $C713 = $80: 128 frames held
           1:$7B5E then 1:$7B73 -- the same box repainted in $6E, erasing it
         Every frame from the first box paint to the last hold frame draws
         metasprite $F2 at BC = $3838 and then clears the OAM tail.
         NOTE the banks: $7B34/$7B49/$7B5E/$7B73/$7B88 are read with BANK 01
         mapped ($375F), NOT bank 7.  Only the $7BFC pointer table and the
         credit lines it points at are bank 7 ($37BD ... $37DF).
  $3849  120 frames, fade out C = $00, fill $7E, palettes zeroed, OAM cleared,
         1:$7B88 (THE END), 104 frames, fade in C = $80.
  $3887  the only $FFE2 read in the entire sequence: START -> JP loc_00_0150.

The recording is EVENT-CAPPED: it stops `--settle` frames after $3887 is first
reached, so a lag frame cannot move the cap.

Usage:
  python tools/oracle/ending.py --out rip/oracle/ending.json
  python tools/oracle/ending.py --mash-start --out rip/oracle/ending-mash.json
  python tools/oracle/ending.py --start-at 4150 --out rip/oracle/ending-quit.json

Landmarks are counted per sub_00_0A4F, never per pyboy.tick: the ending has no
main loop at all and $0A4F is the only thing in it that waits for a frame.
"""
import argparse
import importlib.util
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
OAMCLR = 0x0A61            # sub_00_0A61, the shadow-OAM wipe
FADE = 0x0A7F              # sub_00_0A7F: C=mode
SOUND = 0x0AE1             # sub_00_0AE1: B=id, C=mask
LAG = 0x065C               # the ISR's "$FFE7 still 0" arm -> $C757

def _screenshot_helpers():
    """compare_screen.py's indexed-PNG writer and shade mapping, not a copy.

    Importing it by path rather than restating it means the ending's shots and
    the gameplay ones can never disagree about what a shade index is.
    """
    path = os.path.join(ROOT, 'tools', 'compare_screen.py')
    spec = importlib.util.spec_from_file_location('_cmpscreen', path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


DISPATCH = 0x35E8          # loc_00_35E8, the cleared-level dispatch
ENDING = 0x3652
BOSS_LEVEL = 0x0E
ENEMY0 = 0xC268

# Landmarks. Every one is the address of an instruction, and every VRAM
# snapshot is taken at the rLCDC write that ENDS a build -- the point where the
# screen is complete and the hardware is about to show it.
MARKS = {
    'ending':   0x3652,
    'pic1':     0x3694,    # LD A,$E7 -> rLCDC, picture 1 complete
    'blank1':   0x3698,    # LD B,$B4
    'ramp':     0x36A0,    # LD BC,$0A03 -> sub_00_0AE1
    'hold1':    0x36BE,    # LD BC,$01B0
    'out1':     0x36C9,    # LD C,$03
    'build2':   0x36CE,    # LD D,$7E
    'pic2':     0x36F5,
    'in2':      0x36F9,    # LD C,$83
    'hold2':    0x36FE,
    'out2':     0x3709,    # LD C,$03
    'build3':   0x370E,
    'pic3':     0x3735,
    'in3':      0x3739,    # LD C,$83
    'hold3':    0x373E,
    'build4':   0x3749,    # LD D,$6E
    'pic4':     0x3776,
    'in4':      0x377A,    # LD C,$80
    'crawlTop': 0x377F,    # LD B,$3C
    'boxOn':    0x3787,    # the first of the two $7E box scripts
    'credit':   0x37C7,    # $C712 * 2 -> the bank-7 pointer table
    'hold128':  0x37F8,    # LD A,$80 -> $C713
    'boxOff':   0x3815,    # the first of the two $6E box scripts
    'again':    0x3844,    # LD B,$20 -- another crawl iteration
    'crawlEnd': 0x3849,    # LD B,$78
    'endFade':  0x3851,    # LD C,$00
    'theEndBuild': 0x3856,
    'theEnd':   0x3873,    # rLCDC, the THE END screen complete
    'endIn':    0x387F,    # LD C,$80
    'wait':     0x3887,    # the START loop -- the cap
    'reset':    RESET,
}

# The five crawl frames whose BG map is snapshotted, keyed by the instruction
# that follows the sub_00_0A4F which applied the script.  $37F8 is 'hold128' in
# MARKS as well, so it is driven from there -- PyBoy allows one hook per address.
CRAWL_AFTER = {0x37A2: 'a', 0x37BD: 'b', 0x3827: 'd', 0x3839: 'e'}
CRAWL_VIA_MARK = {'hold128': 'c'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--poke-at', type=int, default=40)
    ap.add_argument('--settle', type=int, default=60,
                    help='frames to keep recording after $3887 is reached')
    ap.add_argument('--frames', type=int, default=12000, help='hard safety cap')
    ap.add_argument('--start-at', type=int, default=None,
                    help='press START this many sub_00_0A4F calls after $3652')
    ap.add_argument('--mash-start', action='store_true',
                    help='toggle START every 8 frames for the whole ending, to '
                         'prove nothing but $3887 reads it')
    ap.add_argument('--no-vram', action='store_true',
                    help='skip the 8 KB snapshots (a much smaller file)')
    ap.add_argument('--shots', default=None,
                    help='comma-separated ending-relative frames to screenshot, '
                         "or 'crawl' for the standing 88-frame sweep, or "
                         "'landmarks' for the original 8")
    ap.add_argument('--shot-dir', default='rip/oracle/endingshots')
    args = ap.parse_args()

    # Named presets. 'landmarks' was the original list and it was too thin to
    # answer a real complaint: eight frames out of 4137 is 0.2% of a 69-second
    # sequence, and the credit circles do not even begin until ~f1500. 'crawl'
    # sweeps the whole crawl every 30 frames instead -- 88 frames, 2,027,520
    # pixels -- which is what it took to say "the circle is the cartridge's"
    # and mean it.
    PRESETS = {
        'landmarks': [100, 300, 900, 1400, 1700, 1800, 3800, 4130],
        # The every-30 sweep plus the box's own TRANSITION frames. Without
        # those the list is vacuous for the credit circle: during a 130-frame
        # hold the port's output does not change, so every candidate lag scores
        # zero and the "one lag must be exact on every frame" invariant proves
        # nothing. MEASURED at 1-frame resolution: the box paints in over TWO
        # frames (1736 top half via 1:$7B34, 1737 full via 1:$7B49) and erases
        # over two (1866, 1867) -- visually instant, never blocky.
        'crawl': sorted(set(list(range(1500, 4131, 30))
                            + [1736, 1737, 1738, 1866, 1867])),
        # (1868 is deliberately absent: ctr['n'] SKIPS it -- two $0A4F calls
        #  land inside one hardware frame there, so the recorder never writes
        #  that shot. Same for 1674 and 2033.)
    }
    if args.shots in PRESETS:
        shot_frames = PRESETS[args.shots]
    else:
        shot_frames = [int(x) for x in args.shots.split(',')] if args.shots else []
    shot_at = set(shot_frames)
    shots = _screenshot_helpers() if args.shots else None

    pyboy = PyBoy(ROM, window='null', sound_emulated=False)
    pyboy.set_emulation_speed(0)
    reg = pyboy.register_file
    m = pyboy.memory

    ctr = {'n': 0, 'started': False, 'lag': 0, 'inside': False}
    hits = {k: 0 for k in MARKS}
    marks = {}
    events = []
    snaps = {}
    maps = {}
    samples = []
    injected = {'v': False}
    crawl = {'i': -1}

    def on_level_init(_):
        if not injected['v']:
            injected['v'] = True
            m[0xFFB0] = BOSS_LEVEL

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
            while m[p] != 0x00 and n < 128:
                p += record_len(p)
                n += 1
            events.append({'kind': 'script', 'frame': ctr['n'], 'addr': de,
                           'bank': m[0xC703],
                           'bytes': [m[i] for i in range(de, p + 1)]})
        script_state['expect'] = None if m[de] == 0x00 else de + record_len(de)

    def on_fill(_):
        if ctr['inside']:
            events.append({'kind': 'fill', 'frame': ctr['n'], 'value': reg.D})

    def on_resource(_):
        if ctr['inside']:
            events.append({'kind': 'resource', 'frame': ctr['n'], 'id': reg.A})

    def on_sprite(_):
        if ctr['inside']:
            events.append({'kind': 'sprite', 'frame': ctr['n'], 'id': reg.E,
                           'b': reg.B, 'c': reg.C, 'a': reg.A})

    def on_oamclr(_):
        if ctr['inside']:
            events.append({'kind': 'oamclear', 'frame': ctr['n']})

    def on_fade(_):
        if ctr['inside']:
            events.append({'kind': 'fade', 'frame': ctr['n'], 'c': reg.C})

    def on_sound(_):
        if ctr['inside']:
            events.append({'kind': 'sound', 'frame': ctr['n'],
                           'id': reg.B, 'mask': reg.C})

    def regs():
        return {
            'FFA9': m[0xFFA9], 'FFAA': m[0xFFAA], 'FFAB': m[0xFFAB],
            'FFAC': m[0xFFAC], 'FFAD': m[0xFFAD], 'FFAE': m[0xFFAE],
            'FFAF': m[0xFFAF], 'FFA0': m[0xFFA0], 'FFB0': m[0xFFB0],
            'rLCDC': m[0xFF40], 'rSTAT': m[0xFF41] & 0x78, 'rLYC': m[0xFF45],
            'rWX': m[0xFF4B], 'rWY': m[0xFF4A], 'rIE': m[0xFFFF],
            'C712': m[0xC712], 'C713': m[0xC713], 'C70E': m[0xC70E],
            'C703': m[0xC703], 'C757': m[0xC757],
        }

    def snap(tag):
        if tag in snaps:
            return
        s = {'frame': ctr['n'], 'oam': list(m[0xC000:0xC0A0]), 'regs': regs()}
        if not args.no_vram:
            s['vram'] = list(m[0x8000:0xA000])
        snaps[tag] = s

    def mark(name):
        def cb(_):
            hits[name] += 1
            marks.setdefault(name, ctr['n'])
        return cb

    SNAP_AT = {'ending': 'before', 'pic1': 'pic1', 'ramp': 'ramp',
               'pic2': 'pic2', 'pic3': 'pic3', 'pic4': 'pic4',
               'theEnd': 'theEnd', 'wait': 'wait'}

    def take_map(letter):
        if not ctr['inside'] or crawl['i'] < 0:
            return
        key = f"c{crawl['i']}{letter}"
        if key in maps:
            return
        maps[key] = {'frame': ctr['n'],
                     'bg': list(m[0x9800:0x9C00]),
                     'oam': list(m[0xC000:0xC0A0])}

    def landmark(name):
        tag = SNAP_AT.get(name)
        letter = CRAWL_VIA_MARK.get(name)

        def cb(_):
            hits[name] += 1
            marks.setdefault(name, ctr['n'])
            if name == 'ending':
                ctr['inside'] = True
            if name == 'boxOn':
                crawl['i'] += 1
            if tag:
                snap(tag)
            if letter:
                take_map(letter)
        return cb

    def crawl_map(letter):
        return lambda _: take_map(letter)

    pyboy.hook_register(0, LEVEL_INIT, on_level_init, None)
    pyboy.hook_register(0, COPY, on_copy, None)
    pyboy.hook_register(0, SCRIPT, on_script, None)
    pyboy.hook_register(0, FILL, on_fill, None)
    pyboy.hook_register(0, RESOURCE, on_resource, None)
    pyboy.hook_register(0, SPRITE, on_sprite, None)
    pyboy.hook_register(0, OAMCLR, on_oamclr, None)
    pyboy.hook_register(0, FADE, on_fade, None)
    pyboy.hook_register(0, SOUND, on_sound, None)
    pyboy.hook_register(0, LAG, lambda _: ctr.__setitem__('lag', ctr['lag'] + 1), None)
    for name, addr in MARKS.items():
        pyboy.hook_register(0, addr, landmark(name), None)
    for addr, letter in CRAWL_AFTER.items():
        pyboy.hook_register(0, addr, crawl_map(letter), None)
    pyboy.hook_register(0, DISPATCH, mark('dispatch'), None)
    hits['dispatch'] = 0

    def frame_end(_):
        ctr['n'] += 1
        if ctr['inside']:
            samples.append({'frame': ctr['n'],
                            'FFAD': m[0xFFAD], 'FFAE': m[0xFFAE],
                            'FFAF': m[0xFFAF], 'C70E': m[0xC70E],
                            'C712': m[0xC712], 'C713': m[0xC713],
                            'rLCDC': m[0xFF40], 'rIE': m[0xFFFF],
                            'oam0': m[0xC000], 'oam1': m[0xC001],
                            'lag': ctr['lag']})

    pyboy.hook_register(0, FRAME_END, frame_end, None)
    pyboy.hook_register(0, MAIN_LOOP, lambda _: ctr.__setitem__('started', True), None)

    # ---- boot to gameplay on level $0E -------------------------------------
    for f in range(3000):
        if ctr['started']:
            break
        if f % 30 == 0:
            pyboy.button('start', delay=3)
        pyboy.tick(1, False)
    for n in ('right', 'left', 'up', 'down', 'a', 'b', 'start'):
        pyboy.button_release(n)

    # ASSERT ARRIVAL before reading a single byte.
    if not ctr['started']:
        raise SystemExit('FAIL: gameplay never started')
    if m[0xFFB0] != BOSS_LEVEL:
        raise SystemExit(f'FAIL: wanted level $0E, got ${m[0xFFB0]:02X}')
    if m[0xC73E] == 0:
        raise SystemExit('FAIL: level $0E has no boss ($C73E = 0)')

    # The boot path already tripped $0150 once; leaving that counter alone makes
    # the "has it happened yet?" break true on the first tick (deathscen.py).
    for k in hits:
        hits[k] = 0
    marks.clear()
    ctr['lag'] = 0
    gameplay_base = ctr['n']

    poked = {'v': False, 'hp': None}
    pressed = {'v': False, 'at': None}
    mashed = {'state': False, 'next': 0}
    stop_at = {'v': None}

    while ctr['n'] - gameplay_base < args.frames:
        if not poked['v'] and ctr['n'] - gameplay_base >= args.poke_at:
            poked['v'] = True
            poked['hp'] = m[ENEMY0 + 0x16]
            m[ENEMY0 + 0x16] = 0                     # 1:$4E82's own trigger
        if ctr['inside']:
            rel = ctr['n'] - marks['ending']
            if args.mash_start and rel >= mashed['next']:
                mashed['state'] = not mashed['state']
                mashed['next'] = rel + 8
                (pyboy.button_press if mashed['state']
                 else pyboy.button_release)('start')
            if args.start_at is not None and not pressed['v'] and rel >= args.start_at:
                pressed['v'] = True
                pressed['at'] = rel
                events.append({'kind': 'mark', 'frame': ctr['n'], 'note': 'START'})
                pyboy.button_press('start')
            elif pressed['v'] and rel >= pressed['at'] + 4:
                pyboy.button_release('start')
        # `render=False` is the fast path everywhere else in this tree -- but it
        # leaves pyboy.screen holding a STALE buffer, so a screenshot taken
        # after one is a picture of some earlier frame. With --shots the whole
        # run renders; it costs a few seconds and it is the difference between
        # a real comparison and a fictitious one.
        pyboy.tick(1, shots is not None)
        # PyBoy has just finished one hardware frame, so `screen` holds it.
        if shots is not None and ctr['inside']:
            f = ctr['n'] - marks['ending']
            if f in shot_at:
                shot_at.discard(f)
                shots.write_indexed_png(
                    os.path.join(ROOT, args.shot_dir, f'f{f:04d}.png'),
                    160, 144, shots.screen_shades(pyboy), shots.DMG_PALETTE)
        if hits['reset']:
            break
        # EVENT-CAPPED: the ROM's own landmark plus settling frames.
        if hits['wait'] and stop_at['v'] is None:
            stop_at['v'] = ctr['n'] + args.settle
        if stop_at['v'] is not None and ctr['n'] >= stop_at['v']:
            break

    if not hits['dispatch']:
        raise SystemExit('FAIL: loc_00_35E8 never ran -- the boss never died')
    if not hits['ending']:
        raise SystemExit('FAIL: loc_00_3652 never ran')
    if not hits['wait'] and not hits['reset']:
        raise SystemExit('FAIL: the ending never reached $3887')
    if args.start_at is None and not args.mash_start:
        need = ['before', 'pic1', 'ramp', 'pic2', 'pic3', 'pic4', 'theEnd', 'wait']
        for tag in need:
            if tag not in snaps:
                raise SystemExit(f'FAIL: never reached the "{tag}" landmark')
        for i in range(13):
            for letter in 'abcde':
                if f'c{i}{letter}' not in maps:
                    raise SystemExit(f'FAIL: crawl snapshot c{i}{letter} missing')

    base = marks['ending']
    for s in snaps.values():
        s['frame'] -= base
    for s in maps.values():
        s['frame'] -= base
    for e in events:
        e['frame'] -= base
    for s in samples:
        s['frame'] -= base
    rel = {k: v - base for k, v in marks.items()}

    out = {'lagFrames': ctr['lag'], 'hits': hits, 'marks': rel,
           'bossHpWas': poked['hp'], 'startAt': args.start_at,
           'mashStart': args.mash_start, 'shotFrames': shot_frames,
           'events': events, 'snaps': snaps, 'maps': maps, 'samples': samples,
           'totalFrames': ctr['n'] - base}
    path = os.path.join(ROOT, args.out)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fh:
        json.dump(out, fh)

    print(f'hits: {hits}')
    print(f'marks (sub_00_0A4F calls since $3652): '
          + json.dumps({k: v for k, v in sorted(rel.items(), key=lambda kv: kv[1])}))
    print(f"total frames inside the ending: {ctr['n'] - base}, "
          f"lag frames: {ctr['lag']}")
    kinds = {}
    for e in events:
        kinds[e['kind']] = kinds.get(e['kind'], 0) + 1
    print('events:', kinds)
    for e in events:
        if e['kind'] == 'copy':
            print(f"  f{e['frame']:4d} copy {e['bank']:02X}:${e['src']:04X} -> "
                  f"${e['dest']:04X}  {e['len']} B")
        elif e['kind'] == 'script':
            print(f"  f{e['frame']:4d} script {e['bank']:02X}:${e['addr']:04X}  "
                  f"{len(e['bytes'])} B")
        elif e['kind'] in ('fill', 'resource'):
            v = e.get('value', e.get('id'))
            print(f"  f{e['frame']:4d} {e['kind']} ${v:02X}")
        elif e['kind'] == 'fade':
            print(f"  f{e['frame']:4d} sub_00_0A7F C=${e['c']:02X}")
        elif e['kind'] == 'sound':
            print(f"  f{e['frame']:4d} sound id ${e['id']:02X} mask ${e['mask']:02X}")
        elif e['kind'] == 'mark':
            print(f"  f{e['frame']:4d} {e['note']}")

    if 'before' in snaps and 'vram' in snaps['before']:
        before, after = snaps['before']['vram'], snaps['pic1']['vram']
        runs, run = [], None
        for i in range(0x2000):
            if before[i] != after[i]:
                run = [i, i] if run is None else [run[0], i]
            elif run is not None:
                runs.append(run)
                run = None
        if run is not None:
            runs.append(run)
        changed = sum(r[1] - r[0] + 1 for r in runs)
        print(f'\nVRAM changed by the ending build: {changed} B in {len(runs)} run(s)')
        for a, b in runs[:24]:
            print(f'  ${0x8000 + a:04X}-${0x8000 + b:04X}  {b - a + 1} B')
        if len(runs) > 24:
            print(f'  ... and {len(runs) - 24} more')
        print('regs at pic1:', json.dumps(snaps['pic1']['regs']))
    print(f'wrote {args.out}')
    pyboy.stop(save=False)


if __name__ == '__main__':
    main()
