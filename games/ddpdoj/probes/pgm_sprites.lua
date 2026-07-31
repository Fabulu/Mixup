-- pgm_sprites.lua -- VERIFY the inherited sprite-list claim, and find the player.
--
-- README.md and NOTES-machine.md both assert, from MAME's DRIVER SOURCE:
--   "the sprite list is the first 0xa00 bytes of main RAM (0x800000-0x8009ff),
--    hard cap 256 entries, 10 bytes each, terminated early by a zero word 4."
-- That is a claim about the HARDWARE. It is not a measurement of what DaiOuJou
-- puts there. This probe measures the game's behaviour:
--
--   * decode main RAM 0x800000+ as 10-byte entries and print the live list length
--     (index of the first entry whose word 4 is zero) every frame;
--   * cross-check our decode against the POST-DMA display list the video device
--     actually renders (:igs023:spritebuffer, 8 words stride, 5 used) -- two
--     independently derived sides, per 03-checks-that-can-fail.md;
--   * dump entries for a window of frames so the player's entry can be found by
--     which one tracks the stick.
--
-- The screen is ROT270: MAME's raw screen is 448 wide x 224 tall and is rotated
-- for display. So the sprite "X" field (11-bit) is the player's UP/DOWN axis and
-- the sprite "Y" field (10-bit) is the player's LEFT/RIGHT axis.
--
-- Env: PGM_BOOT PGM_SCRIPT PGM_FROM PGM_TO PGM_EVERY PGM_NENT PGM_FRAMES PGM_OUT

local function say(s) print("PROBE " .. s) end

M    = manager.machine
CPU  = M.devices[":maincpu"]
RAM  = M.memory.shares[":sram"]
SPB  = M.memory.shares[":igs023:spritebuffer"]

local FROM  = tonumber(os.getenv("PGM_FROM") or "") or 2200
local TO    = tonumber(os.getenv("PGM_TO") or "") or 2260
local EVERY = tonumber(os.getenv("PGM_EVERY") or "") or 4
local NENT  = tonumber(os.getenv("PGM_NENT") or "") or 12
local NFR   = tonumber(os.getenv("PGM_FRAMES") or "") or (TO + 20)
local OUT   = os.getenv("PGM_OUT")

local PORTS = { M.ioport.ports[":P1P2"], M.ioport.ports[":Service"] }
local function field(name)
  local p, n = string.match(name, "^([^/]+)/(.+)$")
  if p then local port = M.ioport.ports[":" .. p]; return port and port.fields[n] end
  for _, port in ipairs(PORTS) do
    if port and port.fields[name] then return port.fields[name] end
  end
end
local SCRIPT = {}
local function add(s)
  for seg in string.gmatch(s or "", "[^,]+") do
    local a, b, keys = string.match(seg, "^%s*(%d+)%-(%d+):(.*)$")
    if a then
      local fs = {}
      for k in string.gmatch(keys, "[^%+]+") do fs[#fs+1] = k end
      SCRIPT[#SCRIPT+1] = { tonumber(a), tonumber(b), fs }
    end
  end
end
add(os.getenv("PGM_BOOT")); add(os.getenv("PGM_SCRIPT"))
local function apply(vf)
  for _, port in ipairs(PORTS) do
    if port then for _, f in pairs(port.fields) do f:set_value(0) end end
  end
  for _, e in ipairs(SCRIPT) do
    if vf >= e[1] and vf <= e[2] then
      for _, n in ipairs(e[3]) do local f = field(n); if f then f:set_value(1) end end
    end
  end
end

-- 11-bit / 10-bit signed fields, per igs023_video.cpp's documented layout
local function sx(w) local v = w & 0x7ff; if v >= 0x400 then v = v - 0x800 end; return v end
local function sy(w) local v = w & 0x3ff; if v >= 0x200 then v = v - 0x400 end; return v end

local function entry(i)          -- from main RAM (what the GAME writes)
  local o = i * 10
  return RAM:read_u16(o), RAM:read_u16(o+2), RAM:read_u16(o+4),
         RAM:read_u16(o+6), RAM:read_u16(o+8)
end
local function bufentry(i)       -- from the post-DMA display list (what is DRAWN)
  local o = i * 16               -- dst += 8 words
  return SPB:read_u16(o), SPB:read_u16(o+2), SPB:read_u16(o+4),
         SPB:read_u16(o+6), SPB:read_u16(o+8)
end

local function livelen()
  for i = 0, 255 do
    local _, _, _, _, w4 = entry(i)
    if (w4 & 0x7fff) == 0 then return i end
  end
  return 256
end

local f = OUT and assert(io.open(OUT, "w"))
if f then f:write("vf\tidx\tw0\tw1\tw2\tw3\tw4\tsx\tsy\tpal\tpri\tmaskaddr\twidth\theight\n") end

local VF = 0
local checked = false
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)
  if VF < FROM or VF > TO then
    if VF >= NFR then if f then f:close() end; say("END"); M:exit() end
    return
  end

  if not checked then
    checked = true
    -- INDEPENDENT CROSS-CHECK: does our 10-byte decode of main RAM match the
    -- display list the hardware DMA'd?  Compare all 256 entries, all 5 words.
    local bad, n = 0, 0
    for i = 0, 255 do
      local a0,a1,a2,a3,a4 = entry(i)
      local b0,b1,b2,b3,b4 = bufentry(i)
      -- the DMA applies a hardware mask: {0xffff,0xfbff,0x7fff,0xffff,0xffff}
      if (a0 & 0xffff) ~= b0 or (a1 & 0xfbff) ~= b1 or (a2 & 0x7fff) ~= b2
         or (a3 & 0xffff) ~= b3 or (a4 & 0xffff) ~= b4 then bad = bad + 1 end
      n = n + 1
    end
    say(("dma_crosscheck vf=%d entries=%d mismatching=%d livelen=%d")
        :format(VF, n, bad, livelen()))
  end

  if (VF - FROM) % EVERY ~= 0 then
    if VF >= NFR then if f then f:close() end; say("END"); M:exit() end
    return
  end

  local ll = livelen()
  say(("vf=%d livelen=%d"):format(VF, ll))
  for i = 0, math.min(NENT, ll) - 1 do
    local w0,w1,w2,w3,w4 = entry(i)
    local X, Y = sx(w0), sy(w1)
    local pal  = (w2 >> 8) & 0x1f
    local pri  = (w2 >> 7) & 1
    local addr = ((w2 & 0x7f) << 16) | w3
    local wid  = (w4 >> 9) & 0x3f
    local hgt  = w4 & 0x1ff
    if f then f:write(("%d\t%d\t%04X\t%04X\t%04X\t%04X\t%04X\t%d\t%d\t%d\t%d\t%06X\t%d\t%d\n")
        :format(VF, i, w0,w1,w2,w3,w4, X, Y, pal, pri, addr, wid, hgt)) end
    if i < (tonumber(os.getenv("PGM_NPRINT") or "") or 8) then
      say(("  e%02d rawX=%4d rawY=%4d w=%2d h=%3d pal=%2d pri=%d addr=$%06X  [%04X %04X %04X %04X %04X]")
          :format(i, X, Y, wid, hgt, pal, pri, addr, w0,w1,w2,w3,w4))
    end
  end

  if VF >= NFR then if f then f:close() end; say("END"); M:exit() end
end)
say("sprites installed")
