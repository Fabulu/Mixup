"""ALIGNED INSTRUCTION-BOUNDARY SWEEP -- the tool three W371 spec errors asked for.

Every address-reading tool in this repo walks 2-byte boundaries and cannot tell an
opcode from the middle of an instruction. That limitation produced, in one session:

  * `$4C`'s subroutine inventory listing $26F702, which is the DISPLACEMENT WORD of
    the bsr.w at $26F700 -- and W367's test "verified" it, because the test's scan
    had the same flaw as the data's
  * the missing FIFTH draw call at $26F704, read as a branch label only
  * a `handlerEnd` set to $26FFE8, the START of the last subroutine

This sweeps FORWARD from a known-good entry point, decoding each instruction's real
length, and reports the boundary set. It is the same technique `rosetta.py dasm`
lacks, which is why that tool has misaligned seven times.

**IT REFUSES RATHER THAN GUESSES.** An opcode it does not know STOPS the sweep and is
reported by address. Boundaries found before that point are trustworthy; nothing is
invented past it. A decoder that silently resynchronises would recreate the exact
failure it exists to prevent.

It also does NOT follow branches. A linear sweep through a data table decodes garbage,
so `sweep` is only valid over a span you already believe is code. `check` is the safe
entry point: it answers "is this address an instruction boundary, reached from that
start", which is the question the three errors above all needed.

    python tools/aligned.py sweep 0x26f5f2 0x26f718
    python tools/aligned.py check 0x26f5f2 0x26f718 0x26f702 0x26f704 0x26ffe8
"""
import io
import sys

ROM = 'rip/sound/maincpu.bin'


def _ea_len(mode, reg, size):
    """Extension bytes for one effective address. `size` is 1, 2 or 4."""
    if mode in (0, 1, 2, 3, 4):
        return 0
    if mode == 5:                      # (d16,An)
        return 2
    if mode == 6:                      # (d8,An,Xn) -- 68000 brief format only
        return 2
    if mode == 7:
        if reg == 0:                   # abs.w
            return 2
        if reg == 1:                   # abs.l
            return 4
        if reg == 2:                   # (d16,PC)
            return 2
        if reg == 3:                   # (d8,PC,Xn)
            return 2
        if reg == 4:                   # immediate
            return 4 if size == 4 else 2
    return None                        # unknown -- caller stops


_SIZES = {0: 1, 1: 2, 2: 4}


