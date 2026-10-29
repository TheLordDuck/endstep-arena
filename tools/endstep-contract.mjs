// Reads, from Endstep's client bundles, the parts of its protocol the extension depends on (the
// "contract"), and compares two contracts. Used by tools/check-endstep.mjs; the last contract
// checked is kept in tests/endstep-contract.json, which tests/endstepContract.test.ts holds our
// own code to.
//
// Each piece is found by a pattern in the minified code. A piece not found is reported as such
// (null here): Endstep moved or rewrote that code, and it has to be looked at by hand.
import { createHash } from "node:crypto";

/** Minified code with the names that change on every build (1-3 letters) blanked, so two builds
    of the same code compare equal. */
export function normalize(code) {
  return code
    .replace(/\$\{/g, "§{").replace(/\$/g, "_").replace(/§\{/g, "${")
    .replace(/\b[A-Za-z_][A-Za-z0-9_]{0,2}\b/g, "_")
    .replace(/-[A-Za-z0-9_-]{8}\.js/g, "-H.js");
}

const sha = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);
const ticks = (list) => [...list.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
const sorted = (it) => [...new Set(it)].sort();

/** The array literal of backtick strings that starts with these items. */
function arrayStartingWith(code, ...first) {
  const head = first.map((f) => `\`${f}\``).join(",");
  const m = new RegExp(`\\[${escape(head)}(?:,\`[\\w]+\`)*\\]`).exec(code);
  return m ? ticks(m[0]) : null;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The source of the statement or function around `index`, from the `function`/`var` before it
    to the one after it. */
function around(code, index) {
  const start = Math.max(code.lastIndexOf("function ", index), code.lastIndexOf("var ", index));
  const ends = [code.indexOf("function ", index), code.indexOf("var ", index)].filter((i) => i > 0);
  return code.slice(start, ends.length ? Math.min(...ends) : code.length);
}

/** The keys of an object literal from `at` (just past its first entry) to its closing brace:
    `,a:1,b:{c:2},...x` gives a, b and "..." (a spread). Null when it doesn't close nearby. */
function topLevelKeys(code, at) {
  const keys = [];
  let depth = 0;
  for (let i = at; i < at + 800 && i < code.length; i++) {
    const ch = code[i];
    if (ch === "`") {
      // A template literal: skip it (one level of ${…} inside is enough for minified code).
      for (i++; i < code.length && code[i] !== "`"; i++) if (code[i] === "$" && code[i + 1] === "{") i = code.indexOf("}", i);
    } else if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") {
      if (depth === 0) return ch === "}" ? keys : null;
      depth--;
    } else if (ch === "," && depth === 0) {
      const k = /^(\.\.\.)?([\w$]+)/.exec(code.slice(i + 1, i + 60));
      if (k) keys.push(k[1] ? "..." : k[2]);
    }
  }
  return null;
}

/** Things the extension's socket tap and the adapter rely on, each as a pattern that must be found. */
const MARKERS = {
  "main socket at /ws": /\$\{\w+\.origin\}\/ws\$\{/,
  "actions go out as GAME_ACTION { ...action, matchId }": /\{type:`GAME_ACTION`,payload:\{\.\.\.\w+,matchId:\w+\}\}/,
  "actionId added to GAME_ACTION": /typeof \w+\.actionId==`string`&&\w+\.actionId\.length>0\?\w+:\{\.\.\.\w+,payload:\{\.\.\.\w+\?\?\{\},actionId:/,
  "a match is attached with GAME_ATTACH { matchId }": /\{type:`GAME_ATTACH`,payload:\{matchId:\w+\.matchId\}\}/,
  "GAME_ATTACH_TICKET gives { path, ticket }": /let\{path:\w+,ticket:\w+\}=\w+/,
  "the match socket opens with ATTACH { ticket }": /\{type:`ATTACH`,payload:\{ticket:\w+\}\}/,
  "ATTACHED gives the seat as `audience`": /\w+\(\w+\?\.audience\)/,
  "the match socket carries GAME_STATE / GAME_DELTA / GAME_EVENT": /\.type===`ATTACHED`\?.*?\.type===`GAME_STATE`\?.*?\.type===`GAME_DELTA`\?.*?\.type===`GAME_EVENT`\?/,
  "match socket frames may leave matchId out": /\w+\.matchId===void 0\|\|\w+\.matchId===\w+\.matchId/,
  "deltas apply only on baseSeq === last seq": /\.baseSeq===\w+\.lastSeq/,
  "delta merge: { ...prev, ...patch.state, pendingAction }": /\{\.\.\.\w+,\.\.\.\w+\.patch\.state\?\?\{\},pendingAction:\w+\.pendingAction\}/,
  "player patches are { i, ...fields }": /let\{i(?::\w+)?,\.\.\.\w+\}=\w+;return\{\.\.\.\w+,\.\.\.\w+\}/,
  "MULLIGAN answered with KEEP_HAND / MULLIGAN { keepHand }": /\{type:`KEEP_HAND`,keepHand:!0\}:\{type:`MULLIGAN`,keepHand:!1\}/,
  "players are matched to the viewer as priorityPlayerId === String(seat)": /priorityPlayerId===String\(/,
};

/** The HTTP paths the extension calls (as Endstep builds them). */
const API_PATHS = ["/cards/image?", "/cards/token-image?", "/profiles/avatar-image/", "/profiles/avatars", "/cards/batch",
  "/bug-reports", "/auth/refresh", "/matches/"];

/**
 * The contract, from the bundles: `files` maps a file name to its code.
 * Only the files about the game (they name GAME_STATE, pendingAction or GAME_ACTION) are read for
 * the inventories, so pages unrelated to a match (drafts, tournaments…) don't show up as changes.
 */
export function extractContract(files) {
  const all = Object.values(files).join("\n");
  const gameFiles = Object.entries(files).filter(([, code]) => /GAME_STATE|pendingAction|GAME_ACTION/.test(code));
  const game = gameFiles.map(([, code]) => code).join("\n");

  const meta = /gitSha:`(\w+)`,buildTime:`([^`]+)`/.exec(all);
  const mainBundle = Object.keys(files).find((f) => /^main-[\w-]+\.js$/.test(f)) ?? null;

  // The frame types the client takes from the socket: { GAME_STATE:!0, … }.
  const inbound = /\{((?:[A-Z_]+:!0,)*GAME_STATE:!0(?:,[A-Z_]+:!0)*)\}/.exec(all);
  // Capabilities announced on the socket URL: [`reload`,…] and an optional extra one.
  const caps = /(\[`reload`(?:,`\w+`)*\]),\w+=`(\w+)`/.exec(all) ?? /(\[`reload`(?:,`\w+`)*\])/.exec(all);

  // The delta versions it applies: function a(e){return e===3||e===4} function b(e){return e===2||a(e)}
  const v34 = /function (\w+)\(e\)\{return ((?:e===\d+\|\|)*e===\d+)\}function \w+\(e\)\{return e===(\d+)\|\|\1\(e\)\}/.exec(all);
  const hashVersions = v34 ? sorted([...v34[2].matchAll(/\d+/g)].map((m) => m[0]).concat(v34[3]).map(Number)).map(Number).sort((a, b) => a - b) : null;
  // The fields counted from hashV 4 sit right before that function.
  const extra = /(\[`\w+`(?:,`\w+`)*\]);function \w+\(e\)\{return e===\d/.exec(all);

  // The code that applies a delta and checks its hash: from the replay-style patch (`s` in p) to
  // the private hash (`kr|…`), compared as a whole.
  const hashFile = Object.values(files).find((code) => code.includes("`kr|${"));
  const privAt = hashFile?.indexOf("`kr|${") ?? -1;
  const patchAt = privAt > 0 ? hashFile.lastIndexOf("`s`in ", privAt) : -1;
  const deltaCode = patchAt > 0
    ? normalize(hashFile.slice(hashFile.lastIndexOf("function ", patchAt), hashFile.indexOf("}", hashFile.indexOf(".join(`", privAt)) + 1))
    : null;

  // Outbound actions: every { type: `X`, key: … } literal, as type → its sets of keys.
  const actions = {};
  const inboundTypes = new Set(inbound ? inbound[1].split(",").map((s) => s.split(":")[0]) : []);
  for (const m of game.matchAll(/\{type:`([A-Z_]+)`(?=[,}])/g)) {
    const type = m[1];
    const keys = topLevelKeys(game, m.index + m[0].length);
    if (!keys || inboundTypes.has(type) || keys.some((k) => k === "payload" || k === "message" || k === "timestamp")) continue;
    (actions[type] ??= new Set()).add(sorted(keys).join(",") || "(none)");
  }

  // Prompt types: the labels map { PRIORITY:`Priority`, MULLIGAN:`Mulligan`, … } and the list of
  // prompts Endstep's own panel answers.
  const labels = /\{PRIORITY:`[^`]*`(?:,[A-Z_]+:`[^`]*`)+\}/.exec(game);
  const panel = arrayStartingWith(game, "PRIORITY", "DECLARE_ATTACKERS");
  const prompts = labels || panel
    ? sorted([...(labels ? [...labels[0].matchAll(/([A-Z_]+):`/g)].map((m) => m[1]) : []), ...(panel ?? [])])
    : null;

  // Replays: the format version the decoder migrates to, the record kinds it reads, and the
  // schema hash it compares (only to say "recorded on an older version").
  const replayVersion = /formatVersion<(\w+);/.exec(all) && /function \w+\(\w+,\w+,\w+=\w+,\w+=(\d+)\)\{let \w+=\{header:\w+,records:\w+\};for\(;\w+\.header\.formatVersion</.exec(all);
  const chapterAt = all.indexOf("case`chapter`:");
  const replayKinds = chapterAt > 0 ? sorted([...around(all, all.lastIndexOf("case`key`", chapterAt)).matchAll(/case`(\w+)`/g)].map((m) => m[1])) : null;
  const wireSchema = /wireSchemaHash!==`(\w+)`/.exec(all);

  const markers = Object.fromEntries(Object.entries(MARKERS).map(([name, re]) => [name, re.test(all)]));
  const apiPaths = Object.fromEntries(API_PATHS.map((p) => [p, all.includes(p)]));

  return {
    endstep: { gitSha: meta?.[1] ?? null, buildTime: meta?.[2] ?? null, mainBundle },
    socket: {
      inboundFrames: inbound ? sorted(inboundTypes) : null,
      capabilities: caps ? sorted([...ticks(caps[1]), ...(caps[2] ? [caps[2]] : [])]) : null,
      markers,
    },
    deltas: {
      hashVersions,
      stateFields: arrayStartingWith(all, "phase", "step"),
      playerFields: arrayStartingWith(all, "life", "poisonCounters"),
      zones: arrayStartingWith(all, "battlefield", "graveyard"),
      privateFields: arrayStartingWith(all, "hand", "libraryTop"),
      extraFields: extra ? ticks(extra[1]) : null,
      codeHash: deltaCode ? sha(deltaCode) : null,
    },
    actions: Object.keys(actions).length ? Object.fromEntries(Object.keys(actions).sort().map((t) => [t, sorted(actions[t])])) : null,
    prompts,
    replay: {
      formatVersion: replayVersion ? Number(replayVersion[1]) : null,
      recordKinds: replayKinds,
      wireSchemaHash: wireSchema?.[1] ?? null,
    },
    apiPaths,
    // Everything else, to spot what nothing above covers: the constants (`GAME_ATTACH`…) and the
    // object keys (overlapUntil:…) of the game's code.
    inventory: {
      constants: sorted([...game.matchAll(/`([A-Z][A-Z0-9_]+)`/g)].map((m) => m[1])),
      keys: sorted([...game.matchAll(/[{,]([a-z][A-Za-z0-9]{3,}):/g)].map((m) => m[1])),
    },
  };
}

/** Pieces that may change without anything to fix (reported, but not a failure). */
const INFO_ONLY = new Set(["endstep.gitSha", "endstep.buildTime", "endstep.mainBundle", "replay.wireSchemaHash"]);

/** The differences between a contract and the one before it, as { path, before, after, info }. */
export function compareContracts(before, after) {
  const out = [];
  const walk = (a, b, path) => {
    if (path === "inventory.constants" || path === "inventory.keys") {
      const added = (b ?? []).filter((x) => !(a ?? []).includes(x));
      const removed = (a ?? []).filter((x) => !(b ?? []).includes(x));
      if (added.length || removed.length) out.push({ path, added, removed, info: false });
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a) && !Array.isArray(b)) {
      for (const k of sorted([...Object.keys(a), ...Object.keys(b)])) walk(a[k], b[k], path ? `${path}.${k}` : k);
      return;
    }
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ path, before: a, after: b, info: INFO_ONLY.has(path) });
  };
  walk(before, after, "");
  return out;
}

/** Pieces the patterns didn't find (null, or a marker / path that's false). */
export function missingPieces(contract) {
  const out = [];
  const walk = (v, path) => {
    if (v === null) out.push(path);
    else if (v === false) out.push(path);
    else if (v && typeof v === "object" && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  for (const [k, v] of Object.entries(contract)) if (k !== "endstep") walk(v, k);
  return out;
}
