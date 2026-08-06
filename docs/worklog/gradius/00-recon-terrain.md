# RECON 5/5 - terrain streaming, the $85F1 packet producer, the double-rate deviation
status: DONE
wave: 0   role: recon   started: 2026-07-31

READER. No file under `games/*/src/` was touched. New files: this worklog,
`games/gradius/tools/oracle/queue.lua`, `games/gradius/tools/oracle/queue.py`.

## The task, as I understood it

1. VERIFY (not trust) the recorded diagnosis of knownFail
   `terrain-streams-at-double-rate`.
2. Answer what `$85F1` actually is and what the canned packet format is.
3. Name the smallest correct fix for `$58` and `$57`.
4. Map `$9F55` terrain collision and what stage-1 scenery can kill the player.

## Commands

```
python games/gradius/tools/nesdis.py "Gradius (USA).nes" --out <scratch>/prg.asm
python games/gradius/tools/oracle/queue.py --frames 700 \
       --script "200:,10:S,490:" --from 566 --to 578 --packets
python games/gradius/tools/oracle/queue.py --frames 700 \
       --script "200:,10:S,490:" --from 566 --to 578 --neuter starve
```

---

## What I MEASURED

### 1. The diagnosis is CORRECT, but it names the wrong routine

`$0E` at `$9D83` (the streamer gate), 700 game frames, script `200:,10:S,490:`:

```
$0E at $9D83 on frames that BUILT     : {0: 13}
$0E at $9D83 on frames that did NOT   : {8: 3, 14: 6, 39: 4}
builds per frame histogram (mode-5 played): {0: 196, 1: 195}
```

So the gate `$9D87 LDA $0E / CMP #$04 / BCC` really is the throttle, the
cartridge really sees 8 / 14 / 39 bytes, and the split is exactly 196 / 195 -
every other frame. **That part of the knownFail note is confirmed.**

`$000E` write census (Mesen reports the PC AFTER the storing instruction):

```
  $864D  2447    STX $0E at $864B -- the queue append primitive
  $8A7D   700    STA $0E at $8A7B -- the drainer $8A51 zeroing it, once per frame
  $9F4F   140    STX $0E at $9F4D -- the terrain streamer, after its 5 packets
  $8914   100    STX $0E at $8912 -- st_88F6, the score refresh
  $883F     3    the stage load
  $802E     1    RESET
```

### 2. What actually throttles it: `$9AC7 JSR $8898`, seven bytes before `$9ACE`

The producer is not reached "somewhere inside the mode-5 handler". It is one
`JSR` above the streamer's own:

```
9AC4  20 45 9C  JSR $9C45
9AC7  20 98 88  JSR $8898     <-- THE HUD TICK
9ACA  A5 5B     LDA $5B
9ACC  D0 03     BNE $9AD1
9ACE  20 83 9D  JSR $9D83     <-- the terrain streamer
```

```
8898  A5 0E     LDA $0E
889A  C9 04     CMP #$04
889C  90 01     BCC $889F
889E  60        RTS               ; the SAME queue gate the streamer uses
889F  A5 02     LDA $02           ; the frame counter ($80BE INC $02)
88A1  4A        LSR A
88A2  90 FA     BCC $889E         ; <<<< runs only when $02 is ODD
88A4  E6 48     INC $48
88A6  A5 48     LDA $48
88A8  29 03     AND #$03          ; 4-phase rotation
88AA  20 E4 83  JSR $83E4         ; inline jump table jt_88AD
```

Measured with exec hooks on `$8898` (entry) and `$88A4` (past both gates):

```
$8898 entered=390  passed both gates=195  (on $02 even=0, odd=195)
```

**Zero on even, 195 on odd, 0 exceptions.** The alternation is `bit 0 of $02`,
not an emergent property of queue occupancy. `jt_88AD` is
`[0]=st_88B6 [1]=st_88F6 [2]=st_89E3 [3]=st_892C [4]=st_A960`; `AND #$03` means
entry 4 is unreachable from here.

Byte cost of each phase, measured as the queue image at `$9D83`:

