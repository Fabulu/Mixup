-- recon20.lua -- RECON 20: the ENEMY BULLET pattern system, measured.
--
-- STATIC read first (docs/worklog/ddpdoj/20-recon-pattern-tables.md):
--   pool   $817F8C, stride $40, 210 slots, live-count accumulator $81B40C
--   core   $2814B6 (plain) / $2817C2 (bit9 variant)
--   tables $281956 template[39]  $2815C6 spawn-init[39]  $282030 behaviour[39]
--
-- HOOKS -- WRITE taps only (a read tap proves prefetch, not execution):
--   $28158A  move.b D7,($a,A0)   one per bullet spawned through $2814B6
--   $281898  move.b D7,($a,A0)   one per bullet spawned through $2817C2
--   A0 = record+$10, D7 = the SPEED byte, D1 = the DIRECTION byte,
--   A5 = the firing enemy's record, (A7+16) = the return address inside the
--   N-way entry point, which identifies WHICH generator ran.
--   $803940                      the sample point (frame.lua's keying)
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}

local RUN  = tonumber(os.getenv("R20_FRAMES") or "3000")
local ROWF = os.getenv("R20_ROWTSV")
POKE_FROM = tonumber(os.getenv("R20_POKE_FROM") or "0")

local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local script, held = {}, {}
for item in (os.getenv("R20_INPUT") or ""):gmatch("[^;]+") do
  local lfx, names = item:match("^(%d+)=(.*)$")
  if lfx then
    local fs = {}
    for c in names:gmatch(".") do
      local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
      if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
    end
    script[tonumber(lfx)] = fs
  end
end
local function apply_input(n)
  local fs = script[n]
  if not fs then return end
  for _, f in ipairs(held) do f:set_value(0) end
  held = {}
  for _, f in ipairs(fs) do f:set_value(1); held[#held + 1] = f end
end

local lf, done = 0, false
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

local kinds, speeds, dirs, ents, etypes, cores = {}, {}, {}, {}, {}, {}
local kind_by_etype = {}
local nspawn, maxlive, livesum, nsamp = 0, 0, 0, 0
local rows = {}

local function reg(name)
  local st = CPU.state[name]
  if st == nil then return nil end
  return st.value & 0xffffff
end

local SPNAME = (CPU.state["A7"] ~= nil) and "A7" or ((CPU.state["SP"] ~= nil) and "SP" or nil)
local errs = 0

local function onspawn(core)
  local a0 = CPU.state["A0"].value & 0xffffff
  local rec = a0 - 0x10 - 0x800000
  local a5 = CPU.state["A5"].value & 0xffffff
  local a7 = SPNAME and reg(SPNAME) or nil
  local d7 = CPU.state["D7"].value & 0xff
  local d1 = CPU.state["D1"].value & 0xff
  local tw = RAM:read_u16(rec)
  local kind = tw & 0x3f
  local ret = 0
  if a7 then
    local ok, v = pcall(function() return PROG:read_u32(a7 + 16) & 0xffffff end)
    if ok then ret = v else errs = errs + 1 end
  end
  local et = "----"
  if a5 >= 0x813000 and a5 < 0x820000 then
    et = string.format("%02X", RAM:read_u8(a5 - 0x800000 + 0x0c))
  end
  nspawn = nspawn + 1
  bump(kinds, string.format("%d", kind))
  bump(speeds, string.format("%d", d7))
  bump(dirs, string.format("%d", d1))
  bump(ents, string.format("%06X", ret))
  bump(etypes, et)
  bump(cores, core)
  bump(kind_by_etype, string.format("%s/k%d", et, kind))
  if ROWF and #rows < 40000 then
    rows[#rows + 1] = string.format("%d\t%d\t%d\t%d\t%s\t%06X\t%s\t%04X\t%d\t%d\t%d\t%d",
      lf, kind, d7, d1, et, ret, core, tw,
      RAM:read_u16(rec + 2), RAM:read_u16(rec + 4),
      RAM:read_u16(0x103e8), RAM:read_u16(0x103ea))
  end
end

TAPS[#TAPS + 1] = PROG:install_write_tap(0x817F8C, 0x81B40B, "spawn", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if pc == 0x28158A or pc == 0x281898 then
    local ok, e = pcall(onspawn, (pc == 0x28158A) and "2814B6" or "2817C2")
    if not ok then errs = errs + 1 end
  end
  return data
end)

local REL = { [0x13C806] = true, [0x23C46C] = true }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem", function(offset, data, mask)
  local pc = CPU.state["CURPC"].value & 0xffffff
  if REL[pc] then return data end
  local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
  if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
    lf = lf + 1
    apply_input(lf)
    if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end
    local live = RAM:read_u16(0x1b40c)
    if live > maxlive then maxlive = live end
    livesum = livesum + live; nsamp = nsamp + 1
  end
  return data
end)

local function hist(t, n)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return t[a] > t[b] end)
  local out = {}
  for i = 1, math.min(n or 60, #ks) do out[#out + 1] = string.format("%s:%d", ks[i], t[ks[i]]) end
  return table.concat(out, " "), #ks
end

local function finish()
  if done then return end
  done = true
  local s, n
  p("BULLET spawns total: %d", nspawn)
  s, n = hist(cores, 10);   p("CORE %d distinct  %s", n, s)
  s, n = hist(ents, 30);    p("ENTRY-RETURN %d distinct  %s", n, s)
  s, n = hist(kinds, 60);   p("KINDS %d distinct  %s", n, s)
  s, n = hist(speeds, 60);  p("SPEEDS %d distinct  %s", n, s)
  s, n = hist(dirs, 20);    p("DIRS %d distinct (top20)  %s", n, s)
  s, n = hist(etypes, 40);  p("FIRING ENEMY TYPE %d distinct  %s", n, s)
  s, n = hist(kind_by_etype, 80); p("TYPE/KIND pairs %d distinct  %s", n, s)
  p("LIVE bullets max=%d mean=%.1f over %d frames", maxlive,
    nsamp > 0 and livesum / nsamp or 0, nsamp)
  p("81B414..81B41A = %04X %04X %04X %04X   813098rank=%04X 813092=%04X 813096=%04X",
    RAM:read_u16(0x1b414), RAM:read_u16(0x1b416), RAM:read_u16(0x1b418),
    RAM:read_u16(0x1b41a), RAM:read_u16(0x13098), RAM:read_u16(0x13092),
    RAM:read_u16(0x13096))
  p("813160=%04X 812950=%04X (global speed biases)", RAM:read_u16(0x13160), RAM:read_u16(0x12950))
  if ROWF then
    local f = io.open(ROWF, "w")
    f:write("lf\tkind\tspeed\tdir\tetype\tret\tcore\ttypeword\tposA\tposB\tp1A\tp1B\n")
    for _, r in ipairs(rows) do f:write(r, "\n") end
    f:close()
    p("ROWS %d -> %s", #rows, ROWF)
  end
  p("SPname=%s tapErrors=%d", tostring(SPNAME), errs)
  p("DONE logicframes=%d", lf)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN then finish() end
end)
