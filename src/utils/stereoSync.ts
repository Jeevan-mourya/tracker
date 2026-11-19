/**
 * Tracker / Open Source Physics – Stereo Synchronization & Master Physical Clock Engine
 *
 * Implements authoritative physical test clock synchronization (t_test) for dual-camera
 * systems with mismatched frame rates, independent clip windows, and anchor pairs (n, m).
 *
 * Mathematical model:
 *   t_test(f_k) = (f_k - anchor_k) / fps_k
 *   f_k(t_test) = anchor_k + t_test * fps_k
 *   t_overlap_start = max(t_start_1, t_start_2)
 *   t_overlap_end   = min(t_end_1,   t_end_2)
 */

import { ClipSettings, StereoSyncConfig, StereoSyncStatus, TriangulationConfig } from '../types';

export const DEFAULT_SYNC_TOLERANCE_SEC = 0.005; // 5 milliseconds default tolerance
export const DEFAULT_SEEK_WATCHDOG_MS = 500;

/**
 * One-way read migration from legacy mismatched syncConfig keys
 * (`anchorCam1Frame`, `anchorCam2Frame`, `syncToleranceSeconds`) into the
 * canonical `StereoSyncConfig` schema.
 */
export function normalizeStereoSyncConfig(
  raw: Partial<StereoSyncConfig> & {
    anchorCam1Frame?: number;
    anchorCam2Frame?: number;
    syncToleranceSeconds?: number;
  } | undefined | null,
  fallbackFpsCam1 = 30,
  fallbackFpsCam2 = 30
): StereoSyncConfig {
  const f1 = Math.max(0.001, Number(raw?.fpsCam1) || fallbackFpsCam1 || 30);
  const f2 = Math.max(0.001, Number(raw?.fpsCam2) || fallbackFpsCam2 || f1);
  const anchor1 = Math.max(
    0,
    Math.round(
      raw?.anchorFrameCam1 !== undefined
        ? Number(raw.anchorFrameCam1)
        : raw?.anchorCam1Frame !== undefined
        ? Number(raw.anchorCam1Frame)
        : 0
    ) || 0
  );
  const anchor2 = Math.max(
    0,
    Math.round(
      raw?.anchorFrameCam2 !== undefined
        ? Number(raw.anchorFrameCam2)
        : raw?.anchorCam2Frame !== undefined
        ? Number(raw.anchorCam2Frame)
        : 0
    ) || 0
  );
  const tolRaw =
    raw?.toleranceSec !== undefined
      ? Number(raw.toleranceSec)
      : raw?.syncToleranceSeconds !== undefined
      ? Number(raw.syncToleranceSeconds)
      : DEFAULT_SYNC_TOLERANCE_SEC;
  const toleranceSec = Math.max(0.0001, Number.isFinite(tolRaw) && tolRaw > 0 ? tolRaw : DEFAULT_SYNC_TOLERANCE_SEC);
  const playbackMaster: 'cam1' | 'cam2' | 'both' =
    raw?.playbackMaster === 'cam1' || raw?.playbackMaster === 'cam2' || raw?.playbackMaster === 'both'
      ? raw.playbackMaster
      : 'both';

  return {
    anchorFrameCam1: anchor1,
    anchorFrameCam2: anchor2,
    fpsCam1: f1,
    fpsCam2: f2,
    toleranceSec,
    playbackMaster,
  };
}

/**
 * Resolves a complete, strictly typed `ClipSettings` object for Camera 2 from
 * `TriangulationConfig.clipCam2` with clean fallbacks when Camera 2 has not yet been trimmed.
 */
