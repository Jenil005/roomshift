import { detectMarkers } from "../detectMarkers";
import { MAX_FRAME_GAP_MS } from "../physicalOrder";
import type {
  DetectedMarker,
  MarkerId,
  ScanErrorCode,
  ScanSession,
} from "../types";
import type { DecodeRequest, DecodeResponse } from "./decodeWorker";
import { ScanDebouncer } from "./ScanSequence";

// Modest resolution and rate keep mid-range phones responsive.
const MAX_FRAME_WIDTH = 960;
const SCAN_INTERVAL_MS = 120;

export type ScanEndReason = "hidden" | "track-ended";

export function scanErrorCode(error: unknown): ScanErrorCode {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "no-camera";
  return "unknown";
}

/**
 * Rear-camera QR scanning with decoding in a web worker (main-thread fallback).
 * onScan reports each tag once per sighting (debounced); onMarkers reports every decoded
 * frame for the arrangement check. The camera is released on stop() and when the page hides.
 */
export class CameraScanSession implements ScanSession {
  private scanCbs: ((id: MarkerId) => void)[] = [];
  private errorCbs: ((e: { code: ScanErrorCode }) => void)[] = [];
  private markerCbs: ((markers: DetectedMarker[], now: number) => void)[] = [];
  private endedCbs: ((reason: ScanEndReason) => void)[] = [];
  private debouncer = new ScanDebouncer();
  private generation = 0;
  private stream?: MediaStream;
  private video?: HTMLVideoElement;
  private worker?: Worker;
  private animation = 0;
  private busy = false;
  private seq = 0;
  private pending = new Map<number, number>(); // seq -> capture time
  private lastScan = -Infinity;
  private lastResult = -Infinity;
  private lastVideoTime = -1;
  private canvas = document.createElement("canvas");
  private context = this.canvas.getContext("2d", { willReadFrequently: true });

  onScan(cb: (id: MarkerId) => void) {
    this.scanCbs.push(cb);
  }
  onError(cb: (e: { code: ScanErrorCode }) => void) {
    this.errorCbs.push(cb);
  }
  onMarkers(cb: (markers: DetectedMarker[], now: number) => void) {
    this.markerCbs.push(cb);
  }
  onEnded(cb: (reason: ScanEndReason) => void) {
    this.endedCbs.push(cb);
  }

  get live() {
    return this.stream !== undefined;
  }

  async start(video: HTMLVideoElement): Promise<void> {
    this.stop();
    const generation = this.generation;
    if (!window.isSecureContext) return this.fail("insecure-context");
    if (!navigator.mediaDevices?.getUserMedia || !this.context)
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
    video.srcObject = stream;
    try {
      await video.play();
    } catch (error) {
      if (generation === this.generation) this.fail(scanErrorCode(error));
      return;
    }
    if (generation !== this.generation) return;
    this.worker = this.createWorker();
    this.animation = requestAnimationFrame(this.tick);
  }

  stop() {
    this.generation += 1;
    cancelAnimationFrame(this.animation);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = undefined;
    if (this.video) this.video.srcObject = null;
    this.video = undefined;
    this.worker?.terminate();
    this.worker = undefined;
    this.busy = false;
    this.lastScan = this.lastResult = -Infinity;
    this.lastVideoTime = -1;
    this.debouncer.reset();
  }

  torchSupported(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    const capabilities = track?.getCapabilities?.() as
      | (MediaTrackCapabilities & { torch?: boolean })
      | undefined;
    return capabilities?.torch === true;
  }

  async setTorch(on: boolean): Promise<boolean> {
    const track = this.stream?.getVideoTracks()[0];
    if (!track || !this.torchSupported()) return false;
    try {
      await track.applyConstraints({
        advanced: [{ torch: on } as MediaTrackConstraintSet],
      });
      return true;
    } catch {
      return false;
    }
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

  private createWorker(): Worker | undefined {
    try {
      const worker = new Worker(new URL("./decodeWorker.ts", import.meta.url), {
        type: "module",
      });
      const generation = this.generation;
      worker.onmessage = ({ data }: MessageEvent<DecodeResponse>) => {
        if (generation !== this.generation) return;
        this.busy = false;
        this.handle(data.markers, this.pending.get(data.seq) ?? performance.now());
        this.pending.delete(data.seq);
      };
      // If the worker cannot load, keep scanning on the main thread.
      worker.onerror = () => {
        worker.terminate();
        if (this.worker === worker) this.worker = undefined;
        this.busy = false;
      };
      return worker;
    } catch {
      return undefined;
    }
  }

  private tick = (now: number) => {
    const video = this.video;
    const context = this.context;
    if (!video || !context) return;
    if (
      !this.busy &&
      video.readyState >= 2 &&
      video.videoWidth > 0 &&
      video.currentTime !== this.lastVideoTime &&
      now - this.lastScan >= SCAN_INTERVAL_MS
    ) {
      this.lastScan = now;
      this.lastVideoTime = video.currentTime;
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
      const width = (this.canvas.width = Math.round(video.videoWidth * scale));
      const height = (this.canvas.height = Math.round(
        video.videoHeight * scale,
      ));
      try {
        context.drawImage(video, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height).data;
        if (this.worker) {
          this.busy = true;
          this.seq += 1;
          this.pending.clear();
          this.pending.set(this.seq, now);
          const request: DecodeRequest = {
            seq: this.seq,
            width,
            height,
            pixels: pixels.buffer as ArrayBuffer,
          };
          this.worker.postMessage(request, [request.pixels]);
        } else {
          this.handle(detectMarkers(pixels, width, height), now);
        }
      } catch {
        this.fail("unknown");
        return;
      }
    }
    // A frozen video still reports "nothing in view" so the arrangement check resets.
    if (
      !this.busy &&
      Number.isFinite(this.lastResult) &&
      now - this.lastResult > MAX_FRAME_GAP_MS
    )
      this.handle([], now);
    this.animation = requestAnimationFrame(this.tick);
  };

  private handle(markers: DetectedMarker[], at: number) {
    this.lastResult = performance.now();
    this.markerCbs.forEach((cb) => cb(markers, at));
    for (const id of new Set(markers.map((marker) => marker.id))) {
      if (!this.debouncer.accept(id, at)) continue;
      navigator.vibrate?.(40);
      this.scanCbs.forEach((cb) => cb(id));
    }
  }
}
