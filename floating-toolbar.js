// floating-toolbar.js

import { createIcons, GripVertical, Square, Pencil, ArrowRight, Hash, Type, Eraser, Circle, Bold, Italic } from 'lucide';
import { TOOLS, LINE_STYLES, ARROW_STYLES, NUMBER_STYLES, COLOR_PRESETS } from './annotation.js';
import { createSlider } from './slider-widget.js';

const TOOL_LABELS = {
  scaling: '编辑画布',
  geometry: '几何图形',
  pencil: '铅笔',
  arrow: '箭头',
  sequence: '序列号',
  text: '文本',
  eraser: '橡皮擦',
};

const TOOL_ICON_NAMES = {
  scaling: 'scale',
  geometry: 'square',
  pencil: 'pencil',
  arrow: 'arrow-right',
  sequence: 'hash',
  text: 'type',
  eraser: 'eraser',
};

let toolbarEl = null;
let submenuEl = null;
let activeSubmenuTool = null;
let sliderWidgets = {};
let isDragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
let activeTool = 'scaling';
let onToolChangeCallback = null;
let onToolSettingsChangeCallback = null;
let getSettingsFn = null;

/**
 * Create and mount the floating toolbar.
 */
export function createFloatingToolbar(parent, initialTool, getSettings, onToolChange, onToolSettingsChange) {
  activeTool = initialTool;
  getSettingsFn = getSettings;
  onToolChangeCallback = onToolChange;
  onToolSettingsChangeCallback = onToolSettingsChange;

  toolbarEl = document.createElement('div');
  toolbarEl.id = 'annotation-toolbar';
  toolbarEl.className = 'annotation-toolbar';

  // Grip handle
  const gripEl = document.createElement('div');
  gripEl.className = 'annotation-toolbar-grip';
  gripEl.innerHTML = '<i data-lucide="grip-vertical"></i>';
  toolbarEl.appendChild(gripEl);

  // Tool buttons
  const btnsContainer = document.createElement('div');
  btnsContainer.className = 'annotation-toolbar-btns';

  const SCALING_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M14 15H9v-5"/><path d="M16 3h5v5"/><path d="M21 3 9 15"/></svg>';

  TOOLS.forEach(tool => {
    const btn = document.createElement('button');
    btn.className = 'annotation-tool-btn';
    btn.title = TOOL_LABELS[tool];
    btn.innerHTML = tool === 'scaling' ? SCALING_SVG : `<i data-lucide="${TOOL_ICON_NAMES[tool]}"></i>`;
    btn.dataset.tool = tool;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (activeTool === tool) {
        // Toggle submenu for active tool (scaling has no submenu)
        if (tool !== 'scaling') toggleSubmenu(tool);
      } else {
        setActiveTool(tool);
        // Auto-open submenu when switching tools (scaling has no submenu)
        if (tool !== 'scaling') toggleSubmenu(tool);
      }
    });
    btnsContainer.appendChild(btn);
  });

  toolbarEl.appendChild(btnsContainer);
  parent.appendChild(toolbarEl);

  // Initialize Lucide icons inside toolbar
  createIcons({
    icons: { GripVertical, Square, Pencil, ArrowRight, Hash, Type, Eraser },
    root: toolbarEl,
  });

  // Drag behavior
  gripEl.addEventListener('mousedown', onGripMouseDown);
  document.addEventListener('mousemove', onGripMouseMove);
  document.addEventListener('mouseup', onGripMouseUp);

  updateActiveToolUI();

  return {
    updateActiveTool: (t) => { activeTool = t; updateActiveToolUI(); },
    setPosition,
    show,
    hide,
    destroy,
    getToolbarEl: () => toolbarEl,
  };
}

function setActiveTool(tool) {
  if (activeTool === tool) return;
  activeTool = tool;
  updateActiveToolUI();
  if (onToolChangeCallback) onToolChangeCallback(tool);
}

function updateActiveToolUI() {
  if (!toolbarEl) return;
  toolbarEl.querySelectorAll('.annotation-tool-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tool === activeTool);
  });
}

function setPosition(x, y) {
  if (!toolbarEl) return;
  toolbarEl.style.left = x + 'px';
  toolbarEl.style.top = y + 'px';
}

