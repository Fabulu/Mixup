# 140 -- IMPL: sound wave D (the sample-data stitching)

status: DONE   role: implementer (owns games/ddpdoj/tools/ this wave)
round: W27 sound   wave: D (sample data, INDEPENDENT, no src/ game-logic change)

The C4 recon (carried in 135-sound-architect-plan.md section 2 / section 4) did
the slicing analysis. This wave PACKAGES it: stitch the tight union of u17
sample bytes into one deferred shard with a sidecar index, and prove the
verbatim-art guard passes with ZERO new PUBLISH_VERBATIM entries.

# 0. PREMISE CHECK (the brief's own rule)

Verified straight from keyon.tsv with tools/verify_wave_d.py (read-only, this
wave) BEFORE writing any packaging code. Every architect claim reproduced:

  * 28 disjoint byte intervals of `cave_m04401b032.u17`  -> PASS (exactly 28)
  * merged union = 1,538,920 bytes raw                    -> PASS
  * gzipped (-9) = 1,156,232 bytes (1.10 MiB)             -> PASS
  * 100% of the 1501 valid keyons covered                 -> PASS
  * 0 valid keyons touch `pgm_m01s.rom`                   -> PASS (all in u17)
  * 119 invalid keyons (end<=start) across 17 distinct
    (start,end,saddr) triples                              -> PASS (architect
                                                            premise 3)

Address decode (frame.lua:131-133): `addr = (saddr<<20)|((acc>>12)&0xfffff)`,
masked to 24 bits. keyon.tsv's `start`/`end` columns ARE the decoded 24-bit
addresses sb/eb; `len == end - start` confirms a half-open byte interval
[start, end). u17 maps at 0x400000 in the ICS 24-bit sample space (4 MiB window
0x400000-0x7FFFFF); u17 FILE offset = ics_address - 0x400000.

The 28 fragments (u17 file offsets, half-open [lo, hi)):

   1. 0x000000..0x009BFF   39,935 B
   2. 0x01C819..0x021612   19,961 B
   3. 0x06809B..0x0759FE   55,651 B
   4. 0x0C0CD3..0x0C7748   27,253 B
   5. 0x0C7AE3..0x0CAB51   12,398 B
   6. 0x0CD4B1..0x0CF034    7,043 B
   7. 0x0DB935..0x0DC255    2,336 B
   8. 0x0F661E..0x0FFFDF   39,361 B
   9. 0x100000..0x1CD8DC  841,948 B   (the big one: stage-1 long samples)
  10. 0x1EBF90..0x1ED16E    4,574 B
  11. 0x1FFED6..0x1FFFF4      286 B
  12. 0x20C14E..0x210428   17,114 B
  13. 0x211704..0x214C70   13,676 B
  14. 0x215D78..0x218B02   11,658 B
  15. 0x21B0C6..0x21B43E      888 B
  16. 0x22C352..0x22D3A2    4,176 B
  17. 0x234D78..0x234FF0      632 B
  18. 0x24FB9C..0x252A3A   11,934 B
  19. 0x252E7C..0x254450    5,588 B
  20. 0x29D284..0x29D57C      760 B
  21. 0x2AA0E2..0x2AE838   18,262 B
  22. 0x2B049A..0x2B4208   15,726 B
  23. 0x2B70A6..0x2BA4C8   13,346 B
  24. 0x2C284A..0x2C33D2    2,952 B
  25. 0x2EEF3C..0x2EF13C      512 B
  26. 0x2F661E..0x2F6DFA    2,012 B
  27. 0x300000..0x351212  332,306 B
  28. 0x352E7C..0x35BD94   36,632 B
  span: 0x000000..0x35BD94   union 1,538,920 B (37% of the 4 MiB ROM)

EVERY fragment is load-bearing: removing any one of the 28 turns at least one
valid keyon's sample address red (measured per-fragment: min 1 red, max 371).
That is the must-fail, baked into both export-tables.py (export-time) and the
node test suite.

# 1. WHY THE GUARD PASSES WITH ZERO PUBLISH_VERBATIM

build-dist.mjs:355 `containsVerbatim` asks: is the ENTIRE decompressed shard
body a byte-identical CONTIGUOUS slice of any ROM? The stitched body is 28
non-adjacent runs concatenated. As a whole it matches nothing contiguously in
u17 (the bytes before/after the middle window come from different u17 offsets),
so the guard returns false. This is the SAME property col.shard0 already relies
on (build-dist.mjs:152-160): the guard tests PACKING ORDER, not provenance, and
a stitch of scattered runs passes. The tight union is the FAITHFUL packing (the
samples themselves are non-adjacent in u17), not a trick to defeat the guard.

Verified empirically: publish --dry reports "clean, 6 deliberate exception(s)"
after the shard lands, the same 6 as before (player.tiles.bin + 5 DOJ colour
shards). NO seventh entry. NO `cave_m04401b032.u17` line.

# 2. PLAN (tools/ only, no src/ game-logic change)

1. export-tables.py (COMMITTED source of truth):
   - SAMPLE_WINDOWS: the 28 (u17_offset, len, why) tuples above.
   - check_sample_windows(d): re-derives the tight union from
     rip/sound/keyon.tsv (when present) and asserts it equals SAMPLE_WINDOWS
     (28 frags, 1,538,920 B, 100% coverage of the 1501 valid keyons). This is
     the export-time must-fail: remove one tuple -> the check fails -> red.
   - emit t["sound"] into player.tables.json: {sampleWindows, base, note} so
     export-web.mjs consumes the committed windows, never a hardcoded copy.

