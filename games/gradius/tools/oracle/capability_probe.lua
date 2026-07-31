-- capability_probe.lua -- proves, inside a real headless Mesen run, that the
-- three oracle-method capabilities exist for Gradius (NES).
--
--   A. execution hooks   emu.addMemoryCallback(fn, emu.callbackType.exec, addr)
--   B. memory access     emu.read / emu.write over CPU RAM, OAM, PPU, palette
--   C. deterministic headless stepping + a readable framebuffer + savestates
--
-- Everything it reports is printed with the "PROBE " prefix so the Python side
-- can separate it from Mesen's own log lines.
--
-- Parameters arrive through the environment (the `os` table exists only because
-- settings.json sets Debug.ScriptWindow.AllowIoOsAccess):
--   PROBE_FRAMES     frame at which the framebuffer is captured   (default 240)
--   PROBE_HOOK_ADDR  CPU address to hook, decimal                 (default: NMI vector)
--   PROBE_OUT        output directory for the framebuffer dumps
--
-- MEASURED API FACTS this file depends on (Mesen 2.1.1, verified by running it):
--   emu.read(address, memType, signed)      -- 3 args
--   emu.write(address, value, memType)      -- 3 args, NOT 4
--   emu.memType.nesDebug                    -- CPU address space WITHOUT side
--                                              effects; nesMemory has them, so
--                                              an oracle read of $2002/$2007
--                                              through nesMemory would change
--                                              the run it is measuring.
--   emu.getScreenBuffer() -> 61440 ARGB ints; emu.getScreenSize() -> {width,height}
--   emu.createSavestate()/loadSavestate() are legal ONLY inside an exec callback.

local function say(s) print("PROBE " .. s) end
local function hex(v, n) return string.format("%0" .. (n or 4) .. "X", v) end

local FRAMES    = tonumber(os.getenv("PROBE_FRAMES") or "") or 240
local HOOK_ADDR = tonumber(os.getenv("PROBE_HOOK_ADDR") or "")
local OUT_DIR   = os.getenv("PROBE_OUT") or "."

local CPU  = emu.memType.nesDebug          -- CPU space, side-effect free
local RAM  = emu.memType.nesInternalRam
local OAM  = emu.memType.nesSpriteRam
local PAL  = emu.memType.nesPaletteRam
local VRAM = emu.memType.nesPpuMemory

-- ---------------------------------------------------------------- helpers ---

-- FNV-1a, 32 bit. Computed on the emulator side so the checksum cannot be an
-- artifact of how Python read the file back.
local function fnv1a(bytes)
   local h = 2166136261
   for i = 1, #bytes do
      h = (h ~ bytes[i])
      h = (h * 16777619) & 0xFFFFFFFF
   end
   return h
end

