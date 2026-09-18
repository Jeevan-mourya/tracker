# Tracker Video Analysis 🚀

A modern, high-precision physics video analysis and modeling workstation built with **React**, **TypeScript**, **Tailwind CSS**, and **Electron**. 

Tracker allows physics students, researchers, and engineers to analyze real-world motion from 2D video clips and stereo 3D camera setups with Direct Linear Transformation (DLT) triangulation.

---

## ✨ Features

- **2D Point Mass Tracking:** Step-by-step manual and automatic point tracking across video frames.
- **Stereo 3D Kinematics:** Dual-camera synchronized video playback and Direct Linear Transformation (DLT) 3D coordinate reconstruction.
- **Interactive 3D Trajectory View:**
  - 3D spatial orbit, pan, and zoom controls.
  - Camera presets (Orbit, Front, Top, Side, Isometric).
  - Velocity vector arrows and particle trails.
  - Floating translucent HUD or docked bottom telemetry strip for real-time coordinates $(x, y, z)$ and velocity $(v_x, v_y, v_z, v)$.
- **Calibration Tools:**
  - Dynamic calibration stick with real-world distance scaling (meters).
  - Moveable and rotatable Cartesian coordinate axes.
- **Analytical Views:**
  - **Synchronized Video Player:** Sub-frame navigation, playback rate control, clip in/out points.
  - **Data Table:** Instant tabular readout of frame timestamps, positions, velocities, and residuals.
  - **Kinematics Plotter:** Interactive plots ($x$ vs $t$, $y$ vs $t$, $z$ vs $t$, $v$ vs $t$) with linear and polynomial regression fits.
- **PDF Export:** Built-in comprehensive user manual and analytical documentation export.
- **Cross-Platform & Desktop Ready:** Runs as a responsive web app and packages into a native Windows executable (`.exe`) via Electron.

---

## 🛠️ Tech Stack

- **Frontend:** React 18, TypeScript, Vite, Tailwind CSS
- **Visualization & UI:** Recharts, Lucide React, Motion
- **Desktop Runtime:** Electron, Electron-Builder
- **PDF Generation:** pdf-lib

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18 or higher recommended)
- npm or yarn

### Installation

```bash
git clone https://github.com/<your-username>/<your-repo-name>.git
cd tracker-video-analysis
npm install
```

### Run in Web Development Mode

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Building the Application

### Web Production Build

```bash
npm run build
```

Compiled static assets are generated in the `dist/` directory.

### Build Windows Desktop Executable (`.exe`)

To compile the native Windows standalone executable and installer:

```bash
npm run electron:build
```

- **Output:** The compiled `.exe` files (NSIS installer and portable executable) will be placed in the `dist-electron/` folder.
- **Icons:** Uses `build/icon.ico` and `build/icon.png` automatically.

---

## 🤖 Automated Windows EXE Builds (GitHub Actions)

A GitHub Actions workflow is pre-configured in `.github/workflows/build.yml`.

Whenever you push to the `main` branch (or manually trigger **workflow_dispatch** in GitHub):
1. The workflow checks out the repository on a `windows-latest` virtual runner.
2. It sets up Node.js and installs dependencies.
3. It builds the Vite web application and runs `electron-builder`.
4. It attaches the generated `.exe` to the run as an artifact (`Tracker-Windows-EXE`), which you can download directly from the GitHub Actions tab.

---

## 📁 Project Structure

```
├── .github/workflows/   # Automated CI/CD (Windows EXE build workflow)
├── build/               # Application icons (icon.ico, icon.png) for packaging
├── public/              # Static public assets, sample videos, icons
├── src/
│   ├── components/      # UI components (VideoPlayer, ThreeDTrajectoryView, Toolbar, etc.)
│   ├── data/            # Preset 2D/3D sample trajectories
│   ├── utils/           # DLT triangulation, physics calculations, PDF generation
│   ├── App.tsx          # Main application layout and state manager
│   ├── main.tsx         # React entry point
│   └── types.ts         # TypeScript interfaces and data models
├── electron.js          # Electron desktop application main process
├── build.js             # Local standalone packaging script
├── package.json         # Scripts, dependencies, and electron-builder configuration
├── vite.config.ts       # Vite bundler configuration
└── README.md            # Project documentation
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE) or the original Open Source Physics (OSP) terms.
