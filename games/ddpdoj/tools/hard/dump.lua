-- dump.lua -- write the DECRYPTED 68000 program image to a file for static work.
--
-- init_ddp3 runs pgm_py2k2_decrypt over the maincpu region in place, so what
-- MAME's ":maincpu" region holds at runtime is what the 68000 actually executes.
-- That is the listing docs/knowledge/08-rank-and-dynamic-difficulty.md demands
-- for any ABSENCE claim ("measurement proves presence; only the listing proves
-- absence").
--
-- ROM-DERIVED OUTPUT. HARD_DUMP must point inside a gitignored directory.
-- Env: HARD_DUMP (absolute path), HARD_DUMP_AT (video frame to dump at).

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach = manager.machine
local PATH = os.getenv("HARD_DUMP")
local AT   = tonumber(os.getenv("HARD_DUMP_AT") or "") or 400

local frames, done = 0, false

local function fnv1a(s)
  local hi, lo = 0x811C, 0x9DC5
  for i = 1, #s do
    lo = lo ~ s:byte(i)
    local l = lo * 0x0193
    local h = hi * 0x0193 + (l >> 16)
    lo = l & 0xFFFF
    hi = h & 0xFFFF
  end
  return (hi << 16) | lo
end

local function dump_region(tag, path)
  local r = mach.memory.regions[tag]
  if not r then out("MISSING region " .. tag) return end
  local f = assert(io.open(path, "wb"))
  local chunk = {}
  for a = 0, r.size - 1 do
    chunk[#chunk + 1] = string.char(r:read_u8(a))
    if #chunk == 65536 then f:write(table.concat(chunk)); chunk = {} end
  end
  if #chunk > 0 then f:write(table.concat(chunk)) end
  f:close()
  out(string.format("dumped %s size=%d -> %s", tag, r.size, path))
end

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1
  if frames >= AT and not done then
    done = true
    dump_region(":maincpu", PATH)
    -- a stable fingerprint of the first 64 KiB so the dump is checkable later
    local r = mach.memory.regions[":maincpu"]
    local s = {}
    for a = 0x100000, 0x10FFFF do s[#s + 1] = string.char(r:read_u8(a)) end
    out(string.format("prog_100000_10FFFF_fnv1a=%08X", fnv1a(table.concat(s))))
    out("END")
    mach:exit()
  end
end)
