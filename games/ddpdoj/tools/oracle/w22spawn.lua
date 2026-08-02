-- w22spawn.lua -- WAVE 22: the SPAWN SIDE.  A focused recorder for the enemy
-- spawn walker `$2633BE`, run under the SAME two labelled interventions as the
-- wave-17 corpus (so the two are comparable): invulnerable + autopilot.
--
-- ===================== THE INTERVENTIONS, NAMED =============================
-- (1) INVULNERABILITY.  $810424 -- ($3E,A6) of player record base $8103E6 --
--     is written $FF at the sample point on every logic frame from
--     W22_POKE_FROM.  Identical to wave 17.  [DIST]: valid for COVERAGE (which
--     records execute, which spawns land), invalid for pacing/density.
-- (2) AUTOPILOT.  P1 Button 3 held + 12-frame L/C/R/C oscillation from
--     W22_FIRE_FROM / W22_MOVE_FROM.  Owner's own routine.
--
-- ===================== WHAT IT RECORDS ======================================
-- A TSV.  Per logic frame one DATA row, plus zero or more S-ledger rows that
-- precede it (one per allocator claim that frame):
--     S\t<lf>\t<clk>\t<slotidx>\t<type>     one per spawn (script OR deferred)
--     <lf>\t<clk>\t<cursor>\t<live>\t<dqct>\t<nclaim>\t<cumclaim>   the frame
--   lf        logic frame
--   clk       $8130CE  the distance clock (the walker matches on this)
--   cursor    $8132CC  the live spawn-script cursor (LONGWORD) -- advances by 8
--             per script record, so script-spawns = Δcursor/8
--   live      $815E9C  the enemy live count (written by $263502)
--   dqct      $815EA8  the deferred-queue byte count ($50 per entry, $C80 cap)
--   nclaim    allocator slot-claims THIS frame (CURPC==$26371A)
--   cumclaim  cumulative allocator claims since stage start
-- `nclaim`/`cumclaim` count ALL spawns (script + deferred) through the only
-- allocator `$2636D6`; `cursor` counts SCRIPT spawns only.  The difference is
-- the deferred-queue contribution -- the 33+ the plan names.
--
-- ENV: W22_FRAMES W22_INPUT W22_TSV W22_POKE_FROM W22_FIRE_FROM W22_MOVE_FROM
--      W22_REQUIRE_BUILD
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                 -- GLOBALS: a local handle is GC'd and the
                                    -- tap silently stops firing (00-recon-hard)

local RUN       = tonumber(os.getenv("W22_FRAMES")     or "16000")
local POKE_FROM = tonumber(os.getenv("W22_POKE_FROM")  or "1250")
local FIRE_FROM = tonumber(os.getenv("W22_FIRE_FROM")  or "1800")
local MOVE_FROM = tonumber(os.getenv("W22_MOVE_FROM")  or "1900")
local WANT      = os.getenv("W22_REQUIRE_BUILD")
local TSV       = os.getenv("W22_TSV")
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
for item in (os.getenv("W22_INPUT") or ""):gmatch("[^;]+") do
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

-- --------------------------------------------- THE ALLOCATOR CLAIM TAP.
-- `$2636D6` writes the slot-claim word at $26371A `move.w D3,(A0)` with
-- D3 = idx | $8000 (bit 15 always set).  One write per successful allocation;
-- the dummy/fail path at $263748 writes nothing.  CURPC on a WRITE tap is the
-- writing instruction (00-recon-hard §3), so CURPC==$26371A is the exact "an
-- enemy was just allocated" signal, for both the script path (caller $263420)
-- and the deferred path (caller $263468).
local CLAIM_PC  = 0x26371A
local ENEMY_LO  = 0x81332C           -- $81332C + 58*$50 - 1 = $81454B
local ENEMY_HI  = 0x81454B
local nclaim, cumclaim = 0, 0
local claimed_slots = {}             -- full addresses of slots claimed this lf

TAPS[#TAPS + 1] = PROG:install_write_tap(ENEMY_LO, ENEMY_HI, "claim",
  function(offset, data, mask)
    -- mask is $FFFF for the `move.w D3,(A0)`; bit 15 of data is always set.
    if (CPU.state["CURPC"].value & 0xffffff) ~= CLAIM_PC then return data end
    nclaim = nclaim + 1
    cumclaim = cumclaim + 1
    claimed_slots[#claimed_slots + 1] = offset
    return data
  end)

-- ------------------------------------------------------- THE SAMPLE POINT
-- identical to wave 17: the semaphore write at $803940 that arms every logic
-- frame, filtered to the two release PCs.  RAM offsets are addr - $800000.
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

      -- THE INTERVENTION, at the board's own sample point (replay determinism).
      -- POKE_FROM <= 0 means NO intervention.
      if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end

      local clk    = RAM:read_u16(0x130ce)
      local cursor = RAM:read_u32(0x132cc)

      -- one S line per allocator claim this frame; the type byte at slot+$C
      -- was written by $263728 `move.b D0,($c,A0)` immediately after the claim
      if fh then
        for _, s in ipairs(claimed_slots) do
          local slotidx = (s - ENEMY_LO) // 0x50
          local typ = RAM:read_u8((s - 0x800000) + 0x0c)
          fh:write(string.format("S\t%d\t%04X\t%d\t%02X\n",
              lf, clk, slotidx, typ))
        end
      end
      claimed_slots = {}

      if fh then
        local live = RAM:read_u16(0x15e9c)
        local dqct = RAM:read_u16(0x15ea8)
        fh:write(string.format("%d\t%04X\t%08X\t%04X\t%04X\t%d\t%d\n",
          lf, clk, cursor, live, dqct, nclaim, cumclaim))
      end
      nclaim = 0
    end
    return data
  end)

local function finish()
  p("STAGE lf=%d cumclaims=%d", lf, cumclaim)
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
