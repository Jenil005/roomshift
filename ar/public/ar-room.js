import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// Markerless, room-scale WebXR prototype. World scale: 1 unit = 1 meter.
// This is a separate AR room demo; QR puzzle and multiplayer remain independent.
const $ = (id) => document.getElementById(id);
const info = $("status");
const instructions = $("instructions");
const startButton = $("start-ar");
const placeButton = $("place-room");
const resetButton = $("reset-room");
const powerButton = $("restore-power");
const previewButton = $("preview-room");

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.01, 40);
camera.position.set(5, 3.2, 6.5);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.6));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x07141c, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local");
$("viewport").appendChild(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(0, 1.05, 0);
orbit.enableDamping = true;
orbit.minDistance = 3.5;
orbit.maxDistance = 13;

scene.add(new THREE.HemisphereLight(0xaad8f4, 0x274044, 2));
const directional = new THREE.DirectionalLight(0xc8eaff, 2.0);
directional.position.set(2, 5, 3);
scene.add(directional);

const room = new THREE.Group();
scene.add(room);
const activeMaterials = [];
const meter = (color, emissive = 0, strength = 0) => new THREE.MeshStandardMaterial({
  color, emissive, emissiveIntensity: strength, metalness: 0.25, roughness: 0.45
});
const shell = meter(0x253844);
const steel = meter(0x527079);
const teal = meter(0x19c7c4, 0x09a9a7, 0.8);
const danger = meter(0xf18b75, 0xd3503a, 0.65);
const powerMaterial = meter(0xb9ee8d, 0x88d43d, 0.18);
activeMaterials.push(powerMaterial);
const glass = new THREE.MeshStandardMaterial({ color: 0x49848a, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false });
const gridMaterial = new THREE.LineBasicMaterial({ color: 0x55bdca, transparent: true, opacity: 0.85 });

function block(w, h, d, x, y, z, material, parent = room) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function textPlane(text, color = "#b5fbef", w = 1.6, h = 0.34) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 220;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 1024, 220);
  ctx.fillStyle = color;
  ctx.font = "bold 76px monospace";
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 113, 985);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture, transparent: true, depthWrite: false, side: THREE.DoubleSide
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
}

function setStatus(message) { info.textContent = message; }
function setHint(message) { instructions.textContent = message; }

function makeRoom() {
  // Dimensions: 3.4 m wide, 3.4 m deep, 2.5 m high.
  // Semi-transparent/open walls preserve camera awareness of the real room.
  const halfW = 1.7, halfD = 1.7, height = 2.5;
  // Deliberately no opaque floor: real floor remains visible to the player.
  const outlinePts = [
    new THREE.Vector3(-halfW, 0.022, -halfD), new THREE.Vector3(halfW, 0.022, -halfD),
    new THREE.Vector3(halfW, 0.022, halfD), new THREE.Vector3(-halfW, 0.022, halfD),
    new THREE.Vector3(-halfW, 0.022, -halfD),
  ];
  room.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outlinePts), gridMaterial));
  for (const x of [-halfW, halfW]) {
    for (const z of [-halfD, halfD]) {
      block(0.07, height, 0.07, x, height / 2, z, steel);
      block(0.16, 0.06, 0.16, x, 0.025, z, teal);
    }
  }
  for (const y of [0.22, 1.30, height]) {
    block(3.4, 0.035, 0.035, 0, y, -halfD, y === 1.30 ? teal : steel);
    block(0.035, 0.035, 3.4, -halfW, y, 0, steel);
    block(0.035, 0.035, 3.4, halfW, y, 0, steel);
  }
  // Translucent back and side wall panels for lab-room effect.
  block(3.30, 1.75, 0.014, 0, 1.32, -halfD + 0.025, glass);
  block(0.014, 1.75, 3.20, -halfW + 0.023, 1.32, 0, glass);
  block(0.014, 1.75, 3.20, halfW - 0.023, 1.32, 0, glass);

  // Back wall: facility core. Its height makes this unmistakably life-sized.
  block(1.6, 1.3, 0.12, 0, 1.37, -1.61, shell);
  block(1.37, 0.88, 0.035, 0, 1.47, -1.53, meter(0x102a34, 0x04515f, 0.4));
  const title = textPlane("BLACKOUT PROTOCOL", "#b2ffee", 1.20, 0.28);
  title.position.set(0, 1.72, -1.50);
  room.add(title);
  const coreLabel = textPlane("CORE OFFLINE", "#ff907a", 1.05, 0.25);
  coreLabel.position.set(0, 1.38, -1.50);
  room.add(coreLabel);
  room.userData.coreLabel = coreLabel;

  // Consoles: spaced to leave a usable walking area.
  const stations = [
    { name: "BOOK", x: -1.02, z: -0.35, color: 0x3abfc0 },
    { name: "CUP", x: 0, z: -0.35, color: 0x84d495 },
    { name: "KEYS", x: 1.02, z: -0.35, color: 0xe9c58a },
  ];
  for (const station of stations) {
    block(0.67, 0.09, 0.65, station.x, 0.87, station.z, steel);
    block(0.12, 0.78, 0.12, station.x, 0.42, station.z, shell);
    const screen = block(0.51, 0.30, 0.035, station.x, 1.10, station.z - 0.22,
      meter(station.color, station.color, 0.35));
    screen.rotation.x = -0.18;
    const label = textPlane(station.name, "#e9fff1", 0.56, 0.18);
    label.position.set(station.x, 1.28, station.z - 0.20);
    room.add(label);
  }

  // Entrance is intentionally open: users can physically walk into the volume.
  const entryLabel = textPlane("ENTER FACILITY", "#c8f1ae", 1.15, 0.20);
  entryLabel.position.set(0, 2.14, halfD);
  entryLabel.rotation.y = Math.PI;
  room.add(entryLabel);
  block(1.30, 0.07, 0.06, 0, 2.41, halfD, teal);
  block(0.06, 2.35, 0.06, -0.68, 1.175, halfD, steel);
  block(0.06, 2.35, 0.06, 0.68, 1.175, halfD, steel);

  room.userData.powerMaterial = powerMaterial;
  room.visible = false;
}
makeRoom();

