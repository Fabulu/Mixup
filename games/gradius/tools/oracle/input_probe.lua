-- input_probe.lua -- proves the harness can DRIVE the game, not just watch it.
--
-- A recorded playtest is only a permanent test if button presses are injectable
-- and reproducible (docs/knowledge/01, "Corpus"). This runs the same ROM twice
-- in one process is not possible, so it takes a mode from the environment:
--
--   PROBE_PRESS = "none" | "start"
--   PROBE_FRAMES = frame at which the framebuffer is captured
--
-- With "start" it holds START from frame 200 to 209 and releases it. If input
-- injection works, the two modes produce different pictures at the same frame.
-- If it is deterministic, each mode reproduces its own picture exactly.
--
-- NOTE ON TIMING: buttons are applied in the inputPolled event, i.e. at the
-- moment the game actually reads the controller. That is the NES analogue of
-- the Game Boy "input has a lead" rule; do not assume the lead is zero, measure
-- it once for real against a scenario before building the corpus on it.

local function say(s) print("PROBE " .. s) end

local FRAMES = tonumber(os.getenv("PROBE_FRAMES") or "") or 400
local MODE   = os.getenv("PROBE_PRESS") or "none"
local OUT    = os.getenv("PROBE_OUT") or "."

local PRESS_FROM, PRESS_TO = 200, 209

local frame = 0
local polls_seen, polls_forced = 0, 0

emu.addEventCallback(function()
   polls_seen = polls_seen + 1
   if MODE == "start" and frame >= PRESS_FROM and frame <= PRESS_TO then
      emu.setInput({ start = true }, 0)
      polls_forced = polls_forced + 1
   end
end, emu.eventType.inputPolled)

emu.addEventCallback(function()
   frame = frame + 1
   if frame ~= FRAMES then return end

   local fb = emu.getScreenBuffer()
   local h = 2166136261
   local nonblack = 0
   for i = 1, #fb do
      local px = fb[i]
      for _, c in ipairs({ (px >> 16) & 0xFF, (px >> 8) & 0xFF, px & 0xFF }) do
         h = (h ~ c); h = (h * 16777619) & 0xFFFFFFFF
      end
      if (px & 0xFFFFFF) ~= 0 then nonblack = nonblack + 1 end
   end

   local f = assert(io.open(OUT .. "/input_" .. MODE .. ".png", "wb"))
   f:write(emu.takeScreenshot())
   f:close()

   local st = emu.getState()
   say("mode = " .. MODE)
   say("frames.executed = " .. frame)
   say("input.polledEvents = " .. polls_seen)
   say("input.forcedPolls = " .. polls_forced)
   say(("framebuffer.fnv1a = 0x%08X"):format(h))
   say("framebuffer.nonBlackPixels = " .. nonblack)
   say("cpu.cycleCount = " .. tostring(st["cpu.cycleCount"]))
   say("mem.$0000_0003 = " .. string.format("%02X %02X %02X %02X",
       emu.read(0, emu.memType.nesDebug, false), emu.read(1, emu.memType.nesDebug, false),
       emu.read(2, emu.memType.nesDebug, false), emu.read(3, emu.memType.nesDebug, false)))
   say("END")
   emu.stop(0)
end, emu.eventType.endFrame)
