/**
 * theme.js — 浅色/深色配色方案模块
 *
 * 设计要点（镜像 src/i18n/i18n.js 的成熟模式）：
 * - 主题设置取值：'system' | 'light' | 'dark'，默认 'system'
 * - 'system' 时解析为系统主题（matchMedia prefers-color-scheme），并实时跟随系统变化
 * - 通过 document.documentElement.dataset.theme（'light'|'dark'）切换 CSS 变量
 * - 切换时通过 onThemeChange 注册的回调通知组件重绘（画布等）
 * - 持久化于 localStorage['minimix-theme']
 */

const STORAGE_KEY = 'minimix-theme';
const DEFAULT_SETTING = 'system';

let currentResolved = 'dark';   // 已解析主题：'light' | 'dark'（不含 'system'）
let listeners = new Set();
let systemListener = null;      // matchMedia change 监听器（仅 system 模式下激活）

/** 探测系统主题 → 'light' | 'dark' */
export function detectSystemTheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/** 读取持久化的主题设置（'system' | 'light' | 'dark'） */
export function getThemeSetting() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'system' || v === 'light' || v === 'dark') return v;
  } catch (_) { /* localStorage 不可用时静默回退 */ }
  return DEFAULT_SETTING;
}

/** 设置并持久化主题设置（值可为 'system' | 'light' | 'dark'） */
export function setThemeSetting(value) {
  if (value !== 'system' && value !== 'light' && value !== 'dark') return;
  try { localStorage.setItem(STORAGE_KEY, value); } catch (_) { /* ignore */ }
  applyTheme(value);
}

/** 当前已解析的主题（'light' | 'dark'，不含 'system'） */
export function getCurrentTheme() {
  return currentResolved;
}

/**
 * 应用主题：解析 'system' → 实际主题，写 <html data-theme>，
 * 在 'system' 模式下注册系统主题变化监听器（实时跟随），并通知订阅者重绘。
 * @param {string} setting 'system' | 'light' | 'dark'
 */
export function applyTheme(setting) {
  const resolved = setting === 'system' ? detectSystemTheme() : setting;

  // 仅 'system' 模式下监听系统主题变化
  attachSystemListener(setting === 'system');

  if (resolved === currentResolved) return;
  currentResolved = resolved;
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = resolved;
  }
  notify();
}

/** 'system' 模式下注册 matchMedia 监听器；切到显式主题时移除，避免系统变化干扰 */
function attachSystemListener(enable) {
  if (typeof window === 'undefined' || !window.matchMedia) return;
  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  if (enable && !systemListener) {
    systemListener = (e) => {
      const resolved = e.matches ? 'dark' : 'light';
      if (resolved === currentResolved) return;
      currentResolved = resolved;
      document.documentElement.dataset.theme = resolved;
      notify();
    };
    mql.addEventListener('change', systemListener);
  } else if (!enable && systemListener) {
    mql.removeEventListener('change', systemListener);
    systemListener = null;
  }
}

function notify() {
  listeners.forEach(fn => { try { fn(currentResolved); } catch (e) { console.error(e); } });
}

/** 订阅主题变更，返回取消订阅函数 */
export function onThemeChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// 模块加载时立即应用持久化的主题设置
applyTheme(getThemeSetting());
