import { MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM, OUTER_RADIUS, INNER_RADIUS, CENTER_RADIUS } from '../config.js';
import { state, setCurrentZoom } from '../state.js';
import { polarToCartesian, isPointInViewBox, getTouchDistance, getTouchCenter } from '../utils/math.js';
import { getSVG } from '../ui/elements.js';
import { updateLabelVisibility, updateEventTextPositions } from './labels.js';

/**
 * Get the current viewBox as an object
 */
export function getViewBox() {
  const svg = getSVG();
  const vb = svg.getAttribute('viewBox').split(' ').map(Number);
  return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
}

/**
 * Set the viewBox and update related elements
 */
export function setViewBox(x, y, w, h) {
  const svg = getSVG();
  svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  setCurrentZoom(700 / w);
  svg.classList.toggle('zoomed', state.ui.currentZoom > 1.1);
  updateDynamicFontSizes();
  updateCenterTextPosition();
  updateEventTextPositions();
  updateLabelVisibility();
}

/**
 * Reset zoom to default level
 */
export function resetZoom() {
  const defaultSize = 700 / DEFAULT_ZOOM;
  // Offset Y upward
  const yOffset = defaultSize * 0.05;
  setViewBox(-defaultSize / 2, -defaultSize / 2 + yOffset, defaultSize, defaultSize);
}

/**
 * Handle mouse wheel zoom
 */
export function handleWheel(e) {
  e.preventDefault();
  const svg = getSVG();

  // Get cursor position in SVG coordinates before zoom
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

  // Calculate zoom factor (pinch gestures send ctrlKey with wheel)
  const delta = e.ctrlKey ? e.deltaY * 0.02 : e.deltaY * 0.005;
  const zoomFactor = Math.exp(-delta);
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.ui.currentZoom * zoomFactor));

  if (newZoom === state.ui.currentZoom) return;

  const vb = getViewBox();
  const newSize = 700 / newZoom;

  // Zoom centered on cursor position
  const cursorRatioX = (svgP.x - vb.x) / vb.w;
  const cursorRatioY = (svgP.y - vb.y) / vb.h;

  const newX = svgP.x - cursorRatioX * newSize;
  const newY = svgP.y - cursorRatioY * newSize;

  setViewBox(newX, newY, newSize, newSize);
}

/**
 * Handle pan start
 */
export function handlePanStart(e) {
  const svg = getSVG();

  // Only pan with left mouse button, not during day clicks
  if (e.button !== 0) return;

  // Don't pan when clicking on day segments (for range selection)
  if (e.target.classList.contains('day-segment')) return;

  state.interaction.isPanning = true;
  state.interaction.panStart = { x: e.clientX, y: e.clientY };
  const vb = getViewBox();
  state.interaction.viewBoxStart = { x: vb.x, y: vb.y };
  svg.style.cursor = 'grabbing';
}

/**
 * Handle pan move
 */
export function handlePanMove(e) {
  if (!state.interaction.isPanning) return;

  const svg = getSVG();
  const vb = getViewBox();
  const scale = vb.w / svg.clientWidth;

  const dx = (e.clientX - state.interaction.panStart.x) * scale;
  const dy = (e.clientY - state.interaction.panStart.y) * scale;

  svg.setAttribute('viewBox', `${state.interaction.viewBoxStart.x - dx} ${state.interaction.viewBoxStart.y - dy} ${vb.w} ${vb.h}`);
  updateCenterTextPosition();
  updateEventTextPositions();
}

/**
 * Handle pan end
 */
export function handlePanEnd(e) {
  if (state.interaction.isPanning) {
    state.interaction.isPanning = false;
    getSVG().style.cursor = '';
  }
}

/**
 * Handle touch start for pinch zoom and pan
 */
