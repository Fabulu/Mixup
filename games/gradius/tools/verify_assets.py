#!/usr/bin/env python3
"""Prove `games/gradius/assets/` is what the cartridge says, by a second route.

`export_assets.py` reads the ROM through a `Rom` class that turns a CPU address
into a PRG index, and decodes terrain with `tools/oracle/terrain.py`.  That is
only as good as those two pieces of code.  So NOTHING here is shared with them:

  * the ROM is re-parsed from the raw `.nes` bytes, header first, and every
    value is fetched at the **file offset the manifest itself recorded** -- a
    path the exporter never took, since it only ever indexed the stripped PRG.
    The manifest's `fileOffset` is then re-derived a third way and compared, so
    a wrong offset formula cannot agree with itself.
  * the 2bpp CHR decoder here is written on binary STRINGS, not shifts.
  * the RLE block decoder and the collision derivation are transcribed again
    from the listing, and the collision bits are computed with the closed-form
    `(b6 << 1) | b7` instead of the ROM's ASL/ROR loop.
  * and, most importantly, a block of EXPECTED values is transcribed BY HAND
    from the measurement notes (`NOTES-terrain.md`, `NOTES-player.md`,
    `NOTES-render.md`) -- values that were measured on the running cartridge by
    a different workstream.  That is what catches the failure mode two automated
    readers cannot: both tools citing the same WRONG address.

Every check family has been watched to fail.  `--self-test` is how: it corrupts
one thing at a time in memory, re-runs everything, and asserts the family that
should notice does notice.  A family no mutation can redden is reported as
UNFALSIFIABLE and fails the run -- see docs/knowledge/03.

    python games/gradius/tools/verify_assets.py
    python games/gradius/tools/verify_assets.py --self-test
    python games/gradius/tools/verify_assets.py --verbose

Exit 0 = every check passed.  Non-zero = at least one mismatch.
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME_ROOT = HERE.parent
REPO_ROOT = GAME_ROOT.parents[1]
GAME_JSON = GAME_ROOT / "game.json"

# ==========================================================================
# TRANSCRIBED BY HAND FROM THE MEASUREMENT NOTES.  Independent of the ROM
# reader below and of the exporter.  If the exporter cites the wrong address,
# it will read self-consistent bytes and only this block will notice.
# ==========================================================================
# NOTES-terrain.md section 4 (the five per-stage tables, quoted there as bytes)
EXPECT_TABLES = {
    "stage.threshold": [0x40, 0x41, 0x40, 0x40, 0x40, 0x42, 0x40, 0x40],
    "stage.screenOrder": [0xCF4E, 0xCF6A, 0xCF78, 0xCF5C, 0xCF84, 0xDF86, 0xE707, 0xE707],
    "stage.layoutBase": [0xCF96, 0xD386, 0xD49E, 0xD18E, 0xCF96, 0xDDC6, 0xE547, 0xE547],
    "stage.patternTbl": [0xD778, 0xD778, 0xD60A, 0xD778, 0xD778, 0xE009, 0xE77A, 0xE77A],
    "stage.attrTbl": [0xD6F8, 0xD6F8, 0xD5EE, 0xD6F8, 0xD6F8, 0xDF98, 0xE718, 0xE718],
    "stage.endPage": [0x0E, 0x0E, 0x0E, 0x0E, 0x0D, 0x0C, 0x0D],
    "stage.bossPage": [0x0C, 0x0C, 0x0C, 0x0C, 0x0B, 0x0B, 0x0C],
    "terrain.fillTbl": [0x00, 0x00, 0x3A, 0xDC, 0x40, 0xDD, 0xBB, 0x00,
                        0x00, 0x00, 0x00, 0xED, 0xEE, 0xE3, 0xEB, 0xE5],
    "terrain.collMasks": [0x03, 0x0C, 0x30, 0xC0],
    "terrain.pageBytes": [0x05, 0x06, 0x20, 0x24, 0x00, 0x04],
    "terrain.screenStride": [0x0000, 0x0038, 0x0070, 0x00A8, 0x00E0, 0x0118, 0x0150, 0x0188],
    "queue.incBits": [0x60, 0x00, 0x04, 0x00, 0x04, 0x00],
    "chr.latchTable": [0x30, 0x32, 0x31, 0x33],          # NOTES-render.md section 4
    "player.weaponTbl": [0x06, 0x07, 0x06, 0x06, 0x07, 0x24, 0x01, 0x02, 0x01],
    # NOTES-terrain.md section 6.  Sparse: only stage 1's pointer is documented.
    "enemy.stageStreams": {0: 0xA7DE},
    "enemy.stage1Streams": [0xA844, 0xA859, 0xA87A, 0xA8A3, 0xA8C6, 0xA8ED, 0xA8ED, 0xA8ED],
}
# NOTES-player.md / NOTES-terrain.md / NOTES-render.md, the operand values
EXPECT_CONSTS = {
    "player.deadStatus": 0x02, "player.speedAdd": 0x02, "player.speedCap": 0x10,
    "player.speedCapValue": 0x10,
    "player.xMax": 0xF0, "player.xMaxStore": 0xF0,      # 240, NOT PROBE.md's 220
    "player.xMin": 0x10, "player.xMinStore": 0x10,
    "player.yMaxPre": 0xC0, "player.yMaxPost": 0xC0, "player.yMaxStore": 0xC0,
    "player.yMinPre": 0x10, "player.yMinPost": 0x10, "player.yMinStore": 0x10,
    "player.ringLen": 0x18, "player.ringWrap": 0x18, "player.tiltPeriod": 0x08,
    "camera.stepSub": 0x80, "camera.stepFast": 0x04,
    "render.scrollY": 0x0C, "render.bandBCtrlMask": 0xFC,
    "render.bandBChrSelector": 0x02,
}
# NOTES-render.md section 5: palette RAM read out of the running cartridge.
# These are PPU-RAM measurements, not ROM reads -- which is exactly why they can
# adjudicate whether the exporter picked the right bytes out of the PRG.
EXPECT_PAL = {
    "gameplay.bg01": [0x0F, 0x12, 0x30, 0x0F, 0x0F, 0x27, 0x30, 0x0F],
    "gameplay.sprites": [0x0F, 0x0C, 0x26, 0x30, 0x0F, 0x0C, 0x2C, 0x30,
                         0x0F, 0x21, 0x26, 0x30, 0x0F, 0x06, 0x26, 0x30],
    "bgHigh.entry8": [0x0F, 0x19, 0x2A, 0x30, 0x0F, 0x07, 0x17, 0x26],
    # title screen, sparse: only bg0 and bg2 are quoted in the notes
    "title.bg": {0: 0x0F, 1: 0x30, 2: 0x30, 3: 0x0F, 8: 0x0F, 9: 0x26, 10: 0x06, 11: 0x1C},
    "boot.full": {0: 0x0F, 1: 0x12, 2: 0x30, 3: 0x0F, 4: 0x0F, 5: 0x27, 6: 0x30, 7: 0x0F,
                  16: 0x0F, 17: 0x0C, 18: 0x26, 19: 0x30, 28: 0x0F, 29: 0x06, 30: 0x26,
                  31: 0x30},
}
# THE TEN CANNED PACKETS STAGE 1 ACTUALLY USES, transcribed BY HAND from the
# $0700 images the CARTRIDGE produced -- not from the listing.
#
# Measured with tools/oracle/queue.py (queue.lua dumps $0700 at the streamer's
# gate $9D83, after $9AC7 JSR $8898 has filled it):
#
#   python games/gradius/tools/oracle/queue.py --frames 700 \
#       --script "200:,10:S,490:" --from 566 --to 578 --packets
#
#   f572  n= 8  01 23 A2 00 61 00 33 FF                 st_88B6, index $11
#   f574  n=14  01 23 B4 64 65 00 30 30 35 30 30 30 30 FF    st_88F6, index $12
#   f576  n=39  01 23 84 09 0A 0B 0C | 0D 0E 0F 10 | 11 12 13 14 | 15 16 17 18
#               | 19 1A 1B 1C | 1D 62 63 1F | FF | 01 23 F8 00 00 00 00 00 00
#               00 FF                st_89E3 chaining $0F,$15,$16,$17,$18,$1B,
#                                    $863D's $FF, then $8A30's $1A
#   f578  n=14  01 23 A8 31 66 00 30 30 30 30 30 30 30 FF    st_892C, index $13
#
# The leading $01 is $85E8's mode byte and the digits are st_88F6/st_892C's own
# output, so what is transcribed below is the emitted run with those stripped
# and the control code restored ($FF = the run stayed open, $FE = the emitter
# appended the terminator).  A pointer table cited one entry out still decodes
# into plausible bytes of the same LENGTH for six of these ten -- that is why
# the check is on the bytes and why the recon's length-only version was weak.
EXPECT_HUD_STREAMS = {
    0x0F: [0x23, 0x84, 0x09, 0x0A, 0x0B, 0x0C, 0xFF],           # power-bar head
    0x11: [0x23, 0xA2, 0x00, 0x00, 0x00, 0x00, 0xFE],           # lives
    0x12: [0x23, 0xB4, 0x64, 0x65, 0x00, 0xFF],                 # TOP score label
    0x13: [0x23, 0xA8, 0x31, 0x66, 0x00, 0xFF],                 # 1UP score label
    0x15: [0x0D, 0x0E, 0x0F, 0x10, 0xFF],                       # MISSILE cell
    0x16: [0x11, 0x12, 0x13, 0x14, 0xFF],                       # DOUBLE cell
    0x17: [0x15, 0x16, 0x17, 0x18, 0xFF],                       # LASER cell
    0x18: [0x19, 0x1A, 0x1B, 0x1C, 0xFF],                       # OPTION cell
    0x1A: [0x23, 0xF8, 0x00, 0x00, 0x00, 0x00,                  # the attribute row
           0x00, 0x00, 0x00, 0xFE],
    0x1B: [0x1D, 0x62, 0x63, 0x1F, 0xFF],                       # ?/SHIELD cell
}
# $8A22 substitutes index $19 for whichever cell is OWNED, so it is the one
# stage-1 packet whose bytes no measured frame of this corpus contains ($42 = 0
# and $41/$44/$45/$46 all 0 throughout).  Listing-only, and said so.
EXPECT_HUD_LISTING_ONLY = {0x19: [0x1D, 0x1E, 0x1E, 0x1F, 0xFF]}

# ======================================================================
# ENEMIES, TRANSCRIBED FROM MEASUREMENTS ON THE RUNNING CARTRIDGE.
#
# None of this is read off a listing.  Each entry names the run that produced
# it, and every one of them is a fact an exporter citing a WRONG-BUT-PLAUSIBLE
# address cannot satisfy -- which is the only failure mode two automated readers
# share (docs/knowledge/03).
#
# 1. Stage 0, chunk 0's ten wave records.  00-recon-enemies.md section 1 hooked
#    $A335 and recorded, ten for ten, the game frame, the 16-bit scroll and the
#    wave cursor AFTER each record fired:
#        f378 $0020 ->$A846   f506 $0060 ->$A848   f634 $00A0 ->$A84A
#        f762 $00E0 ->$A84C   f890 $0120 ->$A84E   f954 $0140 ->$A850
#       f1018 $0160 ->$A852  f1082 $0180 ->$A854  f1146 $01A0 ->$A856
#       f1210 $01C0 ->$A858, then $FF.
#    A record is [trigger, cmd] and fires at ($61<<8) + trigger*2, so the
#    triggers below are those scrolls halved and the cursor steps prove the
#    2-byte stride.  Re-measured for wave 3 on script "200:,10:S,190:,1500:RD"
#    with the same ten frames.
EXPECT_ENEMY_CHUNK0 = [0x10, 0x80, 0x30, 0x81, 0x50, 0x80, 0x70, 0x81,
                       0x90, 0x80, 0xA0, 0x82, 0xB0, 0x82, 0xC0, 0x82,
                       0xD0, 0x82, 0xE0, 0x80, 0xFF]
# 2. Chunk 1 begins at $A859 and its first record fired at scroll $0200, game
#    frame 1339 (both runs).  Its first two bytes are therefore [$00, $81].
EXPECT_ENEMY_CHUNK1_HEAD = [0x00, 0x81]
# 3. The formation descriptors, read out of $64-$67 by an exec hook ON $A3E4
#    while the cartridge ran -- so these are the bytes the ROUTINE received, not
#    bytes somebody indexed.  $80/$81/$82 from 00-recon-enemies.md section 3;
#    $83/$84 from this wave's 1900-frame RD run (fired f1722 and f1786).
EXPECT_ENEMY_DESCRIPTORS = {
    0x80: [0x01, 0x05, 0x00, 0x00],
    0x81: [0x01, 0x05, 0x01, 0x00],
    0x82: [0x00, 0x08, 0x02, 0x04],
    0x83: [0x05, 0x04, 0x03, 0x02],
    0x84: [0x05, 0x04, 0x04, 0x03],
}
# 4. Formation 0 ($66 = 0): FOUR members, spawn X $F0, first Y $2A -- measured
#    as four slots filling and as the X the slots held.  Pattern 0 ($67 = 0):
#    delay 10, dY 0 -- measured as members appearing on frames 378, 389, 400,
#    411, i.e. delay+1 apart, all at the same Y.
EXPECT_ENEMY_FORM0 = [0xF4, 0x2A]          # (b0 AND $0F)=4 members, (b0 AND $F0)=$F0
EXPECT_ENEMY_PATTERN0 = [0x0A, 0x00, 0xC8]  # delay, dY, style
# 5. The status animation groups.  MEASURED as metasprite histograms per slot:
#    status 1 produced 12/13/14/15 and status 5 produced 32/33/34/35
#    (00-recon-enemies.md section 5, slotAnim.17).
EXPECT_ENEMY_ANIM = {1: [0x0C, 0x0D, 0x0E, 0x0F], 5: [0x20, 0x21, 0x22, 0x23]}
# 6. The dispatch table, at the three entries proved by COUNTING rather than by
#    reading: hits on $B0AF equalled typeHist[$05]+typeHist[$85] exactly, ditto
#    $B26C for $08/$88 and $B205 for $04/$84 (recon section 5; re-measured this
#    wave: hdlr04 570 == 10+560, hdlr05 4840 == 32+4808, hdlr08 3954 == 20+3934).
#    Entries 0 and 31 are the RTS at $AE70, which is also the byte after the
#    table -- that is what makes the table exactly 42 entries long.
EXPECT_ENEMY_DISPATCH = {0: 0xAE70, 4: 0xB205, 5: 0xB0AF, 8: 0xB26C, 31: 0xAE70}
# 7. The explosion scripts.  Script 0 produced metasprites 38,39,40 for a type
#    $85 kill and script 1 produced 41,42,43,44 for a type $88 kill -- both
#    measured (recon section 7).  $26 = 38, $29 = 41.
EXPECT_ENEMY_EXPL = {0: [0x26, 0x27, 0x28, 0x00],
                     1: [0x29, 0x2A, 0x2B, 0x2C, 0x00]}

# ---- FLOW ($9BCC/$9BD4 start positions, $9785 button codes) -- wave 4 -------
# 1. THE START POSITION, MEASURED TWICE ON THE CARTRIDGE and not read off the
#    table: the boot intro's $9B3E (game frame 283 of "200:,10:S,190:") and the
#    respawn's (frame 614 of "200:,10:S,190:,300:R", where $0360 stepped
#    174 -> 80 on that single frame) both left $0360 = 80 and $0320 = 96 with
#    $19 = 0 and $24 = 0.  $9B95 `AND #$F0` and $9BAB-$9BAE `ASL x4` mean ONE
#    byte carries both, so 80/96 pins that byte to $65 exactly -- there is no
#    other value that produces the pair.
EXPECT_FLOW_START = {(0, 0): (80, 96)}      # ($19, $24) -> (X, Y)
# 2. The pause screen's button string.  LISTING ONLY -- no run has entered it.
#    Recorded so a shifted table cannot pass, and marked so nobody reads it as
#    measured.  In this ROM's own button bits ($0005: RIGHT $01 LEFT $02 DOWN
#    $04 UP $08 START $10 SELECT $20 B $40 A $80) it is UP UP DOWN DOWN LEFT
#    RIGHT LEFT RIGHT B A -- the Konami code.
EXPECT_FLOW_PAUSE_CODE = [0x08, 0x08, 0x04, 0x04, 0x02, 0x01, 0x02, 0x01,
                          0x40, 0x80]

# ---- COLLISION ($BFDA/$BFDE boxes, $C0FA explosion walk) -- wave 5 ----------
# 1. THE EXPLOSION WALK, MEASURED per frame from the corpus's own right-wall
#    artifact ($0120 at the $80B5 sample): $2D at f494, $2E at 504, $2F at 514,
#    $30 at 524, $30 AGAIN at 534, and 0 at 544 -- at which frame $0140 read
#    255, which is $C0F1's `STA $0140` falling through into $C0F4's `DEC`.  Six
#    entries, one per ten frames; the seventh is never read because the $00
#    stops the walk ($C0E9 BNE).
EXPECT_COLL_EXPLOSION = [0x2D, 0x2E, 0x2F, 0x30, 0x30, 0x00]
# 2. THE BOX, MEASURED as a CONSEQUENCE rather than read off the table.  The one
#    death in the whole corpus is right-wall f493 and its own arghook reports
#    box class $0460,Y = 0.  From the artifact:
#       f492  player (173,96)  enemy (161,98)  dx = (173+4)-161 = 16  REJECTED
#       f493  player (174,96)  enemy (164,98)  dx = (174+4)-164 = 14  ACCEPTED
#       f493  dy = (96+8)-98-1 = 5  ACCEPTED   ($C16E's arghook reports a=05)
#    `$C127 CMP $BFDA,X / BCS` rejects dx >= width, so the cartridge pins
#    14 < width[0] <= 16 and height[0] > 5.  That is all the corpus can say and
#    it is stated as such -- the byte-for-byte re-read above is what holds the
#    table to $10/$20/$30/$10 and $10/$20/$30/$02.
EXPECT_COLL_BOX0 = {"dxRejected": 16, "dxAccepted": 14, "dyAccepted": 5}

# NOTES-terrain.md section 4, "Stage 1's shape" -- an end-to-end expectation on
# the DECODED cache, not on any single table.
EXPECT_STAGE1 = {
    "endPage": 0x0E,
    "bossPage": 0x0C,
    "pageOrder": [0, 0, 0, 0, 1, 6, 2, 3, 4, 5, 6, 7, 8, 0],
    "screens": 9,
    "blockIds": 40,
}

# The ROM's own constants, re-transcribed (export gets these from terrain.py).
SCREEN_STRIDE = 0x38          # $9D4F
FILL_TBL = 0x9D73             # $9F26 LDA $9D73,Y
CHR_BANK = 0x2000
TILE_BYTES = 16


# ======================================================== the ROM, re-parsed ==
class RawRom:
    """The .nes file, parsed here from scratch and addressed by FILE OFFSET.

    Deliberately not the exporter's model.  Nothing in this class knows about
    $8000; the CPU-address arithmetic appears exactly once, in `off()`, so the
    manifest's own recorded offsets can be used as the primary way in.
    """

    def __init__(self, path: Path):
        self.path = path
        self.data = path.read_bytes()
        self.sha1 = hashlib.sha1(self.data).hexdigest()
        assert self.data[0:4] == b"NES\x1a", "not an iNES image"
        n_prg, n_chr, f6 = self.data[4], self.data[5], self.data[6]
        self.prg_off = 16 + (512 if f6 & 0x04 else 0)
        self.prg_len = n_prg * 16384
        self.chr_off = self.prg_off + self.prg_len
        self.chr_len = n_chr * 8192
        self.mapper = (f6 >> 4) | (self.data[7] & 0xF0)
        self.mirroring = "vertical" if f6 & 1 else "horizontal"

    def off(self, cpu: int) -> int:
        """CPU $8000-$FFFF -> file offset.  Mapper 3 pins the whole PRG."""
        return self.prg_off + (cpu - 0x8000)

    def at(self, off: int, n: int = 1) -> bytes:
        return self.data[off:off + n]

    def u8(self, cpu: int) -> int:
        return self.data[self.off(cpu)]

    def u16(self, cpu: int) -> int:
        o = self.off(cpu)
        return self.data[o] | (self.data[o + 1] << 8)


# =========================================== independent decoders (see docstring)
def chr_tile_pixels(tile: bytes) -> list[int]:
    """16 planar bytes -> 64 pixel indices, via binary strings.

    Same rule as the exporter's shift-based decoder ($0000-$1FFF is 2bpp: eight
    plane-0 rows then eight plane-1 rows, bit 7 leftmost, px = p0 | p1<<1) but
    with none of the same arithmetic, so a shift/mask slip cannot be shared.
    """
    px = []
    for y in range(8):
        b0 = format(tile[y], "08b")
        b1 = format(tile[y + 8], "08b")
        px.extend(int(b0[x]) + 2 * int(b1[x]) for x in range(8))
    return px


def rle_block(rom: RawRom, src: int) -> list[int]:
    """$9EBE-$9F4C again, transcribed from the listing a second time.

    4 rows of 4 tiles.  A byte is a literal tile if it is $00 or has a non-zero
    high nibble; otherwise it is a control code:
        $09 / $0A   fill the rest of the row alternating $41,$40 / $40,$41
        $07 / $08   emit $ED / $00 twice and keep decoding the row
        others      fill the rest of the row with $9D73[code]
    A "fill the rest of the row" code consumes ONE source byte: $9EEE stashes Y
    and $9F32 restores it.
    """
    tiles: list[int] = []
    i = src
    for _row in range(4):
        need = 4
        while need:
            code = rom.u8(i)
            i = (i + 1) & 0xFFFF
            if code == 0x00 or (code >> 4) != 0:              # $9EE7 / $9EEB
                tiles.append(code)
                need -= 1
                continue
            resume = i                                        # $9EEE STY $9B
            if code in (0x09, 0x0A):                          # $9F02
                pair = [0x41, 0x40] if code == 0x09 else [0x40, 0x41]
                tiles.extend(pair[k & 1] for k in range(need))
                need, i = 0, resume                           # $9F32 LDY $9B
                break
            if code in (0x07, 0x08):                          # $9F12 / $9F16
                tiles.extend([0xED if code == 0x07 else 0x00] * 2)
                need -= 2
                if need <= 0:
                    # $9F24's BNE tests the queue cursor X, not the tile count,
                    # so the ROM would run on.  No block in any stage does this.
                    raise RuntimeError(f"block ${src:04X}: $07/$08 ran the row out")
                continue
            tiles.extend([rom.u8(FILL_TBL + code)] * need)    # $9F26
            need, i = 0, resume
            break
    assert len(tiles) == 16
    return tiles


def collision_bytes(tiles: list[int], threshold: int) -> list[int]:
    """$9F55-$9F92, closed form instead of the ROM's ASL/ROR loop.

    The ROM shifts the top two bits of each (thresholded) tile byte into an
    accumulator with ASL A / ROR $99, twice per tile, four tiles per column.
    Because ROR feeds the carry in at bit 7, the FIRST bit shifted in ends at
    bit 0, so a tile's field is (b6 << 1) | b7 and tile row 0 lands in bits 0-1.
    Writing it that way -- rather than simulating the shifts -- is the point:
    if the shift simulation in terrain.py were subtly wrong, this would not
    repeat the mistake.
    """
    out = []
    for col in range(4):
        acc = 0
        for row in range(4):
            t = tiles[row * 4 + col]
            a = 0x80 if t >= threshold else t                 # $9F69 / $9F6D
            acc |= ((((a >> 6) & 1) << 1) | ((a >> 7) & 1)) << (2 * row)
        out.append(acc)
    return out


# =================================================================== state ==
class State:
    """Everything under test, loaded once so --self-test can corrupt a copy."""

    def __init__(self, assets: Path, rom: RawRom):
        self.assets = assets
        self.rom = rom
        self.man = json.loads((assets / "manifest.json").read_text(encoding="utf-8"))
        self.blob: dict[str, bytes] = {}
        for f in self.man["files"]:
            self.blob[f["path"]] = (assets / f["path"]).read_bytes()
        self.stages = json.loads(self.blob["terrain/stages.json"].decode("utf-8"))
        self.hud = json.loads(self.blob["hud/packets.json"].decode("utf-8"))
        self.enemies = json.loads(self.blob["enemies/tables.json"].decode("utf-8"))
        self.flow = json.loads(self.blob["flow/tables.json"].decode("utf-8"))
        self.coll = json.loads(self.blob["collision/tables.json"].decode("utf-8"))


def vals_at(rom: RawRom, off: int, n: int, unit: str) -> list[int]:
    """Read n values at a FILE OFFSET -- the manifest's own claim about itself."""
    if unit == "u8":
        return list(rom.at(off, n))
    b = rom.at(off, 2 * n)
    return [b[2 * i] | (b[2 * i + 1] << 8) for i in range(n)]


