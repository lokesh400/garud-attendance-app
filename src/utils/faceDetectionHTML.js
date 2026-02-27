// HTML content for the hidden WebView that runs face-api.js
// Uses TinyFaceDetector for faster detection + image downscaling for speed.

const FACE_DETECTION_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/dist/face-api.js"></script>
</head>
<body>
<canvas id="canvas" style="display:none"></canvas>
<script>
  let modelsLoaded = false;
  const MAX_DIM = 480; // downscale images to this max dimension for speed

  function sendMessage(data) {
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
  }

  async function loadModels() {
    try {
      sendMessage({ type: 'status', message: 'Loading face detection models...' });
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68TinyNet.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      modelsLoaded = true;
      sendMessage({ type: 'modelsLoaded' });
    } catch (error) {
      sendMessage({ type: 'error', message: 'Failed to load models: ' + error.message });
    }
  }

  function downscaleToCanvas(img) {
    const canvas = document.getElementById('canvas');
    let w = img.width;
    let h = img.height;

    // Downscale if larger than MAX_DIM
    if (w > MAX_DIM || h > MAX_DIM) {
      const scale = MAX_DIM / Math.max(w, h);
      w = Math.round(w * scale);
      h = Math.round(h * scale);
    }

    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  async function detectFace(base64Data) {
    if (!modelsLoaded) {
      sendMessage({ type: 'error', message: 'Models not loaded yet' });
      return;
    }

    try {
      sendMessage({ type: 'status', message: 'Analyzing face...' });

      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = downscaleToCanvas(img);

          const detection = await faceapi
            .detectSingleFace(canvas, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 }))
            .withFaceLandmarks(true)
            .withFaceDescriptor();

          if (detection) {
            sendMessage({
              type: 'faceDetected',
              descriptor: Array.from(detection.descriptor)
            });
          } else {
            sendMessage({ type: 'noFace' });
          }
        } catch (err) {
          sendMessage({ type: 'error', message: 'Detection error: ' + err.message });
        }
      };

      img.onerror = () => {
        sendMessage({ type: 'error', message: 'Failed to load captured image' });
      };

      img.src = 'data:image/jpeg;base64,' + base64Data;
    } catch (error) {
      sendMessage({ type: 'error', message: 'detectFace error: ' + error.message });
    }
  }

  // Debounce to prevent duplicate processing
  let detecting = false;
  function handleMessage(event) {
    if (detecting) return;
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'detect') {
        detecting = true;
        detectFace(data.base64).finally(() => { detecting = false; });
      }
    } catch (e) {}
  }

  // Listen on both window and document for cross-platform compatibility
  window.addEventListener('message', handleMessage);
  document.addEventListener('message', handleMessage);

  loadModels();
</script>
</body>
</html>
`;

export default FACE_DETECTION_HTML;
