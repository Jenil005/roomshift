// Contract test double only. It does not implement SLAM or establish phone support.
(() => {
  const state = {
    modules: [],
    configured: null,
    runOptions: null,
    chunks: [],
    stops: 0,
    tracksStopped: 0,
    status: "NORMAL",
    reason: "UNSPECIFIED",
    cameraPosition: [0, 1.6, 3],
    cameraTarget: [0, 0, 0],
    paused: false,
    powerEvents: [],
    cameraFailure: false,
    compatible: true,
  };
  let scene, camera, timer;
  window.__roomTest = state;
  window.addEventListener("roomshift:facility-power", (e) =>
    state.powerEvents.push(e.detail),
  );
  const frame = () => {
    if (state.paused) return;
    camera.position.set(...state.cameraPosition);
    camera.lookAt(...state.cameraTarget);
    camera.updateMatrixWorld(true);
    state.modules.forEach((module) =>
      module.onUpdate?.({
        processCpuResult: {
          reality: {
            trackingStatus: state.status,
            trackingReason: state.reason,
          },
        },
      }),
    );
  };
  state.frame = frame;
  state.snapshot = () => {
    const room = scene?.getObjectByName("roomshift-facility");
    return {
      camera: camera?.position.toArray(),
      position: room?.position.toArray(),
      rotation: room?.rotation.y,
      scale: room?.scale.toArray(),
      visible: room?.visible,
    };
  };
  window.XR8 = {
    loadChunk: async (name) => {
      state.chunks.push(name);
    },
    XrConfig: {
      device: () => ({ MOBILE: "MOBILE" }),
      camera: () => ({ BACK: "BACK" }),
    },
    XrPermissions: {
      permissions: () => ({ DEVICE_ORIENTATION: "DEVICE_ORIENTATION" }),
    },
    XrDevice: { isDeviceBrowserCompatible: () => state.compatible },
    XrController: {
      configure: (value) => {
        state.configured = value;
      },
      pipelineModule: () => ({ name: "reality" }),
      updateCameraProjectionMatrix: () => {},
    },
    GlTextureRenderer: { pipelineModule: () => ({ name: "camera-feed" }) },
    Threejs: {
      configure: () => {},
      pipelineModule: () => ({ name: "threejs" }),
      xrScene: () => ({ scene, camera }),
    },
    addCameraPipelineModules: (modules) => {
      state.modules = modules;
    },
    clearCameraPipelineModules: () => {
      state.modules = [];
    },
    run: (options) => {
      state.runOptions = {
        allowedDevices: options.allowedDevices,
        cameraConfig: options.cameraConfig,
      };
      if (state.cameraFailure) {
        state.modules.forEach((module) =>
          module.onCameraStatusChange?.({ status: "failed" }),
        );
        return;
      }
      scene = new window.THREE.Scene();
      camera = new window.THREE.PerspectiveCamera(
        65,
        innerWidth / innerHeight,
        0.03,
        40,
      );
      const track = {
        stop: () => {
          state.tracksStopped++;
        },
        addEventListener: () => {},
      };
      state.modules.forEach((module) =>
        module.onCameraStatusChange?.({
          status: "hasStream",
          stream: { getTracks: () => [track] },
        }),
      );
      state.modules.forEach((module) => module.onStart?.({}));
      frame();
      timer = setInterval(frame, 50);
    },
    stop: () => {
      state.stops++;
      clearInterval(timer);
      state.modules.forEach((module) => module.onDetach?.({}));
    },
  };
  window.dispatchEvent(new Event("xrloaded"));
})();
