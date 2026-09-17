import React, { useState } from 'react';
import { Calibration } from '../types';
import { Ruler, X } from 'lucide-react';

interface CalibrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  calibration: Calibration;
  onSave: (cal: Partial<Calibration>) => void;
}

export const CalibrationModal: React.FC<CalibrationModalProps> = ({
  isOpen,
  onClose,
  calibration,
  onSave,
}) => {
  const [length, setLength] = useState(calibration.realLength.toString());
  const [unit, setUnit] = useState(calibration.unit);

  if (!isOpen) return null;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(length);
    if (!isNaN(val) && val > 0) {
      onSave({ realLength: val, unit });
      onClose();
    }
  };

  const dx = calibration.pointB.x - calibration.pointA.x;
  const dy = calibration.pointB.y - calibration.pointA.y;
  const pixelDist = Math.hypot(dx, dy);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[3px] max-w-sm w-full p-4 text-black">
        <div className="flex items-center justify-between pb-2 border-b border-[#808080]">
          <div className="flex items-center gap-2">
            <Ruler className="w-5 h-5 text-black" />
            <h3 className="font-bold text-sm text-black">Calibration Stick</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="mt-4 space-y-4 text-xs">
          <div>
            <label className="block text-black mb-1 font-semibold">
              Known Real-World Distance:
            </label>
            <div className="flex gap-2">
              <input
                id="cal-length-input"
                type="number"
                step="any"
                min="0.0001"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                className="flex-1 bg-white border border-[#808080] rounded-[2px] px-3 py-1.5 text-xs text-black font-mono outline-none"
                required
              />
              <select
                id="cal-unit-select"
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
                className="bg-white border border-[#808080] rounded-[2px] px-3 py-1.5 text-xs text-black font-mono cursor-pointer"
              >
                <option value="m">m (meters)</option>
                <option value="cm">cm (centimeters)</option>
                <option value="mm">mm (millimeters)</option>
                <option value="ft">ft (feet)</option>
              </select>
            </div>
          </div>

          <div className="bg-[#efefef] border border-[#808080] rounded-[2px] p-2.5 space-y-1 font-mono text-[11px] text-black">
            <div className="flex justify-between">
              <span>Pixel Span:</span>
              <span className="text-black font-bold">{pixelDist.toFixed(1)} px</span>
            </div>
            <div className="flex justify-between">
              <span>Calibration Factor:</span>
              <span className="text-black font-bold">
                {(pixelDist / (parseFloat(length) || 1)).toFixed(1)} px/{unit}
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
              id="cal-save-btn"
              type="submit"
              className="px-4 py-1.5 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] text-white font-semibold transition-colors border border-[#0f1d30]"
            >
              Apply Scale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
