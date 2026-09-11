/**
 * Screenshot every question mode, at several device sizes.
 *
 * The single most expensive lesson of the previous eight playtest rounds was that a driver which
 * reads `textContent` is blind: the worst layout bug in the game survived five consecutive "clean"
 * runs because nobody opened the pictures. Six new interactions have just been added, all of them
 * geometric, and none of them can be judged from a DOM dump. So this exists before the playtests
 * do.
 *
 *   node ..\tools\modeshots.mjs --out=.playtest\modes
 *
 * Run it from `app-bakery` — `ws` is resolved from the working directory.
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const require = createRequire(`${process.cwd()}/`);
const WebSocket = require("ws");

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);
const URL_BASE = args.url ?? "http://127.0.0.1:5174/";
const CDP = args.cdp ?? "http://127.0.0.1:9444";
const OUT = args.out ?? join(".playtest", "modes");

/** Device sizes that have historically broken something. */
const SIZES = [
  { id: "phone", width: 393, height: 852, dpr: 3 },
  { id: "small", width: 320, height: 568, dpr: 2 },
  { id: "landscape", width: 852, height: 393, dpr: 3 },
  { id: "tablet", width: 820, height: 1180, dpr: 2 },
];

/**
 * Each mode is forced by seeding the mastery box of every fact in a recipe, because `pickMode`
 * chooses from whatever fits. Box 0 on a bonds recipe can only ever be the tray; box 0 on a
 * fractions recipe can only be the slicing board; and so on. Where two modes fit the same box the
 * run simply retries until the wanted one appears.
 */
const CASES = [
  { mode: "tray", recipe: "bond:8", box: 0 },
  { mode: "rail", recipe: "table:5", box: 0, skip: 2 },
  { mode: "plates", recipe: "share:4", box: 0 },
  { mode: "slice", recipe: "fraction:4", box: 0 },
  { mode: "burnt", recipe: "table:6", box: 5 },
  { mode: "ticket", recipe: "bond:14", box: 5 },
  { mode: "keypad", recipe: "bond:10", box: 3 },
];

let nextId = 1;
const pending = new Map();

async function connect() {
  const res = await fetch(`${CDP}/json/list`);
  const targets = await res.json();
  const page = targets.find((t) => t.type === "page" && t.webSocketDebuggerUrl);
  if (!page) throw new Error("no debuggable page");
  const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
  await new Promise((ok, no) => {
    ws.once("open", ok);
    ws.once("error", no);
  });
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
  });
  return ws;
}

