# 07. API & Backend Boundary Audit

**Project:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Enterprise Software Architect  
**Subject:** Boundary Inspection: Local vs. Remote Computation, Backend Feasibility, and Java Core Delegation

---

## 1. Current Architectural Boundary Map

```text
[ Browser / Electron Client ]
  │
  ├─ Video Decoding ─────────────► Native HTML5 Media Engine (Browser Core)
  ├─ User Marking ───────────────► React Component UI State (In-Memory)
  ├─ 2D Coordinate Transforms ───► /src/utils/physics.ts (In-Memory Pure JS)
  ├─ 3D DLT Triangulation ───────► /src/utils/triangulation.ts (In-Memory Pure JS)
  ├─ Kinematics & Fits ──────────► /src/utils/physics.ts (In-Memory Pure JS)
  ├─ PDF Report Synthesis ───────► pdf-lib (In-Memory Pure JS)
  └─ Archive Decompression ──────► JSZip (In-Memory Pure JS)
  │
  ▼
[ NO NETWORK / SERVER LAYER ]
  - HTTP REST Endpoints: NONE (0)
  - WebSocket Endpoints: NONE (0)
  - GraphQL Endpoints: NONE (0)
  - Database Connections: NONE (0)
  - Microservices: NONE (0)
```

The application is an **entirely self-contained, 100% client-side application**. No remote computational backend, Node.js API server, or Java service is invoked during any stage of execution.

---

## 2. Component Interface Flow Matrix

| Client Component | Invoked Function / Utility | Input Data Contract | Executed Computation | Return Value Contract |
| :--- | :--- | :--- | :--- | :--- |
| `VideoPlayerView.tsx` | `pixelToWorld` | $(p_x, p_y)$, `CoordinateAxes`, `Calibration` | 2D Translation, Rotation $\mathbf{R}(\theta)$, Scaling $s_m$ | `{ x: number, y: number }` (Meters) |
| `DualVideoPlayerView.tsx` | `interpolateCameraCoordinates` | Keyframes array, target timestamp $t$ | Catmull-Rom cubic Hermite spline interpolation | Sub-pixel $(p_x, p_y)$, time residual |
| `DualVideoPlayerView.tsx` | `triangulateDLT` | $(u_1, v_1), (u_2, v_2), \mathbf{L}_1, \mathbf{L}_2$ | $4 \times 3$ normal equations least squares | `{ x, y, z, residual }` |
| `App.tsx` | `computeKinematics3D` | `PointStep[]`, mass, gravity | 1st & 2nd order finite differences | Full kinematic time series ($v, a, E$) |
| `PlotView.tsx` | `fitParabolic` | Point pairs $(x_i, y_i)$ | $3 \times 3$ OLS polynomial regression | `{ equation, params, rSquared, rmse }` |
| `ExperimentReportModal.tsx` | `generatePdfReport` | `Track`, `Calibration`, snapshot image | Vector PDF document generation via `pdf-lib` | `Uint8Array` binary PDF buffer |

---

## 3. Java Core / Native Backend Delegation Analysis

If this application is re-integrated with an upstream Java Tracker core, or migrated to a client-server enterprise architecture, the table below identifies which computational components can be safely retained in the React client versus those that should be delegated to a high-performance Java/C++ core.

| Functional Capability | Current React Status | Feasibility of Java Delegation | Recommended Delegation Strategy & Architecture |
| :--- | :--- | :--- | :--- |
| **Automated Computer Vision Tracking** | **Absent** | **HIGH (Essential)** | Delegate to Java / OpenCV via REST, WebSocket, or native JNI. The backend processes the video stream frame-by-frame using Lucas-Kanade optical flow, normalized cross-correlation (NCC), or YOLOv8/segmentation models, returning tracking coordinates to React. |
| **Camera Lens Calibration & Bundle Adjustment** | **Simplified** | **HIGH** | Delegate to Java core. Java reads a calibration checkerboard video, calculates intrinsic matrix $\mathbf{K}$ and distortion coefficients $[k_1, k_2, p_1, p_2]$, and returns calibrated undistortion maps. |
| **Non-Linear 3D Triangulation & SVD** | **Simplified DLT** | **MEDIUM** | Delegate to Java core. SVD-based triangulation with non-linear Levenberg-Marquardt reprojection error minimization. |
| **High-Speed Video Transcoding & Demuxing** | **Browser Native** | **HIGH** | Browser decoding can struggle with legacy scientific AVI codecs (e.g. uncompressed raw, Motion-JPEG, Indeo). A Java/FFmpeg backend can transcode on-the-fly to H.264 MP4 streams. |
| **2D Coordinate Transform & Basic Kinematics** | **Real & Fast** | **LOW (Keep in Client)** | Keep in React. 2D rotation, scaling, and finite differences execute in $< 0.1\text{ ms}$ on the client. Delegating to a server would add unnecessary network latency. |
| **Interactive 3D Trajectory Orbiting** | **Real** | **LOW (Keep in Client)** | Keep in React/Canvas. 60 FPS viewport manipulation requires immediate client-side rendering. |
| **Senior Officer PDF Report Generation** | **Real** | **LOW (Keep in Client)** | Keep in React. `pdf-lib` generates reports in $< 500\text{ ms}$ client-side with zero server dependencies. |
