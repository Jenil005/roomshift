import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = new URL("../../", import.meta.url);
const vendor = new URL("ar/public/vendor/", root);
const engine = new URL("node_modules/@8thwall/engine-binary/", root);
const three = new URL("node_modules/three/", root);
const enginePackage = JSON.parse(
  await readFile(new URL("package.json", engine), "utf8"),
);
const threePackage = JSON.parse(
  await readFile(new URL("package.json", three), "utf8"),
);
if (
  enginePackage.name !== "@8thwall/engine-binary" ||
  enginePackage.version !== "1.0.0"
) {
  throw new Error(
    "Expected the pinned official 8th Wall distributed engine binary 1.0.0.",
  );
}
if (threePackage.version !== "0.174.0")
  throw new Error("Unexpected Three.js version.");
await mkdir(vendor, { recursive: true });
// Copy the complete official distribution byte-for-byte. Never bundle, patch,
// recompile, or minify the proprietary engine or its SLAM chunk.
await cp(new URL("dist/", engine), new URL("8thwall/", vendor), {
  recursive: true,
});
await cp(
  new URL("LICENSE", engine),
  new URL("8thwall/PACKAGE-LICENSE.txt", vendor),
);
await mkdir(new URL("three/controls/", vendor), { recursive: true });
for (const name of ["three.module.js", "three.core.js"]) {
  await cp(new URL(`build/${name}`, three), new URL(`three/${name}`, vendor));
}
await cp(
  new URL("examples/jsm/controls/OrbitControls.js", three),
  new URL("three/controls/OrbitControls.js", vendor),
);
await cp(new URL("LICENSE", three), new URL("three/LICENSE.txt", vendor));
const hashes = {};
for (const name of ["xr.js", "xr-slam.js", "LICENSE"]) {
  const bytes = await readFile(new URL(`dist/${name}`, engine));
  hashes[name] = createHash("sha256").update(bytes).digest("hex");
}
await writeFile(
  new URL("runtime-manifest.json", vendor),
  JSON.stringify(
    {
      engine: {
        package: enginePackage.name,
        version: enginePackage.version,
        source: "https://github.com/8thwall/engine",
        sha256: hashes,
      },
      three: {
        version: threePackage.version,
        source: "https://github.com/mrdoob/three.js",
      },
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Prepared unmodified 8th Wall SLAM runtime and Three.js in ${fileURLToPath(vendor)}`,
);
