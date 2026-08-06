# OWNER DIRECTIVE - scenarios must PLAY, not just move

status: BINDING on every scenario from here (approvals + directive)
raised: 2026-08-02 by the repo owner

## 1. Poked validation: APPROVED

> "I approve poked validation, whatever this means."

What it means, so nobody has to reconstruct it: **every multi-bullet fan in the
game is gated on `$813098`**, which has read 0 on every frame ever measured. At
that value each generator provably emits ONE bullet, so the spreads exist in the
code and have never been observed. Poked validation = force `$813098` non-zero
on the board AND the port at the same instant, then compare per frame.

**Two claims, kept separate, always:**

- *the generator is correct* - what a poked run proves, and it is a real proof;
- *the game reaches this state in play* - what a poked run does NOT prove.

Label every fan measurement `$813098 poked` in the worklog and the gate output.
Same discipline as Gradius's rank thresholds, which are unreachable below rank 2
in ordinary play and were validated by poking both sides.

## 2. Scenarios must behave like a PLAYER

> "Your oracle runs might need to get more creative. Fire your guns and your
> laser. Maybe throw a bomb at times. Behave like a player a little and kill
> enemies. That probably triggers stuff."

**This is the same finding Gradius produced from the other end**, and it is now
two-for-two across different machines:

> every UNPOWERED Gradius run stalled at scroll ~`$04BD`; the run carrying
> power-ups reached `$0A64` and four otherwise-unreached handlers

Our scripted runs have been *passive* - hold a direction, observe. A player
**fires**, and firing is not cosmetic:

- **killing enemies** removes them, which changes what is on screen, which
  changes what spawns, what aims, and what the sprite budget holds;
- **kills feed score, chain and rank**, and rank feeds aim, bullet speed and
  enemy HP - so a run that never kills anything is pinned at the bottom of a
  feedback loop the whole game is built around;
- **bombs move rank** (the owner: "one wrong rank gain from using super and the
  entire route breaks");
- **death paths, drops and explosion scripts** are unreachable without kills.

So a passive run does not merely cover less - it samples a *different game*,
one held at minimum rank with nothing dying. Every "0 divergent frames" from
such a run is a statement about that game.

**The rule:** a scenario intended to cover CONTENT must fire, kill and
occasionally bomb. Keep passive scenarios only where the point is to isolate one
variable (the fly-around's clamp checks, for instance), and say which kind each
scenario is.

Practical driving, from the owner: sit bottom-centre, hold shot or laser, drift
left and right. That clears most of what appears without needing a route.

**Note the tension with `docs/knowledge/09`:** an INVULNERABLE run is off-
distribution and valid only for coverage. A *playing* run is on-distribution and
valid for both - so a scripted run that fires and survives is worth more than an
invulnerable one, wherever it can be produced. Prefer it.

## 3. The first enemies already exercise the aim system

> "The first enemies in the game that you captured on your recording - those
> have rotating turrets that point at you the whole time."

**That is the aim system, live, in the opening seconds**, and it is the single
most useful thing in this note.

- The aim recon called the aim "a pure function with a census to test against".
  Here is a continuous, per-frame, *visible* consumer of it, available at the
  very start - no deep seeding, no invulnerability, no poking required.
- A rotating turret exposes the function's OUTPUT as an animation frame or
  angle index in the object record. Watching one turret across a run where the
  ship moves sweeps a large slice of the input space cheaply.
- It gives an immediate, human-checkable acceptance test for the port: **do the
  turrets track the ship?** A wrong angle table, a wrong quantisation or a
  wrong fixed-point convention is visible at a glance rather than as a byte
  difference on frame 4,012.

**Consequence for wave order:** whichever wave ports these enemies should port
the aim pair with them and validate on turret angle per frame. That is a better
first test of the aim system than any bullet, because the turret aims
continuously while a bullet samples the function once.
