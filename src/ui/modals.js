import { MONTHS, DEFAULT_COLOR } from '../config.js';
import { state, setSelectedDate, setSelectedEndDate, setSelectedColor, setSelectedHidden, setEditingAnnotation, isLoggedIn, saveAnnotationsToLocalStorage } from '../state.js';
import { api } from '../api/auth.js';
import { injectBirthdayEvent } from '../api/events.js';
import { refreshFriendsModal } from '../api/friends.js';
import { updateAnnotationMarkers } from '../calendar/markers.js';
import { getElements } from './elements.js';
import { dateToInputValue, inputValueToDate, compareDates, getDateKey, validateBirthday } from '../utils/date.js';

// ==================== Main Event Modal ====================

/**
 * Open the edit modal for an existing annotation
 */
export function openEditModal(dateKey, index) {
  const elements = getElements();
  const [month, day] = dateKey.split('-').map(Number);
  const annotation = state.annotations[dateKey][index];

  // If this is a birthday event, open settings instead
  if (typeof annotation === 'object' && annotation.isBirthday) {
    openSettingsModal();
    return;
  }

  const title = typeof annotation === 'string' ? annotation : annotation.title;
  const color = (typeof annotation === 'object' && annotation.color) ? annotation.color : DEFAULT_COLOR;
  const hidden = (typeof annotation === 'object' && annotation.hidden) ? annotation.hidden : false;

  setEditingAnnotation({ dateKey, index });
  setSelectedDate({ month: month - 1, day });

  // If multi-day, set end date
  if (typeof annotation === 'object' && annotation.endMonth !== undefined) {
    setSelectedEndDate({ month: annotation.endMonth, day: annotation.endDay });
  } else {
    setSelectedEndDate(null);
  }

  // Populate date inputs
  if (elements.startDateInput) {
    elements.startDateInput.value = dateToInputValue(month - 1, day);
  }
  if (state.ui.selectedEndDate && elements.endDateInput) {
    elements.endDateInput.value = dateToInputValue(state.ui.selectedEndDate.month, state.ui.selectedEndDate.day);
    if (elements.endDateContainer) elements.endDateContainer.style.display = 'flex';
  } else {
    if (elements.endDateInput) elements.endDateInput.value = '';
    if (elements.endDateContainer) elements.endDateContainer.style.display = 'none';
  }

  // Hide existing annotations list and "also on this day" when editing
  if (elements.existingAnnotations) elements.existingAnnotations.innerHTML = '';
  if (elements.alsoOnThisDay) elements.alsoOnThisDay.innerHTML = '';

  // Set current values
  if (elements.annotationInput) {
    elements.annotationInput.value = title;
  }
  setSelectedColor(color);
  setSelectedHidden(hidden);

  // Update color picker selection
  elements.colorOptions.forEach(opt => {
    opt.classList.toggle('selected', opt.getAttribute('data-color') === color);
  });

  // Set visibility toggle to current state
  elements.visibilityBtns.forEach(btn => {
    btn.classList.toggle('selected', (btn.getAttribute('data-hidden') === 'true') === hidden);
  });

  // Show delete button when editing
  if (elements.deleteBtn) elements.deleteBtn.style.display = 'inline-block';

  if (elements.modal) elements.modal.style.display = 'flex';
  if (elements.annotationInput) {
    elements.annotationInput.focus();
    elements.annotationInput.select();
  }
}

/**
 * Close the main modal
 */
export function closeModal() {
  const elements = getElements();

  if (elements.modal) elements.modal.style.display = 'none';
  setSelectedDate(null);
  setSelectedEndDate(null);
  setEditingAnnotation(null);
  if (elements.annotationInput) elements.annotationInput.value = '';

  // Clear range highlights
  clearRangeHighlight();

  // Clear list view drag state
  state.interaction.isListDragging = false;
  state.interaction.listDragStart = null;
  state.interaction.listDragEnd = null;
  clearListRangeHighlight();
}

/**
 * Clear range selection highlight on circle view
 */
export function clearRangeHighlight() {
  document.querySelectorAll('.day-segment.range-selected').forEach(el => {
    el.classList.remove('range-selected');
  });
}

/**
 * Clear range selection highlight on list view
 */
export function clearListRangeHighlight() {
  const highlight = document.getElementById('list-drag-highlight');
  if (highlight) {
    highlight.style.display = 'none';
  }
}

/**
 * Reset color picker to default color
 */
