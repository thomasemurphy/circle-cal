import { API_URL } from '../config.js';
import { state, setUser, clearUser, saveAnnotationsToLocalStorage, loadAnnotationsFromLocalStorage } from '../state.js';
import { loadEventsFromAPI } from './events.js';
import { fetchPendingRequests, startFriendsPoll, stopFriendsPoll, updateFriendBadge } from './friends.js';
import { updateAnnotationMarkers } from '../calendar/markers.js';
import { getElements } from '../ui/elements.js';

/**
 * Generic API helper function
 */
export async function api(endpoint, options = {}) {
  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok && response.status !== 204) {
    throw new Error(`API error: ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

/**
 * Check authentication status and load user data
 */
export async function checkAuth() {
  try {
    const user = await api('/auth/me');
    if (user) {
      setUser(user);
      updateAuthUI();
      await loadEventsFromAPI();

      // Start polling for friend requests
      const pendingRequests = await fetchPendingRequests();
      state.pendingRequests = pendingRequests;
      updateFriendBadge();
      startFriendsPoll();
    } else {
      showLoginButton();
    }
  } catch (e) {
    showLoginButton();
  }
}

/**
 * Update the authentication UI based on current user state
 */
export function updateAuthUI() {
  const elements = getElements();

  if (state.user) {
    if (elements.loginBtn) elements.loginBtn.style.display = 'none';
    if (elements.userInfo) elements.userInfo.style.display = 'flex';
    if (state.user.picture_url && elements.userAvatar) {
      elements.userAvatar.src = state.user.picture_url;
    }
    if (elements.userName) {
      elements.userName.textContent = state.user.name || state.user.email;
    }
  } else {
    showLoginButton();
  }
}

/**
 * Show the login button and hide user info
 */
export function showLoginButton() {
  const elements = getElements();
  if (elements.loginBtn) elements.loginBtn.style.display = 'block';
  if (elements.userInfo) elements.userInfo.style.display = 'none';
}

/**
 * Handle login button click
 */
export function handleLogin() {
  window.location.href = `${API_URL}/auth/google`;
}

/**
 * Handle logout
 */
export async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
  } catch (e) {
    // Ignore errors
  }

  clearUser();
  stopFriendsPoll();
  updateFriendBadge();
  loadAnnotationsFromLocalStorage();
  updateAuthUI();
  updateAnnotationMarkers();
}
