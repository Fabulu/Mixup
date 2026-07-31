#!/usr/bin/env python3
"""reach.py -- 6502 call-graph reachability over the Gradius PRG.

Answers "can routine R ever read address Z?" without running the game, by
walking the actual opcode bytes of the PRG image from an entry point, following
every branch, JMP and JSR (and every entry of the inline jump tables this game
builds after `JSR $83E4`), and reporting each instruction whose operand is Z.

Written for one question: does the ENEMY SPAWN engine ($A2C0, called from
$9A64) ever read the rank byte $17?  A grep over an address RANGE cannot answer
that -- a spawn routine may JSR out of its range.  This walks the graph.

  python reach.py --entry A2C0 --find 17
  python reach.py --entry A2C0 --find 17 --exclude EC1E,8402,840C,83E4

Honest limits, stated up front:
  * indirect jumps (JMP ($xxxx), and any dispatch this tool does not model) are
    reported as UNRESOLVED and listed -- they are holes in the proof, not
    silently ignored;
  * `JSR $83E4` is modelled specially: this cartridge's indexed-jump helper
    reads a word table inline at the return address.  Every entry is followed
    and the table itself is not walked as code;
  * the ROM is read from the cartridge the caller supplies.  Nothing is
    committed.
"""
from __future__ import annotations
import argparse, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from mesen import DEFAULT_ROM   # noqa: E402

# opcode -> (mnemonic, length, mode)
IMP, IMM, ZP, ZPX, ZPY, ABS, ABX, ABY, IND, IZX, IZY, REL, ACC = range(13)
LEN = {IMP: 1, ACC: 1, IMM: 2, ZP: 2, ZPX: 2, ZPY: 2, IZX: 2, IZY: 2, REL: 2,
       ABS: 3, ABX: 3, ABY: 3, IND: 3}

T = {}
def _d(op, mn, mode): T[op] = (mn, mode)

