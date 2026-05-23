// src/annotation.js

// --- Drawing constants ---

// Dash pattern segments (multiplied by sqrt(lineWidth))
const DASH_SOLID = 14;
const DASH_GAP = 10;
const DASH_DOT = 0.5;

// Shadow rendering
const SHADOW_GRAY_MIX = 0.2;
const SHADOW_COLOR_MIX = 0.1;
const SHADOW_DEFAULT_ALPHA = 0.35;
const SHADOW_BLUR_RATIO = 0.6;
const SHADOW_MAX_BLUR = 20;
const SHADOW_OFFSET_RATIO = 0.12;

// Arrow head dimensions — extracted from reference SVG (viewBox 540×675, stroke-width 50)
// SVG shaft end at X=335.4, arrowhead spans X=284.6→497.1, Y=240.7→420.7
// headLen = 4.25 × lineWidth, wing half-span = 1.8 × lineWidth
const ARROW_HEAD_LW_MULT = 4.25;
const ARROW_BAR_HEIGHT_MULT = 2.5;

// Sequence number circle
const SEQ_MIN_RADIUS = 16;
const SEQ_LINE_W_RATIO = 0.1;
const SEQ_MIN_LINE_W = 2;
const SEQ_SHADOW_RATIO = 0.15;
const SEQ_MAX_TEXT_RATIO = 1.7;
const SEQ_FONT_SCALE = 1 / 0.8;

// Text annotation
const TEXT_SHADOW_RATIO = 0.15;
const TEXT_LINE_HEIGHT_RATIO = 1.2;

// Stamp markers
const STAMP_LINE_W_RATIO = 0.12;
const CHECK_START = { x: 0.15, y: 0.5 };
const CHECK_MID   = { x: 0.4,  y: 0.75 };
const CHECK_END   = { x: 0.85, y: 0.2 };
const X_PAD_RATIO = 0.2;

// --- Annotation unique ID counter ---
let nextAnnotationId = 1;
export function resetAnnotationIdCounter() {
  nextAnnotationId = 1;
}

// --- Tool definitions ---
export const TOOLS = ['scaling', 'geometry', 'pencil', 'arrow', 'stamp', 'sequence', 'text', 'eraser'];

// Line style options (5 common styles)
export const LINE_STYLES = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
  { value: 'dash-dot', label: '点划线' },
  { value: 'double', label: '双实线' },
];

// Arrow style options
export const ARROW_STYLES = [
  { value: 'taper', label: '渐尖箭头' },
  { value: 'single', label: '单边箭头' },
  { value: 'double', label: '双边箭头' },
  { value: 'line', label: '线段头' },
  { value: 'none', label: '无头' },
];

// Number style options
export const NUMBER_STYLES = [
  { value: 'arabic', label: '1, 2, 3 …' },
  { value: 'roman', label: 'I, II, III …' },
  { value: 'alpha-upper', label: 'A, B, C …' },
  { value: 'alpha-lower', label: 'a, b, c …' },
  { value: 'chinese', label: '一, 二, 三 …' },
];

// Stamp shape options
export const STAMP_SHAPES = [
  { value: 'check', label: '勾号' },
  { value: 'x', label: '叉号' },
];

// 9 color presets: 7 rainbow + black + white (desaturated to 80%)
export const COLOR_PRESETS = [
  '#E61919', '#E67F19', '#E6E619', '#19E619',
  '#1919E6', '#490D75', '#8C15BE', '#1A1A1A', '#E6E6E6',
];

// --- Default tool settings (独立存储 per tool) ---
export function createDefaultToolSettings() {
  return {
    geometry: {
      shape: 'rounded-rect', // 'rounded-rect' | 'rect' | 'ellipse'
      fill: false,
      lineStyle: 'solid',
      lineWidth: 10,
      cornerRadius: 8,
      color: '#E61919',
      opacity: 100,
      shadow: 35,
    },
    pencil: {
      lineStyle: 'solid',
      lineWidth: 10,
      color: '#E61919',
      opacity: 100,
      shadow: 35,
    },
    arrow: {
      arrowStyle: 'taper',
      lineStyle: 'solid',
      lineWidth: 10,
      color: '#E61919',
      opacity: 100,
      shadow: 35,
    },
    stamp: {
      shape: 'check',
      size: 256,
      color: '#E61919',
      opacity: 100,
      shadow: 35,
    },
    sequence: {
      nextNumber: 1,
      numberStyle: 'arabic',
      size: 64,
      color: '#E61919',
      opacity: 100,
      shadow: 35,
    },
    text: {
      bold: false,
      italic: false,
      fontFamily: 'sans-serif',
      fontSize: 48,
      color: '#E61919',
      opacity: 100,
      shadow: 35,
    },
    eraser: {},
  };
}

