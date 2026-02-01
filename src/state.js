import { DEFAULT_COLOR } from './config.js';

/**
 * Centralized state manager for the application
 * Single source of truth replacing scattered variables
 */
export const state = {
  // Auth
  user: null,

  // Events from API (raw format)
  events: [],

  // Annotations - events organized by date key
  // Key: "month-day" (1-indexed month), Value: array of annotation objects
  annotations: {},

  // Friends
  friends: [],
  pendingRequests: [],
  friendsPollInterval: null,

  // UI State
  ui: {
    selectedDate: null,         // { month, day } - 0-indexed month
    selectedEndDate: null,      // { month, day } - for multi-day events
    selectedColor: DEFAULT_COLOR,
    selectedHidden: false,
    editingAnnotation: null,    // { dateKey, index } when editing existing
    currentZoom: 1,
    currentView: 'circle',      // 'circle' or 'list'
  },

  // Interaction state
  interaction: {
    // Range selection on circle view
    isSelectingRange: false,
    rangeStartDate: null,

    // Panning state
    isPanning: false,
    panStart: { x: 0, y: 0 },
    viewBoxStart: { x: 0, y: 0 },

    // Annotation dragging
    draggedAnnotation: null,
    dragOffset: { x: 0, y: 0 },
    hasDragged: false,

    // Touch state
    touchStartDistance: 0,
    touchStartZoom: 1,
    touchStartCenter: { x: 0, y: 0 },
    isTouchPanning: false,
    lastTouchCenter: { x: 0, y: 0 },

    // List view drag selection
    listDragStart: null,
    listDragEnd: null,
    isListDragging: false,
    listDragMoved: false,
    listDragFromEvent: null,
  },

  // Label positioning data
  labelData: [],
};

// ==================== Auth Functions ====================

export function setUser(user) {
  state.user = user;
}

export function clearUser() {
  state.user = null;
  state.events = [];
  state.annotations = {};
  state.friends = [];
  state.pendingRequests = [];
}

export function isLoggedIn() {
  return state.user !== null;
}

// ==================== Events/Annotations Functions ====================

export function setEvents(events) {
  state.events = events;
}

export function setAnnotations(annotations) {
  state.annotations = annotations;
}

export function getAnnotation(dateKey, index) {
  const list = state.annotations[dateKey];
  return list ? list[index] : null;
}

export function addAnnotation(dateKey, annotation) {
  if (!state.annotations[dateKey]) {
    state.annotations[dateKey] = [];
  }
  state.annotations[dateKey].push(annotation);
}

export function updateAnnotation(dateKey, index, changes) {
  const annotation = state.annotations[dateKey]?.[index];
  if (annotation && typeof annotation === 'object') {
    Object.assign(annotation, changes);
  }
}

export function deleteAnnotation(dateKey, index) {
  if (state.annotations[dateKey]) {
    state.annotations[dateKey].splice(index, 1);
    if (state.annotations[dateKey].length === 0) {
      delete state.annotations[dateKey];
    }
  }
}

export function moveAnnotation(oldDateKey, index, newDateKey) {
  const annotation = state.annotations[oldDateKey]?.[index];
  if (!annotation) return;

  // Remove from old location
  state.annotations[oldDateKey].splice(index, 1);
  if (state.annotations[oldDateKey].length === 0) {
    delete state.annotations[oldDateKey];
  }

  // Add to new location
  if (!state.annotations[newDateKey]) {
    state.annotations[newDateKey] = [];
  }
  state.annotations[newDateKey].push(annotation);
}

// ==================== Friends Functions ====================

export function setFriends(friends) {
  state.friends = friends;
}

export function setPendingRequests(requests) {
  state.pendingRequests = requests;
}

export function getFriendsPollInterval() {
  return state.friendsPollInterval;
}

export function setFriendsPollInterval(interval) {
  state.friendsPollInterval = interval;
}

export function clearFriendsPollInterval() {
  if (state.friendsPollInterval) {
    clearInterval(state.friendsPollInterval);
    state.friendsPollInterval = null;
  }
}

// ==================== UI State Functions ====================

export function setSelectedDate(date) {
  state.ui.selectedDate = date;
}

export function setSelectedEndDate(date) {
  state.ui.selectedEndDate = date;
}

export function setSelectedColor(color) {
  state.ui.selectedColor = color;
}

export function setSelectedHidden(hidden) {
  state.ui.selectedHidden = hidden;
}

export function setEditingAnnotation(annotation) {
  state.ui.editingAnnotation = annotation;
}

export function setCurrentZoom(zoom) {
  state.ui.currentZoom = zoom;
}

export function setCurrentView(view) {
  state.ui.currentView = view;
}

// ==================== Interaction State Functions ====================

export function setSelectingRange(isSelecting, startDate = null) {
  state.interaction.isSelectingRange = isSelecting;
  state.interaction.rangeStartDate = startDate;
}

export function setPanning(isPanning, panStart = null, viewBoxStart = null) {
  state.interaction.isPanning = isPanning;
  if (panStart) state.interaction.panStart = panStart;
  if (viewBoxStart) state.interaction.viewBoxStart = viewBoxStart;
}

export function setDraggedAnnotation(annotation, offset = null) {
  state.interaction.draggedAnnotation = annotation;
  if (offset) state.interaction.dragOffset = offset;
  state.interaction.hasDragged = false;
}

export function setHasDragged(hasDragged) {
  state.interaction.hasDragged = hasDragged;
}

export function clearDragState() {
  state.interaction.draggedAnnotation = null;
  state.interaction.dragOffset = { x: 0, y: 0 };
  state.interaction.hasDragged = false;
}

// ==================== Label Data Functions ====================

export function setLabelData(data) {
  state.labelData = data;
}

export function getLabelData() {
  return state.labelData;
}

// ==================== LocalStorage ====================

export function saveAnnotationsToLocalStorage() {
  localStorage.setItem('circleCalAnnotations', JSON.stringify(state.annotations));
}

export function loadAnnotationsFromLocalStorage() {
  const saved = localStorage.getItem('circleCalAnnotations');
  if (saved) {
    try {
      state.annotations = JSON.parse(saved);
    } catch (e) {
      state.annotations = {};
    }
  }
}
