#!/usr/bin/env python3
r"""ASSET EXPORT + MANIFEST + INTEGRITY CHECKER for ddpdojblk (wave 3 item 3).

    python assets.py extract     fresh extraction of the ROMs from ddpdojblk.7z
    python assets.py export      TX tiles, BG tiles, palettes, sprites, manifest
    python assets.py check       the integrity checker
    python assets.py check --mutate <name>    red-validate the checker

EVERYTHING THIS WRITES IS ROM-DERIVED and goes under games/ddpdoj/rip/assets/,
which is gitignored twice over (the repo-root unanchored `rip/` rule, and
games/ddpdoj/rip/.gitignore containing `*`).  Nothing here may be committed.

THE SPRITE POLICY, DECIDED CONSCIOUSLY AND RECORDED IN THE MANIFEST.
Sprites on the IGS023 cannot be enumerated statically: a record in 68k RAM
carries a 23-bit word offset into the mask ROM, where a two-word header points
into a length-compressed colour stream.  There is no table, and no validated way
to tell a real header from two bytes that look like one.  So the exporter
HARVESTS every `offs` the game actually used across the scenario corpus -- a
measurement -- rather than walking the mask ROM, which would be a guess.  The
manifest says so, names the corpus, and states the consequence: the atlas
provably contains what the corpus displayed and nothing more.

THE INTEGRITY CHECKER IS DELIBERATELY THE OTHER SIDE OF THE COMPARISON.
docs/knowledge/03: "two sides of a comparison".  `check` does NOT import
pgmgfx's region assembly or its tile decoders.  It re-reads the ROM FILES at raw
file offsets with plain seek/read, re-derives the region arithmetic from its own
transcription of pgm.cpp's ROM_START, and decodes tiles with a bit-by-bit loop
that shares no code with the numpy path.  If both sides were wrong in the same
way the check would be worthless, so they are written not to be able to be.
"""
from __future__ import annotations
import argparse, glob, hashlib, json, os, re, shutil, subprocess, sys, zlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
GAME = HERE.parent
RIP = GAME / "rip"
ROMDIR = RIP / "rom"
OUTDIR = RIP / "assets"
ARCHIVE = Path(os.environ.get("PGM_ROMPATH", "C:/oldpcsx2")) / "ddpdojblk.7z"

# --------------------------------------------------------------------------
# ROM_START( ddpdojblk ), pgm.cpp:5361-5386.  TRANSCRIBED INDEPENDENTLY HERE --
# `check` must not share this table with pgmgfx.py, because a wrong offset in
# one shared table would satisfy both sides of the comparison.
#
#   >>> cave_t04401w064.u19 LOADS AT 0x180000, NOT 0x200000. <<<
# It OVERWRITES the top 0x80000 of pgm_t01s.rom.  Get it wrong and every tile
# index above 0xC000 shifts, silently, in a way that still renders plausible
# pictures.  The checker verifies the overlap byte for byte, in both directions.
# --------------------------------------------------------------------------
REGIONS = {
    "igs023": (0xa00000, [("pgm_t01s.rom", 0x000000, 0x200000),
                          ("cave_t04401w064.u19", 0x180000, 0x800000)]),
    "sprcol": (0x2000000, [("cave_a04401w064.u7", 0x0000000, 0x800000),
                           ("cave_a04402w064.u8", 0x0800000, 0x800000)]),
    "sprmask": (0x1000000, [("cave_b04401w064.u1", 0x0000000, 0x800000)]),
    "ics": (0x1000000, [("pgm_m01s.rom", 0x000000, 0x200000),
                        ("cave_m04401b032.u17", 0x400000, 0x400000)]),
}
ROM_FILES = ["cave_a04401w064.u7", "cave_a04402w064.u8", "cave_b04401w064.u1",
             "cave_m04401b032.u17", "cave_t04401w064.u19",
             "ddb10_10_8_434f.u45", "ddp3_bios.u37", "ddp3blk_defaults.nv",
             "pgm_m01s.rom", "pgm_t01s.rom"]

BG_BYTES = 32 * 32 * 5 // 8          # 640
TX_BYTES = 8 * 8 * 4 // 8            # 32
N_BG = 0xa00000 // BG_BYTES          # 16384 tiles fit the region
N_TX = 0x200000 // TX_BYTES          # 65536 -- the TX tile number is 16-bit


def sha256(p: Path) -> str:
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


