#!/usr/bin/env python3
"""trace.py with a --difficulty flag.

$C756 is written once, by the options screen ($01D1), and level init READS it
at $0D79 / $0E01 -- so it has to be in place before the level loads, not after
gameplay starts. This wraps trace.boot_to_gameplay and stamps $C756 at
loc_00_04BB, the same instant trace.py injects $FFB0.

  python tools/oracle/difftrace.py --level 8 --frames 600 --difficulty 2
"""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('tracemod', os.path.join(HERE, 'trace.py'))
tracemod = importlib.util.module_from_spec(spec)
sys.modules['tracemod'] = tracemod
spec.loader.exec_module(tracemod)

DIFFICULTY = 0xC756
# NOT $04BB: trace.py already owns that address and PyBoy refuses a second
# hook on the same one. sub_00_0D50 is the level-init routine that CONTAINS
# the $0D79/$0E01 reads, so its entry is the last safe moment.
LEVEL_INIT = 0x0D50


def main():
    diff = None
    argv = []
    it = iter(sys.argv[1:])
    for a in it:
        if a == '--difficulty':
            diff = int(next(it))
        else:
            argv.append(a)
    sys.argv = [sys.argv[0]] + argv

    if diff is not None:
        original = tracemod.boot_to_gameplay

        def patched(pyboy, max_frames=2000, level=1):
            pyboy.hook_register(
                0, LEVEL_INIT,
                lambda _: pyboy.memory.__setitem__(DIFFICULTY, diff), None)
            return original(pyboy, max_frames=max_frames, level=level)

        tracemod.boot_to_gameplay = patched

    tracemod.main()


if __name__ == '__main__':
    main()
