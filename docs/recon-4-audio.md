# RECON-4 — AUDIO ENGINE & MUSIC DATA

ROM: `Batman - Return of the Joker (USA, Europe).gb` (128 KB, MBC1, Sunsoft).
Static analysis only, no emulator. Everything below is **CONFIRMED from code**
unless explicitly marked UNCONFIRMED.

Tooling added by this pass:

| script | purpose |
|---|---|
| `tools/dumpsong.py` | sound-sequence disassembler. `--index`, `--song N`, `--all`, `--freq`, `--waves`, `-o FILE` |

```
python tools/dumpsong.py "Batman - Return of the Joker (USA, Europe).gb" --index
python tools/dumpsong.py "Batman - Return of the Joker (USA, Europe).gb" --song 0
python tools/dumpsong.py "Batman - Return of the Joker (USA, Europe).gb" --all -o rip/songs_all.txt
```

Reference output committed to `rip/`:
`song_index.txt`, `pitch_table.txt`, `song_00_title.txt`, `song_0B_sfx.txt`,
`wave_tables.txt`, `songs_all.txt` (all 47 songs, 14 810 lines).

---

## 0. Bank-7 layout (corrects recon-1)

| range | size | contents |
|---|---|---|
| `7:$4000-$46D4` | 1749 | driver code |
| `7:$46D5-$477C` | 168 | **pitch table**, 84 × 16-bit LE, values biased by `-$80` |
| `7:$477D-$47DA` | 94 | **song pointer table**, 47 × 16-bit LE |
| `7:$47DB-$47E9` | 15 | 3 shared wave-volume envelopes (`$47DB`, `$47E0`, `$47E5`) |
| `7:$47EA-$47F9` | 16 | wave table A — **never referenced by any song** |
| `7:$47FA-$4809` | 16 | wave table B — the only waveform the game ever loads |
| `7:$480A-$7956` | 12 621 | song / SFX sequence data, envelopes, pitch envelopes |
| `7:$7960-$7FFF` | 1696 | **NOT SOUND** — a VRAM script (ending text), run by `00:3758` |

`7:$7957-$795F` is `$FF` padding. Free space in bank 7 is therefore only those
9 bytes; the tail is used.

The claim in recon-1 that `7:$46D5-$7FFF` is all music data is wrong by
1696 bytes at the top.

---

## 1. THE SEQUENCE OPCODE SET (the key deliverable)

A sequence byte `< $C8` is a **note**. A byte `>= $C8` is an opcode, dispatched
at `7:$4181 JP HL` through the 56-entry LE table at **`7:$43CE`**
(`index = byte - $C8`).

Notation used below:
* `ch[+n]` = the current track's channel-state byte at offset `n` (see §2).
* `b` = one raw operand byte; `w` = 16-bit LE address inside bank 7.
* `D` = a duration byte that is **present only when `ch[+$04] == 0`**. When
  `ch[+$04]` (FIXDUR) is non-zero, no byte is consumed and that value is used.
  This makes the stream **context-sensitive**: a decoder must track FIXDUR.

