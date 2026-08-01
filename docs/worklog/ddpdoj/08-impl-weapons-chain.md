# WAVE 8 — the weapons chain

status: **DONE on the SHOT, BLOCKED on the rest of the chain** — with the
measurement that says which is which, and an updated work list for whoever
comes next.
wave: 8   role: impl   started: 2026-08-01

All addresses are **VERSION-B** (`$23xxxx`–`$28xxxx`, 2002.10.07 BLACK VER)
unless a line says build A. Machine pin printed on every run:
`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes.

## The task, as I understood it

Wave 5's §"Why the done-when is BLOCKED" is the work list. Work OUTWARD FROM
THE PLAYER, land what is verifiable, leave the rest as loud named throws, and
prioritise what makes the published page better.

## THE HEADLINE

```
python games/ddpdoj/tools/oracle/pgm.py shotgate
  SEED   lf=4447  125 logic frames compared (lf 4448..4572)
  COLS   52 compared  (fly-around's 34, plus 18 new shot columns incl. the TEN
         SHOT RECORDS the player's own spawn can reach, dumped byte for byte)
  SHOTSPAWN ($249BFC/$24A222): primary=18 secondary=18
  SPRQ CONTAINMENT ($23F3AE -> $808854): 574 record(s) emitted by the port over
         125 frames, 574 found verbatim in the board's own bucket, 0 MISSING
  HITEX $245044 fired 0 times on the TEN COMPARED RECORDS in the whole window
  DIGEST bcd6afe338ea027e79b009aa1cf24e62c1bdd99cd277f81f324cadbb867fc6fb
  RESULT 0 DIVERGENT FRAMES on 52 columns over 125 logic frames

pgm.py shotgate --reuse --break <m>
  no-secondary-tail    RED   p44 lf4461, then shot1/shot2 byte 181, + containment
  enqueue-off-by-one   RED   containment 574 -> 0 MISSING->574, 52 columns GREEN
  no-anim-step         RED   shot1/shot2 byte 85, + containment 344 missing
  no-live-count        EXPECTED-GREEN, declared in breakage.mjs BEFORE the run:
                             nshot's REPORTED drift moves 106 -> 124 frames and
                             the RESULT line must not move.  It did not.

node --test games/ddpdoj/tests/     89 pass, 0 fail, 0 SKIPPED   (was 77)
python .../pgm.py flyaround         DIGEST c752ac4c...  0 DIVERGENT  (UNMOVED)
python .../pgm.py flyaround --reuse --break clamp-first | no-phase-mask   RED
node tools/bundlegate.mjs           15955968/15955968 = 100.0000%   (UNMOVED)
python .../pgm.py demogate          15955968/15955968 = 100.0000%   (UNMOVED)
node tools/webgate.mjs              PASS, 11 files                  (UNMOVED)
```

So: **the ship can now FIRE, and what it fires is verified against the board to
the byte.** What it still cannot do is *draw* the shot — see §7.

---

## 1. What the chain actually turned out to be

Wave 5 sized the chain from the outside and got two of its seven items wrong in
the direction that mattered — one much cheaper than it looked, one much dearer.

**Item 2 was cheap.** Wave 5: *"a shot handler ends in the sprite ENQUEUE
(`$253B1E: jmp $23F3AE`), pulling in the request pipeline = main-loop call #4
(`$23D2AE`)."* It does not. `$23F3AE` is **fourteen instructions** that append
ONE 12-byte record to ONE bucket:

```
23f3ae: lea $808854,A0 / adda.w $80afd6,A0 / addi.w #$c,$80afd6
23f3c2: lea ($2,A6),A1
23f3c6: move.l (A1)+,D0 / swap D0 / add.w (A1)+,D0 / swap D0 / add.w (A1)+,D0
23f3d0: asr.l #6,D0 / andi.l #$07ff03ff,D0 / ori.l #$80008000,D0
23f3de: move.l D0,(A0)+ / move.l (A1)+,(A0)+ / move.w (A1)+,(A0)+
23f3e4: move.w ($1c,A6),(A0)+ / rts
```

The only thing it needs from call #4 is that something zeroes `$80AFD6` once a
frame, which is **one dbra loop at the very tail of `$23D2AE`**:

```
23d70c: lea $80afc0,A0 / moveq #$0,D1 / move.w #$1d,D0
23d718: move.w D1,(A0)+ / dbra D0,$23d718      <- $80AFC0..$80AFFB, 30 words
```

(There is a second, bigger clear at `$23D1F2` that names each counter
individually. Its only absolute-long caller is `$23BF44`, outside the loop, and
a from-scratch scan of every `bsr` in `$200000-$2A0000` finds none targeting it
— so the per-frame reset is the dbra loop, not that one.) `src/spritequeue.js`
ports both, and nothing else of call #4.

**`$23F3AE`'s `asr.l #6` is across the PAIR, not per field.** It shifts the
packed `(y,x)` longword once, so the low six bits of Y land in the top of the X
word and are then masked off by `$03FF`. Translating it as two separate shifts
gives the same answer today and a different one the first time the masks change;
it is ported as the one 32-bit shift it is, and pinned by a test.

**Item 5 was dearer.** The blocker is not the five enemy handlers. It is the
COLLISION: `$245044 bset #$7,(-$3,A6)` sets bit 7 of a shot record's low byte
and `$24504E sub.w D4,($14,A6)` takes the enemy's damage out of the record's
`+$18`, and **the bit is sticky**. Every shot that hits anything is thereafter
driven by a branch the port cannot take. §4 is how the scenario deals with that.

## 2. WHAT IS PORTED

```
games/ddpdoj/src/
  rom.js          ROM WINDOWS: the port reads the cartridge the way the 68000
                  does, and a read outside every declared window is a LOUD
                  NAMED THROW carrying the address, never `undefined`
  rng.js          $2433AE -- and it is NOT a generator (see below)
  spritequeue.js  $23F3AE the ENQUEUE + $23D70C's counter reset
  shots.js        $249BFC the SPAWN, $24A222/$24A2D6 the record fillers, and
                  the four handlers $253B1E / $253BDA / $253E34 / $253EC6
  type5.js        $28B5E0 -- object dispatch entry [5], PARTIAL: ONE of its 23
                  subsystem calls, and the other 22 counted by name
  weapons.js      $253A70's driver, now dispatching to real handlers
  vectors.js      + $241D34, the shot's OWN vector routine
  player.js       the $249BE2 jump table now CALLS the spawn instead of throwing
```

**`$2433AE` IS NOT A PRNG.** It is `addq.b #1,$803917` — a BYTE increment that
wraps 255→0 without carrying into `$803916`'s high byte — then a lookup into 64
canned longwords at `$2433D0`. The whole state is one word, and it is SHARED:
`$289F54` bumps the same byte at `$289F62` before it does anything else. That is
why `rng` is a traced column (NOTES-replay.md constraint 2) and why it is
REPORTED rather than claimed (§5).

**`$241D34` is not `$241812`.** Both index the same `$200920` speed tables, but
the shot's routine folds with a DIFFERENT table (`$241AF4`, indexed by the WHOLE
angle byte at word stride 1, not by `angle & $3f` at stride 4) and takes its
quadrant from `angle & $C0` used as a raw byte offset into `$40`-byte slots —
bits 7..6, not 5..4. The shot templates carry angles like `$FF` and `$01`, which
`$241812`'s `& $3f` would put in entirely different quadrants.

