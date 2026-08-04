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
    assets/hud/packets.json     CACHE: the 39 canned VRAM packets at $864E
    assets/enemies/tables.json  CACHE: the four ROM byte ranges $A2C0/$ADAB read
    assets/flow/tables.json     CACHE: the two ranges the $96A5 ladder reads
    assets/collision/tables.json CACHE: the boxes and the explosion walk ($C0C7)
    assets/weapons/tables.json  CACHE: the five ranges the firing block, the shot
                                sweep and the kill chain read ($A0E0/$A1A4/$BE6E/
                                $BFCE/$BFC5)

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
    # $9A35 is one 16-byte block split across two names: the head (first 8 bytes)
    # is the rank countdown, indexed by X=$17 (rank); the tail is $9A3D above,
    # indexed by X=$19 (stage). Rank and stage index disjoint halves, so the two
    # never collide. W24 added the head -- the load-bearing data for $82.
    ("stage.rankCountdown", 0x9A35, 8, U8, "$9A1E LDA $9A35,X (X = $17 rank)",
     "the $82 end-of-stage countdown = byte x 256 frames, per rank 0..7"),
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
    # ---- enemies, wave 3 (00-recon-enemies.md + this wave's own re-runs) ----
    # Each one is a number src/enemies.js spells; pinning the OPCODE is what
    # stops a re-cited address handing the port somebody else's operand.
    ("enemy.slotBase", 0xA534, 0x69,
     "$A527: X = $A8 + this -- an enemy's object slot is its index + 12"),
    ("enemy.chunkMask", 0xA2E1, 0x29,
     "$61 = $3F AND this -- the spawn stream is reloaded every 512 px"),
    ("enemy.inlineCmd", 0xA34B, 0xC9,
     "a wave record's cmd >= this is the 5-byte INLINE form ($A37A); NOT PORTED"),
    ("enemy.recordLen", 0xA34F, 0xA9,
     "$6A:$6B += this after every record read -- a wave record is 2 bytes"),
    ("enemy.formMembers", 0xA3F1, 0xC9,
     "a formation of >= this many members gets a squadron counter at $0048+$49"),
    ("enemy.allocFirst", 0xA415, 0xA2,
     "the formation allocator starts here and scans DOWN -- slot 21 fills first, "
     "which is what fixes the OAM draw order ($8B47 walks slots 0->31)"),
    ("enemy.updateSlots", 0xADB3, 0xA2,
     "$ADAB: LDX #$09 / ... / DEC $A8 / BPL -- 10 slots every frame, occupied or "
     "not. MEASURED 15900 $ADE5 entries over 1590 $ADAB calls = exactly 10.00"),
    ("enemy.animReload", 0xADF1, 0xA9,
     "$014C,X reload: the status animator steps once every this many frames"),
    ("enemy.animMask", 0xAE03, 0x29,
     "$016C,X AND this -- four metasprites per status group at $ADC1"),
    ("enemy.explReload", 0xAE9E, 0xA9,
     "$AE99's explosion script steps once every this many frames"),
    ("enemy.driftStep", 0xAEE7, 0xE9,
     "$AEE1 subtracts this from $038C,X every frame = 0.5 px/frame LEFT"),
    ("enemy.driftFreeX", 0xAEF4, 0xC9,
     "...and $AEF8 frees the slot once $036C,X drops below this"),
    ("enemy.fanTurnX", 0xB0D2, 0xC9,
     "$B0AF sub-state 0 ends when X drops below this"),
    ("enemy.fanTurnTimer", 0xB0D6, 0xA9, "$046C,X, the fan's 64-frame curve"),
    ("enemy.fanSplitY", 0xB0DE, 0xC9,
     "Y >= this -> sub-state 2 (curve UP) instead of 1 (curve DOWN)"),
    ("enemy.wavyAccel", 0xB271, 0xA9, "$B26C seeds $048C,X with this (0.5 px/f^2)"),
    ("enemy.despawnXMin", 0xB256, 0xC9, "$B251 frees the slot below this X"),
    ("enemy.despawnXMax", 0xB25A, 0xC9, "...and at or above this X"),
    ("enemy.despawnYMin", 0xB261, 0xC9, "...and below this Y"),
    ("enemy.despawnYMax", 0xB265, 0xC9, "...and at or above this Y"),
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
    # Sound USED to be listed here as "untouched by any recon".  It is exported
    # now -- assets/sound/tables.json, the $ECB2 channel bases and the one
    # $EFB8-$FFC0 block that holds the pitch table, the 64 sound records and
    # every sequence stream (wave 8, src/sound.js).  What is still NOT exported
    # is any decoded FORM of a stream: the driver walks them with a real 16-bit
    # pointer and jumps inside them, so the bytes are the only honest shape.
    # The canned-packet contents USED to be listed here as not exported.  Wave 2
    # transcribed $85F3-$864D and they are now in assets/hud/packets.json; the
    # palette blobs above stay pinned by measurement as well, so the two routes
    # to the same bytes can still disagree.
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


PKT_TABLE = 0x864E                 # $85F7 LDA $864E,X / $85FC LDA $864F,X
PKT_COUNT = 39
PKT_MAX_LEN = 128                  # a stream longer than this is not a packet


def canned_packets(rom: Rom) -> dict:
    """The 39 canned VRAM packet streams at `$864E`.  A CACHE.

    The copier is `$85F3`, entered either directly or by falling through
    `$85E8` (which appends the queue mode byte `$01` first -- `$85F1` is the
    third byte of that prologue's `JSR $8645`, NOT a routine entry).  It reads
    bytes at `($98),Y` and copies them into `$0700,X` until a control code:

        $FF  end, append nothing                        ($860A -> $864B)
        $FE  append $FF (the packet terminator) and end ($8629 -> $8647)
        $FD  append $FF, $9B := 2, append $01 (a fresh mode byte), keep going
             ($862D-$863B) -- one index emitting TWO packets

    So the stream stored here is the RAW ROM script, terminator included.  It
    is deliberately NOT pre-expanded: `src/hudpackets.js` is a transcription of
    $85F3 and interprets the control codes itself, which is also the only way
    the bit-7 "blank" variant ($8617-$8624: everything after the first two
    copied bytes replaced by $00) can be expressed -- index `$80|n` and index
    `n` share a pointer, because `$85F5 ASL A` is 8-bit and loses bit 7.
    """
    out = []
    for i in range(PKT_COUNT):
        ptr = rom.w(PKT_TABLE + 2 * i)
        if not 0x8000 <= ptr <= 0xFFFF:
            raise SystemExit(f"ABORT: canned packet {i} points outside PRG (${ptr:04X})")
        b = []
        a = ptr
        while True:
            if len(b) >= PKT_MAX_LEN:
                # No terminator.  Either the pointer is wrong or the format is
                # not what this claims; do not emit a truncated guess.
                raise SystemExit(f"ABORT: canned packet {i} at ${ptr:04X} has no "
                                 f"$FF/$FE within {PKT_MAX_LEN} bytes")
            v = rom.b(a)
            a += 1
            b.append(v)
            if v in (0xFF, 0xFE):
                break
        out.append({"index": i, "rom": f"${ptr:04X}", "fileOffset": rom.off(ptr),
                    "bytes": b})
    return {
        "note": "CACHE. Rebuild with tools/export_assets.py; the authority is prg.bin.",
        "table": {"rom": f"${PKT_TABLE:04X}", "fileOffset": rom.off(PKT_TABLE),
                  "entries": PKT_COUNT,
                  "readBy": "$85F7 LDA $864E,X / $85FC LDA $864F,X"},
        "copier": "$85F3 (entered by fall-through from the $85E8 prologue, which "
                  "appends the mode byte $01 first)",
        "control": {"FF": "end, append nothing", "FE": "append $FF and end",
                    "FD": "append $FF, reset the blank counter, append $01, continue"},
        "packets": out,
    }


