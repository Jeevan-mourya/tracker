# 04. Dataflow & Pipeline Forensic Analysis

**Project:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Software Archaeologist & Systems Architect  
**Subject:** End-to-End Pipeline Verification from Raw Media Input to Visualization & Export

---

## 1. Complete End-to-End Processing Pipeline

The table below traces the exact flow of data through the React codebase from video input to final reporting.

| Processing Stage | Implementation File & Function | Method / Mathematical Formulation | Inputs | Outputs | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Camera Input** | User local file picker (`<input type="file">`) or predefined sample URL in `/src/App.tsx` | Browser File API / URL loading | User video file (.mp4, .mov, .webm) or static sample URL | File blob URL or network path | **REAL** |
| **2. Frame Acquisition** | HTML5 `<video>` element driven by `video.currentTime = frame / fps` in `VideoPlayerView.tsx` | Browser native hardware media decoder | Video stream, target frame index | Video element buffered decoded frame | **REAL (Browser Native)** |
| **3. Frame Synchronization**| Multi-rate ratio and temporal offset math in `DualVideoPlayerView.tsx` & `triangulation.ts` | $t = t_0 + f \cdot \Delta t$; $f_{\text{cam2}} = \text{round}((t - \Delta t_{\text{offset}}) \cdot \text{fps}_2)$ | Master time $t$, FPS Cam 1, FPS Cam 2, offset | Synchronized secondary frame integer | **REAL (Discrete Indexing)** |
| **4. Image Preprocessing** | Direct rendering to `<canvas>` via `drawImage(video, 0, 0)` | Canvas 2D bitmap blit. No edge detection, filtering, or thresholding | Decoded video frame buffer | Raw canvas pixels | **NOT IMPLEMENTED (Raw Pass-Through)** |
| **5. Feature Detection** | Manual human click in `VideoPlayerView.tsx` (`handleMouseDown`) or `DualVideoPlayerView.tsx` (`handleCanvasClick`) | User ocular identification guided by $4\times$ zoom magnifier loupe | Mouse click $(e.\text{clientX}, e.\text{clientY})$ | Raw integer pixel coordinates $(p_x, p_y)$ | **REAL (Manual User Input)** |
| **6. Automatic Tracking** | No OpenCV, no lucas-kanade, no template correlation in codebase | N/A | N/A | N/A | **NOT IMPLEMENTED** |
| **7. Stereo Correspondence** | Human manual identification across dual viewports or time-based spline association | Manual user click on both viewports matching same physical particle | $(u_1, v_1)$ on Cam 1, $(u_2, v_2)$ on Cam 2 at timestamp $t$ | Associated 2D point pair $(u_1, v_1) \leftrightarrow (u_2, v_2)$ | **REAL (Human-in-the-Loop)** |
| **8. Temporal Interpolation** | `interpolateCameraCoordinates` in `/src/utils/triangulation.ts` (lines 427–565) | Catmull-Rom cubic Hermite spline interpolation over 2D coordinates across asynchronous keyframes | Sparse keyframe array, target continuous timestamp $t$ | Sub-pixel interpolated $(u_2, v_2)$ and $\Delta t$ residual | **REAL (Mathematical Spline)** |
| **9. Camera Calibration** | `buildDefaultDLT` in `/src/utils/triangulation.ts` (lines 143–215) | Synthetic affine & angular DLT matrix generation based on baseline $B$ and angle $\theta$ | Scale 1, Scale 2, baseline, angle | 11 DLT coefficients $\mathbf{L}_1, \mathbf{L}_2$ | **SIMULATED / DEMONSTRATION** |
| **10. 3D Triangulation** | `triangulateDLT` in `/src/utils/triangulation.ts` (lines 94–138) | Overdetermined least-squares normal equations $(\mathbf{A}^T \mathbf{A})^{-1} \mathbf{A}^T \mathbf{B}$ solved via Cramer's Rule | $(u_1, v_1), (u_2, v_2), \mathbf{L}_1, \mathbf{L}_2$ | World 3D coordinates $(X, Y, Z)$ in meters, reprojection residual | **REAL (Analytical DLT)** |
| **11. Kinematics Derivation**| `computeKinematics3D` in `/src/utils/triangulation.ts` (lines 220–350) | Central differences for internal steps, forward/backward at endpoints | Time series of 3D positions $(t_i, X_i, Y_i, Z_i)$ | Velocities $(v_x, v_y, v_z, v)$, Accelerations $(a_x, a_y, a_z, a)$, energies | **REAL (Finite Differences)** |
| **12. Telemetry Processing** | Ballistics equations in `triangulation.ts` (lines 336–348) | Slant range $\sqrt{X^2+Y^2+Z^2}$, Mach $v/343$, G-force $a/9.80665$, azimuth, elevation | $X, Y, Z, v, a$ | Aerospace / TrackEye telemetry metrics | **REAL** |
| **13. 3D Visualization** | `ThreeDTrajectoryView.tsx` | Hand-rolled 3D wireframe camera projection on HTML5 2D canvas $(\psi, \theta, \text{pan}, \text{zoom})$ | 3D steps array, active frame | Interactive 2D viewport rendering 3D orbit | **REAL (Software 3D on 2D Canvas)** |
| **14. 2D Graphing** | `PlotView.tsx` | Recharts SVG plotting with OLS polynomial regression | Kinematic time series | Interactive kinematic curves & fit parameters | **REAL (Recharts)** |
| **15. Tabular Readout** | `TableView.tsx` | React HTML table with unit formatting (s, ms, $\mu$s) and clipboard TSV export | Kinematic point array | Formatted data grid, TSV string | **REAL** |
| **16. Report Generation** | `generatePdfReport.ts` | Multi-page PDF synthesis using `pdf-lib` embedding canvas snapshots and tables | Active track, calibration, axes, graph images | Binary PDF file (`Uint8Array`) | **REAL** |

