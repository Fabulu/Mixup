#!/usr/bin/env python3
"""Export every ROM asset the Gradius port needs into `games/gradius/assets/`.

Deliberately small.  Gradius is mapper 3: 32 KB of PRG mapped flat at
$8000-$FFFF with no banking, and 32 KB of CHR in four 8 KB banks the CNROM latch
swaps whole.  So a CPU address *is* a file offset, there is no bank juggling to
model, and almost every asset is a table the game indexes by stage number.

Two rules run through the whole file:

  * THE RAW BYTES ARE THE AUTHORITY.  `prg.bin` and `chr.bin` are the stripped
    cartridge; everything else is either a slice of them recorded with the ROM
    address it came from, or a decoded CACHE that can be thrown away and rebuilt.
    Every cache entry in the manifest carries `rawRom` / `rawSha1` of the bytes it
    was derived from, so a stale cache is detectable without the emulator.

  * NOTHING IS EMITTED WITHOUT PROVENANCE.  Each table says which ROM address it
    lives at, which file offset that is, and -- where it is known -- the
    instruction that reads it (`readBy`).  Each instruction-anchored constant
    additionally names the OPCODE at that address, and export refuses to run if
    the opcode is not there: that is what stops a table drifting by one byte and
    silently exporting the operand of the wrong instruction.

Where a fact was proved against the running cartridge the citation is to the
NOTES file that holds the evidence:

    NOTES-terrain.md   the streamer, the camera, the five per-stage tables,
                       the RLE block format, the collision derivation
    NOTES-player.md    the mover $9FFC and its clamps, the speed accumulator
    NOTES-render.md    the two raster bands, the CHR swap, palette RAM
    NOTES-rom.md       vectors, the NMI, shadow OAM, the sprite-0 split

Outputs (ALL ROM-DERIVED -- `assets/` is gitignored, none of it is committable)

    assets/manifest.json        every small table, with provenance
    assets/prg.bin      32 KB   RAW: the PRG, iNES header stripped
    assets/chr.bin      32 KB   RAW: the CHR, all four banks
    assets/chr/bank{0..3}.bin   RAW: the same bytes, split as CNROM sees them
    assets/chr/tiles.u8         CACHE: 2048 tiles x 64 px, one byte 0..3 per px
    assets/terrain/stages.json  CACHE: the seven stages expanded from the tables

Usage:
    python games/gradius/tools/export_assets.py
    python games/gradius/tools/export_assets.py --rom "Gradius (USA).nes"
    python games/gradius/tools/export_assets.py --outdir /tmp/x --quiet
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME_ROOT = HERE.parent                      # games/gradius
REPO_ROOT = GAME_ROOT.parents[1]             # the repository root
sys.path.insert(0, str(HERE / "oracle"))

# The RLE block decoder and the collision derivation are NOT re-written here.
# `tools/oracle/terrain.py` holds the transcription of $9EBE-$9F4C and
# $9F55-$9F92 that was checked against the cartridge: 448 real block emissions
# and 1792 collision-map stores, 0 disagreements, with every check watched to go
# red (NOTES-terrain.md section 8).  Re-typing it here would produce a second,
# unproven copy.  `verify_assets.py` deliberately writes its own from the ROM
# listing instead, so the two paths can disagree.
import terrain as T                                                  # noqa: E402

# --------------------------------------------------------------------------
# The cartridge.  Its identity lives in game.json and is spelled once there.
# --------------------------------------------------------------------------
GAME_JSON = GAME_ROOT / "game.json"
INES_HEADER = 16
PRG_BYTES = 0x8000                 # 2 x 16 KB, fixed at $8000-$FFFF (mapper 3)
CHR_BYTES = 0x8000                 # 4 x 8 KB, switched whole by the CNROM latch
CHR_BANK = 0x2000
TILE_BYTES = 16                    # 2bpp planar: 8 bytes plane 0, 8 bytes plane 1


class Rom:
    """The cartridge image, addressed the way the 6502 sees it.

    Mapper 3 does not bank PRG, so `$8000 + (fileOffset - 16)` is the whole of
    the address arithmetic and there is no "which bank" question to get wrong.
    """

    def __init__(self, path: Path, want_sha1: str):
        self.path = path
        self.raw = path.read_bytes()
        self.sha1 = hashlib.sha1(self.raw).hexdigest()
        if self.sha1 != want_sha1:
            raise SystemExit(
                f"REFUSING TO RUN.\n"
                f"  {path}\n"
                f"  sha1 {self.sha1}\n"
                f"  want {want_sha1}   (games/gradius/game.json)\n"
                f"Every address in this exporter was measured against that exact\n"
                f"image.  On any other dump they address something else, and the\n"
                f"export would be plausible-looking garbage.")
        if self.raw[:4] != b"NES\x1a":
            raise SystemExit("not an iNES image (no 'NES\\x1a' magic)")
        self.header = self.raw[:INES_HEADER]
        # Header bytes 4 and 5 are the sizes in 16 KB / 8 KB units; byte 6 bit 2
        # is the 512-byte trainer.  Read them rather than assume -- the sha1 gate
        # already pins the file, this is belt and braces for the offset maths.
        if self.header[6] & 0x04:
            raise SystemExit("this image has a trainer; the offsets below assume none")
        self.prg = self.raw[INES_HEADER:INES_HEADER + self.header[4] * 0x4000]
        self.chr = self.raw[INES_HEADER + len(self.prg):]
        if len(self.prg) != PRG_BYTES or len(self.chr) != CHR_BYTES:
            raise SystemExit(f"PRG {len(self.prg)} CHR {len(self.chr)}: not the 32+32 KB "
                             f"Gradius layout")

    # -- reading, by CPU address --------------------------------------------
    def off(self, addr: int) -> int:
        """CPU address -> offset in the .nes FILE (header included)."""
        if not 0x8000 <= addr <= 0xFFFF:
            raise ValueError(f"${addr:04X} is not in the PRG window")
        return INES_HEADER + addr - 0x8000

    def b(self, addr: int) -> int:
        return self.prg[addr - 0x8000]

    def w(self, addr: int) -> int:
        """16-bit little-endian, the 6502's own order."""
        return self.b(addr) | (self.b(addr + 1) << 8)

    def slice(self, addr: int, n: int) -> bytes:
        o = addr - 0x8000
        return self.prg[o:o + n]

    def stage_tables(self, n: int) -> dict:
        """The five per-stage pointers, at the addresses TABLES cites below."""
        return {"threshold": self.b(0x9FB4 + n),        # $9F55 LDA $9FB4,Y
                "screenOrder": self.w(0x9FBC + 2 * n),  # $9E3E
                "layoutBase": self.w(0x9FCC + 2 * n),   # $9E60
                "patternTbl": self.w(0x9FDC + 2 * n),   # $9E73
                "attrTbl": self.w(0x9FEC + 2 * n)}      # $9E8A