// --- Annotation data model ---

/**
 * @typedef {Object} Annotation
 * @property {number} id
 * @property {'rectangle'|'ellipse'|'pencil'|'arrow'|'sequence'|'text'} type
 * @property {Object} params — type-specific drawing parameters
 */

/**
 * Create a new annotation object.
 * `imageId` references which pool image this annotation belongs to.
 */
export function createAnnotation(type, params, imageId, rotation = 0) {
  return {
    id: nextAnnotationId++,
    type,
    imageId,
    rotation,
    params,
  };
}

// --- Drawing helpers (shared by canvas renderer) ---

/**
 * Apply line style (dash pattern) to a canvas context.
 */
export function applyLineStyle(ctx, lineStyle, lineWidth) {
  const lw = lineWidth || 1;
  const s = Math.sqrt(lw);
  switch (lineStyle) {
    case 'solid':
    case 'double':
      ctx.setLineDash([]);
      break;
    case 'dashed':
      ctx.setLineDash([DASH_SOLID * s, DASH_GAP * s]);
      break;
    case 'dotted': {
      // 极短 dash + round cap = 正圆点
      ctx.setLineDash([DASH_DOT, DASH_GAP * s]);
      break;
    }
    case 'dash-dot':
      ctx.setLineDash([DASH_SOLID * s, DASH_GAP * s, DASH_DOT, DASH_GAP * s]);
      break;
    default:
      ctx.setLineDash([]);
  }
}

/**
 * Convert a number to the selected style string.
 */
export function formatNumber(n, style) {
  switch (style) {
    case 'arabic':
      return String(n);
    case 'roman':
      return toRoman(n);
    case 'alpha-upper':
      return toAlpha(n, true);
    case 'alpha-lower':
      return toAlpha(n, false);
    case 'chinese':
      return toChineseNumber(n);
    default:
      return String(n);
  }
}

function toRoman(num) {
  const vals = [1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1];
  const syms = ['M', 'CM', 'D', 'CD', 'C', 'XC', 'L', 'XL', 'X', 'IX', 'V', 'IV', 'I'];
  let res = '';
  for (let i = 0; i < vals.length; i++) {
    while (num >= vals[i]) { res += syms[i]; num -= vals[i]; }
  }
  return res;
}

function toAlpha(num, upper) {
  let s = '';
  while (num > 0) {
    num--;
    s = String.fromCharCode((upper ? 65 : 97) + (num % 26)) + s;
    num = Math.floor(num / 26);
  }
  return s;
}

function toChineseNumber(num) {
  const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  if (num < 0) return '负' + toChineseNumber(-num);
  if (num < 10) return digits[num];
  if (num < 20) return '十' + (num % 10 === 0 ? '' : digits[num % 10]);
  if (num < 100) return digits[Math.floor(num / 10)] + '十' + (num % 10 === 0 ? '' : digits[num % 10]);
  return String(num); // fallback for large numbers
}

/**
 * Get text label for a given number style.
 */
export function getNumberStyleLabel(value) {
  const entry = NUMBER_STYLES.find(s => s.value === value);
  return entry ? entry.label : value;
}

/**
 * Render a single annotation to canvas context (in image-local coordinates).
 * Called by stitch-engine during the annotation render pass.
 */
export function renderAnnotation(ctx, annotation) {
  const { type, params } = annotation;
  ctx.save();

  switch (type) {
    case 'rectangle':
      drawRectangleAnnotation(ctx, params);
      break;
    case 'ellipse':
      drawEllipseAnnotation(ctx, params);
      break;
    case 'pencil':
      drawPencilAnnotation(ctx, params);
      break;
    case 'arrow':
      drawArrowAnnotation(ctx, params);
      break;
    case 'stamp':
      drawStampAnnotation(ctx, params);
      break;
    case 'sequence':
      drawSequenceAnnotation(ctx, params);
      break;
    case 'text':
      drawTextAnnotation(ctx, params);
      break;
  }

  ctx.restore();
}

