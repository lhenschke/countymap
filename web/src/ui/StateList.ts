import { h } from "../dom";
import type { StateFeature } from "../map/geo";

/**
 * The state list (left column on wide screens) and the equivalent <select>
 * (narrow screens). Picking a state zooms to it; null returns to the nation.
 */
export class StateList {
  private buttons = new Map<string, HTMLButtonElement>();
  private allButton: HTMLButtonElement;

  constructor(
    listEl: HTMLElement,
    private selectEl: HTMLSelectElement,
    states: StateFeature[],
    onPick: (stateFips: string | null) => void,
  ) {
    const sorted = [...states].sort((a, b) => a.properties.name.localeCompare(b.properties.name));

    this.allButton = h("button", { type: "button", class: "state-all" }, "All states");
    this.allButton.addEventListener("click", () => onPick(null));
    const grid = h("div", { class: "state-grid" });
    for (const state of sorted) {
      const button = h("button", { type: "button", title: state.properties.name }, state.properties.name);
      button.addEventListener("click", () => onPick(state.id));
      this.buttons.set(state.id, button);
      grid.append(button);
    }
    listEl.append(this.allButton, grid);

    selectEl.append(
      h("option", { value: "" }, "All states"),
      ...sorted.map((s) => h("option", { value: s.id }, s.properties.name)),
    );
    selectEl.addEventListener("change", () => onPick(selectEl.value || null));
    this.setActive(null);
  }

  setActive(stateFips: string | null): void {
    for (const [fips, button] of this.buttons) button.setAttribute("aria-pressed", String(fips === stateFips));
    this.allButton.setAttribute("aria-pressed", String(stateFips === null));
    this.selectEl.value = stateFips ?? "";
  }
}
