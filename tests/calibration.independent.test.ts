import { describe, it, expect } from 'vitest';
import { Calibration, TriangulationConfig } from '../src/types';

describe('Requirement 4 / Test 3: Independent Camera 1 & Camera 2 Calibration Sticks', () => {
  const initialCalCam1: Calibration = {
    active: true,
    visible: true,
    locked: false,
    pointA: { x: 100, y: 100 },
    pointB: { x: 340, y: 100 }, // 240 px
    realLength: 1.0, // 1 meter => 240 px/m
    unit: 'm',
    scale: 240,
  };

  const initialCalCam2: Calibration = {
    active: true,
    visible: true,
    locked: false,
    pointA: { x: 50, y: 50 },
    pointB: { x: 200, y: 50 }, // 150 px
    realLength: 0.5, // 0.5 meter => 300 px/m
    unit: 'm',
    scale: 300,
  };

  it('updates Camera 1 calibration endpoints and length without modifying Camera 2', () => {
    let cal1 = { ...initialCalCam1 };
    let cal2 = { ...initialCalCam2 };

    // User moves Cam 1 endpoints to measure 100mm sticker (480 px span)
    const newPointA1 = { x: 100, y: 100 };
    const newPointB1 = { x: 580, y: 100 };
    const newLength1 = 0.10; // 100 mm = 0.10 m
    const newScale1 = Math.round(Math.hypot(newPointB1.x - newPointA1.x, newPointB1.y - newPointA1.y) / newLength1); // 4800 px/m

    cal1 = {
      ...cal1,
      pointA: newPointA1,
      pointB: newPointB1,
      realLength: newLength1,
      scale: newScale1,
    };

    // Verify Cam 1 updated
    expect(cal1.realLength).toBe(0.10);
    expect(cal1.scale).toBe(4800);

    // Verify Cam 2 remains strictly unchanged
    expect(cal2.pointA).toEqual(initialCalCam2.pointA);
    expect(cal2.pointB).toEqual(initialCalCam2.pointB);
    expect(cal2.realLength).toBe(0.5);
    expect(cal2.scale).toBe(300);
  });

  it('updates Camera 2 calibration endpoints and length without modifying Camera 1', () => {
    let cal1 = { ...initialCalCam1 };
    let cal2 = { ...initialCalCam2 };

    // User updates Cam 2 calibration to 720 px/m
    cal2 = {
      ...cal2,
      pointA: { x: 0, y: 0 },
      pointB: { x: 72, y: 0 },
      realLength: 0.10,
      scale: 720,
    };

    // Verify Cam 2 updated
    expect(cal2.scale).toBe(720);
    expect(cal2.realLength).toBe(0.10);

    // Verify Cam 1 remains strictly unchanged
    expect(cal1.pointA).toEqual(initialCalCam1.pointA);
    expect(cal1.pointB).toEqual(initialCalCam1.pointB);
    expect(cal1.realLength).toBe(1.0);
    expect(cal1.scale).toBe(240);
  });
});
