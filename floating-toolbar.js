// floating-toolbar.js

import { createIcons, GripVertical, Square, Pencil, ArrowRight, Hash, Type, Eraser, Trash2, Circle, Bold, Italic } from 'lucide';
import { TOOLS, LINE_STYLES, ARROW_STYLES, NUMBER_STYLES, COLOR_PRESETS } from './annotation.js';
import { createSlider } from './slider-widget.js';

const TOOL_LABELS = {
  scaling: '编辑画布',
  geometry: '几何图形',
  pencil: '铅笔',
  arrow: '箭头',
  sequence: '序列号',
  text: '文本',
  eraser: '删除',
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
  const DELETE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z"/><path d="m12 9 6 6"/><path d="m18 9-6 6"/></svg>';

  TOOLS.forEach(tool => {
    const btn = document.createElement('button');
    btn.className = 'annotation-tool-btn';
    btn.title = TOOL_LABELS[tool];
    if (tool === 'scaling') btn.innerHTML = SCALING_SVG;
    else if (tool === 'eraser') btn.innerHTML = DELETE_SVG;
    else btn.innerHTML = `<i data-lucide="${TOOL_ICON_NAMES[tool]}"></i>`;
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

  // 全局点击关闭自定义下拉选单（线条样式、箭头样式等）
  document.addEventListener('mousedown', () => closeAllCustomDropdowns());

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

  // 工具栏在 UI 下半部分时，子菜单向上弹出
  const parentRect = toolbarEl.parentElement.getBoundingClientRect();
  const toolbarRect = toolbarEl.getBoundingClientRect();
  const toolbarCenterY = toolbarRect.top + toolbarRect.height / 2 - parentRect.top;
  if (toolbarCenterY > parentRect.height / 2) {
    submenuEl.classList.add('pop-up');
  }

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

// 全局关闭所有自定义下拉选单
let _openCustomDropdowns = [];
function closeAllCustomDropdowns() {
  _openCustomDropdowns.forEach(d => { if (d) d.style.display = 'none'; });
  _openCustomDropdowns = [];
}

function addLineStyleRow(panel, currentStyle, onChange) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const label = document.createElement('span');
  label.className = 'annotation-submenu-label';
  label.textContent = '线条样式';
  row.appendChild(label);

  const wrapper = document.createElement('div');
  wrapper.className = 'annotation-linestyle-select';

  const trigger = document.createElement('button');
  trigger.className = 'annotation-linestyle-trigger';

  function makePreview(value) {
    const cvs = document.createElement('canvas');
    cvs.width = 48; cvs.height = 14;
    const ctx = cvs.getContext('2d');
    switch (value) {
      case 'solid': ctx.setLineDash([]); break;
      case 'dashed': ctx.setLineDash([10, 4]); break;
      case 'dotted': ctx.setLineDash([2, 3]); break;
      case 'dash-dot': ctx.setLineDash([8, 3, 2, 3]); break;
      case 'dash-dot-dot': ctx.setLineDash([8, 3, 2, 3, 2, 3]); break;
    }
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(48, 7); ctx.stroke();
    return cvs;
  }

  trigger.appendChild(makePreview(currentStyle));
  wrapper.appendChild(trigger);

  const dropdown = document.createElement('div');
  dropdown.className = 'annotation-linestyle-dropdown';
  LINE_STYLES.forEach(ls => {
    const item = document.createElement('div');
    item.className = 'annotation-linestyle-option' + (ls.value === currentStyle ? ' active' : '');
    item.appendChild(makePreview(ls.value));
    item.title = ls.label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onChange(activeSubmenuTool, 'lineStyle', ls.value);
      trigger.innerHTML = '';
      trigger.appendChild(makePreview(ls.value));
      dropdown.querySelectorAll('.annotation-linestyle-option').forEach(o => o.classList.remove('active'));
      item.classList.add('active');
      closeAllCustomDropdowns();
    });
    dropdown.appendChild(item);
  });
  wrapper.appendChild(dropdown);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllCustomDropdowns();
    dropdown.style.display = 'block';
    _openCustomDropdowns.push(dropdown);
  });

  wrapper.addEventListener('mousedown', (e) => e.stopPropagation());

  row.appendChild(wrapper);
  panel.appendChild(row);
}

