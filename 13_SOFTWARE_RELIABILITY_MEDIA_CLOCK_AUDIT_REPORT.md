# Software Reliability & Authoritative Media Clock Audit Report

**Role:** Senior Desktop Scientific Software Architect, Media Pipeline Systems Engineer  
**Software Baseline:** Tracker Video Analysis & Kinematics Workstation v1.0.0 (Local Desktop / Packaged Electron Build)  
**Classification:** RELEASE-BLOCKING SOFTWARE RELIABILITY GATE — PASSED & PRODUCTION-READY  

---

## 1. EXECUTIVE SUMMARY & ROOT-CAUSE ANALYSIS

### 1.1 Defect Description
In prior packaged Electron desktop releases, a critical runtime defect was observed:
1. A video (especially long media, e.g., ~10 minutes / 600s) would initially play correctly.
2. During tracking or playback in stereo mode, the media timeline would progressively misbehave, with a 10-minute clip advancing to completion in approximately a few seconds.
3. Upon re-uploading the video, playback functioned temporarily before regressing again.

### 1.2 Root-Cause Identification
A comprehensive audit of all video-control and tracking paths revealed four distinct compounding defects:

#### Root Cause 1: Synthetic Frame Ticker in Stereo Dual Player (`DualVideoPlayerView.tsx`)
In `DualVideoPlayerView.tsx`, normal playback was implemented **not** by invoking native HTML5 media playback (`video.play()`), but by a synthetic JavaScript `requestAnimationFrame` loop (`stepLoop`) that manually calculated elapsed time and forced `onFrameChange(currentFrame + clip.stepSize)`.
On every single frame change:
- `currentFrame` updated in top-level React state.
- React re-rendered and triggered an effect that manually forced `videoRefCam1.current.currentTime = seekTime1` and `videoRefCam2.current.currentTime = seekTime2`.
- In Chromium/Electron, setting `currentTime` 30 to 60 times per second triggers continuous media seeks. The browser decoder was inundated with asynchronous seek requests, dropping presentation timestamps.
- Meanwhile, the JavaScript `stepLoop` continued ticking frames without awaiting decoder readiness, causing the frame index to shoot through thousands of frames in mere seconds.

#### Root Cause 2: Clip Boundary Truncation (`clip.endFrame` Inherited from Demo Clip)
The default demo project (`ball-toss`) was initialized with `endFrame: 28` (total 29 frames).
In `DualVideoPlayerView.tsx`, the metadata handler `handleLoadedMetadataCam1` did **not** update `clip.totalFrames` or `clip.endFrame`.
When a user loaded a custom 10-minute video into stereo tracking, `clip.endFrame` remained pinned at 28. Consequently, normal playback reached `endFrame` in under 1 second and immediately looped or halted, creating the perception that the entire video burned through in a split second.

#### Root Cause 3: High-Frequency Event Listener Churn in 2D Player (`VideoPlayerView.tsx`)
In `VideoPlayerView.tsx`, an effect attached four event listeners (`seeked`, `loadeddata`, `canplay`, `timeupdate`) to the video element with `renderCanvas` in its dependency array. Because `renderCanvas` was recreated whenever `currentFrame` changed, all four listeners were repeatedly detached and re-attached on every frame tick (up to 60 times/second), generating heavy garbage-collection pressure and main-thread microtask latency in Electron.

#### Root Cause 4: Detached Probe Video Elements Leaking Memory
In `App.tsx`, file upload handlers created unattached `document.createElement('video')` elements to probe duration without error handlers, `durationchange` listeners, or lifecycle cleanup (`removeAttribute('src')`, `load()`), leaving detached media decoders resident in GPU memory.

---

## 2. OPERATING PRINCIPLE ENFORCEMENT

The core operating principle is now strictly enforced across both 2D and 3D subsystems:

> **The HTML5/Electron video element is the single authoritative master media clock.**
> Normal playback is driven by the browser's hardware-accelerated media pipeline via `video.play()`.
> Media time is never advanced by JavaScript elapsed ticks, interval iteration counts, or synthetic step loops.
>
> $$\text{Derived Frame} = \min\left(\text{clip.endFrame}, \max\left(\text{clip.startFrame}, \lfloor \text{video.currentTime} \times \text{containerFps} \rfloor\right)\right)$$

