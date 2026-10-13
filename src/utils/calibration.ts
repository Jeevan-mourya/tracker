import {
  DLT11,
  CalibrationControlPoint3D,
  EmpiricalCalibrationResult,
  LensDistortionParams,
  CalibrationStatus,
} from '../types';
import { project3DToDLT } from './triangulation';

export interface UndistortResult {
  u: number;
  v: number;
  converged: boolean;
  iterations: number;
  residualPx: number;
  status: 'converged' | 'diverged' | 'max_iterations_exceeded' | 'invalid_input';
}

/**
 * Apply Brown-Conrady lens distortion model:
 * - Radial distortion: k1*r^2 + k2*r^4 + k3*r^6
 * - Tangential (decentering) distortion: p1, p2
 *
 * Coordinates are normalized by scale (typically image half-diagonal or focal length proxy).
 */
export function applyBrownConradyDistortion(
  u: number,
  v: number,
  u0: number,
  v0: number,
  params: LensDistortionParams,
  scale: number = 1000
): { u: number; v: number } {
  if (!params.enabled) return { u, v };

  const k1 = params.k1 || 0;
  const k2 = params.k2 || 0;
  const k3 = params.k3 || 0;
  const p1 = params.p1 || 0;
  const p2 = params.p2 || 0;

  if (k1 === 0 && k2 === 0 && k3 === 0 && p1 === 0 && p2 === 0) {
    return { u, v };
  }

  const x = (u - u0) / scale;
  const y = (v - v0) / scale;
  const r2 = x * x + y * y;
  const r4 = r2 * r2;
  const r6 = r4 * r2;

  const radialFactor = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;
  const dxTan = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
  const dyTan = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;

  const xd = x * radialFactor + dxTan;
  const yd = y * radialFactor + dyTan;

  return {
    u: u0 + xd * scale,
    v: v0 + yd * scale,
  };
}

/**
 * Iterative fixed-point inversion of Brown-Conrady distortion model.
 * Returns undistorted image coordinates (u, v) and convergence diagnostic metrics.
 */
export function undistortBrownConradyPoint(
  ud: number,
  vd: number,
  u0: number,
  v0: number,
  params: LensDistortionParams,
  scale: number = 1000,
  maxIterations: number = 25,
  tolerancePx: number = 1e-5
): UndistortResult {
  if (!Number.isFinite(ud) || !Number.isFinite(vd)) {
    return {
      u: NaN,
      v: NaN,
      converged: false,
      iterations: 0,
      residualPx: NaN,
      status: 'invalid_input',
    };
  }

  if (!params.enabled) {
    return {
      u: ud,
      v: vd,
      converged: true,
      iterations: 0,
      residualPx: 0,
      status: 'converged',
    };
  }

  const k1 = params.k1 || 0;
  const k2 = params.k2 || 0;
  const k3 = params.k3 || 0;
  const p1 = params.p1 || 0;
  const p2 = params.p2 || 0;

  if (k1 === 0 && k2 === 0 && k3 === 0 && p1 === 0 && p2 === 0) {
    return {
      u: ud,
      v: vd,
      converged: true,
      iterations: 0,
      residualPx: 0,
      status: 'converged',
    };
  }

  const xd = (ud - u0) / scale;
  const yd = (vd - v0) / scale;

  let x = xd;
  let y = yd;

  let iter = 0;
  let stepPx = Infinity;

  while (iter < maxIterations) {
    iter++;
    const r2 = x * x + y * y;
    const r4 = r2 * r2;
    const r6 = r4 * r2;

    const radialFactor = 1.0 + k1 * r2 + k2 * r4 + k3 * r6;
    if (Math.abs(radialFactor) < 1e-12 || !Number.isFinite(radialFactor)) {
      return {
        u: NaN,
        v: NaN,
        converged: false,
        iterations: iter,
        residualPx: Infinity,
        status: 'diverged',
      };
    }

    const dxTan = 2 * p1 * x * y + p2 * (r2 + 2 * x * x);
    const dyTan = p1 * (r2 + 2 * y * y) + 2 * p2 * x * y;

    const xNext = (xd - dxTan) / radialFactor;
    const yNext = (yd - dyTan) / radialFactor;

    stepPx = Math.hypot((xNext - x) * scale, (yNext - y) * scale);

    x = xNext;
    y = yNext;

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return {
        u: NaN,
        v: NaN,
        converged: false,
        iterations: iter,
        residualPx: Infinity,
        status: 'diverged',
      };
    }

    if (stepPx < tolerancePx) {
      const uEst = u0 + x * scale;
      const vEst = v0 + y * scale;
      return {
        u: uEst,
        v: vEst,
        converged: true,
        iterations: iter,
        residualPx: stepPx,
        status: 'converged',
      };
    }
  }

  // Max iterations reached without meeting tolerance
  const uEst = u0 + x * scale;
  const vEst = v0 + y * scale;
  return {
    u: uEst,
    v: vEst,
    converged: false,
    iterations: iter,
    residualPx: stepPx,
    status: 'max_iterations_exceeded',
  };
}

