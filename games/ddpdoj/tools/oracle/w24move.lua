-- w24move.lua -- WAVE 24: the movement interpreter's DYNAMIC verdict.  Picks the
-- FIRST type-$11 spawn after stage start and records its sub-record position
-- (($2,A6)/($4,A6)) at the pre-handler point every frame from SPAWN to DEATH,
-- plus the globals $2638A6 reads ($8130D2 freeze; $813172 scroll for ESC#9).
--
-- WHY THE PRE-HANDLER POINT.  `clr.w $815e9c` (CURPC==$263502) fires once per
-- frame AFTER the spawn walker and AFTER the previous frame's enemy driver.  So
-- the position read here is POST-(previous frame's handler): spawn frame = the
-- init position (post-$263808, pre-handler); each later frame = +one stepMovement.
-- That is exactly the cadence the port replays (init, then one step/frame).
--
-- WHY TYPE $11.  Its handler $2688CC calls `jsr $2638A6` and otherwise only
-- READS position ($2688D2) or copies it elsewhere ($26895E -> A0, a child); it
-- never writes ($2/$4,A6).  So a $11 mover's position is ENTIRELY $2638A6's
-- output (+ the globals), and an interpreter-only replay must match at 0.
--
-- FORMAT (TSV): P <lf> <clk> <posX> <posY> <freeze> <scroll> <streamPtr>
--               SPAWN <lf> <streamPtr> <posX> <posY>   (the first row, once)
-- ENV: W24_FRAMES W24_INPUT W24_TSV W24_POKE_FROM W24_FIRE_FROM W24_MOVE_FROM W24_REQUIRE_BUILD
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                 -- GLOBALS (00-recon-hard: a local handle is GC'd)

local RUN       = tonumber(os.getenv("W24_FRAMES")     or "16000")
local POKE_FROM = tonumber(os.getenv("W24_POKE_FROM")  or "1250")
local FIRE_FROM = tonumber(os.getenv("W24_FIRE_FROM")  or "1800")
local MOVE_FROM = tonumber(os.getenv("W24_MOVE_FROM")  or "1900")
local WANT      = os.getenv("W24_REQUIRE_BUILD")
local TSV       = os.getenv("W24_TSV")
local fh        = TSV and io.open(TSV, "w") or nil

p("SHARES sram=%d", RAM.size)

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
for item in (os.getenv("W24_INPUT") or ""):gmatch("[^;]+") do
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

local lf, done, finished, lastbuild = 0, false, false, -1

-- --------------------------------------------- THE ALLOCATOR CLAIM TAP (W22)
local CLAIM_PC  = 0x26371A
local ENEMY_LO  = 0x81332C
local ENEMY_HI  = 0x81454B
local claimed_slots = {}             -- full addresses of slots claimed this lf

TAPS[#TAPS + 1] = PROG:install_write_tap(ENEMY_LO, ENEMY_HI, "claim",
  function(offset, data, mask)
    if (CPU.state["CURPC"].value & 0xffffff) ~= CLAIM_PC then return data end
    claimed_slots[#claimed_slots + 1] = offset
    return data
  end)

local function r16(a) return RAM:read_u16(a - 0x800000) end
local function r8(a)  return RAM:read_u8(a - 0x800000)  end
local function r32(a)
  return (RAM:read_u16(a - 0x800000) << 16) | RAM:read_u16(a - 0x800000 + 2)
end

-- the SUBJECT: first type-$11 claimed after the stage starts.  Its sub-record
-- addr, record addr, and spawn frame are fixed once; we follow it to death.
local subject, subjectRec, spawnLf, subjectStream, subjectParam, spawnScrollOdo

local function pick_subject(clk)
  for _, slot in ipairs(claimed_slots) do
    local typew = r16(slot)
    if typew ~= 0 then
      local typ = r8(slot + 0x0c)
      if typ == 0x11 then
        subjectRec = slot
        subject    = r32(slot + 0x06)      -- sub-record pointer
        subjectStream = r32(slot + 0x12)   -- movement cursor (resolved stream ptr)
        subjectParam  = r16(slot + 0x0a)   -- the spawn param (the Y-odometer source)
        spawnScrollOdo = r16(0x8130d0)     -- the Y-odometer base at spawn
        spawnLf    = lf
        return true
      end
    end
  end
  return false
end

local function emit_row(lf, clk, tag)
  local x = r16(subject + 0x02)
  local y = r16(subject + 0x04)
  local fz = r16(0x8130d2)
  local sc = r16(0x813172)
  local b03c = r16(0x80b03c)           -- the cross-axis scroll comp $24179E reads
  local hdg = r8(subject + 0x1b)       -- the heading byte (handler may change it)
  local spd = r8(subject + 0x1a)       -- the speed byte (the $200920 index)
  local cur = r32(subjectRec + 0x12)   -- the movement cursor (advances iff p!=0)
  fh:write(string.format("%s\t%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%08X\t%04X\t%02X\t%02X\t%08X\n",
    tag, lf, clk, x, y, fz, sc, subjectStream or 0, b03c, hdg, spd, cur))
end

local function emit_spawn(lf, clk)
  -- the SPAWN row carries the extra fields the init reader needs: the spawn
  -- param (+$0A), the scroll-odometer $8130D0, and the class byte (+$0D) -- bit 0
  -- gates the per-frame scroll compensation $24179E inside $2638A6.
  local x = r16(subject + 0x02)
  local y = r16(subject + 0x04)
  fh:write(string.format(
    "SPAWN\t%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%08X\t%04X\t%04X\t%02X\t%04X\n",
    lf, clk, x, y, r16(0x8130d2), r16(0x813172), subjectStream or 0,
    subjectParam or 0, spawnScrollOdo or 0, r8(subjectRec + 0x0d), r16(0x80b03c)))
end

-- ------------------------------------- THE ENEMY-DRIVER-ENTRY TAP ($263502)
TAPS[#TAPS + 1] = PROG:install_write_tap(0x815e9c, 0x815e9d, "drv",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc ~= 0x263502 then return data end
    if not fh or lf == 0 then claimed_slots = {}; return data end
    local clk = RAM:read_u16(0x130ce)
    if not subject then
      -- pick the first $11 spawned once stage 1 is underway (clk past the open)
      if clk > 0x20 then pick_subject(clk) end
      if subject then
        p("SUBJECT $11 slot=$%06X sub=$%06X stream=$%06X param=$%04X odo=$%04X at lf=%d clk=%X",
          subjectRec, subject, subjectStream, subjectParam, spawnScrollOdo, lf, clk)
        emit_spawn(lf, clk)
      end
    else
      -- subject chosen: record its position this frame (post-previous-handler).
      -- If the slot's type word is clear, the enemy died last frame -> stop.
      if r16(subjectRec) == 0 then
        p("DEATH at lf=%d (slot freed)", lf)
        done = true
      else
        emit_row(lf, clk, "P")
      end
    end
    claimed_slots = {}
    return data
  end)

-- the sample-point semaphore (W17/W22) advances `lf` and applies input.
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
  p("STAGE lf=%d subjectFrames=%s", lf, subject and "yes" or "NO $11 SUBJECT")
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if not subject then p("FAIL no type-$11 subject captured"); fails = fails + 1 end
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
  if (lf >= RUN or done) and not finished then finished = true; finish() end
end)
