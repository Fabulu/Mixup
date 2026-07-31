-- irq.lua -- game-agnostic frame landmark hunt on the PGM 68000.
--
-- 1. tap :maincpu cpu_space  -> every interrupt ACKNOWLEDGE (vector fetch)
-- 2. at that instant read the 68000 exception frame off the stack:
--       (SP+0)=SR word, (SP+2)=PC long   <- the PC the main loop was AT
--    A busy-wait on a vblank flag shows up as one dominant PC.
-- 3. histogram those PCs. That is the main loop's synchronisation point,
--    found without reading a single line of the game's code.
--
-- Results are dumped from the FRAME notifier, not the stop notifier: with
-- -seconds_to_run the stop notifier produced no output at all (measured).
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local RUN_FRAMES = tonumber(os.getenv("PROBE_FRAMES") or "600")

local M   = manager.machine
local CPU = M.devices[":maincpu"]
local CS  = CPU.spaces["cpu_space"]
local SCR = M.screens[":screen"]
local RAM = M.memory.shares[":sram"]        -- 128 KiB main RAM @ 0x800000

TAPS = {}            -- MUST be global: a dropped tap handle is GC'd silently

local iack   = 0
local vecoff = {}
local pchist = {}
local sphist = {}
local perframe = {}
local nframe = 0
local dumped = false

local okinst, errinst = pcall(function()
  TAPS[#TAPS+1] = CS:install_read_tap(0, 0xffffff, "iack", function(offset, data, mask)
    iack = iack + 1
    vecoff[offset] = (vecoff[offset] or 0) + 1
    local sp = CPU.state["SP"].value
    sphist[sp & 0xffffff] = (sphist[sp & 0xffffff] or 0) + 1
    -- 68000 short exception frame: SR at SP, PC at SP+2
    local a = (sp + 2) & 0x1ffff        -- main RAM is 0x800000..0x81ffff
    local okp, pc = pcall(function() return RAM:read_u32(a) end)
    if okp then pchist[pc] = (pchist[pc] or 0) + 1 end
    perframe[nframe] = (perframe[nframe] or 0) + 1
    return data
  end)
end)
if not okinst then p("LUA_ERROR install %s", tostring(errinst)) end

local function dump()
  p("videoframes=%d iacks=%d", nframe, iack)
  local function top(t, label, fmt, n)
    local a = {}
    for k, v in pairs(t) do a[#a+1] = {k, v} end
    table.sort(a, function(x, y) return x[2] > y[2] end)
    p("%s_distinct=%d", label, #a)
    for i = 1, math.min(#a, n) do p(fmt, a[i][1], a[i][2]) end
  end
  top(vecoff, "iack_offset", "iack_offset=%06X n=%d", 12)
  top(pchist, "interrupted_PC", "interrupted_PC=%08X n=%d", 25)
  top(sphist, "SP_at_iack", "SP_at_iack=%08X n=%d", 8)
  local dist = {}
  for f = 1, nframe do
    local c = perframe[f] or 0
    dist[c] = (dist[c] or 0) + 1
  end
  for c = 0, 12 do if dist[c] then p("iacks_per_videoframe[%d]=%d", c, dist[c]) end end
end

-- NOTE: the notifier subscription must be kept alive too, exactly like a tap
-- handle. Dropped on the floor it is garbage-collected and never fires.
SUBS = {}
SUBS[#SUBS+1] = emu.add_machine_frame_notifier(function()
  nframe = SCR:frame_number()
  if nframe >= RUN_FRAMES and not dumped then
    dumped = true
    local ok, e = pcall(dump)
    if not ok then p("LUA_ERROR dump %s", tostring(e)) end
    M:exit()
  end
end)
