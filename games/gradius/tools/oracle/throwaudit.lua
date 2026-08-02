-- throwaudit.lua -- WHICH UNPORTED PATHS DOES A PLAYER ACTUALLY REACH?
--
-- Wave 12.  The eight-wave plan excluded a list of paths on the reasoning "no
-- measured run has exercised them", and the owner falsified that reasoning
-- TWICE in one evening, in ordinary play: the enemy-bullet allocator $BC59
-- (05-FINDING-enemy-bullets-reached-in-play.md) and the single-enemy spawn
-- $A3B1 (06-FINDING-scroll-coverage.md).  Both were facts about OUR SAMPLING
-- promoted into claims about the cartridge.
--
-- So this asks the question mechanically instead of by argument.  Every loud
-- named throw in games/gradius/src/ carries the ROM address it would have
-- reached.  Put an EXEC CALLBACK on each of those addresses, drive the
-- CARTRIDGE with long, varied input, and count.  A non-zero count is a throw a
-- player can hit.  A zero count is NOT proof of absence -- it is one more fact
-- about one more sample, and the whole point of this file is that we now say so.
--
-- It also samples the RAM GATES per frame, because several throws are not a
-- branch the cartridge takes but a VALUE the port refuses ($18 != 0 two-player,
-- $19 == 4 stage 5, $1A, $3A, $5C, the rank $17).  For those an address hook
-- would answer the wrong question; the distinct values seen over the run is the
-- answer.
--
-- Env: TA_FRAMES TA_SCRIPT TA_JSON TA_POKE

local function say(s) print("PROBE " .. s) end

local FRAMES   = tonumber(os.getenv("TA_FRAMES") or "") or 3000
local SCRIPT   = os.getenv("TA_SCRIPT") or ""
local JSON_OUT = os.getenv("TA_JSON")
local POKE     = os.getenv("TA_POKE") or ""

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

-- Same poke syntax as scenarios.json / bulletprobe.lua: "ADDR=VAL" held every
-- frame, "ADDR=VAL@FRAME" once.  Applied at $80B5, i.e. after the frame sample.
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

