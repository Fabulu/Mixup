#!/usr/bin/env python3
"""Asset-integrity oracle: prove `assets/` matches the real ROM, for all 14 levels.

`tools/export_assets.py` rips the level data by *replaying* the game's loader
routines in Python.  That is only as good as our reading of those routines, so
this tool closes the loop the other way round: it runs the REAL ROM under PyBoy,
enters each level, and diffs the emulator's live RAM/VRAM against what we
exported.  A corrupted export then fails in seconds instead of showing up hours
later as "the player walks through a wall on level 7".

Three families of check, per level:

  MAP       assets/levels/NN.map.bin  ==  $D000..$D000+width*32 after the level
            loads.  $D000 is built by sub_00_0C34 (raw metatile id, then
            collisionLUT[id]) -- byte-identical or the extraction is wrong.

  MANIFEST  assets/manifest.json fields vs (a) the ROM tables read directly at
            their documented addresses -- deliberately NOT via the gbrom.py
            helpers export_assets.py uses, so a bug in a helper cannot hide
            itself -- and (b) the live RAM the game derived from those tables:
              width        -> 3:$4000 blob header,  len(map.bin)/32
              metatiles    -> 5:$4000 {len,src},    $C368 image
              startX/Y     -> 1:$7CED,              $FF81/$FF83
              cameraClamp  -> 0:$103F,              $C732
              enemySpawns  -> 5:$46EC,              $C268 (8 x 32 B)
              objectSpawns -> 5:$4716,              $C1E8 (8 x 16 B)
              subtype/music/exits/resources -> 0:$1015 / $1023 / $1031 /
                                               0:$286D / 1:$7C7D

  VRAM      assets/levels/NN.vram.bin vs live $8000-$9FFF, compared over the
            byte spans the level's own resource list actually writes (the
            export makes no claim about the BG tilemap at $9800, which the
            column streamer builds at runtime).

How each level is reached
-------------------------
The round-select screen ($035B) offers routes 0-2, which the dispatcher at
$049D turns into $FFB0 = 1 / 5 / 9 (route 3 -> $0C, unlocked by $C753 == $07).
So levels 1, 5 and 9 are reached by pressing RIGHT on the real menu and then
START -- nothing is poked.  Level $0C is the same code path with $C753 forced
to $07, i.e. the game's own route dispatcher picks the level number.

The remaining ten levels are mid-route and cannot be reached without playing
through.  For those we let the menu run normally and overwrite $FFB0 at the
instant execution reaches the level-init entry point `loc_00_04BB` -- one
instruction after $04B9, where the game's own route dispatcher writes exactly
that byte.  Every subsequent routine (sub_00_2889, sub_00_0C34, sub_00_104E)
reads the level from $FFB0 and from nowhere else, so the init sequence is
bit-for-bit the one real play produces.  `--cross-check` proves this: it runs
levels 1/5/9 both ways and asserts the sampled state is identical.

Usage:
    python tools/verify_assets.py                # all 14 levels
    python tools/verify_assets.py --level 7      # one level, verbose diff
    python tools/verify_assets.py --cross-check  # + route-vs-inject equivalence
    python tools/verify_assets.py --no-vram      # skip the VRAM family

Exit code 0 = every check passed.  Non-zero = at least one mismatch.
"""
import argparse
import base64
import io
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from gbrom import Rom, ROOT, load_resource

from pyboy import PyBoy

ROM_PATH = os.path.join(ROOT, 'Batman - Return of the Joker (USA, Europe).gb')
ASSETS = os.path.join(ROOT, 'assets')
NUM_LEVELS = 14

# --- code addresses (bank 0) -----------------------------------------------
A_ROUND_SELECT = 0x03DC   # top of the round-select input loop
A_LEVEL_INIT = 0x04BB     # loc_00_04BB, entered with $FFB0 already set
A_MAIN_LOOP = 0x0567      # first execution == level fully loaded, no frame yet

