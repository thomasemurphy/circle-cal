import { SVG_NS, OUTER_RADIUS, INNER_RADIUS, MONTHS, DOW_ABBREV } from '../config.js';
import { getDaysInYear, getDaysInMonth, dateToAngle, getDayOfYear } from '../utils/date.js';
import { polarToCartesian, createArcPath } from '../utils/math.js';
import { handleDayHover, handleDayLeave, handleDayMouseDown, handleDayRangeMove, handleDayMouseUp } from './interactions.js';

/**
 * Create all day segments for the circular calendar
 */
export function createDaySegments(year) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'day-segments');

  // Create sub-groups to control rendering order: paths -> subsegments -> labels
  const pathsGroup = document.createElementNS(SVG_NS, 'g');
  pathsGroup.setAttribute('class', 'day-segment-paths');

  const subsegmentsGroup = document.createElementNS(SVG_NS, 'g');
  subsegmentsGroup.setAttribute('class', 'event-subsegments');
  subsegmentsGroup.setAttribute('id', 'event-subsegments');

  const labelsGroup = document.createElementNS(SVG_NS, 'g');
  labelsGroup.setAttribute('class', 'day-labels');

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
      path.addEventListener('mousedown', handleDayMouseDown);
      path.addEventListener('mouseenter', handleDayRangeMove);
      path.addEventListener('mouseup', handleDayMouseUp);

      pathsGroup.appendChild(path);

      // Add day of week and day number labels
      const midAngle = (startAngle + endAngle) / 2;
      const dayOfWeekRadius = (INNER_RADIUS + OUTER_RADIUS) / 2 + 2;
      const dayNumberRadius = (INNER_RADIUS + OUTER_RADIUS) / 2 - 2;

      // Day of week abbreviation
      const dowPos = polarToCartesian(midAngle, dayOfWeekRadius);
      const dowText = document.createElementNS(SVG_NS, 'text');
      dowText.setAttribute('x', dowPos.x);
      dowText.setAttribute('y', dowPos.y);
      dowText.setAttribute('class', 'day-of-week');
      dowText.setAttribute('text-anchor', 'middle');
      dowText.setAttribute('dominant-baseline', 'middle');
      dowText.textContent = DOW_ABBREV[dayOfWeek];
      labelsGroup.appendChild(dowText);

      // Day number
      const dayNumPos = polarToCartesian(midAngle, dayNumberRadius);
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', dayNumPos.x);
      text.setAttribute('y', dayNumPos.y);
      text.setAttribute('class', 'day-number');
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'middle');
      text.textContent = day;

      labelsGroup.appendChild(text);

      dayOfYear++;
    }
  }

  group.appendChild(pathsGroup);
  group.appendChild(subsegmentsGroup);
  group.appendChild(labelsGroup);

  return group;
}

/**
 * Create month labels around the circle
 */
export function createMonthLabels(year) {
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

/**
 * Create month tick marks
 */
export function createMonthTicks(year) {
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

/**
 * Create the clock hand showing current time
 */
export function createClockHand(year) {
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

/**
 * Create center text showing current date and time
 */
export function createCenterText(year) {
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

/**
 * Update the center text with current time
 */
export function updateCenterText() {
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
