-- frame.lua -- the per-frame state probe for DoDonPachi DaiOuJou (PGM, ddpdojblk).
--
-- SAMPLING POINT (measured, see docs/worklog/ddpdoj/00-recon-oracle.md):
--
--   The main loop arms a vblank semaphore at $803940 and then busy-waits on it:
--       $13C5B6  move.b #$1,$803940      <- "my frame's work is finished"
--       $13C6B4  tst.b  $803940 / bne    <- the spin  (entered by BRANCH, not
--       $13C6BC  rts                        by falling through $13C6AC)
--   The IRQ6 handler releases it:
--       $13C7E6  tst.b $803940 / beq $13C80C     <- the (A) GATE
--       $13C806  subq.b #1,$803940
--
--   So the game's own once-per-frame synchronisation point is the ARM WRITE:
--   the transition of $803940 from 0 to non-zero. We sample there. It is
--   mechanism-independent (any of the game's four wait sites arms the same
--   byte), it is exactly once per completed logic frame, and at that instant
--   the frame's updates are done and nothing of the next frame has started.
--
-- WHY A WRITE TAP AND NOT A READ TAP:
--   On the 68000 a read tap fires on the PREFETCH, so it cannot tell you that
--   an address executed -- $13C6BC is prefetched on every single spin of the
--   wait loop. Writes are never speculative. A write tap is the exact
--   execution hook on this CPU. (Measured; see tapcal.lua.)
--
-- Env:
--   PROBE_FRAMES   stop after N logic frames            (default 600)
--   PROBE_OUT      TSV output path                      (default stdout only)
--   PROBE_INPUT    button script "lf=NAMES;lf=NAMES"    (see BUTTONS)
--   PROBE_SAVE     "lf:path" -- buffer_save at that logic frame
--   PROBE_LOAD     "path"    -- buffer_load before frame 1
--   PROBE_PIXELS   1 = hash the framebuffer each logic frame (slow)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]              -- 128 KiB @ $800000
local PAL  = M.memory.shares[":palette"]
local SPB  = M.memory.shares[":igs023:spritebuffer"]
local BG   = M.memory.shares[":igs023:bg_videoram"]
local TX   = M.memory.shares[":igs023:tx_videoram"]

TAPS, SUBS = {}, {}

local RUN     = tonumber(os.getenv("PROBE_FRAMES") or "600")
local OUTPATH = os.getenv("PROBE_OUT")
local PIXELS  = os.getenv("PROBE_PIXELS") == "1"

-- ---------------------------------------------------------------- addresses
local SEM   = 0x3940        -- offset into :sram of the vblank semaphore
local IAK4  = 0xfffff8      -- 68000 autovector IAK, level 4
local IAK6  = 0xfffffc      -- level 6
local ISR6_RELEASE = 0x13c806   -- subq.b #1,$803940 inside the IRQ6 handler

-- named words worth carrying in the state vector (offsets into :sram)
local NAMED = {
  {"c390a", 0x390a}, {"c390e", 0x390e}, {"c393c", 0x393c}, {"c393e", 0x393e},
  {"c392e", 0x392e}, {"c3932", 0x3932}, {"sem",   0x3940}, {"c3942", 0x3942},
  {"p1raw", 0x3970}, {"p1edge", 0x3972}, {"p1prev", 0x3974},
  {"p2raw", 0x3976}, {"p2edge", 0x3978},
}

-- ---------------------------------------------------------------- utilities
local function fnv(h, v)
  h = (h ~ (v & 0xff)) * 16777619 & 0xffffffff
  h = (h ~ ((v >> 8) & 0xff)) * 16777619 & 0xffffffff
  h = (h ~ ((v >> 16) & 0xff)) * 16777619 & 0xffffffff
  h = (h ~ ((v >> 24) & 0xff)) * 16777619 & 0xffffffff
  return h
end
local function digest(share, off, len)
  local h = 2166136261
  for a = off, off + len - 4, 4 do h = fnv(h, share:read_u32(a)) end
  return h
end

-- the hardware's own sprite-list rule (igs023_video.cpp sprite_dma):
-- 256 entries max, 10 bytes each, terminated when word 4 & 0x7fff == 0.
local function sprite_count()
  local off = 0
  for i = 0, 255 do
    if (RAM:read_u16(off + 8) & 0x7fff) == 0 then return i end
    off = off + 10
  end
  return 256
end

-- ---------------------------------------------------------------- input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = {
  U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
  S = "1 Player Start",
}
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script = {}          -- [logicframe] = {list of field objects}
local held = {}
do
  local s = os.getenv("PROBE_INPUT")
  if s and #s > 0 then
    for item in string.gmatch(s, "[^;]+") do
      local lf, names = string.match(item, "^(%d+)=(.*)$")
      if lf then
        local fs = {}
        for c in string.gmatch(names, ".") do
          local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
          if f then fs[#fs+1] = f end
        end
        script[tonumber(lf)] = fs
      end
    end
  end
end
local function apply_input(lf)
  local fs = script[lf]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held+1] = f end
end