export function handleTouchStart(e) {
  const svg = getSVG();

  if (e.touches.length === 2) {
    // Pinch zoom start
    e.preventDefault();
    state.interaction.touchStartDistance = getTouchDistance(e.touches);
    state.interaction.touchStartZoom = state.ui.currentZoom;
    state.interaction.touchStartCenter = getTouchCenter(e.touches);
    state.interaction.lastTouchCenter = state.interaction.touchStartCenter;
    state.interaction.isTouchPanning = false;
  } else if (e.touches.length === 1) {
    // Single touch pan start
    if (e.target.classList.contains('day-segment')) return;
    state.interaction.isTouchPanning = true;
    state.interaction.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const vb = getViewBox();
    state.interaction.viewBoxStart = { x: vb.x, y: vb.y };
  }
}

/**
 * Handle touch move for pinch zoom and pan
 */
export function handleTouchMove(e) {
  const svg = getSVG();

  if (e.touches.length === 2) {
    // Pinch zoom
    e.preventDefault();
    const currentDistance = getTouchDistance(e.touches);
    const currentCenter = getTouchCenter(e.touches);

    // Calculate new zoom
    const scale = currentDistance / state.interaction.touchStartDistance;
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.interaction.touchStartZoom * scale));

    if (newZoom !== state.ui.currentZoom) {
      // Get center position in SVG coordinates
      const pt = svg.createSVGPoint();
      pt.x = currentCenter.x;
      pt.y = currentCenter.y;
      const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());

      const vb = getViewBox();
      const newSize = 700 / newZoom;

      // Zoom centered on pinch center
      const cursorRatioX = (svgP.x - vb.x) / vb.w;
      const cursorRatioY = (svgP.y - vb.y) / vb.h;

      const newX = svgP.x - cursorRatioX * newSize;
      const newY = svgP.y - cursorRatioY * newSize;

      setViewBox(newX, newY, newSize, newSize);
    }

    state.interaction.lastTouchCenter = currentCenter;
  } else if (e.touches.length === 1 && state.interaction.isTouchPanning) {
    // Single touch pan
    e.preventDefault();
    const vb = getViewBox();
    const scale = vb.w / svg.clientWidth;

    const dx = (e.touches[0].clientX - state.interaction.panStart.x) * scale;
    const dy = (e.touches[0].clientY - state.interaction.panStart.y) * scale;

    svg.setAttribute('viewBox', `${state.interaction.viewBoxStart.x - dx} ${state.interaction.viewBoxStart.y - dy} ${vb.w} ${vb.h}`);
    updateCenterTextPosition();
    updateEventTextPositions();
  }
}

/**
 * Handle touch end
 */
export function handleTouchEnd(e) {
  if (e.touches.length < 2) {
    state.interaction.touchStartDistance = 0;
  }
  if (e.touches.length === 0) {
    state.interaction.isTouchPanning = false;
  }
}

/**
 * Update font sizes based on zoom level
 */
export function updateDynamicFontSizes() {
  const currentZoom = state.ui.currentZoom;

  // Day numbers and day of week: same size, scale up with zoom
  const dayLabelSize = 0.6 * Math.sqrt(currentZoom);
  document.querySelectorAll('.day-number').forEach(el => {
    el.style.fontSize = dayLabelSize + 'px';
  });
  document.querySelectorAll('.day-of-week').forEach(el => {
    el.style.fontSize = dayLabelSize + 'px';
  });

  // Annotation text: scale down with zoom to maintain roughly constant screen size
  const annotationSize = 7 / Math.sqrt(currentZoom);
  document.querySelectorAll('.annotation-text').forEach(el => {
    el.style.fontSize = annotationSize + 'px';
  });

  // Month labels: scale down with zoom to maintain roughly constant screen size
  const monthLabelSize = 10 / Math.sqrt(currentZoom);
  document.querySelectorAll('.month-label').forEach(el => {
    el.style.fontSize = monthLabelSize + 'px';
  });
}

/**
 * Update center text position based on viewport
 */
