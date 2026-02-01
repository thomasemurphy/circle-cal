import { SVG_NS, OUTER_RADIUS, INNER_RADIUS, MONTHS, DEFAULT_COLOR } from '../config.js';
import { state, isLoggedIn, saveAnnotationsToLocalStorage, getLabelData } from '../state.js';
import { getDaysInYear, getDayOfYearFromMonthDay, getMonthDayFromDayOfYear, dateToAngle, getDaysInMonth } from '../utils/date.js';
import { polarToCartesian, createArcPath } from '../utils/math.js';
import { getSVG, getElements } from '../ui/elements.js';
import { openEditModal } from '../ui/modals.js';
import { handleAnnotationHover, handleAnnotationLeave, handleDayMouseDown, handleDayRangeMove, handleDayMouseUp, handleSubsegmentHover, handleSubsegmentLeave } from './interactions.js';
import { initLabeler, updateLabelVisibility } from './labels.js';
import { updateDynamicFontSizes } from './zoom.js';
import { renderListView } from './list-view.js';

/**
 * Create annotation markers (text labels and lines)
 */
export function createAnnotationMarkers(year) {
  const svg = getSVG();
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'annotation-markers');
  group.setAttribute('id', 'annotation-markers');

  const totalDays = getDaysInYear(year);
  const DEFAULT_LABEL_RADIUS = OUTER_RADIUS + 3;

  for (const [dateKey, annList] of Object.entries(state.annotations)) {
    if (!annList || annList.length === 0) continue;

    const [month, day] = dateKey.split('-').map(Number);
    const startMonth = month - 1;
    const startDay = day;

    annList.forEach((annotation, index) => {
      // Skip hidden events - they don't get text/line markers
      const isHidden = typeof annotation === 'object' && annotation.hidden;
      if (isHidden) return;

      // Check for multi-day event
      const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;
      const endMonth = hasEndDate ? annotation.endMonth : startMonth;
      const endDay = hasEndDate ? annotation.endDay : startDay;

      // Calculate day of year for start and end
      const startDoy = getDayOfYearFromMonthDay(startMonth, startDay, year);
      const endDoy = getDayOfYearFromMonthDay(endMonth, endDay, year);

      // Use midpoint for multi-day events, or the day itself for single-day
      const midDoy = hasEndDate ? (startDoy + endDoy) / 2 : startDoy - 0.5;
      const angle = dateToAngle(midDoy, totalDays);
      const outerEdgePos = polarToCartesian(angle, OUTER_RADIUS);

      // Format date label
      let dateLabel;
      if (hasEndDate) {
        const startAbbr = MONTHS[startMonth].substring(0, 3);
        if (startMonth === endMonth) {
          dateLabel = `${startAbbr} ${startDay}-${endDay}`;
        } else {
          const endAbbr = MONTHS[endMonth].substring(0, 3);
          dateLabel = `${startAbbr} ${startDay}-${endAbbr} ${endDay}`;
        }
      } else {
        const monthAbbr = MONTHS[startMonth].substring(0, 3);
        dateLabel = `${monthAbbr} ${startDay}`;
      }

      // Get stored position or calculate default
      let textX, textY;
      if (typeof annotation === 'object' && annotation.x !== undefined && annotation.y !== undefined) {
        textX = annotation.x;
        textY = annotation.y;
      } else {
        const textRadius = DEFAULT_LABEL_RADIUS + (index * 10);
        const textPos = polarToCartesian(angle, textRadius);
        textX = textPos.x;
        textY = textPos.y;
      }

      // Get color
      const color = (typeof annotation === 'object' && annotation.color) ? annotation.color : DEFAULT_COLOR;

      // Determine line start point based on text position
      const textDist = Math.sqrt(textX * textX + textY * textY);
      const isInside = textDist < INNER_RADIUS;
      const lineStartRadius = isInside ? INNER_RADIUS - 3 : OUTER_RADIUS + 3;
      const lineStartPos = polarToCartesian(angle, lineStartRadius);

      // Calculate line end with gap from text
      const lineGap = 3;
      const dx = textX - lineStartPos.x;
      const dy = textY - lineStartPos.y;
      const lineLen = Math.sqrt(dx * dx + dy * dy);
      const lineEndX = lineLen > lineGap ? textX - (dx / lineLen) * lineGap : textX;
      const lineEndY = lineLen > lineGap ? textY - (dy / lineLen) * lineGap : textY;

      // Line connecting to event text
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', lineStartPos.x);
      line.setAttribute('y1', lineStartPos.y);
      line.setAttribute('x2', lineEndX);
      line.setAttribute('y2', lineEndY);
      line.setAttribute('class', 'annotation-line');
      line.setAttribute('data-date-key', dateKey);
      line.setAttribute('data-index', index);
      line.setAttribute('data-angle', angle);
      group.appendChild(line);

      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', textX);
      text.setAttribute('y', textY);
      text.setAttribute('class', 'annotation-text');
      text.setAttribute('dominant-baseline', 'middle');
      text.setAttribute('data-date-key', dateKey);
      text.setAttribute('data-index', index);
      text.setAttribute('data-original-x', textX);
      text.setAttribute('data-original-y', textY);
      text.setAttribute('data-angle', angle);

      if (hasEndDate) {
        text.setAttribute('data-end-month', endMonth);
        text.setAttribute('data-end-day', endDay);
      }
      text.style.fill = color;

      // Determine text anchor based on position
      if (textX > 0) {
        text.setAttribute('text-anchor', 'start');
      } else {
        text.setAttribute('text-anchor', 'end');
      }

      // Get title
      const title = typeof annotation === 'string' ? annotation : annotation.title;

      // Include date only on first annotation for this day
      if (index === 0) {
        text.textContent = `${dateLabel}: ${title}`;
      } else {
        text.textContent = title;
      }

      // Make draggable
      text.style.cursor = 'grab';
      text.addEventListener('mousedown', startAnnotationDrag);

      // Add hover listeners for linked highlighting
      text.addEventListener('mouseenter', handleAnnotationHover);
      text.addEventListener('mouseleave', handleAnnotationLeave);

      group.appendChild(text);
    });
  }

  return group;
}

