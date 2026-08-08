# 159 -- RECON: chain gauge, combo, and chain-driven hyper feed

status: **DONE**

started: 2026-08-08. wave: 159. role: fidelity-critical RECON. target:
`ddpdojblk` VERSION-B (2002.10.07 BLACK VER). All addresses are build B.
This wave changes no file under `games/ddpdoj/src/`. The owner approved MAME
as the oracle because there is no physical board.

Instruments:

- decrypted listing image `games/ddpdoj/tools/oracle/out/maincpu.bin`;
- controlled MAME probe `games/ddpdoj/tools/oracle/w159chain.lua`;
- executable ROM and capture checker `games/ddpdoj/tools/oracle/w159chain.py`;
- executable published-asset defect fixture
  `games/ddpdoj/tools/oracle/w159assets.mjs`;
- unique output under `.scratch/w159-*` only.

`[M]` means measured during this wave. `[L]` means exact listing evidence.

## 0. Premise and result

The owner's visible report is a mixture of three real surfaces, not one gauge:

1. **The cyan rectangle is the chain high-water number.** `$81B632` is printed
   by `$2845BA -> $286040` into TX cells 435..437 and 499..501. Forty-five of
   the 57 nonzero TX indexes observed in those cells are absent from the
   published sheet. `src/web/assets.js` also fills a missing glyph with pen 0,
   while the board's TX transparent pen is 15. Bank 5 pen 0 is cyan.
2. **The filling bar is the live chain timer.** `$81B5C0` is drawn by
   `$284614..$284658 -> $2859DC` as the last bucket-25 record. The complete
   board table selects 32 unique streams `$1CC4A0..$1CCCDC`, stride `$44`.
   All 32 are absent from the published sprite bundle. The JS producer runs,
   but the browser drops every record because it cannot remap the stream.
3. **The combo popup is a third presentation.** `$81B5DC` is a BCD snapshot of
   the live chain `$81B5DA`, drawn by `$2855B6` through bucket 25. The current
   capture observed 161 distinct bucket-25 stream addresses and the bundle
   lacks 158. This is why the combo appears absent even while its RAM changes.

There is also a gameplay defect independent of all art: when the ordinary
chain refill reaches its cap, current `src/score.js` clamps the timer and stops
at a note. It omits `$286674..$2866CA`, which adds to the hyper-item meter
`$81B64A` and tail-calls the real grantor `$287682`. Thus W100's statement that
"chain state runs" is true for the count/timer/score path and false if read as
"the full chaining feature runs". Missing art cannot explain this missing
state transition.

## 1. Exact state map

The P2 block is the instruction-identical mirror named here because a faithful
implementation must not silently implement P1 only.

| meaning | P1 | P2 | exact producers/consumers |
|---|---:|---:|---|
| live chain, packed BCD | `$81B5DA` | `$81B604` | `$286320/$286380/$2863B2`; mirror `$2864D0/$286524/$286552`; TX high-water and popup derive from it |
| high-water, packed BCD | `$81B632` | `$81B634` | `$2863C2/$286572`; `$2845BA/$284758 -> $286040` TX digits |
| chain timer | `$81B5C0` | `$81B5EA` | refill `$28664E/$2866F2`, clamp `$286664/$286708`, decay `$284636/$2847D4`, bar `$2859DC` |
| cap | `$81B5B2` | shared | `$28616C`, table `$287DF0 = [56,90]` by loop `$813098` |
| refill amount | `$81B5E0` | shared | `$2862D4/$286484`, table `$287DF4 = [20,18]` by weapon selector |
| seed score | `$81B5B8` | `$81B5E2` | cold hit/kill seed; cleared at timer expiry |
| seed mirror | `$81B5BC` | `$81B5E6` | score-chain bookkeeping |
| running accumulators | `$81B5CE/$81B5D2/$81B5D6` | `$81B5F8/$81B5FC/$81B600` | `$286326..$286468` and P2 mirror |
| popup countdown | `$81B5C8` | `$81B5F2` | seeded `$50/$B4/$F0`, decremented `$2845CC/$28476A` |
| popup animation/index | `$81B5CA/$81B5CC` | `$81B5F4/$81B5F6` | `$2845DA..$284606` and mirror |
| popup BCD value | `$81B5DC` | `$81B606` | `$28645E/$28660E`; read by `$2845D2/$284770 -> $2855B6` |
| chain-driven hyper-item meter | `$81B64A` | `$81B64C` | cap tail, beam/laser feeder, bee, death; grantor `$287682/$287722` |
| pending hyper items | `$81B6E0` | `$81B6E2` | grantor banks while hyper; `$2875B4/$287616` drains |
| hyper stock | `$81B65C` | `$81B65E` | kind `$0C/$14` collect `$2530CA/$2530F2` |
| hyper duration/display gauge | `$81B642` | `$81B644` | set to `$095F` on item collection, then drained by hyper machine |
| hyper active | `$81B63E` | `$81B640` | activation `$285A30` and P2 mirror |
| rank power accumulator | `$81B646` | `$81B648` | activation `$285A62`, then type-10 rank formula `$2608D2` uses `16*max(power)` |

