import { useEffect, useState, type CSSProperties, type RefObject } from "react";
import { coverTransform } from "./detect/geometry";
import type { Point } from "./types";

// The camera stage follows the stream's shape within these bounds: a portrait phone stream
// gets a 3:4 box (not a very tall 9:16 one), a laptop webcam up to 16:9.
export const MIN_STAGE_ASPECT = 3 / 4;
export const MAX_STAGE_ASPECT = 16 / 9;
export const DEFAULT_STAGE_ASPECT = 4 / 3;

/** Width / height for the camera stage given the stream's frame size. */
export function stageAspect(videoWidth: number, videoHeight: number): number {
  if (!(videoWidth > 0 && videoHeight > 0)) return DEFAULT_STAGE_ASPECT;
  return Math.min(MAX_STAGE_ASPECT, Math.max(MIN_STAGE_ASPECT, videoWidth / videoHeight));
}

/**
 * Stage style for a live video: `--camera-ar` tracks the stream's aspect ratio (it changes
 * when a phone rotates). The CSS caps the stage height and the video uses object-fit:
 * cover, so `toView` (the same cover mapping) keeps overlays on the image.
 */
export function useCameraStage(videoRef: RefObject<HTMLVideoElement | null>, live: boolean) {
  const [aspect, setAspect] = useState(DEFAULT_STAGE_ASPECT);
  const [, setLayout] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !live) return;
    const update = () => {
      setAspect(stageAspect(video.videoWidth, video.videoHeight));
      setLayout((n) => n + 1); // element size changed: re-map overlays
    };
    update();
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("resize", update); // fires when the stream's frame size changes
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    observer?.observe(video);
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [videoRef, live]);

  const video = videoRef.current;
  const toView = video
    ? coverTransform(video.videoWidth, video.videoHeight, video.clientWidth, video.clientHeight)
    : (p: Point) => p;
  const style = { "--camera-ar": aspect } as CSSProperties;
  return { style, toView };
}
