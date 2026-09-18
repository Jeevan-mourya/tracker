import React, { useRef } from 'react';
import { SAMPLE_EXPERIMENTS } from '../data/samples';
import { SampleExperiment } from '../types';
import { FolderOpen, Download, Upload, HelpCircle, Activity, Video } from 'lucide-react';
import { downloadUserManualPDF } from '../utils/downloadPdf';

interface NavbarProps {
  currentExperimentId: string;
  currentExperimentTitle: string;
  onSelectExperiment: (exp: SampleExperiment) => void;
  onUploadVideo: (file: File) => void;
  onExportJSON: () => void;
  onExportCSV: () => void;
  onOpenHelp: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentExperimentId,
  currentExperimentTitle,
  onSelectExperiment,
  onUploadVideo,
  onExportJSON,
  onExportCSV,
  onOpenHelp,
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
          title="Open local MP4, WebM, or MOV video file for analysis"
        >
          <Upload className="w-3.5 h-3.5 text-black" />
          <span>Open Video</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
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
          <div className="w-[1px] h-3.5 bg-[#808080] mx-0.5" />
          <button
            id="btn-download-pdf-manual"
            type="button"
            onClick={downloadUserManualPDF}
            className="flex items-center gap-1 px-2.5 py-1 rounded-[2px] text-xs font-semibold text-black hover:bg-[#dcdcdc] transition-colors"
            title="Download full User Manual as PDF"
          >
            <Download className="w-3 h-3 text-black" />
            <span>Manual (PDF)</span>
          </button>
        </div>

        <button
          id="btn-help-guide"
          type="button"
          onClick={onOpenHelp}
          className="p-1.5 rounded-[3px] text-black hover:bg-[#dcdcdc] bg-[#efefef] border border-[#808080] transition-colors"
          title="User guide and physics instructions"
        >
          <HelpCircle className="w-4 h-4 text-black" />
        </button>
      </div>
    </header>
  );
};
