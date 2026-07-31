#!/usr/bin/env python3
"""Re-render one IGS023 frame from ROM + a MAME state dump, with OUR OWN decoder,
and diff it against MAME's framebuffer.

This is the pixel layer of docs/knowledge/01-the-oracle-method.md applied to the
asset decode: the two sides are independently derived (our Python vs MAME's C++),
so a bug in one cannot hide itself in the other.

    python framerender.py --rom <romdir> --dump <dumpdir> --frame 480 --out <ripdir>

Port of igs023_video.cpp::screen_update and friends (mame0289).
"""
from __future__ import annotations
import argparse, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pgmgfx import Roms, tx_tile, bg_tile, parse_sprite_list, save_png

FILL = 0x3ff          # igs023_video.cpp:772


def be16(b):
    return np.frombuffer(b, dtype=">u2")


def load_dump(d, frame):
    def f(n):
        return open(os.path.join(d, f"f{frame:06d}.{n}"), "rb").read()
    regs = {}
    for line in f("regs.txt").decode().splitlines():
        k, v = line.split("=")
        regs[k] = int(v, 16)
    return dict(
        palette=be16(f("palette.bin")),
        spritebuffer=be16(f("spritebuffer.bin")),
        bg=be16(f("bg_videoram.bin")),
        tx=be16(f("tx_videoram.bin")),
        rowscroll=be16(f("rowscroll.bin")),
        zoomram=be16(f("zoomram.bin")),
        spriteram=be16(f("spriteram.bin")),
        pixels=f("pixels.bin"),
        regs=regs,
    )


# ------------------------------------------------------------------- tile maps

def build_bg_map(roms, bgram):
    """64x16 tiles of 32x32 -> (512, 2048) uint16 palette indexes; 0xffff = transparent."""
    out = np.full((16 * 32, 64 * 32), 0xffff, np.uint16)
    cache = {}
    for ti in range(64 * 16):
        tileno = int(bgram[ti * 2])
        attr = int(bgram[ti * 2 + 1])
        colour = (attr & 0x3e) >> 1
        flipyx = (attr & 0xc0) >> 6          # bit0 = flipx, bit1 = flipy (TILE_FLIPYX)
        key = (tileno, flipyx)
        t = cache.get(key)
        if t is None:
            t = bg_tile(roms, tileno)
            if flipyx & 1:
                t = t[:, ::-1]
            if flipyx & 2:
                t = t[::-1, :]
            cache[key] = t
        r, c = divmod(ti, 64)
        pal = (0x400 + colour * 32 + t.astype(np.uint16))
        pal[t == 31] = 0xffff                 # set_transparent_pen(31)
        out[r * 32:(r + 1) * 32, c * 32:(c + 1) * 32] = pal
    return out


def build_tx_map(roms, txram):
    """64x32 tiles of 8x8 -> (256, 512) uint16; 0xffff = transparent."""
    out = np.full((32 * 8, 64 * 8), 0xffff, np.uint16)
    cache = {}
    for ti in range(64 * 32):
        tileno = int(txram[ti * 2])
        attr = int(txram[ti * 2 + 1])
        colour = (attr & 0x3e) >> 1
        flipyx = (attr & 0xc0) >> 6
        key = (tileno, flipyx)
        t = cache.get(key)
        if t is None:
            t = tx_tile(roms, tileno)
            if flipyx & 1:
                t = t[:, ::-1]
            if flipyx & 2:
                t = t[::-1, :]
            cache[key] = t
        r, c = divmod(ti, 64)
        pal = (0x800 + colour * 16 + t.astype(np.uint16))
        pal[t == 15] = 0xffff                 # set_transparent_pen(15)
        out[r * 8:(r + 1) * 8, c * 8:(c + 1) * 8] = pal
    return out


# --------------------------------------------------------------------- sprites

def zoom_word(zoomram, z):
    """igs023_video.cpp:689 -- zoom table entry as a 32-bit mask."""
    if z >= 0x10:
        return 0
    if z == 0xf:
        return 1
    return (int(zoomram[z * 2]) << 16) | int(zoomram[z * 2 + 1])