# ==========================================================================
# ENEMIES.  Four contiguous ROM byte ranges, exported RAW rather than decoded.
#
# WHY RAW.  The spawn engine indexes its tables with 8-bit arithmetic that WRAPS
# ($A36D `LDA $98 / ASL / ASL` is (cmd*4) AND $FF; $A3E6 `ASL / TAX` is
# ($66*2) AND $FF) and it walks the wave lists through a real 16-bit pointer in
# `$6A:$6B` that the port must keep byte-for-byte so `$6A`/`$6B` stay COMPARABLE
# against the cartridge.  A pre-decoded "list of waves" cannot express either.
# So src/enemies.js reads these bytes at their CPU addresses, exactly as the
# 6502 does, and a read outside an exported range is a loud throw instead of a
# plausible number.
#
# The ranges, and the fact that they are contiguous and complete:
#
#   $A592-$ADAA  every table the spawn engine touches, in one run:
#                $A592 formation table (count/spawnX/firstY, 2 bytes)
#                $A5BC pattern table   (delay/dY/style, 3 bytes)
#                $A5FE/$A600 the two descriptor-table POINTERS
#                $A602 table B (formation descriptors, 4 bytes)
#                $A662 table A (single-spawn descriptors, stride 3)
#                $A7D0 per-stage chunk-table pointers (7)
#                $A7DE-$A843 the seven chunk tables
#                $A844-$ADAA every wave list of every stage.
#                It ENDS at $ADAB, which is the first instruction of the update
#                loop -- asserted below, so the range cannot silently grow into
#                code or stop short of the last stage's last wave.
#   $AE1C-$AE6F  the 42-entry handler dispatch table ($AE19 JSR $83E4)
#   $ADC1-$ADE4  the nine 4-byte status animation groups
#   $AE71-$AE98  the six explosion-script pointers and their byte streams
#
# MEASURED, not read off the listing (00-recon-enemies.md 1, re-run for this
# wave): stage 0 chunk 0's ten records fire at exactly ($61<<8)+trigger*2, ten
# for ten, and the chunk switch to $A859 happens at scroll $0200.
ENEMY_BLOCKS = [
    ("spawnData", 0xA592, 0xADAB,
     "$A2D5 LDA $A7D0,Y / $A2E6 LDA ($98),Y / $A33F LDA ($6A),Y / "
     "$A397 LDA $A5FE,Y / $A3E8 LDA $A592,X / $A42F LDA $A5BC,Y",
     "formation + pattern + descriptor tables, the per-stage chunk tables, and "
     "every wave list"),
    ("dispatch", 0xAE1C, 0xAE70,
     "$AE19 JSR $83E4 -- $83E4 does ASL A (8-BIT, so type $85 and $05 land on "
     "the SAME entry) and jumps through table_base + 2*(type AND $7F)",
     "42 handler addresses; entries 0 and 31 both point at $AE70, the RTS that "
     "is also the byte immediately after the table"),
    ("animGroups", 0xADC1, 0xADE5,
     "$AE09 LDA $ADC1,Y with Y = status*4 + ($016C,X AND 3)",
     "nine 4-byte groups (status 0..8); a 0 byte means wrap and re-read, which "
     "is how the 3-entry capsule groups (status 6 and 7) work"),
    ("explosionScripts", 0xAE71, 0xAE99,
     "$AEA8 LDA $AE71,Y with Y = $016C,X * 2, then ($98),Y with Y = $042C,X",
     "six pointers at $AE71-$AE7C then their streams; a 0 byte ends the script"),
    # ---- WAVE 11: the three tables the ENEMY-BULLET path reads ------------
    # $BC32 is EIGHTEEN bytes read through TWO overlapping nine-byte views:
    # $BC93 `LDA $BC32,X` is the muzzle's dx and $BC98 `LDA $BC3B,X` its dy,
    # and $BC3B is $BC32 + 9. Exported as ONE run because that is what it is;
    # splitting it into two 9-byte tables would hide the overlap and the second
    # view's last byte ($BC43) is also the run's last byte.
    ("bulletMuzzle", 0xBC32, 0xBC44,
     "$BC93 LDA $BC32,X (dx) and $BC98 LDA $BC3B,X (dy), X = $0496,Y",
     "nine (dx,dy) muzzle offsets as two overlapping 9-byte views of one "
     "18-byte run: 00/F8/08 in each axis, i.e. a 3x3 grid around the firing "
     "enemy. MEASURED: $0496 is 0 on every stage-1 squadron, so only entry 0 "
     "-- (0,0) -- has ever been read"),
    ("bulletKind", 0xBC64, 0xBC68,
     "$BC7A LDA $BC64,Y (metasprite) and $BC80 LDA $BC66,Y (type), Y = 0 or 1",
     "two parallel 2-byte tables: 25/59 metasprite, 00/01 type. Y is 1 only "
     "when the FIRING enemy's status $010C,X is $80-$8F ($BC6E-$BC77); "
     "MEASURED n=0 on the cartridge, so only entry 0 is exercised"),
    ("bulletAnim", 0xBDD1, 0xBDD5,
     "$BDED LDA $BDD1,Y with Y = 1..3 ($BDE6 INY, $BDE7 CPY #$04 wraps to 1)",
     "the three-frame bullet animation 7A 7B 7C. ENTRY 0 IS THE RTS AT $BDD1 "
     "($60) and is never read: $BDDA BEQ leaves when the status byte is 0 and "
     "the INY makes Y at least 1. Exported so the base address is the ROM's"),
    # ---- WAVE 12: the two tables the SINGLE-SPAWN handlers read -----------
    # $B086 is EIGHTEEN bytes read through THREE six-byte views, all with the
    # same Y (0..5) that $B038-$B06C computes from the enemy's position
    # relative to the ship: $B06D `LDA $B086,Y` is the metasprite, $B07D
    # `LDA $B08C,Y` the muzzle index for a turret whose $018C has bit 7 clear,
    # and $B078 `LDA $B092,Y` the one for a turret with bit 7 set -- which is
    # every type $92, because $B09D `ORA #$80` sets it on entry. Exported as
    # ONE run for the same reason bulletMuzzle is: three tables at +0/+6/+12 of
    # one block is what the ROM has, and splitting it would hide that.
    ("turretFrames", 0xB086, 0xB098,
     "$B06D LDA $B086,Y (metasprite), $B07D LDA $B08C,Y and $B078 LDA $B092,Y "
     "(the $0496,X muzzle index), Y = the 0..5 direction code from $B038",
     "three parallel 6-entry tables for the aiming turret ($B026 type $11/$91 "
     "and $B098 type $12/$92): metasprites 74 73 72 75 76 77, then the two "
     "muzzle-index rows 01 01 06 05 05 00 and 03 03 06 08 08 00. The muzzle "
     "index is what $BC90 `LDX $0496,Y` reads to pick the bullet's (dx,dy) out "
     "of bulletMuzzle -- so this is the table that makes an enemy bullet come "
     "out of the barrel rather than the middle"),
    # $B200 is FIVE bytes and the sixth would be $B205's `LDA $030C,X` opcode
    # ($BD, which reads as a perfectly plausible non-zero "turn right" flag).
    # It is exported at five, not six, deliberately: $B1C5 `LDA $B200,Y` with
    # Y = $04AC,X is a table the enemy walks one entry per arc, and a read past
    # the end must be the reader's loud throw, not a plausible 0/1 flag. See
    # src/enemies.js h_B198, which throws at Y >= 5 with the ROM address.
    ("arcTurns", 0xB200, 0xB205,
     "$B1C5 LDA $B200,Y with Y = $04AC,X, the arc counter $B1D4 INCs",
     "00 00 01 00 00 -- the turn schedule of the type $06/$86 arcing enemy: "
     "0 means $B1DF (X += xvel, i.e. LEFT, xvel is $FE) and non-zero means "
     "$B1E5 (X -= xvel, i.e. RIGHT). So it flies left, left, right, left, "
     "left. MEASURED on the cartridge with an exec hook on $B1C5 reading the Y "
     "register (tools/oracle/throwaudit.py, 27,400 frames): 2439 executions "
     "and Y takes 0, 1, 2, 3 and 4 -- ALL FIVE ENTRIES ARE READ -- and never "
     "5. So the length is not a guess: the enemy walks the whole table and "
     "$B251's box frees it before it can run off the end"),
]

