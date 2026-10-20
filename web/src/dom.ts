/** Tiny element builder: h("p", { class: "muted" }, "text", child). */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  for (const child of children) if (child) el.append(child);
  return el;
}
