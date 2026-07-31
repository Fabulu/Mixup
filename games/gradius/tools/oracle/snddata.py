#!/usr/bin/env python3
"""snddata.py -- decode the Gradius sound tables and sequence streams.

RECON ONLY.  Output is ROM-derived; it goes to out/ which is gitignored, and
nothing here ships.

Everything below is a decode of the format read off the $ED02 driver's own code
(games/gradius/tools/dis6502.py trace ED02).  The point of this file is that the
decode is CHECKABLE: --selfcheck computes, purely from the data, how many frames
the stage-1 BGM's pulse-1 part occupies its channel, and that number is compared
against a number MEASURED on the running cartridge by soundprobe.py.  The two
derivations are independent (docs/knowledge/03).

  python games/gradius/tools/oracle/snddata.py --table
  python games/gradius/tools/oracle/snddata.py --stream 13
  python games/gradius/tools/oracle/snddata.py --selfcheck
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[4]
ROM = REPO / "Gradius (USA).nes"

SND_TABLE = 0xEFCD      # 3-byte records: apuOffset, ptrLo, ptrHi
PITCH_TABLE = 0xEFB8    # 12 big-endian 11-bit periods, C..B
CH_BASE = [0xB0, 0xC1, 0xD2, 0xE3]   # read out of the ROM table at $ECB2
CH_NAME = ["pulse1", "pulse2", "triangle", "noise"]
NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


def load() -> bytes:
    if not ROM.exists():
        raise SystemExit(f"ROM not found: {ROM} (supply your own; it is gitignored)")
    d = ROM.read_bytes()
    return d[16:16 + 32768]


def rd(prg: bytes, addr: int, n: int = 1) -> bytes:
    return prg[addr - 0x8000: addr - 0x8000 + n]


def record(prg: bytes, index: int):
    b = rd(prg, SND_TABLE + 3 * index, 3)
    return b[0], b[1] | (b[2] << 8)


def dialect(prg: bytes, ptr: int) -> str:
    """$EC72-$EC7F.  If stream[0] == 0 the request forces $DF (the priority) to
    0, so $02,X stays 0 and the driver never ticks the channel at all -- the
    stream is a STOP marker and its bytes are never parsed ($F08F is literally
    two bytes into the middle of the $3B pause jingle).  Otherwise $09,X is 0
    iff stream[0]'s high nibble is $2, and that flag picks the parser at $EDBE
    (raw period) over the one at $EE82 (note + octave)."""
    b = rd(prg, ptr)[0]
    if b == 0:
        return "STOP (never ticked)"
    return "A/raw-period" if (b & 0xF0) == 0x20 else "B/note"


def decode(prg: bytes, ptr: int, limit: int = 4000, triangle: bool = False):
    """Walk one channel stream.  Returns (events, ticks, end) where ticks is the
    number of driver ticks (== non-dropped NMIs) the stream occupies, counting a
    $FE loop the number of times it actually repeats, and stopping at the $FF
    that ends the stream (not at a $FF that returns from an $FD sub-phrase)."""
    out, ticks = [], 0
    base, octv, length = 0, 0, 0
    p, insub, retaddr, loopc = ptr, False, 0, 0
    dia = dialect(prg, ptr)
    steps = 0
    while steps < limit:
        steps += 1
        b = rd(prg, p)[0]
        if b == 0xFF:
            if insub:
                out.append((p, "FF", "return from sub"))
                p, insub = retaddr, False
                continue
            out.append((p, "FF", "END of stream -> channel freed ($ECB6)"))
            break
        if b == 0xFD:
            tgt = rd(prg, p + 1)[0] | (rd(prg, p + 2)[0] << 8)
            out.append((p, "FD %04X" % tgt, "call sub-phrase"))
            retaddr, insub, p = p + 3, True, tgt
            continue
        if b == 0xFE:
            cnt = rd(prg, p + 1)[0]
            tgt = rd(prg, p + 2)[0] | (rd(prg, p + 3)[0] << 8)
            loopc += 1
            out.append((p, "FE %d %04X" % (cnt, tgt), "loop pass %d/%d" % (loopc, cnt)))
            if loopc == cnt:
                loopc = 0
                p += 4
            else:
                p = tgt
            continue
        if dia.startswith("A"):
            # $EDBE: optional $2n vv (length,volume), $11 vv (detune),
            # $10 vv (sweep), $F8 vv (volume), then a 2-byte raw 11-bit period.
            desc = []
            if (b & 0xF0) == 0x20:
                length = b & 0x0F
                desc.append("len=%d vol=$%02X" % (length, rd(prg, p + 1)[0]))
                p += 2
            while True:
                c = rd(prg, p)[0]
                if c == 0x11:
                    desc.append("detune=$%02X" % rd(prg, p + 1)[0]); p += 2
                elif c == 0x10:
                    desc.append("sweep=$%02X" % rd(prg, p + 1)[0]); p += 2
                elif c == 0xF8:
                    desc.append("vol=$%02X" % rd(prg, p + 1)[0]); p += 2
                else:
                    break
            hi, lo = rd(prg, p)[0], rd(prg, p + 1)[0]
            per = ((hi & 0x07) << 8) | lo
            out.append((p, "%02X %02X" % (hi, lo),
                        "period=%d  %s  %d ticks" % (per, " ".join(desc), length)))
            ticks += length
            p += 2
            continue
        # dialect B: $Dn vv [ab] then optional $En then a note byte
        desc = []
        if (b & 0xF0) == 0xD0:
            base = b & 0x0F
            desc.append("base=%d vol=$%02X" % (base, rd(prg, p + 1)[0]))
            p += 2
            # $EE9D: the triangle channel jumps straight back to the dispatcher,
            # so its $Dn command is TWO bytes -- there is no decay pair.
            if not triangle:
                desc.append("decay=$%02X" % rd(prg, p)[0]); p += 1
            b = rd(prg, p)[0]
        if (b & 0xF0) == 0xE0:
            octv = b & 0x0F
            desc.append("oct=%d" % octv)
            p += 1
            b = rd(prg, p)[0]
        note, exp = b >> 4, b & 0x0F
        dur = base * (exp + 1)          # $EECE-$EED5: base added (exp) more times
        name = "REST" if note == 0x0C else NOTE[note] if note < 12 else "?%X" % note
        out.append((p, "%02X" % b, "%-4s dur=%d  %s" % (name, dur, " ".join(desc))))
        ticks += dur
        p += 1
    return out, ticks


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--table", action="store_true")
    ap.add_argument("--stream", type=lambda s: int(s, 16))
    ap.add_argument("--selfcheck", action="store_true")
    a = ap.parse_args()
    prg = load()

    if a.table:
        print("pitch table $EFB8 (big-endian 11-bit periods, one octave):")
        for i in range(12):
            b = rd(prg, PITCH_TABLE + 2 * i, 2)
            print("  %-3s $%02X%02X = %4d" % (NOTE[i], b[0], b[1], (b[0] << 8) | b[1]))
        print("\nsound table $EFCD, 3 bytes per index (apuOff, ptr):")
        for i in range(1, 0x40):
            off, ptr = record(prg, i)
            ch = off // 4
            print("  $%02X  %-8s $%04X  %s" % (i, CH_NAME[ch] if ch < 4 else "??%d" % ch,
                                               ptr, dialect(prg, ptr)))

    if a.stream is not None:
        off, ptr = record(prg, a.stream)
        print("index $%02X  ch=%s  ptr=$%04X  dialect=%s"
              % (a.stream, CH_NAME[off // 4], ptr, dialect(prg, ptr)))
        ev, ticks = decode(prg, ptr, triangle=(off // 4 == 2))
        for addr, raw, desc in ev:
            print("  $%04X  %-10s %s" % (addr, raw, desc))
        print("  total ticks = %d" % ticks)

    if a.selfcheck:
        # Independent derivation: stage-1 BGM pulse-1 part = index $13.
        # MEASURED on the cartridge (soundprobe.py --tag base): $B2 held $13 from
        # game frame 310 to 822 inclusive and read 0 at 823, i.e. 513 frames of
        # ownership, of which 1 is the request frame ($EC63 sets $00,X = 1, so
        # the first command is parsed on the NEXT driver call).
        off, ptr = record(prg, 0x13)
        _, ticks = decode(prg, ptr)
        want = 512
        ok = ticks == want
        print("index $13 ($%04X, %s) decodes to %d ticks; measured ownership was "
              "513 frames = 1 setup + %d ticks" % (ptr, CH_NAME[off // 4], ticks, want))
        print(("[PASS]" if ok else "[FAIL]") + " decoded tick count matches the "
              "measured channel-ownership window")
        return 0 if ok else 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