/**
 * Start dragging an annotation label
 */
function startAnnotationDrag(e) {
  e.preventDefault();
  e.stopPropagation();

  const svg = getSVG();
  const text = e.target;
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

  state.interaction.draggedAnnotation = {
    element: text,
    dateKey: text.getAttribute('data-date-key'),
    index: parseInt(text.getAttribute('data-index'))
  };
  state.interaction.dragOffset = {
    x: svgP.x - parseFloat(text.getAttribute('x')),
    y: svgP.y - parseFloat(text.getAttribute('y'))
  };
  state.interaction.hasDragged = false;

  text.style.cursor = 'grabbing';
  document.addEventListener('mousemove', dragAnnotation);
  document.addEventListener('mouseup', endAnnotationDrag);
}

/**
 * Handle annotation drag movement
 */
function dragAnnotation(e) {
  if (!state.interaction.draggedAnnotation) return;

  state.interaction.hasDragged = true;

  const svg = getSVG();
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

  const newX = svgP.x - state.interaction.dragOffset.x;
  const newY = svgP.y - state.interaction.dragOffset.y;

  // Update text position
  state.interaction.draggedAnnotation.element.setAttribute('x', newX);
  state.interaction.draggedAnnotation.element.setAttribute('y', newY);
  state.interaction.draggedAnnotation.element.setAttribute('data-original-x', newX);
  state.interaction.draggedAnnotation.element.setAttribute('data-original-y', newY);

  // Update corresponding line
  const line = document.querySelector(
    `.annotation-line[data-date-key="${state.interaction.draggedAnnotation.dateKey}"][data-index="${state.interaction.draggedAnnotation.index}"]`
  );
  if (line) {
    const textDist = Math.sqrt(newX * newX + newY * newY);
    const isInside = textDist < INNER_RADIUS;
    const angle = parseFloat(line.getAttribute('data-angle'));
    const lineStartRadius = isInside ? INNER_RADIUS - 3 : OUTER_RADIUS + 3;
    const lineStartPos = polarToCartesian(angle, lineStartRadius);
    line.setAttribute('x1', lineStartPos.x);
    line.setAttribute('y1', lineStartPos.y);

    const lineGap = 3;
    const dx = newX - lineStartPos.x;
    const dy = newY - lineStartPos.y;
    const lineLen = Math.sqrt(dx * dx + dy * dy);
    const lineEndX = lineLen > lineGap ? newX - (dx / lineLen) * lineGap : newX;
    const lineEndY = lineLen > lineGap ? newY - (dy / lineLen) * lineGap : newY;
    line.setAttribute('x2', lineEndX);
    line.setAttribute('y2', lineEndY);
  }
}

/**
 * End annotation drag
 */
