#!/usr/bin/env python3
"""Batman: Return of the Joker (GB) -- sound-sequence disassembler.

The whole sound engine and all music/SFX data live in ROM bank 7:
    7:$4000-$46D4   driver code
    7:$46D5-$477C   84-entry 16-bit pitch table (values biased by -$80)
    7:$477D-$47DA   47-entry song pointer table
    7:$47DB-$4809   shared volume envelopes + 2 wave tables
    7:$480A-$7FFF   song / SFX sequence data

Usage
    python tools/dumpsong.py <rom> --index            # song index table
    python tools/dumpsong.py <rom> --song 0           # one song
    python tools/dumpsong.py <rom> --all              # every song
    python tools/dumpsong.py <rom> --freq             # pitch table
    python tools/dumpsong.py <rom> --waves            # every wave table found

See docs/recon-4-audio.md for the format spec this implements.
"""

import argparse
import math
import sys

BANK = 7
PITCH_TAB = 0x46D5
PITCH_N = 84
SONG_TAB = 0x477D
SONG_N = 47
DATA_END = 0x8000

NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

# opcode -> (mnemonic, operand-spec)
#   operand-spec is a list of tokens:
#       'b'   one raw byte
#       'w'   16-bit little-endian address in bank 7
#       'D'   duration byte, present only when the track's fixed-duration
#             register (+$04) is currently 0
OPS = {
    0xC8: ('CHMASK_XOR',   ['b']),
    0xC9: ('CHMASK_OR',    ['b']),
    0xCA: ('CHMASK_AND',   ['b']),
    0xCB: ('DRUM 3',       ['D']),
    0xCC: ('DRUM 2',       ['D']),
    0xCD: ('DRUM 1',       ['D']),
    0xCE: ('DRUM 0',       ['D']),
    0xCF: ('DEFDRUM 3',    ['b', 'b', 'b']),
    0xD0: ('DEFDRUM 2',    ['b', 'b', 'b']),
    0xD1: ('DEFDRUM 1',    ['b', 'b', 'b']),
    0xD2: ('DEFDRUM 0',    ['b', 'b', 'b']),
    0xD3: ('FIXDUR_OFF',   []),
    0xD4: ('SLIDE 5',      ['S']),
    0xD5: ('SLIDE 4',      ['S']),
    0xD6: ('SLIDE 3',      ['S']),
    0xD7: ('SLIDE 2',      ['S']),
    0xD8: ('SLIDE 1',      ['S']),
    0xD9: ('SLIDE 0',      ['S']),
    0xDA: ('DEFSLIDE 5',   ['b', 'b', 'b']),
    0xDB: ('DEFSLIDE 4',   ['b', 'b', 'b']),
    0xDC: ('DEFSLIDE 3',   ['b', 'b', 'b']),
    0xDD: ('DEFSLIDE 2',   ['b', 'b', 'b']),
    0xDE: ('DEFSLIDE 1',   ['b', 'b', 'b']),
    0xDF: ('DEFSLIDE 0',   ['b', 'b', 'b']),
    0xE0: ('PITCHENV_OFF', []),
    0xE1: ('PITCHENV_DELAY 0', []),
    0xE2: ('PITCHENV_DELAY 1', []),
    0xE3: ('PITCHENV_DELAY 1 + GATE_OFF', []),
    0xE4: ('GATE_OFF',     []),
    0xE5: ('PAN_LEFT',     []),
    0xE6: ('PAN_RIGHT',    []),
    0xE7: ('PAN_CENTER',   []),
    0xE8: ('VIBRATO',      ['b']),
    0xE9: ('LEGATO_OFF',   []),
    0xEA: ('LEGATO_ON',    []),
    0xEB: ('TIE',          ['D']),
    0xEC: ('DUTY',         ['b']),
    0xED: ('RET',          []),
    0xEE: ('CALL',         ['w']),
    0xEF: ('LOOP_B',       ['b', 'w']),
    0xF0: ('LOOP_A',       ['b', 'w']),
    0xF1: ('JUMP',         ['w']),
    0xF2: ('FIXDUR',       ['b']),
    0xF3: ('DETUNE',       ['b']),
    0xF4: ('TRANSPOSE',    ['b']),
    0xF5: ('RELEASE_ENV',  ['b']),
    0xF6: ('REST',         ['D']),
    0xF7: ('PITCHENV_DELAY', ['b']),
    0xF8: ('PITCHENV_PTR', ['w']),
    0xF9: ('GATE',         ['b']),
    0xFA: ('KEYOFF_VOLENV_PTR', ['w']),
    0xFB: ('WAVE_PTR',     ['w']),
    0xFC: ('VOLENV_PTR',   ['w']),
    0xFD: ('PAN_RAW',      ['b']),
    0xFE: ('VOLUME',       ['b']),
    0xFF: ('END',          []),
}

# Opcodes that unconditionally leave the current byte stream.
# $ED (RET) is NOT here: with an empty return slot (+$21 == 0) the driver
# treats it as a no-op and falls through, so at depth 0 decoding continues.
TERMINAL = {0xF1, 0xFF}


