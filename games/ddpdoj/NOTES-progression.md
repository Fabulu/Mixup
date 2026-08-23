# Progression, round selection, and Hibachi

Updated: 2026-08-23
Target measured: DoDonPachi DaiOuJou Black Label Version-B

This file separates cartridge-proven Version-B behavior from external White Label
claims. Black Label addresses and numeric conventions must not be reused for White
Label until that cartridge is decoded independently.

## 1. Startup selection path

Slot `[8]` accepts START and creates slot `[9]` at `$25AC98`. Slot `[9]` then
runs three selections:

1. State 1 at `$25D1DA` presents two fighters.
2. State 2 at `$25D164` maps the cursor through `$25CF60`, whose values are
   `{0,2}`, into object bytes `+$08/+$09`.
3. State 4 at `$25D402` presents three Element Doll/style choices.
4. State 5 at `$25D39C` maps the cursor through `$25D294`, whose values are
   `{2,4,6}`, into object bytes `+$04/+$05`.
5. State 7 at `$25D560` calls the round selector at `$25FAA4`.
6. `$25FB98` writes the confirmed round choice to `$80393A`.

The permanent selection handoff at `$26070C` proves these fields:

| meaning | P1 | P2 | values |
|---|---:|---:|---:|
| fighter/ship | `$813084` | `$813086` | `0`, `2` |
| Element Doll/style | `$813088` | `$81308A` | `2`, `4`, `6` |

The fighter and Doll names are rendered as sprite artwork and have not yet been
decoded into text. Do not guess the human name mapping from selector values.

The round labels are exact cartridge text streams:

| address | cartridge text |
|---|---|
| `$25FC68` | `1 ROUND GAME` |
| `$25FC78` | `2 ROUND GAME` |

The live cursor is `$813074`. The confirmed value is `$80393A`:

| value | meaning |
|---:|---|
| `0` | `2 ROUND GAME` |
| `1` | `1 ROUND GAME` |

The default is 0, so Version-B defaults to `2 ROUND GAME`. Phrases such as
"one-loop mode" and "two-loop mode" are semantic descriptions, not the text
printed by this cartridge.

## 2. Round and stage state

| address | meaning |
|---|---|
| `$813092` | stage number, zero-based |
| `$813094` | stage number times 2 |
| `$813096` | stage number times 4 |
| `$813098` | round counter: 0 for round 1, 1 for round 2 |
| `$813074` | live round-mode cursor |
| `$80393A` | confirmed round mode |

The real second-round transition is `$290762`, which writes `$813098 = 1`.
Writes around `$259DB0/$259DC6` belong to debug or restart-stage selection and
are not the ordinary round transition.

## 3. Black Label Version-B round-2 qualification

The exact gate is `$2901E0`, translated as `menuGate2901E0` in
`src/objslot7pool.js`.

It first requires all of these:

1. `$813098 == 0`: only round 1 can offer round 2.
2. `$80393A == 0`: only `2 ROUND GAME` can offer round 2.
3. `$813090 != 3`: both players simultaneously live veto the offer.
4. The selected player's `$81B49A/$81B49E == 0`: a continue veto.

After those vetoes, any ONE of these qualifies:

| condition | exact Version-B comparison | passing values |
|---|---|---|
| Bee Perfect progress | `$817F82 >= $000C` | three successful stages, four cursor bytes each |
| miss/death counter | `$812938/$81293A < 2` | 0 or 1 |
| bomb-use counter | `$812940/$812942 < 3` | 0, 1, or 2 |

The three qualification arms are OR conditions, not AND conditions. The sign of
`$8130BE` selects the side: nonnegative uses P1 counters and negative uses P2.
There is no score comparison in this Black Label Version-B gate.

Public guides commonly say "at most two misses" and "at most three bombs". The
measured gate literally uses `< 2` and `< 3`, and the known producers increment
the counters directly. Keep that discrepancy explicit. Do not change the port to
public `<= 2` or `<= 3` wording without cartridge evidence that counter
initialization changes the apparent boundary.

When qualification succeeds, `$290B44` opens inner state 4 and `$2911B0` runs a
two-choice, 600-frame menu. Selection 0 accepts round 2. Selection 1 declines,
is the default, and is also selected by timeout. Accepting runs `$290762`, writes
the round word, and creates type `$11`, slot `[17]`. The graphical option labels
have not yet been decoded.

