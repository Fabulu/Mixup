# 136 -- IMPL: sound wave A (the 68k cue post/queue, the KEYSTONE)

status: DONE   role: implementer   wave: W27 sound, Wave A   owns: games/ddpdoj/src/

Owner directive: "Go for sound." This is the first wave of the W27 sound port
defined by 135-sound-architect-plan.md section 2: the 68k half of the cue path,
state-exact against the de-duped mailbox oracle.

# 0. PREMISE CHECK (the brief's own rule)

Every cited address in the brief was verified against the ROM (capstone
disassembly) and the mailbox corpus before coding. The findings reshape one
claim and confirm the rest.

- The six entries, the tail, the packer, the ring, the drain and the BIOS pump
  are all at the cited addresses and behave as 135 described. CONFIRMED.
- **Dead-code trap CONFIRMED.** `$28C19A` is called (from `$23C448`) and its top
  decrements the debounce guards, but its OWN ringer (`$28C226`/`$28C252`) never
  fires in the corpus: the mailbox PC is exclusively `$18AD78` (the BIOS pump
  `$18ACE0`), which drains the ring first. `$28C19A` finds an empty ring and
  returns at `$28C258`. The live doorbell is the BIOS pump only. Modelled.
- **`$81DEB4` master-volume writer RESOLVED.** 135 called this an open item (not
  found by absolute-long scan). The writer is the sound-init `$18AAE0` (BIOS)
  and `$28BFBA` (cartridge), both `clr.w $81DEB4` (value 0). Calibrated against
  every mailbox pan byte: with masterVol=0 and `$803926`=0, the whole tail
  collapses to `panArg - $14` and all 650 wrapper-mapped doors reproduce
  byte-for-byte (see section 3). No other writer exists. Master volume is 0
  across stage 1.
- **`$44` no-op sentinel RESOLVED.** `$28C02A` carries `cmpi.w #$44,d0; beq
  -> rts`. No wrapper in the table emits id `$44` and no caller passes it
  inline. Confirmed silently-dropped, never exercised in stage 1.
- **`$803926` entanglement RESOLVED.** The sound side READS `$803926` (the
  dual-role midboss-column selector / sound mute) and NEVER writes it. gameplay
  owns the write (handlers.js); sound consumes the same value. Verified the
  corpus has `$803926 = 0`, so the `$3C` pan subtract never fires and the
  sfx/bgm gates pass.

# 1. WHAT WAS PORTED

`games/ddpdoj/src/sound.js` (new, ~330 lines) -- the complete 68k cue engine:

1. **The six entries** (`$28C02A`/`$28C074`/`$28C0AE`/`$28C0E8`/`$28C0FC`/`$28C10C`)
   with exact per-entry gate logic. The BGM entry drops id `$44` and, under a
   live `$803926`, posts only id `$17`; the SFX/T2 entries post unless all three
   gates are quiescent with `$803926 != 0`; the three streaming entries are
   ungated.
2. **The tail `$28BFEC`** (pan subtract `$14`/`$3C`, master-volume add, clamp
   `0..$FF`).
3. **The packer `$28BB04`** -- `[type][pan][id][chan<<2|(id>>8)&3]` longword.
4. **The ring** at `$81DD1E` (100 slots), HEAD `$81DEAE` (+4, wrap `$190`),
   TAIL `$81DEB0` (+4, wrap `$190`), leave-one-empty full check. Enqueue
   `$28BAA0`; dequeue is the byte-identical `$28BA5E`/`$18A584`.
5. **The per-frame drain** (`drainFrame`): debounce decrement at the top (the
   `$28C19A` top), then one dequeue + the `$C10006`/`$C10008` write + the
   `$C00002 := $0001` doorbell (the BIOS pump `$18ACE0`). The `$C00004` ACK is
   immediate-post (the corpus acked within every frame), flagged for Wave C.
6. **The three gates** (`$80380A`/`$80392A`/`$803926`) as RAM reads. `$803926`
   is READ ONLY on the sound side.
7. **The debounce wrappers** `$28C5E4` (id `$1E`, guard 2) and `$28C714` (id
   `$24`, guard 3): the re-trigger guard arms on post, the drain decrements.
8. **The wrapper table**: 69 wrappers auto-extracted via capstone
   (`.scratch/sound_wave_a/extract_wrappers.py`), each carrying its literal
   id/pan/channel/entry.
9. **The streaming rejoiners** `$28C11C` (type `$12`) and `$28C146` (type
   `$11`) and the `postStreamingRejoiner` helper; they share the tail+pack.

Wiring:
- `main.js` constructs `this.sound = new SoundState()` per game and calls
  `drainFrame(this.ram, this.sound, this.logicFrame)` once per `step()`, after
  the object driver (where posts accumulate) and before the logic-frame
  increment.
- `ctx.soundPost(addr)` is the one-for-one replacement for the counted
  `note(ctx, 0x28Cxxx, ...)` placeholders.

The ~25 sound `note()` placeholders REPLACED with real posts through the
wrappers, across: handlers.js (12 death-burst sites), shots.js (the 172x shot
impact `$28C714` and the 368x shot-fire `$28C3BA`), items.js (6 pickup sites),
boss.js (6), midboss.js (2), bee.js (1), stageend.js (the bonus-event `$28C6C6`),
hud.js (EXTEND, boss warning, tally), bomb.js (bomb + laser-bomb cues) and
laser.js (the segment-handler `$28C074` family and the pool-wipe indirect
dispatch through table `$2527BE`).

