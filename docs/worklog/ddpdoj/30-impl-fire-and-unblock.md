# W30 — IMPL: unblock `fly-around` (`$275914`), then wire the handler FIRE path

status: **IN PROGRESS**
wave: 30. role: IMPLEMENTER (sole writer to `games/ddpdoj/`).
date: 2026-08-04.
target: `ddpdojblk` VERSION-B (2002.10.07 BLACK VER). Every address is build B
unless noted.

## THE BRIEF

A. Port `$275914` (enemy handler, type `$85`) and whatever it needs, so the
   `fly-around` gate scenario runs to completion instead of being BLOCKED at
   logic frame 2346 by the loud named throw W29 left. The DaiOuJou gate is red
   because of this, and that blocks publishing.
B. Then wire the handler FIRE path (W29 §5.1) so bullets actually spawn from
   live enemies — the thing that finally makes W27's 37 bullet behaviour bodies
   execute anywhere but their own unit test.

Expect divergence. Report the FIRST divergent field per scenario with its logic
frame. Never a frame count, never a percentage.

## 1. `$275914`, READ OUT OF THE ROM — THE COMPLETE ENUMERATION

`python tools/oracle/w27disasm.py 275914 275C20` from `games/ddpdoj/`, over
`tools/oracle/out/maincpu.bin` (the decrypted build-B image, address == offset).

**THE SPAN.** `$275914..$275BAA`, and the end is decided by control flow, not by
the sweep: `$275BA6 jmp $263762.l` (free the enemy) is the last instruction of
the death arm, `$275BAC` is a `nop` pad, and `$275BAE` is a DIFFERENT routine —
`move.w #$1,$4(A5) / rts`, which is **type `$86`'s init stub**, falling through
at `$275BB6` into type `$86`'s init BODY. I read past the apparent end in both
directions and this is where it stops.

**TWO TYPES SHARE THIS HANDLER.** Read straight out of the type table
(`$27E412 + (t-$80)*8`):

| type | init | handler |
|---|---|---|
| `$85` | `$275812` | **`$275914`** |
| `$86` | `$275BAE` | **`$275914`** |

and the handler's own death arm branches on it: `$275AFC cmpi.b #$86,$c(A5)`.
Stage 1's script contains 2 records of `$85` and none of `$86` (W28 §L10), but
the type byte test is transcribed rather than folded away.

### 1.1 EVERY `jsr`/`jmp` TARGET IN THE BODY, AND ITS DISPOSITION

| site | target | what it is (from the listing) | disposition |
|---|---|---|---|
| `$275914` | `$2638A6` | the movement interpreter | **PORTED** (W24 `stepMovement`) |
| `$27591A` | `$2426A4` | an off-screen test, 8 instructions | **PORTED THIS WAVE** |
| `$275928`,`$275BA6` | `$263762` | free the enemy | **PORTED** (W23 `freeEnemy`) |
| `$27596A` | `$286096` | DAMAGE | note (as every other handler) |
| `$2759A6` | `$28AC72` | the SUB-RECORD spawn engine: walks a script at `+$44(A5)`, and when `$18(A6)` (HP) crosses each threshold spawns into the pool `$81DB90` (10 slots x `$26`) — type-5 call #3's second pool | note |
| `$2759FE` | `$24203E` | aim64 CORE | **PORTED** (W20 `aim64`) |
| `$275A08` | `$242190` | the one-step slew | **PORTED** (W20 `slew64`) |
| `$275A24` | `$23D852` | the per-record enqueue stub, **bucket 7** (`$807450`/`$80AFC8`) | **PORTED** (W11 `enqueueRequest`) |
| `$275A46` | `$23DF86` | the register enqueue, **bucket 7** | **PORTED** (W11 `enqueueRegisters`) |
| `$275A84` | `$23DF58` | the register enqueue, **bucket 3** (`$80688C`/`$80AFC6`) | **PORTED** (W11 `enqueueRegisters`) |
| `$275AD0` | `$2813F0` | **A BULLET GENERATOR ENTRY** | **PORTED** (W21 `bullets.js` ENTRIES) |
| `$275AF4` | `$28615E` | explosion/score | note |
| `$275B06`,`$275B1A` | `$27E812` | spawns into the `$816B7A` pool (type-5 call #18's) | note |
| `$275B22`,`$275B4E`,`$275B76` | `$289004` | the sprite-EFFECT allocator | note |
| `$275BA0` | `$28C274` | death burst | note |

Two ROM tables are read: `$272DFA` (already in a declared window, 16 longs, the
aim-derived sprite table this type's init also reads) and **`$27327A`, a
32-entry longword MUZZLE table which was in NO declared window** — added this
wave. Extent pinned from the data: entries 0..31 are a clean circle
(`0500,0000` / `0040,03C0` / `FB80,0000` / `0040,FC40` at 0/8/16/24) and entry
32 (`$2732FA`) breaks the pattern, so the table is `$27327A..$2732F9`, `$80`
bytes, exactly what the index `((facing & $3E) * 2)` -> 0..`$7C` reaches.

### 1.2 SO `$275914` IS NOT A HALF-PORT

Of its 15 call sites, **11 resolve to code this project already has** and the
four that do not are the same four subsystems every other ported handler
already notes (`$286096`, `$28615E`, `$289004`, `$28C25A`-family) plus two new
ones named above. Nothing is smoothed: `$28AC72` not running means `+$44(A5)`
does not advance and the sub-record pool stays empty, and that is recorded here.

**IT ALSO CONTAINS A FIRE.** `$275AD0 jsr $2813F0` with D0 = `#$FFFF000D`
(speed bias `$FFFF`, kind `$D`), D1 = the facing word `$28(A5)`, D2 = the
position `$2(A6)`, D3 = the `$27327A` muzzle vector + `$F9000000`. Every one of
the four is computed IN THE HANDLER. Kind 13's spawn-init pointer
(`$2815C6[13]`) is `$2818AC` — the shared do-nothing epilogue — and its
template's `+$10` run-init word is `$0000`, so D4/D5 are not consumed.

## 2. A DEFECT FOUND WHILE READING — `$2747E8` in handler `$82`

`src/handlers.js` (W25) has, for type `$82`:

```
ram.setU32(a5 + R.sprite22, ram.u32(a6 + 0x02));     // move.l $2(A6),$22(A6)
```

The comment is right and the code is wrong. `$2747E8` is `2D6E 0002 0022`, and
bits 11..9 = `110` with mode `101` make the DESTINATION `($22,A6)`, not
`($22,A5)`. So the port wrote the position into the wrong record and never
wrote it into the right one. `$275914` has the identical instruction at
`$275936`, which is how it was found. Fixed; see §4 for the mutation that
pins it.

## LOG (appended as findings arrive)

- opened; read `$275914` in full out of the ROM (§1).
- found and fixed the `$2747E8` destination-register defect (§2).
