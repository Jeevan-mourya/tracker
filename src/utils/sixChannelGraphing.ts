/**
 * Tracker / Open Source Physics & Defense Store Separation –
 * Six-Channel Motion-Analysis Graphing, Position-to-Distance Conversion,
 * Aerospace NED (+Z Down) Convention, Relative Reference Frames & Signal Conditioning Engine
 *
 * Implements:
 * 1. Six independently selectable 6-DOF motion channels:
 *    - Translational: X, Y, Z
 *    - Rotational: Roll (about X), Pitch (about Y), Yaw (about Z)
 * 2. Arbitrary horizontal & vertical axis assignment + Swap Axes
 * 3. Position-to-Distance conversion relative to user-selectable reference frame t0:
 *    - Signed displacement: ΔX(t) = X(t) - X(t0), ΔY(t) = Y(t) - Y(t0), ΔZ(t) = Z(t) - Z(t0)
 *    - Scalar distance: |ΔX(t)|, |ΔY(t)|, |ΔZ(t)|
 *    - 3D Euclidean displacement magnitude: D3D(t) = sqrt(ΔX(t)^2 + ΔY(t)^2 + ΔZ(t)^2)
 *    - Cumulative 3D path length: L(t) = sum of 3D Euclidean distances between consecutive valid observations from t0
 * 4. Relative rotational measurements with proper ±180° angular wrapping & continuous phase unwrapping
 * 5. Aerospace Coordinate Convention (NED +Z Down vs ENU +Z Up) & Per-Channel Polarity Inversion (±)
 * 6. Relative Reference Frame Selector (Missile wrt Launcher, Missile wrt Aircraft, Launcher wrt Aircraft, Camera/World)
 * 7. Signal Conditioning & Derivative Smoothing Pipeline:
 *    - Savitzky-Golay Polynomial Filter (Order 2/3, Window 5–21)
 *    - Zero-Phase 4th-Order Butterworth Low-Pass Filter (filtfilt forward-backward biquad)
 */

import {
  PointStep,
  PlotVariable,
  GraphAxisVariable,
  GraphTransformMode,
  SixDofChannel,
  AngleWrapMode,
  AngleUnit,
  GraphConfig,
  AerospaceCoordConvention,
  RelativeReferenceFrameMode,
  SignalFilterConfig,
  ChannelSignMode,
  ChannelSignRule,
  SixDofSignMatrixConfig,
} from '../types';

export const SIX_DOF_CHANNELS: SixDofChannel[] = ['x', 'y', 'z', 'roll', 'pitch', 'yaw'];
export const TRANSLATIONAL_CHANNELS: SixDofChannel[] = ['x', 'y', 'z'];
export const ROTATIONAL_CHANNELS: SixDofChannel[] = ['roll', 'pitch', 'yaw'];

export const CHANNEL_COLORS: Record<string, string> = {
  x: '#1e3a5f',      // Cobalt Blue
  y: '#047857',      // Emerald Green
  z: '#7c3aed',      // Violet
  roll: '#b45309',   // Amber
  pitch: '#b91c1c',  // Crimson
  yaw: '#0284c7',    // Sky Cyan
  d3d: '#0f766e',    // Teal
  pathLength: '#4338ca', // Indigo
};

/**
 * Official Missile/Store 6-DOF User Requirement Specification Sign & Direction Matrix:
 * - X +ve: Towards the nose of the missile (Forward)
 * - Y +ve: Towards right (Starboard wing)
 * - Z +ve: Downwards (Nadir / Toward Earth)
 * - Roll (φ) +ve: Towards right (Right wing/fin down, clockwise looking forward)
 * - Pitch (θ) +ve: Nose up (Nose rotates upward toward -Z)
 * - Yaw (ψ) +ve: Towards right (Nose rotates rightward toward +Y)
 */
export const DEFAULT_MISSILE_NED_SIGN_MATRIX: SixDofSignMatrixConfig = {
  x: {
    channel: 'x',
    directionLabel: 'Towards Nose (Forward)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  y: {
    channel: 'y',
    directionLabel: 'Towards Right (Starboard)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  z: {
    channel: 'z',
    directionLabel: 'Downwards (Nadir)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  roll: {
    channel: 'roll',
    directionLabel: 'Towards Right (CW Fin Down)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  pitch: {
    channel: 'pitch',
    directionLabel: 'Nose Up',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  yaw: {
    channel: 'yaw',
    directionLabel: 'Towards Right (Nose Right)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
};

export const STANDARD_CARTESIAN_ENU_SIGN_MATRIX: SixDofSignMatrixConfig = {
  x: {
    channel: 'x',
    directionLabel: 'Forward (+X)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  y: {
    channel: 'y',
    directionLabel: 'Left / Up (+Y)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  z: {
    channel: 'z',
    directionLabel: 'Upwards (+Z Up)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  roll: {
    channel: 'roll',
    directionLabel: 'Right (+Roll)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  pitch: {
    channel: 'pitch',
    directionLabel: 'Nose Up (+Pitch)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
  yaw: {
    channel: 'yaw',
    directionLabel: 'Right (+Yaw)',
    mode: 'standard',
    multiplier: 1,
    rectify: 'signed',
  },
};

export function getDefaultSignMatrixForConvention(
  coordConvention: AerospaceCoordConvention = 'NED_Z_DOWN'
): SixDofSignMatrixConfig {
  const base =
    coordConvention === 'NED_Z_DOWN'
      ? DEFAULT_MISSILE_NED_SIGN_MATRIX
      : STANDARD_CARTESIAN_ENU_SIGN_MATRIX;
  return {
    x: { ...base.x },
    y: { ...base.y },
    z: { ...base.z },
    roll: { ...base.roll },
    pitch: { ...base.pitch },
    yaw: { ...base.yaw },
  };
}

export interface ResearchPlotPreset {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  configUpdates: Partial<GraphConfig>;
}

export const RESEARCH_PLOT_PRESETS: ResearchPlotPreset[] = [
  {
    id: 'x-vs-time',
    label: 'X vs Time (Signed & Positive |ΔX|)',
    shortLabel: 'X vs Time (± & |X|)',
    description: 'Forward nose translation ΔX(t) signed on Top Panel and positive |ΔX(t)| on Bottom Panel',
    configUpdates: {
      varY: 'x',
      varX: 't',
      viewMode: 'dual-sync',
      transformMode: 'signed',
      panel2TransformMode: 'abs',
      zoomDomainX: null,
      zoomDomainY: null,
    },
  },
  {
    id: 'z-drop-vs-time',
    label: 'Z Drop vs Time (NED +Z Down)',
    shortLabel: 'Z Drop vs Time (+Z Down)',
    description: 'Vertical store separation drop ΔZ(t) in Missile NED (+Z Downwards)',
    configUpdates: {
      varY: 'z',
      varX: 't',
      coordConvention: 'NED_Z_DOWN',
      viewMode: 'dual-sync',
      transformMode: 'signed',
      panel2TransformMode: 'abs',
      zoomDomainX: null,
      zoomDomainY: null,
    },
  },
  {
    id: 'pitch-vs-time',
    label: 'Pitch vs Time (Nose Up +)',
    shortLabel: 'Pitch θ vs Time',
    description: 'Store pitch attitude Δθ(t) signed on Top Panel and positive |Δθ(t)| on Bottom Panel',
    configUpdates: {
      varY: 'pitch',
      varX: 't',
      viewMode: 'dual-sync',
      transformMode: 'signed',
      panel2TransformMode: 'abs',
      zoomDomainX: null,
      zoomDomainY: null,
    },
  },
  {
    id: 'yaw-vs-time',
    label: 'Yaw vs Time (Nose Right +)',
    shortLabel: 'Yaw ψ vs Time',
    description: 'Store yaw attitude Δψ(t) signed on Top Panel and positive |Δψ(t)| on Bottom Panel',
    configUpdates: {
      varY: 'yaw',
      varX: 't',
      viewMode: 'dual-sync',
      transformMode: 'signed',
      panel2TransformMode: 'abs',
      zoomDomainX: null,
      zoomDomainY: null,
    },
  },
  {
    id: 'roll-vs-pitch',
    label: 'Roll vs Pitch (Cross-Coupling)',
    shortLabel: 'Roll vs Pitch (φ vs θ)',
    description: 'Parametric attitude cross-coupling phase plot of Roll φ (Y) vs Pitch θ (X)',
    configUpdates: {
      varY: 'roll',
      varX: 'pitch',
      viewMode: 'single',
      transformMode: 'signed',
      transformModeX: 'signed',
      zoomDomainX: null,
      zoomDomainY: null,
    },
  },
  {
    id: 'pitch-vs-velocity',
    label: 'Pitch vs Velocity (Aerodynamic Stability)',
    shortLabel: 'Pitch vs Velocity (θ vs v)',
    description: 'Aerodynamic pitch stability envelope plotting Pitch θ (Y) vs 3D Speed v (X)',
    configUpdates: {
      varY: 'pitch',
      varX: 'v',
      viewMode: 'single',
      transformMode: 'signed',
      transformModeX: 'signed',
      zoomDomainX: null,
      zoomDomainY: null,
    },
  },
  {
    id: 'z-vs-x',
    label: 'Z vs X (Trajectory Side Profile)',
    shortLabel: 'Z vs X (Side Profile)',
    description: 'Spatial trajectory side profile plotting vertical separation Z (Y) vs forward travel X (X)',
    configUpdates: {
      varY: 'z',
      varX: 'x',
      viewMode: 'single',
      transformMode: 'signed',
      transformModeX: 'signed',
      zoomDomainX: null,
      zoomDomainY: null,
    },
  },
];

export const DEFAULT_SIGNAL_FILTER_CONFIG: SignalFilterConfig = {
  type: 'raw',
  windowSize: 7,
  polyOrder: 2,
  cutoffHz: 45,
};

export const DEFAULT_GRAPH_CONFIG: GraphConfig = {
  varY: 'x',
  varX: 't',
  selectedChannels: ['x', 'y', 'z'],
  transformMode: 'signed',
  panel2TransformMode: 'abs',
  viewMode: 'dual-sync',
  referenceFrameT0: null,
  relativeToOrigin: true,
  useRelativeTime: true,
  angleWrapMode: 'unwrapped',
  angleUnit: 'deg',
  coordConvention: 'ENU_Z_UP',
  channelSignConfig: getDefaultSignMatrixForConvention('NED_Z_DOWN'),
  referenceFrameMode: 'M_wrt_L',
  invertChannels: {},
  filterConfig: DEFAULT_SIGNAL_FILTER_CONFIG,
  showOverlayDistance: true,
  showLegend: true,
  fitType: 'none',
  zoomDomainX: null,
  zoomDomainY: null,
};

// ============================================================================
// 1. SAVITZKY-GOLAY & ZERO-PHASE 4TH-ORDER BUTTERWORTH SIGNAL CONDITIONING
// ============================================================================

/**
 * Solves a small dense linear system A x = b for Savitzky-Golay Vandermonde inversion.
 */
function solveSmallLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(M[row][col]) > Math.abs(M[pivot][col])) pivot = row;
    }
    if (pivot !== col) {
      const tmp = M[col];
      M[col] = M[pivot];
      M[pivot] = tmp;
    }
    const diag = M[col][col] || 1e-12;
    for (let j = col; j <= n; j++) M[col][j] /= diag;
    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const f = M[row][col];
      for (let j = col; j <= n; j++) M[row][j] -= f * M[col][j];
    }
  }
  return M.map((r) => r[n]);
}

