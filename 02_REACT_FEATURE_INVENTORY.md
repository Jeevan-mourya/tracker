# 02. React Feature Inventory & Provenance Analysis

**Project:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Forensic Computer Vision & Numerical Methods Specialist  
**Analysis Target:** Current Source Code Base in React 18 / TypeScript

---

## 1. Feature Classification Taxonomy

Every user-facing and computational capability in the current React application has been forensically classified into one of seven development provenance categories:

* **A. Newly Created in React:** Functionality added specifically during modern development (e.g., modern PDF generation, Electron packaging, defense telemetry).
* **B. Reimplemented in React:** Core concepts from Java Tracker rewritten from scratch in TypeScript (e.g., coordinate axis transformation, calibration stick, basic kinematics).
* **C. Simplified:** Features where the original Java Tracker had deeper capabilities, simplified here to basic forms.
* **D. Approximated:** Mathematical or vision processes represented using basic formulas rather than rigorous computer vision pipelines.
* **E. Simulated / Demonstrative:** Functionality that visually imitates real data processing (e.g., synthetic video canvas animations, hardcoded point clouds).
* **F. Lost / Omitted from Java Tracker:** Features present in Java Tracker (autotracker template matching, RGB color filtering, data functions, Fourier analysis) absent in this build.
* **G. Uncertain Provenance:** Utility code whose origin cannot be uniquely attributed.

---

## 2. Complete Feature Inventory Matrix

