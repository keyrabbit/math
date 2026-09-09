import { defineConfig } from "vite";

// A distinct dev port so both MVPs (Pipkin at 5173, Crumb's Bakery at 5174) can run side by side.
export default defineConfig({
  server: { port: 5174 },
  preview: { port: 5174 },
  build: {
    // Vite's default target assumes an evergreen browser. The Android WebView on a Fire tablet
    // is not evergreen: an API 30 image ships WebView 83, which parses class fields but chokes
    // on logical assignment (`??=`, Chrome 85+) with "Uncaught SyntaxError: Unexpected token '='".
    // That was a blank white screen on the emulator, so the floor is pinned here rather than
    // discovered per-device. es2017 keeps `<script type=module>` viable (Chrome 61+) while
    // transpiling everything newer.
    target: "es2017",
  },
});
