// Verifies the PUBLISHED build (frontend/dist) is complete and untampered. Exits 1 on any problem.
//   npm run build && npm run verify:dist
// Checks: entry HTML -> every referenced asset exists; PWA files; XR Engine byte-identical to
// the npm package (+ licenses); COCO-SSD model.json and every weight shard; markers; credits;
// the scanner's QR worker chunk; and that no local-demo code (engine, answers) shipped.
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const dist = (p = "") => at(`dist/${p}`);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const problems = [];
let checked = 0;
const check = (ok, message) => {
  checked++;
  if (!ok) problems.push(message);
};
const exists = async (p) => stat(p).then((s) => s.isFile(), () => false);
const read = (p) => readFile(p);

// 1. Entry HTML and everything it references.
const html = (await read(dist("index.html"))).toString();
const refs = [...html.matchAll(/(?:src|href)="(\/[^"]+)"/g)].map((m) => m[1]);
check(refs.some((r) => r.startsWith("/assets/") && r.endsWith(".js")), "index.html has no module script");
for (const ref of refs) check(await exists(dist(ref.slice(1))), `index.html references missing ${ref}`);

// 2. Every JS chunk's static and dynamic imports resolve (catches partial uploads).
const assets = await readdir(dist("assets"));
for (const file of assets.filter((f) => f.endsWith(".js"))) {
  const code = (await read(dist(`assets/${file}`))).toString();
  for (const m of code.matchAll(/["'`](?:\.\/|\/assets\/)([\w.-]+\.(?:js|css|wasm))["'`]/g)) {
    check(assets.includes(m[1]), `${file} imports missing assets/${m[1]}`);
  }
}
check(assets.some((f) => /^decodeWorker-.*\.js$/.test(f)), "QR decode worker chunk missing");
check(assets.some((f) => /^FacilityView-.*\.js$/.test(f)), "facility chunk missing");

// 3. No local-demo code in production (the in-tab engine contains puzzle answers).
for (const file of assets.filter((f) => f.endsWith(".js"))) {
  const code = (await read(dist(`assets/${file}`))).toString();
  check(!code.includes("Knowledge comes before containment"), `${file} contains puzzle answers (mock engine shipped)`);
  check(!/^mockTransport-/.test(file), `${file}: local demo chunk shipped`);
}

// 4. PWA.
for (const f of ["manifest.webmanifest", "sw.js", "icons/icon-192.png", "icons/icon-512.png", "licenses.html", "favicon.svg"]) {
  check(await exists(dist(f)), `missing ${f}`);
}
const manifest = JSON.parse((await read(dist("manifest.webmanifest"))).toString());
for (const icon of manifest.icons) check(await exists(dist(icon.src.replace(/^\//, ""))), `manifest icon missing ${icon.src}`);

// 5. XR Engine: byte-identical to the package, licenses present.
const engine = at("node_modules/@8thwall/engine-binary/dist");
async function compareTree(rel = "") {
  for (const entry of await readdir(`${engine}/${rel}`, { withFileTypes: true })) {
    const path = `${rel}${entry.name}`;
    if (entry.isDirectory()) {
      await compareTree(`${path}/`);
      continue;
    }
    const target = dist(`external/xr/${path}`);
    check((await exists(target)) && sha(await read(target)) === sha(await read(`${engine}/${path}`)), `XR Engine file altered or missing: ${path}`);
  }
}
await compareTree();
check(await exists(dist("external/xr/LICENSE-package")), "XR Engine package license missing");
const runtime = JSON.parse((await read(dist("external/runtime-manifest.json"))).toString());
for (const [file, hash] of Object.entries(runtime.sha256)) check(sha(await read(dist(file))) === hash, `hash mismatch ${file}`);
for (const f of ["three-LICENSE.txt", "jsqr-LICENSE.txt", "after-burner-neue-README.txt"]) check(await exists(dist(`external/licenses/${f}`)), `license copy missing ${f}`);

// 6. COCO-SSD model: model.json and every shard it lists.
const modelDir = "models/coco-ssd/ssdlite_mobilenet_v2";
const model = JSON.parse((await read(dist(`${modelDir}/model.json`))).toString());
for (const group of model.weightsManifest) for (const p of group.paths) check(await exists(dist(`${modelDir}/${p}`)), `model shard missing ${p}`);
check(await exists(dist("models/coco-ssd/NOTICE.md")), "model NOTICE missing");

// 7. MediaPipe: WASM byte-identical to the package; model present, hash recorded, notice kept.
for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm", "vision_wasm_nosimd_internal.js", "vision_wasm_nosimd_internal.wasm"]) {
  const target = dist(`mediapipe/wasm/${f}`);
  check((await exists(target)) && sha(await read(target)) === sha(await read(at(`node_modules/@mediapipe/tasks-vision/wasm/${f}`))), `MediaPipe runtime altered or missing: ${f}`);
}
check(runtime.sha256["models/mediapipe/efficientdet_lite0_fp16.tflite"] !== undefined, "MediaPipe model hash not recorded");
check(await exists(dist("models/mediapipe/NOTICE.md")), "MediaPipe model NOTICE missing");
check(await exists(dist("diagnostics.html")), "diagnostics page missing");

// 8. Printed QR markers for the objects.
for (const id of ["book", "cup", "keys"]) check(await exists(dist(`markers/${id}.svg`)), `marker missing ${id}.svg`);

if (problems.length) {
  console.error(`dist verification FAILED (${problems.length} of ${checked} checks):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(`dist verified: ${checked} checks passed (XR Engine ${runtime.engine} unmodified, ${assets.length} assets).`);
