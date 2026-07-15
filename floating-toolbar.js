// floating-toolbar.js

import { createIcons, GripVertical, Square, Pencil, ArrowRight, Hash, Type, Eraser, Trash2, Circle, Bold, Italic, ChevronUp, ChevronDown, Stamp, Check, X } from 'lucide';
import { TOOLS, LINE_STYLES, ARROW_STYLES, NUMBER_STYLES, STAMP_SHAPES, COLOR_PRESETS, hexToRgba } from './annotation.js';
import { createSlider } from './slider-widget.js';
import { t, onLanguageChange } from './src/i18n/i18n.js';

const FONT_SIZE_PRESETS = [
  5, 6, 7, 8, 9, 10, 11, 12, 14, 18, 20, 22, 24, 26, 28, 36, 48, 56, 60, 72,
];

// 解析选项标签：优先 labelKey（可翻译），回退静态 label。
function optionLabel(opt) {
  if (opt.labelKey) return t(opt.labelKey);
  return opt.label ?? '';
}

const TOOL_LABEL_KEYS = {
  scaling: 'tools.scaling',
  geometry: 'tools.geometry',
  pencil: 'tools.pencil',
  arrow: 'tools.arrow',
  stamp: 'tools.stamp',
  sequence: 'tools.sequence',
  text: 'tools.text',
  eraser: 'tools.eraser',
};

const TOOL_ICON_NAMES = {
  scaling: 'scale',
  geometry: 'square',
  pencil: 'pencil',
  arrow: 'arrow-right',
  stamp: 'stamp',
  sequence: 'hash',
  text: 'type',
  eraser: 'eraser',
};

function updateToolIcon(tool, iconName, iconComponent) {
  if (!toolbarEl) return;
  const btn = toolbarEl.querySelector(`[data-tool="${tool}"]`);
  if (btn) {
    btn.innerHTML = `<i data-lucide="${iconName}"></i>`;
    const pascal = iconName.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    createIcons({ icons: { [pascal]: iconComponent }, root: btn });
  }
}

let toolbarEl = null;
let submenuEl = null;
let activeSubmenuTool = null;
let sliderWidgets = {};
let _inlineValueEls = {};
let _activePopup = null;
let _activePopupSlider = null;
let _activePopupInput = null;
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
    btn.title = t(TOOL_LABEL_KEYS[tool]);
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
  clearAllBtn.title = t('annotation.clearAll');
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
    icons: { GripVertical, Square, Pencil, ArrowRight, Hash, Type, Eraser, Trash2, Stamp },
    root: toolbarEl,
  });

  // 语言变更时刷新工具按钮 tooltip
  onLanguageChange(() => {
    btnsContainer.querySelectorAll('.annotation-tool-btn[data-tool]').forEach(btn => {
      btn.title = t(TOOL_LABEL_KEYS[btn.dataset.tool]);
    });
    const ca = btnsContainer.querySelector('.annotation-clear-all-btn');
    if (ca) ca.title = t('annotation.clearAll');
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
  if (_activePopup) clearTimeout(_activePopup._hideTimer);
  if (_activePopupSlider) {
    _activePopupSlider.destroy();
    _activePopupSlider = null;
  }
  _activePopupInput = null;
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
    case 'stamp':
      buildStampMenu(panel, settings, onChange);
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

// 全局关闭所有自定义下拉选单
let _openCustomDropdowns = [];
function closeAllCustomDropdowns() {
  _openCustomDropdowns.forEach(d => { if (d) d.style.display = 'none'; });
  _openCustomDropdowns = [];
}

// --- Inline helpers for compact horizontal submenu ---

export function addInlineSeparator(container) {
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

export function addInlineSliderValue(container, value, label, min, max, step, toolKey, settingKey, onChange, suffix) {
  const lbl = label ? t(label) : '';
  const valEl = document.createElement('span');
  valEl.className = 'annotation-inline-value';
  valEl.textContent = lbl ? (lbl + ' ' + value + (suffix || '')) : (value + (suffix || ''));

  valEl.addEventListener('mousedown', (e) => e.stopPropagation());
  valEl.addEventListener('click', (e) => e.stopPropagation());
  valEl.addEventListener('mouseenter', () => {
    closeActivePopup();
    closeAllCustomDropdowns();

    const popup = document.createElement('div');
    popup.className = 'annotation-popup annotation-popup-slider';

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
    if (suffix) {
      const sufSpan = document.createElement('span');
      sufSpan.textContent = suffix;
      sufSpan.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;';
      row.appendChild(sufSpan);
    }
    popup.appendChild(row);

    document.body.appendChild(popup);

    function updateAll(v) {
      headerValue.value = v;
      valEl.textContent = lbl ? (lbl + ' ' + v + (suffix || '')) : (v + (suffix || ''));
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
    _activePopupInput = headerValue;
    positionPopup(popup, valEl);

    popup.addEventListener('mouseenter', () => clearTimeout(_activePopup._hideTimer));
    popup.addEventListener('mouseleave', () => { _activePopup._hideTimer = setTimeout(closeActivePopup, 150); });
    popup.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cur = _activePopupSlider.getValue();
      const d = e.deltaY > 0 ? -step : step;
      const v = Math.max(min, Math.min(max, Math.round((cur + d) / step) * step));
      if (v !== cur) {
        _activePopupSlider.setValue(v);
        headerValue.value = v;
        valEl.textContent = lbl ? (lbl + ' ' + v + (suffix || '')) : (v + (suffix || ''));
        onChange(toolKey, settingKey, v);
      }
    }, { passive: false });
  });
  valEl.addEventListener('mouseleave', () => { if (_activePopup && !_activePopup._hideTimer) _activePopup._hideTimer = setTimeout(closeActivePopup, 150); });

  valEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const cur = _activePopupSlider ? _activePopupSlider.getValue() : parseFloat(valEl.textContent.match(/\d+$/)?.[0]) || value;
    const d = e.deltaY > 0 ? -step : step;
    const v = Math.max(min, Math.min(max, Math.round((cur + d) / step) * step));
    if (v !== cur) {
      if (_activePopupSlider) _activePopupSlider.setValue(v);
      if (_activePopupInput) _activePopupInput.value = v;
      valEl.textContent = lbl ? (lbl + ' ' + v + (suffix || '')) : (v + (suffix || ''));
      onChange(toolKey, settingKey, v);
    }
  }, { passive: false });

  container.appendChild(valEl);
  _inlineValueEls[toolKey + '_' + settingKey] = { el: valEl, label, suffix };
  return valEl;
}

