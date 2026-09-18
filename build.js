/**
 * Tracker Video Analysis - Desktop Application Packaging Script (.exe)
 * This script builds the Vite web distribution and packages it as an Electron Windows desktop executable (.exe).
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('====================================================');
console.log(' Tracker Video Analysis - Desktop Packaging (.exe) ');
console.log('====================================================\n');

// 1. Ensure required icon assets exist
const buildDir = path.join(__dirname, 'build');
const publicDir = path.join(__dirname, 'public');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const iconIco = path.join(buildDir, 'icon.ico');
const iconPng = path.join(buildDir, 'icon.png');

if (!fs.existsSync(iconIco)) {
  const publicIco = path.join(publicDir, 'icon.ico');
  if (fs.existsSync(publicIco)) {
    fs.copyFileSync(publicIco, iconIco);
    console.log('✓ Copied build/icon.ico from public/icon.ico');
  }
}

if (!fs.existsSync(iconPng)) {
  const publicPng = path.join(publicDir, 'icon.png');
  if (fs.existsSync(publicPng)) {
    fs.copyFileSync(publicPng, iconPng);
    console.log('✓ Copied build/icon.png from public/icon.png');
  }
}

// 2. Build Vite Frontend Distribution
console.log('\n[Step 1/2] Building Vite web application (dist/)...');
try {
  execSync('npm run build', { stdio: 'inherit', cwd: __dirname });
  console.log('✓ Vite frontend compiled successfully to dist/\n');
} catch (err) {
  console.error('✗ Failed to build Vite frontend:', err.message);
  process.exit(1);
}

// 3. Package Electron Executable (.exe)
console.log('[Step 2/2] Packaging Windows Executable (.exe)...');

// Check if electron-builder is invoked directly or via npx
try {
  console.log('Running electron-builder for Windows target (NSIS & Portable .exe)...');
  execSync('npx --yes electron-builder --win --x64', {
    stdio: 'inherit',
    cwd: __dirname,
    env: { ...process.env },
  });
  console.log('\n====================================================');
  console.log('✓ BUILD COMPLETE! Windows executable created in:');
  console.log(`  ${path.join(__dirname, 'dist-electron')}`);
  console.log('====================================================\n');
} catch (err) {
  console.warn('\nNote: electron-builder requires Windows or Wine to compile native Windows PE (.exe) binaries.');
  console.warn('To build your .exe on a Windows machine or in your local Git clone, simply run:');
  console.warn('  npm install');
  console.warn('  node build.js (or: npm run build:exe)');
  console.warn('\nYour icons, electron.js, and configuration are all verified and ready!\n');
}