export function resetColorPicker() {
  const elements = getElements();
  setSelectedColor(DEFAULT_COLOR);
  elements.colorOptions.forEach(opt => {
    opt.classList.toggle('selected', opt.getAttribute('data-color') === DEFAULT_COLOR);
  });
}

/**
 * Reset visibility toggle to Show
 */
export function resetVisibilityToggle() {
  const elements = getElements();
  setSelectedHidden(false);
  elements.visibilityBtns.forEach(btn => {
    btn.classList.toggle('selected', btn.getAttribute('data-hidden') === 'false');
  });
}

// ==================== Settings Modal ====================

/**
 * Open the settings modal
 */
export function openSettingsModal() {
  const elements = getElements();
  if (!isLoggedIn()) return;

  // Populate current birthday values
  if (state.user.birthday_month) {
    if (elements.birthdayMonth) elements.birthdayMonth.value = state.user.birthday_month;
    if (elements.birthdayDay) elements.birthdayDay.value = state.user.birthday_day || '';
  } else {
    if (elements.birthdayMonth) elements.birthdayMonth.value = '';
    if (elements.birthdayDay) elements.birthdayDay.value = '';
  }

  if (elements.settingsModal) elements.settingsModal.style.display = 'flex';
}

/**
 * Close the settings modal
 */
export function closeSettingsModal() {
  const elements = getElements();
  if (elements.settingsModal) elements.settingsModal.style.display = 'none';
}

/**
 * Save settings
 */
export async function saveSettings() {
  const elements = getElements();
  const month = elements.birthdayMonth?.value ? parseInt(elements.birthdayMonth.value) : null;
  const day = elements.birthdayDay?.value ? parseInt(elements.birthdayDay.value) : null;

  // Validate day for month
  if (!validateBirthday(month, day)) {
    alert(`Invalid day for ${MONTHS[month - 1]}`);
    return;
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
      state.user.birthday_month = updated.birthday_month;
      state.user.birthday_day = updated.birthday_day;
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

/**
 * Clear birthday inputs
 */
export function clearBirthday() {
  const elements = getElements();
  if (elements.birthdayMonth) elements.birthdayMonth.value = '';
  if (elements.birthdayDay) elements.birthdayDay.value = '';
}

// ==================== Friends Modal ====================

/**
 * Open the friends modal
 */
export function openFriendsModal() {
  const elements = getElements();
  if (!isLoggedIn()) return;

  if (elements.friendEmailInput) elements.friendEmailInput.value = '';
  if (elements.friendRequestStatus) {
    elements.friendRequestStatus.textContent = '';
    elements.friendRequestStatus.className = 'request-status';
  }

  refreshFriendsModal();

  if (elements.friendsModal) elements.friendsModal.style.display = 'flex';
}

/**
 * Close the friends modal
 */
export function closeFriendsModal() {
  const elements = getElements();
  if (elements.friendsModal) elements.friendsModal.style.display = 'none';
}

// ==================== Event Listeners Setup ====================

/**
 * Initialize modal event listeners
 */
export function initModalEventListeners() {
  const elements = getElements();

  // Color picker
  elements.colorOptions.forEach(btn => {
    btn.addEventListener('click', (e) => {
      elements.colorOptions.forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      setSelectedColor(e.target.getAttribute('data-color'));
    });
  });

  // Visibility toggle
  elements.visibilityBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      elements.visibilityBtns.forEach(b => b.classList.remove('selected'));
      e.target.classList.add('selected');
      setSelectedHidden(e.target.getAttribute('data-hidden') === 'true');
    });
  });

  // Close modal on backdrop click
  if (elements.modal) {
    elements.modal.addEventListener('click', (e) => {
      if (e.target === elements.modal) closeModal();
    });
  }

  if (elements.settingsModal) {
    elements.settingsModal.addEventListener('click', (e) => {
      if (e.target === elements.settingsModal) closeSettingsModal();
    });
  }

  if (elements.friendsModal) {
    elements.friendsModal.addEventListener('click', (e) => {
      if (e.target === elements.friendsModal) closeFriendsModal();
    });
  }

  // Escape key handling
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (elements.modal?.style.display === 'flex') {
        closeModal();
      }
      if (elements.settingsModal?.style.display === 'flex') {
        closeSettingsModal();
      }
      if (elements.friendsModal?.style.display === 'flex') {
        closeFriendsModal();
      }
    }
  });
}
