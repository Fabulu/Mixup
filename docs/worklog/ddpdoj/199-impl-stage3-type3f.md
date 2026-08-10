# W199: Stage-3 type `$3F`

Status: COMPLETE

## Scope

Translate the next chronological Stage-3 family, type `$3F` at record
`$2348BA`, clock `$00EA`, using the fixed W192 census and one targeted static
map. Implement its 84 records, linked-hitbox damage, ranked fire pattern,
death, and shared type-`$3E` draw path. Run one focused regression and one real
Stage-3 spawn smoke.

## Starting state

- W198 is complete and live as build `20260810021530`.
- Stage 3 has 274/414 records and 22/28 script types translated.
- The browser bundle contains 3,455 sprite streams.
- Type `$3F` has no child enemy types and reuses all 64 type-`$3E` streams, so
  this slice requires no new visible assets.

## Static boundary

The exact new local closure is `$265798..$2659DC`, 580 bytes, SHA-256
`c54df4cfcfb217cbcbfdc79d20009ba21fbc323c342fdf240c5c42c15f9ad6ca`.
The shared draw helper and art at `$265648..$265798` are already live from
W192. All 84 records are the two type-`$3F` slots at each clock `$00EA..$0113`,
excluding the three interleaved records owned by later families.

## Delivered

- Registered init `$2657A0` and handler `$265850` for all 84 records.
- Preserved two-hitbox max-damage reduction, palette flash, aim duration,
  freeze-aware movement, fire cadence, Stage-5 fan variant, optional death
  bullet, score/effect/sound cleanup, and the shared type-`$3E` draw tail.
- Exported and hash-pinned the 580-byte local closure. No new art was needed;
  the browser bundle remains 3,455 sprite streams.
- Advanced Stage 3 from 274/414 to 358/414 records and 22/28 to 23/28 script
  types. Global enemy registry coverage advanced from 55/256 to 56/256.

## Verification and release

- Focused init, linked damage, freeze/fire cadence, shared draw, and real
  clock-`$00EA` two-record spawn checks pass.
- Production release gate: 1,558/1,558 tests, bundle gate, web fetch gate, and
  ROM leak guard all pass.
- Implementation commit: `ecce2d8`.
- Published and confirmed as build `20260810022824`.

## Next frontier

Stage-3 type `$15` at record `$234AF2`, clock `$010D`, body `$265BF4`, handler
`$265CA0`; movement `$235386..$235390` is `bf40f5008901c0041a00`.
