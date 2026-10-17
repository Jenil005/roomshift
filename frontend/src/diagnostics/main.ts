// Tester diagnostics: device capabilities, detector load and inference timing, raw scores.
// Shows actual model outputs only. No game state, tokens or images leave the device.
import { loadCocoSsdDetector, releaseCocoSsdDetector } from "../../../ar/detect/cocoSsdDetector";
import { loadMediaPipeDetector, releaseMediaPipeDetector } from "../../../ar/detect/mediapipeDetector";
import type { ObjectDetector } from "../../../ar/detect/ObjectDetector";
import type { RawDetection } from "../../../ar/detect/objectClasses";

type Kind = "mediapipe" | "coco";
const $ = (id: string) => document.getElementById(id)!;
const log = (line: string) => {
  $("log").textContent = `${line}\n${$("log").textContent}`;
};
const detectors: Partial<Record<Kind, ObjectDetector>> = {};

function simd() {
  try {
    // Smallest module using a SIMD instruction (v128.const); validates only if SIMD exists.
    return WebAssembly.validate(
      new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 22, 1, 20, 0, 253, 12, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 11]),
    );
  } catch {
    return false;
  }
}

async function environment() {
  const gl2 = !!document.createElement("canvas").getContext("webgl2");
  const gl = gl2 || !!document.createElement("canvas").getContext("webgl");
  const manifest = await fetch(`${import.meta.env.BASE_URL}external/runtime-manifest.json`).then(
    (r) => (r.ok ? r.json() : null),
    () => null,
  );
  $("env").textContent = [
    `secure context: ${isSecureContext}`,
    `WebGL: ${gl}  WebGL2: ${gl2}`,
    `WebAssembly: ${typeof WebAssembly === "object"}  SIMD: ${typeof WebAssembly === "object" && simd()}`,
    `camera API: ${!!navigator.mediaDevices?.getUserMedia}`,
    `motion permission API: ${typeof (DeviceMotionEvent as unknown as { requestPermission?: unknown }).requestPermission === "function"}`,
    `device memory: ${(navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? "n/a"} GB  pixel ratio: ${devicePixelRatio}`,
    `XR Engine: ${manifest?.engine ?? "missing"}  three: ${manifest?.three ?? "missing"}  MediaPipe: ${manifest?.mediapipe ?? "missing"}`,
    `user agent: ${navigator.userAgent}`,
  ].join("\n");
}

async function load(kind: Kind): Promise<ObjectDetector> {
  const existing = detectors[kind];
  if (existing) return existing;
  const t0 = performance.now();
  const detector = await (kind === "mediapipe" ? loadMediaPipeDetector() : loadCocoSsdDetector());
  detectors[kind] = detector;
  log(`${detector.name} loaded in ${Math.round(performance.now() - t0)} ms`);
  return detector;
}

async function detectCanvas(kind: Kind, canvas: HTMLCanvasElement) {
  const detector = await load(kind);
  const t0 = performance.now();
  const detections = await detector.detect(canvas);
  return { name: detector.name, ms: performance.now() - t0, detections };
}

function report(kind: Kind, ms: number, detections: RawDetection[]) {
  const lines = [...detections]
    .sort((a, b) => b.score - a.score)
    .map((d) => `  ${d.label.padEnd(12)} ${(d.score * 100).toFixed(1)}%  box ${d.bbox.map((v) => Math.round(v)).join(",")}`);
  log(`${kind}: ${detections.length} detections in ${Math.round(ms)} ms\n${lines.join("\n") || "  (none)"}`);
}

/** Same input width as the game scanner (AI_FRAME_WIDTH). */
function toCanvas(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 640 / width);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function cameraFrame() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    await video.play();
    return toCanvas(video, video.videoWidth, video.videoHeight);
  } finally {
    stream.getTracks().forEach((t) => t.stop()); // one frame only
  }
}

const guard = (fn: () => Promise<void>) => () =>
  void fn().catch((e: unknown) => log(`error: ${e instanceof Error ? e.message : String(e)}`));

$("load-mediapipe").addEventListener("click", guard(async () => void (await load("mediapipe"))));
$("load-coco").addEventListener("click", guard(async () => void (await load("coco"))));
$("frame").addEventListener(
  "click",
  guard(async () => {
    const kinds = Object.keys(detectors) as Kind[];
    if (!kinds.length) return log("Load a model first.");
    const canvas = await cameraFrame();
    for (const kind of kinds) {
      const { ms, detections } = await detectCanvas(kind, canvas);
      report(kind, ms, detections);
    }
  }),
);
$("release").addEventListener("click", () => {
  releaseMediaPipeDetector();
  releaseCocoSsdDetector();
  delete detectors.mediapipe;
  delete detectors.coco;
  log("models released");
});

// Test hook (also handy in a desktop console): raw detections for an image URL.
(window as unknown as { __detectImage: unknown }).__detectImage = async (kind: Kind, url: string) => {
  const image = new Image();
  image.src = url;
  await image.decode();
  const result = await detectCanvas(kind, toCanvas(image, image.naturalWidth, image.naturalHeight));
  report(kind, result.ms, result.detections);
  return result;
};

void environment();
