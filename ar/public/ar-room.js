import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createFacility } from "./room/facility.js";
import { PlacementTracker, MAX_FRAME_AGE_MS } from "./room/placement.js";
import { loadXrEngine, requestMotionPermission } from "./room/xr-engine.js";

const $ = (id) => document.getElementById(id);
const startButton = $("start-ar");
const placeButton = $("place-room");
const resetButton = $("reset-room");
const powerButton = $("restore-power");
const previewButton = $("preview-room");
const arCanvas = $("camera-feed");
const { room, setPower } = createFacility();
const tracker = new PlacementTracker();
const previewScene = new THREE.Scene();
const previewCamera = new THREE.PerspectiveCamera(
  65,
  innerWidth / innerHeight,
  0.03,
  40,
);
previewCamera.position.set(5, 3.2, 6.5);
const previewRenderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
});
previewRenderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
previewRenderer.setSize(innerWidth, innerHeight);
previewRenderer.setClearColor(0x07141c, 1);
previewRenderer.outputColorSpace = THREE.SRGBColorSpace;
$("viewport").appendChild(previewRenderer.domElement);
const orbit = new OrbitControls(previewCamera, previewRenderer.domElement);
orbit.target.set(0, 1.05, 0);
orbit.enableDamping = true;
orbit.minDistance = 3.5;
orbit.maxDistance = 13;
function addLighting(scene) {
  scene.add(new THREE.HemisphereLight(0xaad8f4, 0x274044, 2));
  const directional = new THREE.DirectionalLight(0xc8eaff, 2);
  directional.position.set(2, 5, 3);
  scene.add(directional);
}
addLighting(previewScene);

const reticle = new THREE.Group();
reticle.add(
  new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.19, 48).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xd3f88a,
      side: THREE.DoubleSide,
      depthTest: false,
    }),
  ),
);
const footprint = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1.7, 0.01, -1.7),
    new THREE.Vector3(1.7, 0.01, -1.7),
    new THREE.Vector3(1.7, 0.01, 1.7),
    new THREE.Vector3(-1.7, 0.01, 1.7),
    new THREE.Vector3(-1.7, 0.01, -1.7),
  ]),
  new THREE.LineBasicMaterial({ color: 0xd3f88a }),
);
reticle.add(footprint);
reticle.visible = false;

