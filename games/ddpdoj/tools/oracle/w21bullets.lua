-- w21bullets.lua -- WAVE 21: THE BULLET SPAWN LEDGER.
--
-- WHAT IT RECORDS AND WHY IT RECORDS WRITES RATHER THAN STATE.
--
-- The thing under test is a RECORD LAYOUT plus some arithmetic.  A gate that
-- reads the finished record back through the port's own offset constants agrees
-- with itself whatever those constants hold -- that is the defect two of the
-- last three waves on this project shipped.  So this probe captures the
-- CARTRIDGE'S OWN WRITES: every store into the bullet pool made by an
-- instruction inside the spawn path, as (PC, address, mask, data).  The port
-- must then produce the same writes at the same ADDRESSES, and a wrong offset
-- constant is a different number in the log rather than a cancelled error.
--
--   W rows   one per pool write from $281554..$2815C5 or $281860..$281955
--            (the two cores' tails and all nine spawn-inits)
--   S rows   one per spawn, taken at $28158A / $281898 -- the `move.b D7,($a,A0)`
--            in each core, which is a WRITE and therefore a real execution hook
--            (a read tap only proves prefetch; 00-recon-hard §3).  It carries
--            the complete input register set, the three globals the speed
--            arithmetic adds, the four window words, the freeze triple, and a
--            210-BIT OCCUPANCY BITMAP of the pool taken at that instant so the
--            gate can re-derive the slot the search should have chosen.
--   F rows   one per logic frame: the globals, the live count, the pool census.
--
-- THE SEQUENCE NUMBER.  Every W and S row carries `seq`, which increments on
-- the FIRST write of a spawn ($281568 / $28187A, the type word).  So a spawn is
-- exactly the rows sharing one seq, and the gate never has to guess at grouping.
--
-- THE POKE.  $813098 -- the gate that turns every generator from one bullet
-- into a fan -- has read 0 on every frame this project has ever measured.
-- W21_RANK_FROM > 0 writes 1 into it from that logic frame onward and the
-- banner says so.  A poked run is off-distribution BY CONSTRUCTION
-- (docs/knowledge/09) and is valid for exactly one thing: proving the GENERATOR
-- is right given that state, with both sides at the same state.  Every row
-- carries the rank word it was taken under, so the gate compares like with like
-- and the worklog can label the claim "$813098 poked".
--
-- ENV: W21_FRAMES W21_INPUT W21_TSV W21_POKE_FROM W21_RANK_FROM W21_FIRE_FROM
--      W21_MOVE_FROM W21_BOMB_EVERY W21_REQUIRE_BUILD
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}          -- GLOBALS: a local handle is GC'd and the tap then
                             -- SILENTLY STOPS FIRING (00-recon-hard §3)

local RUN        = tonumber(os.getenv("W21_FRAMES")     or "6000")
local POKE_FROM  = tonumber(os.getenv("W21_POKE_FROM")  or "0")
local RANK_FROM  = tonumber(os.getenv("W21_RANK_FROM")  or "0")
local FIRE_FROM  = tonumber(os.getenv("W21_FIRE_FROM")  or "1800")
local MOVE_FROM  = tonumber(os.getenv("W21_MOVE_FROM")  or "1900")
local BOMB_EVERY = tonumber(os.getenv("W21_BOMB_EVERY") or "900")
local WANT       = os.getenv("W21_REQUIRE_BUILD")
local TSV        = os.getenv("W21_TSV")
local fh         = TSV and io.open(TSV, "w") or nil

p("KIND %s", POKE_FROM > 0
    and string.format("INVULNERABLE (off-distribution; $810424:=$FF from lf%d)", POKE_FROM)
    or  "PLAYING (on-distribution: NO invulnerability poke, the ship can die)")
p("RANK %s", RANK_FROM > 0
    and string.format("$813098 POKED to 1 from lf%d -- OFF-DISTRIBUTION, and the "
                      .. "only way any multi-bullet arm has ever run", RANK_FROM)
    or  "$813098 UNTOUCHED (it has read 0 on every frame ever measured)")

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
for item in (os.getenv("W21_INPUT") or ""):gmatch("[^;]+") do
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

-- The owner's own routine: sit bottom-centre, hold auto-shot, drift left and
-- right, throw a bomb now and then.  A passive run is pinned at minimum rank
-- with nothing dying -- a different game (20-OWNER-scenarios-must-play.md).
local MOVE_LEGS = { "C", "CL", "C", "CR" }
local bombs = 0
local function autopilot(n)
  if n < FIRE_FROM then return nil end
  if BOMB_EVERY > 0 and n >= MOVE_FROM and (n % BOMB_EVERY) < 3 then
    if (n % BOMB_EVERY) == 0 then bombs = bombs + 1 end
    return "BC"
  end
  if n < MOVE_FROM then return "C" end
  return MOVE_LEGS[(math.floor((n - MOVE_FROM) / 12) % 4) + 1]
end

