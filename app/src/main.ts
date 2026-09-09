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

// Expose for the automated QA harness; harmless in production and invaluable for screenshots.
(window as unknown as { pipkin: { world: World; store: typeof store } }).pipkin = { world, store };