A progression oracle may poke these counters at the decision sample point to
exercise round-2 content. Such a run proves the decision and later content, not
that ordinary play naturally earned the qualifying values. Any oracle
invulnerability must remain explicit test setup and must not enter ordinary
browser launches.

## 4. Exact Kouryu-to-Hibachi route

Stage 5's static script `$237978` contains one type `$B0` record at `$239168`:

```text
03 1A 00 00 B0 80 10 F6
```

The type-table entry at `$27E592` maps it to init `$2A42D4`, init body
`$2A42DC`, and handler `$2A4606`. There is no separate conditional type `$B0`
producer after the preceding form. The normal boss route and continuation are
inside this object and its scripts.

A4 script 1 contains the decisive fork:

```text
$2A5C7A  tst.w $813098
$2A5C80  bne   $2A5D14
$2A5C84  tst.w $80393A
$2A5C8A  bne   $2A5D14
```

If either word is nonzero, `$2A5D14` takes the continuation route. `$2A5D28`
releases the stage-5 scroll park, `$2A5D30` starts A4 script 2, `$2A5F40` arms
the second-form route, and `$2A5F4C` installs the next HP pool.

If both words are zero, `$2A5C8E..$2A5CB6` starts A4 script `$14`, which waits
and suspends the stage without the continuation. Type `$B0` later reaches its
own completion path at `$2A4614`. Do not add a separate Hibachi branch to
`stageend.js`.

The cartridge does not embed the names Kouryu and Hibachi at this fork. Those
names identify the route externally. The branch behavior itself is
cartridge-proven:

| round word `$813098` | mode `$80393A` | route |
|---:|---:|---|
| 0 | 0, `2 ROUND GAME` | end after the preceding form; skip Hibachi in round 1 |
| 0 | 1, `1 ROUND GAME` | continue into Hibachi |
| 1 | 0, round 2 | continue into Hibachi |
| 1 | 1, artificial combination | continue because the tests are OR conditions |

Therefore:

- `1 ROUND GAME` gives the Hibachi continuation unconditionally after the player
  reaches and defeats the preceding route in round 1.
- `2 ROUND GAME` skips Hibachi in round 1.
- `2 ROUND GAME` gives the Hibachi continuation unconditionally when round 2
  reaches the fork.
- Bees, misses, bombs, continues, and score qualify access to round 2. They are
  not rechecked as Hibachi appearance conditions at the final fork.

## 5. Current implementation status

Production already translates and tests:

- startup fighter, Doll/style, and round selection;
- `$80393A` persistence;
- `$2901E0` qualification, vetoes, side selection, and literal boundaries;
- the round-2 offer and `$813098 = 1` transition;
- Bee Perfect, miss, bomb, and continue counters;
- the static type `$B0` spawn and init;
- the `$2A5C7A/$2A5C84` final route fork;
- Hibachi continuation scripts and stage completion.

One cartridge-proven production defect remains at this writing.
`src/objslot17.js` `phase5_25D39C` returns immediately when `$813098` is
nonzero. The cartridge's `$25D3A2 bne $25D3C4` skips only the style-value rewrite
at `$25D3A6..$25D3C2`; it still executes the common display tail and advances
record state 5 to 6 at `$25D3E2`. The current return can leave the second-round
slot `[17]` handoff stuck forever. `tests/w373slot17.test.js` currently pins that
incorrect behavior and must be corrected with the production fix.

Some comments in `objslot17.js` also reverse fighter and style terminology. The
behavior stores them correctly: fighter is `$813084/$813086`, Doll/style is
`$813088/$81308A`.

## 6. White Label remains separate

The following are external reports, not cartridge-proven White Label behavior in
this repository:

- White Label automatically qualifies for its second loop rather than offering
  Black Label's one-round shortcut.
- It shares miss, bomb, and Bee Perfect routes.
- It has a White Label-only 350,000,000-point alternative.
- It resets or carries lives, bombs, capacity, and hypers differently from Black
  Label at the transition.

White Label uses different state conventions, including observed `$80393A` byte
values 0, 1, and 2, and `$813098` is not known to be directly comparable across
available sets. Decode its own selector, qualification routine, and transition
before implementing it. Do not reuse these Black Label addresses by analogy.

External references:

- <https://shmups.wiki/library/DoDonPachi_DaiOuJou>
- <https://zps-stg.github.io/other/cave-loop2>
- <https://www.world-of-arcades.net/APPA/DDD/DoDonpachi_DAI-OU-JOU_BL/DdpDaiOuJouBl_Manual.pdf>