export function addInlineShadowControl(panel, value, toolName, onChange) {
  let currentVal = value;
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = value > 0;
  const lbl = document.createElement('label');
  lbl.className = 'annotation-inline-checkbox';
  cb.addEventListener('change', () => {
    const v = cb.checked ? 35 : 0;
    currentVal = v;
    onChange(toolName, 'shadow', v);
    if (_activePopupSlider) _activePopupSlider.setValue(v);
    if (_activePopupInput) _activePopupInput.value = v;
  });
  lbl.appendChild(cb);
  lbl.appendChild(document.createTextNode(t('annotation.shadow')));

  let hoverPopup = null;
  let hideTimer = null;

  function showPopup() {
    clearTimeout(hideTimer);
    if (hoverPopup) return;
    closeActivePopup();
    closeAllCustomDropdowns();

    const popup = document.createElement('div');
    popup.className = 'annotation-popup annotation-popup-slider';
    hoverPopup = popup;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'annotation-slider-container';
    sliderContainer.style.flex = '1';

    const numInput = document.createElement('input');
    numInput.type = 'number';
    numInput.className = 'annotation-popup-input';
    numInput.value = currentVal;
    numInput.min = 0;
    numInput.max = 100;
    numInput.step = 1;
    numInput.style.flexShrink = '0';
    numInput.style.width = '42px';

    const pctSpan = document.createElement('span');
    pctSpan.textContent = '%';
    pctSpan.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;';

    row.appendChild(sliderContainer);
    row.appendChild(numInput);
    row.appendChild(pctSpan);
    popup.appendChild(row);
    document.body.appendChild(popup);

    function updateAll(v) {
      v = Math.max(0, Math.min(100, Math.round(v)));
      currentVal = v;
      numInput.value = v;
      cb.checked = v > 0;
      onChange(toolName, 'shadow', v);
    }

    _activePopupSlider = createSlider({
      container: sliderContainer,
      min: 0, max: 100, step: 1,
      value: currentVal,
      onChange: (v) => updateAll(v),
    });

    numInput.addEventListener('change', () => {
      let v = parseInt(numInput.value);
      if (isNaN(v)) v = 0;
      v = Math.max(0, Math.min(100, v));
      updateAll(v);
      _activePopupSlider.setValue(v);
    });
    numInput.addEventListener('click', (e) => e.stopPropagation());
    numInput.addEventListener('mousedown', (e) => e.stopPropagation());

    _activePopupInput = numInput;
    _activePopup = popup;
    positionPopup(popup, lbl);

    popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    popup.addEventListener('mouseleave', () => { hideTimer = setTimeout(hidePopup, 150); });
    popup.addEventListener('wheel', (e) => {
      e.preventDefault();
      const cur = _activePopupSlider.getValue();
      const d = e.deltaY > 0 ? -1 : 1;
      const v = Math.max(0, Math.min(100, cur + d));
      if (v !== cur) {
        _activePopupSlider.setValue(v);
        if (_activePopupInput) _activePopupInput.value = v;
        cb.checked = v > 0;
        onChange(toolName, 'shadow', v);
      }
    }, { passive: false });
  }

  function hidePopup() {
    clearTimeout(hideTimer);
    if (!hoverPopup) return;
    closeActivePopup();
    hoverPopup = null;
  }

  lbl.addEventListener('mousedown', (e) => e.stopPropagation());
  lbl.addEventListener('click', (e) => e.stopPropagation());
  lbl.addEventListener('mouseenter', showPopup);
  lbl.addEventListener('mouseleave', () => { hideTimer = setTimeout(hidePopup, 150); });

  panel.appendChild(lbl);
  _inlineValueEls[toolName + '_shadow'] = {
    el: lbl,
    update: (v) => { cb.checked = v > 0; if (_activePopupSlider) _activePopupSlider.setValue(v); if (_activePopupInput) _activePopupInput.value = v; },
  };
}

