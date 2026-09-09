/**
 * Tiny DOM helper. Deliberately not a framework: the UI here is a handful of screens with
 * hand-tuned animation, and a virtual DOM would fight the transitions rather than help them.
 */

type Child = Node | string | null | undefined | false;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Omit<HTMLElementTagNameMap[K], "style" | "dataset">> & {
    class?: string;
    style?: Partial<CSSStyleDeclaration> | string;
    dataset?: Record<string, string | number | undefined>;
    aria?: Record<string, string | number | boolean | undefined>;
    on?: Partial<Record<keyof HTMLElementEventMap, (ev: never) => void>>;
  } = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: className, style, dataset, aria, on, ...rest } = props;
  if (className) node.className = className;
  if (style) {
    if (typeof style === "string") node.setAttribute("style", style);
    else Object.assign(node.style, style);
  }
  if (dataset) {
    for (const [k, v] of Object.entries(dataset)) {
      if (v !== undefined) node.dataset[k] = String(v);
    }
  }
  if (aria) {
    for (const [k, v] of Object.entries(aria)) {
      if (v !== undefined) node.setAttribute(k.startsWith("aria") || k === "role" ? toAttr(k) : `aria-${k}`, String(v));
    }
  }
  if (on) {
    for (const [k, fn] of Object.entries(on)) {
      if (fn) node.addEventListener(k, fn as EventListener);
    }
  }
  Object.assign(node, rest);
  append(node, children);
  return node;
}

function toAttr(k: string): string {
  return k === "role" ? "role" : k.replace(/([A-Z])/g, "-$1").toLowerCase();
}

export function append(parent: Node, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
}

export function clear(node: Element): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/**
 * Replace a node's contents.
 *
 * This is `Element.replaceChildren` by another name, and exists because that method is Chrome 86
 * and the WebView on a Fire tablet can be older. Calling it there throws
 * `TypeError: replaceChildren is not a function` from inside a screen's mount, which kills
 * navigation while leaving the app process perfectly healthy — the game rendered its title
 * screen and then simply refused to go anywhere. Nothing in a desktop browser reproduces it.
 *
 * Prefer this over `replaceChildren` anywhere in the app.
 */
export function setChildren(node: Element, ...children: Child[]): void {
  clear(node);
  append(node, children);
}

/** Set `--i` on each child so the shared `.stagger` rule produces a cascade. */
export function stagger(container: HTMLElement): HTMLElement {
  container.classList.add("stagger");
  [...container.children].forEach((child, i) => {
    (child as HTMLElement).style.setProperty("--i", String(i));
  });
  return container;
}

export function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
