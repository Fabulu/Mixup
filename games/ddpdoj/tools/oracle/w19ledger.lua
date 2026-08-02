-- w19ledger.lua -- WAVE 19: the SCORE / CHAIN / RANK ledger, measured.
--
-- ===================== WHAT THIS RUN IS =====================================
-- A PLAYING run of stage 1 (docs/knowledge/09 and
-- `20-OWNER-scenarios-must-play.md`): the autopilot FIRES from W19_FIRE_FROM,
-- kills things, drifts left and right, and BOMBS on a schedule
-- (W19_BOMB_EVERY logic frames) -- because the bomb is the one rank DEBIT the
-- owner names by hand ("one wrong rank gain from using super").
--
-- THE ONE INTERVENTION, NAMED: invulnerability, `$810424 := $FF` at the board's
-- own sample point from W19_POKE_FROM, exactly as `w17stage.lua` does it.  Set
-- W19_POKE_FROM=0 for the on-distribution control.  With the poke this run is
-- VALID FOR IDENTIFYING WHICH WORD IS WHICH AND WHICH PC WRITES IT (a coverage
-- question) and INVALID for pacing, chain length or rank trajectory.  Every
-- number taken from it must say "invulnerable" out loud.
--
-- ===================== WHY WRITE TAPS ======================================
-- `00-recon-hard` §3: on the 68000 CURPC does NOT identify an opcode fetch and
-- a read tap only proves PREFETCH.  A WRITE tap with CURPC is the reliable
-- execution hook, and it is the only way to turn "these 9 `lea` sites mention
-- $81B4C4" into "these 3 PCs actually wrote it, this many times".
--
-- Lua tap handles live in a GLOBAL (`TAPS`); a local handle is garbage
-- collected and the tap then SILENTLY STOPS FIRING.
--
-- ENV: W19_FRAMES W19_INPUT W19_TSV W19_POKE_FROM W19_FIRE_FROM W19_MOVE_FROM
--      W19_BOMB_EVERY W19_REQUIRE_BUILD
local TAG = "PROBE "
local function p(...) print(TAG .. string.format(...)) end

local M    = manager.machine
local CPU  = M.devices[":maincpu"]
local PROG = CPU.spaces["program"]
local SCR  = M.screens[":screen"]
local RAM  = M.memory.shares[":sram"]

TAPS, SUBS = {}, {}                    -- GLOBALS: see the header

local RUN        = tonumber(os.getenv("W19_FRAMES")     or "4600")
local POKE_FROM  = tonumber(os.getenv("W19_POKE_FROM")  or "1250")
local FIRE_FROM  = tonumber(os.getenv("W19_FIRE_FROM")  or "1800")
local MOVE_FROM  = tonumber(os.getenv("W19_MOVE_FROM")  or "1900")
local BOMB_EVERY = tonumber(os.getenv("W19_BOMB_EVERY") or "600")
local WANT       = os.getenv("W19_REQUIRE_BUILD")
local TSV        = os.getenv("W19_TSV")
local fh         = TSV and io.open(TSV, "w") or nil

p("SCENARIO PLAYING: autoshot from lf%d, drift from lf%d, BOMB every %d lf",
  FIRE_FROM, MOVE_FROM, BOMB_EVERY)
p("INTERVENTION invuln=$810424:=$FF from lf%d (0 = none)", POKE_FROM)

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
for item in (os.getenv("W19_INPUT") or ""):gmatch("[^;]+") do
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

-- The owner's own routine (docs/knowledge/09): bottom-centre, hold the shot,
-- drift a little left and right.  B (P1 Button 2) is the BOMB ($2497FE), held
-- for 4 frames every BOMB_EVERY so the press has an edge the game can see.
local MOVE_LEGS = { "C", "CL", "C", "CR" }
local bombs_pressed = 0
local function autopilot(n)
  if n < FIRE_FROM then return nil end
  local base = (n < MOVE_FROM) and "C"
    or MOVE_LEGS[(math.floor((n - MOVE_FROM) / 12) % 4) + 1]
  if BOMB_EVERY > 0 and n >= MOVE_FROM and ((n - MOVE_FROM) % BOMB_EVERY) < 4 then
    if ((n - MOVE_FROM) % BOMB_EVERY) == 0 then bombs_pressed = bombs_pressed + 1 end
    return base .. "B"
  end
  return base
