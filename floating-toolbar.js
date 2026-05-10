// floating-toolbar.js

import { createIcons, GripVertical, Square, Pencil, ArrowRight, Hash, Type, Eraser, Trash2, Circle, Bold, Italic, ChevronUp, ChevronDown } from 'lucide';
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
let _inlineValueEls = {};
let _activePopup = null;
let _activePopupSlider = null;
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
        if (tool !== 'scaling' && tool !== 'eraser') toggleSubmenu(tool);
      } else {
        setActiveTool(tool);
        if (tool !== 'scaling' && tool !== 'eraser') toggleSubmenu(tool);
      }
    });
    btnsContainer.appendChild(btn);
  });

  toolbarEl.appendChild(btnsContainer);

  // 分隔符 + 一键清除按钮（紧挨删除按钮右侧）
  const clearSep = document.createElement('span');
  clearSep.className = 'annotation-toolbar-separator';
  btnsContainer.appendChild(clearSep);

  const clearAllBtn = document.createElement('button');
  clearAllBtn.className = 'annotation-tool-btn annotation-clear-all-btn';
  clearAllBtn.title = '一键清除';
  clearAllBtn.innerHTML = '<i data-lucide="trash-2"></i>';
  clearAllBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const event = new CustomEvent('annotation-clear-all');
    document.dispatchEvent(event);
  });
  btnsContainer.appendChild(clearAllBtn);

  parent.appendChild(toolbarEl);

  // Initialize Lucide icons inside toolbar
  createIcons({
    icons: { GripVertical, Square, Pencil, ArrowRight, Hash, Type, Eraser, Trash2 },
    root: toolbarEl,
  });

  // Drag behavior
  gripEl.addEventListener('mousedown', onGripMouseDown);
  document.addEventListener('mousemove', onGripMouseMove);
  document.addEventListener('mouseup', onGripMouseUp);

  // 全局点击关闭自定义下拉选单（线条样式、箭头样式等）和三级弹窗
  document.addEventListener('mousedown', (e) => {
    closeAllCustomDropdowns();
    // 不关闭弹窗的情况：点击在弹窗内部，或者点击的是弹窗自身的触发按钮（由 click 处理器负责 toggle）
    if (_activePopup && !_activePopup.contains(e.target) && e.target !== _activePopup._trigger) {
      closeActivePopup();
    }
  });

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
  closeActivePopup();
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

function closeActivePopup() {
  if (_activePopupSlider) {
    _activePopupSlider.destroy();
    _activePopupSlider = null;
  }
  if (_activePopup) {
    _activePopup.remove();
    _activePopup = null;
  }
}

export function closeSubmenu() {
  closeActivePopup();
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

// --- Inline helpers for compact horizontal submenu ---

function addInlineSeparator(container) {
  const sep = document.createElement('span');
  sep.className = 'annotation-inline-separator';
  container.appendChild(sep);
}

function positionPopup(popup, trigger) {
  const triggerRect = trigger.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();

  let top, left;

  // Horizontal: center-align with trigger, clamp to viewport
  left = triggerRect.left + triggerRect.width / 2 - popupRect.width / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - popupRect.width - 8));

  // Follow parent submenu direction: if submenu popped up, pop up too
  const submenu = trigger.closest('.annotation-submenu');
  const preferUp = submenu && submenu.classList.contains('pop-up');

  if (preferUp) {
    top = triggerRect.top - popupRect.height - 4;
    popup.classList.add('pop-up');
  } else {
    top = triggerRect.bottom + 4;
  }

  popup.style.left = left + 'px';
  popup.style.top = top + 'px';
}