# 2. THE STREAMING-BGM-START PATH (folded in / deferred)

The streaming-BGM-START path (`$28CB1A`/`$28CAFC`/`$28CB60`, table `$28BBD8`,
rejoiners `$28C11C`/`$28C146`, poller `$28BE76`) shares the ring and drain (so
its cues enqueue through the same engine) and the rejoiners are ported. The
parts NOT wired this wave, with measured reasons:

- **The poller `$28BE76`** reads the raw input port (`$23D186`) to drive the
  music fade (`$81DEBA`/`$81DEBC`) and to post type `$11`/`$12`/`$15` cues off
  table `$28BBD8`. Its frame-level behaviour is input-bit-driven and cannot be
  verified without a full stage1-deep replay (see section 4). The engine supports
  it (`postStreamingRejoiner`); the wiring is the open part.
- **`$28CB60` (stage-clear BGM start)** and **`$28C170`/`$28C186`** (the `$28BBAC`
  BGM commands) are NOT standard wrappers; `$28CB60` calls `$28CB1A` which loads
  a whole BGM sequence. These stay as `note()` for now (3 doors of 633) and are
  the streaming-start deferral.

These contribute 14 of 633 cue doors (types `$0F`/`$10`/`$11`/`$12`/`$15`), all
in the deferred streaming space. The 619 wrapper-mapped doors are the live claim.

# 3. THE MUST-FAIL

`games/ddpdoj/tests/sound.test.js` proves the post+tail+pack+enqueue+drain
transform is BYTE-EXACT against every wrapper-mapped door in the de-duped oracle:

- **GREEN.** For each of the 619 wrapper-mapped doors, post the matching wrapper
  and drain; the drained longword reproduces the oracle `(type,pan,id,chan)`
  byte-for-byte. 0 mismatches.
- **RED 1 (baseline).** With posting suppressed (the old `note()` behaviour),
  the door stream is empty, the digest is 0, and it diverges from the non-zero
  oracle digest.
- **RED 2 (break).** Corrupt one wrapper's pan; the digest diverges. Restore;
  the digest re-greens.

The `SoundState.fold` polynomial mixes all four bytes (type/pan/id/chan), so a
change to ANY one (including the pan the tail computes) moves the digest.

Calibration (the load-bearing measurement): with `masterVol = 0` and
`$803926 = 0`, the tail is `panArg - $14` (pan - $3C never taken) for every
non-`$1D` id, and every wrapper-mapped door's pan byte matches. Verified in
Python over all 653 raw cue doors before porting (`.scratch/sound_wave_a/
transform_sim.py`): 650 byte-exact, 2 are the `$7676` Z80-upload artifact, 1 is
a rare id `$41` BGM cue.

# 4. THE MEASURED DEFERRAL (frame-for-frame alignment)

The mailbox capture ran INSIDE MAME (`pgm.py sound`, the `stage1-deep` scenario
from a cold boot, first door at lf 561). The port has NO stage1-deep seed or
`portin` recording -- the capture did not go through the port harness -- so the
port cannot today reproduce the door sequence frame-for-frame.

This wave therefore proves the TRANSFORM is byte-exact (the strong, load-bearing
claim: the engine reproduces every door's bytes), and defers the FRAME-LEVEL
green (which logic frame each door fires on). Frame alignment depends on the
`note()` sites' gameplay timing, which the existing stage1-open oracle exercises
on a different scenario. Closing the frame-level gap needs either a stage1-deep
seed + portin capture through the port harness, or a cold-boot path -- both are
follow-on work, not Wave A.

The unstable raw `mailbox.tsv` (actively written during this wave, 638-657 rows
across reads) was snapshotted and de-duped into a STABLE committed oracle,
`games/ddpdoj/tests/fixtures/mailbox_dedup.tsv` (633 cue doors, the MAME
consecutive-pair artifact collapsed). That file is the canonical oracle for this
and future sound waves.

# 5. GATES

- `node --test games/ddpdoj/tests/`: 1313 pass, 0 fail (1309 prior + 4 new
  sound tests). The 12 tests that previously asserted sound cues were "COUNTED
  notes" were updated: their fixtures now route `ctx.soundPost` into the log so
  the cue-firing assertions still see them (the cue is now POSTED, not noted).
- `python games/ddpdoj/tools/bosscoverage.py`: 103/0/8 (unchanged).
- `node tools/publish.mjs --only ddpdoj --dry`: built and gated, clean. No new
  ROM windows were added (the laser pool-wipe table at `$2527BE` was inlined as
  4 constant longwords, so no `RomWindows` declaration and no asset regen).

# 6. FILES

new: `games/ddpdoj/src/sound.js`, `games/ddpdoj/tests/sound.test.js`,
      `games/ddpdoj/tools/soundgate.mjs`,
      `games/ddpdoj/tests/fixtures/mailbox_dedup.tsv` (the stable oracle).
touched: `src/main.js` (wiring), `src/{handlers,shots,items,boss,midboss,bee,
  stageend,hud,bomb,laser}.js` (note -> soundPost), and 5 test fixtures.
