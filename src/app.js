import { state, isLoggedIn, saveAnnotationsToLocalStorage, loadAnnotationsFromLocalStorage, setSelectedDate, setSelectedEndDate } from './state.js';
import { getElements, getSVG } from './ui/elements.js';
import { checkAuth, handleLogin, handleLogout } from './api/auth.js';
import { createEventAPI, deleteEventAPI, updateEventAPI } from './api/events.js';
import { handleSendFriendRequest } from './api/friends.js';
import { initTheme } from './ui/theme.js';
import {
  openSettingsModal, closeSettingsModal, saveSettings, clearBirthday,
  openFriendsModal, closeFriendsModal, closeModal, initModalEventListeners
} from './ui/modals.js';
import {
  createDaySegments, createMonthLabels, createMonthTicks,
  createClockHand, createCenterText, updateCenterText
} from './calendar/circle-view.js';
import { createAnnotationMarkers, updateAnnotationMarkers, updateDaySegmentHighlights } from './calendar/markers.js';
import { initLabeler } from './calendar/labels.js';
import { initZoomPan, resetZoom, updateDynamicFontSizes, sizeSVGWrapper } from './calendar/zoom.js';
import { initViewToggle, renderListView } from './calendar/list-view.js';
import { inputValueToDate, compareDates, getDateKey, getDaysInYear, getDayOfYearFromMonthDay, dateToAngle } from './utils/date.js';
import { MONTHS } from './config.js';
import { calculateInitialAnnotationPosition } from './calendar/zoom.js';

/**
 * Save an annotation (create or update)
 */
