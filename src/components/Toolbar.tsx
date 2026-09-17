import React from 'react';
import { Track, Calibration, CoordinateAxes } from '../types';
import {
  Scissors,
  Ruler,
  Compass,
  Grid,
  TrendingUp,
  Eye,
  FastForward,
  Settings2,
  Trash2,
  Sliders,
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
  analysisMode?: '2D' | '3D';
  onChangeAnalysisMode?: (mode: '2D' | '3D') => void;
  onOpenTriangulationModal?: () => void;
  triangulationCalibrated?: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  tracks,
  activeTrackId,
  onSelectTrack,
  onOpenTrackManager,
  onClearTrackPoints,
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
}) => {
  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];

  return (
    <div
      id="tracker-toolbar"
      className="bg-[#d4d0c8] border-b border-[#808080] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs select-none z-10"
    >
      {/* Left: Tracks, Tools & Calibration */}
      <div className="flex items-center flex-wrap gap-2">
        {/* Track Selector & Management */}
        <div className="flex items-center gap-1.5 bg-[#efefef] border border-[#808080] rounded-[3px] px-2 py-1">
          <span className="text-[#333333] font-semibold text-[11px]">Track:</span>
          <select
            id="active-track-select"
            value={activeTrackId}
            onChange={(e) => onSelectTrack(e.target.value)}
            className="bg-transparent text-black font-bold focus:outline-none cursor-pointer pr-1 text-xs"
          >
            {tracks.map((t) => (
              <option key={t.id} value={t.id} className="bg-white text-black">
                {t.name} ({t.steps.length} pts)
              </option>
            ))}
          </select>
          <div
            className="w-2.5 h-2.5 rounded-full border border-[#808080] ml-0.5"
            style={{ backgroundColor: activeTrack?.color || '#1e3a5f' }}
          />

          <button
            id="btn-track-manager"
            type="button"
            onClick={onOpenTrackManager}
            className="p-1 rounded-[2px] text-black hover:bg-[#dcdcdc] transition-colors ml-1"
            title="Track Manager (create mass point, center of mass, color, mass)"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>

          <button
            id="btn-clear-track-points"
            type="button"
            onClick={onClearTrackPoints}
            disabled={!activeTrack || activeTrack.steps.length === 0}
            className="p-1 rounded-[2px] text-[#444444] hover:text-black hover:bg-[#dcdcdc] disabled:opacity-30 disabled:hover:text-[#444444] disabled:hover:bg-transparent transition-colors"
            title="Clear all points on current track"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-[#808080] hidden sm:block" />

        {/* Video Cuts / Clip Settings */}
        <button
          id="btn-video-cuts"
          type="button"
          onClick={onOpenClipSettings}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors font-semibold"
          title="Clip Settings: Start/End Frame, Step Size, Frame Rate"
        >
          <Scissors className="w-3.5 h-3.5 text-black" />
          <span>Clip Cuts</span>
        </button>

        <div className="w-[1px] h-4 bg-[#808080] hidden sm:block" />

        {/* Coordinate Axes */}
        <div className="flex items-center gap-1">
          <button
            id="btn-toggle-axes"
            type="button"
            onClick={onToggleAxes}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] font-semibold border transition-colors ${
              axes.visible
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-[#efefef] text-black border-[#808080] hover:bg-[#dcdcdc]'
            }`}
            title="Toggle Coordinate Axes (drag origin or tilt arrow)"
          >
            <Compass className={`w-3.5 h-3.5 ${axes.visible ? 'text-white' : 'text-black'}`} />
            <span>Axes</span>
          </button>

          {axes.visible && (
            <div className="flex items-center bg-white border border-[#808080] rounded-[3px] px-2 py-0.5">
              <span className="text-[11px] text-[#333333] font-bold mr-1">θ:</span>
              <input
                id="axes-angle-quick-input"
                type="number"
                value={axes.angle}
                onChange={(e) => onAxesAngleChange(parseFloat(e.target.value) || 0)}
                className="w-10 bg-transparent text-xs text-black font-bold focus:outline-none font-mono"
                step="1"
                title="Axes Rotation Angle (degrees)"
              />
              <span className="text-[11px] text-[#333333] font-bold">°</span>
            </div>
          )}

          <button
            id="btn-toggle-grid"
            type="button"
            onClick={onToggleGrid}
            className={`p-1.5 rounded-[3px] border transition-colors ${
              axes.gridVisible
                ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                : 'bg-[#efefef] text-black border-[#808080] hover:bg-[#dcdcdc]'
            }`}
            title="Toggle Cartesian Grid Lines"
          >
            <Grid className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="w-[1px] h-4 bg-[#808080] hidden sm:block" />

        {/* Calibration Stick / 3D Triangulation */}
        {analysisMode === '2D' ? (
          <div className="flex items-center gap-1">
            <button
              id="btn-toggle-calibration"
              type="button"
              onClick={onToggleCalibration}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] font-semibold border transition-colors ${
                calibration.visible
                  ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
                  : 'bg-[#efefef] text-black border-[#808080] hover:bg-[#dcdcdc]'
              }`}
              title="Toggle Calibration Stick (drag blue circle ends on video)"
            >
              <Ruler className={`w-3.5 h-3.5 ${calibration.visible ? 'text-white' : 'text-black'}`} />
              <span>Calib: {calibration.realLength} {calibration.unit}</span>
            </button>
            <button
              type="button"
              onClick={onOpenCalibrationModal}
              className="p-1.5 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors"
              title="Configure Calibration Stick Length and Units"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            id="btn-3d-triangulation"
            type="button"
            onClick={onOpenTriangulationModal}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] font-semibold bg-[#efefef] text-black border border-[#808080] hover:bg-[#dcdcdc] transition-colors"
            title="Configure 3D Camera Triangulation"
          >
            <Sliders className="w-3.5 h-3.5 text-black" />
            <span>3D Calibration</span>
          </button>
        )}

        <div className="w-[1px] h-4 bg-[#808080] hidden sm:block" />

        {/* Overlay Toggles: Trails, Vectors, Loupe */}
        <div className="flex items-center bg-[#efefef] rounded-[3px] p-0.5 border border-[#808080]">
          <button
            id="btn-toggle-trails"
            type="button"
            onClick={onToggleTrails}
            className={`px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
              showTrails ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
            title="Show / Hide Trajectory Trails"
          >
            Trails
          </button>
          <button
            id="btn-toggle-vectors"
            type="button"
            onClick={onToggleVectors}
            className={`flex items-center gap-1 px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
              showVectors ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
            title="Show Velocity & Acceleration Vectors"
          >
            <TrendingUp className="w-3 h-3" />
            <span>Vectors</span>
          </button>
          <button
            id="btn-toggle-loupe"
            type="button"
            onClick={onToggleLoupe}
            className={`flex items-center gap-1 px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
              showLoupe ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
            title="Toggle Sub-pixel Magnifier Loupe"
          >
            <Eye className="w-3 h-3" />
            <span>Loupe</span>
          </button>
        </div>

        {/* Auto-Advance Frame Toggle */}
        <button
          id="btn-toggle-auto-advance"
          type="button"
          onClick={onToggleAutoAdvance}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] font-semibold border transition-colors ${
            autoAdvance
              ? 'bg-[#1e3a5f] text-white border-[#1e3a5f]'
              : 'bg-[#efefef] text-black border-[#808080] hover:bg-[#dcdcdc]'
          }`}
          title="Automatically advance to the next frame when a point is marked"
        >
          <FastForward className={`w-3.5 h-3.5 ${autoAdvance ? 'text-white' : 'text-black'}`} />
          <span>Auto-step</span>
        </button>
      </div>

      {/* Right: Mode Switcher & View Layouts */}
      <div className="flex items-center gap-2">
        {/* 2D vs 3D Stereo */}
        <div className="flex items-center bg-[#efefef] p-0.5 rounded-[3px] border border-[#808080]">
          <button
            type="button"
            onClick={() => onChangeAnalysisMode?.('2D')}
            className={`px-2.5 py-1 rounded-[2px] font-bold text-xs transition-colors ${
              analysisMode === '2D' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
          >
            2D
          </button>
          <button
            type="button"
            onClick={() => onChangeAnalysisMode?.('3D')}
            className={`px-2.5 py-1 rounded-[2px] font-bold text-xs transition-colors flex items-center gap-1 ${
              analysisMode === '3D' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            3D Stereo
          </button>
        </div>

        {/* Layout Presets */}
        <div className="flex items-center rounded-[3px] bg-[#efefef] border border-[#808080] p-0.5">
          {analysisMode === '3D' && (
            <>
              <button
                type="button"
                onClick={() => onLayoutChange('split-3d')}
                className={`px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
                  layout === 'split-3d' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
                }`}
                title="Dual Video + 3D Orbit View"
              >
                Dual+3D
              </button>
              <button
                type="button"
                onClick={() => onLayoutChange('trajectory-3d')}
                className={`px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
                  layout === 'trajectory-3d' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
                }`}
                title="3D Spatial Trajectory Orbit View"
              >
                3D Orbit
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onLayoutChange('split')}
            className={`px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
              layout === 'split' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
            title="Split View (Video, Graphs, Table)"
          >
            Split
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange('video-plot')}
            className={`px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
              layout === 'video-plot' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
            title="Video + Stacked Graphs"
          >
            Graphs
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange('video-table')}
            className={`px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
              layout === 'video-table' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
            title="Video + Kinematic Data Table"
          >
            Table
          </button>
          <button
            type="button"
            onClick={() => onLayoutChange('video-only')}
            className={`px-2 py-1 rounded-[2px] text-xs font-semibold transition-colors ${
              layout === 'video-only' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#dcdcdc]'
            }`}
            title="Full Video Viewport"
          >
            Video
          </button>
        </div>
      </div>
    </div>
  );
};