function send(ws, method, params = {}) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(ws, fn, ...argv) {
  const expr = `(${fn.toString()}).apply(null, ${JSON.stringify(argv)})`;
  const r = await send(ws, "Runtime.evaluate", {
    expression: expr,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
  }
  return r.result.value;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const ws = await connect();
  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");

  const results = [];

  for (const size of SIZES) {
    await send(ws, "Emulation.setDeviceMetricsOverride", {
      width: size.width,
      height: size.height,
      deviceScaleFactor: size.dpr,
      mobile: true,
    });

    for (const kase of CASES) {
      // A genuinely cold start. Clearing localStorage from the live page does not work: the
      // outgoing document flushes its save on `pagehide` and overwrites whatever was seeded.
      await send(ws, "Page.navigate", { url: "about:blank" });
      await sleep(120);
      await send(ws, "Storage.clearDataForOrigin", {
        origin: new URL(URL_BASE).origin,
        storageTypes: "all",
      });
      await send(ws, "Page.navigate", { url: URL_BASE });
      await sleep(900);

      const ok = await evaluate(
        ws,
        (recipeKey, box, wanted, skip) => {
          const api = window.crumb;
          if (!api) return "no hook";
          return import("/src/game/curriculum.ts").then(async (curriculum) => {
            const screens = await import("/src/screens/lesson.ts");
            const recipe = curriculum.allRecipes().find((r) => r.key === recipeKey);
            if (!recipe) return "no recipe";
            const now = Date.now();
            recipe.facts.forEach((f, i) => {
              const st = api.store.mastery.get(f.id);
              // `skip` parks the leading facts out of reach: learned, not due, and seen a moment
              // ago, so `nextFact` ranks them last on all three of its passes. Needed because some
              // modes refuse the easiest facts in a recipe — a `5 x 1` rail has nothing to count.
              if (i < skip) {
                st.box = 3;
                st.seen = 6;
                st.correct = 6;
                st.lastSeen = now;
                st.dueAt = now + 864e5;
                st.holdsUntil = now + 864e5;
                st.fastest = 1200;
                return;
              }
              st.box = box;
              st.seen = box * 2;
              st.correct = box * 2;
              st.lastSeen = box === 0 ? 0 : now - 1000;
              st.dueAt = box === 0 ? 0 : now - 1000;
              st.fastest = 1200;
            });
            const chapterIndex = curriculum.CHAPTERS.findIndex((c) =>
              curriculum.chapterRecipes(c).some((r) => r.key === recipeKey)
            );
            api.store.update({ onboarded: true, chapter: chapterIndex, unlockedChapter: 4 });
            // Mark every one-off story beat as already seen: they are correct behaviour but they
            // cover the very thing being photographed.
            for (const key of [
              "firstStale",
              "firstGap",
              "mode:tray",
              "mode:rail",
              "mode:plates",
              "mode:slice",
              "mode:burnt",
              "mode:ticket",
            ]) {
              api.store.markSeen(key);
            }
            await api.world.go(screens.makeLessonScreen(recipe));
            for (let i = 0; i < 24; i++) {
              const seen = document.querySelector(".lesson")?.dataset.mode;
              if (seen === wanted) return "ok";
              // Re-enter rather than answer: answering would move the box and change the mode
              // pool underneath us.
              await api.world.go(screens.makeLessonScreen(recipe));
              await new Promise((r) => setTimeout(r, 60));
            }
            return `got ${document.querySelector(".lesson")?.dataset.mode}`;
          });
        },
        kase.recipe,
        kase.box,
        kase.mode,
        kase.skip ?? 0
      );

      await sleep(1100);

      const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
      const name = `${size.id}-${kase.mode}.png`;
      writeFileSync(join(OUT, name), Buffer.from(shot.data, "base64"));

      // Measure everything that could overflow. The band between the title and the keypad is the
      // only place a question may live; anything outside it is invisible or unreachable.
      const metrics = await evaluate(ws, () => {
        const body = document.querySelector(".lesson__body");
        const host = document.querySelector(".lesson__mode");
        if (!body) return null;
        const b = body.getBoundingClientRect();
        const nodes = Array.from(document.querySelectorAll(".mode *, .ticket *")).filter(
          (n) => n.getBoundingClientRect().width > 0
        );
        let worstLeft = 0;
        let worstRight = 0;
        let worstTop = 0;
        let worstBottom = 0;
        let culprit = null;
        let tinyTargets = [];
        for (const n of nodes) {
          const r = n.getBoundingClientRect();
          const over = Math.max(b.left - r.left, r.right - b.right);
          if (over > Math.max(worstLeft, worstRight)) {
            culprit = `${n.tagName}.${n.className} w=${Math.round(r.width)}`;
          }
          worstLeft = Math.max(worstLeft, b.left - r.left);
          worstRight = Math.max(worstRight, r.right - b.right);
          worstTop = Math.max(worstTop, b.top - r.top);
          worstBottom = Math.max(worstBottom, r.bottom - b.bottom);
          if (n.tagName === "BUTTON" && !n.disabled) {
            const min = Math.min(r.width, r.height);
            if (min < 30) tinyTargets.push({ cls: n.className, w: Math.round(r.width), h: Math.round(r.height) });
          }
        }
        return {
          overflowLeft: Math.round(worstLeft),
          overflowRight: Math.round(worstRight),
          overflowTop: Math.round(worstTop),
          overflowBottom: Math.round(worstBottom),
          culprit,
          tinyTargets,
          hostHidden: host?.hidden ?? null,
          hostBox: host
            ? `prop=${getComputedStyle(host).getPropertyValue("--prop").trim()} room=${Math.round(host.clientWidth)}x${Math.round(host.clientHeight)} content=${Math.round(host.firstElementChild?.getBoundingClientRect().width ?? 0)}x${Math.round(host.firstElementChild?.getBoundingClientRect().height ?? 0)}`
            : null,
          prompt: document.querySelector(".lesson__prompt")?.textContent ?? "",
        };
      });

      results.push({ size: size.id, mode: kase.mode, ok, ...metrics });
      console.log(
        `${size.id.padEnd(10)} ${kase.mode.padEnd(8)} ${String(ok).padEnd(12)} ` +
          `overflow L${metrics?.overflowLeft} R${metrics?.overflowRight} ` +
          `T${metrics?.overflowTop} B${metrics?.overflowBottom} ` +
          `tiny=${metrics?.tinyTargets.length ?? "-"} ${metrics?.hostBox ?? ""}`
      );
    }
  }

  writeFileSync(join(OUT, "report.json"), JSON.stringify(results, null, 2));

  const bad = results.filter(
    (r) =>
      r.ok !== "ok" ||
      r.overflowLeft > 2 ||
      r.overflowRight > 2 ||
      r.overflowTop > 2 ||
      r.overflowBottom > 2 ||
      (r.tinyTargets?.length ?? 0) > 0
  );
  console.log(`\n${results.length} shots, ${bad.length} problems`);
  for (const b of bad) {
    console.log(
      `  ${b.size}/${b.mode}: ok=${b.ok} L${b.overflowLeft} R${b.overflowRight} T${b.overflowTop} B${b.overflowBottom} tiny=${JSON.stringify(b.tinyTargets)} ${b.culprit ?? ""} | ${b.hostBox ?? ""}`
    );
  }
  ws.close();
  process.exit(bad.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
