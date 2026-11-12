/**
 * Defense-Grade Monocular & Stereo 6-DOF Store Separation Photogrammetry Engine
 * (TEMA / TrackEye / Xcitex ProAnalyst Architecture)
 *
 * Implements:
 * 1. Static 3D Rigid-Body Survey Import (Leica Laser Tracker ACS Data) partitioned into:
 *    - Group 'A': Aircraft Reference Rigid Body (A1–A6) for dynamic camera pose resection T_{C<-A}(t)
 *    - Group 'L': Launcher Rigid Body (L7–L14) for ejector rack / rail dynamics T_{C<-L}(t)
 *    - Group 'M': Missile / Store Rigid Body (M15–M29) for store 6-DOF trajectory T_{C<-M}(t)
 * 2. Brown-Conrady 2D Lens Undistortion & Forward Camera Projection with Intrinsics K
 * 3. EPnP / Normalized DLT + Planar Homography Initialization & Iterative Levenberg-Marquardt (LM)
 *    Non-Linear PnP Solver with Huber M-Estimator Weighting
 * 4. Kabsch / SVD 3D-to-3D Rigid-Body Pose Solver (for 3D Stereo mode)
 * 5. Homogeneous SE(3) Relative Kinematic Chain:
 *    - Missile wrt Launcher:  T_{L<-M}(t) = T_{C<-L}^{-1}(t) * T_{C<-M}(t)
 *    - Missile wrt Aircraft:  T_{A<-M}(t) = T_{C<-A}^{-1}(t) * T_{C<-M}(t)
 *    - Launcher wrt Aircraft: T_{A<-L}(t) = T_{C<-A}^{-1}(t) * T_{C<-L}(t)
 * 6. Aerospace ZYX Euler Angle Extraction (Roll φ, Pitch θ, Yaw ψ):
 *    θ = -asin(R_31), φ = atan2(R_32, R_33), ψ = atan2(R_21, R_11)
 */

import {
  ClearanceEnvelopeSummary,
  LensDistortionParams,
  PointStep,
  RelativeReferenceFrameMode,
  Track,
  VirtualPoint3D,
} from '../types';

export type RigidBodyGroupId = 'A' | 'L' | 'M';

export type Mat3 = [
  [number, number, number],
  [number, number, number],
  [number, number, number]
];

export type Vec3 = [number, number, number];

export type Mat6 = number[][]; // 6x6 covariance or Adjoint matrix in se(3) ordering [wx, wy, wz, tx, ty, tz]

export interface PoseUncertainty1Sigma {
  sigmaX: number; // 1-sigma translational uncertainty X (m)
  sigmaY: number; // 1-sigma translational uncertainty Y (m)
  sigmaZ: number; // 1-sigma translational uncertainty Z (m)
  sigmaRollDeg: number; // 1-sigma Roll uncertainty (deg)
  sigmaPitchDeg: number; // 1-sigma Pitch uncertainty (deg)
  sigmaYawDeg: number; // 1-sigma Yaw uncertainty (deg)
  sigmaRoll: number; // Alias for 1-sigma Roll uncertainty (deg)
  sigmaPitch: number; // Alias for 1-sigma Pitch uncertainty (deg)
  sigmaYaw: number; // Alias for 1-sigma Yaw uncertainty (deg)
  s0Px: number; // A-posteriori unit weight standard error s_0 (px)
}

export interface SurveyMarker3D {
  id: string; // e.g., 'A1', 'L7', 'M15'
  group: RigidBodyGroupId; // 'A' (Aircraft), 'L' (Launcher), 'M' (Missile/Store)
  x: number; // Aircraft Coordinate System (ACS) or Body X (meters)
  y: number; // ACS or Body Y (meters)
  z: number; // ACS or Body Z (meters)
  u_init?: number; // Optional initial pixel u in Camera 1
  v_init?: number; // Optional initial pixel v in Camera 1
  trackId?: string; // Optional linked 2D/3D Track ID
}

export interface CameraIntrinsicsK {
  fx: number; // Focal length X (pixels)
  fy: number; // Focal length Y (pixels)
  cx: number; // Principal point u0 (pixels)
  cy: number; // Principal point v0 (pixels)
  width: number; // Sensor width (pixels)
  height: number; // Sensor height (pixels)
  distortion: LensDistortionParams;
}

export interface SE3Pose {
  R: Mat3; // 3x3 proper orthogonal rotation matrix in SO(3), det(R) = +1
  t: Vec3; // 3x1 translation vector in meters
  rmsePx: number; // 2D RMS reprojection residual in pixels (or 3D residual in mm for Kabsch)
  maxErrorPx: number;
  inlierCount: number;
  iterations: number;
  valid: boolean;
  statusMessage?: string;
  covariance6x6?: Mat6; // 6x6 se(3) pose covariance matrix Sigma_xi = s_0^2 (J^T W J)^{-1}
  s0Px?: number; // A-posteriori standard error of unit weight sqrt(r^T W r / max(1, 2N - 6))
}

export interface AerospaceEulerZYX {
  rollDeg: number; // φ (rotation about X axis, deg)
  pitchDeg: number; // θ (rotation about Y axis, deg)
  yawDeg: number; // ψ (rotation about Z axis, deg)
  rollRad: number;
  pitchRad: number;
  yawRad: number;
}

export interface RigidBody6DoFState {
  pose: SE3Pose;
  referencePointPosition: Vec3; // Transformed CG or Virtual Point [X, Y, Z] in reference frame (meters)
  euler: AerospaceEulerZYX;
  uncertainty1Sigma?: PoseUncertainty1Sigma;
}

export interface Frame6DoFResult {
  frame: number;
  time: number;
  poseCamFromAircraft: SE3Pose | null; // T_{C<-A}(t)
  poseCamFromLauncher: SE3Pose | null; // T_{C<-L}(t)
  poseCamFromMissile: SE3Pose | null; // T_{C<-M}(t)
  relMissileWrtLauncher: RigidBody6DoFState | null; // T_{L<-M}(t)
  relMissileWrtAircraft: RigidBody6DoFState | null; // T_{A<-M}(t)
  relLauncherWrtAircraft: RigidBody6DoFState | null; // T_{A<-L}(t)
  camMissileState: RigidBody6DoFState | null; // T_{C<-M}(t) in camera/world frame
  markerCounts: { A: number; L: number; M: number };
  markerCountA: number;
  markerCountL: number;
  markerCountM: number;
  virtualPoints?: PointStep['virtualPoints'];
}

export interface Monocular6DoFConfig {
  intrinsics: CameraIntrinsicsK;
  markers: SurveyMarker3D[];
  missileCgBody: Vec3; // CG or Virtual Point in Missile Body/ACS coordinates [X, Y, Z]
  launcherRefBody: Vec3; // Reference origin on Launcher in ACS coordinates [X, Y, Z]
  aircraftRefBody: Vec3; // Reference origin on Aircraft in ACS coordinates [X, Y, Z]
  virtualPoints?: VirtualPoint3D[]; // Critical points rigidly attached to Missile frame
  huberDeltaPx: number; // Huber loss threshold in pixels (default 2.5 px)
  maxLmIterations: number; // Max Levenberg-Marquardt iterations per frame (default 50)
  useStaticAircraftIfUntracked: boolean; // Fallback to initial frame A pose if <3 A markers tracked
  useStaticLauncherIfUntracked: boolean; // Fallback to initial frame L pose if <3 L markers tracked
}

export const DEFAULT_VIRTUAL_POINTS: VirtualPoint3D[] = [
  { id: 'vp-cg', name: 'Missile CG', x: 0.0, y: 0.0, z: 0.0 },
  { id: 'vp-nose', name: 'Nose Tip', x: 1.85, y: 0.0, z: 0.0 },
  { id: 'vp-fin-upper', name: 'Aft Upper Fin Tip', x: -1.45, y: 0.28, z: 0.0 },
  { id: 'vp-tail', name: 'Tail Boattail', x: -1.60, y: 0.0, z: 0.0 },
];

export const DEFAULT_CAMERA_INTRINSICS: CameraIntrinsicsK = {
  fx: 1850.0,
  fy: 1850.0,
  cx: 640.0,
  cy: 360.0,
  width: 1280,
  height: 720,
  distortion: {
    enabled: false,
    k1: 0,
    k2: 0,
    k3: 0,
    p1: 0,
    p2: 0,
  },
};

export const DEFAULT_6DOF_INTRINSICS = DEFAULT_CAMERA_INTRINSICS;

// ============================================================================
// 1. LINEAR ALGEBRA & LIE GROUP SO(3) / SE(3) UTILITIES
// ============================================================================

export function identityMat3(): Mat3 {
  return [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];
}

export function mat3Mul(A: Mat3, B: Mat3): Mat3 {
  const C: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      C[i][j] = A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j];
    }
  }
  return C;
}

export function mat3Transpose(R: Mat3): Mat3 {
  return [
    [R[0][0], R[1][0], R[2][0]],
    [R[0][1], R[1][1], R[2][1]],
    [R[0][2], R[1][2], R[2][2]],
  ];
}

export function mat3VecMul(R: Mat3, v: Vec3): Vec3 {
  return [
    R[0][0] * v[0] + R[0][1] * v[1] + R[0][2] * v[2],
    R[1][0] * v[0] + R[1][1] * v[1] + R[1][2] * v[2],
    R[2][0] * v[0] + R[2][1] * v[1] + R[2][2] * v[2],
  ];
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function vec3Scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function vec3Norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function mat3Det(M: Mat3): number {
  return (
    M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) -
    M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) +
    M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0])
  );
}

/**
 * Exponential map exp([ω]_x) from so(3) axis-angle vector ω = [wx, wy, wz] to SO(3) rotation matrix
 * via Rodrigues' rotation formula.
 */
export function rodriguesToMatrix(omega: Vec3): Mat3 {
  const theta = Math.hypot(omega[0], omega[1], omega[2]);
  if (theta < 1e-12) {
    return [
      [1, -omega[2], omega[1]],
      [omega[2], 1, -omega[0]],
      [-omega[1], omega[0], 1],
    ];
  }
  const kx = omega[0] / theta;
  const ky = omega[1] / theta;
  const kz = omega[2] / theta;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const v = 1 - c;

  return [
    [kx * kx * v + c, kx * ky * v - kz * s, kx * kz * v + ky * s],
    [ky * kx * v + kz * s, ky * ky * v + c, ky * kz * v - kx * s],
    [kz * kx * v - ky * s, kz * ky * v + kx * s, kz * kz * v + c],
  ];
}

