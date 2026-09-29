import React, { useState } from 'react';
import { ClipSettings } from '../types';
import {
  Sliders,
  X,
  Camera,
  Gauge,
  Zap,
  Clock,
  Shield,
  Layers,
  HelpCircle,
} from 'lucide-react';
import {
  DEFENSE_HIGH_SPEED_CAMERAS,
  HIGH_SPEED_FRAME_RATE_PRESETS,
  calculateRequiredShutter,
  formatHighSpeedTime,
} from '../utils/highSpeedCameras';

interface ClipSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: ClipSettings;
  onSave: (clip: Partial<ClipSettings>) => void;
}

export const ClipSettingsModal: React.FC<ClipSettingsModalProps> = ({
  isOpen,
  onClose,
  clip,
  onSave,
}) => {
  const [startFrame, setStartFrame] = useState(clip.startFrame.toString());
  const [endFrame, setEndFrame] = useState(clip.endFrame.toString());
  const [stepSize, setStepSize] = useState(clip.stepSize.toString());
  const [fps, setFps] = useState(clip.fps.toString());
  const [playbackFps, setPlaybackFps] = useState((clip.playbackFps || 30).toString());
  const [startTime, setStartTime] = useState((clip.startTime ?? 0).toString());
  const [selectedCamera, setSelectedCamera] = useState<string>(clip.cameraModel || 'photron-saz');
  const [timeUnit, setTimeUnit] = useState<'auto' | 's' | 'ms' | 'us' | 'ns'>(clip.timeUnit || 'auto');

  // Defense shutter / blur calculator state
  const [calcSpeedMps, setCalcSpeedMps] = useState<string>('920'); // 5.56mm NATO default
  const [calcBlurMm, setCalcBlurMm] = useState<string>('0.5');

  if (!isOpen) return null;

  const currentStep = Math.max(1, parseInt(stepSize, 10) || 1);
  const currentFps = Math.max(0.1, parseFloat(fps) || 30);
  const currentPlaybackFps = Math.max(1, parseFloat(playbackFps) || 30);
  const calculatedFrameDt = currentStep / currentFps;
  const calculatedDtUs = calculatedFrameDt * 1e6;
  const calculatedDtMs = calculatedFrameDt * 1000;

  const shutterEstimate = calculateRequiredShutter(
    parseFloat(calcSpeedMps) || 920,
    parseFloat(calcBlurMm) || 0.5
  );

  const applyPreset = (presetFps: number) => {
    setFps(presetFps.toString());
  };

  const handleSelectCamera = (cameraId: string) => {
    setSelectedCamera(cameraId);
    const cam = DEFENSE_HIGH_SPEED_CAMERAS.find((c) => c.id === cameraId);
    if (cam && cam.defaultFpsOptions.length > 0) {
      // Pick a representative frame rate for this camera (e.g. 10000 fps or max full res)
      const targetFps = cam.defaultFpsOptions.includes(10000)
        ? 10000
        : cam.defaultFpsOptions[Math.floor(cam.defaultFpsOptions.length / 2)];
      setFps(targetFps.toString());
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Math.max(0, parseInt(startFrame, 10) || 0);
    const end = Math.max(s, parseInt(endFrame, 10) || clip.totalFrames - 1);
    const step = Math.max(1, parseInt(stepSize, 10) || 1);
    const fRate = Math.max(0.1, parseFloat(fps) || 30);
    const pFps = Math.max(1, parseFloat(playbackFps) || 30);
    const t0 = parseFloat(startTime) || 0;
    const dt = step / fRate;

    const matchedCam = DEFENSE_HIGH_SPEED_CAMERAS.find((c) => c.id === selectedCamera);

    onSave({
      startFrame: s,
      endFrame: end,
      stepSize: step,
      fps: fRate,
      playbackFps: pFps,
      startTime: t0,
      frameDt: dt,
      dt,
      cameraModel: matchedCam ? `${matchedCam.manufacturer} ${matchedCam.model}` : 'High-Speed Camera',
      timeUnit,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 overflow-y-auto">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[3px] max-w-xl w-full p-4 text-black shadow-2xl my-auto">
        {/* Title bar */}
        <div className="flex items-center justify-between pb-2 border-b border-[#808080]">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[#1e3a5f]" />
            <div>
              <h3 className="font-bold text-sm text-black">High-Speed Defense Camera & Timing Configuration</h3>
              <p className="text-[10px] text-[#555555]">
                Calibrated for Photron FASTCAM, Phantom v2512/v2640, NAC, & Ballistics Ranges
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-3 space-y-3.5 text-xs">
          {/* Camera Model Profile Selector */}
          <div className="bg-[#ece9d8] border border-[#808080] p-2.5 rounded-[2px]">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-black font-bold flex items-center gap-1.5 text-[11px]">
                <Camera className="w-3.5 h-3.5 text-[#1e3a5f]" />
                <span>Defense Camera Profile:</span>
              </label>
              <span className="text-[10px] font-mono text-[#555555]">Photron / Phantom / NAC</span>
            </div>
            <select
              value={selectedCamera}
              onChange={(e) => handleSelectCamera(e.target.value)}
              className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-semibold outline-none cursor-pointer"
            >
              {DEFENSE_HIGH_SPEED_CAMERAS.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.manufacturer} {cam.model} — {cam.maxFpsFullRes.toLocaleString()} fps full res (up to {cam.maxFpsReduced.toLocaleString()} fps)
                </option>
              ))}
            </select>
          </div>

          {/* Quick Defense Frame Rate Presets Bar */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-black flex items-center gap-1 text-[11px]">
                <Zap className="w-3 h-3 text-[#1e3a5f]" />
                <span>High-Speed Frame Rate Presets:</span>
              </span>
              <span className="text-[10px] text-[#555555]">Click to apply</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {[
                { label: '1,000 fps', val: 1000, desc: '1.0 ms dt' },
                { label: '2,000 fps', val: 2000, desc: '500 µs dt' },
                { label: '5,000 fps', val: 5000, desc: '200 µs dt' },
                { label: '10,000 fps', val: 10000, desc: '100 µs (Photron)' },
                { label: '20,000 fps', val: 20000, desc: '50 µs (SA-Z)' },
                { label: '25,000 fps', val: 25000, desc: '40 µs (Phantom)' },
                { label: '50,000 fps', val: 50000, desc: '20 µs dt' },
                { label: '100,000 fps', val: 100000, desc: '10 µs dt' },
                { label: '250,000 fps', val: 250000, desc: '4 µs dt' },
                { label: '1,000,000 fps', val: 1000000, desc: '1 µs (Hypervelocity)' },
              ].map((p) => {
                const isActive = Math.abs(currentFps - p.val) < 0.1;
                return (
                  <button
                    key={p.val}
                    type="button"
                    onClick={() => applyPreset(p.val)}
                    className={`px-1.5 py-1 text-left rounded-[2px] border transition-colors ${
                      isActive
                        ? 'bg-[#1e3a5f] text-white border-[#0f1d30] font-bold shadow-inner'
                        : 'bg-white hover:bg-[#efefef] text-black border-[#808080]'
                    }`}
                  >
                    <div className="font-bold text-[11px] leading-tight">{p.label}</div>
                    <div className={`text-[9px] ${isActive ? 'text-[#93c5fd]' : 'text-[#666666]'}`}>
                      {p.desc}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary Timing Parameters: Sensor fps vs Container playback fps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white border border-[#808080] p-2.5 rounded-[2px]">
            <div>
              <label className="block text-black mb-1 font-bold">
                Sensor Capture Rate (fps):
              </label>
              <input
                id="clip-fps"
                type="number"
                step="any"
                min="0.1"
                value={fps}
                onChange={(e) => setFps(e.target.value)}
                className="w-full bg-[#fdfdfd] border-2 border-[#1e3a5f] rounded-[2px] px-2.5 py-1 text-sm text-black font-mono font-bold outline-none"
              />
              <span className="text-[10px] text-[#555555]">
                Physical time calculation: 1/{currentFps.toLocaleString()} s
              </span>
            </div>

            <div>
              <label className="block text-black mb-1 font-bold">
                Container Playback Rate (fps):
              </label>
              <input
                id="clip-playback-fps"
                type="number"
                step="any"
                min="1"
                max="240"
                value={playbackFps}
                onChange={(e) => setPlaybackFps(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-sm text-black font-mono outline-none"
              />
              <span className="text-[10px] text-[#555555]">
                MP4/AVI seek frame rate (typically 30 or 60 fps)
              </span>
            </div>
          </div>

          {/* Live Microsecond / Physics Telemetry Card */}
          <div className="bg-[#1e3a5f] text-white p-2.5 rounded-[2px] font-mono border border-[#0f1d30]">
            <div className="flex items-center justify-between text-[11px] pb-1 border-b border-[#3b82f6]/40 mb-1.5">
              <span className="flex items-center gap-1 font-bold text-white">
                <Clock className="w-3.5 h-3.5 text-[#38bdf8]" />
                <span>Physical Sub-Frame Resolution (&Delta;t):</span>
              </span>
              <span className="text-[#38bdf8] font-bold">
                {currentFps >= 100000
                  ? `${calculatedDtUs.toFixed(3)} µs / step`
                  : currentFps >= 1000
                  ? `${calculatedDtMs.toFixed(3)} ms / step`
                  : `${calculatedFrameDt.toFixed(5)} s / step`}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div>
                <span className="text-gray-300 block">Seconds:</span>
                <span className="text-white font-bold">{calculatedFrameDt.toExponential(4)} s</span>
              </div>
              <div>
                <span className="text-gray-300 block">Milliseconds:</span>
                <span className="text-white font-bold">{calculatedDtMs.toFixed(4)} ms</span>
              </div>
              <div>
                <span className="text-gray-300 block">Microseconds:</span>
                <span className="text-white font-bold">{calculatedDtUs.toFixed(2)} µs</span>
              </div>
            </div>
          </div>

          {/* Frame Range & Step Size */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-black mb-1 font-semibold">Start Frame:</label>
              <input
                id="clip-start-frame"
                type="number"
                min="0"
                value={startFrame}
                onChange={(e) => setStartFrame(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-black mb-1 font-semibold">End Frame:</label>
              <input
                id="clip-end-frame"
                type="number"
                min="0"
                value={endFrame}
                onChange={(e) => setEndFrame(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
              />
            </div>
            <div>
              <label className="block text-black mb-1 font-semibold">Step Size:</label>
              <input
                id="clip-step-size"
                type="number"
                min="1"
                max="100"
                value={stepSize}
                onChange={(e) => setStepSize(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
              />
            </div>
          </div>

          {/* Time Display Unit Selector */}
          <div className="flex items-center justify-between bg-[#ece9d8] border border-[#808080] p-2 rounded-[2px]">
            <span className="font-semibold text-black text-[11px]">Time Unit Format in Tables & Plots:</span>
            <div className="flex gap-1">
              {(['auto', 's', 'ms', 'us'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  onClick={() => setTimeUnit(unit)}
                  className={`px-2 py-0.5 rounded-[2px] font-mono text-[10px] font-bold border transition-colors ${
                    timeUnit === unit
                      ? 'bg-[#1e3a5f] text-white border-[#0f1d30]'
                      : 'bg-white hover:bg-[#dcdcdc] text-black border-[#808080]'
                  }`}
                >
                  {unit === 'auto' ? 'Auto-Detect' : unit === 'us' ? 'µs (micro)' : unit === 'ms' ? 'ms (milli)' : 's (seconds)'}
                </button>
              ))}
            </div>
          </div>

          {/* Ballistics Motion Blur & Exposure Calculator Accordion */}
          <details className="bg-white border border-[#808080] rounded-[2px] p-2 text-[11px]">
            <summary className="font-bold text-[#1e3a5f] cursor-pointer select-none">
              Ballistics Exposure Time & Motion Blur Calculator
            </summary>
            <div className="mt-2 pt-2 border-t border-[#d4d0c8] space-y-2">
              <p className="text-[10px] text-[#555555]">
                Calculate minimum camera shutter speed to eliminate projectile motion blur on the tracking reticle.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-semibold text-black">
                    Expected Velocity (m/s):
                  </label>
                  <input
                    type="number"
                    value={calcSpeedMps}
                    onChange={(e) => setCalcSpeedMps(e.target.value)}
                    className="w-full bg-[#f8f8f8] border border-[#808080] rounded-[2px] px-2 py-0.5 font-mono text-xs"
                    placeholder="920"
                  />
                  <span className="text-[9px] text-[#666666]">e.g. 920 m/s (5.56mm), 343 m/s (Mach 1)</span>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-black">
                    Max Permissible Blur (mm):
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={calcBlurMm}
                    onChange={(e) => setCalcBlurMm(e.target.value)}
                    className="w-full bg-[#f8f8f8] border border-[#808080] rounded-[2px] px-2 py-0.5 font-mono text-xs"
                    placeholder="0.5"
                  />
                  <span className="text-[9px] text-[#666666]">Target sub-pixel sharpness</span>
                </div>
              </div>
              <div className="p-2 bg-[#f0f9ff] border border-[#bae6fd] rounded-[2px] text-[10px]">
                <div className="font-bold text-[#0369a1]">Recommended Shutter Speed:</div>
                <div className="font-mono text-black font-semibold">
                  Exposure: {shutterEstimate.maxExposureUs.toFixed(2)} µs ({shutterEstimate.shutterFraction})
                </div>
              </div>
            </div>
          </details>

          {/* Action buttons */}
          <div className="flex justify-between items-center pt-2 border-t border-[#808080]">
            <div className="text-[10px] text-[#555555] font-mono">
              Total Duration: {(((parseInt(endFrame, 10) || 0) - (parseInt(startFrame, 10) || 0)) / currentFps).toExponential(3)} s
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-[2px] bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] transition-colors font-medium"
              >
                Cancel
              </button>
              <button
                id="clip-save-btn"
                type="submit"
                className="px-4 py-1.5 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] text-white font-semibold transition-colors border border-[#0f1d30]"
              >
                Apply Timing Configuration
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
