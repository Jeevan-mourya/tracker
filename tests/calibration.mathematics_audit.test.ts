import { describe, it, expect } from 'vitest';
import {
  householderQR,
  jacobiSVD12,
  solveNormalizedDLTWithSVD,
  calibrateDLTProjective,
  normalizePoints3D,
  normalizePoints2D,
} from '../src/utils/calibration';
import { buildDefaultDLT, project3DToDLT } from '../src/utils/triangulation';
import { SAMPLE_CALIBRATION_CAGE_CSV, SAMPLE_CALIBRATION_CAGE_POINTS } from '../src/data/sampleCalibrationCage';
import { CalibrationControlPoint3D } from '../src/types';

/**
 * Helper to compute one-sided Jacobi SVD directly on an m x 12 matrix A (m >= 12)
 * without QR decomposition, to numerically verify SVD(A) == SVD(R).
 */
function jacobiSVDDirectMx12(A: number[][]): { singularValues: number[]; V: number[][] } {
  const m = A.length;
  const n = 12;
  const W: number[][] = A.map((r) => [...r]);
  const V: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1.0 : 0.0))
  );

  const maxSweeps = 35;
  const tol = 1e-15;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let maxOffDiagonal = 0;

    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        let a = 0;
        let b = 0;
        let c = 0;
        for (let r = 0; r < m; r++) {
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

          for (let r = 0; r < m; r++) {
            const w1 = W[r][i];
            const w2 = W[r][j];
            W[r][i] = cs * w1 - sn * w2;
            W[r][j] = sn * w1 + cs * w2;
          }

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

  const singularValuesWithIndices: { val: number; colIdx: number }[] = [];
  for (let j = 0; j < n; j++) {
    let sumSq = 0;
    for (let r = 0; r < m; r++) {
      sumSq += W[r][j] * W[r][j];
    }
    singularValuesWithIndices.push({ val: Math.sqrt(sumSq), colIdx: j });
  }

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

describe('Scientific Calibration Mathematics & Conditioning Audit', () => {
  // Test 1: Mathematical equivalence of SVD(R) and SVD(A) for thin Householder QR
  it('numerically confirms SVD(R) singular values and right singular vectors are identical to SVD(A)', () => {
    // Generate a full-rank 24 x 12 matrix
    const m = 24;
    const n = 12;
    const A: number[][] = [];
    for (let i = 0; i < m; i++) {
      const row: number[] = [];
      for (let j = 0; j < n; j++) {
        const val = Math.sin((i * 13 + j * 37 + 7) * 101.3);
        row.push(val + (i === j ? 5.0 : 0));
      }
      A.push(row);
    }

    // Method 1: Thin Householder QR -> 12x12 R factor, then SVD(R)
    const R = householderQR(A);
    const { singularValues: sigR, V: VR } = jacobiSVD12(R);

    // Method 2: Direct one-sided Jacobi SVD on 24x12 matrix A
    const { singularValues: sigA, V: VA } = jacobiSVDDirectMx12(A);

    // Compare all 12 singular values
    expect(sigR.length).toBe(12);
    expect(sigA.length).toBe(12);

    for (let j = 0; j < 12; j++) {
      const diff = Math.abs(sigR[j] - sigA[j]);
      expect(diff).toBeLessThan(1e-12);
    }

    // Verify right singular vectors:
    // Note: for near-clustered singular values (multiplicity > 1), singular vectors span the same invariant
    // subspace up to rotation. For distinct singular values and specifically the null-space vector v_12,
    // they agree to high precision.
    for (let j = 0; j < 12; j++) {
      let dot = 0;
      for (let r = 0; r < 12; r++) {
        dot += VR[r][j] * VA[r][j];
      }
      expect(Math.abs(Math.abs(dot) - 1.0)).toBeLessThan(1e-5);
    }

    // Crucially verify the null-space solution vector v_12 (column index 11) specifically:
    let dot12 = 0;
    for (let r = 0; r < 12; r++) {
      dot12 += VR[r][11] * VA[r][11];
    }
    expect(Math.abs(Math.abs(dot12) - 1.0)).toBeLessThan(1e-6);

    // Verify that the null-space solution vector v_12 from R satisfies ||A v_12||_2 == sigma_12
    const v12 = VR.map((row) => row[11]);
    let normAv12Sq = 0;
    for (let i = 0; i < m; i++) {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        sum += A[i][j] * v12[j];
      }
      normAv12Sq += sum * sum;
    }
    const normAv12 = Math.sqrt(normAv12Sq);
    expect(Math.abs(normAv12 - sigR[11])).toBeLessThan(1e-11);
  });

  // Test 2: Singular-value metrics definition and rank-11 DLT behavior
  it('verifies non-null condition number kappa_nonnull and null-space separation ratio gamma', () => {
    const { dltCam1 } = buildDefaultDLT('convergent-stereo', 400, 400, { x: 320, y: 240 }, { x: 320, y: 240 }, 1.5, 30);

    const points3D = [
      { id: '1', x: -0.8, y: -0.6, z: 1.2, u: 0, v: 0 },
      { id: '2', x:  0.7, y: -0.5, z: 1.1, u: 0, v: 0 },
      { id: '3', x:  0.6, y:  0.8, z: 1.3, u: 0, v: 0 },
      { id: '4', x: -0.7, y:  0.7, z: 1.2, u: 0, v: 0 },
      { id: '5', x: -0.9, y: -0.7, z: 2.2, u: 0, v: 0 },
      { id: '6', x:  0.8, y: -0.6, z: 2.1, u: 0, v: 0 },
      { id: '7', x:  0.7, y:  0.9, z: 2.3, u: 0, v: 0 },
      { id: '8', x: -0.8, y:  0.8, z: 2.4, u: 0, v: 0 },
    ];

    const controlPoints: CalibrationControlPoint3D[] = points3D.map((p) => {
      const proj = project3DToDLT(p.x, p.y, p.z, dltCam1);
      return { ...p, u: proj.u, v: proj.v };
    });

    const cal = calibrateDLTProjective(controlPoints);

    // 1. Check singular values are sorted descending
    for (let i = 0; i < 11; i++) {
      expect(cal.singularValues[i]).toBeGreaterThanOrEqual(cal.singularValues[i + 1]);
    }

    const sigma1 = cal.singularValues[0];
    const sigma11 = cal.singularValues[10];
    const sigma12 = cal.singularValues[11];

    // 2. Non-null condition ratio: kappa_nonnull = sigma_1 / sigma_11
    expect(cal.kappaNonNull).toBeCloseTo(sigma1 / sigma11, 6);
    expect(cal.kappaNonNull).toBeLessThan(100); // Normalized 3D span is well conditioned

    // 3. Null-space separation ratio: gamma = sigma_11 / sigma_12
    expect(cal.nullSpaceSeparation).toBeGreaterThan(1e10); // In noiseless data, sigma_12 ~ 0

    // 4. In ideal noiseless geometry, sigma_12 ~ 0 (< 1e-14) so null-space separation is huge
    expect(sigma12).toBeLessThan(1e-12);
  });

  // Test 3: Audit sampleCalibrationCage.ts for scientific honesty
  it('confirms sampleCalibrationCage.ts is documented strictly as synthetic validation data', () => {
    expect(SAMPLE_CALIBRATION_CAGE_CSV).toContain('SYNTHETIC CALIBRATION CONTROL-POINT FIXTURE');
    expect(SAMPLE_CALIBRATION_CAGE_CSV).toContain('Synthetic computer-generated data');
    expect(SAMPLE_CALIBRATION_CAGE_CSV).not.toContain('CMM surveyed');
    expect(SAMPLE_CALIBRATION_CAGE_CSV).not.toContain('precision steel frame');
    expect(SAMPLE_CALIBRATION_CAGE_POINTS.length).toBe(16);
  });

  // Test 4: Real-data schema parsing and hold-out validation separation
  it('verifies CSV parsing, hold-out validation separation, and export schema compliance', () => {
    const rawCsv = `
# Real Calibration Observations
# ID, X, Y, Z, u, v, isValidation
T1, 0.1, 0.2, 1.0, 310, 220, 0
T2, 0.5, 0.2, 1.0, 420, 220, 0
T3, 0.5, 0.6, 1.0, 420, 310, 0
T4, 0.1, 0.6, 1.0, 310, 310, 0
T5, 0.1, 0.2, 1.5, 310, 240, 0
T6, 0.5, 0.2, 1.5, 390, 240, 0
T7, 0.5, 0.6, 1.5, 390, 300, 0
V1, 0.3, 0.4, 1.2, 350, 260, 1
V2, 0.2, 0.3, 1.4, 330, 250, 1
`;
    const lines = rawCsv.split('\n');
    const points: CalibrationControlPoint3D[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(',').map((s) => s.trim());
      if (parts.length >= 6) {
        points.push({
          id: parts[0],
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3]),
          u: parseFloat(parts[4]),
          v: parseFloat(parts[5]),
          isValidation: parts[6] === '1',
        });
      }
    }

    expect(points.length).toBe(9);
    const trainCount = points.filter((p) => !p.isValidation).length;
    const valCount = points.filter((p) => p.isValidation).length;
    expect(trainCount).toBe(7);
    expect(valCount).toBe(2);

    const cal = calibrateDLTProjective(points, { cameraId: 'cam2' });
    expect(cal.cameraId).toBe('cam2');
    expect(cal.controlPointCount).toBe(7);
    expect(cal.validationPointCount).toBe(2);
    expect(cal.trainingResidualRms).toBeGreaterThanOrEqual(0);
    expect(cal.validationResidualRms).toBeDefined();
    expect(cal.schemaVersion).toBe('1.0');
    expect(cal.calibrationType).toBe('projective-dlt-11');
    expect(cal.distortionMethod).toBe('none');
    expect(cal.points?.length).toBe(9);
  });
});
