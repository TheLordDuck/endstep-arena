// Packs dist/ into releases/endstep-arena-ui-<version>.zip, the file to upload to the Chrome Web
// Store or Edge Add-ons. Run through `npm run package`, which makes a fresh production build first.
// No dependencies: a plain zip (deflate) written with Node's zlib.
import { crc32, deflateRawSync } from "node:zlib";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const manifest = JSON.parse(readFileSync("dist/manifest.json", "utf8"));
// A dev build talks to the local dev server: never ship it.
if (manifest.name.includes("(dev)") || manifest.background || manifest.host_permissions) {
  console.error("dist/ is a dev build. Run `npm run package` (it builds for production first).");
  process.exit(1);
}

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else files.push(path);
  }
})("dist");

const locals = [];
const centrals = [];
let offset = 0;
for (const path of files) {
  const name = Buffer.from(relative("dist", path).split("\\").join("/"));
  const data = readFileSync(path);
  const packed = deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0); // local file header
  header.writeUInt16LE(20, 4); // version needed
  header.writeUInt16LE(0x0800, 6); // UTF-8 names
  header.writeUInt16LE(8, 8); // deflate
  header.writeUInt32LE(0, 10); // time/date: fixed, so builds are reproducible
  header.writeUInt32LE(crc, 14);
  header.writeUInt32LE(packed.length, 18);
  header.writeUInt32LE(data.length, 22);
  header.writeUInt16LE(name.length, 26);
  locals.push(header, name, packed);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0); // central directory header
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(0, 12);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(packed.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, name);
  offset += header.length + name.length + packed.length;
}
const directory = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); // end of central directory
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);

mkdirSync("releases", { recursive: true });
const out = `releases/endstep-arena-ui-${manifest.version}.zip`;
writeFileSync(out, Buffer.concat([...locals, directory, end]));
console.log(`${out}: ${files.length} files, ${(statSync(out).size / 1024).toFixed(0)} KB`);
