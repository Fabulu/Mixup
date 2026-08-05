# 69 — TOOL: CHECKPOINTS THROUGH STAGE 1, AND SEEDING THE PORT FROM ANY OF THEM

status: **IN PROGRESS**

started: 2026-08-05
role: TOOLING (scope: `games/ddpdoj/tools/` and the oracle harness ONLY;
`games/ddpdoj/src/` belongs to T1 this wave and is NOT touched;
`games/gradius/` READ ONLY; `docs/worklog/ddpdoj/68-*` left alone)
target: `ddpdojblk` VERSION-B. Every address is build B (`$23xxxx`–`$2Axxxx`)
unless the line says otherwise.

**THE OWNER:** *"We need to oracle through the whole stages. Ideally with saved
states so we don't have to run everything fully all the time."*

`[M]` = measured by me this session.

---

## 0. THE BRIEF'S PREMISE, CHECKED

The brief says seed-anywhere is *"the capability Gradius has and this game does
not"*. **That is wrong, and it is worth being precise about why, because the
wrong half is the expensive half.**

Checked before writing any code:

- `games/ddpdoj/src/ram.js` — the port **keeps the board's own RAM layout**.
  Its header says so: *"here, seeding is a memcpy and 'player Y' is `$8103E8`
  on both sides"*. Gradius had to build an installer (`seedFromCartridge`);
  this port needs none.
- `frame.lua` has had `PROBE_RAMDUMP="lf:path"` since wave 4 — the whole
  128 KiB of main RAM at the sample point of one logic frame.
- `tools/portdiff.mjs` already takes `--seed-lf N` and starts the port there.
  **Every port gate in this game already begins mid-stage**: `fly-around` seeds
  at lf2000, `stage1-shot` at lf3716.
- `pgm.py seedstate` already takes a **MAME savestate** at the game's own sample
  point and resumes from it (wave 1).

So a port comparison starting at frame N is not missing. What is missing is
cheapness and reach, and those are the owner's actual complaint:

| the brief says | actually |
|---|---|
| the port cannot start at frame N | it has only ever started at frame N |
| we need savestates | we need **many seeds from ONE run**, which is not the same thing |
| — | `PROBE_RAMDUMP` takes **exactly one** logic frame per run, so a seed at frame N costs a full MAME run to N |
| — | no seed anywhere in this repo is later than **lf3716**; the stage is **19,217** frames long |

**Restating the task in the terms that make it cheap:** the expensive thing is
the MAME run, not the port. So take ONE long cartridge run over the whole stage
and harvest a checkpoint every K frames plus the per-frame reference trace; then
every later comparison is pure JavaScript over a file that already exists, and
no wave has to boot MAME again to look at frame 12,000.

(Findings below are appended as they arrive.)
