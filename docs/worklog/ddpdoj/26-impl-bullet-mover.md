# W26 — THE BULLET MOVER `$281DDE` (per-frame pool drive) + handler fire wiring

status: **IN PROGRESS.**
wave: 26. role: IMPLEMENTER (sole `src/` writer this wave).
date: 2026-08-03.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
(`$23xxxx`-`$2Axxxx`) unless noted.

## THE BRIEF

The SPAWN side is done (W21: the two cores, 19 generators, 39 kind tables,
`$284190`, the `$200920` field). What is missing — and this wave owns — is the
MOVER `$281DDE`: the per-frame update that makes a spawned bullet MOVE, plus
wiring the six handlers' fire paths to the (ported) generators + pool. DONE-WHEN:
a spawn-for-spawn AND per-frame comparison over the W17 corpus matches slot,
kind, speed, direction AND POSITION at 0 divergent through the midboss.

## RECON — the mover's TRUE span (re-derived from maincpu.bin this wave)

The mover is `$281DDE..$28202E` (the `$282030` longword that disassembles as
`ori.b #$4,-$5556(a0)` is the FIRST ENTRY of the behaviour pointer table, not an
instruction). Its caller is the bullet per-frame driver `$281D9A`, which calls it
at `$281DBE bsr $281DDE` with `A4 = $809C4C` (the bullet sprite accumulation
buffer) and clears `$81B40C` (livecount) first. The instruction after the call,
`$281DC0`, is the clean "after-mover" tap point.

### The window ladder (`$281DEA..$281E1E`) — iteration count

A cascade, NOT the spawn's 5x form. `D7` starts at `$45` (70); for each NON-zero
window word `$81B414/$81B416/$81B418/$81B41A` in order, `D7` advances
`$45 -> $6D -> $9F -> $BD -> $D1` (70/110/160/190/210 — the SAME cap as the
spawn ladder, reached directly: the mover walks D7+1 slots). So:

```
$81B414==0 -> 70   $81B414!=0,$81B416==0 -> 110   ...   all set -> 210
```

### The per-slot dispatch (`$281E54..`) — FIVE paths, read past every terminator

For each slot (A6 = base, D7 decremented once per slot by EVERY exit):

1. `$281E54 move.w (A6),D2 / bpl $281E4A` — bit 15 clear => DEAD, advance.
2. `$281E58 addq #1,$81B40C` — livecount++ (counts slots alive at ENTRY).
3. `$281E5E-$281E6A` the GLOBAL KILL gate: `D1 = $811F72 | $8130F8; bmi $281E20`.
   `$281E20`: re-read `$811F72`; if ==0 => kill; elif bit0==0 => kill; elif
   `$8130F8` bit15 clear (`bpl $281E6C`) => RESUME normal; else => kill. So a
   bullet survives only when `$811F72` bit0 is set AND `$8130F8` bit15 is clear.
   This is the bomb/stage-clear signal; in normal stage-1 frames both read 0 and
   the gate is not entered.
4. `$281E6C move.w #$5180,D0 / and.w D2,D0 / beq $281E74` — the mask is bits
   14,12,8,7. NONE set => the PLAIN path.
5. else `$281ED6`: `btst #$C,D2; bne $281EC4` (bit12 => kill); `sub.w D6,$4(A6)`
   (scroll-comp on posB, applied to ALL of bit7/8/14); then:
   - `tst.b D2; bmi $281F3E` — bit7 => the RECOMPUTE path.
   - `btst #$8,D2; bne $281EEE` — bit8 => the DISPATCH path.
   - else (bit14) => `$281FA2`.

#### PLAIN path `$281E74` (the straight-flyers — every stage-1 bullet)
```
move.l $1e(A6),D0 ; velA:velB longword (STORED velocity)
sub.w D6,D0       ; velB -= scroll
add.w D0,$4(A6)   ; posB += (velB - D6)
swap D0
add.w D0,$2(A6)   ; posA += velA
move.l $2(A6),D0 ; re-read pos  -> bounds: u16(posB)+$C800>$FFFF OR u16(posA)+$9000>$FFFF => kill
<sprite emit $281E96..$281EB8 = $284286 verbatim>
jmp $22(A6)       ; CONTINUATION
```
**Velocity is read from the STORED `$1E` here** — it is NOT recomputed. The
recompute that "velocity is never stored" refers to is the bit-7 path's. A plain
bullet flies straight at the velocity stored on its spawn (dispatch) frame.

#### DISPATCH path `$281EEE` (bit8 — the spawn frame)
```
add.w D6,$4(A6)          ; UNDO the sub above (net 0 scroll on the spawn frame)
moveq #0,D0 / moveq #0,D1
move.b $1a(A6),D0 / move.b $1b(A6),D1
bsr $284190             ; velocity(speed,dir) -> D2=dA,D3=dB   [bulletmath.js]
movem.w D2-D3,$1e(A6)   ; STORE velocity
<dispatch $282030[kind] initialiser>   ; clears bit8, installs continuation at +$22
addi.w #$34,$81B40E / cmpi.w #$9c / beq clr   ; cadence counter (sprite anim)
lea $40(A6),A6 / dbra D7,$281E54   ; advance (NO move, NO continuation jmp this frame)
```
So the spawn frame: recompute+store velocity, run the initialiser, do NOT move.

