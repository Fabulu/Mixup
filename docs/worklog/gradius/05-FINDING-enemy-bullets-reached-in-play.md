# FINDING — enemy bullets are reached in ordinary play, and the plan says they are not

status: DONE -- and the port work is done too, in wave 11.
        See `11-impl-enemy-bullets.md`: $BC59, $BCB5, $83B5, $BDD5, $C20A, $C2FF
        and $BF75 are ported, four scenarios compare them per frame against the
        cartridge, and the watch list grew 872 -> 1022 because slots 22-31 had
        never had a single watched byte. The second half of "What still needs
        doing" below -- re-auditing every other "no measured run has exercised
        this" throw -- is NOT done.
role: bug report from play   found: 2026-07-31

## What happened

The owner flew around the live build — left, right, up, down, nothing exotic —
and after 10-30 seconds the game **froze**. No message, no error box, just a
still picture. The console had this the whole time:

```
Uncaught Error: enemy slot 16 fired: the player is at X=35, left of the enemy
at X=36, so $BC56 BCC reaches the enemy-bullet allocator at $BC59. Slots 22-31
and their mover $BDD5 are not ported (no measured run has populated them; the
plan excludes them pending a recon).
    at fireBullet (enemies.js:447:9)
    at enemyBullets (enemies.js:416:5)
    at mode5Body (nmi.js:348:3)
    ...
    at tick (main.js:141:7)
```

## Two separate defects, and the second one is ours twice over

### 1. The exclusion's PREMISE IS FALSE

`00-plan.md` excludes enemy bullets with this reasoning:

> **Enemy bullets (slots 22-31), the armoured branch, ... All listing-only — no
> run has exercised them. They are loud throws.**

and the wave-3 notes repeat "no measured run has ever populated slots 22-31".

That was true of **our corpus**. It is not true of **the game**. `$BC56 BCC`
fires whenever the player is to the LEFT of an enemy — which is most of the
time for a real player, and never for our scenarios, because they hold the ship
at X≈70-100 in short scripted windows near the start.

**This is coverage proportional to the corpus, not to the content**
(`docs/knowledge/03`). We wrote down "no measured run has populated them" and
then read it back as "the game does not do this". Those are different
statements. The first is a fact about our sampling; the second is a claim about
the cartridge, and it is wrong.

The recon follow-up the plan names as the prerequisite is now overdue rather
than speculative, and it has a reproduction: fly left of an enemy.

### 2. The throw was INVISIBLE, and Batman already fixed this exact thing

Every unported path here is a loud named throw, deliberately, so that running
out is a precise pointer instead of a mystery. That design worked — the message
names `$BC59` and `$BDD5`.

But a throw inside `tick()` escapes into `requestAnimationFrame`'s callback,
where nothing is listening: `boot()` resolved long before, so the page's
`await boot(canvas)` try/catch cannot see it. The loop stops being rescheduled
and the canvas holds its last frame. **A perfect named error, delivered nowhere.**

Batman's launcher carries a comment about precisely this failure — an async
failure after `boot()` resolves "used to leave the frame loop dead with the
music still playing, and nothing on screen said so ... it needs its own
channel." Gradius's page was written later and did not inherit it.

Fixed: `boot()` takes `opts.onError`, `tick()` wraps its body, stops the loop
cleanly (rather than throwing once per frame forever), reports, and rethrows so
the console trace survives. The page renders it in the existing error box.

**NOT VERIFIED IN A BROWSER.** No agent here has one. The gate is green (189
unit tests, 6 stages, 0 SKIPPED) and that is all it proves. Someone has to fly
left of an enemy on the live build and confirm a message appears where a freeze
used to be.

## What still needs doing

- ~~**Port enemy bullets** (slots 22-31, `$BC59` allocator, `$BDD5` mover).~~
  **DONE, wave 11.** The reproduction in this file is now four oracle scenarios;
  `$BC63`, the allocation failure that drops a shot when all ten slots are full,
  is one of them. What is still unreached by any scenario is `$BF7D`, a player
  shot destroying an enemy bullet — ported, unit-tested, and measured n=0 in two
  runs with A held and ten bullets converging.
- **Re-audit every other "no measured run has exercised this" throw** the same
  way. The armoured branch, the type-`$9A` hit counter, `$A3B1`, the two
  `>=$F0` spawners and the missile crawl path all rest on the same reasoning,
  and that reasoning has now been shown to be about our corpus rather than
  about the cartridge. At least one of the others is probably reachable too.
