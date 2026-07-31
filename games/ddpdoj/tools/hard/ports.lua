-- ports.lua -- what the input/DIP ports actually are, and what they default to.
--
-- Needed because a 5,000-frame "gameplay" run turned out to be sitting in the
-- board's INPUT TEST screen (proved by snapshotting the framebuffer -- trap 2 of
-- docs/knowledge/02-traps.md: assert on the OUTPUT, not on "it ran"). Something
-- puts this machine into service mode at boot and it has to be identified before
-- any corpus is built on top of it.
--
-- Env: HARD_SET_DSW="Service Mode=0", HARD_SNAPAT="100,300,900,2000"

local TAG = "PROBE "
local function out(s) print(TAG .. s) end

local mach  = manager.machine
local ports = mach.ioport.ports
local scr   = mach.screens[":screen"]

local at = {}
for tok in (os.getenv("HARD_SNAPAT") or "100"):gmatch("[^,]+") do at[tonumber(tok)] = true end
local last = 0
for k in pairs(at) do if k > last then last = k end end

local sets = {}
for tok in (os.getenv("HARD_SET_DSW") or ""):gmatch("[^,]+") do
  local k, v = tok:match("^%s*(.-)%s*=%s*(%d+)%s*$")
  if k then sets[#sets + 1] = { k = k, v = tonumber(v) } end
end

local frames = 0
local dumped = false

_frame_sub = emu.add_machine_frame_notifier(function ()
  frames = frames + 1
  if not dumped then
    dumped = true
    local tags = {}
    for t in pairs(ports) do tags[#tags + 1] = t end
    table.sort(tags)
    for _, t in ipairs(tags) do
      local fnames = {}
      for fn in pairs(ports[t].fields) do fnames[#fnames + 1] = fn end
      table.sort(fnames)
      for _, fn in ipairs(fnames) do
        local f = ports[t].fields[fn]
        local ok, dv = pcall(function() return f.default_value end)
        local ok2, uv = pcall(function() return f.user_value end)
        out(string.format("field %s / %-22s type=%s mask=%04X default=%s user=%s live=%s",
            t, fn, tostring(f.type_class), f.mask,
            ok and tostring(dv) or "?", ok2 and tostring(uv) or "?",
            tostring(pcall(function() return f.live end) and "" or "")))
      end
    end
    for _, s in ipairs(sets) do
      local done = false
      for t in pairs(ports) do
        local f = ports[t].fields[s.k]
        if f then f:set_value(s.v); out("set " .. t .. "/" .. s.k .. "=" .. s.v); done = true end
      end
      if not done then out("SET MISSING field " .. s.k) end
    end
  end
  if at[frames] then
    scr:snapshot(string.format("ports_f%06d.png", frames))
    out("snapshot " .. frames)
  end
  if frames >= last then out("END"); mach:exit() end
end)
