import { describe, it, expect, vi } from 'vitest';
import {
  normalizeStereoSyncConfig,
  resolveEffectiveClipCam2,
  frameToPhysicalTestTime,
  physicalTestTimeToFrame,
  computeStereoTimeWindow,
  evaluateCameraAtTestTime,
  computeAdaptiveClockStepSec,
  mapCam1ToCam2,
  mapCam2ToCam1,
  SeekController,
  SeekableVideoLike,
} from '../src/utils/stereoSync';
import { interpolateCameraCoordinates } from '../src/utils/triangulation';
import type { ClipSettings, TriangulationConfig } from '../src/types';

class MockSeekableVideo implements SeekableVideoLike {
  public currentTime = 0;
  public readyState = 4;
  public duration = 10;
  public assignedTimes: number[] = [];
  private listeners = new Map<string, Set<() => void>>();

  constructor(private autoEmitSeeked = false) {}

  addEventListener(type: string, listener: () => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    const cbs = Array.from(this.listeners.get(type) || []);
    cbs.forEach((cb) => cb());
  }

  public installSetterSpy(): void {
    let internalTime = this.currentTime;
    Object.defineProperty(this, 'currentTime', {
      get: () => internalTime,
      set: (val: number) => {
        internalTime = val;
        this.assignedTimes.push(val);
        if (this.autoEmitSeeked) {
          queueMicrotask(() => this.emit('seeked'));
        }
      },
      configurable: true,
    });
  }
}

