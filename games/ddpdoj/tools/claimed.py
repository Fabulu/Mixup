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
                # W358: classify by the address's SYNTACTIC POSITION first, not by what the line looks
                # like. `note(ctx, 0x23c4d0);` is executable JavaScript AND a declaration that the address
                # is NOT ported, so a comment-versus-code test cannot decide it -- it is both. The old
                # chain was meant to catch this and did not: boss.js:184 came out CODE while the same
                # string tested NOTE in isolation, which is how three of Hibachi's callees were reported
                # CLAIMED when they are deferrals. An address passed AS AN ARGUMENT to note()/unreached()
                # is a deferral, full stop, so that is now checked before anything else.
                if re.search(r'\b(note|unreached)\s*\([^)]*' + re.escape(addr.lower()) + r'\b',
                             line.lower()):
                    kind = 'NOTE'
                elif re.match(r'\s*(//|\*|/\*)', line):
                    kind = 'COMMENT'
                # W345: an address quoted INSIDE a note()/unreached() string is the port saying it has
                # NOT ported that address. Counting it as a claim gave a false CLAIMED on $23C98E, whose
                # only mentions were in my own note text -- the exact inverse of the eight duplicates this
                # tool was built for, so both directions now have to be distinguished.
                elif re.search(r'(note|unreached)\s*\(', line) or "'" in line or '`' in line:
                    kind = 'NOTE'
                else:
                    kind = 'CODE'
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
        notes = [h for h in hits if h[2] == 'NOTE']
        owners = sorted({h[3] for h in hits if h[3] != '(file scope)'})
        if not code:
            # W358: this verdict is "no CODE LITERAL", which is NOT the same as "not ported". A routine can
            # be fully ported under a NAME while its address appears only in comments -- $263684 is exactly
            # that: it is `enqueueDeferred` in spawn.js, called by handler46 in shipped code, and this tool
            # sees no literal. Saying "NOT PORTED" there would invite someone to delete a working call.
            # The reverse also happens: $242B90 had no mentions at all while being byte-identical to the
            # ported $242B3C bar one register. So this tool measures ADDRESS LITERALS, not implementations,
            # and the verdict is worded to say only what it actually knows.
            many = len(hits) >= 6
            print(f'{label}: NO CODE LITERAL -- {len(hits)} mention(s), none of them code '
                  f'({len(notes)} inside note()/unreached() calls or strings, the rest comments).')
            if many:
                print(f'    ** {len(hits)} mentions with no literal often means the routine IS ported under '
                      'a NAME (grep the comments for it) -- check before concluding it needs writing.')
            else:
                print('    Likely genuinely unported: a note()/unreached() quoting an address is the port '
                      'saying it has not translated it.')
            for f, n, kind, owner, text in hits[:4]:
                print(f'    {f}:{n} [{kind}] in {owner}')
            continue
        print(f'{label}: CLAIMED -- {len(hits)} mention(s), {len(code)} in CODE, {len(notes)} in notes')
        # W358: CLAIMED flattens a solid port and a barely-there one. Two addresses taught this the hard
        # way -- $263684 read as CLAIMED on ONE code mention (it was fine), and four of Hibachi's callees
        # came back CLAIMED with 1-2 code mentions against 3-4 notes. A high notes-to-code ratio means the
        # port has written ABOUT the address more than it has implemented it, which is the shape of a
        # `note()` standing in for a routine -- and a note() mention counts as a hit here.
        if len(code) <= 2 and len(notes) >= len(code):
            print(f'    ** THIN: only {len(code)} code mention(s) against {len(notes)} note(s). VERIFY this '
                  'is a real implementation and not a note() deferral before relying on it.')
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
