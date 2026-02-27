// HTML content for the hidden WebView that runs face-api.js
// This WebView loads face detection models and processes base64 images
// to extract face descriptors, which are sent back to React Native.

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

  function sendMessage(data) {
    window.ReactNativeWebView.postMessage(JSON.stringify(data));
  }

  async function loadModels() {
    try {
      sendMessage({ type: 'status', message: 'Loading face detection models...' });
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
      ]);
      modelsLoaded = true;
      sendMessage({ type: 'modelsLoaded' });
    } catch (error) {
      sendMessage({ type: 'error', message: 'Failed to load models: ' + error.message });
    }
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
          const canvas = document.getElementById('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          const detection = await faceapi
            .detectSingleFace(canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.3 }))
            .withFaceLandmarks()
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

  // Listen for messages from React Native
  window.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'detect') {
        detectFace(data.base64);
      }
    } catch (e) {}
  });

  // Also handle document message events (Android compatibility)
  document.addEventListener('message', (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'detect') {
        detectFace(data.base64);
      }
    } catch (e) {}
  });

  loadModels();
</script>
</body>
</html>
`;

export default FACE_DETECTION_HTML;
