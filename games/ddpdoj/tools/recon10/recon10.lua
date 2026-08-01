-- recon10.lua -- RECON 10: the enemy subsystem, measured.
--
-- Wave 5 enumerated FIVE enemy handlers by census over `stage1-open` and wrote
-- "the enumeration is scenario-bounded: a longer scenario may find a sixth".
-- The static read (tools/recon10/types.py) says stage 1's spawn script names
-- NINETEEN distinct handlers.  This probe is the runtime side of that claim,
-- and the measurement of the AIM.
--
-- HOOKS -- all WRITE taps, because on the 68000 a read tap only proves prefetch
-- and CURPC does not identify an opcode fetch (00-recon-hard.md 3).
--
--   $26352E  sub.w D0,($4,A6)     once per LIVE enemy, A5 = the record
--   $263728  move.b D0,($c,A0)    once per SUCCESSFUL enemy allocation
--   $263674  clr.w (A5)           spawn ABORTED: no free sub-record run
--   $241FEE  move.b D1,($1b,A6)   THE AIM: the 6-bit direction just computed
--                                 by $24202C from the LIVE player record
--   $289032  move.w D0,(A0)       an ENEMY BULLET allocated ($81B732, 80x$38)
--   $803940                       the sample point (frame.lua's own keying)
--
-- Tap handles and notifier subscriptions live in GLOBALS or they are GC'd and
-- silently stop firing.
--
-- ENV: R10_FRAMES R10_INPUT R10_REQUIRE_BUILD R10_AIMTSV R10_TIMETSV
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN  = tonumber(os.getenv("R10_FRAMES") or "3000")
local WANT = os.getenv("R10_REQUIRE_BUILD")
local AIMF = os.getenv("R10_AIMTSV")
local TIMF = os.getenv("R10_TIMETSV")
POKE_FROM = tonumber(os.getenv("R10_POKE_FROM") or "0")

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("R10_INPUT") or ""):gmatch("[^;]+") do
  local lf, names = item:match("^(%d+)=(.*)$")
  if lf then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(lf)] = fs
  end
end
local function apply_input(lf)
  local fs = script[lf]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

local lf, done, lastbuild = 0, false, -1
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

local en_handlers, en_types, en_bands, en_flags = {}, {}, {}, {}
local en_pf, en_maxpf, en_perframe = 0, 0, {}
local sp_types, sp_bands, sp_abort, sp_n = {}, {}, 0, 0
local bul_n, aim_n = 0, 0
local mismatch = {}           -- handler != static table[type]
local clock_first = {}        -- first logic frame each wave-clock value was seen
local aimrows = {}

-- the static type table, read from the image the CPU is executing
local function typerec(t)
  local base = (t < 0x80) and 0x267824 or 0x27E412
  local off = base + (t % 0x80) * 8
  return PROG:read_u32(off), PROG:read_u32(off + 4)
end

-- (1) per LIVE enemy
TAPS[#TAPS + 1] = PROG:install_write_tap(0x813000, 0x81FDFF, "en", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc ~= 0x26352E then return data end
  local a5 = CPU.state["A5"].value & 0xffffff
  local rec = a5 - 0x800000
  local h = RAM:read_u32(rec + 0x4c) & 0xffffff
  local t = RAM:read_u8(rec + 0x0c)
  bump(en_handlers, string.format("%06X", h))
  bump(en_types, string.format("%02X", t))
  bump(en_flags, string.format("%02X", RAM:read_u8(rec + 0x0d)))
  local band = (a5 >= 0x81364C) and "C_common48" or
               ((a5 >= 0x8133CC) and "B_boss8" or "A_special2")
  bump(en_bands, band)
  local _, want = typerec(t)
  if (want & 0xffffff) ~= h then
    bump(mismatch, string.format("t%02X:got%06X:want%06X", t, h, want & 0xffffff))
  end
  en_pf = en_pf + 1
  return data
end)

-- (2) successful enemy ALLOCATION ($263728 move.b D0,($c,A0)), and the two
--     failure paths.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x813300, 0x8145FF, "sp", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x263728 then
    local a0 = CPU.state["A0"].value & 0xffffff
    local t = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    bump(sp_types, string.format("%02X", t))
    bump(sp_bands, (a0 >= 0x81364C) and "C_common48" or
                   ((a0 >= 0x8133CC) and "B_boss8" or "A_special2"))
    sp_n = sp_n + 1
  elseif pc == 0x263674 then
    sp_abort = sp_abort + 1
  end
  return data
end)

-- (3) THE AIM.  $241FEE `move.b D1,($1b,A6)` stores the 6-bit direction that
--     $24202C just computed.  A6 is the sub-record being aimed; A5 is still the
--     enemy record, so ($3,A5) is the target-player index that $24270A reads.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x810000, 0x81FDFF, "aim", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc ~= 0x241FEE then return data end
  aim_n = aim_n + 1
  if #aimrows < 6000 then
    local a6 = (CPU.state["A6"].value & 0xffffff) - 0x800000
    local a5 = (CPU.state["A5"].value & 0xffffff) - 0x800000
    local ang = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    local idx = RAM:read_u8(a5 + 3)
    local p1a, p1b = RAM:read_u16(0x103e8), RAM:read_u16(0x103ea)
    local p2a, p2b = RAM:read_u16(0x1044a), RAM:read_u16(0x1044c)
    aimrows[#aimrows + 1] = string.format(
      "%d\t%06X\t%d\t%d\t%d\t%d\t%d\t%d\t%d\t%04X\t%04X",
      lf, a5 + 0x800000, ang, idx,
      RAM:read_u16(a6 + 2), RAM:read_u16(a6 + 4),
      p1a, p1b, 0, RAM:read_u16(0x103e6), RAM:read_u16(0x10448))
    -- p2 columns appended so the offline check can pick the right target
    aimrows[#aimrows] = aimrows[#aimrows] .. string.format("\t%d\t%d", p2a, p2b)
  end
  return data
end)