/**
 * Logarithmic map log(R) from SO(3) rotation matrix to so(3) axis-angle vector ω.
 */
export function matrixToRodrigues(R: Mat3): Vec3 {
  const trace = R[0][0] + R[1][1] + R[2][2];
  const cosTheta = Math.max(-1, Math.min(1, (trace - 1) * 0.5));
  const theta = Math.acos(cosTheta);

  if (theta < 1e-8) {
    return [
      0.5 * (R[2][1] - R[1][2]),
      0.5 * (R[0][2] - R[2][0]),
      0.5 * (R[1][0] - R[0][1]),
    ];
  }

  const sinTheta = Math.sin(theta);
  if (Math.abs(sinTheta) > 1e-5) {
    const factor = theta / (2 * sinTheta);
    return [
      (R[2][1] - R[1][2]) * factor,
      (R[0][2] - R[2][0]) * factor,
      (R[1][0] - R[0][1]) * factor,
    ];
  }

  // Near θ = π
  const diag: Vec3 = [
    Math.sqrt(Math.max(0, (R[0][0] + 1) * 0.5)),
    Math.sqrt(Math.max(0, (R[1][1] + 1) * 0.5)),
    Math.sqrt(Math.max(0, (R[2][2] + 1) * 0.5)),
  ];
  if (R[0][1] < 0) diag[1] = -diag[1];
  if (R[0][2] < 0) diag[2] = -diag[2];
  return [diag[0] * theta, diag[1] * theta, diag[2] * theta];
}

/**
 * Projects any 3x3 matrix M onto the nearest proper orthogonal matrix R in SO(3)
 * using polar decomposition / Jacobi SVD so that R^T R = I and det(R) = +1.
 */
export function projectToSO3(M: Mat3): Mat3 {
  // Iterative polar decomposition M_{k+1} = 0.5 * (M_k + M_k^{-T})
  let Q: Mat3 = [
    [M[0][0], M[0][1], M[0][2]],
    [M[1][0], M[1][1], M[1][2]],
    [M[2][0], M[2][1], M[2][2]],
  ];

  // Normalize columns first for numerical stability
  for (let col = 0; col < 3; col++) {
    const n = Math.hypot(Q[0][col], Q[1][col], Q[2][col]);
    if (n > 1e-12) {
      Q[0][col] /= n;
      Q[1][col] /= n;
      Q[2][col] /= n;
    }
  }

  for (let iter = 0; iter < 15; iter++) {
    const det = mat3Det(Q);
    if (Math.abs(det) < 1e-12) break;
    const invT: Mat3 = [
      [
        (Q[1][1] * Q[2][2] - Q[1][2] * Q[2][1]) / det,
        (Q[1][2] * Q[2][0] - Q[1][0] * Q[2][2]) / det,
        (Q[1][0] * Q[2][1] - Q[1][1] * Q[2][0]) / det,
      ],
      [
        (Q[0][2] * Q[2][1] - Q[0][1] * Q[2][2]) / det,
        (Q[0][0] * Q[2][2] - Q[0][2] * Q[2][0]) / det,
        (Q[0][1] * Q[2][0] - Q[0][0] * Q[2][1]) / det,
      ],
      [
        (Q[0][1] * Q[1][2] - Q[0][2] * Q[1][1]) / det,
        (Q[0][2] * Q[1][0] - Q[0][0] * Q[1][2]) / det,
        (Q[0][0] * Q[1][1] - Q[0][1] * Q[1][0]) / det,
      ],
    ];

    let diff = 0;
    const next: Mat3 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        next[r][c] = 0.5 * (Q[r][c] + invT[r][c]);
        diff += Math.abs(next[r][c] - Q[r][c]);
      }
    }
    Q = next;
    if (diff < 1e-12) break;
  }

  // Enforce right-handedness det(Q) = +1
  if (mat3Det(Q) < 0) {
    Q[0][2] = -Q[0][2];
    Q[1][2] = -Q[1][2];
    Q[2][2] = -Q[2][2];
  }

  // Final Gram-Schmidt polish to guarantee machine-precision orthogonality
  const c0: Vec3 = [Q[0][0], Q[1][0], Q[2][0]];
  const n0 = vec3Norm(c0) || 1;
  const u0: Vec3 = [c0[0] / n0, c0[1] / n0, c0[2] / n0];

  const c1: Vec3 = [Q[0][1], Q[1][1], Q[2][1]];
  const dot01 = vec3Dot(c1, u0);
  const v1: Vec3 = [c1[0] - dot01 * u0[0], c1[1] - dot01 * u0[1], c1[2] - dot01 * u0[2]];
  const n1 = vec3Norm(v1) || 1;
  const u1: Vec3 = [v1[0] / n1, v1[1] / n1, v1[2] / n1];

  const u2 = vec3Cross(u0, u1);

  return [
    [u0[0], u1[0], u2[0]],
    [u0[1], u1[1], u2[1]],
    [u0[2], u1[2], u2[2]],
  ];
}

/**
 * Inverts a 6x6 symmetric positive-definite normal matrix H = J^T W J via Gauss-Jordan elimination
 * with Tikhonov regularization for near-degenerate marker configurations.
 */
export function invertMat6(H: Mat6, regEps = 1e-8): Mat6 {
  const n = 6;
  const aug: number[][] = Array.from({ length: n }, (_, r) => {
    const row = new Array(2 * n).fill(0);
    for (let c = 0; c < n; c++) {
      row[c] = (H[r]?.[c] ?? 0) + (r === c ? regEps : 0);
    }
    row[n + r] = 1;
    return row;
  });

  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(aug[r][col]) > Math.abs(aug[pivot][col])) pivot = r;
    }
    if (pivot !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivot];
      aug[pivot] = tmp;
    }
    const diag = Math.abs(aug[col][col]) > 1e-14 ? aug[col][col] : 1e-14;
    for (let j = 0; j < 2 * n; j++) aug[col][j] /= diag;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = aug[r][col];
      for (let j = 0; j < 2 * n; j++) aug[r][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row.slice(n, 2 * n));
}

/**
 * Constructs the 6x6 Lie Group Adjoint matrix Ad(T) for T = [R | t] with left-perturbed tangent ordering [ω, t]:
 *   Ad(T) = [ R       0 ]
 *           [ [t]_x R R ]
 */
export function adjointSE3(pose: { R: Mat3; t: Vec3 }): Mat6 {
  const { R, t } = pose;
  const skewT: Mat3 = [
    [0, -t[2], t[1]],
    [t[2], 0, -t[0]],
    [-t[1], t[0], 0],
  ];
  const tR = mat3Mul(skewT, R);
  const Ad: Mat6 = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      Ad[r][c] = R[r][c];
      Ad[r + 3][c] = tR[r][c];
      Ad[r + 3][c + 3] = R[r][c];
    }
  }
  return Ad;
}

/**
 * Computes A * B * A^T for 6x6 matrices.
 */
function sandwichMat6(A: Mat6, B: Mat6): Mat6 {
  const AB: Mat6 = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += A[i][k] * B[k][j];
      AB[i][j] = s;
    }
  }
  const out: Mat6 = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      let s = 0;
      for (let k = 0; k < 6; k++) s += AB[i][k] * A[j][k];
      out[i][j] = s;
    }
  }
  return out;
}

/**
 * Evaluates 1-sigma translational (m) and angular (deg) uncertainties at body point P^body
 * from a 6x6 se(3) pose covariance matrix Sigma_xi.
 */
export function extractPointAndEulerUncertainty(
  cov6x6: Mat6 | undefined,
  R_rel: Mat3,
  bodyPoint: Vec3,
  s0Px = 0
): PoseUncertainty1Sigma | undefined {
  if (!cov6x6 || cov6x6.length < 6) return undefined;

  const rotPt = mat3VecMul(R_rel, bodyPoint);
  // Point position perturbation δp = -[R P^body]_x δω + δt => J_pt = [ -[R P^body]_x | I_3 ] (3x6)
  const J_pt: number[][] = [
    [0, rotPt[2], -rotPt[1], 1, 0, 0],
    [-rotPt[2], 0, rotPt[0], 0, 1, 0],
    [rotPt[1], -rotPt[0], 0, 0, 0, 1],
  ];

  const varPos = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    let sum = 0;
    for (let a = 0; a < 6; a++) {
      for (let b = 0; b < 6; b++) {
        sum += J_pt[i][a] * cov6x6[a][b] * J_pt[i][b];
      }
    }
    varPos[i] = Math.max(0, sum);
  }

  const rad2deg = 180 / Math.PI;
  const sRoll = Math.sqrt(Math.max(0, cov6x6[0][0])) * rad2deg;
  const sPitch = Math.sqrt(Math.max(0, cov6x6[1][1])) * rad2deg;
  const sYaw = Math.sqrt(Math.max(0, cov6x6[2][2])) * rad2deg;
  return {
    sigmaX: Math.sqrt(varPos[0]),
    sigmaY: Math.sqrt(varPos[1]),
    sigmaZ: Math.sqrt(varPos[2]),
    sigmaRollDeg: sRoll,
    sigmaPitchDeg: sPitch,
    sigmaYawDeg: sYaw,
    sigmaRoll: sRoll,
    sigmaPitch: sPitch,
    sigmaYaw: sYaw,
    s0Px,
  };
}

/**
 * Inverts a homogeneous SE(3) transformation T = [R | t]:
 *   T^{-1} = [R^T | -R^T * t]
 * and propagates its 6x6 covariance via Ad(T^{-1}).
 */
export function invertSE3(pose: SE3Pose): SE3Pose {
  const Rt = mat3Transpose(pose.R);
  const Rt_t = mat3VecMul(Rt, pose.t);
  const invPose: SE3Pose = {
    R: Rt,
    t: [-Rt_t[0], -Rt_t[1], -Rt_t[2]],
    rmsePx: pose.rmsePx,
    maxErrorPx: pose.maxErrorPx,
    inlierCount: pose.inlierCount,
    iterations: pose.iterations,
    valid: pose.valid,
    s0Px: pose.s0Px,
  };
  if (pose.covariance6x6) {
    const AdInv = adjointSE3(invPose);
    invPose.covariance6x6 = sandwichMat6(AdInv, pose.covariance6x6);
  }
  return invPose;
}

