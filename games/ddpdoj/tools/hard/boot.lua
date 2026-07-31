-- boot.lua -- first contact with the real ddpdojblk board image.
--
-- RECON 5: establishes the handles every slowdown/rank probe needs, and answers
-- one question outright: DOES THE GAME READ THE RASTER-POSITION REGISTER
-- (0xb07000)? games/ddpdoj/NOTES-machine.md flags that register as the hardware
-- route by which the game's own logic could observe how long a frame took --
-- question 4 of docs/knowledge/06-lag-and-slowdown.md, "the single most
-- important question in the folder".
--
-- It also builds the game-agnostic frame instrument of NOTES-mame-oracle.md
-- section 3c: a read tap on the 68000 autovector entries (IRQ4 = vector 28 =
-- $70, IRQ6 = vector 30 = $78) fires exactly once per dispatched interrupt with
-- no knowledge of the game's code.
--
-- And the piece that is new here: at each IRQ6 dispatch it reads the INTERRUPTED
-- PC back off the supervisor stack (68000 group-2 frame: SP+0 = SR word,
-- SP+2 = PC long). The histogram of interrupted PCs is a game-agnostic answer to
-- "where was the main loop when vblank arrived" -- a vblank-wait spin loop
-- dominates it on frames the game finished early, and vanishes on frames it did
-- not. That is the overrun detector, and it needs no disassembly to build.
--
-- Env: HARD_SECONDS (frames to run), HARD_TOPN.

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local cpu  = mach.devices[":maincpu"]
local prog = cpu.spaces["program"]
local scr  = mach.screens[":screen"]

local FRAMES = tonumber(os.getenv("HARD_FRAMES") or "") or 1200
local TOPN   = tonumber(os.getenv("HARD_TOPN") or "") or 25

local VEC_IRQ4 = 0x70   -- autovector level 4 = vector 28
local VEC_IRQ6 = 0x78   -- autovector level 6 = vector 30
local RASTER   = 0xb07000

local frames = 0
local reported = false

-- ---------------------------------------------------------------- inventory
local function inventory()
  out("mame=" .. emu.app_version() .. " romname=" .. emu.romname())
  out(string.format("screen %dx%d refresh_as=%d refresh_hz=%.10f",
      scr.width, scr.height, scr.refresh_attoseconds, 1e18 / scr.refresh_attoseconds))
  local devs = {}
  for tag, d in pairs(mach.devices) do devs[#devs+1] = tag end
  table.sort(devs)
  out("devices=" .. table.concat(devs, ","))
  local sh = {}
  for tag, s in pairs(mach.memory.shares) do
    sh[#sh+1] = string.format("%s:%d", tag, s.size)
  end
  table.sort(sh)
  out("shares=" .. table.concat(sh, " "))
  local rg = {}
  for tag, r in pairs(mach.memory.regions) do
    rg[#rg+1] = string.format("%s:%d", tag, r.size)
  end
  table.sort(rg)
  out("regions=" .. table.concat(rg, " "))
  local st = {}
  for name, _ in pairs(cpu.state) do st[#st+1] = name end
  table.sort(st)
  out("cpu_state_names=" .. table.concat(st, ","))
  local sp = {}
  for name, _ in pairs(cpu.spaces) do sp[#sp+1] = name end
  table.sort(sp)
  out("cpu_spaces=" .. table.concat(sp, ","))
  out(string.format("vector_irq4@%02X=%08X vector_irq6@%02X=%08X",
      VEC_IRQ4, prog:read_u32(VEC_IRQ4), VEC_IRQ6, prog:read_u32(VEC_IRQ6)))
end

-- ------------------------------------------------------------------- taps
local irq4_hits, irq6_hits = 0, 0
local irq6_per_frame = {}          -- count -> frames
local irq4_per_frame = {}
local f_irq4, f_irq6 = 0, 0

local stacked = {}                 -- interrupted PC -> count
local stacked_first = {}           -- interrupted PC -> first irq6 ordinal
local sp_bad = 0

local raster_reads, raster_sites = 0, {}
local raster_first_frame = nil

local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- Vector fetch tap. A 68000 vector fetch is a LONG read, delivered as two word
-- reads at $78 and $7A, so hits are counted on the low word only.
_tap_vec = prog:install_read_tap(0x70, 0x7B, "vectors", function (offset, data)
  if offset == VEC_IRQ4 then
    irq4_hits = irq4_hits + 1; f_irq4 = f_irq4 + 1
  elseif offset == VEC_IRQ6 then
    irq6_hits = irq6_hits + 1; f_irq6 = f_irq6 + 1
    -- interrupted PC off the supervisor stack
    local sp = cpu.state["SP"].value
    if sp >= 0x800000 and sp < 0x820000 then
      local pc = prog:read_u32(sp + 2) & 0xFFFFFF
      bump(stacked, pc)
      if not stacked_first[pc] then stacked_first[pc] = irq6_hits end
    else
      sp_bad = sp_bad + 1
    end
  end
end)

-- THE question: does the program read the beam position?
_tap_raster = prog:install_read_tap(RASTER, RASTER + 1, "raster", function (offset, data)
  raster_reads = raster_reads + 1
  if not raster_first_frame then raster_first_frame = frames end
  local pc = cpu.state["CURPC"].value & 0xFFFFFF
  bump(raster_sites, pc)
end)

-- ------------------------------------------------------------------ report
local function topn(t, n)
  local keys = {}
  for k in pairs(t) do keys[#keys+1] = k end
  table.sort(keys, function(a, b)
    if t[a] ~= t[b] then return t[a] > t[b] end
    return a < b
  end)
  local o = {}
  for i = 1, math.min(n, #keys) do o[#o+1] = keys[i] end
  return o, #keys
end

local function report()
  if reported then return end
  reported = true
  out("--- inventory ---")
  inventory()
  out("--- interrupts ---")
  out(string.format("video_frames=%d irq4_vector_fetches=%d irq6_vector_fetches=%d",
      frames, irq4_hits, irq6_hits))
  local ks = {}
  for k in pairs(irq6_per_frame) do ks[#ks+1] = k end
  table.sort(ks)
  for _, k in ipairs(ks) do
    out(string.format("irq6_per_video_frame %d -> %d frames", k, irq6_per_frame[k]))
  end
  ks = {}
  for k in pairs(irq4_per_frame) do ks[#ks+1] = k end
  table.sort(ks)
  for _, k in ipairs(ks) do
    out(string.format("irq4_per_video_frame %d -> %d frames", k, irq4_per_frame[k]))
  end
  out("sp_outside_mainram_at_irq6=" .. sp_bad)
  out("--- interrupted PC at IRQ6 (the main loop's position when vblank hit) ---")
  local list, total = topn(stacked, TOPN)
  out("distinct_interrupted_pcs=" .. total)
  for _, pc in ipairs(list) do
    out(string.format("interrupted_pc=%06X n=%d first_irq6=%d", pc, stacked[pc], stacked_first[pc]))
  end
  out("--- raster register 0xb07000 ---")
  out("raster_reads=" .. raster_reads .. " first_seen_video_frame=" .. tostring(raster_first_frame))
  local rl, rt = topn(raster_sites, TOPN)
  out("distinct_raster_read_sites=" .. rt)
  for _, pc in ipairs(rl) do
    out(string.format("raster_read_site pc=%06X n=%d", pc, raster_sites[pc]))
  end
  out("END")
  mach:exit()
end

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1
  bump(irq6_per_frame, f_irq6); f_irq6 = 0
  bump(irq4_per_frame, f_irq4); f_irq4 = 0
  if frames >= FRAMES then report() end
end)
