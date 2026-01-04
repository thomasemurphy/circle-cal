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
    let selectedColor = '#ff6360'; // Default color
    const DEFAULT_COLOR = '#ff6360';

    // Zoom state (continuous)
    const MIN_ZOOM = 1;
    const MAX_ZOOM = 15;
    let currentZoom = 1;

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

                // Check if weekend (Saturday = 6, Sunday = 0)
                const date = new Date(year, month, day);
                const dayOfWeek = date.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) {
                    path.classList.add('weekend');
                }

                path.addEventListener('mouseenter', handleDayHover);
                path.addEventListener('mouseleave', handleDayLeave);
                path.addEventListener('click', handleDayClick);

                group.appendChild(path);

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
                group.appendChild(dowText);

                // Day number
                const dayNumPos = polarToCartesian(midAngle, dayNumberRadius);
                const text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', dayNumPos.x);
                text.setAttribute('y', dayNumPos.y);
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
        const DEFAULT_LABEL_RADIUS = OUTER_RADIUS + 25;

        for (const [dateKey, annList] of Object.entries(annotations)) {
            if (!annList || annList.length === 0) continue;

            const [month, day] = dateKey.split('-').map(Number);
            let dayOfYear = 0;
            for (let m = 0; m < month - 1; m++) {
                dayOfYear += getDaysInMonth(m, year);
            }
            dayOfYear += day;

            const angle = dateToAngle(dayOfYear - 0.5, totalDays);
            const outerEdgePos = polarToCartesian(angle, OUTER_RADIUS);

            // Format date string (e.g., "Jan 6")
            const monthAbbr = MONTHS[month - 1].substring(0, 3);
            const dateLabel = `${monthAbbr} ${day}`;

            // Create text and line for each annotation
            annList.forEach((annotation, index) => {
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
                const lineStartPos = isInside ? polarToCartesian(angle, INNER_RADIUS) : outerEdgePos;

                // Line connecting to event text
                const line = document.createElementNS(SVG_NS, 'line');
                line.setAttribute('x1', lineStartPos.x);
                line.setAttribute('y1', lineStartPos.y);
                line.setAttribute('x2', textX);
                line.setAttribute('y2', textY);
                line.setAttribute('class', 'annotation-line');
                line.setAttribute('data-date-key', dateKey);
                line.setAttribute('data-index', index);
                line.setAttribute('data-angle', angle);
                line.style.stroke = color;
                group.appendChild(line);

                const text = document.createElementNS(SVG_NS, 'text');
                text.setAttribute('x', textX);
                text.setAttribute('y', textY);
                text.setAttribute('class', 'annotation-text');
                text.setAttribute('dominant-baseline', 'middle');
                text.setAttribute('data-date-key', dateKey);
                text.setAttribute('data-index', index);
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

        // Update text position
        draggedAnnotation.element.setAttribute('x', newX);
        draggedAnnotation.element.setAttribute('y', newY);

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
            // Update line end point
            line.setAttribute('x2', newX);
            line.setAttribute('y2', newY);

            // Update line start point based on whether text is inside or outside
            const textDist = Math.sqrt(newX * newX + newY * newY);
            const isInside = textDist < INNER_RADIUS;
            const angle = parseFloat(line.getAttribute('data-angle'));
            const lineStartRadius = isInside ? INNER_RADIUS : OUTER_RADIUS;
            const lineStartPos = polarToCartesian(angle, lineStartRadius);
            line.setAttribute('x1', lineStartPos.x);
            line.setAttribute('y1', lineStartPos.y);
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

        draggedAnnotation.element.style.cursor = 'grab';
        draggedAnnotation = null;
        document.removeEventListener('mousemove', dragAnnotation);
        document.removeEventListener('mouseup', endAnnotationDrag);
    }

    function openEditModal(dateKey, index) {
        const [month, day] = dateKey.split('-').map(Number);
        const annotation = annotations[dateKey][index];
        const title = typeof annotation === 'string' ? annotation : annotation.title;
        const color = (typeof annotation === 'object' && annotation.color) ? annotation.color : DEFAULT_COLOR;

        editingAnnotation = { dateKey, index };
        selectedDate = { month: month - 1, day };
        modalDate.textContent = formatDate(month - 1, day);

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

        let posX, posY;
        if (originVisible) {
            // Keep at original center position
            posX = 0;
            posY = 0;
        } else {
            // Move to lower center of viewport with some padding
            const padding = 20 / currentZoom;
            posX = vb.x + vb.w / 2;  // Center horizontally
            posY = vb.y + vb.h - padding;  // Bottom with padding
        }

        group.setAttribute('transform', `translate(${posX}, ${posY})`);

        // Scale font size inversely with zoom to maintain constant screen size
        const dateText = group.querySelector('.center-date');
        const timeText = group.querySelector('.center-time');
        const baseDateSize = 12;
        const baseTimeSize = 14;
        const scaledDateSize = baseDateSize / currentZoom;
        const scaledTimeSize = baseTimeSize / currentZoom;
        const yOffset = 10 / currentZoom;

        if (dateText) {
            dateText.setAttribute('y', -yOffset);
            dateText.style.fontSize = scaledDateSize + 'px';
            dateText.setAttribute('text-anchor', 'middle');
        }
        if (timeText) {
            timeText.setAttribute('y', yOffset);
            timeText.style.fontSize = scaledTimeSize + 'px';
            timeText.setAttribute('text-anchor', 'middle');
        }
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
        editingAnnotation = null; // Not editing, adding new
        modalDate.textContent = formatDate(month, day);

        const dateKey = getDateKey(month, day);
        const existing = annotations[dateKey] || [];

        renderExistingAnnotations(dateKey, existing);

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

            if (currentUser) {
                // Save to API
                const event = await createEventAPI(selectedDate.month + 1, selectedDate.day, text);
                if (event) {
                    annotations[dateKey].push({ id: event.id, title: event.title, color: selectedColor });
                }
            } else {
                // Save locally with color
                annotations[dateKey].push({ title: text, color: selectedColor });
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
        editingAnnotation = null;
        annotationInput.value = '';
    }

    function updateAnnotationMarkers() {
        const oldMarkers = document.getElementById('annotation-markers');
        if (oldMarkers) {
            oldMarkers.remove();
        }
        svg.appendChild(createAnnotationMarkers(new Date().getFullYear()));
        updateDaySegmentHighlights();
    }

    function updateDaySegmentHighlights() {
        // Clear all existing highlights and inline styles
        document.querySelectorAll('.day-segment.has-event').forEach(el => {
            el.classList.remove('has-event');
            el.style.fill = '';
        });

        // Add highlight to days with events
        for (const dateKey of Object.keys(annotations)) {
            if (!annotations[dateKey] || annotations[dateKey].length === 0) continue;

            const [month, day] = dateKey.split('-').map(Number);
            // Find the day segment (data-month is 0-indexed, dateKey month is 1-indexed)
            const segment = document.querySelector(
                `.day-segment[data-month="${month - 1}"][data-day="${day}"]`
            );
            if (segment) {
                segment.classList.add('has-event');
                // Use the first event's color for the tile
                const firstAnnotation = annotations[dateKey][0];
                const color = (typeof firstAnnotation === 'object' && firstAnnotation.color)
                    ? firstAnnotation.color
                    : DEFAULT_COLOR;
                segment.style.fill = color;
            }
        }
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

    function setViewBox(x, y, w, h) {
        svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
        currentZoom = 700 / w;
        svg.classList.toggle('zoomed', currentZoom > 1.1);
        updateDynamicFontSizes();
        updateCenterTextPosition();
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
    }

    function handlePanEnd(e) {
        if (isPanning) {
            isPanning = false;
            svg.style.cursor = '';
        }
    }

    function resetZoom() {
        setViewBox(-350, -350, 700, 700);
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

        // Auth event listeners
        if (loginBtn) loginBtn.addEventListener('click', handleLogin);
        if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

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
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
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
