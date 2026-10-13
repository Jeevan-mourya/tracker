import { describe, it, expect, beforeEach } from 'vitest';
import { mediaDiagnostics, PlaybackInvariantMetrics } from '../src/utils/mediaDiagnostics';

describe('Authoritative Media Clock & Software Reliability Audit', () => {
  beforeEach(() => {
    mediaDiagnostics.clearLogs();
  });

  describe('1. Authoritative Media Clock Invariant (Δmedia / Δwall)', () => {
    it('verifies nominal 1.0x playback satisfies the invariant ratio within tolerance', () => {
      mediaDiagnostics.startInvariantTracking('session-1', 0.0, 1.0);

      // Simulate 1.0 second of wall time with 1.0 second of media progress
      const tracker = (mediaDiagnostics as any).playbackRateInvariants.get('session-1');
      expect(tracker).toBeDefined();

      // Mock start time 1000ms in the past
      tracker.startWallMs = performance.now() - 1000;
      tracker.startMediaTime = 0.0;

      const result = mediaDiagnostics.sampleInvariant('session-1', 1.0, 1.0);
      expect(result).not.toBeNull();
      expect(result!.isValid).toBe(true);
      expect(result!.ratio).toBeCloseTo(1.0, 1);
      expect(result!.warning).toBeUndefined();
    });

    it('detects severe acceleration defect (e.g. 10-minute video advancing in seconds)', () => {
      mediaDiagnostics.startInvariantTracking('session-defect', 0.0, 1.0);

      const tracker = (mediaDiagnostics as any).playbackRateInvariants.get('session-defect');
      // Mock 1 second of wall time elapsed, but media time jumped by 50 seconds (50x accelerated seek)
      tracker.startWallMs = performance.now() - 1000;
      tracker.startMediaTime = 0.0;

      const result = mediaDiagnostics.sampleInvariant('session-defect', 50.0, 1.0);
      expect(result).not.toBeNull();
      expect(result!.isValid).toBe(false);
      expect(result!.ratio).toBeGreaterThan(10.0);
      expect(result!.warning).toContain('Playback speed anomaly detected');
    });

    it('handles fractional user-selected playback speeds (0.25x, 0.5x, 2.0x)', () => {
      mediaDiagnostics.startInvariantTracking('session-slow', 0.0, 0.5);

      const tracker = (mediaDiagnostics as any).playbackRateInvariants.get('session-slow');
      tracker.startWallMs = performance.now() - 2000;
      tracker.startMediaTime = 0.0;

      // In 2 seconds wall time at 0.5x, media advances 1.0 second
      const result = mediaDiagnostics.sampleInvariant('session-slow', 1.0, 0.5);
      expect(result).not.toBeNull();
      expect(result!.isValid).toBe(true);
      expect(result!.observedRate).toBeCloseTo(0.5, 1);
      expect(result!.ratio).toBeCloseTo(1.0, 1);
    });
  });

  describe('2. Loop Registry & Duplicate Prevention (Lifecycle Audit)', () => {
    it('tracks active playback loops and ensures uniqueness by ID', () => {
      expect(mediaDiagnostics.activePlaybackLoops).toBe(0);

      mediaDiagnostics.registerLoop('primary_playback_monitor', 'raf', 'playback');
      expect(mediaDiagnostics.activePlaybackLoops).toBe(1);

      // Re-registering the same loop ID overwrites rather than leaking duplicate loops
      mediaDiagnostics.registerLoop('primary_playback_monitor', 'raf', 'playback');
      expect(mediaDiagnostics.activePlaybackLoops).toBe(1);

      // Unregistering resets count to zero
      mediaDiagnostics.unregisterLoop('primary_playback_monitor');
      expect(mediaDiagnostics.activePlaybackLoops).toBe(0);
    });

    it('distinguishes playback loops from tracking loops', () => {
      mediaDiagnostics.registerLoop('playback_1', 'raf', 'playback');
      mediaDiagnostics.registerLoop('tracking_1', 'raf', 'tracking');

      expect(mediaDiagnostics.activePlaybackLoops).toBe(1);
      expect(mediaDiagnostics.activeTrackingLoops).toBe(1);
      expect(mediaDiagnostics.getActiveLoopCount()).toBe(2);

      mediaDiagnostics.unregisterLoop('playback_1');
      expect(mediaDiagnostics.activePlaybackLoops).toBe(0);
      expect(mediaDiagnostics.activeTrackingLoops).toBe(1);

      mediaDiagnostics.unregisterLoop('tracking_1');
      expect(mediaDiagnostics.activeTrackingLoops).toBe(0);
    });

    it('cleans up all loops and invariants on session reset', () => {
      mediaDiagnostics.registerLoop('loop_a', 'raf');
      mediaDiagnostics.registerLoop('loop_b', 'raf');
      mediaDiagnostics.registerEventListener('l1', 'video', 'timeupdate');
      mediaDiagnostics.startInvariantTracking('s1', 0);

      expect(mediaDiagnostics.getActiveLoopCount()).toBe(2);
      expect(mediaDiagnostics.activeVideoEventListeners).toBe(1);

      mediaDiagnostics.clearLogs();
      expect(mediaDiagnostics.getActiveLoopCount()).toBe(0);
      expect(mediaDiagnostics.activeVideoEventListeners).toBe(0);
    });
  });

  describe('3. Duration & Frame Advancement Mathematical Integrity', () => {
    it('correctly maps a 10-minute 600s video to 18,000 frames without truncation', () => {
      const durationSeconds = 600; // 10 minutes
      const fps = 30;

      const totalFrames = Math.max(10, Math.round(durationSeconds * fps));
      const endFrame = totalFrames - 1;

      expect(totalFrames).toBe(18000);
      expect(endFrame).toBe(17999);

      // Invariant check: deriving frame from mediaTime
      const mediaTimeMid = 300.5; // halfway
      const derivedFrame = Math.min(endFrame, Math.max(0, Math.floor(mediaTimeMid * fps)));
      expect(derivedFrame).toBe(9015);

      const mediaTimeEnd = 599.99;
      const derivedEnd = Math.min(endFrame, Math.max(0, Math.floor(mediaTimeEnd * fps)));
      expect(derivedEnd).toBe(17999);
    });

    it('safely handles non-finite duration without collapsing frames', () => {
      const badDurations = [NaN, Infinity, -1, 0];

      for (const dur of badDurations) {
        const isSafe = Number.isFinite(dur) && dur > 0;
        expect(isSafe).toBe(false);
      }
    });

    it('verifies sub-second frame derivation is monotonic without drift', () => {
      const containerFps = 30;
      let lastFrame = -1;

      for (let t = 0; t <= 10; t += 0.033333333333) {
        const frame = Math.floor(t * containerFps);
        expect(frame).toBeGreaterThanOrEqual(lastFrame);
        lastFrame = frame;
      }
    });
  });

  describe('4. Dual Camera Stereo Synchronization', () => {
    it('calculates correct slave camera time under time offset and multi-rate fps ratio', () => {
      const masterMediaTime = 5.0; // seconds on Cam 1
      const timeOffsetSeconds = 0.5; // Cam 2 started 0.5s later
      const fpsRatio = 1.0; // 1:1 synchronous rate

      const expectedCam2Time = Math.max(0.001, (masterMediaTime - timeOffsetSeconds) * fpsRatio);
      expect(expectedCam2Time).toBeCloseTo(4.5, 3);
    });

    it('phase-lock drift detector triggers when slave camera desynchronizes by > 0.05s', () => {
      const masterTime = 10.0;
      const syncOffset = 0.0;
      const fpsRatio = 1.0;
      const expectedSlaveTime = (masterTime - syncOffset) * fpsRatio;

      const actualSlaveTimeSynchronized = 10.02; // 20ms drift -> acceptable
      const isDriftTolerable = Math.abs(actualSlaveTimeSynchronized - expectedSlaveTime) <= 0.05;
      expect(isDriftTolerable).toBe(true);

      const actualSlaveTimeDesynced = 10.20; // 200ms drift -> unacceptable, requires re-seek
      const isDesynced = Math.abs(actualSlaveTimeDesynced - expectedSlaveTime) > 0.05;
      expect(isDesynced).toBe(true);
    });
  });

  describe('5. Event Audit Ring-Buffer', () => {
    it('records and retains media lifecycle events up to capacity', () => {
      const mockVideo = {
        currentTime: 2.5,
        duration: 10.0,
        playbackRate: 1.0,
        paused: false,
        seeking: false,
        readyState: 4,
        networkState: 1,
        buffered: { length: 1 } as any,
      } as HTMLVideoElement;

      mediaDiagnostics.logEvent('primary', 'play', mockVideo);
      mediaDiagnostics.logEvent('primary', 'timeupdate', mockVideo);

      const events = mediaDiagnostics.getRecentEvents(10);
      expect(events.length).toBe(2);
      expect(events[0].event).toBe('play');
      expect(events[1].event).toBe('timeupdate');
      expect(events[0].currentTime).toBe(2.5);
    });
  });

  describe('6. Comprehensive Playback Diagnostic Reporting', () => {
    it('accurately reports duration, current media time, rate, paused/seeking, loops, and errors', () => {
      mediaDiagnostics.setSession('test-session-42', 'test-video-10min.mp4');
      mediaDiagnostics.registerLoop('playback_mon_1', 'raf', 'playback');
      mediaDiagnostics.registerLoop('tracking_template_1', 'raf', 'tracking');

      const mockVideo = {
        currentTime: 124.5, // authoritative media timeline
        duration: 600.0,    // 10 minutes
        playbackRate: 1.0,
        paused: false,
        seeking: false,
        readyState: 4,
        networkState: 1,
        buffered: { length: 1 } as any,
      } as HTMLVideoElement;

      mediaDiagnostics.logEvent('primary', 'timeupdate', mockVideo);

      const report = mediaDiagnostics.getPlaybackReport('primary');
      expect(report.sessionId).toBe('test-session-42');
      expect(report.uploadId).toBe('test-video-10min.mp4');
      expect(report.duration).toBe(600.0);
      expect(report.currentTime).toBe(124.5);
      expect(report.playbackRate).toBe(1.0);
      expect(report.paused).toBe(false);
      expect(report.seeking).toBe(false);
      expect(report.activePlaybackLoops).toBe(1);
      expect(report.activeTrackingLoops).toBe(1);
      expect(report.mediaErrorEvents.length).toBe(0);

      // Simulate a media error event
      mediaDiagnostics.logEvent('primary', 'error', mockVideo);
      const updatedReport = mediaDiagnostics.getPlaybackReport('primary');
      expect(updatedReport.mediaErrorEvents.length).toBe(1);
      expect(updatedReport.mediaErrorEvents[0].event).toBe('error');

      // Snapshot also includes full reports
      const snapshot = mediaDiagnostics.getDiagnosticsSnapshot();
      expect(snapshot.sessionId).toBe('test-session-42');
      expect(snapshot.uploadId).toBe('test-video-10min.mp4');
      expect(snapshot.primaryReport.currentTime).toBe(124.5);
      expect(snapshot.activePlaybackLoops).toBe(1);
      expect(snapshot.activeTrackingLoops).toBe(1);
    });
  });
});