export function resolveEffectiveClipCam2(
  triangulation: TriangulationConfig | undefined,
  clipCam1: ClipSettings
): ClipSettings {
  const fps1 = Math.max(0.001, triangulation?.fpsCam1 || clipCam1.fps || 30);
  const existing = triangulation?.clipCam2;
  const fps2 = Math.max(0.001, existing?.fps || triangulation?.fpsCam2 || fps1);
  const startFrame = Math.max(0, existing?.startFrame ?? 0);

  let totalFrames: number;
  if (existing?.totalFrames !== undefined && existing.totalFrames >= 1) {
    totalFrames = Math.max(1, Math.round(existing.totalFrames));
  } else if (existing?.endFrame !== undefined && existing.endFrame >= 0) {
    totalFrames = Math.max(1, Math.round(existing.endFrame) + 1);
  } else {
    const scaled = Math.round(Math.max(1, clipCam1.totalFrames) * (fps2 / fps1));
    totalFrames = Math.max(1, scaled);
  }

  const endFrame =
    existing?.endFrame !== undefined
      ? Math.max(startFrame, Math.min(Math.max(startFrame, totalFrames - 1), Math.round(existing.endFrame)))
      : Math.max(startFrame, totalFrames - 1);

  const stepSize = Math.max(1, existing?.stepSize ?? 1);
  const dt = stepSize / fps2;

  return {
    startFrame,
    endFrame,
    stepSize,
    fps: fps2,
    startTime: existing?.startTime ?? 0,
    frameDt: existing?.frameDt ?? dt,
    dt: existing?.dt ?? dt,
    totalFrames: Math.max(totalFrames, endFrame + 1),
    playbackFps: existing?.playbackFps ?? (fps2 > 240 ? 30 : fps2),
    cameraModel: existing?.cameraModel,
    timeUnit: existing?.timeUnit,
    shutterSpeed: existing?.shutterSpeed,
  };
}

/**
 * Converts a camera frame index into Master Physical Test Time (seconds) relative to its anchor.
 */
export function frameToPhysicalTestTime(
  frame: number,
  anchorFrame: number,
  fps: number
): number {
  const safeFps = Math.max(0.001, fps || 30);
  return (frame - anchorFrame) / safeFps;
}

/**
 * Converts Master Physical Test Time (seconds) into a continuous floating-point frame index.
 */
export function physicalTestTimeToFrame(
  testTimeSec: number,
  anchorFrame: number,
  fps: number
): number {
  const safeFps = Math.max(0.001, fps || 30);
  return anchorFrame + testTimeSec * safeFps;
}

export interface StereoTimeWindow {
  tStartCam1: number;
  tEndCam1: number;
  tStartCam2: number;
  tEndCam2: number;
  overlapStartSec: number;
  overlapEndSec: number;
  hasOverlap: boolean;
  overlapDurationSec: number;
  unionStartSec: number;
  unionEndSec: number;
  unionDurationSec: number;
  isSingleFrameCam1: boolean;
  isSingleFrameCam2: boolean;
}

/**
 * Computes both the effective synchronized overlap window and the full union window
 * across Camera 1 and Camera 2 active clip trims. Safe for single-frame (`totalFrames === 1`)
 * calibration stills (zero NaN / zero-division).
 */
export function computeStereoTimeWindow(
  clipCam1: Pick<ClipSettings, 'startFrame' | 'endFrame' | 'totalFrames' | 'fps'>,
  clipCam2: Pick<ClipSettings, 'startFrame' | 'endFrame' | 'totalFrames' | 'fps'>,
  syncConfig: Pick<StereoSyncConfig, 'anchorFrameCam1' | 'anchorFrameCam2' | 'fpsCam1' | 'fpsCam2'>
): StereoTimeWindow {
  const f1 = Math.max(0.001, syncConfig.fpsCam1 || clipCam1.fps || 30);
  const f2 = Math.max(0.001, syncConfig.fpsCam2 || clipCam2.fps || 30);

  const isSingleFrameCam1 = clipCam1.totalFrames <= 1 || clipCam1.endFrame <= clipCam1.startFrame;
  const isSingleFrameCam2 = clipCam2.totalFrames <= 1 || clipCam2.endFrame <= clipCam2.startFrame;

  const s1 = Math.max(0, clipCam1.startFrame);
  const e1 = isSingleFrameCam1 ? s1 : Math.max(s1, clipCam1.endFrame);

  const s2 = Math.max(0, clipCam2.startFrame);
  const e2 = isSingleFrameCam2 ? s2 : Math.max(s2, clipCam2.endFrame);

  const tStartCam1 = frameToPhysicalTestTime(s1, syncConfig.anchorFrameCam1, f1);
  const tEndCam1 = frameToPhysicalTestTime(e1, syncConfig.anchorFrameCam1, f1);

  const tStartCam2 = frameToPhysicalTestTime(s2, syncConfig.anchorFrameCam2, f2);
  const tEndCam2 = frameToPhysicalTestTime(e2, syncConfig.anchorFrameCam2, f2);

  const overlapStartSec = Math.max(tStartCam1, tStartCam2);
  const overlapEndSec = Math.min(tEndCam1, tEndCam2);
  const hasOverlap = overlapStartSec <= overlapEndSec + 1e-9;
  const overlapDurationSec = hasOverlap ? Math.max(0, overlapEndSec - overlapStartSec) : 0;

  const unionStartSec = Math.min(tStartCam1, tStartCam2);
  const unionEndSec = Math.max(tEndCam1, tEndCam2);
  const unionDurationSec = Math.max(0, unionEndSec - unionStartSec);

  return {
    tStartCam1,
    tEndCam1,
    tStartCam2,
    tEndCam2,
    overlapStartSec,
    overlapEndSec,
    hasOverlap,
    overlapDurationSec,
    unionStartSec,
    unionEndSec,
    unionDurationSec,
    isSingleFrameCam1,
    isSingleFrameCam2,
  };
}

