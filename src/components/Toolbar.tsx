import React from 'react';
import { Track, Calibration, CoordinateAxes, GraphConfig } from '../types';
import {
  Scissors,
  Ruler,
  Compass,
  Grid,
  Eye,
  FastForward,
  Settings2,
  Trash2,
  Sliders,
  Undo2,
  Redo2,
  Crosshair,
} from 'lucide-react';

export type ViewLayout =
  | 'split'
  | 'video-plot'
  | 'video-table'
  | 'video-only'
  | 'split-3d'
  | 'trajectory-3d';

interface ToolbarProps {
  tracks: Track[];
  activeTrackId: string;
  onSelectTrack: (trackId: string) => void;
  onOpenTrackManager: () => void;
  onClearTrackPoints: () => void;
  onUndoLastPoint?: () => void;
  onRedoLastPoint?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoCount?: number;
  redoCount?: number;
  requireShiftToMark?: boolean;
  onToggleRequireShiftToMark?: () => void;
  calibration: Calibration;
  onToggleCalibration: () => void;
  onOpenCalibrationModal: () => void;
  axes: CoordinateAxes;
  onToggleAxes: () => void;
  onAxesAngleChange: (angle: number) => void;
  onToggleGrid: () => void;
  showTrails: boolean;
  onToggleTrails: () => void;
  showVectors: boolean;
  onToggleVectors: () => void;
  showLoupe: boolean;
  onToggleLoupe: () => void;
  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  layout: ViewLayout;
  onLayoutChange: (layout: ViewLayout) => void;
  onOpenClipSettings: () => void;
  analysisMode?: '2D' | '3D' | '6DOF';
  onChangeAnalysisMode?: (mode: '2D' | '3D' | '6DOF') => void;
  onOpenTriangulationModal?: () => void;
  onOpenMonocular6DoFModal?: () => void;
  triangulationCalibrated?: boolean;
  onOpenShortcuts?: () => void;
  graphConfig?: GraphConfig;
  onUpdateGraphConfig?: (updates: Partial<GraphConfig>) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  tracks,
  activeTrackId,
  onSelectTrack,
  onOpenTrackManager,
  onClearTrackPoints,
  onUndoLastPoint,
  onRedoLastPoint,
  canUndo,
  canRedo = false,
  undoCount = 0,
  redoCount = 0,
  requireShiftToMark = true,
  onToggleRequireShiftToMark,
  calibration,
  onToggleCalibration,
  onOpenCalibrationModal,
  axes,
  onToggleAxes,
  onAxesAngleChange,
  onToggleGrid,
  showTrails,
  onToggleTrails,
  showVectors,
  onToggleVectors,
  showLoupe,
  onToggleLoupe,
  autoAdvance,
  onToggleAutoAdvance,
  layout,
  onLayoutChange,
  onOpenClipSettings,
  analysisMode = '2D',
  onChangeAnalysisMode,
  onOpenTriangulationModal,
  onOpenMonocular6DoFModal,
  graphConfig,
  onUpdateGraphConfig,
}) => {
  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const refFrameMode = graphConfig?.referenceFrameMode || 'M_wrt_L';
  const coordConv = graphConfig?.coordConvention || 'NED_Z_DOWN';

  return (
    <div
      id="tracker-toolbar"
      className="h-[34px] bg-[#F1F3F5] border-b border-[#DEE2E6] px-2.5 flex items-center justify-between gap-2 text-[11.5px] text-[#1E293B] select-none z-20 shrink-0 overflow-x-auto"
    >
      {/* ======================== LEFT GROUP: MODE SWITCHER ======================== */}
      <div className="flex items-center bg-[#E2E8F0] p-0.5 rounded-[3px] border border-[#CBD5E1] shrink-0 h-[26px]">
        <button
          id="btn-mode-2d"
          type="button"
          onClick={() => onChangeAnalysisMode?.('2D')}
          className={`px-2.5 h-[22px] rounded-[2px] font-semibold text-[11px] transition-colors whitespace-nowrap ${
            analysisMode === '2D'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Mode 1: 2D Single-Camera Planar Kinematics"
        >
          2D Planar
        </button>
        <button
          id="btn-mode-monocular-6dof"
          type="button"
          onClick={() => {
            onChangeAnalysisMode?.('6DOF');
            onOpenMonocular6DoFModal?.();
          }}
          className={`px-2.5 h-[22px] rounded-[2px] font-semibold text-[11px] transition-colors whitespace-nowrap ${
            analysisMode === '6DOF'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Mode 2: Monocular 6-DOF Store Separation Photogrammetry (Leica ACS Survey + Multi-Body PnP)"
        >
          Monocular 6-DOF
        </button>
        <button
          id="btn-mode-3d-stereo"
          type="button"
          onClick={() => onChangeAnalysisMode?.('3D')}
          className={`px-2.5 h-[22px] rounded-[2px] font-semibold text-[11px] transition-colors whitespace-nowrap ${
            analysisMode === '3D'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Mode 3: 3D Stereo Dual-Camera Optical Triangulation (DLT & Multi-Rate Sync)"
        >
          3D Stereo
        </button>
      </div>

      {/* ======================== CENTER GROUP: CONTEXTUAL WORKFLOW TOOLS (1. Calibrate -> 2. Track -> 3. Solve) ======================== */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* STEP 1: CALIBRATE */}
        <div
          className="flex items-center gap-1"
          title="Step 1: Calibrate coordinate axes origin/tilt and physical scale (or 3D Stereo DLT)"
        >
          <span className="text-[10px] font-mono font-semibold text-[#64748B] px-1 whitespace-nowrap">
            1. Calibrate
          </span>

          <button
            id="btn-toggle-axes"
            type="button"
            onClick={onToggleAxes}
            className={`flex items-center gap-1 px-2 h-[26px] rounded-[3px] font-medium border transition-colors whitespace-nowrap ${
              axes.visible
                ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F8FAFC]'
            }`}
            title="Step 1: Toggle Coordinate Axes Origin & Rotation Handle (Shortcut: A)"
          >
            <Compass className="w-3.5 h-3.5" />
            <span>Axes</span>
          </button>

          {axes.visible && (
            <div className="flex items-center bg-white border border-[#CBD5E1] rounded-[3px] px-1.5 h-[26px]">
              <span className="text-[10px] text-[#64748B] font-mono mr-0.5">θ:</span>
              <input
                id="axes-angle-quick-input"
                type="number"
                value={axes.angle}
                onChange={(e) => onAxesAngleChange(parseFloat(e.target.value) || 0)}
                className="w-9 bg-transparent text-[11px] text-[#1E293B] font-semibold focus:outline-none font-mono tabular-nums"
                step="1"
                title="Axes Rotation Angle (degrees)"
              />
              <span className="text-[10px] text-[#64748B] font-mono">°</span>
            </div>
          )}

          <button
            id="btn-toggle-grid"
            type="button"
            onClick={onToggleGrid}
            className={`px-1.5 h-[26px] rounded-[3px] border transition-colors ${
              axes.gridVisible
                ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F8FAFC]'
            }`}
            title="Toggle Cartesian Coordinate Grid Overlay"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>

          <button
            id={analysisMode === '3D' ? 'btn-toggle-3d-calibration-stick' : 'btn-toggle-calibration'}
            type="button"
            onClick={onToggleCalibration}
            className={`flex items-center gap-1 px-2 h-[26px] rounded-[3px] font-medium border transition-colors whitespace-nowrap ${
              calibration.visible
                ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F8FAFC]'
            }`}
            title="Step 1: Toggle Calibration Stick on video canvas to set physical scale (Shortcut: C)"
          >
            <Ruler className="w-3.5 h-3.5" />
            <span>
              Calib Stick ({calibration.realLength} {calibration.unit})
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenCalibrationModal}
            className="px-1.5 h-[26px] rounded-[3px] bg-white hover:bg-[#F8FAFC] text-[#1E293B] border border-[#CBD5E1] transition-colors"
            title="Configure Calibration Stick Length and Units"
          >
            <Sliders className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-[#CBD5E1] mx-0.5" />

        {/* STEP 2: TRACK */}
        <div
          className="flex items-center gap-1"
          title="Step 2: Select point mass track and digitize target positions across frames"
        >
          <span className="text-[10px] font-mono font-semibold text-[#64748B] px-1 whitespace-nowrap">
            2. Track
          </span>

          <div className="flex items-center gap-1 bg-white border border-[#CBD5E1] rounded-[3px] px-2 h-[26px]">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: activeTrack?.color || '#2563EB' }}
            />
            <select
              id="active-track-select"
              value={activeTrackId}
              onChange={(e) => onSelectTrack(e.target.value)}
              className="bg-transparent text-[#1E293B] font-semibold focus:outline-none cursor-pointer text-[11.5px] max-w-[130px] truncate"
              title="Select Active Point Mass Track"
            >
              {tracks.map((t) => (
                <option key={t.id} value={t.id} className="bg-white text-[#1E293B]">
                  {t.name} ({t.steps.length})
                </option>
              ))}
            </select>
            <button
              id="btn-track-manager"
              type="button"
              onClick={onOpenTrackManager}
              className="p-0.5 rounded-[2px] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] transition-colors"
              title="Track Manager (create new point mass, mass value, color)"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-undo-point"
              type="button"
              onClick={onUndoLastPoint}
              disabled={canUndo !== undefined ? !canUndo : (!activeTrack || activeTrack.steps.length === 0)}
              className="p-0.5 rounded-[2px] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
              title={`Undo (Ctrl+Z)${undoCount > 0 ? ` • ${undoCount} action(s)` : ''}`}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-redo-point"
              type="button"
              onClick={onRedoLastPoint}
              disabled={!canRedo}
              className="p-0.5 rounded-[2px] text-[#475569] hover:text-[#0F172A] hover:bg-[#F1F5F9] disabled:opacity-30 transition-colors cursor-pointer disabled:cursor-not-allowed"
              title={`Redo (Ctrl+Y / Ctrl+Shift+Z)${redoCount > 0 ? ` • ${redoCount} action(s)` : ''}`}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
            <button
              id="btn-clear-track-points"
              type="button"
              onClick={onClearTrackPoints}
              disabled={!activeTrack || activeTrack.steps.length === 0}
              className="p-0.5 rounded-[2px] text-[#475569] hover:text-[#DC2626] hover:bg-[#FEF2F2] disabled:opacity-30 transition-colors"
              title="Clear all points on active track"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            id="btn-toggle-shift-mark"
            type="button"
            onClick={onToggleRequireShiftToMark}
            className={`flex items-center gap-1 px-2 h-[26px] rounded-[3px] font-medium border transition-colors whitespace-nowrap ${
              requireShiftToMark
                ? 'bg-[#2563EB] text-white border-[#1D4ED8]'
                : 'bg-white text-[#1E293B] border-[#CBD5E1] hover:bg-[#F8FAFC]'
            }`}
            title={
              requireShiftToMark
                ? 'Step 2: Hold Shift + Click on video to digitize point (prevents accidental clicks). Click to switch to Direct Click.'
                : 'Direct Click Mode: Single click marks point. Click to enable Shift+Click safety.'
            }
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>{requireShiftToMark ? 'Shift+Click Mark' : 'Click Mark'}</span>
          </button>

          <button
            id="btn-video-cuts"
            type="button"
            onClick={onOpenClipSettings}
            className="flex items-center gap-1 px-2 h-[26px] rounded-[3px] bg-white hover:bg-[#F8FAFC] text-[#1E293B] border border-[#CBD5E1] font-medium transition-colors whitespace-nowrap"
            title="Clip Cuts: Start/End Frame, Step Size, Frame Rate (fps)"
          >
            <Scissors className="w-3.5 h-3.5 text-[#475569]" />
            <span className="hidden xl:inline">Clip</span>
          </button>
        </div>

        <div className="w-[1px] h-4 bg-[#CBD5E1] mx-0.5" />

        {/* STEP 3: SOLVE & INSPECT */}
        <div
          className="flex items-center gap-1"
          title="Step 3: Solve 6-DOF / 3D Stereo Photogrammetry and inspect kinematic telemetry"
        >
          <span className="text-[10px] font-mono font-semibold text-[#64748B] px-1 whitespace-nowrap">
            3. Solve
          </span>

          {analysisMode === '3D' ? (
            <>
              <button
                id="btn-3d-triangulation"
                type="button"
                onClick={onOpenTriangulationModal}
                className="flex items-center gap-1 px-2.5 h-[26px] rounded-[3px] font-semibold bg-[#2563EB] hover:bg-[#1D4ED8] text-white border border-[#1E40AF] transition-colors whitespace-nowrap"
                title="Step 3: Configure 3D Stereo DLT Triangulation & Empirical Calibration"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>3D Calibration</span>
              </button>
              <button
                type="button"
                onClick={onOpenTriangulationModal}
                className="flex items-center gap-1 px-2 h-[26px] rounded-[3px] font-medium bg-white hover:bg-[#F8FAFC] text-[#1E293B] border border-[#CBD5E1] transition-colors whitespace-nowrap"
                title="Multi-Rate Camera Synchronization & Sub-Frame Spline Setup"
              >
                <span>Cam Sync</span>
              </button>
              {onOpenMonocular6DoFModal && (
                <button
                  id="btn-open-stereo-6dof"
                  type="button"
                  onClick={onOpenMonocular6DoFModal}
                  className="flex items-center gap-1 px-2 h-[26px] rounded-[3px] font-medium bg-white hover:bg-[#F8FAFC] text-[#1E293B] border border-[#CBD5E1] transition-colors whitespace-nowrap"
                  title="Open Rigid-Body 6-DOF Kabsch / PnP Store Separation Solver"
                >
                  <Compass className="w-3.5 h-3.5 text-[#2563EB]" />
                  <span>6-DOF Solver</span>
                </button>
              )}
            </>
          ) : (
            <>
              {onOpenMonocular6DoFModal && (
                <button
                  id="btn-open-monocular-6dof"
                  type="button"
                  onClick={onOpenMonocular6DoFModal}
                  className={`flex items-center gap-1.5 px-2.5 h-[26px] rounded-[3px] font-semibold border transition-colors whitespace-nowrap ${
                    analysisMode === '6DOF'
                      ? 'bg-[#2563EB] hover:bg-[#1D4ED8] text-white border-[#1E40AF]'
                      : 'bg-white hover:bg-[#F8FAFC] text-[#1E293B] border-[#CBD5E1]'
                  }`}
                  title="Step 3: Open Monocular 6-DOF Store Separation & Leica ACS Survey PnP Solver (A1-A6, L7-L14, M15-M29)"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>6-DOF PnP Solver</span>
                </button>
              )}

              {analysisMode === '6DOF' && (
                <button
                  type="button"
                  onClick={() => {
                    const nextFrame =
                      refFrameMode === 'M_wrt_L'
                        ? 'M_wrt_A'
                        : refFrameMode === 'M_wrt_A'
                        ? 'L_wrt_A'
                        : 'M_wrt_L';
                    onUpdateGraphConfig?.({ referenceFrameMode: nextFrame });
                  }}
                  className="px-2 h-[26px] rounded-[3px] bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] font-mono text-[10.5px] text-[#1E293B] flex items-center gap-1 whitespace-nowrap"
                  title="Active 6-DOF Reference Frame & Convention (Click to cycle M wrt L / M wrt A / L wrt A)"
                >
                  <span className="text-[#64748B]">Frame:</span>
                  <strong className="text-[#2563EB]">{refFrameMode.replace(/_/g, ' ')}</strong>
                  <span className="text-[#94A3B8]">·</span>
                  <span>{coordConv === 'NED_Z_DOWN' ? 'NED' : 'ENU'}</span>
                </button>
              )}
            </>
          )}

          {/* Compact Overlays & Auto-Step Group */}
          <div className="hidden 2xl:flex items-center bg-white rounded-[3px] p-0.5 border border-[#CBD5E1] h-[26px]">
            <button
              id="btn-toggle-trails"
              type="button"
              onClick={onToggleTrails}
              className={`px-1.5 h-[20px] rounded-[2px] text-[10.5px] font-medium transition-colors ${
                showTrails ? 'bg-[#2563EB] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]'
              }`}
              title="Toggle Trajectory Trails (T)"
            >
              Trails
            </button>
            <button
              id="btn-toggle-vectors"
              type="button"
              onClick={onToggleVectors}
              className={`px-1.5 h-[20px] rounded-[2px] text-[10.5px] font-medium transition-colors ${
                showVectors ? 'bg-[#2563EB] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]'
              }`}
              title="Toggle Velocity Vectors (V)"
            >
              Vec
            </button>
            <button
              id="btn-toggle-loupe"
              type="button"
              onClick={onToggleLoupe}
              className={`px-1.5 h-[20px] rounded-[2px] text-[10.5px] font-medium transition-colors flex items-center gap-0.5 ${
                showLoupe ? 'bg-[#2563EB] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]'
              }`}
              title="Toggle Sub-Pixel Magnifier Loupe (M)"
            >
              <Eye className="w-3 h-3" />
              <span>Loupe</span>
            </button>
            <button
              id="btn-toggle-auto-advance"
              type="button"
              onClick={onToggleAutoAdvance}
              className={`px-1.5 h-[20px] rounded-[2px] text-[10.5px] font-medium transition-colors flex items-center gap-0.5 ${
                autoAdvance ? 'bg-[#2563EB] text-white' : 'text-[#475569] hover:bg-[#F1F5F9]'
              }`}
              title="Auto-Advance Frame on Mark"
            >
              <FastForward className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ======================== RIGHT GROUP: LAYOUT FOCUS SEGMENTED BAR ======================== */}
      <div className="flex items-center rounded-[3px] bg-[#E2E8F0] border border-[#CBD5E1] p-0.5 h-[26px] shrink-0">
        <button
          id="btn-preset-video-focus"
          type="button"
          onClick={() => onLayoutChange('video-only')}
          className={`px-2 h-[22px] rounded-[2px] text-[11px] font-semibold transition-colors whitespace-nowrap ${
            layout === 'video-only'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Video Tracking Focus (Key: 1)"
        >
          Video
        </button>
        <button
          id="btn-preset-graph-focus"
          type="button"
          onClick={() => onLayoutChange('video-plot')}
          className={`px-2 h-[22px] rounded-[2px] text-[11px] font-semibold transition-colors whitespace-nowrap ${
            layout === 'video-plot'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Graph & Telemetry Focus: 24% Video Reference + 76% Expanded Dual-Panel Graph (Key: 2)"
        >
          Graph
        </button>
        <button
          id="btn-preset-balanced-split"
          type="button"
          onClick={() => onLayoutChange('split')}
          className={`px-2 h-[22px] rounded-[2px] text-[11px] font-semibold transition-colors whitespace-nowrap ${
            layout === 'split'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Balanced 50/50 Split Workspace (Key: 3)"
        >
          Split
        </button>
        <button
          id="btn-preset-quad-grid"
          type="button"
          onClick={() => onLayoutChange('split-3d')}
          className={`px-2 h-[22px] rounded-[2px] text-[11px] font-semibold transition-colors whitespace-nowrap ${
            layout === 'split-3d'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Quad Telemetry Grid: Video + 3D Spatial Viewport + Graph + Table (Key: 4)"
        >
          Quad
        </button>
        <button
          id="btn-preset-3d-orbit"
          type="button"
          onClick={() => onLayoutChange('trajectory-3d')}
          className={`px-2 h-[22px] rounded-[2px] text-[11px] font-semibold transition-colors whitespace-nowrap ${
            layout === 'trajectory-3d'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="3D Spatial Trajectory Orbit + Telemetry Split"
        >
          3D
        </button>
        <button
          id="btn-preset-table-focus"
          type="button"
          onClick={() => onLayoutChange('video-table')}
          className={`px-2 h-[22px] rounded-[2px] text-[11px] font-semibold transition-colors whitespace-nowrap ${
            layout === 'video-table'
              ? 'bg-[#2563EB] text-white shadow-2xs'
              : 'text-[#334155] hover:text-[#0F172A] hover:bg-white/60'
          }`}
          title="Video + Full-Height Data Table"
        >
          Table
        </button>
      </div>
    </div>
  );
};
