-- soundprobe.lua -- measure the Gradius $ED02 audio driver on the real cartridge.
--
-- RECON ONLY. Nothing here ships; its output is ROM-derived.
-- Driven by games/gradius/tools/oracle/soundprobe.py.
--
-- WHAT IT MEASURES, and why each hook is where it is
--
--   $EC1E  the sound REQUEST entry (`STA $DF` is its first instruction, and the
--          request code arrives in A).  28 call sites across the PRG, one hook.
--          We log (game frame, A) so the request protocol can be read off a run
--          instead of guessed from the listing.
--   $ED02  the per-frame driver entry, called from the NMI at $80A1.  Only one
--          call site in the whole ROM (verified: `dis6502 xref ED02`).
--   $80A4  the instruction AFTER `JSR $ED02` -- so ($80A4 cycle - $ED02 cycle)
--          is exactly what the driver cost this frame.  This is the number the
--          lag question turns on.
--   $806A / $80B5 / $80B7  NMI entry / frame-lock clear / RTI, for the total NMI
--          cost and the lag census (docs/knowledge/06).
--   writes to $4000-$4017  every APU register write, counted per frame and
--          per address, so "how many channels and which registers" is measured
--          rather than read.
--
-- Per-frame it also snapshots the four 17-byte channel structs at $B0/$C1/$D2/$E3
-- (bases read out of the ROM table at $ECB2) so channel occupancy is visible.
--
-- ENV: SND_FRAMES SND_SCRIPT SND_OUT SND_VERBOSE SND_TRACEREQ

local function say(s) print("PROBE " .. s) end

local FRAMES  = tonumber(os.getenv("SND_FRAMES") or "") or 600
local SCRIPT  = os.getenv("SND_SCRIPT") or ""
local OUT     = os.getenv("SND_OUT")
local VERBOSE = (os.getenv("SND_VERBOSE") or "") ~= ""
-- SND_SILENCE: the CONTROLLED version of "the driver's cost is absorbed by the
-- sprite-0 wait".  At the $ED02 hook, force every channel's owner byte to 0, so
-- the driver takes its 157-cycle empty path every single frame.  If the total
-- NMI length is unchanged frame-for-frame against the baseline run, the
-- absorption is causal and not a correlation.
local SILENCE = (os.getenv("SND_SILENCE") or "") ~= ""
-- SND_POKE "F0=1@400-401": force a ZP byte over a game-frame window, applied at
-- the $ED02 hook so the driver sees it this frame.  Used to exercise the $F0
-- music-fade path, which no scripted stage-1 run ever reaches on its own.
local POKES = {}
for seg in string.gmatch(os.getenv("SND_POKE") or "", "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad SND_POKE: " .. seg) end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end

local CPU = emu.memType.nesDebug          -- side-effect free CPU space
local MEM = emu.memType.nesMemory

local REQ       = 0xEC1E   -- sound request entry (A = request code)
local DRV       = 0xED02   -- per-frame driver entry
local DRV_RET   = 0x80A4   -- instruction after JSR $ED02
local NMI_ENTRY = 0x806A
local FRAME_END = 0x80B5   -- STA $04 -- the game's frame is finished here
local NMI_EXIT  = 0x80B7   -- PLA ... RTI
local OCT_LOOP  = 0xEF56   -- the octave-shift loop body (worst-case cost probe)
local CMD       = 0xED77   -- a channel's duration counter hit 0 -> parse commands
local SPIN      = 0x9AA3   -- LDA $2002 in the sprite-0 busy-wait
local CHBASE    = { 0xB0, 0xC1, 0xD2, 0xE3 }

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

