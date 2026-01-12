import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Get the directory of the current script
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');

// 1. Read current version from package.json
let currentVersion;
let packageJson;

try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    currentVersion = packageJson.version;
} catch (error) {
    console.error('Failed to read package.json:', error);
    process.exit(1);
}

// 2. Determine new version
let newVersion = process.argv[2];

if (!newVersion) {
    // No argument provided: Auto-increment patch
    const parts = currentVersion.split('.').map((n) => parseInt(n, 10));

    if (parts.length !== 3 || parts.some(isNaN)) {
        console.error(
            `Error: Current version '${currentVersion}' is not in semver format (x.y.z). Cannot auto-increment.`,
        );
        process.exit(1);
    }

    parts[2] += 1; // Increment patch
    newVersion = parts.join('.');
    console.log(`Auto-incrementing patch: ${currentVersion} -> ${newVersion}`);
} else {
    // Argument provided
    console.log(`Manual override: ${currentVersion} -> ${newVersion}`);
}

// Validate semver format
if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error(`Error: New version '${newVersion}' must be in format x.y.z`);
    process.exit(1);
}

// 3. Update package.json
try {
    packageJson.version = newVersion;
    fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 4) + '\n');
    console.log('✅ Updated package.json');
} catch (error) {
    console.error('Failed to update package.json:', error);
    process.exit(1);
}

// 4. Update tauri.conf.json
const tauriConfPath = path.join(rootDir, 'src-tauri', 'tauri.conf.json');
try {
    const content = JSON.parse(fs.readFileSync(tauriConfPath, 'utf8'));
    content.version = newVersion;
    fs.writeFileSync(tauriConfPath, JSON.stringify(content, null, 4) + '\n');
    console.log('✅ Updated src-tauri/tauri.conf.json');
} catch (error) {
    console.error('Failed to update tauri.conf.json:', error);
    process.exit(1);
}

// 5. Update Cargo.toml
const cargoTomlPath = path.join(rootDir, 'src-tauri', 'Cargo.toml');
try {
    let content = fs.readFileSync(cargoTomlPath, 'utf8');

    // Regex explanation:
    // 1. Start with [package] header
    // 2. Match any character (including newlines via [\s\S]) non-greedily (*?)
    // 3. Until we find 'version = "' at the start of a line (m flag)
    // 4. Capture the version number
    // 5. Capture the closing quote
    const regex = /(\[package\][\s\S]*?^version = ")([^"]+)(")/m;

    if (regex.test(content)) {
        content = content.replace(regex, `$1${newVersion}$3`);
        fs.writeFileSync(cargoTomlPath, content);
        console.log('✅ Updated src-tauri/Cargo.toml');
    } else {
        console.error('❌ Could not find [package] version string in Cargo.toml');
        process.exit(1);
    }
} catch (error) {
    console.error('Failed to update Cargo.toml:', error);
    process.exit(1);
}

console.log(`\n🎉 Successfully bumped all files to v${newVersion}`);
