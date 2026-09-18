import { DLT11, PointStep, TriangulationConfig, TriangulationMethod } from '../types';

/**
 * Solve a 3x3 linear system M * x = b via Cramer's rule / Gaussian elimination
 */
export function solve3x3(M: number[][], b: number[]): [number, number, number] | null {
  const det =
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);

  if (Math.abs(det) < 1e-12) {
    return null; // Singular or degenerate matrix
  }

  const invDet = 1.0 / det;

  // Compute adjugate * b
  const c00 = M[1][1] * M[2][2] - M[1][2] * M[2][1];
  const c01 = -(M[1][0] * M[2][2] - M[1][2] * M[2][0]);
  const c02 = M[1][0] * M[2][1] - M[1][1] * M[2][0];

  const c10 = -(M[0][1] * M[2][2] - M[0][2] * M[2][1]);
  const c11 = M[0][0] * M[2][2] - M[0][2] * M[2][0];
  const c12 = -(M[0][0] * M[2][1] - M[0][1] * M[2][0]);

  const c20 = M[0][1] * M[1][2] - M[0][2] * M[1][1];
  const c21 = -(M[0][0] * M[1][2] - M[0][2] * M[1][0]);
  const c22 = M[0][0] * M[1][1] - M[0][1] * M[1][0];

  const x = invDet * (c00 * b[0] + c10 * b[1] + c20 * b[2]);
  const y = invDet * (c01 * b[0] + c11 * b[1] + c21 * b[2]);
  const z = invDet * (c02 * b[0] + c12 * b[1] + c22 * b[2]);

  return [x, y, z];
}

/**
 * Solve a least-squares overdetermined linear system A (4x3) * X (3x1) = B (4x1)
 * via normal equations: (A^T * A) * X = A^T * B
 */
export function solveLeastSquares4x3(A: number[][], B: number[]): [number, number, number] | null {
  // Compute AtA (3x3)
  const AtA: number[][] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum;
    }
  }

  // Compute AtB (3x1)
  const AtB: number[] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      sum += A[k][i] * B[k];
    }
    AtB[i] = sum;
  }

  return solve3x3(AtA, AtB);
}

/**
 * Project a 3D world point (X, Y, Z) in meters to 2D pixel coordinates (u, v) using DLT
 */
export function project3DToDLT(
  x: number,
  y: number,
  z: number,
  dlt: DLT11
): { u: number; v: number } {
  const denom = dlt[8] * x + dlt[9] * y + dlt[10] * z + 1.0;
  const safeDenom = Math.abs(denom) < 1e-9 ? 1.0 : denom;

  const u = (dlt[0] * x + dlt[1] * y + dlt[2] * z + dlt[3]) / safeDenom;
  const v = (dlt[4] * x + dlt[5] * y + dlt[6] * z + dlt[7]) / safeDenom;

  return { u, v };
}

/**
 * Triangulate a 3D point (X, Y, Z) in meters from 2 camera image coordinates (u1, v1) and (u2, v2)
 * using Direct Linear Transformation (DLT) matrices L1 and L2
 */
export function triangulateDLT(
  u1: number,
  v1: number,
  dlt1: DLT11,
  u2: number,
  v2: number,
  dlt2: DLT11
): { x: number; y: number; z: number; residual: number } | null {
  // Construct 4x3 matrix A and 4x1 vector B from the two cameras
  // Camera 1:
  // (L1,1 - u1*L1,9) X + (L1,2 - u1*L1,10) Y + (L1,3 - u1*L1,11) Z = u1 - L1,4
  // (L1,5 - v1*L1,9) X + (L1,6 - v1*L1,10) Y + (L1,7 - v1*L1,11) Z = v1 - L1,8
  // Camera 2:
  // (L2,1 - u2*L2,9) X + (L2,2 - u2*L2,10) Y + (L2,3 - u2*L2,11) Z = u2 - L2,4
  // (L2,5 - v2*L2,9) X + (L2,6 - v2*L2,10) Y + (L2,7 - v2*L2,11) Z = v2 - L2,8

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

  const solution = solveLeastSquares4x3(A, B);
  if (!solution) return null;

  const [x, y, z] = solution;

  // Calculate re-projection residual
  const p1 = project3DToDLT(x, y, z, dlt1);
  const p2 = project3DToDLT(x, y, z, dlt2);

  const res1 = Math.hypot(p1.u - u1, p1.v - v1);
  const res2 = Math.hypot(p2.u - u2, p2.v - v2);
  const residual = (res1 + res2) * 0.5;

  return { x, y, z, residual };
}

