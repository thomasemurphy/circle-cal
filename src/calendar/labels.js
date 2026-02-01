import { state, setLabelData, getLabelData } from '../state.js';
import { getDayOfYearFromMonthDay, getDaysInYear } from '../utils/date.js';
import { labeler } from '../labeler.js';
import { getElements } from '../ui/elements.js';
import { getViewBox } from './zoom.js';

/**
 * Calculate priority for a label (higher = more visible)
 */
export function calculateLabelPriority(dateKey, annotation) {
  const today = new Date();
  const currentYear = today.getFullYear();
  const [month, day] = dateKey.split('-').map(Number);
  const eventDate = new Date(currentYear, month - 1, day);

  let priority = 0;

  // 1. Proximity to today: max 50 points, -1 per week decay
  const daysDiff = Math.abs(Math.round((eventDate - today) / (1000 * 60 * 60 * 24)));
  const weeksDiff = daysDiff / 7;
  const proximityScore = Math.max(0, 50 - weeksDiff);
  priority += proximityScore;

  // 2. Future bias: +10 points for future events
  if (eventDate >= today) {
    priority += 10;
  }

  // 3. Duration bonus: 2-4 days (+15), 1 day (+5), 5+ days (+0)
  if (typeof annotation === 'object' && annotation.endMonth !== undefined) {
    const startDoy = getDayOfYearFromMonthDay(month - 1, day, currentYear);
    const endDoy = getDayOfYearFromMonthDay(annotation.endMonth, annotation.endDay, currentYear);
    const duration = endDoy - startDoy + 1;

    if (duration >= 2 && duration <= 4) {
      priority += 15;
    } else if (duration === 1) {
      priority += 5;
    }
    // 5+ days: +0
  } else {
    // Single day event
    priority += 5;
  }

  return priority;
}

/**
 * Detect isolated labels (no neighbors within 30 days)
 */
export function detectIsolatedLabels(labelDataArray) {
  const currentYear = new Date().getFullYear();
  const totalDays = getDaysInYear(currentYear);

  // Calculate day-of-year for each label
  labelDataArray.forEach(label => {
    const dateKey = label.id.split('-').slice(0, 2).join('-');
    const [month, day] = dateKey.split('-').map(Number);
    label.dayOfYear = getDayOfYearFromMonthDay(month - 1, day, currentYear);
  });

  // Check isolation (no neighbors within 30 days)
  labelDataArray.forEach(label => {
    let hasNeighbor = false;
    for (const other of labelDataArray) {
      if (other === label) continue;
      let dayDiff = Math.abs(label.dayOfYear - other.dayOfYear);
      // Handle year wrap-around
      dayDiff = Math.min(dayDiff, totalDays - dayDiff);
      if (dayDiff <= 30) {
        hasNeighbor = true;
        break;
      }
    }
    label.isIsolated = !hasNeighbor;
  });
}

/**
 * Detect overlapping labels and group them
 */
export function detectLabelCollisions(labelDataArray) {
  const collisionGroups = [];
  const visited = new Set();

  function boxesOverlap(a, b) {
    const padding = 2;
    return !(a.x + a.width + padding < b.x ||
             b.x + b.width + padding < a.x ||
             a.y + a.height + padding < b.y ||
             b.y + b.height + padding < a.y);
  }

  function getBoundingBox(label) {
    return {
      x: label.x - label.width / 2,
      y: label.y - label.height,
      width: label.width,
      height: label.height
    };
  }

  // Find connected components of overlapping labels
  for (let i = 0; i < labelDataArray.length; i++) {
    if (visited.has(i)) continue;

    const group = [];
    const stack = [i];

    while (stack.length > 0) {
      const idx = stack.pop();
      if (visited.has(idx)) continue;
      visited.add(idx);
      group.push(idx);

      const boxA = getBoundingBox(labelDataArray[idx]);

      for (let j = 0; j < labelDataArray.length; j++) {
        if (visited.has(j)) continue;
        const boxB = getBoundingBox(labelDataArray[j]);
        if (boxesOverlap(boxA, boxB)) {
          stack.push(j);
        }
      }
    }

    if (group.length > 0) {
      collisionGroups.push(group);
    }
  }

  return collisionGroups;
}

/**
 * Calculate which labels should be visible based on collisions and priority
 */
