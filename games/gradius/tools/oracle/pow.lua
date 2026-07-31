-- pow.lua -- RECON: the power-up system, end to end.
--
-- Same shape as weapons.lua (sample point $80B5, PROBE.md section 1) but it can
-- dump ANY set of the $0x00+i object arrays over ANY slot range, because the
-- capsule lives in the ENEMY half of the object pool (index 12..21, addressed by
-- the ROM as $010C,Y .. $04EC,Y) which weapons.lua does not reach.
--
-- Environment (all optional except PW_JSON):
--   PW_FRAMES  game frames                    PW_SCRIPT  input script
--   PW_JSON    absolute path for the JSON     PW_FROM    first frame recorded
--   PW_POKE    "42=6@400-401,46=5@400-401"    applied at $80B5, AFTER the dump
--   PW_ARRAYS  "0100,0300,0320,0360,0380"     object array bases to dump
--   PW_SLOTS   "0-21"                         slot range for those arrays
--   PW_ZP      "17,35,40,41,42,44,45,46,47"   1-byte addresses dumped per frame
--   PW_EXEC    hex addrs: per-hit A/X/Y + PW_EXECMEM bytes, first 400 hits
--   PW_EXECMEM hex addrs read at every PW_EXEC hit (side-effect-free reads)
--   PW_WEXEC   hex addrs: hit totals only
local function say(s) print("PROBE " .. s) end

local FRAMES  = tonumber(os.getenv("PW_FRAMES") or "") or 500
local SCRIPT  = os.getenv("PW_SCRIPT") or ""
local JSON    = os.getenv("PW_JSON")
local FROM    = tonumber(os.getenv("PW_FROM") or "") or 0
local POKE_S  = os.getenv("PW_POKE") or ""
local ARR_S   = os.getenv("PW_ARRAYS") or "0100,0300,0320,0360,0380"
local SLOT_S  = os.getenv("PW_SLOTS") or "0-21"
local ZP_S    = os.getenv("PW_ZP") or "17,35,40,41,42,44,45,46,47"
local EXEC_S  = os.getenv("PW_EXEC") or ""
local EXECM_S = os.getenv("PW_EXECMEM") or ""
local WEXEC_S = os.getenv("PW_WEXEC") or ""

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

local function hexlist(s)
   local out = {}
   for seg in string.gmatch(s, "[^,]+") do
      local c = string.match(seg, "^%s*%$?(%x+)%s*$")
      if c then out[#out + 1] = tonumber(c, 16) end
   end
   return out
end
local ARRAYS = hexlist(ARR_S)
local ZP     = hexlist(ZP_S)
local EXECS  = hexlist(EXEC_S)
local EXECM  = hexlist(EXECM_S)
local WEXECS = hexlist(WEXEC_S)

local SLO, SHI = string.match(SLOT_S, "^(%d+)%-(%d+)$")
SLO, SHI = tonumber(SLO) or 0, tonumber(SHI) or 21

local POKES = {}
for seg in string.gmatch(POKE_S, "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad poke: '" .. seg .. "' (want ADDR=VAL@FROM-TO)") end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end

-- ---------------------------------------------------------------- state -----
local gframe = 0
local rows, exechits, wexec = {}, {}, {}
local lag = 0
local done, failed, stopped = false, false, false

local function die(msg)
   failed = true; say("ERROR = " .. tostring(msg)); say("END"); emu.stop(3)
end

local function snap()
   local t = {}
   for _, a in ipairs(ZP) do t[#t + 1] = emu.read(a, CPU, false) end
   local parts = {}
   for _, base in ipairs(ARRAYS) do
      local p = {}
      for i = SLO, SHI do p[#p + 1] = emu.read(base + i, CPU, false) end
      parts[#parts + 1] = ('"a%04X":[%s]'):format(base, table.concat(p, ","))
   end
   local tail = #parts > 0 and ("," .. table.concat(parts, ",")) or ""
   return ('{"f":%d,"zp":[%s]%s}'):format(gframe, table.concat(t, ","), tail)
end

local function on_frame_end()
   if done then return end
   if gframe >= FROM then rows[#rows + 1] = snap() end
   for _, p in ipairs(POKES) do
      if gframe >= p.from and gframe <= p.to then emu.write(p.addr, p.val, CPU) end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function write_json()
   local f = assert(io.open(JSON, "wb"))
   f:write("{\n")
   f:write(('  "frames": %d,\n  "lagFrames": %d,\n'):format(gframe, lag))
   f:write(('  "slots": [%d,%d],\n'):format(SLO, SHI))
   local p = {}
   for _, a in ipairs(ZP) do p[#p + 1] = ('"%02X"'):format(a) end
   f:write(('  "zpNames": [%s],\n'):format(table.concat(p, ",")))
   p = {}
   for _, a in ipairs(EXECM) do p[#p + 1] = ('"%04X"'):format(a) end
   f:write(('  "execMem": [%s],\n'):format(table.concat(p, ",")))
   f:write('  "rows": [\n')
   for i, r in ipairs(rows) do
      f:write("    " .. r .. (i < #rows and "," or "") .. "\n")
   end
   f:write("  ],\n  \"exec\": [\n")
   local ek = {}
   for pc in pairs(exechits) do ek[#ek + 1] = pc end
   table.sort(ek)
   for i, pc in ipairs(ek) do
      local e = exechits[pc]
      f:write(('    {"pc":%d,"n":%d,"samples":[%s]}%s\n')
              :format(pc, e.n, table.concat(e.samples, ","), i < #ek and "," or ""))
   end
   f:write("  ],\n  \"wexec\": [\n")
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
                  local m = {}
                  for _, ma in ipairs(EXECM) do
                     m[#m + 1] = emu.read(ma, CPU, false)
                  end
                  e.samples[#e.samples + 1] =
                     ('{"f":%d,"a":%d,"x":%d,"y":%d,"m":[%s]}')
                     :format(gframe, st["cpu.a"], st["cpu.x"], st["cpu.y"],
                             table.concat(m, ","))
               end
            end, emu.callbackType.exec, pc, pc, emu.cpuType.nes, MEM)
         end
         for _, pc in ipairs(WEXECS) do
            wexec[pc] = 0
            emu.addMemoryCallback(function() wexec[pc] = wexec[pc] + 1 end,
                                  emu.callbackType.exec, pc, pc, emu.cpuType.nes, MEM)
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
