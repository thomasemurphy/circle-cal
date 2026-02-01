/**
 * Cached DOM element references
 * Use getElements() to access - lazily initializes on first call
 */
let cachedElements = null;

/**
 * Get cached DOM element references
 * Call refreshCache() after DOM changes that add/remove elements
 */
export function getElements() {
  if (!cachedElements) {
    cachedElements = {
      // Main containers
      svg: document.getElementById('calendar'),
      tooltip: document.getElementById('tooltip'),
      modal: document.getElementById('modal'),

      // Modal content
      existingAnnotations: document.getElementById('existing-annotations'),
      annotationInput: document.getElementById('annotation-input'),
      startDateInput: document.getElementById('start-date-input'),
      endDateInput: document.getElementById('end-date-input'),
      endDateContainer: document.getElementById('end-date-container'),
      alsoOnThisDay: document.getElementById('also-on-this-day'),
      deleteBtn: document.getElementById('delete-btn'),
      saveBtn: document.getElementById('save-btn'),
      cancelBtn: document.getElementById('cancel-btn'),

      // Color picker (dynamic - refreshed each access)
      get colorOptions() { return document.querySelectorAll('.color-option'); },
      get visibilityBtns() { return document.querySelectorAll('.visibility-btn'); },

      // Auth elements
      loginBtn: document.getElementById('login-btn'),
      logoutBtn: document.getElementById('logout-btn'),
      userInfo: document.getElementById('user-info'),
      userAvatar: document.getElementById('user-avatar'),
      userName: document.getElementById('user-name'),

      // Settings elements
      settingsBtn: document.getElementById('settings-btn'),
      settingsModal: document.getElementById('settings-modal'),
      birthdayMonth: document.getElementById('birthday-month'),
      birthdayDay: document.getElementById('birthday-day'),
      clearBirthdayBtn: document.getElementById('clear-birthday-btn'),
      settingsSaveBtn: document.getElementById('settings-save-btn'),
      settingsCancelBtn: document.getElementById('settings-cancel-btn'),

      // Friends elements
      friendsBtn: document.getElementById('friends-btn'),
      friendsModal: document.getElementById('friends-modal'),
      friendBadge: document.getElementById('friend-badge'),
      friendEmailInput: document.getElementById('friend-email'),
      sendRequestBtn: document.getElementById('send-request-btn'),
      friendRequestStatus: document.getElementById('friend-request-status'),
      pendingRequestsSection: document.getElementById('pending-requests-section'),
      pendingRequestsList: document.getElementById('pending-requests-list'),
      currentFriendsSection: document.getElementById('current-friends-section'),
      currentFriendsList: document.getElementById('current-friends-list'),
      friendsCloseBtn: document.getElementById('friends-close-btn'),

      // View toggle elements
      circleViewBtn: document.getElementById('circle-view-btn'),
      listViewBtn: document.getElementById('list-view-btn'),
      circleViewContainer: document.getElementById('circle-view'),
      listViewContainer: document.getElementById('list-view'),
      listCalendar: document.getElementById('list-calendar'),

      // Dynamic queries (refreshed each access)
      get daySegments() { return document.querySelectorAll('.day-segment'); },
      get annotationTexts() { return document.querySelectorAll('.annotation-text'); },
      get annotationLines() { return document.querySelectorAll('.annotation-line'); },
      get dayNumbers() { return document.querySelectorAll('.day-number'); },
      get dayOfWeek() { return document.querySelectorAll('.day-of-week'); },
      get monthLabels() { return document.querySelectorAll('.month-label'); },
      get eventSubsegments() { return document.querySelectorAll('.event-subsegment'); },
    };
  }
  return cachedElements;
}

/**
 * Refresh the element cache
 * Call this after significant DOM changes
 */
export function refreshCache() {
  cachedElements = null;
}

/**
 * Get the SVG element
 */
export function getSVG() {
  return getElements().svg;
}

/**
 * Get the tooltip element
 */
export function getTooltip() {
  return getElements().tooltip;
}

/**
 * Get the modal element
 */
export function getModal() {
  return getElements().modal;
}