export interface CameraTestTimeEvaluation {
  rawFloatFrame: number;
  rawFrame: number;
  clampedFrame: number;
  inClipWindow: boolean;
  actualTestTimeSec: number;
  deltaTSyncSec: number;
}

/**
 * Evaluates a single camera's frame index and clip-window membership at Master Physical Test Time `tTestSec`.
 * Honors `[startFrame, endFrame]` strictly without corrupting out-of-window frames to 0.
 */
export function evaluateCameraAtTestTime(
  tTestSec: number,
  anchorFrame: number,
  fps: number,
  startFrame: number,
  endFrame: number,
  totalFrames?: number
): CameraTestTimeEvaluation {
  const safeFps = Math.max(0.001, fps || 30);
  const minBound = Math.max(0, Math.round(startFrame));
  const maxCandidate =
    totalFrames !== undefined && totalFrames >= 1
      ? Math.min(Math.round(endFrame), Math.max(minBound, Math.round(totalFrames) - 1))
      : Math.round(endFrame);
  const maxBound = Math.max(minBound, maxCandidate);

  const rawFloatFrame = anchorFrame + tTestSec * safeFps;
  const rawFrame = Math.round(rawFloatFrame);
  const inClipWindow = rawFrame >= minBound && rawFrame <= maxBound;
  const clampedFrame = Math.max(minBound, Math.min(maxBound, rawFrame));
  const actualTestTimeSec = (clampedFrame - anchorFrame) / safeFps;
  const deltaTSyncSec = Math.abs(actualTestTimeSec - tTestSec);

  return {
    rawFloatFrame,
    rawFrame,
    clampedFrame,
    inClipWindow,
    actualTestTimeSec,
    deltaTSyncSec,
  };
}

/**
 * Auto-adaptive Master Physical Clock increment:
 * - Standard rates (<= 60 fps): advances in true physical real time (`realDeltaSec * playbackSpeed`).
 * - High-speed cameras (> 60 fps): advances at a smooth 30 primary-frames/sec review cadence
 *   (`(realDeltaSec * 30 * playbackSpeed) / primaryFps`) so 1,000+ fps ballistic shots remain inspectable.
 */
export function computeAdaptiveClockStepSec(
  realDeltaSec: number,
  primaryFps: number,
  playbackSpeed: number
): number {
  const safeDt = Math.max(0, Math.min(0.25, Number.isFinite(realDeltaSec) ? realDeltaSec : 0));
  const safeSpeed = Math.max(0.01, Number.isFinite(playbackSpeed) ? playbackSpeed : 1);
  const safeFps = Math.max(0.001, primaryFps || 30);

  if (safeFps <= 60) {
    return safeDt * safeSpeed;
  }
  const reviewFramesPerSec = 30;
  return (safeDt * reviewFramesPerSec * safeSpeed) / safeFps;
}

/**
 * Maps Camera 1 frame `i` to corresponding Camera 2 frame `j` based on elapsed physical time
 * relative to the anchor pair (n, m), strictly honoring `[startFrameCam2, endFrameCam2]`.
 */
