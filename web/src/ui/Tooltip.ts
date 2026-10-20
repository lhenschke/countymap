import { h } from "../dom";

/** Hover label that follows the pointer inside the map. */
export class Tooltip {
  private el: HTMLDivElement;
  private title: HTMLElement;
  private sub: HTMLElement;

  constructor(private container: HTMLElement) {
    this.title = h("strong");
    this.sub = h("span");
    this.el = h("div", { class: "tooltip", role: "tooltip" }, this.title, this.sub);
    this.el.hidden = true;
    container.append(this.el);
  }

  show(title: string, sub: string, clientX: number, clientY: number): void {
    this.title.textContent = title;
    this.sub.textContent = sub;
    this.el.hidden = false;
    const box = this.container.getBoundingClientRect();
    const { width, height } = this.el.getBoundingClientRect();
    let x = clientX - box.left + 14;
    let y = clientY - box.top + 14;
    if (x + width > box.width - 4) x = clientX - box.left - width - 14;
    if (y + height > box.height - 4) y = clientY - box.top - height - 14;
    this.el.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }

  hide(): void {
    this.el.hidden = true;
  }
}