| `$48 & 3` | routine | packets | bytes in `$0700` |
|---|---|---|---|
| 0 | `st_88B6` ($88B8) | `$11` + 3 patched digits | **8** |
| 1 | `st_88F6` | `$12` + 6 score digits + `$30` + `$FF` | **14** |
| 2 | `st_89E3` + `loc_8A30` | `$0F`,`$15`,`$16`,`$17`,`$18`,`$1B`,`$FF`,`$1A` | **39** |
| 3 | `st_892C` | `$13`+`$18` + digits | **14** |

The literal `$0700` images at the gate (`queueDumps` in the probe JSON):

```
f572 n= 8  01 23 A2 00 61 00 33 FF
f574 n=14  01 23 B4 64 65 00 30 30 35 30 30 30 30 FF
f576 n=39  01 23 84 09 0A 0B 0C 0D 0E 0F 10 11 12 13 14 15 16 17 18 19 1A 1B 1C
           1D 62 63 1F FF 01 23 F8 00 00 00 00 00 00 00 FF
f578 n=14  01 23 A8 31 66 00 30 30 30 30 30 30 30 FF
f57{1,3,5,7} n=0   <- the frames the terrain streamer gets
```

### 3. `$85F1` IS NOT A ROUTINE - it is a `JSR` operand byte

```
85E8  48        PHA
85E9  A9 02     LDA #$02
85EB  85 9B     STA $9B
85ED  A9 01     LDA #$01
85EF  20 45 86  JSR $8645      <- $85EF $85F0 $85F1 are ONE instruction
85F2  68        PLA
85F3  85 9A     STA $9A        <- FALL-THROUGH, not a call
```

`$85F1` is the third byte of that `JSR`, and it is also the return address the
`JSR` pushes (`PC-1` = `$85EF+2`). Anything that attributes a call to `$85F1`
is reading a stack frame, not a routine entry. The producer is **`$85E8`, a
five-instruction prologue that appends the queue mode byte `$01` and then falls
through into `$85F3`**, the canned-packet copier. This is trap #2's fall-through
in its mildest form (docs/knowledge/02): the label is real, the boundary is not.

### 4. The canned packet format - decoded from PRG, checked against the cartridge

`$85F3`: `STA $9A / ASL A / TAX`, pointer from the **39-entry word table at
`$864E`**, then copy bytes into `$0700,X` until a control code:

| byte | effect |
|---|---|
| `$FF` | end, append nothing (`$860A -> $864B STX $0E / RTS`) |
| `$FE` | append `$FF` (packet terminator) and end (`$8629`) |
| `$FD` | append `$FF`, `$9B := 2`, append `$01` (a fresh mode byte), keep going (`$862D`) - this is how one index emits TWO packets |
| else | copied verbatim |

and, **when bit 7 of the index is set** (`$8617 LDA $9A / BPL`), everything after
the first two copied bytes is replaced by `$00` (`$861B`-`$8622`, counted down in
`$9B`) - the "erase this text" variant of the same packet. Note `$85F5 ASL A`
is 8-bit, so bit 7 is lost from the table lookup and survives only in `$9A`:
index `$80|n` and index `n` share a pointer.

The wire format in `$0700` is therefore `[mode][addrHi][addrLo][data…][$FF]`,
which agrees with `src/vram.js`.

Independent check - decode `$864E` in Python, compare against the `$0E` deltas
the cartridge produced:

```
  idx  ptr    decoded bytes                                len  measured
  $0F  $8732  23 84 09 0A 0B 0C                              6  [6]
  $11  $8739  23 A2 00 00 00 00 FF                           7  [7]
  $12  $8740  23 B4 64 65 00                                 5  [5]
  $13  $8746  23 A8 31 66 00                                 5  [5]
  $15  $8752  0D 0E 0F 10                                    4  [4]
  $16  $8757  11 12 13 14                                    4  [4]
  $17  $875C  15 16 17 18                                    4  [4]
  $18  $8761  19 1A 1B 1C                                    4  [4]
  $1A  $8770  23 F8 00 00 00 00 00 00 00 FF                 10  [10]
  $1B  $876B  1D 62 63 1F                                    4  [4]
[PASS] $864E decode length == measured $0E delta (15 pairs, 0 wrong)
```

**Seen red.** Shifting `PKT_TABLE` by one entry (`$8650`):

```
[FAIL] ... (15 producer/index pairs, 4 wrong)
```

Honest caveat: only 4 of 10 went red, because six of stage 1's packets are
4 bytes long and so are their neighbours in the table. The check is not vacuous
but it is *weak*; a byte-for-byte comparison of the decoded packet against the
`queueDumps` image would be stronger and is a unit of work below.