# ==========================================================================
# THE TABLES.  Every entry: where it is, how long, who reads it, what it means.
# `readBy` is the instruction that indexes the table -- quoted because a table
# with no reader is a guess about what a blob of bytes means.
# ==========================================================================
U8, U16 = "u8", "u16le"

TABLES = [
    # ---- terrain: the five per-stage pointers (NOTES-terrain.md section 4) ---
    # Eight entries each, indexed by the stage number $19.  Only seven stages
    # exist ($98FD/$9A3D are seven bytes long), and entry 7 duplicates entry 6.
    ("stage.threshold", 0x9FB4, 8, U8, "$9F55 LDY $19 / LDA $9FB4,Y",
     "collision threshold: a queued tile index >= this is solid ($9F69 CMP $98)"),
    ("stage.screenOrder", 0x9FBC, 8, U16, "$9E3E LDA $9FBC,X",
     "-> a page->screen list, indexed by the camera page $55 ($3F)"),
    ("stage.layoutBase", 0x9FCC, 8, U16, "$9E60 LDA $9FCC,X",
     "-> the 56-byte screen layout arrays (8 blocks across x 7 down)"),
    ("stage.patternTbl", 0x9FDC, 8, U16, "$9E73 LDA $9FDC,X",
     "-> block id -> pointer to its RLE'd 4x4 tile stream"),
    ("stage.attrTbl", 0x9FEC, 8, U16, "$9E8A LDA $9FEC,X",
     "-> block id -> one attribute byte"),
    ("stage.endPage", 0x98FD, 7, U8, "$9926 LDA $3F / CMP $98FD,Y",
     "the camera page at which the stage ends -- also its length in 256 px pages"),
    ("stage.bossPage", 0x9A3D, 7, U8, "$9A4F / $9986 CMP $9A3D,Y",
     "the camera page that triggers the boss"),
    # ---- terrain: the decoder's own constants -------------------------------
    ("terrain.screenStride", 0x9D4F, 8, U16,
     "$9E5C, the 16-bit offset of screen n inside a layout array",
     "0, $38, $70, ... -- a screen is $38 = 56 bytes = 8x7 blocks = 256x224 px"),
    ("terrain.pageBytes", 0x9D6D, 6, U8, "$9DB7 LDA $9D6D,X / $9DBC LDA $9D6F,X",
     "[0..1] collision map page $05/$06 by bit 0 of $55; [2..3] nametable page "
     "high byte $20/$24; [4..5] the attribute-table pair"),
    ("terrain.fillTbl", 0x9D73, 16, U8, "$9F26 TAY / LDA $9D73,Y",
     "'fill the rest of the row with this tile' codes $01-$06 and $0B-$0F"),
    ("terrain.collMasks", 0xC40F, 4, U8, "$C409 LDA $A2 / AND $C40F,Y",
     "the reader's 2-bit field masks: tile row n of a collision byte"),
    # ---- the VRAM queue (NOTES-terrain.md section 2) ------------------------
    ("queue.incBits", 0x8A4B, 6, U8, "$8A5B ORA $8A4B,X",
     "packet mode -> PPUCTRL bits: mode 1/3/5 increment 1, mode 2/4 increment 32"),
    ("queue.cannedPackets", 0x864E, 39, U16, "$85F8 LDA $864E,X / $85FD LDA $864F,X",
     "39 canned VRAM packets ([addrHi][addrLo][data..], control bytes $FD/$FE/$FF) "
     "-- the HUD, and the palette loads below.  39 not 40 because entry 37 points "
     "at $869C, the byte immediately after the table"),
    # ---- CHR banking (NOTES-render.md section 4) ----------------------------
    ("chr.latchTable", 0x8AA8, 4, U8, "$8A9E LDA $8AA8,Y / $8AA1+$8AA4 STA $8AA8,Y",
     "CNROM: the value written IS the byte read (bus conflict), bank = byte & 3. "
     "Selector $2D: 0->bank 0, 1->bank 2, 2->bank 1, 3->bank 3"),
    # ---- the player's weapon table (NOTES-player.md) ------------------------
    ("player.weaponTbl", 0xA0E0, 9, U8, "$A0E9 LDX $44 / LDA $A0E0,X (and $A0E3,X, $A0E6,X)",
     "three 3-entry tables selected by the weapon id $44"),
    # ---- enemies: READ FROM THE LISTING, NOT HOOKED -------------------------
    # NOTES-terrain.md section 6 is explicit that nobody has put a hook on this.
    # It is exported because the shape is unambiguous and the port will need it,
    # and it is flagged so nobody mistakes it for a measured fact.
    ("enemy.stageStreams", 0xA7D0, 8, U16, "$A2C0-ish LDA $A7D0,Y  (LISTING ONLY)",
     "per-stage table of per-512px spawn-stream pointer lists"),
    ("enemy.stage1Streams", 0xA7DE, 8, U16, "indexed by ($3F & $0E)  (LISTING ONLY)",
     "stage 1's eight spawn streams, one per 512 px of camera travel"),
]

