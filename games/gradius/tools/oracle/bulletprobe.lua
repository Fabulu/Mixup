-- bulletprobe.lua -- THE ENEMY BULLETS: $BC44 -> $BC59 -> $BDD5, slots 22-31.
--
-- Written for wave 11, after the owner hit `$BC56 BCC -> $BC59` in ordinary play
-- and the port stopped dead (docs/worklog/gradius/05-FINDING-enemy-bullets-
-- reached-in-play.md).  The plan had excluded the whole path on the reasoning
-- "no measured run has exercised them"; this probe exists so that reasoning is
-- replaced by measurement in both directions -- which scripts reach it, on which
-- frame, with what state.
--
-- The route, read out of the PRG (rip/prg.asm), NOT guessed:
--
--   BBB7  the countdown loop: for each enemy of type AND $7F >= 3, $040C,X -= $98
--         on borrow reload from $04EC,X, JSR $BC44 and LEAVE the loop
--   BC44  LDA $1A / BNE $BC59 ; LDA $19 / CMP #$02 / BCS $BC59
--   BC4E  LDX $A8 / LDA $0360 / CMP $036C,X / BCC $BC59   <- PLAYER LEFT OF ENEMY
--   BC58  RTS                                             <- no shot
--   BC59  LDX #$09 / LDA $0136,X / BEQ $BC68 / DEX / BPL  <- the allocator
--   BC63  RTS                                             <- ALLOCATION FAILURE
--   BC68  ...  $BC64,Y kind, $BC32,X muzzle offsets, then FALLS THROUGH at
--         $BCB1 into $BCB5, the aim vector ($83B5 divide)
--   BC19  ten iterations over $0136,X; a live one -> JSR $BDD5, the mover
--   C20A  the player against the ten bullets ($C24B = death, $C24E = shield)
--   C2FF  the ten bullets against the terrain
--   BF75  a live SHOT against the ten bullets
--
-- Env: BP_FRAMES BP_SCRIPT BP_JSON BP_POKE BP_DUMPFROM BP_DUMPN

local function say(s) print("PROBE " .. s) end

local FRAMES   = tonumber(os.getenv("BP_FRAMES") or "") or 900
local SCRIPT   = os.getenv("BP_SCRIPT") or ""
local JSON_OUT = os.getenv("BP_JSON")
local POKE     = os.getenv("BP_POKE") or ""
local DUMPFROM = tonumber(os.getenv("BP_DUMPFROM") or "") or -1
local DUMPN    = tonumber(os.getenv("BP_DUMPN") or "") or 0

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

-- POKE syntax, same shape as scenarios.json: "ADDR=VAL" held, "ADDR=VAL@FRAME"
-- once. Applied at $80B5, i.e. AFTER the sample, exactly like scen.py's.
local POKES = {}
for seg in string.gmatch(POKE, "[^,]+") do
   local a, v, at = string.match(seg, "^%s*(%x+)=(%d+)@(%d+)%s*$")
   if a == nil then
      a, v = string.match(seg, "^%s*(%x+)=(%d+)%s*$")
      at = nil
   end
   if a == nil then error("bad poke '" .. seg .. "'") end
   POKES[#POKES + 1] = { tonumber(a, 16), tonumber(v),
                         at and tonumber(at) or nil }
end

local gframe, ef = 0, 0
local done, failed, stopped = false, false, false
local hits, args = {}, {}
local rows, dump = {}, {}

local function rd(a) return emu.read(a, CPU, false) end

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

-- The ten enemy-bullet slots are object slots 22-31.  Every per-object array is
-- addressed base + $0C + X, and the bullet routines reach them TWO ways that
-- land on the same bytes: $0136,X with X = 0..9 ($BC19, $BC5B, $C22A, $C305) and
-- $010C,X with X = $0A..$13 ($BDD5, reached with $A9 = $0A + slot).  So slot i
-- is base + $16 + i.
local B = { status = 0x0116, anim = 0x0136, timer = 0x0156, animFrame = 0x0176,
            type = 0x0316, y = 0x0336, yf = 0x0356, x = 0x0376, xf = 0x0396,
            yvel = 0x03C6, yvelf = 0x03F6, style = 0x0416, xvel = 0x0436,
            xvelf = 0x0456, dir = 0x0476 }