# ==========================================================================
# WAVE 21.  The ranges the TWENTY-NINE THROWING $AE1C handlers index.
#
# 20-recon-enemy-census.md §4 enumerated 28+ ROM ranges that no exporter
# shipped, so every unported handler would have hit `romByteReader`'s throw the
# moment it was written -- the $B086/$B088 crash of wave 15, by design, 24 more
# times. This block is that list, exported.
#
# THE EXTENT OF EVERY ONE IS PINNED ON THE INSTRUCTION IMMEDIATELY AFTER IT.
# That is the sixth field of each tuple and it is checked at export time, not
# trusted: metasprite ids, rank speeds and small indices are byte-for-byte
# indistinguishable from opcodes, so a range cited one byte long ships
# something that still looks exactly like a table. Every anchor below was read
# out of `Gradius (USA).nes` with tools/dis6502.py on 2026-08-02 and the
# lengths agree with the census's counts entry by entry.
#
#   (name, start, end_exclusive, readBy, note, anchorAddr, anchorBytes, what)
#
ENEMY_BLOCKS_W21 = [
    # ---- entries 32-37, the six blinking pickups --------------------------
    ("blinkFrames", 0xAF0A, 0xAF10,
     "$AF21 LDA $AF0A,Y with Y = type - $20",
     "89 87 8C 8B 8A 88 -- one metasprite per pickup type $20-$25. $AF09 is "
     "the RTS before it and $AF10 the first byte of the handler after it, so "
     "the six is the ROM's, not a guess",
     0xAF10, (0xA6, 0xA8), "$AF10 LDX $A8, dispatch entries 32-37"),
    # ---- the rank speed row entries 15/16 reach through $AF40 JMP $B0B4 ----
    ("rankSpeed", 0xB01D, 0xB026,
     "$B008 LDA $B01D,Y -> $04EC,X and $040C,X (the 16-bit X velocity), "
     "Y = the rank $17",
     "64 46 3C 37 32 2D 28 23 1E -- NINE ranks, matching $BFC5 and $B90A. "
     "handlerflow.py: this is the ONLY PRG table entries 15 ($AF2E) and 16 "
     "($AF88) index besides the sound driver's, so it is the whole of wave "
     "22's table debt for the two hatches",
     0xB026, (0xA9, 0x91), "$B026 LDA #$91, dispatch entry 17"),
    # ---- entry 9 / entry 12, the hatch children ---------------------------
    ("flipFrames", 0xB33B, 0xB343,
     "$B334 LDA $B33B,Y -> $012C,X, Y = ($016C,X AND 7)",
     "5E 5F 60 61 62 61 60 5F -- the 8-frame flip of the enemy the floor "
     "hatch ($AF2E) and the ceiling hatch ($AF88) launch. Both entry 9 "
     "($B311) and entry 12 ($B3CB) index it; it is the only PRG table either "
     "one reads",
     0xB343, (0x20, 0x1E, 0xB3), "$B343 JSR $B31E"),
    ("spinFrames", 0xB3C2, 0xB3CB,
     "$B392 LDA $B3C2,Y",
     "64 64 64 65 65 65 66 66 66 -- entry 11 ($B37F)'s 9-frame spin, three "
     "frames each",
     0xB3CB, (0xBD, 0x0C, 0x03), "$B3CB LDA $030C,X, dispatch entry 12"),
    # ---- entries 13 and 14, the two $B205 variants ------------------------
    #
    # WAVE 34.  THESE TWO RAN OFF THE END OF THEIR OWN TABLES ON THE CARTRIDGE
    # AND THE PORT SHIPPED A CRASH WHERE THE ROM HAS A READ.  Both were five
    # bytes here until W33 found stages 3 and 4 dying at frame 314 with no
    # player input at all.  The extent is now the read's, not the table's, and
    # the derivation is in src/enemies.js h_B402 -- in one line:
    #
    #   $B42F is 00 00 00 01 01 = LEFT LEFT LEFT RIGHT RIGHT.  Each arc is 34
    #   frames and moves 66 px ($B212 seeds yvel 2 / accel $20, $B422 flips at
    #   -3).  Net over the whole schedule is ONE arc LEFT, so an enemy that
    #   spawns at the right edge is still on screen when $04AC reaches 5 and
    #   $B415 reads $B434.  $B200's schedule (00 00 01 00 00 = FOUR left, one
    #   right, 98 px an arc) is net THREE arcs left and leaves first -- which is
    #   exactly why W12's 27,400-frame cartridge hook saw $B1C5's Y stop at 4.
    #   Same shape, opposite outcome, and the difference is the two tables.
    #
    # The exported extent is SEVEN entries + one byte of anchor alignment; the
    # port throws at Y >= 7, which is one more than the LISTING bound of 6
    # (h_B402's proof: reaching Y = 5 needs the spawn x >= 202, so x is >= 136
    # when the schedule ends, and each overrun arc is +66 px against $B251's
    # `CMP #$F4` free).  Neither the port nor the exporter may quietly widen
    # again: the anchors below are on real instruction boundaries.
    ("phaseB42F", 0xB42F, 0xB437,
     "$B415 LDA $B42F,Y with Y = $04AC,X, the arc counter $B426 INCs",
     "00 00 00 01 01 -- entry 13 ($B402)'s own copy of $B200's shape -- "
     "FOLLOWED BY BD 0C 03, which is st_B434's own `LDA $030C,X` opcode and "
     "which $B415 reads as turn flags for Y = 5 and 6. All three are non-zero, "
     "so every read past the schedule means the same thing: $B1DA's `LDA "
     "$046C,X / BNE $B1E5` takes subX16 and the enemy flies RIGHT off the "
     "screen. This is the CARTRIDGE's behaviour, not a port artefact",
     0xB437, (0x10, 0xCE), "$B437 BPL $B407, inside st_B434"),
    ("phaseB45C", 0xB45C, 0xB464,
     "$B43C LDA $B45C,Y with Y = $04AC,X, the arc counter $B44B INCs",
     "00 00 00 01 01 -- entry 14 ($B434)'s copy of the schedule, byte-"
     "identical to $B42F and exported separately because the ROM has two -- "
     "FOLLOWED BY BD 4C 04, the first bytes of the ORPHANED routine at $B461 "
     "($B461-$B47F is a 16-bit velocity decrement and a second copy of $B251's "
     "off-screen box; nothing in the PRG jumps to either). $B43C reads them as "
     "turn flags for Y = 5 and 6; all three are non-zero, so $B451's `BNE "
     "$B459` takes $B1FA and the enemy flies RIGHT off the screen",
     0xB464, (0x38, 0xFD, 0x8C, 0x04),
     "$B464 SEC / SBC $048C,X, inside the orphan at $B461"),
    # ---- entry 26 ---------------------------------------------------------
    ("dwellByRank", 0xB4E4, 0xB4F2,
     "$B48F and $B4D6 LDA $B4E4,Y / $B4BE LDA $B4EB,Y, Y = the rank $17",
     "two parallel SEVEN-rank rows in one 14-byte run: 50 50 40 30 20 10 10 "
     "then 60 60 50 40 30 20 20. Seven, not nine -- $B4EB starts at +7 and "
     "the run ends at entry 27",
     0xB4F2, (0xBD, 0x0C, 0x03), "$B4F2 LDA $030C,X, dispatch entry 27"),
    # ---- entry 30, the stage-end gate -------------------------------------
    ("gateTiles", 0xB606, 0xB61E,
     # READ OUT OF THE LISTING, not off the census, which has these two the
     # wrong way round: $B5A9 is `LDA $B612,X` and $B5DC is `LDA $B606,X`.
     "$B5A9 LDA $B612,X -> $06C2,Y / $06CA,Y / $06D2,Y (and $06DA,Y), and "
     "$B5DC LDA $B606,X / $B5E2 LDA $B607,X -> $06F1,Y",
     "two 12-byte nametable rows the $5B-freezing stage-end gate writes. "
     "$B606 = 25 78 26 18 25 98 25 F8 25 B8 25 D8 (tile/column pairs) and "
     "$B612 = FF 00 FF FF C3 FF FF FF FF FF FF FF",
     # NOT `LDA #$00`: the guard below caught me writing A9 00 here and the ROM
     # has A0 00 -- entry 38 opens `LDY #$00 / JSR $B628`, the animator call.
     0xB61E, (0xA0, 0x00, 0x20, 0x28, 0xB6),
     "$B61E LDY #$00 / JSR $B628, dispatch entry 38"),
    # ---- the shared $B628 animator ----------------------------------------
    ("animRecords", 0xB650, 0xB65C,
     # Read out of the listing: the three loads are CMP, CMP and ADC, and the
     # middle one is +2, not +1. $B62E CMP $B650,Y (frame count) /
     # $B639 CMP $B652,Y (wrap limit) / $B644 ADC $B651,Y -> STA $012C,X, so
     # byte +1 of each record is a METASPRITE BASE.
     "$B62E CMP $B650,Y / $B639 CMP $B652,Y / $B644 ADC $B651,Y -> $012C,X, "
     "Y = 0, 3, 6 or 9",
     "FOUR 3-byte records for $B628's animator, read by entries 26/28/29/38. "
     "There is no fifth: $B65C is the start of the player-X docking routine "
     "$B65C, which is the anchor below",
     0xB65C, (0xAD, 0x60, 0x03), "$B65C LDA $0360, the docking routine"),
    # ---- entries 7 and 19, the terrain walkers (WAVE 22's first wall) -----
    ("walkerTables", 0xB6D2, 0xB6E1,
     # Read out of the listing. The census lists all three as "walker" tables
     # without saying what they are; $B6C5's destination is $012C,X, the ANIM
     # FIELD, so $B6D9 is four METASPRITE ids and not a speed row.
     "$B6A4 LDA $B6D2,Y (Y = the rank $17) -> $04EC,X and $040C,X, the 16-bit "
     "X velocity; $B6C5 LDA $B6D9,Y -> $012C,X (metasprite); "
     "$B6CB LDA $B6DD,Y -> $0496,X (the bulletMuzzle index)",
     "3C 37 32 2D 28 28 23 | 1C 1C 1F 1F | 01 03 02 04 -- one contiguous "
     "15-byte run holding the census's three tables at +0/+7/+11. Entry 7 "
     "($B6E1, the floor-hugging walker, stage 1's FIRST unported spawn at "
     "scroll $0440) and entry 19 ($B747, its ceiling mirror) index all three "
     "and nothing else in PRG",
     0xB6E1, (0xA6, 0xA8), "$B6E1 LDX $A8, dispatch entry 7"),
    # ---- entry 23, the mid-boss -------------------------------------------
    ("midBossRank", 0xB787, 0xB7A1,
     "$B7B5..$B839: LDA $B787,Y (fire period) / $B78F,Y (X frac) / "
     "$B797,Y / $B799,Y (Y frac), Y = the rank $17",
     "one 26-byte run: 8 + 8 + 2 + 8. $B797 is only two bytes (3F 40) and "
     "sits between the two 8-rank rows",
     0xB7A1, (0xA6, 0xA8), "$B7A1 LDX $A8, dispatch entry 23"),
    ("midBossHits", 0xB852, 0xB85A,
     "$B84x LDA $B852,Y, Y = the rank $17",
     "02 03 04 05 06 07 08 08 -- hits to kill entry 23 by rank",
     0xB85A, (0xBD, 0x8C, 0x04), "$B85A LDA $048C,X"),
    # ---- entries 23 and 24, muzzles + THE BOSS CORE -----------------------
    ("coreTables", 0xB8E6, 0xB913,
     "$B8A9-$B8B4 LDA $B8E6,Y / $B8E9,Y / $B8EC,Y (entry 23's three muzzles); "
     "$B936 LDA $B8EF,Y (damage frames); $BA3E..$BA73 LDA $B8F8,Y / $B901,Y / "
     "$B90A,Y (entry 24 by rank)",
     "one 45-byte run: 3+3+3 muzzle offsets, then 6C 6D 6E 6F 70 71 00 (the "
     "boss's damage metasprites, 0 terminating), two filler 00s at "
     "$B8F6/$B8F7, then THREE NINE-rank rows. It ends on $B913, which is "
     "dispatch entry 25 -- a single RTS byte, not a fall-through into $B914",
     0xB913, (0x60,), "$B913 RTS, dispatch entry 25"),
    ("coreSpread", 0xBAF7, 0xBB0F,
     "$BABA..$BAEC LDA $BAF7,Y / $BAFB,Y / $BAFF,Y / $BB07,Y",
     "the boss core's 4-way bullet spread: 08 F8 F8 08 | F1 FE 0A 17 | "
     "8 speeds | 8 directions",
     0xBB0F, (0xA2, 0x09), "$BB0F LDX #$09, dispatch entry 40"),
    # ---- entry 40, the scripted fly-past ----------------------------------
    ("pathScript", 0xBB82, 0xBBB7,
     "$BB38 LDA $BB82,Y and $BB49 LDA $BB83,Y, Y = 2 * the step counter",
     "TWENTY-SIX [dX, YhiNibble|metaspriteLowNibble] records then the $FF "
     "terminator at $BBB6. prgmap.txt's '14-word pointer table at $BB9B' is "
     "the TAIL of this script, not a table -- ruled out in the census by "
     "reading $BB33-$BB63",
     0xBBB7, (0xA5, 0x5D), "$BBB7 LDA $5D"),
    # ---- $C413, the SECOND spawner nobody had documented ------------------
    ("lateSpawnerDispatch", 0xC439, 0xC44F,
     "$C436 JSR $83E4 with A = $19 (the stage) -- an INLINE 7-entry jump "
     "table -- then $C44F LDA $C447,X / $C452 STA $9A for the stream pointer",
     "SEVEN handler addresses ($C486 $C546 $C686 $C5AD $C653 $C6DE $C429) "
     "then FOUR pointers to packed-nibble spawn streams ($C526 $C58D $C633 "
     "$C752). structure.txt calls the first table 11 entries; it is 7, and "
     "the proof is that entry 7 would be $C447, which $C44F reads as the "
     "pointer table",
     0xC44F, (0xBD, 0x47, 0xC4), "$C44F LDA $C447,X"),
    ("approachStage0", 0xC4F4, 0xC546,
     "$C4D4 LDA $C4F4,Y (metasprite) / $C49D LDA $C4F6,Y / $C4A3 LDA $C4F7,Y "
     "/ $C4C7 ADC $C4F8,Y, Y = $AA; then the $C526 nibble stream through "
     "($9A),Y",
     "the stage-0 arm's descriptor rows AND the packed-nibble stream $C447[0] "
     "points at, as one run: $C4F3 is an RTS and $C546 is the stage-1 arm's "
     "first instruction, so everything between is data",
     0xC546, (0xA5, 0x02), "$C546 LDA $02, the stage-1 arm"),
    ("approachStage1", 0xC56D, 0xC5AD,
     "$C556 LDA $C56D,Y / $C55C LDA $C56E,Y; then the $C58D nibble stream",
     "SIXTEEN (x,y) pairs then the 32-byte stream $C447[1] points at. Ends "
     "where the stage-3 arm begins",
     0xC5AD, (0xA5, 0x69), "$C5AD LDA $69, the stage-3 arm"),
    ("approachStage3", 0xC601, 0xC653,
     "$C5C4-$C5EE LDA $C601,Y / $C603,Y ...; then the $C633 nibble stream",
     "byte-identical to approachStage0's first 50 bytes -- the ROM has two "
     "copies -- then the stream $C447[2] points at. $C5FE is `JMP $C4E4` and "
     "$C653 `INC $68`, so the run is bounded by code both ends",
     0xC653, (0xE6, 0x68), "$C653 INC $68, the stage-4 arm"),
    ("approachStage4", 0xC67A, 0xC686,
     "$C664 LDA $C67A,Y / $C66D LDA $C67B,Y; $C68C CMP $C684,Y ($3A gate)",
     "four (x,y) pairs, two bytes this recon could not name ($C682/$C683 = "
     "12 40), then the two-byte $3A gate 28 0A",
     # Caught by the guard: $C686 is `INC $68`, not `LDA $68`. Four bytes, not
     # two, because $C653 (the stage-4 arm) also opens `INC $68`.
     0xC686, (0xE6, 0x68, 0xA5, 0x68),
     "$C686 INC $68 / LDA $68, the stage-2 arm"),
    ("approachStage2", 0xC6CA, 0xC6DE,
     "$C6B3 LDA $C6CA,Y (metasprite) / $C6B9 LDA $C6CC,Y (TYPE) / "
     "$C6A6 LDA $C6CE,Y (position), Y = $3A",
     "3F 00 | 97 A6 | 16 position bytes. $C6CC is the ONLY producer of types "
     "$97 (entry 23) and $A6 (entry 38) outside their own self-writes -- "
     "$C6BC STA $030C,X",
     0xC6DE, (0xA5, 0x69), "$C6DE LDA $69, the stage-5 arm"),
    ("approachStage5", 0xC750, 0xC772,
     "$C73F LDA $C750,Y; then the $C752 nibble stream",
     "the two-byte row plus the 32-byte stream $C447[3] points at. The "
     "stage-5 arm fills an ENEMY-BULLET slot ($0316/$0136), not an enemy",
     0xC772, (0xA5, 0x19), "$C772 LDA $19"),
    # ---- entry 22, the stage-2 object -------------------------------------
    ("stage2Object", 0xC87B, 0xC906,
     "$C906's body: LDA $C87B,X (four $FF-terminated id streams) and "
     "LDA $C893,X / $C894,X (four pointers), then ($9A),Y into the streams "
     "those point at",
     "24 stream bytes, then the four pointers $C89B $C8F1 $C8BD $C8E0, then "
     "the 107 bytes those four point INTO -- all of it, because $C878 is "
     "`JMP $C856` and $C906 is dispatch entry 22, so the whole run between is "
     "data and splitting it would leave the pointer targets unexported",
     0xC906, (0xA6, 0xA8), "$C906 LDX $A8, dispatch entry 22"),
    ("stage2Period", 0xC936, 0xC93D,
     "$C93x LDA $C936,Y, Y = the rank $17",
     "50 4B 46 41 3C 28 1E -- entry 22's fire period by rank, seven",
     0xC93D, (0xA9, 0x00), "$C93D LDA #$00"),
    # ---- entry 20, the $0600-page object ----------------------------------
    ("page600Object", 0xCA29, 0xCA5E,
     "$CA60..$CB03: LDA $CA29,Y / $CA2A,Y / $CA2B,Y / $CA2C,Y (four parallel "
     "columns, EIGHT rows), then LDA $CA49,Y / $CA50,Y (two damage "
     "thresholds by rank) and $CA57,Y (Y speed)",
     "one 53-byte run. $CA29-$CA48 is 8 rows x 4 columns and $CA49 the three "
     "SEVEN-rank rows the census counted; $CA28 is an RTS and $CA5E is "
     "dispatch entry 20, so both ends are code",
     0xCA5E, (0xA4, 0x17), "$CA5E LDY $17, dispatch entry 20"),
    # ---- WAVE 32b: the $0600 ARM POOL's four table runs -------------------
    #
    # NONE OF THESE FOUR IS REACHABLE FROM tablecoverage.py's ROOT SET, and
    # that is why they were missing rather than because anybody decided they
    # were not needed. That tool walks from the 42 $AE1C dispatch entries plus
    # $C413 (LATE_SPAWNER); $8C06 hangs off $8BAB (the sprite pass, called at
    # $80A7), $CB91 off $9A76/$9691, and $CC33/$CC99 off $CB91. The tool
    # reported OK with all four unexported and would have gone on doing so.
    # W32b adds the four roots to its walk in the same wave; see
    # docs/worklog/gradius/32-recon-destructible-terrain.md §6.
    ("armHeadSprite", 0x8BF2, 0x8C06,
     "$8C19 LDA $8BF2,X (X = segment 5's angle >> 2 AND $0F) and "
     "$8C1E LDA $8C02,Y (Y = that index >> 2)",
     "TWENTY bytes in one run: sixteen head TILES "
     "(FD FB FB F9 F9 FB FB FD FD FB FB F9 F9 FB FB FD) then four ATTRIBUTE "
     "bytes (02 42 C2 82). Exported as one block because $8C02 is $8BF2 + 16 "
     "and both are read by the same routine; $8BF1 is the `BMI $8B93` that "
     "ends $8BD9 and $8C06 is the first instruction of sub_$8C06, so the run "
     "is bounded by code both ends. The two high-bit attributes ($C2, $82) "
     "are load-bearing: $8C49 BPL tests bit 7 of the byte it just stored and "
     "shifts the head sprite 8 px up when it is set",
     0x8C06, (0xA9, 0x05, 0x85, 0xAA), "$8C06 LDA #$05 / STA $AA, sub_$8C06"),
    ("armHitsByRank", 0xBEEA, 0xBEF3,
     "$BF44 CMP $BEEA,Y, Y = the rank $17",
     "02 02 03 04 05 06 07 08 09 -- NINE ranks, the shots it takes to destroy "
     "one arm at segment 2. Nine and not seven: $BEE9 is the RTS that ends "
     "$BE93 and $BEF3 is sub_$BEF3's LDX #$90, so both ends are code. Exported "
     "by W32b even though its READER ($BEF3/$BF0B, the shot-vs-segment sweep) "
     "is W32c -- the tool's job is to cover what the ROM indexes, and rooting "
     "$BEF3 in tablecoverage.py without this range would just move the gap",
     0xBEF3, (0xA2, 0x90, 0x86, 0xA9), "$BEF3 LDX #$90 / STX $A9, sub_$BEF3"),
    ("armFirePeriod", 0xCBCA, 0xCBD1,
     "$CBAD CMP $CBCA,Y, Y = the rank $17",
     "28 23 1E 19 19 19 19 -- SEVEN ranks, the frames between one arm's "
     "shots. $CBC9 is the RTS that ends sub_$CB91 and $CBD1 is sub_$CBD1's "
     "LDX #$09, so seven is the ROM's count and not a guess",
     0xCBD1, (0xA2, 0x09), "$CBD1 LDX #$09, sub_$CBD1 (the arm's shot)"),
    ("armShapeParams", 0xCC1F, 0xCC33,
     "$CC63 LDA $CC1F,Y / $CC68 LDA $CC21,Y (Y = the SHAPE $0601,X) and "
     "$CC7C LDA $CC23,Y / $CC85 LDA $CC2B,Y (Y = $9A = 4*$0460,owner + shape)",
     "TWENTY bytes holding four overlapping rows at +0, +2, +4 and +$0C: "
     "4A 6A (angle floor) | 56 76 (angle ceiling) | 04 04 04 04 0C 0C 0C 0C "
     "(segment-0 dX by $9A) | FC 10 FC 10 FC 20 FC 20 (segment-0 dY by $9A). "
     "$CC1E is sub_$CC19's RTS and $CC33 sub_$CC33's first byte. "
     "DELIBERATELY NOT EXTENDED: $CC23,Y is indexed by $9A, which is "
     "4*$0460 + ($0601 = the shape) and so runs past $CC32 for any shape "
     "above 3. The recon found no producer of a shape above 1 (stage 5's "
     "four inline-5 records give 0 and 1, $C67A's four live rows give 0 and "
     "1) but could not prove one cannot exist, so the block stops at the "
     "ROM's own code boundary and a shape that overruns it becomes a LOUD "
     "THROW out of romByteReader instead of silently reading opcodes",
     0xCC33, (0xB9, 0x0C, 0x03), "$CC33 LDA $030C,Y, sub_$CC33"),
    ("armSegmentDelta", 0xCD65, 0xCDA5,
     "$CD16 SBC $CD65,Y / $CD1C LDA $CD65,Y (dX) and $CD4B SBC $CD85,Y / "
     "$CD55 ADC $CD85,Y (dY), Y = the segment angle AND $3F, folded to 0-$1F",
     "SIXTY-FOUR bytes: two 32-entry signed delta rows, dX at $CD65 and dY "
     "at $CD85, exported as one run because they are adjacent and read by "
     "the same loop. $CD64 is sub_$CC33's RTS and $CDA5 is sub_$CDA5's "
     "LDA $66, so both ends are code",
     0xCDA5, (0xA5, 0x66, 0xC9, 0x58), "$CDA5 LDA $66 / CMP #$58, sub_$CDA5"),
]

