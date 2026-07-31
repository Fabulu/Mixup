-- queue.lua -- WHO FILLS $0700, and why the terrain streamer skips frames.
--
-- The one known deviation in the shipped port is `terrain-streams-at-double-rate`
-- (tools/oracle/scenarios.json): $58 advances every frame in the port and every
-- SECOND frame on the cartridge. The recorded diagnosis blames the gate
--
--     9D87  A5 0E     LDA $0E
--     9D89  C9 04     CMP #$04
--     9D8B  90 01     BCC $9D8E
--
-- i.e. "do not build while the shared $0700 queue already holds 4+ BYTES", and
-- blames the bytes on a canned-packet producer. This probe re-measures that from
-- scratch instead of trusting it:
--
--   * every WRITE to $000E is censused by writing PC, so "who moved the cursor"
--     is answered by the hardware and not by the listing;
--   * $9D83 (gate entry) and $9D8E (build entry) are hooked separately, so the
--     gate's decision is observed rather than inferred from $58;
--   * the five producers that can touch the queue are hooked at their entry
--     with the A register (the canned-packet INDEX) captured:
--       $85E8  prologue: appends mode byte $01, then FALLS THROUGH to $85F3
--       $85F3  the canned-packet copier proper
--       $863D  append a single $FF   (packet terminator)
--       $8641  append a single $00   (queue terminator; NMI $80B0 every frame)
--       $8645/$8647  the raw append primitives
--   * $8A51 (the drainer) is hooked so the per-frame queue lifecycle is a
--     timeline, not a snapshot.
--
-- Environment (--testRunner cannot pass argv):
--   Q_FRAMES  game frames to sample        Q_SCRIPT  input script, probe.lua grammar
--   Q_JSON    absolute path for output     Q_FROM    first game frame to log events
--   Q_TO      last game frame to log events
--   Q_NEUTER  "starve" -> force $0E to 0 at $9D83 (the port's behaviour), which
--             must make the cartridge stream every frame. That is the control:
--             if the gate is really what throttles the streamer, defeating it
--             must double the rate.

local function say(s) print("PROBE " .. s) end

local FRAMES   = tonumber(os.getenv("Q_FRAMES") or "") or 700
local SCRIPT   = os.getenv("Q_SCRIPT") or ""
local JSON_OUT = os.getenv("Q_JSON")
local FROM     = tonumber(os.getenv("Q_FROM") or "") or 0
local TO       = tonumber(os.getenv("Q_TO") or "") or 999999
local NEUTER   = os.getenv("Q_NEUTER") or ""

local CPU = emu.memType.nesDebug

local FRAME_END = 0x80B5
local NMI_ENTRY = 0x806A
local GATE      = 0x9D83
local BUILD     = 0x9D8E
local DRAIN     = 0x8A51

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

local gframe, ef = 0, 0
local done, failed, stopped = false, false, false
local guard_bad = 0
local frames, events, qdumps, qends = {}, {}, {}, {}
local ewrites = {}          -- census of writes to $000E, by PC
local gate_calls, build_calls = 0, 0
local f_gate, f_build = 0, 0
local f_maxE = 0
local f_hud, f_hudran = 0, 0
local hud_calls, hud_ran = 0, 0
local hud_by_parity = {}     -- [$02 & 1] = { seen = n, ran = n }
local starve_pokes = 0

local function rd(a) return emu.read(a, CPU, false) end
local function A() return emu.getState()["cpu.a"] end

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

local function ev(kind, a, b, c)
   if done then return end
   if gframe < FROM or gframe > TO then return end
   if #events > 200000 then return end
   events[#events + 1] = { gframe, kind, a or 0, b or 0, c or 0 }
end

-- event kind codes (kept numeric so the JSON stays small)
local K_GATE, K_BUILD, K_DRAIN = 1, 2, 3
local K_85E8, K_85F3, K_863D, K_8641, K_8645, K_8647 = 4, 5, 6, 7, 8, 9
local K_EWRITE, K_HUD, K_HUDRUN = 10, 11, 12

local function on_frame_end()
   if done then return end
   if rd(0x04) ~= 1 then guard_bad = guard_bad + 1 end
   -- The queue AS THE WHOLE FRAME LEFT IT, at $80B5 -- i.e. after $9ACE's
   -- terrain block AND after $80B0's $8641 stop byte. This is the only dump
   -- point where a TERRAIN packet can be seen at all, because $9D83's dump is
   -- taken BEFORE the streamer runs. Wave 2 added it because the port's
   -- tile-packet shape (four ROWS with PPU increment 1 -- $9EC6 LDA #$01 and
   -- $9ED8 ADC #$20 -- not four columns with increment 32) was otherwise
   -- unfalsifiable: the two write the same 4x4 square and cost the same 37
   -- bytes, so no nametable and no $0E comparison can tell them apart.
   if gframe >= FROM and gframe <= TO then
      local n, b = rd(0x0E), {}
      for i = 0, n - 1 do b[#b + 1] = rd(0x0700 + i) end
      qends[#qends + 1] = { frame = gframe, prog = rd(0x58),
                            lo = rd(0x54), hi = rd(0x55), bytes = b }
   end
   frames[#frames + 1] = {
      frame = gframe, mode = rd(0x00), sub = rd(0x1B), stage = rd(0x19),
      camLo = rd(0x3E), camHi = rd(0x3F), subpx = rd(0x3D),
      buildLo = rd(0x54), buildHi = rd(0x55), prog = rd(0x58),
      caught = rd(0x57), gate3A = rd(0x3A), queue = rd(0x0E),
      gateCalls = f_gate, buildCalls = f_build, maxE = f_maxE,
      f02 = rd(0x02), hud48 = rd(0x48), hudCalls = f_hud, hudRan = f_hudran,
   }
   f_gate, f_build, f_maxE, f_hud, f_hudran = 0, 0, 0, 0, 0
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function on_gate()
   f_gate = f_gate + 1
   gate_calls = gate_calls + 1
   ev(K_GATE, rd(0x0E), rd(0x3A), rd(0x58))
   -- The queue AS THE GATE SEES IT. This is the raw $0700 image the port
   -- replaces with a list of {addr,inc,bytes} objects, so it is the only place
   -- the canned-packet byte format can be checked against a decode of $864E.
   if gframe >= FROM and gframe <= TO then
      local n, b = rd(0x0E), {}
      for i = 0, n - 1 do b[#b + 1] = rd(0x0700 + i) end
      qdumps[#qdumps + 1] = { frame = gframe, bytes = b }
   end
   -- The control. The port's queue is empty at this point every frame because
   -- the HUD producers are unported; forcing $0E to 0 here makes the CARTRIDGE
   -- behave like the port. If the gate is the cause, $58 must then advance
   -- every frame.
   if NEUTER == "starve" then
      emu.write(0x0E, 0, CPU)
      starve_pokes = starve_pokes + 1
   end
end

local function on_build()
   f_build = f_build + 1
   build_calls = build_calls + 1
   ev(K_BUILD, rd(0x0E), rd(0x58), rd(0x57))
end

emu.addEventCallback(function()
   local t = INPUT[gframe + 1]
   if t and next(t) ~= nil then emu.setInput(t, 0) end
end, emu.eventType.inputPolled)

local function w(f, s) f:write(s) end

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   w(f, '{\n')
   w(f, '  "tool": "games/gradius/tools/oracle/queue.lua",\n')
   w(f, ('  "inputScript": "%s",\n'):format(SCRIPT))
   w(f, ('  "neuter": "%s",\n'):format(NEUTER))
   w(f, ('  "gameFrames": %d,\n'):format(#frames))
   w(f, ('  "guardViolations": %d,\n'):format(guard_bad))
   w(f, ('  "gateCalls": %d,\n'):format(gate_calls))
   w(f, ('  "buildCalls": %d,\n'):format(build_calls))
   w(f, ('  "starvePokes": %d,\n'):format(starve_pokes))
   w(f, ('  "hudCalls": %d,\n'):format(hud_calls))
   w(f, ('  "hudRan": %d,\n'):format(hud_ran))
   w(f, ('  "hudRanOnEvenFrameCounter": %d,\n'):format(hud_by_parity[0] or 0))
   w(f, ('  "hudRanOnOddFrameCounter": %d,\n'):format(hud_by_parity[1] or 0))

   w(f, '  "eWriteCensus": {')
   local ks = {}
   for k in pairs(ewrites) do ks[#ks + 1] = k end
   table.sort(ks)
   for i, k in ipairs(ks) do
      w(f, ('%s"%04X":%d'):format(i > 1 and "," or "", k, ewrites[k]))
   end
   w(f, '},\n')

   local FK = { "frame", "mode", "sub", "stage", "camLo", "camHi", "subpx",
                "buildLo", "buildHi", "prog", "caught", "gate3A", "queue",
                "gateCalls", "buildCalls", "maxE", "f02", "hud48",
                "hudCalls", "hudRan" }
   w(f, '  "frameFields": ["' .. table.concat(FK, '","') .. '"],\n')
   w(f, '  "frames": [\n')
   local ch = {}
   for i, r in ipairs(frames) do
      local p = {}
      for _, k in ipairs(FK) do p[#p + 1] = tostring(r[k] or 0) end
      ch[#ch + 1] = "    [" .. table.concat(p, ",") .. "]" ..
                    (i < #frames and "," or "") .. "\n"
      if #ch >= 256 then w(f, table.concat(ch)); ch = {} end
   end
   w(f, table.concat(ch))
   w(f, '  ],\n')

   w(f, '  "eventFields": ["frame","kind","a","b","c"],\n')
   w(f, '  "events": [\n')
   ch = {}
   for i, r in ipairs(events) do
      ch[#ch + 1] = ("    [%d,%d,%d,%d,%d]%s\n"):format(
         r[1], r[2], r[3], r[4], r[5], i < #events and "," or "")
      if #ch >= 512 then w(f, table.concat(ch)); ch = {} end
   end
   w(f, table.concat(ch))
   w(f, '  ],\n')

   w(f, '  "queueDumps": [\n')
   for i, q in ipairs(qdumps) do
      w(f, ('    {"frame":%d,"bytes":[%s]}%s\n'):format(
         q.frame, table.concat(q.bytes, ","), i < #qdumps and "," or ""))
   end
   w(f, '  ],\n')

   w(f, '  "queueAtFrameEnd": [\n')
   for i, q in ipairs(qends) do
      w(f, ('    {"frame":%d,"buildLo":%d,"buildHi":%d,"prog":%d,"bytes":[%s]}%s\n'):format(
         q.frame, q.lo, q.hi, q.prog, table.concat(q.bytes, ","),
         i < #qends and "," or ""))
   end
   w(f, '  ]\n}\n')
   f:close()
end

emu.addEventCallback(function()
   if failed or stopped then return end
   local ok, err = pcall(function()
      ef = ef + 1
      if ef == 1 then
         local v = rd(0xFFFA) | (rd(0xFFFB) << 8)
         if v ~= NMI_ENTRY then
            die(("NMI vector is $%04X, expected $%04X"):format(v, NMI_ENTRY))
            return
         end
         local function exec(fn, a)
            emu.addMemoryCallback(fn, emu.callbackType.exec, a, a,
                                  emu.cpuType.nes, emu.memType.nesMemory)
         end
         exec(on_frame_end, FRAME_END)
         exec(on_gate, GATE)
         exec(on_build, BUILD)
         exec(function() ev(K_DRAIN, rd(0x0E)) end, DRAIN)
         -- $8898, called from $9AC7 -- i.e. SEVEN BYTES before $9ACE JSR $9D83.
         --   8898  LDA $0E / CMP #$04 / BCC $889F   ; same queue gate
         --   889F  LDA $02 / LSR A / BCC $889E      ; ODD frames only
         --   88A4  INC $48 / LDA $48 / AND #$03 / JSR $83E4   ; 4-state rotation
         -- The parity test is the alternation the port is missing.
         exec(function()
                 f_hud = f_hud + 1; hud_calls = hud_calls + 1
                 ev(K_HUD, rd(0x0E), rd(0x02), rd(0x48))
              end, 0x8898)
         exec(function()
                 f_hudran = f_hudran + 1; hud_ran = hud_ran + 1
                 local par = rd(0x02) & 1
                 hud_by_parity[par] = (hud_by_parity[par] or 0) + 1
                 ev(K_HUDRUN, rd(0x0E), rd(0x02), rd(0x48))
              end, 0x88A4)
         exec(function() ev(K_85E8, A(), rd(0x0E)) end, 0x85E8)
         exec(function() ev(K_85F3, A(), rd(0x0E)) end, 0x85F3)
         exec(function() ev(K_863D, A(), rd(0x0E)) end, 0x863D)
         exec(function() ev(K_8641, A(), rd(0x0E)) end, 0x8641)
         exec(function() ev(K_8645, A(), rd(0x0E)) end, 0x8645)
         exec(function() ev(K_8647, A(), rd(0x0E)) end, 0x8647)
         -- Every write to the queue cursor, tagged with the PC. Mesen reports
         -- the PC AFTER the storing instruction, so $864D is `STX $0E` at $864B.
         emu.addMemoryCallback(function(_a, value)
                                  local pc = emu.getState()["cpu.pc"]
                                  ewrites[pc] = (ewrites[pc] or 0) + 1
                                  if value > f_maxE then f_maxE = value end
                                  ev(K_EWRITE, value, pc & 0xFF, pc >> 8)
                               end, emu.callbackType.write, 0x0E, 0x0E,
                               emu.cpuType.nes, emu.memType.nesMemory)
      end
      if done then
         write_json()
         say("gameFrames = " .. #frames)
         say("guardViolations = " .. guard_bad)
         say("gateCalls = " .. gate_calls)
         say("buildCalls = " .. build_calls)
         say("END")
         stopped = true
         emu.stop(0)
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
