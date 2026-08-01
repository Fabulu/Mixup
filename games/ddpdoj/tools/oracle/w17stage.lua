-- w17stage.lua -- WAVE 17: the WHOLE of stage 1, measured, under two labelled
-- interventions.  This is the run that turns every Phase-A gate from "the first
-- 22.8 % of stage 1" into "the stage".
--
-- ===================== THE INTERVENTIONS, NAMED =============================
-- (1) INVULNERABILITY.  $810424 -- the player record's ($3E,A6) invulnerability
--     countdown, record base $8103E6 (wave 4 $24953C, wave 10 $675) -- is
--     written $FF at the game's own sample point on EVERY logic frame from
--     W17_POKE_FROM.  The board still FLAGS hits; the player never dies.
-- (2) AUTOPILOT.  P1 Button 3 (auto-shot) held from W17_FIRE_FROM, plus a
--     12-frame left / centre / right / centre oscillation from W17_MOVE_FROM.
--     The owner's own routine (docs/knowledge/09, "Practical, from the owner").
--
-- docs/knowledge/09 "Intervention runs give you STATES, not a picture of the
-- game": this run is VALID for COVERAGE (which records execute, which handlers
-- are reached, does the stage END) and INVALID for characterising normal play
-- (spawn timing, bullet density, pacing, rank trajectory).  Anything derived
-- from this TSV must say "invulnerable" out loud.
--
-- ===================== WHAT IT RECORDS ======================================
-- Columns 1..25 are BYTE-FOR-BYTE the same fields, in the same order, as
-- `bgrecon.lua:181`, so `scrollgate.py` (which indexes p[0] p[7] p[15] p[17]
-- p[18] p[20] and requires len>=25) runs against this TSV UNMODIFIED.  The
-- wave-17 fields are APPENDED from column 26 on.  Do not reorder 1..25.
--
-- ===================== THE FOUR HUNTED WRITERS ==============================
-- 20-recon-scroll-engine §9 items 2/6/8 and 20-plan §2 W17 name four addresses
-- whose writers are UNKNOWN and which the port cannot guess over.  All four are
-- WRITE taps -- the only reliable 68000 execution hook (00-recon-hard §3: CURPC
-- does not identify an opcode fetch and a read tap only proves prefetch):
--   $81317E             external FREEZE     -> sets/clears ($8,A5)
--   $813180/82/84       external SPEED      -> ($1C,A5)/($22,A5) override
--   $80B03C             read by $24179E to scroll-compensate every BG element
--   $8130DA             gates every BG-element updater ($2623C2)
-- Plus three that make the scroll program's own execution VISIBLE:
--   $813192             the script-0 VM record cursor -> ONE WRITE PER RECORD
--   $8131AA             the script-1 VM record cursor
--   $81319E..$8131A9    the op-$04 repeat state (rewind ptr / len / cnt / loop)
--   $8131C2/$8131C4     the deferred cue callback -> op-$14 sub-op 0
-- and two that answer "can the stage even END":
--   $813092..$813097    loop / stage / stage*4
--   $8130CE             the distance clock, PC-censused (who else writes it?)
--
-- WHY THE SPEED AND THE FREEZE ARE NOT TAPPED, and it cost a wrong guess to
-- learn: ($1C,A5) / ($22,A5) / ($8,A5) live in the background OBJECT's record,
-- which the object allocator hands out at runtime -- there is no fixed address
-- to tap.  The FIRST draft of this file guessed A5 = $81316C from "($20,A5) is
-- $81318C" and named $813188/$81318E/$813174 as the speed and freeze words.
-- The board said no, in the smoke run and in the listing:
--   $813188  is the SCREEN-SHAKE block ($260E42 $260E64 $260E86 $260EA8 ...)
--   $81318E  has no absolute-long reference in the whole 6 MB image
--   $813174  is written EVERY frame by $261514 (a scroll-position global that
--            feeds $813176, the per-frame delta) -- if it were the freeze flag
--            the freeze could never hold, and it does hold, measured
-- What IS statically addressable, and is strictly better evidence, is the
-- interpreter's own state block:
--   $813192 script-0 VM block ($18 B), $8131AA script-1 -- `lea $813192,A6`
--   at $262068, `movea.l (A6),A1` at $262070, and `move.l A1,(A6)` at $262092
--   which executes ONLY after a record has been dispatched.
-- So a write tap on $813192..$813195 fires EXACTLY ONCE PER EXECUTED RECORD of
-- script 0.  That is the per-record execution ledger this wave exists to
-- produce, and it needs no register to be guessed at.
--   $81319E = ($C,A6) the armed rewind pointer, $8131A4..$8131A9 = len/cnt/loop
--   (20-recon-scroll-engine §3's $261F76 fields; $81319E is the address that
--   recon named as "the repeat state $26200E clears")
--
-- ENV: W17_FRAMES W17_INPUT W17_TSV W17_POKE_FROM W17_FIRE_FROM W17_MOVE_FROM
--      W17_REQUIRE_BUILD W17_COIN_EVERY
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]
local ROWS = M.memory.shares[":igs023:rowscrollram"]