local function read_range(memtype, from, to)
   local t = {}
   for a = from, to do t[#t + 1] = emu.read(a, memtype, false) end
   return t
end

local function hexlist(t, from, to)
   local o = {}
   for i = from, to do o[#o + 1] = hex(t[i], 2) end
   return table.concat(o, " ")
end

local function vector(addr)
   return emu.read(addr, CPU, false) | (emu.read(addr + 1, CPU, false) << 8)
end

-- ------------------------------------------------------------------ state ---
local nmi_vec, reset_vec, irq_vec
local hook_hits, hook_first, hook_sample = 0, nil, nil
local frame_count, capture_frame = 0, nil
local phase = "run"
local state_blob, dig_at_save, dig_drifted, dig_restored
local clk_at_save, clk_drifted, clk_restored
local resume_target = nil
local failed = false

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

-- ------------------------------------------------------------ the exec hook --
-- Capability A. The callback runs at the instant the CPU is about to execute
-- HOOK_ADDR, so the registers below are the ones that routine sees.
local function on_exec(address, value)
   hook_hits = hook_hits + 1
   local st = emu.getState()
   if hook_first == nil then
      hook_first = {
         frame = st["ppu.frameCount"], pc = st["cpu.pc"], a = st["cpu.a"],
         x = st["cpu.x"], y = st["cpu.y"], sp = st["cpu.sp"], ps = st["cpu.ps"],
         scanline = st["ppu.scanline"], cycle = st["ppu.cycle"],
         cpucycle = st["cpu.cycleCount"],
      }
   end
   if hook_hits == 90 then
      hook_sample = {
         frame = st["ppu.frameCount"], pc = st["cpu.pc"], a = st["cpu.a"],
         x = st["cpu.x"], y = st["cpu.y"], sp = st["cpu.sp"], ps = st["cpu.ps"],
         zp = read_range(CPU, 0x0000, 0x000F),
      }
   end

   if phase == "save" then
      dig_at_save = fnv1a(read_range(RAM, 0, 0x7FF))
      clk_at_save = st["masterClock"]
      state_blob = emu.createSavestate()
      phase = "drift"
      resume_target = frame_count + 60
   elseif phase == "restore" then
      -- Sample the "after" state INSIDE the same callback as the load. Waiting
      -- for the next hook would put the comparison one whole frame past the
      -- restore point and the round trip would look inexact when it is not --
      -- exactly the measurement-artifact trap in docs/knowledge/02-traps.md #3.
      dig_drifted = fnv1a(read_range(RAM, 0, 0x7FF))
      clk_drifted = st["masterClock"]
      emu.loadSavestate(state_blob)
      local after = emu.getState()
      dig_restored = fnv1a(read_range(RAM, 0, 0x7FF))
      clk_restored = after["masterClock"]
      phase = "done"
   end
end

-- --------------------------------------------------------------- framebuffer --
local function dump_framebuffer(tag)
   local fb = emu.getScreenBuffer()          -- 256*240 ARGB ints
   local size = emu.getScreenSize()
   local w, h = size.width, size.height
   local bytes, distinct, distinct_n, nonblack = {}, {}, 0, 0
   for i = 1, #fb do
      local px = fb[i]
      local r, g, b = (px >> 16) & 0xFF, (px >> 8) & 0xFF, px & 0xFF
      bytes[#bytes + 1] = r; bytes[#bytes + 1] = g; bytes[#bytes + 1] = b
      if r + g + b > 0 then nonblack = nonblack + 1 end
      if distinct[px] == nil then distinct[px] = true; distinct_n = distinct_n + 1 end
   end

   local ppm = OUT_DIR .. "/" .. tag .. ".ppm"
   local f = assert(io.open(ppm, "wb"))
   f:write("P6\n" .. w .. " " .. h .. "\n255\n")
   local chunk = {}
   for i = 1, #bytes do
      chunk[#chunk + 1] = string.char(bytes[i])
      if #chunk == 8192 then f:write(table.concat(chunk)); chunk = {} end
   end
   if #chunk > 0 then f:write(table.concat(chunk)) end
   f:close()

   -- Mesen can also hand back a ready-made PNG of the same frame.
   local png = OUT_DIR .. "/" .. tag .. ".png"
   local pf = assert(io.open(png, "wb"))
   local shot = emu.takeScreenshot()
   pf:write(shot)
   pf:close()

   say(("framebuffer.size = %dx%d (%d pixels)"):format(w, h, #fb))
   say(("framebuffer.fnv1a = 0x%s"):format(hex(fnv1a(bytes), 8)))
   say(("framebuffer.distinctColors = %d"):format(distinct_n))
   say(("framebuffer.nonBlackPixels = %d"):format(nonblack))
   say(("framebuffer.ppmBytes = %d"):format(#bytes + 15))
   say(("framebuffer.pngBytes = %d"):format(#shot))
end

-- ------------------------------------------------------------------ the run --
local function on_end_frame()
   frame_count = frame_count + 1
   local st = emu.getState()

   if frame_count == 1 then
      nmi_vec, reset_vec, irq_vec = vector(0xFFFA), vector(0xFFFC), vector(0xFFFE)
      say("rom.vector.nmi = $" .. hex(nmi_vec))
      say("rom.vector.reset = $" .. hex(reset_vec))
      say("rom.vector.irq = $" .. hex(irq_vec))
      local addr = HOOK_ADDR or nmi_vec
      emu.addMemoryCallback(on_exec, emu.callbackType.exec, addr, addr,
                            emu.cpuType.nes, emu.memType.nesMemory)
      say("hook.address = $" .. hex(addr))
      say("emulator.region = " .. tostring(st["region"]))
      say("emulator.clockRate = " .. tostring(st["clockRate"]))
   end

   if frame_count == FRAMES then
      capture_frame = st["ppu.frameCount"]
      -- ---- capability B: read every memory the port will need to match -----
      local oam = read_range(OAM, 0, 255)
      local pal = read_range(PAL, 0, 31)
      local nt  = read_range(VRAM, 0x2000, 0x203F)
      local ram = read_range(RAM, 0, 0x7FF)
      say("mem.internalRam.fnv1a = 0x" .. hex(fnv1a(ram), 8))
      say("mem.internalRam.zp00_0F = " .. hexlist(ram, 1, 16))
      say("mem.oam.fnv1a = 0x" .. hex(fnv1a(oam), 8))
      say(("mem.oam.sprite0 = y %d, tile %d, attr %d, x %d")
          :format(oam[1], oam[2], oam[3], oam[4]))
      say("mem.paletteRam.all32 = " .. hexlist(pal, 1, 32))
      say("mem.nametable0.first16 = " .. hexlist(nt, 1, 16))
      say("mem.chrBank0Offset = " .. tostring(st["mapper.chrMemoryOffset0"]))
      say("ppu.frameCount = " .. tostring(st["ppu.frameCount"]))
      say("ppu.spriteOverflow = " .. tostring(st["ppu.statusFlags.spriteOverflow"]))
      say("ppu.sprite0Hit = " .. tostring(st["ppu.statusFlags.sprite0Hit"]))
      say("cpu.cycleCount = " .. tostring(st["cpu.cycleCount"]))
      say("masterClock = " .. tostring(st["masterClock"]))

      -- ---- capability B: WRITE, read back, restore -------------------------
      local probe_addr = 0x07F0
      local before = emu.read(probe_addr, CPU, false)
      emu.write(probe_addr, 0xA5, CPU)
      local after = emu.read(probe_addr, CPU, false)
      emu.write(probe_addr, before, CPU)
      local restored = emu.read(probe_addr, CPU, false)
      say(("mem.write.$%s = before %s, wrote A5, readback %s, restored %s")
          :format(hex(probe_addr), hex(before, 2), hex(after, 2), hex(restored, 2)))
      say("mem.write.worked = " .. tostring(after == 0xA5 and restored == before))

      -- a write into OAM proves PPU-side memory is writable too
      local oam_before = emu.read(0x10, OAM, false)
      emu.write(0x10, 0x5A, OAM)
      local oam_after = emu.read(0x10, OAM, false)
      emu.write(0x10, oam_before, OAM)
      say("mem.oamWrite.worked = " .. tostring(oam_after == 0x5A
          and emu.read(0x10, OAM, false) == oam_before))

      -- ---- capability C: the picture --------------------------------------
      dump_framebuffer("frame" .. FRAMES)

      -- ---- what the exec hook saw ------------------------------------------
      say("hook.hitCount = " .. hook_hits)
      if hook_first then
         say(("hook.firstHit = frame %d pc $%s a $%s x $%s y $%s sp $%s ps $%s scanline %d ppuCycle %d cpuCycle %d")
             :format(hook_first.frame, hex(hook_first.pc), hex(hook_first.a, 2),
                     hex(hook_first.x, 2), hex(hook_first.y, 2), hex(hook_first.sp, 2),
                     hex(hook_first.ps, 2), hook_first.scanline, hook_first.cycle,
                     hook_first.cpucycle))
      end
      if hook_sample then
         say(("hook.hit90 = frame %d pc $%s a $%s x $%s y $%s sp $%s ps $%s")
             :format(hook_sample.frame, hex(hook_sample.pc), hex(hook_sample.a, 2),
                     hex(hook_sample.x, 2), hex(hook_sample.y, 2),
                     hex(hook_sample.sp, 2), hex(hook_sample.ps, 2)))
         say("hook.hit90.zeroPage00_0F = " .. hexlist(hook_sample.zp, 1, 16))
      end

      phase = "save"
   end

   if phase == "drift" and resume_target and frame_count >= resume_target then
      phase = "restore"
   end

   if phase == "done" then
      say("savestate.bytes = " .. #state_blob)
      say("savestate.ramDigestAtSave = 0x" .. hex(dig_at_save, 8))
      say("savestate.ramDigest60FramesLater = 0x" .. hex(dig_drifted, 8))
      say("savestate.ramDigestAfterRestore = 0x" .. hex(dig_restored, 8))
      say("savestate.masterClockAtSave = " .. tostring(clk_at_save))
      say("savestate.masterClock60FramesLater = " .. tostring(clk_drifted))
      say("savestate.masterClockAfterRestore = " .. tostring(clk_restored))
      say("savestate.roundTripExact = " .. tostring(
          dig_restored == dig_at_save and clk_restored == clk_at_save))
      say("savestate.driftWasObservable = " .. tostring(
          dig_drifted ~= dig_at_save and clk_drifted ~= clk_at_save))
      say("frames.executed = " .. frame_count)
      say("frames.captureFrame = " .. tostring(capture_frame))
      say("END")
      emu.stop(0)
   end

   -- watchdog: never let a bug turn into a silent 3-minute hang
   if frame_count > FRAMES + 400 then
      die("watchdog: reached frame " .. frame_count .. " still in phase " .. phase)
   end
end

emu.addEventCallback(function()
   if failed then return end
   local ok, err = pcall(on_end_frame)
   if not ok then die(err) end
end, emu.eventType.endFrame)
