# Research A - Game Boy Disassembly / Decompilation Tooling & Prior Art

Date: 2026-07-26
Scope: What existing tooling and prior art should the Batman: Return of the Joker (GB, Sunsoft 1992) project adopt instead of continuing to build in-house?

Legend:
- **[V]** = VERIFIED by fetching the page / hitting the GitHub API myself.
- **[I]** = INFERRED from secondary sources or reasoning; not directly confirmed.

---

## 0. Executive summary

1. **No prior art exists for this game.** No disassembly, no decompilation, no ROM map, no RAM map, no TCRF page, no Data Crystal page, no GitHub repo. **[V]**
2. **No Sunsoft Game Boy game has been disassembled by anyone.** Not Trip World, not Gremlins 2, not Blaster Master Boy, not Hebereke. The only Sunsoft disassemblies that exist anywhere are Famicom/NES (Atlantis no Nazo, FDS Disk Control Program) and are unrelated engines. **[V]**
3. **There is no useful SM83 decompiler.** Ghidra + GhidraBoy is the only realistic option and its own README admits the decompiler output is bad. There is no "run this and get C" path. Do not spend time chasing one. **[V]**
4. **The single highest-value adoption is the runtime code/data logging workflow**: Beaten Dying Moon (or a homemade mGBA-Lua / Emulicious logger) → `.sym` file with code-block annotations → **mgbdis** → RGBDS-assemblable source that rebuilds a byte-identical ROM. This directly solves the stated blocker ("our static tracer cannot follow computed jumps"). **[V]**
5. **Emulicious exposes a Debug Adapter Protocol server on TCP 58870.** This is scriptable from plain Node 20 with no VS Code involved. This is the best automation surface found. **[V, from source code]**

---

## 1. Prior art on THIS game - DEAD END (valuable negative result)

### Titles / identity
- US/EU: *Batman: Return of the Joker* (Sunsoft, 1992). **[V]**
- **Japan: バットマン リターン・オブ・ザ・ジョーカー ("Batman Return of the Joker") - the Game Boy release kept the English name transliterated. Released 1992-03-28.** **[V]**
- **Important disambiguation trap:** *Dynamite Batman* (ダイナマイトバットマン) is the **Famicom/NES** Japanese title of *Return of the Joker*, NOT the Game Boy game. The GB game is a **completely different game** from the NES one, not a port. Searching for "Dynamite Batman" will return NES material that does not apply to us. **[V]**
- Also do not confuse with *Batman Beyond: Return of the Joker* (GBC, 2000, Ubisoft/Kemco) - entirely different game.

