#!/usr/bin/env python3
"""Gradius stage-1 TERRAIN STREAMER: measure it, then re-derive it from the ROM.

Runs `terrain.lua` under headless Mesen (see mesen.py) and then does the thing
that makes this evidence rather than a reading: it **re-implements the streamer
in Python straight out of the PRG tables** and checks its output against what
the cartridge actually pushed through $2006/$2007 and stored in RAM.

Three independent claims, each with a check that has been seen to fail
(`--neuter`, below):

  1. CAMERA.     $3D is a sub-pixel fraction, $3E/$3F a 16-bit world X in
                 pixels.  $98EE adds #$80 to $3D per frame and carries into
                 $3E/$3F, so the base scroll is exactly 1/2 px per frame.
                 $9A79 copies $3E to $12 (PPUSCROLL X) and folds bit 0 of $3F
                 into the PPUCTRL nametable select.

  2. STREAMER.   One 32x32 px block per call of $9D8E.  Its nametable address,
                 attribute address, block id and all 16 tile bytes are
                 predicted from the ROM and compared with the bytes the ROM
                 wrote to the PPU.

  3. COLLISION.  Derived from the very tiles it just queued, by thresholding
                 the tile index, and stored 2 bits per 8x8 tile in a 512-byte
                 map at $0500-$06FF.  Predicted and compared against both the
                 store instruction's operand and the final RAM image.

Usage
  python games/gradius/tools/oracle/terrain.py                    # the full run
  python games/gradius/tools/oracle/terrain.py --census           # who writes VRAM
  python games/gradius/tools/oracle/terrain.py --neuter scroll    # watch 1 fail
  python games/gradius/tools/oracle/terrain.py --neuter blockid   # watch 2 fail
  python games/gradius/tools/oracle/terrain.py --neuter collide   # watch 3 fail
  python games/gradius/tools/oracle/terrain.py --map              # print the map
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mesen  # noqa: E402

HERE = Path(__file__).resolve().parent
LUA = HERE / "terrain.lua"
OUT = HERE / "out"
ROM = mesen.DEFAULT_ROM

# Boot to gameplay and then sit still.  Measured with probe.py: mode ($00)
# reaches 5 at game frame ~282 and the ship is under player control from ~310.
BOOT = "200:,10:S,90:"


# =========================================================== the ROM tables ==
# Addresses are PRG addresses; the file is 16 bytes of iNES header then 32 KB
# mapped flat at $8000 (mapper 3 switches CHR only, so an address is an address
# -- games/gradius/README.md).

class Rom:
    def __init__(self, path: Path):
        self.d = path.read_bytes()
        if len(self.d) != 65552:
            raise SystemExit(f"unexpected ROM size {len(self.d)}")

    def b(self, a: int) -> int:
        return self.d[16 + a - 0x8000]

    def w(self, a: int) -> int:
        return self.b(a) | (self.b(a + 1) << 8)

    def slice(self, a: int, n: int) -> bytes:
        o = 16 + a - 0x8000
        return self.d[o:o + n]

    # -- the per-stage table block at $9FB4, read by $9E38-$9E92 ---------------
    # $9FB4,Y   collision threshold          (LDA $9FB4,Y / CMP at $9F69)
    # $9FBC,X   screen-order list, indexed by the page number $55  ($9E3E)
    # $9FCC,X   base of the 56-byte screen layout arrays            ($9E60)
    # $9FDC,X   block id -> 4x4 tile stream pointer table           ($9E73)
    # $9FEC,X   block id -> attribute byte table                    ($9E8A)
    def stage(self, n: int) -> dict:
        return {
            "threshold": self.b(0x9FB4 + n),
            "screenOrder": self.w(0x9FBC + 2 * n),
            "layoutBase": self.w(0x9FCC + 2 * n),
            "patternTbl": self.w(0x9FDC + 2 * n),
            "attrTbl": self.w(0x9FEC + 2 * n),
        }


# $9D4F: 16-bit offsets 0, $38, $70, ... -- a screen layout array is $38 = 56
# bytes, i.e. 8 blocks across x 7 blocks down of 32x32 px = 256 x 224 px.
SCREEN_STRIDE = 0x38
# $9D73,Y for the one-byte "fill the rest of this row" codes at $9F26.
FILL_TBL = 0x9D73
# $9D6D,X -> $05/$06  the collision map page, chosen by bit 0 of $55  ($9DB7)
# $9D6F,X -> $20/$24  the nametable page high byte                    ($9DBC)
COLL_PAGE = (0x05, 0x06)
NT_PAGE = (0x20, 0x24)


def decode_block(rom: Rom, src: int) -> list[int]:
    """The 4x4 tile stream at `src`, expanded to 16 tile indices.

    A faithful transcription of $9EBE-$9F4C, control flow included.  Bytes with
    a non-zero high nibble are literal tiles; 0 is a literal too (the blank
    tile); 1-$0F are control codes:
        9 / $0A   fill the rest of the row alternating $41/$40 and $40/$41
        7 / 8     emit $ED / $00 twice
        others    fill the rest of the row with $9D73[code]
    """
    out: list[int] = []
    y = 0
    for _row in range(4):
        left = 4          # $99
        while True:
            a = rom.b((src + y) & 0xFFFF)
            if a == 0 or (a & 0xF0) != 0:          # $9EE7 BEQ / $9EEB BNE
                out.append(a)
                y += 1
                left -= 1
                if left == 0:
                    break
                continue
            y += 1
            saved_y = y                            # $9EEE STY $9B
            if a in (9, 0x0A):                     # $9F02
                v = (a & 1) | 0x40
                while left:
                    out.append(v)
                    v ^= 1
                    left -= 1
                y = saved_y                        # $9F32 LDY $9B
                break
            if a in (7, 8):                        # $9F12 / $9F16
                v = 0xED if a == 7 else 0x00
                out.append(v)
                out.append(v)
                left -= 2
                if left < 0:
                    raise RuntimeError("code 7/8 ran past the row -- the ROM "
                                       "does this by falling through $9F24; "
                                       "the data was assumed never to")
                if left == 0:
                    # $9F24's BNE tests X (the queue cursor), not $99, so the
                    # ROM would keep consuming.  Flag it rather than guess.
                    raise RuntimeError("code 7/8 exactly filled the row")
                continue
            v = rom.b(FILL_TBL + a)                # $9F26 TAY / LDA $9D73,Y
            while left:
                out.append(v)
                left -= 1
            y = saved_y
            break
    assert len(out) == 16, len(out)
    return out


def predict(rom: Rom, stage_n: int, build_lo: int, build_hi: int, prog: int) -> dict:
    """Everything $9D8E computes for one block, re-derived from the ROM.

    Inputs are the three RAM bytes the ROM feeds it: $54/$55 (the 16-bit build
    cursor, world pixels) and $58 (progress inside the current 128 px
    half-page).  $58 = blockCol*32 + blockRow with blockRow 0..6, blockCol 0..3
    -- proven by the advance at $9F94: INC while ($58 & 7) < 6, else += $1A,
    and wrap at $80 with $54 += $80.
    """
    st = rom.stage(stage_n)
    half = 1 if (build_lo & 0x80) else 0        # $9DCE LDY $54 / BPL
    page = build_hi & 1                          # $9DB2 LDA $55 / AND #$01
    block_row = prog & 7                         # $9DDC
    block_col = (prog & 0xF0) >> 5               # $9E1B

    nt = (NT_PAGE[page] << 8) + (0x10 if half else 0)
    nt += block_row * 128 + ((prog & 0xF8) >> 3)          # $9DE9 / $9DFC
    at = ((NT_PAGE[page] | 3) << 8) + (0xC4 if half else 0xC0)
    at += block_row * 8 + block_col                       # $9E0E / $9E17

    layout_idx = block_row * 8 + block_col + (4 if half else 0)   # $9E36
    screen = rom.b(st["screenOrder"] + build_hi)                  # $9E4A
    if stage_n != 0:                                             # $9E4C
        if screen == 0:
            st = rom.stage(0)
            screen = 1
        screen -= 1
    layout = st["layoutBase"] + SCREEN_STRIDE * screen            # $9E5C
    block_id = rom.b(layout + layout_idx)                         # $9E6F

    tiles_ptr = rom.w(st["patternTbl"] + 2 * block_id)            # $9E81
    tiles = decode_block(rom, tiles_ptr)
    attr = rom.b(st["attrTbl"] + block_id)                        # $9EAA

    coll = collision_bytes(tiles, st["threshold"])
    return dict(ntAddr=nt, atAddr=at, blockId=block_id, layout=layout,
                tilesPtr=tiles_ptr, tiles=tiles, attr=attr,
                screen=screen, collPage=COLL_PAGE[page],
                collBase=(COLL_PAGE[page] << 8) | ((build_lo + prog) & 0xFF),
                coll=coll)


def collision_bytes(tiles: list[int], threshold: int) -> list[int]:
    """$9F55-$9F92, the ONE place terrain collision is produced.

    For each of the four tile COLUMNS of the block it walks the four rows,
    substituting #$80 for any tile index >= the stage's threshold ($40 on
    stage 1) and shifting that byte's top two bits into an accumulator with
    ASL/ROR.  Two bits per 8x8 tile, four tiles per byte, row 0 in bits 0-1.

    ROR shifts the carry in at bit 7, so the FIRST bit shifted in ends at
    bit 0 and a tile's field reads (b6 << 1) | b7 of the substituted byte:
    solid ($80) -> 1, stage 1's starfield tiles -> 0.  Measured on the attract
    demo: the only non-zero bytes the ROM stored were $50/$55/$54/$05/$04/$01/
    $40, i.e. field values 0 and 1 only.  The reader at $C409 masks with
    $C40F,Y = $03/$0C/$30/$C0.
    """
    out = []
    for col in range(4):
        acc = 0
        for row in range(4):
            t = tiles[row * 4 + col]
            a = 0x80 if t >= threshold else t     # $9F6B BCC (skips LDA #$80)
            for _ in range(2):                    # ASL A / ROR $99, twice
                carry = (a >> 7) & 1
                a = (a << 1) & 0xFF
                acc = (acc >> 1) | (carry << 7)
        out.append(acc)
    return out


# ================================================================== the run ==

def run(frames: int, script: str, out_json: Path, *, vramfrom: int = 0,
        mapat: str = "", neuter: str = "", hurtfrom: int = 575,
        hurtto: int = 595, timeout_s: int = 300):
    out_json = out_json.resolve()
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.unlink(missing_ok=True)
    env = {"TER_FRAMES": str(frames), "TER_SCRIPT": script,
           "TER_JSON": str(out_json), "TER_VRAMFROM": str(vramfrom),
           "TER_MAPAT": mapat, "TER_NEUTER": neuter,
           "TER_HURTFROM": str(hurtfrom), "TER_HURTTO": str(hurtto)}
    r = mesen.run_script(LUA, timeout_s=timeout_s, env_extra=env)
    err = [l for l in r.lines if l.startswith("ERROR = ")]
    if err:
        raise SystemExit("terrain.lua failed: " + err[0][8:])
    if "END" not in r.lines:
        print(r.stdout[-4000:], file=sys.stderr)
        raise SystemExit("terrain.lua did not finish")
    if not out_json.exists():
        raise SystemExit(f"terrain.lua said END but wrote no {out_json}")
    return r


def rebuild_vram(doc: dict) -> dict[int, list[tuple[int, int, int]]]:
    """Replay the logged port writes into (frame -> [(addr, value, pc)]).

    $8A51 sets the increment through $2000 bit 2 before every packet ($8A5F),
    then two $2006 writes, then a run of $2007.  Nothing here is assumed: the
    increment and the address both come out of the log.
    """
    out: dict[int, list[tuple[int, int, int]]] = {}
    addr, latch, inc = 0, 0, 1
    for fr, port, val, pc in doc["vram"]:
        if port == 0x2000:
            inc = 32 if (val & 0x04) else 1
        elif port == 0x2006:
            if latch == 0:
                addr = (val << 8) | (addr & 0xFF)
                latch = 1
            else:
                addr = (addr & 0xFF00) | val
                latch = 0
        elif port == 0x2007:
            out.setdefault(fr, []).append((addr, val, pc))
            addr = (addr + inc) & 0x3FFF
        elif port == 0x2005:
            latch = 0 if latch else 1
    return out


# =================================================================== checks ==

def check_camera(doc: dict) -> list[tuple[bool, str]]:
    """The whole camera model, in one equation, over every sampled frame.

        cam24 = $3D | $3E<<8 | $3F<<16
        cam24[N] == cam24[N-1] + $80 * (calls to $98EE) + $400 * (calls to $9857)

    Nothing is assumed about WHEN the game scrolls: the call counts come from
    exec hooks on the two adders.  A frame in which neither ran must not move
    the camera at all, and that half of the claim is what makes this able to
    fail -- see --neuter scroll.
    """
    F = {k: i for i, k in enumerate(doc["frameFields"])}
    fr = doc["frames"]
    cam = lambda f: f[F["subpx"]] | (f[F["camLo"]] << 8) | (f[F["camHi"]] << 16)
    bad, moving, still, wiped = [], 0, 0, []
    for a, b in zip(fr, fr[1:]):
        if b[F["camForeign"]]:
            # $8307 (STA $00,X over $12-$EF) wipes the camera on a stage
            # restart. Excluded from the increment equation and REPORTED, not
            # quietly absorbed (docs/knowledge/02 #6).
            wiped.append(b[F["frame"]])
            continue
        want = cam(a) + 0x80 * b[F["scrollAdds"]] + 0x400 * b[F["scroll4Adds"]]
        if b[F["scrollAdds"]] or b[F["scroll4Adds"]]:
            moving += 1
        else:
            still += 1
        if (want & 0xFFFFFF) != cam(b):
            bad.append((b[F["frame"]], hex(want), hex(cam(b)),
                        b[F["scrollAdds"]], b[F["scroll4Adds"]]))
    out = [(not bad,
            f"cam24 += $80 per $98EE call and $400 per $9857 call, every frame "
            f"({moving} moving, {still} still, {len(wiped)} wiped by a "
            f"non-adder write at {wiped[:4]}, {len(bad)} violations"
            + (f", first {bad[0]}" if bad else "") + ")")]
    census = doc.get("camWriteCensus", {})
    foreign = {k: v for k, v in census.items()
               if k not in ("98F5", "8407", "840B")}
    # $840B is the carry into $3F and only fires once per 256 px of travel, so
    # a short run legitimately has none of it -- requiring it made this check
    # fail on an 800-frame run that was otherwise perfect.
    out.append((set(census) >= {"98F5", "8407"},
                f"$3D/$3E/$3F write census: adders {[census.get(k) for k in ('98F5','8407','840B')]}"
                f", everything else {foreign}"))
    adds = {f[F["scrollAdds"]] for f in fr}
    out.append((adds <= {0, 1},
                f"$98EE runs at most ONCE per frame -- base scroll is exactly "
                f"1/2 px/frame (call counts seen: {sorted(adds)})"))

    # What the PPU is actually told, and WHEN.  $9A79 copies $3E into $12
    # BEFORE $9AA0 calls $98EE, and $8281 pushes $12 to $2005 at the top of the
    # NEXT NMI.  So the hardware is always one frame behind $3E.
    play = [f for f in fr if f[F["scrollAdds"]]]
    idx = {f[F["frame"]]: f for f in fr}
    lag0 = lag1 = n = 0
    for f in play:
        prev = idx.get(f[F["frame"]] - 1)
        if prev is None or not prev[F["scrollAdds"]]:
            continue
        n += 1
        lag0 += f[F["scrollX"]] == f[F["camLo"]]
        lag1 += f[F["scrollX"]] == prev[F["camLo"]]
    out.append((n and lag1 == n and lag0 < n,
                f"$12 (-> $2005) lags $3E by exactly one frame: "
                f"{lag1}/{n} match $3E[N-1], only {lag0}/{n} match $3E[N]"))
    bad3 = [f[F["frame"]] for f in play
            if (f[F["ppuctrl"]] & 1) != (idx[f[F["frame"]] - 1][F["camHi"]] & 1)
            and idx.get(f[F["frame"]] - 1)]
    out.append((not bad3, f"PPUCTRL nametable bit == bit 0 of $3F[N-1] "
                          f"({len(bad3)} violations of {len(play)})"))
    return out


def check_blocks(rom: Rom, doc: dict, vram: dict) -> list[tuple[bool, str]]:
    B = {k: i for i, k in enumerate(doc["blockFields"])}
    F = {k: i for i, k in enumerate(doc["frameFields"])}
    stage_of = {f[F["frame"]]: f[F["stage"]] for f in doc["frames"]}
    n = miss_addr = miss_id = miss_tile = miss_attr = 0
    first = {}
    for blk in doc["blocks"]:
        st = stage_of.get(blk[B["frame"]], 0)
        p = predict(rom, st, blk[B["buildLo"]], blk[B["buildHi"]], blk[B["prog"]])
        n += 1
        if p["blockId"] != blk[B["blockId"]]:
            miss_id += 1
            first.setdefault("id", (blk[B["frame"]], p["blockId"], blk[B["blockId"]]))
        if p["ntAddr"] != blk[B["ntAddr"]] or p["atAddr"] != blk[B["atAddr"]]:
            miss_addr += 1
            first.setdefault("addr", (blk[B["frame"]], hex(p["ntAddr"]),
                                      hex(blk[B["ntAddr"]])))
        # the tiles, against what the PPU was actually given.  The queue this
        # block went into is flushed by $8A51 at the TOP of the next NMI, so
        # look in frame F and F+1.
        writes = {}
        for f in (blk[B["frame"]], blk[B["frame"]] + 1):
            for a, v, _pc in vram.get(f, []):
                writes.setdefault(a, v)
        seen = 0
        for row in range(4):
            base = blk[B["ntAddr"]] + row * 32
            for col in range(4):
                a = base + col
                if a in writes:
                    seen += 1
                    if writes[a] != p["tiles"][row * 4 + col]:
                        miss_tile += 1
                        first.setdefault("tile", (blk[B["frame"]], hex(a),
                                                  p["tiles"][row * 4 + col],
                                                  writes[a]))
        if blk[B["atAddr"]] in writes and writes[blk[B["atAddr"]]] != p["attr"]:
            miss_attr += 1
            first.setdefault("attr", (blk[B["frame"]], hex(blk[B["atAddr"]]),
                                      p["attr"], writes[blk[B["atAddr"]]]))
    return [
        (n > 100, f"{n} block emissions observed"),
        (miss_id == 0, f"block id predicted from $9FBC/$9FCC screen tables "
                       f"({n} blocks, {miss_id} wrong"
                       + (f", first {first.get('id')}" if miss_id else "") + ")"),
        (miss_addr == 0, f"nametable + attribute address predicted from $54/$55/$58 "
                         f"({miss_addr} wrong"
                         + (f", first {first.get('addr')}" if miss_addr else "") + ")"),
        (miss_tile == 0, f"every tile byte the PPU received matches the block "
                         f"decoder ({miss_tile} wrong"
                         + (f", first {first.get('tile')}" if miss_tile else "") + ")"),
        (miss_attr == 0, f"every attribute byte matches $9FEC[blockId] "
                         f"({miss_attr} wrong"
                         + (f", first {first.get('attr')}" if miss_attr else "") + ")"),
    ]


def check_collision(rom: Rom, doc: dict) -> list[tuple[bool, str]]:
    B = {k: i for i, k in enumerate(doc["blockFields"])}
    F = {k: i for i, k in enumerate(doc["frameFields"])}
    stage_of = {f[F["frame"]]: f[F["stage"]] for f in doc["frames"]}
    by_block: dict[int, list] = {}
    for fr, addr, val, bi in doc["colls"]:
        by_block.setdefault(bi, []).append((addr, val))
    n = bad = badaddr = 0
    first = None
    for bi, stores in by_block.items():
        blk = doc["blocks"][bi]
        st = stage_of.get(blk[B["frame"]], 0)
        p = predict(rom, st, blk[B["buildLo"]], blk[B["buildHi"]], blk[B["prog"]])
        for col, (addr, val) in enumerate(stores):
            n += 1
            if addr != p["collBase"] + 8 * col:
                badaddr += 1
            if val != p["coll"][col]:
                bad += 1
                if first is None:
                    first = (blk[B["frame"]], hex(addr), p["coll"][col], val)
    solid = sum(1 for _f, _a, v, _b in doc["colls"] if v)
    out = [
        (n > 100, f"{n} collision-map stores observed at $9F7D"),
        # ANTI-VACUITY. The first long run of this probe was green on every
        # collision check while the map was ENTIRELY ZERO: stage 1's opening is
        # pure starfield and no tile reaches the $40 threshold, so "predicted
        # == actual" was 0 == 0, 2128 times. docs/knowledge/03's first failure
        # mode, met in the wild. Real terrain starts at page $55 = 4 (world
        # x >= 1024), which an idle player never reaches -- the attract-mode
        # demo does.
        (solid > 0, f"the map actually contains solid terrain -- "
                    f"{solid} of {n} stores are non-zero (0 would make every "
                    f"collision check below vacuous)"),
        (badaddr == 0, f"each store lands at ($54+$58) + 8*column on page "
                       f"$05/$06 ({badaddr} wrong)"),
        (bad == 0, f"every collision byte equals the tiles it was built from, "
                   f"thresholded at $9FB4[stage] ({bad} wrong"
                   + (f", first {first}" if bad else "") + ")"),
    ]
    # The reader. A census of the pointer $C3D3 builds, plus the intervention.
    rc = doc.get("collReadCensus", {})
    out.append((rc and set(rc) <= {"05", "06"} and sum(rc.values()) > 100,
                f"$C3FC (LDA ($A0),Y in $C3D3) reads ONLY pages $05/$06 -- "
                f"the map the streamer writes ({rc})"))

    # ...and the intervention. --neuter solid fills $0500-$06FF with $FF over a
    # window. If $C3D3 is really what decides "the ship touched terrain", the
    # ship must die -- on a stretch of stage 1 where there is no terrain at all,
    # so the only possible cause is the map. Measured: $1B goes $80 -> $A0 on
    # the first poked frame, the restart sequence 1,2,3,4 follows, and the
    # camera resets. The baseline run stays at $80 the whole time.
    if doc.get("solidPokes"):
        F2 = {k: i for i, k in enumerate(doc["frameFields"])}
        subs = [(f[F2["frame"]], f[F2["sub"]]) for f in doc["frames"]]
        first_poke = next((fr for fr, _ in subs), 0)
        died = [fr for fr, sb in subs if sb == 0xA0]
        restart = [fr for fr, sb in subs if sb in (1, 2, 3, 4)]
        out.append((bool(died) and bool(restart),
                    f"--neuter solid: filling the map with $FF KILLS the ship "
                    f"($1B reaches $A0 at {died[:1]}, restart sequence at "
                    f"{restart[:4]}) -- so the map is read, not merely written"))
    # and the same claim again against the finished RAM image
    for m in doc["maps"]:
        img = m["bytes"]
        want = {}
        for fr, addr, val, _bi in doc["colls"]:
            if fr <= m["frame"]:
                want[addr] = val
        wrong = [a for a, v in want.items() if img[a - 0x500] != v]
        out.append((not wrong,
                    f"RAM $0500-$06FF at frame {m['frame']} holds exactly what "
                    f"$9F7D stored ({len(want)} live bytes, {len(wrong)} wrong)"))
    return out


# ==================================================================== views ==

def census(doc: dict):
    print("  every write to $2000/$2005/$2006/$2007, by writing PC:")
    print(f"    {'port':>6} {'PC':>6} {'writes':>9}")
    for k in sorted(doc["ppuWriteCensus"], key=lambda k: -doc["ppuWriteCensus"][k]):
        port, pc = k.split("@")
        print(f"    ${port} ${pc} {doc['ppuWriteCensus'][k]:9d}")


def show_map(doc: dict):
    """Print the collision map as the port will have to hold it."""
    for m in doc["maps"]:
        img = m["bytes"]
        print(f"\n  collision map at game frame {m['frame']} "
              f"(page $0500 then $0600; '#' = solid 8x8 tile)")
        for page in (0, 1):
            print(f"    ${5 + page:02X}00  32 tile columns x 28 rows")
            for band in range(7):
                for sub in range(4):
                    row = ""
                    for col in range(32):
                        b = img[page * 256 + col * 8 + band]
                        row += "#" if (b >> (2 * sub)) & 3 else "."
                    print(f"      {band * 4 + sub:2d} {row}")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--frames", type=int, default=900)
    ap.add_argument("--script", default=BOOT)
    ap.add_argument("--vramfrom", type=int, default=0)
    ap.add_argument("--mapat", default="")
    ap.add_argument("--neuter", default="",
                    choices=["", "scroll", "blockid", "addr", "tiles",
                             "collide", "nolag", "solid"])
    ap.add_argument("--out", type=Path, default=OUT / "terrain.json")
    ap.add_argument("--hurtfrom", type=int, default=575,
                    help="first game frame a --neuter poke is applied on")
    ap.add_argument("--hurtto", type=int, default=595)
    ap.add_argument("--census", action="store_true")
    ap.add_argument("--map", action="store_true")
    ap.add_argument("--reuse", action="store_true",
                    help="analyse the existing JSON without re-running Mesen")
    args = ap.parse_args()

    mapat = args.mapat or str(args.frames - 1)
    if not args.reuse:
        r = run(args.frames, args.script, args.out, vramfrom=args.vramfrom,
                mapat=mapat, neuter=args.neuter,
                hurtfrom=args.hurtfrom, hurtto=args.hurtto)
        print("=== TERRAIN PROBE ===")
        for k, v in r.fields().items():
            print(f"  {k:18s} {v}")
    doc = json.loads(args.out.read_text())
    rom = Rom(ROM)

    if args.census:
        census(doc)
    if args.map:
        show_map(doc)

    vram = rebuild_vram(doc)
    checks = []
    checks += check_camera(doc)
    checks += check_blocks(rom, doc, vram)
    checks += check_collision(rom, doc)
    print()
    fails = 0
    for ok, msg in checks:
        print(f"  [{'PASS' if ok else 'FAIL'}] {msg}")
        fails += 0 if ok else 1
    if args.neuter:
        print(f"\n  --neuter {args.neuter}: {fails} check(s) red. "
              f"A green run here would mean the check is vacuous.")
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
