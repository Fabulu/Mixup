# 138 -- IMPL: sound wave B (the Z80 upload + the driver listing)

status: DONE   role: implementer   wave: W27 sound, Wave B   owns: games/ddpdoj/src/

Owner directive: "Go for sound." This is Wave B of the W27 sound port defined by
135-sound-architect-plan.md section 2: the Z80 program upload (trivial, now that
the verbatim verdict holds) and the driver LISTING that Wave C ports from.

Wave B's single deliverable to Wave C is a decomposition document, not a
behaviour. The upload is one function; the bank-mapping is a read-and-trace; the
listing is a verified map of the driver's three layers with every address cited
and decoded. The C3 recon (134 section 2, synthesized into 135) decomposed the
driver into 3 layers; this wave verifies every cited address against z80ram.bin
and the decrypted 68k ROM before a single line of src/ is written.

# 0. PREMISE CHECK (the brief's own rule)

Every cited address was decoded by hand out of `rip/sound/z80ram.bin` and every
byte-claim was checked against `tools/oracle/out/maincpu.bin`. Findings:

- **Upload span ARITHMETIC CORRECTION.** 135 premise 1 says "length `$5B98`
  (23416 bytes)." The HEX is right and the DECIMAL is off by 32: `$5B98` =
  **23448** bytes (23416 would be `$5B78`). Verified: copying 23448 bytes from
  decrypted-68k `$2C348A` matches z80ram.bin across the code region with exactly
  31 differences, ALL in `$0000`-`$0085`. The code region `$0086`-`$5B97`
  (`$5B12` = 23314 bytes) is byte-for-byte identical. CONFIRMED verbatim, stride
  1. The "23416" figure is dead; `$5B98`/23448 is the load-bearing number.
- **The 31 differences are all volatile scratch.** Their offsets are `$06`,
  `$42`, `$46`-`$4C`, `$52`, `$71`-`$85`. These are runtime-initialized locations
  (the reset vector at `$0000` overwrites some, the rest are Z80 scratch set by
  the init at `$0100`/`$02EE`). NONE are in the code region. The upload copies
  the PROGRAM; the 31 bytes are where the running Z80 then diverges from the
  freshly-uploaded image. CONFIRMED.
- **Every cited layer address is REAL CODE at the cited entry point.** Decoded
  below in section 3. No data passed off as a routine; no routine off by one.
- **ICS port-map REFINEMENT (load-bearing for Wave C).** 135 says "port 1 sets
  regSelect; ports 2/3 write lo/hi" over `$8000`-`$8003`. The bytes show the
  register primitives load `BC,$8001` and `INC BC` upward, so the precise map
  is: **`$8000` = ICS STATUS (read for IRQ bits at INT `$010B`); `$8001` =
  register-select (write); `$8002` = data LOW; `$8003` = data HIGH.** The "$8000
  is the status read, not a write port" distinction is new; Wave C must model it.
- **Dead-code trap (re-checked).** The NMI handler `$0128` is the ONLY caller of
  the cue dispatch `$07F6` (`CALL $07F6` appears exactly once in the image, at
  `$0130`). There is no second dispatch path. The BIOS pump `$28C19A` ringer
  that 136 killed on the 68k side has no Z80 twin.

# 1. THE UPLOAD (trivial, one function)

`tools/export-tables.py` gained one window, `Z80_UPLOAD = ($2C348A, $5B98)`,
citing the upload. `src/z80.js` reads `$5B98` bytes from that window through
`RomWindows` (the same path every other ROM read takes) and copies them into a
`Uint8Array($10000)` at offset 0. The Z80 has 64 KiB RAM and NO ROM (pgm.cpp:29);
its whole program is uploaded through the `$C10000` window by the 68k early in
boot, and `$2C348A` is that upload's source inside the decrypted 68k image.

The port reconstructs the Z80 program from the 68k ROM (the upload source), NOT
from `z80ram.bin`. `z80ram.bin` is the ORACLE for the byte-match assertion only;
it is gitignored ROM-derived data and is never shipped.

# 2. THE BANK-MAPPING SETTLEMENT (for Wave C's cue reads)

The NMI reads a sound command and its payload through a BANKED shared window.
The full chain, decoded instruction by instruction:

```
$0066: C3 28 01            JP $0128          ; Z80 NMI vector -> $0128
$0128: F5 C5 D5 E5 DD E5 FD E5   PUSH AF/BC/DE/HL/IX/IY
$0130: CD F6 07            CALL $07F6        ; -> cue dispatch (ONLY caller)
$0133: FD E1 DD E1 E1 D1   POP IY/IX/HL/DE
$0139: 01 00 81            LD BC,$8100
$013C: ED 79               OUT (C),A         ; NMI-ack: write $8100
$013E: C1 F1               POP BC/AF
$0140: ED 45               RETN
```

Inside the cue dispatch `$07F6` (the load-bearing trace):

```
$07F6: 21 F0 00            LD HL,$00F0       ; the bank-select arg
$07F9: CD B7 09            CALL $09B7        ; bank-select($00F0)
$07FC: 21 00 82            LD HL,$8200       ; the sound-command port
$07FF: CD 47 01            CALL $0147        ; inFromPort -> A = command byte
$0802: E6 0F               AND $0F           ; command nibble (low 4 bits)
$0804: 32 51 61            LD ($6151),A      ; store command nibble
$0807: FE 01               CP $01            ; command == 1 (cue with payload)?
$0809: 20 17               JR NZ,+0x17       ; else: dispatch bare command
$080B: 11 06 00            LD DE,$0006       ; payload length 6
$080E: 21 01 60            LD HL,$6001       ; Z80 RAM $6001 (payload source)
$0811: CD EA 3B            CALL $3BEA        ; copy payload out of the window
$0814: 11 01 00            LD DE,$0001
$0817: CD 1B 42            CALL $421B        ; enqueue to the channel manager
```

So: **command = `in($8200) & $0F`, stored at RAM `$6151`**; when command == 1,
**the cue payload is read from Z80 RAM `$6001`, length 6**, and handed to the
channel manager (`$0829`/`$421B`).

The bank-select `$09B7` (called with `$00F0`) computes the window address:

```
$09B7: E5                  PUSH HL
$09B8: 7D                  LD A,L            ; A = arg_lo ($F0)
$09B9: 32 4F 61            LD ($614F),A      ; RAM $614F = arg_lo (bank tag)
$09BC: 3A 50 61            LD A,($6150)      ; A = RAM $6150 (persistent base)
$09BF: 6F                  LD L,A
$09C0: 26 00               LD H,$00          ; HL = (RAM $6150)
$09C2: 11 0F 00            LD DE,$000F
$09C5: 7D A3 6F            AND E; LD L,A     ; L = base & $0F
$09C8: 7C A2 67            LD A,H; AND D; LD H,A  ; H = base_hi & $0F
$09CB: EB                  EX DE,HL          ; DE = masked base
$09CC: E1                  POP HL            ; HL = arg
$09CD: E5                  PUSH HL
$09CE: 26 00               LD H,$00
$09D0: D5                  PUSH DE
$09D1: 11 F0 00            LD DE,$00F0
$09D4: 7D A3 6F            AND E; LD L,A     ; L = arg & $F0
$09D7: 7C A2 67            LD A,H; AND D; LD H,A
$09DA: D1                  POP DE
$09DB: 7D B3 6F            OR E; LD L,A      ; L |= base_lo
$09DD: 7C B2 67            OR D; LD H,A      ; H |= base_hi  -> HL = window addr
```

Settlement for Wave C:
- **`$00F0` is the NMI's bank-select tag**, written to RAM `$614F`.
- **RAM `$6150` holds the persistent bank base** (set elsewhere during init).
- The window address is `(base & $0F0F) | (arg & $00F0)` -- a bit-OR of the
  bank base and the tag. This is what maps the 68k's `$C10000`-window payload
  into Z80 RAM's `$6000`-region so `$07F6` can read it at `$6001`.
- **The mailbox offsets `$0006`/`$0008` (68k-side, into `$C10000`) do NOT map
  1:1 to Z80 RAM `$0006`/`$0008`.** `$0006` inside the Z80 is in the uploaded
  program. The 68k payload crosses the CPU boundary through the banked window
  and lands at Z80 RAM `$6001` for a command-1 cue. Wave C reads cues from
  `$6001`, never from `$0006`.
- **Port `$8100`** = NMI-ack / reset latch (written at reset `$0100` and at NMI
  tail `$013C`). **Port `$8200`** = the sound-command read port. Both are
  PGM-specific (not ICS2115). One-line classification each, settled.

# 3. THE LISTING (the 3-layer decomposition Wave C ports from)

## Layer 1: register primitives -- the COMPLETE ICS2115 hardware interface (7 routines)

