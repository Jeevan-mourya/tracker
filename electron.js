import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure hardware acceleration for smooth video & 3D canvas rendering
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

let mainWindow = null;

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
    backgroundColor: '#D4D0C8',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
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
            const { dialog } = require('electron');
            dialog.showMessageBox(mainWindow, {
              title: 'Tracker Video Analysis',
              message: 'Tracker Video Analysis & TrackEye 3D Workstation\nVersion 1.0.0\nHigh Precision 2D & Stereo 3D Video Kinematics Modeling',
              buttons: ['OK'],
            });
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
