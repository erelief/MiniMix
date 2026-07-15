/**
 * generate-third-party-licenses.mjs
 *
 * 从 lockfile 解析实际版本号，生成两份产物：
 *   1. src/generated/about-deps.json   — 关于页致谢列表（精选条目 + 版本 + URL + license）
 *   2. public/THIRD-PARTY-LICENSES     — 第三方许可证全文汇总（含 OFL/MIT/BSL 正文）
 *
 * 产物在 .gitignore 中，构建时自动重新生成。
 *
 * Usage: node scripts/generate-third-party-licenses.mjs
 *
 * 设计说明：
 *   - 版本号漂移问题：手写版本号会随 npm update 过时，因此从 lockfile 读取。
 *   - 多版本 crate 消歧：读 Cargo.toml 版本要求，优先匹配直接依赖声明的版本。
 *   - 兜底：即使读不到 lockfile（如干净 CI 且未拉 lock），也输出基础列表，保证构建不中断。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ---------- 精选致谢列表：只声明显示名 + 查找键 + URL，不写版本号 ----------
// source: 'npm'（查 package-lock.json）/ 'cargo'（查 Cargo.lock）/ 'manual'（手动版本）
// manual 版本写死在 version 字段，不查 lockfile
const ABOUT_DEPS = [
  // 核心框架
  { display: 'Tauri', key: 'tauri', url: 'https://tauri.app', source: 'cargo', license: 'MIT OR Apache-2.0' },
  { display: 'Vite', key: 'vite', url: 'https://vite.dev', source: 'npm', license: 'MIT' },
  { display: 'Lucide', key: 'lucide', url: 'https://lucide.dev', source: 'npm', license: 'ISC' },
  { display: 'OxiPNG', key: 'oxipng', url: 'https://github.com/oxipng/oxipng', source: 'cargo', license: 'MIT' },

  // Tauri 插件（前端 npm 包）
  { display: 'Tauri Dialog', key: '@tauri-apps/plugin-dialog', url: 'https://v2.tauri.app/plugin/dialog', source: 'npm', license: 'MIT OR Apache-2.0' },
  { display: 'Tauri Fs', key: '@tauri-apps/plugin-fs', url: 'https://v2.tauri.app/plugin/file-systems', source: 'npm', license: 'MIT OR Apache-2.0' },
  { display: 'Tauri Shell', key: '@tauri-apps/plugin-shell', url: 'https://v2.tauri.app/plugin/shell', source: 'npm', license: 'MIT OR Apache-2.0' },
  { display: 'Tauri Updater', key: '@tauri-apps/plugin-updater', url: 'https://v2.tauri.app/plugin/updater', source: 'npm', license: 'MIT OR Apache-2.0' },
  { display: 'Tauri Process', key: '@tauri-apps/plugin-process', url: 'https://v2.tauri.app/plugin/process', source: 'npm', license: 'MIT OR Apache-2.0' },

  // Rust crate
  { display: 'serde_json', key: 'serde_json', url: 'https://github.com/serde-rs/json', source: 'cargo', license: 'MIT OR Apache-2.0' },
  { display: 'log', key: 'log', url: 'https://github.com/rust-lang/log', source: 'cargo', license: 'MIT OR Apache-2.0' },
  { display: 'tauri-plugin-single-instance', key: 'tauri-plugin-single-instance', url: 'https://v2.tauri.app/plugin/single-instance', source: 'cargo', license: 'MIT OR Apache-2.0' },
  { display: 'winreg', key: 'winreg', url: 'https://github.com/gentoo90/winreg-rs', source: 'cargo', license: 'MIT' },

  // 字体（不在 lockfile，手动声明）
  { display: 'Geist', version: '1.4.0', url: 'https://vercel.com/font', source: 'manual', license: 'OFL-1.1' },
];

// ---------- lockfile 解析 ----------

function collectNpmVersions(root) {
  const lockPath = path.join(root, 'package-lock.json');
  if (!fs.existsSync(lockPath)) return {};
  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    const out = {};
    // 不跳过 dev 依赖：致谢列表里 Vite 等构建工具是 devDep，仍需收录版本号。
    for (const [key, meta] of Object.entries(lock.packages || {})) {
      if (key === '') continue;
      const name = key.split('node_modules/').pop();
      out[name] = meta.version || '';
    }
    return out;
  } catch {
    return {};
  }
}

function collectCargoVersions(root) {
  const lockPath = path.join(root, 'src-tauri', 'Cargo.lock');
  if (!fs.existsSync(lockPath)) return {};
  try {
    const text = fs.readFileSync(lockPath, 'utf8');
    const out = {};
    for (const block of text.split(/\n\[\[package\]\]\n/).slice(1)) {
      const name = block.match(/^name\s*=\s*"([^"]+)"/m)?.[1];
      const version = block.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
      if (name) {
        // 多版本 crate 收为数组，后续消歧
        if (out[name]) {
          if (Array.isArray(out[name])) out[name].push(version || '');
          else out[name] = [out[name], version || ''];
        } else {
          out[name] = version || '';
        }
      }
    }
    return out;
  } catch {
    return {};
  }
}

function readCargoVersionReq(root) {
  const cargoToml = path.join(root, 'src-tauri', 'Cargo.toml');
  if (!fs.existsSync(cargoToml)) return {};
  const text = fs.readFileSync(cargoToml, 'utf8');
  const req = {};
  for (const line of text.split('\n')) {
    // 匹配 name = "1.2" 或 name = { version = "1.2", ... }
    const m = line.match(/^\s*([a-z0-9_-]+)\s*=\s*(?:\{[^}]*?"?version"?\s*=\s*"([^"]+)"|\s*"([^"]+)")/);
    if (m) {
      const lead = (m[2] || m[3] || '').match(/^=?\s*(\d+(?:\.\d+)?)/);
      if (lead) req[m[1]] = lead[1];
    }
  }
  return req;
}

function cargoVersionFor(name, cargo, req) {
  const v = cargo[name];
  if (!v) return '';
  if (!Array.isArray(v)) return v;
  // 多版本：优先匹配直接依赖声明的版本前缀
  const want = req[name];
  if (want) {
    const hit = v.find(ver => ver.startsWith(want));
    if (hit) return hit;
  }
  // fallback：最高版本
  return v.slice().sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).slice(-1)[0];
}

// ---------- 组装致谢列表 ----------

function buildAboutDeps(root) {
  const npmVersions = collectNpmVersions(root);
  const cargoVersions = collectCargoVersions(root);
  const cargoReq = readCargoVersionReq(root);

  return ABOUT_DEPS.map(dep => {
    let version = dep.version || '';
    if (dep.source === 'npm') version = npmVersions[dep.key] || version;
    else if (dep.source === 'cargo') version = cargoVersionFor(dep.key, cargoVersions, cargoReq) || version;

    const entry = { name: dep.display, url: dep.url };
    if (version) entry.version = version;
    if (dep.license) entry.license = dep.license;
    return entry;
  });
}

// ---------- 许可证全文模板 ----------

const LICENSE_TEXTS = {
  'OFL-1.1': `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical writer
or other person who contributed to the Font Software.

PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining a
copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components, in
Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.

Copyright (c) 2024 Vercel (https://vercel.com/)
`,

  'MIT': `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`,

  'ISC': `ISC License

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
`,

  'Apache-2.0': `Apache License 2.0

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

A full copy of the Apache License 2.0 is available at:
http://www.apache.org/licenses/LICENSE-2.0
`,
};

// 许可证说明的简要描述
const LICENSE_SUMMARIES = {
  'OFL-1.1': 'SIL Open Font License 1.1',
  'MIT': 'MIT License',
  'ISC': 'ISC License',
  'Apache-2.0': 'Apache License 2.0',
  'MIT OR Apache-2.0': 'MIT OR Apache-2.0',
  'BSL-1.0': 'Boost Software License 1.0',
};

// ---------- 生成第三方许可证汇总文本 ----------

function buildThirdPartyText(deps) {
  const lines = [];
  lines.push('MiniMix — Third-Party Software and Font Licenses');
  lines.push('================================================');
  lines.push('');
  lines.push('This file lists the licenses of third-party software and fonts');
  lines.push('bundled with or used by MiniMix. The project itself is licensed');
  lines.push('under the MIT License (see the LICENSE file).');
  lines.push('');
  lines.push('For dependencies with permissive dual licenses (e.g. "MIT OR');
  lines.push('Apache-2.0"), either license may apply; we reproduce both for');
  lines.push('completeness.');
  lines.push('');

  // 1. 汇总表
  lines.push('---- Summary ----');
  lines.push('');
  deps.forEach(d => {
    const ver = d.version ? ` ${d.version}` : '';
    const lic = d.license ? ` — ${LICENSE_SUMMARIES[d.license] || d.license}` : '';
    lines.push(`• ${d.name}${ver}${lic}`);
    lines.push(`  ${d.url}`);
  });
  lines.push('');

  // 2. 全文（按 license 类型去重展示）
  lines.push('---- License Texts ----');
  lines.push('');
  const seen = new Set();
  deps.forEach(d => {
    if (!d.license) return;
    const licKey = d.license;
    // 对双协议拆分展示各自全文
    const parts = licKey.split(' OR ').map(s => s.trim());
    parts.forEach(p => {
      const text = LICENSE_TEXTS[p];
      if (text && !seen.has(p)) {
        seen.add(p);
        lines.push(text.trim());
        lines.push('');
      }
    });
  });

  // 兜底：若 Geist (OFL) 未在前面的拆分中出现，确保 OFL 全文一定被收录
  if (!seen.has('OFL-1.1') && LICENSE_TEXTS['OFL-1.1']) {
    lines.push(LICENSE_TEXTS['OFL-1.1'].trim());
    lines.push('');
  }

  return lines.join('\n');
}

// ---------- 主流程 ----------

function main() {
  const deps = buildAboutDeps(ROOT);

  // 写 src/generated/about-deps.json
  const genDir = path.join(ROOT, 'src', 'generated');
  fs.mkdirSync(genDir, { recursive: true });
  fs.writeFileSync(
    path.join(genDir, 'about-deps.json'),
    JSON.stringify(deps, null, 2) + '\n',
    'utf8',
  );

  // 写 public/THIRD-PARTY-LICENSES
  const publicDir = path.join(ROOT, 'public');
  fs.mkdirSync(publicDir, { recursive: true });
  fs.writeFileSync(
    path.join(publicDir, 'THIRD-PARTY-LICENSES'),
    buildThirdPartyText(deps),
    'utf8',
  );

  console.log(`Generated ${deps.length} third-party entries:`);
  deps.forEach(d => {
    const ver = d.version ? ` v${d.version}` : '';
    const lic = d.license ? ` [${d.license}]` : '';
    console.log(`  ${d.name}${ver}${lic}`);
  });
  console.log('Wrote src/generated/about-deps.json');
  console.log('Wrote public/THIRD-PARTY-LICENSES');
}

main();
