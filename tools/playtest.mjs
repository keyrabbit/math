/**
 * Child-persona playtest driver for Crumb's Bakery.
 *
 * The device QA script (`device-lesson-qa.mjs`) answers one question: does a lesson run without
 * throwing? This one answers a different and much harder question: *what is it like to be the
 * child?* It therefore plays badly on purpose — wrong answers, wild guesses, key mashing, empty
 * submits, quitting mid-lesson and coming back — because every one of those is a thing a
 * five-year-old does within the first ten minutes, and none of them are covered by a happy path.
 *
 * It records three things:
 *   - a frame per beat, so the session can be watched back
 *   - a journal of every action and every screen transition, with timings
 *   - console errors, exceptions, and stuck detection
 *
 * Usage:
 *   node tools/playtest.mjs --persona=maya --url=http://localhost:5174/ --out=.playtest/maya
 *
 * Requires a Chromium with --remote-debugging-port already listening (see --cdp).
 */

import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

// `ws` is installed in the app workspace, not at the repo root. Resolve from the working
// directory, the same way `device-lesson-qa.mjs` does, so this runs from either place.
const require = createRequire(`${process.cwd()}/`);
const WebSocket = require("ws");

// ------------------------------------------------------------------ personas

/**
 * Personas are not difficulty settings. Each one is a different *way of being wrong*, because the
 * failure modes a game has are specific to how the child misbehaves, not to how much they know.
 */
const PERSONAS = {
  maya: {
    label: "Maya, 5, first time, cautious",
    band: "5 – 6",
    // Probability a known-correct answer is deliberately fumbled first.
    slipRate: 0.28,
    // Probability of a wild guess rather than a considered wrong answer.
    guessRate: 0.5,
    // Thinks slowly. Milliseconds of hesitation before answering.
    thinkMs: [900, 2600],
    // Tries the obvious exploits.
    cheats: ["empty-submit", "mash-keys", "double-submit"],
    // Quits and comes back this many times.
    returns: 2,
    // Taps things that are not the answer.
    wanders: true,
  },
  theo: {
    label: "Theo, 7, confident, impatient, tries to break things",
    band: "7 – 8",
    slipRate: 0.15,
    guessRate: 0.8,
    thinkMs: [120, 500],
    cheats: ["empty-submit", "mash-keys", "double-submit", "keyboard-spam", "back-mid-lesson", "reload-mid-lesson"],
    returns: 3,
    wanders: true,
  },
  ada: {
    label: "Ada, 9, fast and accurate, wants to finish the game",
    band: "9 – 11",
    slipRate: 0.05,
    guessRate: 0.2,
    thinkMs: [80, 260],
    cheats: ["double-submit"],
    returns: 1,
    wanders: false,
    // Always takes the game's own recommendation instead of poking around the board. This is the
    // persona that answers "can this actually be finished, and how long does it take?"
    focused: true,
  },
};

// ------------------------------------------------------------------ cli

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v = "true"] = a.replace(/^--/, "").split("=");
    return [k, v];
  })
);

const CDP = args.cdp ?? "http://127.0.0.1:9444";
const URL_ = args.url ?? "http://localhost:5174/";
const OUT = args.out ?? ".playtest/run";
const PERSONA = PERSONAS[args.persona ?? "maya"];
const MAX_LESSONS = Number(args.lessons ?? 40);
const VIEWPORT = (args.viewport ?? "393x852").split("x").map(Number);
const FRAMES = args.frames !== "false";

if (!PERSONA) throw new Error(`Unknown persona. Try: ${Object.keys(PERSONAS).join(", ")}`);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, "frames"), { recursive: true });

// ------------------------------------------------------------------ cdp glue

const listRes = await fetch(`${CDP}/json/list`);
const targets = await listRes.json();
const page = targets.find((t) => t.type === "page");
if (!page) throw new Error("No page target on the debugger. Is the browser running?");

