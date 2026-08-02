# Wave 24 TEST HARDENING — can each W24 check actually FAIL?

status: DONE (audit; READ-ONLY on src/ and on tests — recommendations only)
test-hardening, 2026-08-02

Subject: `games/gradius/tests/w24-substate.test.js` (28 tests). Audited against
`src/nmi.js` (`stagePlay`, `playArm`, `st9A4D`/`st9A0E`/`st99E9`/`st99C0`/
`st9982`/`sub994A`/`st997E`/`gameOverArm`/`continueTimeout`), `src/enemies.js`
`dispatch()` (type `$98` -> entry 24 -> `$B914`), and `24-impl-substate-machine.md`.

This pass FILES recommendations with exact code; it does NOT edit tests. The
synthesizer commits. I did not re-run the suite (read-only role); the gate I
audit against is the implementer's measured `445 pass, 0 fail, 0 skipped`
(`24-impl-substate-machine.md`), and the 17/18 mutation table there.

## The four shapes (docs/03 lessons 37-41), audited across the file

The file header claims all four are avoided. They mostly are. Four checks do
not live up to the header, named below in severity order. Everything else is
sound; the solid checks are credited in the coverage sentence.

---

## FINDING A — MODERATE (shape: decoration / close kin of "takes-the-answer-
as-an-argument"). Test at line 47, "jt_$982F is a 16-entry table; the dispatch
is the low nibble of $1B", IS A TAUTOLOGY THAT NEVER CALLS nmi().

```js
test('jt_$982F is a 16-entry table; the dispatch is the low nibble of $1B', () => {
  const prg = res.manifest;   // not ROM; the count is structural, pinned in tables.test
  for (let n = 0; n <= 0xF; n++) {
    const s = atSubstate(0x80 | n);
    assert.strictEqual(s.substate & 0x0F, n, `low nibble of $${(0x80 | n).toString(16)}`);
  }
  void prg;
});
```

`atSubstate(0x80 | n)` sets `s.substate = 0x80 | n`. The assertion is then
`(0x80 | n) & 0x0F === n` — a JavaScript bitwise identity that is true for every
integer 0..15 by the language definition. **It never calls `nmi()`**, so it
guards nothing in `playArm`. The cited RED WHEN ("the mask is wrong, e.g.
`& 0x07`") does NOT turn this red: the port's `switch (substate & 0x0F)` (the
thing actually under suspicion) is never executed. The `void prg;` is the test
admitting it pins no ROM byte. A check that cannot fail is a decoration (RULE 4).

### Exact replacement (option 1 — preferred: delete)
Delete the test. The dispatch-routing fact it claims to pin is already covered
by the line-62 test, which routes each arm through `nmi()` and matches its
specific ROM address. Nothing is lost.

### Exact replacement (option 2 — make it assert separation)
```js
test('the dispatch separates arms: $88 does not run $80\'s body', () => {
  // $80's body advances $1B when cam.hi >= bossPage. $88 must throw at $9BED,
  // not run that body. RED WHEN: the mask is & 0x07 (so $88 & 0x07 == 0 routes
  // to $80), or two case labels collapse ($88 falls into case 0x0).
  const s88 = atSubstate(0x88);
  s88.cam.hi = BOSS_PAGE;                 // would advance $1B if routed to $80
  assert.throws(() => nmi(s88, 0, res), /\$9BED|9BED/,
    '$88 must route to $9BED, not $80');
  const s80 = atSubstate(0x80);
  s80.cam.hi = BOSS_PAGE;
  nmi(s80, 0, res);
  assert.strictEqual(s80.substate, 0x81, '$80 body still runs and advances');
});
```
### Red I would expect
Change `switch (state.substate & 0x0F)` to `& 0x07` (nmi.js:351): `$88 & 0x07`
is `0`, so `$88` runs `st9A4D`, `cam.hi >= bossPage` advances `$1B` to `$81`,
and `assert.throws(... /\$9BED/)` fails because no throw happens. The same red
fires for collapsing `case 0x8` into `case 0x0`.