-- (4) enemy BULLET allocation, $289032 `move.w D0,(A0)` into $81B732.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x81B732, 0x81C8FF, "bul", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x289032 then bul_n = bul_n + 1 end
  return data
end)

-- (5) the sample point
local REL = { [0x13C806] = true, [0x23C46C] = true }
local timerows = {}
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then return data end
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
    lf = lf + 1
    lastbuild = (pc >> 20) & 0xf
    apply_input(lf)
    bump(en_perframe, en_pf); if en_pf > en_maxpf then en_maxpf = en_pf end
    en_pf = 0
    -- THE INTERVENTION, identical in shape and justification to the
    -- `fly-around` scenario's: $810424 is the player's ($3e,A6) invulnerability
    -- timer and $FF is a value the game itself writes at $2495A2.  Held at the
    -- game's own sample point so the ship survives long enough for the stage-1
    -- spawn script to reach its own terminator.  It changes WHETHER the ship
    -- dies, not what any enemy routine computes -- and every number below that
    -- depends on it says so.
    if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end
    local clk = RAM:read_u16(0x130ce)
    if clock_first[clk] == nil then clock_first[clk] = lf end
    if TIMF and (lf % 30) == 0 then
      timerows[#timerows + 1] = string.format(
        "%d\t%d\t%d\t%d\t%08X\t%d\t%d\t%04X\t%d\t%d",
        lf, clk, RAM:read_u16(0x13096), RAM:read_u16(0x15e9c),
        RAM:read_u32(0x132cc), RAM:read_u16(0x130d2), RAM:read_u16(0x13098),
        RAM:read_u16(0x103e6), RAM:read_u16(0x103e8), RAM:read_u16(0x103ea))
    end
  end
  return data
end)

local function hist(t, n)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return t[a] > t[b] end)
  local out = {}
  for i = 1, math.min(n or 40, #ks) do
    out[#out + 1] = string.format("%s:%d", ks[i], t[ks[i]])
  end
  return table.concat(out, " "), #ks
end

local function writef(path, header, rows)
  if not path then return end
  local f = io.open(path, "w")
  if not f then p("FAIL cannot open %s", path); return end
  f:write(header .. "\n")
  for _, r in ipairs(rows) do f:write(r .. "\n") end
  f:close()
  p("WROTE %s rows=%d", path, #rows)
end

local function finish()
  local s, n = hist(en_handlers, 60)
  p("ENEMY handlers dispatched: %d DISTINCT", n)
  p("ENEMY handlers %s", s)
  s, n = hist(en_types, 60);  p("ENEMY type bytes ($c,A5): %d distinct  %s", n, s)
  s, n = hist(en_flags, 20);  p("ENEMY flag bytes ($d,A5): %d distinct  %s", n, s)
  s, n = hist(en_bands, 10);  p("ENEMY bands %s", s)
  s = hist(en_perframe, 30);  p("ENEMY live per logic frame max=%d hist %s", en_maxpf, s)
  s, n = hist(sp_types, 60);  p("SPAWN types allocated: %d distinct  %s", n, s)
  s, n = hist(sp_bands, 10);  p("SPAWN bands %s  total=%d  aborted_no_subrecord=%d",
                               s, sp_n, sp_abort)
  s, n = hist(mismatch, 10)
  p("HANDLER-vs-TYPETABLE mismatches: %d distinct  %s", n, (n > 0) and s or "(none)")
  p("AIM $241FEE stores = %d", aim_n)
  p("BULLETS allocated at $289032 = %d", bul_n)
  local mx, mn = -1, 1e9
  for k in pairs(clock_first) do if k > mx then mx = k end; if k < mn then mn = k end end
  p("WAVECLOCK $8130CE range %d..%d over %d logic frames", mn, mx, lf)
  local ks = {}
  for k in pairs(clock_first) do ks[#ks + 1] = k end
  table.sort(ks)
  local first, last = ks[1], ks[#ks]
  if first and last and last > first then
    p("WAVECLOCK ticks: %d values, lf %d..%d -> %.3f logic frames per tick",
      #ks, clock_first[first], clock_first[last],
      (clock_first[last] - clock_first[first]) / (last - first))
  end
  writef(AIMF, "lf\ta5\tangle\ttgtidx\tselfA\tselfB\tp1A\tp1B\tpad\tp1w\tp2w\tp2A\tp2B", aimrows)
  writef(TIMF, "lf\tclk130ce\tstg13096\tlive15e9c\tcursor132cc\tpause130d2\trank13098\tp1w\tp1A\tp1B", timerows)
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
