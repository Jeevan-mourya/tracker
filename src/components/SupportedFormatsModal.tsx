import React, { useState } from 'react';
import {
  X,
  Film,
  CheckCircle2,
  AlertCircle,
  Upload,
  Info,
  Layers,
  Sparkles,
  Camera,
  FileCheck,
} from 'lucide-react';
import {
  ACCEPTED_VIDEO_FORMATS,
  ACCEPTED_VIDEO_ACCEPT_STRING,
  inspectVideoFile,
  VideoInspectionResult,
} from '../utils/videoFormats';

interface SupportedFormatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideoFile?: (file: File) => void;
}

export const SupportedFormatsModal: React.FC<SupportedFormatsModalProps> = ({
  isOpen,
  onClose,
  onSelectVideoFile,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [testedFile, setTestedFile] = useState<VideoInspectionResult | null>(null);
  const [rawTestedFile, setRawTestedFile] = useState<File | null>(null);

  if (!isOpen) return null;

  const categories = [
    { id: 'all', label: 'All Formats (13+)' },
    { id: 'Modern Web / Native', label: 'MP4, WebM, MKV' },
    { id: 'QuickTime / Apple', label: 'MOV / Apple ProRes' },
    { id: 'Laboratory & Camera', label: 'AVI, MTS, Camcorder' },
    { id: 'Container & Legacy', label: 'MPEG, WMV, FLV, 3GP' },
    { id: 'Animated Image', label: 'GIF / WebP' },
    { id: 'Tracker Package', label: 'TRZ / TRK / ZIP' },
  ];

  const filteredFormats =
    selectedCategory === 'all'
      ? ACCEPTED_VIDEO_FORMATS
      : ACCEPTED_VIDEO_FORMATS.filter((f) => f.category === selectedCategory);

  const handleTestFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setRawTestedFile(file);
      const result = inspectVideoFile(file);
      setTestedFile(result);
    }
  };

  const handleLoadTestedIntoTracker = () => {
    if (rawTestedFile && onSelectVideoFile) {
      onSelectVideoFile(rawTestedFile);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-3 sm:p-5 backdrop-blur-[2px]">
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] max-w-4xl w-full max-h-[92vh] flex flex-col text-black shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4d0c8] border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-[3px] bg-[#1e3a5f] text-white">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-black">Accepted Video File Formats & Codecs</h3>
              <p className="text-[11px] text-[#444444]">
                Tracker Video Analysis accepts all standard, high-speed, laboratory, and archive formats.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-[2px] text-black hover:bg-[#c0bcb4] transition-colors"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
          {/* Quick Inspector / Diagnostic Banner */}
          <div className="bg-white border border-[#808080] rounded-[3px] p-3 shadow-sm">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-2.5 border-b border-[#e0e0e0]">
              <div className="flex items-center gap-2">
                <FileCheck className="w-4 h-4 text-[#1e3a5f]" />
                <span className="font-bold text-xs text-black">Video Format Checker & Diagnostics</span>
                <span className="text-[10px] text-[#666666]">
                  (Test any local video file for instant hardware compatibility)
                </span>
              </div>
              <label className="flex items-center gap-1.5 px-3 py-1 bg-[#1e3a5f] hover:bg-[#152843] text-white rounded-[2px] font-semibold text-xs cursor-pointer shadow-sm transition-colors shrink-0">
                <Upload className="w-3.5 h-3.5" />
                <span>Test Video File</span>
                <input
                  type="file"
                  accept={ACCEPTED_VIDEO_ACCEPT_STRING}
                  onChange={handleTestFileInput}
                  className="hidden"
                />
              </label>
            </div>

            {testedFile ? (
              <div className="mt-3 p-2.5 bg-[#f8f9fa] border border-[#d0d0d0] rounded-[3px] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 font-mono text-[11px]">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-black text-xs">{testedFile.fileName}</span>
                    <span className="px-1.5 py-0.2 bg-[#e0e0e0] text-black rounded text-[10px] font-bold">
                      {testedFile.extension.toUpperCase()}
                    </span>
                    <span className="text-[#666666] text-[10px] font-sans">({testedFile.sizeFormatted})</span>
                  </div>
                  <div className="text-[#444444] mt-1 font-sans text-xs">
                    {testedFile.formatInfo ? (
                      <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Accepted: {testedFile.formatInfo.name} ({testedFile.formatInfo.nativeBrowserSupport})
                      </span>
                    ) : (
                      <span className="text-amber-700 flex items-center gap-1">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Generic video file: Tracker will attempt hardware decoding.
                      </span>
                    )}
                  </div>
                </div>

                {onSelectVideoFile && (
                  <button
                    type="button"
                    onClick={handleLoadTestedIntoTracker}
                    className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[2px] font-sans font-bold text-xs shrink-0 transition-colors shadow-sm"
                  >
                    Open in Tracker Now
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-[11px] text-[#555555]">
                Select any video from your device to verify its container, codecs, and compatibility with Tracker’s 2D and stereo 3D kinematic engine.
              </p>
            )}
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-2.5 py-1 rounded-[3px] text-xs font-semibold whitespace-nowrap transition-colors border ${
                  selectedCategory === cat.id
                    ? 'bg-[#1e3a5f] text-white border-[#0f1d30]'
                    : 'bg-[#efefef] text-black border-[#808080] hover:bg-[#dcdcdc]'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Formats Table */}
          <div className="border border-[#808080] rounded-[3px] bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto max-h-[46vh]">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#e4e4e4] border-b border-[#808080] sticky top-0 z-10 font-bold text-[11px] text-black">
                  <tr>
                    <th className="py-2 px-3">Format / Container</th>
                    <th className="py-2 px-3">Extensions</th>
                    <th className="py-2 px-3">Supported Codecs</th>
                    <th className="py-2 px-3">Playback Status</th>
                    <th className="py-2 px-3">Physics Applications</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5] text-[11px]">
                  {filteredFormats.map((fmt) => (
                    <tr key={fmt.name} className="hover:bg-[#f9f9f9] transition-colors">
                      <td className="py-2.5 px-3 font-bold text-black align-top whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1e3a5f]" />
                          <span>{fmt.name}</span>
                        </div>
                        <span className="text-[10px] text-[#666666] font-normal block pl-3">
                          {fmt.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {fmt.extensions.map((ext) => (
                            <span
                              key={ext}
                              className="px-1.5 py-0.5 bg-[#f0f0f0] border border-[#d0d0d0] rounded font-mono text-[10px] text-black font-semibold"
                            >
                              {ext}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-[#333333] align-top">{fmt.codecs}</td>
                      <td className="py-2.5 px-3 align-top whitespace-nowrap">
                        {fmt.nativeBrowserSupport === 'Full Native' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold bg-emerald-50 border border-emerald-300 px-1.5 py-0.5 rounded-[2px] text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Hardware Accelerated
                          </span>
                        ) : fmt.nativeBrowserSupport === 'Supported (Chromium/Electron)' ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-semibold bg-blue-50 border border-blue-300 px-1.5 py-0.5 rounded-[2px] text-[10px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Direct Playback
                          </span>
                        ) : fmt.nativeBrowserSupport === 'Special Handling' ? (
                          <span className="inline-flex items-center gap-1 text-purple-700 font-semibold bg-purple-50 border border-purple-300 px-1.5 py-0.5 rounded-[2px] text-[10px]">
                            <Sparkles className="w-3 h-3" />
                            Frame Sequence
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-amber-700 font-semibold bg-amber-50 border border-amber-300 px-1.5 py-0.5 rounded-[2px] text-[10px]">
                            <Info className="w-3 h-3" />
                            Codec Dependent
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-[#444444] align-top">
                        <p>{fmt.typicalUsage}</p>
                        <p className="text-[10px] text-[#666666] mt-0.5 italic">{fmt.notes}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Defense & High-Speed Physics Camera Specifications */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px]">
            <div className="p-3 bg-white border border-[#808080] rounded-[3px]">
              <div className="flex items-center gap-1.5 font-bold text-black mb-1">
                <Camera className="w-4 h-4 text-[#1e3a5f]" />
                <span>Defense High-Speed Cameras</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[#444444]">
                <li>
                  <strong>Photron FASTCAM (SA-Z, Nova, Mini AX200):</strong> 10,000 to 2,100,000 fps. Export as <code>.MP4</code> or uncompressed <code>.AVI</code>. Tracker decouples physical sub-microsecond time (&Delta;t &le; 10 &mu;s) from container playback.
                </li>
                <li>
                  <strong>Vision Research Phantom (v2512, v2640):</strong> 25,000 to 1,000,000 fps. Directly import Cine-converted MP4/AVI files or .zip/.trz image sequence packages.
                </li>
                <li>
                  <strong>NAC & iX Cameras (Memrecam, i-SPEED):</strong> Standard ballistics range cameras up to 1,000,000 fps.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-white border border-[#808080] rounded-[3px]">
              <div className="flex items-center gap-1.5 font-bold text-black mb-1">
                <Sparkles className="w-4 h-4 text-[#1e3a5f]" />
                <span>Ballistics & Telemetry Metrics</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[#444444]">
                <li>
                  <strong>Mach Number:</strong> Real-time aerodynamic Mach calculation (M = v / 343 m/s) for supersonic flight analysis.
                </li>
                <li>
                  <strong>G-Force:</strong> High-G deceleration & impact telemetry (g = a / 9.80665). Capable of resolving over 100,000 g.
                </li>
                <li>
                  <strong>Slant Range, Azimuth & Elevation:</strong> Spherical trajectory metrics relative to range origin.
                </li>
              </ul>
            </div>

            <div className="p-3 bg-white border border-[#808080] rounded-[3px]">
              <div className="flex items-center gap-1.5 font-bold text-black mb-1">
                <Layers className="w-4 h-4 text-[#1e3a5f]" />
                <span>Stereo 3D Dual-Camera Tracking</span>
              </div>
              <ul className="list-disc list-inside space-y-1 text-[#444444]">
                <li>
                  <strong>Matching Frame Rates:</strong> Record both Camera 1 and Camera 2 at synchronized frame rates (e.g. 1,000 fps or 10,000 fps).
                </li>
                <li>
                  <strong>Format Independence:</strong> Cam 1 and Cam 2 can use different containers (e.g. MP4 and AVI). Tracker synchronizes both channels.
                </li>
                <li>
                  <strong>TRZ & ZIP Archives:</strong> Open Open Source Physics <code>.trz</code> archives directly; Tracker automatically extracts embedded video and calibration files.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#d4d0c8] border-t border-[#808080] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#444444]">
            Universal Input Engine: <strong>All video containers accepted</strong> (.mp4, .mov, .avi, .webm, .mkv, .mts, .wmv, .flv, .3gp, .gif, .trz, .trk, .zip)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black font-semibold text-xs rounded-[2px] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
