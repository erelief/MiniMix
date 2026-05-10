/**
 * main.js - 拼好图主入口
 * 最简版本：添加图片 + 横排/纵排 + 撤销/重做 + 复制/保存
 */

import { ImageItem } from './image-item.js';
import { UndoManager } from './undo-manager.js';
import { createDefaultToolSettings, createAnnotation } from './annotation.js';
import { createFloatingToolbar, closeSubmenu } from './floating-toolbar.js';
import {
  computeLayout,
  computeGroupedLayout,
  renderPreview,
  hitTest,
  setLayoutResult,
  exportImage,
  generatePreviewDataURL,
  exportSingleImage,
  generateSingleImagePreviewDataURL,
  formatFileSize,
  ASPECT_RATIOS,
} from './stitch-engine.js';

// ========== 图片对象池（支持撤销恢复） ==========
const imagePool = new Map();

const DRAG_THRESHOLD = 4; // CSS 像素，防止误触拖拽

// ========== 应用状态 ==========
const state = {
  images: [],
  groups: [],          // [[id1, id2], [id3]] — 分组结构
  layoutMode: 'horizontal',
  undoManager: new UndoManager(30),
  lastLayoutResult: null,
  hoveredCloseId: -1,
  hoveredImageId: -1,
  isDragging: false,
  dragImageId: -1,
  dragStartMX: 0,
  dragStartMY: 0,
  dragCurrentMX: 0,
  dragCurrentMY: 0,
  dragInsertIndex: -1,
  dragTargetGroupIndex: -1,
  dragStarted: false,
  dropZone: null,      // null | { type: 'new-group', position: 'before'|'after', groupIndex }
  // 编辑模式
  editModeImageId: -1,
  editAction: null,       // null | 'crop' | 'pan' | 'rotate'
  editActionStart: null,  // { mouseX, mouseY, ...初始值 }
  hoveredSaveBtn: false,
  hoveredResetBtn: false,
  hoveredRotateBtn: false,
  hoveredRatioBtn: false,
  showRatioMenu: false,
  hoveredRatioIndex: -1,
  hoveredEditBtnId: -1,
  hoveredDupBtnId: -1,
  hoveredDlBtnId: -1,
  saveTargetImage: null,
  // 标注
  activeAnnotationTool: 'geometry',
  toolSettings: createDefaultToolSettings(),
  annotations: new Map(),  // Map<imageId, Annotation[]>
  _annotationDrawing: null,
  _erasing: false,
  // 全局比例
  globalRatioIndex: -1,
  autoCropNewImages: false,
  // 锁定全局画布比例
  canvasRatioLocked: false,
  canvasRatioIndex: -1,
  _canvasRatioDragging: false,
  // 行列拖拽
  isRowDragging: false,
  dragGroupIndex: -1,
  dragGroupStartMX: 0, dragGroupStartMY: 0,
  dragGroupCurrentMX: 0, dragGroupCurrentMY: 0,
  dragGroupStarted: false,
  dragGroupDropIndex: -1,
};

// ========== 分组工具函数 ==========

function syncImagesFromGroups() {
  state.images = state.groups.flatMap(g =>
    g.map(id => imagePool.get(id)).filter(Boolean)
  );
}

function removeImageFromGroups(imageId) {
  for (const group of state.groups) {
    const idx = group.indexOf(imageId);
    if (idx !== -1) {
      group.splice(idx, 1);
      return;
    }
  }
}

function cleanupEmptyGroups() {
  state.groups = state.groups.filter(g => g.length > 0);
}

function gcImagePool() {
  const activeIds = new Set();
  state.groups.flat().forEach(id => activeIds.add(id));
  const allSnapshots = [...state.undoManager.undoStack, ...state.undoManager.redoStack];
  allSnapshots.forEach(snap => {
    snap.groups.flat().forEach(id => activeIds.add(id));
  });
  for (const key of imagePool.keys()) {
    if (!activeIds.has(key)) imagePool.delete(key);
  }
}

// ========== DOM 引用 ==========
const canvas = document.getElementById('main-canvas');
const statusBar = document.getElementById('status-bar');
const dropOverlay = document.getElementById('drop-overlay');
const scaleToast = document.getElementById('scale-toast');
const copyToast = document.getElementById('copy-toast');
const newRowBefore = document.getElementById('new-row-before');
const newRowAfter = document.getElementById('new-row-after');
const addImagesInput = document.getElementById('add-images');
const uploadBtnLabel = addImagesInput.closest('.upload-btn');
const gripContainer = document.getElementById('grip-container');

// 把手条宽度（屏幕像素，始终预留）
const GRIP_STRIP = 32;
const GRIP_ICON_SIZE = 28;

const layoutBtns = document.querySelectorAll('[data-layout]');
const btnUndo = document.getElementById('btn-undo');
const btnRedo = document.getElementById('btn-redo');
const btnCopy = document.getElementById('btn-copy');
const btnSave = document.getElementById('btn-save');
const btnInfo = document.getElementById('btn-info');
const btnClear = document.getElementById('btn-clear');
const btnRatio = document.getElementById('btn-ratio');
const ratioDropdown = document.getElementById('ratio-dropdown');
const btnCanvasRatio = document.getElementById('btn-canvas-ratio');
const canvasRatioDropdown = document.getElementById('canvas-ratio-dropdown');

const saveModal = document.getElementById('save-modal');
const infoModal = document.getElementById('info-modal');
const saveFormatSelect = document.getElementById('save-format');
const saveQualitySlider = document.getElementById('save-quality');
const saveQualityValue = document.getElementById('save-quality-value');
const saveResolutionSelect = document.getElementById('save-resolution');
const saveResolutionValue = document.getElementById('save-resolution-value');
const saveSizeInfo = document.getElementById('save-size-info');
const saveSizeW = document.getElementById('save-size-w');
const saveSizeH = document.getElementById('save-size-h');
const saveFileSizeInfo = document.getElementById('save-file-size');
const qualityRow = document.getElementById('quality-row');
const losslessCompressRow = document.getElementById('lossless-compress-row');
const losslessCompressCheckbox = document.getElementById('save-lossless-compress');
const savePreviewCanvas = document.getElementById('save-preview-canvas');

// ========== 工具函数 ==========

// ========== 行列拖拽把手（DOM 元素） ==========

const gripVerticalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>`;
const gripHorizontalSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="9" r="1"/><circle cx="19" cy="9" r="1"/><circle cx="5" cy="9" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="19" cy="15" r="1"/><circle cx="5" cy="15" r="1"/></svg>`;

let gripElements = [];

function updateGripHandles() {
  const lr = state.lastLayoutResult;
  if (!lr || !lr._groupBounds || state.images.length === 0) {
    clearGripHandles();
    return;
  }

  const gb = lr._groupBounds;
  const isHorizontal = state.layoutMode === 'horizontal';
  const showGrips = gb.length > 1 && state.editModeImageId === -1;
  const ds = lr._displayScale || 1;
  const sf = lr.scaleFactor * ds;
  const ws = canvas.parentElement;

  // 确保 grip 数量匹配
  while (gripElements.length < gb.length) {
    const el = document.createElement('div');
    el.className = 'grip-handle';
    gripContainer.appendChild(el);
    gripElements.push(el);
  }
  while (gripElements.length > gb.length) {
    const el = gripElements.pop();
    el.remove();
  }

  // 计算画布在 workspace 中的位置（必须在读取前触发 layout）
  const canvasRect = canvas.getBoundingClientRect();
  const wsRect = ws.getBoundingClientRect();
  const canvasOffX = canvasRect.left - wsRect.left;
  const canvasOffY = canvasRect.top - wsRect.top;

  // 更新 SVG 和定位
  for (let i = 0; i < gb.length; i++) {
    const el = gripElements[i];
    el.innerHTML = isHorizontal ? gripVerticalSvg : gripHorizontalSvg;

    if (showGrips && !(state.isRowDragging && state.dragGroupIndex === i)) {
      el.style.display = 'flex';
      el.classList.remove('dragging');
    } else {
      el.style.display = 'none';
    }

    if (isHorizontal) {
      // 横排模式：把手紧贴画布左侧，纵向对齐行中心
      const rowCenterY = gb[i].y * sf + gb[i].height * sf / 2;
      el.style.left = (canvasOffX - GRIP_STRIP / 2 - GRIP_ICON_SIZE / 2) + 'px';
      el.style.top = (canvasOffY + rowCenterY - GRIP_ICON_SIZE / 2) + 'px';
      el.style.width = GRIP_ICON_SIZE + 'px';
      el.style.height = GRIP_ICON_SIZE + 'px';
    } else {
      // 竖排模式：把手紧贴画布上方，横向对齐列中心
      const colCenterX = gb[i].x * sf + gb[i].width * sf / 2;
      el.style.left = (canvasOffX + colCenterX - GRIP_ICON_SIZE / 2) + 'px';
      el.style.top = (canvasOffY - GRIP_STRIP / 2 - GRIP_ICON_SIZE / 2) + 'px';
      el.style.width = GRIP_ICON_SIZE + 'px';
      el.style.height = GRIP_ICON_SIZE + 'px';
    }
  }
}

function clearGripHandles() {
  for (const el of gripElements) el.remove();
  gripElements = [];
}

// 把手条始终预留空间：给 workspace 加 padding
function updateCanvasMargin() {
  const ws = canvas.parentElement;
  if (state.images.length === 0 || !state.lastLayoutResult || state.lastLayoutResult.width === 0) {
    ws.style.paddingLeft = '';
    ws.style.paddingTop = '';
    return;
  }
  const isHorizontal = state.layoutMode === 'horizontal';
  ws.style.paddingLeft = isHorizontal ? GRIP_STRIP + 'px' : '';
  ws.style.paddingTop = isHorizontal ? '' : GRIP_STRIP + 'px';
}

function loadImageFromDataURL(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image'));
    };
    img.src = objectUrl;
  });
}

function updateStatusBar() {
  const n = state.images.length;
  if (n === 0) { statusBar.textContent = '拖拽或点击添加图片开始拼图'; return; }
  const lr = state.lastLayoutResult;
  if (!lr) return;
  const w = Math.round(lr.width * lr.scaleFactor);
  const h = Math.round(lr.height * lr.scaleFactor);
  let text = `${n} 张图片 · ${w} × ${h}`;
  if (lr.isScaledDown) text += '（已缩放）';
  statusBar.textContent = text;
}

// ========== 拖拽插入位置计算 ==========

function computeInsertIndexInGroup(mouseX, mouseY, groupImageIds, dragImageId, layoutMode) {
  const lr = state.lastLayoutResult;
  if (!lr) return -1;
  const sf = lr.scaleFactor * (lr._displayScale || 1);
  const nonDragged = groupImageIds.filter(id => id !== dragImageId);

  for (let i = 0; i < nonDragged.length; i++) {
    const img = imagePool.get(nonDragged[i]);
    if (!img) continue;
    const midpoint = layoutMode === 'horizontal'
      ? (img.x + img.renderWidth / 2) * sf
      : (img.y + img.renderHeight / 2) * sf;
    const mouseVal = layoutMode === 'horizontal' ? mouseX : mouseY;
    if (mouseVal < midpoint) return i;
  }
  return nonDragged.length;
}

function computeDropZone(mouseX, mouseY) {
  const lr = state.lastLayoutResult;
  if (!lr || !lr._groupBounds || lr._groupBounds.length === 0) return null;
  const sf = lr.scaleFactor * (lr._displayScale || 1);
  const gb = lr._groupBounds;
  const totalImages = state.images.length;
  const isHorizontal = state.layoutMode === 'horizontal';
  const mouseVal = isHorizontal ? mouseY : mouseX;
  const crossVal = isHorizontal ? mouseX : mouseY;

  // 接近边缘的触发阈值（UI 屏幕像素），转换为布局空间后使用
  const EDGE_THRESHOLD = 40; // 屏幕像素

  // 计算整体布局边界（屏幕像素）
  const layoutStart = isHorizontal ? gb[0].y * sf : gb[0].x * sf;
  const layoutEnd = isHorizontal
    ? (gb[gb.length - 1].y + gb[gb.length - 1].height) * sf
    : (gb[gb.length - 1].x + gb[gb.length - 1].width) * sf;
  const crossStart = isHorizontal ? gb[0].x * sf : gb[0].y * sf;
  const crossEnd = isHorizontal
    ? (gb[0].x + gb[0].width) * sf
    : (gb[0].y + gb[0].height) * sf;

  // 交叉轴必须在布局范围内
  if (crossVal < crossStart - 20 || crossVal > crossEnd + 20) return null;

  // 接近上/左边缘 → 在第一个组之前创建新组
  if (mouseVal < layoutStart + EDGE_THRESHOLD) {
    if (totalImages >= 3) {
      return { type: 'new-group', position: 'before', groupIndex: 0 };
    }
    return null;
  }

  // 接近下/右边缘 → 在最后一个组之后创建新组
  if (mouseVal > layoutEnd - EDGE_THRESHOLD) {
    if (totalImages >= 3) {
      return { type: 'new-group', position: 'after', groupIndex: gb.length - 1 };
    }
    return null;
  }

  // 遍历每个组的边界，确定鼠标在哪个组内部或组之间
  for (let i = 0; i < gb.length; i++) {
    const bound = gb[i];
    const start = isHorizontal ? bound.y * sf : bound.x * sf;
    const end = isHorizontal ? (bound.y + bound.height) * sf : (bound.x + bound.width) * sf;

    // 不在这个组的范围内，跳过
    if (mouseVal < start || mouseVal > end) continue;

    // 在组内部 — 计算组内插入位置
    const groupIds = state.groups[i];
    const insertIndex = computeInsertIndexInGroup(mouseX, mouseY, groupIds, state.dragImageId, state.layoutMode);
    return { type: 'reorder', groupIndex: i, insertIndex };
  }

  return null;
}

