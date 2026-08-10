# W222: Stage-4 boss E1/E2 first attacks

Status: COMPLETE

## Scope

Translate the two live A1 attacks selected by the completed F3 conductor:
E1 init `$2A17E6`, step `$2A17F8`, and E2 init `$2A20A8`, step `$2A20BA`.
Carry their direct bullet dependencies through the next genuine scheduler
frontier, with one focused natural-pass smoke.

## Starting state

- W221 is committed at `2fe473a`.
- F3 and concurrent MAIN1 are live on the authentic post-arrival pass.
- F3's first old-zero attack start selects E1, whose init is the next unknown.

## Delivered

- Translated the complete mirrored E1 and E2 families, including all four
  conductor parameters selected by F3.
- Preserved the immediate init fall-through, old-zero byte timers, 24-position
  selector movement, fixed and wide five-shot groups, aimed randomized
  patterns, closing expansion, and exact self-retirement.
- Preserved bank-B bullet entry selection and register construction for every
  call site. In the closing pair, the second shot retains the current high
  speed word, replaces only D0's low word with 9, then subtracts `$00040000`.
- Exported the exact shared vector/heading data, point helper, and complete E1
  through E2 ROM closure. No new sprite, palette, effect, or audio assets are
  required.

## Verification

- `node --test games/ddpdoj/tests/w222stage4boss.test.js`: 3/3 green.
- The natural F3 cadence emits the first mirrored E1 and E2 parameter-zero
  volleys in authentic order.
- The focused long smoke exercises all four parameters on both sides and stops
  loudly at A4/F4 `$2A0BCC`.
- The smoke drains the display-list staging buckets once per handler frame.
  Without that real main-loop step, hundreds of test-only draws overflowed the
  ROM's unchecked bucket-3 staging region and overwrote scheduler RAM. This was
  a harness omission, not a scheduler or gameplay defect.
- Narrow W219 through W222 integration: 10/10 green. No full suite was run.

## Result and next frontier

The Stage-4 boss now completes its entire first attack cycle, including fixed,
wide, randomized aimed, and simultaneous closing attacks from both sides. F3
retires naturally and starts A4/F4.

The next live scheduler frontier is A4/F4 init `$2A0BCC`, step `$2A0BDE`.
