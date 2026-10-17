import { detectMarkers } from "../detectMarkers";
import type { DetectedMarker } from "../types";

// Decodes QR frames off the main thread. Frames are processed in memory and discarded.
export type DecodeRequest = {
  seq: number;
  width: number;
  height: number;
  pixels: ArrayBuffer;
};
export type DecodeResponse = { seq: number; markers: DetectedMarker[] };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<DecodeRequest>) => void) | null;
  postMessage(message: DecodeResponse): void;
};

scope.onmessage = ({ data }) => {
  const markers = detectMarkers(
    new Uint8ClampedArray(data.pixels),
    data.width,
    data.height,
  );
  scope.postMessage({ seq: data.seq, markers });
};
