# 104 -- IMPL: the boss's two remaining sprite emitters

status: **DONE.** (opened IN PROGRESS 2026-08-06, closed same day)

started: 2026-08-06. wave: 104. role: IMPL (boss-fight completion only).

## 0. THE HEADLINE

`[M]` **The boss fight runs clean from lf8500 to lf13500** (5000 frames, no
throw). The `$23E45A` throw at lf9443 that W103 left is gone, and no new boss-
fight throw appears within 5000 frames of the seeded rung. The next throw
would be stage 2's column stream, which is a different wave.

`[M]` **seedcmp: 0 BLOCKED segments** (was 6 after W103, 29 before). 29 green
/ 42 red / 0 blocked. The two previously-BLOCKED boss segments (lf9500..9750
and lf9750..10000) now RUN: the first is RED (a `s14t` divergence) and the
second is GREEN.

`[M]` **bosscoverage stays 103/0/8.** Sprite emitters are not scheduler
entries, so the count is unchanged, as expected.

`[M]` **All 1211 tests pass.**

## 1. WHAT WAS PORTED

Two sprite emitters in `src/bossarrival.js`:

- **`$23E36A`** -- the extent-scaled emit, BUCKET 1 (`$805104`/`$80AFC2`).
- **`$23E45A`** -- the extent-scaled emit, BUCKET 3 (`$80688C`/`$80AFC6`).

Both are instruction-for-instruction identical to `$23E3E2` (bucket 2, W96)
except for the two `lea <buffer>,A0 / adda.w <counter>,A0 / addi.w #$C,
<counter>` instructions that name the target buffer. The shared body was
extracted into `emitScaled(ram, rom, bucket, d1, d2, d3, d4, d6)` and the
three emitters are now thin wrappers around it.

The emitter table at `$2929E8` has eight entries, all of which resolve to one
of the three ported emitters:
```
  [0] $23E45A  [1] $23E45A  [2] $23E3E2  [3] $23E36A
  [4] $23E36A  [5] $23E36A  [6] $23E45A  [7] $23E45A
```

D 14's facing rotation drives `($4B,A6)`/`($8B,A6)` through ranges that
select each of the three, and the `objPart` dispatch (`$2929C8 lsr.b #$5`)
now resolves any of them rather than throwing.

## 2. WHAT CHANGED

- `src/bossarrival.js`: extracted `emitScaled` from `emit23E3E2`; added
  `emit23E36A` and `emit23E45A` wrappers; updated `objPart` to dispatch
  through an `EMITTER_BUCKET` map instead of checking for one address.
- `tests/w96boss.test.js`: the "untranscribed emitter throws" test became a
  "all three emitters dispatch to the right bucket" test, because all eight
  table entries now resolve to ported code.

No new files. No scheduler entries registered. No ROM windows added (the
emitters are CODE, not DATA; they were already in the image the whole time).

## 3. THE BOSS FIGHT END-TO-END

From rung 8500 the boss now runs **5000 frames** without hitting any unported
path. The fight sequence that executes during this window:

- F 6 rendezvous -> body sweep -> E 13 ladder -> hands to F 2
- F 2: MAIN 8 walk -> D 8/9 open hatches -> D 14 rotation (starts E 5/6/14,
  all three sprite buckets active) -> D 12/13 close -> D 15 sweep -> F 1
- F 1: four-state gun program -> hands to F 3
- F 3: MAIN 3 walk -> D 16/17 open -> E 8 carriers spawn and die -> D 18/19
  close -> F 6 (loop)

The boss then loops F 6 -> F 2 -> F 3 indefinitely. At lf13500 (5000 frames
past the rung) the port is still running clean. The stage-end timeout (at
~lf19,217) or a boss kill would end the fight; both paths are ported.

## 4. HONEST DIVERGENCES

1. **`vf` at lf8227 and lf9414** (pre-existing from W103): 1-frame,
   1-column differences in the velocity-force field.
2. **`s14t` at lf9581** (new, was BLOCKED): the stage-1 script trigger
   diverges by 128 at lf9581. This is in the lf9500..9750 segment that was
   previously BLOCKED on `$23E45A`. Now that the sprite emitter is ported,
   the segment runs and the divergence is visible. Likely a sprite-count or
   timing side effect of the bucket-1/3 emission D 14's rotation newly
   activates.

## 5. WHAT I COULD NOT MAKE FAIL

Same as W103: the phantom-registration sub-check (the port has zero phantom
registrations).

## 6. PREMISE CHECKS

1. **"Port `$23E45A` (and `$23E36A` if the fight reaches it next)."** Both
   ported. The fight reaches both via D 14's rotation.
2. **"bosscoverage stays 103/0/8."** Held. Sprite emitters are not scheduler
   entries.
3. **"Stop if the next throw is a different subsystem."** There IS no next
   throw within 5000 frames. The next would be stage 2's column stream,
   which is explicitly a different wave.

status: DONE
