import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createFacility} from './facility.js';
import {calibratedFloorY, floorPlacement} from './room-placement.js';

// XR8's Threejs pipeline uses the same Three.js instance as our scene.
window.THREE = {...THREE};
const $ = (id) => document.getElementById(id);
const start = $('start-ar'), place = $('place-room'), move = $('reset-room');
const power = $('restore-power'), preview = $('preview-room'), calibrate = $('calibrate-floor');
const canvas = $('camerafeed');
const {room, setPower} = createFacility();
const content = new THREE.Group();
content.add(room, new THREE.HemisphereLight(0xaad8f4, 0x274044, 2));
const light = new THREE.DirectionalLight(0xc8eaff, 2);
light.position.set(2, 5, 3);
content.add(light);
const reticle = new THREE.Group();
const ring = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.19, 32).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({color: 0xb1fc85, side: THREE.DoubleSide}));
reticle.add(ring);
const points = [[-1.7,-1.7],[1.7,-1.7],[1.7,1.7],[-1.7,1.7],[-1.7,-1.7]]
  .map(([x,z]) => new THREE.Vector3(x, 0.02, z));
reticle.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({color: 0xb1fc85})));
content.add(reticle);
reticle.visible = false;
let active = false, running = false, hasRun = false, ready = false, tracking = false;
let placed = false, powered = false, floorY = null, candidate = null, normalSince = null;
let arCamera = null, previewState = null, watchdog = null, lastFrame = 0, generation = 0;
const origin = new THREE.Vector3(), direction = new THREE.Vector3();
const status = (text) => { if ($('status').textContent !== text) $('status').textContent = text; };
const hint = (text) => { if ($('instructions').textContent !== text) $('instructions').textContent = text; };

function resetPlacement() {
  placed = false; floorY = null; candidate = null; powered = false;
  room.visible = false; reticle.visible = false; setPower(false);
  power.textContent = 'RESTORE POWER';
  place.disabled = move.disabled = power.disabled = true;
  $('calibration').hidden = !active;
  hint('Move the phone gently side to side to initialize scale. Then hold it at the entered height above the floor and tap CALIBRATE FLOOR.');
}
function disposePreview() {
  if (!previewState) return;
  previewState.renderer.setAnimationLoop(null);
  previewState.orbit.dispose();
  previewState.renderer.dispose();
  previewState.renderer.domElement.remove();
  content.removeFromParent();
  previewState = null;
}
function showPreview() {
  if (active) return;
  disposePreview();
  resetPlacement();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07141c);
  scene.add(content);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.05, 40);
  camera.position.set(5, 3.2, 6.5);
  try {
    const renderer = new THREE.WebGLRenderer({antialias: true});
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    renderer.setSize(innerWidth, innerHeight);
    $('viewport').appendChild(renderer.domElement);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 1.05, 0); orbit.enableDamping = true;
    orbit.minDistance = 3.5; orbit.maxDistance = 13;
    previewState = {renderer, camera, orbit};
    room.position.set(0, 0, 0); room.rotation.set(0, 0, 0); room.visible = true;
    power.disabled = false;
    renderer.setAnimationLoop(() => { orbit.update(); renderer.render(scene, camera); });
    status('3D PREVIEW - NOT AR');
    hint('Orbit to inspect the facility. START AR requests the rear camera and motion access. iPhone validation is still pending.');
  } catch (error) { status('3D UNAVAILABLE'); hint(error.message); }
}
function stopAR(message = 'AR STOPPED', detail = 'Camera released. Reload to start a fresh tracking session, or use 3D Preview.') {
  generation++;
  active = false; running = false; tracking = false; normalSince = null;
  clearInterval(watchdog); watchdog = null;
  try { window.XR8?.stop(); } catch (error) { console.error('XR8 stop failed', error); }
  resetPlacement();
  canvas.hidden = true; calibrate.disabled = true; preview.disabled = false;
  start.disabled = false; start.textContent = hasRun ? 'RELOAD AR' : 'START AR';
  status(message); hint(detail);
}
function fail(error) {
  console.error('RoomShift AR:', error);
  stopAR('AR UNAVAILABLE', 'Check HTTPS, Safari camera/motion permissions, and WebGL support. ' + (error?.message || String(error)) + ' Reload to retry; 3D Preview is available.');
}
function resize() {
  // XR8 owns the AR GL context and projection updates after canvas resize.
  canvas.width = innerWidth; canvas.height = innerHeight;
  if (previewState) {
    previewState.camera.aspect = innerWidth / innerHeight;
    previewState.camera.updateProjectionMatrix();
    previewState.renderer.setSize(innerWidth, innerHeight);
  }
}

