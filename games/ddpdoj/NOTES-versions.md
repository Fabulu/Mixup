# The four sets on this machine — inventory

Measured 2026-07-31 with MAME 0.288 against `C:\oldpcsx2`. Nothing here is
copied from the ROMs; it is MAME's own metadata plus verification results.

**They are MAME PGM romsets, not PS2 images.** They live in a PCSX2 folder, but
so do `Batman - Return of the Joker (USA, Europe).zip` and `Gradius (USA).zip` —
that directory is simply where ROMs are kept. So the arcade oracle plan in
`NOTES-mame-oracle.md` applies unchanged.

## What MAME calls them

| set | MAME description |
|---|---|
| `ddp3` | DoDonPachi III (**World**, 2002.05.15 Master Ver) — the PARENT set |
| `ddpdoj` | Dai-Ou-Jou (Japan, 2002.04.05.Master Ver, 68k Label V101) |
| `ddpdojb` | Dai-Ou-Jou (Japan, 2002.04.05 Master Ver) |
| `ddpdojblk` | Dai-Ou-Jou **Black Label** (Japan, 2002.10.07.Black Ver, newer) |

`ddp3` is the parent; the others are clones. MAME lists eight clones in total —
`ddpdoj`, `ddpdoja`, `ddpdojb`, `ddpdojblk`, `ddpdojblka`, `ddpdojblkb`,
`ddpdojblkbl`, `ddpdojp`. We have four of them present.

## Verification

```
ddp3        best available   (1 OK)
ddpdoj      best available   (1 OK)
ddpdojb     best available   (1 OK)
ddpdojblk   best available   (1 OK)   <- from ddpdojblk.7z, see below
```

**"Best available" is expected and fine.** The only missing file is
`ddp3_igs027a.bin` — the IGS027A ARM7 protection ROM, marked
`NO GOOD DUMP KNOWN` by MAME itself. MAME simulates that device. This is the
provenance caveat already recorded in `README.md`: the binary our oracle runs is
a decrypted image plus a simulated device, and any hash we pin must say which.

### Black Label: use `ddpdojblk.7z`, and keep the bad zip out of the rompath

The first Black Label dump here was `ddpdojblk.zip`, which verified **bad** on
one file — `ddp3blk_defaults.nv`, the default NVRAM blob (settings and unlock
state, not code). Every program and graphics ROM in it was correct, and it
booted with a warning.

`ddpdojblk.7z` is the right set. It carries `ddb10_10_8_434f.u45` — the program
ROM MAME actually names for this clone — and the `cave_`-prefixed graphics ROMs,
and it verifies clean.

**THE TRAP, and it cost nothing only because it was caught immediately: an
archive with the set's name SHADOWS a better one.** With both `ddpdojblk.zip`
and `ddpdojblk.7z` in the rompath, MAME takes the zip and reports `is bad`.
Verified both ways in the same rompath. The two bad zips are therefore renamed
out of MAME's reach rather than deleted:

```
ddpdojblk.7z                     <- the good set, verifies "best available"
ddpdojblk.zip.SHADOWED-bad-nv    <- was winning; wrong ddp3blk_defaults.nv
ddpdojblk2.zip.dup-of-above      <- byte-identical to it (sha1 3879b1ed...)
```

If a future run reports Black Label as bad, **check for a `.zip` that has crept
back beside the `.7z` before believing anything else.** MAME resolves by set
name, not by quality, and it does not warn that a better archive was ignored.

The NVRAM question is still live and still interesting: NVRAM defaults are
plausibly what makes a set "unlocked", which is why the versions recon is asked
to find out what "unlocked" concretely means.

## It runs headless, and fast enough

`-video none -sound none -seconds_to_run 3 -nothrottle`, both exit 0:

```
ddp3        Average speed: 149.60%
ddpdojblk   Average speed:  68.95%   (+ the .nv warning)
```

Above realtime with video off means oracle runs are practical. The 69% figure
includes init over a 3-second sample and should not be read as a steady-state
rate — re-measure over a longer run before quoting it.

## Two owner claims that must be VERIFIED, not assumed