The important naming correction is that `$81B5C0` is the chain timer/bar,
`$81B632` is the lifetime high-water digits, `$81B5DA` is the current combo,
`$81B64A` is the earn meter that creates a hyper item, and `$81B642` is the
duration gauge set after collecting that item. Calling all five "the gauge"
caused the earlier false closure.

## 2. Full gameplay call graph

### 2.1 Producers

`w159chain.py` scans the entire even-addressed decrypted image, not a selected
range. `[L]` current build B has **89 direct absolute-long callers of
`$286096` (hit)** and **90 direct absolute-long callers of `$28615E` (kill)**.
The checker prints every site and refuses a count change. These are enemy,
boss, and special-handler call sites across the full listing.

The weapon distinction is exact:

- Ordinary shot damage enters `$286096`. Its plain arm adds one score point
  (two while hyper is active) but does not extend an ordinary chain until an
  enemy dies and reaches `$28615E -> $2862C6`.
- A held beam sets hit-mask bit `$400` and block 8 can also set `$4000`.
  `$2860F2 -> $286876` is a contact-chain machine: it starts at timer 10,
  increments once or twice per accepted contact, floors the timer at 10 (25
  under hyper), updates score and high-water, and periodically feeds
  `$81B64A` through `$286774`.
- The bomb-laser has its separate `$811F72`-gated machine `$286A82` and feeder
  `$2867B4`. Those paths remain refused in current JS and must land together.
- Ordinary bomb kills use the normal `$28615E/$2862C6` kill path. They do not
  acquire the `$400` semantics merely because a bomb is active. W64 also proves
  that bomb press latches a running chain at `$2499D8`; teardown `$2564F0`
  alone calls `$2877D0/$2877FE` and clears it roughly 112 frames later.

No bee/medal or bomb behavior is changed or reinterpreted here. The W159 bomb
input occurred after gameplay/HUD had stopped at logic frame 5100, so it
produced no useful dynamic bomb evidence. The listing and W64 remain the
evidence for the authentic ordinary-bomb reset.

### 2.2 Ordinary kill chain `$28615E -> $2862C6/$286476`

In exact frame order:

1. `$28616C` loads cap 56 or 90.
2. `$2862D4` loads refill 20 or 18.
3. If the timer is zero, `$28631C` refills it, `$286320` writes chain 0, and
   the kill is only a seed. The first kill therefore is not displayed as 1.
4. If the timer is nonzero, `$286380` promotes the seed to chain 1 if needed,
   `$2863B2` increments packed BCD, `$2863C2` raises high-water, three
   `$286626` BCD additions update chain score/pending score, and `$2863E8`
   refills the timer.
5. `$286664` clamps at cap. With D1 nonnegative the listing falls through to
   `$286674`, the chain-driven hyper earn tail.
6. Later in the same logic frame, object type 0 calls `$28444E`. `$284636`
   subtracts one from a nonzero timer. Refill therefore precedes decay and a
   hit on the last available frame saves the chain.

