-- w159chain.lua -- W159 chain/gameplay/HUD correlation capture.
--
-- This is a controlled VERSION-B board run. It samples the chain state, the
-- chain-driven hyper-item gauge, the six TX cells used by the high-water
-- digits, and bucket 25 on the same logic-frame boundary. It also records the
-- exact PCs that write the chain/gauge words. The deliberate interventions are:
--   * $810424 := $FF from lf1960, to keep the scripted player alive;
--   * $81B64A := $0960 and $81B636 := 0 at lf4800, after the natural window,
--     to force one falsifiable threshold crossing through the real $287682.
-- The intervention is explicitly marked in the TSV and never used as evidence
-- for natural pacing or reachability.
--
-- ENV: W159_FRAMES W159_INPUT W159_TSV W159_REQUIRE_BUILD

local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M = manager.machine
local CPU = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR = M.screens[":screen"]
local RAM = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN = tonumber(os.getenv("W159_FRAMES") or "5800")
local WANT = os.getenv("W159_REQUIRE_BUILD") or "B"
local TSV = assert(os.getenv("W159_TSV"), "W159_TSV is required")
local fh = assert(io.open(TSV, "w"))

local PORT = M.ioport.ports[":P1P2"]
local SVC = M.ioport.ports[":Service"]
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

local script = {}
for item in (os.getenv("W159_INPUT") or ""):gmatch("[^;]+") do
  local lfn, names = item:match("^(%d+)=(.*)$")
  if lfn then script[tonumber(lfn)] = names end
end

local held, held_key = {}, ""
local function set_held(names)
  if names == held_key then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = resolve(names)
  for _, f in ipairs(held) do f:set_value(1) end
  held_key = names
end

-- Five controlled windows after the normal VERSION-B boot sequence:
-- 1900..2399: settle into gameplay with no fire.
-- 2400..2899: one-frame tap-shot every 12 frames, over live enemies.
-- 2900..3499: held laser contact.
-- 3500..3899: no fire, an ordinary decay window.
-- 3900..4299: held laser while sweeping across adjacent enemies.
-- 4300..4799: no fire, a full break window and end of NATURAL gauge census.
-- 4800..5099: held laser after the explicitly marked forced gauge threshold.
-- 5400..5403: ordinary bomb with laser released; observe its delayed reset.
local function planned_input(n)
  if script[n] ~= nil then return script[n] end
  if n >= 2400 and n < 2900 then
    return ((n - 2400) % 12 == 0) and "A" or ""
  end
  if n >= 2900 and n < 3500 then return "A" end
  if n >= 3500 and n < 3900 then return "" end
  if n >= 3900 and n < 4300 then
    local leg = math.floor((n - 3900) / 40) % 4
    return (leg == 0 and "AL") or (leg == 2 and "AR") or "A"
  end
  if n >= 4300 and n < 4800 then return "" end
  if n >= 4800 and n < 5100 then return "A" end
  if n >= 5400 and n < 5404 then return "B" end
  return ""
end

local WRITE_TAG = {
  [0x28616c] = "kill-cap=",
  [0x286320] = "chain0",
  [0x286380] = "chain-seed1",
  [0x2863b2] = "chain+",
  [0x2863c2] = "hiwater=",
  [0x28664e] = "meter+",
  [0x286664] = "meter=cap",
  [0x2866c4] = "gauge+cap",
  [0x28679e] = "gauge+beam",
  [0x2867c8] = "gauge+laser",
  [0x2845cc] = "popup-",
  [0x2845e0] = "popup-index+",
  [0x284606] = "popup-speed-",
  [0x284636] = "meter-",
  [0x284640] = "chainend-a",
  [0x284646] = "chainend-b",
  [0x2499d8] = "bomb-chain-latch",
  [0x2876a0] = "gauge0-grant",
  [0x2876c6] = "pending+",
  [0x2530ca] = "stock+",
  [0x2530d0] = "hyper-gauge=95f",
  [0x285a30] = "hyper-on",
  [0x285a8a] = "stock0-activate",
}

local events = {}
TAPS[#TAPS + 1] = PROG:install_write_tap(0x81b440, 0x81b6ff, "w159ledger",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    local tag = WRITE_TAG[pc]
    if not tag and offset >= 0x81b64a and offset <= 0x81b64b then
      tag = "gauge-write"
    end
    if tag then
      events[#events + 1] = string.format("%s@%06X:%06X=%X/m%X",
        tag, pc, offset, data, mask)
    end
    return data
  end)

-- The two bucket-25 enqueue stubs increment $80AFE6 before writing the record.
-- Keep the maximum byte count for the frame. At the sample point the counter
-- has been drained back to zero, but the staging bytes remain readable.
local b25max = 0
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80afe6, 0x80afe7, "w159b25",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if pc == 0x23faa2 or pc == 0x23fad4 then
      local v = data & 0xffff
      if v > b25max then b25max = v end
    end
    return data
  end)

