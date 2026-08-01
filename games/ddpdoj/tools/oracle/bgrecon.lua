-- bgrecon.lua -- WAVE 10 recon: THE PLAYFIELD.  Who writes the tilemaps, what
-- drives rowscroll, what the scroll registers hold, and whether bg_scale ever
-- moves in play.
--
-- Everything here is a WRITE tap (the only reliable 68000 execution hook --
-- CURPC does not identify an opcode fetch, and a read tap fires on prefetch:
-- docs/worklog/ddpdoj/00-recon-hard.md 3) or a sample-point READ of RAM.
-- Tap handles and notifier subscriptions live in GLOBALS or they are GC'd and
-- silently stop firing.
--
-- THE MAP, from the listing (`xref.py dasm 23C622/23C638/23C668`, the game's
-- own VRAM clear routines, and $2593AE/$2593C0/$2593D2, its RAM test):
--   $900000..$903FFF   BG videoram   (clear = $1000 longwords)
--   $904000..$905FFF   TX videoram   (clear = $800 longwords)
--   $907000..$9073FF   rowscroll     (clear = $100 longwords)
--   $B02000 bg_yscroll  $B03000 bg_xscroll  $B04000 bg_scale
--   $B05000 tx_yscroll  $B06000 tx_xscroll  $B0E000 ctrl
-- The share sizes are PRINTED at startup so the map is measured, not assumed.
--
-- ENV: BGR_FRAMES, BGR_INPUT, BGR_REQUIRE_BUILD, BGR_TSV (per-frame rows)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]
local BG   = M.memory.shares[":igs023:bg_videoram"]
local TX   = M.memory.shares[":igs023:tx_videoram"]
local ROWS = M.memory.shares[":igs023:rowscrollram"]

TAPS, SUBS = {}, {}

local RUN  = tonumber(os.getenv("BGR_FRAMES") or "2600")
local WANT = os.getenv("BGR_REQUIRE_BUILD")
local TSV  = os.getenv("BGR_TSV")
local fh   = TSV and io.open(TSV, "w") or nil

p("SHARES bg_videoram=%d tx_videoram=%d rowscrollram=%d sram=%d",
  BG.size, TX.size, ROWS.size, RAM.size)

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("BGR_INPUT") or ""):gmatch("[^;]+") do
  local lfn, names = item:match("^(%d+)=(.*)$")
  if lfn then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(lfn)] = fs
  end
end
local function apply_input(n)
  local fs = script[n]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

local lf, done, lastbuild = 0, false, -1
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- ------------------------------------------------------- (1) VRAM WRITE TAPS
-- census: which PC writes which region, and how many writes per logic frame.
local wr_bg, wr_tx, wr_rs = {}, {}, {}         -- pc -> count
local pf_bg, pf_tx, pf_rs = 0, 0, 0            -- this frame
local h_bg, h_tx, h_rs = {}, {}, {}            -- per-frame histograms
local max_bg, max_tx, max_rs = 0, 0, 0
-- which BG map WORD offsets get touched (mod the 64-entry row stride), to see
-- whether the writes are a column, a row, or scattered.
local bg_cols = {}

TAPS[#TAPS + 1] = PROG:install_write_tap(0x900000, 0x903FFF, "wbg", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  bump(wr_bg, string.format("%06X", pc))
  pf_bg = pf_bg + 1
  -- entry index = (offset-0x900000)/4 ; row = idx>>6 ; col = idx & 63
  local idx = ((offset - 0x900000) >> 2)
  bump(bg_cols, string.format("c%02d", idx & 63))
  return data
end)

TAPS[#TAPS + 1] = PROG:install_write_tap(0x904000, 0x905FFF, "wtx", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  bump(wr_tx, string.format("%06X", pc))
  pf_tx = pf_tx + 1
  return data
end)

TAPS[#TAPS + 1] = PROG:install_write_tap(0x907000, 0x907FFF, "wrs", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  bump(wr_rs, string.format("%06X", pc))
  pf_rs = pf_rs + 1
  return data
end)

-- ------------------------------------------------- (2) VIDEO REGISTER WRITES
local reg_pcs, reg_vals = {}, {}
local function regtap(addr, name)
  TAPS[#TAPS + 1] = PROG:install_write_tap(addr, addr + 1, "r" .. name, function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    bump(reg_pcs, string.format("%s@%06X", name, pc))
    if name == "scale" or name == "ctrl" then
      bump(reg_vals, string.format("%s=%04X", name, data & 0xffff))
    end
    return data
  end)
end
regtap(0xb02000, "bgy"); regtap(0xb03000, "bgx"); regtap(0xb04000, "scale")
regtap(0xb05000, "txy"); regtap(0xb06000, "txx"); regtap(0xb0e000, "ctrl")

-- ------------------------------------------------------- (3) THE SAMPLE POINT
local REL = { [0x13C806] = true, [0x23C46C] = true }
local rs_shapes, scale_seen, ctrl_seen = {}, {}, {}
local spd_seen, sub_seen = {}, {}