| Feature Name | Category | Current Implementation Location | Description & Forensic Evidence | Real, Simulated, or Placeholder? | Migration Confidence |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **2D Video Playback** | B | `/src/components/VideoPlayerView.tsx` | Native HTML5 `<video>` element with custom frame seeking based on frame time math (`currentTime = frame / fps`). | Real (Browser Native) | HIGH |
| **Dual Video Playback** | A | `/src/components/DualVideoPlayerView.tsx` | Two side-by-side `<video>` elements driven by a synchronized frame scrubber. | Real (Browser Native) | HIGH |
| **Calibration Stick** | B | `/src/components/CalibrationModal.tsx`, `/src/utils/physics.ts` | Two-point draggable segment measuring pixel distance $\Delta p = \sqrt{\Delta x^2 + \Delta y^2}$ and computing scale factor $s = L / \Delta p$. | Real (Analytical 2D) | HIGH |
| **Coordinate Axes** | B | `/src/components/VideoPlayerView.tsx`, `/src/utils/physics.ts` | Draggable origin $(x_0, y_0)$ with angular rotation $\theta$, computing rotation matrix $\mathbf{R}(\theta)$. | Real (Analytical 2D) | HIGH |
| **Manual Point Marking** | B | `/src/components/VideoPlayerView.tsx` (lines 1212–1238) | Shift+Click registers $(p_x, p_y)$ pixel coordinates, converts them to Cartesian meters, and appends to track steps. | Real (Manual UI) | HIGH |
| **Sub-Pixel Loupe** | B | `/src/components/VideoPlayerView.tsx` (lines 1032–1150) | Magnifier canvas rendering $4\times$ zoom of the image region under the cursor with crosshairs. | Real (Canvas 2D) | HIGH |
| **Automatic Computer Vision Tracking** | F | Absent | No template matching, cross-correlation, optical flow (Lucas-Kanade), or blob detection exists in the codebase. | NOT IMPLEMENTED | HIGH |
| **Synthetic Video Feeds** | E | `/src/components/VideoPlayerView.tsx` (lines 510–940) | Hand-drawn HTML5 2D canvas procedures generating 2D ballistic bullet animations, gelatin cavities, and shockwave cones frame-by-frame. | SIMULATED | HIGH |
| **DLT 3D Triangulation** | A | `/src/utils/triangulation.ts` (lines 94–138) | Mathematical solution of overdetermined $4 \times 3$ system using normal equations and Cramer's Rule for two cameras. | Real Mathematical Solver | HIGH |
| **Camera Extrinsics & Calibration** | D / E | `/src/utils/triangulation.ts` (lines 143–215), `TriangulationModal.tsx` | Coefficients are derived from idealized geometric formulas (e.g., $90^\circ$ orthogonal or symmetric rotation around baseline). No bundle adjustment or chessboard calibration. | Simplified / Approximated | HIGH |
| **Asymmetric Frame Rate Sync**| A | `/src/utils/triangulation.ts` (lines 427–565) | Catmull-Rom cubic Hermite spline interpolating 2D pixel coordinates across asynchronous temporal keyframes. | Real Mathematical Spline | HIGH |
| **3D Trajectory Orbit Canvas** | A | `/src/components/ThreeDTrajectoryView.tsx` | Hand-rolled 3D wireframe camera projection onto HTML5 2D canvas using 3D rotation matrices $(\psi, \theta)$. No Three.js/WebGL. | Real (Software 3D on 2D Canvas) | HIGH |
| **Kinematic Derivation (v, a)**| B | `/src/utils/physics.ts`, `/src/utils/triangulation.ts` | 1st and 2nd numerical derivatives using central differences (forward/backward at boundaries). | Real (Finite Differences) | HIGH |
| **Curve Fitting & Regression**| B | `/src/utils/physics.ts` (lines 220–480), `PlotView.tsx` | Ordinary Least Squares (OLS) closed-form solutions for linear ($y=mx+c$), quadratic ($y=Ax^2+Bx+C$), and cubic polynomials. | Real Analytical OLS | HIGH |
| **Defense Telemetry Metrics** | A | `/src/utils/physics.ts`, `/src/utils/triangulation.ts` | G-force ($a/9.80665$), Mach number ($v/343.0$), slant range ($\sqrt{x^2+y^2+z^2}$), azimuth, elevation. | Real Calculations | HIGH |
| **Executive PDF Report Generator**| A | `/src/utils/generatePdfReport.ts` | Complete multi-page vector PDF synthesizer including metadata, custom accent palettes, coordinate table, and embedded graph snapshots. | Real (pdf-lib) | HIGH |
| **Desktop Executable (.exe)** | A | `/electron.js`, `/package.json` | Electron shell packaging the compiled Vite SPA with custom menu bars and file associations. | Real Packaging | HIGH |
| **Legacy .trz / .trk Parser** | C / D | `/src/utils/videoFormats.ts` | `JSZip` extracts ZIP files; however, XML parsing of Java Tracker `.trk` definitions is incomplete/partial. | PARTIAL / UNCERTAIN | HIGH |

---

## 3. Forensic Deductions on Java Tracker Parity

1. **Parity Achieved:**
   - Coordinate axis definitions (origin translation and rotation).
   - Distance calibration stick mechanics.
   - Manual point mass step-by-step marking with Shift+Click protection.
   - Finite difference calculation of velocities and accelerations.
   - Ordinary least squares curve fitting with $R^2$ determination.

2. **Parity Divergence & Enhancements (Non-Java Additions):**
   - Java Tracker is inherently a 2D tool; the **Dual-Camera Stereo 3D Triangulation engine (DLT)** is an entirely new extension created in this web workstation.
   - High-speed camera metadata presets (Photron, Phantom) and ballistics metrics (Mach, G-force) were added for aerospace/defense workflows.
   - Modern canvas-based 3D orbit trajectory visualizer is a modern TypeScript addition.

3. **Parity Deficits (Java Features Missing):**
   - **Autotracker:** In Java Tracker, users could select a circular/rectangular template region, set search areas, and execute automated normalized cross-correlation (NCC) tracking across frames. This capability does not exist in the React codebase; all tracking is either manual or loaded from static sample arrays.
   - **RGB / HSL Color Filter:** Java Tracker included image processing filters (brightness, contrast, grayscale, color isolation). None of these exist in the React video player.