-- ------------------------------------------------------------- state ---------
local gframe = 0
local nmi_entries, nmi_dropped = 0, 0
local drv_calls = 0
local drv_enter_cyc = nil
local nmi_enter_cyc = nil
local rows = {}
local reqs = {}            -- {frame, a}
local apu_writes = {}      -- [addr] = count, whole run
local apu_frame = 0        -- writes this frame
local apu_frame_max, apu_frame_max_at = -1, -1
local oct_iters = 0        -- $EF56 executions this frame
local oct_max, oct_max_at = 0, -1
local cmd_events = 0       -- $ED77 executions this frame (channels that advanced)
local spin_iters = 0       -- $9AA3 executions this frame (sprite-0 busy-wait)
local spin_min, spin_min_at = 1e9, -1
local pre_spin = 0         -- cycles from NMI entry to the FIRST $9AA3 of the frame
local spin_seen = false
local drv_cyc = 0
local drv_min, drv_max, drv_sum, drv_n = 1e9, -1, 0, 0
local drv_max_at = -1
local nmi_len, nmi_min, nmi_max, nmi_sum, nmi_n = 0, 1e9, -1, 0, 0
local nmi_max_at = -1
local accepted = 0         -- requests that passed the priority test at $EC4D
local in_driver = false
local rd_seen, wr_seen = {}, {}   -- RAM addresses the driver touched, whole run
local rd_pc = {}           -- "addr@pc" for the low-zero-page reads
local drv_start = 0        -- cycles from NMI entry to the JSR $ED02
local drv_start_max = -1
local done, failed, stopped = false, false, false

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

local function cyc() return emu.getState()["cpu.cycleCount"] end

