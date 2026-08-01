# Enumerate from the ROM. Comparison is validation, not discovery.

**Owner's correction, 2026-08-01, and it is a correction to how this project has
actually been working:**

> "Tracing individual shots won't work, we have to figure out the patterns the
> devs were using. Also, the oracle won't let us find everything, some shots
> track players so everything will look different depending on where players
> are. We have to find the tables where this is all kept in the ROM.
> **Comparison is for validation.**"

## What we were doing wrong

The oracle method (`01-the-oracle-method.md`) is excellent at answering *"is this
line right?"* and it has been mistaken for a way to answer *"what is there?"*

Those are different questions and only one of them is answerable by running the
game:

| question | tool | why |
|---|---|---|
| What entities/handlers/patterns EXIST? | **the ROM** — read the tables | finite, enumerable, complete |
| Which of them does our corpus reach? | measurement | a sample, and a biased one |
| Is our implementation of one correct? | **the oracle** — compare per frame | the cartridge arbitrates |

**Discovering content by measurement is discovering it one crash at a time.**
That is exactly what happened in Gradius: enemy bullets found by the owner
flying left of an enemy, `$A3B1` found by scrolling past `$0380`, then
`throwaudit.py` found fifteen more reachable paths — each one a thing the ROM
had listed all along, in a 42-entry dispatch table we could have read in full on
day one.

**The PRG is 32 KB.** It fits in a context window several times over. There was
never a reason to learn its contents by being surprised.

## Why it is worse for pattern-driven games

A Cave shooter's bullet patterns are **parameterised by the player's position**.
The same pattern generator produces different bullets in every run, so:

- two runs of the same scenario are not the same data;
- a corpus cannot enumerate patterns, because it never sees the same one twice;
- and a comparison that passes proves the generator matched *for that player
  path*, not that the generator is right.

The generator and its parameter tables are static. The bullets are not. **Port
the generator, validate with the oracle.** Trying to characterise a
player-tracking system from observed output is trying to reconstruct a function
from a handful of its values.

## The rule

> **Enumerate statically, then validate dynamically.** Read every table, every
> dispatch entry, every script record out of the ROM and write down the COMPLETE
> list before porting anything. Then use the oracle to prove each entry's
> implementation is right.
>
> A plan built from "what our runs reached" is a plan with an unknown amount
> missing, and the amount is unknowable by more running.

## The completeness ledger this implies

Every subsystem gets a count, from the ROM, before work starts:

```
dispatch table $AE1C:   42 entries   ported 7   throws 35   unreached-by-corpus 20
wave script stage 1:   339 records   decoded 339   spawn types referenced 23
```

Then "how far along are we" is a fraction with a known denominator, instead of
"everything we have tried works". Those two sentences have felt the same all
project and they are not remotely the same.

## Intervention runs give you STATES, not a picture of the game

Invulnerability, poked rank, seeded deep starts, forced counters — these are how
this project reaches code a scripted run cannot. They are indispensable and they
have a sharp edge, named by the owner when approving their use:

> "Just know that it'll lead to impossible gamestates, particularly a lot of DoJ
> would break. Bullets and enemy spawns will look different than they could in
> normal gameplay. That said, they are a very good source of information, just
> keep this in mind always."

**An intervention run is off-distribution by construction.** An invulnerable
player survives where a real one dies, so:

- **rank keeps climbing** past what any real run at that point would hold, and
  rank feeds aim, bullet speed, enemy HP and possibly spawns;
- **the player occupies positions no survivor could**, so player-tracking
  routines produce angles a real game never emits;
- **nothing is ever cleared by death** — bullets, objects and slots accumulate,
  so the sprite budget, the allocation-failure paths and the cap policy see
  pressure that ordinary play would not produce;
- **and the state may simply be unreachable**: a combination the game can enter
  only because we forced it.

### The rule this forces

**An intervention run is valid evidence for "what does this code do GIVEN this
state" and invalid evidence for "this is what the game does."**

So:

- Use them for COVERAGE — reaching a handler, a pattern, a boss, a late stage.
  This is what they are for and they are excellent at it.
- Use them for CORRECTNESS of a single routine, by comparing port and board
  under the *same* forced state, poked at the same instant on both sides.
- **Do NOT use them to characterise normal play** — spawn timing, bullet
  density, difficulty pacing, what a stage "looks like". Those need a run the
  game could actually produce.
- **LABEL THE PROVENANCE OF EVERY NUMBER.** "9,500 frames, invulnerable" is a
  different claim from "9,500 frames". A figure whose run conditions are not
  recorded will be re-read later as if it were ordinary play, and this project
  has already promoted a sampling fact into a claim about the cartridge twice.

### Practical, from the owner

For clearing enemies and bosses in a scripted run: sit bottom-centre, hold the
shot or laser, and move left and right a little. That is enough to kill most of
what appears without needing a route.

## What stays true about measurement

Nothing here retires the oracle. It stays the arbiter of correctness, and the
rule that a number is not a fact until measured is unchanged. What changes is
that **the ROM is the source of the INVENTORY**, and the oracle is the source of
the VERDICT. Using the verdict machine to build the inventory is how eight waves
of "no measured run has exercised this" turned out to be eight waves of
measuring the same impossibility.