| byte | idx | handler | name | operands | effect |
|---|---|---|---|---|---|
| `$C8` | 0 | `$443E` | `CHMASK_XOR` | b | `[$C80A] ^= b` |
| `$C9` | 1 | `$4445` | `CHMASK_OR` | b | `[$C80A] \|= b` |
| `$CA` | 2 | `$444C` | `CHMASK_AND` | b | `[$C80A] &= b` |
| `$CB` | 3 | `$4458` | `DRUM 3` | D | trigger preset drum slot 3 (`$C82A`) |
| `$CC` | 4 | `$445D` | `DRUM 2` | D | slot 2 (`$C827`) |
| `$CD` | 5 | `$4462` | `DRUM 1` | D | slot 1 (`$C824`) |
| `$CE` | 6 | `$4467` | `DRUM 0` | D | slot 0 (`$C821`) |
| `$CF` | 7 | `$4492` | `DEFDRUM 3` | b,b,b | define slot 3 = {NRx2, attack noise byte, sustain noise byte} |
| `$D0` | 8 | `$4497` | `DEFDRUM 2` | b,b,b | define slot 2 |
| `$D1` | 9 | `$449C` | `DEFDRUM 1` | b,b,b | define slot 1 |
| `$D2` | 10 | `$44A1` | `DEFDRUM 0` | b,b,b | define slot 0 |
| `$D3` | 11 | `$44B0` | `FIXDUR_OFF` | — | `ch[+$04] = 0` (durations come from the stream again) |
| `$D4` | 12 | `$44B7` | `SLIDE 5` | note[,D] | play preset slide slot 5 (`$C81E`) |
| `$D5` | 13 | `$44BC` | `SLIDE 4` | note[,D] | slot 4 (`$C81B`) |
| `$D6` | 14 | `$44C1` | `SLIDE 3` | note[,D] | slot 3 (`$C818`) |
| `$D7` | 15 | `$44C6` | `SLIDE 2` | note[,D] | slot 2 (`$C815`) |
| `$D8` | 16 | `$44CB` | `SLIDE 1` | note[,D] | slot 1 (`$C812`) |
| `$D9` | 17 | `$44D0` | `SLIDE 0` | note[,D] | slot 0 (`$C80F`) |
| `$DA` | 18 | `$452A` | `DEFSLIDE 5` | b,b,b | define slot 5 = {per-tick pitch delta, attack note, attack duration} |
| `$DB` | 19 | `$452F` | `DEFSLIDE 4` | b,b,b | |
| `$DC` | 20 | `$4534` | `DEFSLIDE 3` | b,b,b | |
| `$DD` | 21 | `$4539` | `DEFSLIDE 2` | b,b,b | |
| `$DE` | 22 | `$453E` | `DEFSLIDE 1` | b,b,b | |
| `$DF` | 23 | `$4543` | `DEFSLIDE 0` | b,b,b | |
| `$E0` | 24 | `$4552` | `PITCHENV_OFF` | — | `ch[+$11] = 0` (null the pitch-envelope base pointer HI) |
| `$E1` | 25 | `$4558` | `PITCHENV_DELAY 0` | — | `ch[+$0C] = 0` |
| `$E2` | 26 | `$455E` | `PITCHENV_DELAY 1` | — | `ch[+$0C] = 1` |
| `$E3` | 27 | `$4565` | `PITCHENV_DELAY 1 + GATE_OFF` | — | `ch[+$0C] = 1`, falls through into `$E4` |
| `$E4` | 28 | `$456C` | `GATE_OFF` | — | `ch[+$06] = 0` (no key-off) |
| `$E5` | 29 | `$4576` | `PAN_LEFT` | — | `ch[+$1A] = tbl$4593[hwchan]` = `10 20 40 80` |
| `$E6` | 30 | `$457B` | `PAN_RIGHT` | — | `ch[+$1A] = tbl$4597[hwchan]` = `01 02 04 08` |
| `$E7` | 31 | `$4580` | `PAN_CENTER` | — | `ch[+$1A] = tbl$459B[hwchan]` = `11 22 44 88` |
| `$E8` | 32 | `$459F` | `VIBRATO` | b | `ch[+$19] = b` — signed per-tick delta added to the 16-bit frequency every tick |
| `$E9` | 33 | `$45AB` | `LEGATO_OFF` | — | `RES 5, ch[+$00]` |
| `$EA` | 34 | `$45B3` | `LEGATO_ON` | — | `SET 5, ch[+$00]` — suppresses retrigger + key-off |
| `$EB` | 35 | `$45BB` | `TIE` | D | new duration + new gate, **no pitch change, no retrigger** |
| `$EC` | 36 | `$45DB` | `DUTY` | b | `ch[+$18]` → NRx1 (bits 7-6 duty, bits 5-0 length) |
| `$ED` | 37 | `$45E1` | `RET` | — | return to `ch[+$20]/ch[+$21]`+2; **no-op if `ch[+$21] == 0`** |
| `$EE` | 38 | `$45F8` | `CALL` | w | save ptr in `ch[+$20]/+$21`, jump. **1 level deep only** |
| `$EF` | 39 | `$4608` | `LOOP_B` | b,w | counter `ch[+$23]` |
| `$F0` | 40 | `$460D` | `LOOP_A` | b,w | counter `ch[+$22]` |
| `$F1` | 41 | `$462C` | `JUMP` | w | unconditional |
| `$F2` | 42 | `$4633` | `FIXDUR` | b | `ch[+$04] = b` — all following notes use this duration and consume no duration byte |
| `$F3` | 43 | `$4639` | `DETUNE` | b | `ch[+$09] = b` — **unsigned** byte added to the 16-bit frequency word (default `$80`) |
| `$F4` | 44 | `$463F` | `TRANSPOSE` | b | `ch[+$08] = b` — added to the note index before the pitch lookup |
| `$F5` | 45 | `$4645` | `RELEASE_ENV` | b | `ch[+$1F]` — NRx2 low nibble substituted on REST |
| `$F6` | 46 | `$464B` | `REST` | D | note off: duration, gate 0, `NRx2 = (ch[+$12] & $F0) \| ch[+$1F]`, null the volume-envelope pointer, retrigger |
| `$F7` | 47 | `$467C` | `PITCHENV_DELAY` | b | `ch[+$0C] = b` |
| `$F8` | 48 | `$4682` | `PITCHENV_PTR` | w | `ch[+$10]/+$11` = pitch envelope base |
| `$F9` | 49 | `$4687` | `GATE` | b | `ch[+$06] = b * 2` |
| `$FA` | 50 | `$4694` | `KEYOFF_VOLENV_PTR` | w | `ch[+$1D]/+$1E` = release volume envelope |
| `$FB` | 51 | `$4699` | `WAVE_PTR` | w | `SET 1, ch[+$00]`; `ch[+$1B]/+$1C` = 16-byte wave table |
| `$FC` | 52 | `$46A2` | `VOLENV_PTR` | w | `ch[+$16]/+$17` = volume envelope base |
| `$FD` | 53 | `$46B1` | `PAN_RAW` | b | `ch[+$1A] = b` (raw NR51 contribution) |
| `$FE` | 54 | `$46B7` | `VOLUME` | b | `ch[+$17] = 0` (kill volume envelope), `ch[+$12] = b` (static NRx2) |
| `$FF` | 55 | `$46C9` | `END` | — | `[$C800+hwchan] = 0`, `ch[+$00] = 0` — track stops, releases the APU channel |

### Notes ( byte `$00-$C7` ), handler `7:$4182`

```
note_index = stream_byte                       ; $00..$C7
duration   = ch[+$04] ? ch[+$04] : next_stream_byte
ch[+$05]   = duration
gate       = min(duration, ch[+$06]) >> 1 - 1  ; wraps to $FF when ch[+$06]==0
ch[+$07]   = gate
n          = (note_index + ch[+$08]) & $FF     ; transpose
if hwchan == 3 (noise):
    ch[+$0A] = 3                               ; goes to NR44
    ch[+$0B] = n                               ; goes to NR43 verbatim
else:
    f = pitchtab[n] + ch[+$09]                 ; 16-bit, ch[+$09] default $80
    ch[+$0A] = f >> 8 ; ch[+$0B] = f & $FF
if !LEGATO (bit5 of ch[+$00]):
    ch[+$0D] = ch[+$0C]                        ; arm pitch envelope
    ch[+$0E],ch[+$0F] = ch[+$11],ch[+$10]      ; reload pitch-env pointer (HI,LO)
    ch[+$14],ch[+$15] = ch[+$17],ch[+$16]      ; reload volume-env pointer (HI,LO)
    ch[+$13] = 1
ch[+$00] |= $01                                ; retrigger
```