Decoded. All 7 are small, clean, RET-terminated, and live at the cited entry
points. The ICS register protocol they implement (refined from 135):
**`$8000` = STATUS read; `$8001` = register-select write; `$8002` = data LOW;
`$8003` = data HIGH.** A register access always writes the register number to
`$8001` first, then reads or writes `$8002`/`$8003`.

| addr | name | decode | role |
|---|---|---|---|
| `$0142` | outToPort | `LD C,L; LD B,H; OUT (C),E; RET` | write E to port HL (the raw I/O primitive) |
| `$0147` | inFromPort | `LD C,L; LD B,H; IN A,(C); RET` | read port HL into A (the raw I/O primitive) |
| `$02AE` | writeReg16 | `LD BC,$8001; OUT(C),L; INC BC; OUT(C),E; INC BC; OUT(C),D; RET` | reg(L), lo(E), hi(D) -- full 16-bit register write |
| `$02A4` | writeReg8hi | `LD BC,$8001; OUT(C),L; INC BC; INC BC; OUT(C),E; RET` | reg(L), hi(E) only -- 8-bit register in the HI lane |
| `$0298` | readReg16 | `LD BC,$8001; OUT(C),L; INC BC; IN E,(C); INC BC; IN H,(C); RET` | reg(L) -> E(lo), H(hi) |
| `$028E` | readReg8hi | `LD BC,$8001; OUT(C),L; INC BC; INC BC; IN A,(C); RET` | reg(L) -> A from `$8003` (hi) |
| `$02C3` | readReg-timer | `LD BC,$8001; OUT(C),L; INC BC; IN A,(C); RET` | reg(L) -> A from `$8002` (LO) -- the timer/status registers live in the lo lane |

Wave C ports these into a virtual ICS2115 register file: `port$8001` sets
`regSelect`; writes to `$8002`/`$8003` land in `voice[currentVoice][regSelect]`
using C5's per-register authoritative-half table.

## Layer 2: the voice engine + its INT driver

The voice engine is driven by the timer-0 bit of the ICS status register,
sampled in the INT handler (mode 1, vector `$0038`):

```
$0038: C3 0B 01            JP $010B          ; INT vector -> $010B
$010B: 08 D9               EX AF,AF'; EXX
$010D: 01 00 80            LD BC,$8000
$0110: ED 78               IN A,(C)          ; A = status from $8000
$0112: A7 28 0E            AND A; JR Z,$0123 ; no IRQ -> RETI
$0115: F5 E6 02 C4 EA 0F   PUSH AF; AND $02; CALL NZ,$0FEA   ; bit 1 service
$011B: F1 E6 01 C4 C8 0F   POP AF; AND $01; CALL NZ,$0FC8    ; bit 0 (timer-0)
$0121: 18 EA               JR $010B          ; loop until status clear
$0123: D9 08 FB ED 4D      EXX; EX AF,AF'; EI; RETI
```

The timer-0 service `$0FC8` gates the voice engine on register `$43` (timer
status), then calls the engine:

```
$0FC8: 21 43 00            LD HL,$0043       ; reg $43 (timer-status)
$0FCB: CD C3 02            CALL $02C3        ; readReg-timer($43) -> A
$0FCE: 32 61 61            LD ($6161),A      ; RAM $6161 = timer status
$0FD1: E6 01 28 0E         AND $01; JR Z,+0x0E   ; timer-0 fired?
$0FD5: CD F2 25            CALL $25F2        ; per-tick prep
$0FD8: CD 6C 37            CALL $376C        ; THE VOICE ENGINE
$0FDB: 21 40 00 ...        LD HL,$0040; CALL $02C3   ; then re-read reg $40
```

