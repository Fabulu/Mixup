-- pgm_writers.lua -- WHO WRITES THIS? and WHAT HAPPENS IF I CHANGE IT?
--
-- The DaiOuJou equivalent of games/gradius/tools/oracle/playerhook.lua. Two jobs
-- in one script because they answer each other's questions:
--
--   ATTRIBUTION  install_write_tap over one or more 68k address ranges and
--                bucket every write by CURPC. MAME then tells us which routine
--                owns each byte of RAM, without a disassembly.
--                (NOTES-slowdown-oracle.md §6 did exactly this on Gradius.)
--
--   INTERVENTION poke a value in every frame of a window. If a candidate is the
--                real variable the ship stops moving / teleports; if it is a
--                per-frame copy the poke is overwritten and nothing happens.
--                PROBE.md §4 on Gradius: measurement proves which of the two.
--
-- On the 68000 a read tap fires on the PREFETCH, so CURPC leads; a WRITE tap
-- fires on the actual bus write and CURPC is the storing instruction (or very
-- near it). Both are recorded so the lead can be calibrated.
--
-- Env:
--   PGM_BOOT     boot input script
--   PGM_SCRIPT   extra input script
--   PGM_WATCH    "80862E,808EB6,813E90-813E9F"  68k addresses (not share offsets)
--   PGM_FROM     first video frame to record (default 0)
--   PGM_POKE     "80862E=32900@2200-2280,..."   68k addr = value @ frames
--   PGM_TRACE    one 68k address: log every individual write with registers
--   PGM_TRACEN   how many writes to log (default 200)
--   PGM_SHOTS    video frames to snapshot
--   PGM_FRAMES   total video frames
--   PGM_OUT      TSV path

local function say(s) print("PROBE " .. s) end

M    = manager.machine
CPU  = M.devices[":maincpu"]
PRG  = CPU.spaces["program"]
SCR  = M.screens:at(1)
RAM  = M.memory.shares[":sram"]

local FROM   = tonumber(os.getenv("PGM_FROM") or "") or 0
local NFR    = tonumber(os.getenv("PGM_FRAMES") or "") or 2400
local TRACEN = tonumber(os.getenv("PGM_TRACEN") or "") or 200
local OUT    = os.getenv("PGM_OUT")

local TRACE = nil
if (os.getenv("PGM_TRACE") or "") ~= "" then TRACE = tonumber(os.getenv("PGM_TRACE"), 16) end

local SHOTS = {}
for s in string.gmatch(os.getenv("PGM_SHOTS") or "", "[^,]+") do SHOTS[tonumber(s)] = true end

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

-- ----------------------------------------------------------------- pokes ----
local POKES = {}
for seg in string.gmatch(os.getenv("PGM_POKE") or "", "[^,]+") do
  local a, v, f1, f2 = string.match(seg, "^%s*(%x+)%s*=%s*(%-?%d+)%s*@%s*(%d+)%-(%d+)%s*$")
  if a then
    POKES[#POKES+1] = { addr = tonumber(a, 16), val = tonumber(v),
                        from = tonumber(f1), to = tonumber(f2) }
  end
end

-- ----------------------------------------------------------------- taps -----
local VF = 0
local sites = {}     -- "AAAAAA|PPPPPP" -> {addr,pc,n,firstVF,lastVF,frames}
local order = {}
local traces = {}
-- GLOBAL on purpose. NOTES-mame-oracle.md §6.1 says a dropped tap handle is
-- silently collected. The subtle version, hit here: `local TAPS` at chunk
-- scope that NO surviving closure references is collectable too -- the frame
-- notifier never mentions it. Result: taps install, return non-nil, and never
-- fire; the run just gets faster. Keep handles in a GLOBAL.
TAPS = {}      -- MUST keep the handles alive (NOTES-mame-oracle.md §6.1)

local function on_write(off, data, mask)
  if VF < FROM then return end
  local pc = CPU.state["CURPC"].value
  local key = ("%06X|%06X"):format(off, pc)
  local s = sites[key]
  if s == nil then
    s = { addr = off, pc = pc, n = 0, firstVF = VF, frames = {}, nframes = 0,
          firstval = data }
    sites[key] = s; order[#order+1] = key
  end
  s.n = s.n + 1; s.lastVF = VF; s.lastval = data
  if s.frames[VF] == nil then s.frames[VF] = 0; s.nframes = s.nframes + 1 end
  s.frames[VF] = s.frames[VF] + 1
  if TRACE and off == TRACE and #traces < TRACEN then
    traces[#traces+1] = ("vf=%d pc=$%06X val=%04X mask=%04X D0=%08X D1=%08X D2=%08X A0=%08X A1=%08X A2=%08X SP=%08X")
      :format(VF, pc, data & 0xffff, mask & 0xffff,
              CPU.state["D0"].value, CPU.state["D1"].value, CPU.state["D2"].value,
              CPU.state["A0"].value, CPU.state["A1"].value, CPU.state["A2"].value,
              CPU.state["SP"].value)
  end
end

for seg in string.gmatch(os.getenv("PGM_WATCH") or "", "[^,]+") do
  local a, b = string.match(seg, "^%s*(%x+)%s*%-%s*(%x+)%s*$")
  local lo, hi
  if a then lo, hi = tonumber(a, 16), tonumber(b, 16)
  else local c = string.match(seg, "^%s*(%x+)%s*$")
       if c then lo = tonumber(c, 16); hi = lo + 1 end end
  if lo then
    TAPS[#TAPS+1] = PRG:install_write_tap(lo, hi, "w" .. #TAPS, on_write)
    say(("tap installed $%06X-$%06X"):format(lo, hi))
  end
end

-- ---------------------------------------------------------------- frames ----
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)
  for _, p in ipairs(POKES) do
    if VF >= p.from and VF <= p.to then PRG:write_u16(p.addr, p.val & 0xffff) end
  end
  if SHOTS[VF] then SCR:snapshot(("w%05d.png"):format(VF)) end
  if VF < NFR then return end

  local f = OUT and assert(io.open(OUT, "w"))
  if f then f:write("addr\tpc\tn\tframes\tfirstVF\tlastVF\tfirstval\tlastval\n") end
  table.sort(order)
  say(("distinct (addr,pc) sites = %d over %d frames from %d"):format(#order, VF, FROM))
  for _, key in ipairs(order) do
    local s = sites[key]
    if f then f:write(("%06X\t%06X\t%d\t%d\t%d\t%d\t%04X\t%04X\n")
      :format(s.addr, s.pc, s.n, s.nframes, s.firstVF, s.lastVF or 0,
              (s.firstval or 0) & 0xffff, (s.lastval or 0) & 0xffff)) end
    say(("site addr=$%06X pc=$%06X n=%d frames=%d (%.2f/frame) vf=%d..%d val %04X->%04X")
        :format(s.addr, s.pc, s.n, s.nframes, s.n / math.max(1, s.nframes),
                s.firstVF, s.lastVF or 0, (s.firstval or 0) & 0xffff,
                (s.lastval or 0) & 0xffff))
  end
  if f then f:close() end
  for _, t in ipairs(traces) do say("trace " .. t) end
  say("END")
  M:exit()
end)
say("writers installed")