/**
 * Multiplies two SE(3) transformations:
 *   T_{A<-C} = T_{A<-B} * T_{B<-C} = [R_1 R_2 | R_1 t_2 + t_1]
 * and propagates their 6x6 covariances via Ad(T_1):
 *   Sigma_{12} = Sigma_1 + Ad(T_1) * Sigma_2 * Ad(T_1)^T
 */
export function multiplySE3(pose1: SE3Pose, pose2: SE3Pose): SE3Pose {
  const R = mat3Mul(pose1.R, pose2.R);
  const Rt2 = mat3VecMul(pose1.R, pose2.t);
  const t: Vec3 = [Rt2[0] + pose1.t[0], Rt2[1] + pose1.t[1], Rt2[2] + pose1.t[2]];

  let covariance6x6: Mat6 | undefined;
  if (pose1.covariance6x6 && pose2.covariance6x6) {
    const Ad1 = adjointSE3(pose1);
    const prop2 = sandwichMat6(Ad1, pose2.covariance6x6);
    covariance6x6 = Array.from({ length: 6 }, (_, r) =>
      Array.from({ length: 6 }, (__, c) => pose1.covariance6x6![r][c] + prop2[r][c])
    );
  } else if (pose2.covariance6x6) {
    const Ad1 = adjointSE3(pose1);
    covariance6x6 = sandwichMat6(Ad1, pose2.covariance6x6);
  } else if (pose1.covariance6x6) {
    covariance6x6 = pose1.covariance6x6;
  }

  return {
    R,
    t,
    rmsePx: Math.hypot(pose1.rmsePx, pose2.rmsePx),
    maxErrorPx: Math.max(pose1.maxErrorPx, pose2.maxErrorPx),
    inlierCount: Math.min(pose1.inlierCount, pose2.inlierCount),
    iterations: pose1.iterations + pose2.iterations,
    valid: pose1.valid && pose2.valid,
    covariance6x6,
    s0Px: Math.hypot(pose1.s0Px ?? 0, pose2.s0Px ?? 0),
  };
}

/**
 * Computes the relative SE(3) transformation of a Target body with respect to a Reference body,
 * cancelling dynamic camera shake and wing/mount vibration:
 *   T_{Ref <- Target}(t) = T_{C <- Ref}^{-1}(t) * T_{C <- Target}(t)
 */
export function computeRelativeSE3(
  poseCamFromRef: SE3Pose,
  poseCamFromTarget: SE3Pose
): SE3Pose {
  const poseRefFromCam = invertSE3(poseCamFromRef);
  return multiplySE3(poseRefFromCam, poseCamFromTarget);
}

/**
 * Extracts Aerospace ZYX Euler angles (Roll φ about X, Pitch θ about Y, Yaw ψ about Z)
 * from a 3x3 rotation matrix R:
 *   θ = -asin(R_{31})
 *   φ = atan2(R_{32}, R_{33})
 *   ψ = atan2(R_{21}, R_{11})
 */
export function extractAerospaceEulerZYX(R: Mat3): AerospaceEulerZYX {
  const r31 = Math.max(-1, Math.min(1, R[2][0]));
  const pitchRad = -Math.asin(r31);
  const cosPitch = Math.cos(pitchRad);

  let rollRad = 0;
  let yawRad = 0;

  if (Math.abs(cosPitch) > 1e-6) {
    rollRad = Math.atan2(R[2][1], R[2][2]);
    yawRad = Math.atan2(R[1][0], R[0][0]);
  } else {
    // Gimbal lock fallback (pitch = ±90°)
    rollRad = 0;
    yawRad = Math.atan2(-R[0][1], R[1][1]);
  }

  const rad2deg = 180 / Math.PI;
  const cleanZero = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v);

  return {
    rollDeg: cleanZero(rollRad * rad2deg),
    pitchDeg: cleanZero(pitchRad * rad2deg),
    yawDeg: cleanZero(yawRad * rad2deg),
    rollRad: cleanZero(rollRad),
    pitchRad: cleanZero(pitchRad),
    yawRad: cleanZero(yawRad),
  };
}

/**
 * Synthesizes a 3x3 rotation matrix R from Aerospace ZYX Euler angles (in degrees):
 *   R = R_z(ψ) * R_y(θ) * R_x(φ)
 */
export function eulerZYXToMatrix(rollDeg: number, pitchDeg: number, yawDeg: number): Mat3 {
  const deg2rad = Math.PI / 180;
  const phi = rollDeg * deg2rad;
  const theta = pitchDeg * deg2rad;
  const psi = yawDeg * deg2rad;

  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const cy = Math.cos(psi);
  const sy = Math.sin(psi);

  return [
    [cy * ct, cy * st * sp - sy * cp, cy * st * cp + sy * sp],
    [sy * ct, sy * st * sp + cy * cp, sy * st * cp - cy * sp],
    [-st, ct * sp, ct * cp],
  ];
}

// ============================================================================
// 2. CAMERA INTRINSICS & BROWN-CONRADY LENS DISTORTION / UNDISTORTION
// ============================================================================

/**
 * Forward projects a 3D point in body/ACS coordinates through pose [R | t] and
 * camera intrinsics K + Brown-Conrady distortion into 2D pixel coordinates (u, v).
 */
export function projectPoint3DToPixel(
  point3D: Vec3,
  R: Mat3,
  t: Vec3,
  K: CameraIntrinsicsK
): { u: number; v: number; zCam: number } {
  const Pc = vec3Add(mat3VecMul(R, point3D), t);
  const zCam = Pc[2];
  const invZ = Math.abs(zCam) > 1e-9 ? 1 / zCam : 1e9;
  const xn = Pc[0] * invZ;
  const yn = Pc[1] * invZ;

  let xd = xn;
  let yd = yn;

  if (K.distortion && K.distortion.enabled) {
    const k1 = K.distortion.k1 || 0;
    const k2 = K.distortion.k2 || 0;
    const k3 = K.distortion.k3 || 0;
    const p1 = K.distortion.p1 || 0;
    const p2 = K.distortion.p2 || 0;

    const r2 = xn * xn + yn * yn;
    const r4 = r2 * r2;
    const r6 = r4 * r2;
    const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;

    const dxTangential = 2 * p1 * xn * yn + p2 * (r2 + 2 * xn * xn);
    const dyTangential = p1 * (r2 + 2 * yn * yn) + 2 * p2 * xn * yn;

    xd = xn * radial + dxTangential;
    yd = yn * radial + dyTangential;
  }

  return {
    u: K.fx * xd + K.cx,
    v: K.fy * yd + K.cy,
    zCam,
  };
}

/**
 * Undistorts an observed 2D pixel (u, v) into normalized camera plane coordinates (x_n, y_n)
 * by inverting K and solving the inverse Brown-Conrady model via 2D Newton-Raphson iteration.
 */
export function undistortPixelToNormalized(
  u: number,
  v: number,
  K: CameraIntrinsicsK
): { xn: number; yn: number } {
  const xd = (u - K.cx) / K.fx;
  const yd = (v - K.cy) / K.fy;

  if (!K.distortion || !K.distortion.enabled) {
    return { xn: xd, yn: yd };
  }

  const k1 = K.distortion.k1 || 0;
  const k2 = K.distortion.k2 || 0;
  const k3 = K.distortion.k3 || 0;
  const p1 = K.distortion.p1 || 0;
  const p2 = K.distortion.p2 || 0;

  if (
    Math.abs(k1) < 1e-14 &&
    Math.abs(k2) < 1e-14 &&
    Math.abs(k3) < 1e-14 &&
    Math.abs(p1) < 1e-14 &&
    Math.abs(p2) < 1e-14
  ) {
    return { xn: xd, yn: yd };
  }

  let x = xd;
  let y = yd;

  for (let iter = 0; iter < 15; iter++) {
    const r2 = x * x + y * y;
    const r4 = r2 * r2;
    const r6 = r4 * r2;
    const radial = 1 + k1 * r2 + k2 * r4 + k3 * r6;

    const fx = x * radial + 2 * p1 * x * y + p2 * (r2 + 2 * x * x) - xd;
    const fy = y * radial + p1 * (r2 + 2 * y * y) + 2 * p2 * x * y - yd;

    if (Math.hypot(fx, fy) < 1e-13) break;

    const dRadialDr2 = k1 + 2 * k2 * r2 + 3 * k3 * r4;
    const j11 = radial + 2 * x * x * dRadialDr2 + 2 * p1 * y + 6 * p2 * x;
    const j12 = 2 * x * y * dRadialDr2 + 2 * p1 * x + 2 * p2 * y;
    const j21 = 2 * x * y * dRadialDr2 + 2 * p1 * x + 2 * p2 * y;
    const j22 = radial + 2 * y * y * dRadialDr2 + 6 * p1 * y + 2 * p2 * x;

    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-12) break;

    x -= (j22 * fx - j12 * fy) / det;
    y -= (-j21 * fx + j11 * fy) / det;
  }

  return { xn: x, yn: y };
}

// ============================================================================
// 3. KABSCH / UMEYAMA 3D-TO-3D RIGID-BODY SOLVER & PnP INITIALIZATION
// ============================================================================

/**
 * Solves for the optimal 3D rigid-body transformation [R | t] in SE(3) that aligns
 * sourcePoints3D (P_i^body) to targetPoints3D (P_i^world) minimizing sum ||R P_i^body + t - P_i^world||^2.
 * Used both inside EPnP control-point alignment and for 3D Stereo Rigid-Body 6-DOF solving.
 */
