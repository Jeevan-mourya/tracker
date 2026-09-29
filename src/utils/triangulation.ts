import { DLT11, PointStep, TriangulationConfig, TriangulationMethod, TemporalInterpMethod } from '../types';

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

/**
 * Convert physical elapsed time (seconds) to camera frame index
 */
export function timeToCameraFrame(
  timeSec: number,
  fps: number,
  timeOffsetSec: number = 0
): number {
  const effectiveTime = timeSec - timeOffsetSec;
  return Math.max(0, Math.round(effectiveTime * fps));
}

/**
 * Convert camera frame index to physical elapsed time (seconds)
 */
export function cameraFrameToTime(
  frame: number,
  fps: number,
  timeOffsetSec: number = 0
): number {
  return timeOffsetSec + frame / Math.max(1, fps);
}

/**
 * Compute the frame rate ratio and description between two cameras
 */
export function calculateMultiRateFrameRatio(
  fps1: number,
  fps2: number
): {
  ratioStr: string;
  ratioNumber: number;
  isIntegerRatio: boolean;
  cam1Faster: boolean;
} {
  const f1 = Math.max(1, fps1);
  const f2 = Math.max(1, fps2);
  const ratio = f1 / f2;
  const isInteger = Math.abs(ratio - Math.round(ratio)) < 1e-4;
  const invRatio = f2 / f1;
  const isInvInteger = Math.abs(invRatio - Math.round(invRatio)) < 1e-4;

  let ratioStr = '';
  if (Math.abs(ratio - 1) < 1e-4) {
    ratioStr = '1:1 (Synchronous)';
  } else if (isInteger) {
    ratioStr = `${Math.round(ratio)}:1`;
  } else if (isInvInteger) {
    ratioStr = `1:${Math.round(invRatio)}`;
  } else {
    ratioStr = `${ratio.toFixed(2)}:1`;
  }

  return {
    ratioStr,
    ratioNumber: ratio,
    isIntegerRatio: isInteger || isInvInteger,
    cam1Faster: f1 >= f2,
  };
}

export interface TemporalInterpolationResult {
  px: number;
  py: number;
  isExact: boolean;
  timeDelta: number; // discrepancy in seconds between target time and nearest keyframe
  closestFrame?: number;
}

/**
 * Sub-frame temporal interpolation of 2D pixel coordinates for a camera track.
 * Handles mismatched frame rates (e.g. 10,000 fps Cam 1 vs 5,000 fps Cam 2).
 */
