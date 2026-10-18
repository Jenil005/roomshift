// Puzzle 1 Check/Solution

//detect if in line
function areObjectsInLine(detections) {
  if (detections.length < 3) return false;

  // Get center Y of each detection
  const centersY = detections.map(d => {
    const b = d.boundingBox;
    return ((b.yMin + b.yMax) / 2) * canvas.height;
  });

  // Compute spread (max difference)
  const maxY = Math.max(...centersY);
  const minY = Math.min(...centersY);
  const spread = maxY - minY;

  // Allow up to ~20% of screen height
  return spread < canvas.height * 0.2;
}

//detect left to right
function getOrderLeftToRight(detections) {
  return detections
    .map(d => {
      const b = d.boundingBox;
      const centerX = ((b.xMin + b.xMax) / 2) * canvas.width;
      return {
        label: d.categories[0].categoryName,
        centerX,
        box: b,
      };
    })
    .sort((a, b) => a.centerX - b.centerX);
}

const expectedOrder = ["book", "cup", "key"];

function isOrderCorrect(sortedDetections) {
  for (let i = 0; i < expectedOrder.length; i++) {
    if (sortedDetections[i].label !== expectedOrder[i]) {
      return false;
    }
  }
  return true;
}

//Check order button - FRONT ENDER: Toggle button based on bool
function shouldShowCheckButton(detections) {
  const labels = detections.map(d => d.categories[0].categoryName);

  const hasAll = expectedOrder.every(req => labels.includes(req));
  if (!hasAll) return false;

  return areObjectsInLine(detections);
}

//After pressing button - check order
let checkScan = {   //green scanning overlay
  startedAt: performance.now(),
  detections: getOrderLeftToRight(currentDetections),
};

//eval after 3 sec
function finishCheckScan() {
  const sorted = checkScan.detections;
  const correct = isOrderCorrect(sorted);

  if (!correct) {
    flashBoxes(sorted, "red");
    playErrorSound();
    gameState.showMessage("No, that's not right.");
  } else {
    flashBoxes(sorted, "green");
    playVictorySound();
    gameState.completeObjective("puzzle1");
  }

  checkScan = null;
}

// flashing
function flashBoxes(detections, color) {
  const duration = 500;
  const start = performance.now();

  function animate() {
    const now = performance.now();
    const t = (now - start) / duration;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach(d => {
      const b = d.box;
      const x = b.xMin * canvas.width;
      const y = b.yMin * canvas.height;
      const w = (b.xMax - b.xMin) * canvas.width;
      const h = (b.yMax - b.yMin) * canvas.height;

      ctx.fillStyle = `rgba(${color === "red" ? "255,0,0" : "0,255,0"}, ${0.3 + 0.7 * t})`;
      ctx.fillRect(x, y, w, h);
    });

    if (t < 1) requestAnimationFrame(animate);
  }

  animate();
}
