#!/usr/bin/env python3
"""handlerflow.py -- fall-through and cross-entry analysis of the $AE1C handlers.

Trap #1 in docs/knowledge/02 (ten incidents): "the label you land on is not
where the routine ends". This walks every one of the 42 dispatch targets with a
real 6502 decoder and reports, per handler:

  * every address it can reach (including the byte AFTER an apparent end),
  * whether it FALLS THROUGH into another dispatch target,
  * every jump/branch it makes INTO the interior of another handler,
  * every absolute data address it indexes (LDA abs,X / abs,Y).

  python games/gradius/tools/handlerflow.py
"""
import os, sys, collections
sys.path.insert(0, os.path.dirname(__file__))
from dis6502 import Rom, decode, BRANCH, STOP, ABS, ABX, ABY, IND, REL, IMM  # noqa

NES = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'Gradius (USA).nes')
rom = Rom(NES)
DISPATCH = 0xAE1C
NENT = 42
TARGETS = [rom.w(DISPATCH + 2 * i) for i in range(NENT)]
TSET = set(TARGETS)


def walk(entry, limit=4000):
    """Linear+branch walk. Returns (reached, falls_into, jumps, calls, data)."""
    seen, work = set(), [entry]
    falls, jumps, calls, data = set(), set(), set(), collections.Counter()
    while work:
        pc = work.pop()
        while True:
            if pc in seen or not (0x8000 <= pc < 0x10000):
                break
            if pc != entry and pc in TSET:
                falls.add(pc)          # execution ARRIVED at another entry
            seen.add(pc)
            mn, mode, ln, arg, txt = decode(rom, pc)
            if mode in (ABX, ABY) and mn in ('LDA', 'LDX', 'LDY', 'CMP', 'ADC', 'SBC'):
                if arg >= 0x8000:
                    data[arg] += 1
            if mn in BRANCH:
                if arg in TSET and arg != entry:
                    jumps.add(('branch', pc, arg))
                work.append(arg)
            elif mn == 'JSR':
                calls.add(arg)
                if arg in TSET and arg != entry:
                    jumps.add(('jsr', pc, arg))
                work.append(arg)
            elif mn == 'JMP' and mode == ABS:
                if arg in TSET and arg != entry:
                    jumps.add(('jmp', pc, arg))
                work.append(arg)
                break
            elif mn in STOP or mn == '???':
                break
            pc += ln
            if len(seen) > limit:
                break
    return seen, falls, jumps, calls, data


def main():
    spans = {}
    for i, t in enumerate(sorted(TSET)):
        pass
    print('=== per-handler flow, %d distinct targets ===' % len(TSET))
    allreach = {}
    for t in sorted(TSET):
        ents = [i for i, x in enumerate(TARGETS) if x == t]
        seen, falls, jumps, calls, data = walk(t)
        allreach[t] = seen
        print('\n$%04X  entries %s  reaches %d bytes  [$%04X..$%04X]'
              % (t, ents, len(seen), min(seen), max(seen)))
        if falls:
            print('   FALLS INTO / ARRIVES AT other dispatch targets: %s'
                  % ' '.join('$%04X' % f for f in sorted(falls)))
        if jumps:
            for kind, pc, a in sorted(jumps, key=lambda z: z[1]):
                print('   %s at $%04X -> dispatch target $%04X' % (kind.upper(), pc, a))
        if data:
            print('   indexes: %s'
                  % ' '.join('$%04X x%d' % (a, c) for a, c in sorted(data.items())))

    # cross-entry interior jumps: does handler A jump into the BODY of B?
    print('\n=== cross-handler interior entries ===')
    bodies = {}
    for t in sorted(TSET):
        bodies[t] = allreach[t]
    for t in sorted(TSET):
        seen, falls, jumps, calls, data = walk(t)
        hits = collections.defaultdict(set)
        for pc in sorted(seen):
            for u in sorted(TSET):
                if u == t:
                    continue
                if pc == u:
                    hits[u].add('ENTRY')
        # find shared-body targets: addresses reached by t that are also the
        # first instruction of another handler's exclusive body
        # (report which other targets share code)
        shared = [u for u in sorted(TSET) if u != t and (bodies[u] & seen)]
        if shared:
            print('$%04X shares code with: %s'
                  % (t, ' '.join('$%04X' % u for u in shared)))


if __name__ == '__main__':
    main()