// Floor hit-test indicator.
const reticle = new THREE.Mesh(
  new THREE.RingGeometry(0.15, 0.19, 48).rotateX(-Math.PI / 2),
  new THREE.MeshBasicMaterial({ color: 0xb1fc85, side: THREE.DoubleSide, depthTest: false })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

let xrSession = null;
let hitTestSource = null;
let placed = false;
let powered = false;
let preview = false;

function setPower(isOn) {
  powered = isOn;
  powerMaterial.emissiveIntensity = isOn ? 1.5 : 0.18;
  const old = room.userData.coreLabel;
  if (old) {
    room.remove(old);
    old.geometry.dispose(); old.material.map.dispose(); old.material.dispose();
  }
  const next = textPlane(isOn ? "CORE RESTORED" : "CORE OFFLINE", isOn ? "#ccffb1" : "#ff907a", 1.05, 0.25);
  next.position.set(0, 1.38, -1.50);
  room.add(next);
  room.userData.coreLabel = next;
  powerButton.textContent = isOn ? "SIMULATE BLACKOUT" : "RESTORE POWER";
}

function previewRoom() {
  if (xrSession) return;
  preview = true;
  room.position.set(0, 0, 0);
  room.rotation.set(0, 0, 0);
  room.visible = true;
  reticle.visible = false;
  renderer.setClearColor(0x07141c, 1);
  setStatus("3D PREVIEW · NOT AR");
  setHint("This is a desktop 3D preview. On a supported phone, tap START AR, aim at the floor, and place the life-size room.");
  previewButton.textContent = "PREVIEW ACTIVE";
  orbit.enabled = true;
  powerButton.disabled = false;
}
previewButton.addEventListener("click", previewRoom);

function clearPlacement() {
  placed = false;
  room.visible = false;
  placeButton.disabled = true;
  resetButton.disabled = true;
  powerButton.disabled = true;
  setPower(false);
  if (xrSession) setHint("Look at a clear patch of floor until the green placement ring appears. Tap PLACE ROOM or tap the screen.");
}
resetButton.addEventListener("click", clearPlacement);

function placeRoom() {
  if (!xrSession || placed || !reticle.visible) return;
  const pos = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  reticle.matrix.decompose(pos, quaternion, scale);
  room.position.copy(pos);
  // Keep room vertical; face its open entrance toward the player.
  const currentCamera = renderer.xr.getCamera();
  const forward = new THREE.Vector3();
  currentCamera.getWorldDirection(forward);
  const angle = Math.atan2(forward.x, forward.z);
  room.rotation.set(0, angle, 0);
  room.visible = true;
  reticle.visible = false;
  placed = true;
  placeButton.disabled = true;
  resetButton.disabled = false;
  powerButton.disabled = false;
  setStatus("ROOM ANCHORED · 3.4 M × 3.4 M");
  setHint("Room placed in world space. Walk carefully and look around. The virtual walls do not indicate safe physical boundaries.");
}
placeButton.addEventListener("click", placeRoom);
powerButton.addEventListener("click", () => {
  if (!placed && !preview) return;
  setPower(!powered);
  setHint(powered ? "Core online. This is a local visual demo, not a multiplayer mission win." : "Core offline. Restore power when ready.");
});

const controller = renderer.xr.getController(0);
controller.addEventListener("select", placeRoom);
scene.add(controller);

function restoreAfterSession() {
  xrSession = null;
  if (hitTestSource) { hitTestSource.cancel(); hitTestSource = null; }
  placed = false;
  reticle.visible = false;
  room.visible = false;
  preview = false;
  orbit.enabled = true;
  startButton.disabled = false;
  startButton.textContent = "START AR";
  placeButton.disabled = true;
  resetButton.disabled = true;
  powerButton.disabled = true;
  renderer.setClearColor(0x07141c, 1);
  setStatus("AR SESSION ENDED");
  setHint("Start another AR session, or preview the facility in 3D.");
}

async function startAR() {
  if (!navigator.xr) {
    setStatus("IMMERSIVE AR NOT AVAILABLE");
    setHint("This browser lacks markerless immersive WebXR. Try an ARCore-compatible Android phone with Chrome, or use a different cross-platform AR engine for iPhone.");
    return;
  }
  startButton.disabled = true;
  try {
    if (!(await navigator.xr.isSessionSupported("immersive-ar"))) {
      setStatus("IMMERSIVE AR NOT SUPPORTED");
      setHint("This browser or phone cannot start a markerless WebXR AR session. iPhone Safari doesn't currently support it; an 8th Wall or native ARKit version is needed for iPhone.");
      return;
    }
    // dom-overlay is optional; tapping anywhere in the AR scene also places the room.
    const session = await navigator.xr.requestSession("immersive-ar", {
      requiredFeatures: ["hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: $("overlay") }
    });
    xrSession = session;
    session.addEventListener("end", restoreAfterSession, { once: true });
    await renderer.xr.setSession(session);
    preview = false;
    orbit.enabled = false;
    room.visible = false;
    placed = false;
    setPower(false);
    renderer.setClearColor(0x000000, 0);
    startButton.textContent = "EXIT AR";
    startButton.disabled = false;
    setStatus("SCANNING FLOOR");
    setHint("Point the phone toward a flat, unobstructed floor. Move gently until a green ring appears, then place the room.");

    const viewerSpace = await session.requestReferenceSpace("viewer");
    if (session !== xrSession) return;
    hitTestSource = await session.requestHitTestSource({ space: viewerSpace });
  } catch (error) {
    console.error("RoomShift WebXR AR start failed:", error);
    setStatus("AR START FAILED");
    setHint("Could not start markerless AR: " + (error?.message || "unknown error") + ". Check HTTPS, permissions, and ARCore compatibility.");
    if (xrSession) {
      try { await xrSession.end(); } catch (_) { restoreAfterSession(); }
    }
  } finally {
    startButton.disabled = false;
  }
}
startButton.addEventListener("click", () => {
  if (xrSession) xrSession.end();
  else startAR();
});

renderer.setAnimationLoop((_timestamp, frame) => {
  if (xrSession && frame && !placed && hitTestSource) {
    const referenceSpace = renderer.xr.getReferenceSpace();
    if (referenceSpace) {
      const hits = frame.getHitTestResults(hitTestSource);
      const pose = hits.length ? hits[0].getPose(referenceSpace) : null;
      if (pose) {
        reticle.matrix.fromArray(pose.transform.matrix);
        reticle.visible = true;
        placeButton.disabled = false;
        setStatus("FLOOR FOUND · PLACE ROOM");
      } else {
        reticle.visible = false;
        placeButton.disabled = true;
      }
    }
  } else if (xrSession) {
    reticle.visible = false;
  }

  if (!xrSession) orbit.update();
  renderer.render(scene, camera);
});

function onResize() {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener("resize", onResize);

previewRoom(); // Safe 3D preview on desktops; camera AR still requires a supported phone.
if (!isSecureContext) {
  setStatus("HTTPS REQUIRED FOR AR");
  setHint("This address isn't a secure context. Deploy over HTTPS to test world-tracked camera AR on a phone.");
}
