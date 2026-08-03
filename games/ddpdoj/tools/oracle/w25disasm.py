#!/usr/bin/env python3
"""W25 recon: capstone disassembly of the six enemy handlers from maincpu.bin."""
import sys
from pathlib import Path
from capstone import Cs, CS_ARCH_M68K, CS_MODE_M68K_030

IMG = Path(__file__).resolve().parent / "out" / "maincpu.bin"
D = IMG.read_bytes()
BASE = 0  # maincpu.bin is loaded at 0; ROM addresses map directly

md = Cs(CS_ARCH_M68K, CS_MODE_M68K_030)
md.detail = False

KNOWN = {
    0x2638A6: "stepMovement(interp)", 0x263762: "freeEnemy",
    0x2417DE: "applyVelocity", 0x24179E: "scrollComp",
    0x24200A: "aim00A", 0x24202C: "aim02C", 0x24203E: "aim03E(aim64)",
    0x2422A2: "aim2A2(aim256)", 0x242190: "slew190",
    0x286096: "DAMAGE(W28)", 0x28615E: "fire-gen(W21)",
    0x289004: "fire-gen?(W21)", 0x281402: "gen-281402(W21)",
    0x289AF4: "fire?(W21/W27)", 0x28C25A: "death?(W27/W28)",
    0x28C274: "death?(W27/W28)", 0x28C2A8: "death?(W27/W28)",
    0x281708: "gen-281708(W21)", 0x281764: "gen-281764(W21)",
    0x281484: "gen-281484(W21)", 0x2814AC: "gen-2814AC(W21)",
    0x28AC72: "fire?(W27)", 0x281708: "gen(W21)",
    0x242684: "fireGate?", 0x2425B2: "aim5B2?", 0x242178: "aim178?",
    0x267FC6: "267FC6?", 0x27F8EE: "27F8EE?",
    0x23D852: "snd?", 0x23DBCA: "snd?", 0x23DF86: "snd?", 0x23DF58: "snd?",
}

def disasm(start, end):
    off = start - BASE
    code = D[off:end+4]
    for i in md.disasm(code, start):
        annot = ""
        mn = i.mnemonic
        ops = i.op_str
        # call/jsr target
        if mn in ("jsr", "bsr", "jmp", "bra") and ops.startswith("$"):
            try:
                t = int(ops.split(",")[0].replace(".l",""), 16)
                if t in KNOWN:
                    annot = "  ; " + KNOWN[t]
            except: pass
        print(f"  {i.address:06X}: {i.bytes.hex():20s} {mn:8s} {ops}{annot}")
        if i.address >= end:
            break

if __name__ == "__main__":
    lo = int(sys.argv[1], 16) if len(sys.argv) > 1 else 0x268844
    hi = int(sys.argv[2], 16) if len(sys.argv) > 2 else 0x268B1E
    disasm(lo, hi)
