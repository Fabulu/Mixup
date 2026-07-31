-- pgm_track.lua -- given ONE known per-frame quantity, find everything in RAM
-- that moves with it.
--
-- We measured that $808EB4/$808EB6 is a (spriteX<<16 | spriteY) longword written
-- once per frame by PC $13F648, and that poking it is overwritten on the next
-- frame -- i.e. it is DERIVED. This probe finds what it is derived from.
--
-- Reference series: (read_u16(REF) & REFMASK) each frame.
-- Filter, scale-free so it works whatever the fixed-point format is:
--    for every consecutive pair of sampled frames,
--        sign(delta of candidate) == sign(delta of reference)
--    with at least PGM_MINMOVE non-zero steps and no contradiction.
-- A word that is the reference in different units, or the sub-pixel accumulator
-- that feeds it, passes. A frame counter does not (its delta is never zero while
-- the reference's is), and neither does an unrelated object.
--
-- Env: PGM_BOOT PGM_SCRIPT PGM_REF(hex 68k) PGM_REFMASK(hex) PGM_FROM PGM_TO
--      PGM_STEP PGM_WIDTH(16|32) PGM_MINMOVE PGM_MINZERO PGM_FRAMES PGM_OUT

local function say(s) print("PROBE " .. s) end

M   = manager.machine
CPU = M.devices[":maincpu"]
RAM = M.memory.shares[":sram"]

local REF     = tonumber(os.getenv("PGM_REF") or "808EB6", 16)
local REFMASK = tonumber(os.getenv("PGM_REFMASK") or "3FF", 16)
local FROM    = tonumber(os.getenv("PGM_FROM") or "") or 2100
local TO      = tonumber(os.getenv("PGM_TO") or "") or 2260
local STEP    = tonumber(os.getenv("PGM_STEP") or "") or 1
local WIDTH   = tonumber(os.getenv("PGM_WIDTH") or "") or 16
local MINMOVE = tonumber(os.getenv("PGM_MINMOVE") or "") or 12
local MINZERO = tonumber(os.getenv("PGM_MINZERO") or "") or 4
local NFR     = tonumber(os.getenv("PGM_FRAMES") or "") or (TO + 10)
local OUT     = os.getenv("PGM_OUT")

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

-- element readers: WIDTH=32 is read at every EVEN offset (step 2), not every 4,
-- because a 16.16 value may sit on a word boundary that is not longword aligned.
local N, RD, ELEM
if WIDTH == 32 then
  N = RAM.size // 2 - 1
  RD = function(i) return (RAM:read_u16(i * 2) << 16) | RAM:read_u16(i * 2 + 2) end
  ELEM = 2
else
  N = RAM.size // 2
  RD = function(i) return RAM:read_u16(i * 2) end
  ELEM = 2
end

local refser, samples, svf = {}, {}, {}
local VF = 0
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)
  if VF >= FROM and VF <= TO and (VF - FROM) % STEP == 0 then
    refser[#refser+1] = RAM:read_u16(REF - 0x800000) & REFMASK
    local t = {}
    for i = 0, N - 1 do t[i] = RD(i) end
    samples[#samples+1] = t
    svf[#svf+1] = VF
  end
  if VF < NFR then return end

  local NS = #samples
  say(("reference $%06X&%X series over %d samples: %s")
      :format(REF, REFMASK, NS, table.concat(refser, ",")))
  -- reference deltas
  local rd = {}
  local nmove, nzero = 0, 0
  for s = 2, NS do
    local d = refser[s] - refser[s-1]
    rd[s] = (d > 0) and 1 or ((d < 0) and -1 or 0)
    if rd[s] ~= 0 then nmove = nmove + 1 else nzero = nzero + 1 end
  end
  say(("reference steps: moving=%d still=%d"):format(nmove, nzero))
  if nmove < MINMOVE or nzero < MINZERO then
    say("ERROR reference does not both move and stand still enough -- widen the window")
    say("END"); M:exit(); return
  end

  local f = OUT and assert(io.open(OUT, "w"))
  if f then f:write("off\twidth\tseries\n") end
  local hits = 0
  for i = 0, N - 1 do
    local ok = true
    for s = 2, NS do
      local d = samples[s][i] - samples[s-1][i]
      local sg = (d > 0) and 1 or ((d < 0) and -1 or 0)
      if sg ~= rd[s] then ok = false; break end
    end
    if ok then
      hits = hits + 1
      local off = i * ELEM
      local ser = {}
      for s = 1, math.min(NS, 24) do ser[#ser+1] = samples[s][i] end
      if f then f:write(("%06X\t%d\t%s\n"):format(off, WIDTH, table.concat(ser, ","))) end
      if hits <= 40 then
        say(("TRACK off=$%06X w=%d first=%d last=%d series=%s")
            :format(0x800000 + off, WIDTH, samples[1][i], samples[NS][i],
                    table.concat(ser, ",")))
      end
    end
  end
  if f then f:close() end
  say(("width=%d exact_sign_matches=%d"):format(WIDTH, hits))
  say("END")
  M:exit()
end)
say("track installed")
