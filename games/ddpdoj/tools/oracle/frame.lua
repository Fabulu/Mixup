-- frame.lua -- THE per-frame state probe for DoDonPachi DaiOuJou (IGS PGM,
-- ddpdojblk).  One probe, one sample point, both builds.
--
-- ============================================================================
-- THE SAMPLING POINT (measured; docs/worklog/ddpdoj/00-recon-oracle.md §1,
-- re-derived per build by derive.py and printed by `pgm.py landmarks`)
-- ============================================================================
-- The main loop's last-but-one call ARMS a vblank semaphore at $803940 with the
-- number of vblanks to wait, and then busy-waits on it:
--
--   build A ($13xxxx, 2002.04.05 MASTER)   build B ($23xxxx, 2002.10.07 BLACK)
--     $13C5B6 move.b #$1,$803940             $23C212 move.b #$1,$803940
--     $13C5BE tst.w  $80390E                 $23C21A tst.w  $80390E
--     $13C5C4 bne    $13C6B4  --> spin       $23C220 bne    $23C390  --> spin
--     $13C6B4 tst.b  $803940 / bne -8        $23C390 tst.b  $803940 / bne -8
--   and the IRQ6 handler releases it:
--     $13C7E6 tst.b $803940 / beq $13C80C    $23C44C tst.b $803940 / beq $23C472
--     $13C806 subq.b #1,$803940              $23C46C subq.b #1,$803940
--
-- So the game's own once-per-frame synchronisation point is the ARM WRITE: the
-- 0 -> non-zero transition of $803940.  We sample there.  It is
-- mechanism-independent (all SEVEN semaphore-write sites in build B arm the
-- same byte), it happens exactly once per completed logic frame, and at that
-- instant the frame's updates are done and nothing of the next frame has begun.
--
-- WHY A WRITE TAP AND NOT A READ TAP.  On the 68000 a read tap fires on the
-- PREFETCH, so it cannot prove an address executed -- the wait loop's `rts` is
-- prefetched on every single spin.  `CURPC == tapped address` is a 6502 rule and
-- is FALSE here; the 68000 discriminator is `PC == offset`.  Writes are never
-- speculative, so a write tap is the exact execution hook on this CPU.  Two
-- wave-0 recons lost runs to this.
--
-- WHY EVERY TAP AND NOTIFIER HANDLE LIVES IN A GLOBAL.  A dropped handle is
-- garbage-collected and the hook SILENTLY STOPS FIRING -- the symptom is a run
-- that prints nothing at all and exits 0.  Three separate agents hit this.
--
-- ============================================================================
-- ENV
-- ============================================================================
--   PROBE_FRAMES   stop after N logic frames                   (default 600)
--   PROBE_OUT      TSV output path (Windows path)              (default stdout)
--   PROBE_INPUT    button script "lf=NAMES;lf=NAMES;..."       (see BUTTONS)
--   PROBE_LM       landmark table, "name=hex,name=hex,..."     (from pgm.py)
--   PROBE_REQUIRE_BUILD  "A"|"B" -- fail the run if the live build differs
--   PROBE_METER    1 = count wait-loop spin iterations (the load meter)
--   PROBE_PIXELS   N = hash the whole framebuffer every Nth logic frame
--   PROBE_SNAP     "lf,lf,..." -- write a framebuffer PNG at those logic frames
--   PROBE_SAVE     "vf:path"  buffer_save at that VIDEO frame
--   PROBE_SAVEAT   "lf:path"  buffer_save at the game's OWN sample point
--   PROBE_LOAD     "path"     buffer_load before the run
--   PROBE_RTC      1 = census reads of $C00000-$C0000D (the V3021 RTC)
--   PROBE_OBJ      "push,base,stride,slots" (hex,hex,hex,dec) -- the object
--                  driver instrumentation; see THE OBJECT DRIVER below
--   PROBE_INJECT   "nops[:fromLF]" -- ARTIFICIAL LOAD (a NOP sled), see below
--   PROBE_GFX      directory for IGS023 state dumps (ROM-DERIVED -- gitignored)
--   PROBE_GFXAT    "lf,lf,..." -- dump a frame PAIR at each of those logic frames
--   PROBE_ZOOMCOV  "startLF[,perFrame]" -- THE ZOOM COVERAGE POKER, see below
--   PROBE_WATCH    "name=hex[:w|:l],..." -- EXTRA compared columns, appended
--                  after the standard ones.  OPT-IN and empty by default, so a
--                  run without it produces byte-identical output to wave 3's
--                  and `pgm.py gate`'s recorded hash still holds.  Wave 4 uses
--                  it for the player record ($8103E6+) and the options.
--   PROBE_PORTIN   1 = tap the 68000's reads of the input port $C08000 and
--                  carry the LAST word read before each sample point as the
--                  column `portin`.  THIS IS THE REPLAY INPUT WORD: the port
--                  consumes it and derives $803970/72/74 itself, so the input
--                  mirrors stay a genuinely compared field instead of being
--                  fed in from the answer.  (NOTES-replay.md constraint 3.)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local IACK = CPU.spaces["cpu_space"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]              -- 128 KiB main RAM @ $800000
local PAL  = M.memory.shares[":palette"]
local SPB  = M.memory.shares[":igs023:spritebuffer"]
local BG   = M.memory.shares[":igs023:bg_videoram"]
local TX   = M.memory.shares[":igs023:tx_videoram"]

TAPS, SUBS = {}, {}                                 -- GLOBALS. See the header.

local RUN     = tonumber(os.getenv("PROBE_FRAMES") or "600")
local OUTPATH = os.getenv("PROBE_OUT")
local PIXELS  = tonumber(os.getenv("PROBE_PIXELS") or "0")
local METER   = os.getenv("PROBE_METER") == "1"
local RTCWATCH = os.getenv("PROBE_RTC") == "1"
local SNAPTAG = os.getenv("PROBE_SNAPTAG") or "f"
local WANT_BUILD = os.getenv("PROBE_REQUIRE_BUILD")

