import React, { useState } from 'react';
import { Track, PointStep, ClipSettings, AnalysisMode, GraphConfig } from '../types';
import { Copy, Download, Trash2, Check, Shield, Clock } from 'lucide-react';
import { formatHighSpeedTime } from '../utils/highSpeedCameras';
import {
  conditionStepsForGraphing,
  getChannelPolaritySign,
  isChannelRectifiedPositive,
  formatSignMatrixSummary,
} from '../utils/sixChannelGraphing';

interface TableViewProps {
  tracks: Track[];
  activeTrackId: string;
  currentFrame: number;
  clip?: ClipSettings;
  analysisMode?: AnalysisMode;
  graphConfig?: GraphConfig;
  onSelectFrame: (frame: number) => void;
  onDeletePoint: (frame: number) => void;
}

/**
 * Generates a standardized Defense Range-Safety Certified Telemetry CSV string
 * with a complete `#` metadata header and per-frame 6-DOF kinematics, derivatives,
 * visible marker counts (N_A, N_L, N_M), PnP RMS reprojection error, and ±1σ uncertainties.
 */
export function buildCertifiedDefenseTelemetryCSV(
  activeTrack: Track,
  clip?: ClipSettings,
  analysisMode: AnalysisMode = '6DOF',
  graphConfig?: GraphConfig,
  viewMode: 'standard' | 'defense' = 'defense',
  effectiveUnit: 's' | 'ms' | 'us' | 'ns' = 's'
): string {
  const rawSteps = activeTrack?.steps || [];
  if (rawSteps.length === 0) return '';

  const refFrameMode = graphConfig?.referenceFrameMode ?? 'M_wrt_L';
  const coordConv = graphConfig?.coordConvention ?? 'NED_Z_DOWN';
  const filterCfg = graphConfig?.filterConfig ?? {
    type: 'raw',
    windowSize: 7,
    polyOrder: 2,
    cutoffHz: 45,
  };
  const activeVirtPtId = graphConfig?.activeVirtualPointId;

  const steps = conditionStepsForGraphing(rawSteps, filterCfg, refFrameMode, activeVirtPtId);
  const sorted = [...steps].sort((a, b) => a.frame - b.frame);
  const refT0Frame = graphConfig?.referenceFrameT0 ?? sorted[0]?.frame ?? 0;
  const refStep = sorted.find((s) => s.frame === refT0Frame) || sorted[0];

  const filterLabel =
    filterCfg.type === 'savgol'
      ? `Savitzky-Golay (window=${filterCfg.windowSize || 7}, polyOrder=${filterCfg.polyOrder || 2})`
      : filterCfg.type === 'butterworth'
      ? `Zero-Phase 4th-Order Butterworth LP (cutoff=${filterCfg.cutoffHz || 45} Hz)`
      : 'Raw (Unfiltered)';

  const minClearanceLine = activeTrack.overallMinClearance
    ? `${activeTrack.overallMinClearance.virtualPointName}: ${(
        activeTrack.overallMinClearance.minDistanceMeters * 1000
      ).toFixed(2)} mm @ Frame #${activeTrack.overallMinClearance.closestApproachFrame} (${activeTrack.overallMinClearance.closestApproachTime.toFixed(
        4
      )} s)`
    : 'N/A';

  const signMatrixHeader = formatSignMatrixSummary(
    coordConv,
    graphConfig?.channelSignConfig,
    graphConfig?.invertChannels,
    false
  );

  const applyChannelRule = (val: number, variable: string): number => {
    const sign = getChannelPolaritySign(
      variable,
      coordConv,
      graphConfig?.invertChannels,
      graphConfig?.channelSignConfig
    );
    const signed = val * sign;
    const norm = Object.is(signed, -0) ? 0 : signed;
    return isChannelRectifiedPositive(variable, graphConfig?.channelSignConfig)
      ? Math.abs(norm)
      : norm;
  };

  const metadataHeaderLines = [
    `# ==============================================================================`,
    `# CERTIFIED DEFENSE TELEMETRY & RANGE SAFETY METROLOGY EXPORT`,
    `# Track Name: ${activeTrack.name} (ID: ${activeTrack.id})`,
    `# Active Workspace Mode: ${analysisMode}`,
    `# Relative Reference Frame: ${refFrameMode}`,
    `# Coordinate Axes Convention: ${coordConv}`,
    `# 6-DOF Sign & Direction Matrix: ${signMatrixHeader}`,
    `# Event-Zero Tare Frame (t0): Frame #${refStep.frame} (t0 = ${refStep.time.toFixed(6)} s)`,
    `# Derivative Conditioning Filter: ${filterLabel}`,
    `# Active Virtual Critical Point: ${activeVirtPtId || 'vp-cg (Missile CG)'}`,
    `# Minimum Store-to-Pylon Clearance: ${minClearanceLine}`,
    `# Sample Rate: ${clip?.fps || 500} fps`,
    `# ==============================================================================`,
  ];

  const formatStepTime = (tSec: number): string => {
    if (effectiveUnit === 'us') {
      return (tSec * 1e6).toFixed(2);
    } else if (effectiveUnit === 'ms') {
      return (tSec * 1000).toFixed(3);
    } else {
      return tSec < 0.001 ? tSec.toExponential(4) : tSec.toFixed(5);
    }
  };

  if (viewMode === 'defense') {
    const headers = [
      'Frame',
      `time_${effectiveUnit}`,
      'rel_time_s',
      'dX_m',
      'dY_m',
      'dZ_m',
      'Euclidean_Distance_m',
      'Roll_phi_deg',
      'Pitch_theta_deg',
      'Yaw_psi_deg',
      'vx_mps',
      'vy_mps',
      'vz_mps',
      'Speed_mps',
      'ax_mps2',
      'ay_mps2',
      'az_mps2',
      'Accel_mps2',
      'omega_roll_dps',
      'omega_pitch_dps',
      'omega_yaw_dps',
      'Mach_Number',
      'G_Force',
      'N_A',
      'N_L',
      'N_M',
      'PnP_RMS_px',
      'sigma_X_m',
      'sigma_Y_m',
      'sigma_Z_m',
      'sigma_Roll_deg',
      'sigma_Pitch_deg',
      'sigma_Yaw_deg',
    ];

    const rows = sorted.map((s) => {
      const dx = applyChannelRule(s.x - refStep.x, 'x');
      const dy = applyChannelRule(s.y - refStep.y, 'y');
      const dz = applyChannelRule((s.z ?? 0) - (refStep.z ?? 0), 'z');
      const dist3d = Math.hypot(s.x - refStep.x, s.y - refStep.y, (s.z ?? 0) - (refStep.z ?? 0));
      const roll = applyChannelRule(
        (s.roll ?? s.rollDeg ?? 0) - (refStep.roll ?? refStep.rollDeg ?? 0),
        'roll'
      );
      const pitch = applyChannelRule(
        (s.pitch ?? s.elevationDeg ?? 0) - (refStep.pitch ?? refStep.elevationDeg ?? 0),
        'pitch'
      );
      const yaw = applyChannelRule(
        (s.yaw ?? s.azimuthDeg ?? 0) - (refStep.yaw ?? refStep.azimuthDeg ?? 0),
        'yaw'
      );
      const vx = applyChannelRule(s.vx ?? 0, 'vx');
      const vy = applyChannelRule(s.vy ?? 0, 'vy');
      const vz = applyChannelRule(s.vz ?? 0, 'vz');
      const ax = applyChannelRule(s.ax ?? 0, 'ax');
      const ay = applyChannelRule(s.ay ?? 0, 'ay');
      const az = applyChannelRule(s.az ?? 0, 'az');
      const omegaRoll = applyChannelRule(s.omegaRoll ?? 0, 'omegaRoll');
      const omegaPitch = applyChannelRule(s.omegaPitch ?? 0, 'omegaPitch');
      const omegaYaw = applyChannelRule(s.omegaYaw ?? 0, 'omegaYaw');
      const relTime = s.time - refStep.time;
      const rmsPx = s.triangulationResidual ?? s.residual ?? 0;

      return [
        s.frame.toString(),
        formatStepTime(s.time),
        relTime.toFixed(6),
        dx.toFixed(5),
        dy.toFixed(5),
        dz.toFixed(5),
        dist3d.toFixed(5),
        roll.toFixed(3),
        pitch.toFixed(3),
        yaw.toFixed(3),
        vx.toFixed(4),
        vy.toFixed(4),
        vz.toFixed(4),
        (s.v ?? 0).toFixed(4),
        ax.toFixed(4),
        ay.toFixed(4),
        az.toFixed(4),
        (s.a ?? 0).toFixed(4),
        omegaRoll.toFixed(3),
        omegaPitch.toFixed(3),
        omegaYaw.toFixed(3),
        (s.machNumber ?? 0).toFixed(4),
        (s.gForce ?? 0).toFixed(3),
        (s.markerCountA ?? '').toString(),
        (s.markerCountL ?? '').toString(),
        (s.markerCountM ?? '').toString(),
        rmsPx ? rmsPx.toFixed(4) : '0.0000',
        (s.sigmaX ?? 0).toFixed(5),
        (s.sigmaY ?? 0).toFixed(5),
        (s.sigmaZ ?? 0).toFixed(5),
        (s.sigmaRoll ?? 0).toFixed(4),
        (s.sigmaPitch ?? 0).toFixed(4),
        (s.sigmaYaw ?? 0).toFixed(4),
      ];
    });

    return [...metadataHeaderLines, headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  }

  // Standard Kinematics CSV with metadata header
  const hasZ = sorted.some((s) => s.z !== undefined);
  const headers = hasZ
    ? [
        'Frame',
        `time_${effectiveUnit}`,
        'time_seconds',
        'x_m',
        'y_m',
        'z_m',
        'u1_px',
        'v1_px',
        'u2_px',
        'v2_px',
        'reproj_residual_px',
        'reconstruction_error_3d_m',
        'vx_mps',
        'vy_mps',
        'vz_mps',
        'v_mps',
        'ax_mps2',
        'ay_mps2',
        'az_mps2',
        'a_mps2',
        'KE_J',
        'PE_J',
      ]
    : [
        'Frame',
        `time_${effectiveUnit}`,
        'time_seconds',
        'x_m',
        'y_m',
        'vx_mps',
        'vy_mps',
        'v_mps',
        'ax_mps2',
        'ay_mps2',
        'a_mps2',
        'KE_J',
        'PE_J',
      ];

  const rows = sorted.map((s) => {
    const base = [
      s.frame.toString(),
      formatStepTime(s.time),
      s.time.toExponential(6),
      s.x.toFixed(5),
      s.y.toFixed(5),
    ];
    if (hasZ) {
      base.push((s.z ?? 0).toFixed(5));
      base.push(
        s.cam1?.px != null ? s.cam1.px.toString() : s.cam1Px != null ? s.cam1Px.toString() : '',
        s.cam1?.py != null ? s.cam1.py.toString() : s.cam1Py != null ? s.cam1Py.toString() : '',
        s.cam2?.px != null ? s.cam2.px.toString() : s.cam2Px != null ? s.cam2Px.toString() : '',
        s.cam2?.py != null ? s.cam2.py.toString() : s.cam2Py != null ? s.cam2Py.toString() : '',
        s.triangulationResidual != null
          ? s.triangulationResidual.toFixed(3)
          : s.residual != null
          ? s.residual.toFixed(3)
          : '',
        s.reconstructionError3D != null ? s.reconstructionError3D.toFixed(5) : ''
      );
    }
    base.push(s.vx?.toFixed(5) ?? '', s.vy?.toFixed(5) ?? '');
    if (hasZ) {
      base.push(s.vz?.toFixed(5) ?? '');
    }
    base.push(s.v?.toFixed(5) ?? '', s.ax?.toFixed(5) ?? '', s.ay?.toFixed(5) ?? '');
    if (hasZ) {
      base.push(s.az?.toFixed(5) ?? '');
    }
    base.push(
      s.a?.toFixed(5) ?? '',
      s.kineticEnergy?.toFixed(5) ?? '',
      s.potentialEnergy?.toFixed(5) ?? ''
    );
    return base;
  });

  return [...metadataHeaderLines, headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

export const buildDefenseTelemetryCSV = buildCertifiedDefenseTelemetryCSV;

export const TableView: React.FC<TableViewProps> = ({
  tracks,
  activeTrackId,
  currentFrame,
  clip,
  analysisMode = '2D',
  graphConfig,
  onSelectFrame,
  onDeletePoint,
}) => {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState<'standard' | 'defense'>('defense'); // Default to defense for high-speed & ballistics
  const [tableTimeUnit, setTableTimeUnit] = useState<'auto' | 's' | 'ms' | 'us' | 'ns'>(clip?.timeUnit || 'auto');

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const steps = React.useMemo(() => {
    const raw = activeTrack ? activeTrack.steps : [];
    if (raw.length === 0) return [];
    return conditionStepsForGraphing(
      raw,
      graphConfig?.filterConfig ?? { type: 'raw', windowSize: 7, polyOrder: 2, cutoffHz: 45 },
      graphConfig?.referenceFrameMode ?? 'M_wrt_L',
      graphConfig?.activeVirtualPointId
    );
  }, [activeTrack, graphConfig?.filterConfig, graphConfig?.referenceFrameMode, graphConfig?.activeVirtualPointId]);
  const fps = clip?.fps || 30;

  // Determine active display unit
  const effectiveUnit =
    tableTimeUnit === 'auto'
      ? fps >= 100000
        ? 'us'
        : fps >= 1000
        ? 'ms'
        : 's'
      : tableTimeUnit;

  const timeHeader = effectiveUnit === 'us' ? 't (µs)' : effectiveUnit === 'ms' ? 't (ms)' : 't (s)';

  const formatStepTime = (tSec: number): string => {
    if (effectiveUnit === 'us') {
      return (tSec * 1e6).toFixed(2);
    } else if (effectiveUnit === 'ms') {
      return (tSec * 1000).toFixed(3);
    } else {
      return tSec < 0.001 ? tSec.toExponential(4) : tSec.toFixed(5);
    }
  };

  const copyToClipboard = () => {
    if (!activeTrack || steps.length === 0) return;
    const csvStr = buildCertifiedDefenseTelemetryCSV(
      activeTrack,
      clip,
      analysisMode,
      graphConfig,
      viewMode,
      effectiveUnit
    );
    const tsv = csvStr.replace(/,/g, '\t');
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCSV = () => {
    if (!activeTrack || steps.length === 0) return;
    const csvStr = buildCertifiedDefenseTelemetryCSV(
      activeTrack,
      clip,
      analysisMode,
      graphConfig,
      viewMode,
      effectiveUnit
    );

    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${activeTrack?.name || 'tracker'}_${viewMode}_telemetry.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasZ = steps.some((s) => s.z !== undefined);

  return (
    <div id="table-view-container" className="flex flex-col h-full bg-white text-xs">
      {/* Table Toolbar */}
      <div className="bg-[#F1F3F5] border-b border-[#CBD5E1] px-2.5 py-1 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="font-bold text-[#1E293B] flex items-center gap-1">
            <Shield className="w-3.5 h-3.5 text-[#2563EB]" />
            <span>Telemetry Table</span>
          </span>

          {/* Mode Switcher */}
          <div className="flex items-center bg-white border border-[#CBD5E1] rounded-[3px] p-0.5">
            <button
              type="button"
              onClick={() => setViewMode('defense')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold text-[10px] transition-colors flex items-center gap-1 cursor-pointer ${
                viewMode === 'defense'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:bg-[#F1F3F5]'
              }`}
              title="TrackEye Defense & Flight Telemetry: Mach, G-Force, Slant Range, Azimuth, Elevation"
            >
              <span>Defense Telemetry</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('standard')}
              className={`px-2 py-0.5 rounded-[2px] font-semibold text-[10px] transition-colors cursor-pointer ${
                viewMode === 'standard'
                  ? 'bg-[#2563EB] text-white'
                  : 'text-[#334155] hover:bg-[#F1F3F5]'
              }`}
            >
              Kinematics
            </button>
          </div>

          {/* Time Unit Selector */}
          <div className="flex items-center gap-1 ml-1 bg-white border border-[#CBD5E1] rounded-[3px] px-1 py-0.5">
            <Clock className="w-3 h-3 text-[#64748B]" />
            {(['auto', 's', 'ms', 'us'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setTableTimeUnit(u)}
                className={`px-1.5 py-0.2 rounded-[2px] font-mono text-[9px] font-bold cursor-pointer ${
                  tableTimeUnit === u
                    ? 'bg-[#2563EB] text-white'
                    : 'text-[#334155] hover:bg-[#F1F3F5]'
                }`}
              >
                {u.toUpperCase()}
              </button>
            ))}
          </div>

          <span className="text-[11px] text-[#64748B] font-mono font-medium">
            ({steps.length} {steps.length === 1 ? 'row' : 'rows'})
          </span>

          {clip && clip.fps >= 1000 && (
            <span className="bg-[#2563EB] text-white px-1.5 py-0.5 rounded-[2px] text-[10px] font-mono font-semibold">
              {clip.cameraModel || 'HIGH-SPEED'}: {clip.fps.toLocaleString()} fps
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="table-copy-tsv-btn"
            type="button"
            onClick={copyToClipboard}
            disabled={steps.length === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 text-[#1E293B] border border-[#CBD5E1] transition-colors text-[11px] font-medium cursor-pointer"
            title="Copy TSV to clipboard for Excel / Google Sheets / MATLAB"
          >
            {copied ? (
              <Check className="w-3 h-3 text-[#2563EB]" />
            ) : (
              <Copy className="w-3 h-3 text-[#334155]" />
            )}
            <span>{copied ? 'Copied' : 'Copy TSV'}</span>
          </button>

          <button
            id="table-download-csv-btn"
            type="button"
            onClick={exportCSV}
            disabled={steps.length === 0}
            className="flex items-center gap-1 px-2 py-0.5 rounded-[3px] bg-white hover:bg-[#E2E8F0] disabled:opacity-40 text-[#1E293B] border border-[#CBD5E1] transition-colors text-[11px] font-medium cursor-pointer"
            title="Export CSV telemetry file"
          >
            <Download className="w-3 h-3 text-[#334155]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Table Content with Fixed Header & Alternating Zebra Striping */}
      <div className="flex-1 overflow-auto bg-white">
        {steps.length > 0 ? (
          <table className="w-full text-left font-mono border-collapse text-[11px]">
            <thead className="bg-[#E2E8F0] sticky top-0 z-10 border-b border-[#CBD5E1] text-[#1E293B] font-bold select-none whitespace-nowrap">
              {viewMode === 'defense' ? (
                <tr>
                  <th className="py-1.5 px-2 text-center w-10 border-r border-[#CBD5E1]">F#</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1] bg-[#EFF6FF] text-[#1D4ED8]">
                    {timeHeader}
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">x (m)</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">y (m)</th>
                  {hasZ && <th className="py-1.5 px-2 border-r border-[#CBD5E1]">z (m)</th>}
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">Slant R (m)</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">Azimuth (°)</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">Elevation (°)</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1] bg-amber-50 text-[#B45309]">
                    Speed (m/s)
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1] bg-amber-50 text-[#B45309]">
                    Mach
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1] bg-red-50 text-[#B91C1C]">
                    G-Force (g)
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">a (m/s²)</th>
                  <th className="py-1.5 px-2 text-center w-8">Del</th>
                </tr>
              ) : (
                <tr>
                  <th className="py-1.5 px-2 text-center w-10 border-r border-[#CBD5E1]">F#</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1] bg-[#EFF6FF] text-[#1D4ED8]">
                    {timeHeader}
                  </th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">x (m)</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">y (m)</th>
                  {hasZ && <th className="py-1.5 px-2 border-r border-[#CBD5E1]">z (m)</th>}
                  {hasZ && (
                    <th
                      className="py-1.5 px-2 border-r border-[#CBD5E1] bg-[#F8FAFC] text-[#334155]"
                      title="2D Reprojection residual in pixels. 3D reconstruction error available when independent ground truth is supplied."
                    >
                      Reproj (px)
                    </th>
                  )}
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">vx</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">vy</th>
                  {hasZ && <th className="py-1.5 px-2 border-r border-[#CBD5E1]">vz</th>}
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">v (m/s)</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">ax</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">ay</th>
                  <th className="py-1.5 px-2 border-r border-[#CBD5E1]">a (m/s²)</th>
                  <th className="py-1.5 px-2 text-center w-8">Del</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-[#E2E8F0] whitespace-nowrap">
              {steps.map((s, idx) => {
                const isActive = s.frame === currentFrame;
                const slantR = s.slantRange ?? Math.hypot(s.x, s.y, s.z ?? 0);
                const coordConv = graphConfig?.coordConvention ?? 'ENU_Z_UP';
                const applyCellRule = (val: number | null | undefined, variable: string): number | null => {
                  if (val === null || val === undefined || !Number.isFinite(val)) return null;
                  const sign = getChannelPolaritySign(
                    variable,
                    coordConv,
                    graphConfig?.invertChannels,
                    graphConfig?.channelSignConfig
                  );
                  const signed = val * sign;
                  const norm = Object.is(signed, -0) ? 0 : signed;
                  return isChannelRectifiedPositive(variable, graphConfig?.channelSignConfig)
                    ? Math.abs(norm)
                    : norm;
                };
                const xDisp = applyCellRule(s.x, 'x') ?? 0;
                const yDisp = applyCellRule(s.y, 'y') ?? 0;
                const zDisp = applyCellRule(s.z ?? 0, 'z') ?? 0;
                const azimDisp = applyCellRule(s.yaw ?? s.azimuthDeg ?? 0, 'yaw') ?? 0;
                const elevDisp = applyCellRule(s.pitch ?? s.elevationDeg ?? 0, 'pitch') ?? 0;
                const vxDisp = applyCellRule(s.vx, 'vx');
                const vyDisp = applyCellRule(s.vy, 'vy');
                const vzDisp = applyCellRule(s.vz, 'vz');
                const axDisp = applyCellRule(s.ax, 'ax');
                const ayDisp = applyCellRule(s.ay, 'ay');
                return (
                  <tr
                    key={s.frame}
                    onClick={() => onSelectFrame(s.frame)}
                    className={`cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#2563EB] text-white font-bold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#F1F3F5] text-[#1E293B]'
                        : 'bg-[#F8FAFC] hover:bg-[#F1F3F5] text-[#1E293B]'
                    }`}
                  >
                    <td
                      className={`py-1 px-2 text-center border-r border-[#E2E8F0] font-semibold ${
                        isActive ? 'text-white' : 'text-[#64748B]'
                      }`}
                    >
                      <span>{s.frame}</span>
                      {s.isInterpolatedCam2 && (
                        <span
                          className={`ml-1 text-[9px] font-bold ${isActive ? 'text-amber-300' : 'text-amber-600'}`}
                          title={`Camera 2 temporally interpolated (Sub-frame Spline matching, Δt=${((s.temporalDeltaSeconds || 0) * 1e6).toFixed(1)} µs)`}
                        >
                          ~
                        </span>
                      )}
                    </td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-semibold">
                      {formatStepTime(s.time)}
                    </td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-medium">
                      {xDisp.toFixed(4)}
                    </td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-medium">
                      {yDisp.toFixed(4)}
                    </td>
                    {viewMode === 'defense' ? (
                      <>
                        {hasZ && (
                          <td
                            className="py-1 px-2 border-r border-[#cccccc] font-medium"
                            title={s.isInterpolatedCam2 ? 'Triangulated using sub-frame spline-interpolated Camera 2 ray' : undefined}
                          >
                            {zDisp.toFixed(4)}
                            {s.isInterpolatedCam2 && (
                              <span className={`text-[9px] font-bold ml-0.5 ${isActive ? 'text-amber-300' : 'text-amber-600'}`}>
                                *
                              </span>
                            )}
                          </td>
                        )}
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold">
                          {slantR.toFixed(4)}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {azimDisp.toFixed(2)}°
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {elevDisp.toFixed(2)}°
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold text-amber-700">
                          {s.v !== null && s.v !== undefined ? s.v.toFixed(2) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold text-blue-700">
                          {s.machNumber !== null && s.machNumber !== undefined
                            ? `M ${s.machNumber.toFixed(3)}`
                            : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold text-red-700">
                          {s.gForce !== null && s.gForce !== undefined
                            ? `${s.gForce >= 1000 ? s.gForce.toExponential(2) : s.gForce.toFixed(1)} g`
                            : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {s.a !== null && s.a !== undefined
                            ? s.a >= 10000
                              ? s.a.toExponential(3)
                              : s.a.toFixed(2)
                            : '—'}
                        </td>
                      </>
                    ) : (
                      <>
                        {hasZ && (
                          <td className="py-1 px-2 border-r border-[#cccccc] font-medium">
                            {zDisp.toFixed(4)}
                          </td>
                        )}
                        {hasZ && (
                          <td
                            className="py-1 px-2 border-r border-[#cccccc] font-mono text-[#065f46]"
                            title="2D Reprojection residual in pixels. 3D reconstruction error available when independent ground truth is supplied."
                          >
                            {s.triangulationResidual != null
                              ? s.triangulationResidual.toFixed(2)
                              : s.residual != null
                              ? s.residual.toFixed(2)
                              : '—'}
                          </td>
                        )}
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {vxDisp !== null ? vxDisp.toFixed(3) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {vyDisp !== null ? vyDisp.toFixed(3) : '—'}
                        </td>
                        {hasZ && (
                          <td className="py-1 px-2 border-r border-[#cccccc]">
                            {vzDisp !== null ? vzDisp.toFixed(3) : '—'}
                          </td>
                        )}
                        <td className="py-1 px-2 border-r border-[#cccccc] font-bold">
                          {s.v !== null && s.v !== undefined ? s.v.toFixed(3) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {axDisp !== null ? axDisp.toFixed(2) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc]">
                          {ayDisp !== null ? ayDisp.toFixed(2) : '—'}
                        </td>
                        <td className="py-1 px-2 border-r border-[#cccccc] font-semibold">
                          {s.a !== null && s.a !== undefined ? s.a.toFixed(2) : '—'}
                        </td>
                      </>
                    )}
                    <td className="py-1 px-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePoint(s.frame);
                        }}
                        className={`p-0.5 rounded transition-colors ${
                          isActive
                            ? 'text-white hover:text-red-300'
                            : 'text-[#666666] hover:text-[#8b0000]'
                        }`}
                        title="Delete step point"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[#555555] text-xs p-4">
            <p className="font-semibold text-black">No data recorded for this track.</p>
            <p className="text-[11px] text-[#555555] mt-1">
              Click on video frames or press Shift+Click to record position steps.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
