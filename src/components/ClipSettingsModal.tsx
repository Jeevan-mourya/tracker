import React, { useState } from 'react';
import { ClipSettings } from '../types';
import { Sliders, X } from 'lucide-react';

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
  const [startTime, setStartTime] = useState((clip.startTime ?? 0).toString());

  if (!isOpen) return null;

  const currentStep = Math.max(1, parseInt(stepSize, 10) || 1);
  const currentFps = Math.max(0.1, parseFloat(fps) || 30);
  const calculatedFrameDt = currentStep / currentFps;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const s = Math.max(0, parseInt(startFrame, 10) || 0);
    const end = Math.max(s, parseInt(endFrame, 10) || clip.totalFrames - 1);
    const step = Math.max(1, parseInt(stepSize, 10) || 1);
    const fRate = Math.max(0.1, parseFloat(fps) || 30);
    const t0 = parseFloat(startTime) || 0;
    const dt = step / fRate;

    onSave({
      startFrame: s,
      endFrame: end,
      stepSize: step,
      fps: fRate,
      startTime: t0,
      frameDt: dt,
      dt,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[3px] max-w-sm w-full p-4 text-black">
        <div className="flex items-center justify-between pb-2 border-b border-[#808080]">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-black" />
            <h3 className="font-bold text-sm text-black">Clip Settings (Synchronized Timing)</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-black mb-1 font-semibold">Start Frame:</label>
              <input
                id="clip-start-frame"
                type="number"
                min="0"
                value={startFrame}
                onChange={(e) => setStartFrame(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-xs text-black font-mono outline-none"
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
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-xs text-black font-mono outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-black mb-1 font-semibold">Step Size:</label>
              <input
                id="clip-step-size"
                type="number"
                min="1"
                max="100"
                value={stepSize}
                onChange={(e) => setStepSize(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-xs text-black font-mono outline-none"
              />
              <span className="text-[10px] text-[#555555]">Frames per step</span>
            </div>
            <div>
              <label className="block text-black mb-1 font-semibold">Frame Rate (fps):</label>
              <input
                id="clip-fps"
                type="number"
                step="any"
                min="0.1"
                value={fps}
                onChange={(e) => setFps(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-xs text-black font-mono outline-none"
              />
              <span className="text-[10px] text-[#555555]">e.g. 30, 60, 240, 1000</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-black mb-1 font-semibold">Start Time (s):</label>
              <input
                id="clip-start-time"
                type="number"
                step="any"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full bg-white border border-[#808080] rounded-[2px] px-2.5 py-1 text-xs text-black font-mono outline-none"
              />
              <span className="text-[10px] text-[#555555]">Initial t0</span>
            </div>
            <div>
              <label className="block text-black mb-1 font-semibold">Frame dt (s):</label>
              <div className="w-full bg-[#efefef] border border-[#808080] rounded-[2px] px-2.5 py-1 text-xs font-mono text-black font-bold">
                {calculatedFrameDt.toFixed(5)} s
              </div>
              <span className="text-[10px] text-[#555555]">step / fps</span>
            </div>
          </div>

          <div className="bg-[#efefef] border border-[#808080] rounded-[2px] p-2.5 font-mono text-[11px] text-black space-y-1">
            <div className="flex justify-between">
              <span>Total Analyzed Duration:</span>
              <span className="text-black font-bold">
                {(((parseInt(endFrame, 10) || 0) - (parseInt(startFrame, 10) || 0)) / currentFps).toFixed(3)} s
              </span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
              Update Clip
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
