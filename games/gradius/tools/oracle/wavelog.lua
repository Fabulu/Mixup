-- wavelog.lua -- VALIDATE the statically decoded wave script against the cartridge.
--
-- tools/oracle/wavedump.py decodes every stage's spawn script straight out of
-- assets/prg.bin. That is the INVENTORY. This is the VERDICT half: it hooks the
-- wave decoder on the running cartridge and logs, for every record that
-- actually fires, the cursor address, the two script bytes, the scroll position
-- and which of the three spawn routes ran. Diffing that against wavedump.py's
-- table is what turns "I read the ROM" into "the ROM reads the way I said".
--
-- Hooks:
--   $A335  the record fired ($6A:$6B still points at it, Y = 0)
--   $A3B1  cmd < $80   -> the single-enemy spawn
--   $A3E4  cmd $80-$EF -> the formation spawn
--   $A466  cmd >= $F0  -> the inline 5-byte spawner
--   $AE19  the per-type dispatch (A = the type byte) -> type histogram
--   $9A56  $3F reached the boss page ($1B = $81)
--
-- Env: WL_FRAMES WL_SCRIPT WL_JSON WL_POKE   (same grammar as throwaudit.lua)

local function say(s) print("PROBE " .. s) end

local FRAMES   = tonumber(os.getenv("WL_FRAMES") or "") or 6500
local SCRIPT   = os.getenv("WL_SCRIPT") or ""
local JSON_OUT = os.getenv("WL_JSON")
local POKE     = os.getenv("WL_POKE") or ""

local CPU = emu.memType.nesDebug
local FRAME_END = 0x80B5

local BUTTON = { U = "up", D = "down", L = "left", R = "right",
                 A = "a", B = "b", S = "start", E = "select" }
local INPUT = {}
for seg in string.gmatch(SCRIPT, "[^,]+") do
   local n, keys = string.match(seg, "^%s*(%d+)%s*:%s*(.-)%s*$")
   if n == nil then error("bad script segment: '" .. seg .. "'") end
   local t = {}
   for c in string.gmatch(keys:upper(), ".") do
      local b = BUTTON[c]
      if b == nil then error("unknown button '" .. c .. "'") end
      t[b] = true
   end
   for _ = 1, tonumber(n) do INPUT[#INPUT + 1] = t end
end

local POKES = {}
for seg in string.gmatch(POKE, "[^,]+") do
   local a, v, at = string.match(seg, "^%s*(%x+)=(%d+)@(%d+)%s*$")
   if a == nil then
      a, v = string.match(seg, "^%s*(%x+)=(%d+)%s*$")
      at = nil
   end
   if a == nil then error("bad poke '" .. seg .. "'") end
   POKES[#POKES + 1] = { tonumber(a, 16), tonumber(v), at and tonumber(at) or nil }
end

local gframe, ef = 0, 0
local done, failed, stopped = false, false, false
local recs = {}              -- one row per fired record
local pending = nil          -- the row waiting for its route hook
local typehist = {}
local routes = { A3B1 = 0, A3E4 = 0, A466 = 0 }
local maxScroll, bossFrame = 0, nil
local nrec = 0

local function rd(a) return emu.read(a, CPU, false) end

local function on_A335()
   if done then return end
   local lo, hi = rd(0x6A), rd(0x6B)
   local cur = hi * 256 + lo
   local b0, b1 = rd(cur), rd(cur + 1)
   if b0 == 0xFF then return end          -- terminator, $A345 RTS, no spawn
   nrec = nrec + 1
   pending = { f = gframe, cur = cur, b0 = b0, b1 = b1,
               s = rd(0x3F) * 256 + rd(0x3E), c61 = rd(0x61),
               st = rd(0x19), mode = rd(0x1B), route = "?" }
   -- keep at most 1200 rows; that is far more records than any stage has
   if #recs < 1200 then recs[#recs + 1] = pending end
end

local function route(name)
   return function()
      if done then return end
      routes[name] = routes[name] + 1
      if pending then pending.route = name; pending = nil end
   end
end

local function on_dispatch()
   if done then return end
   local a = emu.getState()["cpu.a"]
   typehist[a] = (typehist[a] or 0) + 1
end

local function on_frame_end()
   if done then return end
   local s = rd(0x3F) * 256 + rd(0x3E)
   if s > maxScroll then maxScroll = s end
   for _, p in ipairs(POKES) do
      if p[3] == nil or p[3] == gframe then emu.write(p[1], p[2], CPU) end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   f:write('{\n  "frames": ' .. gframe .. ',\n')
   f:write('  "maxScroll": ' .. maxScroll .. ',\n')
   f:write('  "records": ' .. nrec .. ',\n')
   f:write('  "bossFrame": ' .. (bossFrame and tostring(bossFrame) or "null") .. ',\n')
   f:write('  "routes": {"A3B1":' .. routes.A3B1 .. ',"A3E4":' .. routes.A3E4
           .. ',"A466":' .. routes.A466 .. '},\n')
   local ks = {}
   for k in pairs(typehist) do ks[#ks + 1] = k end
   table.sort(ks)
   local parts = {}
   for _, k in ipairs(ks) do
      parts[#parts + 1] = ('"%02X":%d'):format(k, typehist[k])
   end
   f:write('  "typeHist": {' .. table.concat(parts, ",") .. '},\n')
   f:write('  "fired": [\n')
   for i, r in ipairs(recs) do
      f:write(('    {"f":%d,"cur":"%04X","b0":%d,"b1":%d,"scroll":%d,"c61":%d,'
               .. '"stage":%d,"mode":%d,"route":%q}%s\n')
              :format(r.f, r.cur, r.b0, r.b1, r.s, r.c61, r.st, r.mode,
                      r.route, i < #recs and "," or ""))
   end
   f:write('  ]\n}\n')
   f:close()
end

emu.addEventCallback(function()
   local t = INPUT[gframe + 1]
   if t and next(t) ~= nil then emu.setInput(t, 0) end
end, emu.eventType.inputPolled)

emu.addEventCallback(function()
   if failed or stopped then return end
   local ok, err = pcall(function()
      ef = ef + 1
      if ef == 1 then
         local function hook(a, fn)
            emu.addMemoryCallback(fn, emu.callbackType.exec, a, a,
                                  emu.cpuType.nes, emu.memType.nesMemory)
         end
         hook(0xA335, on_A335)
         hook(0xA3B1, route("A3B1"))
         hook(0xA3E4, route("A3E4"))
         hook(0xA466, route("A466"))
         hook(0xAE19, on_dispatch)
         hook(0x9A56, function()
            if done then return end
            if bossFrame == nil then bossFrame = gframe end
         end)
         hook(FRAME_END, on_frame_end)
      end
      if done then
         stopped = true
         write_json()
         say("frames = " .. gframe)
         say("records = " .. nrec)
         say("maxScroll = " .. maxScroll)
         say("END")
         emu.stop(0)
      end
   end)
   if not ok then
      failed = true
      say("ERROR = " .. tostring(err))
      say("END")
      emu.stop(3)
   end
end, emu.eventType.startFrame)