At timer zero, `$284640/$284646` clear the seed/running score accumulators.
The displayed BCD count is intentionally retained. On the next kill,
`$286320` resets it to zero while starting a new timer; the following connected
kill seeds 1 and increments to 2. Chain break is therefore a two-stage state
transition, not a one-frame `chain=0` write.

### 2.3 Decay, saturation, popup, and transitions

- Non-hyper decay is exactly one unit per logic frame at `$284636/$2847D4`.
  The apparent hyper sub-tick reads `$81B64F/$81B651`; every known writer puts
  zero there, so it also borrows and decrements every frame. Current JS keeps a
  loud note if a future based writer proves a nonzero reload.
- Loop caps are 56 and 90. Weapon refills are 20 and 18. The bar table has 56
  and 90 entries but only 32 unique images.
- Popup timers use `$50`, `$B4`, or `$F0`; at chain 16 the long-popup arm takes
  over. `$2855B6` has no gameplay writes. It only installs its palette and
  emits BCD snapshot digits plus a suffix.
- Section scripts and the stage setter `$25FD0C` do not touch the chain block.
  Per-stage reset `$25FD38` clears enemy/effect/item pools, not `$81B5xx`.
  During a result sequence the live timer continues through object type 0 and
  normally expires. The high-water survives for the credit/result record.
- The only direct absolute callers of the full reset bodies are
  `$2564FA -> $2877D0` and `$256508 -> $2877FE`, both bomb teardown. Cold-game
  bulk initialization can clear RAM wholesale; it is not a section-transition
  chain rule. No evidence supports inventing a section reset.

### 2.4 Cap to hyper item to rank

`$286674..$2866CA` is the real missing link:

```
D0 = $286EC2[$813094]                 [4,4,5,4,4] by stage*2
if hyper active: D0 = $286ECC[...]    [1,1,1,1,1]
else D0 += $2866D2[stock]             [0,-1,0,1,2,3]
if stock != 5 and D1 bit 2 clear: D0 *= 2
$2866C4  $81B64A += D0
$2866CA  jmp $287682
```

The six exact direct callers of `$287682` are death `$249FDA`, bee collection
`$27FBE4`, cap tail `$2866CA`, beam feeder `$2867A4`, bomb-laser feeder
`$2867CE`, and dead/vestigial feeder `$2867E4`. `$287682` requires
`$81B64A > $095F`, refuses stock 5 or pending 4, clears the meter, then:

- not hyper active: spawns kind `$0C` through `$27E912` in the same frame;
- hyper active or gated player state: increments pending `$81B6E0`;
- pending drain `$2875B4` later spawns the deferred kind `$0C` items.

Collection is separate. `$27EFD2 -> $2530BE` calls `$252904` only on stock
0-to-1, `$2530CA` increments stock, `$2530D0` sets duration gauge `$095F`, and
`$27EFDC -> $28C65E` posts the pickup sound. The chain core itself
`$28444E/$286096..$2867EA` makes no `$28Cxxx` sound call. Sound is a downstream
item/activation effect, not a chain-count side effect.

Rank is one link later still. Hyper activation `$285A62` adds stock to power
`$81B646`; type-10 `$2608D2` uses that word in its `16*power` rank term. A cap
does not directly write rank or stock. Current type-10 rank is live, which is
why half-porting this pipeline is now rank-critical.

This explicitly differs from an ordinary hyper pickup: chain contact fills
`$81B64A`; threshold crossing creates a falling hyper item; collecting the
item raises `$81B65C` and sets `$81B642`; using it raises rank power. Chain
gain is neither an immediate stock increment nor the pickup/duration gauge.

## 3. Controlled oracle measurement

Command:

```
python games/ddpdoj/tools/oracle/w159chain.py capture 5800
```

Result: `DONE logicframes=5800 videoframes=5961 build=B`. The run declares two
interventions: invulnerability `$810424 := $FF` from lf1960, and, only after
the natural census, `$81B64A := $0960` plus divider `$81B636 := 0` at lf4800.
The latter tests threshold plumbing, not natural pacing.