export function solveKabschRigidBody3D(
  sourcePoints: Vec3[],
  targetPoints: Vec3[]
): SE3Pose {
  const n = Math.min(sourcePoints.length, targetPoints.length);
  if (n < 3) {
    return {
      R: identityMat3(),
      t: [0, 0, 0],
      rmsePx: 0,
      maxErrorPx: 0,
      inlierCount: n,
      iterations: 0,
      valid: false,
      statusMessage: 'At least 3 non-collinear 3D markers are required.',
    };
  }

  // Compute centroids
  let cSrc: Vec3 = [0, 0, 0];
  let cDst: Vec3 = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    cSrc = vec3Add(cSrc, sourcePoints[i]);
    cDst = vec3Add(cDst, targetPoints[i]);
  }
  cSrc = vec3Scale(cSrc, 1 / n);
  cDst = vec3Scale(cDst, 1 / n);

  // Build 3x3 cross-covariance matrix H = sum (dst_i - cDst) * (src_i - cSrc)^T
  const H: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < n; i++) {
    const p = vec3Sub(sourcePoints[i], cSrc);
    const q = vec3Sub(targetPoints[i], cDst);
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        H[r][c] += q[r] * p[c];
      }
    }
  }

  // Add tiny regularization along principal axes in case markers are coplanar
  const traceH = Math.abs(H[0][0]) + Math.abs(H[1][1]) + Math.abs(H[2][2]) + 1e-6;
  const detH = Math.abs(mat3Det(H));

  // If coplanar (rank 2, det(H) near 0), construct the 3rd normal axis explicitly from cross products
  if (detH < 1e-5 * traceH * traceH * traceH) {
    H[0][0] += 1e-9 * traceH;
    H[1][1] += 1e-9 * traceH;
    H[2][2] += 1e-9 * traceH;

    const p0 = vec3Sub(sourcePoints[1], sourcePoints[0]);
    let normalSrc: Vec3 = [0, 0, 0];
    let normalDst: Vec3 = [0, 0, 0];
    for (let i = 2; i < n; i++) {
      const pi = vec3Sub(sourcePoints[i], sourcePoints[0]);
      const crS = vec3Cross(p0, pi);
      if (vec3Norm(crS) > vec3Norm(normalSrc)) {
        normalSrc = crS;
        const q0 = vec3Sub(targetPoints[1], targetPoints[0]);
        const qi = vec3Sub(targetPoints[i], targetPoints[0]);
        normalDst = vec3Cross(q0, qi);
      }
    }
    const nSrcLen = vec3Norm(normalSrc);
    const nDstLen = vec3Norm(normalDst);
    if (nSrcLen > 1e-7 && nDstLen > 1e-7) {
      const uS = vec3Scale(normalSrc, 1 / nSrcLen);
      const uD = vec3Scale(normalDst, 1 / nDstLen);
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          H[r][c] += 0.1 * traceH * uD[r] * uS[c];
        }
      }
    }
  }

  const R = projectToSO3(H);
  const t = vec3Sub(cDst, mat3VecMul(R, cSrc));

  let sumSq = 0;
  let maxErr = 0;
  for (let i = 0; i < n; i++) {
    const pred = vec3Add(mat3VecMul(R, sourcePoints[i]), t);
    const err = vec3Norm(vec3Sub(pred, targetPoints[i])) * 1000; // in mm
    sumSq += err * err;
    if (err > maxErr) maxErr = err;
  }

  return {
    R,
    t,
    rmsePx: Math.sqrt(sumSq / n),
    maxErrorPx: maxErr,
    inlierCount: n,
    iterations: 1,
    valid: true,
  };
}

/**
 * Solves a general linear system A * x = b using Gaussian elimination with partial pivoting.
 */
function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, idx) => [...row, b[idx]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let maxVal = Math.abs(M[col][col]);
    for (let row = col + 1; row < n; row++) {
      const v = Math.abs(M[row][col]);
      if (v > maxVal) {
        maxVal = v;
        pivotRow = row;
      }
    }
    if (maxVal < 1e-14) return null;

    if (pivotRow !== col) {
      const tmp = M[col];
      M[col] = M[pivotRow];
      M[pivotRow] = tmp;
    }

    const pivot = M[col][col];
    for (let j = col; j <= n; j++) {
      M[col][j] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = M[row][col];
      if (Math.abs(factor) < 1e-15) continue;
      for (let j = col; j <= n; j++) {
        M[row][j] -= factor * M[col][j];
      }
    }
  }

  return M.map((row) => row[n]);
}

/**
 * Computes an initial closed-form PnP pose estimate [R_0 | t_0] from >= 3 3D-to-2D correspondences.
 * Uses weak-perspective / POSIT-style depth estimation + Kabsch 3D alignment so that both
 * coplanar (e.g. wing/launcher sticker rows) and non-coplanar (3D store) point sets
 * produce a well-conditioned, positive-depth starting pose for Levenberg-Marquardt refinement.
 */
export function computeInitialPnPPose(
  points3D: Vec3[],
  points2DPx: { u: number; v: number }[],
  K: CameraIntrinsicsK
): SE3Pose {
  const n = Math.min(points3D.length, points2DPx.length);
  const normPts = points2DPx.slice(0, n).map((p) => undistortPixelToNormalized(p.u, p.v, K));

  // Compute 3D centroid and spread
  let c3D: Vec3 = [0, 0, 0];
  let c2D = { xn: 0, yn: 0 };
  for (let i = 0; i < n; i++) {
    c3D = vec3Add(c3D, points3D[i]);
    c2D.xn += normPts[i].xn;
    c2D.yn += normPts[i].yn;
  }
  c3D = vec3Scale(c3D, 1 / n);
  c2D.xn /= n;
  c2D.yn /= n;

  // Estimate average depth Z_0 from ratio of 3D pairwise distances to 2D normalized distances
  let sumDist3D = 0;
  let sumDist2D = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      sumDist3D += vec3Norm(vec3Sub(points3D[i], points3D[j]));
      sumDist2D += Math.hypot(normPts[i].xn - normPts[j].xn, normPts[i].yn - normPts[j].yn);
    }
  }
  const z0 = sumDist2D > 1e-6 && sumDist3D > 1e-6 ? Math.max(0.25, sumDist3D / sumDist2D) : 5.0;

  // POSIT iterative depth + Kabsch refinement (8 fast iterations)
  let depths = new Array(n).fill(z0);
  let bestPose: SE3Pose = {
    R: identityMat3(),
    t: [c2D.xn * z0, c2D.yn * z0, z0],
    rmsePx: 0,
    maxErrorPx: 0,
    inlierCount: n,
    iterations: 0,
    valid: true,
  };

  for (let iter = 0; iter < 10; iter++) {
    const pseudoCamPts: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const zi = Math.max(0.1, depths[i]);
      pseudoCamPts.push([normPts[i].xn * zi, normPts[i].yn * zi, zi]);
    }
    const kabsch = solveKabschRigidBody3D(points3D, pseudoCamPts);
    if (kabsch.valid) {
      bestPose = kabsch;
      // Ensure centroid is in front of camera (Z > 0)
      const cCam = vec3Add(mat3VecMul(bestPose.R, c3D), bestPose.t);
      if (cCam[2] < 0.1) {
        bestPose.t[2] = z0;
      }
      for (let i = 0; i < n; i++) {
        const pCam = vec3Add(mat3VecMul(bestPose.R, points3D[i]), bestPose.t);
        depths[i] = Math.max(0.1, pCam[2]);
      }
    }
  }

  return bestPose;
}

// ============================================================================
// 4. ITERATIVE LEVENBERG-MARQUARDT PnP SOLVER WITH HUBER ROBUST WEIGHTING
// ============================================================================

export interface SolvePnPOptions {
  initialPose?: SE3Pose | null;
  huberDeltaPx?: number;
  maxIterations?: number;
}

/**
 * Solves the 6-DOF Perspective-n-Point (PnP) problem:
 *   min_{R in SO(3), t in R^3} sum_i rho_Huber( || u_i - pi(K, dist, R * P_i^body + t) ||_2^2 )
 *
 * Uses SE(3) Lie algebra tangent space updates [Δω, Δt]^T in R^6 with Levenberg-Marquardt
 * adaptive damping and Huber M-estimator outlier downweighting.
 */
