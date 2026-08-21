-- W164/W477 controlled VERSION-B player-death lifecycle capture.
--
-- At logic frame 1960, after normal boot and stage entry, this probe forces
-- only the inputs to the authentic hit path: hit bit, zero invulnerability,
-- known hyper rank/stock/gauge state, and two lives. The board then executes
-- $249F8A and the later $24A130 state without further intervention. After each
-- authentic respawn, the probe supplies one more invulnerability-off hit. It
-- verifies the 2 -> 1 -> 0 -> $FFFF life sequence, two respawns, and request 2
-- entering the game-over path.
--
-- ENV: W164_INPUT W164_FRAMES

local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M = manager.machine
local CPU = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR = M.screens[":screen"]
local RAM = M.memory.shares[":sram"]
local PORT = M.ioport.ports[":P1P2"]
local SVC = M.ioport.ports[":Service"]

TAPS, SUBS = {}, {}
local RUN = tonumber(os.getenv("W164_FRAMES") or "2120")
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left",
  R = "P1 Right", A = "P1 Button 1", B = "P1 Button 2",
  C = "P1 Button 3", S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }

local function resolve(names)
  local fs = {}
  for c in names:gmatch(".") do
    local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
    if f then fs[#fs + 1] = f else p("FAIL INPUT_UNKNOWN char=%s", c) end
  end
  return fs
end

local script = {}
for item in (os.getenv("W164_INPUT") or ""):gmatch("[^;]+") do
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

local function ru8(abs) return RAM:read_u8(abs - 0x800000) end
local function ru16(abs) return RAM:read_u16(abs - 0x800000) end
local function wu8(abs, v) RAM:write_u8(abs - 0x800000, v) end
local function wu16(abs, v) RAM:write_u16(abs - 0x800000, v) end

local events = {}
local EVENT_PC = {
  [0x287b9a] = "gauge-add", [0x287bac] = "gauge-cap",
  [0x24a00e] = "rank-quarter", [0x24a01c] = "stock-clear",
  [0x24a036] = "state-kind", [0x24a118] = "state-mask",
  [0x24a11c] = "state-dead", [0x24a120] = "anim-start",
  [0x24a128] = "wait-start", [0x24a140] = "anim-step",
  [0x24a146] = "delay-load", [0x24a150] = "delay-step",
  [0x24a1f8] = "record-restore", [0x25ff4a] = "reset-one",
  [0x25ff4c] = "reset-zero", [0x241252] = "kill-id",
  [0x241254] = "kill-sp",
}
local function watch(a, b, name)
  TAPS[#TAPS + 1] = PROG:install_write_tap(a, b, "w164" .. name,
    function(offset, data, mask)
      local pc = CPU.state["CURPC"].value & 0xffffff
      if EVENT_PC[pc] then
        events[#events + 1] = string.format("%s@%06X", EVENT_PC[pc], pc)
      end
      return data
    end)
end
watch(0x8103e6, 0x810447, "player")
watch(0x81b63e, 0x81b65d, "hyper")
watch(0x8130fa, 0x8130fd, "reset")
watch(0x80dbfe, 0x80e23f, "killq")

local lf, lastbuild, forced = 0, -1, false
local init_lf, reset_lf = -1, -1
local init_snapshot, reset_snapshot = "", ""
local all_events = {}
local hit_count, respawn_count, request2_lf = 0, 0, -1
local ready_for_hit, life_trace = true, {}
local last_lives = nil
local REL = { [0x13c806] = true, [0x23c46c] = true }

TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "w164sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf
      for _, e in ipairs(events) do all_events[#all_events + 1] = e end

      if forced and init_lf < 0 and ru16(0x81b646) == 0x0014
          and ru16(0x81b65c) == 0 and ru16(0x81b64a) == 0x095e
          and (ru8(0x8103e6) & 1) ~= 0 then
        init_lf = lf
        init_snapshot = string.format(
          "power=%04X stock=%04X earn=%04X active=%04X state=%04X anim=%08X medal=%04X",
          ru16(0x81b646), ru16(0x81b65c), ru16(0x81b64a),
          ru16(0x81b63e), ru16(0x8103e6), PROG:read_u32(0x8103fa),
          ru16(0x817f80))
      end

      if init_lf >= 0 and reset_lf < 0 and ru16(0x8130fa) == 1
          and ru16(0x8103e6) == 0 then
        reset_lf = lf
        reset_snapshot = string.format(
          "state=%04X formation=%04X keep20=%04X keep22=%04X keep25=%02X reset=%04X reset2=%04X",
          ru16(0x8103e6), ru16(0x810440), ru16(0x810406),
          ru16(0x810408), ru8(0x81040b), ru16(0x8130fa), ru16(0x8130fc))
      end

      local state = ru16(0x8103e6)
      if forced and (state & 0x8000) == 0 then ready_for_hit = true end

      if lf >= 1960 and hit_count < 3 and ready_for_hit and (state & 0x8000) ~= 0 then
        -- The first hit also fixes rank-facing state so the original W164
        -- initializer assertions remain exact. Later hits change only the hit
        -- bit and invulnerability byte, after the cartridge respawns the ship.
        if hit_count == 0 then
          wu16(0x81b63e, 1)
          wu16(0x81b646, 0x0050)
          wu16(0x81b65c, 2)
          wu16(0x81b64a, 0x0800)
          wu16(0x8130be, 2)
          wu16(0x812934, 1)
          wu16(0x817f80, 9)
          last_lives = 2
          life_trace[#life_trace + 1] = 2
        else
          respawn_count = respawn_count + 1
        end
        wu8(0x8103e6, ru8(0x8103e6) | 0x10)
        wu8(0x810424, 0)
        hit_count = hit_count + 1
        ready_for_hit = false
        p("FORCED hit=%d lf=%d invuln=0 lives=%04X", hit_count, lf,
          ru16(0x8130be))
        forced = true
      end

      if forced then
        local lives = ru16(0x8130be)
        if lives ~= last_lives then
          life_trace[#life_trace + 1] = lives
          last_lives = lives
        end
        if request2_lf < 0 and ru16(0x8130fa) == 2 then request2_lf = lf end
      end
      set_held(script[lf] or "")
      events = {}
    end
    return data
  end)

local done = false
SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then
    done = true
    local got = lastbuild == 2 and "B" or (lastbuild == 1 and "A"
      or string.format("%X", lastbuild))
    if got ~= "B" then p("FAIL BUILD want=B got=%s", got) end
    if init_lf < 0 then p("FAIL no authentic death initializer observed") end
    if reset_lf < 0 then p("FAIL no authentic player reset observed") end
    if hit_count ~= 3 then p("FAIL hit count want=3 got=%d", hit_count) end
    if respawn_count ~= 2 then p("FAIL respawn count want=2 got=%d", respawn_count) end
    local want_lives = { 2, 1, 0, 0xffff }
    if #life_trace ~= #want_lives then
      p("FAIL life trace length want=%d got=%d", #want_lives, #life_trace)
    else
      for i, want in ipairs(want_lives) do
        if life_trace[i] ~= want then
          p("FAIL life trace at=%d want=%04X got=%04X", i, want, life_trace[i])
        end
      end
    end
    if request2_lf < 0 then p("FAIL no game-over request 2 observed") end
    local life_parts = {}
    for _, v in ipairs(life_trace) do life_parts[#life_parts + 1] = string.format("%04X", v) end
    p("INIT lf=%d %s", init_lf, init_snapshot)
    p("RESET lf=%d %s", reset_lf, reset_snapshot)
    p("CYCLE hits=%d respawns=%d lives=%s request2_lf=%d",
      hit_count, respawn_count, table.concat(life_parts, ">"), request2_lf)
    p("EVENTS %s", table.concat(all_events, ","))
    p("DONE logicframes=%d videoframes=%d build=%s", lf, SCR:frame_number(), got)
    M:exit()
  end
end)
