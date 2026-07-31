-- ramsnap.lua -- full 128 KiB main-RAM snapshots at chosen video frames.
--
-- Feeds the RANK hunt. docs/knowledge/08 says rank is "a parameter the corpus
-- will silently never vary" and that finding it starts with knowing which bytes
-- move slowly while the game is played. Two runs that differ only in the input
-- script, snapshotted at the same frame numbers, give a candidate set by
-- difference; a single run snapshotted repeatedly gives the monotone ones.
--
-- ROM-DERIVED OUTPUT (it is the cartridge's RAM). HARD_SNAPDIR must be
-- gitignored.
--
-- Env: HARD_SNAPDIR, HARD_SNAPAT="600,1200,1800", HARD_TAGNAME,
--      HARD_COIN, HARD_START, HARD_PLAY, HARD_SHOT=0|1

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local ram  = mach.memory.shares[":sram"]
local scr  = mach.screens[":screen"]

local DIR   = os.getenv("HARD_SNAPDIR") or "."
local NAME  = os.getenv("HARD_TAGNAME") or "run"
local COIN  = tonumber(os.getenv("HARD_COIN") or "") or 0
local START = tonumber(os.getenv("HARD_START") or "") or 0
local PLAY  = tonumber(os.getenv("HARD_PLAY") or "") or 0
local SHOT  = (os.getenv("HARD_SHOT") or "1") == "1"

local at = {}
for tok in (os.getenv("HARD_SNAPAT") or "1200"):gmatch("[^,]+") do
  at[tonumber(tok)] = true
end

local ports = mach.ioport.ports
local function fld(t, n) local p = ports[t]; return p and p.fields[n] or nil end
local held, playing = {}, false
local function tapb(t, n, k)
  local f = fld(t, n)
  if not f then out("input MISSING " .. t .. "/" .. n) return end
  f:set_value(1); held[#held + 1] = { f = f, u = k }
end

local frames = 0
local last = 0
for k in pairs(at) do if k > last then last = k end end

local function snap(n)
  local path = string.format("%s/%s_f%06d.ram", DIR, NAME, n)
  local f = assert(io.open(path, "wb"))
  local chunk = {}
  for a = 0, ram.size - 1 do
    chunk[#chunk + 1] = string.char(ram:read_u8(a))
    if #chunk == 65536 then f:write(table.concat(chunk)); chunk = {} end
  end
  if #chunk > 0 then f:write(table.concat(chunk)) end
  f:close()
  out(string.format("snap frame=%d -> %s", n, path))
end

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1
  for i = #held, 1, -1 do
    if frames >= held[i].u then held[i].f:set_value(0); table.remove(held, i) end
  end
  if COIN > 0 and frames == COIN then tapb(":Service", "Coin 1", frames + 8) end
  if START > 0 and frames == START then tapb(":P1P2", "1 Player Start", frames + 8) end
  if PLAY > 0 and frames == PLAY then playing = true end
  if playing then
    local shot = fld(":P1P2", "P1 Button 1")
    if shot then shot:set_value(SHOT and 1 or 0) end
    local phase = (frames // 45) % 4
    local m = { fld(":P1P2", "P1 Up"), fld(":P1P2", "P1 Left"),
                fld(":P1P2", "P1 Down"), fld(":P1P2", "P1 Right") }
    for i = 1, 4 do if m[i] then m[i]:set_value(phase == (i - 1) and 1 or 0) end end
  end
  if at[frames] then snap(frames) end
  if frames >= last then out("END"); mach:exit() end
end)
