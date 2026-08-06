# RECON 4/5 - versions, "unlocked", and what Black Label changes
status: BLOCKED - versions / NVRAM / ROM-diff answered; the Black Label HITBOX is NOT measured
wave: 0   role: recon   started: 2026-07-31

## Answers to the two owner claims, up front

1. **"`ddp3` is the location test, it is unlocked, our atlas to cheat."**
   **FALSE as stated, and better than stated in one respect.** `ddp3` is the World
   release "DoDonPachi III", banner `2002.05.15 MASTER VER`, ordinary attract loop.
   The location test is **`ddpdojp`** - a different, unprotected, 4 MiB build with its
   own 128 KiB BIOS - and **we have it, and it verifies `good`**, not merely "best
   available". I found **nothing** that makes stages/modes/weapons reachable without
   playing to them, in any set. Where I looked is listed below; that is a "did not
   find", not a "does not exist".
2. **"Black Label has a smaller hitbox."** **UNRESOLVED - I could not reach the
   hitbox.** What I *did* find is bigger news for the port: `ddpdojblk` is a
   **two-version cartridge** that boots to a `VERSION-A (OLD)` / `VERSION-B (NEW)`
   chooser and **defaults to the OLD `2002.04.05 MASTER VER` after a 5-second
   timeout**. And `ddb_1dot.u45` shows **no hitbox dot**: it is pixel-identical to
   `ddb10.u45` over a 2,800-frame scripted session.

## The task, as I understood it

Settle two owner claims that are currently ASSUMPTIONS:

1. "`ddp3` is the location test, it is unlocked, our atlas to cheat."
2. "Black Label has a smaller hitbox (and maybe other stuff)."

Plus: diff the program ROMs between the four sets present; investigate the
NVRAM angle (`ddp3blk_defaults.nv` fails its checksum here, and NVRAM defaults
are a plausible meaning of "unlocked"); find out whether a correct `.nv` can be
produced from the machine itself.

## What I did

Read the five knowledge docs + all four `games/ddpdoj/NOTES-*.md`. Then, in order:
inventoried the zips; re-ran `-verifyroms` for **all nine** MAME sets; extracted the
program ROMs to scratch and diffed them raw; dumped the **decrypted** `:maincpu`
region out of a running MAME for all eight playable sets and diffed those; booted
`ddp3` and `ddpdojblk` headless and looked at the frames; drove the arcade
**TEST MENU** headless with scripted inputs; investigated the NVRAM.

Everything ROM-derived lives in the session scratchpad
(`%TEMP%\claude\C--programmieren-batman\<session>\scratchpad`), outside the repo.

## What I MEASURED

### 0. THE TREE UNDER `C:\oldpcsx2` CHANGED WHILE I WAS WORKING

`NOTES-versions.md` (written 20:44) says four sets, `ddpdojblk` BAD. At 20:47 the
directory listing was already different from the one in my own task briefing:

```
$ ls -lb /c/oldpcsx2 | grep -i ddp        # 20:47
41573313 ddp3.zip                       (20:36)
18644778 ddpdoj.zip                     (20:31)
19417237 ddpdojb.zip                    (20:33)
15094333 ddpdojblk.7z                   (20:45)
20196651 ddpdojblk.zip.SHADOWED-bad-nv  (20:30)
20196651 ddpdojblk2.zip.dup-of-above    (20:43)
```

Somebody (another workflow, or the owner) renamed `ddpdojblk.zip` out of the way and
dropped in a `.7z`. **Every measurement below is timestamped against that state.**
Re-verify before quoting.

### 1. ALL NINE SETS VERIFY - we have far more than four