---

## FINDING B — MODERATE (shape: "asserts a throw, but not WHICH throw" — the
inverse of lesson 37). Test at line 245, "$84 advance path spawns the boss
object", uses a regex that matches ANY throw.

```js
assert.throws(() => nmi(s, 0, res), /undefined|handler|\$|Error/);  // boss handler W26
```

`/\$|Error|undefined|handler/` matches every ROM-addressed throw in this port
(`\$` alone matches all of them), every `Error`, and any "undefined"/"handler"
string. The boss type `$98` routes through `dispatch()` (enemies.js:1116) to
entry 24, target `$B914`, which hits the `default:` throw at enemies.js:1155
whose message renders `unimplemented enemy handler B914 for type $98 (entry 24
of the 42-entry table at $AE1C)`. The test should pin THAT address. As written,
a regression that throws EARLIER (a bad HUD packet at `$998B`, a wrong boss byte
that dispatches a different unported type) still matches `\$`/`Error` and the
test passes — exactly the "check that agrees with the code by construction"
smell of lesson 5 in `22-review.md`.

The boss-byte side-effect asserts after the throw (`type[bi] === 0x98` etc.) DO
pin the spawn and would catch an early throw before the writes — that part is
sound. Only the throw-matching line is weak.

### Exact replacement
```js
// The boss type $98 -> dispatch entry 24 -> target $B914 (W26, unported). The
// throw at enemies.js default-branch renders the handler address as `B914`.
assert.throws(() => nmi(s, 0, res), /B914/,
  'type $98 must dispatch to $B914 (entry 24), the W26 boss handler');
```
(Confirm the exact rendering against enemies.js:1155 — `hex4(target)` emits the
bare hex; match `B914`, not `\$B914`.)
### Red I would expect
Make the boss byte wrong (`state.obj.type[bi] = 0x99` at nmi.js:541): `$99`
dispatches to a different entry/target, the throw message names that other
address, and `/B914/` fails. Also red if anyone makes the boss throw a quiet
return (assert.throws fails outright) — which is the whole point.

---

## FINDING C — HIGH (shape: "sets up state that masks the line under test",
lesson 38). Test at line 348, "$85 the BNE is always taken", pre-sets `zp5B=0`
and so CANNOT detect removal of the `$9658` clear — the one line the entire
dead-branch proof rests on.

```js
test('$85 the BNE is always taken: $5B (cleared to 0 by $9658) becomes 1, != 0', () => {
  const s = atSubstate(0x85);
  s.zp5B = 0;
  nmi(s, 0, res);
  assert.strictEqual(s.zp5B, 1, 'INC made $5B 1; $9658 will clear it next frame');
  assert.strictEqual(s.substate, 0x85, 'no fall-through into $9982');
});
```

The `$997E` fall-through-is-dead proof (recon §6, plan §5, the comment block at
nmi.js:587-602) rests on a single instruction: `$9658 STA $5B`, ported at
**nmi.js:293 `state.zp5B = 0;`** inside `stagePlay()`, BEFORE the `$96A5` ladder
reaches `$997E`. The test pre-sets `s.zp5B = 0` — exactly the value `$9658`
would have produced. So the post-frame `zp5B === 1` is identical whether `$9658`
ran or not:

- with `$9658`: `0 (clear) -> INC -> 1`
- without `$9658`: `0 (I just set it) -> INC -> 1`

**Deleting nmi.js:293 leaves this test GREEN.** That is lesson 38 verbatim: the
harness supplies the value the application's own per-frame logic would supply,
and the absence of that logic becomes invisible. The load-bearing line is
unguarded. (The `substate === 0x85` assert is no help either: the port's
`st997E` (nmi.js:603) does not implement the fall-through at all, so substate
never advances regardless — see Finding D.)

