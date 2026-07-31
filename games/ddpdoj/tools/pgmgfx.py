#!/usr/bin/env python3
"""
IGS023 (PGM) graphics decoder — DoDonPachi DaiOuJou / ddpdojblk.

OUR OWN CODE. Reads ROM files, writes ROM-derived output. Nothing it produces
may be committed: run it with --out pointing inside games/ddpdoj/rip/ (gitignored).

Format authority: MAME src/mame/igs/igs023_video.cpp (BSD-3-Clause, David
Haywood) read at tag mame0289. Section references below are to that file.

    igs023 region  (0xa00000, 8-bit)   two tile GFX sets share it:
        gfx0  8x8   4bpp  "packed lsb"    32 bytes/tile   colour base 0x800, 32 pals of 16
        gfx1  32x32 5bpp  reverse-bits    640 bytes/tile  colour base 0x400, 32 pals of 32
    sprcol region  (0x2000000, 16-bit LE)  5-bit pixel stream, 3 px per u16
    sprmask region (0x1000000, 16-bit LE)  1-bit transparency mask + A-pointer header
"""

from __future__ import annotations
import os, sys, argparse
import numpy as np

# ---------------------------------------------------------------- ROM assembly

# ddpdojblk ROM_START, pgm.cpp:5361-5386. NOTE the igs023 load offset: u19 goes
# at 0x180000, NOT 0x200000 -- it OVERLAPS the top 0x80000 of pgm_t01s.rom.
IGS023_LAYOUT = [
    ("pgm_t01s.rom",        0x000000, 0x200000),
    ("cave_t04401w064.u19", 0x180000, 0x800000),
]
IGS023_SIZE = 0xa00000

SPRCOL_LAYOUT = [
    ("cave_a04401w064.u7", 0x0000000, 0x800000),
    ("cave_a04402w064.u8", 0x0800000, 0x800000),
]
SPRCOL_SIZE = 0x2000000

SPRMASK_LAYOUT = [
    ("cave_b04401w064.u1", 0x0000000, 0x800000),
]
SPRMASK_SIZE = 0x1000000

ICS_LAYOUT = [
    ("pgm_m01s.rom",        0x000000, 0x200000),
    ("cave_m04401b032.u17", 0x400000, 0x400000),
]
ICS_SIZE = 0x1000000


def _assemble(romdir, layout, size):
    buf = bytearray(size)
    for name, off, ln in layout:
        p = os.path.join(romdir, name)
        d = open(p, "rb").read()
        if len(d) != ln:
            raise SystemExit(f"{name}: expected {ln} bytes, got {len(d)}")
        buf[off:off + ln] = d
    return bytes(buf)


class Roms:
    def __init__(self, romdir):
        self.dir = romdir
        self.igs023 = _assemble(romdir, IGS023_LAYOUT, IGS023_SIZE)
        self.sprcol = np.frombuffer(_assemble(romdir, SPRCOL_LAYOUT, SPRCOL_SIZE),
                                    dtype="<u2")          # REGION16_LE
        self.sprmask = np.frombuffer(_assemble(romdir, SPRMASK_LAYOUT, SPRMASK_SIZE),
                                     dtype="<u2")         # REGION16_LE
        self.igs023_bits = np.unpackbits(
            np.frombuffer(self.igs023, dtype=np.uint8), bitorder="little")


# ------------------------------------------------------------------ tile decode
#
# MAME numbers gfx bits MSB-first inside each byte; GFXDECODE_DEVICE_REVERSEBITS
# flips that to LSB-first. gfx1 (the 32x32 BG set) is declared REVERSEBITS, so
# its bit b lives at  byte b>>3, bit b&7  -- i.e. a plain LSB-first bitstream.
# We keep the whole region unpacked LSB-first once and index it.

BG_W = BG_H = 32
BG_BPP = 5
BG_BYTES = BG_W * BG_H * BG_BPP // 8            # 640

def bg_tile(roms: Roms, index: int) -> np.ndarray:
    """32x32 uint8 of 5-bit colour indexes (0..31). pgm32_charlayout."""
    base = index * BG_W * BG_H * BG_BPP          # bit address
    b = roms.igs023_bits[base: base + BG_W * BG_H * BG_BPP]
    if b.size < BG_W * BG_H * BG_BPP:
        return np.zeros((BG_H, BG_W), np.uint8)
    b = b.reshape(BG_H, BG_W, BG_BPP)
    # planeoffset {4,3,2,1,0}: bit +0 is the LSB of the pixel, +4 the MSB.
    w = np.array([1, 2, 4, 8, 16], np.uint8)
    return (b * w).sum(axis=2).astype(np.uint8)


TX_W = TX_H = 8
TX_BYTES = 32

