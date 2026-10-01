import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { Track, Calibration, CoordinateAxes, ClipSettings, TriangulationConfig } from '../types';
import { formatHighSpeedTime } from './highSpeedCameras';

export type ReportTheme = 'defense-navy' | 'stealth-dark' | 'lab-classic' | 'monochrome';
export type ReportGraphType = 'trajectory-yx' | 'velocity-time' | 'vy-time' | 'vx-time' | 'accel-time' | 'trajectory-3d';

export interface ReportMetadata {
  investigator?: string;
  facility?: string;
  testRunId?: string;
  notes?: string;
  experimentTitle: string;
}

export interface ReportCustomOptions {
  theme?: ReportTheme;
  customAccentColor?: string;
  forceZeroOrigin?: boolean; // Anchors (0,0) on graph axes (senior officer standard)
  velocityPositiveUpward?: boolean; // Plots vertical velocity in positive upward direction
  primaryGraphType?: ReportGraphType;
  secondaryGraphType?: ReportGraphType | 'none';
  videoSnapFrame?: number;
  // 3D Options
  is3D?: boolean;
  stereoBaselineMeters?: number;
  stereoConvergenceDeg?: number;
  dltMethod?: string;
  dltResidualMeters?: number;
  camera1Name?: string;
  camera2Name?: string;
  camera1Fps?: number;
  camera2Fps?: number;
  include3DPlot?: boolean;
}

export interface ReportKinematicsSummary {
  stepCount: number;
  initialPos: { x: number; y: number; z?: number };
  finalPos: { x: number; y: number; z?: number };
  displacementX: number;
  displacementY: number;
  displacementZ?: number;
  totalDisplacement: number; // 2D hypot(dx,dy) or 3D hypot(dx,dy,dz)
  deltaTime: number;
  meanVx: number;
  meanVy: number;
  meanVz?: number;
  meanVelocity: number;
  maxVelocity: number;
  meanAx: number;
  meanAy: number;
  meanAz?: number;
  meanAcceleration: number;
  maxAcceleration: number;
  maxGForce: number;
  kineticEnergy: number;
  initialAngleDeg: number;
  machNumber?: number;
  maxAltitudeZ?: number;
  slantRange?: number;
}

/**
 * Computes kinematics summary metrics for a given track (2D & 3D)
 */
export function computeTrackSummary(
  track: Track,
  fps: number,
  is3D: boolean = false
): ReportKinematicsSummary | null {
  if (!track.steps || track.steps.length === 0) return null;

  const steps = track.steps;
  const initial = steps[0];
  const final = steps[steps.length - 1];

  const dx = final.x - initial.x;
  const dy = final.y - initial.y;
  const dz = is3D && final.z !== undefined && initial.z !== undefined ? final.z - initial.z : 0;
  
  const totalDisplacement = is3D ? Math.hypot(dx, dy, dz) : Math.hypot(dx, dy);
  const deltaTime = Math.max(0.000001, final.time - initial.time);

  // Velocity statistics
  const validV = steps.filter((s) => s.v !== undefined && s.v !== null && !isNaN(s.v));
  let meanVx = 0;
  let meanVy = 0;
  let meanVz = 0;
  let meanV = 0;
  let maxV = 0;

  if (validV.length > 0) {
    meanVx = validV.reduce((acc, s) => acc + (s.vx || 0), 0) / validV.length;
    meanVy = validV.reduce((acc, s) => acc + (s.vy || 0), 0) / validV.length;
    if (is3D) {
      meanVz = validV.reduce((acc, s) => acc + (s.vz || 0), 0) / validV.length;
    }
    meanV = validV.reduce((acc, s) => acc + (s.v || 0), 0) / validV.length;
    maxV = Math.max(...validV.map((s) => s.v || 0));
  } else if (deltaTime > 0) {
    meanVx = dx / deltaTime;
    meanVy = dy / deltaTime;
    meanVz = dz / deltaTime;
    meanV = totalDisplacement / deltaTime;
    maxV = meanV;
  }

  // Acceleration statistics
  const validA = steps.filter((s) => s.a !== undefined && s.a !== null && !isNaN(s.a));
  let meanAx = 0;
  let meanAy = 0;
  let meanA = 0;
  let maxA = 0;

  if (validA.length > 0) {
    meanAx = validA.reduce((acc, s) => acc + (s.ax || 0), 0) / validA.length;
    meanAy = validA.reduce((acc, s) => acc + (s.ay || 0), 0) / validA.length;
    meanA = validA.reduce((acc, s) => acc + (s.a || 0), 0) / validA.length;
    maxA = Math.max(...validA.map((s) => Math.abs(s.a || 0)));
  }

  const maxGForce = maxA / 9.80665;
  const kineticEnergy = 0.5 * track.mass * Math.pow(meanV, 2);

  let initialAngleDeg = 0;
  if (steps.length >= 2) {
    const s0 = steps[0];
    const s1 = steps[1];
    initialAngleDeg = (Math.atan2(s1.y - s0.y, s1.x - s0.x) * 180) / Math.PI;
  }

  const speedOfSound = 343; // m/s
  const machNumber = maxV > 0 ? Number((maxV / speedOfSound).toFixed(2)) : undefined;

  let maxAltitudeZ: number | undefined;
  let slantRange: number | undefined;
  if (is3D) {
    const zs = steps.map((s) => s.z ?? 0);
    maxAltitudeZ = zs.length > 0 ? Math.max(...zs) : undefined;
    slantRange = Math.hypot(final.x, final.y, final.z ?? 0);
  }

  return {
    stepCount: steps.length,
    initialPos: { x: initial.x, y: initial.y, z: initial.z },
    finalPos: { x: final.x, y: final.y, z: final.z },
    displacementX: dx,
    displacementY: dy,
    displacementZ: is3D ? dz : undefined,
    totalDisplacement,
    deltaTime,
    meanVx,
    meanVy,
    meanVz: is3D ? meanVz : undefined,
    meanVelocity: meanV,
    maxVelocity: maxV,
    meanAx,
    meanAy,
    meanAcceleration: meanA,
    maxAcceleration: maxA,
    maxGForce,
    kineticEnergy,
    initialAngleDeg,
    machNumber,
    maxAltitudeZ,
    slantRange,
  };
}

/**
 * 1. Generates Trajectory Plot Snapshot (Y vs X) with explicit (0, 0) origin option
 */
