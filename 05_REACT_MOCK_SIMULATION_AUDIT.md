# 05. Mock, Simulation & Fabricated Realism Audit

**Project:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Forensic Computer Vision & Numerical Methods Auditor  
**Subject:** Discovery of Synthetic Data, Mock Feeds, Pre-Generated Trajectories, and Fabricated Metrics

---

## 1. Executive Summary: What is Real vs. Fabricated

To ensure total scientific integrity, this audit aggressively isolates all elements of the application that simulate physical hardware or fabricate data.

1. **Synthetic Video Frames:** The application contains high-speed defense presets (e.g., "Photron FASTCAM SA-Z at 10,000 fps", "Phantom v2512 Schlieren at 25,000 fps"). Because real 100,000 fps raw sensor video files are not bundled in the repo, the application **procedurally draws synthetic ballistic animations** onto the HTML5 `<canvas>` using 2D rendering primitives (drawing a 5.56mm Spitzer bullet, shockwave Mach cones, and expanding gelatin cavitation cavities).
2. **Pre-Generated Sample Point Clouds:** The bundled sample experiments (`/src/data/samples.ts` and `/src/data/samples3d.ts`) contain pre-calculated arrays of sample tracking points. These allow instant demonstrations of plots and 3D trajectories without requiring the user to mark video frames first.
3. **Real Mathematical Execution upon User Interaction:** Once a user marks points or moves calibration sticks, the mathematical solvers (**DLT triangulation, Cramer's rule, spline interpolation, finite difference kinematics**) perform real numerical calculations on the user's data.

---

## 2. Forensic Discovery Matrix: Real vs. Simulated

| Feature / Subsystem | Status | Forensic Evidence & Code Location | Detailed Assessment |
| :--- | :--- | :--- | :--- |
| **Ballistic Bullet Canvas Animation** | **SIMULATED** | `/src/components/VideoPlayerView.tsx`, lines 510–565 | Draws animated copper bullet, shockwave lines, and text overlays procedurally on `<canvas>` based on `currentFrame`. Not a video recording. |
| **Schlieren Shockwave Canvas Animation**| **SIMULATED** | `/src/components/VideoPlayerView.tsx`, lines 566–660 | Draws circular Schlieren mirror, gradient lighting, and expanding Mach cone lines procedurally on `<canvas>`. |
| **High-G Impact Penetration Animation** | **SIMULATED** | `/src/components/VideoPlayerView.tsx`, lines 661–780 | Generates animated armor plate deformation and spall particles on `<canvas>` via trigonometric formulas. |
| **Sample 2D Ball Toss Trajectory** | **SIMULATED** | `/src/data/samples.ts`, lines 38–63 | 24 hardcoded 2D pixel points (`{ frame: 11, px: 277, py: 165 }`) pre-stored in JSON format. |
| **Sample 3D Hypersonic Projectile Points** | **SIMULATED** | `/src/data/samples3d.ts`, lines 58–78 | Procedurally generated sample array: `xMeters = 1300 * t`, `yMeters = 0.5 - 0.5 * 9.81 * t * t`, `zMeters = 0.06 * Math.sin(t * 1500)`. |
| **Photron / Phantom Camera Hardware API** | **PLACEHOLDER** | `/src/utils/highSpeedCameras.ts` | Static database of manufacturer specifications (sensor size, maximum FPS, pixel pitch). No active camera driver or GenICam/USB3/GigE hardware interface exists. |
| **DLT Camera Matrix Derivation** | **SIMULATED / DEMO** | `/src/utils/triangulation.ts`, lines 143–215 | `buildDefaultDLT` calculates $\mathbf{L}_1, \mathbf{L}_2$ algebraically from assumed angles ($\theta = 90^\circ$ or $45^\circ$) rather than solving an actual calibration rig. |
| **DLT 3D Reconstruction Math** | **REAL** | `/src/utils/triangulation.ts`, lines 94–138 | True $4 \times 3$ least-squares normal equations solver. Given any two 2D points and DLT matrices, it computes the exact geometric intersection. |
| **Catmull-Rom Hermite Spline Sync** | **REAL** | `/src/utils/triangulation.ts`, lines 533–565 | Full continuous mathematical cubic spline implementation with Hermite basis functions ($h_{00}, h_{10}, h_{01}, h_{11}$). |
| **Ordinary Least Squares Regression** | **REAL** | `/src/utils/physics.ts`, lines 220–480 | Real analytical closed-form linear, parabolic, and cubic polynomial fits calculating exact $R^2$ and RMSE metrics. |
| **Reprojection Residual Metric** | **REAL** | `/src/utils/triangulation.ts`, lines 130–136 | Real Euclidean distance in pixels between reprojected DLT points and original image coordinates. |
| **High-Speed Sensor Frame Rates** | **APPROXIMATED** | `/src/types.ts`, `ClipSettings.fps` | Sensor FPS (e.g. 10,000 or 100,000) is stored as a numerical variable that scales time ($\Delta t = 1/\text{fps}$). The underlying video decoder plays at container rate (30 fps). |
| **Automatic Computer Vision** | **NOT IMPLEMENTED** | N/A | No template matching, optical flow, or CNN inference exists. All tracking is either manual user clicks or predefined sample arrays. |

---

## 3. Detailed Audit of Fabricated UI Realism

### 3.1 Procedural Ballistic Animation (`ballistic-bullet-10k`)
In `/src/components/VideoPlayerView.tsx`, lines 510–565:
```typescript
// Procedurally synthesized 5.56mm bullet animation
const bulletX = Math.round(50 + currentFrame * 22);
const bulletY = 240;
ctx.fillStyle = '#f59e0b'; // Copper jacket
ctx.beginPath();
ctx.moveTo(bulletX, bulletY);
ctx.quadraticCurveTo(bulletX - 8, bulletY - 4, bulletX - 18, bulletY - 4);
...
// Supersonic Shockwave (Mach cone) in air prior to impact
if (currentFrame < 4) {
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
  ctx.beginPath();
  ctx.moveTo(bulletX, bulletY);
  ctx.lineTo(bulletX - 80, bulletY - 35);
  ctx.stroke();
}
```
- **Auditor Finding:** When selecting the high-speed ballistic sample experiment, the user is viewing a hand-coded 2D vector animation on the canvas, not a high-speed video recording from a Photron FASTCAM sensor.

### 3.2 Pre-Computed 3D Hypersonic Projectile Samples
In `/src/data/samples3d.ts`, lines 58–78:
```typescript
samplePoints: Array.from({ length: 17 }, (_, i) => {
  const t = i * 0.0001; // 100 us per frame
  const xMeters = 1300 * t; // 1,300 m/s ~ Mach 3.8
  const yMeters = 0.5 - 0.5 * 9.81 * t * t;
  const zMeters = 0.06 * Math.sin(t * 1500); // slight yaw oscillation
  const scale = 500;
  const isOdd = i % 2 !== 0;
  return {
    frame: i,
    px: Math.round(50 + xMeters * scale),
    py: Math.round(240 - yMeters * scale),
    cam2Px: Math.round(50 + zMeters * scale),
    cam2Py: Math.round(240 - yMeters * scale),
    z: zMeters,
    isInterpolatedCam2: isOdd,
    temporalDeltaSeconds: isOdd ? 0.00005 : 0,
  };
})
```
- **Auditor Finding:** This sample point cloud was mathematically synthesized using textbook ballistics equations ($x = v_0 t, y = y_0 - \frac{1}{2} g t^2, z = A \sin(\omega t)$). It provides an idealized demonstration of asynchronous spline triangulation, but did not originate from physical camera tracking.