def tx_tile(roms: Roms, index: int, nibble_lo_first=True, msb_bits=True) -> np.ndarray:
    """8x8 uint8 of 4-bit colour indexes. gfx_8x8x4_packed_lsb.

    Two conventions are parametrised because MAME's canonical layout constant is
    not in the driver file; both are rendered and compared against MAME's own
    framebuffer by txcheck (see worklog). Defaults are the ones that matched.
    """
    off = index * TX_BYTES
    d = np.frombuffer(roms.igs023[off:off + TX_BYTES], dtype=np.uint8)
    if d.size < TX_BYTES:
        return np.zeros((TX_H, TX_W), np.uint8)
    lo = d & 0x0f
    hi = d >> 4
    if not msb_bits:
        rev = np.array([int(f"{v:04b}"[::-1], 2) for v in range(16)], np.uint8)
        lo, hi = rev[lo], rev[hi]
    a, b = (lo, hi) if nibble_lo_first else (hi, lo)
    out = np.empty(64, np.uint8)
    out[0::2] = a
    out[1::2] = b
    return out.reshape(TX_H, TX_W)


# ---------------------------------------------------------------- sprite decode
#
# igs023_video.cpp:349-582.  A sprite record gives a WORD offset into sprmask.
# The first two u16 there are a header, not mask data:
#     aoffset = (mask[o+1] << 16 | mask[o+0]) >> 2      -> word index into sprcol
# then mask data begins at o+2.  Per line, `wide` mask words are consumed, LSB
# first; a SET bit is transparent, a CLEAR bit consumes the next 5-bit pixel out
# of the sprcol stream (3 px per u16, bits 0-4 / 5-9 / 10-14; bit 15 unused).

def sprite_pixels(roms: Roms, offs_words: int, wide: int, high: int):
    """Returns (h, w*16) int16 array; -1 = transparent, else 0..31."""
    mask = roms.sprmask
    col = roms.sprcol
    mlen = mask.size
    clen = col.size
    a = ((int(mask[(offs_words + 1) & (mlen - 1)]) << 16)
         | int(mask[offs_words & (mlen - 1)])) >> 2
    abit = 0
    b = offs_words + 2
    out = np.full((high, wide * 16), -1, np.int16)
    for y in range(high):
        x = 0
        for _ in range(wide):
            m = int(mask[b & (mlen - 1)])
            b += 1
            for _ in range(16):
                if not (m & 1):
                    out[y, x] = (int(col[a & (clen - 1)]) >> abit) & 0x1f
                    abit += 5
                    if abit >= 15:
                        a += 1
                        abit = 0
                x += 1
                m >>= 1
    return out, a, abit


def sprite_header(roms: Roms, offs_words: int) -> int:
    mask = roms.sprmask
    mlen = mask.size
    return ((int(mask[(offs_words + 1) & (mlen - 1)]) << 16)
            | int(mask[offs_words & (mlen - 1)])) >> 2


# ------------------------------------------------------------------ sprite list
#
# igs023_video.cpp:640-696. 5 u16 per entry in RAM, expanded to 8 u16 per entry
# in the post-DMA buffer. Word 4 == 0 (masked 0x7fff) terminates.

def parse_sprite_list(words, stride=5, limit=256):
    """words: sequence of u16 (big-endian 68k RAM already converted). Yields dicts."""
    out = []
    ram_mask = (0xffff, 0xfbff, 0x7fff, 0xffff, 0xffff)
    for i in range(limit):
        base = i * stride
        if base + 4 >= len(words):
            break
        s = [int(words[base + k]) & ram_mask[k] for k in range(5)]
        if (s[4] & 0x7fff) == 0:
            break
        def sext(v, bits):
            return v - (1 << bits) if v & (1 << (bits - 1)) else v
        out.append(dict(
            i=i,
            xgrow=bool(s[0] & 0x8000), xzom=(s[0] & 0x7800) >> 11,
            x=sext(s[0] & 0x07ff, 11),
            ygrow=bool(s[1] & 0x8000), yzom=(s[1] & 0x7800) >> 11,
            y=sext(s[1] & 0x03ff, 10),
            flip=(s[2] & 0x6000) >> 13,          # bit0 = flipx, bit1 = flipy
            color=(s[2] & 0x1f00) >> 8,
            pri=(s[2] >> 7) & 1,
            offs=((s[2] & 0x007f) << 16) | s[3],
            width=(s[4] & 0x7e00) >> 9,
            height=s[4] & 0x01ff,
            raw=tuple(s),
        ))
    return out


# ------------------------------------------------------------------------ output

def save_png(path, rgb):
    from PIL import Image
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    Image.fromarray(rgb, "RGB").save(path)
    return path


def gray_pal(n):
    v = (np.arange(n) * 255 // (n - 1)).astype(np.uint8)
    return np.stack([v, v, v], 1)


def sheet(tiles, cols, pal, gap=0, bg=(255, 0, 255)):
    th, tw = tiles[0].shape
    rows = (len(tiles) + cols - 1) // cols
    H = rows * (th + gap) - (gap if gap else 0)
    W = cols * (tw + gap) - (gap if gap else 0)
    img = np.zeros((H, W, 3), np.uint8)
    img[:] = bg
    for k, t in enumerate(tiles):
        r, c = divmod(k, cols)
        y, x = r * (th + gap), c * (tw + gap)
        idx = np.clip(t, 0, len(pal) - 1)
        img[y:y + th, x:x + tw] = pal[idx]
    return img
