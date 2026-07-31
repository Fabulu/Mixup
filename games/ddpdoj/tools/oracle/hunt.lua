-- hunt.lua -- find the game's own once-per-frame synchronisation point.
--
-- Measured facts this builds on (see docs/worklog/ddpdoj/00-recon-oracle.md):
--   * :maincpu cpu_space reads at $FFFFF8 (IRQ4 autovector) and $FFFFFC (IRQ6)
--     fire exactly once each per video frame.
--   * At the IAK moment the 68000 has NOT yet pushed the exception frame
--     (SP reads 0x820000 = empty stack), so the interrupted PC is NOT there.
--
-- So instead: read the autovectors out of ROM, put a read tap on each handler's
-- FIRST INSTRUCTION, and at that point the short exception frame IS on the
-- stack -- (SP)=SR, (SP+2)=PC. That PC is where the main loop was when the
-- interrupt hit. A vblank busy-wait shows up as one dominant address.
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local RUN_FRAMES = tonumber(os.getenv("PROBE_FRAMES") or "900")

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]
local ROM  = M.memory.regions[":maincpu"]

TAPS = {}
SUBS = {}

local V4 = ROM:read_u32(0x70)
local V6 = ROM:read_u32(0x78)
local V2 = ROM:read_u32(0x08)   -- bus error
local V3 = ROM:read_u32(0x0c)   -- address error
p("vector_L4=%08X vector_L6=%08X buserr=%08X adrerr=%08X", V4, V6, V2, V3)
p("reset_SP=%08X reset_PC=%08X", ROM:read_u32(0x00), ROM:read_u32(0x04))

local nframe, dumped = 0, false
local hits = {}            -- [handler] = count
local fetchok = {}         -- [handler] = count where CURPC == handler
local ipc = { [V4] = {}, [V6] = {} }
local perframe = {}

local function mk(handler)
  hits[handler] = 0
  fetchok[handler] = 0
  TAPS[#TAPS+1] = PROG:install_read_tap(handler, handler + 1, "h", function(offset, data, mask)
    if CPU.state["CURPC"].value ~= handler then return data end   -- prefetch, not execution
    hits[handler] = hits[handler] + 1
    fetchok[handler] = fetchok[handler] + 1
    local sp = CPU.state["SP"].value & 0x1ffff
    local pc = RAM:read_u32((sp + 2) & 0x1ffff)
    local t = ipc[handler]
    if t then t[pc] = (t[pc] or 0) + 1 end
    perframe[nframe] = (perframe[nframe] or 0) + 1
    return data
  end)
end
mk(V4)
mk(V6)

local function top(t, label, n)
  local a = {}
  for k, v in pairs(t) do a[#a+1] = {k, v} end
  table.sort(a, function(x, y) return x[2] > y[2] end)
  p("%s_distinct=%d", label, #a)
  for i = 1, math.min(#a, n) do p("%s=%08X n=%d", label, a[i][1], a[i][2]) end
end

SUBS[#SUBS+1] = emu.add_machine_frame_notifier(function()
  nframe = SCR:frame_number()
  if nframe >= RUN_FRAMES and not dumped then
    dumped = true
    local ok, e = pcall(function()
      p("videoframes=%d", nframe)
      for h, c in pairs(hits) do
        p("handler=%08X executions=%d curpc_matched=%d", h, c, fetchok[h])
      end
      top(ipc[V4], "L4_interrupted_PC", 20)
      top(ipc[V6], "L6_interrupted_PC", 20)
      local dist = {}
      for f = 1, nframe do local c = perframe[f] or 0; dist[c] = (dist[c] or 0) + 1 end
      for c = 0, 12 do if dist[c] then p("handler_entries_per_videoframe[%d]=%d", c, dist[c]) end end
    end)
    if not ok then p("LUA_ERROR dump %s", tostring(e)) end
    M:exit()
  end
end)
