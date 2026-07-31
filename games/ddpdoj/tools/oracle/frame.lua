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
local RAM_LEN   = 0x1ff00
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
              minwork = math.huge, maxwork = 0, over = 0, spanned = 0 }
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

local COLS = {"lf", "vf", "cyc", "work", "spin", "irq4", "irq6", "rel",
              "build", "armpc", "sprites",
              "d_spr", "d_ram", "d_date", "d_top", "d_pal", "d_spb", "d_bg", "d_tx", "pix"}
for _, n in ipairs(NAMED) do COLS[#COLS + 1] = n[1] end

local function emit(armpc)
  local t = M.time.attoseconds + M.time.seconds * 1000000000000000000
  -- 20 MHz 68000; the frame budget is exactly 337,920 cycles (16.896 ms, from
  -- pixclock 10 MHz / (640 x 264) = 15625/264 Hz).  Not a rounded literal.
  local cyc = math.floor((t - prev_t) / 1e18 * 20000000 + 0.5)
  -- work = cycles from the ISR6 release that started this frame to the arm that
  -- ended it: the game's own frame budget consumption, with NO extra tap.  The
  -- spin meter measures the same thing from the other side and they must sum to
  -- roughly one frame; carrying both is the cross-check.
  local work = rel_t > 0 and math.floor((t - rel_t) / 1e18 * 20000000 + 0.5) or 0
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
    digest(RAM, 0, 0xa00),           -- the sprite display list
    digest_segs(RAM, RAM_SEGS),      -- main RAM, minus the RTC date words
    digest_segs(RAM, DATE_SEGS),     -- ...which are reported here instead
    digest(RAM, RAM_LEN, 0x100),     -- the top page (dead stack), separately
    digest(PAL, 0, PAL.size), digest(SPB, 0, SPB.size),
    digest(BG, 0, BG.size), digest(TX, 0, TX.size), pix,
  }
  for _, n in ipairs(NAMED) do r[#r + 1] = RAM:read_u16(n[2] & ~1) end
  local line = table.concat(r, "\t")
  if out then out:write(line, "\n") else p("ROW %s", line) end
  irq4, irq6, rel, spin = 0, 0, 0, 0
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
  local t = M.time.attoseconds + M.time.seconds * 1000000000000000000
  if REL[pc] then rel = rel + 1; rel_t = t; return data end
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

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
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