function updateButtonStates() {
  const hasImages = state.images.length > 0;
  const editing = state.editModeImageId !== -1;
  btnCopy.disabled = !hasImages || editing;
  btnSave.disabled = !hasImages || editing;
  btnClear.disabled = !hasImages || editing;
  btnUndo.disabled = !state.undoManager.canUndo();
  btnRedo.disabled = !state.undoManager.canRedo();
  btnRatio.disabled = !hasImages || editing;
  btnCanvasRatio.disabled = !hasImages || editing;
}

function showScaleToast(show) {
  scaleToast.classList.toggle('visible', show);
  if (show) {
    clearTimeout(scaleToast._timer);
    scaleToast._timer = setTimeout(() => scaleToast.classList.remove('visible'), 3000);
  }
}

// ========== 画布比例强制 ==========

function enforceCanvasRatio() {
  if (!state.canvasRatioLocked || state._canvasRatioDragging) return;
  if (state.images.length === 0) return;

  const entry = ASPECT_RATIOS[state.canvasRatioIndex];
  if (!entry || entry.ratio === null) return;
  const R_t = entry.ratio;

  // 检测实际画布比例（基于布局结果，已包含组间匹配缩放），如果已匹配目标则跳过
  const lr = state.lastLayoutResult;
  if (lr && lr.width > 0 && lr.height > 0) {
    const actualRatio = lr.width / lr.height;
    if (Math.abs(actualRatio - R_t) < 0.005) return;
  }

  const isHorizontal = state.layoutMode === 'horizontal';
  const groups = state.groups;

  // 收集每组数据：refCross（固定轴参考值）、natSum（自然比例之和）
  // 横排：固定轴=高度，natSum = Σ(cropW/cropH)
  // 竖排：固定轴=宽度，natSum = Σ(cropH/cropW)
  const groupData = [];
  const srcGroups = groups.length > 0 ? groups : [state.images.map(i => i.id)];
  for (const group of srcGroups) {
    const imgs = Array.isArray(group[0])
      ? group // shouldn't happen, safety
      : group.map(id => imagePool.get(id)).filter(Boolean);
    if (imgs.length === 0) { groupData.push(null); continue; }
    let refCross = 0, natSum = 0;
    for (const img of imgs) {
      const effW = img.editState ? img.editState.cropWidth : img.originalWidth;
      const effH = img.editState ? img.editState.cropHeight : img.originalHeight;
      if (isHorizontal) {
        refCross = Math.max(refCross, effH);
        natSum += effW / effH;
      } else {
        refCross = Math.max(refCross, effW);
        natSum += effH / effW;
      }
    }
    groupData.push({ imgs, refCross, natSum });
  }

  if (isHorizontal) {
    // 横排：等比缩放 cropWidth，S = R_t / R_nat
    // 多组时按 refH 加权确保组等宽
    if (groupData.length <= 1) {
      const g = groupData[0];
      if (!g || g.natSum === 0) return;
      applyScaleToImages(g.imgs, R_t / g.natSum);
    } else {
      const totalRef = groupData.reduce((s, g) => g ? s + g.refCross : s, 0);
      if (totalRef === 0) return;
      for (const g of groupData) {
        if (!g || g.natSum === 0) continue;
        applyScaleToImages(g.imgs, R_t * totalRef / (g.refCross * g.natSum));
      }
    }
  } else {
    // 竖排：统一 cropW = R_t × Σ(cropH_i)，确保同列等宽
    // 多组时取最大 totalCropH 确保列等高
    if (groupData.length <= 1) {
      const g = groupData[0];
      if (!g || g.natSum === 0) return;
      // totalCropH = refCross × natSum（因 natSum = Σ(cropH/cropW)，且 cropW ≈ refCross）
      // 直接从图片取更准确
      let totalCropH = 0;
      for (const img of g.imgs) {
        totalCropH += img.editState ? img.editState.cropHeight : img.originalHeight;
      }
      if (totalCropH === 0) return;
      applyUniformWidth(g.imgs, Math.max(50, Math.round(R_t * totalCropH)));
    } else {
      // 多列：uniformW = R_t / Σ(1/totalCropH_g)
      // 布局等高缩放后每列宽度 = uniformW × maxH / totalCropH_g
      // 总宽 = uniformW × maxH × Σ(1/totalCropH_g) = R_t × maxH，比例 = R_t
      const groupCropHs = [];
      for (const g of groupData) {
        if (!g) { groupCropHs.push(0); continue; }
        let h = 0;
        for (const img of g.imgs) h += img.editState ? img.editState.cropHeight : img.originalHeight;
        groupCropHs.push(h);
      }
      const sumInv = groupCropHs.reduce((s, h) => h > 0 ? s + 1 / h : s, 0);
      if (sumInv === 0) return;
      const uniformW = Math.max(50, Math.round(R_t / sumInv));
      for (const g of groupData) {
        if (!g) continue;
        applyUniformWidth(g.imgs, uniformW);
      }
    }
  }

  // 消除 Math.round 累积误差：调整一个图片 cropW 使画布尺寸完美匹配目标比例
  const newLr = computeGroupedLayout(state.groups, imagePool, state.layoutMode);
  const isH = state.layoutMode === 'horizontal';
  const targetMain = isH ? Math.round(newLr.height * R_t) : Math.round(newLr.width / R_t);
  const currentMain = isH ? newLr.width : newLr.height;
  const delta = targetMain - currentMain;
  if (delta !== 0 && Math.abs(delta) <= 2) {
    // 找到最宽/最高的组的最后一张图片
    const srcGroups2 = state.groups.length > 0 ? state.groups : [state.images.map(i => i.id)];
    let bestGroup = null, bestMain = 0;
    for (const group of srcGroups2) {
      const ids = Array.isArray(group[0]) ? group.flat() : group;
      let mainSum = 0;
      for (const id of ids) {
        const img = imagePool.get(id);
        if (img) mainSum += img.renderWidth || 0;
      }
      if (mainSum > bestMain) { bestMain = mainSum; bestGroup = ids; }
    }
    if (bestGroup && bestGroup.length > 0) {
      const lastImg = imagePool.get(bestGroup[bestGroup.length - 1]);
      if (lastImg && lastImg.editState) {
        const refCross = isH
          ? Math.max(...bestGroup.map(id => { const i = imagePool.get(id); return i ? (i.editState ? i.editState.cropHeight : i.originalHeight) : 0; }))
          : Math.max(...bestGroup.map(id => { const i = imagePool.get(id); return i ? (i.editState ? i.editState.cropWidth : i.originalWidth) : 0; }));
        const effH = lastImg.editState.cropHeight;
        const effW = lastImg.editState.cropWidth;
        const scale = refCross / effH;
        const oldRW = Math.round(effW * scale);
        if (oldRW > 0) {
          const newCropW = Math.max(50, Math.round(effW * (oldRW + delta) / oldRW));
          lastImg.editState.cropWidth = newCropW;
          clampPan(lastImg);
          state.lastLayoutResult = computeGroupedLayout(state.groups, imagePool, state.layoutMode);
          return;
        }
      }
    }
  }
}

function applyScaleToImages(images, S) {
  for (const img of images) {
    const effH = img.editState ? img.editState.cropHeight : img.originalHeight;
    const r_i = (img.editState ? img.editState.cropWidth : img.originalWidth) / effH;
    const newCropW = Math.max(50, Math.round(effH * r_i * S));

    if (!img.editState) {
      img.editState = { cropWidth: newCropW, cropHeight: effH, zoom: 1, panX: 0, panY: 0, rotation: 0 };
    } else {
      img.editState.cropWidth = newCropW;
      clampPan(img);
    }
  }
}

function applyUniformWidth(images, uniformW) {
  for (const img of images) {
    if (!img.editState) {
      img.editState = { cropWidth: uniformW, cropHeight: img.originalHeight, zoom: 1, panX: 0, panY: 0, rotation: 0 };
    } else {
      img.editState.cropWidth = uniformW;
      clampPan(img);
    }
  }
}

// ========== 渲染 ==========

function recomputeAndRender() {
  enforceCanvasRatio();
  state.lastLayoutResult = computeGroupedLayout(state.groups, imagePool, state.layoutMode);
  setLayoutResult(state.lastLayoutResult);
  // Expose annotation data to stitch-engine (no module cycle)
  window.__annotations = state.annotations;
  window.__annotationDrawing = state._annotationDrawing;
  window.__activeAnnotationTool = state.activeAnnotationTool;
  window.__editModeImageId = state.editModeImageId;
  const result = renderPreview(canvas, state.lastLayoutResult, {
    hoveredCloseId: state.hoveredCloseId,
    hoveredImageId: state.hoveredImageId,
    isDragging: state.isDragging,
    dragImageId: state.dragImageId,
    dragCurrentMX: state.dragCurrentMX,
    dragCurrentMY: state.dragCurrentMY,
    dragStartMX: state.dragStartMX,
    dragStartMY: state.dragStartMY,
    dragInsertIndex: state.dragInsertIndex,
    dragTargetGroupIndex: state.dragTargetGroupIndex,
    layoutMode: state.layoutMode,
    editModeImageId: state.editModeImageId,
    editAction: state.editAction,
    hoveredSaveBtn: state.hoveredSaveBtn,
    hoveredResetBtn: state.hoveredResetBtn,
    hoveredRotateBtn: state.hoveredRotateBtn,
    hoveredRatioBtn: state.hoveredRatioBtn,
    showRatioMenu: state.showRatioMenu,
    hoveredRatioIndex: state.hoveredRatioIndex,
    hoveredEditBtnId: state.hoveredEditBtnId,
    hoveredDupBtnId: state.hoveredDupBtnId,
    hoveredDlBtnId: state.hoveredDlBtnId,
    dropZone: state.dropZone,
    groups: state.groups,
    imagePool: imagePool,
    // 行列拖拽
    isRowDragging: state.isRowDragging,
    dragGroupIndex: state.dragGroupIndex,
    dragGroupCurrentMX: state.dragGroupCurrentMX,
    dragGroupCurrentMY: state.dragGroupCurrentMY,
    dragGroupStartMX: state.dragGroupStartMX,
    dragGroupStartMY: state.dragGroupStartMY,
    dragGroupDropIndex: state.dragGroupDropIndex,
  });
  if (result) {
    state.lastLayoutResult._displayScale = result.displayScale;
    state.lastLayoutResult._gripOffX = result.gripOffX || 0;
    state.lastLayoutResult._gripOffY = result.gripOffY || 0;
  }
  updateCanvasMargin();
  // 强制浏览器完成 layout，使 getBoundingClientRect 返回正确值
  canvas.getBoundingClientRect();
  updateGripHandles();
  updateStatusBar();
  updateButtonStates();
  if (state.editModeImageId === -1) showScaleToast(state.lastLayoutResult.isScaledDown);
}

function captureEditStates() {
  const editStates = {};
  for (const img of state.images) {
    if (img.editState) {
      editStates[img.id] = {
        cropWidth: img.editState.cropWidth,
        cropHeight: img.editState.cropHeight,
        zoom: img.editState.zoom,
        panX: img.editState.panX,
        panY: img.editState.panY,
        rotation: img.editState.rotation,
      };
    }
  }
  return editStates;
}

function pushUndo() {
  state.undoManager.push({
    groups: state.groups.map(g => [...g]),
    layoutMode: state.layoutMode,
    editStates: captureEditStates(),
    editModeImageId: state.editModeImageId,
    canvasRatioLocked: state.canvasRatioLocked,
    canvasRatioIndex: state.canvasRatioIndex,
    annotations: structuredClone(Array.from(state.annotations.entries())),
  });
}