export function calculateVisibleLabels(labelDataArray, collisionGroups) {
  // Determine how many labels to show per group based on zoom
  // At zoom 1: show 1, at zoom 15: show 4
  const labelsPerGroup = Math.min(4, Math.max(1, Math.floor(1 + (state.ui.currentZoom - 1) * 3 / 14)));

  // First, mark all labels as hidden
  labelDataArray.forEach(label => {
    label.shouldShow = false;
  });

  // Process each collision group
  collisionGroups.forEach(group => {
    // Get labels in this group with their priorities
    const labelsWithPriority = group.map(idx => {
      const label = labelDataArray[idx];
      const dateKey = label.id.split('-').slice(0, 2).join('-');
      const index = parseInt(label.id.split('-')[2] || '0');
      const annotationList = state.annotations[dateKey] || [];
      const annotation = annotationList[index] || {};

      return {
        idx,
        label,
        priority: calculateLabelPriority(dateKey, annotation),
        isIsolated: label.isIsolated
      };
    });

    // Sort by priority (highest first)
    labelsWithPriority.sort((a, b) => b.priority - a.priority);

    // Show isolated labels always, plus top N by priority
    let shown = 0;
    labelsWithPriority.forEach(item => {
      if (item.isIsolated) {
        item.label.shouldShow = true;
      } else if (shown < labelsPerGroup) {
        item.label.shouldShow = true;
        shown++;
      }
    });
  });
}

/**
 * Update label visibility based on collisions
 */
export function updateLabelVisibility() {
  const labelData = getLabelData();
  if (labelData.length === 0) return;

  // Only process labels with visible tiles
  const visibleLabels = labelData.filter(d => d.tileVisible !== false);

  const collisionGroups = detectLabelCollisions(visibleLabels);
  calculateVisibleLabels(visibleLabels, collisionGroups);

  // Apply visibility via opacity
  labelData.forEach(data => {
    const { text, line, shouldShow, tileVisible } = data;
    if (!text) return;

    // Skip labels with hidden tiles (already handled by applyLabelPositions)
    if (tileVisible === false) return;

    const opacity = shouldShow ? '1' : '0';
    text.style.opacity = opacity;
    if (line) line.style.opacity = opacity;
  });
}

/**
 * Apply label positions from label data
 */
export function applyLabelPositions() {
  const labelData = getLabelData();

  labelData.forEach(data => {
    const { text, line, anchorX, anchorY, x, y } = data;
    if (!text) return;

    // Labels stay at their fixed positions - no clamping or movement
    data.tileVisible = true;

    text.style.display = '';
    if (line) line.style.display = '';

    text.setAttribute('x', x);
    text.setAttribute('y', y);
  });
}

/**
 * Initialize the labeler with current annotation elements
 */
export function initLabeler() {
  const texts = document.querySelectorAll('.annotation-text');
  const labelData = [];

  texts.forEach(text => {
    const dateKey = text.getAttribute('data-date-key');
    const index = text.getAttribute('data-index');
    const line = document.querySelector(`.annotation-line[data-date-key="${dateKey}"][data-index="${index}"]`);

    const originalX = parseFloat(text.getAttribute('data-original-x'));
    const originalY = parseFloat(text.getAttribute('data-original-y'));
    const anchorX = line ? parseFloat(line.getAttribute('x1')) : originalX;
    const anchorY = line ? parseFloat(line.getAttribute('y1')) : originalY;

    // Estimate text dimensions
    const bbox = text.getBBox();

    labelData.push({
      id: `${dateKey}-${index}`,
      text: text,
      line: line,
      x: originalX,
      y: originalY,
      width: bbox.width || 50,
      height: bbox.height || 10,
      originalX: originalX,
      originalY: originalY,
      anchorX: anchorX,
      anchorY: anchorY
    });
  });

  setLabelData(labelData);

  if (labelData.length === 0) return;

  // Calculate isolation status for priority-based visibility
  detectIsolatedLabels(labelData);

  runLabeler();
}

/**
 * Run the labeler algorithm to position labels
 */
export function runLabeler() {
  const labelData = getLabelData();
  if (labelData.length === 0) return;

  const vb = getViewBox();

  // Build arrays for the labeler
  // Offset coordinates to positive space for the labeler algorithm
  const offsetX = -vb.x;
  const offsetY = -vb.y;

  const labels = labelData.map(d => ({
    x: d.originalX + offsetX,
    y: d.originalY + offsetY,
    width: d.width,
    height: d.height,
    originalX: d.originalX,
    originalY: d.originalY
  }));

  const anchors = labelData.map(d => ({
    x: d.anchorX + offsetX,
    y: d.anchorY + offsetY,
    r: 5
  }));

  // Run the labeler
  labeler()
    .label(labels)
    .anchor(anchors)
    .width(vb.w)
    .height(vb.h)
    .start(500);

  // Apply results back to labelData (convert back from offset coordinates)
  labels.forEach((label, i) => {
    labelData[i].x = label.x - offsetX;
    labelData[i].y = label.y - offsetY;
  });

  // Update DOM
  applyLabelPositions();

  // Apply priority-based visibility (collision detection)
  updateLabelVisibility();
}

/**
 * Update event text positions (called during pan/zoom)
 */
export function updateEventTextPositions() {
  applyLabelPositions();
}
