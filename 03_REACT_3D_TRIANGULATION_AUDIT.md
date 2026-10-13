# 03. Two-Camera 3D Stereo Triangulation & DLT Audit

**Project:** Tracker Video Analysis & Stereo 3D Workstation  
**Auditor Role:** Senior Computer Vision & Numerical Methods Engineer  
**Subject:** Exhaustive Mathematical & Algorithmic Audit of Dual-Camera Triangulation

---

## 1. Executive Triangulation Verdict

> **Classification:** **1. True Geometric Triangulation (Closed-Form Direct Linear Transformation)**, backed by **Simplified/Idealized Geometric Calibration Models**.

The application **genuinely executes mathematical 3D reconstruction** using an algebraic Direct Linear Transformation (DLT) formulation. It does **not** rely on fake random coordinates or hardcoded 3D outputs during active user tracking. When a user marks a 2D pixel $(u_1, v_1)$ in Camera 1 and $(u_2, v2)$ in Camera 2, the system constructs a system of 4 linear equations in 3 unknowns $(X, Y, Z)$ and solves it via **Least Squares Normal Equations** using an analytical $3 \times 3$ matrix inversion (Cramer's Rule / Adjugate Matrix).

However, the **camera calibration parameters (the 11 DLT coefficients per camera)** are not estimated from a physical 3D calibration fixture (e.g. DLT wand or 3D control point cage with bundle adjustment), but are precomputed algebraically assuming idealized camera placement (orthogonal $90^\circ$ or symmetric convergent angle with baseline $B$).

---

## 2. Mathematical Formulation & Exact Code Extraction

### 2.1 The Direct Linear Transformation (DLT) Model

In standard photogrammetry (Abdel-Aziz & Karara, 1971), the 11-parameter DLT maps a 3D world point $\mathbf{X} = [X, Y, Z]^T$ to image plane coordinates $(u, v)$ via the rational projective transformation:

$$u = \frac{L_1 X + L_2 Y + L_3 Z + L_4}{L_9 X + L_{10} Y + L_{11} Z + 1}$$

$$v = \frac{L_5 X + L_6 Y + L_7 Z + L_8}{L_9 X + L_{10} Y + L_{11} Z + 1}$$

Where $\mathbf{L} = [L_1, L_2, \dots, L_{11}]^T$ embodies both intrinsic parameters (focal lengths $f_u, f_v$, principal point $u_0, v_0$) and extrinsic parameters (rotation matrix $\mathbf{R}_{3 \times 3}$, camera center $\mathbf{C}$).

**Implemented in Source Code:** `/src/utils/triangulation.ts`, lines 75–88:
```typescript
export function project3DToDLT(x: number, y: number, z: number, dlt: DLT11): { u: number; v: number } {
  const denom = dlt[8] * x + dlt[9] * y + dlt[10] * z + 1.0;
  const safeDenom = Math.abs(denom) < 1e-9 ? 1.0 : denom;
  const u = (dlt[0] * x + dlt[1] * y + dlt[2] * z + dlt[3]) / safeDenom;
  const v = (dlt[4] * x + dlt[5] * y + dlt[6] * z + dlt[7]) / safeDenom;
  return { u, v };
}
```

---

### 2.2 Triangulation Linear System Formulation

Multiplying out the denominators yields two linear equations in $(X, Y, Z)$ per camera view:

$$\begin{cases}
(L_{1,1} - u_1 L_{1,9}) X + (L_{1,2} - u_1 L_{1,10}) Y + (L_{1,3} - u_1 L_{1,11}) Z = u_1 - L_{1,4} \\
(L_{1,5} - v_1 L_{1,9}) X + (L_{1,6} - v_1 L_{1,10}) Y + (L_{1,7} - v_1 L_{1,11}) Z = v_1 - L_{1,8} \\
(L_{2,1} - u_2 L_{2,9}) X + (L_{2,2} - u_2 L_{2,10}) Y + (L_{2,3} - u_2 L_{2,11}) Z = u_2 - L_{2,4} \\
(L_{2,5} - v_2 L_{2,9}) X + (L_{2,6} - v_2 L_{2,10}) Y + (L_{2,7} - v_2 L_{2,11}) Z = v_2 - L_{2,8}
\end{cases}$$

This forms the overdetermined linear system:
$$\mathbf{A}_{4 \times 3} \mathbf{X}_{3 \times 1} = \mathbf{B}_{4 \times 1}$$

**Implemented in Source Code:** `/src/utils/triangulation.ts`, lines 110–123:
```typescript
const A: number[][] = [
  [dlt1[0] - u1 * dlt1[8], dlt1[1] - u1 * dlt1[9], dlt1[2] - u1 * dlt1[10]],
  [dlt1[4] - v1 * dlt1[8], dlt1[5] - v1 * dlt1[9], dlt1[6] - v1 * dlt1[10]],
  [dlt2[0] - u2 * dlt2[8], dlt2[1] - u2 * dlt2[9], dlt2[2] - u2 * dlt2[10]],
  [dlt2[4] - v2 * dlt2[8], dlt2[5] - v2 * dlt2[9], dlt2[6] - v2 * dlt2[10]],
];

const B: number[] = [
  u1 - dlt1[3],
  v1 - dlt1[7],
  u2 - dlt2[3],
  v2 - dlt2[7],
];
```

---

### 2.3 Least-Squares Solution via Normal Equations

To solve $\mathbf{A} \mathbf{X} = \mathbf{B}$, the application forms the normal equations:
$$\mathbf{A}^T \mathbf{A} \mathbf{X} = \mathbf{A}^T \mathbf{B}$$

Where $\mathbf{A}^T \mathbf{A}$ is a symmetric $3 \times 3$ matrix and $\mathbf{A}^T \mathbf{B}$ is a $3 \times 1$ vector.

The $3 \times 3$ system is then solved directly via **Cramer's Rule / Adjugate Matrix**:
$$\mathbf{X} = (\mathbf{A}^T \mathbf{A})^{-1} (\mathbf{A}^T \mathbf{B}) = \frac{1}{\det(\mathbf{A}^T \mathbf{A})} \text{Adj}(\mathbf{A}^T \mathbf{A}) (\mathbf{A}^T \mathbf{B})$$

**Implemented in Source Code:** `/src/utils/triangulation.ts`, lines 6–36 & 42–70:
```typescript
export function solveLeastSquares4x3(A: number[][], B: number[]): [number, number, number] | null {
  const AtA = computeAtA(A); // 3x3
  const AtB = computeAtB(A, B); // 3x1
  return solve3x3(AtA, AtB);
}
```

---

### 2.4 Reprojection Residual Calculation

After computing $\mathbf{X} = [X, Y, Z]^T$, the algorithm computes the reprojected 2D coordinates:
$$\hat{\mathbf{p}}_1 = \text{project3DToDLT}(X, Y, Z, \mathbf{L}_1), \quad \hat{\mathbf{p}}_2 = \text{project3DToDLT}(X, Y, Z, \mathbf{L}_2)$$

And evaluates the mean Euclidean reprojection error in pixels:
$$\text{residual} = \frac{1}{2} \left( \|\hat{\mathbf{p}}_1 - \mathbf{p}_1\|_2 + \|\hat{\mathbf{p}}_2 - \mathbf{p}_2\|_2 \right)$$

**Implemented in Source Code:** `/src/utils/triangulation.ts`, lines 130–136.

---

## 3. Geometric Calibration Models & Assumptions

How are $\mathbf{L}_1$ and $\mathbf{L}_2$ actually populated? The function `buildDefaultDLT(...)` in `/src/utils/triangulation.ts` (lines 143–215) synthesizes the DLT coefficients based on user-chosen presets:

### Method 1: `orthogonal-front-side` (Orthogonal $90^\circ$ Dual Cameras)
- **Camera 1 (Front View):** Observes world $X$ along screen horizontal, world $Y$ along screen vertical (inverted). Depth $Z$ is orthogonal to image plane.
  $$\mathbf{L}_1 = [s_1, 0, 0, u_{01}, \quad 0, -s_1, 0, v_{01}, \quad 0, 0, 0]$$
- **Camera 2 (Side View at $90^\circ$):** Observes world $Z$ along screen horizontal, world $Y$ along screen vertical. Depth $X$ is orthogonal.
  $$\mathbf{L}_2 = [0, 0, s_2, u_{02}, \quad 0, -s_2, 0, v_{02}, \quad 0, 0, 0]$$
- **Mathematical Meaning:** An affine orthographic projection where $u_1 \to X$, $v_1 \to Y$, $u_2 \to Z$, $v_2 \to Y$. The least-squares solver resolves $Y$ as the optimal average of $v_1$ and $v_2$, while $X$ and $Z$ come directly from $u_1$ and $u_2$.

### Method 2: `convergent-stereo` (Angled Baseline)
- Left camera rotated by $+\theta/2$, right camera rotated by $-\theta/2$:
  $$\mathbf{L}_1 = [s_1 \cos(\theta/2), 0, s_1 \sin(\theta/2), u_{01} - s_1 (B/2), \quad 0, -s_1, 0, v_{01}, \quad 0, 0, 0.05]$$
  $$\mathbf{L}_2 = [s_2 \cos(\theta/2), 0, -s_2 \sin(\theta/2), u_{02} + s_2 (B/2), \quad 0, -s_2, 0, v_{02}, \quad 0, 0, 0.05]$$
- **Mathematical Evaluation:** Perspective denominator parameter $L_{11} = 0.05 \text{ m}^{-1}$ introduces a synthetic perspective foreshortening factor ($1 + 0.05 Z$).

---

## 4. Architectural & Mathematical Strengths and Limitations

### Strengths:
1. **Mathematically Real:** The solver is a legitimate linear least-squares implementation. If supplied with genuine 11-parameter calibration matrices from standard photogrammetry software, `triangulateDLT` produces mathematically rigorous 3D world coordinates.
2. **Deterministic Conditioning:** The determinant of $\mathbf{A}^T \mathbf{A}$ is checked ($\vert\det\vert < 10^{-12}$) to protect against division-by-zero or colinear rays.
3. **Reprojection Error Feedback:** Provides the user with instant pixel-level residual feedback.

### Limitations & Gaps:
1. **Lens Distortion Ignored:** Radial distortion ($k_1, k_2, k_3$) and tangential distortion ($p_1, p_2$) are not modeled. For wide-angle or GoPro lenses, triangulation error will increase significantly near frame borders.
2. **Absence of Calibration Solver:** The UI allows editing scales and angles, but does not provide an automated tool to compute the 11 DLT parameters from a set of known 3D control points (e.g. 6 non-coplanar survey markers).
3. **Homogeneous Singularities:** DLT assumes affine/projective linear mapping; severe perspective depth close to the lens is only approximated.