export function addInlineColorTrigger(container, currentColor, currentOpacity, onChange, toolKey) {
  // toolKey 可省略，回退到当前活动子菜单工具（向后兼容）
  const tk = toolKey != null ? toolKey : activeSubmenuTool;
  const dot = document.createElement('span');
  dot.className = 'annotation-inline-color';
  dot.style.setProperty('--dot-color', hexToRgba(currentColor, currentOpacity / 100));
  dot.title = t('annotation.color');

  dot.addEventListener('mousedown', (e) => e.stopPropagation());
  dot.addEventListener('click', (e) => e.stopPropagation());
  dot.addEventListener('mouseenter', () => {
    closeActivePopup();
    closeAllCustomDropdowns();

    const popup = document.createElement('div');
    popup.className = 'annotation-popup annotation-popup-color';
    popup._trigger = dot;

    // Track live state inside popup
    let liveColor = currentColor;
    let liveOpacity = currentOpacity;

    // --- Color swatches row ---
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
        liveColor = c;
        swatches.querySelectorAll('.active').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        dot.style.setProperty('--dot-color', hexToRgba(liveColor, liveOpacity / 100));
        onChange(tk, 'color', c);
      });
      swatches.appendChild(swatch);
    });

    popup.appendChild(swatches);

    // --- Opacity slider row ---
    const opRow = document.createElement('div');
    opRow.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:6px;';

    const opLabel = document.createElement('span');
    opLabel.textContent = t('annotation.opacity');
    opLabel.style.cssText = 'font-size:11px;color:var(--text-muted);flex-shrink:0;';

    const opSliderContainer = document.createElement('div');
    opSliderContainer.className = 'annotation-slider-container';
    opSliderContainer.style.flex = '1';

    const opInput = document.createElement('input');
    opInput.type = 'number';
    opInput.className = 'annotation-popup-input';
    opInput.value = liveOpacity;
    opInput.min = 5;
    opInput.max = 100;
    opInput.step = 1;
    opInput.style.flexShrink = '0';

    function updateOpacity(v) {
      v = Math.max(5, Math.min(100, Math.round(v)));
      liveOpacity = v;
      opInput.value = v;
      dot.style.setProperty('--dot-color', hexToRgba(liveColor, v / 100));
      onChange(tk, 'opacity', v);
    }

    _activePopupSlider = createSlider({
      container: opSliderContainer,
      min: 5, max: 100, step: 1,
      value: liveOpacity,
      onChange: (v) => updateOpacity(v),
    });

    opInput.addEventListener('change', () => {
      updateOpacity(parseFloat(opInput.value) || 100);
      _activePopupSlider.setValue(liveOpacity);
    });
    opInput.addEventListener('click', (ev) => ev.stopPropagation());
    opInput.addEventListener('mousedown', (ev) => ev.stopPropagation());

    opRow.appendChild(opLabel);
    opRow.appendChild(opSliderContainer);
    opRow.appendChild(opInput);
    popup.appendChild(opRow);

    document.body.appendChild(popup);
    _activePopup = popup;
    positionPopup(popup, dot);

    popup.addEventListener('mouseenter', () => clearTimeout(_activePopup._hideTimer));
    popup.addEventListener('mouseleave', () => { _activePopup._hideTimer = setTimeout(closeActivePopup, 150); });
  });
  dot.addEventListener('mouseleave', () => { if (_activePopup && !_activePopup._hideTimer) _activePopup._hideTimer = setTimeout(closeActivePopup, 150); });

  container.appendChild(dot);
  return dot;
}

