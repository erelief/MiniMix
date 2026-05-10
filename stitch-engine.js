/**
 * StitchEngine - 图片拼接布局引擎
 * 仅负责：布局计算、Canvas 预览渲染、全分辨率导出
 */

import { renderAnnotation } from './annotation.js';

const MAX_PIXELS = 5120 * 5120;

export const ASPECT_RATIOS = [
  { label: '恢复原图比例', ratio: null },
  // 左列：横版（宽→窄），右列：对应的竖版
  { label: '21:9',   ratio: 21 / 9 },   { label: '9:21',   ratio: 9 / 21 },
  { label: '2:1',    ratio: 2 },         { label: '1:2',    ratio: 0.5 },
  { label: '16:9',   ratio: 16 / 9 },    { label: '9:16',   ratio: 9 / 16 },
  { label: '3:2',    ratio: 3 / 2 },     { label: '2:3',    ratio: 2 / 3 },
  { label: '4:3',    ratio: 4 / 3 },     { label: '3:4',    ratio: 3 / 4 },
  { label: '1:1',    ratio: 1 },
];

// ========== 布局计算 ==========

function layoutRowHorizontal(images) {
  if (images.length === 0) return { width: 0, height: 0 };
  const refHeight = Math.max(...images.map(img =>
    img.editState ? img.editState.cropHeight : img.originalHeight
  ));
  let xOffset = 0;
  for (const img of images) {
    const effW = img.editState ? img.editState.cropWidth : img.originalWidth;
    const effH = img.editState ? img.editState.cropHeight : img.originalHeight;
    const scale = refHeight / effH;
    img.renderWidth = Math.round(effW * scale);
    img.renderHeight = refHeight;
    img.x = xOffset;
    img.y = 0;
    xOffset += img.renderWidth;
  }
  return { width: xOffset, height: refHeight };
}

function layoutRowVertical(images) {
  if (images.length === 0) return { width: 0, height: 0 };
  const refWidth = Math.max(...images.map(img =>
    img.editState ? img.editState.cropWidth : img.originalWidth
  ));
  let yOffset = 0;
  for (const img of images) {
    const effW = img.editState ? img.editState.cropWidth : img.originalWidth;
    const effH = img.editState ? img.editState.cropHeight : img.originalHeight;
    const scale = refWidth / effW;
    img.renderWidth = refWidth;
    img.renderHeight = Math.round(effH * scale);
    img.x = 0;
    img.y = yOffset;
    yOffset += img.renderHeight;
  }
  return { width: refWidth, height: yOffset };
}

export function computeLayout(images, layoutMode) {
  if (images.length === 0) {
    return { width: 0, height: 0, scaleFactor: 1, isScaledDown: false };
  }

  const layoutFn = layoutMode === 'horizontal' ? layoutRowHorizontal : layoutRowVertical;
  const size = layoutFn(images);

  const totalPixels = size.width * size.height;
  let scaleFactor = 1, isScaledDown = false;
  if (totalPixels > MAX_PIXELS) {
    scaleFactor = Math.sqrt(MAX_PIXELS / totalPixels);
    isScaledDown = true;
  }

  return { width: size.width, height: size.height, scaleFactor, isScaledDown };
}

// ========== 分组布局计算 ==========

export function computeGroupedLayout(groups, imagePool, layoutMode) {
  const allImages = [];
  const groupBounds = [];

  if (groups.length === 0) {
    return { width: 0, height: 0, scaleFactor: 1, isScaledDown: false, _images: [], _groupBounds: [] };
  }

  // 单组：直接使用原有布局（完全向后兼容）
  if (groups.length === 1) {
    const imgs = groups[0].map(id => imagePool.get(id)).filter(Boolean);
    const layoutFn = layoutMode === 'horizontal' ? layoutRowHorizontal : layoutRowVertical;
    const size = layoutFn(imgs);
    let scaleFactor = 1, isScaledDown = false;
    const totalPixels = size.width * size.height;
    if (totalPixels > MAX_PIXELS) {
      scaleFactor = Math.sqrt(MAX_PIXELS / totalPixels);
      isScaledDown = true;
    }
    allImages.push(...imgs);
    groupBounds.push({ x: 0, y: 0, width: size.width, height: size.height });
    return { width: size.width, height: size.height, scaleFactor, isScaledDown, _images: allImages, _groupBounds: groupBounds };
  }

  // 多组布局
  const isHorizontal = layoutMode === 'horizontal';
  const layoutFn = isHorizontal ? layoutRowHorizontal : layoutRowVertical;
  const groupResults = [];

  for (const group of groups) {
    const imgs = group.map(id => imagePool.get(id)).filter(Boolean);
    if (imgs.length === 0) continue;
    const size = layoutFn(imgs);
    groupResults.push({ images: imgs, width: size.width, height: size.height });
    allImages.push(...imgs);
  }

  if (groupResults.length === 0) {
    return { width: 0, height: 0, scaleFactor: 1, isScaledDown: false, _images: [], _groupBounds: [] };
  }

  // 组间尺寸匹配：横排模式宽度匹配，竖排模式高度匹配
  if (groupResults.length > 1) {
    if (isHorizontal) {
      // 行间宽度匹配
      const refWidth = Math.max(...groupResults.map(g => g.width));
      for (const g of groupResults) {
        if (g.width > 0 && g.width < refWidth) {
          const scale = refWidth / g.width;
          for (const img of g.images) {
            img.renderWidth = Math.round(img.renderWidth * scale);
            img.renderHeight = Math.round(img.renderHeight * scale);
          }
          // 重新计算组内位置
          let xOffset = 0;
          for (const img of g.images) {
            img.x = xOffset;
            img.y = 0;
            xOffset += img.renderWidth;
          }
          g.width = refWidth;
          g.height = g.images[0].renderHeight;
        }
      }
    } else {
      // 列间高度匹配
      const refHeight = Math.max(...groupResults.map(g => g.height));
      for (const g of groupResults) {
        if (g.height > 0 && g.height < refHeight) {
          const scale = refHeight / g.height;
          for (const img of g.images) {
            img.renderWidth = Math.round(img.renderWidth * scale);
            img.renderHeight = Math.round(img.renderHeight * scale);
          }
          // 重新计算组内位置
          let yOffset = 0;
          for (const img of g.images) {
            img.x = 0;
            img.y = yOffset;
            yOffset += img.renderHeight;
          }
          g.height = refHeight;
          g.width = g.images[0].renderWidth;
        }
      }
    }
  }

  // 组排列：横排模式竖向堆叠，竖排模式横向排列
  let offset = 0;
  for (const g of groupResults) {
    if (isHorizontal) {
      for (const img of g.images) {
        img.y += offset;
      }
      groupBounds.push({ x: 0, y: offset, width: g.width, height: g.height });
      offset += g.height;
    } else {
      for (const img of g.images) {
        img.x += offset;
      }
      groupBounds.push({ x: offset, y: 0, width: g.width, height: g.height });
      offset += g.width;
    }
  }

  const totalWidth = isHorizontal
    ? Math.max(...groupResults.map(g => g.width))
    : groupResults.reduce((sum, g) => sum + g.width, 0);
  const totalHeight = isHorizontal
    ? groupResults.reduce((sum, g) => sum + g.height, 0)
    : Math.max(...groupResults.map(g => g.height));

  const totalPixels = totalWidth * totalHeight;
  let scaleFactor = 1, isScaledDown = false;
  if (totalPixels > MAX_PIXELS) {
    scaleFactor = Math.sqrt(MAX_PIXELS / totalPixels);
    isScaledDown = true;
  }

  return { width: totalWidth, height: totalHeight, scaleFactor, isScaledDown, _images: allImages, _groupBounds: groupBounds };
}

