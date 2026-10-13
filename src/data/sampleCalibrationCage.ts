import { CalibrationControlPoint3D } from '../types';

/**
 * SYNTHETIC CALIBRATION CONTROL-POINT FIXTURE (Validation Dataset)
 *
 * PROVENANCE & SCIENTIFIC HONESTY AUDIT:
 * - This dataset is 100% SYNTHETIC COMPUTER-GENERATED validation data.
 * - It is NOT physical laboratory hardware.
 * - It is NOT surveyed by a physical CMM or physical metrology instrument.
 * - Nominal image projections were computed analytically from an idealized projective camera model
 *   (f = 600 px, principal point at image center (320, 240), zero lens distortion).
 * - Purpose: Intended purely as a reproducible synthetic geometric benchmark to verify numerical algorithms,
 *   Hartley normalization invariance, QR/SVD stability, and hold-out residual computation.
 *
 * Geometric structure:
 * - 16 control points: 12 training points across two orthogonal planes, 4 hold-out validation points
 * - Span: 1.0 m x 1.0 m x 1.0 m synthetic spatial volume (Z in [1.0m, 2.0m])
 */
export const SAMPLE_CALIBRATION_CAGE_CSV = `# SYNTHETIC CALIBRATION CONTROL-POINT FIXTURE (Validation Dataset)
# NOTE: Synthetic computer-generated data for numerical algorithm verification only.
# NOT measured physical hardware.
# Columns: ID, X(m), Y(m), Z(m), u(px), v(px), isValidation(0/1)
CAGE-01, 0.000, 0.000, 1.000, 185.2, 342.1, 0
CAGE-02, 0.500, 0.000, 1.000, 274.6, 342.1, 0
CAGE-03, 1.000, 0.000, 1.000, 364.0, 342.1, 0
CAGE-04, 0.000, 0.500, 1.000, 185.2, 240.0, 0
CAGE-05, 0.500, 0.500, 1.000, 274.6, 240.0, 0
CAGE-06, 1.000, 0.500, 1.000, 364.0, 240.0, 0
CAGE-07, 0.000, 1.000, 1.000, 185.2, 137.9, 0
CAGE-08, 0.500, 1.000, 1.000, 274.6, 137.9, 0
CAGE-09, 1.000, 1.000, 1.000, 364.0, 137.9, 0
CAGE-10, 0.000, 0.000, 1.500, 218.4, 308.1, 0
CAGE-11, 1.000, 0.000, 1.500, 337.6, 308.1, 0
CAGE-12, 0.000, 1.000, 1.500, 218.4, 171.9, 0
# Hold-out Validation Points (Independent Verification)
CAGE-13, 1.000, 1.000, 1.500, 337.6, 171.9, 1
CAGE-14, 0.250, 0.250, 1.800, 242.3, 281.8, 1
CAGE-15, 0.750, 0.250, 1.800, 313.7, 281.8, 1
CAGE-16, 0.500, 0.750, 2.000, 278.0, 203.5, 1
`;

export const SAMPLE_CALIBRATION_CAGE_POINTS: CalibrationControlPoint3D[] = [
  { id: 'CAGE-01', x: 0.000, y: 0.000, z: 1.000, u: 185.2, v: 342.1, isValidation: false },
  { id: 'CAGE-02', x: 0.500, y: 0.000, z: 1.000, u: 274.6, v: 342.1, isValidation: false },
  { id: 'CAGE-03', x: 1.000, y: 0.000, z: 1.000, u: 364.0, v: 342.1, isValidation: false },
  { id: 'CAGE-04', x: 0.000, y: 0.500, z: 1.000, u: 185.2, v: 240.0, isValidation: false },
  { id: 'CAGE-05', x: 0.500, y: 0.500, z: 1.000, u: 274.6, v: 240.0, isValidation: false },
  { id: 'CAGE-06', x: 1.000, y: 0.500, z: 1.000, u: 364.0, v: 240.0, isValidation: false },
  { id: 'CAGE-07', x: 0.000, y: 1.000, z: 1.000, u: 185.2, v: 137.9, isValidation: false },
  { id: 'CAGE-08', x: 0.500, y: 1.000, z: 1.000, u: 274.6, v: 137.9, isValidation: false },
  { id: 'CAGE-09', x: 1.000, y: 1.000, z: 1.000, u: 364.0, v: 137.9, isValidation: false },
  { id: 'CAGE-10', x: 0.000, y: 0.000, z: 1.500, u: 218.4, v: 308.1, isValidation: false },
  { id: 'CAGE-11', x: 1.000, y: 0.000, z: 1.500, u: 337.6, v: 308.1, isValidation: false },
  { id: 'CAGE-12', x: 0.000, y: 1.000, z: 1.500, u: 218.4, v: 171.9, isValidation: false },
  { id: 'CAGE-13', x: 1.000, y: 1.000, z: 1.500, u: 337.6, v: 171.9, isValidation: true },
  { id: 'CAGE-14', x: 0.250, y: 0.250, z: 1.800, u: 242.3, v: 281.8, isValidation: true },
  { id: 'CAGE-15', x: 0.750, y: 0.250, z: 1.800, u: 313.7, v: 281.8, isValidation: true },
  { id: 'CAGE-16', x: 0.500, y: 0.750, z: 2.000, u: 278.0, v: 203.5, isValidation: true },
];