export function addInlineNumberSpinner(container, value, label, min, max, step, toolKey, settingKey, onChange) {
  const wrapper = document.createElement('span');
  wrapper.className = 'annotation-inline-spinner';

  const labelEl = document.createElement('span');
  labelEl.className = 'annotation-inline-spinner-label';
  labelEl.textContent = label ? t(label) : '';
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
    case 'dashed': ctx.setLineDash([8, 4]); break;
    case 'dotted': ctx.setLineDash([0.5, 4]); break;
    case 'dash-dot': ctx.setLineDash([8, 4, 0.5, 4]); break;
    case 'double': {
      ctx.setLineDash([]);
      ctx.strokeStyle = '#ddd'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(40, 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 9); ctx.lineTo(40, 9); ctx.stroke();
      return cvs;
    }
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

  if (value === 'taper') {
    // 渐尖杆身 + 与 single 同尺寸的箭头
    ctx.beginPath();
    ctx.moveTo(cx1, cy);
    ctx.lineTo(cx2 - 6, cy - 0.75);
    ctx.lineTo(cx2 - 6, cy + 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx2, cy);
    ctx.lineTo(cx2 - 6, cy - 3.5);
    ctx.lineTo(cx2 - 6, cy + 3.5);
    ctx.closePath();
    ctx.fill();
  } else {
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
  }
  return cvs;
}

export function addInlineDropdown(container, { options, currentValue, makePreview, settingKey, onChange }, toolKey) {
  // toolKey 可省略，回退到当前活动子菜单工具（向后兼容）
  const tk = toolKey != null ? toolKey : activeSubmenuTool;
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
      trigger.textContent = opt ? optionLabel(opt) : value;
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
      item.textContent = optionLabel(opt);
    }
    item.title = optionLabel(opt);
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onChange(tk, settingKey, opt.value);
      updatePreview(opt.value);
      dropdown.querySelectorAll('.annotation-linestyle-option').forEach(o => o.classList.remove('active'));
      item.classList.add('active');
      closeAllCustomDropdowns();
    });
    dropdown.appendChild(item);
  });
  wrapper.appendChild(dropdown);

  trigger.addEventListener('mouseenter', () => {
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
  wrapper.addEventListener('mouseleave', () => {
    closeAllCustomDropdowns();
  });

  wrapper.addEventListener('mousedown', (ev) => ev.stopPropagation());
  container.appendChild(wrapper);
}

function addFontSizeControl(container, currentValue, onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'annotation-fontsize-select';

  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'annotation-fontsize-input';
  input.value = currentValue;
  input.step = 0.01;

  const dropdown = document.createElement('div');
  dropdown.className = 'annotation-linestyle-dropdown annotation-fontsize-dropdown';

  FONT_SIZE_PRESETS.forEach(size => {
    const item = document.createElement('div');
    item.className = 'annotation-linestyle-option' + (size === currentValue ? ' active' : '');
    item.textContent = size;
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      input.value = size;
      onChange('text', 'fontSize', size);
      dropdown.querySelectorAll('.annotation-linestyle-option').forEach(o => o.classList.remove('active'));
      item.classList.add('active');
      closeAllCustomDropdowns();
    });
    dropdown.appendChild(item);
  });

  function applyValue() {
    let v = parseFloat(input.value);
    if (isNaN(v) || v <= 0) v = 12;
    v = Math.round(v * 100) / 100;
    input.value = v;
    onChange('text', 'fontSize', v);
  }

  input.addEventListener('mouseenter', () => {
    closeAllCustomDropdowns();
    closeActivePopup();
    const submenu = input.closest('.annotation-submenu');
    dropdown.classList.toggle('pop-up', submenu && submenu.classList.contains('pop-up'));
    dropdown.style.display = 'block';
    dropdown.style.animation = dropdown.classList.contains('pop-up')
      ? 'popupFadeInUp 0.1s ease-out'
      : 'popupFadeIn 0.1s ease-out';
    _openCustomDropdowns.push(dropdown);
  });
  wrapper.addEventListener('mouseleave', () => {
    closeAllCustomDropdowns();
  });

  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      applyValue();
      input.blur();
    }
  });

  input.addEventListener('change', applyValue);
  input.addEventListener('mousedown', (ev) => ev.stopPropagation());

  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);
  wrapper.addEventListener('mousedown', (ev) => ev.stopPropagation());
  container.appendChild(wrapper);

  _inlineValueEls['text_fontSize'] = { el: input };
}