# ------------------------------------------------------------------- extract
def cmd_extract(argv):
    """A FRESH extraction from the archive, so `check` is checking the ROMs and
    not a directory somebody edited.  MAME resolves ddpdojblk from the .7z; if
    a .zip has crept back beside it MAME silently prefers the zip, which is how
    a BAD set once looked good (NOTES-versions.md)."""
    exe = None
    for c in (r"C:\Program Files\7-Zip\7z.exe", r"C:\Program Files (x86)\7-Zip\7z.exe",
              shutil.which("7z") or ""):
        if c and Path(c).exists():
            exe = c
            break
    if not exe:
        raise SystemExit("7-Zip not found; extract ddpdojblk.7z into "
                         f"{ROMDIR} by hand")
    if not ARCHIVE.exists():
        raise SystemExit(f"{ARCHIVE} not found")
    if ROMDIR.exists():
        shutil.rmtree(ROMDIR)
    ROMDIR.mkdir(parents=True)
    r = subprocess.run([exe, "x", "-y", f"-o{ROMDIR}", str(ARCHIVE)],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stdout, r.stderr)
        raise SystemExit(f"7z exit {r.returncode}")
    for n in ROM_FILES:
        p = ROMDIR / n
        print(f"  {n:26s} {p.stat().st_size:>9d}  sha256={sha256(p)[:16]}...")
    print(f"extracted {ARCHIVE} -> {ROMDIR}")
    return 0


