-- w20turret.lua -- WAVE 20: THE TURRET LEDGER.
--
-- WHY THIS PROBE EXISTS.  The owner's note (20-OWNER-scenarios-must-play.md
-- §3): "The first enemies in the game ... have rotating turrets that point at
-- you the whole time."  That is the aim system, live, in the opening seconds,
-- and a turret is a CONTINUOUS per-frame consumer of it where a bullet samples
-- it once.  This file records, at the board's own sample point, every live
-- enemy record's FACING BYTE ($33,A5) together with everything the ROM needs to
-- compute it -- so the port can be run forward from a seeded facing and
-- compared angle-for-angle, per frame, instead of byte-for-byte on frame 4,012.
--
-- WHAT THE BOARD DOES, from the listing (this is the thing being validated):
--
--   $268A0E  tst.w $8130D2 / bne $268A68      the freeze gate: NO aim this frame
--   $268A16  move.b ($33,A5),D1               (D1 unused on the skip path)
--   $268A1A  subq.b #1,($18,A5) / bcc         THE AIM CADENCE -- borrow = re-aim
--   $268A20  move.b ($19,A5),($18,A5)         reload
--   $268A26  movem.w ($2,A6),D0-D1            self = the SUB-record's Y,X
--   $268A2C  addi.w #$200,D0                  THE MUZZLE OFFSET (+$200 on Y)
--   $268A30  jsr $24200A                      aim64, target picked by ($3,A5)
--   $268A36  bcs $268A68                      both players dead -> no aim
--   $268A38  move.b ($33,A5),D0
--   $268A3C  jsr $242190                      ONE-STEP SLEW
--   $268A42  move.b D1,($33,A5)               THE NEW FACING
--   $268A46  addq.b #1,D1 / andi.w #$3E,D1 / add.w D1,D1
--   $268A54  move.l ($268C9E,A0,D1.w),($22,A5)  the 32-direction graphic
--
-- and $268376..$2683C2 (type $10, handler $268232) is the SAME BLOCK with the
-- graphic table at $268694.  Both are recorded here; the gate filters on the
-- handler longword ($4C,A5), never on a guessed type code.
--
-- THE SCENARIO IS A PLAYING ONE BY DEFAULT (owner directive, binding).  P1
-- Button 3 (auto-shot, $2497B2) is held, the ship drifts left/right around
-- bottom-centre, and Button 2 (the bomb, $2497FE) is tapped every W20_BOMB_EVERY
-- logic frames.  W20_POKE_FROM defaults to 0 = NO INVULNERABILITY: the ship can
-- and does die, which is on-distribution (docs/knowledge/09).  Pass
-- --poke N to get the off-distribution coverage run instead; the banner and the
-- filename say which.
--
-- ENV: W20_FRAMES W20_INPUT W20_TSV W20_POKE_FROM W20_FIRE_FROM W20_MOVE_FROM
--      W20_BOMB_EVERY W20_REQUIRE_BUILD
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}          -- GLOBALS: a local handle is GC'd and the tap then
                             -- SILENTLY STOPS FIRING (00-recon-hard §3)

local RUN        = tonumber(os.getenv("W20_FRAMES")      or "6000")
local POKE_FROM  = tonumber(os.getenv("W20_POKE_FROM")   or "0")
local FIRE_FROM  = tonumber(os.getenv("W20_FIRE_FROM")   or "1800")
local MOVE_FROM  = tonumber(os.getenv("W20_MOVE_FROM")   or "1900")
local BOMB_EVERY = tonumber(os.getenv("W20_BOMB_EVERY")  or "900")
local WANT       = os.getenv("W20_REQUIRE_BUILD")
local TSV        = os.getenv("W20_TSV")
local fh         = TSV and io.open(TSV, "w") or nil

p("KIND %s", POKE_FROM > 0
    and string.format("INVULNERABLE (off-distribution; $810424:=$FF from lf%d)", POKE_FROM)
    or  "PLAYING (on-distribution: NO invulnerability poke, the ship can die)")