// ========== 添加图片 ==========

async function addImages(imageFilesOrDataUrls) {
  pushUndo();

  if (state.groups.length === 0) {
    state.groups.push([]);
  }
  const targetGroup = state.groups[state.groups.length - 1];

  for (const item of imageFilesOrDataUrls) {
    try {
      let img;
      if (item instanceof File) img = await loadImageFromFile(item);
      else img = await loadImageFromDataURL(item);

      const imageItem = new ImageItem(img, item instanceof File ? item.name : 'pasted_image.png');
      // 自动裁剪：新图片按全局比例裁剪
      if (state.autoCropNewImages && state.globalRatioIndex >= 0) {
        applyRatioToImage(imageItem, ASPECT_RATIOS[state.globalRatioIndex]);
      }
      imagePool.set(imageItem.id, imageItem);
      targetGroup.push(imageItem.id);
    } catch (e) {
      console.error('Failed to load image:', e);
    }
  }

  syncImagesFromGroups();
  recomputeAndRender();
}

function duplicateImage(original) {
  pushUndo();
  const dup = new ImageItem(original.image, original.fileName);
  if (original.editState) {
    dup.editState = { ...original.editState };
  }
  imagePool.set(dup.id, dup);
  for (const group of state.groups) {
    const idx = group.indexOf(original.id);
    if (idx !== -1) { group.splice(idx + 1, 0, dup.id); break; }
  }
  syncImagesFromGroups();
  recomputeAndRender();
}

// ========== 事件绑定 ==========

addImagesInput.addEventListener('change', async (e) => {
  if (state.editModeImageId !== -1) return; // 编辑模式下禁用
  const files = Array.from(e.target.files);
  if (files.length > 0) await addImages(files);
  e.target.value = '';
});

layoutBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const mode = btn.dataset.layout;
    if (mode === state.layoutMode) return;
    if (state.editModeImageId !== -1) return;
    // 切换布局时自动解除画布比例锁定
    if (state.canvasRatioLocked) deactivateCanvasRatioLock();
    state.layoutMode = mode;
    computeGroupedLayout(state.groups, imagePool, state.layoutMode);
    for (const img of state.images) {
      if (img.editState) {
        img.editState.cropWidth = img.renderWidth;
        img.editState.cropHeight = img.renderHeight;
      }
    }
    layoutBtns.forEach(b => b.classList.toggle('active', b.dataset.layout === mode));
    recomputeAndRender();
  });
});

// ========== 全局快捷比例 ==========

function buildRatioDropdown() {
  // Header: 恢复原图比例
  const header = document.createElement('div');
  header.className = 'ratio-header';
  header.dataset.index = '0';
  header.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M14 15H9v-5"/><path d="M16 3h5v5"/><path d="M21 3 9 15"/></svg>
    <span>恢复原图比例</span>
  `;
  ratioDropdown.appendChild(header);

  // 网格
  const grid = document.createElement('div');
  grid.className = 'ratio-grid';
  for (let i = 1; i < ASPECT_RATIOS.length; i++) {
    const r = ASPECT_RATIOS[i].ratio;
    const maxH = 24, maxW = 36;
    let pw, ph;
    if (maxW / maxH > r) { ph = maxH; pw = maxH * r; }
    else { pw = maxW; ph = maxW / r; }
    const item = document.createElement('div');
    item.className = 'ratio-grid-item';
    item.dataset.index = String(i);
    item.innerHTML = `<div class="ratio-preview" style="width:${pw}px;height:${ph}px"></div><span>${ASPECT_RATIOS[i].label}</span>`;
    grid.appendChild(item);
  }
  ratioDropdown.appendChild(grid);

  // 底部：新图片自动裁切开关
  const footer = document.createElement('div');
  footer.className = 'ratio-footer';
  footer.innerHTML = `
    <span>新图片自动调整</span>
    <label class="ratio-toggle" title="添加的新图片自动调整为当前选定比例"><input type="checkbox" id="ratio-auto-crop" /><span class="ratio-toggle-slider"></span></label>
  `;
  ratioDropdown.appendChild(footer);
}

function buildCanvasRatioDropdown() {
  const header = document.createElement('div');
  header.className = 'ratio-header';
  header.dataset.canvasIndex = '0';
  header.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
    <span>恢复自由比例</span>
  `;
  canvasRatioDropdown.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'ratio-grid';
  for (let i = 1; i < ASPECT_RATIOS.length; i++) {
    const r = ASPECT_RATIOS[i].ratio;
    const maxH = 24, maxW = 36;
    let pw, ph;
    if (maxW / maxH > r) { ph = maxH; pw = maxH * r; }
    else { pw = maxW; ph = maxW / r; }
    const item = document.createElement('div');
    item.className = 'ratio-grid-item';
    item.dataset.canvasIndex = String(i);
    item.innerHTML = `<div class="ratio-preview" style="width:${pw}px;height:${ph}px"></div><span>${ASPECT_RATIOS[i].label}</span>`;
    grid.appendChild(item);
  }
  canvasRatioDropdown.appendChild(grid);
}

function deactivateCanvasRatioLock() {
  state.canvasRatioLocked = false;
  state.canvasRatioIndex = -1;
  btnCanvasRatio.classList.remove('locked');
  canvasRatioDropdown.querySelectorAll('[data-canvas-index]').forEach(el => {
    el.classList.remove('active');
  });
  updateButtonStates();
}

function applyGlobalRatio(index) {
  const entry = ASPECT_RATIOS[index];
  if (state.images.length === 0) return;
  pushUndo();
  for (const img of state.images) {
    applyRatioToImage(img, entry);
  }
  recomputeAndRender();
}

function applyRatioToImage(img, entry) {
  const ratio = entry.ratio !== null ? entry.ratio : img.originalWidth / img.originalHeight;
  const origW = img.originalWidth;
  const origH = img.originalHeight;

  // 计算裁剪尺寸（用原始尺寸，不考虑旋转/缩放，因为是全局操作）
  let cropW, cropH;
  if (origW / origH > ratio) {
    cropH = origH;
    cropW = origH * ratio;
  } else {
    cropW = origW;
    cropH = origW / ratio;
  }
  cropW = Math.max(50, cropW);
  cropH = Math.max(50, cropH);

  img.editState = {
    cropWidth: cropW,
    cropHeight: cropH,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    rotation: 0,
  };
}

function resetGlobalRatio() {
  if (state.images.length === 0) return;
  pushUndo();
  for (const img of state.images) {
    img.editState = null;
  }
  computeGroupedLayout(state.groups, imagePool, state.layoutMode);
  // 用布局后的 renderWidth/Height 重新初始化 editState
  for (const img of state.images) {
    const rw = img.renderWidth;
    const rh = img.renderHeight;
    img.editState = {
      cropWidth: rw,
      cropHeight: rh,
      zoom: 1.0,
      panX: 0,
      panY: 0,
      rotation: 0,
    };
  }
  recomputeAndRender();
}

buildRatioDropdown();

const ratioAutoCropCheckbox = document.getElementById('ratio-auto-crop');

btnRatio.addEventListener('click', () => {
  if (state.editModeImageId !== -1) return;
  ratioDropdown.classList.toggle('open');
});

// 点击菜单外关闭
document.addEventListener('mousedown', (e) => {
  if (!ratioDropdown.classList.contains('open')) return;
  const wrapper = btnRatio.closest('.ratio-toolbar-wrapper');
  if (!wrapper.contains(e.target)) {
    ratioDropdown.classList.remove('open');
  }
});

// 菜单项点击
ratioDropdown.addEventListener('click', (e) => {
  const item = e.target.closest('[data-index]');
  if (!item) return;
  const index = parseInt(item.dataset.index);
  // 调整比例时自动解除画布比例锁定
  if (state.canvasRatioLocked) deactivateCanvasRatioLock();
  if (index === 0) {
    // 恢复原图比例：重置所有图片的裁剪
    state.globalRatioIndex = 0;
    resetGlobalRatio();
  } else {
    state.globalRatioIndex = index;
    applyGlobalRatio(index);
  }
  // 更新活跃状态
  ratioDropdown.querySelectorAll('[data-index]').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.index) === state.globalRatioIndex);
  });
  ratioDropdown.classList.remove('open');
});

// 自动裁剪开关
ratioAutoCropCheckbox.addEventListener('change', () => {
  state.autoCropNewImages = ratioAutoCropCheckbox.checked;
});

// 锁定全局画布比例
buildCanvasRatioDropdown();

btnCanvasRatio.addEventListener('click', () => {
  if (state.editModeImageId !== -1) return;
  canvasRatioDropdown.classList.toggle('open');
});

// 点击菜单外关闭
document.addEventListener('mousedown', (e) => {
  if (!canvasRatioDropdown.classList.contains('open')) return;
  const wrapper = btnCanvasRatio.closest('.ratio-toolbar-wrapper');
  if (!wrapper.contains(e.target)) {
    canvasRatioDropdown.classList.remove('open');
  }
});

// 菜单项点击
canvasRatioDropdown.addEventListener('click', (e) => {
  const item = e.target.closest('[data-canvas-index]');
  if (!item) return;
  const index = parseInt(item.dataset.canvasIndex);

  if (index === 0) {
    // 恢复自由比例
    deactivateCanvasRatioLock();
  } else {
    // 激活锁定
    if (state.images.length === 0) return;
    pushUndo();
    state.canvasRatioLocked = true;
    state.canvasRatioIndex = index;
    btnCanvasRatio.classList.add('locked');
    // 关闭"新图片自动调整"
    state.autoCropNewImages = false;
    ratioAutoCropCheckbox.checked = false;
  }

  // 更新活跃状态
  canvasRatioDropdown.querySelectorAll('[data-canvas-index]').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.canvasIndex) === state.canvasRatioIndex);
  });
  canvasRatioDropdown.classList.remove('open');
  updateButtonStates();
  recomputeAndRender();

  // 更新状态栏
  if (state.canvasRatioLocked) {
    statusBar.textContent = `画布比例已锁定: ${ASPECT_RATIOS[state.canvasRatioIndex].label}`;
  } else {
    if (state.images.length > 0) {
      statusBar.textContent = '拖拽图片调整位置，点击编辑';
    } else {
      statusBar.textContent = '拖拽或点击添加图片开始拼图';
    }
  }
});

// ========== 撤销/重做 ==========

btnUndo.addEventListener('click', () => doUndo());
btnRedo.addEventListener('click', () => doRedo());
btnClear.addEventListener('click', () => {
  if (state.images.length === 0) return;
  if (state.editModeImageId !== -1) return; // 编辑模式下禁用
  pushUndo();
  state.groups = [];
  state.dropZone = null;
  gcImagePool();
  syncImagesFromGroups();
  state.hoveredImageId = -1;
  state.hoveredCloseId = -1;
  deactivateCanvasRatioLock();
  recomputeAndRender();
});

function makeCurrentSnapshot() {
  return {
    groups: state.groups.map(g => [...g]),
    layoutMode: state.layoutMode,
    editStates: captureEditStates(),
    editModeImageId: state.editModeImageId,
    canvasRatioLocked: state.canvasRatioLocked,
    canvasRatioIndex: state.canvasRatioIndex,
    annotations: structuredClone(Array.from(state.annotations.entries())),
  };
}

function doUndo() {
  const prev = state.undoManager.undo(makeCurrentSnapshot());
  if (!prev) return;
  restoreSnapshot(prev);
}

function doRedo() {
  const next = state.undoManager.redo(makeCurrentSnapshot());
  if (!next) return;
  restoreSnapshot(next);
}

function restoreSnapshot(snapshot) {
  state.groups = snapshot.groups.map(g => [...g]);
  syncImagesFromGroups();
  gcImagePool();
  state.layoutMode = snapshot.layoutMode;
  // 恢复画布比例锁定状态
  state.canvasRatioLocked = snapshot.canvasRatioLocked || false;
  state.canvasRatioIndex = snapshot.canvasRatioIndex ?? -1;
  state._canvasRatioDragging = false;
  if (state.canvasRatioLocked) {
    btnCanvasRatio.classList.add('locked');
  } else {
    btnCanvasRatio.classList.remove('locked');
  }
  canvasRatioDropdown.querySelectorAll('[data-canvas-index]').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.canvasIndex) === state.canvasRatioIndex);
  });
  // 恢复编辑状态
  if (snapshot.editStates) {
    for (const img of state.images) {
      const es = snapshot.editStates[img.id];
      if (es) {
        img.editState = { ...es };
      } else {
        img.editState = null;
      }
    }
  } else {
    for (const img of state.images) {
      img.editState = null;
    }
  }
  // 恢复标注
  state.annotations = new Map(snapshot.annotations || []);
  // 仅在当前处于编辑模式时才恢复编辑模式状态
  if (state.editModeImageId !== -1) {
    state.editModeImageId = snapshot.editModeImageId ?? -1;
    if (state.editModeImageId !== -1) {
      const editImg = state.images.find(i => i.id === state.editModeImageId);
      if (!editImg) state.editModeImageId = -1;
    }
  } else {
    state.editModeImageId = -1;
  }
  state.editAction = null;
  state.editActionStart = null;
  layoutBtns.forEach(b => b.classList.toggle('active', b.dataset.layout === state.layoutMode));
  recomputeAndRender();
  updateButtonStates();
}

