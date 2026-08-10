# W216: Stage-4 Type $A3

Status: COMPLETE

## Scope

Statically bind and translate the eight Stage-4 Type `$A3` records beginning
at `$2360D0`, including their movement streams, init/prototypes, handler,
direct live dependencies, visible assets, and chronological next frontier.

## Starting state

- W215 is complete and live as build `20260810093032`.
- Stage 4 covers 371/382 spawn records and 25/29 script types.
- First Type `$A3` record: clock `$0234`, body `$27D404`, handler `$27D674`,
  movement `$2370D8..$23712E`.

## Delivered

- Translated the Type `$A3` two-part oscillating carrier, including movement,
  linked damage, palette flashes, the four-state attack cycle, loop-dependent
  bullet patterns, death expansion, effect rows, and delayed cleanup.
- Added the live general Pool-A allocator path for kinds 18 and 19, their fill
  hooks, ordinary movement and animation, player collection transforms, score
  and collection counters, and the zoomed collected animation at `$2810CA`.
- Preserved the `$28C5E4` ROM debounce behavior: its guard is armed after the
  attempted sound post even when the ring is full.
- Exported the exact `$27D3FC..$27DA70` runtime closure and 57 referenced
  streams. Forty-nine are new and eight overlap existing assets, bringing the
  bundle to 3,788 streams.
- Registered all eight chronological Type `$A3` records. Stage 4 now covers
  379/382 spawn records and 26/29 script types; enemy registry coverage is
  71/256.

## Verification

- Exact ROM closure, registry row, movement extent, and six sprite harvest
  groups are pinned by the focused W216 check.
- A real clock `$0234` spawn smoke creates the carrier, executes its frozen
  draw path, kills it through its linked hitbox, produces one kind-19 and four
  kind-18 Pool-A records, collects kind 19, and renders its zoomed animation.
- The focused debounce regression proves `$28C5E4` arms `$81DEB6` even when a
  full sound ring rejects the cue.
- Release boundary: 1,591/1,591 tests, exact bundle gate, web fetch gate,
  ROM-leak guard, deployment, and three consecutive live confirmations passed.

## Publication

- Implementation commit: `4bd50b6`.
- Product-gate correction: `5ecb793`.
- Live build: `20260810101650`.

## Next frontier

The next unsupported Stage-4 record is Type `$A1` at `$2360D8`, clock `$0236`,
raw `02360000a1011010`. Registry row `$27E51A` points to stub/body
`$27CEAC/$27CEB4` and handler `$27CF0C`; movement index `$010` resolves to
`$2367D4..$2367DA`, raw `AA0024004000`.
