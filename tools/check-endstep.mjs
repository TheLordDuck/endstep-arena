// Checks the live endstep.cc against what the extension depends on, so a deploy that breaks the
// board is found by running one command instead of in a match.
//
//   pnpm check:endstep            check (exit code 1 when something broke or changed)
//   pnpm check:endstep --update   after adapting the extension: keep this deploy as the reference
//
// It downloads Endstep's client (every script the page loads), reads the contract from it (see
// endstep-contract.mjs) and reports:
//   BROKEN    Endstep disagrees with our code (a socket pattern, a delta version or hashed field,
//             an action type, an API path), or a piece of its code we read can't be found
//   CHANGED   differs from the deploy last checked (tests/endstep-contract.json): look at it,
//             adapt what needs it, then --update
//   note      changed but needs nothing (its build id, the replay schema hash)
// The scripts are kept in .endstep-cache/<gitSha>/; when the reference deploy's are there too (or
// still on the server), the whole difference between the two is written to
// .endstep-cache/diff-<old>-<new>.txt, with the names minifying changes blanked out.
import * as esbuild from "esbuild";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { compareContracts, extractContract, missingPieces, normalize } from "./endstep-contract.mjs";

const ORIGIN = "https://endstep.cc";
const SNAPSHOT = "tests/endstep-contract.json";
const CACHE = ".endstep-cache";
const update = process.argv.includes("--update");

/** Every script reachable from `entries` (asset paths), by file name. */
async function crawl(entries) {
  const files = {};
  const queue = [...new Set(entries)];
  const seen = new Set(queue);
  while (queue.length) {
    const batch = queue.splice(0, 8);
    await Promise.all(batch.map(async (path) => {
      const res = await fetch(`${ORIGIN}/${path}`);
      if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
      const code = await res.text();
      files[path.split("/").pop()] = code;
      for (const m of code.matchAll(/assets\/[\w.-]+\.js/g)) if (!seen.has(m[0])) seen.add(m[0]), queue.push(m[0]);
    }));
  }
  return files;
}

const assetsIn = (text) => [...text.matchAll(/\/?(assets\/[\w.-]+\.js)/g)].map((m) => m[1]);

function save(dir, files) {
  mkdirSync(dir, { recursive: true });
  for (const [name, code] of Object.entries(files)) writeFileSync(`${dir}/${name}`, code);
}

function load(dir) {
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".js")).map((f) => [f, readFileSync(`${dir}/${f}`, "utf8")]));
}

/** What our own code expects, from its sources. */
async function ourCode() {
  const out = await esbuild.build({
    stdin: {
      contents: `export { ALLOWED_ACTIONS } from "./src/shared/protocol";
        export * from "./src/game/endstep/stateHash";`,
      resolveDir: ".", loader: "ts",
    },
    bundle: true, write: false, format: "esm", platform: "node",
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
  const tap = readFileSync("src/inject/wsTap.ts", "utf8");
  return {
    actions: [...mod.ALLOWED_ACTIONS],
    hashVersions: [...Array(10).keys()].filter((v) => mod.isKnownHashVersion(v)),
    stateFields: mod.STATE_FIELDS, playerFields: mod.PLAYER_FIELDS, zones: mod.ZONES,
    privateFields: mod.PRIVATE_FIELDS, extraFields: mod.EXTRA_FIELDS,
    socketPath: /u\.pathname === "([^"]+)"/.exec(tap)?.[1] ?? null,
    tapsAttachedSockets: tap.includes("GAME_ATTACH_TICKET") && tap.includes('{"type":"ATTACH"'),
  };
}