function show() {
  if (toolbarEl) toolbarEl.style.display = 'flex';
}

function hide() {
  if (toolbarEl) toolbarEl.style.display = 'none';
}

function destroy() {
  closeSubmenu();
  if (toolbarEl) {
    toolbarEl.remove();
    toolbarEl = null;
  }
  document.removeEventListener('mousemove', onGripMouseMove);
  document.removeEventListener('mouseup', onGripMouseUp);
}

function onGripMouseDown(e) {
  if (e.button !== 0) return;
  isDragging = true;
  const rect = toolbarEl.getBoundingClientRect();
  dragOffsetX = e.clientX - rect.left;
  dragOffsetY = e.clientY - rect.top;
  toolbarEl.classList.add('dragging');
  e.preventDefault();
}

function onGripMouseMove(e) {
  if (!isDragging) return;
  // 转换为 workspace 相对坐标（toolbar 是 workspace 内的 absolute 元素）
  const parentRect = toolbarEl.parentElement.getBoundingClientRect();
  const x = e.clientX - dragOffsetX - parentRect.left;
  const y = e.clientY - dragOffsetY - parentRect.top;
  toolbarEl.style.left = x + 'px';
  toolbarEl.style.top = y + 'px';
}

function onGripMouseUp() {
  if (isDragging) {
    isDragging = false;
    if (toolbarEl) toolbarEl.classList.remove('dragging');
  }
}

// --- Submenu system ---

function toggleSubmenu(tool) {
  if (activeSubmenuTool === tool && submenuEl) {
    closeSubmenu();
    return;
  }
  closeSubmenu();
  activeSubmenuTool = tool;
  const settings = getSettingsFn ? getSettingsFn() : {};
  submenuEl = buildSubmenu(tool, settings);
  toolbarEl.appendChild(submenuEl);
}

export function closeSubmenu() {
  Object.values(sliderWidgets).forEach(s => s.destroy());
  sliderWidgets = {};
  if (submenuEl) {
    submenuEl.remove();
    submenuEl = null;
  }
  activeSubmenuTool = null;
}

function buildSubmenu(tool, settings) {
  const panel = document.createElement('div');
  panel.className = 'annotation-submenu';

  const onChange = (toolKey, key, value) => {
    if (onToolSettingsChangeCallback) onToolSettingsChangeCallback(toolKey, key, value);
  };

  switch (tool) {
    case 'geometry':
      buildGeometryMenu(panel, settings, onChange);
      break;
    case 'pencil':
      buildPencilMenu(panel, settings, onChange);
      break;
    case 'arrow':
      buildArrowMenu(panel, settings, onChange);
      break;
    case 'sequence':
      buildSequenceMenu(panel, settings, onChange);
      break;
    case 'text':
      buildTextMenu(panel, settings, onChange);
      break;
    case 'eraser':
      buildEraserMenu(panel, settings, onChange);
      break;
  }

  return panel;
}

// --- Shared submenu row builders ---

function addDivider(panel) {
  const div = document.createElement('div');
  div.className = 'annotation-submenu-divider';
  panel.appendChild(div);
}

function addColorRow(panel, currentColor, onChange) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const label = document.createElement('span');
  label.className = 'annotation-submenu-label';
  label.textContent = '颜色';
  row.appendChild(label);

  const swatches = document.createElement('div');
  swatches.className = 'annotation-color-swatches';

  COLOR_PRESETS.forEach(c => {
    const swatch = document.createElement('button');
    swatch.className = 'annotation-color-swatch';
    swatch.style.backgroundColor = c;
    if (c === '#FFFFFF') swatch.style.border = '1px solid var(--border-color)';
    if (c === currentColor) swatch.classList.add('active');
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      swatches.querySelectorAll('.annotation-color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      onChange(activeSubmenuTool, 'color', c);
    });
    swatches.appendChild(swatch);
  });

  row.appendChild(swatches);
  panel.appendChild(row);
}

function addLineStyleRow(panel, currentStyle, onChange) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const label = document.createElement('span');
  label.className = 'annotation-submenu-label';
  label.textContent = '线条样式';
  row.appendChild(label);

  const select = document.createElement('select');
  select.className = 'annotation-submenu-select';
  LINE_STYLES.forEach(ls => {
    const opt = document.createElement('option');
    opt.value = ls.value;
    opt.textContent = ls.label;
    if (ls.value === currentStyle) opt.selected = true;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => onChange(activeSubmenuTool, 'lineStyle', select.value));
  row.appendChild(select);
  panel.appendChild(row);
}

