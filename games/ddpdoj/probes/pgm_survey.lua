-- pgm_survey.lua -- what does MAME actually expose for the PGM driver?
--
-- NOTES-mame-oracle.md §7 says everything measured so far was the NES driver and
-- that per-driver facts are NOT transferable. This settles them for igs/pgm.cpp:
-- device tags, address spaces and their names, memory shares and regions,
-- ioport names, screen geometry, and whether main RAM is reachable.
--
-- It also samples main RAM at intervals so we can see the machine is alive.

local function say(s) print("PROBE " .. s) end

M = manager.machine

local NFR = tonumber(os.getenv("PGM_FRAMES") or "") or 600

say("mame_version = " .. emu.app_version())

-- ------------------------------------------------------------- devices ------
local devnames = {}
for tag, dev in pairs(M.devices) do devnames[#devnames+1] = tag end
table.sort(devnames)
say("device_count = " .. #devnames)
for _, tag in ipairs(devnames) do
  local d = M.devices[tag]
  local sp = {}
  local ok = pcall(function()
    for n, s in pairs(d.spaces) do sp[#sp+1] = n end
  end)
  table.sort(sp)
  if #sp > 0 then
    say(("dev %-28s spaces=%s"):format(tag, table.concat(sp, ",")))
  end
end

-- ------------------------------------------------------------- shares -------
local sh = {}
for tag, s in pairs(M.memory.shares) do sh[#sh+1] = tag end
table.sort(sh)
for _, tag in ipairs(sh) do
  local s = M.memory.shares[tag]
  say(("share %-34s size=%d width=%d endian=%s")
      :format(tag, s.size, s.bitwidth, tostring(s.endianness)))
end

-- ------------------------------------------------------------ regions -------
local rg = {}
for tag, r in pairs(M.memory.regions) do rg[#rg+1] = tag end
table.sort(rg)
for _, tag in ipairs(rg) do
  local r = M.memory.regions[tag]
  say(("region %-34s size=%d width=%d"):format(tag, r.size, r.bitwidth))
end

-- ------------------------------------------------------------- screen -------
local SCR = M.screens:at(1)
say(("screen w=%d h=%d refresh=%.10f rot? xscale"):format(SCR.width, SCR.height, 1e18/SCR.refresh_attoseconds))
say(("screen refresh_attoseconds=%d"):format(SCR.refresh_attoseconds))

-- ------------------------------------------------------------ ioports -------
local pn = {}
for tag, p in pairs(M.ioport.ports) do pn[#pn+1] = tag end
table.sort(pn)
for _, tag in ipairs(pn) do
  local p = M.ioport.ports[tag]
  local fs = {}
  for fname, f in pairs(p.fields) do fs[#fs+1] = fname end
  table.sort(fs)
  say(("port %-22s fields=%s"):format(tag, table.concat(fs, " | ")))
end

-- ---------------------------------------------------------- cpu space -------
CPU = M.devices[":maincpu"]
PRG = CPU.spaces["program"]
say(("maincpu program: width=%d addrmask=%X endian=%s")
    :format(PRG.data_width, PRG.address_mask, tostring(PRG.endianness)))

-- registers available on the 68000
local rn = {}
for n, _ in pairs(CPU.state) do rn[#rn+1] = n end
table.sort(rn)
say("maincpu_state_regs = " .. table.concat(rn, ","))

-- ------------------------------------------------------- sanity on RAM ------
RAM = M.memory.shares[":sram"]
if RAM then
  say(("mainram share found size=%d width=%d"):format(RAM.size, RAM.bitwidth))
else
  say("mainram share ':sram' NOT FOUND")
end

VF = 0
local function h32(readfn, lo, hi, step)
  local h = 2166136261
  for a = lo, hi, step do
    local v = readfn(a)
    h = (h ~ (v & 0xff)) * 16777619 % 4294967296
    h = (h ~ ((v >> 8) & 0xff)) * 16777619 % 4294967296
  end
  return h
end

SUB = emu.add_machine_frame_notifier(function()
  VF = VF + 1
  if VF % 60 == 0 or VF == 1 then
    -- hash of the sprite-list region and of the rest of RAM, read via the share
    local a = h32(function(x) return RAM:read_u16(x) end, 0, 0x9fe, 2)
    local b = h32(function(x) return RAM:read_u16(x) end, 0xa00, 0x1fffe, 2)
    say(("vf=%d spritelist_hash=%08X ram_hash=%08X pc=%X")
        :format(VF, a, b, CPU.state["PC"].value))
  end
  if VF >= NFR then
    say("END")
    M:exit()
  end
end)
say("survey installed")
