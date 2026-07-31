-- ramdump.lua -- dump the 128 KiB of 68000 main RAM at a chosen GAME frame.
--
-- Keyed on the game's OWN frame counter ($80390A), not on MAME's video frame,
-- so a run started from boot and a run resumed from a savestate can be
-- compared at the same point in the game's life.
--
-- Output is ROM-derived: write it under a gitignored path only.
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]
TAPS, SUBS = {}, {}

local WANT = tonumber(os.getenv("DUMP_AT") or "150")     -- value of $80390A
local PATH = os.getenv("DUMP_OUT")
local LOAD = os.getenv("PROBE_LOAD")
local loaded, done = false, false

TAPS[#TAPS+1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    if done then return data end
    local newv
    if (mask & 0xff00) ~= 0 then newv = (data >> 8) & 0xff else newv = data & 0xff end
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      local gf = RAM:read_u16(0x390a)
      if gf == WANT then
        done = true
        local t = {}
        for a = 0, 0x1ffff do t[#t+1] = string.char(RAM:read_u8(a)) end
        local fh = io.open(PATH, "wb")
        if fh then fh:write(table.concat(t)); fh:close()
          p("DUMPED gameframe=%d vf=%d bytes=%d", gf, SCR:frame_number(), 0x20000)
        else p("DUMP_OPEN_FAILED %s", tostring(PATH)) end
      end
    end
    return data
  end)

SUBS[#SUBS+1] = emu.add_machine_frame_notifier(function()
  if LOAD and not loaded then
    loaded = true
    local fh = io.open(LOAD, "rb")
    if fh then local b = fh:read("a"); fh:close(); M:buffer_load(b)
      p("LOADED bytes=%d", #b)
    else p("LOAD_FAILED %s", LOAD) end
  end
  if done then M:exit() end
end)