ENEMY_STAGE_PTRS = 0xA7D0          # $A2D5 LDA $A7D0,Y -- 7 stages, 2 bytes each
ENEMY_STAGES = 7
ENEMY_CHUNKS = 8                   # $61 = $3F AND $0E -> 8 even offsets
ENEMY_DESC_PTRS = 0xA5FE           # $A397 LDA $A5FE,Y -- Y = 0 (table A), 2 (B)


def enemy_tables(rom: Rom) -> dict:
    """The enemy spawn/update byte ranges, with the structure asserted.

    Every guard here is the same kind as the opcode guard on CONSTANTS: a range
    cited one byte out still contains bytes, and they still look like a table.
    """
    # The end of the wave-list region is the START of the update loop.  If a
    # future dump moved either, this stops the export dead instead of shipping a
    # blob that runs off into code.
    if rom.b(0xADAB) != 0xA9 or rom.b(0xADAC) != 0x80:
        raise SystemExit(f"ABORT: $ADAB should be `LDA #$80` (the head of the "
                         f"enemy update loop) but reads "
                         f"${rom.b(0xADAB):02X} ${rom.b(0xADAC):02X}")
    if rom.b(0xAE70) != 0x60:
        raise SystemExit("ABORT: $AE70 is not an RTS -- dispatch entries 0 and 31 "
                         "point at it and it is also the byte after the table")
    # WAVE 11: anchor all three enemy-bullet tables on the OPCODES around them,
    # so a range cited one byte out cannot ship bytes that merely look like a
    # table.  Each of these is the instruction immediately past the block.
    if rom.slice(0xBC44, 2) != bytes((0xA5, 0x1A)):
        raise SystemExit(f"ABORT: $BC44 should be `LDA $1A` (the head of the fire "
                         f"decision) but reads {rom.slice(0xBC44, 2).hex(' ')} -- "
                         f"the muzzle table $BC32-$BC43 does not end where this "
                         f"claims")
    if rom.slice(0xBC68, 2) != bytes((0x86, 0xA9)):
        raise SystemExit(f"ABORT: $BC68 should be `STX $A9` (the allocator's hit) "
                         f"but reads {rom.slice(0xBC68, 2).hex(' ')}")
    if rom.b(0xBDD1) != 0x60 or rom.slice(0xBDD5, 2) != bytes((0xA6, 0xA9)):
        raise SystemExit(f"ABORT: $BDD1 should be an RTS and $BDD5 `LDX $A9` (the "
                         f"mover) but they read ${rom.b(0xBDD1):02X} / "
                         f"{rom.slice(0xBDD5, 2).hex(' ')}")
    # WAVE 12: the same discipline for the two single-spawn tables. Both ends
    # of each are pinned to the INSTRUCTION either side, because a range cited
    # one byte out here ships bytes that still look exactly like a table --
    # metasprite ids and small indices are indistinguishable from opcodes.
    if rom.slice(0xB083, 3) != bytes((0x4C, 0xDD, 0xAE)):
        raise SystemExit(f"ABORT: $B083 should be `JMP $AEDD` (the instruction "
                         f"immediately BEFORE the turret tables) but reads "
                         f"{rom.slice(0xB083, 3).hex(' ')}")
    if rom.slice(0xB098, 2) != bytes((0xA9, 0x92)):
        raise SystemExit(f"ABORT: $B098 should be `LDA #$92` (st_B098, the "
                         f"instruction immediately AFTER the turret tables) but "
                         f"reads {rom.slice(0xB098, 2).hex(' ')}")
    if rom.slice(0xB1FD, 3) != bytes((0x4C, 0xF4, 0xB1)):
        raise SystemExit(f"ABORT: $B1FD should be `JMP $B1F4` (the instruction "
                         f"immediately BEFORE $B200) but reads "
                         f"{rom.slice(0xB1FD, 3).hex(' ')}")
    if rom.slice(0xB205, 3) != bytes((0xBD, 0x0C, 0x03)):
        raise SystemExit(f"ABORT: $B205 should be `LDA $030C,X` (st_B205, the "
                         f"instruction immediately AFTER the arc-turn table) "
                         f"but reads {rom.slice(0xB205, 3).hex(' ')}")

    roots = {
        "tableA": rom.w(ENEMY_DESC_PTRS),          # $A5FE -> single-spawn
        "tableB": rom.w(ENEMY_DESC_PTRS + 2),      # $A600 -> formation
    }
    if roots["tableA"] != 0xA662 or roots["tableB"] != 0xA602:
        raise SystemExit(f"ABORT: the descriptor pointers at $A5FE/$A600 read "
                         f"${roots['tableA']:04X}/${roots['tableB']:04X}, not "
                         f"$A662/$A602")

    lo, hi = 0xA592, 0xADAB
    stages = []
    for s in range(ENEMY_STAGES):
        chunk_tbl = rom.w(ENEMY_STAGE_PTRS + 2 * s)
        if not lo <= chunk_tbl < hi:
            raise SystemExit(f"ABORT: stage {s}'s chunk table ${chunk_tbl:04X} is "
                             f"outside the exported range ${lo:04X}-${hi - 1:04X}")
        chunks = []
        for c in range(ENEMY_CHUNKS):
            p = rom.w(chunk_tbl + 2 * c)
            if not lo <= p < hi:
                # Stages 2-6 have SEVEN chunk pointers, not eight; entry 7 of
                # their table is the first wave list's bytes.  $61 can only reach
                # 14 = chunk 7 on a stage long enough to scroll 4096 px, which
                # none of them is, so this is recorded and not treated as an
                # error for c == 7.
                if c == ENEMY_CHUNKS - 1:
                    chunks.append(None)
                    continue
                raise SystemExit(f"ABORT: stage {s} chunk {c} -> ${p:04X}, outside "
                                 f"${lo:04X}-${hi - 1:04X}")
            # every wave list must terminate with $FF inside the range
            a = p
            while a < hi and rom.b(a) != 0xFF:
                a += 2
            if a >= hi:
                raise SystemExit(f"ABORT: stage {s} chunk {c}'s wave list at "
                                 f"${p:04X} has no $FF terminator before ${hi:04X}")
            chunks.append(f"${p:04X}")
        stages.append({"chunkTable": f"${chunk_tbl:04X}", "chunks": chunks})

    for e in range(42):
        t = rom.w(0xAE1C + 2 * e)
        if not 0x8000 <= t <= 0xFFFF:
            raise SystemExit(f"ABORT: dispatch entry {e} -> ${t:04X}, outside PRG")

    blocks = []
    for name, a, end, read_by, note in ENEMY_BLOCKS:
        blocks.append({"name": name, "rom": f"${a:04X}", "end": f"${end:04X}",
                       "fileOffset": rom.off(a), "len": end - a,
                       "readBy": read_by, "note": note,
                       "bytes": list(rom.slice(a, end - a))})

    # ---- WAVE 21: the 25 ranges the throwing handlers index ---------------
    # Every one is pinned on the instruction immediately AFTER it. This loop is
    # the guard; the table above is only a claim until it runs.
    for name, a, end, read_by, note, anch, want, what in ENEMY_BLOCKS_W21:
        if anch != end:
            raise SystemExit(f"ABORT: block {name} ends at ${end:04X} but its "
                             f"anchor is ${anch:04X} -- the anchor MUST be the "
                             f"first byte past the block")
        got = rom.slice(anch, len(want))
        if got != bytes(want):
            raise SystemExit(
                f"ABORT: block {name} (${a:04X}-${end - 1:04X}) claims "
                f"{what} immediately after it, i.e. "
                f"{' '.join('%02X' % b for b in want)} at ${anch:04X}, but the "
                f"ROM has {got.hex(' ')} there. The range is cited wrong and a "
                f"table of plausible-looking bytes would have shipped.")
        blocks.append({"name": name, "rom": f"${a:04X}", "end": f"${end:04X}",
                       "fileOffset": rom.off(a), "len": end - a,
                       "readBy": read_by, "note": note,
                       "anchor": {"rom": f"${anch:04X}",
                                  "bytes": list(want), "is": what},
                       "bytes": list(rom.slice(a, end - a))})

    # No two blocks may overlap. romByteReader takes the FIRST block that
    # contains an address, so an overlap would silently pick a winner -- and
    # with 34 blocks that is no longer something the eye can check.
    spans = sorted((int(b["rom"][1:], 16), int(b["end"][1:], 16), b["name"])
                   for b in blocks)
    for (a0, e0, n0), (a1, e1, n1) in zip(spans, spans[1:]):
        if a1 < e0:
            raise SystemExit(f"ABORT: enemy blocks {n0} (${a0:04X}-${e0 - 1:04X}) "
                             f"and {n1} (${a1:04X}-${e1 - 1:04X}) OVERLAP")

    return {
        "note": "CACHE. Rebuild with tools/export_assets.py; the authority is prg.bin.",
        "why": "src/enemies.js reads these at their CPU addresses because the "
               "ROM's own indexing is 8-bit-wrapping and its wave cursor $6A:$6B "
               "is a compared field. A read outside them is a loud throw.",
        "roots": {k: f"${v:04X}" for k, v in roots.items()},
        "stagePtrTable": {"rom": f"${ENEMY_STAGE_PTRS:04X}", "stages": ENEMY_STAGES,
                          "chunksPerStage": ENEMY_CHUNKS,
                          "index": "$61 = $3F AND $0E, used as a BYTE offset"},
        "stages": stages,
        "blocks": blocks,
    }


