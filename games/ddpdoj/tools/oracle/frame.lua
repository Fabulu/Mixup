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

-- ---------------------------------------------------------------- state
local lf, vf = 0, 0
local irq4, irq6, rel, spin = 0, 0, 0, 0
local prev_t, rel_t = 0, 0
local out, done = nil, false
-- census (the lag census the plan requires in EVERY scenario's output)
local cen = { irq6hist = {}, relhist = {}, spinhist = {}, buildhist = {},
              armhist = {}, semhist = {}, maxspr = 0, halted = 0, rtcreads = 0,
              minwork = math.huge, maxwork = 0, over = 0, spanned = 0,
              objhist = {}, objlivehist = {}, guard = 0, guardpcs = {} }
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- object-driver accumulators, reset at every sample point
local objn, objord = 0, 0xcbf29ce484222325

local COLS = {"lf", "vf", "cyc", "work", "spin", "irq4", "irq6", "rel",
              "build", "armpc", "sprites", "objn", "objord", "objlive",
              "d_spr", "d_ram", "d_date", "d_top", "d_pal", "d_spb", "d_bg", "d_tx", "pix"}
for _, n in ipairs(NAMED) do COLS[#COLS + 1] = n[1] end

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
  local line = table.concat(r, "\t")
  if out then out:write(line, "\n") else p("ROW %s", line) end
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
    local ok, e = pcall(emit, pc)
    if not ok then p("LUA_ERROR emit %s", tostring(e)) end
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
  if lf >= RUN and not done then done = true; finish() end
end)
