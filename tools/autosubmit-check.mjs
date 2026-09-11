/**
 * Checks the one behaviour a tapping robot never exercises: what happens when a child types an
 * answer and does *not* press the tick.
 *
 * The lesson used to submit as soon as the entry had as many digits as the answer, which meant a
 * child aiming at 11 for `4 ÷ 4 = ▢` had the leading 1 taken from them and marked correct. This
 * plays both halves of that: the rescue must still work, and a two-digit answer must never be
 * scored on its first digit.
 */
import { createRequire } from "node:module";
const require = createRequire(`${process.cwd()}/`);
const WebSocket = require("ws");

const CDP = "http://127.0.0.1:9444";
const URL_ = "http://127.0.0.1:5174/";
const ORIGIN = new URL(URL_).origin;

const target = await (await fetch(`${CDP}/json/new?about:blank`, { method: "PUT" })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl, { maxPayload: 64 * 1024 * 1024 });
await new Promise((r) => ws.once("open", r));

let id = 0;
const pending = new Map();
ws.on("message", (raw) => {
  const m = JSON.parse(raw);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(m.error.message)) : resolve(m.result);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const n = ++id;
    pending.set(n, { resolve, reject });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expression) => {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
};

await send("Page.enable");
await send("Runtime.enable");
// A cold start has to be genuinely cold: clearing localStorage from the running page does not
// work, because the outgoing page flushes its save back over the top on `pagehide`.
await send("Page.navigate", { url: "about:blank" });
await sleep(400);
await send("Storage.clearDataForOrigin", { origin: ORIGIN, storageTypes: "all" });
await send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 2, mobile: true });
await send("Page.navigate", { url: URL_ });
await sleep(2500);

const tap = (selector, text = null) =>
  evaluate(`(() => {
    const ns = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const n = ${text === null ? "ns[0]" : `ns.find((x) => (x.textContent || '').trim() === ${JSON.stringify(text)})`};
    if (!n) return false;
    n.click();
    return true;
  })()`);

const state = () =>
  evaluate(`(() => {
    const q = (s) => document.querySelector(s);
    const active = q('.lesson .ladder__row[data-role="active"]');
    return {
      lesson: !!q('.lesson'),
      equation: active ? active.textContent.trim() : null,
      prompt: (q('.lesson__prompt') || {}).textContent || null,
      slot: (q('.slot') || {}).textContent || '',
      lit: [...document.querySelectorAll('.hud__seg')].filter((n) => n.dataset.on === '1').length,
    };
  })()`);

// Walk the opening until a lesson is on screen. The onboarding is a handful of single-button
// screens, so pressing whatever is in front of us is enough.
for (let i = 0; i < 40; i++) {
  const s = await state();
  if (s.lesson) break;
  let acted = null;
  // The first bake is a three-tile question; tapping blindly would keep answering it wrong.
  const ob = await evaluate(`(() => {
    const e = document.querySelector('.ob__equation');
    return e ? e.textContent.trim() : null;
  })()`);
  if (ob) {
    const m = ob.replace(/\u2212/g, "-").match(/(\d+)\s*([+-])\s*(\d+)/);
    if (m) {
      const want = m[2] === "+" ? +m[1] + +m[3] : +m[1] - +m[3];
      if (await tap(".tile", String(want))) {
        await sleep(1400);
        continue;
      }
    }
  }
  for (const sel of [".title__play", ".ob__choice", ".tile", ".beat__btn", ".btn--primary", ".mapnode"]) {
    if (await tap(sel)) {
      acted = sel;
      break;
    }
  }
  if (!acted) {
    const seen = await evaluate(
      `[...document.querySelectorAll('button')].map((n) => (n.textContent||'').trim()).filter(Boolean)`
    );
    console.log(`  … nothing to press; buttons on screen: ${JSON.stringify(seen)}`);
  }
  await sleep(700);
}

