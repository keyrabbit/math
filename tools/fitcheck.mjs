/**
 * A narrow check with one job: prove that no equation in the game is ever wider than the card it
 * is drawn on.
 *
 * The playtest driver reads `textContent`, so it is blind to a question that has run off both
 * edges of the screen — which is exactly how `1 whole = ▢ thirds` shipped past five runs. This
 * walks every recipe in every chapter, renders every fact in both frames at a set of real device
 * widths, and measures the rendered row against the card.
 */
import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/`);
const WebSocket = require("ws");

const CDP = process.argv.includes("--cdp")
  ? process.argv[process.argv.indexOf("--cdp") + 1]
  : "http://127.0.0.1:9444";
const URL_ = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : "http://127.0.0.1:5174/";

const SIZES = [
  [320, 568, "iPhone SE"],
  [360, 800, "small Android"],
  [393, 852, "iPhone 15"],
  [402, 874, "iPhone 17"],
  [430, 932, "iPhone Pro Max"],
  [820, 1180, "iPad Air"],
  [1024, 768, "iPad landscape"],
  [1280, 800, "laptop"],
];

const res = await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" });
const target = await res.json();
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
await new Promise((r) => ws.once("open", r));

let id = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const msg = JSON.parse(raw);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });

const evaluate = async (expr) => {
  const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description ?? ""));
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
await send("Page.navigate", { url: URL_ });
await new Promise((r) => setTimeout(r, 2500));

/**
 * Render every equation the game can produce into a copy of the real ladder markup and measure it.
 * Done in the page so the measurements come from the same fonts and the same CSS the child sees.
 */
const PROBE = `(async () => {
  const cur = await import('/src/game/curriculum.ts');
  const host = document.createElement('div');
  host.className = 'lesson';
  host.style.cssText = 'position:fixed;inset:0;visibility:hidden;pointer-events:none';
  const body = document.createElement('div');
  body.className = 'lesson__body';
  const ladder = document.createElement('div');
  ladder.className = 'ladder';
  body.appendChild(ladder);
  host.appendChild(body);
  document.body.appendChild(host);

  const bad = [];
  let checked = 0;
  let shrunk = 0;
  for (const recipe of cur.allRecipes()) {
  for (const fact of recipe.facts) {
    for (const frame of ['direct', 'gap']) {
      const asked = cur.askFact(fact, frame);
      const row = document.createElement('div');
      row.className = 'ladder__row';
      row.dataset.role = 'active';
      const slot = document.createElement('span');
      slot.className = 'slot';
      slot.textContent = String(asked.expected);
      row.append(asked.pre, slot, asked.post);
      ladder.replaceChildren(row);
      const avail = ladder.clientWidth - 16;
      const natural = row.getBoundingClientRect().width;
      // The same rule the lesson applies. Measuring only the natural width would report every
      // fraction as broken; what matters is the width the child actually sees.
      row.style.setProperty('--fit', natural > avail ? String(avail / natural) : '1');
      const want = row.getBoundingClientRect().width;
      checked++;
      if (natural > avail) shrunk++;
      if (want > avail + 1) bad.push({ recipe: recipe.name, frame, text: row.textContent.trim(), want: Math.round(want), avail: Math.round(avail) });
    }
  }
  }
  host.remove();
  return { checked, shrunk, bad };
})()`;

let failures = 0;
for (const [w, h, label] of SIZES) {
  await send("Emulation.setDeviceMetricsOverride", {
    width: w,
    height: h,
    deviceScaleFactor: 2,
    mobile: w < 700,
  });
  await new Promise((r) => setTimeout(r, 350));
  const { checked, shrunk, bad } = await evaluate(PROBE);
  failures += bad.length;
  const head = `${label} ${w}x${h}: ${checked} equations, ${shrunk} shrunk to fit, ${bad.length} still too wide`;
  console.log(bad.length ? `  ✗ ${head}` : `  ✓ ${head}`);
  for (const b of bad.slice(0, 6)) {
    console.log(`      ${b.recipe} [${b.frame}] "${b.text}" needs ${b.want}px, has ${b.avail}px`);
  }
}

console.log(failures ? `\n${failures} equations overflow.` : "\nEvery equation fits at every size.");
ws.close();
process.exit(failures ? 1 : 0);
