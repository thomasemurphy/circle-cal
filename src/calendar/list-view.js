import { MONTHS, WEEKDAYS, DEFAULT_COLOR } from '../config.js';
import { state, setSelectedDate, setSelectedEndDate, setEditingAnnotation, setSelectedColor, setSelectedHidden, setCurrentView } from '../state.js';
import { getDaysInMonth, getDayOfYearFromMonthDay, dateToInputValue, compareDates, formatDateRange } from '../utils/date.js';
import { hexToRgba } from '../utils/math.js';
import { getElements } from '../ui/elements.js';
import { openEditModal, resetColorPicker, resetVisibilityToggle } from '../ui/modals.js';

/**
 * Switch between circle and list views
 */
export function switchView(view) {
  const elements = getElements();
  setCurrentView(view);

  // Clear any drag selection state
  state.interaction.isListDragging = false;
  state.interaction.listDragStart = null;
  state.interaction.listDragEnd = null;

  if (view === 'circle') {
    if (elements.circleViewBtn) elements.circleViewBtn.classList.add('active');
    if (elements.listViewBtn) elements.listViewBtn.classList.remove('active');
    if (elements.circleViewContainer) elements.circleViewContainer.classList.add('active');
    if (elements.listViewContainer) elements.listViewContainer.classList.remove('active');
  } else {
    if (elements.circleViewBtn) elements.circleViewBtn.classList.remove('active');
    if (elements.listViewBtn) elements.listViewBtn.classList.add('active');
    if (elements.circleViewContainer) elements.circleViewContainer.classList.remove('active');
    if (elements.listViewContainer) elements.listViewContainer.classList.add('active');
    renderListView();
  }
}

/**
 * Render the list view
 */
export function renderListView() {
  const elements = getElements();
  const listCalendar = elements.listCalendar;
  if (!listCalendar) return;

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

      // Mouse down to start drag selection
      dayElement.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        startListDrag(month, day);
      });

      listCalendar.appendChild(dayElement);
    }
  }

  // Render all event overlays
  renderEventOverlays(year);

  // Scroll to today
  if (todayElement) {
    setTimeout(() => {
      todayElement.scrollIntoView({ block: 'center' });
    }, 50);
  }
}

/**
 * Render event overlay bars on list view
 */
