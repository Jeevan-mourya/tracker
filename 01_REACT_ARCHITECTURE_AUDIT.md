# 01. React Architecture & Platform Audit
**Project Identity:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Senior Software Architect, Computer Vision Engineer, Numerical Methods Engineer, Software Archaeologist  
**Status:** Forensic Verification Complete (No Code Modifications)

---

## 1. Executive Summary: Architecture & Stack Overview

The analyzed application is a browser-based Single Page Application (SPA) written in **TypeScript 5.7.3** and **React 18.3.1**, built via **Vite 6.2.0** with **Tailwind CSS 4.0.9**, packaged optionally as a desktop client via **Electron 44.4.1** and **electron-builder 26.15.3**.

The codebase is an in-browser re-imagination of Douglas Brown's classic Java **Tracker / Open Source Physics (OSP)** tool, augmented with a custom **Stereo 3D / Direct Linear Transformation (DLT)** triangulation subsystem and aerospace/defense high-speed telemetry metrics (Photron FASTCAM / Vision Research Phantom presets).

### Technology Component Inventory

| Component / Layer | Technology | File / Directory Location | Concrete Purpose | Forensic Confidence |
| :--- | :--- | :--- | :--- | :--- |
| **Application Identity** | Tracker Video Analysis | `/package.json`, `/metadata.json`, `index.html` | Application name, metadata, window title | HIGH |
| **Framework & Core** | React 18.3.1 | `/src/main.tsx`, `/src/App.tsx` | Declarative UI rendering, hook-based lifecycle | HIGH |
| **Language & Typing** | TypeScript 5.7.3 | `/tsconfig.json`, `/src/types.ts` | Static typing, interface contracts | HIGH |
| **Bundler & Dev Server** | Vite 6.2.0 | `/vite.config.ts` | ESM dev server on port 3000, build pipeline | HIGH |
| **Desktop Wrapper** | Electron 44.4.1 | `/electron.js`, `/package.json` | Cross-platform Chromium shell for Windows `.exe` | HIGH |
| **CSS Styling Engine** | Tailwind CSS 4.0.9 | `/src/index.css`, `@tailwindcss/vite` | Utility CSS classes, modern CSS import | HIGH |
| **Iconography** | `lucide-react` 1.16.0 | Throughout `/src/components/*` | UI vector icons (play, camera, sliders, crosshairs) | HIGH |
| **2D Graph Rendering** | `recharts` 2.15.1 | `/src/components/PlotView.tsx` | SVG-based kinematic plots (x vs t, v vs t, etc.) | HIGH |
| **3D Rendering** | HTML5 Canvas 2D API | `/src/components/ThreeDTrajectoryView.tsx` | Hand-coded wireframe 3D projection on `<canvas>` | HIGH |
| **Video Playback** | HTML5 `<video>` & `<canvas>` | `/src/components/VideoPlayerView.tsx`, `DualVideoPlayerView.tsx` | Native browser HTMLMediaElement playback | HIGH |
| **Computer Vision Engine** | None (Custom Canvas 2D) | `/src/components/VideoPlayerView.tsx` | Manual user clicking with magnifier loupe; OpenCV/Wasm absent | HIGH |
| **Numerical Methods** | Custom Pure TypeScript | `/src/utils/physics.ts`, `/src/utils/triangulation.ts` | DLT 11-parameter linear solver, Cramer 3x3, Catmull-Rom | HIGH |
| **State Management** | Pure React State (`useState`) | `/src/App.tsx` | Lifted state tree in root component; no Redux/Zustand | HIGH |
| **Persistence / Storage** | In-Memory Only | `/src/App.tsx` | No IndexedDB, no localStorage, no database | HIGH |
| **PDF Report Engine** | `pdf-lib` 1.17.1 | `/src/utils/generatePdfReport.ts`, `/src/utils/downloadPdf.ts` | Client-side vector and snapshot PDF document synthesis | HIGH |
| **Archive Decompression**| `jszip` 3.10.2 | `/src/utils/videoFormats.ts` | In-memory ZIP archive unpacking for legacy Tracker archives | HIGH |
| **Backend Integration** | None (100% Client-Side) | N/A | Zero server-side API endpoints or microservices | HIGH |

---

## 2. Package & Source Tree Architecture

### Directory Structure & Responsibilities

