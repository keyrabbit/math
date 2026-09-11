import type { ModeId } from "../game/modes";
import type { ModeFactory } from "./mode";
import { trayMode } from "./tray";
import { railMode } from "./rail";
import { platesMode } from "./plates";
import { sliceMode } from "./slice";
import { burntMode } from "./burnt";

/**
 * The hands-on modes, by id.
 *
 * `keypad` and `ticket` are absent on purpose: they are the lesson's own equation path, not
 * separate screens. Anything in this table takes over the middle of the lesson completely and the
 * keypad goes away.
 */
export const MODE_FACTORIES: Partial<Record<ModeId, ModeFactory>> = {
  tray: trayMode,
  rail: railMode,
  plates: platesMode,
  slice: sliceMode,
  burnt: burntMode,
};

export type { ModeContext, ModeInstance, ModeFactory } from "./mode";