---

## 2. In-Depth Audit of Critical Pipeline Interfaces

### 2.1 The Point Addition Workflow (2D Mode)
1. **User Action:** User holds `Shift` and clicks on canvas in `VideoPlayerView.tsx`.
2. **Coordinate Transformation:**
   - Raw mouse position $\to$ Scaled canvas video pixel coordinates $(p_x, p_y)$.
   - `pixelToWorld(px, py, axes, calibration)`:
     - Translates relative to origin: $\Delta x = p_x - x_0$, $\Delta y = y_0 - p_y$ (inverting screen Y so upward is positive).
     - Rotates by coordinate axis angle $\theta$:
       $$x_{\text{rot}} = \Delta x \cos\theta + \Delta y \sin\theta, \quad y_{\text{rot}} = -\Delta x \sin\theta + \Delta y \cos\theta$$
     - Scales to physical meters: $x = x_{\text{rot}} \cdot s_m$, $y = y_{\text{rot}} \cdot s_m$.
3. **State Mutation:** Point appended to active track in `App.tsx`.
4. **Kinematic Cascade:** `computeKinematics` recalculates velocities, accelerations, and energies across all steps in the track.

### 2.2 The Point Addition Workflow (3D Stereo Mode)
1. **User Action:** User clicks on Camera 1 canvas or Camera 2 canvas in `DualVideoPlayerView.tsx`.
2. **Temporal Alignment:**
   - If user marks Camera 1, and Camera 2 already has keyframes across time, `interpolateCameraCoordinates` interpolates the sub-frame position of Camera 2 at timestamp $t_{\text{master}}$ using a Catmull-Rom spline.
3. **Triangulation Execution:**
   - If points exist for both cameras, `triangulateDLT` solves the $4 \times 3$ linear system.
   - Outputs world coordinates $(X, Y, Z)$ and reprojection residual.
4. **State Mutation:** Stored in track step with metadata:
   - `isInterpolatedCam2`, `temporalDeltaSeconds`, `cam1Px`, `cam2Px`, `z`.
5. **Kinematic Cascade:** `computeKinematics3D` recalculates 3D velocities ($v_x, v_y, v_z$), 3D speeds, 3D accelerations, G-force, and Mach numbers.
