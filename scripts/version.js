import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const pkgbuildPath = path.join(rootDir, 'PKGBUILD');
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');

const args = process.argv.slice(2);
const shouldGit = args.includes('--git');
const versionArg = args.find((arg) => !arg.startsWith('--'));

// 1. Read current version from package.json
/** @type {string} */
let currentVersion;
/** @type {{version: string}} */
let packageJson;

try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  currentVersion = packageJson.version;
} catch (_error) {
  process.exit(1);
}

// 2. Determine new version
/** @type {string} */
let newVersion = versionArg || '';

if (!newVersion) {
  const parts = currentVersion.split('.').map((n) => parseInt(n, 10));

  if (parts.length !== 3 || parts.some(Number.isNaN)) {
    process.exit(1);
  }

  parts[2] += 1;
  newVersion = parts.join('.');
} else {
}

if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
  process.exit(1);
}

// 3. Update package.json
try {
  let content = fs.readFileSync(packageJsonPath, 'utf8');
  content = content.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${newVersion}"`);
  fs.writeFileSync(packageJsonPath, content);
} catch (_error) {
  process.exit(1);
}

// 4. Update tauri.conf.json
try {
  let content = fs.readFileSync(tauriConfPath, 'utf8');
  content = content.replace(/"version": "\d+\.\d+\.\d+"/, `"version": "${newVersion}"`);
  fs.writeFileSync(tauriConfPath, content);
} catch (_error) {
  process.exit(1);
}

// 5. Update Cargo.toml
try {
  let content = fs.readFileSync(cargoTomlPath, 'utf8');
  const regex = /(\[package\][\s\S]*?^version = ")([^"]+)(")/m;

  if (regex.test(content)) {
    content = content.replace(regex, `$1${newVersion}$3`);
    fs.writeFileSync(cargoTomlPath, content);
  } else {
    process.exit(1);
  }
} catch (_error) {
  process.exit(1);
}

// 5. Update PKGBUILD
try {
  let content = fs.readFileSync(pkgbuildPath, 'utf8');
  const regex = /^(pkgver=).+$/m;

  if (regex.test(content)) {
    content = content.replace(regex, `$1${newVersion}`);
    fs.writeFileSync(pkgbuildPath, content);
  } else {
    process.exit(1);
  }
} catch (_error) {
  process.exit(1);
}

// 6. Git Integration
if (shouldGit) {
  try {
    const files = [packageJsonPath, pkgbuildPath, tauriConfPath, cargoTomlPath].map((p) => `"${p}"`).join(' ');
    execSync(`git add ${files}`, { stdio: 'inherit' });

    const commitMsg = `chore: release v${newVersion}`;
    execSync(`git commit -m "${commitMsg}"`, { stdio: 'inherit' });

    const tagName = `v${newVersion}`;
    execSync(`git tag -a ${tagName} -m "${tagName}"`, { stdio: 'inherit' });

    execSync('git push --follow-tags', { stdio: 'inherit' });
  } catch (_error) {}
} else {
}