class SpriteDrawer:
    """Direct transcription of draw_sprite_new_basic / _zoomed."""

    def __init__(self, roms, bitmap, pribitmap, W, H):
        self.mask = roms.sprmask
        self.col = roms.sprcol
        self.mlen = self.mask.size
        self.clen = self.col.size
        self.bm = bitmap
        self.pri = pribitmap
        self.W, self.H = W, H

    def _pix(self):
        v = (int(self.col[self.a & (self.clen - 1)]) >> self.abit) & 0x1f
        self.abit += 5
        if self.abit >= 15:
            self.a += 1
            self.abit = 0
        return v

    def _draw_pix(self, x, pri, y, val):
        if 0 <= x < self.W:
            if not (self.pri[y, x] & 1):
                if (not pri) or (not (self.pri[y, x] & 2)):
                    self.bm[y, x] = val
            self.pri[y, x] |= 1

    def _line_basic(self, wide, y, flip, xpos, pri, realxsize, palt, draw):
        xcnt_draw = 0
        for _ in range(wide):
            m = int(self.mask[self.b & (self.mlen - 1)])
            self.b += 1
            for _ in range(16):
                if not (m & 1):
                    val = self._pix() + palt * 32
                    if draw:
                        x = xpos + xcnt_draw if not (flip & 1) else xpos + realxsize - xcnt_draw
                        self._draw_pix(x, pri, y, val)
                    xcnt_draw += 1
                else:
                    xcnt_draw += 1
                m >>= 1

    def _line_zoom(self, wide, y, xzoom, xgrow, flip, xpos, pri, realxsize, palt, draw):
        xoffset = 0
        xcnt_draw = 0
        for _ in range(wide):
            m = int(self.mask[self.b & (self.mlen - 1)])
            self.b += 1
            for _ in range(16):
                zb = (xzoom >> (xoffset & 0x1f)) & 1
                xoffset += 1
                if not (m & 1):
                    val = self._pix() + palt * 32
                    if draw and (xgrow or not zb):
                        for _ in range(2 if zb else 1):
                            x = xpos + xcnt_draw if not (flip & 1) else xpos + realxsize - xcnt_draw
                            self._draw_pix(x, pri, y, val)
                            xcnt_draw += 1
                else:
                    if xgrow or not zb:
                        xcnt_draw += 2 if zb else 1
                m >>= 1

    def draw(self, s, zoomram):
        wide, high = s["width"], s["height"]
        if wide == 0 or high == 0:
            return
        self.b = s["offs"]
        self.a = ((int(self.mask[(self.b + 1) & (self.mlen - 1)]) << 16)
                  | int(self.mask[self.b & (self.mlen - 1)])) >> 2
        self.abit = 0
        self.b += 2
        flip, palt, pri = s["flip"], s["color"], s["pri"]
        xpos, ypos = s["x"], s["y"]

        xzom, yzom = s["xzom"], s["yzom"]
        xgrow, ygrow = s["xgrow"], s["ygrow"]
        if xgrow:
            xzom = 0x10 - xzom
        if ygrow:
            yzom = 0x10 - yzom
        xzoom = zoom_word(zoomram, xzom)
        yzoom = zoom_word(zoomram, yzom)

        if not xzoom and not yzoom:
            realysize = high - 1
            realxsize = wide * 16 - 1
            ycntdraw = 0
            for ycnt in range(high):
                y = ypos + ycntdraw if not (flip & 2) else ypos + realysize - ycntdraw
                if 0 <= y < self.H:
                    self._line_basic(wide, y, flip, xpos, pri, realxsize, palt, True)
                else:
                    self._line_basic(wide, 0, flip, xpos, pri, realxsize, palt, False)
                    if not (flip & 2):
                        if y >= self.H - 1:
                            return
                    else:
                        if y < 0:
                            return
                ycntdraw += 1
            return

        # zoomed
        realysize = 0
        for ycnt in range(high):
            zb = (yzoom >> (ycnt & 0x1f)) & 1
            if ygrow or not zb:
                realysize += 2 if zb else 1
        realysize -= 1
        realxsize = 0
        for xcnt in range(wide * 16):
            zb = (xzoom >> (xcnt & 0x1f)) & 1
            if xgrow or not zb:
                realxsize += 2 if zb else 1
        realxsize -= 1

        ycntdraw = 0
        for ycnt in range(high):
            zb = (yzoom >> (ycnt & 0x1f)) & 1
            if zb and ygrow:
                ta, tb, tbo = self.a, self.abit, self.b
                for rep in range(2):
                    if rep == 1:
                        self.a, self.abit, self.b = ta, tb, tbo
                    y = ypos + ycntdraw if not (flip & 2) else ypos + realysize - ycntdraw
                    if 0 <= y < self.H:
                        self._line_zoom(wide, y, xzoom, xgrow, flip, xpos, pri, realxsize, palt, True)
                    else:
                        self._line_zoom(wide, 0, xzoom, xgrow, flip, xpos, pri, realxsize, palt, False)
                    ycntdraw += 1
            elif zb and not ygrow:
                self._line_zoom(wide, 0, xzoom, xgrow, flip, xpos, pri, realxsize, palt, False)
            else:
                y = ypos + ycntdraw if not (flip & 2) else ypos + realysize - ycntdraw
                if 0 <= y < self.H:
                    self._line_zoom(wide, y, xzoom, xgrow, flip, xpos, pri, realxsize, palt, True)
                else:
                    self._line_zoom(wide, 0, xzoom, xgrow, flip, xpos, pri, realxsize, palt, False)
                ycntdraw += 1