// ========== 复制/保存 ==========

btnCopy.addEventListener('click', () => {
  if (state.editModeImageId !== -1) return;
  copyToClipboard();
});

function showCopyToast() {
  copyToast.classList.add('visible');
  clearTimeout(copyToast._timer);
  copyToast._timer = setTimeout(() => copyToast.classList.remove('visible'), 2500);
}

async function copyToClipboard() {
  if (state.images.length === 0) return;
  const dataUrl = exportImage(state.lastLayoutResult, 'png', 100, 1);
  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    showCopyToast();
  } catch (e) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_image_to_clipboard', { dataUrl });
      showCopyToast();
    } catch (e2) {
      console.error('Copy failed:', e2);
      statusBar.textContent = '复制失败';
    }
  }
}

btnSave.addEventListener('click', () => {
  if (state.editModeImageId !== -1) return;
  openSaveModal();
});
document.getElementById('save-modal-close').addEventListener('click', closeSaveModal);
document.getElementById('save-modal-cancel').addEventListener('click', closeSaveModal);
saveFormatSelect.addEventListener('change', updateSavePreview);
losslessCompressCheckbox.addEventListener('change', updateSavePreview);
saveQualitySlider.addEventListener('input', () => {
  saveQualityValue.textContent = saveQualitySlider.value;
  updateSavePreview();
});
saveResolutionSelect.addEventListener('input', () => {
  saveResolutionValue.textContent = saveResolutionSelect.value;
  updateSavePreview();
});

function openSaveModal() {
  if (state.images.length === 0) return;
  const headerSpan = saveModal.querySelector('.modal-header span');
  if (headerSpan) {
    headerSpan.textContent = state.saveTargetImage ? '保存单张图片' : '保存图片';
  }
  saveModal.classList.add('modal-open');
  updateSavePreview();
}
function closeSaveModal() {
  saveModal.classList.remove('modal-open');
  state.saveTargetImage = null;
}

// ========== 双击内联编辑（参考 laymask） ==========

function enableInlineEdit(displayEl, { min, max, apply }) {
  let input = null;
  let originalValue = 0;

  function commit() {
    if (!input) return;
    let val = parseFloat(input.value);
    if (isNaN(val)) val = originalValue;
    val = Math.round(val);
    val = Math.max(min, Math.min(max, val));
    displayEl.textContent = val;
    displayEl.style.display = '';
    input.remove();
    input = null;
    apply(val, originalValue);
  }

  function cancel() {
    if (!input) return;
    displayEl.textContent = originalValue;
    displayEl.style.display = '';
    input.remove();
    input = null;
  }

  displayEl.addEventListener('dblclick', (e) => {
    e.preventDefault();
    originalValue = parseInt(displayEl.textContent, 10);
    input = document.createElement('input');
    input.type = 'text';
    input.className = 'inline-edit-input';
    input.value = displayEl.textContent;
    displayEl.style.display = 'none';
    displayEl.parentNode.insertBefore(input, displayEl.nextSibling);
    input.focus();
    input.select();
  });

  document.addEventListener('keydown', (e) => {
    if (!input) return;
    if (e.key === 'Enter') { e.preventDefault(); commit(); }
    else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });

  document.addEventListener('mousedown', (e) => {
    if (!input) return;
    if (e.target === input || (input.parentNode && input.parentNode.contains(e.target))) return;
    commit();
  });
}

// 分辨率数值双击编辑
enableInlineEdit(saveResolutionValue, {
  min: 10, max: 300,
  apply(val) {
    saveResolutionSelect.value = val;
    updateSavePreview();
  },
});

// 尺寸双击编辑（宽高联动）
function enableDimensionEdit(el, isWidth) {
  enableInlineEdit(el, {
    min: 1, max: 20000,
    apply(val) {
      const baseW = saveSizeInfo._baseW || 1;
      const baseH = saveSizeInfo._baseH || 1;
      const exactRes = isWidth ? val / baseW : val / baseH;
      const clampedRes = Math.max(0.1, Math.min(2, exactRes));
      const pct = Math.round(clampedRes * 100);
      saveResolutionSelect.value = pct;
      saveResolutionValue.textContent = pct;
      updateSavePreview();
      // 编辑的值保持不变，只修正另一个
      if (isWidth) {
        saveSizeW.textContent = val;
        saveSizeH.textContent = Math.round(baseH * clampedRes);
      } else {
        saveSizeH.textContent = val;
        saveSizeW.textContent = Math.round(baseW * clampedRes);
      }
    },
  });
}
enableDimensionEdit(saveSizeW, true);
enableDimensionEdit(saveSizeH, false);

function updateSavePreview() {
  const format = saveFormatSelect.value;
  const quality = parseInt(saveQualitySlider.value);
  const resolution = parseFloat(saveResolutionSelect.value) / 100;
  qualityRow.style.display = format === 'jpg' ? '' : 'none';
  losslessCompressRow.style.display = format === 'png' ? '' : 'none';

  let baseW, baseH, du;

  if (state.saveTargetImage) {
    const img = state.saveTargetImage;
    baseW = img.editState ? img.editState.cropWidth : img.originalWidth;
    baseH = img.editState ? img.editState.cropHeight : img.originalHeight;
    du = generateSingleImagePreviewDataURL(img, format, quality);
  } else {
    if (!state.lastLayoutResult) return;
    baseW = Math.round(state.lastLayoutResult.width * state.lastLayoutResult.scaleFactor);
    baseH = Math.round(state.lastLayoutResult.height * state.lastLayoutResult.scaleFactor);
    du = generatePreviewDataURL(format, quality);
  }
  saveSizeInfo._baseW = baseW;
  saveSizeInfo._baseH = baseH;
  const outW = Math.round(baseW * resolution);
  const outH = Math.round(baseH * resolution);
  saveSizeW.textContent = outW;
  saveSizeH.textContent = outH;

  // 使用小尺寸预览（最大 320px），避免大图时滑块卡顿
  try {

    // 按像素比例从预览数据估算最终文件大小
    const previewBase64Len = du.split(',')[1]?.length || 0;
    const previewBytes = previewBase64Len * 0.75;
    const previewScale = Math.min(320 / baseW, 320 / baseH, 1);
    const previewW = Math.round(baseW * previewScale);
    const previewH = Math.round(baseH * previewScale);
    const pixelRatio = (outW * outH) / Math.max(previewW * previewH, 1);
    const rawSize = Math.round(previewBytes * pixelRatio);
    const displaySize = (format === 'png' && losslessCompressCheckbox.checked)
      ? formatFileSize(Math.round(rawSize * 0.75)) : formatFileSize(rawSize);
    saveFileSizeInfo.textContent = displaySize;

    const pi = new Image();
    pi.onload = () => {
      savePreviewCanvas.width = 160;
      savePreviewCanvas.height = 160;
      const c = savePreviewCanvas.getContext('2d');
      const s = Math.min(160 / pi.naturalWidth, 160 / pi.naturalHeight);
      c.drawImage(pi, (160 - s * pi.naturalWidth) / 2, (160 - s * pi.naturalHeight) / 2, s * pi.naturalWidth, s * pi.naturalHeight);
    };
    pi.src = du;
  } catch {
    saveFileSizeInfo.textContent = '-';
  }
}

const saveConfirmBtn = document.getElementById('save-modal-confirm');

document.getElementById('save-modal-confirm').addEventListener('click', async () => {
  const fmt = saveFormatSelect.value;
  const qual = parseInt(saveQualitySlider.value);
  const res = parseFloat(saveResolutionSelect.value) / 100;

  let firstFile;
  if (state.saveTargetImage) {
    firstFile = state.saveTargetImage.fileName || '';
  } else {
    firstFile = state.images[0]?.fileName || '';
  }
  const baseName = firstFile.replace(/\.[^.]+$/, '');
  const ext = fmt === 'png' ? 'png' : 'jpg';
  const defaultName = state.saveTargetImage
    ? `${baseName || 'image'}.${ext}`
    : `minimix_${baseName || ''}.${ext}`;

  // 禁用按钮并进入保存状态
  saveConfirmBtn.classList.add('btn-saving');
  saveConfirmBtn.disabled = true;

  const yieldToUI = () => new Promise(r => setTimeout(r, 20));

  const updateProgress = async (text, percent) => {
    saveConfirmBtn.textContent = `${text} (${percent}%)`;
    await yieldToUI();
  };

  try {
    // 1. 获取保存路径
    let fp = null;
    if (window.__TAURI_INTERNALS__) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      fp = await save({ defaultPath: defaultName, filters: [{ name: '图片', extensions: [ext] }] });
      if (!fp) throw new Error('USER_CANCELLED');
    }

    await updateProgress('正在合成图片', 10);

    // 2. 渲染导出图片
    let du;
    if (state.saveTargetImage) {
      du = exportSingleImage(state.saveTargetImage, fmt, qual, res);
    } else {
      du = exportImage(state.lastLayoutResult, fmt, qual, res);
    }

    await updateProgress('正在转换数据格式', 45);

    // 3. DataURL → 二进制（优先用 fetch 异步解析，降级用分块解码）
    let bytes;
    try {
      const response = await fetch(du);
      const arrayBuffer = await response.arrayBuffer();
      bytes = new Uint8Array(arrayBuffer);
      await updateProgress('数据转换完成', 80);
    } catch (fetchErr) {
      const base64 = du.split(',')[1];
      const binaryStr = atob(base64);
      const len = binaryStr.length;
      bytes = new Uint8Array(len);
      const chunkSize = 1024 * 512;
      for (let i = 0; i < len; i += chunkSize) {
        const end = Math.min(i + chunkSize, len);
        for (let j = i; j < end; j++) bytes[j] = binaryStr.charCodeAt(j);
        await updateProgress('正在转换数据格式', 45 + Math.floor((end / len) * 35));
      }
    }

    await updateProgress('正在写入文件', 90);

    // 4. 写入文件
    if (window.__TAURI_INTERNALS__) {
      const useCompression = fmt === 'png' && losslessCompressCheckbox.checked;
      if (useCompression) {
        await updateProgress('正在压缩PNG', 90);
        const { invoke } = await import('@tauri-apps/api/core');
        const resultMsg = await invoke('compress_and_save_png', { data: Array.from(bytes), path: fp });
        statusBar.textContent = resultMsg;
        setTimeout(updateStatusBar, 3000);
      } else {
        const { writeFile } = await import('@tauri-apps/plugin-fs');
        await writeFile(fp, bytes);
        statusBar.textContent = `已保存: ${fp}`;
        setTimeout(updateStatusBar, 2000);
      }
    } else if ('showSaveFilePicker' in window) {
      const handle = await window.showSaveFilePicker({
        suggestedName: defaultName,
        types: [{ description: '图片', accept: { [fmt === 'png' ? 'image/png' : 'image/jpeg']: [`.${ext}`] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(bytes);
      await writable.close();
    } else {
      const blob = new Blob([bytes], { type: fmt === 'png' ? 'image/png' : 'image/jpeg' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = defaultName;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    await updateProgress('保存成功', 100);
    setTimeout(closeSaveModal, 300);
  } catch (e) {
    if (e.name === 'AbortError' || e.message === 'USER_CANCELLED') {
      // 用户取消，恢复按钮
    } else {
      console.error('Save failed:', e);
      saveConfirmBtn.textContent = '保存失败';
      await yieldToUI();
    }
  } finally {
    setTimeout(() => {
      saveConfirmBtn.classList.remove('btn-saving');
      saveConfirmBtn.disabled = false;
      saveConfirmBtn.textContent = '保存';
    }, 1000);
  }
});

// 信息弹窗
btnInfo.addEventListener('click', () => {
  infoModal.classList.add('modal-open');
  document.getElementById('info-version-number').textContent = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.1.0';
  const iconEl = document.getElementById('info-app-icon');
  iconEl.src = (typeof __APP_ICON__ !== 'undefined' && __APP_ICON__) ? __APP_ICON__ : './images/minimix-logo.png';
});
document.getElementById('info-modal-close').addEventListener('click', () => infoModal.classList.remove('modal-open'));
[saveModal, infoModal].forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('modal-open'); }));

// 在 Tauri 环境下通过 shell.open() 打开外部链接
(function setupAboutLinks() {
  const container = document.getElementById('info-deps');
  const divider = document.getElementById('deps-divider');
  if (!container || !divider) return;

  // 动态渲染第三方依赖
  if (typeof __ABOUT_DEPS__ !== 'undefined' && __ABOUT_DEPS__.length) {
    divider.style.display = 'block';
    const depsContainer = document.createElement('div');
    depsContainer.className = 'info-deps-list';

    __ABOUT_DEPS__.forEach(dep => {
      const item = document.createElement('div');
      item.className = 'info-section';
      const nameEl = document.createElement('span');
      nameEl.className = 'info-label';
      nameEl.textContent = dep.name;

      const linkText = dep.version ? `v${dep.version}` : dep.name;
      const linkEl = document.createElement('a');
      linkEl.className = 'info-value info-value-link';
      linkEl.href = dep.url;
      linkEl.rel = 'noopener noreferrer';
      linkEl.textContent = linkText;

      item.appendChild(nameEl);
      item.appendChild(linkEl);
      depsContainer.appendChild(item);
    });

    container.appendChild(depsContainer);
  }

  // 为所有外部链接绑定点击处理（只执行一次）
  infoModal.querySelectorAll('a[href^="http"]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof window.__TAURI_INTERNALS__ !== 'undefined' || typeof window.__TAURI__ !== 'undefined') {
        import('@tauri-apps/plugin-shell').then(({ open }) => open(a.href));
      } else {
        window.open(a.href, '_blank');
      }
    });
  });
})();