### 5. The negative control: starve the gate and the cartridge becomes the port

`--neuter starve` forces `$0E = 0` at `$9D83`, i.e. gives the cartridge the
port's empty queue:

| | baseline | `starve` |
|---|---|---|
| gate passes (`$9D8E` via `$9D83`) | 195 / 391 played frames | **390 / 391** |
| `$0E` at the gate on frames that built | `{0: 13}` | `{0:6, 8:1, 14:4, 39:2}` |
| builds/frame histogram (mode-5) | `{0:196, 1:195}` | `{0:1, 1:390}` |
| **blocks actually emitted (`$0E` writes at `$9F4F`)** | **140** | **140** |

Two things fall out, and the second was a surprise:

* The `$0E` gate **is** the throttle. Defeating it doubles the rate. This is an
  intervention, not a correlation.
* **The number of blocks emitted does not change at all.** 140 either way.
  Once `$58 != 0` the streamer is inside a half-page and every gate pass emits;
  at `$58 == 0` the *other* throttle (`$9D96`, the 384 px lead, `INC $57`) holds
  it until the camera catches up. So the port emits the same blocks in the same
  order - it emits them in **bursts of 28 at one per frame** where the cartridge
  emits them **at one per two frames**, and then idles longer. The deviation is
  a phase error in `$54/$55/$57/$58/$0E`, not a content error in VRAM.

### 6. `$9D8E` writes `$57`, and the port has no `$57` at all

```
9D8E  A9 00 85 57   LDA #$00 / STA $57     cleared on EVERY gate pass
9D92  A5 58 D0 1C   LDA $58 / BNE $9DB2    mid-half-page -> always build
9D96  A5 54 38 E5 3E 85 98    $98 := $54 - $3E
9D9D  A5 55 E5 3F   A := $55 - $3F (with borrow)
9DA1  30 0F         BMI $9DB2              <-- NEGATIVE lead -> BUILD
9DA3  C9 01 90 0B   CMP #$01 / BCC $9DB2   <-- lead < $0100 -> build
9DA7  D0 06         BNE $9DAF              <-- lead >= $0200 -> throttle
9DA9  A5 98 C9 80 90 03   lead low < $80 -> build
9DAF  E6 57 60      INC $57 / RTS
```

`$57` is therefore a *result* flag: 0 = this frame built (or is mid-half-page),
1 = throttled by the 384 px lead. `src/terrain.js` models the lead test but
never materialises `$57`, which is why `w_0057` is in the knownFail list.

**A second, latent deviation in the same five lines, not previously recorded:**
`src/terrain.js` computes `lead = (build - cam) & 0xFFFF` and returns false when
`lead >= 0x0180`. The ROM's `BMI $9DB2` builds whenever the 16-bit difference is
*negative* - i.e. `lead >= 0x8000` in unsigned terms - where the port refuses.
It is unreachable while the build cursor stays ahead of the camera, so it has
never fired; it is still a wrong translation of `$9DA1`.

### 7. `$3A` characterised (it was "named but not characterised")

Static: `$3A` is written in exactly three places - `$96D7` and `$97E1`
(`STA $3A` with A = 0, both in stage init) and `$993D` (`INC $3A`, in the
stage-end block that also does `INC $19` and `STA $3F` = 0). So **`$3A` is the
stage-advance latch: raised when the camera reaches the end page, cleared by
the next stage's init**, and while it is up the streamer, the enemy spawner
(`$A2C0`) and `$C42D`/`$C68A`/`$C6B1` all stand down. Measured: `$3A == 0` on
**700 of 700** frames of the boot-and-play run - it never rises during stage 1.

`$5B` is *not* characterised: eleven `INC $5B` sites scattered through the state
machine, three readers (`$9A9C`, `$9ACA`, `$AEDD`). Left open.

### 8. `$9F55` terrain collision and what kills you on stage 1

The write side is exactly as `NOTES-terrain.md` 5 describes and I did not
re-derive it. What was **not** on record is the read-to-death path, and it is:

```
969D  JSR $C0C7   (the collision subsystem, from the mode-5 handler)
 ...
C2A5  LDA $19 / CMP #$02 / BEQ $C2B0 / CMP #$04 / BNE $C2B5 / RTS
      stage index 4 (stage 5): terrain collision SKIPPED WHOLESALE  <- second
      corroboration of $9F4F's CPY #$04, from the reader's side
      stage index 2 (stage 3): the PLAYER is checked on odd $02 frames only
C2B5  LDA $0100 / CMP #$02 / BCS $C2C4        not while already dying
C2BC  JSR $C3A3      player $0360/$0320 -> $C3D3 -> A = the 2-bit field
C2BF  BEQ $C2C4      zero -> alive
C2C1  JMP $C1D6      <<<< DEATH BY TERRAIN
C1D6  $4C=$78 (a 120-frame timer), $0100=2, $0160=0, $0140=0, $1B=$A0,
      JSR $EC1E #$F7 (the explosion sound)
```

`$C2C4` then re-runs `$C3AF` for slots 5..0 (the Options: a hit calls `$C0BD`)
and `$C2FF` for slots 9..0 of the `$0136/$0336/$0376` array (the player's shots:
a hit calls `$AEF8`, which is how bullets spark out on rock).

**Measured, with a ONE-BYTE intervention** (`tools/oracle/kill.py`). At frame
600 the ship is at X=80, Y=96; a Lua re-implementation of `$C3D3` says its cell
is page `$05`, index `$E3`, field shift 4. Three runs off the identical script:

```
mode=none  poke nothing        $C2C1: []      $1B == $A0 first at: None
mode=hit   poke $05E3 = $10    $C2C1: [601]   $1B == $A0 first at: 601
mode=miss  poke $05E4 = $FF    $C2C1: []      $1B == $A0 first at: None
[PASS] poking the cell $C3D3 computes makes $C2C1 (JMP $C1D6) fire
[PASS] poking one block row lower does NOT
[PASS] poking nothing does NOT
```

`$C1BF`, `$C24B`, `$C290` - the other three routes into `$C1D6` - did not fire
on any of the three runs, so the death is attributable to the terrain route and
not merely coincident with it. One 2-bit field set to 1 is enough. This is a
strictly stronger statement than `terrain.py --neuter solid` (fill all 512
bytes with `$FF`), and it simultaneously validates the index arithmetic:
a wrong index would have poked a cell the ROM never reads.

**What can kill you on stage 1**, expanded offline from the tables
(`tools/stage1map.py` + a census; ROM-derived, in `rip/`, not committed):

* Threshold `$9FB4[0] = $40`. Solid iff `tile >= $40`; the 2-bit field is then
  exactly 1, because every stage-1 tile below `$40` also has bits 6 and 7 clear.
  Confirmed by census: solid values are `$56…$FF` (dominated by `$DC`/`$DD`,
  288 each - the RLE fill-code 3 pair - then `$B5-$C4`), non-solid values are
  only `$00 $20-$27 $30 $33-$36 $3A-$3F`, i.e. the starfield and the black.
* **1378 solid tiles of 12544** across the stage.
* Per page, the solid 8-px tile rows (0..27, screen Y = row*8 − 20):

```
 page  0-3  screen 0   solid rows []                      <- 1024 px of nothing
 page  4    screen 1   [2,3, 21..27]
 page  5    screen 6   [2,3,4, 26,27]
 page  6    screen 2   [2,3, 18..21, 24..27]
 page  7    screen 3   [2,3, 20, 25,26,27]
 page  8    screen 4   [2,3,4, 18..27]
 page  9    screen 5   [2,3, 26,27]
 page 10    screen 6   [2,3,4, 26,27]
 page 11    screen 7   [2,3, 9..18, 26,27]                <- the mid-screen mass
 page 12    screen 8   [2,3, 21..27]
 page 13    screen 0   []                                 <- the boss page
```

So: a **ceiling** (rows 2-3, sometimes 4) and a **floor** (rows 21-27) from page
4 onwards, an **island at mid height on page 11**, and nothing at all before
world x = 1024 or on the boss page. Everything that kills you on stage 1 is
scenery; there is no separate hazard table.

### 9. Deviations found in `src/` by reading, on top of the known one

