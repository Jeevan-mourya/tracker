import React from 'react';
import {
  X,
  Shield,
  CheckCircle2,
  HardDrive,
  Camera,
  Cpu,
  Lock,
  Zap,
  FileCheck,
  Activity,
  Layers,
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
    <div className="fixed inset-0 bg-black/65 flex items-center justify-center z-50 p-3 sm:p-5 backdrop-blur-[2px]">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] max-w-2xl w-full max-h-[92vh] flex flex-col text-black shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4d0c8] border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-[3px] bg-[#1e3a5f] text-white">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-black flex items-center gap-1.5">
                <span>Defense Sector &amp; Air-Gapped Workstation Security</span>
                <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-900 border border-emerald-400 rounded text-[9px] font-bold">
                  100% OFFLINE SAFE
                </span>
              </h3>
              <p className="text-[11px] text-[#444444]">
                Strict Zero-Telemetry Architecture &bull; Photron, Phantom, NAC &amp; iX High-Speed Defense Cameras
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
          {/* Defense Firewall & Air-Gapped Status Banner */}
          <div className="p-3 bg-emerald-50 border-2 border-emerald-600 rounded-[3px] flex items-start gap-2.5 shadow-xs">
            <Lock className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <strong className="text-emerald-950 text-xs block font-bold">
                Air-Gapped Local Operation — Zero Network Connectivity Required
              </strong>
              <p className="text-[11px] text-emerald-900 leading-relaxed">
                This workstation is engineered specifically for local field and range PCs operating behind strict defense firewalls with zero internet access. All telemetry processing, sub-pixel coordinate calculations, Mach numbers, and kinematic regressions execute entirely inside local client memory.
              </p>
            </div>
          </div>

          {/* Defense Security Guarantees */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-xs text-black border-b border-[#e0e0e0] pb-1.5">
              <Shield className="w-3.5 h-3.5 text-[#1e3a5f]" />
              <span>Strict Defense Sector Security Standards</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[11px]">
              <div className="p-2.5 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block font-bold">Zero Telemetry &amp; No Cloud Phoning:</strong>
                  <span className="text-[#555555]">
                    No external sockets, no cookies, no tracking beacons, no analytics, and no remote CDN font requests.
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block font-bold">Classified Video Data Protection:</strong>
                  <span className="text-[#555555]">
                    Range footage, trajectory vectors, and spatial calibrations remain strictly in local RAM and are never uploaded.
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block font-bold">Firewall Safe Operation:</strong>
                  <span className="text-[#555555]">
                    Runs smoothly inside restricted defense browser environments without attempting blocked network downloads or external binary executions.
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-[#fdfdfd] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                <div>
                  <strong className="text-black block font-bold">Local File System Export:</strong>
                  <span className="text-[#555555]">
                    Saves calibrated datasets as standard CSV and Tracker TRZ formats directly to local storage or encrypted USB drives.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* High-Speed Cameras & Stream Formats */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3.5 shadow-sm space-y-2.5">
            <div className="flex items-center gap-1.5 font-bold text-xs text-black border-b border-[#e0e0e0] pb-1.5">
              <Camera className="w-3.5 h-3.5 text-blue-800" />
              <span>High-Speed Defense Cameras &amp; Sensor Streams Supported</span>
            </div>

            <div className="space-y-2 text-[11px]">
              <div className="p-2 bg-[#f8f9fa] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2.5">
                <div className="p-1 rounded bg-[#1e3a5f] text-white shrink-0 mt-0.5 font-bold text-[10px]">
                  PHOTRON
                </div>
                <div>
                  <strong className="text-black block">Photron FASTCAM Series (SA-Z, Nova, Mini):</strong>
                  <span className="text-[#555555]">
                    Supports native 10,000 to 2,100,000 fps burst recordings, uncompressed multi-frame MRAW / TIFF image sequences, and microsecond (&mu;s) calibrated timestamps for ballistics armor penetration.
                  </span>
                </div>
              </div>

              <div className="p-2 bg-[#f8f9fa] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2.5">
                <div className="p-1 rounded bg-amber-700 text-white shrink-0 mt-0.5 font-bold text-[10px]">
                  PHANTOM
                </div>
                <div>
                  <strong className="text-black block">Vision Research Phantom Cine (v2512, v2640, TMX):</strong>
                  <span className="text-[#555555]">
                    Calibrated for 25,000 to 1,000,000 fps high-speed optical schlieren shockwave analysis, supersonic Mach cone angles (&mu;), and rapid gas dynamics.
                  </span>
                </div>
              </div>

              <div className="p-2 bg-[#f8f9fa] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2.5">
                <div className="p-1 rounded bg-purple-700 text-white shrink-0 mt-0.5 font-bold text-[10px]">
                  NAC / iX
                </div>
                <div>
                  <strong className="text-black block">NAC Memrecam &amp; iX Cameras i-SPEED:</strong>
                  <span className="text-[#555555]">
                    High-G blast containment and shock-tube wave propagation analysis with nanosecond (ns) timebase resolution.
                  </span>
                </div>
              </div>

              <div className="p-2 bg-[#f8f9fa] border border-[#e0e0e0] rounded-[2px] flex items-start gap-2.5">
                <div className="p-1 rounded bg-emerald-800 text-white shrink-0 mt-0.5 font-bold text-[10px]">
                  RAW BURST
                </div>
                <div>
                  <strong className="text-black block">Uncompressed Image Sequences (TIFF, BMP, PNG, JPG):</strong>
                  <span className="text-[#555555]">
                    Military range protocols forbid lossy MPEG compression because compression macroblocks degrade sub-pixel edge tracking. Tracker directly ingests multi-frame uncompressed archives.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* New Interactive Navigation Controls Guide */}
          <div className="bg-[#f0f4f8] border border-[#1e3a5f] rounded-[3px] p-3 text-[11px] space-y-1.5">
            <span className="font-bold text-[#1e3a5f] text-xs flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-600" />
              <span>Ballistic Target Inspection Navigation Controls:</span>
            </span>
            <ul className="list-disc list-inside space-y-1 text-[#333333]">
              <li><strong>Mouse Wheel Scroll:</strong> Zooms in/out (from 20% up to 1600%) centered directly at your mouse cursor for extreme sub-pixel scrutiny.</li>
              <li><strong>Right-Click Drag:</strong> Pans the video scene across the viewport without opening the browser context menu.</li>
              <li><strong>Optical Loupe (4&times;):</strong> Real-time sub-pixel reticle sampling the raw underlying sensor video frame.</li>
              <li><strong>Shift + Click:</strong> Marks a point mass (Tracker OSP safety feature preventing accidental clicks).</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-[#d4d0c8] border-t border-[#808080] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#444444]">
            Defense Range Kinematics &bull; Air-Gapped Secure Workstation
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
