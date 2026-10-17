# MediaPipe object detection model

`efficientdet_lite0_fp16.tflite` is Google's EfficientDet-Lite0 object detector (float16) for
MediaPipe Tasks Vision, served by this app so phones never fetch it from a CDN at runtime.

- Source: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
  (downloaded 2026-10-17; the model listed in the MediaPipe Object Detector guide).
- License: Apache License 2.0 (MediaPipe models, https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector).
- Labels: the COCO label map embedded in the model (92 entries). It includes `book` and `cup`.
  It has **no keys class** (the nearest label is `keyboard`), so KEYS is identified by its QR tag.
- Size: 7,254,339 bytes. SHA-256: `4b59100025bea1235a84c1038879a6cccc9f6c49f5e41144e91e74d99e780993`
- Runtime: `@mediapipe/tasks-vision` 1.0.1 (Apache-2.0); its WASM files are copied unmodified into
  `public/mediapipe/wasm/` at build time (frontend/scripts/prepare-assets.mjs).

## Measured status (2026-10-17, desktop Chromium, software WebGL)

- Single photos (frontend/e2e/detectors.spec.ts): book 0.42, cup 0.79; boxes agree with
  COCO-SSD's to within 0.12 of the frame. Inference about 2.6 s per frame (COCO-SSD about 1.6 s).
- Full game scan (frontend/e2e/multiplayer.spec.ts with DETECTOR=mediapipe): **did not verify**.
  In the composite camera scene MediaPipe found neither the book nor the cup (only the KEYS QR
  tag), and frames arrived more than 2.5 s apart, beyond the hold tracker's frame gap.
- Therefore COCO-SSD stays the default (ar/detect/selectDetector.ts DEFAULT_DETECTOR). MediaPipe is
  opt-in with ?detector=mediapipe or ?detector=auto until an iPhone test shows it is at least as good.
