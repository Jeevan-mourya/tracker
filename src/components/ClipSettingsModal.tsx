import React, { useState, useEffect } from 'react';
import { ClipSettings, TriangulationConfig } from '../types';
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
import {
  normalizeStereoSyncConfig,
  resolveEffectiveClipCam2,
  computeStereoTimeWindow,
} from '../utils/stereoSync';

interface ClipSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clip: ClipSettings;
  onSave: (clip: Partial<ClipSettings>, triUpdates?: Partial<TriangulationConfig>) => void;
  is3D?: boolean;
  triangulation?: TriangulationConfig;
  onUpdateTriangulation?: (tri: Partial<TriangulationConfig>) => void;
}

export const ClipSettingsModal: React.FC<ClipSettingsModalProps> = ({
  isOpen,
  onClose,
  clip,
  onSave,
  is3D = false,
  triangulation,
  onUpdateTriangulation,
}) => {
  const [activeTab, setActiveTab] = useState<'cam1' | 'cam2' | 'sync'>('cam1');

  // Camera 1 settings
  const [startFrame, setStartFrame] = useState(clip.startFrame.toString());
  const [endFrame, setEndFrame] = useState(clip.endFrame.toString());
  const [stepSize, setStepSize] = useState(clip.stepSize.toString());
  const [fps, setFps] = useState(clip.fps.toString());
  const [playbackFps, setPlaybackFps] = useState((clip.playbackFps || 30).toString());
  const [startTime, setStartTime] = useState((clip.startTime ?? 0).toString());
  const [selectedCamera, setSelectedCamera] = useState<string>(clip.cameraModel || 'photron-saz');
  const [timeUnit, setTimeUnit] = useState<'auto' | 's' | 'ms' | 'us' | 'ns'>(clip.timeUnit || 'auto');

  // Camera 2 settings
  const initialCam2Clip = resolveEffectiveClipCam2(triangulation, clip);
  const [fpsCam2, setFpsCam2] = useState(initialCam2Clip.fps.toString());
  const [playbackFpsCam2, setPlaybackFpsCam2] = useState((initialCam2Clip.playbackFps || 30).toString());
  const [startFrameCam2, setStartFrameCam2] = useState(initialCam2Clip.startFrame.toString());
  const [endFrameCam2, setEndFrameCam2] = useState(initialCam2Clip.endFrame.toString());
  const [stepSizeCam2, setStepSizeCam2] = useState(initialCam2Clip.stepSize.toString());
  const [startTimeCam2, setStartTimeCam2] = useState((initialCam2Clip.startTime ?? 0).toString());

  // Canonical Stereo Synchronization Settings
  const initialSync = normalizeStereoSyncConfig(
    triangulation?.syncConfig,
    triangulation?.fpsCam1 || clip.fps || 30,
    initialCam2Clip.fps
  );
  const [anchorCam1, setAnchorCam1] = useState(initialSync.anchorFrameCam1.toString());
  const [anchorCam2, setAnchorCam2] = useState(initialSync.anchorFrameCam2.toString());
  const [syncToleranceMs, setSyncToleranceMs] = useState(
    (initialSync.toleranceSec * 1000).toString()
  );

  // Defense shutter / blur calculator state
  const [calcSpeedMps, setCalcSpeedMps] = useState<string>('920'); // 5.56mm NATO default
  const [calcBlurMm, setCalcBlurMm] = useState<string>('0.5');

  // Resync all modal fields to live Camera 1, Camera 2, and Stereo Sync state whenever opened
  useEffect(() => {
    if (!isOpen) return;
    setStartFrame(clip.startFrame.toString());
    setEndFrame(clip.endFrame.toString());
    setStepSize(clip.stepSize.toString());
    setFps((triangulation?.fpsCam1 || clip.fps || 30).toString());
    setPlaybackFps((clip.playbackFps || (clip.fps > 240 ? 30 : clip.fps) || 30).toString());
    setStartTime((clip.startTime ?? 0).toString());
    setSelectedCamera(clip.cameraModel || 'photron-saz');
    setTimeUnit(clip.timeUnit || 'auto');

    const liveCam2 = resolveEffectiveClipCam2(triangulation, clip);
    setFpsCam2(liveCam2.fps.toString());
    setPlaybackFpsCam2((liveCam2.playbackFps || (liveCam2.fps > 240 ? 30 : liveCam2.fps) || 30).toString());
    setStartFrameCam2(liveCam2.startFrame.toString());
    setEndFrameCam2(liveCam2.endFrame.toString());
    setStepSizeCam2(liveCam2.stepSize.toString());
    setStartTimeCam2((liveCam2.startTime ?? 0).toString());

    const liveSync = normalizeStereoSyncConfig(
      triangulation?.syncConfig,
      triangulation?.fpsCam1 || clip.fps || 30,
      liveCam2.fps
    );
    setAnchorCam1(liveSync.anchorFrameCam1.toString());
    setAnchorCam2(liveSync.anchorFrameCam2.toString());
    setSyncToleranceMs((liveSync.toleranceSec * 1000).toString());
  }, [isOpen, clip, triangulation]);

  if (!isOpen) return null;

  const currentStep = Math.max(1, parseInt(stepSize, 10) || 1);
  const currentFps = Math.max(0.1, parseFloat(fps) || 30);
  const currentPlaybackFps = Math.max(1, parseFloat(playbackFps) || 30);
  const calculatedFrameDt = currentStep / currentFps;
  const calculatedDtUs = calculatedFrameDt * 1e6;
  const calculatedDtMs = calculatedFrameDt * 1000;

  const currentStep2 = Math.max(1, parseInt(stepSizeCam2, 10) || 1);
  const currentFps2 = Math.max(0.1, parseFloat(fpsCam2) || 30);
  const calculatedDtMs2 = (currentStep2 / currentFps2) * 1000;

  const shutterEstimate = calculateRequiredShutter(
    parseFloat(calcSpeedMps) || 920,
    parseFloat(calcBlurMm) || 0.5
  );

  const applyPresetCam1 = (presetFps: number) => {
    setFps(presetFps.toString());
  };

  const applyPresetCam2 = (presetFps: number) => {
    setFpsCam2(presetFps.toString());
  };

  const handleSelectCamera = (cameraId: string) => {
    setSelectedCamera(cameraId);
    const cam = DEFENSE_HIGH_SPEED_CAMERAS.find((c) => c.id === cameraId);
    if (cam && cam.defaultFpsOptions.length > 0) {
      const targetFps = cam.defaultFpsOptions.includes(10000)
        ? 10000
        : cam.defaultFpsOptions[Math.floor(cam.defaultFpsOptions.length / 2)];
      setFps(targetFps.toString());
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Math.max(0, parseInt(startFrame, 10) || 0);
    const maxCam1End = Math.max(s, Math.max(0, (clip.totalFrames || 1) - 1));
    const parsedEnd1 = parseInt(endFrame, 10);
    const end = Math.max(s, Number.isFinite(parsedEnd1) ? parsedEnd1 : maxCam1End);
    const step = Math.max(1, parseInt(stepSize, 10) || 1);
    const fRate = Math.max(0.1, parseFloat(fps) || 30);
    const pFps = Math.max(1, parseFloat(playbackFps) || 30);
    const t0 = parseFloat(startTime) || 0;
    const dt = step / fRate;

    const matchedCam = DEFENSE_HIGH_SPEED_CAMERAS.find((c) => c.id === selectedCamera);

    const clipUpdates: Partial<ClipSettings> = {
      startFrame: s,
      endFrame: end,
      stepSize: step,
      fps: fRate,
      playbackFps: pFps,
      startTime: t0,
      frameDt: dt,
      dt,
      totalFrames: Math.max(clip.totalFrames || 1, end + 1),
      cameraModel: matchedCam ? `${matchedCam.manufacturer} ${matchedCam.model}` : clip.cameraModel || 'High-Speed Camera',
      timeUnit,
    };

    const existingCam2 = resolveEffectiveClipCam2(triangulation, clip);
    const fRate2 = Math.max(0.1, parseFloat(fpsCam2) || 30);
    const s2 = Math.max(0, parseInt(startFrameCam2, 10) || 0);
    const parsedEnd2 = parseInt(endFrameCam2, 10);
    const end2 = Math.max(s2, Number.isFinite(parsedEnd2) ? parsedEnd2 : existingCam2.endFrame);
    const step2 = Math.max(1, parseInt(stepSizeCam2, 10) || 1);
    const pFps2 = Math.max(1, parseFloat(playbackFpsCam2) || 30);
    const t02 = parseFloat(startTimeCam2) || 0;
    const dt2 = step2 / fRate2;

    const n = Math.max(0, parseInt(anchorCam1, 10) || 0);
    const m = Math.max(0, parseInt(anchorCam2, 10) || 0);
    const tolSec = Math.max(0.0001, (parseFloat(syncToleranceMs) || 5) / 1000);

    const triUpdates: Partial<TriangulationConfig> = {
      fpsCam1: fRate,
      fpsCam2: fRate2,
      clipCam2: {
        ...existingCam2,
        fps: fRate2,
        startFrame: s2,
        endFrame: end2,
        stepSize: step2,
        startTime: t02,
        frameDt: dt2,
        dt: dt2,
        totalFrames: Math.max(existingCam2.totalFrames || 1, end2 + 1),
        playbackFps: pFps2,
      },
      syncConfig: {
        anchorFrameCam1: n,
        anchorFrameCam2: m,
        fpsCam1: fRate,
        fpsCam2: fRate2,
        toleranceSec: tolSec,
        playbackMaster: triangulation?.syncConfig?.playbackMaster || 'both',
      },
    };

    // Route through unified save handler (supports atomic Cam1 + Cam2 + re-triangulation in App.tsx)
    onSave(clipUpdates, triUpdates);
    if (onUpdateTriangulation) {
      onUpdateTriangulation(triUpdates);
    }

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

        {/* Tab Navigation for Camera 1, Camera 2, and Stereo Synchronization */}
        <div className="flex items-center gap-1 mt-3 border-b border-[#808080] pb-1">
          <button
            type="button"
            onClick={() => setActiveTab('cam1')}
            className={`px-3 py-1 rounded-t-[2px] text-xs font-bold border-t border-x transition-colors ${
              activeTab === 'cam1'
                ? 'bg-[#1e3a5f] text-white border-[#0f1d30]'
                : 'bg-[#e0e0e0] text-black border-[#808080] hover:bg-[#d0d0d0]'
            }`}
          >
            Camera 1 (Cam 1)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('cam2')}
            className={`px-3 py-1 rounded-t-[2px] text-xs font-bold border-t border-x transition-colors ${
              activeTab === 'cam2'
                ? 'bg-emerald-700 text-white border-emerald-900'
                : 'bg-[#e0e0e0] text-black border-[#808080] hover:bg-[#d0d0d0]'
            }`}
          >
            Camera 2 (Cam 2)
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('sync')}
            className={`px-3 py-1 rounded-t-[2px] text-xs font-bold border-t border-x transition-colors ${
              activeTab === 'sync'
                ? 'bg-purple-800 text-white border-purple-950'
                : 'bg-[#e0e0e0] text-black border-[#808080] hover:bg-[#d0d0d0]'
            }`}
          >
            Stereo Synchronization (Cam 1 ↔ Cam 2)
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-2 space-y-3.5 text-xs">
          {/* TAB 1: CAMERA 1 */}
          {activeTab === 'cam1' && (
            <div className="space-y-3">
              {/* Camera Model Profile Selector */}
              <div className="bg-[#ece9d8] border border-[#808080] p-2.5 rounded-[2px]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-black font-bold flex items-center gap-1.5 text-[11px]">
                    <Camera className="w-3.5 h-3.5 text-[#1e3a5f]" />
                    <span>Camera 1 Profile:</span>
                  </label>
                  <span className="text-[10px] font-mono text-[#555555]">Photron / Phantom / High-Speed</span>
                </div>
                <select
                  value={selectedCamera}
                  onChange={(e) => handleSelectCamera(e.target.value)}
                  className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-semibold outline-none cursor-pointer"
                >
                  {DEFENSE_HIGH_SPEED_CAMERAS.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.manufacturer} {cam.model} — {cam.maxFpsFullRes.toLocaleString()} fps full res
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Defense Frame Rate Presets Bar */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-black flex items-center gap-1 text-[11px]">
                    <Zap className="w-3 h-3 text-[#1e3a5f]" />
                    <span>Camera 1 Frame Rate Presets:</span>
                  </span>
                  <span className="text-[10px] text-[#555555]">Click to apply</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {[
                    { label: '60 fps', val: 60, desc: '16.7 ms' },
                    { label: '100 fps', val: 100, desc: '10.0 ms' },
                    { label: '500 fps', val: 500, desc: '2.0 ms' },
                    { label: '1,000 fps', val: 1000, desc: '1.0 ms' },
                    { label: '5,000 fps', val: 5000, desc: '200 µs' },
                    { label: '10,000 fps', val: 10000, desc: '100 µs (Photron)' },
                    { label: '25,000 fps', val: 25000, desc: '40 µs (Phantom)' },
                    { label: '50,000 fps', val: 50000, desc: '20 µs' },
                    { label: '100,000 fps', val: 100000, desc: '10 µs' },
                    { label: '1,000,000 fps', val: 1000000, desc: '1 µs' },
                  ].map((p) => {
                    const isActive = Math.abs(currentFps - p.val) < 0.1;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => applyPresetCam1(p.val)}
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
                    Cam 1 Sensor Capture Rate (f₁ in fps):
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
                    Physical time step &Delta;t₁ = 1/{currentFps.toLocaleString()} s ({calculatedDtMs.toFixed(3)} ms)
                  </span>
                </div>

                <div>
                  <label className="block text-black mb-1 font-bold">
                    Cam 1 Container Playback Rate (fps):
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
                    Browser media seek rate (default 30 fps)
                  </span>
                </div>
              </div>

              {/* Frame Range & Step Size for Cam 1 */}
              <div className="grid grid-cols-4 gap-2 bg-white border border-[#808080] p-2.5 rounded-[2px]">
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
                <div>
                  <label className="block text-black mb-1 font-semibold">Start Time (t₀ s):</label>
                  <input
                    type="number"
                    step="any"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CAMERA 2 */}
          {activeTab === 'cam2' && (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-600 p-2 rounded-[2px] text-[11px] text-emerald-950">
                <strong>Camera 2 Independent Sensor Settings:</strong> Define capture frame rate f₂, frame limits, and playback rate independently of Camera 1.
              </div>

              {/* Quick Frame Rate Presets for Cam 2 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-black flex items-center gap-1 text-[11px]">
                    <Zap className="w-3 h-3 text-emerald-700" />
                    <span>Camera 2 Frame Rate Presets:</span>
                  </span>
                  <span className="text-[10px] text-[#555555]">Click to apply</span>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {[
                    { label: '30 fps', val: 30, desc: '33.3 ms' },
                    { label: '60 fps', val: 60, desc: '16.7 ms' },
                    { label: '100 fps', val: 100, desc: '10.0 ms' },
                    { label: '240 fps', val: 240, desc: '4.17 ms' },
                    { label: '500 fps', val: 500, desc: '2.0 ms' },
                    { label: '1,000 fps', val: 1000, desc: '1.0 ms' },
                    { label: '2,000 fps', val: 2000, desc: '500 µs' },
                    { label: '5,000 fps', val: 5000, desc: '200 µs' },
                    { label: '10,000 fps', val: 10000, desc: '100 µs' },
                    { label: '25,000 fps', val: 25000, desc: '40 µs' },
                  ].map((p) => {
                    const isActive = Math.abs(currentFps2 - p.val) < 0.1;
                    return (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => applyPresetCam2(p.val)}
                        className={`px-1.5 py-1 text-left rounded-[2px] border transition-colors ${
                          isActive
                            ? 'bg-emerald-700 text-white border-emerald-900 font-bold shadow-inner'
                            : 'bg-white hover:bg-[#efefef] text-black border-[#808080]'
                        }`}
                      >
                        <div className="font-bold text-[11px] leading-tight">{p.label}</div>
                        <div className={`text-[9px] ${isActive ? 'text-emerald-200' : 'text-[#666666]'}`}>
                          {p.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Primary Timing Parameters for Cam 2 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white border border-[#808080] p-2.5 rounded-[2px]">
                <div>
                  <label className="block text-black mb-1 font-bold">
                    Cam 2 Sensor Capture Rate (f₂ in fps):
                  </label>
                  <input
                    id="clip-fps-cam2"
                    type="number"
                    step="any"
                    min="0.1"
                    value={fpsCam2}
                    onChange={(e) => setFpsCam2(e.target.value)}
                    className="w-full bg-[#fdfdfd] border-2 border-emerald-700 rounded-[2px] px-2.5 py-1 text-sm text-black font-mono font-bold outline-none"
                  />
                  <span className="text-[10px] text-[#555555]">
                    Physical time step &Delta;t₂ = 1/{currentFps2.toLocaleString()} s ({calculatedDtMs2.toFixed(3)} ms)
                  </span>
                </div>

                <div>
                  <label className="block text-black mb-1 font-bold">
                    Cam 2 Container Playback Rate (fps):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="1"
                    max="240"
                    value={playbackFpsCam2}
                    onChange={(e) => setPlaybackFpsCam2(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-sm text-black font-mono outline-none"
                  />
                  <span className="text-[10px] text-[#555555]">
                    Browser media seek rate (default 30 fps)
                  </span>
                </div>
              </div>

              {/* Frame Range & Step Size for Cam 2 */}
              <div className="grid grid-cols-4 gap-2 bg-white border border-[#808080] p-2.5 rounded-[2px]">
                <div>
                  <label className="block text-black mb-1 font-semibold">Start Frame:</label>
                  <input
                    type="number"
                    min="0"
                    value={startFrameCam2}
                    onChange={(e) => setStartFrameCam2(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-black mb-1 font-semibold">End Frame:</label>
                  <input
                    type="number"
                    min="0"
                    value={endFrameCam2}
                    onChange={(e) => setEndFrameCam2(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-black mb-1 font-semibold">Step Size:</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={stepSizeCam2}
                    onChange={(e) => setStepSizeCam2(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
                  />
                </div>
                <div>
                  <label className="block text-black mb-1 font-semibold">Start Time (t₀ s):</label>
                  <input
                    type="number"
                    step="any"
                    value={startTimeCam2}
                    onChange={(e) => setStartTimeCam2(e.target.value)}
                    className="w-full bg-white border border-[#808080] rounded-[2px] px-2 py-1 text-xs text-black font-mono outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: STEREO SYNCHRONIZATION */}
          {activeTab === 'sync' && (
            <div className="space-y-3">
              <div className="bg-purple-50 border border-purple-600 p-2.5 rounded-[2px] text-[11px] text-purple-950">
                <div className="font-bold mb-1">Requirement 2: Timestamp-Based Anchor Synchronization Model</div>
                <div className="font-mono text-[10px] space-y-0.5">
                  <div>• &Delta;t = (i - n) / f₁</div>
                  <div>• Target Cam 2 Time: t₂(j) = t₂(m) + &Delta;t</div>
                  <div>• Corresponding Cam 2 Frame: j = m + round(&Delta;t &times; f₂)</div>
                  <div>• Sync Offset &Delta;t_sync = |(j - m)/f₂ - (i - n)/f₁|</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white border border-[#808080] p-2.5 rounded-[2px]">
                <div>
                  <label className="block text-black mb-1 font-bold">
                    Anchor Frame Cam 1 (n):
                  </label>
                  <input
                    id="sync-anchor-cam1"
                    type="number"
                    min="0"
                    value={anchorCam1}
                    onChange={(e) => setAnchorCam1(e.target.value)}
                    className="w-full bg-[#fdfdfd] border-2 border-[#1e3a5f] rounded-[2px] px-2 py-1 text-sm text-black font-mono font-bold outline-none"
                  />
                  <span className="text-[10px] text-[#555555]">
                    Cam 1 frame at physical event t=0
                  </span>
                </div>

                <div>
                  <label className="block text-black mb-1 font-bold">
                    Anchor Frame Cam 2 (m):
                  </label>
                  <input
                    id="sync-anchor-cam2"
                    type="number"
                    min="0"
                    value={anchorCam2}
                    onChange={(e) => setAnchorCam2(e.target.value)}
                    className="w-full bg-[#fdfdfd] border-2 border-emerald-700 rounded-[2px] px-2 py-1 text-sm text-black font-mono font-bold outline-none"
                  />
                  <span className="text-[10px] text-[#555555]">
                    Cam 2 frame at exact same physical event
                  </span>
                </div>

                <div>
                  <label className="block text-black mb-1 font-bold">
                    Max Tolerance (ms):
                  </label>
                  <input
                    id="sync-tolerance-ms"
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={syncToleranceMs}
                    onChange={(e) => setSyncToleranceMs(e.target.value)}
                    className="w-full bg-[#fdfdfd] border border-[#808080] rounded-[2px] px-2 py-1 text-sm text-black font-mono outline-none"
                  />
                  <span className="text-[10px] text-[#555555]">
                    Flag offset exceeding this limit (e.g. 5ms)
                  </span>
                </div>
              </div>

              <div className="bg-[#f0f9ff] border border-[#bae6fd] p-2 rounded-[2px] text-[11px] text-blue-950 font-mono space-y-0.5">
                {(() => {
                  const previewWin = computeStereoTimeWindow(
                    {
                      startFrame: Math.max(0, parseInt(startFrame, 10) || 0),
                      endFrame: Math.max(0, parseInt(endFrame, 10) || 0),
                      totalFrames: Math.max(1, clip.totalFrames || 1),
                      fps: currentFps,
                    },
                    {
                      startFrame: Math.max(0, parseInt(startFrameCam2, 10) || 0),
                      endFrame: Math.max(0, parseInt(endFrameCam2, 10) || 0),
                      totalFrames: Math.max(1, (parseInt(endFrameCam2, 10) || 0) + 1),
                      fps: currentFps2,
                    },
                    {
                      anchorFrameCam1: Math.max(0, parseInt(anchorCam1, 10) || 0),
                      anchorFrameCam2: Math.max(0, parseInt(anchorCam2, 10) || 0),
                      fpsCam1: currentFps,
                      fpsCam2: currentFps2,
                    }
                  );
                  return (
                    <>
                      <div className="font-bold">Live Master Physical Clock Preview:</div>
                      <div>Anchor Pair: Cam 1 F#{anchorCam1} &harr; Cam 2 F#{anchorCam2} (t = 0.0000 s)</div>
                      <div>Rates: f₁ = {currentFps} fps, f₂ = {currentFps2} fps (Ratio: {(currentFps2 / currentFps).toFixed(4)})</div>
                      <div>
                        Overlap Window:{' '}
                        {previewWin.hasOverlap
                          ? `[${previewWin.overlapStartSec.toFixed(4)} s .. ${previewWin.overlapEndSec.toFixed(4)} s] (${previewWin.overlapDurationSec.toFixed(4)} s)`
                          : 'DISJOINT — Out-of-Clip badge active during union playback'}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

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