export function solveIterativePnPLM(
  points3D: Vec3[],
  points2DPx: { u: number; v: number }[],
  K: CameraIntrinsicsK,
  options: SolvePnPOptions = {}
): SE3Pose {
  const n = Math.min(points3D.length, points2DPx.length);
  if (n < 3) {
    return {
      R: identityMat3(),
      t: [0, 0, 0],
      rmsePx: Infinity,
      maxErrorPx: Infinity,
      inlierCount: n,
      iterations: 0,
      valid: false,
      statusMessage: 'Insufficient 2D-3D correspondences (minimum 3 required).',
    };
  }

  const huberDelta = options.huberDeltaPx ?? 2.5;
  const maxIterations = options.maxIterations ?? 50;

  // Evaluate cost of a given R, t
  const evaluatePoseCost = (R: Mat3, t: Vec3) => {
    let weightedCost = 0;
    let sumSqPx = 0;
    let maxErrPx = 0;
    let inliers = 0;
    const residuals: { du: number; dv: number; errPx: number; weight: number }[] = [];

    for (let i = 0; i < n; i++) {
      const proj = projectPoint3DToPixel(points3D[i], R, t, K);
      const du = proj.u - points2DPx[i].u;
      const dv = proj.v - points2DPx[i].v;
      const errPx = Math.hypot(du, dv);
      sumSqPx += errPx * errPx;
      if (errPx > maxErrPx) maxErrPx = errPx;

      // Huber weight w(e) = 1 if e <= δ else δ / e
      const weight = errPx <= huberDelta ? 1.0 : huberDelta / Math.max(1e-9, errPx);
      if (errPx <= huberDelta * 2.0) inliers++;

      const huberLoss =
        errPx <= huberDelta
          ? 0.5 * errPx * errPx
          : huberDelta * (errPx - 0.5 * huberDelta);
      weightedCost += huberLoss;

      residuals.push({ du, dv, errPx, weight });
    }

    return {
      weightedCost,
      rmsePx: Math.sqrt(sumSqPx / n),
      maxErrPx,
      inliers,
      residuals,
    };
  };

  // Start from either the supplied prior pose or closed-form POSIT/EPnP initialization
  const closedFormPose = computeInitialPnPPose(points3D, points2DPx, K);
  let R = closedFormPose.R;
  let t = closedFormPose.t;

  if (options.initialPose && options.initialPose.valid) {
    const priorEval = evaluatePoseCost(options.initialPose.R, options.initialPose.t);
    const closedEval = evaluatePoseCost(closedFormPose.R, closedFormPose.t);
    if (priorEval.weightedCost <= closedEval.weightedCost * 1.5) {
      R = options.initialPose.R;
      t = [...options.initialPose.t] as Vec3;
    }
  }

  let currentEval = evaluatePoseCost(R, t);
  let lambda = 1e-3;
  let iter = 0;
  const eps = 1e-6;

  for (iter = 0; iter < maxIterations; iter++) {
    if (currentEval.rmsePx < 1e-6) break;

    // Build 6x6 normal equations J^T W J * δξ = -J^T W r
    const JtWJ: number[][] = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
    const negJtWr: number[] = [0, 0, 0, 0, 0, 0];

    for (let i = 0; i < n; i++) {
      const { du, dv, weight } = currentEval.residuals[i];
      const J_i: [number[], number[]] = [
        [0, 0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],
      ];

      // Numerical tangent-space Jacobian wrt [δwx, δwy, δwz, δtx, δty, δtz]
      for (let p = 0; p < 6; p++) {
        let R_pert = R;
        let t_pert: Vec3 = [t[0], t[1], t[2]];
        if (p < 3) {
          const dOmega: Vec3 = [0, 0, 0];
          dOmega[p] = eps;
          R_pert = mat3Mul(rodriguesToMatrix(dOmega), R);
        } else {
          t_pert[p - 3] += eps;
        }
        const projPlus = projectPoint3DToPixel(points3D[i], R_pert, t_pert, K);
        const projBase = projectPoint3DToPixel(points3D[i], R, t, K);
        J_i[0][p] = (projPlus.u - projBase.u) / eps;
        J_i[1][p] = (projPlus.v - projBase.v) / eps;
      }

      for (let rIdx = 0; rIdx < 6; rIdx++) {
        negJtWr[rIdx] -= weight * (J_i[0][rIdx] * du + J_i[1][rIdx] * dv);
        for (let cIdx = 0; cIdx < 6; cIdx++) {
          JtWJ[rIdx][cIdx] +=
            weight * (J_i[0][rIdx] * J_i[0][cIdx] + J_i[1][rIdx] * J_i[1][cIdx]);
        }
      }
    }

    // Apply Levenberg-Marquardt damping
    const dampedA = JtWJ.map((row, idx) => {
      const copy = [...row];
      copy[idx] += lambda * Math.max(1e-4, row[idx]);
      return copy;
    });

    const delta = solveLinearSystem(dampedA, negJtWr);
    if (!delta) {
      lambda *= 10;
      if (lambda > 1e8) break;
      continue;
    }

    const stepNorm = Math.hypot(...delta);
    if (stepNorm < 1e-9) break;

    const dOmega: Vec3 = [delta[0], delta[1], delta[2]];
    const dt: Vec3 = [delta[3], delta[4], delta[5]];
    const R_cand = projectToSO3(mat3Mul(rodriguesToMatrix(dOmega), R));
    const t_cand: Vec3 = [t[0] + dt[0], t[1] + dt[1], t[2] + dt[2]];

    const candEval = evaluatePoseCost(R_cand, t_cand);
    if (candEval.weightedCost < currentEval.weightedCost && t_cand[2] > 0.05) {
      R = R_cand;
      t = t_cand;
      currentEval = candEval;
      lambda = Math.max(1e-7, lambda * 0.33);
    } else {
      lambda *= 4.0;
      if (lambda > 1e8) break;
    }
  }

  // Compute final 6x6 Pose Covariance Matrix Sigma_xi = s_0^2 * (J^T W J)^{-1}
  // where s_0^2 = (r^T W r) / max(1, 2N - 6)
  const finalJtWJ: Mat6 = Array.from({ length: 6 }, () => [0, 0, 0, 0, 0, 0]);
  let rTWr = 0;

  for (let i = 0; i < n; i++) {
    const { du, dv, weight } = currentEval.residuals[i];
    rTWr += weight * (du * du + dv * dv);

    const J_i: [number[], number[]] = [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];
    for (let p = 0; p < 6; p++) {
      let R_pert = R;
      let t_pert: Vec3 = [t[0], t[1], t[2]];
      if (p < 3) {
        const dOmega: Vec3 = [0, 0, 0];
        dOmega[p] = eps;
        R_pert = mat3Mul(rodriguesToMatrix(dOmega), R);
      } else {
        t_pert[p - 3] += eps;
      }
      const projPlus = projectPoint3DToPixel(points3D[i], R_pert, t_pert, K);
      const projBase = projectPoint3DToPixel(points3D[i], R, t, K);
      J_i[0][p] = (projPlus.u - projBase.u) / eps;
      J_i[1][p] = (projPlus.v - projBase.v) / eps;
    }

    for (let rIdx = 0; rIdx < 6; rIdx++) {
      for (let cIdx = 0; cIdx < 6; cIdx++) {
        finalJtWJ[rIdx][cIdx] +=
          weight * (J_i[0][rIdx] * J_i[0][cIdx] + J_i[1][rIdx] * J_i[1][cIdx]);
      }
    }
  }

  const dof = Math.max(1, 2 * n - 6);
  // Floor s0^2 to sub-pixel centroiding precision (0.15 px)^2 when synthetic noise is zero
  const s0Sq = Math.max(0.15 * 0.15, rTWr / dof);
  const invJtWJ = invertMat6(finalJtWJ, 1e-6);
  const covariance6x6: Mat6 = invJtWJ.map((row) => row.map((val) => val * s0Sq));

  return {
    R,
    t,
    rmsePx: currentEval.rmsePx,
    maxErrorPx: currentEval.maxErrPx,
    inlierCount: currentEval.inliers,
    iterations: iter,
    valid: Number.isFinite(currentEval.rmsePx) && t[2] > 0.05,
    covariance6x6,
    s0Px: Math.sqrt(s0Sq),
  };
}

// ============================================================================
// 5. LEICA SURVEY CSV PARSER & MULTI-BODY 6-DOF SEQUENCE SOLVER
// ============================================================================

/**
 * Infers RigidBodyGroupId ('A' = Aircraft, 'L' = Launcher, 'M' = Missile) from point ID string
 * or explicit group column.
 * Supports IDs like 'A-1', 'A1'..'A6', 'L-7', 'L7'..'L14', 'M-15', 'M15'..'M29'.
 */
export function inferRigidBodyGroup(idOrGroup: string, fallbackIndex = 0): RigidBodyGroupId {
  const clean = idOrGroup.trim().toUpperCase();
  if (clean === 'A' || clean === 'AIRCRAFT' || clean.startsWith('A')) return 'A';
  if (clean === 'L' || clean === 'LAUNCHER' || clean.startsWith('L')) return 'L';
  if (clean === 'M' || clean === 'MISSILE' || clean === 'STORE' || clean.startsWith('M')) return 'M';

  // Extract numeric index if e.g. 'P1'..'P29'
  const match = clean.match(/(\d+)/);
  if (match) {
    const idx = parseInt(match[1], 10);
    if (idx >= 1 && idx <= 6) return 'A';
    if (idx >= 7 && idx <= 14) return 'L';
    if (idx >= 15) return 'M';
  }

  if (fallbackIndex < 6) return 'A';
  if (fallbackIndex < 14) return 'L';
  return 'M';
}

/**
 * Parses a Leica Laser Tracker ACS CSV text into SurveyMarker3D records.
 * Supports formats:
 *   Format 1 (7 columns): PointID, Group[A|L|M], X, Y, Z, u_init, v_init
 *   Format 2 (6 columns): PointID, X, Y, Z, u_init, v_init (auto-infers group from PointID)
 *   Format 3 (5 columns): PointID, Group[A|L|M], X, Y, Z
 *   Format 4 (4 columns): PointID, X, Y, Z (auto-infers group from PointID)
 */
export function parseLeicaSurveyCSV(csvText: string): SurveyMarker3D[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'));

  const markers: SurveyMarker3D[] = [];

  for (let i = 0; i < lines.length; i++) {
    const tokens = lines[i].split(/[,\t;]+/).map((t) => t.trim());
    if (tokens.length < 4) continue;

    // Skip header line
    if (
      i === 0 &&
      (tokens[0].toLowerCase().includes('id') ||
        tokens[0].toLowerCase().includes('point') ||
        Number.isNaN(Number(tokens[2])))
    ) {
      continue;
    }

    const id = tokens[0];
    const secondIsGroup = Number.isNaN(Number(tokens[1]));

    let group: RigidBodyGroupId;
    let x: number;
    let y: number;
    let z: number;
    let u_init: number | undefined;
    let v_init: number | undefined;

    if (secondIsGroup) {
      group = inferRigidBodyGroup(tokens[1], markers.length);
      x = Number(tokens[2]);
      y = Number(tokens[3]);
      z = Number(tokens[4]);
      if (tokens.length >= 7) {
        const u = Number(tokens[5]);
        const v = Number(tokens[6]);
        if (Number.isFinite(u) && Number.isFinite(v)) {
          u_init = u;
          v_init = v;
        }
      }
    } else {
      group = inferRigidBodyGroup(id, markers.length);
      x = Number(tokens[1]);
      y = Number(tokens[2]);
      z = Number(tokens[3]);
      if (tokens.length >= 6) {
        const u = Number(tokens[4]);
        const v = Number(tokens[5]);
        if (Number.isFinite(u) && Number.isFinite(v)) {
          u_init = u;
          v_init = v;
        }
      }
    }

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    markers.push({
      id,
      group,
      x,
      y,
      z,
      u_init,
      v_init,
    });
  }

  return markers;
}

/**
 * Evaluates the 6-DOF state (position of a body-fixed reference point + ZYX Euler orientation
 * + 1-sigma propagated uncertainty) from a relative or camera SE(3) pose.
 */
export function evaluateRigidBodyState(
  poseRefFromBody: SE3Pose,
  bodyReferencePoint: Vec3,
  originReferencePoint: Vec3 = [0, 0, 0]
): RigidBody6DoFState {
  const transformedPt = vec3Sub(
    vec3Add(mat3VecMul(poseRefFromBody.R, bodyReferencePoint), poseRefFromBody.t),
    originReferencePoint
  );
  const euler = extractAerospaceEulerZYX(poseRefFromBody.R);
  const uncertainty1Sigma = extractPointAndEulerUncertainty(
    poseRefFromBody.covariance6x6,
    poseRefFromBody.R,
    bodyReferencePoint,
    poseRefFromBody.s0Px
  );
  return {
    pose: poseRefFromBody,
    referencePointPosition: transformedPt,
    euler,
    uncertainty1Sigma,
  };
}

