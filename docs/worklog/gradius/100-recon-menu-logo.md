# 100 - Gradius menu logo and attract return

Status: DONE

Scope: diagnose and fix the missing title logo and title-menu corruption after
attract/demo return. Premise must be checked against the ROM and current port.

## Initial premise

Owner report: the initial Gradius title menu appears without its logo. After
leaving the attract/demo running until it returns to the menu, menu text can be
garbled. This wave will trace title and demo paths, compare cartridge and port
pixels/state, and add red-validated regression tests for both paths.

## Diagnosis

The report was accurate. ROM disassembly identifies `$8824/$882C` as one
full-screen loader using `$8871`, `$8893`, and six RLE chunks. `$8893` selects
`$8C78` for the playfield and `$8C8C` for title/attract. The prior port kept the
loader's RAM side effects but omitted all sequential `$2007` writes. Therefore
the initial title had no static logo, and a return from attract drew menu
packets over stale gameplay VRAM.

## Fix

`tools/export_assets.py` now independently decodes both ROM image streams into
`assets/screens/nametables.json` with 2304 playfield writes and 1024 title
writes. `src/assets.js` and the headless test resources load the cache. The
title boot, stage-intro load, and attract return replay the selected stream at
`$2000` with the cartridge's vertical mirroring. `tools/oracle/compare.mjs`
now grades all compared nametable windows strictly, retiring the stale
`$8871` known-failure excuse. The gameover oracle description was updated too.

## Validation

- Red mutation: removing both VRAM stores from `fullScreenLoad()` made the new
  initial-logo assertion fail; restoring them made it pass.
- Focused logo and repeated attract-return tests: 2 pass, 0 fail.
- Full Gradius unit suite: 746 pass, 0 fail, 0 skipped.
- Asset self-test, table coverage, stage ledger, and stage sweep: all pass.
- The full 47-scenario comparison reached 0 TIER-1/video divergences after the
  fix; its first run failed only because the old `$8871` annotation was now
  stale. The strict-comparison rerun passed the targeted `gameover` scenario.
- A fresh full runner was allowed 15 minutes. Its 12 earlier stages passed,
  then the existing render gate exceeded the timeout while rendering; no test
  failure or skip was reported. The publish dry gate is therefore not claimed
  green in this wave.

## Files

`games/gradius/src/assets.js`, `src/flow.js`, `src/main.js`, `src/modes.js`,
`src/terrain.js`, `tests/helpers.js`, `tests/modes.test.js`,
`tools/export_assets.py`, `tools/oracle/compare.mjs`,
`tools/oracle/scenarios.json`, `tools/test-all.mjs`, `README.md`.
