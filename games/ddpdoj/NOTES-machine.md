# What machine IS DoDonPachi DaiOuJou — read from MAME's source

**Status: facts with citations. No ROM was used, sought, or is present.** Everything below
was read out of MAME's public source tree.

**Source pinned to:** `mamedev/mame` commit `eca6f68d5f96b4eed1d29ee95b320e0a5d195e31`,
"Merge tag 'mame0289' into HEAD", 2026-07-30 — i.e. **MAME 0.289**.

```
$ curl -sS https://api.github.com/repos/mamedev/mame/commits/master
commit eca6f68d5f96b4eed1d29ee95b320e0a5d195e31
date   2026-07-30T21:46:26Z
msg    Merge tag 'mame0289' into HEAD
```

Files read (fetched to scratch, not committed):
`src/mame/mame.lst`, `src/mame/igs/pgm.cpp`, `src/mame/igs/pgm.h`,
`src/mame/igs/pgmprot_igs027a_type1.cpp`, `src/mame/igs/pgmprot_igs027a_type1.h`,
`src/mame/igs/igs023_video.cpp`, `src/mame/igs/igs023_video.h`, `src/emu/screen.h`.

---

## 0. Headline: it is **not** Cave hardware

The first thing that has to be corrected before anything else. DoDonPachi DaiOuJou does
**not** run on a Cave board and is **not** in MAME's `cave/` driver folder. It runs on
**IGS PGM** (Polygame Master) — Cave developed it, IGS built the hardware, and MAME files
it under `src/mame/igs/pgm.cpp`.

Measured, not recalled — `src/mame/mame.lst` maps set names to driver files:

```
$ grep -n "ddpdoj\|ddonpach" mame.lst
2757:ddonpach          <- @source:atlus/cave.cpp   (DoDonPachi, 1997 — real Cave hw)
21928:ddpdoj           <- @source:igs/pgm.cpp      (DaiOuJou, 2002 — PGM)
22063:ddpdojt          <- @source:igs/pgm2.cpp     (DaiOuJou Tamashii, PGM2)
```

Consequences that matter to this project: the CPU is a **68000**, not a SH-3; there is a
**Z80 sound CPU**; there is an **ARM7-based protection ASIC whose internal ROM is
undumped and simulated**; and the refresh rate is nowhere near the "about 54" that was
floated (see §3).

---

## 1. Set names and the driver file

Driver: **`src/mame/igs/pgm.cpp`** (+ `pgmprot_igs027a_type1.cpp` for the protection
device, `igs023_video.cpp` for the graphics chip).

All `GAME(...)` lines, `src/mame/igs/pgm.cpp:5677-5685`:

| line | set | parent | machine cfg | init | title as MAME spells it |
|---|---|---|---|---|---|
| 5677 | `ddp3` | 0 (**parent**) | `pgm_arm_type1_cave` | `init_ddp3` | DoDonPachi III (World, 2002.05.15 Master Ver) |
| 5678 | `ddpdoj` | ddp3 | `pgm_arm_type1_cave` | `init_ddp3` | DoDonPachi Dai-Ou-Jou (Japan, 2002.04.05.Master Ver, 68k Label V101) |
| 5679 | `ddpdoja` | ddp3 | `pgm_arm_type1_cave` | `init_ddp3` | …(Japan, 2002.04.05.Master Ver, 68k Label V100) |
| 5680 | `ddpdojb` | ddp3 | `pgm_arm_type1_cave` | `init_ddp3` | …(Japan, 2002.04.05 Master Ver) |
| 5681 | `ddpdojp` | ddp3 | **`pgm`** | **`init_pgm`** | …(Japan, 2002.04.05 Master Ver, **location test**) — *"unprotected, but still has strings related to the protection ASIC"* |
| 5682 | `ddpdojblk` | ddp3 | `pgm_arm_type1_cave` | `init_ddp3` | **Black Label** (Japan, 2002.10.07.Black Ver, newer) |
| 5683 | `ddpdojblka` | ddp3 | `pgm_arm_type1_cave` | `init_ddp3` | **Black Label** (…, older) |
| 5684 | `ddpdojblkb` | ddp3 | `pgm_arm_type1_cave` | `init_ddp3` | **Black Label** (Japan, 2002.10.07 Black Ver) |
| 5685 | `ddpdojblkbl` | ddp3 | `pgm_arm_type1` | `init_kovsh` | bootleg KOVSH conversion (2012) |