const ws = new WebSocket(page.webSocketDebuggerUrl, { maxPayload: 512 * 1024 * 1024 });
await new Promise((res, rej) => {
  ws.once("open", res);
  ws.once("error", rej);
});

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const exceptions = [];

ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.id !== undefined) {
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result);
    }
    return;
  }
  if (m.method === "Runtime.consoleAPICalled" && (m.params.type === "error" || m.params.type === "warning")) {
    consoleErrors.push({
      type: m.params.type,
      text: m.params.args.map((a) => a.value ?? a.description ?? a.type).join(" "),
    });
  }
  if (m.method === "Runtime.exceptionThrown") {
    exceptions.push(m.params.exceptionDetails.text + " " + (m.params.exceptionDetails.exception?.description ?? ""));
  }
});

const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        rej(new Error(`${method} timed out`));
      }
    }, 30000);
  });

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: VIEWPORT[0],
  height: VIEWPORT[1],
  deviceScaleFactor: 2,
  mobile: true,
});
await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
const pick = (xs) => xs[Math.floor(Math.random() * xs.length)];

async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + " " + (r.result?.description ?? ""));
  }
  return r.result.value;
}

// ------------------------------------------------------------------ journal

const journal = [];
const issues = [];
let frameNo = 0;
const started = Date.now();

function note(kind, message, extra = {}) {
  journal.push({ t: Date.now() - started, kind, message, ...extra });
  if (kind === "issue") {
    issues.push({ t: Date.now() - started, message, ...extra });
    console.log(`  ⚠ ${message}`);
  }
}

async function frame(label) {
  if (!FRAMES) return;
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  const name = `${String(frameNo++).padStart(4, "0")}-${label.replace(/[^a-z0-9]+/gi, "-")}.png`;
  writeFileSync(join(OUT, "frames", name), Buffer.from(data, "base64"));
  journal.push({ t: Date.now() - started, kind: "frame", message: name });
}

// ------------------------------------------------------------------ reading the screen