So: **INT `$0038` -> `$010B` -> status `$8000` bit 0 -> `$0FC8` -> reg `$43`
timer bit -> `$25F2` (prep) -> `$376C` (voice engine).** The voice engine
`$376C` does the 32-voice per-tick update over the `$62EC` voice-state array,
emitting the register writes that are the bulk of `ics.tsv`. `CALL $376C`
appears exactly once (at `$0FD8`); `CALL $0FC8` appears exactly once (at
`$1123`, inside the INT loop's own re-entry). Single call sites, no aliases.

The main thread is NOT part of this: after init it idles at `$114C` = `JR $`
(`18 FE`, an infinite loop). ALL behaviour is in the INT (timer, drives `$376C`)
and NMI (doorbell, drives `$07F6`) handlers. A Wave C port needs the two
interrupt handlers, not a main loop.

## Layer 3: cue dispatch (NMI work)

| addr | name | role |
|---|---|---|
| `$0066` | NMI vector | `JP $0128` -- the Z80 NMI entry |
| `$0128` | NMI handler | PUSH regs; `CALL $07F6`; ack via OUT to `$8100`; `RETN` |
| `$07F6` | cue dispatch | bank-select `$09B7`($00F0); read port `$8200`; command nibble to `$6151`; if cmd==1 read payload from RAM `$6001` (len 6) and enqueue |
| `$09B7` | bank-select | OR the tag (`$00F0` from the NMI) with the persistent base (RAM `$6150`); writes `$614F`/`$6150`/`$6151`. Called 9x across the driver. |
| `$0829` | 40-slot channel manager | prologue `LD HL,$0028` (= 40 decimal) -- the 40 voice/script slots. Receives enqueued cues from `$421B`. |
| `$421B` | enqueue | called by `$07F6` after the payload copy to push the cue into the channel manager |

The cue-id -> script dispatch table is INSIDE `$0829`/`$421B` (Wave C's job to
enumerate, against the `ics.tsv` oracle). Wave B nails the entry points and the
bank window; Wave C ports the scripts.

# 4. WHAT WAVE C INHERITS (the contract)

1. The ICS register protocol (Layer 1, 7 routines, with the `$8000`-status /
   `$8001`-select / `$8002`-lo / `$8003`-hi refinement).
2. The INT -> timer-0 -> voice-engine wiring (Layer 2).
3. The NMI -> bank-select($00F0) -> port `$8200` -> RAM `$6001` cue read
   (Layer 3, with the bank-state bytes `$614F`/`$6150`/`$6151`/`$6161`).
4. The mailbox-offset correction: cues are read from Z80 RAM `$6001`, NOT from
   `$0006`/`$0008`.

The Wave C oracle is `ics.tsv` (191,367 rows): the port's virtual Z80 must emit
the same register-select + lo + hi sequence, voice for voice, in order.

# 5. THE MUST-FAIL (upload byte-match, red -> green)

`tests/z80.test.js` (new, 4 tests, 0 skipped). The three colours:

- **GREEN.** `uploadZ80Program(rom)` copies the `$2C348A` window into a fresh
  `Z80Ram`; `uploadDiffs(z80, oracle)` reports ZERO differences in the code
  region `$0086`-`$5B97`, and exactly 31 differences, all in `$0000`-`$0085`.
  `diffsOnlyInScratch(diffs)` is true.
- **RED.** Corrupt one byte of the upload source at Z80-RAM offset `$0100`
  (inside the code region) by mutating the RomWindows backing bytes; re-upload;
  the divergence now surfaces INSIDE `$0086`-`$5B97`. `diffsOnlyInScratch` is
  FALSE -> the contract is violated (the assertion is red). Restore the byte;
  re-upload -> back to 31 scratch-only diffs (green).
- **Consistency.** The address-map constants are internally consistent (upload
  length is `$5B98`/23448 not the stale 23416; code span `$5B12`/23314; the 14
  cited entry points are distinct).

The test skips loudly when `rip/port/player.tables.json` (the ROM windows) or
`rip/sound/z80ram.bin` (the oracle) is absent -- never a silent skip.

# 6. GATES

- `node --test games/ddpdoj/tests/` -- 1317 pass / 0 fail / **0 skipped**.
- `python games/ddpdoj/tools/bosscoverage.py` -- **103 / 0 / 8** (ported /
  live-unported / dead), unchanged.
- `node tools/publish.mjs --only ddpdoj --dry` -- PASS, built and gated (rom-leak
  guard clean). The Z80_UPLOAD window is port-side only (consumed by
  `src/z80.js`); the web demo bundle reads tile/sprite/palette regions, so no
  `export-web.mjs` regen was required and the bundlegate stayed green.

# 7. FILES

- `games/ddpdoj/src/z80.js` (new) -- the Z80 RAM model, `uploadZ80Program`, the
  ICS port map, the bank-mapping state bytes, and the full 3-layer address map
  (`Z80`, `ICS`, `Z80_ROM`, `Z80_PORT`, `Z80_BANK` constants).
- `games/ddpdoj/tools/export-tables.py` -- one new window, `Z80_UPLOAD`
  (`$2C348A`, `$5B98`), with the verbatim-copy justification and the
  23448-not-23416 correction.
- `games/ddpdoj/tests/z80.test.js` (new) -- the upload byte-match MUST-FAIL.
- `docs/worklog/ddpdoj/138-impl-sound-wave-b.md` (this file) -- the listing.