async function saveAnnotation() {
  const elements = getElements();

  // Read current values from date inputs
  const startDateValue = inputValueToDate(elements.startDateInput?.value);
  const endDateValue = inputValueToDate(elements.endDateInput?.value);

  if (!startDateValue) return;

  // Update selectedDate and selectedEndDate from inputs
  setSelectedDate(startDateValue);
  if (endDateValue && elements.endDateContainer?.style.display !== 'none' &&
      compareDates(endDateValue.month, endDateValue.day, startDateValue.month, startDateValue.day) > 0) {
    setSelectedEndDate(endDateValue);
  } else {
    setSelectedEndDate(null);
  }

  const text = elements.annotationInput?.value.trim();
  if (!text) {
    closeModal();
    return;
  }

  const newDateKey = getDateKey(state.ui.selectedDate.month, state.ui.selectedDate.day);

  if (state.ui.editingAnnotation) {
    // Editing existing annotation
    const oldDateKey = state.ui.editingAnnotation.dateKey;
    const annotation = state.annotations[oldDateKey][state.ui.editingAnnotation.index];

    const datesChanged = oldDateKey !== newDateKey;

    if (typeof annotation === 'object') {
      annotation.title = text;
      annotation.color = state.ui.selectedColor;
      annotation.hidden = state.ui.selectedHidden;

      if (state.ui.selectedEndDate) {
        annotation.endMonth = state.ui.selectedEndDate.month;
        annotation.endDay = state.ui.selectedEndDate.day;
      } else {
        delete annotation.endMonth;
        delete annotation.endDay;
      }

      // Save to API for logged-in users
      if (isLoggedIn() && annotation.id) {
        const apiMonth = state.ui.selectedDate.month + 1;
        const apiDay = state.ui.selectedDate.day;
        const apiEndMonth = state.ui.selectedEndDate ? state.ui.selectedEndDate.month + 1 : null;
        const apiEndDay = state.ui.selectedEndDate ? state.ui.selectedEndDate.day : null;
        await updateEventAPI(annotation.id, text, state.ui.selectedColor, state.ui.selectedHidden, apiMonth, apiDay, apiEndMonth, apiEndDay);
      }

      // If dates changed, move annotation to new dateKey
      if (datesChanged) {
        state.annotations[oldDateKey].splice(state.ui.editingAnnotation.index, 1);
        if (state.annotations[oldDateKey].length === 0) {
          delete state.annotations[oldDateKey];
        }
        if (!state.annotations[newDateKey]) {
          state.annotations[newDateKey] = [];
        }
        state.annotations[newDateKey].push(annotation);
      }
    } else {
      const updatedAnnotation = {
        title: text,
        color: state.ui.selectedColor,
        hidden: state.ui.selectedHidden
      };
      if (state.ui.selectedEndDate) {
        updatedAnnotation.endMonth = state.ui.selectedEndDate.month;
        updatedAnnotation.endDay = state.ui.selectedEndDate.day;
      }

      if (datesChanged) {
        state.annotations[oldDateKey].splice(state.ui.editingAnnotation.index, 1);
        if (state.annotations[oldDateKey].length === 0) {
          delete state.annotations[oldDateKey];
        }
        if (!state.annotations[newDateKey]) {
          state.annotations[newDateKey] = [];
        }
        state.annotations[newDateKey].push(updatedAnnotation);
      } else {
        state.annotations[oldDateKey][state.ui.editingAnnotation.index] = updatedAnnotation;
      }
    }
    if (!isLoggedIn()) {
      saveAnnotationsToLocalStorage();
    }
  } else {
    // Adding new annotation
    if (!state.annotations[newDateKey]) {
      state.annotations[newDateKey] = [];
    }

    const newAnnotation = {
      title: text,
      color: state.ui.selectedColor,
      hidden: state.ui.selectedHidden
    };

    if (state.ui.selectedEndDate && compareDates(state.ui.selectedEndDate.month, state.ui.selectedEndDate.day, state.ui.selectedDate.month, state.ui.selectedDate.day) > 0) {
      newAnnotation.endMonth = state.ui.selectedEndDate.month;
      newAnnotation.endDay = state.ui.selectedEndDate.day;
    }

    // Calculate initial position within current viewport
    const year = new Date().getFullYear();
    const totalDays = getDaysInYear(year);
    let targetAngle;
    if (newAnnotation.endMonth !== undefined) {
      const startDoy = getDayOfYearFromMonthDay(state.ui.selectedDate.month, state.ui.selectedDate.day, year);
      const endDoy = getDayOfYearFromMonthDay(newAnnotation.endMonth, newAnnotation.endDay, year);
      targetAngle = dateToAngle((startDoy + endDoy) / 2, totalDays);
    } else {
      const doy = getDayOfYearFromMonthDay(state.ui.selectedDate.month, state.ui.selectedDate.day, year);
      targetAngle = dateToAngle(doy - 0.5, totalDays);
    }
    const initialPos = calculateInitialAnnotationPosition(targetAngle);
    newAnnotation.x = initialPos.x;
    newAnnotation.y = initialPos.y;

    if (isLoggedIn()) {
      const endMonth = newAnnotation.endMonth !== undefined ? newAnnotation.endMonth + 1 : undefined;
      const endDay = newAnnotation.endDay;
      const event = await createEventAPI(
        state.ui.selectedDate.month + 1,
        state.ui.selectedDate.day,
        text,
        endMonth,
        endDay,
        state.ui.selectedColor,
        state.ui.selectedHidden
      );
      if (event) {
        newAnnotation.id = event.id;
        state.annotations[newDateKey].push(newAnnotation);
      }
    } else {
      state.annotations[newDateKey].push(newAnnotation);
      saveAnnotationsToLocalStorage();
    }
  }

  updateAnnotationMarkers();
  closeModal();
}

/**
 * Delete the current annotation being edited
 */
async function deleteCurrentAnnotation() {
  if (!state.ui.editingAnnotation) return;

  const { dateKey, index } = state.ui.editingAnnotation;
  const annotation = state.annotations[dateKey][index];
  const eventId = (typeof annotation === 'object') ? annotation.id : null;

  if (isLoggedIn() && eventId) {
    await deleteEventAPI(eventId);
  }

  state.annotations[dateKey].splice(index, 1);
  if (state.annotations[dateKey].length === 0) {
    delete state.annotations[dateKey];
  }

  if (!isLoggedIn()) {
    saveAnnotationsToLocalStorage();
  }

  updateAnnotationMarkers();
  closeModal();
}