function addInlineSliderValue(container, value, label, min, max, step, toolKey, settingKey, onChange) {
  const valEl = document.createElement('span');
  valEl.className = 'annotation-inline-value';
  valEl.textContent = label + ' ' + value;

  valEl.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_activePopup && _activePopup._trigger === valEl) {
      closeActivePopup();
      return;
    }
    closeActivePopup();
    closeAllCustomDropdowns();

    const popup = document.createElement('div');
    popup.className = 'annotation-popup annotation-popup-slider';
    popup._trigger = valEl;

    // Single row: slider left, number right
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'annotation-slider-container';
    sliderContainer.style.flex = '1';

    const headerValue = document.createElement('input');
    headerValue.type = 'number';
    headerValue.className = 'annotation-popup-input';
    headerValue.value = valEl.textContent.match(/\d+$/)?.[0] || value;
    headerValue.min = min;
    headerValue.max = max;
    headerValue.step = step;
    headerValue.style.flexShrink = '0';

    row.appendChild(sliderContainer);
    row.appendChild(headerValue);
    popup.appendChild(row);

    document.body.appendChild(popup);

    function updateAll(v) {
      headerValue.value = v;
      valEl.textContent = label + ' ' + v;
      onChange(toolKey, settingKey, v);
    }

    _activePopupSlider = createSlider({
      container: sliderContainer,
      min, max, step,
      value: parseFloat(valEl.textContent.match(/\d+$/)?.[0]) || value,
      onChange: (v) => updateAll(v),
    });

    headerValue.addEventListener('change', () => {
      let v = parseFloat(headerValue.value);
      v = Math.max(min, Math.min(max, Math.round(v / step) * step));
      updateAll(v);
      _activePopupSlider.setValue(v);
    });

    headerValue.addEventListener('click', (e) => e.stopPropagation());
    headerValue.addEventListener('mousedown', (e) => e.stopPropagation());

    _activePopup = popup;
    positionPopup(popup, valEl);
  });

  container.appendChild(valEl);
  _inlineValueEls[toolKey + '_' + settingKey] = { el: valEl, label };
  return valEl;
}

function addInlineColorTrigger(container, currentColor, onChange) {
  const dot = document.createElement('span');
  dot.className = 'annotation-inline-color';
  dot.style.backgroundColor = currentColor;
  dot.title = '颜色';

  if (currentColor === '#FFFFFF') {
    dot.style.border = '2px solid var(--border-color)';
  }

  dot.addEventListener('click', (e) => {
    e.stopPropagation();
    if (_activePopup && _activePopup._trigger === dot) {
      closeActivePopup();
      return;
    }
    closeActivePopup();
    closeAllCustomDropdowns();

    const popup = document.createElement('div');
    popup.className = 'annotation-popup annotation-popup-color';
    popup._trigger = dot;

    const swatches = document.createElement('div');
    swatches.className = 'annotation-color-swatches';

    COLOR_PRESETS.forEach(c => {
      const swatch = document.createElement('button');
      swatch.className = 'annotation-color-swatch';
      swatch.style.backgroundColor = c;
      if (c === '#FFFFFF') swatch.style.border = '1px solid var(--border-color)';
      if (c === currentColor) swatch.classList.add('active');
      swatch.addEventListener('click', (ev) => {
        ev.stopPropagation();
        dot.style.backgroundColor = c;
        if (c === '#FFFFFF') {
          dot.style.border = '2px solid var(--border-color)';
        } else {
          dot.style.border = '2px solid var(--border-color)';
        }
        onChange(activeSubmenuTool, 'color', c);
        closeActivePopup();
      });
      swatches.appendChild(swatch);
    });

    popup.appendChild(swatches);
    document.body.appendChild(popup);
    _activePopup = popup;
    positionPopup(popup, dot);
  });

  container.appendChild(dot);
  return dot;
}