```
$ cd "%LOCALAPPDATA%\Mixup\mame"
$ ./mame.exe -rompath "C:/oldpcsx2" -verifyroms <set>     # forward slashes matter, see traps
ddp3        : ddp3_igs027a.bin (16384 bytes) - NOT FOUND - NO GOOD DUMP KNOWN
romset ddp3 is best available                       1 romsets found, 1 were OK.
ddpdoj      ... best available          1 were OK.
ddpdoja     ... best available          1 were OK.
ddpdojb     ... best available          1 were OK.
ddpdojblk   ... best available          1 were OK.
ddpdojblka  ... best available          1 were OK.
ddpdojblkb  ... best available          1 were OK.
ddpdojp     romset ddpdojp [ddp3] is GOOD            1 were OK.
ddpdojblkbl romset ddpdojblkbl [ddp3] is GOOD        1 were OK.
```

**`ddp3.zip` is a MERGED romset** - 33 files, 108,281,856 B uncompressed, with the
clone-specific ROMs in `clonename/` subdirectories exactly as MAME's merged
convention requires:

```
$ unzip -l /c/oldpcsx2/ddp3.zip | tail -40
  ... ddp3_v101_16m.u36                 (ddp3's own program)
  ... ddpdoj/ddp3_v101.u36
  ... ddpdoja/ddp3_d_d_1_0.u36
  ... ddpdojb/dd_v100.u36
  ... ddpdojblk/ddb10_10_8_434f.u45
  ... ddpdojblk/ddp3blk_defaults.nv        <- CRC c2282720  (the one that was "missing")
  ... ddpdojblka/ddb_1dot.u45
  ... ddpdojblka/ddp3blk_defaults.nv       <- CRC a1651904  (a DIFFERENT blob)
  ... ddpdojblkb/ddb10.u45
  ... ddpdojblkbl/... (bootleg KOVSH conversion)
  ... ddpdojp/ca008.cod_prom.u13.27c322    <- the LOCATION TEST, 4 MiB, unprotected
  ... ddpdojp/pgmbios.u20.27c210           <- and its OWN, different 128 KiB BIOS
```

`ddpdojblkbl` and `ddpdojp` verify **"good"**, not "best available", because neither
uses `ddp3_igs027a.bin`: `ddpdojp` is unprotected, `ddpdojblkbl` ships the KOVSH ASIC.

### 2. OWNER CLAIM 1 IS FALSE AS STATED - `ddp3` is NOT the location test

Booted headless, 61 emulated seconds of attract mode, snapshotting the framebuffer:

```
$ DDP_TAG=ddp3 DDP_FRAMES="60,300,...,3550" ./mame.exe ddp3 -rompath C:/oldpcsx2 \
    -video none -sound none -nothrottle -skip_gameinfo -seconds_to_run 61 \
    -autoboot_delay 0 -autoboot_script shots.lua -snapshot_directory ... \
    -nonvram_save -noautosave
SHOT f=60   fnv=F76CB688
SHOT f=300  fnv=F76CB688
SHOT f=600  fnv=EF9608FB      <- SCORE RANKING table, "CREDITS:0"
...
SHOT f=1500 fnv=F8B16F20      <- title: 怒首領蜂 III, "©2002 CAVE CO.,LTD.  SALE BY AMI"
Average speed: 60.60% (60 seconds)
```

It is an ordinary attract loop for the World release "DoDonPachi III". No debug
overlay, no stage select, nothing that reads as a location test. MAME's own metadata
agrees and names a different set:

```
ddpdojp   desc = DoDonPachi Dai-Ou-Jou (Japan, 2002.04.05 Master Ver, LOCATION TEST)
          maincpu pgmbios.u20.27c210        size=131072  crc=1d2a7c15   (its own BIOS)
          maincpu ca008.cod_prom.u13.27c322 size=4194304 crc=2ba7fa3b   (4 MiB, vs 2 MiB)
          <no "prot" region at all>
```

**The location test is `ddpdojp`, and we have it, and it verifies GOOD.** That is the
genuinely valuable half of the owner's claim, attached to the wrong set name.

### 3. THE PROGRAM-ROM DIFF (decrypted, from a running machine)

