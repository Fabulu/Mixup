# W625: cold-cabinet selector coverage for all six Black Label pairs

Status: **green, 1/1 focused gate and 15/15 directly affected oracle checks, with zero failures and zero skips**.

## Scope

One deterministic gate now creates a fresh production `Demo` from zero RAM for each pair in `{0,2} x {2,4,6}`. Each run uses the production coin debounce, spends the credit with START, opens the real type `$9` object, and changes both cartridge cursors with sampled direction and SHOT edges. It does not use `applyAuthenticSelection`, URL selection, direct screen calls, RAM selection writes, LF2000 seed state, a checkpoint, invulnerability, a rung, a mod, or a formation.

The gate checks the type `$9` selector commit and saved-cursor mailboxes against W592, the created and live player fields against W592, option history and first right-movement fighter art against W593, and the cached ship against W594's direct selector-reader value. It also requires the type `$2` player and type `$B` stage objects to survive after type `$9` retires. Input is driven through the production touch and coin helpers, so no browser keyboard event is introduced. Existing `KeyY` and `KeyZ` bindings are unchanged. White Label remains disabled.

## Observed production states

| pair | selector commit LF | player created LF | type `$9` retired LF | observed LF | mailbox | cached | fighter art | bombs | speed / laser floor |
|---|---:|---:|---:|---:|---|---|---|---|---|
| 0/2 | 410 | 761 | 762 | 795 | 0/2 | 0/2 | `$00001584` | 3/3 | 22/12 |
| 0/4 | 412 | 763 | 764 | 797 | 0/4 | 0/4 | `$00001584` | 2/2 | 22/16 |
| 0/6 | 414 | 765 | 766 | 799 | 0/6 | 0/6 | `$00001584` | 1/1 | 22/16 |
| 2/2 | 412 | 763 | 764 | 797 | 2/2 | 2/2 | `$00001C28` | 3/3 | 19/12 |
| 2/4 | 414 | 765 | 766 | 799 | 2/4 | 2/4 | `$00001C28` | 2/2 | 19/15 |
| 2/6 | 416 | 767 | 768 | 801 | 2/6 | 2/6 | `$00001C28` | 1/1 | 19/15 |

## Focused checks

```text
node --test --test-concurrency=1 C:/programmieren/batman/games/ddpdoj/tests/w625coldselectorpairs.test.js
```

Result: **1/1 passed, zero failures, zero skips**.

```text
node --test --test-concurrency=1 C:/programmieren/batman/games/ddpdoj/tests/w592selectorpairgate.test.js C:/programmieren/batman/games/ddpdoj/tests/w593selectoreffects.test.js C:/programmieren/batman/games/ddpdoj/tests/w594selectorcausality.test.js
```

Result: **15/15 passed, zero failures, zero skips**. No directory-wide suite, two-loop route, publication, ROM export, generated asset, checkpoint, or gameplay source was touched.
