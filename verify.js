#!/usr/bin/env node

// Verification script for MarkdownRS
// Run with: node verify.js

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const checks = {
    passed: [],
    failed: [],
    warnings: []
};

function check(name, condition, errorMsg = '', warningMsg = '') {
    if (condition === true) {
        checks.passed.push(`✅ ${name}`);
    } else if (condition === 'warning') {
        checks.warnings.push(`⚠️  ${name}${warningMsg ? ': ' + warningMsg : ''}`);
    } else {
        checks.failed.push(`❌ ${name}${errorMsg ? ': ' + errorMsg : ''}`);
    }
}

console.log('🔍 Verifying MarkdownRS setup...\n');

// Check Node.js version
const nodeVersion = process.version;
const nodeMajor = parseInt(nodeVersion.slice(1).split('.')[0]);
check('Node.js version', nodeMajor >= 18, `Node ${nodeVersion} found, needs v18+`);

// Check package.json
const pkgExists = existsSync('package.json');
check('package.json exists', pkgExists);

if (pkgExists) {
    try {
        const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
        check('package.json is valid JSON', true);
        
        // Check for key dependencies
        const hasDompurify = pkg.dependencies?.['dompurify'];
        check('dompurify in dependencies', !!hasDompurify, 'Missing dompurify');
        
        const hasTauri = pkg.dependencies?.['@tauri-apps/api'];
        check('@tauri-apps/api in dependencies', !!hasTauri, 'Missing @tauri-apps/api');
        
        const hasTailwind = pkg.dependencies?.['@tailwindcss/postcss'];
        check('Tailwind PostCSS plugin', !!hasTailwind, 'Missing @tailwindcss/postcss');
        
        // DOMPurify 3.3+ includes TypeScript types, no @types package needed
        const noDompurifyTypes = !pkg.devDependencies?.['@types/dompurify'];
        check('No @types/dompurify (correct)', noDompurifyTypes ? true : 'warning', '', 
              'DOMPurify 3.3+ includes built-in types');
    } catch (e) {
        check('package.json is valid JSON', false, e.message);
    }
}

// Check Cargo.toml
const cargoExists = existsSync('src-tauri/Cargo.toml');
check('src-tauri/Cargo.toml exists', cargoExists);

if (cargoExists) {
    try {
        const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
        const hasCorrectEdition = cargo.includes('edition = "2024"');
        check('Cargo.toml has correct edition (2024)', hasCorrectEdition, 'Should be edition = "2024"');
        
        const hasRusqlite = cargo.includes('rusqlite');
        check('rusqlite dependency present', hasRusqlite, 'Database dependency missing');
    } catch (e) {
        check('Cargo.toml is readable', false, e.message);
    }
}

// Check database module
const dbModExists = existsSync('src-tauri/src/db/mod.rs');
check('src-tauri/src/db/mod.rs exists', dbModExists);

if (dbModExists) {
    try {
        const dbMod = readFileSync('src-tauri/src/db/mod.rs', 'utf8');
        check('Database struct defined', dbMod.includes('pub struct Database'), 'Database struct not found');
        check('TabState struct defined', dbMod.includes('pub struct TabState'), 'TabState struct not found');
        check('save_session method exists', dbMod.includes('pub fn save_session'), 'save_session not implemented');
        check('load_session method exists', dbMod.includes('pub fn load_session'), 'load_session not implemented');
    } catch (e) {
        check('db/mod.rs is readable', false, e.message);
    }
}

// Check fileSystem.ts
const fsUtilExists = existsSync('src/lib/utils/fileSystem.ts');
check('src/lib/utils/fileSystem.ts exists', fsUtilExists);

if (fsUtilExists) {
    try {
        const fsUtil = readFileSync('src/lib/utils/fileSystem.ts', 'utf8');
        check('RustTabState type defined', fsUtil.includes('type RustTabState'), 'Missing type definition');
        check('Case conversion in loadSession', fsUtil.includes('is_dirty') && fsUtil.includes('isDirty'), 'May have case conversion issue');
    } catch (e) {
        check('fileSystem.ts is readable', false, e.message);
    }
}

// Check app.css
const appCssExists = existsSync('src/app.css');
check('src/app.css exists', appCssExists);

if (appCssExists) {
    try {
        const appCss = readFileSync('src/app.css', 'utf8');
        check('Tailwind import present', appCss.includes('@import "tailwindcss"'), 'Missing Tailwind import');
        check('@theme directive present', appCss.includes('@theme'), 'Missing @theme directive for Tailwind 4.x');
    } catch (e) {
        check('app.css is readable', false, e.message);
    }
}

// Check for node_modules
const hasNodeModules = existsSync('node_modules');
check('node_modules exists', hasNodeModules ? true : 'warning', '', 'Run npm install');

// Check for .svelte-kit
const hasSvelteKit = existsSync('.svelte-kit');
if (!hasSvelteKit) {
    check('SvelteKit build cache', 'warning', '', 'Will be created on first build');
}

// Check static assets
check('static/logo.svg exists', existsSync('static/logo.svg'), 'Logo file missing');

// Print results
console.log('\n📊 Verification Results:\n');

if (checks.passed.length > 0) {
    console.log('✅ PASSED:');
    checks.passed.forEach(msg => console.log(`   ${msg}`));
    console.log('');
}

if (checks.warnings.length > 0) {
    console.log('⚠️  WARNINGS:');
    checks.warnings.forEach(msg => console.log(`   ${msg}`));
    console.log('');
}

if (checks.failed.length > 0) {
    console.log('❌ FAILED:');
    checks.failed.forEach(msg => console.log(`   ${msg}`));
    console.log('');
}

// Summary
const total = checks.passed.length + checks.failed.length + checks.warnings.length;
const score = checks.passed.length / (total - checks.warnings.length) * 100;

console.log('━'.repeat(50));
console.log(`Score: ${checks.passed.length}/${total - checks.warnings.length} passed (${score.toFixed(0)}%)`);
console.log('━'.repeat(50));

if (checks.failed.length === 0) {
    console.log('\n✨ All critical checks passed!');
    if (checks.warnings.length > 0) {
        console.log('\n📝 Next steps:');
        if (checks.warnings.some(w => w.includes('node_modules'))) {
            console.log('   1. Run: npm install');
        }
        console.log('   2. Run: npm run tauri dev');
    } else {
        console.log('   Run: npm run tauri dev');
    }
} else {
    console.log('\n⚠️  Please fix the failed checks before running the app.');
    console.log('   See BUILD.md or FIXES.md for detailed instructions.');
}

console.log('');

process.exit(checks.failed.length > 0 ? 1 : 0);
