import { state, setSelectedDate, setSelectedEndDate, setEditingAnnotation, setSelectingRange } from '../state.js';

// Track if mouse moved during click (to distinguish click from drag)
let mouseDownPos = null;
import { DEFAULT_COLOR } from '../config.js';
import { formatDate, getDayOfYearFromMonthDay, getMonthDayFromDayOfYear, getDaysInYear, compareDates, dateToInputValue } from '../utils/date.js';
import { getElements, getTooltip } from '../ui/elements.js';
import { openEditModal, closeModal, resetColorPicker, resetVisibilityToggle, clearRangeHighlight } from '../ui/modals.js';
import { renderAlsoOnThisDay } from './markers.js';

/**
 * Get all event titles for a given date (including multi-day events)
 */
export function getEventTitlesForDate(month, day) {
  const year = new Date().getFullYear();
  const targetDoy = getDayOfYearFromMonthDay(month, day, year);
  const titles = [];

  for (const [dateKey, annList] of Object.entries(state.annotations)) {
    if (!annList || annList.length === 0) continue;

    const [startMonth, startDay] = dateKey.split('-').map(Number);
    const startMonthIdx = startMonth - 1;

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

/**
 * Find all events that contain a given date
 */
export function findEventsContainingDate(month, day) {
  const year = new Date().getFullYear();
  const targetDoy = getDayOfYearFromMonthDay(month, day, year);
  const result = [];

  for (const [dateKey, annList] of Object.entries(state.annotations)) {
    if (!annList || annList.length === 0) continue;

    const [startMonth, startDay] = dateKey.split('-').map(Number);
    const startMonthIdx = startMonth - 1;

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
        break;
      }
    }
  }

  return result;
}

/**
 * Highlight linked annotations (text and lines) for a date
 */
export function highlightLinkedAnnotations(dateKey, highlight) {
  const texts = document.querySelectorAll(`.annotation-text[data-date-key="${dateKey}"]`);
  const lines = document.querySelectorAll(`.annotation-line[data-date-key="${dateKey}"]`);

  texts.forEach(text => {
    text.classList.toggle('linked-hover', highlight);
  });

  lines.forEach(line => {
    line.classList.toggle('linked-hover', highlight);
  });
}

/**
 * Highlight linked day tiles for a date (including multi-day ranges)
 */
export function highlightLinkedDayTile(dateKey, highlight, endMonth, endDay) {
  const [month, day] = dateKey.split('-').map(Number);
  const startMonthIdx = month - 1;
  const year = new Date().getFullYear();

  const hasEndDate = endMonth !== undefined && endDay !== undefined;
  const endMonthIdx = hasEndDate ? endMonth : startMonthIdx;
  const finalEndDay = hasEndDate ? endDay : day;

  const startDoy = getDayOfYearFromMonthDay(startMonthIdx, day, year);
  const endDoy = getDayOfYearFromMonthDay(endMonthIdx, finalEndDay, year);

  for (let doy = startDoy; doy <= endDoy; doy++) {
    const { month: m, day: d } = getMonthDayFromDayOfYear(doy, year);

    const segment = document.querySelector(`.day-segment[data-month="${m}"][data-day="${d}"]`);
    if (segment) {
      segment.classList.toggle('linked-hover', highlight);
    }

    const subsegments = document.querySelectorAll(`.event-subsegment[data-month="${m}"][data-day="${d}"]`);
    subsegments.forEach(sub => {
      sub.classList.toggle('linked-hover', highlight);
    });
  }
}

/**
 * Handle day segment hover
 */
export function handleDayHover(e) {
  const tooltip = getTooltip();
  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));

  let text = formatDate(month, day);

  const titles = getEventTitlesForDate(month, day);
  if (titles.length > 0) {
    text += ': ' + titles.join(', ');
  }

  tooltip.textContent = text;
  tooltip.style.display = 'block';
  tooltip.style.left = (e.clientX + 10) + 'px';
  tooltip.style.top = (e.clientY + 10) + 'px';

  e.target.classList.add('hovered');

  const eventDateKeys = findEventsContainingDate(month, day);
  eventDateKeys.forEach(key => highlightLinkedAnnotations(key, true));
}

