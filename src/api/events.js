import { DEFAULT_COLOR, BIRTHDAY_COLOR, FRIEND_BIRTHDAY_COLOR, BIRTHDAY_TITLE } from '../config.js';
import { state, setEvents, setAnnotations, isLoggedIn, saveAnnotationsToLocalStorage } from '../state.js';
import { api } from './auth.js';
import { fetchFriends } from './friends.js';
import { updateAnnotationMarkers } from '../calendar/markers.js';

/**
 * Load events from the API and convert to annotations format
 */
export async function loadEventsFromAPI() {
  if (!isLoggedIn()) return;

  try {
    const events = await api('/api/events');
    const friends = await fetchFriends();

    setEvents(events);
    state.friends = friends;

    // Convert events to annotations format
    const annotations = {};
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

    setAnnotations(annotations);

    // Inject birthday events (own and friends)
    injectBirthdayEvent();

    // Update the circle view markers
    updateAnnotationMarkers();
  } catch (e) {
    console.error('Failed to load events:', e);
  }
}

/**
 * Create a new event via API
 */
export async function createEventAPI(month, day, title, endMonth, endDay, color, hidden) {
  if (!isLoggedIn()) return null;

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

/**
 * Delete an event via API
 */
export async function deleteEventAPI(eventId) {
  if (!isLoggedIn()) return;

  try {
    await api(`/api/events/${eventId}`, { method: 'DELETE' });
  } catch (e) {
    console.error('Failed to delete event:', e);
  }
}

/**
 * Update an event via API
 */
export async function updateEventAPI(eventId, title, color, hidden, month, day, endMonth, endDay) {
  if (!isLoggedIn()) return;

  try {
    const body = { title, color, hidden };
    if (month !== undefined) body.month = month;
    if (day !== undefined) body.day = day;
    // Include end_month/end_day if they are provided (even if null, to clear them)
    if (endMonth !== undefined) body.end_month = endMonth;
    if (endDay !== undefined) body.end_day = endDay;
    await api(`/api/events/${eventId}`, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  } catch (e) {
    console.error('Failed to update event:', e);
  }
}

/**
 * Inject birthday events for the user and friends
 */
export function injectBirthdayEvent() {
  // Remove all birthday events first (own and friends)
  removeBirthdayEvents();

  // Inject own birthday
  if (state.user && state.user.birthday_month && state.user.birthday_day) {
    const dateKey = `${state.user.birthday_month}-${state.user.birthday_day}`;
    if (!state.annotations[dateKey]) {
      state.annotations[dateKey] = [];
    }
    state.annotations[dateKey].unshift({
      title: BIRTHDAY_TITLE,
      color: BIRTHDAY_COLOR,
      isBirthday: true
    });
  }

  // Inject friend birthdays
  state.friends.forEach(friendship => {
    const friend = friendship.friend;
    if (friend.birthday_month && friend.birthday_day) {
      const dateKey = `${friend.birthday_month}-${friend.birthday_day}`;
      if (!state.annotations[dateKey]) {
        state.annotations[dateKey] = [];
      }
      state.annotations[dateKey].push({
        title: `${friend.name || 'Friend'}'s birthday`,
        color: FRIEND_BIRTHDAY_COLOR,
        isFriendBirthday: true,
        friendId: friend.id
      });
    }
  });
}

/**
 * Remove all birthday events (own and friends)
 */
export function removeBirthdayEvents() {
  for (const dateKey of Object.keys(state.annotations)) {
    state.annotations[dateKey] = state.annotations[dateKey].filter(a =>
      !(typeof a === 'object' && (a.isBirthday || a.isFriendBirthday))
    );
    if (state.annotations[dateKey].length === 0) {
      delete state.annotations[dateKey];
    }
  }
}
