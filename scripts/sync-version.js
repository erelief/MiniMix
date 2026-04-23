/**
 * Sync version from package.json → Cargo.toml
 * Usage: node scripts/sync-version.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const cargoPath = path.join(__dirname, '..', 'src-tauri', 'Cargo.toml');
let cargo = fs.readFileSync(cargoPath, 'utf8');

// Update Cargo.toml [package] version (not dependency versions)
cargo = cargo.replace(
  /^(version\s*=\s*")[^"]*(")/m,
  `$1${pkg.version}$2`
);

fs.writeFileSync(cargoPath, cargo);
console.log(`Synced version to ${pkg.version} in Cargo.toml`);
