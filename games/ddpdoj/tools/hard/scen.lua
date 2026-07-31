-- scen.lua -- scripted input + the full work census, with framebuffer proof.
--
-- WHY A SCRIPT AT ALL: ddpdojblk does not boot to an attract loop. It boots to a
-- VERSION SELECT menu -- "1: VERSION-A (OLD) / 2: VERSION-B (NEW), SELECT = UP
-- or DOWN, START = SHOT" -- with a 5-second countdown that falls through to
-- VERSION-A. That is why an unscripted 5,000-frame run measured a machine
-- emitting 59 sprite entries in total, and why holding 1P-START and SHOT
-- together (which my first play script did) lands in the board's INPUT TEST
-- screen instead of a game. Both were only visible because the run took a
-- SNAPSHOT (docs/knowledge/02-traps.md trap 2: assert on the output).
--
-- HARD_SCRIPT grammar: "frame:field:holdframes,frame:field:holdframes,..."
--   field is one of  coin start shot bomb up down left right p1b2 p1b3
-- HARD_AUTOFIRE=<frame>  holds shot from that frame on and sweeps the stick.
-- HARD_SNAPAT="600,1500,3000"     framebuffer snapshots, by video frame
-- Counters are exactly work.lua's.

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local cpu  = mach.devices[":maincpu"]
local prog = cpu.spaces["program"]
local ram  = mach.memory.shares[":sram"]
local scr  = mach.screens[":screen"]

local FRAMES   = tonumber(os.getenv("HARD_FRAMES") or "") or 6000
local TRACE    = os.getenv("HARD_TRACE") == "1"
local AUTOFIRE = tonumber(os.getenv("HARD_AUTOFIRE") or "") or 0