/**
 * Backward-compatible helper for radial distortion forward mapping.
 */
export function applyRadialDistortion(
  u: number,
  v: number,
  u0: number,
  v0: number,
  k1: number,
  k2: number,
  scale: number = 1000
): { u: number; v: number } {
  return applyBrownConradyDistortion(u, v, u0, v0, { enabled: true, k1, k2 }, scale);
}

/**
 * Backward-compatible helper for radial distortion inverse mapping.
 */
export function undistortRadialPoint(
  ud: number,
  vd: number,
  u0: number,
  v0: number,
  k1: number,
  k2: number,
  scale: number = 1000,
  maxIterations: number = 15
): { u: number; v: number } {
  const res = undistortBrownConradyPoint(
    ud,
    vd,
    u0,
    v0,
    { enabled: true, k1, k2 },
    scale,
    maxIterations
  );
  return { u: res.u, v: res.v };
}

/**
 * Normalization for 3D world coordinates (Hartley similarity transformation).
 * Translates centroid to origin and scales average distance from origin to sqrt(3).
 */
export function normalizePoints3D(
  pts: { x: number; y: number; z: number }[]
): {
  normalized: { x: number; y: number; z: number }[];
  centroid: { x: number; y: number; z: number };
  scale: number;
} {
  const n = pts.length;
  let mx = 0, my = 0, mz = 0;
  for (const p of pts) {
    mx += p.x;
    my += p.y;
    mz += p.z;
  }
  mx /= n;
  my /= n;
  mz /= n;

  let totalDist = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dy = p.y - my;
    const dz = p.z - mz;
    totalDist += Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  const meanDist = totalDist / n;
  const scale = meanDist > 1e-12 ? Math.sqrt(3) / meanDist : 1.0;

  const normalized = pts.map((p) => ({
    x: (p.x - mx) * scale,
    y: (p.y - my) * scale,
    z: (p.z - mz) * scale,
  }));

  return {
    normalized,
    centroid: { x: mx, y: my, z: mz },
    scale,
  };
}

/**
 * Normalization for 2D image coordinates (Hartley similarity transformation).
 * Translates centroid to origin and scales average distance from origin to sqrt(2).
 */
export function normalizePoints2D(
  pts: { u: number; v: number }[]
): {
  normalized: { u: number; v: number }[];
  centroid: { u: number; v: number };
  scale: number;
} {
  const n = pts.length;
  let mu = 0, mv = 0;
  for (const p of pts) {
    mu += p.u;
    mv += p.v;
  }
  mu /= n;
  mv /= n;

  let totalDist = 0;
  for (const p of pts) {
    const du = p.u - mu;
    const dv = p.v - mv;
    totalDist += Math.sqrt(du * du + dv * dv);
  }
  const meanDist = totalDist / n;
  const scale = meanDist > 1e-12 ? Math.sqrt(2) / meanDist : 1.0;

  const normalized = pts.map((p) => ({
    u: (p.u - mu) * scale,
    v: (p.v - mv) * scale,
  }));

  return {
    normalized,
    centroid: { u: mu, v: mv },
    scale,
  };
}

