// Play a full lesson inside the WebView running on the attached Android device.
//
// "The app launches" is a much weaker claim than "a child can finish a lesson on this hardware",
// and the two came apart badly once already: an APK that installed, launched and rendered nothing
// looked completely healthy from the outside. This attaches over the same devtools bridge that
// chrome://inspect uses, so it exercises the real device WebView rather than a desktop browser
// pretending to be one.
//
// Raw CDP rather than Puppeteer: Puppeteer's target discovery does not work against an Android
// WebView's browser endpoint, and everything needed here is Runtime.evaluate.
//
// Usage, from app-bakery/:
//   node ../tools/device-lesson-qa.mjs [http://127.0.0.1:9333]
import { createRequire } from "node:module";

// Resolved from the working directory: `ws` is a QA-only dependency installed into
// app-bakery/node_modules, and ESM would otherwise look next to tools/ and fail.
const require = createRequire(`${process.cwd()}/`);
const WebSocket = require("ws");

const base = process.argv[2] ?? "http://127.0.0.1:9333";
const log = (...a) => console.log(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await fetch(`${base}/json/list`).then((r) => r.json());
const target = targets.find((t) => t.type === "page" && t.url.includes("index.html"));
if (!target) {
  console.error("No page target found. Is the app running and port-forwarded?");
  process.exit(2);
}
log("attached to:", target.url);

const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((res, rej) => {
  ws.once("open", res);
  ws.once("error", rej);
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];

ws.on("message", (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    return;
  }
  if (msg.method === "Runtime.exceptionThrown") {
    const d = msg.params.exceptionDetails;
    consoleErrors.push(d.exception?.description ?? d.text);
  }
  if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") {
    consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  }
});

function send(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

/** Evaluate in the page and return the value, awaiting promises. */
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
}

await send("Runtime.enable");

/** Click the first matching element, reporting whether one was found. */
const clickJs = (sel) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  el.click();
  return true;
})()`;

/**
 * Press a key the way a child's tap arrives at the game.
 *
 * lesson.ts listens on window keydown, so a synthetic KeyboardEvent reaches exactly the same
 * handler. Dispatching from JS also sidesteps the keypad's responsive layout entirely, which
 * would otherwise make this test a test of hit-target geometry.
 */
const keyJs = (key) => `(() => {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, bubbles: true }));
  return true;
})()`;

// --- 1. Start from a known state -------------------------------------------------------------
// Deterministic regardless of what is already saved on the device.
await evaluate(`localStorage.removeItem("crumbs-bakery.save.v1"); location.reload(); true`);
await sleep(2500);
await send("Runtime.enable");

log("\n[1] title");
if (!(await evaluate(clickJs(".title__play")))) throw new Error("No play button on the title screen.");
await sleep(1200);

// --- 2-4. Play, by reacting to whatever is on screen ------------------------------------------
//
// Onboarding, the map and the lesson are deliberately not driven as a fixed script. The bakery
// teaches its first fact inside onboarding and offers its first tile there too, so a step-by-step
// walkthrough encodes the current beat order and breaks whenever that order is tuned. Reading the
// screen and responding to it survives that.
log("\n[2] playing");

/** Solve the equation in `selector`, which reads "a op b =". Returns false if absent. */
async function solveEquation(selector) {
  const row = await evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    return el ? el.textContent.trim() : null;
  })()`);
  if (!row) return false;

  // The minus sign is U+2212, not a hyphen.
  const m = row.match(/(\d+)\s*([+\u2212-])\s*(\d+)/);
  if (!m) {
    log("  could not parse equation:", JSON.stringify(row));
    return false;
  }
  const [, a, op, b] = m;
  const answer = op === "+" ? Number(a) + Number(b) : Number(a) - Number(b);
  for (const ch of String(answer)) await evaluate(keyJs(ch));
  await evaluate(keyJs("Enter"));
  log(`  ${a} ${op} ${b} = ${answer}`);
  return true;
}

let solved = 0;
let sawLesson = false;
let sawSummary = false;

for (let step = 0; step < 80; step++) {
  if (await evaluate(`!!document.querySelector(".summary")`)) {
    sawSummary = true;
    break;
  }

  // A lesson equation is answered on the keypad.
  if (await solveEquation('.lesson .ladder__row[data-role="active"]')) {
    sawLesson = true;
    solved++;
    await sleep(1000);
    continue;
  }

  // Onboarding's first bake teaches the same fact differently: it shows three candidate answers
  // as tiles and expects a tap. Clicking blindly hits a wrong tile two times in three, which the
  // screen absorbs as a retry rather than advancing — so read the equation and pick deliberately.
  const obTile = await evaluate(`(() => {
    const eq = document.querySelector('.ob__equation');
    if (!eq) return null;
    const m = eq.textContent.trim().match(/(\\d+)\\s*([+\\u2212-])\\s*(\\d+)/);
    if (!m) return null;
    const answer = m[2] === "+" ? Number(m[1]) + Number(m[3]) : Number(m[1]) - Number(m[3]);
    const tile = [...document.querySelectorAll(".tile")]
      .find((t) => t.textContent.trim() === String(answer));
    if (!tile) return null;
    tile.click();
    return m[1] + " " + m[2] + " " + m[3] + " = " + answer;
  })()`);
  if (obTile) {
    log(`  ${obTile}  (tapped tile)`);
    solved++;
    await sleep(1600);
    continue;
  }

  if (await evaluate(clickJs(".ob__choice"))) {
    log("  chose an age band");
    await sleep(1000);
    continue;
  }
  if (await evaluate(clickJs(".mapnode"))) {
    log("  opened a map node");
    await sleep(1400);
    continue;
  }
  if (await evaluate(clickJs(".ob__beat .btn--primary, .btn--primary"))) {
    await sleep(1000);
    continue;
  }

  // Nothing actionable yet — most likely a screen transition.
  await sleep(700);
}
log(`  solved ${solved} facts; reached a lesson: ${sawLesson}`);

// --- 5. Summary ------------------------------------------------------------------------------
log("\n[5] summary");
const summary = await evaluate(`(() => {
  const el = document.querySelector(".summary");
  return el ? el.textContent.trim().replace(/\\s+/g, " ").slice(0, 200) : null;
})()`);
log("  shown:", sawSummary);
if (summary) log("  text:", summary);

// --- 6. The point of the entire native shell -------------------------------------------------
log("\n[6] persistence");
const save = await evaluate(`(() => {
  if (window.crumb?.store?.flush) window.crumb.store.flush();
  const raw = localStorage.getItem("crumbs-bakery.save.v1");
  if (!raw) return null;
  const d = JSON.parse(raw);
  return {
    mastered: Object.keys(d.mastery ?? {}).length,
    completed: (d.completed ?? []).length,
    sprinkles: d.sprinkles ?? 0,
  };
})()`);
log("  save present:", Boolean(save));
if (save) {
  log("  mastered facts:  ", save.mastered);
  log("  completed recipes:", save.completed);
  log("  sprinkles:       ", save.sprinkles);
}

log("\n[7] console errors:", consoleErrors.length);
consoleErrors.forEach((e) => log("  !", e));

const ok = solved > 0 && sawLesson && sawSummary && save && save.mastered > 0 && consoleErrors.length === 0;
log("\nRESULT:", ok ? "PASS" : "FAIL");

ws.close();
process.exit(ok ? 0 : 1);