p("INTERVENTION autoshot from lf%d  move from lf%d  bomb every %d lf",
  FIRE_FROM, MOVE_FROM, BOMB_EVERY)

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
for item in (os.getenv("W20_INPUT") or ""):gmatch("[^;]+") do
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

-- THE AUTOPILOT: the owner's own routine -- sit bottom-centre, hold the shot,
-- drift left and right, throw a bomb now and then.  12 logic frames per leg,
-- legs C / CL / C / CR, so the ship oscillates about the middle instead of
-- walking into a wall and pinning one delta forever (which would make the aim's
-- input space one-dimensional -- the whole point of --move is to sweep it).
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

-- --------------------------------------------------------- the enemy table
-- $263514 lea $81332C,A5 / $26351A move.w #$39,D6 / $263568 lea ($50,A5),A5
local ETAB, ESLOTS, ESTRIDE = 0x81332C, 58, 0x50
local TURRET_HANDLERS = { [0x2688CC] = 1, [0x268232] = 1 }

local lf, done, lastbuild = 0, false, -1
local rows, turret_rows, live_max, aimframes = 0, 0, 0, 0
local hseen, tseen = {}, {}
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- ---------------------------------------------------------- THE DRIVER HOOK
-- WHY THIS EXISTS, and it was paid for once already: the first pass of this
-- probe found 9,888 (frame, record) pairs in which the facing, the aim cadence,
-- the position and everything else were BYTE-IDENTICAL from one sample point to
-- the next while $8130D2 read 0.  The turret block did not decline to aim -- the
-- ENEMY DRIVER NEVER RAN.  (It is the player-death / respawn window: the
-- top-level object driver stops dispatching the enemy object.)  Inferring that
-- from "nothing changed" would be circular -- it is the very thing under test --
-- so it is MEASURED, with the only reliable 68000 execution hook there is:
--
--   $263502 clr.w $815E9C   -- ONCE per driver pass, the first instruction
--   $263546 addq.w #1,$815E9C -- once per surviving record inside the pass
--
-- Both are WRITES to the same word, so one tap sees both and the PC separates
-- them.  The PC census is printed so the separation is evidence, not a guess.
local drv_pcs = {}
local drv_pass, drv_bump = 0, 0
TAPS[#TAPS + 1] = PROG:install_write_tap(0x815E9C, 0x815E9D, "drv",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    bump(drv_pcs, string.format("%06X", pc))
    if pc == 0x263502 then drv_pass = drv_pass + 1
    else drv_bump = drv_bump + 1 end
    return data
  end)