/**
 * Computes symmetric Savitzky-Golay smoothing convolution weights for odd windowSize (5..21)
 * and polynomial order (2 or 3).
 */
export function computeSavitzkyGolayWeights(
  windowSize: number = 7,
  polyOrder: number = 2
): number[] {
  const W = Math.max(5, Math.min(21, windowSize % 2 === 0 ? windowSize + 1 : windowSize));
  const half = (W - 1) / 2;
  const order = Math.max(1, Math.min(polyOrder, W - 2));
  const m = order + 1;

  // Normal equations (J^T J) c = J^T e_i; we want row 0 of (J^T J)^{-1} J^T
  const JtJ: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  for (let k = -half; k <= half; k++) {
    for (let r = 0; r < m; r++) {
      for (let c = 0; c < m; c++) {
        JtJ[r][c] += Math.pow(k, r + c);
      }
    }
  }

  const rhs = new Array(m).fill(0);
  rhs[0] = 1;
  const alpha = solveSmallLinear(JtJ, rhs);

  const weights: number[] = [];
  for (let k = -half; k <= half; k++) {
    let w = 0;
    for (let p = 0; p < m; p++) {
      w += alpha[p] * Math.pow(k, p);
    }
    weights.push(w);
  }
  return weights;
}

/**
 * Applies a Savitzky-Golay polynomial smoothing filter to a 1D signal array
 * using reflected boundary padding to prevent edge ringing.
 */
export function applySavitzkyGolayFilter(
  values: number[],
  windowSize: number = 7,
  polyOrder: 2 | 3 = 2
): number[] {
  const n = values.length;
  if (n < 5) return [...values];

  const weights = computeSavitzkyGolayWeights(windowSize, polyOrder);
  const half = (weights.length - 1) / 2;
  const out = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let k = -half; k <= half; k++) {
      let idx = i + k;
      if (idx < 0) idx = -idx;
      if (idx >= n) idx = 2 * (n - 1) - idx;
      idx = Math.max(0, Math.min(n - 1, idx));
      acc += values[idx] * weights[k + half];
    }
    out[i] = acc;
  }

  return out;
}

/**
 * Applies a Zero-Phase 4th-Order Butterworth Low-Pass Filter (forward-backward 'filtfilt'
 * of a 2nd-order bilinear Butterworth biquad section) to a 1D signal.
 */
export function applyZeroPhaseButterworthFilter(
  values: number[],
  sampleRateHz: number,
  cutoffHz: number
): number[] {
  const n = values.length;
  if (n < 4 || sampleRateHz <= 0 || cutoffHz <= 0) return [...values];

  const nyquist = 0.5 * sampleRateHz;
  const safeCutoff = Math.max(0.001 * nyquist, Math.min(0.95 * nyquist, cutoffHz));

  // Pre-warped bilinear frequency
  const omega = Math.tan((Math.PI * safeCutoff) / sampleRateHz);
  const omega2 = omega * omega;
  const sqrt2 = Math.SQRT2;
  const k = 1 + sqrt2 * omega + omega2;

  const b0 = omega2 / k;
  const b1 = (2 * omega2) / k;
  const b2 = omega2 / k;
  const a1 = (2 * (omega2 - 1)) / k;
  const a2 = (1 - sqrt2 * omega + omega2) / k;

  // Pad signal at both ends with odd-symmetric reflection to eliminate startup transient
  const padLen = Math.min(n - 1, 12);
  const padded: number[] = [];
  const firstVal = values[0];
  const lastVal = values[n - 1];

  for (let i = padLen; i >= 1; i--) {
    padded.push(2 * firstVal - values[i]);
  }
  for (let i = 0; i < n; i++) {
    padded.push(values[i]);
  }
  for (let i = 1; i <= padLen; i++) {
    padded.push(2 * lastVal - values[n - 1 - i]);
  }

  const runBiquad = (input: number[]): number[] => {
    const out = new Array<number>(input.length);
    let x1 = input[0];
    let x2 = input[0];
    let y1 = input[0];
    let y2 = input[0];
    for (let i = 0; i < input.length; i++) {
      const x0 = input[i];
      const y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
      out[i] = y0;
      x2 = x1;
      x1 = x0;
      y2 = y1;
      y1 = y0;
    }
    return out;
  };

  // Forward pass (2nd order) + Reverse pass (4th order zero-phase)
  const forward = runBiquad(padded);
  const reversed = [...forward].reverse();
  const backward = runBiquad(reversed).reverse();

  return backward.slice(padLen, padLen + n);
}

/**
 * Resolves a step's effective (x, y, z, roll, pitch, yaw) from its selected RelativeReferenceFrameMode
 * ('M_wrt_L', 'M_wrt_A', 'L_wrt_A', or 'camera_world'), falling back to the step's base coordinates
 * when multi-body relative frames are not present.
 */
