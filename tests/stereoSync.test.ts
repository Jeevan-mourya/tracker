import { describe, it, expect } from 'vitest';
import { mapCam1ToCam2, mapCam2ToCam1, evaluateStereoSync } from '../src/utils/stereoSync';
import { StereoSyncConfig } from '../src/types';

describe('Stereo Synchronization Engine – Mismatched Frame Rates', () => {
  it('Requirement 2 / Test 1: maps 60 FPS (Cam 1) and 30 FPS (Cam 2) with anchor pair (n=100, m=40)', () => {
    const f1 = 60;
    const f2 = 30;
    const n = 100;
    const m = 40;

    // At anchor frame i = 100 on Cam 1:
    // deltaT = 0s => j should be exactly m = 40
    const syncAtAnchor = mapCam1ToCam2(100, n, m, f1, f2);
    expect(syncAtAnchor.frameCam2).toBe(40);
    expect(syncAtAnchor.deltaT).toBeCloseTo(0, 6);
    expect(syncAtAnchor.deltaTSyncSec).toBeCloseTo(0, 6);

    // After 1 second on Cam 1: frame i = 100 + 60 = 160
    // deltaT = 1.0s => j should be m + 30 = 70
    const syncAfter1Sec = mapCam1ToCam2(160, n, m, f1, f2);
    expect(syncAfter1Sec.frameCam2).toBe(70);
    expect(syncAfter1Sec.deltaT).toBeCloseTo(1.0, 6);
    expect(syncAfter1Sec.deltaTSyncSec).toBeCloseTo(0, 6);

    // At i = 102 (2 frames of 60 FPS = 1/30s = 0.03333s)
    // deltaT = 2 / 60 = 1/30s => exactly 1 frame of 30 FPS => j = 41
    const syncAtStep2 = mapCam1ToCam2(102, n, m, f1, f2);
    expect(syncAtStep2.frameCam2).toBe(41);
    expect(syncAtStep2.deltaT).toBeCloseTo(1 / 30, 6);
    expect(syncAtStep2.deltaTSyncSec).toBeCloseTo(0, 6);

    // At i = 101 (1 frame of 60 FPS = 1/60s = 0.01667s)
    // deltaT = 1/60s. For 30 FPS, deltaT * 30 = 0.5 frame.
    // Nearest integer is 41 (or 40 depending on tie-break). Time diff is <= 1/60s
    const syncAtStep1 = mapCam1ToCam2(101, n, m, f1, f2);
    expect([40, 41]).toContain(syncAtStep1.frameCam2);
    expect(syncAtStep1.deltaTSyncSec).toBeCloseTo(1 / 60, 4);
  });

  it('Requirement 2: evaluates synchronization status and detects out-of-tolerance frame pairs', () => {
    const config: StereoSyncConfig = {
      anchorFrameCam1: 0,
      anchorFrameCam2: 0,
      fpsCam1: 100,
      fpsCam2: 100,
      toleranceSec: 0.005, // 5 ms
      playbackMaster: 'cam1',
    };

    // Both at frame 50: perfectly synchronized
    const statusExact = evaluateStereoSync(50, 50, config);
    expect(statusExact.isSynchronized).toBe(true);
    expect(statusExact.status).toBe('synchronized');
    expect(statusExact.deltaTimeSyncMs).toBeCloseTo(0, 4);

    // Cam 1 at 50 (0.500s), Cam 2 at 52 (0.520s): diff is 20ms > 5ms tolerance
    const statusOut = evaluateStereoSync(50, 52, config);
    expect(statusOut.isSynchronized).toBe(false);
    expect(statusOut.status).toBe('outside_tolerance');
    expect(statusOut.deltaTimeSyncMs).toBeCloseTo(20, 2);
  });

  it('handles reverse mapping from Camera 2 to Camera 1 stably', () => {
    const f1 = 100;
    const f2 = 50;
    const n = 50;
    const m = 25;

    // From Cam 2 frame 35 (10 frames = 0.20s):
    // Should map to Cam 1 frame 50 + 0.20 * 100 = 70
    const reverse = mapCam2ToCam1(35, n, m, f1, f2);
    expect(reverse.frameCam1).toBe(70);
    expect(reverse.deltaT).toBeCloseTo(0.20, 6);
    expect(reverse.deltaTSyncSec).toBeCloseTo(0, 6);
  });
});
