#!/usr/bin/env python3
"""Shared helpers for the Batman - Return of the Joker rippers.

ROM access, 2bpp tile decoding and a minimal stdlib-only PNG encoder.
No third-party dependencies (zlib and struct are stdlib).
"""
import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROM_NAME = "Batman - Return of the Joker (USA, Europe).gb"

# The directory holding the game these tools export INTO -- its src/, tests/
# and assets/. ROOT stays the repository: the ROM, rip/ and dist/ are repo
# level, the exported assets are game level. Same seam as GAME_ROOT in
# tools/oracle/_env.mjs, and it must agree with it.
GAME_ROOT = os.path.join(ROOT, 'games', 'batman')

# DMG greys for BGP/OBP colour indices 0..3
DMG = [(0xE0, 0xF8, 0xD0), (0x88, 0xC0, 0x70), (0x34, 0x68, 0x56), (0x08, 0x18, 0x20)]


class Rom:
    def __init__(self, path=None):
        path = path or os.path.join(ROOT, ROM_NAME)
        with open(path, 'rb') as f:
            self.data = f.read()

    def off(self, bank, addr):
        """(bank, cpu address) -> file offset. bank 0 is $0000-$3FFF."""
        if bank == 0:
            return addr & 0x3FFF
        return bank * 0x4000 + (addr & 0x3FFF)

    def rd(self, bank, addr, n):
        o = self.off(bank, addr)
        return self.data[o:o + n]

    def u8(self, bank, addr):
        return self.data[self.off(bank, addr)]

    def u16(self, bank, addr):
        o = self.off(bank, addr)
        return self.data[o] | (self.data[o + 1] << 8)


def decode_tile(buf):
    """16 bytes 2bpp -> list of 8 rows of 8 colour indices (0..3)."""
    rows = []
    for y in range(8):
        lo = buf[y * 2]
        hi = buf[y * 2 + 1]
        row = []
        for x in range(8):
            b = 7 - x
            row.append(((lo >> b) & 1) | (((hi >> b) & 1) << 1))
        rows.append(row)
    return rows


def bgp_map(bgp):
    """BGP/OBP register byte -> list mapping colour index -> shade 0..3."""
    return [(bgp >> (i * 2)) & 3 for i in range(4)]


def write_png(path, width, height, pixels, palette=None):
    """pixels: flat bytearray of palette indices (0..3), row-major.

    Writes an 8-bit indexed PNG.  palette = list of (r,g,b), default DMG greys.
    """
    palette = palette or DMG
    raw = bytearray()
    for y in range(height):
        raw.append(0)  # filter type 0
        raw += pixels[y * width:(y + 1) * width]

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    out = b'\x89PNG\r\n\x1a\n'
    out += chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 3, 0, 0, 0))
    plte = b''.join(bytes(c) for c in palette)
    out += chunk(b'PLTE', plte)
    out += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    out += chunk(b'IEND', b'')
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    with open(path, 'wb') as f:
        f.write(out)
    return path


class Vram:
    """$8000-$9FFF byte array with the game's tile addressing helpers."""

    def __init__(self):
        self.mem = bytearray(0x2000)

    def write(self, addr, data):
        a = addr - 0x8000
        self.mem[a:a + len(data)] = data

    def tile_bg(self, tid):
        """LCDC bit4 = 0 (this game always writes rLCDC=$E7): signed BG tiles."""
        if tid < 0x80:
            base = 0x9000 + tid * 16
        else:
            base = 0x8800 + (tid - 0x80) * 16
        return self.mem[base - 0x8000: base - 0x8000 + 16]

    def tile_obj(self, tid):
        base = 0x8000 + tid * 16
        return self.mem[base - 0x8000: base - 0x8000 + 16]


# ---------------------------------------------------------------- ROM tables

RESOURCE_TABLE = 0x0B43          # 0:$0B43, 36 x {bank, ptr_lo, ptr_hi}
RESOURCE_COUNT = 36
LEVEL_RES_LIST = 0x7C7D          # 1:$7C7D, 8 bytes/level, $FF terminated
LEVEL_START_POS = 0x7CED         # 1:$7CED, {startX_metatile, startY_metatile}
LEVEL_MAP_TABLE = 0x4000         # 3:$4000, 16 LE pointers
LEVEL_COLL_TABLE = 0x7A2A        # 3:$7A2A, 14 LE pointers
METATILE_DEF_TABLE = 0x4000      # 5:$4000, 4 bytes/level {len_lo,len_hi,src_lo,src_hi}
ENEMY_SPAWN_TABLE = 0x46EC       # 5:$46EC, 3 bytes/level {src_lo,src_hi,count}
OBJECT_SPAWN_TABLE = 0x4716      # 5:$4716, 3 bytes/level {src_lo,src_hi,count}
NUM_LEVELS = 14


def load_resource(rom, vram, idx):
    """Emulate sub_00_0B15.  Returns (bank, src, dest, length) or None."""
    b = rom.rd(0, RESOURCE_TABLE + idx * 3, 3)
    bank, src = b[0], b[1] | (b[2] << 8)
    if src == 0xFFFF:
        return None
    hdr = rom.rd(bank, src, 4)
    dest = hdr[0] | (hdr[1] << 8)
    length = hdr[2] | (hdr[3] << 8)
    payload = rom.rd(bank, src + 4, length)
    if vram is not None and 0x8000 <= dest < 0xA000:
        vram.write(dest, payload)
    return bank, src, dest, length


def level_resource_indices(rom, level):
    out = []
    for i in range(8):
        v = rom.u8(1, LEVEL_RES_LIST + (level - 1) * 8 + i)
        if v == 0xFF:
            break
        out.append(v)
    return out


def build_level_vram(rom, level):
    """Replay sub_00_333F's three loads then sub_00_2889's per-level list."""
    v = Vram()
    for idx in (0x02, 0x1D, 0x05):     # 00:3374-3382 (stage-intro screen)
        load_resource(rom, v, idx)
    for idx in level_resource_indices(rom, level):
        load_resource(rom, v, idx)
    return v


def level_map(rom, level):
    """-> (width, [width*16] metatile ids, column-major top-to-bottom)."""
    p = rom.u16(3, LEVEL_MAP_TABLE + (level - 1) * 2)
    w = rom.u8(3, p)
    return w, list(rom.rd(3, p + 1, w * 16))


def level_collision_lut(rom, level, n=256):
    p = rom.u16(3, LEVEL_COLL_TABLE + (level - 1) * 2)
    return list(rom.rd(3, p, n))


def level_metatiles(rom, level):
    """-> list of (TL, BL, TR, BR) tile ids, exactly as copied to $C368."""
    e = rom.rd(5, METATILE_DEF_TABLE + (level - 1) * 4, 4)
    ln = e[0] | (e[1] << 8)
    src = e[2] | (e[3] << 8)
    if ln == 0:
        return []
    raw = rom.rd(5, src, ln)
    return [tuple(raw[i:i + 4]) for i in range(0, ln - 3, 4)]
