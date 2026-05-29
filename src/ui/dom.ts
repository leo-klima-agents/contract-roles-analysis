type El = HTMLElementTagNameMap;

/** Tiny element factory: el('button', { className, onclick }, [children]). */
export function el<K extends keyof El>(
  tag: K,
  props: Partial<El[K]> & { dataset?: Record<string, string> } = {},
  children: Array<Node | string> = [],
): El[K] {
  const node = document.createElement(tag);
  const { dataset, ...rest } = props;
  Object.assign(node, rest);
  if (dataset) for (const [k, v] of Object.entries(dataset)) node.dataset[k] = v;
  for (const c of children) node.append(c);
  return node;
}

export function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

export function clear(node: HTMLElement): void {
  node.replaceChildren();
}

/** Short 0x… display for addresses/hashes. */
export function shorten(value: string, lead = 6, tail = 4): string {
  if (value.length <= lead + tail + 2) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}
