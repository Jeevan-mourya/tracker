import React, { useState } from 'react';
import {
  AlertTriangle,
  X,
  Copy,
  Check,
  Sliders,
  Terminal,
  ArrowRight,
  Info,
} from 'lucide-react';
import { VideoMetadataProbeResult } from '../utils/videoFormats';

interface FormatWarningToastProps {
  probeResult: VideoMetadataProbeResult | null;
  onDismiss: () => void;
  onOpenPrepTips: () => void;
}

export const FormatWarningToast: React.FC<FormatWarningToastProps> = ({
  probeResult,
  onDismiss,
  onOpenPrepTips,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!probeResult || probeResult.warningLevel === 'none') {
    return null;
  }

  const handleCopy = () => {
    if (probeResult.suggestedFfmpegCmd) {
      navigator.clipboard.writeText(probeResult.suggestedFfmpegCmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  const isError = probeResult.warningLevel === 'error';

  return (
    <aside
      aria-label="Video format warning"
      className="fixed bottom-4 right-4 z-50 max-w-md w-[calc(100vw-2rem)] bg-[#d4d0c8] border-2 border-[#808080] rounded-[4px] shadow-2xl p-3.5 text-black font-sans animate-in fade-in slide-in-from-bottom-3 duration-200"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 border-b border-[#808080] pb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1 rounded-[2px] ${isError ? 'bg-red-700 text-white' : 'bg-amber-600 text-white'}`}>
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <h4 className="font-bold text-xs leading-tight text-black">
              {probeResult.warningTitle || 'Format Warning: Codec Profile Detected'}
            </h4>
            <span className="text-[10px] text-[#555555]">
              Host OS codec limitation detected upon file probe
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-[2px] text-[#444444] hover:text-black hover:bg-[#c0bcb4] transition-colors cursor-pointer"
          title="Dismiss warning"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="pt-2.5 space-y-2 text-xs">
        {/* File and Detected Codec Badges */}
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
          <span className="font-bold bg-white border border-[#808080] px-1.5 py-0.5 rounded-[2px] text-black truncate max-w-[200px]" title={probeResult.fileName}>
            {probeResult.fileName}
          </span>
          <span className="bg-[#e5e5e5] border border-[#a0a0a0] px-1.5 py-0.5 rounded-[2px] text-black font-semibold">
            {probeResult.container}
          </span>
          <span className={`px-1.5 py-0.5 rounded-[2px] font-bold ${isError ? 'bg-red-100 text-red-900 border border-red-300' : 'bg-amber-100 text-amber-900 border border-amber-300'}`}>
            {probeResult.detectedCodec}
          </span>
        </div>

        {/* Warning Explanation */}
        <p className="text-[11px] text-[#222222] leading-snug">
          {probeResult.warningMessage ||
            "The browser's native decoding pipeline is limited by the host operating system's installed codecs and cannot decode this profile smoothly."}
        </p>

        {/* Recommended Conversion Profile */}
        <div className="p-2 bg-white border border-[#808080] rounded-[3px] space-y-1">
          <div className="flex items-center gap-1 text-[10px] font-bold text-purple-900">
            <Sliders className="w-3 h-3 text-purple-700" />
            <span>Optimal Conversion Profile for Physics Tracking:</span>
          </div>
          <div className="font-mono text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-1 rounded-[2px] border border-emerald-300">
            {probeResult.suggestedProfile}
          </div>
        </div>

        {/* 1-Click FFmpeg Command */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px]">
            <span className="font-bold text-[#444444] flex items-center gap-1">
              <Terminal className="w-3 h-3 text-[#1e3a5f]" />
              <span>1-Click FFmpeg Command:</span>
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] rounded font-sans font-semibold cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-emerald-700" />
                  <span className="text-emerald-700 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-black" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <pre className="bg-[#1e1e1e] text-emerald-400 p-2 rounded-[2px] font-mono text-[10px] overflow-x-auto select-all leading-tight">
            {probeResult.suggestedFfmpegCmd}
          </pre>
        </div>

        {/* Actions */}
        <div className="pt-1 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onOpenPrepTips}
            className="flex-1 px-2.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-[2px] font-bold text-[11px] transition-colors flex items-center justify-center gap-1 shadow-xs cursor-pointer"
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Video Preparation Tips</span>
            <ArrowRight className="w-3 h-3" />
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 bg-[#efefef] hover:bg-[#dcdcdc] border border-[#808080] text-black font-semibold text-[11px] rounded-[2px] transition-colors cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      </div>
    </aside>
  );
};