local function apply_input(n)
  local a = autopilot(n)
  if a then set_held(a); return end
  local s = script[n]
  if s then set_held(s) end
end

-- ------------------------------------------------------- the bullet pool
local POOL, SLOTS, STRIDE = 0x817F8C, 210, 0x40
-- The spawn path, as two ADDRESS RANGES rather than a list of PCs: $281554 is
-- `move.l D0,-(A7)` (the first instruction after the free slot is found) and
-- $2815C6 is the spawn-init pointer TABLE; $281860 and $281956 are core B's
-- twins.  Everything that writes the pool from inside those ranges is part of
-- one spawn -- and the nine spawn-inits $2818AC..$281954 are inside the second.
local function in_spawn(pc)
  return (pc >= 0x281554 and pc < 0x2815C6) or (pc >= 0x281860 and pc < 0x281956)
end

local lf, done, lastbuild = 0, false, -1
local seq, spawns, wrows = 0, 0, 0
local pcs, kinds, dirs, speeds, rets, cores = {}, {}, {}, {}, {}, {}
local live_max, deaths, last_lives = 0, 0, -1
local rank_seen = {}
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- MAME's `A7` is exposed as `SP` on this device.  Resolving it once and
-- wrapping the body in pcall is not defensive noise: 20-recon-pattern-tables §8
-- lost a whole census run to `CPU.state["A7"]` raising inside a callback that
-- MAME then swallowed, and the run reported 0 spawns while its own frame
-- sampler reported 106 live bullets.
local SPNAME = CPU.state["A7"] and "A7" or "SP"
local tapErrors, lastErr = 0, ""

