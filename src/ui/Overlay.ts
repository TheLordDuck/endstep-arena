// The extension's UI layer: a Shadow-DOM host above Endstep holding the
// Arena board, the ON/OFF pill and the debug panel. Endstep's DOM is never
// modified: the board simply covers it, so turning the layer off (or
// uninstalling) restores the original page exactly.

import css from "../styles/overlay.css";
import boardCss from "../styles/board.css";
import type { EndstepAdapter } from "../game/endstep/EndstepAdapter";
import type { GameController } from "../game/GameController";
import type { PhaseStopSync } from "../game/PhaseStopSync";
import type { ReplayPlayer } from "../game/ReplayPlayer";
import type { RingBuffer } from "../shared/RingBuffer";
import { saveSettings, type DebugTab, type Settings } from "../content/settings";
import { esc, renderEvents, renderNetwork, renderRaw, renderState, renderUnsupported } from "./DebugViews";
import { saveUnsupported, type UnsupportedLog } from "../game/unsupportedPrompts";
import { Board } from "./board/Board";
import { StatePacer } from "./StatePacer";
import type { GameState } from "../game/GameState";
import { endstepWindowOpen, readBoardMenu, runBoardMenuItem } from "../game/endstep/boardMenu";

export type SocketStatus = "none" | "open" | "closed";

export interface NetworkEntry {
  t: number;
  dir: "in" | "out";
  label: string;
  bytes: number;
  detail?: unknown;
}

const TABS: { id: DebugTab; label: string }[] = [
  { id: "state", label: "Game state" },
  { id: "events", label: "Events" },
  { id: "network", label: "Network" },
  { id: "raw", label: "Raw" },
  { id: "unsupported", label: "Unsupported" },
];

const safeParse = (json: string): unknown => {
  try {
    return JSON.parse(json);
  } catch {
    return json;
  }
};

const shortcut = (e: KeyboardEvent, code: string) => e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === code;

export class Overlay {
  private host!: HTMLElement;
  private root!: ShadowRoot;
  private layer!: HTMLElement;
  private body!: HTMLElement;
  private board!: Board;
  private socket: SocketStatus = "none";
  private paused = false;
  private frame = 0;
  private lastRawRendered: unknown = null;
  private openZones = new Map<string, boolean>();
  /** Gives the board the game's states one by one, at a pace its animations can be seen at. */
  private pacer!: StatePacer;
  /** What the board was last given (undefined: nothing yet). */
  private boardState: GameState | null | undefined = undefined;

  constructor(
    private readonly adapter: EndstepAdapter,
    private readonly network: RingBuffer<NetworkEntry>,
    private readonly settings: Settings,
    private readonly controller: GameController,
    private readonly stops: PhaseStopSync,
    private readonly replays: ReplayPlayer,
    private readonly unsupported: UnsupportedLog,
  ) {}