/**
 * Initialize the application
 */
export async function init() {
  const elements = getElements();
  const svg = getSVG();
  const year = new Date().getFullYear();

  // Initialize theme
  initTheme();

  // Load local annotations first (as fallback)
  loadAnnotationsFromLocalStorage();

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
  if (elements.loginBtn) elements.loginBtn.addEventListener('click', handleLogin);
  if (elements.logoutBtn) elements.logoutBtn.addEventListener('click', handleLogout);

  // Settings event listeners
  if (elements.settingsBtn) elements.settingsBtn.addEventListener('click', openSettingsModal);
  if (elements.settingsSaveBtn) elements.settingsSaveBtn.addEventListener('click', saveSettings);
  if (elements.settingsCancelBtn) elements.settingsCancelBtn.addEventListener('click', closeSettingsModal);
  if (elements.clearBirthdayBtn) elements.clearBirthdayBtn.addEventListener('click', clearBirthday);
  if (elements.birthdayMonth) {
    elements.birthdayMonth.addEventListener('change', () => {
      const month = parseInt(elements.birthdayMonth.value);
      if (month) {
        const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
        elements.birthdayDay.max = daysInMonth[month - 1];
        if (parseInt(elements.birthdayDay.value) > daysInMonth[month - 1]) {
          elements.birthdayDay.value = daysInMonth[month - 1];
        }
      }
    });
  }

  // Friends event listeners
  if (elements.friendsBtn) elements.friendsBtn.addEventListener('click', openFriendsModal);
  if (elements.friendsCloseBtn) elements.friendsCloseBtn.addEventListener('click', closeFriendsModal);
  if (elements.sendRequestBtn) elements.sendRequestBtn.addEventListener('click', handleSendFriendRequest);
  if (elements.friendEmailInput) {
    elements.friendEmailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSendFriendRequest();
    });
  }

  // Check if user is authenticated (will load events from API if so)
  await checkAuth();

  // Modal event listeners
  if (elements.saveBtn) elements.saveBtn.addEventListener('click', saveAnnotation);
  if (elements.cancelBtn) elements.cancelBtn.addEventListener('click', closeModal);
  if (elements.deleteBtn) elements.deleteBtn.addEventListener('click', deleteCurrentAnnotation);

  // Date input event listeners
  if (elements.startDateInput) {
    elements.startDateInput.addEventListener('change', () => {
      const newStart = inputValueToDate(elements.startDateInput.value);
      if (newStart) {
        setSelectedDate(newStart);
        const endValue = inputValueToDate(elements.endDateInput?.value);
        if (endValue && compareDates(endValue.month, endValue.day, newStart.month, newStart.day) <= 0) {
          elements.endDateInput.value = '';
          setSelectedEndDate(null);
        }
      }
    });
  }

  if (elements.endDateInput) {
    elements.endDateInput.addEventListener('change', () => {
      const newEnd = inputValueToDate(elements.endDateInput.value);
      const startValue = inputValueToDate(elements.startDateInput?.value);
      if (newEnd && startValue) {
        if (compareDates(newEnd.month, newEnd.day, startValue.month, startValue.day) > 0) {
          setSelectedEndDate(newEnd);
        } else {
          elements.endDateInput.value = '';
          setSelectedEndDate(null);
        }
      }
    });
  }

  // Enter key to save annotation
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && elements.modal?.style.display === 'flex' && !e.shiftKey) {
      e.preventDefault();
      saveAnnotation();
    }
  });

  // Initialize modal event listeners
  initModalEventListeners();

  // Initialize zoom/pan
  initZoomPan();

  // Update time every minute
  setInterval(updateCenterText, 60000);

  // Size the SVG explicitly for iOS/Safari compatibility
  sizeSVGWrapper();
  window.addEventListener('resize', sizeSVGWrapper);
  window.addEventListener('orientationchange', () => {
    setTimeout(sizeSVGWrapper, 100);
  });

  // Initialize view toggle
  initViewToggle();
}