function endAnnotationDrag(e) {
  if (!state.interaction.draggedAnnotation) return;

  const dateKey = state.interaction.draggedAnnotation.dateKey;
  const index = state.interaction.draggedAnnotation.index;

  if (!state.interaction.hasDragged) {
    // It was a click, not a drag - open edit modal
    state.interaction.draggedAnnotation.element.style.cursor = 'grab';
    state.interaction.draggedAnnotation = null;
    document.removeEventListener('mousemove', dragAnnotation);
    document.removeEventListener('mouseup', endAnnotationDrag);
    openEditModal(dateKey, index);
    return;
  }

  const newX = parseFloat(state.interaction.draggedAnnotation.element.getAttribute('x'));
  const newY = parseFloat(state.interaction.draggedAnnotation.element.getAttribute('y'));

  // Save position to annotation data
  const annotation = state.annotations[dateKey][index];

  if (typeof annotation === 'string') {
    state.annotations[dateKey][index] = { title: annotation, x: newX, y: newY };
  } else {
    annotation.x = newX;
    annotation.y = newY;
  }

  // Save to storage
  if (!isLoggedIn()) {
    saveAnnotationsToLocalStorage();
  }

  // Update label data with new position
  const nodeId = `${dateKey}-${index}`;
  const labelData = getLabelData();
  const node = labelData.find(n => n.id === nodeId);
  if (node) {
    node.x = newX;
    node.y = newY;
    node.originalX = newX;
    node.originalY = newY;
  }

  state.interaction.draggedAnnotation.element.style.cursor = 'grab';
  state.interaction.draggedAnnotation = null;
  document.removeEventListener('mousemove', dragAnnotation);
  document.removeEventListener('mouseup', endAnnotationDrag);
}

/**
 * Update annotation markers (recreate all markers)
 */
export function updateAnnotationMarkers() {
  const svg = getSVG();
  const oldMarkers = document.getElementById('annotation-markers');
  if (oldMarkers) {
    oldMarkers.remove();
  }
  svg.appendChild(createAnnotationMarkers(new Date().getFullYear()));
  updateDaySegmentHighlights();
  updateDynamicFontSizes();
  initLabeler();

  // Also update list view if it's active
  if (state.ui.currentView === 'list') {
    renderListView();
  }
}

/**
 * Update day segment highlights based on events
 */
export function updateDaySegmentHighlights() {
  const year = new Date().getFullYear();
  const totalDays = getDaysInYear(year);

  // Clear all existing highlights and inline styles
  document.querySelectorAll('.day-segment.has-event').forEach(el => {
    el.classList.remove('has-event');
    el.style.fill = '';
  });

  // Remove any existing event sub-segments
  document.querySelectorAll('.event-subsegment').forEach(el => el.remove());

  // Build a map of day -> list of {color, title} for all events
  const dayEventsMap = {};

  for (const dateKey of Object.keys(state.annotations)) {
    if (!state.annotations[dateKey] || state.annotations[dateKey].length === 0) continue;

    const [month, day] = dateKey.split('-').map(Number);
    const startMonth = month - 1;

    state.annotations[dateKey].forEach(annotation => {
      const color = (typeof annotation === 'object' && annotation.color)
        ? annotation.color
        : DEFAULT_COLOR;
      const title = typeof annotation === 'string' ? annotation : annotation.title;
      const hidden = typeof annotation === 'object' && annotation.hidden;

      const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;

      if (hasEndDate) {
        const startDoy = getDayOfYearFromMonthDay(startMonth, day, year);
        const endDoy = getDayOfYearFromMonthDay(annotation.endMonth, annotation.endDay, year);
        const duration = endDoy - startDoy + 1;
        const faded = hidden ? true : (duration > 4);

        let currentDoy = startDoy;
        let currentMonth = startMonth;
        let currentDay = day;

        while (currentDoy <= endDoy) {
          const dayKey = `${currentMonth}-${currentDay}`;
          if (!dayEventsMap[dayKey]) dayEventsMap[dayKey] = [];
          dayEventsMap[dayKey].push({ color, title, faded, hidden });

          currentDay++;
          if (currentDay > getDaysInMonth(currentMonth, year)) {
            currentDay = 1;
            currentMonth++;
          }
          currentDoy++;
        }
      } else {
        const dayKey = `${startMonth}-${day}`;
        if (!dayEventsMap[dayKey]) dayEventsMap[dayKey] = [];
        dayEventsMap[dayKey].push({ color, title, faded: hidden, hidden });
      }
    });
  }

  // Now apply highlights based on the map
  const subsegmentsGroup = document.getElementById('event-subsegments');

  for (const [dayKey, eventsList] of Object.entries(dayEventsMap)) {
    const [monthIdx, dayNum] = dayKey.split('-').map(Number);

    const segment = document.querySelector(
      `.day-segment[data-month="${monthIdx}"][data-day="${dayNum}"]`
    );
    if (!segment) continue;

    segment.classList.add('has-event');

    // Get unique colors while preserving order
    const uniqueColors = [];
    const colorToTitles = {};
    const colorToFaded = {};
    const colorToHidden = {};
    eventsList.forEach(evt => {
      if (!colorToTitles[evt.color]) {
        colorToTitles[evt.color] = [];
        colorToFaded[evt.color] = evt.faded;
        colorToHidden[evt.color] = evt.hidden;
        uniqueColors.push(evt.color);
      }
      colorToTitles[evt.color].push(evt.title);
      if (!evt.faded) colorToFaded[evt.color] = false;
      if (!evt.hidden) colorToHidden[evt.color] = false;
    });

    const getOpacity = (color) => {
      if (colorToHidden[color]) return 0.25;
      if (colorToFaded[color]) return 0.4;
      return 1;
    };

    if (uniqueColors.length === 1) {
      const color = uniqueColors[0];
      segment.style.fill = color;
      segment.style.opacity = getOpacity(color);
    } else {
      segment.style.fill = 'transparent';

      const dayOfYear = parseInt(segment.getAttribute('data-day-of-year'));
      const startAngle = dateToAngle(dayOfYear - 1, totalDays);
      const endAngle = dateToAngle(dayOfYear, totalDays);

      const numColors = uniqueColors.length;
      const radiusStep = (OUTER_RADIUS - INNER_RADIUS) / numColors;

      uniqueColors.forEach((color, i) => {
        const innerR = INNER_RADIUS + i * radiusStep;
        const outerR = INNER_RADIUS + (i + 1) * radiusStep;

        const subPath = document.createElementNS(SVG_NS, 'path');
        subPath.setAttribute('d', createArcPath(startAngle, endAngle, innerR, outerR));
        subPath.setAttribute('class', 'event-subsegment');
        subPath.setAttribute('data-month', monthIdx);
        subPath.setAttribute('data-day', dayNum);
        subPath.setAttribute('data-color', color);
        subPath.setAttribute('data-titles', colorToTitles[color].join(', '));
        subPath.style.fill = color;
        subPath.style.opacity = getOpacity(color);

        subPath.addEventListener('mouseenter', handleSubsegmentHover);
        subPath.addEventListener('mouseleave', handleSubsegmentLeave);
        subPath.addEventListener('mousedown', handleDayMouseDown);
        subPath.addEventListener('mouseenter', handleDayRangeMove);
        subPath.addEventListener('mouseup', handleDayMouseUp);

        subsegmentsGroup.appendChild(subPath);
      });
    }
  }
}