def insn_len(d, a):
    """Length in bytes of the instruction at `a`, or None if not decodable."""
    w = int.from_bytes(d[a:a + 2], 'big')
    top = w >> 12
    mode, reg = (w >> 3) & 7, w & 7

    if top == 0:
        if w in (0x003C, 0x007C, 0x023C, 0x027C, 0x0A3C, 0x0A7C):
            return 4                   # ORI/ANDI/EORI to CCR or SR
        if (w & 0x0138) == 0x0108:
            return 4                   # MOVEP
        if (w & 0x0F00) == 0x0800:     # static bit op: BTST/BCHG/BCLR/BSET #n
            e = _ea_len(mode, reg, 1)
            return None if e is None else 4 + e
        if (w & 0x01C0) == 0x0100 or (w & 0x0100) and (w & 0x00C0) != 0x00C0:
            e = _ea_len(mode, reg, 1)  # dynamic bit op, Dn source
            return None if e is None else 2 + e
        size = _SIZES.get((w >> 6) & 3)
        if size is None:
            return None
        e = _ea_len(mode, reg, size)   # ORI/ANDI/SUBI/ADDI/EORI/CMPI
        if e is None:
            return None
        return 2 + (4 if size == 4 else 2) + e

    if top in (1, 2, 3):               # MOVE.b / MOVE.l / MOVE.w
        size = {1: 1, 2: 4, 3: 2}[top]
        src = _ea_len(mode, reg, size)
        dmode, dreg = (w >> 6) & 7, (w >> 9) & 7
        dst = _ea_len(dmode, dreg, size)
        if src is None or dst is None:
            return None
        return 2 + src + dst

    if top == 4:
        if w in (0x4E70, 0x4E71, 0x4E72, 0x4E73, 0x4E75, 0x4E76, 0x4E77):
            return 4 if w == 0x4E72 else 2      # STOP takes a word
        if (w & 0xFFF0) == 0x4E40:
            return 2                            # TRAP
        if (w & 0xFFF8) == 0x4E50:
            return 4                            # LINK
        if (w & 0xFFF8) == 0x4E58:
            return 2                            # UNLK
        if (w & 0xFFF8) in (0x4E60, 0x4E68):
            return 2                            # MOVE USP
        if (w & 0xFFC0) in (0x4E80, 0x4EC0):    # JSR / JMP
            e = _ea_len(mode, reg, 4)
            return None if e is None else 2 + e
        if (w & 0xFB80) == 0x4880:              # MOVEM
            e = _ea_len(mode, reg, 4)
            return None if e is None else 4 + e
        if (w & 0xF1C0) == 0x41C0:              # LEA
            e = _ea_len(mode, reg, 4)
            return None if e is None else 2 + e
        if (w & 0xF1C0) == 0x4180:              # CHK
            e = _ea_len(mode, reg, 2)
            return None if e is None else 2 + e
        if (w & 0xFFC0) == 0x4840:              # PEA
            e = _ea_len(mode, reg, 4)
            return None if e is None else 2 + e
        if (w & 0xFFF8) == 0x4840:
            return 2                            # SWAP
        if (w & 0xFEB8) == 0x4880:
            return 2                            # EXT
        if (w & 0xFF00) in (0x4000, 0x4200, 0x4400, 0x4600, 0x4A00):
            size = _SIZES.get((w >> 6) & 3)     # NEGX/CLR/NEG/NOT/TST
            if size is None:
                return None
            e = _ea_len(mode, reg, size)
            return None if e is None else 2 + e
        if (w & 0xFFC0) in (0x40C0, 0x44C0, 0x46C0):
            e = _ea_len(mode, reg, 2)           # MOVE from/to SR/CCR
            return None if e is None else 2 + e
        if (w & 0xFFC0) == 0x4AC0:
            e = _ea_len(mode, reg, 1)           # TAS
            return None if e is None else 2 + e
        return None

    if top == 5:
        if (w & 0x00F8) == 0x00C8:
            return 4                            # DBcc
        if (w & 0x00C0) == 0x00C0:              # Scc
            e = _ea_len(mode, reg, 1)
            return None if e is None else 2 + e
        size = _SIZES.get((w >> 6) & 3)         # ADDQ / SUBQ
        if size is None:
            return None
        e = _ea_len(mode, reg, size)
        return None if e is None else 2 + e

    if top == 6:                                # Bcc / BRA / BSR
        disp = w & 0xFF
        if disp == 0:
            return 4                            # word form
        if disp == 0xFF:
            return 6                            # long form (68020+, listed for safety)
        return 2                                # short form

    if top == 7:
        return 2 if (w & 0x0100) == 0 else None  # MOVEQ

    if top in (8, 9, 0xB, 0xC, 0xD):
        op = (w >> 6) & 7
        if top == 0xB and op in (4, 5, 6) and mode == 1:
            return 2                            # CMPM
        if top in (9, 0xD) and op in (4, 5, 6) and mode in (0, 1):
            return 2                            # SUBX / ADDX
        if top in (8, 0xC) and op in (4, 5) and mode in (0, 1) and (w & 0x0130) == 0x0100:
            return 2                            # SBCD / ABCD
        if top == 0xC and op in (5, 6) and mode in (0, 1):
            return 2                            # EXG
        size = 4 if op in (3, 7) else _SIZES.get(op & 3)
        if size is None:
            return None
        e = _ea_len(mode, reg, size)
        return None if e is None else 2 + e

    if top == 0xE:                              # shifts and rotates
        if (w & 0x00C0) == 0x00C0:              # memory form, one EA
            e = _ea_len(mode, reg, 2)
            return None if e is None else 2 + e
        return 2
    return None


def sweep(d, start, end):
    """Boundaries from `start` up to `end`. Returns (list, stopped_at_or_None)."""
    out, a = [], start
    while a < end:
        n = insn_len(d, a)
        if n is None or n <= 0:
            return out, a
        out.append(a)
        a += n
    return out, None


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    d = io.open(ROM, 'rb').read()
    start, end = int(sys.argv[2], 0), int(sys.argv[3], 0)
    bounds, stopped = sweep(d, start, end)

    print('ALIGNED SWEEP $%06X..$%06X -- %d instructions' % (start, end, len(bounds)))
    if stopped is not None:
        print('  STOPPED at $%06X: opcode %04X is not in the decoder. Nothing past this '
              'point was decoded, and none of it is guessed.'
              % (stopped, int.from_bytes(d[stopped:stopped + 2], 'big')))

    if cmd == 'sweep':
        for a in bounds:
            n = insn_len(d, a)
            print('  $%06X  %s' % (a, ' '.join('%02x' % x for x in d[a:a + n])))
    elif cmd == 'check':
        s = set(bounds)
        print()
        for arg in sys.argv[4:]:
            a = int(arg, 0)
            if a in s:
                verdict = 'BOUNDARY'
            elif stopped is not None and a >= stopped:
                verdict = 'UNKNOWN -- sweep stopped before reaching it'
            elif start <= a < end:
                verdict = 'MID-INSTRUCTION -- not an entry point'
            else:
                verdict = 'OUTSIDE the swept span'
            print('  $%06X  %s' % (a, verdict))
    else:
        print('unknown command %r' % cmd)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
