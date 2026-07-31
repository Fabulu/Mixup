-- sync.lua -- pin down the game's own once-per-frame synchronisation point.
--
-- What the disassembly (dumped to scratch, not committed) shows:
--   $000CA6  move.l $801470.l,-(A7) / rts     <- IRQ4 autovector trampoline
--   $000CBE  move.l $801478.l,-(A7) / rts     <- IRQ6 autovector trampoline
--   $13C6AC  move.b #$2,$803940
--   $13C6B4  tst.b  $803940 / bne $13C6B4     <- the busy wait
--   $13C6BC  rts
--
-- so $803940 is a vblank semaphore the main loop arms and an ISR clears, and
-- $801470/$801478 hold the REAL handler addresses (a RAM vector table).
--
-- A read tap cannot hook $13C6BC: on the 68000 the tap is the PREFETCH, and
-- $13C6BC is prefetched on every spin of the loop. A WRITE tap can: writes are
-- not speculative, so a write tap at $803940 filtered by CURPC fires exactly
-- when that store executes.
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local RUN = tonumber(os.getenv("PROBE_FRAMES") or "900")

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local function ru32(a) return RAM:read_u32(a - 0x800000) end
local function ru8(a)  return RAM:read_u8(a - 0x800000) end

local nframe = 0
local wr3940, wr3942, wr1500 = {}, {}, {}
local per3940, per1500 = {}, {}
local n3940, n1500 = 0, 0
local vec4, vec6 = {}, {}

local function wtap(addr, hist, perf, bump)
  TAPS[#TAPS+1] = PROG:install_write_tap(addr, addr | 1, "w", function(offset, data, mask)
    local pc = CPU.state["CURPC"].value
    hist[pc] = (hist[pc] or 0) + 1
    if perf then perf[nframe] = (perf[nframe] or 0) + 1 end
    return data
  end)
end
wtap(0x803940, wr3940, per3940)
wtap(0x803942, wr3942, nil)
wtap(0x801500, wr1500, per1500)

local dumped = false
local function top(t, label, n)
  local a = {}
  for k, v in pairs(t) do a[#a+1] = {k, v} end
  table.sort(a, function(x, y) return x[2] > y[2] end)
  p("%s_sites=%d", label, #a)
  for i = 1, math.min(#a, n) do p("%s CURPC=%06X n=%d", label, a[i][1], a[i][2]) end
end

SUBS[#SUBS+1] = emu.add_machine_frame_notifier(function()
  nframe = SCR:frame_number()
  local v4, v6 = ru32(0x801470), ru32(0x801478)
  vec4[v4] = (vec4[v4] or 0) + 1
  vec6[v6] = (vec6[v6] or 0) + 1
  if nframe >= RUN and not dumped then
    dumped = true
    local ok, e = pcall(function()
      p("videoframes=%d", nframe)
      top(vec4, "RAMvector_801470", 6)
      top(vec6, "RAMvector_801478", 6)
      top(wr3940, "write_803940", 8)
      top(wr3942, "write_803942", 8)
      top(wr1500, "write_801500", 8)
      local d = {}
      for f = 1, nframe do local c = per3940[f] or 0; d[c] = (d[c] or 0) + 1 end
      for c = 0, 12 do if d[c] then p("writes_803940_per_videoframe[%d]=%d", c, d[c]) end end
      local d2 = {}
      for f = 1, nframe do local c = per1500[f] or 0; d2[c] = (d2[c] or 0) + 1 end
      for c = 0, 12 do if d2[c] then p("writes_801500_per_videoframe[%d]=%d", c, d2[c]) end end
    end)
    if not ok then p("LUA_ERROR %s", tostring(e)) end
    M:exit()
  end
end)
