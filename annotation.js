// src/annotation.js

// --- Annotation unique ID counter ---
let nextAnnotationId = 1;
export function resetAnnotationIdCounter() {
  nextAnnotationId = 1;
}

// --- Tool definitions ---
export const TOOLS = ['scaling', 'geometry', 'pencil', 'arrow', 'sequence', 'text', 'eraser'];

// Line style options (5 common styles)
export const LINE_STYLES = [
  { value: 'solid', label: '实线' },
  { value: 'dashed', label: '虚线' },
  { value: 'dotted', label: '点线' },
  { value: 'dash-dot', label: '点划线' },
  { value: 'dash-dot-dot', label: '双点划线' },
];

// Arrow style options
export const ARROW_STYLES = [
  { value: 'single', label: '单边箭头' },
  { value: 'double', label: '双边箭头' },
  { value: 'line', label: '线段头' },
  { value: 'none', label: '无头' },
];

// Number style options
export const NUMBER_STYLES = [
  { value: 'arabic', label: '阿拉伯数字' },
  { value: 'roman', label: '罗马数字' },
  { value: 'alpha-upper', label: '大写字母' },
  { value: 'alpha-lower', label: '小写字母' },
  { value: 'chinese', label: '汉字数字' },
];

// 9 color presets: 7 rainbow + black + white
export const COLOR_PRESETS = [
  '#FF0000', '#FF7F00', '#FFFF00', '#00FF00',
  '#0000FF', '#4B0082', '#9400D3', '#000000', '#FFFFFF',
];

// --- Default tool settings (独立存储 per tool) ---
export function createDefaultToolSettings() {
  return {
    geometry: {
      shape: 'rounded-rect', // 'rounded-rect' | 'rect' | 'ellipse'
      fill: false,
      lineStyle: 'solid',
      lineWidth: 3,
      cornerRadius: 8,
      color: '#FF0000',
    },
    pencil: {
      lineStyle: 'solid',
      lineWidth: 3,
      color: '#FF0000',
    },
    arrow: {
      arrowStyle: 'single',
      lineStyle: 'solid',
      lineWidth: 3,
      color: '#FF0000',
    },
    sequence: {
      nextNumber: 1,
      numberStyle: 'arabic',
      fontSize: 24,
      color: '#FF0000',
    },
    text: {
      bold: false,
      italic: false,
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#FF0000',
    },
    eraser: {
      lineWidth: 20,
    },
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
export function createAnnotation(type, params, imageId) {
  return {
    id: nextAnnotationId++,
    type,
    imageId,
    params,
  };
}

// --- Drawing helpers (shared by canvas renderer) ---

/**
 * Apply line style (dash pattern) to a canvas context.
 */
export function applyLineStyle(ctx, lineStyle) {
  switch (lineStyle) {
    case 'solid':
      ctx.setLineDash([]);
      break;
    case 'dashed':
      ctx.setLineDash([12, 6]);
      break;
    case 'dotted':
      ctx.setLineDash([3, 6]);
      break;
    case 'dash-dot':
      ctx.setLineDash([12, 4, 3, 4]);
      break;
    case 'dash-dot-dot':
      ctx.setLineDash([12, 4, 3, 4, 3, 4]);
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
    case 'sequence':
      drawSequenceAnnotation(ctx, params);
      break;
    case 'text':
      drawTextAnnotation(ctx, params);
      break;
  }

  ctx.restore();
}

function drawRectangleAnnotation(ctx, p) {
  applyLineStyle(ctx, p.lineStyle);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.lineWidth;
  if (p.fill) {
    ctx.fillStyle = hexToRgba(p.color, 0.2);
  }
  const r = p.cornerRadius || 0;
  const { x, y, width, height } = p;
  if (r > 0) {
    roundRectPath(ctx, x, y, width, height, r);
  } else {
    ctx.beginPath();
    ctx.rect(x, y, width, height);
  }
  if (p.fill) ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawEllipseAnnotation(ctx, p) {
  applyLineStyle(ctx, p.lineStyle);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.lineWidth;
  if (p.fill) {
    ctx.fillStyle = hexToRgba(p.color, 0.2);
  }
  const { x, y, width, height } = p;
  ctx.beginPath();
  ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
  if (p.fill) ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPencilAnnotation(ctx, p) {
  if (!p.points || p.points.length < 2) return;
  applyLineStyle(ctx, p.lineStyle);
  ctx.strokeStyle = p.color;
  ctx.lineWidth = p.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(p.points[0].x, p.points[0].y);
  for (let i = 1; i < p.points.length; i++) {
    ctx.lineTo(p.points[i].x, p.points[i].y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawArrowAnnotation(ctx, p) {
  applyLineStyle(ctx, p.lineStyle);
  ctx.strokeStyle = p.color;
  ctx.fillStyle = p.color;
  ctx.lineWidth = p.lineWidth;
  ctx.lineCap = 'round';

  const { startPoint, endPoint, arrowStyle, lineWidth } = p;
  const sx = startPoint.x, sy = startPoint.y;
  const ex = endPoint.x, ey = endPoint.y;

  // Draw line
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  const angle = Math.atan2(ey - sy, ex - sx);
  const headLen = 12 + lineWidth * 2;

  if (arrowStyle === 'single' || arrowStyle === 'double') {
    drawArrowHead(ctx, ex, ey, angle, headLen);
  }
  if (arrowStyle === 'double') {
    drawArrowHead(ctx, sx, sy, angle + Math.PI, headLen);
  }

  ctx.setLineDash([]);
}

function drawArrowHead(ctx, x, y, angle, headLen) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(
    x - headLen * Math.cos(angle - Math.PI / 6),
    y - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    x - headLen * Math.cos(angle + Math.PI / 6),
    y - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
}

function drawSequenceAnnotation(ctx, p) {
  const { x, y, number, numberStyle, fontSize, color } = p;
  const label = formatNumber(number, numberStyle);

  // Draw hollow circle
  const radius = Math.max(fontSize * 0.8, 16);
  const cx = x + radius;
  const cy = y + radius;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Draw number inside
  ctx.fillStyle = color;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, cx, cy);
}

function drawTextAnnotation(ctx, p) {
  const { x, y, text, bold, italic, fontFamily, fontSize, color } = p;
  let fontStyle = '';
  if (bold) fontStyle += 'bold ';
  if (italic) fontStyle += 'italic ';
  ctx.font = `${fontStyle}${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(text, x, y);
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

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
