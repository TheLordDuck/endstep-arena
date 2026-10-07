# Endstep — browser-side analysis

Snapshot taken 2026-09-25 from the public bundles (`/assets/main-CiaJw071.js`,
`/assets/GameView-COOLPVf3.js`). Bundle hashes change on every deploy; the
*protocol* below is what matters and is what `EndstepAdapter` depends on.

## 1. Page architecture

| Aspect | Finding |
| --- | --- |
| Framework | React SPA built with Vite, mounted on `<div id="root">`. Routes are lazy chunks (`GameView`, `DraftView`, …). |
| Match route | `/game/:matchId` (built as `` `/game/${encodeURIComponent(id)}` ``, optional `?tournament=`). |
| CSP | `script-src 'self'`, `connect-src 'self' … ws: wss:`, `img-src 'self' data: blob: *.scryfall.io`. Extension content scripts declared in the manifest are **not** subject to the page CSP. |
| Card images | Same-origin `/api/cards/image?name=…&set=…&cn=…[&face=back][&version=…]` (302 → Scryfall CDN). Tokens: `/api/cards/token-image?name=…&pow=…&tou=…`. |
| Globals | No game state is exposed on `window`. State lives in React hooks/refs. |

## 2. Where the game state comes from → **WebSocket** (chosen source)

One socket per tab: `wss://endstep.cc/ws?…&mv=1&pv=1[&gw=<owner>]`, JSON text frames
`{ type, payload, matchId?, seq?, viewerSeat?, timestamp? }`.