-- Landmarks are per BUILD. ddpdojblk's 2 MB program ROM holds TWO complete
-- games -- the boot menu's "1: VERSION-A (OLD)" runs from $1xxxxx and
-- "2: VERSION-B (NEW)" from $2xxxxx -- and they do NOT sit at a constant offset
-- from one another. Defaults below are the VERSION-A set; pass the B set in.
--   A: LOOP=0x13C356 WAIT=0x13C6B4 EMIT=0x13DA02
--   B: LOOP=0x23BFDC WAIT=0x23C390 EMIT=0x24A242,0x24A29C,0x24A2F6,0x24A35C
local LOOP_HEAD = tonumber(os.getenv("HARD_LOOP") or "") or 0x13C356
local WAIT_LOOP = tonumber(os.getenv("HARD_WAIT") or "") or 0x13C6B4
local SPR_CLEAR = tonumber(os.getenv("HARD_CLEAR") or "") or 0x13C9C8
local SPR_EMITS = {}
for tok in (os.getenv("HARD_EMIT") or "0x13DA02"):gmatch("[^,]+") do
  SPR_EMITS[#SPR_EMITS + 1] = tonumber(tok)
end
local FLAG      = 0x803940
local CTR       = 0x80390A

local function ram_u8(a)  return ram:read_u8(a - 0x800000) end
local function ram_u16(a) return (ram_u8(a) << 8) | ram_u8(a + 1) end

local FIELDS = {
  coin  = { ":Service", "Coin 1" },
  start = { ":P1P2", "1 Player Start" },
  shot  = { ":P1P2", "P1 Button 1" },
  bomb  = { ":P1P2", "P1 Button 2" },
  p1b3  = { ":P1P2", "P1 Button 3" },
  up    = { ":P1P2", "P1 Up" },
  down  = { ":P1P2", "P1 Down" },
  left  = { ":P1P2", "P1 Left" },
  right = { ":P1P2", "P1 Right" },
}
local ports = mach.ioport.ports
local function fld(name)
  local d = FIELDS[name]
  if not d then return nil end
  local p = ports[d[1]]
  return p and p.fields[d[2]] or nil
end

local script = {}
for tok in (os.getenv("HARD_SCRIPT") or ""):gmatch("[^,]+") do
  local f, n, h = tok:match("^(%d+):(%a%w*):(%d+)$")
  if f then script[#script + 1] = { at = tonumber(f), name = n, hold = tonumber(h) } end
end
local snapat = {}
for tok in (os.getenv("HARD_SNAPAT") or ""):gmatch("[^,]+") do snapat[tonumber(tok)] = true end

local frames, irq6 = 0, 0
local f_loop, f_spin, f_emit, f_clear = 0, 0, 0, 0
local tot_loop, tot_spin, tot_emit = 0, 0, 0
local loop_hist, spin_hist, emit_hist, ctr_hist = {}, {}, {}, {}
local zero_spin, low_spin = {}, {}
local max_emit, max_emit_frame = 0, 0
local min_spin, min_spin_frame = math.huge, 0
local prev_ctr, raster_reads = nil, 0
local irq6_stack = {}
local held = {}

local function bump(t, k) t[k] = (t[k] or 0) + 1 end

_t1 = prog:install_read_tap(LOOP_HEAD, LOOP_HEAD + 1, "loop", function () f_loop = f_loop + 1; tot_loop = tot_loop + 1 end)
_t2 = prog:install_read_tap(WAIT_LOOP, WAIT_LOOP + 1, "spin", function () f_spin = f_spin + 1; tot_spin = tot_spin + 1 end)
_emit_taps = {}
for i, a in ipairs(SPR_EMITS) do
  _emit_taps[i] = prog:install_read_tap(a, a + 1, "emit" .. i, function ()
    f_emit = f_emit + 1; tot_emit = tot_emit + 1
  end)
end
_t4 = prog:install_read_tap(SPR_CLEAR, SPR_CLEAR + 1, "clear", function () f_clear = f_clear + 1 end)
_t5 = prog:install_read_tap(0xb07000, 0xb07001, "raster", function () raster_reads = raster_reads + 1 end)

-- Object-loop code map by measurement: who writes the 0xa00-byte sprite list
-- that the IGS023 DMAs at vblank. NOTES-slowdown-oracle.md section 6.
local sprsites, sprw_hist, f_sprw = {}, {}, 0
local SPRMAP = os.getenv("HARD_SPRITEMAP") == "1"
if SPRMAP then
  _t7 = prog:install_write_tap(0x800000, 0x8009FF, "sprmap", function (offset)
    f_sprw = f_sprw + 1
    local pc = cpu.state["CURPC"].value & 0xFFFFFF
    local e = sprsites[pc]
    if not e then e = { n = 0, lo = offset, hi = offset }; sprsites[pc] = e end
    e.n = e.n + 1
    if offset < e.lo then e.lo = offset end
    if offset > e.hi then e.hi = offset end
  end)
end
_t6 = prog:install_read_tap(0x78, 0x79, "irq6", function ()
  irq6 = irq6 + 1
  local sp = cpu.state["SP"].value & 0xFFFFFF
  if sp >= 0x800000 and sp < 0x820000 then bump(irq6_stack, prog:read_u32(sp + 2) & 0xFFFFFF) end
end)

local function hist_line(t)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks)
  local o = {}
  for _, k in ipairs(ks) do o[#o + 1] = string.format("%d:%d", k, t[k]) end
  return table.concat(o, " ")
end

local function report()
  out("--- scen census ---")
  out(string.format("video_frames=%d irq6=%d main_loop_iterations=%d sprite_entries_total=%d",
      frames, irq6, tot_loop, tot_emit))
  out("raster_b07000_reads=" .. raster_reads)
  out("loop_iters_per_video_frame " .. hist_line(loop_hist))
  out("ctr_80390A_delta_per_video_frame " .. hist_line(ctr_hist))
  out(string.format("max_sprite_entries_per_frame=%d at_frame=%d", max_emit, max_emit_frame))
  local eb = {}
  for k, v in pairs(emit_hist) do
    local key = math.floor(k / 50) * 50
    eb[key] = (eb[key] or 0) + v
  end
  out("sprite_entries_per_frame_bucketed50 " .. hist_line(eb))
  local sb = {}
  for k, v in pairs(spin_hist) do
    local key = (k == 0) and 0 or math.floor(k / 1000) * 1000
    sb[key] = (sb[key] or 0) + v
  end
  out("spin_iters_per_video_frame_bucketed1000 " .. hist_line(sb))
  out(string.format("min_spin=%d at_frame=%d", min_spin == math.huge and -1 or min_spin, min_spin_frame))
  out("frames_with_zero_spin=" .. #zero_spin)
  local s = {}
  for i = 1, math.min(60, #zero_spin) do s[#s + 1] = zero_spin[i] end
  out("zero_spin_frames=" .. table.concat(s, ","))
  out("frames_with_spin_lt_1000=" .. #low_spin)
  s = {}
  for i = 1, math.min(60, #low_spin) do s[#s + 1] = low_spin[i] end
  out("low_spin_frames=" .. table.concat(s, ","))
  local ks = {}
  for k in pairs(irq6_stack) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return irq6_stack[a] > irq6_stack[b] end)
  out("distinct_interrupted_pcs=" .. #ks)
  for i = 1, math.min(15, #ks) do
    out(string.format("interrupted_pc=%06X n=%d", ks[i], irq6_stack[ks[i]]))
  end
  if SPRMAP then
    local pcs = {}
    for pc in pairs(sprsites) do pcs[#pcs + 1] = pc end
    table.sort(pcs, function(a, b) return sprsites[a].n > sprsites[b].n end)
    out("sprite_list_writer_sites=" .. #pcs .. " (showing top 25)")
    for i = 1, math.min(25, #pcs) do
      local pc, e = pcs[i], sprsites[pcs[i]]
      out(string.format("sprwriter pc=%06X n=%d off=%06X..%06X", pc, e.n, e.lo, e.hi))
    end
    out("sprite_writes_per_frame_bucketed200 " .. hist_line(sprw_hist))
  end
  out("END")
  mach:exit()
end

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1
  for i = #held, 1, -1 do
    if frames >= held[i].u then held[i].f:set_value(0); table.remove(held, i) end
  end
  for _, s in ipairs(script) do
    if s.at == frames then
      local f = fld(s.name)
      if f then f:set_value(1); held[#held + 1] = { f = f, u = frames + s.hold }
        out(string.format("input %s frame=%d hold=%d", s.name, frames, s.hold))
      else out("input MISSING " .. s.name) end
    end
  end
  if AUTOFIRE > 0 and frames >= AUTOFIRE then
    local sh = fld("shot"); if sh then sh:set_value(1) end
    local phase = (frames // 40) % 4
    local m = { fld("up"), fld("left"), fld("down"), fld("right") }
    for i = 1, 4 do if m[i] then m[i]:set_value(phase == (i - 1) and 1 or 0) end end
  end
  if snapat[frames] then
    scr:snapshot(string.format("scen_f%06d.png", frames))
    out("snapshot " .. frames)
  end

  bump(loop_hist, f_loop); bump(spin_hist, f_spin); bump(emit_hist, f_emit)
  if f_spin == 0 then zero_spin[#zero_spin + 1] = frames
  elseif f_spin < 1000 then low_spin[#low_spin + 1] = frames end
  if f_spin < min_spin and frames > 30 then min_spin = f_spin; min_spin_frame = frames end
  if f_emit > max_emit then max_emit = f_emit; max_emit_frame = frames end
  if SPRMAP then bump(sprw_hist, math.floor(f_sprw / 200) * 200); f_sprw = 0 end
  local c = ram_u16(CTR)
  if prev_ctr then bump(ctr_hist, (c - prev_ctr) & 0xFFFF) end
  prev_ctr = c
  if TRACE then
    out(string.format("T\t%d\t%d\t%d\t%d\t%d\t%04X", frames, f_loop, f_spin, f_emit, f_clear, c))
  end
  f_loop, f_spin, f_emit, f_clear = 0, 0, 0, 0
  if frames >= FRAMES then report() end
end)