# Tables whose meaning has NOT been proved by a hook.  Carried into the manifest
# so a consumer can tell measurement from reading.
LISTING_ONLY = {"enemy.stageStreams", "enemy.stage1Streams"}

# Tables of POINTERS.  Every entry must land in the PRG window -- the same kind
# of structural guard as the opcode check below, and for the same reason: a
# table cited one byte out still reads bytes, and they still look like numbers.
# (terrain.screenStride is u16 but holds offsets, not pointers, so it is not here.)
POINTER_TABLES = {"stage.screenOrder", "stage.layoutBase", "stage.patternTbl",
                  "stage.attrTbl", "queue.cannedPackets", "enemy.stageStreams",
                  "enemy.stage1Streams"}

# ==========================================================================
# INSTRUCTION-ANCHORED CONSTANTS.
# A clamp is not a table -- it is the operand of one immediate instruction.  So
# each is cited as (address, opcode) and export ABORTS if that opcode is not
# there.  $A028 is only "the X clamp" while the byte at $A028 is still C9 (CMP
# immediate); if it ever reads something else, the address moved and the operand
# is somebody else's data.
# ==========================================================================
OP = {0xA9: "LDA #imm", 0xC9: "CMP #imm", 0x69: "ADC #imm", 0xE9: "SBC #imm",
      0x29: "AND #imm", 0xA0: "LDY #imm", 0xA2: "LDX #imm", 0x09: "ORA #imm"}

