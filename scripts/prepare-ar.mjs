import {cp, mkdir, copyFile} from 'node:fs/promises';
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