`init_ddp3` decrypts the 68k ROM in place, so the file on disk is not what the CPU
runs. I dumped the real thing: `manager.machine.memory.regions[":maincpu"]`,
0x600000 bytes, at frame 3 of a headless run, for all 8 playable sets.

MAME's Lua **does** work on this driver (an open question in `NOTES-mame-oracle.md` §7):

```
PROBE regions:  :maincpu 6291456 w16 | :sram 131072 w8 | :prot 16384 w32
                :igs023 10485760 w8  | :igs023:sprcol 33554432 w16
                :igs023:sprmask 16777216 w16 | :ics 16777216 w8
PROBE shares:   :sram 131072 w16 | :palette 5120 w16 | :z80_mainram 65536 w8
                :arm7_shareram 64 w32 | :igs023:bg_videoram 4096 | :igs023:tx_videoram 8192
                :igs023:rowscrollram 4096 | :igs023:spritebuffer 4096 | :igs023:zoomram 64
PROBE screen w=448 h=224 refresh=59.185606061      <- matches the derived 15625/264 exactly
```

**The BIOS is byte-identical across every set except the location test:**

| set | `:maincpu` 0x000000-0x0FFFFF (BIOS) sha1 |
|---|---|
| ddp3, ddpdoj, ddpdoja, ddpdojb, ddpdojblk, ddpdojblka, ddpdojblkb | `1c36ebbb6a3d6bc8890dd48f75bb60e7b18603c7` |
| **ddpdojp** | `7cec9686041a06177d9bfcd83b53b4393435fe22` |

Program area `0x100000-0x2FFFFF` (2 MiB), decrypted, pairwise differing-byte count:

```
A           B           bytes_diff    pct    first..last differing address
ddp3        ddpdoj         1802384  85.94%   0x139FB8..0x2FFFFF
ddp3        ddpdoja         522532  24.92%   0x139FB8..0x1C8187
ddp3        ddpdojb        1800041  85.83%   0x139FB8..0x2FFFFF
ddp3        ddpdojblk      1572417  74.98%   0x139FB8..0x2C9021
ddpdoj      ddpdoja        1789095  85.31%   0x13B85A..0x2FFFFF
ddpdoj      ddpdojb         511302  24.38%   0x13B85A..0x1C727B
ddpdoj      ddpdojblk      1798924  85.78%   0x13B7D6..0x2FFFFF
ddpdojblk   ddpdojblka      530443  25.29%   0x13BF03..0x2C9021
ddpdojblk   ddpdojblkb      530684  25.30%   0x13BF03..0x2C9021
ddpdojblka  ddpdojblkb      383513  18.29%   0x23BEEF..0x2C88D9
```

Segmented into same/different runs (min run 256 B), the shape is a **relayout**, not
a patch:

```
ddpdoj  vs ddpdojblk : SAME 0x100000..0x13EBD2 (256,979 B) then DIFF to the end
ddpdojblk vs ddpdojblkb: SAME 0x100000..0x23E540 (1,303,873) DIFF 568,033 SAME 225,246
ddpdojblka vs ddpdojblkb: 88.2% same; differences bunched in 0x28BCFB..0x2C88D9
ddpdoj  vs ddpdojb   : SAME 255,208 / DIFF 20,711 / SAME 5,936 / DIFF 533,885 / SAME 1,281,412
```

**Two facts worth keeping:**

1. **The raw (encrypted) file diff and the decrypted region diff give the SAME byte
   counts, offset by 0x100000** (e.g. ddp3-vs-ddpdoj = 1,802,384 in both). So
   `pgm_py2k2_decrypt` is a per-address bijection and a diff of the raw files is
   positionally faithful. Measured, not assumed - useful, because raw diffs are cheap.
2. **The first ~236 KiB of program (0x100000..~0x139FB8) is identical in all seven
   68k builds.** Whatever lives there is shared by DoDonPachi III, every DaiOuJou
   revision and every Black Label revision. That is the first place to look for the
   engine core, and the last place to look for a version difference.
