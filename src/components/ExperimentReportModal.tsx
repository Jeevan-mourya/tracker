import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  X,
  Download,
  CheckCircle2,
  Camera,
  Activity,
  Shield,
  Layers,
  Sparkles,
  TrendingUp,
  Sliders,
  Eye,
  Info,
  Palette,
  Target,
  ArrowUpRight,
  Maximize2,
  RefreshCw,
  Box,
} from 'lucide-react';
import {
  Track,
  Calibration,
  CoordinateAxes,
  ClipSettings,
  TriangulationConfig,
} from '../types';
import {
  computeTrackSummary,
  generateTrajectoryPlotSnapshot,
  generateVelocityPlotSnapshot,
  generateAccelerationPlotSnapshot,
  generate3DTrajectoryPlotSnapshot,
  generateExperimentPdfReport,
  ReportMetadata,
  ReportCustomOptions,
  ReportTheme,
  ReportGraphType,
} from '../utils/generatePdfReport';
import { formatHighSpeedTime } from '../utils/highSpeedCameras';

interface ExperimentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentTitle: string;
  tracks: Track[];
  activeTrackId: string;
  onSelectTrack?: (id: string) => void;
  clip: ClipSettings;
  calibration: Calibration;
  onUpdateCalibration?: (cal: Partial<Calibration>) => void;
  axes: CoordinateAxes;
  videoSnapshotUrl: string | null;
  videoUrl?: string;
  analysisMode?: '2D' | '3D';
  triangulation?: TriangulationConfig;
  onUpdateTriangulation?: (tri: TriangulationConfig) => void;
  currentFrame?: number;
  onSeekFrame?: (frame: number) => void;
  onCaptureSnapshot?: () => string | null;
}