**THE THREE RECORD FILLERS ARE NOT ALL THE SAME, and that cost a run.**
`$24A222` and `$24A27C` are byte-for-byte identical (90 bytes, diffed against
the image). `$24A2D6` — the one the SECONDARY spawn calls — shares the first 86
and then, where the other two `rts`, carries four more instructions:

```
24a32e: subq.w #4,($44,A6) / bcc $24a33a / move.w #$4,($44,A6) / rts
```

So `($44,A6)` cycles 4,0,4,0 once per secondary spawn and is the value the NEXT
spawn copies into the new record's `($24,A6)`. Treating the three as one routine
leaves it frozen: **`p44` was the first column to diverge and it took the two
record dumps and the sprite-request containment down with it.** An objhunt on
`$81042A` named `$24A32E`/`$24A334` as its only per-frame writers. The fix has a
permanent red half, `--break no-secondary-tail`.

**`$81308C = $0001`, and that is load-bearing.** `$249C6C` would cap the
free-slot scan at four slots only when it is zero, which it is not — so the scan
is FIVE slots each and the player's own spawn can reach slots **14..18 and
21..25**, not 14..17/21..24. Every run prints the value; the gate compares
exactly those ten records.

## 3. THE ROM WINDOWS, and why they are windows

Wave 4 exported hand-picked tables as JSON arrays. The shot spawn does not read
tables — `$24A222` copies a 38-byte RECORD TEMPLATE and three of its fields are
POINTERS the handlers then follow (`$24A236 movea.l (A1)+,A2`, then `($1e,A6)`,
then the `($26,A6)`-indexed tables at `$24DDD6`/`$24DEB2`/`$24FC8E`/`$25014C`).
Naming each of those as its own array means deciding in the exporter how long
each one is — a guess dressed as a schema.

