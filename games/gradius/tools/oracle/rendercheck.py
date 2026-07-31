#!/usr/bin/env python3
"""Rebuild one Gradius frame from the measured PPU state and compare it, pixel
for pixel, with the frame Mesen actually produced.

This is the renderer specification, executable. If the two-band model in
NOTES-render.md is right, this prints 0 mismatching pixels out of 61,440. Every
`--break` switch below is a deliberate lie about the model, and each one has been
watched go red -- a check that has never been seen to fail is not evidence
(docs/knowledge/03).

Inputs, all produced by videoprobe.py / palprobe.lua and all ROM-DERIVED:
    <dir>/dump.json          the measured registers for both raster bands
    <dir>/pal.bin            palette RAM $3F00-$3F1F at the sampled frame
    <dir>/nt.bin             PPU $2000-$2FFF
    <dir>/oam.bin            hardware OAM
    <dir>/fb.bin             Mesen's framebuffer, 256x240 RGB
    out/video/master_palette.bin   the emulator's index->RGB table (palprobe.lua)
    the .nes file            for the CHR banks -- deliberately read straight from
                             the file rather than from the emulator's chr.bin, so
                             that a bank-number mistake cannot hide itself
                             (docs/knowledge/03, independently derived sides)

Usage
    python games/gradius/tools/oracle/rendercheck.py --dir out/video/f400
    python games/gradius/tools/oracle/rendercheck.py --dir out/video/f400 --all-breaks
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[3]
ROM = REPO / "Gradius (USA).nes"

W, H = 256, 240


# --------------------------------------------------------------------- CHR ---
def chr_banks(rom_path: Path) -> list[bytes]:
    """The four 8 KB CHR banks, out of the iNES file.

    2bpp planar: 16 bytes per 8x8 tile, bytes 0-7 are bit-plane 0 (one byte per
    row, bit 7 = leftmost pixel), bytes 8-15 bit-plane 1. Pixel = p0 | (p1 << 1).
    Header bytes of this cartridge, read back and asserted below:
        4E 45 53 1A 02 04 31 08 ...
        prg = 2 x 16 KB, chr = 4 x 8 KB, flags6 = $31 -> mapper low nibble 3 and
        bit0 = 1 = VERTICAL mirroring, flags7 = $08 -> mapper high nibble 0.
    """
    raw = rom_path.read_bytes()
    if raw[:4] != b"NES\x1a":
        raise SystemExit("not an iNES file")
    prg_bytes = raw[4] * 0x4000
    chr_bytes = raw[5] * 0x2000
    mapper = (raw[6] >> 4) | (raw[7] & 0xF0)
    if mapper != 3:
        raise SystemExit(f"expected mapper 3 (CNROM), header says {mapper}")
    off = 16 + (512 if raw[6] & 4 else 0) + prg_bytes
    chr_all = raw[off:off + chr_bytes]
    if len(chr_all) != 4 * 0x2000:
        raise SystemExit(f"expected 32 KB CHR, got {len(chr_all)}")
    return [chr_all[i * 0x2000:(i + 1) * 0x2000] for i in range(4)]


def tile_row(bank: bytes, base: int, tile: int, row: int) -> tuple[int, ...]:
    """8 pixel values (0..3) for one row of one tile."""
    a = base + tile * 16 + row
    lo, hi = bank[a], bank[a + 8]
    return tuple(((lo >> (7 - x)) & 1) | (((hi >> (7 - x)) & 1) << 1)
                 for x in range(8))


# ------------------------------------------------------------------ render ---
class Model:
    """The measured two-band model. Everything here is a value read out of the
    running cartridge by videoprobe.lua; nothing is a constant we chose."""

    def __init__(self, d: dict, breaks: set[str]):
        self.breaks = breaks
        self.ctrlA = d["bandA_ppuctrl"]
        self.maskA = d["bandA_ppumask"]
        self.scxA = d["bandA_scrollX"]
        self.scyA = d["bandA_scrollY"]
        self.split = bool(d["split_ran"])
        self.ctrlB = d["split_bandB_ppuctrl"] if self.split else self.ctrlA

        # WHERE THE BOUNDARY FALLS. $2005/$2000 writes land in `t`; the PPU
        # copies t's HORIZONTAL half into `v` at dot 257 of every scanline. So a
        # write finished on scanline S, before dot 257, first shows on S+1.
        # Measured: the $2005 pair completes at scanline 211 dot 226 -> band B
        # starts at scanline 212.
        self.split_sl = d["split_scrollWriteScanline"]
        self.split_dot = d["split_scrollWriteCycle"]
        self.bandB_from = (self.split_sl + 1) if self.split else H
        if "band" in breaks:               # pretend there is only one band
            self.bandB_from = H
        if "boundary+1" in breaks:
            self.bandB_from += 1
        if "boundary-1" in breaks:
            self.bandB_from -= 1

        # CHR: every CNROM latch of the frame, with the scanline it happened on.
        # The vblank latch (scanline >= 240) is band A's; a latch during the
        # visible area is the split's.
        #
        # The latch's own scanline JITTERS -- measured at dot 318, 324, 334 and
        # 340 of scanline 211 and at dot 2 of scanline 212 on five consecutive
        # frames, because the sprite-0 spin exits a few cycles later each time.
        # Using `latch scanline + 1` therefore gives 212 on some frames and 213
        # on others, and 213 is WRONG (90 px on scanline 212). The boundary that
        # holds on every frame measured is the same one the scroll uses:
        # scanline 212. Written down as that, not as the latch scanline.
        self.bankA, self.bankB = 0, 0
        self.latch_sl, self.latch_dot = -1, -1
        for e in d["chrLatches"]:
            if e["sl"] >= H or e["sl"] < 0:
                self.bankA = e["bank"]
            else:
                self.bankB = e["bank"]
                self.latch_sl, self.latch_dot = e["sl"], e["dot"]
        self.bank_sl = self.bandB_from if self.split else H
        if not self.split:
            self.bankB = self.bankA
        if "chrbank" in breaks:            # band B keeps band A's tiles
            self.bankB, self.bank_sl = self.bankA, H
        if "chrline+1" in breaks:
            self.bank_sl += 1
        if "chrline-1" in breaks:
            self.bank_sl -= 1
        if "sprbank0" in breaks:   # sprites swap bank on the same line as bg
            self.spr_bank_delay = 0

        if "sprsize" in breaks:            # pretend 8x8 like the listing never said
            self.ctrlA &= ~0x20
            self.ctrlB &= ~0x20
        if "scrollx" in breaks:            # pretend the level does not scroll
            self.scxA = 0
        if "scrolly" in breaks:
            self.scyA = 0

    # The CHR swap is not a clean scanline cut either, and for the opposite
    # reason to the fine-X one: the PPU PREFETCHES. The first two background
    # tiles of scanline N are fetched at dots 321-336 of scanline N-1, and the
    # sprite patterns for scanline N at dots 257-320 of N-1 -- all before the
    # split's latch lands. Measured, see NOTES-render.md:
    #   background: band B's bank from scanline 212, EXCEPT its leftmost
    #               bg_bank_from_x pixels (2 tiles), prefetched with band A's
    #   sprites:    band B's bank only from scanline 213 -- ONE LATER
    #
    # The sprite delay is not a guess: injecting three 8x16 sprites straddling
    # the boundary with a tile pair that differs between banks 0 and 1 gives
    # 0 px wrong at delay 1 and 26 / 31 px wrong at delay 0 / 2, on two frames
    # whose latch landed on different scanlines (211 dot 340 and 212 dot 23).
    bg_bank_from_x = 0
    spr_bank_delay = 1

    def ctrl(self, sl: int) -> int:
        return self.ctrlB if sl >= self.bandB_from else self.ctrlA

    def bank(self, sl: int, x: int = 255) -> int:
        if sl == self.bank_sl and x < self.bg_bank_from_x:
            return self.bankA
        return self.bankB if sl >= self.bank_sl else self.bankA

    def spr_bank(self, sl: int) -> int:
        return self.bankB if sl >= self.bank_sl + self.spr_bank_delay else self.bankA

    # THE BOUNDARY IS NOT A CLEAN SCANLINE CUT. The first $2005 write at $9AB2
    # also loads the PPU's 3-bit FINE-X latch, and that latch is not part of `v`
    # -- it takes effect immediately, mid-scanline, on the scanline the split
    # runs on. So the right-hand tail of scanline 211 already draws with band B's
    # fine X (0) while its coarse X and nametable are still band A's. Measured
    # below with --fx-sweep; set to None to model the naive clean cut.
    fx_from_x: int | None = None

    def hscroll(self, sl: int) -> tuple[int, int]:
        """(coarse+fine X, nametable-X bit) in force on this scanline."""
        if sl >= self.bandB_from:
            # $9AB0: LDX #$00 / $9AB2,$9AB5: STX $2005 twice.
            # The nametable-X bit comes from the $2000 write at $9ABC, which
            # measured lands at dot 265 -- AFTER the dot-257 copy -- so it is one
            # scanline later than the scroll itself.
            ntx = (self.ctrlB & 1) if sl >= self.bandB_from + 1 else (self.ctrlA & 1)
            return 0, ntx
        return self.scxA, self.ctrlA & 1


def render(m: Model, pal: bytes, nt: bytes, oam: bytes, banks: list[bytes],
           master: list[tuple[int, int, int]]) -> tuple[bytearray, bytearray]:
    """Return (rgb, palidx): the frame as RGB bytes and as NES colour indices."""
    rgb = bytearray(W * H * 3)
    idxbuf = bytearray(W * H)

    bg_show_left = bool(m.maskA & 0x02)
    spr_show_left = bool(m.maskA & 0x04)
    bg_on = bool(m.maskA & 0x08)
    spr_on = bool(m.maskA & 0x10)

    for sl in range(H):
        ctrl = m.ctrl(sl)
        sprbank = banks[m.spr_bank(sl)]
        bg_base = 0x1000 if ctrl & 0x10 else 0x0000
        spr_base8 = 0x1000 if ctrl & 0x08 else 0x0000
        tall = bool(ctrl & 0x20)
        scx, ntx = m.hscroll(sl)

        # ---- vertical: v advances one scanline at a time from the vblank load.
        # coarse Y wraps 29 -> 0 and TOGGLES the nametable-Y bit; the $2005 Y
        # write inside the split does not touch it, because only the horizontal
        # half of t is copied into v during rendering.
        total = m.scyA + sl
        nty = (ctrl >> 1) & 1
        if total >= 240:
            total -= 240
            nty ^= 1
        coarse_y, fine_y = total >> 3, total & 7

        # ---- background scanline
        bgpix = [0] * W          # 0..3, 0 = transparent
        bgpal = [0] * W          # palette group 0..3
        if bg_on:
            fx_from = (m.fx_from_x if (m.fx_from_x is not None
                                       and sl == m.split_sl) else W)
            aligned = scx - (scx & 7)      # band B's fine X is 0
            for x in range(W):
                fx = (scx + x) if x < fx_from else (aligned + x)
                ntx_e = ntx ^ ((fx >> 8) & 1)
                fx &= 0xFF
                base = ((nty << 1) | ntx_e) * 0x400
                cx = fx >> 3
                tile = nt[base + coarse_y * 32 + cx]
                at = nt[base + 0x3C0 + (coarse_y >> 2) * 8 + (cx >> 2)]
                shift = ((coarse_y & 2) << 1) | (cx & 2)
                bgpal[x] = (at >> shift) & 3
                bgpix[x] = tile_row(banks[m.bank(sl, x)], bg_base,
                                    tile, fine_y)[fx & 7]

        # ---- sprite evaluation: OAM order, first 8 that cover this scanline.
        # NES sprite Y in OAM is TOP MINUS ONE, so a sprite covers
        # oam_y+1 .. oam_y+height.
        height = 16 if tall else 8
        chosen = []
        if spr_on:
            for i in range(64):
                y = oam[i * 4]
                if y <= sl - 1 < y + height:
                    chosen.append(i)
                    if len(chosen) == 8:
                        break

        sprpix = [0] * W
        sprpal = [0] * W
        sprprio = [0] * W
        sprfirst = [-1] * W
        for i in chosen:
            y, tile, attr, sx = oam[i * 4:i * 4 + 4]
            row = sl - 1 - y
            if attr & 0x80:
                row = height - 1 - row
            if tall:
                # 8x16: bit 0 of the tile byte picks the pattern table and the
                # top tile is (tile & $FE); PPUCTRL bit 3 is IGNORED in this mode.
                base = 0x1000 if tile & 1 else 0x0000
                t = (tile & 0xFE) + (1 if row >= 8 else 0)
                r = row & 7
            else:
                base, t, r = spr_base8, tile, row
            px = tile_row(sprbank, base, t, r)
            if attr & 0x40:
                px = px[::-1]
            for k in range(8):
                x = sx + k
                if x >= W:
                    break
                if px[k] == 0:
                    continue
                if sprfirst[x] >= 0:
                    if "prioX" in m.breaks:
                        # The DMG rule: smaller X wins. Wrong on the NES, and
                        # this switch exists so that "wrong" is a number.
                        if sx >= oam[sprfirst[x] * 4 + 3]:
                            continue
                    else:
                        continue          # OAM index only: first one wins
                sprfirst[x] = i
                sprpix[x] = px[k]
                sprpal[x] = attr & 3
                sprprio[x] = (attr >> 5) & 1

        # ---- multiplex
        for x in range(W):
            b = bgpix[x] if (bg_show_left or x >= 8) else 0
            s = sprpix[x] if (spr_show_left or x >= 8) else 0
            if s and (sprprio[x] == 0 or b == 0):
                ci = pal[0x10 + sprpal[x] * 4 + s]
            elif b:
                ci = pal[bgpal[x] * 4 + b]
            else:
                ci = pal[0]               # the universal backdrop $3F00
            ci &= 0x3F
            o = sl * W + x
            idxbuf[o] = ci
            r, g, bl = master[ci]
            rgb[o * 3:o * 3 + 3] = bytes((r, g, bl))
    return rgb, idxbuf


# ------------------------------------------------------------------- check ---
def compare(mine: bytearray, theirs: bytes) -> tuple[int, dict[int, int]]:
    bad, per_line = 0, {}
    for i in range(W * H):
        if mine[i * 3:i * 3 + 3] != theirs[i * 3:i * 3 + 3]:
            bad += 1
            per_line[i // W] = per_line.get(i // W, 0) + 1
    return bad, per_line


def write_png(path: Path, rgb: bytes) -> None:
    import struct
    import zlib
    raw = b"".join(b"\x00" + bytes(rgb[y * W * 3:(y + 1) * W * 3]) for y in range(H))

    def chunk(tag, data):
        c = tag + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c))

    path.write_bytes(b"\x89PNG\r\n\x1a\n"
                     + chunk(b"IHDR", struct.pack(">IIBBBBB", W, H, 8, 2, 0, 0, 0))
                     + chunk(b"IDAT", zlib.compress(raw, 9))
                     + chunk(b"IEND", b""))


BREAKS = [
    ("band",       "one band only -- no sprite-0 split at all"),
    ("chrbank",    "band B keeps band A's CHR bank (the mid-frame swap removed)"),
    ("boundary+1", "band boundary one scanline too late"),
    ("boundary-1", "band boundary one scanline too early"),
    ("sprsize",    "8x8 sprites instead of 8x16"),
    ("prioX",      "sprite priority by X (the DMG rule) instead of OAM index"),
    ("scrollx",    "background scroll X forced to 0"),
    ("scrolly",    "background scroll Y forced to 0"),
    ("chrline+1",  "CHR bank boundary one scanline too late"),
    ("chrline-1",  "CHR bank boundary one scanline too early"),
    ("sprbank0",   "sprite CHR swaps on the same scanline as the background"),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True)
    ap.add_argument("--palette", default=None)
    ap.add_argument("--break", dest="brk", action="append", default=[],
                    choices=[b for b, _ in BREAKS])
    ap.add_argument("--all-breaks", action="store_true")
    # The sub-scanline refinements. OFF by default, because the plain two-band
    # model already reproduces every NATURAL Gradius frame measured, byte for
    # byte; they only matter when something is drawn on the boundary scanline,
    # which stage 1 leaves blank. See NOTES-render.md section 7.
    ap.add_argument("--refine", action="store_true",
                    help="also model the mid-scanline fine-X change and the two "
                         "prefetched background tiles on the boundary scanline")
    ap.add_argument("--png", action="store_true", help="write mine.png / diff.png")
    a = ap.parse_args()

    d = Path(a.dir)
    if not d.is_absolute():
        d = (Path.cwd() / d).resolve()
    dump = json.loads((d / "dump.json").read_text())
    pal = (d / "pal.bin").read_bytes()
    nt = (d / "nt.bin").read_bytes()
    oam = (d / "oam.bin").read_bytes()
    fb = (d / "fb.bin").read_bytes()
    if len(fb) != W * H * 3:
        raise SystemExit(f"fb.bin is {len(fb)} bytes, expected {W*H*3}")

    mp = Path(a.palette) if a.palette else HERE / "out" / "video" / "master_palette.bin"
    if not mp.exists():
        raise SystemExit(f"no master palette at {mp} -- run palprobe.lua first")
    raw = mp.read_bytes()
    master = [(raw[i * 3], raw[i * 3 + 1], raw[i * 3 + 2]) for i in range(64)]

    banks = chr_banks(ROM)
    # Cross-check: the emulator's live CHR window must BE one of the four file
    # banks, and specifically the one the last latch of the frame selected.
    live = (d / "chr.bin").read_bytes()
    which = [i for i, b in enumerate(banks) if b == live]
    print(f"live CHR window at the sample point == file bank(s) {which}")

    def refine(m: Model) -> Model:
        if a.refine and m.split:
            m.fx_from_x = dump["split_scrollWriteCycle"] + 11
            m.bg_bank_from_x = 16
        return m

    def one(breaks: set[str]) -> tuple[int, dict[int, int]]:
        m = refine(Model(dump, breaks))
        rgb, _ = render(m, pal, nt, oam, banks, master)
        bad, per = compare(rgb, fb)
        if a.png and not breaks:
            write_png(d / "mine.png", rgb)
            diff = bytearray(rgb)
            for i in range(W * H):
                if rgb[i * 3:i * 3 + 3] != fb[i * 3:i * 3 + 3]:
                    diff[i * 3:i * 3 + 3] = b"\xff\x00\x00"
            write_png(d / "diff.png", diff)
        return bad, per

    m0 = refine(Model(dump, set()))
    print(f"\nmodel: bandA scanlines 0..{m0.bandB_from - 1} "
          f"ctrl=${m0.ctrlA:02X} scroll=({m0.scxA},{m0.scyA}) CHR bank {m0.bankA}")
    print(f"       bandB scanlines {m0.bandB_from}..239 "
          f"ctrl=${m0.ctrlB:02X} scroll=(0,{m0.scyA}) CHR bank {m0.bankB} "
          f"from scanline {m0.bank_sl} "
          f"(CNROM latch on scanline {m0.latch_sl} dot {m0.latch_dot})")

    base, per = one(set())
    print(f"\n[{'PASS' if base == 0 else 'FAIL'}] "
          f"{base} of {W*H} pixels differ from Mesen's frame")
    if base:
        for sl in sorted(per)[:20]:
            print(f"    scanline {sl:3d}: {per[sl]} px")
        if len(per) > 20:
            print(f"    ... {len(per)} scanlines affected in total")

    picked = list(a.brk)
    if a.all_breaks:
        picked = [b for b, _ in BREAKS]
    if picked:
        print("\nNEGATIVE CONTROLS -- each of these must be WORSE than the model")
        for b in picked:
            n, p = one({b})
            desc = dict(BREAKS)[b]
            rows = sorted(p)
            span = f"scanlines {rows[0]}-{rows[-1]}" if rows else "-"
            verdict = "sees it" if n > base else "BLIND"
            print(f"  [{verdict:6}] --break {b:<11} {n:>6} px  {span:<22} {desc}")
    return 0 if base == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