# -------------------------------------------------------------------- export
def cmd_export(argv):
    sys.path.insert(0, str(HERE))
    import numpy as np
    from pgmgfx import (Roms, bg_tile, tx_tile, sprite_pixels, sprite_header,
                        save_png, sheet, gray_pal)

    ap = argparse.ArgumentParser(prog="assets.py export")
    ap.add_argument("--rom", default=str(ROMDIR))
    ap.add_argument("--out", default=str(OUTDIR))
    ap.add_argument("--harvest", action="append", default=None,
                    help="sprite-harvest TSVs from `pgm.py sprites` (repeatable)")
    ap.add_argument("--dumps", action="append", default=None,
                    help="gfx dump dirs to take palette snapshots from")
    a = ap.parse_args(argv)
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    # A .gitignore in the same breath as the directory, per the worklog rule.
    (out / ".gitignore").write_text("*\n", encoding="utf8")
    roms = Roms(a.rom)
    man = {
        "_what": "ROM-DERIVED ASSET EXPORT for ddpdojblk (DoDonPachi DaiOuJou "
                 "Black Label, VERSION-B). NOTHING HERE MAY BE COMMITTED.",
        "set": "ddpdojblk",
        "generated_by": "games/ddpdoj/tools/assets.py export",
        "region_layout_note":
            "cave_t04401w064.u19 loads at 0x180000, NOT 0x200000: it overwrites "
            "the top 0x80000 of pgm_t01s.rom (pgm.cpp:5369-5382). Every TX tile "
            "index >= 0xC000 therefore lands in u19. Getting this wrong shifts "
            "every high tile index silently.",
        "regions": {k: {"size": v[0],
                        "files": [{"name": n, "offset": o, "length": l}
                                  for n, o, l in v[1]]}
                    for k, v in REGIONS.items()},
        "roms": [],
    }
    for n in ROM_FILES:
        p = Path(a.rom) / n
        if not p.exists():
            raise SystemExit(f"{p} missing -- run `assets.py extract`")
        d = p.read_bytes()
        man["roms"].append({"name": n, "size": len(d), "sha256": sha256(p),
                            "crc32": f"{zlib.crc32(d) & 0xffffffff:08x}"})

    # ---- TX tiles: 8x8, 4bpp, one byte per pixel in the export
    txbin = out / "tx.tiles.bin"
    buf = np.empty((N_TX, 8, 8), np.uint8)
    for i in range(N_TX):
        buf[i] = tx_tile(roms, i)
    txbin.write_bytes(buf.tobytes())
    man["tx"] = {"tiles": N_TX, "w": 8, "h": 8, "bpp": 4,
                 "palette_base": 0x800, "entries_per_bank": 16,
                 "transparent_pen": 15, "format": "one uint8 per pixel, "
                 "row-major, tile-major", "file": txbin.name,
                 "bytes": txbin.stat().st_size, "sha256": sha256(txbin)}
    print(f"  tx  {N_TX} tiles -> {txbin.name}")

    # ---- BG tiles: 32x32, 5bpp
    bgbin = out / "bg.tiles.bin"
    with open(bgbin, "wb") as f:
        for i in range(N_BG):
            f.write(bg_tile(roms, i).tobytes())
    man["bg"] = {"tiles": N_BG, "w": 32, "h": 32, "bpp": 5,
                 "palette_base": 0x400, "entries_per_bank": 32,
                 "transparent_pen": 31, "format": "one uint8 per pixel, "
                 "row-major, tile-major", "file": bgbin.name,
                 "bytes": bgbin.stat().st_size, "sha256": sha256(bgbin)}
    print(f"  bg  {N_BG} tiles -> {bgbin.name}")

    # ---- palettes: these live in RAM, not ROM, so they are HARVESTED from the
    #      dumped frames.  Each snapshot is 2560 xRGB_555 big-endian entries.
    pals, palsrc = [], []
    for dd in (a.dumps or [str(RIP / "gfx-gate")]):
        for p in sorted(glob.glob(os.path.join(dd, "f*.palette.bin"))):
            b = open(p, "rb").read()
            if b not in pals:
                pals.append(b)
                palsrc.append(os.path.relpath(p, str(RIP)))
    if pals:
        pf = out / "palettes.bin"
        pf.write_bytes(b"".join(pals))
        man["palettes"] = {"snapshots": len(pals), "entries": 2560,
                           "format": "xRGB_555 big-endian u16; sprites 0x000-0x3FF "
                                     "(32 banks x 32), BG 0x400-0x7FF (32 x 32), "
                                     "TX 0x800-0x9FF (32 x 16); screen cleared to "
                                     "entry 0x3FF",
                           "source": "RAM SNAPSHOTS from the corpus, not ROM",
                           "from": palsrc, "file": pf.name, "sha256": sha256(pf)}
        print(f"  pal {len(pals)} distinct snapshots -> {pf.name}")

    # ---- sprites: the HARVEST policy (see the module docstring)
    hv = a.harvest or sorted(str(p) for p in (RIP / "harvest").glob("*.tsv"))
    seen, corpus = {}, []
    for h in hv:
        corpus.append(os.path.basename(h))
        for line in open(h, encoding="utf8").read().splitlines()[1:]:
            offs, w, ht, col, first, draws = line.split("\t")
            k = (int(offs, 16), int(w), int(ht))
            e = seen.setdefault(k, {"offs": int(offs, 16), "width": int(w),
                                    "height": int(ht), "colors": [], "draws": 0})
            if int(col) not in e["colors"]:
                e["colors"].append(int(col))
            e["draws"] += int(draws)
    sprites = []
    if seen:
        sd = out / "sprites"
        sd.mkdir(exist_ok=True)
        with open(sd / "sprites.bin", "wb") as f:
            for k in sorted(seen):
                e = seen[k]
                if e["width"] == 0 or e["height"] == 0:
                    e["skipped"] = "zero-sized record"
                    sprites.append(e)
                    continue
                px, _, _ = sprite_pixels(roms, e["offs"], e["width"], e["height"])
                # the 2-word header at `offs` in sprmask -> a WORD index into
                # sprcol; recorded so a reader can find the stream without
                # re-deriving igs023_video.cpp:354-358
                e["aoffset"] = sprite_header(roms, e["offs"])
                e["file_offset"] = f.tell()
                e["bytes"] = px.size
                # -1 (transparent) is stored as 255; 0..31 are colour indexes
                f.write(np.where(px < 0, 255, px).astype(np.uint8).tobytes())
                sprites.append(e)
        man["sprites"] = {
            "policy": "HARVESTED FROM THE RUNNING GAME, not statically walked.",
            "policy_why":
                "There is no sprite table in ROM. A record carries a 23-bit word "
                "offset into sprmask, where a 2-word header points into a "
                "length-compressed 5bpp stream in sprcol; the stream cannot be "
                "random-accessed and a header cannot be told from two arbitrary "
                "bytes. Walking the mask ROM would be a GUESS. Every offs below "
                "was observed being handed to the hardware by the game at the "
                "sample point of a logic frame.",
            "policy_consequence":
                "This atlas provably contains exactly what the corpus displayed. "
                "Content the corpus never reached is ABSENT, not missing-and-"
                "unknown: enlarge the corpus to enlarge the atlas.",
            "corpus": corpus,
            "distinct": len(sprites),
            "format": "one uint8 per pixel, 255 = transparent, else 0..31; "
                      "row-major, width*16 pixels per row, `height` rows",
            "file": "sprites/sprites.bin",
            "sha256": sha256(sd / "sprites.bin"),
            "records": sprites,
        }
        print(f"  spr {len(sprites)} distinct records -> sprites/sprites.bin")
    else:
        man["sprites"] = {"policy": "HARVESTED", "distinct": 0,
                          "corpus": [], "records": [],
                          "note": "NO HARVEST FILE WAS SUPPLIED. This is an "
                                  "EMPTY atlas, not a complete one -- run "
                                  "`pgm.py sprites` first."}
        print("  spr NO HARVEST -- run `pgm.py sprites` first")

    # a couple of sheets to LOOK AT (docs/knowledge/02 trap 2)
    save_png(str(out / "sheet.bg.png"),
             sheet([bg_tile(roms, 4096 + i) for i in range(64)], 8, gray_pal(32)))
    save_png(str(out / "sheet.tx.png"),
             sheet([tx_tile(roms, 0x40 + i) for i in range(64)], 16, gray_pal(16), gap=1))
    (out / "manifest.json").write_text(json.dumps(man, indent=1), encoding="utf8")
    print(f"wrote {out / 'manifest.json'}")
    return 0


