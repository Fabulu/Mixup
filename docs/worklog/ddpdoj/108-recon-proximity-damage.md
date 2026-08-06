# 106 -- RECON: does DOJ give the regular shot a point-blank / proximity damage bonus?

status: IN PROGRESS

THE QUESTION (owner, IMPORTANT): does the player's regular shot deal MORE DAMAGE
when the ship is close to the enemy (point-blank bonus)? Answer must be (a)
present AND ported, (b) present AND NOT ported (addr + formula), or (c) absent
with a measured absence-proof.

## The damage path (verified against ROM, not just the port)

`$244D62` is the collision/damage pass. Shot damage is the shot record's word
at +$18 (the port's `S.hp` / damage.js "POWER"). In every damage block:

  - block 6a `$245032 move.w $14(A6),D5`  (A6=shot+4 -> shot +$18 = D5)
  - block 6b `$245156 move.w $14(A6),D5`
  - block 7/8 `$245228 / $2452D0 move.w ($18,A2),D5`  (weapon objects)
  - beam  `$245480 move.w ($e,A1),D5`  (a different field on the beam record)

D5 is then optionally scaled (the $81308C quarter/half gate, the hyper double)
and subtracted from the ENEMY's +$18 HP. There is NO distance term in the
damage AMOUNT. The box test decides WHETHER a hit lands, not how hard.

So a proximity bonus could only live in a WRITER of the shot +$18 (a per-frame
recompute keyed to distance), or in a separate bonus routine. It cannot live in
the application path: that path does not read the player position for damage.

## Where +$18 IS written (the port's two spawn sites)

1. `$24A222` (ship shot fill, src/shots.js fillShotRecord). The power word is
   written by `move.l (A0)+,($16,A6)` at $24A244 -- a LONGWORD that covers
   +$16/+$18. The value comes straight out of a ROM TEMPLATE indexed by the
   player's power level (+$20: 0/2/4/6/8). NO distance term at spawn.
2. `$24D578` (pod shot fill, src/options.js writePodShot). Same shape: the 3rd
   of four `move.l (A0)+,(A6)+` longs (at $24D54C..$24D552) lands on +$16/+$18,
   again from a template indexed by power level. NO distance term.

The only other writers of +$18 in the port are the collision DEBITS
(`$24504E / $24515E sub.w D4,$14(A6)`), which subtract the enemy's HP from the
shot's power as it pierces -- not a bonus, and not proximity-dependent.

## Absence-search in the ROM

rosetta sites on the shot-table bases, build B:
- $810572 (P1 shots): absolute refs at $249BFC, $249D2C, $24D484, $24D5DE,
  $24D760, $253A70, $254564, $2545A4, $25A358 (data), $28B682, $28B738.
- $810C32 (P2 shots): mirrors at $249C0E, $249D3E, $24D494, $24D5EE, $24D770,
  $25A374 (data), $28B6C8, $28B76E.

Each non-spawn candidate disassembled straight from maincpu.bin (capstone):
- $253A70 / $25A358 / build-A $1597C0: DATA, not code. The bytes around the
  operand are `0023 0030` = count $23, stride $30 -- the shot-table DESCRIPTOR
  (36 slots x $30 at $810572). Ruled out.
- $254564 / $2545A4 (inside the laser handler $254078): `moveq #$17,D7;
  lea $810572,A0; lea $2A0(A0),A0; moveq #0,D5; move.w (A0)+,D3; movem.l ...;
  jsr $25A17C; ...; jsr $25A17A; ...; dbra D7`. A read-then-call loop over
  consecutive type words -- it ONLY reads `(A0)+` and calls $25A17C/$25A17A
  (sound/effect enumeration over live shots). It writes NO shot field. Ruled
  out as a damage recompute.
- $28B682 / $28B738: the type-5 tail $28B670 (damage.js runType5Tail), which
  feeds the collision pass. Known; debits +$18 only via the pass.

### The 16 shot-handler dispatch entries (table at $253ADE)

[0]=$253B1E [1]=$253C98 [2]=$253E34 [3]=$253F56 [4]=$254078 [5]=$2541BC
[6]=$254300 [7]=$25442A [8]=$253BDA [9]=$253D52 [A]=$253EC6 [B]=$253FE8
[C]=$254136 [D]=$25427A [E]=$2543A4 [F]=$2544CE.

The REGULAR shot is entries [0]/[2]/[8]/[A] (type words $8000/$8002/$8008/$800A),
all ported in src/shots.js. Entry [4]=$254078 is the LASER; the rest are other
sub-types. The dispatch calls handlers with A6 = shot record BASE (verified via
the port's own citations, e.g. $253B60 `move.w D0,($2c,A6)` = velY at +$2c), so
a per-frame write to the power word would be encoded as `$18(A6)`.

Scanned all 16 handlers (capstone, ~120 ins each, through to `rts`):
  - NONE writes to `$18(`An`)` or `$16(`An`)` (longword covering +$18).
  - NONE reads the player record by absolute address ($8103E6/$8103E8/$8103EA
    or the P2 $810448 family).
The power word is NEVER recomputed per-frame by any shot handler.

### Every enemy-HP DEBIT site in build B (the real test for a second damage path)

A whole-image scan for `sub* dX,$16(An)` / `sub* dX,$18(An)` (the enemy-HP
debit, An = enemy+2 or enemy base) returns 101 sites. The ones that apply SHOT
or BEAM or WEAPON damage to an enemy are ALL inside $244D62..$2459D0:

  $244ED2 subq.w #1,$16(A6)   block 4 RAMMING (1 HP)
  $24505E sub.w D5,$16(A5)    block 6a pool A shot damage
  $245170 sub.w D5,$16(A5)    block 6b pool B shot damage
  $245250 sub.w D5,$18(A5)    block 7 weapon slot 27
  $245300 sub.w D5,$18(A5)    block 8 weapon slot 30
  $2454EE sub.w D5,$18(A5)    beam pool A
  $2455F8 sub.w D5,$18(A5)    beam pool B
  $245696/$245814/$2458E8     block 9 BOMB-LASER

Every other debit site is in $26xxxx/$27xxxx (enemy drivers: self-counters,
death logic, per-enemy HP ticks) and is not shot damage. There is NO site
outside $244D62 that applies a shot's damage to an enemy, hence nowhere for a
proximity term to act even if it existed.

## ANSWER: (c) absent from DOJ, for the regular shot

The regular shot deals a FIXED amount of damage per hit, equal to the shot
record's +$18 word. That word is set ONCE at spawn from a ROM template indexed
by the player's power level ($8103E6+$20: 0/2/4/6/8), via a post-increment
longword copy ($24A244 `move.l (A1)+,(A0)+` for the ship, the 3rd of four longs
at $24D54C..$24D552 for the pods). The only modifiers in the damage path are:
  - the $81308C rank gate (quarter off, $24503E `lsr.w #2` / $245162),
  - the hyper double on weapon slot 30 / the beam ($2452DC / $2454A0),
  - the piercing debit (the shot's +$18 is itself reduced by the enemy's HP,
    $24504E / $24515E `sub.w D4,$14(A6)`).
NONE of these reads the player's position or the player-enemy distance.

The damage APPLICATION ($244D62, blocks 6a/6b/7/8 + beam + bomb-laser) reads the
shot's position and the enemy's position ONLY for the box-overlap test that
decides WHETHER a hit lands; the damage AMOUNT comes solely from the shot +$18
word. No shot handler and no other routine recomputes +$18 from a distance.

The port (src/damage.js + src/shots.js + src/options.js) reproduces this
exactly: there is no proximity term to port. The owner's question can be
answered definitively: NO per-hit point-blank / proximity damage bonus exists
on the regular shot in DOJ.

### What the owner may be observing (real, but not a per-hit bonus)

Point-blank DOES melt enemies faster in DOJ, by a different mechanism:
- The collision pass's inner loop debits the enemy once per OVERLAPPING shot
  record. The ship can keep up to 10 slots live (5 primary + 5 secondary at
  $249C5C/$249C60) and the pods add more, all into the same $810572 table.
- At range only the leading shots overlap; point-blank, all 10+ overlap the
  same enemy in one frame, so the enemy loses (sum of each shot's fixed power)
  per frame -- MORE TOTAL DAMAGE, but each shot deals the SAME fixed amount.
- Piercing: a fresh shot hits at full +$18; after piercing N enemies it has
  lost sum(enemyHP) of power. So the first enemy a shot reaches always takes
  full damage regardless of distance.

This is a geometric/concurrency effect, not a proximity damage bonus. The
port already reproduces it (poolDamage's inner loop applies every overlapping
shot). No port change is needed.

## What I searched (the absence-proof, enumerated)

- Every absolute-long reference to $810572 (P1 shots) and $810C32 (P2 shots):
  rosetta sites, build B = 22 + 16 sites. Each non-data site disassembled.
- The full 16-entry shot dispatch table at $253ADE; each handler disassembled
  to rts, checked for any `$16`/`$18` displacement write and any absolute read
  of $8103E6/$8103E8/$8103EA/$810448/$81044A/$81044C. None found.
- Every enemy-HP debit (`sub* dX,$16(An)` / `sub* dX,$18(An)`) in build B
  ($2xxxxx): 101 sites; all shot/beam damage confined to $244D62..$2459D0.
- The damage application itself, byte for byte: $244F68-$245070 (6a),
  $245078-$245188 (6b), $24518A-$24525C (7), $24525C-$245310 (8),
  $2453AC-$245608 (beam) -- D5 comes from the shot +$18 / beam +$0e, scaled
  only by the $81308C gate and the hyper double. No distance term.

What I did NOT find: any instruction, anywhere in build B, that loads the
player's X/Y and an enemy's X/Y into the same calculation and writes the
result to a shot record's damage field or to the enemy's HP. There is no
routine of that shape, because there is no routine that writes a shot's +$18
except the spawn template copy, and no routine outside the collision pass that
applies a shot's damage to an enemy HP word.

## Could not reach / caveats

- Indirect call sites through a register and register-computed RAM writes are
  structurally invisible to a static sweep (CATCHUP section 8). I did not find
  any such site affecting this question, but I cannot prove a negative over
  them the way I can over absolute references. The damage-path argument above
  does not depend on this: even an indirect writer of +$18 would still have to
  be CALLED per-frame, and no shot handler (the only per-frame per-shot code)
  writes +$18.
- The bomb-laser block 9 ($24560A) is transcribed only to its two guards in the
  port. It IS inside the collision pass and I disassembled its debit sites
  ($245696/$245814/$2458E8) -- constant subtractions ($208 / $1E0), no distance
  term. So even the unported block has no proximity bonus.

Worklog path: docs/worklog/ddpdoj/106-recon-proximity-damage.md
status: DONE