So `tools/export-tables.py` declares **14 ROM WINDOWS (9,584 bytes)**, each
cited by the instruction that reads inside it, and `src/rom.js` throws by
address on anything else. **That check is not decoration: it fired four times
during this wave**, each time naming an address I had not measured —

```
$25523C   the shot-count word behind $8127E4          -> new window $255200
speed 68  an OPTION POD's template ($24D2FC/$24D35C)  -> two more pointer tables
$24F650   a pod template's ($1e,A6) anim table        -> window widened
$24E28C   a $25551A template past the window's end    -> caught by the EXPORTER
```

Two other measurements fell out of it:

* **The `$200920` speed table has exactly 256 levels, not "at least 64".** Wave
  4's 64 was its own `SCAN_CAP`; re-scanning with the cap at 512 shows the
  `$200D20 + $208*s` pattern holding for exactly 256 and the three longs after
  it zero. The exporter now asserts BOTH halves (it fails if the pattern still
  holds at the cap). It exports a DERIVED SET of 46 levels — the player's 0..31
  plus every `($1a,A6)` byte in a reachable spawn template — because all 256
  quadrant tables would be 133 KiB of JSON for levels nothing reads, and the
  port throws by name on any level outside the set.
* **The per-power tables are five longs at a TWO-byte stride** (`$249C48
  move.w ($20,A6),D0 / add.w D0,D0 / movea.l (A1,D0.w),A1`), so the power word
  must be even — 0,2,4,6,8 — exactly the trap wave 4 found on the ship selector.

## 4. THE SCENARIO, and the two conditions that decide its window

`stage1-shot` (new, permanent): the fly-around seeded boot and the same
`$810424=FF` invulnerability intervention, but the ship FIRES — single-frame taps
of Button 1 every 20 logic frames.

**Taps, never a hold.** Holding Button 1 starts the laser speed ramp 22→12,
which lives in the OPTION object (`$24C8BE`, A6 = the option record) and is
unported, so a hold would go red on `pspd` for a reason that has nothing to do
with the shot.

**The compared window was CHOSEN BY MEASUREMENT, on two conditions.** The first
is the obvious one: `$245044`'s per-frame execution count over the ten compared
records is the column `hitex`, and the gate FAILS on any non-zero value inside
the window. The second is the one that is easy to miss and cost me three runs:
**the hit bit is STICKY**, so a record hit BEFORE the seed carries it in and the
port throws on frame one. The seed is therefore the earliest frame at which
every record in the 36-slot table has bit 7 clear AND no later frame sets it on
a compared record:

```
longest hit-free stretch ignoring the sticky bit   871 frames (3702..4572) -- THROWS
longest with the sticky-bit condition              126 frames (4447..4572)
                                                   ...seed 4447 -> 125 compared
runner-up                                          108 frames (4153..4260)
```