def cmp_expected(got: list[int], want) -> str | None:
    """`want` is a full list or a sparse {index: value} dict."""
    items = enumerate(want) if isinstance(want, list) else want.items()
    for i, v in items:
        i = int(i)
        if i >= len(got):
            return f"index {i} missing (len {len(got)})"
        if got[i] != v:
            return f"[{i}] = ${got[i]:02X}, notes say ${v:02X}"
    return None


# ================================================================== checks ==
# Each returns a list of failure strings.  Empty list = the check passed.

def check_rom(st: State) -> list[str]:
    bad = []
    want = json.loads(GAME_JSON.read_text(encoding="utf-8"))["rom"]
    if st.rom.sha1 != want["sha1"]:
        bad.append(f"ROM sha1 {st.rom.sha1} != game.json {want['sha1']}")
    if st.man["rom"]["sha1"] != st.rom.sha1:
        bad.append(f"manifest rom.sha1 {st.man['rom']['sha1']} != file {st.rom.sha1}")
    if st.rom.mapper != want["ines"]["mapper"]:
        bad.append(f"mapper {st.rom.mapper} != game.json {want['ines']['mapper']}")
    if st.rom.mirroring != want["ines"]["mirroring"]:
        bad.append(f"mirroring {st.rom.mirroring} != {want['ines']['mirroring']}")
    if st.rom.prg_len != 0x8000 or st.rom.chr_len != 0x8000:
        bad.append(f"PRG {st.rom.prg_len} CHR {st.rom.chr_len}: not 32+32 KB")
    return bad