for op, mn, mode in [
    (0x00,"BRK",IMP),(0x01,"ORA",IZX),(0x05,"ORA",ZP),(0x06,"ASL",ZP),
    (0x08,"PHP",IMP),(0x09,"ORA",IMM),(0x0A,"ASL",ACC),(0x0D,"ORA",ABS),
    (0x0E,"ASL",ABS),(0x10,"BPL",REL),(0x11,"ORA",IZY),(0x15,"ORA",ZPX),
    (0x16,"ASL",ZPX),(0x18,"CLC",IMP),(0x19,"ORA",ABY),(0x1D,"ORA",ABX),
    (0x1E,"ASL",ABX),(0x20,"JSR",ABS),(0x21,"AND",IZX),(0x24,"BIT",ZP),
    (0x25,"AND",ZP),(0x26,"ROL",ZP),(0x28,"PLP",IMP),(0x29,"AND",IMM),
    (0x2A,"ROL",ACC),(0x2C,"BIT",ABS),(0x2D,"AND",ABS),(0x2E,"ROL",ABS),
    (0x30,"BMI",REL),(0x31,"AND",IZY),(0x35,"AND",ZPX),(0x36,"ROL",ZPX),
    (0x38,"SEC",IMP),(0x39,"AND",ABY),(0x3D,"AND",ABX),(0x3E,"ROL",ABX),
    (0x40,"RTI",IMP),(0x41,"EOR",IZX),(0x45,"EOR",ZP),(0x46,"LSR",ZP),
    (0x48,"PHA",IMP),(0x49,"EOR",IMM),(0x4A,"LSR",ACC),(0x4C,"JMP",ABS),
    (0x4D,"EOR",ABS),(0x4E,"LSR",ABS),(0x50,"BVC",REL),(0x51,"EOR",IZY),
    (0x55,"EOR",ZPX),(0x56,"LSR",ZPX),(0x58,"CLI",IMP),(0x59,"EOR",ABY),
    (0x5D,"EOR",ABX),(0x5E,"LSR",ABX),(0x60,"RTS",IMP),(0x61,"ADC",IZX),
    (0x65,"ADC",ZP),(0x66,"ROR",ZP),(0x68,"PLA",IMP),(0x69,"ADC",IMM),
    (0x6A,"ROR",ACC),(0x6C,"JMP",IND),(0x6D,"ADC",ABS),(0x6E,"ROR",ABS),
    (0x70,"BVS",REL),(0x71,"ADC",IZY),(0x75,"ADC",ZPX),(0x76,"ROR",ZPX),
    (0x78,"SEI",IMP),(0x79,"ADC",ABY),(0x7D,"ADC",ABX),(0x7E,"ROR",ABX),
    (0x81,"STA",IZX),(0x84,"STY",ZP),(0x85,"STA",ZP),(0x86,"STX",ZP),
    (0x88,"DEY",IMP),(0x8A,"TXA",IMP),(0x8C,"STY",ABS),(0x8D,"STA",ABS),
    (0x8E,"STX",ABS),(0x90,"BCC",REL),(0x91,"STA",IZY),(0x94,"STY",ZPX),
    (0x95,"STA",ZPX),(0x96,"STX",ZPY),(0x98,"TYA",IMP),(0x99,"STA",ABY),
    (0x9A,"TXS",IMP),(0x9D,"STA",ABX),(0xA0,"LDY",IMM),(0xA1,"LDA",IZX),
    (0xA2,"LDX",IMM),(0xA4,"LDY",ZP),(0xA5,"LDA",ZP),(0xA6,"LDX",ZP),
    (0xA8,"TAY",IMP),(0xA9,"LDA",IMM),(0xAA,"TAX",IMP),(0xAC,"LDY",ABS),
    (0xAD,"LDA",ABS),(0xAE,"LDX",ABS),(0xB0,"BCS",REL),(0xB1,"LDA",IZY),
    (0xB4,"LDY",ZPX),(0xB5,"LDA",ZPX),(0xB6,"LDX",ZPY),(0xB8,"CLV",IMP),
    (0xB9,"LDA",ABY),(0xBA,"TSX",IMP),(0xBC,"LDY",ABX),(0xBD,"LDA",ABX),
    (0xBE,"LDX",ABY),(0xC0,"CPY",IMM),(0xC1,"CMP",IZX),(0xC4,"CPY",ZP),
    (0xC5,"CMP",ZP),(0xC6,"DEC",ZP),(0xC8,"INY",IMP),(0xC9,"CMP",IMM),
    (0xCA,"DEX",IMP),(0xCC,"CPY",ABS),(0xCD,"CMP",ABS),(0xCE,"DEC",ABS),
    (0xD0,"BNE",REL),(0xD1,"CMP",IZY),(0xD5,"CMP",ZPX),(0xD6,"DEC",ZPX),
    (0xD8,"CLD",IMP),(0xD9,"CMP",ABY),(0xDD,"CMP",ABX),(0xDE,"DEC",ABX),
    (0xE0,"CPX",IMM),(0xE1,"SBC",IZX),(0xE4,"CPX",ZP),(0xE5,"SBC",ZP),
    (0xE6,"INC",ZP),(0xE8,"INX",IMP),(0xE9,"SBC",IMM),(0xEA,"NOP",IMP),
    (0xEC,"CPX",ABS),(0xED,"SBC",ABS),(0xEE,"INC",ABS),(0xF0,"BEQ",REL),
    (0xF1,"SBC",IZY),(0xF5,"SBC",ZPX),(0xF6,"INC",ZPX),(0xF8,"SED",IMP),
    (0xF9,"SBC",ABY),(0xFD,"SBC",ABX),(0xFE,"INC",ABX),
]:
    _d(op, mn, mode)

BRANCH = {"BPL","BMI","BVC","BVS","BCC","BCS","BNE","BEQ"}
STOP   = {"RTS","RTI","JMP","BRK"}
# $83E4 is this cartridge's indexed-jump helper: A = index, the word table is
# INLINE at the return address.  Proven by the disassembly's jt_ blocks and by
# every measured dispatch in the recon files.
JUMPTAB = 0x83E4