class Rom:
    def __init__(self, path):
        with open(path, 'rb') as f:
            self.d = f.read()

    def b(self, a):
        return self.d[BANK * 0x4000 + (a - 0x4000)]

    def w(self, a):
        return self.b(a) | (self.b(a + 1) << 8)


def note_name(i):
    """Pitch-table index -> note name. Index 0 is C2."""
    if i >= PITCH_N:
        return f'?{i}'
    return f'{NOTE_NAMES[i % 12]}{i // 12 + 2}'


def pitch_hz(rom, i):
    v = (rom.w(PITCH_TAB + i * 2) + 0x80) & 0xFFFF
    div = 2048 - v
    return (131072.0 / div) if div > 0 else 0.0


# ---------------------------------------------------------------- sequences

def walk(rom, start, fixdur=0, is_sub=False):
    """Linearly decode one sequence stream starting at `start`.

    Returns (lines, refs) where refs is a dict of referenced sub-stream
    addresses: {'seq': set, 'volenv': set, 'pitchenv': set, 'wave': set}
    Follows fall-through only; CALL/LOOP/JUMP targets are reported as refs.
    """
    lines = []
    refs = {'seq': set(), 'call': set(), 'volenv': set(), 'pitchenv': set(),
            'wave': set()}
    p = start
    seen = set()
    while 0x4000 <= p < DATA_END:
        if p in seen:
            lines.append(f'  {p:04X}:  <already decoded>')
            break
        seen.add(p)
        op = rom.b(p)
        raw = [op]
        q = p + 1
        if op < 0xC8:
            # a note.  duration byte follows unless FIXDUR is armed
            dur = fixdur
            if fixdur == 0:
                dur = rom.b(q)
                raw.append(dur)
                q += 1
            lines.append(f'  {p:04X}: {" ".join(f"{x:02X}" for x in raw):<11} '
                         f'NOTE  {note_name(op):<5} ({op:3d})  dur={dur}')
            p = q
            continue
        name, spec = OPS[op]
        args = []
        txt = []
        for t in spec:
            if t == 'b':
                v = rom.b(q); raw.append(v); q += 1
                args.append(v); txt.append(f'${v:02X}')
            elif t == 'w':
                v = rom.w(q); raw += [v & 0xFF, v >> 8]; q += 2
                args.append(v); txt.append(f'${v:04X}')
            elif t == 'D':
                if fixdur == 0:
                    v = rom.b(q); raw.append(v); q += 1
                else:
                    v = fixdur
                args.append(v); txt.append(f'dur={v}')
            elif t == 'S':
                v = rom.b(q); raw.append(v); q += 1
                args.append(v); txt.append(f'note={note_name(v)}')
                if fixdur == 0:
                    v2 = rom.b(q); raw.append(v2); q += 1
                    args.append(v2); txt.append(f'dur={v2}')
        # side effects the decoder itself must track
        if op == 0xF2:
            fixdur = args[0]
        elif op == 0xD3:
            fixdur = 0
        # collect references
        if op == 0xEE:
            refs['call'].add(args[0])
        elif op == 0xF1:
            refs['seq'].add(args[0])
        elif op in (0xEF, 0xF0):
            refs['seq'].add(args[1])
        elif op in (0xFC, 0xFA):
            refs['volenv'].add(args[0])
        elif op == 0xF8:
            refs['pitchenv'].add(args[0])
        elif op == 0xFB:
            refs['wave'].add(args[0])
        extra = ''
        if op == 0xEC:
            extra = f'   ; duty={args[0] >> 6} len={args[0] & 0x3F}'
        elif op == 0xFE:
            extra = f'   ; vol={args[0] >> 4} {"up" if args[0] & 8 else "down"} per={args[0] & 7}'
        elif op == 0xE8:
            d = args[0] - 256 if args[0] >= 0x80 else args[0]
            extra = f'   ; {d:+d} per tick'
        elif op == 0xF9:
            extra = f'   ; gate = {args[0] * 2} ticks'
        lines.append(f'  {p:04X}: {" ".join(f"{x:02X}" for x in raw):<11} '
                     f'{name} {" ".join(txt)}{extra}')
        p = q
        if op in TERMINAL or (op == 0xED and is_sub):
            break
    return lines, refs


def dump_volenv(rom, a, out):
    out.append(f'  volume envelope ${a:04X}:')
    p = a
    n = 0
    while n < 64:
        v = rom.b(p)
        if v == 0xFF:
            t = rom.w(p + 1)
            out.append(f'    {p:04X}: FF {t & 0xFF:02X} {t >> 8:02X}   LOOP ${t:04X}')
            break
        d = rom.b(p + 1)
        out.append(f'    {p:04X}: {v:02X} {d:02X}      NRx2=${v:02X} '
                   f'(vol={v >> 4} {"up" if v & 8 else "down"} per={v & 7})  {d} ticks')
        p += 2
        n += 1


