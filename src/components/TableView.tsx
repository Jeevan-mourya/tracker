import React, { useState } from 'react';
import { Track, PointStep } from '../types';
import { Copy, Download, Trash2, Check } from 'lucide-react';

interface TableViewProps {
  tracks: Track[];
  activeTrackId: string;
  currentFrame: number;
  onSelectFrame: (frame: number) => void;
  onDeletePoint: (frame: number) => void;
}

export const TableView: React.FC<TableViewProps> = ({
  tracks,
  activeTrackId,
  currentFrame,
  onSelectFrame,
  onDeletePoint,
}) => {
  const [copied, setCopied] = useState(false);
  const activeTrack = tracks.find((t) => t.id === activeTrackId) || tracks[0];
  const steps = activeTrack ? activeTrack.steps : [];

  const copyToClipboard = () => {
    if (steps.length === 0) return;
    const hasZ = steps.some((s) => s.z !== undefined);
    const headers = hasZ
      ? ['Frame', 't (s)', 'x (m)', 'y (m)', 'z (m)', 'vx (m/s)', 'vy (m/s)', 'vz (m/s)', 'v (m/s)', 'ax (m/s²)', 'ay (m/s²)', 'az (m/s²)', 'a (m/s²)', 'KE (J)', 'PE (J)']
      : ['Frame', 't (s)', 'x (m)', 'y (m)', 'vx (m/s)', 'vy (m/s)', 'v (m/s)', 'ax (m/s²)', 'ay (m/s²)', 'a (m/s²)', 'KE (J)', 'PE (J)'];

    const rows = steps.map((s) => {
      const base = [
        s.frame,
        s.time.toFixed(4),
        s.x.toFixed(4),
        s.y.toFixed(4),
      ];
      if (hasZ) {
        base.push((s.z ?? 0).toFixed(4));
      }
      base.push(
        s.vx?.toFixed(4) ?? '',
        s.vy?.toFixed(4) ?? ''
      );
      if (hasZ) {
        base.push(s.vz?.toFixed(4) ?? '');
      }
      base.push(
        s.v?.toFixed(4) ?? '',
        s.ax?.toFixed(4) ?? '',
        s.ay?.toFixed(4) ?? ''
      );
      if (hasZ) {
        base.push(s.az?.toFixed(4) ?? '');
      }
      base.push(
        s.a?.toFixed(4) ?? '',
        s.kineticEnergy?.toFixed(4) ?? '',
        s.potentialEnergy?.toFixed(4) ?? ''
      );
      return base.join('\t');
    });

    const tsv = [headers.join('\t'), ...rows].join('\n');
    navigator.clipboard.writeText(tsv);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const exportCSV = () => {
    if (steps.length === 0) return;
    const hasZ = steps.some((s) => s.z !== undefined);
    const headers = hasZ
      ? ['Frame', 't_s', 'x_m', 'y_m', 'z_m', 'vx_mps', 'vy_mps', 'vz_mps', 'v_mps', 'ax_mps2', 'ay_mps2', 'az_mps2', 'a_mps2', 'KE_J', 'PE_J']
      : ['Frame', 't_s', 'x_m', 'y_m', 'vx_mps', 'vy_mps', 'v_mps', 'ax_mps2', 'ay_mps2', 'a_mps2', 'KE_J', 'PE_J'];

    const rows = steps.map((s) => {
      const base = [
        s.frame,
        s.time.toFixed(5),
        s.x.toFixed(5),
        s.y.toFixed(5),
      ];
      if (hasZ) {
        base.push((s.z ?? 0).toFixed(5));
      }
      base.push(
        s.vx?.toFixed(5) ?? '',
        s.vy?.toFixed(5) ?? ''
      );
      if (hasZ) {
        base.push(s.vz?.toFixed(5) ?? '');
      }
      base.push(
        s.v?.toFixed(5) ?? '',
        s.ax?.toFixed(5) ?? '',
        s.ay?.toFixed(5) ?? ''
      );
      if (hasZ) {
        base.push(s.az?.toFixed(5) ?? '');
      }
      base.push(
        s.a?.toFixed(5) ?? '',
        s.kineticEnergy?.toFixed(5) ?? '',
        s.potentialEnergy?.toFixed(5) ?? ''
      );
      return base.join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${activeTrack?.name || 'tracker'}_data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasZ = steps.some((s) => s.z !== undefined);

  return (
    <div id="table-view-container" className="flex flex-col h-full bg-white text-xs">
      {/* Table Toolbar */}
      <div className="bg-[#d4d0c8] border-b border-[#808080] px-3 py-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-bold text-black">Data Table:</span>
          <span className="text-[11px] text-[#333333] font-mono font-medium">
            {steps.length} {steps.length === 1 ? 'row' : 'rows'}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            id="table-copy-tsv-btn"
            type="button"
            onClick={copyToClipboard}
            disabled={steps.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] disabled:opacity-40 text-black border border-[#808080] transition-colors text-[11px] font-medium"
            title="Copy TSV to clipboard for Excel / Google Sheets"
          >
            {copied ? <Check className="w-3 h-3 text-emerald-700" /> : <Copy className="w-3 h-3 text-black" />}
            <span>{copied ? 'Copied' : 'Copy TSV'}</span>
          </button>

          <button
            id="table-download-csv-btn"
            type="button"
            onClick={exportCSV}
            disabled={steps.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-[3px] bg-[#efefef] hover:bg-[#dcdcdc] disabled:opacity-40 text-black border border-[#808080] transition-colors text-[11px] font-medium"
            title="Export CSV file"
          >
            <Download className="w-3 h-3 text-black" />
            <span>CSV</span>
          </button>
        </div>
      </div>

      {/* Table Content with Fixed Header & Alternating Zebra Striping */}
      <div className="flex-1 overflow-auto bg-white">
        {steps.length > 0 ? (
          <table className="w-full text-left font-mono border-collapse text-[11px]">
            <thead className="bg-[#e0e0e0] sticky top-0 z-10 border-b border-[#808080] text-black font-bold select-none">
              <tr>
                <th className="py-1.5 px-2 text-center w-10 border-r border-[#808080]">F#</th>
                <th className="py-1.5 px-2 border-r border-[#808080]">t (s)</th>
                <th className="py-1.5 px-2 border-r border-[#808080]">x (m)</th>
                <th className="py-1.5 px-2 border-r border-[#808080]">y (m)</th>
                {hasZ && <th className="py-1.5 px-2 border-r border-[#808080]">z (m)</th>}
                <th className="py-1.5 px-2 border-r border-[#808080]">vx</th>
                <th className="py-1.5 px-2 border-r border-[#808080]">vy</th>
                {hasZ && <th className="py-1.5 px-2 border-r border-[#808080]">vz</th>}
                <th className="py-1.5 px-2 border-r border-[#808080]">v (m/s)</th>
                <th className="py-1.5 px-2 border-r border-[#808080]">ay</th>
                <th className="py-1.5 px-2 text-center w-8">Del</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#cccccc]">
              {steps.map((s, idx) => {
                const isActive = s.frame === currentFrame;
                return (
                  <tr
                    key={s.frame}
                    onClick={() => onSelectFrame(s.frame)}
                    className={`cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-[#1e3a5f] text-white font-bold'
                        : idx % 2 === 0
                        ? 'bg-white hover:bg-[#efefef] text-black'
                        : 'bg-[#f7f7f7] hover:bg-[#efefef] text-black'
                    }`}
                  >
                    <td className={`py-1 px-2 text-center border-r border-[#cccccc] font-semibold ${isActive ? 'text-white' : 'text-[#555555]'}`}>{s.frame}</td>
                    <td className="py-1 px-2 border-r border-[#cccccc]">{s.time.toFixed(3)}</td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-medium">{s.x.toFixed(3)}</td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-medium">{s.y.toFixed(3)}</td>
                    {hasZ && <td className="py-1 px-2 border-r border-[#cccccc] font-medium">{(s.z ?? 0).toFixed(3)}</td>}
                    <td className="py-1 px-2 border-r border-[#cccccc]">{s.vx !== null && s.vx !== undefined ? s.vx.toFixed(2) : '—'}</td>
                    <td className="py-1 px-2 border-r border-[#cccccc]">{s.vy !== null && s.vy !== undefined ? s.vy.toFixed(2) : '—'}</td>
                    {hasZ && <td className="py-1 px-2 border-r border-[#cccccc]">{s.vz !== null && s.vz !== undefined ? s.vz.toFixed(2) : '—'}</td>}
                    <td className="py-1 px-2 border-r border-[#cccccc] font-semibold">{s.v !== null && s.v !== undefined ? s.v.toFixed(2) : '—'}</td>
                    <td className="py-1 px-2 border-r border-[#cccccc] font-semibold">{s.ay !== null && s.ay !== undefined ? s.ay.toFixed(2) : '—'}</td>
                    <td className="py-1 px-2 text-center">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeletePoint(s.frame);
                        }}
                        className={`p-0.5 rounded transition-colors ${isActive ? 'text-white hover:text-red-300' : 'text-[#666666] hover:text-[#8b0000]'}`}
                        title="Delete step point"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-[#555555] text-xs p-4">
            <p className="font-semibold text-black">No data recorded for this track.</p>
            <p className="text-[11px] text-[#555555] mt-1">
              Click on video frames or press Shift+Click to record position steps.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
