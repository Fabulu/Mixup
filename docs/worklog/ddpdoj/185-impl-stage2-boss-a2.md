# W185: Stage-2 boss A2 objects

Status: COMPLETE

## Scope

Statically close the eleven A2 boss-part objects at `$297462..$297950`, their
non-address dispatch order, shared emitters, selector tables, state writes, and
the queued type `$4D` child at `$29BB1E..$29BBF4`. Harvest every reachable art
stream before translating the routines, then advance the controlled runtime to
the next honest stage-2 boss dependency.

## Starting state

- W184 is committed, pushed, and live as build `20260809144557`.
- Stage-2 spawn coverage remains 332/332 with zero unknown.
- The controlled boot stops at A2 object 0 `$297462`, clock `$01DC`.
- Static reconnaissance found 176 distinct referenced streams absent from the
  current 2,743-stream bundle.
- The protected owner `c1_*.py` files and `NUL` remain out of scope.

## Static analysis first

- The A2 pointer list at `$297432` is deliberately not address-sorted. Its
  eleven routines execute in slot order 0 through 10 and each appends exactly
  one register-convention record to bucket 1 through `$23DFEA`.
- The complete pointer/code/data closure is `$297432..$297950`. All eleven
  objects are draw-only: no state writes, self-gates, firing, or hidden helper
  calls occur in this family.
- Nine physical art tables contain 175 pointers and 169 unique streams. Static
  writer analysis proves object 3 can reach only the first eight of the nine
  structurally valid pointers at `$2974DA`; therefore the reachable A2 total is
  174 references and 168 unique streams.
- Type `$4D` is created only by D13. Its `$29BB1E..$29BBF4` closure adds eight
  disjoint streams, bringing the exact new-art denominator to 176.
- Type `$4D`'s 28-byte prototype at `$29BB4A` deliberately overlaps the first
  opcode word of handler `$29BB64`. The final loaded prototype word is `$4EB9`.

## Delivered

- Registered all eleven A2 routines in the ROM's non-address list order and
  preserved their packed coordinate arithmetic, word-only additions, selector
  masks, shared/reversed art tables, D4 high byte, sizes, palettes, and bucket.
- Added type `$4D` init `$29BB26` and handler `$29BB64`: overlapping prototype
  load, copied queued position, byte on-screen latch, velocity, scroll
  compensation, 24-call lifecycle, eight-frame draw, and exact terminal frees.
- Harvested 176 reachable sprite streams into deferred boss shard 17. The total
  bundle grows from 2,743 to 2,919 streams; the boot shard is unchanged.
- Advanced reusable coverage to 44/256 enemy types with 82 unknown and kept
  stage-2 spawn coverage at 332/332 with zero unknown.

## ROM boundaries

- A2 pointer/code/data `$297432..$297950`, SHA-256
  `cdcf53079a34143bfaa7690599d538e077ab1f9c4a945361575c9228166704e3`.
- A2 code/data `$297462..$297950`, SHA-256
  `4be222fa8b366e9da24641ca02362e8ab3c08313230625139d3c5ed633d81cc6`.
- Type `$4D` `$29BB1E..$29BBF4`, SHA-256
  `cdc464e32a561b910ccc180c2cc3cfeb226eb901580c5515792d40827978438d`.
- Overlapping type `$4D` prototype `$29BB4A..$29BB66`, SHA-256
  `c606a296f3379ca83d112565dedbe8c6c814b40c251af9106cb46c727269c261`.

## Verification and release

- Nine focused W183-W185 checks pass. They cover exact pointer order, all
  eleven selected descriptors in emitted order, type `$4D` prototype overlap,
  initialization, and frame-zero draw.
- The controlled 30-second stage-2 boot advances to A4/F3 init `$299194` at
  clock `$0218`.
- ROM export verification covers 254 windows and 282,488 bytes. Reusable
  coverage reports 44/256 enemy types and 332/332 stage-2 records.
- The 2,919-stream bundle renders 15,955,968/15,955,968 pixels, 100.0000%, over
  159 reference frames. The build passed the 285-file, 12-ROM leak guard with
  the six existing deliberate exceptions.
- Implementation commit: `4e2ef36` (`ddpdoj: render stage 2 boss parts`).
- Live build: `20260809151417`, deployment `https://d401a408.gbtman.pages.dev`.
  Production served the build three consecutive times and Gradius returned
  HTTP 200.

## Next frontier

Statically close A4/F3 init `$299194` and step `$2991BC`, including every
script it starts or stops, then continue the stage-2 boss attack graph.