local function rowscroll_shape()
  -- the 224 raster lines the renderer actually reads (igs023.js: rs[y], y<224)
  local first, distinct, nz, mn, mx = ROWS:read_u16(0), 0, 0, 0xffff, 0
  local seen = {}
  for y = 0, 223 do
    local v = ROWS:read_u16(y * 2)
    if not seen[v] then seen[v] = true; distinct = distinct + 1 end
    if v ~= 0 then nz = nz + 1 end
    if v < mn then mn = v end
    if v > mx then mx = v end
  end
  return first, distinct, nz, mn, mx
end

TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then return data end
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
    lf = lf + 1
    lastbuild = (pc >> 20) & 0xf
    apply_input(lf)

    bump(h_bg, pf_bg); if pf_bg > max_bg then max_bg = pf_bg end
    bump(h_tx, pf_tx); if pf_tx > max_tx then max_tx = pf_tx end
    bump(h_rs, pf_rs); if pf_rs > max_rs then max_rs = pf_rs end

    local scale = PROG:read_u16(0xb04000)
    local ctrl  = PROG:read_u16(0xb0e000)
    bump(scale_seen, string.format("%04X", scale))
    bump(ctrl_seen, string.format("%04X", ctrl))

    local f, d, nz, mn, mx = rowscroll_shape()
    bump(rs_shapes, string.format("d%d/nz%d/mn%04X/mx%04X", d, nz, mn, mx))

    -- the camera block $80B010 (BG) / $80B032 (TX) and the scroll script's RAM
    local b012 = RAM:read_u32(0xb012)   -- BG x accumulator (1/64 px)
    local b016 = RAM:read_u32(0xb016)   -- BG y accumulator
    local b034 = RAM:read_u32(0xb034)   -- TX x accumulator
    local b038 = RAM:read_u32(0xb038)
    local b054 = RAM:read_u16(0xb054)   -- shake offset x
    local b056 = RAM:read_u16(0xb056)
    local d176 = RAM:read_u16(0x13176)  -- the per-frame scroll delta objects use
    local d16e = RAM:read_u16(0x1316e)  -- cross-axis delta
    local d0ce = RAM:read_u16(0x130ce)  -- the column/block counter
    local d096 = RAM:read_u16(0x13096)  -- stage index * 4
    local d18a = RAM:read_u16(0x1318a)  -- tilemap ring write cursor
    local d18c = RAM:read_u16(0x1318c)
    local d186 = RAM:read_u16(0x13186)  -- shake id
    local d0d2 = RAM:read_u16(0x130d2)  -- scroll-frozen flag
    bump(spd_seen, string.format("%04X", d176))
    bump(sub_seen, string.format("%04X", d16e))

    if fh then
      fh:write(string.format(
        "%d\t%d\t%04X\t%04X\t%d\t%d\t%d\t%08X\t%08X\t%08X\t%08X\t%04X\t%04X\t" ..
        "%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%d\t%d\t%04X\t%04X\n",
        lf, SCR:frame_number(), scale, ctrl, pf_bg, pf_tx, pf_rs,
        b012, b016, b034, b038, b054, b056,
        d176, d16e, d0ce, d096, d18a, d18c, d186, d0d2,
        d, nz, PROG:read_u16(0xb03000), PROG:read_u16(0xb02000)))
    end
    pf_bg, pf_tx, pf_rs = 0, 0, 0
  end
  return data
end)

local function hist(t, n)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return t[a] > t[b] end)
  local out = {}
  for i = 1, math.min(n or 40, #ks) do
    out[#out + 1] = string.format("%s:%d", ks[i], t[ks[i]])
  end
  return table.concat(out, " "), #ks
end

local function finish()
  local s, n
  s, n = hist(wr_bg, 24); p("CENSUS bgvram writer PCs (%d) %s", n, s)
  s, n = hist(wr_tx, 24); p("CENSUS txvram writer PCs (%d) %s", n, s)
  s, n = hist(wr_rs, 24); p("CENSUS rowscroll writer PCs (%d) %s", n, s)
  s, n = hist(reg_pcs, 30); p("CENSUS videoreg writer PCs (%d) %s", n, s)
  s, n = hist(reg_vals, 20); p("CENSUS videoreg values written (%d) %s", n, s)
  s = hist(h_bg, 14); p("CENSUS bg writes/logic frame max=%d %s", max_bg, s)
  s = hist(h_tx, 14); p("CENSUS tx writes/logic frame max=%d %s", max_tx, s)
  s = hist(h_rs, 14); p("CENSUS rowscroll writes/logic frame max=%d %s", max_rs, s)
  s, n = hist(bg_cols, 8); p("CENSUS bg write column index mod 64 (%d distinct) %s", n, s)
  s, n = hist(scale_seen, 8); p("CENSUS bg_scale at sample point (%d) %s", n, s)
  s, n = hist(ctrl_seen, 8); p("CENSUS ctrl at sample point (%d) %s", n, s)
  s, n = hist(rs_shapes, 10); p("CENSUS rowscroll[0..223] shape (%d) %s", n, s)
  s, n = hist(spd_seen, 14); p("CENSUS $813176 scroll delta (%d) %s", n, s)
  s, n = hist(sub_seen, 14); p("CENSUS $81316E cross delta (%d) %s", n, s)

  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  if fh then fh:close() end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
