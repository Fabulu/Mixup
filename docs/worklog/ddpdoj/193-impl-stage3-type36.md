# W193: Stage-3 type $36

Status: COMPLETE

## Scope

Statically bound and translate the next chronological Stage-3 family, type
`$36` at record `$234312`, clock `$000A`, with its directly reachable runtime
and visible asset dependencies. Reuse W192's complete Stage-3 census and run
one focused behavior check plus one real Stage-3 spawn smoke.

## Starting state

- W192 is complete and live as build `20260809231913`.
- Stage 3 has 253/414 records and 14/28 enemy types translated.
- Type `$3E` and all records before clock `$000A` are live.
- The next unsupported record is `$234312`, type `$36`.

## Static findings

Type `$36` occurs five times in Stage 3, first at `$234312`, clock `$000A`.
Its exact local closure is `$263A50..$264738`, SHA-256
`773fb8e091ea6420e98c8918983a4d4e0382c4e15ad7fbff295bb9e19509c12d`.
The registry stub selects seven consecutive sub-records. The init body loads
all seven prototypes, stores the `$263BF0` long-threshold cue cursor, consumes
the movement stream, and owns the Stage-3 phase latches.

The handler is a seven-part carrier with two linked damage hitboxes and four
visible batteries. Linked damage subtracts both hitbox deltas from one long
HP value. Four HP thresholds destroy the batteries through existing score,
sound, and effect paths. The live batteries aim and fire through the existing
`$2814AC`, `$281442`, and `$281402` bullet generators. Once all four are gone,
the centre battery takes over. Final death emits six table-driven effects,
spawns threshold cues, and keeps the wreck alive for 16 handler passes.

Static art ownership found exactly 33 new streams: fixed hull `$178C8C` and
the 32-entry upper-attachment table `$272CFA..$272D7A`. The lower attachment
family at `$272DFA` was already shipped. The handler also required the exact
paired bullet-vector table `$27307A..$27317A`.

## Implementation

- Added init body `$263A58` and handler `$263C7C`.
- Translated the seven prototypes, phase gates, derived part positions, summed
  linked damage, four destruction thresholds, cue cursor, all battery patterns,
  death effects, delayed free, and five-sprite draw order.
- Exported the complete local ROM closure, upper-art table, and paired-vector
  table with fixed boundary and SHA checks.
- Harvested the 33 new streams into deferred shard 17. The sprite inventory
  grows from 3,202 to 3,235 streams.
- Advanced reusable Stage-3 coverage to 258/414 records and 15/28 types.

## Verification

- ROM/table export: green, 297 windows.
- Web asset export: green, 3,235 sprite streams.
- Focused type `$36` regression and real clock-`$000A` Stage-3 spawn smoke:
  2/2 green.
- Directly affected registry and coverage checks: 40/40 green.

## Result

All five Stage-3 type `$36` records now initialize, fight, explode, linger, and
draw with complete art. The next chronological unsupported record is type
`$37` at `$234502`, clock `$003B`, with body `$264740` and handler `$2647A6`.
Stage 3 has 258/414 translated records, leaving 156 records across 13
unsupported types.

## Release

- implementation commit: `17fb995`
- shared-shard ownership correction: `ea573d3`
- production build: `20260809235214`
- release gate: 1,546/1,546 tests, bundle render, web fetch, and ROM leak guard
- deployment: `https://gbtman.pages.dev/games/ddpdoj/`
- confirmation: three consecutive production polls returned the new build
