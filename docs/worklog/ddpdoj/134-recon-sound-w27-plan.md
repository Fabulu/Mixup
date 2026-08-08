# 134 -- RECON: plan the W27 sound process (10 recons + architect + waves)

status: DONE   role: read-only recon   round: W27 sound (owner "Go for sound")

Owner forward directive: "Go for sound." Stage 1 is feature-complete + honest
(W127), so the W27 trigger is met. This recon plans the owner's binding W27
process for the DOJ sound subsystem: **10 recons (5 codebase / 5 web) + 1
architect, THEN waves.** It does not implement anything.

# 0. PREMISE CHECKS (the brief's own rule: 47 briefs rested on something false)

1. **"The architect is Fable" (W27 doc, W119 table) - STALE on one word.** W27
   (`27-OWNER-sound-queued-after-stage-1.md` line 18, 28) and the W119 table
   (line 146) both say "a FABLE architect." But the project's CURRENT practice
   is the opposite: HANDOVER 7c/7d/7e/7f all run the strategic round as
   "5 recons + architect (own model, NOT Fable)", and this brief says "the
   session's own model, NOT Fable." The shape (10 recons + 1 architect + waves)
   is unchanged and binding; only the model label moved. The architect is **the
   session's own model**, not Fable. Flag so the wave dispatcher does not spin
   up a Fable run on the W27 doc's literal text.

2. **"The sound-enable flags `$803926`/`$80392A`/`$80380A` are already tracked"
   (W119 Phase 5a) - CORRECT, with a dual-role footnote.** Recon 50 line 370
   confirms `$28C02A` and `$28C0AE` "both gate on `$80380A`, `$80392A` and
   `$803926`." BUT `$803926` has a second, gameplay meaning: `handlers.js:3250`
   reads it to choose the midboss block column (47 vs 41). So it is either a
   shared flag or a sound flag whose value the gameplay reads; the 68k-side
   codebase recon (C1) settles which. Not false, just dual.

3. **"`$28C02A` is a named cue table" - FALSE (already killed in W119, restated
   so it stays dead).** `$28C02A` is the BGM/streaming cue ROUTINE, reached
   PC-relative via `jsr ($28C0AE,PC)` / `jsr ($28C02A,PC)` with D0/D1/D2 =
   id/pan/channel. It is noted (not ported) at ~12 call sites across
   stageend.js, shots.js, laser.js, spark.js, midboss.js, hud.js, handlers.js.
   Its sibling `$28C0AE` is the SFX cue routine. The cue "family" is routines,
   not a table.

4. **"DOJ has zero sound" (brief, W119) - CONFIRMED.** No `src/sound.js`, no
   `src/audio/`, zero writes to `$C00003`/`$C10000`/ICS ports anywhere in
   `games/ddpdoj/src`. Every `$28C0xx` site is a `note()` placeholder. The only
   sound artifact in the tree is the capture set under `rip/sound/` plus
   `NOTES-sound.md` (status: PLANNING, no port work started).

5. **"samples are 8-bit mono 11025 Hz" (NOTES-machine.md line 437) vs
   "fmt=16bit" (keyon.tsv) - APPARENT CONFLICT, settle in C3/W4.** The ics
   region is documented as 8-bit mono 11025 Hz, but keyon.tsv's first rows all
   read `fmt=16bit`. The ICS2115 has a per-voice format field (`conf&1`=ulaw,
   `conf&4`=8bit, else 16bit, per frame.lua:1480-1482), so the ROM holds mixed
   formats and "8-bit mono 11025 Hz" is at best the bank-0 default. Recon C3
   reconciles this against the datasheet.

# 1. THE BINDING INPUTS

## 1a. The W27 decision (owner, 2026-08-04, binding)
`docs/worklog/ddpdoj/27-OWNER-sound-queued-after-stage-1.md`. Verbatim shape:
"TEN recons, then a [session-model] architect, then implementation waves" -
5 recons on the CODE BASE (ROM, disassembly, our own port: what the driver is,
where its tables live, how the game addresses it, what RAM it touches, the
ICS2115 register interface from the 68000 side, how cues are triggered and by
whom), 5 recons on the WEB (ICS2115 hardware docs, the PGM sound subsystem
generally, any public analysis). Owner framing: "The sound side is no longer
comparable to reproducing a handful of Game Boy sound channels." Scale is
deliberate: "I want all the info we can get for it." Treat the recon output as
the INVENTORY (`docs/knowledge/09`): enumerate statically before deciding what
can be ported; do not let a plan get written from measuring a few cues.

