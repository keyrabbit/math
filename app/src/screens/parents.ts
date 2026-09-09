import { audio } from "../core/audio";
import { el, stagger } from "../core/dom";
import type { ScreenInstance, World } from "../world";
import { FLUENT_MS } from "../game/mastery";
import { allConstellations, opSymbol, type Operation } from "../game/curriculum";
import { store } from "../game/store";
import { makeMapScreen } from "./map";

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/**
 * The grown-ups area: progress report and settings, behind a parent gate.
 *
 * Everything that could cost money, change the child's data, or leave the app lives behind this
 * gate. That is both an App Store requirement for the Kids category and simply the right shape for
 * a product a five-year-old uses unsupervised.
 *
 * The gate is a spelled-out arithmetic question. Digits would be readable by the very children the
 * gate exists to stop; number *words* plus two-digit arithmetic reliably are not.
 */
export function makeParentsScreen(world: World): ScreenInstance {
  let unlocked = false;
  const content = el("div", { class: "parents__content" });
  const scroll = el("div", { class: "parents__scroll grow", dataset: { mode: "gate" } }, content);

  const a = 6 + Math.floor(Math.random() * 4);
  const b = 4 + Math.floor(Math.random() * 5);
  const answer = a * b;

  const input = el("input", {
    class: "parents__input",
    type: "text",
    inputMode: "numeric",
    autocomplete: "off",
    maxLength: 3,
    aria: { label: "Answer" },
  });

  const gateError = el("p", { class: "parents__error dim", textContent: "" });

  function checkGate(): void {
    if (Number(input.value) === answer) {
      unlocked = true;
      audio.select();
      renderReport();
    } else {
      audio.softMiss();
      gateError.textContent = "Not quite — have another go.";
      input.value = "";
      input.focus();
    }
  }

  function renderGate(): void {
    scroll.dataset.mode = "gate";
    content.replaceChildren(
      el("h1", { class: "headline", textContent: "For grown-ups" }),
      el("p", { class: "dim", textContent: "Answer to continue." }),
      el("p", {
        class: "parents__question",
        textContent: `What is ${NUMBER_WORDS[a]} times ${NUMBER_WORDS[b]}?`,
      }),
      el("div", { class: "row parents__gateRow" }, input, el("button", {
        class: "btn btn--primary",
        type: "button",
        textContent: "Continue",
        on: { click: checkGate },
      })),
      gateError
    );
    input.addEventListener("keydown", (e) => {
      if ((e as KeyboardEvent).key === "Enter") checkGate();
    });
    setTimeout(() => input.focus(), 300);
  }

  function renderReport(): void {
    scroll.dataset.mode = "report";
    const s = store.mastery.summary();
    const cons = allConstellations();
    const complete = cons.filter((c) => store.mastery.progress(c).complete);
    const struggling = store.mastery.strugglingFacts(5);
    const minutesToday = store.minutesPlayedToday();
    const week = last7Days().map((day) => ({
      day,
      minutes: Math.round((store.state.playSeconds[day] ?? 0) / 60),
    }));
    const peak = Math.max(1, ...week.map((w) => w.minutes));

    content.replaceChildren(
      ...([
        el("h1", { class: "headline", textContent: "Progress" }),
      stagger(
        el(
          "div",
          { class: "parents__stats" },
          statCard("Facts mastered", String(s.lit), "Retained across a review a day or more later"),
          statCard("Constellations", `${complete.length}/${cons.length}`, "Complete fact families"),
          statCard("Accuracy", `${Math.round(s.accuracy * 100)}%`, "Across all attempts"),
          statCard("Fluent recall", String(s.fluent), `Answered in under ${(FLUENT_MS / 1000).toFixed(1)}s`)
        )
      ),

      el("h2", { class: "parents__h2", textContent: "This week" }),
      el(
        "div",
        { class: "parents__chart", aria: { label: "Minutes played each day this week" } },
        ...week.map((w) =>
          el(
            "div",
            { class: "parents__bar" },
            el("div", {
              class: "parents__barFill",
              style: { height: `${(w.minutes / peak) * 100}%` },
              aria: { label: `${w.minutes} minutes` },
            }),
            el("span", { class: "parents__barLabel", textContent: w.day.slice(8) })
          )
        )
      ),
      el("p", { class: "dim", textContent: `${minutesToday} minutes today · ${store.state.streakDays}-day streak` }),

      struggling.length > 0
        ? el(
            "div",
            { class: "parents__section" },
            el("h2", { class: "parents__h2", textContent: "Worth practising together" }),
            el(
              "div",
              { class: "parents__facts" },
              ...struggling.map((f) =>
                el("span", { class: "parents__fact", textContent: prettyFact(f.id) })
              )
            ),
            el("p", {
              class: "dim",
              textContent: "These come up most often as mistakes. They will be scheduled more frequently.",
            })
          )
        : null,

      el("h2", { class: "parents__h2", textContent: "Settings" }),
      el(
        "div",
        { class: "parents__settings" },
        toggle("Sound", !store.state.settings.muted, (on) => {
          store.update({ settings: { ...store.state.settings, muted: !on } });
          audio.setMuted(!on);
        }),
        toggle("Reduced motion", world.reducedMotion, (on) => {
          world.reducedMotion = on;
          store.update({ settings: { ...store.state.settings, reducedMotion: on } });
        })
      ),

      el(
        "div",
        { class: "parents__section" },
        el("h2", { class: "parents__h2", textContent: "Privacy" }),
        el("p", {
          class: "dim",
          textContent:
            "All progress is stored on this device only. There is no account, no advertising, and no third-party analytics in this build.",
        })
      ),

      el("button", {
        class: "btn btn--ghost",
        type: "button",
        textContent: "Reset all progress",
        on: {
          click: () => {
            if (confirm("Delete all progress on this device? This cannot be undone.")) {
              store.reset();
              void world.go(makeMapScreen);
            }
          },
        },
      }),
      ] as (Node | null)[]).filter((n): n is Node => n !== null)
    );
  }

  const root = el(
    "div",
    { class: "parents" },
    el(
      "header",
      { class: "hud" },
      el("button", {
        class: "btn btn--ghost",
        type: "button",
        textContent: "Back",
        on: {
          click: () => {
            audio.back();
            void world.go(makeMapScreen);
          },
        },
      }),
      el("div", { class: "hud__spacer" })
    ),
    scroll
  );

  return {
    element: root,
    mounted() {
      world.showPipkin = false;
      world.setBiome("observatory");
      if (unlocked) renderReport();
      else renderGate();
    },
    destroy() {
      world.showPipkin = true;
    },
  };
}