function addSliderRow(panel, label, min, max, value, step, toolKey, settingKey, onChange) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';

  const labelEl = document.createElement('span');
  labelEl.className = 'annotation-submenu-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const valueDisplay = document.createElement('span');
  valueDisplay.className = 'annotation-submenu-value';
  valueDisplay.textContent = value;
  row.appendChild(valueDisplay);

  panel.appendChild(row);

  const sliderContainer = document.createElement('div');
  sliderContainer.className = 'annotation-slider-container';
  panel.appendChild(sliderContainer);

  const sliderKey = toolKey + '_' + settingKey;
  const slider = createSlider({
    container: sliderContainer,
    min,
    max,
    step,
    value,
    onChange: (v) => {
      valueDisplay.textContent = v;
      onChange(toolKey, settingKey, v);
    },
  });
  sliderWidgets[sliderKey] = slider;
}

function addCheckboxRow(panel, label, checked, toolKey, settingKey, onChange) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'annotation-submenu-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', () => onChange(toolKey, settingKey, checkbox.checked));
  row.appendChild(checkbox);
  panel.appendChild(row);
}

function addSelectRow(panel, label, options, currentValue, toolKey, settingKey, onChange) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'annotation-submenu-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const select = document.createElement('select');
  select.className = 'annotation-submenu-select';
  options.forEach(opt => {
    const optionEl = document.createElement('option');
    optionEl.value = opt.value;
    optionEl.textContent = opt.label;
    if (opt.value === currentValue) optionEl.selected = true;
    select.appendChild(optionEl);
  });
  select.addEventListener('change', () => onChange(toolKey, settingKey, select.value));
  row.appendChild(select);
  panel.appendChild(row);
}

function addButtonRow(panel, label, btnLabel, onClick) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'annotation-submenu-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const btn = document.createElement('button');
  btn.className = 'annotation-submenu-btn';
  btn.textContent = btnLabel;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  row.appendChild(btn);
  panel.appendChild(row);
}

// --- Tool-specific submenu builders ---

function buildGeometryMenu(panel, settings, onChange) {
  const s = settings.geometry;
  if (!s) return;

  // Shape toggle
  const shapeRow = document.createElement('div');
  shapeRow.className = 'annotation-submenu-row';
  const shapeLabel = document.createElement('span');
  shapeLabel.className = 'annotation-submenu-label';
  shapeLabel.textContent = '形状';
  shapeRow.appendChild(shapeLabel);
  const shapeToggle = document.createElement('div');
  shapeToggle.className = 'annotation-shape-toggle';
  const rectBtn = document.createElement('button');
  rectBtn.className = 'annotation-shape-btn' + (s.shape !== 'ellipse' ? ' active' : '');
  rectBtn.innerHTML = '<i data-lucide="square"></i>';
  rectBtn.title = '矩形';
  const ellipseBtn = document.createElement('button');
  ellipseBtn.className = 'annotation-shape-btn' + (s.shape === 'ellipse' ? ' active' : '');
  ellipseBtn.innerHTML = '<i data-lucide="circle"></i>';
  ellipseBtn.title = '椭圆';
  rectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rectBtn.classList.add('active');
    ellipseBtn.classList.remove('active');
    onChange('geometry', 'shape', 'rounded-rect');
  });
  ellipseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ellipseBtn.classList.add('active');
    rectBtn.classList.remove('active');
    onChange('geometry', 'shape', 'ellipse');
  });
  shapeToggle.appendChild(rectBtn);
  shapeToggle.appendChild(ellipseBtn);
  shapeRow.appendChild(shapeToggle);
  panel.appendChild(shapeRow);

  createIcons({ icons: { Square, Circle }, root: panel });

  addDivider(panel);

  addCheckboxRow(panel, '填充', s.fill, 'geometry', 'fill', onChange);
  addDivider(panel);
  addLineStyleRow(panel, s.lineStyle, onChange);
  addSliderRow(panel, '线条粗细', 1, 75, s.lineWidth, 1, 'geometry', 'lineWidth', onChange);

  if (s.shape !== 'ellipse') {
    addSliderRow(panel, '圆角角度', 0, 90, s.cornerRadius, 1, 'geometry', 'cornerRadius', onChange);
  }

  addDivider(panel);
  addColorRow(panel, s.color, onChange);
}

