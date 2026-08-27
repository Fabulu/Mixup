# W624: adopt W623's exact operator window in the complete route gates

Status: focused progression set **14/14**, green, no skips. Independent exact metadata set **9/9** green, with five intentionally filtered route cases, plus one independently replayed complete ship-2/style-2 route through terminal reset. No gameplay source changes.

## Cause

W623 added the disjoint cartridge window `$259512 + $08`, the exact eight-byte factory operator block copied to battery-backed main RAM. The current export therefore moved from 941 windows and 457,059 declared bytes to 942 windows and 457,067 bytes. Overlap pairs remain exactly 77.

The complete W590, W595, and W619 route gates deliberately reject a different table identity before stepping. Their fixtures still named the pre-W623 table, so every current ROM-backed route stopped at validation even though the new window is used only by cabinet-front-end cold boot.

## Exact adoption

The stale identities changed as follows:

| table shape | old | current |
|---|---|---|
| live | `1b5e97385bc33328b5ce9b3e253b91f61576f4ffe2dd6311ef80542edfb1a6e9`, 941 windows, 457,059 bytes | `02c3aea71c84407cdb17bfa454ddc3abac4a62171ec59c627f4d99f3cb9f439e`, 942 windows, 457,067 bytes |
| W590 W588 reconstruction | `e6375da211814c6ff3bbbb3bfcaddb88fbd5f2dd93894008191e68aa0cdc19b2`, 854 windows, 452,789 bytes | `5dd4830d8759db1fbfbeddef529225a76b264739a9c7375ba00f2be5ce47a837`, 855 windows, 452,797 bytes |
| W590 checkpoint reconstruction | `e950e18d5a41eb205405d216e00f683fbaecf4a72d2042e54e74336089e191b1`, 851 windows, 452,689 bytes | `ba6dfc5a6d50f7f5303452fa8341c6139fe99d4cc6a944e23182144a9c7a8741`, 852 windows, 452,697 bytes |
| W595 reconstruction | `18fd1b8ac5c4b066e1d310d10da39d363f8a848e2a40b1894a040a0cd12a82c8`, 906 windows, 453,757 bytes | `706201adef09d00737f1fafc687e52d12ab81f437bc842690af229afab258445`, 907 windows, 453,765 bytes |
| pre-W595 reconstruction | `b062e45b4c4ca0488a0c4660a83a9d868feaf8b6d00b670d1de9948481f3f7c3`, 906 windows, 453,741 bytes | `83ffbc84cbaec6b527bf784e1e3b3ba8c9b893546252a135ca5db34a7c64a23d`, 907 windows, 453,749 bytes |

W590 preserves the stored checkpoint's original `e950e18d...` provenance, proves an in-memory adoption changes only its table identity, and then restores against the reconstructed and live tables. No stored checkpoint was rewritten.

The route fixture files change only `tables.sha256`, `tables.windows`, and `tables.bytes`. Route periodic hashes, terminal RAM hashes, terminal game hashes, step counts, topology, cadence, seed identity, and checkpoint payloads remain exact and unchanged.

## Focused gate

```text
node --test --test-concurrency=1 games/ddpdoj/tests/w590round2ending.test.js games/ddpdoj/tests/w595ship0style2route.test.js games/ddpdoj/tests/w619remaininground2routes.test.js games/ddpdoj/tests/w619ship0style6route.test.js games/ddpdoj/tests/w619ship2style2route.test.js games/ddpdoj/tests/w619ship2style4route.test.js games/ddpdoj/tests/w619ship2style6route.test.js
```

Result: **14/14 passed, zero failures, zero skips**. This includes the exact 0/4 checkpoint continuation, the fresh ship-0/style-2 route, and all four fresh W619 routes through both loops and terminal reset.

The coordinator independently reran the W590 checkpoint, W595 reconstruction, all strict offline fixture and mutation checks, static closure, and each fixture identity. Those nine selected checks passed. A separate fresh ship-2/style-2 replay then completed both loops through terminal reset in 574,367 ms. The filtered verifier invocations reported only their deliberate name-filter skips; the authoritative focused gate above had none.

No generated cartridge asset, ROM export, saved checkpoint, exact board checkpoint, gameplay implementation, or untracked file changed.
