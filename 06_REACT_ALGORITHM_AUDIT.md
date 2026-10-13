# 06. Algorithm & Numerical Methods Forensic Audit

**Project:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Numerical Methods Engineer & Mathematical Physicist  
**Subject:** Rigorous Examination of Equations, Coordinate Handedness, Stability, Conditioning, and Conditioning Degeneracies

---

## 1. Mathematical Algorithms Under Audit

The application implements four primary mathematical systems:
1. **2D Coordinate Transform & Rotation** (`pixelToWorld`, `worldToPixel`)
2. **Finite Difference Numerical Kinematics** (`computeKinematics`, `computeKinematics3D`)
3. **Direct Linear Transformation (DLT) Least-Squares Solver** (`triangulateDLT`, `solveLeastSquares4x3`, `solve3x3`)
4. **Catmull-Rom Cubic Hermite Spline Temporal Interpolator** (`interpolateCameraCoordinates`)
5. **Ordinary Least Squares (OLS) Polynomial Curve Fitting** (`fitLinear`, `fitParabolic`, `fitCubic`)

---

## 2. In-Depth Algorithmic Inspection

### 2.1 2D Coordinate Transformation (`/src/utils/physics.ts`)

#### Governing Equations:
Screen space $(p_x, p_y)$ has origin at top-left with $Y$ increasing downward. Physical Cartesian coordinates $(x, y)$ have origin at $(x_0, y_0)$ with $y$ increasing upward, rotated counter-clockwise by angle $\theta$.

$$\Delta x = p_x - x_0, \quad \Delta y = y_0 - p_y$$

$$\begin{bmatrix} x_{\text{rot}} \\ y_{\text{rot}} \end{bmatrix} = \begin{bmatrix} \cos\theta & \sin\theta \\ -\sin\theta & \cos\theta \end{bmatrix} \begin{bmatrix} \Delta x \\ \Delta y \end{bmatrix}$$

$$x = x_{\text{rot}} \cdot s_m, \quad y = y_{\text{rot}} \cdot s_m$$
Where $s_m = \text{realLength} / \|\mathbf{p}_B - \mathbf{p}_A\|_2$ (meters per pixel).

#### Numerical Analysis:
- **Handedness:** Standard right-handed 2D coordinate system ($+x$ right, $+y$ up).
- **Singularity Protection:** Line 11 safeguards against zero calibration length:
  `if (pixelDist === 0) return 0.001;`
- **Conditioning:** Orthogonal rotation matrix ($\mathbf{R}^T \mathbf{R} = \mathbf{I}$), condition number $\kappa = 1$. Perfectly stable.

---

### 2.2 Numerical Kinematics & Differentiation (`/src/utils/physics.ts`, `/src/utils/triangulation.ts`)

#### Governing Equations:
For discrete non-uniform or uniform time series $(t_i, \mathbf{x}_i)$:

- **Velocity $\mathbf{v}_i$:**
  - Internal points ($0 < i < n-1$): Central difference ($O(\Delta t^2)$):
    $$\mathbf{v}_i = \frac{\mathbf{x}_{i+1} - \mathbf{x}_{i-1}}{t_{i+1} - t_{i-1}}$$
  - Initial boundary ($i = 0$): Forward difference ($O(\Delta t)$):
    $$\mathbf{v}_0 = \frac{\mathbf{x}_1 - \mathbf{x}_0}{t_1 - t_0}$$
  - Terminal boundary ($i = n-1$): Backward difference ($O(\Delta t)$):
    $$\mathbf{v}_{n-1} = \frac{\mathbf{x}_{n-1} - \mathbf{x}_{n-2}}{t_{n-1} - t_{n-2}}$$

- **Acceleration $\mathbf{a}_i$:**
  - Evaluated via second application of finite differences upon the computed velocity array $\mathbf{v}_i$.

#### Numerical Analysis & Potential Instabilities:
- **Division by Small $\Delta t$:** In high-speed ballistics ($100,000\text{ fps} \implies \Delta t = 10^{-5}\text{ s}$), rounding errors in $t$ can amplify numerical noise in $x$. However, because $t_i = f_i / \text{fps}$, $\Delta t$ is exact down to floating-point precision ($10^{-16}$).
- **Noise Amplification in $\mathbf{a}$:** Second numerical differentiation of discrete, hand-clicked points ($p_x, p_y \in \mathbb{Z}$) creates significant high-frequency acceleration jitter. The application **does not apply a Savitzky-Golay filter or Gaussian smoothing** before computing acceleration. A single 1-pixel manual clicking inaccuracy at $10,000\text{ fps}$ can induce a momentary artificial acceleration spike of $>10^5\text{ m/s}^2$.

---

### 2.3 Direct Linear Transformation (DLT) Solver (`/src/utils/triangulation.ts`)

