/**
 * Real-Time Video Media Clock & Playback Reliability Diagnostics
 *
 * Implements authoritative HTML5 media clock monitoring, Δmedia / Δwall
 * playback rate invariant checking, event audit ring-buffer, and active loop tracking.
 */

export interface MediaEventLogEntry {
  timestampMs: number;
  camId: 'primary' | 'cam1' | 'cam2';
  event: string;
  currentTime: number;
  duration: number;
  playbackRate: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
  networkState: number;
  bufferedRangesCount: number;
}

export interface PlaybackInvariantMetrics {
  wallElapsedSeconds: number;
  mediaElapsedSeconds: number;
  expectedRate: number;
  observedRate: number;
  ratio: number; // observedRate / expectedRate (ideally 1.0)
  isValid: boolean;
  warning?: string;
}

export interface ChannelDiagnosticsState {
  camId: 'primary' | 'cam1' | 'cam2';
  currentTime: number; // authoritative HTML5 media timeline (video.currentTime)
  duration: number;
  playbackRate: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
  lastEvent: string;
  errorCount: number;
  lastUpdatedMs: number;
}

export interface PlaybackDiagnosticReport {
  sessionId: string;
  uploadId?: string;
  camId: 'primary' | 'cam1' | 'cam2';
  duration: number;
  currentTime: number; // video.currentTime (authoritative media timeline)
  playbackRate: number;
  paused: boolean;
  seeking: boolean;
  readyState: number;
  activePlaybackLoops: number;
  activeTrackingLoops: number;
  activeVideoEventListeners: number;
  mediaErrorEvents: MediaEventLogEntry[];
  recentEvents: MediaEventLogEntry[];
}

class MediaDiagnosticsManager {
  private currentSessionId: string = 'default-session';
  private currentUploadId?: string;
  private channelStates = new Map<'primary' | 'cam1' | 'cam2', ChannelDiagnosticsState>();
  private mediaErrorEvents: MediaEventLogEntry[] = [];
  private eventLog: MediaEventLogEntry[] = [];
  private readonly maxLogEntries = 100;
  private activeLoops = new Map<string, { type: 'raf' | 'interval' | 'timeout'; startedAt: number; category: 'playback' | 'tracking' }>();
  private activeEventListeners = new Map<string, { target: string; event: string; attachedAt: number }>();
  private playbackRateInvariants = new Map<string, {
    startWallMs: number;
    startMediaTime: number;
    lastWallMs: number;
    lastMediaTime: number;
    expectedRate: number;
  }>();

  /**
   * Set active session or upload identifier
   */
  setSession(sessionId: string, uploadId?: string): void {
    this.currentSessionId = sessionId;
    this.currentUploadId = uploadId;
  }

  get sessionId(): string {
    return this.currentSessionId;
  }

  get uploadId(): string | undefined {
    return this.currentUploadId;
  }

  /**
   * Log media lifecycle events for audit and diagnostic inspection
   */
  logEvent(camId: 'primary' | 'cam1' | 'cam2', event: string, video: HTMLVideoElement | null): void {
    if (!video) return;
    const entry: MediaEventLogEntry = {
      timestampMs: performance.now(),
      camId,
      event,
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      playbackRate: video.playbackRate,
      paused: video.paused,
      seeking: video.seeking,
      readyState: video.readyState,
      networkState: video.networkState,
      bufferedRangesCount: video.buffered ? video.buffered.length : 0,
    };

    this.eventLog.push(entry);
    if (this.eventLog.length > this.maxLogEntries) {
      this.eventLog.shift();
    }

    // Update structured channel snapshot
    const prev = this.channelStates.get(camId);
    const errorCount = (prev?.errorCount ?? 0) + (event === 'error' ? 1 : 0);
    this.channelStates.set(camId, {
      camId,
      currentTime: video.currentTime,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      playbackRate: video.playbackRate,
      paused: video.paused,
      seeking: video.seeking,
      readyState: video.readyState,
      lastEvent: event,
      errorCount,
      lastUpdatedMs: performance.now(),
    });

    if (event === 'error') {
      this.mediaErrorEvents.push(entry);
      if (this.mediaErrorEvents.length > 50) {
        this.mediaErrorEvents.shift();
      }
    }
  }

  /**
   * Start tracking Δmedia / Δwall playback invariant for a video session
   */
  startInvariantTracking(sessionId: string, initialMediaTime: number, expectedRate: number = 1.0): void {
    const now = performance.now();
    this.playbackRateInvariants.set(sessionId, {
      startWallMs: now,
      startMediaTime: initialMediaTime,
      lastWallMs: now,
      lastMediaTime: initialMediaTime,
      expectedRate,
    });
  }