# --- ROM table addresses (master reference §6.5, §7.2; read raw, see docstring)
T_LEVEL_SUBTYPE = (0, 0x1015)
T_MUSIC_FRESH = (0, 0x1023)
T_MUSIC_REENTRY = (0, 0x1031)
T_CAMERA_CLAMP = (0, 0x103F)
T_LEVEL_EXITS = (0, 0x286D)
T_RESOURCE_LIST = (1, 0x7C7D)     # 8 B/level, $FF terminated
T_PLAYER_START = (1, 0x7CED)      # {Xhi, Yhi}
T_MAP_PTRS = (3, 0x4000)          # 14 LE pointers -> {width, width*16 ids}
T_COLL_PTRS = (3, 0x7A2A)         # 14 LE pointers -> 256-byte LUT
T_METATILE_DEFS = (5, 0x4000)     # {len16, src16}
T_ENEMY_SPAWNS = (5, 0x46EC)      # {src16, count}
T_OBJECT_SPAWNS = (5, 0x4716)

# --- live RAM addresses ------------------------------------------------------
R_MAP_IMAGE = 0xD000
R_METATILES = 0xC368
R_ENEMIES = 0xC268
R_OBJECTS = 0xC1E8
R_CAMERA_CLAMP = 0xC732
R_ROUTE = 0xC712
R_ROUTE_FLAGS = 0xC753
R_LEVEL = 0xFFB0
R_START_XHI = 0xFF81
R_START_YHI = 0xFF83

# sub_00_333F RETs immediately unless the level is a route start or a boss, so
# only these levels show the stage-intro screen (and load resources $02/$1D/$05).
INTRO_LEVELS = {1, 4, 5, 8, 9, 11, 12, 14}
ROUTE_LEVELS = {1: 0, 5: 1, 9: 2, 12: 3}   # level -> round-select route index

# sub_00_0D50 stamps water collision ($08) into the already-expanded $D000 map
# for the two water levels, from immediate operands in the code rather than any
# table (loc_00_0E36 for level $05, loc_00_0E51 for level $0D).  Transcribed
# here independently of tools/export_assets.py so the two must agree.
WATER_PATCHES = {
    5:  [(0xD263, 0x0D), (0xD205, 0x10)],
    13: [(0xD41B, 0x05), (0xD4FB, 0x05), (0xD41D, 0x0C)],
}


# ---------------------------------------------------------------- ROM reading
def tbl_u8(rom, loc, i):
    return rom.data[rom.off(loc[0], loc[1]) + i]


def tbl_u16(rom, loc, i):
    o = rom.off(loc[0], loc[1]) + i
    return rom.data[o] | (rom.data[o + 1] << 8)


def rom_level_map(rom, lvl):
    """3:$4000[lvl-1] -> (width, [width*16] ids). Raw, no helper."""
    p = tbl_u16(rom, T_MAP_PTRS, (lvl - 1) * 2)
    o = rom.off(3, p)
    w = rom.data[o]
    return w, rom.data[o + 1:o + 1 + w * 16]


def rom_level_lut(rom, lvl):
    p = tbl_u16(rom, T_COLL_PTRS, (lvl - 1) * 2)
    o = rom.off(3, p)
    return rom.data[o:o + 256]


def rom_metatiles(rom, lvl):
    ln = tbl_u16(rom, T_METATILE_DEFS, (lvl - 1) * 4)
    src = tbl_u16(rom, T_METATILE_DEFS, (lvl - 1) * 4 + 2)
    if ln == 0:
        return b''
    o = rom.off(5, src)
    return rom.data[o:o + ln]


def rom_resource_list(rom, lvl):
    out = []
    for i in range(8):
        v = tbl_u8(rom, T_RESOURCE_LIST, (lvl - 1) * 8 + i)
        if v == 0xFF:
            break
        out.append(v)
    return out


def resource_spans(rom, indices):
    """-> [(dest, length)] each resource index writes into VRAM, in order."""
    spans = []
    for idx in indices:
        r = load_resource(rom, None, idx)
        if r is None:
            continue
        _, _, dest, length = r
        if 0x8000 <= dest < 0xA000:
            spans.append((dest, min(length, 0xA000 - dest)))
    return spans


