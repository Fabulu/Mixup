#!/usr/bin/env python3
"""Check docket IDs in docs/DOCKET.md: no duplicates, no gaps, and report the next free one.

Written under D47 because W408 opened five items as D41..D45 when D41 was already
"controls to actually start the game".  Nothing caught it; the collision was only
noticed because a human happened to read the file.  A duplicate ID is quiet damage:
two items answer to one name and whichever an agent reads first wins.

    python games/ddpdoj/tools/docket_ids.py          # report, exit 1 on a duplicate
    python games/ddpdoj/tools/docket_ids.py --next   # print the next free ID and exit 0

Headings look like `### D41: CONTROLS TO ACTUALLY START THE GAME`.  Only headings
count; a mention of D41 in prose is a cross-reference, not a definition.
"""

import argparse
import io
import os
import re
import sys

HEADING = re.compile(r'^#{2,4}\s+D(\d+)\s*[:.]', re.MULTILINE)


def repo_root():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(here, '..', '..', '..'))


def docket_path():
    return os.path.join(repo_root(), 'docs', 'DOCKET.md')


def read_ids(path):
    """Return [(id, line_number, heading_text)] in file order."""
    with io.open(path, encoding='utf-8', newline='') as fh:
        text = fh.read()
    out = []
    for m in HEADING.finditer(text):
        line_no = text.count('\n', 0, m.start()) + 1
        heading = text[m.start():text.find('\n', m.start())].strip()
        out.append((int(m.group(1)), line_no, heading))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--next', action='store_true',
                    help='print the next free ID and exit 0')
    args = ap.parse_args()

    path = docket_path()
    if not os.path.exists(path):
        print('docket not found: %s' % path)
        return 1

    ids = read_ids(path)
    if not ids:
        print('no docket headings matched in %s' % path)
        return 1

    seen = {}
    dupes = []
    for num, line_no, heading in ids:
        if num in seen:
            dupes.append((num, seen[num], (line_no, heading)))
        else:
            seen[num] = (line_no, heading)

    highest = max(seen)
    nxt = highest + 1

    if args.next:
        print(nxt)
        return 0

    print('docket: %s' % os.path.relpath(path, repo_root()))
    print('  %d items, D%d..D%d' % (len(seen), min(seen), highest))

    missing = [n for n in range(min(seen), highest) if n not in seen]
    if missing:
        # A gap is not an error.  IDs get reserved in conversation and filled later.
        print('  gaps (not an error): %s'
              % ', '.join('D%d' % n for n in missing))

    if dupes:
        print('\nDUPLICATE IDS -- two items answer to one name:')
        for num, first, second in dupes:
            print('  D%d' % num)
            print('    line %d: %s' % (first[0], first[1]))
            print('    line %d: %s' % (second[0], second[1]))
        print('\nRenumber the later one. Next free ID is D%d.' % nxt)
        return 1

    print('  no duplicates')
    print('  next free ID: D%d' % nxt)
    return 0


if __name__ == '__main__':
    sys.exit(main())