export function mapCam1ToCam2(
  frameCam1: number,
  anchorCam1: number, // n
  anchorCam2: number, // m
  fpsCam1: number,    // f1
  fpsCam2: number,    // f2
  totalFramesCam2?: number,
  startFrameCam2 = 0,
  endFrameCam2?: number
): {
  frameCam2: number;
  rawFrameCam2: number;
  inClipWindow: boolean;
  deltaT: number;
  deltaTSyncSec: number;
} {
  const f1 = Math.max(0.001, fpsCam1 || 30);
  const f2 = Math.max(0.001, fpsCam2 || 30);

  // Elapsed physical time relative to Camera 1 anchor n
  const deltaT = (frameCam1 - anchorCam1) / f1;

  // Closest Camera 2 frame j matching t2(m) + deltaT
  const rawFrameCam2 = anchorCam2 + Math.round(deltaT * f2);

  const minBound = Math.max(0, Math.round(startFrameCam2));
  const hasUpperBound = endFrameCam2 !== undefined || totalFramesCam2 !== undefined;
  let maxBound = Number.POSITIVE_INFINITY;
  if (endFrameCam2 !== undefined && totalFramesCam2 !== undefined) {
    maxBound = Math.max(minBound, Math.min(Math.round(endFrameCam2), Math.max(0, Math.round(totalFramesCam2) - 1)));
  } else if (endFrameCam2 !== undefined) {
    maxBound = Math.max(minBound, Math.round(endFrameCam2));
  } else if (totalFramesCam2 !== undefined) {
    maxBound = Math.max(minBound, Math.round(totalFramesCam2) - 1);
  }

  const inClipWindow = rawFrameCam2 >= minBound && (!hasUpperBound || rawFrameCam2 <= maxBound);
  const frameCam2 = hasUpperBound
    ? Math.max(minBound, Math.min(maxBound, rawFrameCam2))
    : Math.max(minBound, rawFrameCam2);

  // Time difference between actual Cam 2 presentation time and ideal synchronization time
  const idealT2 = deltaT;
  const actualT2 = (frameCam2 - anchorCam2) / f2;
  const deltaTSyncSec = Math.abs(actualT2 - idealT2);

  return { frameCam2, rawFrameCam2, inClipWindow, deltaT, deltaTSyncSec };
}

/**
 * Maps Camera 2 frame `j` back to Camera 1 frame `i` relative to anchor pair (n, m),
 * honoring `[startFrameCam1, endFrameCam1]`.
 */
export function mapCam2ToCam1(
  frameCam2: number,
  anchorCam1: number, // n
  anchorCam2: number, // m
  fpsCam1: number,    // f1
  fpsCam2: number,    // f2
  totalFramesCam1?: number,
  startFrameCam1 = 0,
  endFrameCam1?: number
): {
  frameCam1: number;
  rawFrameCam1: number;
  inClipWindow: boolean;
  deltaT: number;
  deltaTSyncSec: number;
} {
  const f1 = Math.max(0.001, fpsCam1 || 30);
  const f2 = Math.max(0.001, fpsCam2 || 30);

  const deltaT = (frameCam2 - anchorCam2) / f2;
  const rawFrameCam1 = anchorCam1 + Math.round(deltaT * f1);

  const minBound = Math.max(0, Math.round(startFrameCam1));
  const hasUpperBound = endFrameCam1 !== undefined || totalFramesCam1 !== undefined;
  let maxBound = Number.POSITIVE_INFINITY;
  if (endFrameCam1 !== undefined && totalFramesCam1 !== undefined) {
    maxBound = Math.max(minBound, Math.min(Math.round(endFrameCam1), Math.max(0, Math.round(totalFramesCam1) - 1)));
  } else if (endFrameCam1 !== undefined) {
    maxBound = Math.max(minBound, Math.round(endFrameCam1));
  } else if (totalFramesCam1 !== undefined) {
    maxBound = Math.max(minBound, Math.round(totalFramesCam1) - 1);
  }

  const inClipWindow = rawFrameCam1 >= minBound && (!hasUpperBound || rawFrameCam1 <= maxBound);
  const frameCam1 = hasUpperBound
    ? Math.max(minBound, Math.min(maxBound, rawFrameCam1))
    : Math.max(minBound, rawFrameCam1);

  const idealT1 = deltaT;
  const actualT1 = (frameCam1 - anchorCam1) / f1;
  const deltaTSyncSec = Math.abs(actualT1 - idealT1);

  return { frameCam1, rawFrameCam1, inClipWindow, deltaT, deltaTSyncSec };
}