// --- Tool-specific submenu builders ---

function buildGeometryMenu(panel, settings, onChange) {
  const s = settings.geometry;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  // 同步一级工具栏图标
  updateToolIcon('geometry', s.shape === 'ellipse' ? 'circle' : 'square', s.shape === 'ellipse' ? Circle : Square);

  // Shape toggle: rect / ellipse
  const rectBtn = document.createElement('button');
  rectBtn.className = 'annotation-shape-btn' + (s.shape !== 'ellipse' ? ' active' : '');
  rectBtn.innerHTML = '<i data-lucide="square"></i>';
  rectBtn.title = t('annotation.rectangle');
  const ellipseBtn = document.createElement('button');
  ellipseBtn.className = 'annotation-shape-btn' + (s.shape === 'ellipse' ? ' active' : '');
  ellipseBtn.innerHTML = '<i data-lucide="circle"></i>';
  ellipseBtn.title = t('annotation.ellipse');
  rectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    rectBtn.classList.add('active');
    ellipseBtn.classList.remove('active');
    onChange('geometry', 'shape', 'rounded-rect');
    updateToolIcon('geometry', 'square', Square);
  });
  ellipseBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    ellipseBtn.classList.add('active');
    rectBtn.classList.remove('active');
    onChange('geometry', 'shape', 'ellipse');
    updateToolIcon('geometry', 'circle', Circle);
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
  fillLabel.appendChild(document.createTextNode(t('annotation.fill')));
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
  addInlineSliderValue(panel, s.lineWidth, 'annotation.lineWidth', 1, 75, 1, 'geometry', 'lineWidth', onChange);

  // Corner radius (only for non-ellipse)
  if (s.shape !== 'ellipse') {
    addInlineSeparator(panel);
    addInlineSliderValue(panel, s.cornerRadius, 'annotation.cornerRadius', 0, 90, 1, 'geometry', 'cornerRadius', onChange);
  }

  addInlineSeparator(panel);

  // Color
  addInlineColorTrigger(panel, s.color, s.opacity, onChange);

  addInlineSeparator(panel);

  addInlineShadowControl(panel, s.shadow, 'geometry', onChange);
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

  addInlineSliderValue(panel, s.lineWidth, 'annotation.lineWidth', 1, 75, 1, 'pencil', 'lineWidth', onChange);

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, s.opacity, onChange);

  addInlineSeparator(panel);

  addInlineShadowControl(panel, s.shadow, 'pencil', onChange);
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

  addInlineSliderValue(panel, s.lineWidth, 'annotation.lineWidth', 1, 75, 1, 'arrow', 'lineWidth', onChange);

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, s.opacity, onChange);

  addInlineSeparator(panel);

  addInlineShadowControl(panel, s.shadow, 'arrow', onChange);
}

function buildSequenceMenu(panel, settings, onChange) {
  const s = settings.sequence;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  addInlineNumberSpinner(panel, s.nextNumber, 'annotation.startAt', 0, 9999, 1, 'sequence', 'nextNumber', onChange);

  addInlineSeparator(panel);

  addInlineDropdown(panel, {
    options: NUMBER_STYLES,
    currentValue: s.numberStyle,
    settingKey: 'numberStyle',
    onChange,
  });

  addInlineSeparator(panel);

  const pct = Math.round(((s.size - 4) / (512 - 4)) * 100) + 1;
  addInlineSliderValue(panel, pct, 'annotation.size', 1, 100, 1, 'sequence', 'size', (toolKey, key, val) => {
    const pixelSize = Math.round(4 + (val - 1) * (512 - 4) / (100 - 1));
    onChange(toolKey, 'size', pixelSize);
  }, '%');

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, s.opacity, onChange);

  addInlineSeparator(panel);

  addInlineShadowControl(panel, s.shadow, 'sequence', onChange);
}