// ========== 自动更新模块 ==========
(async function initUpdater() {
  const btnCheck = document.getElementById('btn-check-update');
  const autoToggle = document.getElementById('auto-update-toggle');
  if (!btnCheck || !autoToggle) return;

  const isTauri = typeof window.__TAURI_INTERNALS__ !== 'undefined';
  if (!isTauri) return;

  btnCheck.disabled = false;

  const origHTML = btnCheck.innerHTML;

  const AUTO_UPDATE_KEY = 'minimix-auto-update';
  const saved = localStorage.getItem(AUTO_UPDATE_KEY);
  if (saved !== null) autoToggle.checked = saved === 'true';
  autoToggle.addEventListener('change', () => {
    localStorage.setItem(AUTO_UPDATE_KEY, String(autoToggle.checked));
  });

  const { check } = await import('@tauri-apps/plugin-updater');
  const { relaunch } = await import('@tauri-apps/plugin-process');

  function resetBtn() {
    btnCheck.className = 'btn btn-update-check';
    btnCheck.disabled = false;
    btnCheck.innerHTML = origHTML;
  }

  async function checkForUpdate({ silent = false } = {}) {
    btnCheck.classList.add('btn-checking');
    btnCheck.disabled = true;
    btnCheck.textContent = '检查中...';

    try {
      const update = await check();
      if (!update) {
        if (!silent) {
          btnCheck.classList.remove('btn-checking');
          btnCheck.classList.add('btn-up-to-date');
          btnCheck.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/></svg> 已是最新';
          setTimeout(resetBtn, 2000);
        } else {
          resetBtn();
        }
        return;
      }

      // 发现新版本，按钮变为"立即更新"
      btnCheck.classList.remove('btn-checking');
      btnCheck.classList.add('btn-has-update');
      btnCheck.disabled = false;
      btnCheck.innerHTML = '<span class="update-ver-text">v' + update.version + '</span><span class="update-action-text">立即更新</span>';

      // 静默检查时显示 toast
      if (silent) {
        const toast = document.getElementById('update-toast');
        const toastText = document.getElementById('update-toast-text');
        const toastBtn = document.getElementById('update-toast-btn');
        const toastClose = document.getElementById('update-toast-close');
        if (toast && toastText && toastBtn && toastClose) {
          toastText.textContent = '发现新版本 v' + update.version;
          toast.classList.add('visible');
          toastBtn.addEventListener('click', () => {
            toast.classList.remove('visible');
            infoModal.classList.add('modal-open');
          });
          toastClose.addEventListener('click', () => toast.classList.remove('visible'));
          setTimeout(() => toast.classList.remove('visible'), 10000);
        }
      }

      // 点击按钮开始下载安装
      btnCheck.addEventListener('click', async function onInstall() {
        btnCheck.classList.remove('btn-has-update');
        btnCheck.classList.add('btn-downloading');
        btnCheck.disabled = true;
        btnCheck.textContent = '准备下载...';

        let downloaded = 0;
        let contentLength = 0;

        try {
          await update.downloadAndInstall((event) => {
            switch (event.event) {
              case 'Started':
                contentLength = event.data.contentLength || 0;
                break;
              case 'Progress':
                downloaded += event.data.chunkLength;
                if (contentLength > 0) {
                  const pct = Math.round((downloaded / contentLength) * 100);
                  btnCheck.textContent = pct + '%';
                } else {
                  btnCheck.textContent = '下载中...';
                }
                break;
              case 'Finished':
                btnCheck.textContent = '安装中...';
                break;
            }
          });

          btnCheck.textContent = '重启中...';
          await relaunch();
        } catch (e) {
          btnCheck.classList.remove('btn-downloading');
          btnCheck.classList.add('btn-error');
          btnCheck.disabled = false;
          btnCheck.textContent = '更新失败';
          setTimeout(resetBtn, 3000);
        }
      }, { once: true });

    } catch (e) {
      if (!silent) {
        btnCheck.classList.remove('btn-checking');
        btnCheck.classList.add('btn-error');
        btnCheck.disabled = false;
        btnCheck.textContent = '检查失败';
        setTimeout(resetBtn, 3000);
      } else {
        resetBtn();
      }
    }
  }

  btnCheck.addEventListener('click', () => checkForUpdate({ silent: false }));

  if (autoToggle.checked) {
    checkForUpdate({ silent: true });
  }
})();

// ========== 编辑模式函数 ==========

// 旋转光标（自定义 SVG）
const ROTATE_CURSOR = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'/%3E%3Cpath d='M3 3v5h5'/%3E%3C/svg%3E") 12 12, crosshair`;

function enterEditMode(image) {
  if (!image.editState) image.initEditState();
  state.editModeImageId = image.id;
  state.hoveredImageId = image.id;
  state.editAction = null;
  state.editActionStart = null;
  ratioDropdown.classList.remove('open');
  // 编辑模式下禁用除撤销/重做/信息外的所有工具栏按钮
  addImagesInput.disabled = true;
  uploadBtnLabel.classList.add('disabled');
  btnClear.disabled = true;
  btnCopy.disabled = true;
  btnSave.disabled = true;
  layoutBtns.forEach(b => { b.disabled = true; b.classList.add('disabled'); });
  btnCanvasRatio.disabled = true;
  recomputeAndRender();
  // 创建/显示浮动标注工具栏
  const workspaceEl = document.getElementById('workspace');
  if (!state.floatingToolbar) {
    state.floatingToolbar = createFloatingToolbar(
      workspaceEl,
      state.activeAnnotationTool,
      () => state.toolSettings,
      (tool) => {
        state.activeAnnotationTool = tool;
        closeSubmenu();
      },
      (tool, key, value) => {
        state.toolSettings[tool][key] = value;
      }
    );
  }
  state.floatingToolbar.show();
  // 将工具栏定位在编辑图片下方（workspace 相对坐标）
  if (state.lastLayoutResult) {
    const sf = getLayoutScale();
    const canvasRect = canvas.getBoundingClientRect();
    const workspaceRect = workspaceEl.getBoundingClientRect();
    const canvasOffX = canvasRect.left - workspaceRect.left;
    const canvasOffY = canvasRect.top - workspaceRect.top;
    const cx = canvasOffX + image.x * sf + image.renderWidth / 2 * sf;
    const cy = canvasOffY + (image.y + image.renderHeight) * sf + 12;
    state.floatingToolbar.setPosition(cx - 160, cy);
  }
}

function exitEditMode() {
  closeSubmenu();
  if (state.floatingToolbar) {
    state.floatingToolbar.hide();
  }
  state.editModeImageId = -1;
  state.editAction = null;
  state.editActionStart = null;
  state.hoveredSaveBtn = false;
  state.hoveredResetBtn = false;
  state.hoveredRotateBtn = false;
  state.hoveredRatioBtn = false;
  state.showRatioMenu = false;
  state.hoveredRatioIndex = -1;
  // 恢复工具栏按钮状态
  addImagesInput.disabled = false;
  uploadBtnLabel.classList.remove('disabled');
  layoutBtns.forEach(b => { b.disabled = false; b.classList.remove('disabled'); });
  updateButtonStates();
  recomputeAndRender();
}

function resetEdit(img) {
  pushUndo();
  const savedEdit = img.editState;
  img.editState = null;
  computeGroupedLayout(state.groups, imagePool, state.layoutMode);
  const cleanW = img.renderWidth;
  const cleanH = img.renderHeight;
  img.editState = {
    cropWidth: cleanW,
    cropHeight: cleanH,
    zoom: 1.0,
    panX: 0,
    panY: 0,
    rotation: 0,
  };
  recomputeAndRender();
}

function applyAspectRatio(img, entry) {
  const es = img.editState;
  if (!es) return;

  const ratio = entry.ratio !== null ? entry.ratio : img.originalWidth / img.originalHeight;
  const origW = img.originalWidth;
  const origH = img.originalHeight;

  const effScale = getEffectiveScale(es, origW, origH);
  const absCos = Math.abs(Math.cos(es.rotation));
  const absSin = Math.abs(Math.sin(es.rotation));
  const extentW = origW * effScale * absCos + origH * effScale * absSin;
  const extentH = origW * effScale * absSin + origH * effScale * absCos;

  let newCropW, newCropH;
  if (extentW / extentH > ratio) {
    newCropH = extentH;
    newCropW = extentH * ratio;
  } else {
    newCropW = extentW;
    newCropH = extentW / ratio;
  }

  newCropW = Math.max(50, newCropW);
  newCropH = Math.max(50, newCropH);

  pushUndo();
  es.cropWidth = newCropW;
  es.cropHeight = newCropH;
  es.panX = 0;
  es.panY = 0;
  clampPan(img);
  recomputeAndRender();
}

// ========== Canvas 交互 ==========

// 把手拖拽事件（委托给 grip-container）
gripContainer.addEventListener('mousedown', (e) => {
  const gripEl = e.target.closest('.grip-handle');
  if (!gripEl) return;
  const idx = gripElements.indexOf(gripEl);
  if (idx === -1) return;

  e.preventDefault();
  state.dragGroupIndex = idx;
  state.dragGroupStartMX = e.clientX;
  state.dragGroupStartMY = e.clientY;
  state.dragGroupCurrentMX = e.clientX;
  state.dragGroupCurrentMY = e.clientY;
  state.dragGroupStarted = false;
  state.isRowDragging = false;
});

function getCanvasMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  return { mx: e.clientX - rect.left, my: e.clientY - rect.top };
}

function getLayoutScale() {
  const lr = state.lastLayoutResult;
  if (!lr) return 1;
  return lr.scaleFactor * (lr._displayScale || 1);
}

function isPanAvailable(img) {
  if (!img.editState) return false;
  const es = img.editState;
  const effScale = getEffectiveScale(es, img.originalWidth, img.originalHeight);
  const drawW = img.originalWidth * effScale;
  const drawH = img.originalHeight * effScale;
  return drawW > es.cropWidth + 0.5 || drawH > es.cropHeight + 0.5;
}

canvas.addEventListener('mousedown', (e) => {
  if (state.images.length === 0) return;
  const { mx, my } = getCanvasMousePos(e);

  // 编辑模式下的交互
  if (state.editModeImageId !== -1) {
    // 检查点击是否在标注工具栏/子菜单上，如果是则跳过画布交互
    const tbEl = document.getElementById('annotation-toolbar');
    if (tbEl && tbEl.contains(e.target)) return;
    handleEditModeMouseDown(mx, my);
    return;
  }

  const hit = hitTest(mx, my, state.images, state.hoveredImageId, -1, state.layoutMode);

  // 编辑按钮
  if (hit.isEditBtn && hit.image) {
    enterEditMode(hit.image);
    return;
  }

  // 复制按钮
  if (hit.isDupBtn && hit.image) {
    duplicateImage(hit.image);
    return;
  }

  // 关闭按钮
  if (hit.isCloseBtn && hit.image) {
    pushUndo();
    removeImageFromGroups(hit.image.id);
    cleanupEmptyGroups();
    gcImagePool();
    syncImagesFromGroups();
    state.hoveredImageId = -1;
    state.hoveredCloseId = -1;
    recomputeAndRender();
    return;
  }

  // 下载按钮
  if (hit.isDlBtn && hit.image) {
    state.saveTargetImage = hit.image;
    openSaveModal();
    return;
  }

  // 拖拽重排
  if (hit.image && state.images.length > 1) {
    state.dragImageId = hit.image.id;
    state.dragStartMX = mx;
    state.dragStartMY = my;
    state.dragCurrentMX = mx;
    state.dragCurrentMY = my;
    state.dragStarted = false;
    state.isDragging = false;
  }
});