**There is no separate rest/tie encoding in the note range.** Rest is opcode
`$F6`, tie is opcode `$EB`. Note value 0 is a legitimate note (C2).

### Key-off / gate (`7:$41EF`)

Fires on any tick where, after `--ch[+$05]`, `ch[+$05] == ch[+$07]` and
LEGATO is clear:

```
ch[+$14],ch[+$15] = ch[+$1E],ch[+$1D]   ; switch to the release envelope
ch[+$13] = 1
```

### The pitch table `7:$46D5` — 84 entries, C2 .. B8

Entries are stored **biased by `-$80`**; the per-channel detune `ch[+$09]`
defaults to `$80` and un-biases them, so `freq_reg = table[n] + detune`.
Entry 0 is `$FFAC`; `$FFAC + $80 = $002C` → `131072/(2048-44) = 65.41 Hz` = C2.
The result is exact 12-TET, ≤ ±2 cents through index 47 (B5).

```
idx 0 = C2, idx 12 = C3, idx 24 = C4, idx 36 = C5,
idx 48 = C6, idx 60 = C7, idx 72 = C8, idx 83 = B8
```

Full listing (raw / +$80 / Hz) is in `rip/pitch_table.txt`.
`DETUNE` values other than `$80` shift pitch by `(b - $80)` in raw
frequency-register units — a fine, non-musical detune (used sparingly:
4 sites in the whole ROM).

---

## 2. CHANNEL STATE — `$C800-$C94C`

**8 track slots, stride `$24` (36) bytes, base `$C82D`.**
`$C82D + 8*$24 = $C94D`, matching the `$014D`-byte clear at `7:$4021`.

### 2.1 Per-track record (offsets from `$C82D + slot*$24`)

| off | name | meaning |
|---|---|---|
| `+$00` | **flags** | see bit table below |
| `+$01` | **hwchan** | APU channel 0-3 (0=pulse1, 1=pulse2, 2=wave, 3=noise) |
| `+$02` | seq ptr LO | current sequence pointer (little-endian pair) |
| `+$03` | seq ptr HI | |
| `+$04` | FIXDUR | non-zero ⇒ notes take no duration byte (`$F2`/`$D3`) |
| `+$05` | duration counter | decremented once per tick; 0 ⇒ fetch next event |
| `+$06` | gate length | `2 ×` the `GATE` operand; 0 = no key-off |
| `+$07` | gate counter | key-off fires when `+$05 == +$07` |
| `+$08` | transpose | added to the note index |
| `+$09` | detune | **unsigned** byte added to the 16-bit frequency; init `$80` |
| `+$0A` | freq HI | → `$FFDB` → NRx4 |
| `+$0B` | freq LO | → `$FFDA` → NRx3 |
| `+$0C` | pitch-env delay | reload value for `+$0D` |
| `+$0D` | pitch-env counter | after the first fire it runs once per tick |
| `+$0E` | pitch-env ptr **HI** | active pointer, stored **big-endian** |
| `+$0F` | pitch-env ptr **LO** | |
| `+$10` | pitch-env base LO | set by `$F8`, little-endian |
| `+$11` | pitch-env base HI | `0` ⇒ pitch envelope disabled |
| `+$12` | current NRx2 | → `$FFD9` |
| `+$13` | vol-env counter | |
| `+$14` | vol-env ptr **HI** | active pointer, **big-endian** |
| `+$15` | vol-env ptr **LO** | `+$14 == 0` ⇒ static volume from `+$12` |
| `+$16` | vol-env base LO | set by `$FC`, little-endian |
| `+$17` | vol-env base HI | |
| `+$18` | NRx1 value | duty (bits 7-6) + length (bits 5-0) → `$FFD8` |
| `+$19` | vibrato / slide | signed per-tick delta added to `{+$0A,+$0B}` |
| `+$1A` | NR51 contribution | OR-accumulated into `$FFDD` |
| `+$1B` | wave ptr LO | set by `$FB`, little-endian |
| `+$1C` | wave ptr HI | |
| `+$1D` | release-env LO | set by `$FA`, little-endian |
| `+$1E` | release-env HI | |
| `+$1F` | release nibble | NRx2 low nibble substituted by `REST` |
| `+$20` | CALL return LO | |
| `+$21` | CALL return HI | `0` ⇒ no pending return (`RET` becomes a no-op) |
| `+$22` | LOOP_A counter | opcode `$F0` |
| `+$23` | LOOP_B counter | opcode `$EF` |

### 2.2 `+$00` flag bits

| bit | set by | meaning |
|---|---|---|
| 7 | `$40FA`, resume | **track active** |
| 6 | pause `$4071` | paused (resume XORs `$C0`) |
| 5 | `$EA`/`$E9`, `$D4-$D9` | **LEGATO** — no retrigger, no key-off |
| 4 | `$422D` | freq HI changed this tick ⇒ NRx4 must be rewritten |
| 3 | `$CB-$CE`, `$D4-$D9` | **auto-note mode** — on duration expiry replay `[$C80B]/[$C80C]` (or `[$C80D]/[$C80E]` on noise) instead of fetching from the stream |
| 2 | — | never set (survives the `AND $EC` mask, otherwise unused) |
| 1 | `$FB`, `$42B4` | wave table upload pending |
| 0 | many | **retrigger** — write NRx2 and set NRx4 bit 7 this tick |

Bits 0, 1 and 4 are cleared at the top of every tick (`$414E AND $EC`).
Bits 3 and 5 are cleared together by `AND $D7` at `$4389`.

