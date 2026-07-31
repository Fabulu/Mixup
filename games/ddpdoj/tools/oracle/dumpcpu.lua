-- dumpcpu.lua -- write the DECRYPTED 68000 program image out for static work.
--
-- WHY THIS EXISTS AT ALL: init_ddp3() (pgmprot_igs027a_type1.cpp:1825) runs
-- pgm_py2k2_decrypt over the :maincpu region IN PLACE at machine init, so the
-- bytes in the ROM file are NOT the bytes the 68000 executes. Every landmark
-- address in this project was derived from the decrypted image, and the only
-- way to get it is to ask a running machine.
--
-- docs/knowledge/08: measurement proves presence, only the LISTING proves
-- absence. This is the listing half's raw material.
--
-- ROM-DERIVED OUTPUT. PGM_DUMP must point inside a gitignored directory;
-- tools/oracle/.gitignore covers out/ and *.bin.
--
-- Env: PGM_DUMP (absolute Windows path), PGM_DUMP_AT (video frame; default 400)

local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local PATH = os.getenv("PGM_DUMP")
local AT   = tonumber(os.getenv("PGM_DUMP_AT") or "") or 400

SUBS = {}
local done = false

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if done or M.screens[":screen"]:frame_number() < AT then return end
  done = true
  local r = M.memory.regions[":maincpu"]
  if not r then p("MISSING region :maincpu"); M:exit(); return end
  local f, err = io.open(PATH, "wb")
  if not f then p("OPEN_FAILED path=[%s] err=%s", tostring(PATH), tostring(err))
    M:exit(); return end
  local chunk = {}
  for a = 0, r.size - 1 do
    chunk[#chunk + 1] = string.char(r:read_u8(a))
    if #chunk == 65536 then f:write(table.concat(chunk)); chunk = {} end
  end
  if #chunk > 0 then f:write(table.concat(chunk)) end
  f:close()
  p("DUMPED region=:maincpu size=%d path=%s", r.size, PATH)
  p("END")
  M:exit()
end)