/**
 * Evaluates all Virtual Critical Points at frame t in both Launcher (M wrt L) and Aircraft (M wrt A)
 * reference frames, including 3D store-to-pylon clearance distance and 1-sigma uncertainty.
 */
export function evaluateVirtualPointsAtFrame(
  virtualPoints: VirtualPoint3D[],
  poseLFromM: SE3Pose | null,
  poseAFromM: SE3Pose | null,
  launcherRefBody: Vec3,
  aircraftRefBody: Vec3
): NonNullable<PointStep['virtualPoints']> {
  const out: NonNullable<PointStep['virtualPoints']> = {};

  for (const vp of virtualPoints) {
    const ptBody: Vec3 = [vp.x, vp.y, vp.z];
    const pInLFrame = poseLFromM
      ? vec3Add(mat3VecMul(poseLFromM.R, ptBody), poseLFromM.t)
      : ptBody;
    const pLauncher = vec3Sub(pInLFrame, launcherRefBody);
    const pAircraft = poseAFromM
      ? vec3Sub(vec3Add(mat3VecMul(poseAFromM.R, ptBody), poseAFromM.t), aircraftRefBody)
      : pLauncher;

    // Nearest point along the physical Launcher Pylon Rail longitudinal span [x_rail - 0.85m, x_rail + 0.85m]
    const clampedRailX = Math.max(
      launcherRefBody[0] - 0.85,
      Math.min(launcherRefBody[0] + 0.85, pInLFrame[0])
    );
    const nearestRailPt: Vec3 = [clampedRailX, launcherRefBody[1], launcherRefBody[2]];
    const clearanceM = Math.max(1e-4, vec3Norm(vec3Sub(pInLFrame, nearestRailPt)));

    const unc = extractPointAndEulerUncertainty(
      poseLFromM?.covariance6x6,
      poseLFromM ? poseLFromM.R : identityMat3(),
      ptBody,
      poseLFromM?.s0Px
    );

    out[vp.id] = {
      name: vp.name,
      x: pLauncher[0],
      y: pLauncher[1],
      z: pLauncher[2],
      clearanceM,
      xAircraft: pAircraft[0],
      yAircraft: pAircraft[1],
      zAircraft: pAircraft[2],
      sigmaX: unc?.sigmaX,
      sigmaY: unc?.sigmaY,
      sigmaZ: unc?.sigmaZ,
    };
  }

  return out;
}

/**
 * Solves a full multi-frame Monocular 6-DOF Store Separation sequence across all tracked frames.
 * Produces per-frame 6-DOF states, 1-sigma propagated covariances, Virtual Critical Point trajectories,
 * and Minimum Store-to-Pylon Clearance Envelope for:
 *   - Missile relative to Launcher (M_wrt_L)
 *   - Missile relative to Aircraft (M_wrt_A)
 *   - Launcher relative to Aircraft (L_wrt_A)
 *   - Missile in Camera / World Frame (camera_world)
 */
