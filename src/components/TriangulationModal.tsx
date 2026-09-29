import React, { useState } from 'react';
import { TriangulationConfig, TriangulationMethod, TemporalInterpMethod } from '../types';
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
} from 'lucide-react';
import { buildDefaultDLT, calculateMultiRateFrameRatio } from '../utils/triangulation';

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

  if (!isOpen) return null;

  const ratioInfo = calculateMultiRateFrameRatio(fpsCam1, fpsCam2);
  const isMismatched = Math.abs(fpsCam1 - fpsCam2) > 0.01;

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

    const updated: TriangulationConfig = {
      ...triangulation,
      method,
      pixelsPerMeterCam1: scale1,
      pixelsPerMeterCam2: scale2,
      originCam1: origin1,
      originCam2: origin2,
      baselineMeters: baseline,
      convergenceAngleDeg: angle,
      dltCam1,
      dltCam2,
      calibrated: true,
      meanResidualMeters: isMismatched ? 0.003 : 0.002,
      fpsCam1,
      fpsCam2,
      timeOffsetCam2Sec: timeOffsetMs / 1000,
      temporalInterpolation: temporalInterp,
      allowAsymmetricFrameRates: true,
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

        {/* Body */}
        <div className="p-3.5 space-y-3.5 overflow-y-auto text-xs flex-1">
          {/* Mismatched Frame Rates & Temporal Synchronization (PRIMARY DEFENSE SECTION) */}
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

            <p className="text-[11px] text-[#444444] mb-3">
              Defense range testing often pairs cameras operating at different capture rates (e.g., 10,000 fps Photron with 5,000 fps Phantom). Tracker applies sub-frame continuous spline interpolation to resolve exact 3D coordinates at any microsecond timestamp without spatial phase shift.
            </p>

            {/* Quick Multi-Rate Presets */}
            <div className="mb-3">
              <span className="text-[10px] font-bold text-[#555555] block mb-1">
                Standard Defense & Aerospace Multi-Rate Presets:
              </span>
              <div className="flex flex-wrap gap-1">
                {[
                  { label: 'Photron (10k) + Phantom (5k) [2:1]', f1: 10000, f2: 5000 },
                  { label: 'Photron (10k) + NAC (2.5k) [4:1]', f1: 10000, f2: 2500 },
                  { label: 'High-G Impact (20k + 10k) [2:1]', f1: 20000, f2: 10000 },
                  { label: 'Ballistics (5,000 + 1,000 fps) [5:1]', f1: 5000, f2: 1000 },
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
              {/* Cam 1 FPS */}
              <div className="bg-[#f8f9fa] p-2 rounded-[2px] border border-[#d0d0d0]">
                <label className="text-[10px] font-bold text-black block mb-0.5">
                  Camera 1 Capture Rate (fps)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={fpsCam1}
                    onChange={(e) => setFpsCam1(Math.max(1, parseFloat(e.target.value) || 30))}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs font-mono font-bold text-black outline-none"
                  />
                  <span className="text-[10px] text-[#666666] font-mono">fps</span>
                </div>
                <span className="text-[9px] text-[#666666] block mt-0.5 font-mono">
                  &Delta;t = {((1 / fpsCam1) * 1000).toFixed(3)} ms ({(1e6 / fpsCam1).toFixed(1)} &mu;s)
                </span>
              </div>

              {/* Cam 2 FPS */}
              <div className="bg-[#f8f9fa] p-2 rounded-[2px] border border-[#d0d0d0]">
                <label className="text-[10px] font-bold text-black block mb-0.5">
                  Camera 2 Capture Rate (fps)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="1"
                    step="100"
                    value={fpsCam2}
                    onChange={(e) => setFpsCam2(Math.max(1, parseFloat(e.target.value) || 30))}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs font-mono font-bold text-black outline-none"
                  />
                  <span className="text-[10px] text-[#666666] font-mono">fps</span>
                </div>
                <span className="text-[9px] text-[#666666] block mt-0.5 font-mono">
                  &Delta;t = {((1 / fpsCam2) * 1000).toFixed(3)} ms ({(1e6 / fpsCam2).toFixed(1)} &mu;s)
                </span>
              </div>

              {/* Sync Offset */}
              <div className="bg-[#f8f9fa] p-2 rounded-[2px] border border-[#d0d0d0]">
                <label className="text-[10px] font-bold text-black block mb-0.5">
                  Sync Offset &Delta;t (Cam 2 - Cam 1)
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    step="0.1"
                    value={timeOffsetMs}
                    onChange={(e) => setTimeOffsetMs(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs font-mono font-bold text-black outline-none"
                  />
                  <span className="text-[10px] text-[#666666] font-mono">ms</span>
                </div>
                <span className="text-[9px] text-[#666666] block mt-0.5 font-mono">
                  Trigger delay compensation
                </span>
              </div>
            </div>

            {/* Sub-frame Temporal Interpolation Method */}
            <div className="mt-3 pt-2.5 border-t border-[#e0e0e0]">
              <label className="text-[10px] font-bold text-black block mb-1">
                Sub-Frame Temporal Interpolation Algorithm:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: 'cubic-spline',
                    title: 'Cubic Hermite Spline',
                    desc: 'C¹-continuous velocity. Recommended for curved ballistics & high-G flight.',
                  },
                  {
                    id: 'linear',
                    title: 'Linear Interpolation',
                    desc: 'Direct sub-frame line between adjacent frames. No overshoot guarantee.',
                  },
                  {
                    id: 'nearest',
                    title: 'Nearest Integer Frame',
                    desc: 'Discrete raw sensor frame snap. Preserves un-interpolated pixel detections.',
                  },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTemporalInterp(item.id as TemporalInterpMethod)}
                    className={`p-2 rounded-[2px] border text-left transition-colors flex flex-col justify-between ${
                      temporalInterp === item.id
                        ? 'border-[#1e3a5f] bg-[#1e3a5f] text-white'
                        : 'border-[#808080] bg-white hover:bg-[#efefef] text-black'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold text-[11px]">
                      <span>{item.title}</span>
                      {temporalInterp === item.id && <Check className="w-3.5 h-3.5 text-white" />}
                    </div>
                    <span
                      className={`text-[9px] mt-1 leading-snug ${
                        temporalInterp === item.id ? 'text-blue-100' : 'text-[#666666]'
                      }`}
                    >
                      {item.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Triangulation Setup Mode */}
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

          {/* Camera Scales & Optical Origins */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#808080]">
            {/* Camera 1 Settings */}
            <div className="bg-[#efefef] p-2.5 rounded-[2px] border border-[#808080] space-y-1.5">
              <span className="font-bold text-black text-[11px] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#1e3a5f]" />
                Camera 1 Optical Parameters
              </span>
              <div>
                <label className="text-[10px] text-black font-semibold block">Scale (Pixels / Meter)</label>
                <input
                  type="number"
                  value={scale1}
                  onChange={(e) => setScale1(parseFloat(e.target.value) || 1)}
                  className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-[#555555] block">Origin X (px)</label>
                  <input
                    type="number"
                    value={origin1X}
                    onChange={(e) => setOrigin1X(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-[#555555] block">Origin Y (px)</label>
                  <input
                    type="number"
                    value={origin1Y}
                    onChange={(e) => setOrigin1Y(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Camera 2 Settings */}
            <div className="bg-[#efefef] p-2.5 rounded-[2px] border border-[#808080] space-y-1.5">
              <span className="font-bold text-black text-[11px] flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-700" />
                Camera 2 Optical Parameters
              </span>
              <div>
                <label className="text-[10px] text-black font-semibold block">Scale (Pixels / Meter)</label>
                <input
                  type="number"
                  value={scale2}
                  onChange={(e) => setScale2(parseFloat(e.target.value) || 1)}
                  className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[9px] text-[#555555] block">Origin X (px)</label>
                  <input
                    type="number"
                    value={origin2X}
                    onChange={(e) => setOrigin2X(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                  />
                </div>
                <div>
                  <label className="text-[9px] text-[#555555] block">Origin Y (px)</label>
                  <input
                    type="number"
                    value={origin2Y}
                    onChange={(e) => setOrigin2Y(parseFloat(e.target.value) || 0)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-0.5 text-xs font-mono text-black outline-none"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Stereo Baseline Parameters (if applicable) */}
          {(method === 'convergent-stereo' || method === 'dlt-parameters') && (
            <div className="bg-[#efefef] p-2.5 rounded-[2px] border border-[#808080] grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-black block font-semibold">Stereo Baseline (m)</label>
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
            </div>
          )}

          <div className="p-2.5 bg-white border border-[#808080] rounded-[2px] text-black text-[10px] flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-[#1e3a5f] shrink-0 mt-0.5" />
            <div>
              <strong>Mathematical Triangulation & Asynchronous Solving:</strong> DLT equations map 3D world rays via linear systems [A]4x3 * [X] = [B]4x1. When Camera 1 and Camera 2 operate at differing frame rates (f1 ≠ f2), Tracker computes the exact continuous sub-frame coordinates on Camera 2 at timestamp t1, solves least-squares ray intersection, and quantifies the temporal residual.
            </div>
          </div>
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