/**
 * Computes the full synchronization status between the current Camera 1 and Camera 2 frames.
 */
export function evaluateStereoSync(
  frameCam1: number,
  frameCam2: number,
  config: StereoSyncConfig
): StereoSyncStatus {
  const f1 = Math.max(0.001, config.fpsCam1 || 30);
  const f2 = Math.max(0.001, config.fpsCam2 || 30);
  const n = config.anchorFrameCam1;
  const m = config.anchorFrameCam2;
  const tol = Math.max(0.0001, config.toleranceSec || DEFAULT_SYNC_TOLERANCE_SEC);

  const timeCam1 = frameCam1 / f1;
  const timeCam2 = frameCam2 / f2;

  // Elapsed time relative to respective anchors
  const elapsed1 = (frameCam1 - n) / f1;
  const elapsed2 = (frameCam2 - m) / f2;

  const deltaTimeSyncSec = Math.abs(elapsed2 - elapsed1);
  const deltaTimeSyncMs = deltaTimeSyncSec * 1000;

  let status: 'synchronized' | 'within_tolerance' | 'outside_tolerance';
  let message: string;

  if (deltaTimeSyncSec < 1e-6) {
    status = 'synchronized';
    message = `Exact synchronization (Δt = 0.00 ms)`;
  } else if (deltaTimeSyncSec <= tol) {
    status = 'within_tolerance';
    message = `Synchronized within tolerance (Δt = ${deltaTimeSyncMs.toFixed(2)} ms ≤ ${(tol * 1000).toFixed(1)} ms)`;
  } else {
    status = 'outside_tolerance';
    message = `Outside tolerance (Δt = ${deltaTimeSyncMs.toFixed(2)} ms > ${(tol * 1000).toFixed(1)} ms). Unsuitable for synchronous triangulation without sub-frame interpolation.`;
  }

  return {
    frameCam1,
    frameCam2,
    timeCam1,
    timeCam2,
    deltaTimeSyncSec,
    deltaTimeSyncMs,
    isSynchronized: deltaTimeSyncSec <= tol,
    status,
    message,
  };
}

/**
 * Minimal video-element contract required by `SeekController` (enables deterministic
 * Vitest unit testing alongside real `HTMLVideoElement` instances).
 */
export interface SeekableVideoLike {
  currentTime: number;
  readonly readyState: number;
  readonly duration: number;
  addEventListener(type: string, listener: () => void, options?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, listener: () => void): void;
}

export type SeekOutcome = 'seeked' | 'skipped' | 'coalesced' | 'watchdog' | 'cancelled' | 'error';

/**
 * Cancelable, latest-request-wins HTML5 `<video>` Seek Queue with a watchdog timer.
 *
 * Guarantees that rapid timeline scrubbing or high-rate RAF playback NEVER piles up
 * overlapping `video.currentTime` assignments or deadlocks Chromium's media decoder.
 */
export class SeekController {
  private video: SeekableVideoLike | null = null;
  private readonly watchdogMs: number;
  private readonly epsilonSec: number;

  private inFlight = false;
  private disposed = false;
  private activeTimer: ReturnType<typeof setTimeout> | null = null;
  private activeCleanup: (() => void) | null = null;
  private activeResolve: ((outcome: SeekOutcome) => void) | null = null;

  private pendingTargetSec: number | null = null;
  private pendingResolve: ((outcome: SeekOutcome) => void) | null = null;
  private totalDispatchedSeeks = 0;

  constructor(watchdogMs = DEFAULT_SEEK_WATCHDOG_MS, epsilonSec = 0.0015) {
    this.watchdogMs = Math.max(10, watchdogMs);
    this.epsilonSec = Math.max(1e-5, epsilonSec);
  }

  public attach(video: SeekableVideoLike | null): void {
    if (this.video !== video) {
      this.cancel();
      this.video = video;
      this.disposed = false;
    }
  }

  public get dispatchedCount(): number {
    return this.totalDispatchedSeeks;
  }

  public get isBusy(): boolean {
    return this.inFlight;
  }

