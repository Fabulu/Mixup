# Wave 9 (DECIDED, not yet started) — seed the port at ANY cartridge frame

status: PLANNED
wave: 9   role: plan   decided: 2026-07-31

**Owner decision: this runs AFTER wave 8**, and after the final full-corpus pass
that audits waves 1-8. Firing (wave 6), power-ups (7) and sound (8) land first.

## Why this exists

`00-plan.md` excludes the end of stage 1, the boss, and anything past world
x = 1024 on the grounds that they "need savestate support in the scenario
runner (replaying 2000+ frames from boot per scenario is not viable)".

**That reasoning is half wrong and it was repeated without being checked.**
Replaying from boot per scenario is indeed not viable. But dumping the machine's
state once at frame N and starting both sides from it is *exactly what this
harness already does* — and has done since the first scenario.

## What already exists (verified, not assumed)

- `scen.py` writes `seedRam`: the cartridge's full `$0000-$07FF` at the align
  frame, base64, into every scenario artifact.
- **`align` is already per-scenario**: `align = scn.get("align", defs["align"])`.
  Wave 4 already uses it — `intro-boot` aligns at frame 282, not 400.
- `porttrace.mjs`'s `seedFromRam(state, ram)` installs it into the port.
- Mesen exposes every memory space we need, enumerated in
  `capability_probe.lua`: `nesInternalRam`, `nesSpriteRam`, `nesPaletteRam`,
  `nesPpuMemory`, plus `nesDebug` for side-effect-free CPU reads.
- Savestates exist (`emu.createSavestate()` / `loadSavestate()`) but are legal
  **only inside an exec callback** — noted because that constraint will bite
  whoever reaches for them.
- `probe.lua` already samples `chrBank` (the CNROM selector at `$2D`) and
  `chrOffset`.

**So starting at an arbitrary frame is a config value today, not missing
infrastructure.** The capability question is answered: yes.

## The actual gap

The seed carries 2 KB of CPU RAM **and nothing else**. To start deep, the port
also needs the state it currently reconstructs by running from the beginning:

| missing | why the port needs it |
|---|---|
| PPU nametable (~2 KB) | the screen the terrain streamer has spent N frames building |
| palette RAM (32 B) | colours; the renderer reads them per frame |
| OAM (256 B) | the display list is built two frames ahead (`$8B10` from `$80A7`) |
| CHR bank | which pattern table the tiles come from |
| terrain build cursor | `$57`/`$58` — already watched, needs deriving into port state |

That is data plumbing into an artifact and a loader. It is not a new mechanism.

## The work

1. Extend the scenario artifact with `seedVram`, `seedPalette`, `seedOam`,
   `seedChrBank` alongside `seedRam`. Same base64 shape.
2. Extend `seedFromRam` (rename it — it is no longer only RAM) to install them.
3. Derive the terrain build cursor from the seeded state rather than replaying.
4. One deep scenario as proof: align somewhere past world x = 1024, where solid
   terrain starts, and compare.

## The caveat, which is the harness's own warning and not a new one

`porttrace.mjs` already says it plainly: seeding **inverts** the usual trap. The
normal risk is a harness inventing state the app never has; here the risk is
that seeding **hides** a bug, because a wrong port value gets overwritten by
real machine state before anything reads it. A deeper seed hides more.

So: **any deep-seeded scenario must also be reachable by a natural run at least
once**, or the seed set must be shown not to mask the thing under test. Wave 9
is not done when a deep scenario is green — it is done when a deep scenario is
green *and* something proves the seed is not doing the work.

## What it unlocks

The boss, the end of stage 1, the `$81-$8F` play sub-states, and every future
scenario at any frame for cheap — including for Batman and, later, DDP DaiOuJou,
where the same "start deep" problem is guaranteed to recur.