/**
 * Render "Also on this day" section in modal
 */
export function renderAlsoOnThisDay(month, day) {
  const elements = getElements();
  const alsoOnThisDay = elements.alsoOnThisDay;
  if (!alsoOnThisDay) return;

  const year = new Date().getFullYear();
  const targetDoy = getDayOfYearFromMonthDay(month, day, year);
  const eventsOnDay = [];

  for (const [dateKey, annList] of Object.entries(state.annotations)) {
    if (!annList || annList.length === 0) continue;

    const [startMonth, startDay] = dateKey.split('-').map(Number);
    const startMonthIdx = startMonth - 1;

    annList.forEach((annotation, index) => {
      const hasEndDate = typeof annotation === 'object' && annotation.endMonth !== undefined;
      const endMonthIdx = hasEndDate ? annotation.endMonth : startMonthIdx;
      const endDay = hasEndDate ? annotation.endDay : startDay;

      const startDoy = getDayOfYearFromMonthDay(startMonthIdx, startDay, year);
      const endDoy = getDayOfYearFromMonthDay(endMonthIdx, endDay, year);

      if (targetDoy >= startDoy && targetDoy <= endDoy) {
        const title = typeof annotation === 'string' ? annotation : annotation.title;
        eventsOnDay.push({ dateKey, index, title });
      }
    });
  }

  if (eventsOnDay.length > 0) {
    alsoOnThisDay.innerHTML = '<p class="also-on-day-label">Also on this day:</p>' +
      eventsOnDay.map(e =>
        `<button class="also-on-day-btn" data-date-key="${e.dateKey}" data-index="${e.index}">${e.title}</button>`
      ).join('');

    alsoOnThisDay.querySelectorAll('.also-on-day-btn').forEach(btn => {
      btn.addEventListener('click', (evt) => {
        const dateKey = evt.target.getAttribute('data-date-key');
        const index = parseInt(evt.target.getAttribute('data-index'));
        openEditModal(dateKey, index);
      });
    });
  } else {
    alsoOnThisDay.innerHTML = '';
  }
}