export function solveMonocular6DoFSequence(
  tracks: Track[],
  config: Monocular6DoFConfig,
  fps: number = 500
): {
  frameResults: Frame6DoFResult[];
  synthesizedMissileTrack: Track;
  synthesizedLauncherTrack: Track;
  clearanceEnvelope: ClearanceEnvelopeSummary[];
  overallMinClearance: ClearanceEnvelopeSummary | null;
} {
  const { intrinsics, markers, missileCgBody, launcherRefBody, aircraftRefBody } = config;
  const virtualPoints =
    config.virtualPoints && config.virtualPoints.length > 0
      ? config.virtualPoints
      : DEFAULT_VIRTUAL_POINTS;

  // Group markers by A, L, M
  const markersByGroup: Record<RigidBodyGroupId, SurveyMarker3D[]> = {
    A: markers.filter((m) => m.group === 'A'),
    L: markers.filter((m) => m.group === 'L'),
    M: markers.filter((m) => m.group === 'M'),
  };

  // Match each survey marker to a Track (by trackId, surveyMarkerId, or matching name like "A1", "M15")
  const findTrackForMarker = (marker: SurveyMarker3D): Track | undefined => {
    if (marker.trackId) {
      const byId = tracks.find((t) => t.id === marker.trackId);
      if (byId) return byId;
    }
    const cleanId = marker.id.replace(/[-_\s]/g, '').toUpperCase();
    return tracks.find((t) => {
      if (t.surveyMarkerId && t.surveyMarkerId.toUpperCase() === marker.id.toUpperCase()) {
        return true;
      }
      const cleanName = t.name.replace(/[-_\s]/g, '').toUpperCase();
      return cleanName === cleanId || cleanName.startsWith(cleanId + '(');
    });
  };

  const markerTracks = new Map<string, Track>();
  for (const m of markers) {
    const trk = findTrackForMarker(m);
    if (trk) markerTracks.set(m.id, trk);
  }

  // Collect all unique frames across all linked tracks
  const frameSet = new Set<number>();
  for (const trk of tracks) {
    for (const s of trk.steps) {
      if (!s.rejected) frameSet.add(s.frame);
    }
  }
  if (frameSet.size === 0) {
    frameSet.add(0);
  }
  const sortedFrames = Array.from(frameSet).sort((a, b) => a - b);

  let prevPoseA: SE3Pose | null = null;
  let prevPoseL: SE3Pose | null = null;
  let prevPoseM: SE3Pose | null = null;

  // Compute initial static fallback poses for A and L if u_init / v_init are supplied on markers
  const computeInitPoseFromMarkerUInit = (groupMarkers: SurveyMarker3D[]): SE3Pose | null => {
    const withInit = groupMarkers.filter(
      (m) => m.u_init !== undefined && m.v_init !== undefined
    );
    if (withInit.length < 3) return null;
    const pts3D: Vec3[] = withInit.map((m) => [m.x, m.y, m.z]);
    const pts2D = withInit.map((m) => ({ u: m.u_init!, v: m.v_init! }));
    return solveIterativePnPLM(pts3D, pts2D, intrinsics, {
      huberDeltaPx: config.huberDeltaPx,
      maxIterations: config.maxLmIterations,
    });
  };

  const staticFallbackA = computeInitPoseFromMarkerUInit(markersByGroup.A);
  const staticFallbackL = computeInitPoseFromMarkerUInit(markersByGroup.L);

  const frameResults: Frame6DoFResult[] = [];
  const missileSteps: PointStep[] = [];
  const launcherSteps: PointStep[] = [];

  const clearanceEnvelope: Record<string, ClearanceEnvelopeSummary> = {};
  let overallMinClearance: ClearanceEnvelopeSummary | undefined;

  for (const frame of sortedFrames) {
    const time = frame / Math.max(1, fps);
    const markerCounts = { A: 0, L: 0, M: 0 };

    const solveGroupAtFrame = (
      group: RigidBodyGroupId,
      priorPose: SE3Pose | null,
      fallbackPose: SE3Pose | null
    ): SE3Pose | null => {
      const grpMarkers = markersByGroup[group];
      const pts3D: Vec3[] = [];
      const pts2D: { u: number; v: number }[] = [];

      for (const m of grpMarkers) {
        const trk = markerTracks.get(m.id);
        const step = trk?.steps.find((s) => s.frame === frame && !s.rejected);
        if (step && Number.isFinite(step.px) && Number.isFinite(step.py)) {
          pts3D.push([m.x, m.y, m.z]);
          pts2D.push({ u: step.px, v: step.py });
        } else if (
          frame === sortedFrames[0] &&
          m.u_init !== undefined &&
          m.v_init !== undefined
        ) {
          pts3D.push([m.x, m.y, m.z]);
          pts2D.push({ u: m.u_init, v: m.v_init });
        }
      }

      markerCounts[group] = pts3D.length;

      if (pts3D.length >= 3) {
        const solved = solveIterativePnPLM(pts3D, pts2D, intrinsics, {
          initialPose: priorPose,
          huberDeltaPx: config.huberDeltaPx,
          maxIterations: config.maxLmIterations,
        });
        if (solved.valid) return solved;
      }

      return priorPose || fallbackPose;
    };

    const poseA = solveGroupAtFrame('A', prevPoseA, staticFallbackA);
    const poseL = solveGroupAtFrame('L', prevPoseL, staticFallbackL || poseA);
    const poseM = solveGroupAtFrame(
      'M',
      prevPoseM,
      computeInitPoseFromMarkerUInit(markersByGroup.M)
    );

    if (poseA) prevPoseA = poseA;
    if (poseL) prevPoseL = poseL;
    if (poseM) prevPoseM = poseM;

    const poseLFromM = poseL && poseM ? computeRelativeSE3(poseL, poseM) : null;
    const poseAFromM = poseA && poseM ? computeRelativeSE3(poseA, poseM) : null;
    const poseAFromL = poseA && poseL ? computeRelativeSE3(poseA, poseL) : null;

    const relM_L = poseLFromM
      ? evaluateRigidBodyState(poseLFromM, missileCgBody, launcherRefBody)
      : null;

    const relM_A = poseAFromM
      ? evaluateRigidBodyState(poseAFromM, missileCgBody, aircraftRefBody)
      : null;

    const relL_A = poseAFromL
      ? evaluateRigidBodyState(poseAFromL, launcherRefBody, aircraftRefBody)
      : null;

    const camM = poseM ? evaluateRigidBodyState(poseM, missileCgBody, [0, 0, 0]) : null;

    const vpAtFrame = evaluateVirtualPointsAtFrame(
      virtualPoints,
      poseLFromM,
      poseAFromM,
      launcherRefBody,
      aircraftRefBody
    );

    // Update Minimum Store-to-Pylon Clearance Envelope across post-release trajectory
    // (skip captive t0 frame when multi-frame separation exists so clearance is never pegged to captive zero)
    const isPostReleaseCandidate = sortedFrames.length <= 1 || frame > sortedFrames[0];
    if (isPostReleaseCandidate) {
      for (const vp of virtualPoints) {
        const vpState = vpAtFrame[vp.id];
        if (!vpState) continue;
        const existing = clearanceEnvelope[vp.id];
        if (!existing || vpState.clearanceM < existing.minClearanceMeters) {
          clearanceEnvelope[vp.id] = {
            virtualPointId: vp.id,
            virtualPointName: vp.name,
            minClearanceMeters: vpState.clearanceM,
            minDistanceMeters: vpState.clearanceM,
            closestApproachFrame: frame,
            closestApproachTimeSec: time,
            closestApproachTime: time,
          };
        }
        if (!overallMinClearance || vpState.clearanceM < overallMinClearance.minClearanceMeters) {
          overallMinClearance = {
            virtualPointId: vp.id,
            virtualPointName: vp.name,
            minClearanceMeters: vpState.clearanceM,
            minDistanceMeters: vpState.clearanceM,
            closestApproachFrame: frame,
            closestApproachTimeSec: time,
            closestApproachTime: time,
          };
        }
      }
    }

    frameResults.push({
      frame,
      time,
      poseCamFromAircraft: poseA,
      poseCamFromLauncher: poseL,
      poseCamFromMissile: poseM,
      relMissileWrtLauncher: relM_L,
      relMissileWrtAircraft: relM_A,
      relLauncherWrtAircraft: relL_A,
      camMissileState: camM,
      markerCounts,
      markerCountA: markerCounts.A,
      markerCountL: markerCounts.L,
      markerCountM: markerCounts.M,
      virtualPoints: vpAtFrame,
    });

    // Primary step uses Missile rel. Launcher (or M wrt A / camM if L unavailable)
    const primaryState = relM_L || relM_A || camM;
    if (primaryState && poseM) {
      const cgProj = projectPoint3DToPixel(missileCgBody, poseM.R, poseM.t, intrinsics);
      const relativeFrames: PointStep['relativeFrames'] = {};

      if (relM_L) {
        relativeFrames.M_wrt_L = {
          x: relM_L.referencePointPosition[0],
          y: relM_L.referencePointPosition[1],
          z: relM_L.referencePointPosition[2],
          roll: relM_L.euler.rollDeg,
          pitch: relM_L.euler.pitchDeg,
          yaw: relM_L.euler.yawDeg,
          rmsePx: relM_L.pose.rmsePx,
          sigmaX: relM_L.uncertainty1Sigma?.sigmaX,
          sigmaY: relM_L.uncertainty1Sigma?.sigmaY,
          sigmaZ: relM_L.uncertainty1Sigma?.sigmaZ,
          sigmaRoll: relM_L.uncertainty1Sigma?.sigmaRollDeg,
          sigmaPitch: relM_L.uncertainty1Sigma?.sigmaPitchDeg,
          sigmaYaw: relM_L.uncertainty1Sigma?.sigmaYawDeg,
        };
      }
      if (relM_A) {
        relativeFrames.M_wrt_A = {
          x: relM_A.referencePointPosition[0],
          y: relM_A.referencePointPosition[1],
          z: relM_A.referencePointPosition[2],
          roll: relM_A.euler.rollDeg,
          pitch: relM_A.euler.pitchDeg,
          yaw: relM_A.euler.yawDeg,
          rmsePx: relM_A.pose.rmsePx,
          sigmaX: relM_A.uncertainty1Sigma?.sigmaX,
          sigmaY: relM_A.uncertainty1Sigma?.sigmaY,
          sigmaZ: relM_A.uncertainty1Sigma?.sigmaZ,
          sigmaRoll: relM_A.uncertainty1Sigma?.sigmaRollDeg,
          sigmaPitch: relM_A.uncertainty1Sigma?.sigmaPitchDeg,
          sigmaYaw: relM_A.uncertainty1Sigma?.sigmaYawDeg,
        };
      }
      if (relL_A) {
        relativeFrames.L_wrt_A = {
          x: relL_A.referencePointPosition[0],
          y: relL_A.referencePointPosition[1],
          z: relL_A.referencePointPosition[2],
          roll: relL_A.euler.rollDeg,
          pitch: relL_A.euler.pitchDeg,
          yaw: relL_A.euler.yawDeg,
          rmsePx: relL_A.pose.rmsePx,
          sigmaX: relL_A.uncertainty1Sigma?.sigmaX,
          sigmaY: relL_A.uncertainty1Sigma?.sigmaY,
          sigmaZ: relL_A.uncertainty1Sigma?.sigmaZ,
          sigmaRoll: relL_A.uncertainty1Sigma?.sigmaRollDeg,
          sigmaPitch: relL_A.uncertainty1Sigma?.sigmaPitchDeg,
          sigmaYaw: relL_A.uncertainty1Sigma?.sigmaYawDeg,
        };
      }
      if (camM) {
        relativeFrames.camera_world = {
          x: camM.referencePointPosition[0],
          y: camM.referencePointPosition[1],
          z: camM.referencePointPosition[2],
          roll: camM.euler.rollDeg,
          pitch: camM.euler.pitchDeg,
          yaw: camM.euler.yawDeg,
          rmsePx: camM.pose.rmsePx,
          sigmaX: camM.uncertainty1Sigma?.sigmaX,
          sigmaY: camM.uncertainty1Sigma?.sigmaY,
          sigmaZ: camM.uncertainty1Sigma?.sigmaZ,
          sigmaRoll: camM.uncertainty1Sigma?.sigmaRollDeg,
          sigmaPitch: camM.uncertainty1Sigma?.sigmaPitchDeg,
          sigmaYaw: camM.uncertainty1Sigma?.sigmaYawDeg,
        };
      }

      missileSteps.push({
        frame,
        time,
        px: Math.round(cgProj.u * 100) / 100,
        py: Math.round(cgProj.v * 100) / 100,
        x: primaryState.referencePointPosition[0],
        y: primaryState.referencePointPosition[1],
        z: primaryState.referencePointPosition[2],
        roll: primaryState.euler.rollDeg,
        pitch: primaryState.euler.pitchDeg,
        yaw: primaryState.euler.yawDeg,
        rollDeg: primaryState.euler.rollDeg,
        elevationDeg: primaryState.euler.pitchDeg,
        azimuthDeg: primaryState.euler.yawDeg,
        triangulationResidual: poseM.rmsePx,
        sigmaX: primaryState.uncertainty1Sigma?.sigmaX,
        sigmaY: primaryState.uncertainty1Sigma?.sigmaY,
        sigmaZ: primaryState.uncertainty1Sigma?.sigmaZ,
        sigmaRoll: primaryState.uncertainty1Sigma?.sigmaRollDeg,
        sigmaPitch: primaryState.uncertainty1Sigma?.sigmaPitchDeg,
        sigmaYaw: primaryState.uncertainty1Sigma?.sigmaYawDeg,
        markerCountA: markerCounts.A,
        markerCountL: markerCounts.L,
        markerCountM: markerCounts.M,
        relativeFrames,
        virtualPoints: vpAtFrame,
      });
    }

    if (relL_A && poseL) {
      const lProj = projectPoint3DToPixel(launcherRefBody, poseL.R, poseL.t, intrinsics);
      launcherSteps.push({
        frame,
        time,
        px: Math.round(lProj.u * 100) / 100,
        py: Math.round(lProj.v * 100) / 100,
        x: relL_A.referencePointPosition[0],
        y: relL_A.referencePointPosition[1],
        z: relL_A.referencePointPosition[2],
        roll: relL_A.euler.rollDeg,
        pitch: relL_A.euler.pitchDeg,
        yaw: relL_A.euler.yawDeg,
        rollDeg: relL_A.euler.rollDeg,
        elevationDeg: relL_A.euler.pitchDeg,
        azimuthDeg: relL_A.euler.yawDeg,
        triangulationResidual: poseL.rmsePx,
        sigmaX: relL_A.uncertainty1Sigma?.sigmaX,
        sigmaY: relL_A.uncertainty1Sigma?.sigmaY,
        sigmaZ: relL_A.uncertainty1Sigma?.sigmaZ,
        sigmaRoll: relL_A.uncertainty1Sigma?.sigmaRollDeg,
        sigmaPitch: relL_A.uncertainty1Sigma?.sigmaPitchDeg,
        sigmaYaw: relL_A.uncertainty1Sigma?.sigmaYawDeg,
        markerCountA: markerCounts.A,
        markerCountL: markerCounts.L,
        markerCountM: markerCounts.M,
      });
    }
  }

  // Differentiate linear & angular velocities/accelerations on missileSteps
  for (let i = 0; i < missileSteps.length; i++) {
    const cur = missileSteps[i];
    const prev = i > 0 ? missileSteps[i - 1] : cur;
    const next = i < missileSteps.length - 1 ? missileSteps[i + 1] : cur;
    const dt = Math.max(1e-6, next.time - prev.time);

    cur.vx = (next.x - prev.x) / dt;
    cur.vy = (next.y - prev.y) / dt;
    cur.vz = ((next.z ?? 0) - (prev.z ?? 0)) / dt;
    cur.v = Math.hypot(cur.vx, cur.vy, cur.vz);

    cur.omegaRoll = ((next.roll ?? 0) - (prev.roll ?? 0)) / dt;
    cur.omegaPitch = ((next.pitch ?? 0) - (prev.pitch ?? 0)) / dt;
    cur.omegaYaw = ((next.yaw ?? 0) - (prev.yaw ?? 0)) / dt;
  }

  for (let i = 0; i < missileSteps.length; i++) {
    const cur = missileSteps[i];
    const prev = i > 0 ? missileSteps[i - 1] : cur;
    const next = i < missileSteps.length - 1 ? missileSteps[i + 1] : cur;
    const dt = Math.max(1e-6, next.time - prev.time);

    cur.ax = ((next.vx ?? 0) - (prev.vx ?? 0)) / dt;
    cur.ay = ((next.vy ?? 0) - (prev.vy ?? 0)) / dt;
    cur.az = ((next.vz ?? 0) - (prev.vz ?? 0)) / dt;
    cur.a = Math.hypot(cur.ax, cur.ay, cur.az);

    cur.alphaRoll = ((next.omegaRoll ?? 0) - (prev.omegaRoll ?? 0)) / dt;
    cur.alphaPitch = ((next.omegaPitch ?? 0) - (prev.omegaPitch ?? 0)) / dt;
    cur.alphaYaw = ((next.omegaYaw ?? 0) - (prev.omegaYaw ?? 0)) / dt;
  }

  return {
    frameResults,
    clearanceEnvelope: Object.values(clearanceEnvelope),
    overallMinClearance: overallMinClearance || null,
    synthesizedMissileTrack: {
      id: 'track-6dof-missile-cg',
      name: 'Missile 6-DOF CG (M wrt L / A)',
      color: '#dc2626',
      mass: 85.0,
      footprint: 'crosshair',
      steps: missileSteps,
      visible: true,
      showVectors: true,
      showTrails: true,
      showLabels: true,
      rigidBodyGroup: 'M',
      virtualPointsCatalog: virtualPoints,
      clearanceEnvelope,
      overallMinClearance,
    },
    synthesizedLauncherTrack: {
      id: 'track-6dof-launcher-ref',
      name: 'Launcher 6-DOF Rail (L wrt A)',
      color: '#0284c7',
      mass: 42.0,
      footprint: 'diamond',
      steps: launcherSteps,
      visible: true,
      showVectors: false,
      showTrails: true,
      showLabels: false,
      rigidBodyGroup: 'L',
    },
  };
}

