// Shared hardware leaves proved independently for embedded Version A.

import { CAM, deferReset } from './background.js';

/** `$13C814`: clear the five Version A hardware-state words. */
export function clearWhiteHardware13C814(ram) {
  for (const address of [0x80392e, 0x803932, 0x803934, 0x803936, 0x803938]) {
    ram.setU16(address, 0);
  }
}

/** `$140E5C`: reset both cameras without Build B's two shake-word clears. */
export function camReset140E5C(ram) {
  ram.setU16(CAM.bgId, 0);
  for (const address of [CAM.bgLong, CAM.bgCross, CAM.bgAccL, CAM.bgAccC, CAM.bgFracA]) {
    ram.setU32(address, 0);
  }
  ram.setU16(CAM.txId, 1);
  for (const address of [CAM.txLong, CAM.txCross, CAM.txAccL, CAM.txAccC, CAM.txFracA]) {
    ram.setU32(address, 0);
  }
  deferReset(ram);
}

/** `$15B8F2`: clear the fifteen words ending immediately before the selector records. */
export function clearWhiteSelectorFrontend15B8F2(ram) {
  for (let i = 0; i < 15; i++) ram.setU16(0x812e82 + i * 2, 0);
}