# --------------------------------------------------------------------- check
# THE OTHER SIDE.  No pgmgfx import anywhere below this line except to read the
# blobs it produced; the region arithmetic and the tile decoders here are
# written from the format description, not shared with it.

def _raw_region_byte(romdir: Path, region: str, addr: int, cache={}):
    """Read one byte of an assembled region STRAIGHT OUT OF THE ROM FILES, with
    seek/read, applying the load offsets in load order so that a later file
    overwrites an earlier one exactly as MAME's ROM loader does."""
    size, files = REGIONS[region]
    if not 0 <= addr < size:
        raise IndexError(addr)
    val = 0
    for name, off, length in files:              # load order matters: last wins
        if off <= addr < off + length:
            key = (romdir, name)
            fh = cache.get(key)
            if fh is None:
                fh = cache[key] = open(romdir / name, "rb")
            fh.seek(addr - off)
            val = fh.read(1)[0]
    return val


def _bg_tile_slow(romdir, index, mutate=None):
    """32x32, 5bpp, pgm32_charlayout with GFXDECODE_DEVICE_REVERSEBITS ->
    a plain LSB-first bitstream: pixel (x,y) of tile n is bits
    n*5120 + y*160 + x*5 .. +4, bit +0 the LSB.  Written as a bit-by-bit loop on
    purpose: it shares nothing with the numpy unpackbits path."""
    base = index * 32 * 32 * 5
    out = bytearray(32 * 32)
    for y in range(32):
        for x in range(32):
            bit = base + y * 160 + x * 5
            v = 0
            for k in range(5):
                b = bit + k
                byte = _raw_region_byte(romdir, "igs023", b >> 3)
                if (byte >> (b & 7)) & 1:
                    v |= 1 << (4 - k if mutate == "bg-planes" else k)
            out[y * 32 + x] = v
    return bytes(out)


def _tx_tile_slow(romdir, index, mutate=None):
    """8x8, 4bpp, gfx_8x8x4_packed_lsb: low nibble is the LEFT pixel."""
    out = bytearray(64)
    for i in range(32):
        b = _raw_region_byte(romdir, "igs023", index * 32 + i)
        lo, hi = b & 0xf, b >> 4
        if mutate == "tx-msb":
            lo, hi = hi, lo
        out[i * 2] = lo
        out[i * 2 + 1] = hi
    return bytes(out)


