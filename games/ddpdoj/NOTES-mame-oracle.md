# Can MAME be an oracle? - measured, on a ROM we already have

**Status: answered YES on all three criteria, empirically, with one important caveat that
is itself the most interesting result here.**

No DoDonPachi ROM was used, sought, downloaded or is present. Everything below was measured
by running MAME against `Gradius (USA).nes`, which this project already owns from phase 2,
on MAME's `nes` driver. The capability question is about MAME's Lua API, and the Lua API is
the same API whatever driver is loaded.

Read `docs/knowledge/01-the-oracle-method.md` for the three criteria this is judged by.

---

## 0. Headline

| criterion | verdict | how |
|---|---|---|
| **A. execution hooks** | **YES** - a real Lua callback fires on execution | `address_space:install_read_tap()` on the opcode byte, discriminated by `CURPC` |
| **B. memory access** | **YES** - read *and* write, CPU RAM and video RAM, mid-run | `space:read_u8/write_u8`, `memory.shares`, the PPU's own `videoram` space |
| **C. headless determinism** | **YES** - no window, and byte-identical across runs | `-video none`; two runs produced identical probe output *and* identical PNG bytes |

**Bonus achieved: cross-validated against Mesen.** MAME and Mesen agree byte for byte -
CPU registers plus a 512-byte RAM digest - for **388 consecutive NMIs** of real Gradius
execution. Then they disagree, exactly once, and the disagreement is **about whether an NMI
was delivered on a lag frame**. See §5. That is the single most consequential class of
disagreement for phase 3, and it showed up on the first frame the game overran.

---

## 1. Install friction, exactly

Nothing needed a human. No installer ran, no dialog appeared, no admin rights.

```
$ curl -s https://api.github.com/repos/mamedev/mame/releases/latest
mame0288  MAME 0.288  2026-05-28T15:22:33Z
  mame0288b_x64.exe    85894226   <- binary distribution, what we want
  mame0288s.exe       158633473   <- sources
  mame0288lx.zip       19558817

$ curl -L -o mame0288b_x64.exe .../mame0288b_x64.exe
real  0m7.228s                      # 85.9 MB

$ sha256sum mame0288b_x64.exe
e4ae20a2359d716fb16824961b1b0fb28d8662ffd1298504edff39d368bb4a55
# identical to the SHA256SUMS asset published with the release

$ "/c/Program Files/7-Zip/7z.exe" x -y -omame mame0288b_x64.exe
Folders: 257   Files: 2323   Size: 595932514   Compressed: 85894226

$ ./mame.exe -version
0.288 (mame0288)
```

Facts worth keeping:

- **`mameXXXb_x64.exe` is not an installer.** It is a 7-Zip self-extracting archive.
  *Running* it would pop a GUI extraction dialog - the exact failure mode the Mesen
  evaluation hit. Extracting it with `7z x` never runs it, and that is what makes the
  install unattended. `setup_mame.py` refuses to proceed if 7-Zip is absent rather than
  falling back to running the SFX.
- Download 85.9 MB → **596 MB extracted**, 2,323 files. Budget the disk.
- **0.289 is a git tag on master but has no published binary release** as of 2026-07-31.
  0.288 is the newest official Windows build. (`games/ddpdoj/NOTES-machine.md` reads driver
  *source* at the 0.289 tag; this file runs the 0.288 *binary*. Worth keeping straight.)
- Installed outside the repo at `%LOCALAPPDATA%\Mixup\mame`, matching where
  `setup_mesen.py` puts Mesen. Nothing ROM-derived, nothing inside the repo.

---

## 2. A - EXECUTION HOOKS. The load-bearing answer

**The short version: MAME has no "call this Lua function on execute" API, but you can build
an exact one out of `install_read_tap`, and it is not a hack - it is the opcode fetch.**

### What the debugger route gives you, and why it is second best

`device.debug` (with `bpset`/`wpset`) and `machine.debugger` are **`nil` unless MAME is
started with `-debug`**. Measured:

```
# without -debug
### machine.debugger = nil
### cpu.debug = nil

# with -debug -debugger none
### machine.debugger = sol.debugger_manager *: ...
=== cpu.debug   bpclear bpdisable bpenable bplist bpset go step wpclear wpdisable wpenable wplist wpset
```

Breakpoints **do** work unattended - this was the specific worry, and the answer is that
they do not require a human:

```
### bpset(0x806A,'1','') -> 1
   bp[1] addr=806A enabled=true cond="1" action=""

# with action: printf "BPHIT pc=%X a=%X", pc, a
BP| BPHIT pc=806A a=0
BP| Stopped at breakpoint 1
BP| BPHIT pc=806A a=0
BP| Stopped at breakpoint 1
...
### exec_state=run          # execution continued on its own
```

So with `-debugger none` a breakpoint fires its action and emulation carries on; nothing
blocks. **But the action is a debugger *command string*, not a Lua function.** The
debugger's own topic list has no Lua command:

```
Topics: General Memory Execution Breakpoints Watchpoints Registerpoints
        Exceptionpoints Expressions Comments Cheats Image
```

Output only comes back through `debugger.consolelog`, a ring buffer you have to string-parse.
That is a usable channel, not a good one.

### What actually works: a read tap on the opcode byte

`address_space:install_read_tap(start, end, name, fn)` takes a **genuine Lua function** and
calls it on every read of the range. An opcode fetch **is** a read. Measured against
Gradius's NMI handler at `$806A`:

```
### frames=120 hits@806A=116 hits@8073=116
   hit=1 f=3 off=32874 data=8 PC=806A CURPC=806A GENPC=8067 A=00 X=00 Y=00 SP=FC zp04=00
```

- `off=32874` = `$806A`. `data=8` = **`$08` = `PHP`**, which is genuinely the first
  instruction of Gradius's NMI handler. It is the opcode fetch, not a coincidence.
- 116 hits in 120 frames - one per NMI, exactly as a frame-rate hook should be.
- **CPU registers are readable at that instant**, which is the capability the method
  document calls load-bearing.

### Distinguishing an opcode fetch from a data read - measured, not assumed

