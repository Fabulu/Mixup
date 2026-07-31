-- generic headless driver: DIP overrides, a button script, snapshots
-- env:
--   DDP_TAG      snapshot filename prefix
--   DDP_SVC      "1" -> Service Mode DIP on
--   DDP_SCRIPT   "frame:Field:holdframes,..."   e.g. "300:P1 Down:6,320:P1 Button 1:6"
--   DDP_SHOTS    "120,300,600"
local TAG    = os.getenv("DDP_TAG") or "run"
local SVC    = os.getenv("DDP_SVC") == "1"
local SCRIPT = os.getenv("DDP_SCRIPT") or ""
local SHOTS  = os.getenv("DDP_SHOTS") or ""

local want = {}
for f in string.gmatch(SHOTS, "[^,]+") do want[tonumber(f)] = true end

local events = {}   -- frame -> { {field=, hold=} }
for item in string.gmatch(SCRIPT, "[^,]+") do
  local f, name, hold = string.match(item, "^(%d+):([^:]+):(%d+)$")
  if f then
    f = tonumber(f)
    events[f] = events[f] or {}
    table.insert(events[f], { name = name, hold = tonumber(hold) })
  else
    print("DRIVE BADITEM " .. item)
  end
end

local FIELDS = {}
local function bindfields()
  for tag, p in pairs(manager.machine.ioport.ports) do
    for fname, f in pairs(p.fields) do FIELDS[fname] = f end
  end
end

local releases = {}
KEEP = KEEP or {}
local n, sc = 0, nil
local inited = false
KEEP[#KEEP+1] = emu.add_machine_frame_notifier(function()
  n = n + 1
  if not sc then for _, s in pairs(manager.machine.screens) do sc = s break end end
  if not inited then
    inited = true
    bindfields()
    if SVC and FIELDS["Service Mode"] then
      FIELDS["Service Mode"].user_value = 0
      print("DRIVE service mode ON")
    end
  end
  if releases[n] then
    for _, fn in ipairs(releases[n]) do
      if FIELDS[fn] then FIELDS[fn]:set_value(0) end
    end
    releases[n] = nil
  end
  if events[n] then
    for _, e in ipairs(events[n]) do
      local f = FIELDS[e.name]
      if f then
        f:set_value(1)
        local r = n + e.hold
        releases[r] = releases[r] or {}
        table.insert(releases[r], e.name)
        print(string.format("DRIVE f=%d press %s (hold %d)", n, e.name, e.hold))
      else
        print("DRIVE NOFIELD " .. e.name)
      end
    end
  end
  if want[n] then
    local ok, err = pcall(function() sc:snapshot(string.format("%s_f%05d.png", TAG, n)) end)
    if ok then print("SHOT f=" .. n) else print("SHOT ERROR " .. tostring(err)) end
  end
end)
