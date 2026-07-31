-- pgm_determinism.lua -- is a PGM run reproducible?
--
-- NOTES-slowdown-oracle.md measured MAME bit-deterministic on the NES driver and
-- explicitly flagged the PGM driver as UNMEASURED. This board has a V3021 RTC
-- and a 128 KiB battery-backed main RAM that IS the NVRAM, so there are two
-- obvious ways for a run to depend on something outside itself.
--
-- Emits an FNV-1a digest of all of main RAM every PGM_EVERY video frames, plus
-- the PC. Run twice and diff.
--
-- Env: PGM_SCRIPT PGM_FRAMES PGM_EVERY PGM_OUT

local function say(s) print("PROBE " .. s) end

M   = manager.machine
CPU = M.devices[":maincpu"]
RAM = M.memory.shares[":sram"]

local NFR   = tonumber(os.getenv("PGM_FRAMES") or "") or 2200
local EVERY = tonumber(os.getenv("PGM_EVERY") or "") or 20
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
for seg in string.gmatch(os.getenv("PGM_SCRIPT") or "", "[^,]+") do
  local a, b, keys = string.match(seg, "^%s*(%d+)%-(%d+):(.*)$")
  if a then
    local fs = {}
    for k in string.gmatch(keys, "[^%+]+") do fs[#fs+1] = k end
    SCRIPT[#SCRIPT+1] = { tonumber(a), tonumber(b), fs }
  end
end
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

local NW = RAM.size // 2
local function digest()
  local h = 2166136261
  for i = 0, NW - 1 do
    local v = RAM:read_u16(i * 2)
    h = ((h ~ (v & 0xff)) * 16777619) % 4294967296
    h = ((h ~ (v >> 8)) * 16777619) % 4294967296
  end
  return h
end

local f = OUT and assert(io.open(OUT, "w"))
local VF = 0
SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  apply(VF)
  if VF % EVERY == 0 then
    local line = ("%d\t%08X\t%X"):format(VF, digest(), CPU.state["PC"].value)
    if f then f:write(line .. "\n") end
    if VF % (EVERY * 10) == 0 then say("det " .. line) end
  end
  if VF >= NFR then
    if f then f:close() end
    say("END")
    M:exit()
  end
end)
say("determinism installed nfr=" .. NFR)