CONSTANTS = [
    # ---- the player, $9FFC (NOTES-player.md) -------------------------------
    ("player.deadStatus", 0x9FFF, 0xC9,
     "$0100 >= this and only the shots/missiles run ($A003 JMP $A16F)"),
    ("player.speedAdd", 0xA009, 0x69, "step = min($40 + this, cap) -- 8-bit, it wraps"),
    ("player.speedCap", 0xA00B, 0xC9, "the CMP that saturates the speed level"),
    ("player.speedCapValue", 0xA00F, 0xA9, "what it saturates TO ($10 -> 8.0 px/frame)"),
    ("player.xMax", 0xA028, 0xC9,
     "X clamp high = 240.  PROBE.md said 220; the ship was driven to 240"),
    ("player.xMaxStore", 0xA02C, 0xA9, "the value stored on the clamp ($A02E STA $0360)"),
    ("player.xMin", 0xA03A, 0xC9, "X clamp low"),
    ("player.xMinStore", 0xA03E, 0xA9, "the value stored on the clamp ($A040 STA $0360)"),
    ("player.yMaxPre", 0xA052, 0xC9, "Y floor PRE-check: at Y = this, DOWN writes NOTHING"),
    ("player.yMaxPost", 0xA059, 0xC9, "Y floor post-check, same value"),
    ("player.yMaxStore", 0xA05D, 0xA9, "the value stored on the clamp"),
    ("player.yMinPre", 0xA06C, 0xC9, "Y ceiling PRE-check"),
    # $A070 is the JSR $A297 between the two checks, not a CMP.  The opcode
    # guard below caught that on the first run of this exporter -- the notes say
    # "$A06C BCC" and it is easy to count the post-check to the wrong address.
    ("player.yMinPost", 0xA073, 0xC9, "Y ceiling post-check, after $A070 JSR $A297"),
    ("player.yMinStore", 0xA077, 0xA9, "the value stored on the clamp ($A07D STA $0320)"),
    ("player.ringLen", 0xA08C, 0xC9, "the position ring wraps at 24 entries ($A090 SBC)"),
    ("player.ringWrap", 0xA090, 0xE9, "and by subtracting the same 24"),
    ("player.tiltPeriod", 0xA0BA, 0xC9, "the tilt latch re-evaluates every 8 frames ($0140)"),
    # ---- the camera, one add per frame (NOTES-terrain.md section 1) ---------
    ("camera.stepSub", 0x98EE, 0xA9,
     "$80 added to the sub-pixel byte $3D per frame = EXACTLY 1/2 px/frame"),
    ("camera.stepFast", 0x9855, 0xA9,
     "the $1B = 14/15 state's 4 px/frame add ($9857 JSR $8402)"),
    ("render.scrollY", 0x9650, 0xA9, "$13, the band-A Y scroll during stage 1 ($9652 STA $13)"),
    # ---- the split, band B (NOTES-render.md section 3) ----------------------
    ("render.bandBCtrlMask", 0x9ABA, 0x29,
     "band B ANDs the PPUCTRL shadow with this -- nametable bits cleared"),
    ("render.bandBChrSelector", 0x9ABF, 0xA0,
     "band B always LDY #$02 -> $8AA8[2] = $31 -> CHR bank 1"),
]

