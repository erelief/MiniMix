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
  { value: 'arabic', label: '1, 2, 3 …' },
  { value: 'roman', label: 'I, II, III …' },
  { value: 'alpha-upper', label: 'A, B, C …' },
  { value: 'alpha-lower', label: 'a, b, c …' },
  { value: 'chinese', label: '一, 二, 三 …' },
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
      lineWidth: 10,
      cornerRadius: 8,
      color: '#FF0000',
    },
    pencil: {
      lineStyle: 'solid',
      lineWidth: 10,
      color: '#FF0000',
    },
    arrow: {
      arrowStyle: 'single',
      lineStyle: 'solid',
      lineWidth: 10,
      color: '#FF0000',
    },
    sequence: {
      nextNumber: 1,
      numberStyle: 'arabic',
      fontSize: 40,
      color: '#FF0000',
    },
    text: {
      bold: false,
      italic: false,
      fontFamily: 'sans-serif',
      fontSize: 24,
      color: '#FF0000',
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
export function applyLineStyle(ctx, lineStyle, lineWidth) {
  const lw = lineWidth || 1;
  // 用 sqrt 缩放：lw=1→1, lw=10→~3.2, lw=30→~5.5，不会过度放大
  const s = Math.sqrt(lw);
  // 点线的 dot 长度不超过 lineWidth，配合 round cap 保持圆形
  const dotLen = Math.min(3 * s, lw);
  switch (lineStyle) {
    case 'solid':
      ctx.setLineDash([]);
      break;
    case 'dashed':
      ctx.setLineDash([12 * s, 6 * s]);
      break;
    case 'dotted':
      ctx.setLineDash([dotLen, 6 * s]);
      break;
    case 'dash-dot':
      ctx.setLineDash([12 * s, 4 * s, Math.min(3 * s, lw), 4 * s]);
      break;
    case 'dash-dot-dot':
      ctx.setLineDash([12 * s, 4 * s, Math.min(3 * s, lw), 4 * s, Math.min(3 * s, lw), 4 * s]);
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
  ctx.lineCap = 'round';
  applyLineStyle(ctx, p.lineStyle, p.lineWidth);
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
  ctx.lineCap = 'round';
  applyLineStyle(ctx, p.lineStyle, p.lineWidth);
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
  applyLineStyle(ctx, p.lineStyle, p.lineWidth);
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
  applyLineStyle(ctx, p.lineStyle, p.lineWidth);
  ctx.strokeStyle = p.color;
  ctx.fillStyle = p.color;
  ctx.lineWidth = p.lineWidth;
  ctx.lineCap = 'round';

  const { startPoint, endPoint, arrowStyle, lineWidth: lw } = p;
  const sx = startPoint.x, sy = startPoint.y;
  const ex = endPoint.x, ey = endPoint.y;

  // Draw line（round cap 在非箭头端正常显示，箭头端被三角底边覆盖）
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  const angle = Math.atan2(endPoint.y - startPoint.y, endPoint.x - startPoint.x);
  const headLen = 12 + lw * 2;

  if (arrowStyle === 'line') {
    // 线段头 |——|：两端画短竖线，用原始端点
    const perpX = Math.cos(angle + Math.PI / 2), perpY = Math.sin(angle + Math.PI / 2);
    const barH = lw * 2.5;
    ctx.beginPath();
    ctx.moveTo(startPoint.x + perpX * barH / 2, startPoint.y + perpY * barH / 2);
    ctx.lineTo(startPoint.x - perpX * barH / 2, startPoint.y - perpY * barH / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(endPoint.x + perpX * barH / 2, endPoint.y + perpY * barH / 2);
    ctx.lineTo(endPoint.x - perpX * barH / 2, endPoint.y - perpY * barH / 2);
    ctx.stroke();
  } else {
    if (arrowStyle === 'single' || arrowStyle === 'double') {
      drawArrowHead(ctx, endPoint.x, endPoint.y, angle, headLen);
    }
    if (arrowStyle === 'double') {
      drawArrowHead(ctx, startPoint.x, startPoint.y, angle + Math.PI, headLen);
    }
  }

  ctx.setLineDash([]);
}

function drawArrowHead(ctx, x, y, angle, headLen) {
  // 三角底边中心对准线段端点(x,y)，尖端向前延伸覆盖 round cap
  // 保持原 30° 夹角形状：底边宽 = headLen, 底边到尖距离 = headLen * cos(30°)
  const tipX = x + headLen * Math.cos(Math.PI / 6) * Math.cos(angle);
  const tipY = y + headLen * Math.cos(Math.PI / 6) * Math.sin(angle);
  const hw = headLen * Math.sin(Math.PI / 6); // 半底边宽
  // 底边两端（垂直于方向）
  const bx1 = x - hw * Math.sin(angle);
  const by1 = y + hw * Math.cos(angle);
  const bx2 = x + hw * Math.sin(angle);
  const by2 = y - hw * Math.cos(angle);

  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(bx1, by1);
  ctx.lineTo(bx2, by2);
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
  ctx.lineWidth = Math.max(fontSize * 0.1, 2);
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
