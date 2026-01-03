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
    let currentUser = null;
    let events = []; // Events from API

    // Zoom state
    let isZoomed = false;
    let zoomCenter = { x: 0, y: 0 };
    const ZOOM_LEVEL = 3;

    // Pan state
    let isPanning = false;
    let panStart = { x: 0, y: 0 };
    let viewBoxStart = { x: 0, y: 0 };

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
        loadFromLocalStorage();
        updateAuthUI();
        updateAnnotationMarkers();
    }

    // API event functions
    async function loadEventsFromAPI() {
        if (!currentUser) return;
        try {
            events = await api('/api/events');
            // Convert events to annotations format
            annotations = {};
            events.forEach(event => {
                const key = `${event.month}-${event.day}`;
                if (!annotations[key]) annotations[key] = [];
                annotations[key].push({ id: event.id, title: event.title });
            });
            updateAnnotationMarkers();
        } catch (e) {
            console.error('Failed to load events:', e);
        }
    }

    async function createEventAPI(month, day, title) {
        if (!currentUser) return null;
        try {
            const event = await api('/api/events', {
                method: 'POST',
                body: JSON.stringify({ month, day, title }),
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

    function getDayOfYear(date) {
        const start = new Date(date.getFullYear(), 0, 0);
        const diff = date - start;
        const oneDay = 1000 * 60 * 60 * 24;
        return Math.floor(diff / oneDay);
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

    function formatDate(month, day) {
        return `${MONTHS[month]} ${day}`;
    }

    function getDateKey(month, day) {
        return `${month + 1}-${day}`;
    }

    function createDaySegments(year) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'day-segments');

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

                path.addEventListener('mouseenter', handleDayHover);
                path.addEventListener('mouseleave', handleDayLeave);
                path.addEventListener('click', handleDayClick);

                group.appendChild(path);

                // Add day number label
                const midAngle = (startAngle + endAngle) / 2;
                const labelRadius = (INNER_RADIUS + OUTER_RADIUS) / 2;
                const labelPos = polarToCartesian(midAngle, labelRadius);

                const text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', labelPos.x);
                text.setAttribute('y', labelPos.y);
                text.setAttribute('class', 'day-number');
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('dominant-baseline', 'middle');
                text.textContent = day;

                group.appendChild(text);

                dayOfYear++;
            }
        }

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

            text.textContent = MONTHS[month].substring(0, 3);

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

    function createAnnotationMarkers(year) {
        const group = document.createElementNS(SVG_NS, 'g');
        group.setAttribute('class', 'annotation-markers');
        group.setAttribute('id', 'annotation-markers');

        const totalDays = getDaysInYear(year);
        const LABEL_RADIUS = OUTER_RADIUS + 45;

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [month, day] = dateKey.split('-').map(Number);
            let dayOfYear = 0;
            for (let m = 0; m < month - 1; m++) {
                dayOfYear += getDaysInMonth(m, year);
            }
            dayOfYear += day;

            const angle = dateToAngle(dayOfYear - 0.5, totalDays);
            const innerPos = polarToCartesian(angle, INNER_RADIUS);
            const beforeNumPos = polarToCartesian(angle, (INNER_RADIUS + OUTER_RADIUS) / 2 - 8);
            const afterNumPos = polarToCartesian(angle, (INNER_RADIUS + OUTER_RADIUS) / 2 + 8);
            const outerPos = polarToCartesian(angle, LABEL_RADIUS);

            // Line segment before the number
            const line1 = document.createElementNS(SVG_NS, 'line');
            line1.setAttribute('x1', innerPos.x);
            line1.setAttribute('y1', innerPos.y);
            line1.setAttribute('x2', beforeNumPos.x);
            line1.setAttribute('y2', beforeNumPos.y);
            line1.setAttribute('class', 'annotation-line');
            group.appendChild(line1);

            // Line segment after the number
            const line2 = document.createElementNS(SVG_NS, 'line');
            line2.setAttribute('x1', afterNumPos.x);
            line2.setAttribute('y1', afterNumPos.y);
            line2.setAttribute('x2', outerPos.x);
            line2.setAttribute('y2', outerPos.y);
            line2.setAttribute('class', 'annotation-line');
            group.appendChild(line2);

            // Format date string (e.g., "Jan 6")
            const monthAbbr = MONTHS[month - 1].substring(0, 3);
            const dateLabel = `${monthAbbr} ${day}`;

            // Create text for each annotation
            annList.forEach((annotation, index) => {
                const textRadius = LABEL_RADIUS + (index * 12);
                const textPos = polarToCartesian(angle, textRadius);

                const text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', textPos.x);
                text.setAttribute('y', textPos.y);
                text.setAttribute('class', 'annotation-text');
                text.setAttribute('dominant-baseline', 'middle');

                // Determine text anchor based on position (left/right side of circle)
                if (angle > -90 && angle < 90) {
                    text.setAttribute('text-anchor', 'start');
                    text.setAttribute('x', textPos.x + 4);
                } else {
                    text.setAttribute('text-anchor', 'end');
                    text.setAttribute('x', textPos.x - 4);
                }

                // Get title (handle both old string format and new object format)
                const title = typeof annotation === 'string' ? annotation : annotation.title;

                // Include date only on first annotation for this day
                if (index === 0) {
                    text.textContent = `${dateLabel}: ${title}`;
                } else {
                    text.textContent = title;
                }

                group.appendChild(text);
            });
        }

        return group;
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
        dateText.setAttribute('y', -8);
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

    function handleDayClick(e) {
        const month = parseInt(e.target.getAttribute('data-month'));
        const day = parseInt(e.target.getAttribute('data-day'));

        selectedDate = { month, day };
        modalDate.textContent = formatDate(month, day);

        const dateKey = getDateKey(month, day);
        const existing = annotations[dateKey] || [];

        renderExistingAnnotations(dateKey, existing);

        annotationInput.value = '';
        modal.style.display = 'flex';
        annotationInput.focus();
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
        if (!annotations[dateKey]) {
            annotations[dateKey] = [];
        }

        if (currentUser) {
            // Save to API
            const event = await createEventAPI(selectedDate.month + 1, selectedDate.day, text);
            if (event) {
                annotations[dateKey].push({ id: event.id, title: event.title });
            }
        } else {
            // Save locally
            annotations[dateKey].push(text);
            saveAnnotationsLocal();
        }

        updateAnnotationMarkers();
        closeModal();
    }

    function closeModal() {
        modal.style.display = 'none';
        selectedDate = null;
        annotationInput.value = '';
    }

    function updateAnnotationMarkers() {
        const oldMarkers = document.getElementById('annotation-markers');
        if (oldMarkers) {
            oldMarkers.remove();
        }
        svg.appendChild(createAnnotationMarkers(new Date().getFullYear()));
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

    function zoomToPoint(x, y) {
        isZoomed = true;
        zoomCenter = { x, y };
        const size = 700 / ZOOM_LEVEL;
        const viewBoxX = x - size / 2;
        const viewBoxY = y - size / 2;
        svg.setAttribute('viewBox', `${viewBoxX} ${viewBoxY} ${size} ${size}`);
        svg.classList.add('zoomed');
    }

    function zoomOut() {
        isZoomed = false;
        svg.setAttribute('viewBox', '-350 -350 700 700');
        svg.classList.remove('zoomed');
    }

    function handleZoomClick(e) {
        // Don't zoom if we just finished panning
        if (e.defaultPrevented) return;

        // Get click position in SVG coordinates
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

        // Check if clicking near center (to zoom out)
        const distFromCenter = Math.sqrt(svgP.x * svgP.x + svgP.y * svgP.y);

        if (isZoomed) {
            zoomOut();
        } else if (distFromCenter > 50) {
            // Zoom to clicked point (but not if clicking the center text)
            zoomToPoint(svgP.x, svgP.y);
        }
    }

    function getViewBox() {
        const vb = svg.getAttribute('viewBox').split(' ').map(Number);
        return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
    }

    function handlePanStart(e) {
        if (!isZoomed) return;
        isPanning = true;
        panStart = { x: e.clientX, y: e.clientY };
        const vb = getViewBox();
        viewBoxStart = { x: vb.x, y: vb.y };
        svg.style.cursor = 'grabbing';
        e.preventDefault();
    }

    function handlePanMove(e) {
        if (!isPanning || !isZoomed) return;

        const vb = getViewBox();
        const scale = vb.w / svg.clientWidth;

        const dx = (e.clientX - panStart.x) * scale;
        const dy = (e.clientY - panStart.y) * scale;

        svg.setAttribute('viewBox', `${viewBoxStart.x - dx} ${viewBoxStart.y - dy} ${vb.w} ${vb.h}`);
    }

    function handlePanEnd(e) {
        if (isPanning) {
            isPanning = false;
            svg.style.cursor = '';
        }
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

        // Auth event listeners
        if (loginBtn) loginBtn.addEventListener('click', handleLogin);
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

        // Check if user is authenticated (will load events from API if so)
        await checkAuth();

        // Modal event listeners
        document.getElementById('save-btn').addEventListener('click', saveAnnotation);
        document.getElementById('cancel-btn').addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
            if (e.key === 'Enter' && modal.style.display === 'flex' && !e.shiftKey) {
                e.preventDefault();
                saveAnnotation();
            }
        });

        // Zoom handler - use double-click to zoom
        svg.addEventListener('dblclick', handleZoomClick);

        // Pan handlers - click and drag to pan when zoomed
        svg.addEventListener('mousedown', handlePanStart);
        svg.addEventListener('mousemove', handlePanMove);
        svg.addEventListener('mouseup', handlePanEnd);
        svg.addEventListener('mouseleave', handlePanEnd);

        // Update time every minute
        setInterval(updateCenterText, 60000);
    }

    init();
})();