3. Region `:maincpu` also holds a copy at 0x300000..0x4FFFFF that is **not** a plain
   mirror of 0x100000 (checked: not equal). Do not assume mirroring; establish the
   real map before pointing a disassembler at it.

### 4. THE ARCADE TEST MENU DRIVES HEADLESS - and it is how you configure a run

`:DSW` bit 0 is Service Mode. Setting it from Lua works:

```lua
manager.machine.ioport.ports[":DSW"].fields["Service Mode"].user_value = 0
```

```
$ DDP_SVC=1 DDP_SHOTS=... ./mame.exe ddpdojblk ... -autoboot_script drive.lua
DRIVE service mode ON
SHOT f=600      ->  TEST MENU
                    1. INPUT   2. OUTPUT  3. SOUND  4. COLOR  5. DOT CROSS HATCH
                    6. SYSTEM  7. GAME    8. MEMORY CHECK  9. DEFAULT  10. EXIT
                    SELECT = 1P UP or DOWN     START = 1P Shot1
```

Scripted navigation works too (6 × `P1 Down`, then `P1 Button 1`):

```
DRIVE f=700..775 press P1 Down (hold 4)   x6
DRIVE f=800      press P1 Button 1 (hold 4)
SHOT f=780  -> cursor on "7. GAME"
SHOT f=900  -> GAME CONFIGURATION
              1. DIFFICULTY  NORMAL
              2. EXTEND  OLD: 1ST 10000000PTS 2ND 30000000PTS
                         NEW: 1ST 20000000PTS 2ND 50000000PTS
              3. SHIP STOCK  3
              4. RAPID FIRE (SHOT C)  ON
              5. EXIT
```

**There is no stage select and no mode unlock in GAME CONFIGURATION.** Difficulty,
extend, stock, rapid fire. That is the whole list.

### 5. `:Region` PORT HAS NO FIELDS ON `ddpdojblk`

```
PORT :Region     (no FIELD lines)
PORT :P3P4       (no FIELD lines)
PORT :DSW        Service Mode mask=0001 ; Unknown mask=0080
PORT :Service    Coin 1 / Coin 2 / Service / Test
PORT :P1P2       P1/P2 Up Down Left Right, Button 1/2/3, 1P/2P Start
```

**Trap for whoever reads this next:** `port.fields` is a Lua table keyed by field
*name*, so the seven DIP bits MAME names "Unknown" collapse into ONE entry. The
`-listxml` output shows all eight bits. Do not conclude a port is empty from `pairs()`.

`6. SYSTEM` → `SYSTEM CONFIGURATION`: `1. COIN MODE`, `2. CONTINUE ON`,
`3. DEMO SOUND ON`, `4. CHUTE TYPE 1 CHUTE SINGLE`. Cycling COIN MODE with
P1 Left/Right reached `6 COINS 1 CREDIT` and `9 COINS 1 CREDIT`; I did **not**
reach a FREE PLAY value in the ~16 presses I made, and I am not claiming there
isn't one. It does not matter operationally: `Coin 1` can be pressed from Lua
(measured below), so credits are free anyway.

### 6. THE BLACK LABEL CARTRIDGE IS A **TWO-VERSION** ROM - the biggest finding here

A plain headless boot of `ddpdojblk` does **not** go to a title screen. It goes to
a **boot-time version chooser with a 5-second countdown**:

```
SHOT f=600   (countdown "5")        SHOT f=1200  (countdown "0")
        怒首領蜂 大往生
        > 1: VERSION-A (OLD)
          2: VERSION-B (NEW)
        SELECT = UP or DOWN
        START  = SHOT
```

Which version you get changes the game's own version banner on the legal screen:

| what I pressed | banner at the region-warning screen |
|---|---|
| nothing (let it time out → **default**) | `2002.04.05.MASTER VER` |
| `P1 Down` then `P1 Button 1` (→ VERSION-B) | `2002.10.07.BLACK VER` |