function addInlineNumberSpinner(container, value, label, min, max, step, toolKey, settingKey, onChange) {
  const wrapper = document.createElement('span');
  wrapper.className = 'annotation-inline-spinner';

  const labelEl = document.createElement('span');
  labelEl.className = 'annotation-inline-spinner-label';
  labelEl.textContent = label;
  wrapper.appendChild(labelEl);

  const valEl = document.createElement('span');
  valEl.className = 'annotation-inline-spinner-value';
  valEl.textContent = value;
  wrapper.appendChild(valEl);

  const btns = document.createElement('span');
  btns.className = 'annotation-inline-spinner-arrows';

  const upBtn = document.createElement('button');
  upBtn.className = 'annotation-inline-spinner-btn';
  upBtn.innerHTML = '<i data-lucide="chevron-up"></i>';
  upBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const cur = parseInt(valEl.textContent);
    const next = Math.min(max, cur + step);
    if (next !== cur) {
      valEl.textContent = next;
      onChange(toolKey, settingKey, next);
    }
  });
  btns.appendChild(upBtn);

  const downBtn = document.createElement('button');
  downBtn.className = 'annotation-inline-spinner-btn';
  downBtn.innerHTML = '<i data-lucide="chevron-down"></i>';
  downBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const cur = parseInt(valEl.textContent);
    const next = Math.max(min, cur - step);
    if (next !== cur) {
      valEl.textContent = next;
      onChange(toolKey, settingKey, next);
    }
  });
  btns.appendChild(downBtn);

  wrapper.appendChild(btns);
  container.appendChild(wrapper);

  createIcons({ icons: { ChevronUp, ChevronDown }, root: wrapper });

  _inlineValueEls[toolKey + '_' + settingKey] = { el: valEl, label: '' };
  return wrapper;
}

// --- Shared preview generators ---

function makeLineStylePreview(value) {
  const cvs = document.createElement('canvas');
  cvs.width = 40; cvs.height = 12;
  const ctx = cvs.getContext('2d');
  switch (value) {
    case 'solid': ctx.setLineDash([]); break;
    case 'dashed': ctx.setLineDash([8, 3]); break;
    case 'dotted': ctx.setLineDash([2, 2]); break;
    case 'dash-dot': ctx.setLineDash([6, 3, 2, 3]); break;
    case 'dash-dot-dot': ctx.setLineDash([6, 3, 2, 3, 2, 3]); break;
  }
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(40, 6); ctx.stroke();
  return cvs;
}

function makeArrowStylePreview(value) {
  const cvs = document.createElement('canvas');
  cvs.width = 40; cvs.height = 14;
  const ctx = cvs.getContext('2d');
  ctx.strokeStyle = '#ddd'; ctx.fillStyle = '#ddd'; ctx.lineWidth = 1.5;
  ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
  const cx1 = 4, cy = 7, cx2 = 36;
  ctx.beginPath(); ctx.moveTo(cx1, cy); ctx.lineTo(cx2, cy); ctx.stroke();
  if (value === 'single' || value === 'double') {
    ctx.beginPath(); ctx.moveTo(cx2, cy);
    ctx.lineTo(cx2 - 6, cy - 3.5); ctx.lineTo(cx2 - 6, cy + 3.5);
    ctx.closePath(); ctx.fill();
  }
  if (value === 'double') {
    ctx.beginPath(); ctx.moveTo(cx1, cy);
    ctx.lineTo(cx1 + 6, cy - 3.5); ctx.lineTo(cx1 + 6, cy + 3.5);
    ctx.closePath(); ctx.fill();
  }
  if (value === 'line') {
    const barH = 5;
    ctx.beginPath(); ctx.moveTo(cx1, cy - barH / 2); ctx.lineTo(cx1, cy + barH / 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx2, cy - barH / 2); ctx.lineTo(cx2, cy + barH / 2); ctx.stroke();
  }
  return cvs;
}

