// Pure HTML renderers for the debug panel tabs. Everything interpolated goes
// through esc(): card names and chat-adjacent text come from other players.

import type { CardView, GameEventEntry, GameState, PlayerView } from "../game/GameState";
import type { NetworkEntry } from "./Overlay";

export const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour12: false });
const dash = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : esc(v));

function nameIndex(state: GameState): Map<string, string> {
  const names = new Map<string, string>();
  for (const p of state.players) {
    names.set(p.id, p.name);
    for (const zone of [p.battlefield, p.graveyard, p.exile, p.commandZone, p.hand ?? []]) {
      for (const c of zone) names.set(c.id, c.name);
    }
  }
  for (const s of state.stack) names.set(s.id, s.name);
  return names;
}

function cardChip(c: CardView): string {
  const flags: string[] = [];
  if (c.tapped) flags.push('<span class="flag tapped" title="Tapped">T</span>');
  if (c.isAttacking) flags.push('<span class="flag atk" title="Attacking">ATK</span>');
  if (c.isBlocking) flags.push('<span class="flag blk" title="Blocking">BLK</span>');
  if (c.isToken) flags.push('<span class="flag" title="Token">tok</span>');
  const pt = c.power !== undefined && c.toughness !== undefined ? `<span class="pt">${esc(c.power)}/${esc(c.toughness)}</span>` : "";
  const loyalty = c.loyalty !== undefined ? `<span class="pt">◆${esc(c.loyalty)}</span>` : "";
  const counters = Object.entries(c.counters)
    .map(([k, n]) => `<span class="counter">${esc(k)}×${esc(n)}</span>`)
    .join("");
  return `<li class="chip${c.tapped ? " is-tapped" : ""}" title="${esc(c.typeLine ?? "")}">${esc(c.name)}${pt}${loyalty}${counters}${flags.join("")}</li>`;
}

function zoneList(key: string, label: string, cards: CardView[] | null, open = false): string {
  if (cards === null) return "";
  return `<details class="zone" data-key="${esc(key)}"${open ? " open" : ""}><summary>${esc(label)} <b>${cards.length}</b></summary>
    ${cards.length ? `<ul class="chips">${cards.map(cardChip).join("")}</ul>` : '<p class="muted">Empty</p>'}</details>`;
}

function playerBlock(p: PlayerView, state: GameState): string {
  const badges = [
    p.isViewer ? '<span class="badge you">You</span>' : "",
    state.activePlayerId === p.id ? '<span class="badge">Active</span>' : "",
    state.priorityPlayerId === p.id ? '<span class="badge prio">Priority</span>' : "",
    p.hasMonarch ? '<span class="badge">Monarch</span>' : "",
    p.hasInitiative ? '<span class="badge">Initiative</span>' : "",
    p.hasLost || p.hasConceded ? '<span class="badge lost">Out</span>' : "",
  ].join("");
  return `<section class="player${p.isViewer ? " is-viewer" : ""}">
    <header><span class="pname">${esc(p.name)}</span>${badges}<span class="life" title="Life">${dash(p.life)}</span></header>
    <div class="stats">
      <span>Library <b>${dash(p.librarySize)}</b></span>
      <span>Hand <b>${dash(p.handSize)}</b></span>
      <span>Graveyard <b>${p.graveyard.length}</b></span>
      <span>Exile <b>${p.exile.length}</b></span>
      ${p.poison ? `<span>Poison <b>${p.poison}</b></span>` : ""}
      ${p.energy ? `<span>Energy <b>${p.energy}</b></span>` : ""}
    </div>
    ${zoneList(`${p.id}:battlefield`, "Battlefield", p.battlefield, true)}
    ${zoneList(`${p.id}:hand`, "Hand", p.hand, p.isViewer)}
    ${zoneList(`${p.id}:graveyard`, "Graveyard", p.graveyard)}
    ${zoneList(`${p.id}:exile`, "Exile", p.exile)}
    ${p.commandZone.length ? zoneList(`${p.id}:command`, "Command zone", p.commandZone) : ""}
  </section>`;
}

