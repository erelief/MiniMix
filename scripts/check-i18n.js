/**
 * check-i18n.js — 构建时多语言完整性检查
 *
 * 校验 src/i18n/locales/en.js 与 zh-CN.js：
 *   1. 键集合完全一致（缺失 / 多余都报错）
 *   2. 无空值（空字符串 / null / undefined）
 *   3. {占位符} 在两种语言中数量与名称一致
 *
 * 不一致时以非零退出，阻塞 vite build。
 *
 * 用法：node scripts/check-i18n.js
 */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const localesDir = path.join(__dirname, '..', 'src', 'i18n', 'locales');

const files = {
  en: pathToFileURL(path.join(localesDir, 'en.js')).href,
  'zh-CN': pathToFileURL(path.join(localesDir, 'zh-CN.js')).href,
};

const placeholdersRe = /\{(\w+)\}/g;

function extractPlaceholders(value) {
  const set = new Set();
  let m;
  while ((m = placeholdersRe.exec(value)) !== null) set.add(m[1]);
  return set;
}

async function loadLocale(name) {
  const mod = await import(files[name]);
  const dict = mod.default;
  if (!dict || typeof dict !== 'object') {
    throw new Error(`Locale "${name}" has no default object export`);
  }
  return dict;
}

function checkEmpty(name, dict) {
  const empties = Object.entries(dict).filter(([, v]) => v === null || v === undefined || v === '');
  if (empties.length) {
    console.error(`✗ [${name}] empty values for keys:`);
    empties.forEach(([k]) => console.error(`    ${k}`));
  }
  return empties.length === 0;
}

function checkPlaceholders(en, zh) {
  let ok = true;
  const keys = new Set([...Object.keys(en), ...Object.keys(zh)]);
  keys.forEach((key) => {
    const ep = extractPlaceholders(en[key] || '');
    const zp = extractPlaceholders(zh[key] || '');
    if (ep.size !== zp.size || [...ep].some((p) => !zp.has(p))) {
      ok = false;
      console.error(`✗ placeholder mismatch for "${key}":`);
      console.error(`    en:    {${[...ep].join(', ')}}`);
      console.error(`    zh-CN: {${[...zp].join(', ')}}`);
    }
  });
  return ok;
}

let exitCode = 0;
try {
  const [en, zh] = await Promise.all([loadLocale('en'), loadLocale('zh-CN')]);

  const enKeys = new Set(Object.keys(en));
  const zhKeys = new Set(Object.keys(zh));

  const missingInZh = [...enKeys].filter((k) => !zhKeys.has(k));
  const extraInZh = [...zhKeys].filter((k) => !enKeys.has(k));

  if (missingInZh.length) {
    exitCode = 1;
    console.error(`✗ keys missing in zh-CN.js:`);
    missingInZh.forEach((k) => console.error(`    ${k}`));
  }
  if (extraInZh.length) {
    exitCode = 1;
    console.error(`✗ keys in zh-CN.js but not in en.js:`);
    extraInZh.forEach((k) => console.error(`    ${k}`));
  }

  if (!checkEmpty('en', en)) exitCode = 1;
  if (!checkEmpty('zh-CN', zh)) exitCode = 1;
  if (!checkPlaceholders(en, zh)) exitCode = 1;

  if (exitCode === 0) {
    console.log(`✓ i18n complete: ${enKeys.size} keys match between en and zh-CN`);
  } else {
    console.error(`\n✗ i18n check FAILED — fix the issues above before building.`);
  }
} catch (e) {
  console.error('✗ i18n check could not run:', e.message);
  exitCode = 1;
}

process.exit(exitCode);