Every one carries `MACHINE_IMPERFECT_SOUND | MACHINE_SUPPORTS_SAVE` (the bootleg and the
`ket*` hacks likewise).

Verbatim, `pgm.cpp:5678`:

```cpp
GAME( 2002, ddpdoj,       ddp3,      pgm_arm_type1_cave,     ddp3,      pgm_arm_type1_state, init_ddp3,     ROT270, "Cave (AMI license)", "DoDonPachi Dai-Ou-Jou (Japan, 2002.04.05.Master Ver, 68k Label V101)",  MACHINE_IMPERFECT_SOUND | MACHINE_SUPPORTS_SAVE )
```

Note `ROT270` — the screen is rotated; the cabinet is tate.

### Which one is canonical

**Recommend `ddpdoj`** as the hashed authority. Reasons, in order:

1. It is DaiOuJou proper (the Japanese arcade release), not the World re-title
   (`ddp3` = "DoDonPachi III") and not the Black Label revision.
2. It is the highest 68k program revision of that release (V101). `ddpdoja`/`ddpdojb`
   are V100 labels.
3. All of `ddp3`, `ddpdoj`, `ddpdoja`, `ddpdojb`, and every Black Label set share
   **identical graphics, sound and text ROMs**; only the single 2 MiB program ROM at
   `u36`/`u45` differs. So the choice costs nothing in asset extraction and can be
   revisited by swapping one file.

The 68k program ROM that would be hashed (`pgm.cpp:5250`):

```
ROM_LOAD16_WORD_SWAP( "ddp3_v101.u36",  0x100000, 0x200000, CRC(195b5c1e) SHA1(f18d791c034b0a3d85888a92fb5d326ee3deb04f) )
```

**Two caveats that should be decided consciously, not by default:**

- **`ddpdojblk` (Black Label) is the version most of the competitive community means when
  they say "DOJ".** If the port's audience is that community, canonical should be
  `ddpdojblk` (`ddb10_10_8_434f.u45`, `CRC(d21561db)`,
  `SHA1(66a0103bc5f17b28736b562e32807271a5afa261)`, `pgm.cpp:5364`). Black Label sets also
  need factory-programmed NVRAM to boot — `pgm.cpp:5359` says *"this expects Magic values
  in NVRAM to boot"*, and the set ships `ddp3blk_defaults.nv` for that.
- **`ddpdojp` (location test) is the only unprotected set.** It uses the plain `pgm`
  machine config and `init_pgm` — **no ROM decryption and no simulated ARM protection at
  all** (§2). For oracle purposes that is a genuinely valuable second reference: anything
  the protection simulation could be getting wrong is absent there. Its program ROM is a
  different, larger build (`ca008.cod_prom.u13.27c322`, 0x400000, `CRC(2ba7fa3b)`,
  `pgm.cpp:5332`), so it is a cross-check, not a substitute.

---

## 2. The machine

All from `pgm_state::pgmbase()`, `src/mame/igs/pgm.cpp:497-536`:

```cpp
	M68000(config, m_maincpu, 20_MHz_XTAL); /* 20 mhz! verified on real board */
	m_maincpu->set_addrmap(AS_PROGRAM, &pgm_state::pgm_basic_mem);
	TIMER(config, "scantimer").configure_scanline(FUNC(pgm_state::interrupt), "screen", 0, 1);

	Z80(config, m_soundcpu, 33.8688_MHz_XTAL/4);
	...
	NVRAM(config, "sram", nvram_device::DEFAULT_ALL_0);
	V3021(config, "rtc");
	...
	PALETTE(config, m_palette, palette_device::BLACK).set_format(palette_device::xRGB_555, 0x1400/2);
	...
	IGS023_VIDEO(config, m_video);
	...
	ICS2115(config, m_ics, 33.8688_MHz_XTAL);
```