# ==========================================================================
# FLOW.  The two byte ranges the mode-5 state machine reads (wave 4).
#
# Exported RAW and CPU-addressed for the same reason the enemy tables are: the
# ROM indexes them with its own arithmetic and src/flow.js reproduces that
# arithmetic rather than a decoded shape.
#
#   $9BCC-$9BEC  the stage-intro START POSITION.  $9B88-$9BB8 is
#                  LDY $19 / LDA $3F / LSR A / CLC / ADC $9BCC,Y / TAY
#                  LDA $9BD4,Y / AND #$F0 -> $0320/$0321/$0322 and all 32 bytes
#                                            of the Y ring at $07C0
#                  LDA $9BD4,Y / ASL x4    -> $0360/$0361/$0362 and the X ring
#                so ONE byte carries both coordinates: the high nibble is Y,
#                the low nibble is X/16.  $9BCC is the per-stage base index
#                (8 bytes) and $9BD4 the 25 position bytes.
#   $9785-$979C  the two BUTTON-CODE strings $9765 matches against, behind two
#                pointers.  X = 0 is the game-over continue code and X = 2 the
#                one the PAUSE screen runs on every paused frame ($9B05).
#                src/flow.js ports $9765 because it writes $33 on every paused
#                frame; the $33 == $0A arm ($9C5E) is a loud throw.
FLOW_BLOCKS = [
    ("startPos", 0x9BCC, 0x9BED,
     "$9B8E ADC $9BCC,Y (Y = $19) / $9B92 and $9BA8 LDA $9BD4,Y",
     "8 per-stage base indices then 25 packed start positions"),
    ("codes", 0x9785, 0x979D,
     "$9765 LDA $9785,X / $976A LDA $9786,X, then CMP ($98),Y with Y = $33",
     "two pointers ($9789 game over, $9793 pause) and their 10-byte strings"),
]


def flow_tables(rom: Rom) -> dict:
    """The mode-5 flow byte ranges, with the ends anchored on real opcodes.

    A range cited one byte long runs into code and the code still looks like
    data, so both ends are pinned to the instruction that follows them -- the
    same guard shape CONSTANTS uses.
    """
    # $9BED is `JSR $83AB`, the first instruction of st_9BED (intro state 1).
    if rom.slice(0x9BED, 3) != bytes((0x20, 0xAB, 0x83)):
        raise SystemExit(f"ABORT: $9BED should be `JSR $83AB` (intro state 1) but "
                         f"reads {rom.slice(0x9BED, 3).hex(' ')} -- the $9BD4 "
                         f"position table does not end where this claims")
    # $979D is `LDX $18`, the first instruction of the respawn at loc_979D.
    if rom.slice(0x979D, 2) != bytes((0xA6, 0x18)):
        raise SystemExit(f"ABORT: $979D should be `LDX $18` (the respawn) but "
                         f"reads {rom.slice(0x979D, 2).hex(' ')}")

    ptrs = {"gameOver": rom.w(0x9785), "pause": rom.w(0x9787)}
    if ptrs["gameOver"] != 0x9789 or ptrs["pause"] != 0x9793:
        raise SystemExit(f"ABORT: $9765's code pointers read "
                         f"${ptrs['gameOver']:04X}/${ptrs['pause']:04X}, not "
                         f"$9789/$9793")
    # $9BCC[$19] + ($3F >> 1) must land inside $9BD4-$9BEC for every stage and
    # every checkpoint.  The bound is 4, not 6, and that is a fact about the ROM
    # rather than a convenience: $9B6A `LDA $24,X / STA $3F` runs BEFORE $9B8A
    # reads $3F, so the index is always the CHECKPOINT, and $97B1-$97BB writes
    # $24 = min($3F AND $0E, 8) -- five values {0,2,4,6,8}, i.e. ($3F >> 1) in
    # 0..4.  With +6 stage 6 (base 20) would run one past the 25th byte; with +4
    # it lands exactly on it.
    n_pos = 0x9BED - 0x9BD4
    for s in range(7):
        base = rom.b(0x9BCC + s)
        if base + 4 >= n_pos:
            raise SystemExit(f"ABORT: $9BCC[{s}] = {base}; +4 (checkpoint $24 = 8) "
                             f"runs off the end of the {n_pos}-byte $9BD4 table")

    blocks = []
    for name, a, end, read_by, note in FLOW_BLOCKS:
        blocks.append({"name": name, "rom": f"${a:04X}", "end": f"${end:04X}",
                       "fileOffset": rom.off(a), "len": end - a,
                       "readBy": read_by, "note": note,
                       "bytes": list(rom.slice(a, end - a))})
    return {
        "note": "CACHE. Rebuild with tools/export_assets.py; the authority is prg.bin.",
        "why": "src/flow.js reads these at their CPU addresses; a read outside "
               "them is a loud throw rather than a plausible byte.",
        "codePtrs": {k: f"${v:04X}" for k, v in ptrs.items()},
        "blocks": blocks,
    }


