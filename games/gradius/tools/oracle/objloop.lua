-- objloop.lua -- the WORK-BUDGET counters, per game frame, off the real cartridge.
--
-- probe.lua samples the game's state vector. It does NOT count work, and
-- NOTES-lag.md says the single most important number in the whole lag
-- investigation is "object slots processed per frame" -- the detector for
-- model (C), partial completion of the object loop. This file measures it.
--
-- WHY A SECOND SCRIPT INSTEAD OF EXTENDING probe.lua: probe.lua is the proven
-- oracle and its determinism check hashes its own JSON. Adding fields would
-- invalidate that hash and every recorded number quoted against it. So this
-- runs as a SECOND Mesen process over the IDENTICAL script, and scen.py merges
-- the two by frame index -- after asserting that the two processes agree on
-- playerX/playerY on every single frame, which is a per-scenario re-run of the
-- determinism check rather than a citation of it.
--
-- ============================ THE HOOK ADDRESSES ============================
--
-- Read out of the PRG, not out of a disassembly listing. `sub_8B10` is the
-- display-list builder called from the NMI at $80A7; `sub_8AAC` is the
-- metasprite expander it calls.
--
--   $8B45: 85 9C        STA $9C          the OAM write cursor
--   $8B47: A6 9D        LDX $9D          <-- LOOP HEAD (slot index)
--   $8B49: E0 20        CPX #$20         32 slots
--   $8B4B: B0 40        BCS $8B8D        loop exit
--   $8B4D: BD 20 01     LDA $0120,X      <-- ONE PER SLOT VISITED
--   $8B50: F0 37        BEQ $8B89        id == 0 -> skip to the INC
--   $8B64: 20 AC 8A     JSR $8AAC        <-- the object's own metasprite
--   $8B86: 20 AC 8A     JSR $8AAC        <-- the shield's, when $46 is non-zero
--   $8B89: E6 9D        INC $9D
--
-- The counter hooks $8AAC's ENTRY, so it counts BOTH call sites -- "metasprites
-- expanded", which is what the number is named. $46 read 0 on every frame of
-- this corpus, so in practice it is one per drawn slot; hooking the entry means
-- a run in which the shield IS up reports the extra work instead of hiding it.
--   $8B8B: D0 BA        BNE $8B47        back to the loop head
--
--   $8AC6: B1 A0        LDA ($A0),Y      record count, 0 -> nothing to draw
--   $8AC8: F0 38        BEQ $8B02
--   $8ACF: B1 A0        LDA ($A0),Y      <-- ONE PER SPRITE RECORD CONSIDERED
--   ...
--   $8AED: B0 0C        BCS $8AFB        right-edge cull: no store, no advance
--   $8AEF: 9D 03 02     STA $0203,X      the X byte -- the sprite is real
--   $8AF9: C6 9F        DEC $9F          <-- ONE PER SPRITE ACTUALLY STORED
--   $8AFE: D0 CF        BNE $8ACF        next record
--
-- So four independent counters, three of them nested, which is what makes the
-- set falsifiable: spritesStored <= spriteRecords, msExpanded <= slotsVisited,
-- and slotsVisited <= 32. scen.py asserts all three.
--
-- ============================== LAG, PER FRAME ==============================
--
-- probe.lua reports lagFrames as a TOTAL and prints the game frame of each drop
-- to stdout. For lag to be a COMPARED FIELD rather than a diagnostic side
-- channel (NOTES-lag.md), the port has to be held to a per-frame number. So
-- this script attributes every dropped NMI to the sample that follows it:
-- `lagged` is the count of NMI entries since the previous sample that found the
-- $04 guard already set and took the `BNE $80B7` at $8075.
--
-- Env: OBJ_FRAMES, OBJ_SCRIPT, OBJ_JSON, OBJ_POKE -- same grammar as probe.lua.
--
-- OBJ_POKE exists for one reason: this script has to reproduce probe.lua's run
-- EXACTLY, because scen.py asserts the two processes agree on playerX/playerY
-- on every frame before it merges them. A scenario that injects a power-up into
-- probe.lua and not into this one diverges on the first frame -- which is how
-- the requirement was found, the assertion having gone off immediately.

local function say(s) print("PROBE " .. s) end

local FRAMES   = tonumber(os.getenv("OBJ_FRAMES") or "") or 400
local SCRIPT   = os.getenv("OBJ_SCRIPT") or ""
local JSON_OUT = os.getenv("OBJ_JSON")