## 1b. The W119 Phase 5a sound section (the prior architect's map)
`docs/worklog/ddpdoj/119-strategic-plan.md` lines 120-124. Key points, all
reproduced by this recon:
- DOJ has zero sound. The owner's W27 process is explicit and binding.
- The captures are unusually complete: `mailbox.tsv` (657 rows, frame-exact cue
  oracle), `keyon.tsv` (1,620 keyons), `ics.tsv` (5.3 MB register stream),
  `z80ram.bin` (64 KB runtime image).
- Stage-1 cues draw only from `cave_m04401b032.u17` (4 MB); shipping sound
  roughly doubles the 2.7 MB payload.
- Wave A (68k cue post/queue, state-exact, no audio, oracle = mailbox.tsv) is
  the keystone. Wave B (Z80 driver listing + upload source hunt) is the
  load-bearing unknown. Wave E (ICS2115 synthesis) is a research problem that
  must not look like "the last 10% of the port."
- Cross-game: no shared synth (DMG vs APU vs ICS2115). The shared asset is the
  METHOD: Gradius `sound.js` + `apu.js` + `output.js`.

## 1c. The DOJ sound subsystem (three CPUs, none ported)
From `games/ddpdoj/NOTES-machine.md` + `NOTES-sound.md` + the ROM:

| CPU | part | clock | role |
|---|---|---|---|
| 68k | main | PGM | game logic; posts cues through the mailbox |
| Z80 | `:soundcpu` | 33.8688 MHz / 4 = 8.4672 MHz | the sound driver; **uploaded, no ROM** (pgm.cpp:29) |
| ICS2115 | `:ics` WaveFront | 33.8688 MHz | 32-voice wavetable synth |

- The 68k-to-Z80 command path is a MAILBOX, not a byte. A write tap on
  `$C00003` sees the doorbell (it pulses the Z80 NMI); the payload is the
  preceding writes to the `$C10000-$C1FFFF` shared RAM window
  (`frame.lua:1416-1444`). Wave 0 measured every doorbell as `data=0001` from a
  single PC (`$18AD78`, a BIOS routine): "a bell, not a message."
- The Z80 has 64 KiB RAM and NO ROM. Its whole program is uploaded through the
  `$C10000` window by the 68k early in boot. There is therefore NO static
  disassembly target for the Z80 driver; its program must be located inside the
  decrypted 68k image (the `_z80_blob` hunt, `pgm.py:937`).
- The Z80 drives the ICS2115 through I/O ports `$8000-$8003`: port 1 selects a
  register, ports 2/3 are the data low/high bytes (`frame.lua:1389-1392,
  1493-1509`). Register `$4F` selects the active voice, `$0E` sets the
  active-voice count, a write of 0 to register `$10` is the KEYON
  (`voice.state.on = !ctl`, ics2115.cpp:875).
- The ics sample region is `0x1000000`, assembled from `pgm_m01s.rom` @0x000000
  (2 MiB) and `cave_m04401b032.u17` @0x400000 (4 MiB). Sample addresses are
  24-bit: `(saddr<<20) | ((acc>>12) & 0xfffff)`.
- The cue routines on the 68k side are `$28C02A` (BGM/streaming) and `$28C0AE`
  (SFX), sharing a body, gating on `$80380A`/`$80392A`/`$803926`, both ending
  at `$28BFEC` which does `add.w $81DEB4,D1` (master volume) and clamps D1 to
  `0..$FF` (recon 50 line 370). D0/D1/D2 at the call = id/pan/channel.

## 1d. The captures + their provenance
All under `games/ddpdoj/rip/sound/`. Generated by `pgm.py sound` (the
`_cmd_sound` pipeline, `pgm.py:828`), which runs a MAME scenario (default
`stage1-deep`) with `PROBE_SOUND=<dir>`. The taps live in
`games/ddpdoj/tools/oracle/frame.lua:1389-1510`. So these are MAME-derived
captures, and that provenance matters: the register stream is the GAME'S CODE
(high confidence, verifiable frame-exact), but anything that depends on MAME's
ICS2115 MODEL inherits MAME's own admitted uncertainty.