### 2.3 Driver globals `$C800-$C82C`

| addr | meaning |
|---|---|
| `$C800-$C803` | **APU channel ownership**, one byte per hardware channel = `owning track index + 1`, `0` = free |
| `$C804` | track loop cursor 0..7 |
| `$C805` | **unused** (zero code references) |
| `$C806` | NR51 AND-mask, `$FF` at hard init — global per-output mute |
| `$C807` | fade countdown |
| `$C808` | fade-**in** rate (reload for `$C807`); `$40A0` sets `$0A` |
| `$C809` | fade-**out** rate; `$40AC` sets `$12` |
| `$C80A` | global flag byte; **bit 7 = sound disabled** (blocks new songs at `$40C6`). Only mutated by opcodes `$C8/$C9/$CA` |
| `$C80B` | auto-note: pitched note index |
| `$C80C` | auto-note: pitched remaining duration |
| `$C80D` | auto-note: noise NR43 value |
| `$C80E` | auto-note: noise remaining duration |
| `$C80F-$C820` | 6 × 3-byte **SLIDE presets**, slot 0 at `$C80F` … slot 5 at `$C81E`. Record = `{per-tick pitch delta, attack note, attack duration}` |
| `$C821-$C82C` | 4 × 3-byte **DRUM presets**, slot 0 at `$C821` … slot 3 at `$C82A`. Record = `{NRx2, attack NR43, sustain NR43}` |

### 2.4 HRAM used by the driver

| addr | meaning |
|---|---|
| `$FFD2` | pending command bitmask (written by the Timer IRQ from the queue) |
| `$FFD3` | pending song/SFX id |
| `$FFD4` | status latch: `$00` while starting a song, `$FF` when done / paused / resumed. **Written 5×, read 0× anywhere in the ROM** — dead |
| `$FFD5` | current track's hardware channel |
| `$FFD6` | scratch (note byte / envelope duration / song track index) |
| `$FFD8` | NRx1 shadow for this tick |
| `$FFD9` | NRx2 shadow |
| `$FFDA` | NRx3 shadow (frequency LO) |
| `$FFDB` | NRx4 shadow (frequency HI, `\|$80` on trigger) |
| `$FFDC` | **NR50 shadow** (master volume, moved by the fader). Init `$77` |
| `$FFDD` | NR51 accumulator, rebuilt from scratch each tick |

---

## 3. THE DRIVER

### 3.1 `7:$4000` — hardware init (called once, from `00:019E`)

```
NR52 = $00 ; NR52 = $80          ; APU off then on
$FFDD = $00 ; NR51 = $00
$FFDC = $77 ; NR50 = $77         ; max volume, both outputs
NR32 = $00                       ; wave muted
NR30 = $80                       ; wave DAC on
NR34 = $80                       ; (spurious wave trigger)
NR10 = $08                       ; sweep off (period 0), negate=1
memset($C800, 0, $014D)          ; all driver RAM
[$C806] = $FF                    ; NR51 mask
$FFD2 = 0
```

### 3.2 `7:$4036` — soft reset (command bit 1)

Clears `+$00` of all 8 tracks, `$C800-$C803`, `$C80A`, `$C807-$C809`,
and sets `$FFDC = $77`. Does **not** touch the APU directly — silence comes
from the per-tick sweep in §3.5 step 6.

### 3.3 `7:$405D` — pause (called from `00:061E`)

For each of the 8 tracks with bit 7 set: `flags = (flags & $7F) | $43`
(clear active, set bit 6 "was active", set bits 0/1 which are harmless).
Then `$FFD4 = $FF`. **The APU registers are left exactly as they are** — a
sustained note keeps ringing until its hardware envelope expires.

### 3.4 `7:$4083` — resume (called from `00:063D`)

For each track with bit 6 set: `flags ^= $C0` (restore bit 7, clear bit 6).

### 3.5 `7:$412B` — the per-tick update (called from the Timer IRQ at `00:0990`)

```
1.  read $FFD2 command bitmask:
      bit1 -> CALL $4036 (reset)     bit0 -> CALL $40B8 (start song $FFD3)
      bit3 -> CALL $40A0 (fade in)   bit2 -> CALL $40AC (fade out)
    then $FFD2 = 0.                  Order is fixed: reset, start, fade-in, fade-out.
2.  $C804 = 0 ; DE = $C82D ; $FFDD = 0
3.  for track = 0..7:
      flags &= $EC
      if !(flags & $80): goto next
      $FFD5 = ch[+$01]
      if --ch[+$05] != 0:
          if ch[+$05] == ch[+$07] and !LEGATO: switch to release envelope
      else:
          if flags bit3: auto-note replay      ; $4389
          else:          fetch/execute stream events until a note/rest/tie
      --- per-tick modulation, always ---
      a) vibrato: {+$0A,+$0B} += (int8)ch[+$19]; $FFDA = lo; if carry, bit4 set
         $FFDB = ch[+$0A]
      b) pitch envelope: if --ch[+$0D] == 0 -> ch[+$0D] = 1, step the byte
         stream at {+$0E,+$0F}: byte <$80 adds to $FFDA (clamped $FF),
         byte >$80 subtracts (clamped $00), byte ==$80 = 2-byte LE jump.
         The updated pointer is written back to +$0E/+$0F.
      c) volume envelope: if --ch[+$13] == 0, step the pair stream at
         {+$14,+$15}: {NRx2 value, duration}; $FF = 2-byte LE jump.
         Writes $FFD9, ch[+$12], ch[+$13] and SETS THE RETRIGGER BIT.
         Otherwise $FFD9 = ch[+$12].
      d) $FFD8 = ch[+$18]
      --- arbitration ---
      e) if track+1 < [$C800+hwchan]: skip output entirely (lower priority)
         if track+1 > [$C800+hwchan]: claim it, force flags |= $03
      --- register write-out ---
      f) wave channel (hwchan==2):
           if flags bit1: NR30=0; upload 16 bytes from {+$1B,+$1C} to $FF30-$FF3F;
                          $FFDB |= $80; NR30 = $FFDB; set retrigger
           NR32 = $FFD9 ; NR33 = $FFDA
           if flags & $11: NR34 = $FFDB
         else:
           base = $FF11 + hwchan*5           ; NR11/NR21/NR31/NR41
           NRx1 = $FFD8                       ; ALWAYS
           if retrigger: NRx2 = $FFD9 ; NRx3 = $FFDA ; NRx4 = $FFDB | $80
           else:         NRx3 = $FFDA ; if bit4: NRx4 = $FFDB
      g) $FFDD |= ch[+$1A]
      next: DE += $24 ; ++$C804
4.  for hw = 0..3: if [$C800+hw] == 0 then NRx2 = 0   ; $FF12/$17/$1C/$21
5.  NR50 = $FFDC ; NR51 = $FFDD & [$C806]
6.  fader: if [$C807] != 0 then --[$C807]
           elif [$C808] != 0 then [$C807]=[$C808], $FFDC += $11 (stop on carry)
           elif [$C809] != 0 then [$C807]=[$C809], $FFDC -= $11 (stop on borrow)
```