-- ============================================================================
-- THE OBJECT DRIVER  (wave 2 item 1 -- docs/knowledge/06's (C) detector)
-- ============================================================================
-- Located by measurement, not guessed: `phase.lua` timed the seven main-loop
-- calls and attributed every main-RAM write to the call it happened in, which
-- put ALL the object work in call #2 ($23BFE8 jsr $2410BC) and the sprite-list
-- build in call #4 ($23BFF4 jsr $23D2AE).  Disassembling $2410BC gives the
-- driver verbatim (build B; build A's identical shape is at $1413FE):
--
--   $2410C4 lea $80E240,A5      the object table
--   $2410CA moveq #$13,D0       20 SLOTS  (dbra runs $13+1 times)
--   $2410CC move.w (A5),D1      slot type word; 0 = empty
--   $2410CE beq  $2410E8        ...skip
--   $2410D0 andi.w #$ff,D1
--   $2410D4 lsl.w #3,D1
--   $2410D6 move.l A5,-(A7)     <-- THE HOOK.  A WRITE, so it is a real
--   $2410D8 move.w D0,-(A7)         execution hook on the 68000 (a read tap
--   $2410DA lea ($240F62,PC),A0     would only prove prefetch), and A5 is the
--   $2410DE movea.l (A0,D1.w),A0    slot address and D0 the dbra counter AT
--   $2410E2 jsr (A0)                that instant.
--   $2410E4 move.w (A7)+,D0
--   $2410E6 movea.l (A7)+,A5
--   $2410E8 lea ($50,A5),A5     STRIDE $50 = 80 bytes
--   $2410EC dbra D0,$2410CC
--   $2410F0 rts
--
-- **THERE IS NO BUDGET TEST AND NO TIME TEST IN THAT LOOP.**  It is a plain
-- `dbra` over exactly 20 slots, every frame, unconditionally.  That is the
-- listing's answer to mechanism (C) at the top level; the runtime column below
-- is what proves it under load, because only a measurement can do that.
--
-- `objn` = dispatches this logic frame (0..20) -- "object slots processed".
-- `objord` = FNV-1a-64 over the ORDERED (slot index, type) sequence.  ORDER is
--   semantics here and not decoration: the table is kept sorted by the +$4A
--   priority word, insertion at $24111E memmoves the tail DOWN one slot (so the
--   last slot is destroyed when the table is full) and deletion at $2411E2
--   memmoves it UP (so slot indices are not stable identities).
-- `objlive` = non-zero type words in the table, read at the sample point.
local OBJ_PUSH, OBJ_BASE, OBJ_STRIDE, OBJ_SLOTS
do
  local s = os.getenv("PROBE_OBJ")
  if s then
    local a, b, c, d = s:match("^(%x+),(%x+),(%x+),(%d+)$")
    if a then
      OBJ_PUSH = tonumber(a, 16); OBJ_BASE = tonumber(b, 16)
      OBJ_STRIDE = tonumber(c, 16); OBJ_SLOTS = tonumber(d)
    else p("OBJ_SPEC_BAD [%s]", s) end
  end
end

-- ============================================================================
-- ARTIFICIAL LOAD -- how the overrun is forced  (wave 2 item 2)
-- ============================================================================
-- MAME's `-speed` is a HOST throttle: it changes how fast the host runs the
-- emulation and leaves the emulated cycles per frame at exactly 337,920, so it
-- produces NO in-game slowdown whatsoever.  The right tool would be a per-CPU
-- clock scale (device_execute_interface::set_clock_scale, the internal UI's
-- "Overclock CPU maincpu" slider).  MEASURED ON THIS MACHINE, MAME 0.288:
-- that is NOT reachable.  The `device` usertype's metatable has 30 members and
-- none is clock/clock_scale/set_clock_scale; `manager.ui` exposes no slider
-- list; `-showusage` has no overclock option; and the binary has no `<slider>`
-- cfg node, so the slider is not persisted either.  Evidence in
-- docs/worklog/ddpdoj/02-impl-object-driver-and-overrun.md.
--
-- So the overrun is forced the other way the plan allows: INJECT ARTIFICIAL
-- LOAD.  A NOP SLED is written into the decrypted :maincpu image at $340000 --
-- inside the 68000's ROM window ($000000-$3FFFFF, cavepgm_mem) but past the end
-- of the 2 MiB program ($100000..$2FFFFF), so it overwrites nothing the game can
-- reach -- and one main-loop `jsr` operand is repointed at it:
--
--   $340000        4E71 x N          nop, nop, ... (4 cycles each)
--   $340000+2N     4EF9 00xxxxxx     jmp <the call's original target>
--
-- WHY A NOP SLED AND NOT A COUNTED DELAY LOOP.  The first version was
-- `move.l D0,-(A7) / move.l #N,D0 / subq / bne / move.l (A7)+,D0`.  It restores
-- D0 exactly and touches no game variable -- and its ITERS=0 CONTROL STILL
-- FAILED, on `d_ram`.  Diagnosed by dumping all 128 KiB at the injection frame
-- in both runs: **18 bytes differed and every one was DEAD STACK**, $81FEE2 to
-- $81FF57 -- residue the two pushes left below SP.  Two things came out of that
-- and both are kept:
--   (a) the sled, which pushes nothing, clobbers no register and sets no flag,
--       so its control is byte-identical rather than nearly so;
--   (b) THE STACK REACHES BELOW $81FF00.  wave 1 carved only the top page out
--       as `d_top` "(dead stack)"; measured over a 2,600-frame gate run, 49
--       writer PCs reach into the $81FE00 page and the deepest write seen is
--       $81FE76.  So `d_ram` contains ~256 bytes of dead stack today.  That is
--       recorded, not silently patched, because moving the boundary would
--       change every digest in the corpus -- see the worklog.
--
-- The sled changes WHEN the frame runs out of time and nothing about WHAT the
-- game does about it, which is exactly the split NOTES-slowdown-oracle.md's
-- banner demands.  4 cycles per nop, 2 bytes per nop, ~1 MiB of pad available =
-- up to ~2,000,000 injectable cycles against a 337,920-cycle frame budget.
--
-- CONTROL, and it is the reason to trust any of this: with NOPS=0 the patched
-- run must be BYTE-IDENTICAL to the unpatched one (only the `jmp`'s 12 cycles
-- are added, and 12 cycles must move no state).  `pgm.py overrun` runs it first
-- and refuses to report a sweep if it fails.
--
-- EVERY NUMBER FROM THIS IS MAME-TIMED AND UNCALIBRATED, and it is a MECHANISM
-- result only.  Injected load cannot tell you how often the real board overruns.
local INJ_NOPS, INJ_FROM = 0, 0
do
  local s = os.getenv("PROBE_INJECT")
  if s then
    local a, b = s:match("^(%d+):?(%d*)$")
    if a then
      INJ_NOPS = tonumber(a)
      INJ_FROM = tonumber(b) or 0
    else p("INJECT_SPEC_BAD [%s]", s) end
  end
end
local INJ_SITE = tonumber(os.getenv("PROBE_INJECT_SITE") or "23BFE8", 16)
local INJ_PAD  = tonumber(os.getenv("PROBE_INJECT_PAD") or "340000", 16)

-- ---------------------------------------------------------------- landmarks
-- Addresses come in from pgm.py, which reads landmarks.json, which derive.py
-- produced from the DECRYPTED :maincpu region.  Nothing here is hard-coded
-- except the RAM addresses, which derive.py re-confirms are shared by the two
-- builds (the same byte patterns appear once in each build's address range).
local LM = {}
for kv in (os.getenv("PROBE_LM") or ""):gmatch("[^,]+") do
  local k, v = kv:match("^(%w+)=(%x+)$")
  if k then LM[k] = tonumber(v, 16) end
end
local SEM  = 0x3940        -- offset into :sram of the vblank semaphore $803940
local IAK4 = 0xfffff8      -- 68000 autovector interrupt-acknowledge, level 4
local IAK6 = 0xfffffc      -- level 6
-- $13C398 nop / $13C39A bra -4 -- the "ROM ERROR !" halt (the string is at
-- $13C39F).  A machine sitting here produces clean, stable, plausible numbers
-- and MAME still exits 0.  Only build A has this gate: the NVRAM magic is
-- checked before the version chooser, so it is the same halt for both targets.
local HALT_LO, HALT_HI = 0x13C398, 0x13C39A

-- release PCs: the ISR6 `subq.b #1,$803940` of BOTH builds.  A release can look
-- like an arm exactly once -- when the semaphore is already 0 and subq wraps it
-- to $FF -- so it is excluded by PC rather than by value.
local REL = {}
if LM.relA then REL[LM.relA] = true end
if LM.relB then REL[LM.relB] = true end

-- named words carried in the state vector (offsets into :sram; $800000-based)
local NAMED = {
  {"c390a", 0x390a},   -- free-running counter, ++ per MAIN LOOP ITERATION
  {"c390d", 0x390d}, {"c390e", 0x390e},   -- 2-phase alternator / mod-3 phase
  {"c392e", 0x392e}, {"c3930", 0x3930}, {"c3932", 0x3932},  -- divider countdowns
  {"sem",   0x3940}, {"c3942", 0x3942},
  {"p1raw", 0x3970}, {"p1edge", 0x3972}, {"p1prev", 0x3974},
  {"p2raw", 0x3976}, {"p2edge", 0x3978},
  {"irq4ph", 0xfa84},  -- the ONE live byte a savestate resume gets wrong
}

-- ---------------------------------------------------------------- PROBE_WATCH
-- Extra compared columns, opt-in.  `name=hex` is a word at that $8xxxxx address
-- (the offset into :sram is derived, so the caller writes real addresses and
-- cannot be one megabyte out); `:l` makes it a longword, `:b` a byte.  Nothing
-- is emitted when the variable is unset, which is why every hash recorded by
-- waves 1-3 survives this change -- re-verified with `pgm.py gate` after it.
local WATCH = {}
for kv in (os.getenv("PROBE_WATCH") or ""):gmatch("[^,]+") do
  local k, v, sz = kv:match("^([%w_]+)=(%x+):?(%a*)$")
  if k then
    local a = tonumber(v, 16)
    if a >= 0x800000 then a = a - 0x800000 end
    WATCH[#WATCH + 1] = {k, a, (sz ~= "" and sz or "w")}
  else
    p("WATCH_UNPARSED [%s]", kv)
  end
end

-- ---------------------------------------------------------------- PROBE_PORTIN
-- The hardware input word at $C08000, read once per logic frame by the IRQ6
-- input routine.  See the header: this is the replay input record.
local PORTIN = os.getenv("PROBE_PORTIN") == "1"
local portin, portin_reads = 0xffff, 0

-- ---------------------------------------------------------------- PROBE_POKE
-- An INTERVENTION, in the same spirit as wave 2's NOP sled and under the same
-- rule: it must change WHEN or WHETHER something happens and never invent a
-- value the game could not itself hold.  "hexaddr=hexbyte,..." written at every
-- sample point AFTER emit(), so the TSV always records the game's own value and
-- the poke is consumed by the NEXT logic frame.  The port applies the identical
-- poke at the identical point, so the two sides stay one experiment.
local POKES = {}
for kv in (os.getenv("PROBE_POKE") or ""):gmatch("[^,]+") do
  local a, v = kv:match("^(%x+)=(%x+)$")
  if a then
    a = tonumber(a, 16)
    POKES[#POKES + 1] = {(a >= 0x800000) and (a - 0x800000) or a, tonumber(v, 16)}
  else
    p("POKE_UNPARSED [%s]", kv)
  end
end
local POKE_FROM = tonumber(os.getenv("PROBE_POKE_FROM") or "0")

-- ---------------------------------------------------------------- digests
-- Mix 64 bits at a time.  The wave-0 probe hashed u32 with a four-byte FNV
-- (16 Lua ops per 4 bytes) and ran at 17-21% of real time; this is 2 ops per
-- 8 bytes over the same bytes.  Same coverage, ~1/30th of the arithmetic.
-- Lua 5.4 integers are 64-bit and multiplication wraps, which is what we want.
local function digest(share, off, len)
  local h = 0xcbf29ce484222325
  for a = off, off + len - 8, 8 do
    h = (h ~ share:read_i64(a)) * 0x100000001b3
  end
  return h & 0x7fffffffffffffff       -- keep it printable as a positive integer
end

-- ---------------------------------------------------------------- the DATE
-- MEASURED, wave 1, and it is the one thing that made this corpus non-repro-
-- ducible across days: the board carries a V3021 RTC that MAME feeds from the
-- HOST clock, build B reads it (`lea $C00006,A0` at $23C53A, plus the BIOS at
-- $00B79A), and the CALENDAR LANDS IN MAIN RAM.
--
-- Two otherwise identical 2,600-frame gate runs, 26 hours apart on the calendar
-- (TZ +14 vs TZ -12), differ in EXACTLY TEN BYTES of the 128 KiB, all of them
-- month/day pairs and all in five 8-byte words:
--
--   $80209B=08 vs 07   $80209D=01 vs 1F        (month, day: 2026-08-01 / 07-31)
--   $8020AC..AD  $80211C..1D  $802204..05  $8022C8..C9   = 0801 vs 071F
--
-- Every other compared field -- sprite list, palette, sprite buffer, BG, TX,
-- framebuffer pixels, the frame counters, work and spin -- was IDENTICAL.
--
-- So the date is carved OUT of d_ram and reported as its own column d_date.
-- It is bounded, named and visible, not hidden: a hole in a digest that nobody
-- can see is how a real divergence gets excused later.
--
-- THE DEAD-STACK BOUNDARY, corrected in wave 2 and it was one page too high.
-- Wave 1 hashed $800000..$81FEFF as `d_ram` and carved only the TOP PAGE
-- $81FF00..$81FFFF out as `d_top` "(dead stack)".  The stack goes deeper than
-- that.  Found by the overrun control failing: an injected delay that provably
-- touched no game variable still moved `d_ram`, and dumping all 128 KiB at the
-- injection frame in both runs showed 18 differing bytes, $81FEE2..$81FF57 --
-- one of them `$81FF37: 904000 vs 25F1F6`, and $0025F1F6 is a build-B code
-- address, i.e. a PUSHED PC left below SP by an interrupt that landed 12 cycles
-- later.  Dead stack, not state.
--
-- Then measured properly, 2,600-frame gate run, write tap on $81FE00-$81FEFF:
-- 49 writer PCs, EVERY ONE a stack push -- including $000CA6/$000CBE, which are
-- the BIOS IRQ4/IRQ6 trampolines (`move.l $801470,-(A7)`).  Deepest write seen:
-- $81FE36 (from $13CEC8).  No data-shaped writer: the spans are 2/6/50 bytes
-- (movem frames) and the busiest is active on 332 of 2,600 frames.
--
-- So the boundary moves to $81FE00 -- 54 bytes of headroom under the deepest
-- observed push -- and a GUARD TAP on the 256 bytes below it FAILS the run
-- loudly if the stack ever goes deeper, because a silent boundary is how a real
-- divergence gets excused later.  THIS CHANGES EVERY DIGEST IN THE CORPUS
-- against wave 1's numbers; that is recorded in the worklog, not hidden.
local RAM_LEN   = 0x1fe00
local STACK_GUARD_LO, STACK_GUARD_HI = 0x81FD00, 0x81FDFF
local RAM_HOLES = {0x2098, 0x20A8, 0x2118, 0x2200, 0x22C8}   -- 8-byte aligned
local RAM_SEGS = {}
do
  local cur = 0
  for _, h in ipairs(RAM_HOLES) do
    RAM_SEGS[#RAM_SEGS + 1] = {cur, h - cur}
    cur = h + 8
  end
  RAM_SEGS[#RAM_SEGS + 1] = {cur, RAM_LEN - cur}
end
local function digest_segs(share, segs)
  local h = 0xcbf29ce484222325
  for _, sg in ipairs(segs) do
    for a = sg[1], sg[1] + sg[2] - 8, 8 do
      h = (h ~ share:read_i64(a)) * 0x100000001b3
    end
  end
  return h & 0x7fffffffffffffff
end
local DATE_SEGS = {}
for _, h in ipairs(RAM_HOLES) do DATE_SEGS[#DATE_SEGS + 1] = {h, 8} end

-- The hardware's own sprite-list rule, transcribed from igs023_video.cpp
-- sprite_dma(): 256 entries max, 10 bytes each, terminated when word 4 & 0x7fff
-- is 0.  This is the DISPLAY LIST LENGTH, not an object count -- the list is
-- rebuilt from scratch every frame and slots are not stable identities.
local function sprite_count()
  local off = 0
  for i = 0, 255 do
    if (RAM:read_u16(off + 8) & 0x7fff) == 0 then return i end
    off = off + 10
  end
  return 256
end

-- ---------------------------------------------------------------- input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = {
  U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
  S = "1 Player Start",
}
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
do
  local s = os.getenv("PROBE_INPUT")
  if s and #s > 0 then
    for item in s:gmatch("[^;]+") do
      local lf, names = item:match("^(%d+)=(.*)$")
      if lf then
        local fs = {}
        for c in names:gmatch(".") do
          local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
          if f then fs[#fs + 1] = f
          else p("INPUT_UNKNOWN char=%s", c) end
        end
        script[tonumber(lf)] = fs
      end
    end
  end
end
-- Applied AT the sample point, i.e. the instant the game's frame N finished.
-- Measured lead on this machine is ZERO: a button set here is latched by the
-- IRQ6 that runs while the main loop waits, and consumed by frame N+1.
local function apply_input(lf)
  local fs = script[lf]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

-- ---------------------------------------------------------------- savestate
local SAVE_VF, SAVE_PATH, SAVE_LF, SAVELF_PATH
do
  local s = os.getenv("PROBE_SAVE")
  if s then SAVE_VF, SAVE_PATH = s:match("^(%d+):(.*)$"); SAVE_VF = tonumber(SAVE_VF) end
  s = os.getenv("PROBE_SAVEAT")
  if s then SAVE_LF, SAVELF_PATH = s:match("^(%d+):(.*)$"); SAVE_LF = tonumber(SAVE_LF) end
end
local LOAD_PATH, loaded = os.getenv("PROBE_LOAD"), false
local save_pending = false
-- PROBE_RAMDUMP="lf:path" -- the whole 128 KiB of main RAM at one logic frame,
-- taken AT the sample point. This is how a digest divergence is turned into a
-- byte range: "d_ram differs" is a symptom, "$80xxxx..$80xxxx differs" is a
-- diagnosis.
local DUMP_LF, DUMP_PATH
do
  local s2 = os.getenv("PROBE_RAMDUMP")
  if s2 then DUMP_LF, DUMP_PATH = s2:match("^(%d+):(.*)$"); DUMP_LF = tonumber(DUMP_LF) end
end

local snapat = {}
for tok in (os.getenv("PROBE_SNAP") or ""):gmatch("[^,]+") do snapat[tonumber(tok)] = true end

-- ============================================================================
-- THE GFX DUMP  (wave 3 item 1 -- the pixel gate for the ASSET DECODE)
-- ============================================================================
-- Dumps everything igs023_video.cpp::screen_update reads, plus MAME's own
-- framebuffer, so `gfxgate.py` can re-render the frame with OUR decoder and
-- diff it. The two sides are independently derived (our Python vs MAME's C++),
-- which is the whole point (docs/knowledge/03, "two sides of a comparison").
--
-- THE SAMPLE-POINT OFFSET IS MEASURED AND IT IS NOT ONE OFFSET, IT IS TWO
-- (00-recon-assets.md §4, reproduced from scratch there in two hours):
--   * emu.add_machine_frame_notifier fires AFTER the game's vblank IRQ has
--     already written the NEXT frame's video state, so the tilemap / scroll /
--     sprite state read at video frame N is what MAME DRAWS in frame N+1.
--   * screen:pixels() resolves the indexed bitmap to RGB at the END of the
--     frame, so the PALETTE that applies is frame N+1's, not frame N's.
--     Measured: state f5500 + palette f5500 -> 17.836 %; + palette f5501 ->
--     100.000 %. Only a fade frame exposes the difference.
-- So a dump is a PAIR of consecutive video frames and the comparison is
-- state(N) + palette(N+1) vs pixels(N+1). This code writes the pair; the
-- offsets live in gfxgate.py, which is the side that does the arithmetic.
--
-- Triggered on LOGIC frames (the corpus's unit -- video and logic frames come
-- apart exactly when slowdown happens), then dumped on the next two video-frame
-- notifier ticks.
local lf, vf = 0, 0                     -- declared here: gfx_dump() logs lf
local GFXDIR   = os.getenv("PROBE_GFX")
local gfxat, gfx_pending, gfx_n = {}, 0, 0
for tok in (os.getenv("PROBE_GFXAT") or ""):gmatch("[^,]+") do gfxat[tonumber(tok)] = true end

local ROWS = M.memory.shares[":igs023:rowscrollram"]
local ZOOM = M.memory.shares[":igs023:zoomram"]

local function share_bytes(sh)
  local t = {}
  for i = 0, sh.size // 2 - 1 do
    local v = sh:read_u16(i * 2)
    t[#t + 1] = string.char((v >> 8) & 0xff, v & 0xff)
  end
  return table.concat(t)
end

local function wr(name, bytes)
  local fh = io.open(GFXDIR .. "/" .. name, "wb")
  if not fh then p("GFX_OPEN_FAILED [%s]", GFXDIR .. "/" .. name); return 0 end
  fh:write(bytes); fh:close()
  return #bytes
end

local function gfx_dump()
  local v = SCR:frame_number()
  local pre = string.format("f%06d.", v)
  wr(pre .. "palette.bin",      share_bytes(PAL))
  wr(pre .. "spritebuffer.bin", share_bytes(SPB))
  wr(pre .. "bg_videoram.bin",  share_bytes(BG))
  wr(pre .. "tx_videoram.bin",  share_bytes(TX))
  wr(pre .. "rowscroll.bin",    share_bytes(ROWS))
  wr(pre .. "zoomram.bin",      share_bytes(ZOOM))
  -- the game's OWN sprite list (pre-DMA), first 0xa00 bytes of main RAM
  local t = {}
  for a = 0, 0x9ff, 2 do
    local w = RAM:read_u16(a)
    t[#t + 1] = string.char((w >> 8) & 0xff, w & 0xff)
  end
  wr(pre .. "spriteram.bin", table.concat(t))
  local regs = {
    bg_yscroll = PROG:read_u16(0xb02000), bg_xscroll = PROG:read_u16(0xb03000),
    bg_scale   = PROG:read_u16(0xb04000),
    tx_yscroll = PROG:read_u16(0xb05000), tx_xscroll = PROG:read_u16(0xb06000),
    ctrl       = PROG:read_u16(0xb0e000),
  }
  local rl = {}
  for k, val in pairs(regs) do rl[#rl + 1] = string.format("%s=%04x", k, val) end
  table.sort(rl)
  wr(pre .. "regs.txt", table.concat(rl, "\n") .. "\n")
  wr(pre .. "pixels.bin", SCR:pixels())
  gfx_n = gfx_n + 1
  p("GFXDUMP vf=%d lf=%d %s", v, lf, table.concat(rl, " "))
end

-- ============================================================================
-- bg_scale WATCH  (wave 3 item 5)
-- ============================================================================
-- MAME does NOT implement the IGS023's bg_scale register -- igs023_video.cpp:193
-- "TODO: not implemented, unknown algorithm". Every frame the assets recon
-- captured read 0x210 (= 100 %). If the game EVER writes anything else, then the
-- reference emulator is wrong there and no comparison of that frame means
-- anything -- it is a fidelity hole in the ORACLE, not a bug in the port. So
-- this tap is standing, in every scenario, and a non-0x210 value FAILS the run.
-- ============================================================================
-- THE SPRITE HARVEST  (wave 3 item 3 -- the export policy, decided out loud)
-- ============================================================================
-- Sprites on this board CANNOT BE ENUMERATED STATICALLY.  There is no sprite
-- table in ROM: the record lives in 68k RAM and carries a 23-bit WORD OFFSET
-- into the mask ROM, where a 2-word header points into a length-compressed
-- colour stream.  You cannot random-access inside a sprite and you cannot walk
-- the mask ROM to find where sprites begin without inventing a rule nobody has
-- validated (00-recon-assets.md §"What I could not do").
--
-- So there are exactly two possible policies, and this is the choice:
--   (a) HARVEST every `offs` the game actually uses, across the scenario
--       corpus. A MEASUREMENT. Its weakness is stated rather than hidden: the
--       atlas provably contains what the corpus displayed and nothing else.
--   (b) statically walk the mask ROM. A GUESS, with no way to tell a real
--       header from two bytes that look like one.
-- We take (a), and the manifest records that it is (a), with the corpus.
local HARVEST = os.getenv("PROBE_SPRHARVEST")
local harvest, harvest_n = {}, 0

-- ============================================================================
-- THE SOUND MAP  (wave 3 item 4 -- identification only; playback is out of the
-- slice, PLAN §6 item 2)
-- ============================================================================
-- What wave 0 left open, and what this closes:
--  * "the 68k doorbell carries no sound ID" -- every write to $C00002/3 was
--    data=0001 from one PC. So the SELECTOR must go through the shared Z80 RAM
--    window at $C10000-$C1FFFF, which was never tapped. Tapped here, and the
--    bytes written SINCE THE PREVIOUS DOORBELL are logged with each doorbell:
--    that is the command payload, by construction.
--  * "I did not find the Z80 program blob in the 68k ROM." The Z80 has 64 KiB
--    of RAM and NO ROM (pgm.cpp:29), so its whole program is uploaded through
--    that window. Rather than model the 68k->Z80 lane mapping, this dumps the
--    Z80's RAM after the upload and SEARCHES the decrypted :maincpu region for
--    a needle out of it -- a measurement that does not depend on the model.
--  * "17 of 67 samples have end <= start", possibly because the driver moves
--    `saddr` between the start-high and end-high writes and a keyon-time
--    snapshot applies one bank to both. So every ICS register write is logged
--    IN ORDER, not just the state at keyon.
local SOUNDDIR = os.getenv("PROBE_SOUND")

local BGSCALE_OK = 0x210
local bgscale = { writes = 0, bad = 0, vals = {}, pcs = {}, seen = {} }

-- ============================================================================
-- THE ZOOM COVERAGE POKER  (wave 3 item 2)
-- ============================================================================
-- The wave-0 corpus contains zoom-table entries 1 and 0xa only -- that is
-- PRESENCE, not coverage (docs/knowledge/03). The zoom path is the most
-- intricate branch in draw_sprite_new_zoomed(): grow duplicates a pixel, shrink
-- drops it, the x and y walks are independent, and the flip cases index the
-- destination from the far edge using a realxsize/realysize that is itself
-- computed by walking the zoom mask. A decoder can be exactly right on entries
-- 1 and 0xa and wrong on the other fourteen.
--
-- So: write OUR OWN display list into the GAME'S list in main RAM
-- ($800000-$8009FF, 5 u16 per entry) and let the hardware's own DMA carry it
-- into the sprite buffer. Both sides then read the same dumped buffer, so this
-- stays a two-sided comparison: our Python renderer against MAME's C++, with
-- the list as shared input.
--
-- THE FIRST ATTEMPT WROTE THE POST-DMA BUFFER (`:igs023:spritebuffer`) DIRECTLY,
-- WITH THE SPRITE DMA SWITCHED OFF, AND IT DID NOT WORK -- MEASURED, and worth
-- recording because it looks like it ought to. The poke landed: the dumped
-- buffer contained our 18-sprite grid on both frames of every pair. MAME drew
-- the GAME'S sprites anyway (I looked at the framebuffer PNG: an explosion and
-- the ship, not a grid), and the pairs scored 92.6 % instead of 100 %. So
-- MAME's draw_sprites does NOT re-read that share at draw time; the DMA parses
-- the list into its own structures and the draw uses those. **The share is an
-- output of the DMA, not the input of the draw.** On the natural corpus the two
-- always agree, which is why the decoder can be validated against the share.
--
-- WHEN to poke: at the SAMPLE POINT, i.e. the semaphore arm. The list is
-- rebuilt from scratch by main-loop call #4 every frame and the DMA copies it
-- at the following vblank, so the arm -- after the frame's work, before the
-- vblank -- is the one instant where a poked list survives to be DMA'd. The
-- game then rebuilds it next frame, so every logic frame carries one batch.
--
-- The source sprite (offs / width / height) is HARVESTED from the live list --
-- it must be a real compressed stream in the mask ROM, because there is no way
-- to synthesise one (sprites are length-compressed and cannot be random-
-- accessed; 00-recon-assets.md §3).
--
-- Encoding note, and it is the one that is easy to get wrong: "no zoom on this
-- axis" is NOT zom=0. zoom_word() returns 0 only for z >= 0x10, and grow flips
-- z to 0x10-z, so the no-zoom encoding is **zom=0 with grow=1** (-> 0x10 -> 0).
-- zom=0 with grow=0 selects zoomram entry 0, which is a real zoom.
local ZC_START, ZC_PER = nil, 18
do
  local s = os.getenv("PROBE_ZOOMCOV")
  if s then
    local a, b = s:match("^(%d+),?(%d*)$")
    ZC_START = tonumber(a)
    if b and #b > 0 then ZC_PER = tonumber(b) end
  end
end
-- THE ZOOM TABLE IS HELD CONSTANT FOR A WHOLE RUN, and that is a measurement,
-- not a convenience.  A synthetic table written mid-run costs EXACTLY ONE frame
-- pair: on the transition frame the draw uses the table as dumped one video
-- frame EARLIER than the sprite list poked at the same instant.  MEASURED, by
-- re-scoring the transition pair against three candidate tables:
--     state f2080 -> pixels f2081:  zr(f2079)=100352/100352   zr(f2080)=99374
--     state f2078 -> pixels f2079:  all three tables 100352 (they are equal)
--     state f2082 -> pixels f2083:  all three tables 100352 (they are equal)
-- i.e. the zoom table reaching the draw is latched a frame ahead of the sprite
-- buffer; poking it at the sample point instead of in the notifier moved
-- nothing (the same 978 pixels, on the same single pair).  I did not establish
-- WHERE MAME latches it -- shares are not tappable and the read happens in C++
-- -- so rather than model an offset I could not pin, each coverage run uses ONE
-- table for its whole length and `pgm.py zoomcov` runs twice.
-- PROBE_ZOOMSYNTH=1 selects the synthetic table, from the very first notifier
-- tick, so no transition exists inside a run.
--
-- Entry 0xf is hard-coded to 1 by MAME
-- (igs023_video.cpp:689) whatever the RAM says, so it is covered either way.
-- These 16 words are chosen to span the shapes the walk can take: none, all,
-- alternating at three phases, sparse, dense, and the two halves.
local ZC_SYNTH = {
  0x00000000, 0xffffffff, 0xaaaaaaaa, 0x55555555,
  0x11111111, 0x88888888, 0x0000ffff, 0xffff0000,
  0x01010101, 0x80808080, 0xf0f0f0f0, 0x0f0f0f0f,
  0x00000001, 0x80000000, 0xdeadbeef, 0x12345678,
}
local ZC_SYNTH_ON = os.getenv("PROBE_ZOOMSYNTH") == "1"
local zc = { combos = nil, batch = 0, nbatch = 0, armed = false, hold = 0 }

local function zc_pick_source()
  -- the game's OWN list in main RAM: 5 u16 per entry, 10 bytes stride
  local best
  for i = 0, 255 do
    local b = i * 10
    local w2 = RAM:read_u16(b + 4) & 0x7fff
    local w3 = RAM:read_u16(b + 6)
    local w4 = RAM:read_u16(b + 8)
    if (w4 & 0x7fff) == 0 then break end
    local wid = (w4 & 0x7e00) >> 9
    local hgt = w4 & 0x1ff
    local offs = ((w2 & 0x7f) << 16) | w3
    if wid >= 1 and wid <= 2 and hgt >= 8 and hgt <= 32 then
      if not best or (wid * 16 * hgt) < best.area then
        best = { offs = offs, wid = wid, hgt = hgt, color = (w2 & 0x1f00) >> 8,
                 area = wid * 16 * hgt, from = i }
      end
    end
  end
  return best
end

local function zc_arm()
  local src = zc_pick_source()
  if not src then
    p("FAIL zoomcov: no live sprite with width<=2 and 8<=height<=32 to harvest "
      .. "as the source stream; start later or widen the grid")
    zc.combos = {}
    zc.nbatch = 0
    return
  end
  zc.src = src
  p("ZOOMCOV source offs=$%06X width=%d(%dpx) height=%d color=%d from_list_index=%d",
    src.offs, src.wid, src.wid * 16, src.hgt, src.color, src.from)
  local c = {}
  -- axis: 1 = x only, 2 = y only, 3 = both.
  for z = 0, 15 do
    for grow = 0, 1 do
      for axis = 1, 3 do
        for flip = 0, 3 do
          c[#c + 1] = { z = z, grow = grow, axis = axis, flip = flip }
        end
      end
    end
  end
  zc.combos = c
  zc.nbatch = (#c + ZC_PER - 1) // ZC_PER
  p("ZOOMCOV combos=%d per_frame=%d batches=%d logic_frames_needed=%d table=%s",
    #c, ZC_PER, zc.nbatch, zc.nbatch * 2, ZC_SYNTH_ON and "SYNTHETIC" or "the game's own")
end

local function zc_write_batch()
  local src, c = zc.src, zc.combos
  if not src then return end
  local first = zc.batch * ZC_PER
  local n = 0
  for k = 0, ZC_PER - 1 do
    local e = c[first + k + 1]
    if not e then break end
    -- NO ZOOM on the unused axis: zom=0 AND grow=1 -> 0x10 -> zoom_word()==0.
    local xz, xg, yz, yg = 0, 1, 0, 1
    if e.axis == 1 or e.axis == 3 then xz, xg = e.z, e.grow end
    if e.axis == 2 or e.axis == 3 then yz, yg = e.z, e.grow end
    local gx, gy = k % 6, k // 6
    local x, y = 8 + 72 * gx, 8 + 72 * gy
    local b = n * 10                       -- 5 u16 per entry in main RAM
    RAM:write_u16(b + 0, ((xg & 1) << 15) | ((xz & 0xf) << 11) | (x & 0x7ff))
    RAM:write_u16(b + 2, ((yg & 1) << 15) | ((yz & 0xf) << 11) | (y & 0x3ff))
    -- word 2's hardware AND mask is 0x7fff; pri=0 = draw over the background
    RAM:write_u16(b + 4, (((e.flip & 3) << 13) | ((src.color & 0x1f) << 8)
                          | ((src.offs >> 16) & 0x7f)) & 0x7fff)
    RAM:write_u16(b + 6, src.offs & 0xffff)
    RAM:write_u16(b + 8, ((src.wid & 0x3f) << 9) | (src.hgt & 0x1ff))
    n = n + 1
  end
  RAM:write_u16(n * 10 + 8, 0)          -- word4 & 0x7fff == 0 terminates
  p("ZOOMCOV batch=%d/%d sprites=%d vf=%d lf=%d hold=%d",
    zc.batch + 1, zc.nbatch, n, SCR:frame_number(), lf, zc.hold)
  -- EACH BATCH IS HELD FOR TWO LOGIC FRAMES.  The pair is (state at video frame
  -- V, pixels at V+1), and dumping on every logic frame makes V+1 carry the
  -- NEXT batch's state -- so half the batches would only ever appear as the
  -- pixels member and never be compared.  MEASURED before the fix: 43 batches
  -- produced 44 dumps and 22 pairs.
  zc.hold = zc.hold + 1
  if zc.hold >= 2 then zc.hold = 0; zc.batch = zc.batch + 1 end
end

-- ---------------------------------------------------------------- state
local irq4, irq6, rel, spin = 0, 0, 0, 0
local prev_t, rel_t = 0, 0
local out, done = nil, false
-- census (the lag census the plan requires in EVERY scenario's output)
local cen = { irq6hist = {}, relhist = {}, spinhist = {}, buildhist = {},
              armhist = {}, semhist = {}, maxspr = 0, halted = 0, rtcreads = 0,
              minwork = math.huge, maxwork = 0, over = 0, spanned = 0,
              objhist = {}, objlivehist = {}, guard = 0, guardpcs = {},
              portinhist = {} }
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- object-driver accumulators, reset at every sample point
local objn, objord = 0, 0xcbf29ce484222325

local COLS = {"lf", "vf", "cyc", "work", "spin", "irq4", "irq6", "rel",
              "build", "armpc", "sprites", "objn", "objord", "objlive",
              "d_spr", "d_ram", "d_date", "d_top", "d_pal", "d_spb", "d_bg", "d_tx", "pix"}
for _, n in ipairs(NAMED) do COLS[#COLS + 1] = n[1] end
if PORTIN then COLS[#COLS + 1] = "portin" end
for _, w in ipairs(WATCH) do COLS[#COLS + 1] = w[1] end

-- THE MACHINE CLOCK, IN 68000 CYCLES, AND WHY IT IS NOT attoseconds.
-- Wave 1 computed `t = M.time.attoseconds + M.time.seconds * 1e18`.  int64's
-- maximum is 9.223e18, so that product OVERFLOWS once `seconds` reaches 10 and
-- t goes negative -- roughly every 9.2 emulated seconds, i.e. every ~546 logic
-- frames.  `cyc` survived because it is a difference and two's-complement
-- subtraction wraps correctly, but `work` is guarded by `rel_t > 0`, which is
-- FALSE for half of every run.  MEASURED on the wave-1 gate scenario: `work`
-- is 0 on lf531-1058 and lf1603-2147 -- 1,254 of 2,600 frames -- and the
-- `work_cycles min/max/over_budget` census line was therefore computed over
-- whichever half of the run happened to have a positive clock.
-- Cycles directly, exactly, with no float and no overflow: the 68000 is 20 MHz,
-- so one cycle is 5e10 attoseconds.
local function cycnow()
  return M.time.seconds * 20000000 + (M.time.attoseconds // 50000000000)
end

local function emit(armpc)
  local t = cycnow()
  -- 20 MHz 68000; the frame budget is exactly 337,920 cycles (16.896 ms, from
  -- pixclock 10 MHz / (640 x 264) = 15625/264 Hz).  Not a rounded literal.
  local cyc = t - prev_t
  -- work = cycles from the ISR6 release that started this frame to the arm that
  -- ended it: the game's own frame budget consumption, with NO extra tap.  The
  -- spin meter measures the same thing from the other side and they must sum to
  -- roughly one frame; carrying both is the cross-check.
  local work = rel_t > 0 and (t - rel_t) or 0
  prev_t = t
  if work > 0 then
    if work < cen.minwork then cen.minwork = work end
    if work > cen.maxwork then cen.maxwork = work end
    if work > 337920 then cen.over = cen.over + 1 end
  end
  local pix = 0
  if PIXELS > 0 and (lf % PIXELS) == 0 then
    local s = SCR:pixels()
    local h = 0xcbf29ce484222325
    for i = 1, #s - 7, 8 do
      h = (h ~ string.unpack("<i8", s, i)) * 0x100000001b3
    end
    pix = h & 0x7fffffffffffffff
  end
  local spr = sprite_count()
  if spr > cen.maxspr then cen.maxspr = spr end
  -- bg_scale, read every logic frame as well as write-tapped: a value set
  -- BEFORE the autoboot script installed its taps is invisible to the tap and
  -- visible here. MAME does not implement this register at all.
  bump(bgscale.seen, string.format("%04X", PROG:read_u16(0xb04000)))
  -- live slots, counted at the sample point straight out of the table
  local objlive = 0
  if OBJ_BASE then
    for i = 0, OBJ_SLOTS - 1 do
      if RAM:read_u16((OBJ_BASE - 0x800000) + i * OBJ_STRIDE) ~= 0 then
        objlive = objlive + 1
      end
    end
    bump(cen.objhist, objn)
    bump(cen.objlivehist, objlive)
  end
  local build = (armpc >> 20) & 0xf
  cen.lastbuild = build
  bump(cen.buildhist, build)
  bump(cen.armhist, string.format("%06X", armpc))
  bump(cen.irq6hist, irq6)
  bump(cen.relhist, rel)
  if irq6 > 1 then cen.spanned = cen.spanned + 1 end
  if METER then bump(cen.spinhist, spin - (spin % 500)) end

  local r = {
    lf, vf, cyc, work, spin, irq4, irq6, rel,
    build, string.format("%06X", armpc), spr,
    objn, objord & 0x7fffffffffffffff, objlive,
    digest(RAM, 0, 0xa00),           -- the sprite display list
    digest_segs(RAM, RAM_SEGS),      -- main RAM, minus the RTC date words
    digest_segs(RAM, DATE_SEGS),     -- ...which are reported here instead
    digest(RAM, RAM_LEN, 0x200),     -- $81FE00-$81FFFF: dead stack, separately
    digest(PAL, 0, PAL.size), digest(SPB, 0, SPB.size),
    digest(BG, 0, BG.size), digest(TX, 0, TX.size), pix,
  }
  for _, n in ipairs(NAMED) do r[#r + 1] = RAM:read_u16(n[2] & ~1) end
  if PORTIN then r[#r + 1] = portin end
  for _, w in ipairs(WATCH) do
    if w[3] == "l" then r[#r + 1] = RAM:read_u32(w[2] & ~1)
    elseif w[3] == "b" then r[#r + 1] = RAM:read_u8(w[2])
    else r[#r + 1] = RAM:read_u16(w[2] & ~1) end
  end
  local line = table.concat(r, "\t")
  if out then out:write(line, "\n") else p("ROW %s", line) end
  if PORTIN then bump(cen.portinhist, portin_reads); portin_reads = 0 end
  irq4, irq6, rel, spin = 0, 0, 0, 0
  objn, objord = 0, 0xcbf29ce484222325
end

-- ---------------------------------------------------------------- taps
-- (1) interrupt census, game-agnostic: a read tap on the 68000's
--     interrupt-acknowledge space is a hook on every interrupt dispatch.
--     At an exception-entry fetch CURPC is the INTERRUPTED PC.
TAPS[#TAPS + 1] = IACK:install_read_tap(0, 0xffffff, "iak", function(offset, data)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc >= HALT_LO and pc <= HALT_HI then cen.halted = cen.halted + 1 end
  if offset == IAK4 then irq4 = irq4 + 1
  elseif offset == IAK6 then irq6 = irq6 + 1 end
  return data
end)

-- (2) THE SAMPLE POINT.  16-bit space: the tap range must be word-aligned or
--     MAME dies with "end address has low bits unset".
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then rel = rel + 1; rel_t = cycnow(); return data end
  -- big-endian 16-bit space: the even byte $803940 lives in the HIGH lane
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(SEM) == 0 and newv ~= 0 then
    lf = lf + 1
    vf = SCR:frame_number()
    bump(cen.semhist, newv)          -- 1 / 2 / 3 = the divider path taken
    apply_input(lf)
    if snapat[lf] then SCR:snapshot(string.format("%s_lf%06d.png", SNAPTAG, lf)); p("SNAP lf=%d", lf) end
    -- ARM the gfx dump. The dump itself must happen in the VIDEO-frame notifier
    -- (that is where the measured state->pixels offset is defined), so the
    -- logic-frame trigger only sets the counter; the next two notifier ticks
    -- write the pair.
    if gfxat[lf] then gfx_pending = 2 end
    -- THE SPRITE HARVEST, taken at the sample point straight out of the game's
    -- own list (5 u16 per entry), i.e. exactly the records the game asked the
    -- hardware to draw.
    if HARVEST then
      for i = 0, 255 do
        local b = i * 10
        local w2 = RAM:read_u16(b + 4) & 0x7fff
        local w4 = RAM:read_u16(b + 8)
        if (w4 & 0x7fff) == 0 then break end
        local key = string.format("%06X,%d,%d,%d",
          ((w2 & 0x7f) << 16) | RAM:read_u16(b + 6),   -- offs
          (w4 & 0x7e00) >> 9,                          -- width, 16px units
          w4 & 0x1ff,                                  -- height, pixels
          (w2 & 0x1f00) >> 8)                          -- colour bank
        if not harvest[key] then
          harvest[key] = {lf, 1}
          harvest_n = harvest_n + 1
        else
          harvest[key][2] = harvest[key][2] + 1
        end
      end
    end
    -- ZOOM COVERAGE.  Poked HERE and nowhere else: the arm write is after the
    -- frame's sprite-list build (main-loop call #4) and before the vblank DMA
    -- that carries the list to the video chip, which is the only instant at
    -- which a poked list survives to be drawn.  Poked AFTER emit() above, so
    -- the TSV still records the game's own list rather than ours.
    if ZC_START and lf >= ZC_START and (zc.nbatch == 0 or zc.batch < zc.nbatch) then
      if not zc.armed then zc.armed = true; zc_arm() end
      if zc.nbatch > 0 then
        zc_write_batch()
        gfx_pending = 2
      end
    end
    local ok, e = pcall(emit, pc)
    if not ok then p("LUA_ERROR emit %s", tostring(e)) end
    if lf >= POKE_FROM then
      for _, k in ipairs(POKES) do RAM:write_u8(k[1], k[2]) end
    end
    if DUMP_LF == lf then
      local fh = io.open(DUMP_PATH, "wb")
      if fh then
        local c = {}
        for a = 0, RAM.size - 1 do
          c[#c + 1] = string.char(RAM:read_u8(a))
          if #c == 65536 then fh:write(table.concat(c)); c = {} end
        end
        if #c > 0 then fh:write(table.concat(c)) end
        fh:close()
        p("RAMDUMP lf=%d bytes=%d path=%s", lf, RAM.size, DUMP_PATH)
      else p("RAMDUMP_OPEN_FAILED path=[%s]", tostring(DUMP_PATH)) end
    end
    -- SEEDING AT THE GAME'S OWN SAMPLE POINT.  The save is ARMED here, at the
    -- arm write, and TAKEN in the next frame notifier.  Calling buffer_save()
    -- from inside a memory tap re-enters the emulation core mid-instruction;
    -- MEASURED (wave 1): the resulting state is restorable but NOT resumable --
    -- the resumed run diverged on d_ram and on $80390E (the mod-3 phase) on
    -- every one of 120 compared frames.  Deferring costs the phase alignment of
    -- $80FA84 -- which is why irq4ph is a compared column rather than a hidden
    -- one.
    if SAVE_LF == lf then save_pending = true end
  end
  return data
end)

-- (3) THE LOAD METER, opt-in.  A read tap on the wait loop's `tst.b` counts
--     spin iterations per frame: ~10,000-12,000 on a quiet frame, under 1,000
--     on the heaviest stage-1 frames measured so far, 0 with the interrupted PC
--     elsewhere = overrun.  A read tap is legitimate HERE precisely because the
--     loop re-fetches on every iteration -- we are counting fetches, not
--     proving execution.
if METER and LM.wait then
  TAPS[#TAPS + 1] = PROG:install_read_tap(LM.wait, LM.wait + 1, "meter",
    function(offset, data) spin = spin + 1; return data end)
end

-- (3b) THE OBJECT DRIVER's per-slot hook.  $2410D6 is `move.l A5,-(A7)`, the
--      first instruction of the dispatch preamble -- a WRITE, and therefore a
--      real execution hook on the 68000 rather than a prefetch.  The tap covers
--      the stack region and filters by CURPC; the stack lives in $81FFxx
--      (SP=$81FFFC at boot, ~1,714 writes/frame measured in
--      00-recon-memmap.md §4) and $81F000 gives it 4 KiB of headroom.
if OBJ_PUSH then
  TAPS[#TAPS + 1] = PROG:install_write_tap(0x81F000, 0x81FFFF, "objslot",
    function(offset, data, mask)
      if (CPU.state["CURPC"].value & 0xffffff) ~= OBJ_PUSH then return data end
      local a5 = CPU.state["A5"].value & 0xffffff
      local slot = (a5 - OBJ_BASE) // OBJ_STRIDE
      local ty = RAM:read_u16(a5 - 0x800000)
      objn = objn + 1
      -- ORDER is semantics: mix slot and type in sequence, never a set/sum.
      objord = ((objord ~ ((slot << 16) | ty)) * 0x100000001b3) & 0xffffffffffffffff
      return data
    end)
end

-- (3c) THE DEAD-STACK GUARD.  d_ram stops at $81FE00 because everything above
--      it was MEASURED to be stack (see the boundary note above).  If the stack
--      ever reaches below that, part of d_ram becomes stack noise and every
--      comparison in the corpus quietly weakens.  This tap normally never fires.
TAPS[#TAPS + 1] = PROG:install_write_tap(STACK_GUARD_LO, STACK_GUARD_HI, "stkguard",
  function(offset, data, mask)
    cen.guard = cen.guard + 1
    bump(cen.guardpcs, string.format("%06X", CPU.state["CURPC"].value & 0xffffff))
    return data
  end)

-- (3c2) THE SPRITE-REQUEST QUEUE, AND WHAT HAPPENS AT ITS CAP.  Wave 5.
--
--   $23D726  the enqueue.  A1 = the CURRENT BUCKET's remaining-record count,
--            A2 = $80397C + $80AFC0 (the shared write pointer, a byte offset).
--            $23D73E `addi.w #$c,$80AFC0`; $23D746 `cmpi.w #$BC4,$80AFC0` /
--            `beq $23D75A`.  $BC4 = 3012 = 251 records of 12 bytes.
--   $23D75A  FULL: `clr.w (A1)` -- a WRITE, and therefore a reliable 68000
--            execution hook -- then `ori #$1,SR` sets CARRY.
--   ALL 29 CALL SITES ($23D3EC..$23D61A) are followed by `bcs $23D624`
--   (measured: a static scan of every bsr in $200000-$2A0000 whose target is
--   $23D726).  So a full queue does NOT merely drop the next request: it
--   ABANDONS THE CURRENT BUCKET's remainder and SKIPS EVERY LATER BUCKET,
--   jumping straight to the emit.  The buckets are appended in a fixed order,
--   so what is lost is a whole low-priority TAIL, not the last few sprites.
--
-- This census counts executions of $23D75A and records WHICH bucket count word
-- was zeroed, so "the queue never fills" stays a measurement and never becomes
-- an assumption.  It costs one tap and is on by default.
cen.sprfull, cen.sprfullbucket, cen.sprqmax = 0, {}, 0
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80AFC0, 0x80AFFB, "sprq",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc == 0x23D73E then
      local v = data & 0xffff
      if v > cen.sprqmax then cen.sprqmax = v end
    elseif pc == 0x23D75A then
      cen.sprfull = cen.sprfull + 1
      bump(cen.sprfullbucket, string.format("%06X", offset))
    end
    return data
  end)

-- (3d) THE bg_scale WATCH (wave 3 item 5).  $B04000 is the IGS023's background
--      scale register.  MAME reads it and DOES NOTHING WITH IT
--      (igs023_video.cpp:193 "TODO: not implemented, unknown algorithm"), so if
--      the game ever programs a scale other than 0x210 (= 100 %) our oracle is
--      comparing against an emulator that lacks the feature.  That is a hole in
--      the REFERENCE, not a port bug, and it has to be loud: a non-0x210 value
--      FAILS the run rather than quietly degrading every pixel comparison
--      downstream of it.
-- (6) THE INPUT PORT, $C08000.  A READ tap is the right hook here and the
--     prefetch caveat does not apply: $C08000 is I/O, no instruction is ever
--     fetched from it, so every hit is a genuine `move.w (A0),D0` data read.
--     The value is carried to the sample point as the column `portin` and is
--     the port's replay input word -- see the header.  `portin_reads` is
--     censused because "read exactly once per logic frame" is a claim, and a
--     claim in this project is measured before it is used.
if PORTIN then
  TAPS[#TAPS + 1] = PROG:install_read_tap(0xc08000, 0xc08001, "portin",
    function(offset, data, mask)
      portin = data & 0xffff
      portin_reads = portin_reads + 1
      return data
    end)
end

TAPS[#TAPS + 1] = PROG:install_write_tap(0xb04000, 0xb04001, "bgscale",
  function(offset, data, mask)
    local v = data & 0xffff
    bgscale.writes = bgscale.writes + 1
    bump(bgscale.vals, string.format("%04X", v))
    if v ~= BGSCALE_OK then
      bgscale.bad = bgscale.bad + 1
      bump(bgscale.pcs, string.format("%06X", CPU.state["CURPC"].value & 0xffffff))
      -- WHEN, not just how many. The first write of a non-100% scale on this
      -- cartridge comes out of the BIOS before the game has completed a single
      -- logic frame, and "2 bad writes" without the frame numbers cannot tell
      -- that apart from a gameplay frame MAME is rendering wrong.
      if bgscale.bad <= 20 then
        p("BGSCALE vf=%d lf=%d value=%04X pc=%06X", SCR:frame_number(), lf, v,
          CPU.state["CURPC"].value & 0xffffff)
      end
      if lf > 0 then bgscale.after_first_lf = (bgscale.after_first_lf or 0) + 1 end
    end
    return data
  end)

-- (3e) THE SOUND MAP.  Three taps: the 68k->Z80 shared RAM window, the doorbell
--      that pulses the Z80's NMI, and the Z80's own writes to the ICS2115
--      register file.  The ICS protocol below is transcribed from
--      src/devices/sound/ics2115.cpp (mame0289): port 1 selects a register,
--      ports 2/3 are the data low/high bytes, register $4F selects the voice,
--      $0E sets the active-voice count, and a write of 0 to register $10 is the
--      KEYON (ics2115.cpp:875, `voice.state.on = !ctl`).
local snd
if SOUNDDIR then
  snd = { pend = {}, doors = 0, keyons = 0, regw = 0, z80w = 0,
          reg_select = 0, osc = 0, active = 31, V = {},
          fmail = nil, fics = nil, fkey = nil, lastdoor = 0 }
  for i = 0, 31 do
    snd.V[i] = { conf = 0, fc = 0, st = 0, en = 0, saddr = 0, vol = 0, pan = 0 }
  end
  local function open(n)
    local f = io.open(SOUNDDIR .. "/" .. n, "wb")
    if not f then p("FAIL sound map cannot write %s/%s", SOUNDDIR, n) end
    return f
  end
  snd.fmail = open("mailbox.tsv")
  snd.fics  = open("ics.tsv")
  snd.fkey  = open("keyon.tsv")
  if snd.fmail then snd.fmail:write("door\tvf\tlf\tpc\tdata\tpayload_since_last_door\n") end
  if snd.fics then snd.fics:write("n\tvf\tlf\tvoice\treg\thalf\tdata\n") end
  if snd.fkey then
    snd.fkey:write("n\tvf\tlf\tvoice\tconf\tfmt\tloop\tfc\tstart\tend\tlen\t"
                   .. "vol\tpan\tsaddr\tafter_door\tics_row\n")
  end

  -- (a) the 68k -> Z80 shared RAM window.  Both the program upload and the
  --     command mailbox go through here.
  TAPS[#TAPS + 1] = PROG:install_write_tap(0xc10000, 0xc1ffff, "z80w",
    function(offset, data, mask)
      snd.z80w = snd.z80w + 1
      if #snd.pend < 64 then
        snd.pend[#snd.pend + 1] = string.format("%04X=%04X",
          (offset - 0xc10000) & 0xffff, data & 0xffff)
      end
      return data
    end)

  -- (b) THE DOORBELL.  $C00003 is m68k_latch1_w and it pulses the Z80 NMI; it
  --     is an ODD-address BYTE handler on a 16-bit space, so the tap must cover
  --     the whole word.  Wave 0 measured every write as data=0001 from a single
  --     PC -- i.e. it is a bell, not a message.  The message is `pend`.
  TAPS[#TAPS + 1] = PROG:install_write_tap(0xc00002, 0xc00003, "door",
    function(offset, data, mask)
      snd.doors = snd.doors + 1
      snd.lastdoor = snd.doors
      if snd.fmail then
        snd.fmail:write(string.format("%d\t%d\t%d\t%06X\t%04X\t%s\n",
          snd.doors, SCR:frame_number(), lf,
          CPU.state["CURPC"].value & 0xffffff, data & 0xffff,
          table.concat(snd.pend, " ")))
      end
      snd.pend = {}
      return data
    end)

  -- (c) the Z80's writes to the ICS2115, mirrored and logged IN ORDER.
  local Z80 = M.devices[":soundcpu"]
  local function reg_write(data, hi)
    local v = snd.V[snd.osc]
    local r = snd.reg_select
    if r == 0x00 then
      if hi then v.conf = (v.conf & 0x80) | ((data >> 8) & 0x7f) end
    elseif r == 0x01 then v.fc = data
    elseif r == 0x02 then
      if hi then v.st = (v.st & 0x00ffffff) | ((data & 0xff00) << 16)
      else v.st = (v.st & 0xff00ffff) | ((data & 0x00ff) << 16) end
    elseif r == 0x03 then
      if hi then v.st = (v.st & 0xffff00ff) | (data & 0xff00) end
    elseif r == 0x04 then
      if hi then v.en = (v.en & 0x00ffffff) | ((data & 0xff00) << 16)
      else v.en = (v.en & 0xff00ffff) | ((data & 0x00ff) << 16) end
    elseif r == 0x05 then
      if hi then v.en = (v.en & 0xffff00ff) | (data & 0xff00) end
    elseif r == 0x07 then
      if not hi then v.vol = data & 0xff end
    elseif r == 0x0c then
      if hi then v.pan = (data >> 8) & 0xff end
    elseif r == 0x0e then
      if hi then snd.active = (data >> 8) & 0x1f end
    elseif r == 0x11 then
      if hi then v.saddr = (data >> 8) & 0xff end
    elseif r == 0x4f then
      if not hi then snd.osc = (data & 0xff) % (1 + snd.active) end
    elseif r == 0x10 then
      if hi and ((data >> 8) & 0xff) == 0 then
        snd.keyons = snd.keyons + 1
        -- read_sample(): addr = (saddr<<20) | ((acc>>12) & 0xfffff)
        local sb = ((v.saddr << 20) | ((v.st >> 12) & 0xfffff)) & 0xffffff
        local eb = ((v.saddr << 20) | ((v.en >> 12) & 0xfffff)) & 0xffffff
        local fmt = "16bit"
        if (v.conf & 0x01) ~= 0 then fmt = "ulaw"
        elseif (v.conf & 0x04) ~= 0 then fmt = "8bit" end
        if snd.fkey then
          snd.fkey:write(string.format(
            "%d\t%d\t%d\t%d\t%02X\t%s\t%d\t%04X\t%06X\t%06X\t%d\t%02X\t%02X\t%02X\t%d\t%d\n",
            snd.keyons, SCR:frame_number(), lf, snd.osc, v.conf, fmt,
            (v.conf >> 3) & 1, v.fc, sb, eb, eb - sb, v.vol, v.pan, v.saddr,
            snd.lastdoor, snd.regw))
        end
      end
    end
  end
  TAPS[#TAPS + 1] = Z80.spaces["io"]:install_write_tap(0x8000, 0x8003, "icsw",
    function(offset, data, mask)
      local port = offset & 3
      snd.regw = snd.regw + 1
      if port == 1 then snd.reg_select = data & 0xff
      elseif port == 2 then reg_write(data & 0xff, false)
      elseif port == 3 then reg_write((data & 0xff) << 8, true) end
      -- EVERY register write, in order, with the voice it applied to. This is
      -- what a keyon-time snapshot cannot give you, and it is what the 17
      -- end<=start samples need.
      if snd.fics and port >= 1 then
        snd.fics:write(string.format("%d\t%d\t%d\t%d\t%02X\t%s\t%02X\n",
          snd.regw, SCR:frame_number(), lf, snd.osc, snd.reg_select,
          port == 1 and "sel" or (port == 2 and "lo" or "hi"), data & 0xff))
      end
      return data
    end)
end

-- (4) RTC census.  The board carries a V3021 that MAME feeds from the HOST
--     clock, which is the one unclosed determinism risk in the corpus.  Count
--     every 68k access to $C00000-$C0000D with PC attribution.
if RTCWATCH then
  cen.rtcpcs, cen.rtcbytes = {}, {}
  TAPS[#TAPS + 1] = PROG:install_read_tap(0xc00000, 0xc0000d, "rtc",
    function(offset, data)
      cen.rtcreads = cen.rtcreads + 1
      bump(cen.rtcpcs, (CPU.state["CURPC"].value & 0xffffff) | (offset << 24))
      -- The DATA, not just the count. The date-change experiment (pgm.py rtc,
      -- TZ +14 vs -12) is only evidence if the two runs demonstrably read
      -- DIFFERENT bytes out of the calendar; otherwise "identical traces" could
      -- just mean MAME's CRT ignored TZ.
      if offset == 0xc00006 and #cen.rtcbytes < 40 then
        cen.rtcbytes[#cen.rtcbytes + 1] = string.format("%04X", data & 0xffff)
      end
      return data
    end)
end

-- ---------------------------------------------------------------- lifecycle
if OUTPATH then
  out = io.open(OUTPATH, "wb")
  if not out then p("OUT_OPEN_FAILED path=[%s]", tostring(OUTPATH)) end
  out:write(table.concat(COLS, "\t"), "\n")
end
p("cols=%s", table.concat(COLS, ","))
p("refresh_hz=%.9f frame_attos=%d cycles_per_frame=%d",
  1e18 / SCR.refresh_attoseconds, SCR.refresh_attoseconds,
  math.floor(SCR.refresh_attoseconds / 1e18 * 20000000 + 0.5))

-- THE MACHINE PIN.  The bytes the 68000 executes are NOT the bytes in the ROM
-- file -- init_ddp3() decrypts :maincpu in place at init -- so the only honest
-- fingerprint of "what this run executed" is taken from the running machine.
-- The ROM directory and the tools tree were both edited by other agents DURING
-- wave 0 and archives were renamed mid-session; printing this on every run is
-- how a cross-session number stops being trustworthy loudly instead of quietly.
do
  local rg = M.memory.regions[":maincpu"]
  local h = 0xcbf29ce484222325
  for a = 0, rg.size - 8, 8 do h = (h ~ rg:read_i64(a)) * 0x100000001b3 end
  p("MACHINE romname=%s maincpu_size=%d maincpu_fnv64=%016X",
    emu.romname and emu.romname() or "?", rg.size, h & 0xffffffffffffffff)
end

local function hist(t)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks)
  local o = {}
  for _, k in ipairs(ks) do o[#o + 1] = string.format("%s:%d", k, t[k]) end
  return table.concat(o, " ")
end

local function finish()
  if out then out:close() end
  -- ------------------------------------------------------------------------
  -- THE LAG CENSUS -- standard output of every run, never optional.  A frame
  -- with irq6 > 1 spanned more than one video frame (case B dilation); a frame
  -- with rel == 0 had the IRQ6 (A) gate fire and its four subroutines skipped;
  -- sem tells the divider path apart from an overrun (2 or 3 = a SCHEDULED
  -- 29.6/19.7 Hz cadence, not slowdown).
  -- ------------------------------------------------------------------------
  p("CENSUS logicframes=%d videoframes=%d", lf, SCR:frame_number())
  p("CENSUS irq6_per_logicframe %s", hist(cen.irq6hist))
  p("CENSUS releases_per_logicframe %s", hist(cen.relhist))
  p("CENSUS armed_vblanks %s", hist(cen.semhist))
  p("CENSUS spanned_gt1_videoframe=%d gated_zero_release=%d",
    cen.spanned, cen.relhist[0] or 0)
  p("CENSUS work_cycles min=%d max=%d budget=337920 over_budget=%d",
    cen.minwork == math.huge and -1 or cen.minwork, cen.maxwork, cen.over)
  if METER then p("CENSUS spin_iters_bucketed500 %s", hist(cen.spinhist)) end
  p("CENSUS max_sprite_entries=%d", cen.maxspr)
  -- THE CAP, MEASURED RATHER THAN ASSUMED.  sprite_queue_high_water is the
  -- largest value $23D73E ever wrote into $80AFC0, in BYTES; /12 is records
  -- against the 251-record cap ($BC4).  queue_full_events counts executions of
  -- $23D75A, i.e. the number of times the game actually hit the cap and
  -- abandoned every remaining sprite bucket for that frame.
  p("CENSUS sprite_queue_high_water=$%X (%d of 251 records) queue_full_events=%d "
    .. "buckets_cut[%s]", cen.sprqmax, cen.sprqmax // 12, cen.sprfull,
    hist(cen.sprfullbucket))
  if PORTIN then p("CENSUS input_port_reads_per_logicframe %s", hist(cen.portinhist)) end
  p("CENSUS stack_guard_hits=%d below_$%06X %s", cen.guard, STACK_GUARD_LO,
    hist(cen.guardpcs))
  if OBJ_BASE then
    -- THE (C) DETECTOR.  If object_slots_processed is the live-slot count on
    -- every frame, the game does not truncate its object loop.  If it varies
    -- with load INDEPENDENTLY of objlive, it does, and the port needs a budget
    -- and an early exit in its first commit (docs/knowledge/06 rule 3).
    p("CENSUS object_slots_processed %s", hist(cen.objhist))
    p("CENSUS object_slots_live %s", hist(cen.objlivehist))
  end
  -- bg_scale: printed on EVERY run, whether or not anything looked wrong. A
  -- watch whose output is only shown when it trips is a watch nobody can tell
  -- from a watch that was never installed.
  p("CENSUS bg_scale writes=%d non_0210=%d values_written[%s] values_seen_per_frame[%s]",
    bgscale.writes, bgscale.bad, hist(bgscale.vals), hist(bgscale.seen))
  if bgscale.bad > 0 then p("CENSUS bg_scale_bad_pcs %s", hist(bgscale.pcs)) end
  if GFXDIR then p("CENSUS gfx_dumps=%d dir=%s", gfx_n, GFXDIR) end
  if snd then
    -- THE Z80 PROGRAM BLOB.  The Z80 has 64 KiB of RAM and no ROM, so whatever
    -- is in that RAM now was uploaded from the 68k ROM. Dump it, then take a
    -- needle out of it and search the DECRYPTED :maincpu region -- which is
    -- what the 68000 actually executes, and is not the same bytes as the ROM
    -- file (init_ddp3() decrypts in place). No model of the 68k->Z80 lane
    -- mapping is needed, and none is assumed.
    local ZR = M.memory.shares[":z80_mainram"]
    local fz = io.open(SOUNDDIR .. "/z80ram.bin", "wb")
    local nz, chunk = 0, {}
    for a = 0, ZR.size - 1 do
      local b = ZR:read_u8(a)
      if b ~= 0 then nz = nz + 1 end
      chunk[#chunk + 1] = string.char(b)
      if #chunk == 4096 then if fz then fz:write(table.concat(chunk)) end; chunk = {} end
    end
    if fz then
      if #chunk > 0 then fz:write(table.concat(chunk)) end
      fz:close()
    end
    -- Where the blob came from is answered OFFLINE, in pgm.py: dump the
    -- DECRYPTED :maincpu region (what the 68000 actually executes -- init_ddp3()
    -- decrypts in place, so the ROM FILE is the wrong bytes to search) and let
    -- Python search it under three models: a verbatim copy, and each of the two
    -- byte lanes of a 16-bit window. Doing it here would be a Lua loop over
    -- 6 MiB per model.
    local rg = M.memory.regions[":maincpu"]
    local fr = io.open(SOUNDDIR .. "/maincpu.bin", "wb")
    if fr then
      local t = {}
      for a2 = 0, rg.size - 1 do
        t[#t + 1] = string.char(rg:read_u8(a2))
        if #t == 65536 then fr:write(table.concat(t)); t = {} end
      end
      if #t > 0 then fr:write(table.concat(t)) end
      fr:close()
    end
    p("CENSUS sound doorbells=%d z80_window_writes=%d ics_reg_writes=%d keyons=%d",
      snd.doors, snd.z80w, snd.regw, snd.keyons)
    p("CENSUS sound z80ram_nonzero=%d of %d maincpu_dumped=%d",
      nz, ZR.size, rg.size)
    for _, f in ipairs({snd.fmail, snd.fics, snd.fkey}) do
      if f then f:close() end
    end
  end
  if HARVEST then
    local fh = io.open(HARVEST, "wb")
    if fh then
      fh:write("offs\twidth\theight\tcolor\tfirst_lf\tdraws\n")
      for k, v in pairs(harvest) do
        fh:write(k:gsub(",", "\t"), "\t", v[1], "\t", v[2], "\n")
      end
      fh:close()
      p("CENSUS sprite_harvest distinct=%d logicframes=%d path=%s",
        harvest_n, lf, HARVEST)
    else
      p("FAIL sprite harvest could not open [%s]", tostring(HARVEST))
    end
  end
  if ZC_START then
    p("CENSUS zoomcov batches_written=%d of %d combos=%d",
      zc.batch, zc.nbatch, zc.combos and #zc.combos or 0)
  end
  p("CENSUS build_by_armpc_top_nibble %s", hist(cen.buildhist))
  p("CENSUS armpc %s", hist(cen.armhist))
  p("CENSUS halt_loop_interrupts=%d", cen.halted)
  if RTCWATCH then
    p("CENSUS rtc_reads=%d", cen.rtcreads)
    p("CENSUS rtc_first_bytes_at_C00006=%s", table.concat(cen.rtcbytes, " "))
    for k, v in pairs(cen.rtcpcs or {}) do
      p("CENSUS rtc_site off=%02X pc=%06X n=%d", k >> 24, k & 0xffffff, v)
    end
  end

  -- ------------------------------------------------------------------------
  -- BOOT ASSERTIONS.  Runs have produced clean, stable, plausible numbers from
  -- a machine halted on "ROM ERROR !" and from the board's INPUT TEST screen,
  -- both exiting 0.  Exit codes prove nothing here, so the probe asserts on its
  -- own output and says FAIL loudly.  pgm.py turns FAIL into a non-zero exit.
  -- ------------------------------------------------------------------------
  local fails = {}
  if lf == 0 then
    fails[#fails + 1] = "no logic frame completed: the game never armed $803940"
  end
  if cen.halted > 0 then
    fails[#fails + 1] = string.format(
      "%d interrupts were taken inside the $13C398 'ROM ERROR !' halt loop", cen.halted)
  end
  if cen.maxspr == 0 then
    fails[#fails + 1] = "the sprite display list was EMPTY on every frame"
  end
  if cen.guard > 0 then
    fails[#fails + 1] = string.format(
      "%d writes landed BELOW the dead-stack boundary $%06X: d_ram now contains "
      .. "stack noise and the boundary must be re-measured", cen.guard, RAM_LEN + 0x800000)
  end
  -- THE bg_scale ESCALATION.  PLAN-vertical-slice.md §6 item 8 excludes
  -- bg_scale != 100 % from the slice precisely because MAME cannot render it;
  -- the deal was that we WATCH for a write and escalate loudly. This is that.
  -- Two different things, and lumping them together makes the watch useless:
  --   (a) the register was non-0x210 AT A SAMPLE POINT, or was written non-0x210
  --       after the game's first logic frame -> the emulator is rendering a
  --       frame we compare against with a feature it does not implement. FAIL.
  --   (b) it was written non-0x210 only BEFORE the first logic frame, i.e. by
  --       the PGM BIOS during boot, and read back 0x210 on every sampled frame.
  --       MAME is still wrong on those boot frames, and that is worth saying
  --       out loud on every run -- but nothing in the corpus compares them, so
  --       it is a WARN, not a FAIL. MEASURED on the gate scenario: 2 writes of
  --       0x0610 from PC $0065E2 (inside the 512 KiB ddp3_bios.u37), both at
  --       lf=0, and 0x0210 on all 2,600 sampled logic frames.
  local seen_bad = 0
  for k, n in pairs(bgscale.seen) do if k ~= "0210" then seen_bad = seen_bad + n end end
  if seen_bad > 0 or (bgscale.after_first_lf or 0) > 0 then
    fails[#fails + 1] = string.format(
      "bg_scale was non-0x210 (100%%) on %d sampled logic frame(s) and written "
      .. "non-0x210 %d time(s) after the first logic frame: values written [%s] "
      .. "from PC(s) [%s], values seen per frame [%s]. MAME DOES NOT IMPLEMENT "
      .. "THIS REGISTER (igs023_video.cpp:193 'TODO: not implemented, unknown "
      .. "algorithm'), so every pixel comparison on such a frame is against an "
      .. "emulator that lacks the feature -- the ORACLE is wrong there, not the "
      .. "port. Escalate; do not suppress.",
      seen_bad, bgscale.after_first_lf or 0, hist(bgscale.vals),
      hist(bgscale.pcs), hist(bgscale.seen))
  elseif bgscale.bad > 0 then
    p("WARN bg_scale was written non-0x210 %d time(s) BEFORE the first logic "
      .. "frame (values [%s], PC(s) [%s]) and read 0x210 on every sampled frame. "
      .. "Those BOOT frames are rendered by MAME without a feature the hardware "
      .. "has; nothing in the corpus compares them. Not suppressed, not fatal.",
      bgscale.bad, hist(bgscale.vals), hist(bgscale.pcs))
  end
  if snd and (snd.doors == 0 or snd.keyons == 0) then
    fails[#fails + 1] = string.format(
      "PROBE_SOUND was set but the run produced %d doorbell(s) and %d keyon(s): "
      .. "an empty sound map is a FAILED run, not an empty game",
      snd.doors, snd.keyons)
  end
  if GFXDIR and gfx_n == 0 then
    fails[#fails + 1] = "PROBE_GFX was set but NOT ONE frame was dumped: the "
      .. "logic frames in PROBE_GFXAT were never reached, or the directory is "
      .. "not writable"
  end
  if ZC_START and zc.nbatch > 0 and zc.batch < zc.nbatch then
    fails[#fails + 1] = string.format(
      "zoom coverage ran out of frames: %d of %d batches written. The run needs "
      .. "at least %d more logic frames.", zc.batch, zc.nbatch,
      (zc.nbatch - zc.batch) * 2 + 10)
  end
  if WANT_BUILD then
    local want = (WANT_BUILD == "B") and 2 or 1
    local wrong = 0
    for b, n in pairs(cen.buildhist) do if b ~= want then wrong = wrong + n end end
    p("BUILD required=%s frames_on_required=%d frames_on_other=%d",
      WANT_BUILD, cen.buildhist[want] or 0, wrong)
    if (cen.buildhist[want] or 0) == 0 then
      fails[#fails + 1] = "NOT ONE logic frame ran in the required build " .. WANT_BUILD
    end
    -- The chooser itself runs from build A's code, so "some frames were in B"
    -- is not enough: the run must still be in the required build when it ends,
    -- or a scenario that fell back to VERSION-A after the countdown would pass.
    if cen.lastbuild ~= want then
      fails[#fails + 1] = string.format(
        "the LAST logic frame armed from build %d, not the required %s", cen.lastbuild or -1, WANT_BUILD)
    end
  end
  for _, f in ipairs(fails) do p("FAIL %s", f) end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), #fails)
  M:exit()
end

-- PROBE_NOSPRITES=1 -- RED VALIDATION FOR THE PIXEL LAYER.  Clear bit 0 of the
-- IGS023 control register $B0E000, which is the sprite-DMA enable
-- (igs023_video.cpp sprite_dma(): `if (BIT(~m_ctrl,0)) return false;`).  The
-- game's RAM is untouched, so every RAM digest must stay IDENTICAL while the
-- framebuffer loses its entire sprite layer.  If `pix` does not change, the
-- pixel column is not dense enough to notice a missing sprite layer and the
-- wave-6 pixel gate would pass on a blank screen.
local NOSPRITES = os.getenv("PROBE_NOSPRITES") == "1"

-- ---------------------------------------------------------------- injection
-- Writing the trampoline into the DECRYPTED :maincpu region.  It is written
-- once, before anything can execute it; the main loop's `jsr` operand is
-- repointed only when logic frame INJ_FROM is reached, so every frame before
-- that is bit-for-bit an unpatched run.  Nothing is written to the game's RAM.
local REGION = M.memory.regions[":maincpu"]
local inj_installed, inj_armed = false, false
local inj_target = 0
local function inj_write_trampoline()
  inj_target = REGION:read_u32(INJ_SITE + 2)      -- the call's original target
  if INJ_PAD + 2 * INJ_NOPS + 6 > 0x400000 then
    p("FAIL injection sled runs past the ROM window $3FFFFF (nops=%d)", INJ_NOPS)
    return
  end
  for i = 0, INJ_NOPS - 1 do
    REGION:write_u16(INJ_PAD + 2 * i, 0x4E71)     -- nop, 4 cycles, no side effect
  end
  local j = INJ_PAD + 2 * INJ_NOPS
  REGION:write_u16(j, 0x4EF9)                     -- jmp <original>.l
  REGION:write_u16(j + 2, (inj_target >> 16) & 0xffff)
  REGION:write_u16(j + 4, inj_target & 0xffff)
  p("INJECT sled at $%06X nops=%d jmp_at=$%06X site=$%06X original_target=$%06X "
    .. "added_cycles=%d budget=337920", INJ_PAD, INJ_NOPS, j, INJ_SITE,
    inj_target, INJ_NOPS * 4 + 12)
  inj_installed = true
end
local function inj_arm()
  REGION:write_u32(INJ_SITE + 2, INJ_PAD)
  inj_armed = true
  p("INJECT armed at lf=%d vf=%d: $%06X now calls $%06X",
    lf, SCR:frame_number(), INJ_SITE, INJ_PAD)
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if os.getenv("PROBE_INJECT") then
    if not inj_installed then inj_write_trampoline() end
    if not inj_armed and lf >= INJ_FROM then inj_arm() end
  end
  if NOSPRITES then
    PROG:write_u16(0xb0e000, PROG:read_u16(0xb0e000) & 0xfffe)
  end
  if LOAD_PATH and not loaded then
    loaded = true
    local fh = io.open(LOAD_PATH, "rb")
    if fh then
      local buf = fh:read("a"); fh:close()
      M:buffer_load(buf)
      p("LOADED bytes=%d at vf=%d", #buf, SCR:frame_number())
    else p("LOAD_FAILED %s", LOAD_PATH) end
  end
  if save_pending then
    save_pending = false
    local buf = M:buffer_save()
    local fh = io.open(SAVELF_PATH, "wb")
    if fh then fh:write(buf); fh:close()
      p("SAVED_AT_SAMPLEPOINT lf=%d vf=%d bytes=%d path=%s", lf, SCR:frame_number(), #buf, SAVELF_PATH)
    else p("SAVE_OPEN_FAILED path=[%s]", tostring(SAVELF_PATH)) end
  end
  if SAVE_VF and SCR:frame_number() == SAVE_VF then
    local buf = M:buffer_save()
    local fh, oerr = io.open(SAVE_PATH, "wb")
    if not fh then p("SAVE_OPEN_FAILED path=[%s] err=%s", SAVE_PATH, tostring(oerr))
    else fh:write(buf); fh:close()
      p("SAVED vf=%d lf=%d bytes=%d", SCR:frame_number(), lf, #buf) end
  end
  -- The synthetic zoom table: written on EVERY tick from the first, so that no
  -- frame in the run sees a table change (see the ZC_SYNTH note above).
  if ZC_SYNTH_ON then
    for z = 0, 15 do
      ZOOM:write_u16(z * 4,     (ZC_SYNTH[z + 1] >> 16) & 0xffff)
      ZOOM:write_u16(z * 4 + 2,  ZC_SYNTH[z + 1] & 0xffff)
    end
  end
  if GFXDIR and gfx_pending > 0 then
    gfx_pending = gfx_pending - 1
    local ok, e = pcall(gfx_dump)
    if not ok then p("LUA_ERROR gfx_dump %s", tostring(e)) end
  end
  if lf >= RUN and not done then done = true; finish() end
end)
