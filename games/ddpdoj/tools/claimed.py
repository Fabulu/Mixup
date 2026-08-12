#!/usr/bin/env python3
"""Who already ports a ROM address?

W344 built this after FIVE duplicate ports in one session, all from the same mistake: grepping
`0x<addr>` in lowercase, getting nothing, and porting a routine the port already had. The port
writes these addresses as `$260A88` in docstrings and names the symbols after their ROLE --
`announcePost`, `announceBox260A20`, `menuCarry28D53C`, `carryWord` -- so a `0x`-prefixed search
finds none of them.

    python tools/claimed.py 260a88 28d53c 2417de

For each address it reports every mention in `src/`, in ANY of the forms the port uses, with the
nearest preceding `function`/`const`/`class` so the answer is "who claims it", not just "where".

Exit code 1 if every address given is unclaimed, so it can gate a wave.
"""
import re
import sys
from pathlib import Path

SRC = Path(__file__).resolve().parent.parent / 'src'
DECL = re.compile(r'^\s*(?:export\s+)?(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)')


def forms(addr: str):
    """Every spelling the port uses for one address, case-insensitively."""
    a = addr.lower().lstrip('$').lstrip('0x')
    return re.compile(r'(?<![0-9a-fA-F])(?:0x|\$|\$00)?' + a + r'(?![0-9a-fA-F])', re.I)


def scan(addr: str):
    pat = forms(addr)
    hits = []
    for f in sorted(SRC.glob('*.js')):
        lines = f.read_text(encoding='utf-8', errors='replace').splitlines()
        owner = '(file scope)'
        for n, line in enumerate(lines, 1):
            d = DECL.match(line)
            if d:
                owner = d.group(1)
            if pat.search(line):
                kind = 'COMMENT' if re.match(r'\s*(//|\*|/\*)', line) else 'CODE'
                hits.append((f.name, n, kind, owner, line.strip()[:100]))
    return hits


def main(argv):
    if not argv:
        print(__doc__)
        return 2
    any_claimed = False
    for addr in argv:
        hits = scan(addr)
        label = '$' + addr.lower().lstrip('$').lstrip('0x').upper()
        if not hits:
            print(f'{label}: UNCLAIMED -- no mention in src/ in any form')
            continue
        any_claimed = True
        code = [h for h in hits if h[2] == 'CODE']
        owners = sorted({h[3] for h in hits if h[3] != '(file scope)'})
        print(f'{label}: CLAIMED -- {len(hits)} mention(s), {len(code)} in CODE')
        if owners:
            print(f'    likely owner(s): {", ".join(owners)}')
        for f, n, kind, owner, text in hits[:8]:
            print(f'    {f}:{n} [{kind}] in {owner}')
            print(f'        {text}')
        if len(hits) > 8:
            print(f'    ... and {len(hits) - 8} more')
    return 0 if any_claimed else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