# ------------------------------------------------------------------- emulator
class Runner:
    """One PyBoy instance, parked at the round select, replayed per level."""

    def __init__(self, verbose=False):
        self.verbose = verbose
        self.pyboy = PyBoy(ROM_PATH, window='null', sound_emulated=False)
        self.pyboy.set_emulation_speed(0)
        self.at_menu = {'v': False}
        self.sample = {}
        self.inject = {'level': None}

        self.pyboy.hook_register(0, A_ROUND_SELECT,
                                 lambda _: self.at_menu.__setitem__('v', True), None)
        self.pyboy.hook_register(0, A_LEVEL_INIT, self._on_level_init, None)
        self.pyboy.hook_register(0, A_MAIN_LOOP, self._on_main_loop, None)

        # Boot: tap START through logo/title until the round select is running.
        for f in range(4000):
            if self.at_menu['v']:
                break
            if f % 20 == 0:
                self.pyboy.button('start', delay=3)
            self.pyboy.tick(1, False)
        else:
            raise RuntimeError('never reached the round-select screen')
        for _ in range(20):            # let the menu settle, release START
            self.pyboy.tick(1, False)
        self.menu_state = io.BytesIO()
        self.pyboy.save_state(self.menu_state)

    def _on_level_init(self, _):
        if self.inject['level'] is not None:
            self.pyboy.memory[R_LEVEL] = self.inject['level']

    def _on_main_loop(self, _):
        if self.sample.get('done'):
            return
        m = self.pyboy.memory
        self.sample = {
            'done': True,
            'level': m[R_LEVEL],
            'map': bytes(m[R_MAP_IMAGE:R_MAP_IMAGE + 0x1000]),
            'vram': bytes(m[0x8000:0xA000]),
            'metatiles': bytes(m[R_METATILES:R_METATILES + 0x200]),
            'enemies': bytes(m[R_ENEMIES:R_ENEMIES + 8 * 32]),
            'objects': bytes(m[R_OBJECTS:R_OBJECTS + 8 * 16]),
            'clamp': m[R_CAMERA_CLAMP],
            'startX': m[R_START_XHI],
            'startY': m[R_START_YHI],
        }

    def _tap(self, name, hold=3, gap=6):
        """One clean press/release edge. `pyboy.button(delay=)` schedules the
        release on an internal queue that does not survive load_state, so the
        menu never saw the input; do it by hand."""
        self.pyboy.button_press(name)
        for _ in range(hold):
            self.pyboy.tick(1, False)
            if self.sample.get('done'):
                break
        self.pyboy.button_release(name)
        for _ in range(gap):
            self.pyboy.tick(1, False)
            if self.sample.get('done'):
                break

    def enter(self, level, method):
        """Load the level and return the state sampled at the first $0567.

        method 'route'  - drive the real menu; the game picks $FFB0 itself.
        method 'inject' - drive the real menu, then overwrite $FFB0 at $04BB.
        """
        self.menu_state.seek(0)
        self.pyboy.load_state(self.menu_state)
        self.sample = {}
        self.inject = {'level': None if method == 'route' else level}

        if method == 'route':
            route = ROUTE_LEVELS[level]
            if route == 3:
                # Route 3 is only offered once all three boss levels are done.
                self.pyboy.memory[R_ROUTE_FLAGS] = 0x07
            for _ in range(route):
                self._tap('right')
            got = self.pyboy.memory[R_ROUTE]
            if got != route:
                raise RuntimeError(f'round select stuck on route {got}, wanted {route}')

        # The stage-intro screen ($333F) waits 60 frames or a START press, and
        # only appears for route starts and boss levels -- so keep tapping.
        self._tap('start')
        for _ in range(200):
            if self.sample.get('done'):
                break
            self._tap('start', hold=2, gap=4)
        else:
            raise RuntimeError(f'level {level} never reached the main loop')
        if self.sample['level'] != level:
            raise RuntimeError(f'loaded level {self.sample["level"]}, wanted {level}')
        return self.sample

    def close(self):
        self.pyboy.stop(save=False)


# --------------------------------------------------------------------- checks
class Report:
    def __init__(self):
        self.rows = []      # (level, family, name, ok, detail)

    def add(self, level, family, name, ok, detail=''):
        self.rows.append((level, family, name, bool(ok), detail))
        return ok

    def failures(self):
        return [r for r in self.rows if not r[3]]