function addArrowStyleRow(panel, currentStyle, onChange) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const label = document.createElement('span');
  label.className = 'annotation-submenu-label';
  label.textContent = '箭头样式';
  row.appendChild(label);

  const wrapper = document.createElement('div');
  wrapper.className = 'annotation-linestyle-select';

  const trigger = document.createElement('button');
  trigger.className = 'annotation-linestyle-trigger';

  function makeArrowPreview(value) {
    const cvs = document.createElement('canvas');
    cvs.width = 48; cvs.height = 16;
    const ctx = cvs.getContext('2d');
    ctx.strokeStyle = '#ddd'; ctx.fillStyle = '#ddd'; ctx.lineWidth = 1.5;
    ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
    const cx1 = 5, cy = 8, cx2 = 43;
    // 先画线
    ctx.beginPath(); ctx.moveTo(cx1, cy); ctx.lineTo(cx2, cy); ctx.stroke();
    const barH = 5; // 竖线高度
    if (value === 'single' || value === 'double') {
      // 右端箭头
      ctx.beginPath(); ctx.moveTo(cx2, cy);
      ctx.lineTo(cx2 - 7, cy - 4); ctx.lineTo(cx2 - 7, cy + 4);
      ctx.closePath(); ctx.fill();
    }
    if (value === 'double') {
      // 左端箭头
      ctx.beginPath(); ctx.moveTo(cx1, cy);
      ctx.lineTo(cx1 + 7, cy - 4); ctx.lineTo(cx1 + 7, cy + 4);
      ctx.closePath(); ctx.fill();
    }
    if (value === 'line') {
      // 两端竖线 |——|
      ctx.beginPath(); ctx.moveTo(cx1, cy - barH/2); ctx.lineTo(cx1, cy + barH/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx2, cy - barH/2); ctx.lineTo(cx2, cy + barH/2); ctx.stroke();
    }
    return cvs;
  }

  trigger.appendChild(makeArrowPreview(currentStyle));
  wrapper.appendChild(trigger);

  const dropdown = document.createElement('div');
  dropdown.className = 'annotation-linestyle-dropdown';
  ARROW_STYLES.forEach(as => {
    const item = document.createElement('div');
    item.className = 'annotation-linestyle-option' + (as.value === currentStyle ? ' active' : '');
    item.appendChild(makeArrowPreview(as.value));
    item.title = as.label;
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      onChange(activeSubmenuTool, 'arrowStyle', as.value);
      trigger.innerHTML = '';
      trigger.appendChild(makeArrowPreview(as.value));
      dropdown.querySelectorAll('.annotation-linestyle-option').forEach(o => o.classList.remove('active'));
      item.classList.add('active');
      closeAllCustomDropdowns();
    });
    dropdown.appendChild(item);
  });
  wrapper.appendChild(dropdown);

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    closeAllCustomDropdowns();
    dropdown.style.display = 'block';
    _openCustomDropdowns.push(dropdown);
  });

  wrapper.addEventListener('mousedown', (e) => e.stopPropagation());

  row.appendChild(wrapper);
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

function addButtonRow(panel, label, btnLabel, onClick, iconHtml) {
  const row = document.createElement('div');
  row.className = 'annotation-submenu-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'annotation-submenu-label';
  labelEl.textContent = label;
  row.appendChild(labelEl);

  const btn = document.createElement('button');
  btn.className = 'annotation-submenu-btn';
  if (iconHtml) btn.innerHTML = iconHtml + '<span>' + btnLabel + '</span>';
  else btn.textContent = btnLabel;
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
  addArrowStyleRow(panel, s.arrowStyle, onChange);
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

  createIcons({ icons: { Trash2 }, root: panel });

  addButtonRow(panel, '清除所有标记', '一键清除', () => {
    const event = new CustomEvent('annotation-clear-all');
    document.dispatchEvent(event);
  }, '<i data-lucide="trash-2"></i>');
}

export { activeTool };

export function updateSliderValue(key, value) {
  const slider = sliderWidgets[key];
  if (slider) slider.setValue(value);
}