#### Governing Equations:
Overdetermined linear system:
$$\mathbf{A}_{4 \times 3} \mathbf{X}_{3 \times 1} = \mathbf{B}_{4 \times 1}$$

Normal equations:
$$\mathbf{M} \mathbf{X} = \mathbf{b}, \quad \text{where } \mathbf{M} = \mathbf{A}^T \mathbf{A} \in \mathbb{R}^{3 \times 3}, \quad \mathbf{b} = \mathbf{A}^T \mathbf{B} \in \mathbb{R}^{3}$$

Cramer's Rule / Adjugate Matrix Inversion:
$$\mathbf{X} = \frac{1}{\det\mathbf{M}} \text{Adj}(\mathbf{M}) \mathbf{b}$$

#### Numerical Analysis & Singularities:
- **Degeneracy Check:** Line 12 checks:
  `if (Math.abs(det) < 1e-12) return null;`
- **Condition Number $\kappa(\mathbf{A}^T \mathbf{A})$:**
  - For orthogonal cameras ($90^\circ$), $\mathbf{A}^T \mathbf{A}$ is well-conditioned ($\kappa \approx 1$).
  - For narrow baseline cameras ($\theta \to 0^\circ$ or parallel optical axes without convergence), $\det(\mathbf{A}^T \mathbf{A}) \to 0$, causing ill-conditioning and depth uncertainty along the line of sight. The solver correctly identifies this and returns `null`.
- **Method Choice Evaluation:** Solving normal equations via $(\mathbf{A}^T \mathbf{A})^{-1}$ squares the condition number: $\kappa(\mathbf{A}^T \mathbf{A}) = (\kappa(\mathbf{A}))^2$. In professional computer vision libraries (e.g. OpenCV, Eigen), DLT is solved using **Singular Value Decomposition (SVD)** on $\mathbf{A}_{4 \times 3}$ directly to avoid squaring the condition number. While Cramer's rule is computationally light and exact for full-rank orthogonal setups, it is more susceptible to catastrophic cancellation when rays are nearly parallel.

---

### 2.4 Catmull-Rom Cubic Hermite Spline Temporal Sync (`/src/utils/triangulation.ts`)

#### Governing Equations:
For asynchronous dual cameras with keyframes $(t_k, \mathbf{p}_k)$, interpolating at target time $t \in [t_0, t_1]$ with normalized parameter $u = (t - t_0) / (t_1 - t_0)$:

$$\mathbf{p}(u) = h_{00}(u) \mathbf{p}_0 + h_{10}(u) \Delta t \mathbf{m}_0 + h_{01}(u) \mathbf{p}_1 + h_{11}(u) \Delta t \mathbf{m}_1$$

Hermite basis functions:
$$h_{00}(u) = 2u^3 - 3u^2 + 1, \quad h_{10}(u) = u^3 - 2u^2 + u$$
$$h_{01}(u) = -2u^3 + 3u^2, \quad h_{11}(u) = u^3 - u^2$$

Tangents $\mathbf{m}_0, \mathbf{m}_1$ computed via central differences between adjacent keyframes.

#### Numerical Analysis:
- **C1 Continuity:** Velocity vectors of the interpolated coordinate $\mathbf{p}(t)$ are continuous across frame intervals.
- **Boundary Handling:** Extrapolation before the first sample or after the last sample falls back smoothly to linear extrapolation.
- **Stability:** Catmull-Rom splines do not suffer from Runge's phenomenon because interpolation is piecewise cubic between local 4-point windows.

---

### 2.5 Ordinary Least Squares (OLS) Polynomial Curve Fitting (`/src/utils/physics.ts`)

#### Governing Equations:
- **Linear Fit ($y = mx + c$):** Solved via closed-form covariance/variance formulas.
- **Quadratic Fit ($y = Ax^2 + Bx + C$):** Forms the $3 \times 3$ normal equations:
  $$\begin{bmatrix} \sum x_i^4 & \sum x_i^3 & \sum x_i^2 \\ \sum x_i^3 & \sum x_i^2 & \sum x_i \\ \sum x_i^2 & \sum x_i & n \end{bmatrix} \begin{bmatrix} A \\ B \\ C \end{bmatrix} = \begin{bmatrix} \sum x_i^2 y_i \\ \sum x_i y_i \\ \sum y_i \end{bmatrix}$$
  Solved via 3x3 Cramer's Rule (`solve3x3`).
- **Goodness-of-Fit:** Evaluates exact coefficient of determination:
  $$R^2 = 1 - \frac{\sum (y_i - \hat{y}_i)^2}{\sum (y_i - \bar{y})^2}$$

#### Numerical Analysis:
- **Vandermonde Matrix Conditioning:** Fitting higher-degree polynomials without centering $x$ can lead to severe ill-conditioning when $x_i$ has a large offset (e.g. $t \in [100.0, 100.5]$). The implementation operates on relative times ($t - t_0$), keeping $x$ small and well-conditioned.
