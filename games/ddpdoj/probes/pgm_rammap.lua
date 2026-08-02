-- pgm_rammap.lua -- which parts of main RAM does the 68000 WRITE, and from where?
--
-- One write tap over the whole 128 KiB of main RAM. The callback is deliberately
-- cheap: bucket by 256-byte page, and (optionally) by CURPC for one page. This
-- is NOTES-slowdown-oracle.md §6 "finding the loop without a disassembly",
-- applied to a board we have never mapped.
--
-- Env: PGM_BOOT PGM_SCRIPT PGM_FROM PGM_TO PGM_FRAMES PGM_PCPAGE(hex 68k addr
--      range "808000-808FFF" -> also bucket those writes by CURPC) PGM_OUT

local function say(s) print("PROBE " .. s) end

M   = manager.machine
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]

local FROM = tonumber(os.getenv("PGM_FROM") or "") or 0
local TO   = tonumber(os.getenv("PGM_TO") or "") or 1e9
local NFR  = tonumber(os.getenv("PGM_FRAMES") or "") or 2400
local OUT  = os.getenv("PGM_OUT")

local PCLO, PCHI = nil, nil
do
  local a, b = string.match(os.getenv("PGM_PCPAGE") or "", "^%s*(%x+)%-(%x+)%s*$")
  if a then PCLO, PCHI = tonumber(a, 16), tonumber(b, 16) end
end

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

local VF = 0
local page = {}      -- page index -> writes
local pcsite = {}    -- "PC|addr" -> n, for the PGM_PCPAGE window
local total = 0
-- GLOBAL on purpose. NOTES-mame-oracle.md §6.1 says a dropped tap handle is
-- silently collected. The subtle version, hit here: `local TAPS` at chunk
-- scope that NO surviving closure references is collectable too -- the frame
-- notifier never mentions it. Result: taps install, return non-nil, and never
-- fire; the run just gets faster. Keep handles in a GLOBAL.
TAPS = {}

local function on_write(off, data, mask)
  if VF < FROM or VF > TO then return end
  total = total + 1
  local p = (off - 0x800000) >> 8
  page[p] = (page[p] or 0) + 1
  if PCLO and off >= PCLO and off <= PCHI then
    local k = ("%06X|%06X"):format(CPU.state["CURPC"].value, off)
    pcsite[k] = (pcsite[k] or 0) + 1
  end
end

-- TRAP, MEASURED 2026-07-31, and it cost an hour:
-- main RAM is mapped `0x800000-0x81ffff` with `.mirror(0x0e0000)`, so the SAME
-- storage decodes at 0x800000, 0x820000, ... 0x8e0000. Installing a second tap
-- on the mirror range (0x8E0000-0x8FFFFF) after one on 0x800000-0x81FFFF made
-- BOTH silently stop firing: 0 callbacks over 120 frames of gameplay, no error,
-- and the run got *faster*, which is the only visible symptom. Installing the
-- base range as several smaller taps and NOT tapping the mirror works:
--   800000-80000F=2761  800010-8000FF=1728  800100-800FFF=3072
--   801000-807FFF=21915 808000-80FFFF=19987 810000-81FFFF=600709   (300 frames)
-- Never tap two aliases of one mirrored block in the same run.
local CHUNK = 0x2000
local a = 0x800000
while a <= 0x81FFFF do
  local b = math.min(a + CHUNK - 1, 0x81FFFF)
  TAPS[#TAPS+1] = PRG:install_write_tap(a, b, ("ram%02d"):format(#TAPS), on_write)
  a = b + 1
end
local mirror = -1   -- not measured in this run; see the trap note above

SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)
  if VF < NFR then return end

  local nf = math.max(1, math.min(TO, VF) - FROM + 1)
  say(("recorded frames=%d total_writes=%d (%.0f/frame) mirror_writes=%d")
      :format(nf, total, total / nf, mirror))
  local ks = {}
  for p in pairs(page) do ks[#ks+1] = p end
  table.sort(ks, function(a, b) return page[a] > page[b] end)
  local f = OUT and assert(io.open(OUT, "w"))
  if f then f:write("page_addr\twrites\tper_frame\n") end
  for i, p in ipairs(ks) do
    local a = 0x800000 + (p << 8)
    if f then f:write(("%06X\t%d\t%.2f\n"):format(a, page[p], page[p] / nf)) end
    if i <= 40 then say(("page $%06X-$%06X writes=%d (%.1f/frame)")
                        :format(a, a + 255, page[p], page[p] / nf)) end
  end
  say(("distinct_pages_written=%d of 512"):format(#ks))
  if f then f:close() end

  if PCLO then
    local pk = {}
    for k in pairs(pcsite) do pk[#pk+1] = k end
    table.sort(pk, function(a, b) return pcsite[a] > pcsite[b] end)
    say(("--- writers into $%06X-$%06X : %d distinct (PC,addr) ---"):format(PCLO, PCHI, #pk))
    for i = 1, math.min(#pk, 60) do
      local pc, off = string.match(pk[i], "^(%x+)|(%x+)$")
      say(("  pc=$%s addr=$%s n=%d (%.2f/frame)"):format(pc, off, pcsite[pk[i]],
          pcsite[pk[i]] / nf))
    end
  end
  say("END")
  M:exit()
end)
say("rammap installed")
