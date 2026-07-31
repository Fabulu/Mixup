-- playerhook.lua -- WHO WRITES THE VIC VIPER?
--
-- $0360 (player X) and $0320 (player Y) were proven by poke (PROBE.md §4) to be
-- the real variables rather than copies. This script answers the next question,
-- which a RAM diff cannot: *which instruction* stores them.
--
-- Method: a Mesen WRITE callback on a byte range, which fires with the CPU
-- mid-store. emu.getState()["cpu.pc"] at that moment is the address of the
-- instruction AFTER the store (the 6502 has already fetched the operand), so we
-- report the raw PC and let the driver map it back through the disassembly --
-- and we ALSO record the return addresses on the stack, which gives the call
-- chain without a debugger.
--
-- Everything is bucketed per GAME frame (samples at $80B5, exactly as probe.lua)
-- so writes during RAM clear / stage load are separable from per-frame movement.
--
-- Environment:
--   PH_FRAMES   game frames to run
--   PH_SCRIPT   input script, same grammar as probe.lua ("200:,10:S,90:,300:R")
--   PH_WATCH    comma-separated hex addresses or ranges: "0360,0320,07A0-07B7"
--   PH_JSON     absolute path for the JSON report
--   PH_FROM     only record writes on game frames >= this (default 0)
--   PH_STACK    how many stack return addresses to capture per write (default 3)
--   PH_TRACE    optional "0360" -- also dump every individual write to that
--               address for frames PH_FROM..PH_FROM+PH_TRACEN as a list
--   PH_TRACEN   default 8
--   PH_EXEC     comma-separated hex addresses to put EXEC hooks on; for each we
--               record hits per game frame and the A/X/Y/P registers at the hit.
--   PH_ORDER    comma-separated hex addresses; records the flat SEQUENCE in which
--               they execute, with the CPU cycle count, for PH_ORDERN game frames
--               starting at PH_FROM. Order is semantics in this project, so it is
--               measured rather than read off the listing.
--   PH_ORDERN   default 2
--
-- Paths must be ABSOLUTE (PROBE.md §6: Mesen's cwd is not ours).

local function say(s) print("PROBE " .. s) end

local FRAMES  = tonumber(os.getenv("PH_FRAMES") or "") or 500
local SCRIPT  = os.getenv("PH_SCRIPT") or ""
local WATCH_S = os.getenv("PH_WATCH") or "0360,0320"
local JSON    = os.getenv("PH_JSON")
local FROM    = tonumber(os.getenv("PH_FROM") or "") or 0
local NSTACK  = tonumber(os.getenv("PH_STACK") or "") or 3
local TRACE_S = os.getenv("PH_TRACE") or ""
local TRACEN  = tonumber(os.getenv("PH_TRACEN") or "") or 8
local EXEC_S  = os.getenv("PH_EXEC") or ""
local POKE_S  = os.getenv("PH_POKE") or ""   -- "0100=3@400-459", same as probe.lua
local ORDER_S = os.getenv("PH_ORDER") or ""
local ORDERN  = tonumber(os.getenv("PH_ORDERN") or "") or 2

local CPU = emu.memType.nesDebug          -- side-effect free CPU space
local MEM = emu.memType.nesMemory         -- what callbacks are registered on

local NMI_ENTRY = 0x806A
local FRAME_END = 0x80B5                  -- STA $04, the proven sample point

-- ---------------------------------------------------------------- input ------
local BUTTON = { U = "up", D = "down", L = "left", R = "right",
                 A = "a", B = "b", S = "start", E = "select" }
local function parse_script(s)
   local out = {}
   for seg in string.gmatch(s, "[^,]+") do
      local n, keys = string.match(seg, "^%s*(%d+)%s*:%s*(.-)%s*$")
      if n == nil then error("bad script segment: '" .. seg .. "'") end
      local t = {}
      for c in string.gmatch(keys:upper(), ".") do
         local b = BUTTON[c]
         if b == nil then error("unknown button '" .. c .. "'") end
         t[b] = true
      end
      for _ = 1, tonumber(n) do out[#out + 1] = t end
   end
   return out
end
local INPUT = parse_script(SCRIPT)

-- --------------------------------------------------------------- ranges ------
local RANGES = {}
for seg in string.gmatch(WATCH_S, "[^,]+") do
   local a, b = string.match(seg, "^%s*%$?(%x+)%s*%-%s*%$?(%x+)%s*$")
   if a then
      RANGES[#RANGES + 1] = { lo = tonumber(a, 16), hi = tonumber(b, 16) }
   else
      local c = string.match(seg, "^%s*%$?(%x+)%s*$")
      if c then local v = tonumber(c, 16); RANGES[#RANGES + 1] = { lo = v, hi = v } end
   end
end

local EXECS = {}
for seg in string.gmatch(EXEC_S, "[^,]+") do
   local c = string.match(seg, "^%s*%$?(%x+)%s*$")
   if c then EXECS[#EXECS + 1] = tonumber(c, 16) end
end

local ORDERS = {}
for seg in string.gmatch(ORDER_S, "[^,]+") do
   local c = string.match(seg, "^%s*%$?(%x+)%s*$")
   if c then ORDERS[#ORDERS + 1] = tonumber(c, 16) end
end

local TRACE_ADDR = nil
if TRACE_S ~= "" then TRACE_ADDR = tonumber((TRACE_S:gsub("%$", "")), 16) end

-- ---------------------------------------------------------------- state ------
local gframe   = 0
local sites    = {}   -- key "AAAA|PPPP" -> {addr, pc, n, frames={}, chain}
local order    = {}
local percall  = {}   -- key "AAAA|PPPP" -> per-frame count histogram
local traces   = {}   -- individual writes for TRACE_ADDR
local exechits = {}   -- pc -> { n, samples = {..} }
local seqlog   = {}   -- flat execution order for the ORDER address set
local frame_writes = {}   -- per game frame: number of writes seen, for sanity
local done, failed, stopped = false, false, false

local function die(msg)
   failed = true; say("ERROR = " .. tostring(msg)); say("END"); emu.stop(3)
end

-- Return addresses sitting on the 6502 stack, top first. Each JSR pushed the
-- address of the LAST byte of the JSR instruction, so caller = value + 1.
local function callchain(sp, n)
   local out = {}
   local p = sp + 1
   local guard = 0
   while #out < n and p <= 0xFF and guard < 40 do
      local lo = emu.read(0x0100 + p, CPU, false)
      local hi = emu.read(0x0100 + ((p + 1) & 0xFF), CPU, false)
      local v = lo | (hi << 8)
      if v >= 0x8000 and v <= 0xFFFF then out[#out + 1] = (v + 1) & 0xFFFF end
      p = p + 1
      guard = guard + 1
   end
   return out
end

local function on_write(address, value)
   if gframe < FROM then return end
   local st = emu.getState()
   local pc = st["cpu.pc"]
   local key = string.format("%04X|%04X", address, pc)
   local s = sites[key]
   if s == nil then
      s = { addr = address, pc = pc, n = 0, firstFrame = gframe,
            chain = callchain(st["cpu.sp"], NSTACK),
            a = st["cpu.a"], x = st["cpu.x"], y = st["cpu.y"], val = value,
            perframe = {} }
      sites[key] = s
      order[#order + 1] = key
   end
   s.n = s.n + 1
   s.lastFrame = gframe
   s.perframe[gframe] = (s.perframe[gframe] or 0) + 1
   frame_writes[gframe] = (frame_writes[gframe] or 0) + 1

   if TRACE_ADDR and address == TRACE_ADDR and gframe >= FROM
      and gframe < FROM + TRACEN then
      traces[#traces + 1] = { f = gframe, pc = pc, v = value,
                              a = st["cpu.a"], x = st["cpu.x"], y = st["cpu.y"],
                              held = emu.read(0x07, CPU, false),
                              scan = st["ppu.scanline"] }
   end
end

-- "0100=3@400-459" -> forced RAM at the sample point, so a gate can be proved by
-- INTERVENTION rather than by waiting for the game to happen to take it.
local POKES = {}
for seg in string.gmatch(POKE_S, "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad poke: '" .. seg .. "' (want ADDR=VAL@FROM-TO)") end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end

local function on_frame_end()
   if done then return end
   for _, p in ipairs(POKES) do
      if gframe >= p.from and gframe <= p.to then
         emu.write(p.addr, p.val, CPU)
      end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

-- ---------------------------------------------------------------- JSON -------
local function jarr(t)
   local p = {}
   for _, v in ipairs(t) do p[#p + 1] = tostring(v) end
   return "[" .. table.concat(p, ",") .. "]"
end

local function write_json()
   local f = assert(io.open(JSON, "wb"))
   f:write("{\n")
   f:write(('  "frames": %d,\n'):format(gframe))
   f:write(('  "watch": "%s",\n'):format(WATCH_S))
   f:write(('  "from": %d,\n'):format(FROM))
   f:write('  "sites": [\n')
   for i, key in ipairs(order) do
      local s = sites[key]
      -- per-frame counts, compacted: only frames where it fired
      local fl, cl = {}, {}
      for fr, c in pairs(s.perframe) do fl[#fl + 1] = fr end
      table.sort(fl)
      local maxper, distinct = 0, {}
      for _, fr in ipairs(fl) do
         local c = s.perframe[fr]
         if c > maxper then maxper = c end
         distinct[c] = true
      end
      local dc = {}
      for c in pairs(distinct) do dc[#dc + 1] = c end
      table.sort(dc)
      f:write(('    {"addr":%d,"pc":%d,"n":%d,"firstFrame":%d,"lastFrame":%d,'
               .. '"framesHit":%d,"maxPerFrame":%d,"perFrameCounts":%s,'
               .. '"chain":%s,"firstA":%d,"firstX":%d,"firstY":%d,"firstVal":%d}%s\n')
              :format(s.addr, s.pc, s.n, s.firstFrame, s.lastFrame or s.firstFrame,
                      #fl, maxper, jarr(dc), jarr(s.chain),
                      s.a or 0, s.x or 0, s.y or 0, s.val or 0,
                      i < #order and "," or ""))
   end
   f:write("  ],\n")
   f:write('  "traces": [\n')
   for i, t in ipairs(traces) do
      f:write(('    {"f":%d,"pc":%d,"v":%d,"a":%d,"x":%d,"y":%d,"held":%d,"scan":%d}%s\n')
              :format(t.f, t.pc, t.v, t.a, t.x, t.y, t.held, t.scan,
                      i < #traces and "," or ""))
   end
   f:write("  ],\n")
   f:write('  "order": [\n')
   for i, s in ipairs(seqlog) do
      f:write("    " .. s .. (i < #seqlog and "," or "") .. "\n")
   end
   f:write("  ],\n")
   f:write('  "exec": [\n')
   local ek = {}
   for pc in pairs(exechits) do ek[#ek + 1] = pc end
   table.sort(ek)
   for i, pc in ipairs(ek) do
      local e = exechits[pc]
      f:write(('    {"pc":%d,"n":%d,"samples":[%s]}%s\n')
              :format(pc, e.n, table.concat(e.samples, ","),
                      i < #ek and "," or ""))
   end
   f:write("  ]\n}\n")
   f:close()
end

-- ------------------------------------------------------------- callbacks -----
emu.addEventCallback(function()
   local t = INPUT[gframe + 1]
   if t and next(t) ~= nil then emu.setInput(t, 0) end
end, emu.eventType.inputPolled)

local ef = 0
emu.addEventCallback(function()
   if failed or stopped then return end
   local ok, err = pcall(function()
      ef = ef + 1
      if ef == 1 then
         local v = emu.read(0xFFFA, CPU, false) | (emu.read(0xFFFB, CPU, false) << 8)
         if v ~= NMI_ENTRY then
            die(("NMI vector is $%04X, expected $%04X"):format(v, NMI_ENTRY)); return
         end
         emu.addMemoryCallback(on_frame_end, emu.callbackType.exec,
                               FRAME_END, FRAME_END, emu.cpuType.nes, MEM)
         for _, r in ipairs(RANGES) do
            emu.addMemoryCallback(on_write, emu.callbackType.write,
                                  r.lo, r.hi, emu.cpuType.nes, MEM)
         end
         for _, pc in ipairs(EXECS) do
            exechits[pc] = { n = 0, samples = {} }
            emu.addMemoryCallback(function()
               local e = exechits[pc]
               e.n = e.n + 1
               if gframe >= FROM and #e.samples < 240 then
                  local st = emu.getState()
                  e.samples[#e.samples + 1] = ('{"f":%d,"a":%d,"x":%d,"y":%d,"p":%d}')
                     :format(gframe, st["cpu.a"], st["cpu.x"], st["cpu.y"], st["cpu.ps"] or 0)
               end
            end, emu.callbackType.exec, pc, pc, emu.cpuType.nes, MEM)
         end
         -- ORDER: one flat log across ALL the listed addresses, so the sequence
         -- inside a frame is a measurement rather than a reading of the listing.
         for _, pc in ipairs(ORDERS) do
            emu.addMemoryCallback(function()
               if gframe >= FROM and gframe < FROM + ORDERN then
                  local st = emu.getState()
                  seqlog[#seqlog + 1] =
                     ('{"f":%d,"pc":%d,"cyc":%d,"scan":%d,"a":%d,"x":%d,"y":%d}')
                     :format(gframe, pc, st["cpu.cycleCount"], st["ppu.scanline"],
                             st["cpu.a"], st["cpu.x"], st["cpu.y"])
               end
            end, emu.callbackType.exec, pc, pc, emu.cpuType.nes, MEM)
         end
      end
      if done then
         if JSON then write_json() end
         say("gameFrames = " .. gframe)
         say("distinctSites = " .. #order)
         for _, key in ipairs(order) do
            local s = sites[key]
            say(("site addr=$%04X pc=$%04X n=%d frames=%d..%d")
                :format(s.addr, s.pc, s.n, s.firstFrame, s.lastFrame or s.firstFrame))
         end
         say("END")
         stopped = true
         emu.stop(0)
      end
      if ef > FRAMES * 3 + 900 then
         die("watchdog: " .. ef .. " emulator frames, " .. gframe .. " game frames")
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
