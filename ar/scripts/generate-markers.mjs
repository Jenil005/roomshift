import QRCode from "qrcode";
import { mkdir } from "node:fs/promises";
await mkdir(new URL("../public/markers/", import.meta.url), {
  recursive: true,
});
for (const id of ["BOOK", "CUP", "KEYS"]) {
  await QRCode.toFile(
    new URL(`../public/markers/${id.toLowerCase()}.svg`, import.meta.url)
      .pathname,
    `ROOMSHIFT:${id}`,
    { type: "svg", errorCorrectionLevel: "M", margin: 4, width: 280 },
  );
}
