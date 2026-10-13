import { describe, it, expect } from 'vitest';
import {
  calibrateDLTProjective,
  applyBrownConradyDistortion,
  undistortBrownConradyPoint,
  applyRadialDistortion,
  undistortRadialPoint,
  normalizePoints3D,
  normalizePoints2D,
  solveNormalizedDLTWithSVD,
} from '../src/utils/calibration';
import { buildDefaultDLT, project3DToDLT } from '../src/utils/triangulation';
import { CalibrationControlPoint3D, DLT11 } from '../src/types';

describe('Hardened Empirical Camera Calibration & Point Normalization Tests', () => {
  // Test 1: Normalization and Denormalization Invariance
  it('confirms normalized SVD calibration produces mathematically equivalent denormalized projection', () => {
    const { dltCam1 } = buildDefaultDLT('convergent-stereo', 400, 400, { x: 320, y: 240 }, { x: 320, y: 240 }, 1.5, 30);

    const points3D = [
      { x: -0.8, y: -0.6, z: 1.2 },
      { x:  0.7, y: -0.5, z: 1.1 },
      { x:  0.6, y:  0.8, z: 1.3 },
      { x: -0.7, y:  0.7, z: 1.2 },
      { x: -0.9, y: -0.7, z: 2.2 },
      { x:  0.8, y: -0.6, z: 2.1 },
      { x:  0.7, y:  0.9, z: 2.3 },
      { x: -0.8, y:  0.8, z: 2.4 },
    ];

    const controlPoints: CalibrationControlPoint3D[] = points3D.map((p, i) => {
      const proj = project3DToDLT(p.x, p.y, p.z, dltCam1);
      return { id: `cp-${i}`, x: p.x, y: p.y, z: p.z, u: proj.u, v: proj.v };
    });

    // Solve via normalized SVD
    const cal = calibrateDLTProjective(controlPoints, { cameraId: 'cam1' });

    expect(cal.status).toBe('successful');
    expect(cal.conditionNumber).toBeLessThan(100); // Well-conditioned in normalized space
    expect(cal.trainingResidualRms).toBeLessThan(1e-4);

    // Test projection invariance on arbitrary query points
    const queryPoints = [
      { x: 0.1, y: 0.2, z: 1.5 },
      { x: -0.3, y: 0.4, z: 1.8 },
      { x: 0.5, y: -0.2, z: 2.0 },
    ];

    for (const q of queryPoints) {
      const expected = project3DToDLT(q.x, q.y, q.z, dltCam1);
      const actual = project3DToDLT(q.x, q.y, q.z, cal.dlt);
      expect(actual.u).toBeCloseTo(expected.u, 2);
      expect(actual.v).toBeCloseTo(expected.v, 2);
    }
  });

  // Test 2: Controlled Noise Stress Testing (Noiseless, 0.1px, 0.5px, 1.0px)
  it('evaluates empirical calibration under increasing image coordinate noise', () => {
    const { dltCam1 } = buildDefaultDLT('orthogonal-front-side', 350, 350);

    const basePoints = [
      { x: -0.6, y: -0.5, z: 0.8 },
      { x:  0.6, y: -0.5, z: 0.8 },
      { x:  0.6, y:  0.5, z: 0.8 },
      { x: -0.6, y:  0.5, z: 0.8 },
      { x: -0.6, y: -0.5, z: 1.6 },
      { x:  0.6, y: -0.5, z: 1.6 },
      { x:  0.6, y:  0.5, z: 1.6 },
      { x: -0.6, y:  0.5, z: 1.6 },
      { x:  0.0, y:  0.0, z: 1.2 }, // Center point
      { x: -0.3, y:  0.3, z: 1.0 },
      { x:  0.3, y: -0.3, z: 1.4 },
      { x:  0.2, y:  0.4, z: 1.1 },
    ];

    const noiseLevels = [0.0, 0.1, 0.5, 1.0];
    const results: any[] = [];

    for (const noise of noiseLevels) {
      // Deterministic pseudo-noise
      const controlPoints: CalibrationControlPoint3D[] = basePoints.map((p, idx) => {
        const proj = project3DToDLT(p.x, p.y, p.z, dltCam1);
        const signU = idx % 2 === 0 ? 1 : -1;
        const signV = idx % 3 === 0 ? 1 : -1;
        return {
          id: `pt-${idx}`,
          x: p.x,
          y: p.y,
          z: p.z,
          u: proj.u + noise * signU * 0.707,
          v: proj.v + noise * signV * 0.707,
          isValidation: idx >= 8, // Points 8-11 are hold-out validation
        };
      });

      const cal = calibrateDLTProjective(controlPoints);
      expect(cal.valid).toBe(true);

      // Evaluate ground-truth projection error on an independent probe
      const probe = { x: 0.15, y: -0.25, z: 1.35 };
      const trueProj = project3DToDLT(probe.x, probe.y, probe.z, dltCam1);
      const recoveredProj = project3DToDLT(probe.x, probe.y, probe.z, cal.dlt);
      const probeError = Math.hypot(recoveredProj.u - trueProj.u, recoveredProj.v - trueProj.v);

      results.push({
        noise,
        conditionNumber: cal.conditionNumber,
        trainRms: cal.trainingResidualRms,
        valRms: cal.validationResidualRms!,
        trainMax: cal.trainingResidualMax,
        trainMedian: cal.trainingResidualMedian,
        probeError,
      });

      // Verify that RMS roughly scales with noise
      if (noise === 0) {
        expect(cal.trainingResidualRms).toBeLessThan(1e-4);
        expect(cal.validationResidualRms!).toBeLessThan(1e-4);
      } else {
        expect(cal.trainingResidualRms).toBeGreaterThan(0);
        expect(cal.validationResidualRms!).toBeGreaterThan(0);
      }
    }

    // Verify monotonic degradation in residual with noise
    expect(results[1].trainRms).toBeLessThan(results[2].trainRms);
    expect(results[2].trainRms).toBeLessThan(results[3].trainRms);
  });

  // Test 3: Large Coordinate Scale Invariance (e.g., coordinates in hundreds of meters)
  it('maintains stability with large coordinate scales due to Hartley normalization', () => {
    const { dltCam1 } = buildDefaultDLT('convergent-stereo', 500, 500);

    // Points scaled to 100 meters
    const scaleFactor = 100.0;
    const points3D = [
      { x: -50, y: -40, z: 100 },
      { x:  60, y: -30, z: 110 },
      { x:  50, y:  50, z: 120 },
      { x: -40, y:  60, z: 105 },
      { x: -55, y: -45, z: 200 },
      { x:  65, y: -35, z: 210 },
      { x:  55, y:  55, z: 220 },
      { x: -45, y:  65, z: 205 },
    ];

    const controlPoints: CalibrationControlPoint3D[] = points3D.map((p, i) => {
      // Scale down to standard projection then map
      const proj = project3DToDLT(p.x / scaleFactor, p.y / scaleFactor, p.z / scaleFactor, dltCam1);
      return { id: `large-${i}`, x: p.x, y: p.y, z: p.z, u: proj.u, v: proj.v };
    });

    const cal = calibrateDLTProjective(controlPoints);
    expect(cal.status).toBe('successful');
    expect(Number.isFinite(cal.conditionNumber)).toBe(true);
    expect(cal.trainingResidualRms).toBeLessThan(1e-3);
  });

  // Test 4: Rejection of Degenerate Geometries (Coplanar, Collinear, Insufficient Points)
  it('strictly detects and rejects degenerate geometric configurations', () => {
    // A: Insufficient points (< 6 points)
    const fewPoints: CalibrationControlPoint3D[] = [
      { id: '1', x: 0, y: 0, z: 1, u: 100, v: 100 },
      { id: '2', x: 1, y: 0, z: 1, u: 200, v: 100 },
      { id: '3', x: 0, y: 1, z: 1, u: 100, v: 200 },
      { id: '4', x: 1, y: 1, z: 1, u: 200, v: 200 },
    ];
    expect(() => calibrateDLTProjective(fewPoints)).toThrow(/Insufficient points/);

    // B: Coplanar points (all points on z = 1.0)
    const coplanarPoints: CalibrationControlPoint3D[] = [
      { id: '1', x: -1, y: -1, z: 1.0, u: 100, v: 100 },
      { id: '2', x:  1, y: -1, z: 1.0, u: 400, v: 100 },
      { id: '3', x:  1, y:  1, z: 1.0, u: 400, v: 400 },
      { id: '4', x: -1, y:  1, z: 1.0, u: 100, v: 400 },
      { id: '5', x:  0, y:  0, z: 1.0, u: 250, v: 250 },
      { id: '6', x:  0.5, y: 0.5, z: 1.0, u: 320, v: 320 },
      { id: '7', x: -0.5, y: -0.5, z: 1.0, u: 180, v: 180 },
    ];
    expect(() => calibrateDLTProjective(coplanarPoints)).toThrow(/coplanar or collinear/);

    // C: Non-finite / NaN coordinates
    const nanPoints: CalibrationControlPoint3D[] = [
      { id: '1', x: NaN, y: -1, z: 1.0, u: 100, v: 100 },
      { id: '2', x:  1, y: -1, z: 1.0, u: 400, v: 100 },
      { id: '3', x:  1, y:  1, z: 1.0, u: 400, v: 400 },
      { id: '4', x: -1, y:  1, z: 1.0, u: 100, v: 400 },
      { id: '5', x:  0, y:  0, z: 1.0, u: 250, v: 250 },
      { id: '6', x:  0.5, y: 0.5, z: 2.0, u: 320, v: 320 },
    ];
    expect(() => calibrateDLTProjective(nanPoints)).toThrow(/non-finite coordinates/);
  });

  // Test 5: Brown-Conrady Forward & Inverse Lens Distortion Suite
  it('comprehensively tests Brown-Conrady distortion: zero, positive, negative radial, tangential, and convergence', () => {
    const u0 = 320;
    const v0 = 240;

    // Case 1: Zero distortion (identity check)
    const pZero = { u: 450, v: 310 };
    const zeroDist = applyBrownConradyDistortion(pZero.u, pZero.v, u0, v0, { enabled: true, k1: 0, k2: 0 });
    const zeroUndist = undistortBrownConradyPoint(zeroDist.u, zeroDist.v, u0, v0, { enabled: true, k1: 0, k2: 0 });
    expect(zeroDist.u).toBe(pZero.u);
    expect(zeroDist.v).toBe(pZero.v);
    expect(zeroUndist.converged).toBe(true);
    expect(zeroUndist.u).toBeCloseTo(pZero.u, 6);
    expect(zeroUndist.v).toBeCloseTo(pZero.v, 6);

    // Case 2: Positive radial (barrel distortion, k1 > 0)
    const posDist = applyBrownConradyDistortion(pZero.u, pZero.v, u0, v0, { enabled: true, k1: 0.15, k2: 0.02 });
    const posUndist = undistortBrownConradyPoint(posDist.u, posDist.v, u0, v0, { enabled: true, k1: 0.15, k2: 0.02 });
    expect(posUndist.converged).toBe(true);
    expect(posUndist.u).toBeCloseTo(pZero.u, 2);
    expect(posUndist.v).toBeCloseTo(pZero.v, 2);

    // Case 3: Negative radial (pincushion distortion, k1 < 0)
    const negDist = applyBrownConradyDistortion(pZero.u, pZero.v, u0, v0, { enabled: true, k1: -0.12, k2: -0.01 });
    const negUndist = undistortBrownConradyPoint(negDist.u, negDist.v, u0, v0, { enabled: true, k1: -0.12, k2: -0.01 });
    expect(negUndist.converged).toBe(true);
    expect(negUndist.u).toBeCloseTo(pZero.u, 2);
    expect(negUndist.v).toBeCloseTo(pZero.v, 2);

    // Case 4: Tangential distortion (p1, p2 decentering)
    const tanDist = applyBrownConradyDistortion(pZero.u, pZero.v, u0, v0, {
      enabled: true,
      k1: 0.05,
      k2: 0.0,
      p1: 0.01,
      p2: 0.005,
    });
    const tanUndist = undistortBrownConradyPoint(tanDist.u, tanDist.v, u0, v0, {
      enabled: true,
      k1: 0.05,
      k2: 0.0,
      p1: 0.01,
      p2: 0.005,
    });
    expect(tanUndist.converged).toBe(true);
    expect(tanUndist.u).toBeCloseTo(pZero.u, 2);
    expect(tanUndist.v).toBeCloseTo(pZero.v, 2);

    // Case 5: Pathological / divergence handling
    // Extreme non-physical parameters that flip the radial factor to negative
    const pathUndist = undistortBrownConradyPoint(2000, 2000, u0, v0, {
      enabled: true,
      k1: -50.0, // Violent divergence
      k2: -100.0,
    }, 100, 10);
    expect(pathUndist.converged).toBe(false);
    expect(['diverged', 'max_iterations_exceeded']).toContain(pathUndist.status);
  });
});