def check_tables(rom, manifest, rep):
    """Level-independent manifest tables, re-read straight from the file.

    Raw file offsets on purpose -- no gbrom helper, no export_assets constant --
    so a wrong address in the exporter cannot verify itself. Recorded against
    level 0, which the report prints as `global`.

    The pit-leap velocities are the interesting case: they are not a table at
    all but immediates inside fourteen code stubs at 1:$7DBC, each
    `LD A,Yvel / LD [HL-],A / LD A,Xvel` followed by a jump into the shared
    tail (the last one falls through). The exporter decodes them; this reads
    them a second way -- fixed 5-byte strides from the known stub starts --
    and the two have to agree.
    """
    base = 1 * 0x4000                      # bank 1 starts here in the file

    want = list(rom.data[base + 0x3E3F:base + 0x3F29])       # 1:$7E3F-$7F28
    got = manifest['tables'].get('gapTable', [])
    rep.add(0, 'manifest', 'tables.gapTable == 1:$7E3F (234 B)', got == want,
            f'len {len(got)} vs {len(want)}; ' + ', '.join(first_diff(got, want)))

    # Stub starts: ten 8-byte stubs (JP tail), three 7-byte (JR tail), then a
    # 5-byte one that falls through. Walking the strides rather than decoding
    # the terminator is the independent half of this check.
    starts, off = [], 0x3DBC
    for i in range(14):
        starts.append(off)
        off += 8 if i < 10 else 7
    want = [[rom.data[base + s + 1], rom.data[base + s + 4]] for s in starts]
    shapes_ok = all(rom.data[base + s] == 0x3E and rom.data[base + s + 2] == 0x32
                    and rom.data[base + s + 3] == 0x3E for s in starts)
    rep.add(0, 'manifest', 'pit-leap stubs at 1:$7DBC are LD A,n/LD [HL-],A/LD A,n',
            shapes_ok, 'stub shape changed -- the addresses are wrong')
    got = [list(p) for p in manifest['tables'].get('gapLeaps', [])]
    rep.add(0, 'manifest', 'tables.gapLeaps == the 14 stub immediates',
            got == want, f'{got} vs {want}')

    # The four blobs that used to be hex literals in src/enemies.js. Same raw
    # file-offset reads, same reason: an exporter cannot verify its own address.
    for name, addr, n in (('enemyAnim', 0x2891, 0x6BC1 - 0x6891),
                          ('introPath', 0x3A41, 25),
                          ('introPoses', 0x3A5A, 25)):
        want = list(rom.data[base + addr:base + addr + n])
        got = manifest['tables'].get(name, [])
        rep.add(0, 'manifest', f'tables.{name} == 1:${addr + 0x4000:04X} ({n} B)',
                got == want,
                f'len {len(got)} vs {len(want)}; ' + ', '.join(first_diff(got, want)))

    rep.add(0, 'manifest', 'tables.enemyAnimBase == $6891',
            manifest['tables'].get('enemyAnimBase') == 0x6891,
            'enemies.js indexes enemyAnim by ROM ADDRESS -- a wrong base '
            'silently shifts every metasprite id')

    # The bat-rope chain, round select's CONTINUE script, and the player's two
    # attack-pose tables -- each a contiguous block despite reading as several.
    for name, bank, addr, n in (('ropeLinks', 1, 0x0224, 10),
                                ('ropeHooks', 1, 0x022E, 2),
                                ('continueScript', 0, 0x3328, 12),
                                ('attackAnim', 0, 0x1C1F, 24),
                                ('attackMsIndex', 0, 0x2786, 32)):
        off = (bank * 0x4000 + addr) if bank else addr
        want = list(rom.data[off:off + n])
        got = manifest['tables'].get(name, [])
        rep.add(0, 'manifest',
                f'tables.{name} == {bank}:${(addr | 0x4000) if bank else addr:04X}'
                f' ({n} B)', got == want,
                f'len {len(got)} vs {len(want)}; ' + ', '.join(first_diff(got, want)))

    # 1:$6CEA, five 32-byte prefab enemy records.
    want = [list(rom.data[base + 0x2CEA + i * 32:base + 0x2CEA + i * 32 + 32])
            for i in range(5)]
    got = [list(r) for r in manifest['tables'].get('projectileTemplates', [])]
    rep.add(0, 'manifest', 'tables.projectileTemplates == 1:$6CEA (5 x 32 B)',
            got == want, f'{len(got)} records vs {len(want)}')


def first_diff(a, b, limit=6):
    out = []
    for i in range(min(len(a), len(b))):
        if a[i] != b[i]:
            out.append(f'${i:04X}: ours ${a[i]:02X} real ${b[i]:02X}')
            if len(out) >= limit:
                break
    return '; '.join(out)