### 3.1 Tap shot

One-frame shot taps every 12 frames, lf2400..2899, produced 22 observed kills.
At lf2786 the first kill writes cap `$38`, refills 0 to `$12`, writes chain 0,
then the HUD decrements to `$11`. At lf2788 two kills occur in the same logic
frame: seed 1, increment 2, refill to `$22`; increment 3, refill to `$34`; HUD
decrement to `$33`. End of phase: chain BCD `$0022`, observed meter maximum 55,
and 19 cap-tail events. Ordinary shot damage before death goes through the
89-site `$286096` hit inventory; only kills extend this ordinary-shot chain.

### 3.2 Held laser and adjacent continuation

Held contact lf2900..3499 advances chain BCD `$0022 -> $0537`, samples timer
12..55, records 87 kill-cap events, 507 chain increments, and 499 cap feeds.
The left/right sweep lf3900..4299 continues the same chain across adjacent
enemies rather than resetting per target. Block-8 contacts can count twice,
which is the listing's `$4000` rule, not a dropped-frame artifact.

### 3.3 Release, clean decay, and break

The nominal no-fire phases can still contain residual projectiles and live
hyper contact, so phase totals alone are not decay evidence. A clean window
lf4343..4391 contains no kill, refill, chain increment, or beam-gauge event.
The frame-end timer samples are exactly 54,53,...,6 while chain stays BCD
`$1004`. Lf4392's next kill increments to `$1005`, refills to `$18`, then ends
at `$17`.

After the forced meter begins decaying, lf4810 is 1 and lf4811 is 0;
`$284640/$284646` clear the accumulators while the display count remains
`$1022`. Lf4956's first post-break kill writes chain 0 and ends with timer 17.
Lf4958's connected kills seed and reach chain 2, ending with timer 33.

### 3.4 Hyper earn and item threshold

Natural `$81B64A` reached sampled maximum `$076F`. At lf4344 a bee collection
at `$27FBDE` pushed the natural meter over threshold; `$2876A0` cleared it and
a kind-C item was live. This proves the common grantor, but it is bee-driven,
not a claim about chain-only pacing. At lf4724 that item is collected:
`$2530CA` writes stock 1 and `$2530D0` writes duration `$095F`.

The controlled chain-only threshold is lf4984. Starting from the declared
forced `$0960`, real kills reach the cap; `$2866C4` writes `$0966`, the real
`$287682` executes `$2876A0`, and a kind-C item is live on that same frame.
This is falsifiable proof of cap-tail -> earn meter -> grantor -> item. Only
the starting proximity to threshold is forced.

### 3.5 Same-frame picture outputs

At lf2899, chain BCD `$0022`, the exact high-water TX cells are:

```
C5FB C5F1 C5E7
C619 C60F C605       attr $000A on every cell
```

At chain BCD `$1004` they are `$C5F9/$C5EF/$C5E5` and
`$C61B/$C611/$C607`. The three vertical cells per digit prove this is a number,
not a partially filled rectangle. Bucket 25 on the same frames carries popup
records and the chain bar as its final record.

## 4. Published asset audit

`node games/ddpdoj/tools/oracle/w159assets.mjs` passes only when it reproduces
the current defect:

- 57 nonzero TX indexes observed in the six high-water cells; 45 missing;
- 161 distinct bucket-25 streams observed; 158 missing;
- all 32 distinct bar streams missing;
- missing TX fallback still pen 0 instead of board-transparent pen 15.

The 32 bar streams are:

```
$1CC4A0 $1CC4E4 $1CC528 $1CC56C $1CC5B0 $1CC5F4 $1CC638 $1CC67C
$1CC6C0 $1CC704 $1CC748 $1CC78C $1CC7D0 $1CC814 $1CC858 $1CC89C
$1CC8E0 $1CC924 $1CC968 $1CC9AC $1CC9F0 $1CCA34 $1CCA78 $1CCABC
$1CCB00 $1CCB44 $1CCB88 $1CCBCC $1CCC10 $1CCC54 $1CCC98 $1CCCDC
```