/** Everything the driver needs to decide what a child would do next. */
const READ = `(() => {
  const q = (s) => document.querySelector(s);
  const txt = (s) => { const n = q(s); return n ? n.textContent.trim() : null; };
  const screen =
    q('.beat') ? 'beat' :
    q('.lesson') ? 'lesson' :
    q('.summary') ? 'summary' :
    q('.map') ? 'map' :
    q('.case') ? 'case' :
    q('.parents') ? 'parents' :
    q('.tiles, .ob__choices, .ob__beat') ? 'onboarding' :
    q('.title') ? 'title' : 'unknown';
  const active = q('.lesson .ladder__row[data-role="active"]');
  /**
   * Read the active equation in either frame.
   *
   * Direct:  "7 + 5 = "     -> the answer is missing
   * Gap:     "7 +  = 12"    -> the second operand is missing
   *
   * The slot renders as an empty span, so both come through as text with a hole in them.
   */
  const parse = (s) => {
    if (!s) return null;
    const t = s.replace(/\\u2212/g, '-');
    // Fractions are asked in words: "3 wholes =  halves".
    const fm = t.match(/(\\d+)\\s+whole(?:s)?\\s*=\\s*(\\d*)\\s*(half|halves|third|thirds|quarter|quarters)/i);
    if (fm) {
      const a = +fm[1];
      const u = fm[3].toLowerCase();
      const n = u.indexOf('half') === 0 || u.indexOf('halv') === 0 ? 2 : u.indexOf('third') === 0 ? 3 : 4;
      return { a, b: n, op: 'frac', r: null, answer: a * n, frame: 'direct' };
    }
    const m = t.match(/(\\d+)?\\s*([+\\-\\u00d7\\u00f7])\\s*(\\d+)?\\s*=\\s*(\\d+)?/);
    if (!m) return null;
    const a = m[1] == null ? null : +m[1];
    const op = m[2];
    const b = m[3] == null ? null : +m[3];
    const r = m[4] == null ? null : +m[4];
    const apply = (x, y) => op === '+' ? x + y : op === '-' ? x - y : op === '\\u00d7' ? x * y : x / y;
    let answer = null;
    let frame = 'direct';
    if (a != null && b != null) answer = apply(a, b);
    else if (a != null && r != null) {
      frame = 'gap';
      answer = op === '+' ? r - a : op === '-' ? a - r : op === '\\u00d7' ? r / a : a / r;
    } else return null;
    return { a, b, op, r, answer, frame };
  };
  const save = (() => { try { return JSON.parse(localStorage.getItem('crumbs-bakery.save.v1') || 'null'); } catch (e) { return null; } })();
  return {
    screen,
    prompt: txt('.lesson__prompt'),
    recipe: txt('.lesson__recipe'),
    sub: txt('.lesson__sub'),
    headline: txt('.headline'),
    eyebrow: txt('.summary__eyebrow'),
    equation: active ? active.textContent.trim() : null,
    frame: active ? active.dataset.frame || 'direct' : null,
    fact: parse(active ? active.textContent : null),
    jar: txt('.summary__jarTitle'),
    rooms: [...document.querySelectorAll('.map__room')].map((n) => n.textContent.trim()),
    slot: (q('.slot') || {}).textContent || '',
    segments: [...document.querySelectorAll('.hud__seg')].map((n) => n.dataset.on === '1' ? 1 : 0),
    sprinkles: txt('.hud__chip span:last-child'),
    mapChip: txt('.map__chip span:last-child'),
    chapterLabel: txt('.map .prompt'),
    mapTitle: txt('.map .headline'),
    primaryCta: (q('.btn--primary') || {}).textContent || null,
    beatText: q('.beat') ? q('.beat').textContent.trim() : null,
    nodeStates: [...document.querySelectorAll('.mapnode')].map((n) => n.dataset.state),
    nodeNames: [...document.querySelectorAll('.mapnode__name')].map((n) => n.textContent),
    nodeProgress: [...document.querySelectorAll('.mapnode__progress')].map((n) => n.textContent),
    tiles: [...document.querySelectorAll('.tile')].map((n) => n.textContent.trim()),
    choices: [...document.querySelectorAll('.ob__choice')].map((n) => n.textContent.trim()),
    obEquation: txt('.ob__equation'),
    keys: [...document.querySelectorAll('.key')].map((n) => n.textContent.trim()),
    buttons: [...document.querySelectorAll('button')].map((n) => (n.textContent || '').trim()).filter(Boolean),
    chapter: save ? save.chapter : null,
    unlocked: save ? save.unlockedChapter : null,
    completed: save ? (save.completed || []).length : null,
    sprinklesSaved: save ? save.sprinkles : null,
    factsBaked: save && save.mastery ? Object.values(save.mastery).filter((f) => f.box >= 1).length : null,
    factsSeen: save && save.mastery ? Object.keys(save.mastery).length : null,
    saveBytes: (localStorage.getItem('crumbs-bakery.save.v1') || '').length,
  };
})()`;

const read = () => evaluate(READ);

/** Click by selector + text, the way a finger does: one element, once. */
async function tap(selector, text = null, { optional = false } = {}) {
  const ok = await evaluate(`(() => {
    const ns = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const n = ${text === null ? "ns[0]" : `ns.find((x) => (x.textContent || '').trim() === ${JSON.stringify(text)})`};
    if (!n) return false;
    n.click();
    return true;
  })()`);
  if (!ok && !optional) note("issue", `Nothing to tap for ${selector}${text ? ` "${text}"` : ""}`);
  return ok;
}

/**
 * Type an answer on the keypad.
 *
 * The game auto-submits as soon as the entry is as long as the answer, so the screen can change
 * out from under the driver mid-word — and it legitimately does at the end of a lesson. Taps are
 * therefore optional and the loop stops at the first one that finds nothing, instead of logging a
 * string of phantom "nothing to tap" bugs against the game.
 */
async function typeAnswer(value, { submit = true } = {}) {
  for (const ch of String(value)) {
    if (!(await tap(".key", ch, { optional: true }))) return false;
    await sleep(rand(90, 260));
  }
  if (submit) await tap(".key", "✓", { optional: true });
  return true;
}

// ------------------------------------------------------------------ misbehaviour