Tick rate: `rTMA=$BB`, `rTAC=$04` ⇒ `4096/(256-0xBB) = 4096/69 = 59.36 Hz`.
**All durations in the data are in these ticks. There is no tempo divider and
no tempo opcode.** A "tempo mod" must patch `$00249` (`rTMA`).

### 3.6 `7:$40B8` — start song (command bit 0)

```
HL = [$477D + 2*$FFD3]           ; song header pointer
if [$C80A] & $80: return         ; sound globally disabled
$FFD4 = 0
loop:
   slot = *HL++                  ; $FF = end of header -> $FFD4 = $FF, return
   base = $C82D + slot*$24
   if base[+$00] & $80: [$C800 + base[+$01]] = 0     ; free the old owner
   base[+$00] = $80              ; active
   base[+$01] = *HL++            ; hardware channel
   base[+$02] = *HL++            ; seq ptr lo
   base[+$03] = *HL++            ; seq ptr hi
   base[+$04..+$08] = 0
   base[+$05] = 1                ; fire on the very next tick
   base[+$09] = $80              ; detune bias
   base[+$11] = 0 ; base[+$12] = 0 ; base[+$19] = 0
   base[+$21] = 0 ; base[+$22] = 0 ; base[+$23] = 0
```

Note the fields deliberately **not** cleared: `+$06`, `+$07`, `+$0A..+$10`,
`+$13..+$18`, `+$1A..+$20`. A track therefore inherits its previous duty, pan,
gate, wave pointer and envelope pointers. A JS port must reproduce this or
short SFX will sound different on first vs. subsequent plays.
**UNCONFIRMED**: whether any song relies on that inheritance. Settle it by
diffing register writes between the first and second play of each SFX.

---

## 4. SONG TABLE `7:$477D` — 47 entries

Entry `i` = 16-bit LE pointer to a **header**: a list of 4-byte records
`{track slot 0-7, hardware channel 0-3, stream ptr lo, stream ptr hi}`
terminated by a single `$FF` byte. There is no bank field — everything is
bank 7.

**47 is proven twice**: `$477D + 47*2 = $47DB`, exactly where the shared
envelope data starts; and the debug sound test at `00:3937-$3947` passes the
`$FF80` cursor (documented 0..`$2E`) straight through as the id.

**Slot allocation convention:**
* songs `$00-$0A` and `$2E` use **track slots 0-3** = music
* songs `$0B-$2D` use **track slots 4-7** = sound effects

Because the arbitration in §3.5(e) gives the channel to the **higher** track
index, SFX (slots 4-7) always pre-empt music (slots 0-3) on the same hardware
channel, and the music resumes control automatically when the SFX hits `END`.

### 4.1 Song index → game context