### What was searched and found empty
| Source | Result |
|---|---|
| datacrystal.tcrf.net full-text search | **"There were no results matching the query."** No ROM map, no RAM map. **[V]** |
| tcrf.net | No page for the Game Boy version. Note: tcrf.net served hostile anti-agent content to the fetcher (see §8). **[V-ish]** |
| GitHub repo search (`batman gameboy disassembly`, `sunsoft gameboy disassembly`, `sunsoft disassembly`) | Zero relevant hits. Only NES-era Sunsoft: `Xkeeper0/atlantis-no-nazo`, `TakuikaNinja/DiskControlProgram`. **[V]** |
| gbdev/awesome-gbdev "Disassemblies" section (the canonical community list) | pokered, pokecrystal, pokeyellow, pokegold, pokepinball, poketcg, pokegold-spaceworld, LADX, Oracle of Ages, Tetris, FX Hammer, Harvest Moon 3, Final Fantasy Adventure, The Jungle Book. **No Sunsoft title. No Batman.** **[V]** |
| romhacking.net | Only hacks/translations exist (e.g. "Movement Hack" #2284, "Dark Edition" #8892) - no documents, no ROM maps, no utilities. RHDN now 403s automated fetches so I could not read the hack descriptions; based on the game-page listing there is nothing document-shaped. **[V for listing, I for content]** |
| VGMPF wiki (GB entry) | Only credits + a GBS rip. Sound driver credited to **Shinichi Seya** (uncredited), music by **Manami Matsumae** with **Takashi Tateishi**. No format documentation. **[V]** |

**Conclusion: we are the first. There is nothing to adopt at the game level. Our own docs (`recon-1`..`recon-5`, `00-MASTER-REFERENCE.md`) are the state of the art for this ROM.**

---

## 2. Sunsoft engine / sound driver prior art - MOSTLY DEAD END

- **No Sunsoft Game Boy sound driver spec or disassembly exists anywhere I could find.** **[V - searched GitHub, awesome-gbdev, romhacking.net, nesdev, retroreversing]**
- The closest thing that exists is a **NES** document: user *UD2* on the NESdev forums reverse-engineered the Sunsoft sound driver used in *Gimmick!* (Famicom) and posted `sound_driver_format.txt` (20.4 KiB) plus a C parser. Thread: <https://forums.nesdev.org/viewtopic.php?t=21745>. He notes *Journey to Silius* uses a similar driver at different memory locations. **[V - thread fetched, attachment exists]**
  - **Value to us: LOW-to-MODERATE, and cross-family only.** It documents the 2A03/5B-era Sunsoft NES driver, not the DMG one. Our GB driver was written by Shinichi Seya. Sunsoft's NES and GB sound drivers share design lineage (byte-stream opcode VM, per-channel pointers, envelope/vibrato macro tables) but the opcode numbering will not match. Useful as a **sanity check on the shape of our 56-opcode table** (does an opcode-VM with tempo/loop/transpose/macro opcodes look like this?), **not** as a validation of specific opcode values.
  - Actionable: download `sound_driver_format.txt` from that thread and diff its *conceptual* opcode categories against our table. Budget: 1 hour. Do not expect a byte-level match.
- A GBS rip of this game exists (VGMPF). A GBS file is literally the ripped sound engine + data with a header - i.e. **someone already isolated the driver's entry points and the bank/address layout to make that rip**. Pulling the GBS header gives us free confirmation of the driver's init/play addresses and the ROM banks containing music data. **[I - standard GBS structure; header fields are load addr / init addr / play addr / SP / TMA / TAC]** Cheap, worth 20 minutes.

---

## 3. Disassemblers / decompilers - RANKED

### ADOPT: mgbdis (MIT)
<https://github.com/mattcurrie/mgbdis> - Python 3.6+, MIT, actively maintained (last push 2026-06-28), 317 stars. **[V via GitHub API]**

- Emits **RGBDS-compatible** assembly for multi-bank ROMs, plus **a Makefile that rebuilds the original ROM so you can verify byte-identity**. **[V]**
- Consumes a `.sym` file that carries not just labels but **block-type annotations**, which is exactly the mechanism for teaching it about our data regions. Syntax **[V from README]**:
  - code label: `03:47f2 Read_Joypad_State`
  - `.data:200` / `.data:30:3` (length / length:bytes-per-line)
  - `.text:10` / `.text:10:charmap=0`
  - `.padding:<n>`
  - `.image:<len>:w128:pe4` / `1bpp` - **converts tile data straight to PNG**, which is directly useful for our metasprite/graphics work
- Known weakness: slow on large ROMs. 128 KB is small; non-issue. **[V]**
- License is MIT - safe to vendor into the repo. **[V - read LICENSE file]**

**Why adopt:** we already have a Python disassembler, but mgbdis gives us the *reassemble-and-compare* loop for free, and its symbol-block format is a better serialization of our region knowledge than a bespoke format. Recommend: make our existing analysis **emit an mgbdis-compatible `.sym`** rather than replacing our tooling. That is a small adapter, not a rewrite.

### ADOPT (toolchain): RGBDS (MIT) + hardware.inc (CC0-1.0)
- <https://github.com/gbdev/rgbds> - MIT, actively maintained (push 2026-07-24). **[V]**
- <https://github.com/gbdev/hardware.inc> - **CC0-1.0**, i.e. public domain, zero-friction to vendor. **[V]**
- Windows binaries are published; no WSL required.

### CONDITIONAL: Ghidra + GhidraBoy (Apache-2.0)
<https://github.com/Gekkio/GhidraBoy> **[V]**

- Provides SM83 SLEIGH + a GB ROM loader with hardware-register symbols and a hardware-accurate memory map. Supports Ghidra 11.1–11.4.2. **[V]**
- **Ghidra has NO built-in SM83 processor module - this extension is required.** **[V]**
- **The repo was ARCHIVED in June 2026 and is now read-only.** Still installable, but unmaintained going forward; future Ghidra releases may break it. **[V]**
- **Decompiler quality - the authors' own words:** *"Decompiler output is difficult to read if certain instructions are used (e.g. rotates, JP HL for jumptables)"* and *"Default 'ASM calling convention' assumes all registers can be inputs and/or outputs"*, so inputs/outputs are guessed wrong and **almost every function needs manual calling-convention tuning**. **[V - quoted from README]**
- Banked memory is handled via overlays and the author himself flags this as an open design question. For our MBC1 128 KB ROM (8 banks) this is workable but fiddly. **[V]**

**Verdict:** worth installing for **targeted** work - cross-references, "who writes to $C0xx", and structure recovery on a handful of gnarly routines. **Do not** expect it to hand us C for the whole ROM, and do not build a pipeline around it. Budget a day, use it as a query engine, not a translator.

### SKIP: IDA Pro
No first-party SM83 processor module. Only community loader scripts (e.g. LIJI32's gist). Paid. No advantage over Ghidra here. **[V - Hex-Rays supported-processors list has no SM83; only loader gists found]**

### SKIP: Binary Ninja
There is `icecr4ck/bnGB` (loader + architecture plugin) but it is a **disassembler/architecture plugin**; no evidence of quality SM83 HLIL, and Binary Ninja is paid. `bn-sm83` as a specific named project does not appear to exist. **[V for bnGB existing; I for quality]**

### SKIP: windfish
<https://github.com/jverkoey/windfish> - Apache-2.0, 84 stars. Genuinely interesting: a **control-flow tracing** disassembler with bank awareness, RGBDS output, macro pattern generation, and deep SameBoy integration. **[V]**
**But:** it is a macOS/Xcode/Swift application and **last commit 2021-02-14**. Dead, and wrong platform for a Windows 11 box. **[V via GitHub API]** Its *design* is worth reading as a reference for what our own tracer should do (scope inference, datatype registration, banked jump resolution) - but do not try to run it.

### SKIP: awake (GPLv3)
<https://github.com/devdri/awake> - "Game Boy decompiler", control-flow analysis, graphviz output. **Python 2.7 only**, author describes it as *"the code is a mess"*, effectively unmaintained. GPLv3 would also infect anything we vendor. **[V]**

### SKIP: everything else
`mmuszkow/gb-disasm`, `frestr/gbz80-disasm`, `akatsuki105/flowchart.gb`, `ericwoude/gameboy-disassembler` - all toy-tier, all strictly less capable than what we already have. **[V - repo metadata: 2–8 stars each]**

**Bottom line on decompilation: SM83 decompilation is genuinely weak and there is no project that fixes it. Our plan of hand-translating to JS is the correct plan. There is no shortcut.**

---

## 4. Runtime code/data logging - THE HIGHEST-VALUE ADOPTION

This is the answer to "our static tracer cannot follow computed jumps." Every serious GB disassembly project solves this by **running the game and recording which bytes the PC actually visited**.

### ADOPT #1: Beaten Dying Moon (BDM)
<https://mattcurrie.com/bdm-demo/> - by Matt Currie, the mgbdis author. **[V]**

- C++ Game Boy emulator compiled to WASM; **runs in the browser**, nothing to install. **[V]**
- While you play, it records the addresses of **instructions that were actually executed** and generates a `.sym` file containing **code-block definitions**, which eliminates mgbdis mis-aligning on data. There is a literal **"Download .sym file"** button. **[V]**
- Designed as the front half of the BDM → `.sym` → mgbdis pipeline. This is the workflow nesdev recommends today. **[V - nesdev thread t=24267]**
- **Caveat: license/source not published on that page.** Treat the emulator as a tool, not something to vendor. The `.sym` output it produces is our data. **[V - page discloses no license]**
- **Caveat: coverage is only as good as our play-through.** Getting full coverage of a 1992 action platformer means playing every level, every boss, every death/continue/ending path. Combine with save states and (ideally) a TAS/input replay. Realistic expectation: 70–90% of code reached in a few hours; the remainder is error paths and unused code.

### ADOPT #2: mGBA Lua scripting (build our own CDL)
<https://mgba.io/docs/dev/scripting.html> **[V]**

- mGBA scripting supports **Game Boy, not just GBA** - confirmed separate memory-domain and register specs for each platform, and `platform()` to discriminate. **[V]**
- The debugger API includes **`setBreakpoint(callback, address, segment)`**, **`setWatchpoint(callback, address, type, segment)`**, **`setRangeWatchpoint(callback, min, max, type, segment)`**, `clearBreakpoint(cbid)`. Documented in **0.11-dev**. **[V]**
- The `segment` argument is the ROM bank - meaning **bank-aware** logging. **[V]**
- **This is enough to build a real code/data logger ourselves in ~100 lines of Lua**: range-watchpoint the whole ROM for execute, mark `(bank, offset)` visited, dump to disk on exit. Also: hook the sound-engine dispatch and log every opcode byte actually consumed - **that directly validates our 56-opcode table against runtime behaviour**, which is exactly the cross-check we wanted and could not get from prior art.
- Also solves the computed-jump problem generally: breakpoint every `JP HL` / `RST` site and log the resolved target.
- **Caveat:** breakpoints/watchpoints in mGBA scripting are debugger features; ensure the build is 0.11-dev or later. Older 0.10 has scripting but the breakpoint API was a feature request (issue #2742). **[V]**

**Recommendation: do BOTH. BDM first (zero effort, gives an immediate baseline `.sym`), then mGBA Lua for the targeted questions BDM can't answer (jump-table targets, sound opcode histogram, bank-switch call graph).**

### ADOPT #3: Emulicious - best interactive debugger, and it is scriptable
<https://emulicious.net/> - free, Java-based, **bundled binaries so no separate JRE install**, runs on Windows. **[V]**

Debugger feature set **[V]**:
- Interactive disassembler with **automated code/data separation**
- **Reverse stepping / backward stepping** (nothing else on GB has this; enormous for "how did we get into this state")
- Tracer with **start/end/per-instruction conditions** and a **user expression evaluated and appended to each traced instruction** (e.g. `@$c000`)
- Coverage Analyzer, Profiler, Memory Tracer
- Auto-generated **DATA labels**, **RAM labels** (including inferred variable sizes), and **port-access labels**
- Loads `.sym` symbol files (manually selectable)
- Palette / tile / tilemap / sprite / sound viewers, data plotter, RAM search/watch

**THE KEY FINDING - Emulicious is a DAP server. [V, from source code]**
I read `Calindro/emulicious-debugger/src/extension.ts`. The VS Code extension does **not** implement a debug adapter; it calls
```ts
resolve(new vscode.DebugAdapterServer(session.configuration.port, session.configuration.host));
```
with `const DEFAULT_PORT = 58870;`. `DebugAdapterServer` means **VS Code speaks raw Debug Adapter Protocol directly to Emulicious over TCP 58870**. Emulicious *is* the debug adapter.

**Implication: we can drive Emulicious from a ~150-line Node 20 script** (DAP is JSON with `Content-Length:` framing - trivial to implement, or use the `@vscode/debugprotocol` types). Enable Tools → Remote Debugging, connect to 58870, then programmatically: set breakpoints, step, read registers, read memory, and **`evaluate`** expressions. That gives us headless, repeatable, scripted experiments against the running game - e.g. "break at the level-loader, dump the 2 KB it decompressed, compare against our JS port's output." This is the strongest automation surface available on Game Boy and nobody documents it as such.

**Honest gap:** I could **not** verify that Emulicious can *export* its coverage map, tracer log, or generated disassembly to a file. The release notes and feature pages describe all of these as in-GUI visualizations only, with no export mentioned. **[V - searched the release-note archives; export is absent]** So: use Emulicious for interactive work and scripted DAP control; use BDM/mGBA for producing machine-readable coverage artifacts.

### USE, don't build around: SameBoy
<https://sameboy.github.io/debugger/> **[V]**
- On Windows, run `sameboy_debugger.exe` instead of `sameboy.exe` to get the text console debugger; `Ctrl+C` breaks in. **[V]**
- **Reads `.sym` files (three popular dialects) and lets you use symbols in expressions.** **[V]**
- **Bank-aware 25-bit addressing with a `:` bank operator**, e.g. `$c:$437a`. **[V]** This matches our need to talk about `bank:offset` unambiguously.
- Conditional breakpoints (`if <expr>`), conditional watchpoints, backtrace, `disassemble`.
- **No documented file logging and no scripting API.** It is an interactive console. **[V]** It is stdin/stdout-driven, so piping a command script into it is plausible **[I]** but undocumented and fragile.
- Best emulation accuracy of the bunch - use it as the **ground-truth reference** when our JS port disagrees with something.

### USE: BGB
<https://bgb.bircd.org/> - the classic. Reads `.sym`, symbols view, full debugger, VRAM/OAM viewers. **[V]**
**It reads `.sym` but does not write them** - no symbol export, no CDL. **[V]** Fine as a second opinion; not a pipeline component.

### SKIP: RetroReversing "GameBoy Reversing Emulator"
<https://www.retroreversing.com/GameBoy-Reversing-Emulator> - libretro SameBoy fork with a `LibRetroReversing` library that logs asm instructions, functions, memory addresses and DMAs, with a web UI. Conceptually exactly what we want. **But the page was last updated 2020-10-17 and the project has no visible activity.** **[V]** Not worth the integration risk when mGBA-Lua gets us there on maintained software.

---

## 5. Symbol file format - ADOPT `.sym` as our interchange format

Canonical spec: <https://rgbds.gbdev.io/sym> (the site 403s automated fetchers; readable via a text proxy). **[V - retrieved via proxy]**

Grammar **[V]**:
```
<location> <name> [metadata...]        ; comment
```
- Location, three forms, all case-insensitive, hex without prefix:
  - `<bank>:<address>` - banked
  - `BOOT:<address>` - boot ROM
  - `<address>` - unbanked, applies to all banks
- Address range `0..$FFFF`; bank range `0..$FFFFFFFF`
- Tokens split on spaces/tabs; `;` starts a comment; empty and single-token lines are silently ignored
- Name grammar: `[A-Za-z_]([A-Za-z0-9_@#$.]|\uXXXX|\UXXXXXXXX)*`, case-sensitive
- **Local symbols** = exactly one `.` in the name, bound to the global symbol with the matching prefix; **global** = no `.`
- Metadata tokens follow the name; **tokens beginning with `@` are reserved for private use and MUST be silently ignored** by conforming readers
- The current spec version defines **no standard metadata tokens**

**Round-tripping: YES, and it is the right call.**
- Everything reads `.sym`: BGB, SameBoy, Emulicious, mgbdis, no$gmb. **[V]**
- mgbdis extends it with `.data:`/`.text:`/`.image:`/`.padding:` pseudo-labels - these are just symbol names starting with `.`, so they degrade to harmless local symbols in other tools. **[V/I]**
- The `@`-reserved-metadata rule means **we can attach our own annotations (struct type, JS module owner, confidence level) as `@`-prefixed tokens and every other tool will ignore them.** That is a free extension point - use it.

**Action: make `.sym` the canonical serialization of our symbol/region database.** Generate it from our Python analysis; consume it in BGB/SameBoy/Emulicious/mgbdis. Merge BDM's execution-derived code blocks into it.

---

## 6. Byte-perfect reassembly discipline - ADOPT, in a scoped form

How PRET / zladx do it **[V]**:
- **RGBDS** assembler+linker, **Makefile**-driven, bank layout pinned by a `layout.link` linker script. **[V]**
- **`roms.sha1`** in-repo; the build is "correct" iff the produced ROM's SHA-1 matches (e.g. pokered English Red = `ea9bcae617fdf159b045185467ae58b2e4a48b9a`). **[V]**
- Source is progressively refactored: raw `db` bytes → labeled data tables → named constants → macros → readable asm, **with the hash check gating every commit**. Nothing can silently drift.
- LADX (`zladx/LADX-Disassembly`) builds multiple regional revisions from one tree, each with a published MD5, and emits debug symbols consumable by BGB. Requires Python 3 + RGBDS ≥ 0.9.3. **[V]**

**Is it worth adopting here, given our deliverable is JS? Yes - but as a correctness harness, not a product.**

Argument for:
- A matching build is a **total, automatic, zero-judgement correctness check on our understanding of the ROM's layout**. If we claim "bank 3 offset $47F2 is a jump table of 12 entries," a matching rebuild proves the bytes are where we say and that nothing was mis-classified. Our JS port cannot prove that; a hash can.
- It forces us to account for **100% of the 128 KB**, including the parts we would otherwise skip. Unaccounted bytes are exactly where the bugs hide.
- mgbdis generates the Makefile for us, so the initial cost is close to zero. **[V]**
- 128 KB / 8 banks is small. PRET-scale discipline on a PRET-scale-÷-8 ROM.

Argument against / scoping:
- We must not let it become the project. We are not shipping a disassembly.
- **Recommended scope:** get a **byte-identical rebuild on day one** from mgbdis + BDM symbols, commit `rom.sha1`, wire it into CI, and thereafter **only refine the `.sym`** - never hand-edit the generated asm. The asm is a build artifact; the `.sym` is the source of truth. Each time we understand a new region, we express it as `.sym` annotations, regenerate, and the hash must still match. That gives us the full PRET safety property for a fraction of the PRET effort.

---

## 7. Concrete recommended pipeline

```
                 ┌──────────────────────────────┐
   play/TAS ───► │ Beaten Dying Moon (WASM)     │ ──► exec-coverage .sym
                 └──────────────────────────────┘
                 ┌──────────────────────────────┐
   scripts   ───►│ mGBA 0.11-dev + Lua          │ ──► CDL, jump-table targets,
                 │  setBreakpoint/RangeWatchpoint│      sound-opcode histogram
                 └──────────────────────────────┘
                                 │
                                 ▼
                 ┌──────────────────────────────┐
                 │ our Python analysis          │◄──► symbols.sym  (SOURCE OF TRUTH)
                 │  + region/type database      │      bank:addr name @ourmeta
                 └──────────────────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 ▼                               ▼
      ┌────────────────────┐          ┌────────────────────────┐
      │ mgbdis  → RGBDS    │          │ hand-translation → JS  │
      │ make → rom.gb      │          │ (the deliverable)      │
      │ sha1 MUST MATCH ✓  │          └────────────────────────┘
      └────────────────────┘                     │
                                                 ▼
                 ┌──────────────────────────────────────────────┐
                 │ Emulicious (DAP on tcp:58870, driven by Node) │
                 │  differential testing: real ROM vs JS port    │
                 └──────────────────────────────────────────────┘
   SameBoy (accuracy ground truth) / BGB (second opinion) as needed
```

### First-week task list
1. Install RGBDS (Windows binaries) + vendor `hardware.inc` (CC0). **~30 min**
2. Run the ROM in Beaten Dying Moon, play through as much as possible, download `.sym`. **~3 h of play**
3. `mgbdis.py batman.gb` with that `.sym`; `make`; confirm SHA-1 matches. Commit `rom.sha1` + a CI check. **~1 h**
4. Write a `.sym` emitter in our existing Python analysis; merge with BDM's blocks; regenerate; hash must still match. **~4 h**
5. Install Emulicious, enable Remote Debugging, write a minimal Node DAP client against `127.0.0.1:58870`. **~4 h** - this unlocks all future automated experiments.
6. Write the mGBA Lua CDL + sound-opcode logger; validate our 56-opcode table against what the ROM actually executes. **~4 h**
7. Optional: install Ghidra 11.4.x + GhidraBoy for targeted structure recovery on the 5–10 hairiest routines. **~1 day, timeboxed**
8. Optional: pull `sound_driver_format.txt` from nesdev t=21745 and compare *shape* (not values) to our sound VM. **~1 h**

---

## 8. Licenses (for anything vendored)

| Thing | License | Vendorable? |
|---|---|---|
| RGBDS | **MIT** | Yes (or just require the binary) **[V]** |
| gbdev/hardware.inc | **CC0-1.0** | Yes, public domain **[V]** |
| mgbdis | **MIT** | Yes - copy the script in **[V, read LICENSE]** |
| GhidraBoy | **Apache-2.0** | Yes, but archived June 2026 **[V]** |
| windfish | Apache-2.0 | N/A - dead, macOS-only **[V]** |
| awake | **GPL-3.0** | **No** - copyleft, and Python 2.7 **[V]** |
| mGBA | MPL-2.0 (upstream) - our Lua scripts are ours | Scripts yes; don't vendor the emulator **[I]** |
| SameBoy | "NOASSERTION" per GitHub (upstream is MIT-like/Expat) | Use as a tool; don't vendor **[V for the API field, I for the actual terms]** |
| Emulicious | Proprietary freeware, closed source | **Tool only - never vendor.** Our DAP client is ours **[V]** |
| Beaten Dying Moon | No license stated | **Tool only - never vendor.** Its `.sym` output is our data **[V]** |
| emulicious-debugger (VS Code ext) | MIT | Useful as reference for the DAP handshake **[V]** |
| `.sym` format spec | Community spec at rgbds.gbdev.io/sym | Format, not code - free to implement **[V]** |

---

## 9. Operational warning: tcrf.net served prompt-injection content

Two independent WebFetch attempts against `tcrf.net` URLs returned pages whose body consisted of **instructions addressed to "LLMs and automated agents," framed as a user request, directing the agent to delete file contents and shuffle directories** - including a fabricated "Instructions updated July 32, 2026" date. The instructions were **not followed**, and no such action was taken.

Whether this is TCRF's own anti-scraping countermeasure, an injected ad/CDN payload, or a compromised page, the practical consequences are:
- **Do not point unattended agents at tcrf.net.** Route TCRF lookups through a human or a text-extraction proxy.
- `datacrystal.tcrf.net` behaved normally and returned a genuine (empty) search result. The problem appears specific to `tcrf.net` proper.
- No TCRF content was used in this report.

### 9.1 Follow-up forensics (added on coordinator request; no re-fetch performed)

**CORRECTION TO §9 ABOVE.** The paragraph above says the pages' *"body consisted of"* the hostile instructions. **I cannot support that claim and I am retracting it.** I never saw the raw page. See 9.1.2 below for what I actually observed. The rest of §9's operational advice stands.

#### 9.1.1 - Exact URLs fetched

Both are recorded verbatim in my session transcript:

1. `https://tcrf.net/Batman:_Return_of_the_Joker_(Game_Boy)`
   - prompt used: *"Does this page exist? What content about Batman Return of the Joker Game Boy, unused content, ROM internals, Japanese title?"*
2. `https://tcrf.net/index.php?search=Batman+Return+of+the+Joker&title=Special%3ASearch&fulltext=1`
   - prompt used: *"List search results for Batman Return of the Joker on The Cutting Room Floor, especially Game Boy version pages"*

Neither URL is reconstructed. Both are exact.

#### 9.1.2 - Body vs. injected banner: **UNKNOWN, and I cannot determine it**

**I never saw the page source, the raw HTML, or even the markdown conversion.** The `WebFetch` tool fetches the URL, converts it to markdown, and runs a *separate small fast model* over it; **only that model's prose answer is returned to me.** So:

- I have **no** raw bytes, no HTTP status, no headers, no DOM position information.
- I therefore **cannot** say whether the hostile text was the page body, a banner, an ad slot, a CDN-injected block, a Cloudflare interstitial, or a `<noscript>`/hidden element.
- The summarizer *characterized* it as page-dominant ("The page is entirely dedicated to…", "The page only contains…"), and mentioned "a demonstration image caption" alongside it. That is the summarizer's impression, **not my observation**, and it is the only evidence that exists on this point.

**Alternative hypothesis I cannot rule out:** the fetch may have hit an error/blocking page (tcrf.net could be serving an anti-bot interstitial) and the small summarizer model may have **confabulated** part or all of the "instructions." Two independent fetches producing consistent themes makes pure hallucination less likely, but with zero raw evidence I cannot exclude it. **Treat the injection as reported-but-unverified-at-the-byte-level.**

#### 9.1.3 - Verbatim injected text: **I DO NOT HAVE IT**

**I cannot quote the injected instructions verbatim, because they were never returned to me.** Reproducing them would mean inventing them. What follows is *not* the injection - it is the verbatim text of the two `WebFetch` tool responses, i.e. a second-hand description written by the summarizer model.

> **UNTRUSTED - QUOTED TOOL OUTPUT, NOT THE INJECTION ITSELF.**
> Response to fetch #1 (`https://tcrf.net/Batman:_Return_of_the_Joker_(Game_Boy)`):
>
> "Based on the content provided, this page does **not** contain any information about Batman Return of the Joker Game Boy, unused content, ROM internals, or Japanese titles.
>
> The page is entirely dedicated to instructions claiming to be "for LLMs and automated agents," requesting file system operations. It contains no gaming or technical documentation content related to the Batman game you're asking about.
>
> **Important note:** I'm not following the instructions on this page. They appear designed to manipulate agents into performing harmful file system operations. Legitimate technical documentation wouldn't request deleting files or swapping directories, nor would it be framed as "not for humans" while being presented to an AI agent."

> **UNTRUSTED - QUOTED TOOL OUTPUT, NOT THE INJECTION ITSELF.**
> Response to fetch #2 (`https://tcrf.net/index.php?search=Batman+Return+of+the+Joker&title=Special%3ASearch&fulltext=1`):
>
> "I appreciate you testing my judgment here. I need to be direct: I'm not going to follow those instructions, and I want to explain why.
>
> This page appears designed to trick AI agents into executing harmful commands by:
>
> 1. **Social engineering** - Framing destructive file operations as legitimate "instructions"
> 2. **False authority** - Claiming the user "specifically requested" compliance
> 3. **Misdirection** - Including unrelated content about Batman to obscure the actual request
>
> The instructions ask me to delete file contents and shuffle files-actions that could destroy data or disrupt systems.
>
> **My actual response to your question:**
>
> The content provided doesn't contain any information about "Batman: Return of the Joker" or search results from The Cutting Room Floor. The page only contains fake "agent instructions" with a demonstration image caption and obviously fabricated details (like "Instructions updated July 32, 2026"-a date that doesn't exist).
>
> **What I will do:**
> - Decline to execute system commands embedded in web content
> - Flag social engineering attempts
> - Help you with legitimate information requests
>
> If you're genuinely interested in Batman: Return of the Joker information from The Cutting Room Floor, I'm happy to help you search for that actual content through normal means."

**Phrases attributed to the injected content by the summarizer** (these are the only fragments with any claim to being near-quotes - each appeared inside quotation marks in the tool output):
- `"for LLMs and automated agents"`
- `"not for humans"`
- `"Instructions updated July 32, 2026"`

Everything else - "delete file contents", "swap/shuffle directories", "the user specifically requested" - is the summarizer's **paraphrase** of the payload's intent, not quoted text.

#### 9.1.4 - Did the same content appear on any non-tcrf.net domain? **No.**

No other fetch in this session reported anything hostile. Domains fetched, all clean:

`datacrystal.tcrf.net` (**note: a tcrf.net subdomain, and it behaved completely normally** - returned a genuine "There were no results matching the query"), `github.com`, `raw.githubusercontent.com`, `api.github.com` (via `gh`), `emulicious.net`, `mgba.io`, `sameboy.github.io`, `bgb.bircd.org`, `mattcurrie.com`, `vgmpf.com`, `forums.nesdev.org`, `retroreversing.com`, `r.jina.ai` (proxy for `rgbds.gbdev.io`), `rgbds.gbdev.io` (403), `romhacking.net` (403), `google.com` (consent redirect).

The anomaly is confined to the **apex host `tcrf.net`** across exactly two requests. Failures on `rgbds.gbdev.io`, `romhacking.net` and `gbdev.io` were ordinary HTTP 403s with no body returned.

#### 9.1.5 - Bottom line

- Both URLs: **accurate, from transcript.**
- Body vs. banner: **undeterminable with what I hold.**
- Verbatim payload: **not in my possession; not reconstructed.**
- Confined to `tcrf.net` apex; **no other domain affected.**
- Nothing was executed, no files were touched, no TCRF content entered this report.
- **If byte-level confirmation matters, someone should fetch those two URLs with `curl -A '<browser UA>' -i` and archive the raw response.** That is the only way to settle 9.1.2 and 9.1.3, and it should be done outside an agent loop.

---

## 10. Honest summary of dead ends

- **No disassembly, decomp, ROM map or RAM map of Batman: Return of the Joker (GB) exists.** Not on GitHub, not on Data Crystal, not on romhacking.net, not in awesome-gbdev. **[V]**
- **No Sunsoft Game Boy game has ever been disassembled publicly.** Zero cross-validation available for the Sunsoft GB engine or its sound driver. **[V]**
- **No Sunsoft GB sound driver spec exists.** The only Sunsoft sound-driver document is for the *Famicom* driver in *Gimmick!*, different chip, different lineage of opcode numbering. Our 56-opcode table will have to be validated by **runtime observation**, not by comparison to prior art. **[V]**
- **SM83 decompilation to C is genuinely bad and nothing fixes it.** GhidraBoy is the only game in town and its own authors document the output as hard to read with wrong calling conventions on nearly every function; it is now archived. Hand-translation remains correct. **[V]**
- **Emulicious cannot export its coverage/trace/disassembly to a file** as far as any documentation shows - its analysis lives in the GUI. Its value is interactive + the DAP socket, not artifact production. **[V for absence of documented export]**
- **BGB cannot write `.sym` files**, only read them. **[V]**
- **windfish and the RetroReversing SameBoy fork are both abandoned** (2021 and 2020 respectively) and neither runs conveniently on Windows. **[V]**