function handleEditModeMouseDown(mx, my) {
  const img = state.images.find(i => i.id === state.editModeImageId);
  if (!img || !img.editState) return;

  const hit = hitTest(mx, my, state.images, state.editModeImageId, state.editModeImageId, state.layoutMode);

  // 标注工具绘制：非按钮区域点击时进行标注绘制
  if (!hit.isSaveBtn && !hit.isResetBtn && !hit.isRatioMenuItem && !hit.isRatioBtn && !hit.isCropEdge && !hit.isRotateBtn) {
    handleAnnotationMouseDown(mx, my, img);
    return;
  }

  // 点击菜单外区域关闭比例菜单
  if (state.showRatioMenu && !hit.isRatioMenuItem && !hit.isRatioBtn) {
    state.showRatioMenu = false;
    state.hoveredRatioIndex = -1;
    recomputeAndRender();
  }

  if (hit.isSaveBtn) {
    exitEditMode();
    return;
  }

  if (hit.isResetBtn) {
    resetEdit(img);
    return;
  }

  if (hit.isRatioMenuItem) {
    const entry = ASPECT_RATIOS[hit.ratioMenuIndex];
    state.showRatioMenu = false;
    state.hoveredRatioIndex = -1;
    applyAspectRatio(img, entry);
    return;
  }

  if (hit.isRatioBtn) {
    state.showRatioMenu = !state.showRatioMenu;
    if (!state.showRatioMenu) state.hoveredRatioIndex = -1;
    recomputeAndRender();
    return;
  }

  pushUndo();

  const sf = getLayoutScale();
  const displayW = img.renderWidth;
  const displayH = img.renderHeight;
  const startEditScale = Math.max(displayW / img.editState.cropWidth, displayH / img.editState.cropHeight);

  if (hit.isCropEdge) {
    const axis = hit.cropEdgeAxis || (state.layoutMode === 'horizontal' ? 'width' : 'height');
    const absCos = Math.abs(Math.cos(img.editState.rotation));
    const absSin = Math.abs(Math.sin(img.editState.rotation));
    const startBaseFit = Math.max(
      (img.editState.cropWidth * absCos + img.editState.cropHeight * absSin) / img.originalWidth,
      (img.editState.cropWidth * absSin + img.editState.cropHeight * absCos) / img.originalHeight
    );
    state.editAction = 'crop';
    state.editActionStart = {
      mouseX: mx, mouseY: my,
      cropWidth: img.editState.cropWidth,
      cropHeight: img.editState.cropHeight,
      panX: img.editState.panX,
      panY: img.editState.panY,
      zoom: img.editState.zoom,
      cropEdgeSide: hit.cropEdgeSide,
      cropEdgeAxis: axis,
      startSf: sf,
      startEditScale: startEditScale,
      startBaseFit,
      startEffScale: startBaseFit * Math.max(1.0, img.editState.zoom),
    };
    if (state.canvasRatioLocked) {
      state._canvasRatioDragging = true;
      // Capture pre-drag widths for reverse compensation
      const entry = ASPECT_RATIOS[state.canvasRatioIndex];
      if (entry && entry.ratio !== null) {
        const R_t = entry.ratio;
        const refH = Math.max(...state.images.map(i =>
          i.editState ? i.editState.cropHeight : i.originalHeight));
        const W_total = refH * R_t;
        state.editActionStart._canvasRatioTotalWidth = W_total;
        state.editActionStart._canvasRatioRestWidth = W_total - img.editState.cropWidth;
        for (const other of state.images) {
          if (other.id !== img.id) {
            other._canvasRatioOldWidth = other.editState ? other.editState.cropWidth : other.originalWidth;
          }
        }
      }
    }
    return;
  }

  if (hit.isRotateBtn) {
    state.editAction = 'rotate';
    const centerX = (img.x + img.renderWidth / 2) * sf;
    const centerY = (img.y + img.renderHeight / 2) * sf;
    state.editActionStart = {
      startAngle: Math.atan2(my - centerY, mx - centerX),
      startRotation: img.editState.rotation,
      centerX, centerY,
      startSf: sf,
    };
    return;
  }

  if (hit.isImageBody && isPanAvailable(img)) {
    state.editAction = 'pan';
    state.editActionStart = {
      mouseX: mx, mouseY: my,
      panX: img.editState.panX,
      panY: img.editState.panY,
      startSf: sf,
      startEditScale: startEditScale,
    };
    return;
  }

  // 点击编辑图片区域外 → 不做任何操作
}

// ========== 标注绘制交互 ==========

function isClickOnAnnotationUI(target) {
  const tb = document.getElementById('annotation-toolbar');
  return tb && tb.contains(target);
}

function handleAnnotationMouseDown(mx, my, editedImg) {
  const tool = state.activeAnnotationTool;
  const settings = state.toolSettings[tool];
  const canvasRect = canvas.getBoundingClientRect();
  const sf = getLayoutScale();

  // Convert screen coords to image-local coords
  const lx = (mx - canvasRect.left - sf * editedImg.x) / sf;
  const ly = (my - canvasRect.top - sf * editedImg.y) / sf;

  if (!state.annotations.has(editedImg.id)) {
    state.annotations.set(editedImg.id, []);
  }
  const annots = state.annotations.get(editedImg.id);

  switch (tool) {
    case 'geometry': {
      pushUndo();
      state._annotationDrawing = {
        startX: lx, startY: ly,
        currentX: lx, currentY: ly,
      };
      break;
    }
    case 'pencil': {
      pushUndo();
      state._annotationDrawing = {
        points: [{ x: lx, y: ly }],
      };
      break;
    }
    case 'arrow': {
      pushUndo();
      state._annotationDrawing = {
        startX: lx, startY: ly,
        currentX: lx, currentY: ly,
      };
      break;
    }
    case 'sequence': {
      pushUndo();
      const s = settings;
      const annot = createAnnotation('sequence', {
        x: lx, y: ly,
        number: s.nextNumber,
        numberStyle: s.numberStyle,
        fontSize: s.fontSize,
        color: s.color,
      }, editedImg.id);
      annots.push(annot);
      s.nextNumber++;
      break;
    }
    case 'text': {
      const s = settings;
      const text = prompt('输入文本:');
      if (text) {
        pushUndo();
        const annot = createAnnotation('text', {
          x: lx, y: ly,
          text,
          bold: s.bold,
          italic: s.italic,
          fontFamily: s.fontFamily,
          fontSize: s.fontSize,
          color: s.color,
        }, editedImg.id);
        annots.push(annot);
      }
      break;
    }
    case 'eraser': {
      pushUndo();
      state._erasing = true;
      eraseAt(lx, ly, editedImg.id);
      break;
    }
  }
  recomputeAndRender();
}

function updateAnnotationDrawing(mx, my, editedImg) {
  if (!state._annotationDrawing && !state._erasing) return;
  const canvasRect = canvas.getBoundingClientRect();
  const sf = getLayoutScale();
  const lx = (mx - canvasRect.left - sf * editedImg.x) / sf;
  const ly = (my - canvasRect.top - sf * editedImg.y) / sf;

  const tool = state.activeAnnotationTool;
  if (tool === 'geometry' || tool === 'arrow') {
    state._annotationDrawing.currentX = lx;
    state._annotationDrawing.currentY = ly;
  } else if (tool === 'pencil') {
    state._annotationDrawing.points.push({ x: lx, y: ly });
  } else if (tool === 'eraser' && state._erasing) {
    eraseAt(lx, ly, editedImg.id);
  }
  recomputeAndRender();
}

function finishAnnotationDrawing(editedImg) {
  if (!state._annotationDrawing && !state._erasing) return;

  if (state._erasing) {
    state._erasing = false;
    state._annotationDrawing = null;
    recomputeAndRender();
    return;
  }

  const tool = state.activeAnnotationTool;
  const settings = state.toolSettings[tool];
  const annots = state.annotations.get(editedImg.id);
  if (!annots) { state._annotationDrawing = null; return; }

  switch (tool) {
    case 'geometry': {
      const { startX, startY, currentX, currentY } = state._annotationDrawing;
      const w = currentX - startX;
      const h = currentY - startY;
      if (Math.abs(w) > 2 && Math.abs(h) > 2) {
        const shape = settings.shape === 'ellipse' ? 'ellipse' : 'rectangle';
        const annot = createAnnotation(shape, {
          x: Math.min(startX, currentX),
          y: Math.min(startY, currentY),
          width: Math.abs(w),
          height: Math.abs(h),
          lineStyle: settings.lineStyle,
          lineWidth: settings.lineWidth,
          color: settings.color,
          fill: settings.fill,
          cornerRadius: settings.shape !== 'ellipse' ? settings.cornerRadius : 0,
        }, editedImg.id);
        annots.push(annot);
      }
      break;
    }
    case 'pencil': {
      const { points } = state._annotationDrawing;
      if (points && points.length >= 2) {
        const annot = createAnnotation('pencil', {
          points,
          lineStyle: settings.lineStyle,
          lineWidth: settings.lineWidth,
          color: settings.color,
        }, editedImg.id);
        annots.push(annot);
      }
      break;
    }
    case 'arrow': {
      const { startX, startY, currentX, currentY } = state._annotationDrawing;
      if (Math.abs(currentX - startX) > 2 || Math.abs(currentY - startY) > 2) {
        const annot = createAnnotation('arrow', {
          startPoint: { x: startX, y: startY },
          endPoint: { x: currentX, y: currentY },
          arrowStyle: settings.arrowStyle,
          lineStyle: settings.lineStyle,
          lineWidth: settings.lineWidth,
          color: settings.color,
        }, editedImg.id);
        annots.push(annot);
      }
      break;
    }
  }

  state._annotationDrawing = null;
  recomputeAndRender();
}

function eraseAt(lx, ly, imageId) {
  const annots = state.annotations.get(imageId);
  if (!annots) return;
  const eraserRadius = (state.toolSettings.eraser.lineWidth / 2);

  for (let i = annots.length - 1; i >= 0; i--) {
    if (annotationIntersectsPoint(annots[i], lx, ly, eraserRadius)) {
      annots.splice(i, 1);
    }
  }
}

function annotationIntersectsPoint(annot, px, py, radius) {
  const bbox = getAnnotationBBox(annot);
  if (!bbox) return false;
  const closestX = Math.max(bbox.x, Math.min(px, bbox.x + bbox.width));
  const closestY = Math.max(bbox.y, Math.min(py, bbox.y + bbox.height));
  const distX = px - closestX;
  const distY = py - closestY;
  return (distX * distX + distY * distY) < (radius * radius);
}

function getAnnotationBBox(annot) {
  const p = annot.params;
  switch (annot.type) {
    case 'rectangle':
    case 'ellipse':
      return { x: p.x, y: p.y, width: p.width, height: p.height };
    case 'arrow':
      return {
        x: Math.min(p.startPoint.x, p.endPoint.x) - 20,
        y: Math.min(p.startPoint.y, p.endPoint.y) - 20,
        width: Math.abs(p.endPoint.x - p.startPoint.x) + 40,
        height: Math.abs(p.endPoint.y - p.startPoint.y) + 40,
      };
    case 'sequence': {
      const r = Math.max(p.fontSize * 0.8, 16);
      return { x: p.x, y: p.y, width: r * 2, height: r * 2 };
    }
    case 'text': {
      const w = p.text.length * p.fontSize * 0.6;
      return { x: p.x, y: p.y, width: w, height: p.fontSize * 1.2 };
    }
    case 'pencil': {
      if (!p.points || p.points.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      p.points.forEach(pt => {
        minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y);
      });
      return { x: minX - 5, y: minY - 5, width: maxX - minX + 10, height: maxY - minY + 10 };
    }
    default:
      return null;
  }
}

