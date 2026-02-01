/**
 * Convert polar coordinates to Cartesian coordinates
 * @param angle Angle in degrees
 * @param radius Radius
 */
export function polarToCartesian(angle, radius) {
  const rad = (angle * Math.PI) / 180;
  return {
    x: Math.cos(rad) * radius,
    y: Math.sin(rad) * radius
  };
}

/**
 * Create an SVG arc path between two angles
 * @param startAngle Start angle in degrees
 * @param endAngle End angle in degrees
 * @param innerR Inner radius
 * @param outerR Outer radius
 */
export function createArcPath(startAngle, endAngle, innerR, outerR) {
  const start1 = polarToCartesian(startAngle, outerR);
  const end1 = polarToCartesian(endAngle, outerR);
  const start2 = polarToCartesian(endAngle, innerR);
  const end2 = polarToCartesian(startAngle, innerR);

  const largeArc = endAngle - startAngle > 180 ? 1 : 0;

  return `M ${start1.x} ${start1.y}
          A ${outerR} ${outerR} 0 ${largeArc} 1 ${end1.x} ${end1.y}
          L ${start2.x} ${start2.y}
          A ${innerR} ${innerR} 0 ${largeArc} 0 ${end2.x} ${end2.y}
          Z`;
}

/**
 * Convert a hex color to rgba string
 */
export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Check if a point is within a viewbox
 */
export function isPointInViewBox(x, y, vb) {
  return x >= vb.x && x <= vb.x + vb.w && y >= vb.y && y <= vb.y + vb.h;
}

/**
 * Get distance between two touch points
 */
export function getTouchDistance(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Get center point between two touch points
 */
export function getTouchCenter(touches) {
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}
