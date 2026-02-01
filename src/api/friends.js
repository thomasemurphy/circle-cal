import { FRIENDS_POLL_INTERVAL } from '../config.js';
import { state, setPendingRequests, setFriends, getFriendsPollInterval, setFriendsPollInterval, clearFriendsPollInterval, isLoggedIn } from '../state.js';
import { api } from './auth.js';
import { loadEventsFromAPI } from './events.js';
import { getElements } from '../ui/elements.js';

/**
 * Fetch pending friend requests
 */
export async function fetchPendingRequests() {
  if (!isLoggedIn()) return [];
  try {
    return await api('/api/friends/requests/pending');
  } catch (e) {
    console.error('Failed to fetch pending requests:', e);
    return [];
  }
}

/**
 * Fetch friends list
 */
export async function fetchFriends() {
  if (!isLoggedIn()) return [];
  try {
    return await api('/api/friends');
  } catch (e) {
    console.error('Failed to fetch friends:', e);
    return [];
  }
}

/**
 * Send a friend request
 */
export async function sendFriendRequestAPI(email) {
  return await api('/api/friends/request', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

/**
 * Respond to a friend request
 */
export async function respondToFriendRequest(friendshipId, accept) {
  return await api(`/api/friends/request/${friendshipId}`, {
    method: 'PATCH',
    body: JSON.stringify({ accept }),
  });
}

/**
 * Remove a friend
 */
export async function removeFriendAPI(friendshipId) {
  return await api(`/api/friends/${friendshipId}`, {
    method: 'DELETE',
  });
}

/**
 * Update the friend request badge count
 */
export function updateFriendBadge() {
  const elements = getElements();
  const count = state.pendingRequests.length;

  if (elements.friendBadge) {
    if (count > 0) {
      elements.friendBadge.textContent = count;
      elements.friendBadge.style.display = 'flex';
    } else {
      elements.friendBadge.style.display = 'none';
    }
  }
}

/**
 * Start polling for friend requests
 */
export function startFriendsPoll() {
  if (getFriendsPollInterval()) return;

  const interval = setInterval(async () => {
    if (!isLoggedIn()) return;

    const pendingRequests = await fetchPendingRequests();
    setPendingRequests(pendingRequests);
    updateFriendBadge();

    // If modal is open, refresh the list
    const elements = getElements();
    if (elements.friendsModal && elements.friendsModal.style.display === 'flex') {
      const friends = await fetchFriends();
      setFriends(friends);
      renderPendingRequests();
      renderFriends();
    }
  }, FRIENDS_POLL_INTERVAL);

  setFriendsPollInterval(interval);
}

/**
 * Stop polling for friend requests
 */
export function stopFriendsPoll() {
  clearFriendsPollInterval();
}

/**
 * Refresh the friends modal content
 */
export async function refreshFriendsModal() {
  const pendingRequests = await fetchPendingRequests();
  const friends = await fetchFriends();

  setPendingRequests(pendingRequests);
  setFriends(friends);

  renderPendingRequests();
  renderFriends();
  updateFriendBadge();
}

/**
 * Render the pending requests list
 */
export function renderPendingRequests() {
  const elements = getElements();

  if (state.pendingRequests.length === 0) {
    if (elements.pendingRequestsSection) {
      elements.pendingRequestsSection.style.display = 'none';
    }
    return;
  }

  if (elements.pendingRequestsSection) {
    elements.pendingRequestsSection.style.display = 'block';
  }

  if (elements.pendingRequestsList) {
    elements.pendingRequestsList.innerHTML = state.pendingRequests.map(req => `
      <li>
        <div class="friend-info">
          ${req.requester.picture_url ? `<img src="${req.requester.picture_url}" class="friend-avatar" alt="">` : ''}
          <div>
            <div class="friend-name">${req.requester.name || 'Unknown'}</div>
            <div class="friend-email">${req.requester.email}</div>
          </div>
        </div>
        <div class="friend-actions">
          <button class="accept-btn" data-id="${req.id}">Accept</button>
          <button class="decline-btn" data-id="${req.id}">Decline</button>
        </div>
      </li>
    `).join('');

    // Add event listeners
    elements.pendingRequestsList.querySelectorAll('.accept-btn').forEach(btn => {
      btn.addEventListener('click', () => handleFriendResponse(btn.dataset.id, true));
    });
    elements.pendingRequestsList.querySelectorAll('.decline-btn').forEach(btn => {
      btn.addEventListener('click', () => handleFriendResponse(btn.dataset.id, false));
    });
  }
}

/**
 * Render the friends list
 */
export function renderFriends() {
  const elements = getElements();

  if (state.friends.length === 0) {
    if (elements.currentFriendsSection) {
      elements.currentFriendsSection.style.display = 'none';
    }
    return;
  }

  if (elements.currentFriendsSection) {
    elements.currentFriendsSection.style.display = 'block';
  }

  if (elements.currentFriendsList) {
    elements.currentFriendsList.innerHTML = state.friends.map(friendship => {
      const friend = friendship.friend;
      return `
        <li>
          <div class="friend-info">
            ${friend.picture_url ? `<img src="${friend.picture_url}" class="friend-avatar" alt="">` : ''}
            <div>
              <div class="friend-name">${friend.name || 'Unknown'}</div>
              <div class="friend-email">${friend.email}</div>
            </div>
          </div>
          <div class="friend-actions">
            <button class="remove-btn" data-id="${friendship.id}">Remove</button>
          </div>
        </li>
      `;
    }).join('');

    // Add event listeners
    elements.currentFriendsList.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', () => handleRemoveFriend(btn.dataset.id));
    });
  }
}

/**
 * Handle friend request response
 */
export async function handleFriendResponse(friendshipId, accept) {
  try {
    await respondToFriendRequest(friendshipId, accept);
    await refreshFriendsModal();

    // Reload events to get friend birthdays
    if (accept) {
      await loadEventsFromAPI();
    }
  } catch (e) {
    console.error('Failed to respond to friend request:', e);
  }
}

/**
 * Handle removing a friend
 */
export async function handleRemoveFriend(friendshipId) {
  if (!confirm('Remove this friend? Their birthday will be removed from your calendar.')) {
    return;
  }

  try {
    await removeFriendAPI(friendshipId);
    await refreshFriendsModal();
    await loadEventsFromAPI(); // Reload to remove friend birthday
  } catch (e) {
    console.error('Failed to remove friend:', e);
  }
}

/**
 * Handle sending a friend request
 */
export async function handleSendFriendRequest() {
  const elements = getElements();
  const email = elements.friendEmailInput?.value.trim();
  if (!email) return;

  if (elements.sendRequestBtn) elements.sendRequestBtn.disabled = true;
  if (elements.friendRequestStatus) {
    elements.friendRequestStatus.textContent = 'Sending...';
    elements.friendRequestStatus.className = 'request-status';
  }

  try {
    const result = await sendFriendRequestAPI(email);
    if (elements.friendRequestStatus) {
      elements.friendRequestStatus.textContent = result.message;
      elements.friendRequestStatus.className = 'request-status success';
    }
    if (elements.friendEmailInput) elements.friendEmailInput.value = '';
  } catch (e) {
    let errorMsg = 'Failed to send request.';
    if (e.message.includes('400')) {
      errorMsg = 'Already friends or request pending.';
    }
    if (elements.friendRequestStatus) {
      elements.friendRequestStatus.textContent = errorMsg;
      elements.friendRequestStatus.className = 'request-status error';
    }
  }

  if (elements.sendRequestBtn) elements.sendRequestBtn.disabled = false;
}
