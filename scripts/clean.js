import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

const pathsToRemove = [
    // Node / Frontend
    'build',
    '.svelte-kit',
    'node_modules',
    'package-lock.json',
    'bun.lockb',
    'bun.lock',
    'dist',
    'releases',
    // Rust / Backend
    'src-tauri/target',
    'src-tauri/Cargo.lock',
    'src-tauri/gen',
];

console.log('🗑️  Cleaning directories...');

pathsToRemove.forEach((p) => {
    const fullPath = path.join(rootDir, p);
    try {
        if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
            console.log(`✅ Removed: ${p}`);
        }
    } catch (e) {
        console.error(`❌ Failed to remove ${p}: ${e instanceof Error ? e.message : String(e)}`);
    }
});

console.log('✨ Clean complete.');