# ==========================================================================
# PALETTES.
# Palette RAM is filled by canned packets in the table at $864E, pushed through
# the VRAM queue.  Each blob below is [addrHi][addrLo] then colour bytes.
#
# WHICH blob is which was NOT read off the listing -- the bytes at these
# addresses are IDENTICAL to palette RAM measured off the running cartridge and
# written down in NOTES-render.md section 5.  `corroboration` records that
# match, and `verify_assets.py` re-checks it against its own transcription of
# those measured bytes.  Blobs with corroboration None are structurally
# identical neighbours in the same region that nothing has yet measured.
# ==========================================================================
PALETTES = [
    # name          hdr     data   n   packet ptr in $864E   corroboration
    ("gameplay.bg01", 0x877A, 0x877C, 8, 16,
     "$3F00-$3F07 measured on a stage-1 gameplay frame (NOTES-render.md 5)"),
    ("gameplay.sprites", 0x8798, 0x879A, 16, 7,
     "$3F10-$3F1F measured on the same frame"),
    ("title.bg", 0x87D8, 0x87DA, 16, 6,
     "$3F00-$3F0F measured on the title screen (bg0 0F 30 30 0F, bg2 0F 26 06 1C)"),
    ("boot.full", 0x8801, 0x8803, 32, 30,
     "the 32-byte load; its first 8 bytes are gameplay.bg01 and its last 16 are "
     "gameplay.sprites, both measured"),
    ("alt.sprites", 0x8785, 0x8787, 16, 33, None),
]
# $864E entries 8..14 point at seven 8-byte blobs with NO address header -- the
# high half of the background palette ($3F08-$3F0F, i.e. bg2 and bg3), one per
# stage, pushed by a caller that supplies the address itself.  Entry 8's bytes
# are exactly the $3F08-$3F0F measured on stage 1; the other six are the same
# shape at the addresses the same table points to, and are UNVERIFIED.
PALETTE_BGHIGH_FIRST_ENTRY = 8
PALETTE_BGHIGH_COUNT = 7
PALETTE_BGHIGH_LEN = 8

# ==========================================================================
# What is deliberately NOT here.  Written into the manifest so the gap is
# visible from the data rather than only from a notes file.
# ==========================================================================
NOT_EXPORTED = [
    "The NES index->RGB table.  It is NOT in the cartridge -- it is a property "
    "of the PPU.  tools/oracle/palprobe.lua measures the emulator's, and it "
    "lands in tools/oracle/out/video/master_palette.bin.  Nothing here may "
    "claim a ROM address for it.",
    "The title screen's nametable.  $8871 (the RLE full-screen loader) writes it "
    "at load time; its source table has not been identified. NOTES-render.md 9.",
    "Sound.  Untouched by any recon so far ($ED02 from the NMI).",
    "The canned VRAM packets' CONTENTS.  The 39 pointers are exported; the "
    "$FD/$FE/$FF script format at $85F6-$864D has not been transcribed, so the "
    "packets are not decoded here.  The palette blobs above are pinned by "
    "measurement, not by decoding the format.",
]


