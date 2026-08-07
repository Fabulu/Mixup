# W123 RECON -- THE RESULT SCREEN: phase map, deviation-clears, smallest port

status: **DONE** -- the phase structure of `$28D9AA` is enumerated (W49 only
counted it), both deviations are confirmed with their exact clear sites, the
stuck-slot clearer is located, and a two-wave port is sized below. Read-only
recon; the only file written is this one.

wave: 123. role: RECON (READ-ONLY).
date: 2026-08-07.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
instrument: `games/ddpdoj/tools/oracle/out/maincpu.bin` via a scratch capstone
script (`.scratch/recon123/`, uncommitted). All instruction counts and phase
bounds were re-measured this session; W49's "447/155/351/242/103/21" reproduce
within the noise of where you draw the data/code boundary.

brief: W119 Phase 2a. The result screen is the highest-value single completion
unit: it removes W62's two declared deviations (`DEV-1`, `DEV-2`), it is where
the stage-clear score comes from, and porting the banner frees the object slot
W62 left stuck in state 4.

---

## 0. PREMISE CHECKS -- the brief was right, and W49's "819 instructions" figure is the miscount W119 flagged

W119 premise-correction #5 said the "819 instructions" for `$28D9AA` is a
miscount (314 linear / 835 region). Re-measured:

