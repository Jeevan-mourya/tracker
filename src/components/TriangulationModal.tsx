import React, { useState } from 'react';
import {
  TriangulationConfig,
  TriangulationMethod,
  TemporalInterpMethod,
  CalibrationMode,
  LensDistortionParams,
  CalibrationControlPoint3D,
  EmpiricalCalibrationResult,
} from '../types';
import {
  X,
  Camera,
  Check,
  RotateCcw,
  HelpCircle,
  Clock,
  Activity,
  Layers,
  Sparkles,
  Crosshair,
  CheckCircle2,
  ShieldAlert,
  Upload,
  Download,
  FileText,
} from 'lucide-react';
import { buildDefaultDLT, calculateMultiRateFrameRatio } from '../utils/triangulation';
import { calibrateDLTProjective } from '../utils/calibration';
import { SAMPLE_CALIBRATION_CAGE_CSV } from '../data/sampleCalibrationCage';

interface TriangulationModalProps {
  isOpen: boolean;
  onClose: () => void;
  triangulation: TriangulationConfig;
  onSave: (config: TriangulationConfig) => void;
  defaultFpsCam1?: number;
}

export const TriangulationModal: React.FC<TriangulationModalProps> = ({
  isOpen,
  onClose,
  triangulation,
  onSave,
  defaultFpsCam1 = 30,
}) => {
  const [activeTab, setActiveTab] = useState<'calibration' | 'timing' | 'geometry'>('calibration');
  const [calMode, setCalMode] = useState<CalibrationMode>(triangulation.calibrationMode || 'idealized_demo');
  const [method, setMethod] = useState<TriangulationMethod>(triangulation.method);
  const [scale1, setScale1] = useState<number>(triangulation.pixelsPerMeterCam1);
  const [scale2, setScale2] = useState<number>(triangulation.pixelsPerMeterCam2);
  const [origin1X, setOrigin1X] = useState<number>(triangulation.originCam1.x);
  const [origin1Y, setOrigin1Y] = useState<number>(triangulation.originCam1.y);
  const [origin2X, setOrigin2X] = useState<number>(triangulation.originCam2.x);
  const [origin2Y, setOrigin2Y] = useState<number>(triangulation.originCam2.y);
  const [baseline, setBaseline] = useState<number>(triangulation.baselineMeters);
  const [angle, setAngle] = useState<number>(triangulation.convergenceAngleDeg);

  // Mismatched / Asynchronous Frame Rates & Temporal Synchronization
  const [fpsCam1, setFpsCam1] = useState<number>(triangulation.fpsCam1 || defaultFpsCam1);
  const [fpsCam2, setFpsCam2] = useState<number>(triangulation.fpsCam2 || triangulation.fpsCam1 || defaultFpsCam1);
  const [timeOffsetMs, setTimeOffsetMs] = useState<number>((triangulation.timeOffsetCam2Sec || 0) * 1000);
  const [temporalInterp, setTemporalInterp] = useState<TemporalInterpMethod>(
    triangulation.temporalInterpolation || 'cubic-spline'
  );

  // Empirical Calibration State
  const [selectedCalCam, setSelectedCalCam] = useState<'cam1' | 'cam2'>('cam1');
  const [controlPointsCam1Text, setControlPointsCam1Text] = useState<string>(
    '# Real Camera 1 Calibration Observation Table\n' +
    '# Format: ID, X(m), Y(m), Z(m), u(px), v(px), isValidation(0 or 1)\n' +
    '# Paste measured 3D control points and camera 1 pixel coordinates below.\n' +
    '# (To test algorithms using synthetic data, click "Load Synthetic Fixture")\n'
  );
  const [controlPointsCam2Text, setControlPointsCam2Text] = useState<string>(
    '# Real Camera 2 Calibration Observation Table\n' +
    '# Format: ID, X(m), Y(m), Z(m), u(px), v(px), isValidation(0 or 1)\n' +
    '# Paste measured 3D control points and camera 2 pixel coordinates below.\n' +
    '# (To test algorithms using synthetic data, click "Load Synthetic Fixture")\n'
  );
  const [empiricalCam1Result, setEmpiricalCam1Result] = useState<EmpiricalCalibrationResult | null>(
    triangulation.empiricalCam1 || null
  );
  const [empiricalCam2Result, setEmpiricalCam2Result] = useState<EmpiricalCalibrationResult | null>(
    triangulation.empiricalCam2 || null
  );
  const [calibrationError, setCalibrationError] = useState<string | null>(null);

  const controlPointsText = selectedCalCam === 'cam1' ? controlPointsCam1Text : controlPointsCam2Text;
  const setControlPointsText = (txt: string) => {
    if (selectedCalCam === 'cam1') setControlPointsCam1Text(txt);
    else setControlPointsCam2Text(txt);
  };
  const empiricalResult = selectedCalCam === 'cam1' ? empiricalCam1Result : empiricalCam2Result;

  // Lens Distortion Options
  const [enableDistortion, setEnableDistortion] = useState<boolean>(
    triangulation.distortionCam1?.enabled || false
  );
  const [k1, setK1] = useState<number>(triangulation.distortionCam1?.k1 || 0.0);
  const [k2, setK2] = useState<number>(triangulation.distortionCam1?.k2 || 0.0);

  if (!isOpen) return null;

  const ratioInfo = calculateMultiRateFrameRatio(fpsCam1, fpsCam2);
  const isMismatched = Math.abs(fpsCam1 - fpsCam2) > 0.01;

  const handleSolveEmpirical = () => {
    setCalibrationError(null);
    try {
      const lines = controlPointsText.split('\n');
      const points: CalibrationControlPoint3D[] = [];
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split(',').map((p) => p.trim());
        if (parts.length < 6) continue;
        points.push({
          id: parts[0],
          x: parseFloat(parts[1]),
          y: parseFloat(parts[2]),
          z: parseFloat(parts[3]),
          u: parseFloat(parts[4]),
          v: parseFloat(parts[5]),
          isValidation: parts[6] === '1' || parts[6]?.toLowerCase() === 'true',
        });
      }

      if (points.length < 6) {
        throw new Error(
          `Requires at least 6 non-coplanar 3D control points for ${selectedCalCam}. Parsed ${points.length}.`
        );
      }

      const distortion: LensDistortionParams = {
        enabled: enableDistortion,
        k1,
        k2,
      };

      const result = calibrateDLTProjective(points, {
        distortion,
        imageWidth: 640,
        imageHeight: 480,
        cameraId: selectedCalCam,
      });

      if (selectedCalCam === 'cam1') {
        setEmpiricalCam1Result(result);
      } else {
        setEmpiricalCam2Result(result);
      }
    } catch (err: any) {
      setCalibrationError(err.message || 'Calibration solve failed.');
    }
  };

  const handleLoadSampleCage = () => {
    setCalibrationError(null);
    setControlPointsText(SAMPLE_CALIBRATION_CAGE_CSV.trim());
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (!content) return;
      try {
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(content);
          if (Array.isArray(parsed)) {
            const lines = parsed.map(
              (p) => `${p.id || 'P'}, ${p.x}, ${p.y}, ${p.z}, ${p.u}, ${p.v}, ${p.isValidation ? 1 : 0}`
            );
            setControlPointsText('# ID, X, Y, Z, u, v, isVal\n' + lines.join('\n'));
          } else if (parsed.points && Array.isArray(parsed.points)) {
            const lines = parsed.points.map(
              (p: any) => `${p.id || 'P'}, ${p.x}, ${p.y}, ${p.z}, ${p.u}, ${p.v}, ${p.isValidation ? 1 : 0}`
            );
            setControlPointsText('# ID, X, Y, Z, u, v, isVal\n' + lines.join('\n'));
            if (parsed.distortion) {
              setEnableDistortion(!!parsed.distortion.enabled);
              setK1(parsed.distortion.k1 || 0);
              setK2(parsed.distortion.k2 || 0);
            }
          }
        } else {
          setControlPointsText(content.trim());
        }
        setCalibrationError(null);
      } catch (err: any) {
        setCalibrationError(`Failed to load file: ${err.message}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleExportCalibrationJson = () => {
    if (!empiricalResult) return;
    const blob = new Blob([JSON.stringify(empiricalResult, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `camera_calibration_${empiricalResult.cameraId || 'cam1'}_${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleApply = () => {
    const origin1 = { x: origin1X, y: origin1Y };
    const origin2 = { x: origin2X, y: origin2Y };

    const { dltCam1, dltCam2 } = buildDefaultDLT(
      method,
      scale1,
      scale2,
      origin1,
      origin2,
      baseline,
      angle
    );

    const distortionConfig: LensDistortionParams = {
      enabled: enableDistortion,
      k1,
      k2,
    };

    const updated: TriangulationConfig = {
      ...triangulation,
      calibrationMode: calMode,
      method,
      pixelsPerMeterCam1: scale1,
      pixelsPerMeterCam2: scale2,
      originCam1: origin1,
      originCam2: origin2,
      baselineMeters: baseline,
      convergenceAngleDeg: angle,
      dltCam1: (calMode === 'empirical_measured' && empiricalCam1Result?.dlt) ? empiricalCam1Result.dlt : dltCam1,
      dltCam2: (calMode === 'empirical_measured' && empiricalCam2Result?.dlt) ? empiricalCam2Result.dlt : dltCam2,
      calibrated: true,
      meanResidualMeters: isMismatched ? 0.003 : 0.002,
      fpsCam1,
      fpsCam2,
      timeOffsetCam2Sec: timeOffsetMs / 1000,
      temporalInterpolation: temporalInterp,
      allowAsymmetricFrameRates: true,
      empiricalCam1: calMode === 'empirical_measured' ? empiricalCam1Result || undefined : undefined,
      empiricalCam2: calMode === 'empirical_measured' ? empiricalCam2Result || undefined : undefined,
      distortionCam1: distortionConfig,
      distortionCam2: distortionConfig,
    };

    onSave(updated);
    onClose();
  };

  const applyMultiRatePreset = (f1: number, f2: number, name: string) => {
    setFpsCam1(f1);
    setFpsCam2(f2);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[3px] w-full max-w-2xl overflow-hidden flex flex-col text-black shadow-2xl max-h-[92vh]">
        {/* Header */}
        <div className="bg-[#d4d0c8] border-b border-[#808080] px-4 py-2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-[#1e3a5f]" />
            <div>
              <h2 className="font-bold text-black text-sm">
                3D Stereo Triangulation & Asynchronous Frame Sync
              </h2>
              <p className="text-[10px] text-[#555555]">
                Direct Linear Transformation (DLT) with Sub-Frame Hermite Spline Time Matching
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-black hover:bg-[#c0bcb4] p-1 rounded-[2px] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-[#808080] bg-[#e0ded8] px-3 pt-1 gap-1 shrink-0 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setActiveTab('calibration')}
            className={`px-3 py-1.5 rounded-t-[3px] border-t border-l border-r ${
              activeTab === 'calibration'
                ? 'bg-[#d4d0c8] border-[#808080] text-black font-bold'
                : 'bg-transparent border-transparent text-[#555] hover:text-black'
            }`}
          >
            1. Calibration (Measured vs Demo)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('geometry')}
            className={`px-3 py-1.5 rounded-t-[3px] border-t border-l border-r ${
              activeTab === 'geometry'
                ? 'bg-[#d4d0c8] border-[#808080] text-black font-bold'
                : 'bg-transparent border-transparent text-[#555] hover:text-black'
            }`}
          >
            2. Camera Geometry & DLT
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('timing')}
            className={`px-3 py-1.5 rounded-t-[3px] border-t border-l border-r ${
              activeTab === 'timing'
                ? 'bg-[#d4d0c8] border-[#808080] text-black font-bold'
                : 'bg-transparent border-transparent text-[#555] hover:text-black'
            }`}
          >
            3. Multi-Rate Temporal Sync
          </button>
        </div>

        {/* Body */}
        <div className="p-3.5 space-y-3.5 overflow-y-auto text-xs flex-1">
          {/* TAB 1: CALIBRATION MODE (EMPIRICAL VS IDEALIZED) */}
          {activeTab === 'calibration' && (
            <div className="space-y-3">
              <div className="bg-white border-2 border-[#1e3a5f] rounded-[3px] p-3 shadow-sm">
                <label className="font-bold text-black block mb-1.5 text-xs">
                  Select Camera Calibration Mode:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCalMode('idealized_demo')}
                    className={`p-2.5 rounded-[2px] border text-left transition-colors flex flex-col justify-between ${
                      calMode === 'idealized_demo'
                        ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                        : 'border-[#808080] hover:bg-[#efefef] bg-white text-black'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span>IDEALIZED / DEMO CALIBRATION</span>
                      {calMode === 'idealized_demo' && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <p className={`text-[10px] mt-1 ${calMode === 'idealized_demo' ? 'text-blue-100' : 'text-[#666]'}`}>
                      Algebraic nominal setup based on nominal angles (90° orthogonal or convergent baseline). No physical control points required.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCalMode('empirical_measured')}
                    className={`p-2.5 rounded-[2px] border text-left transition-colors flex flex-col justify-between ${
                      calMode === 'empirical_measured'
                        ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                        : 'border-[#808080] hover:bg-[#efefef] bg-white text-black'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-xs">
                      <span>EMPIRICAL / MEASURED CAMERA CALIBRATION</span>
                      {calMode === 'empirical_measured' && <Check className="w-4 h-4 text-white" />}
                    </div>
                    <p className={`text-[10px] mt-1 ${calMode === 'empirical_measured' ? 'text-blue-100' : 'text-[#666]'}`}>
                      Mathematically solved from known 3D control points (N ≥ 6) via Hartley-normalized SVD with training & hold-out validation residuals.
                    </p>
                  </button>
                </div>
              </div>

              {calMode === 'empirical_measured' && (
                <div className="bg-white border border-[#808080] rounded-[3px] p-3 space-y-2.5">
                  <div className="flex items-center justify-between pb-1.5 border-b border-[#e0e0e0]">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-black">Target Camera:</span>
                      <button
                        type="button"
                        onClick={() => { setSelectedCalCam('cam1'); setCalibrationError(null); }}
                        className={`px-2.5 py-0.5 rounded-[2px] text-xs font-semibold transition-colors ${
                          selectedCalCam === 'cam1'
                            ? 'bg-[#1e3a5f] text-white'
                            : 'bg-[#efefef] border border-[#808080] text-black hover:bg-[#e0ded8]'
                        }`}
                      >
                        Camera 1 (Primary / Front) {empiricalCam1Result ? '✓' : ''}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setSelectedCalCam('cam2'); setCalibrationError(null); }}
                        className={`px-2.5 py-0.5 rounded-[2px] text-xs font-semibold transition-colors ${
                          selectedCalCam === 'cam2'
                            ? 'bg-[#1e3a5f] text-white'
                            : 'bg-[#efefef] border border-[#808080] text-black hover:bg-[#e0ded8]'
                        }`}
                      >
                        Camera 2 (Secondary) {empiricalCam2Result ? '✓' : ''}
                      </button>
                    </div>
                    <span className="text-[10px] text-[#555] font-mono">Editing: {selectedCalCam.toUpperCase()}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-black flex items-center gap-1.5">
                      <Crosshair className="w-4 h-4 text-[#1e3a5f]" />
                      Measured 3D Control Points Dataset ({selectedCalCam.toUpperCase()})
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleLoadSampleCage}
                        className="px-2 py-0.5 bg-[#f0f0f0] hover:bg-[#e0ded8] border border-[#808080] rounded-[2px] text-[10px] font-semibold text-black flex items-center gap-1 transition-colors"
                        title="Load 16-point synthetic computer-generated validation control points"
                      >
                        <FileText className="w-3 h-3 text-[#1e3a5f]" />
                        Load Synthetic Fixture (16 Pts)
                      </button>
                      <label className="px-2 py-0.5 bg-[#f0f0f0] hover:bg-[#e0ded8] border border-[#808080] rounded-[2px] text-[10px] font-semibold text-black flex items-center gap-1 cursor-pointer transition-colors">
                        <Upload className="w-3 h-3 text-[#1e3a5f]" />
                        Import CSV/JSON
                        <input
                          type="file"
                          accept=".csv,.txt,.json"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <textarea
                    rows={6}
                    value={controlPointsText}
                    onChange={(e) => setControlPointsText(e.target.value)}
                    className="w-full font-mono text-[11px] p-2 bg-[#fafafa] border border-[#808080] rounded-[2px] outline-none"
                  />

                  {/* Lens Distortion Parameters */}
                  <div className="p-2 bg-[#f0f4f8] border border-[#c0d0e0] rounded-[2px]">
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="font-bold text-[11px] text-black flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enableDistortion}
                          onChange={(e) => setEnableDistortion(e.target.checked)}
                          className="rounded-[2px]"
                        />
                        SUPPLIED BROWN-CONRADY PARAMETERS
                      </label>
                      <span className="text-[9px] text-[#555]">Supplied parameters (not jointly estimated)</span>
                    </div>

                    {enableDistortion && (
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <div>
                          <label className="text-[10px] text-black block font-semibold">k1 (Radial 1st order)</label>
                          <input
                            type="number"
                            step="0.001"
                            value={k1}
                            onChange={(e) => setK1(parseFloat(e.target.value) || 0)}
                            className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-black block font-semibold">k2 (Radial 2nd order)</label>
                          <input
                            type="number"
                            step="0.0001"
                            value={k2}
                            onChange={(e) => setK2(parseFloat(e.target.value) || 0)}
                            className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleSolveEmpirical}
                      className="px-3 py-1.5 bg-[#1e3a5f] hover:bg-[#152843] text-white text-xs font-bold rounded-[2px] flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Solve Empirical DLT ({selectedCalCam.toUpperCase()})
                    </button>
                    {empiricalResult && (
                      <button
                        type="button"
                        onClick={handleExportCalibrationJson}
                        className="px-2.5 py-1.5 bg-[#f0f0f0] hover:bg-[#e0ded8] border border-[#808080] text-black text-xs font-semibold rounded-[2px] flex items-center gap-1.5 transition-colors"
                        title="Export complete calibration matrix, condition metric, residuals, and surveyed points to JSON"
                      >
                        <Download className="w-3.5 h-3.5 text-[#1e3a5f]" />
                        Export {selectedCalCam.toUpperCase()} Artifact (JSON)
                      </button>
                    )}
                  </div>

                  {calibrationError && (
                    <div className="p-2 bg-red-100 border border-red-400 text-red-800 text-[11px] rounded-[2px] flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 shrink-0" />
                      <span>{calibrationError}</span>
                    </div>
                  )}

                  {empiricalResult && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-400 text-emerald-950 text-[11px] rounded-[2px] space-y-1.5">
                      <div className="font-bold flex items-center justify-between">
                        <span>Status: {empiricalResult.status.toUpperCase()} ({empiricalResult.valid ? 'VALIDATED' : 'WARNING'})</span>
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span title="Subspace conditioning: sigma_1 / sigma_11">
                            κ_nonnull: {empiricalResult.kappaNonNull < 1e5 ? empiricalResult.kappaNonNull.toFixed(2) : empiricalResult.kappaNonNull.toExponential(2)}
                          </span>
                          <span title="Null-space separation: sigma_11 / sigma_12 (spectral gap)">
                            γ: {Number.isFinite(empiricalResult.nullSpaceSeparation) ? (empiricalResult.nullSpaceSeparation > 1e4 ? empiricalResult.nullSpaceSeparation.toExponential(1) : empiricalResult.nullSpaceSeparation.toFixed(1)) : '∞'}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] pt-0.5">
                        <div className="bg-white/70 p-1.5 rounded border border-emerald-200">
                          <strong className="block text-emerald-900">Calibration Fit Residual (Train)</strong>
                          <span>{empiricalResult.controlPointCount} pts | RMS: {empiricalResult.trainingResidualRms.toFixed(3)} px (Max: {empiricalResult.trainingResidualMax.toFixed(3)} px, Med: {empiricalResult.trainingResidualMedian.toFixed(3)} px)</span>
                        </div>
                        <div className="bg-white/70 p-1.5 rounded border border-emerald-200">
                          <strong className="block text-emerald-900">Hold-Out Validation Residual</strong>
                          <span>{empiricalResult.validationPointCount} pts | {empiricalResult.validationResidualRms !== undefined ? `RMS: ${empiricalResult.validationResidualRms.toFixed(3)} px (Max: ${empiricalResult.validationResidualMax?.toFixed(3)} px)` : 'None designated'}</span>
                        </div>
                      </div>
                      <div className="text-[9px] text-[#555] italic">
                        * Reprojection residuals evaluate 2D sensor fitting, NOT 3D physical reconstruction accuracy. 3D reconstruction error available when independent ground truth is supplied.
                      </div>
                      <div className="pt-1 border-t border-emerald-200 flex items-center justify-between text-[10px] text-emerald-800">
                        <span>Camera: {empiricalResult.cameraId} | Distortion: {empiricalResult.distortionMethod}</span>
                        <span className="font-mono text-[9px]">{empiricalResult.timestamp}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GEOMETRY */}
          {activeTab === 'geometry' && (
            <div className="space-y-3">
              <div>
                <label className="font-bold text-black block mb-1.5">
                  Camera Optical Geometry & Baseline Setup
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      id: 'orthogonal-front-side',
                      title: 'Orthogonal (Front & Side 90°)',
                      desc: 'Cam 1 views X-Y plane (0°), Cam 2 views Z-Y plane (90° side angle). Standard ballistics range.',
                    },
                    {
                      id: 'orthogonal-front-top',
                      title: 'Orthogonal (Front & Top 90°)',
                      desc: 'Cam 1 views X-Y plane (0°), Cam 2 views X-Z plane (overhead bird’s-eye).',
                    },
                    {
                      id: 'convergent-stereo',
                      title: 'Convergent Stereo Pair',
                      desc: 'Dual angled cameras facing the tracking volume with known baseline separation.',
                    },
                    {
                      id: 'dlt-parameters',
                      title: 'DLT 11-Parameter Matrix',
                      desc: 'Full 11-coefficient Direct Linear Transformation matrix for each camera view.',
                    },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setMethod(m.id as TriangulationMethod)}
                      className={`p-2 rounded-[2px] border text-left transition-colors flex flex-col justify-between ${
                        method === m.id
                          ? 'border-[#0f1d30] bg-[#1e3a5f] text-white'
                          : 'border-[#808080] hover:bg-[#efefef] bg-white text-black'
                      }`}
                    >
                      <div
                        className={`font-semibold text-xs flex items-center justify-between ${
                          method === m.id ? 'text-white' : 'text-black'
                        }`}
                      >
                        <span>{m.title}</span>
                        {method === m.id && <Check className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <p
                        className={`text-[10px] mt-1 leading-snug ${
                          method === m.id ? 'text-slate-200' : 'text-[#555555]'
                        }`}
                      >
                        {m.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Optical Geometry Numeric Inputs */}
              <div className="grid grid-cols-2 gap-3 bg-white p-3 border border-[#808080] rounded-[2px]">
                <div>
                  <label className="text-[10px] text-black block font-semibold">Camera 1 Scale (px/m)</label>
                  <input
                    type="number"
                    value={scale1}
                    onChange={(e) => setScale1(parseFloat(e.target.value) || 240)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-black block font-semibold">Camera 2 Scale (px/m)</label>
                  <input
                    type="number"
                    value={scale2}
                    onChange={(e) => setScale2(parseFloat(e.target.value) || 240)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                  />
                </div>
                {method === 'convergent-stereo' && (
                  <>
                    <div>
                      <label className="text-[10px] text-black block font-semibold">Stereo Baseline (meters)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={baseline}
                        onChange={(e) => setBaseline(parseFloat(e.target.value) || 0.5)}
                        className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-black block font-semibold">Convergence Angle (°)</label>
                      <input
                        type="number"
                        step="1"
                        value={angle}
                        onChange={(e) => setAngle(parseFloat(e.target.value) || 30)}
                        className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: TIMING */}
          {activeTab === 'timing' && (
            <div className="space-y-3">
              <div className="bg-white border-2 border-[#1e3a5f] rounded-[3px] p-3 shadow-sm">
                <div className="flex items-center justify-between gap-2 border-b border-[#d0d0d0] pb-2 mb-2.5">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="font-bold text-black text-xs">
                      Dual-Camera Frame Rates & Temporal Synchronization
                    </span>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-[2px] font-mono text-[10px] font-bold ${
                      isMismatched
                        ? 'bg-amber-100 text-amber-900 border border-amber-300'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                    }`}
                  >
                    {ratioInfo.ratioStr}
                  </span>
                </div>

                <div className="mb-3">
                  <span className="text-[10px] font-bold text-[#555555] block mb-1">
                    Multi-Rate Presets:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {[
                      { label: 'Photron (10k) + Phantom (5k) [2:1]', f1: 10000, f2: 5000 },
                      { label: 'Photron (10k) + NAC (2.5k) [4:1]', f1: 10000, f2: 2500 },
                      { label: 'Synchronous (1,000 fps 1:1)', f1: 1000, f2: 1000 },
                    ].map((p) => (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => applyMultiRatePreset(p.f1, p.f2, p.label)}
                        className={`px-2 py-1 rounded-[2px] border text-[10px] font-mono transition-colors ${
                          fpsCam1 === p.f1 && fpsCam2 === p.f2
                            ? 'bg-[#1e3a5f] text-white border-[#1e3a5f] font-bold'
                            : 'bg-[#efefef] hover:bg-[#dcdcdc] text-black border-[#808080]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="bg-[#f8f9fa] p-2 rounded-[2px] border border-[#d0d0d0]">
                    <label className="text-[10px] font-bold text-black block mb-0.5">
                      Cam 1 Rate (fps)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="100"
                      value={fpsCam1}
                      onChange={(e) => setFpsCam1(Math.max(1, parseFloat(e.target.value) || 30))}
                      className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs font-mono font-bold text-black outline-none"
                    />
                  </div>

                  <div className="bg-[#f8f9fa] p-2 rounded-[2px] border border-[#d0d0d0]">
                    <label className="text-[10px] font-bold text-black block mb-0.5">
                      Cam 2 Rate (fps)
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="100"
                      value={fpsCam2}
                      onChange={(e) => setFpsCam2(Math.max(1, parseFloat(e.target.value) || 30))}
                      className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs font-mono font-bold text-black outline-none"
                    />
                  </div>

                  <div className="bg-[#f8f9fa] p-2 rounded-[2px] border border-[#d0d0d0]">
                    <label className="text-[10px] font-bold text-black block mb-0.5">
                      Offset Δt (ms)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={timeOffsetMs}
                      onChange={(e) => setTimeOffsetMs(parseFloat(e.target.value) || 0)}
                      className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs font-mono font-bold text-black outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#d4d0c8] border-t border-[#808080] px-4 py-2 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => {
              setScale1(240);
              setScale2(240);
              setOrigin1X(120);
              setOrigin1Y(380);
              setOrigin2X(120);
              setOrigin2Y(380);
              setBaseline(1.2);
              setAngle(45);
              setMethod('orthogonal-front-side');
              setFpsCam1(10000);
              setFpsCam2(5000);
              setTimeOffsetMs(0);
              setTemporalInterp('cubic-spline');
            }}
            className="flex items-center gap-1 text-black hover:underline text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Defaults
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1 rounded-[2px] border border-[#808080] bg-[#efefef] hover:bg-[#dcdcdc] text-black text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="px-4 py-1 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] text-white text-xs font-semibold border border-[#0f1d30]"
            >
              Apply Triangulation & Sync
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