def cmd_check(argv):
    ap = argparse.ArgumentParser(prog="assets.py check")
    ap.add_argument("--rom", default=str(ROMDIR))
    ap.add_argument("--out", default=str(OUTDIR))
    ap.add_argument("--tiles", type=int, default=24,
                    help="how many tiles of each kind to re-decode by hand")
    ap.add_argument("--mutate", default=None,
                    help="red-validate: overlap | tx-msb | bg-planes | rom-byte")
    a = ap.parse_args(argv)
    romdir, out = Path(a.rom), Path(a.out)
    mut = a.mutate
    fails = []

    def ck(name, cond, detail=""):
        print(f"  [{'ok  ' if cond else 'FAIL'}] {name}" + (f" -- {detail}" if detail else ""))
        if not cond:
            fails.append(name)

    if not (out / "manifest.json").exists():
        raise SystemExit(f"{out/'manifest.json'} missing -- run `assets.py export`")
    man = json.loads((out / "manifest.json").read_text(encoding="utf8"))

    print("ROM files, re-hashed from disk:")
    for r in man["roms"]:
        p = romdir / r["name"]
        d = p.read_bytes()
        if mut == "rom-byte" and r["name"] == "pgm_t01s.rom":
            d = bytearray(d); d[123] ^= 0xff; d = bytes(d)
        ck(r["name"], p.stat().st_size == r["size"]
           and hashlib.sha256(d).hexdigest() == r["sha256"]
           and f"{zlib.crc32(d) & 0xffffffff:08x}" == r["crc32"],
           f"{r['size']} bytes crc32={r['crc32']}")

    # ---- THE 0x180000 OVERLAP, verified in both directions.
    print("igs023 region assembly (the u19-at-0x180000 trap):")
    t01s = open(romdir / "pgm_t01s.rom", "rb").read()
    u19 = open(romdir / "cave_t04401w064.u19", "rb").read()
    lay = REGIONS["igs023"][1]
    if mut == "overlap":
        lay = [(lay[0]), (lay[1][0], 0x200000, lay[1][2])]
        REGIONS["igs023"] = (REGIONS["igs023"][0], lay)
        _raw_region_byte.__defaults__[0].clear()
    probes = [0x000000, 0x100000, 0x17FFFF, 0x180000, 0x180001, 0x1FFFFF,
              0x200000, 0x500000, 0x97FFFF]
    below = all(_raw_region_byte(romdir, "igs023", x) == t01s[x]
                for x in probes if x < 0x180000)
    inside = all(_raw_region_byte(romdir, "igs023", x) == u19[x - 0x180000]
                 for x in probes if 0x180000 <= x < 0x980000)
    shadowed = any(_raw_region_byte(romdir, "igs023", x) != t01s[x]
                   for x in (0x180000, 0x180001, 0x1FFFFF))
    ck("bytes below 0x180000 come from pgm_t01s.rom", below)
    ck("bytes from 0x180000 up come from cave_t04401w064.u19", inside)
    ck("the top 0x80000 of pgm_t01s.rom IS SHADOWED (not merely appended)",
       shadowed, "if this passes with u19 at 0x200000 the check is fake")

    # ---- tiles, re-decoded by hand and compared to the exported blobs
    print(f"tiles, re-decoded bit by bit from the raw files ({a.tiles} of each):")
    txblob = (out / man["tx"]["file"]).read_bytes()
    bgblob = (out / man["bg"]["file"]).read_bytes()
    ck("tx blob size", len(txblob) == man["tx"]["tiles"] * 64,
       f"{len(txblob)} bytes")
    ck("bg blob size", len(bgblob) == man["bg"]["tiles"] * 1024,
       f"{len(bgblob)} bytes")
    step = max(1, man["tx"]["tiles"] // a.tiles)
    bad = [i for i in range(0, man["tx"]["tiles"], step)
           if _tx_tile_slow(romdir, i, mut) != txblob[i * 64:(i + 1) * 64]]
    ck("TX tiles match an independent decode", not bad, f"mismatches: {bad[:8]}")
    step = max(1, man["bg"]["tiles"] // a.tiles)
    bad = [i for i in range(0, man["bg"]["tiles"], step)
           if _bg_tile_slow(romdir, i, mut) != bgblob[i * 1024:(i + 1) * 1024]]
    ck("BG tiles match an independent decode", not bad, f"mismatches: {bad[:8]}")

    # ---- the exported blobs are what the manifest says they are
    print("exported blobs:")
    for key in ("tx", "bg", "palettes"):
        if key in man and "file" in man[key]:
            p = out / man[key]["file"]
            ck(f"{key} sha256", p.exists() and sha256(p) == man[key]["sha256"])
    sp = man.get("sprites", {})
    if sp.get("distinct"):
        p = out / sp["file"]
        ck("sprites sha256", p.exists() and sha256(p) == sp["sha256"])
        tot = sum(r.get("bytes", 0) for r in sp["records"])
        ck("sprite blob length == sum of record sizes",
           p.stat().st_size == tot, f"{p.stat().st_size} vs {tot}")
        ck("every sprite record names its aoffset (the sprcol word index)",
           all("aoffset" in r or "skipped" in r for r in sp["records"]))
    ck("the sprite policy is recorded in the manifest",
       sp.get("policy", "").startswith("HARVESTED"), sp.get("policy", ""))
    ck("the sprite corpus is named", bool(sp.get("corpus")),
       str(sp.get("corpus")))
    ck("the atlas is not empty", bool(sp.get("distinct")),
       "an empty atlas is a FAILURE, not a pass: run `pgm.py sprites`")

    print(f"\n{'ASSET INTEGRITY OK' if not fails else 'ASSET INTEGRITY FAILED'}: "
          f"{len(fails)} failing check(s) {fails}")
    if mut:
        print(f"EXPECTED-RED [{mut}]: " +
              ("caught, as it must be" if fails else
               "STILL GREEN -- the checker cannot see this mutation"))
        return 0 if fails else 1
    return 1 if fails else 0


COMMANDS = {"extract": cmd_extract, "export": cmd_export, "check": cmd_check}

if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        print(__doc__)
        raise SystemExit(2)
    raise SystemExit(COMMANDS[sys.argv[1]](sys.argv[2:]))