function addInlineDropdown(container, { options, currentValue, makePreview, settingKey, onChange }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'annotation-linestyle-select';

  const trigger = document.createElement('button');
  trigger.className = 'annotation-linestyle-trigger';

  function updatePreview(value) {
    trigger.innerHTML = '';
    if (makePreview) {
      trigger.appendChild(makePreview(value));
    } else {
      const opt = options.find(o => o.value === value);
      trigger.textContent = opt ? opt.label : value;
    }
  }

  updatePreview(currentValue);
  wrapper.appendChild(trigger);

  const dropdown = document.createElement('div');
  dropdown.className = 'annotation-linestyle-dropdown';

  options.forEach(opt => {
    const item = document.createElement('div');
    item.className = 'annotation-linestyle-option' + (opt.value === currentValue ? ' active' : '');
    if (makePreview) {
      item.appendChild(makePreview(opt.value));
    } else {
      item.textContent = opt.label;
    }
    item.title = opt.label;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onChange(activeSubmenuTool, settingKey, opt.value);
      updatePreview(opt.value);
      dropdown.querySelectorAll('.annotation-linestyle-option').forEach(o => o.classList.remove('active'));
      item.classList.add('active');
      closeAllCustomDropdowns();
    });
    dropdown.appendChild(item);
  });
  wrapper.appendChild(dropdown);

  trigger.addEventListener('click', (ev) => {
    ev.stopPropagation();
    closeAllCustomDropdowns();
    closeActivePopup();
    const submenu = trigger.closest('.annotation-submenu');
    dropdown.classList.toggle('pop-up', submenu && submenu.classList.contains('pop-up'));
    dropdown.style.display = 'block';
    dropdown.style.animation = dropdown.classList.contains('pop-up')
      ? 'popupFadeInUp 0.1s ease-out'
      : 'popupFadeIn 0.1s ease-out';
    _openCustomDropdowns.push(dropdown);
  });

  wrapper.addEventListener('mousedown', (ev) => ev.stopPropagation());
  container.appendChild(wrapper);
}

// --- Tool-specific submenu builders ---

function buildGeometryMenu(panel, settings, onChange) {
  const s = settings.geometry;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  // Shape toggle: rect / ellipse
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
  panel.appendChild(rectBtn);
  panel.appendChild(ellipseBtn);

  createIcons({ icons: { Square, Circle }, root: panel });

  addInlineSeparator(panel);

  // Fill checkbox (compact inline)
  const fillLabel = document.createElement('label');
  fillLabel.className = 'annotation-inline-checkbox';
  const fillCheckbox = document.createElement('input');
  fillCheckbox.type = 'checkbox';
  fillCheckbox.checked = s.fill;
  fillCheckbox.addEventListener('change', () => onChange('geometry', 'fill', fillCheckbox.checked));
  fillLabel.appendChild(fillCheckbox);
  fillLabel.appendChild(document.createTextNode('填充'));
  panel.appendChild(fillLabel);

  addInlineSeparator(panel);

  // Line style
  addInlineDropdown(panel, {
    options: LINE_STYLES,
    currentValue: s.lineStyle,
    makePreview: makeLineStylePreview,
    settingKey: 'lineStyle',
    onChange,
  });

  addInlineSeparator(panel);

  // Line width
  addInlineSliderValue(panel, s.lineWidth, '线条粗细', 1, 75, 1, 'geometry', 'lineWidth', onChange);

  // Corner radius (only for non-ellipse)
  if (s.shape !== 'ellipse') {
    addInlineSeparator(panel);
    addInlineSliderValue(panel, s.cornerRadius, '圆角角度', 0, 90, 1, 'geometry', 'cornerRadius', onChange);
  }

  addInlineSeparator(panel);

  // Color
  addInlineColorTrigger(panel, s.color, onChange);
}

function buildPencilMenu(panel, settings, onChange) {
  const s = settings.pencil;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  addInlineDropdown(panel, {
    options: LINE_STYLES,
    currentValue: s.lineStyle,
    makePreview: makeLineStylePreview,
    settingKey: 'lineStyle',
    onChange,
  });

  addInlineSeparator(panel);

  addInlineSliderValue(panel, s.lineWidth, '线条粗细', 1, 75, 1, 'pencil', 'lineWidth', onChange);

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, onChange);
}