-- ---------------------------------------------------------------- savestate
-- PROBE_SAVE is "VIDEOFRAME:path". Deliberately a VIDEO frame, not a logic
-- frame: buffer_save() is taken from the frame notifier, at a scheduler-safe
-- boundary. Saving from inside a memory tap re-enters the emulation core
-- mid-instruction and is the prime suspect for the "restore is exact but
-- replay diverges" result recorded in NOTES-slowdown-oracle.md §8.4.
local SAVE_VF, SAVE_PATH
do
  local s = os.getenv("PROBE_SAVE")
  if s then SAVE_VF, SAVE_PATH = string.match(s, "^(%d+):(.*)$"); SAVE_VF = tonumber(SAVE_VF) end
end
local LOAD_PATH = os.getenv("PROBE_LOAD")
local loaded = false

-- ---------------------------------------------------------------- state
local lf, vf = 0, 0
local irq4, irq6, release = 0, 0, 0
local prev_t = 0
local rows = {}
local out

-- d_ram deliberately STOPS at $81FF00 and the top page gets its own column.
-- Measured: a run resumed from a savestate and a run from boot agree on every
-- live byte of RAM at the same game frame, and differ in 27 bytes of DEAD
-- STACK below SP ($81FF7D..$81FFF7) plus one byte at $80FA85. Folding the
-- dead stack into the main digest would report that as a state divergence on
-- every seeded scenario. It is reported, not hidden: see d_top.
local COLS = {"lf","vf","cyc","irq4","irq6","gated","armpc","sprites",
              "d_spr","d_ram","d_top","d_pal","d_spb","d_bg","d_tx","pix"}
for _, n in ipairs(NAMED) do COLS[#COLS+1] = n[1] end

local function emit(armpc)
  local t = M.time.attoseconds + M.time.seconds * 1000000000000000000
  local cyc = math.floor((t - prev_t) / 1e18 * 20000000 + 0.5)
  prev_t = t
  local pix = 0
  if PIXELS then
    local s = SCR:pixels()
    local h = 2166136261
    for i = 1, #s, 64 do h = (h ~ string.byte(s, i)) * 16777619 & 0xffffffff end
    pix = h
  end
  local r = {
    lf, vf, cyc, irq4, irq6, release, string.format("%06X", armpc), sprite_count(),
    digest(RAM, 0, 0xa00), digest(RAM, 0, 0x1ff00), digest(RAM, 0x1ff00, 0x100),
    digest(PAL, 0, PAL.size),
    digest(SPB, 0, SPB.size), digest(BG, 0, BG.size), digest(TX, 0, TX.size), pix,
  }
  for _, n in ipairs(NAMED) do r[#r+1] = RAM:read_u16(n[2]) end
  local line = table.concat(r, "\t")
  if out then out:write(line, "\n") else p("ROW %s", line) end
  irq4, irq6, release = 0, 0, 0
end

-- ---------------------------------------------------------------- taps
TAPS[#TAPS+1] = CPU.spaces["cpu_space"]:install_read_tap(0, 0xffffff, "iak",
  function(offset, data, mask)
    if offset == IAK4 then irq4 = irq4 + 1
    elseif offset == IAK6 then irq6 = irq6 + 1 end
    return data
  end)

TAPS[#TAPS+1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value
    if pc == ISR6_RELEASE then release = release + 1; return data end
    -- an ARM is a 0 -> non-zero transition of the semaphore byte
    -- 16-bit big-endian space: the even byte lives in the HIGH lane
    local newv
    if (mask & 0xff00) ~= 0 then newv = (data >> 8) & 0xff else newv = data & 0xff end
    if RAM:read_u8(SEM) == 0 and newv ~= 0 then
      lf = lf + 1
      vf = SCR:frame_number()
      apply_input(lf)
      local ok, e = pcall(emit, pc)
      if not ok then p("LUA_ERROR emit %s", tostring(e)) end
    end
    return data
  end)

-- ---------------------------------------------------------------- lifecycle
if OUTPATH then
  out = io.open(OUTPATH, "wb")
  out:write(table.concat(COLS, "\t"), "\n")
end
p("cols=%s", table.concat(COLS, ","))
p("refresh_hz=%.9f frame_attos=%d cycles_per_frame=%d",
  1e18 / SCR.refresh_attoseconds, SCR.refresh_attoseconds,
  math.floor(SCR.refresh_attoseconds / 1e18 * 20000000 + 0.5))

local done = false
SUBS[#SUBS+1] = emu.add_machine_frame_notifier(function()
  if LOAD_PATH and not loaded then
    loaded = true
    local fh = io.open(LOAD_PATH, "rb")
    if fh then
      local buf = fh:read("a"); fh:close()
      M:buffer_load(buf)
      p("LOADED bytes=%d at vf=%d", #buf, SCR:frame_number())
    else
      p("LOAD_FAILED %s", LOAD_PATH)
    end
  end
  if SAVE_VF and SCR:frame_number() == SAVE_VF then
    local buf = M:buffer_save()
    local fh, oerr = io.open(SAVE_PATH, "wb")
    if not fh then
      p("SAVE_OPEN_FAILED path=[%s] err=%s", SAVE_PATH, tostring(oerr))
    else
      fh:write(buf); fh:close()
      p("SAVED vf=%d lf=%d bytes=%d path=%s", SCR:frame_number(), lf, #buf, SAVE_PATH)
    end
  end
  if lf >= RUN and not done then
    done = true
    if out then out:close() end
    p("DONE logicframes=%d videoframes=%d", lf, SCR:frame_number())
    M:exit()
  end
end)