#### RECOMPUTE path `$281F3E` (bit7 — the curvers; NOT in stage 1)
bounds FIRST (on current pos), then `bsr $284190`, `add.w D2,$2 / add.w D3,$4`
(pure velocity; the scroll-comp already happened in the `sub.w D6,$4` at
`$281EDC`), sprite emit, `jmp $22(A6)`. (bit8 sub-path `$281F84` runs the
initialiser instead.) **Stage-1 kinds 7/13/3/4/19/12/5 are none of these.**

#### BIT-14 path `$281FA2` + the `$281FB4` bit-5 death/transform sequence
stored velocity move, `$284286`, then `bset #5,(A6); bne $282000` etc. — a
per-bullet sprite-transform/death counter (`+$A` advances by `$24`, `+$16`
decrements, at 0 either frees or calls `$27F8F8`). Ported verbatim; NOT exercised
by the stage-1 corpus (no bit-14 kind appears) -> UNVALIDATED, named in §6.

### Kill = free the slot: `clr.w (A6); move.w #$ffff,$2(A6)` (+ a `$27F8F8` note)

`$27F8F8` walks the SEPARATE impact-effect pool `$8171BE` (NOT the bullet pool) —
it spawns a death effect and does not touch bullet state. It is a loud named
throw (effect spawn, W27/W28); the slot free itself is ported.

### `$284286` is the SPRITE EMIT (factored out; identical to the inline `$281E96`)

Packs position+renderOffs into a 12-byte sprite list entry written to `(A4)+`.
No pool side effect; ported to a sprite sink the caller may pass.

## RECON — which kinds STAGE 1 actually spawns (the scope of the gate)

From `w21-bullets-play.tsv`: kinds **7 (88), 13 (33), 3 (31), 4 (18), 19 (10),
12 (10), 5 (7)** — and ONLY those. NONE is a bit-7 kind (16/17/18/20/21/35), so
**every stage-1 bullet takes the PLAIN path** (straight-line, stored velocity).
For kinds 3/4/5 the continuation's target-track branch reads `$2C` (D4) —
**D4 is `00000000` for every one of these spawns in the corpus**, so the track
branch is dead and they fly straight too.

### The 7 stage-1 behaviours (initialiser clears bit8 + installs continuation)

| kind | init @ | continuation @ | calls `$2820CC`? | position effect |
|---|---|---|---|---|
| 3 | `$2823EC` | `$282420` | no | none (track dead, D4=0) |
| 4 | `$2824A8` | `$2824DC` | no | none (track dead, D4=0) |
| 5 | `$282564` | `$282598` | no | none (track dead, D4=0) |
| 7 | `$2826DC` | `$282738` | YES (`$283D4C`) | muzzle offset once (init) |
| 12 | `$282908` | `$282944` | YES (`$283D4C`) | muzzle offset once (init) |
| 13 | `$282962` | `$28299E` | YES (`$283D4C`) | muzzle offset once (init) |
| 19 | `$282B30` | `$282B64` | no | init CLEARS `$1E` (vel=0); continuation restores `$1E` from `$30` once (2-frame launch delay) |

`$2820CC` is the shared muzzle-offset + sprite-setup helper: index =
`((dir+4)&$F8)*3/2` into the 32-entry table `$283D4C` (384 B), and it adds
`signExtend(T.lo)/2` to posA (`+$2`) and `signExtend(T.hi)/2` to posB (`+$4`).
Kinds 7/12/13 therefore get a direction-dependent spawn offset; 3/4/5/19 do not.

## PLAN

1. Add the `$283D4C` muzzle-table window to `tools/export-tables.py` (384 B).
2. `src/mover.js`: `runMover(ctx)` — the loop, all five paths, the global kill
   gate, the velocity recompute (reuse `bulletmath.velocity`), the bounds kill,
   the sprite emit (`$284286`), the continuation jmp. Behaviour dispatch resolves
   `$282030[kind]` (reuse `behaviourFor`); the 7 stage-1 init+continuation bodies
   hand-translated; the other 32 loud-throw by address.
3. A MAME tap (`w26mover.lua` + `w26run.py`) dumps the pool at `$281DDE` (before)
   and `$281DC0` (after) each frame — the clean before/after isolates the mover.
4. `tools/w26movergate.mjs`: seed from frame-F before, run `runMover`, compare to
   frame-F after (slot / type&$3F / speed / dir / posA / posB). RED: a mover
   mutant (stored-not-recomputed velocity, broken kill, broken continuation).