export function resolveStepForReferenceFrame(
  step: PointStep,
  referenceFrameMode: RelativeReferenceFrameMode = 'M_wrt_L',
  activeVirtualPointId?: string
): PointStep {
  let resolved: PointStep = step;
  if (step.relativeFrames) {
    const rel = step.relativeFrames[referenceFrameMode];
    if (rel) {
      resolved = {
        ...step,
        x: rel.x,
        y: rel.y,
        z: rel.z,
        roll: rel.roll,
        pitch: rel.pitch,
        yaw: rel.yaw,
        rollDeg: rel.roll,
        elevationDeg: rel.pitch,
        azimuthDeg: rel.yaw,
        triangulationResidual: rel.rmsePx ?? step.triangulationResidual,
        sigmaX: rel.sigmaX ?? step.sigmaX,
        sigmaY: rel.sigmaY ?? step.sigmaY,
        sigmaZ: rel.sigmaZ ?? step.sigmaZ,
        sigmaRoll: rel.sigmaRoll ?? step.sigmaRoll,
        sigmaPitch: rel.sigmaPitch ?? step.sigmaPitch,
        sigmaYaw: rel.sigmaYaw ?? step.sigmaYaw,
      };
    }
  }

  // If a specific Virtual Critical Point (e.g., Nose Tip, Aft Upper Fin Tip, Tail Boattail) is selected,
  // override translational coordinates and 1-sigma translational uncertainty with the virtual point's trajectory.
  if (activeVirtualPointId && step.virtualPoints && step.virtualPoints[activeVirtualPointId]) {
    const vp = step.virtualPoints[activeVirtualPointId];
    const useAircraft = referenceFrameMode === 'M_wrt_A';
    resolved = {
      ...resolved,
      x: useAircraft && vp.xAircraft !== undefined ? vp.xAircraft : vp.x,
      y: useAircraft && vp.yAircraft !== undefined ? vp.yAircraft : vp.y,
      z: useAircraft && vp.zAircraft !== undefined ? vp.zAircraft : vp.z,
      sigmaX: vp.sigmaX ?? resolved.sigmaX,
      sigmaY: vp.sigmaY ?? resolved.sigmaY,
      sigmaZ: vp.sigmaZ ?? resolved.sigmaZ,
    };
  }

  return resolved;
}

/**
 * Applies the selected SignalFilterConfig ('raw', 'savgol', or 'butterworth') and
 * RelativeReferenceFrameMode across contiguous valid segments of a PointStep array,
 * and recomputes smoothed 1st and 2nd derivatives (vx, vy, vz, v, ax, ay, az, a, ω, α).
 */
export function conditionStepsForGraphing(
  steps: PointStep[],
  filterConfig?: SignalFilterConfig,
  referenceFrameMode: RelativeReferenceFrameMode = 'M_wrt_L',
  activeVirtualPointId?: string
): PointStep[] {
  if (!steps || steps.length === 0) return [];

  // Map steps through the selected relative reference frame and virtual point first
  const mapped = [...steps]
    .sort((a, b) => a.frame - b.frame)
    .map((s) => resolveStepForReferenceFrame(s, referenceFrameMode, activeVirtualPointId));

  if (!filterConfig || filterConfig.type === 'raw') {
    return mapped;
  }

  // Estimate sample rate Hz from valid consecutive steps
  const validIndices: number[] = [];
  for (let i = 0; i < mapped.length; i++) {
    if (isStepValidObservation(mapped[i])) {
      validIndices.push(i);
    }
  }
  if (validIndices.length < 4) return mapped;

  let dtSum = 0;
  let dtCount = 0;
  for (let i = 1; i < validIndices.length; i++) {
    const dt = mapped[validIndices[i]].time - mapped[validIndices[i - 1]].time;
    if (dt > 1e-7) {
      dtSum += dt;
      dtCount++;
    }
  }
  const avgDt = dtCount > 0 ? dtSum / dtCount : 0.002;
  const sampleRateHz = 1 / avgDt;

  const filterSeries = (arr: number[]): number[] => {
    if (filterConfig.type === 'savgol') {
      return applySavitzkyGolayFilter(
        arr,
        filterConfig.windowSize || 7,
        filterConfig.polyOrder || 2
      );
    }
    if (filterConfig.type === 'butterworth') {
      return applyZeroPhaseButterworthFilter(
        arr,
        sampleRateHz,
        filterConfig.cutoffHz || 45
      );
    }
    return arr;
  };

  // Unwrap angles prior to low-pass filtering so ±180° transitions are never blurred
  const validSteps = validIndices.map((idx) => mapped[idx]);
  const unwrappedRoll = unwrapAngleSequenceDeg(validSteps, 'roll');
  const unwrappedPitch = unwrapAngleSequenceDeg(validSteps, 'pitch');
  const unwrappedYaw = unwrapAngleSequenceDeg(validSteps, 'yaw');

  const xs = filterSeries(validSteps.map((s) => s.x));
  const ys = filterSeries(validSteps.map((s) => s.y));
  const zs = filterSeries(validSteps.map((s) => s.z ?? 0));

  const hasRoll = validSteps.every((s) => extractRawAngleDeg(s, 'roll') !== null);
  const hasPitch = validSteps.every((s) => extractRawAngleDeg(s, 'pitch') !== null);
  const hasYaw = validSteps.every((s) => extractRawAngleDeg(s, 'yaw') !== null);

  const rolls = hasRoll
    ? filterSeries(validSteps.map((s) => unwrappedRoll.get(s.frame) ?? 0))
    : null;
  const pitches = hasPitch
    ? filterSeries(validSteps.map((s) => unwrappedPitch.get(s.frame) ?? 0))
    : null;
  const yaws = hasYaw
    ? filterSeries(validSteps.map((s) => unwrappedYaw.get(s.frame) ?? 0))
    : null;

  const result = mapped.map((s) => ({ ...s }));

  for (let k = 0; k < validIndices.length; k++) {
    const idx = validIndices[k];
    result[idx].x = xs[k];
    result[idx].y = ys[k];
    if (result[idx].z !== undefined) {
      result[idx].z = zs[k];
    }
    if (rolls) {
      result[idx].roll = rolls[k];
      result[idx].rollDeg = rolls[k];
    }
    if (pitches) {
      result[idx].pitch = pitches[k];
      result[idx].elevationDeg = pitches[k];
    }
    if (yaws) {
      result[idx].yaw = yaws[k];
      result[idx].azimuthDeg = yaws[k];
    }
  }

  // Recompute clean 1st derivatives (velocity & angular velocity) from conditioned coordinates
  for (let k = 0; k < validIndices.length; k++) {
    const idx = validIndices[k];
    const prevIdx = validIndices[Math.max(0, k - 1)];
    const nextIdx = validIndices[Math.min(validIndices.length - 1, k + 1)];
    const dt = Math.max(1e-7, result[nextIdx].time - result[prevIdx].time);

    result[idx].vx = (result[nextIdx].x - result[prevIdx].x) / dt;
    result[idx].vy = (result[nextIdx].y - result[prevIdx].y) / dt;
    result[idx].vz = ((result[nextIdx].z ?? 0) - (result[prevIdx].z ?? 0)) / dt;
    result[idx].v = Math.hypot(result[idx].vx!, result[idx].vy!, result[idx].vz!);
    result[idx].machNumber = result[idx].v! / 343.0;

    if (rolls) {
      result[idx].omegaRoll = ((result[nextIdx].roll ?? 0) - (result[prevIdx].roll ?? 0)) / dt;
    }
    if (pitches) {
      result[idx].omegaPitch = ((result[nextIdx].pitch ?? 0) - (result[prevIdx].pitch ?? 0)) / dt;
    }
    if (yaws) {
      result[idx].omegaYaw = ((result[nextIdx].yaw ?? 0) - (result[prevIdx].yaw ?? 0)) / dt;
    }
  }

  // Recompute clean 2nd derivatives (acceleration & angular acceleration)
  for (let k = 0; k < validIndices.length; k++) {
    const idx = validIndices[k];
    const prevIdx = validIndices[Math.max(0, k - 1)];
    const nextIdx = validIndices[Math.min(validIndices.length - 1, k + 1)];
    const dt = Math.max(1e-7, result[nextIdx].time - result[prevIdx].time);

    result[idx].ax = ((result[nextIdx].vx ?? 0) - (result[prevIdx].vx ?? 0)) / dt;
    result[idx].ay = ((result[nextIdx].vy ?? 0) - (result[prevIdx].vy ?? 0)) / dt;
    result[idx].az = ((result[nextIdx].vz ?? 0) - (result[prevIdx].vz ?? 0)) / dt;
    result[idx].a = Math.hypot(result[idx].ax!, result[idx].ay!, result[idx].az!);
    result[idx].gForce = result[idx].a! / 9.80665;
  }

  return result;
}

// ============================================================================
// 2. CHANNEL CLASSIFICATION, POLARITY & AEROSPACE NED TRANSFORMATIONS
// ============================================================================

/**
 * Checks whether a variable belongs to the rotational channel family (Roll, Pitch, Yaw).
 */
export function isRotationalChannel(variable: string): boolean {
  return (
    variable === 'roll' ||
    variable === 'pitch' ||
    variable === 'yaw' ||
    variable === 'omegaRoll' ||
    variable === 'omegaPitch' ||
    variable === 'omegaYaw' ||
    variable === 'alphaRoll' ||
    variable === 'alphaPitch' ||
    variable === 'alphaYaw'
  );
}

/**
 * Checks whether a variable belongs to the translational displacement/coordinate family.
 */
export function isTranslationalChannel(variable: string): boolean {
  return (
    variable === 'x' ||
    variable === 'y' ||
    variable === 'z' ||
    variable === 'distX' ||
    variable === 'distY' ||
    variable === 'distZ' ||
    variable === 'slantRange' ||
    variable === 'pathLength'
  );
}

