import { WHITE_BOSS_SCRIPT_ALIASES } from './boss-resources.js';
import { registerScriptAlias } from './scheduler.js';

for (const [whiteAddress, blackAddress] of WHITE_BOSS_SCRIPT_ALIASES) {
  registerScriptAlias(whiteAddress, blackAddress);
}
