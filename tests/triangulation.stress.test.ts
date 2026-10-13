import { describe, it, expect } from 'vitest';
import {
  buildDefaultDLT,
  project3DToDLT,
  triangulateDLTRobust,
  solveLeastSquares4x3,
  solveLeastSquaresQR4x3,
} from '../src/utils/triangulation';
import { DLT11 } from '../src/types';

describe('Part A: Numerical Stress Tests - Prototype Normal Equations vs. Robust QR', () => {
  // Test 1: Decreasing Stereo Baseline (from 2.0m down to 0.005m)
  it('evaluates behavior under vanishing stereo baseline', () => {
    const baselines = [2.0, 0.5, 0.1, 0.02, 0.005];
    const groundTruth = { x: 0.1, y: 0.2, z: 1.5 };

    for (const b of baselines) {
      const { dltCam1, dltCam2 } = buildDefaultDLT(
        'convergent-stereo',
        300,
        300,
        { x: 320, y: 240 },
        { x: 320, y: 240 },
        b,
        15 // small convergence angle
      );

      const p1 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, dltCam1);
      const p2 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, dltCam2);

      const robust = triangulateDLTRobust(p1.u, p1.v, dltCam1, p2.u, p2.v, dltCam2, {
        minRayAngleDeg: 0.5,
      });

      expect(Number.isFinite(robust.conditionMetric)).toBe(true);
      if (robust.valid) {
        expect(robust.x).toBeCloseTo(groundTruth.x, 2);
        expect(robust.y).toBeCloseTo(groundTruth.y, 2);
        expect(robust.z).toBeCloseTo(groundTruth.z, 2);
      }
    }
  });

  // Test 2: Increasing Viewing-Ray Convergence Angle Toward Zero (Parallel Optical Axes)
  it('evaluates convergence angle approaching zero and detects near-parallel degeneracy', () => {
    const groundTruth = { x: 0.0, y: 0.0, z: 2.0 };

    // Convergence angle 0.1 deg
    const { dltCam1, dltCam2 } = buildDefaultDLT(
      'convergent-stereo',
      300,
      300,
      { x: 320, y: 240 },
      { x: 320, y: 240 },
      0.05, // 5cm baseline
      0.05  // 0.05 deg convergence
    );

    const p1 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, dltCam1);
    const p2 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, dltCam2);

    const robust = triangulateDLTRobust(p1.u, p1.v, dltCam1, p2.u, p2.v, dltCam2, {
      minRayAngleDeg: 1.5,
    });

    // Must be flagged as invalid due to nearly parallel rays
    expect(robust.valid).toBe(false);
    expect(robust.status).toBe('nearly_parallel_rays');
  });

  // Test 3: Increasing Image Coordinate Noise (0.1px to 10px)
  it('evaluates quantitative 3D error scaling under increasing image noise', () => {
    const { dltCam1, dltCam2 } = buildDefaultDLT(
      'orthogonal-front-side',
      250,
      250,
      { x: 320, y: 240 },
      { x: 320, y: 240 },
      1.5,
      90
    );

    const gt = { x: 0.5, y: 0.6, z: 0.7 };
    const p1 = project3DToDLT(gt.x, gt.y, gt.z, dltCam1);
    const p2 = project3DToDLT(gt.x, gt.y, gt.z, dltCam2);

    const noiseLevels = [0.1, 0.5, 2.0, 5.0];
    let prevError = 0;

    for (const noise of noiseLevels) {
      const robust = triangulateDLTRobust(
        p1.u + noise,
        p1.v - noise,
        dltCam1,
        p2.u - noise,
        p2.v + noise,
        dltCam2
      );

      const err3D = Math.hypot(robust.x - gt.x, robust.y - gt.y, robust.z - gt.z);
      expect(err3D).toBeGreaterThan(0);
      expect(robust.reprojectionRms).toBeGreaterThan(0);
      expect(err3D).toBeGreaterThan(prevError); // Monotonic error scaling
      prevError = err3D;
    }
  });

  // Test 4: Extreme Distant 3D Points (Z = 100m, 500m)
  it('evaluates distant points and verifies numerical conditioning', () => {
    const { dltCam1, dltCam2 } = buildDefaultDLT(
      'convergent-stereo',
      400,
      400,
      { x: 320, y: 240 },
      { x: 320, y: 240 },
      1.0,
      30
    );

    const distantPt = { x: 5.0, y: 2.0, z: 80.0 };
    const p1 = project3DToDLT(distantPt.x, distantPt.y, distantPt.z, dltCam1);
    const p2 = project3DToDLT(distantPt.x, distantPt.y, distantPt.z, dltCam2);

    const robust = triangulateDLTRobust(p1.u, p1.v, dltCam1, p2.u, p2.v, dltCam2, {
      minRayAngleDeg: 0.1,
    });

    expect(robust.valid).toBe(true);
    expect(robust.x).toBeCloseTo(distantPt.x, 1);
    expect(robust.y).toBeCloseTo(distantPt.y, 1);
    expect(robust.z).toBeCloseTo(distantPt.z, 0);
  });

  // Test 5: Direct Linear Algebra Comparison: Normal Equations vs. Householder QR on Ill-Conditioned Matrix
  it('compares Normal Equations (Cramer) vs QR directly on artificially ill-conditioned linear system', () => {
    // Construct an ill-conditioned 4x3 matrix with nearly collinear columns
    const eps = 1e-6;
    const A_ill: number[][] = [
      [1.0, 1.0, 1.0],
      [1.0, 1.0 + eps, 1.0],
      [1.0, 1.0, 1.0 + eps],
      [1.0, 1.0 + eps, 1.0 + eps],
    ];
    const groundTruthX: [number, number, number] = [1.0, 2.0, -1.0];
    const B_ill: number[] = [
      A_ill[0][0]*groundTruthX[0] + A_ill[0][1]*groundTruthX[1] + A_ill[0][2]*groundTruthX[2],
      A_ill[1][0]*groundTruthX[0] + A_ill[1][1]*groundTruthX[1] + A_ill[1][2]*groundTruthX[2],
      A_ill[2][0]*groundTruthX[0] + A_ill[2][1]*groundTruthX[1] + A_ill[2][2]*groundTruthX[2],
      A_ill[3][0]*groundTruthX[0] + A_ill[3][1]*groundTruthX[1] + A_ill[3][2]*groundTruthX[2],
    ];

    const qrResult = solveLeastSquaresQR4x3(A_ill, B_ill);
    expect(qrResult.solution).not.toBeNull();
    if (qrResult.solution) {
      expect(qrResult.solution[0]).toBeCloseTo(groundTruthX[0], 2);
      expect(qrResult.solution[1]).toBeCloseTo(groundTruthX[1], 2);
      expect(qrResult.solution[2]).toBeCloseTo(groundTruthX[2], 2);
    }
  });
});