# =============================================================== decoding ==
def decode_chr(chr_bytes: bytes) -> bytearray:
    """2bpp planar -> one byte per pixel, 0..3.  A CACHE of `chr.bin`.

    A tile is 16 bytes: 8 rows of bit-plane 0, then the same 8 rows of plane 1.
    Bit 7 is the LEFTMOST pixel.  pixel = p0 | (p1 << 1), which is the index the
    PPU looks up in the 4-colour palette the attribute byte selects.

    Output order is flat and browser-friendly: tile t occupies bytes
    t*64 .. t*64+63, row-major.  t is the GLOBAL tile number
    bank*512 + half*256 + index, so tile $3C of pattern table $1000 of bank 1
    is t = 512 + 256 + 0x3C.
    """
    out = bytearray(len(chr_bytes) // TILE_BYTES * 64)
    for t in range(len(chr_bytes) // TILE_BYTES):
        src = t * TILE_BYTES
        dst = t * 64
        for y in range(8):
            p0, p1 = chr_bytes[src + y], chr_bytes[src + y + 8]
            for x in range(8):
                sh = 7 - x
                out[dst + y * 8 + x] = ((p0 >> sh) & 1) | (((p1 >> sh) & 1) << 1)
    return out


def expand_stage(rom: Rom, stage: int) -> dict:
    """One stage's terrain, expanded from the five tables.  A CACHE.

    The chain, all of it proved against the cartridge (NOTES-terrain.md 3-5):

        camera x >> 8 = page  ->  screenOrder[page] = screen
        layoutBase + 56*screen  ->  layout[row*8 + col] = block id
        patternTbl[id] -> RLE'd 4x4 tile stream ;  attrTbl[id] -> attribute byte
        collision = those same tiles, thresholded at $9FB4[stage]

    $9E4C-$9E58: for stages other than 0 the screen index is decremented, and a
    0 entry falls back to STAGE 0's tables with screen 0 -- the shared empty
    starfield screen.  That fallback is why `screens` is keyed by
    "<effective stage>:<screen>" and not by a bare screen number.
    """
    st = rom.stage_tables(stage)
    end_page = rom.b(0x98FD + stage)                      # $9926
    order = [rom.b(st["screenOrder"] + p) for p in range(end_page)]

    screens: dict[str, dict] = {}
    blocks: dict[str, dict] = {}
    for page in range(end_page):
        s = order[page]
        eff = stage
        if stage != 0:                                    # $9E4C
            if s == 0:
                eff, s = 0, 1
            s -= 1
        key = f"{eff}:{s}"
        if key in screens:
            continue
        e = rom.stage_tables(eff)
        base = e["layoutBase"] + T.SCREEN_STRIDE * s      # $9E5C
        ids = list(rom.slice(base, T.SCREEN_STRIDE))
        screens[key] = {"rom": f"${base:04X}", "blockIds": ids}
        for bid in set(ids):
            bkey = f"{eff}:{bid}"
            if bkey in blocks:
                continue
            ptr = rom.w(e["patternTbl"] + 2 * bid)        # $9E81
            tiles = T.decode_block(rom, ptr)              # $9EBE-$9F4C
            blocks[bkey] = {
                "rom": f"${ptr:04X}",
                "tiles": tiles,                           # 16, row-major 4x4
                "attr": rom.b(e["attrTbl"] + bid),        # $9EAA
                # $9F55-$9F92: four bytes, one per tile COLUMN, 2 bits per tile,
                # tile row 0 in bits 0-1.  Derived from the tiles above and from
                # nothing else -- that is the finding, not an optimisation.
                "collision": T.collision_bytes(tiles, e["threshold"]),
            }
    return {
        "stage": stage,
        "endPage": end_page,
        "bossPage": rom.b(0x9A3D + stage),
        "threshold": st["threshold"],
        "tables": {k: f"${v:04X}" for k, v in st.items() if k != "threshold"},
        "pageOrder": order,
        # $9F4F: LDY $19 / CPY #$04 / BEQ $9F94 -- stage index 4 skips the
        # collision write entirely, and page $0600 means something else there.
        "collisionWritten": stage != 4,
        "screens": screens,
        "blocks": blocks,
    }


# ================================================================ manifest ==
def read_table(rom: Rom, addr: int, n: int, unit: str) -> list[int]:
    if unit == U8:
        return list(rom.slice(addr, n))
    return [rom.w(addr + 2 * i) for i in range(n)]


def build_manifest(rom: Rom, files: list[dict]) -> dict:
    tables = {}
    for name, addr, n, unit, read_by, note in TABLES:
        vals = read_table(rom, addr, n, unit)
        if name in POINTER_TABLES:
            stray = [f"${v:04X}" for v in vals if not 0x8000 <= v <= 0xFFFF]
            if stray:
                raise SystemExit(f"ABORT: {name} at ${addr:04X} is a pointer table but "
                                 f"{len(stray)} entr(ies) fall outside the PRG window: "
                                 f"{stray[:4]}")
        tables[name] = {
            "rom": f"${addr:04X}",
            "fileOffset": rom.off(addr),
            "n": n,
            "unit": unit,
            "readBy": read_by,
            "note": note,
            "values": vals,
            "sha1": hashlib.sha1(rom.slice(addr, n * (1 if unit == U8 else 2))).hexdigest(),
        }
        if name in LISTING_ONLY:
            tables[name]["evidence"] = "listing only -- never hooked, do not treat as measured"

    consts = {}
    for name, addr, op, note in CONSTANTS:
        got = rom.b(addr)
        if got != op:
            # Rule 4: measure, do not infer.  If the opcode is not there, the
            # address is wrong and the operand is not what this claims.
            raise SystemExit(
                f"ABORT: {name} cites ${addr:04X} as {OP[op]} (opcode ${op:02X}) "
                f"but the ROM has ${got:02X} there.")
        consts[name] = {
            "rom": f"${addr:04X}",
            "fileOffset": rom.off(addr),
            "opcode": f"${op:02X}",
            "mnemonic": OP[op],
            "value": rom.b(addr + 1),
            "note": note,
        }

    pal = {}
    for name, hdr, data, n, entry, corr in PALETTES:
        ptr = rom.w(0x864E + 2 * entry)
        if ptr != hdr:
            raise SystemExit(f"ABORT: palette {name} claims $864E[{entry}] -> "
                             f"${hdr:04X}, ROM says ${ptr:04X}")
        pal[name] = {
            "rom": f"${data:04X}",
            "fileOffset": rom.off(data),
            "ppuAddr": f"${(rom.b(hdr) << 8) | rom.b(hdr + 1):04X}",
            "packet": {"rom": f"${hdr:04X}", "cannedPacketIndex": entry},
            "colours": list(rom.slice(data, n)),
            "corroboration": corr,
        }
    # The seven header-less high halves, $864E entries 8..14.
    for i in range(PALETTE_BGHIGH_COUNT):
        entry = PALETTE_BGHIGH_FIRST_ENTRY + i
        addr = rom.w(0x864E + 2 * entry)
        pal[f"bgHigh.entry{entry}"] = {
            "rom": f"${addr:04X}",
            "fileOffset": rom.off(addr),
            "ppuAddr": None,                 # no header: the caller supplies it
            "packet": {"rom": f"${addr:04X}", "cannedPacketIndex": entry},
            "colours": list(rom.slice(addr, PALETTE_BGHIGH_LEN)),
            "corroboration": ("$3F08-$3F0F measured on stage 1 (NOTES-render.md 5)"
                              if i == 0 else None),
        }

    return {
        "note": "Generated by games/gradius/tools/export_assets.py - do not edit by hand. "
                "EVERYTHING here is ROM-derived and must never be committed.",
        "generator": "games/gradius/tools/export_assets.py",
        "rom": {
            "file": rom.path.name,
            "sha1": rom.sha1,
            "bytes": len(rom.raw),
            "header": list(rom.header),
            "mapper": (rom.header[6] >> 4) | (rom.header[7] & 0xF0),
            "mirroring": "vertical" if rom.header[6] & 1 else "horizontal",
            "prg": {"bytes": len(rom.prg), "cpuBase": "$8000",
                    "note": "no banking: CPU $8000+n is file offset 16+n"},
            "chr": {"bytes": len(rom.chr), "banks": len(rom.chr) // CHR_BANK,
                    "bankBytes": CHR_BANK,
                    "note": "CNROM switches all 8 KB at once; the latch table is "
                            "tables['chr.latchTable']"},
        },
        "files": files,
        "tables": tables,
        "constants": consts,
        "palettes": pal,
        "chrTiles": {
            "file": "chr/tiles.u8",
            "role": "cache",
            "rawFile": "chr.bin",
            "tiles": CHR_BYTES // TILE_BYTES,
            "bytesPerTile": 64,
            "format": "one byte per pixel, value 0..3, row-major, 8x8",
            "index": "tile = bank*512 + half*256 + n, half 0 = pattern table $0000",
        },
        "terrain": {
            "file": "terrain/stages.json",
            "role": "cache",
            "rawFile": "prg.bin",
            "stages": 7,
            "note": "expanded from tables['stage.*'] with the decoder in "
                    "tools/oracle/terrain.py, which is verified against the "
                    "cartridge (NOTES-terrain.md section 8)",
        },
        "notExported": NOT_EXPORTED,
    }


# ==================================================================== main ==
def write(root: Path, rel: str, data: bytes, role: str, src: str, files: list[dict]):
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    files.append({
        "path": rel,                                    # always relative to assets/
        "bytes": len(data),
        "sha1": hashlib.sha1(data).hexdigest(),
        "role": role,            # "raw" = the authority, "cache" = rebuildable
        "from": src,
    })


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rom", type=Path, default=None,
                    help="default: the file game.json names, at the repo root")
    ap.add_argument("--outdir", type=Path, default=GAME_ROOT / "assets")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    game = json.loads(GAME_JSON.read_text(encoding="utf-8"))
    rom_path = args.rom or (REPO_ROOT / game["rom"]["file"])
    if not rom_path.exists():
        raise SystemExit(f"ROM not found: {rom_path}\n"
                         f"game.json names '{game['rom']['file']}'; put your own dump "
                         f"at the repository root.")
    rom = Rom(rom_path, game["rom"]["sha1"])

    out = args.outdir
    files: list[dict] = []

    # ---- RAW.  The authority.  Everything else is derived from these. -------
    p0 = INES_HEADER
    write(out, "prg.bin", rom.prg, "raw",
          f"{rom_path.name} bytes {p0}..{p0 + len(rom.prg) - 1}", files)
    c0 = p0 + len(rom.prg)
    write(out, "chr.bin", rom.chr, "raw",
          f"{rom_path.name} bytes {c0}..{c0 + len(rom.chr) - 1}", files)
    for i in range(len(rom.chr) // CHR_BANK):
        write(out, f"chr/bank{i}.bin", rom.chr[i * CHR_BANK:(i + 1) * CHR_BANK],
              "raw", f"chr.bin bytes {i * CHR_BANK}..{(i + 1) * CHR_BANK - 1}", files)

    # ---- CACHE.  Rebuildable from the raw bytes above. ----------------------
    write(out, "chr/tiles.u8", bytes(decode_chr(rom.chr)), "cache",
          "chr.bin, 2bpp planar decoded to one byte per pixel", files)

    stages = [expand_stage(rom, s) for s in range(7)]
    stages_doc = {
        "note": "CACHE. Rebuild with tools/export_assets.py; the authority is prg.bin.",
        "chain": "page -> screenOrder[page] -> screen -> layout[row*8+col] -> block id "
                 "-> patternTbl[id] -> 4x4 tiles; collision = those tiles thresholded",
        "blockPx": 32, "screenBlocks": [8, 7], "pagePx": 256,
        "stages": stages,
    }
    write(out, "terrain/stages.json",
          json.dumps(stages_doc, separators=(",", ":")).encode("utf-8"),
          "cache", "prg.bin via tables['stage.*']", files)

    manifest = build_manifest(rom, files)
    (out / "manifest.json").write_text(
        json.dumps(manifest, separators=(",", ":")), encoding="utf-8")

    if args.quiet:
        return 0
    total = sum(f["bytes"] for f in files) + (out / "manifest.json").stat().st_size
    print(f"assets/ written: {total / 1024:.0f} KB   ({rom_path.name} sha1 ok)")
    print(f"  raw    prg.bin {len(rom.prg)} B, chr.bin {len(rom.chr)} B "
          f"({len(rom.chr) // CHR_BANK} banks)")
    print(f"  cache  chr/tiles.u8 {CHR_BYTES // TILE_BYTES} tiles, "
          f"terrain/stages.json {len(stages)} stages")
    print(f"  manifest: {len(manifest['tables'])} tables, "
          f"{len(manifest['constants'])} instruction-anchored constants, "
          f"{len(manifest['palettes'])} palette blobs")
    for s in stages:
        solid = sum(bin(b).count("1") for blk in s["blocks"].values()
                    for b in blk["collision"])
        print(f"    stage {s['stage'] + 1}  pages 0..{s['endPage'] - 1}  "
              f"boss@${s['bossPage']:02X}  thr ${s['threshold']:02X}  "
              f"{len(s['screens'])} screens  {len(s['blocks'])} blocks  "
              f"{solid} solid tile-bits"
              f"{'' if s['collisionWritten'] else '  (collision NOT written: $9F4F)'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