# ---------------------------------------------------------------------- render

def render(roms, d, W=448, H=224, want_bg=True, want_spr=True, want_tx=True,
           scroll_sign=+1):
    regs = d["regs"]
    ctrl = regs["ctrl"]
    bitmap = np.full((H, W), FILL, np.uint16)
    pri = np.zeros((H, W), np.uint8)

    if want_bg and not (ctrl & (1 << 12)):
        bgmap = build_bg_map(roms, d["bg"])
        ys = regs["bg_yscroll"]
        xs = regs["bg_xscroll"]
        rs = d["rowscroll"]
        for y in range(H):
            srcy = (y + ys) & 0x1ff
            sx = (xs + int(rs[y])) & 0x7ff
            row = np.roll(bgmap[srcy], -scroll_sign * sx)[:W]
            m = row != 0xffff
            bitmap[y][m] = row[m]
            pri[y][m] |= 2

    if want_spr:
        sprites = parse_sprite_list(d["spritebuffer"], stride=8, limit=256)
        drawer = SpriteDrawer(roms, bitmap, pri, W, H)
        for s in reversed(sprites):                 # igs023_video.cpp:588-591
            if (ctrl >> 13) & 1 and not s["pri"]:
                continue
            drawer.draw(s, d["zoomram"])

    if want_tx and not (ctrl & (1 << 11)):
        txmap = build_tx_map(roms, d["tx"])
        ys = regs["tx_yscroll"] & 0xff
        xs = regs["tx_xscroll"] & 0x1ff
        for y in range(H):
            row = np.roll(txmap[(y + ys) & 0xff], -scroll_sign * xs)[:W]
            m = row != 0xffff
            bitmap[y][m] = row[m]

    return bitmap


def palette_rgb(pal):
    """xRGB_555, big-endian u16 -> (N,3) uint8, MAME's pal5bit expansion."""
    r = (pal >> 10) & 0x1f
    g = (pal >> 5) & 0x1f
    b = pal & 0x1f
    exp = lambda v: (v.astype(np.uint16) << 3) | (v >> 2)
    return np.stack([exp(r), exp(g), exp(b)], -1).astype(np.uint8)


def mame_pixels(raw, W=448, H=224):
    a = np.frombuffer(raw, dtype=np.uint8).reshape(H, W, 4)   # BGRA / ARGB32 LE
    return a[:, :, [2, 1, 0]].copy()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", required=True)
    ap.add_argument("--dump", required=True)
    ap.add_argument("--frame", type=int, required=True,
                    help="the frame whose STATE is used; pixels+palette come from --frame+1")
    ap.add_argument("--out", required=True)
    ap.add_argument("--scroll-sign", type=int, default=1)
    ap.add_argument("--layers", default="bg,spr,tx")
    a = ap.parse_args()

    roms = Roms(a.rom)
    # MEASURED SAMPLE-POINT OFFSET (see docs/worklog/ddpdoj/00-recon-assets.md):
    #   emu.add_machine_frame_notifier fires AFTER the game's vblank IRQ has written
    #   the next frame's video state, so the tilemap/scroll/sprite state dumped at
    #   frame N is what MAME draws in frame N+1.
    #   The PALETTE is different: screen:pixels() resolves the indexed bitmap to RGB
    #   at the end of the frame, so the palette that applies is frame N+1's.
    d = load_dump(a.dump, a.frame)
    drawn = load_dump(a.dump, a.frame + 1)
    L = a.layers.split(",")
    idx = render(roms, d, want_bg="bg" in L, want_spr="spr" in L, want_tx="tx" in L,
                 scroll_sign=a.scroll_sign)
    pal = palette_rgb(drawn["palette"])
    ours = pal[np.clip(idx, 0, len(pal) - 1)]
    ref = mame_pixels(drawn["pixels"])

    same = (ours == ref).all(axis=2)
    n = same.size
    print(f"state f{a.frame} vs pixels f{a.frame+1}: "
          f"exact pixels {same.sum()}/{n} = {100.0*same.sum()/n:.4f}%")

    os.makedirs(a.out, exist_ok=True)
    tag = f"f{a.frame:06d}"
    save_png(os.path.join(a.out, f"{tag}.ours.png"), np.rot90(ours, 1))
    save_png(os.path.join(a.out, f"{tag}.mame.png"), np.rot90(ref, 1))
    diff = np.zeros_like(ours)
    diff[~same] = (255, 0, 255)
    save_png(os.path.join(a.out, f"{tag}.diff.png"), np.rot90(diff, 1))
    print("wrote", os.path.join(a.out, tag + ".{ours,mame,diff}.png"))


if __name__ == "__main__":
    main()