export function renderState(state: GameState | null, socket: string): string {
  if (!state) {
    return `<div class="empty">
      <p class="big">No match detected</p>
      <p class="muted">Game socket: <b>${esc(socket)}</b>. Open or start a game on endstep.cc; this panel fills from the live game state.</p>
    </div>`;
  }
  const names = nameIndex(state);
  const n = (id?: string) => (id ? esc(names.get(id) ?? id) : "—");
  const pending = state.pending;
  const stack = state.stack
    .map((s, i) => `<li><span class="idx">${i}</span>${esc(s.name)}${s.isAbility ? ' <span class="flag">ability</span>' : ""}
      <span class="muted">· ${n(s.controllerId)}${s.targets.length ? ` → ${s.targets.map((t) => esc(names.get(t) ?? t)).join(", ")}` : ""}</span></li>`)
    .join("");
  const combat = [
    ...state.combat.attacks.map((l) => `<li><span class="flag atk">ATK</span> ${n(l.fromId)} → ${n(l.toId)}</li>`),
    ...state.combat.blocks.map((l) => `<li><span class="flag blk">BLK</span> ${n(l.fromId)} ⟂ ${n(l.toId)}</li>`),
  ].join("");

  return `
    ${state.desynced ? '<p class="warn">Delta gap: waiting for Endstep to resync the full state…</p>' : ""}
    <dl class="kv">
      <dt>Match</dt><dd class="mono">${esc(state.matchId)}</dd>
      <dt>Seat · seq</dt><dd>${esc(state.viewerSeat)} · ${dash(state.seq)}</dd>
      <dt>Status</dt><dd>${dash(state.status)}</dd>
      <dt>Turn</dt><dd>${dash(state.turnNumber)} · active: ${n(state.activePlayerId)}</dd>
      <dt>Phase / step</dt><dd>${dash(state.phase)} / ${dash(state.step)}</dd>
      <dt>Priority</dt><dd>${n(state.priorityPlayerId)}${state.viewerHasPriority ? ' <span class="badge prio">you</span>' : ""}</dd>
    </dl>
    <h3>Pending action</h3>
    ${pending ? `<dl class="kv">
        <dt>Type</dt><dd><b>${esc(pending.type)}</b> <span class="muted">v${dash(pending.promptVersion)}</span></dd>
        ${pending.message ? `<dt>Message</dt><dd>${esc(pending.message)}</dd>` : ""}
        ${pending.sourceCardName ? `<dt>Source</dt><dd>${esc(pending.sourceCardName)}</dd>` : ""}
        <dt>Playable</dt><dd>${pending.playable.length ? pending.playable.map((o) => `${n(o.cardId)}${o.abilities.length > 1 ? ` (${o.abilities.length})` : ""}`).join(", ") : "—"}</dd>
        ${pending.type !== "PRIORITY" && pending.optionCardIds.length ? `<dt>Options</dt><dd>${pending.optionCardIds.map(n).join(", ")}</dd>` : ""}
      </dl>` : '<p class="muted">None: waiting on the opponent or the engine.</p>'}
    <h3>Stack <b>${state.stack.length}</b></h3>
    ${stack ? `<ol class="list">${stack}</ol>` : '<p class="muted">Empty</p>'}
    ${combat ? `<h3>Combat</h3><ul class="list">${combat}</ul>` : ""}
    <h3>Players</h3>
    ${state.players.map((p) => playerBlock(p, state)).join("")}
    ${state.unrecognizedKeys.length ? `<h3>Unrecognized state keys</h3><p class="mono muted">${state.unrecognizedKeys.map(esc).join(", ")}</p>` : ""}
  `;
}

export function renderEvents(events: GameEventEntry[]): string {
  if (!events.length) return '<p class="muted empty">No GAME_EVENT frames yet.</p>';
  return `<ul class="log">${events
    .map((e) => `<li><span class="muted">${time(e.t)}</span> <b>${esc(e.type)}</b> <code>${esc(JSON.stringify(e.payload).slice(0, 240))}</code></li>`)
    .join("")}</ul>`;
}

export function renderNetwork(entries: NetworkEntry[]): string {
  if (!entries.length) return '<p class="muted empty">No game frames yet.</p>';
  return `<ul class="log">${entries
    .map((e) => `<li class="${e.dir}"><span class="muted">${time(e.t)}</span> <span class="dir">${e.dir === "in" ? "↓" : "↑"}</span> <b>${esc(e.label)}</b>
      <span class="muted">${(e.bytes / 1024).toFixed(1)} KB</span>${e.detail ? `<code>${esc(JSON.stringify(e.detail))}</code>` : ""}</li>`)
    .join("")}</ul>`;
}

export function renderRaw(raw: unknown): string {
  if (!raw) return '<p class="muted empty">No raw state yet.</p>';
  return `<pre class="raw">${esc(JSON.stringify(raw, null, 2))}</pre>`;
}
