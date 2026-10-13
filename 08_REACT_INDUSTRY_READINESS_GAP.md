# 08. Industry-Readiness Gap Analysis

**Project:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Senior Software Architect & Quality Assurance Lead  
**Subject:** Production Readiness, Architecture, Robustness, and Engineering Gaps

---

## 1. Executive Maturity Rating

| Evaluation Dimension | Rating | Description & Findings |
| :--- | :--- | :--- |
| **User Interface & Visual Fidelity** | **9 / 10** | Clean scientific layout, responsive layouts, Tracker OSP aesthetics, excellent PDF report generation. |
| **Interactive Usability** | **8 / 10** | Sub-pixel loupe, Shift+Click safety, dual video controls, orbit presets. |
| **Mathematical Soundness (Idealized)**| **7.5 / 10**| Correct DLT solver, robust spline interpolation, accurate OLS regression. |
| **Computer Vision Sophistication** | **2 / 10** | Zero automated tracking, zero lens distortion handling, zero checkerboard calibration. |
| **Production Architecture & Testing** | **2.5 / 10**| Zero automated unit tests, monolithic root state, no persistent database. |

---

## 2. Categorized Issue Classification (CRITICAL, HIGH, MEDIUM, LOW)

### 🔴 CRITICAL Gaps (Must resolve prior to field/laboratory deployment)

1. **Absence of Lens Distortion Modeling:**
   - *Impact:* The DLT formulation assumes a pinhole camera with zero optical distortion. Real-world lenses (especially action cams and high-speed optics) possess significant barrel and pincushion distortion. Without polynomial distortion correction ($k_1, k_2$), triangulated 3D points near the image periphery will suffer errors exceeding 5–15% of the field of view.
   - *Classification:* **CRITICAL**

2. **No Automated Computer Vision Tracking:**
   - *Impact:* Long video sequences (e.g. 500 frames at 1,000 fps) cannot realistically be hand-clicked point-by-point. The complete absence of template matching (NCC), optical flow, or feature detection forces tedious manual entry.
   - *Classification:* **CRITICAL**

3. **Complete Absence of Automated Unit & Regression Tests:**
   - *Impact:* There are zero test files in `/src` (no Jest, Vitest, Playwright, or Cypress suites). Numerical routines (`solve3x3`, `triangulateDLT`, `fitParabolic`) lack automated regression assertions. Changes to mathematical formulas can easily introduce silent regressions.
   - *Classification:* **CRITICAL**

---

### 🟠 HIGH Gaps (Substantial architectural & operational impediments)

4. **Monolithic In-Memory React State:**
   - *Impact:* All experiment data lives in volatile memory in `App.tsx`. Refreshing the browser tab or closing the window completely wipes all user annotations and calibration points. There is no automatic autosave to IndexedDB or localStorage.
   - *Classification:* **HIGH**

5. **Lack of Savitzky-Golay / Noise Filtering for Acceleration:**
   - *Impact:* Hand-clicked pixel coordinates are integers ($\pm 1$ pixel discretization noise). Calculating acceleration via second finite differences amplifies this high-frequency noise quadratically. Accelerations appear erratic unless filtered by an analytical smoothing filter.
   - *Classification:* **HIGH**

6. **Idealized Calibration Matrix Generation:**
   - *Impact:* The application generates DLT matrices based on assumed camera positions ($90^\circ$ or angled baseline) rather than an empirical calibration step using known 3D control points (e.g. a calibration cage or wand). Users cannot calibrate arbitrary camera angles from physical measurements.
   - *Classification:* **HIGH**

---

### 🟡 MEDIUM Gaps (Quality of life, performance, and robustness)

7. **Main Thread Blocking on Heavy Processing:**
   - *Impact:* Processing large tracks or parsing large `.trz` archives runs on the main JavaScript thread, occasionally causing frame drops or UI stuttering during playback. Computation should be offloaded to Web Workers.
   - *Classification:* **MEDIUM**

8. **Incomplete Java Tracker XML Parser (`.trk` / `.trz`):**
   - *Impact:* While `JSZip` opens `.trz` archives, the application does not yet fully deserialize Java Tracker XML schemas into React state objects.
   - *Classification:* **MEDIUM**

9. **Normal Equations vs. SVD for DLT:**
   - *Impact:* Solving $\mathbf{A}^T \mathbf{A} \mathbf{X} = \mathbf{A}^T \mathbf{B}$ squares the condition number. For nearly colinear camera rays, SVD decomposition would provide superior numerical stability.
   - *Classification:* **MEDIUM**

---

### 🟢 LOW Gaps (Minor refinements)

10. **Hardcoded Atmosphere Constants in Ballistics:**
    - *Impact:* Mach number calculation assumes standard sea-level speed of sound ($343.0\text{ m/s}$). Does not allow user adjustments for ambient temperature, humidity, or altitude.
    - *Classification:* **LOW**

11. **CSS Layout Fixed Assumptions on Small Displays:**
    - *Impact:* Complex side-by-side video views and 3D telemetry panels are optimized for desktop resolutions ($>1280\text{px}$) and can become cramped on mobile viewports.
    - *Classification:* **LOW**