# ==========================================================================
# COLLISION.  The two byte ranges the $C0C7 subsystem reads (wave 5).
#
#   $BFDA-$BFE1  the player/shot-vs-enemy BOXES, two parallel 4-byte tables
#                indexed by $0460,Y (the enemy's own box class):
#                  $C127  CMP $BFDA,X   width   10 20 30 10
#                  $C131  CMP $BFDE,X   height  10 20 30 02
#                MEASURED: $0460+0..9 is 0 on every frame of every scenario in
#                the corpus, and the one death it contains ($C16E at f493 on
#                right-wall) reports X = 0 -- so class 0, 16 x 16, is the only
#                box this port has ever been held to.  Exported whole anyway,
#                because a wrong INDEX is exactly what the other three entries
#                would catch.
#   $C0FA-$C100  the death explosion's metasprite walk, read as $C0FA,X with
#                X = $0160 ($C0DD/$C0E3).  2D 2E 2F 30 30 00 00 -- the fifth
#                entry repeats and the sixth is the $00 that ends the walk
#                ($C0E9 BNE).  MEASURED on right-wall: $0120 steps 1 -> $2D at
#                f494 and then $2E/$2F/$30 at f504/514/524, $30 again at 534
#                (no visible change) and 0 at 544.
COLLISION_BLOCKS = [
    ("boxes", 0xBFDA, 0xBFE2,
     "$C127 CMP $BFDA,X and $C131 CMP $BFDE,X, X = $0460,Y",
     "four widths then four heights, indexed by the enemy's box class"),
    ("explosion", 0xC0FA, 0xC101,
     "$C0E3 LDA $C0FA,X, X = $0160 (the explosion cursor)",
     "2D 2E 2F 30 30 00 00 -- metasprite ids, $00 ends the walk"),
    # ---- WAVE 11 -----------------------------------------------------------
    # The PLAYER-versus-enemy-BULLET boxes, which are a different pair of
    # tables from $BFDA/$BFDE and are indexed by a different byte: $C22F
    # `LDX $0176,Y` is the BULLET's own animation-frame byte, which $BC86 set
    # from $BC66,Y -- i.e. 0 or 1, the bullet KIND, not an enemy box class.
    ("bulletBoxes", 0xC202, 0xC20A,
     "$C238 CMP $C202,X (width) and $C242 CMP $C206,X (height), X = $0176,Y",
     "four widths 10 16 16 16 then four heights 08 12 12 10. MEASURED on the "
     "cartridge with bulletprobe.py: kind 0 is the only one stage 1 fires, and "
     "963 rejected + 1 accepted sample bracket the pair at W in [1,235], "
     "H in [2,204] -- loose, because a bullet aimed at the ship approaches it "
     "almost head-on, so dx is only ever small when dy is too"),
    # ---- WAVE 34: the BREAKABLE WALL's two four-entry tables ---------------
    # $C32F is stage 2's signature mechanic ($19 = 1 places 227 field-2 cells
    # across 42 of its 83 blocks) and it was an unported throw until W34.  Both
    # tables are indexed by $A3, the sub-cell index the probe masked to 0..3 at
    # $C406, and both are pure arithmetic on it -- $C39B[k] is ~(3 << 2k) and
    # $C39F[k] is k * $20.  Exported as BYTES anyway, so the port cannot become
    # its own source of truth for either (docs/knowledge/03).
    ("breakMasks", 0xC39B, 0xC3A3,
     "$C393 AND $C39B,X (clear the cell) and $C368 ORA $C39F,X (the sub-cell's "
     "bits 5-6 of the nametable address), X = $A3",
     "FC F3 CF 3F then 00 20 40 60 -- four AND masks and four OR values in one "
     "8-byte run, because that is what the ROM has. $C39B[k] clears the 2-bit "
     "field at bit 2k of the map byte; $C39F[k] is k * $20, the sub-cell's "
     "contribution to the nametable row"),
    # ---- WAVE 35: STAGE 6's EXIT APERTURE ($CDA5 -> sub_$CDB3) -------------
    # $CE2D is a SECOND copy of $C39B's four AND masks (FC F3 CF 3F) -- the ROM
    # has both and each routine indexes its own, so they are exported
    # separately rather than aliased.  $CE31 is the 88 cells sub_$CDB3 walks,
    # bounded by its own `CPX #$58`; the run ends where sub_$CE89 begins.
    ("apertureCells", 0xCE2D, 0xCE89,
     "$CE27 AND $CE2D,X (X = (hi+3) & 3, the sub-cell) and $CDC0 LDA $CE31,X "
     "(X = $66, 0..$57)",
     "one 92-byte run: FC F3 CF 3F, then EIGHTY-EIGHT packed (hi, lo) cells. "
     "Each cell is one nametable tile at row hi+7, column lo+16 of $2400 and "
     "one 2-bit collision cell at $0600 + $81 + 8*lo + ((hi+3) >> 2). Plotted, "
     "they are a bevelled cross -- stage 6's exit aperture. FOUR of the 88 are "
     "DUPLICATES (84 distinct cells), which is the ROM's table and not a "
     "decode error. $CE2C is sub_$CDB3's RTS and $CE89 is sub_$CE89's "
     "LDA $18, so both ends are code"),
]


def collision_tables(rom: Rom) -> dict:
    """The $C0C7 collision tables, with both ends anchored on real opcodes."""
    # $BFE2 is `LDX #$08`, the first instruction of the shot sweep.
    if rom.slice(0xBFE2, 2) != bytes((0xA2, 0x08)):
        raise SystemExit(f"ABORT: $BFE2 should be `LDX #$08` (the shot sweep) but "
                         f"reads {rom.slice(0xBFE2, 2).hex(' ')} -- the $BFDA/$BFDE "
                         f"box tables do not end where this claims")
    # $C101 is `LDA #$09`, the first instruction of the player-vs-enemy sweep.
    if rom.slice(0xC101, 2) != bytes((0xA9, 0x09)):
        raise SystemExit(f"ABORT: $C101 should be `LDA #$09` (the player-vs-enemy "
                         f"sweep) but reads {rom.slice(0xC101, 2).hex(' ')}")
    # $C3A3 is `LDA $0320`, the PLAYER's half of the terrain probe, so the two
    # breakable-wall tables end exactly where the code begins again.
    if rom.slice(0xC3A3, 3) != bytes((0xAD, 0x20, 0x03)):
        raise SystemExit(f"ABORT: $C3A3 should be `LDA $0320` (sub_C3A3) but "
                         f"reads {rom.slice(0xC3A3, 3).hex(' ')} -- the "
                         f"$C39B/$C39F break tables do not end where this claims")
    # WAVE 35. Both ends of the stage-6 aperture run are pinned to real opcodes.
    # $CE2C is `RTS` -- sub_$CDB3's last byte, immediately before the masks.
    if rom.b(0xCE2C) != 0x60:
        raise SystemExit(f"ABORT: $CE2C should be `RTS` (the end of sub_$CDB3) "
                         f"but reads ${rom.b(0xCE2C):02X} -- the $CE2D/$CE31 "
                         f"aperture run does not begin where this claims")
    # $CE89 is `LDA $18`, the first instruction of sub_$CE89 (the score nibble).
    if rom.slice(0xCE89, 4) != bytes((0xA5, 0x18, 0x0A, 0x0A)):
        raise SystemExit(f"ABORT: $CE89 should be `LDA $18 / ASL / ASL` "
                         f"(sub_$CE89) but reads {rom.slice(0xCE89, 4).hex(' ')} "
                         f"-- the 88-cell aperture table does not end here")
    # And the bound is the ROM's own: sub_$CDB3 tests `CPX #$58` at $CDB5, so
    # the table is exactly $58 cells after the four masks. If that immediate
    # ever moves, the export length is wrong and this says so rather than
    # shipping 88 bytes for a routine that reads a different number.
    if rom.slice(0xCDB5, 2) != bytes((0xE0, 0x58)):
        raise SystemExit(f"ABORT: $CDB5 should be `CPX #$58` (sub_$CDB3's own "
                         f"bound) but reads {rom.slice(0xCDB5, 2).hex(' ')}")
    if (0xCE89 - 0xCE31) != 0x58:
        raise SystemExit("ABORT: $CE31..$CE89 is not $58 cells")

    # The explosion table MUST contain a terminating zero, or $C0E9's BNE never
    # falls through and the walk reads $C101's opcodes as metasprite ids.
    expl = rom.slice(0xC0FA, 7)
    if 0 not in expl:
        raise SystemExit(f"ABORT: $C0FA-$C100 = {expl.hex(' ')} has no $00; "
                         f"$C0E9 would walk the walk off the end of the table")
    blocks = []
    for name, a, end, read_by, note in COLLISION_BLOCKS:
        blocks.append({"name": name, "rom": f"${a:04X}", "end": f"${end:04X}",
                       "fileOffset": rom.off(a), "len": end - a,
                       "readBy": read_by, "note": note,
                       "bytes": list(rom.slice(a, end - a))})
    return {
        "note": "CACHE. Rebuild with tools/export_assets.py; the authority is prg.bin.",
        "why": "src/collision.js reads these at their CPU addresses; a read outside "
               "them is a loud throw rather than a plausible byte.",
        "blocks": blocks,
    }