Written down as hypotheses because this project has been bitten by inherited
claims (`PROBE.md`'s X clamp, the `$44` weapon values, "enemy bullets are
unreachable"):

1. **"`ddp3` is the location test, it's unlocked, our atlas to cheat."** MAME
   calls `ddp3` the **World Master** version, not a location test. There is a
   separate `ddpdojp` clone whose name suggests prototype. Either MAME's label
   or the assumption is wrong — settle it by booting and looking, and find out
   what "unlocked" concretely means here (a service-menu flag? the `.nv`
   defaults? a build difference?). If it really does expose everything, it is
   worth exactly as much as claimed: an atlas that makes later stages, weapons
   and modes reachable without playing to them.
2. **"Black Label has a smaller hitbox."** Plausible and widely believed, but
   unmeasured by us. It is also the version we intend to port, so its hitbox is
   not trivia — it is a number the port has to get right. Note the zip contains
   a file named `ddb_1dot.u45`, and "1 dot" refers to a hitbox-display variant,
   which is suggestive but not evidence.

## Decision

**Black Label (`ddpdojblk`) is the port target**, per the owner. The others stay
in the tree for comparison and as possible selectable alternatives later. Keep
all four; they are the only way to tell a version difference from a port bug.

## The ROM

Not committed, not redistributed, not in this repo. Supplied by whoever runs it,
from their own board or dumps, exactly as with Batman and Gradius.

---

## MEASURED ANSWERS — appended 2026-07-31 21:2x by the versions recon

Full evidence, with commands and output, in
`docs/worklog/ddpdoj/00-recon-versions.md`. Headlines only here:

1. **Nine sets, not four.** `ddp3.zip` is a MERGED romset (33 files, 108 MB
   uncompressed) carrying every clone in `clonename/` subdirectories. All nine
   `-verifyroms` OK; **`ddpdojp` (the location test) and `ddpdojblkbl` verify
   `good`**, the rest "best available" (only the undumped IGS027A missing).
2. **Claim 1 is FALSE as stated.** `ddp3` is the World release, banner
   `2002.05.15 MASTER VER`, ordinary attract. **The location test is `ddpdojp`** —
   different 128 KiB BIOS, 4 MiB unprotected program — and we have it. No
   "unlocked" mechanism was found in any set; see the worklog for where I looked.
3. **`ddpdojblk` is a TWO-VERSION cartridge.** It boots to a chooser,
   `1: VERSION-A (OLD)` / `2: VERSION-B (NEW)`, with a 5-second countdown that
   **defaults to VERSION-A = `2002.04.05 MASTER VER`**. VERSION-B is
   `2002.10.07 BLACK VER`. **A harness that boots and waits is measuring the wrong
   game.** Press `P1 Down` then `P1 Button 1` in the first ~5 s. **The choice is
   persisted in NVRAM** — a `sram` saved after choosing B reboots with the cursor
   already on VERSION-B, so the harness can carry a pre-set image instead of
   scripting the chooser every run. Candidate flag byte `0x03810` (`00`→`01`),
   a lead, not confirmed.
4. **"It still boots, with a warning" was wrong.** With the mismatched NVRAM the
   machine sits on **`ROM ERROR !`**. Reproduced deliberately: replacing the 8-byte
   magic at `0x3800` with `ddpdojblka`'s, or with zeros, gives `ROM ERROR !` on
   every sampled frame. MAME still exits 0 and prints an average speed.
   `docs/knowledge/02-traps.md` trap 2 — look at the framebuffer.
5. **The NVRAM is NOT where "unlocked" lives.** The factory blobs have **80–97
   non-zero bytes out of 131,072**, all inside `0x03800..0x03985`: an 8-byte boot
   magic plus a default-settings block. `ddpdojblk`'s and `ddpdojblka`'s blobs
   differ in **exactly 8 bytes — the magic**.
6. **A usable `.nv` CAN be produced from the machine**: run with
   `-nvram_directory <dir>` and MAME writes `<dir>/<set>/sram`, 131,072 bytes, magic
   intact. It cannot manufacture a blob matching a CRC for a set whose factory dump
   you lack — the magic is not derivable.
7. **`ddb_1dot.u45` shows no hitbox dot.** Identical 2,800-frame scripted session on
   all three Black Label sets: `ddpdojblka` (1dot) and `ddpdojblkb` are
   **pixel-identical** (0 of 301,056 bytes differ); `ddpdojblk` differs by 1.9%,
   confined to a 57×58 box around one enemy, not the player. Evidence against the
   "1 dot = hitbox display" reading — not proof of absence.
8. **The hitbox itself is still UNMEASURED.** See the worklog for what was tried.
9. **Program-ROM diff (decrypted, dumped from `:maincpu` at runtime).** The BIOS is
   byte-identical in every set except `ddpdojp`. The first ~236 KiB of program
   (`0x100000..~0x139FB8`) is identical across **all seven** 68k builds. Beyond
   that the builds are relayouts, not patches: `ddpdoj` vs `ddpdojblk` share only
   the first 256,979 bytes; `ddpdojblk` vs `ddpdojblkb` share 1,303,873 then differ
   for 568,033 then share the last 225,246.

Tooling left behind: `games/ddpdoj/tools/drive.lua` (DIP overrides + scripted
button presses + framebuffer snapshots, all from env vars) and
`games/ddpdoj/tools/dumpregion.lua` (dump any MAME region, and print the region /
share / screen inventory). Both were used for everything above.

**Operational traps found the hard way:** use forward slashes in `-rompath`;
`-nonvram_save` does **not** stop `cfg/<set>.cfg` being written, so a service-mode
DIP change persists into later runs unless you pass `-cfg_directory`; and
`emu.add_machine_frame_notifier` has the same dropped-handle GC trap as
`install_read_tap` — keep the handle in a global or it silently stops firing.

---

## WAVE 1 — the version trap, closed by procedure (2026-07-31)

Full evidence: `docs/worklog/ddpdoj/01-impl-oracle-pin-versionb.md`.
Harness note: **`games/ddpdoj/NOTES-oracle.md`** — one harness, `pgm.py`.

1. **The chooser trap is now a controlled pair of runs, not a warning.** Through
   the same harness, with only the chooser input differing:
   * no input, countdown expires → arm PC `$13C5B6` on 1600/1600 logic frames,
     legal screen **`2002.04.05.MASTER VER`**;
   * P1 Down @lf560 + P1 Button 1 @lf600 → arm PC `$23C212`, legal screen
     **`2002.10.07.BLACK VER`**.
   Every probe run now prints which build it is in and FAILS if it is the wrong
   one — including on its LAST frame, because the chooser is build-A code and
   "some frames were in B" would let a timeout fall-through pass.
   **Assumption 3 of `PLAN-vertical-slice.md` is confirmed and captured.**

2. **A seeded NVRAM makes VERSION-B the silent default.** Procedure, output and
   caveats are in `NOTES-oracle.md` §7. The image is a snapshot of the board's
   RAM, is ROM-derived and is never committed; produce it with
   `python games/ddpdoj/tools/oracle/pgm.py seed`.

   ```
   sha256 3c4d8ef5818fbf8cfc0715ba91515f9399cc6255b579ceff6f4c56c9f5235e84
   131072 bytes, 3244 non-zero, $01400..$1FFFF
   ```

3. **`$03810` is confirmed as the version flag** — the candidate this file
   recorded as "a lead, not confirmed". It is `00` in `ddp3blk_defaults.nv` and
   in main RAM at boot, and `01` in an image saved after choosing VERSION-B.
   The `sram` file is word-swapped relative to main RAM (`region[i] ==
   mainram[i^1]`), so which of `$803810`/`$803811` that is was not established.

4. **`ddpdojblk` still verifies "best available" from `ddpdojblk.7z`**, and the
   two bad zips are still renamed out of MAME's reach. The harness prints an
   FNV-1a-64 of the DECRYPTED `:maincpu` region on every single run
   (`maincpu_fnv64=D4C25CA9C91B9D47`, 6,291,456 bytes) so that a ROM directory
   edited by another agent stops a cross-session number loudly.

5. **A new determinism risk was found and bounded: the V3021 RTC.** The game
   reads the calendar and it lands in main RAM; two runs 26 hours apart differ
   in exactly ten bytes. See `NOTES-oracle.md` §5. It is carved out of the RAM
   digest into its own reported column, not hidden.