async function misbehave(kind, state) {
  note("cheat", `Trying: ${kind}`);
  switch (kind) {
    case "empty-submit":
      // Press the big green tick with nothing entered. Should do nothing, quietly.
      {
        const now = await read();
        // Only a question that is actually on screen can be "empty submitted"; a lesson that has
        // just ended on its own is not the game losing an argument. The last question of a lesson
        // is excluded for the same reason: the tick is pressed during the 620ms reward animation,
        // and the summary that follows is the lesson ending, not the empty submit working.
        if (now.screen !== "lesson" || !now.fact) break;
        if ((now.segments || []).filter((s) => s === 0).length <= 1) break;
        await tap(".key", "✓", { optional: true });
        await sleep(400);
        const after = await read();
        if (after.screen !== "lesson") {
          note("issue", "Submitting an empty answer left the lesson", { to: after.screen });
        }
      }
      break;
    case "mash-keys":
      // A fist on the keypad.
      for (let i = 0; i < 8; i++) {
        await tap(".key", pick(["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]), {
          optional: true,
        });
        await sleep(40);
      }
      await sleep(500);
      break;
    case "double-submit":
      // Two taps on ✓ before the animation finishes — the classic double-fire bug.
      if (state.fact) {
        await typeAnswer(state.fact.answer, { submit: false });
        await tap(".key", "✓", { optional: true });
        await sleep(30);
        await tap(".key", "✓", { optional: true });
        await sleep(900);
      }
      break;
    case "keyboard-spam":
      for (let i = 0; i < 12; i++) {
        await send("Input.dispatchKeyEvent", { type: "keyDown", key: String(i % 10), text: String(i % 10) });
        await send("Input.dispatchKeyEvent", { type: "keyUp", key: String(i % 10) });
      }
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", text: "\r" });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter" });
      await sleep(600);
      break;
    case "back-mid-lesson": {
      const before = await read();
      await tap(".hud__back", null, { optional: true });
      await sleep(900);
      const after = await read();
      note("cheat", `Back mid-lesson: ${before.screen} -> ${after.screen}`);
      break;
    }
    case "reload-mid-lesson": {
      // "If I close it and open it again, do I keep the treats?"
      const before = await read();
      await quitAndReturn("reload mid-lesson");
      const after = await read();
      if ((after.factsBaked ?? 0) < (before.factsBaked ?? 0)) {
        note("issue", "Quitting mid-lesson lost baked treats", {
          before: before.factsBaked,
          after: after.factsBaked,
        });
      }
      break;
    }
  }
}

/** Close the app and open it again, the way a child actually does. */
async function quitAndReturn(why) {
  note("exit", `Leaving the app (${why})`);
  // Mirror the real lifecycle: the shells flush on visibilitychange / pagehide.
  await evaluate(`document.dispatchEvent(new Event('visibilitychange'))`);
  await sleep(250);
  await send("Page.navigate", { url: "about:blank" });
  await sleep(500);
  await send("Page.navigate", { url: URL_ });
  await sleep(2600);
  note("exit", "Back in the app");
}

// ------------------------------------------------------------------ the play loop

let lastSignature = "";
let sameCount = 0;
let lessonsPlayed = 0;
let questionsAnswered = 0;
let wrongAnswers = 0;
let returnsLeft = PERSONA.returns;
let lessonStart = 0;
const lessonDurations = [];
const recipesSeen = new Set();
const equationsSeen = [];
const promptsSeen = new Set();
/** Facts asked in the lesson currently being played, cleared at each summary. */
const lessonFacts = new Set();
/** The question currently on screen, so re-reads are not mistaken for repeats. */
let lastFactKey = "";
/** Once-only celebrations already seen, so a repeat is a bug rather than a nice surprise. */
const celebrations = new Set();
let gapQuestions = 0;

console.log(`\n▶ ${PERSONA.label}`);
console.log(`  ${URL_} at ${VIEWPORT[0]}x${VIEWPORT[1]}\n`);

