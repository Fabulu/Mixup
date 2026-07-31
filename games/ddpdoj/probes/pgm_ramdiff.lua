-- pgm_ramdiff.lua -- WHERE IS THE SHIP?
--
-- The Gradius shape (games/gradius/tools/oracle/PROBE.md §4): do not read a
-- disassembly, make the game move and see which words move with it. Three
-- snapshots of all 128 KiB of main RAM:
--
--    S0  after an idle stretch
--    S1  after holding RIGHT
--    S2  after holding LEFT (back past the start)
--
-- A player X candidate is a word that went one way for S0->S1 and the other way
-- for S1->S2. Same probe does Y with UP/DOWN by swapping PGM_AXIS.
--
-- It ALSO reports, for every candidate, whether it lives inside the sprite list
-- (offset < 0xa00) -- because the sprite list is a DISPLAY LIST rebuilt every
-- frame from somewhere else, so a hit there is a consequence, not the variable.
--
-- Env:
--   PGM_BOOT     input script to reach gameplay: "FROM-TO:FIELD+FIELD,..."
--   PGM_T0       video frame of snapshot S0 (idle)
--   PGM_AXIS     "X" -> Left/Right, "Y" -> Up/Down
--   PGM_HOLD     how many frames to hold each direction (default 60)
--   PGM_GAP      idle frames between phases (default 30)
--   PGM_FRAMES   total video frames
--   PGM_OUT      absolute path for the TSV report
--   PGM_SHOTDIR  if set, snapshots are taken at each phase boundary

local function say(s) print("PROBE " .. s) end

M   = manager.machine
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]
SCR = M.screens:at(1)
RAM = M.memory.shares[":sram"]

local RAMBYTES = RAM.size            -- 131072
local NW       = RAMBYTES // 2       -- 65536 words

local T0    = tonumber(os.getenv("PGM_T0") or "") or 1900
local HOLD  = tonumber(os.getenv("PGM_HOLD") or "") or 60
local GAP   = tonumber(os.getenv("PGM_GAP") or "") or 30
local AXIS  = (os.getenv("PGM_AXIS") or "X"):upper()
local NFR   = tonumber(os.getenv("PGM_FRAMES") or "") or (T0 + 400)
local OUT   = os.getenv("PGM_OUT")

local POS, NEG
if AXIS == "X" then POS, NEG = "P1 Right", "P1 Left"
else                POS, NEG = "P1 Down",  "P1 Up" end

-- phase boundaries, in video frames
local S0F = T0
local P1A, P1B = T0 + GAP, T0 + GAP + HOLD          -- hold POS
local S1F = P1B + 2
local P2A, P2B = S1F + GAP, S1F + GAP + 2 * HOLD    -- hold NEG, twice as long
local S2F = P2B + 2

-- ---------------------------------------------------------------- input -----
local PORTS = { M.ioport.ports[":P1P2"], M.ioport.ports[":Service"] }
local function field(name)
  local p, n = string.match(name, "^([^/]+)/(.+)$")
  if p then local port = M.ioport.ports[":" .. p]; return port and port.fields[n] end
  for _, port in ipairs(PORTS) do
    if port and port.fields[name] then return port.fields[name] end
  end
  return nil
end

local SCRIPT = {}
local function add_script(s)
  for seg in string.gmatch(s or "", "[^,]+") do
    local a, b, keys = string.match(seg, "^%s*(%d+)%-(%d+):(.*)$")
    if a then
      local fs = {}
      for k in string.gmatch(keys, "[^%+]+") do fs[#fs+1] = k end
      SCRIPT[#SCRIPT+1] = { tonumber(a), tonumber(b), fs }
    end
  end
end
add_script(os.getenv("PGM_BOOT"))
SCRIPT[#SCRIPT+1] = { P1A, P1B, { POS } }
SCRIPT[#SCRIPT+1] = { P2A, P2B, { NEG } }

local function apply(vf)
  for _, port in ipairs(PORTS) do
    if port then for _, f in pairs(port.fields) do f:set_value(0) end end
  end
  for _, e in ipairs(SCRIPT) do
    if vf >= e[1] and vf <= e[2] then
      for _, n in ipairs(e[3]) do
        local f = field(n)
        if f then f:set_value(1) else say("BADFIELD " .. n) end
      end
    end
  end
end

-- ------------------------------------------------------------- snapshots ----
local function snap()
  local t = {}
  for i = 0, NW - 1 do t[i] = RAM:read_u16(i * 2) end
  return t
end

local S = {}
local SHOTDIR = os.getenv("PGM_SHOTDIR")

-- sanity: the share and the CPU program space must agree about the same address
local function share_vs_space()
  local a = RAM:read_u16(0x1000)
  local b = PRG:read_u16(0x801000)
  say(("consistency share[0x1000]=%04X space[0x801000]=%04X same=%s")
      :format(a, b, tostring(a == b)))
end

local function s16(v) if v >= 0x8000 then return v - 0x10000 end return v end

local VF = 0
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)
  if VF == 1 then share_vs_space() end
  if VF == S0F then S[0] = snap(); say("S0 taken vf=" .. VF)
    if SHOTDIR then SCR:snapshot("s0.png") end end
  if VF == S1F then S[1] = snap(); say("S1 taken vf=" .. VF)
    if SHOTDIR then SCR:snapshot("s1.png") end end
  if VF == S2F then S[2] = snap(); say("S2 taken vf=" .. VF)
    if SHOTDIR then SCR:snapshot("s2.png") end end

  if VF >= NFR then
    if S[0] and S[1] and S[2] then
      local f = OUT and assert(io.open(OUT, "w"))
      if f then f:write("off\ts0\ts1\ts2\td01\td12\tin_spritelist\n") end
      local n, nsprite = 0, 0
      local changed01 = 0
      for i = 0, NW - 1 do
        local a, b, c = S[0][i], S[1][i], S[2][i]
        if a ~= b then changed01 = changed01 + 1 end
        local d01, d12 = s16(b) - s16(a), s16(c) - s16(b)
        -- moved one way then back the other, by a non-trivial amount
        if d01 > 0 and d12 < 0 and math.abs(d01) >= 4 and math.abs(d12) >= 4 then
          n = n + 1
          local off = i * 2
          local insl = (off < 0xa00) and 1 or 0
          if insl == 1 then nsprite = nsprite + 1 end
          if f then f:write(("%06X\t%d\t%d\t%d\t%d\t%d\t%d\n")
                            :format(off, s16(a), s16(b), s16(c), d01, d12, insl)) end
          if n <= 60 then
            say(("cand off=$%06X s0=%d s1=%d s2=%d d01=%+d d12=%+d sl=%d")
                :format(off, s16(a), s16(b), s16(c), d01, d12, insl))
          end
        end
      end
      if f then f:close() end
      say(("axis=%s words_changed_S0S1=%d candidates=%d of_which_in_spritelist=%d")
          :format(AXIS, changed01, n, nsprite))
    else
      say("ERROR: not all snapshots taken (NFR too small?)")
    end
    say("END")
    M:exit()
  end
end)
say(("ramdiff installed axis=%s S0=%d POS=%d..%d S1=%d NEG=%d..%d S2=%d nfr=%d")
    :format(AXIS, S0F, P1A, P1B, S1F, P2A, P2B, S2F, NFR))
