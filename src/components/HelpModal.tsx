import React from 'react';
import { HelpCircle, X, Ruler, Compass, MousePointerClick, TrendingUp, Download, FileText, Film, Keyboard } from 'lucide-react';
import { downloadUserManualPDF } from '../utils/downloadPdf';

import { FormatsModalTab } from './SupportedFormatsModal';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenFormatsModal?: (tab?: FormatsModalTab) => void;
  onOpenShortcuts?: () => void;
}

export const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose, onOpenFormatsModal, onOpenShortcuts }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[3px] max-w-2xl w-full max-h-[92vh] flex flex-col p-5 text-black shadow-2xl">
        <div className="flex items-center justify-between pb-2 border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-black" />
            <h3 className="font-bold text-sm text-black">Tracker Physics &amp; Operating Guide</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto pr-1.5 mt-3 space-y-3.5">
          {/* PDF Download Banner */}
          <div className="p-2.5 bg-white border border-[#808080] rounded-[2px] flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#1e3a5f] shrink-0" />
              <div className="text-[11px] leading-tight">
                <span className="font-bold text-black block">Full User Manual &amp; Kinematics Guide (PDF)</span>
                <span className="text-[#555555]">Comprehensive printable manual with complete keyboard shortcuts reference, 3D stereo DLT, and calibration docs.</span>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadUserManualPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] text-white font-semibold text-xs transition-colors shrink-0 border border-[#0f1d30] cursor-pointer"
              title="Download full User Manual as PDF"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>

          <div className="space-y-3.5 text-xs text-[#333333]">
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

          <div className="flex items-start gap-3">
            <div className="p-1.5 rounded-[2px] bg-[#efefef] text-[#1e3a5f] border border-[#808080] shrink-0">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h4 className="font-bold text-black mb-0.5">5. Universal Video Formats & Cameras</h4>
              <p className="text-[#333333]">
                Accepts all formats: <strong>MP4, MOV, WebM, AVI, MKV, MTS, WMV, FLV, 3GP, GIF, and TRZ</strong> archives. Supports 120/240 fps slow-mo cameras and drag-and-drop loading.
              </p>
              {onOpenFormatsModal && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenFormatsModal();
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[#1e3a5f] font-bold text-xs underline hover:text-[#152843] cursor-pointer"
                >
                  <span>Open Full Formats Catalog & Diagnostics</span>
                  <span>&rarr;</span>
                </button>
              )}
            </div>
          </div>

          {/* Section 6: Keyboard Shortcuts & Hotkeys */}
          <div className="flex items-start gap-3 p-2.5 bg-[#f5f4f0] border border-[#808080] rounded-[2px]">
            <div className="p-1.5 rounded-[2px] bg-[#1e3a5f] text-white shrink-0">
              <Keyboard className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <h4 className="font-bold text-black">6. Keyboard Shortcuts &amp; Hotkeys (Workflow Verification)</h4>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white text-[#1e3a5f] font-bold border border-[#a0a0a0]">
                  Press ? or F1
                </span>
              </div>
              <p className="text-[#333333] mb-2 leading-relaxed">
                Operate at lab-bench speed using the built-in single-key and modifier hotkeys. Every hotkey runs locally with immediate physical feedback:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] mb-2 font-sans">
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">← / →</span>
                  <span className="text-[#333333]">Step frame back / forward</span>
                </div>
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">Shift + ← / →</span>
                  <span className="text-[#333333]">Fast skip 5 frames</span>
                </div>
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">Shift + Click</span>
                  <span className="text-[#333333]">Mark mass &amp; auto-step</span>
                </div>
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">Ctrl + Z</span>
                  <span className="text-[#333333]">Undo last marked point</span>
                </div>
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">Del / Backspace</span>
                  <span className="text-[#333333]">Delete current frame point</span>
                </div>
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">Tab</span>
                  <span className="text-[#333333]">Cycle through Point Masses</span>
                </div>
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">M / A / C / V / T</span>
                  <span className="text-[#333333]">Toggle Loupe, Axes, Cal, Vectors, Trails</span>
                </div>
                <div className="bg-white p-1.5 border border-[#c0bcb4] rounded-[2px]">
                  <span className="font-mono font-bold text-black bg-[#efefef] px-1 py-0.5 rounded border border-[#a0a0a0] mr-1.5">Wheel / Right-Drag</span>
                  <span className="text-[#333333]">Zoom 20%-1600% / Pan scene</span>
                </div>
              </div>

              {onOpenShortcuts && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenShortcuts();
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#1e3a5f] hover:bg-[#152843] text-white font-bold text-[11px] rounded-[2px] transition-colors cursor-pointer border border-[#0f1d30]"
                >
                  <Keyboard className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Open Interactive Shortcuts Modal (? or F1)</span>
                  <span>&rarr;</span>
                </button>
              )}
            </div>
          </div>
        </div>
        </div>

        <div className="mt-3 pt-3 border-t border-[#808080] flex items-center justify-between gap-2 flex-wrap shrink-0">
          <div className="flex items-center gap-2">
            {onOpenFormatsModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFormatsModal();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-[#efefef] hover:bg-[#dcdcdc] text-black font-semibold text-xs transition-colors border border-[#808080] cursor-pointer"
              >
                <Film className="w-3.5 h-3.5 text-[#1e3a5f]" />
                <span>Accepted Formats</span>
              </button>
            )}
            {onOpenShortcuts && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[2px] bg-[#efefef] hover:bg-[#dcdcdc] text-black font-semibold text-xs transition-colors border border-[#808080] cursor-pointer"
              >
                <Keyboard className="w-3.5 h-3.5 text-emerald-700" />
                <span>Shortcuts</span>
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-[2px] bg-[#1e3a5f] hover:bg-[#152843] text-white font-semibold text-xs transition-colors border border-[#0f1d30] cursor-pointer"
          >
            Close Guide
          </button>
        </div>
      </div>
    </div>
  );
};
