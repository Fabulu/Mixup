# W165 browser replay parity and control-help UX

Status: DONE

Scope: DOJ browser replay desync diagnosis/fix and non-obstructive accessible
control help. No gameplay, hyper, bee, sound, or Gradius changes.

## Evidence first

HEAD at start: `c7921dad600c04be7797e11ee248f4183f79601c`.

## Browser reproduction and cause

Using real Chrome (Playwright, local HTTP origin) on
`tools/oracle/out/w69/fly-around/fly-around.lf2000-2250.replay` reproduced the
reported UX defect before the fix: `REC` changed to `STOP REC` while its native
`title` popup remained browser-owned over the bar, and the armed replay banner
occupied x826..1272/y8..58 while the control strip occupied y5..28. The banner
also had computed `pointer-events: auto`. The fixture's canonical poke is
`810424=FF`; the browser's old `step()` path always wrote only that live
intervention, so it silently diverged for any valid replay carrying a different
poke list even though this one-poke fixture could appear to work. Headless
playback applies every parsed poke before every step. This was the parity break;
the fix keeps the live intervention only for ordinary play and applies the
complete file poke list during playback. No desync is suppressed: digest-window
and cumulative mismatches remain red.

## Implementation

- `src/web/replay.js` now strictly validates base64, build/seed dimensions,
  non-negative seed frames, exact u16be input count/bytes, RAM-range poke syntax
  and values, digest columns, period cadence/LF endpoints, and SHA-256 fields.
  It exports `parsePoke` and `validateReplay`; malformed files fail before the
  visible Game is swapped in. BG remains raw big-endian bytes until the exact
  `beWords` conversion at Game construction, matching the headless player.
- `src/web/app.js` applies all `playback.pokes` before each replay step and
  retains the single `810424=FF` intervention only for live play. `playFrom`
  uses the strict validated seed/input contract.
- `tools/replay.mjs` now uses the same strict base64/seed/input/poke/frame/digest
  contract before headless construction, including arbitrary RAM pokes.
- `index.html` removes native `title` attributes from every bar control,
  supplies accessible labels/descriptions, adds one shared keyboard/mouse help
  element with Escape/leave/blur/timeout dismissal and Enter/Space PLAY support,
  keeps it pointer-transparent below the bar, and moves the replay banner below
  the bar with `pointer-events: none`. REC/STOP remains directly clickable.
- Added deterministic W165 shape/malformed tests and a real Chrome gate covering
  help geometry, REC->STOP->download, known-good GREEN replay, and deliberate
  cumulative-digest RED mismatch. Existing W132 fixture count was made explicit
  for strict input validation.

## Red validation

The W165 focused test rejects malformed poke/count/period/build fields. A
deliberate source mutation replacing `this.playback.pokes` with `LIVE_POKES`
failed the focused parity assertion; restoring it re-greened. A deliberate
`pointer-events: auto` mutation on the replay banner failed the focused help
assertion; restoring it re-greened. The Chrome gate also mutates only
`digest.cumulative` and visibly receives `REPLAY MISMATCH`.

## Verification

- `node --test games/ddpdoj/tests/w165browser-replay-help.test.js ...` focused
  replay/REC/live-play set: 24 passed, 0 skipped.
- `node games/ddpdoj/tools/w165browser.py`: PASS W165 Chrome interaction gate.
- `node --test games/ddpdoj/tests`: 1420 passed, 0 failed, 0 skipped.
- `node games/ddpdoj/tools/webgate.mjs`: PASS.
- `node games/ddpdoj/tools/bundlegate.mjs --assets games/ddpdoj/assets --dump
  games/ddpdoj/rip/pix-demo --tsv games/ddpdoj/tools/oracle/out/w6/demo.tsv`:
  15,955,968/15,955,968 pixels.
- `node tools/publish.mjs --only ddpdoj --dry`: built and gated, not deployed
  (build `20260809001036`).

No gameplay, hyper, bee, sound, Gradius, exporter, or ROM-derived source was
changed; c1 scripts remain preserved and uncommitted.

## Handoff

W165 implementation and gates are complete; commit/push is the final handoff
operation. The only untracked files outside the exact W165 set are the three
preserved user c1 scripts.
