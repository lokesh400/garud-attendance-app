import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import { getEmployees, confirmAttendance } from '../services/api';
import { findBestMatch } from '../utils/faceMatch';
import FACE_DETECTION_HTML from '../utils/faceDetectionHTML';

export default function AttendanceScreen({ user, onLogout }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [employees, setEmployees] = useState([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [status, setStatus] = useState('Initializing...');
  const [capturing, setCapturing] = useState(false);
  const [matchResult, setMatchResult] = useState(null);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [confirming, setConfirming] = useState(false);
  const [facing, setFacing] = useState('front');

  const cameraRef = useRef(null);
  const webViewRef = useRef(null);

  // Load employees on mount
  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    try {
      setStatus('Loading registered employees...');
      const emps = await getEmployees();
      setEmployees(emps);
      if (emps.length === 0) {
        setStatus('No registered employees found. Register employees on the web app first.');
      } else {
        setStatus(
          modelsLoaded
            ? `Ready! ${emps.length} employee(s) loaded. Tap "Capture Face" to begin.`
            : 'Loading face detection AI models...'
        );
      }
    } catch (error) {
      if (error.message === 'SESSION_EXPIRED') {
        Alert.alert('Session Expired', 'Please login again.');
        onLogout();
        return;
      }
      setStatus('Failed to load employees. Check server connection.');
      Alert.alert('Error', error.message);
    }
  }

  // Handle messages from the WebView (face-api.js results)
  function onWebViewMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'modelsLoaded':
          setModelsLoaded(true);
          if (employees.length > 0) {
            setStatus(`Ready! ${employees.length} employee(s) loaded. Tap "Capture Face".`);
          }
          break;

        case 'status':
          setStatus(data.message);
          break;

        case 'faceDetected':
          handleFaceDetected(data.descriptor);
          break;

        case 'noFace':
          setCapturing(false);
          setStatus('No face detected. Ensure your face is clearly visible and try again.');
          Alert.alert('No Face Detected', 'Please position your face clearly in the camera and try again.');
          break;

        case 'error':
          setCapturing(false);
          setStatus(`Error: ${data.message}`);
          break;
      }
    } catch (e) {
      // ignore parse errors
    }
  }

  function handleFaceDetected(descriptor) {
    const result = findBestMatch(descriptor, employees);

    if (result) {
      setMatchResult(result);
      setStatus(`Matched: ${result.employee.name} (${result.confidence}% confidence)`);
    } else {
      setStatus('Face not recognized. Ensure the employee is registered.');
      Alert.alert('Not Recognized', 'Face does not match any registered employee.');
    }
    setCapturing(false);
  }

  // Capture photo and send to WebView for face detection
  async function captureAndDetect() {
    if (!cameraRef.current || !modelsLoaded) return;

    setCapturing(true);
    setMatchResult(null);
    setStatus('Capturing face...');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.6,
        skipProcessing: true,
      });

      setCapturedPhoto(photo.uri);
      setStatus('Processing face...');

      // Send base64 image to WebView for face detection
      const message = JSON.stringify({ type: 'detect', base64: photo.base64 });
      webViewRef.current?.injectJavaScript(
        `window.dispatchEvent(new MessageEvent('message', { data: '${message.replace(/'/g, "\\'")}' })); true;`
      );

      // Fallback: also post message directly
      webViewRef.current?.postMessage(message);
    } catch (error) {
      setCapturing(false);
      setStatus('Failed to capture photo. Try again.');
      Alert.alert('Error', 'Failed to capture photo: ' + error.message);
    }
  }

  // Confirm attendance for matched employee
  async function handleConfirm() {
    if (!matchResult) return;

    setConfirming(true);
    try {
      const data = await confirmAttendance(matchResult.employee.id);
      Alert.alert(
        'Success!',
        `Attendance marked for ${data.user.name}\nTime: ${data.time}\nDate: ${data.date}`
      );
      resetState();
    } catch (error) {
      if (error.message === 'SESSION_EXPIRED') {
        Alert.alert('Session Expired', 'Please login again.');
        onLogout();
        return;
      }
      Alert.alert('Error', error.message);
    } finally {
      setConfirming(false);
    }
  }

  function resetState() {
    setMatchResult(null);
    setCapturedPhoto(null);
    setCapturing(false);
    setStatus(`Ready! ${employees.length} employee(s) loaded. Tap "Capture Face".`);
  }

  // Camera permission not yet determined
  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  // Camera permission not granted
  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text style={styles.permissionText}>Camera access is required for face detection.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isReady = modelsLoaded && employees.length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />

      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Mark Attendance</Text>
          <Text style={styles.headerSubtitle}>👤 {user?.username} ({user?.role})</Text>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={onLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={[styles.statusDot, modelsLoaded ? styles.dotGreen : styles.dotYellow]} />
        <Text style={styles.statusText} numberOfLines={2}>{status}</Text>
      </View>

      {/* Camera / Captured Photo */}
      <View style={styles.cameraContainer}>
        {capturedPhoto && matchResult ? (
          <Image source={{ uri: capturedPhoto }} style={styles.capturedImage} />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
          >
            <View style={styles.cameraOverlay}>
              <View style={styles.faceGuide} />
            </View>
          </CameraView>
        )}
      </View>

      {/* Match Result */}
      {matchResult && (
        <View style={styles.resultCard}>
          <Text style={styles.resultTitle}>✓ Face Recognized!</Text>
          <Text style={styles.resultName}>{matchResult.employee.name}</Text>
          <Text style={styles.resultId}>ID: {matchResult.employee.employeeId}</Text>
          <Text style={styles.resultConfidence}>Confidence: {matchResult.confidence}%</Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {!matchResult ? (
          <TouchableOpacity
            style={[styles.primaryButton, (!isReady || capturing) && styles.buttonDisabled]}
            onPress={captureAndDetect}
            disabled={!isReady || capturing}
            activeOpacity={0.8}
          >
            {capturing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {!modelsLoaded ? 'Loading Models...' : employees.length === 0 ? 'No Employees' : '📸  Capture Face'}
              </Text>
            )}
          </TouchableOpacity>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.confirmButton, confirming && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={confirming}
              activeOpacity={0.8}
            >
              {confirming ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryButtonText}>✓ Confirm Attendance</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={resetState}
              activeOpacity={0.8}
            >
              <Text style={styles.retakeText}>Retake</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Hidden WebView for face-api.js processing */}
      <View style={styles.hiddenWebView}>
        <WebView
          ref={webViewRef}
          source={{ html: FACE_DETECTION_HTML }}
          onMessage={onWebViewMessage}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          originWhitelist={['*']}
          onError={(e) => setStatus('WebView error: ' + e.nativeEvent.description)}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#f1f5f9',
  },
  permissionText: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#667eea',
    paddingHorizontal: 20,
    paddingVertical: 16,
    paddingTop: 20,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#fff',
  },
  headerSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  logoutBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  logoutText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  dotGreen: { backgroundColor: '#10b981' },
  dotYellow: { backgroundColor: '#f59e0b' },
  statusText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
  },
  cameraContainer: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  capturedImage: {
    flex: 1,
    resizeMode: 'cover',
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  faceGuide: {
    width: 220,
    height: 280,
    borderRadius: 110,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    borderStyle: 'dashed',
  },
  resultCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10b981',
    marginBottom: 6,
  },
  resultName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
  },
  resultId: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  resultConfidence: {
    fontSize: 13,
    color: '#6366f1',
    marginTop: 4,
    fontWeight: '600',
  },
  actions: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    backgroundColor: '#6366f1',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#10b981',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 14,
    padding: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retakeText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  hiddenWebView: {
    height: 0,
    width: 0,
    opacity: 0,
    position: 'absolute',
  },
});
