-- w18elem.lua -- WAVE 18: a FOCUSED recording of the BG-element window so the
-- element-slot columns AND bucket-2's staged bytes compare against the port.
-- It is a STRIPPED copy of w17stage.lua's proven scaffolding -- same labelled
-- interventions, same sample-point tap ($803940), same exit pattern
-- (`emu.add_machine_frame_notifier` + `M:exit()`) -- recording only what W18's
-- gate reads, plus the two fields the wave-17 corpus does NOT carry:
--   $813170  scrollPrev (read by op-$10 to build every element's arg)
--   bucket 2 the 12-byte sprite records the element updaters stage at $805CC8.
--
-- INTERVENTIONS (identical to w17stage.lua): invulnerable from W17_POKE_FROM,
-- auto-shot from W17_FIRE_FROM, move from W17_MOVE_FROM.  Coverage-valid,
-- pacing-invalid (docs/knowledge/09).  Every number this run yields is
-- "invulnerable, auto-shot" evidence.
--
-- ENV: W17_FRAMES W17_INPUT W17_TSV W17_POKE_FROM W17_FIRE_FROM W17_MOVE_FROM
--      W17_REQUIRE_BUILD
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                 -- GLOBALS: a local handle is GC'd and the
                                    -- tap silently stops firing (00-recon-hard)

local RUN       = tonumber(os.getenv("W17_FRAMES")     or "3500")
local POKE_FROM = tonumber(os.getenv("W17_POKE_FROM")  or "1250")
local FIRE_FROM = tonumber(os.getenv("W17_FIRE_FROM")  or "1800")
local MOVE_FROM = tonumber(os.getenv("W17_MOVE_FROM")  or "1900")
local WANT      = os.getenv("W17_REQUIRE_BUILD")
local TSV       = os.getenv("W17_TSV")
local fh        = TSV and io.open(TSV, "w") or nil

p("W18 element-window recorder: invuln from lf%d, autoshot from lf%d, move from lf%d",
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
for item in (os.getenv("W17_INPUT") or ""):gmatch("[^;]+") do
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

-- the 8-slot BG-element table; a slot is "constructed" when ($8,slot) != 0
-- (the field every constructor writes; never cleared except by $262320)
local function elem_mask()
  local m, n = 0, 0
  for s = 0, 7 do
    if RAM:read_u32(0x131C8 + s * 0x20 + 8) ~= 0 then
      m = m | (1 << s); n = n + 1
    end
  end
  return m, n
end

-- THE ELEMENT ENQUEUE STREAM.  Every element updater ends `jmp $23DF2A`, which
-- stages a 12-byte sprite into bucket 2 and bumps $80AFC4 at $23DF4E.  The
-- display-list drain then CLEARS the counter, so a sample-point snapshot of
-- bucket 2 is always empty (confirmed: b2len=0 for every frame of the first
-- run).  Tapping the counter write captures each staged record AT ENQUEUE TIME,
-- before the drain -- which is the only point the bytes exist.  `frameq`
-- accumulates the (pc, 12-byte-hex) pairs staged between two sample points.
--
-- THE OFFSET: `addi.w #$c,$80afc4` writes the NEW counter (old + $C), and by
-- the time this callback runs MAME has already committed it to :sram, so
-- re-reading $80AFC4 yields the NEW value -- reading the 12 bytes there lands
-- $C past the record (the all-zero rows of the first run).  The record just
-- written is at old = data - $C, so derive the offset from `data` itself.
local frameq = {}
TAPS[#TAPS + 1] = PROG:install_write_tap(0x80afc4, 0x80afc5, "b2",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    local before = (data - 0x0c) & 0xffff
    local b = {}
    -- RAM is the :sram SHARE: its readers take a share-relative offset, not a
    -- CPU address (the sample point reads $130CE for CPU $8130CE).  $805CC8 ->
    -- offset $5CC8.  Passing the CPU address reads past the 128 KiB share and
    -- returns zero -- the all-zero rows of the first two runs.
    for k = 0, 11 do b[#b + 1] = string.format("%02X", RAM:read_u8(0x5cc8 + before + k)) end
    frameq[#frameq + 1] = string.format("%06X:%s", pc, table.concat(b))
    return data
  end)

-- THE SAMPLE POINT: $803940 is written once per logic frame (w17stage.lua).
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf
      apply_input(lf)
      if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end
      if fh then
        local emask, ecount = elem_mask()
        -- columns: lf d0ce d0d2 d190 d176 d170 d096 d16e b03c(8) shake emask
        -- ecount enqueue-stream (comma-joined "pc:12bytes" staged THIS frame)
        fh:write(string.format(
          "%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%08X\t%02X\t%d\t%d\t%s\n",
          lf, RAM:read_u16(0x130ce), RAM:read_u16(0x130d2),
          RAM:read_u16(0x13190), RAM:read_u16(0x13176), RAM:read_u16(0x13170),
          RAM:read_u16(0x13096), RAM:read_u16(0x1316e), RAM:read_u32(0xb03c),
          (RAM:read_u16(0x13186) ~= 0) and 1 or 0, emask, ecount,
          table.concat(frameq, ",")))
        frameq = {}
      end
    end
    return data
  end)

local function finish()
  if fh then fh:close() end
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
