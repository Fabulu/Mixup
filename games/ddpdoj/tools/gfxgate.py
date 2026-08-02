#!/usr/bin/env python3
"""THE PIXEL GATE FOR THE IGS023 ASSET DECODE.

For every dumped frame pair (N, N+1) in --dump, re-render frame N's state with
OUR OWN decoder and diff it against MAME's framebuffer for frame N+1.  The two
sides are independently derived -- our Python against MAME's C++ -- which is
what makes this evidence rather than a tautology (docs/knowledge/03, "two sides
of a comparison").

    python gfxgate.py --rom <romdir> --dump <dumpdir> --min-pairs 12
    python gfxgate.py --rom <romdir> --dump <dumpdir> --mutate list

IT IS A GATE, NOT A REPORT.  Exit code 1 if ANY pair is not 100.0000 %, and
**also** exit code 1 if fewer than --min-pairs pairs were produced.  The second
half matters more than the first: a run whose MAME half silently produced no
dumps would otherwise print "ALL EXACT: 0 pairs" and pass.  That is
docs/knowledge/03's whole subject.

THE TWO SAMPLE-POINT OFFSETS, measured in 00-recon-assets.md §4 and NOT to be
re-derived:
  * state read at video frame N is what MAME DRAWS in frame N+1
    (emu.add_machine_frame_notifier fires after the game's vblank IRQ has
    already written the next frame's video state).
  * the PALETTE that applies is frame N+1's, because screen:pixels() resolves
    the indexed bitmap to RGB at the END of the frame.  Measured: state f5500
    with palette f5500 -> 17.836 %, with palette f5501 -> 100.000 %.  Only a
    palette-fade frame exposes the difference.

Per-frame it prints sprite count, zoomed-sprite count and paldelta, because a
green run over blank frames proves nothing.
"""
from __future__ import annotations
import argparse, glob, json, os, re, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pgmgfx
from pgmgfx import Roms, parse_sprite_list
import framerender as FR


# ---------------------------------------------------------------- mutations
#
# RED VALIDATION.  "A check that has never been seen fail is not evidence"
# (docs/knowledge/03).  Each of these breaks one specific thing the decoder
# claims to get right; the gate must go RED on every one of them.  The last two
# are deliberately the two traps this project has actually made or nearly made:
# the u19 load offset, and the sprite draw order.

def _mut_tx_msb(roms):
    """TX nibble order flipped: gfx_8x8x4_packed_MSB instead of _lsb."""
    orig = pgmgfx.tx_tile
    FR.tx_tile = lambda r, i, **kw: orig(r, i, nibble_lo_first=False)


def _mut_bg_planes(roms):
    """BG 5-bit plane weights reversed (planeoffset {0,1,2,3,4})."""
    def bad(r, index):
        base = index * 32 * 32 * 5
        b = r.igs023_bits[base: base + 32 * 32 * 5]
        if b.size < 32 * 32 * 5:
            return np.zeros((32, 32), np.uint8)
        b = b.reshape(32, 32, 5)
        w = np.array([16, 8, 4, 2, 1], np.uint8)
        return (b * w).sum(axis=2).astype(np.uint8)
    FR.bg_tile = bad


def _mut_spr_mask(roms):
    """Sprite transparency-mask bit polarity inverted (set bit = opaque)."""
    def line_basic(self, wide, y, flip, xpos, pri, realxsize, palt, draw):
        xcnt_draw = 0
        for _ in range(wide):
            m = int(self.mask[self.b & (self.mlen - 1)])
            self.b += 1
            for _ in range(16):
                if (m & 1):                       # INVERTED
                    val = self._pix() + palt * 32
                    if draw:
                        x = xpos + xcnt_draw if not (flip & 1) else xpos + realxsize - xcnt_draw
                        self._draw_pix(x, pri, y, val)
                xcnt_draw += 1
                m >>= 1
    FR.SpriteDrawer._line_basic = line_basic


def _mut_zoom_off(roms):
    """Break the zoom loop: pretend every sprite is unzoomed."""
    FR.zoom_word = lambda zoomram, z: 0


