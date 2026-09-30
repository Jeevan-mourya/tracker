import React, { useRef } from 'react';
import { SAMPLE_EXPERIMENTS } from '../data/samples';
import { SampleExperiment } from '../types';
import { FolderOpen, Download, Upload, HelpCircle, Activity, Video, Film, HardDrive, Shield, Keyboard, FileText } from 'lucide-react';
import { downloadUserManualPDF } from '../utils/downloadPdf';
import { ACCEPTED_VIDEO_ACCEPT_STRING } from '../utils/videoFormats';

import { FormatsModalTab } from './SupportedFormatsModal';

interface NavbarProps {
  currentExperimentId: string;
  currentExperimentTitle: string;
  onSelectExperiment: (exp: SampleExperiment) => void;
  onUploadVideo: (file: File) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onOpenPdfReport?: () => void;
  onOpenHelp: () => void;
  onOpenShortcuts?: () => void;
  onOpenFormatsModal?: (tab?: FormatsModalTab) => void;
  onOpenDownloadExe?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentExperimentId,
  currentExperimentTitle,
  onSelectExperiment,
  onUploadVideo,
  onExportJSON,
  onExportCSV,
  onOpenPdfReport,
  onOpenHelp,
  onOpenShortcuts,
  onOpenFormatsModal,
  onOpenDownloadExe,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUploadVideo(file);
      e.target.value = '';
    }
  };

  return (
    <header id="tracker-header" className="bg-[#d4d0c8] border-b border-[#808080] px-4 py-2 flex items-center justify-between z-20">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-7 h-7 rounded-[3px] bg-[#1e3a5f] text-white border border-[#0f1d30]">
          <Activity className="w-4 h-4" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight text-black">Tracker</h1>
            <span className="text-[10px] uppercase font-mono font-bold px-1.5 py-0.5 rounded-[2px] bg-[#e0e0e0] text-black border border-[#808080]">
              Video Analysis & Modeling
            </span>
          </div>
          <p className="text-[11px] text-[#333333] font-medium">Open Source Physics (OSP) Kinematics Suite</p>
        </div>
      </div>

      {/* Preset Experiments & Upload */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 bg-[#efefef] border border-[#808080] rounded-[3px] px-2.5 py-1 text-black h-[28px] w-[280px] max-w-[280px] shrink-0">
          <Video className="w-3.5 h-3.5 text-[#1e3a5f] shrink-0" />
          <span className="text-xs text-[#333333] font-semibold shrink-0">Exp:</span>
          <select
            id="experiment-selector"
            value={currentExperimentId}
            onChange={(e) => {
              const exp = SAMPLE_EXPERIMENTS.find((item) => item.id === e.target.value);
              if (exp) onSelectExperiment(exp);
            }}
            className="bg-transparent text-xs text-black font-bold focus:outline-none cursor-pointer flex-1 min-w-0 truncate pr-1"
            title={currentExperimentTitle || 'Select Experiment'}
          >
            {/* If the current experiment is custom, show it with a clean fixed label */}
            {!SAMPLE_EXPERIMENTS.find(e => e.id === currentExperimentId) && (
              <option value={currentExperimentId} className="bg-white text-black">
                {currentExperimentTitle ? `[Custom] ${currentExperimentTitle}` : '[Custom Video Analysis]'}
              </option>
            )}
            {SAMPLE_EXPERIMENTS.map((exp) => (
              <option key={exp.id} value={exp.id} className="bg-white text-black">
                {exp.title}
              </option>
            ))}
          </select>
        </div>

        {/* Upload Custom Video */}
        <button
          id="btn-upload-video"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] active:bg-[#c8c8c0] text-black text-xs font-semibold border border-[#808080] h-[28px] shrink-0 transition-colors"
          title="Open local video file for analysis (MP4, MOV, WebM, AVI, MKV, MTS, GIF, TRZ, etc.)"
        >
          <Upload className="w-3.5 h-3.5 text-black" />
          <span>Open Video</span>
        </button>

        {/* Accepted Video Formats List & Diagnostics Modal Trigger */}
        <button
          id="btn-video-formats"
          type="button"
          onClick={() => onOpenFormatsModal?.('catalog')}
          className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] active:bg-[#c8c8c0] text-[#1e3a5f] text-xs font-bold border border-[#808080] h-[28px] shrink-0 transition-colors cursor-pointer"
          title="View all 13+ accepted video formats, codecs, and run compatibility diagnostics"
        >
          <Film className="w-3.5 h-3.5" />
          <span>Formats</span>
        </button>

        {/* Air-Gapped & Defense Sector Security Console */}
        {onOpenDownloadExe && (
          <button
            id="btn-defense-security"
            type="button"
            onClick={onOpenDownloadExe}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] bg-[#1e3a5f] hover:bg-[#152843] active:bg-[#0f1d30] text-white text-xs font-bold border border-[#0f1d30] h-[28px] shrink-0 transition-colors shadow-xs cursor-pointer"
            title="View 100% Offline Air-Gapped Security & High-Speed Camera Calibration"
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Air-Gapped &amp; Defense</span>
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_VIDEO_ACCEPT_STRING}
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Actions: Export & Help */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-[3px] bg-[#efefef] border border-[#808080] p-0.5">
          <button
            id="btn-export-csv"
            type="button"
            onClick={onExportCSV}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-xs font-semibold text-black hover:bg-[#dcdcdc] transition-colors"
            title="Export kinematic data table as CSV"
          >
            <Download className="w-3 h-3 text-black" />
            <span>CSV</span>
          </button>
          <div className="w-[1px] h-3.5 bg-[#808080] mx-0.5" />
          <button
            id="btn-export-trk"
            type="button"
            onClick={onExportJSON}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-xs font-semibold text-black hover:bg-[#dcdcdc] transition-colors"
            title="Export full Tracker project file (.trk)"
          >
            <FolderOpen className="w-3 h-3 text-black" />
            <span>Project</span>
          </button>
          {onOpenPdfReport && (
            <>
              <div className="w-[1px] h-3.5 bg-[#808080] mx-0.5" />
              <button
                id="btn-export-pdf-report"
                type="button"
                onClick={onOpenPdfReport}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-xs font-bold text-[#1e3a5f] bg-[#e4e2dc] hover:bg-[#d8d4cc] transition-colors cursor-pointer"
                title="Generate &amp; Download complete Experiment Field Report in PDF format"
              >
                <FileText className="w-3 h-3 text-emerald-700" />
                <span>PDF Report</span>
              </button>
            </>
          )}
          <div className="w-[1px] h-3.5 bg-[#808080] mx-0.5" />
          <button
            id="btn-download-pdf-manual"
            type="button"
            onClick={downloadUserManualPDF}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-xs font-semibold text-black hover:bg-[#dcdcdc] transition-colors cursor-pointer"
            title="Download full User Manual as PDF"
          >
            <Download className="w-3 h-3 text-black" />
            <span>Manual (PDF)</span>
          </button>
        </div>

        {/* Keyboard Shortcuts Modal */}
        {onOpenShortcuts && (
          <button
            id="btn-shortcuts"
            type="button"
            onClick={onOpenShortcuts}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-[3px] text-black hover:bg-[#dcdcdc] active:bg-[#c8c8c0] bg-[#efefef] border border-[#808080] transition-colors text-xs font-semibold cursor-pointer h-[28px] shadow-xs"
            title="Overview of Keyboard Shortcuts (? or F1)"
          >
            <Keyboard className="w-3.5 h-3.5 text-[#1e3a5f]" />
            <span className="hidden sm:inline">Shortcuts</span>
            <kbd className="hidden md:inline px-1 py-0.2 bg-white border border-[#a0a0a0] rounded text-[9px] font-mono text-[#444444]">
              ?
            </kbd>
          </button>
        )}

        <button
          id="btn-help-guide"
          type="button"
          onClick={onOpenHelp}
          className="p-1.5 rounded-[3px] text-black hover:bg-[#dcdcdc] bg-[#efefef] border border-[#808080] transition-colors h-[28px] w-[28px] flex items-center justify-center cursor-pointer"
          title="User guide and physics instructions"
        >
          <HelpCircle className="w-4 h-4 text-black" />
        </button>
      </div>
    </header>
  );
};
