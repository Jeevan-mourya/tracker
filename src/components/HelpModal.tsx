import React from 'react';
import { HelpCircle, X, Ruler, Compass, MousePointerClick, TrendingUp, Download, FileText } from 'lucide-react';
import { downloadUserManualPDF } from '../utils/downloadPdf';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[3px] max-w-lg w-full p-5 text-black">
        <div className="flex items-center justify-between pb-2 border-b border-[#808080]">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-black" />
            <h3 className="font-bold text-sm text-black">Tracker Physics Quick Guide</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* PDF Download Banner */}
        <div className="mt-3 p-2.5 bg-white border border-[#808080] rounded-[2px] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[#1e3a5f] shrink-0" />
            <div className="text-[11px] leading-tight">
              <span className="font-bold text-black block">Full User Manual & Kinematics Guide (PDF)</span>
              <span className="text-[#555555]">Comprehensive printable manual with 3D stereo, DLT, and calibration docs.</span>
            </div>
          </div>
          <button
            type="button"
            onClick={downloadUserManualPDF}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] text-white font-semibold text-xs transition-colors shrink-0 border border-[#0f1d30]"
            title="Download full User Manual as PDF"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </button>
        </div>

        <div className="mt-3.5 space-y-3.5 text-xs text-[#333333]">
          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-[2px] bg-[#efefef] text-black border border-[#808080] shrink-0">
              <Ruler className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-black mb-0.5">1. Set Calibration Scale</h4>
              <p className="text-[#333333]">
                Drag the calibration stick endpoints across a known reference object in the video (e.g. meter stick, 1.0 m). Click the scale icon to specify length and units (meters, cm, feet).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-[2px] bg-[#efefef] text-black border border-[#808080] shrink-0">
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-black mb-0.5">2. Set Coordinate Axes</h4>
              <p className="text-[#333333]">
                Drag the axes origin (0, 0) to your physical reference point (e.g. launch position, floor, or center). Drag the small rotation handle or enter angle θ to tilt axes for incline planes.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-[2px] bg-[#efefef] text-black border border-[#808080] shrink-0">
              <MousePointerClick className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-black mb-0.5">3. Track Particle Motion & Loupe Inspection</h4>
              <p className="text-[#333333]">
                Click directly on the moving object in the video (or use the 3.5× sub-pixel Loupe). With <strong>Auto-step</strong> enabled, the video automatically advances to the next frame. You can drag existing marks anytime to refine coordinates.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-[2px] bg-[#efefef] text-black border border-[#808080] shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-black mb-0.5">4. Graphing & Advanced Curve Fitting</h4>
              <p className="text-[#333333]">
                Switch between variables (x, y, vx, vy, speed, acceleration, kinetic/potential energy). Use <strong>Parabolic</strong> or <strong>Cubic</strong> regressions to inspect R² and RMSE or extract gravitational acceleration g (2A ≈ -9.81 m/s²)!
              </p>
            </div>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-[#808080] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] text-white font-semibold text-xs transition-colors border border-[#0f1d30]"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