-- --------------------------------------------------------- the sample --------
local function on_frame_end()
   if done then return end
   local function rd(a) return emu.read(a, CPU, false) end
   local row = {
      frame = gframe,
      drvCyc = drv_cyc,
      nmiCyc = nmi_enter_cyc and (cyc() - nmi_enter_cyc) or 0,
      spin   = spin_iters,
      preSpin = pre_spin,
      cmds   = cmd_events,
      apuW   = apu_frame,
      octIt  = oct_iters,
      mode   = rd(0x00),
      pause  = rd(0x15),
      -- one byte per channel: $02,X = the sound index currently owning it
      -- (0 = free; set at $EC93, cleared at $ECB6 when the stream ends)
      c0 = rd(0xB2), c1 = rd(0xC3), c2 = rd(0xD4), c3 = rd(0xE5),
      -- duration counters $00,X: how many frames until the next command
      d0 = rd(0xB0), d1 = rd(0xC1), d2 = rd(0xD2), d3 = rd(0xE3),
      -- globals that overlay the noise struct's unused tail
      f0 = rd(0xF0), f1 = rd(0xF1), f2 = rd(0xF2), f3 = rd(0xF3),
   }
   rows[#rows + 1] = row
   if apu_frame > apu_frame_max then apu_frame_max = apu_frame; apu_frame_max_at = gframe end
   if oct_iters > oct_max then oct_max = oct_iters; oct_max_at = gframe end
   if spin_seen and spin_iters < spin_min then spin_min = spin_iters; spin_min_at = gframe end
   apu_frame = 0
   oct_iters = 0
   cmd_events = 0
   spin_iters = 0
   pre_spin = 0
   spin_seen = false
   drv_cyc = 0
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

-- --------------------------------------------------------------- output ------
local function write_out()
   local f = assert(io.open(OUT, "wb"))
   f:write('{\n')
   f:write(('  "gameFrames": %d,\n'):format(#rows))
   f:write(('  "nmiEntries": %d,\n'):format(nmi_entries))
   f:write(('  "lagFrames": %d,\n'):format(nmi_dropped))
   f:write(('  "driverCalls": %d,\n'):format(drv_calls))
   f:write('  "apuWriteCounts": {')
   local parts = {}
   for a = 0x4000, 0x4017 do
      if apu_writes[a] then
         parts[#parts + 1] = ('"%04X":%d'):format(a, apu_writes[a])
      end
   end
   f:write(table.concat(parts, ","))
   f:write('},\n')
   f:write('  "requests": [')
   parts = {}
   for _, r in ipairs(reqs) do parts[#parts + 1] = ('[%d,%d]'):format(r[1], r[2]) end
   f:write(table.concat(parts, ","))
   f:write('],\n')
   f:write('  "fields": ["frame","drvCyc","nmiCyc","spin","preSpin","cmds","apuW","octIt","mode","pause","c0","c1","c2","c3","d0","d1","d2","d3","f0","f1","f2","f3"],\n')
   f:write('  "frames": [\n')
   local chunk = {}
   for i, r in ipairs(rows) do
      chunk[#chunk + 1] = ('    [%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d,%d]%s\n')
         :format(r.frame, r.drvCyc, r.nmiCyc, r.spin, r.preSpin, r.cmds,
                 r.apuW, r.octIt, r.mode, r.pause,
                 r.c0, r.c1, r.c2, r.c3, r.d0, r.d1, r.d2, r.d3,
                 r.f0, r.f1, r.f2, r.f3, i < #rows and "," or "")
      if #chunk >= 256 then f:write(table.concat(chunk)); chunk = {} end
   end
   if #chunk > 0 then f:write(table.concat(chunk)) end
   f:write('  ]\n}\n')
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
         local function hook(addr, fn)
            emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr,
                                  emu.cpuType.nes, emu.memType.nesMemory)
         end
         hook(FRAME_END, on_frame_end)
         hook(NMI_ENTRY, function()
            nmi_entries = nmi_entries + 1
            nmi_enter_cyc = cyc()
            if emu.read(0x04, CPU, false) ~= 0 then
               nmi_dropped = nmi_dropped + 1
               say(("lag.dropAtGameFrame = %d"):format(gframe))
            end
         end)
         hook(NMI_EXIT, function()
            if nmi_enter_cyc then
               nmi_len = cyc() - nmi_enter_cyc
               if nmi_len < nmi_min then nmi_min = nmi_len end
               if nmi_len > nmi_max then nmi_max = nmi_len; nmi_max_at = gframe end
               nmi_sum = nmi_sum + nmi_len; nmi_n = nmi_n + 1
               nmi_enter_cyc = nil
            end
         end)
         hook(REQ, function()
            local a = emu.getState()["cpu.a"]
            reqs[#reqs + 1] = { gframe, a }
            if VERBOSE then say(("req f=%d a=$%02X"):format(gframe, a)) end
         end)
         hook(0xEC4D, function() accepted = accepted + 1 end)
         hook(DRV, function()
            for _, pk in ipairs(POKES) do
               if gframe >= pk.from and gframe <= pk.to then
                  emu.write(pk.addr, pk.val, MEM)
               end
            end
            if SILENCE then
               for _, b in ipairs(CHBASE) do emu.write(b + 2, 0, MEM) end
            end
            drv_calls = drv_calls + 1
            drv_enter_cyc = cyc()
            in_driver = true
            if nmi_enter_cyc then
               drv_start = drv_enter_cyc - nmi_enter_cyc
               if drv_start > drv_start_max then drv_start_max = drv_start end
            end
         end)
         hook(DRV_RET, function()
            in_driver = false
            if drv_enter_cyc then
               local d = cyc() - drv_enter_cyc
               drv_cyc = d
               if d < drv_min then drv_min = d end
               if d > drv_max then drv_max = d; drv_max_at = gframe end
               drv_sum = drv_sum + d; drv_n = drv_n + 1
               drv_enter_cyc = nil
            end
         end)
         hook(OCT_LOOP, function() oct_iters = oct_iters + 1 end)
         hook(CMD, function() cmd_events = cmd_events + 1 end)
         hook(SPIN, function()
            spin_iters = spin_iters + 1
            if not spin_seen then
               spin_seen = true
               if nmi_enter_cyc then pre_spin = cyc() - nmi_enter_cyc end
            end
         end)
         emu.addMemoryCallback(function(addr, value)
            apu_writes[addr] = (apu_writes[addr] or 0) + 1
            apu_frame = apu_frame + 1
         end, emu.callbackType.write, 0x4000, 0x4017,
            emu.cpuType.nes, emu.memType.nesMemory)
         -- The load-dependence question, answered directly: which RAM does the
         -- driver actually touch?  If it never reads the object tables, its cost
         -- cannot be a function of object count.
         emu.addMemoryCallback(function(addr)
            if in_driver then
               rd_seen[addr] = (rd_seen[addr] or 0) + 1
               -- attribute the surprising low-ZP reads to a PC, so "the driver
               -- reads only its own state" is a claim with a listing behind it
               if addr < 0x11 then
                  local pc = emu.getState()["cpu.pc"]
                  local k = ("%04X@%04X"):format(addr, pc)
                  rd_pc[k] = (rd_pc[k] or 0) + 1
               end
            end
         end, emu.callbackType.read, 0x0000, 0x07FF,
            emu.cpuType.nes, emu.memType.nesMemory)
         emu.addMemoryCallback(function(addr)
            if in_driver then wr_seen[addr] = (wr_seen[addr] or 0) + 1 end
         end, emu.callbackType.write, 0x0000, 0x07FF,
            emu.cpuType.nes, emu.memType.nesMemory)
      end

      if done then
         if OUT then write_out() end
         say("gameFrames = " .. #rows)
         say("emuFrames = " .. ef)
         say("nmiEntries = " .. nmi_entries)
         say("lagFrames = " .. nmi_dropped)
         say("driverCalls = " .. drv_calls)
         say("driverCycles.min = " .. drv_min)
         say("driverCycles.max = " .. drv_max)
         say("driverCycles.maxAtFrame = " .. drv_max_at)
         say("driverCycles.mean = " .. string.format("%.1f", drv_sum / math.max(1, drv_n)))
         say("nmiCycles.min = " .. nmi_min)
         say("nmiCycles.max = " .. nmi_max)
         say("nmiCycles.maxAtFrame = " .. nmi_max_at)
         say("nmiCycles.mean = " .. string.format("%.1f", nmi_sum / math.max(1, nmi_n)))
         say("apuWritesPerFrame.max = " .. apu_frame_max)
         say("apuWritesPerFrame.maxAtFrame = " .. apu_frame_max_at)
         say("octaveLoopIters.max = " .. oct_max)
         say("octaveLoopIters.maxAtFrame = " .. oct_max_at)
         say("sprite0SpinIters.min = " .. spin_min)
         say("sprite0SpinIters.minAtFrame = " .. spin_min_at)
         say("requests = " .. #reqs)
         say("requestsAccepted = " .. accepted)
         say("driverStartOffsetFromNmi.max = " .. drv_start_max)
         local function ranges(t)
            local a = {}
            for k in pairs(t) do a[#a + 1] = k end
            table.sort(a)
            local out, i = {}, 1
            while i <= #a do
               local j = i
               while j < #a and a[j + 1] == a[j] + 1 do j = j + 1 end
               if i == j then out[#out + 1] = ("$%04X"):format(a[i])
               else out[#out + 1] = ("$%04X-$%04X"):format(a[i], a[j]) end
               i = j + 1
            end
            return table.concat(out, " ")
         end
         say("driverRamReads = " .. ranges(rd_seen))
         say("driverRamWrites = " .. ranges(wr_seen))
         local pks = {}
         for k in pairs(rd_pc) do pks[#pks + 1] = k end
         table.sort(pks)
         local pparts = {}
         for _, k in ipairs(pks) do pparts[#pparts + 1] = ("$%s x%d"):format(k, rd_pc[k]) end
         say("driverLowZpReadsByPc = " .. table.concat(pparts, " "))
         local seen, order = {}, {}
         for _, r in ipairs(reqs) do
            if not seen[r[2]] then seen[r[2]] = 0; order[#order + 1] = r[2] end
            seen[r[2]] = seen[r[2]] + 1
         end
         table.sort(order)
         local parts = {}
         for _, a in ipairs(order) do parts[#parts + 1] = ("$%02X x%d"):format(a, seen[a]) end
         say("requestHistogram = " .. table.concat(parts, " "))
         local aparts = {}
         for a = 0x4000, 0x4017 do
            if apu_writes[a] then aparts[#aparts + 1] = ("$%04X x%d"):format(a, apu_writes[a]) end
         end
         say("apuRegisters = " .. table.concat(aparts, " "))
         say("END")
         stopped = true
         emu.stop(0)
      end

      if ef > FRAMES * 3 + 600 then
         die("watchdog: " .. ef .. " emulator frames but only " .. #rows .. " samples")
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
