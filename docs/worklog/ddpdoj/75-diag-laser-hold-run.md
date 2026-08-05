# 75 — DIAG: the owner's own run (park at the bottom, hold the laser), and what the invisible things ARE

status: **IN PROGRESS**

started: 2026-08-05
role: SCENARIO + DIAGNOSTIC. Scope: `games/ddpdoj/tools/` and the scenario
corpus. **`games/ddpdoj/src/` belongs to T1 this wave and is NOT written to.**
`games/gradius/` not touched.
target: `ddpdojblk` VERSION-B. Every address is build B unless the line says so.

**THE OWNER, verbatim:**

> *"Also, launch an oracle backed run where you sit at the bottom of the screen
> and just shoot your laser. That way you should kill the mid boss. Then those
> invisible things you hit should appear. Maybe debris or something? But weird"*

`[M]` = measured by me this session. Anything from another document is `[cited]`
and named.

---

## 0. THE SCENARIO — `stage1-laser-hold`, and every number in it was measured first

`games/ddpdoj/tools/oracle/scenarios.json`, additive:

```
tail = 1970=DA;2200=DAL;2400=DAR;2502=DA
```

**LABEL, and it goes first: this is SCRIPTED INPUT, NOT A HUMAN PLAYING, and the
ladder is POKED.** `$810424` (the player's `($3e,A6)` invulnerability timer) is
held at `$FF` from lf1960 on both sides. `docs/knowledge/09`: this yields
STATES, not a picture of the game.

Everything in that one line was measured on the board before it was written
(`out/w75/probe.tsv`, `walls.tsv`, `step.tsv`):

| `[M]` | value |
|---|---|
| the player record does not exist until | **lf1968** — a 150-frame `D` from lf1750 moved nothing at all |
| the vertical wall pair | `$800` = **the BOTTOM** (confirmed on a framebuffer PNG) and `$6500` = the top |
| the horizontal wall pair | `$300` left, `$3500` right, centre `$1C00` |
| holding Button 1 drives the speed index | **22 → 12 by lf2052** — the laser ramp `$24C8BE`, i.e. the laser is UP |
| the horizontal step at index 12 | **exactly 63 units/frame** |
| the parked position | `py = $800` (bottom wall), `px = $1C1A` — 26 units, ~half a pixel, right of centre |
| this script WITHOUT the poke dies at | **lf2426** (`pst` 32768 → 36864 → 256, respawn lf2499) |

`D` stays held for the whole run on purpose: it is what *sitting at the bottom*
means, it pins the ship so nothing can drift it, and it keeps the input word
constant for 17,000 frames.

**NOT Button 3.** The corpus's own idiom for "firing" is the auto-shot, and W69
`[cited]` measured that the port blocks on its first frame (`$2497AA`, and
`$80380F` is `$01` on this cartridge). **NOT a tap** — the owner asked for the
LASER.

`stage1-laser-hold-natural` is the same script with no poke, 6,000 frames: the
control that answers what an invulnerable run cannot.

---

## LOG (appended as findings arrived)

- opened.
- `[M]` **the brief's premise checks out on the board**: a ship parked on the
  bottom wall with the laser held is killing things from lf2100 on (score 59,240
  by lf2590 on the un-poked probe run).
