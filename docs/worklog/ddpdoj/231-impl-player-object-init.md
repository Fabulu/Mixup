# W231: the player object INIT and the pods' deploy

Status: COMPLETE

## Scope

Docket D9's last link. A death was survivable after W227 and W228, but a
respawned ship had no position: it sat at `posY` 0, below its own `$800` clamp.

## Starting state

- W230 is committed at `62c0a80` (plus the goal commits) and the suite is green.
- `$2491C0` and `$249246`, the two player OBJECTS, were mapped in `main.js`
  straight onto `updatePlayer`, i.e. onto `$2494FA`. Everything before that
  address -- the whole one-time INIT arm -- had never been translated.

## Delivered

- Translated `$2491C0`/`$249246` as `playerObject2491C0`. `$2491D4 bset #0,$3(a5)
  / bne $2494FA` is the entire gate: a player object runs the init on its FIRST
  frame and `updatePlayer` on every frame after, and the init ends `$2494DC bra
  $249E4E`, the TAIL, so on that first frame it sets its record up and draws but
  does not move. The two routines differ only in constants, so they are one
  function over a two-entry table.
  - The 49-word template at `$24915E`: word 0 is OR-ed into the state word and
    the other 48 are copied only when the object's `+6` is zero.
  - `$58`/`$5A` from `$813084`/`$813088` (P1) and the `$253A1E` chain-meter clear.
  - The `+6`-keyed fresh-start arm, including the `$2551FA` byte pair, the
    `$81292C`/`$812930` gates and the `$25520C` power-list pair.
  - `$260846`, which arms dispatcher request 9, plus `$25FF38` itself.
  - The `$803926`-gated config arm, translated as written including that all five
    of its `$2530BE` stock grants go to the P1 routine even on P2.
  - `$249426`/`$24942C`, the two instructions this whole slice exists for: the
    position comes from the OBJECT record its creator filled.
  - `$2551EA` animation longs, and the `$500000` latch dance
    `$246D04(3,d0)`, `$246D04(4,d0)`, `$246EA4(3,4,4)`, `$246CAC(4)` whose result
    indexes `$255200` for the speed pair and `$2552C4` for the ramp pair.
- Translated `$2603B0`, jump-table entry 9: the SET/bonus panel. Both arms of
  `$2534F8`/`$253522` reach `$2532B6`, which is one `$240E1A` and four `$240DC2`
  calls, i.e. the deferred TEXT path, so it is counted rather than invented.
- Translated `$24C934`, THE PODS DEPLOYING, which became reachable the moment a
  player object could be created: `$2492C8 move.w #$8000,(a2)` resets the option
  block, bit 1 included, so a respawn starts with its pods stowed. The deploy adds
  eight per frame to the pod speed until it equals the target `$24C928` names for
  this formation and ship select, then sets bit 1 and stops.
- Extracted `stepPodAnim`: `$24C390..$24C3CA` in formation 2 and
  `$24C96C..$24C9A6` in the deploy are the SAME ten instructions on the same
  fields, and both sites now cite both addresses.
- Two new ROM windows, each with its far end pinned by CODE rather than by a run
  length: `$24915E+$62` ends at `$2491C0`, the handler's first instruction, and
  `$24C928+$C` ends at `$24C934`, the `addq.b` that reads it.

## Corrections to W228

`$260004 move.w #$2,(a6)` is not a "state 2" the rank object reads, as W228's
comment claimed. It is the next REQUEST for the same dispatcher, and `$25FF52[2]`
is `$260056` -- the credit/continue entry, which creates object types `$D` and
`$B`. Running out of lives hands off to the continue path. Both the comment and
W228's test message are corrected.

## Verification

`node --test games/ddpdoj/tests/w231playerinit.test.js` -> 5/5.

The unit cases pin the position coming from the object record, the template word
OR, an untouched template word landing in the record, request 9 being armed, the
gate refusing to init twice, and the deploy reaching exactly `$24C928[0]` = `$E0`
in exactly `$E0 / 8` passes. The deploy's re-base is proved by teleporting the
ship mid-deploy: a pod that merely integrated would keep the old position.

The live case is the one that matters. From `rip/web/seed.bin`, the same headless
scenario that has carried D9 since W226: the player dies on frame 424, the record
is cleared, and on frame 496 the new object's init puts the ship back at
`$1000`/`$0E00` with `$F0` frames of invulnerability and its pods stowed; by frame
560 the pods have deployed to exactly `$E0` and bit 1 is set.

The scenario now survives THREE deaths and two full respawns (dying at 424, 857
and 1184, spending the seed's two lives at 495 and 928) before the third death
exhausts the count at 1255 and hands off to request 2.

Full suite: `node --test games/ddpdoj/tests/` -> **1625/1625**.

## One process note worth keeping

Editing source with a Python script on Windows rewrote whole files as CRLF, and
two tests that read the shipped source as TEXT went red for that reason alone:
`fire.test.js` splits `options.js` on `\n}\n` to count formation 2's exits, and
four exporter-assertion tests match `def build(d: bytes) -> dict:\n\s*check_...`.
Both are good tests. Write source with LF explicitly.

## The next link, measured

`$260056`, dispatcher request 2, reached when the last life goes. It clears
`$907000`, calls `$25FD94`, forks on `$803926`, calls `$287BD2`/`$287C08` and
`ori.b` into `$8130CC`, then creates object types `$D` and `$B` -- and type `$B`
is dispatch entry `[11]` `$25DBB4`, the same unported object the descriptor sweep
found running every frame and the prime suspect for docket D11's transition. So
the continue path and the transition engine meet at the same object.
