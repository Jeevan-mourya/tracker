import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Track, PointStep } from '../types';
import {
  RotateCw,
  Eye,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Compass,
  Move,
  Layers,
  ChevronDown,
  ChevronUp,
  PanelBottom,
  Sliders,
} from 'lucide-react';

interface ThreeDTrajectoryViewProps {
  tracks: Track[];
  activeTrackId: string;
  currentFrame: number;
  onSelectFrame?: (frame: number) => void;
  showVectors?: boolean;
  showTrails?: boolean;
}

export type ViewPreset = 'orbit' | 'front' | 'top' | 'side' | 'isometric';
export type HudPlacement = 'bottom-left' | 'bottom-right' | 'top-left' | 'docked-bottom';
export type HudDensity = 'expanded' | 'compact';

export const ThreeDTrajectoryView: React.FC<ThreeDTrajectoryViewProps> = ({
  tracks,
  activeTrackId,
  currentFrame,
  onSelectFrame,
  showVectors = true,
  showTrails = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // 3D Camera State: Orbit angles in degrees, pan offset, zoom distance
  const [pitch, setPitch] = useState<number>(25); // degrees
  const [yaw, setYaw] = useState<number>(-45); // degrees
  const [zoom, setZoom] = useState<number>(1.0);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [activePreset, setActivePreset] = useState<ViewPreset>('orbit');
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showAxesBox, setShowAxesBox] = useState<boolean>(true);

  // Professional HUD Coordinates Box Configuration
  const [hudPlacement, setHudPlacement] = useState<HudPlacement>('bottom-left');
  const [hudDensity, setHudDensity] = useState<HudDensity>('expanded');
  const [hudTranslucent, setHudTranslucent] = useState<boolean>(true);

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const steps = activeTrack ? activeTrack.steps : [];
  const currentStep = steps.find((s) => s.frame === currentFrame);

  // Set Preset Angle
  const handleSetPreset = (preset: ViewPreset) => {
    setActivePreset(preset);
    setPan({ x: 0, y: 0 });
    if (preset === 'orbit') {
      setPitch(25);
      setYaw(-45);
    } else if (preset === 'front') {
      setPitch(0);
      setYaw(0);
    } else if (preset === 'top') {
      setPitch(90);
      setYaw(0);
    } else if (preset === 'side') {
      setPitch(0);
      setYaw(-90);
    } else if (preset === 'isometric') {
      setPitch(35.26);
      setYaw(-45);
    }
  };

  // Mouse drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2 || e.shiftKey) {
      setIsPanning(true);
    } else {
      setIsDragging(true);
    }
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging && !isPanning) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    setDragStart({ x: e.clientX, y: e.clientY });

    if (isPanning) {
      setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
    } else if (isDragging) {
      setYaw((prev) => (prev + dx * 0.5) % 360);
      setPitch((prev) => Math.max(-89, Math.min(89, prev - dy * 0.5)));
      setActivePreset('orbit');
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(0.2, Math.min(5.0, prev * factor)));
  };

  // 3D Rendering on Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high-DPI displays
    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Background: Pure white data viewport for maximum scientific contrast
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // 3D Transformation Math
    const radYaw = (yaw * Math.PI) / 180;
    const radPitch = (pitch * Math.PI) / 180;

    const cosY = Math.cos(radYaw);
    const sinY = Math.sin(radYaw);
    const cosP = Math.cos(radPitch);
    const sinP = Math.sin(radPitch);

    // Compute bounding box or coordinate bounds of points
    let minX = -0.5, maxX = 1.5;
    let minY = -0.2, maxY = 1.8;
    let minZ = -0.5, maxZ = 1.5;

    if (steps.length > 0) {
      const xs = steps.map((s) => s.x);
      const ys = steps.map((s) => s.y);
      const zs = steps.map((s) => s.z ?? 0);

      minX = Math.min(-0.2, Math.min(...xs) - 0.2);
      maxX = Math.max(1.0, Math.max(...xs) + 0.2);
      minY = Math.min(-0.1, Math.min(...ys) - 0.1);
      maxY = Math.max(1.0, Math.max(...ys) + 0.2);
      minZ = Math.min(-0.2, Math.min(...zs) - 0.2);
      maxZ = Math.max(1.0, Math.max(...zs) + 0.2);
    }

    const spanX = Math.max(1.0, maxX - minX);
    const spanY = Math.max(1.0, maxY - minY);
    const spanZ = Math.max(1.0, maxZ - minZ);
    const maxSpan = Math.max(spanX, spanY, spanZ);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const centerZ = (minZ + maxZ) / 2;

    // Intelligent Auto-Framing:
    // When the HUD is floating at bottom-left or bottom-right in expanded mode,
    // dynamically scale and offset the 3D scene center so the entire trajectory,
    // ground grid, and coordinate axes remain in the clear viewing zone without being covered.
    const isBottomLeftExpanded = hudPlacement === 'bottom-left' && hudDensity === 'expanded';
    const isBottomRightExpanded = hudPlacement === 'bottom-right' && hudDensity === 'expanded';
    const isTopLeftExpanded = hudPlacement === 'top-left' && hudDensity === 'expanded';

    let defaultOffsetX = 0;
    let defaultOffsetY = 0;

    if (isBottomLeftExpanded) {
      defaultOffsetX = width > 450 ? 44 : 22;
      defaultOffsetY = -28;
    } else if (isBottomRightExpanded) {
      defaultOffsetX = width > 450 ? -44 : -22;
      defaultOffsetY = -28;
    } else if (isTopLeftExpanded) {
      defaultOffsetX = width > 450 ? 44 : 22;
      defaultOffsetY = 28;
    }

    // Base scale in pixels per meter with safe envelope margins
    const scaleFactor = (isBottomLeftExpanded || isBottomRightExpanded) ? 0.38 : 0.45;
    const baseScale = (Math.min(width, height) * scaleFactor) / maxSpan;
    const scale = baseScale * zoom;

    // Center on screen with pan and intelligent HUD clearance offset
    const cx = width / 2 + pan.x + defaultOffsetX;
    const cy = height / 2 + pan.y + defaultOffsetY;

    // 3D to 2D projection function
    // Physics system: X = right, Y = up, Z = depth (towards viewer)
    const project = (x: number, y: number, z: number): { px: number; py: number; depth: number } => {
      // Translate to scene center
      const dx = x - centerX;
      const dy = y - centerY;
      const dz = z - centerZ;

      // Rotate around Y axis (yaw)
      const x1 = dx * cosY - dz * sinY;
      const z1 = dx * sinY + dz * cosY;
      const y1 = dy;

      // Rotate around X axis (pitch)
      const y2 = y1 * cosP - z1 * sinP;
      const z2 = y1 * sinP + z1 * cosP;
      const x2 = x1;

      // Screen mapping (Y increases downwards on screen, so -y2)
      return {
        px: cx + x2 * scale,
        py: cy - y2 * scale,
        depth: z2,
      };
    };

    // 1. Draw Ground Reference Grid (XZ Plane at Y=0 or minY)
    if (showGrid) {
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      const gridY = 0;
      const gridStep = 0.2; // 0.2 meters grid
      const gMinX = Math.floor(minX / gridStep) * gridStep;
      const gMaxX = Math.ceil(maxX / gridStep) * gridStep;
      const gMinZ = Math.floor(minZ / gridStep) * gridStep;
      const gMaxZ = Math.ceil(maxZ / gridStep) * gridStep;

      for (let gx = gMinX; gx <= gMaxX + 0.001; gx += gridStep) {
        const p1 = project(gx, gridY, gMinZ);
        const p2 = project(gx, gridY, gMaxZ);
        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.stroke();
      }

      for (let gz = gMinZ; gz <= gMaxZ + 0.001; gz += gridStep) {
        const p1 = project(gMinX, gridY, gz);
        const p2 = project(gMaxX, gridY, gz);
        ctx.beginPath();
        ctx.moveTo(p1.px, p1.py);
        ctx.lineTo(p2.px, p2.py);
        ctx.stroke();
      }
    }

    // 2. Draw 3D Coordinate Origin and Principal Axes
    const o = project(0, 0, 0);
    const axisLen = Math.max(0.6, maxSpan * 0.4);

    const xEnd = project(axisLen, 0, 0);
    const yEnd = project(0, axisLen, 0);
    const zEnd = project(0, 0, axisLen);

    // X Axis (Red)
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(o.px, o.py);
    ctx.lineTo(xEnd.px, xEnd.py);
    ctx.stroke();

    ctx.fillStyle = '#dc2626';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText(`+X (${axisLen}m)`, xEnd.px + 5, xEnd.py - 2);

    // Y Axis (Green/Emerald - Vertical UP)
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(o.px, o.py);
    ctx.lineTo(yEnd.px, yEnd.py);
    ctx.stroke();

    ctx.fillStyle = '#059669';
    ctx.fillText(`+Y (Up ${axisLen}m)`, yEnd.px + 5, yEnd.py - 2);

    // Z Axis (Blue/Sky)
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(o.px, o.py);
    ctx.lineTo(zEnd.px, zEnd.py);
    ctx.stroke();

    ctx.fillStyle = '#2563eb';
    ctx.fillText(`+Z (${axisLen}m)`, zEnd.px + 5, zEnd.py - 2);

    // 3. Draw 3D Trajectory Trail Line
    if (showTrails && steps.length > 1) {
      ctx.strokeStyle = activeTrack?.color || '#2563eb';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();

      steps.forEach((pt, idx) => {
        const proj = project(pt.x, pt.y, pt.z ?? 0);
        if (idx === 0) ctx.moveTo(proj.px, proj.py);
        else ctx.lineTo(proj.px, proj.py);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Draw Trajectory Points
    steps.forEach((pt) => {
      const proj = project(pt.x, pt.y, pt.z ?? 0);
      const isCur = pt.frame === currentFrame;

      // Ground projection drop-line for 3D depth perception
      const ground = project(pt.x, 0, pt.z ?? 0);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.4)';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(proj.px, proj.py);
      ctx.lineTo(ground.px, ground.py);
      ctx.stroke();
      ctx.setLineDash([]);

      // Point marker
      ctx.fillStyle = isCur ? '#2563eb' : activeTrack?.color || '#3b82f6';
      ctx.beginPath();
      ctx.arc(proj.px, proj.py, isCur ? 6 : 3.5, 0, Math.PI * 2);
      ctx.fill();

      if (isCur) {
        // Glowing halo on active particle
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(proj.px, proj.py, 10, 0, Math.PI * 2);
        ctx.stroke();
      }
    });

    // 5. Draw 3D Velocity Vector on Current Particle
    if (showVectors && currentStep && currentStep.vx !== null && currentStep.vy !== null && currentStep.vz !== null) {
      const p = project(currentStep.x, currentStep.y, currentStep.z ?? 0);
      const vecScale = 0.15; // 0.15m per 1 m/s
      const vEnd = project(
        currentStep.x + (currentStep.vx ?? 0) * vecScale,
        currentStep.y + (currentStep.vy ?? 0) * vecScale,
        (currentStep.z ?? 0) + (currentStep.vz ?? 0) * vecScale
      );

      ctx.strokeStyle = '#f59e0b'; // Amber velocity vector
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(vEnd.px, vEnd.py);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(vEnd.py - p.py, vEnd.px - p.px);
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.moveTo(vEnd.px, vEnd.py);
      ctx.lineTo(vEnd.px - 9 * Math.cos(angle - Math.PI / 6), vEnd.py - 9 * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(vEnd.px - 9 * Math.cos(angle + Math.PI / 6), vEnd.py - 9 * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#b45309';
      ctx.fillText(
        `v = ${currentStep.v?.toFixed(2) ?? '0.00'} m/s`,
        vEnd.px + 8,
        vEnd.py - 4
      );
    }
  }, [
    pitch,
    yaw,
    zoom,
    pan,
    steps,
    currentStep,
    currentFrame,
    activeTrack,
    showGrid,
    showTrails,
    showVectors,
    hudPlacement,
    hudDensity,
  ]);

  return (
    <div id="three-d-trajectory-view" className="flex flex-col h-full bg-white border border-[#808080] rounded-[3px] overflow-hidden select-none relative">
      {/* 3D View Top Control Bar */}
      <div className="bg-[#d4d0c8] border-b border-[#808080] px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-black flex items-center gap-1">
            <Compass className="w-4 h-4 text-black" />
            3D Spatial Trajectory
          </span>
          <span className="text-[11px] text-[#333333] font-mono font-semibold">
            Pitch: {Math.round(pitch)}° • Yaw: {Math.round(yaw)}° • {zoom.toFixed(1)}x
          </span>
        </div>

        {/* Camera Angle Presets & HUD Display Modes */}
        <div className="flex items-center gap-1">
          {(['orbit', 'front', 'top', 'side', 'isometric'] as ViewPreset[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => handleSetPreset(p)}
              className={`px-2 py-0.5 rounded-[2px] text-[11px] font-semibold capitalize transition-colors ${
                activePreset === p
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080]'
              }`}
            >
              {p}
            </button>
          ))}

          <div className="h-4 w-px bg-[#808080] mx-0.5" />

          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(4.0, z * 1.2))}
            className="p-1 rounded-[2px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.3, z * 0.8))}
            className="p-1 rounded-[2px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setPitch(25);
              setYaw(-45);
              setZoom(1.0);
              setPan({ x: 0, y: 0 });
              setActivePreset('orbit');
            }}
            className="p-1 rounded-[2px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black"
            title="Reset 3D View"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-[#808080] mx-0.5" />

          {/* HUD Layout Selector */}
          <div className="flex items-center gap-0.5 bg-[#efefef] border border-[#808080] rounded-[2px] p-0.5 text-[10px]">
            <span className="text-[#444444] px-1 font-semibold">Box:</span>
            <button
              type="button"
              onClick={() => {
                setHudPlacement('bottom-left');
                setHudDensity('expanded');
              }}
              className={`px-1.5 py-0.5 rounded-[2px] transition-colors ${
                hudPlacement === 'bottom-left' && hudDensity === 'expanded'
                  ? 'bg-[#1e3a5f] text-white font-bold'
                  : 'text-black hover:bg-[#dcdcdc]'
              }`}
              title="Default floating box at bottom-left with smart auto-framing"
            >
              Default
            </button>
            <button
              type="button"
              onClick={() => {
                setHudPlacement('bottom-left');
                setHudDensity('compact');
              }}
              className={`px-1.5 py-0.5 rounded-[2px] transition-colors ${
                hudDensity === 'compact' && hudPlacement !== 'docked-bottom'
                  ? 'bg-[#1e3a5f] text-white font-bold'
                  : 'text-black hover:bg-[#dcdcdc]'
              }`}
              title="Compact single-line coordinate chip (minimal obstruction)"
            >
              Compact
            </button>
            <button
              type="button"
              onClick={() => setHudPlacement('docked-bottom')}
              className={`px-1.5 py-0.5 rounded-[2px] transition-colors ${
                hudPlacement === 'docked-bottom'
                  ? 'bg-[#1e3a5f] text-white font-bold'
                  : 'text-black hover:bg-[#dcdcdc]'
              }`}
              title="Dock coordinates to bottom bar (100% unobstructed 3D graph)"
            >
              Docked
            </button>
          </div>
        </div>
      </div>

      {/* 3D Canvas Stage */}
      <div className="flex-1 min-h-0 relative cursor-grab active:cursor-grabbing overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          className="w-full h-full block"
        />

        {/* Live Coordinate HUD Overlay (When Floating) */}
        {hudPlacement !== 'docked-bottom' && (
          <div
            id="threed-coords-hud"
            className={`absolute ${
              hudPlacement === 'bottom-left'
                ? 'bottom-2 left-2'
                : hudPlacement === 'bottom-right'
                ? 'bottom-2 right-2'
                : 'top-2 left-2'
            } ${
              hudTranslucent
                ? 'bg-white/90 backdrop-blur-[3px] shadow-md'
                : 'bg-white shadow-sm'
            } border border-[#808080] rounded-[3px] p-2 font-mono text-[11px] text-black z-20 transition-all duration-150 select-none`}
            style={{ maxWidth: 'calc(100% - 16px)' }}
          >
            {/* Header with Title & Quick Controls */}
            <div className="font-bold text-black border-b border-[#808080] pb-1 mb-1.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1e3a5f]" />
                <span>Frame #{currentFrame} Coordinates:</span>
                <span className="text-[#444444] font-semibold text-[10px]">
                  (t = {currentStep?.time.toFixed(3) ?? '0.000'}s)
                </span>
              </div>

              {/* HUD Window Controls */}
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => setHudPlacement('docked-bottom')}
                  className="p-1 rounded-[2px] hover:bg-[#dcdcdc] text-black transition-colors"
                  title="Dock to bottom bar (uncover full 3D graph)"
                >
                  <PanelBottom className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setHudPlacement((prev) =>
                      prev === 'bottom-left'
                        ? 'bottom-right'
                        : prev === 'bottom-right'
                        ? 'top-left'
                        : 'bottom-left'
                    );
                  }}
                  className="p-1 rounded-[2px] hover:bg-[#dcdcdc] text-black transition-colors"
                  title="Move box (Bottom-Left → Bottom-Right → Top-Left)"
                >
                  <Move className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => setHudTranslucent(!hudTranslucent)}
                  className={`p-1 rounded-[2px] hover:bg-[#dcdcdc] transition-colors ${
                    hudTranslucent ? 'text-[#1e3a5f]' : 'text-[#888888]'
                  }`}
                  title={
                    hudTranslucent
                      ? 'Translucent HUD (see-through). Click for Solid background.'
                      : 'Solid HUD. Click for Translucent background.'
                  }
                >
                  <Layers className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setHudDensity((d) => (d === 'expanded' ? 'compact' : 'expanded'))
                  }
                  className="p-1 rounded-[2px] hover:bg-[#dcdcdc] text-black transition-colors"
                  title={hudDensity === 'expanded' ? 'Collapse to compact HUD' : 'Expand full telemetry'}
                >
                  {hudDensity === 'expanded' ? (
                    <ChevronDown className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Coordinates Body */}
            {hudDensity === 'expanded' ? (
              <>
                <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
                  <div>
                    <span className="text-[#555555]">X: </span>
                    <strong className="text-black font-bold">{currentStep?.x?.toFixed(4) ?? '—'} m</strong>
                  </div>
                  <div>
                    <span className="text-[#555555]">Y: </span>
                    <strong className="text-black font-bold">{currentStep?.y?.toFixed(4) ?? '—'} m</strong>
                  </div>
                  <div>
                    <span className="text-[#555555]">Z: </span>
                    <strong className="text-black font-bold">{currentStep?.z?.toFixed(4) ?? '—'} m</strong>
                  </div>
                  <div>
                    <span className="text-[#555555]">vx: </span>
                    <span className="text-black">{currentStep?.vx?.toFixed(2) ?? '—'} m/s</span>
                  </div>
                  <div>
                    <span className="text-[#555555]">vy: </span>
                    <span className="text-black">{currentStep?.vy?.toFixed(2) ?? '—'} m/s</span>
                  </div>
                  <div>
                    <span className="text-[#555555]">vz: </span>
                    <span className="text-black">{currentStep?.vz?.toFixed(2) ?? '—'} m/s</span>
                  </div>
                </div>

                <div className="mt-1 pt-1 border-t border-[#808080] flex items-center justify-between text-[10px]">
                  <span>
                    3D Speed: <strong className="text-black font-bold">{currentStep?.v?.toFixed(2) ?? '—'} m/s</strong>
                  </span>
                  {currentStep?.triangulationResidual !== undefined && currentStep.triangulationResidual !== null && (
                    <span className="text-[#444444]">
                      Residual: {(currentStep.triangulationResidual * 1000).toFixed(1)} mm
                    </span>
                  )}
                </div>
              </>
            ) : (
              /* Compact Single-Line Mode */
              <div className="flex items-center gap-2.5 text-[10px] py-0.5 font-mono">
                <span>
                  <strong>X:</strong> {currentStep?.x?.toFixed(3) ?? '—'}m
                </span>
                <span>
                  <strong>Y:</strong> {currentStep?.y?.toFixed(3) ?? '—'}m
                </span>
                <span>
                  <strong>Z:</strong> {currentStep?.z?.toFixed(3) ?? '—'}m
                </span>
                <span className="text-[#333333]">
                  | <strong>v:</strong> {currentStep?.v?.toFixed(2) ?? '—'}m/s
                </span>
              </div>
            )}
          </div>
        )}

        {/* Interactive Controls Guide (Top-Right) */}
        <div className="absolute top-2 right-2 bg-[#efefef]/90 border border-[#808080] rounded-[2px] px-2 py-1 text-[10px] text-black font-medium pointer-events-none z-10">
          Left Drag: Orbit • Right Drag: Pan • Scroll: Zoom
        </div>
      </div>

      {/* Docked Telemetry Bottom Strip (100% Unobstructed 3D Canvas) */}
      {hudPlacement === 'docked-bottom' && (
        <div
          id="threed-docked-telemetry"
          className="bg-[#d4d0c8] border-t border-[#808080] px-3 py-1.5 font-mono text-[11px] text-black flex items-center justify-between gap-2 select-none shrink-0"
        >
          <div className="flex items-center gap-3 overflow-x-auto py-0.5">
            <div className="flex items-center gap-1 shrink-0 font-bold">
              <span className="w-2 h-2 rounded-full bg-[#1e3a5f]" />
              <span>Frame #{currentFrame} Coordinates:</span>
              <span className="text-[#444444] font-semibold text-[10px]">
                (t = {currentStep?.time.toFixed(3) ?? '0.000'}s)
              </span>
            </div>

            <div className="flex items-center gap-2 text-[10px] shrink-0">
              <span className="bg-white border border-[#808080] px-1.5 py-0.5 rounded-[2px]">
                X: <strong className="text-black font-bold">{currentStep?.x?.toFixed(4) ?? '—'} m</strong>
              </span>
              <span className="bg-white border border-[#808080] px-1.5 py-0.5 rounded-[2px]">
                Y: <strong className="text-black font-bold">{currentStep?.y?.toFixed(4) ?? '—'} m</strong>
              </span>
              <span className="bg-white border border-[#808080] px-1.5 py-0.5 rounded-[2px]">
                Z: <strong className="text-black font-bold">{currentStep?.z?.toFixed(4) ?? '—'} m</strong>
              </span>
              <span className="bg-white border border-[#808080] px-1.5 py-0.5 rounded-[2px]">
                Speed: <strong className="text-black font-bold">{currentStep?.v?.toFixed(2) ?? '—'} m/s</strong>
              </span>
              {currentStep?.vx != null && (
                <span className="text-[#333333]">
                  vx: {currentStep.vx.toFixed(2)} | vy: {currentStep.vy?.toFixed(2) ?? '—'} | vz: {currentStep.vz?.toFixed(2) ?? '—'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setHudPlacement('bottom-left')}
              className="flex items-center gap-1 px-2 py-0.5 rounded-[2px] bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-[10px] font-semibold text-black transition-colors"
              title="Float coordinates box back onto bottom-left canvas"
            >
              <PanelBottom className="w-3 h-3 text-[#1e3a5f]" />
              <span>Float on Canvas</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
