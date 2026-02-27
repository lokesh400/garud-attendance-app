import AsyncStorage from '@react-native-async-storage/async-storage';
import SERVER_URL from '../config';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// Store auth data atomically
export async function storeAuth(token, user) {
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

// Get stored token
export async function getToken() {
  return await AsyncStorage.getItem(TOKEN_KEY);
}

// Get stored user
export async function getUser() {
  const user = await AsyncStorage.getItem(USER_KEY);
  return user ? JSON.parse(user) : null;
}

// Clear auth data (logout)
export async function clearAuth() {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
}

// API request helper with auth
// Includes timeout for slow cold-starts (e.g. Render free tier)
const REQUEST_TIMEOUT = 60000; // 60s to handle Render cold starts

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request timed out. The server may be starting up — please try again in a moment.');
    }
    throw new Error('Network request failed. Check your internet connection and server URL.');
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authFetch(endpoint, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetchWithTimeout(`${SERVER_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await clearAuth();
    throw new Error('SESSION_EXPIRED');
  }

  return response;
}

async function parseJSON(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    // Server returned non-JSON (e.g. Render HTML wake-up page)
    if (text.includes('render') || text.includes('<!DOCTYPE') || text.includes('<html')) {
      throw new Error('Server is starting up. Please wait a moment and try again.');
    }
    throw new Error('Invalid response from server');
  }
}

// Login
export async function login(username, password) {
  const response = await fetchWithTimeout(`${SERVER_URL}/api/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await parseJSON(response);

  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }

  if (!data.token || !data.user) {
    throw new Error('Invalid login response: missing token or user');
  }

  await storeAuth(data.token, data.user);
  return data;
}

// Get all employees with face descriptors
export async function getEmployees() {
  const response = await authFetch('/api/mobile/employees');
  const data = await parseJSON(response);
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch employees');
  }
  return data.employees || [];
}

// Confirm attendance
export async function confirmAttendance(userId) {
  const response = await authFetch('/api/mobile/confirm-attendance', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

  const data = await parseJSON(response);
  if (!response.ok) {
    throw new Error(data.error || 'Failed to mark attendance');
  }
  return data;
}