| part | what | clock |
|---|---|---|
| main CPU | Motorola **68000** (68HC000FN20 on the PCB) | **20 MHz** ("verified on real board") |
| sound CPU | **Z80** | 33.8688 MHz / 4 = **8.4672 MHz** |
| sound chip | ICS **WaveFront ICS2115V** wavetable synth | 33.8688 MHz |
| graphics | **IGS023** custom (QFP256), MAME device `igs023_video_device` | driven from the 50 MHz XTAL |
| protection | **IGS027A** ARM7 ASIC ("55857G" for ddpdoj) | 20 MHz — **disabled and simulated**, see below |
| RTC | EM Microelectronic **V3021** + 3.6 V NiCd battery | 32.768 kHz |
| resolution | **448 × 224**, 15-bit colour (`pgm.cpp:14`); `ROT270` → displayed 224 × 448 | |

There is **no Z80 program ROM** — `pgm.cpp:29`: *"There is no ROM for the Z80, the program
is uploaded by the 68k"* (the 68k writes it through `0xc10000-0xc1ffff`).

### The protection ASIC is NOT emulated — it is simulated, and its ROM is undumped

This is the single largest fidelity caveat in the whole driver, and it needs to be on the
table before any oracle work.

`pgm.cpp:5253` — the ASIC's internal ROM has **never been dumped**:

```
	ROM_REGION( 0x4000, "prot", 0 ) /* ARM protection ASIC - internal ROM */
	ROM_LOAD( "ddp3_igs027a.bin", 0x000000, 0x04000, NO_DUMP )
```

`pgmprot_igs027a_type1.cpp:221-227` — the machine config the Cave sets use switches the
ARM off:

```cpp
void pgm_arm_type1_state::pgm_arm_type1_cave(machine_config &config)
{
	pgm_arm_type1_sim(config);
//  pgm_arm_type1(config); // When ARM7 ROM is dumped and hooked up

	m_maincpu->set_addrmap(AS_PROGRAM, &pgm_arm_type1_state::cavepgm_mem);
}
```

…and `pgm_arm_type1_sim` (line 212-219) does `m_prot->set_disable();`.

`init_ddp3` (`pgmprot_igs027a_type1.cpp:1825-1831`) installs a C++ handler at 68k
`0x500000-0x500005` in place of the ASIC, and **decrypts the 68k ROM in place**:

```cpp
void pgm_arm_type1_state::init_ddp3()
{
	pgm_basic_init(false);
	pgm_py2k2_decrypt(machine()); // yes, it's the same as photo y2k2
	arm_sim_handler = &pgm_arm_type1_state::command_handler_ddp3;
	m_maincpu->space(AS_PROGRAM).install_readwrite_handler(0x500000, 0x500005, ...);
}
```

The whole simulated device is 40 lines (`command_handler_ddp3`, line 493-534) and
implements exactly five commands: `0x67` set-high-bits, `0xe5` set-low-bits, `0x40`
`slot[a] = slot[b] + slot[c]` (24-bit), `0x8e` read-back, `0x99` reset/region. It is a
32-entry 24-bit adder plus a region byte, and the file header comment (line 20) says the
55857G *"execute only area"* behaviour is *"confirmed on ddpdoj at least"*.

Two implications, both good news and bad news:

- **Good:** the protection does no game logic. All game behaviour lives in the 68k ROM, so
  a hand-translation is not blocked by an undumped ARM ROM.
- **Bad:** the reference emulator is not running 100% of the original silicon on this set,
  and the 68k ROM the port would be read from is a **decrypted** image produced by
  `pgm_py2k2_decrypt` (`pgmcrypt.cpp:699`, commented *"and ddpdoj/ddpdojbl"*), not the raw
  cart bytes. Any hash the project pins must state which of the two it is.

### Memory map (68000), `pgm.cpp:325-360` + `pgmprot_igs027a_type1.cpp:182-187`

For the Cave sets the map is `cavepgm_mem` = `pgm_base_mem` + `map(0x000000, 0x3fffff).rom()`
(no `bank1` — `pgm_basic_init(false)`).

