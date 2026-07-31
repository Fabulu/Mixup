-- Dump one video frame's worth of IGS023 state + the framebuffer, so an
-- offline decoder can be checked against MAME's own rendering.
--
-- Everything it writes is ROM-DERIVED. DUMPDIR must be under a gitignored path.
--
-- env: DDP_DUMPDIR   where to write
--      DDP_FRAMES    comma-separated video-frame numbers to dump
--      DDP_KEYS      optional "frame:PORTFIELD,..." to hold a button on a frame

local T = "PROBE "
local function p(s) print(T .. s) end

local M = manager.machine
local DUMPDIR = os.getenv("DDP_DUMPDIR") or "."
local WANT = {}
for f in string.gmatch(os.getenv("DDP_FRAMES") or "600", "[^,]+") do
  WANT[tonumber(f)] = true
end

local vf = 0
local held = {}   -- port field objects to force on, set from DDP_KEYS

-- parse DDP_KEYS  "300:P1 Start,900:Coin 1"
local KEYS = {}
for spec in string.gmatch(os.getenv("DDP_KEYS") or "", "[^,]+") do
  local fr, nm = string.match(spec, "^(%d+):(.+)$")
  if fr then KEYS[#KEYS+1] = { frame = tonumber(fr), name = nm } end
end

local function find_field(name)
  for ptag, port in pairs(M.ioport.ports) do
    for fname, field in pairs(port.fields) do
      if fname == name then return field, ptag end
    end
  end
  return nil
end

local function wr(name, bytes)
  local f = assert(io.open(DUMPDIR .. "/" .. name, "wb"))
  f:write(bytes); f:close()
  return #bytes
end

-- read a share as raw big-endian u16 bytes (shares expose :read_u16 by index)
local function share_bytes(tag)
  local sh = M.memory.shares[tag]
  if not sh then return nil end
  local n = sh.size // 2
  local t = {}
  for i = 0, n - 1 do
    local v = sh:read_u16(i * 2)
    t[#t+1] = string.char((v >> 8) & 0xff, v & 0xff)
  end
  return table.concat(t)
end

local function space_bytes(sp, lo, hi)
  local t = {}
  for a = lo, hi, 2 do
    local v = sp:read_u16(a)
    t[#t+1] = string.char((v >> 8) & 0xff, v & 0xff)
  end
  return table.concat(t)
end

-- KEEP THE HANDLE IN A GLOBAL. Discarding it lets Lua collect the subscription
-- and the callback silently stops firing -- measured here: with the handle
-- dropped, frame 60 dumped and frame 120 never did, with no error of any kind.
_G.DDP_NOTIFIER = emu.add_machine_frame_notifier(function()
  vf = vf + 1

  for _, k in ipairs(KEYS) do
    local HOLD = tonumber(os.getenv("DDP_HOLD") or "8")
    if vf >= k.frame and vf < k.frame + HOLD then
      local fld = find_field(k.name)
      if fld then fld:set_value(1); held[#held+1] = fld end
    elseif vf == k.frame + HOLD then
      local fld = find_field(k.name)
      if fld then fld:set_value(0) end
    end
  end

  if not WANT[vf] then return end

  local ok, err = pcall(function()
    local pre = string.format("%s/f%06d.", DUMPDIR, vf)
    local sp = M.devices[":maincpu"].spaces["program"]

    local n = 0
    n = n + wr(string.format("f%06d.palette.bin", vf),      share_bytes(":palette"))
    n = n + wr(string.format("f%06d.spritebuffer.bin", vf), share_bytes(":igs023:spritebuffer"))
    n = n + wr(string.format("f%06d.bg_videoram.bin", vf),  share_bytes(":igs023:bg_videoram"))
    n = n + wr(string.format("f%06d.tx_videoram.bin", vf),  share_bytes(":igs023:tx_videoram"))
    n = n + wr(string.format("f%06d.rowscroll.bin", vf),    share_bytes(":igs023:rowscrollram"))
    n = n + wr(string.format("f%06d.zoomram.bin", vf),      share_bytes(":igs023:zoomram"))
    -- the game's own copy of the sprite list: first 0xa00 bytes of main RAM
    n = n + wr(string.format("f%06d.spriteram.bin", vf),    space_bytes(sp, 0x800000, 0x8009ff))

    -- video registers, read back through the 68k map
    local regs = {
      bg_yscroll = sp:read_u16(0xb02000), bg_xscroll = sp:read_u16(0xb03000),
      bg_scale   = sp:read_u16(0xb04000),
      tx_yscroll = sp:read_u16(0xb05000), tx_xscroll = sp:read_u16(0xb06000),
      ctrl       = sp:read_u16(0xb0e000),
    }
    local rl = {}
    for k, v in pairs(regs) do rl[#rl+1] = string.format("%s=%04x", k, v) end
    table.sort(rl)
    wr(string.format("f%06d.regs.txt", vf), table.concat(rl, "\n") .. "\n")

    local scr = M.screens[":screen"]
    local px = scr:pixels()
    wr(string.format("f%06d.pixels.bin", vf), px)
    scr:snapshot(string.format("f%06d.png", vf))

    p(string.format("dumped vf=%d bytes=%d px=%d scrw=%d scrh=%d %s",
      vf, n, #px, scr.width, scr.height, table.concat(rl, " ")))
  end)
  if not ok then p("ERR " .. tostring(err)) end
end)
