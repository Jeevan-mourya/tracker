import React, { useRef, useState, useEffect } from 'react';
import { SAMPLE_EXPERIMENTS } from '../data/samples';
import { SampleExperiment, Track, Calibration, CoordinateAxes, GraphConfig } from '../types';
import {
  FolderOpen,
  Download,
  Upload,
  HelpCircle,
  Activity,
  Film,
  HardDrive,
  Shield,
  Keyboard,
  FileText,
  Save,
  Check,
  ChevronRight,
  Crosshair,
  Scissors,
  Compass,
  Ruler,
  Sliders,
  Eye,
  TrendingUp,
  Grid,
  FastForward,
  Undo2,
  Redo2,
  Trash2,
  RotateCcw,
  ArrowLeftRight,
  Copy,
} from 'lucide-react';
import { downloadUserManualPDF } from '../utils/downloadPdf';
import { ACCEPTED_VIDEO_ACCEPT_STRING } from '../utils/videoFormats';
import { FormatsModalTab } from './SupportedFormatsModal';
import { ViewLayout } from './Toolbar';

interface NavbarProps {
  currentExperimentId: string;
  currentExperimentTitle: string;
  onSelectExperiment: (exp: SampleExperiment) => void;
  onUploadVideo: (file: File) => void;
  onOpenProject?: (file: File) => void;
  onExportJSON: () => void;
  onSaveToFolder?: () => void;
  onExportCSV: () => void;
  onCopyTSV?: () => void;
  onTriggerExportPlot?: () => void;
  onOpenPdfReport?: () => void;
  onOpenHelp: () => void;
  onOpenShortcuts?: () => void;
  onOpenFormatsModal?: (tab?: FormatsModalTab) => void;
  onOpenDownloadExe?: () => void;
  // Extended Desktop Menu Bar handlers
  tracks?: Track[];
  activeTrackId?: string;
  onSelectTrack?: (trackId: string) => void;
  onOpenTrackManager?: () => void;
  onClearTrackPoints?: () => void;
  onUndoLastPoint?: () => void;
  onRedoLastPoint?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoCount?: number;
  redoCount?: number;
  requireShiftToMark?: boolean;
  onToggleRequireShiftToMark?: () => void;
  autoAdvance?: boolean;
  onToggleAutoAdvance?: () => void;
  onOpenClipSettings?: () => void;
  showTrails?: boolean;
  onToggleTrails?: () => void;
  showVectors?: boolean;
  onToggleVectors?: () => void;
  showLoupe?: boolean;
  onToggleLoupe?: () => void;
  axes?: CoordinateAxes;
  onToggleAxes?: () => void;
  onToggleGrid?: () => void;
  calibration?: Calibration;
  onToggleCalibration?: () => void;
  onOpenCalibrationModal?: () => void;
  onOpenTriangulationModal?: () => void;
  onOpenMonocular6DoFModal?: () => void;
  graphConfig?: GraphConfig;
  onUpdateGraphConfig?: (updates: Partial<GraphConfig>) => void;
  layout?: ViewLayout;
  onLayoutChange?: (layout: ViewLayout) => void;
  onResetSplitters?: () => void;
  onSwapPanes?: () => void;
  onOpenMetrologyAudit?: () => void;
  onResetWorkspace?: () => void;
}

type MenuKey = 'file' | 'track' | 'calibrate' | '6dof' | 'view' | 'export' | 'help' | null;

