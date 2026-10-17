let loading;

// The official binary is served untouched beside its SLAM chunk and license.
// Only public, documented XR8 APIs are used; the engine is never bundled here.
export function loadXrEngine(three) {
  window.THREE = three;
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    let script;
    const cleanup = () => {
      clearTimeout(timeout);
      window.removeEventListener("xrloaded", ready);
      script?.removeEventListener("error", failed);
    };
    const failed = () => {
      cleanup();
      reject(
        new Error(
          "8th Wall runtime could not load. Check that the deployed vendor/8thwall folder includes xr.js and xr-slam.js.",
        ),
      );
    };
    const ready = async () => {
      try {
        const engine = window.XR8;
        await engine.loadChunk("slam");
        if (
          !engine.XrController ||
          !engine.Threejs ||
          !engine.GlTextureRenderer
        )
          throw new Error(
            "The distributed world-tracking engine is unavailable.",
          );
        cleanup();
        resolve(engine);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const timeout = setTimeout(failed, 30000);
    if (window.XR8) {
      void ready();
      return;
    }
    window.addEventListener("xrloaded", ready, { once: true });
    script = document.createElement("script");
    script.src = new URL("../vendor/8thwall/xr.js", import.meta.url).href;
    script.async = true;
    script.dataset.preloadChunks = "slam";
    script.addEventListener("error", failed, { once: true });
    document.head.appendChild(script);
  });
  return loading;
}

// Invoke both requests synchronously inside the Start button's user gesture.
// Do not await downloading the runtime before asking Safari for sensor access.
export function requestMotionPermission() {
  const requests = [window.DeviceMotionEvent, window.DeviceOrientationEvent]
    .filter((type) => typeof type?.requestPermission === "function")
    .map((type) => type.requestPermission());
  return Promise.all(requests).then((results) => {
    if (results.some((result) => result !== "granted"))
      throw new Error(
        "Motion access was denied. Allow Motion & Orientation Access in Safari settings, then reload and try again.",
      );
  });
}
