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
  Trash,
  AlertCircle,
  Film,
  Clock,
  Sparkles,
  Activity,
} from 'lucide-react';
import {
  triangulateDLT,
  buildDefaultDLT,
  calculateMultiRateFrameRatio,
  interpolateCameraCoordinates,
} from '../utils/triangulation';
import { ACCEPTED_VIDEO_ACCEPT_STRING, normalizeVideoUrl } from '../utils/videoFormats';
import { formatHighSpeedTime } from '../utils/highSpeedCameras';

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
  onUploadCam1?: (file: File) => void;
  onUploadCam2?: (file: File) => void;
  showTrails?: boolean;
  showVectors?: boolean;
  showLoupe?: boolean;
  autoAdvance?: boolean;
  requireShiftToMark?: boolean;
  onUndoLastPoint?: () => void;
  onOpenFormatsModal?: (tab?: FormatsModalTab) => void;
  onOpenTriangulationModal?: () => void;
  onRegisterSnapshotGetter?: (getter: () => string | null) => void;
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
  onUploadCam1,
  onUploadCam2,
  showTrails = true,
  showVectors = true,
  showLoupe = false,
  autoAdvance = true,
  requireShiftToMark = true,
  onUndoLastPoint,
  onOpenFormatsModal,
  onOpenTriangulationModal,
  onRegisterSnapshotGetter,
}) => {
  // Video, Canvas, and Input references
  const videoRefCam1 = useRef<HTMLVideoElement | null>(null);
  const videoRefCam2 = useRef<HTMLVideoElement | null>(null);
  const canvasRefCam1 = useRef<HTMLCanvasElement | null>(null);
  const canvasRefCam2 = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputCam1Ref = useRef<HTMLInputElement | null>(null);
  const fileInputCam2Ref = useRef<HTMLInputElement | null>(null);

  // Layout & Controls State
  const [dualLayout, setDualLayout] = useState<DualLayout>('side-by-side');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
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

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0] || {
    id: 'default',
    name: 'Point Mass A',
    color: '#3b82f6',
    mass: 0.1,
    steps: [],
  };
  const steps = activeTrack.steps || [];
  const currentStep = steps.find((s) => s.frame === currentFrame);

  // Multi-Rate Camera Timing & Synchronization
  const fpsCam1 = triangulation.fpsCam1 || clip.fps || 30;
  const fpsCam2 = triangulation.fpsCam2 || triangulation.fpsCam1 || clip.fps || 30;
  const timeOffsetSec = triangulation.timeOffsetCam2Sec || 0;
  const ratioInfo = calculateMultiRateFrameRatio(fpsCam1, fpsCam2);
  const isMultiRate = Math.abs(fpsCam1 - fpsCam2) > 0.01;

  // Master Physical Time (seconds)
  const masterTime = clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / fpsCam1);

  // Synchronized Frame on Camera 2 at masterTime
  const currentFrameCam2 = Math.max(0, Math.round((masterTime - timeOffsetSec) * fpsCam2));
  const timeCam2 = Math.max(0, masterTime - timeOffsetSec);

  // Decoupled container playback rate (e.g. 30fps container for 10,000fps sensor)
  const containerFps1 = clip.playbackFps || (fpsCam1 > 240 ? 30 : fpsCam1);
  const containerFps2 = clip.playbackFps || (fpsCam2 > 240 ? 30 : fpsCam2);

  // Warning timer ref
  const warningTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Listen for keyboard Shift press for marking safety
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setIsShiftPressed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
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

  // Frame Playback Loop
  useEffect(() => {
    if (!isPlaying) return;

    let animId: number;
    let lastTime = performance.now();
    // Playback rate: 1 frame per interval based on container playback or clip playback rate
    const effectivePlaybackFps = clip.playbackFps || (clip.fps > 240 ? 30 : clip.fps);
    const frameInterval = 1000 / (effectivePlaybackFps * playbackSpeed);

    const stepLoop = (now: number) => {
      const delta = now - lastTime;
      if (delta >= frameInterval) {
        onFrameChange(
          currentFrame + clip.stepSize > clip.endFrame
            ? clip.startFrame
            : currentFrame + clip.stepSize
        );
        lastTime = now - (delta % frameInterval);
      }
      animId = requestAnimationFrame(stepLoop);
    };

    animId = requestAnimationFrame(stepLoop);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentFrame, clip.stepSize, clip.startFrame, clip.endFrame, clip.fps, clip.playbackFps, playbackSpeed, onFrameChange]);

  // Video Loaded Metadata Handlers
  const handleLoadedMetadataCam1 = () => {
    const v = videoRefCam1.current;
    if (!v) return;
    setCanvasSizeCam1({ width: v.videoWidth || 640, height: v.videoHeight || 480 });
    v.currentTime = Math.max(0.001, currentFrame / containerFps1);
  };

  const handleLoadedMetadataCam2 = () => {
    const v = videoRefCam2.current;
    if (!v) return;
    setCanvasSizeCam2({ width: v.videoWidth || 640, height: v.videoHeight || 480 });
    v.currentTime = Math.max(0.001, currentFrameCam2 / containerFps2);
  };

  useEffect(() => {
    const v1 = videoRefCam1.current;
    if (v1 && videoUrlCam1 && v1.videoWidth) {
      setCanvasSizeCam1({ width: v1.videoWidth, height: v1.videoHeight });
      v1.currentTime = Math.max(0.001, currentFrame / containerFps1);
    }
  }, [videoUrlCam1, containerFps1]);

  useEffect(() => {
    const v2 = videoRefCam2.current;
    if (v2 && videoUrlCam2 && v2.videoWidth) {
      setCanvasSizeCam2({ width: v2.videoWidth, height: v2.videoHeight });
      v2.currentTime = Math.max(0.001, currentFrameCam2 / containerFps2);
    }
  }, [videoUrlCam2, containerFps2, currentFrameCam2]);

  // Synchronize HTML5 video elements to current physical frame
  useEffect(() => {
    const seekTime1 = Math.max(0.001, currentFrame / containerFps1);
    const seekTime2 = Math.max(0.001, currentFrameCam2 / containerFps2);

    if (videoRefCam1.current && videoUrlCam1) {
      if (Math.abs(videoRefCam1.current.currentTime - seekTime1) > 0.002 || videoRefCam1.current.currentTime === 0) {
        try {
          videoRefCam1.current.currentTime = seekTime1;
        } catch {
          // ignore
        }
      }
    }
    if (videoRefCam2.current && videoUrlCam2) {
      if (Math.abs(videoRefCam2.current.currentTime - seekTime2) > 0.002 || videoRefCam2.current.currentTime === 0) {
        try {
          videoRefCam2.current.currentTime = seekTime2;
        } catch {
          // ignore
        }
      }
    }
  }, [currentFrame, currentFrameCam2, containerFps1, containerFps2, videoUrlCam1, videoUrlCam2]);

  // Render on Cam 1 & Cam 2 canvases
  const renderOverlay = useCallback(
    (canvas: HTMLCanvasElement | null, camId: 'cam1' | 'cam2') => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // 0. Paint video frame directly to canvas if present
      if (camId === 'cam1' && videoRefCam1.current && videoRefCam1.current.readyState >= 2) {
        try {
          ctx.drawImage(videoRefCam1.current, 0, 0, width, height);
        } catch {
          // ignore
        }
      } else if (camId === 'cam2' && videoRefCam2.current && videoRefCam2.current.readyState >= 2) {
        try {
          ctx.drawImage(videoRefCam2.current, 0, 0, width, height);
        } catch {
          // ignore
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
    },
    [
      triangulation,
      steps,
      currentFrame,
      showTrails,
      activeTrack.color,
      activeCameraHover,
      mouseCoord,
    ]
  );

  // Trigger render on frame or state change
  useEffect(() => {
    renderOverlay(canvasRefCam1.current, 'cam1');
    renderOverlay(canvasRefCam2.current, 'cam2');
  }, [renderOverlay, currentFrame, steps, canvasSizeCam1, canvasSizeCam2]);

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

  // Handle Mouse movement on canvas with coordinate scaling
  const handleMouseMove = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId: 'cam1' | 'cam2'
  ) => {
    const canvas = camId === 'cam1' ? canvasRefCam1.current : canvasRefCam2.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = Math.round((e.clientX - rect.left) * scaleX);
    const py = Math.round((e.clientY - rect.top) * scaleY);
    setMouseCoord({ x: px, y: py });
  };

  // Canvas Click: Mark tracking point on Cam 1 or Cam 2 with Asynchronous Sub-Frame Interpolation
  const handleCanvasClick = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId: 'cam1' | 'cam2'
  ) => {
    if (requireShiftToMark && !e.shiftKey) {
      setShowShiftWarning(true);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      warningTimerRef.current = setTimeout(() => setShowShiftWarning(false), 3000);
      return;
    }

    const canvas = camId === 'cam1' ? canvasRefCam1.current : canvasRefCam2.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const px = Math.round((e.clientX - rect.left) * scaleX);
    const py = Math.round((e.clientY - rect.top) * scaleY);

    const time = masterTime;

    // Existing point for this frame or master time?
    const existing = steps.find((s) => s.frame === currentFrame);

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

    // Precise Asymmetric & Mismatched Frame Rate Interpolation:
    // If one camera is marked and the other is not yet marked on this exact frame,
    // evaluate whether the other camera has marked points across the sequence.
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
          newCam2 = { px: Math.round(interpResult.px), py: Math.round(interpResult.py) };
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
          newCam1 = { px: Math.round(interpResult.px), py: Math.round(interpResult.py) };
          isInterpolatedCam1 = !interpResult.isExact;
          temporalDelta = interpResult.timeDelta;
        }
      }
    }

    // Triangulate if both camera projections are available!
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
      frame: currentFrame,
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
      triangulationResidual: residual,
    };

    onAddPoint3D(newPointStep);

    // Auto-advance if both cameras are marked or auto-step is triggered
    if (autoAdvance && newCam1 && newCam2) {
      if (currentFrame + clip.stepSize <= clip.endFrame) {
        onFrameChange(currentFrame + clip.stepSize);
      }
    }
  };

  // Magnifier Loupe Rendering
  useEffect(() => {
    if (!showLoupe || !mouseCoord || !activeCameraHover) return;
    const loupe = loupeCanvasRef.current;
    const sourceCanvas =
      activeCameraHover === 'cam1' ? canvasRefCam1.current : canvasRefCam2.current;

    if (!loupe || !sourceCanvas) return;
    const loupeCtx = loupe.getContext('2d');
    if (!loupeCtx) return;

    const zoom = 2.5;
    const diameter = 110;
    const radius = diameter / 2;
    loupe.width = diameter;
    loupe.height = diameter;

    loupeCtx.clearRect(0, 0, diameter, diameter);

    // Circular clipping
    loupeCtx.save();
    loupeCtx.beginPath();
    loupeCtx.arc(radius, radius, radius, 0, Math.PI * 2);
    loupeCtx.clip();

    // Fill background
    loupeCtx.fillStyle = '#0f172a';
    loupeCtx.fillRect(0, 0, diameter, diameter);

    const sourceVideo =
      activeCameraHover === 'cam1' ? videoRefCam1.current : videoRefCam2.current;

    if (sourceVideo && sourceVideo.readyState >= 2) {
      loupeCtx.drawImage(
        sourceVideo,
        mouseCoord.x - radius / zoom,
        mouseCoord.y - radius / zoom,
        diameter / zoom,
        diameter / zoom,
        0,
        0,
        diameter,
        diameter
      );
    }

    loupeCtx.drawImage(
      sourceCanvas,
      mouseCoord.x - radius / zoom,
      mouseCoord.y - radius / zoom,
      diameter / zoom,
      diameter / zoom,
      0,
      0,
      diameter,
      diameter
    );

    // High-precision reticle crosshair inside loupe
    loupeCtx.strokeStyle = 'rgba(239, 68, 68, 0.9)';
    loupeCtx.lineWidth = 1;
    loupeCtx.beginPath();
    loupeCtx.moveTo(radius - 12, radius);
    loupeCtx.lineTo(radius + 12, radius);
    loupeCtx.moveTo(radius, radius - 12);
    loupeCtx.lineTo(radius, radius + 12);
    loupeCtx.stroke();

    loupeCtx.restore();

    // Outer border
    loupeCtx.strokeStyle = '#1e293b';
    loupeCtx.lineWidth = 2.5;
    loupeCtx.beginPath();
    loupeCtx.arc(radius, radius, radius - 2, 0, Math.PI * 2);
    loupeCtx.stroke();
  }, [showLoupe, mouseCoord, activeCameraHover]);

  return (
    <div id="dual-video-player-stage" className="flex flex-col h-full bg-[#d4d0c8] select-none">
      {/* Top Dual View Control Toolbar */}
      <div className="bg-[#d4d0c8] border-b border-[#808080] px-3 py-1.5 flex items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-bold text-black flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-[#1e3a5f]" />
            3D Stereo Optical Tracking
          </span>

          <div className="flex items-center gap-1 bg-white border border-[#808080] rounded-[2px] px-1.5 py-0.5 text-[11px] font-mono text-black">
            <span className="text-[#333333]">Geometry:</span>
            <strong className="text-black font-bold capitalize">
              {triangulation.method.replace(/-/g, ' ')}
            </strong>
          </div>

          {/* Asynchronous Multi-Rate Status Badge */}
          {isMultiRate ? (
            <div className="flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-[2px] px-1.5 py-0.5 text-[10px] font-mono text-amber-900 font-bold">
              <Clock className="w-3 h-3 text-amber-700" />
              <span>Async Multi-Rate [{ratioInfo.ratioStr}]</span>
              <span className="text-amber-700 font-normal hidden sm:inline">
                ({(triangulation.temporalInterpolation || 'cubic-spline').replace('-', ' ')})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 bg-emerald-50 border border-emerald-300 rounded-[2px] px-1.5 py-0.5 text-[10px] font-mono text-emerald-900 font-bold">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>Synchronous (1:1)</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onOpenTriangulationModal && (
            <button
              type="button"
              onClick={onOpenTriangulationModal}
              className="flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-white hover:bg-[#efefef] border border-[#808080] text-black text-[11px] font-semibold transition-colors"
              title="Configure Stereo Geometry, Frame Rates & Sub-Frame Spline Sync"
            >
              <Sliders className="w-3 h-3 text-[#1e3a5f]" />
              <span>Multi-Rate Sync Setup</span>
            </button>
          )}

          {/* Layout Switcher */}
          <div className="flex bg-[#efefef] border border-[#808080] p-0.5 rounded-[3px] text-[11px]">
            <button
              type="button"
              onClick={() => setDualLayout('side-by-side')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold transition-colors ${
                dualLayout === 'side-by-side' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
              }`}
            >
              Dual Feed
            </button>
            <button
              type="button"
              onClick={() => setDualLayout('cam1-focus')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold transition-colors ${
                dualLayout === 'cam1-focus' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
              }`}
            >
              Cam 1
            </button>
            <button
              type="button"
              onClick={() => setDualLayout('cam2-focus')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold transition-colors ${
                dualLayout === 'cam2-focus' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
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
      <div className="flex-1 flex min-h-0 relative overflow-hidden bg-[#d4d0c8] p-2 gap-2">
        {/* Accidental Click Interception Toast Notice */}
        {showShiftWarning && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1e3a5f] text-white px-3.5 py-1.5 rounded-[3px] border border-[#0f1d30] shadow-lg flex items-center gap-2 text-xs font-mono pointer-events-none z-30 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            <span>
              <strong>Tracker OSP Stereo Safety:</strong> Hold <span className="underline font-bold text-amber-300">Shift + Click</span> on Camera 1 or Camera 2 to mark coordinates.
            </span>
          </div>
        )}

        {/* Camera 1 Viewport */}
        {(dualLayout === 'side-by-side' || dualLayout === 'cam1-focus') && (
          <div
            className="flex-1 flex flex-col h-full bg-white border border-[#808080] rounded-[3px] overflow-hidden relative"
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
              <div className="absolute inset-0 z-30 bg-[#1e3a5f]/85 border-2 border-dashed border-white text-white flex flex-col items-center justify-center pointer-events-none">
                <Upload className="w-8 h-8 mb-2 animate-bounce" />
                <span className="font-bold text-xs">Drop Video to Load into Camera 1</span>
                <span className="text-[10px] text-blue-200">MP4, MOV, WebM, AVI, MKV, etc.</span>
              </div>
            )}
            <div className="bg-[#e0e0e0] border-b border-[#808080] px-2 py-1 flex items-center justify-between text-[11px] shrink-0">
              <div className="flex items-center gap-1.5 font-bold text-black">
                <span className="w-2 h-2 rounded-full bg-[#1e3a5f]" />
                <span>Camera 1 (Front View X-Y)</span>
                <span className="font-mono text-[10px] text-[#555555] font-normal">
                  [{fpsCam1.toLocaleString()} fps]
                </span>
              </div>
              <div className="flex items-center gap-1">
                {currentStep?.cam1 ? (
                  <span className="text-black bg-white px-1.5 py-0.5 rounded-[2px] border border-[#808080] font-mono text-[10px] flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-[#1e3a5f]" />
                    ({currentStep.cam1.px}, {currentStep.cam1.py})
                  </span>
                ) : (
                  <span className="text-black bg-[#efefef] px-1.5 py-0.5 rounded-[2px] border border-[#808080] text-[10px] font-medium">
                    Shift+Click to mark
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => fileInputCam1Ref.current?.click()}
                  className="p-1 text-black hover:bg-[#dcdcdc] rounded-[2px] transition-colors"
                  title="Upload Video for Camera 1 (MP4, MOV, WebM, AVI, MKV, etc.)"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative bg-[#111111] flex items-center justify-center p-1.5 min-h-0 overflow-hidden">
              {videoUrlCam1 ? (
                <div className="relative rounded-[2px] overflow-hidden border border-[#444444] max-w-full max-h-full flex items-center justify-center">
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
                    onSeeked={() => renderOverlay(canvasRefCam1.current, 'cam1')}
                    onCanPlay={() => renderOverlay(canvasRefCam1.current, 'cam1')}
                    onTimeUpdate={() => renderOverlay(canvasRefCam1.current, 'cam1')}
                    onError={() => {
                      setCam1Error('Video codec in Camera 1 is not supported natively by this browser. A standard H.264 MP4 conversion is recommended.');
                    }}
                    className="block object-contain"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 'calc(100vh - 270px)',
                      display: 'block',
                    }}
                  />
                  <canvas
                    ref={canvasRefCam1}
                    width={canvasSizeCam1.width}
                    height={canvasSizeCam1.height}
                    onClick={(e) => handleCanvasClick(e, 'cam1')}
                    onMouseEnter={() => setActiveCameraHover('cam1')}
                    onMouseLeave={() => setActiveCameraHover(null)}
                    onMouseMove={(e) => handleMouseMove(e, 'cam1')}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                  />
                  {cam1Error && (
                    <div className="absolute inset-0 z-20 bg-slate-900/95 text-white flex flex-col items-center justify-center p-4 text-center select-text">
                      <AlertCircle className="w-7 h-7 text-amber-400 mb-1.5 animate-pulse" />
                      <span className="font-bold text-xs mb-1">Camera 1 Codec Notice</span>
                      <span className="text-[11px] text-slate-300 max-w-sm mb-3">{cam1Error}</span>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputCam1Ref.current?.click()}
                          className="px-2.5 py-1 bg-[#1e3a5f] hover:bg-[#2a4d7d] text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                        >
                          Select Other File
                        </button>
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('video-prep')}
                            className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Video Prep Tips
                          </button>
                        )}
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('why-codecs')}
                            className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Why Tracker Worked
                          </button>
                        )}
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('converters')}
                            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Converter Tools
                          </button>
                        )}
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('electron-exe')}
                            className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Windows .EXE Setup
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4 select-none">
                  <div className="relative w-16 h-16 mb-2 border border-[#3b82f6]/40 rounded-full flex items-center justify-center">
                    <div className="w-10 h-10 border border-[#3b82f6]/30 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-[#3b82f6]" />
                    </div>
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-[#3b82f6]/40" />
                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-[#3b82f6]/40" />
                  </div>
                  <span className="font-mono text-xs font-bold tracking-wider text-slate-300">
                    OPTICAL SENSOR 1 (CAM 1)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                    Capture Rate: {fpsCam1.toLocaleString()} fps. Drag & drop video file here.
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputCam1Ref.current?.click()}
                    className="mt-2.5 px-3 py-1 bg-[#1e3a5f] hover:bg-[#2a4d7d] text-white text-xs font-semibold rounded-[2px] border border-[#3b82f6]/50 flex items-center gap-1.5"
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
            className="flex-1 flex flex-col h-full bg-white border border-[#808080] rounded-[3px] overflow-hidden relative"
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
              <div className="absolute inset-0 z-30 bg-[#1e3a5f]/85 border-2 border-dashed border-white text-white flex flex-col items-center justify-center pointer-events-none">
                <Upload className="w-8 h-8 mb-2 animate-bounce" />
                <span className="font-bold text-xs">Drop Video to Load into Camera 2</span>
                <span className="text-[10px] text-blue-200">MP4, MOV, WebM, AVI, MKV, etc.</span>
              </div>
            )}
            <div className="bg-[#e0e0e0] border-b border-[#808080] px-2 py-1 flex items-center justify-between text-[11px] shrink-0">
              <div className="flex items-center gap-1.5 font-bold text-black">
                <span className="w-2 h-2 rounded-full bg-emerald-700" />
                <span>Camera 2 (Side/Angle View Z-Y)</span>
                <span className="font-mono text-[10px] text-[#555555] font-normal">
                  [{fpsCam2.toLocaleString()} fps]
                </span>
                {isMultiRate && (
                  <span className="bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.2 rounded text-[9px] font-mono">
                    Frame #{currentFrameCam2}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {currentStep?.cam2 ? (
                  <span className="text-black bg-white px-1.5 py-0.5 rounded-[2px] border border-[#808080] font-mono text-[10px] flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-700" />
                    ({currentStep.cam2.px}, {currentStep.cam2.py})
                    {currentStep.isInterpolatedCam2 && (
                      <span className="text-amber-700 font-bold ml-0.5" title="Sub-frame continuous spline interpolated point">
                        [~]
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-black bg-[#efefef] px-1.5 py-0.5 rounded-[2px] border border-[#808080] text-[10px] font-medium">
                    Shift+Click to mark
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => fileInputCam2Ref.current?.click()}
                  className="p-1 text-black hover:bg-[#dcdcdc] rounded-[2px] transition-colors"
                  title="Upload Video for Camera 2 (MP4, MOV, WebM, AVI, MKV, etc.)"
                >
                  <Upload className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 relative bg-[#111111] flex items-center justify-center p-1.5 min-h-0 overflow-hidden">
              {videoUrlCam2 ? (
                <div className="relative rounded-[2px] overflow-hidden border border-[#444444] max-w-full max-h-full flex items-center justify-center">
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
                    onSeeked={() => renderOverlay(canvasRefCam2.current, 'cam2')}
                    onCanPlay={() => renderOverlay(canvasRefCam2.current, 'cam2')}
                    onTimeUpdate={() => renderOverlay(canvasRefCam2.current, 'cam2')}
                    onError={() => {
                      setCam2Error('Video codec in Camera 2 is not supported natively by this browser. A standard H.264 MP4 conversion is recommended.');
                    }}
                    className="block object-contain"
                    style={{
                      maxWidth: '100%',
                      maxHeight: 'calc(100vh - 270px)',
                      display: 'block',
                    }}
                  />
                  <canvas
                    ref={canvasRefCam2}
                    width={canvasSizeCam2.width}
                    height={canvasSizeCam2.height}
                    onClick={(e) => handleCanvasClick(e, 'cam2')}
                    onMouseEnter={() => setActiveCameraHover('cam2')}
                    onMouseLeave={() => setActiveCameraHover(null)}
                    onMouseMove={(e) => handleMouseMove(e, 'cam2')}
                    className="absolute inset-0 w-full h-full cursor-crosshair"
                  />
                  {cam2Error && (
                    <div className="absolute inset-0 z-20 bg-slate-900/95 text-white flex flex-col items-center justify-center p-4 text-center select-text">
                      <AlertCircle className="w-7 h-7 text-amber-400 mb-1.5 animate-pulse" />
                      <span className="font-bold text-xs mb-1">Camera 2 Codec Notice</span>
                      <span className="text-[11px] text-slate-300 max-w-sm mb-3">{cam2Error}</span>
                      <div className="flex flex-wrap items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => fileInputCam2Ref.current?.click()}
                          className="px-2.5 py-1 bg-[#1e3a5f] hover:bg-[#2a4d7d] text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                        >
                          Select Other File
                        </button>
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('video-prep')}
                            className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Video Prep Tips
                          </button>
                        )}
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('why-codecs')}
                            className="px-2.5 py-1 bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Why Tracker Worked
                          </button>
                        )}
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('converters')}
                            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Converter Tools
                          </button>
                        )}
                        {onOpenFormatsModal && (
                          <button
                            type="button"
                            onClick={() => onOpenFormatsModal('electron-exe')}
                            className="px-2.5 py-1 bg-white/20 hover:bg-white/30 text-white text-[11px] font-semibold rounded-[2px] cursor-pointer"
                          >
                            Windows .EXE Setup
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4 select-none">
                  <div className="relative w-16 h-16 mb-2 border border-emerald-500/40 rounded-full flex items-center justify-center">
                    <div className="w-10 h-10 border border-emerald-500/30 rounded-full flex items-center justify-center">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    </div>
                    <div className="absolute inset-x-0 top-1/2 h-[1px] bg-emerald-500/40" />
                    <div className="absolute inset-y-0 left-1/2 w-[1px] bg-emerald-500/40" />
                  </div>
                  <span className="font-mono text-xs font-bold tracking-wider text-slate-300">
                    OPTICAL SENSOR 2 (CAM 2)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                    Capture Rate: {fpsCam2.toLocaleString()} fps. Drag & drop video file here.
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputCam2Ref.current?.click()}
                    className="mt-2.5 px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-[2px] border border-emerald-500/50 flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Load Video</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sub-Pixel Reticle Loupe Overlay */}
        {showLoupe && activeCameraHover && (
          <div className="absolute top-4 right-4 pointer-events-none z-30 rounded-full overflow-hidden border-2 border-[#808080] bg-white">
            <canvas ref={loupeCanvasRef} className="block w-[110px] h-[110px]" />
          </div>
        )}
      </div>

      {/* Synchronized Playback and Scrubber Bar */}
      <div className="bg-[#d4d0c8] border-t border-[#808080] p-2.5 space-y-2 text-xs select-none shrink-0">
        {/* Scrubber slider & Frame Input */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 text-[11px] font-mono font-semibold text-black">
            <span className="text-[#333333]">Cam1 F:</span>
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
              className="w-14 px-1 py-0.5 rounded-[2px] border border-[#808080] bg-white text-black font-bold text-center outline-none"
              title="Camera 1 Frame index"
            />
          </div>

          <input
            type="range"
            min={clip.startFrame}
            max={clip.endFrame}
            step={clip.stepSize}
            value={currentFrame}
            onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 bg-[#999999] border border-[#808080] rounded-[2px] appearance-none cursor-pointer"
          />

          {/* Time & Dual Sync Badge */}
          <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
            <span className="text-[#1e3a5f] font-bold">
              {formatHighSpeedTime(masterTime, fpsCam1, clip.timeUnit)}
            </span>
            {isMultiRate && (
              <span className="text-emerald-800 font-semibold text-[10px] bg-emerald-100 px-1 py-0.2 rounded border border-emerald-300">
                Cam2: F#{currentFrameCam2} ({formatHighSpeedTime(timeCam2, fpsCam2, clip.timeUnit)})
              </span>
            )}
          </div>
        </div>

        {/* Controls Row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onFrameChange(clip.startFrame)}
              className="p-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black"
              title="First Frame"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onFrameChange(Math.max(clip.startFrame, currentFrame - clip.stepSize))}
              className="px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black font-mono text-[11px]"
              title="Step Back"
            >
              -Step
            </button>

            <button
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="flex items-center gap-1 px-3 py-1 rounded-[3px] bg-[#1e3a5f] hover:bg-[#152843] active:bg-[#0f1d30] text-white font-semibold border border-[#0f1d30]"
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              <span>{isPlaying ? 'Pause' : 'Play Both'}</span>
            </button>

            <button
              type="button"
              onClick={() => onFrameChange(Math.min(clip.endFrame, currentFrame + clip.stepSize))}
              className="px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black font-mono text-[11px]"
              title="Step Forward"
            >
              +Step
            </button>

            <button
              type="button"
              onClick={() => onFrameChange(clip.endFrame)}
              className="p-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black"
              title="Last Frame"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            {/* Shift+Click Status Badge */}
            {requireShiftToMark && (
              <div
                className={`ml-2 px-2 py-0.5 rounded-[3px] border text-[10px] font-mono flex items-center gap-1 ${
                  isShiftPressed
                    ? 'bg-amber-100 border-amber-600 text-amber-950 font-bold'
                    : 'bg-[#efefef] border-[#808080] text-black font-medium'
                }`}
              >
                <span>Mark:</span>
                <strong className={isShiftPressed ? 'text-amber-800 underline' : 'text-emerald-700'}>
                  {isShiftPressed ? 'READY [Shift]' : 'SAFE [Hold Shift]'}
                </strong>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[11px] text-black font-medium">
              <span>Speed:</span>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="bg-[#efefef] border border-[#808080] rounded-[3px] px-1 py-0.5 font-mono text-[11px] text-black font-bold cursor-pointer"
              >
                <option value="0.25">0.25x</option>
                <option value="0.5">0.5x</option>
                <option value="1">1.0x</option>
                <option value="2">2.0x</option>
              </select>
            </div>

            {onUndoLastPoint && (
              <button
                type="button"
                onClick={onUndoLastPoint}
                className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black text-[11px] font-semibold"
                title="Undo last point (Ctrl+Z)"
              >
                <Undo2 className="w-3 h-3 text-[#1e3a5f]" />
                <span>Undo</span>
              </button>
            )}

            {currentStep && (
              <button
                type="button"
                onClick={() => onDeletePoint(currentFrame)}
                className="flex items-center gap-1 px-2 py-1 rounded-[3px] text-[#8b0000] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-[11px] font-semibold"
                title="Delete tracking point at current frame (Del)"
              >
                <Trash className="w-3 h-3" />
                <span>Clear Frame Mark</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