| id | header | tracks | role | evidence |
|---|---|---|---|---|
| `$00` | `$480A` | 0-3 / ch0-3 | **title screen theme** | `00:02A4` `LD BC,$0003` just before LCD-on of the title |
| `$01` | `$49E7` | 0-3 | **stage-select / map theme** | `00:0358`, `00:3637` (both jump to `$035B` = stage select) |
| `$02` | `$4B6D` | 0-3 | **stage theme A** (levels 1,2,3) | table `00:$1023`/`$1031` |
| `$03` | `$50CD` | 0-3 | **stage theme B** (levels 5,6,7) | same |
| `$04` | `$5653` | 0-3 | **stage theme C** (levels 9,10) | same |
| `$05` | `$5B37` | 0-3 | **stage theme D** (levels 12,13) | same |
| `$06` | `$5E6C` | 0-3 | **boss theme** (levels 4,8,11) + `01:72CE` | same |
| `$07` | `$61A8` | 0-3 | **final-stage theme** (level 14) | same |
| `$08` | `$64FD` | 0-3 | **stage clear** | `00:34F9`, in the level-complete path |
| `$09` | `$6601` | 0-3 | **death jingle** | `00:2A05`, right after `$C712 = $78` death countdown |
| `$0A` | `$677E` | 0-3 | **ending / staff roll** | `00:36A3`, after a 180-frame hold, before the credits VRAM script |
| `$0B` | `$6E4B` | 6 / ch1 | **pause** (ascending arpeggio, fading) | `00:062E`, inside the Start-pressed branch |
| `$0C` | `$6E96` | 6 / ch0, 7 / ch1 | *no call site* — sound-test only | |
| `$0D` | `$6EE3` | 5 / ch2, 4 / ch3 | title "start game" confirm | `00:0318` |
| `$0E` | `$6F34` | 6 / ch0, 5 / ch1 | **menu cursor move** | `00:02F3`, `00:0406`, `00:041B`, `00:38DE` |
| `$0F` | `$6F79` | 4 / ch3 | **jump** | `00:1A38` (jump code), `01:404B` (sets AirState=1) |
| `$10` | `$6FB3` | 4 / ch3 | **punch / batarang throw** | `00:1947`, `00:19B0`, `00:1A18` |
| `$11` | `$6FED` | 4 / ch3 | batarang impact | `00:3DFF` |
| `$12` | `$7029` | 4 / ch3 | **player takes damage** | `00:2782` inside `sub_00_2777` |
| `$13` | `$7069` | 6 / ch1 | title confirm / pickup | `00:02D5`, `01:4DA9` |
| `$14` | `$70B9` | 5 / ch1 | **batarang-ammo pickup** | `01:4D99`, next to `ADD A,$0A` at `01:4D9F` |
| `$15` | `$7107` | 6 / ch1 | **max-HP upgrade pickup** | `01:4D5F`, next to `ADD A,$02` at `01:4D68` |
| `$16` | `$715A` | 6 / ch1 | energy pickup | `00:1602`, followed by `$FF8E`/`$FF8A` HP math |
| `$17` | `$719B` | 5 / ch3 | tile/terrain break | `00:13E9`, `00:14FF`, `00:2D7F`, `01:7930` |
| `$18` | `$71DB` | 5 / ch3 | **critical hit** | `00:26E0`, inside the `CP $08` crit window |
| `$19` | `$7219` | 5 / ch2, 6 / ch3 | **enemy hit** | `00:26C1`, `00:3CFB`, `01:5B00` |
| `$1A` | `$7261` | 5 / ch3 | — | `01:5192` |
| `$1B` | `$72A1` | 5 / ch1 | — | `01:6CDA` (one of 4 selected ids) |
| `$1C` | `$72E3` | 5 / ch3 | — | `01:5463`, `01:6F13`, `01:7467` |
| `$1D` | `$7323` | 5 / ch1 | enemy hit variant | `00:3C8D`, `01:5B00` |
| `$1E` | `$735F` | 5 / ch3 | — | `01:56FB` (fires 1 frame in 8) |
| `$1F` | `$7399` | 5 / ch1, 6 / ch3 | — | `01:6CDA` |
| `$20` | `$73E4` | 5 / ch3 | — | `01:4460` |
| `$21` | `$741C` | 5 / ch3 | **enemy destroyed** | `00:26ED`, `01:4438`, `01:4836` |
| `$22` | `$7456` | 5 / ch1 | ballistic object thrown | `00:3110` (right after `$0CF3` alloc), `01:57A9` |
| `$23` | `$7490` | 5 / ch3 | bat-rope release | `00:276C`, then `$C71E = 0` |
| `$24` | `$74D0` | 6 / ch1, 5 / ch3 | — | `01:4736` |
| `$25` | `$7510` | 5 / ch3 | marker spawn / **debug-menu tone** | `01:7A8C`, `01:7AC7`; also `00:3896`, `00:3918` with cmd `$03` |
| `$26` | `$754C` | 7 / ch3 | *no call site* — sound-test only | |
| `$27` | `$7588` | 7 / ch1 | — | `01:62D2`, `01:715A` |
| `$28` | `$75C4` | 7 / ch1 | — | `01:6CDA` |
| `$29` | `$7604` | 7 / ch1 | — | `01:73DE` |
| `$2A` | `$7640` | 7 / ch1 | — | `01:7426` |
| `$2B` | `$767C` | 7 / ch3 | — | `01:7645` |
| `$2C` | `$76B6` | 7 / ch1, 6 / ch3 | — | `01:6CDA` |
| `$2D` | `$7713` | 7 / ch3 | — | `01:50B8`, `01:7150` |
| `$2E` | `$774F` | 0-3 / ch0-3 | **game over / continue** | `00:2AC9`, immediately after `DEC [$C767]` (lives) |

Entries marked "—" have a confirmed call site but no determined in-game
meaning (UNCONFIRMED); settle by breakpointing the call site in an emulator.

### 4.2 Level → music table

`sub_00_0F39(A)` picks a table by `A`, indexes it with `[$FFB0] - 1` (level,
1-based) and issues `SoundRequest(id, $03)`. `$FF` = "leave the music alone".

| table | `$1023` (A==0, fresh entry) | `$1031` (A!=0, re-entry) |
|---|---|---|
| L1..L14 | `02 02 02 06 03 03 03 06 04 04 06 05 05 07` | `02 FF FF 06 03 FF FF 06 04 FF 06 05 FF 07` |

Levels 4, 8, 11 are the boss stages (`$06`); level 14 is the final stage
(`$07`). Call sites: `00:0561` (A from the level-entry path) and `00:2850`.

---

## 5. THE `$0AE1` COMMAND PROTOCOL

`sub_00_0AE1(B = id, C = command bitmask)` scans the 4-slot ring at
`$C6FB` for a slot whose **both** bytes are zero, and stores `{B, C}` there
under `DI`. If all 4 slots are busy the request is **silently dropped**.

The Timer IRQ (`00:096C`) consumes exactly **one** slot per tick, at read index
`$FFA1` (0,2,4,6 wrapping), copies the pair to `$FFD3`/`$FFD2`, zeroes the slot
and advances the index — so it is a fixed-position 4-entry mailbox, not a true
FIFO: the write side searches from slot 0, the read side round-robins.

### Command bits (decoded at `7:$412B`)

