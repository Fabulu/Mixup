-- terrain.lua -- the Gradius stage-1 TERRAIN STREAMER probe.
--
-- Sits on the same harness as probe.lua (Mesen 2.1.1 headless, --testRunner) and
-- answers the questions the port needs before a single line of level code is
-- written: where the camera lives, who writes the nametable, from what data,
-- and whether terrain collision comes from the same bytes as the picture.
--
-- Everything below is a MEASUREMENT of the running cartridge. The static
-- reading that suggested each hook is quoted next to it so the two can be
-- compared; where they disagreed, the measurement wins (docs/knowledge/01).
--
-- Environment (--testRunner cannot pass argv):
--   TER_FRAMES   game frames to sample
--   TER_SCRIPT   input script, same grammar as probe.lua
--   TER_JSON     absolute path for the output JSON
--   TER_VRAMFROM first game frame from which to log PPU port writes (0 = all)
--   TER_MAPAT    comma list of game frames at which to dump $0500-$06FF
--   TER_NEUTER   optional experiment switch, see "negative controls" below
--
-- ---------------------------------------------------------------- hooks -----
--
-- $80B5  the frame sample point. probe.lua proves this is where the game's own
--        frame is finished ($04 still 1). Reused verbatim; the guard is
--        asserted here too, so a slipped hook is loud rather than plausible.
--
-- $9D8E  the terrain streamer entry. Statically: called once per frame from
--        $9ACE (JSR $9D83, which gates on $3A == 0 and the VRAM-queue cursor
--        $0E < 4), and four times in a row from $9C24 during the stage load.
--        We record the pre-state: $54/$55 (the 16-bit build cursor),
--        $58 (progress inside the current 128 px half-page) and the camera.
--
-- $9E94  the point where the block has been fully resolved and the first
--        queue packet is about to be written:
--          $AE  block id, after layout[] lookup
--          $A0/$A1 layout array pointer      $A2/$A3 pattern pointer table
--          $A4/$A5 this block's tile stream  $A6/$A7 attribute table
--          $AA/$AB nametable address         $AC/$AD attribute address
--        This is the whole address computation, captured in one place.
--
-- $9F4D  after the four tile packets are in the queue; $AF points at the first
--        packet header and $0E is the new queue cursor.
--
-- $9F7D  STA ($A8,X) -- the ONE instruction that writes the collision map.
--        We record the destination and the byte, which is what turns "the map
--        is at $0500/$0600" from a reading of $9D6D into a fact.
--
-- $2000/$2005/$2006/$2007 writes are logged with the writing PC, so "who
-- writes the nametable" is answered by the census rather than by the listing.
--
-- ----------------------------------------------------- negative controls ----
--
-- TER_NEUTER makes a check go red on purpose (docs/knowledge/03: a check you
-- have never seen fail is not evidence):
--   scroll   force $3D to 0 every frame at $80B5 -> the camera stops advancing
--            and the predicted-camera check must fail
--   collide  force the collision byte to 0 as it is stored at $9F7D -> the
--            recomputed-from-tiles check must fail
--   blockid  poke $AE at $9E94 -> the block-id and attribute checks must fail
--   addr     poke $AA at $9E94 -> the nametable-address check must fail
--   tiles    poke $A4 at $9E94 -> the tile-byte check must fail
--   nolag    force $12 = $3E   -> the one-frame scroll lag check must fail
--   solid    fill $0500-$06FF with $FF -> the ship must DIE, which is what
--            proves $C3D3 reads this map rather than merely correlating

local function say(s) print("PROBE " .. s) end