TAPS, SUBS = {}, {}                 -- GLOBALS: a local handle is GC'd and the
                                    -- tap silently stops firing (00-recon-hard)

local RUN       = tonumber(os.getenv("W17_FRAMES")     or "9500")
local POKE_FROM = tonumber(os.getenv("W17_POKE_FROM")  or "1250")
local FIRE_FROM = tonumber(os.getenv("W17_FIRE_FROM")  or "1800")
local MOVE_FROM = tonumber(os.getenv("W17_MOVE_FROM")  or "1900")
local COIN_EVERY= tonumber(os.getenv("W17_COIN_EVERY") or "0")
local WANT      = os.getenv("W17_REQUIRE_BUILD")
local TSV       = os.getenv("W17_TSV")
local fh        = TSV and io.open(TSV, "w") or nil

p("SHARES sram=%d rowscrollram=%d", RAM.size, ROWS.size)
p("INTERVENTION invuln=$810424:=$FF from lf%d  autoshot from lf%d  move from lf%d",
  POKE_FROM, FIRE_FROM, MOVE_FROM)

-- ------------------------------------------------------------------ input
local PORT = M.ioport.ports[":P1P2"]
local SVC  = M.ioport.ports[":Service"]
local BUTTONS = { U = "P1 Up", D = "P1 Down", L = "P1 Left", R = "P1 Right",
                  A = "P1 Button 1", B = "P1 Button 2", C = "P1 Button 3",
                  S = "1 Player Start" }