function applyOpacity(ctx, p, fn) {
  const alpha = (p.opacity ?? 100) / 100;
  ctx.save();
  ctx.globalAlpha = alpha;
  fn();
  ctx.restore();
}

// Compute shadow params: dark, desaturated, low-alpha version of the color
function getShadowColor(hexColor, alpha) {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const gray = (r + g + b) / 3;
  const sr = Math.round(gray * SHADOW_GRAY_MIX + r * SHADOW_COLOR_MIX);
  const sg = Math.round(gray * SHADOW_GRAY_MIX + g * SHADOW_COLOR_MIX);
  const sb = Math.round(gray * SHADOW_GRAY_MIX + b * SHADOW_COLOR_MIX);
  return `rgba(${sr},${sg},${sb},${alpha})`;
}

function applyShadow(ctx, p, sizeMetric) {
  if (!p.shadow) return;
  const s = Math.max(sizeMetric, 1);
  const alpha = typeof p.shadow === 'number' ? p.shadow / 100 : SHADOW_DEFAULT_ALPHA;
  ctx.shadowColor = getShadowColor(p.color, alpha);
  ctx.shadowBlur = Math.min(s * SHADOW_BLUR_RATIO, SHADOW_MAX_BLUR);
  ctx.shadowOffsetX = s * SHADOW_OFFSET_RATIO;
  ctx.shadowOffsetY = s * SHADOW_OFFSET_RATIO;
}

function clearShadow(ctx) {
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
}

// Double-line stroke: full-width stroke with middle erased,
// producing two parallel lines via offscreen canvas compositing.
function drawDoubleStroke(ctx, p, bounds, buildPathFn) {
  const alpha = (p.opacity ?? 100) / 100;
  const lw = p.lineWidth || 1;
  const gap = Math.max(2, lw * 0.3);
  const shadowPad = p.shadow ? Math.ceil(Math.min(Math.max(lw, 1) * 0.6, 20) + Math.max(lw, 1) * 0.12) * 2 : 0;
  const pad = Math.ceil(lw * 3) + shadowPad;
  const offW = Math.ceil(bounds.width + pad);
  const offH = Math.ceil(bounds.height + pad);
  const offCanvas = document.createElement('canvas');
  offCanvas.width = offW;
  offCanvas.height = offH;
  const octx = offCanvas.getContext('2d');
  octx.translate(-bounds.x + pad / 2, -bounds.y + pad / 2);

  octx.lineCap = 'butt';
  octx.lineJoin = 'round';
  octx.strokeStyle = p.color;
  octx.lineWidth = lw;
  applyShadow(octx, p, lw);
  buildPathFn(octx);
  octx.stroke();
  clearShadow(octx);

  octx.globalCompositeOperation = 'destination-out';
  octx.lineWidth = gap;
  octx.strokeStyle = 'rgba(0,0,0,1)';
  buildPathFn(octx);
  octx.stroke();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(offCanvas, bounds.x - pad / 2, bounds.y - pad / 2);
  ctx.restore();
}

// Render filled shape to offscreen canvas at full opacity,
// then blit with alpha — avoids stroke/fill overlap double-blending.
function drawFilledShape(ctx, p, buildPath) {
  const alpha = (p.opacity ?? 100) / 100;
  const shadowPad = p.shadow ? Math.ceil(Math.min(Math.max(p.lineWidth, 1) * 0.6, 20) + Math.max(p.lineWidth, 1) * 0.12) * 2 : 0;
  const pad = Math.ceil(p.lineWidth * 3) + shadowPad;
  const offW = Math.ceil(p.width + pad);
  const offH = Math.ceil(p.height + pad);
  const offCanvas = document.createElement('canvas');
  offCanvas.width = offW;
  offCanvas.height = offH;
  const octx = offCanvas.getContext('2d');
  octx.translate(-p.x + pad / 2, -p.y + pad / 2);

  octx.lineCap = 'round';
  applyLineStyle(octx, p.lineStyle, p.lineWidth);
  octx.strokeStyle = p.color;
  octx.fillStyle = p.color;
  octx.lineWidth = p.lineWidth;
  applyShadow(octx, p, p.lineWidth);
  buildPath(octx);
  octx.fill();
  octx.stroke();
  clearShadow(octx);
  octx.setLineDash([]);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(offCanvas, p.x - pad / 2, p.y - pad / 2);
  ctx.restore();
}

