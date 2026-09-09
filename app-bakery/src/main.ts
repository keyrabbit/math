import "@fontsource-variable/nunito";
import "@fontsource/baloo-2/400.css";
import "@fontsource/baloo-2/800.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/components.css";
import "./styles/screens.css";

import { audio } from "./core/audio";
import { store } from "./game/store";
import { World } from "./world";
import { makeTitleScreen } from "./screens/title";

const app = document.getElementById("app");
if (!app) throw new Error("#app missing");

const canvas = document.createElement("canvas");
canvas.id = "stage";
// The canvas is decorative; every meaningful element is mirrored in the DOM UI layer.
canvas.setAttribute("aria-hidden", "true");

const ui = document.createElement("div");
ui.id = "ui";

app.append(canvas, ui);

store.load();
audio.setMuted(store.state.settings.muted);

const world = new World(canvas, ui);
void world.go(makeTitleScreen);

// Persist before the tab goes away — `pagehide` fires reliably on iOS where `beforeunload` does not.
window.addEventListener("pagehide", () => {
  store.recordPlaytime();
  store.flush();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    store.recordPlaytime();
    store.flush();
  }
});

/**
 * Walk back one screen by activating whatever back affordance the current screen is showing.
 *
 * The native Android/Fire shell binds the hardware back button to this. Doing it here rather than
 * in the shell means the native layer stays dumb and there is exactly one definition of "back" —
 * the same button the child can see. Returns false when the current screen has no back control
 * (the title screen), which is the shell's signal that it is allowed to close the app.
 */
function back(): boolean {
  const labelled = document.querySelector<HTMLButtonElement>('button[aria-label="Back"]');
  const target =
    labelled ??
    Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.trim() === "Back") ??
    null;
  if (!target) return false;
  target.click();
  return true;
}

// Expose for the automated QA harness and the native shells; harmless in production and
// invaluable for screenshots.
(
  window as unknown as {
    crumb: { world: World; store: typeof store; back: () => boolean };
  }
).crumb = { world, store, back };