-- ==========================================================================
-- THE HOOK LIST.  Each row is { address, name }.  The name is the throw in
-- src/ that this address is the ROM half of; grep for it there.  Rows marked
-- (ported) are CONTROLS: they must be non-zero on a run that reaches them, or
-- the harness is measuring nothing.
-- ==========================================================================
local HOOKS = {
   -- ---- the spawn engine ------------------------------------------------
   { 0xA3B1, "A3B1 single-enemy spawn (PORTED wave 12)" },
   { 0xA37A, "A37A cmd >= $F0 inline 5-byte record" },
   { 0xA466, "A466 the >= $F0 spawner body" },
   { 0xA46F, "A46F >= $F0 allocator R" },
   { 0xA4A6, "A4A6 >= $F0 allocator S (DEX/BNE, never tests slot 12)" },
   { 0xC413, "C413 stage advance ($3A != 0 at $A2C4, $1B = $82 at $A2FB)" },
   { 0xA2C0, "A2C0 spawn engine entry (control)" },
   -- ---- the enemy-bullet engine -----------------------------------------
   { 0xBBC3, "BBC3 the $19/$1A/$02-parity/$46/$17 countdown ladder" },
   { 0xBBE5, "BBE5 the $17 >= 3 rank bump" },
   { 0xBC59, "BC59 enemy-bullet allocator (PORTED wave 11)" },
   { 0xBC63, "BC63 enemy-bullet allocation FAILURE (PORTED wave 11)" },
   { 0xBC77, "BC77 bullet kind 1 (firing enemy status $80-$8F)" },
   -- ---- the 42-entry handler table at $AE1C -----------------------------
   { 0xAE70, "hdlr entries 0/31 RTS (PORTED)" },
   { 0xAEDD, "hdlr 1/39/41 $AEDD (PORTED)" },
   { 0xAE99, "hdlr 2 $AE99 (PORTED)" },
   { 0xAEE1, "hdlr 3 $AEE1 (PORTED)" },
   { 0xB205, "hdlr 4 $B205 (PORTED)" },
   { 0xB0AF, "hdlr 5 $B0AF the fan (PORTED)" },
   { 0xB198, "hdlr 6 $B198 the arc (PORTED wave 12)" },
   { 0xB6E1, "hdlr 7 $B6E1" },
   { 0xB26C, "hdlr 8 $B26C the wavy one (PORTED)" },
   { 0xB311, "hdlr 9 $B311" },
   { 0xB36F, "hdlr 10 $B36F" },
   { 0xB37F, "hdlr 11 $B37F" },
   { 0xB3CB, "hdlr 12 $B3CB" },
   { 0xB402, "hdlr 13 $B402" },
   { 0xB434, "hdlr 14 $B434" },
   { 0xAF2E, "hdlr 15 $AF2E" },
   { 0xAF88, "hdlr 16 $AF88" },
   { 0xB026, "hdlr 17 $B026 turret, floor form (PORTED wave 12)" },
   { 0xB098, "hdlr 18 $B098 turret, ceiling form (PORTED wave 12)" },
   { 0xB747, "hdlr 19 $B747" },
   { 0xCA5E, "hdlr 20 $CA5E" },
   { 0xB377, "hdlr 21 $B377" },
   { 0xC906, "hdlr 22 $C906" },
   { 0xB7A1, "hdlr 23 $B7A1" },
   { 0xB914, "hdlr 24 $B914 (also the fall-through of entry 25)" },
   { 0xB913, "hdlr 25 $B913" },
   { 0xB480, "hdlr 26 $B480" },
   { 0xB4F2, "hdlr 27 $B4F2" },
   { 0xB4FD, "hdlr 28 $B4FD" },
   { 0xB559, "hdlr 29 $B559" },
   { 0xB569, "hdlr 30 $B569" },
   { 0xAF10, "hdlr 32-37 $AF10" },
   { 0xB61E, "hdlr 38 $B61E" },
   { 0xBB0F, "hdlr 40 $BB0F" },
   -- ---- collision -------------------------------------------------------
   { 0xC03D, "C03D stage-5 second shot sweep" },
   { 0xC05F, "C05F the ARMOURED branch (PORTED wave 22)" },
   -- WAVE 22 added the three arms BEHIND $C05F, because reaching $C05F is not
   -- the same fact as taking damage: $C070's BEQ turns an armoured enemy with
   -- $048C == 0 away, and only the hatch opens that gate. $AF76/$AF7E are the
   -- warp counter, which needs the hatch DEAD.
   { 0xC086, "C086 the armour damage accumulator actually storing (PORTED w22)" },
   { 0xAF76, "AF76 INC $5F -- a hatch died at an EVEN score digit (PORTED w22)" },
   { 0xAF7E, "AF7E INC $39 -- the fourth such hatch: the WARP flag (PORTED w22)" },
   { 0xAF80, "AF80 a hatch was DESTROYED, warp or not (PORTED w22)" },
   { 0xC099, "C099 the type-$9A hit counter" },
   { 0xC13D, "C13D enemy type $27 touched the ship" },
   { 0xC159, "C159 enemy type $29 touched the ship" },
   { 0xC18C, "C18C the every-16th capsule / destroy-everything arm" },
   { 0xC263, "C263 stage-5 destructible-block sweep" },
   { 0xC290, "C290 stage-5 route into $C1D6" },
   { 0xC2DC, "C2DC a shot hit a BREAKABLE wall (field 2)" },
   { 0xC32F, "C32F the wall-break VRAM patch" },
   { 0xC24B, "C24B an enemy bullet killed the ship (PORTED wave 11)" },
   { 0xC1D6, "C1D6 the death routine (PORTED wave 5, control)" },
   -- ---- flow / nmi ------------------------------------------------------
   -- NOTE the addresses here are the ARMS, not the tests. $9663 is
   -- `LDA $19 / CMP #$04 / BNE $96A5` and executes on EVERY frame; $9669 is
   -- the stage-5 census the port refuses. Getting this wrong is how a hook
   -- reports 1613 hits for a path nothing reaches -- measured, first attempt.
   { 0x9669, "9669 the stage-5 $5C census" },
   { 0x96CF, "96CF NEXT STAGE ($1B bit 4)" },
   { 0x96FB, "96FB GAME OVER ($1B bit 6)" },
   { 0x97F1, "97F1 lives went negative -> game over" },
   { 0x9A56, "9A56 $3F reached the boss page -> $1B = $81" },
   { 0x9A4D, "9A4D play sub-state $80 (PORTED, control)" },
   { 0x9A0E, "9A0E play sub-state $81 (end of stage)" },
   { 0x99E9, "99E9 play sub-state $82" },
   { 0x99C0, "99C0 play sub-state $83" },
   { 0x9982, "9982 play sub-state $84" },
   { 0x997E, "997E play sub-state $85" },
   { 0x9904, "9904 play sub-state $86" },
   { 0x988C, "988C play sub-state $8B" },
   { 0x98DD, "98DD play sub-state $8C" },
   { 0x98E5, "98E5 play sub-state $8D" },
   { 0x984F, "984F play sub-states $8E/$8F" },
   { 0x9C5E, "9C5E the pause-screen button-code CHEAT grant" },
   { 0x8473, "8473 the $09 gate that suppresses scoring (attract demo)" },
   -- ---- weapons ---------------------------------------------------------
   { 0xA19E, "A19E the missile CRAWL path" },
   -- ---- the two tables wave 12 exported, so their index range is measured
   { 0xB1C5, "B1C5 LDA $B200,Y -- the arc schedule index" },
   { 0xB06D, "B06D LDA $B086,Y -- the turret direction code" },
}

