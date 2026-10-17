const crosshair = {
  x: () => canvas.width / 2,
  y: () => canvas.height / 2,
  radius: 20,
};

function isCentered(box) {
  const cx = crosshair.x();
  const cy = crosshair.y();
  const bxCenterX = (box.xMin + box.xMax) / 2 * canvas.width;
  const bxCenterY = (box.yMin + box.yMax) / 2 * canvas.height;

  const dx = Math.abs(bxCenterX - cx);
  const dy = Math.abs(bxCenterY - cy);

  return dx < crosshair.radius && dy < crosshair.radius;
}

let currentScan = null; // { label, startedAt, box }

function updateScanState(detections) {
  const centered = detections.find(d => isCentered(d.boundingBox));

  if (!centered) {
    currentScan = null;
    return;
  }

  if (!currentScan || currentScan.label !== centered.categories[0].categoryName) {
    currentScan = {
      label: centered.categories[0].categoryName,
      startedAt: performance.now(),
      box: centered.boundingBox,
    };
  } else {
    const elapsed = performance.now() - currentScan.startedAt;
    if (elapsed >= 3000) {
      confirmSelection(currentScan);
      currentScan = null;
    }
  }
}

function renderOverlay(result) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw crosshair
  ctx.strokeStyle = "white";
  ctx.beginPath();
  ctx.arc(crosshair.x(), crosshair.y(), crosshair.radius, 0, Math.PI * 2);
  ctx.stroke();

  if (!result || !result.detections) return;

  updateScanState(result.detections);

  for (const det of result.detections) {
    const b = det.boundingBox;
    const x = b.xMin * canvas.width;
    const y = b.yMin * canvas.height;
    const w = (b.xMax - b.xMin) * canvas.width;
    const h = (b.yMax - b.yMin) * canvas.height;

    ctx.strokeStyle = "lime";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);

    // scanning overlay if this is the current scan
    if (currentScan && currentScan.box === b) {
      const progress = (performance.now() - currentScan.startedAt) / 3000;
      ctx.fillStyle = `rgba(0, 255, 0, ${0.2 + 0.5 * progress})`;
      ctx.fillRect(x, y, w, h);
    }
  }
}

// FRONT ENDER: Listen to gameState changes and flip objective colour/state

function confirmSelection(scan) {
  // Example: mark objective as completed
  gameState.completeObjectiveForLabel(scan.label);
}