**So `ddb10_10_8_434f.u45` contains both the original DaiOuJou Master Ver and the
Black Ver, and the DEFAULT on a silent boot is the OLD one.** Any harness that
boots `ddpdojblk` and does nothing is measuring the **2002.04.05 Master Ver**, not
Black Label. This is exactly the kind of thing that would have been discovered
three weeks into a port.

`ddp3` shows no such chooser - its legal screen reads
`THIS GAME IS FOR USE IN ALL COUNTRIES EXCEPTING JAPAN` / `2002.05.15 MASTER VER`,
then score ranking, title, demo. `ddpdojp` (location test) goes straight to score
ranking and a DEMONSTRATION.

### 7. THE FULL BOOT→GAMEPLAY PATH DRIVES HEADLESS FROM LUA

Reached actual stage-1 gameplay in Black Ver with a scripted input list and no GUI:

```
DDP_SCRIPT="400:P1 Down:4,450:P1 Button 1:4,      # choose VERSION-B (BLACK VER)
            900:Coin 1:6,950:Coin 1:6,            # credits, injected from Lua
            1100:1 Player Start:6,
            2000:P1 Button 1:6,2100:P1 Button 1:6,2200:1 Player Start:6"   # player select
SHOT f=2400 -> "PLEASE WAIT", ship on the stage-1 intro
SHOT f=3000 -> stage 1 proper: enemy tanks, bullets, HUD "PLAYER-1", bomb stock
Average speed: 150.28% (74 emulated seconds)
```

`ioport_field:set_value(1)` works for buttons and coins; `field.user_value = 0`
works for DIP switches. **Corpus construction is not blocked on anything.**

### 8. NVRAM - measured, and it kills the "unlocked lives in the .nv" hypothesis

The three factory blobs, all 131,072 bytes:

```
ddp3_defaults.nv   crc=571e96c0   nonzero bytes =  80   last nonzero = 0x0395F
blk  (c2282720)    crc=c2282720   nonzero bytes =  97   last nonzero = 0x03985
blka (a1651904)    crc=a1651904   nonzero bytes =  97   last nonzero = 0x03985

ddp3 vs blk  : 139 differing bytes, ALL within 0x03800..0x03985
ddp3 vs blka : 139 differing bytes, ALL within 0x03800..0x03985
blk  vs blka :   8 differing bytes, at 0x03800..0x03807   <- ONLY the leading magic
    blk  0x3800: 98 36 36 21 34 76 21 96
    blka 0x3800: 80 95 03 48 87 23 65 90
```

**80–97 non-zero bytes in a 128 KiB blob.** The content is an 8-byte boot magic plus
the same default-settings block `ddp3` has. There is no room in it for unlocked
stages, modes or weapons. **"Unlocked" is not the NVRAM.**

**But the magic is load-bearing, and this is the correction to `NOTES-versions.md`.**
I seeded `-nvram_directory` with a saved `sram` whose 8 magic bytes I replaced, and
looked at the screen:

| nvram at `0x3800..0x3807` | frames 120/300/600/900/1200 |
|---|---|
| correct (`98 36 36 21 …`) | version chooser → attract → game |
| `ddpdojblka`'s magic (`80 95 03 48 …`) | **`ROM ERROR !`** on a black screen, forever |
| eight zero bytes | **`ROM ERROR !`** on a black screen, forever |

`NOTES-versions.md` says of the bad-checksum set: *"It still boots (below), with a
warning."* **It does not.** MAME exits 0 and reports an average speed, and the game
sits on `ROM ERROR !`. That is `docs/knowledge/02-traps.md` trap 2 verbatim -
"renders without throwing" is not "renders a picture" - and it was in a NOTES file
four hours old. **Always look at the framebuffer.**

**Can a correct `.nv` be produced from the machine itself? YES, for practical use.**