| bit | value | handler | meaning |
|---|---|---|---|
| 0 | `$01` | `7:$40B8` | **play** song/SFX id `$FFD3` |
| 1 | `$02` | `7:$4036` | **stop everything** (all 8 tracks + fader + channel ownership) |
| 2 | `$04` | `7:$40AC` | **fade out** (`$C809 = $12`; NR50 `-= $11` every 18 ticks ≈ 2.3 s to silence) |
| 3 | `$08` | `7:$40A0` | **fade in** (`$C808 = $0A`; NR50 `+= $11` every 10 ticks ≈ 1.3 s) |
| 4-7 | | | unused |

Observed combinations across all 66 call sites:

* `$03` (stop + play) — **music**: ids `$00 $01 $02..$07 $08 $09 $0A $25 $2E`
* `$01` (play only) — **SFX**: ids `$0B`..`$2D`
* `$04` (fade out) — 3 sites: `00:336C`, `01:4EE9`, `01:72A3` (id byte `$01`
  is irrelevant since bit 0 is clear)

Fade-in (`$08`) is **never requested by the game** — dead functionality.
There is no "set tempo" command.

---

## 6. WAVE AND NOISE

### Wave channel (hardware channel 2)

* Waveform data is 16 raw bytes pointed at by opcode `$FB WAVE_PTR`.
* Upload happens in the tick after `$FB`: `NR30 = 0`, 16 bytes copied to
  `$FF30-$FF3F`, `NR30 = $FFDB | $80`, retrigger forced.
* `$FFD9` (which is `ch[+$12]`, i.e. the "volume") is written to **NR32**, so
  the byte must be `$00/$20/$40/$60` (mute / 100 % / 50 % / 25 %). The three
  shared "envelopes" at `$47DB`, `$47E0`, `$47E5` exist purely to supply those
  three constants as one-entry looping envelopes.
* NR31 (length) is never written on the wave channel.
* **The wave channel only retriggers when the waveform is re-uploaded.**
  Normal notes just rewrite NR33/NR34 — i.e. it is inherently legato.
* Waveforms present in the ROM: exactly two, at `7:$47EA` and `7:$47FA`.
  Sweeping all 47 songs finds **13 `WAVE_PTR` opcodes, all pointing at
  `$47FA`** — `$47EA` is dead data. `$47FA` =
  `00 11 12 46 9B DE EE FF FF EE ED B9 64 21 11 00` (a single asymmetric
  hump, 4-bit samples packed two per byte, high nibble first).

### Noise channel (hardware channel 3)

* The pitch table is bypassed (`7:$41AC CP $03`). The note byte, **after
  transpose**, is written verbatim to **NR43** (`ch[+$0B]`), and `ch[+$0A]`
  is forced to `3`, so NR44 gets `$03` (or `$83` when triggering) — bit 6
  (length enable) is never set.
* Because the note range is `$00-$C7`, the reachable NR43 values are
  `$00-$C7`; the divisor-code / shift / width fields are used directly.
* Percussion is normally written with the `DRUM n` / `DEFDRUM n` opcode pair
  rather than raw notes: `DEFDRUM` stores `{NRx2, attack NR43, sustain NR43}`
  and `DRUM` plays the attack for exactly 1 tick then switches to the sustain
  value for `duration-1` ticks via the auto-note path at `7:$43B3`.

---

## 7. JS TRANSLATION HAZARDS

1. **Re-entrant Timer IRQ.** `00:095F` executes `EI` as its very first
   instruction, so VBlank can pre-empt the sound tick mid-way. The `$FFEA`
   guard stops the *sound driver* re-entering itself, but the point where
   `$C6FB` is drained and where the ROM bank is restored through `$C703` is
   inside an interruptible window. In JS the clean model is: run the whole
   sound tick atomically at 59.36 Hz, independent of the frame loop. Nothing in
   the driver reads a video register, so this is safe — but the resulting
   command latency (1 tick vs. possibly 2) will differ by a frame in edge
   cases.

2. **59.36 Hz tick, not 60 Hz, not the frame rate.** `4096/69`. Song durations
   are raw tick counts. Driving the driver from `requestAnimationFrame` will
   detune every tempo by 1.1 % and desync SFX from gameplay.

3. **The sequence stream is context-sensitive.** Whether a note (or `REST`,
   `TIE`, `DRUM`, `SLIDE`) consumes a duration byte depends on the *runtime*
   value of `ch[+$04]`, which the `$F2`/`$D3` opcodes set — and which can be
   changed inside a `CALL`ed subroutine. A pure static parser can desync. My
   dumper tracks it linearly, which is correct for every song in this ROM
   (verified by coverage: every referenced byte decodes and every stream ends
   on `END`/`JUMP`).

4. **`RET` (`$ED`) is a no-op at depth 0** and execution falls through to the
   next byte. Every music track in this ROM ends its intro with a `$ED` that is
   *not* a return. Treating it as terminal loses ~40 % of the data (measured).

5. **Pointer endianness is mixed.** Base pointers in the channel record
   (`+$10/+$11`, `+$16/+$17`, `+$1B/+$1C`, `+$1D/+$1E`, `+$20/+$21`) are
   little-endian. The *active* envelope pointers (`+$0E/+$0F`, `+$14/+$15`) are
   stored **HI first**, because the reload code swaps them. Song headers and
   all in-stream addresses are little-endian.

6. **The volume envelope retriggers the channel on every step.** `7:$4293`
   sets flag bit 0 each time the envelope advances, so NRx2 is rewritten and
   NRx4 gets bit 7. On real hardware that restarts the pulse phase and reloads
   the length counter. A JS APU that only applies NRx2 on trigger will match;
   one that treats NRx2 writes as continuous will not. Conversely, this means
   **envelope "zombie mode" never occurs** — NRx2 is never written to a running
   channel without an accompanying trigger (the sole exception, NR32 on the
   wave channel, has no envelope unit).

