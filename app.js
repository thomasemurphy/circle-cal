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
            await loadEventsFromAPI();
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

    async function createEventAPI(month, day, title, endMonth, endDay, color) {
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
        const DEFAULT_LABEL_RADIUS = OUTER_RADIUS + 6;

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [month, day] = dateKey.split('-').map(Number);
            // month in dateKey is 1-indexed, convert to 0-indexed for calculations
            const startMonth = month - 1;
            const startDay = day;

            // Create text and line for each annotation
            annList.forEach((annotation, index) => {
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
                    const textRadius = DEFAULT_LABEL_RADIUS + (index * 12);
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

        // Constrain: not on date tiles (between INNER_RADIUS and OUTER_RADIUS)
        const distFromCenter = Math.sqrt(newX * newX + newY * newY);
        if (distFromCenter > INNER_RADIUS && distFromCenter < OUTER_RADIUS) {
            // Push to nearest valid position (inside or outside the ring)
            const midRing = (INNER_RADIUS + OUTER_RADIUS) / 2;
            const targetRadius = distFromCenter < midRing ? CENTER_RADIUS : OUTER_RADIUS + 10;
            const angle = Math.atan2(newY, newX);
            newX = Math.cos(angle) * targetRadius;
            newY = Math.sin(angle) * targetRadius;
        }

        // Update text position and original position (for viewport following)
        draggedAnnotation.element.setAttribute('x', newX);
        draggedAnnotation.element.setAttribute('y', newY);
        draggedAnnotation.element.setAttribute('data-original-x', newX);
        draggedAnnotation.element.setAttribute('data-original-y', newY);

        // Update text anchor based on position
        if (newX > 0) {
            draggedAnnotation.element.setAttribute('text-anchor', 'start');
        } else {
            draggedAnnotation.element.setAttribute('text-anchor', 'end');
        }

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

        editingAnnotation = { dateKey, index };
        selectedDate = { month: month - 1, day };
        modalDate.textContent = formatDate(month - 1, day, true);

        // Hide existing annotations list when editing
        existingAnnotations.innerHTML = '';

        // Set current values
        annotationInput.value = title;
        selectedColor = color;
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('selected', opt.getAttribute('data-color') === color);
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
    }

    function applyLabelPositions() {
        const vb = getViewBox();
        const padding = 10 / currentZoom;

        labelData.forEach(data => {
            const { text, line, anchorX, anchorY, x, y } = data;
            if (!text) return;

            // Check if anchor (tile) is visible
            let tileVisible = true;
            if (currentZoom > 1.1) {
                const margin = OUTER_RADIUS - INNER_RADIUS;
                tileVisible = (
                    anchorX >= vb.x - margin && anchorX <= vb.x + vb.w + margin &&
                    anchorY >= vb.y - margin && anchorY <= vb.y + vb.h + margin
                );
            }

            if (!tileVisible) {
                text.style.display = 'none';
                if (line) line.style.display = 'none';
                return;
            }

            text.style.display = '';
            if (line) line.style.display = '';

            // Clamp position to viewport if needed
            let newX = x;
            let newY = y;

            if (currentZoom > 1.1) {
                newX = Math.max(vb.x + padding, Math.min(vb.x + vb.w - padding, newX));
                newY = Math.max(vb.y + padding, Math.min(vb.y + vb.h - padding, newY));
            }

            text.setAttribute('x', newX);
            text.setAttribute('y', newY);

            // Update text anchor based on position relative to anchor
            if (newX > anchorX) {
                text.setAttribute('text-anchor', 'start');
            } else {
                text.setAttribute('text-anchor', 'end');
            }

            // Update line - connect to closest edge of text bounding box
            if (line) {
                const bbox = text.getBBox();
                const boxLeft = bbox.x;
                const boxRight = bbox.x + bbox.width;
                const boxTop = bbox.y;
                const boxBottom = bbox.y + bbox.height;
                const boxCenterX = bbox.x + bbox.width / 2;
                const boxCenterY = bbox.y + bbox.height / 2;

                // Find closest point on rectangle edge to anchor
                let closestX, closestY;

                // Clamp anchor to box bounds to find closest point
                const clampedX = Math.max(boxLeft, Math.min(boxRight, anchorX));
                const clampedY = Math.max(boxTop, Math.min(boxBottom, anchorY));

                // If anchor is inside the box, use center
                if (anchorX >= boxLeft && anchorX <= boxRight && anchorY >= boxTop && anchorY <= boxBottom) {
                    closestX = boxCenterX;
                    closestY = boxCenterY;
                } else {
                    // Find which edge to connect to
                    const distLeft = Math.abs(anchorX - boxLeft);
                    const distRight = Math.abs(anchorX - boxRight);
                    const distTop = Math.abs(anchorY - boxTop);
                    const distBottom = Math.abs(anchorY - boxBottom);

                    // Check if anchor is more to the side or above/below
                    const minHoriz = Math.min(distLeft, distRight);
                    const minVert = Math.min(distTop, distBottom);

                    if (anchorX < boxLeft) {
                        // Anchor is to the left
                        closestX = boxLeft;
                        closestY = clampedY;
                    } else if (anchorX > boxRight) {
                        // Anchor is to the right
                        closestX = boxRight;
                        closestY = clampedY;
                    } else if (anchorY < boxTop) {
                        // Anchor is above
                        closestX = clampedX;
                        closestY = boxTop;
                    } else {
                        // Anchor is below
                        closestX = clampedX;
                        closestY = boxBottom;
                    }
                }

                // Add small gap from the edge
                const lineGap = 2;
                const dx = closestX - anchorX;
                const dy = closestY - anchorY;
                const lineLen = Math.sqrt(dx * dx + dy * dy);
                const lineEndX = lineLen > lineGap ? closestX - (dx / lineLen) * lineGap : closestX;
                const lineEndY = lineLen > lineGap ? closestY - (dy / lineLen) * lineGap : closestY;

                line.setAttribute('x2', lineEndX);
                line.setAttribute('y2', lineEndY);
            }
        });
    }

    function updateEventTextPositions() {
        // Only update visibility and clamping during pan/zoom
        // Don't re-run labeler - that only happens when annotations change
        applyLabelPositions();
    }

    function handleDayHover(e) {
        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));
        const dateKey = getDateKey(month, day);

        let text = formatDate(month, day);
        if (annotations[dateKey] && annotations[dateKey].length > 0) {
            const titles = annotations[dateKey].map(a => typeof a === 'string' ? a : a.title);
            text += ': ' + titles.join(', ');
        }

        tooltip.textContent = text;
        tooltip.style.display = 'block';
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';

        e.target.classList.add('hovered');
    }

    function handleDayLeave(e) {
        tooltip.style.display = 'none';
        e.target.classList.remove('hovered');
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

        // For new events, don't show existing (could be complex with ranges)
        existingAnnotations.innerHTML = '';

        // Reset color picker to default
        selectedColor = DEFAULT_COLOR;
        document.querySelectorAll('.color-option').forEach(opt => {
            opt.classList.toggle('selected', opt.getAttribute('data-color') === DEFAULT_COLOR);
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
            } else {
                annotations[editingAnnotation.dateKey][editingAnnotation.index] = {
                    title: text,
                    color: selectedColor
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
                color: selectedColor
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
                    selectedColor
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

                // Check for multi-day event
                const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;

                if (hasEndDate) {
                    // Add to all days in the range
                    const startDoy = getDayOfYearFromMonthDay(startMonth, day, year);
                    const endDoy = getDayOfYearFromMonthDay(annotation.endMonth, annotation.endDay, year);
                    const duration = endDoy - startDoy + 1;
                    const faded = duration > 4;

                    // Iterate through days in range
                    let currentDoy = startDoy;
                    let currentMonth = startMonth;
                    let currentDay = day;

                    while (currentDoy <= endDoy) {
                        const dayKey = `${currentMonth}-${currentDay}`;
                        if (!dayEventsMap[dayKey]) dayEventsMap[dayKey] = [];
                        dayEventsMap[dayKey].push({ color, title, faded });

                        // Move to next day
                        currentDay++;
                        if (currentDay > getDaysInMonth(currentMonth, year)) {
                            currentDay = 1;
                            currentMonth++;
                        }
                        currentDoy++;
                    }
                } else {
                    // Single day event
                    const dayKey = `${startMonth}-${day}`;
                    if (!dayEventsMap[dayKey]) dayEventsMap[dayKey] = [];
                    dayEventsMap[dayKey].push({ color, title, faded: false });
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

            // Get unique colors while preserving order, track faded state
            const uniqueColors = [];
            const colorToTitles = {};
            const colorToFaded = {};
            eventsList.forEach(evt => {
                if (!colorToTitles[evt.color]) {
                    colorToTitles[evt.color] = [];
                    colorToFaded[evt.color] = evt.faded;
                    uniqueColors.push(evt.color);
                }
                colorToTitles[evt.color].push(evt.title);
                // If any event with this color is not faded, don't fade it
                if (!evt.faded) colorToFaded[evt.color] = false;
            });

            if (uniqueColors.length === 1) {
                // Single color - just set the fill
                const color = uniqueColors[0];
                segment.style.fill = color;
                segment.style.opacity = colorToFaded[color] ? 0.4 : 1;
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
                    subPath.style.opacity = colorToFaded[color] ? 0.4 : 1;

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
    }

    function handleSubsegmentMove(e) {
        tooltip.style.left = (e.clientX + 10) + 'px';
        tooltip.style.top = (e.clientY + 10) + 'px';
    }

    function handleSubsegmentLeave(e) {
        tooltip.style.display = 'none';
        e.target.removeEventListener('mousemove', handleSubsegmentMove);
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
        const DEFAULT_LABEL_RADIUS = OUTER_RADIUS + 6;
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

        // Make sure it's not in the date ring
        const distFromCenter = Math.sqrt(targetX * targetX + targetY * targetY);
        if (distFromCenter > INNER_RADIUS && distFromCenter < OUTER_RADIUS) {
            const angleFromOrigin = Math.atan2(targetY, targetX);
            const midRing = (INNER_RADIUS + OUTER_RADIUS) / 2;
            const targetRadius = distFromCenter < midRing ? CENTER_RADIUS : OUTER_RADIUS + 10;
            targetX = Math.cos(angleFromOrigin) * targetRadius;
            targetY = Math.sin(angleFromOrigin) * targetRadius;
        }

        return { x: targetX, y: targetY };
    }

    function setViewBox(x, y, w, h) {
        svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
        currentZoom = 700 / w;
        svg.classList.toggle('zoomed', currentZoom > 1.1);
        updateDynamicFontSizes();
        updateCenterTextPosition();
        updateEventTextPositions();
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

    function resetZoom() {
        // Start at 1.6x zoom for better default view
        const defaultZoom = 1.8;
        const defaultSize = 700 / defaultZoom;
        // Offset Y upward by 10% of the view size
        const yOffset = defaultSize * 0.3;
        setViewBox(-defaultSize / 2, -defaultSize / 2 - yOffset, defaultSize, defaultSize);
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

        // Update time every minute
        setInterval(updateCenterText, 60000);
    }

    init();
})();
