import { DLT11 } from '../../src/types';

/**
 * Deterministic Baseline Fixture for Batch 0
 * Records exact inputs, camera matrices, and outputs produced by the prototype solver
 * before Batch 1 numerical upgrades.
 */
export const BASELINE_TRIANGULATION_FIXTURE = {
  // Scenario 1: Orthogonal Front-Side setup
  // Scale 240 px/m, Origin at (300, 350)
  orthogonal: {
    dlt1: [
      240, 0, 0, 300,
      0, -240, 0, 350,
      0, 0, 0
    ] as DLT11,
    dlt2: [
      0, 0, 240, 300,
      0, -240, 0, 350,
      0, 0, 0
    ] as DLT11,
    cam1Point: { u: 420, v: 230 }, // X = (420 - 300)/240 = 0.5m, Y = (350 - 230)/240 = 0.5m
    cam2Point: { u: 240, v: 230 }, // Z = (240 - 300)/240 = -0.25m, Y = 0.5m
    expectedX: 0.5,
    expectedY: 0.5,
    expectedZ: -0.25,
    expectedResidual: 0.0,
  },

  // Scenario 2: Convergent Stereo setup
  // Baseline 1.2m, Convergence 45 deg, Scale 240 px/m
  convergent: {
    dlt1: [
      221.726, 0, 91.844, 156.0,
      0, -240, 0, 350,
      0, 0, 0.05
    ] as DLT11,
    dlt2: [
      221.726, 0, -91.844, 444.0,
      0, -240, 0, 350,
      0, 0, 0.05
    ] as DLT11,
    cam1Point: { u: 312.5, v: 254.0 },
    cam2Point: { u: 287.5, v: 254.0 },
    expectedX: 0.11606564,
    expectedY: 0.30921345,
    expectedZ: 1.71565134,
    expectedResidual: 0.0,
  }
};