| range | contents |
|---|---|
| `0x000000-0x0fffff` | BIOS ROM (`ddp3_bios.u37`, a PGM BIOS with the logos hacked out) |
| `0x100000-0x3fffff` | game program ROM |
| `0x500000-0x500005` | ARM7 protection latch (simulated handler installed by `init_ddp3`) |
| `0x700006-0x700007` | watchdog (`nopw`) |
| **`0x800000-0x81ffff`** (mirror `0x0e0000`) | **main RAM, 128 KiB, `.share(m_mainram)`** — and it is the **NVRAM** (`m_mainram(*this, "sram")`, `pgm.h:33`; `NVRAM(config, "sram", …)`) |
| `0x900000-0x907fff` (mirror `0x0f8000`) | IGS023 video RAM |
| `0xa00000-0xa013ff` | palette RAM (xRGB_555, 0x1400/2 = 2560 entries) |
| `0xb00000-0xb0ffff` | IGS023 video registers |
| `0xc00000-0xc0000d` | sound latches, RTC, Z80 reset/control |
| `0xc08000-0xc08007` | inputs P1P2 / P3P4 / Service / DSW (+ coin counter write) |
| `0xc10000-0xc1ffff` | Z80 program RAM, written by the 68k |

IGS023 video RAM sub-map (`igs023_video.cpp:51-56`), i.e. offsets from `0x900000`:

| 68k address | contents |
|---|---|
| `0x900000-0x900fff` (mirror 0x3000) | BG tilemap RAM (32×32 tiles, 64×16 map) |
| `0x904000-0x905fff` (mirror 0x2000) | TX text tilemap RAM (8×8 tiles, 64×32 map) |
| `0x907000-0x907fff` | **row-scroll RAM** (per-scanline BG X scroll) |

IGS023 register sub-map (`igs023_video.cpp:58-69`), offsets from `0xb00000`:

| 68k address | contents |
|---|---|
| `0xb00000-0xb00fff` | sprite buffer (destination of the sprite DMA) |
| `0xb01000-0xb0103f` | zoom table RAM |
| `0xb02000` / `0xb03000` | BG Y / X scroll |
| `0xb04000` | BG scale |
| `0xb05000` / `0xb06000` | TX Y / X scroll |
| **`0xb07000`** | **read-only: current raster line** — `map(0x7000, 0x7001).lr16(NAME([this]() -> u16 { return screen().vpos(); }));` |
| `0xb0e000` | control register (`m_ctrl`) — bit 0 enables sprite DMA, bit 11 disables TX, bit 12 disables BG, bit 13 *"Disable high priority sprites"* |

