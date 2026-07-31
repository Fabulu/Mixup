#!/usr/bin/env python3
"""prgmap - what is in the PRG that is NOT reachable code.

Runs nesdis's tracer, then classifies everything it did not reach:
  * ASCII runs (the Konami build stamp lives at $8000);
  * pointer-table candidates: runs of little-endian words that all land in PRG,
    which on this ROM is how level / enemy / sound data is indexed;
  * a gap report, biggest first, so the next person knows where to dig.

Nothing here is a conclusion.  A "pointer table candidate" is a shape, not a
fact; it becomes a fact when a traced instruction is shown to index it.  The
--confirm pass does exactly that: it cross-references each candidate against the
absolute addresses the traced code actually loads from (nesdis records these in
Tracer.data_refs), and marks the ones with a real reader.

ROM-DERIVED OUTPUT.  Never commit.

Usage:
    python prgmap.py "Gradius (USA).nes"
    python prgmap.py "Gradius (USA).nes" --gaps 30 --minptr 6
"""
import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import nesdis  # noqa: E402


def ascii_runs(rom, minlen=6):
    out, start = [], None
    for a in range(rom.base, 0x10000):
        b = rom.byte(a)
        printable = 32 <= b < 127
        if printable and start is None:
            start = a
        elif not printable and start is not None:
            if a - start >= minlen:
                out.append((start, bytes(rom.byte(x) for x in range(start, a))))
            start = None
    if start is not None and 0x10000 - start >= minlen:
        out.append((start, bytes(rom.byte(x) for x in range(start, 0x10000))))
    return out


def pointer_runs(rom, covered, minlen=4):
    """Maximal runs of LE words pointing into PRG, entirely inside data."""
    out = []
    a = rom.base
    while a < 0xFFFE:
        if a in covered:
            a += 1
            continue
        n = 0
        p = a
        while p + 1 < 0x10000 and p not in covered and (p + 1) not in covered:
            v = rom.word(p)
            if not rom.in_prg(v):
                break
            n += 1
            p += 2
        if n >= minlen:
            out.append((a, [rom.word(a + 2 * i) for i in range(n)]))
            a = p
        else:
            a += 1
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('rom')
    ap.add_argument('--gaps', type=int, default=25)
    ap.add_argument('--minptr', type=int, default=5)
    ap.add_argument('--minascii', type=int, default=6)
    args = ap.parse_args()

    rom = nesdis.Rom(args.rom)
    nmi, res, irq = rom.vectors()
    t = nesdis.Tracer(rom)
    seeds = [res, nmi, irq]
    for s in seeds:
        t.push(s, 'seed')
    t.run_to_fixpoint(seeds)

    covered = set()
    for a, (_, ln, _, _, _) in t.code.items():
        covered.update(range(a, a + ln))
    for base, ents in t.itables.items():
        covered.update(range(base, base + 2 * len(ents)))
    covered.update(range(0xFFFA, 0x10000))

    total = len(rom.prg)
    print(f'PRG ${rom.base:04X}-$FFFF, {total} bytes')
    print(f'  reached by the tracer : {len(covered)} ({100.0*len(covered)/total:.1f}%)')
    print(f'  not reached           : {total-len(covered)} '
          f'({100.0*(total-len(covered))/total:.1f}%)')

    print('\n== ASCII runs in unreached bytes ==')
    n = 0
    for a, s in ascii_runs(rom, args.minascii):
        tag = '' if a in covered else ' '
        if any(x in covered for x in range(a, a + len(s))):
            tag = ' (overlaps code)'
        print(f'  ${a:04X}  {s.decode("ascii")!r}{tag}')
        n += 1
    if not n:
        print('  (none)')

    print(f'\n== pointer-table candidates (>= {args.minptr} consecutive '
          'in-PRG words, entirely in unreached bytes) ==')
    cands = [c for c in pointer_runs(rom, covered, args.minptr)]
    readers = t.data_refs
    confirmed = 0
    for a, ents in sorted(cands, key=lambda c: -len(c[1]))[:40]:
        rd = sorted({s for x in range(a, a + 2 * len(ents)) for s in readers.get(x, ())})
        mark = f'  <- read by {" ".join("%04X" % r for r in rd[:4])}' if rd else ''
        if rd:
            confirmed += 1
        print(f'  ${a:04X}  {len(ents):3d} words  '
              f'{" ".join("%04X" % e for e in ents[:8])}'
              f'{" ..." if len(ents)>8 else ""}{mark}')
    print(f'  {len(cands)} candidate run(s) total, {confirmed} with a traced reader; '
          f'showing the 40 longest')

    print(f'\n== largest unreached gaps (top {args.gaps}) ==')
    gaps, start = [], None
    for a in range(rom.base, 0x10000):
        if a not in covered and start is None:
            start = a
        elif a in covered and start is not None:
            gaps.append((start, a - start))
            start = None
    if start is not None:
        gaps.append((start, 0x10000 - start))
    for a, n in sorted(gaps, key=lambda g: -g[1])[:args.gaps]:
        head = ' '.join('%02X' % rom.byte(a + i) for i in range(min(12, n)))
        print(f'  ${a:04X}-${a+n-1:04X}  {n:5d} bytes   {head} ...')
    print(f'  {len(gaps)} gap(s) total, showing the {args.gaps} largest')


if __name__ == '__main__':
    main()