--- the 210-slot occupancy, as 27 bytes of hex, MSB = slot 0 of each group.
local function occupancy()
  local out = {}
  for g = 0, 26 do
    local b = 0
    for i = 0, 7 do
      local s = g * 8 + i
      if s < SLOTS and RAM:read_u16(POOL - 0x800000 + s * STRIDE) ~= 0 then
        b = b | (1 << (7 - i))
      end
    end
    out[#out + 1] = string.format("%02X", b)
  end
  return table.concat(out)
end

TAPS[#TAPS + 1] = PROG:install_write_tap(POOL, POOL + SLOTS * STRIDE - 1, "bul",
  function(offset, data, mask)
    local ok, err = pcall(function()
      local pc = CPU.state["CURPC"].value & 0xffffff
      if not in_spawn(pc) then return end
      if pc == 0x281568 or pc == 0x28187A then
        seq = seq + 1
        -- THE ANGLE, BEFORE $281586's `add.b D1,D1` TWICE.  The type-word write
        -- is the first instruction of the copy and the scale is nine
        -- instructions later, so this is the only place the caller's own D1 --
        -- 1/64 turn in bank A -- is still readable.  Without it the gate would
        -- have to divide the stored direction by four to recover its own input,
        -- which is exactly the shape of a test that agrees with itself.
        if fh then
          fh:write(string.format("E\t%d\td1=%08X\n",
                                 seq, CPU.state["D1"].value & 0xffffffff))
        end
      end
      bump(pcs, string.format("%06X", pc))
      if fh then
        fh:write(string.format("W\t%d\t%d\t%06X\t%06X\t%04X\t%04X\n",
                               seq, lf, pc, offset, mask, data))
        wrows = wrows + 1
      end
      if pc == 0x28158A or pc == 0x281898 then
        -- THE INPUT SNAPSHOT.  At this instant the pushed pattern word is at
        -- (SP) ($281578 `add.w (A7),D7` proves it) and the core's return
        -- address -- which identifies the GENERATOR BODY that called it -- is
        -- 16 bytes above, past the pushed D0/D7/A0/A1.
        local sp  = CPU.state[SPNAME].value & 0xffffff
        local d0  = PROG:read_u32(sp)
        local ret = PROG:read_u32(sp + 16) & 0xffffff
        local a5  = CPU.state["A5"].value & 0xffffff
        local a0  = CPU.state["A0"].value & 0xffffff
        local core = (pc == 0x28158A) and "A" or "B"
        local sub  = (a5 >= 0x800000 and a5 < 0x820000)
                     and (RAM:read_u32(a5 - 0x800000 + 6) & 0xffffff) or 0
        local subb = (sub >= 0x800000 and sub < 0x820000)
                     and RAM:read_u8(sub - 0x800000) or 0
        spawns = spawns + 1
        bump(kinds,  string.format("%d", d0 & 0x3F))
        bump(dirs,   string.format("%d", CPU.state["D1"].value & 0xFF))
        bump(speeds, string.format("%d", CPU.state["D7"].value & 0xFF))
        bump(rets,   string.format("%06X", ret))
        bump(cores,  core)
        if fh then
          -- NAMED FIELDS, not a positional row.  The first version of this
          -- probe had 28 format specifiers and 30 arguments and silently shifted
          -- every column after the eleventh -- and it looked like plausible
          -- data.  A `key=value` row cannot do that.
          local f = {
            string.format("seq=%d", seq), string.format("lf=%d", lf),
            "core=" .. core, string.format("ret=%06X", ret),
            string.format("d0=%08X", d0),
            string.format("d1s=%08X", CPU.state["D1"].value & 0xffffffff),
            string.format("d2=%08X", CPU.state["D2"].value & 0xffffffff),
            string.format("d3=%08X", CPU.state["D3"].value & 0xffffffff),
            string.format("d4=%08X", CPU.state["D4"].value & 0xffffffff),
            string.format("d5=%08X", CPU.state["D5"].value & 0xffffffff),
            string.format("a5=%06X", a5), string.format("a0=%06X", a0),
            string.format("d7=%02X", CPU.state["D7"].value & 0xFF),
            string.format("rank=%04X", RAM:read_u16(0x13098)),   -- $813098
            string.format("b1=%04X", RAM:read_u16(0x13160)),     -- $813160
            string.format("b2=%04X", RAM:read_u16(0x12950)),     -- $812950
            string.format("w0=%04X", RAM:read_u16(0x1B414)),
            string.format("w1=%04X", RAM:read_u16(0x1B416)),
            string.format("w2=%04X", RAM:read_u16(0x1B418)),
            string.format("w3=%04X", RAM:read_u16(0x1B41A)),
            string.format("f0=%04X", RAM:read_u16(0x130D4)),
            string.format("f1=%04X", RAM:read_u16(0x130D2)),
            string.format("f2=%04X", RAM:read_u16(0x11F72)),
            string.format("ix=%04X", RAM:read_u16(0x130D8)),
            string.format("iy=%04X", RAM:read_u16(0x130DA)),
            string.format("tgt=%02X",
              (a5 >= 0x800000 and a5 < 0x820000) and RAM:read_u8(a5 - 0x800000 + 3) or 0),
            string.format("efl=%02X",
              (a5 >= 0x800000 and a5 < 0x820000) and RAM:read_u8(a5 - 0x800000 + 0x0D) or 0),
            string.format("sub=%06X", sub), string.format("sub0=%02X", subb),
            "occ=" .. occupancy(),
          }
          fh:write("S\t" .. table.concat(f, "\t") .. "\n")
        end
      end
    end)
    if not ok then tapErrors = tapErrors + 1; lastErr = tostring(err) end
    return data
  end)

-- --------------------------------------------------------- the frame sample
local REL = { [0x13C806] = true, [0x23C46C] = true }
local rows = 0
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
      -- THE RANK POKE.  Nothing in the cartridge writes $813098 during a stage
      -- (the only reachable writer is $290762, on the loop transition), so one
      -- write per frame simply holds it.
      if RANK_FROM > 0 and lf >= RANK_FROM then RAM:write_u16(0x13098, 1) end
      bump(rank_seen, string.format("%04X", RAM:read_u16(0x13098)))

      local nlive = 0
      for s = 0, SLOTS - 1 do
        if RAM:read_u16(POOL - 0x800000 + s * STRIDE) ~= 0 then nlive = nlive + 1 end
      end
      if nlive > live_max then live_max = nlive end
      local lives = RAM:read_u16(0x130be)
      if last_lives >= 0 and last_lives ~= 0xFFFF and lives ~= 0xFFFF
         and lives < last_lives then deaths = deaths + 1 end
      last_lives = lives
      if fh then
        fh:write(string.format("F\t%d\t%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\n",
          lf, nlive, RAM:read_u16(0x1B40C), RAM:read_u16(0x13098),
          RAM:read_u16(0x1B414), RAM:read_u16(0x1B416),
          RAM:read_u16(0x1B418), RAM:read_u16(0x1B41A)))
        rows = rows + 1
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

local function finish()
  local s, n
  s, n = hist(cores, 4);   p("CORE %d distinct  %s", n, s)
  s, n = hist(kinds, 40);  p("KINDS %d distinct  %s", n, s)
  s, n = hist(speeds, 24); p("SPEEDS %d distinct  %s", n, s)
  s, n = hist(dirs, 20);   p("DIRS %d distinct (top20)  %s", n, s)
  s, n = hist(rets, 24);   p("CORE-RETURN (the generator body) %d distinct  %s", n, s)
  s, n = hist(pcs, 40);    p("SPAWN-PATH POOL WRITER PCs %d distinct  %s", n, s)
  s, n = hist(rank_seen, 6); p("$813098 values seen over the run: %s", s)
  p("SPAWNS=%d WROWS=%d live_max=%d bombs=%d deaths=%d SPname=%s tapErrors=%d %s",
    spawns, wrows, live_max, bombs, deaths, SPNAME, tapErrors, lastErr)
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if spawns == 0 then
    p("FAIL not one bullet was spawned -- the run never reached a firing enemy")
    fails = fails + 1
  end
  if tapErrors > 0 then p("FAIL the tap callback raised"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  if fh then fh:close() end
  p("DONE logicframes=%d videoframes=%d framerows=%d fails=%d",
    lf, SCR:frame_number(), rows, fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
