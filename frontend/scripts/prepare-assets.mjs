// Copies runtime assets the game serves as plain files into the git-ignored public/ folders:
// - ../ar/public/models  -> public/models   (self-hosted COCO-SSD, Apache-2.0, see NOTICE.md)
// - ../ar/public/markers -> public/markers  (printable QR tags)
// - @8thwall/engine-binary/dist -> public/external/xr (Niantic XR Engine, copied UNMODIFIED with its license)
// and writes public/external/runtime-manifest.json with SHA-256 hashes for verification.
import { cp, copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const at = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const sha = async (p) => createHash("sha256").update(await readFile(at(p))).digest("hex");

for (const dir of ["public/models", "public/markers", "public/external"]) await rm(at(dir), { recursive: true, force: true });
await cp(at("../ar/public/models"), at("public/models"), { recursive: true });
await cp(at("../ar/public/markers"), at("public/markers"), { recursive: true });

const engine = "node_modules/@8thwall/engine-binary";
await mkdir(at("public/external"), { recursive: true });
await cp(at(`${engine}/dist`), at("public/external/xr"), { recursive: true });
await copyFile(at(`${engine}/LICENSE`), at("public/external/xr/LICENSE-package"));

// Third-party notices served next to the app (see public/licenses.html).
await mkdir(at("public/external/licenses"), { recursive: true });
await copyFile(at("node_modules/three/LICENSE"), at("public/external/licenses/three-LICENSE.txt"));
await copyFile(at("node_modules/jsqr/LICENSE"), at("public/external/licenses/jsqr-LICENSE.txt"));
await copyFile(at("src/assets/fonts/after-burner-neue/After Burner Neue - Read Me.txt"), at("public/external/licenses/after-burner-neue-README.txt"));

const manifest = {
  engine: JSON.parse(await readFile(at(`${engine}/package.json`), "utf8")).version,
  three: JSON.parse(await readFile(at("node_modules/three/package.json"), "utf8")).version,
  sha256: {},
};
for (const name of ["xr.js", "xr-slam.js", "LICENSE"]) manifest.sha256[`external/xr/${name}`] = await sha(`public/external/xr/${name}`);
manifest.sha256["models/coco-ssd/ssdlite_mobilenet_v2/model.json"] = await sha("public/models/coco-ssd/ssdlite_mobilenet_v2/model.json");
await writeFile(at("public/external/runtime-manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`Prepared models, markers and XR Engine ${manifest.engine} (unmodified) in public/.`);