// ========== 预览渲染 ==========

// ========== 拖放区域指示器 ==========

function drawDropZoneIndicator(ctx, dropZone, groupBounds, scaleFactor, displayScale, layoutMode, totalWidth, totalHeight, isActive = false) {
  if (groupBounds.length === 0) return;

  const { position } = dropZone;
  const isHorizontal = layoutMode === 'horizontal';

  // 屏幕像素尺寸，除以 displayScale 得到画布像素（不随画布缩放变化）
  const ZONE_SCREEN_W = isHorizontal ? 160 : 44;
  const ZONE_SCREEN_H = isHorizontal ? 44 : 160;
  const RADIUS = 10;
  const zw = ZONE_SCREEN_W / displayScale;
  const zh = ZONE_SCREEN_H / displayScale;
  const r = RADIUS / displayScale;

  // 居中定位
  const cw = totalWidth * scaleFactor;
  const ch = totalHeight * scaleFactor;
  let zx, zy;

  if (isHorizontal) {
    zx = (cw - zw) / 2;
    zy = position === 'before' ? 6 / displayScale : ch - zh - 6 / displayScale;
  } else {
    zy = (ch - zh) / 2;
    zx = position === 'before' ? 6 / displayScale : cw - zw - 6 / displayScale;
  }

  ctx.save();

  ctx.beginPath();
  ctx.roundRect(zx, zy, zw, zh, r);

  ctx.fillStyle = isActive ? 'rgba(30, 42, 80, 0.9)' : 'rgba(25, 32, 65, 0.75)';
  ctx.fill();

  ctx.setLineDash([8 / displayScale, 5 / displayScale]);
  ctx.strokeStyle = isActive ? 'rgba(100, 150, 230, 0.9)' : 'rgba(80, 120, 200, 0.6)';
  ctx.lineWidth = (isActive ? 2.5 : 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // + 号图标
  const iconScreenSize = 22;
  const iconSize = iconScreenSize / displayScale;
  const cx = zx + zw / 2;
  const cy = zy + zh / 2;
  ctx.globalAlpha = isActive ? 1 : 0.6;
  drawSvgIcon(ctx, cx - iconSize / 2, cy - iconSize / 2, iconSize, displayScale,
    'M5 12h14', 'M12 5v14');

  ctx.restore();
}

export function renderPreview(canvas, layoutResult, options = {}) {
  const {
    hoveredCloseId = -1,
    hoveredImageId = -1,
    isDragging = false,
    dragImageId = -1,
    dragCurrentMX = 0,
    dragCurrentMY = 0,
    dragStartMX = 0,
    dragStartMY = 0,
    dragInsertIndex = -1,
    dragTargetGroupIndex = -1,
    layoutMode = 'horizontal',
    editModeImageId = -1,
    editAction = null,
    hoveredSaveBtn = false,
    hoveredResetBtn = false,
    hoveredRotateBtn = false,
    hoveredRatioBtn = false,
    showRatioMenu = false,
    hoveredRatioIndex = -1,
    hoveredEditBtnId = -1,
    hoveredDupBtnId = -1,
    hoveredDlBtnId = -1,
    dropZone = null,
    groups = [],
    imagePool = null,
    // 行列拖拽
    isRowDragging = false,
    dragGroupIndex = -1,
    dragGroupCurrentMX = 0,
    dragGroupCurrentMY = 0,
    dragGroupStartMX = 0,
    dragGroupStartMY = 0,
    dragGroupDropIndex = -1,
  } = options;
  const { width, height, scaleFactor } = layoutResult;

  if (width === 0 || height === 0) {
    canvas.width = 1;
    canvas.height = 1;
    canvas.style.display = 'none';
    return { displayScale: 1 };
  }

  canvas.style.display = 'block';

  const container = canvas.parentElement;
  const containerW = container.clientWidth - 40;
  const containerH = container.clientHeight - 40;

  const scaledW = width * scaleFactor;
  const scaledH = height * scaleFactor;
  const displayScale = Math.min(containerW / scaledW, containerH / scaledH, 1);

  // 把手在画布外侧（DOM 元素），画布不扩展
  const gOx = 0, gOy = 0;

  canvas.width = Math.round(scaledW);
  canvas.height = Math.round(scaledH);
  canvas.style.width = Math.round(scaledW * displayScale) + 'px';
  canvas.style.height = Math.round(scaledH * displayScale) + 'px';
  canvas.style.position = '';
  canvas.style.top = '';
  canvas.style.left = '';
  canvas.style.boxShadow = '';

  const images = layoutResult._images || [];

  // 重置按钮坐标
  for (const img of images) {
    img.closeBtnX = 0;
    img.closeBtnY = 0;
    img.closeBtnSize = 0;
    img.editBtnX = 0;
    img.editBtnY = 0;
    img.editBtnSize = 0;
    img.saveBtnX = 0;
    img.saveBtnY = 0;
    img.saveBtnSize = 0;
    img.resetBtnX = 0;
    img.resetBtnY = 0;
    img.resetBtnSize = 0;
    img.rotateBtnX = 0;
    img.rotateBtnY = 0;
    img.rotateBtnSize = 0;
    img.ratioBtnX = 0;
    img.ratioBtnY = 0;
    img.ratioBtnSize = 0;
    img.ratioMenuW = 0;
    img.dupBtnX = 0;
    img.dupBtnY = 0;
    img.dupBtnSize = 0;
    img.dlBtnX = 0;
    img.dlBtnY = 0;
    img.dlBtnSize = 0;
  }

  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 画布底色：深蓝凹槽，比外部区域更深
  ctx.fillStyle = '#12122a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // ========== 拖拽模式：实时重排预览 ==========
  if (isDragging && dragImageId !== -1) {
    const dragImg = images.find(i => i.id === dragImageId);

    if (dragImg) {
      // 保存所有图片位置
      const savedPos = new Map();
      for (const img of images) {
        savedPos.set(img.id, { x: img.x, y: img.y, renderWidth: img.renderWidth, renderHeight: img.renderHeight });
      }
      const dragOrigPos = savedPos.get(dragImageId);

      if (dropZone && dropZone.type === 'new-group') {
        // === 新组拖放区域模式 ===
        // 绘制所有非拖拽图片（保持原位）
        ctx.translate(gOx, gOy);
        if (scaleFactor < 1) ctx.scale(scaleFactor, scaleFactor);
        for (const img of images) {
          if (img.id === dragImageId) continue;
          if (img.editState) {
            drawEditedImage(ctx, img, scaleFactor);
          } else {
            ctx.drawImage(img.image, img.x, img.y, img.renderWidth, img.renderHeight);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);

      } else if (dropZone && dropZone.type === 'reorder' && groups.length > 0 && imagePool) {
        const sourceGroupIdx = groups.findIndex(g => g.includes(dragImageId));
        const isCrossGroup = sourceGroupIdx !== -1 && sourceGroupIdx !== dropZone.groupIndex;

        if (!isCrossGroup) {
          // === 同组内重排：画布不变，仅重排目标组内图片 ===
          const targetGroupIds = groups[dropZone.groupIndex] || [];
          const targetGroupImgs = targetGroupIds.map(id => imagePool.get(id)).filter(Boolean);
          const nonDraggedGroup = targetGroupImgs.filter(i => i.id !== dragImageId);
          const tempOrder = [...nonDraggedGroup];
          const clampedIdx = Math.max(0, Math.min(dragInsertIndex >= 0 ? dragInsertIndex : 0, nonDraggedGroup.length));
          tempOrder.splice(clampedIdx, 0, dragImg);

          const layoutFn = layoutMode === 'horizontal' ? layoutRowHorizontal : layoutRowVertical;
          layoutFn(tempOrder);

          // Apply inter-group size matching (same as computeGroupedLayout)
          const gb = (layoutResult._groupBounds || [])[dropZone.groupIndex];
          if (gb) {
            if (layoutMode === 'horizontal') {
              const computedW = tempOrder.reduce((s, i) => s + i.renderWidth, 0);
              if (computedW > 0 && computedW < gb.width) {
                const scale = gb.width / computedW;
                for (const img of tempOrder) {
                  img.renderWidth = Math.round(img.renderWidth * scale);
                  img.renderHeight = Math.round(img.renderHeight * scale);
                }
                let xOffset = 0;
                for (const img of tempOrder) {
                  img.x = xOffset;
                  img.y = 0;
                  xOffset += img.renderWidth;
                }
              }
              for (const img of tempOrder) { img.y += gb.y; }
            } else {
              const computedH = tempOrder.reduce((s, i) => s + i.renderHeight, 0);
              if (computedH > 0 && computedH < gb.height) {
                const scale = gb.height / computedH;
                for (const img of tempOrder) {
                  img.renderWidth = Math.round(img.renderWidth * scale);
                  img.renderHeight = Math.round(img.renderHeight * scale);
                }
                let yOffset = 0;
                for (const img of tempOrder) {
                  img.x = 0;
                  img.y = yOffset;
                  yOffset += img.renderHeight;
                }
              }
              for (const img of tempOrder) { img.x += gb.x; }
            }
          }

          ctx.translate(gOx, gOy);
          if (scaleFactor < 1) ctx.scale(scaleFactor, scaleFactor);
          for (const img of images) {
            if (img.id === dragImageId) continue;
            const inTargetGroup = targetGroupIds.includes(img.id);
            if (inTargetGroup) {
              const reordered = tempOrder.find(t => t.id === img.id);
              if (reordered) {
                if (img.editState) {
                  const saved = savedPos.get(img.id);
                  if (saved) { img.x = reordered.x; img.y = reordered.y; }
                  drawEditedImage(ctx, img, scaleFactor);
                  if (saved) { img.x = saved.x; img.y = saved.y; }
                } else {
                  ctx.drawImage(img.image, reordered.x, reordered.y, reordered.renderWidth, reordered.renderHeight);
                }
              }
            } else {
              if (img.editState) {
                drawEditedImage(ctx, img, scaleFactor);
              } else {
                ctx.drawImage(img.image, img.x, img.y, img.renderWidth, img.renderHeight);
              }
            }
          }
          ctx.setTransform(1, 0, 0, 1, 0, 0);

          for (const img of images) {
            const s = savedPos.get(img.id);
            if (s) { img.x = s.x; img.y = s.y; img.renderWidth = s.renderWidth; img.renderHeight = s.renderHeight; }
          }

        } else {
          // === 跨组重排：从源组移除，插入目标组，按原画布宽度匹配 ===
          const tempGroups = groups.map(g => [...g]);
          // 从源组移除拖拽图片
          for (const g of tempGroups) {
            const idx = g.indexOf(dragImageId);
            if (idx !== -1) g.splice(idx, 1);
          }
          const clampedIdx = Math.max(0, Math.min(dragInsertIndex >= 0 ? dragInsertIndex : 0, tempGroups[dropZone.groupIndex].length));
          tempGroups[dropZone.groupIndex].splice(clampedIdx, 0, dragImageId);
          const nonEmptyTempGroups = tempGroups.filter(g => g.length > 0);

          const tempLayout = computeGroupedLayout(nonEmptyTempGroups, imagePool, layoutMode);
          const tempSF = tempLayout.scaleFactor;
          const tempSW = tempLayout.width * tempSF;
          const tempSH = tempLayout.height * tempSF;

          // 用原画布尺寸做适配，居中显示临时布局
          const fitScale = Math.min((canvas.width - gOx) / tempSW, (canvas.height - gOy) / tempSH);
          let offX, offY;
          if (layoutMode === 'horizontal') {
            offX = (canvas.width - gOx - tempSW * fitScale) / 2 + gOx;
            offY = (canvas.height - gOy - tempSH * fitScale) / 2 + gOy;
          } else {
            offY = (canvas.height - gOy - tempSH * fitScale) / 2 + gOy;
            offX = (canvas.width - gOx - tempSW * fitScale) / 2 + gOx;
          }

          ctx.save();
          ctx.translate(offX, offY);
          ctx.scale(fitScale, fitScale);

          if (tempSF < 1) ctx.scale(tempSF, tempSF);

          for (const img of tempLayout._images) {
            if (img.id === dragImageId) continue;
            if (img.editState) {
              drawEditedImage(ctx, img, tempSF);
            } else {
              ctx.drawImage(img.image, img.x, img.y, img.renderWidth, img.renderHeight);
            }
          }

          ctx.restore();

          layoutResult._tempLayout = {
            ...tempLayout,
            _fitScale: fitScale,
            _fitOffX: offX,
            _fitOffY: offY,
          };

          for (const img of images) {
            const s = savedPos.get(img.id);
            if (s) { img.x = s.x; img.y = s.y; img.renderWidth = s.renderWidth; img.renderHeight = s.renderHeight; }
          }
        }

      } else {
        // dropZone 为 null（鼠标在画布外/组间空隙）→ 原位绘制所有非拖拽图片
        ctx.translate(gOx, gOy);
        if (scaleFactor < 1) ctx.scale(scaleFactor, scaleFactor);
        for (const img of images) {
          if (img.id === dragImageId) continue;
          if (img.editState) {
            drawEditedImage(ctx, img, scaleFactor);
          } else {
            ctx.drawImage(img.image, img.x, img.y, img.renderWidth, img.renderHeight);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }

      // 绘制拖拽图片幽灵
      const sf = scaleFactor * displayScale;
      const origScreenX = dragOrigPos.x * sf + gOx * displayScale;
      const origScreenY = dragOrigPos.y * sf + gOy * displayScale;
      const offsetX = dragCurrentMX - dragStartMX;
      const offsetY = dragCurrentMY - dragStartMY;
      const ghostCanvasX = (origScreenX + offsetX) / displayScale;
      const ghostCanvasY = (origScreenY + offsetY) / displayScale;
      const ghostCanvasW = dragImg.renderWidth * scaleFactor;
      const ghostCanvasH = dragImg.renderHeight * scaleFactor;

      ctx.save();
      ctx.globalAlpha = 0.75;
      ctx.shadowColor = 'rgba(0,0,0,0.4)';
      ctx.shadowBlur = 12 / displayScale;
      if (dragImg.editState) {
        const savedDragPos = { x: dragImg.x, y: dragImg.y };
        dragImg.x = ghostCanvasX;
        dragImg.y = ghostCanvasY;
        drawEditedImage(ctx, dragImg, scaleFactor);
        dragImg.x = savedDragPos.x;
        dragImg.y = savedDragPos.y;
      } else {
        ctx.drawImage(dragImg.image, ghostCanvasX, ghostCanvasY, ghostCanvasW, ghostCanvasH);
      }
      ctx.restore();

      if (layoutResult._tempLayout) delete layoutResult._tempLayout;
    }

    return { displayScale, gripOffX: gOx, gripOffY: gOy };
  }

  // ========== 行列拖拽模式 ==========
  if (isRowDragging && dragGroupIndex !== -1 && groups.length > 0 && imagePool) {
    const dragGroupIds = groups[dragGroupIndex] || [];
    const dragImages = dragGroupIds.map(id => imagePool.get(id)).filter(Boolean);

    if (dragImages.length > 0) {
      const gb = layoutResult._groupBounds || [];
      const isHor = layoutMode === 'horizontal';

      // 剩余组索引（保持原始顺序）
      const remainingIndices = [];
      for (let i = 0; i < gb.length; i++) {
        if (i !== dragGroupIndex) remainingIndices.push(i);
      }

      const dragGb = gb[dragGroupIndex];
      const dragSize = isHor ? dragGb.height : dragGb.width;
      const clampedDrop = Math.max(0, Math.min(dragGroupDropIndex, remainingIndices.length));

      // 为每个剩余组计算主轴偏移量（腾出拖拽组的空间）
      let cumNew = 0;
      const shifts = new Map(); // origGroupIndex -> shift (layout space)
      for (let j = 0; j < remainingIndices.length; j++) {
        const origIdx = remainingIndices[j];
        const origGb = gb[origIdx];
        const origPos = isHor ? origGb.y : origGb.x;
        const size = isHor ? origGb.height : origGb.width;

        if (j === clampedDrop) {
          cumNew += dragSize; // 插入间隙
        }

        shifts.set(origIdx, cumNew - origPos);
        cumNew += size;
      }

      // 保存所有图片原始位置
      const savedPos = new Map();
      for (const img of images) {
        savedPos.set(img.id, { x: img.x, y: img.y });
      }

      // 临时偏移图片位置
      for (let origIdx of shifts.keys()) {
        const shift = shifts.get(origIdx);
        if (shift === 0) continue;
        const groupIds = groups[origIdx];
        if (!groupIds) continue;
        for (const id of groupIds) {
          const img = imagePool.get(id);
          if (!img) continue;
          if (isHor) img.y += shift;
          else img.x += shift;
        }
      }

      // 绘制所有非拖拽图片（在偏移后的位置）
      ctx.save();
      ctx.translate(gOx, gOy);
      if (scaleFactor < 1) ctx.scale(scaleFactor, scaleFactor);
      for (const img of images) {
        if (dragGroupIds.includes(img.id)) continue;
        if (img.editState) {
          drawEditedImage(ctx, img, scaleFactor);
        } else {
          ctx.drawImage(img.image, img.x, img.y, img.renderWidth, img.renderHeight);
        }
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);

      // 恢复图片原始位置
      for (const img of images) {
        const s = savedPos.get(img.id);
        if (s) { img.x = s.x; img.y = s.y; }
      }

      // 绘制拖拽组的幽灵
      if (dragGb) {
        const sf = scaleFactor * displayScale;
        const offsetX = dragGroupCurrentMX - dragGroupStartMX;
        const offsetY = dragGroupCurrentMY - dragGroupStartMY;
        const effectiveOffX = isHor ? 0 : offsetX / displayScale;
        const effectiveOffY = isHor ? offsetY / displayScale : 0;

        const ghostOriginX = dragGb.x * scaleFactor + gOx + effectiveOffX;
        const ghostOriginY = dragGb.y * scaleFactor + gOy + effectiveOffY;

        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 12 / displayScale;

        for (const img of dragImages) {
          const relX = (img.x - dragGb.x) * scaleFactor;
          const relY = (img.y - dragGb.y) * scaleFactor;
          const drawX = ghostOriginX + relX;
          const drawY = ghostOriginY + relY;
          const drawW = img.renderWidth * scaleFactor;
          const drawH = img.renderHeight * scaleFactor;

          if (img.editState) {
            const savedX = img.x, savedY = img.y;
            img.x = drawX / scaleFactor;
            img.y = drawY / scaleFactor;
            drawEditedImage(ctx, img, scaleFactor);
            img.x = savedX;
            img.y = savedY;
          } else {
            ctx.drawImage(img.image, drawX, drawY, drawW, drawH);
          }
        }
        ctx.restore();
      }
    }

    return { displayScale, gripOffX: gOx, gripOffY: gOy };
  }

  // ========== 普通模式 ==========
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 画布底色：深蓝凹槽，比外部区域更深
  ctx.fillStyle = '#12122a';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 缩放上下文：绘制图片（布局空间坐标）
  ctx.translate(gOx, gOy);
  if (scaleFactor < 1) ctx.scale(scaleFactor, scaleFactor);

  // 绘制所有图片
  for (const img of images) {
    if (img.editState) {
      drawEditedImage(ctx, img, scaleFactor);
    } else {
      ctx.drawImage(img.image, img.x, img.y, img.renderWidth, img.renderHeight);
    }
  }

  // 绘制标注层
  if (window.__editModeImageId !== -1 && window.__annotations) {
    const eImg = images.find(i => i.id === window.__editModeImageId);
    if (eImg) {
      const annots = window.__annotations.get(window.__editModeImageId);
      if (annots && annots.length > 0) {
        ctx.save();
        ctx.translate(eImg.x, eImg.y);
        for (const a of annots) {
          renderAnnotation(ctx, a);
        }
        ctx.restore();
      }
      // 绘制进行中的标注（几何图形/箭头/铅笔预览）
      if (window.__annotationDrawing) {
        ctx.save();
        ctx.translate(eImg.x, eImg.y);
        renderInProgressDrawing(ctx, window.__annotationDrawing, window.__activeAnnotationTool);
        ctx.restore();
      }
    }
  }

  // 恢复到画布像素空间
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // 编辑模式：非编辑图片变暗
  if (editModeImageId !== -1) {
    for (const img of images) {
      if (img.id === editModeImageId) continue;
      const bx = img.x * scaleFactor + gOx;
      const by = img.y * scaleFactor + gOy;
      const bw = img.renderWidth * scaleFactor;
      const bh = img.renderHeight * scaleFactor;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
      ctx.fillRect(bx, by, bw, bh);
    }
  }

  // 悬停蓝色边框
  if (hoveredImageId !== -1) {
    const hImg = images.find(i => i.id === hoveredImageId);
    if (hImg) {
      const bx = hImg.x * scaleFactor + gOx;
      const by = hImg.y * scaleFactor + gOy;
      const bw = hImg.renderWidth * scaleFactor;
      const bh = hImg.renderHeight * scaleFactor;
      ctx.save();
      ctx.strokeStyle = 'rgba(66, 133, 244, 0.5)';
      ctx.lineWidth = 2 / displayScale;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.restore();
    }
  }

  // 编辑模式：绘制编辑图片的画布边界虚线
  if (editModeImageId !== -1) {
    const eImg = images.find(i => i.id === editModeImageId);
    if (eImg && eImg.editState) {
      const es = eImg.editState;
      ctx.save();
      ctx.setLineDash([6 / displayScale, 4 / displayScale]);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1.5 / displayScale;
      ctx.strokeRect(
        eImg.x * scaleFactor + gOx, eImg.y * scaleFactor + gOy,
        eImg.renderWidth * scaleFactor, eImg.renderHeight * scaleFactor
      );
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // 编辑模式按钮（保存+复位+旋转）
  // 标注工具（非 scaling）下隐藏比例和旋转按钮，仅显示保存和复位
  if (editModeImageId !== -1) {
    const eImg = images.find(i => i.id === editModeImageId);
    if (eImg) {
      drawEditModeButtons(ctx, eImg, hoveredSaveBtn, hoveredResetBtn, scaleFactor, displayScale, gOx, gOy);
      if (!window.__activeAnnotationTool || window.__activeAnnotationTool === 'scaling') {
        drawRatioButton(ctx, eImg, hoveredRatioBtn, scaleFactor, displayScale, gOx, gOy);
        drawRotateButton(ctx, eImg, hoveredRotateBtn, scaleFactor, displayScale, gOx, gOy);
        if (showRatioMenu) {
          drawRatioMenu(ctx, eImg, hoveredRatioIndex, displayScale);
        }
      }
    }
  } else {
    // 普通模式：编辑按钮和关闭按钮
    for (const img of images) {
      if (img.id === hoveredImageId) {
        drawEditButton(ctx, img, hoveredEditBtnId === img.id, scaleFactor, displayScale, gOx, gOy);
        drawDuplicateButton(ctx, img, hoveredDupBtnId === img.id, scaleFactor, displayScale, gOx, gOy);
        drawDownloadButton(ctx, img, hoveredDlBtnId === img.id, scaleFactor, displayScale, gOx, gOy);
        drawCloseButton(ctx, img, hoveredCloseId === img.id, scaleFactor, displayScale, gOx, gOy);
      }
    }
  }

  return { displayScale, gripOffX: gOx, gripOffY: gOy };
}

// ========== 编辑按钮（固定 28 屏幕像素，左上角） ==========

const EDIT_BTN_SIZE = 28;
const EDIT_BTN_PADDING = 4;

function drawEditButton(ctx, img, hovered, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const sf = scaleFactor * displayScale;
  const screenX = img.x * sf + gOx * displayScale + EDIT_BTN_PADDING;
  const screenY = img.y * sf + gOy * displayScale + EDIT_BTN_PADDING;
  const canvasSize = EDIT_BTN_SIZE / displayScale;
  const canvasX = screenX / displayScale;
  const canvasY = screenY / displayScale;

  img.editBtnX = screenX;
  img.editBtnY = screenY;
  img.editBtnSize = EDIT_BTN_SIZE;

  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(66, 133, 244, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(canvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();

  // square-pen icon (Lucide)
  drawSvgIcon(ctx, canvasX, canvasY, canvasSize, displayScale,
    'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
    'M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z'
  );
  ctx.restore();
}

// ========== 复制按钮（编辑按钮右侧） ==========

function drawDuplicateButton(ctx, img, hovered, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const sf = scaleFactor * displayScale;
  const screenX = img.editBtnX + EDIT_BTN_SIZE + EDIT_BTN_PADDING;
  const screenY = img.editBtnY;
  const canvasSize = EDIT_BTN_SIZE / displayScale;
  const canvasX = screenX / displayScale;
  const canvasY = screenY / displayScale;

  img.dupBtnX = screenX;
  img.dupBtnY = screenY;
  img.dupBtnSize = EDIT_BTN_SIZE;

  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(66, 133, 244, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(canvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();

  // images icon (Lucide)
  drawSvgIcon(ctx, canvasX, canvasY, canvasSize, displayScale,
    'm22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16',
    'M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2',
    'M10 2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-10a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z'
  );
  // Filled dot (circle at 13,7)
  const s = canvasSize / 24;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(canvasX + 13 * s, canvasY + 7 * s, 1 * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// ========== 编辑模式按钮（保存退出 + 复位） ==========

function drawEditModeButtons(ctx, img, saveHovered, resetHovered, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const sf = scaleFactor * displayScale;
  const screenY = img.y * sf + gOy * displayScale + EDIT_BTN_PADDING;
  const canvasSize = EDIT_BTN_SIZE / displayScale;
  const canvasY = screenY / displayScale;

  // 复位按钮 — 左上角（原保存位置）
  const resetScreenX = img.x * sf + gOx * displayScale + EDIT_BTN_PADDING;
  img.resetBtnX = resetScreenX;
  img.resetBtnY = screenY;
  img.resetBtnSize = EDIT_BTN_SIZE;

  const resetCanvasX = resetScreenX / displayScale;

  ctx.save();
  ctx.fillStyle = resetHovered ? 'rgba(233, 69, 96, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(resetCanvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();
  drawSvgIcon(ctx, resetCanvasX, canvasY, canvasSize, displayScale,
    'm2 9 3-3 3 3', 'M13 18H7a2 2 0 0 1-2-2V6',
    'm22 15-3 3-3-3', 'M11 6h6a2 2 0 0 1 2 2v10'
  );
  ctx.restore();

  // 保存退出按钮 — 右上角（与删除按钮位置一致）
  const saveScreenX = (img.x + img.renderWidth) * sf + gOx * displayScale - EDIT_BTN_SIZE - CLOSE_BTN_PADDING;
  img.saveBtnX = saveScreenX;
  img.saveBtnY = screenY;
  img.saveBtnSize = EDIT_BTN_SIZE;

  const saveCanvasX = saveScreenX / displayScale;

  ctx.save();
  ctx.fillStyle = saveHovered ? 'rgba(78, 204, 163, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(saveCanvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();
  drawSvgIcon(ctx, saveCanvasX, canvasY, canvasSize, displayScale,
    'm16 17 5-5-5-5', 'M21 12H9', 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4'
  );
  ctx.restore();
}

// ========== 比例按钮（复位按钮右侧） ==========

function drawRatioButton(ctx, img, hovered, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const sf = scaleFactor * displayScale;
  const screenY = img.y * sf + gOy * displayScale + EDIT_BTN_PADDING;
  const canvasSize = EDIT_BTN_SIZE / displayScale;
  const canvasY = screenY / displayScale;

  const ratioScreenX = img.resetBtnX + EDIT_BTN_SIZE + EDIT_BTN_PADDING;
  img.ratioBtnX = ratioScreenX;
  img.ratioBtnY = screenY;
  img.ratioBtnSize = EDIT_BTN_SIZE;

  const ratioCanvasX = ratioScreenX / displayScale;

  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(66, 133, 244, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(ratioCanvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();
  drawSvgIcon(ctx, ratioCanvasX, canvasY, canvasSize, displayScale,
    'M2 4h20v16H2z',
    'M12 9v11',
    'M2 9h13a2 2 0 0 1 2 2v9'
  );
  ctx.restore();
}

// ========== 比例下拉菜单 ==========

const RATIO_MENU_W = 200;
const RATIO_MENU_HEADER_H = 36;
const RATIO_MENU_GRID_H = 40;
const RATIO_MENU_GRID_COLS = 2;
const RATIO_MENU_PADDING = 4;

// 布局常量（供 hitTest 使用）
const RATIO_GRID_START_INDEX = 1; // index 0 = header, 1+ = grid items
const RATIO_GRID_ITEM_W = RATIO_MENU_W / RATIO_MENU_GRID_COLS;

function getRatioMenuTotalHeight() {
  const gridRows = Math.ceil((ASPECT_RATIOS.length - RATIO_GRID_START_INDEX) / RATIO_MENU_GRID_COLS);
  return RATIO_MENU_HEADER_H + gridRows * RATIO_MENU_GRID_H;
}

function drawRatioMenu(ctx, img, hoveredIndex, displayScale) {
  const menuX = img.ratioBtnX;
  let menuY = img.ratioBtnY + img.ratioBtnSize + RATIO_MENU_PADDING;
  const menuW = RATIO_MENU_W / displayScale;
  const headerH = RATIO_MENU_HEADER_H / displayScale;
  const gridItemH = RATIO_MENU_GRID_H / displayScale;
  const gridItemW = RATIO_GRID_ITEM_W / displayScale;
  const totalH = getRatioMenuTotalHeight() / displayScale;
  const gridRows = Math.ceil((ASPECT_RATIOS.length - RATIO_GRID_START_INDEX) / RATIO_MENU_GRID_COLS);

  // 超出画布底部时向上翻转
  const canvasH = ctx.canvas.height;
  if (menuY / displayScale + totalH > canvasH) {
    menuY = img.ratioBtnY - RATIO_MENU_PADDING - getRatioMenuTotalHeight();
  }

  const canvasX = menuX / displayScale;
  const canvasY = menuY / displayScale;

  img.ratioMenuX = menuX;
  img.ratioMenuY = menuY;
  img.ratioMenuW = RATIO_MENU_W;
  img.ratioMenuH = getRatioMenuTotalHeight();

  ctx.save();

  // 背景 + 阴影
  ctx.shadowColor = 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 8 / displayScale;
  ctx.fillStyle = 'rgba(30, 30, 30, 0.95)';
  ctx.beginPath();
  ctx.roundRect(canvasX, canvasY, menuW, totalH, 4 / displayScale);
  ctx.fill();
  ctx.shadowBlur = 0;

  // --- Header: "源图比例" ---
  const isHeaderHovered = hoveredIndex === 0;
  if (isHeaderHovered) {
    ctx.fillStyle = 'rgba(66, 133, 244, 0.3)';
    ctx.beginPath();
    const r = 4 / displayScale;
    ctx.roundRect(canvasX, canvasY, menuW, headerH, [r, r, 0, 0]);
    ctx.fill();
  }

  // Scaling icon
  const iconSize = 18 / displayScale;
  const iconX = canvasX + 8 / displayScale;
  const iconY = canvasY + (headerH - iconSize) / 2;
  drawSvgIcon(ctx, iconX, iconY, iconSize, displayScale,
    'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7',
    'M14 15H9v-5',
    'M16 3h5v5',
    'M21 3 9 15'
  );

  // Header label
  ctx.fillStyle = isHeaderHovered ? '#fff' : 'rgba(255,255,255,0.85)';
  ctx.font = `${13 / displayScale}px system-ui, sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(ASPECT_RATIOS[0].label, canvasX + 32 / displayScale, canvasY + headerH / 2);

  // --- Grid: 比例选项（两列） ---
  const gridY = canvasY + headerH;
  const previewMaxH = gridItemH * 0.45;
  const previewMaxW = gridItemW * 0.35;
  const cornerR = 2 / displayScale;

  for (let i = RATIO_GRID_START_INDEX; i < ASPECT_RATIOS.length; i++) {
    const gi = i - RATIO_GRID_START_INDEX;
    const col = gi % RATIO_MENU_GRID_COLS;
    const row = Math.floor(gi / RATIO_MENU_GRID_COLS);
    const ix = canvasX + col * gridItemW;
    const iy = gridY + row * gridItemH;
    const isHovered = i === hoveredIndex;

    if (isHovered) {
      ctx.fillStyle = 'rgba(66, 133, 244, 0.3)';
      ctx.fillRect(ix, iy, gridItemW, gridItemH);
    }

    // 比例预览矩形（带圆角）
    const r = ASPECT_RATIOS[i].ratio;
    let pw, ph;
    if (previewMaxW / previewMaxH > r) {
      ph = previewMaxH;
      pw = previewMaxH * r;
    } else {
      pw = previewMaxW;
      ph = previewMaxW / r;
    }
    const px = ix + (gridItemW - pw) / 2;
    const py = iy + gridItemH * 0.12;

    ctx.strokeStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5 / displayScale;
    ctx.beginPath();
    ctx.roundRect(px, py, pw, ph, cornerR);
    ctx.stroke();

    // 文字标签
    ctx.fillStyle = isHovered ? '#fff' : 'rgba(255,255,255,0.85)';
    ctx.font = `${11 / displayScale}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    ctx.fillText(ASPECT_RATIOS[i].label, ix + gridItemW / 2, py + ph + 2 / displayScale);
  }

  ctx.restore();
}

// ========== 旋转按钮（右下角） ==========

const ROTATE_BTN_SIZE = 28;
const ROTATE_BTN_PADDING = 4;

function drawRotateButton(ctx, img, hovered, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const sf = scaleFactor * displayScale;
  const screenX = (img.x + img.renderWidth) * sf + gOx * displayScale - ROTATE_BTN_SIZE - ROTATE_BTN_PADDING;
  const screenY = (img.y + img.renderHeight) * sf + gOy * displayScale - ROTATE_BTN_SIZE - ROTATE_BTN_PADDING;
  const canvasSize = ROTATE_BTN_SIZE / displayScale;
  const canvasX = screenX / displayScale;
  const canvasY = screenY / displayScale;

  img.rotateBtnX = screenX;
  img.rotateBtnY = screenY;
  img.rotateBtnSize = ROTATE_BTN_SIZE;

  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(66, 133, 244, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(canvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();
  drawSvgIcon(ctx, canvasX, canvasY, canvasSize, displayScale,
    'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8',
    'M3 3v5h5'
  );
  ctx.restore();
}

// ========== SVG 图标绘制工具 ==========

function drawSvgIcon(ctx, x, y, size, displayScale, ...pathStrings) {
  const s = size / 24;
  ctx.save();
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = Math.max(1.5, 2 / displayScale / s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.translate(x, y);
  ctx.scale(s, s);
  for (const ps of pathStrings) {
    const p = new Path2D(ps);
    ctx.stroke(p);
  }
  ctx.restore();
}

// ========== 编辑图片渲染 ==========

function drawEditedImage(ctx, img, scaleFactor) {
  const es = img.editState;
  if (!es) return;

  const cropW = es.cropWidth;
  const cropH = es.cropHeight;
  const origW = img.originalWidth;
  const origH = img.originalHeight;

  const displayW = img.renderWidth;
  const displayH = img.renderHeight;
  const editScale = Math.max(displayW / cropW, displayH / cropH);

  // Minimum scale to cover the crop area with rotation
  const absCos = Math.abs(Math.cos(es.rotation));
  const absSin = Math.abs(Math.sin(es.rotation));
  const baseFit = Math.max(
    (cropW * absCos + cropH * absSin) / origW,
    (cropW * absSin + cropH * absCos) / origH
  );
  const effectiveScale = baseFit * Math.max(1.0, es.zoom);

  const centerX = img.x + displayW / 2;
  const centerY = img.y + displayH / 2;

  ctx.save();

  ctx.beginPath();
  ctx.rect(img.x, img.y, displayW, displayH);
  ctx.clip();

  ctx.translate(centerX, centerY);
  ctx.scale(editScale, editScale);
  ctx.translate(es.panX, es.panY);
  ctx.scale(effectiveScale, effectiveScale);
  ctx.rotate(es.rotation);
  ctx.drawImage(
    img.image,
    -origW / 2, -origH / 2,
    origW, origH
  );

  ctx.restore();
}

const CLOSE_BTN_SIZE = 28;
const CLOSE_BTN_PADDING = 4;

function drawCloseButton(ctx, img, hovered, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const sf = scaleFactor * displayScale;
  const screenX = (img.x + img.renderWidth) * sf + gOx * displayScale - CLOSE_BTN_SIZE - CLOSE_BTN_PADDING;
  const screenY = img.y * sf + gOy * displayScale + CLOSE_BTN_PADDING;
  const canvasSize = CLOSE_BTN_SIZE / displayScale;
  const canvasX = screenX / displayScale;
  const canvasY = screenY / displayScale;

  img.closeBtnX = screenX;
  img.closeBtnY = screenY;
  img.closeBtnSize = CLOSE_BTN_SIZE;

  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(233, 69, 96, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(canvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();

  drawSvgIcon(ctx, canvasX, canvasY, canvasSize, displayScale,
    'M10 11v6', 'M14 11v6',
    'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
    'M3 6h18', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2');
  ctx.restore();
}

// ========== 下载按钮（右下角，普通模式悬停时显示） ==========

const DL_BTN_SIZE = 28;
const DL_BTN_PADDING = 4;

function drawDownloadButton(ctx, img, hovered, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const sf = scaleFactor * displayScale;
  const screenX = (img.x + img.renderWidth) * sf + gOx * displayScale - DL_BTN_SIZE - DL_BTN_PADDING;
  const screenY = (img.y + img.renderHeight) * sf + gOy * displayScale - DL_BTN_SIZE - DL_BTN_PADDING;
  const canvasSize = DL_BTN_SIZE / displayScale;
  const canvasX = screenX / displayScale;
  const canvasY = screenY / displayScale;

  img.dlBtnX = screenX;
  img.dlBtnY = screenY;
  img.dlBtnSize = DL_BTN_SIZE;

  ctx.save();
  ctx.fillStyle = hovered ? 'rgba(66, 133, 244, 0.9)' : 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.roundRect(canvasX, canvasY, canvasSize, canvasSize, 3 / displayScale);
  ctx.fill();

  // Lucide download icon
  drawSvgIcon(ctx, canvasX, canvasY, canvasSize, displayScale,
    'M12 15V3',
    'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
    'm7 10 5 5 5-5'
  );
  ctx.restore();
}

// ========== 命中检测（屏幕/CSS 像素坐标，与鼠标事件一致） ==========

const CROP_EDGE_THRESHOLD = 8;
const CORNER_ZONE = 30;

function drawPlaceholder(ctx, x, y, w, h, displayScale) {
  ctx.save();
  ctx.setLineDash([6 / displayScale, 4 / displayScale]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.5 / displayScale;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.restore();
}

function findImageGroupBounds(img, groupBounds, allImages, layoutMode) {
  for (let i = 0; i < groupBounds.length; i++) {
    const gb = groupBounds[i];
    if (layoutMode === 'horizontal') {
      if (img.y >= gb.y - 1 && img.y <= gb.y + gb.height + 1) return { index: i, ...gb };
    } else {
      if (img.x >= gb.x - 1 && img.x <= gb.x + gb.width + 1) return { index: i, ...gb };
    }
  }
  return null;
}

export function hitTest(mouseX, mouseY, images, hoveredImageId = -1, editModeImageId = -1, layoutMode = 'horizontal') {
  const lr = stateLastLayoutResult;

  for (let i = images.length - 1; i >= 0; i--) {
    const img = images[i];
    if (!lr) continue;
    const sf = lr.scaleFactor * (lr._displayScale || 1);
    const ew = img.renderWidth;
    const eh = img.renderHeight;
    const ix = img.x * sf, iy = img.y * sf;
    const iw = ew * sf, ih = eh * sf;

    // 编辑模式下的图片
    if (img.id === editModeImageId) {
      // 比例下拉菜单项（最高优先级）
      if (img.ratioMenuW > 0 &&
          mouseX >= img.ratioMenuX && mouseX < img.ratioMenuX + img.ratioMenuW &&
          mouseY >= img.ratioMenuY && mouseY < img.ratioMenuY + img.ratioMenuH) {
        const relX = mouseX - img.ratioMenuX;
        const relY = mouseY - img.ratioMenuY;
        let index = -1;
        if (relY < RATIO_MENU_HEADER_H) {
          index = 0; // header row
        } else {
          const gridRelY = relY - RATIO_MENU_HEADER_H;
          const col = Math.floor(relX / RATIO_GRID_ITEM_W);
          const row = Math.floor(gridRelY / RATIO_MENU_GRID_H);
          index = RATIO_GRID_START_INDEX + row * RATIO_MENU_GRID_COLS + col;
        }
        if (index >= 0 && index < ASPECT_RATIOS.length) {
          return { image: img, isRatioMenuItem: true, ratioMenuIndex: index };
        }
      }
      // 保存按钮
      if (img.saveBtnSize > 0 &&
          mouseX >= img.saveBtnX && mouseX < img.saveBtnX + img.saveBtnSize &&
          mouseY >= img.saveBtnY && mouseY < img.saveBtnY + img.saveBtnSize) {
        return { image: img, isSaveBtn: true };
      }
      // 复位按钮
      if (img.resetBtnSize > 0 &&
          mouseX >= img.resetBtnX && mouseX < img.resetBtnX + img.resetBtnSize &&
          mouseY >= img.resetBtnY && mouseY < img.resetBtnY + img.resetBtnSize) {
        return { image: img, isResetBtn: true };
      }
      // 比例按钮
      if (img.ratioBtnSize > 0 &&
          mouseX >= img.ratioBtnX && mouseX < img.ratioBtnX + img.ratioBtnSize &&
          mouseY >= img.ratioBtnY && mouseY < img.ratioBtnY + img.ratioBtnSize) {
        return { image: img, isRatioBtn: true };
      }
      // 旋转按钮 — 仅右下角，按钮形式
      if (img.rotateBtnSize > 0 &&
          mouseX >= img.rotateBtnX && mouseX < img.rotateBtnX + img.rotateBtnSize &&
          mouseY >= img.rotateBtnY && mouseY < img.rotateBtnY + img.rotateBtnSize) {
        return { image: img, isRotateBtn: true };
      }

      // 裁切边缘
      if (layoutMode === 'horizontal') {
        // 左右边缘：调整宽度（主轴）
        const leftEdge = ix;
        const rightEdge = ix + iw;
        if (Math.abs(mouseX - leftEdge) <= CROP_EDGE_THRESHOLD && mouseY >= iy && mouseY <= iy + ih) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'left', cropEdgeAxis: 'width' };
        }
        if (Math.abs(mouseX - rightEdge) <= CROP_EDGE_THRESHOLD && mouseY >= iy && mouseY <= iy + ih) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'right', cropEdgeAxis: 'width' };
        }
        // 上下边缘：调整高度（副轴，锁定显示宽度）
        const topEdge = iy;
        const bottomEdge = iy + ih;
        if (Math.abs(mouseY - topEdge) <= CROP_EDGE_THRESHOLD && mouseX >= ix && mouseX <= ix + iw) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'top', cropEdgeAxis: 'height' };
        }
        if (Math.abs(mouseY - bottomEdge) <= CROP_EDGE_THRESHOLD && mouseX >= ix && mouseX <= ix + iw) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'bottom', cropEdgeAxis: 'height' };
        }
      } else {
        // 上下边缘：调整高度（主轴）
        const topEdge = iy;
        const bottomEdge = iy + ih;
        if (Math.abs(mouseY - topEdge) <= CROP_EDGE_THRESHOLD && mouseX >= ix && mouseX <= ix + iw) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'top', cropEdgeAxis: 'height' };
        }
        if (Math.abs(mouseY - bottomEdge) <= CROP_EDGE_THRESHOLD && mouseX >= ix && mouseX <= ix + iw) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'bottom', cropEdgeAxis: 'height' };
        }
        // 左右边缘：调整宽度（副轴，锁定显示高度）
        const leftEdge = ix;
        const rightEdge = ix + iw;
        if (Math.abs(mouseX - leftEdge) <= CROP_EDGE_THRESHOLD && mouseY >= iy && mouseY <= iy + ih) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'left', cropEdgeAxis: 'width' };
        }
        if (Math.abs(mouseX - rightEdge) <= CROP_EDGE_THRESHOLD && mouseY >= iy && mouseY <= iy + ih) {
          return { image: img, isCropEdge: true, cropEdgeSide: 'right', cropEdgeAxis: 'width' };
        }
      }
      // 图片主体（可平移）
      if (mouseX >= ix && mouseX < ix + iw && mouseY >= iy && mouseY < iy + ih) {
        return { image: img, isImageBody: true };
      }
      continue;
    }

    // 普通模式：编辑按钮（仅对悬停图片）
    if (img.id === hoveredImageId && img.editBtnSize > 0 &&
        mouseX >= img.editBtnX && mouseX < img.editBtnX + img.editBtnSize &&
        mouseY >= img.editBtnY && mouseY < img.editBtnY + img.editBtnSize) {
      return { image: img, isEditBtn: true };
    }

    // 复制按钮（仅对悬停图片）
    if (img.id === hoveredImageId && img.dupBtnSize > 0 &&
        mouseX >= img.dupBtnX && mouseX < img.dupBtnX + img.dupBtnSize &&
        mouseY >= img.dupBtnY && mouseY < img.dupBtnY + img.dupBtnSize) {
      return { image: img, isDupBtn: true };
    }

    // 下载按钮（仅对悬停图片）
    if (img.id === hoveredImageId && img.dlBtnSize > 0 &&
        mouseX >= img.dlBtnX && mouseX < img.dlBtnX + img.dlBtnSize &&
        mouseY >= img.dlBtnY && mouseY < img.dlBtnY + img.dlBtnSize) {
      return { image: img, isDlBtn: true };
    }

    // 关闭按钮（仅对悬停图片，且不在编辑模式）
    if (editModeImageId === -1 && img.id === hoveredImageId && img.closeBtnSize > 0 &&
        mouseX >= img.closeBtnX && mouseX < img.closeBtnX + img.closeBtnSize &&
        mouseY >= img.closeBtnY && mouseY < img.closeBtnY + img.closeBtnSize) {
      return { image: img, isCloseBtn: true };
    }

    // 图片区域
    if (mouseX >= ix && mouseX < ix + iw && mouseY >= iy && mouseY < iy + ih) {
      return { image: img };
    }
  }
  return { image: null };
}

let stateLastLayoutResult = null;
export function setLayoutResult(lr) { stateLastLayoutResult = lr; }

// ========== 导出 ==========

export function renderFullResolution(layoutResult) {
  const { width, height, scaleFactor } = layoutResult;
  const outputW = Math.round(width * scaleFactor);
  const outputH = Math.round(height * scaleFactor);
  const offscreen = document.createElement('canvas');
  offscreen.width = outputW;
  offscreen.height = outputH;
  const ctx = offscreen.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, outputW, outputH);
  if (scaleFactor < 1) ctx.scale(scaleFactor, scaleFactor);
  const images = layoutResult._images || [];
  for (const img of images) {
    if (img.editState) {
      drawEditedImage(ctx, img, scaleFactor);
    } else {
      ctx.drawImage(img.image, img.x, img.y, img.renderWidth, img.renderHeight);
    }
  }
  return offscreen;
}

export function exportImage(layoutResult, format = 'png', quality = 90, resolutionScale = 1) {
  const fullCanvas = renderFullResolution(layoutResult);
  const targetW = Math.round(fullCanvas.width * resolutionScale);
  const targetH = Math.round(fullCanvas.height * resolutionScale);
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = targetW;
  exportCanvas.height = targetH;
  const ctx = exportCanvas.getContext('2d');
  ctx.drawImage(fullCanvas, 0, 0, targetW, targetH);
  if (format === 'png') return exportCanvas.toDataURL('image/png');
  else return exportCanvas.toDataURL('image/jpeg', quality / 100);
}

/** 小尺寸预览（最大 320px），用于滑块拖动时的快速预览 */
export function generatePreviewDataURL(format = 'png', quality = 90) {
  const fullCanvas = renderFullResolution(stateLastLayoutResult);
  const MAX_PREVIEW = 320;
  const scale = Math.min(MAX_PREVIEW / fullCanvas.width, MAX_PREVIEW / fullCanvas.height, 1);
  const w = Math.round(fullCanvas.width * scale);
  const h = Math.round(fullCanvas.height * scale);
  const previewCanvas = document.createElement('canvas');
  previewCanvas.width = w;
  previewCanvas.height = h;
  const ctx = previewCanvas.getContext('2d');
  ctx.drawImage(fullCanvas, 0, 0, w, h);
  if (format === 'png') return previewCanvas.toDataURL('image/png');
  return previewCanvas.toDataURL('image/jpeg', quality / 100);
}

/** 导出单张图片（含编辑：裁剪/平移/旋转/缩放） */
export function exportSingleImage(img, format = 'png', quality = 90, resolutionScale = 1) {
  const baseW = img.editState ? img.editState.cropWidth : img.originalWidth;
  const baseH = img.editState ? img.editState.cropHeight : img.originalHeight;
  const outputW = Math.round(baseW * resolutionScale);
  const outputH = Math.round(baseH * resolutionScale);

  const offscreen = document.createElement('canvas');
  offscreen.width = outputW;
  offscreen.height = outputH;
  const ctx = offscreen.getContext('2d');

  if (format === 'jpg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, outputW, outputH);
  }

  if (img.editState) {
    const es = img.editState;
    const cropW = es.cropWidth;
    const cropH = es.cropHeight;
    const origW = img.originalWidth;
    const origH = img.originalHeight;

    const displayW = outputW;
    const displayH = outputH;
    const editScale = Math.max(displayW / cropW, displayH / cropH);

    const absCos = Math.abs(Math.cos(es.rotation));
    const absSin = Math.abs(Math.sin(es.rotation));
    const baseFit = Math.max(
      (cropW * absCos + cropH * absSin) / origW,
      (cropW * absSin + cropH * absCos) / origH
    );
    const effectiveScale = baseFit * Math.max(1.0, es.zoom);

    const centerX = displayW / 2;
    const centerY = displayH / 2;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, displayW, displayH);
    ctx.clip();
    ctx.translate(centerX, centerY);
    ctx.scale(editScale, editScale);
    ctx.translate(es.panX, es.panY);
    ctx.scale(effectiveScale, effectiveScale);
    ctx.rotate(es.rotation);
    ctx.drawImage(img.image, -origW / 2, -origH / 2, origW, origH);
    ctx.restore();
  } else {
    ctx.drawImage(img.image, 0, 0, outputW, outputH);
  }

  if (format === 'png') return offscreen.toDataURL('image/png');
  else return offscreen.toDataURL('image/jpeg', quality / 100);
}

/** 单张图片小尺寸预览 DataURL（最大 320px） */
export function generateSingleImagePreviewDataURL(img, format = 'png', quality = 90) {
  const baseW = img.editState ? img.editState.cropWidth : img.originalWidth;
  const baseH = img.editState ? img.editState.cropHeight : img.originalHeight;
  const MAX_PREVIEW = 320;
  const scale = Math.min(MAX_PREVIEW / baseW, MAX_PREVIEW / baseH, 1);
  return exportSingleImage(img, format, quality, scale);
}

function renderInProgressDrawing(ctx, drawing, tool) {
  if (!drawing) return;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 3]);
  ctx.lineCap = 'round';

  switch (tool) {
    case 'geometry': {
      const { startX, startY, currentX, currentY } = drawing;
      ctx.strokeRect(
        Math.min(startX, currentX),
        Math.min(startY, currentY),
        Math.abs(currentX - startX),
        Math.abs(currentY - startY)
      );
      break;
    }
    case 'arrow': {
      const { startX, startY, currentX, currentY } = drawing;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(currentX, currentY);
      ctx.stroke();
      break;
    }
    case 'pencil': {
      const { points } = drawing;
      if (points && points.length >= 2) {
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.stroke();
      }
      break;
    }
  }
  ctx.setLineDash([]);
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