```
$ ./mame.exe ddpdojblk ... -nvram_directory "$S/nvdir" -cfg_directory "$S/cfgdir" -noautosave
$ find $S/nvdir -type f
  .../nvdir/ddpdojblk/sram   131072
```

MAME writes the whole 128 KiB main RAM back out on exit, magic intact
(`saved[0x3800:0x3808] == blk[0x3800:0x3808]`), 3,212 bytes differing from the
factory blob (score table, coin counters, settings). So: boot a set whose factory
`.nv` IS present, configure it in the TEST MENU, exit, and the resulting `sram` is a
reusable NVRAM image. **What that CANNOT do is manufacture a blob matching MAME's
expected CRC for a set whose factory dump you do not have** - the magic is not
derivable, it has to come from a dump. Here that is moot: `ddp3.zip` contains the
correct `c2282720` blob for `ddpdojblk` and `verifyroms` is clean.

### 9. THE "1 DOT" ROM - no hitbox display observed

`ddb_1dot.u45` is `ddpdojblka`, which MAME calls the *older* 2002.10.07 Black Ver.
I ran an identical 2,800-frame scripted session (VERSION-B, coin, start, player
select, then Right 60 / Left 120 / Right 60 / Up 60) on all three Black Label sets
and compared the final framebuffer pixel for pixel:

```
ddpdojblk  vs ddpdojblka : 5685 differing bytes of 301056 (1.888%)
ddpdojblk  vs ddpdojblkb : 5685 differing bytes of 301056 (1.888%)
ddpdojblka vs ddpdojblkb :    0 differing bytes of 301056 (0.000%)   <- PIXEL IDENTICAL
```

**`ddb_1dot.u45` (blka) and `ddb10.u45` (blkb) produced a byte-identical 224×448
frame** after 2,800 frames of identical input, despite their program ROMs differing
in 383,513 bytes. No extra dot, no hitbox overlay, nothing.

The `ddpdojblk`-vs-others difference is **spatially confined**:

```
differing PIXELS 1922 of 100352 (1.915%)
bounding box  x 83..139   y 241..298   (224x448 tate frame)
```

- a 57×58 box around one propeller/fan enemy in mid-screen, not the player ship.
So `ddpdojblk` differs from `ddpdojblkb` in one enemy's state at that instant, and
the ship is where both put it.

**This is evidence AGAINST "1 dot = a hitbox-display build", not proof.** One frame,
one scenario, stage 1, VERSION-B. `docs/knowledge/08` is explicit: measurement proves
presence, only the listing proves absence. Someone should still look for a
hitbox-draw path in the listing before this is called settled.

### 10. THE HITBOX ITSELF - **NOT MEASURED. I could not reach it.**

What I tried:

- Dumped the whole 128 KiB main RAM (`memory.shares[":sram"]`) at five labelled
  checkpoints across a scripted movement (idle → Right 60 → Left 120 → Right 60 →
  Up 60) and looked for 16-bit big-endian words matching the movement signature.
  Ten X-like candidates survived; none is convincing. The cleanest
  (`0x0B018`, `0x0B03A`, `0x0E308`, `0x13170`) move in multiples of 1024, which
  reads like a sub-pixel fraction rather than a position.
- Decoded the hardware sprite list (first 0xA00 bytes of main RAM, 10-byte entries,
  X = word0 & 0x7FF signed, Y = word1 & 0x3FF signed, terminated by word4 == 0). It
  decodes cleanly - 17 entries idle, 88 mid-stage - but the list is rebuilt in
  priority order every frame, so entry *indices* are not stable identities and I
  could not follow the ship by index across checkpoints.

Why that is not enough anyway: knowing the player's position gives you the ship, not
the hitbox. The hitbox is a constant (or a pair of constants) inside the
player-vs-bullet collision routine, and finding it needs the routine, which needs
either a write tap on the "player died / player got hit" state or a disassembly.
**Neither was reachable in this session.** See `nextSteps`.

### 11. THE VERSION CHOICE IS PERSISTED IN NVRAM