Inbound types (the client's own whitelist): `GAME_STATE`, `GAME_DELTA`, `GAME_EVENT`,
`GAME_OVER`, `GAME_GONE`, `MATCH_STATUS`, `ATTACH` (`payload.frames[]` = batched
frames), `ACTION_REFUSED`, `MOVE` (reconnect to another host), `CHAT`, `PING/PONG`,
lobby/draft/tournament/social types.

### Full state and deltas

* `GAME_STATE` / `GAME_OVER`: `payload` is the full state for this viewer; frame carries `matchId`, `seq`, `viewerSeat`.
* `GAME_DELTA`: `payload = { baseSeq, stateHash, hashV: 2, patch: { state?, players? }, pendingAction }`.
  Applied only if `baseSeq === lastSeq`. The client's merge (function `Mde`) is:

  ```js
  next = { ...prev, ...patch.state, pendingAction: payload.pendingAction };
  // patch.players = [{ i: <index>, ...changedFields }]
  next.players = prev.players.map((p, i) => byIndex[i] ? { ...p, ...rest(byIndex[i]) } : p);
  ```

  On gap or hash mismatch the page re-requests a full state, and that new `GAME_STATE`
  goes over the same socket, so a passive observer resyncs on its own.

### State fields confirmed in the bundle

* **Top level**: `players[]`, `stack[]`, `pendingAction`, `phase`, `step`, `activePlayerId`,
  `priorityPlayerId`, `turnNumber`, `priorityPromptVersion`, `sequenceNumber`,
  `monarchPlayerId`, `isDay`, `isNight`, `clock`, `idleTimeout`, `status` (`"COMPLETE"` at end),
  `winnerId`, `macro.state`.
* **Player IDs are seat indexes as strings**: the UI checks `priorityPlayerId === String(myPlayerIndex)`.
* **Player**: `displayName`, `username`, `userId`, `seatIndex`, `life`, `poisonCounters`,
  `librarySize`, `handSize`, `hand[]`, `battlefield[]`, `graveyard[]`, `exile[]`, `commandZone[]`,
  `manaPool`, `manaRestrictions`, `energyCounters`, `experienceCounters`, `radCounters`,
  `ringTempts`, `hasCitysBlessing`, `hasInitiative`, `hasMonarch`, `hasLostGame`,
  `hasConceded`, `dungeonRoomId`, `commanderTax`, `commanderDamage`.
* **Card / permanent**: `id`, `name`, `ownerId`, `controllerId`, `tapped`, `faceDown`, `isToken`,
  `isCommander`, `power`, `toughness`, `loyalty`, `damage`, `counters`, `attachments`,
  `setCode`, `collectorNumber`, `manaCost`, `typeLine`, `oracleText`, `colors`.
* **Combat** (per permanent): `isAttacking` + `attackingDefenderId`, `isBlocking` + `blockingIds[]`.
* **Stack item**: `id`, `name`, `isAbility`, `controllerId`, `sourceCardId`, `targets`.
* **pendingAction** (the viewer's current prompt): `type` ∈ `PRIORITY`, `DECLARE_ATTACKERS`,
  `DECLARE_BLOCKERS`, `CHOOSE_TARGETS`, `CHOOSE_MODE`, `CHOOSE_ABILITY`, `CHOOSE_COLOR`,
  `CHOOSE_CARDS`, `CHOOSE_NUMBER`, `CHOOSE_TYPE`, `CHOOSE_MANA`, `CHOOSE_CARD_NAME`,
  `CHOOSE_PILE`, `PAY_MANA`, `MULLIGAN`, `ORDER_*`, yes/no… plus `promptVersion`, `message`,
  `sourceCardId`, `sourceCardName`, `cardOptions[]` (each with `id`, `playableAbilities[]`),
  `modeOptions`, `stringOptions`.
  **This is the source of truth for "which actions are legal right now"**, so the UI never has to invent buttons.

### GAME_EVENT payload types seen

`GAME_STARTED`, `PLAYER_LIFE_CHANGED`, `PLAYER_DAMAGED`, `PLAYER_POISONED`, `PLAYER_COUNTERS`,
`PLAYER_RADIATION`, `PLAYER_CONTROL`, `PLAYER_STATS_CHANGED`, `ATTACKERS_DECLARED`,
`BLOCKERS_DECLARED`, … (useful later to trigger animations).

## 3. Outbound actions (for Phase 8, not used yet)

`{ type: "GAME_ACTION", payload: { ...action, matchId, actionId: uuid, promptVersion? } }`

The page adds `matchId` and `actionId`, and adds `promptVersion` from the current `pendingAction` (function `mS`).
Examples lifted from the client:

```js
{ type: "PASS_PRIORITY" }
{ type: "PASS_PRIORITY", yieldUntilStackEmpty: true }
{ type: "PLAY_CARD", cardId, abilityIndex, autoPassAfter }
{ type: "TAP_MANA", cardId }
{ type: "CHOOSE_TARGETS", targets: [id] }
{ type: "DECLARE_ATTACKERS", … }  { type: "DECLARE_BLOCKERS", … }
{ type: "YES" } / { type: "NO" }  { type: "MULLIGAN" } / { type: "KEEP_HAND" }
{ type: "CONCEDE_MATCH" }
```

The server answers bad actions with `ACTION_REFUSED`.

## 4. DOM

The game DOM is **not** needed to read state, because the socket carries all of it. We will need it later to hide
the original board (Phase 3) and possibly as an interaction fallback.

Class hints in the bundle: `frame-attacker`, `frame-blocker`. The layout has modes `triptych | stacked | focus | equal`.

## 5. UNKNOWN (verify during a real match with the debug panel)

| Unknown | How to check |
| --- | --- |
| Exact payload of `DECLARE_ATTACKERS` / `DECLARE_BLOCKERS` / `CHOOSE_CARDS` | Debug → Network tab shows outbound `GAME_ACTION` frames. Declare an attack in the normal UI and read the frame. |
| Stack order (is the top of the stack `stack[0]` or `stack[last]`?) | Cast a spell, respond to it, then compare Debug → State with the original UI. |
| Shape of `counters`, `commanderDamage`, `manaPool`, `targets` | Debug → **Copy raw state** while those exist, then inspect the JSON. |
| Is the opponent's `hand` omitted, `null`, or an array of face-down cards? | Debug → Raw tab. |
| Does spectating use the same `/game/:id` route and frames? | Spectate a match with the debug panel open. |
| Stable DOM hooks for hiding the original board | Inspect `#root` during a match (Phase 3). |
| Top-level keys not yet known | Debug → State lists "unrecognized keys" automatically. |

## 6. Disconnects and replays (from `main-Bqz4EUhN.js` / `ReplayView-CNZ3FOUJ.js`, 2026-10-06)

### `SEAT_CONNECTIVITY` (socket)

`{ type: "SEAT_CONNECTIVITY", payload: { matchId?, playerIndex, connected, graceDeadline?, serverNowMs?, playerName? } }`
(the fields may also sit on the frame itself). `playerIndex` is the index in `players`.
`graceDeadline` is on the server clock: Endstep shows "concedes in m:ss" from
`graceDeadline - (Date.now() + (serverNowMs - Date.now() at receipt))`; with no deadline it says
"waiting for them to reconnect". It ignores players who already lost or conceded.

### Replays (HTTP, no socket)

* Files: `GET /api/replays/:id/file` (gzip, `?download=1` to save), list at `/api/me/replays`.
  Pages: `/replay/:id`, `/replay/local` (a picked `.esreplay` file), `/admin/…/replay`.
* Format: JSON lines. Line 1 is the header `{ format: "endstep-replay", formatVersion: 1, seat,
  players: [{ seat, name }], result, games, complete, … }`. Each further line is `{ t, k, at? }` with
  `k` ∈ `key` (`state`: a full GAME_STATE payload), `diff` (`patch`), `event`, `action`,
  `rejected`, `chapter`, `gap`.
* Patch: `{ s }` replaces; `{ o: {key: patch}, d?: [keys] }` patches/deletes keys; `{ a: [...] }`
  rebuilds an array, each entry `{ v }` (a new value) or `{ id, p? }` (the old element with that id,
  patched by `p`).
* Timeline: every `key`/`diff` whose resulting state has ≥ 2 players is one frame (the player's
  position slider, `role="slider"` `aria-label="Replay position"`, has `aria-valuenow` = frame).

## 7. Clocks and passing until (from `GameView-CWl0Jtuj.js` / `SideboardView-DmVxwwX8.js`, 2026-10-07)

### Match clock (`state.clock`)

`{ serverNowMs, runningSide, runningSideDeadlineMs, remainingMs[], timedOutSide }` (older states:
`player0RemainingMs` / `player1RemainingMs` instead of `remainingMs`). Sides are seat indexes as
strings. The running side's time is `runningSideDeadlineMs - (Date.now() + skew)`, the others'
`remainingMs[seat]`. `skew` is the largest `serverNowMs - Date.now()` seen. Endstep shows `m:ss`,
red under 30 s; a replay uses `serverNowMs` as "now" (frozen).

### Idle timer (`state.idleTimeout`)

`{ seat, deadlineMs, serverNowMs, away, graceMs }` (grace 30 s by default). The banner reads
"Waiting on you" / "Still deciding" / "Stepped away", and "Last call" within the grace: the
player forfeits the match when it runs out.

### Pass until

Done on the client, with no action of its own: modes `combat`, `endOfTurn`, `myNextTurn`,
`prevEndStep` (the end step before your turn) and `untilAction` (until an opponent acts or the
end step). While one is set, each priority prompt is answered with `PASS_PRIORITY` (stamped with
its prompt version) until the mode's condition is met; any prompt other than `PRIORITY` cancels
it. `prevEndStep` and `untilAction` add the stops they need to the `SET_PHASE_STOPS` they send
(e.g. the opponent's `END_STEP`).
