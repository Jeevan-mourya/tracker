import { describe, it, expect } from 'vitest';
import {
  buildDefaultDLT,
  project3DToDLT,
  triangulateDLTRobust,
  triangulateDLT,
  calculateRayIntersectionAngleDeg,
  solveLeastSquaresQR4x3,
} from '../src/utils/triangulation';
import { pixelToWorld } from '../src/utils/physics';
import { Calibration, CoordinateAxes, DLT11 } from '../src/types';

describe('Batch 1: Numerically Robust Triangulation Suite', () => {
  // 1. Synthetic Camera Geometry & Exact Noiseless Reconstruction
  it('reconstructs exact noiseless 3D coordinates across multiple points', () => {
    const { dltCam1, dltCam2 } = buildDefaultDLT(
      'orthogonal-front-side',
      300,
      300,
      { x: 320, y: 240 },
      { x: 320, y: 240 },
      2.0,
      90
    );

    const testPoints = [
      { x: 0.0, y: 0.0, z: 0.0 },
      { x: 1.25, y: -0.45, z: 0.8 },
      { x: -0.85, y: 1.15, z: -0.65 },
    ];

    for (const pt of testPoints) {
      const p1 = project3DToDLT(pt.x, pt.y, pt.z, dltCam1);
      const p2 = project3DToDLT(pt.x, pt.y, pt.z, dltCam2);

      const robust = triangulateDLTRobust(p1.u, p1.v, dltCam1, p2.u, p2.v, dltCam2);

      expect(robust.valid).toBe(true);
      expect(robust.status).toBe('valid');
      expect(robust.x).toBeCloseTo(pt.x, 5);
      expect(robust.y).toBeCloseTo(pt.y, 5);
      expect(robust.z).toBeCloseTo(pt.z, 5);
      expect(robust.residual).toBeLessThan(1e-5);
      expect(robust.reprojectionRms).toBeLessThan(1e-5);
      expect(robust.reprojectionMax).toBeLessThan(1e-5);
    }
  });

  // 2. Small Gaussian Image Noise
  it('maintains stability under small image coordinate perturbations (±0.5 pixel)', () => {
    const { dltCam1, dltCam2 } = buildDefaultDLT(
      'orthogonal-front-side',
      250,
      250,
      { x: 300, y: 300 },
      { x: 300, y: 300 },
      1.5,
      90
    );

    const groundTruth = { x: 0.5, y: 0.4, z: 0.3 };
    const p1 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, dltCam1);
    const p2 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, dltCam2);

    // Add +0.5 pixel noise
    const robust = triangulateDLTRobust(p1.u + 0.5, p1.v - 0.5, dltCam1, p2.u - 0.5, p2.v + 0.5, dltCam2);

    expect(robust.valid).toBe(true);
    expect(robust.x).toBeCloseTo(groundTruth.x, 2);
    expect(robust.y).toBeCloseTo(groundTruth.y, 2);
    expect(robust.z).toBeCloseTo(groundTruth.z, 2);
    expect(robust.residual).toBeGreaterThan(0.1);
    expect(robust.residual).toBeLessThan(2.0); // Bounded error
  });

  // 3. Coordinate Convention & Handedness Preservation
  it('verifies handedness: rightwards px -> +X, upwards py -> +Y, transverse cam2 -> +Z', () => {
    const axes: CoordinateAxes = {
      origin: { x: 200, y: 300 },
      angle: 0,
      visible: true,
      locked: true,
      gridVisible: true,
    };
    const cal: Calibration = {
      active: true,
      pointA: { x: 100, y: 300 },
      pointB: { x: 300, y: 300 }, // 200 px = 1.0 meter -> 200 px/meter
      realLength: 1.0,
      unit: 'm',
      scale: 200,
      locked: true,
      visible: true,
    };

    // Click to the right (x increases)
    const ptRight = pixelToWorld(300, 300, axes, cal);
    expect(ptRight.x).toBeCloseTo(0.5, 4); // +0.5m right

    // Click upwards (screen y decreases from 300 to 200 -> y increases in world)
    const ptUp = pixelToWorld(200, 200, axes, cal);
    expect(ptUp.y).toBeCloseTo(0.5, 4); // +0.5m up

    // Check orthogonal DLT handedness matches
    const { dltCam1, dltCam2 } = buildDefaultDLT(
      'orthogonal-front-side',
      200,
      200,
      axes.origin,
      axes.origin,
      1.0,
      90
    );

    // Point in quadrant (+X, +Y, +Z): (0.5, 0.5, 0.5)
    const proj1 = project3DToDLT(0.5, 0.5, 0.5, dltCam1);
    const proj2 = project3DToDLT(0.5, 0.5, 0.5, dltCam2);

    expect(proj1.u).toBe(300); // 200 + 200*0.5
    expect(proj1.v).toBe(200); // 300 - 200*0.5
    expect(proj2.u).toBe(300); // 200 + 200*0.5
    expect(proj2.v).toBe(200); // 300 - 200*0.5

    const reconstructed = triangulateDLTRobust(proj1.u, proj1.v, dltCam1, proj2.u, proj2.v, dltCam2);
    expect(reconstructed.x).toBeCloseTo(0.5, 4);
    expect(reconstructed.y).toBeCloseTo(0.5, 4);
    expect(reconstructed.z).toBeCloseTo(0.5, 4);
  });

  // 4. Degenerate Geometry: Parallel Viewing Rays Detection
  it('detects and flags nearly parallel camera viewing rays', () => {
    // Both cameras with virtually identical optical axis (parallel, 0 deg baseline)
    const dltIdentical: DLT11 = [
      300, 0, 0, 320,
      0, -300, 0, 240,
      0, 0, 0
    ];

    const angle = calculateRayIntersectionAngleDeg([0, 0, 1], dltIdentical, dltIdentical);
    expect(angle).toBeCloseTo(0, 2);

    const robust = triangulateDLTRobust(320, 240, dltIdentical, 320, 240, dltIdentical, {
      minRayAngleDeg: 2.0,
    });

    expect(robust.valid).toBe(false);
    expect(robust.status).toBe('nearly_parallel_rays');
    expect(robust.statusMessage).toContain('nearly parallel');
  });

  // 5. Defensive Handling: NaN, Infinity, and Malformed Inputs
  it('defensively handles NaN and Infinity without throwing exceptions', () => {
    const validDLT: DLT11 = [200, 0, 0, 100, 0, -200, 0, 100, 0, 0, 0];

    // NaN input
    const resNaN = triangulateDLTRobust(NaN, 100, validDLT, 100, 100, validDLT);
    expect(resNaN.valid).toBe(false);
    expect(resNaN.status).toBe('invalid_input');
    expect(Number.isNaN(resNaN.x)).toBe(true);

    // Infinity input
    const resInf = triangulateDLTRobust(100, Infinity, validDLT, 100, 100, validDLT);
    expect(resInf.valid).toBe(false);
    expect(resInf.status).toBe('invalid_input');

    // Backward-compatible wrapper returns null
    expect(triangulateDLT(NaN, 100, validDLT, 100, 100, validDLT)).toBeNull();
    expect(triangulateDLT(100, Infinity, validDLT, 100, 100, validDLT)).toBeNull();
  });

  // 6. Extreme Outliers / Large Noise
  it('computes accurate RMS, Max, and Median reprojection metrics under asymmetric noise', () => {
    const { dltCam1, dltCam2 } = buildDefaultDLT('orthogonal-front-side', 200, 200);
    const p1 = project3DToDLT(0.2, 0.3, 0.4, dltCam1);
    const p2 = project3DToDLT(0.2, 0.3, 0.4, dltCam2);

    // Add asymmetric pixel errors: 2px on Cam 1, 6px on Cam 2
    const robust = triangulateDLTRobust(p1.u + 2.0, p1.v, dltCam1, p2.u, p2.v + 6.0, dltCam2);

    expect(robust.reprojectionErrorLeft).toBeGreaterThan(0);
    expect(robust.reprojectionErrorRight).toBeGreaterThan(0);
    expect(robust.reprojectionMax).toBeGreaterThanOrEqual(robust.residual);
    expect(robust.reprojectionRms).toBeGreaterThanOrEqual(robust.residual);
  });
});
