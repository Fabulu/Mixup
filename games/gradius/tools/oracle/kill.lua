-- kill.lua -- WHAT KILLS THE SHIP, and does the terrain map do it.
--
-- NOTES-terrain.md proves the collision map at $0500/$0600 is written from the
-- tiles the streamer queued, and that filling it with $FF kills the ship. It
-- does NOT show which instruction turns a map byte into a death, and "the ship
-- died while the map was $FF" is consistent with several routes.
--
-- Read out of the PRG, the route is:
--
--   969D  JSR $C0C7                     the collision subsystem, from mode 5
--   ...
--   C2A5  LDA $19 / CMP #$02 / BEQ $C2B0 / CMP #$04 / BNE $C2B5 / RTS
--         stage index 4 (stage 5) skips terrain collision ENTIRELY;
--         stage index 2 (stage 3) checks the PLAYER on odd $02 frames only
--   C2B5  LDA $0100 / CMP #$02 / BCS $C2C4      not while already dying
--   C2BC  JSR $C3A3                     player X/Y -> the map -> A = 2-bit field
--   C2BF  BEQ $C2C4                     empty -> no hit
--   C2C1  JMP $C1D6                     <-- DEATH BY TERRAIN
--   C1D6  $4C=$78, $0100=2, $0160=0, $0140=0, $1B=$A0, JSR $EC1E (#$F7)
--
-- This probe pokes ONE BYTE of the map -- the byte a Lua re-implementation of
-- $C3D3 says covers the player's own cell -- and asserts that $C2C1 fires on
-- that frame. Two things are being checked at once, which is the point:
--   * the ROM really reaches $C1D6 through $C2C1 (not through $C1BF/$C24B/$C290,
--     the enemy/bullet routes), and
--   * the Lua model of $C3D3's index arithmetic agrees with the cartridge,
--     because a wrong index pokes a cell the ROM does not read and NOTHING
--     happens.
--
-- Controls (K_MODE):
--   hit    poke the computed cell            -> $C2C1 must fire
--   miss   poke the cell one BLOCK ROW down  -> $C2C1 must NOT fire
--   none   poke nothing                      -> $C2C1 must NOT fire
--
-- Env: K_FRAMES K_SCRIPT K_JSON K_POKEAT K_MODE

local function say(s) print("PROBE " .. s) end

local FRAMES  = tonumber(os.getenv("K_FRAMES") or "") or 700
local SCRIPT  = os.getenv("K_SCRIPT") or ""
local JSON_OUT = os.getenv("K_JSON")
local POKEAT  = tonumber(os.getenv("K_POKEAT") or "") or 600
local MODE    = os.getenv("K_MODE") or "hit"

local CPU = emu.memType.nesDebug
local FRAME_END = 0x80B5
local NMI_ENTRY = 0x806A

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

local gframe, ef = 0, 0
local done, failed, stopped = false, false, false
local log = {}
local hits = {}          -- [pc] = frames on which it executed
local poked = {}

local function rd(a) return emu.read(a, CPU, false) end

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

-- $C3D3, re-implemented. screenX/screenY -> (page, index, field shift)
local function cell(sx, sy)
   local t   = (sx + 8) & 0xFF                 -- C3D3 LDA $A4 / ADC #$08
   local sum = t + rd(0x3E)                    -- C3D8 ADC $3E
   local a0  = (sum & 0xFF) & 0xF8             -- C3DA AND #$F8
   local carry = sum > 0xFF and 1 or 0
   local page = ((rd(0x3F) + carry) & 0x01) + 5   -- C3DE-C3E7
   local trow = ((sy + 0x14) & 0xFF) >> 3      -- C3E9-C3F1
   local idx  = (a0 + (trow >> 2)) & 0xFF      -- C3F3-C3F8
   return page, idx, (trow & 3) * 2
end

local function on_frame_end()
   if done then return end
   local px, py = rd(0x360), rd(0x320)
   local page, idx, sh = cell(px, py)
   local addr = page * 256 + idx
   if gframe == POKEAT then
      if MODE == "hit" then
         emu.write(addr, 1 << sh, CPU)
         poked[#poked + 1] = addr
      elseif MODE == "miss" then
         -- one BLOCK ROW further down: $C3F3's `+ (trow >> 2)` term + 1, i.e.
         -- 32 px lower on screen. Same tile column, a cell the ROM will not
         -- consult for this player Y.
         emu.write(addr + 1, 0xFF, CPU)
         poked[#poked + 1] = addr + 1
      end
   end
   log[#log + 1] = { gframe, rd(0x00), rd(0x1B), rd(0x0100), rd(0x4C),
                     px, py, page, idx, sh, rd(addr) }
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   f:write('{\n')
   f:write(('  "mode": "%s",\n'):format(MODE))
   f:write(('  "pokeAt": %d,\n'):format(POKEAT))
   f:write('  "poked": [' .. table.concat(poked, ",") .. '],\n')
   f:write('  "hitFrames": {')
   local ks = {}
   for k in pairs(hits) do ks[#ks + 1] = k end
   table.sort(ks)
   for i, k in ipairs(ks) do
      f:write(('%s"%04X":[%s]'):format(i > 1 and "," or "", k,
                                       table.concat(hits[k], ",")))
   end
   f:write('},\n')
   f:write('  "logFields": ["frame","mode","sub1B","p0100","timer4C",'
           .. '"playerX","playerY","page","idx","shift","mapByte"],\n')
   f:write('  "log": [\n')
   for i, r in ipairs(log) do
      f:write("    [" .. table.concat(r, ",") .. "]" ..
              (i < #log and "," or "") .. "\n")
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
         local function exec(a)
            emu.addMemoryCallback(function()
               if done then return end
               hits[a] = hits[a] or {}
               if #hits[a] < 64 then hits[a][#hits[a] + 1] = gframe end
            end, emu.callbackType.exec, a, a, emu.cpuType.nes,
            emu.memType.nesMemory)
         end
         emu.addMemoryCallback(on_frame_end, emu.callbackType.exec,
                               FRAME_END, FRAME_END, emu.cpuType.nes,
                               emu.memType.nesMemory)
         exec(0xC2A5)   -- collision subsystem, terrain part
         exec(0xC2B5)   -- past the stage-index gate
         exec(0xC2BC)   -- JSR $C3A3, the player probe
         exec(0xC2C1)   -- JMP $C1D6 -- DEATH BY TERRAIN
         exec(0xC1D6)   -- the death routine itself
         exec(0xC1BF)   -- the other three routes into $C1D6
         exec(0xC24B)
         exec(0xC290)
         exec(0xC31C)   -- the bullet-vs-terrain probe
      end
      if done then
         write_json()
         say("gameFrames = " .. #log)
         say("END")
         stopped = true
         emu.stop(0)
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