# ==========================================================================
# WEAPONS.  The five byte ranges the firing block, the shot sweep and the kill
# chain read (wave 6).  All five are indexed by a RAM byte, which is why they
# are exported as BYTES at their CPU addresses rather than as decoded tables:
# a wrong index has to be a loud throw, not a plausible-looking value.
#
#   $A0E0-$A0E8  three parallel 3-entry tables indexed by the weapon $44
#                ($A0EB LDA $A0E0,X -> slot-A type, $A0F0 LDA $A0E6,X -> the
#                sfx id, $A0F5 LDA $A0E3,X -> slot-B type).  MEASURED on the
#                cartridge by forcing $44 (00-recon-weapons.md 0): $44 = 0 gives
#                type $06 sub 0 in both slots, 1 gives $07 sub 1, and 2 gives
#                $06 in slot A and $24 in slot B on the SAME frame.
#   $A1A4-$A1A9  THREE 2-entry tables, not one 6-entry one ($A1AF LDA $A1A4,Y
#                = dy, $A1BD LDA $A1A8,Y = dx low, $A1CA ADC $A1A6,Y = dx high),
#                Y = 0 fly / 1 crawl.  fly = y += 2, x += 0.5; crawl = y += 0,
#                x += 2.  MEASURED: 916 of 916 missile frames took the fly row.
#   $BE6E-$BE8F  the kill sound by enemy type ($BE9D LDA $BE6E,X, X = type AND
#                $7F, guarded by $BE99 CPX #$22).  Wave 6 recorded the
#                request; wave 8 plays it (src/sound.js).
#   $BFCE-$BFD9  the SHOT's own hit box, three 4-entry tables indexed by the
#                shot's SUBTYPE $0163,X ($BFF4 ADC $BFCE,Y = the X offset of the
#                hit point, $BFFD LDA $BFD2,Y = the WIDTH, $C006 ADC $BFD6,Y =
#                the Y offset).  The laser (subtype 1) is $30 wide where the
#                other two are $10 -- the one table entry that makes a laser
#                different from a shot before $C0AE's "the laser survives".
#   $BFC5-$BFCD  the type-$9A hit threshold by RANK $17 ($C0A1 CMP $BFC5,Y).
#                UNEXERCISED: $C099 fired 0 times in every measured run, so this
#                is exported to be indexed, not because a run has needed it.
WEAPON_BLOCKS = [
    ("params", 0xA0E0, 0xA0E9,
     "$A0EB LDA $A0E0,X / $A0F5 LDA $A0E3,X / $A0F0 LDA $A0E6,X, X = $44",
     "slot-A types, slot-B types, sfx ids -- three 3-entry tables"),
    ("missileStep", 0xA1A4, 0xA1AA,
     "$A1AF LDA $A1A4,Y / $A1CA ADC $A1A6,Y / $A1BD LDA $A1A8,Y, Y = 0 fly 1 crawl",
     "dy, dx high, dx low -- three 2-entry tables"),
    ("killSfx", 0xBE6E, 0xBE90,
     "$BE9D LDA $BE6E,X, X = $030C,Y AND $7F (guarded by CPX #$22)",
     "the sound $BE93 requests for the enemy it is killing; 0 = silent"),
    ("shotBoxes", 0xBFCE, 0xBFDA,
     "$BFF4 ADC $BFCE,Y / $BFFD LDA $BFD2,Y / $C006 ADC $BFD6,Y, Y = $0163,X",
     "the shot's hit-point X offset, its WIDTH, its Y offset, by subtype"),
    ("rankHits", 0xBFC5, 0xBFCE,
     "$C0A1 CMP $BFC5,Y, Y = $17 (the power-up rank)",
     "hits a type-$9A enemy takes before it dies, by rank"),
]


def weapon_tables(rom: Rom) -> dict:
    """The wave-6 tables, with both ends anchored on real opcodes."""
    # $A0E9 is `LDX $44`, the first instruction of the firing block, so the
    # parameter tables end exactly where the code begins.
    if rom.slice(0xA0E9, 2) != bytes((0xA6, 0x44)):
        raise SystemExit(f"ABORT: $A0E9 should be `LDX $44` (the firing block) but "
                         f"reads {rom.slice(0xA0E9, 2).hex(' ')} -- the $A0E0 "
                         f"parameter tables do not end where this claims")
    # $A1AA is `LDA #$0A`, the fly arm's metasprite id, immediately after the
    # three step tables. $A1A4 is DATA sitting between two branches ($A1A2
    # BNE $A1AC jumps over it), which is why it disassembles as garbage.
    if rom.slice(0xA1AA, 2) != bytes((0xA9, 0x0A)):
        raise SystemExit(f"ABORT: $A1AA should be `LDA #$0A` but reads "
                         f"{rom.slice(0xA1AA, 2).hex(' ')}")
    # $BFDA starts the ENEMY box tables collision/tables.json exports; the shot
    # boxes must stop there or the two caches overlap and disagree.
    if rom.slice(0xBFDA, 4) != bytes((0x10, 0x20, 0x30, 0x10)):
        raise SystemExit(f"ABORT: $BFDA should be the enemy widths 10 20 30 10 but "
                         f"reads {rom.slice(0xBFDA, 4).hex(' ')}")
    # The laser is the only subtype whose width differs, and the whole of
    # "a laser is wider" lives in that one byte.
    if rom.slice(0xBFD3, 1)[0] != 0x30:
        raise SystemExit(f"ABORT: $BFD3 (the laser's width) is "
                         f"${rom.slice(0xBFD3, 1)[0]:02X}, not $30")
    blocks = []
    for name, a, end, read_by, note in WEAPON_BLOCKS:
        blocks.append({"name": name, "rom": f"${a:04X}", "end": f"${end:04X}",
                       "fileOffset": rom.off(a), "len": end - a,
                       "readBy": read_by, "note": note,
                       "bytes": list(rom.slice(a, end - a))})
    return {
        "note": "CACHE. Rebuild with tools/export_assets.py; the authority is prg.bin.",
        "why": "src/weapons.js, src/collision.js and src/enemies.js read these at "
               "their CPU addresses; a read outside them is a loud throw rather "
               "than a plausible byte.",
        "blocks": blocks,
    }


# ==========================================================================
# SOUND (wave 8).  The $EC1E/$ED02 driver's tables and every sequence stream.
#
#   $833F-$8355  the three 7-entry tables the BGM selector $8357 reads with
#                Y = $19: the AREA theme code ($833F), the CHR select that ends
#                up in $2D ($8346), and the $3F page at which the area theme
#                replaces the $93 stage BGM ($834F).  Not "sound data" in the
#                narrow sense -- $8346 is a CHR bank -- but they are three
#                interleaved tables read by one routine and splitting them
#                would put two halves of one `LDY $19` in two files.
#   $ECB2-$ECB5  the four CHANNEL BASES, $B0 $C1 $D2 $E3, read as
#                `$EC42 LDX $ECB2,Y` with Y = record[0] / 4.  Four bytes, and
#                they are the reason index 0 is a crash: record 0's first byte
#                is $C0, so Y = 48 and the LDX runs 44 bytes off the end.
#   $EFB8-$FFC0  ONE block, on purpose, because the two tables inside it
#                OVERLAP and a port that split them would have to choose which
#                copy of the shared bytes is real:
#                  $EFB8-$EFCF  the 12 big-endian pitch periods, C..B
#                  $EFCD-$F08C  the 64 3-byte sound records (index 0..$3F)
#                  $F08D-$FFC0  the sequence streams themselves
#                $EFCD is $EFB8 + 21, i.e. the LOW byte of pitch entry 10 (A#,
#                $03C0) and the whole of entry 11 (B, $038A) ARE record 0.
#
# The driver reads streams through a 16-bit RAM pointer ($03/$04,X copied to
# $FA/$FB) and jumps around inside them with $FD/$FE, so src/sound.js reads
# bytes at CPU addresses exactly as $ED77 does -- a decoded "array of events"
# could express neither the sub-phrase calls nor the two-byte table overlap.
#
# WHERE THE BLOCK ENDS, AND WHY IT IS NOT ANCHORED ON THE STREAMS.  The obvious
# anchor is "walk every stream and stop at the highest byte any of them reads",
# and it was written, run, and REJECTED -- twice, both ways:
#
#   * as a reachability search (explore both arms of every $FE and $FD) it is an
#     over-approximation and walks into bytes the driver never parses as
#     commands: the stream at $FC66 "reaches" $01E2.
#   * as a simulation with a repeated-state test it desynchronises inside the
#     SAME stream and lands at $01E2 again.
#
# That is not a bug in the loop shape; it is the open item 00-recon-sound.md
# already records under "the $EF56 octave loop I could not close" -- a STATIC
# decode of dialect B goes out of phase somewhere in the $2E-$34 group and no
# run has been made that says where.  The PORT does not care, because it
# EXECUTES $ED77 rather than pre-decoding it, but an exporter must not pretend
# to a number it cannot derive.
#
# So the block is anchored on two things that ARE checkable without a decoder:
# the CPU vectors at $FFFA (asserted to hold $806A, the NMI handler this whole
# port is built around), and the run of $FF filler that starts at $FFC0 and
# runs to them.  The exported range covers the filler as well, deliberately:
# the last stream's terminating $FF IS the byte at $FFC0, so a block that
# stopped at "the last data byte" would throw on the stream that reads it.
SOUND_TABLE = 0xEFCD        # 3-byte records: apuOffset, ptrLo, ptrHi
SOUND_PITCH = 0xEFB8        # 12 big-endian 11-bit periods
SOUND_FILLER = 0xFFC0       # where the $FF run begins
SOUND_DATA_END = 0xFFFA     # the NMI/RESET/IRQ vectors
SOUND_CHANNEL_BASES = (0xB0, 0xC1, 0xD2, 0xE3)


