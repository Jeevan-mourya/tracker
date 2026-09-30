import React, { useState, useEffect } from 'react';
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
  Copy,
  Check,
  Terminal,
  ExternalLink,
  Cpu,
  HardDrive,
  Wrench,
  HelpCircle,
  ArrowRight,
  Sliders,
  RotateCcw,
  Download,
  Shield,
} from 'lucide-react';
import {
  ACCEPTED_VIDEO_FORMATS,
  ACCEPTED_VIDEO_ACCEPT_STRING,
  inspectVideoFile,
  VideoInspectionResult,
  probeVideoMetadata,
  VideoMetadataProbeResult,
} from '../utils/videoFormats';

export type FormatsModalTab = 'catalog' | 'video-prep' | 'why-codecs' | 'converters' | 'electron-exe';

interface SupportedFormatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectVideoFile?: (file: File) => void;
  initialTab?: FormatsModalTab;
}

export const SupportedFormatsModal: React.FC<SupportedFormatsModalProps> = ({
  isOpen,
  onClose,
  onSelectVideoFile,
  initialTab = 'catalog',
}) => {
  const [activeTab, setActiveTab] = useState<FormatsModalTab>(initialTab);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [testedFile, setTestedFile] = useState<VideoInspectionResult | null>(null);
  const [testedProbe, setTestedProbe] = useState<VideoMetadataProbeResult | null>(null);
  const [rawTestedFile, setRawTestedFile] = useState<File | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((curr) => (curr === key ? null : curr));
    }, 2200);
  };

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

      probeVideoMetadata(file)
        .then((probeMeta) => {
          setTestedProbe(probeMeta);
        })
        .catch(() => {
          setTestedProbe(null);
        });
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
      <div className="bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] max-w-4xl w-full max-h-[94vh] flex flex-col text-black shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#d4d0c8] border-b border-[#808080] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1 rounded-[3px] bg-[#1e3a5f] text-white">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-black">Video Formats, Codecs & Preparation Station</h3>
              <p className="text-[11px] text-[#444444]">
                Kinematic video encoding rules, host OS codec limitations, command-line FFmpeg conversion recipes, and format diagnostics
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

        {/* Tab Navigation Bar */}
        <div className="flex items-center gap-1 px-4 pt-2 border-b border-[#808080] bg-[#e0ded8] shrink-0 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`px-3 py-1.5 text-xs font-bold rounded-t-[3px] border-t border-x transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'catalog'
                ? 'bg-[#d4d0c8] text-black border-[#808080] border-b-transparent -mb-[1px] shadow-xs'
                : 'bg-[#cfcbc2] text-[#444444] border-transparent hover:bg-[#d8d4cc]'
            }`}
          >
            <Film className="w-3.5 h-3.5 text-[#1e3a5f]" />
            <span>Format Catalog & Tester</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('video-prep')}
            className={`px-3 py-1.5 text-xs font-bold rounded-t-[3px] border-t border-x transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'video-prep'
                ? 'bg-[#d4d0c8] text-black border-[#808080] border-b-transparent -mb-[1px] shadow-xs'
                : 'bg-[#cfcbc2] text-[#444444] border-transparent hover:bg-[#d8d4cc]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5 text-purple-700" />
            <span className="font-bold">Video Preparation Tips (FFmpeg)</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('why-codecs')}
            className={`px-3 py-1.5 text-xs font-bold rounded-t-[3px] border-t border-x transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'why-codecs'
                ? 'bg-[#d4d0c8] text-black border-[#808080] border-b-transparent -mb-[1px] shadow-xs'
                : 'bg-[#cfcbc2] text-[#444444] border-transparent hover:bg-[#d8d4cc]'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
            <span>Why Codec Notices Occur</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('converters')}
            className={`px-3 py-1.5 text-xs font-bold rounded-t-[3px] border-t border-x transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'converters'
                ? 'bg-[#d4d0c8] text-black border-[#808080] border-b-transparent -mb-[1px] shadow-xs'
                : 'bg-[#cfcbc2] text-[#444444] border-transparent hover:bg-[#d8d4cc]'
            }`}
          >
            <Wrench className="w-3.5 h-3.5 text-emerald-800" />
            <span>Universal Converter Apps</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('electron-exe')}
            className={`px-3 py-1.5 text-xs font-bold rounded-t-[3px] border-t border-x transition-colors flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'electron-exe'
                ? 'bg-[#d4d0c8] text-black border-[#808080] border-b-transparent -mb-[1px] shadow-xs'
                : 'bg-[#cfcbc2] text-[#444444] border-transparent hover:bg-[#d8d4cc]'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-blue-800" />
            <span>Defense Cameras &amp; Air-Gapped Codecs</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs bg-[#d4d0c8]">
          {/* TAB 1: CATALOG & DIAGNOSTICS */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
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
                    <span>Test Local File</span>
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-black text-xs">{testedFile.fileName}</span>
                        <span className="px-1.5 py-0.2 bg-[#e0e0e0] text-black rounded text-[10px] font-bold">
                          {testedFile.extension.toUpperCase()}
                        </span>
                        <span className="text-[#666666] text-[10px] font-sans">({testedFile.sizeFormatted})</span>
                        {testedProbe?.detectedCodec && (
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${testedProbe.warningLevel === 'error' ? 'bg-red-100 text-red-900 border border-red-300' : testedProbe.warningLevel === 'warning' ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-emerald-100 text-emerald-900 border border-emerald-300'}`}>
                            Codec: {testedProbe.detectedCodec}
                          </span>
                        )}
                      </div>
                      <div className="text-[#444444] mt-1 font-sans text-xs">
                        {testedProbe && testedProbe.warningLevel !== 'none' ? (
                          <div className="text-amber-800 font-semibold flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>
                              {testedProbe.warningTitle}: {testedProbe.warningMessage}
                            </span>
                          </div>
                        ) : testedFile.formatInfo ? (
                          <span className="flex items-center gap-1 text-emerald-700 font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Accepted Format: {testedFile.formatInfo.name} ({testedFile.formatInfo.nativeBrowserSupport})
                          </span>
                        ) : (
                          <span className="text-amber-700 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Generic video file: Tracker will attempt hardware decoding.
                          </span>
                        )}

                        {testedProbe && testedProbe.warningLevel !== 'none' && (
                          <div className="mt-1 text-[11px] text-purple-900 font-sans">
                            <strong>Recommended Profile:</strong> {testedProbe.suggestedProfile}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 font-sans">
                      {onSelectVideoFile && (
                        <button
                          type="button"
                          onClick={handleLoadTestedIntoTracker}
                          className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[2px] font-bold text-xs transition-colors shadow-sm cursor-pointer"
                        >
                          Open in Tracker Now
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setActiveTab('video-prep')}
                        className="px-2.5 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded-[2px] font-semibold text-xs transition-colors cursor-pointer"
                      >
                        Prep Tips & FFmpeg &rarr;
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-[#555555]">
                    Select any video from your PC or camera to verify whether its container and codecs are supported natively or require a quick 1-click transcode.
                  </p>
                )}
              </div>

              {/* Callout to Video Preparation Tips */}
              <div className="bg-[#f5f2fb] border border-purple-300 rounded-[3px] p-2.5 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-purple-700 shrink-0" />
                  <div className="text-[11px] text-purple-950">
                    <span className="font-bold">Need to convert an incompatible video file or adjust framerate?</span>{' '}
                    <span>Use our standard FFmpeg command-line recipes with Constant Frame Rate (CFR) presets.</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('video-prep')}
                  className="px-3 py-1 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-[2px] shrink-0 transition-colors cursor-pointer shadow-xs"
                >
                  View Preparation Tips &rarr;
                </button>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-2.5 py-1 rounded-[3px] text-xs font-semibold whitespace-nowrap transition-colors border cursor-pointer ${
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
                <div className="overflow-x-auto max-h-[38vh]">
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
                          <td className="py-2 px-3 font-bold text-black align-top whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#1e3a5f]" />
                              <span>{fmt.name}</span>
                            </div>
                            <span className="text-[10px] text-[#666666] font-normal block pl-3">
                              {fmt.category}
                            </span>
                          </td>
                          <td className="py-2 px-3 align-top">
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
                          <td className="py-2 px-3 text-[#333333] align-top">{fmt.codecs}</td>
                          <td className="py-2 px-3 align-top whitespace-nowrap">
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
                          <td className="py-2 px-3 text-[#444444] align-top">
                            <p>{fmt.typicalUsage}</p>
                            <p className="text-[10px] text-[#666666] mt-0.5 italic">{fmt.notes}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* High-Speed Defense & Ballistics Notice */}
              <div className="p-3 bg-white border border-[#808080] rounded-[3px] flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Camera className="w-4 h-4 text-[#1e3a5f] shrink-0" />
                  <div>
                    <span className="font-bold text-black text-xs block">
                      Photron, Phantom & High-Speed Optical Sensors (1,000 to 2,000,000 fps)
                    </span>
                    <span className="text-[11px] text-[#555555]">
                      Export videos from high-speed camera software as MP4 (H.264) or uncompressed AVI. Tracker automatically decouples container frame rate from physical microsecond time.
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('video-prep')}
                  className="px-3 py-1 bg-[#efefef] hover:bg-[#dcdcdc] text-black border border-[#808080] rounded-[2px] text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  Conversion Recipes &rarr;
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: VIDEO PREPARATION TIPS (FFMPEG & HOST OS EXPLANATION) */}
          {activeTab === 'video-prep' && (
            <div className="space-y-4">
              {/* Host OS Architecture Explanation Callout */}
              <div className="bg-[#fbfbfb] border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-[#1e3a5f] font-bold text-sm border-b border-[#e0e0e0] pb-2">
                  <Cpu className="w-4 h-4 text-[#1e3a5f]" />
                  <span>Host Operating System Codec Limitation Explained</span>
                </div>

                <div className="text-xs text-[#222222] space-y-2.5 leading-relaxed">
                  <p>
                    <strong>Why does the browser say a video is unsupported even if other video player apps on your PC can open it?</strong>
                  </p>
                  <p className="text-[#333333]">
                    Web browsers (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari) and standard Electron desktop applications 
                    do not contain full internal software decoders for proprietary, legacy, or patent-restricted video codecs. Instead, 
                    <strong>the browser's native media playback capabilities are strictly limited by the host operating system's installed codecs and hardware media interfaces:</strong>
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 pt-1">
                    <div className="p-2.5 bg-white border border-[#d0d0d0] rounded-[3px]">
                      <div className="font-bold text-black text-[11px] mb-1">Windows Media Subsystem</div>
                      <p className="text-[10px] text-[#555555]">
                        Uses <strong>Microsoft Media Foundation (MF)</strong> and <strong>DirectX Video Acceleration (DXVA2/D3D11)</strong>. 
                        If Windows lacks the codec (such as HEVC without the Microsoft Store extension, or legacy Indeo/Cinepak AVIs), the browser cannot decode it.
                      </p>
                    </div>

                    <div className="p-2.5 bg-white border border-[#d0d0d0] rounded-[3px]">
                      <div className="font-bold text-black text-[11px] mb-1">macOS Media Subsystem</div>
                      <p className="text-[10px] text-[#555555]">
                        Uses <strong>Apple VideoToolbox / AVFoundation</strong>. Natively accelerates H.264, HEVC, and ProRes, but completely rejects legacy Windows AVI, WMV, and DivX streams.
                      </p>
                    </div>

                    <div className="p-2.5 bg-white border border-[#d0d0d0] rounded-[3px]">
                      <div className="font-bold text-black text-[11px] mb-1">Linux Media Subsystem</div>
                      <p className="text-[10px] text-[#555555]">
                        Uses <strong>VA-API / VDPAU / GStreamer</strong>. Relies on system-installed distribution codecs (e.g. <code>gstreamer-plugins-ugly</code>).
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-[#f0f7ff] border border-blue-300 rounded-[3px] text-[11px] text-blue-950 flex items-start gap-2">
                    <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
                    <span>
                      <strong>The Takeaway:</strong> While standalone players like VLC or original Tracker (Java Xuggle) bundle their own 50MB+ static software libraries to decode any 1990s video, modern web browsers depend directly on your host OS. Preparing your video with standard tools like <strong>FFmpeg</strong> ensures 100% universal hardware-accelerated playback across every browser, OS, and workstation.
                    </span>
                  </div>
                </div>
              </div>

              {/* 4 Golden Rules for Kinematic Video Preparation */}
              <div className="bg-white border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-2">
                  <div className="flex items-center gap-2 font-bold text-xs text-black">
                    <Sliders className="w-4 h-4 text-purple-700" />
                    <span>Four Golden Rules for Physics Tracking Video Preparation</span>
                  </div>
                  <span className="text-[10px] text-[#666666]">Essential for sub-pixel accuracy &amp; clean kinematics</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                  {/* Rule 1 */}
                  <div className="p-3 bg-[#fdfdfd] border border-[#d8d8d8] rounded-[3px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-black text-xs">1. Enforce Constant Frame Rate (CFR)</span>
                      <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                        Most Critical
                      </span>
                    </div>
                    <p className="text-[#444444] mb-1.5 leading-relaxed">
                      Smartphones (iPhones/Androids) record in <strong>Variable Frame Rate (VFR)</strong> by default to adapt to changing ambient light. In physics tracking, velocity ($v = \Delta x / \Delta t$) and acceleration ($a = \Delta v / \Delta t$) assume a strictly constant time delta $\Delta t$.
                    </p>
                    <code className="block bg-[#f0f0f0] p-1 rounded font-mono text-[10px] text-purple-900 font-bold">
                      Flag: -vsync cfr -r 30 (or your target fps)
                    </code>
                  </div>

                  {/* Rule 2 */}
                  <div className="p-3 bg-[#fdfdfd] border border-[#d8d8d8] rounded-[3px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-black text-xs">2. Universal 8-Bit Chroma (YUV 4:2:0)</span>
                      <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded text-[9px] font-bold">
                        Browser Standard
                      </span>
                    </div>
                    <p className="text-[#444444] mb-1.5 leading-relaxed">
                      High-end cameras and OBS Studio recordings often export in 10-bit color, 4:2:2, or 4:4:4 color spaces. Standard browser HTML5 pipelines cannot decode 4:2:2 H.264 natively, producing a black screen.
                    </p>
                    <code className="block bg-[#f0f0f0] p-1 rounded font-mono text-[10px] text-purple-900 font-bold">
                      Flag: -pix_fmt yuv420p
                    </code>
                  </div>

                  {/* Rule 3 */}
                  <div className="p-3 bg-[#fdfdfd] border border-[#d8d8d8] rounded-[3px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-black text-xs">3. Fast-Start Index Atom</span>
                      <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold">
                        Instant Seeking
                      </span>
                    </div>
                    <p className="text-[#444444] mb-1.5 leading-relaxed">
                      By default, MP4 containers write the index header (the <code>moov</code> atom) at the very end of the file. Moving it to the beginning allows Tracker to seek frame-by-frame with zero latency.
                    </p>
                    <code className="block bg-[#f0f0f0] p-1 rounded font-mono text-[10px] text-purple-900 font-bold">
                      Flag: -movflags +faststart
                    </code>
                  </div>

                  {/* Rule 4 */}
                  <div className="p-3 bg-[#fdfdfd] border border-[#d8d8d8] rounded-[3px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-black text-xs">4. Short Keyframe Cadence (GOP)</span>
                      <span className="px-1.5 py-0.2 bg-purple-100 text-purple-800 rounded text-[9px] font-bold">
                        Sub-Frame Scrubbing
                      </span>
                    </div>
                    <p className="text-[#444444] mb-1.5 leading-relaxed">
                      Standard web videos place keyframes (I-frames) only every 250 frames (approx. 8 seconds). Setting a short GOP (keyframe every 1 to 15 frames) makes stepping backward and forward instantaneous.
                    </p>
                    <code className="block bg-[#f0f0f0] p-1 rounded font-mono text-[10px] text-purple-900 font-bold">
                      Flag: -g 15 (or -g 1 for all-intra frames)
                    </code>
                  </div>
                </div>
              </div>

              {/* Ready-to-Use Command-Line Recipes (FFmpeg) */}
              <div className="bg-white border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3.5">
                <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="font-bold text-xs text-black">Standard Command-Line Recipes (FFmpeg)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href="https://ffmpeg.org/documentation.html"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-blue-700 hover:underline flex items-center gap-1 font-semibold"
                    >
                      <span>Official FFmpeg Docs</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {/* Recipe 1: Universal Golden Command */}
                <div className="space-y-1.5 p-3 bg-[#f8fafc] border border-blue-200 rounded-[3px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-black text-xs block">
                        Recipe 1: The Golden Universal Kinematics Command
                      </span>
                      <span className="text-[#555555] text-[10px]">
                        Converts ANY incompatible file (.avi, .mov, .wmv, .mts, .flv) into a 100% compliant physics MP4
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          'ffmpeg -i input.avi -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -vsync cfr -r 30 -movflags +faststart output.mp4',
                          'prep-recipe-1'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#1e3a5f] hover:bg-[#152843] text-white rounded font-sans font-semibold cursor-pointer shrink-0 transition-colors shadow-xs"
                    >
                      {copiedKey === 'prep-recipe-1' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-300" />
                          <span className="text-emerald-300">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-[#1e1e1e] text-emerald-400 p-2.5 rounded-[3px] font-mono text-[11px] overflow-x-auto select-all">
                    ffmpeg -i input.avi -c:v libx264 -crf 18 -preset fast -pix_fmt yuv420p -vsync cfr -r 30 -movflags +faststart output.mp4
                  </pre>
                  <p className="text-[10px] text-[#444444] pt-1">
                    <strong>Flags explained:</strong> <code>-c:v libx264</code> (universal H.264), <code>-crf 18</code> (visually lossless), <code>-pix_fmt yuv420p</code> (universal 8-bit color), <code>-vsync cfr -r 30</code> (strict constant 30.00 fps), <code>-movflags +faststart</code> (immediate zero-lag seeking).
                  </p>
                </div>

                {/* Recipe 2: Windows / Mac Batch Folder Script */}
                <div className="space-y-1.5 p-3 bg-[#f8fafc] border border-[#d0d0d0] rounded-[3px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-black text-xs block">
                        Recipe 2: Batch Convert an Entire Folder of Videos
                      </span>
                      <span className="text-[#555555] text-[10px]">
                        Convert dozens of laboratory video clips in one command
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          'for %i in (*.avi *.mov *.wmv *.mkv) do ffmpeg -i "%i" -c:v libx264 -crf 18 -pix_fmt yuv420p -vsync cfr -movflags +faststart "%~ni_prepared.mp4"',
                          'prep-recipe-2'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black rounded font-sans font-semibold cursor-pointer shrink-0 transition-colors"
                    >
                      {copiedKey === 'prep-recipe-2' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Windows Script</span>
                        </>
                      )}
                    </button>
                  </div>
                  <div className="space-y-1 text-[10px]">
                    <span className="font-bold text-[#333333]">Windows Command Prompt (cmd.exe):</span>
                    <pre className="bg-[#1e1e1e] text-blue-300 p-2 rounded-[3px] font-mono text-[11px] overflow-x-auto select-all">
                      for %i in (*.avi *.mov *.wmv *.mkv) do ffmpeg -i "%i" -c:v libx264 -crf 18 -pix_fmt yuv420p -vsync cfr -movflags +faststart "%~ni_prepared.mp4"
                    </pre>
                    <span className="font-bold text-[#333333] pt-1 block">macOS / Linux Terminal (bash / zsh):</span>
                    <pre className="bg-[#1e1e1e] text-blue-300 p-2 rounded-[3px] font-mono text-[11px] overflow-x-auto select-all">
                      {'for f in *.avi *.mov *.wmv *.mkv; do ffmpeg -i "$f" -c:v libx264 -crf 18 -pix_fmt yuv420p -vsync cfr -movflags +faststart "${f%.*}_prepared.mp4"; done'}
                    </pre>
                  </div>
                </div>

                {/* Recipe 3: High-Speed Cameras (Photron / Phantom) */}
                <div className="space-y-1.5 p-3 bg-[#f8fafc] border border-[#d0d0d0] rounded-[3px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-black text-xs block">
                        Recipe 3: High-Speed Science & Ballistics Cameras (Photron, Phantom Cine, NAC)
                      </span>
                      <span className="text-[#555555] text-[10px]">
                        Decouple ultra-high acquisition rate (e.g. 10,000 fps) into smooth 60 fps container playback
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          'ffmpeg -r 10000 -i raw_highspeed.avi -c:v libx264 -crf 17 -pix_fmt yuv420p -r 60 -movflags +faststart playback_10k.mp4',
                          'prep-recipe-3'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black rounded font-sans font-semibold cursor-pointer shrink-0 transition-colors"
                    >
                      {copiedKey === 'prep-recipe-3' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-[#1e1e1e] text-amber-300 p-2.5 rounded-[3px] font-mono text-[11px] overflow-x-auto select-all">
                    ffmpeg -r 10000 -i raw_highspeed.avi -c:v libx264 -crf 17 -pix_fmt yuv420p -r 60 -movflags +faststart playback_10k.mp4
                  </pre>
                  <p className="text-[10px] text-[#444444]">
                    Set <code>-r 10000</code> to match your camera sensor acquisition rate and <code>-r 60</code> for smooth screen playback. Tracker calculates physical microsecond kinematics (t = frame &times; 100 &mu;s).
                  </p>
                </div>

                {/* Recipe 4: Deinterlacing AVCHD / MTS Camcorder Footage */}
                <div className="space-y-1.5 p-3 bg-[#f8fafc] border border-[#d0d0d0] rounded-[3px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-black text-xs block">
                        Recipe 4: Deinterlace Camcorder Video (Eliminate Horizontal Comb Lines)
                      </span>
                      <span className="text-[#555555] text-[10px]">
                        Fixes 1080i interlaced video from Sony/Panasonic HD camcorders (MTS/M2TS/TS files)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          'ffmpeg -i interlaced.mts -vf "yadif=1" -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart progressive.mp4',
                          'prep-recipe-4'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black rounded font-sans font-semibold cursor-pointer shrink-0 transition-colors"
                    >
                      {copiedKey === 'prep-recipe-4' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-[#1e1e1e] text-purple-300 p-2.5 rounded-[3px] font-mono text-[11px] overflow-x-auto select-all">
                    ffmpeg -i interlaced.mts -vf "yadif=1" -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart progressive.mp4
                  </pre>
                  <p className="text-[10px] text-[#444444]">
                    The <code>yadif=1</code> filter doubles field rate into full progressive 60fps frames, ensuring projectile edges remain razor sharp for point mass tracking.
                  </p>
                </div>

                {/* Recipe 5: Trimming video to motion window */}
                <div className="space-y-1.5 p-3 bg-[#f8fafc] border border-[#d0d0d0] rounded-[3px]">
                  <div className="flex items-center justify-between text-[11px]">
                    <div>
                      <span className="font-bold text-black text-xs block">
                        Recipe 5: Trim Video to Exact Physics Motion Range (Skip Dead Lead Time)
                      </span>
                      <span className="text-[#555555] text-[10px]">
                        Save memory and speed up tracking by cutting directly from start to impact
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        handleCopy(
                          'ffmpeg -ss 00:00:01.500 -to 00:00:05.200 -i raw_video.mp4 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart motion_trimmed.mp4',
                          'prep-recipe-5'
                        )
                      }
                      className="flex items-center gap-1 text-[10px] px-2 py-1 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black rounded font-sans font-semibold cursor-pointer shrink-0 transition-colors"
                    >
                      {copiedKey === 'prep-recipe-5' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-700" />
                          <span className="text-emerald-700 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy Command</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="bg-[#1e1e1e] text-sky-300 p-2.5 rounded-[3px] font-mono text-[11px] overflow-x-auto select-all">
                    ffmpeg -ss 00:00:01.500 -to 00:00:05.200 -i raw_video.mp4 -c:v libx264 -crf 18 -pix_fmt yuv420p -movflags +faststart motion_trimmed.mp4
                  </pre>
                </div>
              </div>

              {/* Free Graphical Tools Alternative */}
              <div className="p-3 bg-white border border-[#808080] rounded-[3px] flex items-center justify-between gap-3">
                <div>
                  <span className="font-bold text-black text-xs block">Prefer a Graphical Interface (No Command Line)?</span>
                  <span className="text-[11px] text-[#555555]">
                    You can use <strong>HandBrake</strong> or <strong>Shutter Encoder</strong> for simple drag-and-drop batch conversions with built-in CFR presets.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTab('converters')}
                  className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded-[2px] font-semibold text-xs whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  View Converter Apps &rarr;
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: WHY CODEC NOTICES OCCUR & ORIGINAL TRACKER VS .EXE */}
          {activeTab === 'why-codecs' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-amber-800 font-bold text-sm border-b border-[#e0e0e0] pb-2">
                  <AlertCircle className="w-4 h-4" />
                  <span>Why Did You Receive "Codec Notice: Not Supported"?</span>
                </div>

                <div className="text-xs text-[#222222] space-y-2.5 leading-relaxed">
                  <p>
                    When you try to open video files from your local PC and receive the message{' '}
                    <strong>"The video stream could not be decoded... specific file uses a proprietary or legacy codec unsupported by hardware decoding"</strong>,
                    this is happening because of a fundamental architectural difference between <strong>Original Tracker (Java)</strong> and <strong>Modern Web/Electron applications (.exe)</strong>:
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                    {/* Original Tracker */}
                    <div className="p-3 bg-[#fdfaf5] border border-amber-300 rounded-[3px]">
                      <div className="flex items-center gap-1.5 font-bold text-amber-950 mb-1.5 text-xs">
                        <Cpu className="w-3.5 h-3.5 text-amber-700" />
                        <span>Original Tracker (Java / Xuggle Architecture)</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-amber-900">
                        <li>
                          <strong>Full FFmpeg C-Libraries Bundled:</strong> Original Tracker was built with <em>Xuggle</em> and <em>Java Media Framework (JMF)</em>, statically linking a massive 50MB+ GPL FFmpeg software decoder binary directly inside Java.
                        </li>
                        <li>
                          <strong>Decodes Obsolete 1990s Formats:</strong> It could decode archaic proprietary codecs like <em>Intel Indeo (IV32/IV41/IV50)</em>, <em>Cinepak (cvid)</em>, <em>Sorenson Spark (FLV1)</em>, and legacy uncompressed AVIs by doing 100% software CPU decoding.
                        </li>
                        <li>
                          <strong>Limitations:</strong> Slow on high-resolution 4K video, no modern GPU hardware acceleration, and causes high CPU heating.
                        </li>
                      </ul>
                    </div>

                    {/* This Application & .EXE */}
                    <div className="p-3 bg-[#f0f7ff] border border-blue-300 rounded-[3px]">
                      <div className="flex items-center gap-1.5 font-bold text-blue-950 mb-1.5 text-xs">
                        <HardDrive className="w-3.5 h-3.5 text-blue-700" />
                        <span>This Workstation & Electron .EXE (Chromium Pipeline)</span>
                      </div>
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-blue-900">
                        <li>
                          <strong>Hardware Accelerated GPU Pipeline:</strong> Uses Chromium's HTML5 video engine (`media::Pipeline` with DXVA2 / Direct3D11 / NVDEC) for sub-pixel 60fps tracking without dropped frames.
                        </li>
                        <li>
                          <strong>Patent Licensing Restrictions:</strong> Standard Chromium and standard Electron `.exe` builds deliberately exclude proprietary or abandoned codecs (Indeo, Cinepak, MPEG-2, Sorenson, Dolby AC3) to comply with international patent laws.
                        </li>
                        <li>
                          <strong>Result:</strong> If an `.avi` or `.mov` contains an archaic 1990s Indeo codec, Chromium throws `MEDIA_ERR_SRC_NOT_SUPPORTED` because no hardware GPU decoder exists for Indeo on modern Windows/Mac.
                        </li>
                      </ul>
                    </div>
                  </div>

                  {/* Container vs Codec clarification */}
                  <div className="p-3 bg-[#f5f5f5] border border-[#d0d0d0] rounded-[3px]">
                    <span className="font-bold text-xs text-black block mb-1">
                      Important Concept: Container (.avi / .mov) vs. Codec (Compression Format)
                    </span>
                    <p className="text-[11px] text-[#444444]">
                      A file extension like <code>.avi</code> or <code>.mov</code> is merely a "container box". An AVI file could hold modern <strong>H.264</strong> (which plays instantly with full hardware acceleration), OR it could hold 25-year-old <strong>Intel Indeo 4.1</strong> (which modern browsers cannot decode).
                      Tracker accepts the container, but alerts you when the inner codec is unsupported.
                    </p>
                  </div>
                </div>
              </div>

              {/* What Should You Do? */}
              <div className="p-4 bg-white border border-[#808080] rounded-[3px] shadow-sm">
                <h4 className="font-bold text-xs text-black mb-2">Two Direct Solutions:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 border border-purple-300 bg-purple-50 rounded-[3px]">
                    <span className="font-bold text-xs text-purple-950 block mb-1">
                      Solution A: Convert Video with FFmpeg or HandBrake
                    </span>
                    <p className="text-[11px] text-purple-900 mb-2">
                      Use standard command-line <strong>FFmpeg</strong> or graphical <strong>HandBrake</strong> to batch transcode your files to standard <strong>MP4 (H.264 / AAC)</strong> with Constant Frame Rate (CFR).
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('video-prep')}
                      className="px-3 py-1 bg-purple-800 hover:bg-purple-900 text-white rounded-[2px] font-semibold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>View Preparation Tips & FFmpeg Recipes</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="p-3 border border-blue-300 bg-blue-50 rounded-[3px]">
                    <span className="font-bold text-xs text-blue-950 block mb-1">
                      Solution B: Enable All Codecs in Your Installed .EXE
                    </span>
                    <p className="text-[11px] text-blue-900 mb-2">
                      You can drop a community-compiled <strong>ffmpeg.dll</strong> into the application folder of the installed Windows `.exe` to unlock 100% native playback for all formats without conversion!
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('electron-exe')}
                      className="px-3 py-1 bg-blue-800 hover:bg-blue-900 text-white rounded-[2px] font-semibold text-xs transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Windows .EXE Setup Guide</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: UNIVERSAL CONVERTER APPLICATIONS */}
          {activeTab === 'converters' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-2">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-emerald-800" />
                    <span className="font-bold text-xs text-black">Applications That Accept & Convert Every Video File Without Issues</span>
                  </div>
                  <span className="text-[10px] text-[#666666]">100% Free & Open-Source Tools</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Tool 1: HandBrake */}
                  <div className="p-3 bg-[#fcfcfc] border border-[#cccccc] rounded-[3px] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-black">1. HandBrake</span>
                        <span className="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold">
                          Best for Batches
                        </span>
                      </div>
                      <p className="text-[11px] text-[#444444] mb-2">
                        The world standard free video transcoder. Converts entire folders of legacy AVIs, MOVs, and camera files into modern MP4.
                      </p>
                      <div className="bg-[#f0f0f0] p-2 rounded text-[10px] space-y-1 text-[#333333]">
                        <div>&bull; <strong>Preset:</strong> "Fast 1080p30" or "Production Standard"</div>
                        <div>&bull; <strong>Framerate:</strong> Constant Framerate (CFR)</div>
                        <div>&bull; <strong>Format:</strong> MP4 (H.264)</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-[#e0e0e0] flex items-center justify-between text-[11px]">
                      <span className="text-[#666666] font-mono">handbrake.fr</span>
                      <span className="font-semibold text-emerald-700">Windows / Mac / Linux</span>
                    </div>
                  </div>

                  {/* Tool 2: Shutter Encoder */}
                  <div className="p-3 bg-[#fcfcfc] border border-[#cccccc] rounded-[3px] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-black">2. Shutter Encoder</span>
                        <span className="px-1.5 py-0.2 bg-blue-100 text-blue-800 rounded text-[9px] font-bold">
                          Best for Labs
                        </span>
                      </div>
                      <p className="text-[11px] text-[#444444] mb-2">
                        Designed specifically for video editors, scientific laboratories, and high-speed camera files (Photron Cine, Phantom RAW).
                      </p>
                      <div className="bg-[#f0f0f0] p-2 rounded text-[10px] space-y-1 text-[#333333]">
                        <div>&bull; <strong>Function:</strong> H.264 or Apple ProRes</div>
                        <div>&bull; <strong>Container:</strong> .mp4</div>
                        <div>&bull; Preserves raw high-speed timestamps</div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-[#e0e0e0] flex items-center justify-between text-[11px]">
                      <span className="text-[#666666] font-mono">shutterencoder.com</span>
                      <span className="font-semibold text-blue-700">Windows / Mac</span>
                    </div>
                  </div>

                  {/* Tool 3: VLC Media Player */}
                  <div className="p-3 bg-[#fcfcfc] border border-[#cccccc] rounded-[3px] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-black">3. VLC Media Player</span>
                        <span className="px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded text-[9px] font-bold">
                          Already on PC
                        </span>
                      </div>
                      <p className="text-[11px] text-[#444444] mb-2">
                        Most computers already have VLC installed. VLC can transcode any video file without downloading new software.
                      </p>
                      <div className="bg-[#f0f0f0] p-2 rounded text-[10px] space-y-1 text-[#333333]">
                        <div>&bull; Press <strong>Ctrl+R</strong> (Media &gt; Convert/Save)</div>
                        <div>&bull; Add your file and click Convert</div>
                        <div>&bull; Profile: <code>Video - H.264 + MP3 (MP4)</code></div>
                      </div>
                    </div>
                    <div className="mt-3 pt-2 border-t border-[#e0e0e0] flex items-center justify-between text-[11px]">
                      <span className="text-[#666666] font-mono">videolan.org</span>
                      <span className="font-semibold text-amber-700">Universal</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* FFmpeg 1-Click Terminal Commands Link */}
              <div className="bg-white border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-2">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#1e3a5f]" />
                    <span className="font-bold text-xs text-black">Need Detailed Command-Line Flags?</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('video-prep')}
                    className="text-xs text-purple-700 hover:text-purple-900 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>Go to Video Preparation Tips</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-[11px] text-[#444444]">
                  Check the <strong>Video Preparation Tips</strong> tab for specialized recipes including high-speed camera timestamps (1,000 to 100,000 fps), deinterlacing AVCHD (.mts) footage, and lossless motion trimming.
                </p>
              </div>
            </div>
          )}

          {/* TAB 5: UNLOCK ALL CODECS IN INSTALLED WINDOWS .EXE */}
          {activeTab === 'electron-exe' && (
            <div className="space-y-4">
              <div className="bg-white border border-[#808080] rounded-[3px] p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-blue-800" />
                    <span className="font-bold text-xs text-black">
                      How to Enable 100% Universal Codecs in Your Installed Desktop .EXE
                    </span>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-300 rounded text-[10px] font-bold">
                    For Windows PC Installation
                  </span>
                </div>

                <div className="text-xs text-[#222222] space-y-2.5 leading-relaxed">
                  {/* Air-Gapped Defense Guarantee Badge */}
                  <div className="p-3 bg-emerald-50 border-2 border-emerald-600 rounded-[3px] flex items-start gap-2.5 shadow-xs">
                    <Shield className="w-4 h-4 text-emerald-800 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-xs text-emerald-950 block">
                        Air-Gapped Defense Workstation &bull; 100% Offline Operation
                      </span>
                      <p className="text-[11px] text-emerald-900 mt-0.5">
                        Operating strictly within local memory. Zero internet access, zero cloud telemetry, zero external network sockets. Calibrated for Photron, Phantom, NAC, and iX high-speed defense cameras.
                      </p>
                    </div>
                  </div>

                  <p>
                    When running on an offline defense PC or range workstation, this Tracker application supports modular video processing with local media codecs and raw uncompressed frame sequences.
                  </p>

                  <div className="p-3 bg-[#f8f9fa] border border-[#d0d0d0] rounded-[3px] space-y-2">
                    <span className="font-bold text-xs text-black block">
                      The 2-Minute Solution: Replace `ffmpeg.dll` with Community Wide-Codec Build
                    </span>
                    <p className="text-[11px] text-[#444444]">
                      By default, Electron packages a royalty-free <code>ffmpeg.dll</code> to avoid patent royalties. You can replace this single file in your application folder with the full community build to make your installed desktop app accept <strong>every single video format and legacy codec natively</strong> without needing to convert anything!
                    </p>

                    <div className="space-y-2 pt-2">
                      <div className="flex items-start gap-2 text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center font-bold shrink-0 text-[10px]">
                          1
                        </span>
                        <div>
                          <strong>Download the wide-codec `ffmpeg.dll`:</strong>
                          <p className="text-[#555555]">
                            Download the pre-compiled full-codec <code>ffmpeg.dll</code> for Electron from the open-source community releases (e.g. <code>castLabs electron-releases</code> or <code>electron-builder</code> custom ffmpeg mirrors matching Electron v44).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center font-bold shrink-0 text-[10px]">
                          2
                        </span>
                        <div>
                          <strong>Open Your Installed App Directory:</strong>
                          <p className="text-[#555555]">
                            On Windows, open File Explorer to your installation path:
                          </p>
                          <pre className="bg-[#f0f0f0] p-1.5 rounded font-mono text-[10px] text-black mt-1 select-all">
                            %LOCALAPPDATA%\Programs\tracker-video-analysis\
                          </pre>
                          <p className="text-[#555555] mt-0.5">
                            (or <code>dist-electron\win-unpacked\</code> if you built the portable executable).
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-[#1e3a5f] text-white flex items-center justify-center font-bold shrink-0 text-[10px]">
                          3
                        </span>
                        <div>
                          <strong>Swap the DLL:</strong>
                          <p className="text-[#555555]">
                            Copy and overwrite the existing <code>ffmpeg.dll</code> with the downloaded wide-codec version.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-[11px]">
                        <span className="w-5 h-5 rounded-full bg-emerald-700 text-white flex items-center justify-center font-bold shrink-0 text-[10px]">
                          4
                        </span>
                        <div>
                          <strong>Relaunch Tracker Video Analysis:</strong>
                          <p className="text-[#555555]">
                            Launch the application. You can now drag and drop legacy AVIs, Indeo files, Sorenson MOVs, and proprietary video containers directly into the workstation without any codec warnings!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Windows HEVC Hardware Extension */}
                  <div className="p-3 bg-white border border-[#cccccc] rounded-[3px]">
                    <div className="flex items-center gap-1.5 font-bold text-black mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      <span>Windows 10/11 HEVC & H.265 Hardware Extension</span>
                    </div>
                    <p className="text-[11px] text-[#444444]">
                      If your camera records in <strong>4K HEVC (H.265)</strong>, Microsoft requires the <strong>"HEVC Video Extensions"</strong> from the Microsoft Store. Once installed on Windows, Tracker's Electron `.exe` will automatically use your NVIDIA / AMD / Intel GPU hardware decoder to play H.265 at 4K 60fps with zero CPU lag.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#d4d0c8] border-t border-[#808080] flex items-center justify-between shrink-0">
          <span className="text-[11px] text-[#444444]">
            {activeTab === 'catalog' && (
              <>Universal Input Engine: <strong>All video containers accepted</strong> (.mp4, .mov, .avi, .webm, .mkv, .mts, .wmv, .flv, .3gp, .gif, .trz, .zip)</>
            )}
            {activeTab === 'video-prep' && (
              <>Browser decoding is limited by host OS codecs; use standard FFmpeg with <code>-vsync cfr</code> and <code>-pix_fmt yuv420p</code></>
            )}
            {activeTab === 'why-codecs' && (
              <>Legacy codecs (Indeo / Cinepak) require transcode or wide-codec ffmpeg.dll swap</>
            )}
            {activeTab === 'converters' && (
              <>Recommended converters: HandBrake, Shutter Encoder, VLC, and FFmpeg CLI</>
            )}
            {activeTab === 'electron-exe' && (
              <>Replace <code>ffmpeg.dll</code> in app directory for 100% native codec support in Windows .exe</>
            )}
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