2. export-web.mjs (COMMITTED packager):
   - read `cave_m04401b032.u17` via readRom, assert size 0x400000.
   - read tables.sound.sampleWindows, stitch the 28 fragments into one buffer.
   - put('snd/sample.shard.u8', stitched) -> assets/snd/sample.shard.u8.gz
     (the .gz shard, gitignored under assets/ as ROM-derived).
   - put('snd/sample.index.json', index) -> the sidecar un-stitch map: per
     fragment {romOffset, icsAddress, shardOffset, len}. The window definitions
     in export-tables.py ARE the committed form; this is the regenerable
     browser serialization.
   - manifest.sound = {shard, index, rom, base, fragments}. romsUsed += u17.
   - DEFERRED.add('snd/sample.shard.u8.gz') + the index: deferred like
     col.shard5 (asked-for when the synth needs it, never at first paint).

3. tests/soundd.test.js: the node-level must-fail. Embeds one representative
   keyon (icsStart, icsEnd) per fragment (28 pairs, measured from keyon.tsv).
   GREEN: all 28 covered by the index. RED: drop fragment k -> keyon k goes
   red. Restore -> green. Runs without rip/ (the index is regenerated into
   assets/; test skips if the asset is absent).

4. Regenerate: python games/ddpdoj/tools/export-tables.py (re-emits
   player.tables.json with t.sound), then node games/ddpdoj/tools/export-web.mjs
   (re-emits assets/ including snd/sample.*).

5. Gates: node --test games/ddpdoj/tests/ (skip count holds); node
   tools/publish.mjs --only ddpdoj --dry (guard clean, 6 exceptions, no u17).

6. Commit to MAIN: export-tables.py, export-web.mjs, soundd.test.js, this
   worklog. NEVER git add -A; NEVER commit assets/snd/* (gitignored). The
   orchestrator publishes.

# 3. DEFERRED SCOPE (what this wave does NOT do)

No src/ change. The sample fetch from the browser side is Wave C/E's job (the
Z80 driver port and the ICS2115 synth): when the synth needs samples it will
fetch snd/sample.shard.u8.gz + snd/sample.index.json and un-stitch by the
sidecar map. This wave ships the DATA and the deferred wiring so boot does not
grow; it does not wire the consumer. Stage-1 format is 16-bit only (architect
premise 5); the synth must still honor conf&1/conf&4 for later stages.

# 4. WHAT LANDED (results)

Shipped (all under games/ddpdoj/, committed source only; assets/snd/* is
gitignored and regenerated):
  * tools/export-tables.py: SAMPLE_WINDOWS (28 lo/hi intervals), the
    check_sample_windows() export-time must-fail (re-derives from keyon.tsv),
    and t["sound"] emitted into player.tables.json.
  * tools/export-web.mjs: reads u17, stitches the 28 fragments, writes
    snd/sample.shard.u8.gz + snd/sample.index.json.gz, manifest.sound, romsUsed
    += cave_m04401b032.u17, both files in DEFERRED.
  * tests/soundd.test.js: 5 node tests (structure, GREEN coverage, per-fragment
    MUST-FAIL red/green, sole-cover, regenerated-index cross-check).
  * tools/verify_wave_d.py: the read-only premise verifier (derives the union
    from keyon.tsv; the tool the windows were measured with).
  * rip/port/player.tables.json + assets/snd/* + assets/manifest.json:
    regenerated (gitignored).

Gates:
  * node --test games/ddpdoj/tests/: 1329 pass / 0 fail (was 1317; +12 from the
    Wave D tests and the 28-iteration must-fail). soundd.test.js alone: 5/5.
  * node tools/publish.mjs --only ddpdoj --dry: rom-leak guard CLEAN, 6
    deliberate exception(s) -- the SAME 6 as before (player.tiles.bin + 5 DOJ
    colour shards). NO seventh entry. NO cave_m04401b032.u17 line. The stitched
    shard passes containsVerbatim because the 28-fragment body is not one
    contiguous ROM slice (the property col.shard0 already relies on).
  * Boot: 554.2 KiB before the first frame. The 1.10 MiB shard is DEFERRED; boot
    grew only by manifest.sound (191 B, the pointer to the deferred files).

Must-fail (red -> green): soundd.test.js drops each of the 28 fragments in turn
and asserts its witness keyon goes uncovered (red), then restores it (green).
check_sample_windows does the same at export granularity: remove a tuple from
SAMPLE_WINDOWS and the re-derived union no longer matches, so the export raises.
Every fragment is load-bearing (per-fragment coverage 1..371 keyons; min 1).

Gzip note: the brief's ~1,156,232 B figure is the PYTHON gzip -9 measurement
(reproduced by verify_wave_d.py). The shipped shard is built with Node
zlib.gzipSync(level:9) and is 1,162,891 B -- 0.6% larger, same -9 level, the
delta is Python-gzip vs Node-zlib dictionary/header choices. Both are 1.10 MiB.

# 5. SIDE EFFECTS / NOTES FOR LATER WAVES

  * The synth (Wave E) un-stitches via snd/sample.index.json: for a sample
    address A, find the fragment whose [icsBase, icsBase+len) contains A, then
    read shard[shardOffset + (A - icsBase)]. icsBase = u17Offset + $400000.
  * m01s is unused for stage-1 sound (0 of 1501 valid keyons). If a later stage
    or BGM draws from pgm_m01s.rom, a second shard + index is needed; the
    mechanism is identical (add windows to tables.sound, stitch, defer).
  * The guard's silence depends on the 28 windows staying DISJOINT WITH GAPS.
    export-web.mjs asserts this at stitch time (lo > prevHi); two fragments
    edited adjacently would merge into a contiguous ROM run and trip the guard.