/**
 * Thin Householder QR decomposition for an m x n matrix (m >= n, here 2N x 12).
 * Decomposes A into Q * R without forming normal equations A^T * A.
 * Returns the n x n upper triangular matrix R.
 */
export function householderQR(A: number[][]): number[][] {
  const m = A.length;
  const n = A[0].length;
  const R: number[][] = A.map((row) => [...row]);

  for (let k = 0; k < n; k++) {
    let normSq = 0;
    for (let i = k; i < m; i++) {
      normSq += R[i][k] * R[i][k];
    }
    const norm = Math.sqrt(normSq);
    if (norm < 1e-15) continue;

    const alpha = R[k][k] >= 0 ? -norm : norm;
    const v0 = R[k][k] - alpha;

    const v: number[] = new Array(m).fill(0);
    v[k] = v0;
    let vNormSq = v0 * v0;
    for (let i = k + 1; i < m; i++) {
      v[i] = R[i][k];
      vNormSq += R[i][k] * R[i][k];
    }

    if (vNormSq < 1e-18) continue;

    for (let j = k; j < n; j++) {
      let dot = 0;
      for (let i = k; i < m; i++) {
        dot += v[i] * R[i][j];
      }
      const tau = (2 * dot) / vNormSq;
      for (let i = k; i < m; i++) {
        R[i][j] -= tau * v[i];
      }
    }
  }

  // Extract top n x n triangular part
  const Rtop: number[][] = [];
  for (let i = 0; i < n; i++) {
    Rtop.push(R[i].slice(0, n));
    for (let j = 0; j < i; j++) {
      Rtop[i][j] = 0; // Ensure exact zero in lower triangle
    }
  }
  return Rtop;
}

/**
 * One-sided Jacobi Singular Value Decomposition (Hestenes method) on an n x n matrix R.
 * Computes singular values sigma_1 >= ... >= sigma_n and right singular vectors V.
 * Guarantees unconditional numerical stability with zero matrix inversion.
 */
export function jacobiSVD12(
  R: number[][]
): { singularValues: number[]; V: number[][] } {
  const n = R.length; // 12
  const W: number[][] = R.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
  );

  const maxSweeps = 35;
  const tol = 1e-15;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxOffDiagonal = 0;

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        // Dot products of column i and column j in W
        let a = 0;
        let b = 0;
        let c = 0;
        for (let r = 0; r < n; r++) {
          const wi = W[r][i];
          const wj = W[r][j];
          a += wi * wi;
          b += wj * wj;
          c += wi * wj;
        }

        const normProd = Math.sqrt(a * b);
        if (normProd < 1e-30) continue;

        const offDiag = Math.abs(c) / normProd;
        if (offDiag > maxOffDiagonal) maxOffDiagonal = offDiag;

        if (offDiag > tol) {
          const xi = (b - a) / (2 * c);
          const t = Math.sign(xi) / (Math.abs(xi) + Math.sqrt(1 + xi * xi));
          const cs = 1 / Math.sqrt(1 + t * t);
          const sn = t * cs;

          // Rotate columns in W
          for (let r = 0; r < n; r++) {
            const w1 = W[r][i];
            const w2 = W[r][j];
            W[r][i] = cs * w1 - sn * w2;
            W[r][j] = sn * w1 + cs * w2;
          }

          // Rotate columns in V
          for (let r = 0; r < n; r++) {
            const v1 = V[r][i];
            const v2 = V[r][j];
            V[r][i] = cs * v1 - sn * v2;
            V[r][j] = sn * v1 + cs * v2;
          }
        }
      }
    }

    if (maxOffDiagonal < tol) break;
  }

  // Singular values are column Euclidean norms of W
  const singularValuesWithIndices: { val: number; colIdx: number }[] = [];
  for (let j = 0; j < n; j++) {
    let sumSq = 0;
    for (let r = 0; r < n; r++) {
      sumSq += W[r][j] * W[r][j];
    }
    singularValuesWithIndices.push({ val: Math.sqrt(sumSq), colIdx: j });
  }

  // Sort singular values descending
  singularValuesWithIndices.sort((a, b) => b.val - a.val);

  const sortedSingularValues: number[] = [];
  const sortedV: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let j = 0; j < n; j++) {
    const { val, colIdx } = singularValuesWithIndices[j];
    sortedSingularValues.push(val);
    for (let r = 0; r < n; r++) {
      sortedV[r][j] = V[r][colIdx];
    }
  }

  return { singularValues: sortedSingularValues, V: sortedV };
}

