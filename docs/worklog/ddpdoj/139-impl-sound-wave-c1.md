# 139 -- IMPL: sound wave C1 (the ICS2115 register file + the register-write interpreter)

status: DONE   role: implementer   wave: W27 sound, Wave C Layer 1   owns: games/ddpdoj/src/

Wave C Layer 1 of the W27 sound port (135-sound-architect-plan.md section 2).
The single deliverable: a virtual ICS2115 register file + the register-write
interpreter that consumes the (port, data) protocol, gated state-exact against
the `ics.tsv` oracle (191,367 rows). This is the first of Wave C's 3 layers; the
voice engine ($376C) and the cue dispatch ($07F6) are later waves.

# 0. PREMISE CHECK (the brief's own rule)

Every cited address and register was verified against the ROM and ics.tsv before
a line of src/ was written. Findings:

- **THE PORT MAP IS CORRECT (Wave B's refinement holds).** Decoded the three
  register primitives out of `tools/oracle/out/maincpu.bin` at Z80 offset
  (upload base `$2C348A` + entry point):
  - `writeReg16 $02AE`: `01 01 80` (LD BC,$8001) `ED 69` (OUT(C),L=reg->$8001)
    `03` (INC BC->$8002) `ED 59` (OUT(C),E=lo->$8002) `03` (INC BC->$8003)
    `ED 51` (OUT(C),D=hi->$8003) `C9`. Writes reg, lo, hi in order. CONFIRMS
    16-bit regs use BOTH lanes.
  - `writeReg8hi $02A4`: `01 01 80 ED 69 03 03 ED 59 C9`. LD BC,$8001; OUT(C),L
    (reg->$8001); INC BC; INC BC (SKIP $8002); OUT(C),E (hi->$8003). CONFIRMS
    8-bit voice regs use the HI lane only ($8002 is skipped by the double INC).
  - `readRegTimer $02C3`: `01 01 80 ED 69 03 ED 78 C9`. LD BC,$8001; OUT(C),L
    (reg); INC BC->$8002; IN A,(C) (read from $8002=LO). CONFIRMS timer/global
    regs live in the LO lane.
  So: `$8000`=status read, `$8001`=reg-select, `$8002`=data lo, `$8003`=data hi.
  Exactly Wave B's map. No correction needed.

- **REGISTER COUNT CORRECTION (cosmetic, documented).** The brief says "26
  distinct registers: 19 per-voice ($00-$11) + 7 general." ics.tsv shows the
  real counts:
  - Per-voice: $00-$11 inclusive = **18** registers (not 19).
  - General: $40/$41/$42/$43/$4A/$4B/$4C/$4D/$4F = **9** registers (not 7; the
    brief's own list names 9 while the count says 7).
  - Total: **27** distinct registers (not 26).
  - Plus $5A/$A5: sel-only artifacts (the ICS reset command; 6 rows total, 3
    pairs). They set regSelect but no data write follows, so they touch no state.
  The LISTS in the brief are correct; only the arithmetic (19+7=26) is off. This
  wave ships against the verified 27.

- **THE AUTHORITATIVE-HALF TABLE (derived from ics.tsv, confirmed by the opcodes
  above).** For each register DOJ touches, which lane(s) carry the data:
  - 16-bit (both lo+hi): $01 $02 $03 $04 $05 $06 $09 $0A $0B (9 registers)
  - 8-bit HI lane: $00 $07 $08 $0C $0D $0E $10 $11 (8 registers)
  - 8-bit LO lane (timer/global): $40 $42 $43 $4A $4C $4D $4F (7 registers)
  - Read-only (sel only, never written): $0F $41 $4B (3 registers)
  This is the F1 table. The three Z80 primitives explain it mechanically:
  writeReg16 hits both lanes; writeReg8hi skips lo (double INC BC); the timer
  reader reads lo. Layer 2 will emit writes respecting this table.

- **THE VOICE-SELECT ($4F) MECHANICS (verified against frame.lua).** frame.lua
  (the oracle capture tool, `tools/oracle/frame.lua:1479-1542`) is the ground
  truth for how ics.tsv is produced. The key behaviors:
  - `snd.osc` (currentVoice) starts at 0; `snd.active` (activeOsc) starts at 31.
  - A lo write to $4F sets `snd.osc = data % (1 + snd.active)`. Since $0E
    (activeOsc) is ALWAYS $1F=31 in the corpus (6 writes, all $1F), the modulo
    is always `data % 32 = data` for data 0-31. So voice == data for every $4F
    write (confirmed: all 23,367 of them).
  - The ics.tsv `voice` column for a $4F write is the NEW snd.osc (frame.lua
    calls reg_write, which updates snd.osc, BEFORE writing the log line). For
    sel rows the voice is the current (pre-change) osc.
  - This wave's interpreter reproduces this exactly: a $4F lo write updates
    currentVoice first, then logs under the new voice.

- **PER-VOICE REGISTER SEMANTICS (from frame.lua, for documentation + Layer 2).**
  frame.lua's reg_write decodes these registers (the rest are opaque bytes this
  layer stores but does not interpret):
  - $00 = OscConf (8-bit). $01 = OscFC (16-bit freq increment).
  - $02/$03 = OscStrt (24-bit loop/osc start; $02 lo+hi = bits 23-8, $03 hi =
    bits 7-0). $04/$05 = OscEnd (same layout).
  - $07 = volume byte (frame.lua looks at lo, but DOJ writes hi -- the known
    $07 half-byte bug; vol is always 0 in keyon.tsv. Irrelevant here: stored
    as opaque). $0C = Pan. $0D = VCtl ($01/$03 only). $0E = activeOsc ($1F
    only). $10 = OscCtl ($00=keyon, $0F=keyoff; 1620 keyons). $11 = Saddr
    (sample-address bank byte). $0F/$41/$4B = read-only.

# 1. THE REGISTER FILE (src/ics.js)

A 32-voice register file + globals, storing raw lo/hi bytes per register number.
Layer 2 (the voice engine) will read these bytes through named accessors; Layer 1
stores them faithfully and interprets the write protocol.

The storage layout:
- `voices[32]`: each `IcsVoice` has `lo[$00-$4F]` and `hi[$00-$4F]` Uint8Arrays
  (only $00-$11 are ever written per-voice, but the full range is allocated so a
  divergence report names a register number a person can look up).
- `glob.lo[$00-$4F]` / `glob.hi[$00-$4F]`: the general registers ($40-$4F).
- `currentVoice` (0-31), `regSelect` ($00-$FF), `activeOsc` (init 31).

# 2. THE REGISTER-WRITE INTERPRETER

Consumes the (port, data) protocol the Z80's I/O bus carries:
- `write($8001, data)`: regSelect = data. Log a `sel`.
- `write($8002, data)`: the lo data lane. If regSelect==$4F: update currentVoice
  = data % (1 + activeOsc), then log under the new voice. Else store
  `voices[currentVoice].lo[reg]` (or `glob.lo[reg]` for $40-$4F) and log. If
  regSelect==$0E: also extract activeOsc = data & $1F.
- `write($8003, data)`: the hi data lane. Store `voices[currentVoice].hi[reg]`
  (or `glob.hi[reg]`), log. If regSelect==$0E: extract activeOsc = data & $1F.
- `write($8000, data)`: status register (a READ port); ignored as a write.

The $5A/$A5 sel-only writes set regSelect to a non-register; the next sel
overwrites it before any data write, so they touch no state. The interpreter
handles them naturally (they are just regSelect assignments that go nowhere).

# 3. THE SHADOW/LOG/DIGEST TRIPLE (Gradius sound.js's pattern, lifted)

Every write feeds three fields, the way Gradius's `apu()` feeds `state.apu`,
`state.apuLog`, and `state.work.apuDigest`:
- **The shadow** (the register cells above): the current state, addressable by
  voice and register.
- **The log** (`regLog`): a packed Uint32 per write `(voice<<24)|(reg<<16)|
  (halfCode<<8)|data`, in order. This is the row-for-row oracle comparison.
- **The digest** (`regDigest`): a rolling 16-bit hash, folded per write:
  `h = (((h*31+voice)*31+reg)*31+halfCode)*31+data) & 0xFFFF`. Reset per frame.

The oracle comparison replays the ics.tsv write sequence as port writes and
checks (a) the log matches ics.tsv row-for-row (191,367 entries), (b) the
per-frame digest matches, and (c) the final register state matches the
last-write-per-(voice,reg,half) computed from ics.tsv.

# 4. THE MUST-FAIL (ics.tsv state-exact, red -> green)

`tests/ics.test.js` (new). The three colours:

- **GREEN.** Feed all 191,367 ics.tsv rows as port writes to the register file.
  The regLog matches the oracle row-for-row; the per-frame digests match; the
  final state (a spot-check of the last write per voice/register) matches.
- **RED.** Corrupt one row's data byte before feeding it. The log diverges at
  that row; the per-frame digest diverges; the stored register value is wrong.
- **RESTORE.** Undo the corruption; re-feed; all comparisons re-green.

Skips loudly when `rip/sound/ics.tsv` is absent (gitignored ROM-derived data).

# 5. SCOPE DISCIPLINE

Layer 1 ONLY. NOT ported (later waves):
- The voice engine `$376C` (Layer 2: the per-tick 32-voice envelope/pitch update
  that emits the bulk of ics.tsv). The named register accessors are provided for
  it but the engine itself is not.
- The cue dispatch `$07F6`/`$0829`/`$09B7` (Layer 3: cue-id-to-script).
- The timer model ($40/$41/$42/$43 timer registers are stored as opaque bytes;
  their tick semantics are Wave E's concern).

# 6. THE MUST-FAIL RESULT

`tests/ics.test.js` (7 tests, 0 skipped). The three colours, all green:
- **GREEN (log).** All 191,367 ics.tsv rows replayed as port writes; the packed
  regLog matches the oracle row-for-row with ZERO mismatches.
- **GREEN (digest).** The per-frame digests match across all 4,854 distinct
  frames (vf 5 through 5037).
- **GREEN (state).** The final register state (last-write-per-cell, spot-checked
  across per-voice lo/hi and global lo/hi) matches the oracle-derived shadow.
- **RED.** Flipping one hi-byte at a mid-stream row diverges the log at exactly
  that row, diverges the total digest, and the flipped byte is in the log.
  Restore re-greens all three comparisons.

# 7. GATES

- `node --test games/ddpdoj/tests/` -- **1324 pass / 0 fail / 0 skipped**.
  (Was 1317 after Wave B; +7 from ics.test.js.)
- `python games/ddpdoj/tools/bosscoverage.py` -- **103 / 0 / 8** (ported /
  live-unported / dead), unchanged.
- `node tools/publish.mjs --only ddpdoj --dry` -- PASS, built and gated (rom-leak
  guard clean, 6 deliberate exceptions). No new ROM windows needed (Layer 1 reads
  only the oracle TSV, never the ROM), so no export-web.mjs regen was required.

# 8. FILES

- `games/ddpdoj/src/ics.js` (new) -- the ICS2115 register file (32 voices +
  globals), the register-write interpreter (consumes the port protocol), the
  authoritative-half table (REG_HALF), the per-voice register-name aliases
  (VOICE_REG/GLOB_REG), and the shadow/log/digest triple.
- `games/ddpdoj/tests/ics.test.js` (new) -- the ics.tsv state-exact MUST-FAIL.
- `docs/worklog/ddpdoj/139-impl-sound-wave-c1.md` (this file).
