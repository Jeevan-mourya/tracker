import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Track, Calibration, CoordinateAxes, ClipSettings, PointStep } from '../types';
import { pixelToWorld, worldToPixel } from '../utils/physics';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Repeat,
  Crosshair,
  Trash,
  Maximize2,
  Undo2,
  Redo2,
  Upload,
  AlertCircle,
  Film,
  ZoomIn,
  ZoomOut,
  Move,
  RotateCcw,
} from 'lucide-react';
import { ACCEPTED_VIDEO_ACCEPT_STRING, normalizeVideoUrl } from '../utils/videoFormats';
import { formatHighSpeedTime } from '../utils/highSpeedCameras';

import { FormatsModalTab } from './SupportedFormatsModal';
import { mediaDiagnostics } from '../utils/mediaDiagnostics';
import { CodecDiagnosticNotice, UnifiedFrameSource } from '../video/unifiedFrameSource';
import { CodecDiagnosticCard } from './CodecDiagnosticCard';

interface VideoPlayerViewProps {
  videoUrl: string;
  aviLoader?: UnifiedFrameSource | null;
  codecDiagnostic?: CodecDiagnosticNotice | null;
  onClearCodecDiagnostic?: () => void;
  isSynthetic: boolean;
  syntheticType?: string;
  fileName?: string;
  onUploadVideo?: (files: File | File[]) => void;
  onOpenFormatsModal?: (tab?: FormatsModalTab) => void;
  tracks: Track[];
  activeTrackId: string;
  onAddPoint: (step: PointStep) => void;
  onUpdatePoint: (frame: number, px: number, py: number) => void;
  onDeleteCurrentPoint: (frame: number) => void;
  calibration: Calibration;
  onUpdateCalibration: (cal: Partial<Calibration>) => void;
  axes: CoordinateAxes;
  onUpdateAxes: (axes: Partial<CoordinateAxes>) => void;
  clip: ClipSettings;
  onUpdateClip: (clip: Partial<ClipSettings>) => void;
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  showTrails: boolean;
  showVectors: boolean;
  showLoupe?: boolean;
  autoAdvance: boolean;
  requireShiftToMark?: boolean;
  onToggleRequireShiftToMark?: () => void;
  onUndoLastPoint?: () => void;
  onRedoLastPoint?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoCount?: number;
  redoCount?: number;
  onBeginHistoryAction?: (label: string) => void;
  onNudgeCurrentPoint?: (dpx: number, dpy: number) => void;
  onRegisterSnapshotGetter?: (getter: () => string | null) => void;
}

type DragTarget =
  | { type: 'calA' }
  | { type: 'calB' }
  | { type: 'origin' }
  | { type: 'axisRotate' }
  | { type: 'point'; frame: number }
  | null;