/**
 * Solve homogeneous DLT system via Hartley-normalized Householder QR + Jacobi SVD.
 * Solves A * p approx 0 subject to ||p||_2 = 1.
 * Completely replaces normal equations A^T * A.
 */
export function solveNormalizedDLTWithSVD(
  trainPoints: CalibrationControlPoint3D[]
): {
  dlt: DLT11;
  kappaNonNull: number;
  nullSpaceSeparation: number;
  fullSpectralConditionNumber: number | null;
  conditionNumber: number;
  conditionEstimate: number;
  singularValues: number[];
  normalization: {
    centroid3D: { x: number; y: number; z: number };
    scale3D: number;
    centroid2D: { u: number; v: number };
    scale2D: number;
  };
} {
  const n = trainPoints.length;

  // 1. Point Normalization
  const norm3D = normalizePoints3D(trainPoints.map((p) => ({ x: p.x, y: p.y, z: p.z })));
  const norm2D = normalizePoints2D(trainPoints.map((p) => ({ u: p.u, v: p.v })));

  // 2. Build 2N x 12 Design Matrix A
  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    const X = norm3D.normalized[i].x;
    const Y = norm3D.normalized[i].y;
    const Z = norm3D.normalized[i].z;
    const u = norm2D.normalized[i].u;
    const v = norm2D.normalized[i].v;

    // Row 1: X, Y, Z, 1,  0, 0, 0, 0,  -uX, -uY, -uZ, -u
    A.push([
      X, Y, Z, 1,
      0, 0, 0, 0,
      -u * X, -u * Y, -u * Z, -u,
    ]);

    // Row 2: 0, 0, 0, 0,  X, Y, Z, 1,  -vX, -vY, -vZ, -v
    A.push([
      0, 0, 0, 0,
      X, Y, Z, 1,
      -v * X, -v * Y, -v * Z, -v,
    ]);
  }

  // 3. Thin Householder QR -> 12x12 upper triangular matrix R
  const R = householderQR(A);

  // QR-based condition estimate from diagonal
  let minDiag = Infinity;
  let maxDiag = 0;
  for (let i = 0; i < 11; i++) {
    const d = Math.abs(R[i][i]);
    if (d < minDiag) minDiag = d;
    if (d > maxDiag) maxDiag = d;
  }
  const conditionEstimate = minDiag > 1e-15 ? maxDiag / minDiag : Infinity;

  // 4. Jacobi SVD on 12x12 matrix R
  // (Since A = Q * R with orthonormal Q, singular values of A are identically the singular values of R)
  const { singularValues, V } = jacobiSVD12(R);

  // Singular-value metrics for homogeneous DLT (A * p approx 0, rank 11):
  // sigma_1 >= ... >= sigma_11 > sigma_12
  const sigmaMax = singularValues[0];
  const sigma11 = singularValues[10]; // 11th singular value (smallest non-null mode)
  const sigma12 = singularValues[11]; // 12th singular value (null-space solution mode)

  // A. Largest-to-smallest non-null singular-value ratio (rank-11 subspace conditioning):
  const kappaNonNull = sigma11 > 1e-15 ? sigmaMax / sigma11 : Infinity;

  // B. Null-space separation ratio (spectral gap):
  const nullSpaceSeparation = sigma12 > 1e-15 ? sigma11 / sigma12 : Infinity;

  // C. Full spectral condition number sigma_1 / sigma_12:
  // In ideal noiseless geometry, sigma_12 = 0 so this ratio is mathematically infinite/undefined.
  const fullSpectralConditionNumber = sigma12 > 1e-15 ? sigmaMax / sigma12 : null;

  // Backward compatibility alias for kappaNonNull
  const conditionNumber = kappaNonNull;

  // 5. Solution vector is the right singular vector corresponding to smallest singular value (column 11 of V)
  const pNorm: number[] = [];
  for (let r = 0; r < 12; r++) {
    pNorm.push(V[r][11]);
  }

  // Reshape into 3x4 normalized projection matrix P_tilde
  const Ptilde: number[][] = [
    [pNorm[0], pNorm[1], pNorm[2], pNorm[3]],
    [pNorm[4], pNorm[5], pNorm[6], pNorm[7]],
    [pNorm[8], pNorm[9], pNorm[10], pNorm[11]],
  ];

  // 6. Analytical Denormalization: P = T^-1 * P_tilde * U
  //
  // Where U = [s3D,   0,   0, -s3D*mx]
  //           [  0, s3D,   0, -s3D*my]
  //           [  0,   0, s3D, -s3D*mz]
  //           [  0,   0,   0,       1]
  //
  // And T^-1 = [1/s2D,     0, mu]
  //            [    0, 1/s2D, mv]
  //            [    0,     0,  1]

  const s3 = norm3D.scale;
  const mx = norm3D.centroid.x;
  const my = norm3D.centroid.y;
  const mz = norm3D.centroid.z;

  const s2 = norm2D.scale;
  const invS2 = 1.0 / s2;
  const mu = norm2D.centroid.u;
  const mv = norm2D.centroid.v;

  // M = P_tilde * U (3x4)
  const M: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let r = 0; r < 3; r++) {
    M[r][0] = Ptilde[r][0] * s3;
    M[r][1] = Ptilde[r][1] * s3;
    M[r][2] = Ptilde[r][2] * s3;
    M[r][3] =
      -Ptilde[r][0] * s3 * mx -
      Ptilde[r][1] * s3 * my -
      Ptilde[r][2] * s3 * mz +
      Ptilde[r][3];
  }

  // P = T^-1 * M (3x4)
  const P: number[][] = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ];

  for (let c = 0; c < 4; c++) {
    P[0][c] = invS2 * M[0][c] + mu * M[2][c];
    P[1][c] = invS2 * M[1][c] + mv * M[2][c];
    P[2][c] = M[2][c];
  }

  // Normalize by P[2][3] so that L_12 = 1.0
  let scaleFactor = P[2][3];
  if (Math.abs(scaleFactor) < 1e-12) {
    scaleFactor = 1.0;
  }

  const dlt: DLT11 = [
    P[0][0] / scaleFactor,
    P[0][1] / scaleFactor,
    P[0][2] / scaleFactor,
    P[0][3] / scaleFactor,
    P[1][0] / scaleFactor,
    P[1][1] / scaleFactor,
    P[1][2] / scaleFactor,
    P[1][3] / scaleFactor,
    P[2][0] / scaleFactor,
    P[2][1] / scaleFactor,
    P[2][2] / scaleFactor,
  ];

  return {
    dlt,
    kappaNonNull,
    nullSpaceSeparation,
    fullSpectralConditionNumber,
    conditionNumber,
    conditionEstimate,
    singularValues,
    normalization: {
      centroid3D: norm3D.centroid,
      scale3D: norm3D.scale,
      centroid2D: norm2D.centroid,
      scale2D: norm2D.scale,
    },
  };
}