  mount(): void {
    this.host = document.createElement("endstep-arena-ui");
    this.root = this.host.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${css}\n${boardCss}</style>
      <div class="layer">
        <button class="pill" data-action="toggle" title="Toggle Arena UI (Alt+Shift+A)">
          <span class="dot"></span><span class="pill-label">Arena UI</span><span class="pill-state"></span>
        </button>
        <section class="panel" aria-label="Arena UI debug">
          <header class="panel-head">
            <div class="head-row">
              <div class="title">Arena UI <span class="sub">debug</span></div>
              <div class="tools">
                <button data-action="pause" title="Freeze the panel to inspect it">Pause</button>
                <button data-action="copy-raw" title="Copy the raw Endstep state as JSON">Copy raw state</button>
                <button data-action="close-debug" title="Close (Alt+Shift+D)">✕</button>
              </div>
            </div>
            <nav class="tabs">${TABS.map((t) => `<button data-tab="${t.id}">${esc(t.label)}</button>`).join("")}</nav>
          </header>
          <div class="panel-body"></div>
        </section>
      </div>`;
    this.layer = this.root.querySelector(".layer")!;
    this.body = this.root.querySelector(".panel-body")!;
    this.board = new Board(this.controller, {
      onToggleDebug: () => this.setDebug(!this.settings.debug),
      onHide: () => this.setEnabled(false),
      phaseStops: () => this.stops.get(),
      togglePhaseStop: (side, step) => this.stops.toggle(side, step),
      setTemporaryStops: (extra) => this.stops.setTemporary(extra),
      tableMenu: () => readBoardMenu(),
      runTableItem: (label) => this.runTableItem(label),
      replay: (cmd) => this.replays.command(cmd),
      leaveReplay: () => {
        // Endstep's own way out of the replay (back to where it was opened from).
        const leave = document.querySelector<HTMLElement>('[aria-label="Leave the replay"]');
        if (leave) leave.click();
        else history.back();
      },
      leaveSpectate: () => {
        const leave = document.querySelector<HTMLElement>('[aria-label="Stop spectating and leave this game"]');
        if (leave) leave.click();
        else history.back();
      },
      prefs: () => this.settings.prefs,
      setPrefs: (patch) => {
        this.settings.prefs = { ...this.settings.prefs, ...patch };
        saveSettings(this.settings);
      },
    });
    this.layer.prepend(this.board.el);
    document.documentElement.appendChild(this.host);

    this.root.querySelector(".panel")!.addEventListener("click", (e) => this.onClick(e));
    this.root.querySelector(".pill")!.addEventListener("click", (e) => this.onClick(e));
    // Remember which zone <details> the user opened, so re-renders don't collapse them.
    this.root.addEventListener("toggle", (e) => {
      const el = e.target as HTMLElement;
      if (el instanceof HTMLDetailsElement && el.dataset.key) this.openZones.set(el.dataset.key, el.open);
    }, true);
    window.addEventListener("keydown", (e) => {
      if (shortcut(e, "KeyA")) this.setEnabled(!this.settings.enabled);
      else if (shortcut(e, "KeyD")) this.setDebug(!this.settings.debug);
      else return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    this.pacer = new StatePacer({
      show: () => {
        // Each state is drawn as it's handed over (not merged with the next one in a frame).
        this.syncBoard();
        this.invalidate();
      },
      busyUntil: () => this.board.busyUntil(),
      dwellMs: () => this.board.dwellMs(),
    });
    this.adapter.subscribe((state) => this.pacer.push(state));
    this.pacer.push(this.adapter.getGameState());
    this.adapter.subscribe(() => this.invalidate());
    this.render();
  }

  setSocketStatus(status: SocketStatus): void {
    this.socket = status;
  }

  /** The tap reports whether an action actually went out on the socket. */
  onActionResult(ok: boolean, type: string, reason?: "not-allowed" | "not-connected"): void {
    if (!ok) {
      this.board.setAwaiting(false);
      const what = type.toLowerCase().replace(/_/g, " ");
      this.board.toast(reason === "not-allowed" ? `Couldn't send ${what}: the extension doesn't allow this action yet.` : `Couldn't send ${what}: not connected to the game.`);
    }
  }

  /** Gives the board the state the pacer is at, when it changed (or the board was turned on/off). */
  private syncBoard(): void {
    const target = this.settings.enabled ? this.pacer.current : null;
    if (target === this.boardState) return;
    this.boardState = target;
    this.layer.classList.toggle("board-on", !!target);
    this.board.update(target);
  }

  /** Coalesces any number of updates into one render per animation frame (the board itself is
      updated state by state, see syncBoard). */
  invalidate(): void {
    if (this.frame || !this.root) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.render();
    });
  }

  private setEnabled(enabled: boolean): void {
    this.settings.enabled = enabled;
    saveSettings(this.settings);
    this.render();
  }

  private setDebug(debug: boolean): void {
    this.settings.debug = debug;
    saveSettings(this.settings);
    this.lastRawRendered = null;
    this.render();
  }

  private onClick(e: Event): void {
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-action],[data-tab]");
    if (!target) return;
    const tab = target.dataset.tab as DebugTab | undefined;
    if (tab) {
      this.settings.tab = tab;
      saveSettings(this.settings);
      this.lastRawRendered = null;
      this.render();
      return;
    }
    switch (target.dataset.action) {
      case "toggle":
        this.setEnabled(!this.settings.enabled);
        break;
      case "close-debug":
        this.setDebug(false);
        break;
      case "pause":
        this.paused = !this.paused;
        this.render();
        break;
      case "copy-raw":
        void this.copyRaw(target);
        break;
      case "copy-unsupported":
        void this.copyText(target, JSON.stringify(this.unsupported.list().map((e) => ({ ...e, sample: safeParse(e.sample) })), null, 2));
        break;
      case "clear-unsupported":
        this.unsupported.clear();
        saveUnsupported(this.unsupported);
        this.render();
        break;
    }
  }

  private async copyRaw(button: HTMLElement): Promise<void> {
    const state = this.adapter.getGameState();
    const text = JSON.stringify(
      { matchId: state?.matchId, viewerSeat: state?.viewerSeat, seq: state?.seq, state: this.adapter.getRawState() },
      null,
      2,
    );
    await this.copyText(button, text);
  }

  /** Copies to the clipboard, saying so on the button for a moment. */
  private async copyText(button: HTMLElement, text: string): Promise<void> {
    const label = button.textContent;
    let ok = true;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ok = false;
    }
    button.textContent = ok ? "Copied ✓" : "Copy failed";
    setTimeout(() => (button.textContent = label), 1500);
  }

  /** Runs an item of Endstep's table menu. Its window (decklist, settings…) is Endstep's, so the
      board steps aside while it is open and comes back when it closes. */
  private runTableItem(label: string): void {
    this.layer.classList.add("endstep-window");
    const back = () => this.layer.classList.remove("endstep-window");
    void runBoardMenuItem(label).then((ok) => {
      if (!ok) {
        back();
        this.board.toast(`Couldn't open "${label}" from Endstep's menu.`);
        return;
      }
      // Wait for its window to show (items without one come straight back), then to close.
      const start = performance.now();
      let seen = false;
      const check = () => {
        const open = endstepWindowOpen();
        seen ||= open;
        if (seen ? !open : performance.now() - start > 1500) return back();
        setTimeout(check, 200);
      };
      check();
    });
  }

  private render(): void {
    const { enabled, debug, tab } = this.settings;
    const state = this.adapter.getGameState();
    // The board shows the state the pacer is at (the debug panel, the latest).
    const boardVisible = enabled && !!this.pacer.current;
    this.layer.classList.toggle("is-on", enabled);
    this.layer.classList.toggle("has-match", !!state);
    this.layer.classList.toggle("board-on", boardVisible);
    this.layer.classList.toggle("debug-on", enabled && debug);
    this.syncBoard();

    this.root.querySelector(".pill-state")!.textContent = enabled ? "ON" : "OFF";
    this.root.querySelector(".dot")!.setAttribute("title", state ? "Match detected" : `No match (socket: ${this.socket})`);
    for (const b of this.root.querySelectorAll<HTMLElement>("[data-tab]")) b.classList.toggle("active", b.dataset.tab === tab);
    this.root.querySelector('[data-action="pause"]')!.textContent = this.paused ? "Resume" : "Pause";

    if (!enabled || !debug || this.paused) return;
    switch (tab) {
      case "state":
        this.body.innerHTML = renderState(state, this.socket);
        this.restoreZones();
        break;
      case "events":
        this.body.innerHTML = renderEvents(this.adapter.events.toArray());
        break;
      case "network":
        this.body.innerHTML = renderNetwork(this.network.toArray());
        break;
      case "unsupported":
        this.body.innerHTML = renderUnsupported(this.unsupported.list());
        break;
      case "raw": {
        // The raw dump is large; only rebuild it when the state object changed.
        const raw = this.adapter.getRawState();
        if (raw !== this.lastRawRendered) {
          this.lastRawRendered = raw;
          this.body.innerHTML = renderRaw(raw);
        }
        break;
      }
    }
  }

  private restoreZones(): void {
    for (const el of this.body.querySelectorAll<HTMLDetailsElement>("details[data-key]")) {
      const open = this.openZones.get(el.dataset.key!);
      if (open !== undefined) el.open = open;
    }
  }
}