| label | W49 said | this session (linear code, excl. data tables) |
|---|---|---:|
| `$28D9AA` main | 447 | 295 (the code before the `$28E646` data block; W49's 447 counts the data and the `$28DE2A..$28DE78` advance tail) |
| `$28DED8` draw1 | 155 | 155 (matches) |
| `$28E1AC` draw2 | 351 | 322 |
| `$28E7F8` banner | 242 | ~210 across the non-contiguous code (data templates split it; linear scan mis-decodes) |
| `$285400` tally body | 103 | 79 (`$285400..$285568`); plus the front `$2853D2` (9) and `$28556C` (21) |
| `$28556C` button | 21 | 21 (matches) |

The "819-instruction" figure for `$28D9AA` (carried in `stageend.js:49`,
`hud.js:145`, HANDOVER) matches NO measured boundary. The honest sizing for the
whole result-screen region is ~1,000 instructions of code plus four embedded
data tables; the impl sizing in W49 §8 / W119 (~1,000-1,400 across 5-6 routines)
is correct and unchanged.

**No other premise in the brief was false.** The score callees ARE ported
(verified, SS5); the deviation producers ARE where W49 said (SS3); the stuck
slot's single clearer IS `$28EAD4` (SS4).

---

## 1. THE HEADLINE -- `$28D9AA` IS A PHASE MACHINE ON A FIXED RAM BUFFER, NOT AN OBJECT

**A6 = `$81DEBE`, always.** Every state arm of object type 6 that calls
`$28D9AA` reloads it:

```
28D6D8 / 28D6EE / 28D740 / 28D754:   lea.l  $81debe.l, a6
                                     bsr.w  $28d9aa
```

`$81DEBE` is the 0x77-word "result" buffer W62 already zeroes in `stageend.js`
as `SE.result` (`clear28D552`, called from type 6's init `$28D566`). So
`$28D9AA` is a SUBROUTINE of the type-6 object that operates on a fixed RAM
buffer -- **not a separate animation object, not a register-computed pointer**.
This is the single fact that makes the phase structure tractable, and it is the
biggest-risk item W119 named ("unexpected state transitions or handshake deps"),
now resolved: the entire handshake is the closed `$8130F9` bit 1/2/3 enumeration
W49 §3.1 already census-locked (31 sites), and the phase byte is `$2(a6)` =
`$81DEC0`, four bits.

`$28D9AA`'s A5 is the type-6 object slot (the caller's A5), read at the advance
tail `$28DE2A cmpi.b #$b,$6(a5)` / `$28DE3A cmpi.w #$5,$4(a5)`. So the routine
has two anchors: A6 = the result buffer, A5 = the stage-clear object. Both are
fixed/known.

---

## 2. THE EIGHT PHASES OF `$28D9AA`, WALKED FRAME BY FRAME

Phase byte `$2(a6)` = `$81DEC0`. Entry tests run in order bit 0, bit 2, bit 1,
bit 3 (fall-through). Position/timer fields are at `$4/$6/$8/$c/$2c(a6)`.

| phase | gate | what runs | leaves on |
|---|---|---|---|
| **F0 ART INSTALL** | `$28D9AA` bit0==0 | set bit0; `$28D9BA bset #1,$81DF1E`; **`$28D9C4/C9 zero $813172/$813176`** (the cross-axis camera -- this is W49 §3.1's "everything stops side-to-side" write); install 8 art resources via `$24150A` (entries `$11/$12/$13/$14/$15/$16/$10` from ROM tables `$2254B8..$225878`); `rts` | bit0 set, one frame |
| **F1 PALETTE CUE** | `$28DA42` bit2==0 | set bit2; `$4(a6):=1`; `jsr $23C638` (palette); `rts` | bit2 set, one frame |
| **F2 SPRITE-INIT** | `$28DA60 tst $4(a6); subq; bne rts` then fall | ONCE when `$4(a6)` goes 1->0: copy the 18-byte position prototype from `$28E646` into `$6(a6)..$2A(a6)`; seed sprite pointers `$3A..$58(a6)` with art addresses (`$A0000`, `$4D001C00`, `$2D001C00`, `$E001C00`, `$1BCD0C`, `$1BE60C`); `rts` | one frame, then never again |
| **F3 SLIDE-IN** | `$28DACE tst $6(a6); bmi` | walk the position table at `$28E698` indexed by `$6(a6)`: each frame `D0=(a0,d1.w); sub D0,$8(a6); add D0,$c(a6); addq #2,$6(a6)` -- the result-screen panels slide in. P1/P2 live-player clamps at `$28DB24/$28DB38` (`$8103E6`/`$810448`). When the table ends, `$6(a6):=$FFFF` and **`$28DB52 bset #3,$8130F9`** -- **the tally trigger**; `bra $28DED8` (draw) | N frames; sets `$8130F9` bit 3 |
| **F4 BONUS-POOL INIT** | `$28DB5E bit1==0` | set bit1; if P1 live (`$8103E6`): read bee/item counts `$817F84/$817F86`, `jsr $242AC6` (BCD), store `$18/$1c(a6)`, and **`$1a(a6)=beeCount*10`, `$1e(a6)=itemCount*20`**; same for P2 from `$817F88/$817F8A`. `$2c(a6):=$18` (or `$4` if no players); `bsr $28DED8; bsr $28E1AC`; `rts` | bit1 set, one frame |
| **F5 HOLD + DRAW** | `$28DC18` steady | `bsr $28DED8` (draw); `bsr $28E1AC` (draw2); `$28DC20 tst $2c(a6); subq; rts` -- a hold countdown | `$2c(a6)` frames |
| **F6 BEE/ITEM TICK** | `$28DC2C bit3(local)==0`, after `$2c(a6)==0` | the per-frame score tick: subtract 5 from `$1a/$1e(a6)` (P1) and `$24/$28(a6)` (P2), crediting `$50` pts each via **`$286128`** and calling **`$28C6C6`** (bonus BCD) gated on `$81DF24/$81DF26` timers. When all four exhaust, **`$28DD94 bset #3,$2(a6)`** (local) so it never reruns, and `$2c(a6):=8` (or 1 if `$81B610==0`). Player button reads at `$28DC44/$28DCF0` (`$23D186/$23D18E`, mask `$70`) speed the drain. | N frames; sets local bit3 |
| **F7 MEDAL WALK** | `$28DDB0 tst $3e(a6); bmi` | walk three tables (`$28E6E8/$28E718/$28E748`) indexed by `$3e(a6)`, adding to `$4c/$4e/$50/$52(a6)` (the medal-counter digit animators). When `$3e(a6)` ends, `$3e(a6):=$FFFF` and **`$28DE16 bset #2,$8130F9`** -- **"result list finished"** | N frames; sets `$8130F9` bit 2 |
| **F8 EXIT HANDSHAKE** | `$28DE1E btst #1,$8130F9; bne advance; rts` | wait for `$8130F9` bit 1 (the HUD tally's done signal from `$285496`). When set: **`$28DE5C lea $28D862(PC),A0; $6(a5):=$B; $28DE66 jsr $24652A` (load anim chain); `$28DE6C move.l D0,$8(a5)` -- DEV-2's source; `$28DE70 jsr $28C186`**. The stage-5 variant (`$28DE44`) sets `$6(a5):=$15` and creates type `$13` (the ending; out of scope). | one frame; advances type 6 out of state 1/$B |

The chain in one line:

```
F0 art -> F1 palette -> F2 sprite-init -> F3 slide-in (sets $8130F9 bit 3)
  -> F4 bonus-pool init -> F5 hold -> F6 bee/item tick (credits via $286128/$28C6C6)
  -> F5 hold (8) -> F7 medal walk (sets $8130F9 bit 2)
  -> F8 waits $8130F9 bit 1 (from HUD $285496) -> $24652A -> advance type 6 -> state $B
```

**Two score machines, one handshake.** F6 is `$28D9AA`'s OWN bee/item bonus tick
(credits `$50` per drain step via `$286128`). The HUD tally `$285400` is the
SEPARATE medal/item tally that awards the main bonus via `$28614A/$286154` and
signals completion through `$8130F9` bit 1. F6 and the HUD tally run
concurrently (different RAM, different score wrappers) and coordinate only
through the `$8130F9` bits. SS3 has both.

---

## 3. THE TWO DEVIATIONS, CONFIRMED WITH THEIR EXACT CLEAR SITES

### DEV-1 -- `$285496` produces `$8130F9` bit 1. CONFIRMED.

`$285496 bset #1,$8130F9` lives inside the HUD tally body `$285400..$285568`.
The reach path (W49 §3.1's "one `bset`, two `btst`" census re-verified):
`$28DB52` (in `$28D9AA` F3) sets bit 3 -> the HUD per-frame `$2853D2 btst #3,beq`
sees it -> `$2853DC bset #4` (one-shot init: `$81B614:=7`, BCD-seed the bonus) ->
`$285400 btst #2` (needs bit 2 from `$28DE16` in F7) -> per frame decrement
`$81B614`, then drain `$81B610` (the medal/item count) in `$32/$64/$96` tiers,
BCD-adding via `$286626` and crediting via `$28C6C6`/`$28614A`/`$286154` -> when
`$81B610` underflows to `$FFFF`, the NEXT frame's `subq.w #1` makes `$FFFE`,
neither `beq`/`bpl`/`bcs` fire, and **`$285496 bset #1,$8130F9`** falls through
(zeroes `$81B610/$81B614/$81B616`, `rts`).

`$285496` is reached, and it is the only producer. W62's stand-in
(`stageend.js` sets bit 1 directly at the DEV-1 site) is a faithful substitute;
the moment the real `$285400` lands, `tests/w62stageend.test.js` "W62 DEV-1"
goes RED (that test asserts the port has exactly one producer and names
`$285496`), which is its designed purpose.

### DEV-2 -- `($8,A5)` comes from `$28DE6C` inside `$28D9AA`, fed by `$24652A`. CONFIRMED.

`$28D6FC jsr $24681A` (type 6, state $B) dereferences the longword handle at
`($8,A5)`. That handle is written exactly once, at `$28DE6C move.l D0,$8(a5)`,
where D0 is the return of `$28DE66 jsr $24652A` (F8 advance tail). W62 left
`($8,A5)` = 0, so `$24681A` would dereference `$2C` and the port skips it.

`$24652A` is the animation-object loader (92 instr): walks the player record
list at `$810346` (stride `$30`, the two/three player slots), and for each live
player allocates a chain of nodes from the `$80FA86` pool (stride `$70`, the
20-slot object pool the whole game shares), linking them at `($2C,node)`. Returns
D0 = the head handle (or 0). `$24681A` (13 instr) walks that chain summing
`$18(node)`; returns Z=1 when the sum is zero (chain finished). `$246800`
(10 instr) walks the chain clearing each node.

So DEV-2's faithful clear is: port `$24652A`/`$24681A`/`$246800`. When the
stage-clear fly-away animation finishes, `$24681A` returns Z=1, `bne $28D736` is
NOT taken, `$28D704 jsr $246800` frees the chain, and state $B proceeds to
`$28D72E $6(a5):=2` naturally. **No deviation, no invented transition.**

**Risk flag (SS6):** `$24652A` is the largest shared dependency in this port --
it writes the `$80FA86` object pool the entire game uses. If its node stride or
linkage diverges it corrupts that pool. It must be ported as the ROM writes it,
and the existing pool allocations (`stageCreate`/`objalloc.js`) must be checked
for compatibility. The good news: `$24652A` is self-contained (a linked-list
builder), and `$24681A`/`$246800` are pure read/walks.

---

## 4. THE STUCK OBJECT SLOT -- `$28EAD4 clr.w $81DFF6` is the ONE clearer. CONFIRMED, single site.

Every build-B reference to `$81DFF6` (search of the whole 6 MB image):

| site | instruction | role |
|---|---|---|
| `$28E7E0` | inside `$28E7DC` (`$81DFF6 := 1`) | sets the flag at type-6 state 2 entry -- **W62 PORTED** |
| `$28E7E8` | inside `$28E7E6` (tst, the state-4 gate) | **W62 PORTED** |
| `$28E810` | inside `$28E7F8` entry (tst) | the banner's own read |
| **`$28EAD4`** | **`clr.w $81DFF6`** | **THE ONE CLEARER** -- inside `$28E7F8`, the banner |

`$28EAD4` fires at the end of the banner's teardown arm `$28EA98`: when
`($81DFEC)` (the slide-out counter A4) reaches 0, `$28EA9C` runs two hyper-end
checks (`$2875B4`/`$287616`) then `$28EAD4 clr.w $81DFF6; clr.w (a6); rts`. The
next frame, `$28E7E6` sees DFF6 clear, returns C clear, and type 6 sets
`$2(a5):=2` (destroy self via `$28D5E6`). **Slot freed.**

The banner `$28E7F8` is the LAST unported piece between state 4 and the slot
being freed. It is called every frame by type 6 (`$28D7F6 jsr $28E7F8`), so the
moment it is ported, `$28EAD4` becomes reachable and the slot drains on its own.

**Open question the implementer must close (SS6):** the banner-active flag
`$81DFF8` is set by `$28E7B6` (a 3-instruction routine), which has NO
absolute-long caller in the whole image -- it is reached via PC-relative `bsr`
from somewhere in the `$28Exxx` cluster (resolvable with `xref.py dasm 28e7b6`
or a PC-relative scan). On the current port path the banner's slide-in never
starts, so `$81DFEC` stays 0, and `$28EA98`'s `tst (a4); beq` would fall straight
to the teardown -- meaning `$28EAD4` fires and frees the slot EVEN WITHOUT the
slide-in. That frees the slot but is not faithful to the banner's visual arc. The
implementer should trace `$28E7B6`'s caller, port it, and let the slide-in run
before the teardown; if the caller is itself in the presentation tier, freeing
the slot faithfully may have to wait for the banner-draw wave. Either way the
slot is freeable; the question is whether it is freeable FAITHFULLY in R2a.

---

## 5. THE SCORE CALLEES ARE ALREADY PORTED -- verified

| ROM | port site | status |
|---|---|---|
| `$286626` (the one BCD adder) | `src/score.js` `bcdAdd` / `adder: 0x286626` | PORTED |
| `$28614A` (P1 wrapper) | `src/score.js` `wrapP1: 0x28614a` | PORTED |
| `$286154` (P2 wrapper) | `src/score.js` `wrapP2: 0x286154` | PORTED |
| `$286128` (by-D1 mask wrapper, bit4=P1/bit3=P2) | `src/score.js` `wrapMask: 0x286128` | PORTED |
| `$242AC6` (binary word -> packed BCD longword, double-dabble) | `src/items.js` `bcd242AC6` | PORTED |
| `$241812` (speed,heading -> vector) | `src/machine.js` `moveVector`; `tables.vector(speed,heading)` | PORTED (reusable by the banner motion) |
| `$23DECE` / `$23DF2A` (sprite painters) | `src/handlers.js` register-convention stub; `src/background.js` bucket-2 stage | PORTED as register-convention/bucket stages |

`$28C6C6` (bonus conversion, 7 instr) is NOT ported. It is a thin wrapper:
`movem.l d0-d7/a0-a6,-(a7); D0=$19; D1=$80; D2=$0; jsr $28C02A(pc); movem; rts`.
`$28C02A` is the BGM/streaming cue routine (reached PC-relative, per the sound
brief recon). For the tally to award correctly, `$28C6C6`'s ARITHMETIC effect
must be ported even if the sound cue is a note -- but `$28C6C6` itself does no
arithmetic visible here (it posts a cue with D0=$19/D1=$80/D2=$0); the actual
BCD conversion of the bonus was already done by `$242AC6` at the caller. So
`$28C6C6` is a SOUND CUE wrapped around the bonus event, and the score arithmetic
the tally needs is in `$242AC6` + `$286626` (both ported). `$28C6C6` can ship as
a named note in R2a and join the sound subsystem later.

**The tally ports onto shipped infrastructure.** The one new score-side primitive
is the medal-tier decrement arithmetic in `$285400` (`$285454..$28548A`'s
`$32/$64/$96` thresholds and the `$286626` BCD loop at `$2854E0..$28551A`), which
is pure RAM arithmetic on top of the ported adder.

---

## 6. THE SMALLEST PORT -- two waves, logic then presentation

The three goals (banner draws, score tally runs, slot freed) couple like this:
the tally and the slot-free are LOGIC; the banner-draw is PRESENTATION; but the
slot-free specifically needs the banner STATE MACHINE (`$28E7F8`) to reach
`$28EAD4`, whose faithful path needs the banner's slide-out motion. So logic and
banner-state couple, but the banner's PAINT calls do not need to be real for the
slot to free (the motion arithmetic is RAM-only). The clean cut:

### Wave R2a -- LOGIC (clears DEV-1 + DEV-2; awards the stage-clear score; frees the slot)

| routine | instr | role |
|---|---:|---|
| `$28D9AA` F0-F8 phase machine | ~295 | the result-screen driver; the W62 `note(ctx,0x28d9aa,...)` calls in states $A/1/$B/$15 become real `bsr` equivalents operating on the `$81DEBE` buffer |
| `$285400` + `$2853D2`/`$2853DC` + `$28556C` | ~110 | the HUD tally; the existing `tally2853D2` guard in `hud.js` already routes here -- the `unreached(...)` becomes the real body. **Clears DEV-1.** |
| `$28C6C6` | 7 | bonus cue (sound note; no arithmetic) |
| `$24652A` + `$24681A` + `$246800` | ~115 | the animation chain (loader/checker/free). **Clears DEV-2.** |
| `$28E7F8` banner STATE MACHINE | ~210 | entry + slide-in + slide-out + `$28EAD4`; paint calls (`$23F7F4`/`$23F782`/`$23F82A`/`$23DECE`/`$24150A`) are NOTES, motion (`$241812`) is REAL so `(A4)` drains. **Frees the slot.** Also resolve `$28E7B6`'s caller (SS4) so the slide-in actually starts. |
| `$28E7A2` (banner buffer clear), `$28E7CA` (DFFEC gate) | ~15 | small helpers |

**~750 instructions.** Testable from the shipped seed via an extension of
`tools/w62stageendgate.mjs`: assert `$8130F9` bit 1 comes from the real `$285496`
(the W62 DEV-1 test goes RED by design, replaced by a real-producer test); bit 2
set; the P1/P2 score accumulators (`$81B5AA`/acc) increased by the bonus; the
anim handle `($8,A5)` non-zero after F8 then zero after `$246800`; `$81DFF6`
cleared; type 6 leaves state 4 and self-destroys (object slot count back to
8-from-9). R2a makes the stage end CORRECTLY (no deviations) but the screen is
still visually blank (no banner art, no result sprites).

### Wave R2b -- PRESENTATION (makes the banner and result screen VISIBLE)

| routine | instr | role |
|---|---:|---|
| `$28DED8` draw1 | 155 | the result-screen sprite positions (panels + counters); promote from note to real |
| `$28E1AC` draw2 | 322 | the bee/item/medal counter sprites + P1/P2 labels; promote from note to real |
| `$28EDC0` banner draw | 24 | indexes `$28EE1E` by `$28ECB2`'s per-stage art byte; the banner picture |
| `$23F7F4` / `$23F782` / `$23F82A` banner painters | TBD | promote from notes to real (or confirm the register-convention stub covers them) |
| 8 art windows `$2254B8..$225878` | data | the result-screen and banner sprite tables; export via `export-tables.py` |
| `$2855B6..$285994` result score-number draw | ~160 (TBD) | the big score-number renderer (stands separate from the tally arithmetic) |

**~660 instructions + data export.** R2b depends on R2a (the phase machine must
run for the draws to be called). After R2b the result screen is visible: the
STAGE CLEAR banner slides in and out, the bee/item bonus ticks up, the medal
count animates, the score number renders, and the ship flies away.

### Why two waves and not one

R2a is a LOGIC wave: every assertion is a RAM/score/slot value, drivable from the
seed in a headless gate, with zero drawing. It is the wave that makes
"stage 1 FEATURE COMPLETE" honest (no declared deviations) and ships the
stage-clear score. R2b is a PRESENTATION wave: its evidence is a screenshot, not a
gate assertion, and it depends on art export and the painter subsystem being
confirmed for the banner's register convention. Splitting them keeps the
correctness landfall testable on its own and lets the owner see the score
working before the art lands.

---

## 7. BIGGEST RISK

**The `$28E7F8` banner activation path (`$28E7B6`'s caller) is the one thing
this recon could not close from absolute-long xref alone.** Everything else in
the phase map is fixed RAM buffers and a closed bit handshake; the banner's
slide-in only starts if `$81DFF8` is set, and `$28E7B6` (its setter) has no
absolute-long caller -- it is reached PC-relative from the `$28Exxx` cluster.
If its caller is inside the presentation tier (e.g. the banner art loader
`$28ECB2`/`$28ECCE`), then freeing the slot FAITHFULLY (with a real slide-in
before the teardown) may have to wait for R2b, and R2a would free the slot via
the teardown-only path (still correct, still single-clearer, but not the board's
visual arc). The implementer should resolve this with `xref.py dasm 28e7b6` at
the start of R2a -- it decides whether R2a can honestly claim "slot freed
faithfully" or only "slot freed."

Secondary risks: (a) `$24652A` touches the shared `$80FA86` object pool -- port
it exactly as the ROM writes it and red-validate against the existing
`stageCreate` allocations; (b) the F6 bee/item tick and the HUD tally run
concurrently and both call `$286128`/`$28C6C6` -- confirm the port's score
wrappers are re-entrant across the two callers within one frame (they should be:
the wrappers credit by player-mask, but the `$81DF24`/`$81DF26` timer gating in
F6 and the `$81B614` countdown in the tally are independent state).

---

## 8. WHAT I COULD NOT DETERMINE

* **`$28E7B6`'s caller.** See SS7. Resolvable by PC-relative scan at impl time.
* **The exact frame counts of F3 (slide-in) and F7 (medal walk).** They depend
  on the position tables at `$28E698`/`$28E6E8`/`$28E718`/`$28E748`, which I
  read the structure of but did not simulate. The implementer can derive them
  from the tables or seed-drive them.
* **Whether the F6 bee/item tick and the HUD tally can both complete on a
  zero-bonus clear.** W49 §9 opened this for `$285400`; I confirm the same gate
  (`$28556C` returns immediately when `$81B610` is already 0, branching to
  `$2854C8`'s `$FFFF` arm) but did not trace which arm a real zero-item clear
  takes to completion. The implementer should seed-drive a no-bonus stage clear.
* **Nothing was compared against MAME.** Every number is ROM-listing. The corpus
  still has no board trace past the boss's arrival, so the first impl wave should
  seed-drive the timeout path and assert the score/slot values across the
  transition, port-side only.

---

## 9. ONE PARAGRAPH

`$28D9AA` is a clean eight-phase state machine on the fixed `$81DEBE` result
buffer (A6, reloaded every call), driven by four bits of `$81DEC0` and
coordinating with the HUD tally through the closed `$8130F9` bit 1/2/3
handshake. It is NOT a separate object and it has no register-computed pointers;
W119's biggest risk ("phase structure only counted") resolves to a trivial FSM
plus a two-tier score tick. Both deviations confirm exactly as W49 §3.1 census'd
them: DEV-1 clears the moment the HUD tally `$285400..$285568` lands (its
`$285496` is the sole producer of bit 1), DEV-2 clears the moment the animation
chain `$24652A`/`$24681A`/`$246800` lands. The stuck object slot has exactly one
clearer, `$28EAD4 clr.w $81DFF6` inside the banner `$28E7F8`, which fires
automatically once the banner state machine runs. The score callees are already
ported; the tally ports onto shipped infrastructure. The smallest honest port is
two waves: R2a (~750 instr, logic: tally + anim chain + banner state machine)
clears both deviations, awards the score, and frees the slot; R2b (~660 instr +
art export, presentation: the draw routines and painters) makes the banner and
result screen visible. The one open question is `$28E7B6`'s caller -- it decides
whether R2a frees the slot faithfully or only correctly.
