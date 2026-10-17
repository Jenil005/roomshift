import { detectMarkers } from "../detectMarkers";
import type { DecodeRequest, DecodeResponse } from "../scan/decodeWorker";
import { scanErrorCode, type ScanEndReason } from "../scan/CameraScanSession";
import type {
  DetectedMarker,
  MarkerId,
  ObjectSighting,
  ScanErrorCode,
} from "../types";
import { mergeHybrid } from "./hybrid";
import {
  mapDetections,
  qrOnlyIds,
  type OtherSighting,
  type RawDetection,
} from "./objectClasses";
import type { ObjectDetector } from "./ObjectDetector";

// Inference input is about 640 px wide; QR decoding keeps the QR scanner's 960 px for small tags.
export const AI_FRAME_WIDTH = 640;
const QR_FRAME_WIDTH = 960;
// At most ~4 inferences per second, and never two at once, to keep iPhones cool.
export const AI_MIN_INTERVAL_MS = 250;

export type AiFrame = {
  /** Current-frame evidence: AI objects plus QR tags for the objects AI cannot see. */
  sightings: ObjectSighting[];
  /** Other classes the model saw (not puzzle objects). */
  others: OtherSighting[];
  /** Capture time of the frame (performance.now()). */
  at: number;
  inferenceMs: number;
  frameWidth: number;
  frameHeight: number;
};

/**
 * Rear-camera AI scanning. Each cycle captures one frame, runs the detector on it and, for
 * the objects the detector cannot see (KEYS with COCO-SSD), decodes QR tags from the same
 * frame in a worker. Frames are processed in memory and discarded; nothing is uploaded.
 * The camera is released on stop() and when the page hides.
 */
export class AiScanSession {
  private frameCbs: ((frame: AiFrame) => void)[] = [];
  private errorCbs: ((e: { code: ScanErrorCode }) => void)[] = [];
  private endedCbs: ((reason: ScanEndReason) => void)[] = [];
  private generation = 0;
  private stream?: MediaStream;
  private video?: HTMLVideoElement;
  private worker?: Worker;
  private timer = 0;
  private seq = 0;
  private qrWaiters = new Map<number, (markers: DetectedMarker[]) => void>();
  private aiCanvas = document.createElement("canvas");
  private qrCanvas = document.createElement("canvas");
  private aiContext = this.aiCanvas.getContext("2d");
  private qrContext = this.qrCanvas.getContext("2d", { willReadFrequently: true });
  private qrIds: MarkerId[];

  private detector: ObjectDetector;

  constructor(detector: ObjectDetector) {
    this.detector = detector;
    this.qrIds = qrOnlyIds(detector.classMap);
  }

  onFrame(cb: (frame: AiFrame) => void) {
    this.frameCbs.push(cb);
  }
  onError(cb: (e: { code: ScanErrorCode }) => void) {
    this.errorCbs.push(cb);
  }
  onEnded(cb: (reason: ScanEndReason) => void) {
    this.endedCbs.push(cb);
  }

  get live() {
    return this.stream !== undefined;
  }

