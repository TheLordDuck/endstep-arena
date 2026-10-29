# Endstep — browser-side analysis

Snapshot taken 2026-09-25 from the public bundles (`/assets/main-CiaJw071.js`,
`/assets/GameView-COOLPVf3.js`). Bundle hashes change on every deploy; the
*protocol* below is what matters and is what `EndstepAdapter` depends on.

**After an Endstep deploy, run `pnpm check:endstep`.** It downloads the live client, reads from it
everything the extension depends on (`tools/endstep-contract.mjs`) and reports what disagrees with
our code (BROKEN) or changed since the deploy last checked (CHANGED, against
`tests/endstep-contract.json`), with the whole difference in `.endstep-cache/diff-<old>-<new>.txt`.
Once the extension is adapted, `pnpm check:endstep --update` keeps the new deploy as the reference,
and `pnpm test` (`tests/endstepContract.test.ts`) holds our code to it.
GitHub runs the check every day (`.github/workflows/endstep-check.yml`, or by hand from the Actions
tab): when something changed it opens an issue labelled `endstep-change` with the report, the whole
difference attached to the run; a later deploy while it's open is a comment on it. Close it after
the `--update`.

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

  Since late October 2026 (`main-6IcZqsvm.js`) deltas may come with `hashV: 3` or `4` (plus a
  `privHash`). After the merge above, those also apply, in the replay's `{ s } / { o, d } / { a }`
  patch form: `patch.stack` to the stack, `patch.zones = [{ i, battlefield?, graveyard?, exile?,
  commandZone? }]` to each player's zones, and `patch.priv = { players: [{ i, set?, unset? }],
  keywordReminders? }`, where `set`/`unset` replace or drop `hand`, `libraryTop`, `exilePeek` and
  `battlefieldPeek` whole. Zone changes no longer ride in `patch.players`.

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
  `attackingDefenderId` is a planeswalker's or battle's card id, or a player as `-(seat + 1)` (the
  client compares it with `-(myPlayerIndex + 1)`), as in targets. Card ids start at 0, so a seat
  number alone can't tell a player from a card.
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
| What `viewerSeat`, hands and `pendingAction` look like for a spectator (the route and frames are known: see section 10) | Spectate a match with the debug panel open. |
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

## 8. Piles and sideboarding (from `GameView-CWl0Jtuj.js` / `SideboardViewBody-gdVnrTFx.js`, 2026-10-07)

### `CHOOSE_PILE`

The prompt carries `piles: [{ id, label, size, cards[] }]` (cards with `id`, `name`,
`selectedSetCode`, `selectedCollectorNumber`); `size - cards.length` cards are face down to the
viewer. Answer: `{ type: "CHOOSE_PILE", stringValue: <pile id> }`.

### Sideboarding

`CHOOSE_CARDS` with `contextType: "sideboard"`. `cardOptions` lists every card of the deck and
sideboard (with `abilities[]` as rules text); `min` / `max` bound the main deck's size (Endstep
falls back to 0 and the list's length); `sideboardState` is `{ mainCount, mode ("SIDEBOARD" |
"COMMANDER_SWAP"), self, opponent ("EDITING" | "SUBMITTED"), sealed, deadlineMs }` (the deadline on
the server's clock). The first `mainCount` (else `min`) cards start in the main deck.

Answers: `{ type: "SIDEBOARD_SUBMIT", orderedCards: [<indexes in cardOptions of the main deck,
ascending>] }`; `{ type: "DECLINE" }` keeps the registered deck ("Keep current");
`{ type: "SIDEBOARD_WITHDRAW" }` takes a submitted deck back. The game number shown is
`matchScore.gamesPlayed + 1` (or the sum of the players' wins + 1).

## 9. Phyrexian mana and divided damage (from `GameView-CWl0Jtuj.js`, 2026-10-07)

### Phyrexian mana

`PAY_MANA` carries `phyrexianMana: true` while a Phyrexian symbol is left that life can pay. The
pay panel then says "Click your plate to pay 2 life"; clicking your plate sends
`{ type: "PAY_LIFE_PHYREXIAN" }` (stamped with the prompt version), which pays one symbol. The
same panel also reads `canAutoPay`, `cancelIsDecline` ("Don't Pay" instead of "Cancel") and
`irreversiblySpent` (mana already spent that backing out won't undo).

### Divided damage

The client has no division UI other than the damage bar for `ASSIGN_DAMAGE` / `DIVIDE_SHIELD`
(answer: `CHOOSE_CARDS` with an amount per option). Its hint for `DIVIDE_SHIELD` reads "Distribute
shield counters". A spell that divides its damage shows it on the stack: each target is
`{ id, zone, dividedAmount }`, logged as "3 to Grizzly Bears". Which prompt asks a spell's division
is still to be seen in a real match.

## 10. Spectating and the game log (from `main-Bqz4EUhN.js` / `GameView-CWl0Jtuj.js`, 2026-10-08)

### Spectating

* Routes: `/spectate/:id` and `/admin/spectate/:id` (the router mounts the same game component
  as `/game/:id`, with `spectate: true`). Links add `?as=<username>` to watch from that player's
  side ("Watch from X's side"); players can share their view with watchers.
* Joining and leaving are HTTP calls: `POST /api/matches/:id/spectate`, `POST
  /api/matches/:id/spectate/leave` (admins: `/admin/matches/:id/spectate…`). Live games to watch:
  `GET /api/matches/live`.
* Frames: the same socket and the same `GAME_STATE` / `GAME_DELTA` / `GAME_EVENT` frames, with
  `matchId` and `viewerSeat`. The client marks the view `isSpectator` and never gives it priority.
* The way out is a button labelled `aria-label="Stop spectating and leave this game"`.

### Game log

* The log is built from `GAME_EVENT` payloads `{ type, message, sequenceNumber, playerIndex
  (seat, as a string), playerName, turnNumber, cardId, cardName, cardIds[], cardNames[] }`.
  `GAME_STARTED` starts a fresh list; the client keeps it in `sessionStorage` per match.
* `message` holds one or more lines. Card names come as `[[Name]]`; lines may carry engine
  details: `{key=[…], …}` blocks, a trailing `[…]` or `([…])`, and ` (id)` after names. The log
  strips those and drops a line that only introduced a details block (`Targets:{…}`).
* Each type has a mark and a color: `SPELL_CAST` ✦, `SPELL_RESOLVED` ✓, `TRIGGER_FIRED` ✶,
  `ABILITY_ACTIVATED` ◈, `LAND_PLAYED` ▲, `CARD_DAMAGED`/`PLAYER_DAMAGED` ◆,
  `PLAYER_LIFE_CHANGED` ♥, `ATTACKERS_DECLARED` ⚔, `BLOCKERS_DECLARED` ⛨, `CARD_COUNTERS` ▣,
  `TOKEN_CREATED` ✧, `TURN_BEGAN` (a turn separator)…
* Replays record the same events as `{ t, k: "event", event }` lines, played into the log as
  the replay moves.

## 11. Match chat (from `main-lSLqJzmy.js`, 2026-10-14)

All on the game socket; a frame's chat is a match's when `payload.matchId` (or the frame's
`matchId`) names it, with no `lobbyId` or `eventChatId` (a frame naming two matches is ignored).

* Inbound `CHAT`: `payload = { message, messageId, userId, username, senderRole ("player" |
  "spectator" | "system"), clientMessageId?, replyTo?, identityHidden?, quickReply?,
  quickRepliesOnly?, matchId }`, `timestamp` on the frame. The server sends your own messages
  back too (with your `clientMessageId`); Endstep's client shows them as pending until then.
  `identityHidden` hides the writer's name ("Opponent"). The client keeps the last 200.
* Outbound `CHAT`: `{ type: "CHAT", payload: { message, matchId, clientMessageId, replyToId?,
  quickReply? } }`; the message trimmed and cut at 500 characters.
* `CHAT_TYPING`, both ways: `payload = { scope: "match", id: <matchId>, active }` (inbound also
  `userId`, `username`, `identityHidden`); an indicator lasts 4 s without news.
* `CHAT_REFUSED`: `payload = { reason, clientMessageId?, matchId?, mutedUntil?, remainingMs? }`,
  reasons `quick_replies_only`, `quick_reply_too_soon`, `quick_reply_repeat`, `spectator_muted`,
  `unknown_quick_reply`. `CHAT_MUTE`: `payload.mute = { reason, mutedUntil, … }` or null.

## 12. Audit after the late-October deploy (from `main-6IcZqsvm.js` / `GameView-DcVpWPDp.js` and every chunk they load, 2026-10-28)

* **Deltas:** `hashV` 3 and 4 patch the stack, zones and private cards on their own (see section 1).
  Anything other than 2, 3 or 4 makes the client resync.
* **The check:** a delta is applied only if the result hashes to `stateHash` (FNV-1a over the top
  level fields, each player's counted fields, each zone's `id:tapped:faceDown` and, from hashV 3,
  each card's and stack item's whole canonical JSON; from hashV 4 also `stormCount`) and, from
  hashV 3, to `privHash` (each player's `hand`, `libraryTop`, `exilePeek`, `battlefieldPeek`, then
  `keywordReminders`). On a mismatch the client sends `PING { matchId, seq, cause }` and the
  server answers with a full `GAME_STATE` on the socket. Ported as `stateHash.ts`; it matches all
  1049 deltas of the recorded fixtures.
* **On load** the page reads the state from `GET /matches/:id/state` (its `stateSeq` is the seq);
  the socket's own `GAME_STATE` still follows, which is what the extension starts from.
* **Replays:** records `key`, `diff`, `event`, `action`, `rejected`, `chapter`, `gap`. After a
  `gap`, diffs have no baseline until the next `key`.
* **Unchanged:** every outbound action type, every prompt type, the frame types, the card, player
  and state fields the adapter reads, the avatar and card image URLs. New fields not used yet:
  `stormCount`, `isPrepared`, `manaRestrictions`, `keywordReminders`.

## 13. Each match on a socket of its own (from `main-CyKvEtqn.js` / `dialog-DXsUFJSe.js`, 2026-10-29)

* **Attaching:** when the main socket (`/ws`) brings a `GAME_STATE` or `GAME_DELTA` of the match
  being viewed, the client sends `GAME_ATTACH { matchId }`. The server answers on the main socket
  with `GAME_ATTACH_TICKET { matchId, path, ticket }` (or `{ matchId, refused }`). The client opens
  `<origin><path>` (a same-origin path), sends `ATTACH { ticket }` and gets `ATTACHED { matchId?,
  audience }`, where `audience` is the viewer's seat as a string. Then it tells the main socket
  `GAME_ATTACH_STATE { matchId, attached: true }`, and on leaving or on `GAME_OVER`, `attached: false`.
* **Frames on the match's socket:** `GAME_STATE`, `GAME_DELTA` (same delta format and hash check;
  on a mismatch it sends `RESYNC`, not `PING`), `GAME_EVENT`, and `PONG` to its `PING { n }`. They
  may leave out `matchId` and `viewerSeat`; the client fills them in (the seat from `audience`).
* **The overlap:** for 5 s after attaching both sockets may carry the match; once attached the
  client drops the main socket's states and deltas, and keeps events it hasn't seen (by
  `sequenceNumber`). `GAME_OVER`, chat and actions stay on the main socket: `GAME_ACTION` goes out
  on `/ws` as before (`actionId` added when missing).
* **The flag** that turns this on is a constant `true` in the bundle, so every match uses it. The
  main socket also announces `cap=…,delta2,delta4,direct1` and sends `HELLO { resume }` on open.
* **The extension:** `wsTap` remembers each ticket, taps the socket that sends `ATTACH` with it,
  and forwards its game frames with the match and seat filled in; its sends still use `/ws`.
  The adapter ignores a delta it already applied and an event it already got.
* **Everything else, against the 2026-10-28 deploy** (both bundles diffed, names normalized):
  unchanged. The game view, every action and prompt, the delta format and its hashes (still
  `hashV` 2/3/4), the frame types, the HTTP paths the extension calls and the replay decoder are
  the same. The macro panel moved to a lazy chunk, and the replay header's `wireSchemaHash` that
  Endstep compares (only to show "Recorded on an older version" in a report) is now
  `1a08e7ca5265430b`.
* **Seen while diffing, not new:** Endstep answers `CHOOSE_ABILITY` with `{ type: "CHOOSE_ABILITY",
  numberValue }` (or `orderedCards` when several can be picked) and backs out with `CANCEL`; the
  board sends `CHOOSE_MODE` and `NO`, as it did before this deploy.
* **The end of a game:** `GAME_OVER` comes on the main socket. Endstep then closes the match's
  socket and goes back to the main one for the rest of the match (sideboarding, the next game).
  The states it got from the match's socket carry no seq for it, so the main socket's counting goes
  on untouched; the adapter keeps each socket's count apart (`via: "match"`, marked by wsTap) and
  always takes a `GAME_OVER`, or the end of a game could look older than the last trigger.

## 14. Pass-until told to the server (`main-yuXmmm6n.js`, build `24b5c8b3a`, 2026-10-29 08:30)

* `SET_PHASE_STOPS` carries `autoPassUntil: { mode: "none" }` on every change of stops.
* A pass the client makes on its own is `PASS_PRIORITY { promptVersion, autoPass, autoPassUntil? }`,
  `autoPass` being why: `"yield"` (yield to the end of turn / all), `"passUntil"` (its pass-until
  modes, with `autoPassUntil: { mode, startTurn, startPhase, … }`) or `"yieldUntil"`. A pass you
  click is still a plain `PASS_PRIORITY`. The board's pass-until sends `autoPass: "passUntil"`.
