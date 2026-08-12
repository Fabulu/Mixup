#!/usr/bin/env python3
"""spanned.py -- which bytes of an address range has NOTHING in the repo cited?

claimed.py answers "who already ports this address?" for one address you thought to ask about.
This answers the question you did not think to ask: given a span, which parts of it does no
source file and no doc mention AT ALL?

It exists because across W345..W351 I declared type $55 finished or nearly finished four times
-- "one focused pass from written", "ready to write", "zero unknowns", each retracted -- and
every gap was a range I had never disassembled but believed I had. The recon was accurate; my
assessment of COVERAGE was not, and it did not improve with more waves. So coverage stops being
a judgment call.

    python tools/spanned.py 0x272424 0x2724e0          one span
    python tools/spanned.py 0x272424 0x272750 --stride 2

Exit 1 if any byte in the span is uncited, so it can gate a "this type is done" claim.

It reports RANGES, not instructions -- it does not disassemble, because a disassembler that
mis-aligns (as rosetta.py does at $272722, silently dropping four bytes) would hide exactly the
gap this is meant to expose. Byte addresses at a fixed stride is a dumber check that cannot lie
in that particular way.

*** CALIBRATION FAILED. READ THIS BEFORE TRUSTING ANY OUTPUT. ***

The premise was that citation density measures how thoroughly a span has been read. It does not.
Measured against two spans of type $55 whose true status I knew:

    $272424..$2724E0   the prologue I had NEVER disassembled     29.8% cited
    $2725C0..$272650   the fire arm I read instruction by line   33.3% cited

Four points of difference. Indistinguishable. And no uncited run in EITHER span reaches 16 bytes,
so the --min filter reports "clean" for both. The reason is structural: prose cites an address
roughly every fourth byte when discussing a span at all, and a handler's addresses get cited by
neighbouring discussion, by window declarations, and by unrelated notes about the same region.
Density measures how much has been WRITTEN NEAR a span, not how much has been READ of it.

So this tool CANNOT certify coverage, and its exit code must not be read as doing so. What it is
still good for is the opposite direction: a LONG uncited run (raise --min to 32 or 64) is decent
evidence nobody has been in that region at all. Absence of runs proves nothing.

The honest conclusion from building it: "have I read this span?" is not answerable from repo text.
It needs a record of what was actually disassembled -- a read log written at read time -- which is
a different tool and a bigger change than this one.
"""

import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.dirname(HERE)
REPO = os.path.dirname(os.path.dirname(GAME))

# Where a citation can live. Deliberately NOT the whole repo: rip/ and assets/ are generated, and
# a generated file "mentioning" an address is not evidence a human read it.
ROOTS = [
    os.path.join(GAME, 'src'),
    os.path.join(GAME, 'tests'),
    os.path.join(GAME, 'tools'),
    os.path.join(REPO, 'docs'),
]
SKIP_DIRS = {'node_modules', '.git', 'rip', 'assets', 'dist', '__pycache__', '.scratch'}
KEEP_EXT = {'.js', '.mjs', '.py', '.md', '.json', '.txt'}

# The four forms an address is written in this project, matched case-insensitively:
#   $260A88   $00260A88   0x260a88   260A88
ADDR = re.compile(r'(?:\$|0x)?((?:00)?[0-9a-fA-F]{6})\b')


def cited_addresses():
    """Every 6-hex-digit value mentioned anywhere a human writes in this repo."""
    seen = set()
    for root in ROOTS:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
            for name in filenames:
                if os.path.splitext(name)[1].lower() not in KEEP_EXT:
                    continue
                path = os.path.join(dirpath, name)
                try:
                    with open(path, 'r', encoding='utf-8', errors='replace') as fh:
                        text = fh.read()
                except OSError:
                    continue
                for m in ADDR.finditer(text):
                    seen.add(int(m.group(1), 16))
    return seen


def runs(missing, stride):
    """Collapse a sorted list of probe addresses into (lo, hi_inclusive) runs.

    Merging on `prev + 1` instead of `prev + stride` reports every probe as its own run, which is
    how the first version of this tool printed 40 one-word "ranges" for a single unread span --
    technically correct and completely unreadable.
    """
    out = []
    for a in missing:
        if out and a == out[-1][1] + stride:
            out[-1][1] = a
        else:
            out.append([a, a])
    return [(lo, hi) for lo, hi in out]


def main(argv):
    if len(argv) < 3:
        print(__doc__)
        return 2
    lo = int(argv[1], 16)
    hi = int(argv[2], 16)
    stride = 2
    if '--stride' in argv:
        stride = int(argv[argv.index('--stride') + 1])
    # CALIBRATION, and the difference between a useful tool and a noisy one. Docs cite INSTRUCTION
    # START addresses, so a stride-2 probe necessarily lands on extension words that will never be
    # cited no matter how carefully a span was read. 100%% is therefore unreachable and short gaps are
    # noise. What means "nobody has been here" is a LONG uncited run. Default 16 bytes: longer than any
    # single 68k instruction, so a run that long cannot be explained by extension words.
    min_run = 16
    if '--min' in argv:
        min_run = int(argv[argv.index('--min') + 1])
    if hi <= lo:
        print('the high bound must be above the low bound', file=sys.stderr)
        return 2

    cited = cited_addresses()
    probed = list(range(lo, hi, stride))
    missing = [a for a in probed if a not in cited]

    span = hi - lo
    covered = len(probed) - len(missing)
    pct = 100.0 * covered / len(probed) if probed else 100.0
    print('span $%06X..$%06X  (%d bytes, %d probes at stride %d)' % (lo, hi, span, len(probed), stride))
    print('cited: %d of %d probes (%.1f%%)' % (covered, len(probed), pct))

    if not missing:
        print('NO UNCITED BYTES -- every probed address is mentioned somewhere a human writes.')
        return 0

    long_runs = [(a, b) for a, b in runs(missing, stride) if b + stride - a >= min_run]
    if not long_runs:
        print('no uncited run reaches %d bytes.' % min_run)
        print('THIS IS NOT EVIDENCE THE SPAN WAS READ -- see the CALIBRATION FAILED note at the top.')
        return 0

    print()
    print('UNCITED RUNS of %d+ bytes -- nothing in src/, tests/, tools/ or docs/ mentions these:' % min_run)
    for rlo, rhi in long_runs:
        print('  $%06X..$%06X   %#x bytes' % (rlo, rhi + stride - 1, rhi + stride - rlo))
    print()
    print('A run this long cannot be extension words. A claim that this span is fully read is not')
    print('credible while one exists. Read it, or cite why it does not need reading.')
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv))