```text
/
├── electron.js                 # Electron main process entry point (window creation, menu)
├── index.html                  # HTML5 SPA entry point mounting /src/main.tsx
├── package.json                # Dependencies, build scripts, electron-builder config
├── tsconfig.json               # TypeScript strict configuration
├── vite.config.ts              # Vite plugins (@tailwindcss/vite, @vitejs/plugin-react)
├── public/                     # Static media assets & user manuals
│   ├── Tracker_Video_Analysis_User_Manual.pdf
│   ├── favicon.ico / icon.ico / icon.png
│   └── videos/
│       ├── ball_toss.mp4       # Real 30 fps sample video
│       └── ball_toss_slow.mp4  # Synchronized second-camera sample video
├── src/
│   ├── main.tsx                # React DOM root render
│   ├── App.tsx                 # Central application state orchestrator & layout manager
│   ├── index.css               # Global Tailwind stylesheet
│   ├── types.ts                # Master TypeScript interface contracts
│   ├── manualPdfData.ts        # Embedded documentation text for PDF user manual
│   ├── components/             # React UI Components
│   │   ├── Navbar.tsx          # App header, sample loader, modal toggles, layout selector
│   │   ├── Toolbar.tsx         # Analytical control bar (coordinate toggle, cal stick, loupe)
│   │   ├── VideoPlayerView.tsx # 2D video player, overlay canvas, synthetic frames, loupe
│   │   ├── DualVideoPlayerView.tsx # Dual synchronized camera player for 3D tracking
│   │   ├── ThreeDTrajectoryView.tsx# Hand-rolled HTML5 Canvas 2D orbit 3D visualizer
│   │   ├── PlotView.tsx        # Recharts kinematic graphing with OLS regression fitting
│   │   ├── TableView.tsx       # Tabular readout with TSV export & defense unit conversions
│   │   ├── CalibrationModal.tsx# Scale calibration stick length & units modal
│   │   ├── ClipSettingsModal.tsx# Frame bounds, sensor FPS, container FPS, shutter timing
│   │   ├── TriangulationModal.tsx# DLT camera geometry, stereo baseline, multi-rate presets
│   │   ├── TrackManagerModal.tsx# Mass properties, marker footprints, track management
│   │   ├── ExperimentReportModal.tsx# Senior officer PDF report designer with live previews
│   │   ├── KeyboardShortcutsModal.tsx# Tracker OSP keyboard accelerator reference
│   │   ├── SupportedFormatsModal.tsx# Technical reference for container/codec support
│   │   ├── DownloadExeModal.tsx# Instructions & build workflow for Windows .exe packaging
│   │   ├── FormatWarningToast.tsx# User alerts for unsupported video formats
│   │   └── HelpModal.tsx       # Physics principles, equations, and software guides
│   ├── data/
│   │   ├── samples.ts          # Sample experiment repository (2D & high-speed)
│   │   └── samples3d.ts        # 3D stereo experiment configurations & sample tracks
│   └── utils/
│       ├── physics.ts          # Coordinate transformations, 2D kinematics, OLS curve fits
│       ├── triangulation.ts    # DLT 3D solver, least squares 4x3, Hermite spline interpolation
│       ├── generatePdfReport.ts# Comprehensive PDF report synthesis via pdf-lib
│       ├── downloadPdf.ts      # User manual PDF compilation and blob download
│       ├── highSpeedCameras.ts # Database of Photron, Phantom, and NAC camera specs
│       └── videoFormats.ts     # Video MIME inspection, ZIP unpacking, path normalization
├── examples/                   # Legacy Tracker Java sample files (.trz, .trk, .mov, .avi)
├── libjs/ & README_SWINGJS.txt # Residual SwingJS/J2S distribution notes from Java migration
└── resources/                  # Legacy zip archives and assets
```

---

## 3. Runtime Environment & Execution Model

1. **Browser Runtime (Primary):**
   - Runs in standard Chromium, Gecko, or WebKit browsers.
   - Zero WebAssembly (Wasm) modules are loaded.
   - Zero WebGL or WebGPU contexts are created.
   - All frame decoding relies on the browser's hardware video decoder (`<video src="...">`).

2. **Desktop Runtime (Secondary):**
   - Electron wrapper executing Node.js 20+ and Chromium.
   - Video paths are normalized using `./videos/...` relative URIs to circumvent `file://` protocol origin restrictions.
   - Built to Windows executable via `electron-builder` (`npm run build:exe`).

3. **Concurrency & Threading:**
   - 100% single-threaded execution on the main JavaScript event loop.
   - No Web Workers are employed for triangulation, spline interpolation, or video decoding.

---

## 4. State Management Architecture

The application adopts a **centralized monolithic React state** pattern centered in `/src/App.tsx`:
- No external state container library (Redux, MobX, Zustand, Jotai, or Recoil) is utilized.
- All primary experiment state variables (`currentExp`, `videoUrl`, `videoUrlCam2`, `calibration`, `axes`, `triangulation`, `clip`, `currentFrame`, `tracks`, `activeTrackId`) reside at the root level of `App.tsx` and are passed downward via prop drilling.
- Sub-components trigger callbacks (`onAddPoint`, `onAddPoint3D`, `onFrameChange`, `onUpdateCalibration`) that immutably clone and update state arrays.
- State changes immediately re-evaluate kinematics pipelines via memoized pure utility functions (`computeKinematics`, `computeKinematics3D`).