def check_files(st: State) -> list[str]:
    """Sizes, hashes, and that the raw blobs really are slices of the cartridge."""
    bad = []
    for f in st.man["files"]:
        data = st.blob[f["path"]]
        if len(data) != f["bytes"]:
            bad.append(f"{f['path']}: {len(data)} B, manifest says {f['bytes']}")
        h = hashlib.sha1(data).hexdigest()
        if h != f["sha1"]:
            bad.append(f"{f['path']}: sha1 {h[:12]} != manifest {f['sha1'][:12]}")
    r = st.rom
    if st.blob["prg.bin"] != r.at(r.prg_off, r.prg_len):
        bad.append("prg.bin is not the cartridge's PRG (header-stripping is wrong)")
    if st.blob["chr.bin"] != r.at(r.chr_off, r.chr_len):
        bad.append("chr.bin is not the cartridge's CHR")
    banks = b"".join(st.blob[f"chr/bank{i}.bin"] for i in range(r.chr_len // CHR_BANK))
    if banks != st.blob["chr.bin"]:
        bad.append("chr/bank*.bin do not concatenate back to chr.bin")
    # The iNES header itself must NOT have leaked into the raw exports.
    if st.blob["prg.bin"][:4] == b"NES\x1a":
        bad.append("prg.bin still starts with the iNES header")
    return bad


def check_offsets(st: State) -> list[str]:
    """Every recorded fileOffset must be where the cited $address actually is."""
    bad = []
    for kind in ("tables", "constants", "palettes"):
        for name, e in st.man[kind].items():
            addr = int(e["rom"].lstrip("$"), 16)
            want = st.rom.off(addr)
            if e["fileOffset"] != want:
                bad.append(f"{kind}.{name}: fileOffset {e['fileOffset']} but "
                           f"{e['rom']} is at {want}")
    return bad


def check_tables(st: State) -> list[str]:
    """Re-read every table at its recorded offset, then judge it against the notes."""
    bad = []
    for name, e in st.man["tables"].items():
        got = vals_at(st.rom, e["fileOffset"], e["n"], e["unit"])
        if got != e["values"]:
            bad.append(f"{name}: manifest {e['values'][:6]}... != ROM {got[:6]}...")
        nbytes = e["n"] * (1 if e["unit"] == "u8" else 2)
        h = hashlib.sha1(st.rom.at(e["fileOffset"], nbytes)).hexdigest()
        if h != e["sha1"]:
            bad.append(f"{name}: slice sha1 {h[:12]} != manifest {e['sha1'][:12]}")
        if name in EXPECT_TABLES:
            why = cmp_expected(e["values"], EXPECT_TABLES[name])
            if why:
                bad.append(f"{name}: {why}  <- the notes and the export disagree")
    missing = set(EXPECT_TABLES) - set(st.man["tables"])
    if missing:
        bad.append(f"tables the notes describe but the export dropped: {sorted(missing)}")
    return bad


def check_constants(st: State) -> list[str]:
    """An immediate operand is only itself while its OPCODE is still there."""
    bad = []
    for name, e in st.man["constants"].items():
        off = e["fileOffset"]
        op = st.rom.data[off]
        want_op = int(e["opcode"].lstrip("$"), 16)
        if op != want_op:
            bad.append(f"{name}: {e['rom']} holds ${op:02X}, manifest claims "
                       f"${want_op:02X} ({e['mnemonic']})")
            continue
        v = st.rom.data[off + 1]
        if v != e["value"]:
            bad.append(f"{name}: operand ${v:02X} != manifest ${e['value']:02X}")
        if name in EXPECT_CONSTS and v != EXPECT_CONSTS[name]:
            bad.append(f"{name}: ${v:02X} but the notes measured "
                       f"${EXPECT_CONSTS[name]:02X}")
    missing = set(EXPECT_CONSTS) - set(st.man["constants"])
    if missing:
        bad.append(f"constants the notes describe but the export dropped: {sorted(missing)}")
    return bad


def check_palettes(st: State) -> list[str]:
    """Colours re-read, packet pointers re-followed, and compared with PPU RAM."""
    bad = []
    tbl = st.man["tables"]["queue.cannedPackets"]
    for name, e in st.man["palettes"].items():
        got = list(st.rom.at(e["fileOffset"], len(e["colours"])))
        if got != e["colours"]:
            bad.append(f"palette {name}: manifest {e['colours']} != ROM {got}")
        # the canned-packet table must really point at this blob
        idx = e["packet"]["cannedPacketIndex"]
        ptr = st.rom.u16(int(tbl["rom"].lstrip("$"), 16) + 2 * idx)
        if ptr != int(e["packet"]["rom"].lstrip("$"), 16):
            bad.append(f"palette {name}: $864E[{idx}] -> ${ptr:04X}, manifest says "
                       f"{e['packet']['rom']}")
        if name in EXPECT_PAL:
            why = cmp_expected(got, EXPECT_PAL[name])
            if why:
                bad.append(f"palette {name}: {why}  <- does not match the palette "
                           f"RAM measured on the cartridge")
        if any(c > 0x3F for c in got):
            bad.append(f"palette {name}: ${max(got):02X} is not a NES colour index")
    missing = set(EXPECT_PAL) - set(st.man["palettes"])
    if missing:
        bad.append(f"palettes the notes describe but the export dropped: {sorted(missing)}")
    return bad


def check_chr(st: State) -> list[str]:
    """Re-decode all 2048 tiles from chr.bin with the string decoder."""
    bad = []
    meta = st.man["chrTiles"]
    cache = st.blob[meta["file"]]
    chr_bytes = st.blob["chr.bin"]
    n = len(chr_bytes) // TILE_BYTES
    if n != meta["tiles"] or len(cache) != n * 64:
        bad.append(f"tiles.u8 is {len(cache)} B for {n} tiles; manifest says "
                   f"{meta['tiles']} x {meta['bytesPerTile']}")
        return bad
    wrong = 0
    first = None
    for t in range(n):
        want = chr_tile_pixels(chr_bytes[t * TILE_BYTES:(t + 1) * TILE_BYTES])
        got = list(cache[t * 64:(t + 1) * 64])
        if got != want:
            wrong += 1
            if first is None:
                first = (t, next(i for i in range(64) if got[i] != want[i]))
    if wrong:
        bad.append(f"tiles.u8: {wrong} of {n} tiles differ, first tile {first[0]} "
                   f"pixel {first[1]}")
    if max(cache) > 3:
        bad.append(f"tiles.u8 holds ${max(cache):02X}; 2bpp pixels are 0..3")
    return bad


def check_terrain(st: State) -> list[str]:
    """Re-expand all seven stages: chain, RLE, attributes, collision."""
    bad = []
    rom = st.rom
    for s in st.stages["stages"]:
        n = s["stage"]
        tag = f"stage {n + 1}"
        thr = rom.u8(0x9FB4 + n)
        if thr != s["threshold"]:
            bad.append(f"{tag}: threshold ${s['threshold']:02X} != ROM ${thr:02X}")
        for field, addr in (("endPage", 0x98FD), ("bossPage", 0x9A3D)):
            v = rom.u8(addr + n)
            if v != s[field]:
                bad.append(f"{tag}: {field} {s[field]} != ROM {v}")
        # the page -> screen chain, $9E38-$9E6B, re-walked
        order = [rom.u8(rom.u16(0x9FBC + 2 * n) + p) for p in range(s["endPage"])]
        if order != s["pageOrder"]:
            bad.append(f"{tag}: pageOrder {s['pageOrder']} != ROM {order}")
        seen_screens, seen_blocks = set(), set()
        for page, raw_s in enumerate(order):
            eff, sc = n, raw_s
            if n != 0:                                        # $9E4C
                if sc == 0:
                    eff, sc = 0, 1
                sc -= 1
            key = f"{eff}:{sc}"
            seen_screens.add(key)
            if key not in s["screens"]:
                bad.append(f"{tag}: page {page} -> screen {key}, missing from the cache")
                continue
            base = rom.u16(0x9FCC + 2 * eff) + SCREEN_STRIDE * sc
            if s["screens"][key]["rom"] != f"${base:04X}":
                bad.append(f"{tag}: screen {key} at {s['screens'][key]['rom']}, "
                           f"ROM says ${base:04X}")
            ids = list(rom.at(rom.off(base), SCREEN_STRIDE))
            if ids != s["screens"][key]["blockIds"]:
                bad.append(f"{tag}: screen {key} layout differs from the ROM")
            ethr = rom.u8(0x9FB4 + eff)
            for bid in set(ids):
                bkey = f"{eff}:{bid}"
                seen_blocks.add(bkey)
                blk = s["blocks"].get(bkey)
                if blk is None:
                    bad.append(f"{tag}: block {bkey} missing from the cache")
                    continue
                ptr = rom.u16(rom.u16(0x9FDC + 2 * eff) + 2 * bid)
                if blk["rom"] != f"${ptr:04X}":
                    bad.append(f"{tag}: block {bkey} cites {blk['rom']}, ROM ${ptr:04X}")
                tiles = rle_block(rom, ptr)
                if tiles != blk["tiles"]:
                    bad.append(f"{tag}: block {bkey} tiles differ "
                               f"(cache {blk['tiles'][:4]}... rom {tiles[:4]}...)")
                attr = rom.u8(rom.u16(0x9FEC + 2 * eff) + bid)
                if attr != blk["attr"]:
                    bad.append(f"{tag}: block {bkey} attr ${blk['attr']:02X} != "
                               f"ROM ${attr:02X}")
                coll = collision_bytes(tiles, ethr)
                if coll != blk["collision"]:
                    bad.append(f"{tag}: block {bkey} collision {blk['collision']} != "
                               f"re-derived {coll}")
        extra = set(s["screens"]) - seen_screens
        if extra:
            bad.append(f"{tag}: cache holds screens no page reaches: {sorted(extra)}")
        extra = set(s["blocks"]) - seen_blocks
        if extra:
            bad.append(f"{tag}: cache holds blocks no screen uses: {sorted(extra)[:6]}")
        # $9F4F: LDY $19 / CPY #$04 / BEQ -- only stage index 4 skips collision
        if s["collisionWritten"] != (n != 4):
            bad.append(f"{tag}: collisionWritten {s['collisionWritten']}, but $9F4F "
                       f"skips exactly stage index 4")
    # ...and the end-to-end shape of stage 1, from NOTES-terrain.md section 4
    s1 = next(s for s in st.stages["stages"] if s["stage"] == 0)
    for k in ("endPage", "bossPage", "pageOrder"):
        if s1[k] != EXPECT_STAGE1[k]:
            bad.append(f"stage 1 {k} = {s1[k]}, the notes measured {EXPECT_STAGE1[k]}")
    if len(s1["screens"]) != EXPECT_STAGE1["screens"]:
        bad.append(f"stage 1 uses {len(s1['screens'])} screens, the notes say "
                   f"{EXPECT_STAGE1['screens']}")
    if len(s1["blocks"]) != EXPECT_STAGE1["blockIds"]:
        bad.append(f"stage 1 uses {len(s1['blocks'])} block ids, the notes say "
                   f"{EXPECT_STAGE1['blockIds']}")
    return bad


def check_hud(st: State) -> list[str]:
    """Re-walk the 39 canned packet streams at $864E, three independent ways.

    1. the pointer is re-read from the ROM at the FILE OFFSET the JSON recorded
       (the exporter only ever indexed the stripped PRG, so this is a second
       route to the same word) and cross-checked against the manifest's own
       `queue.cannedPackets` table;
    2. the stream is re-decoded here with the terminator rule written out
       (`$FF`/`$FE` end it, `$FD` does not) rather than reused;
    3. the ten stage-1 packets are held against EXPECT_HUD_STREAMS, which was
       transcribed by hand from the CARTRIDGE'S OWN $0700 images.  That is the
       arm that survives the exporter and this file citing the same wrong
       address, which is the failure two automated readers cannot see.
    """
    bad = []
    rom = st.rom
    h = st.hud
    tbl = h["table"]
    if tbl["fileOffset"] != rom.off(0x864E):
        bad.append(f"packet table fileOffset {tbl['fileOffset']} != "
                   f"{rom.off(0x864E)} for $864E")
    if tbl["entries"] != len(h["packets"]):
        bad.append(f"table claims {tbl['entries']} entries, {len(h['packets'])} emitted")
    man_ptrs = st.man["tables"]["queue.cannedPackets"]["values"]
    for i, p in enumerate(h["packets"]):
        if p["index"] != i:
            bad.append(f"packet {i} carries index {p['index']}")
            continue
        o = tbl["fileOffset"] + 2 * i
        ptr = rom.data[o] | (rom.data[o + 1] << 8)
        if p["rom"] != f"${ptr:04X}":
            bad.append(f"packet {i} cites {p['rom']}, the table at $864E says ${ptr:04X}")
            continue
        if man_ptrs[i] != ptr:
            bad.append(f"packet {i}: manifest queue.cannedPackets[{i}] = "
                       f"${man_ptrs[i]:04X}, table says ${ptr:04X}")
        if p["fileOffset"] != rom.off(ptr):
            bad.append(f"packet {i} fileOffset {p['fileOffset']} != {rom.off(ptr)}")
            continue
        # re-decode: copy until $FF or $FE inclusive; $FD keeps going
        got, a = [], p["fileOffset"]
        while len(got) < 128:
            v = rom.data[a]
            a += 1
            got.append(v)
            if v in (0xFF, 0xFE):
                break
        else:
            bad.append(f"packet {i} at ${ptr:04X} never terminates")
            continue
        if got != p["bytes"]:
            bad.append(f"packet {i} at ${ptr:04X}: cache {p['bytes'][:6]}... "
                       f"!= re-decoded {got[:6]}...")
    by_index = {p["index"]: p["bytes"] for p in h["packets"]}
    for idx, want in {**EXPECT_HUD_STREAMS, **EXPECT_HUD_LISTING_ONLY}.items():
        got = by_index.get(idx)
        if got != want:
            bad.append(f"packet ${idx:02X} is {got}, the cartridge's own $0700 "
                       f"images say {want}")
    return bad


def check_enemies(st: State) -> list[str]:
    """The four enemy byte ranges, re-read and then held against MEASUREMENTS.

    Three independent arms, in increasing strength:

    1. every block is re-read from the raw .nes at the file offset the JSON
       itself recorded, and compared byte for byte -- catches a stale cache;
    2. the offset is re-derived from the CPU address a second way, so a wrong
       offset formula cannot agree with itself;
    3. the tables are then walked with the ROM's OWN index arithmetic
       (`$A592 + 2*$66`, `$A5BC + 3*$67`, `$AE1C + 2*(type AND $7F)`,
       `$A602 + ((4*cmd) AND $FF)`) and the results held against
       EXPECT_ENEMY_*, which came off the RUNNING CARTRIDGE.  That is the arm
       that survives the exporter and this file citing the same wrong address.
    """
    bad = []
    rom = st.rom
    e = st.enemies
    blocks = {b["name"]: b for b in e["blocks"]}
    for name in ("spawnData", "dispatch", "animGroups", "explosionScripts"):
        if name not in blocks:
            bad.append(f"enemies/tables.json has no block {name!r}")
    if bad:
        return bad

    for b in e["blocks"]:
        base = int(b["rom"].lstrip("$"), 16)
        want_off = rom.off(base)
        if b["fileOffset"] != want_off:
            bad.append(f"block {b['name']} at {b['rom']} records fileOffset "
                       f"{b['fileOffset']}, ${base:04X} is at {want_off}")
            continue
        if b["len"] != len(b["bytes"]):
            bad.append(f"block {b['name']} claims len {b['len']} but carries "
                       f"{len(b['bytes'])} bytes")
            continue
        got = list(rom.at(b["fileOffset"], b["len"]))
        if got != b["bytes"]:
            first = next(i for i in range(b["len"]) if got[i] != b["bytes"][i])
            bad.append(f"block {b['name']}: byte {first} (${base + first:04X}) is "
                       f"${b['bytes'][first]:02X} in the cache, ${got[first]:02X} "
                       f"in the ROM")

    # -- from here on, read only the CACHE, indexed the way the 6502 does ------
    spawn = blocks["spawnData"]
    sbase = int(spawn["rom"].lstrip("$"), 16)

    def byte(addr: int) -> int | None:
        i = addr - sbase
        return spawn["bytes"][i] if 0 <= i < len(spawn["bytes"]) else None

    def word(addr: int) -> int | None:
        a, b2 = byte(addr), byte(addr + 1)
        return None if a is None or b2 is None else a | (b2 << 8)

    # $A2D5 LDA $A7D0,Y (Y = 2*$19) -> chunk table; $A2E6 LDA ($98),Y (Y = $61)
    chunk_tbl = word(0xA7D0)
    if chunk_tbl != 0xA7DE:
        bad.append(f"stage 0's chunk table is ${chunk_tbl:04X}, the cartridge's "
                   f"$A7D0 pair says $A7DE")
    else:
        for idx, want in ((0, EXPECT_ENEMY_CHUNK0), (1, EXPECT_ENEMY_CHUNK1_HEAD)):
            p = word(chunk_tbl + 2 * idx)         # $61 = 0 and 2 -> byte offsets
            if p is None:
                bad.append(f"stage 0 chunk {idx} pointer is outside the block")
                continue
            got = [byte(p + k) for k in range(len(want))]
            if got != want:
                bad.append(f"stage 0 chunk {idx} at ${p:04X} reads {got}, the "
                           f"cartridge's measured wave records say {want}")

    # $A397: the descriptor tables live behind pointers at $A5FE/$A600
    tab_b = word(0xA600)
    if tab_b != 0xA602:
        bad.append(f"$A600 -> ${tab_b:04X}, the formation table is at $A602")
    else:
        for cmd, want in EXPECT_ENEMY_DESCRIPTORS.items():
            off = (4 * cmd) & 0xFF                # $A36D LDA $98 / ASL / ASL
            got = [byte(tab_b + off + k) for k in range(4)]
            if got != want:
                bad.append(f"descriptor for cmd ${cmd:02X} (${tab_b + off:04X}) "
                           f"reads {got}, the cartridge handed $A3E4 {want}")
    if word(0xA5FE) != 0xA662:
        bad.append(f"$A5FE -> ${word(0xA5FE):04X}, the single-spawn table is $A662")

    got = [byte(0xA592 + k) for k in range(2)]    # $A3E8 LDA $A592,X, X = 2*$66
    if got != EXPECT_ENEMY_FORM0:
        bad.append(f"formation 0 at $A592 reads {got}, the cartridge spawned "
                   f"{EXPECT_ENEMY_FORM0[0] & 0x0F} members at X "
                   f"${EXPECT_ENEMY_FORM0[0] & 0xF0:02X}")
    got = [byte(0xA5BC + k) for k in range(3)]    # $A42F LDA $A5BC,Y, Y = 3*$67
    if got != EXPECT_ENEMY_PATTERN0:
        bad.append(f"pattern 0 at $A5BC reads {got}, the cartridge spaced its "
                   f"members {EXPECT_ENEMY_PATTERN0[0] + 1} frames apart")

    anim = blocks["animGroups"]
    abase = int(anim["rom"].lstrip("$"), 16)
    for status, want in EXPECT_ENEMY_ANIM.items():
        off = 4 * status                          # $ADF9 ASL / ASL
        got = anim["bytes"][off:off + 4]
        if got != want:
            bad.append(f"animation group for status {status} (${abase + off:04X}) "
                       f"is {got}, the cartridge drew metasprites {want}")

    disp = blocks["dispatch"]
    dbase = int(disp["rom"].lstrip("$"), 16)
    if len(disp["bytes"]) != 84:
        bad.append(f"the dispatch table is {len(disp['bytes'])} bytes, not 84 "
                   f"(42 entries); $AE70 is the RTS immediately after it")
    for entry, want in EXPECT_ENEMY_DISPATCH.items():
        o = 2 * entry
        got = disp["bytes"][o] | (disp["bytes"][o + 1] << 8)
        if got != want:
            bad.append(f"dispatch entry {entry} (${dbase + o:04X}) -> ${got:04X}, "
                       f"the cartridge's execution counts pin it at ${want:04X}")

    ex = blocks["explosionScripts"]
    xbase = int(ex["rom"].lstrip("$"), 16)
    for idx, want in EXPECT_ENEMY_EXPL.items():
        p = ex["bytes"][2 * idx] | (ex["bytes"][2 * idx + 1] << 8)
        o = p - xbase
        got = ex["bytes"][o:o + len(want)] if 0 <= o else []
        if got != want:
            bad.append(f"explosion script {idx} at ${p:04X} reads {got}, the "
                       f"cartridge drew metasprites {want}")
    return bad


def check_flow(st: State) -> list[str]:
    """The two flow byte ranges, re-read and then walked the way $9B88 walks them.

    Same three arms as check_enemies, in the same order of strength:

    1. re-read from the raw .nes at the offset the JSON recorded (stale cache);
    2. re-derive that offset from the CPU address a second way (wrong formula);
    3. walk `$9BD4[$9BCC[$19] + ($3F >> 1)]` with the ROM's own arithmetic and
       hold the unpacked pair against EXPECT_FLOW_START, which came off two
       separate runs of the RUNNING CARTRIDGE.  That arm is the one a
       CONSISTENTLY shifted block cannot survive.
    """
    bad = []
    rom = st.rom
    f = st.flow
    blocks = {b["name"]: b for b in f["blocks"]}
    for name in ("startPos", "codes"):
        if name not in blocks:
            bad.append(f"flow/tables.json has no block {name!r}")
    if bad:
        return bad

    for b in f["blocks"]:
        base = int(b["rom"].lstrip("$"), 16)
        want_off = rom.off(base)
        if b["fileOffset"] != want_off:
            bad.append(f"block {b['name']} at {b['rom']} records fileOffset "
                       f"{b['fileOffset']}, ${base:04X} is at {want_off}")
            continue
        if b["len"] != len(b["bytes"]):
            bad.append(f"block {b['name']} claims len {b['len']} but carries "
                       f"{len(b['bytes'])} bytes")
            continue
        got = list(rom.at(b["fileOffset"], b["len"]))
        if got != b["bytes"]:
            first = next(i for i in range(b["len"]) if got[i] != b["bytes"][i])
            bad.append(f"block {b['name']}: byte {first} (${base + first:04X}) is "
                       f"${b['bytes'][first]:02X} in the cache, ${got[first]:02X} "
                       f"in the ROM")
    if bad:
        return bad

    # -- from here on, read only the CACHE, indexed the way the 6502 does ------
    pos = blocks["startPos"]
    pbase = int(pos["rom"].lstrip("$"), 16)

    def pbyte(addr):
        i = addr - pbase
        return pos["bytes"][i] if 0 <= i < len(pos["bytes"]) else None

    for (stage, cp), (wx, wy) in EXPECT_FLOW_START.items():
        y = pbyte(0x9BCC + stage)                       # $9B8E ADC $9BCC,Y
        if y is None:
            bad.append(f"$9BCC[{stage}] is outside the exported block")
            continue
        v = pbyte(0x9BD4 + ((y + (cp >> 1)) & 0xFF))    # $9B92 LDA $9BD4,Y
        if v is None:
            bad.append(f"$9BD4[{y} + {cp >> 1}] is outside the exported block")
            continue
        got = ((v << 4) & 0xFF, v & 0xF0)               # $9BAB ASL x4 / $9B95 AND
        if got != (wx, wy):
            bad.append(f"stage {stage} checkpoint {cp} starts at {got} "
                       f"(${v:02X}), the cartridge put the ship at {(wx, wy)}")

    codes = blocks["codes"]
    cbase = int(codes["rom"].lstrip("$"), 16)
    ptr = codes["bytes"][2] | (codes["bytes"][3] << 8)  # $976A LDA $9786,X, X=2
    if f["codePtrs"]["pause"] != f"${ptr:04X}":
        bad.append(f"flow/tables.json says the pause code is at "
                   f"{f['codePtrs']['pause']}, $9787 points at ${ptr:04X}")
    o = ptr - cbase
    got = codes["bytes"][o:o + len(EXPECT_FLOW_PAUSE_CODE)] if o >= 0 else []
    if got != EXPECT_FLOW_PAUSE_CODE:
        bad.append(f"the pause button code at ${ptr:04X} reads {got}, the listing "
                   f"says {EXPECT_FLOW_PAUSE_CODE} (LISTING ONLY -- unmeasured)")
    return bad


def check_collision(st: State) -> list[str]:
    """The two $C0C7 tables, re-read and then held to what the cartridge DID.

    Same three arms as check_flow:

    1. re-read from the raw .nes at the offset the JSON recorded (stale cache);
    2. re-derive that offset from the CPU address a second way (wrong formula);
    3. hold the cache against EXPECT_COLL_EXPLOSION and EXPECT_COLL_BOX0, both
       of which came off the RUNNING CARTRIDGE (the right-wall death at f493 and
       the explosion walk over f494-f544), not off the listing.
    """
    bad = []
    rom = st.rom
    c = st.coll
    blocks = {b["name"]: b for b in c["blocks"]}
    for name in ("boxes", "explosion"):
        if name not in blocks:
            bad.append(f"collision/tables.json has no block {name!r}")
    if bad:
        return bad

    for b in c["blocks"]:
        base = int(b["rom"].lstrip("$"), 16)
        want_off = rom.off(base)
        if b["fileOffset"] != want_off:
            bad.append(f"block {b['name']} at {b['rom']} records fileOffset "
                       f"{b['fileOffset']}, ${base:04X} is at {want_off}")
            continue
        if b["len"] != len(b["bytes"]):
            bad.append(f"block {b['name']} claims len {b['len']} but carries "
                       f"{len(b['bytes'])} bytes")
            continue
        got = list(rom.at(b["fileOffset"], b["len"]))
        if got != b["bytes"]:
            first = next(i for i in range(b["len"]) if got[i] != b["bytes"][i])
            bad.append(f"block {b['name']}: byte {first} (${base + first:04X}) is "
                       f"${b['bytes'][first]:02X} in the cache, ${got[first]:02X} "
                       f"in the ROM")
    if bad:
        return bad

    # -- from here on, read only the CACHE, indexed the way the 6502 does ------
    ex = blocks["explosion"]
    xbase = int(ex["rom"].lstrip("$"), 16)

    def xbyte(addr):                                    # $C0E3 LDA $C0FA,X
        i = addr - xbase
        return ex["bytes"][i] if 0 <= i < len(ex["bytes"]) else None

    walk = [xbyte(0xC0FA + i) for i in range(len(EXPECT_COLL_EXPLOSION))]
    if walk != EXPECT_COLL_EXPLOSION:
        bad.append(f"the explosion walk $C0FA[0..5] reads {walk}, the cartridge "
                   f"put {EXPECT_COLL_EXPLOSION} into $0120 over f494-f544")

    bx = blocks["boxes"]
    bbase = int(bx["rom"].lstrip("$"), 16)

    def bbyte(addr):
        i = addr - bbase
        return bx["bytes"][i] if 0 <= i < len(bx["bytes"]) else None

    w0 = bbyte(0xBFDA)                                  # $C127 CMP $BFDA,X
    h0 = bbyte(0xBFDE)                                  # $C131 CMP $BFDE,X
    e = EXPECT_COLL_BOX0
    if w0 is None or h0 is None:
        bad.append("$BFDA[0] / $BFDE[0] are outside the exported block")
    else:
        if not (e["dxAccepted"] < w0 <= e["dxRejected"]):
            bad.append(f"$BFDA[0] = ${w0:02X}: the cartridge REJECTED dx = "
                       f"{e['dxRejected']} at right-wall f492 and ACCEPTED dx = "
                       f"{e['dxAccepted']} at f493, which pins the width to "
                       f"({e['dxAccepted']}, {e['dxRejected']}]")
        if not h0 > e["dyAccepted"]:
            bad.append(f"$BFDE[0] = ${h0:02X}: the cartridge ACCEPTED dy = "
                       f"{e['dyAccepted']} at right-wall f493")
    return bad


CHECKS = [
    ("rom", check_rom),
    ("files", check_files),
    ("offsets", check_offsets),
    ("tables", check_tables),
    ("constants", check_constants),
    ("palettes", check_palettes),
    ("chr", check_chr),
    ("terrain", check_terrain),
    ("hud", check_hud),
    ("enemies", check_enemies),
    ("flow", check_flow),
    ("collision", check_collision),
]


def run_all(st: State) -> dict[str, list[str]]:
    return {name: fn(st) for name, fn in CHECKS}


# =============================================================== self-test ==
# Each mutation breaks ONE thing and names the check that must notice.  A check
# nothing can redden is a check that proves nothing (docs/knowledge/03).

def _mut_blob(st, path, index, value):
    b = bytearray(st.blob[path])
    b[index] = value
    st.blob[path] = bytes(b)


def _cite_elsewhere(st, name, addr):
    """Re-cite a table at `addr` AND re-read it from there.

    This is the mutation that matters most: afterwards the manifest is
    internally consistent -- offsets right, values right, hash right -- and
    only the hand-transcribed measurements in EXPECT_TABLES can tell that the
    address is the wrong one.  It is the "both readers cite the same wrong
    address" failure that an automated cross-check cannot see.
    """
    e = st.man["tables"][name]
    e["rom"] = f"${addr:04X}"
    e["fileOffset"] = st.rom.off(addr)
    e["values"] = vals_at(st.rom, e["fileOffset"], e["n"], e["unit"])
    e["sha1"] = hashlib.sha1(st.rom.at(e["fileOffset"],
                                       e["n"] * (1 if e["unit"] == "u8" else 2))).hexdigest()


def _cite_const_elsewhere(st, name, addr):
    """Same idea for an instruction-anchored constant: move it to a DIFFERENT
    but equally real `CMP #imm`, so opcode and operand both check out."""
    e = st.man["constants"][name]
    e["rom"] = f"${addr:04X}"
    e["fileOffset"] = st.rom.off(addr)
    e["value"] = st.rom.data[e["fileOffset"] + 1]


def _shift_hud_table(st):
    """Re-cite the canned-packet table at $8650 -- one entry along -- CONSISTENTLY.

    The table citation, the manifest's copy of it, every packet's pointer, every
    packet's file offset and every packet's bytes all move together, so the
    cache stays internally consistent and re-decodable at its own recorded
    offsets.  Only EXPECT_HUD_STREAMS -- the bytes the CARTRIDGE itself put in
    $0700 -- can tell.  That is the point: 00-recon-terrain.md 4 ran this same
    shift against a LENGTH check and could only redden 4 of 10 packets, because
    six of stage 1's packets are 4 or 5 bytes long and so are their neighbours.
    """
    rom = st.rom
    base = rom.off(0x8650)                       # $864E + one 2-byte entry
    n = 38                                       # one fewer: the table is shorter
    st.hud["table"]["rom"] = "$8650"
    st.hud["table"]["fileOffset"] = base
    st.hud["table"]["entries"] = n
    pkts = []
    for i in range(n):
        ptr = rom.data[base + 2 * i] | (rom.data[base + 2 * i + 1] << 8)
        o, b = rom.off(ptr), []
        while len(b) < 128:
            v = rom.data[o]
            o += 1
            b.append(v)
            if v in (0xFF, 0xFE):
                break
        pkts.append({"index": i, "rom": f"${ptr:04X}",
                     "fileOffset": rom.off(ptr), "bytes": b})
    st.hud["packets"] = pkts
    e = st.man["tables"]["queue.cannedPackets"]
    e.update(rom="$8650", fileOffset=base, n=n,
             values=[rom.data[base + 2 * i] | (rom.data[base + 2 * i + 1] << 8)
                     for i in range(n)])
    e["sha1"] = hashlib.sha1(rom.at(base, 2 * n)).hexdigest()


def _enemy_block(st, name):
    return next(b for b in st.enemies["blocks"] if b["name"] == name)


def _mut_enemy(st, name, addr, value):
    """Flip ONE byte of an enemy block, at a CPU address."""
    b = _enemy_block(st, name)
    b["bytes"][addr - int(b["rom"].lstrip("$"), 16)] = value


def _swap_dispatch(st, a, b):
    d = _enemy_block(st, "dispatch")["bytes"]
    d[2 * a], d[2 * a + 1], d[2 * b], d[2 * b + 1] = \
        d[2 * b], d[2 * b + 1], d[2 * a], d[2 * a + 1]


def _shift_enemy_block(st):
    """Re-cite the spawn-data block at $A593 and RE-READ it from there.

    The internal cross-checks (offset re-derivation, byte-for-byte re-read) all
    still pass afterwards, because the cache is consistent with itself and with
    the ROM at its own recorded address.  Only EXPECT_ENEMY_* -- the wave
    records the cartridge fired and the descriptors it handed $A3E4 -- notice.
    """
    b = _enemy_block(st, "spawnData")
    base = int(b["rom"].lstrip("$"), 16) + 1
    b["rom"] = f"${base:04X}"
    b["fileOffset"] = st.rom.off(base)
    b["bytes"] = list(st.rom.at(b["fileOffset"], b["len"]))


def _flow_block(st, name):
    return next(b for b in st.flow["blocks"] if b["name"] == name)


def _shift_flow_block(st):
    """Re-cite the start-position block at $9BCD and RE-READ it from there.

    Consistent: address, file offset and bytes all move together, so the
    byte-for-byte re-read and the offset re-derivation both still pass.  What
    catches it is that the CHECK's own addresses ($9BCC, $9BD4) are the
    cartridge's and do not move with it -- $9BCC then falls one byte below the
    block.  The stronger arm is `flow-byte` below, which keeps every address and
    length intact and is caught only by the position the cartridge measured.
    """
    b = _flow_block(st, "startPos")
    base = int(b["rom"].lstrip("$"), 16) + 1
    b["rom"] = f"${base:04X}"
    b["fileOffset"] = st.rom.off(base)
    b["bytes"] = list(st.rom.at(b["fileOffset"], b["len"]))


def _coll_block(st, name):
    return next(b for b in st.coll["blocks"] if b["name"] == name)


def _shift_coll_block(st):
    """Re-cite the explosion table at $C0FB and RE-READ it from there.

    Consistent -- address, offset and bytes move together -- so the byte-for-byte
    re-read and the offset re-derivation both still pass.  What catches it is
    that the walk the CARTRIDGE was measured performing starts at $C0FA, so the
    shifted block hands $0120 the sequence $2E $2F $30 $30 $00 $00.
    """
    b = _coll_block(st, "explosion")
    base = int(b["rom"].lstrip("$"), 16) + 1
    b["rom"] = f"${base:04X}"
    b["fileOffset"] = st.rom.off(base)
    b["bytes"] = list(st.rom.at(b["fileOffset"], b["len"]))


MUTATIONS = [
    ("rom-sha", "rom",
     "claim the manifest came off a different cartridge",
     lambda st: st.man["rom"].__setitem__("sha1", "0" * 40)),
    ("notes-drift", "tables",
     "cite $9FB5 for stage.threshold CONSISTENTLY -- only the notes can tell",
     lambda st: _cite_elsewhere(st, "stage.threshold", 0x9FB5)),
    ("notes-drift-const", "constants",
     "point player.xMax at the X-MIN compare $A03A -- a real CMP #imm, wrong one",
     lambda st: _cite_const_elsewhere(st, "player.xMax", 0xA03A)),
    ("table-value", "tables",
     "flip stage.threshold[0] in the manifest ($9FB4)",
     lambda st: st.man["tables"]["stage.threshold"]["values"].__setitem__(0, 0x41)),
    ("table-address", "tables",
     "cite $9FB5 instead of $9FB4 for stage.threshold (offsets still agree)",
     lambda st: st.man["tables"]["stage.threshold"].update(
         rom="$9FB5", fileOffset=st.man["tables"]["stage.threshold"]["fileOffset"] + 1)),
    ("table-offset", "offsets",
     "keep $9FB4 but record the file offset one byte late",
     lambda st: st.man["tables"]["stage.threshold"].__setitem__(
         "fileOffset", st.man["tables"]["stage.threshold"]["fileOffset"] + 1)),
    ("constant-value", "constants",
     "claim the X clamp is 220 -- the value PROBE.md got wrong",
     lambda st: st.man["constants"]["player.xMax"].__setitem__("value", 220)),
    ("constant-address", "constants",
     "point player.xMax at the operand byte $A029 instead of the CMP at $A028",
     lambda st: st.man["constants"]["player.xMax"].update(
         rom="$A029", fileOffset=st.man["constants"]["player.xMax"]["fileOffset"] + 1)),
    ("palette-colour", "palettes",
     "change one colour of the measured gameplay background palette",
     lambda st: st.man["palettes"]["gameplay.bg01"]["colours"].__setitem__(1, 0x13)),
    ("palette-address", "palettes",
     "read the sprite palette 2 bytes early ($8798, the packet header)",
     lambda st: st.man["palettes"]["gameplay.sprites"].update(
         rom="$8798", fileOffset=st.man["palettes"]["gameplay.sprites"]["fileOffset"] - 2)),
    ("chr-pixel", "chr",
     "flip one pixel in the decoded tile cache",
     lambda st: _mut_blob(st, "chr/tiles.u8", 1234, 3)),
    ("chr-raw", "files",
     "flip a byte of chr.bin so it is no longer the cartridge's CHR",
     lambda st: _mut_blob(st, "chr.bin", 5000, 0xFF)),
    ("terrain-tile", "terrain",
     "change one decoded tile of one stage-1 block",
     lambda st: st.stages["stages"][0]["blocks"]["0:0"]["tiles"].__setitem__(0, 0x99)),
    ("terrain-collision", "terrain",
     "change one collision byte, leaving the tiles it came from alone",
     lambda st: next(b for b in st.stages["stages"][5]["blocks"].values()
                     if any(b["collision"]))["collision"].__setitem__(0, 0x00)),
    ("terrain-pageorder", "terrain",
     "reverse stage 1's page order",
     lambda st: st.stages["stages"][0].__setitem__(
         "pageOrder", list(reversed(st.stages["stages"][0]["pageOrder"])))),
    ("file-sha", "files",
     "corrupt prg.bin without updating its hash",
     lambda st: _mut_blob(st, "prg.bin", 100, 0x00)),
    # --- the stale-cache and dropped-table arms -----------------------------
    ("table-dropped", "tables",
     "delete a table the notes describe",
     lambda st: st.man["tables"].pop("terrain.fillTbl")),
    ("terrain-stale", "terrain",
     "leave a block in the cache that no screen references any more",
     lambda st: st.stages["stages"][0]["blocks"].__setitem__(
         "0:255", {"rom": "$0000", "tiles": [0] * 16, "attr": 0,
                   "collision": [0, 0, 0, 0]})),
    ("hud-shift", "hud",
     "re-cite the whole canned-packet table at $8650 -- consistent everywhere, "
     "so only the cartridge's own $0700 images can tell",
     _shift_hud_table),
    ("hud-byte", "hud",
     "flip one byte of the lives packet $11 -- the length is unchanged",
     lambda st: st.hud["packets"][0x11]["bytes"].__setitem__(1, 0xA3)),
    # --- enemies -------------------------------------------------------------
    ("enemy-shift", "enemies",
     "re-cite the spawn-data block at $A593 -- one byte along, CONSISTENTLY: the "
     "address, the file offset and the bytes all move together, so the cache is "
     "still self-consistent and only the cartridge's own measured wave records "
     "and descriptors can tell",
     _shift_enemy_block),
    ("enemy-byte", "enemies",
     "flip the cmd of stage 0's FIRST wave record from $80 to $81 -- same length, "
     "same trigger, a different squadron",
     lambda st: _mut_enemy(st, "spawnData", 0xA845, 0x81)),
    ("enemy-dispatch", "enemies",
     "swap dispatch entries 4 and 5, so type $85 would run $B205",
     lambda st: _swap_dispatch(st, 4, 5)),
    ("enemy-anim", "enemies",
     "shift the status-1 animation group by one metasprite",
     lambda st: _mut_enemy(st, "animGroups", 0xADC5, 0x0B)),
    # --- flow (wave 4) -------------------------------------------------------
    ("flow-shift", "flow",
     "re-cite the start-position block at $9BCD -- one byte along, CONSISTENTLY",
     _shift_flow_block),
    ("flow-byte", "flow",
     "change $9BD4[0] from $65 to $75: same length, same addresses, a ship that "
     "starts 16 px lower than the one the cartridge was measured putting there",
     lambda st: _flow_block(st, "startPos")["bytes"].__setitem__(8, 0x75)),
    ("flow-code", "flow",
     "flip the first button of the pause screen's code from UP to DOWN",
     lambda st: _flow_block(st, "codes")["bytes"].__setitem__(14, 0x04)),
    # --- collision (wave 5) --------------------------------------------------
    ("coll-shift", "collision",
     "re-cite the explosion table at $C0FB -- one byte along, CONSISTENTLY",
     _shift_coll_block),
    ("coll-box", "collision",
     "widen the class-0 hit box from $10 to $11: the cartridge REJECTED dx = 16 "
     "at right-wall f492, and a 17-wide box kills a frame early",
     lambda st: _coll_block(st, "boxes")["bytes"].__setitem__(0, 0x11)),
    ("coll-expl", "collision",
     "make $C0FA[4] $2F instead of $30 -- a fifth explosion frame the cartridge "
     "was measured NOT drawing at f534",
     lambda st: _coll_block(st, "explosion")["bytes"].__setitem__(4, 0x2F)),
    ("chr-truncated", "chr",
     "truncate the decoded tile cache by one tile",
     lambda st: st.blob.__setitem__("chr/tiles.u8", st.blob["chr/tiles.u8"][:-64])),
]


def self_test(base: State, verbose: bool) -> int:
    print("\n=== self-test: every check family, watched to fail ===")
    clean = run_all(base)
    dirty_now = [k for k, v in clean.items() if v]
    if dirty_now:
        print(f"  cannot run: the assets are already failing {dirty_now}")
        return 1
    print(f"  baseline: all {len(clean)} families green")
    reddened = set()
    fails = 0
    for name, target, desc, apply in MUTATIONS:
        st = copy.deepcopy(base)
        apply(st)
        res = run_all(st)
        red = [k for k, v in res.items() if v]
        ok = target in red
        reddened.update(red)
        fails += 0 if ok else 1
        print(f"  [{'RED ' if ok else 'MISS'}] {name:18s} -> {target:10s} "
              f"{'seen red: ' + ','.join(red) if red else 'NOTHING WENT RED'}")
        if verbose and red:
            print(f"         {res[target][0] if res[target] else res[red[0]][0]}")
        if not ok:
            print(f"         mutation was: {desc}")
    silent = [n for n, _ in CHECKS if n not in reddened]
    if silent:
        print(f"  UNFALSIFIABLE: no mutation could redden {silent}")
        fails += len(silent)
    print(f"  {len(MUTATIONS) - fails} of {len(MUTATIONS)} mutations reddened their "
          f"target; {len(reddened)} of {len(CHECKS)} families seen red")
    return 1 if fails else 0


# ==================================================================== main ==
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rom", type=Path, default=None)
    ap.add_argument("--assets", type=Path, default=GAME_ROOT / "assets")
    ap.add_argument("--self-test", action="store_true",
                    help="corrupt each thing in turn and prove the checks notice")
    ap.add_argument("--verbose", action="store_true")
    args = ap.parse_args()

    game = json.loads(GAME_JSON.read_text(encoding="utf-8"))
    rom_path = args.rom or (REPO_ROOT / game["rom"]["file"])
    if not rom_path.exists():
        raise SystemExit(f"ROM not found: {rom_path}")
    if not (args.assets / "manifest.json").exists():
        raise SystemExit(f"no manifest at {args.assets}\n"
                         f"Run: python games/gradius/tools/export_assets.py")
    rom = RawRom(rom_path)
    if rom.sha1 != game["rom"]["sha1"]:
        raise SystemExit(f"REFUSING TO RUN: {rom_path} sha1 {rom.sha1}\n"
                         f"                 game.json wants {game['rom']['sha1']}")
    st = State(args.assets, rom)

    res = run_all(st)
    total = 0
    for name, _ in CHECKS:
        bad = res[name]
        total += len(bad)
        print(f"[{'FAIL' if bad else 'PASS'}] {name}")
        for line in (bad if args.verbose else bad[:5]):
            print(f"        {line}")
        if not args.verbose and len(bad) > 5:
            print(f"        ... and {len(bad) - 5} more")
    print(f"{'FAILED' if total else 'OK'}: {total} mismatch(es) across "
          f"{len(CHECKS)} check families, {len(st.man['tables'])} tables, "
          f"{len(st.man['constants'])} constants, {len(st.man['palettes'])} palettes, "
          f"{st.man['chrTiles']['tiles']} CHR tiles, "
          f"{sum(len(s['blocks']) for s in st.stages['stages'])} terrain blocks")

    rc = 1 if total else 0
    if args.self_test:
        rc |= self_test(st, args.verbose)
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
