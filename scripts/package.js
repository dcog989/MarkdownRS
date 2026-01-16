import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');
const srcTauri = path.join(rootDir, 'src-tauri');
const packageJsonPath = path.join(rootDir, 'package.json');

// Read Version
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const version = packageJson.version;

// Check prerequisites
try {
    execSync('vpk --help', { stdio: 'ignore' });
} catch {
    console.error('❌ Error: "vpk" is not installed.');
    console.error('   Please install it using: dotnet tool install -g vpk');
    process.exit(1);
}

// Resolve Icon Path
let iconPath = path.join(srcTauri, 'icons', 'icon.ico');
if (!fs.existsSync(iconPath)) {
    console.warn(`⚠️  Tauri icon not found at ${iconPath}, checking static...`);
    iconPath = path.join(rootDir, 'static', 'favicon.ico');
}

console.log(`🚀 Packaging MarkdownRS v${version} with Velopack...`);

// 1. Compile Application (Frontend + Backend)
// We uses 'tauri build' to ensure build.rs runs, sidecars/resources are bundled,
// and frontend is built via the beforeBuildCommand.
console.log('🏗️  Compiling binary...');
try {
    execSync('tauri build', { stdio: 'inherit', cwd: rootDir });
} catch {
    console.error('❌ Compilation failed.');
    process.exit(1);
}

// 2. Package with Velopack
const outDir = path.join(rootDir, 'releases');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

console.log('📦 Creating Release Artifacts...');
try {
    const cmd = [
        'vpk pack',
        '--packId MarkdownRS',
        `--packVersion ${version}`,
        `--packDir "${path.join(srcTauri, 'target', 'release')}"`,
        '--mainExe markdown-rs.exe',
        `--icon "${iconPath}"`,
        `--outputDir "${outDir}"`,
    ].join(' ');

    execSync(cmd, { stdio: 'inherit', cwd: srcTauri });

    console.log('\n✅ Build Successful!');
    console.log(`   📂 Artifacts Location: ${path.resolve(outDir)}`);
    console.log(`   - Installer: MarkdownRS-Setup.exe`);
    console.log(`   - Portable:  MarkdownRS-${version}-Portable.zip`);
} catch (error) {
    console.error('❌ Velopack packaging failed.');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
}