let engine;
let phase = "idle";
let generation = 0;
let stream;
let startupTimeout;
let arScene;
let placed = false;
let powered = false;
let preview = false;
let animation = 0;
let lastFrame = -Infinity;
const active = () => phase === "starting" || phase === "running";
const setStatus = (text) => {
  $("status").textContent = text;
};
const setHint = (text) => {
  $("instructions").textContent = text;
};
const setPowerState = (on) => {
  powered = on;
  setPower(on);
  powerButton.textContent = on ? "SIMULATE BLACKOUT" : "RESTORE POWER";
};
function previewLoop() {
  if (!preview) return;
  orbit.update();
  previewRenderer.render(previewScene, previewCamera);
  animation = requestAnimationFrame(previewLoop);
}
function clearPlacement() {
  placed = false;
  room.visible = false;
  reticle.visible = false;
  tracker.reset();
  placeButton.disabled = true;
  resetButton.disabled = true;
  powerButton.disabled = true;
  setPowerState(false);
}
function stopSession(
  status = "AR STOPPED",
  hint = "Start a new session to scan and place the facility again.",
) {
  generation += 1;
  phase = "idle";
  clearTimeout(startupTimeout);
  preview = false;
  cancelAnimationFrame(animation);
  clearPlacement();
  arScene?.remove(room, reticle);
  arScene = null;
  try {
    engine?.stop();
  } catch (error) {
    console.warn("8th Wall stop failed", error);
  }
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  engine?.clearCameraPipelineModules();
  arCanvas.hidden = true;
  $("aim").hidden = true;
  previewRenderer.domElement.hidden = true;
  startButton.disabled = !engine || !isSecureContext;
  startButton.textContent = "START AR";
  setStatus(status);
  setHint(hint);
}
function previewRoom() {
  if (active()) stopSession();
  clearPlacement();
  preview = true;
  arCanvas.hidden = true;
  $("aim").hidden = true;
  previewRenderer.domElement.hidden = false;
  previewScene.add(room);
  room.position.set(0, 0, 0);
  room.rotation.set(0, 0, 0);
  room.scale.setScalar(1);
  room.visible = true;
  powerButton.disabled = false;
  setStatus("3D PREVIEW · NOT AR");
  setHint(
    "Orbit to inspect the facility. Start AR on your phone to use camera tracking. iPhone validation is pending.",
  );
  cancelAnimationFrame(animation);
  previewLoop();
}
function trackingLimited() {
  room.visible = false;
  reticle.visible = false;
  $("aim").hidden = true;
  placeButton.disabled = true;
  powerButton.disabled = true;
  setStatus("TRACKING LIMITED");
  setHint(
    "Pause walking. Point at a well-lit, textured floor and move the phone slowly. Placement and power are paused until tracking recovers.",
  );
}
function makePipeline(token) {
  const current = () => token === generation && active();
  return {
    name: "roomshift-facility",
    requiredPermissions: () => [
      engine.XrPermissions.permissions().DEVICE_ORIENTATION,
    ],
    onStart: () => {
      if (!current()) return;
      clearTimeout(startupTimeout);
      phase = "running";
      lastFrame = performance.now();
      const { scene, camera } = engine.Threejs.xrScene();
      arScene = scene;
      scene.add(room, reticle);
      addLighting(scene);
      camera.position.set(0, 1.6, 0);
      camera.quaternion.identity();
      // Absolute mode estimates actual height; 1.6 is only the initial pose.
      engine.XrController.updateCameraProjectionMatrix({
        origin: camera.position,
        facing: camera.quaternion,
        cam: { nearClipPlane: 0.03, farClipPlane: 40 },
      });
      startButton.textContent = "STOP AR";
      setStatus("INITIALIZING WORLD TRACKING");
      setHint(
        "Move the phone slowly to estimate scale. Aim the crosshair at a clear floor area for the 3.4 m facility.",
      );
    },
    onUpdate: ({ processCpuResult }) => {
      if (!current() || phase !== "running") return;
      lastFrame = performance.now();
      const { camera } = engine.Threejs.xrScene();
      const pose = tracker.update(camera, processCpuResult?.reality, lastFrame);
      if (!tracker.isTrackingReady(lastFrame)) {
        trackingLimited();
        return;
      }
      if (placed) {
        room.visible = true;
        reticle.visible = false;
        powerButton.disabled = false;
        setHint(
          powered
            ? "Core restored locally. This does not advance a multiplayer mission."
            : "Walk only through a clear real space. Use REPOSITION if the estimated floor or alignment looks wrong.",
        );
        setStatus(
          powered
            ? "CORE RESTORED · LOCAL ONLY"
            : "FACILITY PLACED · WORLD TRACKING",
        );
        return;
      }
      $("aim").hidden = false;
      reticle.visible = Boolean(pose);
      if (pose) {
        reticle.position.copy(pose.position);
        reticle.rotation.set(0, pose.yaw, 0);
      }
      placeButton.disabled = !pose?.ready;
      setStatus(pose?.ready ? "ESTIMATED FLOOR · READY" : "AIM AT THE FLOOR");
      setHint(
        pose?.ready
          ? "The green outline is the estimated 3.4 m footprint. Confirm the real area is clear, then tap PLACE ROOM."
          : "Aim downward at the floor and hold steady. The outline uses an estimated ground plane; it does not detect obstacles.",
      );
    },
    onCameraStatusChange: ({ status, stream: acquired }) => {
      if (!current()) {
        acquired?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (acquired) {
        stream = acquired;
        stream.getTracks().forEach((track) =>
          track.addEventListener(
            "ended",
            () => {
              if (current())
                stopSession(
                  "CAMERA INTERRUPTED",
                  "Restart AR after closing other camera apps or returning to Safari.",
                );
            },
            { once: true },
          ),
        );
      }
      if (status === "requesting") {
        setStatus("CAMERA PERMISSION");
        setHint(
          "Allow Safari camera access to start markerless world tracking.",
        );
      }
      if (status === "failed")
        stopSession(
          "CAMERA ACCESS FAILED",
          "Allow Camera access in Safari website settings, then try again. HTTPS and motion permission are required.",
        );
    },
    onException: (error) => {
      if (current())
        stopSession(
          "AR ERROR",
          `Could not continue tracking: ${error?.message || String(error)}. Retry in Safari after checking permissions.`,
        );
    },
    onPaused: () => {
      if (current())
        stopSession(
          "AR PAUSED",
          "Start a new session when ready. Your previous placement has been cleared.",
        );
    },
    onDetach: () => {
      if (current())
        stopSession(
          "AR STOPPED",
          "The tracking session ended. Start again to place the facility.",
        );
    },
  };
}
function startAR() {
  if (active()) {
    stopSession();
    return;
  }
  if (!engine || !isSecureContext) return;
  if (
    !engine.XrDevice.isDeviceBrowserCompatible({
      allowedDevices: engine.XrConfig.device().MOBILE,
    })
  ) {
    setStatus("MOBILE AR UNAVAILABLE");
    setHint(
      "This browser did not pass the engine compatibility check. Open the HTTPS page directly in iPhone Safari. Desktop preview does not test AR.",
    );
    return;
  }
  const token = ++generation;
  phase = "starting";
  preview = false;
  cancelAnimationFrame(animation);
  clearPlacement();
  previewRenderer.domElement.hidden = true;
  arCanvas.hidden = false;
  startButton.textContent = "CANCEL";
  setStatus("MOTION PERMISSION");
  setHint("Allow Motion & Orientation access, then camera access.");
  // Called directly from the click handler, before any asynchronous work.
  let permission;
  try {
    permission = requestMotionPermission();
  } catch (error) {
    stopSession("MOTION ACCESS FAILED", error.message);
    return;
  }
  void permission
    .then(() => {
      if (token !== generation || !active()) return;
      engine.XrController.configure({
        disableWorldTracking: false,
        scale: "absolute",
        enableWorldPoints: false,
        imageTargetData: [],
        mirroredDisplay: false,
      });
      engine.Threejs.configure({ renderCameraTexture: false });
      engine.addCameraPipelineModules([
        engine.GlTextureRenderer.pipelineModule(),
        engine.Threejs.pipelineModule(),
        engine.XrController.pipelineModule(),
        makePipeline(token),
      ]);
      resize();
      startupTimeout = setTimeout(() => {
        if (token === generation && phase === "starting")
          stopSession(
            "AR START TIMED OUT",
            "No camera session started. Check permissions and reload the page before trying again.",
          );
      }, 30000);
      return engine.run({
        canvas: arCanvas,
        allowedDevices: engine.XrConfig.device().MOBILE,
        cameraConfig: { direction: engine.XrConfig.camera().BACK },
        webgl2: true,
        glContextConfig: { alpha: false, antialias: true },
      });
    })
    .catch((error) => {
      if (token === generation)
        stopSession(
          "AR START FAILED",
          error?.message ||
            "Check camera and motion access in Safari settings.",
        );
    });
}
function placeRoom() {
  if (phase !== "running" || placed) return;
  const pose = tracker.getReadyPose(performance.now());
  if (!pose) return;
  room.position.copy(pose.position);
  room.rotation.set(0, pose.yaw, 0);
  room.scale.setScalar(1);
  room.visible = true;
  placed = true;
  $("aim").hidden = true;
  reticle.visible = false;
  placeButton.disabled = true;
  resetButton.disabled = false;
  powerButton.disabled = false;
  setStatus("FACILITY PLACED · WORLD TRACKING");
  setHint(
    "Walk only through a clear real space. The facility stays in world coordinates; virtual walls are not physical boundaries. Use REPOSITION to move it.",
  );
}
startButton.addEventListener("click", startAR);
placeButton.addEventListener("click", placeRoom);
resetButton.addEventListener("click", () => {
  if (phase !== "running") return;
  clearPlacement();
  setStatus("REPOSITION FACILITY");
  setHint(
    "Aim at another clear floor location. No world-origin reset is used; you are placing a new room transform.",
  );
});
previewButton.addEventListener("click", previewRoom);
powerButton.addEventListener("click", () => {
  if (!preview && (!placed || !tracker.isTrackingReady(performance.now())))
    return;
  setPowerState(!powered);
  setHint(
    powered
      ? "Restore Power activated locally. This is a visual interaction, not a multiplayer mission win."
      : "Core offline. Restore power when ready.",
  );
  // Optional integration seam; no game-state authority or network calls.
  window.dispatchEvent(
    new CustomEvent("roomshift:facility-power", {
      detail: {
        powered,
        source: preview ? "preview" : "8thwall",
        localOnly: true,
      },
    }),
  );
});
function resize() {
  const width = innerWidth,
    height = innerHeight;
  const density = Math.min(devicePixelRatio || 1, 1.5);
  arCanvas.width = Math.round(width * density);
  arCanvas.height = Math.round(height * density);
  previewCamera.aspect = width / height;
  previewCamera.updateProjectionMatrix();
  previewRenderer.setSize(width, height);
}
addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && active())
    stopSession(
      "AR PAUSED",
      "Safari was hidden. Start AR again to scan and place the facility; the previous placement was cleared.",
    );
});
addEventListener("pagehide", () => {
  if (active()) stopSession();
});
arCanvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  if (active())
    stopSession(
      "GRAPHICS INTERRUPTED",
      "Reload this page before restarting AR.",
    );
});
setInterval(() => {
  if (phase === "running" && performance.now() - lastFrame > MAX_FRAME_AGE_MS) {
    tracker.reset();
    trackingLimited();
  }
}, 250);
previewRoom();
resize();
startButton.disabled = true;
startButton.textContent = "LOADING AR ENGINE";
if (!isSecureContext) {
  setStatus("HTTPS REQUIRED");
  setHint(
    "Open a trusted HTTPS deployment on your iPhone. An HTTP LAN address cannot start camera AR.",
  );
  startButton.textContent = "HTTPS REQUIRED";
} else {
  void loadXrEngine(THREE)
    .then((loaded) => {
      engine = loaded;
      startButton.disabled = false;
      startButton.textContent = "START AR";
    })
    .catch((error) => {
      setStatus("AR ENGINE UNAVAILABLE");
      setHint(error.message);
      startButton.textContent = "RELOAD TO RETRY";
    });
}