local CPU = emu.memType.nesDebug

local NMI_ENTRY  = 0x806A
local FRAME_END  = 0x80B5   -- the same sample point probe.lua uses
local LOOP_SLOT  = 0x8B4D   -- LDA $0120,X   -- one execution per slot visited
local MS_EXPAND  = 0x8AAC   -- sub_8AAC entry -- one per metasprite expanded
local MS_RECORD  = 0x8ACF   -- LDA ($A0),Y   -- one per sprite record considered
local MS_STORED  = 0x8AF9   -- DEC $9F       -- one per sprite actually stored
-- $ADE5 -- one execution per ENEMY slot updated.  The loop at $ADB7 is
-- `LDX $A8 / JSR $ADE5 / DEC $A8 / BPL`, ten iterations with no early exit, and
-- this counter is what turns "fixed shape" from a claim into a compared field
-- (docs/knowledge/06, model C: partial completion of an object loop).
local ENEMY_SLOT = 0xADE5
-- ============================ SOUND, wave 8 ================================
--
-- $ED02 is the sound driver's ONLY entry (verified: dis6502 xref ED02 gives
-- exactly one caller, $80A1) and $ED46 is its per-channel routine.  Two
-- counters, because they answer different questions:
--
--   audioTicks     $ED02 executions.  THE LAG RULE: $8073's bail is upstream of
--                  $80A1, so a dropped NMI drops a music tick.  It is 1 on every
--                  sampled frame BY CONSTRUCTION -- a frame that never reached
--                  $80B5 never produced a row -- which is exactly the claim the
--                  port has to satisfy: tick once per non-dropped NMI, never
--                  twice, never zero.
--   audioChannels  $ED46 executions.  0..4 owned channels PLUS every control
--                  command chained inside one tick, because $ECE5 re-enters
--                  $ED46 with `BNE $ED46` rather than returning.  This one
--                  VARIES, so it is the field with teeth.
--
-- And the register side, which probe.lua cannot see at all (APU registers are
-- write-only, so a --watch cannot read them back):
--
--   apuWrites      writes to $4000-$400F.  $4014 (OAM DMA, once a frame) and
--                  $4015/$4017 (once per RUN at $81AD/$81B2) are outside the
--                  range deliberately -- they are not the driver's.
--   apuDigest      a rolling hash of (offset, value) over those writes IN
--                  ORDER: h = (h*31 + (off<<8) + v) & $FFFF.  The shadow itself
--                  is not comparable (the port's starts at zero where the
--                  machine's has history from before the align frame); the
--                  writes made DURING the frame are, and this is how.
local SND_DRIVER = 0xED02
local SND_CHANNEL = 0xED46

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

-- "0040=6@400-639" -- identical parser and identical timing to probe.lua's.
local POKES = {}
for seg in string.gmatch(os.getenv("OBJ_POKE") or "", "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad poke: '" .. seg .. "' (want ADDR=VAL@FROM-TO)") end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end

local gframe = 0
local rows = {}
local c_slot, c_ms, c_rec, c_store, c_lag, c_enemy = 0, 0, 0, 0, 0, 0
local c_snd, c_sndch, c_apu, c_dig = 0, 0, 0, 0
local done, failed, stopped = false, false, false

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

local function on_frame_end()
   if done then return end
   rows[#rows + 1] = {
      frame          = gframe,
      slotsVisited   = c_slot,
      msExpanded     = c_ms,
      spriteRecords  = c_rec,
      spritesStored  = c_store,
      enemySlots     = c_enemy,
      lagged         = c_lag,
      audioTicks     = c_snd,
      audioChannels  = c_sndch,
      apuWrites      = c_apu,
      apuDigest      = c_dig,
      -- carried purely so the merge can prove this process ran the same run as
      -- probe.lua's process. If these ever disagree the merge fails loudly
      -- rather than pairing two different games frame by frame.
      playerX        = emu.read(0x360, CPU, false),
      playerY        = emu.read(0x320, CPU, false),
      counter        = emu.read(0x02, CPU, false),
   }
   c_slot, c_ms, c_rec, c_store, c_lag, c_enemy = 0, 0, 0, 0, 0, 0
   c_snd, c_sndch, c_apu, c_dig = 0, 0, 0, 0
   -- AFTER the row, exactly where probe.lua applies its own.
   for _, p in ipairs(POKES) do
      if gframe >= p.from and gframe <= p.to then
         emu.write(p.addr, p.val, CPU)
      end
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local KEYS = { "frame", "slotsVisited", "msExpanded", "spriteRecords",
               "spritesStored", "enemySlots", "lagged", "audioTicks",
               "audioChannels", "apuWrites", "apuDigest", "playerX", "playerY",
               "counter" }

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   f:write('{\n')
   f:write('  "tool": "games/gradius/tools/oracle/objloop.lua",\n')
   f:write(('  "inputScript": "%s",\n'):format(SCRIPT))
   f:write(('  "gameFrames": %d,\n'):format(#rows))
   f:write('  "fields": [')
   local all = {}
   for _, k in ipairs(KEYS) do all[#all + 1] = '"' .. k .. '"' end
   f:write(table.concat(all, ", "))
   f:write('],\n  "frames": [\n')
   local chunk = {}
   for i, r in ipairs(rows) do
      local parts = {}
      for _, k in ipairs(KEYS) do parts[#parts + 1] = ('"%s":%d'):format(k, r[k] or 0) end
      chunk[#chunk + 1] = "    {" .. table.concat(parts, ",") .. "}"
                          .. (i < #rows and "," or "") .. "\n"
      if #chunk >= 256 then f:write(table.concat(chunk)); chunk = {} end
   end
   if #chunk > 0 then f:write(table.concat(chunk)) end
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
         hook(LOOP_SLOT, function() c_slot = c_slot + 1 end)
         hook(MS_EXPAND, function() c_ms = c_ms + 1 end)
         hook(MS_RECORD, function() c_rec = c_rec + 1 end)
         hook(MS_STORED, function() c_store = c_store + 1 end)
         hook(ENEMY_SLOT, function() c_enemy = c_enemy + 1 end)
         hook(SND_DRIVER, function() c_snd = c_snd + 1 end)
         hook(SND_CHANNEL, function() c_sndch = c_sndch + 1 end)
         emu.addMemoryCallback(function(addr, value)
               c_apu = c_apu + 1
               c_dig = ((c_dig * 31) + ((addr - 0x4000) * 256) + value) % 65536
            end, emu.callbackType.write, 0x4000, 0x400F,
            emu.cpuType.nes, emu.memType.nesMemory)
         hook(NMI_ENTRY, function()
                 -- $8073: LDY $04 / $8075: BNE $80B7. Non-zero here means the
                 -- previous NMI has not cleared the lock, so THIS NMI bails
                 -- before OAM DMA, the PPU writes and every subsystem.
                 if emu.read(0x04, CPU, false) ~= 0 then c_lag = c_lag + 1 end
              end)
      end
      if done then
         if JSON_OUT then write_json() end
         local tot_s, tot_m, tot_r, tot_st, tot_l = 0, 0, 0, 0, 0
         local min_s, max_s = 1e9, -1
         for _, r in ipairs(rows) do
            tot_s = tot_s + r.slotsVisited; tot_m = tot_m + r.msExpanded
            tot_r = tot_r + r.spriteRecords; tot_st = tot_st + r.spritesStored
            tot_l = tot_l + r.lagged
            if r.slotsVisited < min_s then min_s = r.slotsVisited end
            if r.slotsVisited > max_s then max_s = r.slotsVisited end
         end
         say("gameFrames = " .. #rows)
         say("slotsVisitedMin = " .. min_s)
         say("slotsVisitedMax = " .. max_s)
         say("slotsVisitedTotal = " .. tot_s)
         say("msExpandedTotal = " .. tot_m)
         say("spriteRecordsTotal = " .. tot_r)
         say("spritesStoredTotal = " .. tot_st)
         say("laggedTotal = " .. tot_l)
         local tot_snd, tot_ch, tot_apu = 0, 0, 0
         for _, r in ipairs(rows) do
            tot_snd = tot_snd + r.audioTicks
            tot_ch = tot_ch + r.audioChannels
            tot_apu = tot_apu + r.apuWrites
         end
         say("audioTicksTotal = " .. tot_snd)
         say("audioChannelsTotal = " .. tot_ch)
         say("apuWritesTotal = " .. tot_apu)
         say("END")
         stopped = true          -- emu.stop() is ASYNCHRONOUS (PROBE.md 6)
         emu.stop(0)
      end
      if ef > FRAMES * 3 + 600 then
         die("watchdog: " .. ef .. " emulator frames but only " .. #rows .. " samples")
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