function drawRectangleAnnotation(ctx, p) {
  const alpha = (p.opacity ?? 100) / 100;
  const r = p.cornerRadius || 0;
  const { x, y, width, height } = p;
  const buildPath = (c) => {
    if (r > 0) roundRectPath(c, x, y, width, height, r);
    else { c.beginPath(); c.rect(x, y, width, height); }
  };

  if (p.lineStyle === 'double') {
    if (p.fill) {
      applyOpacity(ctx, p, () => {
        ctx.fillStyle = p.color;
        applyShadow(ctx, p, p.lineWidth);
        buildPath(ctx);
        ctx.fill();
        clearShadow(ctx);
      });
    }
    drawDoubleStroke(ctx, p, p, buildPath);
    return;
  }

  if (p.fill && alpha < 1) {
    drawFilledShape(ctx, p, buildPath);
    return;
  }

  applyOpacity(ctx, p, () => {
    ctx.lineCap = 'round';
    applyLineStyle(ctx, p.lineStyle, p.lineWidth);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.lineWidth;
    if (p.fill) ctx.fillStyle = p.color;
    applyShadow(ctx, p, p.lineWidth);
    buildPath(ctx);
    ctx.stroke();
    if (p.fill) ctx.fill();
    clearShadow(ctx);
    ctx.setLineDash([]);
  });
}

function drawEllipseAnnotation(ctx, p) {
  const alpha = (p.opacity ?? 100) / 100;
  const { x, y, width, height } = p;
  const buildPath = (c) => {
    c.beginPath();
    c.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  };

  if (p.lineStyle === 'double') {
    if (p.fill) {
      applyOpacity(ctx, p, () => {
        ctx.fillStyle = p.color;
        applyShadow(ctx, p, p.lineWidth);
        buildPath(ctx);
        ctx.fill();
        clearShadow(ctx);
      });
    }
    drawDoubleStroke(ctx, p, p, buildPath);
    return;
  }

  if (p.fill && alpha < 1) {
    drawFilledShape(ctx, p, buildPath);
    return;
  }

  applyOpacity(ctx, p, () => {
    ctx.lineCap = 'round';
    applyLineStyle(ctx, p.lineStyle, p.lineWidth);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = p.lineWidth;
    if (p.fill) ctx.fillStyle = p.color;
    applyShadow(ctx, p, p.lineWidth);
    buildPath(ctx);
    ctx.stroke();
    if (p.fill) ctx.fill();
    clearShadow(ctx);
    ctx.setLineDash([]);
  });
}

function drawPencilAnnotation(ctx, p) {
  if (!p.points || p.points.length < 2) return;

  if (p.lineStyle === 'double') {
    const pts = p.points;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const pt of pts) {
      if (pt.x < minX) minX = pt.x; if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x; if (pt.y > maxY) maxY = pt.y;
    }
    const bounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    const buildPath = (c) => {
      c.beginPath();
      c.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    };
    drawDoubleStroke(ctx, p, bounds, buildPath);
    return;
  }

  applyOpacity(ctx, p, () => {
  applyLineStyle(ctx, p.lineStyle, p.lineWidth);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  applyShadow(ctx, p, p.lineWidth);
  ctx.beginPath();
  ctx.moveTo(p.points[0].x, p.points[0].y);
  for (let i = 1; i < p.points.length; i++) {
    ctx.lineTo(p.points[i].x, p.points[i].y);
  }
  ctx.stroke();
  clearShadow(ctx);
  ctx.setLineDash([]);
  }); // applyOpacity
}