def dump_pitchenv(rom, a, out):
    out.append(f'  pitch envelope ${a:04X}:')
    p = a
    n = 0
    while n < 96:
        v = rom.b(p)
        if v == 0x80:
            t = rom.w(p + 1)
            out.append(f'    {p:04X}: 80 {t & 0xFF:02X} {t >> 8:02X}   LOOP ${t:04X}')
            break
        d = v - 256 if v > 0x80 else v
        out.append(f'    {p:04X}: {v:02X}         freq_lo {d:+d}')
        p += 1
        n += 1


def dump_wave(rom, a, out):
    b = [rom.b(a + i) for i in range(16)]
    out.append(f'  wave table ${a:04X}: ' + ' '.join(f'{x:02X}' for x in b))
    out.append('    samples: ' + ' '.join(f'{x >> 4:X}{x & 15:X}' for x in b))


def song_tracks(rom, idx):
    p = rom.w(SONG_TAB + idx * 2)
    out = []
    while rom.b(p) != 0xFF and len(out) < 16:
        out.append((rom.b(p), rom.b(p + 1), rom.w(p + 2)))
        p += 4
    return p, out


def dump_song(rom, idx, out):
    hdr = rom.w(SONG_TAB + idx * 2)
    end, tracks = song_tracks(rom, idx)
    out.append('=' * 72)
    out.append(f'SONG ${idx:02X}  header ${hdr:04X}..${end:04X}  '
               f'{len(tracks)} track(s)')
    out.append('=' * 72)
    allrefs = {'seq': set(), 'volenv': set(), 'pitchenv': set(), 'wave': set()}
    for slot, chan, ptr in tracks:
        out.append('')
        out.append(f'--- track slot {slot} -> APU channel {chan} '
                   f'({["pulse1", "pulse2", "wave", "noise"][chan]})  '
                   f'stream ${ptr:04X}')
        pend = [(ptr, False)]
        done = set()
        while pend:
            a, sub = pend.pop(0)
            if a in done or not (0x4000 <= a < DATA_END):
                continue
            done.add(a)
            if a != ptr:
                out.append(f'  ---- ${a:04X} ({"subroutine" if sub else "branch target"}) ----')
            lines, refs = walk(rom, a, is_sub=sub)
            out += lines
            for k in allrefs:
                allrefs[k] |= refs[k]
            pend += [(x, False) for x in sorted(refs['seq'])]
            pend += [(x, True) for x in sorted(refs['call'])]
    if allrefs['volenv'] or allrefs['pitchenv'] or allrefs['wave']:
        out.append('')
        out.append('--- referenced macro data ---')
    for a in sorted(allrefs['volenv']):
        dump_volenv(rom, a, out)
    for a in sorted(allrefs['pitchenv']):
        dump_pitchenv(rom, a, out)
    for a in sorted(allrefs['wave']):
        dump_wave(rom, a, out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rom')
    ap.add_argument('--song', type=lambda s: int(s, 0))
    ap.add_argument('--all', action='store_true')
    ap.add_argument('--index', action='store_true')
    ap.add_argument('--freq', action='store_true')
    ap.add_argument('--waves', action='store_true')
    ap.add_argument('-o', '--out')
    args = ap.parse_args()

    rom = Rom(args.rom)
    out = []

    if args.index:
        out.append('idx  hdr    tracks (slot -> APU chan @ stream)')
        for i in range(SONG_N):
            hdr = rom.w(SONG_TAB + i * 2)
            _, tr = song_tracks(rom, i)
            s = ', '.join(f'{t[0]}->ch{t[1]}@${t[2]:04X}' for t in tr)
            out.append(f'${i:02X}  ${hdr:04X}  {s}')

    if args.freq:
        out.append('idx  raw    +$80   Hz        note')
        for i in range(PITCH_N):
            raw = rom.w(PITCH_TAB + i * 2)
            out.append(f'{i:3d}  ${raw:04X}  ${(raw + 0x80) & 0xFFFF:04X}  '
                       f'{pitch_hz(rom, i):9.2f}  {note_name(i)}')

    if args.waves:
        found = set()
        for i in range(SONG_N):
            _, tracks = song_tracks(rom, i)
            for _, _, ptr in tracks:
                pend, done = [(ptr, False)], set()
                while pend:
                    a, sub = pend.pop()
                    if a in done or not (0x4000 <= a < DATA_END):
                        continue
                    done.add(a)
                    _, refs = walk(rom, a, is_sub=sub)
                    found |= refs['wave']
                    pend += [(x, False) for x in refs['seq']]
                    pend += [(x, True) for x in refs['call']]
        for a in sorted(found):
            dump_wave(rom, a, out)

    if args.song is not None:
        dump_song(rom, args.song, out)
    if args.all:
        for i in range(SONG_N):
            dump_song(rom, i, out)
            out.append('')

    text = '\n'.join(out)
    if args.out:
        with open(args.out, 'w', encoding='utf-8') as f:
            f.write(text + '\n')
        print(f'wrote {args.out}', file=sys.stderr)
    else:
        print(text)


if __name__ == '__main__':
    main()