/**
 * Checks whether 3D vector magnitude or cumulative path length is applicable to a variable.
 * Rotational channels (Roll, Pitch, Yaw) must NEVER have 3D translational vector magnitude applied.
 */
export function isVectorOrPathTransformAllowed(
  variable: string,
  mode: GraphTransformMode
): boolean {
  if (mode === 'signed' || mode === 'abs') return true;
  if (isRotationalChannel(variable) || variable === 't') {
    return false;
  }
  if (mode === 'path_length') {
    return isTranslationalChannel(variable);
  }
  if (mode === 'magnitude') {
    return (
      isTranslationalChannel(variable) ||
      variable === 'vx' ||
      variable === 'vy' ||
      variable === 'vz' ||
      variable === 'v' ||
      variable === 'ax' ||
      variable === 'ay' ||
      variable === 'az' ||
      variable === 'a'
    );
  }
  return true;
}

/**
 * Swaps the horizontal and vertical axis variables.
 */
export function swapGraphAxes(
  varX: GraphAxisVariable,
  varY: PlotVariable
): { varX: GraphAxisVariable; varY: PlotVariable } {
  return {
    varX: varY,
    varY: varX as PlotVariable,
  };
}

export const PARENT_SIX_DOF_CHANNEL_MAP: Record<string, SixDofChannel | undefined> = {
  x: 'x',
  distX: 'x',
  vx: 'x',
  ax: 'x',
  y: 'y',
  distY: 'y',
  vy: 'y',
  ay: 'y',
  z: 'z',
  distZ: 'z',
  vz: 'z',
  az: 'z',
  roll: 'roll',
  omegaRoll: 'roll',
  alphaRoll: 'roll',
  pitch: 'pitch',
  omegaPitch: 'pitch',
  alphaPitch: 'pitch',
  yaw: 'yaw',
  omegaYaw: 'yaw',
  alphaYaw: 'yaw',
};

export function getParentSixDofChannel(variable: string): SixDofChannel | undefined {
  return PARENT_SIX_DOF_CHANNEL_MAP[variable];
}

/**
 * Checks whether a variable's parent 6-DOF channel is configured as 'abs_positive'
 * in the 6-DOF Sign & Direction Matrix.
 */
export function isChannelRectifiedPositive(
  variable: string,
  channelSignConfig?: SixDofSignMatrixConfig
): boolean {
  const mappedCh = getParentSixDofChannel(variable);
  if (!mappedCh || !channelSignConfig || !channelSignConfig[mappedCh]) return false;
  const rule = channelSignConfig[mappedCh];
  return rule.mode === 'abs_positive' || rule.rectify === 'abs_positive';
}

/**
 * Computes the sign multiplier (+1 or -1) for a variable under the active
 * Aerospace Coordinate Convention ('ENU_Z_UP' vs 'NED_Z_DOWN'), the 6-DOF Sign Matrix
 * (`channelSignConfig`), and per-channel polarity toggle (`invertChannels`).
 *
 * All velocity (vx, vy, vz), acceleration (ax, ay, az), and angular rate/acceleration
 * (omega*, alpha*) derivatives automatically inherit the exact sign multiplier of their parent axis.
 */
export function getChannelPolaritySign(
  variable: string,
  coordConvention: AerospaceCoordConvention = 'ENU_Z_UP',
  invertChannels?: Partial<Record<SixDofChannel, boolean>>,
  channelSignConfig?: SixDofSignMatrixConfig
): number {
  let sign = 1;

  if (coordConvention === 'NED_Z_DOWN') {
    if (
      variable === 'z' ||
      variable === 'vz' ||
      variable === 'az' ||
      variable === 'pitch' ||
      variable === 'omegaPitch' ||
      variable === 'alphaPitch'
    ) {
      sign *= -1;
    }
  }

  const mappedCh = getParentSixDofChannel(variable);
  if (mappedCh) {
    const rule = channelSignConfig?.[mappedCh];
    const isRuleInverted = Boolean(rule && (rule.mode === 'inverted' || rule.multiplier === -1));
    const isLegacyInverted = Boolean(invertChannels && invertChannels[mappedCh]);
    if (isRuleInverted || isLegacyInverted) {
      sign *= -1;
    }
  }

  return sign;
}

/**
 * Formats a compact, human-readable summary of the active 6-DOF Sign & Direction Matrix
 * for the 22px Telemetry Context Strip and Certified Defense CSV metadata header.
 */
export function formatSignMatrixSummary(
  coordConvention: AerospaceCoordConvention = 'NED_Z_DOWN',
  channelSignConfig?: SixDofSignMatrixConfig,
  invertChannels?: Partial<Record<SixDofChannel, boolean>>,
  compact: boolean = false
): string {
  const matrix = channelSignConfig || getDefaultSignMatrixForConvention(coordConvention);
  const shortDirs: Record<SixDofChannel, string> =
    coordConvention === 'NED_Z_DOWN'
      ? {
          x: 'Nose',
          y: 'Right',
          z: 'Down',
          roll: 'Right',
          pitch: 'Nose Up',
          yaw: 'Right',
        }
      : {
          x: 'Fwd',
          y: 'Left/Up',
          z: 'Up',
          roll: 'Right',
          pitch: 'Nose Up',
          yaw: 'Right',
        };

  const formatCh = (ch: SixDofChannel, label: string) => {
    const rule = matrix[ch];
    const isInv =
      Boolean(rule && (rule.mode === 'inverted' || rule.multiplier === -1)) ||
      Boolean(invertChannels?.[ch]);
    const isAbs = Boolean(rule && (rule.mode === 'abs_positive' || rule.rectify === 'abs_positive'));
    const dir = compact ? shortDirs[ch] : rule?.directionLabel || shortDirs[ch];
    if (isAbs) return `${label}|+|:${dir}`;
    if (isInv) return `${label}-:${dir}(Inv)`;
    return `${label}+:${dir}`;
  };

  const prefix = coordConvention === 'NED_Z_DOWN' ? 'Missile NED' : 'Cartesian ENU';
  if (compact) {
    return `${prefix} (${formatCh('x', 'X')}, ${formatCh('y', 'Y')}, ${formatCh('z', 'Z')} | ${formatCh('roll', 'R')}, ${formatCh('pitch', 'P')}, ${formatCh('yaw', 'Y')})`;
  }
  return `${prefix} [${formatCh('x', 'X')}, ${formatCh('y', 'Y')}, ${formatCh('z', 'Z')}, ${formatCh('roll', 'Roll')}, ${formatCh('pitch', 'Pitch')}, ${formatCh('yaw', 'Yaw')}]`;
}

/**
 * Computes the principal shortest angular difference (targetDeg - refDeg) wrapped to [-180°, +180°].
 */
export function shortestAngleDiffDeg(targetDeg: number, refDeg: number): number {
  const diffRad = ((targetDeg - refDeg) * Math.PI) / 180;
  const wrappedRad = Math.atan2(Math.sin(diffRad), Math.cos(diffRad));
  const deg = (wrappedRad * 180) / Math.PI;
  if (Math.abs(deg + 180) < 1e-9 && targetDeg - refDeg > 0) {
    return 180;
  }
  return Object.is(deg, -0) ? 0 : deg;
}

/**
 * Extracts raw angle in degrees for Roll, Pitch, or Yaw from a PointStep.
 * Returns null if the observation is missing, rejected, or non-finite.
 */
export function extractRawAngleDeg(
  step: PointStep | null | undefined,
  channel: 'roll' | 'pitch' | 'yaw'
): number | null {
  if (!step || step.rejected) return null;
  let val: number | null | undefined = null;
  if (channel === 'roll') {
    val = step.roll !== undefined && step.roll !== null ? step.roll : step.rollDeg;
  } else if (channel === 'pitch') {
    val = step.pitch !== undefined && step.pitch !== null ? step.pitch : step.elevationDeg;
  } else if (channel === 'yaw') {
    val = step.yaw !== undefined && step.yaw !== null ? step.yaw : step.azimuthDeg;
  }
  if (val === null || val === undefined || !Number.isFinite(val)) {
    return null;
  }
  return val;
}

/**
 * Unwraps a chronological sequence of rotational observations across ±180° branch cuts.
 * Returns a Map from frame number to continuous unwrapped angle in degrees.
 */
export function unwrapAngleSequenceDeg(
  steps: PointStep[],
  channel: 'roll' | 'pitch' | 'yaw'
): Map<number, number> {
  const unwrappedMap = new Map<number, number>();
  const sorted = [...steps].sort((a, b) => a.frame - b.frame);

  let prevRaw: number | null = null;
  let accumulated = 0;

  for (const step of sorted) {
    const raw = extractRawAngleDeg(step, channel);
    if (raw === null) continue;

    if (prevRaw === null) {
      accumulated = raw;
    } else {
      const delta = shortestAngleDiffDeg(raw, prevRaw);
      accumulated += delta;
    }
    prevRaw = raw;
    unwrappedMap.set(step.frame, accumulated);
  }

  return unwrappedMap;
}

