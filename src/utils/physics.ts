import { PointStep, Calibration, CoordinateAxes, FitResult, FitType, PlotVariable } from '../types';

/**
 * Convert pixel length to meters based on calibration stick
 */
export function getMetersPerPixel(calibration: Calibration): number {
  const dx = calibration.pointB.x - calibration.pointA.x;
  const dy = calibration.pointB.y - calibration.pointA.y;
  const pixelDist = Math.hypot(dx, dy);

  if (pixelDist === 0) return 0.001; // fallback prevent div-by-zero

  let realMeters = calibration.realLength;
  if (calibration.unit === 'cm') realMeters /= 100;
  else if (calibration.unit === 'mm') realMeters /= 1000;
  else if (calibration.unit === 'ft') realMeters *= 0.3048;

  return realMeters / pixelDist;
}

/**
 * Transform video pixel coordinates (px, py) into calibrated Cartesian world coordinates (x, y in meters)
 * Note: Video pixel Y increases downwards, while physics Cartesian Y increases upwards.
 */
export function pixelToWorld(
  px: number,
  py: number,
  axes: CoordinateAxes,
  calibration: Calibration
): { x: number; y: number } {
  const metersPerPixel = getMetersPerPixel(calibration);

  // Translate relative to origin
  const dx = px - axes.origin.x;
  const dy = axes.origin.y - py; // flip Y so up is positive

  // Rotate by axes angle (convert to radians)
  // angle is counter-clockwise positive
  const rad = (axes.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Standard 2D rotation of vector
  const rotX = dx * cos + dy * sin;
  const rotY = -dx * sin + dy * cos;

  return {
    x: rotX * metersPerPixel,
    y: rotY * metersPerPixel,
  };
}

/**
 * Transform Cartesian world coordinates (x, y in meters) back to video pixel coordinates (px, py)
 */
export function worldToPixel(
  x: number,
  y: number,
  axes: CoordinateAxes,
  calibration: Calibration
): { px: number; py: number } {
  const metersPerPixel = getMetersPerPixel(calibration);
  if (metersPerPixel === 0) return { px: axes.origin.x, py: axes.origin.y };

  const rotX = x / metersPerPixel;
  const rotY = y / metersPerPixel;

  const rad = (axes.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  // Inverse rotation
  const dx = rotX * cos - rotY * sin;
  const dy = rotX * sin + rotY * cos;

  return {
    px: axes.origin.x + dx,
    py: axes.origin.y - dy,
  };
}

/**
 * Calculate velocity, acceleration, and energy for a sequence of points
 */
export function computeKinematics(
  steps: PointStep[],
  mass: number = 0.1, // kg
  gravity: number = 9.81 // m/s²
): PointStep[] {
  if (steps.length === 0) return [];

  // Sort by time / frame
  const sorted = [...steps].sort((a, b) => a.frame - b.frame);
  const n = sorted.length;

  const result: PointStep[] = sorted.map((s) => ({ ...s }));

  // Velocity using central differences, forward for first, backward for last
  for (let i = 0; i < n; i++) {
    let vx: number | null = null;
    let vy: number | null = null;

    if (n >= 2) {
      if (i === 0) {
        // Forward difference
        const dt = result[1].time - result[0].time;
        if (dt > 0) {
          vx = (result[1].x - result[0].x) / dt;
          vy = (result[1].y - result[0].y) / dt;
        }
      } else if (i === n - 1) {
        // Backward difference
        const dt = result[n - 1].time - result[n - 2].time;
        if (dt > 0) {
          vx = (result[n - 1].x - result[n - 2].x) / dt;
          vy = (result[n - 1].y - result[n - 2].y) / dt;
        }
      } else {
        // Central difference
        const dt = result[i + 1].time - result[i - 1].time;
        if (dt > 0) {
          vx = (result[i + 1].x - result[i - 1].x) / dt;
          vy = (result[i + 1].y - result[i - 1].y) / dt;
        }
      }
    }

    result[i].vx = vx;
    result[i].vy = vy;
    result[i].v = vx !== null && vy !== null ? Math.hypot(vx, vy) : null;

    // Energies
    if (result[i].v !== null) {
      const v = result[i].v!;
      const ke = 0.5 * mass * v * v;
      const pe = mass * gravity * result[i].y;
      result[i].kineticEnergy = ke;
      result[i].potentialEnergy = pe;
      result[i].totalEnergy = ke + pe;
    }
  }

  // Acceleration using central differences on computed velocities
  for (let i = 0; i < n; i++) {
    let ax: number | null = null;
    let ay: number | null = null;

    if (n >= 3) {
      if (i === 0) {
        const step0 = result[0];
        const step1 = result[1];
        if (
          step0 && step1 &&
          typeof step0.vx === 'number' && typeof step1.vx === 'number' &&
          typeof step0.vy === 'number' && typeof step1.vy === 'number'
        ) {
          const dt = step1.time - step0.time;
          if (dt > 0) {
            ax = (step1.vx - step0.vx) / dt;
            ay = (step1.vy - step0.vy) / dt;
          }
        }
      } else if (i === n - 1) {
        const stepPrev = result[n - 2];
        const stepCurr = result[n - 1];
        if (
          stepPrev && stepCurr &&
          typeof stepPrev.vx === 'number' && typeof stepCurr.vx === 'number' &&
          typeof stepPrev.vy === 'number' && typeof stepCurr.vy === 'number'
        ) {
          const dt = stepCurr.time - stepPrev.time;
          if (dt > 0) {
            ax = (stepCurr.vx - stepPrev.vx) / dt;
            ay = (stepCurr.vy - stepPrev.vy) / dt;
          }
        }
      } else {
        const stepPrev = result[i - 1];
        const stepNext = result[i + 1];
        if (
          stepPrev && stepNext &&
          typeof stepPrev.vx === 'number' && typeof stepNext.vx === 'number' &&
          typeof stepPrev.vy === 'number' && typeof stepNext.vy === 'number'
        ) {
          const dt = stepNext.time - stepPrev.time;
          if (dt > 0) {
            ax = (stepNext.vx - stepPrev.vx) / dt;
            ay = (stepNext.vy - stepPrev.vy) / dt;
          }
        }
      }
    }

    result[i].ax = ax;
    result[i].ay = ay;
    result[i].a = ax !== null && ay !== null ? Math.hypot(ax, ay) : null;
  }

  return result;
}

/**
 * Ordinary Least Squares Linear Fit: y = m*x + c
 */
export function fitLinear(points: { x: number; y: number }[]): FitResult {
  const n = points.length;
  if (n < 2) {
    return {
      type: 'linear',
      equation: 'Insufficient data points (need at least 2)',
      params: {},
      rSquared: 0,
    };
  }

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
    sumY2 += p.y * p.y;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-12) {
    return {
      type: 'linear',
      equation: 'Vertical line (undefined slope)',
      params: {},
      rSquared: 0,
    };
  }

  const m = (n * sumXY - sumX * sumY) / denom;
  const c = (sumY - m * sumX) / n;

  // R² calculation
  const yMean = sumY / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const f = m * p.x + c;
    ssTot += Math.pow(p.y - yMean, 2);
    ssRes += Math.pow(p.y - f, 2);
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  const rmse = Math.sqrt(ssRes / n);

  const sign = c >= 0 ? '+' : '-';
  const eq = `y = ${m.toFixed(4)}·x ${sign} ${Math.abs(c).toFixed(4)}`;

  return {
    type: 'linear',
    equation: eq,
    params: { slope: m, intercept: c },
    rSquared,
    rmse,
    notes: `Slope: ${m.toFixed(4)} | Intercept: ${c.toFixed(4)}`,
  };
}

/**
 * Ordinary Least Squares Parabolic / Quadratic Fit: y = A*x² + B*x + C
 */
export function fitParabolic(points: { x: number; y: number }[]): FitResult {
  const n = points.length;
  if (n < 3) {
    return {
      type: 'parabolic',
      equation: 'Insufficient data points (need at least 3)',
      params: {},
      rSquared: 0,
    };
  }

  // System of normal equations for quadratic regression:
  let s4 = 0, s3 = 0, s2 = 0, s1 = 0;
  let sy = 0, sxy = 0, sx2y = 0;

  for (const p of points) {
    const x = p.x;
    const y = p.y;
    const x2 = x * x;
    s4 += x2 * x2;
    s3 += x2 * x;
    s2 += x2;
    s1 += x;
    sy += y;
    sxy += x * y;
    sx2y += x2 * y;
  }

  // Cramer's rule for 3x3 matrix
  const det =
    s4 * (s2 * n - s1 * s1) -
    s3 * (s3 * n - s1 * s2) +
    s2 * (s3 * s1 - s2 * s2);

  if (Math.abs(det) < 1e-12) {
    return {
      type: 'parabolic',
      equation: 'Collinear or degenerate points',
      params: {},
      rSquared: 0,
    };
  }

  const detA =
    sx2y * (s2 * n - s1 * s1) -
    s3 * (sxy * n - s1 * sy) +
    s2 * (sxy * s1 - s2 * sy);

  const detB =
    s4 * (sxy * n - s1 * sy) -
    sx2y * (s3 * n - s1 * s2) +
    s2 * (s3 * sy - sxy * s2);

  const detC =
    s4 * (s2 * sy - sxy * s1) -
    s3 * (s3 * sy - sxy * s2) +
    sx2y * (s3 * s1 - s2 * s2);

  const A = detA / det;
  const B = detB / det;
  const C = detC / det;

  // Compute R² and RMSE
  const yMean = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const f = A * p.x * p.x + B * p.x + C;
    ssTot += Math.pow(p.y - yMean, 2);
    ssRes += Math.pow(p.y - f, 2);
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  const rmse = Math.sqrt(ssRes / n);

  // In physics projectile motion: y(t) = 1/2 a t^2 + v0 t + y0
  // So acceleration = 2 * A
  const estimatedAccel = 2 * A;

  const signB = B >= 0 ? '+' : '-';
  const signC = C >= 0 ? '+' : '-';
  const eq = `y = ${A.toFixed(4)}·x² ${signB} ${Math.abs(B).toFixed(4)}·x ${signC} ${Math.abs(C).toFixed(4)}`;

  return {
    type: 'parabolic',
    equation: eq,
    params: { A, B, C, acceleration: estimatedAccel },
    rSquared,
    rmse,
    notes: `Estimated acceleration (2A): ${estimatedAccel.toFixed(3)} m/s² | v₀: ${B.toFixed(3)} m/s | y₀: ${C.toFixed(3)} m`,
  };
}

/**
 * Polynomial Cubic Fit: y = A*x³ + B*x² + C*x + D
 */
export function fitCubic(points: { x: number; y: number }[]): FitResult {
  const n = points.length;
  if (n < 4) {
    return {
      type: 'cubic',
      equation: 'Insufficient points for cubic fit (need >= 4)',
      params: {},
      rSquared: 0,
    };
  }

  // Gaussian elimination for 4x4 Vandermonde matrix
  const order = 3;
  const matrix: number[][] = Array.from({ length: 4 }, () => new Array(5).fill(0));

  for (let row = 0; row <= order; row++) {
    for (let col = 0; col <= order; col++) {
      let sumPower = 0;
      for (const p of points) {
        sumPower += Math.pow(p.x, (order - row) + (order - col));
      }
      matrix[row][col] = sumPower;
    }
    let sumY = 0;
    for (const p of points) {
      sumY += Math.pow(p.x, order - row) * p.y;
    }
    matrix[row][order + 1] = sumY;
  }

  // Forward elimination
  for (let i = 0; i <= order; i++) {
    let maxRow = i;
    for (let k = i + 1; k <= order; k++) {
      if (Math.abs(matrix[k][i]) > Math.abs(matrix[maxRow][i])) {
        maxRow = k;
      }
    }
    const temp = matrix[i];
    matrix[i] = matrix[maxRow];
    matrix[maxRow] = temp;

    if (Math.abs(matrix[i][i]) < 1e-12) {
      return {
        type: 'cubic',
        equation: 'Singular matrix in cubic regression',
        params: {},
        rSquared: 0,
      };
    }

    for (let k = i + 1; k <= order; k++) {
      const c = matrix[k][i] / matrix[i][i];
      for (let j = i; j <= order + 1; j++) {
        matrix[k][j] -= c * matrix[i][j];
      }
    }
  }

  // Back substitution
  const coeff = new Array(order + 1).fill(0);
  for (let i = order; i >= 0; i--) {
    let sum = matrix[i][order + 1];
    for (let j = i + 1; j <= order; j++) {
      sum -= matrix[i][j] * coeff[j];
    }
    coeff[i] = sum / matrix[i][i];
  }

  const [A, B, C, D] = coeff;

  // Compute R² and RMSE
  let sy = 0;
  for (const p of points) sy += p.y;
  const yMean = sy / n;
  let ssTot = 0;
  let ssRes = 0;
  for (const p of points) {
    const f = A * Math.pow(p.x, 3) + B * Math.pow(p.x, 2) + C * p.x + D;
    ssTot += Math.pow(p.y - yMean, 2);
    ssRes += Math.pow(p.y - f, 2);
  }
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  const rmse = Math.sqrt(ssRes / n);

  const signB = B >= 0 ? '+' : '-';
  const signC = C >= 0 ? '+' : '-';
  const signD = D >= 0 ? '+' : '-';
  const eq = `y = ${A.toFixed(4)}·x³ ${signB} ${Math.abs(B).toFixed(4)}·x² ${signC} ${Math.abs(C).toFixed(4)}·x ${signD} ${Math.abs(D).toFixed(4)}`;

  return {
    type: 'cubic',
    equation: eq,
    params: { A, B, C, D },
    rSquared,
    rmse,
    notes: `A=${A.toFixed(4)}, B=${B.toFixed(4)}, C=${C.toFixed(4)}, D=${D.toFixed(4)}`,
  };
}