7. **NRx1 is rewritten every single tick** for every active channel
   (`7:$4307`), so the **length counter never expires** and NRx4 bit 6 is never
   set. A JS port can ignore length counters entirely.

8. **Sweep is off.** NR10 is written once at init with `$08` (period 0). The
   sweep-overflow quirk is unreachable.

9. **Pitch envelopes clamp, they do not wrap.** `7:$424F-$425D`: adding
   saturates the frequency LO byte at `$FF`, subtracting saturates at `$00`,
   and only `$FFDA` is touched — the HI byte is untouched, so a pitch envelope
   can never cross a 256-unit boundary. Vibrato (`ch[+$19]`, `7:$420A`) *does*
   carry into the HI byte and updates the persistent `ch[+$0A]/+$0B`, so it
   drifts permanently unless reset by the next note.

10. **Channel arbitration is a comparison, not a stack.** `[$C800+hw]` holds
    `owner+1`; a track outputs only if `trackIndex+1 >= owner`. Nothing ever
    lowers the value except `END` (`$FF`) and the start-song path. If an SFX
    track is stopped by a `$02` (reset) command instead of reaching `END`,
    `$C800+hw` is cleared by `7:$4045`, so ownership resets — but a *paused*
    track keeps its ownership.

11. **No self-modifying code in bank 7.** Verified: no write to `$0000-$7FFF`
    anywhere in `7:$4000-$46D5`. The only unusual write target is `$FF30-$FF3F`
    (wave RAM).

12. **Bank 7 is not purely audio.** `7:$7960-$7FFF` is a VRAM script executed
    by `00:3758`. Do not treat the whole `$46D5+` region as music data.

13. **Silence is emergent, not explicit.** Nothing writes `NR52 = 0` after
    init. A channel goes quiet only because step 4 of the tick writes
    `NRx2 = 0` when nobody owns it. A JS port that forgets that sweep will
    leave notes ringing forever after a song ends.

---

## 8. PROOF / VALIDATION

`tools/dumpsong.py` implements the format above and was validated three ways:

1. **Byte coverage.** Walking all 47 song headers and following every
   `CALL`/`JUMP`/`LOOP` target plus every referenced envelope/wave pointer
   accounts for **11 137 of the 14 467 bytes** in `$477D-$7FFF`. The 3 330
   unaccounted bytes are, in full:
   * `7:$7960-$7FFF` (1 696) — the VRAM script (not sound data)
   * `$FF` padding between SFX blocks (1–3 bytes at 40 boundaries)
   * a stock, **unreferenced** template of 2 volume envelopes
     (`{$F1,6}{$90,0}` and `{$A0,0}`) plus 2 vibrato pitch envelopes
     (`00 02 04 06 04 02 00 FE FC FA FC FE` and the ±10 variant) emitted after
     nearly every SFX by the original composer's tool
   * the unused wave table `$47EA` and the unused wave-volume envelope `$47E5`

   No decoded stream ever runs off the end of a block, and every track
   terminates on `END` or a backwards `JUMP`.

2. **Musical sanity.** Song `$00` track 0 decodes to a Bb-minor arpeggio
   figure (A#4 / A#5 F5 C#5 F5 C#5 A#4, then the same shape a minor third
   down on G#), track 1 plays the same figure a fourth below, track 3 is a
   3-preset drum pattern, track 2 uses `DEFSLIDE`+`SLIDE` on the wave channel.
   See `rip/song_00_title.txt`.

3. **Pitch table exactness.** With the `+$80` bias, indices 0/12/24/36/48/60/72
   give 65.41 / 130.81 / 261.62 / 522.20 / 1048.58 / 2080.51 / 4228.13 Hz —
   exact C2..C8 within the resolution of the 11-bit frequency register.
   Without the bias the table makes no musical sense at all; this is the single
   most important decode result in this document.

### Sample output (song `$0B`, the pause sound)

```
SONG $0B  header $6E4B..$6E4F  1 track(s)
--- track slot 6 -> APU channel 1 (pulse2)  stream $6E51
  6E51: E7          PAN_CENTER
  6E52: FE E4       VOLUME $E4   ; vol=14 down per=4
  6E54: EC 80       DUTY $80     ; duty=2 len=0
  6E56: F2 03       FIXDUR $03
  6E58: 30 34 37 3B 3E 42 45      NOTE C6 E6 G6 B6 D7 F#7 A7, dur=3 each
  6E5F: FE 74       VOLUME $74
  6E61: 3E 42 45                  NOTE D7 F#7 A7
  6E64: FE 14       VOLUME $14
  6E66: 3E 42 45                  NOTE D7 F#7 A7
  6E69: FF          END
```

---

## 9. OPEN ITEMS

| claim | how to settle |
|---|---|
| meaning of SFX ids `$1A $1B $1C $1E $1F $20 $24 $27-$2D` | breakpoint each `$0AE1` call site and watch the screen |
| ~~whether any track relies on field inheritance across `$40B8`~~ | **SETTLED: yes.** `$40B8` leaves the frequency word loaded, and song `$00` opens with a `REST`, which retriggers without writing a pitch -- so it audibly plays the previous song's note. `tools/oracle/sound.py` now snapshots `$C800-$C94C` at the song-start tick and `sounddiff.mjs` seeds the port from it. |
| `$FFD4` reader | none exists in the ROM; confirm with a read-watchpoint |
| flag bit 2 of `ch[+$00]` | preserved by `AND $EC` but never set — likely a removed feature |
| why `7:$47EA` (wave A) is dead | possibly used by a cut track; nothing references it |
