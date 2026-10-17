import {cp, mkdir, copyFile, readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root = new URL('../', import.meta.url);
const path = (p) => fileURLToPath(new URL(p, root));
// Copy the complete official distribution unchanged, including its license.
await mkdir(path('ar/public/external'), {recursive: true});
await cp(path('node_modules/@8thwall/engine-binary/dist'), path('ar/public/external/xr'), {recursive: true});
await copyFile(path('node_modules/@8thwall/engine-binary/LICENSE'), path('ar/public/external/xr/LICENSE-package'));
await cp(path('node_modules/three/build'), path('ar/public/external/three/build'), {recursive: true});
await mkdir(path('ar/public/external/three/addons/controls'), {recursive: true});
await copyFile(path('node_modules/three/examples/jsm/controls/OrbitControls.js'), path('ar/public/external/three/addons/controls/OrbitControls.js'));
await copyFile(path('node_modules/three/LICENSE'), path('ar/public/external/three/LICENSE'));
console.log('Prepared unmodified 8th Wall binary, Three.js and licenses.');

const manifest = {
  engine: JSON.parse(await readFile(path('node_modules/@8thwall/engine-binary/package.json'), 'utf8')).version,
  three: JSON.parse(await readFile(path('node_modules/three/package.json'), 'utf8')).version,
  sha256: {},
};
const {createHash} = await import('node:crypto');
for (const name of ['xr.js', 'xr-slam.js', 'LICENSE']) {
  manifest.sha256[name] = createHash('sha256').update(await readFile(path('ar/public/external/xr/' + name))).digest('hex');
}
await writeFile(path('ar/public/external/runtime-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