| where | the ROM | the port |
|---|---|---|
| `src/nmi.js` `$80B0` | `JSR $8641` appends **one `$00` byte** - the queue's mode-0 terminator - on every non-lag frame | comment says "HUD packets -- not ported". It is **not** a HUD producer; it is a one-line append, and its absence is why `w_000E` is short by exactly 1 on every frame |
| `src/nmi.js` `$9ACA` | `LDA $5B / BNE $9AD1` gates the streamer | absent; `streamBlock` is called unconditionally |
| `src/nmi.js` `$9AC7` | `JSR $8898`, the HUD tick, runs **before** the streamer and is the whole cause of the knownFail | absent |
| `src/terrain.js` gate | `$9D87 CMP #$04` on `$0E`, a BYTE cursor | `state.vram.queue.length >= 4`, a PACKET count. Same answer today only because both are 0 |
| `src/terrain.js` `$9D8E` | `LDA #$00 / STA $57` then `INC $57` at `$9DAF` | `state.build.ahead` is seeded and never written |
| `src/terrain.js` lead test | `$9DA1 BMI $9DB2` builds on a NEGATIVE 16-bit lead | `lead >= 0x0180` refuses; `lead` is unsigned so a negative lead reads as `>= $8000` and is refused |
| `src/terrain.js` / `$C3D3` | `CLC / ADC #$08 / ADC $3E` - the second ADC carries the first | both the port and my Lua drop the inner carry; only differs for screen X >= 248, which the player's `[16,240]` clamp forbids but `$C3AF`'s `+$0A` for type 1 does not |
| whole port | `$C0C7`/`$C2A5`/`$C3A3`/`$C1D6` | `probeCollision()` exists in `src/terrain.js` and **is never called by game code**. Nothing in the port can be killed by terrain |

### 10. The gate, as found (baseline, nothing changed)

```
node --test games/gradius/tests/       45 pass, 0 fail, 0 skipped
node games/gradius/tools/test-all.mjs  GREEN -- 5 passed, 0 failed, 0 SKIPPED
  16 scenarios, 3341 of 4184 frames compared, 0 failures
  [STILL BROKEN] terrain-streams-at-double-rate: 47 field/scenario pairs
      long-idle:w_000E@401 long-idle:w_0054@598 long-idle:w_0055@854
      long-idle:w_0057@571 long-idle:w_0058@572 idle:w_000E@401 (+41 more)
```

`w_000E` first diverges at frame **401 - the first compared frame** (the missing
`$8641` byte), while `w_0057`/`w_0058` first diverge at 571/572 (the first frame
the lead test lets a real block through). Two different causes inside one
annotation.

`node --test` also prints, for the nametable checks:
`f1200: differing rows [["nt0:row28",24],["nt0:row29",20]]` - rows 28 and 29
are the status bar, i.e. exactly the rows `$8898`'s four producers write. The
same omission shows up in the RAM comparison and in the VRAM comparison.

---

## What I could not do, and why
(see the returned object's openQuestions)

## Not resolved

* `$5B` (the `$9ACA` gate on the streamer) is still uncharacterised - eleven
  `INC $5B` sites, three readers. Measured 0 throughout stage 1's opening, so
  the missing gate in `src/nmi.js` is currently harmless, but "currently
  harmless" is not "understood".
* `jt_88AD` has FIVE entries; `$88A8 AND #$03` can only select four. `st_A960`
  is unreachable through `$8898`. I did not look for another dispatcher that
  uses the same table with a wider mask.
* The `$FD` control code (one canned index emitting two packets) and the
  bit-7 "blank" index variant are decoded from the listing and implemented in
  `queue.py`'s decoder, but **neither was exercised** by any packet stage 1
  uses. Both are untested paths.
* Whether the port's four HUD producers can be written without modelling the
  score/`$07E0-$07EA`, `$18`, `$20,X`, `$42`, `$46`. Seeding them from the
  cartridge's RAM would work for the current scenarios (nothing scores) but the
  first scenario that shoots something would expose it.
* The `$864E` table has 39 entries; stage 1's play path uses 10. The other 29
  are unmeasured.

## If someone picks this up cold
Run

```
python games/gradius/tools/oracle/queue.py --frames 700 \
       --script "200:,10:S,490:" --from 566 --to 578 --packets --timeline
python games/gradius/tools/oracle/queue.py --frames 700 \
       --script "200:,10:S,490:" --neuter starve
python games/gradius/tools/oracle/kill.py --at 600
```

Everything above is in those three outputs.