export const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({
  videoUrl,
  aviLoader,
  codecDiagnostic = null,
  onClearCodecDiagnostic,
  isSynthetic,
  syntheticType,
  tracks,
  activeTrackId,
  onAddPoint,
  onUpdatePoint,
  onDeleteCurrentPoint,
  calibration,
  onUpdateCalibration,
  axes,
  onUpdateAxes,
  clip,
  onUpdateClip,
  currentFrame,
  onFrameChange,
  showTrails,
  showVectors,
  showLoupe = true,
  autoAdvance,
  requireShiftToMark = true,
  onToggleRequireShiftToMark,
  onUndoLastPoint,
  onRedoLastPoint,
  canUndo,
  canRedo = false,
  undoCount = 0,
  redoCount = 0,
  onBeginHistoryAction,
  onNudgeCurrentPoint,
  fileName,
  onUploadVideo,
  onOpenFormatsModal,
  onRegisterSnapshotGetter,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hiddenFileInputRef = useRef<HTMLInputElement | null>(null);
  const aviBitmapRef = useRef<ImageBitmap | null>(null);
  const aviImageDataRef = useRef<ImageData | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const lastReportedFrameRef = useRef<number>(currentFrame);
  const [mouseCoord, setMouseCoord] = useState<{ px: number; py: number; x: number; y: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 640, height: 480 });
  const [isShiftPressed, setIsShiftPressed] = useState<boolean>(false);
  const [showShiftWarning, setShowShiftWarning] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [copiedFixCmd, setCopiedFixCmd] = useState<boolean>(false);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const [decodedFrameTick, setDecodedFrameTick] = useState<number>(0);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isChunkedAvi = Boolean(aviLoader && aviLoader.metadata);
  const isGif = false; // GIFs now decode frame-accurately through AnimatedGifLoader (UnifiedFrameSource)
  const isSingleFrameSource = Boolean(
    clip.totalFrames <= 1 || clip.endFrame <= clip.startFrame || aviLoader?.metadata?.isSingleFrame
  );

  // Capture composite snapshot (video frame + tracking marks & overlays) for PDF reports
  const captureSnapshot = useCallback((): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    // 1. Draw raw video / UnifiedFrameSource frame
    if (!isSynthetic) {
      if (isChunkedAvi && aviBitmapRef.current) {
        try {
          ctx.drawImage(aviBitmapRef.current, 0, 0, canvas.width, canvas.height);
        } catch {
          // ignore
        }
      } else if (isChunkedAvi && aviImageDataRef.current) {
        try {
          ctx.putImageData(aviImageDataRef.current, 0, 0);
        } catch {
          // ignore
        }
      } else if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        } catch {
          // ignore
        }
      }
    }

    // 2. Draw canvas overlays (points, vectors, axes, calibration stick, synthetic lab scene)
    ctx.drawImage(canvas, 0, 0);

    try {
      return offscreen.toDataURL('image/png');
    } catch {
      return null;
    }
  }, [isSynthetic, isGif, isChunkedAvi]);

  useEffect(() => {
    onRegisterSnapshotGetter?.(captureSnapshot);
  }, [captureSnapshot, onRegisterSnapshotGetter]);

  // Viewport Zoom & Pan state for flexible ballistic & defense video inspection (0.25x to 24.0x)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointerGestureRef = useRef<{
    active: boolean;
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);

  // Center and fit media within viewport
  const resetZoomAndPan = useCallback((targetZoom?: number) => {
    const container = containerRef.current;
    if (!container) return;

    const contWidth = container.clientWidth;
    const contHeight = container.clientHeight;
    const mediaW = canvasSize.width;
    const mediaH = canvasSize.height;

    if (contWidth === 0 || contHeight === 0 || mediaW === 0 || mediaH === 0) return;

    const availW = Math.max(100, contWidth - 24);
    const availH = Math.max(100, contHeight - 24);
    const fitZoom = Math.min(1, availW / mediaW, availH / mediaH);

    const finalZoom = targetZoom !== undefined ? targetZoom : Math.max(0.25, Number(fitZoom.toFixed(3)));
    const centeredX = (contWidth - mediaW * finalZoom) / 2;
    const centeredY = (contHeight - mediaH * finalZoom) / 2;

    setZoom(finalZoom);
    setPan({ x: centeredX, y: centeredY });
  }, [canvasSize]);

  // Center & fit whenever canvas size, media URL, or synthetic type changes
  useEffect(() => {
    resetZoomAndPan();
  }, [canvasSize.width, canvasSize.height, videoUrl, syntheticType, resetZoomAndPan]);

  // Attach ResizeObserver to container so split-pane dragging dynamically re-centers & fits video at 60 FPS
  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    let rafId: number | null = null;
    const ro = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        resetZoomAndPan();
      });
    });
    ro.observe(container);
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [resetZoomAndPan]);

  // Monitor Shift, Space, and 'F' (Fit to Viewport) keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.code === 'Space') {
        setIsSpacePressed(true);
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        resetZoomAndPan();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
      if (e.code === 'Space') setIsSpacePressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [resetZoomAndPan]);

  // Global mouseup listener so dragging never gets stuck
  useEffect(() => {
    const handleGlobalMouseUp = (e: MouseEvent) => {
      if (e.button === 2 || e.button === 1 || isPanning) {
        setIsPanning(false);
      }
      if (pointerGestureRef.current) {
        pointerGestureRef.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isPanning]);

  // Mouse wheel / trackpad pinch scroll to zoom centered at exact cursor pixel (u, v)
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;
    const newZoom = Math.min(24.0, Math.max(0.25, Number((zoom * factor).toFixed(4))));

    const newPanX = mouseX - (mouseX - pan.x) * (newZoom / zoom);
    const newPanY = mouseY - (mouseY - pan.y) * (newZoom / zoom);

    setZoom(newZoom);
    setPan({ x: newPanX, y: newPanY });
  };

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const activeStep = activeTrack?.steps.find((s) => s.frame === currentFrame);

  // Physical time calculations (uses exact GIF89a monotonic timestamps when available)
  const currentTime =
    isChunkedAvi && aviLoader?.getFrameTimestampSec && aviLoader.sourceKind === 'gif'
      ? (clip.startTime ?? 0) + aviLoader.getFrameTimestampSec(currentFrame)
      : (clip.startTime ?? 0) + (currentFrame - clip.startFrame) * (1 / Math.max(0.001, clip.fps));

  // Container playback fps (for seeking MP4/AVI files that were recorded at 1,000-100,000 fps but packaged at 30/60 fps)
  const containerFps = clip.playbackFps || (clip.fps > 240 ? 30 : Math.max(1, clip.fps));

  // Authoritative Play/Pause Toggle
  const handleTogglePlay = useCallback(() => {
    if (isSingleFrameSource) {
      setIsPlaying(false);
      return;
    }
    const video = videoRef.current;
    if (!isSynthetic && !isChunkedAvi && video) {
      if (isPlaying) {
        video.pause();
        setIsPlaying(false);
        mediaDiagnostics.stopInvariantTracking('primary');
        mediaDiagnostics.logEvent('primary', 'pause', video);
      } else {
        video.playbackRate = playbackRate;
        // Loop back to start if at or past the clip end frame
        if (currentFrame >= clip.endFrame || video.ended) {
          video.currentTime = Math.max(0.001, clip.startFrame / containerFps);
        }
        video
          .play()
          .then(() => {
            setIsPlaying(true);
            mediaDiagnostics.startInvariantTracking('primary', video.currentTime, playbackRate);
            mediaDiagnostics.logEvent('primary', 'play', video);
          })
          .catch((err) => {
            console.warn('Playback play() was prevented:', err);
            setIsPlaying(false);
          });
      }
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [isSingleFrameSource, isPlaying, isSynthetic, isChunkedAvi, playbackRate, currentFrame, clip.endFrame, clip.startFrame, containerFps]);

  // Explicit Manual Stepping (stops playback and seeks)
  const handleStepPrev = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
    setIsPlaying(false);
    mediaDiagnostics.stopInvariantTracking('primary');
    const target = Math.max(clip.startFrame, currentFrame - clip.stepSize);
    onFrameChange(target);
  }, [clip.startFrame, clip.stepSize, currentFrame, onFrameChange]);

  const handleStepNext = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
    setIsPlaying(false);
    mediaDiagnostics.stopInvariantTracking('primary');
    const target = Math.min(clip.endFrame, currentFrame + clip.stepSize);
    onFrameChange(target);
  }, [clip.endFrame, clip.stepSize, currentFrame, onFrameChange]);

  const handleJumpStart = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
    setIsPlaying(false);
    mediaDiagnostics.stopInvariantTracking('primary');
    onFrameChange(clip.startFrame);
  }, [clip.startFrame, onFrameChange]);

  const handleJumpEnd = useCallback(() => {
    const video = videoRef.current;
    if (video && !video.paused) {
      video.pause();
    }
    setIsPlaying(false);
    mediaDiagnostics.stopInvariantTracking('primary');
    onFrameChange(clip.endFrame);
  }, [clip.endFrame, onFrameChange]);

  const handlePlaybackRateChange = useCallback((newRate: number) => {
    setPlaybackRate(newRate);
    const video = videoRef.current;
    if (video) {
      video.playbackRate = newRate;
      mediaDiagnostics.logEvent('primary', 'ratechange', video);
    }
  }, []);

  // 1. Authoritative HTML5 Video playback monitor loop (Runs ONLY when isPlaying && !isSynthetic && !isGif && !isChunkedAvi)
  useEffect(() => {
    if (!isPlaying || isSynthetic || isGif || isChunkedAvi) return;

    let rafId: number;
    const loopId = 'primary_playback_monitor';
    mediaDiagnostics.registerLoop(loopId, 'raf');

    let lastSampleTime = performance.now();

    const monitorLoop = () => {
      const video = videoRef.current;
      if (!video) return;

      if (video.paused && !video.seeking && isPlaying) {
        // Natural end of media
        if (video.ended || video.currentTime >= (video.duration || 1) - 0.05) {
          if (isLooping) {
            video.currentTime = Math.max(0.001, clip.startFrame / containerFps);
            video.play().catch(() => {});
          } else {
            setIsPlaying(false);
            return;
          }
        }
      }

      // Video element's currentTime is the master media clock
      const mediaTime = video.currentTime;
      const derivedFrame = Math.min(
        clip.endFrame,
        Math.max(clip.startFrame, Math.floor(mediaTime * containerFps))
      );

      if (derivedFrame !== lastReportedFrameRef.current) {
        lastReportedFrameRef.current = derivedFrame;
        onFrameChange(derivedFrame);
      }

      // Sample invariant periodically (~every 500ms)
      const now = performance.now();
      if (now - lastSampleTime > 500) {
        mediaDiagnostics.sampleInvariant('primary', mediaTime, playbackRate);
        lastSampleTime = now;
      }

      // Clip boundary check
      if (derivedFrame >= clip.endFrame) {
        if (isLooping) {
          video.currentTime = Math.max(0.001, clip.startFrame / containerFps);
          video.play().catch(() => {});
        } else {
          video.pause();
          setIsPlaying(false);
          return;
        }
      }

      rafId = requestAnimationFrame(monitorLoop);
    };

    rafId = requestAnimationFrame(monitorLoop);

    return () => {
      cancelAnimationFrame(rafId);
      mediaDiagnostics.unregisterLoop(loopId);
    };
  }, [isPlaying, isSynthetic, isGif, isChunkedAvi, containerFps, clip.startFrame, clip.endFrame, isLooping, playbackRate, onFrameChange]);

  // 2. Synchronize video element to currentFrame ONLY when paused or manual stepping/scrubbing
  useEffect(() => {
    if (isPlaying || isSynthetic || isGif || isChunkedAvi) return;
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const targetTime = Math.max(0.001, currentFrame / containerFps);
    if (video.readyState >= 1) {
      if (Math.abs(video.currentTime - targetTime) > 0.002) {
        try {
          video.currentTime = targetTime;
        } catch {
          // ignore
        }
      }
    } else {
      const handleReady = () => {
        try {
          video.currentTime = targetTime;
        } catch {
          // ignore
        }
      };
      video.addEventListener('loadeddata', handleReady, { once: true });
      return () => video.removeEventListener('loadeddata', handleReady);
    }
    lastReportedFrameRef.current = currentFrame;
  }, [currentFrame, isPlaying, isSynthetic, isGif, isChunkedAvi, containerFps, videoUrl]);

  // 3. Synthetic simulation or UnifiedFrameSource (.AVI, .MOV stbl, .GIF, image sequence) frame ticker
  useEffect(() => {
    if (!isPlaying || (!isSynthetic && !isChunkedAvi)) return;
    if (isSingleFrameSource) {
      setIsPlaying(false);
      return;
    }

    let animationFrameId: number;
    const loopId = 'synthetic_playback_tick';
    mediaDiagnostics.registerLoop(loopId, 'raf');

    let lastTime = performance.now();
    const playFps = Math.min(60, Math.max(1, containerFps));
    const interval = (1000 / playFps) / playbackRate;

    const tick = (now: number) => {
      if (now - lastTime >= interval) {
        lastTime = now;
        let nextFrame = currentFrame + clip.stepSize;
        if (nextFrame > clip.endFrame) {
          if (isLooping) {
            nextFrame = clip.startFrame;
          } else {
            setIsPlaying(false);
            return;
          }
        }
        onFrameChange(nextFrame);
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animationFrameId);
      mediaDiagnostics.unregisterLoop(loopId);
    };
  }, [isPlaying, isSingleFrameSource, isSynthetic, isChunkedAvi, currentFrame, clip.stepSize, clip.startFrame, clip.endFrame, containerFps, playbackRate, isLooping, onFrameChange]);

  // Handle video metadata loading to configure frames & size without destroying user clip trims
  const handleLoadedMetadata = useCallback(() => {
    if (isChunkedAvi) return;
    const video = videoRef.current;
    if (!video) return;

    setVideoError(null);
    video.muted = true;
    video.defaultMuted = true;
    mediaDiagnostics.logEvent('primary', 'loadedmetadata', video);

    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;
    setCanvasSize({ width, height });

    const duration = video.duration;
    if (Number.isFinite(duration) && duration > 0) {
      // NEVER multiply container duration by high-speed sensor clip.fps (e.g. 10s * 1000 fps = 10,000)
      const safeContainerFps = Math.max(1, containerFps || 30);
      const containerTotalFrames = Math.max(1, Math.round(duration * safeContainerFps));
      const maxFrameIdx = Math.max(0, containerTotalFrames - 1);

      const isUninitializedSentinel =
        !clip.userTrimmed && clip.totalFrames === 10000 && clip.endFrame === 9999;
      const hasValidUserTrim =
        !isUninitializedSentinel &&
        (clip.userTrimmed === true ||
          (clip.endFrame >= clip.startFrame &&
            clip.endFrame <= maxFrameIdx &&
            clip.totalFrames > 0));

      if (hasValidUserTrim) {
        const clampedStart = Math.max(0, Math.min(clip.startFrame, maxFrameIdx));
        const clampedEnd = Math.max(clampedStart, Math.min(clip.endFrame, maxFrameIdx));
        if (
          clip.totalFrames !== containerTotalFrames ||
          clampedStart !== clip.startFrame ||
          clampedEnd !== clip.endFrame
        ) {
          onUpdateClip({
            totalFrames: containerTotalFrames,
            startFrame: clampedStart,
            endFrame: clampedEnd,
          });
        }
      } else {
        const clampedStart = isUninitializedSentinel ? 0 : Math.min(clip.startFrame, maxFrameIdx);
        const clampedEnd = isUninitializedSentinel
          ? maxFrameIdx
          : Math.max(clampedStart, Math.min(clip.endFrame, maxFrameIdx));
        onUpdateClip({
          totalFrames: containerTotalFrames,
          startFrame: clampedStart,
          endFrame: clampedEnd,
        });
      }
    }
  }, [containerFps, clip.startFrame, clip.endFrame, clip.totalFrames, clip.userTrimmed, onUpdateClip, isChunkedAvi]);

  // 4. Safe video reload and session reset when videoUrl changes
  useEffect(() => {
    if (isChunkedAvi && aviLoader?.metadata) {
      setVideoError(null);
      setCanvasSize({
        width: aviLoader.metadata.width || 640,
        height: aviLoader.metadata.height || 480,
      });
      return;
    }
    const video = videoRef.current;
    if (video && videoUrl) {
      video.pause();
      setIsPlaying(false);
      mediaDiagnostics.stopInvariantTracking('primary');
      setVideoError(null);
      video.muted = true;
      video.defaultMuted = true;

      const handleReady = () => {
        mediaDiagnostics.logEvent('primary', 'loadeddata', video);
        const targetTime = Math.max(0.001, currentFrame / containerFps);
        try {
          video.currentTime = targetTime;
        } catch {
          // ignore
        }
      };

      video.addEventListener('loadeddata', handleReady, { once: true });
      try {
        video.load();
      } catch {
        // ignore
      }

      return () => {
        video.removeEventListener('loadeddata', handleReady);
      };
    }
  }, [videoUrl, containerFps, isChunkedAvi, aviLoader]);

  // 5. Cleanup on unmount
  useEffect(() => {
    return () => {
      const video = videoRef.current;
      if (video) {
        video.pause();
        try {
          video.removeAttribute('src');
          video.load();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // Convert client click coordinates to sub-pixel video/canvas intrinsic coordinate space (u, v)
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { px: 0, py: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / Math.max(1, rect.width);
    const scaleY = canvas.height / Math.max(1, rect.height);

    const rawPx = (e.clientX - rect.left) * scaleX;
    const rawPy = (e.clientY - rect.top) * scaleY;
    const px = Number(Math.max(0, Math.min(canvas.width, rawPx)).toFixed(2));
    const py = Number(Math.max(0, Math.min(canvas.height, rawPy)).toFixed(2));
    return { px, py };
  };

  // Redraw canvas overlays and synthetic background on every frame/change
  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = zoom < 3.0;

    // 0. Paint video frame or UnifiedFrameSource (.AVI, .MOV stbl, .GIF, Image Sequence, Single Image) directly to canvas
    if (!isSynthetic) {
      if (isChunkedAvi && aviLoader?.metadata) {
        if (aviBitmapRef.current) {
          try {
            ctx.drawImage(aviBitmapRef.current, 0, 0, width, height);
          } catch {
            // ignore
          }
        } else if (aviImageDataRef.current) {
          try {
            ctx.putImageData(aviImageDataRef.current, 0, 0);
          } catch {
            // ignore
          }
        }
      } else if (videoRef.current && videoRef.current.readyState >= 2) {
        try {
          ctx.drawImage(videoRef.current, 0, 0, width, height);
        } catch {
          // ignore
        }
      }
    }

    // 1. Synthetic physics video simulation if no video file
    if (isSynthetic) {
      // Dark slate laboratory background
      ctx.fillStyle = '#171717';
      ctx.fillRect(0, 0, width, height);

      // Draw faint lab bench / grid
      ctx.strokeStyle = '#262626';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      if (syntheticType === 'ballistic-bullet-10k') {
        // High-Speed Defense Ballistic Range: Photron FASTCAM SA-Z (10,000 fps)
        // Draw Ballistic Target Block (Armor / Gelatin) from x = 350 to 570
        ctx.save();
        ctx.fillStyle = 'rgba(234, 179, 8, 0.25)'; // Amber ballistic gel
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.fillRect(350, 140, 220, 200);
        ctx.strokeRect(350, 140, 220, 200);

        // Grid fiducials inside gelatin block (50mm grid)
        ctx.strokeStyle = 'rgba(234, 179, 8, 0.4)';
        ctx.setLineDash([2, 4]);
        for (let gx = 400; gx < 570; gx += 50) {
          ctx.beginPath();
          ctx.moveTo(gx, 140);
          ctx.lineTo(gx, 340);
          ctx.stroke();
        }
        for (let gy = 190; gy < 340; gy += 50) {
          ctx.beginPath();
          ctx.moveTo(350, gy);
          ctx.lineTo(570, gy);
          ctx.stroke();
        }
        ctx.setLineDash([]);

        // Projectile position calculation
        // Frame 0-3: Free flight at ~920 m/s (92 px/frame)
        // Frame 4+: Deceleration inside gelatin with cavitation bubble
        let bulletX = 50 + currentFrame * 92;
        if (currentFrame === 4) bulletX = 395;
        else if (currentFrame === 5) bulletX = 445;
        else if (currentFrame === 6) bulletX = 480;
        else if (currentFrame === 7) bulletX = 503;
        else if (currentFrame === 8) bulletX = 518;
        else if (currentFrame === 9) bulletX = 527;
        else if (currentFrame === 10) bulletX = 532;
        else if (currentFrame >= 11) bulletX = 535;

        const bulletY = 240;

        // Cavitation bubble inside gelatin block
        if (currentFrame >= 4) {
          const cavRadius = Math.min(65, (currentFrame - 3) * 12);
          const cavCenterX = 350 + (bulletX - 350) * 0.55;

          // Temporary Cavity
          const grad = ctx.createRadialGradient(cavCenterX, bulletY, 5, cavCenterX, bulletY, cavRadius);
          grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
          grad.addColorStop(0.5, 'rgba(251, 191, 36, 0.6)');
          grad.addColorStop(1, 'rgba(234, 88, 12, 0.05)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(cavCenterX, bulletY, cavRadius * 1.3, cavRadius * 0.9, 0, 0, Math.PI * 2);
          ctx.fill();

          // Permanent wound tract
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(350, bulletY);
          ctx.lineTo(bulletX, bulletY);
          ctx.stroke();
        }

        // Impact flash star at frame 4
        if (currentFrame === 4) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(350, bulletY, 14, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
            ctx.beginPath();
            ctx.moveTo(350, bulletY);
            ctx.lineTo(350 + Math.cos(a) * 26, bulletY + Math.sin(a) * 26);
            ctx.stroke();
          }
        }

        // Supersonic Shockwave (Mach cone) in air prior to impact
        if (currentFrame < 4) {
          ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(bulletX, bulletY);
          ctx.lineTo(bulletX - 80, bulletY - 35);
          ctx.moveTo(bulletX, bulletY);
          ctx.lineTo(bulletX - 80, bulletY + 35);
          ctx.stroke();
        }

        // Draw 5.56mm Spitzer Bullet
        ctx.fillStyle = '#f59e0b'; // Copper jacket
        ctx.strokeStyle = '#78350f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        // Spitzer ogive pointed nose
        ctx.moveTo(bulletX, bulletY);
        ctx.quadraticCurveTo(bulletX - 8, bulletY - 4, bulletX - 18, bulletY - 4);
        ctx.lineTo(bulletX - 22, bulletY - 3); // boat tail
        ctx.lineTo(bulletX - 22, bulletY + 3);
        ctx.lineTo(bulletX - 18, bulletY + 4);
        ctx.quadraticCurveTo(bulletX - 8, bulletY + 4, bulletX, bulletY);
        ctx.fill();
        ctx.stroke();

        // High-Speed Defense HUD Annotation
        ctx.fillStyle = '#38bdf8';
        ctx.font = '10px monospace';
        ctx.fillText('PHOTRON FASTCAM SA-Z · 10,000 FPS · 100 µs/frame', 20, 30);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(
          currentFrame < 4
            ? `FREE FLIGHT: v = 920 m/s (Mach 2.68) · Sub-frame dt = 100.00 µs`
            : currentFrame <= 11
            ? `PENETRATION DECELERATION: a = -4.8e5 m/s² (~49,000 g)`
            : `PROJECTILE ARRESTED · Max penetration = 185 mm`,
          20,
          45
        );
        ctx.restore();
      } else if (syntheticType === 'supersonic-shockwave-25k') {
        // High-Speed Schlieren Imaging: Phantom v2512 (25,000 fps)
        ctx.save();
        // Circular Schlieren optical mirror field
        const centerSchlierenX = width / 2;
        const centerSchlierenY = height / 2;
        const schlierenRadius = 180;

        ctx.save();
        ctx.beginPath();
        ctx.arc(centerSchlierenX, centerSchlierenY, schlierenRadius, 0, Math.PI * 2);
        ctx.clip();

        // Schlieren optical background gradient (simulating knife-edge illumination)
        const schlierenGrad = ctx.createLinearGradient(
          centerSchlierenX - schlierenRadius,
          centerSchlierenY - schlierenRadius,
          centerSchlierenX + schlierenRadius,
          centerSchlierenY + schlierenRadius
        );
        schlierenGrad.addColorStop(0, '#27272a');
        schlierenGrad.addColorStop(0.5, '#3f3f46');
        schlierenGrad.addColorStop(1, '#18181b');
        ctx.fillStyle = schlierenGrad;
        ctx.fillRect(0, 0, width, height);

        const projX = Math.round(50 + currentFrame * 33);
        const projY = 240;

        // Oblique Conical Shockwave (Mach cone, μ = 24.62° for Mach 2.40)
        const machAngleRad = (24.62 * Math.PI) / 180;
        const coneLen = 260;
        const dy = Math.tan(machAngleRad) * coneLen;

        // Leading Head Shock
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(projX, projY);
        ctx.lineTo(projX - coneLen, projY - dy);
        ctx.moveTo(projX, projY);
        ctx.lineTo(projX - coneLen, projY + dy);
        ctx.stroke();

        // Trailing Base Shock
        ctx.strokeStyle = 'rgba(200, 200, 220, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(projX - 30, projY - 5);
        ctx.lineTo(projX - 30 - coneLen * 0.8, projY - 5 - dy * 0.8);
        ctx.moveTo(projX - 30, projY + 5);
        ctx.lineTo(projX - 30 - coneLen * 0.8, projY + 5 + dy * 0.8);
        ctx.stroke();

        // Supersonic projectile body
        ctx.fillStyle = '#e4e4e7';
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(projX, projY);
        ctx.lineTo(projX - 12, projY - 5);
        ctx.lineTo(projX - 30, projY - 5);
        ctx.lineTo(projX - 30, projY + 5);
        ctx.lineTo(projX - 12, projY + 5);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();

        // Schlieren mirror bezel
        ctx.strokeStyle = '#52525b';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(centerSchlierenX, centerSchlierenY, schlierenRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Telemetry readout
        ctx.fillStyle = '#38bdf8';
        ctx.font = '10px monospace';
        ctx.fillText('VISION RESEARCH PHANTOM v2512 · 25,000 FPS · 40 µs/frame', 20, 30);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('SCHLIEREN OPTICAL ENVELOPE: Mach 2.40 (825 m/s) · Shock Angle μ = 24.6°', 20, 45);
        ctx.restore();
      } else if (syntheticType === 'incline-cart') {
        // Draw 15-degree inclined plane
        ctx.save();
        ctx.strokeStyle = '#52525b';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(60, 140);
        ctx.lineTo(560, 274);
        ctx.stroke();

        // Draw rolling cart at current frame
        const t = currentFrame / clip.fps;
        const a = 9.81 * Math.sin((15 * Math.PI) / 180);
        const x_m = 0.5 * a * t * t;
        const scale = 276;
        const dist = Math.min(480, x_m * scale);
        const rad = (-15 * Math.PI) / 180;
        const cx = 100 + dist * Math.cos(rad);
        const cy = 150 - dist * Math.sin(rad);

        ctx.translate(cx, cy);
        ctx.rotate(-rad);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(-20, -15, 40, 20);
        // Wheels
        ctx.fillStyle = '#a1a1aa';
        ctx.beginPath();
        ctx.arc(-12, 8, 5, 0, Math.PI * 2);
        ctx.arc(12, 8, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else {
        // Default Pendulum oscillator
        const t = currentFrame / clip.fps;
        const omega = Math.sqrt(9.81 / 1.0);
        const theta0 = (25 * Math.PI) / 180;
        const theta = theta0 * Math.cos(omega * t);
        const L_px = 240;
        const px = 300 + L_px * Math.sin(theta);
        const py = 80 + L_px * Math.cos(theta);

        // Pivot
        ctx.fillStyle = '#71717a';
        ctx.beginPath();
        ctx.arc(300, 80, 7, 0, Math.PI * 2);
        ctx.fill();

        // Rod
        ctx.strokeStyle = '#e4e4e7';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(300, 80);
        ctx.lineTo(px, py);
        ctx.stroke();

        // Bob
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // 2. Coordinate Axes
    if (axes.visible) {
      const { origin, angle } = axes;
      const rad = (angle * Math.PI) / 180;
      const axisLen = 140;

      // Draw Grid if enabled
      if (axes.gridVisible) {
        ctx.save();
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.15)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);

        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        for (let offset = -400; offset <= 400; offset += 50) {
          if (offset === 0) continue;
          // Grid lines parallel to X
          ctx.beginPath();
          ctx.moveTo(origin.x - 500 * cos + offset * sin, origin.y + 500 * sin + offset * cos);
          ctx.lineTo(origin.x + 500 * cos + offset * sin, origin.y - 500 * sin + offset * cos);
          ctx.stroke();

          // Grid lines parallel to Y
          ctx.beginPath();
          ctx.moveTo(origin.x + offset * cos - 500 * sin, origin.y - offset * sin - 500 * cos);
          ctx.lineTo(origin.x + offset * cos + 500 * sin, origin.y - offset * sin + 500 * cos);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Draw +X Axis (emerald green)
      const cosX = Math.cos(rad);
      const sinX = Math.sin(rad);
      const endXx = origin.x + axisLen * cosX;
      const endXy = origin.y - axisLen * sinX;

      ctx.save();
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(endXx, endXy);
      ctx.stroke();

      // +X arrow head
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(endXx, endXy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 11px monospace';
      ctx.fillText('+x', endXx + 8 * cosX, endXy - 8 * sinX);

      // Draw +Y Axis (emerald green, perpendicular)
      const endYx = origin.x - axisLen * sinX;
      const endYy = origin.y - axisLen * cosX;

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.lineTo(endYx, endYy);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(endYx, endYy, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillText('+y', endYx - 8 * sinX, endYy - 8 * cosX);

      // Origin Handle
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.arc(origin.x, origin.y, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Axis rotation drag handle (circle along +X)
      const rotHandleX = origin.x + (axisLen - 25) * cosX;
      const rotHandleY = origin.y - (axisLen - 25) * sinX;
      ctx.fillStyle = '#34d399';
      ctx.beginPath();
      ctx.arc(rotHandleX, rotHandleY, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // 3. Calibration Stick (Blue Tape Measure)
    if (calibration.visible) {
      const { pointA, pointB, realLength, unit } = calibration;

      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2.5;

      // Calibration bar
      ctx.beginPath();
      ctx.moveTo(pointA.x, pointA.y);
      ctx.lineTo(pointB.x, pointB.y);
      ctx.stroke();

      // End Crosshairs & Handles
      [pointA, pointB].forEach((pt) => {
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pt.x - 8, pt.y);
        ctx.lineTo(pt.x + 8, pt.y);
        ctx.moveTo(pt.x, pt.y - 8);
        ctx.lineTo(pt.x, pt.y + 8);
        ctx.stroke();

        ctx.fillStyle = '#2563eb';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // Measurement readout badge in center of stick
      const midX = (pointA.x + pointB.x) / 2;
      const midY = (pointA.y + pointB.y) / 2;
      const text = `${realLength} ${unit}`;

      ctx.font = 'bold 11px monospace';
      const textMetrics = ctx.measureText(text);
      const padding = 6;
      const bgW = textMetrics.width + padding * 2;
      const bgH = 18;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(midX - bgW / 2, midY - bgH / 2 - 14, bgW, bgH);
      ctx.strokeStyle = '#2563eb';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(midX - bgW / 2, midY - bgH / 2 - 14, bgW, bgH);

      ctx.fillStyle = '#1d4ed8';
      ctx.fillText(text, midX - textMetrics.width / 2, midY - 14 + 4);

      ctx.restore();
    }

    // 4. Tracks & Point Masses
    tracks.forEach((track) => {
      if (!track.visible) return;

      const isCurrentActiveTrack = track.id === activeTrackId;
      const color = track.color || '#ef4444';

      // Trajectory Trails
      if (showTrails && track.steps.length > 1) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 2]);
        ctx.beginPath();
        track.steps.forEach((st, idx) => {
          if (idx === 0) ctx.moveTo(st.px, st.py);
          else ctx.lineTo(st.px, st.py);
        });
        ctx.stroke();
        ctx.restore();
      }

      // Point Marks
      track.steps.forEach((step) => {
        const isCurrentStep = step.frame === currentFrame;

        ctx.save();
        ctx.fillStyle = color;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;

        // Draw Symbol Footprint
        ctx.beginPath();
        if (track.footprint === 'square') {
          ctx.rect(step.px - 4, step.py - 4, 8, 8);
        } else if (track.footprint === 'diamond') {
          ctx.moveTo(step.px, step.py - 5);
          ctx.lineTo(step.px + 5, step.py);
          ctx.lineTo(step.px, step.py + 5);
          ctx.lineTo(step.px - 5, step.py);
          ctx.closePath();
        } else {
          // Default Circle / Crosshair
          ctx.arc(step.px, step.py, isCurrentStep ? 5.5 : 3.5, 0, Math.PI * 2);
        }
        ctx.fill();
        ctx.stroke();

        // If current frame, draw target ring
        if (isCurrentStep && isCurrentActiveTrack) {
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(step.px, step.py, 11, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Velocity & Acceleration Vectors
        if (showVectors) {
          const vScale = 25; // pixel length per m/s
          const aScale = 6; // pixel length per m/s²

          // Velocity Vector (v - bright yellow/cyan)
          if (
            typeof step.vx === 'number' &&
            typeof step.vy === 'number' &&
            (Math.abs(step.vx) > 0.01 || Math.abs(step.vy) > 0.01)
          ) {
            const rad = (axes.angle * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const vx_screen = (step.vx * cos - step.vy * sin) * vScale;
            const vy_screen = -(step.vx * sin + step.vy * cos) * vScale;

            const endVx = step.px + vx_screen;
            const endVy = step.py + vy_screen;

            ctx.strokeStyle = '#fbbf24'; // Yellow
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(step.px, step.py);
            ctx.lineTo(endVx, endVy);
            ctx.stroke();

            // Arrow head
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.arc(endVx, endVy, 3, 0, Math.PI * 2);
            ctx.fill();

            if (isCurrentStep) {
              ctx.font = 'bold 10px monospace';
              ctx.fillText(`v=${step.v?.toFixed(2)}m/s`, endVx + 4, endVy);
            }
          }

          // Acceleration Vector (a - orange)
          if (
            typeof step.ax === 'number' &&
            typeof step.ay === 'number' &&
            (Math.abs(step.ax) > 0.05 || Math.abs(step.ay) > 0.05)
          ) {
            const rad = (axes.angle * Math.PI) / 180;
            const cos = Math.cos(rad);
            const sin = Math.sin(rad);

            const ax_screen = (step.ax * cos - step.ay * sin) * aScale;
            const ay_screen = -(step.ax * sin + step.ay * cos) * aScale;

            const endAx = step.px + ax_screen;
            const endAy = step.py + ay_screen;

            ctx.strokeStyle = '#f97316'; // Orange
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(step.px, step.py);
            ctx.lineTo(endAx, endAy);
            ctx.stroke();

            ctx.fillStyle = '#f97316';
            ctx.beginPath();
            ctx.arc(endAx, endAy, 2.5, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        ctx.restore();
      });
    });

    // 5. Crisp 1px Sensor Pixel Grid at High Zoom (>= 800%) for Sub-Pixel Fiducial Marking
    if (zoom >= 8.0) {
      const contW = containerRef.current?.clientWidth || width;
      const contH = containerRef.current?.clientHeight || height;
      const startPx = Math.max(0, Math.floor(-pan.x / zoom));
      const endPx = Math.min(width, Math.ceil((contW - pan.x) / zoom));
      const startPy = Math.max(0, Math.floor(-pan.y / zoom));
      const endPy = Math.min(height, Math.ceil((contH - pan.y) / zoom));

      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = Math.max(0.04, 1 / zoom);
      ctx.beginPath();
      for (let x = startPx; x <= endPx; x += 1) {
        ctx.moveTo(x, startPy);
        ctx.lineTo(x, endPy);
      }
      for (let y = startPy; y <= endPy; y += 1) {
        ctx.moveTo(startPx, y);
        ctx.lineTo(endPx, y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }, [
    isSynthetic,
    isChunkedAvi,
    aviLoader,
    syntheticType,
    currentFrame,
    clip,
    axes,
    calibration,
    tracks,
    activeTrackId,
    showTrails,
    showVectors,
    zoom,
    pan.x,
    pan.y,
  ]);

  // Decode single frame on-demand when UnifiedFrameSource (.AVI, .MOV stbl, .GIF, Image Sequence) is active
  useEffect(() => {
    if (!isChunkedAvi || !aviLoader) {
      aviBitmapRef.current = null;
      aviImageDataRef.current = null;
      return;
    }
    setVideoError(null);
    let cancelled = false;
    aviLoader
      .getFrame(currentFrame)
      .then(async (bmp) => {
        if (cancelled) return;
        if (bmp) {
          aviBitmapRef.current = bmp;
          aviImageDataRef.current = null;
          setDecodedFrameTick((t) => t + 1);
          renderCanvas();
        } else {
          const imgData = await aviLoader.getFrameImageData(currentFrame);
          if (!cancelled && imgData) {
            aviBitmapRef.current = null;
            aviImageDataRef.current = imgData;
            setDecodedFrameTick((t) => t + 1);
            renderCanvas();
          }
        }
      })
      .catch(() => {
        // ignore decode error
      });
    return () => {
      cancelled = true;
    };
  }, [isChunkedAvi, aviLoader, currentFrame, renderCanvas]);

  // Trigger render on updates
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const isLoupeVisible = Boolean(showLoupe || isShiftPressed);

  // Magnifier Loupe (8x) render effect for Tracker-style sub-pixel tracking
  useEffect(() => {
    if (!isLoupeVisible || !mouseCoord || !loupeCanvasRef.current || !canvasRef.current) return;
    const lCanvas = loupeCanvasRef.current;
    const lCtx = lCanvas.getContext('2d');
    if (!lCtx) return;

    const loupeZoom = 8.0;
    const lWidth = lCanvas.width;
    const lHeight = lCanvas.height;
    const sourceW = lWidth / loupeZoom;
    const sourceH = lHeight / loupeZoom;
    const sourceX = Math.max(0, Math.min(canvasSize.width - sourceW, mouseCoord.px - sourceW / 2));
    const sourceY = Math.max(0, Math.min(canvasSize.height - sourceH, mouseCoord.py - sourceH / 2));

    lCtx.clearRect(0, 0, lWidth, lHeight);
    lCtx.imageSmoothingEnabled = false;

    // 1. Draw raw video or UnifiedFrameSource ImageBitmap background into 8x loupe first
    if (!isSynthetic) {
      if (isChunkedAvi && aviBitmapRef.current) {
        try {
          lCtx.drawImage(
            aviBitmapRef.current,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            0,
            0,
            lWidth,
            lHeight
          );
        } catch {
          // ignore potential bitmap read error
        }
      } else if (!isChunkedAvi && videoRef.current && videoRef.current.readyState >= 2) {
        try {
          lCtx.drawImage(
            videoRef.current,
            sourceX,
            sourceY,
            sourceW,
            sourceH,
            0,
            0,
            lWidth,
            lHeight
          );
        } catch {
          // ignore potential cross-origin error
        }
      }
    }

    // 2. Draw overlay canvas (points, vectors, axes, calibration stick, synthetic physics animation)
    if (canvasRef.current) {
      lCtx.drawImage(
        canvasRef.current,
        sourceX,
        sourceY,
        sourceW,
        sourceH,
        0,
        0,
        lWidth,
        lHeight
      );
    }

    // 2b. Subtle 1px sensor grid inside the 8x Loupe
    lCtx.strokeStyle = 'rgba(148, 163, 184, 0.22)';
    lCtx.lineWidth = 1;
    const firstGridX = Math.ceil(sourceX);
    const firstGridY = Math.ceil(sourceY);
    lCtx.beginPath();
    for (let gx = firstGridX; gx <= sourceX + sourceW; gx += 1) {
      const lx = Math.round((gx - sourceX) * loupeZoom) + 0.5;
      lCtx.moveTo(lx, 0);
      lCtx.lineTo(lx, lHeight);
    }
    for (let gy = firstGridY; gy <= sourceY + sourceH; gy += 1) {
      const ly = Math.round((gy - sourceY) * loupeZoom) + 0.5;
      lCtx.moveTo(0, ly);
      lCtx.lineTo(lWidth, ly);
    }
    lCtx.stroke();

    // 3. Draw high-visibility sub-pixel reticle and crosshairs
    const centerX = (mouseCoord.px - sourceX) * loupeZoom;
    const centerY = (mouseCoord.py - sourceY) * loupeZoom;

    // Crosshairs
    lCtx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    lCtx.lineWidth = 1;
    lCtx.beginPath();
    lCtx.moveTo(centerX, 0);
    lCtx.lineTo(centerX, centerY - 6);
    lCtx.moveTo(centerX, centerY + 6);
    lCtx.lineTo(centerX, lHeight);
    lCtx.moveTo(0, centerY);
    lCtx.lineTo(centerX - 6, centerY);
    lCtx.moveTo(centerX + 6, centerY);
    lCtx.lineTo(lWidth, centerY);
    lCtx.stroke();

    // Dark crosshair shadow for contrast against light or smoke backgrounds
    lCtx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
    lCtx.setLineDash([2, 2]);
    lCtx.beginPath();
    lCtx.moveTo(centerX, 0);
    lCtx.lineTo(centerX, lHeight);
    lCtx.moveTo(0, centerY);
    lCtx.lineTo(lWidth, centerY);
    lCtx.stroke();
    lCtx.setLineDash([]);

    // Outer Target Reticle
    lCtx.strokeStyle = '#2563EB';
    lCtx.lineWidth = 1.5;
    lCtx.beginPath();
    lCtx.arc(centerX, centerY, 12, 0, Math.PI * 2);
    lCtx.stroke();

    // Sub-pixel center point
    lCtx.fillStyle = '#DC2626';
    lCtx.beginPath();
    lCtx.arc(centerX, centerY, 2.2, 0, Math.PI * 2);
    lCtx.fill();
  }, [
    isLoupeVisible,
    mouseCoord,
    canvasSize,
    currentFrame,
    decodedFrameTick,
    videoUrl,
    isSynthetic,
    isChunkedAvi,
    tracks,
    calibration,
    axes,
  ]);

  // Mouse drag, effortless click-drag pan & sub-pixel mark handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // 0. Check right-click (2), middle-click (1), or Spacebar held -> Immediate Pan
    if (e.button === 2 || e.button === 1 || isSpacePressed) {
      e.preventDefault();
      e.stopPropagation();
      setIsPanning(true);
      panStartRef.current = {
        x: e.clientX - pan.x,
        y: e.clientY - pan.y,
      };
      return;
    }

    if (e.button !== 0) return;

    const { px, py } = getCanvasCoords(e);
    const hitRadius = Math.max(2.5, 14 / Math.max(0.5, zoom));

    // 1. Check calibration handles
    if (calibration.visible && !e.shiftKey && !isShiftPressed) {
      if (Math.hypot(px - calibration.pointA.x, py - calibration.pointA.y) < hitRadius) {
        onBeginHistoryAction?.('Move Calibration Handle A');
        setDragTarget({ type: 'calA' });
        return;
      }
      if (Math.hypot(px - calibration.pointB.x, py - calibration.pointB.y) < hitRadius) {
        onBeginHistoryAction?.('Move Calibration Handle B');
        setDragTarget({ type: 'calB' });
        return;
      }
    }

    // 2. Check coordinate axes handles
    if (axes.visible && !e.shiftKey && !isShiftPressed) {
      if (Math.hypot(px - axes.origin.x, py - axes.origin.y) < hitRadius) {
        onBeginHistoryAction?.('Move Coordinate Origin');
        setDragTarget({ type: 'origin' });
        return;
      }

      // Rotation handle along +X
      const rad = (axes.angle * Math.PI) / 180;
      const rotHandleX = axes.origin.x + 115 * Math.cos(rad);
      const rotHandleY = axes.origin.y - 115 * Math.sin(rad);
      if (Math.hypot(px - rotHandleX, py - rotHandleY) < hitRadius) {
        onBeginHistoryAction?.('Rotate Coordinate Axes');
        setDragTarget({ type: 'axisRotate' });
        return;
      }
    }

    // 3. Check existing point on active track (when not holding Shift to place a new point)
    if (activeTrack && !e.shiftKey && !isShiftPressed) {
      const pointRadius = Math.max(2.0, 10 / Math.max(0.5, zoom));
      const existing = activeTrack.steps.find((s) => Math.hypot(px - s.px, py - s.py) < pointRadius);
      if (existing) {
        onBeginHistoryAction?.(`Drag Point F#${existing.frame}`);
        setDragTarget({ type: 'point', frame: existing.frame });
        onFrameChange(existing.frame);
        return;
      }
    }

    // 4. Holding Shift -> Immediate Sub-Pixel Point Mark at (u, v)
    if (e.shiftKey || isShiftPressed) {
      const world = pixelToWorld(px, py, axes, calibration);
      const newStep: PointStep = {
        frame: currentFrame,
        time: currentTime,
        px,
        py,
        x: world.x,
        y: world.y,
      };
      onAddPoint(newStep);
      if (autoAdvance) {
        const nextFrame = Math.min(clip.endFrame, currentFrame + clip.stepSize);
        onFrameChange(nextFrame);
      }
      return;
    }

    // 5. Left-click on empty canvas without Shift: initiate potential Pan gesture (<3px click vs >=3px drag pan)
    pointerGestureRef.current = {
      active: true,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: pan.x,
      startPanY: pan.y,
      moved: false,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = getCanvasCoords(e);
    const world = pixelToWorld(px, py, axes, calibration);
    setMouseCoord({ px, py, x: world.x, y: world.y });

    if (pointerGestureRef.current?.active) {
      const dx = e.clientX - pointerGestureRef.current.startClientX;
      const dy = e.clientY - pointerGestureRef.current.startClientY;
      if (Math.hypot(dx, dy) >= 3 || pointerGestureRef.current.moved) {
        pointerGestureRef.current.moved = true;
        if (!isPanning) setIsPanning(true);
        setPan({
          x: pointerGestureRef.current.startPanX + dx,
          y: pointerGestureRef.current.startPanY + dy,
        });
      }
      return;
    }

    if (isPanning) {
      e.preventDefault();
      setPan({
        x: e.clientX - panStartRef.current.x,
        y: e.clientY - panStartRef.current.y,
      });
      return;
    }

    if (!dragTarget) return;

    if (dragTarget.type === 'calA') {
      onUpdateCalibration({ pointA: { x: px, y: py } });
    } else if (dragTarget.type === 'calB') {
      onUpdateCalibration({ pointB: { x: px, y: py } });
    } else if (dragTarget.type === 'origin') {
      onUpdateAxes({ origin: { x: px, y: py } });
    } else if (dragTarget.type === 'axisRotate') {
      const dx = px - axes.origin.x;
      const dy = axes.origin.y - py;
      const angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI);
      onUpdateAxes({ angle: angleDeg });
    } else if (dragTarget.type === 'point') {
      onUpdatePoint(dragTarget.frame, px, py);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (pointerGestureRef.current?.active) {
      const gesture = pointerGestureRef.current;
      pointerGestureRef.current = null;
      setIsPanning(false);

      // Clean click (< 3px movement) without Shift
      if (!gesture.moved) {
        if (requireShiftToMark) {
          setShowShiftWarning(true);
          if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
          warningTimerRef.current = setTimeout(() => setShowShiftWarning(false), 2600);
        } else {
          const { px, py } = getCanvasCoords(e);
          const world = pixelToWorld(px, py, axes, calibration);
          const newStep: PointStep = {
            frame: currentFrame,
            time: currentTime,
            px,
            py,
            x: world.x,
            y: world.y,
          };
          onAddPoint(newStep);
          if (autoAdvance) {
            const nextFrame = Math.min(clip.endFrame, currentFrame + clip.stepSize);
            onFrameChange(nextFrame);
          }
        }
      }
      return;
    }

    if (isPanning || e.button === 2 || e.button === 1) {
      setIsPanning(false);
      return;
    }
    setDragTarget(null);
  };

  return (
    <div id="video-player-view" className="flex flex-col h-full bg-[#F1F3F5] select-none overflow-hidden">
      {/* Video & Canvas Stage */}
      <div
        ref={containerRef}
        onContextMenu={(e) => e.preventDefault()}
        onWheel={handleWheel}
        onDoubleClick={(e) => {
          if (!e.shiftKey && !dragTarget) {
            resetZoomAndPan();
          }
        }}
        onMouseDown={(e) => {
          if (e.button === 2 || e.button === 1 || isSpacePressed) {
            e.preventDefault();
            setIsPanning(true);
            panStartRef.current = {
              x: e.clientX - pan.x,
              y: e.clientY - pan.y,
            };
          }
        }}
        onMouseMove={(e) => {
          if (isPanning && !pointerGestureRef.current?.active) {
            e.preventDefault();
            setPan({
              x: e.clientX - panStartRef.current.x,
              y: e.clientY - panStartRef.current.y,
            });
          }
        }}
        onMouseUp={() => {
          if (isPanning) setIsPanning(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDraggingFile(false);
          setVideoError(null);
          onClearCodecDiagnostic?.();
          const dropped = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
          if (dropped.length > 0) {
            onUploadVideo?.(dropped.length === 1 ? dropped[0] : dropped);
          }
        }}
        className="relative flex-1 bg-[#0F172A] min-h-0 overflow-hidden select-none"
      >
        {/* Floating Zoom & Pan HUD in Top-Left Corner */}
        <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-[#F1F3F5]/95 border border-[#CBD5E1] rounded-[3px] p-1 shadow-md text-xs backdrop-blur-xs select-none">
          <button
            type="button"
            onClick={() => {
              const container = containerRef.current;
              const cx = (container?.clientWidth || 400) / 2;
              const cy = (container?.clientHeight || 300) / 2;
              const newZoom = Math.max(0.25, Number((zoom / 1.25).toFixed(3)));
              setPan({
                x: cx - (cx - pan.x) * (newZoom / zoom),
                y: cy - (cy - pan.y) * (newZoom / zoom),
              });
              setZoom(newZoom);
            }}
            className="p-1 rounded-[2px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-bold text-[11px] h-6 w-6 flex items-center justify-center cursor-pointer transition-colors"
            title="Zoom Out (or Scroll Wheel Down)"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          <span className="font-mono font-bold text-[11px] text-[#1E293B] px-1 min-w-[48px] text-center tabular-nums">
            {Math.round(zoom * 100)}%
          </span>

          <button
            type="button"
            onClick={() => {
              const container = containerRef.current;
              const cx = (container?.clientWidth || 400) / 2;
              const cy = (container?.clientHeight || 300) / 2;
              const newZoom = Math.min(24.0, Number((zoom * 1.25).toFixed(3)));
              setPan({
                x: cx - (cx - pan.x) * (newZoom / zoom),
                y: cy - (cy - pan.y) * (newZoom / zoom),
              });
              setZoom(newZoom);
            }}
            className="p-1 rounded-[2px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-bold text-[11px] h-6 w-6 flex items-center justify-center cursor-pointer transition-colors"
            title="Zoom In up to 2400% (or Scroll Wheel Up)"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-[1px] bg-[#CBD5E1] mx-0.5" />

          <button
            type="button"
            onClick={() => resetZoomAndPan(1)}
            className={`px-2 py-0.5 rounded-[2px] text-[10px] font-bold border transition-colors cursor-pointer ${
              Math.abs(zoom - 1) < 0.01
                ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                : 'bg-white hover:bg-[#E2E8F0] text-[#1E293B] border-[#CBD5E1]'
            }`}
            title="Reset to 100% (1:1 Native Sensor Resolution)"
          >
            1:1
          </button>

          <button
            type="button"
            onClick={() => resetZoomAndPan()}
            className="px-2 py-0.5 rounded-[2px] bg-white hover:bg-[#E2E8F0] text-[#1E293B] border border-[#CBD5E1] text-[10px] font-bold cursor-pointer transition-colors"
            title="Fit Video to Workspace View (Key: F or Double-Click)"
          >
            Fit
          </button>

          <div className="h-4 w-[1px] bg-[#CBD5E1] mx-0.5 hidden sm:block" />

          <span className="text-[10px] text-[#475569] px-1 hidden xl:inline-flex items-center gap-1 font-medium">
            <Move className="w-3 h-3 text-[#2563EB]" />
            <span>Drag: Pan &bull; Wheel: Zoom &bull; Shift+Click: Mark</span>
          </span>
        </div>

        {/* Status badge and Shift Mode in top center */}
        <div className="absolute top-2 left-64 md:left-72 flex items-center gap-2 pointer-events-none z-20">
          <div className="bg-[#F1F3F5]/95 border border-[#CBD5E1] rounded-[3px] px-2 py-0.5 text-[11px] font-mono text-[#1E293B] flex items-center gap-1.5 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
            <span>
              Frame: <strong className="text-[#1E293B] font-bold">{currentFrame}</strong> / {Math.max(0, clip.totalFrames - 1)}
            </span>
            <span className="text-[#2563EB] ml-1 font-bold">
              (t = {formatHighSpeedTime(currentTime, clip.fps, clip.timeUnit)})
            </span>
          </div>

          <button
            type="button"
            onClick={() => onOpenFormatsModal?.('catalog')}
            className="pointer-events-auto bg-[#F1F3F5]/95 hover:bg-white border border-[#CBD5E1] rounded-[3px] px-2 py-0.5 text-[10px] font-mono text-[#1E293B] flex items-center gap-1 transition-colors cursor-pointer shadow-xs"
            title="Click to view accepted formats, high-speed camera profiles and specifications"
          >
            <Film className="w-3 h-3 text-[#2563EB]" />
            <span className="font-bold text-[#2563EB]">
              {clip.cameraModel || fileName?.split('.').pop()?.toUpperCase() || 'HIGH-SPEED'}
            </span>
            <span className="text-[#475569] font-semibold">
              @{clip.fps.toLocaleString()} fps
            </span>
          </button>

          {requireShiftToMark && (
            <div
              className={`px-2 py-0.5 rounded-[3px] border text-[10px] font-mono flex items-center gap-1.5 transition-colors shadow-xs ${
                isShiftPressed
                  ? 'bg-amber-50 border-amber-500 text-amber-950 font-bold'
                  : 'bg-[#F1F3F5]/95 border-[#CBD5E1] text-[#334155] font-medium'
              }`}
            >
              <Crosshair className={`w-3 h-3 ${isShiftPressed ? 'text-[#D97706]' : 'text-[#64748B]'}`} />
              <span>Mark:</span>
              <strong className={isShiftPressed ? 'text-[#D97706] underline' : 'text-[#2563EB]'}>
                {isShiftPressed ? 'READY (Shift)' : 'SAFE (Hold Shift)'}
              </strong>
            </div>
          )}

          {activeStep && (
            <div className="bg-white border border-[#CBD5E1] text-[#1E293B] font-semibold rounded-[3px] px-2 py-0.5 text-[10px] font-mono shadow-xs">
              Marked: ({activeStep.x.toFixed(3)}, {activeStep.y.toFixed(3)})m
            </div>
          )}
        </div>

        {/* Accidental Click Interception Toast Notice */}
        {showShiftWarning && (
          <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#181B20] text-[#E2E8F0] px-3.5 py-1.5 rounded-[3px] border border-[#2A2E37] shadow-lg flex items-center gap-2 text-xs font-mono pointer-events-none z-30">
            <span className="w-2 h-2 rounded-full bg-[#D97706]" />
            <span>
              <strong>Safety Lock:</strong> Hold <span className="underline font-bold text-amber-300">Shift + Click</span> on video to mark a point mass.
            </span>
          </div>
        )}

        {/* Tracker 8x Sub-Pixel Magnifier Loupe Tool in top-right corner */}
        {isLoupeVisible && (
          <div className="absolute top-2 right-2 bg-[#F1F3F5]/95 border border-[#CBD5E1] rounded-[3px] p-2 flex flex-col gap-1.5 pointer-events-none z-20 shadow-lg select-none">
            <div className="flex items-center justify-between text-[11px] font-bold text-[#1E293B] px-1 border-b border-[#CBD5E1] pb-1">
              <span className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${isShiftPressed ? 'bg-[#D97706]' : 'bg-[#2563EB]'}`} />
                <span>Precision Loupe (8×)</span>
              </span>
              <span className="font-mono text-[10px] text-[#334155] bg-white px-1 py-0.2 rounded-[2px] border border-[#CBD5E1]">
                {isShiftPressed ? 'SHIFT MARK' : 'Sub-pixel'}
              </span>
            </div>
            <div className="relative w-36 h-36 bg-[#0F172A] rounded-[2px] border border-[#CBD5E1] overflow-hidden shadow-inner">
              <canvas
                ref={loupeCanvasRef}
                width={144}
                height={144}
                className="w-full h-full block"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="text-[10px] font-mono text-[#1E293B] px-1 flex flex-col gap-0.5">
              {mouseCoord ? (
                <>
                  <div className="flex items-center justify-between text-[#1E293B]">
                    <span className="text-[#64748B]">u, v:</span>
                    <strong className="text-[#2563EB] font-bold tabular-nums">
                      {mouseCoord.px.toFixed(2)}, {mouseCoord.py.toFixed(2)} px
                    </strong>
                  </div>
                  <div className="flex items-center justify-between text-[9.5px] text-[#475569]">
                    <span>World X,Y:</span>
                    <span className="font-semibold tabular-nums">
                      {mouseCoord.x.toFixed(3)}, {mouseCoord.y.toFixed(3)} m
                    </span>
                  </div>
                </>
              ) : (
                <span className="text-[#64748B] italic text-center py-1">Hover video to inspect clip</span>
              )}
            </div>
          </div>
        )}

        {/* Coordinate Readout Overlay in bottom-left corner */}
        <div className="absolute bottom-2 left-2 bg-[#F1F3F5]/95 border border-[#CBD5E1] rounded-[3px] px-2.5 py-1 text-[11px] font-mono text-[#1E293B] flex items-center gap-3 pointer-events-none z-20 shadow-md tabular-nums">
          {mouseCoord ? (
            <>
              <span>
                x: <strong className="text-[#1E293B] font-bold">{mouseCoord.x.toFixed(3)}</strong> m
              </span>
              <span>
                y: <strong className="text-[#1E293B] font-bold">{mouseCoord.y.toFixed(3)}</strong> m
              </span>
              <span className="text-[#2563EB] text-[10px] font-semibold">
                (u: {mouseCoord.px.toFixed(2)} px, v: {mouseCoord.py.toFixed(2)} px)
              </span>
              {zoom >= 3.0 && (
                <span className="text-[9.5px] px-1 py-0.2 bg-[#E2E8F0] border border-[#CBD5E1] rounded-[2px] text-[#334155]">
                  {zoom >= 8.0 ? 'PIXEL GRID ON' : 'CRISP PIXELS'}
                </span>
              )}
            </>
          ) : (
            <span className="text-[#64748B]">Hover video for sub-pixel coordinates</span>
          )}
        </div>

        {/* Drag & Drop Visual HUD Overlay */}
        {isDraggingFile && (
          <div className="absolute inset-0 z-40 bg-[#1e3a5f]/85 border-2 border-dashed border-white text-white flex flex-col items-center justify-center pointer-events-none p-4 backdrop-blur-xs">
            <Upload className="w-12 h-12 mb-2 animate-bounce" />
            <p className="text-sm font-bold">Drop Video, Image Sequence, or Project</p>
            <p className="text-xs text-blue-200 mt-1">
              Accepts .MP4, .AVI, .MOV, .WMV, .FLV, .OGG, .WEBM, .MKV, .GIF, .PNG/.JPG/.BMP/.WEBP, .TRK/.TRZ/.ZIP
            </p>
          </div>
        )}

        {/* Hidden File Input for local fallback picker */}
        <input
          ref={hiddenFileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_VIDEO_ACCEPT_STRING}
          className="hidden"
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length > 0) {
              setVideoError(null);
              onClearCodecDiagnostic?.();
              onUploadVideo?.(files.length === 1 ? files[0] : files);
              e.target.value = '';
            }
          }}
        />

        {/* Tier 3 Inline Codec Diagnostic Card (unscaled viewport-level overlay) */}
        {codecDiagnostic && (
          <CodecDiagnosticCard
            diagnostic={codecDiagnostic}
            onSelectAnotherFile={() => hiddenFileInputRef.current?.click()}
            onOpenFormatsModal={onOpenFormatsModal}
            onDismiss={onClearCodecDiagnostic}
          />
        )}

        {/* Transformed Video & Canvas Scene Viewport */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: canvasSize.width,
            height: canvasSize.height,
            transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isPanning ? 'none' : 'transform 0.04s ease-out',
            cursor: isPanning
              ? 'grabbing'
              : isShiftPressed || !requireShiftToMark
              ? 'crosshair'
              : 'grab',
            imageRendering: zoom >= 3.0 ? 'pixelated' : 'auto',
          }}
          className="rounded-[2px] overflow-hidden border border-[#555555] shadow-2xl bg-black select-none"
        >
          {/* Real HTML5 Video element (NEVER mounted when UnifiedFrameSource is active) */}
          {!isSynthetic && !isGif && !isChunkedAvi && Boolean(videoUrl) && (
            <video
              ref={(el) => {
                videoRef.current = el;
                if (el) {
                  el.muted = true;
                  el.defaultMuted = true;
                }
              }}
              src={normalizeVideoUrl(videoUrl)}
              preload="auto"
              playsInline
              muted
              onLoadedMetadata={() => {
                handleLoadedMetadata();
                renderCanvas();
              }}
              onDurationChange={() => {
                handleLoadedMetadata();
                renderCanvas();
              }}
              onLoadedData={() => {
                setVideoError(null);
                const video = videoRef.current;
                if (video) {
                  video.muted = true;
                  video.defaultMuted = true;
                  if (video.currentTime === 0) {
                    try {
                      video.currentTime = 0.001;
                    } catch {
                      // ignore
                    }
                  }
                }
                renderCanvas();
              }}
              onPlay={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'play', video);
              }}
              onPause={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'pause', video);
              }}
              onSeeking={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'seeking', video);
              }}
              onSeeked={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'seeked', video);
                renderCanvas();
              }}
              onRateChange={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'ratechange', video);
              }}
              onWaiting={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'waiting', video);
              }}
              onStalled={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'stalled', video);
              }}
              onCanPlay={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'canplay', video);
                renderCanvas();
              }}
              onTimeUpdate={() => {
                const video = videoRef.current;
                mediaDiagnostics.logEvent('primary', 'timeupdate', video);
                if (isPlaying) renderCanvas();
              }}
              onError={(e) => {
                if (isChunkedAvi) return;
                const mediaError = (e.target as HTMLVideoElement)?.error;
                mediaDiagnostics.logEvent('primary', 'error', videoRef.current);
                if (mediaError) {
                  let msg = 'Video stream error encountered.';
                  if (mediaError.code === 1) {
                    msg = 'Video playback was aborted by the client.';
                  } else if (mediaError.code === 2) {
                    msg = 'A network error caused the video download to fail.';
                  } else if (mediaError.code === 3) {
                    msg = 'The video stream could not be decoded (corrupted data or hardware decoder error). Transcoding to standard H.264 MP4 is recommended.';
                  } else if (mediaError.code === 4) {
                    msg = 'The video format or codec is not supported by Chromium hardware pipeline. Transcoding to standard H.264 MP4 is recommended.';
                  }
                  setVideoError(msg);
                }
              }}
              className="block"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'fill',
                display: 'block',
                imageRendering: zoom >= 3.0 ? 'pixelated' : 'auto',
              }}
            />
          )}

          {/* Video Codec / Stream Error Diagnostic Card (fallback for runtime <video> MediaError) */}
          {videoError && !codecDiagnostic && !isChunkedAvi && (
            <div className="absolute inset-0 z-30 bg-slate-900/95 text-white flex flex-col items-center justify-center p-6 text-center select-text">
              <AlertCircle className="w-10 h-10 text-amber-400 mb-2 animate-pulse" />
              <h4 className="font-bold text-sm mb-1 text-white">Video Stream Codec Notice</h4>
              <p className="text-xs text-slate-300 max-w-lg mb-2 leading-relaxed">
                {videoError}
              </p>

              {/* 1-Click Transcode Command Box */}
              <div className="bg-slate-800 border border-slate-700 rounded-[3px] p-2.5 max-w-md w-full mb-3 text-left">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-slate-300 font-bold">1-Click FFmpeg Transcode Command:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const baseName = fileName ? fileName.replace(/\.[^/.]+$/, '') : 'input';
                      const cmd = `ffmpeg -i "${fileName || 'input.avi'}" -c:v libx264 -preset fast -crf 18 -g 1 -pix_fmt yuv420p "${baseName}_allintra.mp4"`;
                      navigator.clipboard.writeText(cmd);
                      setCopiedFixCmd(true);
                      setTimeout(() => setCopiedFixCmd(false), 2200);
                    }}
                    className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 font-sans cursor-pointer"
                  >
                    {copiedFixCmd ? (
                      <span className="text-emerald-400 font-bold">Copied to Clipboard!</span>
                    ) : (
                      <span>Copy Fix Command</span>
                    )}
                  </button>
                </div>
                <code className="text-[10px] font-mono text-emerald-400 block break-all select-all">
                  ffmpeg -i &quot;{fileName || 'input.avi'}&quot; -c:v libx264 -preset fast -crf 18 -g 1 -pix_fmt yuv420p &quot;{fileName ? fileName.replace(/\.[^/.]+$/, '') : 'input'}_allintra.mp4&quot;
                </code>
              </div>

              {/* Navigation Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => hiddenFileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#1e3a5f] hover:bg-[#2a4d7d] text-white text-xs font-semibold rounded-[2px] transition-colors cursor-pointer"
                >
                  Choose Another Video
                </button>
                {onOpenFormatsModal && (
                  <button
                    type="button"
                    onClick={() => onOpenFormatsModal('video-prep')}
                    className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold rounded-[2px] transition-colors cursor-pointer"
                  >
                    Video Preparation Tips (FFmpeg)
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Canvas Overlay for tracking and drawings */}
          <canvas
            ref={canvasRef}
            width={canvasSize.width}
            height={canvasSize.height}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              setMouseCoord(null);
              setDragTarget(null);
              if (isPanning) setIsPanning(false);
              if (pointerGestureRef.current) pointerGestureRef.current = null;
            }}
            className="absolute inset-0 w-full h-full"
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              cursor: isPanning
                ? 'grabbing'
                : isShiftPressed || !requireShiftToMark
                ? 'crosshair'
                : 'grab',
              imageRendering: zoom >= 3.0 ? 'pixelated' : 'auto',
            }}
          />
        </div>
      </div>

      {/* MIL-STD Slate Bottom Media Controller Bar */}
      <div id="video-control-bar" className="bg-[#F1F3F5] border-t border-[#CBD5E1] px-3 py-1.5 flex flex-col gap-1.5 select-none">
        {/* Timeline Scrubber with Marked Steps Indicators */}
        <div className="relative w-full flex items-center gap-2">
          {/* Direct Frame Input */}
          <div className="flex items-center gap-0.5 text-[11px] font-mono font-semibold text-[#1E293B]">
            <span className="text-[#64748B]">F:</span>
            <input
              id="direct-frame-input"
              type="number"
              min={clip.startFrame}
              max={clip.endFrame}
              value={currentFrame}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                if (!isNaN(val) && val >= clip.startFrame && val <= clip.endFrame) {
                  onFrameChange(val);
                }
              }}
              className="w-14 px-1 py-0.5 rounded-[2px] border border-[#CBD5E1] bg-white text-[#1E293B] font-bold text-center outline-none"
              title="Direct frame jump"
            />
          </div>

          {/* Scrubber Track with Visual Data-Point Ticks */}
          <div className="relative flex-1 flex items-center h-4">
            {/* Background track */}
            <div className="absolute inset-x-0 h-2 bg-[#CBD5E1] border border-[#94A3B8] rounded-[2px] overflow-hidden pointer-events-none">
              <div className="absolute inset-0 bg-[#E2E8F0]" />
            </div>

            {/* Marked points ticks */}
            <div className="absolute inset-x-2 h-2 pointer-events-none z-1">
              {activeTrack?.steps.map((step) => {
                const totalSpan = Math.max(1, clip.endFrame - clip.startFrame);
                const pct = ((step.frame - clip.startFrame) / totalSpan) * 100;
                if (pct < 0 || pct > 100) return null;
                return (
                  <span
                    key={step.frame}
                    className="absolute top-0 bottom-0 w-1 bg-[#2563EB] rounded-none opacity-95"
                    style={{ left: `${pct}%` }}
                    title={`Marked at Frame ${step.frame}`}
                  />
                );
              })}
            </div>

            {/* Native slider input overlay */}
            <input
              id="video-frame-slider"
              type="range"
              min={clip.startFrame}
              max={Math.max(clip.startFrame, clip.endFrame)}
              step={1}
              value={Math.min(Math.max(currentFrame, clip.startFrame), Math.max(clip.startFrame, clip.endFrame))}
              disabled={isSingleFrameSource}
              onChange={(e) => {
                if (videoRef.current && !videoRef.current.paused) {
                  videoRef.current.pause();
                  setIsPlaying(false);
                }
                const next = parseInt(e.target.value, 10);
                if (Number.isFinite(next)) onFrameChange(next);
              }}
              className="w-full h-2 bg-transparent rounded-[2px] appearance-none cursor-pointer disabled:opacity-45 disabled:cursor-default focus:outline-none z-2"
            />
          </div>

          {/* Time readout */}
          <div className="flex items-center gap-1.5 text-[11px] font-mono font-semibold text-[#1E293B] shrink-0">
            <span className="text-right text-[#2563EB] font-bold">
              {formatHighSpeedTime(currentTime, clip.fps, clip.timeUnit)}
            </span>
            <span className="text-[10px] text-[#64748B]">
              ({currentTime >= 1 ? `${currentTime.toFixed(3)}s` : `${(currentTime * 1000).toFixed(2)}ms`})
            </span>
          </div>
        </div>

        {/* Playback Controls & Utilities Row */}
        <div className="flex items-center justify-between">
          {/* Left: Playback Controls (|◄, ◄, Play, ►, ►|, Loop) */}
          <div className="flex items-center gap-1">
            <button
              id="btn-first-frame"
              type="button"
              onClick={handleJumpStart}
              disabled={isSingleFrameSource}
              className="p-1.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 disabled:pointer-events-none text-[#1E293B] border border-[#CBD5E1] transition-colors active:scale-95 cursor-pointer"
              title="Jump to Start Frame (Home)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-prev-frame"
              type="button"
              onClick={handleStepPrev}
              disabled={isSingleFrameSource}
              className="p-1.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 disabled:pointer-events-none text-[#1E293B] border border-[#CBD5E1] transition-colors active:scale-95 cursor-pointer"
              title="Step Backward (← Left Arrow)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              id="btn-play-pause"
              type="button"
              onClick={handleTogglePlay}
              disabled={isSingleFrameSource}
              className="px-3 py-1 rounded-[3px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-45 disabled:pointer-events-none text-white font-semibold text-xs flex items-center gap-1 transition-all border border-[#1D4ED8] active:scale-95 cursor-pointer"
              title={isSingleFrameSource ? 'Single-frame image source' : isPlaying ? 'Pause video (Space)' : 'Play video (Space)'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isSingleFrameSource ? 'Still' : isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              id="btn-next-frame"
              type="button"
              onClick={handleStepNext}
              className="p-1.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] text-[#1E293B] border border-[#CBD5E1] transition-colors active:scale-95 cursor-pointer"
              title="Step Forward (→ Right Arrow)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              id="btn-last-frame"
              type="button"
              onClick={handleJumpEnd}
              className="p-1.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] text-[#1E293B] border border-[#CBD5E1] transition-colors active:scale-95 cursor-pointer"
              title="Jump to End Frame (End)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              id="btn-toggle-loop"
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-1.5 rounded-[3px] border transition-all active:scale-95 cursor-pointer ${
                isLooping
                  ? 'bg-[#2563EB] text-white border-[#1D4ED8] font-semibold'
                  : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#E2E8F0]'
              }`}
              title="Toggle Playback Loop"
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Undo, Redo, Point Nudge, Point deletion & playback speed */}
          <div className="flex items-center gap-1.5 text-xs">
            {activeStep && onNudgeCurrentPoint && (
              <div
                className="hidden sm:flex items-center gap-0.5 bg-white border border-[#CBD5E1] rounded-[3px] px-1 py-0.5 text-[10px] font-mono text-[#334155]"
                title="Fine sub-pixel point nudge (±0.5px, or hold Shift for ±0.1px; also Alt+Arrow keys)"
              >
                <span className="text-[#64748B] px-0.5">Nudge:</span>
                <button
                  type="button"
                  onClick={(e) => onNudgeCurrentPoint(e.shiftKey ? -0.1 : -0.5, 0)}
                  className="px-1 hover:bg-[#E2E8F0] rounded-[2px] font-bold cursor-pointer"
                  title="Nudge Left (-0.5px, Shift: -0.1px)"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={(e) => onNudgeCurrentPoint(e.shiftKey ? 0.1 : 0.5, 0)}
                  className="px-1 hover:bg-[#E2E8F0] rounded-[2px] font-bold cursor-pointer"
                  title="Nudge Right (+0.5px, Shift: +0.1px)"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={(e) => onNudgeCurrentPoint(0, e.shiftKey ? -0.1 : -0.5)}
                  className="px-1 hover:bg-[#E2E8F0] rounded-[2px] font-bold cursor-pointer"
                  title="Nudge Up (-0.5px, Shift: -0.1px)"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={(e) => onNudgeCurrentPoint(0, e.shiftKey ? 0.1 : 0.5)}
                  className="px-1 hover:bg-[#E2E8F0] rounded-[2px] font-bold cursor-pointer"
                  title="Nudge Down (+0.5px, Shift: +0.1px)"
                >
                  ↓
                </button>
              </div>
            )}

            {onUndoLastPoint && (
              <button
                id="btn-transport-undo"
                type="button"
                onClick={onUndoLastPoint}
                disabled={canUndo !== undefined ? !canUndo : (!activeTrack || activeTrack.steps.length === 0)}
                className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 disabled:pointer-events-none text-[#1E293B] border border-[#CBD5E1] transition-colors text-[11px] font-semibold cursor-pointer"
                title={`Undo (Ctrl+Z)${undoCount > 0 ? ` • ${undoCount} action(s)` : ''}`}
              >
                <Undo2 className="w-3 h-3 text-[#2563EB]" />
                <span>Undo</span>
              </button>
            )}

            {onRedoLastPoint && (
              <button
                id="btn-transport-redo"
                type="button"
                onClick={onRedoLastPoint}
                disabled={!canRedo}
                className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 disabled:pointer-events-none text-[#1E293B] border border-[#CBD5E1] transition-colors text-[11px] font-semibold cursor-pointer"
                title={`Redo (Ctrl+Y / Ctrl+Shift+Z)${redoCount > 0 ? ` • ${redoCount} action(s)` : ''}`}
              >
                <Redo2 className="w-3 h-3 text-[#2563EB]" />
                <span>Redo</span>
              </button>
            )}

            {activeStep && (
              <button
                id="btn-delete-frame-point"
                type="button"
                onClick={() => onDeleteCurrentPoint(currentFrame)}
                className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-white hover:bg-red-50 text-[#DC2626] border border-[#CBD5E1] transition-colors text-[11px] font-semibold cursor-pointer"
                title="Delete tracking point at current frame (Del)"
              >
                <Trash className="w-3 h-3" />
                <span>Delete mark (F:{currentFrame})</span>
              </button>
            )}

            <div className="flex items-center gap-1 bg-white border border-[#CBD5E1] rounded-[3px] px-2 py-0.5 text-[11px]">
              <span className="text-[#64748B] font-semibold">Rate:</span>
              <select
                id="playback-rate-select"
                value={playbackRate}
                onChange={(e) => handlePlaybackRateChange(parseFloat(e.target.value))}
                className="bg-transparent text-[#1E293B] font-bold focus:outline-none cursor-pointer"
              >
                <option value={0.1} className="bg-white">0.1x</option>
                <option value={0.25} className="bg-white">0.25x</option>
                <option value={0.5} className="bg-white">0.5x</option>
                <option value={1.0} className="bg-white">1.0x</option>
              </select>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