local BORDER = { "status", "anim", "timer", "animFrame", "type", "y", "yf",
                 "x", "xf", "yvel", "yvelf", "style", "xvel", "xvelf", "dir" }

local function on_frame_end()
   if done then return end
   local occ, live = 0, 0
   for i = 0, 9 do
      if rd(B.anim + i) ~= 0 then occ = occ | (1 << i); live = live + 1 end
   end
   rows[#rows + 1] = { gframe, occ, live, rd(0x0360), rd(0x0320), rd(0x5D),
                       rd(0x3F), rd(0x3E), rd(0x46), rd(0x17), rd(0x0100) }
   if DUMPN > 0 and gframe >= DUMPFROM and gframe < DUMPFROM + DUMPN then
      local cells = {}
      for i = 0, 9 do
         local one = {}
         for _, k in ipairs(BORDER) do one[#one + 1] = rd(B[k] + i) end
         cells[#cells + 1] = table.concat(one, ":")
      end
      dump[#dump + 1] = { frame = gframe, s = table.concat(cells, ",") }
   end
   for _, p in ipairs(POKES) do
      if p[3] == nil or p[3] == gframe then emu.write(p[1], p[2], CPU) end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   f:write('{\n  "frames": ' .. #rows .. ',\n')
   f:write('  "hitFrames": {')
   local ks = {}
   for k in pairs(hits) do ks[#ks + 1] = k end
   table.sort(ks)
   for i, k in ipairs(ks) do
      f:write(('%s"%04X":[%s]'):format(i > 1 and "," or "", k,
                                       table.concat(hits[k], ",")))
   end
   f:write('},\n  "hitCounts": {')
   for i, k in ipairs(ks) do
      f:write(('%s"%04X":%d'):format(i > 1 and "," or "", k, hits[k].n or 0))
   end
   f:write('},\n  "args": {')
   local aks = {}
   for k in pairs(args) do aks[#aks + 1] = k end
   table.sort(aks)
   for i, k in ipairs(aks) do
      f:write(('%s"%04X":['):format(i > 1 and "," or "", k))
      for j, r in ipairs(args[k]) do
         f:write((j > 1 and "," or "") .. "[" .. table.concat(r, ",") .. "]")
      end
      f:write(']')
   end
   f:write('},\n')
   f:write('  "rowFields": ["frame","occ","live","playerX","playerY","z5D",'
           .. '"z3F","z3E","shield46","rank17","p0100"],\n')
   f:write('  "slotFields": ["' .. table.concat(BORDER, '","') .. '"],\n')
   f:write('  "rows": [\n')
   for i, r in ipairs(rows) do
      f:write("    [" .. table.concat(r, ",") .. "]" ..
              (i < #rows and "," or "") .. "\n")
   end
   f:write('  ],\n  "dump": [\n')
   for i, r in ipairs(dump) do
      f:write(('    {"frame": %d, "s": "%s"}%s\n')
              :format(r.frame, r.s, i < #dump and "," or ""))
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
         -- exec(a)        just count and remember the first 64 frames
         -- exec(a, fn)    ...and record a row of arguments read AT the
         --                instruction, which is the only place they are live
         local function exec(a, fn)
            hits[a] = { n = 0 }
            emu.addMemoryCallback(function()
               if done then return end
               hits[a].n = hits[a].n + 1
               if #hits[a] < 64 then hits[a][#hits[a] + 1] = gframe end
               if fn then
                  args[a] = args[a] or {}
                  if #args[a] < 64 then args[a][#args[a] + 1] = fn() end
               end
            end, emu.callbackType.exec, a, a, emu.cpuType.nes,
            emu.memType.nesMemory)
         end
         exec(0xBBB7)   -- the engine entry
         exec(0xBBEC)   -- past the $19/$1A ladder ($98 = the countdown step)
         exec(0xBC0C)   -- JSR $BC44 -- an enemy's countdown expired
         exec(0xBC44, function()
            local j = rd(0xA8)
            return { gframe, j, rd(0x0360), rd(0x036C + j), rd(0x032C + j),
                     rd(0x030C + j), rd(0x010C + j), rd(0x0496 + j),
                     rd(0x040C + j), rd(0x04EC + j) }
         end)
         exec(0xBC58)   -- RTS: the player was NOT left of the enemy
         exec(0xBC59, function()
            local j = rd(0xA8)
            return { gframe, j, rd(0x0360), rd(0x036C + j), rd(0x032C + j),
                     rd(0x030C + j), rd(0x010C + j), rd(0x0496 + j) }
         end)
         exec(0xBC63)   -- ALLOCATION FAILURE: all ten bullet slots busy
         -- $BC6A, NOT $BC68: an exec callback fires BEFORE the instruction, so
         -- at $BC68 ($86 A9 STX $A9) the byte still holds the previous slot.
         -- One instruction later it is the slot just allocated.
         exec(0xBC6A, function()
            return { gframe, rd(0xA9), rd(0xA8) }
         end)
         exec(0xBC77)   -- the status $80-$8F arm -> kind 1
         exec(0xBCB1)   -- the FALL-THROUGH into the aim vector
         exec(0xBCBE)   -- $17 >= 3: the LEAD-the-player arm
         exec(0xBCD8)   -- $17 <  3: aim at the player
         exec(0xBD1C, function()      -- JSR $83B5: the divide's INPUTS
            return { gframe, rd(0x9B), rd(0x9C), rd(0x9D), rd(0xA0), rd(0xA1) }
         end)
         exec(0xBD1F, function()      -- ...and its OUTPUT, $98:$99:$9A
            return { gframe, rd(0x98), rd(0x99), rd(0x9A), rd(0x9B) }
         end)
         exec(0xBD28)   -- the |dx| >= |dy| arm ($A1 == 0)
         exec(0xBD7E)   -- the steep arm
         exec(0xBD46)   -- $1A != 0 speed bump (X major)
         exec(0xBD65)   -- $17 >= 2 speed bump (X major)
         exec(0xBD9A)   -- $1A != 0 speed bump (Y major)
         exec(0xBDB9)   -- $17 >= 2 speed bump (Y major)
         exec(0xBDD5)   -- THE MOVER
         exec(0xBDE1)   -- its animation reload (status != 0)
         exec(0xBE01)   -- X positive
         exec(0xBE17)   -- X negative
         exec(0xBE39)   -- Y positive
         exec(0xBE4F)   -- Y negative
         exec(0xBE6B)   -- the mover freeing an off-box bullet
         exec(0xC20A)   -- player vs bullets
         exec(0xC22F)   -- ...a live bullet
         exec(0xC24B)   -- ...DEATH
         exec(0xC24E)   -- ...absorbed by the shield
         exec(0xC2FF)   -- bullets vs terrain
         exec(0xC30A)   -- ...a live bullet
         exec(0xC327)   -- ...freed by the terrain
         exec(0xBF75)   -- a shot vs the bullets
         exec(0xBF7D)   -- ...a live bullet
         exec(0xBF97)   -- ...type 2, the shot is consumed
         exec(0xBF9F)   -- ...the bullet is destroyed
         exec(0x83B5)   -- the divide, wherever it is called from
         emu.addMemoryCallback(on_frame_end, emu.callbackType.exec,
                               FRAME_END, FRAME_END, emu.cpuType.nes,
                               emu.memType.nesMemory)
      end
      if done then
         write_json()
         say("gameFrames = " .. #rows)
         say("END")
         stopped = true
         emu.stop(0)
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
