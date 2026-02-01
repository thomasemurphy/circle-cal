import { DAYS_IN_MONTH, MONTHS } from '../config.js';

/**
 * Check if a year is a leap year
 */
export function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Get the number of days in a year
 */
export function getDaysInYear(year) {
  return isLeapYear(year) ? 366 : 365;
}

/**
 * Get the number of days in a specific month
 * @param month 0-indexed month
 * @param year Year
 */
export function getDaysInMonth(month, year) {
  if (month === 1 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month];
}

/**
 * Get day of year from month (0-indexed) and day
 */
export function getDayOfYearFromMonthDay(month, day, year) {
  let dayOfYear = day;
  for (let m = 0; m < month; m++) {
    dayOfYear += getDaysInMonth(m, year);
  }
  return dayOfYear;
}

/**
 * Get month and day from day of year
 */
export function getMonthDayFromDayOfYear(dayOfYear, year) {
  let remaining = dayOfYear;
  for (let m = 0; m < 12; m++) {
    const daysInMonth = getDaysInMonth(m, year);
    if (remaining <= daysInMonth) {
      return { month: m, day: remaining };
    }
    remaining -= daysInMonth;
  }
  // Fallback (shouldn't happen)
  return { month: 11, day: 31 };
}

/**
 * Compare two dates (month is 0-indexed), returns -1, 0, or 1
 */
export function compareDates(m1, d1, m2, d2) {
  if (m1 < m2) return -1;
  if (m1 > m2) return 1;
  if (d1 < d2) return -1;
  if (d1 > d2) return 1;
  return 0;
}

/**
 * Convert 0-indexed month and day to HTML date input value (YYYY-MM-DD)
 */
export function dateToInputValue(month, day) {
  const year = new Date().getFullYear();
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

/**
 * Parse HTML date input value (YYYY-MM-DD) to { month, day } with 0-indexed month
 */
export function inputValueToDate(value) {
  if (!value) return null;
  const parts = value.split('-');
  return {
    month: parseInt(parts[1], 10) - 1,
    day: parseInt(parts[2], 10)
  };
}

/**
 * Get day of year with fractional time for a Date object
 */
export function getDayOfYear(date) {
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

/**
 * Convert day of year to angle (degrees)
 * Start at top (270 in standard coords, or -90), progress clockwise
 */
export function dateToAngle(dayOfYear, totalDays) {
  return -90 + (dayOfYear / totalDays) * 360;
}

/**
 * Format a date for display
 * @param month 0-indexed month
 * @param day Day of month
 * @param includeWeekday Whether to include the weekday
 */
export function formatDate(month, day, includeWeekday = false) {
  const dateStr = `${MONTHS[month]} ${day}`;
  if (includeWeekday) {
    const year = new Date().getFullYear();
    const date = new Date(year, month, day);
    const weekday = date.toLocaleDateString('en-US', { weekday: 'long' });
    return `${weekday}, ${dateStr}`;
  }
  return dateStr;
}

/**
 * Get a date key string for annotation storage
 * @param month 0-indexed month
 * @param day Day of month
 * @returns String in format "month-day" where month is 1-indexed
 */
export function getDateKey(month, day) {
  return `${month + 1}-${day}`;
}

/**
 * Validate a birthday date
 * @param month 1-indexed month
 * @param day Day of month
 * @returns true if valid, false otherwise
 */
export function validateBirthday(month, day) {
  if (!month || !day) return true; // Empty is valid
  const daysInMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

/**
 * Format a date range label
 * @param startMonth 0-indexed start month
 * @param startDay Start day
 * @param endMonth 0-indexed end month
 * @param endDay End day
 */
export function formatDateRange(startMonth, startDay, endMonth, endDay) {
  const startAbbr = MONTHS[startMonth].substring(0, 3);
  if (startMonth === endMonth) {
    return `${startAbbr} ${startDay}-${endDay}`;
  }
  const endAbbr = MONTHS[endMonth].substring(0, 3);
  return `${startAbbr} ${startDay}-${endAbbr} ${endDay}`;
}