def check_level(rom, manifest, level, state, rep, do_vram=True):
    lvl_info = manifest['levels'][level - 1]
    ours_map = open(os.path.join(ASSETS, 'levels', f'{level:02d}.map.bin'), 'rb').read()

    # ---- MAP -------------------------------------------------------------
    width, ids = rom_level_map(rom, level)
    lut = rom_level_lut(rom, level)
    expect = bytearray()
    for mid in ids:
        expect.append(mid)
        expect.append(lut[mid])
    for addr, count in WATER_PATCHES.get(level, ()):
        for i in range(count):
            expect[(addr - 0xD000) + i * 0x20] = 0x08
    real = state['map'][:len(ours_map)]

    rep.add(level, 'map', 'map.bin size == width*32',
            len(ours_map) == width * 32,
            f'{len(ours_map)} B vs {width * 32}')
    rep.add(level, 'map', 'map.bin == live $D000', ours_map == real,
            first_diff(ours_map, real))
    rep.add(level, 'map', 'map.bin == ROM blob x LUT + $0D50 water patch',
            bytes(ours_map) == bytes(expect), first_diff(ours_map, expect))

    # ---- MANIFEST vs ROM tables and live RAM ------------------------------
    rep.add(level, 'manifest', 'width', lvl_info['width'] == width,
            f'{lvl_info["width"]} vs {width}')
    rep.add(level, 'manifest', 'height==16', lvl_info['height'] == 16)

    mt_raw = rom_metatiles(rom, level)
    mt_flat = bytes(b for m in lvl_info['metatiles'] for b in m)
    rep.add(level, 'manifest', 'metatile count',
            len(lvl_info['metatiles']) == len(mt_raw) // 4,
            f'{len(lvl_info["metatiles"])} vs {len(mt_raw) // 4}')
    rep.add(level, 'manifest', 'metatiles == ROM 5:$4000 blob',
            mt_flat == mt_raw[:len(mt_flat)], first_diff(mt_flat, mt_raw))
    rep.add(level, 'manifest', 'metatiles == live $C368',
            mt_flat == state['metatiles'][:len(mt_flat)],
            first_diff(mt_flat, state['metatiles']))

    sx = tbl_u8(rom, T_PLAYER_START, (level - 1) * 2)
    sy = tbl_u8(rom, T_PLAYER_START, (level - 1) * 2 + 1)
    rep.add(level, 'manifest', 'startX/startY == ROM 1:$7CED',
            (lvl_info['startX'], lvl_info['startY']) == (sx, sy),
            f'({lvl_info["startX"]},{lvl_info["startY"]}) vs ({sx},{sy})')
    if level == 10:
        # $0543-$0552: level $0A overrides the table with (2, $12) at init, and
        # sub_00_2889 skips the Y write for it. Live RAM cannot match the table.
        rep.add(level, 'manifest', 'live start == $04BB override (2,$12)',
                (state['startX'], state['startY']) == (0x02, 0x12),
                f'({state["startX"]},{state["startY"]})')
    else:
        rep.add(level, 'manifest', 'startX/startY == live $FF81/$FF83',
                (lvl_info['startX'], lvl_info['startY']) ==
                (state['startX'], state['startY']),
                f'({lvl_info["startX"]},{lvl_info["startY"]}) vs '
                f'({state["startX"]},{state["startY"]})')

    clamp = tbl_u8(rom, T_CAMERA_CLAMP, level - 1)
    rep.add(level, 'manifest', 'cameraClamp == ROM 0:$103F',
            lvl_info['cameraClamp'] == clamp, f'{lvl_info["cameraClamp"]} vs {clamp}')
    rep.add(level, 'manifest', 'cameraClamp == live $C732',
            lvl_info['cameraClamp'] == state['clamp'],
            f'{lvl_info["cameraClamp"]} vs {state["clamp"]}')

    for field, tbl in (('subtype', T_LEVEL_SUBTYPE), ('musicFresh', T_MUSIC_FRESH),
                       ('musicReentry', T_MUSIC_REENTRY)):
        v = tbl_u8(rom, tbl, level - 1)
        rep.add(level, 'manifest', field, lvl_info[field] == v,
                f'{lvl_info[field]} vs {v}')
    for field, off in (('exitRight', 0), ('exitTop', 1)):
        v = tbl_u8(rom, T_LEVEL_EXITS, (level - 1) * 2 + off)
        rep.add(level, 'manifest', field, lvl_info[field] == v,
                f'{lvl_info[field]} vs {v}')

    res = rom_resource_list(rom, level)
    rep.add(level, 'manifest', 'resources == ROM 1:$7C7D', lvl_info['resources'] == res,
            f'{lvl_info["resources"]} vs {res}')

    # Spawns: count + src from the ROM table, records against the live copy the
    # game made into $C268 / $C1E8 (sub_00_2889, 8 slots, zero-filled tail).
    for key, tbl, stride, ram in (('enemySpawns', T_ENEMY_SPAWNS, 32, 'enemies'),
                                  ('objectSpawns', T_OBJECT_SPAWNS, 16, 'objects')):
        src = tbl_u16(rom, tbl, (level - 1) * 3)
        cnt = tbl_u8(rom, tbl, (level - 1) * 3 + 2)
        info = lvl_info[key]
        rep.add(level, 'manifest', f'{key}.src', info['src'] == src,
                f'${info["src"]:04X} vs ${src:04X}')
        rep.add(level, 'manifest', f'{key}.count', info['count'] == cnt,
                f'{info["count"]} vs {cnt}')
        recs = base64.b64decode(info['records'])
        rep.add(level, 'manifest', f'{key}.records length',
                len(recs) == cnt * stride, f'{len(recs)} vs {cnt * stride}')
        n = min(len(recs), 8 * stride)
        rep.add(level, 'manifest', f'{key}.records == live RAM',
                recs[:n] == state[ram][:n], first_diff(recs[:n], state[ram]))

    # ---- VRAM ------------------------------------------------------------
    if not do_vram:
        return
    ours_vram = open(os.path.join(ASSETS, 'levels', f'{level:02d}.vram.bin'), 'rb').read()
    rep.add(level, 'vram', 'vram.bin is 8192 B', len(ours_vram) == 0x2000,
            str(len(ours_vram)))
    live = state['vram']

    spans = resource_spans(rom, res)
    covered = bytearray(0x2000)
    bad = 0
    detail = ''
    for dest, length in spans:
        a = dest - 0x8000
        for i in range(a, a + length):
            covered[i] = 1
        if ours_vram[a:a + length] != live[a:a + length]:
            bad += sum(1 for i in range(a, a + length) if ours_vram[i] != live[i])
            if not detail:
                detail = f'first bad span ${dest:04X}+{length}: ' + \
                         first_diff(ours_vram[a:a + length], live[a:a + length], 3)
    rep.add(level, 'vram', 'level resource spans match live VRAM', bad == 0,
            f'{bad} B differ; {detail}')

    # Informational: everything outside the level's own resource spans, split
    # three ways. Never fails the run; reported so drift stays visible.
    #   tilemap - $9800-$9FFF, built at runtime by the column streamer; the
    #             exporter makes no claim about it.
    #   intro   - the stage-intro tiles ($02/$1D/$05). build_level_vram() loads
    #             them for every level, but sub_00_333F RETs at $3364 for any
    #             level outside INTRO_LEVELS, so mid-route levels really
    #             inherit whatever the previous level left there.
    #   other   - genuinely unaccounted for.
    for dest, length in resource_spans(rom, (0x02, 0x1D, 0x05)):
        for i in range(dest - 0x8000, dest - 0x8000 + length):
            if not covered[i]:
                covered[i] = 2
    tilemap = intro = other = 0
    for i in range(0x2000):
        if covered[i] == 1 or ours_vram[i] == live[i]:
            continue
        if i >= 0x1800:
            tilemap += 1
        elif covered[i] == 2:
            intro += 1
        else:
            other += 1
    rep.add(level, 'info', 'VRAM outside the level resource spans', True,
            f'{tilemap} B $9800 tilemap, {intro} B stage-intro tiles '
            f'(intro screen {"runs" if level in INTRO_LEVELS else "SKIPPED"}), '
            f'{other} B unaccounted')