local gframe, ef = 0, 0
-- `stopped` exists because emu.stop() is ASYNCHRONOUS: the event handler runs
-- at least once more after it, and without this the final report prints twice
-- with different counters. PROBE.md 6 says so; this is the same guard.
local done, failed, stopped = false, false, false
local hits, firsts = {}, {}
local yhist = {}          -- per-address histogram of the Y register
local gates = {}          -- per-address histogram of a watched RAM byte
local deaths, lives_min = 0, 255

-- The throws that are NOT a branch the cartridge takes but a VALUE the port
-- refuses. $A17C (`LDA $19 / CMP #$04`) and $C3AD (`LDA $0360 / BNE`) have no
-- arm address of their own -- both land on code the normal path also reaches --
-- so the only honest measurement is the value.
local GATE_ADDR = { 0x18, 0x19, 0x1A, 0x3A, 0x1B, 0x5C, 0x17, 0x42, 0x44,
                    0x45, 0x46, 0x0E, 0x20, 0x0D, 0x60, 0x41, 0x09, 0x33 }
local maxScrollHi, maxScrollLo = 0, 0

local function rd(a) return emu.read(a, CPU, false) end

local function on_frame_end()
   if done then return end
   for _, a in ipairs(GATE_ADDR) do
      local v = rd(a)
      gates[a] = gates[a] or {}
      gates[a][v] = (gates[a][v] or 0) + 1
   end
   -- $0360 is the player's X; the port's $C3AD throw is "it is 0". Folded in
   -- here as a gate rather than a hook, for the reason above.
   local px = rd(0x0360)
   gates[0x360] = gates[0x360] or {}
   gates[0x360][px == 0 and 0 or 1] = (gates[0x360][px == 0 and 0 or 1] or 0) + 1
   local hi, lo = rd(0x3F), rd(0x3E)
   if hi * 256 + lo > maxScrollHi * 256 + maxScrollLo then
      maxScrollHi, maxScrollLo = hi, lo
   end
   local l = rd(0x20)
   if l < lives_min and l < 128 then lives_min = l end
   for _, p in ipairs(POKES) do
      if p[3] == nil or p[3] == gframe then emu.write(p[1], p[2], CPU) end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   f:write('{\n  "frames": ' .. gframe .. ',\n')
   f:write('  "maxScroll": ' .. (maxScrollHi * 256 + maxScrollLo) .. ',\n')
   f:write('  "hooks": [\n')
   for i, h in ipairs(HOOKS) do
      local a = h[1]
      local ys = {}
      if yhist[a] then
         local ks = {}
         for k in pairs(yhist[a]) do ks[#ks + 1] = k end
         table.sort(ks)
         for _, k in ipairs(ks) do
            ys[#ys + 1] = ('"%d":%d'):format(k, yhist[a][k])
         end
      end
      f:write(('    {"rom":"%04X","name":%q,"n":%d,"first":%s,"y":{%s}}%s\n')
              :format(a, h[2], hits[a] or 0,
                      firsts[a] and tostring(firsts[a]) or "null",
                      table.concat(ys, ","),
                      i < #HOOKS and "," or ""))
   end
   f:write('  ],\n  "gates": {\n')
   local GA = {}
   for _, a in ipairs(GATE_ADDR) do GA[#GA + 1] = a end
   GA[#GA + 1] = 0x360
   for i, a in ipairs(GA) do
      local ks = {}
      for k in pairs(gates[a] or {}) do ks[#ks + 1] = k end
      table.sort(ks)
      local parts = {}
      for _, k in ipairs(ks) do
         parts[#parts + 1] = ('"%d":%d'):format(k, gates[a][k])
      end
      f:write(('    "%04X": {%s}%s\n'):format(a, table.concat(parts, ","),
                                              i < #GA and "," or ""))
   end
   f:write('  }\n}\n')
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
         for _, h in ipairs(HOOKS) do
            local a = h[1]
            hits[a] = 0
            emu.addMemoryCallback(function()
               if done then return end
               hits[a] = hits[a] + 1
               if firsts[a] == nil then firsts[a] = gframe end
               -- $B1C5 and $B06D are `LDA table,Y`: the Y register at that
               -- instant IS the index, and the index range is the whole
               -- question for a table exported at its measured length.
               if a == 0xB1C5 or a == 0xB06D then
                  local y = emu.getState()["cpu.y"]
                  yhist[a] = yhist[a] or {}
                  yhist[a][y] = (yhist[a][y] or 0) + 1
               end
            end, emu.callbackType.exec, a, a, emu.cpuType.nes,
            emu.memType.nesMemory)
         end
         emu.addMemoryCallback(on_frame_end, emu.callbackType.exec,
                               FRAME_END, FRAME_END, emu.cpuType.nes,
                               emu.memType.nesMemory)
      end
      if done then
         stopped = true
         write_json()
         say("frames = " .. gframe)
         say("maxScroll = " .. (maxScrollHi * 256 + maxScrollLo))
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