def load(rom: Path) -> bytes:
    b = rom.read_bytes()
    # iNES / NES2.0: 16-byte header, then 32 KB PRG at $8000
    off = 16
    prg = b[off:off + 0x8000]
    if len(prg) != 0x8000:
        raise SystemExit(f"expected 32 KB PRG, got {len(prg)}")
    return prg


def walk(prg: bytes, entries, exclude, tabsize):
    seen, todo = set(), list(entries)
    unresolved, calls = [], set()
    reads = []
    while todo:
        pc = todo.pop()
        while True:
            if pc < 0x8000 or pc > 0xFFFF or pc in seen:
                break
            seen.add(pc)
            op = prg[pc - 0x8000]
            if op not in T:
                unresolved.append(("bad opcode $%02X" % op, pc))
                break
            mn, mode = T[op]
            n = LEN[mode]
            operand = None
            if mode in (ZP, ZPX, ZPY, IZX, IZY, IMM, REL):
                operand = prg[pc - 0x8000 + 1]
            elif mode in (ABS, ABX, ABY, IND):
                operand = prg[pc - 0x8000 + 1] | (prg[pc - 0x8000 + 2] << 8)
            if mode in (ZP, ZPX, ZPY, ABS, ABX, ABY) and mn not in ("JSR", "JMP"):
                reads.append((pc, mn, mode, operand))
            nxt = pc + n
            if mn in BRANCH:
                d = operand if operand < 0x80 else operand - 0x100
                todo.append((nxt + d) & 0xFFFF)
                pc = nxt
                continue
            if mn == "JSR":
                calls.add(operand)
                if operand == JUMPTAB:
                    # inline word table at nxt; follow every entry, skip the data
                    for i in range(tabsize):
                        a = nxt + 2 * i
                        t = prg[a - 0x8000] | (prg[a - 0x8000 + 1] << 8)
                        if 0x8000 <= t <= 0xFFFF:
                            todo.append(t)
                        seen.add(a); seen.add(a + 1)
                    break          # $83E4 never returns to nxt
                if operand not in exclude:
                    todo.append(operand)
                pc = nxt
                continue
            if mn == "JMP":
                if mode == IND:
                    unresolved.append(("JMP indirect ($%04X)" % operand, pc))
                    break
                todo.append(operand)
                break
            if mn in STOP:
                break
            pc = nxt
    return seen, reads, calls, unresolved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", default=str(DEFAULT_ROM))
    ap.add_argument("--entry", required=True, help="hex, comma separated")
    ap.add_argument("--find", required=True, help="hex address to look for")
    ap.add_argument("--exclude", default="",
                    help="hex routines NOT to descend into (sfx, math helpers)")
    ap.add_argument("--tabsize", type=int, default=48,
                    help="max entries followed for an inline $83E4 jump table")
    a = ap.parse_args()
    prg = load(Path(a.rom))
    entries = [int(x, 16) for x in a.entry.split(",")]
    exclude = {int(x, 16) for x in a.exclude.split(",") if x}
    target = int(a.find, 16)
    seen, reads, calls, unres = walk(prg, entries, exclude, a.tabsize)
    hits = [r for r in reads if r[3] == target]
    print("entry      : %s" % ", ".join("$%04X" % e for e in entries))
    print("reachable  : %d instruction bytes, %d distinct JSR targets"
          % (len(seen), len(calls)))
    print("looking for: $%02X" % target)
    if hits:
        for pc, mn, mode, o in sorted(hits):
            print("  HIT  $%04X  %s $%02X" % (pc, mn, o))
    else:
        print("  NO INSTRUCTION in the reachable set names $%02X" % target)
    print("unresolved : %d" % len(unres))
    for what, pc in unres[:20]:
        print("   $%04X  %s" % (pc, what))


if __name__ == "__main__":
    main()
