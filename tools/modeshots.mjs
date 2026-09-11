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
  // The same mode again, with every decoration bought. Not a mode test: it is the only way to see
  // whether a fully decorated bakery still leaves the question legible.
  { mode: "tray", recipe: "bond:8", box: 0, sprinkles: 2600, id: "decor" },
  { mode: "rail", recipe: "table:5", box: 0, skip: 2 },
  // The counting rail: the same track drawn as a plain number line for a bond. Widest case in the
  // game — up to eight tappable stops — so it is the one most likely to overflow a phone.
  { mode: "rail", recipe: "bond:9", box: 0, id: "rail-count" },
  { mode: "rail", recipe: "bond:20", box: 0, skip: 4, id: "rail-count-20" },
  // The same two, after a wrong answer: the tick pressed on a half-filled tray, and the first
  // stop on the rail. Both are guaranteed misses, and both raise a hint line the props must
  // then make room for.
  { mode: "tray", recipe: "bond:8", box: 0, id: "tray-miss", miss: ".modeReady" },
  { mode: "rail", recipe: "bond:9", box: 0, id: "rail-count-miss", miss: ".rail__stop--pick" },
  { mode: "plates", recipe: "share:4", box: 0 },
  { mode: "slice", recipe: "fraction:4", box: 0 },
  { mode: "burnt", recipe: "table:6", box: 5 },
  // The joke landing: the burnt cake actually charring. Clicking the right one is a *correct*
  // answer, so this photographs the reward rather than a miss.
  { mode: "burnt", recipe: "table:6", box: 5, id: "burnt-charred", miss: '.burnt__cake[data-burnt="1"]', settle: 320 },
  { mode: "ticket", recipe: "bond:14", box: 5 },
  { mode: "keypad", recipe: "bond:10", box: 3 },
  // Not a mode: the ending. Photographed three times because it is the only screen in the game
  // that changes on a timer, so a still of it half-built is the only way to know whether the
  // curtain call reads while it is still arriving.
  { screen: "finale", id: "finale-open", after: 900 },
  { screen: "finale", id: "finale-mid", after: 5200 },
  { screen: "finale", id: "finale-end", after: 900, skipAhead: true },
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

      // ── The ending ───────────────────────────────────────────────────────────────────────
      // A different screen with a different shape, so it takes a different path: seed a save that
      // looks like a child who finished the whole game — every fact special, months of evenings,
      // all the decorations — and go straight there.
      if (kase.screen === "finale") {
        const fok = await evaluate(
          ws,
          (sprinkles) => {
            const api = window.crumb;
            if (!api) return "no hook";
            return import("/src/game/curriculum.ts").then(async (curriculum) => {
              const screens = await import("/src/screens/finale.ts");
              const now = Date.now();
              for (const r of curriculum.allRecipes()) {
                for (const f of r.facts) {
                  const st = api.store.mastery.get(f.id);
                  st.box = 7;
                  st.seen = 4;
                  st.correct = 4;
                  st.streak = 4;
                  st.bestMs = 1400 + (f.answer % 7) * 220;
                  st.avgMs = 2600;
                  st.lastSeen = now;
                  st.holdsUntil = now + 864e5 * 21;
                }
              }
              const playSeconds = {};
              for (let d = 0; d < 34; d++) {
                playSeconds[`2026-0${1 + (d % 3)}-${String(1 + (d % 28)).padStart(2, "0")}`] = 640;
              }
              api.store.update({
                onboarded: true,
                name: "Rosa",
                chapter: 4,
                unlockedChapter: 4,
                sprinkles,
                playSeconds,
              });
              await api.world.go(screens.makeFinaleScreen);
              return "ok";
            });
          },
          kase.sprinkles ?? 2600
        );

        await sleep(kase.after ?? 900);
        if (kase.skipAhead) {
          // A child who will not sit through it. The tap must land the whole thing at once.
          await evaluate(ws, () => {
            document
              .querySelector(".finale")
              ?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
          });
          await sleep(900);
        }

        const fshot = await send(ws, "Page.captureScreenshot", { format: "png" });
        writeFileSync(join(OUT, `${size.id}-${kase.id}.png`), Buffer.from(fshot.data, "base64"));

        const fm = await evaluate(ws, () => {
          const panel = document.querySelector(".finale");
          if (!panel) return null;
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          let worstLeft = 0;
          let worstRight = 0;
          let worstBottom = 0;
          let culprit = null;
          const tinyTargets = [];
          for (const n of panel.querySelectorAll("*")) {
            const r = n.getBoundingClientRect();
            if (r.width === 0 || getComputedStyle(n).opacity === "0") continue;
            const over = Math.max(-r.left, r.right - vw, r.bottom - vh);
            if (over > Math.max(worstLeft, worstRight, worstBottom)) {
              culprit = `${n.tagName}.${n.className} over=${Math.round(over)}`;
            }
            worstLeft = Math.max(worstLeft, -r.left);
            worstRight = Math.max(worstRight, r.right - vw);
            // The finale scrolls on purpose, so only a *button* below the fold is a fault: a child
            // who cannot see the way out is stuck.
            if (n.tagName === "BUTTON") {
              worstBottom = Math.max(worstBottom, r.bottom - vh);
              const min = Math.min(r.width, r.height);
              if (min < 30) tinyTargets.push({ cls: n.className, w: Math.round(r.width), h: Math.round(r.height) });
            }
          }
          return {
            overflowLeft: Math.round(worstLeft),
            overflowRight: Math.round(worstRight),
            overflowTop: 0,
            overflowBottom: Math.round(worstBottom),
            culprit,
            tinyTargets,
            // A line of the curtain call must arrive whole. Half of one showing early — the label
            // visible while its number is still hidden — is what a cascade slip looks like from
            // the outside, and it reads as a rendering fault rather than as pacing.
            leaked: Array.from(panel.querySelectorAll(".finale__beat:not(.is-in)"))
              .flatMap((li) => Array.from(li.children))
              .filter((n) => Number(getComputedStyle(n).opacity) > 0.02)
              .map((n) => `${n.className}:${n.textContent}`),
            hostBox: `beats=${panel.querySelectorAll(".finale__beat.is-in").length}/${panel.querySelectorAll(".finale__beat").length} done=${panel.querySelector(".finale__done")?.classList.contains("is-in")} scroll=${Math.round(panel.scrollHeight)}/${Math.round(panel.clientHeight)}`,
            prompt: panel.querySelector(".finale__headline")?.textContent ?? "",
          };
        });

        results.push({ size: size.id, mode: kase.id, ok: fok, ...fm });
        console.log(
          `${size.id.padEnd(10)} ${kase.id.padEnd(16)} ${String(fok).padEnd(12)} ` +
            `overflow L${fm?.overflowLeft} R${fm?.overflowRight} B${fm?.overflowBottom} ` +
            `tiny=${fm?.tinyTargets.length ?? "-"} ${fm?.hostBox ?? ""}`
        );
        continue;
      }

      const ok = await evaluate(
        ws,
        (recipeKey, box, wanted, skip, sprinkles) => {
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
            api.store.update({ onboarded: true, chapter: chapterIndex, unlockedChapter: 4, sprinkles });
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
        kase.skip ?? 0,
        kase.sprinkles ?? 0
      );

      await sleep(1100);

      // Photograph the screen *after* a miss where a case asks for it. A wrong answer adds a hint
      // line to the body, which takes room away from the props — and the state a child sees after
      // getting something wrong is the state that matters most, because it is the one they have to
      // act on. It had never been photographed at all.
      if (kase.miss) {
        await evaluate(
          ws,
          (sel) => {
            document.querySelector(sel)?.click();
          },
          kase.miss
        );
        await sleep(kase.settle ?? 1500);
      }

      const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
      const name = `${size.id}-${kase.id ?? kase.mode}.png`;
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
          const over = Math.max(b.left - r.left, r.right - b.right, b.top - r.top, r.bottom - b.bottom);
          if (over > Math.max(worstLeft, worstRight, worstTop, worstBottom)) {
            culprit = `${n.tagName}.${n.className} ${Math.round(r.width)}x${Math.round(r.height)} over=${Math.round(over)}`;
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
            ? `prop=${getComputedStyle(host).getPropertyValue("--prop").trim()} room=${Math.round(host.clientWidth)}x${Math.round(host.clientHeight)} fit=${host.dataset.room} body=${Math.round(body.clientHeight)} content=${Math.round(host.firstElementChild?.getBoundingClientRect().width ?? 0)}x${Math.round(host.firstElementChild?.getBoundingClientRect().height ?? 0)}`
            : null,
          prompt: document.querySelector(".lesson__prompt")?.textContent ?? "",
        };
      });

      results.push({ size: size.id, mode: kase.id ?? kase.mode, ok, ...metrics });
      console.log(
        `${size.id.padEnd(10)} ${(kase.id ?? kase.mode).padEnd(8)} ${String(ok).padEnd(12)} ` +
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
      (r.leaked?.length ?? 0) > 0 ||
      (r.tinyTargets?.length ?? 0) > 0
  );
  console.log(`\n${results.length} shots, ${bad.length} problems`);
  for (const b of bad) {
    console.log(
      `  ${b.size}/${b.mode}: ok=${b.ok} L${b.overflowLeft} R${b.overflowRight} T${b.overflowTop} B${b.overflowBottom} tiny=${JSON.stringify(b.tinyTargets)} leaked=${JSON.stringify(b.leaked ?? [])} ${b.culprit ?? ""} | ${b.hostBox ?? ""}`
    );
  }
  ws.close();
  process.exit(bad.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