  /**
   * Requests a seek to `targetTimeSec`.
   * If a seek is already in flight, supersedes any earlier queued request (resolving the
   * superseded request immediately with `'coalesced'`) and dispatches only the latest target
   * once the active seek finishes or triggers its watchdog.
   */
  public seek(targetTimeSec: number): Promise<SeekOutcome> {
    if (this.disposed || !this.video) {
      return Promise.resolve('cancelled');
    }
    if (this.video.readyState < 1) {
      return Promise.resolve('skipped');
    }

    const clampedTarget = this.clampTime(targetTimeSec);

    if (this.inFlight) {
      // Latest-request-wins coalescing: resolve any previously queued promise immediately
      if (this.pendingResolve) {
        const superseded = this.pendingResolve;
        this.pendingResolve = null;
        superseded('coalesced');
      }
      this.pendingTargetSec = clampedTarget;
      return new Promise<SeekOutcome>((resolve) => {
        this.pendingResolve = resolve;
      });
    }

    // Skip redundant seeks when already within tolerance (except at exact 0 where initial decode may be needed)
    if (
      Math.abs(this.video.currentTime - clampedTarget) <= this.epsilonSec &&
      !(this.video.currentTime === 0 && clampedTarget > 0)
    ) {
      return Promise.resolve('skipped');
    }

    return this.dispatchSeek(clampedTarget);
  }

  private clampTime(rawSec: number): number {
    const safe = Number.isFinite(rawSec) ? Math.max(0.0005, rawSec) : 0.0005;
    if (this.video && Number.isFinite(this.video.duration) && this.video.duration > 0) {
      return Math.min(Math.max(0.0005, this.video.duration - 0.001), safe);
    }
    return safe;
  }

  private dispatchSeek(targetSec: number): Promise<SeekOutcome> {
    const video = this.video;
    if (!video || this.disposed) {
      return Promise.resolve('cancelled');
    }

    this.inFlight = true;
    this.totalDispatchedSeeks += 1;

    return new Promise<SeekOutcome>((resolve) => {
      let settled = false;

      const finish = (outcome: SeekOutcome) => {
        if (settled) return;
        settled = true;

        if (this.activeTimer !== null) {
          clearTimeout(this.activeTimer);
          this.activeTimer = null;
        }
        if (this.activeCleanup) {
          const fn = this.activeCleanup;
          this.activeCleanup = null;
          fn();
        }
        this.activeResolve = null;
        this.inFlight = false;
        resolve(outcome);

        // Immediately drain the latest coalesced request if one arrived while in flight
        if (!this.disposed && this.pendingTargetSec !== null) {
          const nextTarget = this.pendingTargetSec;
          const nextResolve = this.pendingResolve;
          this.pendingTargetSec = null;
          this.pendingResolve = null;

          this.seek(nextTarget).then((nextOutcome) => {
            nextResolve?.(nextOutcome);
          });
        }
      };

      const onSeeked = () => finish('seeked');
      const onError = () => finish('error');

      this.activeCleanup = () => {
        try {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
        } catch {
          // ignore
        }
      };
      this.activeResolve = finish;

      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });

      this.activeTimer = setTimeout(() => {
        finish('watchdog');
      }, this.watchdogMs);

      try {
        video.currentTime = targetSec;
      } catch {
        finish('error');
      }
    });
  }

  /** Cancels any active or queued seek without detaching the video element. */
  public cancel(): void {
    if (this.pendingResolve) {
      const fn = this.pendingResolve;
      this.pendingResolve = null;
      this.pendingTargetSec = null;
      fn('cancelled');
    }
    if (this.activeResolve) {
      const fn = this.activeResolve;
      this.activeResolve = null;
      fn('cancelled');
    }
    this.inFlight = false;
  }

  /** Permanently disposes timers and listeners on unmount. */
  public dispose(): void {
    this.disposed = true;
    this.cancel();
    this.video = null;
  }
}

/**
 * Format stereo presentation timestamp into mm:ss.fff or seconds with frame count.
 */
export function formatStereoTime(seconds: number, fps?: number): string {
  const neg = seconds < 0;
  const s = Math.abs(Number.isFinite(seconds) ? seconds : 0);
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  const sign = neg ? '-' : '';
  const formatted = `${sign}${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  if (fps !== undefined && fps > 0) {
    const frame = Math.round(seconds * fps);
    return `${formatted} (f#${frame})`;
  }
  return formatted;
}