### Exact replacement — pre-set a residue ONLY `$9658` can clear
```js
test('$85 is safe because $9658 clears $5B every frame BEFORE the INC', () => {
  // Pre-set $5B = $FE. Only the $9658 per-frame clear (nmi.js:293) turns this
  // into the observed post-INC value 1; delete $9658 and $FE INCs toward $FF/$00.
  // Stronger: set $FF -- without $9658 the INC wraps $FF -> $00 and the dead BNE
  // would NOT branch (the re-spawn-every-256-frames hazard).
  const s = atSubstate(0x85);
  s.zp5B = 0xFF;                         // a residue only $9658 can clear
  nmi(s, 0, res);
  assert.strictEqual(s.zp5B, 1,
    '$9658 cleared $5B to 0, then $997E INC made it 1 (not 0x00 wrap)');
  assert.strictEqual(s.substate, 0x85, 'no fall-through into $9982');
});
```
### Red I would expect
Delete `state.zp5B = 0;` at nmi.js:293 (the `$9658` clear). Now `$5B` carries
`0xFF` into `st997E`, the INC wraps to `0x00`, and `assert.strictEqual(s.zp5B,
1, ...)` fails (it is `0x00`). That makes the absence-proof's foundation a
seen-to-fail check.

### Stated plainly (RULE 2)
Even the replacement above pins the `$9658` clear, NOT the fall-through itself.
The port has no fall-through code in `st997E` to mutate; no unit test can make
a "fall-through fires" mutation go red because there is nothing to turn red. The
honest claim is "$9658's per-frame clear is guarded"; the claim "$997E cannot
fall through" rests on the listing (the comment at nmi.js:594-598) plus the
absence of the code, not on this (or any) unit test.

---

## FINDING D — MODERATE (shape: "sampled frames with no transitions", lesson
39's genus). Test at line 337, "$85 ... does NOT advance to $86", samples 5
frames — too short for the hazard its own RED WHEN comment names.

```js
for (let i = 0; i < 5; i++) nmi(s, 0, res);        // 5 frames of boss fight
assert.strictEqual(s.substate, 0x85, '$85 never advances $1B on its own');
// RED WHEN: the fall-through is implemented -- $1B would advance or $9982 re-spawn
```

The named hazard (plan §6, recon §6) is "$5B wraps `$FF -> $00` on the INC and
the dead BNE falls through, re-spawning the boss every 256 frames". Five frames
cannot reach a 256-frame wrap. With `zp5B` pre-set to 0 (and `$9658` clearing
it each frame), the five frames walk `0 -> 1 -> 1 -> 1 -> 1 -> 1` and never
approach the boundary. The test catches only a DIRECT `$1B` advance (someone
adding `state.substate++` to `st997E`), which the one-frame line-348 test also
catches. It does not catch the cited accumulation-then-wrap hazard, and — per
Finding C — it stays green if `$9658` is removed.

