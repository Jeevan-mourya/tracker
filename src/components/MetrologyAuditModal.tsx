import React, { useState, useMemo } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  X,
  Copy,
  Check,
  Download,
  Crosshair,
  Activity,
  Sliders,
  Award,
  Layers
} from 'lucide-react';
import { AnalysisErrorReport, MetrologyBudgetSource } from '../types';
import {
  buildMetrologyAuditBudget,
  formatCompactAbsoluteError
} from '../utils/metrologyErrorEngine';

export interface MetrologyAuditModalProps {
  isOpen: boolean;
  onClose: () => void;
  panel1Report: AnalysisErrorReport;
  panel2Report?: AnalysisErrorReport;
  initialPanel?: 'panel1' | 'panel2';
  onSelectFrame?: (frame: number) => void;
  trackName?: string;
  fps?: number;
}

export const MetrologyAuditModal: React.FC<MetrologyAuditModalProps> = ({
  isOpen,
  onClose,
  panel1Report,
  panel2Report,
  initialPanel = 'panel1',
  onSelectFrame,
  trackName = 'Active Track',
  fps = 60
}) => {
  const [selectedPanel, setSelectedPanel] = useState<'panel1' | 'panel2'>(initialPanel);
  const [copiedBudget, setCopiedBudget] = useState(false);

  React.useEffect(() => {
    if (isOpen) {
      setSelectedPanel(initialPanel);
    }
  }, [isOpen, initialPanel]);

  const activeReport = useMemo(() => {
    if (selectedPanel === 'panel2' && panel2Report) {
      return panel2Report;
    }
    return panel1Report;
  }, [selectedPanel, panel1Report, panel2Report]);

  const budgetRows: MetrologyBudgetSource[] = useMemo(() => {
    return buildMetrologyAuditBudget(activeReport);
  }, [activeReport]);

  if (!isOpen) return null;

  const gradeBadgeStyles =
    activeReport.metrologyGrade === 'A'
      ? 'bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]'
      : activeReport.metrologyGrade === 'B'
      ? 'bg-[#FEF3C7] text-[#B45309] border-[#FCD34D]'
      : 'bg-[#FEE2E2] text-[#B91C1C] border-[#FCA5A5]';

  const modeLabel =
    activeReport.mode === '3d_stereo' || activeReport.mode === '3D'
      ? '3D Stereo Photogrammetry (11-Param Normalized DLT)'
      : activeReport.mode === '6dof' || activeReport.mode === '6DOF'
      ? 'Monocular 6-DOF Rigid-Body & Store Separation (LM PnP / SE(3))'
      : '2D Single-Camera Optical Kinematics';

  const buildAuditTSV = (separator: '\t' | ',' = '\t') => {
    const q = (val: string) => (separator === ',' ? `"${val.replace(/"/g, '""')}"` : val);
    const lines: string[] = [
      `# RCC 253 / ITTC METROLOGICAL ERROR & RANGE SAFETY CERTIFICATION AUDIT`,
      `# Track: ${trackName} | Mode: ${modeLabel} | Rate: ${fps} Hz`,
      `# Channel: ${activeReport.channelLabel} (${activeReport.unit})`,
      `# Overall Analysis Accuracy: ${activeReport.overallAccuracyPct.toFixed(2)}%`,
      `# Span-Normalized RMS Error (NRMSE): ${activeReport.nrmsePct.toFixed(2)}% (${formatCompactAbsoluteError(
        activeReport.absoluteRMSE,
        activeReport.unit
      )})`,
      `# 95% Confidence Bound (2-Sigma): +/-${activeReport.p95ErrorPct.toFixed(2)}%`,
      `# Peak Instantaneous Error: ${activeReport.maxErrorPct.toFixed(2)}% @ Frame ${activeReport.worstFrameIndex}`,
      `# Mean Reprojection Residual: ${activeReport.meanReprojectionErrorPx.toFixed(3)} px`,
      `# Characteristic Reference Scale: ${activeReport.characteristicScale.toFixed(4)} ${activeReport.unit}`,
      `# Filter Noise Bandwidth Factor (eta_filt): ${activeReport.filterAttenuationFactor.toFixed(3)}`,
      `# Range Safety Metrology Grade: GRADE ${activeReport.metrologyGrade} (${activeReport.gradeDescription})`,
      ``,
      [
        q('Source Component'),
        q('Category'),
        q('Error Contribution (%)'),
        q('Share of Budget (%)'),
        q('Physical Residual'),
        q('Standard Reference & Mathematical Formulation')
      ].join(separator)
    ];

    for (const row of budgetRows) {
      lines.push(
        [
          q(row.name),
          q(row.category),
          row.errorPct.toFixed(3),
          row.sharePct.toFixed(1),
          q(row.physicalResidualLabel),
          q(row.description)
        ].join(separator)
      );
    }

    return lines.join('\n');
  };

  const handleCopyBudget = () => {
    const tsv = buildAuditTSV('\t');
    navigator.clipboard.writeText(tsv).then(() => {
      setCopiedBudget(true);
      setTimeout(() => setCopiedBudget(false), 1800);
    });
  };

  const handleExportAuditCSV = () => {
    const csv = buildAuditTSV(',');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeName = trackName.replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${safeName}_Metrology_Audit_Grade_${activeReport.metrologyGrade}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      id="metrology-audit-modal-backdrop"
      className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center p-4 select-none"
      onClick={onClose}
    >
      <div
        id="metrology-audit-modal"
        className="bg-[#F8FAFC] border border-[#181B20] shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden text-[#111827]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Dark Carbon Header (#181B20) */}
        <div className="bg-[#181B20] text-[#F9FAFB] px-4 py-2.5 flex items-center justify-between border-b border-[#2D333B]">
          <div className="flex items-center space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-[#38BDF8] shrink-0" />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-[12px] font-bold tracking-wider uppercase font-mono">
                  RANGE-SAFETY METROLOGICAL ERROR &amp; ACCURACY CERTIFICATION
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-[#2563EB] text-white font-semibold uppercase">
                  RCC 253 / ITTC
                </span>
              </div>
              <div className="text-[10px] text-[#9CA3AF] font-mono">
                Track: {trackName} &bull; Mode: {modeLabel} &bull; Sample Rate: {fps} Hz
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {panel2Report && (
              <div className="flex items-center bg-[#262B33] border border-[#374151] p-0.5">
                <button
                  type="button"
                  onClick={() => setSelectedPanel('panel1')}
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold uppercase transition-colors ${
                    selectedPanel === 'panel1'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#D1D5DB] hover:text-white'
                  }`}
                >
                  Panel 1: {panel1Report.channelLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPanel('panel2')}
                  className={`px-2 py-0.5 text-[10px] font-mono font-semibold uppercase transition-colors ${
                    selectedPanel === 'panel2'
                      ? 'bg-[#2563EB] text-white'
                      : 'text-[#D1D5DB] hover:text-white'
                  }`}
                >
                  Panel 2: {panel2Report.channelLabel}
                </button>
              </div>
            )}
            <button
              id="metrology-audit-close-btn"
              type="button"
              onClick={onClose}
              className="p-1 text-[#9CA3AF] hover:text-white hover:bg-[#2D333B] transition-colors"
              title="Close Metrology Audit (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Audit Body */}
        <div className="p-4 overflow-y-auto space-y-4">
          {/* Executive KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="bg-white border border-[#CBD5E1] p-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                <span>OVERALL ACCURACY</span>
                <Award className="w-3 h-3 text-[#2563EB]" />
              </div>
              <div
                id="audit-overall-accuracy"
                className="text-[18px] font-bold font-mono text-[#111827] mt-0.5"
              >
                {activeReport.overallAccuracyPct.toFixed(2)}%
              </div>
              <div className="text-[10px] font-mono text-[#475569]">
                100% &minus; NRMSE ({activeReport.sampleCount} pts)
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] p-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                <span>SPAN NRMSE (1&sigma;)</span>
                <Activity className="w-3 h-3 text-[#2563EB]" />
              </div>
              <div
                id="audit-nrmse-pct"
                className="text-[18px] font-bold font-mono text-[#111827] mt-0.5"
              >
                {activeReport.nrmsePct.toFixed(2)}%
              </div>
              <div className="text-[10px] font-mono text-[#475569] truncate">
                {activeReport.isParametric &&
                activeReport.xAbsoluteRMSE !== undefined &&
                activeReport.xUnit
                  ? `${formatCompactAbsoluteError(
                      activeReport.xAbsoluteRMSE,
                      activeReport.xUnit
                    )} X, ${formatCompactAbsoluteError(
                      activeReport.absoluteRMSE,
                      activeReport.unit
                    )} Y`
                  : formatCompactAbsoluteError(activeReport.absoluteRMSE, activeReport.unit)}
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] p-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                <span>95% CONFIDENCE (2&sigma;)</span>
                <Layers className="w-3 h-3 text-[#2563EB]" />
              </div>
              <div
                id="audit-p95-pct"
                className="text-[18px] font-bold font-mono text-[#111827] mt-0.5"
              >
                &plusmn;{activeReport.p95ErrorPct.toFixed(2)}%
              </div>
              <div className="text-[10px] font-mono text-[#475569]">
                P95 Envelope ({activeReport.channelLabel})
              </div>
            </div>

            <div className="bg-white border border-[#CBD5E1] p-2.5">
              <div className="text-[9px] font-bold uppercase tracking-wider text-[#64748B] flex items-center justify-between">
                <span>PEAK ERROR @ FRAME</span>
                <AlertTriangle className="w-3 h-3 text-[#D97706]" />
              </div>
              <div className="flex items-baseline justify-between mt-0.5">
                <span
                  id="audit-max-error-pct"
                  className="text-[18px] font-bold font-mono text-[#DC2626]"
                >
                  {activeReport.maxErrorPct.toFixed(2)}%
                </span>
                {onSelectFrame && (
                  <button
                    id="audit-jump-worst-frame-btn"
                    type="button"
                    onClick={() => {
                      onSelectFrame(activeReport.worstFrameIndex);
                      onClose();
                    }}
                    className="px-1.5 py-0.5 bg-[#EFF6FF] hover:bg-[#DBEAFE] text-[#1D4ED8] border border-[#93C5FD] text-[9px] font-mono font-bold uppercase flex items-center space-x-1"
                    title="Scrub video playhead to peak error frame"
                  >
                    <Crosshair className="w-2.5 h-2.5" />
                    <span>Fr #{activeReport.worstFrameIndex}</span>
                  </button>
                )}
              </div>
              <div className="text-[10px] font-mono text-[#475569]">
                Worst-case instantaneous residual
              </div>
            </div>

            <div className={`border p-2.5 ${gradeBadgeStyles}`}>
              <div className="text-[9px] font-bold uppercase tracking-wider flex items-center justify-between">
                <span>METROLOGY GRADE</span>
                <ShieldCheck className="w-3.5 h-3.5" />
              </div>
              <div id="audit-grade-badge" className="text-[18px] font-extrabold font-mono mt-0.5">
                GRADE {activeReport.metrologyGrade}
              </div>
              <div className="text-[10px] font-mono leading-tight">
                {activeReport.metrologyGrade === 'A'
                  ? 'NRMSE <= 0.50% (Certified)'
                  : activeReport.metrologyGrade === 'B'
                  ? 'NRMSE <= 2.00% (Engineering)'
                  : 'NRMSE > 2.00% (Recalibrate)'}
              </div>
            </div>
          </div>

          {/* Mathematical Formulation & Reference Parameters */}
          <div className="bg-white border border-[#CBD5E1] p-3 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[#334155]">
              <span>
                <strong className="text-[#0F172A]">Evaluated Channel:</strong>{' '}
                {activeReport.channelLabel} ({activeReport.unit})
              </span>
              <span>
                <strong className="text-[#0F172A]">Characteristic Scale (S_ref):</strong>{' '}
                {activeReport.characteristicScale.toFixed(4)} {activeReport.unit}
              </span>
              <span>
                <strong className="text-[#0F172A]">Mean Reproj Residual:</strong>{' '}
                {activeReport.meanReprojectionErrorPx.toFixed(3)} px
              </span>
              <span>
                <strong className="text-[#0F172A]">Filter Factor (&eta;_filt):</strong>{' '}
                <span className="inline-flex items-center px-1 bg-[#F1F5F9] border border-[#CBD5E1] text-[#0F172A]">
                  <Sliders className="w-2.5 h-2.5 mr-1 text-[#2563EB]" />
                  {activeReport.filterAttenuationFactor.toFixed(3)}
                </span>
              </span>
            </div>
            <div className="text-[10px] text-[#64748B]">
              Zero-Safe Formula: &epsilon;_i% = |&sigma;_i| / max(|y_i|, Span(y), L_ref) &times; 100%
            </div>
          </div>

          {/* Error Budget Breakdown Table */}
          <div className="bg-white border border-[#CBD5E1]">
            <div className="bg-[#F1F3F5] px-3 py-2 border-b border-[#CBD5E1] flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-wider text-[#1F2937] font-mono">
                UNCERTAINTY PROPAGATION &amp; ERROR BUDGET BREAKDOWN (RSS DECOMPOSITION)
              </div>
              <div className="flex items-center space-x-1.5">
                <button
                  id="audit-copy-tsv-btn"
                  type="button"
                  onClick={handleCopyBudget}
                  className="px-2 py-1 bg-white hover:bg-[#F8FAFC] text-[#1F2937] border border-[#CBD5E1] text-[10px] font-mono font-semibold flex items-center space-x-1 transition-colors"
                >
                  {copiedBudget ? (
                    <>
                      <Check className="w-3 h-3 text-[#16A34A]" />
                      <span className="text-[#16A34A]">COPIED TSV</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-[#475569]" />
                      <span>COPY BUDGET (TSV)</span>
                    </>
                  )}
                </button>
                <button
                  id="audit-export-csv-btn"
                  type="button"
                  onClick={handleExportAuditCSV}
                  className="px-2 py-1 bg-[#2563EB] hover:bg-[#1D4ED8] text-white border border-[#1E40AF] text-[10px] font-mono font-semibold flex items-center space-x-1 transition-colors"
                >
                  <Download className="w-3 h-3" />
                  <span>EXPORT AUDIT CSV</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[11px] font-mono">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-[#CBD5E1] text-[#475569] uppercase text-[10px]">
                    <th className="py-2 px-3 border-r border-[#E2E8F0]">Uncertainty Source</th>
                    <th className="py-2 px-2.5 border-r border-[#E2E8F0]">Category</th>
                    <th className="py-2 px-2.5 border-r border-[#E2E8F0] text-right">
                      Error Contrib (%)
                    </th>
                    <th className="py-2 px-3 border-r border-[#E2E8F0] w-40">
                      RSS Budget Share (%)
                    </th>
                    <th className="py-2 px-2.5 border-r border-[#E2E8F0]">Physical Residual</th>
                    <th className="py-2 px-3">Standard Reference &amp; Propagation Model</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E2E8F0]">
                  {budgetRows.map((row) => (
                    <tr key={row.id} className="hover:bg-[#F8FAFC]">
                      <td className="py-2 px-3 border-r border-[#E2E8F0] font-semibold text-[#0F172A]">
                        {row.name}
                      </td>
                      <td className="py-2 px-2.5 border-r border-[#E2E8F0]">
                        <span className="px-1.5 py-0.5 bg-[#F1F5F9] border border-[#CBD5E1] text-[9px] font-bold uppercase text-[#334155]">
                          {row.category}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 border-r border-[#E2E8F0] text-right font-bold text-[#111827]">
                        &plusmn;{row.errorPct.toFixed(3)}%
                      </td>
                      <td className="py-2 px-3 border-r border-[#E2E8F0]">
                        <div className="flex items-center space-x-2">
                          <div className="flex-1 h-2 bg-[#E2E8F0] overflow-hidden">
                            <div
                              className="h-full bg-[#2563EB]"
                              style={{
                                width: `${Math.min(100, Math.max(2, row.sharePct))}%`
                              }}
                            />
                          </div>
                          <span className="text-[10px] w-10 text-right text-[#334155]">
                            {row.sharePct.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-2 px-2.5 border-r border-[#E2E8F0] text-[#1E293B]">
                        {row.physicalResidualLabel}
                      </td>
                      <td className="py-2 px-3 text-[#475569] font-sans text-[11px]">
                        {row.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-Frame 2-Sigma Outlier Summary */}
          {(() => {
            const outlierFrames = activeReport.perFrame.filter((f) => f.isOutlier2Sigma);
            return (
              <div className="bg-white border border-[#CBD5E1] p-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2 text-[11px] font-mono">
                  <AlertTriangle
                    className={`w-4 h-4 ${
                      outlierFrames.length > 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                    }`}
                  />
                  <span className="font-bold text-[#0F172A]">
                    2&sigma; (95% Confidence) Exceedance Audit:
                  </span>
                  <span className="text-[#475569]">
                    {outlierFrames.length} of {activeReport.sampleCount} frames exceed &plusmn;
                    {activeReport.p95ErrorPct.toFixed(2)}% threshold
                  </span>
                </div>
                {outlierFrames.length > 0 && onSelectFrame && (
                  <div className="flex items-center flex-wrap gap-1">
                    <span className="text-[10px] font-mono text-[#64748B] mr-1">
                      Inspect Outliers:
                    </span>
                    {outlierFrames.slice(0, 8).map((f) => (
                      <button
                        key={f.frame}
                        type="button"
                        onClick={() => {
                          onSelectFrame(f.frame);
                          onClose();
                        }}
                        className="px-1.5 py-0.5 bg-[#FEF2F2] hover:bg-[#FEE2E2] text-[#DC2626] border border-[#FECACA] text-[10px] font-mono font-bold transition-colors"
                        title={`Frame ${f.frame}: Error ${f.errorPct.toFixed(2)}%`}
                      >
                        Fr {f.frame} ({f.errorPct.toFixed(2)}%)
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="bg-[#F1F3F5] px-4 py-2 border-t border-[#CBD5E1] flex items-center justify-between text-[10px] font-mono text-[#475569]">
          <span>
            Standard Compliance: RCC Document 253-93 &bull; ITTC 7.5-02-01-01 Uncertainty Analysis
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1 bg-[#181B20] hover:bg-[#2D333B] text-white font-semibold uppercase"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
