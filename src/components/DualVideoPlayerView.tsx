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
} from 'lucide-react';
import { triangulateDLT, buildDefaultDLT } from '../utils/triangulation';

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
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Shift key monitor for Tracker OSP mark mode
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

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const steps = activeTrack ? activeTrack.steps : [];
  const currentStep = steps.find((s) => s.frame === currentFrame);

  const currentFrameRef = useRef<number>(currentFrame);
  useEffect(() => {
    currentFrameRef.current = currentFrame;
  }, [currentFrame]);

  // Playback timer loop
  useEffect(() => {
    let intervalId: any = null;
    if (isPlaying) {
      const stepIntervalMs = (clip.stepSize / (clip.fps * playbackSpeed)) * 1000;
      intervalId = setInterval(() => {
        const next = currentFrameRef.current + clip.stepSize;
        if (next > clip.endFrame) {
          setIsPlaying(false);
          onFrameChange(clip.startFrame);
        } else {
          onFrameChange(next);
        }
      }, Math.max(16, stepIntervalMs));
    }
    return () => clearInterval(intervalId);
  }, [isPlaying, clip.startFrame, clip.endFrame, clip.stepSize, clip.fps, playbackSpeed, onFrameChange]);

  // Video metadata loaders to lock exact pixel bounds and video duration
  const handleLoadedMetadataCam1 = () => {
    const v = videoRefCam1.current;
    if (!v) return;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    setCanvasSizeCam1({ width: w, height: h });
    if (v.duration && Number.isFinite(v.duration) && v.duration > 0) {
      const totalFrames = Math.max(10, Math.round(v.duration * clip.fps));
      onUpdateClip({
        totalFrames,
        endFrame: totalFrames - 1,
      });
    }
    v.currentTime = Math.max(0.001, clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps));
  };

  const handleLoadedMetadataCam2 = () => {
    const v = videoRefCam2.current;
    if (!v) return;
    const w = v.videoWidth || 640;
    const h = v.videoHeight || 480;
    setCanvasSizeCam2({ width: w, height: h });
    if (v.duration && Number.isFinite(v.duration) && v.duration > 0) {
      const totalFrames = Math.max(10, Math.round(v.duration * clip.fps));
      onUpdateClip({
        totalFrames,
        endFrame: totalFrames - 1,
      });
    }
    v.currentTime = Math.max(0.001, clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps));
  };

  // Video URL reload handlers
  useEffect(() => {
    const v1 = videoRefCam1.current;
    if (v1 && videoUrlCam1) {
      v1.load();
      v1.currentTime = Math.max(0.001, clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps));
    }
  }, [videoUrlCam1]);

  useEffect(() => {
    const v2 = videoRefCam2.current;
    if (v2 && videoUrlCam2) {
      v2.load();
      v2.currentTime = Math.max(0.001, clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps));
    }
  }, [videoUrlCam2]);

  // Sync HTML5 video elements to frame if video sources are provided
  useEffect(() => {
    const time = Math.max(0.001, clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps));
    if (videoRefCam1.current && videoUrlCam1) {
      if (Math.abs(videoRefCam1.current.currentTime - time) > 0.03) {
        videoRefCam1.current.currentTime = time;
      }
    }
    if (videoRefCam2.current && videoUrlCam2) {
      if (Math.abs(videoRefCam2.current.currentTime - time) > 0.03) {
        videoRefCam2.current.currentTime = time;
      }
    }
  }, [currentFrame, clip.startTime, clip.frameDt, clip.dt, clip.fps, videoUrlCam1, videoUrlCam2]);

  // Render on Cam 1 & Cam 2 canvases (Transparent scientific overlay)
  const renderOverlay = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      camId: 'cam1' | 'cam2'
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // 1. Draw origin crosshair & coordinate axes for this camera
      const origin = camId === 'cam1' ? triangulation.originCam1 : triangulation.originCam2;
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.8)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x - 24, origin.y);
      ctx.lineTo(origin.x + 24, origin.y);
      ctx.moveTo(origin.x, origin.y - 24);
      ctx.lineTo(origin.x, origin.y + 24);
      ctx.stroke();

      // Axis labels
      ctx.fillStyle = '#2563eb';
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

      // 3. Draw TrackEye-style Reticles for tracked points on this camera
      steps.forEach((s) => {
        const pt = camId === 'cam1' ? s.cam1 : s.cam2;
        if (!pt) return;

        const isCur = s.frame === currentFrame;

        // Reticle colors
        const strokeColor = isCur ? '#ef4444' : (activeTrack.color || '#3b82f6');
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = isCur ? 2 : 1.2;

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

        // Point label
        if (isCur) {
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 10px monospace';
          ctx.fillText(`P#${s.frame}`, pt.px + 10, pt.py - 10);
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

  // Handle Marking point on Camera 1 or Camera 2
  const handleCanvasClick = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId: 'cam1' | 'cam2'
  ) => {
    // Enforce Shift+Click for marking to prevent accidental clicks
    if (requireShiftToMark && !e.shiftKey && !isShiftPressed) {
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

    // Existing point for this frame?
    const existing = steps.find((s) => s.frame === currentFrame);

    let newCam1 = existing?.cam1 || null;
    let newCam2 = existing?.cam2 || null;

    if (camId === 'cam1') newCam1 = { px, py };
    else newCam2 = { px, py };

    const time = clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps);

    // Triangulate if both cameras have marks!
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
      // 2D projection estimate until Cam 2 is marked
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

    const zoomFactor = 3.5;
    const radius = 55;
    const size = radius * 2;

    loupe.width = size;
    loupe.height = size;

    loupeCtx.clearRect(0, 0, size, size);

    // Circular clip
    loupeCtx.save();
    loupeCtx.beginPath();
    loupeCtx.arc(radius, radius, radius - 2, 0, Math.PI * 2);
    loupeCtx.clip();

    // Source coordinates
    const sx = mouseCoord.x - radius / zoomFactor;
    const sy = mouseCoord.y - radius / zoomFactor;
    const sWidth = size / zoomFactor;
    const sHeight = size / zoomFactor;

    loupeCtx.drawImage(sourceCanvas, sx, sy, sWidth, sHeight, 0, 0, size, size);

    // Reticle crosshair
    loupeCtx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
    loupeCtx.lineWidth = 1;
    loupeCtx.beginPath();
    loupeCtx.moveTo(radius, 0);
    loupeCtx.lineTo(radius, size);
    loupeCtx.moveTo(0, radius);
    loupeCtx.lineTo(size, radius);
    loupeCtx.stroke();

    // Center target circle
    loupeCtx.strokeStyle = '#2563eb';
    loupeCtx.lineWidth = 1.5;
    loupeCtx.beginPath();
    loupeCtx.arc(radius, radius, 4, 0, Math.PI * 2);
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
      <div className="bg-[#d4d0c8] border-b border-[#808080] px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-black flex items-center gap-1.5">
            <Camera className="w-4 h-4 text-black" />
            3D Dual-Feed Triangulation
          </span>
          <div className="flex items-center gap-1 bg-white border border-[#808080] rounded-[2px] px-1.5 py-0.5 text-[11px] font-mono text-black">
            <span className="text-[#333333]">Method:</span>
            <strong className="text-black font-bold capitalize">
              {triangulation.method.replace(/-/g, ' ')}
            </strong>
          </div>
        </div>

        {/* Layout Switcher */}
        <div className="flex items-center gap-1.5">
          <div className="flex bg-[#efefef] border border-[#808080] p-0.5 rounded-[3px] text-[11px]">
            <button
              type="button"
              onClick={() => setDualLayout('side-by-side')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold transition-colors ${
                dualLayout === 'side-by-side' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
              }`}
            >
              Side-by-Side
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
        accept="video/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onUploadCam1?.(e.target.files[0])}
      />
      <input
        ref={fileInputCam2Ref}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && onUploadCam2?.(e.target.files[0])}
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
          <div className="flex-1 flex flex-col h-full bg-white border border-[#808080] rounded-[3px] overflow-hidden relative">
            <div className="bg-[#e0e0e0] border-b border-[#808080] px-2 py-1 flex items-center justify-between text-[11px] shrink-0">
              <div className="flex items-center gap-1.5 font-bold text-black">
                <span className="w-2 h-2 rounded-full bg-[#1e3a5f]" />
                Camera 1 (Front View X-Y)
              </div>
              <div className="flex items-center gap-1">
                {currentStep?.cam1 ? (
                  <span className="text-black bg-white px-1.5 py-0.5 rounded-[2px] border border-[#808080] font-mono text-[10px] flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-black" />
                    ({currentStep.cam1.px}, {currentStep.cam1.py})
                  </span>
                ) : (
                  <span className="text-black bg-[#efefef] px-1.5 py-0.5 rounded-[2px] border border-[#808080] text-[10px] font-medium">
                    Click to mark
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => fileInputCam1Ref.current?.click()}
                  className="p-1 text-black hover:bg-[#dcdcdc] rounded-[2px] transition-colors"
                  title="Upload Video for Camera 1"
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
                    src={videoUrlCam1}
                    playsInline
                    muted
                    preload="auto"
                    onLoadedMetadata={handleLoadedMetadataCam1}
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
                    No optical signal. Import frontal camera video.
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
          <div className="flex-1 flex flex-col h-full bg-white border border-[#808080] rounded-[3px] overflow-hidden relative">
            <div className="bg-[#e0e0e0] border-b border-[#808080] px-2 py-1 flex items-center justify-between text-[11px] shrink-0">
              <div className="flex items-center gap-1.5 font-bold text-black">
                <span className="w-2 h-2 rounded-full bg-[#1e3a5f]" />
                Camera 2 (Side/Angle View Z-Y)
              </div>
              <div className="flex items-center gap-1">
                {currentStep?.cam2 ? (
                  <span className="text-black bg-white px-1.5 py-0.5 rounded-[2px] border border-[#808080] font-mono text-[10px] flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-black" />
                    ({currentStep.cam2.px}, {currentStep.cam2.py})
                  </span>
                ) : (
                  <span className="text-black bg-[#efefef] px-1.5 py-0.5 rounded-[2px] border border-[#808080] text-[10px] font-medium">
                    Click to mark
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => fileInputCam2Ref.current?.click()}
                  className="p-1 text-black hover:bg-[#dcdcdc] rounded-[2px] transition-colors"
                  title="Upload Video for Camera 2"
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
                    src={videoUrlCam2}
                    playsInline
                    muted
                    preload="auto"
                    onLoadedMetadata={handleLoadedMetadataCam2}
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
                    OPTICAL SENSOR 2 (CAM 2)
                  </span>
                  <span className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                    No optical signal. Import transverse/side camera video.
                  </span>
                  <button
                    type="button"
                    onClick={() => fileInputCam2Ref.current?.click()}
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

        {/* Sub-Pixel Reticle Loupe Overlay */}
        {showLoupe && activeCameraHover && (
          <div className="absolute top-4 right-4 pointer-events-none z-30 rounded-full overflow-hidden border-2 border-[#808080] bg-white">
            <canvas ref={loupeCanvasRef} className="block w-[110px] h-[110px]" />
          </div>
        )}
      </div>

      {/* Synchronized Playback and Scrubber Bar */}
      <div className="bg-[#d4d0c8] border-t border-[#808080] p-2.5 space-y-2 text-xs select-none">
        {/* Scrubber slider & Frame Input */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 text-[11px] font-mono font-semibold text-black">
            <span className="text-[#333333]">F:</span>
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
              title="Direct frame jump"
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

          {(() => {
            const curTime = clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps);
            const m = Math.floor(curTime / 60);
            const s = Math.floor(curTime % 60);
            const ms = Math.floor((curTime % 1) * 1000);
            return (
              <span className="font-mono text-[11px] text-black font-bold shrink-0">
                {m.toString().padStart(2, '0')}:{s.toString().padStart(2, '0')}.{ms.toString().padStart(3, '0')} ({curTime.toFixed(2)}s)
              </span>
            );
          })()}
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