export function updateCenterTextPosition() {
  const group = document.getElementById('center-text-group');
  if (!group) return;

  const vb = getViewBox();

  // Check if origin (0, 0) is within the viewport
  const originVisible = (
    0 >= vb.x && 0 <= vb.x + vb.w &&
    0 >= vb.y && 0 <= vb.y + vb.h
  );

  const dateText = group.querySelector('.center-date');
  const timeText = group.querySelector('.center-time');
  const baseTextSize = 14;
  const scaledTextSize = baseTextSize / state.ui.currentZoom;

  let posX, posY;
  if (originVisible) {
    // Keep at original center position
    posX = 0;
    posY = 0;

    // Center-aligned when in the middle
    if (dateText) dateText.setAttribute('text-anchor', 'middle');
    if (timeText) timeText.setAttribute('text-anchor', 'middle');

    const yOffset = 8 / state.ui.currentZoom;
    if (dateText) dateText.setAttribute('y', -yOffset);
    if (timeText) timeText.setAttribute('y', yOffset);
  } else {
    // Move to upper-left corner of viewport
    const padding = 10 / state.ui.currentZoom;
    posX = vb.x + padding;
    posY = vb.y + padding;

    // Left-aligned when pinned to top-left
    if (dateText) dateText.setAttribute('text-anchor', 'start');
    if (timeText) timeText.setAttribute('text-anchor', 'start');

    const lineHeight = scaledTextSize * 1.4;
    if (dateText) dateText.setAttribute('y', lineHeight);
    if (timeText) timeText.setAttribute('y', lineHeight * 2);
  }

  group.setAttribute('transform', `translate(${posX}, ${posY})`);

  if (dateText) dateText.style.fontSize = scaledTextSize + 'px';
  if (timeText) timeText.style.fontSize = scaledTextSize + 'px';
}

/**
 * Calculate initial annotation position within viewport
 */
export function calculateInitialAnnotationPosition(angle) {
  const vb = getViewBox();
  const DEFAULT_LABEL_RADIUS = OUTER_RADIUS + 3;
  const INSIDE_LABEL_RADIUS = CENTER_RADIUS - 20;

  // Try outside position first (default behavior)
  const outsidePos = polarToCartesian(angle, DEFAULT_LABEL_RADIUS);
  if (isPointInViewBox(outsidePos.x, outsidePos.y, vb)) {
    return outsidePos;
  }

  // Try inside position
  const insidePos = polarToCartesian(angle, INSIDE_LABEL_RADIUS);
  if (isPointInViewBox(insidePos.x, insidePos.y, vb)) {
    return insidePos;
  }

  // Neither standard position is visible - position within viewbox
  const vbCenterX = vb.x + vb.w / 2;
  const vbCenterY = vb.y + vb.h / 2;

  const offsetRadius = Math.min(vb.w, vb.h) * 0.3;
  const rad = (angle * Math.PI) / 180;
  const targetX = vbCenterX + Math.cos(rad) * offsetRadius;
  const targetY = vbCenterY + Math.sin(rad) * offsetRadius;

  return { x: targetX, y: targetY };
}

/**
 * Initialize zoom/pan event listeners
 */
export function initZoomPan() {
  const svg = getSVG();

  // Zoom handler - pinch/scroll to zoom continuously
  svg.addEventListener('wheel', handleWheel, { passive: false });

  // Double-click to reset zoom
  svg.addEventListener('dblclick', resetZoom);

  // Pan handlers - click and drag to pan
  svg.addEventListener('mousedown', handlePanStart);
  svg.addEventListener('mousemove', handlePanMove);
  svg.addEventListener('mouseup', handlePanEnd);
  svg.addEventListener('mouseleave', handlePanEnd);

  // Touch handlers for mobile pinch-to-zoom and pan
  svg.addEventListener('touchstart', handleTouchStart, { passive: false });
  svg.addEventListener('touchmove', handleTouchMove, { passive: false });
  svg.addEventListener('touchend', handleTouchEnd);
}

/**
 * Size the SVG wrapper for iOS/Safari compatibility
 */
export function sizeSVGWrapper() {
  const wrapper = document.querySelector('.calendar-wrapper');
  const svg = getSVG();
  if (wrapper && svg) {
    const width = wrapper.offsetWidth;
    // Cap height to available viewport space (accounting for header ~60px and padding)
    const header = document.querySelector('.app-header');
    const headerHeight = header ? header.offsetHeight : 60;
    const maxHeight = window.innerHeight - headerHeight - 40;
    const height = Math.min(width, maxHeight);
    svg.style.height = height + 'px';
  }
}