/**
 * Checks whether a PointStep has valid translational coordinates.
 */
export function isStepValidObservation(step: PointStep | null | undefined): boolean {
  if (!step || step.rejected) return false;
  if (step.x === null || step.x === undefined || !Number.isFinite(step.x)) return false;
  if (step.y === null || step.y === undefined || !Number.isFinite(step.y)) return false;
  if (step.time === null || step.time === undefined || !Number.isFinite(step.time)) return false;
  return true;
}

/**
 * Resolves the reference observation step corresponding to user-selected reference frame t0.
 */
export function resolveReferenceStep(
  steps: PointStep[],
  referenceFrameT0?: number | null
): PointStep | null {
  const validSteps = [...steps]
    .filter((s) => isStepValidObservation(s))
    .sort((a, b) => a.frame - b.frame);

  if (validSteps.length === 0) return null;

  if (referenceFrameT0 === null || referenceFrameT0 === undefined) {
    return validSteps[0];
  }

  const exact = validSteps.find((s) => s.frame === referenceFrameT0);
  if (exact) return exact;

  let best = validSteps[0];
  let bestDist = Math.abs(best.frame - referenceFrameT0);
  for (const s of validSteps) {
    const d = Math.abs(s.frame - referenceFrameT0);
    if (d < bestDist) {
      best = s;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Precomputes cumulative 3D travelled path length L(t) for all valid observations,
 * anchored at L(t0) = 0.
 */
export function computeCumulativePathLengthMap(
  steps: PointStep[],
  refFrame?: number | null
): Map<number, number> {
  const pathMap = new Map<number, number>();
  const validSteps = [...steps]
    .filter((s) => isStepValidObservation(s))
    .sort((a, b) => a.frame - b.frame);

  if (validSteps.length === 0) return pathMap;

  const refStep = resolveReferenceStep(validSteps, refFrame);
  if (!refStep) return pathMap;

  const refIdx = validSteps.findIndex((s) => s.frame === refStep.frame);
  if (refIdx === -1) return pathMap;

  pathMap.set(refStep.frame, 0);

  // Forward accumulation from t0
  let forwardSum = 0;
  for (let i = refIdx + 1; i < validSteps.length; i++) {
    const prev = validSteps[i - 1];
    const curr = validSteps[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const dz = (curr.z ?? 0) - (prev.z ?? 0);
    forwardSum += Math.hypot(dx, dy, dz);
    pathMap.set(curr.frame, forwardSum);
  }

  // Backward accumulation prior to t0 (non-negative distance from t0)
  let backwardSum = 0;
  for (let i = refIdx - 1; i >= 0; i--) {
    const next = validSteps[i + 1];
    const curr = validSteps[i];
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const dz = (next.z ?? 0) - (curr.z ?? 0);
    backwardSum += Math.hypot(dx, dy, dz);
    pathMap.set(curr.frame, backwardSum);
  }

  return pathMap;
}

export interface EvaluateChannelOptions {
  referenceFrameT0?: number | null;
  relativeToOrigin?: boolean;
  useRelativeTime?: boolean;
  angleWrapMode?: AngleWrapMode;
  angleUnit?: AngleUnit;
  coordConvention?: AerospaceCoordConvention;
  invertChannels?: Partial<Record<SixDofChannel, boolean>>;
  channelSignConfig?: SixDofSignMatrixConfig;
  extraInvert?: boolean;
}

/**
 * Evaluates a single channel/variable value at a given step within a track sequence.
 * Preserves null for missing or rejected observations (never invents artificial zeros).
 *
 * SAFEGUARD 1 (Filter & Differentiate Before Rectifying):
 * Smoothing (Savitzky-Golay / Butterworth) and finite-difference differentiation (v, a, omega, alpha)
 * are always computed on the continuous signed signal FIRST in `conditionStepsForGraphing`.
 * Sign multipliers (+1/-1) and positive rectification (`|q|` / `abs_positive` / `transformMode === 'abs'`)
 * are applied here at the final evaluation step so zero-crossings never create artificial derivative spikes.
 */
export function evaluateSixChannelStepValue(
  step: PointStep | null | undefined,
  allSteps: PointStep[],
  variable: GraphAxisVariable,
  transformMode: GraphTransformMode = 'signed',
  options: EvaluateChannelOptions = {}
): number | null {
  if (!step || step.rejected) return null;

  const {
    referenceFrameT0 = null,
    relativeToOrigin = true,
    useRelativeTime = true,
    angleWrapMode = 'unwrapped',
    angleUnit = 'deg',
    coordConvention = 'ENU_Z_UP',
    invertChannels = {},
    channelSignConfig,
    extraInvert = false,
  } = options;

  const refStep = resolveReferenceStep(allSteps, referenceFrameT0);
  const polaritySign =
    getChannelPolaritySign(variable, coordConvention, invertChannels, channelSignConfig) *
    (extraInvert ? -1 : 1);
  const shouldRectify =
    transformMode === 'abs' || isChannelRectifiedPositive(variable, channelSignConfig);

  // Time channel
  if (variable === 't') {
    if (step.time === null || step.time === undefined || !Number.isFinite(step.time)) {
      return null;
    }
    const t0 = useRelativeTime && refStep ? refStep.time : 0;
    const dt = (step.time - t0) * (extraInvert ? -1 : 1);
    const normDt = Object.is(dt, -0) ? 0 : dt;
    return transformMode === 'abs' ? Math.abs(normDt) : normDt;
  }

  // Angular rates & angular accelerations
  if (
    variable === 'omegaRoll' ||
    variable === 'omegaPitch' ||
    variable === 'omegaYaw' ||
    variable === 'alphaRoll' ||
    variable === 'alphaPitch' ||
    variable === 'alphaYaw'
  ) {
    if (transformMode === 'magnitude' || transformMode === 'path_length') {
      return null;
    }
    const rawRate = (step as any)[variable];
    if (rawRate === null || rawRate === undefined || !Number.isFinite(rawRate)) {
      return null;
    }
    const scaled =
      (angleUnit === 'rad' ? (rawRate * Math.PI) / 180 : rawRate) * polaritySign;
    const norm = Object.is(scaled, -0) ? 0 : scaled;
    return shouldRectify ? Math.abs(norm) : norm;
  }

  // Rotational orientation channels: Roll, Pitch, Yaw
  if (isRotationalChannel(variable)) {
    if (transformMode === 'magnitude' || transformMode === 'path_length') {
      return null;
    }

    const ch = variable as 'roll' | 'pitch' | 'yaw';
    const rawDeg = extractRawAngleDeg(step, ch);
    if (rawDeg === null) return null;

    let angleDeg: number;
    if (!relativeToOrigin || !refStep) {
      if (angleWrapMode === 'unwrapped') {
        const unwrappedMap = unwrapAngleSequenceDeg(allSteps, ch);
        angleDeg = unwrappedMap.get(step.frame) ?? rawDeg;
      } else {
        angleDeg = rawDeg;
      }
    } else {
      const refRawDeg = extractRawAngleDeg(refStep, ch) ?? 0;
      if (angleWrapMode === 'unwrapped') {
        const unwrappedMap = unwrapAngleSequenceDeg(allSteps, ch);
        const curUnwrapped = unwrappedMap.get(step.frame);
        const refUnwrapped = unwrappedMap.get(refStep.frame);
        if (curUnwrapped !== undefined && refUnwrapped !== undefined) {
          angleDeg = curUnwrapped - refUnwrapped;
        } else {
          angleDeg = shortestAngleDiffDeg(rawDeg, refRawDeg);
        }
      } else {
        angleDeg = shortestAngleDiffDeg(rawDeg, refRawDeg);
      }
    }

    const signedDeg = angleDeg * polaritySign;
    const scaledAngle = angleUnit === 'rad' ? (signedDeg * Math.PI) / 180 : signedDeg;
    const normalized = Object.is(scaledAngle, -0) ? 0 : scaledAngle;
    return shouldRectify ? Math.abs(normalized) : normalized;
  }

  // Check valid translational observation for positional channels
  if (!isStepValidObservation(step)) {
    return null;
  }

  const x0 = relativeToOrigin && refStep ? refStep.x : 0;
  const y0 = relativeToOrigin && refStep ? refStep.y : 0;
  const z0 = relativeToOrigin && refStep ? (refStep.z ?? 0) : 0;

  const dx = step.x - x0;
  const dy = step.y - y0;
  const dz = (step.z ?? 0) - z0;

  // Cumulative 3D path length L(t)
  if (transformMode === 'path_length' || variable === 'pathLength') {
    if (!isTranslationalChannel(variable) && variable !== 'pathLength') {
      return null;
    }
    const pathMap = computeCumulativePathLengthMap(allSteps, referenceFrameT0);
    const val = pathMap.get(step.frame);
    return val !== undefined ? val : null;
  }

  // 3D Vector Magnitude D3D(t)
  if (transformMode === 'magnitude') {
    if (isTranslationalChannel(variable)) {
      return Math.hypot(dx, dy, dz);
    }
    if (variable === 'vx' || variable === 'vy' || variable === 'vz' || variable === 'v') {
      if (step.vx == null && step.vy == null && step.v == null) return null;
      return step.v ?? Math.hypot(step.vx ?? 0, step.vy ?? 0, step.vz ?? 0);
    }
    if (variable === 'ax' || variable === 'ay' || variable === 'az' || variable === 'a') {
      if (step.ax == null && step.ay == null && step.a == null) return null;
      return step.a ?? Math.hypot(step.ax ?? 0, step.ay ?? 0, step.az ?? 0);
    }
    return null;
  }

  // Extract signed scalar value
  let raw: number | null = null;
  switch (variable) {
    case 'x':
      raw = dx * polaritySign;
      break;
    case 'y':
      raw = dy * polaritySign;
      break;
    case 'z':
      if (step.z === undefined || step.z === null) {
        raw = relativeToOrigin ? 0 : null;
      } else {
        raw = dz * polaritySign;
      }
      break;
    case 'distX':
      raw = Math.abs(step.x - (refStep?.x ?? 0)) * (extraInvert ? -1 : 1);
      break;
    case 'distY':
      raw = Math.abs(step.y - (refStep?.y ?? 0)) * (extraInvert ? -1 : 1);
      break;
    case 'distZ':
      raw = Math.abs((step.z ?? 0) - (refStep?.z ?? 0)) * (extraInvert ? -1 : 1);
      break;
    case 'slantRange':
      raw = Math.hypot(dx, dy, dz) * (extraInvert ? -1 : 1);
      break;
    case 'vx':
      raw = step.vx != null ? step.vx * polaritySign : null;
      break;
    case 'vy':
      raw = step.vy != null ? step.vy * polaritySign : null;
      break;
    case 'vz':
      raw = step.vz != null ? step.vz * polaritySign : null;
      break;
    case 'v':
      raw =
        (step.v ??
          (step.vx != null && step.vy != null
            ? Math.hypot(step.vx, step.vy, step.vz ?? 0)
            : null)) !== null
          ? (step.v ?? Math.hypot(step.vx!, step.vy!, step.vz ?? 0)) * (extraInvert ? -1 : 1)
          : null;
      break;
    case 'ax':
      raw = step.ax != null ? step.ax * polaritySign : null;
      break;
    case 'ay':
      raw = step.ay != null ? step.ay * polaritySign : null;
      break;
    case 'az':
      raw = step.az != null ? step.az * polaritySign : null;
      break;
    case 'a':
      raw =
        (step.a ??
          (step.ax != null && step.ay != null
            ? Math.hypot(step.ax, step.ay, step.az ?? 0)
            : null)) !== null
          ? (step.a ?? Math.hypot(step.ax!, step.ay!, step.az ?? 0)) * (extraInvert ? -1 : 1)
          : null;
      break;
    case 'kineticEnergy':
      raw = step.kineticEnergy != null ? step.kineticEnergy * (extraInvert ? -1 : 1) : null;
      break;
    case 'potentialEnergy':
      raw = step.potentialEnergy != null ? step.potentialEnergy * (extraInvert ? -1 : 1) : null;
      break;
    case 'totalEnergy':
      raw = step.totalEnergy != null ? step.totalEnergy * (extraInvert ? -1 : 1) : null;
      break;
    case 'mach':
      raw =
        (step.machNumber ?? (step.v != null ? step.v / 343.0 : null)) !== null
          ? (step.machNumber ?? step.v! / 343.0) * (extraInvert ? -1 : 1)
          : null;
      break;
    case 'gForce':
      raw =
        (step.gForce ?? (step.a != null ? step.a / 9.80665 : null)) !== null
          ? (step.gForce ?? step.a! / 9.80665) * (extraInvert ? -1 : 1)
          : null;
      break;
    default:
      raw = (step as any)[variable] ?? null;
  }

  if (raw === null || raw === undefined || !Number.isFinite(raw)) {
    return null;
  }

  const normalized = Object.is(raw, -0) ? 0 : raw;
  return shouldRectify ? Math.abs(normalized) : normalized;
}

export interface DerivedGraphPoint {
  frame: number;
  rawTime: number | null;
  relTime: number | null;
  plotTime: number | null;
  observationStatus: 'observed' | 'interpolated' | 'rejected' | 'missing';
  isReferenceT0: boolean;
  // Horizontal & Vertical values for current configuration
  xVal: number | null;
  ySigned: number | null;
  yAbs: number | null;
  yActive: number | null;
  yPanel2Distance: number | null;
  // 1-sigma uncertainty & confidence band bounds for active Y channel
  ySigma: number | null;
  ySignedUpper: number | null;
  ySignedLower: number | null;
  yDistUpper: number | null;
  yDistLower: number | null;
  // PnP diagnostics & marker counts
  rmsePx: number | null;
  markerCountA?: number;
  markerCountL?: number;
  markerCountM?: number;
  sigmaX?: number | null;
  sigmaY?: number | null;
  sigmaZ?: number | null;
  sigmaRoll?: number | null;
  sigmaPitch?: number | null;
  sigmaYaw?: number | null;
  fitY?: number | null;
  // Full 6-DOF channel values (signed & abs)
  dx: number | null;
  dy: number | null;
  dz: number | null;
  absX: number | null;
  absY: number | null;
  absZ: number | null;
  d3d: number | null;
  pathLength: number | null;
  rollSigned: number | null;
  pitchSigned: number | null;
  yawSigned: number | null;
  rollAbs: number | null;
  pitchAbs: number | null;
  yawAbs: number | null;
  rollActive: number | null;
  pitchActive: number | null;
  yawActive: number | null;
  xActive: number | null;
  yActiveCh: number | null;
  zActive: number | null;
}

/**
 * Extracts the 1-sigma uncertainty for a given channel from a resolved PointStep.
 */
function resolveStepChannelSigma(
  step: PointStep,
  variable: GraphAxisVariable,
  angleUnit: AngleUnit = 'deg'
): number | null {
  let sig: number | null | undefined;
  switch (variable) {
    case 'x':
    case 'distX':
      sig = step.sigmaX;
      break;
    case 'y':
    case 'distY':
      sig = step.sigmaY;
      break;
    case 'z':
    case 'distZ':
      sig = step.sigmaZ;
      break;
    case 'slantRange':
    case 'pathLength':
      if (step.sigmaX != null || step.sigmaY != null || step.sigmaZ != null) {
        sig = Math.hypot(step.sigmaX ?? 0, step.sigmaY ?? 0, step.sigmaZ ?? 0);
      }
      break;
    case 'roll':
      sig =
        step.sigmaRoll != null
          ? angleUnit === 'rad'
            ? (step.sigmaRoll * Math.PI) / 180
            : step.sigmaRoll
          : undefined;
      break;
    case 'pitch':
      sig =
        step.sigmaPitch != null
          ? angleUnit === 'rad'
            ? (step.sigmaPitch * Math.PI) / 180
            : step.sigmaPitch
          : undefined;
      break;
    case 'yaw':
      sig =
        step.sigmaYaw != null
          ? angleUnit === 'rad'
            ? (step.sigmaYaw * Math.PI) / 180
            : step.sigmaYaw
          : undefined;
      break;
    default:
      sig = undefined;
  }
  return sig != null && Number.isFinite(sig) ? sig : null;
}

/**
 * Derives a complete, non-destructive graphing dataset from a track's steps and GraphConfig.
 * Applies the selected Relative Reference Frame ('M_wrt_L', 'M_wrt_A', 'L_wrt_A', 'camera_world'),
 * Signal Conditioning Filter ('raw', 'savgol', 'butterworth'), Aerospace Coordinate Convention ('NED_Z_DOWN' vs 'ENU_Z_UP'),
 * and the 6-DOF Sign & Direction Matrix (`channelSignConfig`).
 */
export function deriveSixChannelSeries(
  steps: PointStep[],
  config: GraphConfig,
  includeMissingFrameGaps: boolean = true
): {
  points: DerivedGraphPoint[];
  referenceStep: PointStep | null;
} {
  if (!steps || steps.length === 0) {
    return { points: [], referenceStep: null };
  }

  const conditioned = conditionStepsForGraphing(
    steps,
    config.filterConfig,
    config.referenceFrameMode ?? 'M_wrt_L',
    config.activeVirtualPointId
  );
  const sorted = [...conditioned].sort((a, b) => a.frame - b.frame);
  const refStep = resolveReferenceStep(sorted, config.referenceFrameT0);

  const evalOpts: EvaluateChannelOptions = {
    referenceFrameT0: config.referenceFrameT0 ?? null,
    relativeToOrigin: config.relativeToOrigin ?? true,
    useRelativeTime: config.useRelativeTime ?? true,
    angleWrapMode: config.angleWrapMode ?? 'unwrapped',
    angleUnit: config.angleUnit ?? 'deg',
    coordConvention: config.coordConvention ?? 'ENU_Z_UP',
    invertChannels: config.invertChannels ?? {},
    channelSignConfig: config.channelSignConfig,
  };

  // Determine typical frame step size to detect missing frame gaps
  const frameDiffs: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const diff = sorted[i].frame - sorted[i - 1].frame;
    if (diff > 0) frameDiffs.push(diff);
  }
  const nominalStep = frameDiffs.length > 0 ? Math.min(...frameDiffs) : 1;

  const resultPoints: DerivedGraphPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const step = sorted[i];

    // If there is a frame gap > nominalStep and we are plotting against time, insert an explicit gap marker
    if (
      includeMissingFrameGaps &&
      i > 0 &&
      sorted[i].frame - sorted[i - 1].frame > nominalStep * 1.5
    ) {
      const gapFrame = sorted[i - 1].frame + nominalStep;
      const estDt =
        (sorted[i].time - sorted[i - 1].time) /
        Math.max(1, sorted[i].frame - sorted[i - 1].frame);
      const gapRawTime = sorted[i - 1].time + estDt * nominalStep;
      const gapRelTime = refStep ? gapRawTime - refStep.time : gapRawTime;
      const gapPlotTime = (config.useRelativeTime ?? true) ? gapRelTime : gapRawTime;

      resultPoints.push({
        frame: gapFrame,
        rawTime: Number(gapRawTime.toFixed(5)),
        relTime: Number(gapRelTime.toFixed(5)),
        plotTime: Number(gapPlotTime.toFixed(5)),
        observationStatus: 'missing',
        isReferenceT0: false,
        xVal: config.varX === 't' ? Number(gapPlotTime.toFixed(5)) : null,
        ySigned: null,
        yAbs: null,
        yActive: null,
        yPanel2Distance: null,
        ySigma: null,
        ySignedUpper: null,
        ySignedLower: null,
        yDistUpper: null,
        yDistLower: null,
        rmsePx: null,
        dx: null,
        dy: null,
        dz: null,
        absX: null,
        absY: null,
        absZ: null,
        d3d: null,
        pathLength: null,
        rollSigned: null,
        pitchSigned: null,
        yawSigned: null,
        rollAbs: null,
        pitchAbs: null,
        yawAbs: null,
        rollActive: null,
        pitchActive: null,
        yawActive: null,
        xActive: null,
        yActiveCh: null,
        zActive: null,
      });
    }

    const isRejected = Boolean(step.rejected);
    const isInterp = Boolean(
      step.isInterpolated || step.isInterpolatedCam1 || step.isInterpolatedCam2
    );
    const obsStatus: DerivedGraphPoint['observationStatus'] = isRejected
      ? 'rejected'
      : !isStepValidObservation(step)
      ? 'missing'
      : isInterp
      ? 'interpolated'
      : 'observed';

    const rawTime = step.time != null && Number.isFinite(step.time) ? step.time : null;
    const relTime =
      rawTime !== null && refStep ? rawTime - refStep.time : rawTime;
    const plotTime = (config.useRelativeTime ?? true) ? relTime : rawTime;

    const dx = evaluateSixChannelStepValue(step, sorted, 'x', 'signed', evalOpts);
    const dy = evaluateSixChannelStepValue(step, sorted, 'y', 'signed', evalOpts);
    const dz = evaluateSixChannelStepValue(step, sorted, 'z', 'signed', evalOpts);

    const absX = evaluateSixChannelStepValue(step, sorted, 'x', 'abs', evalOpts);
    const absY = evaluateSixChannelStepValue(step, sorted, 'y', 'abs', evalOpts);
    const absZ = evaluateSixChannelStepValue(step, sorted, 'z', 'abs', evalOpts);

    const d3d = evaluateSixChannelStepValue(step, sorted, 'x', 'magnitude', evalOpts);
    const pathLength = evaluateSixChannelStepValue(step, sorted, 'x', 'path_length', evalOpts);

    const rollSigned = evaluateSixChannelStepValue(step, sorted, 'roll', 'signed', evalOpts);
    const pitchSigned = evaluateSixChannelStepValue(step, sorted, 'pitch', 'signed', evalOpts);
    const yawSigned = evaluateSixChannelStepValue(step, sorted, 'yaw', 'signed', evalOpts);

    const rollAbs = evaluateSixChannelStepValue(step, sorted, 'roll', 'abs', evalOpts);
    const pitchAbs = evaluateSixChannelStepValue(step, sorted, 'pitch', 'abs', evalOpts);
    const yawAbs = evaluateSixChannelStepValue(step, sorted, 'yaw', 'abs', evalOpts);

    const rotTransform: GraphTransformMode =
      config.transformMode === 'magnitude' || config.transformMode === 'path_length'
        ? 'abs'
        : config.transformMode;

    const xActive = evaluateSixChannelStepValue(step, sorted, 'x', config.transformMode, evalOpts);
    const yActiveCh = evaluateSixChannelStepValue(step, sorted, 'y', config.transformMode, evalOpts);
    const zActive = evaluateSixChannelStepValue(step, sorted, 'z', config.transformMode, evalOpts);

    const rollActive = evaluateSixChannelStepValue(step, sorted, 'roll', rotTransform, evalOpts);
    const pitchActive = evaluateSixChannelStepValue(step, sorted, 'pitch', rotTransform, evalOpts);
    const yawActive = evaluateSixChannelStepValue(step, sorted, 'yaw', rotTransform, evalOpts);

    const effectiveTransformX: GraphTransformMode =
      config.transformModeX !== undefined
        ? config.transformModeX
        : config.varX === 't'
        ? 'signed'
        : isRotationalChannel(config.varX)
        ? rotTransform
        : config.transformMode;
    const xVal = evaluateSixChannelStepValue(
      step,
      sorted,
      config.varX,
      effectiveTransformX,
      {
        ...evalOpts,
        extraInvert: Boolean(config.invertVarX),
      }
    );

    const ySigned = evaluateSixChannelStepValue(step, sorted, config.varY, 'signed', evalOpts);
    const yAbs = evaluateSixChannelStepValue(step, sorted, config.varY, 'abs', evalOpts);

    const effectiveTransformY: GraphTransformMode = isRotationalChannel(config.varY)
      ? rotTransform
      : config.transformMode;
    const yActive = evaluateSixChannelStepValue(
      step,
      sorted,
      config.varY,
      effectiveTransformY,
      evalOpts
    );

    const p2Mode = config.panel2TransformMode || 'abs';
    const effectiveP2Mode: GraphTransformMode =
      !isVectorOrPathTransformAllowed(config.varY, p2Mode)
        ? 'abs'
        : p2Mode;
    const yPanel2Distance = evaluateSixChannelStepValue(
      step,
      sorted,
      config.varY,
      effectiveP2Mode,
      evalOpts
    );

    const ySigma = resolveStepChannelSigma(step, config.varY, config.angleUnit ?? 'deg');
    const ySignedUpper =
      ySigned !== null && ySigma !== null ? ySigned + ySigma : null;
    const ySignedLower =
      ySigned !== null && ySigma !== null ? ySigned - ySigma : null;
    const yDistUpper =
      yPanel2Distance !== null && ySigma !== null ? yPanel2Distance + ySigma : null;
    const yDistLower =
      yPanel2Distance !== null && ySigma !== null
        ? Math.max(0, yPanel2Distance - ySigma)
        : null;

    const roundOrNull = (v: number | null, digits = 5): number | null =>
      v !== null && Number.isFinite(v) ? Number(v.toFixed(digits)) : null;

    resultPoints.push({
      frame: step.frame,
      rawTime: roundOrNull(rawTime, 5),
      relTime: roundOrNull(relTime, 5),
      plotTime: roundOrNull(plotTime, 5),
      observationStatus: obsStatus,
      isReferenceT0: Boolean(refStep && step.frame === refStep.frame),
      xVal: roundOrNull(xVal, 5),
      ySigned: roundOrNull(ySigned, 5),
      yAbs: roundOrNull(yAbs, 5),
      yActive: roundOrNull(yActive, 5),
      yPanel2Distance: roundOrNull(yPanel2Distance, 5),
      ySigma: roundOrNull(ySigma, 5),
      ySignedUpper: roundOrNull(ySignedUpper, 5),
      ySignedLower: roundOrNull(ySignedLower, 5),
      yDistUpper: roundOrNull(yDistUpper, 5),
      yDistLower: roundOrNull(yDistLower, 5),
      rmsePx: roundOrNull(step.triangulationResidual ?? step.residual ?? null, 4),
      markerCountA: step.markerCountA,
      markerCountL: step.markerCountL,
      markerCountM: step.markerCountM,
      sigmaX: roundOrNull(step.sigmaX ?? null, 5),
      sigmaY: roundOrNull(step.sigmaY ?? null, 5),
      sigmaZ: roundOrNull(step.sigmaZ ?? null, 5),
      sigmaRoll: roundOrNull(step.sigmaRoll ?? null, 4),
      sigmaPitch: roundOrNull(step.sigmaPitch ?? null, 4),
      sigmaYaw: roundOrNull(step.sigmaYaw ?? null, 4),
      dx: roundOrNull(dx, 5),
      dy: roundOrNull(dy, 5),
      dz: roundOrNull(dz, 5),
      absX: roundOrNull(absX, 5),
      absY: roundOrNull(absY, 5),
      absZ: roundOrNull(absZ, 5),
      d3d: roundOrNull(d3d, 5),
      pathLength: roundOrNull(pathLength, 5),
      rollSigned: roundOrNull(rollSigned, 4),
      pitchSigned: roundOrNull(pitchSigned, 4),
      yawSigned: roundOrNull(yawSigned, 4),
      rollAbs: roundOrNull(rollAbs, 4),
      pitchAbs: roundOrNull(pitchAbs, 4),
      yawAbs: roundOrNull(yawAbs, 4),
      rollActive: roundOrNull(rollActive, 4),
      pitchActive: roundOrNull(pitchActive, 4),
      yawActive: roundOrNull(yawActive, 4),
      xActive: roundOrNull(xActive, 5),
      yActiveCh: roundOrNull(yActiveCh, 5),
      zActive: roundOrNull(zActive, 5),
    });
  }

  return {
    points: resultPoints,
    referenceStep: refStep,
  };
}

/**
 * Returns the physical unit string for any graph variable.
 */
export function getChannelUnit(
  variable: GraphAxisVariable,
  angleUnit: AngleUnit = 'deg'
): string {
  switch (variable) {
    case 't':
      return 's';
    case 'x':
    case 'y':
    case 'z':
    case 'distX':
    case 'distY':
    case 'distZ':
    case 'slantRange':
    case 'pathLength':
      return 'm';
    case 'roll':
    case 'pitch':
    case 'yaw':
      return angleUnit === 'rad' ? 'rad' : '°';
    case 'omegaRoll':
    case 'omegaPitch':
    case 'omegaYaw':
      return angleUnit === 'rad' ? 'rad/s' : '°/s';
    case 'alphaRoll':
    case 'alphaPitch':
    case 'alphaYaw':
      return angleUnit === 'rad' ? 'rad/s²' : '°/s²';
    case 'vx':
    case 'vy':
    case 'vz':
    case 'v':
      return 'm/s';
    case 'ax':
    case 'ay':
    case 'az':
    case 'a':
      return 'm/s²';
    case 'kineticEnergy':
    case 'potentialEnergy':
    case 'totalEnergy':
      return 'J';
    case 'mach':
      return 'Mach';
    case 'gForce':
      return 'g';
    default:
      return '';
  }
}

/**
 * Returns a descriptive scientific label for any graph variable and transformation mode.
 */
export function getChannelLabel(
  variable: GraphAxisVariable,
  transformMode: GraphTransformMode = 'signed',
  relativeToOrigin: boolean = true,
  angleUnit: AngleUnit = 'deg'
): string {
  const unit = getChannelUnit(variable, angleUnit);

  if (variable === 't') {
    return relativeToOrigin ? `Relative Time Δt (${unit})` : `Time t (${unit})`;
  }

  if (transformMode === 'path_length' || variable === 'pathLength') {
    return `Cumulative 3D Path Length L(t) (${unit})`;
  }

  if (transformMode === 'magnitude') {
    if (isTranslationalChannel(variable)) {
      return relativeToOrigin
        ? `3D Displacement Magnitude D₃D(t) (${unit})`
        : `3D Position Magnitude ||r(t)|| (${unit})`;
    }
    if (variable === 'vx' || variable === 'vy' || variable === 'vz' || variable === 'v') {
      return `3D Speed Magnitude ||v(t)|| (${unit})`;
    }
    if (variable === 'ax' || variable === 'ay' || variable === 'az' || variable === 'a') {
      return `3D Acceleration Magnitude ||a(t)|| (${unit})`;
    }
  }

  const baseLabels: Record<string, { rel: string; raw: string; sym: string }> = {
    x: { rel: 'ΔX Displacement', raw: 'X Position', sym: 'ΔX' },
    y: { rel: 'ΔY Displacement', raw: 'Y Position', sym: 'ΔY' },
    z: { rel: 'ΔZ Displacement', raw: 'Z Position', sym: 'ΔZ' },
    roll: { rel: 'ΔRoll Angle (φ)', raw: 'Roll Angle (φ)', sym: 'ΔRoll' },
    pitch: { rel: 'ΔPitch Angle (θ)', raw: 'Pitch Angle (θ)', sym: 'ΔPitch' },
    yaw: { rel: 'ΔYaw Angle (ψ)', raw: 'Yaw Angle (ψ)', sym: 'ΔYaw' },
    omegaRoll: { rel: 'Roll Rate ω_φ', raw: 'Roll Rate ω_φ', sym: 'ω_φ' },
    omegaPitch: { rel: 'Pitch Rate ω_θ', raw: 'Pitch Rate ω_θ', sym: 'ω_θ' },
    omegaYaw: { rel: 'Yaw Rate ω_ψ', raw: 'Yaw Rate ω_ψ', sym: 'ω_ψ' },
    alphaRoll: { rel: 'Roll Accel α_φ', raw: 'Roll Accel α_φ', sym: 'α_φ' },
    alphaPitch: { rel: 'Pitch Accel α_θ', raw: 'Pitch Accel α_θ', sym: 'α_θ' },
    alphaYaw: { rel: 'Yaw Accel α_ψ', raw: 'Yaw Accel α_ψ', sym: 'α_ψ' },
    distX: { rel: 'X Distance |ΔX|', raw: 'X Distance |ΔX|', sym: '|ΔX|' },
    distY: { rel: 'Y Distance |ΔY|', raw: 'Y Distance |ΔY|', sym: '|ΔY|' },
    distZ: { rel: 'Z Distance |ΔZ|', raw: 'Z Distance |ΔZ|', sym: '|ΔZ|' },
    slantRange: { rel: '3D Radial Distance D₃D', raw: 'Slant Range R', sym: 'D₃D' },
    vx: { rel: 'Velocity vx', raw: 'Velocity vx', sym: 'vx' },
    vy: { rel: 'Velocity vy', raw: 'Velocity vy', sym: 'vy' },
    vz: { rel: 'Velocity vz', raw: 'Velocity vz', sym: 'vz' },
    v: { rel: '3D Speed v', raw: '3D Speed v', sym: 'v' },
    ax: { rel: 'Acceleration ax', raw: 'Acceleration ax', sym: 'ax' },
    ay: { rel: 'Acceleration ay', raw: 'Acceleration ay', sym: 'ay' },
    az: { rel: 'Acceleration az', raw: 'Acceleration az', sym: 'az' },
    a: { rel: '3D Acceleration a', raw: '3D Acceleration a', sym: 'a' },
    kineticEnergy: { rel: 'Kinetic Energy K', raw: 'Kinetic Energy K', sym: 'K' },
    potentialEnergy: { rel: 'Potential Energy U', raw: 'Potential Energy U', sym: 'U' },
    totalEnergy: { rel: 'Total Energy E', raw: 'Total Energy E', sym: 'E' },
    mach: { rel: 'Mach Number M', raw: 'Mach Number M', sym: 'M' },
    gForce: { rel: 'G-Force', raw: 'G-Force', sym: 'g' },
  };

  const entry = baseLabels[variable] || {
    rel: String(variable),
    raw: String(variable),
    sym: String(variable),
  };

  if (transformMode === 'abs') {
    const sym = relativeToOrigin ? entry.sym : String(variable).toUpperCase();
    return `Distance |${sym}(t)| (${unit})`;
  }

  const labelText = relativeToOrigin ? entry.rel : entry.raw;
  return `${labelText} (${unit})`;
}
