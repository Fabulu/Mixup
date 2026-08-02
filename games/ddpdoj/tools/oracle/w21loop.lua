-- w21loop.lua -- W21: drive the DEBUG STAGE SELECT and watch $813098.
--
-- WHY A SEPARATE PROBE.  frame.lua's PROBE_INPUT knows P1 and the service
-- buttons only; the debug stage select at $259D04 is driven by P2 and gated on
-- a DIP SWITCH ($C08006 bit 7, MAME's ":DSW" field "Unknown", default 0x80 =
-- feature OFF).  Neither is reachable from the existing harness.
--
-- 68000 RULES OBSERVED (docs/knowledge, and the brief):
--   * CURPC does NOT identify an opcode fetch on the 68000 and a READ tap only
--     proves PREFETCH.  Every execution hook here is a WRITE tap.
--   * Lua tap handles and notifier subscriptions are GC-ed if dropped and then
--     silently stop firing.  TAPS/SUBS are globals.
--   * ddpdojblk boots to a chooser defaulting to VERSION-A; the first ~700
--     logic frames of any run are build A.  The build census is printed.
--
-- Env:
--   W21_FRAMES   logic frames to run (default 3000)
--   W21_DSW      "0" or "1": force the ":DSW" field "Unknown" ($C08006 bit 7)
--   W21_INPUT    "lf=NAMES;lf=NAMES;..."  held until the next entry.
--                P1: U D L R A B C S    P2: u d l r a b c s
--                svc: N=coin1 T=test V=service
--   W21_POKE     "addr=value,..." word pokes applied every logic frame
--   W21_SEL      if set, force the selector $812E0A to this hex value each frame
--   W21_LOG      "addr,addr,..." extra words to log per 60 logic frames

local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local RUN  = tonumber(os.getenv("W21_FRAMES") or "3000")

TAPS, SUBS = {}, {}

-- ------------------------------------------------------------------ inputs
local P1P2 = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local DSW  = M.ioport.ports[":DSW"]
local NAME = {
  U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3", S = "1 Player Start",
  u = "P2 Up", d = "P2 Down", l = "P2 Left", r = "P2 Right",
  a = "P2 Button 1", b = "P2 Button 2", c = "P2 Button 3", s = "2 Players Start",
}
local SVCNAME = { N = "Coin 1", T = "Test", V = "Service" }

local script, held = {}, {}
for item in (os.getenv("W21_INPUT") or ""):gmatch("[^;]+") do
  local lfk, names = item:match("^(%d+)=(.*)$")
  if lfk then
    local fs = {}
    for c in names:gmatch(".") do
      local f = P1P2.fields[NAME[c] or ""] or SVC.fields[SVCNAME[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(lfk)] = fs
  end
end

-- The DIP.  MAME calls it "Unknown"; it is $C08006 bit 7 and the game reads it
-- at $259CBE and $259D14 as "SET = the stage select is OFF".
local dswf = DSW and DSW.fields["Unknown"] or nil
local DSWSET = os.getenv("W21_DSW")
if DSWSET and dswf then dswf:set_value(tonumber(DSWSET)) end
p("DSW field=%s forced=%s", dswf and "present" or "MISSING", tostring(DSWSET))

-- ------------------------------------------------------------------- pokes
local pokes = {}
for kv in (os.getenv("W21_POKE") or ""):gmatch("[^,]+") do
  local a, v = kv:match("^(%x+)=(%x+)$")
  if a then pokes[#pokes + 1] = { tonumber(a, 16), tonumber(v, 16) } end
end
local SEL = os.getenv("W21_SEL")
local logs = {}
for a in (os.getenv("W21_LOG") or ""):gmatch("[^,]+") do logs[#logs + 1] = tonumber(a, 16) end

-- -------------------------------------------------------------------- taps
local lf = 0
local w98, exec, armcen = {}, {}, {}
local nonzero_first, nonzero_max = nil, 0

TAPS[#TAPS + 1] = PROG:install_write_tap(0x813098, 0x813099, "loopflag",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    local k = string.format("%06X", pc)
    w98[k] = w98[k] or { n = 0, first = -1, vals = {} }
    w98[k].n = w98[k].n + 1
    if w98[k].first < 0 then w98[k].first = lf end
    w98[k].vals[string.format("%04X", data & 0xffff)] = true
    return data
  end)

-- EXECUTION HOOK for the debug stage select: $259D7C `addq.w #1,($6,A4)` and
-- $259D88 `clr.w ($6,A4)` with A4 = $812E08, i.e. writes to $812E0E.  A write
-- tap over the whole $812E08 block is the reliable proof that it runs.
TAPS[#TAPS + 1] = PROG:install_write_tap(0x812E08, 0x812E4B, "selstate",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    local k = string.format("%06X:%06X", offset, pc)
    exec[k] = exec[k] or { n = 0, first = -1 }
    exec[k].n = exec[k].n + 1
    if exec[k].first < 0 then exec[k].first = lf end
    return data
  end)

-- ---------------------------------------------------------- the sample point
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    if (data & 0xff) == 0 then return data end
    lf = lf + 1
    local armpc = string.format("%06X", CPU.state["CURPC"].value & 0xffffff)
    armcen[armpc] = (armcen[armpc] or 0) + 1
    local fs = script[lf]
    if fs then
      for _, f in ipairs(held) do f:set_value(0) end
      held = {}
      for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
    end
    for _, kv in ipairs(pokes) do PROG:write_u16(kv[1], kv[2]) end
    if SEL then PROG:write_u16(0x812E0A, tonumber(SEL, 16)) end
    local v = PROG:read_u16(0x813098)
    if v ~= 0 then
      if not nonzero_first then nonzero_first = lf end
      if v > nonzero_max then nonzero_max = v end
    end
    if lf % 300 == 0 or lf == RUN then
      local extra = ""
      for _, a in ipairs(logs) do
        extra = extra .. string.format(" %06X=%04X", a, PROG:read_u16(a))
      end
      -- The ISR question NOTES-build-split.md asks to be settled ON A
      -- VERSION-B RUN: $0CA6 reads $801470 (IRQ4), $0CBE reads $801478 (IRQ6),
      -- so whatever address sits in those two RAM longwords is what runs.
      p("VEC lf=%d irq4=%08X irq6=%08X", lf,
        PROG:read_u32(0x801470), PROG:read_u32(0x801478))
      p("LF %5d f3098=%04X stage=%04X sel=%04X selflag=%02X%s", lf, v,
        PROG:read_u16(0x813092), PROG:read_u16(0x812E0A),
        PROG:read_u8(0x812E09), extra)
    end
    if lf >= RUN then
      p("--- $813098 WRITERS (CURPC of the writing instruction) ---")
      for k, r in pairs(w98) do
        local vs = ""
        for vv in pairs(r.vals) do vs = vs .. vv .. " " end
        p("W98 pc=%s n=%d firstlf=%d values=%s", k, r.n, r.first, vs)
      end
      p("--- $812E08 block writers (the stage-select state) ---")
      local nsel = 0
      for k, r in pairs(exec) do
        nsel = nsel + 1
        p("SEL %s n=%d firstlf=%d", k, r.n, r.first)
      end
      if nsel == 0 then p("SEL NONE -- the stage-select object never ran in this run") end
      p("--- build census (armpc at the sample point) ---")
      for k, n in pairs(armcen) do p("ARM %s %d", k, n) end
      p("RESULT f3098_nonzero_first=%s f3098_max=%d",
        tostring(nonzero_first), nonzero_max)
      p("END")
      M:exit()
    end
    return data
  end)

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function() end)
