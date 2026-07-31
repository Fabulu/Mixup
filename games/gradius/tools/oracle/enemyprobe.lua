-- enemyprobe.lua -- THE ENEMY SYSTEM, measured on the cartridge.
--
-- Companion to probe.lua / objloop.lua. Same sample point ($80B5, proven in
-- PROBE.md section 1), same input grammar, same absolute-paths rule.
--
-- What it measures, and why each one is here:
--
--   * the OCCUPANCY of all 32 object slots per game frame -- $0100+i (status),
--     $0120+i (metasprite id), $0300+i (enemy type / "alive" byte), $0320+i (Y),
--     $0360+i (X).  The port needs to know which slots enemies may take and
--     which they may not; a bitmap per frame answers that by observation rather
--     than by trusting the four allocator loops in the listing.
--
--   * ALLOCATION, success and FAILURE, per allocator.  There are four separate
--     free-slot searches in the spawn engine and they are NOT identical -- one
--     of them uses `DEX / BNE` where the others use `DEX / BPL`.  Failure is
--     gameplay (the spawn is silently dropped), so it is counted, not inferred.
--
--   * the per-type DISPATCH.  $AE19 is `JSR $83E4` with an inline 16-bit table
--     at $AE1C; $83E4 indexes it with A*2.  Hooking $AE19 and reading A gives
--     the histogram of enemy types that actually run, which is the only honest
--     way to know which of the 42 table entries stage 1 exercises.
--
--   * the DEATH path: $AEC1 (slot turns into an explosion), $AEF8 (slot freed
--     by the generic left-mover leaving the screen), $A527 (the slot clear).
--
-- Env:
--   EP_FRAMES, EP_SCRIPT, EP_JSON, EP_POKE   -- as probe.lua / objloop.lua
--   EP_SLOTFROM  first game frame to record slot rows (default 0)
--   EP_SLOTN     how many frames of slot rows to record (default 0 = none)
--   EP_WATCHZP   comma-separated zero-page hex addrs sampled every frame

local function say(s) print("PROBE " .. s) end

local FRAMES   = tonumber(os.getenv("EP_FRAMES") or "") or 700
local SCRIPT   = os.getenv("EP_SCRIPT") or ""
local JSON_OUT = os.getenv("EP_JSON")
local SLOTFROM = tonumber(os.getenv("EP_SLOTFROM") or "") or 0
local SLOTN    = tonumber(os.getenv("EP_SLOTN") or "") or 0
local WATCHZP_S = os.getenv("EP_WATCHZP") or ""

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

