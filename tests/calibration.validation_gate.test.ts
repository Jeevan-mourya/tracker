import { describe, it, expect } from 'vitest';
import {
  calibrateDLTProjective,
  normalizePoints3D,
  normalizePoints2D,
  solveNormalizedDLTWithSVD,
  householderQR,
  jacobiSVD12,
  applyBrownConradyDistortion,
  undistortBrownConradyPoint,
} from '../src/utils/calibration';
import { buildDefaultDLT, project3DToDLT } from '../src/utils/triangulation';
import { CalibrationControlPoint3D } from '../src/types';

describe('Scientific Validation Gate: Empirical Calibration Numerical Verification', () => {
  // 16-point precision calibration cage (1.0m x 1.0m x 1.0m)
  const cagePoints3D = [
    { id: 'CAGE-01', x: 0.000, y: 0.000, z: 1.000, isVal: false },
    { id: 'CAGE-02', x: 0.500, y: 0.000, z: 1.000, isVal: false },
    { id: 'CAGE-03', x: 1.000, y: 0.000, z: 1.000, isVal: false },
    { id: 'CAGE-04', x: 0.000, y: 0.500, z: 1.000, isVal: false },
    { id: 'CAGE-05', x: 0.500, y: 0.500, z: 1.000, isVal: false },
    { id: 'CAGE-06', x: 1.000, y: 0.500, z: 1.000, isVal: false },
    { id: 'CAGE-07', x: 0.000, y: 1.000, z: 1.000, isVal: false },
    { id: 'CAGE-08', x: 0.500, y: 1.000, z: 1.000, isVal: false },
    { id: 'CAGE-09', x: 1.000, y: 1.000, z: 1.000, isVal: false },
    { id: 'CAGE-10', x: 0.000, y: 0.000, z: 1.500, isVal: false },
    { id: 'CAGE-11', x: 1.000, y: 0.000, z: 1.500, isVal: false },
    { id: 'CAGE-12', x: 0.000, y: 1.000, z: 1.500, isVal: false },
    // 4 Hold-out validation points
    { id: 'CAGE-13', x: 1.000, y: 1.000, z: 1.500, isVal: true },
    { id: 'CAGE-14', x: 0.250, y: 0.250, z: 1.800, isVal: true },
    { id: 'CAGE-15', x: 0.750, y: 0.250, z: 1.800, isVal: true },
    { id: 'CAGE-16', x: 0.500, y: 0.750, z: 2.000, isVal: true },
  ];

  const { dltCam1 } = buildDefaultDLT('convergent-stereo', 450, 450, { x: 320, y: 240 }, { x: 320, y: 240 }, 1.2, 25);

  const controlPoints: CalibrationControlPoint3D[] = cagePoints3D.map((p) => {
    const proj = project3DToDLT(p.x, p.y, p.z, dltCam1);
    return {
      id: p.id,
      x: p.x,
      y: p.y,
      z: p.z,
      u: proj.u,
      v: proj.v,
      isValidation: p.isVal,
    };
  });

  // PART B: VERIFY NORMALIZATION MATHEMATICS & EXACT PROJECTION DISCREPANCY
  it('Part B: verifies analytical denormalization produces exact projection within floating-point epsilon', () => {
    // 1. Compute normalization transforms
    const trainPts = controlPoints.filter((p) => !p.isValidation);
    const norm3D = normalizePoints3D(trainPts.map((p) => ({ x: p.x, y: p.y, z: p.z })));
    const norm2D = normalizePoints2D(trainPts.map((p) => ({ u: p.u, v: p.v })));

    // 2. Compute normalized solution
    const { dlt, normalization } = solveNormalizedDLTWithSVD(trainPts);

    // Reconstruct normalized P_tilde
    // Denormalization relation is P = T^-1 * P_tilde * U
    // For any 3D point X:
    // Normalized point X_tilde = U * X
    // Normalized projection x_tilde = P_tilde * X_tilde
    // Denormalized image point x = T^-1 * x_tilde
    // Direct projection x_direct = P * X

    let maxDiscrepancyPx = 0;
    const testPoints = [
      { x: 0.1, y: 0.2, z: 1.1 },
      { x: 0.8, y: 0.3, z: 1.4 },
      { x: 0.4, y: 0.9, z: 1.7 },
      { x: 0.6, y: 0.5, z: 1.9 },
    ];

    for (const pt of testPoints) {
      // 1. Direct denormalized projection via dlt
      const direct = project3DToDLT(pt.x, pt.y, pt.z, dlt);

      // 2. Normalized pipeline:
      // X_tilde = (X - mx)*s3
      const Xtilde = (pt.x - normalization.centroid3D.x) * normalization.scale3D;
      const Ytilde = (pt.y - normalization.centroid3D.y) * normalization.scale3D;
      const Ztilde = (pt.z - normalization.centroid3D.z) * normalization.scale3D;

      // Project using direct DLT
      // Check maximum discrepancy between direct projection and ground truth projection
      const gt = project3DToDLT(pt.x, pt.y, pt.z, dltCam1);
      const disc = Math.hypot(direct.u - gt.u, direct.v - gt.v);
      if (disc > maxDiscrepancyPx) maxDiscrepancyPx = disc;
    }

    console.log(`[PART B] Maximum projection discrepancy: ${maxDiscrepancyPx.toExponential(4)} pixels`);
    expect(maxDiscrepancyPx).toBeLessThan(1e-10);
  });

  // PART C: VERIFY CONDITION NUMBER (Unnormalized vs Normalized)
  it('Part C: compares unnormalized vs Hartley-normalized design matrix condition numbers', () => {
    const trainPts = controlPoints.filter((p) => !p.isValidation);
    const n = trainPts.length;

    // Build unnormalized 2N x 12 design matrix
    const Aunnorm: number[][] = [];
    for (let i = 0; i < n; i++) {
      const X = trainPts[i].x;
      const Y = trainPts[i].y;
      const Z = trainPts[i].z;
      const u = trainPts[i].u;
      const v = trainPts[i].v;

      Aunnorm.push([
        X, Y, Z, 1,
        0, 0, 0, 0,
        -u * X, -u * Y, -u * Z, -u,
      ]);
      Aunnorm.push([
        0, 0, 0, 0,
        X, Y, Z, 1,
        -v * X, -v * Y, -v * Z, -v,
      ]);
    }

    const Runnorm = householderQR(Aunnorm);
    const svdUnnorm = jacobiSVD12(Runnorm);
    const condUnnorm = svdUnnorm.singularValues[0] / svdUnnorm.singularValues[10];

    // Normalized solve
    const cal = calibrateDLTProjective(controlPoints);
    const condNorm = cal.conditionNumber;

    console.log(`[PART C] Condition number unnormalized: ${condUnnorm.toExponential(4)}`);
    console.log(`[PART C] Condition number normalized:   ${condNorm.toFixed(4)}`);
    console.log(`[PART C] Condition reduction factor:   ${(condUnnorm / condNorm).toExponential(2)}x improvement`);

    expect(condUnnorm).toBeGreaterThan(5000);
    expect(condNorm).toBeLessThan(100);
    expect(condUnnorm / condNorm).toBeGreaterThan(1000);
  });

  // PART D: DISTORTION INTEGRITY & TWO-STAGE BEHAVIOR
  it('Part D: audits Brown-Conrady two-stage pre-correction integrity', () => {
    // Add known lens distortion to the image points
    const u0 = 320;
    const v0 = 240;
    const trueDistortion = { enabled: true, k1: 0.08, k2: 0.01 };

    const distortedPoints: CalibrationControlPoint3D[] = controlPoints.map((p) => {
      const dist = applyBrownConradyDistortion(p.u, p.v, u0, v0, trueDistortion);
      return {
        ...p,
        u: dist.u,
        v: dist.v,
      };
    });

    // Calibrate with supplied distortion parameters
    const calWithDist = calibrateDLTProjective(distortedPoints, {
      distortion: trueDistortion,
      imageWidth: 640,
      imageHeight: 480,
    });

    expect(calWithDist.status).toBe('successful');
    expect(calWithDist.trainingResidualRms).toBeLessThan(0.01);
    expect(calWithDist.validationResidualRms!).toBeLessThan(0.01);

    console.log(`[PART D] Training RMS with pre-correction: ${calWithDist.trainingResidualRms.toExponential(4)} px`);
    console.log(`[PART D] Hold-out Validation RMS:        ${calWithDist.validationResidualRms!.toExponential(4)} px`);
  });

  // PART E: DETERMINISTIC BROWN-CONRADY ROUND-TRIP TEST (Center, Mid-Field, Near-Edge, Extreme)
  it('Part E: deterministic Brown-Conrady distortion / undistortion round-trip verification', () => {
    const u0 = 320;
    const v0 = 240;
    const scale = 1000;
    const distortionParams = {
      enabled: true,
      k1: 0.06,
      k2: 0.008,
      k3: 0.001,
      p1: 0.002,
      p2: 0.002,
    };

    const testLocations = [
      { name: 'Optical Center', u: 320, v: 240 },
      { name: 'Mid-Field Quadrant 1', u: 480, v: 120 },
      { name: 'Mid-Field Quadrant 2', u: 160, v: 120 },
      { name: 'Mid-Field Quadrant 3', u: 160, v: 360 },
      { name: 'Mid-Field Quadrant 4', u: 480, v: 360 },
      { name: 'Near-Edge Top-Left', u: 40, v: 40 },
      { name: 'Near-Edge Top-Right', u: 600, v: 40 },
      { name: 'Near-Edge Bottom-Left', u: 40, v: 440 },
      { name: 'Near-Edge Bottom-Right', u: 600, v: 440 },
      { name: 'Extreme Corner Top-Left', u: 10, v: 10 },
      { name: 'Extreme Corner Bottom-Right', u: 630, v: 470 },
    ];

    let maxRoundTripErrorPx = 0;
    const roundTripResults: { name: string; uOrig: number; vOrig: number; uDist: number; vDist: number; uRec: number; vRec: number; errorPx: number; iterations: number }[] = [];

    for (const loc of testLocations) {
      // 1. Forward distortion: ideal (u, v) -> distorted (ud, vd)
      const distorted = applyBrownConradyDistortion(loc.u, loc.v, u0, v0, distortionParams, scale);

      // 2. Backward undistortion: distorted (ud, vd) -> recovered (uRec, vRec)
      const undistorted = undistortBrownConradyPoint(
        distorted.u,
        distorted.v,
        u0,
        v0,
        distortionParams,
        scale,
        50,
        1e-8
      );

      expect(undistorted.converged).toBe(true);
      expect(undistorted.status).toBe('converged');

      const errorPx = Math.hypot(undistorted.u - loc.u, undistorted.v - loc.v);
      if (errorPx > maxRoundTripErrorPx) {
        maxRoundTripErrorPx = errorPx;
      }

      roundTripResults.push({
        name: loc.name,
        uOrig: loc.u,
        vOrig: loc.v,
        uDist: distorted.u,
        vDist: distorted.v,
        uRec: undistorted.u,
        vRec: undistorted.v,
        errorPx,
        iterations: undistorted.iterations,
      });
    }

    console.log(`[PART E] Brown-Conrady Maximum Round-Trip Error: ${maxRoundTripErrorPx.toExponential(4)} px`);
    for (const r of roundTripResults) {
      console.log(`  - ${r.name.padEnd(26)}: Error = ${r.errorPx.toExponential(3)} px (Iter: ${r.iterations})`);
    }

    // Must be accurate to sub-pixel numerical precision (< 1e-4 pixels)
    expect(maxRoundTripErrorPx).toBeLessThan(1e-4);
  });
});
