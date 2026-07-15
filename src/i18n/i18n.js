/**
 * i18n.js — 轻量自研多语言模块
 *
 * 设计要点：
 * - 开发语言（基准 / 回退）为英语 en
 * - 语言设置取值：'system' | 'en' | 'zh-CN'，默认 'system'
 * - 'system' 时解析为系统语言（中文语系 → zh-CN，其余 → en）
 * - 找不到的 key 回退到 en，再回退到 key 本身（并 console.warn，便于排查 / 构建检查兜底）
 * - 切换语言时通过 onLanguageChange 注册的回调通知组件重渲染
 * - 持久化于 localStorage['minimix-language']
 */

import en from './locales/en.js';
import zhCN from './locales/zh-CN.js';

const STORAGE_KEY = 'minimix-language';
const DEFAULT_SETTING = 'system';

const messages = {
  en,
  'zh-CN': zhCN,
};

let currentLang = 'en';
let listeners = new Set();

/** 探测系统语言 → 归一到支持的语言，非中语系回退 en */
export function detectSystemLang() {
  const nav = (typeof navigator !== 'undefined' && navigator) ? navigator : null;
  if (!nav) return 'en';
  const lang = (nav.language || nav.userLanguage || 'en').toLowerCase();
  if (lang.startsWith('zh')) {
    // zh-CN / zh-Hans / zh-TW 等统一映射到 zh-CN（当前唯一中文资源）
    return 'zh-CN';
  }
  return 'en';
}

/** 读取持久化的语言设置（'system' | 'en' | 'zh-CN'） */
export function getLanguageSetting() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'system' || v === 'en' || v === 'zh-CN') return v;
  } catch (_) { /* localStorage 不可用时静默回退 */ }
  return DEFAULT_SETTING;
}

/** 设置并持久化语言设置（值可为 'system' | 'en' | 'zh-CN'） */
export function setLanguageSetting(value) {
  if (value !== 'system' && value !== 'en' && value !== 'zh-CN') return;
  try { localStorage.setItem(STORAGE_KEY, value); } catch (_) { /* ignore */ }
  applyLanguage(value);
}

/** 当前已解析的语言（'en' | 'zh-CN'，不含 'system'） */
export function getCurrentLang() {
  return currentLang;
}

/**
 * 应用语言：解析 'system' → 实际语言，更新 currentLang、<html lang>、窗口标题，
 * 并通过回调通知订阅者重渲染。
 * @param {string} setting 'system' | 'en' | 'zh-CN'
 */
export function applyLanguage(setting) {
  const resolved = setting === 'system' ? detectSystemLang() : setting;
  const changed = resolved !== currentLang;
  currentLang = resolved;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = resolved;
  }
  setWindowTitle();
  if (changed) {
    notify();
  }
}

/**
 * 即时更新窗口标题（Tauri 用 getCurrentWindow().setTitle，浏览器用 document.title）。
 * Tauri API 懒加载，避免在非 Tauri 环境引入开销。
 */
async function setWindowTitle() {
  if (typeof window === 'undefined') return;
  const title = t('app.windowTitle');
  // Tauri v2：直接设置原生窗口标题
  if (typeof window.__TAURI_INTERNALS__ !== 'undefined') {
    try {
      const { getCurrentWindow } = await import('@tauri-apps/api/window');
      await getCurrentWindow().setTitle(title);
      return;
    } catch (e) {
      // 常见原因：缺少 core:window:allow-set-title 权限
      console.warn('[i18n] setTitle failed, falling back to document.title:', e);
    }
  }
  document.title = title;
}

function notify() {
  listeners.forEach(fn => { try { fn(currentLang); } catch (e) { console.error(e); } });
}

/** 订阅语言变更，返回取消订阅函数 */
export function onLanguageChange(cb) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * 翻译查找：支持 {name} 插值。
 * 找不到时回退 en，再回退 key 本身。
 */
export function t(key, params) {
  const str = lookup(currentLang, key) ?? lookup('en', key) ?? key;
  if (str === key && currentLang !== 'en') {
    // 仅在非基准语言下告警，避免开发态噪音
    console.warn(`[i18n] missing key "${key}" in "${currentLang}"`);
  }
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : `{${k}}`));
}

function lookup(lang, key) {
  const dict = messages[lang];
  if (!dict) return undefined;
  return dict[key];
}

// 模块加载时立即应用持久化的语言设置
applyLanguage(getLanguageSetting());
