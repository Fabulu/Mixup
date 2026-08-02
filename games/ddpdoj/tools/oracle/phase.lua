-- phase.lua -- WAVE 2 item 4: THE PHASE ORDER WITHIN ONE FRAME, and item 1's
-- first cut: WHICH top-level call contains the object work.
--
-- Build B's main loop is seven `jsr abs.l` in a straight line followed by a
-- `bra` back (derive.py; landmarks.json):
--
--   $23BFDC jsr $23BE8C   counters: $80390A++, bchg $80390D bit0, $80390E mod 3
--   $23BFE2 jsr $256D5A
--   $23BFE8 jsr $2410BC
--   $23BFEE jsr $24683E
--   $23BFF4 jsr $23D2AE
--   $23BFFA jsr $23C212   FRAME SYNC: arms $803940, spins at $23C390
--   $23C000 jsr $23D12A   runs AFTER the vblank wait
--   $23C006 bra $23BFDC
--
-- Because that is STRAIGHT-LINE code, a read tap on the first word of each `jsr`
-- fires once per loop iteration, in order.  A read tap only proves PREFETCH on
-- the 68000 -- but here that is exactly what we want and its error is bounded:
-- the fetch of `jsr N+1` happens while `jsr N` is still executing, i.e. at most
-- one instruction early, against phases that are 10^4 cycles long.  We are
-- timing boundaries, not proving execution.
--
-- INTERRUPTS ARE SEPARATED BY THE 68000's OWN IPL, not guessed.  A write that
-- happens while SR's interrupt mask is >= 4 happened inside IRQ4/IRQ6; the main
-- context runs at a lower mask.  That is measured and printed
-- (CENSUS sr_mask_main / sr_mask_isr), not assumed.
--
-- ENV
--   PH_FRAMES / PH_INPUT / PH_REQUIRE_BUILD  as objhunt.lua
--   PH_CALLS    "hex,hex,..."  the jsr SITES in the main loop (default build B)
--   PH_NAMES    "n,n,..."      labels for them
--   PH_WATCH    "hex,hex,..."  extra code addresses to tap and time (read tap)
--   PH_ATTRIB   1 = attribute every main-RAM write to the phase it happened in
--   PH_DUMPFRAME N  print the full ordered landmark timeline of logic frame N
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                              -- GLOBALS. See objhunt.lua.

local RUN   = tonumber(os.getenv("PH_FRAMES") or "2600")
local WANT  = os.getenv("PH_REQUIRE_BUILD")
local ATTR  = os.getenv("PH_ATTRIB") == "1"
local DUMPF = tonumber(os.getenv("PH_DUMPFRAME") or "0")