function statCard(label: string, value: string, note: string): HTMLElement {
  return el(
    "div",
    { class: "parents__stat card" },
    el("span", { class: "parents__statValue", textContent: value }),
    el("span", { class: "parents__statLabel", textContent: label }),
    el("span", { class: "parents__statNote", textContent: note })
  );
}

function toggle(label: string, initial: boolean, onChange: (on: boolean) => void): HTMLElement {
  const btn = el("button", {
    class: "parents__toggle",
    type: "button",
    dataset: { on: initial ? "1" : "0" },
    aria: { role: "switch", checked: initial, label },
  });
  btn.append(
    el("span", { class: "parents__toggleLabel", textContent: label }),
    el("span", { class: "parents__switch" }, el("span", { class: "parents__knob" }))
  );
  btn.addEventListener("click", () => {
    const on = btn.dataset.on !== "1";
    btn.dataset.on = on ? "1" : "0";
    btn.setAttribute("aria-checked", String(on));
    audio.tap();
    onChange(on);
  });
  return btn;
}

function prettyFact(id: string): string {
  const [op, rest] = id.split(":") as [Operation, string];
  const m = rest.match(/^(\d+)(.)(\d+)$/);
  if (!m) return rest;
  return `${m[1]} ${opSymbol(op)} ${m[3]}`;
}

function last7Days(): string[] {
  const out: string[] = [];
  for (let i = 6; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}
