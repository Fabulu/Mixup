-- w23spawn.lua -- WAVE 23: the ENEMY STATS ledger.  Records, per spawn, the
-- hitbox/HP/speed/heading/palette/anim/bucket words AT SPAWN (post-init,
-- pre-handler), plus the globals the bespoke init adjustments read.
--
-- THE CAPTURE BOUNDARY.  The enemy driver $263502 is the per-frame walk that
-- calls each enemy's handler.  Its FIRST instruction is `clr.w $815e9c` (the
-- live-count clear) -- a WRITE.  At CURPC==$263502 the spawn walker has finished
-- (all this-frame spawns are initialised) and NO handler has run yet this frame,
-- so every spawned enemy holds its init-time stats fields.  That is the "AT
-- SPAWN" the done-when names.  (A sample-point read would be one handler
-- iteration later -- HP/palette could have moved.)
--
-- THE TWO TAPS:
--   (1) allocator claim tap at $26371A (CURPC, the W22 signal): records which
--       slots were claimed+initialised this frame.
--   (2) enemy-driver-entry tap: a write tap on $815e9c filtered to CURPC==
--       $263502.  For each claimed slot whose type word is still non-zero (i.e.
--       NOT freed by a stage-kill gate inside init), reads the stats fields and
--       emits an S-line; then emits one F-line with the frame's globals.  Frees
--       (type==0) are skipped on both sides.
--
-- THE FORMAT (TSV):
--   S <lf> <clk> <slotidx> <type> <flags> <hb10> <hb12> <hb14> <hb16> <hp> <spd> <hdg> <pal> <anim> <hprel> <b28> <b2A> <b2E>
--   F <lf> <clk> <g_813092> <g_813094> <g_813098> <g_8130b2> <g_8130b4> <g_8130b6> <g_8130b8> <g_8130ba> <g_8130bc> <g_8130ae> <g_8130d8> <g_803916>
--
-- ENV: W23_FRAMES W23_INPUT W23_TSV W23_POKE_FROM W23_FIRE_FROM W23_MOVE_FROM W23_REQUIRE_BUILD
--      (identical to W22 -- the two labelled interventions, so the corpora are comparable)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                 -- GLOBALS (00-recon-hard: a local handle is GC'd)

local RUN       = tonumber(os.getenv("W23_FRAMES")     or "16000")
local POKE_FROM = tonumber(os.getenv("W23_POKE_FROM")  or "1250")
local FIRE_FROM = tonumber(os.getenv("W23_FIRE_FROM")  or "1800")
local MOVE_FROM = tonumber(os.getenv("W23_MOVE_FROM")  or "1900")
local WANT      = os.getenv("W23_REQUIRE_BUILD")
local TSV       = os.getenv("W23_TSV")
local fh        = TSV and io.open(TSV, "w") or nil

p("SHARES sram=%d", RAM.size)
p("INTERVENTION invuln=$810424:=$FF from lf%d  autoshot from lf%d  move from lf%d",
  POKE_FROM, FIRE_FROM, MOVE_FROM)

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
for item in (os.getenv("W23_INPUT") or ""):gmatch("[^;]+") do
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

local lf, done, lastbuild = 0, false, -1

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

-- ------------------------------------------- THE STATS FIELDS, per slot.
-- sub-record pointer at record +$06; the stats live in the sub-record (hitbox/
-- HP/speed/heading/palette/anim) and the record (HP-reload +$26, buckets +$28/
-- +$2A/+$2E).  Reads are addr-$800000 in the SRAM share.
local function r16(a) return RAM:read_u16(a - 0x800000) end
local function r8(a)  return RAM:read_u8(a - 0x800000)  end
local function r32(a)
  return (RAM:read_u16(a - 0x800000) << 16) | RAM:read_u16(a - 0x800000 + 2)
end

local function emit_slot(slotaddr, lf, clk)
  local typew = r16(slotaddr)
  if typew == 0 then return end                   -- freed by a stage-kill gate
  local typ = r8(slotaddr + 0x0c)
  local sub = r32(slotaddr + 0x06)
  if sub == 0 then return end                     -- no sub-record (shouldn't happen)
  local s = function(o) return sub + o end
  fh:write(string.format(
    "S\t%d\t%04X\t%d\t%02X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%02X\t%02X\t%02X\t%04X\t%04X\t%04X\t%08X\t%08X\n",
    lf, clk, (slotaddr - ENEMY_LO) // 0x50, typ,
    r16(s(0x00)),                                  -- flags
    r16(s(0x10)), r16(s(0x12)), r16(s(0x14)), r16(s(0x16)),  -- hitbox
    r16(s(0x18)),                                  -- HP
    r8(s(0x1a)), r8(s(0x1b)), r8(s(0x1d)),         -- speed / heading / palette
    r16(s(0x1e)),                                  -- anim
    r16(slotaddr + 0x26),                          -- HP reload
    r16(slotaddr + 0x28),                          -- bucket word +$28
    r32(slotaddr + 0x2a), r32(slotaddr + 0x2e)))   -- bucket emitter pointers +$2A/+$2E
end

local function emit_frame(lf, clk)
  -- 13 columns after lf: clk + the 12 globals the init bodies read.
  fh:write(string.format(
    "F\t%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\n",
    lf, clk,
    r16(0x813092), r16(0x813094), r16(0x813098),
    r16(0x8130b2), r16(0x8130b4), r16(0x8130b6), r16(0x8130b8),
    r16(0x8130ba), r16(0x8130bc), r16(0x8130ae),
    r16(0x8130d8), r16(0x803916)))
end

-- ------------------------------------- THE ENEMY-DRIVER-ENTRY TAP ($263502)
-- `clr.w $815e9c` is the driver's first instruction.  CURPC==$263502 on this
-- one write per frame is the PRE-HANDLER capture point: the spawn walker has
-- finished (all this-frame spawns are initialised) and no handler has run.  We
-- read every surviving claimed slot's stats fields HERE (not at the sample
-- point, which is one handler iteration later).  The sample-point tap below
-- only advances `lf` and applies input.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x815e9c, 0x815e9d, "drv",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc ~= 0x263502 then return data end
    if fh and lf > 0 then
      local clk = RAM:read_u16(0x130ce)
      for _, s in ipairs(claimed_slots) do emit_slot(s, lf, clk) end
      emit_frame(lf, clk)
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
  p("STAGE lf=%d", lf)
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
  if lf >= RUN and not done then done = true; finish() end
end)