// 拖拽过程中的 document 级别监听（防止鼠标移出 canvas）
function positionNewRowIndicators() {
  const rect = canvas.getBoundingClientRect();
  const wsRect = canvas.parentElement.getBoundingClientRect();
  const isVertical = state.layoutMode === 'vertical';
  const GAP = 8;   // 贴边间距
  const SAFE = 56; // 安全距离：外侧有这么多空间才放到外面

  newRowBefore.classList.toggle('vertical', isVertical);
  newRowAfter.classList.toggle('vertical', isVertical);

  if (isVertical) {
    const cy = rect.top - wsRect.top + rect.height / 2 - 80;
    // before（左侧）：看画布左边到 workspace 左边的距离
    const spaceBefore = rect.left - wsRect.left;
    const leftPos = spaceBefore >= SAFE
      ? rect.left - wsRect.left - 40 - GAP  // 外侧
      : rect.left - wsRect.left + GAP;       // 内侧
    // after（右侧）：看画布右边到 workspace 右边的距离
    const spaceAfter = wsRect.right - rect.right;
    const rightPos = spaceAfter >= SAFE
      ? rect.right - wsRect.left + GAP       // 外侧
      : rect.right - wsRect.left - 40 - GAP; // 内侧
    newRowBefore.style.cssText = `display:none;top:${cy}px;left:${leftPos}px;transform:none;`;
    newRowAfter.style.cssText = `display:none;top:${cy}px;left:${rightPos}px;transform:none;`;
  } else {
    const cx = rect.left - wsRect.left + rect.width / 2 - 80;
    // before（上方）：看画布顶部到 workspace 顶部的距离
    const spaceBefore = rect.top - wsRect.top;
    const topPos = spaceBefore >= SAFE
      ? rect.top - wsRect.top - 40 - GAP     // 外侧
      : rect.top - wsRect.top + GAP;          // 内侧
    // after（下方）：看画布底部到 workspace 底部的距离
    const spaceAfter = wsRect.bottom - rect.bottom;
    const bottomPos = spaceAfter >= SAFE
      ? rect.bottom - wsRect.top + GAP        // 外侧
      : rect.bottom - wsRect.top - 40 - GAP;  // 内侧
    newRowBefore.style.cssText = `display:none;left:${cx}px;top:${topPos}px;transform:none;`;
    newRowAfter.style.cssText = `display:none;left:${cx}px;top:${bottomPos}px;transform:none;`;
  }
}

function updateNewRowIndicators(zone) {
  const totalImages = state.images.length;
  const show = state.isDragging && totalImages >= 3;

  if (show) {
    // 只在首次显示时定位（拖拽开始时锁定位置）
    if (!state._indicatorsPositioned) {
      positionNewRowIndicators();
      state._indicatorsPositioned = true;
    }
    const activeBefore = zone && zone.type === 'new-group' && zone.position === 'before';
    const activeAfter = zone && zone.type === 'new-group' && zone.position === 'after';
    newRowBefore.style.display = 'flex';
    newRowAfter.style.display = 'flex';
    newRowBefore.classList.toggle('active', !!activeBefore);
    newRowAfter.classList.toggle('active', !!activeAfter);
  } else {
    newRowBefore.style.display = 'none';
    newRowAfter.style.display = 'none';
    newRowBefore.classList.remove('active');
    newRowAfter.classList.remove('active');
    state._indicatorsPositioned = false;
  }
}

function onDragMouseMove(e) {
  if (state.dragImageId === -1) return;
  const { mx, my } = getCanvasMousePos(e);

  state.dragCurrentMX = mx;
  state.dragCurrentMY = my;

  if (!state.dragStarted) {
    const dx = mx - state.dragStartMX;
    const dy = my - state.dragStartMY;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    state.dragStarted = true;
    state.isDragging = true;
    pushUndo();
  }

  const zone = computeDropZone(mx, my);
  state.dropZone = zone;

  if (zone && zone.type === 'reorder') {
    state.dragTargetGroupIndex = zone.groupIndex;
    state.dragInsertIndex = zone.insertIndex;
  } else {
    state.dragTargetGroupIndex = -1;
    state.dragInsertIndex = -1;
  }

  updateNewRowIndicators(zone);

  recomputeAndRender();
}

function onDragMouseUp() {
  if (state.dragImageId === -1) return;

  if (state.isDragging) {
    const dragId = state.dragImageId;
    const zone = state.dropZone;

    if (zone && zone.type === 'new-group') {
      // 从当前组移除
      removeImageFromGroups(dragId);
      // 在目标位置创建新组
      const insertAt = zone.position === 'before' ? zone.groupIndex : zone.groupIndex + 1;
      state.groups.splice(insertAt, 0, [dragId]);
    } else if (zone && zone.type === 'reorder') {
      // 从当前组移除
      removeImageFromGroups(dragId);
      // 插入到目标组
      const clampedIdx = Math.max(0, Math.min(zone.insertIndex, state.groups[zone.groupIndex].length));
      state.groups[zone.groupIndex].splice(clampedIdx, 0, dragId);
    }

    // 清理空组
    cleanupEmptyGroups();
    syncImagesFromGroups();
  }

  state.isDragging = false;
  state.dragImageId = -1;
  state.dragStarted = false;
  state.dragInsertIndex = -1;
  state.dragTargetGroupIndex = -1;
  state.dropZone = null;

  updateNewRowIndicators(null);

  const mx = state.dragCurrentMX;
  const my = state.dragCurrentMY;
  const hit = hitTest(mx, my, state.images, -1, -1, state.layoutMode);
  state.hoveredImageId = hit.image ? hit.image.id : -1;
  state.hoveredCloseId = -1;
  canvas.style.cursor = hit.image ? 'grab' : 'default';

  recomputeAndRender();
}

// ========== 行列拖拽处理 ==========

function computeGroupDropIndex(mouseScreenX, mouseScreenY) {
  const lr = state.lastLayoutResult;
  if (!lr || !lr._groupBounds || lr._groupBounds.length === 0) return -1;

  const sf = lr.scaleFactor * (lr._displayScale || 1);
  const gb = lr._groupBounds;
  const isHorizontal = state.layoutMode === 'horizontal';

  // 将鼠标位置转换为相对于画布的坐标
  const canvasRect = canvas.getBoundingClientRect();
  const mouseVal = isHorizontal
    ? mouseScreenY - canvasRect.top
    : mouseScreenX - canvasRect.left;

  for (let i = 0; i < gb.length; i++) {
    const mid = isHorizontal
      ? (gb[i].y + gb[i].height / 2) * sf
      : (gb[i].x + gb[i].width / 2) * sf;
    if (mouseVal < mid) return i;
  }
  return gb.length;
}

function onRowDragMouseMove(e) {
  if (state.dragGroupIndex === -1) return;

  state.dragGroupCurrentMX = e.clientX;
  state.dragGroupCurrentMY = e.clientY;

  if (!state.dragGroupStarted) {
    const dx = e.clientX - state.dragGroupStartMX;
    const dy = e.clientY - state.dragGroupStartMY;
    if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
    state.dragGroupStarted = true;
    state.isRowDragging = true;
    pushUndo();
  }

  state.dragGroupDropIndex = computeGroupDropIndex(e.clientX, e.clientY);
  recomputeAndRender();
}

function onRowDragMouseUp() {
  if (state.dragGroupIndex === -1) return;

  if (state.isRowDragging) {
    const srcIdx = state.dragGroupIndex;
    const dropIdx = state.dragGroupDropIndex;

    if (dropIdx !== -1 && dropIdx !== srcIdx) {
      const [movedGroup] = state.groups.splice(srcIdx, 1);
      const adjustedDrop = dropIdx > srcIdx ? dropIdx - 1 : dropIdx;
      state.groups.splice(adjustedDrop, 0, movedGroup);
    }

    syncImagesFromGroups();
  }

  state.isRowDragging = false;
  state.dragGroupIndex = -1;
  state.dragGroupStarted = false;
  state.dragGroupDropIndex = -1;

  recomputeAndRender();
}

// 编辑模式拖拽处理
function onEditModeMouseMove(e) {
  const img = state.images.find(i => i.id === state.editModeImageId);
  if (!img || !img.editState) return;
  const { mx, my } = getCanvasMousePos(e);
  const es = img.editState;

  if (state.editAction === 'crop') {
    const start = state.editActionStart;
    const axis = start.cropEdgeAxis;
    const lockedScale = start.startSf * start.startEditScale;
    const absCos = Math.abs(Math.cos(es.rotation));
    const absSin = Math.abs(Math.sin(es.rotation));
    // Use fixed initial effective scale for extent — prevents crop from growing beyond image bounds
    const initEff = start.startEffScale;
    const extentW = img.originalWidth * initEff * absCos + img.originalHeight * initEff * absSin;
    const extentH = img.originalWidth * initEff * absSin + img.originalHeight * initEff * absCos;

    if (axis === 'width') {
      const dx = (mx - start.mouseX) / lockedScale;
      const side = start.cropEdgeSide;
      const delta = side === 'right' ? dx : -dx;

      es.cropWidth = Math.min(extentW, Math.max(50, start.cropWidth + delta));

      if (!e.altKey) {
        const appliedDelta = es.cropWidth - start.cropWidth;
        if (side === 'right') { es.panX = start.panX - appliedDelta / 2; }
        else { es.panX = start.panX + appliedDelta / 2; }
      }

    } else { // axis === 'height'
      const dy = (my - start.mouseY) / lockedScale;
      const side = start.cropEdgeSide;
      const delta = side === 'bottom' ? dy : -dy;

      es.cropHeight = Math.min(extentH, Math.max(50, start.cropHeight + delta));

      if (!e.altKey) {
        const appliedDelta = es.cropHeight - start.cropHeight;
        if (side === 'bottom') { es.panY = start.panY - appliedDelta / 2; }
        else { es.panY = start.panY + appliedDelta / 2; }
      }
    }

    // Compensate zoom to keep visual scale constant during crop
    const newBaseFit = Math.max(
      (es.cropWidth * absCos + es.cropHeight * absSin) / img.originalWidth,
      (es.cropWidth * absSin + es.cropHeight * absCos) / img.originalHeight
    );
    if (newBaseFit > 0.001) {
      es.zoom = Math.max(1.0, (start.startBaseFit * start.zoom) / newBaseFit);
    }

    // 锁定画布比例时的反向补偿（只调整 cropWidth，不改 cropHeight 以保持行高稳定）
    if (state.canvasRatioLocked && state.images.length > 1) {
      const W_k = img.editState.cropWidth;
      const W_rest_old = start._canvasRatioRestWidth;
      const W_rest_new = (start._canvasRatioTotalWidth) - W_k;

      if (W_rest_old > 0) {
        const S_comp = W_rest_new / W_rest_old;
        for (const other of state.images) {
          if (other.id === img.id) continue;
          const oldW = other._canvasRatioOldWidth;
          if (oldW != null) {
            const newW = Math.max(50, Math.round(oldW * S_comp));
            other.editState.cropWidth = newW;
            // cropHeight 不变 → refH 不变 → 行高稳定
            clampPan(other);
          }
        }
      }
    }

    clampPan(img);
    recomputeAndRender();
    return;
  }

  if (state.editAction === 'pan') {
    const start = state.editActionStart;
    const lockedScale = start.startSf * start.startEditScale;
    es.panX = start.panX + (mx - start.mouseX) / lockedScale;
    es.panY = start.panY + (my - start.mouseY) / lockedScale;
    clampPan(img);
    recomputeAndRender();
    return;
  }

  if (state.editAction === 'rotate') {
    const start = state.editActionStart;
    const currentAngle = Math.atan2(my - start.centerY, mx - start.centerX);
    es.rotation = start.startRotation + (currentAngle - start.startAngle);
    if (Math.abs(es.rotation) < 0.017) es.rotation = 0;
    clampPan(img);
    recomputeAndRender();
    return;
  }
}

function getEffectiveScale(es, origW, origH) {
  const cropW = es.cropWidth;
  const cropH = es.cropHeight;
  const absCos = Math.abs(Math.cos(es.rotation));
  const absSin = Math.abs(Math.sin(es.rotation));
  const baseFit = Math.max(
    (cropW * absCos + cropH * absSin) / origW,
    (cropW * absSin + cropH * absCos) / origH
  );
  return baseFit * Math.max(1.0, es.zoom);
}

/**
 * 平移限制：通过局部坐标系投影，计算并限制最大可平移距离
 */
function clampPan(img) {
  const es = img.editState;
  if (!es) return;

  const effScale = getEffectiveScale(es, img.originalWidth, img.originalHeight);

  const drawW = img.originalWidth * effScale;
  const drawH = img.originalHeight * effScale;

  const absCos = Math.abs(Math.cos(es.rotation));
  const absSin = Math.abs(Math.sin(es.rotation));

  const occupiedW = es.cropWidth * absCos + es.cropHeight * absSin;
  const occupiedH = es.cropWidth * absSin + es.cropHeight * absCos;

  const maxLocalU = Math.max(0, (drawW - occupiedW) / 2);
  const maxLocalV = Math.max(0, (drawH - occupiedH) / 2);

  const cos = Math.cos(es.rotation);
  const sin = Math.sin(es.rotation);
  const localU = es.panX * cos + es.panY * sin;
  const localV = -es.panX * sin + es.panY * cos;

  const clampedU = Math.max(-maxLocalU, Math.min(maxLocalU, localU));
  const clampedV = Math.max(-maxLocalV, Math.min(maxLocalV, localV));

  es.panX = clampedU * cos - clampedV * sin;
  es.panY = clampedU * sin + clampedV * cos;
}

