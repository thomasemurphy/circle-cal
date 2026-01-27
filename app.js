(function() {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    const OUTER_RADIUS = 200;
    const INNER_RADIUS = 140;
    const CENTER_RADIUS = 100;
    const API_URL = window.CONFIG?.API_URL || '';

    const MONTHS = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    let annotations = {};
    let selectedDate = null;
    let selectedEndDate = null; // For multi-day events
    let currentUser = null;
    let events = []; // Events from API
    let selectedColor = '#ff6360'; // Default color
    let selectedHidden = false; // Default visibility
    const DEFAULT_COLOR = '#ff6360';

    // Range selection state
    let isSelectingRange = false;
    let rangeStartDate = null;

    // Zoom state (continuous)
    const MIN_ZOOM = 0.8;
    const MAX_ZOOM = 15;
    let currentZoom = 1;

    // Pan state
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let viewBoxStart = { x: 0, y: 0 };

    // Label positioning
    let labelData = [];

    const svg = document.getElementById('calendar');
    const tooltip = document.getElementById('tooltip');
    const modal = document.getElementById('modal');
    const modalDate = document.getElementById('modal-date');
    const existingAnnotations = document.getElementById('existing-annotations');
    const annotationInput = document.getElementById('annotation-input');

    // Auth elements
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const userInfo = document.getElementById('user-info');
    const userAvatar = document.getElementById('user-avatar');
    const userName = document.getElementById('user-name');

    // Settings elements
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const birthdayMonth = document.getElementById('birthday-month');
    const birthdayDay = document.getElementById('birthday-day');
    const clearBirthdayBtn = document.getElementById('clear-birthday-btn');
    const settingsSaveBtn = document.getElementById('settings-save-btn');
    const settingsCancelBtn = document.getElementById('settings-cancel-btn');

    // Birthday event constants
    const BIRTHDAY_COLOR = '#ff69b4'; // Pink
    const BIRTHDAY_TITLE = 'My birthday!';
    const FRIEND_BIRTHDAY_COLOR = '#9c27b0'; // Purple for friend birthdays

    // Friends elements
    const friendsBtn = document.getElementById('friends-btn');
    const friendsModal = document.getElementById('friends-modal');
    const friendBadge = document.getElementById('friend-badge');
    const friendEmailInput = document.getElementById('friend-email');
    const sendRequestBtn = document.getElementById('send-request-btn');
    const friendRequestStatus = document.getElementById('friend-request-status');
    const pendingRequestsSection = document.getElementById('pending-requests-section');
    const pendingRequestsList = document.getElementById('pending-requests-list');
    const currentFriendsSection = document.getElementById('current-friends-section');
    const currentFriendsList = document.getElementById('current-friends-list');
    const friendsCloseBtn = document.getElementById('friends-close-btn');

    // Friends state
    let pendingFriendRequests = [];
    let friends = [];
    let friendsPollInterval = null;
    const FRIENDS_POLL_INTERVAL = 30000; // 30 seconds

    // API helper
    async function api(endpoint, options = {}) {
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

    // Auth functions
    async function checkAuth() {
        try {
            const user = await api('/auth/me');
            if (user) {
                currentUser = user;
                updateAuthUI();
                await loadEventsFromAPI();

                // Start polling for friend requests
                pendingFriendRequests = await fetchPendingRequests();
                updateFriendBadge();
                startFriendsPoll();
            } else {
                showLoginButton();
            }
        } catch (e) {
            showLoginButton();
        }
    }

    function updateAuthUI() {
        if (currentUser) {
            loginBtn.style.display = 'none';
            userInfo.style.display = 'flex';
            if (currentUser.picture_url) {
                userAvatar.src = currentUser.picture_url;
            }
            userName.textContent = currentUser.name || currentUser.email;
        } else {
            showLoginButton();
        }
    }

    function showLoginButton() {
        loginBtn.style.display = 'block';
        userInfo.style.display = 'none';
    }

    function handleLogin() {
        window.location.href = `${API_URL}/auth/google`;
    }

    async function handleLogout() {
        try {
            await api('/auth/logout', { method: 'POST' });
        } catch (e) {
            // Ignore errors
        }
        currentUser = null;
        events = [];
        annotations = {};
        friends = [];
        pendingFriendRequests = [];
        stopFriendsPoll();
        updateFriendBadge();
        loadFromLocalStorage();
        updateAuthUI();
        updateAnnotationMarkers();
    }

    // Settings modal functions
    function openSettingsModal() {
        if (!currentUser) return;

        // Populate current birthday values
        if (currentUser.birthday_month) {
            birthdayMonth.value = currentUser.birthday_month;
            birthdayDay.value = currentUser.birthday_day || '';
        } else {
            birthdayMonth.value = '';
            birthdayDay.value = '';
        }

        settingsModal.style.display = 'flex';
    }

    function closeSettingsModal() {
        settingsModal.style.display = 'none';
    }

    async function saveSettings() {
        const month = birthdayMonth.value ? parseInt(birthdayMonth.value) : null;
        const day = birthdayDay.value ? parseInt(birthdayDay.value) : null;

        // Validate day for month
        if (month && day) {
            const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
            if (day < 1 || day > daysInMonth[month - 1]) {
                alert(`Invalid day for ${MONTHS[month - 1]}`);
                return;
            }
        }

        try {
            const updated = await api('/api/profile', {
                method: 'PATCH',
                body: JSON.stringify({
                    birthday_month: month,
                    birthday_day: day
                })
            });

            if (updated) {
                currentUser.birthday_month = updated.birthday_month;
                currentUser.birthday_day = updated.birthday_day;
                // Re-inject birthday event (this also removes the old one)
                injectBirthdayEvent();
                updateAnnotationMarkers();
            }
        } catch (e) {
            console.error('Failed to save settings:', e);
            alert('Failed to save settings');
            return;
        }

        closeSettingsModal();
    }

    function clearBirthday() {
        birthdayMonth.value = '';
        birthdayDay.value = '';
    }

    // Friends API functions
    async function fetchPendingRequests() {
        if (!currentUser) return [];
        try {
            return await api('/api/friends/requests/pending');
        } catch (e) {
            console.error('Failed to fetch pending requests:', e);
            return [];
        }
    }

    async function fetchFriends() {
        if (!currentUser) return [];
        try {
            return await api('/api/friends');
        } catch (e) {
            console.error('Failed to fetch friends:', e);
            return [];
        }
    }

    async function sendFriendRequestAPI(email) {
        return await api('/api/friends/request', {
            method: 'POST',
            body: JSON.stringify({ email }),
        });
    }

    async function respondToFriendRequest(friendshipId, accept) {
        return await api(`/api/friends/request/${friendshipId}`, {
            method: 'PATCH',
            body: JSON.stringify({ accept }),
        });
    }

    async function removeFriendAPI(friendshipId) {
        return await api(`/api/friends/${friendshipId}`, {
            method: 'DELETE',
        });
    }

    // Friends modal functions
    function openFriendsModal() {
        if (!currentUser) return;

        friendEmailInput.value = '';
        friendRequestStatus.textContent = '';
        friendRequestStatus.className = 'request-status';

        refreshFriendsModal();
        friendsModal.style.display = 'flex';
    }

    function closeFriendsModal() {
        friendsModal.style.display = 'none';
    }

    async function refreshFriendsModal() {
        pendingFriendRequests = await fetchPendingRequests();
        friends = await fetchFriends();

        renderPendingRequests();
        renderFriends();
        updateFriendBadge();
    }

    function renderPendingRequests() {
        if (pendingFriendRequests.length === 0) {
            pendingRequestsSection.style.display = 'none';
            return;
        }

        pendingRequestsSection.style.display = 'block';
        pendingRequestsList.innerHTML = pendingFriendRequests.map(req => `
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
        pendingRequestsList.querySelectorAll('.accept-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFriendResponse(btn.dataset.id, true));
        });
        pendingRequestsList.querySelectorAll('.decline-btn').forEach(btn => {
            btn.addEventListener('click', () => handleFriendResponse(btn.dataset.id, false));
        });
    }

    function renderFriends() {
        if (friends.length === 0) {
            currentFriendsSection.style.display = 'none';
            return;
        }

        currentFriendsSection.style.display = 'block';
        currentFriendsList.innerHTML = friends.map(friendship => {
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
        currentFriendsList.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => handleRemoveFriend(btn.dataset.id));
        });
    }

    function updateFriendBadge() {
        const count = pendingFriendRequests.length;
        if (count > 0) {
            friendBadge.textContent = count;
            friendBadge.style.display = 'flex';
        } else {
            friendBadge.style.display = 'none';
        }
    }

    async function handleSendFriendRequest() {
        const email = friendEmailInput.value.trim();
        if (!email) return;

        sendRequestBtn.disabled = true;
        friendRequestStatus.textContent = 'Sending...';
        friendRequestStatus.className = 'request-status';

        try {
            const result = await sendFriendRequestAPI(email);
            friendRequestStatus.textContent = result.message;
            friendRequestStatus.className = 'request-status success';
            friendEmailInput.value = '';
        } catch (e) {
            let errorMsg = 'Failed to send request.';
            if (e.message.includes('400')) {
                errorMsg = 'Already friends or request pending.';
            }
            friendRequestStatus.textContent = errorMsg;
            friendRequestStatus.className = 'request-status error';
        }

        sendRequestBtn.disabled = false;
    }

    async function handleFriendResponse(friendshipId, accept) {
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

    async function handleRemoveFriend(friendshipId) {
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

    function startFriendsPoll() {
        if (friendsPollInterval) return;

        friendsPollInterval = setInterval(async () => {
            if (!currentUser) return;

            pendingFriendRequests = await fetchPendingRequests();
            updateFriendBadge();

            // If modal is open, refresh the list
            if (friendsModal && friendsModal.style.display === 'flex') {
                friends = await fetchFriends();
                renderPendingRequests();
                renderFriends();
            }
        }, FRIENDS_POLL_INTERVAL);
    }

    function stopFriendsPoll() {
        if (friendsPollInterval) {
            clearInterval(friendsPollInterval);
            friendsPollInterval = null;
        }
    }

    function injectBirthdayEvent() {
        // Remove all birthday events first (own and friends)
        removeBirthdayEvents();

        // Inject own birthday
        if (currentUser && currentUser.birthday_month && currentUser.birthday_day) {
            const dateKey = `${currentUser.birthday_month}-${currentUser.birthday_day}`;
            if (!annotations[dateKey]) {
                annotations[dateKey] = [];
            }
            annotations[dateKey].unshift({
                title: BIRTHDAY_TITLE,
                color: BIRTHDAY_COLOR,
                isBirthday: true
            });
        }

        // Inject friend birthdays
        friends.forEach(friendship => {
            const friend = friendship.friend;
            if (friend.birthday_month && friend.birthday_day) {
                const dateKey = `${friend.birthday_month}-${friend.birthday_day}`;
                if (!annotations[dateKey]) {
                    annotations[dateKey] = [];
                }
                annotations[dateKey].push({
                    title: `${friend.name || 'Friend'}'s birthday`,
                    color: FRIEND_BIRTHDAY_COLOR,
                    isFriendBirthday: true,
                    friendId: friend.id
                });
            }
        });
    }

    function removeBirthdayEvents() {
        // Remove all birthday events (own and friends)
        for (const dateKey of Object.keys(annotations)) {
            annotations[dateKey] = annotations[dateKey].filter(a =>
                !(typeof a === 'object' && (a.isBirthday || a.isFriendBirthday))
            );
            if (annotations[dateKey].length === 0) {
                delete annotations[dateKey];
            }
        }
    }

    // API event functions
    async function loadEventsFromAPI() {
        if (!currentUser) return;
        try {
            events = await api('/api/events');
            friends = await fetchFriends(); // Also fetch friends for birthday display

            // Convert events to annotations format
            annotations = {};
            events.forEach(event => {
                const key = `${event.month}-${event.day}`;
                if (!annotations[key]) annotations[key] = [];
                const annotation = {
                    id: event.id,
                    title: event.title,
                    color: event.color || DEFAULT_COLOR,
                    hidden: event.hidden || false,
                };
                // Add end date for multi-day events
                if (event.end_month && event.end_day) {
                    annotation.endMonth = event.end_month - 1; // Convert to 0-indexed
                    annotation.endDay = event.end_day;
                }
                annotations[key].push(annotation);
            });
            // Inject birthday events (own and friends)
            injectBirthdayEvent();
            updateAnnotationMarkers();
        } catch (e) {
            console.error('Failed to load events:', e);
        }
    }

    async function createEventAPI(month, day, title, endMonth, endDay, color, hidden) {
        if (!currentUser) return null;
        try {
            const body = { month, day, title };
            if (endMonth !== undefined && endDay !== undefined) {
                body.end_month = endMonth;
                body.end_day = endDay;
            }
            if (color) {
                body.color = color;
            }
            if (hidden !== undefined) {
                body.hidden = hidden;
            }
            const event = await api('/api/events', {
                method: 'POST',
                body: JSON.stringify(body),
            });
            return event;
        } catch (e) {
            console.error('Failed to create event:', e);
            return null;
        }
    }

    async function deleteEventAPI(eventId) {
        if (!currentUser) return;
        try {
            await api(`/api/events/${eventId}`, { method: 'DELETE' });
        } catch (e) {
            console.error('Failed to delete event:', e);
        }
    }

    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    }

    function getDaysInYear(year) {
        return isLeapYear(year) ? 366 : 365;
    }

    function getDaysInMonth(month, year) {
        if (month === 1 && isLeapYear(year)) return 29;
        return DAYS_IN_MONTH[month];
    }

    // Get day of year from month (0-indexed) and day
    function getDayOfYearFromMonthDay(month, day, year) {
        let dayOfYear = day;
        for (let m = 0; m < month; m++) {
            dayOfYear += getDaysInMonth(m, year);
        }
        return dayOfYear;
    }

    function getMonthDayFromDayOfYear(dayOfYear, year) {
        let remaining = dayOfYear;
        for (let m = 0; m < 12; m++) {
            const daysInMonth = getDaysInMonth(m, year);
            if (remaining <= daysInMonth) {
                return { month: m, day: remaining };
            }
            remaining -= daysInMonth;
        }
        // Fallback (shouldn't happen)
        return { month: 11, day: 31 };
    }

    // Compare two dates (month is 0-indexed), returns -1, 0, or 1
    function compareDates(m1, d1, m2, d2) {
        if (m1 < m2) return -1;
        if (m1 > m2) return 1;
        if (d1 < d2) return -1;
        if (d1 > d2) return 1;
        return 0;
    }

    function getDayOfYear(date) {
        const year = date.getFullYear();
        const month = date.getMonth();
        const day = date.getDate();

        let dayOfYear = day - 1; // Start of current day
        for (let m = 0; m < month; m++) {
            dayOfYear += getDaysInMonth(m, year);
        }

        // Add fractional day based on current time
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        const fractionOfDay = (hours * 3600 + minutes * 60 + seconds) / 86400;

        return dayOfYear + fractionOfDay;
    }

    function dateToAngle(dayOfYear, totalDays) {
        // Start at top (270° in standard coords, or -90°)
        // Progress clockwise
        return -90 + (dayOfYear / totalDays) * 360;
    }

    function polarToCartesian(angle, radius) {
        const rad = (angle * Math.PI) / 180;
        return {
            x: Math.cos(rad) * radius,
            y: Math.sin(rad) * radius
        };
    }

    // Priority-based label visibility functions
    function calculateLabelPriority(dateKey, annotation) {
        const today = new Date();
        const currentYear = today.getFullYear();
        const [month, day] = dateKey.split('-').map(Number);
        const eventDate = new Date(currentYear, month - 1, day);

        let priority = 0;

        // 1. Proximity to today: max 50 points, -1 per week decay
        const daysDiff = Math.abs(Math.round((eventDate - today) / (1000 * 60 * 60 * 24)));
        const weeksDiff = daysDiff / 7;
        const proximityScore = Math.max(0, 50 - weeksDiff);
        priority += proximityScore;

        // 2. Future bias: +10 points for future events
        if (eventDate >= today) {
            priority += 10;
        }

        // 3. Duration bonus: 2-4 days (+15), 1 day (+5), 5+ days (+0)
        if (typeof annotation === 'object' && annotation.endMonth !== undefined) {
            const startDoy = getDayOfYearFromMonthDay(month - 1, day, currentYear);
            const endDoy = getDayOfYearFromMonthDay(annotation.endMonth, annotation.endDay, currentYear);
            const duration = endDoy - startDoy + 1;

            if (duration >= 2 && duration <= 4) {
                priority += 15;
            } else if (duration === 1) {
                priority += 5;
            }
            // 5+ days: +0
        } else {
            // Single day event
            priority += 5;
        }

        return priority;
    }

    function detectIsolatedLabels(labelDataArray) {
        const currentYear = new Date().getFullYear();
        const totalDays = getDaysInYear(currentYear);

        // Calculate day-of-year for each label
        labelDataArray.forEach(label => {
            const dateKey = label.id.split('-').slice(0, 2).join('-');
            const [month, day] = dateKey.split('-').map(Number);
            label.dayOfYear = getDayOfYearFromMonthDay(month - 1, day, currentYear);
        });

        // Check isolation (no neighbors within 30 days)
        labelDataArray.forEach(label => {
            let hasNeighbor = false;
            for (const other of labelDataArray) {
                if (other === label) continue;
                let dayDiff = Math.abs(label.dayOfYear - other.dayOfYear);
                // Handle year wrap-around
                dayDiff = Math.min(dayDiff, totalDays - dayDiff);
                if (dayDiff <= 30) {
                    hasNeighbor = true;
                    break;
                }
            }
            label.isIsolated = !hasNeighbor;
        });
    }

    function detectLabelCollisions(labelDataArray) {
        // Returns array of collision groups (each group is array of label indices)
        const collisionGroups = [];
        const visited = new Set();

        function boxesOverlap(a, b) {
            const padding = 2; // Small padding for near-misses
            return !(a.x + a.width + padding < b.x ||
                     b.x + b.width + padding < a.x ||
                     a.y + a.height + padding < b.y ||
                     b.y + b.height + padding < a.y);
        }

        function getBoundingBox(label) {
            return {
                x: label.x - label.width / 2,
                y: label.y - label.height,
                width: label.width,
                height: label.height
            };
        }

        // Find connected components of overlapping labels
        for (let i = 0; i < labelDataArray.length; i++) {
            if (visited.has(i)) continue;

            const group = [];
            const stack = [i];

            while (stack.length > 0) {
                const idx = stack.pop();
                if (visited.has(idx)) continue;
                visited.add(idx);
                group.push(idx);

                const boxA = getBoundingBox(labelDataArray[idx]);

                for (let j = 0; j < labelDataArray.length; j++) {
                    if (visited.has(j)) continue;
                    const boxB = getBoundingBox(labelDataArray[j]);
                    if (boxesOverlap(boxA, boxB)) {
                        stack.push(j);
                    }
                }
            }

            if (group.length > 0) {
                collisionGroups.push(group);
            }
        }

        return collisionGroups;
    }

    function calculateVisibleLabels(labelDataArray, collisionGroups) {
        // Determine how many labels to show per group based on zoom
        // At zoom 1: show 1, at zoom 15: show 4
        const labelsPerGroup = Math.min(4, Math.max(1, Math.floor(1 + (currentZoom - 1) * 3 / 14)));

        // First, mark all labels as hidden
        labelDataArray.forEach(label => {
            label.shouldShow = false;
        });

        // Process each collision group
        collisionGroups.forEach(group => {
            // Get labels in this group with their priorities
            const labelsWithPriority = group.map(idx => {
                const label = labelDataArray[idx];
                const dateKey = label.id.split('-').slice(0, 2).join('-');
                const index = parseInt(label.id.split('-')[2] || '0');
                const annotationList = annotations[dateKey] || [];
                const annotation = annotationList[index] || {};

                return {
                    idx,
                    label,
                    priority: calculateLabelPriority(dateKey, annotation),
                    isIsolated: label.isIsolated
                };
            });

            // Sort by priority (highest first)
            labelsWithPriority.sort((a, b) => b.priority - a.priority);

            // Show isolated labels always, plus top N by priority
            let shown = 0;
            labelsWithPriority.forEach(item => {
                if (item.isIsolated) {
                    item.label.shouldShow = true;
                } else if (shown < labelsPerGroup) {
                    item.label.shouldShow = true;
                    shown++;
                }
            });
        });
    }

    function updateLabelVisibility() {
        if (labelData.length === 0) return;

        // Only process labels with visible tiles
        const visibleLabels = labelData.filter(d => d.tileVisible !== false);

        const collisionGroups = detectLabelCollisions(visibleLabels);
        calculateVisibleLabels(visibleLabels, collisionGroups);

        // Apply visibility via opacity
        labelData.forEach(data => {
            const { text, line, shouldShow, tileVisible } = data;
            if (!text) return;

            // Skip labels with hidden tiles (already handled by applyLabelPositions)
            if (tileVisible === false) return;

            const opacity = shouldShow ? '1' : '0';
            text.style.opacity = opacity;
            if (line) line.style.opacity = opacity;
        });
    }

    function createArcPath(startAngle, endAngle, innerR, outerR) {
        const start1 = polarToCartesian(startAngle, outerR);
        const end1 = polarToCartesian(endAngle, outerR);
        const start2 = polarToCartesian(endAngle, innerR);
        const end2 = polarToCartesian(startAngle, innerR);

        const largeArc = endAngle - startAngle > 180 ? 1 : 0;

        return `M ${start1.x} ${start1.y}
                A ${outerR} ${outerR} 0 ${largeArc} 1 ${end1.x} ${end1.y}
                L ${start2.x} ${start2.y}
                A ${innerR} ${innerR} 0 ${largeArc} 0 ${end2.x} ${end2.y}
                Z`;
    }

    function formatDate(month, day, includeWeekday = false) {
        const dateStr = `${MONTHS[month]} ${day}`;
        if (includeWeekday) {
            const year = new Date().getFullYear();
            const date = new Date(year, month, day);
            const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
            return `${weekday}, ${dateStr}`;
        }
        return dateStr;
    }

    function getDateKey(month, day) {
        return `${month + 1}-${day}`;
    }

    function createDaySegments(year) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'day-segments');

        // Create sub-groups to control rendering order: paths -> subsegments -> labels
        const pathsGroup = document.createElementNS(SVG_NS, 'g');
        pathsGroup.setAttribute('class', 'day-segment-paths');

        const subsegmentsGroup = document.createElementNS(SVG_NS, 'g');
        subsegmentsGroup.setAttribute('class', 'event-subsegments');
        subsegmentsGroup.setAttribute('id', 'event-subsegments');

        const labelsGroup = document.createElementNS(SVG_NS, 'g');
        labelsGroup.setAttribute('class', 'day-labels');

        const totalDays = getDaysInYear(year);
        const anglePerDay = 360 / totalDays;

        let dayOfYear = 1;

        for (let month = 0; month < 12; month++) {
            const daysInMonth = getDaysInMonth(month, year);

            for (let day = 1; day <= daysInMonth; day++) {
                const startAngle = dateToAngle(dayOfYear - 1, totalDays);
                const endAngle = dateToAngle(dayOfYear, totalDays);

                const path = document.createElementNS(SVG_NS, 'path');
                path.setAttribute('d', createArcPath(startAngle, endAngle, INNER_RADIUS, OUTER_RADIUS));
                path.setAttribute('class', 'day-segment');
                path.setAttribute('data-month', month);
                path.setAttribute('data-day', day);
                path.setAttribute('data-day-of-year', dayOfYear);

                // Alternate slight shade for months
                if (month % 2 === 0) {
                    path.classList.add('even-month');
                }

                // Check if weekend (Saturday = 6, Sunday = 0)
                const date = new Date(year, month, day);
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    path.classList.add('weekend');
                }

                path.addEventListener('mouseenter', handleDayHover);
                path.addEventListener('mouseleave', handleDayLeave);
                path.addEventListener('mousedown', handleDayMouseDown);
                path.addEventListener('mouseenter', handleDayRangeMove);
                path.addEventListener('mouseup', handleDayMouseUp);

                pathsGroup.appendChild(path);

                // Add day of week and day number labels
                const midAngle = (startAngle + endAngle) / 2;
                const dayOfWeekRadius = (INNER_RADIUS + OUTER_RADIUS) / 2 + 2;
                const dayNumberRadius = (INNER_RADIUS + OUTER_RADIUS) / 2 - 2;

                // Day of week abbreviation
                const DOW_ABBREV = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
                const dowPos = polarToCartesian(midAngle, dayOfWeekRadius);
                const dowText = document.createElementNS(SVG_NS, 'text');
                dowText.setAttribute('x', dowPos.x);
                dowText.setAttribute('y', dowPos.y);
                dowText.setAttribute('class', 'day-of-week');
                dowText.setAttribute('text-anchor', 'middle');
                dowText.setAttribute('dominant-baseline', 'middle');
                dowText.textContent = DOW_ABBREV[dayOfWeek];
                labelsGroup.appendChild(dowText);

                // Day number
                const dayNumPos = polarToCartesian(midAngle, dayNumberRadius);
                const text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', dayNumPos.x);
                text.setAttribute('y', dayNumPos.y);
                text.setAttribute('class', 'day-number');
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.textContent = day;

                labelsGroup.appendChild(text);

                dayOfYear++;
            }
        }

        group.appendChild(pathsGroup);
        group.appendChild(subsegmentsGroup);
        group.appendChild(labelsGroup);

        return group;
    }

    function createMonthLabels(year) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'month-labels');

        const totalDays = getDaysInYear(year);
        let dayOfYear = 1;

        for (let month = 0; month < 12; month++) {
            const daysInMonth = getDaysInMonth(month, year);
            const midDayOfYear = dayOfYear + daysInMonth / 2;
            const angle = dateToAngle(midDayOfYear, totalDays);

            const pos = polarToCartesian(angle, OUTER_RADIUS + 20);

            const text = document.createElementNS(SVG_NS, 'text');
            text.setAttribute('x', pos.x);
            text.setAttribute('y', pos.y);
            text.setAttribute('class', 'month-label');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');

            // Rotate text to follow the circle
            let rotation = angle + 90;
            if (angle > 90 || angle < -90) {
                rotation += 180;
            }
            // Flip May, Jun (months 4, 5) and Oct, Nov, Dec (months 9, 10, 11)
            if ((month >= 4 && month <= 5) || (month >= 9 && month <= 11)) {
                rotation += 180;
            }
            text.setAttribute('transform', `rotate(${rotation}, ${pos.x}, ${pos.y})`);

            text.textContent = MONTHS[month];

            group.appendChild(text);
            dayOfYear += daysInMonth;
        }

        return group;
    }

    function createMonthTicks(year) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'month-ticks');

        const totalDays = getDaysInYear(year);
        let dayOfYear = 1;

        for (let month = 0; month < 12; month++) {
            const angle = dateToAngle(dayOfYear - 1, totalDays);
            const inner = polarToCartesian(angle, INNER_RADIUS - 5);
            const outer = polarToCartesian(angle, OUTER_RADIUS + 5);

            const line = document.createElementNS(SVG_NS, 'line');
            line.setAttribute('x1', inner.x);
            line.setAttribute('y1', inner.y);
            line.setAttribute('x2', outer.x);
            line.setAttribute('y2', outer.y);
            line.setAttribute('class', 'month-tick');

            group.appendChild(line);
            dayOfYear += getDaysInMonth(month, year);
        }

        return group;
    }

    function createClockHand(year) {
        const today = new Date();
        const dayOfYear = getDayOfYear(today);
        const totalDays = getDaysInYear(year);
        const angle = dateToAngle(dayOfYear, totalDays);

        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'clock-hand-group');

        // Clock hand as a tapered polygon (arrow shape)
        const tipPos = polarToCartesian(angle, OUTER_RADIUS - 5);
        const basePos = polarToCartesian(angle, 20);

        // Calculate perpendicular offset for the base width
        const perpAngle = angle + 90;
        const baseWidth = 2;

        const baseLeft = polarToCartesian(perpAngle, baseWidth);
        const baseRight = polarToCartesian(perpAngle, -baseWidth);

        const hand = document.createElementNS(SVG_NS, 'polygon');
        hand.setAttribute('points', `
            ${basePos.x + baseLeft.x},${basePos.y + baseLeft.y}
            ${tipPos.x},${tipPos.y}
            ${basePos.x + baseRight.x},${basePos.y + baseRight.y}
        `);
        hand.setAttribute('class', 'clock-hand');

        group.appendChild(hand);

        return group;
    }

    // Drag state for annotation labels
    let draggedAnnotation = null;
    let dragOffset = { x: 0, y: 0 };
    let hasDragged = false;
    let editingAnnotation = null; // { dateKey, index } when editing existing

    function createAnnotationMarkers(year) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'annotation-markers');
        group.setAttribute('id', 'annotation-markers');

        const totalDays = getDaysInYear(year);
        const DEFAULT_LABEL_RADIUS = OUTER_RADIUS + 3;

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [month, day] = dateKey.split('-').map(Number);
            // month in dateKey is 1-indexed, convert to 0-indexed for calculations
            const startMonth = month - 1;
            const startDay = day;

            // Create text and line for each annotation
            annList.forEach((annotation, index) => {
                // Skip hidden events - they don't get text/line markers
                const isHidden = typeof annotation === 'object' && annotation.hidden;
                if (isHidden) return;

                // Check for multi-day event
                const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;
                const endMonth = hasEndDate ? annotation.endMonth : startMonth;
                const endDay = hasEndDate ? annotation.endDay : startDay;

                // Calculate day of year for start and end
                const startDoy = getDayOfYearFromMonthDay(startMonth, startDay, year);
                const endDoy = getDayOfYearFromMonthDay(endMonth, endDay, year);

                // Use midpoint for multi-day events, or the day itself for single-day
                const midDoy = hasEndDate ? (startDoy + endDoy) / 2 : startDoy - 0.5;
                const angle = dateToAngle(midDoy, totalDays);
                const outerEdgePos = polarToCartesian(angle, OUTER_RADIUS);

                // Format date label
                let dateLabel;
                if (hasEndDate) {
                    const startAbbr = MONTHS[startMonth].substring(0, 3);
                    if (startMonth === endMonth) {
                        dateLabel = `${startAbbr} ${startDay}-${endDay}`;
                    } else {
                        const endAbbr = MONTHS[endMonth].substring(0, 3);
                        dateLabel = `${startAbbr} ${startDay}-${endAbbr} ${endDay}`;
                    }
                } else {
                    const monthAbbr = MONTHS[startMonth].substring(0, 3);
                    dateLabel = `${monthAbbr} ${startDay}`;
                }

                // Get stored position or calculate default
                let textX, textY;
                if (typeof annotation === 'object' && annotation.x !== undefined && annotation.y !== undefined) {
                    textX = annotation.x;
                    textY = annotation.y;
                } else {
                    const textRadius = DEFAULT_LABEL_RADIUS + (index * 10);
                    const textPos = polarToCartesian(angle, textRadius);
                    textX = textPos.x;
                    textY = textPos.y;
                }

                // Get color (handle both old string format and new object format)
                const color = (typeof annotation === 'object' && annotation.color) ? annotation.color : DEFAULT_COLOR;

                // Determine line start point based on text position (inside or outside)
                const textDist = Math.sqrt(textX * textX + textY * textY);
                const isInside = textDist < INNER_RADIUS;
                const lineStartRadius = isInside ? INNER_RADIUS - 3 : OUTER_RADIUS + 3;
                const lineStartPos = polarToCartesian(angle, lineStartRadius);

                // Calculate line end with gap from text
                const lineGap = 3;
                const dx = textX - lineStartPos.x;
                const dy = textY - lineStartPos.y;
                const lineLen = Math.sqrt(dx * dx + dy * dy);
                const lineEndX = lineLen > lineGap ? textX - (dx / lineLen) * lineGap : textX;
                const lineEndY = lineLen > lineGap ? textY - (dy / lineLen) * lineGap : textY;

                // Line connecting to event text
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', lineStartPos.x);
                line.setAttribute('y1', lineStartPos.y);
                line.setAttribute('x2', lineEndX);
                line.setAttribute('y2', lineEndY);
                line.setAttribute('class', 'annotation-line');
                line.setAttribute('data-date-key', dateKey);
                line.setAttribute('data-index', index);
                line.setAttribute('data-angle', angle);
                group.appendChild(line);

                const text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', textX);
                text.setAttribute('y', textY);
                text.setAttribute('class', 'annotation-text');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('data-date-key', dateKey);
                text.setAttribute('data-index', index);
                text.setAttribute('data-original-x', textX);
                text.setAttribute('data-original-y', textY);
                text.setAttribute('data-angle', angle);
                // Store end date for multi-day events (0-indexed months)
                if (hasEndDate) {
                    text.setAttribute('data-end-month', endMonth);
                    text.setAttribute('data-end-day', endDay);
                }
                text.style.fill = color;

                // Determine text anchor based on position (left/right side)
                if (textX > 0) {
                    text.setAttribute('text-anchor', 'start');
                } else {
                    text.setAttribute('text-anchor', 'end');
                }

                // Get title (handle both old string format and new object format)
                const title = typeof annotation === 'string' ? annotation : annotation.title;

                // Include date only on first annotation for this day
                if (index === 0) {
                    text.textContent = `${dateLabel}: ${title}`;
                } else {
                    text.textContent = title;
                }

                // Make draggable
                text.style.cursor = 'grab';
                text.addEventListener('mousedown', startAnnotationDrag);

                // Add hover listeners for linked highlighting
                text.addEventListener('mouseenter', handleAnnotationHover);
                text.addEventListener('mouseleave', handleAnnotationLeave);

                group.appendChild(text);
            });
        }

        return group;
    }

    function startAnnotationDrag(e) {
        e.preventDefault();
        e.stopPropagation();

        const text = e.target;
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

        draggedAnnotation = {
            element: text,
            dateKey: text.getAttribute('data-date-key'),
            index: parseInt(text.getAttribute('data-index'))
        };
        dragOffset = {
            x: svgP.x - parseFloat(text.getAttribute('x')),
            y: svgP.y - parseFloat(text.getAttribute('y'))
        };
        hasDragged = false;

        text.style.cursor = 'grabbing';
        document.addEventListener('mousemove', dragAnnotation);
        document.addEventListener('mouseup', endAnnotationDrag);
    }

    function dragAnnotation(e) {
        if (!draggedAnnotation) return;

        hasDragged = true;

        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

        let newX = svgP.x - dragOffset.x;
        let newY = svgP.y - dragOffset.y;

        // Update text position and original position (for viewport following)
        draggedAnnotation.element.setAttribute('x', newX);
        draggedAnnotation.element.setAttribute('y', newY);
        draggedAnnotation.element.setAttribute('data-original-x', newX);
        draggedAnnotation.element.setAttribute('data-original-y', newY);

        // Update corresponding line
        const line = document.querySelector(
            `.annotation-line[data-date-key="${draggedAnnotation.dateKey}"][data-index="${draggedAnnotation.index}"]`
        );
        if (line) {
            // Update line start point based on whether text is inside or outside
            const textDist = Math.sqrt(newX * newX + newY * newY);
            const isInside = textDist < INNER_RADIUS;
            const angle = parseFloat(line.getAttribute('data-angle'));
            const lineStartRadius = isInside ? INNER_RADIUS - 3 : OUTER_RADIUS + 3;
            const lineStartPos = polarToCartesian(angle, lineStartRadius);
            line.setAttribute('x1', lineStartPos.x);
            line.setAttribute('y1', lineStartPos.y);

            // Update line end point with gap from text
            const lineGap = 3;
            const dx = newX - lineStartPos.x;
            const dy = newY - lineStartPos.y;
            const lineLen = Math.sqrt(dx * dx + dy * dy);
            const lineEndX = lineLen > lineGap ? newX - (dx / lineLen) * lineGap : newX;
            const lineEndY = lineLen > lineGap ? newY - (dy / lineLen) * lineGap : newY;
            line.setAttribute('x2', lineEndX);
            line.setAttribute('y2', lineEndY);
        }
    }

    function endAnnotationDrag(e) {
        if (!draggedAnnotation) return;

        const dateKey = draggedAnnotation.dateKey;
        const index = draggedAnnotation.index;

        if (!hasDragged) {
            // It was a click, not a drag - open edit modal
            draggedAnnotation.element.style.cursor = 'grab';
            draggedAnnotation = null;
            document.removeEventListener('mousemove', dragAnnotation);
            document.removeEventListener('mouseup', endAnnotationDrag);
            openEditModal(dateKey, index);
            return;
        }

        const newX = parseFloat(draggedAnnotation.element.getAttribute('x'));
        const newY = parseFloat(draggedAnnotation.element.getAttribute('y'));

        // Save position to annotation data
        const annotation = annotations[dateKey][index];

        if (typeof annotation === 'string') {
            // Convert string to object format
            annotations[dateKey][index] = { title: annotation, x: newX, y: newY };
        } else {
            annotation.x = newX;
            annotation.y = newY;
        }

        // Save to storage
        if (!currentUser) {
            saveAnnotationsLocal();
        }

        // Update label data with new position
        const nodeId = `${dateKey}-${index}`;
        const node = labelData.find(n => n.id === nodeId);
        if (node) {
            node.x = newX;
            node.y = newY;
            node.originalX = newX;
            node.originalY = newY;
        }

        draggedAnnotation.element.style.cursor = 'grab';
        draggedAnnotation = null;
        document.removeEventListener('mousemove', dragAnnotation);
        document.removeEventListener('mouseup', endAnnotationDrag);
    }

    function openEditModal(dateKey, index) {
        const [month, day] = dateKey.split('-').map(Number);
        const annotation = annotations[dateKey][index];

        // If this is a birthday event, open settings instead
        if (typeof annotation === 'object' && annotation.isBirthday) {
            openSettingsModal();
            return;
        }

        const title = typeof annotation === 'string' ? annotation : annotation.title;
        const color = (typeof annotation === 'object' && annotation.color) ? annotation.color : DEFAULT_COLOR;
        const hidden = (typeof annotation === 'object' && annotation.hidden) ? annotation.hidden : false;

        editingAnnotation = { dateKey, index };
        selectedDate = { month: month - 1, day };
        modalDate.textContent = formatDate(month - 1, day, true);

        // Hide existing annotations list and "also on this day" when editing
        existingAnnotations.innerHTML = '';
        document.getElementById('also-on-this-day').innerHTML = '';

        // Set current values
        annotationInput.value = title;
        selectedColor = color;
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('selected', opt.getAttribute('data-color') === color);
        });

        // Set visibility toggle to current state
        selectedHidden = hidden;
        document.querySelectorAll('.visibility-btn').forEach(btn => {
            btn.classList.toggle('selected', (btn.getAttribute('data-hidden') === 'true') === hidden);
        });

        // Show delete button, hide it otherwise
        const deleteBtn = document.getElementById('delete-btn');
        if (deleteBtn) deleteBtn.style.display = 'inline-block';

        modal.style.display = 'flex';
        annotationInput.focus();
        annotationInput.select();
    }

    function createCenterText(year) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'center-text');
        group.setAttribute('id', 'center-text-group');

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        // Date text (above center)
        const dateText = document.createElementNS(SVG_NS, 'text');
        dateText.setAttribute('x', 0);
        dateText.setAttribute('y', -10);
        dateText.setAttribute('class', 'center-date');
        dateText.setAttribute('text-anchor', 'middle');
        dateText.setAttribute('dominant-baseline', 'middle');
        dateText.textContent = dateStr;

        // Time text (below center)
        const timeText = document.createElementNS(SVG_NS, 'text');
        timeText.setAttribute('x', 0);
        timeText.setAttribute('y', 10);
        timeText.setAttribute('class', 'center-time');
        timeText.setAttribute('text-anchor', 'middle');
        timeText.setAttribute('dominant-baseline', 'middle');
        timeText.textContent = timeStr;

        // Initial transform at origin (will be updated by updateCenterTextPosition)
        group.setAttribute('transform', 'translate(0, 0)');

        group.appendChild(dateText);
        group.appendChild(timeText);

        return group;
    }

    function updateCenterText() {
        const group = document.getElementById('center-text-group');
        if (!group) return;

        const now = new Date();
        const dateStr = now.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
        const timeStr = now.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });

        const dateText = group.querySelector('.center-date');
        const timeText = group.querySelector('.center-time');

        if (dateText) dateText.textContent = dateStr;
        if (timeText) timeText.textContent = timeStr;
    }

    function updateCenterTextPosition() {
        const group = document.getElementById('center-text-group');
        if (!group) return;

        const vb = getViewBox();

        // Check if origin (0, 0) is within the viewport
        const originVisible = (
            0 >= vb.x && 0 <= vb.x + vb.w &&
            0 >= vb.y && 0 <= vb.y + vb.h
        );

        const dateText = group.querySelector('.center-date');
        const timeText = group.querySelector('.center-time');
        const baseTextSize = 14;
        const scaledTextSize = baseTextSize / currentZoom;

        let posX, posY;
        if (originVisible) {
            // Keep at original center position
            posX = 0;
            posY = 0;

            // Center-aligned when in the middle
            if (dateText) dateText.setAttribute('text-anchor', 'middle');
            if (timeText) timeText.setAttribute('text-anchor', 'middle');

            const yOffset = 8 / currentZoom;
            if (dateText) dateText.setAttribute('y', -yOffset);
            if (timeText) timeText.setAttribute('y', yOffset);
        } else {
            // Move to upper-left corner of viewport
            const padding = 10 / currentZoom;
            posX = vb.x + padding;
            posY = vb.y + padding;

            // Left-aligned when pinned to top-left
            if (dateText) dateText.setAttribute('text-anchor', 'start');
            if (timeText) timeText.setAttribute('text-anchor', 'start');

            const lineHeight = scaledTextSize * 1.4;
            if (dateText) dateText.setAttribute('y', lineHeight);
            if (timeText) timeText.setAttribute('y', lineHeight * 2);
        }

        group.setAttribute('transform', `translate(${posX}, ${posY})`);

        if (dateText) dateText.style.fontSize = scaledTextSize + 'px';
        if (timeText) timeText.style.fontSize = scaledTextSize + 'px';
    }

    function initLabeler() {
        // Build label data from current annotation text elements
        labelData = [];
        const texts = document.querySelectorAll('.annotation-text');

        texts.forEach(text => {
            const dateKey = text.getAttribute('data-date-key');
            const index = text.getAttribute('data-index');
            const line = document.querySelector(`.annotation-line[data-date-key="${dateKey}"][data-index="${index}"]`);

            const originalX = parseFloat(text.getAttribute('data-original-x'));
            const originalY = parseFloat(text.getAttribute('data-original-y'));
            const anchorX = line ? parseFloat(line.getAttribute('x1')) : originalX;
            const anchorY = line ? parseFloat(line.getAttribute('y1')) : originalY;

            // Estimate text dimensions
            const bbox = text.getBBox();

            labelData.push({
                id: `${dateKey}-${index}`,
                text: text,
                line: line,
                x: originalX,
                y: originalY,
                width: bbox.width || 50,
                height: bbox.height || 10,
                originalX: originalX,
                originalY: originalY,
                anchorX: anchorX,
                anchorY: anchorY
            });
        });

        if (labelData.length === 0) return;

        // Calculate isolation status for priority-based visibility
        detectIsolatedLabels(labelData);

        runLabeler();
    }

    function runLabeler() {
        if (labelData.length === 0) return;

        const vb = getViewBox();

        // Build arrays for the labeler
        // Offset coordinates to positive space for the labeler algorithm
        const offsetX = -vb.x;
        const offsetY = -vb.y;

        const labels = labelData.map(d => ({
            x: d.originalX + offsetX,
            y: d.originalY + offsetY,
            width: d.width,
            height: d.height,
            originalX: d.originalX,
            originalY: d.originalY
        }));

        const anchors = labelData.map(d => ({
            x: d.anchorX + offsetX,
            y: d.anchorY + offsetY,
            r: 5
        }));

        // Run the labeler
        d3.labeler()
            .label(labels)
            .anchor(anchors)
            .width(vb.w)
            .height(vb.h)
            .start(500);

        // Apply results back to labelData (convert back from offset coordinates)
        labels.forEach((label, i) => {
            labelData[i].x = label.x - offsetX;
            labelData[i].y = label.y - offsetY;
        });

        // Update DOM
        applyLabelPositions();

        // Apply priority-based visibility (collision detection)
        updateLabelVisibility();
    }

    function applyLabelPositions() {
        labelData.forEach(data => {
            const { text, line, anchorX, anchorY, x, y } = data;
            if (!text) return;

            // Labels stay at their fixed positions - no clamping or movement
            data.tileVisible = true;

            text.style.display = '';
            if (line) line.style.display = '';

            text.setAttribute('x', x);
            text.setAttribute('y', y);
        });
    }

    function updateEventTextPositions() {
        // Update label visibility during pan/zoom (labels stay at fixed positions)
        applyLabelPositions();
    }

    function handleDayHover(e) {
        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));

        let text = formatDate(month, day);

        // Get all event titles that span this date (including multi-day events)
        const titles = getEventTitlesForDate(month, day);
        if (titles.length > 0) {
            text += ': ' + titles.join(', ');
        }

        tooltip.textContent = text;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';

        e.target.classList.add('hovered');

        // Highlight linked annotation text and lines (including multi-day events containing this date)
        const eventDateKeys = findEventsContainingDate(month, day);
        eventDateKeys.forEach(key => highlightLinkedAnnotations(key, true));
    }

    function getEventTitlesForDate(month, day) {
        // Returns array of event titles for all events that contain the given date
        // month is 0-indexed
        const year = new Date().getFullYear();
        const targetDoy = getDayOfYearFromMonthDay(month, day, year);
        const titles = [];

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [startMonth, startDay] = dateKey.split('-').map(Number);
            const startMonthIdx = startMonth - 1; // Convert to 0-indexed

            for (const annotation of annList) {
                const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;
                const endMonthIdx = hasEndDate ? annotation.endMonth : startMonthIdx;
                const endDay = hasEndDate ? annotation.endDay : startDay;

                const startDoy = getDayOfYearFromMonthDay(startMonthIdx, startDay, year);
                const endDoy = getDayOfYearFromMonthDay(endMonthIdx, endDay, year);

                if (targetDoy >= startDoy && targetDoy <= endDoy) {
                    const title = typeof annotation === 'string' ? annotation : annotation.title;
                    titles.push(title);
                }
            }
        }

        return titles;
    }

    function handleDayLeave(e) {
        tooltip.style.display = 'none';
        e.target.classList.remove('hovered');

        // Remove linked annotation highlighting
        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));
        const eventDateKeys = findEventsContainingDate(month, day);
        eventDateKeys.forEach(key => highlightLinkedAnnotations(key, false));
    }

    function findEventsContainingDate(month, day) {
        // Returns array of dateKeys for all events that contain the given date
        // month is 0-indexed
        const year = new Date().getFullYear();
        const targetDoy = getDayOfYearFromMonthDay(month, day, year);
        const result = [];

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [startMonth, startDay] = dateKey.split('-').map(Number);
            const startMonthIdx = startMonth - 1; // Convert to 0-indexed

            for (const annotation of annList) {
                const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;
                const endMonthIdx = hasEndDate ? annotation.endMonth : startMonthIdx;
                const endDay = hasEndDate ? annotation.endDay : startDay;

                const startDoy = getDayOfYearFromMonthDay(startMonthIdx, startDay, year);
                const endDoy = getDayOfYearFromMonthDay(endMonthIdx, endDay, year);

                if (targetDoy >= startDoy && targetDoy <= endDoy) {
                    if (!result.includes(dateKey)) {
                        result.push(dateKey);
                    }
                    break; // Found a match in this dateKey, move to next
                }
            }
        }

        return result;
    }

    function highlightLinkedAnnotations(dateKey, highlight) {
        // Find all annotation texts and lines for this date
        const texts = document.querySelectorAll(`.annotation-text[data-date-key="${dateKey}"]`);
        const lines = document.querySelectorAll(`.annotation-line[data-date-key="${dateKey}"]`);

        texts.forEach(text => {
            if (highlight) {
                text.classList.add('linked-hover');
            } else {
                text.classList.remove('linked-hover');
            }
        });

        lines.forEach(line => {
            if (highlight) {
                line.classList.add('linked-hover');
            } else {
                line.classList.remove('linked-hover');
            }
        });
    }

    function highlightLinkedDayTile(dateKey, highlight, endMonth, endDay) {
        // dateKey is "month-day" with 1-indexed month
        const [month, day] = dateKey.split('-').map(Number);
        const startMonthIdx = month - 1; // Convert to 0-indexed
        const year = new Date().getFullYear();

        // Determine if this is a multi-day event
        const hasEndDate = endMonth !== undefined && endDay !== undefined;
        const endMonthIdx = hasEndDate ? endMonth : startMonthIdx;
        const finalEndDay = hasEndDate ? endDay : day;

        // Iterate through all days in the range
        const startDoy = getDayOfYearFromMonthDay(startMonthIdx, day, year);
        const endDoy = getDayOfYearFromMonthDay(endMonthIdx, finalEndDay, year);

        for (let doy = startDoy; doy <= endDoy; doy++) {
            const { month: m, day: d } = getMonthDayFromDayOfYear(doy, year);

            // Find the day segment
            const segment = document.querySelector(`.day-segment[data-month="${m}"][data-day="${d}"]`);
            if (segment) {
                if (highlight) {
                    segment.classList.add('linked-hover');
                } else {
                    segment.classList.remove('linked-hover');
                }
            }

            // Also highlight any event subsegments for multi-event days
            const subsegments = document.querySelectorAll(`.event-subsegment[data-month="${m}"][data-day="${d}"]`);
            subsegments.forEach(sub => {
                if (highlight) {
                    sub.classList.add('linked-hover');
                } else {
                    sub.classList.remove('linked-hover');
                }
            });
        }
    }

    function handleAnnotationHover(e) {
        const dateKey = e.target.getAttribute('data-date-key');
        const endMonthAttr = e.target.getAttribute('data-end-month');
        const endDayAttr = e.target.getAttribute('data-end-day');
        const endMonth = endMonthAttr !== null ? parseInt(endMonthAttr) : undefined;
        const endDay = endDayAttr !== null ? parseInt(endDayAttr) : undefined;

        highlightLinkedDayTile(dateKey, true, endMonth, endDay);
        highlightLinkedAnnotations(dateKey, true);
    }

    function handleAnnotationLeave(e) {
        const dateKey = e.target.getAttribute('data-date-key');
        const endMonthAttr = e.target.getAttribute('data-end-month');
        const endDayAttr = e.target.getAttribute('data-end-day');
        const endMonth = endMonthAttr !== null ? parseInt(endMonthAttr) : undefined;
        const endDay = endDayAttr !== null ? parseInt(endDayAttr) : undefined;

        highlightLinkedDayTile(dateKey, false, endMonth, endDay);
        highlightLinkedAnnotations(dateKey, false);
    }

    function handleDayMouseDown(e) {
        e.preventDefault();
        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));

        isSelectingRange = true;
        rangeStartDate = { month, day };
        selectedDate = { month, day };
        selectedEndDate = null;

        // Highlight the starting day
        clearRangeHighlight();
        e.target.classList.add('range-selected');

        // Add global mouseup listener in case user releases outside a day segment
        document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    function handleDayRangeMove(e) {
        if (!isSelectingRange || !rangeStartDate) return;

        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));
        const year = new Date().getFullYear();

        // Only allow forward selection (end >= start)
        if (compareDates(month, day, rangeStartDate.month, rangeStartDate.day) >= 0) {
            selectedEndDate = { month, day };
            highlightRange(rangeStartDate, selectedEndDate, year);
        }
    }

    function handleDayMouseUp(e) {
        if (!isSelectingRange) return;

        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));

        // If released on valid forward date, update end date
        if (compareDates(month, day, rangeStartDate.month, rangeStartDate.day) >= 0) {
            selectedEndDate = { month, day };
        }

        finishRangeSelection();
    }

    function handleGlobalMouseUp(e) {
        if (!isSelectingRange) return;
        document.removeEventListener('mouseup', handleGlobalMouseUp);

        // If mouseup happened outside day segments, use current selection
        if (!e.target.classList.contains('day-segment')) {
            finishRangeSelection();
        }
    }

    function finishRangeSelection() {
        isSelectingRange = false;
        document.removeEventListener('mouseup', handleGlobalMouseUp);

        selectedDate = rangeStartDate;
        editingAnnotation = null;

        // Format the date header
        if (selectedEndDate && compareDates(selectedEndDate.month, selectedEndDate.day, selectedDate.month, selectedDate.day) > 0) {
            // Multi-day range
            const startStr = formatDate(selectedDate.month, selectedDate.day);
            const endStr = selectedDate.month === selectedEndDate.month
                ? selectedEndDate.day  // Same month, just show day
                : formatDate(selectedEndDate.month, selectedEndDate.day);
            modalDate.textContent = `${startStr}-${endStr}`;
        } else {
            // Single day
            selectedEndDate = null;
            modalDate.textContent = formatDate(selectedDate.month, selectedDate.day, true);
        }

        // Clear existing annotations (used for edit mode)
        existingAnnotations.innerHTML = '';

        // Show "Also on this day" buttons for existing events on this date
        renderAlsoOnThisDay(selectedDate.month, selectedDate.day);

        // Reset color picker to default
        selectedColor = DEFAULT_COLOR;
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('selected', opt.getAttribute('data-color') === DEFAULT_COLOR);
        });

        // Reset visibility toggle to Show
        selectedHidden = false;
        document.querySelectorAll('.visibility-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-hidden') === 'false');
        });

        // Hide delete button when adding new
        const deleteBtn = document.getElementById('delete-btn');
        if (deleteBtn) deleteBtn.style.display = 'none';

        annotationInput.value = '';
        modal.style.display = 'flex';
        annotationInput.focus();
    }

    function clearRangeHighlight() {
        document.querySelectorAll('.day-segment.range-selected').forEach(el => {
            el.classList.remove('range-selected');
        });
    }

    function highlightRange(start, end, year) {
        clearRangeHighlight();

        const startDoy = getDayOfYearFromMonthDay(start.month, start.day, year);
        const endDoy = getDayOfYearFromMonthDay(end.month, end.day, year);

        document.querySelectorAll('.day-segment').forEach(segment => {
            const doy = parseInt(segment.getAttribute('data-day-of-year'));
            if (doy >= startDoy && doy <= endDoy) {
                segment.classList.add('range-selected');
            }
        });
    }

    function renderExistingAnnotations(dateKey, existing) {
        if (existing.length > 0) {
            existingAnnotations.innerHTML = '<p><strong>Existing:</strong></p><ul>' +
                existing.map((a, i) => {
                    const title = typeof a === 'string' ? a : a.title;
                    const eventId = typeof a === 'object' ? a.id : null;
                    return `<li>${title} <button class="delete-btn" data-index="${i}" data-event-id="${eventId || ''}">&times;</button></li>`;
                }).join('') +
                '</ul>';
            existingAnnotations.querySelectorAll('.delete-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const index = parseInt(e.target.getAttribute('data-index'));
                    const eventId = e.target.getAttribute('data-event-id');
                    deleteAnnotation(dateKey, index, eventId);
                });
            });
        } else {
            existingAnnotations.innerHTML = '';
        }
    }

    function renderAlsoOnThisDay(month, day) {
        const alsoOnThisDay = document.getElementById('also-on-this-day');
        // Find all events that contain this date (including multi-day events)
        // month is 0-indexed
        const year = new Date().getFullYear();
        const targetDoy = getDayOfYearFromMonthDay(month, day, year);
        const eventsOnDay = [];

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [startMonth, startDay] = dateKey.split('-').map(Number);
            const startMonthIdx = startMonth - 1; // Convert to 0-indexed

            annList.forEach((annotation, index) => {
                const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;
                const endMonthIdx = hasEndDate ? annotation.endMonth : startMonthIdx;
                const endDay = hasEndDate ? annotation.endDay : startDay;

                const startDoy = getDayOfYearFromMonthDay(startMonthIdx, startDay, year);
                const endDoy = getDayOfYearFromMonthDay(endMonthIdx, endDay, year);

                if (targetDoy >= startDoy && targetDoy <= endDoy) {
                    const title = typeof annotation === 'string' ? annotation : annotation.title;
                    eventsOnDay.push({ dateKey, index, title });
                }
            });
        }

        if (eventsOnDay.length > 0) {
            alsoOnThisDay.innerHTML = '<p class="also-on-day-label">Also on this day:</p>' +
                eventsOnDay.map(e =>
                    `<button class="also-on-day-btn" data-date-key="${e.dateKey}" data-index="${e.index}">${e.title}</button>`
                ).join('');

            alsoOnThisDay.querySelectorAll('.also-on-day-btn').forEach(btn => {
                btn.addEventListener('click', (evt) => {
                    const dateKey = evt.target.getAttribute('data-date-key');
                    const index = parseInt(evt.target.getAttribute('data-index'));
                    openEditModal(dateKey, index);
                });
            });
        } else {
            alsoOnThisDay.innerHTML = '';
        }
    }

    async function deleteAnnotation(dateKey, index, eventId) {
        // Delete from API if logged in and has event ID
        if (currentUser && eventId) {
            await deleteEventAPI(eventId);
        }

        annotations[dateKey].splice(index, 1);
        if (annotations[dateKey].length === 0) {
            delete annotations[dateKey];
        }

        if (!currentUser) {
            saveAnnotationsLocal();
        }
        updateAnnotationMarkers();

        // Update modal display
        const existing = annotations[dateKey] || [];
        renderExistingAnnotations(dateKey, existing);
    }

    async function saveAnnotation() {
        if (!selectedDate) return;

        const text = annotationInput.value.trim();
        if (!text) {
            closeModal();
            return;
        }

        const dateKey = getDateKey(selectedDate.month, selectedDate.day);

        if (editingAnnotation) {
            // Editing existing annotation
            const annotation = annotations[editingAnnotation.dateKey][editingAnnotation.index];
            if (typeof annotation === 'object') {
                annotation.title = text;
                annotation.color = selectedColor;
                annotation.hidden = selectedHidden;
            } else {
                annotations[editingAnnotation.dateKey][editingAnnotation.index] = {
                    title: text,
                    color: selectedColor,
                    hidden: selectedHidden
                };
            }
            if (!currentUser) {
                saveAnnotationsLocal();
            }
        } else {
            // Adding new annotation
            if (!annotations[dateKey]) {
                annotations[dateKey] = [];
            }

            // Build annotation object
            const newAnnotation = {
                title: text,
                color: selectedColor,
                hidden: selectedHidden
            };

            // Add end date for multi-day events
            if (selectedEndDate && compareDates(selectedEndDate.month, selectedEndDate.day, selectedDate.month, selectedDate.day) > 0) {
                newAnnotation.endMonth = selectedEndDate.month;
                newAnnotation.endDay = selectedEndDate.day;
            }

            // Calculate initial position within current viewport
            const year = new Date().getFullYear();
            const totalDays = getDaysInYear(year);
            let targetAngle;
            if (newAnnotation.endMonth !== undefined) {
                // Multi-day event - use midpoint
                const startDoy = getDayOfYearFromMonthDay(selectedDate.month, selectedDate.day, year);
                const endDoy = getDayOfYearFromMonthDay(newAnnotation.endMonth, newAnnotation.endDay, year);
                targetAngle = dateToAngle((startDoy + endDoy) / 2, totalDays);
            } else {
                // Single day
                const doy = getDayOfYearFromMonthDay(selectedDate.month, selectedDate.day, year);
                targetAngle = dateToAngle(doy - 0.5, totalDays);
            }
            const initialPos = calculateInitialAnnotationPosition(targetAngle);
            newAnnotation.x = initialPos.x;
            newAnnotation.y = initialPos.y;

            if (currentUser) {
                // Save to API with end date and color
                const endMonth = newAnnotation.endMonth !== undefined ? newAnnotation.endMonth + 1 : undefined;
                const endDay = newAnnotation.endDay;
                const event = await createEventAPI(
                    selectedDate.month + 1,
                    selectedDate.day,
                    text,
                    endMonth,
                    endDay,
                    selectedColor,
                    selectedHidden
                );
                if (event) {
                    newAnnotation.id = event.id;
                    annotations[dateKey].push(newAnnotation);
                }
            } else {
                // Save locally with color
                annotations[dateKey].push(newAnnotation);
                saveAnnotationsLocal();
            }
        }

        updateAnnotationMarkers();
        closeModal();
    }

    async function deleteCurrentAnnotation() {
        if (!editingAnnotation) return;

        const { dateKey, index } = editingAnnotation;
        const annotation = annotations[dateKey][index];
        const eventId = (typeof annotation === 'object') ? annotation.id : null;

        // Delete from API if logged in and has event ID
        if (currentUser && eventId) {
            await deleteEventAPI(eventId);
        }

        annotations[dateKey].splice(index, 1);
        if (annotations[dateKey].length === 0) {
            delete annotations[dateKey];
        }

        if (!currentUser) {
            saveAnnotationsLocal();
        }

        updateAnnotationMarkers();
        closeModal();
    }

    function closeModal() {
        modal.style.display = 'none';
        selectedDate = null;
        selectedEndDate = null;
        editingAnnotation = null;
        annotationInput.value = '';
        clearRangeHighlight();
        // Also clear list view drag state
        if (typeof isListDragging !== 'undefined') {
            isListDragging = false;
            listDragStart = null;
            listDragEnd = null;
        }
        if (typeof clearListRangeHighlight === 'function') {
            clearListRangeHighlight();
        }
    }

    function updateAnnotationMarkers() {
        const oldMarkers = document.getElementById('annotation-markers');
        if (oldMarkers) {
            oldMarkers.remove();
        }
        svg.appendChild(createAnnotationMarkers(new Date().getFullYear()));
        updateDaySegmentHighlights();
        updateDynamicFontSizes();
        initLabeler();
        // Also update list view if it's active
        if (typeof updateListView === 'function') {
            updateListView();
        }
    }

    function updateDaySegmentHighlights() {
        const year = new Date().getFullYear();
        const totalDays = getDaysInYear(year);

        // Clear all existing highlights and inline styles
        document.querySelectorAll('.day-segment.has-event').forEach(el => {
            el.classList.remove('has-event');
            el.style.fill = '';
        });

        // Remove any existing event sub-segments
        document.querySelectorAll('.event-subsegment').forEach(el => el.remove());

        // Build a map of day -> list of {color, title} for all events
        const dayEventsMap = {}; // key: "month-day" (0-indexed month), value: [{color, title}]

        for (const dateKey of Object.keys(annotations)) {
            if (!annotations[dateKey] || annotations[dateKey].length === 0) continue;

            const [month, day] = dateKey.split('-').map(Number);
            const startMonth = month - 1; // Convert to 0-indexed

            annotations[dateKey].forEach(annotation => {
                const color = (typeof annotation === 'object' && annotation.color)
                    ? annotation.color
                    : DEFAULT_COLOR;
                const title = typeof annotation === 'string' ? annotation : annotation.title;
                const hidden = typeof annotation === 'object' && annotation.hidden;

                // Check for multi-day event
                const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;

                if (hasEndDate) {
                    // Add to all days in the range
                    const startDoy = getDayOfYearFromMonthDay(startMonth, day, year);
                    const endDoy = getDayOfYearFromMonthDay(annotation.endMonth, annotation.endDay, year);
                    const duration = endDoy - startDoy + 1;
                    // Hidden multi-day events get extra fading, regular multi-day > 4 days also faded
                    const faded = hidden ? true : (duration > 4);

                    // Iterate through days in range
                    let currentDoy = startDoy;
                    let currentMonth = startMonth;
                    let currentDay = day;

                    while (currentDoy <= endDoy) {
                        const dayKey = `${currentMonth}-${currentDay}`;
                        if (!dayEventsMap[dayKey]) dayEventsMap[dayKey] = [];
                        dayEventsMap[dayKey].push({ color, title, faded, hidden });

                        // Move to next day
                        currentDay++;
                        if (currentDay > getDaysInMonth(currentMonth, year)) {
                            currentDay = 1;
                            currentMonth++;
                        }
                        currentDoy++;
                    }
                } else {
                    // Single day event - hidden events get faded
                    const dayKey = `${startMonth}-${day}`;
                    if (!dayEventsMap[dayKey]) dayEventsMap[dayKey] = [];
                    dayEventsMap[dayKey].push({ color, title, faded: hidden, hidden });
                }
            });
        }

        // Now apply highlights based on the map
        const subsegmentsGroup = document.getElementById('event-subsegments');

        for (const [dayKey, eventsList] of Object.entries(dayEventsMap)) {
            const [monthIdx, dayNum] = dayKey.split('-').map(Number);

            const segment = document.querySelector(
                `.day-segment[data-month="${monthIdx}"][data-day="${dayNum}"]`
            );
            if (!segment) continue;

            segment.classList.add('has-event');

            // Get unique colors while preserving order, track faded and hidden state
            const uniqueColors = [];
            const colorToTitles = {};
            const colorToFaded = {};
            const colorToHidden = {};
            eventsList.forEach(evt => {
                if (!colorToTitles[evt.color]) {
                    colorToTitles[evt.color] = [];
                    colorToFaded[evt.color] = evt.faded;
                    colorToHidden[evt.color] = evt.hidden;
                    uniqueColors.push(evt.color);
                }
                colorToTitles[evt.color].push(evt.title);
                // If any event with this color is not faded, don't fade it
                if (!evt.faded) colorToFaded[evt.color] = false;
                // If any event with this color is not hidden, don't hide it
                if (!evt.hidden) colorToHidden[evt.color] = false;
            });

            // Calculate opacity: hidden events are more muted, faded (long multi-day) also muted
            const getOpacity = (color) => {
                if (colorToHidden[color]) return 0.25; // Hidden events very muted
                if (colorToFaded[color]) return 0.4;   // Long multi-day events somewhat muted
                return 1;
            };

            if (uniqueColors.length === 1) {
                // Single color - just set the fill
                const color = uniqueColors[0];
                segment.style.fill = color;
                segment.style.opacity = getOpacity(color);
            } else {
                // Multiple colors - create radial sub-segments
                segment.style.fill = 'transparent';

                const dayOfYear = parseInt(segment.getAttribute('data-day-of-year'));
                const startAngle = dateToAngle(dayOfYear - 1, totalDays);
                const endAngle = dateToAngle(dayOfYear, totalDays);

                // Split the arc radially (from inner to outer) into segments
                const numColors = uniqueColors.length;
                const radiusStep = (OUTER_RADIUS - INNER_RADIUS) / numColors;

                uniqueColors.forEach((color, i) => {
                    const innerR = INNER_RADIUS + i * radiusStep;
                    const outerR = INNER_RADIUS + (i + 1) * radiusStep;

                    const subPath = document.createElementNS(SVG_NS, 'path');
                    subPath.setAttribute('d', createArcPath(startAngle, endAngle, innerR, outerR));
                    subPath.setAttribute('class', 'event-subsegment');
                    subPath.setAttribute('data-month', monthIdx);
                    subPath.setAttribute('data-day', dayNum);
                    subPath.setAttribute('data-color', color);
                    subPath.setAttribute('data-titles', colorToTitles[color].join(', '));
                    subPath.style.fill = color;
                    subPath.style.opacity = getOpacity(color);

                    // Add hover handlers for tooltip
                    subPath.addEventListener('mouseenter', handleSubsegmentHover);
                    subPath.addEventListener('mouseleave', handleSubsegmentLeave);
                    subPath.addEventListener('mousedown', handleDayMouseDown);
                    subPath.addEventListener('mouseenter', handleDayRangeMove);
                    subPath.addEventListener('mouseup', handleDayMouseUp);

                    subsegmentsGroup.appendChild(subPath);
                });
            }
        }
    }

    function handleSubsegmentHover(e) {
        const titles = e.target.getAttribute('data-titles');
        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));

        const text = `${formatDate(month, day)}: ${titles}`;

        tooltip.textContent = text;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';

        e.target.addEventListener('mousemove', handleSubsegmentMove);

        // Highlight linked annotation text and lines (including multi-day events containing this date)
        const eventDateKeys = findEventsContainingDate(month, day);
        eventDateKeys.forEach(key => highlightLinkedAnnotations(key, true));
    }

    function handleSubsegmentMove(e) {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';
    }

    function handleSubsegmentLeave(e) {
        tooltip.style.display = 'none';
        e.target.removeEventListener('mousemove', handleSubsegmentMove);

        // Remove linked annotation highlighting
        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));
        const eventDateKeys = findEventsContainingDate(month, day);
        eventDateKeys.forEach(key => highlightLinkedAnnotations(key, false));
    }

    function saveAnnotationsLocal() {
        // Save to localStorage for non-authenticated users
        localStorage.setItem('circleCalAnnotations', JSON.stringify(annotations));
    }

    function loadFromLocalStorage() {
        const saved = localStorage.getItem('circleCalAnnotations');
        if (saved) {
            try {
                annotations = JSON.parse(saved);
            } catch (e) {
                annotations = {};
            }
        }
    }

    function getViewBox() {
        const vb = svg.getAttribute('viewBox').split(' ').map(Number);
        return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
    }

    function isPointInViewBox(x, y, vb) {
        return x >= vb.x && x <= vb.x + vb.w && y >= vb.y && y <= vb.y + vb.h;
    }

    function calculateInitialAnnotationPosition(angle) {
        const vb = getViewBox();
        const DEFAULT_LABEL_RADIUS = OUTER_RADIUS + 3;
        const INSIDE_LABEL_RADIUS = CENTER_RADIUS - 20;

        // Try outside position first (default behavior)
        const outsidePos = polarToCartesian(angle, DEFAULT_LABEL_RADIUS);
        if (isPointInViewBox(outsidePos.x, outsidePos.y, vb)) {
            return outsidePos;
        }

        // Try inside position
        const insidePos = polarToCartesian(angle, INSIDE_LABEL_RADIUS);
        if (isPointInViewBox(insidePos.x, insidePos.y, vb)) {
            return insidePos;
        }

        // Neither standard position is visible - position within viewbox
        // Offset from viewbox center in the direction of the date tile
        const vbCenterX = vb.x + vb.w / 2;
        const vbCenterY = vb.y + vb.h / 2;

        const offsetRadius = Math.min(vb.w, vb.h) * 0.3;
        const rad = (angle * Math.PI) / 180;
        let targetX = vbCenterX + Math.cos(rad) * offsetRadius;
        let targetY = vbCenterY + Math.sin(rad) * offsetRadius;

        return { x: targetX, y: targetY };
    }

    function setViewBox(x, y, w, h) {
        svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
        currentZoom = 700 / w;
        svg.classList.toggle('zoomed', currentZoom > 1.1);
        updateDynamicFontSizes();
        updateCenterTextPosition();
        updateEventTextPositions();
        updateLabelVisibility();
    }

    function updateDynamicFontSizes() {
        // Day numbers and day of week: same size, scale up with zoom
        const dayLabelSize = 0.6 * Math.sqrt(currentZoom);
        document.querySelectorAll('.day-number').forEach(el => {
            el.style.fontSize = dayLabelSize + 'px';
        });
        document.querySelectorAll('.day-of-week').forEach(el => {
            el.style.fontSize = dayLabelSize + 'px';
        });

        // Annotation text: scale down with zoom to maintain roughly constant screen size
        // Base 7px at zoom 1, shrinks to ~3px at zoom 5
        const annotationSize = 7 / Math.sqrt(currentZoom);
        document.querySelectorAll('.annotation-text').forEach(el => {
            el.style.fontSize = annotationSize + 'px';
        });

        // Month labels: scale down with zoom to maintain roughly constant screen size
        // Base 10px at zoom 1
        const monthLabelSize = 10 / Math.sqrt(currentZoom);
        document.querySelectorAll('.month-label').forEach(el => {
            el.style.fontSize = monthLabelSize + 'px';
        });
    }

    function handleWheel(e) {
        e.preventDefault();

        // Get cursor position in SVG coordinates before zoom
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

        // Calculate zoom factor (pinch gestures send ctrlKey with wheel)
        const delta = e.ctrlKey ? e.deltaY * 0.02 : e.deltaY * 0.005;
        const zoomFactor = Math.exp(-delta);
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * zoomFactor));

        if (newZoom === currentZoom) return;

        const vb = getViewBox();
        const newSize = 700 / newZoom;

        // Zoom centered on cursor position
        const cursorRatioX = (svgP.x - vb.x) / vb.w;
        const cursorRatioY = (svgP.y - vb.y) / vb.h;

        const newX = svgP.x - cursorRatioX * newSize;
        const newY = svgP.y - cursorRatioY * newSize;

        setViewBox(newX, newY, newSize, newSize);
    }

    function handlePanStart(e) {
        // Only pan with left mouse button, not during day clicks
        if (e.button !== 0) return;

        // Don't pan when clicking on day segments (for range selection)
        if (e.target.classList.contains('day-segment')) return;

        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        const vb = getViewBox();
        viewBoxStart = { x: vb.x, y: vb.y };
        svg.style.cursor = 'grabbing';
    }

    function handlePanMove(e) {
        if (!isPanning) return;

        const vb = getViewBox();
        const scale = vb.w / svg.clientWidth;

        const dx = (e.clientX - panStart.x) * scale;
        const dy = (e.clientY - panStart.y) * scale;

        svg.setAttribute('viewBox', `${viewBoxStart.x - dx} ${viewBoxStart.y - dy} ${vb.w} ${vb.h}`);
        updateCenterTextPosition();
        updateEventTextPositions();
    }

    function handlePanEnd(e) {
        if (isPanning) {
            isPanning = false;
            svg.style.cursor = '';
        }
    }

    // Touch support for mobile pinch-to-zoom and pan
    let touchStartDistance = 0;
    let touchStartZoom = 1;
    let touchStartCenter = { x: 0, y: 0 };
    let isTouchPanning = false;
    let lastTouchCenter = { x: 0, y: 0 };

    function getTouchDistance(touches) {
        const dx = touches[0].clientX - touches[1].clientX;
        const dy = touches[0].clientY - touches[1].clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getTouchCenter(touches) {
        return {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2
        };
    }

    function handleTouchStart(e) {
        if (e.touches.length === 2) {
            // Pinch zoom start
            e.preventDefault();
            touchStartDistance = getTouchDistance(e.touches);
            touchStartZoom = currentZoom;
            touchStartCenter = getTouchCenter(e.touches);
            lastTouchCenter = touchStartCenter;
            isTouchPanning = false;
        } else if (e.touches.length === 1) {
            // Single touch pan start
            if (e.target.classList.contains('day-segment')) return;
            isTouchPanning = true;
            panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            const vb = getViewBox();
            viewBoxStart = { x: vb.x, y: vb.y };
        }
    }

    function handleTouchMove(e) {
        if (e.touches.length === 2) {
            // Pinch zoom
            e.preventDefault();
            const currentDistance = getTouchDistance(e.touches);
            const currentCenter = getTouchCenter(e.touches);

            // Calculate new zoom
            const scale = currentDistance / touchStartDistance;
            const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, touchStartZoom * scale));

            if (newZoom !== currentZoom) {
                // Get center position in SVG coordinates
                const pt = svg.createSVGPoint();
                pt.x = currentCenter.x;
                pt.y = currentCenter.y;
                const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

                const vb = getViewBox();
                const newSize = 700 / newZoom;

                // Zoom centered on pinch center
                const cursorRatioX = (svgP.x - vb.x) / vb.w;
                const cursorRatioY = (svgP.y - vb.y) / vb.h;

                const newX = svgP.x - cursorRatioX * newSize;
                const newY = svgP.y - cursorRatioY * newSize;

                setViewBox(newX, newY, newSize, newSize);
            }

            lastTouchCenter = currentCenter;
        } else if (e.touches.length === 1 && isTouchPanning) {
            // Single touch pan
            e.preventDefault();
            const vb = getViewBox();
            const scale = vb.w / svg.clientWidth;

            const dx = (e.touches[0].clientX - panStart.x) * scale;
            const dy = (e.touches[0].clientY - panStart.y) * scale;

            svg.setAttribute('viewBox', `${viewBoxStart.x - dx} ${viewBoxStart.y - dy} ${vb.w} ${vb.h}`);
            updateCenterTextPosition();
            updateEventTextPositions();
        }
    }

    function handleTouchEnd(e) {
        if (e.touches.length < 2) {
            touchStartDistance = 0;
        }
        if (e.touches.length === 0) {
            isTouchPanning = false;
        }
    }

    function resetZoom() {
        const defaultZoom = 1.4;
        const defaultSize = 700 / defaultZoom;
        // const defaultSize = 400
        // Offset Y upward
        const yOffset = defaultSize * 0.05;
        setViewBox(-defaultSize / 2, -defaultSize / 2 + yOffset, defaultSize, defaultSize);
    }

    async function init() {
        const year = new Date().getFullYear();

        // Load local annotations first (as fallback)
        loadFromLocalStorage();

        // Build the calendar
        svg.appendChild(createDaySegments(year));
        svg.appendChild(createMonthTicks(year));
        svg.appendChild(createMonthLabels(year));
        svg.appendChild(createClockHand(year));
        svg.appendChild(createAnnotationMarkers(year));
        svg.appendChild(createCenterText(year));
        updateDaySegmentHighlights();
        initLabeler();

        // Set initial zoom/position
        resetZoom();

        // Auth event listeners
        if (loginBtn) loginBtn.addEventListener('click', handleLogin);
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

        // Settings event listeners
        if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
        if (settingsSaveBtn) settingsSaveBtn.addEventListener('click', saveSettings);
        if (settingsCancelBtn) settingsCancelBtn.addEventListener('click', closeSettingsModal);
        if (clearBirthdayBtn) clearBirthdayBtn.addEventListener('click', clearBirthday);
        if (birthdayMonth) {
            birthdayMonth.addEventListener('change', () => {
                const month = parseInt(birthdayMonth.value);
                if (month) {
                    const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
                    birthdayDay.max = daysInMonth[month - 1];
                    // Clamp current value if needed
                    if (parseInt(birthdayDay.value) > daysInMonth[month - 1]) {
                        birthdayDay.value = daysInMonth[month - 1];
                    }
                }
            });
        }
        if (settingsModal) {
            settingsModal.addEventListener('click', (e) => {
                if (e.target === settingsModal) closeSettingsModal();
            });
        }

        // Friends event listeners
        if (friendsBtn) friendsBtn.addEventListener('click', openFriendsModal);
        if (friendsCloseBtn) friendsCloseBtn.addEventListener('click', closeFriendsModal);
        if (sendRequestBtn) sendRequestBtn.addEventListener('click', handleSendFriendRequest);
        if (friendEmailInput) {
            friendEmailInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') handleSendFriendRequest();
            });
        }
        if (friendsModal) {
            friendsModal.addEventListener('click', (e) => {
                if (e.target === friendsModal) closeFriendsModal();
            });
        }

        // Check if user is authenticated (will load events from API if so)
        await checkAuth();

        // Modal event listeners
        document.getElementById('save-btn').addEventListener('click', saveAnnotation);
        document.getElementById('cancel-btn').addEventListener('click', closeModal);
        document.getElementById('delete-btn').addEventListener('click', deleteCurrentAnnotation);

        // Color picker event listeners
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.color-option').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                selectedColor = e.target.getAttribute('data-color');
            });
        });

        // Visibility toggle event listeners
        document.querySelectorAll('.visibility-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.visibility-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                selectedHidden = e.target.getAttribute('data-hidden') === 'true';
            });
        });

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (modal.style.display === 'flex') {
                    closeModal();
                }
                if (settingsModal && settingsModal.style.display === 'flex') {
                    closeSettingsModal();
                }
                if (friendsModal && friendsModal.style.display === 'flex') {
                    closeFriendsModal();
                }
            }
            if (e.key === 'Enter' && modal.style.display === 'flex' && !e.shiftKey) {
                e.preventDefault();
                saveAnnotation();
            }
        });

        // Zoom handler - pinch/scroll to zoom continuously
        svg.addEventListener('wheel', handleWheel, { passive: false });

        // Double-click to reset zoom
        svg.addEventListener('dblclick', resetZoom);

        // Pan handlers - click and drag to pan
        svg.addEventListener('mousedown', handlePanStart);
        svg.addEventListener('mousemove', handlePanMove);
        svg.addEventListener('mouseup', handlePanEnd);
        svg.addEventListener('mouseleave', handlePanEnd);

        // Touch handlers for mobile pinch-to-zoom and pan
        svg.addEventListener('touchstart', handleTouchStart, { passive: false });
        svg.addEventListener('touchmove', handleTouchMove, { passive: false });
        svg.addEventListener('touchend', handleTouchEnd);

        // Update time every minute
        setInterval(updateCenterText, 60000);

        // Size the SVG explicitly for iOS/Safari compatibility
        sizeSVGWrapper();
        window.addEventListener('resize', sizeSVGWrapper);
        window.addEventListener('orientationchange', () => {
            // Delay to allow orientation change to complete
            setTimeout(sizeSVGWrapper, 100);
        });

        // Initialize view toggle
        initViewToggle();
    }

    // Explicitly set SVG height based on width for iOS/Safari compatibility
    function sizeSVGWrapper() {
        const wrapper = document.querySelector('.calendar-wrapper');
        if (wrapper) {
            const width = wrapper.offsetWidth;
            svg.style.height = width + 'px';
        }
    }

    // ==================== LIST VIEW ====================

    let currentView = 'circle'; // 'circle' or 'list'
    const circleViewBtn = document.getElementById('circle-view-btn');
    const listViewBtn = document.getElementById('list-view-btn');
    const circleViewContainer = document.getElementById('circle-view');
    const listViewContainer = document.getElementById('list-view');
    const listCalendar = document.getElementById('list-calendar');

    const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // List view drag selection state
    let listDragStart = null; // { month, day } - 0-indexed month
    let listDragEnd = null;
    let isListDragging = false;
    let listDragMoved = false; // Track if mouse actually moved during drag
    let listDragFromEvent = null; // Track event info if drag started from event tile

    function switchView(view) {
        currentView = view;

        // Clear any drag selection state
        isListDragging = false;
        listDragStart = null;
        listDragEnd = null;

        if (view === 'circle') {
            circleViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
            circleViewContainer.classList.add('active');
            listViewContainer.classList.remove('active');
        } else {
            circleViewBtn.classList.remove('active');
            listViewBtn.classList.add('active');
            circleViewContainer.classList.remove('active');
            listViewContainer.classList.add('active');
            renderListView();
        }
    }

    function renderListView() {
        const year = new Date().getFullYear();
        const today = new Date();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();

        listCalendar.innerHTML = '';

        let todayElement = null;

        for (let month = 0; month < 12; month++) {
            const daysInMonth = getDaysInMonth(month, year);

            // Month header
            const monthHeader = document.createElement('div');
            monthHeader.className = 'list-month-header';
            monthHeader.textContent = MONTHS[month];
            monthHeader.setAttribute('data-month', month);
            listCalendar.appendChild(monthHeader);

            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isToday = month === todayMonth && day === todayDay;

                const dayElement = document.createElement('div');
                dayElement.className = 'list-day';
                dayElement.setAttribute('data-month', month);
                dayElement.setAttribute('data-day', day);
                if (isWeekend) dayElement.classList.add('weekend');
                if (isToday) {
                    dayElement.classList.add('today');
                    todayElement = dayElement;
                }

                // Date column
                const dateCol = document.createElement('div');
                dateCol.className = 'list-day-date';

                const dayNumber = document.createElement('span');
                dayNumber.className = 'list-day-number';
                dayNumber.textContent = day;

                const weekdayName = document.createElement('span');
                weekdayName.className = 'list-day-weekday';
                weekdayName.textContent = WEEKDAYS[dayOfWeek];

                dateCol.appendChild(dayNumber);
                dateCol.appendChild(weekdayName);
                dayElement.appendChild(dateCol);

                // Events column (single-day events only)
                const eventsCol = document.createElement('div');
                eventsCol.className = 'list-day-events';

                // Get single-day events for this day
                const dayEvents = getEventsForListDay(month, day, year, true);
                dayEvents.forEach(event => {
                    const eventEl = document.createElement('div');
                    eventEl.className = 'list-event';
                    eventEl.style.backgroundColor = hexToRgba(event.color, 0.2);
                    if (event.hidden) eventEl.classList.add('hidden-event');

                    const dot = document.createElement('span');
                    dot.className = 'list-event-dot';
                    dot.style.backgroundColor = event.color;

                    const title = document.createElement('span');
                    title.className = 'list-event-title';
                    title.textContent = event.title;

                    eventEl.appendChild(dot);
                    eventEl.appendChild(title);

                    // Click on event to edit it
                    eventEl.addEventListener('click', (e) => {
                        e.stopPropagation();
                        openEditModalFromList(event.dateKey, event.index, month, day);
                    });

                    eventsCol.appendChild(eventEl);
                });

                dayElement.appendChild(eventsCol);

                // Mouse down to start drag selection
                dayElement.addEventListener('mousedown', (e) => {
                    if (e.button !== 0) return; // Only left click
                    e.preventDefault();
                    startListDrag(month, day);
                });

                listCalendar.appendChild(dayElement);
            }
        }

        // Render multi-day event overlays
        renderMultiDayEventOverlays(year);

        // Scroll to today after a brief delay to ensure rendering is complete
        if (todayElement) {
            setTimeout(() => {
                todayElement.scrollIntoView({ block: 'center' });
            }, 50);
        }
    }

    function renderMultiDayEventOverlays(year) {
        // Create or get the overlay element
        let overlay = document.getElementById('list-multiday-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'list-multiday-overlay';
            listCalendar.appendChild(overlay);
        }
        overlay.innerHTML = '';

        const multiDayEvents = getAllMultiDayEvents(year);
        if (multiDayEvents.length === 0) return;

        // Get all day elements for position calculation
        const dayElements = listCalendar.querySelectorAll('.list-day');
        const dayPositions = {};

        dayElements.forEach(el => {
            const m = parseInt(el.getAttribute('data-month'));
            const d = parseInt(el.getAttribute('data-day'));
            const key = `${m}-${d}`;
            dayPositions[key] = {
                top: el.offsetTop,
                height: el.offsetHeight
            };
        });

        multiDayEvents.forEach(event => {
            const startKey = `${event.startMonth}-${event.startDay}`;
            const endKey = `${event.endMonth}-${event.endDay}`;

            const startPos = dayPositions[startKey];
            const endPos = dayPositions[endKey];

            if (!startPos || !endPos) return;

            const top = startPos.top;
            const height = (endPos.top + endPos.height) - startPos.top;

            const eventEl = document.createElement('div');
            eventEl.className = 'list-multiday-event';
            eventEl.style.top = top + 'px';
            eventEl.style.height = height + 'px';
            eventEl.style.backgroundColor = hexToRgba(event.color, 0.25);
            eventEl.style.borderLeftColor = event.color;
            if (event.hidden) eventEl.classList.add('hidden-event');

            const dot = document.createElement('span');
            dot.className = 'list-multiday-event-dot';
            dot.style.backgroundColor = event.color;

            const title = document.createElement('span');
            title.className = 'list-multiday-event-title';
            title.textContent = event.title;

            const range = document.createElement('span');
            range.className = 'list-multiday-event-range';
            range.textContent = event.rangeLabel;

            eventEl.appendChild(dot);
            eventEl.appendChild(title);
            eventEl.appendChild(range);

            // Mousedown on event to allow starting drag from here or clicking to edit
            eventEl.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return;
                const dayInfo = getDayAtPosition(e.clientY);
                if (dayInfo) {
                    e.preventDefault();
                    // Pass event info so we can open edit modal on click (no drag)
                    startListDrag(dayInfo.month, dayInfo.day, {
                        dateKey: event.dateKey,
                        index: event.index,
                        startMonth: event.startMonth,
                        startDay: event.startDay
                    });
                }
            });

            overlay.appendChild(eventEl);
        });
    }

    function getEventsForListDay(month, day, year, singleDayOnly = false) {
        // month is 0-indexed
        const targetDoy = getDayOfYearFromMonthDay(month, day, year);
        const result = [];

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [startMonth, startDay] = dateKey.split('-').map(Number);
            const startMonthIdx = startMonth - 1; // Convert to 0-indexed
            const startDoy = getDayOfYearFromMonthDay(startMonthIdx, startDay, year);

            // Only show events that START on this day
            if (startDoy !== targetDoy) continue;

            annList.forEach((annotation, index) => {
                if (typeof annotation === 'string') {
                    // Simple string annotation (legacy)
                    result.push({
                        dateKey,
                        index,
                        title: annotation,
                        color: DEFAULT_COLOR,
                        hidden: false,
                        isMultiDay: false,
                        rangeLabel: null,
                        durationDays: 1,
                        startMonth: startMonthIdx,
                        startDay: startDay
                    });
                } else {
                    const hasEndDate = annotation.endMonth !== undefined;
                    const endMonthIdx = hasEndDate ? annotation.endMonth : startMonthIdx;
                    const endDay = hasEndDate ? annotation.endDay : startDay;
                    const endDoy = getDayOfYearFromMonthDay(endMonthIdx, endDay, year);
                    const durationDays = endDoy - startDoy + 1;

                    // Skip multi-day events if we only want single-day
                    if (singleDayOnly && hasEndDate) return;

                    let rangeLabel = null;
                    if (hasEndDate) {
                        const startAbbr = MONTHS[startMonthIdx].substring(0, 3);
                        const endAbbr = MONTHS[endMonthIdx].substring(0, 3);
                        if (startMonthIdx === endMonthIdx) {
                            rangeLabel = `${startAbbr} ${startDay}-${endDay}`;
                        } else {
                            rangeLabel = `${startAbbr} ${startDay} - ${endAbbr} ${endDay}`;
                        }
                    }

                    result.push({
                        dateKey,
                        index,
                        title: annotation.title,
                        color: annotation.color || DEFAULT_COLOR,
                        hidden: annotation.hidden || false,
                        isMultiDay: hasEndDate,
                        rangeLabel,
                        durationDays,
                        startMonth: startMonthIdx,
                        startDay: startDay,
                        endMonth: endMonthIdx,
                        endDay: endDay
                    });
                }
            });
        }

        return result;
    }

    function getAllMultiDayEvents(year) {
        const result = [];

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [startMonth, startDay] = dateKey.split('-').map(Number);
            const startMonthIdx = startMonth - 1;

            annList.forEach((annotation, index) => {
                if (typeof annotation === 'object' && annotation.endMonth !== undefined) {
                    const endMonthIdx = annotation.endMonth;
                    const endDay = annotation.endDay;

                    const startAbbr = MONTHS[startMonthIdx].substring(0, 3);
                    const endAbbr = MONTHS[endMonthIdx].substring(0, 3);
                    let rangeLabel;
                    if (startMonthIdx === endMonthIdx) {
                        rangeLabel = `${startAbbr} ${startDay}-${endDay}`;
                    } else {
                        rangeLabel = `${startAbbr} ${startDay} - ${endAbbr} ${endDay}`;
                    }

                    result.push({
                        dateKey,
                        index,
                        title: annotation.title,
                        color: annotation.color || DEFAULT_COLOR,
                        hidden: annotation.hidden || false,
                        rangeLabel,
                        startMonth: startMonthIdx,
                        startDay: startDay,
                        endMonth: endMonthIdx,
                        endDay: endDay
                    });
                }
            });
        }

        return result;
    }

    function hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    function startListDrag(month, day, eventInfo = null) {
        isListDragging = true;
        listDragMoved = false;
        listDragFromEvent = eventInfo; // { dateKey, index, startMonth, startDay } or null
        listDragStart = { month, day };
        listDragEnd = { month, day };
        highlightListRange(month, day, month, day);
        // Disable pointer events on multi-day events during drag
        const overlay = document.getElementById('list-multiday-overlay');
        if (overlay) overlay.classList.add('dragging');
    }

    function updateListDrag(month, day) {
        if (!isListDragging || !listDragStart) return;

        // Check if we actually moved to a different day
        if (listDragEnd && (listDragEnd.month !== month || listDragEnd.day !== day)) {
            listDragMoved = true;
        }

        listDragEnd = { month, day };
        const year = new Date().getFullYear();
        const startDoy = getDayOfYearFromMonthDay(listDragStart.month, listDragStart.day, year);
        const endDoy = getDayOfYearFromMonthDay(month, day, year);

        if (startDoy <= endDoy) {
            highlightListRange(listDragStart.month, listDragStart.day, month, day);
        } else {
            highlightListRange(month, day, listDragStart.month, listDragStart.day);
        }
    }

    function getDayAtPosition(clientY) {
        const dayElements = listCalendar.querySelectorAll('.list-day');
        for (const dayEl of dayElements) {
            const rect = dayEl.getBoundingClientRect();
            if (clientY >= rect.top && clientY <= rect.bottom) {
                return {
                    month: parseInt(dayEl.getAttribute('data-month')),
                    day: parseInt(dayEl.getAttribute('data-day'))
                };
            }
        }
        return null;
    }

    function highlightListRange(startMonth, startDay, endMonth, endDay) {
        // Create or get the drag highlight overlay
        let highlight = document.getElementById('list-drag-highlight');
        if (!highlight) {
            highlight = document.createElement('div');
            highlight.id = 'list-drag-highlight';
            listCalendar.appendChild(highlight);
        }

        // Find the day elements for start and end
        const startEl = listCalendar.querySelector(`.list-day[data-month="${startMonth}"][data-day="${startDay}"]`);
        const endEl = listCalendar.querySelector(`.list-day[data-month="${endMonth}"][data-day="${endDay}"]`);

        if (!startEl || !endEl) {
            highlight.style.display = 'none';
            return;
        }

        // Calculate position and height
        const top = startEl.offsetTop;
        const height = (endEl.offsetTop + endEl.offsetHeight) - startEl.offsetTop;

        highlight.style.display = 'block';
        highlight.style.top = top + 'px';
        highlight.style.height = height + 'px';
    }

    function clearListRangeHighlight() {
        const highlight = document.getElementById('list-drag-highlight');
        if (highlight) {
            highlight.style.display = 'none';
        }
    }

    function openModalFromListRange(startMonth, startDay, endMonth, endDay) {
        // months are 0-indexed
        selectedDate = { month: startMonth, day: startDay };
        selectedEndDate = { month: endMonth, day: endDay };
        editingAnnotation = null;

        // Format date display
        const startStr = `${MONTHS[startMonth]} ${startDay}`;
        const endStr = `${MONTHS[endMonth]} ${endDay}`;
        modalDate.textContent = `${startStr} - ${endStr}`;

        // Hide existing annotations and "also on this day" sections
        existingAnnotations.innerHTML = '';
        document.getElementById('also-on-this-day').innerHTML = '';

        // Clear input and reset color/visibility
        annotationInput.value = '';
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-color') === DEFAULT_COLOR);
        });
        selectedColor = DEFAULT_COLOR;
        document.querySelectorAll('.visibility-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-hidden') === 'false');
        });
        selectedHidden = false;

        // Hide delete button for new annotations
        document.getElementById('delete-btn').style.display = 'none';

        modal.style.display = 'flex';
        annotationInput.focus();
    }

    function openModalFromList(month, day) {
        // month is 0-indexed
        selectedDate = { month: month, day: day };
        selectedEndDate = null;
        editingAnnotation = null;

        // Format date display
        const dateStr = `${MONTHS[month]} ${day}`;
        modalDate.textContent = dateStr;

        // Hide existing annotations and "also on this day" sections
        existingAnnotations.innerHTML = '';
        document.getElementById('also-on-this-day').innerHTML = '';

        // Clear input and reset color/visibility
        annotationInput.value = '';
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-color') === DEFAULT_COLOR);
        });
        selectedColor = DEFAULT_COLOR;
        document.querySelectorAll('.visibility-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-hidden') === 'false');
        });
        selectedHidden = false;

        // Hide delete button for new annotations
        document.getElementById('delete-btn').style.display = 'none';

        modal.style.display = 'flex';
        annotationInput.focus();
    }

    function openEditModalFromList(dateKey, index, clickedMonth, clickedDay) {
        const annList = annotations[dateKey];
        if (!annList || !annList[index]) return;

        const annotation = annList[index];
        const [startMonth, startDay] = dateKey.split('-').map(Number);

        // Set selected date to the event's start date
        selectedDate = { month: startMonth - 1, day: startDay };

        // If multi-day, set end date
        if (annotation.endMonth !== undefined) {
            selectedEndDate = { month: annotation.endMonth, day: annotation.endDay };
        } else {
            selectedEndDate = null;
        }

        editingAnnotation = { dateKey, index };

        // Format date display
        let dateStr = `${MONTHS[startMonth - 1]} ${startDay}`;
        if (selectedEndDate) {
            const endMonthName = MONTHS[selectedEndDate.month];
            dateStr += ` - ${endMonthName} ${selectedEndDate.day}`;
        }
        modalDate.textContent = dateStr;

        // Hide existing annotations list when editing
        existingAnnotations.innerHTML = '';

        // Fill in the current annotation
        annotationInput.value = annotation.title || '';
        const color = annotation.color || DEFAULT_COLOR;
        document.querySelectorAll('.color-option').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-color') === color);
        });
        selectedColor = color;
        const hidden = annotation.hidden || false;
        document.querySelectorAll('.visibility-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.getAttribute('data-hidden') === String(hidden));
        });
        selectedHidden = hidden;

        // Show delete button for existing annotations
        document.getElementById('delete-btn').style.display = 'block';

        // Hide "also on this day" section when editing
        document.getElementById('also-on-this-day').innerHTML = '';

        modal.style.display = 'flex';
        annotationInput.focus();
    }

    function updateListView() {
        if (currentView === 'list') {
            renderListView();
        }
    }

    function initViewToggle() {
        if (circleViewBtn) {
            circleViewBtn.addEventListener('click', () => switchView('circle'));
        }
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => switchView('list'));
        }

        // Global mousemove handler for list drag selection
        document.addEventListener('mousemove', (e) => {
            if (isListDragging && listDragStart) {
                const dayInfo = getDayAtPosition(e.clientY);
                if (dayInfo) {
                    updateListDrag(dayInfo.month, dayInfo.day);
                }
            }
        });

        // Global mouseup handler for list drag selection
        document.addEventListener('mouseup', () => {
            // Re-enable pointer events on multi-day events
            const overlay = document.getElementById('list-multiday-overlay');
            if (overlay) overlay.classList.remove('dragging');

            if (isListDragging && listDragStart) {
                isListDragging = false;
                const start = listDragStart;
                const end = listDragEnd || listDragStart;

                const year = new Date().getFullYear();
                const startDoy = getDayOfYearFromMonthDay(start.month, start.day, year);
                const endDoy = getDayOfYearFromMonthDay(end.month, end.day, year);

                // Keep highlight visible for multi-day, clear for single day
                if (startDoy === endDoy) {
                    clearListRangeHighlight();
                    // Check if this was a click on an event tile (no drag)
                    if (listDragFromEvent && !listDragMoved) {
                        // Open edit modal for the clicked event
                        openEditModalFromList(
                            listDragFromEvent.dateKey,
                            listDragFromEvent.index,
                            listDragFromEvent.startMonth,
                            listDragFromEvent.startDay
                        );
                    } else {
                        // Open new event modal
                        openModalFromList(start.month, start.day);
                    }
                } else if (startDoy < endDoy) {
                    openModalFromListRange(start.month, start.day, end.month, end.day);
                } else {
                    openModalFromListRange(end.month, end.day, start.month, start.day);
                }

                listDragStart = null;
                listDragEnd = null;
            }
        });
    }

    init();
})();