-- Deaths are EVIDENCE, not noise: a playing run that never dies is an
-- invulnerable run wearing a different label.  $8130BE is P1's life count.
local lives_seen, deaths, last_lives = {}, 0, -1

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

      local clk   = RAM:read_u16(0x130ce)
      local d0d2  = RAM:read_u16(0x130d2)
      local pal   = RAM:read_u16(0x103e6)      -- $24271E tst.w (A0): bit15 = ALIVE
      local py    = RAM:read_u16(0x103e8)      -- $242032 movem.w ($2,A0),D2-D3
      local px    = RAM:read_u16(0x103ea)
      local p2al  = RAM:read_u16(0x10448)
      local p2y   = RAM:read_u16(0x1044a)
      local p2x   = RAM:read_u16(0x1044c)
      local lives = RAM:read_u16(0x130be)
      bump(lives_seen, string.format("%d", lives))
      -- $FFFF is the pre-stage / post-game-over value, not a life count: the
      -- first pass of this probe counted the $FFFF -> 2 step as a DEATH and
      -- reported one death in a run that had none.  Only a decrease between two
      -- real counts is a death.
      if last_lives >= 0 and last_lives ~= 0xFFFF and lives ~= 0xFFFF
         and lives < last_lives then deaths = deaths + 1 end
      last_lives = lives

      local nlive, nturret = 0, 0
      for s = 0, ESLOTS - 1 do
        local a = ETAB + s * ESTRIDE - 0x800000
        local flags = RAM:read_u16(a)
        if flags ~= 0 then                       -- $26351E tst.w (A5) / beq
          nlive = nlive + 1
          local hand = RAM:read_u32(a + 0x4C) & 0xffffff   -- $263532
          bump(hseen, string.format("%06X", hand))
          bump(tseen, string.format("%02X", RAM:read_u8(a + 0x0C)))
          if TURRET_HANDLERS[hand] then
            nturret = nturret + 1
            local sub = RAM:read_u32(a + 0x06) & 0xffffff  -- $263524
            local sy, sx, s0, s1b, s1a, s1c = 0, 0, 0, 0, 0, 0
            if sub >= 0x800000 and sub < 0x820000 - 0x40 then
              local so = sub - 0x800000
              sy  = RAM:read_u16(so + 0x02)
              sx  = RAM:read_u16(so + 0x04)
              s0  = RAM:read_u8(so + 0x00)
              s1b = RAM:read_u8(so + 0x1B)
              s1a = RAM:read_u16(so + 0x1A)
              s1c = RAM:read_u16(so + 0x1C)
            end
            if fh then
              fh:write(string.format(
                "E\t%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t" ..
                "%d\t%04X\t%02X\t%02X\t%06X\t%02X\t%02X\t%02X\t%08X\t%02X\t" ..
                "%06X\t%04X\t%04X\t%02X\t%02X\t%04X\t%04X\n",
                lf, clk, d0d2, pal, py, px, p2al, p2y, p2x,
                -- slot, flags, type ($C,A5), target ($3,A5), handler ($4C,A5)
                s, flags, RAM:read_u8(a + 0x0C), RAM:read_u8(a + 0x03), hand,
                -- facing ($33,A5), aim cadence ($18,A5), reload ($19,A5)
                RAM:read_u8(a + 0x33), RAM:read_u8(a + 0x18), RAM:read_u8(a + 0x19),
                -- graphic ($22,A5), state ($20,A5)  [bit7 = the death path]
                RAM:read_u32(a + 0x22), RAM:read_u8(a + 0x20),
                -- the SUB-record: pointer, Y ($2,A6), X ($4,A6), byte0, ($1B,A6)
                sub, sy, sx, s0, s1b, s1a, s1c))
              turret_rows = turret_rows + 1
            end
          end
        end
      end
      if nlive > live_max then live_max = nlive end
      if nturret > 0 then aimframes = aimframes + 1 end
      if fh then
        -- drv/dbump are the counts SINCE THE PREVIOUS SAMPLE POINT, i.e. they
        -- describe the frame whose transition ends at this row.
        fh:write(string.format(
          "F\t%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%d\t%d\t%d\t%d\t%d\n",
          lf, clk, d0d2, pal, py, px, p2al, p2y, p2x, nlive, nturret, lives,
          drv_pass, drv_bump))
        rows = rows + 1
      end
      drv_pass, drv_bump = 0, 0
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
  s, n = hist(hseen, 20); p("CENSUS enemy handlers dispatched (%d) %s", n, s)
  s, n = hist(tseen, 24); p("CENSUS enemy type codes (%d) %s", n, s)
  s, n = hist(lives_seen, 8); p("CENSUS P1 lives (%d) %s", n, s)
  s, n = hist(drv_pcs, 8);    p("CENSUS $815E9C writer PCs (%d) %s -- $263502 "
    .. "is the once-per-pass clr.w, $263546 the per-record addq", n, s)
  p("TURRET rows=%d frames_with_a_turret=%d live_max=%d bombs=%d deaths=%d",
    turret_rows, aimframes, live_max, bombs, deaths)
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if turret_rows == 0 then
    p("FAIL not one turret record was seen -- the run never reached the first enemies")
    fails = fails + 1
  end
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