/**
 * Handle day segment leave
 */
export function handleDayLeave(e) {
  const tooltip = getTooltip();
  tooltip.style.display = 'none';
  e.target.classList.remove('hovered');

  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));
  const eventDateKeys = findEventsContainingDate(month, day);
  eventDateKeys.forEach(key => highlightLinkedAnnotations(key, false));
}

/**
 * Handle mouse down on a day segment (start range selection)
 */
export function handleDayMouseDown(e) {
  e.preventDefault();
  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));

  // Track starting position to detect drag vs click
  mouseDownPos = { x: e.clientX, y: e.clientY, month, day };

  setSelectingRange(true, { month, day });
  setSelectedDate({ month, day });
  setSelectedEndDate(null);

  clearRangeHighlight();
  e.target.classList.add('range-selected');

  document.addEventListener('mouseup', handleGlobalMouseUp);
}

/**
 * Handle click/tap on a day segment (for touch devices and simple clicks)
 */
export function handleDayClick(e) {
  // Only handle if it was a simple click (not a drag)
  if (mouseDownPos) {
    const dx = Math.abs(e.clientX - mouseDownPos.x);
    const dy = Math.abs(e.clientY - mouseDownPos.y);
    if (dx > 5 || dy > 5) {
      // This was a drag, not a click - let mouseup handler deal with it
      mouseDownPos = null;
      return;
    }
  }
  mouseDownPos = null;

  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));

  if (isNaN(month) || isNaN(day)) return;

  // Set up state for a single day selection
  setSelectingRange(false);
  setSelectedDate({ month, day });
  setSelectedEndDate(null);
  setEditingAnnotation(null);

  // Open modal
  const elements = getElements();

  if (elements.startDateInput) {
    elements.startDateInput.value = dateToInputValue(month, day);
  }
  if (elements.endDateInput) elements.endDateInput.value = '';
  if (elements.endDateContainer) elements.endDateContainer.style.display = 'none';
  if (elements.existingAnnotations) elements.existingAnnotations.innerHTML = '';

  renderAlsoOnThisDay(month, day);
  resetColorPicker();
  resetVisibilityToggle();

  if (elements.deleteBtn) elements.deleteBtn.style.display = 'none';
  if (elements.annotationInput) elements.annotationInput.value = '';
  if (elements.modal) elements.modal.style.display = 'flex';
  if (elements.annotationInput) elements.annotationInput.focus();

  clearRangeHighlight();
}

/**
 * Handle mouse move during range selection
 */
export function handleDayRangeMove(e) {
  if (!state.interaction.isSelectingRange || !state.interaction.rangeStartDate) return;

  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));
  const year = new Date().getFullYear();

  // Only allow forward selection (end >= start)
  if (compareDates(month, day, state.interaction.rangeStartDate.month, state.interaction.rangeStartDate.day) >= 0) {
    setSelectedEndDate({ month, day });
    highlightRange(state.interaction.rangeStartDate, state.ui.selectedEndDate, year);
  }
}

/**
 * Handle mouse up on a day segment
 */
export function handleDayMouseUp(e) {
  if (!state.interaction.isSelectingRange) return;

  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));

  if (compareDates(month, day, state.interaction.rangeStartDate.month, state.interaction.rangeStartDate.day) >= 0) {
    setSelectedEndDate({ month, day });
  }

  finishRangeSelection();
}

/**
 * Handle global mouse up (in case released outside day segments)
 */
export function handleGlobalMouseUp(e) {
  if (!state.interaction.isSelectingRange) return;
  document.removeEventListener('mouseup', handleGlobalMouseUp);

  if (!e.target.classList.contains('day-segment')) {
    finishRangeSelection();
  }
}

/**
 * Finish range selection and open the modal
 */