await send("Page.navigate", { url: URL_ });
await sleep(3000);
/**
 * Start from nothing — properly.
 *
 * Clearing localStorage while the app is running does not work: the outgoing page flushes its
 * in-memory save on `pagehide`, so the next navigation resurrects the *previous* child's progress.
 * Run 2 inherited run 1's finished chapter and spent its first four lessons "restocking" shelves
 * it had never filled. Park on about:blank first so there is no app alive to write anything back,
 * wipe the origin's storage from the browser side, and only then open the game.
 */
await send("Page.navigate", { url: "about:blank" });
await sleep(600);
try {
  await send("Storage.clearDataForOrigin", {
    origin: new URL(URL_).origin,
    storageTypes: "local_storage,indexeddb,cache_storage,websql,cookies",
  });
} catch {
  /* older protocol builds: fall through to the in-page clear below */
}
await sleep(300);
await send("Page.navigate", { url: URL_ });
await sleep(3000);
{
  const cold = await read();
  if (cold.factsSeen) {
    note("issue", "Cold open still had a save", {
      chapter: cold.chapter,
      factsSeen: cold.factsSeen,
    });
  }
}
await frame("cold-open");

for (let step = 0; step < 4000; step++) {
  let s;
  try {
    s = await read();
  } catch (e) {
    note("issue", `Reading the screen threw: ${e.message}`);
    break;
  }

  // Stuck detection: the same screen and the same question, over and over.
  const signature = `${s.screen}|${s.equation}|${s.headline}|${s.primaryCta}`;
  if (signature === lastSignature) {
    sameCount++;
    if (sameCount > 25) {
      note("issue", `Stuck on ${s.screen} for 25 iterations`, { signature });
      await frame("stuck");
      break;
    }
  } else {
    sameCount = 0;
    lastSignature = signature;
  }

  // A lesson that is left without a summary — reloaded, or backed out of — is abandoned, and the
  // next one starts a fresh list of facts. Without this the duplicate-fact assertion carries the
  // abandoned lesson's questions forward and accuses the game of repeating itself.
  if (s.screen !== "lesson" && s.screen !== "summary" && lessonFacts.size > 0) {
    lessonFacts.clear();
    lastFactKey = "";
  }

  switch (s.screen) {
    case "title":
      note("screen", "Title");
      await frame("title");
      await tap(".title__play");
      await sleep(900);
      break;

    case "onboarding": {
      if (s.tiles.length > 0) {
        // The first bake. A cautious child gets it wrong once before getting it right.
        const m = (s.obEquation || "").replace(/\u2212/g, "-").match(/(\d+)\s*([+-])\s*(\d+)/);
        const want = m ? (m[2] === "+" ? +m[1] + +m[3] : +m[1] - +m[3]) : null;
        const wrong = s.tiles.find((t) => Number(t) !== want);
        if (PERSONA.slipRate > 0.2 && wrong && Math.random() < 0.6) {
          note("play", `First bake: tries ${wrong} (wrong) for ${s.obEquation}`);
          await tap(".tile", wrong);
          await sleep(1000);
          await frame("onboarding-wrong");
        }
        note("play", `First bake: answers ${want}`);
        await tap(".tile", String(want));
        await sleep(1400);
      } else if (s.choices.length > 0) {
        await frame("onboarding-age");
        const choice = s.choices.find((c) => c.startsWith(PERSONA.band.split(" ")[0]));
        note("play", `Age band: ${PERSONA.band}`);
        await tap(".ob__choice", choice ?? s.choices[0]);
        await sleep(1200);
      } else {
        await frame("onboarding-beat");
        await tap(".btn--primary");
        await sleep(1100);
      }
      break;
    }

    case "beat":
      note("screen", `Story beat: ${String(s.beatText).slice(0, 90)}`);
      await frame("beat");
      await sleep(700);
      await tap(".beat__btn");
      await sleep(700);
      break;

    case "map": {
      note("screen", `Board: ${s.mapTitle} (${s.chapterLabel}) ${s.mapChip}`);
      await frame("map");
      if (lessonsPlayed >= MAX_LESSONS) {
        note("play", `Stopping after ${MAX_LESSONS} lessons`);
        step = 4000;
        break;
      }
      // A child wanders. Sometimes they open the case, sometimes they poke the grown-up door.
      if (PERSONA.wanders && Math.random() < 0.14) {
        const where = pick(["Bakery Case", "For grown-ups"]);
        note("play", `Wanders off to ${where}`);
        await tap(".btn", where);
        await sleep(1600);
        break;
      }
      if (returnsLeft > 0 && Math.random() < 0.18) {
        returnsLeft--;
        await quitAndReturn("bored, put it down");
        break;
      }
      // Tap a node directly about half the time, the big button otherwise.
      if (!PERSONA.focused && Math.random() < 0.5 && s.nodeNames.length > 0) {
        const i = Math.floor(Math.random() * s.nodeNames.length);
        note("play", `Taps the board node "${s.nodeNames[i]}" (${s.nodeProgress[i]})`);
        await evaluate(`document.querySelectorAll('.mapnode')[${i}].click()`);
      } else {
        note("play", `Presses "${s.primaryCta}"`);
        await tap(".btn--primary");
      }
      lessonStart = Date.now();
      await sleep(1300);
      break;
    }
    case "lesson": {
      if (!s.fact) {
        await sleep(400);
        break;
      }
      if (s.recipe) recipesSeen.add(s.recipe);
      if (s.prompt) promptsSeen.add(s.prompt);
      equationsSeen.push(s.equation);
      if (s.frame === "gap") gapQuestions++;

      // Assertion: a lesson must never ask the same fact twice. The identity of a fact is its
      // numbers, whichever way round it is framed, so "7 + 5" and "7 +  = 12" are the same fact.
      // Only a *change* of question counts: the driver re-reads the same screen many times per
      // question (after a wrong answer, while a hint is up), and counting those would accuse the
      // game of repeating itself every time a child hesitated.
      if (s.fact) {
        const key = `${s.fact.a}${s.fact.op}${s.fact.b ?? s.fact.answer}`;
        if (key !== lastFactKey) {
          if (lessonFacts.has(key)) {
            note("issue", `Asked the same fact twice in one lesson: ${s.equation}`, {
              recipe: s.recipe,
              asked: [...lessonFacts],
            });
          }
          lessonFacts.add(key);
          lastFactKey = key;
          if (lessonFacts.size === 1) await frame("lesson");
        }
      }

      // Occasionally try something naughty instead of answering.
      if (PERSONA.cheats.length && Math.random() < 0.12) {
        await misbehave(pick(PERSONA.cheats), s);
        break;
      }

      await sleep(rand(PERSONA.thinkMs[0], PERSONA.thinkMs[1]));

      const slip = Math.random() < PERSONA.slipRate;
      if (slip) {
        const wrong =
          Math.random() < PERSONA.guessRate
            ? Math.floor(rand(0, 20))
            : s.fact.answer + pick([-1, 1, -2, 2]);
        const safe = wrong === s.fact.answer ? s.fact.answer + 1 : wrong;
        note("play", `${s.equation} → tries ${safe} (wrong)`);
        wrongAnswers++;
        await typeAnswer(Math.max(0, safe));
        await sleep(1100);
        const after = await read();
        if (after.prompt === s.prompt && after.prompt === "Find the missing number") {
          note("issue", "A wrong answer produced no hint and no change of prompt");
        }
        if (after.fact && after.fact.answer !== s.fact.answer) {
          note("issue", "A wrong answer skipped to a different question", {
            was: s.equation,
            now: after.equation,
          });
        }
        break;
      }

      note("play", `${s.equation} → ${s.fact.answer}`);
      await typeAnswer(s.fact.answer);
      questionsAnswered++;
      await sleep(900);
      break;
    }

    case "summary": {
      lessonsPlayed++;
      if (lessonStart) lessonDurations.push(Date.now() - lessonStart);
      note("screen", `Summary: ${s.headline} — ${s.eyebrow}${s.jar ? ` | ${s.jar}` : ""}`);
      // Assertion: the "recipe finished" fanfare is a once-per-recipe event. Firing it on every
      // restock is how a reward stops being one.
      if (s.eyebrow === "Recipe finished" || s.eyebrow === "Chapter finished") {
        const key = `${s.eyebrow}:${s.headline}`;
        if (celebrations.has(key)) {
          note("issue", `Celebrated "${key}" more than once`);
        }
        celebrations.add(key);
      }
      if (s.eyebrow === "The end") note("play", "Reached the end of the game");
      lessonFacts.clear();
      lastFactKey = "";
      await frame("summary");
      await sleep(900);
      await tap(".btn--primary");
      await sleep(1400);
      break;
    }

    case "case":
      note("screen", "Bakery Case");
      await frame("case");
      await sleep(900);
      // Poke a shelf, then leave.
      await evaluate(`(document.querySelector('.case__cell') || {}).click?.()`);
      await sleep(900);
      await frame("case-detail");
      await tap(".btn", "Back");
      await sleep(1200);
      if ((await read()).screen === "case") {
        await tap(".btn--ghost");
        await sleep(1000);
      }
      break;

    case "parents":
      note("screen", "For grown-ups");
      await frame("parents");
      await sleep(700);
      // A child at the parent gate. They will try.
      await evaluate(`(() => {
        const i = document.querySelector('.parents__input');
        if (i) { i.value = '12'; i.dispatchEvent(new Event('input', { bubbles: true })); }
      })()`);
      await sleep(400);
      await tap(".btn--primary");
      await sleep(900);
      await frame("parents-gate-attempt");
      {
        const after = await read();
        if (after.screen === "parents" && /\d/.test(after.headline ?? "")) {
          note("cheat", "Parent gate held");
        }
      }
      await tap(".btn", "Back");
      await sleep(1200);
      if ((await read()).screen === "parents") {
        await tap(".btn--ghost");
        await sleep(1000);
      }
      break;

    default:
      note("issue", `Unrecognised screen; buttons: ${JSON.stringify(s.buttons).slice(0, 160)}`);
      await frame("unknown");
      await sleep(800);
      break;
  }
}