**`0xb07000` is flagged for the slowdown work.** The hardware lets the program read the
beam position at any time. If DaiOuJou's main loop reads it, then the game's own logic
observes how long the frame took — which is exactly question 4 of
`docs/knowledge/06-lag-and-slowdown.md` §"Questions to answer" ("does the game's own logic
observe it?"). *Whether ddpdoj reads it is unknown and needs the ROM. The register's
existence is a source fact; the game's use of it is not.*

### How sprites and bullets are represented

Bullets on this board are sprites; there is no separate bullet layer. The list lives in
**the first `0xa00` bytes of main RAM** (`0x800000-0x8009ff`) and is DMA'd to the IGS023
at the rising edge of vblank.

`pgm.cpp:484-495`:

```cpp
void pgm_state::screen_vblank(int state)
{
	// rising edge
	if (state)
	{
		/* first 0xa00 of main RAM = sprites, seems to be buffered, DMA? */
		m_video->get_sprites();
		// vblank start interrupt
		m_maincpu->set_input_line(M68K_IRQ_6, HOLD_LINE);
	}
}
```

`igs023_video.cpp:794-811` — the DMA, **256 entries max**, 5 words (10 bytes) each, with a
hardware-verified per-word mask and an early terminator:

```cpp
bool igs023_video_device::sprite_dma()
{
	// verified on hardware
	constexpr u16 ram_mask[5] = { 0xffff, 0xfbff, 0x7fff, 0xffff, 0xffff };
	if (BIT(~m_ctrl, 0))
		return false;

	for (int i = 0, dst = 0, offs = 0; i < 256; i++, dst += 8)
	{
		for (int src = 0; src < 5; src++)
			m_spritebuffer[dst + src] = m_readspriteram_cb(offs++) & ram_mask[src];
		if ((m_spritebuffer[dst + 4] & 0x7fff) == 0)
			return true;
	}
	return true;
}
```

Entry format, `igs023_video.cpp:615-639` (verbatim):

```
        Sprite list format (10 bytes per sprites, 256 entries)

    Offset Bits
           fedcba98 76543210
    00     x------- -------- Horizontal Zoom/Shrink mode select
           -xxxx--- -------- Horizontal Zoom/Shrink table select
           -----xxx xxxxxxxx X position (11 bit signed)

    02     x------- -------- Vertical Zoom/Shrink mode select
           -xxxx--- -------- Vertical Zoom/Shrink table select
           ------xx xxxxxxxx Y position (10 bit signed)

    04     -x------ -------- Flip Y
           --x----- -------- Flip X
           ---xxxxx -------- Palette select (32 color each)
           -------- x------- Priority (Over(0) or Under(1) background)
           -------- -xxxxxxx Sprite mask ROM address MSB
    06     xxxxxxxx xxxxxxxx Sprite mask ROM address LSB

    08     x------- -------- Another sprite width bit?
           -xxxxxx- -------- Sprite width (16 pixel each)
           -------x xxxxxxxx Sprite height (1 pixel each)
```

Sprites are **not** fixed-size tiles: each entry names a bit-address into the mask ROM
(`sprmask`) and a width in 16-pixel units and a height in pixels, with optional
zoom/shrink through a 16-entry table in `zoomram`. Colour comes from the separate
`sprcol` ROM. Drawing order is the list walked **backwards** (`draw_sprites`,
line 585-591) — and *(CORRECTED 2026-07-31 by the assets recon, measured)*:
`pgm_draw_pix` sets `destpri |= 1` on every pixel it touches and refuses to
write where that bit is set, so the FIRST sprite drawn owns the pixel, and the
first drawn is the LAST list entry. **Higher list index draws IN FRONT, not
behind.** The earlier sentence here ("later entries are behind earlier ones")
was backwards; the corrected reading renders 100.0000% pixel-exact
(`docs/worklog/ddpdoj/00-recon-assets.md` §3-4).

**The hard cap is 256 sprite entries per frame, terminated early by a zero word 4.** For a
bullet-hell port this is the object table whose ordering `06-lag-and-slowdown.md` warns
becomes semantics.

### Interrupts

- **IRQ6** at vblank rising edge, i.e. line 224 (`pgm.cpp:493`).
- **IRQ4** at scanline 0, from a per-scanline timer, gated by `m_irq4_disabled`
  (`pgm.cpp:455-466`). Comment at line 453: *"most games require IRQ4 for inputs to work"*.

---

## 3. THE REFRESH RATE, DERIVED

**`src/mame/igs/pgm.cpp:513-514`:**

```cpp
	screen_device &screen(SCREEN(config, "screen", SCREEN_TYPE_RASTER));
	screen.set_raw(50_MHz_XTAL/5, 640, 0, 448, 264, 0, 224); // or 20MHz / 2? framerate verified
```

Parameter order confirmed from `src/emu/screen.h:225-236`:

```cpp
	screen_device &set_raw(u32 pixclock, u16 htotal, u16 hbend, u16 hbstart, u16 vtotal, u16 vbend, u16 vbstart)
	{
		assert(pixclock != 0);
		set_clock(pixclock);
		m_refresh = HZ_TO_ATTOSECONDS(pixclock) * htotal * vtotal;
		m_vblank = m_refresh / vtotal * (vtotal - (vbstart - vbend));
		...
		m_visarea.set(hbend, hbstart ? hbstart - 1 : htotal - 1, vbend, vbstart - 1);
```

So the frame period is exactly `htotal * vtotal / pixclock` and:

```
pixel clock  = 50 MHz / 5              = 10,000,000 Hz
htotal       = 640
vtotal       = 264
htotal*vtotal                          = 168,960 pixel clocks per frame

refresh = 10,000,000 / 168,960 = 15625/264 Hz
```

```
$ python -c "from fractions import Fraction; print(Fraction(10_000_000,640*264), 10_000_000/(640*264))"
15625/264 59.18560606060606
```

> ## **59.185606060606… Hz  (exactly 15625/264 Hz)**
> ## **frame period exactly 16.896 ms** (168,960 ÷ 10 MHz — an exact number of µs)

**This flatly contradicts the "about 54" figure that was floated.** The error would have
been **5.186 Hz — 8.76% too slow**, i.e. **311 phantom frames of drift per minute of
play**. Real slowdown in a Cave shooter is a handful of frames in a dense pattern; the
rounding error would have been two orders of magnitude larger than the signal, which is
precisely the failure `docs/knowledge/07-clocks-and-framerates.md` exists to prevent.
Do not write 54 anywhere.

Derived companions, all exact:

| quantity | value | derivation |
|---|---|---|
| frame period | **16.896 ms** | 168,960 / 10 MHz |
| scanline period | **64.0 µs** | 640 / 10 MHz |
| visible lines | **224** of 264 | `vbend=0, vbstart=224` |
| vblank lines | **40** | 264 − 224 |
| visible area | **448 × 224** | `m_visarea.set(0, 447, 0, 223)` |
| **68000 cycles per frame** | **337,920** | 20 MHz × 16.896 ms |

That last row is the number the slowdown modelling work in
`docs/knowledge/06-lag-and-slowdown.md` will be built on: an exact, integral per-frame
cycle budget for the main CPU. It is a much friendlier starting point than the Game Boy's
70,224 or the NES's fractional 89,341.5.

**Honesty note on the source comment.** The line carries two annotations: `// or 20MHz / 2?`
(an alternative that would give the *same* 10 MHz pixel clock, so it does not change the
answer) and `framerate verified` (a MAME developer's claim, not our measurement). The
arithmetic above is ours and is checkable; the claim that MAME's totals match the real
board is MAME's. If the project ever wants the rate independently confirmed, that is a
`-listxml`/hardware question, not a source-reading one.

---

## 4. What MAME exposes that an oracle would want

**Named ROM regions** (from the `ddpdoj` `ROM_START`, `pgm.cpp:5247-5272`), addressable
from Lua as `manager.machine.memory.regions[":<tag>"]`:

| region tag | declared size | contents |
|---|---|---|
| `maincpu` | 0x600000 | 68000 BIOS + program (decrypted in place by `init_ddp3`) |
| `prot` | 0x4000 | ARM7 internal ROM — **`NO_DUMP`, region is empty** |
| `igs023` | 0xa00000 | 8×8 text tiles + 32×32 BG tiles |
| `igs023:sprcol` | 0x2000000 | sprite colour data |
| `igs023:sprmask` | 0x1000000 | sprite masks + colour indexes |
| `ics` | 0x1000000 | ICS2115 samples (8-bit mono 11025 Hz) |
| `sram` | 0x20000 | factory NVRAM defaults |

**Named RAM shares** (`manager.machine.memory.shares[...]`):

- `"sram"` — the 128 KiB 68000 main RAM, `u16` (`pgm.cpp:329`, `pgm.h:57`). **The sprite
  list is the first 0xa00 bytes of this.** This is the single most important handle for a
  state-trace oracle.
- `"palette"` — palette RAM (`pgm.cpp:332`).
- `"arm7_shareram"` — exists in the state class but is **unused on the Cave sets** (ARM
  disabled).
- Inside the IGS023 device (`igs023_video.cpp:80-84`, created via `memory_share_creator`):
  `bg_videoram` (0x1000), `tx_videoram` (0x2000), `rowscrollram` (0x1000), `spritebuffer`
  (0x1000), `zoomram` (0x40). `spritebuffer` is the post-DMA sprite list — the display list
  actually rendered, as distinct from the copy the game maintains in main RAM.

**CPU tags for Lua to attach to** (`manager.machine.devices[":maincpu"]`, etc.):

| tag | device | note |
|---|---|---|
| `:maincpu` | M68000 @ 20 MHz | the one that matters; `pgm.h:63` |
| `:soundcpu` | Z80 @ 8.4672 MHz | program uploaded by the 68k, so no static disassembly target |
| `:prot` | ARM7 @ 20 MHz | `optional_device`, **`set_disable()`d on ddpdoj** — do not expect it to step |
| `:igs023` | video device | `screen_update`, `get_sprites` |
| `:screen`, `:palette`, `:ics`, `:rtc`, `:sram` (nvram) | | |

**Save states: yes.** Every DaiOuJou set carries `MACHINE_SUPPORTS_SAVE` (`pgm.cpp:5677-5685`),
and the driver registers state explicitly — `pgm_state::machine_start` saves `m_z80_sync`
(`pgm.cpp:479-482`), `pgm_arm_type1_state::machine_start` saves the protection simulation's
`m_value0/m_value1/m_valuekey/m_valueresponse/m_curslots/m_slots`
(`pgmprot_igs027a_type1.cpp:190-200`), and `igs023_video_device::device_start` saves the
scroll/scale/ctrl registers (`igs023_video.cpp:757-762`). That satisfies the
"save/load state if you can get it" item in `01-the-oracle-method.md`.

**Not answered here, and deliberately so.** Whether MAME's Lua API actually delivers the
three load-bearing capabilities — *execution hooks at an address*, *mid-run memory
read/write*, *deterministic headless stepping with a readable framebuffer* — and whether
MAME can be driven with **no GUI window on Windows**, are runtime questions. They are
answerable on the Game Boy and NES ROMs this project already legally owns, exactly as
`games/ddpdoj/README.md` proposes, and they are **not** claimed by this document. Reading
`GAME(... MACHINE_SUPPORTS_SAVE)` proves MAME can save state for this driver; it proves
nothing about the Lua surface.

---

## 5. Scale, honestly

ROM sizes taken from `ROM_START( ddpdoj )`, `pgm.cpp:5247-5272`:

| region | file | size |
|---|---|---|
| maincpu | `ddp3_bios.u37` | 0x080000 = 512 KiB |
| maincpu | `ddp3_v101.u36` | 0x200000 = **2 MiB** |
| prot | `ddp3_igs027a.bin` | 0x004000 = 16 KiB *(NO_DUMP)* |
| igs023 | `pgm_t01s.rom` | 0x200000 = 2 MiB |
| igs023 | `cave_t04401w064.u19` | 0x800000 = 8 MiB |
| igs023:sprcol | `cave_a04401w064.u7` | 0x800000 = 8 MiB |
| igs023:sprcol | `cave_a04402w064.u8` | 0x800000 = 8 MiB |
| igs023:sprmask | `cave_b04401w064.u1` | 0x800000 = 8 MiB |
| ics | `pgm_m01s.rom` | 0x200000 = 2 MiB |
| ics | `cave_m04401b032.u17` | 0x400000 = 4 MiB |
| sram | `ddp3_defaults.nv` | 0x020000 = 128 KiB |
| **total** | | **44,711,936 B = 42.64 MiB** |

Against what this project has actually done (file sizes measured on this machine):

```
$ ls -l "Batman - Return of the Joker (USA, Europe).gb" "Gradius (USA).nes"
131072  Batman - Return of the Joker (USA, Europe).gb
 65552  Gradius (USA).nes            (65,536 + 16-byte iNES header)

$ find games/batman/src -name '*.js' | xargs wc -l | tail -1
  16799 total
```

| | executable code+data | total ROM | ported JS |
|---|---|---|---|
| Batman (GB) | 128 KiB banked | 128 KiB | 16,799 lines |
| Gradius (NES) | 32 KiB PRG | 64 KiB (+CHR) | — |
| **DaiOuJou (PGM)** | **2.5 MiB of 68000 space** | **42.6 MiB** | — |

- **68000-addressable code+data is 20× Batman's entire cartridge** and **80× Gradius's PRG**.
- **Total ROM is 341× Batman's cartridge.**
- A naive line-count extrapolation from Batman (16,799 JS lines for 128 KiB) would put the
  translation at a few hundred thousand lines. That extrapolation is almost certainly
  wrong in both directions — the 68000 is far denser per instruction than the LR35902 and
  most of the 2.5 MiB is likely data/tables rather than code, while 40 MiB of graphics is
  an extraction problem rather than a translation one — but **the honest statement is that
  this is one to two orders of magnitude larger than anything the project has completed.**

---

## Open questions this document does NOT answer

1. Does the 68k program read `0xb07000` (raster position)? → decides whether the game's own
   logic observes timing. **Needs the ROM.**
2. Which of the three lag mechanisms is it? The driver has no lag concept at all — MAME
   just runs the 68000 at 20 MHz and lets it miss deadlines. Whether DaiOuJou drops
   updates, truncates its object loop, or dilates is a property of the 68k code.
   **Needs the ROM.**
3. Does MAME's Lua API give execution hooks / headless determinism / framebuffer readback
   **without opening a window on Windows**? → answerable now, on the GB or NES ROM already
   owned. **Separate exercise.**
4. Is the protection simulation (§2) close enough that a port verified against it is
   verified against the real board? Cross-checking against `ddpdojp` (unprotected location
   test) is the cheapest available answer.
5. Which set is canonical — `ddpdoj` (release) or `ddpdojblk` (Black Label, what the
   community means by "DOJ")? An owner decision, not a source fact.