/**
 * Solve Projective Direct Linear Transformation (11 parameters) from N >= 6 known 3D control points.
 *
 * Implements:
 * 1. Hartley Point Normalization (3D and 2D similarity transforms).
 * 2. Numerically stable Householder QR + Jacobi SVD on overdetermined 2N x 12 system.
 * 3. Analytical Denormalization.
 * 4. Exact spectral condition number kappa_2(A) = sigma_1 / sigma_11.
 * 5. Full geometric rank and coplanarity verification.
 * 6. Explicit training and hold-out cross-validation residual metrics (RMS, Max, Median).
 * 7. Parameterized Brown-Conrady lens distortion correction.
 */
export function calibrateDLTProjective(
  controlPoints: CalibrationControlPoint3D[],
  options?: {
    distortion?: LensDistortionParams;
    imageWidth?: number;
    imageHeight?: number;
    cameraId?: string;
  }
): EmpiricalCalibrationResult {
  // 1. Input Defensive Validation
  if (!controlPoints || !Array.isArray(controlPoints)) {
    throw new Error('Invalid input: control points must be a valid array.');
  }

  for (const pt of controlPoints) {
    if (
      !Number.isFinite(pt.x) ||
      !Number.isFinite(pt.y) ||
      !Number.isFinite(pt.z) ||
      !Number.isFinite(pt.u) ||
      !Number.isFinite(pt.v)
    ) {
      throw new Error(`Invalid input: control point "${pt.id}" contains non-finite coordinates.`);
    }
  }

  const trainPoints = controlPoints.filter((pt) => !pt.isValidation);
  const valPoints = controlPoints.filter((pt) => pt.isValidation);

  const n = trainPoints.length;
  if (n < 6) {
    throw new Error(
      `Insufficient points for 3D DLT calibration: requires at least 6 non-coplanar points, received ${n}.`
    );
  }

  // 2. 3D Spatial Geometry Spread Check
  let meanX = 0, meanY = 0, meanZ = 0;
  for (const pt of trainPoints) {
    meanX += pt.x;
    meanY += pt.y;
    meanZ += pt.z;
  }
  meanX /= n;
  meanY /= n;
  meanZ /= n;

  let covXX = 0, covYY = 0, covZZ = 0, covXY = 0, covXZ = 0, covYZ = 0;
  for (const pt of trainPoints) {
    const dx = pt.x - meanX;
    const dy = pt.y - meanY;
    const dz = pt.z - meanZ;
    covXX += dx * dx;
    covYY += dy * dy;
    covZZ += dz * dz;
    covXY += dx * dy;
    covXZ += dx * dz;
    covYZ += dy * dz;
  }

  const totalVariance = covXX + covYY + covZZ;
  if (totalVariance < 1e-7) {
    throw new Error('Degenerate calibration geometry: control points have near-zero spatial spread.');
  }

  // Check 3D planar rank deficiency (coplanarity determinant check)
  const det3D =
    covXX * (covYY * covZZ - covYZ * covYZ) -
    covXY * (covXY * covZZ - covXZ * covYZ) +
    covXZ * (covXY * covYZ - covXZ * covYY);

  if (Math.abs(det3D) < 1e-9) {
    throw new Error(
      'Degenerate calibration geometry: 3D control points are coplanar or collinear. 3D DLT calibration requires non-coplanar points.'
    );
  }

  // 3. Distortion Pre-Correction on Observations (if supplied)
  const distortion: LensDistortionParams = options?.distortion || { enabled: false, k1: 0, k2: 0 };
  const u0 = (options?.imageWidth || 640) / 2;
  const v0 = (options?.imageHeight || 480) / 2;

  const correctedTrainPoints = trainPoints.map((pt) => {
    let uObs = pt.u;
    let vObs = pt.v;
    if (distortion.enabled) {
      const undist = undistortBrownConradyPoint(uObs, vObs, u0, v0, distortion);
      if (undist.converged) {
        uObs = undist.u;
        vObs = undist.v;
      }
    }
    return { ...pt, u: uObs, v: vObs };
  });

  // 4. Solve Normalized DLT using SVD (No Normal Equations!)
  const {
    dlt,
    kappaNonNull,
    nullSpaceSeparation,
    fullSpectralConditionNumber,
    conditionNumber,
    conditionEstimate,
    singularValues,
    normalization,
  } = solveNormalizedDLTWithSVD(correctedTrainPoints);

  // Check conditioning
  if (!Number.isFinite(kappaNonNull) || kappaNonNull > 1e7) {
    throw new Error(
      `Ill-conditioned calibration geometry: non-null condition ratio is excessive (kappa_nonnull = ${kappaNonNull.toExponential(2)}). Ensure points span 3D space.`
    );
  }

  // 5. Evaluate Training Reprojection Residuals
  const trainResiduals: number[] = [];
  let trainSumSq = 0;
  let trainMax = 0;

  for (const pt of trainPoints) {
    const proj = project3DToDLT(pt.x, pt.y, pt.z, dlt);
    let uEst = proj.u;
    let vEst = proj.v;

    // Apply forward distortion to compare against observed distorted pixels
    if (distortion.enabled) {
      const dist = applyBrownConradyDistortion(uEst, vEst, u0, v0, distortion);
      uEst = dist.u;
      vEst = dist.v;
    }

    const err = Math.hypot(uEst - pt.u, vEst - pt.v);
    pt.residualPx = err;
    trainResiduals.push(err);
    trainSumSq += err * err;
    if (err > trainMax) trainMax = err;
  }

  trainResiduals.sort((a, b) => a - b);
  const trainRms = Math.sqrt(trainSumSq / Math.max(1, trainPoints.length));
  const trainMedian =
    trainResiduals.length % 2 === 1
      ? trainResiduals[Math.floor(trainResiduals.length / 2)]
      : (trainResiduals[trainResiduals.length / 2 - 1] + trainResiduals[trainResiduals.length / 2]) * 0.5;

  // 6. Evaluate Hold-Out Validation Reprojection Residuals
  let valRms: number | undefined;
  let valMax: number | undefined;
  let valMedian: number | undefined;

  if (valPoints.length > 0) {
    const valResiduals: number[] = [];
    let valSumSq = 0;
    valMax = 0;

    for (const pt of valPoints) {
      const proj = project3DToDLT(pt.x, pt.y, pt.z, dlt);
      let uEst = proj.u;
      let vEst = proj.v;

      if (distortion.enabled) {
        const dist = applyBrownConradyDistortion(uEst, vEst, u0, v0, distortion);
        uEst = dist.u;
        vEst = dist.v;
      }

      const err = Math.hypot(uEst - pt.u, vEst - pt.v);
      pt.residualPx = err;
      valResiduals.push(err);
      valSumSq += err * err;
      if (err > valMax) valMax = err;
    }

    valResiduals.sort((a, b) => a - b);
    valRms = Math.sqrt(valSumSq / valPoints.length);
    valMedian =
      valResiduals.length % 2 === 1
        ? valResiduals[Math.floor(valResiduals.length / 2)]
        : (valResiduals[valResiduals.length / 2 - 1] + valResiduals[valResiduals.length / 2]) * 0.5;
  }

  // 7. Structured Validity Determination
  let status: CalibrationStatus = 'successful';
  let statusMessage = 'Calibration successful and validated';
  let valid = true;

  if (trainRms > 15.0) {
    status = 'degenerate_geometry';
    valid = false;
    statusMessage = `Excessive training reprojection residual (${trainRms.toFixed(2)} px > 15.0 px)`;
  } else if (kappaNonNull > 1e5) {
    status = 'ill_conditioned';
    valid = false;
    statusMessage = `Marginally ill-conditioned geometry (kappa_nonnull = ${kappaNonNull.toExponential(2)})`;
  } else if (nullSpaceSeparation < 10) {
    status = 'rank_deficient';
    valid = false;
    statusMessage = `Weak null-space separation ratio (gamma = ${nullSpaceSeparation.toFixed(2)} < 10). Control points may be near-coplanar.`;
  }

  return {
    schemaVersion: '1.0',
    calibrationType: 'projective-dlt-11',
    cameraId: options?.cameraId || 'cam1',
    dlt,
    controlPointCount: trainPoints.length,
    validationPointCount: valPoints.length,
    trainingResidualRms: trainRms,
    trainingResidualMax: trainMax,
    trainingResidualMedian: trainMedian,
    validationResidualRms: valRms,
    validationResidualMax: valMax,
    validationResidualMedian: valMedian,
    kappaNonNull,
    nullSpaceSeparation,
    fullSpectralConditionNumber,
    conditionNumber,
    conditionEstimate,
    singularValues,
    status,
    statusMessage,
    valid,
    distortion,
    distortionMethod: distortion.enabled ? 'supplied_parameters' : 'none',
    normalization,
    points: [...trainPoints, ...valPoints].map((p) => ({ ...p })),
    timestamp: new Date().toISOString(),
  };
}
