# W63 IMPL — B1: the SKELETON `$28444E`

status: **DONE** -- **THE CHAIN EXPIRES AND THE SCORE DRAINS.** Gate ALL GREEN
57/0/0 (was 53), 844 unit tests (was 808), webgate 14/14, build-dist clean with
PUBLISH_VERBATIM unmoved at 5. 50 of 50 mutants RED, 0 survivors; 7 of 7 exporter
assertions RED against the cartridge. **NO RANK WRITE BECAME REACHABLE.**
**RECON 38 7.1's OPEN QUESTION IS CLOSED** -- the rank object always runs before
the player, so the bomb's debit lands on frame N+1 like the hyper's gain. Boot
+464 B. Verified on the LIVE build `20260805111446` as well as locally.

wave: 63. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-05.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx..$2Axxxx`) unless a line says otherwise.
brief: `docs/worklog/ddpdoj/38-recon-bomb-hyper.md` wave 1 of 3 —
**the skeleton `$28444E` and nothing else**. Not the bomb, not the hyper.

`[M]` = measured by me this session, over
`games/ddpdoj/tools/oracle/out/maincpu.bin` (the decrypted build-B image,
address == file offset) with capstone `CS_ARCH_M68K` / `CS_MODE_M68K_000` and a
recursive-descent tracer, and over the PORT driven from the shipped bundle seed.

## GOAL

Port object type 0 `$28D520` / `$28444E`: the pending→total drain `$2842B0`,
the `$81B5B4 → $81B610` drain, the chain-BREAK popup countdowns and
**`$284636 subq.w #1,$81B5C0` — THE CHAIN METER DECREMENT** — with the hyper in
the slot the ROM puts it in.

---

## 0. THE BRIEF'S PREMISE, CHECKED — recon 38 reproduces, with SIX corrections

Every address in recon 38 §2.1's ordering sketch is at the address it says, and
its §3.2 census of `$81B646` reproduces. **Six things it did not say change what
wave 1 is**, and all six were found by reading rather than by running.

| the recon says | `[M]` this session |
|---|---|
| §2.1 `$28D520`'s "body is four instructions and two calls" | The four instructions are **A THREE-STATE MACHINE on `($2,A5)` and it names none of them**: `$28D520 tst.b ($2,A5) / beq.b $28D502` is state 0 (INIT: `($2,A5) := 1`, `$81B6F0 := 1`, `rts`), `$28D526 cmpi.b #$2 / beq.b $28D512` is state 2 (`clr.w $81B6F0` then `jmp $241292` — **IT DESTROYS ITSELF**), and only state 1 reaches the two calls. Both `beq`s are BACKWARD, to code before the entry. |
| §2.1 `$284456 tst.w $81B6EE / bne $284CF2` "**<- skips BOTH**" | **`$81B6EE` IS 1 IN THE SHIPPED SEED, so that arm is the DEFAULT, not the exception.** `$284CF2..$284F70` is **THE HUD SLIDE-IN**: `$81B620` is `$30` in the seed, `$284D38` spends one per frame, `$284F6A clr.w $81B6EE` on the 49th — [M] the port's first 49 frames of `$28444E` never reach the skeleton at all. Its whole effect on RAM is **two instructions**; the other ~180 are drawing. |
| §6 wave 1 = "`$28D520`/`$28444E`'s SKELETON", sized inside a 876-instruction three-wave budget | **`$28444E`'s reachable closure is 772 instructions over `$28444E..$2859DB`** [M, recursive descent]. The recon never sized this routine. It is ~88 % of its whole three-wave instruction budget in wave 1 — but **almost all of it is DRAWING**, and §2 below is the census that says so and the rule that used it. |
| §3.3/§7.1 item 1, **"THE ONE THAT MATTERS"**: where the PLAYER object's slot sits relative to the RANK object's. Tried "the table's second longwords (`$090000`/`$1A0000`/…, which is not an order — it does not sort)" | **IT IS THE DISPATCH PRIORITY AND IT SORTS DESCENDING.** §1 — settled, and the recon held the answer in its hand. |
| §4.5 `src/score.js`'s `$286876` is "**note only**" | **STALE. W51 PORTED IT** and measured it executing twice. §6. |
| §2.1's list of `$28444E`'s calls | It omits `$2844C8 bsr $285C5E` and `$284666 bsr $285DD8` (the two 104-instruction HUD panels), the whole `$2847FE..$284CEE` BANNER machine, `$284AB6`'s extend counter, and `$284B5E btst #$3,$8130F8 / bne $2853D2` — **the STAGE-CLEAR TALLY, which W62 made reachable four days ago.** §5. |

**AND A SEVENTH, WHICH IS NOT THE RECON'S BUT BLOCKS THIS WAVE:**
`src/initbody.js`'s `$2926E2` body — THE BOSS's init, ported before W62 — **stops
before the routine does.** `$29278E jsr $24150A` falls through into
`$292794 bset #$0,$8130F8 / $29279C bset #$2,$8130F8 / $2927A4 bset #$0,$8130F9
/ $2927AC move.l #$1A0,$81B626 / $2927BA move.l A0,$81B62A`, on to `$2927F4 rts`.
`docs/knowledge/02`'s fall-through trap, eighteenth incident. §5.3 — **DECLARED,
NOT FIXED**, and it is why one of `$28444E`'s two banner gates is dead.

---

## 1. THE FRAME ORDER — recon 38's OPEN QUESTION, CLOSED

Recon 38 §7.1: *"the object driver walks the 20 slots at `$80E240` in address
order … so the order is the ALLOCATION order, a runtime fact, not the type-table
index. **What I tried:** the `$240F62` table (order is not it), the table's
second longwords (`$090000`/`$1A0000`/…, which is not an order — it does not
sort) … **Until it is settled a port must not choose.**"*

**THE SECOND LONGWORD IS THE DISPATCH PRIORITY, AND IT DOES SORT — DESCENDING.**
`$24111E`'s create queue inserts in descending `(+$4A)` priority and MEMMOVES THE
TAIL DOWN; `$241238`'s delete memmoves UP (`src/objalloc.js`, ported W5). So the
table is *kept* in descending priority order and the driver's address-order walk
**is** priority order. Out of the cartridge:

```
[M]  $240F62[ 0] $28D520  pri $0009   <- THE LEDGER (this wave)
     $240F62[ 1] $26127A  pri $001A       the background
     $240F62[ 2] $2491C0  pri $001C       P1
     $240F62[ 3] $249246  pri $001B       P2
     $240F62[10] $260794  pri $001F       THE RANK OBJECT -- highest of all 20
[M]  the shipped seed's own live table: 31, 28, 26, 24, 10, 9, 9, 9
```

