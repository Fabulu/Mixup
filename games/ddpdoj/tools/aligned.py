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
        if w & 0x0100:
            # Dynamic bit op with a Dn source: BTST/BCHG/BCLR/BSET, selected by bits 7-6 as
            # 00/01/10/11. The first draft excluded type 11 (BSET) and the sweep stopped on a real
            # `bset D0,-(A0)` at $26FCD4 -- which is the refusal design working, so the fix is here
            # rather than a looser fallback. MOVEP is matched above and must stay above.
            e = _ea_len(mode, reg, 1)
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
        # W377. opmode 3 is the WORD address form (ADDA.W / SUBA.W / CMPA.W) and opmode 7 is
        # the LONG one. This read `4 if op in (3, 7)` and so gave ADDA.W a four-byte immediate:
        # `d0fc 0020` (adda.w #$20,A0, FOUR bytes) was reported as six and swallowed the
        # following `5341` (subq.w #1,D1). At $25AFEC the two readings happen to re-converge, so
        # the sweep self-corrected and the error only showed as a bogus MID-INSTRUCTION verdict
        # for $25AFF2 -- but a LONE `adda.w #imm,An` misaligns everything after it, silently.
        size = 4 if op == 7 else (2 if op == 3 else _SIZES.get(op & 3))
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


def _is_flow_break(w):
    """True for instructions after which execution does not fall through."""
    if w in (0x4E75, 0x4E73, 0x4E77):          # RTS / RTE / RTR
        return True
    if (w & 0xFFC0) == 0x4EC0:                 # JMP
        return True
    if (w & 0xFF00) == 0x6000 and (w & 0x00FF) != 0x0001:   # BRA (any form)
        return True
    return False


def sweep(d, start, end):
    """Boundaries from `start` up to `end`.

    Returns (boundaries, stopped_at, stop_reason). STOPS at an unconditional flow
    break -- RTS, RTE, RTR, JMP, BRA -- because the bytes after one are only code if
    something branches to them, and a sweep that runs through a break decodes padding
    and silently desynchronises.

    W371 found this the hard way: sweeping across the `rts` at $26F982 and the eight
    padding bytes after it made the sweep report $26F98C as MID-INSTRUCTION, when
    $26F98C is a genuine `bsr.w` target from $26F97A. A false MID-INSTRUCTION verdict
    is worse than no verdict, because it reads as proof of the very error this tool
    was built to find.
    """
    out, a = [], start
    while a < end:
        n = insn_len(d, a)
        if n is None or n <= 0:
            return out, a, 'opcode %04X is not in the decoder' % int.from_bytes(d[a:a + 2], 'big')
        out.append(a)
        if _is_flow_break(d and int.from_bytes(d[a:a + 2], 'big')):
            nxt = a + n
            if nxt < end:
                return out, nxt, ('flow break at $%06X -- resume from a known entry point, because '
                                  'what follows is code only if something branches to it' % a)
        a += n
    return out, None, None


def main():
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    cmd = sys.argv[1]
    d = io.open(ROM, 'rb').read()
    start, end = int(sys.argv[2], 0), int(sys.argv[3], 0)
    bounds, stopped, why = sweep(d, start, end)

    print('ALIGNED SWEEP $%06X..$%06X -- %d instructions' % (start, end, len(bounds)))
    if stopped is not None:
        print('  STOPPED at $%06X: %s. Nothing past this point was decoded, and none of '
              'it is guessed.' % (stopped, why))

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
                verdict = 'UNVERIFIED -- the sweep stopped before reaching it'
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