function onEditModeMouseUp() {
  state._canvasRatioDragging = false;
  // 清理临时属性
  for (const img of state.images) {
    delete img._canvasRatioOldWidth;
  }
  if (state.editAction) {
    state.editAction = null;
    state.editActionStart = null;
    recomputeAndRender();
  }
}

document.addEventListener('mousemove', (e) => {
  // 标注绘制中的鼠标移动
  if (state.editModeImageId !== -1 && (state._annotationDrawing || state._erasing)) {
    const editedImg = state.images.find(i => i.id === state.editModeImageId);
    if (editedImg) updateAnnotationDrawing(e.clientX, e.clientY, editedImg);
  }
  if (state.editModeImageId !== -1 && state.editAction) {
    onEditModeMouseMove(e);
    return;
  }
  if (state.dragGroupIndex !== -1) {
    onRowDragMouseMove(e);
    return;
  }
  if (state.dragImageId !== -1) {
    onDragMouseMove(e);
    return;
  }
});
document.addEventListener('mouseup', () => {
  // 标注绘制结束
  if (state.editModeImageId !== -1 && (state._annotationDrawing || state._erasing)) {
    const editedImg = state.images.find(i => i.id === state.editModeImageId);
    if (editedImg) finishAnnotationDrawing(editedImg);
  }
  if (state.editModeImageId !== -1 && state.editAction) {
    onEditModeMouseUp();
    return;
  }
  if (state.dragGroupIndex !== -1) {
    onRowDragMouseUp();
    return;
  }
  if (state.dragImageId !== -1) {
    onDragMouseUp();
    return;
  }
});

// Canvas 悬停检测
canvas.addEventListener('mousemove', (e) => {
  if (state.dragImageId !== -1) return;
  if (state.dragGroupIndex !== -1) return;
  if (state.images.length === 0) return;
  const { mx, my } = getCanvasMousePos(e);

  // 编辑模式悬停
  if (state.editModeImageId !== -1) {
    if (state.editAction) return; // 拖拽中由 document mousemove 处理
    const img = state.images.find(i => i.id === state.editModeImageId);
    const hit = hitTest(mx, my, state.images, state.editModeImageId, state.editModeImageId, state.layoutMode);
    const prevSave = state.hoveredSaveBtn;
    const prevReset = state.hoveredResetBtn;
    const prevRotate = state.hoveredRotateBtn;

    state.hoveredSaveBtn = hit.isSaveBtn || false;
    state.hoveredResetBtn = hit.isResetBtn || false;
    state.hoveredRotateBtn = hit.isRotateBtn || false;
    const prevRatio = state.hoveredRatioBtn;
    const prevRatioIndex = state.hoveredRatioIndex;
    state.hoveredRatioBtn = hit.isRatioBtn || false;
    state.hoveredRatioIndex = hit.isRatioMenuItem ? hit.ratioMenuIndex : -1;

    if (state.hoveredSaveBtn !== prevSave || state.hoveredResetBtn !== prevReset || state.hoveredRotateBtn !== prevRotate || state.hoveredRatioBtn !== prevRatio || state.hoveredRatioIndex !== prevRatioIndex) {
      recomputeAndRender();
    }

    // 光标 & tooltip
    if (hit.isSaveBtn) { canvas.style.cursor = 'pointer'; canvas.title = '保存退出'; }
    else if (hit.isResetBtn) { canvas.style.cursor = 'pointer'; canvas.title = '复位'; }
    else if (hit.isRatioBtn) { canvas.style.cursor = 'pointer'; canvas.title = '预设比例'; }
    else if (hit.isRatioMenuItem) { canvas.style.cursor = 'pointer'; canvas.title = ''; }
    else if (hit.isRotateBtn) { canvas.style.cursor = ROTATE_CURSOR; canvas.title = '按住旋转'; }
    else if (hit.isCropEdge) { canvas.style.cursor = hit.cropEdgeAxis === 'width' ? 'ew-resize' : 'ns-resize'; canvas.title = ''; }
    else if (hit.isImageBody && img && isPanAvailable(img)) { canvas.style.cursor = 'grab'; canvas.title = '平移'; }
    else { canvas.style.cursor = 'default'; canvas.title = ''; }
    return;
  }

  // 普通模式悬停
  const hit = hitTest(mx, my, state.images, state.hoveredImageId, -1, state.layoutMode);

  const prevHovered = state.hoveredImageId;
  const prevClose = state.hoveredCloseId;
  const prevEditBtn = state.hoveredEditBtnId;
  const prevDupBtn = state.hoveredDupBtnId;
  const prevDlBtn = state.hoveredDlBtnId;

  state.hoveredImageId = hit.image ? hit.image.id : -1;
  state.hoveredCloseId = (hit.isCloseBtn && hit.image) ? hit.image.id : -1;
  state.hoveredEditBtnId = (hit.isEditBtn && hit.image) ? hit.image.id : -1;
  state.hoveredDupBtnId = (hit.isDupBtn && hit.image) ? hit.image.id : -1;
  state.hoveredDlBtnId = (hit.isDlBtn && hit.image) ? hit.image.id : -1;

  if (state.hoveredImageId !== prevHovered || state.hoveredCloseId !== prevClose || state.hoveredEditBtnId !== prevEditBtn || state.hoveredDupBtnId !== prevDupBtn || state.hoveredDlBtnId !== prevDlBtn) {
    recomputeAndRender();
  }

  if (hit.isEditBtn) { canvas.style.cursor = 'pointer'; canvas.title = '编辑'; }
  else if (hit.isDupBtn) { canvas.style.cursor = 'pointer'; canvas.title = '复制'; }
  else if (hit.isDlBtn) { canvas.style.cursor = 'pointer'; canvas.title = '下载此图片'; }
  else if (hit.isCloseBtn) { canvas.style.cursor = 'pointer'; canvas.title = '删除'; }
  else if (hit.image) { canvas.style.cursor = 'grab'; canvas.title = ''; }
  else { canvas.style.cursor = 'default'; canvas.title = ''; }
});

// 滚轮缩放（编辑模式）
canvas.addEventListener('wheel', (e) => {
  if (state.editModeImageId === -1) return;
  const img = state.images.find(i => i.id === state.editModeImageId);
  if (!img || !img.editState) return;
  e.preventDefault();

  if (state.showRatioMenu) {
    state.showRatioMenu = false;
    state.hoveredRatioIndex = -1;
  }

  pushUndo();
  const delta = e.deltaY > 0 ? 0.9 : 1.1;
  img.editState.zoom = Math.max(1.0, img.editState.zoom * delta);
  clampPan(img);
  recomputeAndRender();
}, { passive: false });

canvas.addEventListener('mouseleave', () => {
  canvas.title = '';
  if (state.dragImageId !== -1) return;
  if (state.dragGroupIndex !== -1) return;
  if (state.editModeImageId !== -1) return;
  if (state.hoveredImageId !== -1) {
    state.hoveredImageId = -1;
    state.hoveredCloseId = -1;
    state.hoveredEditBtnId = -1;
    state.hoveredDupBtnId = -1;
    state.hoveredDlBtnId = -1;
    recomputeAndRender();
  }
  canvas.style.cursor = 'default';
});

// 窗口失焦安全网：强制终止拖拽/编辑操作
window.addEventListener('blur', () => {
  if (state.editModeImageId !== -1 && state.editAction) onEditModeMouseUp();
  if (state.dragGroupIndex !== -1) onRowDragMouseUp();
  if (state.dragImageId !== -1) onDragMouseUp();
});

// ========== 键盘快捷键 ==========

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.editModeImageId !== -1) {
    e.preventDefault();
    if (state.showRatioMenu) {
      state.showRatioMenu = false;
      state.hoveredRatioIndex = -1;
      recomputeAndRender();
    } else {
      exitEditMode();
    }
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); doRedo(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (state.editModeImageId !== -1) return;
    e.preventDefault(); copyToClipboard();
    return;
  }
});

// ========== 粘贴 ==========

document.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const blobs = [];
  for (const item of items) {
    if (item.type.startsWith('image/') && item.getAsFile()) blobs.push(item.getAsFile());
  }
  if (blobs.length > 0) { e.preventDefault(); await addImages(blobs); }
});

// ========== 文件拖拽 ==========

function showDropOverlay() {
  dropOverlay.classList.add('visible');
  dropOverlay.querySelector('.drop-zone').classList.add('hover');
}

function hideDropOverlay() {
  dropOverlay.classList.remove('visible');
  dropOverlay.querySelector('.drop-zone').classList.remove('hover');
}

function isImageFile(path) {
  const ext = path.split('.').pop().toLowerCase();
  return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'ico', 'svg'].includes(ext);
}

// Tauri 原生拖拽（从系统资源管理器等外部拖入）
async function initTauriDragDrop() {
  try {
    const { getCurrentWebview } = await import('@tauri-apps/api/webview');
    const { invoke } = await import('@tauri-apps/api/core');
    const webview = getCurrentWebview();

    await webview.onDragDropEvent(async (event) => {
      const payload = event.payload;
      if (payload.type === 'enter') {
        if (!payload.paths.some(isImageFile)) return;
        showDropOverlay();
      } else if (payload.type === 'over') {
        // 保持 overlay 显示
      } else if (payload.type === 'drop') {
        hideDropOverlay();
        const paths = payload.paths.filter(isImageFile);
        if (paths.length > 0) {
          try {
            const { readFile } = await import('@tauri-apps/plugin-fs');
            const files = [];
            for (const fp of paths) {
              try {
                const buf = await readFile(fp);
                const name = fp.split(/[/\\]/).pop() || 'image.png';
                files.push(new File([buf], name, { type: 'image/*' }));
              } catch (err) { console.error(`Failed to read: ${fp}`, err); }
            }
            if (files.length > 0) await addImages(files);
          } catch (err) { console.error('Tauri fs error:', err); }
        }
      } else if (payload.type === 'leave') {
        hideDropOverlay();
      }
    });
  } catch (e) { console.error('Tauri drag-drop init failed:', e); }
}

// 浏览器模式回退：标准 HTML5 拖拽
let hasDraggedFiles = false;
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  hasDraggedFiles = Array.from(e.dataTransfer?.files || []).some(f => f.type.startsWith('image/'));
  if (hasDraggedFiles) showDropOverlay();
});
document.addEventListener('dragleave', (e) => {
  if (e.relatedTarget && document.body.contains(e.relatedTarget)) return;
  hideDropOverlay();
  hasDraggedFiles = false;
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  hideDropOverlay();
  const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
  if (files.length > 0) await addImages(files);
  hasDraggedFiles = false;
});

// ========== Tauri 启动 ==========

async function loadFilesFromPaths(paths) {
  if (!paths || paths.length === 0) return;
  try {
    const { readFile } = await import('@tauri-apps/plugin-fs');
    const files = [];
    for (const fp of paths) {
      try {
        const buf = await readFile(fp);
        const name = fp.split(/[/\\]/).pop() || 'image.png';
        files.push(new File([buf], name, { type: 'image/*' }));
      } catch (err) { console.error(`Failed to read: ${fp}`, err); }
    }
    if (files.length > 0) await addImages(files);
  } catch {
    // 非 Tauri 环境
  }
}

async function initApp() {
  const isTauri = !!window.__TAURI_INTERNALS__;
  if (isTauri) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const { listen } = await import('@tauri-apps/api/event');

      // Load files passed on first launch
      const openedFiles = await invoke('get_opened_files');
      await loadFilesFromPaths(openedFiles);

      // Handle files from subsequent instances (multi-file right-click)
      await listen('single-instance-files', async () => {
        const paths = await invoke('get_pending_files');
        await loadFilesFromPaths(paths);
      });

      // Check for files that arrived during startup (before listener was ready)
      const pendingPaths = await invoke('get_pending_files');
      await loadFilesFromPaths(pendingPaths);

      initTauriDragDrop();
    } catch (e) { /* not tauri */ }
  }
  recomputeAndRender();
}

document.addEventListener('annotation-clear-all', () => {
  if (state.editModeImageId !== -1) {
    pushUndo();
    state.annotations.set(state.editModeImageId, []);
    recomputeAndRender();
  }
});

initApp();
