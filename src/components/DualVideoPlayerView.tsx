import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Track,
  PointStep,
  Calibration,
  CoordinateAxes,
  ClipSettings,
  TriangulationConfig,
} from '../types';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  Volume2,
  Camera,
  Maximize2,
  Sliders,
  Crosshair,
  CheckCircle2,
  Upload,
  Undo2,
  Redo2,
  Trash,
  AlertCircle,
  Film,
  Clock,
  Sparkles,
  Activity,
  Repeat,
  Ruler,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  triangulateDLT,
  buildDefaultDLT,
  calculateMultiRateFrameRatio,
  interpolateCameraCoordinates,
} from '../utils/triangulation';
import {
  mapCam1ToCam2,
  mapCam2ToCam1,
  evaluateStereoSync,
  formatStereoTime,
} from '../utils/stereoSync';
import { ACCEPTED_VIDEO_ACCEPT_STRING, normalizeVideoUrl } from '../utils/videoFormats';
import { formatHighSpeedTime } from '../utils/highSpeedCameras';
import { mediaDiagnostics } from '../utils/mediaDiagnostics';
import { AviHighSpeedLoader } from '../video/aviHighSpeedLoader';

import { FormatsModalTab } from './SupportedFormatsModal';

interface DualVideoPlayerViewProps {
  tracks: Track[];
  activeTrackId: string;
  onAddPoint3D: (step: PointStep) => void;
  onDeletePoint: (frame: number) => void;
  clip: ClipSettings;
  onUpdateClip: (clip: Partial<ClipSettings>) => void;
  triangulation: TriangulationConfig;
  onUpdateTriangulation: (tri: Partial<TriangulationConfig>) => void;
  currentFrame: number;
  onFrameChange: (frame: number) => void;
  videoUrlCam1?: string;
  videoUrlCam2?: string;
  aviLoaderCam1?: AviHighSpeedLoader | null;
  aviLoaderCam2?: AviHighSpeedLoader | null;
  onUploadCam1?: (file: File) => void;
  onUploadCam2?: (file: File) => void;
  showTrails?: boolean;
  showVectors?: boolean;
  showLoupe?: boolean;
  autoAdvance?: boolean;
  requireShiftToMark?: boolean;
  onUndoLastPoint?: () => void;
  onRedoLastPoint?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoCount?: number;
  redoCount?: number;
  onBeginHistoryAction?: (label: string) => void;
  onNudgeCurrentPoint?: (dpx: number, dpy: number, targetCam?: 1 | 2) => void;
  onOpenFormatsModal?: (tab?: FormatsModalTab) => void;
  onOpenTriangulationModal?: () => void;
  onRegisterSnapshotGetter?: (getter: () => string | null) => void;
  calibration?: Calibration;
}

type DualLayout = 'side-by-side' | 'cam1-focus' | 'cam2-focus';