export function interpolateCameraCoordinates(
  samples: { time: number; px: number; py: number; frame?: number }[],
  targetTime: number,
  method: TemporalInterpMethod = 'cubic-spline'
): TemporalInterpolationResult | null {
  if (!samples || samples.length === 0) return null;

  const sorted = [...samples].sort((a, b) => a.time - b.time);
  const n = sorted.length;

  // Exact match check (tolerance 1 microsecond)
  for (let i = 0; i < n; i++) {
    if (Math.abs(sorted[i].time - targetTime) <= 1e-6) {
      return {
        px: sorted[i].px,
        py: sorted[i].py,
        isExact: true,
        timeDelta: 0,
        closestFrame: sorted[i].frame,
      };
    }
  }

  // Single sample
  if (n === 1) {
    return {
      px: sorted[0].px,
      py: sorted[0].py,
      isExact: false,
      timeDelta: Math.abs(sorted[0].time - targetTime),
      closestFrame: sorted[0].frame,
    };
  }

  // Before first sample
  if (targetTime <= sorted[0].time) {
    const dt = sorted[1].time - sorted[0].time;
    const factor = (targetTime - sorted[0].time) / Math.max(1e-9, dt);
    return {
      px: sorted[0].px + factor * (sorted[1].px - sorted[0].px),
      py: sorted[0].py + factor * (sorted[1].py - sorted[0].py),
      isExact: false,
      timeDelta: sorted[0].time - targetTime,
      closestFrame: sorted[0].frame,
    };
  }

  // After last sample
  if (targetTime >= sorted[n - 1].time) {
    const dt = sorted[n - 1].time - sorted[n - 2].time;
    const factor = (targetTime - sorted[n - 1].time) / Math.max(1e-9, dt);
    return {
      px: sorted[n - 1].px + factor * (sorted[n - 1].px - sorted[n - 2].px),
      py: sorted[n - 1].py + factor * (sorted[n - 1].py - sorted[n - 2].py),
      isExact: false,
      timeDelta: targetTime - sorted[n - 1].time,
      closestFrame: sorted[n - 1].frame,
    };
  }

  // Find bracketing segment [idx, idx+1]
  let idx = 0;
  for (let i = 0; i < n - 1; i++) {
    if (targetTime >= sorted[i].time && targetTime <= sorted[i + 1].time) {
      idx = i;
      break;
    }
  }

  const p0 = sorted[idx];
  const p1 = sorted[idx + 1];
  const dt = p1.time - p0.time;
  if (dt <= 1e-12) {
    return {
      px: p0.px,
      py: p0.py,
      isExact: false,
      timeDelta: 0,
      closestFrame: p0.frame,
    };
  }

  const u = (targetTime - p0.time) / dt;
  const closest = u < 0.5 ? p0 : p1;
  const timeDelta = Math.min(Math.abs(targetTime - p0.time), Math.abs(targetTime - p1.time));

  if (method === 'nearest') {
    return {
      px: closest.px,
      py: closest.py,
      isExact: false,
      timeDelta,
      closestFrame: closest.frame,
    };
  }

  if (method === 'linear') {
    return {
      px: p0.px + u * (p1.px - p0.px),
      py: p0.py + u * (p1.py - p0.py),
      isExact: false,
      timeDelta,
      closestFrame: closest.frame,
    };
  }

  // Cubic Hermite / Catmull-Rom Spline Interpolation
  const pPrev = idx > 0 ? sorted[idx - 1] : p0;
  const pNext = idx + 2 < n ? sorted[idx + 2] : p1;

  // Tangents at p0 and p1
  const dt0 = idx > 0 ? p1.time - pPrev.time : dt;
  const dt1 = idx + 2 < n ? pNext.time - p0.time : dt;

  const m0x = dt0 > 0 ? (p1.px - pPrev.px) / dt0 : (p1.px - p0.px) / dt;
  const m0y = dt0 > 0 ? (p1.py - pPrev.py) / dt0 : (p1.py - p0.py) / dt;

  const m1x = dt1 > 0 ? (pNext.px - p0.px) / dt1 : (p1.px - p0.px) / dt;
  const m1y = dt1 > 0 ? (pNext.py - p0.py) / dt1 : (p1.py - p0.py) / dt;

  // Hermite basis functions
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;

  const interpX = h00 * p0.px + h10 * dt * m0x + h01 * p1.px + h11 * dt * m1x;
  const interpY = h00 * p0.py + h10 * dt * m0y + h01 * p1.py + h11 * dt * m1y;

  return {
    px: interpX,
    py: interpY,
    isExact: false,
    timeDelta,
    closestFrame: closest.frame,
  };
}

/**
 * Asynchronous 3D Triangulation with temporal interpolation and residual quantification
 */
export function triangulateAsynchronousDLT(
  targetTime: number,
  cam1Point: { px: number; py: number; time: number },
  cam2Samples: { time: number; px: number; py: number; frame?: number }[],
  dlt1: DLT11,
  dlt2: DLT11,
  interpMethod: TemporalInterpMethod = 'cubic-spline'
): {
  x: number;
  y: number;
  z: number;
  residual: number;
  isCam2Interpolated: boolean;
  temporalDeltaSeconds: number;
  cam2EstimatedPoint: { px: number; py: number };
} | null {
  const interp2 = interpolateCameraCoordinates(cam2Samples, targetTime, interpMethod);
  if (!interp2) return null;

  const tri = triangulateDLT(
    cam1Point.px,
    cam1Point.py,
    dlt1,
    interp2.px,
    interp2.py,
    dlt2
  );

  if (!tri) return null;

  return {
    x: tri.x,
    y: tri.y,
    z: tri.z,
    residual: tri.residual,
    isCam2Interpolated: !interp2.isExact,
    temporalDeltaSeconds: interp2.timeDelta,
    cam2EstimatedPoint: { px: interp2.px, py: interp2.py },
  };
}