def sound_tables(rom: Rom) -> dict:
    """The $EC1E/$ED02 driver's data, with every claim asserted on the bytes."""
    # $ECB2 is DATA sitting between $ECB1's RTS and $ECB6's TYA.
    bases = tuple(rom.slice(0xECB2, 4))
    if bases != SOUND_CHANNEL_BASES:
        raise SystemExit(f"ABORT: $ECB2 should be the channel bases "
                         f"{[hex(b) for b in SOUND_CHANNEL_BASES]} but reads "
                         f"{[hex(b) for b in bases]}")
    # $EFA6-$EFB7 is sub_EFA6 (advance the stream pointer); $EFB7 is its RTS, so
    # the pitch table starts exactly where the driver's code stops.
    if rom.b(0xEFB7) != 0x60:
        raise SystemExit(f"ABORT: $EFB7 should be sub_EFA6's RTS but reads "
                         f"${rom.b(0xEFB7):02X} -- the pitch table does not start "
                         f"where this claims")

    # ---- THE OVERLAP, ASSERTED SO NOBODY 'FIXES' IT -----------------------
    # $EFCD is $EFB8 + 21.  Pitch entry 10 (A#) is $EFCC-$EFCD and entry 11 (B)
    # is $EFCE-$EFCF, so record 0's three bytes ARE A#'s low byte and the whole
    # of B.  That is what makes any request with low 6 bits 0 a crash: $EC3A
    # reads $C0 as an APU offset and $EC42 indexes a 4-byte table with 48.
    rec0 = list(rom.slice(SOUND_TABLE, 3))
    pitch = [rom.b(SOUND_PITCH + 2 * i) << 8 | rom.b(SOUND_PITCH + 2 * i + 1)
             for i in range(12)]
    if rec0 != [pitch[10] & 0xFF, pitch[11] >> 8, pitch[11] & 0xFF]:
        raise SystemExit(f"ABORT: record 0 ${SOUND_TABLE:04X} reads "
                         f"{[hex(b) for b in rec0]}, which is NOT the tail of the "
                         f"pitch table (A# ${pitch[10]:04X}, B ${pitch[11]:04X}). "
                         f"The two tables are supposed to overlap by two bytes; "
                         f"if they no longer do, $EC1E's index-0 crash and "
                         f"src/sound.js's guard for it are both describing a ROM "
                         f"this is not.")
    if rec0[0] % 4 == 0 and rec0[0] // 4 < 4:
        raise SystemExit(f"ABORT: record 0's apuOffset ${rec0[0]:02X} is a VALID "
                         f"channel offset -- index 0 would no longer be the "
                         f"crash-shaped request $EC47 skips the priority test for")
    if pitch != sorted(pitch, reverse=True):
        raise SystemExit(f"ABORT: the pitch table {[hex(p) for p in pitch]} is not "
                         f"strictly descending C..B")

    # ---- the 63 real records ----------------------------------------------
    records = []
    for i in range(1, 0x40):
        off = rom.b(SOUND_TABLE + 3 * i)
        ptr = rom.w(SOUND_TABLE + 3 * i + 1)
        if off not in (0, 4, 8, 0x0C):
            raise SystemExit(f"ABORT: record ${i:02X}'s apuOffset is ${off:02X}; "
                             f"$EC3F/$EC42 turn it into an index into the 4-entry "
                             f"$ECB2 table, so only 0/4/8/$0C are reachable")
        if not (SOUND_PITCH <= ptr < SOUND_DATA_END):
            raise SystemExit(f"ABORT: record ${i:02X} points at ${ptr:04X}, "
                             f"outside the exported ${SOUND_PITCH:04X}-"
                             f"${SOUND_DATA_END - 1:04X}")
        first = rom.b(ptr)
        # $EC72-$EC7F: stream[0] == 0 forces $DF to 0, so $02,X stays 0 and the
        # stream is NEVER parsed -- it is a STOP marker.  $EC7A picks the parser
        # for the rest: high nibble $2 -> dialect A (raw periods), else B.
        kind = "stop" if first == 0 else ("A" if (first & 0xF0) == 0x20 else "B")
        records.append({"index": i, "apuOffset": off, "ptr": f"${ptr:04X}",
                        "channel": off // 4, "dialect": kind})
    stops = [r["index"] for r in records if r["dialect"] == "stop"]
    if stops != [0x3C, 0x3D, 0x3E, 0x3F]:
        raise SystemExit(f"ABORT: the STOP records are {stops}, not $3C-$3F -- "
                         f"$FC (stop all four) and $7D (stop pulse2+triangle) are "
                         f"requests for exactly those")

    # ---- the two anchors on the END of the block ---------------------------
    if rom.w(SOUND_DATA_END) != 0x806A:
        raise SystemExit(f"ABORT: the NMI vector at ${SOUND_DATA_END:04X} reads "
                         f"${rom.w(SOUND_DATA_END):04X}, not $806A -- the sound "
                         f"block is exported right up to the vectors and this is "
                         f"what says where they are")
    filler = rom.slice(SOUND_FILLER, SOUND_DATA_END - SOUND_FILLER)
    if set(filler) != {0xFF}:
        raise SystemExit(f"ABORT: ${SOUND_FILLER:04X}-${SOUND_DATA_END - 1:04X} "
                         f"is not $FF filler; the stream data does not stop where "
                         f"this claims and the block's shape is not what it says")
    if rom.b(SOUND_FILLER - 1) == 0xFF:
        raise SystemExit(f"ABORT: ${SOUND_FILLER - 1:04X} is $FF too, so the filler "
                         f"run starts earlier than ${SOUND_FILLER:04X}")

    # ---- $833F-$8355, the three 7-entry tables $8357 reads ------------------
    # $8357 is `LDY $19`, the first instruction of the BGM selector called from
    # the play arm at $9A5B on EVERY mode-5 play frame, so the tables end
    # exactly where the code begins.
    if rom.slice(0x8357, 2) != bytes((0xA4, 0x19)):
        raise SystemExit(f"ABORT: $8357 should be `LDY $19` (the BGM selector) but "
                         f"reads {rom.slice(0x8357, 2).hex(' ')} -- the $833F/"
                         f"$8346/$834F tables do not end where this claims")
    if rom.b(0x8346) != 0:
        raise SystemExit(f"ABORT: $8346[0] (stage 1's CHR select -> $2D) is "
                         f"${rom.b(0x8346):02X}, not 0. w_002D has compared clean "
                         f"at 0 on every scenario for the port's whole life.")

    blocks = [
        {"name": "bgm", "rom": "$833F", "end": "$8356",
         "fileOffset": rom.off(0x833F), "len": 0x8356 - 0x833F,
         "readBy": "$836F LDX $833F,Y / $8359 LDA $8346,Y / $8372 CMP $834F,Y, "
                   "Y = $19",
         "note": "three 7-entry tables: the per-stage AREA theme request code, "
                 "the CHR select $2D, and the $3F page at which the area theme "
                 "takes over from the $93 stage BGM",
         "bytes": list(rom.slice(0x833F, 0x8356 - 0x833F))},
        {"name": "chanBase", "rom": "$ECB2", "end": "$ECB6",
         "fileOffset": rom.off(0xECB2), "len": 4,
         "readBy": "$EC42 LDX $ECB2,Y, Y = record[0] / 4",
         "note": "pulse1 $B0, pulse2 $C1, triangle $D2, noise $E3 -- stride $11",
         "bytes": list(rom.slice(0xECB2, 4))},
        {"name": "data", "rom": f"${SOUND_PITCH:04X}", "end": f"${SOUND_DATA_END:04X}",
         "fileOffset": rom.off(SOUND_PITCH), "len": SOUND_DATA_END - SOUND_PITCH,
         "readBy": "$EF49 LDA $EFB8,Y (pitch), $EC3A/$EC53/$EC5A LDA $EFCD,Y "
                   "(records), $ED77/$EDBE/$EE82 LDA ($FA),Y (streams)",
         "note": "pitch table, sound table and every sequence stream, ONE block "
                 "because $EFCD-$EFCF is both record 0 and the pitch table's last "
                 "two entries",
         "bytes": list(rom.slice(SOUND_PITCH, SOUND_DATA_END - SOUND_PITCH))},
    ]
    return {
        "note": "CACHE. Rebuild with tools/export_assets.py; the authority is prg.bin.",
        "why": "src/sound.js reads these at their CPU addresses; the driver walks "
               "streams with a real 16-bit pointer ($03/$04,X -> $FA/$FB) and "
               "jumps inside them with $FD/$FE, so a decoded shape cannot hold it.",
        "channelBases": [f"${b:02X}" for b in SOUND_CHANNEL_BASES],
        "structStride": 0x11,
        "pitch": [f"${p:04X}" for p in pitch],
        "records": records,
        "blocks": blocks,
    }


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
        # $9A35: the rank countdown, indexed by $17 (rank), SAME for every stage.
        # $82's duration = rankCountdown[rank] x 256 frames. W24.
        "rankCountdown": [rom.b(0x9A35 + r) for r in range(8)],
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

    hud = canned_packets(rom)
    write(out, "hud/packets.json",
          json.dumps(hud, separators=(",", ":")).encode("utf-8"),
          "cache", "prg.bin via tables['queue.cannedPackets']", files)

    enemies = enemy_tables(rom)
    write(out, "enemies/tables.json",
          json.dumps(enemies, separators=(",", ":")).encode("utf-8"),
          "cache", "prg.bin, the ranges $A592-$ADAA / $ADC1-$ADE4 / $AE1C-$AE6F / "
                   "$AE71-$AE98", files)

    flow = flow_tables(rom)
    write(out, "flow/tables.json",
          json.dumps(flow, separators=(",", ":")).encode("utf-8"),
          "cache", "prg.bin, the ranges $9BCC-$9BEC / $9785-$979C", files)

    collision = collision_tables(rom)
    write(out, "collision/tables.json",
          json.dumps(collision, separators=(",", ":")).encode("utf-8"),
          "cache", "prg.bin, the ranges $BFDA-$BFE1 / $C0FA-$C100", files)

    weapons = weapon_tables(rom)
    write(out, "weapons/tables.json",
          json.dumps(weapons, separators=(",", ":")).encode("utf-8"),
          "cache", "prg.bin, the ranges $A0E0-$A0E8 / $A1A4-$A1A9 / $BE6E-$BE8F / "
                   "$BFCE-$BFD9 / $BFC5-$BFCD", files)

    sound = sound_tables(rom)
    write(out, "sound/tables.json",
          json.dumps(sound, separators=(",", ":")).encode("utf-8"),
          "cache", "prg.bin, the ranges $833F-$8355 / $ECB2-$ECB5 / $EFB8-$FFF9", files)

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
          f"terrain/stages.json {len(stages)} stages, "
          f"hud/packets.json {len(hud['packets'])} canned packets "
          f"({sum(len(p['bytes']) for p in hud['packets'])} script bytes), "
          f"enemies/tables.json {sum(b['len'] for b in enemies['blocks'])} bytes "
          f"in {len(enemies['blocks'])} ranges, "
          f"flow/tables.json {sum(b['len'] for b in flow['blocks'])} bytes "
          f"in {len(flow['blocks'])} ranges, "
          f"collision/tables.json {sum(b['len'] for b in collision['blocks'])} bytes "
          f"in {len(collision['blocks'])} ranges, "
          f"weapons/tables.json {sum(b['len'] for b in weapons['blocks'])} bytes "
          f"in {len(weapons['blocks'])} ranges, "
          f"sound/tables.json {sum(b['len'] for b in sound['blocks'])} bytes "
          f"in {len(sound['blocks'])} ranges "
          f"({len(sound['records'])} records, "
          f"{sum(1 for r in sound['records'] if r['dialect'] == 'stop')} of them STOP)")
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