function update({processCpuResult}) {
  if (!active || !running) return;
  lastFrame = performance.now();
  const reality = processCpuResult?.reality;
  const normal = reality?.trackingStatus === 'NORMAL' && reality?.trackingReason !== 'INITIALIZING';
  normalSince = normal ? (normalSince ?? lastFrame) : null;
  // A short normal interval avoids enabling calibration on a single good frame.
  tracking = normalSince !== null && lastFrame - normalSince >= 1500;
  calibrate.disabled = !tracking;
  candidate = null; reticle.visible = false; place.disabled = true;
  if (!tracking) {
    room.visible = false; power.disabled = true;
    status('INITIALIZING / TRACKING LIMITED');
    hint('Pause walking. Move the phone gently across a well-lit, textured area. The room is hidden until tracking recovers; recalibrate if it drifts.');
    return;
  }
  if (placed) {
    room.visible = true; power.disabled = false;
    status(powered ? 'CORE RESTORED - LOCAL ONLY' : 'ROOM PLACED - WORLD TRACKING');
    hint('Walk slowly in clear physical space. MOVE ROOM recalibrates placement. Restore Power is a local visual simulation.');
    return;
  }
  status(floorY === null ? 'TRACKING - CALIBRATE FLOOR' : 'AIM AT CALIBRATED FLOOR');
  if (floorY === null) {
    hint('Hold the phone at the measured camera height shown below, then tap CALIBRATE FLOOR. This sets a manual floor, not a detected surface.');
    return;
  }
  arCamera.getWorldPosition(origin); arCamera.getWorldDirection(direction);
  candidate = floorPlacement(origin, direction, floorY);
  if (!candidate) {
    hint('Tilt down toward your calibrated floor, 0.4 to 8 meters away. Keep the full 3.4 m square clear.');
    return;
  }
  reticle.position.set(candidate.x, candidate.y, candidate.z);
  reticle.rotation.set(0, candidate.yaw, 0); reticle.visible = true;
  place.disabled = false;
  hint('The green square previews the 3.4 m footprint on your manual floor. Aim at its center and tap PLACE ROOM.');
}

async function startAR() {
  if (hasRun) { location.reload(); return; }
  if (!ready || !isSecureContext || active) return;
  const attempt = ++generation;
  active = true; start.disabled = true; preview.disabled = true;
  status('REQUESTING PERMISSION');
  hint('Allow camera and motion access in Safari. No microphone is used.');
  try {
    // Invoke both permission APIs directly within the user gesture, before awaiting.
    const requests = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
      .filter((type) => typeof type?.requestPermission === 'function')
      .map((type) => type.requestPermission());
    const permissions = await Promise.all(requests);
    if (!active || attempt !== generation) return;
    if (permissions.some((result) => result !== 'granted')) throw new Error('Motion permission was denied.');
    disposePreview(); resetPlacement(); canvas.hidden = false; resize();
    const XR8 = window.XR8;
    XR8.XrController.configure({disableWorldTracking: false, scale: 'absolute'});
    XR8.Threejs.configure({renderCameraTexture: false});
    XR8.addCameraPipelineModules([
      XR8.GlTextureRenderer.pipelineModule(),
      XR8.Threejs.pipelineModule(),
      XR8.XrController.pipelineModule(),
      {
        name: 'roomshift-facility',
        onStart: () => {
          // Permission dialogs can resolve after the page has been hidden/exited.
          if (!active || document.hidden) { XR8.stop(); return; }
          const {scene, camera} = XR8.Threejs.xrScene();
          arCamera = camera;
          camera.near = 0.05; camera.far = 40;
          camera.position.set(0, 1.5, 0); camera.lookAt(0, 1.5, -1);
          XR8.XrController.updateCameraProjectionMatrix({origin: camera.position, facing: camera.quaternion});
          scene.add(content); scene.background = null;
          running = true; lastFrame = performance.now();
          start.disabled = false; start.textContent = 'EXIT AR';
          status('INITIALIZING WORLD TRACKING');
        },
        onUpdate: update,
        onException: (error) => { if (active) fail(error); },
        onCameraStatusChange: ({status: cameraStatus}) => {
          if (active && cameraStatus === 'failed') fail(new Error('Rear camera could not start.'));
        },
      },
    ]);
    hasRun = true;
    start.disabled = false; start.textContent = 'EXIT AR';
    lastFrame = performance.now();
    watchdog = setInterval(() => {
      if (active && performance.now() - lastFrame > (running ? 5000 : 60000)) fail(new Error('Camera/tracking timed out.'));
    }, 1000);
    XR8.run({canvas, allowedDevices: XR8.XrConfig.device().MOBILE,
      cameraConfig: {direction: XR8.XrConfig.camera().BACK},
      sessionConfiguration: {defaultEnvironment: {disabled: true}}});
  } catch (error) { if (active && attempt === generation) fail(error); }
}

