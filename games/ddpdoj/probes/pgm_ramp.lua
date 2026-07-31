-- pgm_ramp.lua -- find the player coordinate by RAMP, and reject frame counters.
--
-- History of this file, because the trap is instructive:
--   v1 sampled only while the ship swept and asked for a monotone series. In all
--      128 KiB of main RAM exactly ONE word survived -- and it stepped by +1
--      every frame, i.e. it was a FRAME COUNTER, which is monotone no matter
--      what the player does. A filter that cannot tell a coordinate from a clock
--      is a check that cannot fail (docs/knowledge/03-checks-that-can-fail.md).
--
-- v2 samples THREE phases and requires the word to behave differently in each:
--
--   PIN    hold NEG long enough to jam the ship against the wall.
--          A coordinate is then CONSTANT. A counter is not.
--   SWEEP  hold POS. A coordinate is MONOTONE (either sign -- we do not assume
--          which way the axis points).
--   REST   release everything. A coordinate is CONSTANT again. A counter is not.
--
-- Env: PGM_BOOT PGM_T0 PGM_AXIS PGM_PIN PGM_HOLD PGM_REST PGM_STEP PGM_FRAMES
--      PGM_OUT PGM_WIDTH(8|16|32) PGM_MAXREPORT

local function say(s) print("PROBE " .. s) end

M   = manager.machine
CPU = M.devices[":maincpu"]
RAM = M.memory.shares[":sram"]

local T0    = tonumber(os.getenv("PGM_T0") or "") or 1850
local PIN   = tonumber(os.getenv("PGM_PIN") or "") or 120
local HOLD  = tonumber(os.getenv("PGM_HOLD") or "") or 64
local REST  = tonumber(os.getenv("PGM_REST") or "") or 32
local STEP  = tonumber(os.getenv("PGM_STEP") or "") or 8
local AXIS  = (os.getenv("PGM_AXIS") or "X"):upper()
local WIDTH = tonumber(os.getenv("PGM_WIDTH") or "") or 16
local OUT   = os.getenv("PGM_OUT")
local MAXR  = tonumber(os.getenv("PGM_MAXREPORT") or "") or 80

local POS, NEG
if AXIS == "X" then POS, NEG = "P1 Right", "P1 Left"
else                POS, NEG = "P1 Down",  "P1 Up" end

local PINA,   PINB   = T0, T0 + PIN
local SWEEPA, SWEEPB = PINB + 2, PINB + 2 + HOLD
local RESTA,  RESTB  = SWEEPB + 2, SWEEPB + 2 + REST
local NFR = tonumber(os.getenv("PGM_FRAMES") or "") or (RESTB + 10)

-- sample windows: last third of PIN, all of SWEEP, all of REST
local PINSAMP = PINB - math.floor(PIN / 3)

-- ---------------------------------------------------------------- input -----
local PORTS = { M.ioport.ports[":P1P2"], M.ioport.ports[":Service"] }
local function field(name)
  local p, n = string.match(name, "^([^/]+)/(.+)$")
  if p then local port = M.ioport.ports[":" .. p]; return port and port.fields[n] end
  for _, port in ipairs(PORTS) do
    if port and port.fields[name] then return port.fields[name] end
  end
end
local SCRIPT = {}
for seg in string.gmatch(os.getenv("PGM_BOOT") or "", "[^,]+") do
  local a, b, keys = string.match(seg, "^%s*(%d+)%-(%d+):(.*)$")
  if a then
    local fs = {}
    for k in string.gmatch(keys, "[^%+]+") do fs[#fs+1] = k end
    SCRIPT[#SCRIPT+1] = { tonumber(a), tonumber(b), fs }
  end
end
SCRIPT[#SCRIPT+1] = { PINA,   PINB,   { NEG } }
SCRIPT[#SCRIPT+1] = { SWEEPA, SWEEPB, { POS } }

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

-- ------------------------------------------------------------- sampling -----
local N, RD, ELEM
if WIDTH == 8 then      N = RAM.size;      RD = function(i) return RAM:read_u8(i) end;        ELEM = 1
elseif WIDTH == 32 then N = RAM.size // 4; RD = function(i) return RAM:read_u32(i * 4) end;   ELEM = 4
else                    N = RAM.size // 2; RD = function(i) return RAM:read_u16(i * 2) end;   ELEM = 2 end

local P, S, R = {}, {}, {}    -- sample arrays per phase
local PVF, SVF, RVF = {}, {}, {}

local function take(into, vfs, vf)
  local t = {}
  for i = 0, N - 1 do t[i] = RD(i) end
  into[#into + 1] = t
  vfs[#vfs + 1] = vf
end

local VF = 0
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)

  if VF >= PINSAMP and VF <= PINB   and (VF - PINSAMP) % STEP == 0 then take(P, PVF, VF) end
  if VF >= SWEEPA  and VF <= SWEEPB and (VF - SWEEPA)  % STEP == 0 then take(S, SVF, VF) end
  if VF >= RESTA   and VF <= RESTB  and (VF - RESTA)   % STEP == 0 then take(R, RVF, VF) end

  if VF < NFR then return end

  say(("phases pin=%d sweep=%d rest=%d width=%d elems=%d")
      :format(#P, #S, #R, WIDTH, N))
  say(("pinVF=%s sweepVF=%s restVF=%s")
      :format(table.concat(PVF, ","), table.concat(SVF, ","), table.concat(RVF, ",")))
  if #P < 2 or #S < 4 or #R < 2 then say("ERROR too few samples"); say("END"); M:exit(); return end

  local function const(arr, i)
    local v = arr[1][i]
    for s = 2, #arr do if arr[s][i] ~= v then return false end end
    return true
  end

  local f = OUT and assert(io.open(OUT, "w"))
  if f then f:write("off\tdir\tpinval\tsweep\trestval\n") end
  local nfound = 0
  for i = 0, N - 1 do
    if const(P, i) and const(R, i) and P[1][i] ~= R[1][i] then
      local ups, downs, nd = 0, 0, {}
      local prev = S[1][i]
      nd[prev] = true
      for s = 2, #S do
        local v = S[s][i]
        if v > prev then ups = ups + 1 elseif v < prev then downs = downs + 1 end
        nd[v] = true; prev = v
      end
      local ndist = 0
      for _ in pairs(nd) do ndist = ndist + 1 end
      local mono = (downs == 0 and ups >= 3) or (ups == 0 and downs >= 3)
      if mono and ndist >= 4 then
        nfound = nfound + 1
        local off = i * ELEM
        local ser = {}
        for s = 1, #S do ser[#ser + 1] = S[s][i] end
        local dir = (ups > 0) and "+" or "-"
        if f then f:write(("%06X\t%s\t%d\t%s\t%d\n")
                          :format(off, dir, P[1][i], table.concat(ser, ","), R[1][i])) end
        if nfound <= MAXR then
          say(("HIT off=$%06X dir=%s pin=%d rest=%d sweep=%s")
              :format(off, dir, P[1][i], R[1][i], table.concat(ser, ",")))
        end
      end
    end
  end
  if f then f:close() end
  say(("axis=%s hits=%d"):format(AXIS, nfound))
  say("END")
  M:exit()
end)
say(("ramp v2 installed axis=%s pin=%d..%d(sample from %d) sweep=%d..%d rest=%d..%d step=%d nfr=%d width=%d")
    :format(AXIS, PINA, PINB, PINSAMP, SWEEPA, SWEEPB, RESTA, RESTB, STEP, NFR, WIDTH))
