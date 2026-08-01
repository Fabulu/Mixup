-- probe.lua -- the Gradius reference trace. Runs the real cartridge under
-- headless Mesen, drives the controller, and samples the game's state once per
-- game frame at a stable point in the game's OWN loop.
--
-- This is the NES counterpart of Batman's tools/oracle/trace.py. Everything it
-- reads is a measurement of the running cartridge; nothing here ships.
--
-- Driven by games/gradius/tools/oracle/probe.py -- see that file for usage.
-- Parameters arrive through the environment because --testRunner has no way to
-- pass argv to the script:
--
--   PROBE_FRAMES    number of GAME frames to sample (not emulator frames)
--   PROBE_SCRIPT    input script, "count:buttons" segments, e.g. "200:,10:S,300:R"
--                   buttons: U D L R A B S(tart) E(select). Empty = nothing held.
--   PROBE_JSON      path to write the per-frame state vector JSON
--   PROBE_RAMDUMP   optional path; raw $0000-$07FF, 2048 bytes per sampled frame
--   PROBE_VIDEO     optional path; one 2336-byte blob PER FRAME listed in
--                   PROBE_VIDEO_AT, concatenated in that order (wave 10)
--   PROBE_VIDEO_AT  comma-separated game frames, e.g. "1900,2105"
--   PROBE_WATCH     optional "8000,00A5" hex addresses added to the vector as w_XXXX
--   PROBE_SHOT      optional PNG path, written at the last sampled frame
--   PROBE_POKE      optional "0360=200@400-460,0320=60@400-460" -- force RAM at
--                   the sample point, held over a frame window. This is how a
--                   "this address correlates with the player" claim is turned
--                   into "this address CONTROLS the player": poke it, then look
--                   at the picture.
--
-- ============================ THE SAMPLE POINT ==============================
--
-- We sample at an exec hook on $80B5, and the choice matters more than anything
-- else in this file (docs/knowledge/01, "Sample at a stable point in the game's
-- own loop"; docs/knowledge/02 trap #3).
--
-- MEASURED, not assumed. Read out of the running cartridge:
--   $FFFA -> $806A          the NMI vector
--   $8067: 4C 67 80         JMP $8067 -- RESET ends in an empty infinite spin,
--                           so there is no main loop. The whole game is the NMI.
--   $806A: 08 48 8A 48 98 48    PHP/PHA/TXA/PHA/TYA/PHA
--   $8070: AD 02 20             LDA $2002
--   $8073: A4 04                LDY $04       re-entrancy guard
--   $8075: D0 40                BNE $80B7     guard taken == this frame is DROPPED
--   $8077: 20 36 83             JSR $8336     ... OAM DMA, VRAM queue, scroll,
--                                             sound, joypad, game state machine
--   $80B3: A9 00                LDA #$00
--   $80B5: 85 04                STA $04       <-- WE HOOK HERE
--   $80B7: 68 A8 68 AA 68 28 40 PLA/TAY/PLA/TAX/PLA/PLP/RTI
--
-- $80B5 is the last instruction of the game's own frame: every subsystem the NMI
-- calls ($ED02 sound, $81BF joypad, $80BE state machine, $8BAB, $8641) has
-- already run, and the guard has not been cleared yet -- so a sample taken here
-- is exactly the "post-update" pair one tick of a port produces. Sampling at the
-- emulator's frame boundary instead would slice this handler, because the NMI
-- busy-waits on the sprite-0 hit at $9AA3 through the visible frame and finishes
-- near scanline 240, not in VBlank.
--
-- Hit counts over 300 emulator frames on the title screen, measured:
--   $806A 296   $8075 296   $8077 296   $80B5 296   $80B7 296   $9AA3 0
-- i.e. one sample per NMI and no dropped frames there. $81BF fired 297 times --
-- once MORE than the NMI count, because RESET's init path calls the joypad read
-- once at frame 3 before NMI is even enabled.
--
-- LAG: we hook $806A as well and count. lagFrames = NMI entries that did not
-- reach $80B5. docs/knowledge/02 trap #6 -- name it, bound it, tag it.
--
-- OAM PHASE, and it is a trap for the port: the DMA at $8087 happens at the TOP
-- of the NMI, so it copies the shadow OAM the PREVIOUS frame built. The shadow
-- OAM this probe reads at $80B5 is what the player will see on the NEXT frame.
--
-- ============================ THE VIDEO DUMPS (wave 10) ======================
--
-- `seedRam` carries $0000-$07FF and nothing else, which is why the comparison
-- could only ever start where the port could REBUILD the video state by running
-- from the beginning. PROBE_VIDEO dumps the rest, at each frame in
-- PROBE_VIDEO_AT -- scen.py asks for two, the align frame (the SEED) and the
-- last frame of the window (the CHECK). Each dump is:
--
--   offset 0      2048 B   PPU $2000-$27FF -- the two physical nametables.
--                          Gradius is VERTICALLY mirrored (iNES flags6 = $31,
--                          and a live 4 KB read says $2000 == $2800 and
--                          $2400 == $2C00), so $2800-$2FFF is an alias and
--                          dumping it would be dumping the same 2 KB twice.
--                          src/vram.js's drainQueue writes exactly this
--                          arrangement.
--   offset 2048     32 B   palette RAM $3F00-$3F1F (src/state.js vram.pal)
--   offset 2080    256 B   HARDWARE OAM -- what the PPU is showing right now,
--                          i.e. what $8087 DMA'd at the top of THIS frame from
--                          the shadow the PREVIOUS frame built. NOT the shadow;
--                          the shadow is $0200-$02FF and is already in the RAM
--                          dump.
--
-- Each is taken at $80B5, at the same instant as the RAM dump and the state
-- row, and BEFORE the pokes -- so all three describe one instant of one frame.
--
-- ============================== THE INPUT ===================================
--
-- Buttons go in through emu.setInput() on the inputPolled event, which is the
-- moment the CPU reads $4016. The game's own strobe routine at $81BF
-- (LDX #$01 / STX $4016 / DEX / STX $4016 / 8x LDA $4016) then shifts them into
-- zero page $9C. We are driving the controller port, NOT poking $9C -- and the
-- probe proves it by reporting $9C, which only becomes non-zero if the bits
-- really travelled through the shift register.
--
-- $81BF is called at $80A4, BEFORE the game state machine at $80AA, so a button
-- applied at the poll of NMI N is consumed by NMI N's own update. MEASURED with
-- probe.py --lead: asking for START on game frame 200 makes $9C read $10 on
-- game frame 200. THE INPUT LEAD IS ZERO. The Game Boy's one-tick lead
-- (docs/knowledge/01) does not carry over -- do not inherit it.
--
-- BUTTON BITS in $9C, measured by pressing one button at a time and reading the
-- byte: START -> $10, RIGHT -> $01. The shift loop at $81CA reads $4016 eight
-- times and ROLs into $9C, so bit 7 is the first bit out:
--     bit7 A   bit6 B   bit5 Select   bit4 Start
--     bit3 Up  bit2 Down bit1 Left    bit0 Right
--
-- WHERE WE READ IT, AND WHY NOT AT $80B5: $9C does NOT still hold the joypad at
-- the end of the frame. The sprite emitter at $8B39 is
--     A5 2F  18  69 44  D0 03  18 69 04  85 2F  85 9C
--     LDA $2F / CLC / ADC #$44 / BNE +3 / CLC / ADC #$04 / STA $2F / STA $9C
-- i.e. it reuses $9C as scratch for the per-frame OAM base pointer. Sampling
-- $9C at $80B5 gives you $2F, which looks like a plausible 65-distinct-value
-- input trace and is nothing of the kind. We therefore latch $9C/$9D with a
-- second hook at $80A7 -- the instruction immediately after `JSR $81BF` -- and
-- report that. (Found by measuring, exactly the shape of docs/knowledge/02
-- trap #3: the field that will not converge is the measurement, not the port.)

local function say(s) print("PROBE " .. s) end

local FRAMES   = tonumber(os.getenv("PROBE_FRAMES") or "") or 400
local SCRIPT   = os.getenv("PROBE_SCRIPT") or ""
local JSON_OUT = os.getenv("PROBE_JSON")
local RAM_OUT  = os.getenv("PROBE_RAMDUMP")
local WATCH_S  = os.getenv("PROBE_WATCH") or ""
local SHOT_OUT = os.getenv("PROBE_SHOT")
local POKE_S   = os.getenv("PROBE_POKE") or ""
local VID_OUT  = os.getenv("PROBE_VIDEO")
-- A LIST of game frames, in the order they must land in the file. Kept as a
-- list rather than "first and last" so scen.py owns the policy and this file
-- owns only the dumping.
local VID_AT   = {}
for f in string.gmatch(os.getenv("PROBE_VIDEO_AT") or "", "[^,]+") do
   VID_AT[#VID_AT + 1] = tonumber(f)
end

local CPU = emu.memType.nesDebug          -- CPU space, side-effect free
local RAM = emu.memType.nesInternalRam    -- $0000-$07FF, flat
local OAM = emu.memType.nesSpriteRam
local PAL = emu.memType.nesPaletteRam     -- $3F00-$3F1F, 32 bytes flat
local PPU = emu.memType.nesPpuMemory      -- PPU space, mirroring applied

local NMI_ENTRY = 0x806A   -- read back from $FFFA at frame 1 and asserted
local POST_POLL = 0x80A7   -- the instruction after `JSR $81BF` -- joypad is fresh
local FRAME_END = 0x80B5   -- STA $04 -- the sample point
local SPLIT     = 0x9AA3   -- LDA $2002 / AND #$40 / BEQ -- the sprite-0 spin

-- ---------------------------------------------------------------- input ------
local BUTTON = { U = "up", D = "down", L = "left", R = "right",
                 A = "a", B = "b", S = "start", E = "select" }

-- "200:,10:S,300:R" -> per-game-frame list of Mesen input tables
local function parse_script(s)
   local out = {}
   for seg in string.gmatch(s, "[^,]+") do
      local n, keys = string.match(seg, "^%s*(%d+)%s*:%s*(.-)%s*$")
      if n == nil then error("bad script segment: '" .. seg .. "'") end
      local t = {}
      for c in string.gmatch(keys:upper(), ".") do
         local b = BUTTON[c]
         if b == nil then error("unknown button '" .. c .. "' in '" .. seg .. "'") end
         t[b] = true
      end
      for _ = 1, tonumber(n) do out[#out + 1] = t end
   end
   return out
end

local INPUT = parse_script(SCRIPT)

-- ------------------------------------------------------------ watch list -----
local WATCH = {}
for a in string.gmatch(WATCH_S, "[^,]+") do
   local v = tonumber((a:gsub("^%s*%$?", "")), 16)
   if v then WATCH[#WATCH + 1] = v end
end

-- -------------------------------------------------------------- pokes -------
-- "0360=200@400-460" -> {addr=0x360, val=200, from=400, to=460}
local POKES = {}
for seg in string.gmatch(POKE_S, "[^,]+") do
   local a, v, f, t = string.match(seg, "^%s*%$?(%x+)%s*=%s*(%d+)%s*@%s*(%d+)%-(%d+)%s*$")
   if a == nil then error("bad poke: '" .. seg .. "' (want ADDR=VAL@FROM-TO)") end
   POKES[#POKES + 1] = { addr = tonumber(a, 16), val = tonumber(v),
                         from = tonumber(f), to = tonumber(t) }
end
local pokes_applied = 0

-- ------------------------------------------------------------- state ---------
local gframe = 0            -- completed game frames == samples taken
local nmi_entries = 0
local nmi_dropped = 0       -- NMI entries that found the guard set (lag frames)
local split_hits, split_hits_frame = 0, 0
local polls_seen, polls_forced = 0, 0
local first_input_frame = nil     -- first game frame at which we forced a button
local pad1, pad2 = 0, 0           -- latched at $80A7, see the header
local rows = {}
local ramfile
local videofile                   -- wave 10: PROBE_VIDEO, opened on first use
local video_written = 0           -- how many of VID_AT's frames were dumped
local done = false
local failed = false
local stopped = false       -- emu.stop() is ASYNCHRONOUS: without this the
                            -- endFrame handler runs once more and reports twice
local shot_pending = false

if RAM_OUT then ramfile = assert(io.open(RAM_OUT, "wb")) end

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

-- --------------------------------------------------------- the sample --------
-- Fires with the CPU about to execute $80B5, i.e. the game's frame is finished.
local function on_frame_end_instruction()
   if done then return end
   local st = emu.getState()

   local function rd(a) return emu.read(a, CPU, false) end

   local row = {
      -- identity
      frame     = gframe,
      -- the guard we are standing on. MUST be 1 here: $80B5 has not run yet, so
      -- $04 still holds the INC from $809F. If this ever reads 0 the hook is not
      -- where we think it is (a check that can fail, docs/knowledge/03).
      guard     = rd(0x04),
      -- game structure
      mode      = rd(0x00),   -- top-level state, dispatched through $83E4 at $80D1
      counter   = rd(0x02),   -- free-running frame counter, INC $02 at $80BE
      -- input, latched at $80A7 -- NOT read here; $9C is scratch by now
      pad1      = pad1,
      pad2      = pad2,
      -- the game's own decoded input, which unlike $9C survives the frame.
      -- MEASURED by holding one button at a time (ramdiff.py --ab):
      --   $07 = buttons HELD      RIGHT $01 LEFT $02 DOWN $04 UP $08 START $10
      --   $05 = buttons PRESSED this frame only (edge); START read $10 on the
      --         press frame and $00 on all nine frames it stayed held.
      pressed   = rd(0x05),
      held      = rd(0x07),
      -- THE PLAYER. Found by RAM diffing (ramdiff.py --find-player) and proved
      -- causal by poking (probe.py --pokecheck): forcing $0360 moves the Vic
      -- Viper across the screen and changes nothing else in the picture.
      -- Screen pixels, 8 bit, no sub-pixel byte. Clamps measured by holding a
      -- direction to the wall: X in [16, 220], Y in [16, 192]. Base speed steps
      -- the value by 0 or 1 per frame.
      playerX   = rd(0x360),
      playerY   = rd(0x320),
      -- Slots 1 and 2 of the same parallel arrays trail the player through the
      -- 24-entry position history at $07A0/$07C0 -- the Option/Multiple chain.
      -- Maintained from stage start even though nothing draws them yet.
      opt1X     = rd(0x361), opt1Y = rd(0x321),
      opt2X     = rd(0x362), opt2Y = rd(0x322),
      -- video state the renderer will have to match
      ppuctrl   = rd(0x10),   -- shadow written to $2000 at $829B
      scrollX   = rd(0x12),   -- written to $2005 at $8293
      scrollY   = rd(0x13),   -- written to $2005 at $8298
      scrollLo  = rd(0x3E),   -- 16-bit level scroll source, $9A79
      scrollHi  = rd(0x3F),
      chrBank   = rd(0x2D),   -- CNROM selector; bank = ($8AA8+$2D) & 3 -> {0,2,1,3}
      oamBase   = rd(0x2F),   -- flicker rotation base, += $44 per frame at $8B39
      oamBudget = rd(0x9F),   -- sprite budget, seeded $3E at $8B10
      -- hardware, straight out of the emulator
      chrOffset = st["mapper.chrMemoryOffset0"],
      sprite0Hit = st["ppu.statusFlags.sprite0Hit"] and 1 or 0,
      spriteOverflow = st["ppu.statusFlags.spriteOverflow"] and 1 or 0,
      scanline  = st["ppu.scanline"],
      cpuCycle  = st["cpu.cycleCount"],
      -- did the status-bar split run during this frame?
      splitSpins = split_hits - split_hits_frame,
      -- shadow OAM entry 0 -- the sprite-0 the split waits on
      s0y = emu.read(0, OAM, false), s0t = emu.read(1, OAM, false),
      s0a = emu.read(2, OAM, false), s0x = emu.read(3, OAM, false),
   }
   split_hits_frame = split_hits

   for _, a in ipairs(WATCH) do row["w_" .. string.format("%04X", a)] = rd(a) end

   rows[#rows + 1] = row

   if ramfile then
      local buf = {}
      for a = 0, 0x7FF do buf[#buf + 1] = string.char(emu.read(a, RAM, false)) end
      ramfile:write(table.concat(buf))
   end

   -- THE VIDEO DUMPS (wave 10). One blob per listed frame, at the same instant
   -- as the row and the RAM dump above -- see the header for the layout. They
   -- are written HERE and not from the endFrame handler because the endFrame
   -- handler runs at scanline 240 of the NEXT emulator frame, by which point
   -- $8087 has already DMA'd a new OAM and $8A51 has drained a new queue.
   if VID_OUT then
      for _, at in ipairs(VID_AT) do
         if gframe == at then
            if not videofile then videofile = assert(io.open(VID_OUT, "wb")) end
            local buf = {}
            for a = 0x2000, 0x27FF do buf[#buf + 1] = string.char(emu.read(a, PPU, false)) end
            for a = 0, 31 do buf[#buf + 1] = string.char(emu.read(a, PAL, false)) end
            for a = 0, 255 do buf[#buf + 1] = string.char(emu.read(a, OAM, false)) end
            videofile:write(table.concat(buf))
            video_written = video_written + 1
            say(("video.dumpedAtGameFrame = %d"):format(gframe))
         end
      end
   end

   -- Pokes go in AFTER the sample, so the recorded vector is what the ROM
   -- produced and the poke is visibly an intervention on the NEXT frame.
   for _, p in ipairs(POKES) do
      if gframe >= p.from and gframe <= p.to then
         emu.write(p.addr, p.val, CPU)
         pokes_applied = pokes_applied + 1
      end
   end

   gframe = gframe + 1
   if gframe >= FRAMES then done = true; shot_pending = SHOT_OUT ~= nil end
end

-- --------------------------------------------------------------- JSON --------
-- Written by hand so the byte layout is stable across runs: fixed key order,
-- integers only. The determinism check hashes this file.
local KEYS = { "frame", "guard", "mode", "counter", "pad1", "pad2",
               "pressed", "held",
               "playerX", "playerY", "opt1X", "opt1Y", "opt2X", "opt2Y",
               "ppuctrl", "scrollX", "scrollY", "scrollLo", "scrollHi",
               "chrBank", "oamBase", "oamBudget", "chrOffset",
               "sprite0Hit", "spriteOverflow", "scanline", "cpuCycle",
               "splitSpins", "s0y", "s0t", "s0a", "s0x" }

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   local wkeys = {}
   for _, a in ipairs(WATCH) do wkeys[#wkeys + 1] = "w_" .. string.format("%04X", a) end

   f:write('{\n')
   f:write('  "tool": "games/gradius/tools/oracle/probe.lua",\n')
   f:write('  "rom": "Gradius (USA).nes",\n')
   f:write(('  "samplePoint": "$%04X",\n'):format(FRAME_END))
   f:write(('  "nmiEntry": "$%04X",\n'):format(NMI_ENTRY))
   f:write(('  "inputScript": "%s",\n'):format(SCRIPT))
   f:write(('  "gameFrames": %d,\n'):format(#rows))
   f:write(('  "nmiEntries": %d,\n'):format(nmi_entries))
   f:write(('  "lagFrames": %d,\n'):format(nmi_dropped))
   f:write(('  "inputPolls": %d,\n'):format(polls_seen))
   f:write(('  "inputPollsForced": %d,\n'):format(polls_forced))
   -- JSON has no `nil`. A run that never forces a button (e.g. driving the
   -- attract-mode demo with an empty script) used to write the literal `nil`
   -- here and every consumer died in json.loads. Found by doing exactly that.
   f:write(('  "firstForcedInputFrame": %s,\n'):format(
      first_input_frame == nil and "null" or tostring(first_input_frame)))
   f:write('  "fields": [')
   local all = {}
   for _, k in ipairs(KEYS) do all[#all + 1] = '"' .. k .. '"' end
   for _, k in ipairs(wkeys) do all[#all + 1] = '"' .. k .. '"' end
   f:write(table.concat(all, ", "))
   f:write('],\n')
   f:write('  "frames": [\n')
   local chunk = {}
   for i, r in ipairs(rows) do
      local parts = {}
      for _, k in ipairs(KEYS) do
         parts[#parts + 1] = ('"%s":%d'):format(k, r[k] or 0)
      end
      for _, k in ipairs(wkeys) do
         parts[#parts + 1] = ('"%s":%d'):format(k, r[k] or 0)
      end
      chunk[#chunk + 1] = "    {" .. table.concat(parts, ",") .. "}"
                          .. (i < #rows and "," or "") .. "\n"
      if #chunk >= 256 then f:write(table.concat(chunk)); chunk = {} end
   end
   if #chunk > 0 then f:write(table.concat(chunk)) end
   f:write('  ]\n}\n')
   f:close()
end

-- ------------------------------------------------------------- callbacks -----
emu.addEventCallback(function()
   polls_seen = polls_seen + 1
   local t = INPUT[gframe + 1]
   if t and next(t) ~= nil then
      emu.setInput(t, 0)
      polls_forced = polls_forced + 1
      if first_input_frame == nil then first_input_frame = gframe end
   end
end, emu.eventType.inputPolled)

local ef = 0
emu.addEventCallback(function()
   if failed or stopped then return end
   local ok, err = pcall(function()
      ef = ef + 1
      if ef == 1 then
         -- assert the vector really is where we hooked, at runtime
         local v = emu.read(0xFFFA, CPU, false) | (emu.read(0xFFFB, CPU, false) << 8)
         if v ~= NMI_ENTRY then
            die(("NMI vector is $%04X, expected $%04X"):format(v, NMI_ENTRY))
            return
         end
         emu.addMemoryCallback(on_frame_end_instruction, emu.callbackType.exec,
                               FRAME_END, FRAME_END, emu.cpuType.nes,
                               emu.memType.nesMemory)
         -- Lag detection, exactly rather than by subtraction: at NMI entry the
         -- guard $04 is still whatever the previous NMI left. Non-zero means
         -- the previous NMI has not finished, so THIS one takes the
         -- `BNE $80B7` at $8075 and the whole frame's update is dropped.
         emu.addMemoryCallback(function()
                                  nmi_entries = nmi_entries + 1
                                  if emu.read(0x04, CPU, false) ~= 0 then
                                     nmi_dropped = nmi_dropped + 1
                                     say(("lag.dropAtGameFrame = %d"):format(gframe))
                                  end
                               end,
                               emu.callbackType.exec, NMI_ENTRY, NMI_ENTRY,
                               emu.cpuType.nes, emu.memType.nesMemory)
         emu.addMemoryCallback(function()
                                  pad1 = emu.read(0x9C, CPU, false)
                                  pad2 = emu.read(0x9D, CPU, false)
                               end,
                               emu.callbackType.exec, POST_POLL, POST_POLL,
                               emu.cpuType.nes, emu.memType.nesMemory)
         emu.addMemoryCallback(function() split_hits = split_hits + 1 end,
                               emu.callbackType.exec, SPLIT, SPLIT,
                               emu.cpuType.nes, emu.memType.nesMemory)
      end

      if shot_pending then
         local f = assert(io.open(SHOT_OUT, "wb"))
         f:write(emu.takeScreenshot())
         f:close()
         shot_pending = false
         -- Assert on the OUTPUT, not on "nothing threw" (docs/knowledge/02
         -- trap #2): a solid frame is a failure even if every field matched.
         local fb = emu.getScreenBuffer()
         local h, nonblack, distinct, dn = 2166136261, 0, {}, 0
         for i = 1, #fb do
            local px = fb[i]
            for _, c in ipairs({ (px >> 16) & 0xFF, (px >> 8) & 0xFF, px & 0xFF }) do
               h = (h ~ c); h = (h * 16777619) & 0xFFFFFFFF
            end
            if (px & 0xFFFFFF) ~= 0 then nonblack = nonblack + 1 end
            if distinct[px] == nil then distinct[px] = true; dn = dn + 1 end
         end
         say(("framebuffer.fnv1a = 0x%08X"):format(h))
         say("framebuffer.nonBlackPixels = " .. nonblack)
         say("framebuffer.distinctColors = " .. dn)
      end

      if done then
         if ramfile then ramfile:close() end
         if videofile then videofile:close() end
         -- A video dump that was ASKED FOR and never taken is a hard error, not
         -- a missing file the caller discovers later: scen.py would otherwise
         -- write an artifact with no seedVram and porttrace.mjs would refuse it
         -- with a message about a stale recording, which is the wrong diagnosis.
         if VID_OUT and video_written ~= #VID_AT then
            die(("PROBE_VIDEO_AT asked for %d frames, dumped %d "
                 .. "(%d game frames sampled)")
                :format(#VID_AT, video_written, #rows))
            return
         end
         if JSON_OUT then write_json() end
         local last = rows[#rows] or {}
         say("gameFrames = " .. #rows)
         say("emuFrames = " .. ef)
         say("nmiEntries = " .. nmi_entries)
         say("lagFrames = " .. nmi_dropped)
         say("inputPolls = " .. polls_seen)
         say("inputPollsForced = " .. polls_forced)
         say("firstForcedInputFrame = " .. tostring(first_input_frame))
         say("guardAlwaysOneAtSample = " .. tostring(last.guard == 1))
         say("finalMode = " .. tostring(last.mode))
         say("finalCounter = " .. tostring(last.counter))
         say("finalPad1 = " .. tostring(last.pad1))
         say("finalPlayerX = " .. tostring(last.playerX))
         say("finalPlayerY = " .. tostring(last.playerY))
         say("splitSpinsTotal = " .. split_hits)
         say("pokesApplied = " .. pokes_applied)
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