# ----------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--level', type=int, default=None, help='verify one level only')
    ap.add_argument('--no-vram', action='store_true', help='skip the VRAM family')
    ap.add_argument('--cross-check', action='store_true',
                    help='also prove route-entry == $FFB0-injection on levels 1/5/9')
    ap.add_argument('--verbose', action='store_true', help='list every check')
    args = ap.parse_args()

    if not os.path.exists(os.path.join(ASSETS, 'manifest.json')):
        print('assets/manifest.json missing - run: python tools/export_assets.py',
              file=sys.stderr)
        return 2

    rom = Rom()
    with open(os.path.join(ASSETS, 'manifest.json'), encoding='utf-8') as fh:
        manifest = json.load(fh)
    if manifest.get('levelCount') != NUM_LEVELS:
        print(f'manifest levelCount {manifest.get("levelCount")} != {NUM_LEVELS}',
              file=sys.stderr)
        return 2

    levels = [args.level] if args.level else list(range(1, NUM_LEVELS + 1))
    rep = Report()
    how = {}

    # Needs no emulator, so it runs before the slow part and fails fast.
    check_tables(rom, manifest, rep)
    how[0] = 'file'
    reported = [0] + levels     # what the table prints; `levels` is what we boot

    runner = Runner(verbose=args.verbose)
    try:
        for lvl in levels:
            method = 'route' if lvl in ROUTE_LEVELS else 'inject'
            how[lvl] = method
            sys.stderr.write(f'level {lvl:2d} ({method}) ... ')
            sys.stderr.flush()
            state = runner.enter(lvl, method)
            check_level(rom, manifest, lvl, state, rep, do_vram=not args.no_vram)
            fails = [r for r in rep.rows if r[0] == lvl and not r[3]]
            sys.stderr.write('ok\n' if not fails else f'{len(fails)} FAILED\n')

        if args.cross_check:
            for lvl in (1, 5, 9):
                if lvl not in levels:
                    continue
                sys.stderr.write(f'cross-check level {lvl} ... ')
                a = runner.enter(lvl, 'route')
                keys = ('map', 'vram', 'metatiles', 'enemies', 'objects',
                        'clamp', 'startX', 'startY')
                a = {k: a[k] for k in keys}
                b = runner.enter(lvl, 'inject')
                diff = [k for k in keys if a[k] != b[k]]
                rep.add(lvl, 'crosscheck', 'route entry == $FFB0 injection',
                        not diff, 'differing fields: ' + ','.join(diff))
                sys.stderr.write('ok\n' if not diff else f'DIFFER: {diff}\n')
    finally:
        runner.close()

    # ---- report ----------------------------------------------------------
    families = ['map', 'manifest', 'vram', 'crosscheck']
    print()
    print(f'{"level":>5} {"how":>7} ' + ''.join(f'{f:>11}' for f in families) +
          f'{"result":>9}')
    print('-' * (13 + 11 * len(families) + 9))
    for lvl in reported:
        cells = []
        for fam in families:
            rows = [r for r in rep.rows if r[0] == lvl and r[1] == fam]
            if not rows:
                cells.append('-')
            else:
                nbad = sum(1 for r in rows if not r[3])
                cells.append(f'{len(rows) - nbad}/{len(rows)}' if nbad
                             else f'PASS {len(rows)}')
        bad = sum(1 for r in rep.rows if r[0] == lvl and not r[3])
        label = 'global' if lvl == 0 else f'{lvl:d}'
        print(f'{label:>5} {how.get(lvl, "-"):>7} ' +
              ''.join(f'{c:>11}' for c in cells) +
              f'{"PASS" if not bad else "FAIL":>9}')

    if args.verbose or rep.failures():
        print()
        for lvl, fam, name, ok, detail in rep.rows:
            if ok and not args.verbose:
                continue
            if fam == 'info' and not args.verbose:
                continue
            mark = 'ok  ' if ok else 'FAIL'
            print(f'  {mark} L{lvl:02d} [{fam}] {name}' +
                  (f' -- {detail}' if detail else ''))

    n = len(rep.rows)
    bad = len(rep.failures())
    print(f'\n{n - bad}/{n} checks passed across {len(levels)} level(s)')
    if bad:
        print('ASSET INTEGRITY FAILURE')
        return 1
    print('ASSET INTEGRITY OK')
    return 0


if __name__ == '__main__':
    sys.exit(main())