local SVCBUTTONS = { N = "Coin 1", T = "Test", V = "Service" }
local function resolve(names)
  local fs = {}
  for c in names:gmatch(".") do
    local f = PORT.fields[BUTTONS[c] or ""] or SVC.fields[SVCBUTTONS[c] or ""]
    if f then fs[#fs + 1] = f else p("INPUT_UNKNOWN char=%s", c) end
  end
  return fs
end

local script, held, held_key = {}, {}, nil
for item in (os.getenv("W17_INPUT") or ""):gmatch("[^;]+") do
  local lfn, names = item:match("^(%d+)=(.*)$")
  if lfn then script[tonumber(lfn)] = names end
end

local function set_held(names)
  if names == held_key then return end
  held_key = names
  for _, f in ipairs(held) do f:set_value(0) end
  held = resolve(names)
  for _, f in ipairs(held) do f:set_value(1) end
end

-- THE AUTOPILOT.  Owner's routine: bottom-centre, hold the shot, move left and
-- right A LITTLE.  12 logic frames per leg -> the ship stays inside roughly the
-- middle third of the playfield and never walks off to one side, because the
-- four legs are C / CL / C / CR and the L and R legs are the same length.
local MOVE_LEGS = { "C", "CL", "C", "CR" }
local function autopilot(n)
  if n < FIRE_FROM then return nil end
  if n < MOVE_FROM then return "C" end
  return MOVE_LEGS[(math.floor((n - MOVE_FROM) / 12) % 4) + 1]
end

local coin_until = -1
local function apply_input(n)
  -- a scripted coin pulse wins for 10 frames so a credit can be inserted even
  -- while the autopilot is holding fire (W17_COIN_EVERY, default OFF)
  if COIN_EVERY > 0 and n >= FIRE_FROM and (n % COIN_EVERY) == 0 then
    coin_until = n + 10
  end
  if n <= coin_until then set_held("N"); return end
  local a = autopilot(n)
  if a then set_held(a); return end
  local s = script[n]
  if s then set_held(s) end
end

local lf, done, lastbuild = 0, false, -1
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- ---------------------------------------------------- (1) THE HUNTED WRITERS
-- Every entry: name -> { count, pcs = {pc -> n}, first = {lf, pc, val}, log }
local HUNT = {}
local function hunter(name, lo, hi, logcap)
  local h = { n = 0, pcs = {}, log = {}, cap = logcap or 24 }
  HUNT[name] = h
  TAPS[#TAPS + 1] = PROG:install_write_tap(lo, hi, "h" .. name,
    function(offset, data, mask)
      local pc = CPU.state["CURPC"].value & 0xffffff
      h.n = h.n + 1
      bump(h.pcs, string.format("%06X", pc))
      if #h.log < h.cap then
        -- the CLOCK is on every line: a record execution is only interpretable
        -- against $8130CE, which is what the interpreter matches on ($262062).
        h.log[#h.log + 1] = string.format("lf%d/clk%04X@%06X:%06X=%04X/m%04X",
          lf, RAM:read_u16(0x130ce), pc, offset, data & 0xffff, mask & 0xffff)
      end
      return data
    end)
end

-- the four UNKNOWN-writer addresses the plan names (20-plan §2 W17, §7 item 8)
hunter("extfreeze_81317E", 0x81317E, 0x81317F, 32)   -- external freeze  ($8,A5)
hunter("extspeed_813180",  0x813180, 0x813185, 32)   -- external speed override
hunter("b03c",             0x80B03C, 0x80B03F, 32)   -- $24179E's compensation
hunter("gate_8130DA",      0x8130DA, 0x8130DB, 32)   -- BG-element kill gate
-- the scroll program's own execution, made visible.  $262092 `move.l A1,(A6)`
-- runs ONLY after a record has been dispatched, so these two are exact
-- per-record execution ledgers.  Stage 1 has 41 script-0 + 16 script-1 records
-- and executes 57 of them (20-recon-scroll-engine §4/§5) -- that is the
-- DENOMINATOR this run is measured against, so the cap is above it.
hunter("vm0cursor_813192", 0x813192, 0x813195, 400)  -- one write per script-0 record
hunter("vm1cursor_8131AA", 0x8131AA, 0x8131AD, 200)  -- one write per script-1 record
hunter("vm0repeat_81319E", 0x81319E, 0x8131A9, 64)   -- op-$04 rewind/len/cnt/loop
hunter("cuearm_8131C2",    0x8131C2, 0x8131C7, 32)   -- op-$14 sub-op 0
-- can the stage END?
hunter("stage_813092",     0x813092, 0x813097, 32)   -- loop / stage / stage*4
hunter("clock_8130CE",     0x8130CE, 0x8130CF, 24)   -- who writes the odometer
hunter("alldead_8130D2",   0x8130D2, 0x8130D3, 32)   -- 20-recon §6 calls this
  -- "every player is dead" ($25FD82 set / $25FD8C clear).  Pass 1 of this wave
  -- measured it HIGH for 308 frames at the end of the boss lock with $8130BE
  -- (lives) never moving -- so either that name is incomplete or a banner
  -- object ($288AD0) set it.  A PC on the write settles it; an inference does
  -- not, and this project has promoted an inference into a fact twice.

-- --------------------------------------------------------------------------
-- CHEAP RIDERS.  Each of these is a "one tap, assigned to a later wave" item
-- in 20-plan §7 item 8 / §3.  The 16,000-frame session is already being paid
-- for; carrying them costs nothing and converts a named blocker into either a
-- writer or a written-down absence over the WHOLE stage.  Nothing here is
-- ported by this wave -- these are evidence for W26/W28/W31.
hunter("f3098_813098",     0x813098, 0x813099, 24)   -- W31: the fan gate. No
  -- frame this project has ever measured held it non-zero; a whole-stage write
  -- tap is the widest net yet cast at it.
hunter("bias_813160",      0x813160, 0x813161, 24)   -- W31: global bullet-speed
hunter("bias_812950",      0x812950, 0x812951, 24)   -- W31: global bullet-speed
hunter("window_81B414",    0x81B414, 0x81B41B, 32)   -- W26: active-window ladder
hunter("reaim_803910",     0x803910, 0x803911, 24)   -- W28: re-aim gate
hunter("phit_80FA7E",      0x80FA7E, 0x80FA7F, 24)   -- W28: the A4 identity

-- --------------------------------------------------------------------------
-- THE BG-ELEMENT CONSTRUCTION LEDGER.  $262366's 8-slot table lives at
-- $8131C8, $20 bytes per slot (the handler table pointer $8132C8 sits exactly
-- 8*$20 above it -- an independent check on both numbers).  Every one of the
-- 13 stage-1 constructors writes the per-frame updater pointer at (+$8) -- e.g.
-- $2623B2 `move.l #$2623C2,($8,A6)`.  Filtering the slot table's writes to
-- offset ($20k + 8) therefore yields EVERY element birth and death, with its
-- handler address, against the logic frame.  Stage 1 has 8 op-$10 records in
-- its script but the table has 13 entries and the recon says ids 0..12 are
-- each used once (20-recon-scroll-engine §5) -- pass 1 measured only FIVE
-- slots ever occupied, so this ledger is what tells W18 which of those two
-- readings is right.
ELEM = { n = 0, log = {} }
TAPS[#TAPS + 1] = PROG:install_write_tap(0x8131C8, 0x8132C7, "elem",
  function(offset, data, mask)
    if ((offset - 0x8131C8) % 0x20) < 8 or ((offset - 0x8131C8) % 0x20) > 0xB then
      return data
    end
    ELEM.n = ELEM.n + 1
    if #ELEM.log < 96 then
      ELEM.log[#ELEM.log + 1] = string.format(
        "lf%d/clk%04X@%06X slot%d+%X=%04X", lf, RAM:read_u16(0x130ce),
        CPU.state["CURPC"].value & 0xffffff,
        math.floor((offset - 0x8131C8) / 0x20), (offset - 0x8131C8) % 0x20,
        data & 0xffff)
    end
    return data
  end)

-- ------------------------------------------------ (1b) VRAM WRITE COUNTERS
-- Columns 5/6/7 of the bgrecon row.  The BG count is the column writer
-- ($240D76, 9 longwords per map column); the rowscroll count is the one that
-- matters -- wave 10 proved rowscroll quiet over 13,600 frames of the OPENING,
-- and L5's claim is only as wide as the frames it was taken over.
local wr_bg, wr_rs = {}, {}
local pf_bg, pf_tx, pf_rs = 0, 0, 0
local max_bg, max_rs = 0, 0

TAPS[#TAPS + 1] = PROG:install_write_tap(0x900000, 0x903FFF, "wbg",
  function(offset, data, mask)
    bump(wr_bg, string.format("%06X", CPU.state["CURPC"].value & 0xffffff))
    pf_bg = pf_bg + 1
    return data
  end)
TAPS[#TAPS + 1] = PROG:install_write_tap(0x904000, 0x905FFF, "wtx",
  function(offset, data, mask) pf_tx = pf_tx + 1; return data end)
TAPS[#TAPS + 1] = PROG:install_write_tap(0x907000, 0x907FFF, "wrs",
  function(offset, data, mask)
    bump(wr_rs, string.format("%06X=%04X", CPU.state["CURPC"].value & 0xffffff,
                              data & 0xffff))
    pf_rs = pf_rs + 1
    return data
  end)

-- ------------------------------------------------- (2) VIDEO REGISTER CENSUS
local reg_vals = {}
local function regtap(addr, name)
  TAPS[#TAPS + 1] = PROG:install_write_tap(addr, addr + 1, "r" .. name,
    function(offset, data, mask)
      if name == "scale" or name == "ctrl" then
        bump(reg_vals, string.format("%s=%04X", name, data & 0xffff))
      end
      return data
    end)
end
regtap(0xb04000, "scale"); regtap(0xb0e000, "ctrl")

-- ------------------------------------------------------- (3) THE SAMPLE POINT
local REL = { [0x13C806] = true, [0x23C46C] = true }
local rs_shapes, scale_seen, ctrl_seen = {}, {}, {}
local clock_hi, boss_lf, elem_hist = -1, -1, {}
local resets = 0
local last_d0ce = -1

local function rowscroll_shape()
  local distinct, nz, mn, mx = 0, 0, 0xffff, 0
  local seen = {}
  for y = 0, 223 do
    local v = ROWS:read_u16(y * 2)
    if not seen[v] then seen[v] = true; distinct = distinct + 1 end
    if v ~= 0 then nz = nz + 1 end
    if v < mn then mn = v end
    if v > mx then mx = v end
  end
  return distinct, nz, mn, mx
end

-- the 8-slot BG-element table, $8131C8, $20 bytes per slot ($262366).  A slot
-- is LIVE when its ($8,slot) per-frame updater pointer is non-zero -- that is
-- the field every one of the 13 stage-1 constructors writes ($2623B2).
local function elem_mask()
  local m, n = 0, 0
  for s = 0, 7 do
    if RAM:read_u32(0x131C8 + s * 0x20 + 8) ~= 0 then
      m = m | (1 << s); n = n + 1
    end
  end
  return m, n
end

TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf
      apply_input(lf)

      -- THE INTERVENTION, applied at the board's own sample point so it lands
      -- at the same instant every frame (replay determinism, knowledge/08).
      -- POKE_FROM <= 0 means NO INTERVENTION.  `>= POKE_FROM` alone would poke
      -- from frame 0 and make --no-invuln the most invulnerable run of all --
      -- a control that cannot go red is not a control.
      if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end

      local scale = PROG:read_u16(0xb04000)
      local ctrl  = PROG:read_u16(0xb0e000)
      bump(scale_seen, string.format("%04X", scale))
      bump(ctrl_seen, string.format("%04X", ctrl))
      local d, nz, mn, mx = rowscroll_shape()
      bump(rs_shapes, string.format("d%d/nz%d/mn%04X/mx%04X", d, nz, mn, mx))

      local b012 = RAM:read_u32(0xb012)
      local b016 = RAM:read_u32(0xb016)
      local b034 = RAM:read_u32(0xb034)
      local b038 = RAM:read_u32(0xb038)
      local b054 = RAM:read_u16(0xb054)
      local b056 = RAM:read_u16(0xb056)
      local d176 = RAM:read_u16(0x13176)
      local d16e = RAM:read_u16(0x1316e)
      local d0ce = RAM:read_u16(0x130ce)
      local d096 = RAM:read_u16(0x13096)
      local d18a = RAM:read_u16(0x1318a)
      local d18c = RAM:read_u16(0x1318c)
      local d186 = RAM:read_u16(0x13186)
      local d0d2 = RAM:read_u16(0x130d2)

      -- ---- wave-17 fields, columns 26.. (append only; 1..25 are bgrecon's)
      local emask, ecount = elem_mask()
      bump(elem_hist, string.format("%02X", emask))
      if d0ce > clock_hi then clock_hi = d0ce end
      if boss_lf < 0 and d0ce == 0x0344 then boss_lf = lf end
      if last_d0ce > 0x40 and d0ce == 0 then
        resets = resets + 1
        p("RESET clock returned to 0 at lf=%d (was %04X)", lf, last_d0ce)
      end
      last_d0ce = d0ce

      if fh then
        fh:write(string.format(
          -- 1..25: bgrecon.lua:181, unchanged order
          "%d\t%d\t%04X\t%04X\t%d\t%d\t%d\t%08X\t%08X\t%08X\t%08X\t%04X\t%04X\t" ..
          "%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%d\t%d\t%04X\t%04X" ..
          -- 26..44: wave 17
          "\t%04X\t%04X\t%04X\t%04X\t%08X\t%08X\t%08X\t%02X\t%d" ..
          "\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%08X\t%08X" ..
          -- 44..49: the cheap riders, so a later wave can read them per-frame
          "\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\n",
          lf, SCR:frame_number(), scale, ctrl, pf_bg, pf_tx, pf_rs,
          b012, b016, b034, b038, b054, b056,
          d176, d16e, d0ce, d096, d18a, d18c, d186, d0d2,
          d, nz, PROG:read_u16(0xb03000), PROG:read_u16(0xb02000),
          -- 26 $813190 fast-forward   27 $8130DA element gate
          RAM:read_u16(0x13190), RAM:read_u16(0x130da),
          -- 28 $81317E ext freeze     29 $813180 ext speed flag
          RAM:read_u16(0x1317e), RAM:read_u16(0x13180),
          -- 30 $813192 script-0 record cursor  31 $8131AA script-1 cursor
          RAM:read_u32(0x13192), RAM:read_u32(0x131aa),
          -- 32 $80B03C   33 elem live mask   34 elem live count
          RAM:read_u32(0xb03c), emask, ecount,
          -- 35 $813092 loop  36 $813094  37 $813096 stage*4  38 $813098
          RAM:read_u16(0x13092), RAM:read_u16(0x13094),
          RAM:read_u16(0x13096), RAM:read_u16(0x13098),
          -- 39 $81309E rank  40 $8130BE P1 lives  41 $8130FA P1 life state
          RAM:read_u16(0x1309e), RAM:read_u16(0x130be), RAM:read_u16(0x130fa),
          -- 42 $81B626 boss HP  43 $81B62A boss HP2
          RAM:read_u32(0x1b626), RAM:read_u32(0x1b62a),
          -- 44..47 $81B414..$81B41A the bullet active-window ladder (W26)
          RAM:read_u16(0x1b414), RAM:read_u16(0x1b416),
          RAM:read_u16(0x1b418), RAM:read_u16(0x1b41a),
          -- 48 $812950  49 $813160  the two global bullet-speed biases (W31)
          RAM:read_u16(0x12950), RAM:read_u16(0x13160)))
      end
      if pf_bg > max_bg then max_bg = pf_bg end
      if pf_rs > max_rs then max_rs = pf_rs end
      pf_bg, pf_tx, pf_rs = 0, 0, 0
    end
    return data
  end)

local function hist(t, n)
  local ks = {}
  for k in pairs(t) do ks[#ks + 1] = k end
  table.sort(ks, function(a, b) return t[a] > t[b] end)
  local out = {}
  for i = 1, math.min(n or 40, #ks) do
    out[#out + 1] = string.format("%s:%d", ks[i], t[ks[i]])
  end
  return table.concat(out, " "), #ks
end

local function finish()
  local s, n
  s, n = hist(scale_seen, 8);  p("CENSUS bg_scale at sample point (%d) %s", n, s)
  s, n = hist(ctrl_seen, 8);   p("CENSUS ctrl at sample point (%d) %s", n, s)
  s, n = hist(reg_vals, 12);   p("CENSUS scale/ctrl values written (%d) %s", n, s)
  s, n = hist(rs_shapes, 6);   p("CENSUS rowscroll[0..223] shape (%d) %s", n, s)
  s, n = hist(elem_hist, 20);  p("CENSUS BG-element live mask (%d) %s", n, s)
  s, n = hist(wr_bg, 12);      p("CENSUS bgvram writer PCs (%d) max/lf=%d %s", n, max_bg, s)
  s, n = hist(wr_rs, 12);      p("CENSUS rowscroll writers (%d) max/lf=%d %s", n, max_rs, s)

  -- the hunt, one line per address, ALWAYS printed even at zero -- a silent
  -- absence is what this wave exists to convert into a written-down absence.
  local names = {}
  for k in pairs(HUNT) do names[#names + 1] = k end
  table.sort(names)
  for _, k in ipairs(names) do
    local h = HUNT[k]
    local pcs = hist(h.pcs, 12)
    p("HUNT %-18s writes=%d pcs=[%s]", k, h.n, pcs)
    for _, l in ipairs(h.log) do p("HUNTLOG %s %s", k, l) end
  end

  p("ELEM slot-table (+8..+B) writes=%d", ELEM.n)
  for _, l in ipairs(ELEM.log) do p("ELEMLOG %s", l) end

  p("STAGE clock_high=%04X boss_lock_lf=%d resets=%d", clock_hi, boss_lf, resets)

  local fails = 0
  if lf == 0 then p("FAIL no logic frame completed"); fails = fails + 1 end
  if WANT then
    local want = (WANT == "B") and 2 or 1
    if lastbuild ~= want then
      p("FAIL last logic frame armed from build %d, wanted %s", lastbuild, WANT)
      fails = fails + 1
    end
  end
  if fh then fh:close() end
  p("DONE logicframes=%d videoframes=%d fails=%d", lf, SCR:frame_number(), fails)
  M:exit()
end

SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then done = true; finish() end
end)