const failures = [];
const check = (ok, what, detail = "") => {
  console.log(`  ${ok ? "✓" : "✗"} ${what}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures.push(what);
};

/**
 * Puts a typed question on screen.
 *
 * The lesson now asks its questions in seven different ways and only two of them involve a keypad,
 * so landing on one by walking forwards is luck. This seeds a bonds recipe at the box where the
 * keypad is in the pool and re-enters the lesson until the keypad is what comes up — re-entering
 * rather than answering, because answering moves the box and changes the pool underneath us.
 */
const keypadLesson = () =>
  evaluate(`(async () => {
    if (document.querySelector('.lesson')?.dataset.mode === 'keypad') return 'ok';
    const api = window.crumb;
    if (!api) return 'no hook';
    const curriculum = await import('/src/game/curriculum.ts');
    const screens = await import('/src/screens/lesson.ts');
    const recipe = curriculum.allRecipes().find((r) => r.key === 'bond:10');
    const now = Date.now();
    recipe.facts.forEach((f) => {
      const st = api.store.mastery.get(f.id);
      st.box = 3;
      st.seen = 6;
      st.correct = 6;
      st.lastSeen = now - 1000;
      st.dueAt = now - 1000;
      st.fastest = 1200;
    });
    api.store.update({ onboarded: true, chapter: 0, unlockedChapter: 4 });
    for (const key of ['firstStale', 'firstGap', 'mode:tray', 'mode:rail', 'mode:plates', 'mode:slice', 'mode:burnt', 'mode:ticket']) {
      api.store.markSeen(key);
    }
    for (let i = 0; i < 40; i++) {
      await api.world.go(screens.makeLessonScreen(recipe));
      await new Promise((r) => setTimeout(r, 60));
      if (document.querySelector('.lesson')?.dataset.mode === 'keypad') return 'ok';
    }
    return 'got ' + document.querySelector('.lesson')?.dataset.mode;
  })()`);

/** The answer to the question on screen, read the way the driver reads it. */
async function expected() {
  const s = await state();
  if (!s.equation) return null;
  const t = s.equation.replace(/\s+/g, " ");
  const m = t.match(/^(\d+)\s*([+\u2212\u00d7\u00f7])\s*(\d*)\s*=\s*(\d*)$/);
  if (!m) return null;
  const [, a, op, b, r] = m;
  const A = Number(a);
  if (b) {
    const B = Number(b);
    return op === "+" ? A + B : op === "\u2212" ? A - B : op === "\u00d7" ? A * B : A / B;
  }
  const R = Number(r);
  return op === "+" ? R - A : op === "\u2212" ? A - R : op === "\u00d7" ? R / A : A / R;
}

// --- 1. The rescue. Type the right answer, never press the tick, and the lesson must move on.
{
  check((await keypadLesson()) === "ok", "A typed question can be reached");
  await sleep(900);
  const before = await state();
  const want = String(await expected());
  for (const ch of want) {
    await tap(".key", ch);
    await sleep(120);
  }
  await sleep(1400);
  const after = await state();
  check(
    after.lit > before.lit || after.equation !== before.equation,
    "A correct answer is checked without pressing the tick",
    `${before.equation} -> ${after.equation}`
  );
}

// --- 2. The bug. Type a two-digit answer whose first digit is the correct one-digit answer.
//     Nothing may be submitted until the child has stopped typing.
{
  let guard = 0;
  while (guard++ < 30) {
    await keypadLesson();
    await sleep(700);
    const want = await expected();
    if (want !== null && String(want).length === 1) break;
    if (want === null) continue;
    // Clear this question by answering it, and look at the next one.
    const w = String(want);
    for (const ch of w) {
      await tap(".key", ch);
      await sleep(110);
    }
    await tap(".key", "\u2713");
    await sleep(1100);
  }
  const before = await state();
  const want = String(await expected());
  const wrong = `${want}${want === "9" ? "1" : "9"}`;
  for (const ch of wrong) {
    await tap(".key", ch);
    await sleep(150);
  }
  const mid = await state();
  check(mid.slot === wrong, "Both digits reach the answer box", `box shows "${mid.slot}", typed "${wrong}"`);
  await sleep(1400);
  const after = await state();
  check(
    after.equation === before.equation,
    "A wrong two-digit answer is not scored on its first digit",
    `${before.equation} answered "${wrong}" -> ${after.equation}`
  );
  check(
    after.prompt !== before.prompt,
    "The wrong answer produced a hint",
    JSON.stringify(after.prompt)
  );
}

console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAuto-submit behaves.");
ws.close();
process.exit(failures.length ? 1 : 0);
