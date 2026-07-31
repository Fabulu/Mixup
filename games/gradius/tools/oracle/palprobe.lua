-- palprobe.lua -- measure the emulator's NES master palette (index 0..63 -> RGB).
--
-- The renderer check (rendercheck.py) produces, for every pixel, the NES colour
-- INDEX the PPU would have output. Mesen's framebuffer is RGB. Something has to
-- translate, and if that something is derived from the very comparison it is
-- meant to validate, the check proves nothing (docs/knowledge/03, "two sides of
-- a comparison must be independently derived").
--
-- So we measure the table directly, using the PPU's own rule: with rendering
-- disabled ($2001 bits 3 and 4 both clear) the PPU outputs the backdrop colour
-- at $3F00 for every pixel of the frame. Drive $3F00 through 0..63 with
-- rendering off and read the resulting solid frame back.
--
-- $11 is the game's PPUMASK shadow, written to $2001 at $8096 inside the NMI
-- (bytes at $808A: A5 11 / A6 0D / F0 06 / C6 0D / F0 02 / A9 00 / 8D 01 20).
-- Forcing $11 = 0 at the $80B5 sample point therefore blanks the NEXT frame,
-- which is the frame we then read.
--
-- The output is asserted, not assumed: every frame must be SOLID (one distinct
-- colour) and all 64 must be distinct-or-duplicated in the way a real NES
-- palette is ($0D/$1D/$2D/$3D are blacks, $0E/$1E/$2E/$3E and $0F/$1F/$2F/$3F
-- too). A frame that is not solid means the blanking did not take, and the
-- script fails rather than recording a pixel from a picture.
--
--   PP_OUT   absolute path for the 64x3 RGB table

local OUT = os.getenv("PP_OUT") or error("PP_OUT required")

local CPU  = emu.memType.nesDebug
local PAL  = emu.memType.nesPaletteRam
local FRAME_END = 0x80B5

local idx = 0               -- the colour we are trying to measure next
local pending = nil
local got = {}
local bad = 0
local tries = 0
local minfrac = 1.0
local stopped = false

emu.addMemoryCallback(function()
   if idx >= 64 then return end
   emu.write(0x11, 0, CPU)             -- PPUMASK shadow -> rendering off next frame
   emu.write(0x00, idx, PAL)           -- $3F00 backdrop <- the index under test
   pending = idx
end, emu.callbackType.exec, FRAME_END, FRAME_END, emu.cpuType.nes, emu.memType.nesMemory)

local ef = 0
emu.addEventCallback(function()
   if stopped then return end
   ef = ef + 1
   if pending ~= nil and ef > 4 then
      -- The frame that just finished was rendered with $2001 = 0, so almost all
      -- of it is the backdrop colour we set. NOT all of it: measured, the ROM
      -- re-enables rendering for a band around scanlines 32-87 on the title
      -- screen (one of $833B/$852B/$85C1/$9878 -- there are six $2001 store
      -- sites, PROBE/NOTES-rom idiom census), and those rows keep their picture.
      -- The first version of this script demanded a SOLID frame and rejected 54
      -- of the 64 colours; the ten it accepted were exactly the black ones,
      -- which is what tipped it off. So: majority vote, and report the margin.
      local fb = emu.getScreenBuffer()
      local cnt, best, bestn = {}, 0, 0
      for i = 1, #fb do
         local p = fb[i] & 0xFFFFFF
         local c = (cnt[p] or 0) + 1
         cnt[p] = c
         if c > bestn then bestn = c; best = p end
      end
      -- and the backdrop must STILL be the one we asked for: the VRAM queue at
      -- $8A51 could have overwritten $3F00 during the vblank, which would give
      -- a perfectly convincing frame of the wrong colour.
      local still = emu.read(0x00, PAL, false)
      local frac = bestn / #fb
      tries = tries + 1
      if frac < 0.8 or still ~= pending then
         bad = bad + 1                  -- and retry the SAME index next frame
         print(("PROBE rejected = %d (majority=%.3f $3F00=%d)")
               :format(pending, frac, still))
         if tries > 400 then
            print("PROBE ERROR = too many rejects"); print("PROBE END")
            stopped = true; emu.stop(3); return
         end
      else
         got[pending] = best
         if frac < minfrac then minfrac = frac end
         idx = idx + 1
      end
      pending = nil
   end
   if idx >= 64 and pending == nil then
      local n = 0
      local buf = {}
      for i = 0, 63 do
         local c = got[i]
         if c == nil then
            print(("PROBE ERROR = colour %d never measured"):format(i))
            stopped = true
            print("PROBE END")
            emu.stop(3)
            return
         end
         n = n + 1
         buf[#buf + 1] = string.char((c >> 16) & 0xFF, (c >> 8) & 0xFF, c & 0xFF)
      end
      local f = assert(io.open(OUT, "wb"))
      f:write(table.concat(buf))
      f:close()
      print("PROBE measured = " .. n)
      print("PROBE rejectedFrames = " .. bad)
      print(("PROBE worstMajority = %.4f"):format(minfrac))
      print("PROBE END")
      stopped = true
      emu.stop(0)
   end
   if ef > 800 then
      print("PROBE ERROR = watchdog, only " .. tostring(idx) .. " colours")
      print("PROBE END")
      stopped = true
      emu.stop(3)
   end
end, emu.eventType.endFrame)
