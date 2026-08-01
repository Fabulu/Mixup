-- w5recon.lua -- WAVE 5 recon: how big is the enemy/weapon job, in NUMBERS.
--
-- Wave 2 located the TOP-LEVEL object driver ($2410BC, 20 slots x $50 at
-- $80E240).  It did not look inside the 20 per-type handlers, and said so:
-- "each of the 20 handlers walks its own sub-tables ... and I did not
-- disassemble those loops".  Wave 5 has to, because that is where the enemies
-- and the weapons live.  This probe measures the two sub-drivers found by
-- disassembly, at runtime, so the port's cost is a measured number and not an
-- impression:
--
--   THE ENEMY DRIVER   $263502   lea $81332C,A5 / move.w #$39,D6 / ...
--                                movea.l ($4C,A5),A1 / jsr (A1) / lea ($50,A5),A5
--                      58 slots x $50 at $81332C..$81454B, and the PER-ENEMY
--                      HANDLER IS A POINTER STORED IN THE RECORD at +$4C.
--                      So "port the enemies" = port the SET of handler
--                      addresses this census reports, and nothing less.
--   THE PLAYER-SHOT DRIVER $253A70  lea $810572,A6 / moveq #$23,D7 /
--                      D0 = (A6) & $F -> ($253ADE,PC) 16-entry longword table
--                      -> jsr (A0) / lea ($30,A6),A6 / dbra
--                      36 slots x $30 per player, run TWICE (P1 $810572,
--                      P2 $810C32) by the outer `swap D6 / dbra D6`.
--
-- WHY WRITE TAPS AND NOT READ TAPS: on the 68000 a read tap fires on the
-- PREFETCH and CURPC does not identify an opcode fetch (that rule is 6502-only,
-- docs/worklog/ddpdoj/00-recon-hard.md 3).  Every hook below is a WRITE tap on
-- an instruction that unambiguously stores, or a hook placed at a store inside
-- the loop body.  The enemy dispatch has no store, so it is hooked through the
-- store at $263546/$26354C's neighbourhood -- no: it is hooked by tapping the
-- write the driver itself makes at $26352E (`sub.w D0,($4,A6)`), which executes
-- EXACTLY ONCE PER LIVE ENEMY, immediately before the `jsr (A1)`, with A5 still
-- the record.  Measured against $815E9C (the driver's own live count) below.
--
-- Tap handles and notifier subscriptions live in GLOBALS or they are GC'd and
-- silently stop firing.
--
-- ENV: W5_FRAMES, W5_INPUT, W5_REQUIRE_BUILD, W5_SPRQ (1 = census $80AFC0)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN  = tonumber(os.getenv("W5_FRAMES") or "2600")
local WANT = os.getenv("W5_REQUIRE_BUILD")

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("W5_INPUT") or ""):gmatch("[^;]+") do
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

local lf, done = 0, false
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- enemy census
local en_handlers, en_types, en_perframe, en_pf = {}, {}, {}, 0
local en_maxpf, en_bands = 0, {}
-- shot census
local sh_kinds, sh_perframe, sh_pf, sh_maxpf = {}, {}, 0, 0
-- sprite request queue high-water
local sprq_max, sprq_hist = 0, {}

-- (1) THE ENEMY DRIVER's per-live-enemy store, $26352E `sub.w D0,($4,A6)`.
--     A5 is the enemy record; ($4C,A5) is the handler about to be called.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x813000, 0x81FDFF, "en", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc ~= 0x26352E then return data end
  local a5 = CPU.state["A5"].value & 0xffffff
  local rec = a5 - 0x800000
  local h = RAM:read_u32(rec + 0x4c)
  local t = RAM:read_u16(rec)
  bump(en_handlers, string.format("%06X", h & 0xffffff))
  bump(en_types, string.format("%04X", t))
  local band = (a5 >= 0x81364C) and "C_common48" or
               ((a5 >= 0x8133CC) and "B_boss8" or "A_special2")
  bump(en_bands, band)
  en_pf = en_pf + 1
  return data
end)

-- (2) THE PLAYER-SHOT DRIVER's per-live-shot store, $253AA6 `sub.w D6,($4,A6)`.
--     A6 is the shot record; (A6) & $F selects the handler.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x810400, 0x810FFF, "sh", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc ~= 0x253AA6 then return data end
  local a6 = (CPU.state["A6"].value & 0xffffff) - 0x800000
  local t = RAM:read_u16(a6)
  bump(sh_kinds, string.format("%04X", t))
  sh_pf = sh_pf + 1
  return data
end)

-- (3) THE SAMPLE POINT.
local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then return data end
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
    lf = lf + 1
    lastbuild = (pc >> 20) & 0xf
    apply_input(lf)
    bump(en_perframe, en_pf); if en_pf > en_maxpf then en_maxpf = en_pf end
    bump(sh_perframe, sh_pf); if sh_pf > sh_maxpf then sh_maxpf = sh_pf end
    -- the driver's OWN live count, for the cross-check
    local drv = RAM:read_u16(0x15e9c)
    if drv ~= en_pf then bump(en_bands, "MISMATCH_vs_815E9C") end
    en_pf, sh_pf = 0, 0
    -- the 12-byte sprite REQUEST queue write pointer, $80AFC0.  Cap is $BC4 =
    -- 3012 bytes = 251 records ($23D746 cmpi.w #$BC4).  Read at the sample
    -- point, i.e. AFTER call #4 emitted and $23D712 cleared -- so this reads
    -- the CLEARED value and is useless there; read the max seen inside the
    -- emit instead (tap 4).
  end
  return data
end)

-- (4) THE SPRITE REQUEST QUEUE HIGH-WATER.  $23D73E `addi.w #$c,$80AFC0` is the
--     enqueue; tapping the write gives the value AFTER each append.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80AFC0, 0x80AFC1, "sprq", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x23D73E then
    local v = data & 0xffff
    if v > sprq_max then sprq_max = v end
    bump(sprq_hist, v - (v % 240))
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
  local s, n = hist(en_handlers, 40)
  p("ENEMY handler pointers dispatched (from ($4C,A5)): %d DISTINCT", n)
  p("ENEMY handlers %s", s)
  s, n = hist(en_types, 40); p("ENEMY type words (A5+0): %d distinct  %s", n, s)
  s, n = hist(en_bands, 10);  p("ENEMY bands %s", s)
  s = hist(en_perframe, 40);  p("ENEMY live per logic frame max=%d hist %s", en_maxpf, s)
  s, n = hist(sh_kinds, 40)
  p("SHOT kind words (A6+0): %d distinct  %s", n, s)
  s = hist(sh_perframe, 40);  p("SHOT live per logic frame max=%d hist %s", sh_maxpf, s)
  p("SPRQ high-water $80AFC0 = $%X (%d of the 251-record cap at $BC4)",
    sprq_max, sprq_max // 12)
  s = hist(sprq_hist, 20);    p("SPRQ hist(bucket 20 records) %s", s)
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
