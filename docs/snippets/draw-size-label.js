// ========== 图片尺寸标签（左下角） ==========
// 存档自 stitch-engine.js (2026-05-05)
// 调用位置：renderPreview() 中两处
//   1. 编辑模式下：drawSizeLabel(ctx, eImg, scaleFactor, displayScale, gOx, gOy);
//   2. 普通模式悬停时：drawSizeLabel(ctx, img, scaleFactor, displayScale, gOx, gOy);

function drawSizeLabel(ctx, img, scaleFactor, displayScale, gOx = 0, gOy = 0) {
  const origW = img.originalWidth;
  const origH = img.originalHeight;
  let dispW = origW, dispH = origH;
  if (img.editState) {
    dispW = Math.round(img.renderWidth);
    dispH = Math.round(img.renderHeight);
  }
  const showOriginal = (dispW !== origW || dispH !== origH);

  const mainText = `${dispW} × ${dispH}`;
  const text = showOriginal ? `${mainText} (${origW} × ${origH})` : mainText;

  const FONT_SIZE = 10;
  const PAD_X = 4, PAD_Y = 2;

  const sf = scaleFactor * displayScale;
  const fontSize = FONT_SIZE / displayScale;
  ctx.save();
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  const textW = ctx.measureText(text).width;
  const labelH = (FONT_SIZE + PAD_Y * 2) / displayScale;
  const labelW = textW + (PAD_X * 2) / displayScale;

  const canvasX = (img.x * sf + gOx * displayScale) / displayScale;
  const canvasY = ((img.y + img.renderHeight) * sf + gOy * displayScale) / displayScale - labelH;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fillRect(canvasX, canvasY, labelW, labelH);

  ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(text, canvasX + (PAD_X / displayScale), canvasY + labelH / 2);
  ctx.restore();
}