Run 1 selected VERSION-B and let MAME save `sram`. Run 2 reused that `sram` and
**pressed nothing**:

```
p2 SHOT f=700   ->  cursor is on "> 2: VERSION-B (NEW)"    (countdown "5")
p2 SHOT f=1400  ->  same, fading out with the cursor still on VERSION-B
```

So a saved NVRAM image is enough to make Black Ver the silent default, and the
harness does not have to script the chooser on every run. **Take the image from a
run you looked at, not from a run that merely exited 0.**

Diffing a VERSION-A-default run's saved `sram` against a VERSION-B-selected run's
gives 2,228 differing bytes overall (the two runs reached different attract states,
so most of that is noise). Inside the settings block the one clean single-byte flip:

```
0x03810   A=00   B=01
```

**That is a LEAD, not a fact.** To confirm: drive both runs to the *same* screen with
identical input, re-diff, then poke `0x03810` and reboot.

**This experiment re-demonstrated the cfg trap the hard way.** My first attempt came
back showing the TEST MENU, because an earlier service-mode run had written
`<port tag=":DSW" ... value="0"/>` into my *scratch* `-cfg_directory` and it was
still there. Wipe the cfg directory between experiments, or the machine remembers a
DIP you set an hour ago.

## What I could not do, and why

- **The Black Label hitbox is unmeasured.** Section 10 says exactly what I tried.
  The honest status is BLOCKED, not "no difference found".
- **I did not find anything that unlocks stages/modes/weapons**, and I am not
  claiming there is nothing. Where I looked: every TEST MENU page reachable from the
  top level (GAME, SYSTEM), the `:DSW`/`:Region`/`:Service` ioports, the three
  factory NVRAM blobs, and the boot behaviour of all three Black Label sets plus
  `ddp3` and `ddpdojp`. Not looked at: the `Unknown` DIP bits 1..6 individually,
  submenus below INPUT/OUTPUT/SOUND/COLOR/MEMORY CHECK/DEFAULT, and anything the
  68k listing would show.
- **`ddpdojblkbl` (the KOVSH bootleg) I did not boot.** It verifies good; it is a
  2012 conversion and is the least interesting reference.
- **I did not settle what the ~236 KiB common prefix (0x100000..~0x139FB8) is.**
  Identical across all seven 68k builds; almost certainly worth a look.

## If someone picks this up cold

1. **Use forward slashes in `-rompath`.** `-rompath C:\oldpcsx2` through a bash tool
   silently becomes `C:oldpcsx2` and every set reports `romset "X" not found!`.
2. **`-nonvram_save` does not stop MAME writing `cfg/<set>.cfg`.** My first
   service-mode run persisted `<port tag=":DSW" ... value="0"/>` into
   `%LOCALAPPDATA%\Mixup\mame\cfg\ddpdojblk.cfg`, which would have booted every
   later run straight into TEST MODE. I deleted the eight `ddp*.cfg` files I created
   and used `-cfg_directory <scratch>` afterwards. **Always pass `-cfg_directory`
   and `-nvram_directory` into scratch.**
3. **Keep every notifier/tap handle in a global.** `emu.add_machine_frame_notifier`
   has the same garbage-collection trap `NOTES-mame-oracle.md` records for
   `install_read_tap`: my first snapshot script fired at frame 60 and then silently
   never again, with no error. Assigning the handle to a global fixed it.
4. **`ddpdojblk` boots to a version chooser that defaults to the OLD Master Ver.**
   Press `P1 Down` then `P1 Button 1` in the first ~5 seconds for Black Ver.
5. Scripts used (scratch only, not committed): `dumpprg.lua` (region dump),
   `shots.lua`, `drive.lua` (DIP + button script + snapshots), `ports.lua`,
   `ramhunt.lua`. They are small; `drive.lua` is the one worth promoting into
   `games/ddpdoj/tools/`.


## What I could not do, and why

## If someone picks this up cold
