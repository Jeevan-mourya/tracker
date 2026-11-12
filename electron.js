import { app, BrowserWindow, Menu, shell, dialog, ipcMain } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);

// Ensure hardware acceleration for smooth video & 3D canvas rendering and local media playback
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('enable-features', 'PlatformHEVCDecoderSupport');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('disable-web-security');
app.commandLine.appendSwitch('allow-file-access-from-files');
app.commandLine.appendSwitch('disable-features', 'PreloadMediaEngagementData,BlockInsecurePrivateNetworkRequests');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

let mainWindow = null;

function resolveBundledFfmpegPath() {
  const candidates = [];
  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'ffmpeg.exe'));
    candidates.push(path.join(process.resourcesPath, 'ffmpeg'));
    candidates.push(path.join(process.resourcesPath, 'bin', 'ffmpeg.exe'));
  }
  candidates.push(path.join(__dirname, 'resources', 'ffmpeg.exe'));
  try {
    const ffmpegStaticPath = require('ffmpeg-static');
    if (ffmpegStaticPath) {
      candidates.push(ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked'));
      candidates.push(ffmpegStaticPath);
    }
  } catch {
    // ignore
  }
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return 'ffmpeg';
}

ipcMain.handle('transcode-legacy-video', async (event, payload) => {
  const { filePathOrBuffer, fileName = 'capture.wmv' } = payload || {};
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracker-codec-bridge-'));
  const safeBase = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_');
  const inputPath =
    typeof filePathOrBuffer === 'string' && fs.existsSync(filePathOrBuffer)
      ? filePathOrBuffer
      : path.join(tmpDir, safeBase);
  const outputPath = path.join(tmpDir, `${safeBase}_all_intra.mp4`);

  try {
    if (typeof filePathOrBuffer !== 'string') {
      fs.writeFileSync(inputPath, Buffer.from(filePathOrBuffer));
    }
    const ffmpegBin = resolveBundledFfmpegPath();

    await new Promise((resolve, reject) => {
      const proc = spawn(
        ffmpegBin,
        [
          '-y',
          '-i',
          inputPath,
          '-c:v',
          'libx264',
          '-preset',
          'ultrafast',
          '-crf',
          '18',
          '-g',
          '1',
          '-pix_fmt',
          'yuv420p',
          '-movflags',
          '+faststart',
          '-an',
          outputPath,
        ],
        { windowsHide: true }
      );
      proc.on('error', reject);
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });

    const outBuf = fs.readFileSync(outputPath);
    const arrayBuffer = outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength);
    return { success: true, mp4Buffer: arrayBuffer, mp4FilePath: outputPath };
  } catch (err) {
    return { success: false, error: err?.message || 'Offline FFmpeg transcode failed' };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

function getAppIcon() {
  const icoPath = path.join(__dirname, 'build', 'icon.ico');
  const pngPath = path.join(__dirname, 'build', 'icon.png');
  const publicPng = path.join(__dirname, 'public', 'icon.png');
  const publicIco = path.join(__dirname, 'public', 'icon.ico');

  if (process.platform === 'win32') {
    if (fs.existsSync(icoPath)) return icoPath;
    if (fs.existsSync(publicIco)) return publicIco;
  }
  if (fs.existsSync(pngPath)) return pngPath;
  if (fs.existsSync(publicPng)) return publicPng;
  return undefined;
}

function createWindow() {
  const icon = getAppIcon();

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 1080,
    minHeight: 650,
    icon: icon,
    title: 'Tracker Video Analysis - 2D & 3D Kinematics Workstation',
    backgroundColor: '#181B20',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'electron', 'preload.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
    },
  });

  // Native Workstation Menu
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Reload App',
          accelerator: 'CmdOrCtrl+R',
          click: () => mainWindow?.reload(),
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo Point Mass', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'togglefullscreen' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'resetZoom' },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'CmdOrCtrl+Shift+I',
          click: () => mainWindow?.webContents.toggleDevTools(),
        },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Tracker Documentation',
          click: async () => {
            await shell.openExternal('https://physlets.org/tracker/');
          },
        },
        {
          label: 'About Tracker Video Analysis',
          click: () => {
            if (mainWindow) {
              dialog.showMessageBox(mainWindow, {
                title: 'Tracker Video Analysis',
                message: 'Tracker Video Analysis & TrackEye 3D Workstation\nVersion 1.0.0\nHigh Precision 2D & Stereo 3D Video Kinematics Modeling',
                buttons: ['OK'],
              });
            }
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // In production load local build, in development load dev server if running
  const devUrl = process.env.ELECTRON_START_URL;
  const distIndex = path.join(__dirname, 'dist', 'index.html');

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    // If dist doesn't exist yet, attempt dev server or notify user
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      mainWindow.loadFile(path.join(__dirname, 'index.html'));
    });
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