local CALLS, NAMES = {}, {}
for tok in (os.getenv("PH_CALLS")
    or "23BFDC,23BFE2,23BFE8,23BFEE,23BFF4,23BFFA,23C000,23C006"):gmatch("[^,]+") do
  CALLS[#CALLS + 1] = tonumber(tok, 16)
end
for tok in (os.getenv("PH_NAMES")
    or "counters,call1,call2,call3,call4,sync,postvbl,tail"):gmatch("[^,]+") do
  NAMES[#NAMES + 1] = tok
end
local WATCH = {}
for tok in (os.getenv("PH_WATCH") or ""):gmatch("[^,]+") do
  WATCH[#WATCH + 1] = tonumber(tok, 16)
end

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("PH_INPUT") or ""):gmatch("[^;]+") do
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

-- ------------------------------------------------------------------ state
local lf, done = 0, false
local phase = -1                       -- index into CALLS, or -1 before the first
local frame_t0 = 0
-- 68000 cycles, exactly, with no float and no int64 overflow.  `seconds * 1e18`
-- overflows int64 at 10 emulated seconds; see frame.lua's cycnow() for the
-- measured consequence that had on wave 1's `work` column.
local function now()
  return M.time.seconds * 20000000 + (M.time.attoseconds // 50000000000)
end
local function cyc(t) return t end

local marks = {}                       -- this frame's ordered (name, cycles)
local orderhist = {}                   -- "a>b>c" -> n   (the ORDER, not just the set)
local phasecyc = {}                    -- name -> {n, sum, min, max}
local attrib = {}                      -- pc -> { [phase] = n }
local srmain, srisr = {}, {}
local buildhist, lastbuild = {}, -1
local dumped = false

local function acc(name, c)
  local e = phasecyc[name]
  if not e then e = { n = 0, sum = 0, min = 1 / 0, max = 0 }; phasecyc[name] = e end
  e.n = e.n + 1; e.sum = e.sum + c
  if c < e.min then e.min = c end
  if c > e.max then e.max = c end
end

-- ------------------------------------------------------------------ taps
for i, a in ipairs(CALLS) do
  local idx, nm = i, NAMES[i] or string.format("c%d", i)
  TAPS[#TAPS + 1] = PROG:install_read_tap(a, a + 1, "ph" .. i, function(offset, data)
    phase = idx
    local c = cyc(now() - frame_t0)
    marks[#marks + 1] = { nm, c }
    acc(nm, c)
    return data
  end)
end
for i, a in ipairs(WATCH) do
  local nm = string.format("w%06X", a)
  TAPS[#TAPS + 1] = PROG:install_read_tap(a, a + 1, "wa" .. i, function(offset, data)
    local c = cyc(now() - frame_t0)
    marks[#marks + 1] = { nm, c }
    acc(nm, c)
    return data
  end)
end

-- interrupt dispatch, game-agnostic: a read tap on the 68000's
-- interrupt-acknowledge space fires once per dispatched interrupt.
TAPS[#TAPS + 1] = CPU.spaces["cpu_space"]:install_read_tap(0, 0xffffff, "iak",
  function(offset, data)
    local nm = (offset == 0xfffffc) and "IRQ6" or (offset == 0xfffff8) and "IRQ4" or nil
    if nm then
      local c = cyc(now() - frame_t0)
      marks[#marks + 1] = { nm, c }
      acc(nm, c)
    end
    return data
  end)

if ATTR then
  TAPS[#TAPS + 1] = PROG:install_write_tap(0x800000, 0x81FEFF, "attr",
    function(offset, data, mask)
      local pc = CPU.state["CURPC"].value & 0xffffff
      local sr = CPU.state["SR"].value
      local mask3 = (sr >> 8) & 7
      local ph
      if mask3 >= 4 then
        ph = "ISR" .. mask3
        srisr[mask3] = (srisr[mask3] or 0) + 1
      else
        ph = NAMES[phase] or "?"
        srmain[mask3] = (srmain[mask3] or 0) + 1
      end
      local t = attrib[pc]
      if not t then t = {}; attrib[pc] = t end
      t[ph] = (t[ph] or 0) + 1
      return data
    end)
end

-- THE SAMPLE POINT (see frame.lua): the 0 -> non-zero transition of $803940.
local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf
      buildhist[lastbuild] = (buildhist[lastbuild] or 0) + 1
      apply_input(lf)
      if lf == DUMPF and not dumped then
        dumped = true
        local o = {}
        for _, m in ipairs(marks) do o[#o + 1] = string.format("%s@%d", m[1], m[2]) end
        for i = 1, #o, 12 do
          p("TIMELINE lf=%d %s", lf, table.concat(o, " ", i, math.min(i + 11, #o)))
        end
      end
      -- the ORDER of the main-loop landmarks this frame, as a signature
      local o = {}
      for _, m in ipairs(marks) do
        if m[1]:sub(1, 3) ~= "IRQ" then o[#o + 1] = m[1] end
      end
      local key = table.concat(o, ">")
      orderhist[key] = (orderhist[key] or 0) + 1
      marks = {}
      frame_t0 = now()
    end
    return data
  end)

-- ------------------------------------------------------------------ report
local function finish()
  local ks = {}
  for k in pairs(orderhist) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return orderhist[a] > orderhist[b] end)
  for i = 1, math.min(#ks, 8) do
    p("ORDER n=%d %s", orderhist[ks[i]], ks[i])
  end
  local nk = {}
  for k in pairs(phasecyc) do nk[#nk + 1] = k end
  table.sort(nk, function(a, b) return phasecyc[a].sum / phasecyc[a].n
                                     < phasecyc[b].sum / phasecyc[b].n end)
  for _, k in ipairs(nk) do
    local e = phasecyc[k]
    p("MARK %-10s n=%d mean_cyc_into_frame=%d min=%d max=%d",
      k, e.n, math.floor(e.sum / e.n), e.min, e.max)
  end
  if ATTR then
    local list = {}
    for pc, t in pairs(attrib) do
      local n = 0
      for _, v in pairs(t) do n = n + v end
      list[#list + 1] = { pc = pc, t = t, n = n }
    end
    table.sort(list, function(a, b) return a.n > b.n end)
    for i = 1, math.min(70, #list) do
      local x = list[i]
      local ph = {}
      for k, v in pairs(x.t) do ph[#ph + 1] = string.format("%s:%d", k, v) end
      table.sort(ph)
      p("ATTR pc=%06X n=%d %s", x.pc, x.n, table.concat(ph, " "))
    end
    local s = {}
    for k, v in pairs(srmain) do s[#s + 1] = string.format("%d:%d", k, v) end
    p("CENSUS sr_mask_main %s", table.concat(s, " "))
    s = {}
    for k, v in pairs(srisr) do s[#s + 1] = string.format("%d:%d", k, v) end
    p("CENSUS sr_mask_isr %s", table.concat(s, " "))
  end
  local bs = {}
  for b, n in pairs(buildhist) do bs[#bs + 1] = string.format("%d:%d", b, n) end
  p("CENSUS build_by_armpc_top_nibble %s lastbuild=%d", table.concat(bs, " "), lastbuild)
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL the LAST logic frame armed from build %d, not the required %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
