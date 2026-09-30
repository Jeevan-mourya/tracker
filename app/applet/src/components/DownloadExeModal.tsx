import React from 'react';
import {
  Download,
  X,
  Shield,
  CheckCircle2,
  HardDrive,
  Lock,
} from 'lucide-react';

interface DownloadExeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadExeModal: React.FC<DownloadExeModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-5 backdrop-blur-[2px]">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] max-w-2xl w-full max-h-[92vh] flex flex-col text-black shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4d0c8] border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-[3px] bg-[#1e3a5f] text-white">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-black">
                Download Windows Application (.EXE) — Air-Gapped &amp; Defense Ready
              </h3>
              <p className="text-[11px] text-[#444444]">
                100% Offline, Zero Internet Telemetry, High-Speed Optical Defense Cameras (Photron, Phantom, NAC)
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

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs bg-[#d4d0c8]">
          {/* Main Direct Download Cards */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3">
            <span className="font-bold text-xs text-black block border-b border-[#e0e0e0] pb-1.5">
              Direct Executable Download for Offline Windows PCs:
            </span>

            <div className="p-3.5 bg-[#f0f7ff] border-2 border-[#1e3a5f] rounded-[3px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-[#1e3a5f]" />
                  <span className="font-bold text-sm text-[#1e3a5f]">
                    Tracker-Video-Analysis.exe
                  </span>
                  <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-300 rounded font-bold text-[10px]">
                    235 MB Windows Binary
                  </span>
                </div>
                <p className="text-[11px] text-[#444444]">
                  Pre-compiled Windows 64-bit application. Copy to a secure USB drive and double-click to run on any air-gapped PC.
                </p>
              </div>

              <a
                href="/downloads/Tracker-Video-Analysis.exe"
                download="Tracker-Video-Analysis.exe"
                className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[3px] font-bold text-xs flex items-center gap-2 shadow-md transition-colors shrink-0 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download .EXE Now</span>
              </a>
            </div>
          </div>

          {/* Defense Sector & Air-Gapped Security Specifications */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-xs text-black border-b border-[#e0e0e0] pb-1.5">
              <Lock className="w-3.5 h-3.5 text-emerald-800" />
              <span>Air-Gapped &amp; Defense Sector Security Guarantees</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
              <div className="p-2 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block">100% Offline Architecture:</strong>
                  <span className="text-[#555555]">
                    Zero network requests, zero remote CDN scripts, zero fonts loaded over the internet. Operates without an active network card.
                  </span>
                </div>
              </div>

              <div className="p-2 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block">No Cloud Telemetry or Tracking:</strong>
                  <span className="text-[#555555]">
                    Classified defense range data, projectile trajectories, and coordinate calibrations never leave your local physical machine.
                  </span>
                </div>
              </div>

              <div className="p-2 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block">High-Speed Defense Cameras:</strong>
                  <span className="text-[#555555]">
                    Calibrated for Photron FASTCAM (2.1M fps), Phantom Cine (1M fps), NAC Memrecam, and iX Cameras down to microsecond (&mu;s) intervals.
                  </span>
                </div>
              </div>

              <div className="p-2 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block">Raw Frame Image Sequences:</strong>
                  <span className="text-[#555555]">
                    Directly loads uncompressed frame batches (TIFF, BMP, PNG, JPEG) and ZIP archives without requiring any OS video codecs.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Air-Gapped Field Deployment Checklist */}
          <div className="bg-[#f8f9fa] border border-[#808080] rounded-[3px] p-3 text-[11px] space-y-1.5">
            <span className="font-bold text-black text-xs block">
              Field Installation Checklist for Air-Gapped PCs:
            </span>
            <ol className="list-decimal list-inside space-y-1 text-[#444444]">
              <li>Click <strong>Download .EXE Now</strong> above to save <code>Tracker-Video-Analysis.exe</code>.</li>
              <li>Transfer the file to your secure USB flash drive or optical media.</li>
              <li>Insert into your field computer (Windows 10 / 11 / Server).</li>
              <li>Double-click to launch directly — no internet registration or administrator permissions required.</li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#d4d0c8] border-t border-[#808080] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#444444]">
            Secure Defense Kinematics Workstation &bull; Build Target: Windows 64-bit
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black font-semibold text-xs rounded-[2px] transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