This closes the owner's "bar does not fill completely" report: the producer
selects the correct 32-step image progression, and the shipped sheet contains
zero of those images.

## 5. Current JS audit and stale conclusions

Already live on HEAD:

- top-level type 0 HUD, score drain, and frame-ordered meter decrement;
- `$286096`, `$28615E`, ordinary P1/P2 chain machines, BCD count/high-water,
  refill, cap clamp, popup state, and score accumulation;
- `$286876` beam contact chain and `$286774` gauge feeder;
- popup `$2855B6`, chain bar `$2859DC`, TX printer, bucket-25 enqueue/drain;
- type-10 rank recompute.

Capture-seeded or frozen/refused:

- `capClamp` stops at a note instead of `$286674..$2866CA`;
- the live beam feeder writes `$81B64A` but only notes `$287682`;
- bomb-laser `$286A82/$2867B4`, bee `$27FBDE -> $287682`, and death grant are
  noted/refused at their exact addresses;
- `$287682/$287722`, kind `$0C/$14` allocation/collection, pending spawn loop,
  hyper button, activation, end, and weapon substitution are absent/refused;
- TX fallback and both required art families are absent from the bundle.

Prior-wave corrections:

- W100 correctly identified the high-water TX block and missing art, but its
  "state live" headline was incomplete because the cap-to-hyper feed is absent.
- W113 ported the bar **producer**, not its browser picture. Its full 56/90
  selection table resolves to 32 streams, none exported.
- W118 ported the popup body. "HUD feature-complete" is false as a published
  result because 158 of 161 observed bucket-25 streams are absent.
- `score.js` still says "This port never decrements" in the chain body even
  though W63 has decremented in the authentic object slot for many waves.
- `web/app.js` still carries pre-HUD statements that no chain meter/score row
  exists. These are documentation bugs for the implementation wave.

## 6. Smallest faithful implementation sequence

These should not be one source wave. Art coverage has no gameplay/rank risk;
the hyper pipeline does.

### Wave 160A: chain presentation closure

1. Change missing-TX fallback to transparent pen 15.
2. Export the complete table-derived high-water glyph families, not only the
   45 observed indexes. Include score digits and hyper-stock glyphs that become
   live when stock is enabled.
3. Export all 32 chain-bar streams derived from both 56/90-entry tables and all
   popup digit/suffix streams derived from `$28567C/$2856D4/$285784`.
4. Replace this recon's negative asset fixture with a positive `missing == 0`
   gate over the ROM-derived table extents and a rendered progression test.
5. Correct stale comments without changing authentic state.

### Wave 160B: chain earn, grantor, item, and full hyper lifecycle

Treat this as one rank-critical feature branch even if delivered in reviewable
commits:

1. Port `$286674..$2866CA` and both player mirrors with exact tables, bit tests,
   unsigned word arithmetic, and same-frame call order.
2. Port `$287682/$287722`, pending queues, `$2875B4/$287616`, and kind-C/14
   spawn/collect including exact refusal at stock 5/pending 4.
3. Port hyper request, activation `$285A24`, stock-to-power `$285A62`, duration,
   end, and weapon substitution so earned stock is actually usable.
4. Close death/bomb rank sinks and all P2 mirrors before enabling bee's already
   authenticated gauge add. Do not alter bee/medal scoring or bomb visuals.
5. Gate cap gain, spawn timing, item collection, activation, rank power, death,
   bomb debit, pending drain, sound calls, and stage/result carry against MAME.

Shipping only step 1 would make `$81B64A` accumulate into another note. Shipping
the grantor without item collection creates unreachable rewards. Shipping
stock without activation creates unusable hypers. Shipping activation without
death/bomb sinks makes rank wrong and rising. The feature is therefore one
correctness unit even when implementation is split for review.

## 7. Executable evidence and RED controls

Static green:

```
python games/ddpdoj/tools/oracle/w159chain.py
PASS W159 static: hit callers=89, kill callers=90, grant callers=6,
cap=[56,90], refill=[20,18]
```