5. Wire the six handlers' fire paths to the generators + pool.

## THE MEASURED RESULT (the done-when)

`tools/oracle/w26mover.lua` taps the bullet driver `$281D9A` at `$281DA6`
(`clr.w $81B40C`, one insn before `bsr $281DDE`) for BEFORE and `$281DCE`
(`move.w D0,$80AFE0`, four insns after the mover returns) for AFTER, dumping the
whole pool both times. The logic frame is counted by the `$803940` semaphore
(W21's mechanism) -- NOT by the mover, which does not run every frame and tying
`lf` to it freezes the input script and the game never starts.

`tools/w26movergate.mjs` seeds the port from BEFORE, runs `runMover` once,
compares to AFTER (slot / type&$3F / speed / dir / posA / posB / velA / velB).
A 2200-frame PLAYING capture (`w26-mover-val.tsv`, lf2026-2200 of bullets):

```
RESULT divergent=0 of 1254 slot-steps  -> 100.0000 %   (160 before/after pairs)
  RED velocity-stored-not-recomputed   divergent=20/1254   (dispatch-frame recompute)
  RED no-plain-move                    divergent=1233/1254 (plain-path integration)
  RED break-kill                       divergent=5/1254    (the OOB bounds kill)
  (window-constant NOT ATTEMPTED: invisible while live<70 -- the W21 gate's blind spot)
```

The DONE-WHEN is the INVULNERABLE 9000-frame capture (`w26-mover-invuln.tsv`),
which reaches the MIDBOSS (lf4997+, max live 96, window cap grows 70 -> 160):

```
RESULT divergent=0 of 244545 slot-steps  -> 100.0000 %   (6602 before/after pairs)
  kinds covered: 3,4,5,6,7,12,13,19  (kind 6 = the midboss's bullet)
  max live in one frame: 96   (window ladder exercised: 70 -> 160)
  RED velocity-stored-not-recomputed   divergent=3454/244545
  RED no-plain-move                    divergent=239907/244545
  RED break-kill                       divergent=3078/244545
```

Kind 6 (`$282620`) is the midboss's bullet -- the SAME target-tracker template as
kinds 3/4/5 (and `+$2C` is 0 for all 32099 of its spawns in the corpus), so it was
a one-entry port.  Without it the midboss region threw on the unported initialiser;
with it the whole 9000-frame run is 0 divergent.  `window-constant` stays invisible
(spawn cap == move cap, so a slot can never exist past the current cap -- the W21
gate documents the same blind spot).

The 21 dispatch-frame slots stored velA/velB=0 (leftover from the cleared slot);
the port recomputes the real vector (e.g. `(-$DF,$0)`), so comparing the stored
velocity is what makes the recompute red on its OWN frame (a single-step
before/after gate cannot otherwise see a `+$1E`-only change).

## THE FIRE WIRING

`fireBullet` (src/handlers.js) is the wire: it calls `fire()` (W21) with the
handler's D0-D5 and spawns into the live pool the mover drives.  The six
handlers' fire is reached two ways; only one is wirable without W27:
* DIRECT generator calls (re-derived this wave): `$82` calls `$281708`(x4)/
  `$281764`(x2)/`$281484`; `$05`/`$07` call `$2814AC`.  Each sits inside a fire
  STATE MACHINE (HP gate, `$8130CA` gate, aim256 -> stored aim byte at `+$30` ->
  the fan).  The fan reads D1 from that stored aim byte, so wiring it alone would
  fire every bullet the wrong way.  The aim+gate machine is the W27 firing wave;
  the direct fans stay `noteFan` here and `fireBullet` is provided for W27.
* INDIRECT `jsr (A0)` via `+$2A`/`+$2E` -> a `$23Dxxx` fire-action (the per-bucket
  body that sets D0-D5).  The `$23Dxxx` bodies are W27; noted, not wirable.

So the pool, generators, mover, and the `fireBullet` wire are all in place; the
per-handler fire BODIES (aim + gates + `$23Dxxx`) are W27 and the per-frame
handler+mover call is W29.  `fireGate267FC6` stays DEMOTED (the W25b note -- its
`$804000` RNG was fabricated; a faithful port needs the D2+D3 box test + D4
player-distance, which belongs with the W27 firing wave).

## NOT PORTED (loud named throws, by address)

* 32 of 39 behaviour initialisers + continuations (the W27 family
  `$282104..$283BAF`).  `runInitialiser`/`runContinuation` throw carrying the
  resolved address.  Stage 1 spawns only the seven ported kinds.
* the bit-7 RECOMPUTE path and the bit-14 TRANSFORM path are transcribed verbatim
  but NOT exercised by stage 1 (no bit-7/bit-14 kind appears) -> UNVALIDATED.
* `$27F8F8` (kill-side effect spawn into the impact pool `$8171BE`) is a counted
  note -- it does not touch the bullet pool.
