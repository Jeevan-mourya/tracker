import React, { useState } from 'react';
import { AlertCircle, Copy, Check, Upload, Terminal, FileWarning } from 'lucide-react';
import { CodecDiagnosticNotice } from '../video/unifiedFrameSource';
import { FormatsModalTab } from './SupportedFormatsModal';

interface CodecDiagnosticCardProps {
  diagnostic: CodecDiagnosticNotice;
  slotLabel?: string;
  compact?: boolean;
  onSelectAnotherFile?: () => void;
  onOpenFormatsModal?: (tab?: FormatsModalTab) => void;
  onDismiss?: () => void;
}

export const CodecDiagnosticCard: React.FC<CodecDiagnosticCardProps> = ({
  diagnostic,
  slotLabel,
  compact = false,
  onSelectAnotherFile,
  onOpenFormatsModal,
  onDismiss,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCommand = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(diagnostic.ffmpegCommand).catch(() => {});
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div
      className={`absolute inset-0 z-30 bg-[#181B20]/96 text-[#E2E8F0] flex flex-col items-center justify-center ${
        compact ? 'p-3' : 'p-6'
      } select-text overflow-y-auto`}
    >
      <div
        className={`w-full ${
          compact ? 'max-w-md' : 'max-w-xl'
        } bg-[#1E222A] border border-[#334155] rounded-[2px] shadow-2xl overflow-hidden text-left`}
      >
        {/* Header Bar */}
        <div className="bg-[#111318] border-b border-[#334155] px-3 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-[#F59E0B] shrink-0" />
            <span className="font-mono text-[11px] font-bold tracking-wider uppercase text-[#F8FAFC] truncate">
              {slotLabel ? `${slotLabel} · ` : ''}UNSUPPORTED BROWSER CODEC DIAGNOSTIC
            </span>
          </div>
          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#262B36] border border-[#475569] text-[#F59E0B] font-bold shrink-0">
            {diagnostic.container} / {diagnostic.codecFourCC}
          </span>
        </div>

        {/* Body */}
        <div className={`${compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3'}`}>
          {/* Detected Container & Codec Specs Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
            <div className="bg-[#14171D] border border-[#2A2E37] px-2 py-1">
              <div className="text-[#94A3B8] text-[9px] uppercase">File</div>
              <div className="text-[#F8FAFC] font-semibold truncate" title={diagnostic.fileName}>
                {diagnostic.fileName}
              </div>
            </div>
            <div className="bg-[#14171D] border border-[#2A2E37] px-2 py-1">
              <div className="text-[#94A3B8] text-[9px] uppercase">Container</div>
              <div className="text-[#60A5FA] font-bold">{diagnostic.container}</div>
            </div>
            <div className="bg-[#14171D] border border-[#2A2E37] px-2 py-1">
              <div className="text-[#94A3B8] text-[9px] uppercase">FourCC / Codec</div>
              <div className="text-[#F59E0B] font-bold">{diagnostic.codecFourCC}</div>
            </div>
            <div className="bg-[#14171D] border border-[#2A2E37] px-2 py-1">
              <div className="text-[#94A3B8] text-[9px] uppercase">Stream Header</div>
              <div className="text-[#CBD5E1] font-semibold tabular-nums">
                {diagnostic.width && diagnostic.height
                  ? `${diagnostic.width}×${diagnostic.height}`
                  : 'N/A'}
                {diagnostic.fps ? ` @ ${diagnostic.fps}fps` : ''}
              </div>
            </div>
          </div>

          {/* Range-Safety Honesty Explanation */}
          <div className="flex items-start gap-2 text-[11px] text-[#CBD5E1] leading-relaxed bg-[#14171D] border-l-2 border-[#F59E0B] px-2.5 py-2">
            <FileWarning className="w-3.5 h-3.5 text-[#F59E0B] shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-[#F1F5F9] font-medium">{diagnostic.reason}</p>
              <p className="text-[10.5px] text-[#94A3B8]">{diagnostic.electronHint}</p>
            </div>
          </div>

          {/* Copyable FFmpeg All-Intra Command */}
          <div className="bg-[#0F1217] border border-[#334155] rounded-[2px] p-2.5">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-[#94A3B8] uppercase">
                <Terminal className="w-3 h-3 text-[#60A5FA]" />
                <span>Range-Safety All-Intra H.264 FFmpeg Command</span>
              </span>
              <button
                type="button"
                onClick={handleCopyCommand}
                className="flex items-center gap-1 px-2 py-0.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-mono text-[10px] font-semibold rounded-[2px] transition-colors cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3 h-3" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy FFmpeg Command</span>
                  </>
                )}
              </button>
            </div>
            <code className="block font-mono text-[10.5px] text-[#34D399] break-all select-all leading-snug">
              {diagnostic.ffmpegCommand}
            </code>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {onSelectAnotherFile && (
                <button
                  type="button"
                  onClick={onSelectAnotherFile}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[11px] font-semibold rounded-[2px] transition-colors cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>Load Another File</span>
                </button>
              )}
              {onOpenFormatsModal && (
                <button
                  type="button"
                  onClick={() => onOpenFormatsModal('video-prep')}
                  className="px-2.5 py-1 bg-[#262B36] hover:bg-[#334155] border border-[#475569] text-[#E2E8F0] text-[11px] font-semibold rounded-[2px] transition-colors cursor-pointer"
                >
                  Codec &amp; FFmpeg Guide
                </button>
              )}
            </div>
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-2 py-1 text-[10.5px] font-mono text-[#94A3B8] hover:text-white cursor-pointer"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