A read tap fires for data reads too. The discriminator is `CURPC`. Tapping `$0004`
(Gradius's frame lock, which is read as *data*) shows `CURPC` is the **reading
instruction's** address, never the tapped address:

```
A_lock_read_site pc=802C n=1    curpc_equals_addr=false
A_lock_read_site pc=8073 n=400  curpc_equals_addr=false
A_lock_read_site pc=809F n=400  curpc_equals_addr=false
A_lock_read_site pc=EC5D n=16   curpc_equals_addr=false
```

whereas on the opcode fetch at `$806A`, `CURPC == $806A`. So `if CURPC ~= offset then
return end` turns a read tap into an exact execution hook. Over 400 NMIs:

```
A_nmi_executions=400
A_nmi_hits_rejected_as_nonfetch=0
```

### It already reproduces the Gradius lag mechanism

One write tap on `$04` recovered, from a *running* machine, exactly what
`games/gradius/NOTES-rom.md` derived statically from the PRG:

```
A_lock_write_site pc:val=802C:00 n=1      # init
A_lock_write_site pc:val=809F:00 n=400    # \_ INC $04 : 6502 read-modify-write
A_lock_write_site pc:val=809F:01 n=400    # /  does a dummy write of the OLD value first
A_lock_write_site pc:val=80B5:00 n=400    # cleared at $80B5
```

Two things here. First, `$809F` raises the lock and `$80B5` clears it - independent
confirmation of the static read. Second, **`$809F` writes twice per NMI**: `00` then `01`.
That is the 6502's read-modify-write dummy write, which MAME models. Anyone counting writes
to a flag will double-count unless they know this. It is also a decent accuracy signal.

`A_lag_frames_lock_set_at_nmi_entry=0` over 400 title-screen NMIs - i.e. the lag census of
`docs/knowledge/06-lag-and-slowdown.md` is one hook and it already works.

---

## 3. B - MEMORY ACCESS

Read and write, both spaces, mid-run. All measured:

```
B_zeropage_00_1F=02019000000000000001000000059500A81E000C000000000000000400000000
B_cpu_ram_write addr=07F0 before=F0 wrote=A5 readback=A5 restored=F0
B_ppu_palette_3F00_3F0F=0F12300F0F27300F0F192A300F071726
B_ppu_nametable_2000_200F=00000000000000000000000000000000
B_vram_write  addr=2000 before=00 wrote=5A readback=5A restored=00
B_prg_rom_len=32768 chr_rom_len=32768
```

Notes:

- CPU space is `cpu.spaces["program"]`. Video memory is a **separate device's** space:
  `machine.devices[":ppu"].spaces["videoram"]` - note the name is `videoram`, *not*
  `program`; asking for `program` silently returns nil.
- `machine.memory.shares[":mainram"]` gives the RAM block directly. Prefer it for reads
  *inside* a tap callback: reading through the address space re-enters the tap.
- `machine.memory.regions` exposes the cartridge: `:nes_slot:cart:prg_rom`,
  `:nes_slot:cart:chr_rom` - both 32768 bytes, correct for Gradius.
- MAME identified the mapper on its own: the device tree contains `:nes_slot:cnrom`,
  i.e. CNROM = iNES mapper 3, which is what Gradius is.

---

## 4. C - HEADLESS DETERMINISM

The flags that matter:

```
mame.exe nes -cart "<rom>.nes" \
  -video none -sound none -nothrottle -seconds_to_run N \
  -autoboot_script <script.lua> -autoboot_delay 0 \
  -nonvram_save -noautosave
```

`-video none` is the whole story: **MAME needs no undocumented mode.** Unlike Mesen, whose
headless path was an undocumented `--testRunner`, `-video none` is a documented option and
it creates no window. Every run in this file was executed from a non-interactive subprocess
with output captured; none required interaction and all exited 0 on their own.

Determinism, run twice:

```
run A sha256 5e079fe15ff43357ead4fce1fbb4f388470828c036ab05515c4e47945f34b9fc
run B sha256 5e079fe15ff43357ead4fce1fbb4f388470828c036ab05515c4e47945f34b9fc
IDENTICAL: run A and run B produced byte-identical probe output.
snapshot A sha256 98355989e231618014d36e76e108366639161a70dfc7cf34b8591b5b97b2eb48
snapshot B sha256 98355989e231618014d36e76e108366639161a70dfc7cf34b8591b5b97b2eb48
IDENTICAL: the headless PNG snapshots match byte for byte.
```

Framebuffer readback works with **no video output at all**:

```
C_framebuffer bytes=245760 expect=245760 fnv1a=3DDE1DC5      # 256*240*4, ARGB32
C_snapshot_written=capability_probe.png                       # real PNG on disk
```

`screen:pixels()` returns the raw framebuffer as a Lua string; `screen:snapshot(name)`
writes a PNG into `-snapshot_directory`. Both under `-video none`.

Speed: MAME ran the NES at **320%–718% of real time** headless. That is the NES; a PGM
board with a 68000, a Z80 and an ARM7 will be far slower and **has not been measured**.

### A rounded refresh rate, and why it matters for phase 3

```
screen=256x240 refresh_attoseconds=16639267339780496 refresh_hz=60.098800000
```

MAME says **exactly 60.0988**. The true derived NES NTSC rate
(`docs/knowledge/07-clocks-and-framerates.md`) is **60.098813897440515**. The source
confirms this is a hand-rounded literal, not a derivation:

```
$ curl .../mame0288/src/mame/nintendo/nes.cpp
414:	m_screen->set_refresh_hz(60.0988);
```

The error is 1.39e-5 Hz - 0.0008 frames per minute, irrelevant for the NES. **The
methodological point is not.** `docs/knowledge/07` says to read the driver's `set_raw(...)`
or `set_refresh_hz(...)` and compute. This shows those two are not equivalent:
`set_raw(pixel_clock, htotal, vtotal)` *is* a derivation; `set_refresh_hz(literal)` is
somebody's rounding, and `screen.refresh` in Lua will faithfully report the rounding. For
DaiOuJou, **check which form `igs/pgm.cpp` uses before trusting any number MAME reports**,
and if it is `set_refresh_hz` with a literal, that number is MAME's opinion, not the
hardware's.

---

## 5. Cross-validation against Mesen - and the one disagreement

Both emulators hook the *same* address, `$806A`, and emit the same per-NMI digest: CPU
registers plus an FNV-1a over zero page and the object page. Mesen has a first-class
execution callback (`emu.addMemoryCallback(fn, emu.callbackType.exec, ...)`); MAME uses the
tap route from §2. 500 NMIs each.

```
identical prefix: NMI 1..388 of 500  (CPU registers + 512-byte RAM digest, byte for byte)

FIRST DIVERGENCE at NMI 389:
  mame  n=389: A=00 X=00 Y=00 SP=FC P=44 lock=00 zp0D=06 zp10=A8 zp11=1E d=B146AE58
  mesen n=389: A=88 X=00 Y=0C SP=EF P=85 lock=01 zp0D=10 zp10=88 zp11=1E d=D3888E74

  This is an EXTRA NMI delivered by mesen, not a state divergence:
  after skipping it the sequences realign exactly --
  110/110 of the remaining samples are identical.
  The extra NMI has lock=$01 at entry -- the game's frame lock was still held,
  i.e. this is the bail path: a LAG frame.
```

**Read that carefully, because it is the most important paragraph in this file.**

- For 388 consecutive NMIs, two independently written emulators produce *identical* game
  state. That is a genuinely strong cross-validation, and much better evidence than either
  emulator asserted to be accurate.
- The divergence is **not** a state divergence. Mesen delivers **one NMI that MAME does
  not**, and after that single insertion the two run identically again for all 110
  remaining samples. The game's computation never disagrees.
- The extra NMI has **`lock=$01` at entry** and **`SP=$EF`** - 13 bytes deeper than the
  usual `$FC`. That means it fired while the main loop was still deep inside a call chain
  with the frame lock held: it is the re-entrant NMI that hits `$8073` and bails. **A lag
  frame.** It is also the *first* lag frame in the run - MAME's own census over 400 NMIs
  reported `A_lag_frames_lock_set_at_nmi_entry=0`.

So: **the two emulators agree on everything except how many NMIs are delivered when the
game overruns a frame** - which is precisely the signal DaiOuJou's port would be built on.
Which emulator is right is **not established here** and must not be guessed. It is a
concrete, reproducible, one-frame question, and it should be settled before MAME's timing
is trusted for slowdown work.

This does not disqualify MAME. It does say that "MAME is accurate" is not a substitute for
measuring the specific thing you depend on, and that the cross-emulator check earns its
keep the moment timing enters the picture.

### A second, benign difference: the P register

MAME reports `P=$74`, Mesen `P=$44`, on every sample. `$74 ^ $44 = $30` - **bits 5 and 4
only**. Neither is a physical flip-flop on a 6502: bit 5 does not exist, and bit 4 (B)
exists only in the byte pushed to the stack. This is a reporting convention, not state. The
tooling masks P with `$CF` for comparison and still emits `Praw=` so the difference stays
visible rather than being quietly normalised away.

---

## 6. Traps found, all of which cost time

1. **A dropped tap handle is silently collected and the callback just stops firing.**
   `prog:install_read_tap(...)` returns a handle. Discard the return value and the tap is
   garbage-collected - no error, no warning, no hits, ever. This produced a run with
   *completely empty output* and no diagnostic of any kind. Keep every handle in a global.
2. **`bpset(addr, nil, nil)` segfaults MAME.** Passing nil for condition/action crashes in
   `strlen` on a null pointer (`ACCESS VIOLATION ... While attempting to read memory at
   0000000000000000`, RDX=806A). Pass strings: `bpset(0x806A, "1", "")`.
3. **Boolean options take a `-no` prefix, never a value.** `-nvram_save 0` makes MAME parse
   the `0` as a software-list item and abort with a 50-line list of NES games. Use
   `-nonvram_save`.
4. **`-autoboot_script` runs *after* machine reset**, so `emu.add_machine_reset_notifier`
   never fires from it - the reset already happened. Use
   `emu.add_machine_frame_notifier`. A script whose only entry point is the reset notifier
   produces silence, not an error.
5. **Lua errors inside MAME are often swallowed.** A `nil` passed to `string.format("%04X")`
   inside a tap callback discarded the whole line with no message. Wrap probe code in
   `pcall` and print the error yourself.
6. **`-debug` implies a debugger, and the default is `auto`** (`mame -showconfig` →
   `debugger auto`). If the debugger API is needed, always pass `-debugger none` too.
   Whether `auto` opens a window was **deliberately not tested** - the brief is explicit
   that an emulator opening a GUI on the owner is a failure, and there is no reason to find
   out the hard way. The good news is that **the execution-hook route in §2 needs no
   debugger at all**, so the safest configuration is also the capable one.
7. The PPU's space is called `videoram`, not `program`.

---

## 7. What this does and does not settle

**Settled:** MAME satisfies all three oracle criteria, unattended, on Windows, with a
documented headless mode and no GUI. The method applies. Phase 3 is not blocked on
tooling capability.

**Not settled, and none of it should be guessed:**

- Everything above is the **NES driver**. The Lua API is driver-independent, but per-driver
  facts are not: whether `igs/pgm.cpp` exposes a usable `:maincpu` program space, what the
  PGM video device's spaces are called, and how fast a 68000+Z80+ARM7 board runs headless
  are all **unmeasured**.
- **Which emulator is right about the extra lag-frame NMI in §5.** This is the first thing
  to chase, because it is exactly the class of fact phase 3 depends on.
- Whether MAME's PGM driver declares refresh via `set_raw` (a derivation) or
  `set_refresh_hz` (someone's rounding) - see §4, and `NOTES-machine.md` for the driver
  reading.
- Save/load state from Lua - `machine:buffer_save()` / `buffer_load()` exist in the API
  listing but were **not exercised**. They would make per-level setup much cheaper and are
  worth a probe.
- Input injection. `machine.ioport.ports[":ctrl1:joypad:JOYPAD"]` exposes named fields
  (`P1 Left`, `P1 A`, `P1 Start`, …) so the plumbing is clearly there, but **no button was
  actually pressed** in any run here. The input-lead measurement of
  `docs/knowledge/01-the-oracle-method.md` still has to be done for MAME.

---

## 8. The tools

Under `games/ddpdoj/tools/`. Nothing ROM-derived is written into the repo; probe artifacts
go to a scratch directory under the system temp folder.

| file | what it does |
|---|---|
| `setup_mame.py` | unattended install: pinned URL, SHA-256 verified, 7-Zip extraction, never runs the SFX |
| `mame.py` | thin headless driver layer - the flag set, and stdout tag filtering |
| `capability_probe.lua` | the proof: execution hook, registers at the hook, RAM+VRAM read/write, framebuffer, PNG |
| `capability_probe.py` | runs the probe **twice** and diffs output and PNG bytes; asserts the seven capability checks |
| `crosscheck_mame.lua` | per-NMI digest, MAME side |
| `crosscheck_mesen.lua` | per-NMI digest, Mesen side, identical line format |
| `crosscheck.py` | runs both, finds the longest identical prefix, reports the first divergence |

```
python games/ddpdoj/tools/setup_mame.py
python games/ddpdoj/tools/capability_probe.py     # -> RESULT: MAME SATISFIES THE ORACLE CRITERIA
python games/ddpdoj/tools/crosscheck.py           # -> identical for 388 NMIs, then §5
```

`crosscheck.py` additionally requires Mesen, installed by
`games/gradius/tools/oracle/setup_mesen.py`.