function buildStampMenu(panel, settings, onChange) {
  const s = settings.stamp;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  // Shape toggle: check / x
  const checkBtn = document.createElement('button');
  checkBtn.className = 'annotation-shape-btn' + (s.shape === 'check' ? ' active' : '');
  checkBtn.innerHTML = '<i data-lucide="check"></i>';
  checkBtn.title = t('annotation.check');
  const xBtn = document.createElement('button');
  xBtn.className = 'annotation-shape-btn' + (s.shape === 'x' ? ' active' : '');
  xBtn.innerHTML = '<i data-lucide="x"></i>';
  xBtn.title = t('annotation.x');
  const updateColorDot = (color) => {
    const dot = panel.querySelector('.annotation-inline-color');
    if (dot) dot.style.setProperty('--dot-color', hexToRgba(color, s.opacity / 100));
  };
  checkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    checkBtn.classList.add('active');
    xBtn.classList.remove('active');
    onChange('stamp', 'shape', 'check');
    onChange('stamp', 'color', s.checkColor);
    updateColorDot(s.checkColor);
  });
  xBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    xBtn.classList.add('active');
    checkBtn.classList.remove('active');
    onChange('stamp', 'shape', 'x');
    onChange('stamp', 'color', s.xColor);
    updateColorDot(s.xColor);
  });
  panel.appendChild(checkBtn);
  panel.appendChild(xBtn);

  createIcons({ icons: { Check, X }, root: panel });

  addInlineSeparator(panel);

  // Size: 4–512, displayed as percentage (4=1%, 512=100%)
  const pct = Math.round(((s.size - 4) / (512 - 4)) * 100);
  addInlineSliderValue(panel, pct, 'annotation.size', 1, 100, 1, 'stamp', 'size', (toolKey, key, val) => {
    const pixelSize = Math.round(4 + (val - 1) * (512 - 4) / (100 - 1));
    onChange(toolKey, 'size', pixelSize);
  }, '%');

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, s.opacity, onChange);

  addInlineSeparator(panel);

  addInlineShadowControl(panel, s.shadow, 'stamp', onChange);
}

function buildTextMenu(panel, settings, onChange) {
  const s = settings.text;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  // Bold + Italic
  const boldBtn = document.createElement('button');
  boldBtn.className = 'annotation-style-btn' + (s.bold ? ' active' : '');
  boldBtn.innerHTML = '<i data-lucide="bold"></i>';
  boldBtn.title = t('annotation.bold');
  boldBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    boldBtn.classList.toggle('active');
    onChange('text', 'bold', !s.bold);
  });
  panel.appendChild(boldBtn);

  const italicBtn = document.createElement('button');
  italicBtn.className = 'annotation-style-btn' + (s.italic ? ' active' : '');
  italicBtn.innerHTML = '<i data-lucide="italic"></i>';
  italicBtn.title = t('annotation.italic');
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

  addFontSizeControl(panel, s.fontSize, onChange);

  addInlineSeparator(panel);

  addInlineColorTrigger(panel, s.color, s.opacity, onChange);

  addInlineSeparator(panel);

  addInlineShadowControl(panel, s.shadow, 'text', onChange);
}

function buildEraserMenu(panel, settings, onChange) {
  const s = settings.eraser;
  if (!s) return;

  panel.classList.add('annotation-submenu-inline');

  createIcons({ icons: { Trash2 }, root: panel });

  const btn = document.createElement('button');
  btn.className = 'annotation-submenu-btn';
  btn.innerHTML = `<i data-lucide="trash-2"></i><span>${t('annotation.clearAll')}</span>`;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const event = new CustomEvent('annotation-clear-all');
    document.dispatchEvent(event);
  });
  panel.appendChild(btn);
}

export function updateSliderValue(key, value) {
  const slider = sliderWidgets[key];
  if (slider) slider.setValue(value);
  const inline = _inlineValueEls[key];
  if (inline) {
    if (inline.update) {
      inline.update(value);
    } else if (inline.el.tagName === 'INPUT') {
      inline.el.value = value;
    } else {
      const ilbl = inline.label ? t(inline.label) : '';
      inline.el.textContent = ilbl ? (ilbl + ' ' + value + (inline.suffix || '')) : (value + (inline.suffix || ''));
    }
  }
  // 同步三级弹窗的滑块和输入框
  if (_activePopupSlider) _activePopupSlider.setValue(value);
  if (_activePopupInput) _activePopupInput.value = value;
}