end

local function apply_input(n)
  local a = autopilot(n)
  if a then set_held(a); return end
  local s = script[n]
  if s then set_held(s) end
end

local lf, lastbuild = 0, -1
local function bump(t, k) t[k] = (t[k] or 0) + 1 end

-- --------------------------------------------- THE WRITER CENSUS, BY REGION
-- One entry per named region: total writes, a PC histogram, and a bounded log
-- of the first N with the logic frame and the value.  The PC histogram is the
-- product: it converts the static `lea`/`abs` census (a LOWER BOUND, because
-- xref.py cannot see base-register addressing) into "these PCs actually ran".
local HUNT, ORDER = {}, {}

-- ORDER WITHIN A FRAME (`20-OWNER-scoring-must-be-exact.md` §2: "possibly
-- sub-frame" means a frame is NOT atomic).  Every tap below appends a tag to
-- `seq`, which is emptied at the sample point.  A frame's sequence is therefore
-- the EXACT order in which the ledger moved inside that frame, and that is the
-- thing a port cannot retrofit.  Only the interesting PCs get a short tag; the
-- rest are dropped so a frame's line stays readable.
local TAGS = {
  [0x2607E4] = "rankclk",     -- $2607E4 addq.l #1,$8130C6      the rank clock
  [0x260944] = "rank=",       -- $260944 move.w D1,$81309E      the recompute
  [0x2863B2] = "CHAIN+",      -- $2863B2 the BCD chain-counter increment
  [0x286320] = "CHAIN0",      -- $286320 clr.w $81B5DA          chain reset
  [0x28664E] = "meter+",      -- $28664E add.w D0,$81B5C0       a hit refills
  [0x286664] = "meter=cap",   -- $286664 $81B5C0 := $81B5B2
  [0x284636] = "meter-",      -- $284636 subq.w #1,$81B5C0      THE DECREMENT
  [0x284640] = "CHAINEND",    -- $28463E/$284640 the meter hit 0
  [0x28662C] = "score+",      -- $28662C the BCD adder's scratch store
  [0x249F2C] = "flushP1",     -- $249F2C $8128F6 -> the P1 pending long
  [0x249F6A] = "flushP2",     -- $249F6A $812904 -> the P2 pending long
  [0x28431E] = "drain",       -- $28431E pending -> total
  [0x284370] = "drain0",      -- $284370 clear the pending
  [0x2845CC] = "brkT",        -- $2845CC the chain-BREAK display countdown
}
local seq, seqframes, SEQ_WANT = {}, {}, 40

local function hunter(name, lo, hi, logcap)
  local h = { n = 0, pcs = {}, log = {}, cap = logcap or 24, lo = lo, hi = hi }
  HUNT[name] = h; ORDER[#ORDER + 1] = name
  TAPS[#TAPS + 1] = PROG:install_write_tap(lo, hi, "h" .. name,
    function(offset, data, mask)
      local pc = CPU.state["CURPC"].value & 0xffffff
      h.n = h.n + 1
      bump(h.pcs, string.format("%06X+%X", pc, offset - lo))
      local t = TAGS[pc]
      if t then
        -- the four `abcd`s of $286626 are four separate writes of ONE add, so
        -- collapse a repeat of the same tag rather than printing it four times
        if seq[#seq] ~= t then seq[#seq + 1] = t end
      end
      if #h.log < h.cap then
        h.log[#h.log + 1] = string.format("lf%d@%06X:%06X=%04X/m%04X",
          lf, pc, offset, data & 0xffff, mask & 0xffff)
      end
      return data
    end)
end

-- SCORE.  $81B440..$81B44F: the three candidate TOTAL longs plus the two
-- overflow words $81B44C/$81B44E that $284328 `addq.w #1,(A6)` bumps and
-- $284336 caps at 9 with the score pinned to $99999999.
hunter("score_total_81B440", 0x81B440, 0x81B44F, 40)
-- $81B4C0..$81B4CB: the PENDING longs $286626 adds into (A0 = $81B4C4 under
-- `btst #4,D1` and $81B4C8 under `btst #3,D1`, $2860F8/$28611C), and the ones
-- $2842B0 drains ($81B4C0 for D7=0, $81B4C4 for D7=1).  Which of those two
-- pairings is P1 is EXACTLY what this tap settles.
hunter("score_pend_81B4C0", 0x81B4C0, 0x81B4CB, 60)
-- $8128F4..$81290B: the per-weapon pending block $249F16/$249F54 flush into
-- the pending longs ($8128F6 -> $81B4C4, $812904 -> $81B4C8).
hunter("wpn_pend_8128F4",   0x8128F4, 0x81290B, 60)
-- and the flush RATE LIMITER: $812914/$812918, reloaded from $812916/$81291A.
hunter("flush_timer_812914", 0x812914, 0x81291B, 40)
-- the $286626 BCD scratch.  It is written on EVERY score add (`move.l D0,(A1)+`
-- at $28662C), so its count is the total number of score adds in the run and
-- its PC histogram is the per-caller breakdown -- the denominator this wave
-- exists to produce, taken dynamically.
hunter("bcd_scratch_81B5AA", 0x81B5AA, 0x81B5AD, 40)

-- CHAIN.  $81B5B0..$81B60F covers BOTH players' chain blocks as read out of
-- $2862C6 (P1-side) and $286476 (P2-side): the counters $81B5DA/$81B604, the
-- meters $81B5C0/$81B5EA, the four timers each, and the per-hit accumulators.
hunter("chain_blk_81B5B0",  0x81B5B0, 0x81B60F, 90)
-- the high-water marks $81B632/$81B634 ($2863C2/$286572), the presence words
-- $81B63E/$81B640, the POWER words $81B646/$81B648 (the rank term), and the
-- hyper words $81B654/$81B65C.
hunter("chain_hi_81B630",   0x81B630, 0x81B65F, 60)

-- RANK.  $8130C6 is the 24.8 rank clock ($2607E4 `addq.l #1` is its only
-- increment in the whole of build B, $259DCE its only reset); $81309E is the
-- rank itself; $8130A0..$8130BD are the eleven bytes $260984..$260A18 fans it
-- out into.  The clock ticks EVERY frame, so its log cap is tiny and only the
-- PC histogram matters.
hunter("rank_clock_8130C6", 0x8130C6, 0x8130C9, 6)
hunter("rank_81309E",       0x81309E, 0x81309F, 12)
hunter("rank_fan_8130A0",   0x8130A0, 0x8130BD, 6)

-- ------------------------------------------------------- THE SAMPLE POINT
local REL = { [0x13C806] = true, [0x23C46C] = true }
local frames_on = {}

TAPS[#TAPS + 1] = PROG:install_write_tap(0x803940, 0x803941, "sem",
  function(offset, data, mask)
    local pc = CPU.state["CURPC"].value & 0xffffff
    if REL[pc] then return data end
    local newv = ((mask & 0xff00) ~= 0) and ((data >> 8) & 0xff) or (data & 0xff)
    if RAM:read_u8(0x3940) == 0 and newv ~= 0 then
      lf = lf + 1
      lastbuild = (pc >> 20) & 0xf
      bump(frames_on, string.format("%06X", pc))
      -- THE FRAME'S ORDER, harvested BEFORE the input is applied.  A frame is
      -- kept only if it moved at least three different parts of the ledger --
      -- an all-`rankclk` line says nothing and 4,600 of them would bury the
      -- ones that do.
      if #seqframes < SEQ_WANT and #seq >= 3 then
        local distinct = {}
        for _, t in ipairs(seq) do distinct[t] = true end
        local nd = 0
        for _ in pairs(distinct) do nd = nd + 1 end
        if nd >= 3 then
          seqframes[#seqframes + 1] = string.format("lf%d chain=%04X meter=%04X: %s",
            lf, RAM:read_u16(0x1b5da), RAM:read_u16(0x1b5c0),
            table.concat(seq, " > "))
        end
      end
      seq = {}
      apply_input(lf)
      if POKE_FROM > 0 and lf >= POKE_FROM then RAM:write_u8(0x10424, 0xff) end
      if fh then
        fh:write(string.format(
          "%d\t%d" ..
          -- 3..8  the three total longs and the two overflow words
          "\t%08X\t%08X\t%08X\t%04X\t%04X" ..
          -- 8..10 the three pending longs
          "\t%08X\t%08X\t%08X" ..
          -- 11..14 the weapon pending words/longs and the flush timers
          "\t%04X\t%08X\t%04X\t%08X\t%04X\t%04X" ..
          -- 17..22 P1 chain: counter, meter, cap, and three timers
          "\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X" ..
          -- 23..26 P2 chain counter/meter, the two high-water marks
          "\t%04X\t%04X\t%04X\t%04X" ..
          -- 27..32 presence, power, hyper, rank clock, rank, stage/loop
          "\t%04X\t%04X\t%04X\t%04X\t%04X\t%04X\t%08X\t%04X\t%04X\t%04X\t%04X\n",
          lf, SCR:frame_number(),
          RAM:read_u32(0x1b440), RAM:read_u32(0x1b444), RAM:read_u32(0x1b448),
          RAM:read_u16(0x1b44c), RAM:read_u16(0x1b44e),
          RAM:read_u32(0x1b4c0), RAM:read_u32(0x1b4c4), RAM:read_u32(0x1b4c8),
          RAM:read_u16(0x128f4), RAM:read_u32(0x128f6),
          RAM:read_u16(0x12902), RAM:read_u32(0x12904),
          RAM:read_u16(0x12914), RAM:read_u16(0x12918),
          RAM:read_u16(0x1b5da), RAM:read_u16(0x1b5c0), RAM:read_u16(0x1b5b2),
          RAM:read_u16(0x1b5c2), RAM:read_u16(0x1b5c4), RAM:read_u16(0x1b5c8),
          RAM:read_u16(0x1b604), RAM:read_u16(0x1b5ea),
          RAM:read_u16(0x1b632), RAM:read_u16(0x1b634),
          RAM:read_u16(0x1b63e), RAM:read_u16(0x1b640),
          RAM:read_u16(0x1b646), RAM:read_u16(0x1b648),
          RAM:read_u16(0x1b654), RAM:read_u16(0x1b65c),
          RAM:read_u32(0x130c6), RAM:read_u16(0x1309e),
          RAM:read_u16(0x13092), RAM:read_u16(0x13098),
          RAM:read_u16(0x130d2)))
      end
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
  local s, n = hist(frames_on, 6)
  p("BUILD arm pcs (%d) %s   last=%X", n, s, lastbuild)
  for _, name in ipairs(ORDER) do
    local h = HUNT[name]
    local ps, np = hist(h.pcs, 24)
    p("WRITERS %-22s $%06X..$%06X  writes=%d  distinct_pc+off=%d",
      name, h.lo, h.hi, h.n, np)
    if h.n > 0 then p("  PCS %s", ps) end
    for _, l in ipairs(h.log) do p("  LOG %s", l) end
  end
  -- ORDER WITHIN A FRAME.  Read these as the answer to the owner note's §2.
  for _, l in ipairs(seqframes) do p("SEQ %s", l) end
  p("SEQ frames_kept=%d (of a %d cap; a frame is kept when >=3 DISTINCT ledger "
    .. "tags fired in it)", #seqframes, SEQ_WANT)
  p("BOMBS pressed=%d", bombs_pressed)
  p("FRAMES lf=%d", lf)
  if fh then fh:close() end
end

local done = false
SUBS[#SUBS + 1] = emu.add_machine_frame_notifier(function()
  if lf >= RUN and not done then
    done = true
    finish()
    p("DONE logicframes=%d videoframes=%d", lf, SCR:frame_number())
    M:exit()
  end
end)