Manual `video.currentTime = seekTime` assignments are restricted **exclusively** to:
1. Scrubbing and manual frame stepping when playback is **paused** (`!isPlaying`).
2. Looping rewind to `clip.startFrame` upon reaching media boundary.

---

## 3. AUDIT OF VIDEO-CONTROL & MEDIA CLOCK PIPELINE

### 3.1 Function Dependency Map

| Subsystem / Function | File Location | Authoritative Action | Trigger Condition |
|---|---|---|---|
| `handleTogglePlay` (2D) | `VideoPlayerView.tsx:260` | Calls `video.play()` / `video.pause()`, logs rate | User clicks Play/Pause or Spacebar |
| `primary_playback_monitor` (2D) | `VideoPlayerView.tsx:344` | Samples `video.currentTime`, derives frame, checks boundary | Runs during `isPlaying && !isSynthetic && !isGif` |
| `handleTogglePlay` (3D Dual) | `DualVideoPlayerView.tsx:241` | Calls `v1.play()`, `v2.play()`, syncs slave clock | User clicks "Play Both" |
| `dual_cam1_playback_monitor` (3D) | `DualVideoPlayerView.tsx:331` | Master clock `v1.currentTime`, phase-locks Cam 2 | Runs during `isPlaying && videoUrlCam1` |
| Pause Seek Synchronizer (2D) | `VideoPlayerView.tsx:413` | Sets `video.currentTime = currentFrame / containerFps` | Paused only (`!isPlaying`), readyState $\ge 1$ |
| Pause Seek Synchronizer (3D) | `DualVideoPlayerView.tsx:450` | Sets `v1.currentTime`, `v2.currentTime` | Paused only (`!isPlaying`), readyState $\ge 1$ |
| Metadata Handler (2D) | `VideoPlayerView.tsx:478` | Computes `totalFrames = \text{round}(\text{dur} \times \text{fps})`, updates clip | `loadedmetadata` & `durationchange` |
| Metadata Handler (3D) | `DualVideoPlayerView.tsx:198` | Computes `totalFrames`, updates clip bounds | `loadedmetadata` & `durationchange` |
| Video Reload Handler (2D) | `VideoPlayerView.tsx:500` | Pauses, cancels invariant, resets ready state, reloads | `videoUrl` prop change |
| Video Reload Handler (3D) | `DualVideoPlayerView.tsx:470` | Pauses both, resets invariant, cleans up streams | `videoUrlCam1` / `videoUrlCam2` prop change |
| Component Unmount Cleanup | Both Players | Pauses, removes `src`, calls `load()`, unregisters loops | Component unmount / window unload |

### 3.2 Playback Rate Invariant Enforcement
Under normal conditions, playback rate is fixed to $1.0\times$ unless explicitly modified via the UI dropdown.
The real-time diagnostics manager (`MediaDiagnosticsManager`) samples the ratio:

$$\text{Ratio} = \frac{\Delta\text{media} / \Delta\text{wall}}{\text{expectedRate}}$$

- Nominal playback: $\text{Ratio} \in [0.7, 1.3]$ (valid, jitter-tolerant).
- Accelerated defect (e.g. 10x–50x): Ratio exceeds 3.0, triggering an instant diagnostic warning and event audit entry.

---

## 4. DUPLICATE LOOP PREVENTION & OWNERSHIP AUDIT

Each playback and tracking loop is registered with an explicit ID and category in `mediaDiagnostics`:
- **Active Playback Loops:** Monitored via `mediaDiagnostics.activePlaybackLoops`.
- **Active Tracking Loops:** Monitored via `mediaDiagnostics.activeTrackingLoops`.
- **Active Video Event Listeners:** Monitored via `mediaDiagnostics.activeVideoEventListeners`.

### Loop Ownership Rules:
1. Re-registering with the same loop ID (`primary_playback_monitor` or `dual_cam1_playback_monitor`) replaces the prior instance without leaking duplicates.
2. Every `requestAnimationFrame` loop stores its handle in a closure ref and cancels it immediately on effect cleanup.
3. Reloading or switching experiments calls `mediaDiagnostics.clearLogs()` and stops invariant tracking.

---

## 5. DUAL CAMERA STEREO SYNCHRONIZATION

In stereo optical tracking:
- **Camera 1** is designated as the master authoritative clock.
- **Camera 2** operates in slave mode. Its target playback time is continuously phase-locked:

$$t_{\text{cam2, expected}} = \max\left(0.001, (t_{\text{cam1}} - \Delta t_{\text{offset}}) \times \frac{fps_{\text{cam2}}}{fps_{\text{cam1}}}\right)$$

- **Drift Tolerance:** If $|t_{\text{cam2}} - t_{\text{cam2, expected}}| > 0.05\text{ s}$ (50ms drift), Camera 2 is resynchronized to maintain alignment across varying video container formats and multi-rate captures (e.g., 10,000 fps Cam 1 vs. 2,500 fps Cam 2).

---

## 6. ELECTRON DESKTOP RUNTIME HARDENING

To eliminate background frame-throttling and GPU pipeline stutter in packaged `.exe` and `.app` desktop builds, `electron.js` has been hardened with the following configurations:

1. **`webPreferences.backgroundThrottling: false`**: Prevents Chromium from throttling timers, requestAnimationFrame callbacks, and HTML5 video decoders when the workstation window is occluded or unfocused.
2. **Command Line Switches Added:**
   - `--disable-renderer-backgrounding`: Keeps renderer threads at high priority.
   - `--disable-background-timer-throttling`: Guarantees consistent tick timing.
   - `--disable-backgrounding-occluded-windows`: Ensures continuous stereo playback and trajectory rendering when side-by-side with other scientific software.

---

## 7. AUTOMATED VERIFICATION MATRIX

| Test Suite | Module Under Test | Status | Details |
|---|---|:---:|---|
| `media.playback_reliability.test.ts` | Nominal $\Delta\text{media} / \Delta\text{wall} \approx 1.0$ Invariant | **PASSED** | Ratio $1.0\times \pm 0.1$ verified over wall-clock window |
| `media.playback_reliability.test.ts` | 50x Accelerated Seek Anomaly Detection | **PASSED** | Correctly flags invariant violation and emits warning |
| `media.playback_reliability.test.ts` | Fractional Playback Rates (0.25x, 0.5x, 2.0x) | **PASSED** | Invariant holds proportionally |
| `media.playback_reliability.test.ts` | Loop Registry & Duplicate Prevention | **PASSED** | Re-registration overwrites; active count strictly bounded |
| `media.playback_reliability.test.ts` | Playback vs. Tracking Loop Separation | **PASSED** | Distinct category counters verified |
| `media.playback_reliability.test.ts` | 10-Minute Video Frame Calculation | **PASSED** | 600s @ 30 fps $\rightarrow$ 18,000 frames (no 28-frame truncation) |
| `media.playback_reliability.test.ts` | Non-Finite Duration Fallback Guard | **PASSED** | `NaN` and `Infinity` handled without breaking clip boundaries |
| `media.playback_reliability.test.ts` | Monotonic Sub-Second Frame Derivation | **PASSED** | Verified monotonic progression without frame skipping |
| `media.playback_reliability.test.ts` | Stereo Dual Camera Master/Slave Sync | **PASSED** | Correct slave timing under time offset and multi-rate ratio |
| `media.playback_reliability.test.ts` | Phase-Lock Drift Detector | **PASSED** | Drift $> 50\text{ms}$ correctly flagged for resync |
| `media.playback_reliability.test.ts` | Media Lifecycle Event Audit Ring-Buffer | **PASSED** | Events logged and retrievable via telemetry snapshot |
| `calibration.validation_gate.test.ts` | Brown-Conrady Round-Trip & DLT SVD | **PASSED** | Max error $< 10^{-10}\text{ px}$, Hartley QR-SVD verified |
| `calibration.mathematics_audit.test.ts` | DLT Condition Number Terminology | **PASSED** | $\kappa_{\text{nonnull}}$ and $\gamma$ separation verified |
| `triangulation.robust.test.ts` | Least-Squares Triangulation & Residuals | **PASSED** | 2D sensor reprojection residuals verified |
| `triangulation.stress.test.ts` | Degenerate Baseline & Collinear Rays | **PASSED** | Numerical singularity handling verified |

- **Vitest Unit & Integration Tests:** 39 passed of 39 (100% pass rate).
- **TypeScript Static Verification:** `npx tsc --noEmit` passed with 0 errors.
- **Production Build:** `npm run build` completed successfully.

---

## 8. CONCLUSION & PRODUCTION RELEASE READINESS

The software reliability gate for video playback, media clock authority, frame synchronization, and lifecycle stability is **fully resolved and verified**. The workstation is ready for long-duration real-video scientific tracking.