⇒ **`$260794` (rank) > `$2491C0` (the player) > `$28D520` (this), on every frame.**

* **THE BOMB'S DEBIT LANDS AFTER THE FRAME'S RANK RECOMPUTE.** `$249976 subq.w
  #$3,$81B646` and `$249970 jsr $285AF2` are in the PLAYER object, which runs
  *after* `$2608D2`. So a bomb pressed on frame N is not in `$81309E` until
  frame N+1 — **the same answer as the hyper's**, which recon 38 §3.3 explicitly
  said "does NOT transfer to the bomb".
* **THE CHAIN TIMER DECREMENTS LAST**, because this object has the lowest
  priority of the three. That is W19 §1.5's *measured* order
  (`rankclk > rank= > […hits…] > drain > drain0 > (brkT) > meter-`) reproduced
  **by construction** rather than by arrangement.

**[M] MEASURED, NOT ONLY DERIVED: 6,200/6,200 frames `rank < player < ledger`,
0 bad**, asserted every frame by `tools/w63hudgate.mjs`. The static reason and
the dynamic check are both there because either alone has been wrong here before.

---

## 2. WHAT WAS PORTED, AND THE RULE THAT DECIDED IT

`$28444E`'s closure is 772 instructions and most of it draws. **Every callee was
classified by MEASUREMENT** — a census of its absolute writes to
`$800000..$81FFFF` *and* of its address-register-indirect writes — never by its
name or its address range:

```
[M] ZERO RAM WRITES (stack only)  ->  a counted NOTE, by address:
      $285C5E (104 instr)  $285C62 (102)  $285DD8 (104)  $285DDC (102)
      $2855B6 (82)  $285FB6 (44)  $286040 (28)  $2857B4 (58)  $285994
      $285FA6 (3)   $2859DC (11)  $284F72 (115) $284FA2 (115)
      $286ED6 (23)  $286F3E  $2878CC (37) $28795C $287ABE $287AF0 $287A7A $287A92
      $23FA96 / $23FAC4  -- BUCKET 25 ($80A6E4/$80AFE6), NOT in PRODUCED_BUCKETS
      $240DC2 / $240EBC  -- the TX printer   $23DFEA $24157A $240E1A $24150A
      $28C678 / $28CA7A  -- SOUND (W53's $28Cxxx family)
[M] RAM WRITES  ->  PORTED
```

| ROM | insn | what | where |
|---|---:|---|---|
| `$28D520` + `$28D502` + `$28D512` | 12 | object type 0, **three states**, `$81B6F0`, the self-destroy | `hud.js makeHudObject` |
| `$2842B0` `$2842FE` | 71 | **THE PENDING → TOTAL DRAIN**, both players, four `abcd`, the `$99999999` pin, the EXTEND | `drain2842B0` |
| `$2843A8` `$2843BE` | 46 | the nine-record SCORE DIGIT machine and the high-score compare | `digits2843A8` |
| `$286FDA` | 24 | the extend-interval advance, and a cartridge instruction that writes ROM (§4) | `extendStep286FDA` |
| `$285F8A` `$285F52` | 17 | the two per-frame HUD cursors, over `$287ECA` (64) and `$287E8E` (15) | `cursorA/B` |
| `$28444E..$2844A0` | ~25 | the prologue, the `$81B6EE` gate, the two hyper `bsr`s, the `$81B5B4 → $81B610` drain (**four per frame, unrolled**) | `perFrame28444E` |
| `$2844A6..$28465A` | ~60 | the three gates and **P1's block: the hyper label latch, the CONTINUE prompt, the chain-BREAK popup countdown and `$284636` THE DECREMENT** | `gates2844A6` / `playerBlock` |
| `$28465C..$2847FA` | ~60 | **P2's mirror, and `$2847D4`, ITS OWN DECREMENT** — recon 38 never mentions a second chain meter | `playerBlock` |
| `$2847FE..$284A B4` | ~90 | the BOSS-WARNING banner's eight state bits and its HP bar | `bannerBoss28480A` |
| `$284B6C..$284CEE` | ~60 | **the STAGE-CLEAR banner — the arm W62 opened** | `bannerClear284B6C` |
| `$284AB6..$284B6A` | ~35 | the ITEM/EXTEND counter tail | `extendCounter284AB6` |
| `$284CF2..$284F70` | ~4 of ~90 | **THE HUD SLIDE-IN** — 48 frames, and its whole RAM effect is `$284D38` and `$284F6A` | `slideIn284CF2` |
| `$284FD2` `$2851D2` | 8 of 276 | the two banner panels' sub-counters, MIRRORED AND SWAPPED (§2.1) | `panel284FD2/2851D2` |
| `$2877B8` | 5 | three writes | `grant2877B8` |
| `$2853D2` | 2 | the tally's own guard, and a throw past it | `tally2853D2` |
| `$285A12`/`$285B3C` | 4 | **THE HYPER's two guards**, and three throws past them (§3) | `hyper285A12` |

**Two new ROM windows, 332 bytes** (`$287E8E` `$013C`, `$28840E` `$0010`), each
pinned by an INSTRUCTION and asserted on every export by `check_hud_extents`.
`games/gradius/` NOT TOUCHED.

```
[M] src/hud.js   ~880 lines   198 distinct ROM addresses cited
```

### 2.1 The two things a "tidy" port gets wrong here

* **`$284FD2` and `$2851D2` ARE NOT ONE ROUTINE WITH A PARAMETER.** `$284FD2`
  gates on `btst #$3,$81B61E` + `$81B620 <= $C`, decrements `$81B622`, and
  decrements `$81B624` in its tail; `$2851D2` gates on `$81B61F` + `<= $10`,
  decrements `$81B624`, and decrements `$81B622` in its tail. **The two
  sub-counters are swapped, not shared.** Mutant M43.
* **`$81B61E`/`$81B61F` ARE NOT "P1's" AND "P2's".** `$2847FE btst #$3,$8130F8`
  picks between them and that bit is `$242958`'s — **THE STAGE ADVANCE**. So
  `$81B61E` is the BOSS-WARNING banner's flags and `$81B61F` the STAGE-CLEAR
  banner's, and **both player blocks read `$81B61F` at `$2844D6`/`$284674`**.
  Named p1/p2 that would look like a transcription error.
