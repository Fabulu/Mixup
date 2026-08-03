-- w25handler.lua -- WAVE 25: the six enemy handlers' DYNAMIC verdict.  Records
-- EVERY live enemy whose handler is one of the six
-- ($2688CC/$26A2E2/$2747C6/$269CEA/$27687E/$268232) -- its sub-record position
-- (($2,A6)/($4,A6)) at the pre-handler point every frame from SPAWN to DEATH,
-- plus the globals $2638A6 reads.
--
-- WHY THE PRE-HANDLER POINT.  `clr.w $815e9c` (CURPC==$263502) fires once per
-- frame AFTER the spawn walker and AFTER the previous frame's enemy driver.  So
-- the position read here is POST-(previous frame's handler): a SPAWN frame =
-- the init position (post-$263808, pre-handler); each later frame = +one
-- stepMovement.  That is the cadence the port replays (seed SPAWN, one step/P).
--
-- WHY ALL SIX.  W24 proved stepMovement for ONE $11 mover.  W25 generalises the
-- proof to all six handler types AND verifies the handlers do not corrupt
-- position (they call $2638A6 then read/copy it; the W28 hit-reaction is
-- excluded by disabling fire).
--
-- FORMAT (TSV), per tracked slot:
--   SPAWN <lf> <slot> <handler> <type> <posX> <posY> <cursor+12> <param+0a> <class+0d> <scrollOdo> <b03c> <freeze> <scroll>
--   P     <lf> <slot> <posX> <posY> <freeze> <scroll> <b03c> <heading+1b> <speed+1a> <cursor+12>
--   DEATH <lf> <slot>
-- ENV: W25_FRAMES W25_INPUT W25_TSV W25_POKE_FROM W25_FIRE_FROM W25_MOVE_FROM W25_REQUIRE_BUILD W25_MAX_TRACK
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                 -- GLOBALS (00-recon-hard: a local handle is GC'd)

local RUN       = tonumber(os.getenv("W25_FRAMES")     or "16000")
local POKE_FROM = tonumber(os.getenv("W25_POKE_FROM")  or "1250")
local FIRE_FROM = tonumber(os.getenv("W25_FIRE_FROM")  or "1800")
local MOVE_FROM = tonumber(os.getenv("W25_MOVE_FROM")  or "1900")
local WANT      = os.getenv("W25_REQUIRE_BUILD")
local TSV       = os.getenv("W25_TSV")
local MAX_TRACK = tonumber(os.getenv("W25_MAX_TRACK")  or "48")
local fh        = TSV and io.open(TSV, "w") or nil

p("SHARES sram=%d", RAM.size)

-- the six handlers (build B).  A live slot whose +$4C matches one of these is
-- tracked.  (The handler pointer is a 24-bit ROM address stored as a longword.)
local HANDLERS = {
  [0x2688CC] = 0x11, [0x26A2E2] = 0x07, [0x2747C6] = 0x82,
  [0x269CEA] = 0x05, [0x27687E] = 0x8B, [0x268232] = 0x10,
}

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local function resolve(names)
  local fs = {}
  for c in names:gmatch(".") do
    local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
    if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
  end
  return fs
end

local script, held, held_key = {}, {}, nil
for item in (os.getenv("W25_INPUT") or ""):gmatch("[^;]+") do
  local lfn, names = item:match("^(%d+)=(.*)$")
  if lfn then script[tonumber(lfn)] = names end
end

local function set_held(names)
  if names == held_key then return end
  held_key = names
  for _, f in ipairs(held) do f:set_value(0) end
  held = resolve(names)
  for _, f in ipairs(held) do f:set_value(1) end
end

local MOVE_LEGS = { "C", "CL", "C", "CR" }
local function autopilot(n)
  if n < FIRE_FROM then return nil end
  if n < MOVE_FROM then return "C" end
  return MOVE_LEGS[(math.floor((n - MOVE_FROM) / 12) % 4) + 1]
end

local function apply_input(n)
  local a = autopilot(n)
  if a then set_held(a); return end
  local s = script[n]
  if s then set_held(s) end
end

local lf, finished, lastbuild = 0, false, -1

local function r16(a) return RAM:read_u16(a - 0x800000) end
local function r8(a)  return RAM:read_u8(a - 0x800000)  end
local function r32(a)
  return (RAM:read_u16(a - 0x800000) << 16) | RAM:read_u16(a - 0x800000 + 2)
end

-- the tracked set: slot address -> true (spawns/deaths detected by presence)
local tracked, byType = {}, {}

-- ------------------------------------- THE ENEMY-DRIVER-ENTRY TAP ($263502)
TAPS[#TAPS + 1] = PROG:install_write_tap(0x815e9c, 0x815e9d, "drv",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc ~= 0x263502 then return data end
    if not fh or lf == 0 then return data end
    local clk = RAM:read_u16(0x130ce)
    local fz  = r16(0x8130d2)
    local sc  = r16(0x813172)
    local b03c= r16(0x80b03c)
    -- scan all 58 slots; track any live slot whose handler is one of the six.
    for i = 0, 57 do
      local rec = 0x81332C + i * 0x50
      local tw  = r16(rec)
      local live = (tw ~= 0)
      local wasTracked = tracked[rec] ~= nil
      if live then
        local handler = r32(rec + 0x4c) & 0xffffff
        if HANDLERS[handler] then
          if not wasTracked then
            -- SPAWN.  Capture the init state: position (post-$263808), the
            -- movement cursor (+$12), the spawn param (+$0A), the class byte
            -- (+$0D), the scroll-odometer $8130D0, and the cross-axis comp.
            local sub = r32(rec + 0x06)
            local ntracked = 0
            for _ in pairs(tracked) do ntracked = ntracked + 1 end
            if ntracked < MAX_TRACK then
              tracked[rec] = handler
              byType[handler] = (byType[handler] or 0) + 1
              fh:write(string.format(
                "SPAWN\t%d\t%06X\t%06X\t%02X\t%04X\t%04X\t%08X\t%04X\t%02X\t%04X\t%04X\t%04X\t%04X\n",
                lf, rec, handler, HANDLERS[handler], r16(sub+0x02), r16(sub+0x04),
                r32(rec + 0x12), r16(rec + 0x0a), r8(rec + 0x0d), r16(0x8130d0),
                b03c, fz, sc))
            end
          else
            -- alive another frame: emit the position row.
            local sub = r32(rec + 0x06)
            fh:write(string.format(
              "P\t%d\t%06X\t%04X\t%04X\t%04X\t%04X\t%04X\t%02X\t%02X\t%08X\n",
              lf, rec, r16(sub+0x02), r16(sub+0x04), fz, sc, b03c,
              r8(sub + 0x1b), r8(sub + 0x1a), r32(rec + 0x12)))
          end
        end
      elseif wasTracked then
        -- the slot was freed: DEATH.
        fh:write(string.format("DEATH\t%d\t%06X\n", lf, rec))
        tracked[rec] = nil
      end
    end
    return data
  end)

-- the sample-point semaphore (W17/W22/W24) advances `lf` and applies input.
local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf
      apply_input(lf)
      if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end
    end
    return data
  end)

local function finish()
  local ntracked = 0
  for _ in pairs(tracked) do ntracked = ntracked + 1 end
  p("STAGE lf=%d stillTracked=%d", lf, ntracked)
  for h, n in pairs(byType) do p("  byType $%06X spawned=%d", h, n) end
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  if fh then fh:close() end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if (lf >= RUN) and not finished then finished = true; finish() end
end)
