-- weapons.lua -- per-game-frame dump of the player-weapon RAM, with pokes.
--
-- RECON 2: shots, missiles, the power-up meter, Options.  The state vector is
-- the flat object arrays the firing code at $A0E9-$A234 actually indexes:
--
--   $0120+i type/sprite id (0 == slot free)   i = 0 player, 1..2 Options,
--   $0160+i subtype                                3..5 shot slot A,
--   $0320+i Y   $0340+i Ysub                       6..8 shot slot B,
--   $0360+i X   $0380+i Xsub                       9..11 missiles
--   $03A0+i timer
--   $0100+i status
--
-- plus the zero page the weapon system lives in: $35 autofire delay, $40 speed,
-- $41 missile, $42 meter cursor, $44 weapon, $45 options, $46 shield, $19, $17.
--
-- Sample point is $80B5, the same one PROBE.md proves.
--
-- Environment (all optional except WP_JSON):
--   WP_FRAMES  game frames                      WP_SCRIPT  input script
--   WP_JSON    absolute path for the JSON       WP_FROM    first frame recorded
--   WP_POKE    "44=2@400-401,45=2@400-401"      applied at $80B5, after the dump
--   WP_EXEC    hex addrs to exec-count, per frame, with A/X/Y
--   WP_WEXEC   hex addrs to exec-count only (totals, no per-frame samples)
local function say(s) print("PROBE " .. s) end

local FRAMES  = tonumber(os.getenv("WP_FRAMES") or "") or 500
local SCRIPT  = os.getenv("WP_SCRIPT") or ""
local JSON    = os.getenv("WP_JSON")
local FROM    = tonumber(os.getenv("WP_FROM") or "") or 0
local POKE_S  = os.getenv("WP_POKE") or ""
local EXEC_S  = os.getenv("WP_EXEC") or ""
local WEXEC_S = os.getenv("WP_WEXEC") or ""

local CPU = emu.memType.nesDebug
local MEM = emu.memType.nesMemory
local NMI_ENTRY = 0x806A
local FRAME_END = 0x80B5

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

local POKES = {}
for seg in string.gmatch(POKE_S, "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad poke: '" .. seg .. "' (want ADDR=VAL@FROM-TO)") end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end

local function hexlist(s)
   local out = {}
   for seg in string.gmatch(s, "[^,]+") do
      local c = string.match(seg, "^%s*%$?(%x+)%s*$")
      if c then out[#out + 1] = tonumber(c, 16) end
   end
   return out
end
local EXECS  = hexlist(EXEC_S)
local WEXECS = hexlist(WEXEC_S)

-- ---------------------------------------------------------------- state -----
local ZP = { 0x00, 0x02, 0x05, 0x07, 0x0E, 0x17, 0x18, 0x19, 0x1B, 0x22, 0x26,
             0x31, 0x35, 0x40, 0x41, 0x42, 0x44, 0x45, 0x46, 0x5C, 0x9A, 0x9B,
             0x07E4, 0x07E5, 0x07E6, 0x07E7 }
local NOBJ = 12
local gframe = 0
local rows = {}
local exechits = {}
local wexec = {}
local lag = 0
local done, failed, stopped = false, false, false

local function die(msg)
   failed = true; say("ERROR = " .. tostring(msg)); say("END"); emu.stop(3)
end

local function snap()
   local t = {}
   for _, a in ipairs(ZP) do t[#t + 1] = emu.read(a, CPU, false) end
   local function arr(base)
      local p = {}
      for i = 0, NOBJ - 1 do p[#p + 1] = emu.read(base + i, CPU, false) end
      return table.concat(p, ",")
   end
   return ('{"f":%d,"zp":[%s],"st":[%s],"ty":[%s],"sub":[%s],"y":[%s],"ys":[%s],"x":[%s],"xs":[%s],"tm":[%s]}')
      :format(gframe, table.concat(t, ","),
              arr(0x0100), arr(0x0120), arr(0x0160), arr(0x0320),
              arr(0x0340), arr(0x0360), arr(0x0380), arr(0x03A0))
end

local function on_frame_end()
   if done then return end
   if gframe >= FROM then rows[#rows + 1] = snap() end
   for _, p in ipairs(POKES) do
      if gframe >= p.from and gframe <= p.to then
         emu.write(p.addr, p.val, CPU)
      end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function write_json()
   local f = assert(io.open(JSON, "wb"))
   f:write("{\n")
   f:write(('  "frames": %d,\n'):format(gframe))
   f:write(('  "lagFrames": %d,\n'):format(lag))
   f:write(('  "zpNames": [%s],\n'):format(
      (function() local p = {} for _, a in ipairs(ZP) do p[#p+1] = ('"%02X"'):format(a) end
         return table.concat(p, ",") end)()))
   f:write('  "rows": [\n')
   for i, r in ipairs(rows) do
      f:write("    " .. r .. (i < #rows and "," or "") .. "\n")
   end
   f:write("  ],\n")
   f:write('  "exec": [\n')
   local ek = {}
   for pc in pairs(exechits) do ek[#ek + 1] = pc end
   table.sort(ek)
   for i, pc in ipairs(ek) do
      local e = exechits[pc]
      f:write(('    {"pc":%d,"n":%d,"samples":[%s]}%s\n')
              :format(pc, e.n, table.concat(e.samples, ","), i < #ek and "," or ""))
   end
   f:write("  ],\n")
   f:write('  "wexec": [\n')
   local wk = {}
   for pc in pairs(wexec) do wk[#wk + 1] = pc end
   table.sort(wk)
   for i, pc in ipairs(wk) do
      f:write(('    {"pc":%d,"n":%d}%s\n'):format(pc, wexec[pc], i < #wk and "," or ""))
   end
   f:write("  ]\n}\n")
   f:close()
end

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
         -- lag counter: $04 non-zero on NMI entry == this frame will be dropped
         emu.addMemoryCallback(function()
            if emu.read(0x04, CPU, false) ~= 0 then lag = lag + 1 end
         end, emu.callbackType.exec, NMI_ENTRY, NMI_ENTRY, emu.cpuType.nes, MEM)
         for _, pc in ipairs(EXECS) do
            exechits[pc] = { n = 0, samples = {} }
            emu.addMemoryCallback(function()
               local e = exechits[pc]
               e.n = e.n + 1
               if gframe >= FROM and #e.samples < 400 then
                  local st = emu.getState()
                  e.samples[#e.samples + 1] = ('{"f":%d,"a":%d,"x":%d,"y":%d}')
                     :format(gframe, st["cpu.a"], st["cpu.x"], st["cpu.y"])
               end
            end, emu.callbackType.exec, pc, pc, emu.cpuType.nes, MEM)
         end
         for _, pc in ipairs(WEXECS) do
            wexec[pc] = 0
            emu.addMemoryCallback(function()
               wexec[pc] = wexec[pc] + 1
            end, emu.callbackType.exec, pc, pc, emu.cpuType.nes, MEM)
         end
      end
      if done then
         if JSON then write_json() end
         say("gameFrames = " .. gframe)
         say("lagFrames = " .. lag)
         say("rows = " .. #rows)
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