  /**
   * Sample Δmedia / Δwall playback invariant.
   * In normal 1x playback: Δmedia / Δwall ≈ 1.0.
   * If accelerated (e.g. 5x, 10x, 50x), flags an invariant violation immediately.
   */
  sampleInvariant(sessionId: string, currentMediaTime: number, currentExpectedRate: number = 1.0): PlaybackInvariantMetrics | null {
    const tracker = this.playbackRateInvariants.get(sessionId);
    if (!tracker) return null;

    const now = performance.now();
    const wallElapsed = (now - tracker.startWallMs) / 1000;
    const mediaElapsed = Math.max(0, currentMediaTime - tracker.startMediaTime);

    if (wallElapsed < 0.25) {
      // Need at least 250ms of wall-clock time for a stable rate sample
      return null;
    }

    const observedRate = mediaElapsed / wallElapsed;
    const ratio = currentExpectedRate > 0 ? observedRate / currentExpectedRate : 1.0;
    const isTolerable = ratio >= 0.7 && ratio <= 1.3;

    let warning: string | undefined;
    if (!isTolerable && mediaElapsed > 0.5) {
      warning = `Playback speed anomaly detected on ${sessionId}! Observed rate: ${observedRate.toFixed(2)}x, Expected: ${currentExpectedRate.toFixed(2)}x (Ratio: ${ratio.toFixed(2)}x)`;
    }

    tracker.lastWallMs = now;
    tracker.lastMediaTime = currentMediaTime;

    return {
      wallElapsedSeconds: wallElapsed,
      mediaElapsedSeconds: mediaElapsed,
      expectedRate: currentExpectedRate,
      observedRate,
      ratio,
      isValid: isTolerable,
      warning,
    };
  }

  stopInvariantTracking(sessionId: string): void {
    this.playbackRateInvariants.delete(sessionId);
  }

  /**
   * Track active playback/monitoring loops to prevent duplicates and memory leaks
   */
  registerLoop(loopId: string, type: 'raf' | 'interval' | 'timeout', category: 'playback' | 'tracking' = 'playback'): void {
    this.activeLoops.set(loopId, { type, startedAt: performance.now(), category });
  }

  unregisterLoop(loopId: string): void {
    this.activeLoops.delete(loopId);
  }

  registerEventListener(listenerId: string, target: string, event: string): void {
    this.activeEventListeners.set(listenerId, { target, event, attachedAt: performance.now() });
  }

  unregisterEventListener(listenerId: string): void {
    this.activeEventListeners.delete(listenerId);
  }

  get activePlaybackLoops(): number {
    let count = 0;
    for (const loop of this.activeLoops.values()) {
      if (loop.category === 'playback') count++;
    }
    return count;
  }

  get activeTrackingLoops(): number {
    let count = 0;
    for (const loop of this.activeLoops.values()) {
      if (loop.category === 'tracking') count++;
    }
    return count;
  }

  get activeVideoEventListeners(): number {
    return this.activeEventListeners.size;
  }

  getActiveLoopCount(): number {
    return this.activeLoops.size;
  }

  getActiveLoops(): { id: string; type: string; category: string; elapsedMs: number }[] {
    const now = performance.now();
    return Array.from(this.activeLoops.entries()).map(([id, info]) => ({
      id,
      type: info.type,
      category: info.category,
      elapsedMs: now - info.startedAt,
    }));
  }

  getRecentEvents(count: number = 20): MediaEventLogEntry[] {
    return this.eventLog.slice(-count);
  }

  getErrorEvents(count: number = 20): MediaEventLogEntry[] {
    return this.mediaErrorEvents.slice(-count);
  }

  /**
   * Lightweight diagnostic report of authoritative media timeline,
   * loops, error events, and session/upload IDs.
   */
  getPlaybackReport(camId: 'primary' | 'cam1' | 'cam2' = 'primary'): PlaybackDiagnosticReport {
    const state = this.channelStates.get(camId);
    return {
      sessionId: this.currentSessionId,
      uploadId: this.currentUploadId,
      camId,
      duration: state?.duration ?? 0,
      currentTime: state?.currentTime ?? 0, // authoritative HTML5 media timeline (video.currentTime)
      playbackRate: state?.playbackRate ?? 1.0,
      paused: state?.paused ?? true,
      seeking: state?.seeking ?? false,
      readyState: state?.readyState ?? 0,
      activePlaybackLoops: this.activePlaybackLoops,
      activeTrackingLoops: this.activeTrackingLoops,
      activeVideoEventListeners: this.activeVideoEventListeners,
      mediaErrorEvents: this.mediaErrorEvents.filter((e) => e.camId === camId),
      recentEvents: this.eventLog.filter((e) => e.camId === camId).slice(-10),
    };
  }

  getDiagnosticsSnapshot() {
    return {
      sessionId: this.currentSessionId,
      uploadId: this.currentUploadId,
      primaryReport: this.getPlaybackReport('primary'),
      cam1Report: this.getPlaybackReport('cam1'),
      cam2Report: this.getPlaybackReport('cam2'),
      activePlaybackLoops: this.activePlaybackLoops,
      activeTrackingLoops: this.activeTrackingLoops,
      activeVideoEventListeners: this.activeVideoEventListeners,
      activeLoops: this.getActiveLoops(),
      errorEvents: this.getErrorEvents(10),
      recentEvents: this.getRecentEvents(10),
    };
  }

  clearLogs(): void {
    this.eventLog = [];
    this.mediaErrorEvents = [];
    this.channelStates.clear();
    this.playbackRateInvariants.clear();
    this.activeLoops.clear();
    this.activeEventListeners.clear();
  }
}

export const mediaDiagnostics = new MediaDiagnosticsManager();

// Expose on window for runtime desktop diagnostics inspection
if (typeof window !== 'undefined') {
  (window as any).__TRACKER_MEDIA_DIAGNOSTICS__ = mediaDiagnostics;
}