describe('Phase 2: 3D Stereo Master Physical Clock & Multi-Rate Clip Sync', () => {
  it('computes exact overlap, union, and anchor-aligned mappings for 1000 fps Cam 1 (100..600, anchor 200) and 250 fps Cam 2 (10..200, anchor 50)', () => {
    const clipCam1 = { startFrame: 100, endFrame: 600, totalFrames: 1000, fps: 1000 };
    const clipCam2 = { startFrame: 10, endFrame: 200, totalFrames: 300, fps: 250 };
    const sync = {
      anchorFrameCam1: 200,
      anchorFrameCam2: 50,
      fpsCam1: 1000,
      fpsCam2: 250,
    };

    const win = computeStereoTimeWindow(clipCam1, clipCam2, sync);

    // Cam 1: (100 - 200)/1000 = -0.10 s .. (600 - 200)/1000 = +0.40 s
    expect(win.tStartCam1).toBeCloseTo(-0.1, 9);
    expect(win.tEndCam1).toBeCloseTo(0.4, 9);

    // Cam 2: (10 - 50)/250 = -0.16 s .. (200 - 50)/250 = +0.60 s
    expect(win.tStartCam2).toBeCloseTo(-0.16, 9);
    expect(win.tEndCam2).toBeCloseTo(0.6, 9);

    // Overlap: [-0.10, +0.40], duration = 0.50 s
    expect(win.hasOverlap).toBe(true);
    expect(win.overlapStartSec).toBeCloseTo(-0.1, 9);
    expect(win.overlapEndSec).toBeCloseTo(0.4, 9);
    expect(win.overlapDurationSec).toBeCloseTo(0.5, 9);

    // Union: [-0.16, +0.60], duration = 0.76 s
    expect(win.unionStartSec).toBeCloseTo(-0.16, 9);
    expect(win.unionEndSec).toBeCloseTo(0.6, 9);
    expect(win.unionDurationSec).toBeCloseTo(0.76, 9);

    // Anchor check: Cam 1 f=200 (t=0) -> Cam 2 f=50
    const atAnchor = mapCam1ToCam2(200, 200, 50, 1000, 250, 300, 10, 200);
    expect(atAnchor.frameCam2).toBe(50);
    expect(atAnchor.inClipWindow).toBe(true);
    expect(atAnchor.deltaTSyncSec).toBeCloseTo(0, 9);

    // Cam 1 f=400 (t=+0.20 s) -> Cam 2 f=50 + 0.20*250 = 100
    const mid = mapCam1ToCam2(400, 200, 50, 1000, 250, 300, 10, 200);
    expect(mid.frameCam2).toBe(100);
    expect(mid.inClipWindow).toBe(true);

    // Reverse map: Cam 2 f=100 -> Cam 1 f=400 (within 100..600)
    const rev = mapCam2ToCam1(100, 200, 50, 1000, 250, 1000, 100, 600);
    expect(rev.frameCam1).toBe(400);
    expect(rev.inClipWindow).toBe(true);

    // Single-frame calibration still safety (totalFrames === 1 produces zero NaN)
    const singleWin = computeStereoTimeWindow(
      { startFrame: 0, endFrame: 0, totalFrames: 1, fps: 30 },
      { startFrame: 0, endFrame: 0, totalFrames: 1, fps: 30 },
      { anchorFrameCam1: 0, anchorFrameCam2: 0, fpsCam1: 30, fpsCam2: 30 }
    );
    expect(Number.isNaN(singleWin.unionDurationSec)).toBe(false);
    expect(Number.isNaN(singleWin.overlapDurationSec)).toBe(false);
    expect(singleWin.unionDurationSec).toBe(0);
    expect(singleWin.isSingleFrameCam1).toBe(true);
    expect(singleWin.isSingleFrameCam2).toBe(true);
  });

  it('flags out-of-window timestamps cleanly and holds boundary frames without clamping to 0', () => {
    // At t = -0.15 s: Cam 1 (100..600, anchor 200, 1000 fps) raw frame is 50 -> out of window, clamped to 100
    const eval1Before = evaluateCameraAtTestTime(-0.15, 200, 1000, 100, 600, 1000);
    expect(eval1Before.rawFrame).toBe(50);
    expect(eval1Before.clampedFrame).toBe(100);
    expect(eval1Before.inClipWindow).toBe(false);

    // At t = -0.15 s: Cam 2 (10..200, anchor 50, 250 fps) raw frame is 50 - 37.5 = 13 -> IN window!
    const eval2AtMinus015 = evaluateCameraAtTestTime(-0.15, 50, 250, 10, 200, 300);
    expect(eval2AtMinus015.rawFrame).toBe(13);
    expect(eval2AtMinus015.clampedFrame).toBe(13);
    expect(eval2AtMinus015.inClipWindow).toBe(true);

    // At t = -0.25 s: Cam 2 raw frame is -13 -> out of window, clamped strictly to startFrame = 10 (NOT 0!)
    const eval2Before = evaluateCameraAtTestTime(-0.25, 50, 250, 10, 200, 300);
    expect(eval2Before.rawFrame).toBe(-12); // Math.round(-12.5) === -12 in JS
    expect(eval2Before.clampedFrame).toBe(10);
    expect(eval2Before.inClipWindow).toBe(false);

    // At t = +0.50 s: Cam 1 raw frame is 700 -> out of window, clamped to 600; Cam 2 raw frame is 175 -> IN window
    const eval1After = evaluateCameraAtTestTime(0.5, 200, 1000, 100, 600, 1000);
    expect(eval1After.rawFrame).toBe(700);
    expect(eval1After.clampedFrame).toBe(600);
    expect(eval1After.inClipWindow).toBe(false);

    const eval2After = evaluateCameraAtTestTime(0.5, 50, 250, 10, 200, 300);
    expect(eval2After.rawFrame).toBe(175);
    expect(eval2After.clampedFrame).toBe(175);
    expect(eval2After.inClipWindow).toBe(true);

    // Disjoint clip windows report hasOverlap === false while still spanning full union
    const disjoint = computeStereoTimeWindow(
      { startFrame: 0, endFrame: 100, totalFrames: 500, fps: 1000 }, // 0.00..0.10 s
      { startFrame: 100, endFrame: 200, totalFrames: 500, fps: 250 }, // 0.40..0.80 s
      { anchorFrameCam1: 0, anchorFrameCam2: 0, fpsCam1: 1000, fpsCam2: 250 }
    );
    expect(disjoint.hasOverlap).toBe(false);
    expect(disjoint.overlapDurationSec).toBe(0);
    expect(disjoint.unionStartSec).toBeCloseTo(0, 9);
    expect(disjoint.unionEndSec).toBeCloseTo(0.8, 9);
  });

  it('SeekController coalesces rapid overlapping seeks (latest-request-wins) and recovers via watchdog without deadlock', async () => {
    const video = new MockSeekableVideo(false);
    video.installSetterSpy();

    const ctrl = new SeekController(40, 0.001);
    ctrl.attach(video);

    // Fire 5 rapid seeks while the first seek is still in flight
    const p1 = ctrl.seek(1.0);
    const p2 = ctrl.seek(2.0);
    const p3 = ctrl.seek(3.0);
    const p4 = ctrl.seek(4.0);
    const p5 = ctrl.seek(5.0);

    expect(ctrl.isBusy).toBe(true);
    expect(ctrl.dispatchedCount).toBe(1);
    expect(video.assignedTimes).toEqual([1.0]);

    // Superseded intermediate requests resolve immediately as 'coalesced'
    expect(await p2).toBe('coalesced');
    expect(await p3).toBe('coalesced');
    expect(await p4).toBe('coalesced');

    // Complete first seek -> drains ONLY the latest target (5.0)
    video.emit('seeked');
    expect(await p1).toBe('seeked');
    expect(ctrl.dispatchedCount).toBe(2);
    expect(video.assignedTimes).toEqual([1.0, 5.0]);

    // Complete final coalesced seek
    video.emit('seeked');
    expect(await p5).toBe('seeked');
    expect(ctrl.isBusy).toBe(false);

    // Watchdog recovery test: if browser NEVER fires 'seeked', watchdog clears in-flight lock
    vi.useFakeTimers();
    try {
      const stalledPromise = ctrl.seek(7.5);
      expect(ctrl.isBusy).toBe(true);
      vi.advanceTimersByTime(45);
      const outcome = await stalledPromise;
      expect(outcome).toBe('watchdog');
      expect(ctrl.isBusy).toBe(false);

      // Next seek works normally right after watchdog recovery
      const nextPromise = ctrl.seek(8.0);
      video.emit('seeked');
      expect(await nextPromise).toBe('seeked');
    } finally {
      vi.useRealTimers();
    }

    // Dispose cancels any in-flight seek cleanly
    const hanging = ctrl.seek(9.0);
    ctrl.dispose();
    expect(await hanging).toBe('cancelled');
    expect(ctrl.isBusy).toBe(false);
  });

  it('computes auto-adaptive Master Clock steps and migrates legacy syncConfig keys cleanly', () => {
    // Standard rate (<= 60 fps): true real time
    expect(computeAdaptiveClockStepSec(1 / 60, 30, 1.0)).toBeCloseTo(1 / 60, 9);
    expect(computeAdaptiveClockStepSec(1 / 60, 60, 2.0)).toBeCloseTo(2 / 60, 9);

    // High-speed (> 60 fps, e.g., 1000 fps): smooth 30 primary-frames/sec review cadence
    // At 1.0s wall time & 1.0x speed -> 30 frames / 1000 fps = 0.030 s test time
    expect(computeAdaptiveClockStepSec(0.1, 1000, 1.0)).toBeCloseTo(0.003, 9);
    // At 0.5x speed -> 15 primary frames/sec -> 0.0015 s test time per 0.1s wall
    expect(computeAdaptiveClockStepSec(0.1, 1000, 0.5)).toBeCloseTo(0.0015, 9);

    // 1-way legacy migration
    const migrated = normalizeStereoSyncConfig(
      {
        anchorCam1Frame: 120,
        anchorCam2Frame: 30,
        syncToleranceSeconds: 0.002,
      },
      1000,
      250
    );
    expect(migrated).toEqual({
      anchorFrameCam1: 120,
      anchorFrameCam2: 30,
      fpsCam1: 1000,
      fpsCam2: 250,
      toleranceSec: 0.002,
      playbackMaster: 'both',
    });

    // Typed clipCam2 resolution
    const clip1: ClipSettings = {
      startFrame: 100,
      endFrame: 600,
      stepSize: 1,
      fps: 1000,
      startTime: 0,
      frameDt: 0.001,
      dt: 0.001,
      totalFrames: 1000,
    };
    const triMock = {
      fpsCam1: 1000,
      fpsCam2: 250,
      clipCam2: {
        startFrame: 10,
        endFrame: 200,
        stepSize: 1,
        fps: 250,
        startTime: 0,
        frameDt: 0.004,
        dt: 0.004,
        totalFrames: 300,
      },
    } as TriangulationConfig;
    const resolved2 = resolveEffectiveClipCam2(triMock, clip1);
    expect(resolved2.startFrame).toBe(10);
    expect(resolved2.endFrame).toBe(200);
    expect(resolved2.totalFrames).toBe(300);
    expect(resolved2.fps).toBe(250);
  });

  it('performs anchor-aligned multi-rate cubic-spline interpolation with sub-pixel accuracy (< 0.05 px)', () => {
    // True ballistic pixel motion in Cam 2 as a function of physical test time t:
    // px(t) = 120 + 400*t + 50*t^2
    // py(t) = 300 - 200*t + 180*t^2
    const truePx = (t: number) => 120 + 400 * t + 50 * t * t;
    const truePy = (t: number) => 300 - 200 * t + 180 * t * t;

    const anchorCam1 = 200;
    const fpsCam1 = 1000;
    const anchorCam2 = 50;
    const fpsCam2 = 250;

    // Sample Cam 2 on its native 250 fps grid across trimmed clip frames [25, 35, 45, 55, 65, 75, 85, 95]
    const cam2Frames = [25, 35, 45, 55, 65, 75, 85, 95];
    const cam2Samples = cam2Frames.map((f2) => {
      const t2 = frameToPhysicalTestTime(f2, anchorCam2, fpsCam2);
      return {
        frame: f2,
        time: t2,
        px: truePx(t2),
        py: truePy(t2),
      };
    });

    // Query at Cam 1 frame 227 (t1 = +0.027 s), which sits strictly BETWEEN Cam 2 frames 56 and 57
    const targetFrameCam1 = 227;
    const tQuery = frameToPhysicalTestTime(targetFrameCam1, anchorCam1, fpsCam1);
    const exactCam2Float = physicalTestTimeToFrame(tQuery, anchorCam2, fpsCam2);
    expect(exactCam2Float).toBeCloseTo(56.75, 6);

    const interp = interpolateCameraCoordinates(cam2Samples, tQuery, 'cubic-spline');
    expect(interp).not.toBeNull();
    expect(interp!.isExact).toBe(false);

    const errX = Math.abs(interp!.px - truePx(tQuery));
    const errY = Math.abs(interp!.py - truePy(tQuery));
    expect(errX).toBeLessThan(0.05);
    expect(errY).toBeLessThan(0.05);
  });
});
