-- flowprobe.lua -- the GAME-FLOW trace: mode machine, stage intro, HUD packets,
-- death and respawn.  Recon 4/5 (docs/worklog/gradius/00-recon-flow.md).
--
-- probe.lua answers "where is the ship".  This answers "what state is the game
-- in and which routine put it there".  Same sample point ($80B5, the last
-- instruction of the NMI's own frame -- see probe.lua's header, which is the
-- authority on that choice), same zero input lead, same $04 == 1 assertion.
--
-- Environment (--testRunner cannot pass argv):
--   PROBE_FRAMES   game frames to sample
--   PROBE_SCRIPT   "count:buttons" segments, same grammar as probe.lua
--   PROBE_OUT      path for the per-frame TSV
--   PROBE_HOOKS    comma-separated hex exec addresses; each one's hit count for
--                  the frame is appended as a column h_XXXX, and the game frame
--                  of its FIRST hit is reported at the end
--   PROBE_ARGHOOK  optional hex address; the CPU's A/X/Y are logged at every
--                  execution of it, with the game frame.  Used for $85F3 (the
--                  canned-packet emitter -- A is the packet index) and $EC1E
--                  (the sound driver -- A is the cue id).
--   PROBE_KILL     optional "frame" -- at that game frame, force a collision by
--                  poking $0100 (player status).  NOT used for the primary
--                  death measurement; see PROBE_CRASH.
--   PROBE_CRASH    optional "frame" -- at that game frame, poke the player Y
--                  ($0320) to 200, which parks the Vic Viper inside stage 1's
--                  floor so the ROM's OWN collision code kills it.  That is an
--                  intervention on an INPUT to the death path, not on its
--                  output, so what follows is the cartridge's real sequence.

local function say(s) print("PROBE " .. s) end

local FRAMES  = tonumber(os.getenv("PROBE_FRAMES") or "") or 400
local SCRIPT  = os.getenv("PROBE_SCRIPT") or ""
local OUT     = os.getenv("PROBE_OUT")
local HOOKS_S = os.getenv("PROBE_HOOKS") or ""
local ARGHOOK = os.getenv("PROBE_ARGHOOK") or ""
local CRASH   = tonumber(os.getenv("PROBE_CRASH") or "") or nil
local POKE_S  = os.getenv("PROBE_POKE") or ""

local CPU = emu.memType.nesDebug
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