125 frames is short and I am not going to dress it up. What it contains is
counted: **18 primary + 18 secondary spawns, 0..6 live player records per frame
(mean 3.6, zero on some), 574 sprite requests**, and vertical movement across
`py` 4473..24153 so the `$253B2C` "carry the one-frame-old shot by the ship's own
velocity" path is exercised.

**Movement is vertical only inside the window, and that is a named gap.**
`$813176` — the background's per-frame horizontal scroll delta, subtracted from
every live shot at `$253AA6` — is written by `$26151E` (`D2 = (this frame's
scroll in whole pixels − last frame's) << 6`) inside the unported background
object. MEASURED: it is 0 on 2,559 of the 2,600 frames of `stage1-open` and
non-zero only while the ship crosses the screen horizontally (lf2121..2153 and
lf2292..2300). It is a COMPARED column, so **the scroll-compensated path of the
shot driver is visibly untested and cannot quietly become tested.**

Two other interventions were tried and are recorded because they failed:
poking `$81308C` to 0 (to take `$28B670`'s other branch and skip the collision
entirely) left `hitex` at 385 — `$28B730` reaches the collision too; and pinning
the ship at the left wall only cut hits from 693 to 135.

## 5. WHAT THE GATE DOES NOT CLAIM, and why each one

Three carve-outs, all counted and printed on every run.

1. **`nshot` (`$81295C`) is REPORTED, not claimed.** `$253A7C`/`$253AA0` count
   the WHOLE 36-slot table, and slots 0..12 are the OPTION PODS' shots, created
   by `$24D484` (reached from `$24C096`, one of the 22 unported calls in type 5).
   The board keeps creating records the port cannot create. MEASURED drift: 106
   of 125 frames, largest gap 6. **This is not a technicality**: `$81295C` is
   read by the frame-sync governor `$23C272`, so a wrong count can change WHEN a
   frame is armed — and `irq6`, which IS claimed, is what would catch that. It
   stayed green.
2. **`rng` (`$803916`) is REPORTED, not claimed.** In the non-hit path the four
   translated handlers never draw, so the port advances the counter on exactly
   zero frames while the board's other subsystems draw whenever they like.
   MEASURED: first apart at lf4480, largest gap 48.
3. **The sprite-request bucket is compared by CONTAINMENT, not equality.** The
   pods' shots land in the same bucket and BEFORE the player's (the driver walks
   slot 0 upwards), so equality would be red for a reason that is not a bug. The
   claim made instead is falsifiable and was falsified on demand: *every 12-byte
   record the port emitted appears verbatim in the board's own bucket for that
   frame* — 574 of 574, and `--break enqueue-off-by-one` takes it to 0 of 574
   **while leaving all 52 columns green**, which is the proof that it is an
   independent check and not a restatement of the record comparison.

`hitex` is narrowed to the ten compared records; the wider `hitany` over the
whole table is REPORTED (7 hits on 7 frames in this window, all on pod shots,
touching no compared byte). The narrowing is visible rather than assumed
harmless.

## 6. LOUD NAMED THROWS — what is deliberately NOT translated

Each of these is reachable in principle and was left as a throw rather than an
unverified translation, because wave 6's lesson is that a rule no frame can see
is not verified by a green gate:

| ROM | what |
|---|---|
| `$253BDE` / `$253ECA` | THE HIT PATH. Only `$245044` sets its gate bit; needs the enemy port |
| `$254078` | THE LASER. `$249C3A` picks `$2554EA[1]`, whose templates carry type word `$8004` = dispatch entry [4], and **no frame in this project's corpus has ever run that handler** (wave 5's census found only nibbles 0,2,8,A because it only ever tapped the button) |
| `$249814` | THE BOMB, untouched since wave 5 |
| `$249CC8` | the `($5a,A6) == 4` formation branch; ($5a,A6) is 2 on every frame measured |
| `$249D2C` | the ship-2 spawn; `($58,A6)` is 0 on every frame of every run |
| `$249C0E` | the P2 spawn; no scenario has a second player |
| 12 of 16 | dispatch entries `$253C98 $253F56 $254136 $2541BC $254300 $25442A $253D52 $253FE8 $25427A $2543A4 $2544CE` — never executed by anything this project has run |
| 22 of 23 | object type 5's subsystem calls, counted per frame by name |

