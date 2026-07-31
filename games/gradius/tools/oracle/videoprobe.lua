-- videoprobe.lua -- everything the RENDERER has to reproduce, read out of the
-- running cartridge under headless Mesen.
--
-- probe.lua answers "what is the game state". This answers "what is on screen
-- and why": CHR bank, palette RAM, both nametables, hardware OAM, the PPU
-- registers as they stood for each of the two raster bands, and the exact
-- scanline/dot at which the sprite-0 split moves the boundary.
--
-- Driven by videoprobe.py. Parameters arrive through the environment because
-- --testRunner has no argv:
--
--   VP_FRAMES   game frames to run (samples at $80B5, same hook as probe.lua)
--   VP_SCRIPT   input script, "count:buttons" -- see probe.lua
--   VP_AT       the game frame to take the FULL dump at
--   VP_OUT      absolute output directory (Mesen's cwd is not ours -- every
--               path handed to Lua must be absolute, PROBE.md section 6)
--   VP_PATCH    optional "9AC0=00,..." PRG-ROM byte patches applied at frame 1.
--               This is the in-emulator negative control: break the thing in the
--               cartridge and look at what the picture loses.
--   VP_OAM      optional "i:y,tile,attr,x;i:..." -- INJECT sprites. Written into
--               SHADOW OAM ($0200, LDY #$02 / STY $4014 at $8087) at $80B5 of the
--               frame BEFORE the dump frame, because the DMA runs at the top of
--               the next NMI and therefore carries the shadow OAM the previous
--               frame finished with. Index 0 is refused: sprite 0 is the one the
--               split spins on at $9AA3, and clobbering it hangs the handler.
--               This is how the sprite rules are proved by intervention rather
--               than by reading them off a reference -- overlap two sprites, put
--               the higher OAM index at the smaller X, and see which one wins.
--
-- ======================= WHY THE REGISTERS ARE LATCHED ======================
--
-- The registers that drew frame N are NOT the ones in zero page at the end of
-- frame N. Measured trap, same family as probe.lua's $9C:
--
--   $9A79: A5 3E  LDA $3E / 85 12  STA $12      <- the state machine, mid-frame,
--                                                  loads $12 for the NEXT frame
--   $8281: ... A6 12 / 8E 05 20 / A6 13 / 8E 05 20 / A6 10 / 8E 00 20
--                                               <- the vblank write, which is
--                                                  what actually drew this one
--
-- So band A's scroll/PPUCTRL are latched at $82A0 (the RTS of $8281, after all
-- three stores and before anything can touch $12/$13/$10 again). Reading them
-- at $80B5 instead gives you next frame's values and a renderer that is one
-- frame ahead -- which looks almost right, which is the dangerous kind of wrong.
--
-- Byte evidence for the hook, read out of PRG:
--   $8281: AD 02 20 A9 20 8D 06 20 A9 00 8D 06 20 AE 02 20
--          A6 12 8E 05 20 A6 13 8E 05 20 A6 10 8E 00 20 60
--   -> $8293 STX $2005 (X=$12), $8298 STX $2005 (X=$13),
--      $829D STX $2000 (X=$10), $82A0 RTS.
--
-- ============================ THE CHR BANK LATCH ============================
--
-- Mapper 3 (CNROM) latches the low bits of ANY write into $8000-$FFFF, and the
-- cartridge has a bus conflict, so the value written must equal the ROM byte at
-- the address. Konami's idiom, read out of PRG at $8A9C:
--
--   $8A9C: A4 2D        LDY $2D
--   $8A9E: B9 A8 8A     LDA $8AA8,Y
--   $8AA1: 99 A8 8A     STA $8AA8,Y     <- the latch (write == ROM byte)
--   $8AA4: 99 A8 8A     STA $8AA8,Y     <- again
--   $8AA7: 60           RTS
--   $8AA8: 30 32 31 33                  <- the table. bank = byte & 3
--                                          index 0->0, 1->2, 2->1, 3->3
--
-- We hook $8AA4: the first STA has executed, so mapper.chrMemoryOffset0 already
-- holds the NEW bank, and cpu.y still holds the table index. Every latch in the
-- frame is logged with its scanline and dot, which is how the two bands' banks
-- and the swap point are measured rather than assumed.
--
-- ============================== THE SPLIT ===================================
--
--   $9AA0: 20 EE 98     JSR $98EE
--   $9AA3: AD 02 20     LDA $2002
--   $9AA6: 29 40        AND #$40        sprite-0 hit
--   $9AA8: F0 F9        BEQ $9AA3       spin
--   $9AAA: 20 C3 8B     JSR $8BC3       a delay ($8BC3: LDX #$59 / DEX / BNE)
--   $9AAD: AD 02 20     LDA $2002       reset the $2005/$2006 write latch
--   $9AB0: A2 00        LDX #$00
--   $9AB2: 8E 05 20     STX $2005       band B scroll X = 0
--   $9AB5: 8E 05 20     STX $2005       band B scroll Y = 0
--   $9AB8: A5 10        LDA $10
--   $9ABA: 29 FC        AND #$FC        band B nametable bits = 00
--   $9ABC: 8D 00 20     STA $2000
--   $9ABF: A0 02        LDY #$02
--   $9AC1: 20 9E 8A     JSR $8A9E       band B CHR bank = $8AA8[2] & 3 = 1
--
-- Three things at once: scroll, nametable select, CHR bank. We log the scanline
-- and dot of each so the port knows where the boundary really falls -- writes to
-- $2005/$2000 change `t`, and the horizontal half of `t` is copied into `v` at
-- dot 257 of every scanline, so a write finished on scanline S first shows on
-- S+1. The CHR latch is not part of `v` and takes effect immediately.

local function say(s) print("PROBE " .. s) end

local FRAMES = tonumber(os.getenv("VP_FRAMES") or "") or 400
local SCRIPT = os.getenv("VP_SCRIPT") or ""
local AT     = tonumber(os.getenv("VP_AT") or "") or (FRAMES - 1)
local OUT    = os.getenv("VP_OUT")
local PATCH  = os.getenv("VP_PATCH") or ""
local OAMSET = os.getenv("VP_OAM") or ""
local VRAMSET = os.getenv("VP_VRAM") or ""

if not OUT then error("VP_OUT is required and must be absolute") end

local CPU  = emu.memType.nesDebug            -- CPU space, side-effect free
local OAM  = emu.memType.nesSpriteRam
local PAL  = emu.memType.nesPaletteRam
local VRAM = emu.memType.nesPpuMemory
local PRG  = emu.memType.nesPrgRom

local NMI_ENTRY = 0x806A
local FRAME_END = 0x80B5   -- STA $04 -- the sample point (PROBE.md section 1)
local BANDA_SET = 0x82A0   -- RTS of $8281, after the vblank $2005/$2005/$2000
local SPLIT_OUT = 0x9AAA   -- first instruction after the sprite-0 spin exits
local SPLIT_SCX = 0x9AB2   -- STX $2005 -- band B scroll X
local SPLIT_CTL = 0x9ABC   -- STA $2000 -- band B nametable select
local CHR_LATCH = 0x8AA4   -- second STA $8AA8,Y -- the first one already landed

-- ---------------------------------------------------------------- input -----
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

-- --------------------------------------------------------------- patches ----
local PATCHES = {}
for seg in string.gmatch(PATCH, "[^,]+") do
   local a, v = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%x+)%s*$")
   if a == nil then error("bad patch: '" .. seg .. "' (want ADDR=HEXBYTE)") end
   PATCHES[#PATCHES + 1] = { addr = tonumber(a, 16), val = tonumber(v, 16) }
end

-- ------------------------------------------------------ injected sprites ----
local INJECT = {}
for seg in string.gmatch(OAMSET, "[^;]+") do
   local i, y, t, a, x = string.match(seg,
      "^%s*(%d+)%s*:%s*(%d+)%s*,%s*(%x+)%s*,%s*(%x+)%s*,%s*(%d+)%s*$")
   if i == nil then error("bad VP_OAM entry: '" .. seg .. "' (want i:y,tile,attr,x)") end
   i = tonumber(i)
   if i < 1 or i > 63 then error("VP_OAM index must be 1..63 (0 is the split's sprite)") end
   INJECT[#INJECT + 1] = { i = i, y = tonumber(y), t = tonumber(t, 16),
                           a = tonumber(a, 16), x = tonumber(x) }
end

-- --------------------------------------------------------- injected VRAM ----
-- "2360:41,42,43;2760:41,42" -- a run of tile bytes at a PPU address, written
-- at $80B5 of the frame BEFORE the dump frame. Why this exists: measured, the
-- two scanlines around the split boundary (211-213) are BLANK in stage 1's
-- opening, so moving the boundary by one scanline changes nothing and the
-- boundary check is vacuous. Painting the nametable rows there makes it a check
-- that can fail. This is synthetic state -- it is labelled as such in the report,
-- because docs/knowledge/03 warns specifically about harnesses that set up state
-- the game never has. It tests the PPU's rules, not the game's content.
local VRAMPOKE = {}
for seg in string.gmatch(VRAMSET, "[^;]+") do
   local a, rest = string.match(seg, "^%s*(%x+)%s*:%s*(.+)$")
   if a == nil then error("bad VP_VRAM entry: '" .. seg .. "'") end
   local addr = tonumber(a, 16)
   for b in string.gmatch(rest, "[^,]+") do
      VRAMPOKE[#VRAMPOKE + 1] = { addr = addr, val = tonumber(b, 16) }
      addr = addr + 1
   end
end

-- ---------------------------------------------------------------- state -----
local gframe = 0
local nmi_entries, nmi_dropped = 0, 0
local done, failed, stopped = false, false, false
local shot_pending = false
local dumped = false

-- per-frame latches, reset at the top of each NMI
local bandA = nil          -- {scx, scy, ctrl, mask, sl, dot}
local splitEv = nil        -- {sl, dot, ...}
local chrLog = {}          -- every CNROM latch this frame
local spins = 0

local report = {}          -- lines for the JSON

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

local function wr(path, bytes)
   local f = assert(io.open(OUT .. "/" .. path, "wb"))
   f:write(bytes)
   f:close()
end

local function slurp(memtype, from, to)
   local buf = {}
   for a = from, to do buf[#buf + 1] = string.char(emu.read(a, memtype, false)) end
   return table.concat(buf)
end

-- ------------------------------------------------------------- the dump -----
-- Taken at $80B5 of the target frame. NOTE the phase: $80B5 executes near the
-- BOTTOM of the frame it belongs to (the handler busy-waits through the visible
-- area on the sprite-0 hit), so palette RAM, VRAM and hardware OAM read here are
-- exactly what drew the frame that is about to end -- and the screenshot taken
-- at the next endFrame is that same frame. Shadow OAM at $0200 would NOT be:
-- the DMA at $8087 copies it at the TOP of the next NMI.
local function full_dump()
   local st = emu.getState()

   wr("pal.bin",  slurp(PAL,  0x00,   0x1F))     -- $3F00-$3F1F
   wr("nt.bin",   slurp(VRAM, 0x2000, 0x2FFF))   -- both nametables + the mirrors
   wr("oam.bin",  slurp(OAM,  0x00,   0xFF))     -- hardware OAM, 64 x 4
   wr("chr.bin",  slurp(VRAM, 0x0000, 0x1FFF))   -- the 8 KB CHR bank live RIGHT NOW
   wr("ram.bin",  slurp(emu.memType.nesInternalRam, 0x0000, 0x07FF))

   local m = {}
   local function f(k, v) m[#m + 1] = ('  "%s": %s'):format(k, tostring(v)) end
   f("frame", gframe)
   f("dumpScanline", st["ppu.scanline"])
   f("dumpCycle", st["ppu.cycle"])
   f("chrOffsetAtDump", st["mapper.chrMemoryOffset0"])
   -- zero-page shadows AT THE SAMPLE POINT. These are NEXT frame's values for
   -- scroll -- kept only so the off-by-one-frame trap stays visible in the data.
   f("zp_10_ppuctrl", emu.read(0x10, CPU, false))
   f("zp_11_ppumask", emu.read(0x11, CPU, false))
   f("zp_12_scrollX", emu.read(0x12, CPU, false))
   f("zp_13_scrollY", emu.read(0x13, CPU, false))
   f("zp_2D_chrSel",  emu.read(0x2D, CPU, false))
   f("zp_3E_scrollLo", emu.read(0x3E, CPU, false))
   f("zp_3F_scrollHi", emu.read(0x3F, CPU, false))
   -- band A: latched at $82A0 during THIS frame's vblank -- the real ones
   f("bandA_scrollX", bandA and bandA.scx or -1)
   f("bandA_scrollY", bandA and bandA.scy or -1)
   f("bandA_ppuctrl", bandA and bandA.ctrl or -1)
   f("bandA_ppumask", bandA and bandA.mask or -1)
   f("bandA_scanline", bandA and bandA.sl or -1)
   f("bandA_cycle", bandA and bandA.dot or -1)
   -- band B: latched at the split
   f("split_ran", splitEv and 1 or 0)
   f("split_spinExitScanline", splitEv and splitEv.exit_sl or -1)
   f("split_spinExitCycle", splitEv and splitEv.exit_dot or -1)
   f("split_scrollWriteScanline", splitEv and splitEv.scx_sl or -1)
   f("split_scrollWriteCycle", splitEv and splitEv.scx_dot or -1)
   f("split_ctrlWriteScanline", splitEv and splitEv.ctl_sl or -1)
   f("split_ctrlWriteCycle", splitEv and splitEv.ctl_dot or -1)
   f("split_bandB_ppuctrl", splitEv and splitEv.ctl_val or -1)
   f("split_spins", spins)
   -- every CNROM latch of this frame, in order
   local cl = {}
   for _, e in ipairs(chrLog) do
      cl[#cl + 1] = ("{\"pc\":%d,\"y\":%d,\"bank\":%d,\"off\":%d,\"sl\":%d,\"dot\":%d}")
                    :format(e.pc, e.y, e.bank, e.off, e.sl, e.dot)
   end
   m[#m + 1] = '  "chrLatches": [' .. table.concat(cl, ",") .. ']'
   -- mirroring, straight from the emulator; videoprobe.py checks it a second,
   -- independent way by comparing the four 1 KB windows of the 4 KB PPU read.
   m[#m + 1] = ('  "mirroringType": "%s"'):format(tostring(st["mapper.mirroringType"]))

   local f2 = assert(io.open(OUT .. "/dump.json", "wb"))
   f2:write("{\n" .. table.concat(m, ",\n") .. "\n}\n")
   f2:close()
   dumped = true
end

-- ---------------------------------------------------------- the sample ------
local function on_frame_end()
   if done then return end
   local st = emu.getState()

   report[#report + 1] = ("{\"frame\":%d,\"mode\":%d,\"sl\":%d," ..
                          "\"bandA_scx\":%d,\"bandA_scy\":%d,\"bandA_ctrl\":%d," ..
                          "\"bandA_mask\":%d,\"splitRan\":%d,\"splitSl\":%d," ..
                          "\"chrLatches\":%d,\"chrOff\":%d,\"spins\":%d}")
      :format(gframe, emu.read(0x00, CPU, false), st["ppu.scanline"],
              bandA and bandA.scx or -1, bandA and bandA.scy or -1,
              bandA and bandA.ctrl or -1, bandA and bandA.mask or -1,
              splitEv and 1 or 0, splitEv and splitEv.scx_sl or -1,
              #chrLog, st["mapper.chrMemoryOffset0"], spins)

   if gframe == AT - 1 and #INJECT > 0 then
      -- into SHADOW OAM: the DMA at $8087 of the next NMI copies page $02 into
      -- hardware OAM, so these are the sprites that draw the dump frame.
      for _, s in ipairs(INJECT) do
         emu.write(0x0200 + s.i * 4 + 0, s.y, CPU)
         emu.write(0x0200 + s.i * 4 + 1, s.t, CPU)
         emu.write(0x0200 + s.i * 4 + 2, s.a, CPU)
         emu.write(0x0200 + s.i * 4 + 3, s.x, CPU)
      end
      say("injectedSprites = " .. #INJECT)
   end
   if gframe == AT - 1 and #VRAMPOKE > 0 then
      for _, p in ipairs(VRAMPOKE) do emu.write(p.addr, p.val, VRAM) end
      say("injectedVram = " .. #VRAMPOKE)
   end

   if gframe == AT then
      full_dump()
      shot_pending = true
   end

   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

-- --------------------------------------------------------------- json -------
local function write_report()
   local f = assert(io.open(OUT .. "/frames.json", "wb"))
   f:write('{\n  "tool": "games/gradius/tools/oracle/videoprobe.lua",\n')
   f:write(('  "gameFrames": %d,\n  "lagFrames": %d,\n  "dumpFrame": %d,\n')
           :format(#report, nmi_dropped, AT))
   f:write(('  "patches": "%s",\n'):format(PATCH))
   f:write('  "frames": [\n')
   for i, r in ipairs(report) do
      f:write("    " .. r .. (i < #report and "," or "") .. "\n")
   end
   f:write("  ]\n}\n")
   f:close()
end

-- ----------------------------------------------------------- callbacks ------
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
         for _, p in ipairs(PATCHES) do
            local before = emu.read(p.addr, CPU, false)
            emu.write(p.addr - 0x8000, p.val, PRG)
            local after = emu.read(p.addr, CPU, false)
            say(("patch $%04X: %02X -> %02X"):format(p.addr, before, after))
            if after ~= p.val then die("PRG patch did not stick"); return end
         end

         local function hook(addr, fn)
            emu.addMemoryCallback(fn, emu.callbackType.exec, addr, addr,
                                  emu.cpuType.nes, emu.memType.nesMemory)
         end

         hook(FRAME_END, on_frame_end)

         hook(NMI_ENTRY, function()
            nmi_entries = nmi_entries + 1
            if emu.read(0x04, CPU, false) ~= 0 then
               nmi_dropped = nmi_dropped + 1
               say(("lag.dropAtGameFrame = %d"):format(gframe))
            end
            -- a new frame's worth of latches starts here
            bandA, splitEv, chrLog, spins = nil, nil, {}, 0
         end)

         -- band A: $82A0 is the RTS of $8281; $12/$13/$10 are exactly what the
         -- three STX just pushed into $2005/$2005/$2000.
         hook(BANDA_SET, function()
            local st2 = emu.getState()
            bandA = { scx = emu.read(0x12, CPU, false),
                      scy = emu.read(0x13, CPU, false),
                      ctrl = emu.read(0x10, CPU, false),
                      mask = emu.read(0x11, CPU, false),
                      sl = st2["ppu.scanline"], dot = st2["ppu.cycle"] }
         end)

         hook(0x9AA3, function() spins = spins + 1 end)

         hook(SPLIT_OUT, function()
            local st2 = emu.getState()
            splitEv = { exit_sl = st2["ppu.scanline"], exit_dot = st2["ppu.cycle"] }
         end)
         hook(SPLIT_SCX, function()
            if splitEv then
               local st2 = emu.getState()
               splitEv.scx_sl = st2["ppu.scanline"]; splitEv.scx_dot = st2["ppu.cycle"]
            end
         end)
         hook(SPLIT_CTL, function()
            if splitEv then
               local st2 = emu.getState()
               splitEv.ctl_sl = st2["ppu.scanline"]; splitEv.ctl_dot = st2["ppu.cycle"]
               splitEv.ctl_val = st2["cpu.a"]
            end
         end)

         -- $8AA4: the STA at $8AA1 has already executed, so the mapper offset is
         -- the NEW one and cpu.y is still the table index.
         hook(CHR_LATCH, function()
            local st2 = emu.getState()
            local y = st2["cpu.y"]
            chrLog[#chrLog + 1] = {
               pc = st2["cpu.pc"], y = y,
               bank = emu.read(0x8AA8 + y, CPU, false) & 3,
               off = st2["mapper.chrMemoryOffset0"],
               sl = st2["ppu.scanline"], dot = st2["ppu.cycle"] }
         end)
      end

      if shot_pending then
         local f = assert(io.open(OUT .. "/shot.png", "wb"))
         f:write(emu.takeScreenshot())
         f:close()
         -- raw framebuffer too: 256*240 pixels as R,G,B bytes (same byte order
         -- as palprobe.lua's table), so the checker compares pixels instead of
         -- trusting a PNG round-trip.
         local fb = emu.getScreenBuffer()
         local buf, nonblack, distinct, dn = {}, 0, {}, 0
         for i = 1, #fb do
            local px = fb[i] & 0xFFFFFF
            buf[#buf + 1] = string.char((px >> 16) & 0xFF, (px >> 8) & 0xFF, px & 0xFF)
            if px ~= 0 then nonblack = nonblack + 1 end
            if distinct[px] == nil then distinct[px] = true; dn = dn + 1 end
         end
         wr("fb.bin", table.concat(buf))
         say("framebuffer.pixels = " .. #fb)
         say("framebuffer.nonBlackPixels = " .. nonblack)
         say("framebuffer.distinctColors = " .. dn)
         shot_pending = false
      end

      if done then
         if not dumped then die("never reached dump frame " .. AT); return end
         write_report()
         say("gameFrames = " .. #report)
         say("emuFrames = " .. ef)
         say("nmiEntries = " .. nmi_entries)
         say("lagFrames = " .. nmi_dropped)
         say("END")
         stopped = true
         emu.stop(0)
      end

      if ef > FRAMES * 3 + 600 then
         die("watchdog: " .. ef .. " emulator frames, " .. #report .. " samples")
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
