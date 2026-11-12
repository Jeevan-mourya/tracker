const { app, BrowserWindow, Menu, shell, dialog, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawn } = require('node:child_process');

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

/**
 * Resolves the bundled offline ffmpeg.exe binary from extraResources or ffmpeg-static.
 */
function resolveBundledFfmpegPath() {
  const candidates = [];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'ffmpeg.exe'));
    candidates.push(path.join(process.resourcesPath, 'ffmpeg'));
    candidates.push(path.join(process.resourcesPath, 'bin', 'ffmpeg.exe'));
    candidates.push(path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', 'ffmpeg.exe'));
  }

  candidates.push(path.join(__dirname, '..', 'resources', 'ffmpeg.exe'));
  candidates.push(path.join(__dirname, '..', 'resources', 'ffmpeg'));

  try {
    const ffmpegStaticPath = require('ffmpeg-static');
    if (ffmpegStaticPath) {
      candidates.push(ffmpegStaticPath.replace('app.asar', 'app.asar.unpacked'));
      candidates.push(ffmpegStaticPath);
    }
  } catch {
    // ignore if ffmpeg-static is not in node_modules
  }

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'ffmpeg';
}

/**
 * IPC Handler: Transcodes .wmv, .flv, .mov, and compressed .avi files 100% offline
 * into an all-intra (-g 1) CFR H.264 MP4 stream for sub-frame accurate kinematic scrubbing.
 */
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
      const nodeBuf = Buffer.from(filePathOrBuffer);
      fs.writeFileSync(inputPath, nodeBuf);
    }

    const ffmpegBin = resolveBundledFfmpegPath();

    event.sender.send('transcode-legacy-video-progress', {
      fileName,
      percent: 15,
      statusText: `Decoding WMV/FLV Codec for Frame-Accurate Analysis (15%)...`,
    });

    await new Promise((resolve, reject) => {
      const args = [
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
      ];

      const proc = spawn(ffmpegBin, args, { windowsHide: true });
      let durationSec = 0;

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        const durMatch = text.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (durMatch) {
          durationSec =
            parseInt(durMatch[1], 10) * 3600 +
            parseInt(durMatch[2], 10) * 60 +
            parseFloat(durMatch[3]);
        }
        const timeMatch = text.match(/time=\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
        if (timeMatch && durationSec > 0) {
          const curSec =
            parseInt(timeMatch[1], 10) * 3600 +
            parseInt(timeMatch[2], 10) * 60 +
            parseFloat(timeMatch[3]);
          const pct = Math.max(15, Math.min(95, Math.round((curSec / durationSec) * 100)));
          event.sender.send('transcode-legacy-video-progress', {
            fileName,
            percent: pct,
            statusText: `Decoding WMV/FLV Codec for Frame-Accurate Analysis (${pct}%)...`,
          });
        }
      });

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(outputPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
    });

    const outBuf = fs.readFileSync(outputPath);
    const arrayBuffer = outBuf.buffer.slice(outBuf.byteOffset, outBuf.byteOffset + outBuf.byteLength);

    return {
      success: true,
      mp4Buffer: arrayBuffer,
      mp4FilePath: outputPath,
    };
  } catch (err) {
    return {
      success: false,
      error: err && err.message ? err.message : 'Offline FFmpeg transcode failed',
    };
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  }
});

function getAppIcon() {
  const rootDir = path.join(__dirname, '..');
  const icoPath = path.join(rootDir, 'build', 'icon.ico');
  const pngPath = path.join(rootDir, 'build', 'icon.png');
  const publicPng = path.join(rootDir, 'public', 'icon.png');
  const publicIco = path.join(rootDir, 'public', 'icon.ico');

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
    icon,
    title: 'Tracker Video Analysis - 2D, 3D Stereo & 6-DOF Kinematics Workstation',
    backgroundColor: '#181B20',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      backgroundThrottling: false,
    },
  });

  const devUrl = process.env.ELECTRON_START_URL;
  const distIndex = path.join(__dirname, '..', 'dist', 'index.html');

  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else if (fs.existsSync(distIndex)) {
    mainWindow.loadFile(distIndex);
  } else {
    mainWindow.loadURL('http://localhost:3000').catch(() => {
      mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
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