def _mut_spr_order(roms):
    """Draw the display list FORWARDS.  NOTES-machine.md believed this until
    00-recon-assets.md §3 measured it: the list is walked BACKWARDS with
    first-drawn-wins, so a HIGHER list index draws IN FRONT."""
    FR.SPRITE_ORDER_REVERSED = False


def _mut_u19_at_200000(roms):
    """Load cave_t04401w064.u19 at 0x200000 instead of 0x180000.  pgm.cpp:5369
    puts it at 0x180000, where it OVERWRITES the top 0x80000 of pgm_t01s.rom.
    Getting this wrong silently shifts every tile index above 0xC000 -- it is
    the single most inviting mistake in the whole region assembly, so the gate
    is required to catch it."""
    pgmgfx.IGS023_LAYOUT = [
        ("pgm_t01s.rom",        0x000000, 0x200000),
        ("cave_t04401w064.u19", 0x200000, 0x800000),
    ]
    pgmgfx.IGS023_SIZE = 0xa00000


def _mut_zoom_f_literal(roms):
    """Read zoom-table entry $F LITERALLY (the ROM holds 0) instead of
    substituting 1.  WAVE 11: `$23C588`'s sixteen words are a monotone popcount
    ramp 16,15,...,2 whose LAST term is missing, and 1 is exactly the term the
    ramp predicts -- which is also what MAME inserts, with a comment saying it
    does not know why.  The game DOES index that entry (34 x-records and 18
    y-records over 5,000 logic frames, 10-recon-display-list §6b), so this is a
    live rule and not a curiosity."""
    def zw(zoomram, z):
        if z >= 0x10:
            return 0
        return (int(zoomram[z * 2]) << 16) | int(zoomram[z * 2 + 1])
    FR.zoom_word = zw


MUTATIONS = {
    "tx-msb": _mut_tx_msb,
    "bg-planes": _mut_bg_planes,
    "spr-mask": _mut_spr_mask,
    "zoom-off": _mut_zoom_off,
    "spr-order": _mut_spr_order,
    "u19-at-200000": _mut_u19_at_200000,
}

# MUTATIONS THAT ARE INVISIBLE ON THE NATURAL CORPUS, kept OUT of the `--mutate
# all` sweep for a MEASURED reason rather than quietly dropped.  `zoom-f-literal`
# only moves a pixel on a frame that reaches effective zoom index $F; the
# 16-pair gfx-gate corpus contains none (measured, wave 11 -- see the worklog),
# so putting it in MUTATIONS would make `pgm.py gfx --mutate all` report a
# permanent false failure.  It is red-validated where the case EXISTS: on the
# `pgm.py zoomcov` dumps, whose poker drives index $F through BOTH encodings on
# BOTH axes.
EXTRA_MUTATIONS = {
    "zoom-f-literal": _mut_zoom_f_literal,
}
ALL_MUTATIONS = {**MUTATIONS, **EXTRA_MUTATIONS}


def eff_zoom(s, zr):
    xz, yz = s["xzom"], s["yzom"]
    if s["xgrow"]:
        xz = 0x10 - xz
    if s["ygrow"]:
        yz = 0x10 - yz
    return FR.zoom_word(zr, xz), FR.zoom_word(zr, yz)


def pairs_in(dumpdir):
    frames = sorted(int(re.search(r"f(\d+)\.pixels\.bin$", p).group(1))
                    for p in glob.glob(os.path.join(dumpdir, "f*.pixels.bin")))
    fs = set(frames)
    # A pair is two CONSECUTIVE video frames both of which were dumped.  Taking
    # every (n, n+1) would double-count a run of three; the dumper writes the
    # pair back to back, so pairs start on the even member of each run.
    out, used = [], set()
    for n in frames:
        if n in used or n + 1 not in fs:
            continue
        out.append((n, n + 1))
        used.add(n)
        used.add(n + 1)
    return out