  /** Objects that need a QR tag with this detector. */
  get qrOnly(): readonly MarkerId[] {
    return this.qrIds;
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!window.isSecureContext) return this.fail("insecure-context");
    if (!navigator.mediaDevices?.getUserMedia || !this.aiContext || !this.qrContext)
      return this.fail("no-camera");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    } catch (error) {
      if (generation === this.generation) this.fail(scanErrorCode(error));
      return;
    }
    // stop() was called while the permission prompt was open: release immediately.
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    this.video = video;
    stream.getVideoTracks().forEach((track) =>
      track.addEventListener("ended", () => this.end("track-ended"), {
        once: true,
      }),
    );
    document.addEventListener("visibilitychange", this.onVisibility);
    // iOS Safari: inline, muted playback is required for a live camera preview.
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.srcObject = stream;
    try {
      await video.play();
    } catch (error) {
      if (generation === this.generation) this.fail(scanErrorCode(error));
      return;
    }
    if (generation !== this.generation) return;
    if (this.qrIds.length > 0) this.worker = this.createWorker();
    this.schedule(0);
  }

  stop() {
    this.generation += 1;
    clearTimeout(this.timer);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    if (this.video) this.video.srcObject = null;
    this.video = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.qrWaiters.forEach((resolve) => resolve([]));
    this.qrWaiters.clear();
    // Drop the last frame's pixels.
    this.aiCanvas.width = this.aiCanvas.height = 0;
    this.qrCanvas.width = this.qrCanvas.height = 0;
  }

  private fail(code: ScanErrorCode) {
    this.stop();
    this.errorCbs.forEach((cb) => cb({ code }));
  }

  private end(reason: ScanEndReason) {
    if (!this.stream) return;
    this.stop();
    this.endedCbs.forEach((cb) => cb(reason));
  }

  private onVisibility = () => {
    if (document.hidden) this.end("hidden");
  };

  private schedule(delay: number) {
    const generation = this.generation;
    this.timer = window.setTimeout(() => {
      if (generation === this.generation) void this.cycle(generation);
    }, delay);
  }

  private async cycle(generation: number) {
    const video = this.video;
    if (!video || !this.aiContext || !this.qrContext) return;
    if (video.readyState < 2 || video.videoWidth === 0) {
      this.schedule(100);
      return;
    }
    const at = performance.now();
    const { videoWidth, videoHeight } = video;
    let frameWidth = 0;
    let frameHeight = 0;
    let qrMarkers: Promise<DetectedMarker[]> = Promise.resolve([]);
    try {
      const aiScale = Math.min(1, AI_FRAME_WIDTH / videoWidth);
      frameWidth = this.aiCanvas.width = Math.round(videoWidth * aiScale);
      frameHeight = this.aiCanvas.height = Math.round(videoHeight * aiScale);
      this.aiContext.drawImage(video, 0, 0, frameWidth, frameHeight);
      if (this.qrIds.length > 0) qrMarkers = this.decodeQr(video);
    } catch {
      this.fail("unknown");
      return;
    }
    let raw: RawDetection[];
    let markers: DetectedMarker[];
    try {
      [raw, markers] = await Promise.all([
        this.detector.detect(this.aiCanvas),
        qrMarkers,
      ]);
    } catch {
      if (generation === this.generation) this.fail("unknown");
      return;
    }
    if (generation !== this.generation) return;
    const inferenceMs = performance.now() - at;
    const { sightings, others } = mapDetections(
      raw,
      frameWidth,
      frameHeight,
      this.detector.classMap,
      this.detector.thresholds,
    );
    const frame: AiFrame = {
      sightings: mergeHybrid(sightings, markers, this.qrIds),
      others,
      at,
      inferenceMs,
      frameWidth,
      frameHeight,
    };
    this.frameCbs.forEach((cb) => cb(frame));
    if (generation === this.generation)
      this.schedule(Math.max(0, AI_MIN_INTERVAL_MS - inferenceMs));
  }

  private decodeQr(video: HTMLVideoElement): Promise<DetectedMarker[]> {
    const context = this.qrContext!;
    const scale = Math.min(1, QR_FRAME_WIDTH / video.videoWidth);
    const width = (this.qrCanvas.width = Math.round(video.videoWidth * scale));
    const height = (this.qrCanvas.height = Math.round(video.videoHeight * scale));
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const worker = this.worker;
    if (!worker) return Promise.resolve(detectMarkers(pixels, width, height));
    this.seq += 1;
    const request: DecodeRequest = {
      seq: this.seq,
      width,
      height,
      pixels: pixels.buffer as ArrayBuffer,
    };
    return new Promise((resolve) => {
      this.qrWaiters.set(request.seq, resolve);
      worker.postMessage(request, [request.pixels]);
    });
  }

  private createWorker(): Worker | undefined {
    try {
      const worker = new Worker(
        new URL("../scan/decodeWorker.ts", import.meta.url),
        { type: "module" },
      );
      worker.onmessage = ({ data }: MessageEvent<DecodeResponse>) => {
        this.qrWaiters.get(data.seq)?.(data.markers);
        this.qrWaiters.delete(data.seq);
      };
      // If the worker cannot load, decode the next frames on the main thread.
      worker.onerror = () => {
        worker.terminate();
        if (this.worker === worker) this.worker = undefined;
        this.qrWaiters.forEach((resolve) => resolve([]));
        this.qrWaiters.clear();
      };
      return worker;
    } catch {
      return undefined;
    }
  }
}
