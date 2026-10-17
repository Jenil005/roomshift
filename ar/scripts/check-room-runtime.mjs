import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

const root = new URL("../../", import.meta.url);
const engine = new URL("node_modules/@8thwall/engine-binary/dist/", root);
const output = new URL("dist/vendor/8thwall/", root);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
let checked = 0;
async function compareTree(relative = "") {
  for (const entry of await readdir(new URL(relative, engine), {
    withFileTypes: true,
  })) {
    const path = `${relative}${entry.name}`;
    if (entry.isDirectory()) {
      await compareTree(`${path}/`);
      continue;
    }
    assert.equal(
      sha(await readFile(new URL(path, output))),
      sha(await readFile(new URL(path, engine))),
      `Engine artifact altered or incomplete: ${path}`,
    );
    checked++;
  }
}
await compareTree();
for (const [source, destination] of [
  [
    "node_modules/@8thwall/engine-binary/LICENSE",
    "dist/vendor/8thwall/PACKAGE-LICENSE.txt",
  ],
  ["node_modules/three/LICENSE", "dist/vendor/three/LICENSE.txt"],
  [
    "node_modules/three/build/three.module.js",
    "dist/vendor/three/three.module.js",
  ],
  ["node_modules/three/build/three.core.js", "dist/vendor/three/three.core.js"],
  [
    "node_modules/three/examples/jsm/controls/OrbitControls.js",
    "dist/vendor/three/controls/OrbitControls.js",
  ],
])
  assert.equal(
    sha(await readFile(new URL(destination, root))),
    sha(await readFile(new URL(source, root))),
    destination,
  );
const html = await readFile(new URL("dist/ar-room.html", root), "utf8");
assert.ok(html.includes("./vendor/three/three.module.js"));
assert.ok(html.includes("Niantic Spatial"));
assert.ok(html.includes("./room-attribution.html"));
console.log(
  `Verified ${checked} engine artifacts, licenses, and Three.js copies byte-for-byte in the production build.`,
);