local function ru16(abs) return RAM:read_u16(abs - 0x800000) end
local function ru32(abs) return RAM:read_u32(abs - 0x800000) end
local function tx32(abs) return PROG:read_u32(abs) end

fh:write(table.concat({
  "lf", "vf", "input", "phase", "forced", "chain", "meter", "cap",
  "seed_acc", "run_acc", "break_timer", "popup", "popup_speed",
  "popup_idx", "popup_val", "hiwater", "gauge", "pending", "stock",
  "hyper_active", "hyper_gauge", "item_c_live", "b25_records", "b25_tiles",
  "tx435", "tx436", "tx437", "tx499", "tx500", "tx501", "events"
}, "\t") .. "\n")

local lf, lastbuild, previous_input = 0, -1, ""
local natural_gauge_max, natural_chain_max, meter_zero_events = 0, 0, 0
local forced_done = false
local REL = { [0x13c806] = true, [0x23c46c] = true }

local function phase(n)
  if n < 1900 then return "boot" end
  if n < 2400 then return "settle-no-fire" end
  if n < 2900 then return "tap-shot" end
  if n < 3500 then return "laser-hold" end
  if n < 3900 then return "no-fire-decay-1" end
  if n < 4300 then return "laser-adjacent" end
  if n < 4800 then return "no-fire-decay-2" end
  if n < 5100 then return "forced-threshold" end
  if n < 5400 then return "release" end
  if n < 5404 then return "ordinary-bomb" end
  return "bomb-teardown" end

local function b25_tiles(nbytes)
  local out = {}
  for off = 0, nbytes - 12, 12 do
    out[#out + 1] = string.format("%08X", PROG:read_u32(0x80a6e4 + off + 4))
  end
  return table.concat(out, ",")
end

TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "w159sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf

      local chain, meter, gauge = ru16(0x81b5da), ru16(0x81b5c0), ru16(0x81b64a)
      if lf < 4800 then
        if gauge > natural_gauge_max then natural_gauge_max = gauge end
        if chain > natural_chain_max then natural_chain_max = chain end
      end
      for _, e in ipairs(events) do
        if e:find("meter%-") and meter == 0 then meter_zero_events = meter_zero_events + 1 end
      end
      local livec = 0
      for i = 0, 5 do if ru16(0x816e7a + i * 0x40) ~= 0 then livec = livec + 1 end end

      fh:write(string.format(
        "%d\t%d\t%s\t%s\t%d\t%04X\t%04X\t%04X\t%08X\t%08X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%d\t%d\t%s"
        .. "\t%08X\t%08X\t%08X\t%08X\t%08X\t%08X\t%s\n",
        lf, SCR:frame_number(), previous_input, phase(lf), forced_done and 1 or 0,
        chain, meter, ru16(0x81b5b2), ru32(0x81b5b8), ru32(0x81b5ce),
        ru16(0x81b5c2), ru16(0x81b5c8), ru16(0x81b5ca), ru16(0x81b5cc),
        ru16(0x81b5dc), ru16(0x81b632), gauge, ru16(0x81b6e0),
        ru16(0x81b65c), ru16(0x81b63e), ru16(0x81b642), livec,
        math.floor(b25max / 12), b25_tiles(b25max),
        tx32(0x9046cc), tx32(0x9046d0), tx32(0x9046d4),
        tx32(0x9047cc), tx32(0x9047d0), tx32(0x9047d4), table.concat(events, ",")))

      events, b25max = {}, 0

      if lf >= 1960 then RAM:write_u8(0x10424, 0xff) end
      if lf == 4800 then
        RAM:write_u16(0x1b64a, 0x0960)
        RAM:write_u16(0x1b636, 0x0000)
        forced_done = true
        p("FORCED lf4800 $81B64A=$0960 $81B636=$0000")
      end
      local next_input = planned_input(lf)
      set_held(next_input)
      previous_input = next_input
    end
    return data
  end)

local done = false
SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then
    done = true
    fh:close()
    -- The sample-point writer is in build B's $23xxxx block, so the high
    -- address nibble is 2. Build A's corresponding writer is $13xxxx.
    local got = lastbuild == 0x2 and "B" or (lastbuild == 0x1 and "A"
      or string.format("%X", lastbuild))
    if got ~= WANT then p("FAIL BUILD want=%s got=%s", WANT, got) end
    p("SUMMARY natural_gauge_max=%04X natural_chain_max=%04X meter_zero_events=%d",
      natural_gauge_max, natural_chain_max, meter_zero_events)
    p("DONE logicframes=%d videoframes=%d build=%s", lf, SCR:frame_number(), got)
    M:exit()
  end
end)
