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
  Animated,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import { getEmployees, confirmAttendance } from '../services/api';
import { findBestMatch } from '../utils/faceMatch';
import FACE_DETECTION_HTML from '../utils/faceDetectionHTML';

const { width } = Dimensions.get('window');

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
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;
  const resultSlide = useRef(new Animated.Value(50)).current;
  const resultOpacity = useRef(new Animated.Value(0)).current;

  // Pulse animation for the capture button
  useEffect(() => {
    if (modelsLoaded && employees.length > 0 && !capturing && !matchResult) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.08, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [modelsLoaded, employees, capturing, matchResult]);

  // Scanning animation while capturing
  useEffect(() => {
    if (capturing) {
      const scan = Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          Animated.timing(scanAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
        ])
      );
      scan.start();
      return () => scan.stop();
    } else {
      scanAnim.setValue(0);
    }
  }, [capturing]);

  // Slide in result card
  useEffect(() => {
    if (matchResult) {
      Animated.parallel([
        Animated.spring(resultSlide, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
        Animated.timing(resultOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start();
    } else {
      resultSlide.setValue(50);
      resultOpacity.setValue(0);
    }
  }, [matchResult]);

  useEffect(() => {
    loadEmployees();
  }, []);

  async function loadEmployees() {
    try {
      setStatus('Loading registered employees...');
      const emps = await getEmployees();
      setEmployees(emps);
      if (emps.length === 0) {
        setStatus('No employees registered yet. Add them from the web app.');
      } else {
        setStatus(
          modelsLoaded
            ? `Ready To Mark Attendance`
            : 'Loading AI models...'
        );
      }
    } catch (error) {
      if (error.message === 'SESSION_EXPIRED') {
        Alert.alert('Session Expired', 'Please login again.');
        onLogout();
        return;
      }
      setStatus('Failed to load employees');
      Alert.alert('Error', error.message);
    }
  }

  function onWebViewMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      switch (data.type) {
        case 'modelsLoaded':
          setModelsLoaded(true);
          if (employees.length > 0) {
            setStatus(`Ready To Mark Attendance`);
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
          setStatus('No face detected. Try again.');
          Alert.alert('No Face Detected', 'Position your face clearly in the oval guide and try again.');
          break;
        case 'error':
          setCapturing(false);
          setStatus(`Error: ${data.message}`);
          break;
      }
    } catch (e) {}
  }

  function handleFaceDetected(descriptor) {
    const result = findBestMatch(descriptor, employees);
    if (result) {
      setMatchResult(result);
      setStatus(`Matched: ${result.employee.name}`);
    } else {
      setStatus('Face not recognized');
      Alert.alert('Not Recognized', 'Face does not match any registered employee.');
    }
    setCapturing(false);
  }

  async function captureAndDetect() {
    if (!cameraRef.current || !modelsLoaded) return;

    setCapturing(true);
    setMatchResult(null);
    setCapturedPhoto(null);
    setStatus('Scanning face...');

    try {
      const photo = await cameraRef.current.takePictureAsync({
        base64: true,
        quality: 0.5,
        skipProcessing: true,
      });

      setCapturedPhoto(photo.uri);
      setStatus('Analyzing...');

      const message = JSON.stringify({ type: 'detect', base64: photo.base64 });
      // Use postMessage only — injectJavaScript with large base64 strings
      // can exceed max JS string length or break on special characters
      webViewRef.current?.postMessage(message);
    } catch (error) {
      setCapturing(false);
      setStatus('Capture failed. Try again.');
      Alert.alert('Error', 'Failed to capture photo: ' + error.message);
    }
  }

  async function handleConfirm() {
    if (!matchResult) return;

    setConfirming(true);
    try {
      const data = await confirmAttendance(matchResult.employee.id);
      Alert.alert(
        'Attendance Marked! ✓',
        `${data.user.name}\n${data.date} at ${data.time}`
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
    setStatus(`Ready To Mark Attendance`);
  }

  if (!permission) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#4338ca" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <View style={styles.permissionIcon}>
            <Text style={{ fontSize: 48 }}>📷</Text>
          </View>
          <Text style={styles.permissionTitle}>Camera Access Required</Text>
          <Text style={styles.permissionText}>
            We need camera access to detect and recognize faces for attendance marking.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={requestPermission}>
            <Text style={styles.primaryButtonText}>Grant Camera Access</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isReady = modelsLoaded && employees.length > 0;

  const scanLineTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 120],
  });

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#4338ca" />

      {/* Header */}
      <View style={styles.header}>
      </View>

      {/* Status Chip */}
      <View style={styles.statusChip}>
        <View style={[
          styles.statusDot,
          modelsLoaded && employees.length > 0 ? styles.dotGreen :
          modelsLoaded ? styles.dotOrange : styles.dotYellow,
        ]} />
        <Text style={styles.statusText} numberOfLines={1}>{status}</Text>
        {capturing && <ActivityIndicator size="small" color="#6366f1" style={{ marginLeft: 8 }} />}
      </View>

      {/* Camera Area */}
      <View style={styles.cameraWrapper}>
        <View style={styles.cameraContainer}>
          {capturedPhoto && matchResult ? (
            <Image source={{ uri: capturedPhoto }} style={styles.capturedImage} />
          ) : (
            <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
              <View style={styles.cameraOverlay}>
                {/* Corner brackets for face guide */}
                <View style={styles.faceGuideArea}>
                  <View style={[styles.corner, styles.cornerTL]} />
                  <View style={[styles.corner, styles.cornerTR]} />
                  <View style={[styles.corner, styles.cornerBL]} />
                  <View style={[styles.corner, styles.cornerBR]} />

                  {/* Scanning line */}
                  {capturing && (
                    <Animated.View
                      style={[
                        styles.scanLine,
                        { transform: [{ translateY: scanLineTranslate }] },
                      ]}
                    />
                  )}
                </View>

                <Text style={styles.cameraHint}>
                  {capturing ? 'Hold still...' : 'Position face in frame'}
                </Text>
              </View>
            </CameraView>
          )}
        </View>

        {/* Flip camera button */}
        {!matchResult && (
          <TouchableOpacity
            style={styles.flipBtn}
            onPress={() => setFacing(f => f === 'front' ? 'back' : 'front')}
            activeOpacity={0.7}
          >
            <Text style={styles.flipText}>🔄</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Match Result Card */}
      {matchResult && (
        <Animated.View
          style={[
            styles.resultCard,
            { opacity: resultOpacity, transform: [{ translateY: resultSlide }] },
          ]}
        >
          <View style={styles.resultLeft}>
            <View style={styles.resultBadge}>
              <Text style={styles.resultBadgeText}>✓</Text>
            </View>
            <View style={styles.resultInfo}>
              <Text style={styles.resultName}>{matchResult.employee.name}</Text>
              <Text style={styles.resultId}>ID: {matchResult.employee.employeeId}</Text>
            </View>
          </View>
          <View style={styles.confidenceTag}>
            <Text style={styles.confidenceText}>{matchResult.confidence}%</Text>
          </View>
        </Animated.View>
      )}

      {/* Action Buttons */}
      <View style={styles.actions}>
        {!matchResult ? (
          <Animated.View style={{ transform: [{ scale: isReady && !capturing ? pulseAnim : 1 }] }}>
            <TouchableOpacity
              style={[
                styles.captureButton,
                (!isReady || capturing) && styles.buttonDisabled,
              ]}
              onPress={captureAndDetect}
              disabled={!isReady || capturing}
              activeOpacity={0.85}
            >
              {capturing ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.captureButtonText}>  Scanning...</Text>
                </View>
              ) : (
                <Text style={styles.captureButtonText}>
                  {!modelsLoaded ? '⏳  Loading Models...' : employees.length === 0 ? 'No Employees' : '📸  Capture & Recognize'}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.confirmButton, confirming && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={confirming}
              activeOpacity={0.85}
            >
              {confirming ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.actionButtonText}>  Marking...</Text>
                </View>
              ) : (
                <Text style={styles.actionButtonText}>✓  Confirm</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.retakeButton}
              onPress={resetState}
              activeOpacity={0.8}
            >
              <Text style={styles.retakeText}>↺  Retake</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Hidden WebView */}
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
    backgroundColor: '#0f172a',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#0f172a',
  },
  permissionIcon: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(99,102,241,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#f1f5f9',
    marginBottom: 8,
  },
  permissionText: {
    fontSize: 15,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#4338ca',
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingTop: 18,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.3,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  userDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34d399',
    marginRight: 6,
  },
  headerSubtitle: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
  },
  logoutBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    fontSize: 18,
    color: '#fff',
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10,
  },
  dotGreen: { backgroundColor: '#34d399' },
  dotYellow: { backgroundColor: '#fbbf24' },
  dotOrange: { backgroundColor: '#fb923c' },
  statusText: {
    flex: 1,
    fontSize: 13,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  cameraWrapper: {
    flex: 1,
    marginHorizontal: 16,
    marginTop: 12,
    position: 'relative',
  },
  cameraContainer: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderWidth: 2,
    borderColor: '#334155',
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
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  faceGuideArea: {
    width: 220,
    height: 280,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderColor: '#818cf8',
    borderWidth: 3,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 16,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 16,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 16,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 16,
  },
  scanLine: {
    position: 'absolute',
    left: 10,
    right: 10,
    height: 2,
    backgroundColor: '#818cf8',
    top: '50%',
    shadowColor: '#818cf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
    elevation: 4,
  },
  cameraHint: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 16,
    letterSpacing: 0.5,
  },
  flipBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(30,41,59,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  flipText: {
    fontSize: 20,
  },
  resultCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#34d399',
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  resultBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(52,211,153,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  resultBadgeText: {
    fontSize: 22,
    color: '#34d399',
  },
  resultInfo: {
    flex: 1,
  },
  resultName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#f1f5f9',
  },
  resultId: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  confidenceTag: {
    backgroundColor: 'rgba(99,102,241,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  confidenceText: {
    color: '#a5b4fc',
    fontSize: 15,
    fontWeight: '700',
  },
  actions: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  captureButton: {
    backgroundColor: '#4338ca',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4338ca',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  captureButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  retakeButton: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 18,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  retakeText: {
    color: '#cbd5e1',
    fontWeight: '600',
    fontSize: 15,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  primaryButton: {
    backgroundColor: '#4338ca',
    borderRadius: 16,
    padding: 18,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  actionButtonText: {
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