calibrate.addEventListener('click', () => {
  if (!active || !tracking || !arCamera || performance.now() - lastFrame > 500) return;
  arCamera.getWorldPosition(origin);
  floorY = calibratedFloorY(origin.y, Number($('camera-height').value));
  if (floorY === null) { hint('Enter a measured camera height between 0.3 and 2.5 meters.'); return; }
  $('calibration').hidden = true;
  move.disabled = false;
});
place.addEventListener('click', () => {
  if (!active || !tracking || !candidate || placed || performance.now() - lastFrame > 500) return;
  room.position.set(candidate.x, candidate.y, candidate.z);
  room.rotation.set(0, candidate.yaw, 0); room.scale.setScalar(1);
  room.visible = true; placed = true; reticle.visible = false;
  place.disabled = true; move.disabled = power.disabled = false;
});
move.addEventListener('click', resetPlacement);
power.addEventListener('click', () => {
  if (!(previewState || (active && placed && tracking && performance.now() - lastFrame <= 500))) return;
  powered = !powered; setPower(powered);
  power.textContent = powered ? 'SIMULATE BLACKOUT' : 'RESTORE POWER';
  status(powered ? 'CORE RESTORED - LOCAL ONLY' : 'CORE OFFLINE - LOCAL ONLY');
});
start.addEventListener('click', () => active ? stopAR() : startAR());
preview.addEventListener('click', showPreview);
addEventListener('resize', resize);
addEventListener('pagehide', () => { if (active) stopAR(); disposePreview(); });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (active) stopAR(); disposePreview(); }
});
canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); if (active) fail(new Error('Graphics context lost.')); });

async function loadEngine() {
  start.disabled = true;
  if (!isSecureContext) { status('HTTPS REQUIRED'); hint('Open this page over trusted HTTPS on your iPhone. 3D Preview does not require camera access.'); return; }
  try {
    await new Promise((resolve, reject) => {
      if (window.XR8) { resolve(); return; }
      const script = document.createElement('script');
      const cleanup = () => { clearTimeout(timer); window.removeEventListener('xrloaded', loaded); };
      const loaded = () => { cleanup(); resolve(); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Engine load timed out.')); }, 30000);
      window.addEventListener('xrloaded', loaded, {once: true});
      script.onerror = () => { cleanup(); reject(new Error('Engine assets missing. Run npm run prepare:ar and deploy the complete build.')); };
      script.src = './external/xr/xr.js'; script.async = true;
      script.dataset.preloadChunks = 'slam'; document.head.appendChild(script);
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('SLAM chunk load timed out.')), 30000);
      window.XR8.loadChunk('slam').then(resolve, reject).finally(() => clearTimeout(timer));
    });
    ready = true; start.disabled = false;
  } catch (error) { fail(error); start.disabled = true; }
}
showPreview();
loadEngine();