Capture green:

```
python games/ddpdoj/tools/oracle/w159chain.py verify-capture
PASS W159 capture contract: hit/refill/decrement/break/restart/grant/TX/bucket25
```

Deliberate in-memory mutations:

- `--break-opcode` changes `$284636` from opcode `$53` to `$52`: exit 1,
  exact-byte assertion RED, then normal run GREEN.
- `verify-capture --break-capture` changes parsed lf4811 meter 0 to 1: exit 1,
  break-order assertion RED, then normal run GREEN.
- `w159assets.mjs --break-audit` removes one parsed missing bar stream: exit 1,
  extent assertion RED, then normal run GREEN.

No cartridge-derived file or source file is mutated by any RED control.

## 8. Direct caller appendix

The executable checker is authoritative and prints these on every run.

`$286096` hit callers (89):

```
263D16 2647D8 264EE4 2654F2 2658BC 265E98 2663F4 266A14 266EA4 267434
26828E 26891A 268EB6 2693A0 269CF8 26A0A6 26A2F0 26A5F2 26A86E 26AA9A
26AD36 26B042 26B77C 26B848 26C4A2 26C55A 26C5C0 26D4EA 26D822 26E0AA
26F662 2706BA 270C9C 270E5C 27135A 27164E 271A8C 271D56 2720EC 272456
273A68 2740E4 27481C 274CFE 27532A 27596A 275D3A 275FB0 276516 276A46
277382 277610 277A12 277FA6 278524 278CB8 279948 279B7E 279DC2 279F9A
27A1FE 27A5BC 27AD32 27AF42 27B81E 27B8EC 27B99A 27C328 27C8AE 27D0C2
27D6D6 27DD7E 27E180 294AF4 294BC8 294CAC 296C54 29834E 2984FA 29858E
298622 2986B6 29875C 29C986 29FBAE 2A3B5E 2A6C32 2A6F74 2A7126
```

`$28615E` kill callers (90):

```
263DA0 263DA8 263E4A 263EAC 263F06 2647F6 264F06 26553C 265906 265ED4
266430 266A40 266EC2 2673AE 2681D0 2682AE 268846 268936 269166 269634
269D16 26A0C4 26A30E 26A610 26A88C 26AAB8 26AD54 26B060 26B7F2 26B874
26C508 26C598 26C5FE 26D508 26D856 26F69E 270E7A 27137C 271670 271AAE
271D78 27210A 272478 273DB4 2744A2 274AF2 27505C 275672 275AF4 276284
276630 2767D2 2768F4 276CA0 276D02 27749E 27775A 2777BE 277D1A 27819A
278670 27923C 2799B6 279BC2 279E06 279FDE 27A374 27A792 27B092 27BC8E
27BCE6 27BF0C 27C43E 27CB2A 27D280 27D902 27DF2C 27DF76 27E334 294C4A
294D2E 296C90 29853E 2985D2 298666 2986FA 29FDE0 2A3BA0 2A6D3A 2A6FF8
```

## 9. Limits

- The tap-shot capture proves kill-side ordering. It does not attach an
  execute breakpoint to each `$286096` ordinary damage hit; the full hit
  entry inventory and opcode graph are listing evidence.
- The ordinary-bomb window was after the game had stopped updating and is not
  dynamic evidence. No conclusion in this worklog depends on it.
- The forced threshold proves plumbing and same-frame ordering, not natural
  time-to-hyper. Natural pacing remains input, route, bee, and stock dependent.

## 10. Gates

- focused chain/HUD suite: **125 pass, 0 fail, 0 skipped, 0 todo**;
- full `node --test games/ddpdoj/tests/`: **1401 pass, 0 fail, 0 skipped,
  0 todo**;
- W159 static, capture, and published-asset fixtures: PASS;
- all three deliberate in-memory RED controls: exit 1, restore GREEN;
- `node tools/publish.mjs --only ddpdoj --dry`: PASS, ROM-leak guard clean,
  distribution built, not deployed.
