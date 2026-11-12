/**
 * Tracker / Open Source Physics – Stereo Synchronization Engine
 * 
 * Implements elapsed presentation timestamp synchronization for dual-camera
 * systems with mismatched frame rates and independent start anchors (n, m).
 *
 * Mathematical model:
 *   t1(i) = t1(n) + (i - n) / f1
 *   Delta_t = t1(i) - t1(n)
 *   t2_target = t2(m) + Delta_t
 *   j = m + round(Delta_t * f2)
 *   Delta_t_sync = | (j - m)/f2 - (i - n)/f1 |
 */

import { StereoSyncConfig, StereoSyncStatus } from '../types';

export const DEFAULT_SYNC_TOLERANCE_SEC = 0.005; // 5 milliseconds default tolerance

/**
 * Maps Camera 1 frame `i` to corresponding Camera 2 frame `j` based on elapsed media time
 * relative to the anchor pair (n, m).
 */
export function mapCam1ToCam2(
  frameCam1: number,
  anchorCam1: number, // n
  anchorCam2: number, // m
  fpsCam1: number,    // f1
  fpsCam2: number,    // f2
  totalFramesCam2?: number
): { frameCam2: number; deltaT: number; deltaTSyncSec: number } {
  const f1 = Math.max(0.001, fpsCam1 || 30);
  const f2 = Math.max(0.001, fpsCam2 || 30);

  // Elapsed media time relative to Camera 1 anchor n
  const deltaT = (frameCam1 - anchorCam1) / f1;

  // Closest Camera 2 frame j matching t2(m) + deltaT
  const rawJ = anchorCam2 + Math.round(deltaT * f2);
  const frameCam2 = totalFramesCam2 !== undefined
    ? Math.max(0, Math.min(totalFramesCam2 - 1, rawJ))
    : Math.max(0, rawJ);

  // Time difference between actual Cam 2 presentation time and ideal synchronization time
  const idealT2 = deltaT;
  const actualT2 = (frameCam2 - anchorCam2) / f2;
  const deltaTSyncSec = Math.abs(actualT2 - idealT2);

  return { frameCam2, deltaT, deltaTSyncSec };
}

/**
 * Maps Camera 2 frame `j` back to Camera 1 frame `i` relative to anchor pair (n, m).
 */
export function mapCam2ToCam1(
  frameCam2: number,
  anchorCam1: number, // n
  anchorCam2: number, // m
  fpsCam1: number,    // f1
  fpsCam2: number,    // f2
  totalFramesCam1?: number
): { frameCam1: number; deltaT: number; deltaTSyncSec: number } {
  const f1 = Math.max(0.001, fpsCam1 || 30);
  const f2 = Math.max(0.001, fpsCam2 || 30);

  const deltaT = (frameCam2 - anchorCam2) / f2;
  const rawI = anchorCam1 + Math.round(deltaT * f1);
  const frameCam1 = totalFramesCam1 !== undefined
    ? Math.max(0, Math.min(totalFramesCam1 - 1, rawI))
    : Math.max(0, rawI);

  const idealT1 = deltaT;
  const actualT1 = (frameCam1 - anchorCam1) / f1;
  const deltaTSyncSec = Math.abs(actualT1 - idealT1);

  return { frameCam1, deltaT, deltaTSyncSec };
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
 * Format stereo presentation timestamp into mm:ss.fff or seconds with frame count.
 */
export function formatStereoTime(seconds: number, fps?: number): string {
  const s = Math.max(0, seconds);
  const min = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.floor((s % 1) * 1000);
  const formatted = `${min.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  if (fps !== undefined && fps > 0) {
    const frame = Math.round(s * fps);
    return `${formatted} (f#${frame})`;
  }
  return formatted;
}

