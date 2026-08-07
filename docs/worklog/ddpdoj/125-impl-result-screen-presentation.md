# W125 IMPL -- THE RESULT SCREEN PRESENTATION: the draws, the banner, the score

status: **DONE**.
wave: 125. role: IMPL (the sole writer to `games/ddpdoj/src/` this wave).
date: 2026-08-07.
parent plan: `123-recon-result-screen.md` (W123 R2b); R2a landed in W124 (`05d59e3`).
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx..$2Axxxx`),
address == file offset, big-endian M68K. ROM read via the oracle capstone scratch.

== PREMISE CHECK ==
R2a verified in `05d59e3`: the 8-phase FSM `result28D9AA`, the tally
`tally2853D2`, the banner state machine `banner28E7F8` are all ported; the
presentation draws are `note()` placeholders; the DEV-2 residual key is
`$28d6fc` and its text names `$246410`.

ONE PREMISE CORRECTED (the DEV-2 residual): `$246410` is a LOADER, not the
per-frame `$18(node)` drain. Disasm shows `$246410` claims a player slot at
`$810346`, allocates nodes from `$80FA86`, seeds each node's content (code
pointer from `$24627A`, anim data from `$246B38`, the `$30(node)` script copy)
and seeds `$18(node) := $FFFF0000`. It is reached from 10 absolute-long call
sites (`$28D770` here, plus `$26B802/$26C828/$278AC4/...` in boss/midboss),
ALL one-shot installs. The actual per-frame decrement of `$18(node)` is done
by the animation-object EXECUTION engine, which walks the chain via ADDRESS-
REGISTER INDIRECT (xref.py is blind to it) and runs each node's code script.
That engine is the deep presentation tier five waves have deferred. So porting
`$246410` makes the INSTALL honest but does NOT make the chain drain. The DEV-2
deviation text in stageend.js is corrected this wave to name the TRUE gap (the
animation-object execution engine), not `$246410`.

== SCOPE (this wave) ==
1. The draws `$28DED8` (draw1) / `$28E1AC` (draw2) -- promote notes to REAL
   register-convention sprite enqueues (`enqueueRegistersThroughStub` on
   `$23DECE` bucket 0 and `$23DF2A` bucket 2, resolved from the cartridge).
2. The banner picture `$28EDC0` + the banner paint arms inside `banner28E7F8`
   (the `$23F782`/`$23F7F4` enqueues on bucket 22).
3. The 8 art windows `$2254B8..$225878` (the result-screen + banner sprite
   sources for `$24150A`) in `tools/export-tables.py`.
4. The `$246410` loader (state $A's `$28D770`) -- port the install faithfully
   so the animation nodes get REAL content (code pointers, anim data, script
   copy), and un-note the site. Correct the DEV-2 text.
5. The score-number renderer `$2855B6..$285994` -- port if it fits; else defer
   with a measured reason.

== SUBSTRATES REUSED ==
* `enqueueRegistersThroughStub(ram, rom, stub, d1, d2, d3, d4)` (spritequeue.js)
  -- resolves the bucket from the cartridge stub pointer exactly as the board's
  `jsr $23dece` / `jsr $23df2a` / `jsr $23f782` does.
* The `txPrint240DC2` / `flushTextDefer141258` text path (W116, hud.js) -- if
  the score renderer or labels reach it.

== MUST-FAIL ==
At stage-end (a fixture driving `result28D9AA` to the F5/F6 draw phase), assert
the result-screen draws EMIT sprite records into buckets 0 and 2 (counters
`$80AFC0` / `$80AFC4` increase from zero). Before this wave (notes): zero such
records. After: the expected records from draw1 + draw2. Break a draw, watch
red (no records), restore, green. SEEDED via the existing w62 gate where the
seed reaches the draw phase; fixture-driven where it does not.

==============================================================================
THE HEADLINE
==============================================================================
W123 sized R2b at ~660 instructions of PRESENTATION. This wave ports the result-
screen draws $28DED8/$28E1AC (the core visible win), the banner paint arms
$23F782/$23F7F4, the banner picture draw $28EDC0, the F0 art install (seven
$24150A), the 8 art windows, and CORRECTS the DEV-2 text. The result screen is
now VISIBLE: the panels, the bee/item/medal counters and the bonus numbers
render every F4/F5 frame, and the banner picture + frame render during the
slide-out. R2a's logic (the phase FSM, the tally, the banner state machine) runs
unchanged underneath.

==============================================================================
1. WHAT LANDED
==============================================================================
src/stageend.js:
  * draw1_28DED8(ram, rom) -- the 15-block result draw (3 base panels, the P1/P2
    panel+label slides, the 4 medal counters, and the per-live-player ship icon
    + 2 bee/item animation cells). Each block computes D1-D4 the way the ROM
    does and calls enqueueRegistersThroughStub on $23DECE (bucket 0) / $23DF2A
    (bucket 2), resolved from the cartridge stub pointer. The two animation-cell
    pointer advances at $54/$58(a6) are real RAM. The D1 packed-position
    arithmetic (addi.w low-word-only, swap, move.w->Dn leaves the high word) is
    faithful via the d1SetLo/d1AddLo/d1Swap helpers; D4 inheritance across
    enqueues (the stubs never clobber D1-D4) is preserved.
  * draw2_28E1AC(ram, rom) -- the P1 then P2 bee-bonus / item-bonus / medal-
    count NUMBER renders. Each is a BCD-digit walk over the 16-entry digit-art
    table $28E658 (already in the W124 $28E646 window): mask $F, x4, read the
    art longword, enqueue, lsr #4, repeat (3-5 digits with zero-stop). The
    item/medal-bonus arms BCD-convert via the ported $242AC6. P2 is the exact
    mirror of P1 off $44(a6) and the P2 pools.
  * bannerPaint(ram, base) -- the two slide-out paint arms: $23F782 (RECORD
    convention, bucket 22) enqueues the frame record at base; $23F7F4 (REGISTER
    convention, bucket 22) draws the banner PICTURE (art $1F18E4) at the
    swap/swap computed position. Both cite the cartridge stub.
  * bannerDraw28EDC0(ram, rom, ctx) + artByte28ECB2(ram) -- the per-frame banner
    PICTURE. Reads the art byte ($28ECB2), indexes $28EE1E[artbyte*8] for D2,
    and enqueues via $23DECE at the fixed D1=$10000. The ENTRY arm ($81E02C==0,
    the $23F82A ZOOMING enqueue on the $23E78C scale table, bucket 22) is NOT
    ported -- it is a DIFFERENT zooming routine than $23D9E2 family
    (enqueueZoomedRequest covers), noted by address.
  * F0 art install: the seven $24150A calls are REAL install24150A (sprite
    palette banks $11..$16,$10), guarded on ctx.palette (background.js pattern;
    a bare-RAM fixture has no palette state).

tools/export-tables.py: four new windows -- $2254B8 (bank $11), the contiguous
$2255B8..$2256B8 block (banks $12-$15), $225878 (bank $16), and the banner-
picture table $28EE1E (5 per-stage art pointers + the alt $28EE46). 209 ROM
windows total (was 205).

==============================================================================
2. THE DEVIATIONS, REVISITED
==============================================================================
DEV-1 -- unchanged (cleared in W124; the real $285496 is the sole producer).

DEV-2 -- REFINED, with a W125 CORRECTION to the text. W124 named $246410 as
"the per-frame anim-object driver that drains $18(node)". W125 disassembled
$246410: it is a LOADER (10 absolute-long call sites: $28D770 here +
$26B802/$26C828/$278AC4/$279248/$27B6D6/$27C730/$27CA00/$288C1A/$28F4BA), a
SIBLING of $24652A. It claims a player slot, allocates nodes, seeds each node
content (code ptr $24627A, anim data $246B38, the $30(node) script copy) and
SEEDS $18(node):=$FFFF0000. It does NOT decrement $18. The TRUE per-frame drain
is the animation-object EXECUTION engine (walks the chain via register-indirect,
invisible to xref.py, runs each node code script) -- the deep presentation tier
five waves deferred. The deviation text and the $28D770 note are corrected to
name the execution engine as the gap. $246410 full install port is deferred: it
needs three new table windows ($24627A/$246B38/$28D7FE) and is inert without the
executor.

==============================================================================
3. THE MUST-FAIL, RED -> GREEN
==============================================================================
tests/w62stageend.test.js "W125 MUST-FAIL":
  (a) SEEDED: drive result28D9AA 80 frames on a type-6 fixture (P1 live); assert
      bucket 0 ($80AFC0, $23DECE) and bucket 2 ($80AFC4, $23DF2A) counters both
      grew. Before W125 (notes): zero records; after: non-zero.
  (b) Fixture: seed only the panel pointers, call draw1_28DED8 with NO live
      player; assert the base panels (bucket 0) + medal counters (bucket 2) emit.
RED-BREAK: insert return; at the top of draw1_28DED8 -> both tests fail with
"draw1 enqueued to bucket 2 ($23DF2A): 0 bytes" / "base panels went to bucket 0"
(AssertionError, not an exception). RESTORE -> green. The owner live-verifies
the actual visual.

NOTE on the brief "bucket-25 + $240DC2 text tiles": the result-screen draws are
SPRITE enqueues (buckets 0/2 via $23DECE/$23DF2A), not text. Bucket 25
($23FA96) is the SCORE-NUMBER renderer emitter (see sec 4), and $240DC2 is the
HUD text path -- neither is reached by the result-screen draws. The must-fail
reflects the ACTUAL record path.

==============================================================================
4. WHAT DEFERRED, AND WHY
==============================================================================
  * The score-number renderer $2855B6..$285994. W123 R2b labelled it "the
    result-screen score display"; it is NOT. xref.py finds its TWO callers at
    $284610/$2847AE (the HUD $284xxx block), and W117 (popup recon) already
    named $2855B6 as the POPUP score renderer ($24157A three call sites are
    inside it). It is the HUD/popup big-number renderer, NOT result-screen-
    specific. The result-screen bonus numbers are already VISIBLE via draw2 digit
    walks; the main score is already rendered by W115 HUD score-digit path.
    Porting $2855B6 would be HUD/popup work (its zooming enqueues
    $23FAC4/$23FA96 -> bucket 25, the $2250D8/$225118/$225158/$2856D4/$285784
    tables, leading-zero suppression), out of R2b scope.
  * The banner ENTRY arm ($23F82A, the $81E02C==0 zooming enqueue on the
    $23E78C scale table). Distinct from $23D9E2 zoom family
    (enqueueZoomedRequest); noted by address.
  * The $246410 loader full content-seed port (see sec 2).
  * The banner slide-out art install $24150A at $28EA40 (one call; the slide-out
    template is copied, the art install stays a note -- low value).

==============================================================================
5. GATE
==============================================================================
node --test games/ddpdoj/tests/ 1272/0/0 (skip 0). (+2 the W125 MUST-FAIL
tests; the R2a tests still pass unchanged.)
python games/ddpdoj/tools/bosscoverage.py 103/0/8 (unchanged).
node tools/publish.mjs --only ddpdoj --dry clean (265 files, no leaks).
