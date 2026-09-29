// Endstep's own board menu (right-click on its table, or its ⋯ button): decklist, auto-yields,
// settings, shortcuts, reports, rewind, concede… The Arena board shows these items in its own
// menu and runs them through Endstep's, so each still opens Endstep's real window.
// Everything here depends on Endstep's DOM (data-testids from its GameView bundle).

const TRIGGER = '[data-testid="board-menu-trigger"]';
const POPUP = '[data-testid="board-menu-popup"]';

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

async function waitFor<T>(get: () => T | null, ms: number): Promise<T | null> {
  const end = performance.now() + ms;
  for (;;) {
    const v = get();
    if (v || performance.now() > end) return v;
    await frame();
  }
}

/** Opens Endstep's menu without showing it; returns its popup, or null. */
async function openHidden(): Promise<{ popup: HTMLElement; unhide: () => void } | null> {
  const trigger = document.querySelector<HTMLElement>(TRIGGER);
  if (!trigger) return null;
  const hide = document.createElement("style");
  hide.textContent = `${POPUP} { visibility: hidden !important; }`;
  document.head.appendChild(hide);
  const unhide = () => setTimeout(() => hide.remove(), 60);
  if (!document.querySelector(POPUP)) trigger.click();
  const popup = await waitFor(() => document.querySelector<HTMLElement>(POPUP), 600);
  if (!popup) {
    unhide();
    return null;
  }
  return { popup, unhide };
}

function close(): void {
  // Endstep's menu closes on Escape (it listens on window).
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
}

const labelOf = (b: Element) => b.textContent?.replace(/\s+/g, " ").trim() ?? "";

/** The items Endstep's menu offers right now, by label (null when there is no menu). */
export async function readBoardMenu(): Promise<string[] | null> {
  const open = await openHidden();
  if (!open) return null;
  const labels = [...open.popup.querySelectorAll("button")].map(labelOf).filter(Boolean);
  close();
  open.unhide();
  return labels;
}

/** Clicks one of Endstep's menu items by its label. */
export async function runBoardMenuItem(label: string): Promise<boolean> {
  const open = await openHidden();
  if (!open) return false;
  const button = [...open.popup.querySelectorAll<HTMLElement>("button")].find((b) => labelOf(b) === label);
  if (button) button.click();
  else close();
  open.unhide();
  return !!button;
}

/** One of Endstep's windows (decklist, settings, a dialog…) is open. */
export function endstepWindowOpen(): boolean {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some((d) => !d.matches(POPUP) && !d.closest("endstep-arena-ui"));
}