await frame("final");
const final = await read();

// ------------------------------------------------------------------ report

const repeats = {};
for (const e of equationsSeen) repeats[e] = (repeats[e] ?? 0) + 1;
const mostRepeated = Object.entries(repeats).sort((a, b) => b[1] - a[1]).slice(0, 8);

const report = {
  persona: PERSONA.label,
  viewport: VIEWPORT.join("x"),
  durationMs: Date.now() - started,
  lessonsPlayed,
  questionsAnswered,
  wrongAnswers,
  medianLessonMs:
    lessonDurations.length > 0
      ? lessonDurations.slice().sort((a, b) => a - b)[Math.floor(lessonDurations.length / 2)]
      : null,
  recipesSeen: [...recipesSeen],
  distinctPrompts: [...promptsSeen],
  gapQuestions,
  celebrations: [...celebrations],
  saveBytes: final.saveBytes ?? null,
  mostRepeatedQuestions: mostRepeated,
  finalState: {
    screen: final.screen,
    chapter: final.chapter,
    unlocked: final.unlocked,
    completedRecipes: final.completed,
    factsBaked: final.factsBaked,
    factsSeen: final.factsSeen,
    sprinkles: final.sprinklesSaved,
  },
  consoleErrors,
  exceptions,
  issues,
};

writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(join(OUT, "journal.json"), JSON.stringify(journal, null, 2));

console.log(`\n─── ${PERSONA.label} ───`);
console.log(`lessons ${lessonsPlayed}  questions ${questionsAnswered}  wrong ${wrongAnswers}`);
console.log(`recipes seen: ${[...recipesSeen].join(", ") || "none"}`);
console.log(`chapter ${final.chapter}  completed ${final.completed}  baked ${final.factsBaked}`);
console.log(`console errors ${consoleErrors.length}  exceptions ${exceptions.length}  issues ${issues.length}`);
console.log(`frames ${frameNo} → ${OUT}`);
if (issues.length) {
  console.log("\nIssues:");
  for (const i of issues) console.log(`  - ${i.message}`);
}

ws.close();
process.exit(0);