| file | size | what it is | source tap |
|---|---|---|---|
| `mailbox.tsv` | 47 KB / 657 rows | the 68k doorbell log: door, vf, lf, pc, data, payload_since_last_door. The frame-exact cue oracle. | 68k write tap on `$C00002-$C00003` |
| `keyon.tsv` | 115 KB / 1,620 rows | per-voice key-ons: voice, conf, fmt, loop, fc, start, end, len, vol, pan, saddr, after_door, ics_row | decoded from the ICS2115 register stream at each KEYON |
| `ics.tsv` | 5.3 MB | EVERY Z80-to-ICS2115 register write, in order: n, vf, lf, voice, reg, half(sel/lo/hi), data | Z80 I/O write tap on `$8000-$8003` |
| `z80ram.bin` | 64 KB | the Z80 driver runtime image (uploaded program + scratch) | Z80 RAM snapshot |
| `maincpu.bin` | 6 MB | the decrypted 68k image (for the Z80-blob hunt) | maincpu dump |
| `snd30/70/110.log` | small | human-readable keyon logs from prior runs | same taps |

Known open detail in the captures: 17 of the 1,620 keyons have `end <= start`.
pgm.py checks whether the END registers (`$04`/`$05`) get re-written for the
same voice shortly after (pointing to a half-programmed voice at keyon time,
not a 1-MiB bank wrap). Recon C2 settles this.

## 1e. The Gradius METHOD template (what DOJ should copy)
`games/gradius/src/sound.js` + `games/gradius/src/audio/apu.js` +
`games/gradius/src/audio/output.js`. Three files, three responsibilities, in
the exact order the W119 plan names:

1. `sound.js` = the state-exact DRIVER. Reproduces every chip-register write
   into a shadow (`state.apu`) and feeds a rolling digest
   (`apuWrites`/`apuDigest`) that the oracle compares per frame. NO synthesis.
   The bar: a byte-identical register stream on byte-identical frames. (DOJ
   analogue: reproduce the mailbox posts AND the Z80's ICS2115 register writes,
   compared against mailbox.tsv + ics.tsv.)