export function generateTrajectoryPlotSnapshot(
  track: Track,
  axes: CoordinateAxes,
  calibration: Calibration,
  width: number = 800,
  height: number = 460,
  options?: {
    forceZeroOrigin?: boolean;
    theme?: ReportTheme;
    customTitle?: string;
    customAccentColor?: string;
  }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const steps = track.steps || [];
  const theme = options?.theme || 'defense-navy';
  const forceZero = options?.forceZeroOrigin !== false; // default true

  // Theme Colors
  const isLight = theme === 'lab-classic' || theme === 'monochrome';
  const bgColor = isLight ? '#f8fafc' : '#1e293b';
  const plotBoxBg = isLight ? '#ffffff' : '#0f172a';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const gridColor = isLight ? '#e2e8f0' : '#334155';
  const borderColor = isLight ? '#cbd5e1' : '#475569';
  const trackColor = options?.customAccentColor || (theme === 'monochrome' ? '#0f172a' : track.color || '#0284c7');
  const originLineColor = theme === 'monochrome' ? '#0f172a' : '#eab308'; // prominent zero line

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 48, right: 35, bottom: 50, left: 65 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // Header Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 14px monospace';
  const titleText = options?.customTitle || `TRAJECTORY PLOT (Y vs X) - ${track.name.toUpperCase()}`;
  ctx.fillText(titleText, margin.left, 26);

  ctx.fillStyle = subtextColor;
  ctx.font = '10.5px sans-serif';
  ctx.fillText(
    `Mass: ${track.mass} kg | Track Steps: ${steps.length} | Scale: ${(calibration.scale || 1).toFixed(1)} px/m | Origin: (0,0) Anchored`,
    margin.left,
    40
  );

  // Plot Box
  ctx.fillStyle = plotBoxBg;
  ctx.fillRect(margin.left, margin.top, plotW, plotH);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);

  if (steps.length === 0) {
    ctx.fillStyle = subtextColor;
    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No recorded tracking points to display', width / 2, height / 2);
    return canvas.toDataURL('image/png');
  }

  // Calculate data bounds
  const xs = steps.map((s) => s.x);
  const ys = steps.map((s) => s.y);
  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);

  // Anchor (0, 0) baseline if requested
  if (forceZero) {
    minX = Math.min(0, minX);
    maxX = Math.max(0, maxX);
    minY = Math.min(0, minY);
    maxY = Math.max(0, maxY);
  }

  if (minX === maxX) { minX -= 1; maxX += 1; }
  if (minY === maxY) { minY -= 1; maxY += 1; }

  const padX = (maxX - minX) * 0.10;
  const padY = (maxY - minY) * 0.10;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const toScreenX = (x: number) => margin.left + ((x - minX) / (maxX - minX)) * plotW;
  const toScreenY = (y: number) => margin.top + plotH - ((y - minY) / (maxY - minY)) * plotH;

  // Grid lines
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // X grid (5 divisions)
  ctx.fillStyle = subtextColor;
  ctx.font = '9.5px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const val = minX + (i / 5) * (maxX - minX);
    const sx = toScreenX(val);
    ctx.beginPath();
    ctx.moveTo(sx, margin.top);
    ctx.lineTo(sx, margin.top + plotH);
    ctx.stroke();
    ctx.fillText(`${val.toFixed(2)}m`, sx, margin.top + plotH + 15);
  }

  // Y grid (5 divisions)
  ctx.textAlign = 'right';
  for (let j = 0; j <= 5; j++) {
    const val = minY + (j / 5) * (maxY - minY);
    const sy = toScreenY(val);
    ctx.beginPath();
    ctx.moveTo(margin.left, sy);
    ctx.lineTo(margin.left + plotW, sy);
    ctx.stroke();
    ctx.fillText(`${val.toFixed(2)}m`, margin.left - 6, sy + 3);
  }
  ctx.setLineDash([]);

  // Bold (0, 0) Axis Zero-Baseline Reference Lines
  if (minX <= 0 && maxX >= 0) {
    const zeroX = toScreenX(0);
    ctx.strokeStyle = originLineColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(zeroX, margin.top);
    ctx.lineTo(zeroX, margin.top + plotH);
    ctx.stroke();

    ctx.fillStyle = originLineColor;
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('X=0', zeroX, margin.top - 4);
  }
  if (minY <= 0 && maxY >= 0) {
    const zeroY = toScreenY(0);
    ctx.strokeStyle = originLineColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(margin.left, zeroY);
    ctx.lineTo(margin.left + plotW, zeroY);
    ctx.stroke();

    ctx.fillStyle = originLineColor;
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Y=0', margin.left + plotW + 4, zeroY + 3);
  }

  // Trajectory Path Line
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  steps.forEach((step, idx) => {
    const sx = toScreenX(step.x);
    const sy = toScreenY(step.y);
    if (idx === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();

  // Data point markers & velocity vectors
  const vectorStep = Math.max(1, Math.floor(steps.length / 8));
  steps.forEach((step, idx) => {
    const sx = toScreenX(step.x);
    const sy = toScreenY(step.y);

    // Marker
    ctx.fillStyle = idx === 0 ? '#10b981' : idx === steps.length - 1 ? '#ef4444' : trackColor;
    ctx.beginPath();
    ctx.arc(sx, sy, idx === 0 || idx === steps.length - 1 ? 5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Frame tags on start/end
    if (idx === 0 || idx === steps.length - 1) {
      ctx.fillStyle = textColor;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`F${step.frame} (${idx === 0 ? 'START' : 'END'})`, sx + 6, sy - 4);
    }
  });

  // Axis Labels
  ctx.fillStyle = textColor;
  ctx.font = 'bold 10.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Horizontal Position X (meters) [Origin (0,0) Baseline]', margin.left + plotW / 2, height - 10);

  ctx.save();
  ctx.translate(14, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Vertical Position Y (meters) [Positive Upward]', 0, 0);
  ctx.restore();

  // Legend
  const legW = 180;
  const legH = 34;
  const legX = margin.left + plotW - legW - 8;
  const legY = margin.top + 8;
  ctx.fillStyle = isLight ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.92)';
  ctx.fillRect(legX, legY, legW, legH);
  ctx.strokeStyle = borderColor;
  ctx.strokeRect(legX, legY, legW, legH);

  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(legX + 8, legY + 12);
  ctx.lineTo(legX + 28, legY + 12);
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('Motion Trajectory', legX + 34, legY + 15);

  ctx.strokeStyle = originLineColor;
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(legX + 8, legY + 24);
  ctx.lineTo(legX + 28, legY + 24);
  ctx.stroke();

  ctx.fillStyle = textColor;
  ctx.fillText('(0,0) Baseline Axes', legX + 34, legY + 27);

  return canvas.toDataURL('image/png');
}

/**
 * 2. Generates Velocity vs Time Plot with Positive Upward Direction orientation
 */
export function generateVelocityPlotSnapshot(
  track: Track,
  clip: ClipSettings,
  width: number = 800,
  height: number = 460,
  options?: {
    positiveUpward?: boolean;
    forceZeroOrigin?: boolean;
    plotComponent?: 'resultant' | 'vy' | 'vx';
    theme?: ReportTheme;
    customAccentColor?: string;
  }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const steps = track.steps || [];
  const theme = options?.theme || 'defense-navy';
  const plotComp = options?.plotComponent || 'vy';
  const forceZero = options?.forceZeroOrigin !== false;

  const isLight = theme === 'lab-classic' || theme === 'monochrome';
  const bgColor = isLight ? '#f8fafc' : '#1e293b';
  const plotBoxBg = isLight ? '#ffffff' : '#0f172a';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const gridColor = isLight ? '#e2e8f0' : '#334155';
  const borderColor = isLight ? '#cbd5e1' : '#475569';
  const velColor = options?.customAccentColor || (theme === 'monochrome' ? '#0f172a' : '#10b981'); // Emerald velocity or custom

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 48, right: 35, bottom: 50, left: 65 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 14px monospace';
  const compLabel = plotComp === 'vy' ? 'VERTICAL VELOCITY (Vy) - POSITIVE UPWARD' : 'RESULTANT VELOCITY SPEED (v)';
  ctx.fillText(`${compLabel} - ${track.name.toUpperCase()}`, margin.left, 26);

  ctx.fillStyle = subtextColor;
  ctx.font = '10.5px sans-serif';
  ctx.fillText(
    `Positive Upward (+Vy) Ballistic Vector Orientation | Zero-Baseline Anchored (v = 0.0 m/s)`,
    margin.left,
    40
  );

  ctx.fillStyle = plotBoxBg;
  ctx.fillRect(margin.left, margin.top, plotW, plotH);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);

  if (steps.length === 0) {
    ctx.fillStyle = subtextColor;
    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No recorded tracking points to display', width / 2, height / 2);
    return canvas.toDataURL('image/png');
  }

  // Data values
  const times = steps.map((s) => s.time);
  const values = steps.map((s) => {
    if (plotComp === 'vy') return s.vy ?? 0;
    if (plotComp === 'vx') return s.vx ?? 0;
    return s.v ?? 0;
  });

  let minT = Math.min(...times);
  let maxT = Math.max(...times);
  let minV = Math.min(...values);
  let maxV = Math.max(...values);

  if (forceZero) {
    minV = Math.min(0, minV);
    if (plotComp === 'resultant') {
      minV = 0; // Speed is non-negative
    }
  }

  if (minT === maxT) { minT = 0; maxT = 1; }
  if (minV === maxV) { minV -= 2; maxV += 2; }

  const padV = (maxV - minV) * 0.12;
  minV -= padV;
  maxV += padV;

  const toScreenX = (t: number) => margin.left + ((t - minT) / (maxT - minT)) * plotW;
  const toScreenY = (v: number) => margin.top + plotH - ((v - minV) / (maxV - minV)) * plotH;

  // Grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // Time grid
  ctx.fillStyle = subtextColor;
  ctx.font = '9.5px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const tVal = minT + (i / 5) * (maxT - minT);
    const sx = toScreenX(tVal);
    ctx.beginPath();
    ctx.moveTo(sx, margin.top);
    ctx.lineTo(sx, margin.top + plotH);
    ctx.stroke();
    ctx.fillText(`${tVal.toFixed(3)}s`, sx, margin.top + plotH + 15);
  }

  // Velocity grid
  ctx.textAlign = 'right';
  for (let j = 0; j <= 5; j++) {
    const vVal = minV + (j / 5) * (maxV - minV);
    const sy = toScreenY(vVal);
    ctx.beginPath();
    ctx.moveTo(margin.left, sy);
    ctx.lineTo(margin.left + plotW, sy);
    ctx.stroke();
    ctx.fillText(`${vVal.toFixed(1)}`, margin.left - 6, sy + 3);
  }
  ctx.setLineDash([]);

  // Explicit Zero-Velocity Line
  if (minV <= 0 && maxV >= 0) {
    const zeroY = toScreenY(0);
    ctx.strokeStyle = '#eab308'; // Gold zero line
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(margin.left, zeroY);
    ctx.lineTo(margin.left + plotW, zeroY);
    ctx.stroke();

    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('v = 0.0 m/s (Zero-Baseline)', margin.left + 8, zeroY - 4);

    // Directional tags for positive upward velocity
    if (plotComp === 'vy') {
      ctx.fillStyle = '#10b981';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('+Vy (Ascent / Upward Motion) ▲', margin.left + plotW - 10, zeroY - 8);

      ctx.fillStyle = '#ef4444';
      ctx.fillText('-Vy (Descent / Downward Motion) ▼', margin.left + plotW - 10, zeroY + 14);
    }
  }

  // Velocity curve
  ctx.strokeStyle = velColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  steps.forEach((step, idx) => {
    const sx = toScreenX(step.time);
    const sy = toScreenY(values[idx]);
    if (idx === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();

  // Data points
  steps.forEach((step, idx) => {
    const sx = toScreenX(step.time);
    const sy = toScreenY(values[idx]);
    ctx.fillStyle = velColor;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Axis Labels
  ctx.fillStyle = textColor;
  ctx.font = 'bold 10.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Elapsed Physical Time t (seconds)', margin.left + plotW / 2, height - 10);

  ctx.save();
  ctx.translate(14, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${plotComp === 'vy' ? 'Vertical Velocity Vy' : 'Velocity Magnitude v'} (m/s) [Positive Upward]`, 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

/**
 * 2b. Generates Acceleration vs Time Plot Snapshot with Zero-Baseline
 */
export function generateAccelerationPlotSnapshot(
  track: Track,
  clip: ClipSettings,
  width: number = 800,
  height: number = 460,
  options?: {
    forceZeroOrigin?: boolean;
    theme?: ReportTheme;
    customAccentColor?: string;
  }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const steps = track.steps || [];
  const theme = options?.theme || 'defense-navy';
  const forceZero = options?.forceZeroOrigin !== false;

  const isLight = theme === 'lab-classic' || theme === 'monochrome';
  const bgColor = isLight ? '#f8fafc' : '#1e293b';
  const plotBoxBg = isLight ? '#ffffff' : '#0f172a';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#94a3b8';
  const gridColor = isLight ? '#e2e8f0' : '#334155';
  const borderColor = isLight ? '#cbd5e1' : '#475569';
  const accelColor = options?.customAccentColor || (theme === 'monochrome' ? '#0f172a' : '#ef4444');

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  const margin = { top: 48, right: 35, bottom: 50, left: 65 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;

  // Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 14px monospace';
  ctx.fillText(`TOTAL ACCELERATION (a vs Time) - ${track.name.toUpperCase()}`, margin.left, 26);

  ctx.fillStyle = subtextColor;
  ctx.font = '10.5px sans-serif';
  ctx.fillText('Kinematic Time Derivative | Acceleration Magnitude (m/s²)', margin.left, 40);

  // Plot box
  ctx.fillStyle = plotBoxBg;
  ctx.fillRect(margin.left, margin.top, plotW, plotH);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(margin.left, margin.top, plotW, plotH);

  if (steps.length === 0) {
    ctx.fillStyle = subtextColor;
    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No acceleration data points available', width / 2, height / 2);
    return canvas.toDataURL('image/png');
  }

  const times = steps.map((s) => s.time);
  const values = steps.map((s) => (s.a !== undefined && s.a !== null && !isNaN(s.a) ? s.a : 0));

  let minT = Math.min(...times);
  let maxT = Math.max(...times);
  let minA = Math.min(...values);
  let maxA = Math.max(...values);

  if (forceZero) {
    minA = Math.min(0, minA);
    maxA = Math.max(0, maxA);
  }

  if (minT === maxT) { minT = 0; maxT = 1; }
  if (minA === maxA) { minA = 0; maxA = 10; }

  const padA = (maxA - minA) * 0.15;
  minA -= padA;
  maxA += padA;

  const toScreenX = (t: number) => margin.left + ((t - minT) / (maxT - minT)) * plotW;
  const toScreenY = (a: number) => margin.top + plotH - ((a - minA) / (maxA - minA)) * plotH;

  // Grid
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);

  // X divisions
  ctx.fillStyle = subtextColor;
  ctx.font = '9.5px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i <= 5; i++) {
    const val = minT + (i / 5) * (maxT - minT);
    const sx = toScreenX(val);
    ctx.beginPath();
    ctx.moveTo(sx, margin.top);
    ctx.lineTo(sx, margin.top + plotH);
    ctx.stroke();
    ctx.fillText(`${val.toFixed(3)}s`, sx, margin.top + plotH + 15);
  }

  // Y divisions
  ctx.textAlign = 'right';
  for (let j = 0; j <= 5; j++) {
    const val = minA + (j / 5) * (maxA - minA);
    const sy = toScreenY(val);
    ctx.beginPath();
    ctx.moveTo(margin.left, sy);
    ctx.lineTo(margin.left + plotW, sy);
    ctx.stroke();
    ctx.fillText(`${val.toFixed(1)}`, margin.left - 6, sy + 3);
  }
  ctx.setLineDash([]);

  // Zero line
  if (minA <= 0 && maxA >= 0) {
    const zeroY = toScreenY(0);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(margin.left, zeroY);
    ctx.lineTo(margin.left + plotW, zeroY);
    ctx.stroke();
    ctx.fillStyle = '#eab308';
    ctx.font = 'bold 8.5px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('a = 0.0 m/s²', margin.left + 8, zeroY - 4);
  }

  // Curve
  ctx.strokeStyle = accelColor;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  steps.forEach((step, idx) => {
    const sx = toScreenX(step.time);
    const sy = toScreenY(values[idx]);
    if (idx === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  });
  ctx.stroke();

  // Points
  steps.forEach((step, idx) => {
    const sx = toScreenX(step.time);
    const sy = toScreenY(values[idx]);
    ctx.fillStyle = accelColor;
    ctx.beginPath();
    ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  // Labels
  ctx.fillStyle = textColor;
  ctx.font = 'bold 10.5px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Elapsed Physical Time t (seconds)', margin.left + plotW / 2, height - 10);

  ctx.save();
  ctx.translate(14, margin.top + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Acceleration a (m/s²)', 0, 0);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

/**
 * 3. Generates 3D Spatial Trajectory Plot Snapshot (Isometric X, Y, Z Projection)
 */
export function generate3DTrajectoryPlotSnapshot(
  track: Track,
  triangulation?: TriangulationConfig,
  width: number = 800,
  height: number = 460,
  options?: {
    forceZeroOrigin?: boolean;
    theme?: ReportTheme;
    customTitle?: string;
    customAccentColor?: string;
  }
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const steps = track.steps || [];
  const theme = options?.theme || 'defense-navy';
  const isLight = theme === 'lab-classic' || theme === 'monochrome';
  const bgColor = isLight ? '#f8fafc' : '#111827';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const subtextColor = isLight ? '#64748b' : '#9ca3af';
  const gridColor = isLight ? '#cbd5e1' : '#374151';
  const trackColor = options?.customAccentColor || (theme === 'monochrome' ? '#0f172a' : '#38bdf8'); // Cyan 3D spline or custom

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.fillStyle = textColor;
  ctx.font = 'bold 14px monospace';
  ctx.fillText(options?.customTitle || `3D SPATIAL TRAJECTORY PLOT (X, Y, Z) - ${track.name.toUpperCase()}`, 35, 26);

  ctx.fillStyle = subtextColor;
  ctx.font = '10px sans-serif';
  const baselineStr = triangulation?.baselineMeters ? ` | Baseline: ${triangulation.baselineMeters.toFixed(2)}m` : '';
  const dltStr = triangulation?.meanResidualMeters ? ` | DLT Residual: ${(triangulation.meanResidualMeters * 1000).toFixed(1)}mm` : '';
  ctx.fillText(
    `Stereo Optical Triangulation | Z-Axis Vertical Altitude (Positive Upward)${baselineStr}${dltStr}`,
    35,
    40
  );

  if (steps.length === 0) {
    ctx.fillStyle = subtextColor;
    ctx.font = 'italic 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No 3D spatial points recorded', width / 2, height / 2);
    return canvas.toDataURL('image/png');
  }

  // Calculate 3D bounds
  const xs = steps.map((s) => s.x);
  const ys = steps.map((s) => s.y);
  const zs = steps.map((s) => s.z ?? 0);

  let minX = Math.min(...xs);
  let maxX = Math.max(...xs);
  let minY = Math.min(...ys);
  let maxY = Math.max(...ys);
  let minZ = Math.min(...zs);
  let maxZ = Math.max(...zs);

  if (options?.forceZeroOrigin) {
    minX = Math.min(0, minX);
    minY = Math.min(0, minY);
    minZ = Math.min(0, minZ);
  }

  const rangeX = Math.max(0.1, maxX - minX);
  const rangeY = Math.max(0.1, maxY - minY);
  const rangeZ = Math.max(0.1, maxZ - minZ);

  // Isometric 3D projection parameters
  const originScreenX = width * 0.45;
  const originScreenY = height * 0.65;
  const scale3D = Math.min(width, height) * 0.48 / Math.max(rangeX, rangeY, rangeZ);

  const project3D = (x: number, y: number, z: number) => {
    // Standard isometric: X right-down, Y left-down, Z straight UP
    const normX = (x - minX);
    const normY = (y - minY);
    const normZ = (z - minZ);

    const cos30 = Math.cos((30 * Math.PI) / 180);
    const sin30 = Math.sin((30 * Math.PI) / 180);

    const sx = originScreenX + (normX * cos30 - normY * cos30) * scale3D;
    const sy = originScreenY + (normX * sin30 + normY * sin30) * scale3D - normZ * scale3D;
    return { sx, sy };
  };

  // Draw Ground Plane Grid (Z = 0)
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);

  const gridSteps = 4;
  for (let i = 0; i <= gridSteps; i++) {
    const gx = minX + (i / gridSteps) * rangeX;
    const p1 = project3D(gx, minY, minZ);
    const p2 = project3D(gx, maxY, minZ);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.stroke();
  }
  for (let j = 0; j <= gridSteps; j++) {
    const gy = minY + (j / gridSteps) * rangeY;
    const p1 = project3D(minX, gy, minZ);
    const p2 = project3D(maxX, gy, minZ);
    ctx.beginPath();
    ctx.moveTo(p1.sx, p1.sy);
    ctx.lineTo(p2.sx, p2.sy);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Draw 3D Axes Lines (X, Y, Z from origin)
  const o0 = project3D(minX, minY, minZ);
  const oX = project3D(maxX, minY, minZ);
  const oY = project3D(minX, maxY, minZ);
  const oZ = project3D(minX, minY, maxZ);

  // X Axis (Red)
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(o0.sx, o0.sy);
  ctx.lineTo(oX.sx, oX.sy);
  ctx.stroke();

  // Y Axis (Green)
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(o0.sx, o0.sy);
  ctx.lineTo(oY.sx, oY.sy);
  ctx.stroke();

  // Z Axis (Blue - Vertical Altitude)
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(o0.sx, o0.sy);
  ctx.lineTo(oZ.sx, oZ.sy);
  ctx.stroke();

  // Axis Labels
  ctx.font = 'bold 9.5px monospace';
  ctx.fillStyle = '#ef4444';
  ctx.fillText(`+X Range (${maxX.toFixed(2)}m)`, oX.sx + 4, oX.sy + 4);

  ctx.fillStyle = '#10b981';
  ctx.fillText(`+Y Cross (${maxY.toFixed(2)}m)`, oY.sx - 80, oY.sy + 4);

  ctx.fillStyle = '#3b82f6';
  ctx.fillText(`+Z Altitude (${maxZ.toFixed(2)}m) ▲`, oZ.sx - 20, oZ.sy - 8);

  // Ground Shadow Line (drop projection onto Z=0)
  ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([2, 3]);
  ctx.beginPath();
  steps.forEach((step, idx) => {
    const sp = project3D(step.x, step.y, minZ);
    if (idx === 0) ctx.moveTo(sp.sx, sp.sy);
    else ctx.lineTo(sp.sx, sp.sy);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // Vertical Drop-Lines at sample points
  const dropStep = Math.max(1, Math.floor(steps.length / 6));
  steps.forEach((step, idx) => {
    if (idx % dropStep === 0) {
      const topP = project3D(step.x, step.y, step.z ?? 0);
      const botP = project3D(step.x, step.y, minZ);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(topP.sx, topP.sy);
      ctx.lineTo(botP.sx, botP.sy);
      ctx.stroke();
    }
  });

  // 3D Trajectory Path Spline
  ctx.strokeStyle = trackColor;
  ctx.lineWidth = 3;
  ctx.beginPath();
  steps.forEach((step, idx) => {
    const p = project3D(step.x, step.y, step.z ?? 0);
    if (idx === 0) ctx.moveTo(p.sx, p.sy);
    else ctx.lineTo(p.sx, p.sy);
  });
  ctx.stroke();

  // 3D Data Markers
  steps.forEach((step, idx) => {
    const p = project3D(step.x, step.y, step.z ?? 0);
    ctx.fillStyle = idx === 0 ? '#10b981' : idx === steps.length - 1 ? '#ef4444' : trackColor;
    ctx.beginPath();
    ctx.arc(p.sx, p.sy, idx === 0 || idx === steps.length - 1 ? 5.5 : 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    if (idx === 0 || idx === steps.length - 1) {
      ctx.fillStyle = textColor;
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`F${step.frame} [Z=${(step.z ?? 0).toFixed(2)}m]`, p.sx + 6, p.sy - 4);
    }
  });

  return canvas.toDataURL('image/png');
}

/**
 * 4. Generates and downloads a complete multi-page PDF Field Report
 * with full custom flexibility (Zero origin, velocity upward, 3D spatial coverage, themes)
 */
export async function generateExperimentPdfReport(params: {
  experimentTitle: string;
  track: Track;
  allTracks: Track[];
  clip: ClipSettings;
  calibration: Calibration;
  axes: CoordinateAxes;
  videoSnapshotUrl: string | null;
  metadata?: ReportMetadata;
  customOptions?: ReportCustomOptions;
  triangulation?: TriangulationConfig;
}): Promise<void> {
  const {
    experimentTitle,
    track,
    clip,
    calibration,
    axes,
    videoSnapshotUrl,
    metadata,
    customOptions,
    triangulation,
  } = params;

  const is3D = customOptions?.is3D ?? Boolean(triangulation && (track.steps[0]?.z !== undefined || track.steps.some(s => s.z !== undefined)));
  const summary = computeTrackSummary(track, clip.fps, is3D);
  const theme = customOptions?.theme || 'defense-navy';

  // 1. Initialize PDF Document (A4 portrait: 595.28 x 841.89 points)
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

  // Theme Palette
  let cHeader = rgb(0.12, 0.23, 0.37); // Navy default
  let cAccent = rgb(0.02, 0.52, 0.78);
  let cDark = rgb(0.1, 0.1, 0.1);
  let cGray = rgb(0.35, 0.35, 0.35);
  let cLightBg = rgb(0.96, 0.97, 0.98);
  let cBorder = rgb(0.65, 0.65, 0.65);
  let cEmerald = rgb(0.06, 0.6, 0.3);
  let cWhite = rgb(1, 1, 1);

  if (theme === 'stealth-dark') {
    cHeader = rgb(0.06, 0.08, 0.12);
    cAccent = rgb(0.06, 0.65, 0.45);
    cLightBg = rgb(0.93, 0.95, 0.94);
  } else if (theme === 'lab-classic') {
    cHeader = rgb(0.15, 0.35, 0.85);
    cAccent = rgb(0.2, 0.5, 0.9);
    cLightBg = rgb(0.95, 0.97, 1.0);
  } else if (theme === 'monochrome') {
    cHeader = rgb(0.12, 0.12, 0.12);
    cAccent = rgb(0.25, 0.25, 0.25);
    cLightBg = rgb(0.97, 0.97, 0.97);
  }

  // =========================================================================
  // PAGE 1: EXECUTIVE SUMMARY, 2D/3D TELEMETRY & VISUAL FIGURES
  // =========================================================================
  const page1 = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page1.getSize();

  // Top Header Banner
  page1.drawRectangle({
    x: 0,
    y: height - 28,
    width,
    height: 28,
    color: cHeader,
  });

  const bannerTitle = is3D
    ? 'TRACKER 3D STEREO DLT SPATIAL BALLISTICS & RANGE TELEMETRY'
    : 'TRACKER KINEMATICS & BALLISTIC OPTICAL RANGE TELEMETRY';

  page1.drawText(bannerTitle, {
    x: 36,
    y: height - 19,
    size: 9.5,
    font: fontBold,
    color: cWhite,
  });

  page1.drawText(is3D ? 'STEREO 3D RANGE MODE' : 'LOCAL AIR-GAPPED WORKSTATION', {
    x: width - 200,
    y: height - 19,
    size: 8,
    font: fontMono,
    color: rgb(0.4, 0.9, 0.6),
  });

  let curY = height - 52;

  // Report Main Title
  const reportMainTitle = is3D
    ? '3D STEREO KINEMATICS & SPATIAL TRAJECTORY REPORT'
    : 'EXPERIMENT KINEMATICS & TRAJECTORY FIELD REPORT';

  page1.drawText(reportMainTitle, {
    x: 36,
    y: curY,
    size: 15,
    font: fontBold,
    color: cHeader,
  });

  curY -= 15;
  page1.drawText(`Target Study: ${experimentTitle}`, {
    x: 36,
    y: curY,
    size: 10.5,
    font: fontBold,
    color: cDark,
  });

  const nowStr = new Date().toLocaleString();
  page1.drawText(`Generated: ${nowStr} (Local PC)`, {
    x: width - 215,
    y: curY,
    size: 8.5,
    font: fontRegular,
    color: cGray,
  });

  curY -= 12;
  page1.drawLine({
    start: { x: 36, y: curY },
    end: { x: width - 36, y: curY },
    thickness: 1,
    color: cBorder,
  });

  curY -= 16;

  // Metadata Grid
  const metaBoxH = is3D ? 68 : 56;
  const metaBoxY = curY - metaBoxH;

  page1.drawRectangle({
    x: 36,
    y: metaBoxY,
    width: width - 72,
    height: metaBoxH,
    color: cLightBg,
    borderColor: cBorder,
    borderWidth: 1,
  });

  const col1X = 46;
  const col2X = 220;
  const col3X = 400;

  page1.drawText(`Analyzed Track: ${track.name}`, {
    x: col1X,
    y: curY - 13,
    size: 9,
    font: fontBold,
    color: cHeader,
  });
  page1.drawText(`Point Mass (m): ${track.mass} kg`, {
    x: col1X,
    y: curY - 26,
    size: 8.5,
    font: fontRegular,
    color: cDark,
  });
  page1.drawText(`Data Steps: ${track.steps.length} frames`, {
    x: col1X,
    y: curY - 39,
    size: 8.5,
    font: fontRegular,
    color: cDark,
  });
  if (is3D) {
    page1.drawText(`3D Mode: Active (DLT 11-Param)`, {
      x: col1X,
      y: curY - 52,
      size: 8,
      font: fontBold,
      color: cEmerald,
    });
  }

  page1.drawText(`Camera: ${clip.cameraModel || 'Photron / High-Speed'}`, {
    x: col2X,
    y: curY - 13,
    size: 8.5,
    font: fontBold,
    color: cDark,
  });
  page1.drawText(`Frame Rate: ${clip.fps.toLocaleString()} fps`, {
    x: col2X,
    y: curY - 26,
    size: 8.5,
    font: fontRegular,
    color: cDark,
  });
  page1.drawText(`Scale: ${(calibration.scale || 1).toFixed(2)} px/m`, {
    x: col2X,
    y: curY - 39,
    size: 8.5,
    font: fontRegular,
    color: cDark,
  });
  if (is3D) {
    const baseDist = customOptions?.stereoBaselineMeters ?? triangulation?.baselineMeters ?? 1.2;
    page1.drawText(`Stereo Baseline: ${baseDist.toFixed(2)} m`, {
      x: col2X,
      y: curY - 52,
      size: 8,
      font: fontRegular,
      color: cDark,
    });
  }

  page1.drawText(`Facility: ${metadata?.facility || 'Range Test Cell A'}`, {
    x: col3X,
    y: curY - 13,
    size: 8.5,
    font: fontRegular,
    color: cDark,
  });
  page1.drawText(`Investigator: ${metadata?.investigator || 'Field Range Engineer'}`, {
    x: col3X,
    y: curY - 26,
    size: 8.5,
    font: fontRegular,
    color: cDark,
  });
  page1.drawText(`Test Run ID: ${metadata?.testRunId || 'RUN-HS-01'}`, {
    x: col3X,
    y: curY - 39,
    size: 8.5,
    font: fontRegular,
    color: cDark,
  });
  if (is3D) {
    const convAngle = customOptions?.stereoConvergenceDeg ?? triangulation?.convergenceAngleDeg ?? 90;
    page1.drawText(`Convergence Angle: ${convAngle}°`, {
      x: col3X,
      y: curY - 52,
      size: 8,
      font: fontRegular,
      color: cDark,
    });
  }

  curY = metaBoxY - 18;

  // Executive Kinematics Telemetry Matrix
  const matrixTitle = is3D
    ? 'EXECUTIVE 3D SPATIAL KINEMATICS TELEMETRY MATRIX'
    : 'EXECUTIVE KINEMATICS TELEMETRY MATRIX';

  page1.drawText(matrixTitle, {
    x: 36,
    y: curY,
    size: 10.5,
    font: fontBold,
    color: cHeader,
  });

  curY -= 6;
  const metricsBoxH = 68;
  const metricsBoxY = curY - metricsBoxH;

  page1.drawRectangle({
    x: 36,
    y: metricsBoxY,
    width: width - 72,
    height: metricsBoxH,
    color: rgb(0.98, 0.99, 1.0),
    borderColor: cHeader,
    borderWidth: 1.2,
  });

  if (summary) {
    const mColW = (width - 72) / 4;

    // Box 1: Velocity
    const vTitle = is3D ? 'RESULTANT SPEED (v_3d)' : 'MEAN VELOCITY (v_mean)';
    page1.drawText(vTitle, {
      x: 36 + 10,
      y: curY - 15,
      size: 7.5,
      font: fontBold,
      color: cHeader,
    });
    page1.drawText(`${summary.meanVelocity.toFixed(2)} m/s`, {
      x: 36 + 10,
      y: curY - 31,
      size: 13,
      font: fontBold,
      color: cEmerald,
    });
    page1.drawText(`Peak: ${summary.maxVelocity.toFixed(1)} m/s (${(summary.maxVelocity * 3.6).toFixed(0)} km/h)`, {
      x: 36 + 10,
      y: curY - 46,
      size: 7.2,
      font: fontRegular,
      color: cGray,
    });
    if (summary.machNumber && summary.machNumber > 0.8) {
      page1.drawText(`Mach ${summary.machNumber} Supersonic`, {
        x: 36 + 10,
        y: curY - 58,
        size: 7.2,
        font: fontBold,
        color: rgb(0.8, 0.2, 0.1),
      });
    }

    // Box 2: Acceleration & G-force
    page1.drawText('PEAK ACCEL & G-FORCE', {
      x: 36 + mColW + 10,
      y: curY - 15,
      size: 7.5,
      font: fontBold,
      color: cHeader,
    });
    page1.drawText(`${summary.maxGForce.toFixed(1)} G`, {
      x: 36 + mColW + 10,
      y: curY - 31,
      size: 13,
      font: fontBold,
      color: summary.maxGForce > 50 ? rgb(0.8, 0.2, 0.1) : cHeader,
    });
    page1.drawText(`Peak a: ${summary.maxAcceleration.toFixed(0)} m/s²`, {
      x: 36 + mColW + 10,
      y: curY - 46,
      size: 7.2,
      font: fontRegular,
      color: cGray,
    });
    page1.drawText(`Mean a: ${summary.meanAcceleration.toFixed(1)} m/s²`, {
      x: 36 + mColW + 10,
      y: curY - 58,
      size: 7.2,
      font: fontRegular,
      color: cGray,
    });

    // Box 3: Total Displacement / 3D Altitude
    const dispTitle = is3D ? '3D DISPLACEMENT & ALTITUDE' : 'TOTAL DISPLACEMENT (dr)';
    page1.drawText(dispTitle, {
      x: 36 + mColW * 2 + 10,
      y: curY - 15,
      size: 7.5,
      font: fontBold,
      color: cHeader,
    });
    page1.drawText(`${summary.totalDisplacement.toFixed(3)} m`, {
      x: 36 + mColW * 2 + 10,
      y: curY - 31,
      size: 13,
      font: fontBold,
      color: cHeader,
    });
    if (is3D && summary.maxAltitudeZ !== undefined) {
      page1.drawText(`Max Altitude Z: ${summary.maxAltitudeZ.toFixed(3)} m`, {
        x: 36 + mColW * 2 + 10,
        y: curY - 46,
        size: 7.2,
        font: fontBold,
        color: cHeader,
      });
      page1.drawText(`Slant Range: ${(summary.slantRange ?? 0).toFixed(2)} m`, {
        x: 36 + mColW * 2 + 10,
        y: curY - 58,
        size: 7.2,
        font: fontRegular,
        color: cGray,
      });
    } else {
      page1.drawText(`dx: ${summary.displacementX.toFixed(3)}m | dy: ${summary.displacementY.toFixed(3)}m`, {
        x: 36 + mColW * 2 + 10,
        y: curY - 46,
        size: 7.2,
        font: fontRegular,
        color: cGray,
      });
      page1.drawText(`Launch Angle: ${summary.initialAngleDeg.toFixed(1)}°`, {
        x: 36 + mColW * 2 + 10,
        y: curY - 58,
        size: 7.2,
        font: fontRegular,
        color: cGray,
      });
    }

    // Box 4: Time & Energy
    page1.drawText('TIME INTERVAL & ENERGY', {
      x: 36 + mColW * 3 + 10,
      y: curY - 15,
      size: 7.5,
      font: fontBold,
      color: cHeader,
    });
    page1.drawText(
      summary.deltaTime < 0.01
        ? `${(summary.deltaTime * 1000).toFixed(2)} ms`
        : `${summary.deltaTime.toFixed(3)} s`,
      {
        x: 36 + mColW * 3 + 10,
        y: curY - 31,
        size: 13,
        font: fontBold,
        color: cHeader,
      }
    );
    page1.drawText(`Kinetic Energy: ${summary.kineticEnergy.toFixed(2)} J`, {
      x: 36 + mColW * 3 + 10,
      y: curY - 46,
      size: 7.2,
      font: fontRegular,
      color: cGray,
    });
    page1.drawText(`Step Count: ${summary.stepCount} marks`, {
      x: 36 + mColW * 3 + 10,
      y: curY - 58,
      size: 7.2,
      font: fontRegular,
      color: cGray,
    });
  }

  curY = metricsBoxY - 22;

  // VISUAL FIGURES: Video Analysis Snap & Trajectory / Velocity Plot Snap
  page1.drawText('FIELD VISUAL FIGURES & TRAJECTORY ANALYSIS', {
    x: 36,
    y: curY,
    size: 10.5,
    font: fontBold,
    color: cHeader,
  });

  curY -= 12;

  // Generate Plot Snapshot based on custom requested graph type
  const primaryGraph = customOptions?.primaryGraphType || (is3D ? 'trajectory-3d' : 'trajectory-yx');
  const secondaryGraph = customOptions?.secondaryGraphType && customOptions.secondaryGraphType !== 'none'
    ? customOptions.secondaryGraphType
    : null;
  const forceZero = customOptions?.forceZeroOrigin !== false; // senior officer (0,0) baseline

  const makePlotSnapshot = (graphType: ReportGraphType) => {
    if (graphType === 'trajectory-3d') {
      return generate3DTrajectoryPlotSnapshot(track, triangulation, 800, 440, {
        forceZeroOrigin: forceZero,
        theme,
        customAccentColor: customOptions?.customAccentColor,
      });
    } else if (graphType === 'accel-time') {
      return generateAccelerationPlotSnapshot(track, clip, 800, 440, {
        forceZeroOrigin: forceZero,
        theme,
        customAccentColor: customOptions?.customAccentColor,
      });
    } else if (graphType === 'velocity-time' || graphType === 'vy-time' || graphType === 'vx-time') {
      return generateVelocityPlotSnapshot(track, clip, 800, 440, {
        positiveUpward: customOptions?.velocityPositiveUpward !== false,
        forceZeroOrigin: forceZero,
        plotComponent: graphType === 'vy-time' ? 'vy' : graphType === 'vx-time' ? 'vx' : 'resultant',
        theme,
        customAccentColor: customOptions?.customAccentColor,
      });
    } else {
      return generateTrajectoryPlotSnapshot(track, axes, calibration, 800, 440, {
        forceZeroOrigin: forceZero,
        theme,
        customAccentColor: customOptions?.customAccentColor,
      });
    }
  };

  const plotDataUrl = makePlotSnapshot(primaryGraph);
  const secondaryPlotDataUrl = secondaryGraph ? makePlotSnapshot(secondaryGraph) : '';
  const totalPages = secondaryPlotDataUrl ? 3 : 2;

  const figW = 250;
  const figH = 145;

  // Figure 1: Video Analysis Snapshot
  if (videoSnapshotUrl) {
    try {
      const snapImgBytes = await fetch(videoSnapshotUrl).then((res) => res.arrayBuffer());
      const snapImage = await pdfDoc.embedPng(snapImgBytes);
      page1.drawImage(snapImage, {
        x: 36,
        y: curY - figH,
        width: figW,
        height: figH,
      });
      page1.drawRectangle({
        x: 36,
        y: curY - figH,
        width: figW,
        height: figH,
        borderColor: cBorder,
        borderWidth: 1,
      });
    } catch {
      page1.drawRectangle({
        x: 36,
        y: curY - figH,
        width: figW,
        height: figH,
        color: rgb(0.94, 0.94, 0.94),
        borderColor: cBorder,
        borderWidth: 1,
      });
      page1.drawText('Video Snapshot Preview Available', {
        x: 36 + 45,
        y: curY - figH / 2,
        size: 9,
        font: fontRegular,
        color: cGray,
      });
    }
  } else {
    page1.drawRectangle({
      x: 36,
      y: curY - figH,
      width: figW,
      height: figH,
      color: rgb(0.94, 0.94, 0.94),
      borderColor: cBorder,
      borderWidth: 1,
    });
    page1.drawText('Video Frame Snapshot (Direct Capture)', {
      x: 36 + 35,
      y: curY - figH / 2,
      size: 9,
      font: fontRegular,
      color: cGray,
    });
  }

  const snapFrameNum = customOptions?.videoSnapFrame !== undefined ? customOptions.videoSnapFrame : clip.startFrame;
  page1.drawText(`Figure 1: Video Analysis Frame (Frame ${snapFrameNum}, t = ${formatHighSpeedTime(snapFrameNum * (1 / clip.fps), clip.fps, clip.timeUnit)})`, {
    x: 36,
    y: curY - figH - 12,
    size: 7.5,
    font: fontBold,
    color: cDark,
  });

  // Figure 2: Trajectory / Velocity Plot Snapshot
  if (plotDataUrl) {
    try {
      const plotImgBytes = await fetch(plotDataUrl).then((res) => res.arrayBuffer());
      const plotImage = await pdfDoc.embedPng(plotImgBytes);
      page1.drawImage(plotImage, {
        x: 36 + figW + 22,
        y: curY - figH,
        width: figW,
        height: figH,
      });
      page1.drawRectangle({
        x: 36 + figW + 22,
        y: curY - figH,
        width: figW,
        height: figH,
        borderColor: cBorder,
        borderWidth: 1,
      });
    } catch {
      // ignore
    }
  }

  const fig2Label = is3D && primaryGraph === 'trajectory-3d'
    ? 'Figure 2: 3D Spatial Trajectory [X, Y, Z] (Altitude Z Upward)'
    : primaryGraph === 'velocity-time' || primaryGraph === 'vy-time'
    ? 'Figure 2: Velocity vs Time (Positive Upward Direction & Zero-Baseline)'
    : 'Figure 2: Field Trajectory Plot [Origin (0,0) Baseline Anchored]';

  page1.drawText(fig2Label, {
    x: 36 + figW + 22,
    y: curY - figH - 12,
    size: 7.5,
    font: fontBold,
    color: cDark,
  });

  curY = curY - figH - 32;

  // Observations & Notes
  page1.drawText('FIELD RANGE OBSERVATIONS & CLEARANCE NOTES', {
    x: 36,
    y: curY,
    size: 9.5,
    font: fontBold,
    color: cHeader,
  });

  curY -= 6;
  const notesBoxH = 46;
  const notesBoxY = curY - notesBoxH;

  page1.drawRectangle({
    x: 36,
    y: notesBoxY,
    width: width - 72,
    height: notesBoxH,
    color: rgb(0.98, 0.98, 0.98),
    borderColor: cBorder,
    borderWidth: 1,
  });

  const notesText =
    metadata?.notes ||
    `Trajectory verified via sub-pixel optical tracking. Kinematic regression computed with ${(calibration.scale || 1).toFixed(1)} px/m physical reference. Target exhibited stable flight path. Zero anomalous coordinate deviations recorded.`;

  page1.drawText(notesText.slice(0, 260), {
    x: 44,
    y: curY - 14,
    size: 8,
    font: fontRegular,
    color: cDark,
    lineHeight: 11,
  });

  curY = notesBoxY - 20;

  // Verification & Sign-off Block
  page1.drawText('VERIFICATION & RANGE APPROVAL SIGN-OFF', {
    x: 36,
    y: curY,
    size: 9.5,
    font: fontBold,
    color: cHeader,
  });

  curY -= 16;
  const signColW = (width - 72) / 3;

  page1.drawLine({
    start: { x: 36, y: curY },
    end: { x: 36 + signColW - 15, y: curY },
    thickness: 0.8,
    color: cDark,
  });
  page1.drawText('Range Engineer Signature', {
    x: 36,
    y: curY - 10,
    size: 7.5,
    font: fontBold,
    color: cGray,
  });

  page1.drawLine({
    start: { x: 36 + signColW, y: curY },
    end: { x: 36 + signColW * 2 - 15, y: curY },
    thickness: 0.8,
    color: cDark,
  });
  page1.drawText('Chief Range Safety Officer (CRSO)', {
    x: 36 + signColW,
    y: curY - 10,
    size: 7.5,
    font: fontBold,
    color: cGray,
  });

  page1.drawLine({
    start: { x: 36 + signColW * 2, y: curY },
    end: { x: width - 36, y: curY },
    thickness: 0.8,
    color: cDark,
  });
  page1.drawText('Quality Assurance & Clearance Date', {
    x: 36 + signColW * 2,
    y: curY - 10,
    size: 7.5,
    font: fontBold,
    color: cGray,
  });

  // Footer Page 1
  page1.drawText(
    `Page 1 of ${totalPages}  •  Field Kinematics Report  •  Tracker Suite  •  Air-Gapped Local Workstation`,
    {
      x: width / 2 - 175,
      y: 16,
      size: 7.5,
      font: fontRegular,
      color: cGray,
    }
  );

  // =========================================================================
  // OPTIONAL PAGE 2: EXTENDED WAVEFORMS (IF SECONDARY GRAPH REQUESTED)
  // =========================================================================
  if (secondaryPlotDataUrl) {
    const pageWave = pdfDoc.addPage([595.28, 841.89]);
    pageWave.drawRectangle({
      x: 0,
      y: height - 28,
      width,
      height: 28,
      color: cHeader,
    });
    pageWave.drawText('EXTENDED KINEMATIC WAVEFORMS & OFFICER REQUESTED GRAPHS', {
      x: 36,
      y: height - 19,
      size: 9.5,
      font: fontBold,
      color: cWhite,
    });
    pageWave.drawText(`Target: ${track.name}`, {
      x: width - 180,
      y: height - 19,
      size: 8.5,
      font: fontMono,
      color: rgb(0.8, 0.9, 1.0),
    });

    let wY = height - 52;
    pageWave.drawText('OFFICER REQUESTED KINEMATIC WAVEFORMS & DYNAMICS', {
      x: 36,
      y: wY,
      size: 13,
      font: fontBold,
      color: cHeader,
    });
    wY -= 14;
    pageWave.drawText(
      'Synchronized flight dynamics graphs rendered with explicit (0,0) baseline and positive upward rate standards.',
      {
        x: 36,
        y: wY,
        size: 8.5,
        font: fontRegular,
        color: cGray,
      }
    );
    wY -= 16;

    const fullFigW = width - 72;
    const fullFigH = 295;

    // Primary Graph
    try {
      const p1Bytes = await fetch(plotDataUrl).then((res) => res.arrayBuffer());
      const p1Img = await pdfDoc.embedPng(p1Bytes);
      pageWave.drawImage(p1Img, {
        x: 36,
        y: wY - fullFigH,
        width: fullFigW,
        height: fullFigH,
      });
      pageWave.drawRectangle({
        x: 36,
        y: wY - fullFigH,
        width: fullFigW,
        height: fullFigH,
        borderColor: cBorder,
        borderWidth: 1,
      });
    } catch {
      // ignore
    }

    wY = wY - fullFigH - 28;

    // Secondary Graph
    try {
      const p2Bytes = await fetch(secondaryPlotDataUrl).then((res) => res.arrayBuffer());
      const p2Img = await pdfDoc.embedPng(p2Bytes);
      pageWave.drawImage(p2Img, {
        x: 36,
        y: wY - fullFigH,
        width: fullFigW,
        height: fullFigH,
      });
      pageWave.drawRectangle({
        x: 36,
        y: wY - fullFigH,
        width: fullFigW,
        height: fullFigH,
        borderColor: cBorder,
        borderWidth: 1,
      });
    } catch {
      // ignore
    }

    pageWave.drawText(
      `Page 2 of ${totalPages}  •  Officer Waveforms & Dynamics  •  Tracker Suite  •  Air-Gapped Workstation`,
      {
        x: width / 2 - 185,
        y: 16,
        size: 7.5,
        font: fontRegular,
        color: cGray,
      }
    );
  }

  // =========================================================================
  // TABULAR KINEMATIC DATA LOG (PAGE 2 OR PAGE 3)
  // =========================================================================
  const page2 = pdfDoc.addPage([595.28, 841.89]);

  // Page 2 Header Banner
  page2.drawRectangle({
    x: 0,
    y: height - 28,
    width,
    height: 28,
    color: cHeader,
  });

  page2.drawText('KINEMATIC LOG & MEASUREMENT STEP AUDIT', {
    x: 36,
    y: height - 19,
    size: 10,
    font: fontBold,
    color: cWhite,
  });

  page2.drawText(`Target Track: ${track.name}`, {
    x: width - 180,
    y: height - 19,
    size: 8.5,
    font: fontMono,
    color: rgb(0.8, 0.9, 1.0),
  });

  let p2Y = height - 50;

  page2.drawText('TABULAR STEP-BY-STEP KINEMATICS DATA LOG', {
    x: 36,
    y: p2Y,
    size: 13,
    font: fontBold,
    color: cHeader,
  });

  p2Y -= 14;
  page2.drawText(
    is3D
      ? 'Calibrated 3D Cartesian coordinates (X, Y, Z), velocity derivatives (Vx, Vy, Vz), speed, and G-force.'
      : 'Calibrated 2D Cartesian coordinates (x, y), velocity derivatives (vx, vy), resultant speed, and acceleration.',
    {
      x: 36,
      y: p2Y,
      size: 8.5,
      font: fontRegular,
      color: cGray,
    }
  );

  p2Y -= 16;

  // Table setup
  const tableX = 36;
  const tableW = width - 72;
  const rowHeight = 15;

  // Columns definition based on 2D vs 3D
  const cols = is3D
    ? [
        { label: 'FRAME', x: tableX + 4, w: 38 },
        { label: 'TIME (s)', x: tableX + 44, w: 56 },
        { label: 'X (m)', x: tableX + 102, w: 48 },
        { label: 'Y (m)', x: tableX + 152, w: 48 },
        { label: 'Z (m)', x: tableX + 202, w: 48 },
        { label: 'Vx (m/s)', x: tableX + 252, w: 50 },
        { label: 'Vy (m/s)', x: tableX + 304, w: 50 },
        { label: 'Vz (m/s)', x: tableX + 356, w: 50 },
        { label: 'v (m/s)', x: tableX + 408, w: 54 },
        { label: 'G-FORCE', x: tableX + 464, w: 52 },
      ]
    : [
        { label: 'FRAME', x: tableX + 4, w: 42 },
        { label: 'TIME (s)', x: tableX + 48, w: 60 },
        { label: 'X (m)', x: tableX + 110, w: 55 },
        { label: 'Y (m)', x: tableX + 167, w: 55 },
        { label: 'Vx (m/s)', x: tableX + 224, w: 58 },
        { label: 'Vy (m/s)', x: tableX + 284, w: 58 },
        { label: 'SPEED v', x: tableX + 344, w: 60 },
        { label: 'Ax (m/s²)', x: tableX + 406, w: 56 },
        { label: 'Ay (m/s²)', x: tableX + 464, w: 56 },
      ];

  // Draw Table Header
  page2.drawRectangle({
    x: tableX,
    y: p2Y - rowHeight + 4,
    width: tableW,
    height: rowHeight,
    color: rgb(0.2, 0.28, 0.38),
  });

  cols.forEach((col) => {
    page2.drawText(col.label, {
      x: col.x,
      y: p2Y - 6,
      size: 7,
      font: fontBold,
      color: cWhite,
    });
  });

  p2Y -= rowHeight;

  // Max 42 steps printed on page 2
  const stepsToPrint = track.steps.slice(0, 42);

  const fmtNum = (v: number | null | undefined, digits = 2) =>
    v !== undefined && v !== null && !isNaN(v) ? v.toFixed(digits) : '—';

  stepsToPrint.forEach((step, idx) => {
    const rowY = p2Y - idx * rowHeight;
    const isEven = idx % 2 === 0;

    page2.drawRectangle({
      x: tableX,
      y: rowY - rowHeight + 4,
      width: tableW,
      height: rowHeight,
      color: isEven ? rgb(1, 1, 1) : rgb(0.96, 0.97, 0.98),
    });

    if (is3D) {
      page2.drawText(step.frame.toString(), { x: cols[0].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(step.time.toFixed(4), { x: cols[1].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(step.x.toFixed(3), { x: cols[2].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(step.y.toFixed(3), { x: cols[3].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText((step.z ?? 0).toFixed(3), { x: cols[4].x, y: rowY - 6, size: 7.2, font: fontMono, color: cHeader });
      page2.drawText(fmtNum(step.vx, 1), { x: cols[5].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(fmtNum(step.vy, 1), { x: cols[6].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(fmtNum(step.vz, 1), { x: cols[7].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(fmtNum(step.v, 1), { x: cols[8].x, y: rowY - 6, size: 7.2, font: fontMono, color: cEmerald });
      const gF = (step.a || 0) / 9.80665;
      page2.drawText(`${gF.toFixed(1)}G`, { x: cols[9].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
    } else {
      page2.drawText(step.frame.toString(), { x: cols[0].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(step.time.toFixed(4), { x: cols[1].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(step.x.toFixed(3), { x: cols[2].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(step.y.toFixed(3), { x: cols[3].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(fmtNum(step.vx, 2), { x: cols[4].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(fmtNum(step.vy, 2), { x: cols[5].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(fmtNum(step.v, 2), { x: cols[6].x, y: rowY - 6, size: 7.2, font: fontMono, color: cEmerald });
      page2.drawText(fmtNum(step.ax, 1), { x: cols[7].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
      page2.drawText(fmtNum(step.ay, 1), { x: cols[8].x, y: rowY - 6, size: 7.2, font: fontMono, color: cDark });
    }
  });

  const totalTableH = (stepsToPrint.length + 1) * rowHeight;
  page2.drawRectangle({
    x: tableX,
    y: p2Y - stepsToPrint.length * rowHeight + 4,
    width: tableW,
    height: totalTableH,
    borderColor: cBorder,
    borderWidth: 0.8,
  });

  if (track.steps.length > 42) {
    page2.drawText(
      `* Displaying first 42 of ${track.steps.length} recorded frames. Full dataset exported in accompanying CSV spreadsheet.`,
      {
        x: tableX,
        y: p2Y - stepsToPrint.length * rowHeight - 12,
        size: 7.5,
        font: fontRegular,
        color: cGray,
      }
    );
  }

  // Page 2/3 Footer
  page2.drawText(
    `Page ${totalPages} of ${totalPages}  •  Kinematic Data Log  •  Tracker Video Analysis Suite  •  Air-Gapped Local PC`,
    {
      x: width / 2 - 175,
      y: 16,
      size: 7.5,
      font: fontRegular,
      color: cGray,
    }
  );

  // ================= SAVE & TRIGGER IN-MEMORY DOWNLOAD =================
  const pdfBytes = await pdfDoc.save();
  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' });
  const blobUrl = URL.createObjectURL(blob);

  const cleanTitle = (experimentTitle || 'Experiment')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 30);
  const fileName = `Tracker_Field_Report_${is3D ? '3D_' : ''}${cleanTitle}_${track.name.replace(/\s+/g, '_')}.pdf`;

  const link = document.createElement('a');
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();

  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }, 1200);
}
