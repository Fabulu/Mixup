# 143 -- RECON: sound wave C depth (the four behavioural TODOs)

status: DONE   role: recon (read-only)   wave: W27 sound, Wave C depth

Maps the four TODOs gating the full 191,367-row ics.tsv reproduction (named in
142-impl-sound-wave-c3.md sec 5 and 141-impl-sound-wave-c2.md sec 1). For each:
the Z80 code (decoded out of rip/sound/z80ram.bin via tools/z80dis.py), the data
(rip/sound/ics.tsv, mailbox_dedup.tsv), a port plan with sizing. The oracle
maths are run directly against the TSVs.

The goal: lift the chain from "reproduces any one keyon episode" (W142's claim)
to "reproduces the full 191,367-row register stream" by sizing the behavioural
depth still deferred behind the four TODOs.

# 0. PREMISE VERDICTS (corrections to W135/W141/W142, checked against z80ram.bin)

The premise check turned up a major correction to the W135 architecture framing
plus several W142 mislabels. Each was re-decoded instruction-by-instruction.
They reshape TODO 1, so they come first.

1. THE MAIN THREAD IS NOT PURELY IDLE -- IT RUNS THE CUE DISPATCH LOOP. W135
   stated "the main thread idles at `$114C` (`JR $`); ALL behavior is in the INT
   and NMI handlers." Re-decoded, this is WRONG. After reset -> `$02EE` init,
   control falls into `$0321`, which is the TOP OF THE MAIN LOOP. The loop:
     `$0321`: poll the mailbox queue at `$6001` (`CALL $3BB5`; if empty `JP $07CA`)
     `$034A`: dequeue one entry (`CALL $3CDD`; reads the command), read args
     `$036E`: `JP $41D0` -- the switch dispatcher over a 15-command table at `$078E`
     handler: ...process the cue, write `$62EC`...
     handler tail: `JP $07CA` -- which is literally `JP $0321` (the back-edge)
   So `$07CA` is the main-loop back-edge (NOT an error handler -- the many `JP
   $07CA` sites inside `$03xx`-`$07xx` are normal handler returns). The `$114C`
   `JR $` is a different, genuinely-idle routine (reached from `$1147` after a
   one-shot `CALL $0829`); it is NOT the main thread. The cue dispatch is MAIN-
   LOOP driven, polled off the mailbox queue, NOT purely interrupt-driven. This
   is the load-bearing correction: it means the cue-id -> `$62EC` route runs in
   the main loop, fed by the NMI's queue-drain (verdict #3 below).

2. THE COMMAND DISPATCH TABLE IS AT `$078E` (15 commands, 4-byte stride
   `[cmd][00][addr_lo][addr_hi]`, scanned by `$41D0` which `JP (HL)` to the
   handler). Sample mappings (verified): `$00`->`$0371`, `$01`->`$03E5`,
   `$02`->`$0468`, `$0D`->`$0527`, `$0E`->`$0592`, `$0F`->`$04DD`,
   `$10`->`$0521`, `$11`->`$05F0`, `$12`->`$065B`, `$15`->`$0738`, `$20`->`$077F`.
   The mailbox TYPE byte IS this command opcode (type `$00`->cmd `$00`, type
   `$01`->cmd `$01`, type `$0F`->cmd `$0F`, type `$12`->cmd `$12`, type `$15`->
   cmd `$15`). The cue-ids (`$0D`, `$1A`, `$41`...) are NOT commands -- they are
   ARGUMENTS carried inside each message. Three route families:
     immediate note-on: cmds `$00`/`$01`/`$02`/`$10` -> `$3245` -> `$3150` ->
       `$62EC` (params inline in the message + the sample base `[$62EA]`).
     sequence/cue-id: cmds `$11`/`$12`/`$13`/`$14`/`$15`/`$16`/`$1D`/`$20` ->
       `$2E38`, which looks the cue-id up in a runtime-pointer table `[$62E4]`.
     direct global: cmd `$14` -> 128-byte table `$4376` -> `$0EE7` writes global
       regs `$40`-`$43` (timer/config), bypassing `$62EC` entirely.

3. `$3BEA` IS A RING-BUFFER DRAIN, NOT A MEMCPY AND NOT THE DISPATCHER. W142
   labeled it "window-to-RAM copy." Re-decoded, `$3BEA` calls `$3BCA` (compares
   struct+0A vs struct+0C, a head/tail empty-test via `$421B`); if non-empty it
   runs a drain loop (`$3C05`-`$3CB2`, bumping counter `$0046`). It NEVER touches
   the `$30xx`-`$36xx` populator and does NOT dispatch cue-ids. The NMI
   (`$07F6`) calls it to PULL mailbox bytes out of the banked `$6001` ring into a
   Z80-RAM structure; the MAIN LOOP (`$3BB5`/`$3CDD`) then dequeues from that
   structure and dispatches via `$41D0`. `$6151` (the "command flag" W142 named)
   is written at init (`$07DC`) and NMI (`$0804`) but never read -- it is an
   inspection byte, not a poll flag.

4. `$3262` IS NOT A SUBROUTINE -- it is `DD POP HL; RET`, the Hitech-C get-PC
   idiom (pop the return address into HL to address inline local data right
   after the CALL). The three `CALL $3262` sites (`$2D01`/`$2DBB`/`$309F`) are
   NOT sequencer feeders; they are the get-PC idiom inside other functions. (So
   the sequencer `$25F2` does not feed `$62EC` via `$3262`; it calls the
   populator `$3150` directly via the note-on wrappers `$33A0`/`$3441`.)

5. `$07F6` DOES NOT CALL `$0829` (W142's "channel manager" framing). `$0829` is
   reached only from `$1147`/`$1247` (init), calls the BCD converter `$014C`, and
   is an init/format routine. `$6151` (above) and `$0829` are both W142 mislabels.

NET: the live cue->voice route is MAIN LOOP `$0321` polls the mailbox queue
(drained by the NMI's `$3BEA`) -> dispatch table `$078E` -> handler -> populator
`$3150` -> `$62EC`; the timer INT `$0FC8` -> `$376C` walks `$62EC` and (at
keyon) calls the register programmer `$0B92`; the IRQ path `$0FC8` -> `$0A0C`/
`$3F11` handles release. The `$25F2` BGM sequencer (also from `$0FC8`) drives
the cue-id-sequence route. TODO 1 maps this route.

# 1. THE DATA SHAPE (sizing the four TODOs against the oracle)

Run directly against the TSVs. These numbers are the load-bearing sizing facts.

Global (191,367 rows): 1620 keyons (`$10` hi=00), 1720 keyoffs (`$10` hi=0F);
VCtl `$03` written 3533x, VCtl `$01` (release) 1720x; fc (`$01`) written 20859x;
voice-select (`$4F`) 23367x. 95 of 1720 keyoffs are orphans (voice already
playing at capture start); 1 keyon is pre-gameplay (vf < 601).

Row-category breakdown (of 191,367):
  voice-reg-write (keyon + keyoff eps + vol): 71853 (37.5%)
  fc / OscFC (`$01` sel+lo+hi = 3x20859):    62577 (32.7%)
  voice-select (`$4F` sel+lo = 2x23367):     46734 (24.4%)
  read-poll (`$43`/`$40`/`$0F`/`$4B`/`$41`):  10068 (5.3%)
  global regs (`$4D`/`$42`/`$4C`/`$4A`/`$5A`/`$A5`): 135 (0.1%)

Stage-1 invariants the port can lean on (all measured):
  Pan (`$0C`) is ALWAYS `$7F` (center). 665/665 writes. No panning in stage 1.
  OscConf (`$00`) has 4 values only: `$00` (2084, off/keyoff), `$20` (641, SFX),
    `$08` (618, BGM), `$A0` (3). Two formats matter: 16-bit (`$20`) and 8-bit
    (`$08`).
  OscAcc (`$06`) is always 0 (24 writes, all 0).
  `$0E` is always `$1F` (6 writes). `$09` has 41 distinct values (a per-cue
  level).
  Sample-format split: SFX use saddr `$0044` (one bank); BGM uses `$0045`/
  `$0046`/`$0047`.

# 2. TODO 2 -- THE RAMP MATH (per-tick oscAcc/volAcc advance)

VERDICT FOR STAGE 1: TRIVIAL. The ramp is not exercised.

- fc (`$01`) is written 20859 times. Only 803 of those (3.8%) are real value
  CHANGES; 20056 (96.2%) are static re-emission (the same fc re-written every
  tick). The existing `emitRefresh` (src/voice.js) already does this.
- Segmented by keyon->keyoff episode: 1618 of 1620 episodes have ZERO fc changes
  during sustain. Only 2 episodes (0.12%) have a single fc change each (voice 3
  at vf=4003 and vf=4032). The 803 total changes are keyon-RESET values across
  episodes (cue-driven pitch selection at keyon), NOT mid-sustain ramps.
- Volume (`$07`/`$08`) is written 1720x each -- ONLY at keyoff (the `$0A0C`
  release sets VolLo=VolHi=`$01`). Volume is never ramped during sustain.

So the "single volume ramp per voice" and the "oscAcc phase ramp" the chip
offers are NOT exercised by the stage-1 SFX corpus. The 191,367-row stream is
faithful re-emission of the keyon-supplied state, tick after tick, until keyoff.

PORT PLAN (TODO 2): ~0.1 wave. No accumulator math needed for stage 1. The work
is confirming the TICK MODEL so the refresh ROW COUNT matches: `$43` (timer-
status) sel-reads total 4560 at a median of 1/vf (one INT per frame); `$4F lo`
(voice touches) median 8/vf, max 65. The port must emit one refresh
(sel `$4F`, lo, sel `$01`, lo, hi) per active voice per tick, and the active set
plus tick count must line up with vf. The `oscAcc += incr; fc = oscAcc>>N` math
is structural-only; defer it to Wave E (the synth) where it belongs. Risk: the 2
episodes with a single fc change -- pin down whether they are a cue re-write or a
genuine ramp (1 tick of increment) and handle the one-off. Cost: hours, not
days.

# 3. TODO 3 -- THE KEYOFF PATH (OscCtl `$0F` + release)

VERDICT: SMALL-MEDIUM. The emission is a fixed sequence; the work is TIMING it.

EMISSION (decoded from `$0A0C`, confirmed row-for-row against the oracle):
`$0A0C(voice)` writes, in order:
    `$4F`/lo = voice                  (select voice)
    `$0D`/hi = VCtl & `$C3` [| `$01`] (read `$0D`, mask, conditionally set bit0)
    `$07`/hi = `$01`                   (VolLo)
    `$08`/hi = `$01`                   (VolHi)
    `$10`/hi = `$0F`                   (OscCtl = KEYOFF)
    `$0D`/hi = `$03`                   (VCtl re-arm)
    [`$00`/hi = `$00`]                 (OscConf=0, if VCtl bit0 was set)
This is the INVARIANT keyoff episode (verified on the first keyoffs at vf=5).
`$0A0C` is called from the sequencer `$25F2` (at `$2679`) AND from the timer IRQ
path (`$0FC8` -> `$1099` for the IRQV voice). `$3F11(voice)` follows it in the
timer path (at `$10A2`) -- the post-release bookkeeping that frees the ICS
shadow slot: `shadow[$654E + voice*10][0] = 0` (marks the voice free for the
`$3E8F` allocator to reuse). This closes the allocator cycle (`$3E8F` alloc ->
... -> `$3F11` free).

TRIGGER (the real complexity): there are TWO distinct keyoff triggers, and the
data proves it.
  (i) OSCILLATOR-END IRQ (one-shot SFX). The ICS2115 raises an IRQ when a voice
      reaches oscEnd; IRQV (`$0F`) reports the voice; `$0FC8` reads `$0F` and
      dispatches `$0A0C(voice)`. The Z80 does NOT compute when; the CHIP tells
      it. Most SFX keyons keyoff in the SAME frame (delta=0): the sample plays
      through in under one frame (~551 samples/frame at the 33.8 kHz native
      rate). The longest SFX delta seen is 27 frames.
  (ii) SEQUENCER NOTE-DURATION (BGM). The BGM melody notes (the 979 OscConf=`$08`
       keyons from `$25F2`) show a CONSTANT keyon->keyoff delta across different
       fc values (e.g. voice 1 at vf 1240/1485/1551/1584, all delta=6, fc
       varies `$0247`/`$028B`/`$03D4`/`$01EA`). A pure oscillator-end trigger
       would vary with fc; a constant delta means the SEQUENCER times the
       keyoff from the note table's duration field. So `$25F2` schedules BOTH
       the keyon and the keyoff for BGM notes.
So the lightweight oscillator-end model only has to cover the SFX delta=0
majority (sample shorter than a frame -> keyoff next INT); the BGM keyoffs come
for free once the sequencer's duration field is ported (TODO 1b). The exact
oscEnd-timing formula needs the 29-bit oscAcc / 15-bit fc bit layout (a Wave E
datasheet question, flagged in 135 sec 2); a frame-granularity approximation is
enough for Wave C's register-stream gate.

95 orphan keyoffs (no preceding keyon in the corpus) are a RELEASE-ALL at the
capture start: the first keyoffs in the stream are at vf=5 across all 32 voices
(~3 `$10=$0F` writes per voice x 32 = ~95), i.e. a deliberate sound-reset at the
top of the captured segment. So the historical driver must EMIT a release-all of
all 32 voices at vf=5 (not seed playing voices). The `$654E` shadow starts all-
allocated (every voice's release re-arms the slot).

PORT PLAN (TODO 3): ~0.5 wave, two parts.
(a) EMISSION (~0.2 wave): port `$0A0C` as `emitKeyoff(slot)` in voice.js -- a
    fixed 6-7 register-write sequence mirroring the keyon emission style. Add
    the `$0F` IRQV read to the timer model. Straightforward.
(b) TIMING (~0.3 wave): a per-voice "oscillator steps remaining" counter, set at
    keyon from (oscEnd - oscStrt) and decremented by fc each tick; when it
    crosses zero, raise the voice's IRQ and run the keyoff. This is a frame-
    accurate subset of the Wave E oscillator -- NOT the full sample-level synth.
    Risk: the 24-bit oscAcc wrap and the `$0E=$1F` setup writes (6 of them,
    rare) -- trace `$0E`'s role before claiming the model complete.

# 4. TODO 1 -- THE CUE-ID -> VOICE-PARAM SCRIPTS (the biggest)

VERDICT: MEDIUM. The mechanism is now fully decoded (main-loop command dispatch
+ three routes + `$3150` populator + `$0B92` register programmer). It splits
into a SMALL immediate-SFX path and a LARGER cue-id-sequence/BGM path.

THE COMMAND SPACE (from mailbox_dedup.tsv, 633 doors; type byte = the command
opcode dispatched by `$41D0` off the table at `$078E`):
  type `$00` (cmd `$00`, immediate note-on): 380 doors, 7 distinct ids
  type `$01` (cmd `$01`, immediate note-on): 243 doors, 4 distinct ids (id `$24` = 170x)
  type `$0F` (cmd `$0F`): 8 doors
  type `$12` (cmd `$12`, sequence cue-id): 1 door
  type `$15` (cmd `$15`, sequence cue-id): 1 door
The cue-ids are MESSAGE ARGUMENTS, not dispatch keys; ~12 distinct cue-ids total.

THE THREE ROUTES (each handler ends `JP $07CA` back to the main loop):
  (i) IMMEDIATE NOTE-ON (cmds `$00`/`$01`/`$02`/`$10` -> `$3245` -> `$3150`).
      The handler reads inline args from the dequeued message, calls `$3245`,
      which calls the populator `$3150`. `$3150` allocates a `$62EC` slot (via
      `$311C`) and writes: `[+2/+3]` a 16-bit pointer, `[+5/+6]` the sample-addr
      (= caller offset + the sample base `[$62EA]`, validated against the limit
      `[[$62E8]]`), `[+7/+8]` a caller arg, `[+9/+0A]` a derived value. The state
      byte `[+0]` is set to `$03` later at keyon (`$37DB`); the flag byte `[+0B]`
      carries mode bits. This route owns the 641 SFX keyons (OscConf=`$20`).
  (ii) CUE-ID SEQUENCE (cmds `$11`/`$12`/`$13`/`$15`/`$16`/`$1D`/`$20` ->
       `$2E38`). `$2E38(cue_id, arg, flag)` looks the cue-id up at `$2E61`:
         `LD HL,($62E4); ADD HL,DE(=cue*2); LD E,(HL); INC HL; LD D,(HL)`
       i.e. `table[$62E4][cue_id]` = a pointer to a per-cue DATA BLOCK. The data
       block is parsed (track count -> `$62E0`, per-track stride -> `$62DF`,
       sequence-stream pointer -> `$62DB`), track structs at `$6184` (stride
       `$29`=41) are initialised, and the BGM sequencer `$25F2` (called each tick
       from the timer service `$0FC8`) walks the note stream. THIS IS THE BGM
       ENGINE; it owns the 979 BGM keyons (OscConf=`$08`/`$00`).
  (iii) DIRECT GLOBAL (cmd `$14` -> 128-byte table `$4376` -> `$0EE7` writes
        global regs `$40`-`$43` via `$02BA`). Bypasses `$62EC`; timer/config.

THE TABLE IS RUNTIME-POINTER-BASED, NOT FIXED ROM. `[$62E4]` (cue-id table
base), `[$62E2]` (count), `[$62EA]` (sample base), `[[$62E8]]` (sample limit)
are set ONCE at boot by `$1419` (called from init `$0308`), sourced from globals
`[$0050]`/`[$0060]`. They point into BANKED SCORE DATA loaded from the 68k ROM
through the `$C10000`/`$6000` window -- NOT into the Z80's fixed program. A scan
of the fixed ROM `$4000`-`$5B97` found NO flat cue-id pointer table. The fixed
ROM DOES hold: the command table `$078E`, the direct-SFX byte table `$4376`
(128 bytes), note-frequency tables `$4400`/`$4800`/`$4C00`/`$5000`/`$5400`/
`$5800`, pointer tables `$4143` (16 entries) and `$4316` (36), and the osc/wave
tables `$5987`/`$5997`/`$5999` used by the register programmer `$0B92`.

THE REGISTER PROGRAMMER IS `$0B92` (the routine W141's `emitKeyon` models). At
keyon, the voice-engine state-1/3 handler `$37DB` reads the `$62EC` slot fields
`[+5/+6]`, `[+7]`, `[+7/+8]`, `[+9/+0A]`, the flag `[+0B]`, and `CALL $0B92`,
which programs the ICS2115 registers (`$00`,`$01`,`$02`,`$03`,`$04`,`$05`,
`$09`,`$0A`,`$0B`,`$0C`,`$11`) from the slot plus the ROM tables `$5987` (the
pan-source table -- `$0C`) and `$5997`/`$5999` (the `$09` source). So `$09`'s 41
distinct values come from `$5997`/`$5999`, and pan (`$0C`) from `$5987`.

THE DATA CONFIRMS THE SPLIT (1620 keyons clustered from ics.tsv):
  SFX keyons (OscConf=`$20`, route (i)): 641 total, only 14 distinct (fc, saddr,
  r0A, strt, end) sets. Top 2 map 1:1 to door counts:
    id `$0D` (368 doors) -> fc=`$03DE` saddr=`$0044` r0A=`$7463` strt=`$7463` end=`$E000` (368)
    id `$24` (170 doors) -> fc=`$03DE` saddr=`$0044` r0A=`$DB93` strt=`$DB93` end=`$5000` (172)
  BGM keyons (OscConf=`$08`/`$00`, route (ii)): 979 total, 52 distinct fc values
  (`$00A3`..`$07BA`), saddr `$0045`/`$0046`/`$0047`. The note stream at `($62DB)`
  is a byte sequence of NOTE NUMBERS; `$25F2` at `$26CA` reads `seq[$62D2]` and
  at `$26FD` looks up `(track[+0B])[note*2]` -> a 16-bit param -> `[track+0D]`.

PORT PLAN (TODO 1): ~1 wave, two sub-waves.
(a) IMMEDIATE-SFX path (~0.3 wave): port the main-loop dispatcher (`$0321` poll,
    `$3BB5`/`$3CDD` dequeue, `$41D0`/`$078E` switch) + the cmd `$00`/`$01`
    handlers + `$3245`/`$3150` populator + `$0B92` register programmer (with the
    ROM tables `$5987`/`$5997`/`$5999`). This replaces W142's injected
    `paramsProvider(id)`. The empirical shortcut: the corpus exercises only ~14
    SFX param-sets, so the SFX side can be reconstructed from the 1620-episode
    clustering and shipped as a literal table while the `$0B92`/table-lookup
    fidelity is layered in. Low risk -- the data pins every emitted value.
(b) CUE-ID-SEQUENCE / BGM path (~0.7 wave): port `$2E38` + the score-data table
    lookup `[$62E4]` + `$25F2` (the note-stream walker) + the `$62D2`-`$62E1`
    state cluster + the `$6184` track array (stride `$29`). The note DURATION
    (times the keyoff, TODO 3 trigger (ii)) lives in the `$62D6`/`$62D8`/`$62D9`
    tempo state. RISK (highest in Wave C): the score data is BANKED FROM THE 68k
    ROM, not in z80ram.bin -- the table base `[$62E4]` is loaded at boot from the
    `$C10000` window. Porting this needs the 68k-side score data located and
    decoded (a Wave-A/banking task), not just the Z80 program. Resolve against a
    BGM-only slice of ics.tsv (the 52 distinct fc values pin the pitch tables).

# 5. TODO 4 -- THE MAILBOX DOOR -> KEYON HISTORICAL MAP

VERDICT: MEDIUM-LARGE in principle, but it FALLS OUT of TODOs 1+2+3. It is the
integration harness, not independent research.

The map is 1-to-many and time-delayed. The first keyon (vf=577) PRECEDES the
first mailbox door (lf=601), so lf and vf are DIFFERENT counters and the driver
makes sound on its own (sequencer, init). The mapping is mediated by:
  door (lf) -> NMI `$07F6` -> `$3BEA` drains mailbox ring into Z80 RAM
           -> MAIN LOOP `$0321` dequeues (`$3CDD`), dispatches (`$41D0`/`$078E`)
           -> handler -> `$3150` -> `$62EC` slot -> keyon (next `$376C`/`$0B92`)
  BGM-start door (type `$12`/`$15`) -> cmd handler -> `$2E38` loads score table
           -> sequencer `$25F2` -> hundreds of keyons over many frames
SFX is ~1:1 (door -> one keyon ~0-2 frames later); BGM is 1-to-hundreds.

PORT PLAN (TODO 4): ~0.5 wave. Once TODOs 1+2+3 land, build the HISTORICAL
DRIVER: feed the 633 doors at their lf (mapped to the sound-frame timeline via
the boot offset), run the chain tick-by-tick, and diff the emitted 191,367-row
stream against ics.tsv row-for-row. The driver IS the gate: a frame-misaligned
keyon or a missed keyoff surfaces as a row mismatch.

THE TIMELINE WARP IS A CONSTANT (~38 frames). Cross-correlating door-lf against
keyon-vf: the best offset is O=38 (vf = lf + 38), and 615 of 633 doors (97%)
have a keyon within 0-2 frames after vf = lf + 38. So the sound-frame counter
leads the logic-frame counter by ~38 frames, and SFX keyons fire ~0-2 frames
after their door (the queue + dispatch latency). This DE-RISKS TODO 4 hugely:
the historical driver uses vf = lf + 38 as the door-arrival sound-frame and the
keyon should land at +0 to +2. Remaining risk: the vf=5 release-all (emit a
keyoff for all 32 voices at the top of the run, matching the 95 orphan keyoffs),
and the BGM doors (type `$12`/`$15`) whose 1:~100 mapping is mediated by the
sequencer (TODO 1b), not the +38 rule.

# 6. THE WAVE DECOMPOSITION (sizing the rest of Wave C)

Total to full 191,367-row reproduction: ~2.3 waves, ordered by dependency.

  WAVE C4  TODO 2 (ramp math)         ~0.1 wave   [trivial; tick-model confirm]
  WAVE C5  TODO 3 (keyoff)            ~0.5 wave   [emission `$0A0C` + oscEnd/duration timing]
  WAVE C6  TODO 1a immediate-SFX      ~0.4 wave   [main-loop dispatch `$0321`/`$41D0`/`$078E`
                                                    + `$3150` populator + `$0B92` programmer]
  WAVE C7  TODO 1b cue-id/BGM seq.    ~0.8 wave   [`$2E38` + score table + `$25F2`; BANKED DATA]
  WAVE C8  TODO 4 (historical map)    ~0.5 wave   [integration + row-for-row gate]
                                                    [+38 offset, vf=5 release-all]

Ordering rationale: C4 (ramp) is nearly free and unblocks nothing, do it first
to retire the W141 TODO. C5 (keyoff) frees voices so the allocator history stops
diverging after the first few keyons (it unblocks C8). C6 (immediate-SFX) ports
the main-loop dispatcher AND replaces the W142 injected provider, immediately
reproducing the 641 SFX keyons end-to-end. C7 (cue-id/BGM) is the largest single
piece and is independent of C5/C6 (it owns its own voice stream). C8
(historical) lands last and is the gate that proves the full 191,367 rows.

The single highest-risk item is C7's BANKED SCORE DATA: the cue-id table
`[$62E4]` and the note streams live in the 68k ROM (loaded through the `$C10000`
window), NOT in z80ram.bin. Porting C7 needs the 68k-side score data located and
decoded (a Wave-A/banking dependency), on top of the `$2E38`/`$25F2` logic. The
single highest-value first move is C6 (immediate-SFX): it is data-pinned (the
clustering already gives every emitted value) and it converts W142's "reproduces
one keyon" claim into "reproduces all 641 SFX keyons" immediately, plus it
delivers the main-loop dispatcher the later waves plug into.

# 7. WHAT WAVE C STILL IS NOT

Wave C reproduces the REGISTER STREAM (gate (b) of the architect plan). It does
not synthesize audio (that is Wave E). The oscEnd-timing model in C5 is a
frame-accurate SUBSET of the Wave E oscillator (enough to time the keyoff IRQ,
not enough to render samples). The pan-always-`$7F` and oscAcc-always-0 stage-1
invariants mean Wave C can lean on them; Wave E must not (later stages/BGM will
exercise pan and ramps, per the cue-id table's pan field and the BGM `$08`
format).