local FRAMES    = tonumber(os.getenv("TER_FRAMES") or "") or 700
local SCRIPT    = os.getenv("TER_SCRIPT") or ""
local JSON_OUT  = os.getenv("TER_JSON")
local VRAMFROM  = tonumber(os.getenv("TER_VRAMFROM") or "") or 0
local MAPAT_S   = os.getenv("TER_MAPAT") or ""
local NEUTER    = os.getenv("TER_NEUTER") or ""
-- The window over which a --neuter poke is applied. Blocks are NOT emitted
-- every frame: measured on the default boot script, $9D8E ran on frames
-- 287-369 (four per frame during the stage load, then one every other frame)
-- and then not again until 571, because $9D96's distance test stops the
-- streamer once the build cursor is 384 px ahead of the camera. A window with
-- no block in it makes the control vacuously green -- which is exactly the
-- failure mode docs/knowledge/03 warns about, and it happened here first.
local HURT_FROM = tonumber(os.getenv("TER_HURTFROM") or "") or 575
local HURT_TO   = tonumber(os.getenv("TER_HURTTO") or "") or 595

local CPU = emu.memType.nesDebug
local RAM = emu.memType.nesInternalRam

local FRAME_END  = 0x80B5   -- probe.lua's sample point
local STREAM_IN  = 0x9D8E   -- terrain streamer, one 32x32 block per call
local BLOCK_RES  = 0x9E94   -- block resolved, addresses computed
local TILES_DONE = 0x9F4D   -- four tile packets queued
local COLL_STORE = 0x9F7D   -- LDA $99 / STA ($A8,X): the collision map write
local NMI_ENTRY  = 0x806A
-- $C3FC  LDA ($A0),Y -- the only READ of the collision map. $C3D3 builds the
-- pointer from a screen-space X/Y pair:
--   $A0 = ((X + 8 + $3E) & $F8) + ((Y + $14) >> 5)     tile column * 8 + band
--   $A1 = ($3F + carry) & 1 + 5                        page $05 or $06
-- and then masks the byte with $C40F,Y = $03/$0C/$30/$C0 for ((Y+$14)>>3)&3.
-- We census the high byte so "the reader reads THIS map" is measured.
local COLL_READ  = 0xC3FC
-- $98EE is the ONLY thing that advances the camera at the base rate:
--   98EE  A9 80  LDA #$80 / CLC / ADC $3D / STA $3D   sub-pixel accumulator
--   98F5  A9 00  LDA #$00 / ROL A                     carry out
--   98F8  A2 3E  LDX #$3E / JMP $8402                 16-bit add into $3E/$3F
-- Rather than re-deriving the five zero-page gates at $9A88-$9A9E that decide
-- whether it runs, we COUNT the calls per frame and check the camera against
-- that.  $9857 is the other adder: st_984F ($1B = 14/15) does LDA #$04 /
-- JSR $8402 on $3E, a 4 px/frame state.
local SCROLL_ADD = 0x98EE
local SCROLL_F4  = 0x9857

local MAPAT = {}
for a in string.gmatch(MAPAT_S, "[^,]+") do MAPAT[tonumber(a)] = true end

-- ---------------------------------------------------------------- input -----
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

-- ---------------------------------------------------------------- state -----
local gframe, ef = 0, 0
local done, failed, stopped = false, false, false
local nmi_entries, nmi_dropped = 0, 0
local frames, blocks, colls, vram, maps = {}, {}, {}, {}, {}
local guard_bad = 0
local ppuwrites = {}         -- census: [pc] = count, per port
local camwrites = {}         -- census: [pc] = count, for $3D/$3E/$3F
local stream_calls = 0
local scroll_calls, scroll4_calls = 0, 0
-- Writes to the camera this frame from a PC that is NOT one of the two adders.
-- The camera is not only incremented: a stage restart runs $8307, which does
-- STA $00,X over $12-$EF and wipes it. Counting the foreign writes is how the
-- per-frame increment equation stays an equation instead of quietly gaining an
-- "except when it does not" clause.
local cam_foreign = 0
-- Mesen reports the PC AFTER the storing instruction, so these are the
-- addresses of the FOLLOWING opcode: $98F5 = STA $3D inside $98EE, and
-- $8407 / $840B = STA $00,X / INC $01,X inside the 16-bit adder $8402.
local ADDER_PC = { [0x98F5] = true, [0x8407] = true, [0x840B] = true }
local collreads = {}   -- census: [high byte of $A0/$A1] = count
local solid_pokes = 0

local function rd(a) return emu.read(a, CPU, false) end

local function die(msg)
   failed = true
   say("ERROR = " .. tostring(msg))
   say("END")
   emu.stop(3)
