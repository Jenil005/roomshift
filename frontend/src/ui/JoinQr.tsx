import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** Scannable join link, generated on the device (no QR web service). */
export function JoinQr({ url }: { url: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#06110b", light: "#d8e8c8" } })
      .then((s) => current && setSvg(s))
      .catch(() => current && setSvg(null)); // the code and the link are shown as text anyway
    return () => {
      current = false;
    };
  }, [url]);
  if (!svg) return null;
  return (
    <div
      className="join-qr w-28 shrink-0 bg-manual p-1 bevel-paper"
      role="img"
      aria-label={`QR code to join: ${url}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