## 7. THE PAGE — half the banner changed, and only half

`index.html`'s banner said *"There are no weapons"*. That is now false, and
*"you can shoot"* would be worse. It now says exactly which half exists:

> **The SHOT is simulated but not drawn; there is no bomb, no laser and no
> sound.** Pressing fire really does run the ported spawn, the 36-slot shot
> driver and the sprite-request enqueue … **You will not SEE the shot**: this
> page replays a captured display list and only the ship's records are spliced
> into it, so a shot's sprite is simply absent.

**Why it is invisible, and what it would take.** `tools/export-web.mjs`'s
coverage argument (wave 7 §2) rests on `splice()` touching only position fields,
so the bundle contains exactly the 150 sprite streams the capture uses. A shot's
`offs` comes from its ROM template and is not one of them. Making the shot
visible means exporting the shot templates' streams and splicing whole records
rather than positions — wave 7's own §10 item 3 predicted precisely this and
said the coverage argument must then be re-derived. I did not do it; the bundle
gate, the demo gate and the fetch gate all still score 100.0000 %, and the page
grew from 363.2 to 375.9 KiB only because `player.tables.json` grew.

## 8. Oracle changes

* `frame.lua`: `PROBE_RAWDUMP` (extra columns, each a hex dump of a RAM range at
  the sample point) and `PROBE_EXEC` (extra columns, each the per-LOGIC-FRAME
  execution count of one instruction, hooked with a WRITE tap over the range it
  writes — a write tap is the reliable 68000 execution hook). Both opt-in and
  inert without their env var.
* `pgm.py`: `shotgate`, plus `w8_rawdump()`/`w8_exec()` which read the specs OUT
  OF `src/state.js` so the two sides of the comparison cannot drift, plus
  EXPECTED-GREEN mutation handling read out of `tools/breakage.mjs`.
* `scenarios.json`: `stage1-shot`, with its window's two conditions in its own
  `why`.

## 9. What I could not do, and why

1. **The window is 125 frames, not 1,800.** §4. The binding constraint is the
   shot-vs-enemy collision, which is the enemy port, which is still blocked.
2. **The five enemy handlers are still untranslated** (`$2688CC $268232
   $26A2E2 $269CEA $275914`), and so is the enemy driver's dispatch. Untouched
   this wave.
3. **The OPTION object is still unported** — and it is now the top of the work
   list rather than a footnote, because it is what caps `nshot`, the containment
   check and the window length all at once.
4. **The score and chain words are still not located.** Wave 5 said it would not
   name a plausible address and neither will I. I did not look for them.
5. **The hitbox is still unmeasured** — but this wave walked into its neighbour
   and can hand over a better lead than wave 4's: `$245008` reads the SHOT
   record's half-extents as `($10,A6)`/`($12,A6)` with **A6 = record + 4**, i.e.
   record `+$14`/`+$16`, and `$24504E` subtracts the enemy's `($16,A5)` from
   record `+$18`. Both fields are in the ten records the gate already dumps.
6. **`$25523C`'s meaning is measured but not explained**: the word is 4 and it
   is the free-slot scan length; what writes `$8127E4` and when, I did not chase.
7. **I did not re-run the whole `pgm.py check`.** I ran: the unit suite,
   `shotgate` fresh + four mutations, `flyaround` fresh + two mutations,
   `bundlegate`, `demogate`, `webgate`, `export-tables --verify`, and `gate`.
8. **`04-review.md` / `05-review.md` leftovers are still leftover** (the
   `memmoveDown` zero-length case, the `$813176` hoist in `enemies.js`, the
   `$815E9C` attribution in `NOTES-machine.md`, the unlabelled per-call cycle
   costs). Untouched again.