export function finishRangeSelection() {
  const elements = getElements();

  setSelectingRange(false);
  document.removeEventListener('mouseup', handleGlobalMouseUp);

  setSelectedDate(state.interaction.rangeStartDate);
  setEditingAnnotation(null);

  // Populate date inputs
  if (elements.startDateInput) {
    elements.startDateInput.value = dateToInputValue(state.ui.selectedDate.month, state.ui.selectedDate.day);
  }

  if (state.ui.selectedEndDate && compareDates(state.ui.selectedEndDate.month, state.ui.selectedEndDate.day, state.ui.selectedDate.month, state.ui.selectedDate.day) > 0) {
    // Multi-day range
    if (elements.endDateInput) {
      elements.endDateInput.value = dateToInputValue(state.ui.selectedEndDate.month, state.ui.selectedEndDate.day);
    }
    if (elements.endDateContainer) elements.endDateContainer.style.display = 'flex';
  } else {
    // Single day
    setSelectedEndDate(null);
    if (elements.endDateInput) elements.endDateInput.value = '';
    if (elements.endDateContainer) elements.endDateContainer.style.display = 'none';
  }

  // Clear existing annotations
  if (elements.existingAnnotations) elements.existingAnnotations.innerHTML = '';

  // Show "Also on this day" buttons
  renderAlsoOnThisDay(state.ui.selectedDate.month, state.ui.selectedDate.day);

  // Reset color picker and visibility
  resetColorPicker();
  resetVisibilityToggle();

  // Hide delete button when adding new
  if (elements.deleteBtn) elements.deleteBtn.style.display = 'none';

  if (elements.annotationInput) elements.annotationInput.value = '';
  if (elements.modal) elements.modal.style.display = 'flex';
  if (elements.annotationInput) elements.annotationInput.focus();
}

/**
 * Highlight a range of days
 */
export function highlightRange(start, end, year) {
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

/**
 * Handle annotation text hover
 */
export function handleAnnotationHover(e) {
  const dateKey = e.target.getAttribute('data-date-key');
  const endMonthAttr = e.target.getAttribute('data-end-month');
  const endDayAttr = e.target.getAttribute('data-end-day');
  const endMonth = endMonthAttr !== null ? parseInt(endMonthAttr) : undefined;
  const endDay = endDayAttr !== null ? parseInt(endDayAttr) : undefined;

  highlightLinkedDayTile(dateKey, true, endMonth, endDay);
  highlightLinkedAnnotations(dateKey, true);
}

/**
 * Handle annotation text leave
 */
export function handleAnnotationLeave(e) {
  const dateKey = e.target.getAttribute('data-date-key');
  const endMonthAttr = e.target.getAttribute('data-end-month');
  const endDayAttr = e.target.getAttribute('data-end-day');
  const endMonth = endMonthAttr !== null ? parseInt(endMonthAttr) : undefined;
  const endDay = endDayAttr !== null ? parseInt(endDayAttr) : undefined;

  highlightLinkedDayTile(dateKey, false, endMonth, endDay);
  highlightLinkedAnnotations(dateKey, false);
}

/**
 * Handle subsegment hover (multi-event day)
 */
export function handleSubsegmentHover(e) {
  const tooltip = getTooltip();
  const titles = e.target.getAttribute('data-titles');
  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));

  const text = `${formatDate(month, day)}: ${titles}`;

  tooltip.textContent = text;
  tooltip.style.display = 'block';
  tooltip.style.left = (e.clientX + 10) + 'px';
  tooltip.style.top = (e.clientY + 10) + 'px';

  e.target.addEventListener('mousemove', handleSubsegmentMove);

  const eventDateKeys = findEventsContainingDate(month, day);
  eventDateKeys.forEach(key => highlightLinkedAnnotations(key, true));
}

/**
 * Handle subsegment mouse move (update tooltip position)
 */
export function handleSubsegmentMove(e) {
  const tooltip = getTooltip();
  tooltip.style.left = (e.clientX + 10) + 'px';
  tooltip.style.top = (e.clientY + 10) + 'px';
}

/**
 * Handle subsegment leave
 */
export function handleSubsegmentLeave(e) {
  const tooltip = getTooltip();
  tooltip.style.display = 'none';
  e.target.removeEventListener('mousemove', handleSubsegmentMove);

  const month = parseInt(e.target.getAttribute('data-month'));
  const day = parseInt(e.target.getAttribute('data-day'));
  const eventDateKeys = findEventsContainingDate(month, day);
  eventDateKeys.forEach(key => highlightLinkedAnnotations(key, false));
}