function renderEventOverlays(year) {
  const elements = getElements();
  const listCalendar = elements.listCalendar;
  if (!listCalendar) return;

  let overlay = document.getElementById('list-multiday-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'list-multiday-overlay';
    listCalendar.appendChild(overlay);
  }
  overlay.innerHTML = '';

  const allEvents = getAllEventsForOverlay(year);
  if (allEvents.length === 0) return;

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

  // Calculate day-of-year ranges for overlap detection
  const eventsWithDoy = allEvents.map(event => {
    const startDoy = getDayOfYearFromMonthDay(event.startMonth, event.startDay, year);
    const endDoy = getDayOfYearFromMonthDay(event.endMonth, event.endDay, year);
    return { ...event, startDoy, endDoy };
  }).sort((a, b) => a.startDoy - b.startDoy || a.endDoy - b.endDoy);

  // Assign columns to overlapping events
  const columns = [];
  eventsWithDoy.forEach(event => {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const lastInCol = columns[col][columns[col].length - 1];
      if (event.startDoy > lastInCol.endDoy) {
        columns[col].push(event);
        event.column = col;
        placed = true;
        break;
      }
    }
    if (!placed) {
      event.column = columns.length;
      columns.push([event]);
    }
  });

  const totalColumns = columns.length || 1;

  eventsWithDoy.forEach(event => {
    const startKey = `${event.startMonth}-${event.startDay}`;
    const endKey = `${event.endMonth}-${event.endDay}`;

    const startPos = dayPositions[startKey];
    const endPos = dayPositions[endKey];

    if (!startPos || !endPos) return;

    const top = startPos.top;
    const height = (endPos.top + endPos.height) - startPos.top;

    const gapPercent = 1;
    const paddingPercent = 2;
    const usableWidth = 100 - (paddingPercent * 2) - (gapPercent * (totalColumns - 1));
    const columnWidth = usableWidth / totalColumns;
    const leftPercent = paddingPercent + (event.column * (columnWidth + gapPercent));

    const eventEl = document.createElement('div');
    eventEl.className = 'list-multiday-event';
    eventEl.style.top = top + 'px';
    eventEl.style.height = height + 'px';
    eventEl.style.left = leftPercent + '%';
    eventEl.style.width = columnWidth + '%';
    eventEl.style.backgroundColor = hexToRgba(event.color, 0.25);
    eventEl.style.borderLeftColor = event.color;
    if (event.hidden) eventEl.classList.add('hidden-event');
    if (totalColumns > 1) eventEl.classList.add('compact');

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

    // Mousedown on event
    eventEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      const dayInfo = getDayAtPosition(e.clientY);
      if (dayInfo) {
        e.preventDefault();
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

/**
 * Get all events for overlay rendering
 */
function getAllEventsForOverlay(year) {
  const result = [];

  for (const [dateKey, annList] of Object.entries(state.annotations)) {
    if (!annList || annList.length === 0) continue;

    const [startMonth, startDay] = dateKey.split('-').map(Number);
    const startMonthIdx = startMonth - 1;

    annList.forEach((annotation, index) => {
      const isMultiDay = typeof annotation === 'object' && annotation.endMonth !== undefined;
      const endMonthIdx = isMultiDay ? annotation.endMonth : startMonthIdx;
      const endDay = isMultiDay ? annotation.endDay : startDay;

      let rangeLabel = null;
      if (isMultiDay) {
        rangeLabel = formatDateRange(startMonthIdx, startDay, endMonthIdx, endDay);
      }

      const title = typeof annotation === 'string' ? annotation : annotation.title;
      const color = (typeof annotation === 'object' && annotation.color) ? annotation.color : DEFAULT_COLOR;
      const hidden = typeof annotation === 'object' && annotation.hidden;

      result.push({
        dateKey,
        index,
        title,
        color,
        hidden,
        rangeLabel,
        isMultiDay,
        startMonth: startMonthIdx,
        startDay: startDay,
        endMonth: endMonthIdx,
        endDay: endDay
      });
    });
  }

  return result;
}

/**
 * Start drag selection in list view
 */
function startListDrag(month, day, eventInfo = null) {
  state.interaction.isListDragging = true;
  state.interaction.listDragMoved = false;
  state.interaction.listDragFromEvent = eventInfo;
  state.interaction.listDragStart = { month, day };
  state.interaction.listDragEnd = { month, day };
  highlightListRange(month, day, month, day);

  const overlay = document.getElementById('list-multiday-overlay');
  if (overlay) overlay.classList.add('dragging');
}

/**
 * Update drag selection in list view
 */
export function updateListDrag(month, day) {
  if (!state.interaction.isListDragging || !state.interaction.listDragStart) return;

  if (state.interaction.listDragEnd && (state.interaction.listDragEnd.month !== month || state.interaction.listDragEnd.day !== day)) {
    state.interaction.listDragMoved = true;
  }

  state.interaction.listDragEnd = { month, day };
  const year = new Date().getFullYear();
  const startDoy = getDayOfYearFromMonthDay(state.interaction.listDragStart.month, state.interaction.listDragStart.day, year);
  const endDoy = getDayOfYearFromMonthDay(month, day, year);

  if (startDoy <= endDoy) {
    highlightListRange(state.interaction.listDragStart.month, state.interaction.listDragStart.day, month, day);
  } else {
    highlightListRange(month, day, state.interaction.listDragStart.month, state.interaction.listDragStart.day);
  }
}

/**
 * Get the day at a given Y position
 */
function getDayAtPosition(clientY) {
  const elements = getElements();
  const dayElements = elements.listCalendar?.querySelectorAll('.list-day');
  if (!dayElements) return null;

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

/**
 * Highlight a range in list view
 */
function highlightListRange(startMonth, startDay, endMonth, endDay) {
  const elements = getElements();
  const listCalendar = elements.listCalendar;
  if (!listCalendar) return;

  let highlight = document.getElementById('list-drag-highlight');
  if (!highlight) {
    highlight = document.createElement('div');
    highlight.id = 'list-drag-highlight';
    listCalendar.appendChild(highlight);
  }

  const startEl = listCalendar.querySelector(`.list-day[data-month="${startMonth}"][data-day="${startDay}"]`);
  const endEl = listCalendar.querySelector(`.list-day[data-month="${endMonth}"][data-day="${endDay}"]`);

  if (!startEl || !endEl) {
    highlight.style.display = 'none';
    return;
  }

  const top = startEl.offsetTop;
  const height = (endEl.offsetTop + endEl.offsetHeight) - startEl.offsetTop;

  highlight.style.display = 'block';
  highlight.style.top = top + 'px';
  highlight.style.height = height + 'px';
}

/**
 * Clear list range highlight
 */
export function clearListRangeHighlight() {
  const highlight = document.getElementById('list-drag-highlight');
  if (highlight) {
    highlight.style.display = 'none';
  }
}

/**
 * Open modal from list range selection
 */
function openModalFromListRange(startMonth, startDay, endMonth, endDay) {
  const elements = getElements();

  setSelectedDate({ month: startMonth, day: startDay });
  setSelectedEndDate({ month: endMonth, day: endDay });
  setEditingAnnotation(null);

  if (elements.startDateInput) elements.startDateInput.value = dateToInputValue(startMonth, startDay);
  if (elements.endDateInput) elements.endDateInput.value = dateToInputValue(endMonth, endDay);
  if (elements.endDateContainer) elements.endDateContainer.style.display = 'flex';

  if (elements.existingAnnotations) elements.existingAnnotations.innerHTML = '';
  if (elements.alsoOnThisDay) elements.alsoOnThisDay.innerHTML = '';

  if (elements.annotationInput) elements.annotationInput.value = '';
  resetColorPicker();
  resetVisibilityToggle();

  if (elements.deleteBtn) elements.deleteBtn.style.display = 'none';

  if (elements.modal) elements.modal.style.display = 'flex';
  if (elements.annotationInput) elements.annotationInput.focus();
}

/**
 * Open modal from list single day
 */
function openModalFromList(month, day) {
  const elements = getElements();

  setSelectedDate({ month, day });
  setSelectedEndDate(null);
  setEditingAnnotation(null);

  if (elements.startDateInput) elements.startDateInput.value = dateToInputValue(month, day);
  if (elements.endDateInput) elements.endDateInput.value = '';
  if (elements.endDateContainer) elements.endDateContainer.style.display = 'none';

  if (elements.existingAnnotations) elements.existingAnnotations.innerHTML = '';
  if (elements.alsoOnThisDay) elements.alsoOnThisDay.innerHTML = '';

  if (elements.annotationInput) elements.annotationInput.value = '';
  resetColorPicker();
  resetVisibilityToggle();

  if (elements.deleteBtn) elements.deleteBtn.style.display = 'none';

  if (elements.modal) elements.modal.style.display = 'flex';
  if (elements.annotationInput) elements.annotationInput.focus();
}

/**
 * Open edit modal from list view
 */
function openEditModalFromList(dateKey, index, clickedMonth, clickedDay) {
  const annList = state.annotations[dateKey];
  if (!annList || !annList[index]) return;

  const annotation = annList[index];
  const [startMonth, startDay] = dateKey.split('-').map(Number);
  const elements = getElements();

  setSelectedDate({ month: startMonth - 1, day: startDay });

  if (annotation.endMonth !== undefined) {
    setSelectedEndDate({ month: annotation.endMonth, day: annotation.endDay });
  } else {
    setSelectedEndDate(null);
  }

  setEditingAnnotation({ dateKey, index });

  if (elements.startDateInput) elements.startDateInput.value = dateToInputValue(startMonth - 1, startDay);
  if (state.ui.selectedEndDate && elements.endDateInput) {
    elements.endDateInput.value = dateToInputValue(state.ui.selectedEndDate.month, state.ui.selectedEndDate.day);
    if (elements.endDateContainer) elements.endDateContainer.style.display = 'flex';
  } else {
    if (elements.endDateInput) elements.endDateInput.value = '';
    if (elements.endDateContainer) elements.endDateContainer.style.display = 'none';
  }

  if (elements.existingAnnotations) elements.existingAnnotations.innerHTML = '';

  if (elements.annotationInput) elements.annotationInput.value = annotation.title || '';

  const color = annotation.color || DEFAULT_COLOR;
  elements.colorOptions.forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-color') === color);
  });
  setSelectedColor(color);

  const hidden = annotation.hidden || false;
  elements.visibilityBtns.forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-hidden') === String(hidden));
  });
  setSelectedHidden(hidden);

  if (elements.deleteBtn) elements.deleteBtn.style.display = 'block';
  if (elements.alsoOnThisDay) elements.alsoOnThisDay.innerHTML = '';

  if (elements.modal) elements.modal.style.display = 'flex';
  if (elements.annotationInput) elements.annotationInput.focus();
}

