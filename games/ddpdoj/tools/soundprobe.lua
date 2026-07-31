-- Map the PGM sound path at runtime.
--
-- Three taps, all our own code; the ICS2115 register protocol is transcribed
-- from MAME src/devices/sound/ics2115.cpp (mame0289):
--
--   1. 68k writes to 0xc00003  -> soundlatch1, the "play sound N" command
--                                 (pgm.cpp: also pulses the Z80 NMI)
--   2. Z80 IO writes 0x8000-3  -> the ICS2115 register file
--   3. every ICS2115 keyon     -> voice, format, sample start/end in the ics ROM
--
-- Output is a tagged event log on stdout. It contains ROM addresses, so treat
-- the captured log as ROM-derived.

local T = "SND "
local function p(s) print(T .. s) end

local M = manager.machine
local vf = 0

-- ICS2115 state, mirrored from the bus writes
local reg_select, osc_select, active_osc = 0, 0, 31
local V = {}
for i = 0, 31 do V[i] = { conf = 0, fc = 0, start = 0, endd = 0, saddr = 0, ctl = 0, vol = 0, pan = 0 } end

local keyons, cmds = 0, 0
local MAXLOG = tonumber(os.getenv("DDP_SND_MAXLOG") or "4000")

local function reg_write(data, hi)   -- data is already the 16-bit value
  local v = V[osc_select]
  local r = reg_select
  if r == 0x00 then
    if hi then v.conf = (v.conf & 0x80) | ((data >> 8) & 0x7f) end
  elseif r == 0x01 then
    v.fc = data
  elseif r == 0x02 then
    if hi then v.start = (v.start & 0x00ffffff) | ((data & 0xff00) << 16) end
    if not hi then v.start = (v.start & 0xff00ffff) | ((data & 0x00ff) << 16) end
  elseif r == 0x03 then
    if hi then v.start = (v.start & 0xffff00ff) | (data & 0xff00) end
  elseif r == 0x04 then
    if hi then v.endd = (v.endd & 0x00ffffff) | ((data & 0xff00) << 16) end
    if not hi then v.endd = (v.endd & 0xff00ffff) | ((data & 0x00ff) << 16) end
  elseif r == 0x05 then
    if hi then v.endd = (v.endd & 0xffff00ff) | (data & 0xff00) end
  elseif r == 0x07 then
    if not hi then v.vol = data & 0xff end
  elseif r == 0x0c then
    if hi then v.pan = (data >> 8) & 0xff end
  elseif r == 0x0e then
    if hi then active_osc = (data >> 8) & 0x1f end
  elseif r == 0x10 then
    if hi then
      local d = (data >> 8) & 0xff
      v.ctl = d
      if d == 0 and keyons < MAXLOG then       -- ics2115.cpp: voice.state.on = !ctl; keyon()
        keyons = keyons + 1
        -- read_sample(): addr = (saddr<<20) | ((acc>>12) & 0xfffff)
        local sbyte = ((v.saddr << 20) | ((v.start >> 12) & 0xfffff)) & 0xffffff
        local ebyte = ((v.saddr << 20) | ((v.endd  >> 12) & 0xfffff)) & 0xffffff
        local fmt = "16bit"
        if (v.conf & 0x01) ~= 0 then fmt = "ulaw"
        elseif (v.conf & 0x04) ~= 0 then fmt = "8bit" end
        p(string.format("keyon vf=%d n=%d voice=%d conf=%02x fmt=%s loop=%d fc=%04x start=%06x end=%06x len=%d vol=%02x pan=%02x saddr=%02x",
          vf, keyons, osc_select, v.conf, fmt, (v.conf >> 3) & 1, v.fc,
          sbyte, ebyte, ebyte - sbyte, v.vol, v.pan, v.saddr))
      end
    end
  elseif r == 0x11 then
    if hi then v.saddr = (data >> 8) & 0xff end
  elseif r == 0x4f then
    if not hi then osc_select = (data & 0xff) % (1 + active_osc) end
  end
end

local ok, err = pcall(function()
  local z80 = M.devices[":soundcpu"]
  local io = z80.spaces["io"]
  _G.SND_IO = io:install_write_tap(0x8000, 0x8003, "icsw", function(offset, data, mask)
    local port = offset & 3
    if port == 1 then
      reg_select = data & 0xff
    elseif port == 2 then
      reg_write(data & 0xff, false)
    elseif port == 3 then
      reg_write((data & 0xff) << 8, true)
    end
    return data
  end)

  -- 0xc00003 is m68k_latch1_w (pgm.cpp:335) -- an ODD-address BYTE handler on a
  -- 16-bit space, so the tap must cover the whole word 0xc00002-0xc00003.
  -- Do NOT read CPU state inside the callback without pcall: a Lua error inside a
  -- tap is swallowed and the line just vanishes (NOTES-mame-oracle.md trap 5).
  local cpu = M.devices[":maincpu"]
  local m68 = cpu.spaces["program"]
  _G.SND_CMD = m68:install_write_tap(0xc00002, 0xc00003, "cmd", function(offset, data, mask)
    if cmds < MAXLOG then
      cmds = cmds + 1
      local pc = -1
      pcall(function() pc = cpu.state["PC"].value end)
      p(string.format("cmd vf=%d n=%d off=%06x data=%04x mask=%04x pc=%06x",
        vf, cmds, offset, data & 0xffff, mask & 0xffff, pc))
    end
    return data
  end)
end)
if not ok then p("ERR " .. tostring(err)) end

-- optional scripted input, same DDP_KEYS/DDP_HOLD contract as framedump.lua
local KEYS = {}
for spec in string.gmatch(os.getenv("DDP_KEYS") or "", "[^,]+") do
  local fr, nm = string.match(spec, "^(%d+):(.+)$")
  if fr then KEYS[#KEYS + 1] = { frame = tonumber(fr), name = nm } end
end
local HOLD = tonumber(os.getenv("DDP_HOLD") or "20")
local function find_field(name)
  for _, port in pairs(M.ioport.ports) do
    for fname, field in pairs(port.fields) do
      if fname == name then return field end
    end
  end
end

-- KEEP THE HANDLE: a dropped notifier subscription is silently collected.
_G.SND_NOTIFY = emu.add_machine_frame_notifier(function()
  vf = vf + 1
  for _, k in ipairs(KEYS) do
    if vf >= k.frame and vf < k.frame + HOLD then
      local f = find_field(k.name); if f then f:set_value(1) end
    elseif vf == k.frame + HOLD then
      local f = find_field(k.name); if f then f:set_value(0) end
    end
  end
end)
