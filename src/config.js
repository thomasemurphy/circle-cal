// Configuration constants
export const SVG_NS = 'http://www.w3.org/2000/svg';
export const OUTER_RADIUS = 200;
export const INNER_RADIUS = 140;
export const CENTER_RADIUS = 100;

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DOW_ABBREV = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];

export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// Zoom limits
export const MIN_ZOOM = 0.8;
export const MAX_ZOOM = 15;
export const DEFAULT_ZOOM = 1.4;

// Colors
export const DEFAULT_COLOR = '#ff6360';
export const BIRTHDAY_COLOR = '#ff69b4';
export const FRIEND_BIRTHDAY_COLOR = '#9c27b0';

// Birthday event title
export const BIRTHDAY_TITLE = 'My birthday!';

// Polling interval for friend requests (30 seconds)
export const FRIENDS_POLL_INTERVAL = 30000;

// Get API URL - empty means same origin
export const API_URL = '';