local HOOKS = {}
for a in string.gmatch(HOOKS_S, "[^,]+") do
   local v = tonumber((a:gsub("^%s*%$?", "")), 16)
   if v then HOOKS[#HOOKS + 1] = v end
end

local POKES = {}
for seg in string.gmatch(POKE_S, "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad poke: '" .. seg .. "'") end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end

-- The state vector.  Every address here is one the flow machine reads or writes.
local FIELDS = {
   { "mode",   0x00 },   -- game mode, dispatched at $80D1
   { "sub",    0x01 },   -- per-mode init step; $8186 clears it on mode change
   { "cnt",    0x02 },   -- free-running frame counter, INC $02 at $80BE
   { "f03",    0x03 },   -- flag byte tested at $80C6 (AND #$40) and $8172
   { "blank",  0x0D },   -- PPUMASK blank countdown
   { "qlen",   0x0E },   -- VRAM queue cursor $0700+
   { "f09",    0x09 },
   { "f0A",    0x0A },   -- bits 0/1 = player 1/2 still in the game
   { "f0B",    0x0B },
   { "f15",    0x15 },
   { "f16",    0x16 },
   { "plyr",   0x18 },   -- current player index
   { "stage",  0x19 },   -- stage number
   { "f1A",    0x1A },
   { "sub1B",  0x1B },   -- MODE-5 SUB-STATE
   { "f1C",    0x1C },
   { "f1E",    0x1E },
   { "f1F",    0x1F },
   { "lives0", 0x20 },   -- player 1 lives
   { "lives1", 0x21 },
   { "st22",   0x22 },
   { "st24",   0x24 },   -- CHECKPOINT for player 1
   { "st26",   0x26 },   -- stage for player 1
   { "st28",   0x28 },
   { "cont0",  0x2A },   -- continues left, player 1
   { "chrsel", 0x2D },
   { "f33",    0x33 },   -- Konami-code match counter
   { "f39",    0x39 },
   { "f3A",    0x3A },
   { "scrl12", 0x12 },
   { "scrl13", 0x13 },
   { "camLo",  0x3E },
   { "camHi",  0x3F },
   { "pow42",  0x42 },   -- power-meter cursor
   { "t4C",    0x4C },   -- 16-bit general timer, low
   { "t4D",    0x4D },
   { "f57",    0x57 },
   { "f5B",    0x5B },
   { "f5C",    0x5C },
   { "f5E",    0x5E },
   { "fB0",    0xB0 },
   { "pst",    0x0100 }, -- player object status: 1 alive, >=2 dying
   { "pani",   0x0120 }, -- player metasprite id
   { "ptim",   0x0140 },
   { "pring",  0x0160 },
   { "px",     0x0360 },
   { "py",     0x0320 },
   { "held",   0x0007 },
   { "press",  0x0005 },
}

local gframe = 0
local nmi_entries, nmi_dropped = 0, 0
local rows = {}
local hitFrame = {}       -- per-frame hit counts, reset each sample
local hitTotal = {}
local firstHit = {}
local argLog = {}
local done, stopped, failed = false, false, false
local guardViolations = 0

for _, a in ipairs(HOOKS) do hitFrame[a] = 0; hitTotal[a] = 0; firstHit[a] = -1 end

local function die(msg)
   failed = true; say("ERROR = " .. tostring(msg)); say("END"); emu.stop(3)
end

local function on_frame_end()
   if done then return end
   local function rd(a) return emu.read(a, CPU, false) end
   if rd(0x04) ~= 1 then guardViolations = guardViolations + 1 end
   local row = { frame = gframe }
   for _, f in ipairs(FIELDS) do row[f[1]] = rd(f[2]) end
   for _, a in ipairs(HOOKS) do
      row["h_" .. string.format("%04X", a)] = hitFrame[a]
      hitFrame[a] = 0
   end
   rows[#rows + 1] = row

   for _, p in ipairs(POKES) do
      if gframe >= p.from and gframe <= p.to then emu.write(p.addr, p.val, CPU) end
   end
   if CRASH and gframe == CRASH then
      -- Park the ship in the floor.  $0320 is the player Y and PROBE.md proved
      -- it causal by poke.  The ROM's own terrain collision then fires.
      emu.write(0x0320, 200, CPU)
   end

   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
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
         if v ~= NMI_ENTRY then die(("NMI vector is $%04X"):format(v)); return end
         emu.addMemoryCallback(on_frame_end, emu.callbackType.exec,
                               FRAME_END, FRAME_END, emu.cpuType.nes,
                               emu.memType.nesMemory)
         emu.addMemoryCallback(function()
               nmi_entries = nmi_entries + 1
               if emu.read(0x04, CPU, false) ~= 0 then
                  nmi_dropped = nmi_dropped + 1
                  say(("lag.dropAtGameFrame = %d"):format(gframe))
               end
            end, emu.callbackType.exec, NMI_ENTRY, NMI_ENTRY,
            emu.cpuType.nes, emu.memType.nesMemory)
         for _, a in ipairs(HOOKS) do
            local addr = a
            emu.addMemoryCallback(function()
                  hitFrame[addr] = hitFrame[addr] + 1
                  hitTotal[addr] = hitTotal[addr] + 1
                  if firstHit[addr] < 0 then firstHit[addr] = gframe end
               end, emu.callbackType.exec, addr, addr,
               emu.cpuType.nes, emu.memType.nesMemory)
         end
         if ARGHOOK ~= "" then
            local aa = tonumber((ARGHOOK:gsub("^%s*%$?", "")), 16)
            emu.addMemoryCallback(function()
                  local st = emu.getState()
                  argLog[#argLog + 1] = ("%d a=%02X x=%02X y=%02X sl=%d dot=%d"):format(
                     gframe, st["cpu.a"], st["cpu.x"], st["cpu.y"],
                     st["ppu.scanline"], st["ppu.cycle"])
               end, emu.callbackType.exec, aa, aa,
               emu.cpuType.nes, emu.memType.nesMemory)
         end
      end

      if done then
         -- Optional: PPU nametable read at the last sampled frame.  "2380-23BF"
         local vr = os.getenv("PROBE_VRAM") or ""
         for seg in string.gmatch(vr, "[^,]+") do
            local lo, hi = string.match(seg, "^%s*%$?(%x+)%-%$?(%x+)%s*$")
            if lo then
               lo, hi = tonumber(lo, 16), tonumber(hi, 16)
               local out = {}
               for a = lo, hi do
                  out[#out + 1] = ("%02X"):format(
                     emu.read(a, emu.memType.nesPpuMemory, false))
               end
               say(("vram.%04X = %s"):format(lo, table.concat(out, " ")))
            end
         end
         if OUT then
            local f = assert(io.open(OUT, "wb"))
            local hdr = { "frame" }
            for _, fd in ipairs(FIELDS) do hdr[#hdr + 1] = fd[1] end
            for _, a in ipairs(HOOKS) do hdr[#hdr + 1] = "h_" .. string.format("%04X", a) end
            f:write(table.concat(hdr, "\t") .. "\n")
            for _, r in ipairs(rows) do
               local parts = {}
               for _, k in ipairs(hdr) do parts[#parts + 1] = tostring(r[k] or 0) end
               f:write(table.concat(parts, "\t") .. "\n")
            end
            f:close()
         end
         say("gameFrames = " .. #rows)
         say("nmiEntries = " .. nmi_entries)
         say("lagFrames = " .. nmi_dropped)
         say("guardViolations = " .. guardViolations)
         for _, a in ipairs(HOOKS) do
            say(("hook.%04X = total %d firstGameFrame %d"):format(
               a, hitTotal[a], firstHit[a]))
         end
         for _, l in ipairs(argLog) do say("arg " .. l) end
         say("END")
         stopped = true
         emu.stop(0)
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
