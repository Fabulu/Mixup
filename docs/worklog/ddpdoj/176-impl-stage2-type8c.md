# W176: Stage-2 type `$8C`

Status: COMPLETE

## Scope

Port the dependency-complete type `$8C` family at the first chronological
unsupported stage-2 record `$232C00`, clock `$0118`, init body `$2789F6`,
handler `$278C0E`, and movement index `$03F`. Verify every premise against the
live Version-B ROM and stop at the next exact unsupported boundary.

## Starting state

- W175 is independently reviewed and live as build `20260809081027`.
- Stage-2 coverage is 314/332 records with 18 unknown.
- Dynamic-minus-static coverage is zero.
- The protected owner `c1_*.py` files remain untracked and out of scope.

## Translation

The exact `$2789EE..$279802` closure is exported and structurally pinned. The
init body copies three long-form sub-record prototypes and the 21-word record
prototype, resolves both initial aim attachments, installs the three-node
spawn palette animation, sets stage progression flags, and posts the looping
engine cue.

The handler ports the shared-part flag merge, movement and bounds lifetime,
two-part damage accumulator, long-threshold cue spawner, animation and pose
machines, five/six-piece render, opening and alternating attack families, BCD
kill score `$457`, twelve ordered effects, fifteen-node death palette fade,
screen clear, and looping-sound teardown.

`src/animobjects.js` ports loader `$246410` and main-loop call `$24683E` for the
three palette families at `$24627A`. The older result-screen `$24652A` chain is
still content-light under its existing documented DEV-2 and remains inert;
wiring the new driver therefore does not execute its zero callback pointer.

## Integration findings

The controlled stage-2 boot found two issues beyond the isolated fixture:

- state 0 above Y `$1000` must branch directly to draw; it must not fall into
  state 3 and underflow pose cursor `$2E`;
- the opening fan reads the complete 64-long vector table `$26BFFC..$26C0FC`,
  so the prior midboss export window was extended to include its exact tail.

With both corrected, the seeded boot advances from type `$8C` through the exact
227-record prefix and stops honestly at type `$91` body `$279AA2`, record
`$232CE8`, clock `$013F`. It records 223 allocations and four authentic
declines.

## Coverage and verification

- Enemy types: 36/256 ported, 90 unknown, 130 null.
- Stage 2: 315/332 records ported, 17 unknown.
- Static-minus-dynamic: 304; dynamic-minus-static: zero.
- Focused W176/W175/boot/registry/coverage set: 38 passed, zero failed/skipped.
- `export-tables.py --verify`: passed, 232 windows, 272,574 bytes.
- `dojcoverage.py`: passed.
- Release gate: 1,487 passed, zero failed/skipped; bundle/web and ROM-leak
  checks passed.
- Published and confirmed live as build `20260809092221`.

The protected owner files and `NUL` were not touched or staged.
