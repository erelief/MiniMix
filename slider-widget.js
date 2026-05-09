// slider-widget.js

/**
 * Create a slider widget.
 *
 * @param {Object} options
 * @param {HTMLElement} options.container - DOM element to mount into
 * @param {number} options.min
 * @param {number} options.max
 * @param {number} options.value
 * @param {number} options.step - snap increment (default 1)
 * @param {(val: number) => void} options.onChange - called on every change
 * @param {() => void} [options.onChangeEnd] - called when drag ends
 * @returns {{ setValue: (v: number) => void, getValue: () => number, destroy: () => void }}
 */
export function createSlider(options) {
  const { container, min, max, step = 1, onChange, onChangeEnd } = options;

  let value = clamp(options.value, min, max);
  let isDragging = false;

  // Build DOM
  const track = document.createElement('div');
  track.className = 'slider-track';

  const thumb = document.createElement('div');
  thumb.className = 'slider-thumb';
  track.appendChild(thumb);

  container.appendChild(track);

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function snap(v) {
    return Math.round(v / step) * step;
  }

  function updateThumbPosition() {
    const pct = ((value - min) / (max - min)) * 100;
    thumb.style.left = pct + '%';
  }

  function setValue(v) {
    const snapped = snap(clamp(v, min, max));
    if (snapped !== value) {
      value = snapped;
      updateThumbPosition();
      onChange(value);
    }
  }

  function getValue() {
    return value;
  }

  function handleMouseDown(e) {
    if (e.button !== 0) return;
    isDragging = true;
    e.preventDefault();
    updateValueFromEvent(e);
  }

  function handleMouseMove(e) {
    if (!isDragging) return;
    updateValueFromEvent(e);
  }

  function handleMouseUp() {
    if (isDragging) {
      isDragging = false;
      if (onChangeEnd) onChangeEnd();
    }
  }

  function updateValueFromEvent(e) {
    const rect = track.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const raw = min + pct * (max - min);
    setValue(raw);
  }

  function handleWheel(e) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -step : step;
    setValue(value + delta);
    if (onChangeEnd) onChangeEnd();
  }

  track.addEventListener('mousedown', handleMouseDown);
  document.addEventListener('mousemove', handleMouseMove);
  document.addEventListener('mouseup', handleMouseUp);
  track.addEventListener('wheel', handleWheel, { passive: false });

  updateThumbPosition();

  return {
    setValue,
    getValue,
    destroy() {
      track.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      track.removeEventListener('wheel', handleWheel);
      track.remove();
    },
  };
}
