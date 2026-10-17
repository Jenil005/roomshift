import { useEffect, useRef, useState } from "react";
import type { PhysicalPuzzleResult } from "../shared/types";
import { orderScanner } from "../game/arBridge";

/** Rear camera preview. Runs the AR scanner a few times a second if one is plugged in. */
export function CameraView({ onResult, children }: { onResult: (r: PhysicalPuzzleResult) => void; children?: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer = 0;
    let cancelled = false;
    (async () => {
      try {
        if (!window.isSecureContext) {
          setError("Camera access requires HTTPS (localhost is supported for development). Choose manual mode to continue.");
          return;
        }
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("Camera scanning is not supported in this browser. Choose manual mode to continue.");
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        if (orderScanner) {
          timer = window.setInterval(() => {
            const r = videoRef.current && orderScanner!(videoRef.current);
            if (r?.solved) onResultRef.current(r);
          }, 250);
        }
      } catch (reason) {
        const denied = reason instanceof DOMException && (reason.name === "NotAllowedError" || reason.name === "SecurityError");
        setError(denied
          ? "Camera permission was denied. Allow access in browser settings, or choose manual mode below."
          : "Camera unavailable. Choose manual mode below to continue.");
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="camera-view relative aspect-[4/3] w-full overflow-hidden dither bevel-sunken">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
      <p className="absolute left-2 right-2 top-2 m-0 bg-void/90 p-2 text-center text-[14px] text-manual">Camera scans physical markers. You can choose manual mode.</p>
      {error && <p className="absolute inset-0 m-0 flex items-center justify-center p-4 text-center text-emergency">{error}</p>}
      {children}
      <div className="ar-crosshair" aria-hidden="true">
        <span className="ar-crosshair-target" />
      </div>
      {/* Reticle corners */}
      <div className="pointer-events-none absolute left-3 top-3 h-6 w-6 border-l-[3px] border-t-[3px] border-manual" />
      <div className="pointer-events-none absolute right-3 top-3 h-6 w-6 border-r-[3px] border-t-[3px] border-manual" />
      <div className="pointer-events-none absolute bottom-3 left-3 h-6 w-6 border-b-[3px] border-l-[3px] border-manual" />
      <div className="pointer-events-none absolute bottom-3 right-3 h-6 w-6 border-b-[3px] border-r-[3px] border-manual" />
    </div>
  );
}