### Exact replacement — push the boundary to within one INC of the wrap
```js
test('$85 does not fall through across the $5B wrap boundary', () => {
  // Park $5B at $FE each frame (2 INCs from the wrap) and confirm $1B never
  // advances. Combined with the $9658 clear this is the structural reason the
  // dead BNE can never drop. RED WHEN: $9658 is removed AND a fall-through is
  // added (the port has no fall-through today, so this guards the clear, which
  // is what makes the wrap unreachable).
  const s = atSubstate(0x85);
  for (let i = 0; i < 4; i++) {
    s.zp5B = 0xFE;                       // reset near the wrap each frame
    nmi(s, 0, res);
    assert.strictEqual(s.substate, 0x85, `frame ${i}: $85 does not fall through`);
  }
});
```
(Keep the existing line-337 test too if you want the direct-advance guard, but
**rewrite its RED WHEN comment** to say what it actually catches: "a direct
`INC $1B` added to `st997E`" — not the 256-frame wrap.)
### Red I would expect
Only red in combination with Finding C's regression (delete `$9658`) AND a
hypothetical added fall-through; alone it stays green because the port has no
fall-through. Say it that way — do not let the comment claim it guards the wrap
on its own.

---

## FINDING E — the coverage gap (INFORMATIONAL, the big one). NO test drives
the `$80 -> $81 -> $82 -> $83 -> $84 -> $85` CHAIN, and no in-situ cartridge
comparison exists.

Every arm is driven IN ISOLATION via `atSubstate(sub)`, which teleports
`$1B` to the arm under test. The handoffs are never exercised end-to-end:

- `$81`'s `$4D := $9A35[rank]` load (line-113 test) is checked, but the `$82`
  countdown test (line 148) PRE-SETS `$4C:$4D` rather than letting them flow
  from `$81`. So the `$81 -> $82` register handoff is untested.
- The 768-frame `$82` duration at rank 1 is unit-confirmed only over 2 frames
  (line 148); never run to completion in situ.
- The 512-frame `$84` despawn crawl's frame-by-frame effect on the 1022 compared
  fields is unmeasured.
- `$96FB` window field-exactness (done-when #3) is unmeasured; the `deep-
  survivor`/`deep-autofire` HOOK recordings prove `$96FB` runs 794 times, not
  that the 1022 fields match.

This is the done-when #1/#2/#7 gap the implementer named under RULE 2
("I could not reach the in-situ cartridge comparison, here is what I tried").
I confirmed the mechanical reason: there is **no `endchain` entry in
`tools/oracle/scenarios.json`** (only `deep-ground`, `deep-page3`, `deep-page4`,
`deep-powered`) and no `scen/endchain.json` field dump. The hook recording
`throwaudit-endchain.json` proves the `$1B` timeline; it is not a per-frame
field dump and cannot make the 1022-field comparison machine-checkable.

### Recommendation (not a test edit — a scenario/tooling addition for W28 or a
follow-up wave)
1. Re-derive the boss-killing RUA-hold button script (the sweep map proved it
   reachable from ~frame 5000) and record `scen/endchain.json` via `scen.py`,
   exactly as plan done-when #7 requires.
2. Add an `endchain` compare scenario covering frames 310-2620 (stage 0,
   `$80` exit through the end of `$84`), ending where `$85`/W26 begins.
3. Add a `deep-survivor`/`deep-autofire` `$96FB`-window compare scenario.
Until those exist, the coverage sentence below is the honest one.

---

## FINDING F — MINOR. Test at line 62 is titled "the 8 unported play arms throw
with their ROM target" but the loop iterates **10** arms
(`[0x86..0x8F]`). Ported play arms are `$80`-`$85` (6); unported are
`$86`-`$8F` (10). Rename to "the 10 unported play arms throw with their ROM
target". (The test body is correct and sound; only the count in the name is
stale.)

## FINDING G — MINOR. The `assert.deepEqual(RANK_CD, [3,3,4,4,5,5,6,6])` pin
appears twice — line 133 (inside the rank-indexed duration test) and line 450
(the export pin). Redundant. Consolidate into the export test; have the
duration test assert only the `* 256` arithmetic. Not a defect.

## FINDING H — MINOR (same shape as C, lower stakes). Test at line 361
("$96FB INCs $5B every frame") pre-sets `zp5B = 0`. It catches a dropped INC
(zp5B stays 0 -> assert fails) but, like Finding C, cannot detect removal of
the `$9658` clear. Lower priority than C because `gameOverArm`'s correctness
does not hinge on `$9658` the way the `$997E` absence proof does. If you want
it to also guard `$9658`, pre-set `zp5B = 0xFF` and assert `0x00`-via-wrap is
NOT observed (assert `=== 1`).

---

## What I ruled out (so nobody re-derives it)

These looked like possible defects and are NOT:

- **`atSubstate(sub)` direct assignment** is NOT "state the app never has"
  (lesson 38). Every sub-state `$80`-`$8F` and `$C0` is reached in ordinary
  play (the endchain run traverses `$80`-`$85`; `$97F1` sets `$1B := $C0`).
  Teleporting to a reachable state is legitimate unit practice; lesson 38 is
  about fabricating a configuration the app cannot reach.
- **Pre-setting `zp4C/zp4D` in the `$82` tests** (lines 148, 166) looks like
  "state the app never has" (the real entry value is `$00:$03` at rank 1, not
  `$00:$02` or `$00:$01`). It is a legitimate value-independent test of the
  decrement/borrow mechanics, and the real entry value IS pinned at line 113
  (`zp4D === RANK_CD[2]`, `zp4C === 0`). The setup+mechanic split is sound.
- **`pulse1Dur` test (line 434)** is NOT "takes the answer as an argument"
  (lesson 41). It sets the underlying state (`snd[OFF.DUR]`) and reads THROUGH
  the function, so a wrong-offset helper (the OWNER-not-DUR mutation #16) goes
  red. It tests the offset selection, which IS the point.
- **The line-263 `$D0` boundary test** and **the line-113 rank-2 re-aim** are
  EXEMPLARY: each picks the exact boundary value the implementer's first attempt
  could not distinguish (mutations #11 and #2 in the impl worklog), and both
  would go red on the re-aimed mutant. These are the models for the rest.
- **The line-306 `$14` object-clear test** honestly names its own survivor
  (mutation #12: `$14 -> $15` is green because slot `12+$14 = 32` is out of
  bounds in this port's separate arrays). That is the right way to record a
  faithful-but-unobservable guard.
- **Test 2's per-arm address regexes** ARE specific enough to catch misrouting:
  `$87` is asserted to throw at `$9B3E`, and if the dispatch sent `$87` to the
  `$88` handler (`$9BED`) the regex would fail. Solid.

## The W24 coverage sentence (RULE 5 — branches and table entries, not frames)

> 28 tests in `w24-substate.test.js`, all green (audited against the
> implementer's measured `445 pass, 0 fail, 0 skipped`; I did not re-run).
> Of the **6 ported play arms**, 6 of 6 transitions are executed and matched IN
> ISOLATION (`$80`'s `$9A56` exit, `$81`, `$82`, `$83`, `$84`'s BEQ-hold and
> advance paths, `$85`); of the **10 unported play arms**, 10 of 10 throw with
> their ROM address; of the `$96FB` game-over arm, 2 of 2 ported sub-paths (the
> `$B0`-gated hold, the `$4C` countdown) are executed and 5 of 5 unported
> sub-paths (`$970D`/`$9751`/`$9721`/`$97C5`/`$97F1`-demo) throw with their
> address.
>
> UNEXERCISED: the in-situ SEQUENCE — the chained `$80 -> $85` timeline and the
> 1022-field cartridge comparison through frame 2620 — because no
> `scen/endchain.json` field dump or `endchain` compare scenario exists (only
> `deep-ground`/`deep-page3`/`deep-page4`/`deep-powered`). The 768-frame `$82`
> duration and the 512-frame `$84` despawn crawl are unit-confirmed only in
> miniature (2 frames / 1 frame), not at scale; `$96FB` window field-exactness
> and rank != 1 are unmeasured. The `$1B` timeline itself is hook-confirmed
> (`throwaudit-endchain.json`), not field-compared.
>
> 4 of 28 checks are decorative or under-aimed and would stay green on the
> regression they name (lines 47, 245, 337, 348 — Findings A/B/D/C). The
> load-bearing `$9658` clear that the `$997E` dead-branch proof rests on is
> currently UNguarded by any test that can see it fail (Finding C).

## Must-fix priority

1. **Finding C** (line 348) — the `$9658` clear is the foundation of the
   `$997E` absence proof and no test can currently see it fail. Re-aim to
   `zp5B = 0xFF`, assert `=== 1`. (Exact code above.)
2. **Finding A** (line 47) — delete the tautology, or replace with a dispatch-
   separation assertion. (Exact code above.)
3. **Finding B** (line 245) — tighten the throw regex to `/B914/`. (Exact code
   above.)
4. **Finding E** — record `scen/endchain.json` + the `endchain` and `$96FB`
>   compare scenarios (plan done-when #7; W28 or a follow-up). This is the only
   path to the in-situ coverage the unit suite structurally cannot provide.
5. Findings D, F, G, H — minor cleanups; D's RED WHEN comment should be
   rewritten to claim only what it catches.
