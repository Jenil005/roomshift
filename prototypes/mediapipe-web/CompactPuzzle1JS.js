
//compact puzzle1


const puzzle1 = {
  required: ["book", "cup", "key"],
  readyToCheck: false,
  frozenDetections: null,
  scanning: false,
  scanStart: 0,

  update(detections) {
    if (this.scanning) {
      this.updateScanAnimation();
      return;
    }

    // Check if all required objects are present
    const labels = detections.map(d => d.categories[0].categoryName);
    const hasAll = this.required.every(r => labels.includes(r));
    if (!hasAll) {
      this.readyToCheck = false;
      ui.hideCheckButton();
      return;
    }

    // Check if they are roughly in a horizontal line
    if (!areObjectsInLine(detections)) {
      this.readyToCheck = false;
      ui.hideCheckButton();
      return;
    }

    // If both conditions met, show button
    this.readyToCheck = true;
    ui.showCheckButton();
  },

  startCheck(detections) {
    this.frozenDetections = getOrderLeftToRight(detections);
    this.scanning = true;
    this.scanStart = performance.now();
    ui.playScanAnimation();
  },

  updateScanAnimation() {
    const elapsed = performance.now() - this.scanStart;
    if (elapsed >= 3000) {
      this.finishCheck();
    }
  },

  finishCheck() {
    this.scanning = false;

    const sorted = this.frozenDetections;
    const correct = isOrderCorrect(sorted, this.required);

    if (!correct) {
      ui.flashBoxes(sorted, "red");
      ui.playErrorSound();
      ui.showMessage("No, that's not right.");
    } else {
      ui.flashBoxes(sorted, "green");
      ui.playVictorySound();
      gameState.completeObjective("puzzle1");
    }
  }
};