export const ExperimentReportModal: React.FC<ExperimentReportModalProps> = ({
  isOpen,
  onClose,
  experimentTitle,
  tracks,
  activeTrackId,
  onSelectTrack,
  clip,
  calibration,
  axes,
  videoSnapshotUrl: initialVideoSnapshotUrl,
  analysisMode = '2D',
  triangulation,
  onUpdateTriangulation,
  currentFrame = 0,
  onSeekFrame,
  onCaptureSnapshot,
}) => {
  // Target Track & Metadata
  const [selectedTrackId, setSelectedTrackId] = useState<string>(activeTrackId);
  const [investigator, setInvestigator] = useState<string>('Field Range Engineer');
  const [facility, setFacility] = useState<string>('Range Test Cell A / Defense Ballistics');
  const [testRunId, setTestRunId] = useState<string>('RUN-HS-01');
  const [notes, setNotes] = useState<string>(
    'Optical high-speed trajectory verified. Sub-pixel regression applied. Zero anomalous coordinate deviations recorded.'
  );

  // 1. Officer Custom Design Standards & Graph Flexibilities
  const [forceZeroOrigin, setForceZeroOrigin] = useState<boolean>(true); // Senior officer requirement: (0,0) baseline
  const [velocityPositiveUpward, setVelocityPositiveUpward] = useState<boolean>(true); // Velocity graph in positive upward direction
  const [primaryGraphType, setPrimaryGraphType] = useState<ReportGraphType>(
    analysisMode === '3D' ? 'trajectory-3d' : 'trajectory-yx'
  );
  const [secondaryGraphType, setSecondaryGraphType] = useState<ReportGraphType | 'none'>('vy-time');
  const [theme, setTheme] = useState<ReportTheme>('defense-navy');
  const [customAccentColor, setCustomAccentColor] = useState<string>('#0284c7');

  // 2. Video Snapshot from Frame X Selector
  const [snapFrame, setSnapFrame] = useState<number>(currentFrame);
  const [currentVideoSnapUrl, setCurrentVideoSnapUrl] = useState<string | null>(initialVideoSnapshotUrl);

  // 3. 2D vs 3D Coverage & 3D Edit Options
  const [reportMode, setReportMode] = useState<'2D' | '3D'>(analysisMode === '3D' ? '3D' : '2D');
  const [baselineMeters, setBaselineMeters] = useState<number>(triangulation?.baselineMeters ?? 1.2);
  const [convergenceAngleDeg, setConvergenceAngleDeg] = useState<number>(triangulation?.convergenceAngleDeg ?? 90);
  const [dltMethod, setDltMethod] = useState<string>(triangulation?.method ?? 'orthogonal-front-side');
  const [meanResidualToleranceMm, setMeanResidualToleranceMm] = useState<number>(
    (triangulation?.meanResidualMeters ?? 0.002) * 1000
  );
  const [cam1Name, setCam1Name] = useState<string>(clip.cameraModel || 'Photron FASTCAM SA-Z (Cam1)');
  const [cam2Name, setCam2Name] = useState<string>('Nova S12 Orthogonal (Cam2)');
  const [cam1Fps, setCam1Fps] = useState<number>(clip.fps);
  const [cam2Fps, setCam2Fps] = useState<number>(triangulation?.fpsCam2 || clip.fps);
  const [applied3DSuccess, setApplied3DSuccess] = useState<boolean>(false);

  // UI Navigation Tabs
  const [activeTab, setActiveTab] = useState<'custom-design' | '3d-editor' | 'video-snap' | 'preview'>('custom-design');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  useEffect(() => {
    if (activeTrackId) setSelectedTrackId(activeTrackId);
  }, [activeTrackId]);

  useEffect(() => {
    if (initialVideoSnapshotUrl) {
      setCurrentVideoSnapUrl(initialVideoSnapshotUrl);
    }
  }, [initialVideoSnapshotUrl]);

  useEffect(() => {
    setSnapFrame(currentFrame);
  }, [currentFrame]);

  useEffect(() => {
    if (analysisMode === '3D') {
      setReportMode('3D');
      setPrimaryGraphType('trajectory-3d');
    }
  }, [analysisMode]);

  const activeTrack = useMemo(() => {
    return tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  }, [tracks, selectedTrackId]);

  const is3DActive = reportMode === '3D';

  const summary = useMemo(() => {
    if (!activeTrack) return null;
    return computeTrackSummary(activeTrack, clip.fps, is3DActive);
  }, [activeTrack, clip.fps, is3DActive]);

  // Handle Capture Snapshot from Frame X
  const handleCaptureSnapshotAtFrame = (targetFrame: number) => {
    setSnapFrame(targetFrame);
    onSeekFrame?.(targetFrame);
    setTimeout(() => {
      if (onCaptureSnapshot) {
        const snap = onCaptureSnapshot();
        if (snap) setCurrentVideoSnapUrl(snap);
      }
    }, 120);
  };

  // Handle Apply 3D Calibration Updates
  const handleApply3DEdits = () => {
    if (!onUpdateTriangulation || !triangulation) return;
    const updated: TriangulationConfig = {
      ...triangulation,
      baselineMeters: Number(baselineMeters) || 1.2,
      convergenceAngleDeg: Number(convergenceAngleDeg) || 90,
      method: dltMethod as any,
      meanResidualMeters: (Number(meanResidualToleranceMm) || 2.0) / 1000,
      fpsCam1: Number(cam1Fps) || clip.fps,
      fpsCam2: Number(cam2Fps) || clip.fps,
    };
    onUpdateTriangulation(updated);
    setApplied3DSuccess(true);
    setTimeout(() => setApplied3DSuccess(false), 3000);
  };

  // Helper to generate snapshot preview for any graph type
  const renderGraphPreview = (gType: ReportGraphType): string => {
    if (!activeTrack) return '';
    try {
      if (gType === 'trajectory-3d') {
        const triConfig: TriangulationConfig = triangulation ? {
          ...triangulation,
          baselineMeters,
          convergenceAngleDeg,
          method: dltMethod as any,
        } : {
          method: 'orthogonal-front-side',
          pixelsPerMeterCam1: 500,
          pixelsPerMeterCam2: 500,
          originCam1: { x: 50, y: 240 },
          originCam2: { x: 50, y: 240 },
          baselineMeters,
          convergenceAngleDeg,
          calibrated: true,
          meanResidualMeters: 0.0003,
        };
        return generate3DTrajectoryPlotSnapshot(activeTrack, triConfig, 640, 360, {
          forceZeroOrigin,
          theme,
        });
      } else if (gType === 'accel-time') {
        return generateAccelerationPlotSnapshot(activeTrack, clip, 640, 360, {
          forceZeroOrigin,
          theme,
          customAccentColor,
        });
      } else if (gType === 'velocity-time' || gType === 'vy-time' || gType === 'vx-time') {
        return generateVelocityPlotSnapshot(activeTrack, clip, 640, 360, {
          positiveUpward: velocityPositiveUpward,
          forceZeroOrigin,
          plotComponent: gType === 'vy-time' ? 'vy' : gType === 'vx-time' ? 'vx' : 'resultant',
          theme,
          customAccentColor,
        });
      } else {
        return generateTrajectoryPlotSnapshot(activeTrack, axes, calibration, 640, 360, {
          forceZeroOrigin,
          theme,
        });
      }
    } catch {
      return '';
    }
  };

  // Live Previews of Requested Graphs
  const primaryGraphUrl = useMemo(() => {
    return renderGraphPreview(primaryGraphType);
  }, [activeTrack, axes, calibration, triangulation, primaryGraphType, forceZeroOrigin, velocityPositiveUpward, theme, customAccentColor, baselineMeters, convergenceAngleDeg, dltMethod]);

  const secondaryGraphUrl = useMemo(() => {
    if (secondaryGraphType === 'none') return '';
    return renderGraphPreview(secondaryGraphType);
  }, [activeTrack, axes, calibration, triangulation, secondaryGraphType, forceZeroOrigin, velocityPositiveUpward, theme, customAccentColor, baselineMeters, convergenceAngleDeg, dltMethod]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (!activeTrack) return;
    setIsGenerating(true);
    try {
      const meta: ReportMetadata = {
        investigator: investigator.trim() || 'Field Range Engineer',
        facility: facility.trim() || 'Range Test Cell',
        testRunId: testRunId.trim() || 'RUN-HS-01',
        notes: notes.trim(),
        experimentTitle,
      };

      const customOptions: ReportCustomOptions = {
        theme,
        customAccentColor,
        forceZeroOrigin,
        velocityPositiveUpward,
        primaryGraphType,
        secondaryGraphType,
        videoSnapFrame: snapFrame,
        is3D: is3DActive,
        stereoBaselineMeters: baselineMeters,
        stereoConvergenceDeg: convergenceAngleDeg,
        dltMethod,
        dltResidualMeters: (meanResidualToleranceMm || 2.0) / 1000,
        camera1Name: cam1Name,
        camera2Name: cam2Name,
        camera1Fps: cam1Fps,
        camera2Fps: cam2Fps,
        include3DPlot: is3DActive,
      };

      const updatedTriConfig: TriangulationConfig = triangulation ? {
        ...triangulation,
        baselineMeters,
        convergenceAngleDeg,
        method: dltMethod as any,
        meanResidualMeters: (meanResidualToleranceMm || 2.0) / 1000,
        fpsCam1: cam1Fps,
        fpsCam2: cam2Fps,
      } : {
        method: 'orthogonal-front-side',
        pixelsPerMeterCam1: 500,
        pixelsPerMeterCam2: 500,
        originCam1: { x: 50, y: 240 },
        originCam2: { x: 50, y: 240 },
        baselineMeters,
        convergenceAngleDeg,
        calibrated: true,
        meanResidualMeters: 0.0003,
      };

      await generateExperimentPdfReport({
        experimentTitle,
        track: activeTrack,
        allTracks: tracks,
        clip,
        calibration,
        axes,
        videoSnapshotUrl: currentVideoSnapUrl,
        metadata: meta,
        customOptions,
        triangulation: updatedTriConfig,
      });
    } catch (err) {
      console.error('Failed to generate PDF report:', err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-report-modal-title"
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-2 sm:p-4 backdrop-blur-xs select-none"
    >
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] max-w-4xl w-full max-h-[95vh] flex flex-col text-black shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4d0c8] border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-[3px] bg-[#1e3a5f] text-white">
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 id="pdf-report-modal-title" className="font-bold text-sm text-black flex items-center gap-2">
                <span>Experiment Field Report (PDF) - Officer Custom Dossier Builder</span>
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-400 rounded text-[9px] font-bold">
                  LOCAL AIR-GAPPED EXPORT
                </span>
              </h3>
              <p className="text-[11px] text-[#444444]">
                Flexible kinematics reporting with (0,0) baseline standards, +Vy upward velocity rates, custom graph addition, video snap from frame X, and 2D/3D editing.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Selector & Sub-Toolbar */}
        <div className="bg-[#e4e1d9] border-b border-[#808080] px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-black text-[11px]">Analysis Coverage:</span>
            <div className="flex bg-[#d4d0c8] p-0.5 rounded-[3px] border border-[#808080]">
              <button
                type="button"
                onClick={() => {
                  setReportMode('2D');
                  if (primaryGraphType === 'trajectory-3d') setPrimaryGraphType('trajectory-yx');
                }}
                className={`px-2.5 py-0.5 text-xs font-bold rounded-[2px] transition-colors ${
                  reportMode === '2D' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#c0bcb4]'
                }`}
              >
                2D Single-Camera
              </button>
              <button
                type="button"
                onClick={() => {
                  setReportMode('3D');
                  setPrimaryGraphType('trajectory-3d');
                }}
                className={`px-2.5 py-0.5 text-xs font-bold rounded-[2px] transition-colors ${
                  reportMode === '3D' ? 'bg-[#1e3a5f] text-white' : 'text-black hover:bg-[#c0bcb4]'
                }`}
              >
                3D Stereo Triangulation
              </button>
            </div>
          </div>

          {/* Builder Navigation Tabs */}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('custom-design')}
              className={`px-2 py-1 text-xs font-bold rounded-[2px] border transition-colors ${
                activeTab === 'custom-design'
                  ? 'bg-white border-[#1e3a5f] text-[#1e3a5f] shadow-xs'
                  : 'bg-[#efefef] border-[#808080] text-black hover:bg-white'
              }`}
            >
              <Sliders className="w-3 h-3 inline mr-1 text-[#1e3a5f]" />
              Design &amp; Graphs
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('video-snap')}
              className={`px-2 py-1 text-xs font-bold rounded-[2px] border transition-colors ${
                activeTab === 'video-snap'
                  ? 'bg-white border-[#1e3a5f] text-[#1e3a5f] shadow-xs'
                  : 'bg-[#efefef] border-[#808080] text-black hover:bg-white'
              }`}
            >
              <Camera className="w-3 h-3 inline mr-1 text-emerald-700" />
              Snap Frame X
            </button>

            {is3DActive && (
              <button
                type="button"
                onClick={() => setActiveTab('3d-editor')}
                className={`px-2 py-1 text-xs font-bold rounded-[2px] border transition-colors ${
                  activeTab === '3d-editor'
                    ? 'bg-white border-[#1e3a5f] text-[#1e3a5f] shadow-xs'
                    : 'bg-[#efefef] border-[#808080] text-black hover:bg-white'
                }`}
              >
                <Box className="w-3 h-3 inline mr-1 text-purple-700" />
                3D Edit Option
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-2 py-1 text-xs font-bold rounded-[2px] border transition-colors ${
                activeTab === 'preview'
                  ? 'bg-white border-[#1e3a5f] text-[#1e3a5f] shadow-xs'
                  : 'bg-[#efefef] border-[#808080] text-black hover:bg-white'
              }`}
            >
              <Eye className="w-3 h-3 inline mr-1 text-amber-700" />
              Live Preview
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs bg-[#f4f2ee]">
          {/* Top Options Row: Target Track & Experiment Details */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <div>
              <label className="font-bold text-[11px] text-black block mb-0.5">
                Target Track / Point Mass:
              </label>
              <select
                value={selectedTrackId}
                onChange={(e) => {
                  setSelectedTrackId(e.target.value);
                  onSelectTrack?.(e.target.value);
                }}
                className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-semibold outline-none focus:border-[#1e3a5f]"
              >
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.steps.length} marks, {t.mass} kg)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-[11px] text-black block mb-0.5">
                Field Investigator:
              </label>
              <input
                type="text"
                value={investigator}
                onChange={(e) => setInvestigator(e.target.value)}
                placeholder="Engineer name..."
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black outline-none focus:border-[#1e3a5f]"
              >
              </input>
            </div>

            <div>
              <label className="font-bold text-[11px] text-black block mb-0.5">
                Facility / Range Cell:
              </label>
              <input
                type="text"
                value={facility}
                onChange={(e) => setFacility(e.target.value)}
                placeholder="Range location..."
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black outline-none focus:border-[#1e3a5f]"
              >
              </input>
            </div>

            <div>
              <label className="font-bold text-[11px] text-black block mb-0.5">
                Test Run / Serial ID:
              </label>
              <input
                type="text"
                value={testRunId}
                onChange={(e) => setTestRunId(e.target.value)}
                placeholder="e.g. RUN-HS-01..."
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none focus:border-[#1e3a5f]"
              >
              </input>
            </div>
          </div>

          {/* TAB 1: OFFICER CUSTOM DESIGN & GRAPH FLEXIBILITIES */}
          {activeTab === 'custom-design' && (
            <div className="space-y-3">
              <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-1.5">
                  <span className="font-bold text-xs text-[#1e3a5f] flex items-center gap-1.5">
                    <Target className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Officer Design Standards: Origin (0,0) Baseline &amp; Velocity Direction</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#555555] bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-300 text-emerald-800 font-bold">
                    OFFICER COMPLIANCE
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-0.5">
                  {/* Origin (0,0) Anchor Standard Toggle */}
                  <label className="flex items-start gap-2.5 p-2 bg-[#f8fafc] border border-[#cbd5e1] rounded-[2px] cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={forceZeroOrigin}
                      onChange={(e) => setForceZeroOrigin(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-[#1e3a5f] rounded"
                    />
                    <div>
                      <strong className="text-black text-xs block">
                        Anchor Origin (0,0) on All Graphs (Senior Officer Requirement)
                      </strong>
                      <p className="text-[10.5px] text-[#555555] leading-relaxed mt-0.5">
                        Forces coordinate axes to baseline at (0, 0) with prominent highlighted zero-cross lines X=0, Y=0, and v=0.
                      </p>
                    </div>
                  </label>

                  {/* Velocity Graph Positive Upward Direction Standard Toggle */}
                  <label className="flex items-start gap-2.5 p-2 bg-[#f8fafc] border border-[#cbd5e1] rounded-[2px] cursor-pointer hover:bg-slate-50 transition-colors">
                    <input
                      type="checkbox"
                      checked={velocityPositiveUpward}
                      onChange={(e) => setVelocityPositiveUpward(e.target.checked)}
                      className="mt-0.5 w-4 h-4 text-[#1e3a5f] rounded"
                    />
                    <div>
                      <strong className="text-black text-xs block">
                        Vertical Velocity in Positive Upward Direction (+Vy Ascent ▲)
                      </strong>
                      <p className="text-[10.5px] text-[#555555] leading-relaxed mt-0.5">
                        Inverts raw sensor screen coordinates so vertical ascent and launch climb plot upward as positive (+Vy) rate.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Graph Flexibility & Requested Graph Addition */}
              <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-1.5">
                  <span className="font-bold text-xs text-[#1e3a5f] flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-[#1e3a5f]" />
                    <span>Requested Graph Flexibility (Primary &amp; Additional Graph Selection)</span>
                  </span>
                  <span className="text-[10px] text-[#555555]">
                    Flexibility to add requested graph requested by senior officers
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-[11px] text-black block mb-1">
                      Primary Graph (Figure 2 on Page 1):
                    </label>
                    <select
                      value={primaryGraphType}
                      onChange={(e) => setPrimaryGraphType(e.target.value as ReportGraphType)}
                      className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1.5 text-xs text-black font-semibold outline-none focus:border-[#1e3a5f]"
                    >
                      <option value="trajectory-yx">Trajectory Plot (Y vs X) [Origin (0,0) Baseline]</option>
                      <option value="vy-time">Vertical Velocity (Vy vs Time) [Positive Upward]</option>
                      <option value="velocity-time">Resultant Speed Magnitude (v vs Time)</option>
                      <option value="vx-time">Horizontal Velocity (Vx vs Time)</option>
                      <option value="accel-time">Total Acceleration (a vs Time)</option>
                      {is3DActive && (
                        <option value="trajectory-3d">3D Spatial Trajectory [X, Y, Z] (Altitude Z Upward)</option>
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-[11px] text-black block mb-1">
                      Add Requested Additional Graph (Creates Detailed Waveforms Page):
                    </label>
                    <select
                      value={secondaryGraphType}
                      onChange={(e) => setSecondaryGraphType(e.target.value as any)}
                      className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1.5 text-xs text-black font-semibold outline-none focus:border-[#1e3a5f]"
                    >
                      <option value="none">-- None (Single Graph Report) --</option>
                      <option value="vy-time">Vertical Velocity (Vy vs Time) [Positive Upward]</option>
                      <option value="velocity-time">Resultant Speed Magnitude (v vs Time)</option>
                      <option value="vx-time">Horizontal Velocity (Vx vs Time)</option>
                      <option value="accel-time">Total Acceleration (a vs Time)</option>
                      <option value="trajectory-yx">Trajectory Plot (Y vs X)</option>
                      {is3DActive && (
                        <option value="trajectory-3d">3D Spatial Trajectory [X, Y, Z]</option>
                      )}
                    </select>
                  </div>
                </div>

                {/* Theme & Coloring Flexibility */}
                <div className="pt-2 border-t border-[#e5e7eb] grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                  <div>
                    <label className="font-bold text-[11px] text-black block mb-1 flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-[#1e3a5f]" />
                      <span>Report Dossier Theme &amp; Color Palette:</span>
                    </label>
                    <select
                      value={theme}
                      onChange={(e) => setTheme(e.target.value as ReportTheme)}
                      className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-semibold outline-none focus:border-[#1e3a5f]"
                    >
                      <option value="defense-navy">Defense Navy &amp; Gold (Standard Officer Dossier)</option>
                      <option value="stealth-dark">Tactical Stealth (Dark Slate &amp; Emerald)</option>
                      <option value="lab-classic">Classic Lab (Crisp White &amp; Blue)</option>
                      <option value="monochrome">Technical Monochrome (Official B&amp;W Printing)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-[11px] text-black block mb-1">
                      Trajectory Line &amp; Marker Accent Color:
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={customAccentColor}
                        onChange={(e) => setCustomAccentColor(e.target.value)}
                        className="w-8 h-7 rounded border border-[#808080] cursor-pointer p-0.5 bg-white"
                        title="Pick custom accent color"
                      />
                      <div className="flex items-center gap-1 text-[11px]">
                        {['#0284c7', '#10b981', '#ef4444', '#8b5cf6', '#f59e0b', '#0f172a'].map((c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCustomAccentColor(c)}
                            style={{ backgroundColor: c }}
                            className={`w-5 h-5 rounded-[2px] border transition-transform ${
                              customAccentColor === c ? 'scale-115 border-white ring-1 ring-black' : 'border-[#808080]'
                            }`}
                            title={`Select ${c}`}
                          />
                        ))}
                      </div>
                      <span className="font-mono text-[10px] text-[#555555] ml-auto">{customAccentColor}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: VIDEO SNAPSHOT FROM FRAME X SELECTOR */}
          {activeTab === 'video-snap' && (
            <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-1.5">
                <span className="font-bold text-xs text-[#1e3a5f] flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Video Snapshot Selection (Snap from Frame X)</span>
                </span>
                <span className="text-[10px] font-mono text-[#555555]">
                  Frame {snapFrame} of {clip.totalFrames - 1} &bull; t = {formatHighSpeedTime(snapFrame * (1 / clip.fps), clip.fps, clip.timeUnit)}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="font-bold text-xs text-black shrink-0">
                    Snap Frame Number (X):
                  </label>
                  <input
                    type="number"
                    min={clip.startFrame}
                    max={clip.endFrame}
                    value={snapFrame}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (!isNaN(val)) handleCaptureSnapshotAtFrame(val);
                    }}
                    className="w-20 bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-bold font-mono text-center outline-none focus:border-[#1e3a5f]"
                  />
                  <input
                    type="range"
                    min={clip.startFrame}
                    max={clip.endFrame}
                    value={snapFrame}
                    onChange={(e) => handleCaptureSnapshotAtFrame(parseInt(e.target.value, 10))}
                    className="flex-1 cursor-pointer accent-[#1e3a5f]"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCaptureSnapshotAtFrame(snapFrame)}
                    className="px-2.5 py-1 bg-[#1e3a5f] hover:bg-[#2a4d7d] text-white text-xs font-bold rounded-[2px] flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Capture Snapshot at Frame {snapFrame}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCaptureSnapshotAtFrame(currentFrame)}
                    className="px-2.5 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black text-xs font-semibold rounded-[2px] flex items-center gap-1 cursor-pointer"
                  >
                    <Camera className="w-3 h-3 text-[#1e3a5f]" />
                    <span>Use Current Player Frame (F{currentFrame})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCaptureSnapshotAtFrame(clip.startFrame)}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-[#808080] text-black text-[11px] rounded-[2px] cursor-pointer"
                  >
                    Start Frame ({clip.startFrame})
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCaptureSnapshotAtFrame(Math.round((clip.startFrame + clip.endFrame) / 2))}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-[#808080] text-black text-[11px] rounded-[2px] cursor-pointer"
                  >
                    Midpoint Frame
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCaptureSnapshotAtFrame(clip.endFrame)}
                    className="px-2 py-1 bg-white hover:bg-slate-50 border border-[#808080] text-black text-[11px] rounded-[2px] cursor-pointer"
                  >
                    End Frame ({clip.endFrame})
                  </button>
                </div>
              </div>

              {/* Snap Preview Box */}
              <div className="relative bg-[#111111] border border-[#808080] rounded-[2px] aspect-video max-h-60 mx-auto flex items-center justify-center overflow-hidden">
                {currentVideoSnapUrl ? (
                  <img
                    src={currentVideoSnapUrl}
                    alt={`Video snapshot frame ${snapFrame}`}
                    className="w-full h-full object-contain block"
                  />
                ) : (
                  <div className="text-center text-slate-400 p-4">
                    <Camera className="w-8 h-8 mx-auto mb-1 text-slate-500 animate-pulse" />
                    <span className="text-xs">Click &quot;Capture Snapshot&quot; to capture frame {snapFrame}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: 3D STEREO ANALYSIS EDIT OPTION */}
          {activeTab === '3d-editor' && is3DActive && (
            <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-1.5">
                <span className="font-bold text-xs text-purple-900 flex items-center gap-1.5">
                  <Box className="w-3.5 h-3.5 text-purple-700" />
                  <span>3D Stereo Spatial Calibration &amp; Modeling (Edit Option)</span>
                </span>
                <span className="text-[10px] text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-300 font-bold">
                  3D REPORT EDIT OPTION ACTIVE
                </span>
              </div>

              <p className="text-[11px] text-[#555555] leading-relaxed">
                Senior officers requesting custom 3D kinematics analysis have direct flexibility to adjust stereoscopic baseline distance, camera convergence angles, triangulation algorithms, and camera frame rate specifications directly within the report:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    Stereo Camera Baseline (meters):
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={baselineMeters}
                    onChange={(e) => setBaselineMeters(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-bold font-mono outline-none focus:border-purple-700"
                  />
                  <span className="text-[10px] text-[#666666]">Physical separation between Cam 1 &amp; Cam 2</span>
                </div>

                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    Optical Convergence Angle (°):
                  </label>
                  <input
                    type="number"
                    step="1"
                    value={convergenceAngleDeg}
                    onChange={(e) => setConvergenceAngleDeg(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-bold font-mono outline-none focus:border-purple-700"
                  />
                  <span className="text-[10px] text-[#666666]">90° for orthogonal, 30°-60° for convergence</span>
                </div>

                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    DLT Triangulation Method:
                  </label>
                  <select
                    value={dltMethod}
                    onChange={(e) => setDltMethod(e.target.value)}
                    className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-semibold outline-none focus:border-purple-700"
                  >
                    <option value="orthogonal-front-side">Orthogonal Front-Side (90° Dual Plane)</option>
                    <option value="dlt-11-parameter">Direct Linear Transformation (11-Param DLT)</option>
                    <option value="stereo-coplanar">Stereo Coplanar Epipolar Rectification</option>
                  </select>
                  <span className="text-[10px] text-[#666666]">Reconstruction projection matrix</span>
                </div>

                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    Primary Camera 1 (Front View):
                  </label>
                  <input
                    type="text"
                    value={cam1Name}
                    onChange={(e) => setCam1Name(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black outline-none focus:border-purple-700"
                  />
                </div>

                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    Secondary Camera 2 (Orthogonal):
                  </label>
                  <input
                    type="text"
                    value={cam2Name}
                    onChange={(e) => setCam2Name(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black outline-none focus:border-purple-700"
                  />
                </div>

                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    DLT Mean Residual Tolerance (mm):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={meanResidualToleranceMm}
                    onChange={(e) => setMeanResidualToleranceMm(parseFloat(e.target.value) || 0)}
                    className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none focus:border-purple-700"
                  />
                  <span className="text-[10px] text-[#666666]">Allowable optical intersection residual</span>
                </div>

                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    Cam 1 Frame Rate (fps):
                  </label>
                  <input
                    type="number"
                    value={cam1Fps}
                    onChange={(e) => setCam1Fps(parseInt(e.target.value, 10) || 30)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none focus:border-purple-700"
                  />
                </div>

                <div>
                  <label className="font-bold text-[11px] text-black block mb-0.5">
                    Cam 2 Frame Rate (fps):
                  </label>
                  <input
                    type="number"
                    value={cam2Fps}
                    onChange={(e) => setCam2Fps(parseInt(e.target.value, 10) || 30)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none focus:border-purple-700"
                  />
                </div>

                <div className="flex flex-col justify-end">
                  <button
                    type="button"
                    onClick={handleApply3DEdits}
                    className="w-full px-3 py-1.5 bg-purple-700 hover:bg-purple-800 active:bg-purple-900 text-white font-bold text-xs rounded-[2px] transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Apply 3D Calibration Updates</span>
                  </button>
                  {applied3DSuccess && (
                    <span className="text-[10px] text-emerald-700 font-bold mt-1 text-center animate-pulse">
                      3D Stereo Parameters Applied!
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: LIVE PREVIEWS OF FIGURES (ALWAYS VISIBLE OR DEDICATED) */}
          <div className="space-y-3">
            {/* Key Telemetry Summary Preview Dashboard */}
            {summary ? (
              <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs space-y-1.5">
                <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-1">
                  <span className="font-bold text-xs text-[#1e3a5f] flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{is3DActive ? '3D Spatial Telemetry Matrix Preview' : 'Kinematics Telemetry Matrix Preview'}</span>
                  </span>
                  <span className="text-[10px] font-mono text-[#555555]">
                    {clip.cameraModel || 'Photron FASTCAM'} @ {clip.fps.toLocaleString()} fps &bull; {is3DActive ? 'Stereo 3D Mode' : '2D Single Mode'}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-2 bg-[#f0f9ff] border border-[#bae6fd] rounded-[2px]">
                    <span className="text-[10px] text-[#0369a1] font-bold block">
                      {is3DActive ? 'RESULTANT SPEED (v_3d)' : 'MEAN VELOCITY (v_mean)'}
                    </span>
                    <strong className="text-base text-[#0284c7] font-mono block leading-tight">
                      {summary.meanVelocity.toFixed(2)} m/s
                    </strong>
                    <span className="text-[9px] text-[#64748b]">
                      Peak: {summary.maxVelocity.toFixed(1)} m/s ({(summary.maxVelocity * 3.6).toFixed(0)} km/h)
                    </span>
                  </div>

                  <div className="p-2 bg-[#fef2f2] border border-[#fecaca] rounded-[2px]">
                    <span className="text-[10px] text-[#b91c1c] font-bold block">
                      {is3DActive ? '3D PEAK G-FORCE' : 'PEAK G-FORCE'}
                    </span>
                    <strong className="text-base text-[#dc2626] font-mono block leading-tight">
                      {summary.maxGForce.toFixed(1)} G
                    </strong>
                    <span className="text-[9px] text-[#64748b]">
                      Peak a: {summary.maxAcceleration.toFixed(0)} m/s²
                    </span>
                  </div>

                  <div className="p-2 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[2px]">
                    <span className="text-[10px] text-[#15803d] font-bold block">
                      {is3DActive ? '3D DISPLACEMENT & ALTITUDE' : 'TOTAL DISPLACEMENT'}
                    </span>
                    <strong className="text-base text-[#16a34a] font-mono block leading-tight">
                      {summary.totalDisplacement.toFixed(3)} m
                    </strong>
                    <span className="text-[9px] text-[#64748b]">
                      {is3DActive
                        ? `Z-Alt: ${(summary.maxAltitudeZ ?? 0).toFixed(2)}m • Slant: ${(summary.slantRange ?? 0).toFixed(2)}m`
                        : `dx: ${summary.displacementX.toFixed(2)}m • dy: ${summary.displacementY.toFixed(2)}m`}
                    </span>
                  </div>

                  <div className="p-2 bg-[#faf5ff] border border-[#e9d5ff] rounded-[2px]">
                    <span className="text-[10px] text-[#7e22ce] font-bold block">TRACKING DURATION</span>
                    <strong className="text-base text-[#9333ea] font-mono block leading-tight">
                      {summary.deltaTime < 0.01
                        ? `${(summary.deltaTime * 1000).toFixed(2)} ms`
                        : `${summary.deltaTime.toFixed(3)} s`}
                    </strong>
                    <span className="text-[9px] text-[#64748b]">
                      {summary.stepCount} marks &bull; E: {summary.kineticEnergy.toFixed(2)} J
                    </span>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Visual Figures Preview (Figure 1: Video Snap, Figure 2: Primary Graph, Figure 3: Secondary Graph) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Figure 1: Video Snap */}
              <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[11px] text-black">
                      Figure 1: Video Snap (Frame {snapFrame})
                    </span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('video-snap')}
                      className="text-[10px] text-[#1e3a5f] hover:underline font-bold"
                    >
                      Change Frame
                    </button>
                  </div>
                  <div className="relative bg-[#111111] border border-[#a0a0a0] rounded-[2px] overflow-hidden aspect-video flex items-center justify-center">
                    {currentVideoSnapUrl ? (
                      <img
                        src={currentVideoSnapUrl}
                        alt="Video frame snapshot"
                        className="w-full h-full object-contain block"
                      />
                    ) : (
                      <span className="text-xs text-[#888888] italic">Video Frame Ready</span>
                    )}
                  </div>
                </div>
                <span className="text-[9.5px] text-[#555555] mt-1.5 block">
                  Frame {snapFrame} &bull; t = {formatHighSpeedTime(snapFrame * (1 / clip.fps), clip.fps, clip.timeUnit)}
                </span>
              </div>

              {/* Figure 2: Primary Requested Graph */}
              <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[11px] text-black truncate">
                      Figure 2: {primaryGraphType === 'trajectory-3d' ? '3D Spatial Trajectory' : primaryGraphType === 'vy-time' ? 'Vertical Velocity (+Vy Upward)' : 'Primary Graph'}
                    </span>
                    <span className="text-[9.5px] text-emerald-800 bg-emerald-50 px-1 rounded font-bold shrink-0">
                      {forceZeroOrigin ? '(0,0) Baseline' : 'Auto Range'}
                    </span>
                  </div>
                  <div className="relative bg-[#0f172a] border border-[#a0a0a0] rounded-[2px] overflow-hidden aspect-video flex items-center justify-center">
                    {primaryGraphUrl ? (
                      <img
                        src={primaryGraphUrl}
                        alt="Primary graph snapshot"
                        className="w-full h-full object-contain block"
                      />
                    ) : (
                      <span className="text-xs text-[#888888] italic">Graph Preview Ready</span>
                    )}
                  </div>
                </div>
                <span className="text-[9.5px] text-[#555555] mt-1.5 block">
                  {forceZeroOrigin ? '(0,0) baseline standard anchored' : 'Dynamic scale'} &bull; {velocityPositiveUpward ? '+Vy upward' : 'Standard coordinates'}
                </span>
              </div>
            </div>

            {/* Figure 3: Secondary Requested Graph (if selected) */}
            {secondaryGraphType !== 'none' && (
              <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-[11px] text-black">
                    Figure 3: Additional Requested Graph ({secondaryGraphType === 'vy-time' ? 'Vertical Velocity Vy vs Time (+Vy Upward)' : secondaryGraphType.toUpperCase()})
                  </span>
                  <span className="text-[10px] text-purple-800 bg-purple-50 px-1.5 py-0.2 rounded font-bold">
                    OFFICER REQUESTED ADD-ON
                  </span>
                </div>
                <div className="relative bg-[#0f172a] border border-[#a0a0a0] rounded-[2px] overflow-hidden aspect-[21/9] max-h-52 flex items-center justify-center">
                  {secondaryGraphUrl ? (
                    <img
                      src={secondaryGraphUrl}
                      alt="Secondary requested graph snapshot"
                      className="w-full h-full object-contain block"
                    />
                  ) : (
                    <span className="text-xs text-[#888888] italic">Secondary Graph Preview Ready</span>
                  )}
                </div>
                <span className="text-[9.5px] text-[#555555] mt-1 block">
                  Embedded on dedicated Page 2 Waveforms Dossier with full width resolution and zero-baseline.
                </span>
              </div>
            )}
          </div>

          {/* Observations & Field Clearance Notes */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs space-y-1">
            <label className="font-bold text-[11px] text-black block">
              Field Range Observations &amp; Verification Notes:
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] p-1.5 text-xs text-black outline-none focus:border-[#1e3a5f] resize-none"
              placeholder="Notes on projectile impact, gelatin penetration, supersonic shockwave, or range atmospheric conditions..."
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-[#d4d0c8] border-t border-[#808080] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-[#444444]">
            <Shield className="w-3.5 h-3.5 text-emerald-700" />
            <span>100% In-Memory Generation &bull; Air-Gapped Safe &bull; {secondaryGraphType !== 'none' ? '3-Page Technical Dossier' : '2-Page Technical Dossier'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black font-semibold text-xs rounded-[2px] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={isGenerating}
              className="px-4 py-1.5 bg-[#1e3a5f] hover:bg-[#152843] active:bg-[#0f1d30] text-white font-bold text-xs rounded-[2px] transition-all flex items-center gap-1.5 shadow-sm border border-[#0f1d30] cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{isGenerating ? 'Compiling Dossier...' : `Download ${is3DActive ? '3D' : '2D'} Field Report (PDF)`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