/**
 * Generate standard calibrated DLT coefficients for common camera configurations
 */
export function buildDefaultDLT(
  method: TriangulationMethod,
  scale1: number = 240, // pixels per meter Cam 1
  scale2: number = 240, // pixels per meter Cam 2
  origin1 = { x: 300, y: 350 },
  origin2 = { x: 300, y: 350 },
  baseline = 1.2,
  convergenceAngleDeg = 45
): { dltCam1: DLT11; dltCam2: DLT11 } {
  // In screen space:
  // u = origin.x + X_screen * scale
  // v = origin.y - Y_screen * scale (screen Y increases downward)

  if (method === 'orthogonal-front-side') {
    // Cam 1 (Front View): X is horizontal, Y is vertical. Z is depth towards camera.
    // u1 = origin1.x + scale1 * X
    // v1 = origin1.y - scale1 * Y
    const dltCam1: DLT11 = [
      scale1, 0, 0, origin1.x,
      0, -scale1, 0, origin1.y,
      0, 0, 0
    ];

    // Cam 2 (Side View 90 deg): Z is horizontal, Y is vertical. X is depth.
    // u2 = origin2.x + scale2 * Z
    // v2 = origin2.y - scale2 * Y
    const dltCam2: DLT11 = [
      0, 0, scale2, origin2.x,
      0, -scale2, 0, origin2.y,
      0, 0, 0
    ];

    return { dltCam1, dltCam2 };
  }

  if (method === 'orthogonal-front-top') {
    // Cam 1 (Front View): X is horizontal, Y is vertical.
    const dltCam1: DLT11 = [
      scale1, 0, 0, origin1.x,
      0, -scale1, 0, origin1.y,
      0, 0, 0
    ];

    // Cam 2 (Top/Overhead View): X is horizontal, Z is vertical downward.
    const dltCam2: DLT11 = [
      scale2, 0, 0, origin2.x,
      0, 0, scale2, origin2.y,
      0, 0, 0
    ];

    return { dltCam1, dltCam2 };
  }

  // Convergent Stereo (Angled Baseline)
  const rad = (convergenceAngleDeg * 0.5 * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Left camera rotated by +rad, right camera rotated by -rad
  const dltCam1: DLT11 = [
    scale1 * cos, 0, scale1 * sin, origin1.x - scale1 * (baseline * 0.5),
    0, -scale1, 0, origin1.y,
    0, 0, 0.05
  ];

  const dltCam2: DLT11 = [
    scale2 * cos, 0, -scale2 * sin, origin2.x + scale2 * (baseline * 0.5),
    0, -scale2, 0, origin2.y,
    0, 0, 0.05
  ];

  return { dltCam1, dltCam2 };
}

/**
 * Compute 3D kinematics (3D position, velocity, acceleration, speed, and energies)
 */
export function compute3DKinematics(
  steps: PointStep[],
  mass: number = 0.1,
  gravity: number = 9.81
): PointStep[] {
  if (steps.length === 0) return [];

  const sorted = [...steps].sort((a, b) => a.frame - b.frame);
  const n = sorted.length;
  const result: PointStep[] = sorted.map((s) => ({ ...s }));

  // Compute 3D velocities
  for (let i = 0; i < n; i++) {
    let vx: number | null = null;
    let vy: number | null = null;
    let vz: number | null = null;

    if (n === 1) {
      vx = 0;
      vy = 0;
      vz = 0;
    } else if (i === 0) {
      // Forward difference
      const dt = sorted[1].time - sorted[0].time;
      if (dt > 0) {
        vx = (sorted[1].x - sorted[0].x) / dt;
        vy = (sorted[1].y - sorted[0].y) / dt;
        vz = ((sorted[1].z ?? 0) - (sorted[0].z ?? 0)) / dt;
      }
    } else if (i === n - 1) {
      // Backward difference
      const dt = sorted[n - 1].time - sorted[n - 2].time;
      if (dt > 0) {
        vx = (sorted[n - 1].x - sorted[n - 2].x) / dt;
        vy = (sorted[n - 1].y - sorted[n - 2].y) / dt;
        vz = ((sorted[n - 1].z ?? 0) - (sorted[n - 2].z ?? 0)) / dt;
      }
    } else {
      // Central difference
      const dt = sorted[i + 1].time - sorted[i - 1].time;
      if (dt > 0) {
        vx = (sorted[i + 1].x - sorted[i - 1].x) / dt;
        vy = (sorted[i + 1].y - sorted[i - 1].y) / dt;
        vz = ((sorted[i + 1].z ?? 0) - (sorted[i - 1].z ?? 0)) / dt;
      }
    }

    result[i].vx = vx;
    result[i].vy = vy;
    result[i].vz = vz;

    if (vx !== null && vy !== null && vz !== null) {
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      result[i].v = speed;
      result[i].kineticEnergy = 0.5 * mass * speed * speed;
    } else {
      result[i].v = null;
      result[i].kineticEnergy = null;
    }

    result[i].potentialEnergy = mass * gravity * result[i].y;
    if (result[i].kineticEnergy !== null && result[i].kineticEnergy !== undefined) {
      result[i].totalEnergy = result[i].kineticEnergy! + result[i].potentialEnergy!;
    }
  }

  // Compute 3D accelerations
  for (let i = 0; i < n; i++) {
    let ax: number | null = null;
    let ay: number | null = null;
    let az: number | null = null;

    if (n < 3) {
      if (n === 2 && i === 1) {
        const dt = result[1].time - result[0].time;
        if (dt > 0 && result[1].vx !== null && result[0].vx !== null) {
          ax = (result[1].vx! - result[0].vx!) / dt;
          ay = (result[1].vy! - result[0].vy!) / dt;
          az = ((result[1].vz ?? 0) - (result[0].vz ?? 0)) / dt;
        }
      }
    } else if (i === 0) {
      const dt = result[1].time - result[0].time;
      if (dt > 0 && result[1].vx !== null && result[0].vx !== null) {
        ax = (result[1].vx! - result[0].vx!) / dt;
        ay = (result[1].vy! - result[0].vy!) / dt;
        az = ((result[1].vz ?? 0) - (result[0].vz ?? 0)) / dt;
      }
    } else if (i === n - 1) {
      const dt = result[n - 1].time - result[n - 2].time;
      if (dt > 0 && result[n - 1].vx !== null && result[n - 2].vx !== null) {
        ax = (result[n - 1].vx! - result[n - 2].vx!) / dt;
        ay = (result[n - 1].vy! - result[n - 2].vy!) / dt;
        az = ((result[n - 1].vz ?? 0) - (result[n - 2].vz ?? 0)) / dt;
      }
    } else {
      const dt = result[i + 1].time - result[i - 1].time;
      if (dt > 0 && result[i + 1].vx !== null && result[i - 1].vx !== null) {
        ax = (result[i + 1].vx! - result[i - 1].vx!) / dt;
        ay = (result[i + 1].vy! - result[i - 1].vy!) / dt;
        az = ((result[i + 1].vz ?? 0) - (result[i - 1].vz ?? 0)) / dt;
      }
    }

    result[i].ax = ax;
    result[i].ay = ay;
    result[i].az = az;

    if (ax !== null && ay !== null && az !== null) {
      result[i].a = Math.sqrt(ax * ax + ay * ay + az * az);
      result[i].gForce = result[i].a! / 9.80665;
    } else {
      result[i].a = null;
      result[i].gForce = null;
    }

    // Defense & Aerospace Trajectory Telemetry (TrackEye standard metrics)
    const x = result[i].x;
    const y = result[i].y;
    const z = result[i].z ?? 0;
    const groundRange = Math.sqrt(x * x + z * z);
    result[i].slantRange = Math.sqrt(x * x + y * y + z * z);
    result[i].azimuthDeg = (Math.atan2(z, x) * 180) / Math.PI;
    result[i].elevationDeg = (Math.atan2(y, Math.max(0.0001, groundRange)) * 180) / Math.PI;
    if (result[i].v !== null && result[i].v !== undefined) {
      result[i].machNumber = result[i].v! / 343.0; // standard sea-level sound speed
    }
  }

  return result;
}

export const computeKinematics3D = compute3DKinematics;
