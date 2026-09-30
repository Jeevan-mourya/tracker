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
} from 'lucide-react';
import { Track, Calibration, CoordinateAxes, ClipSettings } from '../types';
import {
  computeTrackSummary,
  generateTrajectoryPlotSnapshot,
  generateExperimentPdfReport,
  ReportMetadata,
} from '../utils/generatePdfReport';

interface ExperimentReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  experimentTitle: string;
  tracks: Track[];
  activeTrackId: string;
  clip: ClipSettings;
  calibration: Calibration;
  axes: CoordinateAxes;
  videoSnapshotUrl: string | null;
}

export const ExperimentReportModal: React.FC<ExperimentReportModalProps> = ({
  isOpen,
  onClose,
  experimentTitle,
  tracks,
  activeTrackId,
  clip,
  calibration,
  axes,
  videoSnapshotUrl,
}) => {
  const [selectedTrackId, setSelectedTrackId] = useState<string>(activeTrackId);
  const [investigator, setInvestigator] = useState<string>('Field Range Engineer');
  const [facility, setFacility] = useState<string>('Range Test Cell A / Defense Ballistics');
  const [testRunId, setTestRunId] = useState<string>('RUN-HS-01');
  const [notes, setNotes] = useState<string>(
    'Optical high-speed trajectory verified. Sub-pixel regression applied. Zero anomalous coordinate deviations observed.'
  );
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  useEffect(() => {
    if (activeTrackId) setSelectedTrackId(activeTrackId);
  }, [activeTrackId]);

  const activeTrack = useMemo(() => {
    return tracks.find((t) => t.id === selectedTrackId) || tracks[0];
  }, [tracks, selectedTrackId]);

  const summary = useMemo(() => {
    if (!activeTrack) return null;
    return computeTrackSummary(activeTrack, clip.fps);
  }, [activeTrack, clip.fps]);

  // Generate Trajectory Plot preview
  const trajectoryPlotUrl = useMemo(() => {
    if (!activeTrack) return '';
    try {
      return generateTrajectoryPlotSnapshot(activeTrack, axes, calibration, 640, 360);
    } catch {
      return '';
    }
  }, [activeTrack, axes, calibration]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    if (!activeTrack) return;
    setIsGenerating(true);
    try {
      const meta: ReportMetadata = {
        investigator: investigator.trim() || 'Field Range Engineer',
        facility: facility.trim() || 'Range Test Cell',
        testRunId: testRunId.trim() || 'RUN-01',
        notes: notes.trim(),
        experimentTitle,
      };

      await generateExperimentPdfReport({
        experimentTitle,
        track: activeTrack,
        allTracks: tracks,
        clip,
        calibration,
        axes,
        videoSnapshotUrl,
        metadata: meta,
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
      className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-3 sm:p-5 backdrop-blur-[2px] select-none"
    >
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] max-w-4xl w-full max-h-[94vh] flex flex-col text-black shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4d0c8] border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-[3px] bg-[#1e3a5f] text-white">
              <FileText className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 id="pdf-report-modal-title" className="font-bold text-sm text-black flex items-center gap-2">
                <span>Experiment Field Report (PDF)</span>
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-400 rounded text-[9px] font-bold">
                  LOCAL AIR-GAPPED EXPORT
                </span>
              </h3>
              <p className="text-[11px] text-[#444444]">
                Automated technical dossier with telemetry dashboard, video analysis snaps, and static trajectory plot
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

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs bg-[#f4f2ee]">
          {/* Top Options Row: Target Track & Experiment Details */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="font-bold text-[11px] text-black block mb-1">
                Target Track / Point Mass:
              </label>
              <select
                value={selectedTrackId}
                onChange={(e) => setSelectedTrackId(e.target.value)}
                className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-semibold outline-none focus:border-[#1e3a5f]"
              >
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.steps.length} steps, {t.mass} kg)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="font-bold text-[11px] text-black block mb-1">
                Field Investigator / Engineer:
              </label>
              <input
                type="text"
                value={investigator}
                onChange={(e) => setInvestigator(e.target.value)}
                placeholder="Engineer name..."
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black outline-none focus:border-[#1e3a5f]"
              />
            </div>

            <div>
              <label className="font-bold text-[11px] text-black block mb-1">
                Test Run / Serial ID:
              </label>
              <input
                type="text"
                value={testRunId}
                onChange={(e) => setTestRunId(e.target.value)}
                placeholder="e.g. RUN-HS-01..."
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none focus:border-[#1e3a5f]"
              />
            </div>
          </div>

          {/* Key Telemetry Summary Preview Dashboard */}
          {summary ? (
            <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-xs space-y-2">
              <div className="flex items-center justify-between border-b border-[#e5e7eb] pb-1.5">
                <span className="font-bold text-xs text-[#1e3a5f] flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Computed Kinematics Results &amp; Tracked Values Preview</span>
                </span>
                <span className="text-[10px] font-mono text-[#555555]">
                  Camera: {clip.cameraModel || 'Photron FASTCAM'} @ {clip.fps.toLocaleString()} fps
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div className="p-2 bg-[#f0f9ff] border border-[#bae6fd] rounded-[2px]">
                  <span className="text-[10px] text-[#0369a1] font-bold block">MEAN VELOCITY</span>
                  <strong className="text-base text-[#0284c7] font-mono block leading-tight">
                    {summary.meanVelocity.toFixed(2)} m/s
                  </strong>
                  <span className="text-[9px] text-[#64748b]">
                    Peak: {summary.maxVelocity.toFixed(1)} m/s ({(summary.maxVelocity * 3.6).toFixed(0)} km/h)
                  </span>
                </div>

                <div className="p-2 bg-[#fef2f2] border border-[#fecaca] rounded-[2px]">
                  <span className="text-[10px] text-[#b91c1c] font-bold block">PEAK G-FORCE</span>
                  <strong className="text-base text-[#dc2626] font-mono block leading-tight">
                    {summary.maxGForce.toFixed(1)} G
                  </strong>
                  <span className="text-[9px] text-[#64748b]">
                    Peak Accel: {summary.maxAcceleration.toFixed(0)} m/s²
                  </span>
                </div>

                <div className="p-2 bg-[#f0fdf4] border border-[#bbf7d0] rounded-[2px]">
                  <span className="text-[10px] text-[#15803d] font-bold block">TOTAL DISPLACEMENT</span>
                  <strong className="text-base text-[#16a34a] font-mono block leading-tight">
                    {summary.totalDisplacement.toFixed(3)} m
                  </strong>
                  <span className="text-[9px] text-[#64748b]">
                    dx: {summary.displacementX.toFixed(2)}m &bull; dy: {summary.displacementY.toFixed(2)}m
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
                    Energy: {summary.kineticEnergy.toFixed(2)} J &bull; {summary.stepCount} steps
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-400 rounded text-center text-xs text-amber-900">
              No points tracked on this track yet. Mark points on the video stage to include kinematics.
            </div>
          )}

          {/* Visual Figures Preview (Video Snap & Trajectory Plot Snap) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Figure 1: Video Frame Overlay Snap */}
            <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs flex flex-col justify-between">
              <div>
                <span className="font-bold text-[11px] text-black block mb-1">
                  Figure 1: Video Analysis Overlay Snapshot
                </span>
                <div className="relative bg-[#111111] border border-[#a0a0a0] rounded-[2px] overflow-hidden aspect-video flex items-center justify-center">
                  {videoSnapshotUrl ? (
                    <img
                      src={videoSnapshotUrl}
                      alt="Video analysis frame overlay snapshot"
                      className="w-full h-full object-contain block"
                    />
                  ) : (
                    <span className="text-xs text-[#888888] italic">Video Frame Snapshot Ready</span>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-[#555555] mt-1.5 block">
                Includes underlying video frame with coordinate axes origin, crosshairs, and marker overlays.
              </span>
            </div>

            {/* Figure 2: Static Trajectory Plot Snap */}
            <div className="bg-white border border-[#808080] rounded-[3px] p-2.5 shadow-xs flex flex-col justify-between">
              <div>
                <span className="font-bold text-[11px] text-black block mb-1">
                  Figure 2: Field Trajectory Plot Snapshot (Y vs X)
                </span>
                <div className="relative bg-[#0f172a] border border-[#a0a0a0] rounded-[2px] overflow-hidden aspect-video flex items-center justify-center">
                  {trajectoryPlotUrl ? (
                    <img
                      src={trajectoryPlotUrl}
                      alt="Static trajectory plot snapshot for field analysis"
                      className="w-full h-full object-contain block"
                    />
                  ) : (
                    <span className="text-xs text-[#888888] italic">Trajectory Plot Ready</span>
                  )}
                </div>
              </div>
              <span className="text-[10px] text-[#555555] mt-1.5 block">
                Static flight path graph with grid coordinates, velocity direction vectors, and start/end milestones.
              </span>
            </div>
          </div>

          {/* Observations & Field Clearance Notes */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-xs space-y-1.5">
            <label className="font-bold text-[11px] text-black block">
              Field Range Observations &amp; Verification Notes:
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-[#f8f9fa] border border-[#808080] rounded-[2px] p-2 text-xs text-black outline-none focus:border-[#1e3a5f] resize-none"
              placeholder="Notes on projectile impact, gelatin penetration, supersonic shockwave, or range atmospheric conditions..."
            />
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-2.5 bg-[#d4d0c8] border-t border-[#808080] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-[11px] text-[#444444]">
            <Shield className="w-3.5 h-3.5 text-emerald-700" />
            <span>100% In-Memory Generation &bull; Air-Gapped Safe</span>
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
              <span>{isGenerating ? 'Generating PDF...' : 'Download Field Report (PDF)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
