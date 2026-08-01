-- w10zoom.lua -- RECON 10.1, the ZOOM TABLE question (TODO-zoom-table-quirk.md).
--
-- MAME's igs023_video.cpp carries, verbatim (fetched 2026-08-01 from
-- raw.githubusercontent.com/mamedev/mame/master/src/mame/igs/igs023_video.cpp):
--
--   // some games (e.g. ddp3) have zero in last zoom table entry but expect 1
--   // is the last entry hard-coded to 1, or does zero have the same effect as 1?
--   m_sprite_ptr_pre->xzoom = (xzom < 0x10) ? (xzom == 0xf) ? 1 :
--       ((u32(m_zoomram[xzom*2]) << 16) | m_zoomram[xzom*2+1]) : 0;
--
-- MAME does not claim to know which it is.  Two things ARE measurable from
-- here without a die shot:
--   (1) what THIS game actually puts in the zoom table, entry by entry, and
--       whether entry $F really is zero;
--   (2) whether this game ever emits a record whose EFFECTIVE index is $F --
--       because if it never does, the substitution is inert and the port is
--       carrying an unknown that cannot bite it; if it does, the port must
--       match MAME and the difference from real silicon is unknowable here.
--
-- effective index = zom              when grow == 0
--                 = 0x10 - zom       when grow == 1   (so grow=1,zom=0 -> $10
--                                    = NO ZOOM, and grow=1,zom=1 -> $F)
--
-- The list is read from MAIN RAM ($800000..$8009FF, 10 bytes/entry) at the
-- sample point, i.e. after main-loop call #4 has rebuilt it.  `word4 & $7fff
-- == 0` terminates.  The DMA masks word1 with $FBFF and word2 with $7FFF on
-- the way into :igs023:spritebuffer; neither touches the zoom fields.
--
-- ENV: W10_FRAMES, W10_INPUT, W10_REQUIRE_BUILD
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]
local ZOOM = M.memory.shares[":igs023:zoomram"]

TAPS, SUBS = {}, {}
local RUN  = tonumber(os.getenv("W10_FRAMES") or "2600")
local WANT = os.getenv("W10_REQUIRE_BUILD")

local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("W10_INPUT") or ""):gmatch("[^;]+") do
  local lf, names = item:match("^(%d+)=(.*)$")
  if lf then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(lf)] = fs
  end
end
local function apply_input(lf)
  local fs = script[lf]; if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

local lf, done, lastbuild = 0, false, -1
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

local ztab, xeff, yeff, rawx, rawy = {}, {}, {}, {}, {}
local entries, listmax = 0, 0

local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then return data end
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
    lf = lf + 1
    lastbuild = (pc >> 20) & 0xf
    apply_input(lf)
    -- the zoom table, as 16 longwords
    local t = {}
    for i = 0, 15 do
      t[#t + 1] = string.format("%04X%04X", ZOOM:read_u16(i * 4), ZOOM:read_u16(i * 4 + 2))
    end
    bump(ztab, table.concat(t, " "))
    -- the display list
    local n = 0
    for i = 0, 255 do
      local b = i * 10
      local w0 = RAM:read_u16(b)
      local w1 = RAM:read_u16(b + 2)
      local w4 = RAM:read_u16(b + 8)
      if (w4 & 0x7fff) == 0 then break end
      n = n + 1
      local xg, xz = (w0 >> 15) & 1, (w0 >> 11) & 0xf
      local yg, yz = (w1 >> 15) & 1, (w1 >> 11) & 0xf
      bump(rawx, string.format("g%d_z%X", xg, xz))
      bump(rawy, string.format("g%d_z%X", yg, yz))
      bump(xeff, string.format("%02X", (xg == 1) and (0x10 - xz) or xz))
      bump(yeff, string.format("%02X", (yg == 1) and (0x10 - yz) or yz))
    end
    entries = entries + n
    if n > listmax then listmax = n end
  end
  return data
end)

local function hist(t, n)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks)
  local out = {}
  for i = 1, math.min(n or 40, #ks) do out[#out + 1] = string.format("%s:%d", ks[i], t[ks[i]]) end
  return table.concat(out, " "), #ks
end

local function finish()
  local s, n = hist(ztab, 6)
  p("ZOOMRAM %d distinct table contents over %d logic frames", n, lf)
  local ks = {}
  for k in pairs(ztab) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return ztab[a] > ztab[b] end)
  for i = 1, math.min(4, #ks) do
    p("ZOOMRAM [%d frames] %s", ztab[ks[i]], ks[i])
  end
  s, n = hist(rawx, 40); p("RAW xgrow_xzom %d distinct: %s", n, s)
  s, n = hist(rawy, 40); p("RAW ygrow_yzom %d distinct: %s", n, s)
  s, n = hist(xeff, 40); p("EFF x index %d distinct: %s", n, s)
  s, n = hist(yeff, 40); p("EFF y index %d distinct: %s", n, s)
  p("LIST entries_total=%d max_len=%d", entries, listmax)
  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if entries == 0 then p("FAIL the display list was empty on every frame"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT); fails = fails + 1
    end
  end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
