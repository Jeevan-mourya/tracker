import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();

describe('Windows .EXE & Offline FFmpeg Pre-Flight Packaging Audit', () => {
  it('1. prevents Electron white-screen on launch (base: "./", relative asset paths, and valid main entry point)', () => {
    const viteConfig = fs.readFileSync(path.join(rootDir, 'vite.config.ts'), 'utf-8');
    expect(viteConfig).toContain("base: './'");

    const pkgJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf-8'));
    expect(pkgJson.main).toBe('electron.js');
    expect(fs.existsSync(path.join(rootDir, pkgJson.main))).toBe(true);

    const electronJs = fs.readFileSync(path.join(rootDir, 'electron.js'), 'utf-8');
    expect(electronJs).toContain("path.join(__dirname, 'dist', 'index.html')");

    const electronMainCjs = fs.readFileSync(path.join(rootDir, 'electron', 'main.cjs'), 'utf-8');
    expect(electronMainCjs).toContain("path.join(__dirname, '..', 'dist', 'index.html')");

    const distIndexPath = path.join(rootDir, 'dist', 'index.html');
    if (fs.existsSync(distIndexPath)) {
      const distHtml = fs.readFileSync(distIndexPath, 'utf-8');
      expect(distHtml).toContain('./assets/');
      expect(distHtml).not.toMatch(/(?:src|href)="\/assets\//);
    }
  });

  it('2. prevents app.asar spawn ENOENT crash for bundled ffmpeg.exe (asarUnpack + extraResources + fs.existsSync)', () => {
    const builderConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'electron-builder.json'), 'utf-8'));
    expect(builderConfig.asarUnpack).toContain('**/node_modules/ffmpeg-static/**');
    expect(builderConfig.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'node_modules/ffmpeg-static/ffmpeg.exe',
          to: 'ffmpeg.exe',
        }),
      ])
    );

    const mainCjs = fs.readFileSync(path.join(rootDir, 'electron', 'main.cjs'), 'utf-8');
    expect(mainCjs).toContain("path.join(process.resourcesPath, 'ffmpeg.exe')");
    expect(mainCjs).toContain("replace('app.asar', 'app.asar.unpacked')");
    expect(mainCjs).toContain('fs.existsSync(candidate)');
  });

  it('3. verifies 1:1 preload.cjs and IPC channel wiring across main, preload, and universalVideoDecoder.ts', () => {
    const mainCjs = fs.readFileSync(path.join(rootDir, 'electron', 'main.cjs'), 'utf-8');
    const preloadCjs = fs.readFileSync(path.join(rootDir, 'electron', 'preload.cjs'), 'utf-8');
    const decoderTs = fs.readFileSync(path.join(rootDir, 'src', 'video', 'universalVideoDecoder.ts'), 'utf-8');
    const workflowYml = fs.readFileSync(
      path.join(rootDir, '.github', 'workflows', 'build-windows-exe.yml'),
      'utf-8'
    );

    expect(mainCjs).toContain("preload: path.join(__dirname, 'preload.cjs')");
    expect(mainCjs).toContain("ipcMain.handle('transcode-legacy-video'");
    expect(preloadCjs).toContain("ipcRenderer.invoke('transcode-legacy-video'");
    expect(preloadCjs).toContain('transcodeOrDecodeFile');
    expect(decoderTs).toContain('window.electronVideoBridge.transcodeOrDecodeFile');
    expect(workflowYml).toContain('ffmpeg-static');
  });
});