function drawArrowAnnotation(ctx, p) {
  const { startPoint, endPoint, arrowStyle, lineWidth: lw } = p;
  const sx = startPoint.x, sy = startPoint.y;
  const ex = endPoint.x, ey = endPoint.y;
  const angle = Math.atan2(ey - sy, ex - sx);
  const headLen = lw * ARROW_HEAD_LW_MULT;

  if (p.lineStyle === 'double') {
    const minX = Math.min(sx, ex), minY = Math.min(sy, ey);
    const bounds = { x: minX, y: minY, width: Math.abs(ex - sx) || 1, height: Math.abs(ey - sy) || 1 };
    const buildShaft = (c) => { c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); };
    drawDoubleStroke(ctx, p, bounds, buildShaft);
    applyOpacity(ctx, p, () => {
      ctx.strokeStyle = p.color;
      ctx.fillStyle = p.color;
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
      applyShadow(ctx, p, lw);
      if (arrowStyle === 'line') {
        const perpX = Math.cos(angle + Math.PI / 2), perpY = Math.sin(angle + Math.PI / 2);
        const barH = lw * ARROW_BAR_HEIGHT_MULT;
        ctx.beginPath();
        ctx.moveTo(sx + perpX * barH / 2, sy + perpY * barH / 2);
        ctx.lineTo(sx - perpX * barH / 2, sy - perpY * barH / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ex + perpX * barH / 2, ey + perpY * barH / 2);
        ctx.lineTo(ex - perpX * barH / 2, ey - perpY * barH / 2);
        ctx.stroke();
      } else {
        if (arrowStyle === 'single' || arrowStyle === 'double') {
          drawArrowHead(ctx, ex, ey, angle, headLen);
        }
        if (arrowStyle === 'double') {
          drawArrowHead(ctx, sx, sy, angle + Math.PI, headLen);
        }
      }
      clearShadow(ctx);
    });
    return;
  }

  // Render entire arrow to offscreen canvas, then blit with shadow —
  // prevents double-shadow in the line↔head overlap zone
  applyOpacity(ctx, p, () => {
    const pad = Math.ceil(lw * 5);
    const minX = Math.min(sx, ex) - pad, minY = Math.min(sy, ey) - pad;
    const offW = Math.abs(ex - sx) + pad * 2, offH = Math.abs(ey - sy) + pad * 2;
    const offCanvas = document.createElement('canvas');
    offCanvas.width = Math.max(offW, 1);
    offCanvas.height = Math.max(offH, 1);
    const oc = offCanvas.getContext('2d');
    oc.translate(-minX, -minY);

    applyLineStyle(oc, p.lineStyle, lw);
    oc.strokeStyle = p.color;
    oc.fillStyle = p.color;
    oc.lineWidth = lw;
    oc.lineCap = 'round';

    if (arrowStyle === 'taper') {
      // Tapered shaft: filled triangle from point at start to full width at end
      const perpX = Math.cos(angle + Math.PI / 2), perpY = Math.sin(angle + Math.PI / 2);
      oc.beginPath();
      oc.moveTo(sx, sy);
      oc.lineTo(ex + perpX * lw / 2, ey + perpY * lw / 2);
      oc.lineTo(ex - perpX * lw / 2, ey - perpY * lw / 2);
      oc.closePath();
      oc.fill();
      drawArrowHead(oc, ex, ey, angle, headLen);
    } else {
      oc.beginPath();
      oc.moveTo(sx, sy);
      oc.lineTo(ex, ey);
      oc.stroke();

      if (arrowStyle === 'line') {
      const perpX = Math.cos(angle + Math.PI / 2), perpY = Math.sin(angle + Math.PI / 2);
      const barH = lw * ARROW_BAR_HEIGHT_MULT;
      oc.beginPath();
      oc.moveTo(sx + perpX * barH / 2, sy + perpY * barH / 2);
      oc.lineTo(sx - perpX * barH / 2, sy - perpY * barH / 2);
      oc.stroke();
      oc.beginPath();
      oc.moveTo(ex + perpX * barH / 2, ey + perpY * barH / 2);
      oc.lineTo(ex - perpX * barH / 2, ey - perpY * barH / 2);
      oc.stroke();
    } else {
      if (arrowStyle === 'single' || arrowStyle === 'double') {
        drawArrowHead(oc, ex, ey, angle, headLen);
      }
      if (arrowStyle === 'double') {
        drawArrowHead(oc, sx, sy, angle + Math.PI, headLen);
      }
    }

    } // else (non-taper)

    oc.setLineDash([]);
    applyShadow(ctx, p, lw);
    ctx.drawImage(offCanvas, minX, minY);
    clearShadow(ctx);
  });
}

