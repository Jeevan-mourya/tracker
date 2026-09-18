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
} from 'lucide-react';

interface VideoPlayerViewProps {
  videoUrl: string;
  isSynthetic: boolean;
  syntheticType?: string;
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackRate, setPlaybackRate] = useState<number>(0.5);
  const [isLooping, setIsLooping] = useState<boolean>(true);
  const [mouseCoord, setMouseCoord] = useState<{ px: number; py: number; x: number; y: number } | null>(null);
  const [dragTarget, setDragTarget] = useState<DragTarget>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 640, height: 480 });
  const [isShiftPressed, setIsShiftPressed] = useState<boolean>(false);
  const [showShiftWarning, setShowShiftWarning] = useState<boolean>(false);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Monitor Shift key for visual feedback and safety
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
  const activeStep = activeTrack?.steps.find((s) => s.frame === currentFrame);

  // Time calculations
  const currentTime = (currentFrame - clip.startFrame) * (1 / clip.fps);

  // Synchronize video element with current frame
  useEffect(() => {
    const video = videoRef.current;
    if (!video || isSynthetic) return;

    const targetTime = Math.max(0.001, currentFrame / clip.fps);
    if (Math.abs(video.currentTime - targetTime) > 0.03) {
      video.currentTime = targetTime;
    }
  }, [currentFrame, clip.fps, isSynthetic]);

  // Video playback loop
  useEffect(() => {
    let animationFrameId: number;

    if (isPlaying) {
      let lastTime = performance.now();
      const interval = (1000 / clip.fps) / playbackRate;

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
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, currentFrame, clip, playbackRate, isLooping, onFrameChange]);

  // Handle video metadata loading to configure frames & size
  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (!video) return;

    // Force frame load on some browsers (like Safari/Chrome when hidden/paused)
    video.play().then(() => video.pause()).catch(() => {});
    if (currentFrame === 0) {
      video.currentTime = 0.001; // tiny offset to force frame render
    }

    const duration = video.duration || 1;
    const totalFrames = Math.max(10, Math.round(duration * clip.fps));
    const width = video.videoWidth || 640;
    const height = video.videoHeight || 480;

    setCanvasSize({ width, height });
    onUpdateClip({
      totalFrames,
      endFrame: totalFrames - 1,
    });
  };

  // Force video reload and seek when videoUrl changes
  useEffect(() => {
    const video = videoRef.current;
    if (video && videoUrl) {
      video.load();
      video.currentTime = Math.max(0.001, currentFrame / clip.fps);
    }
  }, [videoUrl]);

  // Convert client click coordinates to video/canvas intrinsic coordinate space
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { px: 0, py: 0 };

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const px = Math.round((e.clientX - rect.left) * scaleX);
    const py = Math.round((e.clientY - rect.top) * scaleY);
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

      if (syntheticType === 'incline-cart') {
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
  }, [
    isSynthetic,
    syntheticType,
    currentFrame,
    clip,
    axes,
    calibration,
    tracks,
    activeTrackId,
    showTrails,
    showVectors,
  ]);

  // Trigger render on updates
  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  // Magnifier Loupe render effect for Tracker-style sub-pixel tracking
  useEffect(() => {
    if (!showLoupe || !mouseCoord || !loupeCanvasRef.current || !canvasRef.current) return;
    const lCanvas = loupeCanvasRef.current;
    const lCtx = lCanvas.getContext('2d');
    if (!lCtx) return;

    const zoom = 3.5;
    const lWidth = lCanvas.width;
    const lHeight = lCanvas.height;
    const sourceW = lWidth / zoom;
    const sourceH = lHeight / zoom;
    const sourceX = Math.max(0, Math.min(canvasSize.width - sourceW, mouseCoord.px - sourceW / 2));
    const sourceY = Math.max(0, Math.min(canvasSize.height - sourceH, mouseCoord.py - sourceH / 2));

    lCtx.clearRect(0, 0, lWidth, lHeight);
    lCtx.imageSmoothingEnabled = false;

    // Draw main canvas snippet into loupe
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

    // Crosshairs in classic navy
    const centerX = (mouseCoord.px - sourceX) * zoom;
    const centerY = (mouseCoord.py - sourceY) * zoom;

    lCtx.strokeStyle = 'rgba(30, 58, 95, 0.85)';
    lCtx.lineWidth = 1;
    lCtx.beginPath();
    lCtx.moveTo(centerX, 0);
    lCtx.lineTo(centerX, lHeight);
    lCtx.moveTo(0, centerY);
    lCtx.lineTo(lWidth, centerY);
    lCtx.stroke();

    // Target reticle
    lCtx.strokeStyle = '#1e3a5f';
    lCtx.lineWidth = 1.5;
    lCtx.beginPath();
    lCtx.arc(centerX, centerY, 10, 0, Math.PI * 2);
    lCtx.stroke();

    // Subpixel center dot
    lCtx.fillStyle = '#b91c1c';
    lCtx.beginPath();
    lCtx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
    lCtx.fill();
  }, [showLoupe, mouseCoord, canvasSize]);

  // Mouse drag & mark handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = getCanvasCoords(e);

    // 1. Check calibration handles (within 12px)
    if (calibration.visible) {
      if (Math.hypot(px - calibration.pointA.x, py - calibration.pointA.y) < 14) {
        setDragTarget({ type: 'calA' });
        return;
      }
      if (Math.hypot(px - calibration.pointB.x, py - calibration.pointB.y) < 14) {
        setDragTarget({ type: 'calB' });
        return;
      }
    }

    // 2. Check coordinate axes handles
    if (axes.visible) {
      if (Math.hypot(px - axes.origin.x, py - axes.origin.y) < 14) {
        setDragTarget({ type: 'origin' });
        return;
      }

      // Rotation handle along +X
      const rad = (axes.angle * Math.PI) / 180;
      const rotHandleX = axes.origin.x + 115 * Math.cos(rad);
      const rotHandleY = axes.origin.y - 115 * Math.sin(rad);
      if (Math.hypot(px - rotHandleX, py - rotHandleY) < 14) {
        setDragTarget({ type: 'axisRotate' });
        return;
      }
    }

    // 3. Check existing point on active track
    if (activeTrack) {
      const existing = activeTrack.steps.find((s) => Math.hypot(px - s.px, py - s.py) < 10);
      if (existing) {
        setDragTarget({ type: 'point', frame: existing.frame });
        onFrameChange(existing.frame);
        return;
      }
    }

    // 4. Default: Add point for current frame (Protected by Shift+Click Tracker OSP rule)
    if (requireShiftToMark && !e.shiftKey && !isShiftPressed) {
      // User clicked without holding Shift: ignore point placement to prevent accidental marks
      setShowShiftWarning(true);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
      warningTimerRef.current = setTimeout(() => setShowShiftWarning(false), 3000);
      return;
    }

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

    // Auto-advance frame if enabled
    if (autoAdvance) {
      const nextFrame = Math.min(clip.endFrame, currentFrame + clip.stepSize);
      onFrameChange(nextFrame);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { px, py } = getCanvasCoords(e);
    const world = pixelToWorld(px, py, axes, calibration);
    setMouseCoord({ px, py, x: world.x, y: world.y });

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

  const handleMouseUp = () => {
    setDragTarget(null);
  };

  return (
    <div id="video-player-view" className="flex flex-col h-full bg-[#d4d0c8] select-none overflow-hidden">
      {/* Video & Canvas Stage */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-[#141414] flex items-center justify-center p-2 min-h-0 overflow-hidden"
      >
        <div
          className="relative rounded-[2px] overflow-hidden border border-[#555555] shadow-sm"
          style={{ maxWidth: '100%', maxHeight: '100%' }}
        >
          {/* Real HTML5 Video element */}
          {!isSynthetic && (
            <video
              ref={videoRef}
              src={videoUrl}
              preload="auto"
              playsInline
              muted
              onLoadedMetadata={handleLoadedMetadata}
              className="block object-contain"
              style={{
                maxWidth: '100%',
                maxHeight: 'calc(100vh - 220px)',
                display: 'block',
              }}
            />
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
            }}
            className="absolute inset-0 w-full h-full cursor-crosshair"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />

          {/* Tracker Sub-Pixel Magnifier Loupe Tool in top-right corner */}
          {showLoupe && (
            <div className="absolute top-2 right-2 bg-[#e0e0e0] border border-[#808080] rounded-[3px] p-1.5 flex flex-col gap-1 pointer-events-none z-10">
              <div className="flex items-center justify-between text-[10px] font-bold text-black px-1 border-b border-[#808080] pb-0.5">
                <span className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#1e3a5f]" />
                  Tracker Loupe (3.5×)
                </span>
                <span className="font-mono text-black">Sub-pixel</span>
              </div>
              <div className="relative w-28 h-28 bg-[#111111] rounded-[2px] border border-[#808080] overflow-hidden">
                <canvas
                  ref={loupeCanvasRef}
                  width={128}
                  height={128}
                  className="w-full h-full block"
                />
              </div>
              <div className="text-[10px] font-mono text-black px-1 flex flex-col">
                {mouseCoord ? (
                  <>
                    <span>x: <strong className="text-black font-bold">{mouseCoord.x.toFixed(3)}</strong> m</span>
                    <span>y: <strong className="text-black font-bold">{mouseCoord.y.toFixed(3)}</strong> m</span>
                  </>
                ) : (
                  <span className="text-[#555555] italic">Hover to inspect</span>
                )}
              </div>
            </div>
          )}

          {/* Coordinate Readout Overlay in bottom-left corner */}
          <div className="absolute bottom-2 left-2 bg-[#e0e0e0] border border-[#808080] rounded-[3px] px-2.5 py-1 text-[11px] font-mono text-black flex items-center gap-3 pointer-events-none">
            {mouseCoord ? (
              <>
                <span>
                  x: <strong className="text-black font-bold">{mouseCoord.x.toFixed(3)}</strong> m
                </span>
                <span>
                  y: <strong className="text-black font-bold">{mouseCoord.y.toFixed(3)}</strong> m
                </span>
                <span className="text-[#444444] text-[10px]">
                  ({mouseCoord.px}, {mouseCoord.py}px)
                </span>
              </>
            ) : (
              <span className="text-[#444444]">Hover video for coordinates</span>
            )}
          </div>

          {/* Status badge and Shift Mode in top-left */}
          <div className="absolute top-2 left-2 flex items-center gap-2 pointer-events-none z-10">
            <div className="bg-[#e0e0e0] border border-[#808080] rounded-[3px] px-2 py-0.5 text-[11px] font-mono text-black flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              <span>
                Frame: <strong className="text-black font-bold">{currentFrame}</strong> / {clip.totalFrames - 1}
              </span>
              <span className="text-[#333333] ml-1 font-semibold">
                (t = {currentTime.toFixed(3)}s)
              </span>
            </div>

            {/* Shift+Click Tracker OSP Safety Badge */}
            {requireShiftToMark && (
              <div
                className={`px-2 py-0.5 rounded-[3px] border text-[10px] font-mono flex items-center gap-1.5 transition-colors ${
                  isShiftPressed
                    ? 'bg-amber-100 border-amber-600 text-amber-950 font-bold shadow-sm'
                    : 'bg-[#efefef] border-[#808080] text-black font-medium'
                }`}
              >
                <Crosshair className={`w-3 h-3 ${isShiftPressed ? 'text-amber-700' : 'text-[#555555]'}`} />
                <span>Mark Mode:</span>
                <strong className={isShiftPressed ? 'text-amber-700 underline' : 'text-emerald-700'}>
                  {isShiftPressed ? 'READY (Shift Held)' : 'SAFE (Hold Shift to Mark)'}
                </strong>
              </div>
            )}

            {activeStep && (
              <div className="bg-white border border-[#808080] text-black font-semibold rounded-[3px] px-2 py-0.5 text-[10px] font-mono">
                Marked: ({activeStep.x.toFixed(3)}, {activeStep.y.toFixed(3)})m
              </div>
            )}
          </div>

          {/* Accidental Click Interception Toast Notice */}
          {showShiftWarning && (
            <div className="absolute top-12 left-1/2 -translate-x-1/2 bg-[#1e3a5f] text-white px-3.5 py-1.5 rounded-[3px] border border-[#0f1d30] shadow-lg flex items-center gap-2 text-xs font-mono pointer-events-none z-30 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <span>
                <strong>Tracker OSP Safety Mode:</strong> Hold <span className="underline font-bold text-amber-300">Shift + Click</span> on video to mark a point mass.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Legacy System Desktop Bottom Media Controller Bar */}
      <div id="video-control-bar" className="bg-[#d4d0c8] border-t border-[#808080] px-3 py-2 flex flex-col gap-1.5 select-none">
        {/* Timeline Scrubber with Marked Steps Indicators */}
        <div className="relative w-full flex items-center gap-2">
          {/* Direct Frame Input */}
          <div className="flex items-center gap-0.5 text-[11px] font-mono font-semibold text-black">
            <span className="text-[#333333]">F:</span>
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
              className="w-14 px-1 py-0.5 rounded-[2px] border border-[#808080] bg-white text-black font-bold text-center outline-none"
              title="Direct frame jump"
            />
          </div>

          {/* Scrubber Track with Visual Data-Point Ticks */}
          <div className="relative flex-1 flex items-center h-4">
            {/* Background track */}
            <div className="absolute inset-x-0 h-2 bg-[#999999] border border-[#808080] rounded-[2px] overflow-hidden pointer-events-none">
              {/* Active clip region highlight */}
              <div className="absolute inset-0 bg-[#b0b0b0]" />
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
                    className="absolute top-0 bottom-0 w-1 bg-[#1e3a5f] rounded-none opacity-95"
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
              max={clip.endFrame}
              step={1}
              value={currentFrame}
              onChange={(e) => onFrameChange(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-transparent rounded-[2px] appearance-none cursor-pointer focus:outline-none z-2"
            />
          </div>

          {/* Time readout */}
          <div className="flex items-center gap-1 text-[11px] font-mono font-semibold text-black shrink-0">
            <span className="text-right">
              {Math.floor(currentTime / 60).toString().padStart(2, '0')}:{(currentTime % 60).toFixed(3).padStart(6, '0')} ({currentTime.toFixed(2)}s)
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
              onClick={() => onFrameChange(clip.startFrame)}
              className="p-1.5 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors active:scale-95"
              title="Jump to Start Frame (|◄)"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-prev-frame"
              type="button"
              onClick={() => onFrameChange(Math.max(clip.startFrame, currentFrame - clip.stepSize))}
              className="p-1.5 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors active:scale-95"
              title="Step Backward (◄)"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              id="btn-play-pause"
              type="button"
              onClick={() => setIsPlaying(!isPlaying)}
              className="px-3 py-1 rounded-[3px] bg-[#1e3a5f] hover:bg-[#152843] active:bg-[#0f1d30] text-white font-semibold text-xs flex items-center gap-1 transition-all border border-[#0f1d30] active:scale-95"
              title={isPlaying ? 'Pause video (Space)' : 'Play video (Space)'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
            <button
              id="btn-next-frame"
              type="button"
              onClick={() => onFrameChange(Math.min(clip.endFrame, currentFrame + clip.stepSize))}
              className="p-1.5 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors active:scale-95"
              title="Step Forward (►)"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              id="btn-last-frame"
              type="button"
              onClick={() => onFrameChange(clip.endFrame)}
              className="p-1.5 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors active:scale-95"
              title="Jump to End Frame (►|)"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>

            <button
              id="btn-toggle-loop"
              type="button"
              onClick={() => setIsLooping(!isLooping)}
              className={`p-1.5 rounded-[3px] border transition-all active:scale-95 ${
                isLooping
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] font-semibold'
                  : 'bg-[#efefef] text-black border-[#808080] hover:bg-[#dcdcdc]'
              }`}
              title="Toggle Playback Loop"
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Right: Undo, Point deletion & playback speed */}
          <div className="flex items-center gap-2 text-xs">
            {onUndoLastPoint && (
              <button
                id="btn-undo-point"
                type="button"
                onClick={onUndoLastPoint}
                className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors text-[11px] font-semibold"
                title="Undo last marked point (Ctrl+Z)"
              >
                <Undo2 className="w-3 h-3 text-[#1e3a5f]" />
                <span>Undo Point</span>
              </button>
            )}

            {activeStep && (
              <button
                id="btn-delete-frame-point"
                type="button"
                onClick={() => onDeleteCurrentPoint(currentFrame)}
                className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-[#8b0000] border border-[#808080] transition-colors text-[11px] font-semibold"
                title="Delete tracking point at current frame (Del)"
              >
                <Trash className="w-3 h-3" />
                <span>Delete mark (F:{currentFrame})</span>
              </button>
            )}

            <div className="flex items-center gap-1 bg-[#efefef] border border-[#808080] rounded-[3px] px-2 py-0.5 text-[11px]">
              <span className="text-[#333333] font-semibold">Rate:</span>
              <select
                id="playback-rate-select"
                value={playbackRate}
                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                className="bg-transparent text-black font-bold focus:outline-none cursor-pointer"
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