function buildPencilMenu(panel, settings, onChange) {
  const s = settings.pencil;
  if (!s) return;
  addLineStyleRow(panel, s.lineStyle, onChange);
  addSliderRow(panel, '线条粗细', 1, 75, s.lineWidth, 1, 'pencil', 'lineWidth', onChange);
  addDivider(panel);
  addColorRow(panel, s.color, onChange);
}

function buildArrowMenu(panel, settings, onChange) {
  const s = settings.arrow;
  if (!s) return;
  addSelectRow(panel, '箭头样式', ARROW_STYLES, s.arrowStyle, 'arrow', 'arrowStyle', onChange);
  addLineStyleRow(panel, s.lineStyle, onChange);
  addSliderRow(panel, '线条粗细', 1, 75, s.lineWidth, 1, 'arrow', 'lineWidth', onChange);
  addDivider(panel);
  addColorRow(panel, s.color, onChange);
}

function buildSequenceMenu(panel, settings, onChange) {
  const s = settings.sequence;
  if (!s) return;
  addSliderRow(panel, '起始数字', 1, 9999, s.nextNumber, 1, 'sequence', 'nextNumber', onChange);
  addSelectRow(panel, '样式', NUMBER_STYLES, s.numberStyle, 'sequence', 'numberStyle', onChange);
  addSliderRow(panel, '字号', 5, 72, s.fontSize, 1, 'sequence', 'fontSize', onChange);
  addDivider(panel);
  addColorRow(panel, s.color, onChange);
}

function buildTextMenu(panel, settings, onChange) {
  const s = settings.text;
  if (!s) return;

  // Bold + Italic row
  const styleRow = document.createElement('div');
  styleRow.className = 'annotation-submenu-row';
  const styleLabel = document.createElement('span');
  styleLabel.className = 'annotation-submenu-label';
  styleLabel.textContent = '样式';
  styleRow.appendChild(styleLabel);
  const styleBtns = document.createElement('div');
  styleBtns.className = 'annotation-style-btns';
  const boldBtn = document.createElement('button');
  boldBtn.className = 'annotation-style-btn' + (s.bold ? ' active' : '');
  boldBtn.innerHTML = '<i data-lucide="bold"></i>';
  boldBtn.title = '加粗';
  boldBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    boldBtn.classList.toggle('active');
    onChange('text', 'bold', !s.bold);
  });
  const italicBtn = document.createElement('button');
  italicBtn.className = 'annotation-style-btn' + (s.italic ? ' active' : '');
  italicBtn.innerHTML = '<i data-lucide="italic"></i>';
  italicBtn.title = '斜体';
  italicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    italicBtn.classList.toggle('active');
    onChange('text', 'italic', !s.italic);
  });
  styleBtns.appendChild(boldBtn);
  styleBtns.appendChild(italicBtn);
  styleRow.appendChild(styleBtns);
  panel.appendChild(styleRow);

  createIcons({ icons: { Bold, Italic }, root: panel });

  // Font family
  const fonts = [
    { value: 'sans-serif', label: 'Sans Serif' },
    { value: 'serif', label: 'Serif' },
    { value: 'monospace', label: 'Monospace' },
  ];
  addSelectRow(panel, '字体', fonts, s.fontFamily, 'text', 'fontFamily', onChange);
  addSliderRow(panel, '字号', 5, 72, s.fontSize, 1, 'text', 'fontSize', onChange);
  addDivider(panel);
  addColorRow(panel, s.color, onChange);
}

function buildEraserMenu(panel, settings, onChange) {
  const s = settings.eraser;
  if (!s) return;
  addSliderRow(panel, '线条粗细', 5, 100, s.lineWidth, 1, 'eraser', 'lineWidth', onChange);
  addDivider(panel);
  addButtonRow(panel, '清除所有标记', '一键清除', () => {
    const event = new CustomEvent('annotation-clear-all');
    document.dispatchEvent(event);
  });
}

export { activeTool };