export const DualVideoPlayerView: React.FC<DualVideoPlayerViewProps> = ({
  tracks,
  activeTrackId,
  onAddPoint3D,
  onDeletePoint,
  clip,
  onUpdateClip,
  triangulation,
  onUpdateTriangulation,
  currentFrame,
  onFrameChange,
  videoUrlCam1,
  videoUrlCam2,
  aviLoaderCam1 = null,
  aviLoaderCam2 = null,
  onUploadCam1,
  onUploadCam2,
  showTrails = true,
  showVectors = true,
  showLoupe = false,
  autoAdvance = true,
  requireShiftToMark = true,
  onUndoLastPoint,
  onRedoLastPoint,
  canUndo,
  canRedo = false,
  undoCount = 0,
  redoCount = 0,
  onBeginHistoryAction,
  onNudgeCurrentPoint,
  onOpenFormatsModal,
  onOpenTriangulationModal,
  onRegisterSnapshotGetter,
  calibration,
}) => {
  // Video, Canvas, Container, and Input references
  const containerRefCam1 = useRef<HTMLDivElement | null>(null);
  const containerRefCam2 = useRef<HTMLDivElement | null>(null);
  const videoRefCam1 = useRef<HTMLVideoElement | null>(null);
  const videoRefCam2 = useRef<HTMLVideoElement | null>(null);
  const canvasRefCam1 = useRef<HTMLCanvasElement | null>(null);
  const canvasRefCam2 = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputCam1Ref = useRef<HTMLInputElement | null>(null);
  const fileInputCam2Ref = useRef<HTMLInputElement | null>(null);
  const aviBitmapCam1Ref = useRef<ImageBitmap | null>(null);
  const aviImageDataCam1Ref = useRef<ImageData | null>(null);
  const aviBitmapCam2Ref = useRef<ImageBitmap | null>(null);
  const aviImageDataCam2Ref = useRef<ImageData | null>(null);
  const isChunkedCam1 = Boolean(aviLoaderCam1 && aviLoaderCam1.metadata);
  const isChunkedCam2 = Boolean(aviLoaderCam2 && aviLoaderCam2.metadata);

  // Layout & Controls State
  const [dualLayout, setDualLayout] = useState<DualLayout>('side-by-side');
  // Requirement 1: Three distinct playback modes
  const [isPlayingBoth, setIsPlayingBoth] = useState<boolean>(false);
  const [isPlayingCam1, setIsPlayingCam1] = useState<boolean>(false);
  const [isPlayingCam2, setIsPlayingCam2] = useState<boolean>(false);
  const isAnyPlaying = isPlayingBoth || isPlayingCam1 || isPlayingCam2;

  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const lastReportedFrameRef = useRef<number>(currentFrame);
  const [activeCameraHover, setActiveCameraHover] = useState<'cam1' | 'cam2' | null>(null);
  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number } | null>(null);
  const [canvasSizeCam1, setCanvasSizeCam1] = useState<{ width: number; height: number }>({ width: 640, height: 480 });
  const [canvasSizeCam2, setCanvasSizeCam2] = useState<{ width: number; height: number }>({ width: 640, height: 480 });
  const [isShiftPressed, setIsShiftPressed] = useState<boolean>(false);
  const [showShiftWarning, setShowShiftWarning] = useState<boolean>(false);
  const [isDraggingCam1, setIsDraggingCam1] = useState<boolean>(false);
  const [isDraggingCam2, setIsDraggingCam2] = useState<boolean>(false);
  const [cam1Error, setCam1Error] = useState<string | null>(null);
  const [cam2Error, setCam2Error] = useState<string | null>(null);
  const [showSyncPopover, setShowSyncPopover] = useState<boolean>(false);

  // Multi-Rate Camera Timing & Anchor-based Synchronization (Requirements 2 & 3)
  const fpsCam1 = triangulation.fpsCam1 || clip.fps || 30;
  const fpsCam2 = triangulation.fpsCam2 || triangulation.fpsCam1 || clip.fps || 30;
  const anchorCam1 = triangulation.syncConfig?.anchorFrameCam1 ?? (triangulation.syncConfig as any)?.anchorCam1Frame ?? 0;
  const anchorCam2 = triangulation.syncConfig?.anchorFrameCam2 ?? (triangulation.syncConfig as any)?.anchorCam2Frame ?? 0;
  const syncToleranceSec = triangulation.syncConfig?.toleranceSec ?? (triangulation.syncConfig as any)?.syncToleranceSeconds ?? 0.005;

  const endFrameCam2 = (triangulation as any).clipCam2?.endFrame || Math.max(100, Math.round(clip.endFrame * (fpsCam2 / fpsCam1)));

  const warningTimerRef = useRef<any>(null);
  const isMultiRate = Math.abs(fpsCam1 - fpsCam2) > 0.01;
  const ratioInfo = calculateMultiRateFrameRatio(fpsCam1, fpsCam2);

  // Independent Cam 2 current frame state
  const idealFrameCam2 = mapCam1ToCam2(currentFrame, anchorCam1, anchorCam2, fpsCam1, fpsCam2, endFrameCam2 + 1).frameCam2;
  const [currentFrameCam2, setCurrentFrameCam2] = useState<number>(idealFrameCam2);

  // Synchronize Cam 2 frame to Cam 1 when playing both or scrubbing Cam 1
  useEffect(() => {
    if (!isPlayingCam2) {
      setCurrentFrameCam2(mapCam1ToCam2(currentFrame, anchorCam1, anchorCam2, fpsCam1, fpsCam2, endFrameCam2 + 1).frameCam2);
    }
  }, [currentFrame, fpsCam1, fpsCam2, anchorCam1, anchorCam2, endFrameCam2, isPlayingCam2]);

  // Evaluate stereo sync status
  const syncStatus = evaluateStereoSync(
    currentFrame,
    currentFrameCam2,
    {
      anchorFrameCam1: anchorCam1,
      anchorFrameCam2: anchorCam2,
      fpsCam1,
      fpsCam2,
      toleranceSec: syncToleranceSec,
      playbackMaster: triangulation.syncConfig?.playbackMaster || 'both',
    }
  );

  const timeCam1 = currentFrame / fpsCam1;
  const timeCam2 = currentFrameCam2 / fpsCam2;
  const masterTime = currentFrame / fpsCam1;

  // Decoupled container playback rate (e.g. 30fps container for high-speed sensor)
  const containerFps1 = clip.playbackFps || (fpsCam1 > 240 ? 30 : fpsCam1);
  const containerFps2 = (triangulation as any).clipCam2?.playbackFps || clip.playbackFps || (fpsCam2 > 240 ? 30 : fpsCam2);

  // Interactive 3D Calibration Sticks (Requirement 4: separate endpoints, length, scale)
  const [calStickCam1, setCalStickCam1] = useState<{
    visible: boolean;
    pointA: { x: number; y: number };
    pointB: { x: number; y: number };
    realLength: number;
  }>({
    visible: triangulation.calibrationCam1?.visible ?? false,
    pointA: triangulation.calibrationCam1?.pointA ?? { x: 140, y: 220 },
    pointB: triangulation.calibrationCam1?.pointB ?? {
      x: 140 + Math.max(30, Math.round((triangulation.pixelsPerMeterCam1 || 240) * 0.10)),
      y: 220,
    },
    realLength: triangulation.calibrationCam1?.realLength ?? 0.10,
  });

  const [calStickCam2, setCalStickCam2] = useState<{
    visible: boolean;
    pointA: { x: number; y: number };
    pointB: { x: number; y: number };
    realLength: number;
  }>({
    visible: triangulation.calibrationCam2?.visible ?? false,
    pointA: triangulation.calibrationCam2?.pointA ?? { x: 140, y: 220 },
    pointB: triangulation.calibrationCam2?.pointB ?? {
      x: 140 + Math.max(30, Math.round((triangulation.pixelsPerMeterCam2 || 240) * 0.10)),
      y: 220,
    },
    realLength: triangulation.calibrationCam2?.realLength ?? 0.10,
  });

  const [dragStickTarget, setDragStickTarget] = useState<{
    camId: 'cam1' | 'cam2';
    type: 'ptA' | 'ptB' | 'origin' | 'point';
    frame?: number;
  } | null>(null);

  // Independent Viewport Zoom & Pan state for Camera 1 and Camera 2 (0.25x to 24.0x)
  const [zoomCam1, setZoomCam1] = useState<number>(1);
  const [panCam1, setPanCam1] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningCam1, setIsPanningCam1] = useState<boolean>(false);
  const panStartCam1Ref = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [zoomCam2, setZoomCam2] = useState<number>(1);
  const [panCam2, setPanCam2] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isPanningCam2, setIsPanningCam2] = useState<boolean>(false);
  const panStartCam2Ref = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
  const pointerGestureRef = useRef<{
    active: boolean;
    camId: 'cam1' | 'cam2';
    startClientX: number;
    startClientY: number;
    startPanX: number;
    startPanY: number;
    moved: boolean;
  } | null>(null);

  const resetZoomAndPanCam1 = useCallback((targetZoom?: number) => {
    const container = containerRefCam1.current;
    if (!container) return;
    const contW = container.clientWidth;
    const contH = container.clientHeight;
    const mediaW = canvasSizeCam1.width;
    const mediaH = canvasSizeCam1.height;
    if (contW === 0 || contH === 0 || mediaW === 0 || mediaH === 0) return;
    const availW = Math.max(80, contW - 16);
    const availH = Math.max(80, contH - 16);
    const fitZoom = Math.min(1, availW / mediaW, availH / mediaH);
    const finalZoom = targetZoom !== undefined ? targetZoom : Math.max(0.25, Number(fitZoom.toFixed(3)));
    setZoomCam1(finalZoom);
    setPanCam1({
      x: (contW - mediaW * finalZoom) / 2,
      y: (contH - mediaH * finalZoom) / 2,
    });
  }, [canvasSizeCam1]);

  const resetZoomAndPanCam2 = useCallback((targetZoom?: number) => {
    const container = containerRefCam2.current;
    if (!container) return;
    const contW = container.clientWidth;
    const contH = container.clientHeight;
    const mediaW = canvasSizeCam2.width;
    const mediaH = canvasSizeCam2.height;
    if (contW === 0 || contH === 0 || mediaW === 0 || mediaH === 0) return;
    const availW = Math.max(80, contW - 16);
    const availH = Math.max(80, contH - 16);
    const fitZoom = Math.min(1, availW / mediaW, availH / mediaH);
    const finalZoom = targetZoom !== undefined ? targetZoom : Math.max(0.25, Number(fitZoom.toFixed(3)));
    setZoomCam2(finalZoom);
    setPanCam2({
      x: (contW - mediaW * finalZoom) / 2,
      y: (contH - mediaH * finalZoom) / 2,
    });
  }, [canvasSizeCam2]);

  useEffect(() => {
    resetZoomAndPanCam1();
  }, [canvasSizeCam1.width, canvasSizeCam1.height, videoUrlCam1, dualLayout, resetZoomAndPanCam1]);

  useEffect(() => {
    resetZoomAndPanCam2();
  }, [canvasSizeCam2.width, canvasSizeCam2.height, videoUrlCam2, dualLayout, resetZoomAndPanCam2]);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    let raf1: number | null = null;
    let raf2: number | null = null;
    const ro1 = new ResizeObserver(() => {
      if (raf1 !== null) cancelAnimationFrame(raf1);
      raf1 = requestAnimationFrame(() => resetZoomAndPanCam1());
    });
    const ro2 = new ResizeObserver(() => {
      if (raf2 !== null) cancelAnimationFrame(raf2);
      raf2 = requestAnimationFrame(() => resetZoomAndPanCam2());
    });
    if (containerRefCam1.current) ro1.observe(containerRefCam1.current);
    if (containerRefCam2.current) ro2.observe(containerRefCam2.current);
    return () => {
      if (raf1 !== null) cancelAnimationFrame(raf1);
      if (raf2 !== null) cancelAnimationFrame(raf2);
      ro1.disconnect();
      ro2.disconnect();
    };
  }, [resetZoomAndPanCam1, resetZoomAndPanCam2, dualLayout]);

  // Monitor Shift, Space, and 'F' (Fit to Viewport) keys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.code === 'Space') setIsSpacePressed(true);
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        resetZoomAndPanCam1();
        resetZoomAndPanCam2();
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
  }, [resetZoomAndPanCam1, resetZoomAndPanCam2]);

  const handleWheelCamera = (e: React.WheelEvent, camId: 'cam1' | 'cam2') => {
    e.preventDefault();
    e.stopPropagation();
    const container = camId === 'cam1' ? containerRefCam1.current : containerRefCam2.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.18 : 1 / 1.18;

    if (camId === 'cam1') {
      const newZoom = Math.min(24.0, Math.max(0.25, Number((zoomCam1 * factor).toFixed(4))));
      setPanCam1({
        x: mouseX - (mouseX - panCam1.x) * (newZoom / zoomCam1),
        y: mouseY - (mouseY - panCam1.y) * (newZoom / zoomCam1),
      });
      setZoomCam1(newZoom);
    } else {
      const newZoom = Math.min(24.0, Math.max(0.25, Number((zoomCam2 * factor).toFixed(4))));
      setPanCam2({
        x: mouseX - (mouseX - panCam2.x) * (newZoom / zoomCam2),
        y: mouseY - (mouseY - panCam2.y) * (newZoom / zoomCam2),
      });
      setZoomCam2(newZoom);
    }
  };

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0] || {
    id: 'default',
    name: 'Point Mass A',
    color: '#3b82f6',
    mass: 0.1,
    steps: [],
  };
  const steps = activeTrack.steps || [];
  const currentStep = steps.find((s) => s.frame === currentFrame);

  // Sync calibration sticks with independent camera calibration state without cross-over
  useEffect(() => {
    if (triangulation.calibrationCam1) {
      setCalStickCam1((prev) => ({
        ...prev,
        visible: triangulation.calibrationCam1?.visible ?? prev.visible,
        realLength: triangulation.calibrationCam1?.realLength ?? prev.realLength,
        pointA: triangulation.calibrationCam1?.pointA ?? prev.pointA,
        pointB: triangulation.calibrationCam1?.pointB ?? prev.pointB,
      }));
    } else if (calibration) {
      setCalStickCam1((prev) => ({
        ...prev,
        visible: calibration.visible,
        realLength: calibration.realLength,
      }));
    }
    if (triangulation.calibrationCam2) {
      setCalStickCam2((prev) => ({
        ...prev,
        visible: triangulation.calibrationCam2?.visible ?? prev.visible,
        realLength: triangulation.calibrationCam2?.realLength ?? prev.realLength,
        pointA: triangulation.calibrationCam2?.pointA ?? prev.pointA,
        pointB: triangulation.calibrationCam2?.pointB ?? prev.pointB,
      }));
    }
  }, [triangulation.calibrationCam1, triangulation.calibrationCam2, calibration]);

  // Global mouseup release so calibration drag handle and panning never stick
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setDragStickTarget(null);
      setIsPanningCam1(false);
      setIsPanningCam2(false);
      pointerGestureRef.current = null;
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, []);

  // Snapshot capture for field reports
  const captureSnapshot = useCallback((): string | null => {
    const canvas = canvasRefCam1.current;
    if (!canvas) return null;
    const offscreen = document.createElement('canvas');
    offscreen.width = canvas.width;
    offscreen.height = canvas.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) return null;

    if (videoRefCam1.current && videoRefCam1.current.readyState >= 2) {
      try {
        ctx.drawImage(videoRefCam1.current, 0, 0, canvas.width, canvas.height);
      } catch {
        // ignore
      }
    }
    ctx.drawImage(canvas, 0, 0);

    try {
      return offscreen.toDataURL('image/png');
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    onRegisterSnapshotGetter?.(captureSnapshot);
  }, [captureSnapshot, onRegisterSnapshotGetter]);

  // Video Loaded Metadata Handlers
  const handleLoadedMetadataCam1 = useCallback(() => {
    const v = videoRefCam1.current;
    if (!v) return;
    setCam1Error(null);
    v.muted = true;
    v.defaultMuted = true;
    mediaDiagnostics.logEvent('cam1', 'loadedmetadata', v);

    const width = v.videoWidth || 640;
    const height = v.videoHeight || 480;
    setCanvasSizeCam1({ width, height });

    const dur = v.duration;
    if (Number.isFinite(dur) && dur > 0) {
      const calculatedFrames = Math.max(10, Math.round(dur * clip.fps));
      onUpdateClip({
        totalFrames: calculatedFrames,
        endFrame: calculatedFrames - 1,
      });
    }
  }, [clip.fps, onUpdateClip]);

  const handleLoadedMetadataCam2 = useCallback(() => {
    const v = videoRefCam2.current;
    if (!v) return;
    setCam2Error(null);
    v.muted = true;
    v.defaultMuted = true;
    mediaDiagnostics.logEvent('cam2', 'loadedmetadata', v);

    const width = v.videoWidth || 640;
    const height = v.videoHeight || 480;
    setCanvasSizeCam2({ width, height });
  }, []);

  // Requirement 1: Authoritative Play/Pause Toggles for Play Both, Play Cam 1, Play Cam 2
  const handleTogglePlayBoth = useCallback(() => {
    const v1 = videoRefCam1.current;
    const v2 = videoRefCam2.current;

    if (isPlayingBoth) {
      if (v1) v1.pause();
      if (v2) v2.pause();
      setIsPlayingBoth(false);
      mediaDiagnostics.stopInvariantTracking('cam1');
      mediaDiagnostics.stopInvariantTracking('cam2');
    } else {
      setIsPlayingCam1(false);
      setIsPlayingCam2(false);

      if (v1 && videoUrlCam1) {
        v1.playbackRate = playbackSpeed;
        if (currentFrame >= clip.endFrame || v1.ended) {
          v1.currentTime = Math.max(0.001, clip.startFrame / containerFps1);
        }
        v1.play().catch(() => {});
        mediaDiagnostics.startInvariantTracking('cam1', v1.currentTime, playbackSpeed);
      }

      if (v2 && videoUrlCam2) {
        const targetFrame2 = mapCam1ToCam2(currentFrame, anchorCam1, anchorCam2, fpsCam1, fpsCam2, endFrameCam2 + 1).frameCam2;
        v2.playbackRate = playbackSpeed * (fpsCam2 / fpsCam1);
        try {
          v2.currentTime = Math.max(0.001, targetFrame2 / containerFps2);
        } catch {
          // ignore
        }
        v2.play().catch(() => {});
        mediaDiagnostics.startInvariantTracking('cam2', v2.currentTime, playbackSpeed * (fpsCam2 / fpsCam1));
      }

      setIsPlayingBoth(true);
    }
  }, [
    isPlayingBoth,
    videoUrlCam1,
    videoUrlCam2,
    playbackSpeed,
    currentFrame,
    clip.endFrame,
    clip.startFrame,
    containerFps1,
    containerFps2,
    fpsCam1,
    fpsCam2,
    anchorCam1,
    anchorCam2,
  ]);

  const handleTogglePlayCam1 = useCallback(() => {
    const v1 = videoRefCam1.current;
    const v2 = videoRefCam2.current;

    if (isPlayingCam1) {
      if (v1) v1.pause();
      setIsPlayingCam1(false);
      mediaDiagnostics.stopInvariantTracking('cam1');
    } else {
      if (v2) v2.pause();
      setIsPlayingBoth(false);
      setIsPlayingCam2(false);

      if (v1 && videoUrlCam1) {
        v1.playbackRate = playbackSpeed;
        if (currentFrame >= clip.endFrame || v1.ended) {
          v1.currentTime = Math.max(0.001, clip.startFrame / containerFps1);
        }
        v1.play().catch(() => {});
        mediaDiagnostics.startInvariantTracking('cam1', v1.currentTime, playbackSpeed);
      }
      setIsPlayingCam1(true);
    }
  }, [isPlayingCam1, videoUrlCam1, playbackSpeed, currentFrame, clip.endFrame, clip.startFrame, containerFps1]);

  const handleTogglePlayCam2 = useCallback(() => {
    const v1 = videoRefCam1.current;
    const v2 = videoRefCam2.current;

    if (isPlayingCam2) {
      if (v2) v2.pause();
      setIsPlayingCam2(false);
      mediaDiagnostics.stopInvariantTracking('cam2');
    } else {
      if (v1) v1.pause();
      setIsPlayingBoth(false);
      setIsPlayingCam1(false);

      if (v2 && videoUrlCam2) {
        v2.playbackRate = playbackSpeed;
        if (currentFrameCam2 >= endFrameCam2 || v2.ended) {
          v2.currentTime = Math.max(0.001, 0);
        }
        v2.play().catch(() => {});
        mediaDiagnostics.startInvariantTracking('cam2', v2.currentTime, playbackSpeed);
      }
      setIsPlayingCam2(true);
    }
  }, [isPlayingCam2, videoUrlCam2, playbackSpeed, currentFrameCam2, endFrameCam2]);

  const handlePlaybackSpeedChange = useCallback(
    (newSpeed: number) => {
      setPlaybackSpeed(newSpeed);
      const v1 = videoRefCam1.current;
      const v2 = videoRefCam2.current;
      if (v1) {
        v1.playbackRate = newSpeed;
      }
      if (v2) {
        v2.playbackRate = isPlayingBoth ? newSpeed * (fpsCam2 / fpsCam1) : newSpeed;
      }
    },
    [isPlayingBoth, fpsCam1, fpsCam2]
  );

  // Synchronized Play Both RAF Loop
  useEffect(() => {
    if (!isPlayingBoth || !videoUrlCam1) return;

    let rafId: number;
    const monitorLoop = () => {
      const v1 = videoRefCam1.current;
      const v2 = videoRefCam2.current;
      if (!v1) return;

      if (v1.paused && !v1.seeking && isPlayingBoth) {
        if (v1.ended || v1.currentTime >= (v1.duration || 1) - 0.05) {
          if (isLooping) {
            v1.currentTime = Math.max(0.001, clip.startFrame / containerFps1);
            v1.play().catch(() => {});
            if (v2) {
              const resetF2 = mapCam1ToCam2(clip.startFrame, anchorCam1, anchorCam2, fpsCam1, fpsCam2, endFrameCam2 + 1).frameCam2;
              v2.currentTime = Math.max(0.001, resetF2 / containerFps2);
              v2.play().catch(() => {});
            }
          } else {
            v1.pause();
            if (v2) v2.pause();
            setIsPlayingBoth(false);
            return;
          }
        }
      }

      const mediaTime = v1.currentTime;
      const derivedFrame = Math.min(
        clip.endFrame,
        Math.max(clip.startFrame, Math.floor(mediaTime * containerFps1))
      );

      if (derivedFrame !== lastReportedFrameRef.current) {
        lastReportedFrameRef.current = derivedFrame;
        onFrameChange(derivedFrame);
        const mappedCam2 = mapCam1ToCam2(derivedFrame, anchorCam1, anchorCam2, fpsCam1, fpsCam2, endFrameCam2 + 1).frameCam2;
        setCurrentFrameCam2(mappedCam2);
      }

      // Phase lock Cam 2 to synchronized anchor position
      if (v2 && videoUrlCam2 && !v2.seeking && !v1.seeking) {
        const mappedCam2 = mapCam1ToCam2(derivedFrame, anchorCam1, anchorCam2, fpsCam1, fpsCam2, endFrameCam2 + 1).frameCam2;
        const targetCam2Time = Math.max(0.001, mappedCam2 / containerFps2);
        if (Math.abs(v2.currentTime - targetCam2Time) > 0.06) {
          try {
            v2.currentTime = targetCam2Time;
          } catch {
            // ignore
          }
        }
      }

      if (derivedFrame >= clip.endFrame) {
        if (isLooping) {
          v1.currentTime = Math.max(0.001, clip.startFrame / containerFps1);
          v1.play().catch(() => {});
          if (v2) {
            const resetF2 = mapCam1ToCam2(clip.startFrame, anchorCam1, anchorCam2, fpsCam1, fpsCam2, endFrameCam2 + 1).frameCam2;
            v2.currentTime = Math.max(0.001, resetF2 / containerFps2);
            v2.play().catch(() => {});
          }
        } else {
          v1.pause();
          if (v2) v2.pause();
          setIsPlayingBoth(false);
          return;
        }
      }

      rafId = requestAnimationFrame(monitorLoop);
    };

    rafId = requestAnimationFrame(monitorLoop);
    return () => cancelAnimationFrame(rafId);
  }, [
    isPlayingBoth,
    videoUrlCam1,
    videoUrlCam2,
    containerFps1,
    containerFps2,
    clip.startFrame,
    clip.endFrame,
    isLooping,
    playbackSpeed,
    fpsCam1,
    fpsCam2,
    anchorCam1,
    anchorCam2,
    onFrameChange,
  ]);

  // Solo Play Camera 1 Loop
  useEffect(() => {
    if (!isPlayingCam1 || !videoUrlCam1) return;

    let rafId: number;
    const monitorLoopCam1 = () => {
      const v1 = videoRefCam1.current;
      if (!v1) return;

      const mediaTime = v1.currentTime;
      const derivedFrame = Math.min(
        clip.endFrame,
        Math.max(clip.startFrame, Math.floor(mediaTime * containerFps1))
      );

      if (derivedFrame !== lastReportedFrameRef.current) {
        lastReportedFrameRef.current = derivedFrame;
        onFrameChange(derivedFrame);
      }

      if (v1.ended || derivedFrame >= clip.endFrame) {
        if (isLooping) {
          v1.currentTime = Math.max(0.001, clip.startFrame / containerFps1);
          v1.play().catch(() => {});
        } else {
          v1.pause();
          setIsPlayingCam1(false);
          return;
        }
      }

      rafId = requestAnimationFrame(monitorLoopCam1);
    };

    rafId = requestAnimationFrame(monitorLoopCam1);
    return () => cancelAnimationFrame(rafId);
  }, [isPlayingCam1, videoUrlCam1, containerFps1, clip.startFrame, clip.endFrame, isLooping, onFrameChange]);

  // Solo Play Camera 2 Loop
  useEffect(() => {
    if (!isPlayingCam2 || !videoUrlCam2) return;

    let rafId: number;
    const monitorLoopCam2 = () => {
      const v2 = videoRefCam2.current;
      if (!v2) return;

      const mediaTime = v2.currentTime;
      const derivedFrame = Math.min(
        endFrameCam2,
        Math.max(0, Math.floor(mediaTime * containerFps2))
      );

      setCurrentFrameCam2(derivedFrame);

      if (v2.ended || derivedFrame >= endFrameCam2) {
        if (isLooping) {
          v2.currentTime = 0.001;
          v2.play().catch(() => {});
        } else {
          v2.pause();
          setIsPlayingCam2(false);
          return;
        }
      }

      rafId = requestAnimationFrame(monitorLoopCam2);
    };

    rafId = requestAnimationFrame(monitorLoopCam2);
    return () => cancelAnimationFrame(rafId);
  }, [isPlayingCam2, videoUrlCam2, containerFps2, endFrameCam2, isLooping]);

  // Synchronize HTML5 video elements to current physical frame ONLY when paused
  useEffect(() => {
    if (isAnyPlaying) return;
    const seekTime1 = Math.max(0.001, currentFrame / containerFps1);
    const seekTime2 = Math.max(0.001, currentFrameCam2 / containerFps2);

    if (videoRefCam1.current && videoUrlCam1) {
      if (videoRefCam1.current.readyState >= 1) {
        if (Math.abs(videoRefCam1.current.currentTime - seekTime1) > 0.002 || videoRefCam1.current.currentTime === 0) {
          try {
            videoRefCam1.current.currentTime = seekTime1;
          } catch {
            // ignore
          }
        }
      }
    }
    if (videoRefCam2.current && videoUrlCam2) {
      if (videoRefCam2.current.readyState >= 1) {
        if (Math.abs(videoRefCam2.current.currentTime - seekTime2) > 0.002 || videoRefCam2.current.currentTime === 0) {
          try {
            videoRefCam2.current.currentTime = seekTime2;
          } catch {
            // ignore
          }
        }
      }
    }
    lastReportedFrameRef.current = currentFrame;
  }, [currentFrame, currentFrameCam2, containerFps1, containerFps2, videoUrlCam1, videoUrlCam2, isAnyPlaying]);

  // Safe video reload and session reset when videoUrlCam1 changes
  useEffect(() => {
    const v1 = videoRefCam1.current;
    if (v1 && videoUrlCam1) {
      v1.pause();
      setIsPlayingBoth(false);
      setIsPlayingCam1(false);
      mediaDiagnostics.stopInvariantTracking('cam1');
      setCam1Error(null);
      v1.muted = true;
      v1.defaultMuted = true;

      const handleReady = () => {
        mediaDiagnostics.logEvent('cam1', 'loadeddata', v1);
        const targetTime = Math.max(0.001, currentFrame / containerFps1);
        try {
          v1.currentTime = targetTime;
        } catch {
          // ignore
        }
      };

      v1.addEventListener('loadeddata', handleReady, { once: true });
      try {
        v1.load();
      } catch {
        // ignore
      }

      return () => {
        v1.removeEventListener('loadeddata', handleReady);
      };
    }
  }, [videoUrlCam1, containerFps1]);

  // Safe video reload and session reset when videoUrlCam2 changes
  useEffect(() => {
    const v2 = videoRefCam2.current;
    if (v2 && videoUrlCam2) {
      v2.pause();
      setIsPlayingBoth(false);
      setIsPlayingCam2(false);
      mediaDiagnostics.stopInvariantTracking('cam2');
      setCam2Error(null);
      v2.muted = true;
      v2.defaultMuted = true;

      const handleReady = () => {
        mediaDiagnostics.logEvent('cam2', 'loadeddata', v2);
        const targetTime = Math.max(0.001, currentFrameCam2 / containerFps2);
        try {
          v2.currentTime = targetTime;
        } catch {
          // ignore
        }
      };

      v2.addEventListener('loadeddata', handleReady, { once: true });
      try {
        v2.load();
      } catch {
        // ignore
      }

      return () => {
        v2.removeEventListener('loadeddata', handleReady);
      };
    }
  }, [videoUrlCam2, containerFps2, currentFrameCam2]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const v1 = videoRefCam1.current;
      if (v1) {
        v1.pause();
        try {
          v1.removeAttribute('src');
          v1.load();
        } catch {
          // ignore
        }
      }
      const v2 = videoRefCam2.current;
      if (v2) {
        v2.pause();
        try {
          v2.removeAttribute('src');
          v2.load();
        } catch {
          // ignore
        }
      }
      mediaDiagnostics.stopInvariantTracking('cam1');
      mediaDiagnostics.stopInvariantTracking('cam2');
    };
  }, []);

  // Render on Cam 1 & Cam 2 canvases
  const renderOverlay = useCallback(
    (canvas: HTMLCanvasElement | null, camId: 'cam1' | 'cam2') => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;
      const camZoom = camId === 'cam1' ? zoomCam1 : zoomCam2;
      ctx.clearRect(0, 0, width, height);
      ctx.imageSmoothingEnabled = camZoom < 3.0;

      // 0. Paint video frame or Zero-Copy Universal Demuxer frame directly to canvas if present
      if (camId === 'cam1') {
        if (isChunkedCam1 && aviLoaderCam1?.metadata) {
          if (aviBitmapCam1Ref.current) {
            try {
              ctx.drawImage(aviBitmapCam1Ref.current, 0, 0, width, height);
            } catch {
              // ignore
            }
          } else if (aviImageDataCam1Ref.current) {
            try {
              ctx.putImageData(aviImageDataCam1Ref.current, 0, 0);
            } catch {
              // ignore
            }
          }
        } else if (videoRefCam1.current && videoRefCam1.current.readyState >= 2) {
          try {
            ctx.drawImage(videoRefCam1.current, 0, 0, width, height);
          } catch {
            // ignore
          }
        }
      } else if (camId === 'cam2') {
        if (isChunkedCam2 && aviLoaderCam2?.metadata) {
          if (aviBitmapCam2Ref.current) {
            try {
              ctx.drawImage(aviBitmapCam2Ref.current, 0, 0, width, height);
            } catch {
              // ignore
            }
          } else if (aviImageDataCam2Ref.current) {
            try {
              ctx.putImageData(aviImageDataCam2Ref.current, 0, 0);
            } catch {
              // ignore
            }
          }
        } else if (videoRefCam2.current && videoRefCam2.current.readyState >= 2) {
          try {
            ctx.drawImage(videoRefCam2.current, 0, 0, width, height);
          } catch {
            // ignore
          }
        }
      }

      // 1. Draw origin crosshair & coordinate axes for this camera
      const origin = camId === 'cam1' ? triangulation.originCam1 : triangulation.originCam2;
      ctx.strokeStyle = camId === 'cam1' ? 'rgba(30, 58, 95, 0.85)' : 'rgba(5, 150, 105, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x - 24, origin.y);
      ctx.lineTo(origin.x + 24, origin.y);
      ctx.moveTo(origin.x, origin.y - 24);
      ctx.lineTo(origin.x, origin.y + 24);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = camId === 'cam1' ? '#1e3a5f' : '#047857';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(camId === 'cam1' ? '+X' : '+Z', origin.x + 28, origin.y + 4);
      ctx.fillText('+Y', origin.x - 6, origin.y - 28);

      // 1b. Interactive Calibration Stick (100mm / shock sticker / known reference)
      const calStick = camId === 'cam1' ? calStickCam1 : calStickCam2;
      if (calStick.visible) {
        const { pointA, pointB, realLength } = calStick;
        const color = camId === 'cam1' ? '#2563eb' : '#059669';
        const colorLight = camId === 'cam1' ? '#93c5fd' : '#6ee7b7';

        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;

        // Line connecting stick endpoints
        ctx.beginPath();
        ctx.moveTo(pointA.x, pointA.y);
        ctx.lineTo(pointB.x, pointB.y);
        ctx.stroke();

        // End handles (crosshair & circles)
        [pointA, pointB].forEach((pt) => {
          ctx.strokeStyle = colorLight;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(pt.x - 9, pt.y);
          ctx.lineTo(pt.x + 9, pt.y);
          ctx.moveTo(pt.x, pt.y - 9);
          ctx.lineTo(pt.x, pt.y + 9);
          ctx.stroke();

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });

        // Middle metric readout badge
        const pxDist = Math.hypot(pointB.x - pointA.x, pointB.y - pointA.y);
        const scaleVal = Math.max(1, Math.round(pxDist / realLength));
        const midX = (pointA.x + pointB.x) / 2;
        const midY = (pointA.y + pointB.y) / 2;
        const text = `${pxDist.toFixed(1)}px = ${(realLength * 1000).toFixed(0)}mm (${scaleVal} px/m)`;

        ctx.font = 'bold 11px monospace';
        const textMetrics = ctx.measureText(text);
        const padding = 6;
        const bgW = textMetrics.width + padding * 2;
        const bgH = 18;

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(midX - bgW / 2, midY - bgH / 2 - 14, bgW, bgH);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(midX - bgW / 2, midY - bgH / 2 - 14, bgW, bgH);

        ctx.fillStyle = color;
        ctx.fillText(text, midX - textMetrics.width / 2, midY - 14 + 4);
        ctx.restore();
      }

      // 2. Trajectory lines
      if (showTrails && steps.length > 1) {
        ctx.strokeStyle = activeTrack.color || '#3b82f6';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let started = false;
        for (const s of steps) {
          const pt = camId === 'cam1' ? s.cam1 : s.cam2;
          if (!pt) continue;
          if (!started) {
            ctx.moveTo(pt.px, pt.py);
            started = true;
          } else {
            ctx.lineTo(pt.px, pt.py);
          }
        }
        ctx.stroke();
      }

      // 3. Draw Reticles for tracked points on this camera
      steps.forEach((s) => {
        const pt = camId === 'cam1' ? s.cam1 : s.cam2;
        if (!pt) return;

        const isCur = s.frame === currentFrame;
        const isInterpolated = camId === 'cam2' ? s.isInterpolatedCam2 : s.isInterpolatedCam1;

        // Reticle colors
        const strokeColor = isCur ? '#ef4444' : isInterpolated ? '#d97706' : (activeTrack.color || '#3b82f6');
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isCur ? 2 : 1.2;

        if (isInterpolated) {
          ctx.setLineDash([3, 2]);
        } else {
          ctx.setLineDash([]);
        }

        // Center reticle ring
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, isCur ? 6.5 : 4, 0, Math.PI * 2);
        ctx.stroke();

        // Crosshair reticle ticks
        const tick = isCur ? 12 : 7;
        const gap = isCur ? 3.5 : 2;
        ctx.beginPath();
        ctx.moveTo(pt.px - tick, pt.py);
        ctx.lineTo(pt.px - gap, pt.py);
        ctx.moveTo(pt.px + gap, pt.py);
        ctx.lineTo(pt.px + tick, pt.py);
        ctx.moveTo(pt.px, pt.py - tick);
        ctx.lineTo(pt.px, pt.py - gap);
        ctx.moveTo(pt.px, pt.py + gap);
        ctx.lineTo(pt.px, pt.py + tick);
        ctx.stroke();
        ctx.setLineDash([]);

        // Point label
        if (isCur) {
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 10px monospace';
          const labelText = isInterpolated
            ? `P#${s.frame} [~Spline]`
            : `P#${s.frame}`;
          ctx.fillText(labelText, pt.px + 10, pt.py - 10);
        }
      });

      // 4. Epipolar horizontal reference alignment line when hovering the other camera
      if (activeCameraHover && activeCameraHover !== camId && mouseCoord) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.75)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, mouseCoord.y);
        ctx.lineTo(width, mouseCoord.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 5. Crisp 1px Sensor Pixel Grid at High Zoom (>= 800%) for Sub-Pixel Stereo Centroiding
      const camPan = camId === 'cam1' ? panCam1 : panCam2;
      const camCont = camId === 'cam1' ? containerRefCam1.current : containerRefCam2.current;
      if (camZoom >= 8.0) {
        const contW = camCont?.clientWidth || width;
        const contH = camCont?.clientHeight || height;
        const startPx = Math.max(0, Math.floor(-camPan.x / camZoom));
        const endPx = Math.min(width, Math.ceil((contW - camPan.x) / camZoom));
        const startPy = Math.max(0, Math.floor(-camPan.y / camZoom));
        const endPy = Math.min(height, Math.ceil((contH - camPan.y) / camZoom));

        ctx.save();
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
        ctx.lineWidth = Math.max(0.04, 1 / camZoom);
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
    },
    [
      triangulation,
      steps,
      currentFrame,
      showTrails,
      activeTrack.color,
      activeCameraHover,
      mouseCoord,
      calStickCam1,
      calStickCam2,
      zoomCam1,
      zoomCam2,
      panCam1,
      panCam2,
    ]
  );

  // Trigger render on frame or state change
  useEffect(() => {
    renderOverlay(canvasRefCam1.current, 'cam1');
    renderOverlay(canvasRefCam2.current, 'cam2');
  }, [renderOverlay, currentFrame, steps, canvasSizeCam1, canvasSizeCam2, calStickCam1, calStickCam2]);

  // Decode frame on demand for Camera 1 when aviLoaderCam1 is active
  useEffect(() => {
    if (!isChunkedCam1 || !aviLoaderCam1?.metadata) {
      aviBitmapCam1Ref.current = null;
      aviImageDataCam1Ref.current = null;
      return;
    }
    setCam1Error(null);
    setCanvasSizeCam1({
      width: aviLoaderCam1.metadata.width || 640,
      height: aviLoaderCam1.metadata.height || 480,
    });
    let cancelled = false;
    aviLoaderCam1
      .getFrameBitmap(currentFrame)
      .then(async (bmp) => {
        if (cancelled) return;
        if (bmp) {
          aviBitmapCam1Ref.current = bmp;
        } else {
          aviImageDataCam1Ref.current = await aviLoaderCam1.getFrameImageData(currentFrame);
        }
        renderOverlay(canvasRefCam1.current, 'cam1');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isChunkedCam1, aviLoaderCam1, currentFrame, renderOverlay]);

  // Decode frame on demand for Camera 2 when aviLoaderCam2 is active
  useEffect(() => {
    if (!isChunkedCam2 || !aviLoaderCam2?.metadata) {
      aviBitmapCam2Ref.current = null;
      aviImageDataCam2Ref.current = null;
      return;
    }
    setCam2Error(null);
    setCanvasSizeCam2({
      width: aviLoaderCam2.metadata.width || 640,
      height: aviLoaderCam2.metadata.height || 480,
    });
    let cancelled = false;
    aviLoaderCam2
      .getFrameBitmap(currentFrameCam2)
      .then(async (bmp) => {
        if (cancelled) return;
        if (bmp) {
          aviBitmapCam2Ref.current = bmp;
        } else {
          aviImageDataCam2Ref.current = await aviLoaderCam2.getFrameImageData(currentFrameCam2);
        }
        renderOverlay(canvasRefCam2.current, 'cam2');
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isChunkedCam2, aviLoaderCam2, currentFrameCam2, renderOverlay]);

  // Video element repaint listener so paused frames always draw on Cam 1 & Cam 2
  useEffect(() => {
    const v1 = videoRefCam1.current;
    const v2 = videoRefCam2.current;

    const onRepaintCam1 = () => {
      renderOverlay(canvasRefCam1.current, 'cam1');
    };
    const onRepaintCam2 = () => {
      renderOverlay(canvasRefCam2.current, 'cam2');
    };

    v1?.addEventListener('seeked', onRepaintCam1);
    v1?.addEventListener('loadeddata', onRepaintCam1);
    v1?.addEventListener('canplay', onRepaintCam1);
    v1?.addEventListener('timeupdate', onRepaintCam1);

    v2?.addEventListener('seeked', onRepaintCam2);
    v2?.addEventListener('loadeddata', onRepaintCam2);
    v2?.addEventListener('canplay', onRepaintCam2);
    v2?.addEventListener('timeupdate', onRepaintCam2);

    return () => {
      v1?.removeEventListener('seeked', onRepaintCam1);
      v1?.removeEventListener('loadeddata', onRepaintCam1);
      v1?.removeEventListener('canplay', onRepaintCam1);
      v1?.removeEventListener('timeupdate', onRepaintCam1);

      v2?.removeEventListener('seeked', onRepaintCam2);
      v2?.removeEventListener('loadeddata', onRepaintCam2);
      v2?.removeEventListener('canplay', onRepaintCam2);
      v2?.removeEventListener('timeupdate', onRepaintCam2);
    };
  }, [renderOverlay]);

  // Convert client mouse event to sub-pixel camera coordinate (u, v)
  const getStereoCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId: 'cam1' | 'cam2'
  ) => {
    const canvas = camId === 'cam1' ? canvasRefCam1.current : canvasRefCam2.current;
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

  // Place or update a 3D Stereo point on Cam 1 or Cam 2 with sub-pixel coordinates & DLT triangulation
  const commitStereoPointAtFrame = (
    camId: 'cam1' | 'cam2',
    px: number,
    py: number,
    targetFrame: number,
    allowAutoAdvance: boolean
  ) => {
    const time = targetFrame / fpsCam1;
    const existing = steps.find((s) => s.frame === targetFrame);

    let newCam1 = existing?.cam1 || null;
    let newCam2 = existing?.cam2 || null;
    let isInterpolatedCam1 = false;
    let isInterpolatedCam2 = false;
    let temporalDelta = 0;

    if (camId === 'cam1') {
      newCam1 = { px, py };
    } else {
      newCam2 = { px, py };
    }

    if (newCam1 && !newCam2) {
      const cam2Samples = steps
        .filter((s) => s.cam2)
        .map((s) => ({
          time: s.time,
          px: s.cam2!.px,
          py: s.cam2!.py,
          frame: s.cam2Frame ?? Math.round(s.time * fpsCam2),
        }));

      if (cam2Samples.length > 0) {
        const interpResult = interpolateCameraCoordinates(
          cam2Samples,
          time,
          triangulation.temporalInterpolation || 'cubic-spline'
        );
        if (interpResult) {
          newCam2 = {
            px: Number(interpResult.px.toFixed(2)),
            py: Number(interpResult.py.toFixed(2)),
          };
          isInterpolatedCam2 = !interpResult.isExact;
          temporalDelta = interpResult.timeDelta;
        }
      }
    } else if (newCam2 && !newCam1) {
      const cam1Samples = steps
        .filter((s) => s.cam1)
        .map((s) => ({
          time: s.time,
          px: s.cam1!.px,
          py: s.cam1!.py,
          frame: s.frame,
        }));

      if (cam1Samples.length > 0) {
        const interpResult = interpolateCameraCoordinates(
          cam1Samples,
          time,
          triangulation.temporalInterpolation || 'cubic-spline'
        );
        if (interpResult) {
          newCam1 = {
            px: Number(interpResult.px.toFixed(2)),
            py: Number(interpResult.py.toFixed(2)),
          };
          isInterpolatedCam1 = !interpResult.isExact;
          temporalDelta = interpResult.timeDelta;
        }
      }
    }

    let worldX = existing?.x ?? 0;
    let worldY = existing?.y ?? 0;
    let worldZ = existing?.z ?? 0;
    let residual: number | null = null;

    if (newCam1 && newCam2) {
      const dlt = buildDefaultDLT(
        triangulation.method,
        triangulation.pixelsPerMeterCam1,
        triangulation.pixelsPerMeterCam2,
        triangulation.originCam1,
        triangulation.originCam2,
        triangulation.baselineMeters,
        triangulation.convergenceAngleDeg
      );

      const tri = triangulateDLT(
        newCam1.px,
        newCam1.py,
        triangulation.dltCam1 || dlt.dltCam1,
        newCam2.px,
        newCam2.py,
        triangulation.dltCam2 || dlt.dltCam2
      );

      if (tri) {
        worldX = tri.x;
        worldY = tri.y;
        worldZ = tri.z;
        residual = tri.residual;
      }
    } else if (camId === 'cam1') {
      worldX = (px - triangulation.originCam1.x) / triangulation.pixelsPerMeterCam1;
      worldY = (triangulation.originCam1.y - py) / triangulation.pixelsPerMeterCam1;
    } else if (camId === 'cam2') {
      worldZ = (px - triangulation.originCam2.x) / triangulation.pixelsPerMeterCam2;
      worldY = (triangulation.originCam2.y - py) / triangulation.pixelsPerMeterCam2;
    }

    const newPointStep: PointStep = {
      frame: targetFrame,
      time,
      px: newCam1 ? newCam1.px : px,
      py: newCam1 ? newCam1.py : py,
      cam1: newCam1,
      cam2: newCam2,
      cam1Px: newCam1?.px,
      cam1Py: newCam1?.py,
      cam2Px: newCam2?.px,
      cam2Py: newCam2?.py,
      cam1Time: time,
      cam2Time: timeCam2,
      cam2Frame: currentFrameCam2,
      isInterpolatedCam1,
      isInterpolatedCam2,
      temporalDeltaSeconds: temporalDelta,
      x: worldX,
      y: worldY,
      z: worldZ,
      residual: residual ?? undefined,
      triangulationResidual: residual,
      reconstructionError3D: existing?.reconstructionError3D ?? null,
      referenceX: existing?.referenceX ?? null,
      referenceY: existing?.referenceY ?? null,
      referenceZ: existing?.referenceZ ?? null,
    };

    onAddPoint3D(newPointStep);

    if (allowAutoAdvance && autoAdvance && newCam1 && newCam2) {
      if (currentFrame + clip.stepSize <= clip.endFrame) {
        onFrameChange(currentFrame + clip.stepSize);
      }
    }
  };

  // Handle Mouse Down for Panning, Dragging Calibration Handles, Origin, or Sub-Pixel Point Marking
  const handleMouseDown = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId: 'cam1' | 'cam2'
  ) => {
    const curPan = camId === 'cam1' ? panCam1 : panCam2;
    const camZoom = camId === 'cam1' ? zoomCam1 : zoomCam2;

    // 0. Right-click (2), Middle-click (1), or Spacebar held -> Immediate Pan
    if (e.button === 2 || e.button === 1 || isSpacePressed) {
      e.preventDefault();
      e.stopPropagation();
      if (camId === 'cam1') {
        setIsPanningCam1(true);
        panStartCam1Ref.current = { x: e.clientX - curPan.x, y: e.clientY - curPan.y };
      } else {
        setIsPanningCam2(true);
        panStartCam2Ref.current = { x: e.clientX - curPan.x, y: e.clientY - curPan.y };
      }
      return;
    }

    if (e.button !== 0) return;

    const { px, py } = getStereoCanvasCoords(e, camId);
    const hitRadius = Math.max(2.5, 16 / Math.max(0.5, camZoom));

    if (!e.shiftKey && !isShiftPressed) {
      const stick = camId === 'cam1' ? calStickCam1 : calStickCam2;
      if (stick.visible) {
        if (Math.hypot(px - stick.pointA.x, py - stick.pointA.y) < hitRadius) {
          onBeginHistoryAction?.(`Move ${camId.toUpperCase()} Calibration Handle A`);
          setDragStickTarget({ camId, type: 'ptA' });
          return;
        }
        if (Math.hypot(px - stick.pointB.x, py - stick.pointB.y) < hitRadius) {
          onBeginHistoryAction?.(`Move ${camId.toUpperCase()} Calibration Handle B`);
          setDragStickTarget({ camId, type: 'ptB' });
          return;
        }
      }

      const origin = camId === 'cam1' ? triangulation.originCam1 : triangulation.originCam2;
      if (Math.hypot(px - origin.x, py - origin.y) < hitRadius) {
        onBeginHistoryAction?.(`Move ${camId.toUpperCase()} Origin`);
        setDragStickTarget({ camId, type: 'origin' });
        return;
      }

      // Check existing marked point on this camera
      const ptRadius = Math.max(2.0, 10 / Math.max(0.5, camZoom));
      const existingPtStep = steps.find((s) => {
        const pt = camId === 'cam1' ? s.cam1 : s.cam2;
        return pt && Math.hypot(px - pt.px, py - pt.py) < ptRadius;
      });
      if (existingPtStep) {
        onBeginHistoryAction?.(`Drag ${camId.toUpperCase()} Point F#${existingPtStep.frame}`);
        setDragStickTarget({ camId, type: 'point', frame: existingPtStep.frame });
        onFrameChange(existingPtStep.frame);
        return;
      }
    }

    // Holding Shift -> Immediate Sub-Pixel Stereo Point Mark
    if (e.shiftKey || isShiftPressed) {
      commitStereoPointAtFrame(camId, px, py, currentFrame, true);
      return;
    }

    // Left-click on empty canvas without Shift: start potential Pan gesture (<3px click vs >=3px drag pan)
    pointerGestureRef.current = {
      active: true,
      camId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: curPan.x,
      startPanY: curPan.y,
      moved: false,
    };
  };

  const handleMouseUp = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId?: 'cam1' | 'cam2'
  ) => {
    if (pointerGestureRef.current?.active) {
      const gesture = pointerGestureRef.current;
      pointerGestureRef.current = null;
      setIsPanningCam1(false);
      setIsPanningCam2(false);

      if (!gesture.moved && camId) {
        if (requireShiftToMark) {
          setShowShiftWarning(true);
          if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
          warningTimerRef.current = setTimeout(() => setShowShiftWarning(false), 2600);
        } else {
          const { px, py } = getStereoCanvasCoords(e, camId);
          commitStereoPointAtFrame(camId, px, py, currentFrame, true);
        }
      }
      return;
    }

    setIsPanningCam1(false);
    setIsPanningCam2(false);
    setDragStickTarget(null);
  };

  // Handle Mouse movement on canvas with sub-pixel coordinate scaling & smooth pan
  const handleMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId: 'cam1' | 'cam2'
  ) => {
    const { px, py } = getStereoCanvasCoords(e, camId);
    setMouseCoord({ x: px, y: py });

    if (pointerGestureRef.current?.active && pointerGestureRef.current.camId === camId) {
      const dx = e.clientX - pointerGestureRef.current.startClientX;
      const dy = e.clientY - pointerGestureRef.current.startClientY;
      if (Math.hypot(dx, dy) >= 3 || pointerGestureRef.current.moved) {
        pointerGestureRef.current.moved = true;
        if (camId === 'cam1') {
          if (!isPanningCam1) setIsPanningCam1(true);
          setPanCam1({
            x: pointerGestureRef.current.startPanX + dx,
            y: pointerGestureRef.current.startPanY + dy,
          });
        } else {
          if (!isPanningCam2) setIsPanningCam2(true);
          setPanCam2({
            x: pointerGestureRef.current.startPanX + dx,
            y: pointerGestureRef.current.startPanY + dy,
          });
        }
      }
      return;
    }

    if (camId === 'cam1' && isPanningCam1) {
      e.preventDefault();
      setPanCam1({
        x: e.clientX - panStartCam1Ref.current.x,
        y: e.clientY - panStartCam1Ref.current.y,
      });
      return;
    }
    if (camId === 'cam2' && isPanningCam2) {
      e.preventDefault();
      setPanCam2({
        x: e.clientX - panStartCam2Ref.current.x,
        y: e.clientY - panStartCam2Ref.current.y,
      });
      return;
    }

    if (dragStickTarget && dragStickTarget.camId === camId) {
      if (dragStickTarget.type === 'point' && dragStickTarget.frame !== undefined) {
        commitStereoPointAtFrame(camId, px, py, dragStickTarget.frame, false);
      } else if (dragStickTarget.type === 'origin') {
        if (camId === 'cam1') {
          onUpdateTriangulation({ originCam1: { x: px, y: py } });
        } else {
          onUpdateTriangulation({ originCam2: { x: px, y: py } });
        }
      } else {
        const isCam1 = camId === 'cam1';
        const stick = isCam1 ? calStickCam1 : calStickCam2;
        const newA = dragStickTarget.type === 'ptA' ? { x: px, y: py } : stick.pointA;
        const newB = dragStickTarget.type === 'ptB' ? { x: px, y: py } : stick.pointB;
        const pxDist = Math.hypot(newB.x - newA.x, newB.y - newA.y);
        const newScale = Math.max(1, Math.round(pxDist / stick.realLength));

        if (isCam1) {
          setCalStickCam1((prev) => ({ ...prev, pointA: newA, pointB: newB }));
          onUpdateTriangulation({
            pixelsPerMeterCam1: newScale,
            calibrationCam1: {
              active: true,
              pointA: newA,
              pointB: newB,
              realLength: stick.realLength,
              scale: newScale,
              unit: 'm',
              locked: false,
              visible: true,
            },
          });
        } else {
          setCalStickCam2((prev) => ({ ...prev, pointA: newA, pointB: newB }));
          onUpdateTriangulation({
            pixelsPerMeterCam2: newScale,
            calibrationCam2: {
              active: true,
              pointA: newA,
              pointB: newB,
              realLength: stick.realLength,
              scale: newScale,
              unit: 'm',
              locked: false,
              visible: true,
            },
          });
        }
      }
    }
  };

  const isLoupeVisible = Boolean((showLoupe || isShiftPressed) && activeCameraHover && mouseCoord);

  // 8x Precision Magnifier Loupe Rendering for Stereo Camera 1 & Camera 2
  useEffect(() => {
    if (!isLoupeVisible || !mouseCoord || !activeCameraHover) return;
    const loupe = loupeCanvasRef.current;
    const sourceCanvas =
      activeCameraHover === 'cam1' ? canvasRefCam1.current : canvasRefCam2.current;

    if (!loupe || !sourceCanvas) return;
    const lCtx = loupe.getContext('2d');
    if (!lCtx) return;

    const loupeZoom = 8.0;
    const lWidth = loupe.width;
    const lHeight = loupe.height;
    const srcSize = activeCameraHover === 'cam1' ? canvasSizeCam1 : canvasSizeCam2;
    const sourceW = lWidth / loupeZoom;
    const sourceH = lHeight / loupeZoom;
    const sourceX = Math.max(0, Math.min(srcSize.width - sourceW, mouseCoord.x - sourceW / 2));
    const sourceY = Math.max(0, Math.min(srcSize.height - sourceH, mouseCoord.y - sourceH / 2));

    lCtx.clearRect(0, 0, lWidth, lHeight);
    lCtx.imageSmoothingEnabled = false;
    lCtx.fillStyle = '#0F172A';
    lCtx.fillRect(0, 0, lWidth, lHeight);

    const sourceVideo =
      activeCameraHover === 'cam1' ? videoRefCam1.current : videoRefCam2.current;

    if (sourceVideo && sourceVideo.readyState >= 2) {
      try {
        lCtx.drawImage(
          sourceVideo,
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
        // ignore
      }
    }

    lCtx.drawImage(
      sourceCanvas,
      sourceX,
      sourceY,
      sourceW,
      sourceH,
      0,
      0,
      lWidth,
      lHeight
    );

    // 1px sensor grid inside 8x loupe
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

    // Sub-pixel crosshair at exact fractional coordinate
    const centerX = (mouseCoord.x - sourceX) * loupeZoom;
    const centerY = (mouseCoord.y - sourceY) * loupeZoom;

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

    lCtx.strokeStyle = '#2563EB';
    lCtx.lineWidth = 1.5;
    lCtx.beginPath();
    lCtx.arc(centerX, centerY, 12, 0, Math.PI * 2);
    lCtx.stroke();

    lCtx.fillStyle = '#DC2626';
    lCtx.beginPath();
    lCtx.arc(centerX, centerY, 2.2, 0, Math.PI * 2);
    lCtx.fill();
  }, [isLoupeVisible, mouseCoord, activeCameraHover, canvasSizeCam1, canvasSizeCam2, currentFrame, steps]);

  return (
    <div id="dual-video-player-stage" className="flex flex-col h-full bg-[#F1F3F5] select-none">
      {/* Compact 28px Stereo Sub-Header */}
      <div className="h-[28px] bg-[#E2E8F0] border-b border-[#CBD5E1] px-2.5 flex items-center justify-between gap-2 text-[11px] shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-bold text-[#1E293B] flex items-center gap-1.5 shrink-0">
            <Camera className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>3D Stereo Rig</span>
          </span>

          <div className="flex items-center gap-1 bg-white border border-[#CBD5E1] rounded-[3px] px-1.5 py-0.5 text-[10px] font-mono text-[#1E293B]">
            <span className="text-[#64748B]">Mode:</span>
            <strong className="text-[#1E293B] font-bold capitalize">
              {triangulation.method.replace(/-/g, ' ')}
            </strong>
          </div>

          {isMultiRate ? (
            <div className="flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-[3px] px-1.5 py-0.5 text-[10px] font-mono text-amber-900 font-bold">
              <Clock className="w-3 h-3 text-[#D97706]" />
              <span>Async [{ratioInfo.ratioStr}]</span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-white border border-[#CBD5E1] rounded-[3px] px-1.5 py-0.5 text-[10px] font-mono text-[#334155] font-semibold">
              <CheckCircle2 className="w-3 h-3 text-[#2563EB]" />
              <span>Sync (1:1)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {onOpenTriangulationModal && (
            <button
              type="button"
              onClick={onOpenTriangulationModal}
              className="h-[22px] flex items-center gap-1 px-2 rounded-[3px] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#1E293B] text-[10.5px] font-semibold transition-colors cursor-pointer"
              title="Configure Stereo Geometry, Frame Rates & Sub-Frame Spline Sync"
            >
              <Sliders className="w-3 h-3 text-[#2563EB]" />
              <span>DLT / Sync Setup</span>
            </button>
          )}

          {/* Layout Switcher */}
          <div className="flex bg-white border border-[#CBD5E1] p-0.5 rounded-[3px] text-[10.5px]">
            <button
              type="button"
              onClick={() => setDualLayout('side-by-side')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold transition-colors cursor-pointer ${
                dualLayout === 'side-by-side'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:bg-[#F1F3F5]'
              }`}
            >
              Dual Feed
            </button>
            <button
              type="button"
              onClick={() => setDualLayout('cam1-focus')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold transition-colors cursor-pointer ${
                dualLayout === 'cam1-focus'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:bg-[#F1F3F5]'
              }`}
            >
              Cam 1
            </button>
            <button
              type="button"
              onClick={() => setDualLayout('cam2-focus')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold transition-colors cursor-pointer ${
                dualLayout === 'cam2-focus'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:bg-[#F1F3F5]'
              }`}
            >
              Cam 2
            </button>
          </div>
        </div>
      </div>

      {/* Hidden File Inputs for Local Uploads */}
      <input
        ref={fileInputCam1Ref}
        type="file"
        accept={ACCEPTED_VIDEO_ACCEPT_STRING}
        className="hidden"
        onChange={(e) => {
          setCam1Error(null);
          e.target.files?.[0] && onUploadCam1?.(e.target.files[0]);
        }}
      />
      <input
        ref={fileInputCam2Ref}
        type="file"
        accept={ACCEPTED_VIDEO_ACCEPT_STRING}
        className="hidden"
        onChange={(e) => {
          setCam2Error(null);
          e.target.files?.[0] && onUploadCam2?.(e.target.files[0]);
        }}
      />

      {/* Dual Video Canvases Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden bg-[#F1F3F5] p-1.5 gap-1.5">
        {/* Accidental Click Interception Toast Notice */}
        {showShiftWarning && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-[#181B20] text-[#E2E8F0] px-3.5 py-1.5 rounded-[3px] border border-[#2A2E37] shadow-lg flex items-center gap-2 text-xs font-mono pointer-events-none z-30">
            <span className="w-2 h-2 rounded-full bg-[#D97706]" />
            <span>
              <strong>Stereo Safety Lock:</strong> Hold <span className="underline font-bold text-amber-300">Shift + Click</span> on Camera 1 or Camera 2 to mark coordinates.
            </span>
          </div>
        )}

        {/* Camera 1 Viewport */}
        {(dualLayout === 'side-by-side' || dualLayout === 'cam1-focus') && (
          <div
            className="flex-1 flex flex-col h-full bg-white border border-[#CBD5E1] rounded-[3px] overflow-hidden relative"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingCam1(true);
            }}
            onDragLeave={() => setIsDraggingCam1(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingCam1(false);
              setCam1Error(null);
              const file = e.dataTransfer.files?.[0];
              if (file) onUploadCam1?.(file);
            }}
          >
            {isDraggingCam1 && (
              <div className="absolute inset-0 z-30 bg-[#181B20]/90 border-2 border-dashed border-[#2563EB] text-white flex flex-col items-center justify-center pointer-events-none">
                <Upload className="w-8 h-8 mb-2 text-[#2563EB]" />
                <span className="font-bold text-xs">Drop Video to Load into Camera 1</span>
                <span className="text-[10px] text-slate-300">.MP4, .AVI, .WMV, .FLV, .MOV, .MKV, .WEBM</span>
              </div>
            )}
            <div className="h-[24px] bg-[#F1F3F5] border-b border-[#CBD5E1] px-2 flex items-center justify-between text-[10.5px] shrink-0 gap-1 overflow-x-auto">
              <div className="flex items-center gap-1.5 font-semibold text-[#1E293B] truncate shrink-0">
                <span className="w-2 h-2 rounded-full bg-[#2563EB]" />
                <span>CAM 1 (X-Y)</span>
                <span className="font-mono text-[10px] text-[#64748B] font-normal">
                  [{fpsCam1.toLocaleString()}fps • F#{currentFrame}]
                </span>
              </div>

              {/* Camera 1 Independent Zoom Mini-Controls */}
              <div className="flex items-center gap-0.5 bg-white border border-[#CBD5E1] rounded-[2px] px-1 py-0.2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const cont = containerRefCam1.current;
                    const cx = (cont?.clientWidth || 300) / 2;
                    const cy = (cont?.clientHeight || 200) / 2;
                    const nz = Math.max(0.25, Number((zoomCam1 / 1.25).toFixed(3)));
                    setPanCam1({
                      x: cx - (cx - panCam1.x) * (nz / zoomCam1),
                      y: cy - (cy - panCam1.y) * (nz / zoomCam1),
                    });
                    setZoomCam1(nz);
                  }}
                  className="px-1 hover:bg-[#E2E8F0] text-[#1E293B] font-bold text-[10px] rounded-[1px] cursor-pointer"
                  title="Cam 1 Zoom Out (or Wheel Down)"
                >
                  -
                </button>
                <span className="font-mono font-bold text-[10px] text-[#1E293B] min-w-[34px] text-center tabular-nums">
                  {Math.round(zoomCam1 * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const cont = containerRefCam1.current;
                    const cx = (cont?.clientWidth || 300) / 2;
                    const cy = (cont?.clientHeight || 200) / 2;
                    const nz = Math.min(24.0, Number((zoomCam1 * 1.25).toFixed(3)));
                    setPanCam1({
                      x: cx - (cx - panCam1.x) * (nz / zoomCam1),
                      y: cy - (cy - panCam1.y) * (nz / zoomCam1),
                    });
                    setZoomCam1(nz);
                  }}
                  className="px-1 hover:bg-[#E2E8F0] text-[#1E293B] font-bold text-[10px] rounded-[1px] cursor-pointer"
                  title="Cam 1 Zoom In up to 2400% (or Wheel Up)"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => resetZoomAndPanCam1(1)}
                  className={`px-1 rounded-[1px] text-[9.5px] font-bold cursor-pointer ${
                    Math.abs(zoomCam1 - 1) < 0.01 ? 'bg-[#2563EB] text-white' : 'hover:bg-[#E2E8F0] text-[#334155]'
                  }`}
                  title="Cam 1 1:1 Native Sensor Resolution (100%)"
                >
                  1:1
                </button>
                <button
                  type="button"
                  onClick={() => resetZoomAndPanCam1()}
                  className="px-1 hover:bg-[#E2E8F0] text-[#334155] text-[9.5px] font-bold rounded-[1px] cursor-pointer"
                  title="Fit Cam 1 to Viewport (Key: F or Double-Click)"
                >
                  Fit
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setCalStickCam1((prev) => ({ ...prev, visible: !prev.visible }))
                  }
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border text-[10px] font-semibold transition-colors cursor-pointer ${
                    calStickCam1.visible
                      ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                      : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                  }`}
                  title="Toggle Calibration Stick on Camera 1 to calibrate px/m scale"
                >
                  <Ruler className="w-2.5 h-2.5" />
                  <span>{(triangulation.pixelsPerMeterCam1 || 240).toFixed(0)} px/m</span>
                </button>

                {calStickCam1.visible && (
                  <div className="flex items-center bg-white border border-[#CBD5E1] rounded-[2px] px-1 py-0.2 text-[10px]">
                    <span className="text-[#64748B] font-semibold mr-0.5">L:</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={Math.round(calStickCam1.realLength * 1000)}
                      onChange={(e) => {
                        const mm = Math.max(1, parseFloat(e.target.value) || 100);
                        const m = mm / 1000;
                        const dist = Math.hypot(
                          calStickCam1.pointB.x - calStickCam1.pointA.x,
                          calStickCam1.pointB.y - calStickCam1.pointA.y
                        );
                        const newScale = Math.max(1, Math.round(dist / m));
                        setCalStickCam1((prev) => ({ ...prev, realLength: m }));
                        onUpdateTriangulation({
                          pixelsPerMeterCam1: newScale,
                          calibrationCam1: {
                            active: true,
                            pointA: calStickCam1.pointA,
                            pointB: calStickCam1.pointB,
                            realLength: m,
                            scale: newScale,
                            unit: 'm',
                            locked: false,
                            visible: true,
                          },
                        });
                      }}
                      className="w-9 bg-transparent text-[#1E293B] font-bold font-mono focus:outline-none"
                      title="Stick reference length in mm"
                    />
                    <span className="text-[#64748B]">mm</span>
                  </div>
                )}

                {currentStep?.cam1 ? (
                  <span className="text-[#1E293B] bg-white px-1.5 py-0.2 rounded-[2px] border border-[#CBD5E1] font-mono text-[10px] flex items-center gap-0.5 tabular-nums">
                    <CheckCircle2 className="w-2.5 h-2.5 text-[#2563EB]" />
                    ({currentStep.cam1.px.toFixed(1)},{currentStep.cam1.py.toFixed(1)})
                  </span>
                ) : (
                  <span className="text-[#64748B] bg-white px-1.5 py-0.2 rounded-[2px] border border-[#CBD5E1] text-[9.5px]">
                    Shift+Click
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => fileInputCam1Ref.current?.click()}
                  className="p-0.5 text-[#334155] hover:bg-[#E2E8F0] rounded-[2px] transition-colors cursor-pointer"
                  title="Upload Video for Camera 1"
                >
                  <Upload className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              ref={containerRefCam1}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={(e) => handleWheelCamera(e, 'cam1')}
              onDoubleClick={(e) => {
                if (!e.shiftKey && !dragStickTarget) resetZoomAndPanCam1();
              }}
              className="flex-1 relative bg-[#0F172A] min-h-0 overflow-hidden select-none"
            >
              {videoUrlCam1 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: canvasSizeCam1.width,
                    height: canvasSizeCam1.height,
                    transform: `translate3d(${panCam1.x}px, ${panCam1.y}px, 0) scale(${zoomCam1})`,
                    transformOrigin: '0 0',
                    transition: isPanningCam1 ? 'none' : 'transform 0.04s ease-out',
                    imageRendering: zoomCam1 >= 3.0 ? 'pixelated' : 'auto',
                  }}
                  className="rounded-[2px] overflow-hidden border border-[#334155] shadow-xl bg-black"
                >
                  <video
                    ref={videoRefCam1}
                    src={normalizeVideoUrl(videoUrlCam1)}
                    playsInline
                    muted
                    preload="auto"
                    onLoadedMetadata={() => {
                      handleLoadedMetadataCam1();
                      renderOverlay(canvasRefCam1.current, 'cam1');
                    }}
                    onDurationChange={() => {
                      handleLoadedMetadataCam1();
                      renderOverlay(canvasRefCam1.current, 'cam1');
                    }}
                    onSeeked={() => {
                      mediaDiagnostics.logEvent('cam1', 'seeked', videoRefCam1.current);
                      renderOverlay(canvasRefCam1.current, 'cam1');
                    }}
                    onCanPlay={() => {
                      mediaDiagnostics.logEvent('cam1', 'canplay', videoRefCam1.current);
                      renderOverlay(canvasRefCam1.current, 'cam1');
                    }}
                    onTimeUpdate={() => renderOverlay(canvasRefCam1.current, 'cam1')}
                    onPlay={() => mediaDiagnostics.logEvent('cam1', 'play', videoRefCam1.current)}
                    onPause={() => mediaDiagnostics.logEvent('cam1', 'pause', videoRefCam1.current)}
                    onRateChange={() => mediaDiagnostics.logEvent('cam1', 'ratechange', videoRefCam1.current)}
                    onWaiting={() => mediaDiagnostics.logEvent('cam1', 'waiting', videoRefCam1.current)}
                    onStalled={() => mediaDiagnostics.logEvent('cam1', 'stalled', videoRefCam1.current)}
                    onError={() => {
                      if (isChunkedCam1) {
                        setCam1Error(null);
                        return;
                      }
                      mediaDiagnostics.logEvent('cam1', 'error', videoRefCam1.current);
                      setCam1Error('Video codec in Camera 1 is not supported natively by this browser. A standard H.264 MP4 conversion is recommended.');
                    }}
                    className="block"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'fill',
                      display: 'block',
                      imageRendering: zoomCam1 >= 3.0 ? 'pixelated' : 'auto',
                    }}
                  />
                  <canvas
                    ref={canvasRefCam1}
                    width={canvasSizeCam1.width}
                    height={canvasSizeCam1.height}
                    onMouseDown={(e) => handleMouseDown(e, 'cam1')}
                    onMouseUp={(e) => handleMouseUp(e, 'cam1')}
                    onMouseEnter={() => setActiveCameraHover('cam1')}
                    onMouseLeave={() => {
                      setActiveCameraHover(null);
                      setIsPanningCam1(false);
                      if (pointerGestureRef.current?.camId === 'cam1') pointerGestureRef.current = null;
                    }}
                    onMouseMove={(e) => handleMouseMove(e, 'cam1')}
                    className="absolute inset-0 w-full h-full"
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      cursor:
                        isPanningCam1 || dragStickTarget?.camId === 'cam1'
                          ? 'grabbing'
                          : isShiftPressed || !requireShiftToMark
                          ? 'crosshair'
                          : 'grab',
                      imageRendering: zoomCam1 >= 3.0 ? 'pixelated' : 'auto',
                    }}
                  />
                  {cam1Error && (
                    <div className="absolute inset-0 z-20 bg-slate-900/95 text-white flex flex-col items-center justify-center p-4 text-center select-text">
                      <AlertCircle className="w-7 h-7 text-amber-400 mb-1.5" />
                      <span className="font-bold text-xs mb-1">Camera 1 Codec Notice</span>
                      <span className="text-[11px] text-slate-300 max-w-sm mb-3">{cam1Error}</span>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputCam1Ref.current?.click()}
                          className="px-2.5 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-semibold rounded-[3px] cursor-pointer"
                        >
                          Select Other File
                        </button>
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('video-prep')}
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-semibold rounded-[3px] cursor-pointer"
                          >
                            Video Prep Tips
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 select-none">
                  <div className="relative w-14 h-14 mb-2 border border-[#2563EB]/40 rounded-full flex items-center justify-center">
                    <div className="w-8 h-8 border border-[#2563EB]/30 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#2563EB]" />
                    </div>
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[#2563EB]/40" />
                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[#2563EB]/40" />
                  </div>
                  <span className="font-mono text-xs font-bold tracking-wider text-slate-300">
                    OPTICAL SENSOR 1 (CAM 1)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                    Capture Rate: {fpsCam1.toLocaleString()} fps. Drag &amp; drop video file here.
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputCam1Ref.current?.click()}
                    className="mt-2 px-3 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Load Video</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Camera 2 Viewport */}
        {(dualLayout === 'side-by-side' || dualLayout === 'cam2-focus') && (
          <div
            className="flex-1 flex flex-col h-full bg-white border border-[#CBD5E1] rounded-[3px] overflow-hidden relative"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingCam2(true);
            }}
            onDragLeave={() => setIsDraggingCam2(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingCam2(false);
              setCam2Error(null);
              const file = e.dataTransfer.files?.[0];
              if (file) onUploadCam2?.(file);
            }}
          >
            {isDraggingCam2 && (
              <div className="absolute inset-0 z-30 bg-[#181B20]/90 border-2 border-dashed border-[#2563EB] text-white flex flex-col items-center justify-center pointer-events-none">
                <Upload className="w-8 h-8 mb-2 text-[#2563EB]" />
                <span className="font-bold text-xs">Drop Video to Load into Camera 2</span>
                <span className="text-[10px] text-slate-300">.MP4, .AVI, .WMV, .FLV, .MOV, .MKV, .WEBM</span>
              </div>
            )}
            <div className="h-[24px] bg-[#F1F3F5] border-b border-[#CBD5E1] px-2 flex items-center justify-between text-[10.5px] shrink-0 gap-1 overflow-x-auto">
              <div className="flex items-center gap-1.5 font-semibold text-[#1E293B] truncate shrink-0">
                <span className="w-2 h-2 rounded-full bg-[#0284C7]" />
                <span>CAM 2 (Z-Y)</span>
                <span className="font-mono text-[10px] text-[#64748B] font-normal">
                  [{fpsCam2.toLocaleString()}fps • F#{currentFrameCam2}]
                </span>
              </div>

              {/* Camera 2 Independent Zoom Mini-Controls */}
              <div className="flex items-center gap-0.5 bg-white border border-[#CBD5E1] rounded-[2px] px-1 py-0.2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const cont = containerRefCam2.current;
                    const cx = (cont?.clientWidth || 300) / 2;
                    const cy = (cont?.clientHeight || 200) / 2;
                    const nz = Math.max(0.25, Number((zoomCam2 / 1.25).toFixed(3)));
                    setPanCam2({
                      x: cx - (cx - panCam2.x) * (nz / zoomCam2),
                      y: cy - (cy - panCam2.y) * (nz / zoomCam2),
                    });
                    setZoomCam2(nz);
                  }}
                  className="px-1 hover:bg-[#E2E8F0] text-[#1E293B] font-bold text-[10px] rounded-[1px] cursor-pointer"
                  title="Cam 2 Zoom Out (or Wheel Down)"
                >
                  -
                </button>
                <span className="font-mono font-bold text-[10px] text-[#1E293B] min-w-[34px] text-center tabular-nums">
                  {Math.round(zoomCam2 * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const cont = containerRefCam2.current;
                    const cx = (cont?.clientWidth || 300) / 2;
                    const cy = (cont?.clientHeight || 200) / 2;
                    const nz = Math.min(24.0, Number((zoomCam2 * 1.25).toFixed(3)));
                    setPanCam2({
                      x: cx - (cx - panCam2.x) * (nz / zoomCam2),
                      y: cy - (cy - panCam2.y) * (nz / zoomCam2),
                    });
                    setZoomCam2(nz);
                  }}
                  className="px-1 hover:bg-[#E2E8F0] text-[#1E293B] font-bold text-[10px] rounded-[1px] cursor-pointer"
                  title="Cam 2 Zoom In up to 2400% (or Wheel Up)"
                >
                  +
                </button>
                <button
                  type="button"
                  onClick={() => resetZoomAndPanCam2(1)}
                  className={`px-1 rounded-[1px] text-[9.5px] font-bold cursor-pointer ${
                    Math.abs(zoomCam2 - 1) < 0.01 ? 'bg-[#2563EB] text-white' : 'hover:bg-[#E2E8F0] text-[#334155]'
                  }`}
                  title="Cam 2 1:1 Native Sensor Resolution (100%)"
                >
                  1:1
                </button>
                <button
                  type="button"
                  onClick={() => resetZoomAndPanCam2()}
                  className="px-1 hover:bg-[#E2E8F0] text-[#334155] text-[9.5px] font-bold rounded-[1px] cursor-pointer"
                  title="Fit Cam 2 to Viewport (Key: F or Double-Click)"
                >
                  Fit
                </button>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() =>
                    setCalStickCam2((prev) => ({ ...prev, visible: !prev.visible }))
                  }
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-[2px] border text-[10px] font-semibold transition-colors cursor-pointer ${
                    calStickCam2.visible
                      ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                      : 'bg-white text-[#334155] border-[#CBD5E1] hover:bg-[#F8FAFC]'
                  }`}
                  title="Toggle Calibration Stick on Camera 2 to calibrate px/m scale"
                >
                  <Ruler className="w-2.5 h-2.5" />
                  <span>{(triangulation.pixelsPerMeterCam2 || 240).toFixed(0)} px/m</span>
                </button>

                {calStickCam2.visible && (
                  <div className="flex items-center bg-white border border-[#CBD5E1] rounded-[2px] px-1 py-0.2 text-[10px]">
                    <span className="text-[#64748B] font-semibold mr-0.5">L:</span>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={Math.round(calStickCam2.realLength * 1000)}
                      onChange={(e) => {
                        const mm = Math.max(1, parseFloat(e.target.value) || 100);
                        const m = mm / 1000;
                        const dist = Math.hypot(
                          calStickCam2.pointB.x - calStickCam2.pointA.x,
                          calStickCam2.pointB.y - calStickCam2.pointA.y
                        );
                        const newScale = Math.max(1, Math.round(dist / m));
                        setCalStickCam2((prev) => ({ ...prev, realLength: m }));
                        onUpdateTriangulation({
                          pixelsPerMeterCam2: newScale,
                          calibrationCam2: {
                            active: true,
                            pointA: calStickCam2.pointA,
                            pointB: calStickCam2.pointB,
                            realLength: m,
                            scale: newScale,
                            unit: 'm',
                            locked: false,
                            visible: true,
                          },
                        });
                      }}
                      className="w-9 bg-transparent text-[#1E293B] font-bold font-mono focus:outline-none"
                      title="Stick reference length in mm"
                    />
                    <span className="text-[#64748B]">mm</span>
                  </div>
                )}

                {currentStep?.cam2 ? (
                  <span className="text-[#1E293B] bg-white px-1.5 py-0.2 rounded-[2px] border border-[#CBD5E1] font-mono text-[10px] flex items-center gap-0.5 tabular-nums">
                    <CheckCircle2 className="w-2.5 h-2.5 text-[#2563EB]" />
                    ({currentStep.cam2.px.toFixed(1)},{currentStep.cam2.py.toFixed(1)})
                    {currentStep.isInterpolatedCam2 && (
                      <span className="text-[#D97706] font-bold ml-0.5" title="Sub-frame continuous spline interpolated point">
                        [~]
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-[#64748B] bg-white px-1.5 py-0.2 rounded-[2px] border border-[#CBD5E1] text-[9.5px]">
                    Shift+Click
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => fileInputCam2Ref.current?.click()}
                  className="p-0.5 text-[#334155] hover:bg-[#E2E8F0] rounded-[2px] transition-colors cursor-pointer"
                  title="Upload Video for Camera 2"
                >
                  <Upload className="w-3 h-3" />
                </button>
              </div>
            </div>

            <div
              ref={containerRefCam2}
              onContextMenu={(e) => e.preventDefault()}
              onWheel={(e) => handleWheelCamera(e, 'cam2')}
              onDoubleClick={(e) => {
                if (!e.shiftKey && !dragStickTarget) resetZoomAndPanCam2();
              }}
              className="flex-1 relative bg-[#0F172A] min-h-0 overflow-hidden select-none"
            >
              {videoUrlCam2 ? (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    width: canvasSizeCam2.width,
                    height: canvasSizeCam2.height,
                    transform: `translate3d(${panCam2.x}px, ${panCam2.y}px, 0) scale(${zoomCam2})`,
                    transformOrigin: '0 0',
                    transition: isPanningCam2 ? 'none' : 'transform 0.04s ease-out',
                    imageRendering: zoomCam2 >= 3.0 ? 'pixelated' : 'auto',
                  }}
                  className="rounded-[2px] overflow-hidden border border-[#334155] shadow-xl bg-black"
                >
                  <video
                    ref={videoRefCam2}
                    src={normalizeVideoUrl(videoUrlCam2)}
                    playsInline
                    muted
                    preload="auto"
                    onLoadedMetadata={() => {
                      handleLoadedMetadataCam2();
                      renderOverlay(canvasRefCam2.current, 'cam2');
                    }}
                    onDurationChange={() => {
                      handleLoadedMetadataCam2();
                      renderOverlay(canvasRefCam2.current, 'cam2');
                    }}
                    onSeeked={() => {
                      mediaDiagnostics.logEvent('cam2', 'seeked', videoRefCam2.current);
                      renderOverlay(canvasRefCam2.current, 'cam2');
                    }}
                    onCanPlay={() => {
                      mediaDiagnostics.logEvent('cam2', 'canplay', videoRefCam2.current);
                      renderOverlay(canvasRefCam2.current, 'cam2');
                    }}
                    onTimeUpdate={() => renderOverlay(canvasRefCam2.current, 'cam2')}
                    onPlay={() => mediaDiagnostics.logEvent('cam2', 'play', videoRefCam2.current)}
                    onPause={() => mediaDiagnostics.logEvent('cam2', 'pause', videoRefCam2.current)}
                    onRateChange={() => mediaDiagnostics.logEvent('cam2', 'ratechange', videoRefCam2.current)}
                    onWaiting={() => mediaDiagnostics.logEvent('cam2', 'waiting', videoRefCam2.current)}
                    onStalled={() => mediaDiagnostics.logEvent('cam2', 'stalled', videoRefCam2.current)}
                    onError={() => {
                      if (isChunkedCam2) {
                        setCam2Error(null);
                        return;
                      }
                      mediaDiagnostics.logEvent('cam2', 'error', videoRefCam2.current);
                      setCam2Error('Video codec in Camera 2 is not supported natively by this browser. A standard H.264 MP4 conversion is recommended.');
                    }}
                    className="block"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'fill',
                      display: 'block',
                      imageRendering: zoomCam2 >= 3.0 ? 'pixelated' : 'auto',
                    }}
                  />
                  <canvas
                    ref={canvasRefCam2}
                    width={canvasSizeCam2.width}
                    height={canvasSizeCam2.height}
                    onMouseDown={(e) => handleMouseDown(e, 'cam2')}
                    onMouseUp={(e) => handleMouseUp(e, 'cam2')}
                    onMouseEnter={() => setActiveCameraHover('cam2')}
                    onMouseLeave={() => {
                      setActiveCameraHover(null);
                      setIsPanningCam2(false);
                      if (pointerGestureRef.current?.camId === 'cam2') pointerGestureRef.current = null;
                    }}
                    onMouseMove={(e) => handleMouseMove(e, 'cam2')}
                    className="absolute inset-0 w-full h-full"
                    style={{
                      width: '100%',
                      height: '100%',
                      display: 'block',
                      cursor:
                        isPanningCam2 || dragStickTarget?.camId === 'cam2'
                          ? 'grabbing'
                          : isShiftPressed || !requireShiftToMark
                          ? 'crosshair'
                          : 'grab',
                      imageRendering: zoomCam2 >= 3.0 ? 'pixelated' : 'auto',
                    }}
                  />
                  {cam2Error && (
                    <div className="absolute inset-0 z-20 bg-slate-900/95 text-white flex flex-col items-center justify-center p-4 text-center select-text">
                      <AlertCircle className="w-7 h-7 text-amber-400 mb-1.5" />
                      <span className="font-bold text-xs mb-1">Camera 2 Codec Notice</span>
                      <span className="text-[11px] text-slate-300 max-w-sm mb-3">{cam2Error}</span>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputCam2Ref.current?.click()}
                          className="px-2.5 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-semibold rounded-[3px] cursor-pointer"
                        >
                          Select Other File
                        </button>
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('video-prep')}
                            className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-semibold rounded-[3px] cursor-pointer"
                          >
                            Video Prep Tips
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 select-none">
                  <div className="relative w-14 h-14 mb-2 border border-[#0284C7]/40 rounded-full flex items-center justify-center">
                    <div className="w-8 h-8 border border-[#0284C7]/30 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#0284C7]" />
                    </div>
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[#0284C7]/40" />
                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[#0284C7]/40" />
                  </div>
                  <span className="font-mono text-xs font-bold tracking-wider text-slate-300">
                    OPTICAL SENSOR 2 (CAM 2)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                    Capture Rate: {fpsCam2.toLocaleString()} fps. Drag &amp; drop video file here.
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputCam2Ref.current?.click()}
                    className="mt-2 px-3 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold rounded-[3px] flex items-center gap-1.5 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Load Video</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 8x Sub-Pixel Reticle Loupe Overlay for Stereo Cameras */}
        {isLoupeVisible && activeCameraHover && mouseCoord && (
          <div className="absolute top-8 right-3 bg-[#F1F3F5]/95 border border-[#CBD5E1] rounded-[3px] p-1.5 flex flex-col gap-1 pointer-events-none z-30 shadow-lg select-none">
            <div className="flex items-center justify-between text-[10px] font-bold text-[#1E293B] px-1 border-b border-[#CBD5E1] pb-0.5">
              <span className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${isShiftPressed ? 'bg-[#D97706]' : 'bg-[#2563EB]'}`} />
                <span>Loupe 8× ({activeCameraHover === 'cam1' ? 'CAM 1' : 'CAM 2'})</span>
              </span>
              <span className="font-mono text-[9px] text-[#334155] bg-white px-1 rounded-[2px] border border-[#CBD5E1]">
                {isShiftPressed ? 'SHIFT' : 'Sub-px'}
              </span>
            </div>
            <div className="relative w-32 h-32 bg-[#0F172A] rounded-[2px] border border-[#CBD5E1] overflow-hidden">
              <canvas
                ref={loupeCanvasRef}
                width={128}
                height={128}
                className="block w-full h-full"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <div className="text-[9.5px] font-mono text-[#1E293B] px-0.5 flex items-center justify-between tabular-nums">
              <span className="text-[#64748B]">u, v:</span>
              <strong className="text-[#2563EB] font-bold">
                {mouseCoord.x.toFixed(2)}, {mouseCoord.y.toFixed(2)} px
              </strong>
            </div>
          </div>
        )}
      </div>

      {/* Unified Master Transport & Scrubber Bar (with upward Sync / Offset Config Popover) */}
      <div className="bg-[#F1F3F5] border-t border-[#CBD5E1] px-2.5 py-1.5 space-y-1.5 text-xs select-none shrink-0 relative">
        {/* Upward Floating Sync / Offset & Solo Camera Popover (Kept mounted in DOM via hidden when closed) */}
        <div
          id="stereo-sync-offset-popover"
          className={`${
            showSyncPopover ? 'block' : 'hidden'
          } absolute bottom-full mb-1.5 right-2 z-50 w-[520px] max-w-[96vw] bg-white border border-[#CBD5E1] rounded-[3px] shadow-2xl p-2.5 text-[11px] text-[#1E293B] space-y-2.5`}
        >
          <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-1.5">
            <div className="flex items-center gap-2 font-bold text-[#1E293B]">
              <Sliders className="w-3.5 h-3.5 text-[#2563EB]" />
              <span>Stereo Frame Offset, Anchor Calibration &amp; Solo Transport</span>
            </div>
            <button
              type="button"
              onClick={() => setShowSyncPopover(false)}
              className="px-1.5 py-0.5 rounded-[2px] bg-[#F1F3F5] hover:bg-[#E2E8F0] text-[#475569] text-[10px] font-bold cursor-pointer"
            >
              Close
            </button>
          </div>

          {/* Anchor Pair & Sync Tolerance Row */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[3px] p-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-mono text-[10.5px]">
              <span className="text-[#475569] font-semibold">Anchors:</span>
              <span className="text-[#2563EB] font-bold">n(Cam1):</span>
              <input
                type="number"
                min="0"
                value={anchorCam1}
                onChange={(e) => {
                  const n = Math.max(0, parseInt(e.target.value, 10) || 0);
                  onUpdateTriangulation({
                    syncConfig: {
                      anchorFrameCam1: n,
                      anchorFrameCam2: anchorCam2,
                      fpsCam1,
                      fpsCam2,
                      toleranceSec: syncToleranceSec,
                      playbackMaster: triangulation.syncConfig?.playbackMaster || 'both',
                    },
                  });
                }}
                className="w-12 px-1 py-0.5 bg-white border border-[#CBD5E1] rounded-[2px] text-center font-bold"
                title="Camera 1 anchor frame n"
              />
              <span className="text-[#0284C7] font-bold ml-1">m(Cam2):</span>
              <input
                type="number"
                min="0"
                value={anchorCam2}
                onChange={(e) => {
                  const m = Math.max(0, parseInt(e.target.value, 10) || 0);
                  onUpdateTriangulation({
                    syncConfig: {
                      anchorFrameCam1: anchorCam1,
                      anchorFrameCam2: m,
                      fpsCam1,
                      fpsCam2,
                      toleranceSec: syncToleranceSec,
                      playbackMaster: triangulation.syncConfig?.playbackMaster || 'both',
                    },
                  });
                }}
                className="w-12 px-1 py-0.5 bg-white border border-[#CBD5E1] rounded-[2px] text-center font-bold"
                title="Camera 2 anchor frame m"
              />
              <span className="text-[#64748B] ml-1">
                (&Delta;t = {syncStatus.deltaTimeSyncMs.toFixed(2)} ms)
              </span>
            </div>

            <button
              id="btn-set-anchor-current"
              type="button"
              onClick={() => {
                onUpdateTriangulation({
                  syncConfig: {
                    anchorFrameCam1: currentFrame,
                    anchorFrameCam2: currentFrameCam2,
                    fpsCam1,
                    fpsCam2,
                    toleranceSec: syncToleranceSec,
                    playbackMaster: triangulation.syncConfig?.playbackMaster || 'both',
                  },
                });
              }}
              className="px-2 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-[3px] text-[10px] font-semibold transition-colors cursor-pointer"
              title="Lock current Cam 1 and Cam 2 frames as synchronized anchor pair"
            >
              Set Anchor to Current ({currentFrame} &harr; {currentFrameCam2})
            </button>
          </div>

          {/* Per-Camera Solo Transport & Frame Offset Steppers */}
          <div className="grid grid-cols-2 gap-2">
            {/* Cam 1 Solo Controls */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[3px] p-2 space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="font-bold text-[#1E293B]">CAM 1 SOLO</span>
                <span className="text-[#2563EB] font-bold">
                  F#{currentFrame} ({formatStereoTime(timeCam1, fpsCam1)})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onFrameChange(Math.max(clip.startFrame, currentFrame - 1))}
                  className="px-1.5 py-0.5 rounded-[2px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-mono text-[10px] cursor-pointer"
                >
                  -1
                </button>
                <button
                  id="btn-play-cam1"
                  type="button"
                  onClick={handleTogglePlayCam1}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-0.5 rounded-[2px] font-semibold text-[10px] border transition-colors cursor-pointer ${
                    isPlayingCam1
                      ? 'bg-[#D97706] text-white border-[#B45309]'
                      : 'bg-[#2563EB] text-white border-[#1D4ED8]'
                  }`}
                >
                  {isPlayingCam1 ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlayingCam1 ? 'Pause Cam 1' : 'Play Cam 1'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onFrameChange(Math.min(clip.endFrame, currentFrame + 1))}
                  className="px-1.5 py-0.5 rounded-[2px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-mono text-[10px] cursor-pointer"
                >
                  +1
                </button>
              </div>
            </div>

            {/* Cam 2 Solo Controls */}
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-[3px] p-2 space-y-1.5">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="font-bold text-[#1E293B]">CAM 2 SOLO</span>
                <span className="text-[#0284C7] font-bold">
                  F#{currentFrameCam2} ({formatStereoTime(timeCam2, fpsCam2)})
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setCurrentFrameCam2((prev) => Math.max(0, prev - 1))}
                  className="px-1.5 py-0.5 rounded-[2px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-mono text-[10px] cursor-pointer"
                >
                  -1
                </button>
                <button
                  id="btn-play-cam2"
                  type="button"
                  onClick={handleTogglePlayCam2}
                  className={`flex-1 flex items-center justify-center gap-1 px-2 py-0.5 rounded-[2px] font-semibold text-[10px] border transition-colors cursor-pointer ${
                    isPlayingCam2
                      ? 'bg-[#D97706] text-white border-[#B45309]'
                      : 'bg-[#2563EB] text-white border-[#1D4ED8]'
                  }`}
                >
                  {isPlayingCam2 ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  <span>{isPlayingCam2 ? 'Pause Cam 2' : 'Play Cam 2'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentFrameCam2((prev) => Math.min(endFrameCam2, prev + 1))}
                  className="px-1.5 py-0.5 rounded-[2px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-mono text-[10px] cursor-pointer"
                >
                  +1
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Scrubber Slider & Frame Readouts Row */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-[#1E293B]">
            <span className="text-[#64748B]">F:</span>
            <input
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
              className="w-13 px-1 py-0.5 rounded-[2px] border border-[#CBD5E1] bg-white text-[#1E293B] font-bold text-center outline-none"
              title="Master Camera 1 Frame index"
            />
          </div>

          <input
            id="dual-master-scrubber"
            type="range"
            min={clip.startFrame}
            max={clip.endFrame}
            step={clip.stepSize}
            value={currentFrame}
            onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 bg-[#CBD5E1] rounded-[2px] appearance-none cursor-pointer"
            title="Master synchronized scrubber (advances Cam 1 and phase-locks Cam 2)"
          />

          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[10.5px]">
            <span className="text-[#1E293B] font-bold">
              {formatStereoTime(timeCam1, fpsCam1)}
            </span>
            <span className="text-[#334155] font-semibold bg-white px-1.5 py-0.5 rounded-[2px] border border-[#CBD5E1]">
              Cam2: F#{currentFrameCam2}
            </span>
          </div>
        </div>

        {/* Master Playback Controls & Sync Popover Trigger Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onFrameChange(clip.startFrame)}
              className="p-1 rounded-[3px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] cursor-pointer"
              title="First Frame"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onFrameChange(Math.max(clip.startFrame, currentFrame - clip.stepSize))}
              className="px-2 py-0.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-mono text-[11px] cursor-pointer"
              title="Step Back"
            >
              -Step
            </button>

            <button
              id="btn-play-both"
              type="button"
              onClick={handleTogglePlayBoth}
              className="flex items-center gap-1 px-3 py-0.5 rounded-[3px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-semibold border border-[#1D4ED8] shadow-xs cursor-pointer text-[11px]"
              title="Play both cameras in frame-rate-synchronized lockstep"
            >
              {isPlayingBoth ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlayingBoth ? 'Pause Both' : 'Play Both (Sync)'}</span>
            </button>

            <button
              type="button"
              onClick={() => onFrameChange(Math.min(clip.endFrame, currentFrame + clip.stepSize))}
              className="px-2 py-0.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] font-mono text-[11px] cursor-pointer"
              title="Step Forward"
            >
              +Step
            </button>

            <button
              type="button"
              onClick={() => onFrameChange(clip.endFrame)}
              className="p-1 rounded-[3px] bg-white hover:bg-[#E2E8F0] border border-[#CBD5E1] text-[#1E293B] cursor-pointer"
              title="Last Frame"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-1 rounded-[3px] border cursor-pointer ${
                isLooping
                  ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                  : 'bg-white text-[#64748B] border-[#CBD5E1]'
              }`}
              title={isLooping ? 'Looping Enabled' : 'Looping Disabled'}
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Sync / Offset Config Popover Button */}
            <button
              id="btn-stereo-sync-popover"
              type="button"
              onClick={() => setShowSyncPopover((prev) => !prev)}
              className={`px-2 py-0.5 rounded-[3px] border text-[10.5px] font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                showSyncPopover
                  ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                  : 'bg-white hover:bg-[#E2E8F0] text-[#1E293B] border-[#CBD5E1]'
              }`}
              title="Open Camera 1 / Camera 2 Frame Offset, Anchor Pair & Solo Transport Popover"
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  syncStatus.status === 'synchronized'
                    ? 'bg-emerald-500'
                    : syncStatus.status === 'within_tolerance'
                    ? 'bg-amber-500'
                    : 'bg-red-500'
                }`}
              />
              <span>
                Sync [{anchorCam1}&harr;{anchorCam2}]
              </span>
            </button>

            <div className="flex items-center gap-1 text-[11px] text-[#334155] font-medium">
              <select
                value={playbackSpeed}
                onChange={(e) => handlePlaybackSpeedChange(parseFloat(e.target.value))}
                className="bg-white border border-[#CBD5E1] rounded-[3px] px-1.5 py-0.5 font-mono text-[10.5px] text-[#1E293B] font-semibold cursor-pointer"
                title="Playback Speed"
              >
                <option value="0.25">0.25x</option>
                <option value="0.5">0.5x</option>
                <option value="1">1.0x</option>
                <option value="2">2.0x</option>
              </select>
            </div>

            {onUndoLastPoint && (
              <button
                id="btn-stereo-transport-undo"
                type="button"
                onClick={onUndoLastPoint}
                disabled={canUndo !== undefined ? !canUndo : steps.length === 0}
                className="flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 disabled:pointer-events-none border border-[#CBD5E1] text-[#1E293B] text-[10.5px] font-semibold cursor-pointer"
                title={`Undo (Ctrl+Z)${undoCount > 0 ? ` • ${undoCount} action(s)` : ''}`}
              >
                <Undo2 className="w-3 h-3 text-[#2563EB]" />
                <span>Undo</span>
              </button>
            )}

            {onRedoLastPoint && (
              <button
                id="btn-stereo-transport-redo"
                type="button"
                onClick={onRedoLastPoint}
                disabled={!canRedo}
                className="flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 disabled:pointer-events-none border border-[#CBD5E1] text-[#1E293B] text-[10.5px] font-semibold cursor-pointer"
                title={`Redo (Ctrl+Y / Ctrl+Shift+Z)${redoCount > 0 ? ` • ${redoCount} action(s)` : ''}`}
              >
                <Redo2 className="w-3 h-3 text-[#2563EB]" />
                <span>Redo</span>
              </button>
            )}

            {currentStep && (
              <button
                type="button"
                onClick={() => onDeletePoint(currentFrame)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-[3px] text-[#DC2626] bg-white hover:bg-red-50 border border-[#CBD5E1] text-[10.5px] font-semibold cursor-pointer"
                title="Delete tracking point at current frame (Del)"
              >
                <Trash className="w-3 h-3" />
                <span>Del</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