/** Where Endstep disagrees with our code. */
function brokenAgainst(contract, ours, files) {
  const out = [];
  const same = (name, theirs, mine, fix) => {
    if (theirs && JSON.stringify(theirs) !== JSON.stringify(mine)) out.push(`${name}: Endstep ${JSON.stringify(theirs)}, ours ${JSON.stringify(mine)} → ${fix}`);
  };
  same("delta versions applied", contract.deltas.hashVersions, ours.hashVersions, "isKnownHashVersion + applyDelta (stateHash.ts, EndstepAdapter.ts)");
  for (const k of ["stateFields", "playerFields", "zones", "privateFields", "extraFields"]) {
    same(`hashed ${k}`, contract.deltas[k], ours[k], "stateHash.ts");
  }
  if (contract.socket.markers["main socket at /ws"] && ours.socketPath !== "/ws") out.push(`the tap watches ${ours.socketPath}, Endstep's main socket is /ws → wsTap.ts`);
  if (contract.socket.markers["a match is attached with GAME_ATTACH { matchId }"] && !ours.tapsAttachedSockets) {
    out.push("Endstep moves each match to a socket of its own, which the tap doesn't follow → wsTap.ts");
  }
  const code = Object.values(files).join("\n");
  for (const type of ours.actions) if (!code.includes(`\`${type}\``)) out.push(`we send ${type}, which Endstep's client no longer names → GameController.ts / protocol.ts`);
  for (const piece of missingPieces(contract)) out.push(`not found in Endstep's code: ${piece} → look at it by hand (docs/ENDSTEP_ANALYSIS.md)`);
  return out;
}

/** The whole difference between two deploys' game scripts, names blanked, as text. */
function fullDiff(oldFiles, newFiles) {
  const lines = (files) => {
    const game = Object.values(files).filter((c) => /GAME_STATE|pendingAction|GAME_ACTION/.test(c)).join("\n");
    return new Set(normalize(game).split(/[;{}]/).map((l) => l.trim()).filter((l) => l.replace(/[\s_,$]/g, "")));
  };
  const a = lines(oldFiles), b = lines(newFiles);
  const added = [...b].filter((l) => !a.has(l)).sort(), removed = [...a].filter((l) => !b.has(l)).sort();
  return `${added.length} added, ${removed.length} removed (statements; 1-3 letter names blanked)\n\n=== ADDED\n${added.join("\n")}\n\n=== REMOVED\n${removed.join("\n")}\n`;
}

const show = (v) => {
  const s = JSON.stringify(v);
  return s && s.length > 160 ? `${s.slice(0, 157)}...` : s;
};

// --- Run.

const index = await (await fetch(`${ORIGIN}/`)).text();
const files = await crawl(assetsIn(index));
const contract = extractContract(files);
const sha = contract.endstep.gitSha ?? "unknown";
save(`${CACHE}/${sha}`, files);
console.log(`Endstep ${sha} (built ${contract.endstep.buildTime}), ${Object.keys(files).length} scripts → ${CACHE}/${sha}/`);

const ours = await ourCode();
const broken = brokenAgainst(contract, ours, files);
const reference = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, "utf8")) : null;
const changes = reference ? compareContracts(reference, contract) : [];

for (const b of broken) console.log(`BROKEN   ${b}`);
for (const c of changes) {
  const tag = c.info ? "note    " : "CHANGED ";
  if (c.added) console.log(`${tag} ${c.path}: +${c.added.join(" +")}${c.removed.length ? ` -${c.removed.join(" -")}` : ""}`);
  else console.log(`${tag} ${c.path}: ${show(c.before)} → ${show(c.after)}`);
}
if (!reference) console.log(`No reference yet: run with --update to keep this deploy as one (${SNAPSHOT}).`);

// The whole difference, when the reference deploy's scripts can be had.
const refSha = reference?.endstep.gitSha;
if (refSha && refSha !== sha) {
  const dir = `${CACHE}/${refSha}`;
  try {
    if (!existsSync(dir) && reference.endstep.mainBundle) save(dir, await crawl([`assets/${reference.endstep.mainBundle}`]));
    if (existsSync(dir)) {
      const out = `${CACHE}/diff-${refSha}-${sha}.txt`;
      writeFileSync(out, fullDiff(load(dir), files));
      console.log(`Whole difference since ${refSha}: ${out}`);
    }
  } catch (e) {
    console.log(`(The scripts of ${refSha} are gone from the server: no whole difference. ${e.message})`);
  }
}

if (update) {
  writeFileSync(SNAPSHOT, `${JSON.stringify(contract, null, 2)}\n`);
  console.log(`${SNAPSHOT} updated to ${sha}.${broken.length ? " (Something is still BROKEN above.)" : ""} Run pnpm test.`);
}
const failing = broken.length + changes.filter((c) => !c.info).length;
if (!failing) console.log("OK: nothing the extension depends on has changed.");
process.exit(failing && !update ? 1 : 0);
