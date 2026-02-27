import AsyncStorage from '@react-native-async-storage/async-storage';
import SERVER_URL from '../config';

const TOKEN_KEY = 'auth_token';
const USER_KEY = 'auth_user';

// Store auth data
export async function storeAuth(token, user) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
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
async function authFetch(endpoint, options = {}) {
  const token = await getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${SERVER_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    await clearAuth();
    throw new Error('SESSION_EXPIRED');
  }

  return response;
}

// Login
export async function login(username, password) {
  const response = await fetch(`${SERVER_URL}/api/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Login failed');
  }

  await storeAuth(data.token, data.user);
  return data;
}

// Get all employees with face descriptors
export async function getEmployees() {
  const response = await authFetch('/api/mobile/employees');
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to fetch employees');
  }
  return data.employees;
}

// Confirm attendance
export async function confirmAttendance(userId) {
  const response = await authFetch('/api/mobile/confirm-attendance', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to mark attendance');
  }
  return data;
}