/**
 * Generates a realistic 500 fps Leica Laser Tracker Store Separation Dataset
 * with 20 surveyed markers:
 *   - Aircraft Reference Group A (A1–A6): Fixed on wing/pylon with simulated 25 Hz aero-vibration
 *   - Launcher Group L (L7–L14): Ejector rack with piston stroke deflection
 *   - Missile Store Group M (M15–M22): Separating store dropping under gravity + ejector impulse
 *     with nose-down pitch, roll, and yaw dynamics.
 */
export function createSampleStoreSeparationDataset(numFrames = 25, fps = 500): {
  config: Monocular6DoFConfig;
  markerTracks: Track[];
  csvText: string;
} {
  const intrinsics: CameraIntrinsicsK = {
    fx: 1600,
    fy: 1600,
    cx: 640,
    cy: 360,
    width: 1280,
    height: 720,
    distortion: {
      enabled: true,
      k1: -0.045,
      k2: 0.012,
      k3: 0,
      p1: 0.0005,
      p2: -0.0004,
    },
  };

  // Surveyed 3D coordinates in Aircraft Coordinate System (ACS, meters):
  // +X Forward, +Y Right Wing, +Z Downward (or camera view where Y is vertical)
  const rawMarkers: { id: string; group: RigidBodyGroupId; x: number; y: number; z: number }[] = [
    // Aircraft Reference A1-A6 (Wing / Pylon fixed markers)
    { id: 'A1', group: 'A', x: -0.9, y: -0.55, z: 0.05 },
    { id: 'A2', group: 'A', x: -0.3, y: -0.58, z: 0.02 },
    { id: 'A3', group: 'A', x: 0.3, y: -0.56, z: -0.02 },
    { id: 'A4', group: 'A', x: 0.9, y: -0.52, z: 0.04 },
    { id: 'A5', group: 'A', x: -0.5, y: -0.42, z: 0.18 },
    { id: 'A6', group: 'A', x: 0.5, y: -0.40, z: 0.16 },

    // Launcher Rail L7-L14 (Pylon Ejector Rack)
    { id: 'L7', group: 'L', x: -0.75, y: -0.25, z: 0.02 },
    { id: 'L8', group: 'L', x: -0.25, y: -0.25, z: -0.01 },
    { id: 'L9', group: 'L', x: 0.25, y: -0.25, z: 0.01 },
    { id: 'L10', group: 'L', x: 0.75, y: -0.25, z: -0.02 },
    { id: 'L11', group: 'L', x: -0.60, y: -0.18, z: 0.08 },
    { id: 'L12', group: 'L', x: -0.10, y: -0.18, z: 0.09 },
    { id: 'L13', group: 'L', x: 0.35, y: -0.18, z: 0.07 },
    { id: 'L14', group: 'L', x: 0.80, y: -0.18, z: 0.08 },

    // Missile Store M15-M22 (Separating Store)
    { id: 'M15', group: 'M', x: -1.10, y: 0.0, z: 0.04 },
    { id: 'M16', group: 'M', x: -0.65, y: 0.05, z: 0.08 },
    { id: 'M17', group: 'M', x: -0.20, y: -0.04, z: 0.09 },
    { id: 'M18', group: 'M', x: 0.25, y: 0.05, z: 0.08 },
    { id: 'M19', group: 'M', x: 0.70, y: -0.03, z: 0.07 },
    { id: 'M20', group: 'M', x: 1.15, y: 0.0, z: 0.02 },
    { id: 'M21', group: 'M', x: -0.45, y: 0.08, z: -0.05 },
    { id: 'M22', group: 'M', x: 0.45, y: 0.08, z: -0.05 },
  ];

  // Base camera pose viewing the pylon at 4.2m distance
  const baseR = identityMat3();
  const baseT: Vec3 = [0.0, 0.1, 4.2];

  const markerTracks: Track[] = [];
  const markersWithInit: SurveyMarker3D[] = [];
  const csvLines = ['PointID,Group,X_m,Y_m,Z_m,u_init_px,v_init_px'];

  for (const m of rawMarkers) {
    const steps: PointStep[] = [];
    let u0 = 0;
    let v0 = 0;

    for (let f = 0; f < numFrames; f++) {
      const tSec = f / fps;

      // Simulated camera shake (40 Hz aero-buffet) affecting all bodies equally in camera space
      const camShakeRot = eulerZYXToMatrix(
        0.15 * Math.sin(2 * Math.PI * 40 * tSec),
        0.22 * Math.cos(2 * Math.PI * 35 * tSec),
        0.10 * Math.sin(2 * Math.PI * 50 * tSec)
      );
      const camShakeTrans: Vec3 = [
        baseT[0] + 0.004 * Math.sin(2 * Math.PI * 40 * tSec),
        baseT[1] + 0.006 * Math.cos(2 * Math.PI * 35 * tSec),
        baseT[2],
      ];

      const R_CA = mat3Mul(camShakeRot, baseR);
      const t_CA = camShakeTrans;

      let R_body = R_CA;
      let t_body = t_CA;

      if (m.group === 'L') {
        // Ejector rack slight downward piston recoil relative to aircraft
        const recoilY = 0.012 * Math.sin(Math.min(Math.PI, tSec * 60));
        const T_AL: SE3Pose = {
          R: eulerZYXToMatrix(0, -0.3 * Math.sin(Math.min(Math.PI, tSec * 60)), 0),
          t: [0, recoilY, 0],
          rmsePx: 0,
          maxErrorPx: 0,
          inlierCount: 8,
          iterations: 1,
          valid: true,
        };
        const poseCA: SE3Pose = {
          R: R_CA,
          t: t_CA,
          rmsePx: 0,
          maxErrorPx: 0,
          inlierCount: 6,
          iterations: 1,
          valid: true,
        };
        const poseCL = multiplySE3(poseCA, T_AL);
        R_body = poseCL.R;
        t_body = poseCL.t;
      } else if (m.group === 'M') {
        // Store separation trajectory relative to Aircraft:
        // Forward X velocity +1.8 m/s, Downward drop (v_eject = 3.2 m/s + 0.5*28*t^2),
        // Outboard lateral Y drift +0.45 m/s, and Pitch/Roll/Yaw angular rates
        const dx = 1.8 * tSec + 4.5 * tSec * tSec;
        const dy = 3.2 * tSec + 0.5 * 32.0 * tSec * tSec; // Downward separation in camera +Y (or +Z NED)
        const dz = 0.45 * tSec;
        const roll = 18.0 * tSec + 120 * tSec * tSec;
        const pitch = -24.0 * tSec - 160 * tSec * tSec; // Nose-down pitch
        const yaw = 8.5 * tSec;

        const T_AM: SE3Pose = {
          R: eulerZYXToMatrix(roll, pitch, yaw),
          t: [dx, dy, dz],
          rmsePx: 0,
          maxErrorPx: 0,
          inlierCount: 8,
          iterations: 1,
          valid: true,
        };
        const poseCA: SE3Pose = {
          R: R_CA,
          t: t_CA,
          rmsePx: 0,
          maxErrorPx: 0,
          inlierCount: 6,
          iterations: 1,
          valid: true,
        };
        const poseCM = multiplySE3(poseCA, T_AM);
        R_body = poseCM.R;
        t_body = poseCM.t;
      }

      const proj = projectPoint3DToPixel([m.x, m.y, m.z], R_body, t_body, intrinsics);
      if (f === 0) {
        u0 = Number(proj.u.toFixed(3));
        v0 = Number(proj.v.toFixed(3));
      }

      steps.push({
        frame: f,
        time: tSec,
        px: Number(proj.u.toFixed(3)),
        py: Number(proj.v.toFixed(3)),
        x: m.x,
        y: m.y,
        z: m.z,
      });
    }

    const groupColors: Record<RigidBodyGroupId, string> = {
      A: '#0284c7',
      L: '#d97706',
      M: '#dc2626',
    };

    const trackId = `track-marker-${m.id}`;
    markerTracks.push({
      id: trackId,
      name: m.id,
      color: groupColors[m.group],
      mass: 1.0,
      footprint: m.group === 'M' ? 'crosshair' : m.group === 'L' ? 'diamond' : 'circle',
      steps,
      visible: true,
      showVectors: false,
      showTrails: true,
      showLabels: true,
      rigidBodyGroup: m.group,
      surveyMarkerId: m.id,
    });

    markersWithInit.push({
      ...m,
      u_init: u0,
      v_init: v0,
      trackId,
    });

    csvLines.push(
      `${m.id},${m.group},${m.x.toFixed(4)},${m.y.toFixed(4)},${m.z.toFixed(4)},${u0.toFixed(2)},${v0.toFixed(2)}`
    );
  }

  return {
    config: {
      intrinsics,
      markers: markersWithInit,
      missileCgBody: [0, 0, 0],
      launcherRefBody: [0, -0.22, 0.03],
      aircraftRefBody: [0, -0.50, 0.05],
      huberDeltaPx: 2.5,
      maxLmIterations: 50,
      useStaticAircraftIfUntracked: true,
      useStaticLauncherIfUntracked: true,
    },
    markerTracks,
    csvText: csvLines.join('\n'),
  };
}