9. **One thing I could not explain and am recording rather than burying.**
   Outside the chosen window, at lf3721, the board's freshly spawned slot-14
   record reads `$80C0` with `+$18 = $D024` where the template says `$8000` /
   `$0034` — while `PROBE_EXEC` on `$245044` AND on `$24504E`, both verified
   against an independent objhunt (37 vs 39 hits) and both correct on every
   OTHER frame (their per-frame counts line up exactly with the frames on which
   `+$18` changes), report ZERO for that frame. `$24A244`'s own write tap
   reports `data=0034` with `A1 = $24DA3A`, and no ROM address in the image holds
   the bytes `01 80 D0 24`. I could not reconcile it in the time I had. It does
   not affect the committed window (which is chosen to contain no flagged
   record at all) but **it means one of the two instruments is lying on that
   frame, and a future wave should find out which before trusting `hitex` as
   anything more than a conservative gate.**

## 10. If someone picks this up cold

```
python games/ddpdoj/tools/export-tables.py               regenerate rip/port/
python games/ddpdoj/tools/oracle/pgm.py shotgate         THE SHOT GATE (52 cols)
python .../pgm.py shotgate --reuse --break no-secondary-tail | enqueue-off-by-one
                                    | no-anim-step | no-live-count
python games/ddpdoj/tools/oracle/pgm.py flyaround        UNMOVED (34 cols)
node --test games/ddpdoj/tests/                          89 pass, 0 skipped
python games/ddpdoj/tools/oracle/xref.py dasm 249BFC 200 the spawn
python games/ddpdoj/tools/oracle/xref.py dasm 253B1E 200 handlers [0] and [8]
python games/ddpdoj/tools/oracle/xref.py dasm 23F3AE 60  the enqueue
```

**THE WORK LIST, in the order the measurements now support:**

1. **THE OPTION OBJECT** (`$24C096` → `$24C310`/`$24C33E`/`$24C384`/`$24D130`,
   and its shot spawn `$24D484` into slots 0..12). It is the single item that
   unblocks the most: `nshot` becomes claimable, the sprite-request check
   becomes an equality, and wave 4's named gap #1 closes.
2. **THE BACKGROUND'S SCROLL** — specifically `$2614C0..$26152A`, which writes
   `$81316A`/`$81316E`/`$813170..$813178`. `$813176` is what makes horizontal
   movement impossible inside a shot window today. It needs the object that owns
   `($28,A5)`.
3. **THE COLLISION** `$244D62 → $245044/$24504E`, which needs the enemy records.
   Until it exists no shot window can be longer than the gaps between hits, and
   §9.9 must be settled first.
4. **THE LASER** `$254078`, then the BOMB `$249814`. Both are named throws with
   their addresses; the laser's spawn is already translated (the templates are
   exported), only its handler is missing.
5. The five enemy handlers, unchanged from wave 5.
6. The score/chain words, still not located by anyone.

**Five things that will save you the hours they cost me:**

1. **The hit bit is STICKY and it is set at `$245044`, one instruction.** Any
   window you choose must start on a frame where NO record in the 36-slot table
   carries it, not merely a frame where nothing is hit.
2. **`$24A2D6` is not `$24A222`.** Four extra instructions, one player field,
   and it silently corrupts every second shot's animation if you miss them.
3. **`bset #$0,(A6)` on a memory operand is a BYTE op**, so it touches the type
   word's HIGH byte, while `ori.w #$8,(A6)` two instructions later touches the
   LOW one. Three separate bits live in that word and they are set by three
   different-sized instructions.
4. **`$81308C` is 1, not 0**, and it decides whether the free-slot scan is four
   slots or five. Every run prints it; read it before assuming a slot range.
5. **A ROM window that throws by address is worth more than a JSON table.** It
   found four tables I had not measured, in four runs, each with the address in
   the message. If you add a table, add a window and let it fail.