function drawArrowHead(ctx, x, y, angle, headLen) {
  // Coordinates extracted from reference SVG (arrow.svg):
  //   viewBox 0 0 540 675, stroke-width 50, shaft end X=335.4, center Y=330.7
  //   Arrowhead path: M284.6,240.7 l32.5,90 l-32.5,90 l212.5,-90 Z
  //   Vertices relative to shaft endpoint & center, in units of lineWidth:
  //     upperWing  (-1.016, -1.8)   back center (-0.366, 0)
  //     lowerWing  (-1.016, +1.8)   tip         (+3.234, 0)
  //   headLen = 4.25 × lw
  const cosA = Math.cos(angle), sinA = Math.sin(angle);
  const s = headLen / 4.25; // = lineWidth

  const upperWing = { x: s * -1.016, y: s * -1.8 };
  const backCtr   = { x: s * -0.366, y: 0 };
  const lowerWing = { x: s * -1.016, y: s *  1.8 };
  const tip       = { x: s *  3.234, y: 0 };

  const pt = p => ({
    x: x + p.x * cosA - p.y * sinA,
    y: y + p.x * sinA + p.y * cosA,
  });

  ctx.beginPath();
  ctx.moveTo(pt(upperWing).x, pt(upperWing).y);
  ctx.lineTo(pt(backCtr).x, pt(backCtr).y);
  ctx.lineTo(pt(lowerWing).x, pt(lowerWing).y);
  ctx.lineTo(pt(tip).x, pt(tip).y);
  ctx.closePath();
  ctx.fill();
}

function drawSequenceAnnotation(ctx, p) {
  applyOpacity(ctx, p, () => {
  const { x, y, number, numberStyle, size } = p;
  const label = formatNumber(number, numberStyle);

  const radius = Math.max(size / 2, SEQ_MIN_RADIUS);
  const cx = x + radius;
  const cy = y + radius;
  const lineW = Math.max(radius * SEQ_LINE_W_RATIO, SEQ_MIN_LINE_W);
  applyShadow(ctx, p, size * SEQ_SHADOW_RATIO);
  ctx.beginPath();
  ctx.arc(cx, cy, radius - lineW / 2, 0, Math.PI * 2);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = lineW;
  ctx.stroke();

  const maxW = (radius - lineW) * SEQ_MAX_TEXT_RATIO;
  let fontSize = radius * SEQ_FONT_SCALE;
  ctx.font = `bold ${fontSize}px sans-serif`;
  const measured = ctx.measureText(label).width;
  if (measured > maxW) {
    fontSize = fontSize * maxW / measured;
  }
  ctx.fillStyle = p.color;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
  clearShadow(ctx);
  }); // applyOpacity
}

function drawTextAnnotation(ctx, p) {
  applyOpacity(ctx, p, () => {
  const { x, y, text, bold, italic, fontFamily, fontSize } = p;
  let fontStyle = '';
  if (bold) fontStyle += 'bold ';
  if (italic) fontStyle += 'italic ';
  ctx.font = `${fontStyle}${fontSize}px ${fontFamily}`;
  ctx.fillStyle = p.color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  applyShadow(ctx, p, fontSize * TEXT_SHADOW_RATIO);
  const lines = text.split('\n');
  const lineHeight = fontSize * TEXT_LINE_HEIGHT_RATIO;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], x, y + i * lineHeight);
  }
  clearShadow(ctx);
  }); // applyOpacity
}

function drawStampAnnotation(ctx, p) {
  applyOpacity(ctx, p, () => {
  const { x, y, shape, size } = p;
  ctx.strokeStyle = p.color;
  ctx.fillStyle = p.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * STAMP_LINE_W_RATIO;
  applyShadow(ctx, p, size * STAMP_LINE_W_RATIO);

  if (shape === 'check') {
    ctx.beginPath();
    ctx.moveTo(x + size * CHECK_START.x, y + size * CHECK_START.y);
    ctx.lineTo(x + size * CHECK_MID.x, y + size * CHECK_MID.y);
    ctx.lineTo(x + size * CHECK_END.x, y + size * CHECK_END.y);
    ctx.stroke();
  } else if (shape === 'x') {
    const pad = size * X_PAD_RATIO;
    ctx.beginPath();
    ctx.moveTo(x + pad, y + pad);
    ctx.lineTo(x + size - pad, y + size - pad);
    ctx.moveTo(x + size - pad, y + pad);
    ctx.lineTo(x + pad, y + size - pad);
    ctx.stroke();
  }
  clearShadow(ctx);
  }); // applyOpacity
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