function buildArrowMenu(panel, settings, onChange) {
  const s = settings.arrow;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  addInlineDropdown(panel, {
    options: ARROW_STYLES,
    currentValue: s.arrowStyle,
    makePreview: makeArrowStylePreview,
    settingKey: 'arrowStyle',
    onChange,
  });

  addInlineSeparator(panel);

  addInlineDropdown(panel, {
    options: LINE_STYLES,
    currentValue: s.lineStyle,
    makePreview: makeLineStylePreview,
    settingKey: 'lineStyle',
    onChange,
  });

  addInlineSeparator(panel);

  addInlineSliderValue(panel, s.lineWidth, '线条粗细', 1, 75, 1, 'arrow', 'lineWidth', onChange);

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, onChange);
}

function buildSequenceMenu(panel, settings, onChange) {
  const s = settings.sequence;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  addInlineNumberSpinner(panel, s.nextNumber, '起始', 0, 9999, 1, 'sequence', 'nextNumber', onChange);

  addInlineSeparator(panel);

  addInlineDropdown(panel, {
    options: NUMBER_STYLES,
    currentValue: s.numberStyle,
    settingKey: 'numberStyle',
    onChange,
  });

  addInlineSeparator(panel);

  addInlineSliderValue(panel, s.fontSize, '字号', 5, 72, 1, 'sequence', 'fontSize', onChange);

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, onChange);
}

function buildTextMenu(panel, settings, onChange) {
  const s = settings.text;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  // Bold + Italic
  const boldBtn = document.createElement('button');
  boldBtn.className = 'annotation-style-btn' + (s.bold ? ' active' : '');
  boldBtn.innerHTML = '<i data-lucide="bold"></i>';
  boldBtn.title = '加粗';
  boldBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    boldBtn.classList.toggle('active');
    onChange('text', 'bold', !s.bold);
  });
  panel.appendChild(boldBtn);

  const italicBtn = document.createElement('button');
  italicBtn.className = 'annotation-style-btn' + (s.italic ? ' active' : '');
  italicBtn.innerHTML = '<i data-lucide="italic"></i>';
  italicBtn.title = '斜体';
  italicBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    italicBtn.classList.toggle('active');
    onChange('text', 'italic', !s.italic);
  });
  panel.appendChild(italicBtn);

  createIcons({ icons: { Bold, Italic }, root: panel });

  addInlineSeparator(panel);

  // Font family
  const fonts = [
    { value: 'sans-serif', label: 'Sans Serif' },
    { value: 'serif', label: 'Serif' },
    { value: 'monospace', label: 'Monospace' },
    { value: '"DengXian", "PingFang SC", "Noto Sans CJK SC", sans-serif', label: '黑体' },
    { value: '"SimSun", "Songti SC", "Noto Serif CJK SC", serif', label: '宋体' },
  ];
  addInlineDropdown(panel, {
    options: fonts,
    currentValue: s.fontFamily,
    settingKey: 'fontFamily',
    onChange,
  });

  addInlineSeparator(panel);

  addInlineSliderValue(panel, s.fontSize, '字号', 5, 72, 1, 'text', 'fontSize', onChange);

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, onChange);
}

function buildEraserMenu(panel, settings, onChange) {
  const s = settings.eraser;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  createIcons({ icons: { Trash2 }, root: panel });

  const btn = document.createElement('button');
  btn.className = 'annotation-submenu-btn';
  btn.innerHTML = '<i data-lucide="trash-2"></i><span>一键清除</span>';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const event = new CustomEvent('annotation-clear-all');
    document.dispatchEvent(event);
  });
  panel.appendChild(btn);
}

export { activeTool };

export function updateSliderValue(key, value) {
  const slider = sliderWidgets[key];
  if (slider) slider.setValue(value);
  const inline = _inlineValueEls[key];
  if (inline) inline.el.textContent = inline.label ? (inline.label + ' ' + value) : value;
}
