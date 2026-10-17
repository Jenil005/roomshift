const video = document.getElementById("camera");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
  video.srcObject = stream;

  video.onloadedmetadata = () => {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    running = true;
    requestAnimationFrame(loop);
  };
}

function loop(timestamp) {
  if (!running) return;

  const result = objectDetector.detectForVideo(video, timestamp);
  renderOverlay(result);
  requestAnimationFrame(loop);
}
