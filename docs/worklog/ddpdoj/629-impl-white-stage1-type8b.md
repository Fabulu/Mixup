# Task #275: White Label Stage 1 Type $8B

Status: **green for the focused source and table acceptance set**. White Label now runs Type `$8B` through the same descriptor-selected initializer, handler, Pool A kind-2 lifecycle, and Pool B effect algorithm as Black Label while retaining edition-private addresses and data.

## Edition descriptors and allocator ownership

Both editions expose recursively frozen `enemyTypes[0x8b]` descriptors with algorithm `type8B`. The descriptor owns the init stub and body, handler, prototypes, scroll compensation, score and effects graph, Pool A resources and kind, death effect, sound, and free-enemy retirement entry. Initializer and handler maps select both editions by algorithm, so White addresses never enter the Black map and Black addresses never enter the White map.

Black Pool A ownership is now explicit at both levels:

- Top-level Type `$8B` allocation uses `$27F8EE`, `general-seventy`, with fill `$27F8F0`.
- Nested Type `$8A` carrier-bee allocation retains `$27F92A`, `reserved-ten`.
- White Type `$8A` and `$8B` use `$17E9A0`, `general-seventy`.

The direct tests prove Black Type `$8B` takes the first general record while Black Type `$8A` takes the first reserved record. A full general region drops the Type `$8B` item without changing the census or spilling into the final ten records.

Both descriptor families and their Pool A roots carry matching `black` or `white` edition identities. Handler preflight binds prototypes, score, effects, sound, retirement, and allocation graphs to that edition before gameplay mutation. Generic White allocation validates its fixed RAM arena, scroll word, dispatch, template, hook, layer, and medal-jitter tables before selecting a slot. Type `$8A` also preflights its nested bee allocator and requested death-drop kind. The static Black `$276824` init body remains in the base registry, so a partial descriptor map that replaces another algorithm cannot remove Type `$8B` accidentally.

## White kind $08 lifecycle

White kind `$08` resolves pointer `$17FED6` to template `$17FF4A` and fill hook `$17FD7C`. The hook increments RAM byte `$803917`, indexes the White 128-byte jitter table at `$143192` with `ram.u16($803916) & $7F`, adds `draw & $1F` to the blink byte with byte wrapping, clears the waypoint word, and does not initialize velocity.

The kind-2 body now takes edition resources for boss retirement, live count, freeze and scroll, player counters, score and cap, body transforms, art tables, emitters, zoom selection, movement vectors, RNG, collected continuation, and final free. White collection keeps the cartridge wrapper `$18B10A` as descriptor identity and maps it in one direction to runtime request `$28C5E4`. P1 and P2 counters remain separate, cap at `$03E7`, and award `$50` to the collecting side.

## Exact table adoption

Eight disjoint White world-runtime windows add 164 declared bytes:

- `$121528 + $08`
- `$12180E + $52`
- `$1758BE + $08`
- `$175900 + $04`
- `$175904 + $1C`
- `$17D51C + $08`
- `$17FED6 + $04`
- `$17FF4A + $16`

Measured table changes are 1,792 to 1,800 global windows and 659,565 to 659,729 declared bytes. Overlap pairs remain 79. The unique White family is 847 windows and 202,130 bytes. White world runtime is 147 windows and 17,397 bytes. The Black live projection remains 953 windows and 457,599 bytes, and the pre-White projection remains 950 windows and 457,529 bytes.

The regenerated canonical JSON identity is SHA-256 `938175b469a281751b5b597cc689f579395f460d30fbb371b8e6e5de7e6df862`. Only the 27 current-table pins were replaced. Historical reconstructed hashes remain unchanged.

Raw executable identities use exact half-open cartridge ranges:

- Init `[$1758BE,$175920)`: `2153ba01d77c266125445cb4f4206763e7a1f54ee5c7a5e44e2dec5bc4169eb3`
- Handler `[$175920,$1759E0)`: `9b78e8e623df459e8ff7a3ab4d0948d59dd199c37b60a4f70219bba6c189bc6b`

## Focused verification

The required command order began with:

1. `python games/ddpdoj/tools/export-tables.py`
2. `node games/ddpdoj/tools/export-web.mjs`
3. `python games/ddpdoj/tools/export-tables.py --verify`
4. `npm run typecheck`
5. Explicit `node --test --test-concurrency=1` files only

Regeneration reported 1,800 windows and 659,729 bytes. The browser export then regenerated the ignored packaged table from that exact source identity. Verification reported `VERIFY OK`. Typecheck passed initially and again after the init-body import-cycle repair.

Final focused results:

- `white-stage1-enemy8b.test.js`: 11/11 passed.
- `edition-profile.test.js`: 14/14 passed.
- `w443hyperbeamart.test.js`, the table-only exact `RomWindows` registry invariant: 8/8 passed.
- `w631endingproduction.test.js`: 1/1 passed after browser-table regeneration.
- `white-stage1-enemy8a.test.js`: 11/11 passed.
- `initbody.test.js`: 13/13 passed.
- `w111bee.test.js`, `w54effects.test.js`, and `handlers.test.js`: 50/50 passed together with serial concurrency.
- `w411poolakind2.test.js`: 30/30 passed after preserving its exact `$276908` refusal identity.
- Current-hash migrations `w580` through `w590`, `w595` through `w598`, and `w628`: 65/65 passed across three explicit serial groups.

The direct White fixture resolves the overlapping manifest categories to exactly 847 unique windows and tracks all runtime reads. Every observed White Type `$8B` cartridge read ended below `$200000`. It covers the natural four-enemy source block at `$130E8C`, trigger `$00B3`, movement `$1323DA`, exact prototypes, signed early clock gate, scroll lock, nonlethal and lethal paths, general allocation and full-drop behavior, jitter, ordinary and side-specific collection, cap and sound mapping, collected presentation and free, Pool B kind `$01` script drain, and refusal before RAM mutation.

The packaged browser table was regenerated after the cartridge table so both ignored artifacts carry the same canonical identity. `w631endingproduction.test.js` then passed its full browser-table equality and production ending check. No new sprite or sound asset sources were needed for Type `$8B`, and no generated asset was staged.