def run(rom, dump, min_pairs=0, mutate=None, jsonout=None, quiet=False):
    if mutate:
        ALL_MUTATIONS[mutate](None)
    roms = Roms(rom)
    prs = pairs_in(dump)
    ok, tot, totn, rows = True, 0, 0, []
    for n, m in prs:
        ds, dp = FR.load_dump(dump, n), FR.load_dump(dump, m)
        idx = FR.render(roms, ds)
        pal = FR.palette_rgb(dp["palette"])
        ours = pal[np.clip(idx, 0, len(pal) - 1)]
        ref = FR.mame_pixels(dp["pixels"])
        same = (ours == ref).all(axis=2)
        sp = parse_sprite_list(ds["spritebuffer"], stride=8, limit=256)
        nz = sum(1 for s in sp if eff_zoom(s, ds["zoomram"]) != (0, 0))
        tot += int(same.sum())
        totn += same.size
        good = bool(same.all())
        ok &= good
        rows.append(dict(state=n, pixels=m, exact=int(same.sum()), total=int(same.size),
                         sprites=len(sp), zoomed=nz, bg_scale=ds["regs"]["bg_scale"],
                         ctrl=ds["regs"]["ctrl"],
                         paldelta=int((ds["palette"] != dp["palette"]).sum())))
        if not quiet:
            print(f"{'OK  ' if good else 'FAIL'} state f{n} -> pixels f{m}: "
                  f"{same.sum()}/{same.size} = {100*same.sum()/same.size:8.4f}%  "
                  f"sprites={len(sp):3d} zoomed={nz:2d} "
                  f"bgx={ds['regs']['bg_xscroll']:#06x} bgy={ds['regs']['bg_yscroll']:#06x} "
                  f"ctrl={ds['regs']['ctrl']:#06x} scale={ds['regs']['bg_scale']:#06x} "
                  f"paldelta={rows[-1]['paldelta']}")
    pct = (100.0 * tot / totn) if totn else 0.0
    enough = len(prs) >= min_pairs
    # bg_scale != 0x210 means MAME rendered this frame WITHOUT a feature the
    # hardware has (igs023_video.cpp:193 leaves the register unimplemented), so
    # a 100 % score on it would be agreement between two wrong pictures. Fail
    # the pair rather than score it.
    scaled = [r for r in rows if r["bg_scale"] != 0x210]
    if scaled:
        print(f"FAIL {len(scaled)} pair(s) were drawn with bg_scale != 0x210 "
              f"(100%): {[(r['state'], hex(r['bg_scale'])) for r in scaled]}. "
              f"MAME DOES NOT IMPLEMENT bg_scale, so those comparisons are "
              f"worthless in both directions. Escalate -- the ORACLE is wrong "
              f"there, not the decoder.")
    verdict = "PASS" if (ok and enough and prs and not scaled) else "FAIL"
    print(f"{verdict}: {tot}/{totn} = {pct:.4f}% over {len(prs)} frame pair(s)"
          + ("" if enough else f"  -- TOO FEW PAIRS: {len(prs)} < {min_pairs} "
                              f"required. A gate with no input is not a pass."))
    if jsonout:
        json.dump(dict(verdict=verdict, pairs=len(prs), exact=tot, total=totn,
                       pct=pct, mutation=mutate, rows=rows),
                  open(jsonout, "w"), indent=1)
    return 0 if verdict == "PASS" else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rom", required=True)
    ap.add_argument("--dump", required=True)
    ap.add_argument("--min-pairs", type=int, default=0,
                    help="FAIL (not skip) if fewer pairs than this were dumped")
    ap.add_argument("--mutate", default=None,
                    help=f"red-validate: one of {sorted(ALL_MUTATIONS)} or 'list'")
    ap.add_argument("--json", dest="jsonout", default=None)
    a = ap.parse_args()
    if a.mutate == "list":
        for k, f in ALL_MUTATIONS.items():
            print(f"{k:16s} {f.__doc__.splitlines()[0]}")
        return 0
    if a.mutate and a.mutate not in ALL_MUTATIONS:
        raise SystemExit(f"unknown mutation {a.mutate}; have {sorted(ALL_MUTATIONS)}")
    return run(a.rom, a.dump, a.min_pairs, a.mutate, a.jsonout)


if __name__ == "__main__":
    sys.exit(main())