2. `apu.js` = the CHIP MODEL, modelled from the published hardware behaviour
   (datasheet), NOT from MAME. Turns the register stream into samples
   deterministically. Deliberately NO gate comparing emitted PCM against an
   emulator (that would launder the emulator's own guesses into "truth"). The
   narrow claim it supports: register stream matches cartridge; samples are
   bit-reproducible; a few structural properties hold; a human said it sounds
   right.
3. `output.js` = the Web Audio SINK. Solves the input-granularity problem:
   queue logic frames, pump to the AudioContext clock, never call back into
   game logic (the oracle IS a replay; audio must not depend on the sound
   card). Master gain, mute, pause, backlog ceiling with dropped-frame counter.

`NOTES-sound.md` states the DOJ bar in the same words: state-exactness first
(the command stream byte-exact per frame; the per-voice register state
byte-exact at the sample point). Audible output depends on a synth model whose
reference (MAME's ics2115.cpp) is admittedly incomplete; that is a research
problem, not the last 10% of a port, and if attempted the ICS2115's own
datasheet (not MAME) is the reference.

---

# 2. THE 10 RECON TOPICS (5 codebase / 5 web)

Each topic names its scope, its key files/addresses/captures, and its expected
output (what the recon DELIVERS to the architect). Codebase recons read the
ROM/disassembly/port; web recons read hardware docs, public analysis, and the
browser stack. All ten are read-only.

## CODEBASE RECONS

### C1. The 68k cue side: who posts, what, when, and the enable gates
**Scope.** The 68k half of the cue path: the `$28C02A`/`$28C0AE` family, their
callers, the D0/D1/D2 = id/pan/channel convention, the `$28BFEC` tail
(`$81DEB4` master volume, clamp), and the three enable gates `$80380A`/
`$80392A`/`$803926`. Settle the `$803926` dual role (sound gate vs midboss
column selector). Enumerate every call site statically (the W27 "enumerate
before validating" rule).
**Key files/addresses.** `$28C02A`, `$28C0AE`, `$28C074`, `$28C0E8`, `$28C186`,
`$28C310`, `$28C3BA`, `$28C3EE`, `$28C4FC`, `$28C722`, tail `$28BFEC`; gates
`$80380A`/`$80392A`/`$803926`; volume `$81DEB4`. The 12 `note()` sites in
`src/{stageend,shots,laser,spark,midboss,hud,handlers}.js`. ROM reader:
`games/ddpdoj/tools/oracle/out/maincpu.bin` (decrypted) + `tools/xref.py` (if
present) for call-site enumeration.
**Output.** A closed list of cue routines, their signatures, the enable-gate
semantics, and every static call site with its (id, pan, channel) triple. The
map Wave A ports against; the oracle is mailbox.tsv cross-checked per frame.

### C2. The mailbox + the 68k-to-Z80 handoff
**Scope.** The doorbell mechanism, the `$C10000-$C1FFFF` shared-RAM payload
window, and the exact byte sequence the 68k writes before each ring. The
mailbox is "a bell, not a message" (data always `0001`); the MESSAGE is the
payload. Read the BIOS post routine at `$18AD78` and whatever builds `pend`.
Confirm the 17 `end<=start` keyons are half-programmed voices (END registers
`$04`/`$05` re-written after keyon) vs bank wraps.
**Key files/addresses.** Doorbell `$C00003`; payload window `$C10000-$C1FFFF`;
BIOS post `$18AD78`; `mailbox.tsv` (the 657-row oracle); `ics.tsv` (for the
end<=start follow-up); `frame.lua:1416-1444` (the tap that produced both).
**Output.** The mailbox protocol spec: doorbell semantics, payload layout, the
frame-exact post sequence. The acceptance gate for Wave A (the port must
reproduce mailbox.tsv row for row) and the contract Wave B's Z80 driver must
consume.

### C3. The Z80 driver: listing the uploaded program
**Scope.** THE LOAD-BEARING UNKNOWN (W119 Wave B). The Z80 has no ROM; its
program is uploaded through `$C10000`. Locate the upload source inside the
decrypted 68k image (the `_z80_blob` question, three copy models: verbatim /
even lane / odd lane). Then disassemble the recovered program from
`z80ram.bin`: its main loop, how it reads the mailbox, how it translates a cue
id into a sequence of ICS2115 register writes, its timer/NMI handling.
**Key files/addresses.** `z80ram.bin` (the 64 KB runtime image = the driver);
`maincpu.bin` (the haystack for the upload); `pgm.py:_z80_blob` (lines 937-end,
the copy-model hunt); NOTES-machine.md line 143 ("no ROM for the Z80").
**Output.** (1) The upload location and copy model in the 68k ROM. (2) A
listing of the Z80 driver: entry point, mailbox-read, cue-id dispatch, the
register-write interpreter, timing. The foundation for Wave B (port the upload)
and Wave C (port the driver state-exact against ics.tsv).

### C4. The data tables: samples, banks, and the shipping decision
**Scope.** The ics sample memory: what `pgm_m01s.rom` (2 MiB @0) and
`cave_m04401b032.u17` (4 MiB @0x400000) contain, which voices index which
samples in stage 1, the per-voice format field (16bit / ulaw / 8bit), and the
`saddr` bank scheme (`(saddr<<20) | ((acc>>12)&0xfffff)`). The shipping
question: stage-1 cues draw only from `u17`, so what is the minimum slice that
makes stage-1 sound complete, and what does it cost (the W119 "roughly doubles
the 2.7 MB payload" figure, re-measured). Settle the 8-bit-vs-16bit conflict
(premise 5).
**Key files/addresses.** ROMs `pgm_m01s.rom`, `cave_m04401b032.u17`;
`keyon.tsv` (start/end/saddr/fmt per keyon); NOTES-machine.md line 437;
NOTES-sound.md "where the samples live" (item 3); `tools/build-dist.mjs` (the
verbatim-art guard and the sharding question).
**Output.** The sample inventory: bank map, stage-1 voice-to-sample index,
format counts, the minimum-shippable slice + its byte cost. The input to Wave D
(data export + sharding).

### C5. The ICS2115 register/state model (from the captures, not the synth)
**Scope.** The chip's PROGRAMMING model as DOJ uses it, derived from `ics.tsv`
(the 5.3 MB ordered register stream) and `keyon.tsv`, cross-referenced with
`frame.lua:1448-1492` (the register decoder already enumerates the fields):
registers `$00` conf, `$01` fc, `$02/$03` start, `$04/$05` end, `$07` vol,
`$0C` pan, `$0E` active-voice count, `$11` saddr, `$4F` voice select, `$10`
keyon. Enumerate which registers DOJ actually touches (vs the full datasheet
set), the per-voice state struct, and the ordering invariants (which writes
must precede a keyon).
**Key files/addresses.** `ics.tsv`, `keyon.tsv`; `frame.lua:1389-1509`; the
port-1 select / port-2,3 data protocol at `$8000-$8003`.
**Output.** The register-level state model: the 32-voice struct, the touched
register set, the programming order, the keyon preconditions. This is the
"register stream" half of the state-exact bar; it is NOT synthesis (that is
C-web2 + Wave E). The oracle Wave C checks against.

## WEB RECONS

### W1. ICS2115 hardware architecture (manufacturer datasheet)
**Scope.** The ICS2115 WaveFront 32-voice wavetable synth from the PRIMARY
source: the Integrated Circuit Systems datasheet (and the Turtle Beach
WaveFront heritage, since the chip shipped in the Maui/Tropez cards). Clock,
voice architecture, the oscillator state machine, sample formats (the
proprietary 16-bit compressed format, ulaw, 8-bit PCM), the envelope/LFO/ramp
generators, the timer/IRQ model, the register paged interface. This is the
reference NOTES-sound.md says to work from INSTEAD of MAME.
**Key sources.** ICS2115 datasheet (public PDF); WaveFront synth technical
notes; NEMO/emu archives of the same chip in other PGM titles.
**Output.** The chip architecture brief: voice pipeline, sample decode, pitch/
envelope/LFO, timers, register map with semantics. The reference Wave E's
synth model is built against, and the authority for classifying MAME's
uncertainties (NOTES-sound.md item 1).

### W2. ICS2115 register programming + public analysis (incl. MAME's gaps)
**Scope.** Public analysis of the register programming model and, critically,
MAME's `src/devices/sound/ics2115.cpp`: which details are measured hardware
facts, which are approximations, which are unverified (NOTES-sound.md item 1
asks to classify every uncertainty this way). Forum threads (MAME testers,
arcade dev boards), the MiSTer PGM core's ICS2115 (at
`C:\programmieren\pgm-mister`, HANDOVER section 8 - note it is MAME-derived for
ICS2115 so NOT an independent witness on sound), and any reverse-engineering
writeups.
**Key sources.** MAME `ics2115.cpp` source (mame0289, public); the MiSTer
Verilog at `C:\programmieren\pgm-mister`; arcade preservation forums.
**Output.** A classified table: for each register/behaviour, {hardware fact,
MAME approximation, unverified, port-relevant-or-not}. The input to the
"verified sound MEANS what" decision (NOTES-sound.md item 2) and to Wave E's
scope.

### W3. PGM sound subsystem architecture (the three-CPU handoff, public)
**Scope.** The PGM sound subsystem as documented publicly and in MAME's
`pgm.cpp`/`pgm.h`: the 68k/Z80/ICS2115 triangle, the Z80 program upload
mechanism, the mailbox/latch hardware at `$C00000-$C0000D`, the Z80 program
RAM window at `$C10000-$C1FFFF`, the ICS2115 sample ROM mapping, and how other
PGM titles (ddp3, ketsui, etc.) structure their sound. The question C3's
upload hunt needs answered from the hardware side: is the upload a straight
copy, a transform, or a DMA?
**Key sources.** MAME `pgm.cpp` (the `m_soundcpu` config, `machine_start`,
`m_z80_sync`), `igs023_video.cpp`; NOTES-machine.md lines 121-143, 226-228,
437-461; public PGM hardware docs.
**Output.** The subsystem architecture brief: upload mechanism, mailbox
hardware, the three-CPU timing. Cross-checks C2/C3's ROM findings against the
documented hardware.

### W4. Web Audio scheduling, mixing, and browser constraints
**Scope.** The output-shim problem for a 32-voice synth in a browser: sample
emission on the AudioContext clock (NOT the rAF clock - the input-granularity
problem Gradius `output.js` already solves), AudioWorklet vs the
ScriptProcessor fallback, voice mixing and clipping headroom, sample-rate
mismatch (ICS2115 native rate vs 48 kHz), GC under sustained load, the
background-tab throttle, the autoplay/unlock-on-gesture rule, and mobile
constraints. This is the half of the web recons the owner's current brief
emphasised.
**Key sources.** Web Audio API spec + MDN; Gradius `games/gradius/src/audio/
output.js` (the working reference); the input-granularity finding
`docs/worklog/gradius/13-FINDING-input-granularity-under-load.md`.
**Output.** The output-shim design for DOJ: which Gradius patterns reuse
directly, what changes for 32 voices (mixing, headroom, the backlog ceiling),
and the browser limits that bound the design. The input to Wave F (the shared
output shim) and a constraint on Wave E (the synth's per-sample cost).

### W5. Prior art for the chip model + Gradius template reuse map
**Scope.** Existing JavaScript/Web ICS2115 or wavetable synth projects (other
PGM web ports, generic WaveFront emulators, WebAudio sampler synths), and a
concrete reuse map of Gradius's three files onto DOJ: what in `sound.js`
translates (the state-exact discipline, the digest/compare pattern), what in
`apu.js` translates (the chip-model-from-datasheet method, the deterministic
sample contract), and what in `output.js` translates (the queue/pump/mute/
pause/backlog pattern). Plus the shared output shim worth factoring out
cross-game (W119: "only once DOJ has something to pipe through it").
**Key sources.** Public JS synth projects; Gradius `sound.js`, `audio/apu.js`,
`audio/output.js`; W119 lines 174-178 ("what not to do yet" - no shared synth,
but a shared shim is worth ~1 wave).
**Output.** (1) A prior-art survey with what to borrow and what to avoid. (2)
The file-by-file Gradius-to-DOJ reuse map. The input to the architect's
reusability call and to Waves A/C/E/F.

---

# 3. THE ARCHITECT'S SYNTHESIS JOB

The architect (the session's own model, NOT Fable - see premise 1) takes the
ten recon reports and produces ONE prioritized plan for the sound waves. It is
synthesis, not new investigation. Concretely it must deliver:

1. **The reusability map, fixed.** Which Gradius file each DOJ wave copies, and
   the shared-shim boundary (from C5 + W4 + W5).
2. **The wave ordering, with dependencies and sizing.** A sequenced list (see
   section 4 for the likely shape) with, per wave: the ROM/capture inputs, the
   oracle (which .tsv/.bin it is checked against), what "done" means, the
   dependencies, and the one biggest risk.
3. **The "verified sound MEANS what" decision** (NOTES-sound.md item 2), stated
   as a gate definition before any wave claims it: (a) command stream byte-
   exact per frame [strong, the bar]; (b) per-voice register state byte-exact
   at the sample point [strong]; (c) emitted PCM matches MAME [weak, inherits
   MAME's gaps - REJECTED as a gate]. Same call Gradius made in `apu.js`.
4. **The shipping/slicing decision for the sample ROM** (from C4): minimum
   stage-1 slice, byte cost, sharding plan, the verbatim-art guard
   implications.
5. **The audible-output scope decision** (from W1/W2): whether Wave E is in or
   out of this round, and if in, what reference (datasheet, not MAME) and what
   claim it can support. Labelled a research problem; not allowed to look like
   the last 10%.
6. **Premise corrections carried forward.** Any of the ten that found a false
   premise (per the project rule), restated so the wave briefs inherit the fix
   not the error.

The architect does NOT write `src/`. Its output is a plan worklog (cf. W119,
W126) that the wave dispatcher consumes.

---

# 4. THE WAVE BREAKDOWN (after the 10 recons + architect)

Likely shape, pending the architect's sizing. Three are named by W119 (A, B,
E); C/D/F round out the natural cuts along the three-CPU boundary. Ordering is
the architect's call; the dependency graph is sketched here.

**Wave A - the 68k cue post/queue [KEYSTONE, state-exact, no audio].**
Port the `$28C02A`/`$28C0AE` family + the `$28BFEC` tail + the enable gates
`$80380A`/`$80392A`/`$803926`, so the port posts the same mailbox payload on
the same frame as the board. Inputs: C1, C2. Oracle: `mailbox.tsv` (door +
payload row for row, frame for frame). Done = the 657 doorbells reproduce.
Replaces the ~12 `note()` placeholders with real posts. Biggest risk: the
`$803926` dual role (premise 2) entangles a gameplay read with the sound gate.

**Wave B - the Z80 program upload + the driver listing [LOAD-BEARING UNKNOWN].**
Reproduce the upload (locate the source in the 68k ROM per C3's copy-model
verdict) and LIST the Z80 driver's structure (entry, mailbox read, cue-id
dispatch, register-write interpreter, timers). Inputs: C3, W3. Oracle: the
uploaded image matches `z80ram.bin`'s program region. Done = the port can
produce the Z80 program and the listing is closed. Biggest risk: the upload is
NOT a straight copy under any of the three models (pgm.py already has a
fallback message for this), making it a transform-hunt.

**Wave C - the Z80 driver port [state-exact, no audio].**
Port the listed driver so the port's Z80-equivalent issues byte-identical
ICS2115 register writes on byte-identical frames. Inputs: the Wave B listing,
C5. Oracle: `ics.tsv` (the 5.3 MB ordered register stream). Done = the register
stream matches frame for frame, voice for voice, register for register. This is
the "register stream byte-exact per frame" bar, the strong claim. Biggest risk:
the driver's timing/NMI dependence (does the Z80's 8.4672 MHz tick matter to
the write order, or only the frame boundary?).

**Wave D - sample data export + sharding [data, no logic].**
Export the stage-1 sample slice (`cave_m04401b032.u17` @0x400000, possibly a
subset), resolve the 8-bit/16-bit format question (premise 5) and the 17
`end<=start` keyons (C2), and design the shard boundary so boot does not slow
and the verbatim-art guard holds. Inputs: C4. Oracle: `keyon.tsv` (every
keyon's sample resolves in the shipped slice). Done = all 1,620 keyons (the
stage-1 subset) are satisfiable from shipped data. Biggest risk: the slice
doubles the payload (W119 figure, re-measure in C4) and sharding interacts
with the `PUBLISH_VERBATIM` policy.

**Wave E - the ICS2115 synthesiser [RESEARCH PROBLEM, audible output].**
Model the chip from the W1 datasheet (NOT MAME) and turn Wave C's register
stream into samples, through Wave F's output shim. Inputs: W1, W2, C5, Wave C.
Oracle: NONE against MAME audio (deliberately - `apu.js` makes this call and
NOTES-sound.md item 2 ratifies it). Done = deterministic samples + structural
properties + a human said it sounds right. Biggest risk: this is research, not
porting; the owner must accept the datasheet reference and the narrower claim.
Must not be scheduled as if it were the last 10%.

**Wave F (cross-game) - the shared Web Audio output shim.**
Factor Gradius `output.js` into a shared sink (master gain, mute, pause,
unlock-on-gesture, backlog ceiling, dropped-frame counter) that DOJ and Gradius
both use. Inputs: W4, W5. Oracle: the existing Gradius audio tests stay green.
Done = DOJ pipes Wave E through it; Gradius is unchanged. Biggest risk: none
structural (the method is proven); only the "do it once DOJ has something to
pipe" ordering (W119 line 178).

Dependency graph: A and B are independent and both unblock C. C unblocks E. D
is independent (data only) and is required for E to be audible. F is required
for E to be audible and can start any time after the W4/W5 recons. A is the
keystone (state-exactness is the project's proven discipline; it makes the
mailbox reproducible and de-risks everything downstream). B is the load-bearing
unknown (everything on the Z80 side waits on the upload hunt).

---

# 5. NOTES FOR THE DISPATCHER

- Open the ten recons as PARALLEL where the brief allows; the five codebase
  recons read different ROM regions/files and the five web recons read
  different sources, so they fan out cleanly. C2 and C5 both lean on
  `ics.tsv`/`mailbox.tsv` but ask different questions (handoff vs register
  model) and do not conflict.
- Exactly one agent writes to `src/` at a time (HANDOVER section 10). The
  recons are read-only; the constraint binds the waves, not this round.
- The captures under `rip/sound/` are MAME-derived. Nothing ROM-derived is ever
  committed; the existing verbatim-art guard in `tools/build-dist.mjs` covers
  the sample ROMs when Wave D ships (check the .gz-inflation path - HANDOVER
  section 3).
- The `_z80_blob` hunt (`pgm.py:937`) is already implemented and runnable; C3
  runs it and reads the verdict rather than rebuilding it.
- No em dashes (owner, twice). This worklog uses hyphens only.