end

-- --------------------------------------------------------- the callbacks ----
local function on_frame_end()
   if done then return end
   if rd(0x04) ~= 1 then guard_bad = guard_bad + 1 end
   -- $9A79 latched $12 from $3E BEFORE $9AA0 called $98EE, so $12 is one frame
   -- behind the camera. Forcing them equal here (before the record, and before
   -- $8281 pushes $12 to $2005 at the top of the next NMI) is the control for
   -- that claim: it must turn the "$12 lags $3E" check red.
   if NEUTER == "nolag" then emu.write(0x12, rd(0x3E), CPU) end
   frames[#frames + 1] = {
      frame = gframe,
      mode  = rd(0x00),  stage = rd(0x19),  sub = rd(0x1B),
      -- the camera. $9A79 does LDA $3E / STA $12 and folds bit0 of $3F into
      -- the PPUCTRL nametable select, so $3E/$3F is a 16-bit world X in pixels
      -- and $3D is its sub-pixel fraction ($98EE adds #$80 to it per frame).
      subpx = rd(0x3D), camLo = rd(0x3E), camHi = rd(0x3F),
      scrollX = rd(0x12), scrollY = rd(0x13), ppuctrl = rd(0x10),
      -- the streamer's build cursor and its progress inside the half-page
      buildLo = rd(0x54), buildHi = rd(0x55), prog = rd(0x58), caught = rd(0x57),
      queue = rd(0x0E),  chrBank = rd(0x2D),
      playerX = rd(0x360), playerY = rd(0x320),
      -- how many times the camera was advanced during THIS frame, counted at
      -- the two adders rather than inferred from the gate conditions
      scrollAdds = scroll_calls, scroll4Adds = scroll4_calls,
      camForeign = cam_foreign,
   }
   scroll_calls, scroll4_calls, cam_foreign = 0, 0, 0
   if MAPAT[gframe] then
      local buf = {}
      for a = 0x500, 0x6FF do buf[#buf + 1] = emu.read(a, RAM, false) end
      maps[#maps + 1] = { frame = gframe, bytes = buf }
   end
   if NEUTER == "scroll" then emu.write(0x3D, 0, CPU) end
   -- "solid": fill the whole collision map with $FF over the window. If $C3D3
   -- really is what decides the ship has hit terrain, the ship must die --
   -- which is an intervention on the map, not an observation of it.
   if NEUTER == "solid" and gframe >= HURT_FROM and gframe <= HURT_TO then
      for a = 0x500, 0x6FF do emu.write(a, 0xFF, CPU) end
      solid_pokes = solid_pokes + 1
   end
   gframe = gframe + 1
   if gframe >= FRAMES then done = true end
end

local function on_stream_in()
   stream_calls = stream_calls + 1
end

local function on_block_res()
   if done then return end
   -- Negative controls, applied BEFORE the record is taken so the recorded
   -- state is the damaged one -- otherwise the check would compare a clean
   -- reading against a clean prediction and stay green while the picture rots.
   -- ...and only over a WINDOW. Corrupting every block kills the game rather
   -- than the check: blanking the background under sprite 0 means the hit at
   -- $9AA3 never fires and the NMI spins forever (measured: the watchdog
   -- tripped at 314 samples). A 30-frame window makes the check red while the
   -- cartridge keeps running, which is the point.
   local hurt = gframe >= HURT_FROM and gframe <= HURT_TO
   if hurt and NEUTER == "blockid" then emu.write(0xAE, 0, CPU) end
   if hurt and NEUTER == "addr"    then emu.write(0xAA, (rd(0xAA) + 1) % 256, CPU) end
   if hurt and NEUTER == "tiles"   then emu.write(0xA4, (rd(0xA4) + 4) % 256, CPU) end
   blocks[#blocks + 1] = {
      frame = gframe, i = #blocks,
      buildLo = rd(0x54), buildHi = rd(0x55), prog = rd(0x58),
      camLo = rd(0x3E), camHi = rd(0x3F),
      blockId = rd(0xAE),
      layout = rd(0xA0) | (rd(0xA1) << 8),
      patTbl = rd(0xA2) | (rd(0xA3) << 8),
      tiles  = rd(0xA4) | (rd(0xA5) << 8),
      attTbl = rd(0xA6) | (rd(0xA7) << 8),
      ntAddr = rd(0xAA) | (rd(0xAB) << 8),
      atAddr = rd(0xAC) | (rd(0xAD) << 8),
      queue  = rd(0x0E),
   }
end

local function on_coll_store()
   if done then return end
   local dst = rd(0xA8) | (rd(0xA9) << 8)
   colls[#colls + 1] = { frame = gframe, addr = dst, val = rd(0x99),
                         block = #blocks - 1 }
   if NEUTER == "collide" then emu.write(0x99, 0, CPU) end
end

-- PPU port writes, with the PC that did them.
local function port_hook(port)
   return function(addr, value)
      local pc = emu.getState()["cpu.pc"]
      local key = string.format("%04X@%04X", port, pc)
      ppuwrites[key] = (ppuwrites[key] or 0) + 1
      if gframe >= VRAMFROM and #vram < 400000 then
         vram[#vram + 1] = { gframe, port, value, pc }
      end
   end
end

-- ---------------------------------------------------------------- JSON ------
local function w(f, s) f:write(s) end

local function write_json()
   local f = assert(io.open(JSON_OUT, "wb"))
   w(f, '{\n')
   w(f, '  "tool": "games/gradius/tools/oracle/terrain.lua",\n')
   w(f, ('  "inputScript": "%s",\n'):format(SCRIPT))
   w(f, ('  "neuter": "%s",\n'):format(NEUTER))
   w(f, ('  "gameFrames": %d,\n'):format(#frames))
   w(f, ('  "nmiEntries": %d,\n'):format(nmi_entries))
   w(f, ('  "lagFrames": %d,\n'):format(nmi_dropped))
   w(f, ('  "guardViolations": %d,\n'):format(guard_bad))
   w(f, ('  "streamerCalls": %d,\n'):format(stream_calls))

   w(f, '  "ppuWriteCensus": {')
   local keys = {}
   for k in pairs(ppuwrites) do keys[#keys + 1] = k end
   table.sort(keys)
   for i, k in ipairs(keys) do
      w(f, ('%s"%s":%d'):format(i > 1 and "," or "", k, ppuwrites[k]))
   end
   w(f, '},\n')

   -- Which memory page $C3D3's collision lookup actually reads.
   w(f, '  "collReadCensus": {')
   local rk = {}
   for k in pairs(collreads) do rk[#rk + 1] = k end
   table.sort(rk)
   for i, k in ipairs(rk) do
      w(f, ('%s"%02X":%d'):format(i > 1 and "," or "", k, collreads[k]))
   end
   w(f, '},\n')
   w(f, ('  "solidPokes": %d,\n'):format(solid_pokes))

   -- Who touches $3D/$3E/$3F at all. Answers "is the camera only ever
   -- incremented?" with a census instead of a reading of the listing.
   w(f, '  "camWriteCensus": {')
   local ck = {}
   for k in pairs(camwrites) do ck[#ck + 1] = k end
   table.sort(ck)
   for i, k in ipairs(ck) do
      w(f, ('%s"%04X":%d'):format(i > 1 and "," or "", k, camwrites[k]))
   end
   w(f, '},\n')

   local FK = { "frame", "mode", "stage", "sub", "subpx", "camLo", "camHi",
                "scrollX", "scrollY", "ppuctrl", "buildLo", "buildHi", "prog",
                "caught", "queue", "chrBank", "playerX", "playerY",
                "scrollAdds", "scroll4Adds", "camForeign" }
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

   local BK = { "frame", "i", "buildLo", "buildHi", "prog", "camLo", "camHi",
                "blockId", "layout", "patTbl", "tiles", "attTbl",
                "ntAddr", "atAddr", "queue" }
   w(f, '  "blockFields": ["' .. table.concat(BK, '","') .. '"],\n')
   w(f, '  "blocks": [\n')
   ch = {}
   for i, r in ipairs(blocks) do
      local p = {}
      for _, k in ipairs(BK) do p[#p + 1] = tostring(r[k] or 0) end
      ch[#ch + 1] = "    [" .. table.concat(p, ",") .. "]" ..
                    (i < #blocks and "," or "") .. "\n"
      if #ch >= 256 then w(f, table.concat(ch)); ch = {} end
   end
   w(f, table.concat(ch))
   w(f, '  ],\n')

   w(f, '  "collFields": ["frame","addr","val","block"],\n')
   w(f, '  "colls": [\n')
   ch = {}
   for i, r in ipairs(colls) do
      ch[#ch + 1] = ("    [%d,%d,%d,%d]%s\n"):format(
         r.frame, r.addr, r.val, r.block, i < #colls and "," or "")
      if #ch >= 256 then w(f, table.concat(ch)); ch = {} end
   end
   w(f, table.concat(ch))
   w(f, '  ],\n')

   w(f, '  "vramFields": ["frame","port","value","pc"],\n')
   w(f, '  "vram": [\n')
   ch = {}
   for i, r in ipairs(vram) do
      ch[#ch + 1] = ("    [%d,%d,%d,%d]%s\n"):format(r[1], r[2], r[3], r[4],
                                                     i < #vram and "," or "")
      if #ch >= 512 then w(f, table.concat(ch)); ch = {} end
   end
   w(f, table.concat(ch))
   w(f, '  ],\n')

   w(f, '  "maps": [\n')
   for i, m in ipairs(maps) do
      w(f, ('    {"frame":%d,"base":1280,"bytes":[%s]}%s\n'):format(
         m.frame, table.concat(m.bytes, ","), i < #maps and "," or ""))
   end
   w(f, '  ]\n}\n')
   f:close()
end

-- ------------------------------------------------------------- callbacks ----
emu.addEventCallback(function()
   local t = INPUT[gframe + 1]
   if t and next(t) ~= nil then emu.setInput(t, 0) end
end, emu.eventType.inputPolled)

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
         exec(on_frame_end,  FRAME_END)
         exec(function() scroll_calls = scroll_calls + 1 end, SCROLL_ADD)
         exec(function() scroll4_calls = scroll4_calls + 1 end, SCROLL_F4)
         exec(on_stream_in,  STREAM_IN)
         exec(on_block_res,  BLOCK_RES)
         exec(on_coll_store, COLL_STORE)
         exec(function()
                 local hi = rd(0xA1)
                 collreads[hi] = (collreads[hi] or 0) + 1
              end, COLL_READ)
         exec(function()
                 nmi_entries = nmi_entries + 1
                 if rd(0x04) ~= 0 then nmi_dropped = nmi_dropped + 1 end
              end, NMI_ENTRY)
         emu.addMemoryCallback(function(_addr, _value)
                                  local pc = emu.getState()["cpu.pc"]
                                  camwrites[pc] = (camwrites[pc] or 0) + 1
                                  if not ADDER_PC[pc] then
                                     cam_foreign = cam_foreign + 1
                                  end
                               end, emu.callbackType.write, 0x3D, 0x3F,
                               emu.cpuType.nes, emu.memType.nesMemory)
         for _, port in ipairs({ 0x2000, 0x2005, 0x2006, 0x2007 }) do
            emu.addMemoryCallback(port_hook(port), emu.callbackType.write,
                                  port, port, emu.cpuType.nes,
                                  emu.memType.nesMemory)
         end
      end
      if done then
         write_json()
         say("gameFrames = " .. #frames)
         say("lagFrames = " .. nmi_dropped)
         say("guardViolations = " .. guard_bad)
         say("streamerCalls = " .. stream_calls)
         say("blocks = " .. #blocks)
         say("collStores = " .. #colls)
         say("vramWrites = " .. #vram)
         say("END")
         stopped = true
         emu.stop(0)
      end
      if ef > FRAMES * 3 + 600 then
         die("watchdog: " .. ef .. " emulator frames, " .. #frames .. " samples")
      end
   end)
   if not ok then die(err) end
end, emu.eventType.endFrame)