local WATCHZP = {}
for seg in string.gmatch(WATCHZP_S, "[^,]+") do
   local v = tonumber((seg:gsub("%s", ""):gsub("^%$", "")), 16)
   if v then WATCHZP[#WATCHZP + 1] = v end
end

local POKES = {}
for seg in string.gmatch(os.getenv("EP_POKE") or "", "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad poke: '" .. seg .. "' (want ADDR=VAL@FROM-TO)") end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end

-- ------------------------------------------------------------- counters -----
-- name -> address.  Each becomes a per-frame count and a run total.
local SITES = {
   spawnEngine   = 0xA2C0,   -- JSR from $9A64
   enemyUpdate   = 0xADAB,   -- JSR from $9A6D
   perSlot       = 0xADE5,   -- the 10-iteration body
   waveInit      = 0xA2CF,   -- INC $60 -- the once-per-stage table setup
   waveFire      = 0xA335,   -- INC $5D -- a wave record's trigger was reached
   waveEnd       = 0xA345,   -- the $FF terminator RTS
   raw5          = 0xA37A,   -- the 5-byte inline record path
   tabA          = 0xA368,   -- lookup in table [$A5FE]
   tabB          = 0xA375,   -- lookup in table [$A600]
   allocP_try    = 0xA3B1,   -- allocator P: LDX #$09 (single spawn)
   allocP_fail   = 0xA3BB,   -- ...RTS with no free slot
   allocP_ok     = 0xA3BC,   -- STX $A8
   allocQ_try    = 0xA415,   -- allocator Q (formation member)
   allocQ_fail   = 0xA41F,
   allocQ_ok     = 0xA420,
   allocR_try    = 0xA46F,   -- allocator R ($19 == 2 path)
   allocR_fail   = 0xA479,
   allocR_ok     = 0xA47A,
   allocS_try    = 0xA4A6,   -- allocator S (DEX/BNE -- never tests index 0)
   allocS_fail   = 0xA4B0,
   allocS_ok     = 0xA4B1,
   slotClear     = 0xA527,
   becameExpl    = 0xAEC1,   -- LDA #$01 / STA $030C,X -- turn into explosion
   freedOffLeft  = 0xAEF8,   -- LDA #$00 / STA $030C,X -- generic despawn
   moverGeneric  = 0xAEE1,   -- the shared left-mover
   dispatch      = 0xAE19,   -- JSR $83E4
   formSetup     = 0xA3E4,   -- formation descriptor -> $69/$6D/$6E
   collideTop    = 0xBFE2,   -- shot-vs-enemy sweep
   shotHitEnemy  = 0xC055,   -- a shot's box overlapped an enemy box
   armourHit     = 0xC070,   -- status bit7 set -> damage counter, no kill
   killPath      = 0xC090,
   deathRoutine  = 0xBE93,   -- type -> 2, the explosion
   ebulletHit    = 0xBF9F,   -- player shot destroyed an enemy BULLET (slots 22-31)
   capsuleDrop   = 0xBEB5,   -- LDA #$01 -> $03AC: this death drops a power-up
   capsuleDeny   = 0xBEB1,   -- DEC $48,X: squadron not finished, no power-up
   -- $83E4 indexes the inline table at $AE1C with (A*2 mod 256), i.e. the
   -- handler index is  type AND $7F.  These three hooks TEST that arithmetic:
   -- hits on $B0AF must equal typeHist[$05] + typeHist[$85], and so on.
   hdlr05_B0AF   = 0xB0AF,
   hdlr08_B26C   = 0xB26C,
   hdlr04_B205   = 0xB205,
}

local counts, totals = {}, {}
for k, _ in pairs(SITES) do counts[k] = 0; totals[k] = 0 end

local gframe = 0
local events = {}            -- human-readable, ordered, capped
local EVCAP = 400
local function ev(s)
   if #events < EVCAP then events[#events + 1] = ("%4d %s"):format(gframe, s) end
end

local typeHist = {}          -- enemy type -> times dispatched
local typeSlot = {}          -- enemy type -> bitmask of slots it was seen in
local allocSlotHist = {}     -- allocator letter .. slot -> count
local statusHist = {}        -- $0100+i value -> count, for enemy slots only
local slotEverType = {}      -- slot -> set of $0300 values seen non-zero
local slotEverAnim = {}      -- slot -> set of $0120 values seen non-zero
local firstNonZero = {}      -- slot -> first game frame $0300+i went non-zero

local rows, slotrows = {}, {}
local done, failed, stopped = false, false, false

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

local function bump(name) counts[name] = counts[name] + 1 end

local function on_frame_end()
   if done then return end
   local occ, alive = 0, 0
   local enemyOcc = 0
   for i = 0, 31 do
      local t = emu.read(0x300 + i, CPU, false)
      local a = emu.read(0x120 + i, CPU, false)
      if t ~= 0 then
         occ = occ | (1 << i)
         slotEverType[i] = slotEverType[i] or {}
         slotEverType[i][t] = (slotEverType[i][t] or 0) + 1
         if firstNonZero[i] == nil then firstNonZero[i] = gframe end
         if i >= 12 and i <= 21 then enemyOcc = enemyOcc + 1 end
      end
      if a ~= 0 then
         alive = alive | (1 << i)
         slotEverAnim[i] = slotEverAnim[i] or {}
         slotEverAnim[i][a] = (slotEverAnim[i][a] or 0) + 1
      end
   end
   for i = 12, 21 do
      local s = emu.read(0x100 + i, CPU, false)
      statusHist[s] = (statusHist[s] or 0) + 1
   end

   local r = {
      frame = gframe,
      occ = occ, alive = alive, enemyOcc = enemyOcc,
      z19 = emu.read(0x19, CPU, false),      -- stage index candidate
      z3E = emu.read(0x3E, CPU, false),      -- scroll lo
      z3F = emu.read(0x3F, CPU, false),      -- scroll hi
      z60 = emu.read(0x60, CPU, false),
      z61 = emu.read(0x61, CPU, false),
      z5D = emu.read(0x5D, CPU, false),
      z69 = emu.read(0x69, CPU, false),
      z6A = emu.read(0x6A, CPU, false),
      z6B = emu.read(0x6B, CPU, false),
      z6C = emu.read(0x6C, CPU, false),
      z6D = emu.read(0x6D, CPU, false),
      z6E = emu.read(0x6E, CPU, false),
      z6F = emu.read(0x6F, CPU, false),
      z1B = emu.read(0x1B, CPU, false),
      z5B = emu.read(0x5B, CPU, false),
      z47 = emu.read(0x47, CPU, false),
      z49 = emu.read(0x49, CPU, false),
      playerX = emu.read(0x360, CPU, false),
      playerY = emu.read(0x320, CPU, false),
   }
   for k, _ in pairs(SITES) do r[k] = counts[k]; totals[k] = totals[k] + counts[k]; counts[k] = 0 end
   for i, a in ipairs(WATCHZP) do r["w" .. i] = emu.read(a, CPU, false) end
   rows[#rows + 1] = r

   if SLOTN > 0 and gframe >= SLOTFROM and gframe < SLOTFROM + SLOTN then
      local parts = {}
      for i = 0, 31 do
         parts[#parts + 1] = ("%d:%d:%d:%d:%d"):format(
            emu.read(0x100 + i, CPU, false), emu.read(0x120 + i, CPU, false),
            emu.read(0x300 + i, CPU, false), emu.read(0x320 + i, CPU, false),
            emu.read(0x360 + i, CPU, false))
      end
      slotrows[#slotrows + 1] = { frame = gframe, s = table.concat(parts, ",") }
   end

   for _, p in ipairs(POKES) do
      if gframe >= p.from and gframe <= p.to then emu.write(p.addr, p.val, CPU) end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function setmap(t)
   local ks = {}
   for k, _ in pairs(t) do ks[#ks + 1] = k end
   table.sort(ks)
   local out = {}
   for _, k in ipairs(ks) do out[#out + 1] = ("%d=%d"):format(k, t[k]) end
   return table.concat(out, " ")
end

local KEYS = { "frame", "occ", "alive", "enemyOcc", "z19", "z3E", "z3F", "z60", "z61",
               "z5D", "z69", "z6A", "z6B", "z6C", "z6D", "z6E", "z6F", "z1B", "z5B",
               "z47", "z49", "playerX", "playerY" }

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   local keys = {}
   for _, k in ipairs(KEYS) do keys[#keys + 1] = k end
   local sitekeys = {}
   for k, _ in pairs(SITES) do sitekeys[#sitekeys + 1] = k end
   table.sort(sitekeys)
   for _, k in ipairs(sitekeys) do keys[#keys + 1] = k end
   for i, _ in ipairs(WATCHZP) do keys[#keys + 1] = "w" .. i end

   f:write('{\n  "tool": "games/gradius/tools/oracle/enemyprobe.lua",\n')
   f:write(('  "inputScript": "%s",\n'):format(SCRIPT))
   f:write(('  "gameFrames": %d,\n'):format(#rows))
   local q = {}
   for _, k in ipairs(keys) do q[#q + 1] = '"' .. k .. '"' end
   f:write('  "fields": [' .. table.concat(q, ", ") .. '],\n  "frames": [\n')
   local chunk = {}
   for i, r in ipairs(rows) do
      local parts = {}
      for _, k in ipairs(keys) do parts[#parts + 1] = ('"%s":%d'):format(k, r[k] or 0) end
      chunk[#chunk + 1] = "    {" .. table.concat(parts, ",") .. "}" .. (i < #rows and "," or "") .. "\n"
      if #chunk >= 200 then f:write(table.concat(chunk)); chunk = {} end
   end
   if #chunk > 0 then f:write(table.concat(chunk)) end
   f:write('  ],\n  "slotRows": [\n')
   for i, r in ipairs(slotrows) do
      f:write(('    {"frame":%d,"s":"%s"}%s\n'):format(r.frame, r.s, i < #slotrows and "," or ""))
   end
   f:write('  ]\n}\n')
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
         local function hook(addr, fn)
            emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr,
                                  emu.cpuType.nes, emu.memType.nesMemory)
         end
         hook(FRAME_END, on_frame_end)
         for name, addr in pairs(SITES) do
            if name == "dispatch" then
               hook(addr, function()
                  bump("dispatch")
                  local st = emu.getState()
                  local ty = st["cpu.a"]
                  local sl = emu.read(0xA8, CPU, false)
                  typeHist[ty] = (typeHist[ty] or 0) + 1
                  typeSlot[ty] = (typeSlot[ty] or 0) | (1 << ((sl + 12) & 31))
               end)
            elseif name == "formSetup" or name == "allocP_try" then
               local tag = (name == "formSetup") and "FORMATION" or "SINGLE"
               hook(addr, function()
                  bump(name)
                  ev(("%s cmd=$%02X rec=$%02X$%02X$%02X$%02X scroll=$%02X%02X ptr=$%02X%02X"):format(
                     tag, emu.read(0x98, CPU, false),
                     emu.read(0x64, CPU, false), emu.read(0x65, CPU, false),
                     emu.read(0x66, CPU, false), emu.read(0x67, CPU, false),
                     emu.read(0x3F, CPU, false), emu.read(0x3E, CPU, false),
                     emu.read(0x6B, CPU, false), emu.read(0x6A, CPU, false)))
               end)
            elseif name == "deathRoutine" then
               hook(addr, function()
                  bump(name)
                  local st = emu.getState()
                  local sl = st["cpu.y"]
                  ev(("DEATH slot=%d type=$%02X carrier=$%02X hp$048C=$%02X $046C=$%02X"):format(
                     sl + 12, emu.read(0x300 + 12 + sl, CPU, false),
                     emu.read(0x3AC + sl, CPU, false),
                     emu.read(0x48C + sl, CPU, false),
                     emu.read(0x46C + sl, CPU, false)))
               end)
            elseif name == "allocP_fail" or name == "allocQ_fail"
                or name == "allocR_fail" or name == "allocS_fail" then
               hook(addr, function()
                  bump(name)
                  ev(("ALLOCFAIL %s  $69=%d $6C=%d"):format(name,
                     emu.read(0x69, CPU, false), emu.read(0x6C, CPU, false)))
               end)
            elseif name == "capsuleDrop" or name == "capsuleDeny" then
               hook(addr, function()
                  bump(name)
                  ev(("%s  $4A=%d $4B=%d"):format(name,
                     emu.read(0x4A, CPU, false), emu.read(0x4B, CPU, false)))
               end)
            elseif name == "allocP_ok" or name == "allocQ_ok"
                or name == "allocR_ok" or name == "allocS_ok" then
               local letter = name:sub(6, 6)
               hook(addr, function()
                  bump(name)
                  local st = emu.getState()
                  local key = letter .. tostring(st["cpu.x"])
                  allocSlotHist[key] = (allocSlotHist[key] or 0) + 1
               end)
            else
               hook(addr, function() bump(name) end)
            end
         end
      end
      if done then
         if JSON_OUT then write_json() end
         say("gameFrames = " .. #rows)
         local sitekeys = {}
         for k, _ in pairs(SITES) do sitekeys[#sitekeys + 1] = k end
         table.sort(sitekeys)
         for _, k in ipairs(sitekeys) do say("total." .. k .. " = " .. totals[k]) end
         say("typeHist = " .. setmap(typeHist))
         local th = {}
         for k, v in pairs(typeSlot) do th[k] = v end
         say("typeSlotMask = " .. setmap(th))
         local ah = {}
         local aks = {}
         for k, _ in pairs(allocSlotHist) do aks[#aks + 1] = k end
         table.sort(aks)
         for _, k in ipairs(aks) do ah[#ah + 1] = k .. "=" .. allocSlotHist[k] end
         say("allocSlotHist = " .. table.concat(ah, " "))
         say("statusHist = " .. setmap(statusHist))
         for i = 0, 31 do
            if slotEverType[i] then say(("slotTypes.%02d = %s"):format(i, setmap(slotEverType[i]))) end
         end
         for i = 0, 31 do
            if slotEverAnim[i] then say(("slotAnim.%02d = %s"):format(i, setmap(slotEverAnim[i]))) end
         end
         local fz = {}
         for i = 0, 31 do if firstNonZero[i] then fz[#fz + 1] = i .. ":" .. firstNonZero[i] end end
         say("firstNonZeroType = " .. table.concat(fz, " "))
         for _, e in ipairs(events) do say("ev " .. e) end
         say("END")
         stopped = true
         emu.stop(0)
      end
      if ef > FRAMES * 3 + 900 then
         die("watchdog: " .. ef .. " emulator frames but only " .. #rows .. " samples")
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