/**
 * Initialize view toggle
 */
export function initViewToggle() {
  const elements = getElements();

  if (elements.circleViewBtn) {
    elements.circleViewBtn.addEventListener('click', () => switchView('circle'));
  }
  if (elements.listViewBtn) {
    elements.listViewBtn.addEventListener('click', () => switchView('list'));
  }

  // Global mousemove handler for list drag selection
  document.addEventListener('mousemove', (e) => {
    if (state.interaction.isListDragging && state.interaction.listDragStart) {
      const dayInfo = getDayAtPosition(e.clientY);
      if (dayInfo) {
        updateListDrag(dayInfo.month, dayInfo.day);
      }
    }
  });

  // Global mouseup handler for list drag selection
  document.addEventListener('mouseup', () => {
    const overlay = document.getElementById('list-multiday-overlay');
    if (overlay) overlay.classList.remove('dragging');

    if (state.interaction.isListDragging && state.interaction.listDragStart) {
      state.interaction.isListDragging = false;
      const start = state.interaction.listDragStart;
      const end = state.interaction.listDragEnd || state.interaction.listDragStart;

      const year = new Date().getFullYear();
      const startDoy = getDayOfYearFromMonthDay(start.month, start.day, year);
      const endDoy = getDayOfYearFromMonthDay(end.month, end.day, year);

      if (startDoy === endDoy) {
        clearListRangeHighlight();
        if (state.interaction.listDragFromEvent && !state.interaction.listDragMoved) {
          openEditModalFromList(
            state.interaction.listDragFromEvent.dateKey,
            state.interaction.listDragFromEvent.index,
            state.interaction.listDragFromEvent.startMonth,
            state.interaction.listDragFromEvent.startDay
          );
        } else {
          openModalFromList(start.month, start.day);
        }
      } else if (startDoy < endDoy) {
        openModalFromListRange(start.month, start.day, end.month, end.day);
      } else {
        openModalFromListRange(end.month, end.day, start.month, start.day);
      }

      state.interaction.listDragStart = null;
      state.interaction.listDragEnd = null;
    }
  });
}
