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
}) => {
  // Video and Canvas references
  const videoRefCam1 = useRef<HTMLVideoElement | null>(null);
  const videoRefCam2 = useRef<HTMLVideoElement | null>(null);
  const canvasRefCam1 = useRef<HTMLCanvasElement | null>(null);
  const canvasRefCam2 = useRef<HTMLCanvasElement | null>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Layout & Controls State
  const [dualLayout, setDualLayout] = useState<DualLayout>('side-by-side');
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [activeCameraHover, setActiveCameraHover] = useState<'cam1' | 'cam2' | null>(null);
  const [mouseCoord, setMouseCoord] = useState<{ x: number; y: number } | null>(null);
  const [canvasDims, setCanvasDims] = useState<{ w: number; h: number }>({ w: 480, h: 360 });

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

  // Sync HTML5 video elements to frame if video sources are provided
  useEffect(() => {
    const time = clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps);
    if (videoRefCam1.current && videoUrlCam1) {
      videoRefCam1.current.currentTime = time;
    }
    if (videoRefCam2.current && videoUrlCam2) {
      videoRefCam2.current.currentTime = time;
    }
  }, [currentFrame, clip.startTime, clip.frameDt, clip.dt, clip.fps, videoUrlCam1, videoUrlCam2]);

  // Synthetic Physics Animation Renderers when real MP4 files aren't uploaded
  const drawSyntheticScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      camId: 'cam1' | 'cam2',
      width: number,
      height: number
    ) => {
      // Background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, height);
      grad.addColorStop(0, '#f1f5f9');
      grad.addColorStop(1, '#e2e8f0');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Floor & Wall Perspective
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(0, height - 45, width, 45);

      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height - 45);
      ctx.lineTo(width, height - 45);
      ctx.stroke();

      // Measurement Grid
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      for (let x = 40; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height - 45);
        ctx.stroke();
      }
      for (let y = 30; y < height - 45; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Camera label badge
      ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
      ctx.fillRect(10, 10, 150, 24);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(
        camId === 'cam1' ? 'CAM 1: Front View (X-Y)' : 'CAM 2: Side View (Z-Y)',
        18,
        26
      );

      // Simulate 3D Projectile object with lateral wind / deflection
      // Real 3D physical coordinates at frame:
      const t = currentFrame * (clip.frameDt || 1 / clip.fps);
      const v0x = 1.6;
      const v0y = 4.2;
      const v0z = 0.8;
      const g = 9.81;

      const simX = v0x * t;
      const simY = Math.max(0, v0y * t - 0.5 * g * t * t);
      const simZ = v0z * t; // deflection along Z

      // Cam 1 (Front View): X is horizontal, Y is vertical
      // Cam 2 (Side View): Z is horizontal, Y is vertical
      const scale = triangulation.pixelsPerMeterCam1 || 240;
      const origin1 = triangulation.originCam1;
      const origin2 = triangulation.originCam2;

      let ballPx = 0, ballPy = 0;
      if (camId === 'cam1') {
        ballPx = origin1.x + simX * scale;
        ballPy = origin1.y - simY * scale;
      } else {
        ballPx = origin2.x + simZ * scale;
        ballPy = origin2.y - simY * scale;
      }

      // Draw synthetic high-speed sphere
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(ballPx, ballPy, 11, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#c2410c';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Specular highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.beginPath();
      ctx.arc(ballPx - 3, ballPy - 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
    },
    [currentFrame, clip.fps, clip.frameDt, triangulation]
  );

  // Render on Cam 1 & Cam 2 canvases
  const renderOverlay = useCallback(
    (
      canvas: HTMLCanvasElement | null,
      video: HTMLVideoElement | null,
      videoUrl: string | undefined,
      camId: 'cam1' | 'cam2'
    ) => {
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const rect = canvas.getBoundingClientRect();
      const width = rect.width || 480;
      const height = rect.height || 360;
      const dpr = window.devicePixelRatio || 1;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      // 1. Draw video frame or synthetic backdrop
      if (videoUrl && video && video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, width, height);
      } else {
        drawSyntheticScene(ctx, camId, width, height);
      }

      // 2. Draw origin crosshair for this camera
      const origin = camId === 'cam1' ? triangulation.originCam1 : triangulation.originCam2;
      ctx.strokeStyle = 'rgba(37, 99, 235, 0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(origin.x - 15, origin.y);
      ctx.lineTo(origin.x + 15, origin.y);
      ctx.moveTo(origin.x, origin.y - 15);
      ctx.lineTo(origin.x, origin.y + 15);
      ctx.stroke();

      // 3. Draw tracked points on this camera
      steps.forEach((s) => {
        const pt = camId === 'cam1' ? s.cam1 : s.cam2;
        if (!pt) return;

        const isCur = s.frame === currentFrame;

        // Trail connection line
        if (showTrails) {
          ctx.strokeStyle = activeTrack.color;
          ctx.lineWidth = 2;
        }

        // Marker
        ctx.fillStyle = isCur ? '#2563eb' : activeTrack.color;
        ctx.beginPath();
        ctx.arc(pt.px, pt.py, isCur ? 5.5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        if (isCur) {
          ctx.strokeStyle = '#2563eb';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pt.px, pt.py, 9, 0, Math.PI * 2);
          ctx.stroke();
        }
      });

      // 4. Epipolar horizontal reference alignment line when hovering the other camera
      if (activeCameraHover && activeCameraHover !== camId && mouseCoord) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(0, mouseCoord.y);
        ctx.lineTo(width, mouseCoord.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    },
    [
      drawSyntheticScene,
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
    renderOverlay(canvasRefCam1.current, videoRefCam1.current, videoUrlCam1, 'cam1');
    renderOverlay(canvasRefCam2.current, videoRefCam2.current, videoUrlCam2, 'cam2');
  }, [renderOverlay, currentFrame, steps, videoUrlCam1, videoUrlCam2]);

  // Handle Marking point on Camera 1 or Camera 2
  const handleCanvasClick = (
    e: React.MouseEvent<HTMLCanvasElement>,
    camId: 'cam1' | 'cam2'
  ) => {
    const canvas = camId === 'cam1' ? canvasRefCam1.current : canvasRefCam2.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const px = Math.round(e.clientX - rect.left);
    const py = Math.round(e.clientY - rect.top);

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

      {/* Dual Video Canvases Area */}
      <div className="flex-1 flex min-h-0 relative overflow-hidden bg-[#d4d0c8] p-2 gap-2">
        {/* Hidden Video Elements for decoding uploaded MP4s */}
        <video ref={videoRefCam1} src={videoUrlCam1} className="hidden" muted playsInline />
        <video ref={videoRefCam2} src={videoUrlCam2} className="hidden" muted playsInline />

        {/* Camera 1 Viewport */}
        {(dualLayout === 'side-by-side' || dualLayout === 'cam1-focus') && (
          <div className="flex-1 flex flex-col h-full bg-white border border-[#808080] rounded-[3px] overflow-hidden relative">
            <div className="bg-[#e0e0e0] border-b border-[#808080] px-2 py-1 flex items-center justify-between text-[11px]">
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
                <label className="cursor-pointer p-0.5 text-black hover:text-[#333333]" title="Upload Video for Cam 1">
                  <Upload className="w-3.5 h-3.5" />
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onUploadCam1?.(e.target.files[0])}
                  />
                </label>
              </div>
            </div>

            <div className="flex-1 relative cursor-crosshair overflow-hidden">
              <canvas
                ref={canvasRefCam1}
                onClick={(e) => handleCanvasClick(e, 'cam1')}
                onMouseEnter={() => setActiveCameraHover('cam1')}
                onMouseLeave={() => setActiveCameraHover(null)}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMouseCoord({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                className="w-full h-full block"
              />
            </div>
          </div>
        )}

        {/* Camera 2 Viewport */}
        {(dualLayout === 'side-by-side' || dualLayout === 'cam2-focus') && (
          <div className="flex-1 flex flex-col h-full bg-white border border-[#808080] rounded-[3px] overflow-hidden relative">
            <div className="bg-[#e0e0e0] border-b border-[#808080] px-2 py-1 flex items-center justify-between text-[11px]">
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
                <label className="cursor-pointer p-0.5 text-black hover:text-[#333333]" title="Upload Video for Cam 2">
                  <Upload className="w-3.5 h-3.5" />
                  <input
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onUploadCam2?.(e.target.files[0])}
                  />
                </label>
              </div>
            </div>

            <div className="flex-1 relative cursor-crosshair overflow-hidden">
              <canvas
                ref={canvasRefCam2}
                onClick={(e) => handleCanvasClick(e, 'cam2')}
                onMouseEnter={() => setActiveCameraHover('cam2')}
                onMouseLeave={() => setActiveCameraHover(null)}
                onMouseMove={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMouseCoord({ x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                className="w-full h-full block"
              />
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
      <div className="bg-[#d4d0c8] border-t border-[#808080] p-2.5 space-y-2 text-xs">
        {/* Scrubber slider */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] text-black font-bold w-10 text-right">
            F#{currentFrame}
          </span>
          <input
            type="range"
            min={clip.startFrame}
            max={clip.endFrame}
            step={clip.stepSize}
            value={currentFrame}
            onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
            className="flex-1 h-1.5 bg-[#999999] border border-[#808080] rounded-[2px] appearance-none cursor-pointer"
          />
          <span className="font-mono text-[11px] text-black font-bold w-16">
            {(clip.startTime + currentFrame * (clip.frameDt || clip.dt || 1 / clip.fps)).toFixed(3)}s
          </span>
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
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-[11px] text-black font-medium">
              <span>Speed:</span>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(parseFloat(e.target.value))}
                className="bg-[#efefef] border border-[#808080] rounded-[3px] px-1 py-0.5 font-mono text-[11px] text-black font-bold"
              >
                <option value="0.25">0.25x</option>
                <option value="0.5">0.5x</option>
                <option value="1">1.0x</option>
                <option value="2">2.0x</option>
              </select>
            </div>

            {currentStep && (
              <button
                type="button"
                onClick={() => onDeletePoint(currentFrame)}
                className="px-2 py-1 rounded-[3px] text-[#8b0000] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-[11px] font-semibold"
              >
                Clear Frame Mark
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