export const Navbar: React.FC<NavbarProps> = ({
  currentExperimentId,
  currentExperimentTitle,
  onSelectExperiment,
  onUploadVideo,
  onOpenProject,
  onExportJSON,
  onSaveToFolder,
  onExportCSV,
  onCopyTSV,
  onTriggerExportPlot,
  onOpenPdfReport,
  onOpenHelp,
  onOpenShortcuts,
  onOpenFormatsModal,
  onOpenDownloadExe,
  tracks = [],
  activeTrackId = '',
  onSelectTrack,
  onOpenTrackManager,
  onClearTrackPoints,
  onUndoLastPoint,
  onRedoLastPoint,
  canUndo = false,
  canRedo = false,
  undoCount = 0,
  redoCount = 0,
  requireShiftToMark = true,
  onToggleRequireShiftToMark,
  autoAdvance = true,
  onToggleAutoAdvance,
  onOpenClipSettings,
  showTrails = true,
  onToggleTrails,
  showVectors = true,
  onToggleVectors,
  showLoupe = false,
  onToggleLoupe,
  axes,
  onToggleAxes,
  onToggleGrid,
  calibration,
  onToggleCalibration,
  onOpenCalibrationModal,
  onOpenTriangulationModal,
  onOpenMonocular6DoFModal,
  graphConfig,
  onUpdateGraphConfig,
  layout = 'split',
  onLayoutChange,
  onResetSplitters,
  onSwapPanes,
  onOpenMetrologyAudit,
  onResetWorkspace,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);

  const [activeMenu, setActiveMenu] = useState<MenuKey>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setActiveMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveMenu(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadVideo(file);
      e.target.value = '';
    }
  };

  const handleMenuTriggerClick = (key: Exclude<MenuKey, null>) => {
    setActiveMenu((prev) => (prev === key ? null : key));
  };

  const handleMenuTriggerHover = (key: Exclude<MenuKey, null>) => {
    if (activeMenu !== null && activeMenu !== key) {
      setActiveMenu(key);
    }
  };

  const closeAndRun = (fn?: () => void) => {
    setActiveMenu(null);
    fn?.();
  };

  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const refFrameMode = graphConfig?.referenceFrameMode || 'M_wrt_L';
  const coordConv = graphConfig?.coordConvention || 'NED_Z_DOWN';
  const virtPtId = graphConfig?.activeVirtualPointId || 'vp-cg';

  const virtualPointsList = activeTrack?.virtualPointsCatalog || [
    { id: 'vp-cg', name: 'Missile CG', x: 0, y: 0, z: 0 },
    { id: 'vp-nose', name: 'Nose Tip', x: 1.85, y: 0, z: 0 },
    { id: 'vp-fin-upper', name: 'Aft Upper Fin Tip', x: -1.45, y: 0.28, z: 0 },
    { id: 'vp-tail', name: 'Tail Boattail', x: -1.6, y: 0, z: 0 },
  ];

  return (
    <header
      id="tracker-header"
      ref={menuBarRef}
      className="h-[28px] bg-[#181B20] border-b border-[#2A2E37] px-2.5 flex items-center justify-between text-[11.5px] text-[#E2E8F0] select-none z-40 shrink-0"
    >
      {/* Left: Brand Identity + Classic Desktop Application Menu Bar */}
      <div className="flex items-center gap-1 h-full">
        <div className="flex items-center gap-1.5 pr-2 mr-1 border-r border-[#2A2E37] h-4">
          <div className="flex items-center justify-center w-4 h-4 rounded-[2px] bg-[#2563EB] text-white">
            <Activity className="w-3 h-3" />
          </div>
          <span className="font-bold tracking-wider text-[11px] text-[#F8FAFC] whitespace-nowrap">
            TRACKER 6-DOF
          </span>
        </div>

        {/* Hidden compatibility select for experiment-selector */}
        <select
          id="experiment-selector"
          value={currentExperimentId}
          onChange={(e) => {
            const exp = SAMPLE_EXPERIMENTS.find((item) => item.id === e.target.value);
            if (exp) onSelectExperiment(exp);
          }}
          className="hidden"
          aria-label="Select Experiment"
        >
          {!SAMPLE_EXPERIMENTS.find((e) => e.id === currentExperimentId) && (
            <option value={currentExperimentId}>
              {currentExperimentTitle ? `[Custom] ${currentExperimentTitle}` : '[Custom Video Analysis]'}
            </option>
          )}
          {SAMPLE_EXPERIMENTS.map((exp) => (
            <option key={exp.id} value={exp.id}>
              {exp.title}
            </option>
          ))}
        </select>

        {/* ======================== 1. FILE MENU ======================== */}
        <div className="relative h-full flex items-center">
          <button
            id="menu-btn-file"
            type="button"
            onClick={() => handleMenuTriggerClick('file')}
            onMouseEnter={() => handleMenuTriggerHover('file')}
            className={`px-2 h-[22px] rounded-[2px] font-medium transition-colors whitespace-nowrap ${
              activeMenu === 'file'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#E2E8F0] hover:bg-[#262A33]'
            }`}
          >
            File
          </button>

          <div
            id="menu-dropdown-file"
            className={`${
              activeMenu === 'file' ? 'block' : 'hidden'
            } absolute left-0 top-full mt-0.5 w-64 bg-[#1E2229] border border-[#333842] rounded-[3px] shadow-2xl py-1 z-50 text-[#E2E8F0] text-[11.5px]`}
          >
            <button
              id="btn-upload-video"
              type="button"
              onClick={() => closeAndRun(() => fileInputRef.current?.click())}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Upload className="w-3.5 h-3.5" />
                <span>Open Video...</span>
              </span>
              <span className="text-[10px] font-mono text-[#94A3B8]">MP4/AVI</span>
            </button>

            <button
              id="btn-open-project"
              type="button"
              onClick={() => closeAndRun(() => projectFileInputRef.current?.click())}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Open Project (.trk / .zip)...</span>
              </span>
              <kbd className="text-[10px] font-mono text-[#94A3B8]">Ctrl+O</kbd>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />

            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8] flex items-center justify-between">
              <span>Load Benchmark Scenario</span>
              <ChevronRight className="w-3 h-3" />
            </div>
            <div className="max-h-44 overflow-y-auto bg-[#181B20]/60 border-y border-[#2A2E37] py-0.5">
              {SAMPLE_EXPERIMENTS.map((exp) => {
                const isSelected = exp.id === currentExperimentId;
                return (
                  <button
                    key={exp.id}
                    type="button"
                    onClick={() => closeAndRun(() => onSelectExperiment(exp))}
                    className={`w-full px-4 py-1 text-left flex items-center justify-between text-[11px] transition-colors ${
                      isSelected
                        ? 'bg-[#2563EB]/25 text-white font-semibold'
                        : 'text-[#CBD5E1] hover:bg-[#2563EB] hover:text-white'
                    }`}
                  >
                    <span className="truncate pr-2">{exp.title}</span>
                    {isSelected && <Check className="w-3 h-3 text-[#60A5FA] shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              type="button"
              onClick={() => closeAndRun(onExportJSON)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Save className="w-3.5 h-3.5" />
                <span>Save Project (.trk)</span>
              </span>
              <kbd className="text-[10px] font-mono text-[#94A3B8]">Ctrl+S</kbd>
            </button>

            {onSaveToFolder && (
              <button
                id="btn-save-folder"
                type="button"
                onClick={() => closeAndRun(onSaveToFolder)}
                className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>Save Workspace Bundle (.zip)</span>
                </span>
              </button>
            )}

            {onResetWorkspace && (
              <button
                id="btn-reset-workspace"
                type="button"
                onClick={() => closeAndRun(onResetWorkspace)}
                className="w-full px-3 py-1.5 text-left hover:bg-[#DC2626] hover:text-white text-[#FCA5A5] flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset / Clear Saved Session</span>
                </span>
              </button>
            )}

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              id="btn-video-formats"
              type="button"
              onClick={() => closeAndRun(() => onOpenFormatsModal?.('catalog'))}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Film className="w-3.5 h-3.5" />
                <span>Supported High-Speed Formats (.AVI / OpenDML)</span>
              </span>
            </button>

            {onOpenDownloadExe && (
              <button
                id="btn-defense-security"
                type="button"
                onClick={() => closeAndRun(onOpenDownloadExe)}
                className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-[#60A5FA]" />
                  <span>Air-Gapped &amp; Defense Compliance Status</span>
                </span>
              </button>
            )}
          </div>
        </div>

        {/* ======================== 2. TRACK MENU ======================== */}
        <div className="relative h-full flex items-center">
          <button
            id="menu-btn-track"
            type="button"
            onClick={() => handleMenuTriggerClick('track')}
            onMouseEnter={() => handleMenuTriggerHover('track')}
            className={`px-2 h-[22px] rounded-[2px] font-medium transition-colors whitespace-nowrap ${
              activeMenu === 'track'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#E2E8F0] hover:bg-[#262A33]'
            }`}
          >
            Track
          </button>

          <div
            id="menu-dropdown-track"
            className={`${
              activeMenu === 'track' ? 'block' : 'hidden'
            } absolute left-0 top-full mt-0.5 w-64 bg-[#1E2229] border border-[#333842] rounded-[3px] shadow-2xl py-1 z-50 text-[#E2E8F0] text-[11.5px]`}
          >
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
              Active Point Mass Track
            </div>
            {tracks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => closeAndRun(() => onSelectTrack?.(t.id))}
                className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-white/30"
                    style={{ backgroundColor: t.color || '#2563EB' }}
                  />
                  <span>
                    {t.name} ({t.steps.length} pts)
                  </span>
                </span>
                {t.id === activeTrackId && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
              </button>
            ))}

            <button
              type="button"
              onClick={() => closeAndRun(onOpenTrackManager)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span>Create / Manage Point Masses...</span>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              type="button"
              onClick={() => closeAndRun(onToggleRequireShiftToMark)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Crosshair className="w-3.5 h-3.5" />
                <span>Mark Mode: {requireShiftToMark ? 'Shift+Click Safety' : 'Direct Click'}</span>
              </span>
              {requireShiftToMark && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onToggleAutoAdvance)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <FastForward className="w-3.5 h-3.5" />
                <span>Auto-Step Frame on Mark</span>
              </span>
              {autoAdvance && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onOpenMonocular6DoFModal)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5" />
                <span>Auto-Tracker (ZNCC Sub-Pixel Template)...</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onOpenClipSettings)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Scissors className="w-3.5 h-3.5" />
                <span>Clip Cuts / Frame Range...</span>
              </span>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
              Canvas Overlays
            </div>

            <button
              type="button"
              onClick={() => closeAndRun(onToggleTrails)}
              className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span>Toggle Trajectory Trails</span>
              <span className="text-[10px] font-mono">{showTrails ? 'ON (T)' : 'OFF (T)'}</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onToggleVectors)}
              className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5" />
                <span>Toggle Velocity Vectors</span>
              </span>
              <span className="text-[10px] font-mono">{showVectors ? 'ON (V)' : 'OFF (V)'}</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onToggleLoupe)}
              className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Eye className="w-3.5 h-3.5" />
                <span>Toggle Magnifier Loupe</span>
              </span>
              <span className="text-[10px] font-mono">{showLoupe ? 'ON (M)' : 'OFF (M)'}</span>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              type="button"
              onClick={() => closeAndRun(onUndoLastPoint)}
              disabled={!canUndo}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Undo2 className="w-3.5 h-3.5" />
                <span>Undo{undoCount > 0 ? ` (${undoCount})` : ''}</span>
              </span>
              <kbd className="text-[10px] font-mono text-[#94A3B8]">Ctrl+Z</kbd>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onRedoLastPoint)}
              disabled={!canRedo}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white disabled:opacity-40 disabled:pointer-events-none flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Redo2 className="w-3.5 h-3.5" />
                <span>Redo{redoCount > 0 ? ` (${redoCount})` : ''}</span>
              </span>
              <kbd className="text-[10px] font-mono text-[#94A3B8]">Ctrl+Y</kbd>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onClearTrackPoints)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#DC2626] hover:text-white flex items-center justify-between transition-colors text-[#FCA5A5]"
            >
              <span className="flex items-center gap-2">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Active Track Points</span>
              </span>
            </button>
          </div>
        </div>

        {/* ======================== 3. CALIBRATE MENU ======================== */}
        <div className="relative h-full flex items-center">
          <button
            id="menu-btn-calibrate"
            type="button"
            onClick={() => handleMenuTriggerClick('calibrate')}
            onMouseEnter={() => handleMenuTriggerHover('calibrate')}
            className={`px-2 h-[22px] rounded-[2px] font-medium transition-colors whitespace-nowrap ${
              activeMenu === 'calibrate'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#E2E8F0] hover:bg-[#262A33]'
            }`}
          >
            Calibrate
          </button>

          <div
            id="menu-dropdown-calibrate"
            className={`${
              activeMenu === 'calibrate' ? 'block' : 'hidden'
            } absolute left-0 top-full mt-0.5 w-68 bg-[#1E2229] border border-[#333842] rounded-[3px] shadow-2xl py-1 z-50 text-[#E2E8F0] text-[11.5px]`}
          >
            <button
              type="button"
              onClick={() => closeAndRun(onToggleAxes)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5" />
                <span>Coordinate Axes Origin &amp; Angle</span>
              </span>
              <span className="text-[10px] font-mono">{axes?.visible ? 'ON (A)' : 'OFF (A)'}</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onToggleGrid)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Grid className="w-3.5 h-3.5" />
                <span>Toggle Cartesian Grid Overlay</span>
              </span>
              <span className="text-[10px] font-mono">{axes?.gridVisible ? 'ON' : 'OFF'}</span>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              type="button"
              onClick={() => closeAndRun(onToggleCalibration)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Ruler className="w-3.5 h-3.5" />
                <span>
                  2D Calibration Stick ({calibration?.realLength ?? 1} {calibration?.unit ?? 'm'})
                </span>
              </span>
              <span className="text-[10px] font-mono">
                {calibration?.visible ? 'ON (C)' : 'OFF (C)'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onOpenCalibrationModal)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span className="flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5" />
                <span>Configure Calibration Stick Length &amp; Units...</span>
              </span>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              type="button"
              onClick={() => closeAndRun(onOpenTriangulationModal)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span>3D Stereo DLT &amp; Empirical Calibration...</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onOpenTriangulationModal)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span>Multi-Rate Camera Sync Setup...</span>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              id="menu-calibrate-metrology-audit"
              type="button"
              onClick={() => closeAndRun(onOpenMetrologyAudit)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between text-[#93C5FD] font-semibold transition-colors"
            >
              <span className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Metrology Error &amp; Accuracy Audit...</span>
              </span>
              <kbd className="text-[10px] font-mono text-[#94A3B8]">Alt+M</kbd>
            </button>
          </div>
        </div>

        {/* ======================== 4. 6-DOF & SOLVERS MENU ======================== */}
        <div className="relative h-full flex items-center">
          <button
            id="menu-btn-6dof"
            type="button"
            onClick={() => handleMenuTriggerClick('6dof')}
            onMouseEnter={() => handleMenuTriggerHover('6dof')}
            className={`px-2 h-[22px] rounded-[2px] font-medium transition-colors whitespace-nowrap ${
              activeMenu === '6dof'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#E2E8F0] hover:bg-[#262A33]'
            }`}
          >
            6-DOF &amp; Solvers
          </button>

          <div
            id="menu-dropdown-6dof"
            className={`${
              activeMenu === '6dof' ? 'block' : 'hidden'
            } absolute left-0 top-full mt-0.5 w-72 bg-[#1E2229] border border-[#333842] rounded-[3px] shadow-2xl py-1 z-50 text-[#E2E8F0] text-[11.5px]`}
          >
            <button
              type="button"
              onClick={() => closeAndRun(onOpenMonocular6DoFModal)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between font-semibold transition-colors"
            >
              <span className="flex items-center gap-2">
                <Compass className="w-3.5 h-3.5 text-[#60A5FA]" />
                <span>Monocular 6-DOF PnP Store Separation Solver...</span>
              </span>
            </button>

            <button
              id="menu-6dof-metrology-audit"
              type="button"
              onClick={() => closeAndRun(onOpenMetrologyAudit)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between text-[#93C5FD] font-semibold transition-colors"
            >
              <span className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-[#38BDF8]" />
                <span>Metrology Error &amp; Accuracy Audit...</span>
              </span>
              <kbd className="text-[10px] font-mono text-[#94A3B8]">Alt+M</kbd>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
              Active Reference Frame
            </div>

            {(
              [
                { id: 'M_wrt_L', label: 'Missile rel. Launcher (M wrt L)' },
                { id: 'M_wrt_A', label: 'Missile rel. Aircraft (M wrt A)' },
                { id: 'L_wrt_A', label: 'Launcher rel. Aircraft (L wrt A)' },
                { id: 'camera_world', label: 'Camera / World Frame' },
              ] as const
            ).map((rf) => (
              <button
                key={rf.id}
                type="button"
                onClick={() =>
                  closeAndRun(() => onUpdateGraphConfig?.({ referenceFrameMode: rf.id }))
                }
                className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
              >
                <span>{rf.label}</span>
                {refFrameMode === rf.id && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
              </button>
            ))}

            <div className="my-1 border-t border-[#2A2E37]" />
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
              6-DOF Sign &amp; Direction Matrix
            </div>

            <button
              type="button"
              onClick={() =>
                closeAndRun(() => onUpdateGraphConfig?.({ coordConvention: 'NED_Z_DOWN' }))
              }
              className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span>Missile Body NED (X+ Nose, Y+ Right, Z+ Down)</span>
              {coordConv === 'NED_Z_DOWN' && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
            </button>
            <button
              type="button"
              onClick={() =>
                closeAndRun(() => onUpdateGraphConfig?.({ coordConvention: 'ENU_Z_UP' }))
              }
              className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
            >
              <span>Standard Cartesian ENU (+Z Up)</span>
              {coordConv === 'ENU_Z_UP' && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
            </button>
            <button
              type="button"
              onClick={() =>
                closeAndRun(() => onUpdateGraphConfig?.({ showSettingsDrawer: true }))
              }
              className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between text-[#93C5FD] transition-colors"
            >
              <span className="flex items-center gap-1.5">
                <Sliders className="w-3 h-3" />
                <span>Configure Per-Channel Sign &amp; |q| Matrix...</span>
              </span>
            </button>

            <div className="my-1 border-t border-[#2A2E37]" />
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
              Quick Research Plot Presets
            </div>

            {(
              [
                {
                  id: 'x-vs-time',
                  label: 'X vs Time (Signed & Positive |ΔX|)',
                  updates: {
                    varY: 'x' as const,
                    varX: 't' as const,
                    viewMode: 'dual-sync' as const,
                    transformMode: 'signed' as const,
                    panel2TransformMode: 'abs' as const,
                  },
                },
                {
                  id: 'z-drop-vs-time',
                  label: 'Z Drop vs Time (NED +Z Down)',
                  updates: {
                    varY: 'z' as const,
                    varX: 't' as const,
                    coordConvention: 'NED_Z_DOWN' as const,
                    viewMode: 'dual-sync' as const,
                    transformMode: 'signed' as const,
                    panel2TransformMode: 'abs' as const,
                  },
                },
                {
                  id: 'pitch-vs-time',
                  label: 'Pitch vs Time (Nose Up +)',
                  updates: {
                    varY: 'pitch' as const,
                    varX: 't' as const,
                    viewMode: 'dual-sync' as const,
                    transformMode: 'signed' as const,
                    panel2TransformMode: 'abs' as const,
                  },
                },
                {
                  id: 'yaw-vs-time',
                  label: 'Yaw vs Time (Nose Right +)',
                  updates: {
                    varY: 'yaw' as const,
                    varX: 't' as const,
                    viewMode: 'dual-sync' as const,
                    transformMode: 'signed' as const,
                    panel2TransformMode: 'abs' as const,
                  },
                },
                {
                  id: 'roll-vs-pitch',
                  label: 'Roll vs Pitch (Cross-Coupling)',
                  updates: {
                    varY: 'roll' as const,
                    varX: 'pitch' as const,
                    viewMode: 'single' as const,
                    transformMode: 'signed' as const,
                    transformModeX: 'signed' as const,
                  },
                },
                {
                  id: 'pitch-vs-velocity',
                  label: 'Pitch vs Velocity (Stability)',
                  updates: {
                    varY: 'pitch' as const,
                    varX: 'v' as const,
                    viewMode: 'single' as const,
                    transformMode: 'signed' as const,
                    transformModeX: 'signed' as const,
                  },
                },
                {
                  id: 'z-vs-x',
                  label: 'Z vs X (Trajectory Side Profile)',
                  updates: {
                    varY: 'z' as const,
                    varX: 'x' as const,
                    viewMode: 'single' as const,
                    transformMode: 'signed' as const,
                    transformModeX: 'signed' as const,
                  },
                },
                {
                  id: 'error-pct-vs-time',
                  label: 'Error % vs Time (Metrological Audit)',
                  updates: {
                    varY: 'errorPct' as const,
                    varX: 't' as const,
                    viewMode: 'single' as const,
                    transformMode: 'abs' as const,
                    showUncertaintyBand: true,
                  },
                },
              ]
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => closeAndRun(() => onUpdateGraphConfig?.(preset.updates))}
                className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors text-[11px]"
              >
                <span>{preset.label}</span>
              </button>
            ))}

            <div className="my-1 border-t border-[#2A2E37]" />
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
              Active Virtual Critical Point
            </div>

            {virtualPointsList.map((vp) => (
              <button
                key={vp.id}
                type="button"
                onClick={() =>
                  closeAndRun(() => onUpdateGraphConfig?.({ activeVirtualPointId: vp.id }))
                }
                className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
              >
                <span>{vp.name}</span>
                {virtPtId === vp.id && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
              </button>
            ))}
          </div>
        </div>

        {/* ======================== 5. VIEW MENU ======================== */}
        <div className="relative h-full flex items-center">
          <button
            id="menu-btn-view"
            type="button"
            onClick={() => handleMenuTriggerClick('view')}
            onMouseEnter={() => handleMenuTriggerHover('view')}
            className={`px-2 h-[22px] rounded-[2px] font-medium transition-colors whitespace-nowrap ${
              activeMenu === 'view'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#E2E8F0] hover:bg-[#262A33]'
            }`}
          >
            View
          </button>

          <div
            id="menu-dropdown-view"
            className={`${
              activeMenu === 'view' ? 'block' : 'hidden'
            } absolute left-0 top-full mt-0.5 w-60 bg-[#1E2229] border border-[#333842] rounded-[3px] shadow-2xl py-1 z-50 text-[#E2E8F0] text-[11.5px]`}
          >
            <div className="px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-[#94A3B8]">
              Workspace Presets
            </div>
            {(
              [
                { id: 'video-only', label: '1: Video Focus', key: '1' },
                { id: 'video-plot', label: '2: Graph Focus', key: '2' },
                { id: 'split', label: '3: Balanced Split', key: '3' },
                { id: 'split-3d', label: '4: Quad Grid', key: '4' },
                { id: 'trajectory-3d', label: '3D Spatial Orbit', key: '' },
                { id: 'video-table', label: 'Data Table Focus', key: '' },
              ] as const
            ).map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => closeAndRun(() => onLayoutChange?.(preset.id))}
                className="w-full px-3 py-1 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
              >
                <span>{preset.label}</span>
                <span className="flex items-center gap-1.5">
                  {preset.key && (
                    <kbd className="text-[10px] font-mono text-[#94A3B8]">{preset.key}</kbd>
                  )}
                  {layout === preset.id && <Check className="w-3.5 h-3.5 text-[#60A5FA]" />}
                </span>
              </button>
            ))}

            <div className="my-1 border-t border-[#2A2E37]" />

            <button
              type="button"
              onClick={() => closeAndRun(onSwapPanes)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Swap Left &amp; Right Panes</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onResetSplitters)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Splitters to 50/50</span>
            </button>
          </div>
        </div>

        {/* ======================== 6. EXPORT MENU ======================== */}
        <div className="relative h-full flex items-center">
          <button
            id="menu-btn-export"
            type="button"
            onClick={() => handleMenuTriggerClick('export')}
            onMouseEnter={() => handleMenuTriggerHover('export')}
            className={`px-2 h-[22px] rounded-[2px] font-medium transition-colors whitespace-nowrap ${
              activeMenu === 'export'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#E2E8F0] hover:bg-[#262A33]'
            }`}
          >
            Export
          </button>

          <div
            id="menu-dropdown-export"
            className={`${
              activeMenu === 'export' ? 'block' : 'hidden'
            } absolute left-0 top-full mt-0.5 w-68 bg-[#1E2229] border border-[#333842] rounded-[3px] shadow-2xl py-1 z-50 text-[#E2E8F0] text-[11.5px]`}
          >
            <button
              type="button"
              onClick={() => closeAndRun(onTriggerExportPlot)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Publication Plot (300 DPI PNG / SVG)...</span>
            </button>

            <button
              id="btn-export-csv"
              type="button"
              onClick={() => closeAndRun(onExportCSV)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Certified Defense CSV</span>
            </button>

            <button
              type="button"
              onClick={() => closeAndRun(onCopyTSV)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Telemetry Table (TSV)</span>
            </button>

            {onOpenPdfReport && (
              <button
                id="btn-export-pdf-report"
                type="button"
                onClick={() => closeAndRun(onOpenPdfReport)}
                className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Generate Defense PDF Report</span>
              </button>
            )}
          </div>
        </div>

        {/* ======================== 7. HELP MENU ======================== */}
        <div className="relative h-full flex items-center">
          <button
            id="menu-btn-help"
            type="button"
            onClick={() => handleMenuTriggerClick('help')}
            onMouseEnter={() => handleMenuTriggerHover('help')}
            className={`px-2 h-[22px] rounded-[2px] font-medium transition-colors whitespace-nowrap ${
              activeMenu === 'help'
                ? 'bg-[#2563EB] text-white'
                : 'text-[#E2E8F0] hover:bg-[#262A33]'
            }`}
          >
            Help
          </button>

          <div
            id="menu-dropdown-help"
            className={`${
              activeMenu === 'help' ? 'block' : 'hidden'
            } absolute left-0 top-full mt-0.5 w-56 bg-[#1E2229] border border-[#333842] rounded-[3px] shadow-2xl py-1 z-50 text-[#E2E8F0] text-[11.5px]`}
          >
            <button
              id="btn-download-pdf-manual"
              type="button"
              onClick={() => closeAndRun(downloadUserManualPDF)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Operator Manual (PDF)</span>
            </button>

            <button
              id="btn-help-guide"
              type="button"
              onClick={() => closeAndRun(onOpenHelp)}
              className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center gap-2 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Workstation Metrology Guide</span>
            </button>

            {onOpenShortcuts && (
              <button
                type="button"
                onClick={() => closeAndRun(onOpenShortcuts)}
                className="w-full px-3 py-1.5 text-left hover:bg-[#2563EB] hover:text-white flex items-center justify-between transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Keyboard className="w-3.5 h-3.5" />
                  <span>Keyboard Shortcuts</span>
                </span>
                <kbd className="text-[10px] font-mono text-[#94A3B8]">?</kbd>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_VIDEO_ACCEPT_STRING}
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".trk,.json,.zip,.trz,application/json,application/zip"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            onOpenProject?.(file);
            e.target.value = '';
          }
        }}
      />

      {/* Right Side of Bar 1: Active Scenario Name + Air-Gapped Ready + Quick Save (.trk) + Shortcuts (?) */}
      <div className="flex items-center gap-2 h-full">
        <span
          className="hidden lg:inline-block text-[11px] font-mono text-[#94A3B8] truncate max-w-[220px]"
          title={`Active Scenario: ${currentExperimentTitle}`}
        >
          {currentExperimentTitle}
        </span>

        <span className="hidden lg:inline text-[#475569]">·</span>

        {onOpenDownloadExe && (
          <button
            type="button"
            onClick={onOpenDownloadExe}
            className="hidden sm:flex items-center gap-1 px-1.5 h-[20px] rounded-[2px] text-[10.5px] font-mono text-[#CBD5E1] hover:text-white hover:bg-[#262A33] transition-colors cursor-pointer"
            title="100% Client-Side Air-Gapped Ready • Click for Defense Compliance & Offline .EXE Specs"
          >
            <Shield className="w-3 h-3 text-[#60A5FA]" />
            <span>Air-Gapped Ready</span>
          </button>
        )}

        <button
          id="btn-save-trk"
          type="button"
          onClick={onExportJSON}
          className="flex items-center gap-1 px-2 h-[22px] rounded-[2px] text-[11px] font-semibold text-[#E2E8F0] bg-[#262A33] hover:bg-[#2563EB] hover:text-white border border-[#333842] transition-colors cursor-pointer"
          title="Save full Tracker project file (.trk) [Ctrl+S]"
        >
          <Save className="w-3 h-3" />
          <span>Save (.trk)</span>
        </button>

        {onOpenShortcuts && (
          <button
            id="btn-shortcuts"
            type="button"
            onClick={onOpenShortcuts}
            className="flex items-center justify-center w-[22px] h-[22px] rounded-[2px] text-[#CBD5E1] hover:text-white hover:bg-[#262A33] border border-[#333842] transition-colors cursor-pointer"
            title="Keyboard Shortcuts (? or F1)"
          >
            <span className="font-mono text-[11px] font-bold">?</span>
          </button>
        )}
      </div>
    </header>
  );
};