* **`$284C82`/`$284C88`/`$284C8E` clear `$81B5C2`, `$81B5EC` and `$81B5C8` — and
  NOT `$81B5F2`.** The asymmetry is the cartridge's; a loop over both players
  invents a write. Mutant M45.

---

## 3. THE HYPER: ITS TWO GUARDS ARE PORTED, EVERYTHING PAST THEM THROWS

A bare throw at `$284460` stops the game on logic frame 49 and takes the owner's
"load the page, fly, shoot" with it. A quiet skip is forbidden. **The cartridge
supplies the third answer and it is two instructions:**

```
$285A12 tst.w $81B63E / bne.w $285A96    ALREADY HYPERING -> the per-frame tail
$285A1C tst.w $81B658 / beq.b $285A0A    no REQUEST -> jmp $2873AC (the flash)
```

[M] both words are **0** in the shipped seed, and `$81B658`'s only producer is
`$24989A move.w #$1,(A2)` inside `$249814` — the button, which `src/player.js`
has thrown for since wave 4. So the guards send every frame to `$285A0A`, and the
port transcribes the guards and **THROWS BY ADDRESS on both arms past them**
(`$285A96`/`$285BC0` the tail, `$285A24`/`$285B4E` the activation). That is a
transcription of two real instructions, not a stub of a routine.

`$2873AC`/`$28748A`, the hyper-END flash, gets the same treatment: its own first
instruction is `tst.w $81B6FA / beq.b $287400` (**another bare `rts`**), and
[M] `$81B6FA`'s ONE non-local writer in `$230000..$2B0000` is `$285AFC move.w
#$48`, inside `$285AF2` — behind the throw. So it is a **proven** two-instruction
no-op here, and its body is a throw carrying `$2873B4`.

**Six throws, six distinct addresses**, all pinned by `e.romAddress` in
`tests/w63hud.test.js`, none of them ever fired in 21,000 frames of play.

---

## 4. READ PAST THE APPARENT END — five places, and a cartridge bug

* **`$2842AE` is a BARE `rts` TWO BYTES BEFORE `$2842B0`**, and the drain
  branches BACKWARD to it (`$284300 beq.b $2842AE`) as its "nothing pending"
  exit. A reader who starts at the `lea` never sees it.
* **`$2842FE` IS BOTH A SUBROUTINE AND A FALL-THROUGH.** `$2842D6 bsr.b $2842FE`
  runs it for P1; `$2842FC moveq #$1,D7` then FALLS INTO it for P2, so the second
  pass's `rts` returns to `$2842B0`'s caller. Calling it twice drains twice.
* **`$2843A8`'s LOOP IS ENTERED AT ITS TAIL** — `$284402 bra.b $284440` — so the
  first thing that happens is `lea $A(A0),A0` and record 0, the OVERFLOW digit
  written above the loop, is never touched by the body. Starting at `$284404`
  writes digit 1 over it. Mutant M15.
* **`$2853D0` and `$287400` are BARE `rts`s** immediately before/inside the
  routines that branch to them (§5.1, §3).
* **`$2926E2` does not end where `src/initbody.js` ends it** (§5.3).

**AND A CARTRIDGE INSTRUCTION THAT WRITES ROM, TRANSCRIBED AND NOT EMULATED.**
`$287020 move.l (A7)+,(A5)` (`2A9F`) ends `$286FDA`. A5 was pushed at `$286FDA`
and **reloaded to `$28840E`** at `$286FDE`, so this pops the stack **into the
cartridge**. It is one bit from `movea.l (A7)+,A5` (`2A5F`). The stack stays
balanced so the `rts` is fine, but A5 is not restored — harmless only because
`$2842B0` uses no A5 and the object driver saves it across the dispatch
(`$2410D6`/`$2410E6`). The port does the pop and **not** the write, and counts
the address: a write into `RomWindows` would throw and one into `Ram` would be a
fabrication.

---

## 5. WHAT THIS WAVE MADE REACHABLE, AND WHAT IT PROVED UNREACHABLE

### 5.1 THE STAGE-CLEAR TALLY — reachable, and stopped by its own guard

`$284B5E btst #$3,$8130F8 / bne $2853D2` fires from lf19144 (W62's
`$242958 bset #$3,$8130F8`). `$2853D2..$285568` is the bonus walk whose
`$28C6C6` conversion and `$28614A`/`$286154` **SCORE ADDS** W62 §6 named as never
running. Porting `$28444E` reaches it.

**AND IT CANNOT RUN, BY CONSTRUCTION.** `$2853D2`'s own first instruction is
`btst #$3,$8130F9 / beq.b $2853D0`, and `$2853D0` is a bare `rts` two bytes
before the entry. [M] the ONE producer of `$8130F9` bit 3 in `$230000..$2B0000`
is **`$28DB52`, inside `$28D9AA` — THE RESULT SCREEN**, 819 instructions W62 §2
declared unported. The port reaches the guard, takes the same `beq`, and returns;
past it is a throw carrying `$2853DC`, which fires the day the result screen
lands and not before. **So the stage-clear score is still the score at the boss,
and it is now one bit away rather than one routine away.**

### 5.2 THE STAGE-CLEAR BANNER — reachable, walked, and it REJOINS

`$2844B2 btst #$3,$81DF1E / bne $2847FE`: `$81DF1E` bit 3's producer is
**`$28D58E bset #$3,$81DF1E`, inside object type 6's init, which W62 PORTED**
and which fires at lf19144. So `$2847FE`'s arm is live for the ~71 frames until
`$28D71A bclr #$3`. That is "VERIFIED HAS A SHELF LIFE" arriving on schedule: the
wave before me opened the door this wave had to walk through.

**THE TRAP IN IT, and it is the biggest one here:** `$284B6C tst.b $81B61F /
bmi.w $2844BE` — a FINISHED banner **rejoins the skeleton at the P1 block IN THE
SAME FRAME**. A port that returned instead would stop **both chain meters for the
rest of the stage** and nothing would say so. Mutant M41; unit test
"the finished CLEAR banner REJOINS the skeleton, same frame".

### 5.3 THE BOSS-WARNING BANNER — DEAD, and the reason is a DEFECT I FOUND AND DID NOT FIX

`$2844A6 btst #$0,$8130F9` and `$284AB6 btst #$2,$8130F8` are the other two
gates, and their producers are `$2927A4` and `$29279C` — inside **`$2926E2`'s
UNPORTED TAIL** (§0). `src/initbody.js`'s body stops after `$29272E jsr $259554`
and five notes. Consequently, in this port:

* `$2847FE`'s BOSS arm can never be taken;
* `$2844CC`/`$28466A`'s "a boss is up, show his bar instead of the chain popup"
  fork always takes its other arm;
* `$284AB6`'s ITEM/EXTEND counter is dead;
* `$81B626`/`$81B62A` — the boss HP bar's scale and record pointer — stay **0**,
  so `$284A3E movea.l $81B62A,A0 / move.l (A0),D7` would read **address 0**.

**NOT FIXED, DECLARED.** The tail also runs `$294AD6`/`$294EEA`/`$294F0A`, three
unported boss routines, and this wave's brief is the skeleton. `bossBar284A3E`
**REFUSES THE NULL POINTER BY ADDRESS** rather than reading main RAM at 0 —
which would not crash, it would draw a bar out of the top of the RAM image, which
is exactly the plausible-wrong-answer this project's method exists to prevent.
`src/hud.js`'s `BOSS_TAIL` carries the address for the wave that ports the boss.

### 5.4 THE SECOND CHAIN MACHINE — **already reachable, already ported, two waves ago**

The brief: *"Bomb hits run `$286876`, a SECOND COMPLETE CHAIN MACHINE … If your
skeleton makes any of that reachable, fix score.js IN THIS WAVE or state
precisely why it is still unreachable."*

**IT WAS ALREADY REACHABLE AND IS ALREADY PORTED. Recon 38 §4.5 and §5 are
STALE, not wrong when written.** `src/score.js`'s own header records it: W51
found that `$2454E0`/`$2455F2 ori.w #$400,D4` inside `$2453AC` — **THE BEAM's**
damage pass — set the same bit, wired `src/damage.js` to run those loops, and
**measured `$286876` executing 2 times** in 601 frames with the beam killing 57
enemies. So the flat meter 10, the N-hits-per-link `$81B5DE`, the
double-increment arm and `$2869D8`'s per-hit floor are all live code today and
have been since W51.

**WHAT W63 CHANGES ABOUT IT, MEASURED:** `$2869D8` forces the meter up to 10 (25
while hypering) on every hit — and the meter it forces up now **falls again**.
§6 measures the consequence and §6.1 bisects it to the decrement. **No fix to
`score.js`'s chain code was needed**; three of its comments were stale and are
corrected in place.

---

## 6. THE MEASUREMENT — a TREE CONTROL, three inputs, HEAD vs W63

