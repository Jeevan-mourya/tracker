import { describe, it, expect } from 'vitest';
import {
  buildDefaultDLT,
  project3DToDLT,
  triangulateDLT,
  solve3x3,
  solveLeastSquares4x3,
} from './triangulation';
import { BASELINE_TRIANGULATION_FIXTURE } from '../../tests/fixtures/baselineTriangulationFixture';

describe('Batch 0: Baseline Triangulation Deterministic Fixture', () => {
  it('reconstructs orthogonal-front-side test point with expected baseline numbers', () => {
    const { orthogonal } = BASELINE_TRIANGULATION_FIXTURE;
    const result = triangulateDLT(
      orthogonal.cam1Point.u,
      orthogonal.cam1Point.v,
      orthogonal.dlt1,
      orthogonal.cam2Point.u,
      orthogonal.cam2Point.v,
      orthogonal.dlt2
    );

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.x).toBeCloseTo(orthogonal.expectedX, 4);
    expect(result.y).toBeCloseTo(orthogonal.expectedY, 4);
    expect(result.z).toBeCloseTo(orthogonal.expectedZ, 4);
    expect(result.residual).toBeCloseTo(orthogonal.expectedResidual, 4);
  });

  it('reconstructs convergent-stereo test point with expected baseline numbers', () => {
    const { convergent } = BASELINE_TRIANGULATION_FIXTURE;
    const result = triangulateDLT(
      convergent.cam1Point.u,
      convergent.cam1Point.v,
      convergent.dlt1,
      convergent.cam2Point.u,
      convergent.cam2Point.v,
      convergent.dlt2
    );

    expect(result).not.toBeNull();
    if (!result) return;

    expect(result.x).toBeCloseTo(convergent.expectedX, 4);
    expect(result.y).toBeCloseTo(convergent.expectedY, 4);
    expect(result.z).toBeCloseTo(convergent.expectedZ, 4);
    expect(result.residual).toBeCloseTo(convergent.expectedResidual, 4);
  });

  it('verifies round-trip project3DToDLT -> triangulateDLT on arbitrary 3D coordinate', () => {
    const defaultDLT = buildDefaultDLT('orthogonal-front-side', 500, 500, { x: 320, y: 240 }, { x: 320, y: 240 }, 2.0, 90);
    const groundTruth = { x: 0.45, y: 0.85, z: -0.25 };

    const p1 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, defaultDLT.dltCam1);
    const p2 = project3DToDLT(groundTruth.x, groundTruth.y, groundTruth.z, defaultDLT.dltCam2);

    const reconstructed = triangulateDLT(p1.u, p1.v, defaultDLT.dltCam1, p2.u, p2.v, defaultDLT.dltCam2);

    expect(reconstructed).not.toBeNull();
    if (!reconstructed) return;

    expect(reconstructed.x).toBeCloseTo(groundTruth.x, 5);
    expect(reconstructed.y).toBeCloseTo(groundTruth.y, 5);
    expect(reconstructed.z).toBeCloseTo(groundTruth.z, 5);
    expect(reconstructed.residual).toBeLessThan(1e-6);
  });
});