`.scratch/w63tree.mjs`, W60/W61's method: **each tree in its OWN node process**
(a `?t=` cache-buster reloads the top module and not its imports, which is how
W61's first control agreed perfectly with the thing it was controlling for).
HEAD's `src/` is `git show HEAD:` plus this wave's two edited files reverted.
6,200 steps from the shipped bundle seed.

| 6,200 frames | tree | kills | score | chain | meter | hi-water | `$81309E` | `$81B646` | `$81B65C` | `$81B64A` | rng17 | total P1 | pending P1 |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| none | HEAD | 0 | 0 | 0 | 0 | 0 | 53 | 0 | 0 | 0 | 163 | 0 | **917** |
| none | **W63** | 0 | 0 | 0 | 0 | 0 | **53** | **0** | **0** | **0** | 163 | **917** | **0** |
| tap | HEAD | 305 | 5,859 | 773 | 56 | 773 | 53 | 0 | 0 | 0 | 17 | 0 | 5,577,048 |
| tap | **W63** | 305 | 5,859 | **0** | **0** | **133** | **53** | **0** | **0** | **0** | 17 | **414,340** | **0** |
| hold | HEAD | 244 | 5,156 | 585 | 56 | 585 | 53 | 0 | 0 | **2,112** | 234 | 0 | 3,741,241 |
| hold | **W63** | 244 | 5,156 | 2 | **0** | **81** | **53** | **0** | **0** | **1,512** | 234 | **283,650** | **0** |

**THE ANSWERS:**

1. **[M] NO RANK WRITE BECAME REACHABLE.** `$81309E` 53, `$81B646` 0, `$81B65C`
   and `$81B65E` 0 — **digit-identical between HEAD and W63 across all three
   inputs**, to I2's standard. And `$81309E` still cannot move in this port at
   all: `$2608D2` and `$260794` (object type 10) remain ABSENT from `src/`.
   W60, W61 and W62 each said this and it is still true.
2. **[M] THE RNG DID NOT MOVE.** `$803916` 0 and `$803917` 163/17/234 identical
   on both trees. Nothing in `$28444E` draws, and that is now measured rather
   than assumed.
3. **[M] KILLS AND SCORE-BY-VALUE ARE IDENTICAL** (305/5,859 and 244/5,156).
   The kill path is untouched.
4. **[M] THE CHAIN NOW EXPIRES.** HEAD's meter is pinned at the cap 56 for the
   whole run and its chain ends at 773; W63's meter reaches ZERO **38 times**
   and the chain ends at 0, with the high-water falling **773 → 133**.
   `src/score.js`'s twenty-nine-wave-old sentence — *"with no decrement a chain
   the port starts never expires"* — is **retired**.
5. **[M] THE PENDING SCORE NOW DRAINS.** HEAD leaves BCD `$00551518` sitting in
   `$81B4C0` for ever; W63 empties it every frame into `$81B440` and the nine
   digit records spell it.

### 6.1 THE ONE WORD THAT MOVED, BISECTED

`$81B64A` — the hyper EARN accumulator, W61's own 2,112 — went to **1,512**.
`.scratch/w63bisect.mjs`, W61 §5's method: one cut per run, `sha256` verified
byte-identical after each.

```
[M] W63 as shipped                          $81B64A = 1512   rng17 234  total 0x45402
[M] CUT the DECREMENT only ($284636)        $81B64A = 2112   rng17 234  total 0x391639
[M] CUT the DRAIN only ($2842B0)            $81B64A = 1512   rng17 234  total 0x0
[M] CUT the two CURSORS only                $81B64A = 1512   rng17 234  total 0x45402
[M] CUT the $81B5B4 item drain only         $81B64A = 1512   rng17 234  total 0x45402
[M] CUT the whole object (type 0 undispatched) $81B64A = 2112 rng17 234 total 0x0
    ...and kills 244 / score 5,156 on EVERY row.
```

**THE MOVER IS THE DECREMENT AND NOTHING ELSE**, and cutting it alone restores
W61's 2,112 exactly. **−600 is exactly 25 × `$18`** — i.e. **25 fewer executions
of `$28679E add.w D2,$81B64A`** in `score.js`'s `bombRankFeed`: a chain that now
BREAKS re-seeds `$81B636` from `$286876`'s power word more often, so the divider
borrows less.

**`$81B64A` IS NOT A RANK WORD** and the chain from it to rank is five links long
(W61 §5's own diagram). **Both figures are below `$287682`'s `#$95F` = 2,399**,
so no hyper stock is granted either way. But W61 named a **−24** offset for wave
I3 to re-read; **this is −600 in the same window**, and it is named here for the
same reason: *wave I3 must not ship `$287682` without re-reading both rows.*

**AND W62 §4's OWN ROW MOVES WITH IT:** its "`$81B64A` is 2,112 on both, unmoved
from W61's figure" is now **1,512** on both. The W62 gate does not assert it, so
nothing reddened — but a reader must not take W62's number as current.

---

## 7. COVERAGE — branches and table entries, never frames

* **`$28444E`'s 772-instruction closure: [M] 772 transcribed or NOTED, and the
  split is 100 % measured** — every callee classified by a write census (§2).
* **Object type 0's THREE states: 3 transcribed, [M] 1 REACHED** (state 1). State
  0 needs a fresh allocation and state 2 needs a writer of `($2,A5) := 2`, which
  [M] has none in `$230000..$2B0000` outside `$28D520` itself — the object is
  created in state 1 by whatever built the seed. Both are unit-tested.
* **`$28444E`'s FOUR top-level arms: 4 transcribed, [M] 3 REACHED** — the
  SLIDE-IN (49 frames), the SKELETON (every frame after), and the STAGE-CLEAR
  BANNER (lf19144+). The BOSS-WARNING banner is dead and §5.3 says why.
* **The two chain meters: 2 transcribed, [M] 1 REACHED.** P2's `$2847D4` is
  unexercised because `$8130C0` is `$FFFF` in the seed and `$28465C bmi` skips
  the whole block. It is unit-tested and counted.
* **`$2842B0`'s two players: 2 transcribed, [M] 1 REACHED**, same reason.
* **The EXTEND: transcribed, [M] NOT reached** — [M] the total ends at BCD
  414,340 against `$81B4AC`'s `$02000000`, so `$28433E`'s compare fails. Both
  arms of `$286FDA` and the `$14`-lives refusal are unit-tested against the
  cartridge's own `$28840E`.
* **`$287E8E`: 15 of 15 entries EXPORTED, [M] 15 REACHED. `$287ECA`: 64 of 64
  EXPORTED, [M] 64 REACHED.** Both walked in full by a playing run, and both
  extents derived from an instruction rather than from the run.
* **`$28840E`: 4 of 4 EXPORTED, [M] 0 reached** (no extend), 2 reached in unit
  tests.
* **The nine digit records: [M] 9 of 9 written**, and the leading-zero, interior-
  zero and blank-again arms are all exercised.
* **Transcribed and unexercised, NAMED:** P2's whole block; `$2842FE`'s P2 pass;
  the EXTEND and `$286FDA`; `$284330`'s `$99999999` pin; the BOSS-WARNING banner
  and its HP bar; `$284AB6`'s counter and `$2877B8`; the hyper's three throw
  arms; `$2853DC`'s tally; `$2844CC`'s boss fork; `$28461C`'s sub-tick with a
  NON-ZERO reload (and see the tap below).
* **`$81B64F`, THE TAP RECON 38 §4.4 ASKED FOR AND NOBODY HAD RUN.** The recon
  censused it as "every absolute write writes ZERO" and stated its own limit
  (a based write would defeat it). The port transcribes the *instructions* and
  **notes the address the first frame a non-zero reload is ever seen**. [M] it
  has not fired in 21,000 frames. That is not a proof — the hyper has never been
  up — and it is the cheap check the recon costed, now standing.
* **Unit tests 808 → 844, 0 skipped.** New file `tests/w63hud.test.js` (36).
  `webgate` **14 of 14**, unmoved.

---

## 8. EVERY CHECK SEEN TO FAIL — 50 mutants, 50 RED, 0 survivors

`.scratch/mutate63.mjs`: apply ONE edit with a single-occurrence anchor, run ONE
check, require a NAMED test (or a NAMED gate assertion) RED, restore, **verify
sha256 byte-identical**. 180-second timeout per check, because W62 §11.1 found a
check that HUNG rather than failing.

```
[M] 50 of 50 mutants turned a NAMED check RED; survivors 0; SKIPPED 0
```

**FIVE OF MY OWN CHECKS COULD NOT FAIL — three found while writing the tests and
two by the mutants.** Recorded because that is the distinction W31 asked for.

| | what was wrong | the check that exists now |
|---|---|---|
| **A** | the state-2 test asserted the kill queue at a literal `$80D5EC`; the queue is `ALLOC.killQueue = $80DBFE` | it reads `objalloc.js`'s own constant, so a queue that moves is caught by the module that owns it |
| **B** | the `$285F52` cursor test set the tick reload to **1**, so the cursor advanced every OTHER frame and 15 calls walked 8 entries. A 15-entry table checked with 8 samples | reload **0** — the borrow is certain, the walk is one entry per frame, and `new Set(seen).size === 15` |
| **C** | two banner-state assertions expected bits 1 and 2 set on the FIRST frame. `$284BAC beq` reads the OLD bit, so each `bset` takes one frame EACH and `$284BCC bclr #$0` re-seeds the timers in between | a **four-frame** walk asserting `$02` → `$06` → `$07`, that the timer is RE-SEEDED on frames 1–3 and only MOVES on frame 4, and that `$240EBC` prints exactly once |
| **D** | **M17 SURVIVED: "the leading-zero flag D7 is ignored".** The fixture total `$00012345` has **no interior zero**, so `d2 === 0 && d7 === 0` and `d2 === 0` agree on every digit of it | a `$00010305` case: the leading zero is BLANK, **both interior zeros PRINT**, and the flag is the only thing that separates them |
| **E** | **M20 SURVIVED: "`$284384 bhi` read as `bcc`".** The fixture had the two overflow digits DIFFERENT, so `>` and `>=` agree | an EQUAL-overflow case that must fall through to `$284390`'s longword compare, plus its own other side (a higher high score survives) |

D and E are the same shape as W61's M4 and M33: **a fixture sitting where two
readings agree is not a check**, and both were invisible until the mutant asked.

**AND THE GATE HAS THREE CONTROLS, because one cannot separate three claims:**

```
[M] --break no-hud         object type 0 not dispatched (i.e. HEAD)  18 of 27 RED
[M] --break frozen-meter   $81B5C0 restored after every step          4 RED, all chain
[M] --break rank-poke      +1 into each of the four rank words        5 RED, all rank
```

`rank-poke` exists because **a "nothing moved" row that cannot be made to move is
not a check** — the five RANK rows stay green under `no-hud` for the right
reason, and this is what proves they are not vacuous. The nine rows that survive
`no-hud` are those five, the object-table ORDER (a property of `$24111E`, not of
this wave), the seed's own `$81B6EE`, and the meter CAP, which is
`src/score.js`'s refill. Each is stated in the gate's own header.

---

## 9. WHAT THIS WAVE DID NOT DO

- **THE BOMB AND THE HYPER.** Recon 38's waves 2 and 3. Six throws, six
  addresses, and the slot they go in is now the cartridge's (§3).
- **`$2926E2`'s TAIL IS NOT FIXED** (§5.3) — declared, with the address, and the
  boss HP bar refuses rather than fabricates.
- **THE HUD IS NOT DRAWN.** The state is this port's and the picture is not:
  `$240DC2`, `$23FA96`/`$23FAC4` (bucket 25) and the twenty pure-draw routines
  are counted notes. Nothing this wave does enters `PRODUCED_BUCKETS`, so the
  display-list gate's substituted set is unmoved.
- **THE STAGE-CLEAR TALLY** (§5.1) — one bit away, and the bit belongs to the
  RESULT SCREEN wave.
- **Nothing is compared against MAME.** No gate in this repo has ever compared a
  chain meter, a pending score or a HUD word against the board, and this wave did
  not build one. What is proved is that the port runs the cartridge's own
  instructions in the cartridge's own slot; **whether the board's meter reads 56
  on the same frame is unmeasured.**
- **`games/gradius/` was not touched.**

## 9b. THE EXPORTER'S OWN CHECKS, SEEN RED AGAINST THE CARTRIDGE

A unit test can only read the exporter's source. `check_hud_extents` runs against
the real image on every export; here it is with each of its seven assertions
broken in turn, in memory, the image restored and re-checked clean after.

```
[M] check_hud_extents PASSES on the real cartridge
[M] 7 of 7 mutants RED:
      $285F80's wrap constant $38 -> $3C   ($287E8E's extent comes from it)
      $285F78 is no longer `subq.w #$4`    (the stride the wrap is divided by)
      $285F8A is no longer `moveq #$3F`    ($287ECA's 64 entries come from it)
      $286FFE `move.w #$C` -> `#$8`        ($28840E's last index)
      $28840E[3] is not $FFFFFFFF          (the no-more-extends mark $286FE8 tests)
      $28840E[4] is not `lea $803824,A0`   (the CODE that proves FOUR entries)
      the $287E8E window declared 8 bytes SHORT
```

The last one exists because W54 §6.2's lesson is that **a short window is not
caught at the export; it is caught by `src/rom.js` on a player's machine.** The
declared LENGTH is compared against the derived one, out of variables.

## 10. THE BOOT COST — two ROM windows, 332 raw bytes, every byte named

`.scratch/w63boot.mjs`, W61 §6/W62 §12's method: re-export with the PRE-W63
exporter (`git show b0dfb42~1:`) and with this tree's, both sha256'd
byte-identical on the way back.

```
[M] manifest.json            10,776 ->  10,776      +0   (no new shard)
[M] player.tables.json.gz   139,651 -> 140,115    +464
[M] spr/streams.u32.gz         1,055 ->   1,055     +0
[M] seed.bin.gz                6,878 ->   6,878     +0
[M] capture.json.gz            3,920 ->   3,920     +0
[M] TOTAL                   162,280 -> 162,744    +464 B = 0.45 KiB
```

**+464 B, all of it the two ROM windows** — 332 raw cartridge bytes, hex-encoded
at two characters a byte before gzip. **They cannot be deferred**: a missing
sprite stream is a NAMED SKIP the page draws around, but a missing ROM window is
a THROW out of `src/rom.js` (W54 §3, W61 §6, W62 §12). **No new sprite shard**,
so `manifest.json` — the one body served uncompressed — does not move at all.
This is the cheapest wave for boot since W62.

## 11. THE PAGE, IN A REAL BROWSER — WHAT I SAW `[M]`

Chrome + Python `playwright`, W61/W62's recipe, **fire TAPPED** (80 ms down /
240 ms up, the owner's own `z`) rather than held, because a chain has to be
STARTED before it can be watched to expire. The page is READ, not only
photographed: every five seconds the script pulls the port's own RAM through
`window.__mixup` — a screenshot cannot show that a meter fell.

### 11.1 LOCAL (`python -m http.server 8763`) — **THE CHAIN FILLS AND EXPIRES**

```
[M] +58s  lf 6144  meter  0/56  chain  0  dec 1738  zero 24  total 0x12511  pending 0x0
[M] +63s  lf 6453  meter 44/56  chain 36  dec 1934  zero 24  total 0x17662  pending 0x0
[M] +68s  lf 6761  meter  0/56  chain  0  dec 2224  zero 27  total 0x22822  pending 0x0
[M] +73s  lf 7070  meter 37/56  chain 21  dec 2423  zero 29  total 0x24103  pending 0x0
[M] +78s  lf 7379  meter  8/56  chain  0  dec 2682  zero 32  total 0x26631  pending 0x0
[M] +84s  lf 7686  meter 49/56  chain 16  dec 2805  zero 36  total 0x27287  pending 0x0
[M] +89s  lf 7991  meter  0/56  chain  0  dec 2984  zero 38  total 0x30718  pending 0x0
[M] FINAL lf14569  200 s of continuous play, NO throw, NO page error
[M] rank 53 / rankPower 0 / hyperStock 0 / earn 0 on EVERY ONE of the 40 samples
[M] the digit records read `___30730` -- the port's own nine records spelling
    the port's own total, out of the page
[M] $81B5A4 and $81B59C -- the two cursors -- hold a DIFFERENT longword on
    every sample, out of $287ECA and $287E8E
```

**That is the wave's whole result, on a screen: the meter goes UP when things
die and COMES BACK DOWN, thirty-eight times, and the pending score is 0x0 on
every sample because it has already been drained into a total that climbs.**
Before this wave the meter sat at 56 and the pending only ever grew.

What is NOT there, and a reader should hear it from me: **no score row, no chain
meter, no bomb icons.** The HUD's STATE is now this port's; its PICTURE is
`$240DC2` and bucket 25, and those are counted notes. A player sees exactly what
they saw before.

Screenshots: `.scratch/w63local-0boot.png`, `-chain.png`, `-scored1.png`,
`-final.png`.

### 11.2 DEPLOYED — `https://gbtman.pages.dev/games/ddpdoj/`, build `20260805111446`

`node tools/publish.mjs --only ddpdoj`, confirmed live on three consecutive
polls. Then the SAME script, the same key, `spr 13/13`:

```
[M] BOOTED  lf 2665  slide 0  bannerT 0   meter  0/0   pending 0x0    total 0x0
[M] +5s     lf 2990  meter 51/56  chain   9  dec  259  zero  1  total 0x1944
[M] +10s    lf 3319  meter 44/56  chain   6  dec  540  zero  2  total 0x8265
[M] +16s    lf 3662  meter  0/56  chain   3  dec  724  zero  5  total 0x8882
[M] +33s    lf 4662  meter 39/56  chain   4  dec  955  zero 15  total 0x9428
[M] +44s    lf 5324  meter  0/56  chain   5  dec 1520  zero 21  total 0x11789
[M] +61s    lf 6324  meter  3/56  chain   6  dec 1821  zero 28  total 0x13452
[M] pending 0x0 on EVERY sample;  digits `___13452`;  both cursors moving
[M] rank 53 / rankPower 0 / hyperStock 0 / earn 0 on EVERY sample
```

**The deployed build does what the local one does: the meter fills, the meter
falls, the chain expires, and the pending score never sits.** This is not an
E3-class local/deployed gap.

### 11.3 **AND THE FIRST DEPLOYED RUN WAS A STALE EDGE — a SHARPER instance of W61 §6b**

The run taken immediately after `publish.mjs` confirmed the build id on three
consecutive polls came back with **`slide` = 1 and `bannerT` = 48 on every one of
its forty samples, `dec` = 0, `zero` = 0, and `pending` growing to `0x299641`
with `total` stuck at `0x0`** — i.e. **exactly HEAD's behaviour**, on a page
whose stats line read `spr 13/13`.

W61 §6b already recorded that "three consecutive good polls of the build id can
still coexist with a stale `index.html` on another node". **What this adds is
worse:** [M] fetching `src/main.js` and `src/hud.js` **at that same moment**
returned HTTP 200 with the NEW bodies (`makeHudObject` ×2 in `main.js`, 63,938 B
of `hud.js`) — so **the direct fetch and the browser's own fetch disagreed at the
same instant.** "I fetched it and it is the new file" is NOT proof the browser
got the new file. Re-running four minutes later gave §11.2, from the same URL,
with no republish.

A wave that took the first run as its result would have reported itself broken;
a wave that took the direct fetch as reassurance would have reported the first
run as a real regression. Both are recorded because the next wave will hit it.

## 12. THE DONE-WHEN, EACH AS A MEASUREMENT

| the brief asks for | `[M]` |
|---|---|
| **What `$28444E` now runs, and what remains a loud named throw** | §2: the object's three states, `$2842B0` + `$2842FE` + both digit routines + `$286FDA`, both cursors, the `$81B6EE` slide-in, the `$81B5B4` drain, **BOTH players' blocks and BOTH chain-meter decrements**, both banner machines, the extend counter, `$2877B8`, and `$2853D2`'s guard. **SEVEN LOUD NAMED THROWS**: the hyper's tail ×2 (`$285A96`/`$285BC0`), its activation ×2 (`$285A24`/`$285B4E`), its end-flash body ×2 (`$2873B4`/`$287492`) and the stage-clear tally (`$2853DC`). Plus the boss HP bar's null-pointer refusal (`$284A3E`). **[M] none has fired in 21,000 frames of play** |
| **Whether any rank write became reachable, to I2's standard** | §6: **NO.** `$81309E` 53, `$81B646` 0, `$81B65C` 0, `$81B65E` 0 — digit-identical between HEAD and W63 across THREE inputs (none/tap/hold), and 53/0/0/0 on all 40 browser samples. `$81309E` still cannot move at all: `$2608D2`/`$260794` remain absent from `src/`. **ONE non-rank word DID move — `$81B64A`, 2,112 → 1,512 — and §6.1 bisects it to THE DECREMENT alone** (cutting it restores 2,112 exactly; −600 is exactly 25 × `$18`) |
| **The bomb-debit vs rank-object SLOT ORDER, settled by measurement** | §1: **THE RANK OBJECT IS ALWAYS FIRST.** `$240F62`'s second longword is the DISPATCH PRIORITY (`$28D520` `$09`, `$2491C0` `$1C`, `$260794` `$1F`) and `$24111E`'s create queue keeps the table descending, so rank > player > ledger **statically**; [M] **6,200/6,200 frames, 0 bad**, asserted every frame. ⇒ **the bomb's `$249976` debit lands AFTER the frame's rank recompute, so it reaches `$81309E` on frame N+1 — the same answer as the hyper's**, which recon 38 §3.3 said did not transfer |
| **Whether score.js's second chain machine became reachable** | §5.4: **it was ALREADY reachable and ALREADY ported, by W51, two waves before this one.** Recon 38 §4.5/§5's "note only" is STALE. No fix was needed; three stale comments in `score.js` are corrected in place. What W63 changes is that the meter `$2869D8` floors at 10/25 now FALLS again — measured, and its one consequence bisected in §6.1 |
| **Say what you SAW in the browser, LIVE as well as local** | §11 |
| **Gate ALL GREEN (53/0/0 → and the unit tests)** | §13: **ALL GREEN — 57 passed, 0 failed, 0 SKIPPED** (was 53). The four new stages are this wave's scenario and its THREE REDs. **844 unit tests, 0 skipped** (was 808); `webgate` **14 of 14**, unmoved; `build-dist` clean with **5 deliberate exceptions, UNMOVED** |
| **If you allocate from any pool, prove it drains** | This wave allocates from no pool. It DRAINS two: [M] `$81B4C0` (the pending score) is **0x0 on every one of the 40 browser samples and at the end of all three tree-control runs**, where HEAD leaves BCD `$00551518` sitting in it for ever; and `$81B5B4 → $81B610` at four per frame, whose four unrolled copies are unit-tested at 10, 4, 1 and 0 pending |

## 13. THE GATE, ON THE SETTLED TREE

W58 §6's rule: a gate started before the tree settled is not evidence about the
tree. The run below started **after** `.scratch/mutate63.mjs` had finished
touching `src/` and after the last test edit; nothing was edited while it ran.

```
python games/ddpdoj/tools/oracle/pgm.py check
VERDICT: ALL GREEN -- 57 passed, 0 failed, 0 SKIPPED
  [PASS] THE CHAIN EXPIRES: object type 0, the drain and $284636
  [PASS] THE CHAIN EXPIRES RED [no-hud]        -- went red without object type 0
  [PASS] THE CHAIN EXPIRES RED [frozen-meter]  -- went red with the meter frozen
  [PASS] THE CHAIN EXPIRES RED [rank-poke]     -- went red with a rank word poked
```

**53 → 57 stages, and the four new ones are this wave's scenario and its three
REDs.** Nothing was disabled, skipped, narrowed or loosened, and every stage line
was read rather than only the verdict. The ones this wave could plausibly have
broken, all green:

- **`fly-around: port vs board, 0 divergent frames` and its 5 REDs** — the only
  port-vs-board window this project has. Nothing fires in it, so nothing dies,
  no chain starts and no score is pending; its green says this wave changed
  nothing on the no-input path, which is exactly what §6's `none` row measures
  directly on both trees (identical in every column, including the RNG).
- **`STAGE 1 ENDS` and its `RED [no-timeout]`** — W62's, and the one this wave
  had most reason to break: `$81DF1E` bit 3 opens `$2847FE`'s arm at lf19144 and
  `$8130F8` bit 3 opens `$284B5E`'s. [M] the port still reaches **lf 19,218** and
  still stops on `UNPORTED $228658`, at the same frame, with the same seven
  type-6 states.
- `display list: the staged-bytes replay gate (1,901 frames)` and its 12 REDs.
  **Bucket 25 is not in `PRODUCED_BUCKETS`**, so nothing this file does enters
  the substituted set.
- `midboss DEATH` and its `RED [no-kill]`; `bullet mover`, `turret angle`,
  `bullet spawns` and `spawn walker` against the board.
- `assets/integrity` and its four REDs, including `[rom-byte]`, THE ROM-LEAK
  GUARD: two new ROM windows went through it.
- `background shard gate` — the stage that FRESH-EXPORTS, i.e. the one an
  exporter change has to survive, and where `check_hud_extents` runs.
- `pixel gate` (100.0000 %) and its 9 REDs; `demo gate` and its 4.

Also green on the final tree, and not part of `pgm.py check`:

```
node --test games/ddpdoj/tests/     844 pass, 0 fail, 0 SKIPPED   (was 808)
node games/ddpdoj/tools/webgate.mjs 14 of 14 PASS                 (unmoved)
node tools/build-dist.mjs           clean, 5 deliberate exception(s)  <- UNMOVED
BOOT PAYLOAD                        158.9 KiB (was 158.5)
```

**`PUBLISH_VERBATIM` DID NOT GROW**: this wave ships no new asset body at all,
only 332 bytes of ROM windows inside `player.tables.json.gz`.

**[M] THE SERVER I STARTED WAS KILLED.** `Get-CimInstance Win32_Process` finds
**zero** real `python http.server` processes and ports 8000/8763/8712/8791/8781/
8125/8771 are all FREE — checked by PROCESS and by PORT, as W61 §6b and W62 did.
The deployed runs used no server of mine at all.

## 14. WHAT I COULD NOT DETERMINE

* **Anything against the board.** No MAME run in this repo has ever compared a
  chain meter, a pending score, a HUD cursor or a digit record against the board,
  and this wave did not build one. What is proved is that the port runs the
  cartridge's own instructions in the cartridge's own slot and that the words
  move the way the listing says. **Whether the board's `$81B5C0` reads 44 on the
  same frame is unmeasured**, and so is whether its `$81B440` holds `$00030730`
  after the same inputs. The score this port now shows is very different from
  the one it showed yesterday (§6) and **neither has been checked against the
  board**; the new one is the one the listing produces.
* **Whether `$81B64F` is EVER non-zero.** Recon 38 §4.4's open item. The port now
  carries the tap and [M] it has not fired in 21,000 frames — but no run in this
  repo has ever had a hyper up, so that is a statement about the runs and not
  about the game. It stays open, with the instrument in place.
* **`($2,A5) := 2`, object type 0's own DESTROY state.** [M] no writer in
  `$230000..$2B0000` outside `$28D520` itself. Either something builds the record
  in state 2 (nothing this port runs does) or the state is dead in build B. I did
  not resolve which; the port transcribes it either way and it is unit-tested.
* **`$2926E2`'s tail** (§5.3) — found, declared, not ported, and the three boss
  routines it needs are named.
* **What `$81B612` is FOR.** `$284AFE`/`$284B3E` write 8 and 7 into it and nothing
  in `$28444E`'s closure reads it. Transcribed; its reader is elsewhere.
* **`$284D48`'s D6 slide arithmetic and the eleven `$240DC2` immediates.**
  Transcribed as notes with their addresses, not as geometry: the TX printer is
  unported, and inventing a layout for it would be exactly the plausible wrong
  answer this project's method exists to prevent.

## 15. ONE PARAGRAPH

**The chain expires.** `$240F62[0] = $28D520` had been a counted dispatch miss on
every frame of every run since wave 4, so the pending score only ever grew and a
chain the port started never ended — `src/score.js` had said so, in those words,
for twenty-nine waves. `src/hud.js` ports the object and everything under it: the
three states, the four-`abcd` drain and its nine-record digit machine, the extend
intervals, the two HUD cursors, the 48-frame HUD slide-in nobody had noticed is
the shipped seed's DEFAULT arm, both players' blocks, both banner machines, and
**`$284636` and `$2847D4`, the two chain-meter decrements**, in the slot the
cartridge puts them in. That slot is the answer to recon 38's one unresolved
question: `$240F62`'s second longword is the dispatch PRIORITY, the create queue
keeps the table descending, and so the rank object runs before the player and the
player before this one — **which means the bomb's `−3` lands after the frame's
rank recompute, exactly like the hyper's gain, and W19's measured "the meter
decrements LAST" is now true by construction.** The hyper's two guards are
transcribed and every arm past them throws by address. No rank write moved.
**Load the page, fly, shoot, and watch the meter fill and fall** — thirty-eight
times in two hundred seconds, locally and on the deployed build. What it does not
do is draw any of it: the HUD's state is this port's and its picture is still
`$240DC2`.

status: **DONE**
